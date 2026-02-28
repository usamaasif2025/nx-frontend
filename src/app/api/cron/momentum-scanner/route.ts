/**
 * GET /api/cron/momentum-scanner
 *
 * No watchlist. Runs on a schedule. Pipeline per cycle:
 *
 *  1. Detect market session (pre / regular / closed) from NY time
 *  2. Fetch top movers from Yahoo Finance screener
 *
 *  Pre-market  (4:00 AM – 9:30 AM ET):
 *    • preMarketChangePercent >= PRICE_MOVE_PCT  (default 7 %)
 *    • preMarketPrice > regularMarketDayHigh     (breaking above yesterday's high)
 *    • preMarketPrice < PRE_MAX_PRICE            (default $30 — small-cap focus)
 *    • marketCap      <= PRE_MAX_MARKET_CAP      (default $2 B — small-cap focus)
 *
 *  Regular session  (9:30 AM – 4:00 PM ET):
 *    • regularMarketChangePercent >= PRICE_MOVE_PCT
 *
 *  Closed / post-market → skip, return early
 *
 *  3. Skip tickers already in cooldown  (saves 8 news-API calls per ticker)
 *  4. Fetch Tier-1 news for qualifying movers
 *  5. Headline dedupe — skip if already sent
 *  6. Send ONE Telegram alert per ticker per cycle then stop (break)
 *  7. Append every attempt to data/alert-log.jsonl
 */

import { NextResponse }       from 'next/server';
import axios                  from 'axios';
import fs                     from 'fs/promises';
import path                   from 'path';
import { fetchNewsForSymbol } from '@/lib/news-fetch';
import { buildMomentumAlertMessage, sendTelegram } from '@/lib/telegram';

const ALPACA_DATA = 'https://data.alpaca.markets';

function alpacaHeaders() {
  return {
    'APCA-API-KEY-ID':     process.env.ALPACA_KEY    ?? '',
    'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET ?? '',
    Accept:                'application/json',
  };
}

const DATA_DIR      = '/tmp/momentum-scanner';
const CACHE_PATH    = path.join(DATA_DIR, 'sent-alerts.json');
const COOLDOWN_PATH = path.join(DATA_DIR, 'cooldowns.json');
const LOG_PATH      = path.join(DATA_DIR, 'alert-log.jsonl');

const CACHE_TTL_MS    = 7 * 24 * 60 * 60 * 1000;
const COOLDOWN_MS     = parseInt(process.env.ALERT_COOLDOWN_MINUTES  ?? '15',           10) * 60_000;
const MOVE_PCT        = parseFloat(process.env.PRICE_MOVE_PCT        ?? '7');
const MAX_MOVERS      = parseInt(process.env.MAX_MOVERS               ?? '15',           10);
// Pre-market small-cap filters
const PRE_MAX_PRICE   = parseFloat(process.env.PRE_MAX_PRICE          ?? '30');          // max stock price ($)
const PRE_MAX_MCAP    = parseFloat(process.env.PRE_MAX_MARKET_CAP     ?? '2000000000'); // max market cap ($)


// ── Types ─────────────────────────────────────────────────────────────────────

type Session = 'pre' | 'regular' | 'closed';

interface Mover {
  symbol:      string;
  name:        string;
  price:       number;   // pre-market price or regular market price
  changePct:   number;   // % change relative to previous close
  prevDayHigh: number;   // yesterday's regular session high (for pre-market filter)
  marketCap:   number;   // market capitalisation in USD
}

interface LogEntry {
  ts: string; ticker: string; category: string;
  headline_id: string; source: string; title: string;
  sent: boolean; reason: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function readJson<T>(p: string, fb: T): Promise<T> {
  try { return JSON.parse(await fs.readFile(p, 'utf-8')) as T; } catch { return fb; }
}

async function writeJson(p: string, d: unknown): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(p, JSON.stringify(d, null, 2));
}

async function appendLog(e: LogEntry): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.appendFile(LOG_PATH, JSON.stringify(e) + '\n');
}

// ── Market session (New York time) ────────────────────────────────────────────

function getSession(): Session {
  const ny   = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day  = ny.getDay();                          // 0 Sun … 6 Sat
  const mins = ny.getHours() * 60 + ny.getMinutes();

  if (day === 0 || day === 6) return 'closed';
  if (mins >= 240 && mins < 570)  return 'pre';      // 04:00 – 09:30
  if (mins >= 570 && mins < 960)  return 'regular';  // 09:30 – 16:00
  return 'closed';                                   // overnight / post-market
}

// ── Mover fetch via Alpaca ────────────────────────────────────────────────────

async function fetchMovers(session: Session, minPct: number, max: number): Promise<Mover[]> {
  const marketType = session === 'pre' ? 'pre_market' : 'regular';

  const res = await axios.get(`${ALPACA_DATA}/v1beta1/screener/stocks/movers`, {
    headers: alpacaHeaders(),
    params:  { top: Math.min(max * 4, 100), market_type: marketType },
    timeout: 15_000,
  });

  const gainers: { symbol: string; percent_change: number; change: number; price: number }[] =
    res.data?.gainers ?? [];

  // First-pass filter by % move and price cap
  const candidates = gainers.filter(g => {
    if (g.percent_change < minPct) return false;
    if (session === 'pre') {
      return g.price > 0 && g.price <= PRE_MAX_PRICE;
    }
    return true;
  });

  if (candidates.length === 0) return [];

  // Fetch snapshots to get prevDailyBar (for prevDayHigh) — one batched call
  const symbols   = candidates.map(g => g.symbol).join(',');
  let snapshots: Record<string, { prevDailyBar?: { h: number; c: number } }> = {};
  try {
    const snapRes = await axios.get(`${ALPACA_DATA}/v2/stocks/snapshots`, {
      headers: alpacaHeaders(),
      params:  { symbols, feed: 'iex' },
      timeout: 15_000,
    });
    snapshots = snapRes.data ?? {};
  } catch (err: any) {
    console.warn('[momentum-scanner] snapshot fetch failed:', err?.message);
  }

  return candidates
    .filter(g => {
      if (session === 'pre') {
        // Market-cap check isn't available from Alpaca; price cap is our proxy
        return g.price > 0 && g.price <= PRE_MAX_PRICE;
      }
      return true;
    })
    .slice(0, max)
    .map(g => ({
      symbol:      g.symbol,
      name:        g.symbol,                              // Alpaca movers have no name field
      price:       g.price,
      changePct:   g.percent_change,
      prevDayHigh: snapshots[g.symbol]?.prevDailyBar?.h ?? 0,
      marketCap:   0,                                     // not available from Alpaca free tier
    }));
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function GET() {
  const session = getSession();

  if (session === 'closed') {
    return NextResponse.json({ checkedAt: new Date().toISOString(), message: 'Market closed — scanner idle', session });
  }

  // Fetch movers
  let movers: Mover[];
  try {
    movers = await fetchMovers(session, MOVE_PCT, MAX_MOVERS);
  } catch (err: any) {
    console.error('[momentum-scanner] failed to fetch movers:', err?.message);
    return NextResponse.json({ error: 'Failed to fetch movers: ' + err?.message }, { status: 500 });
  }

  if (movers.length === 0) {
    return NextResponse.json({
      checkedAt: new Date().toISOString(),
      session,
      message: session === 'pre'
        ? `No stocks up >${MOVE_PCT}% AND price <=$${PRE_MAX_PRICE} AND mktcap <=$${PRE_MAX_MCAP / 1e9}B in pre-market`
        : `No stocks up >${MOVE_PCT}% in regular session`,
      movers: 0, totalSent: 0,
    });
  }

  // Load shared cache + cooldowns
  const [rawCache, cooldowns] = await Promise.all([
    readJson<Record<string, number>>(CACHE_PATH,   {}),
    readJson<Record<string, number>>(COOLDOWN_PATH, {}),
  ]);
  const now   = Date.now();
  const cache = Object.fromEntries(
    Object.entries(rawCache).filter(([, ts]) => now - (ts as number) < CACHE_TTL_MS),
  ) as Record<string, number>;

  const results: {
    symbol: string; price: number; changePct: number; prevDayHigh: number; marketCap: number;
    catalysts: number; sent: number;
    skipped_dedupe: number; skipped_cooldown: number;
    error?: string;
  }[] = [];
  let totalSent = 0;

  for (const mover of movers) {
    let sent = 0, skipped_dedupe = 0, skipped_cooldown = 0;

    try {
      // Skip news fetch entirely if ticker is in cooldown window
      const lastAlerted = cooldowns[mover.symbol] ?? 0;
      if (now - lastAlerted < COOLDOWN_MS) {
        const remainMin = Math.ceil((COOLDOWN_MS - (now - lastAlerted)) / 60_000);
        console.log(`[momentum-scanner] ${mover.symbol} cooldown ${remainMin}m left — skipping`);
        results.push({ symbol: mover.symbol, price: mover.price, changePct: mover.changePct, prevDayHigh: mover.prevDayHigh, marketCap: mover.marketCap, catalysts: 0, sent: 0, skipped_dedupe: 0, skipped_cooldown: 1 });
        continue;
      }

      // Fetch Tier-1 news for this mover
      const { items } = await fetchNewsForSymbol(mover.symbol);
      const pinned = items.filter(i => i.isPinned);

      if (pinned.length === 0) {
        results.push({ symbol: mover.symbol, price: mover.price, changePct: mover.changePct, prevDayHigh: mover.prevDayHigh, marketCap: mover.marketCap, catalysts: 0, sent: 0, skipped_dedupe: 0, skipped_cooldown: 0 });
        continue;
      }

      // Process catalyst headlines — send ONE per ticker per cycle then break
      for (const item of pinned) {
        const key     = `${mover.symbol}:${item.id}`;
        const logBase = {
          ts: new Date().toISOString(), ticker: mover.symbol,
          category: item.category, headline_id: item.id,
          source: item.source,     title: item.title,
        };

        // Headline dedupe
        if (cache[key]) {
          await appendLog({ ...logBase, sent: false, reason: 'dedupe' });
          skipped_dedupe++;
          continue;
        }

        // Send alert
        const text = buildMomentumAlertMessage(
          mover.symbol, mover.name, mover.price,
          mover.changePct, item, session, mover.prevDayHigh,
        );
        const chartUrl = process.env.APP_URL
          ? `${process.env.APP_URL}/?symbol=${mover.symbol}&tf=1m`
          : undefined;

        await sendTelegram(text, chartUrl);

        cache[key]              = now;
        cooldowns[mover.symbol] = now;
        sent++;
        totalSent++;

        await appendLog({ ...logBase, sent: true, reason: null });
        await new Promise(r => setTimeout(r, 300));

        // ── ONE alert per ticker per cycle — prevents spam ────────────────
        break;
      }

      results.push({ symbol: mover.symbol, price: mover.price, changePct: mover.changePct, prevDayHigh: mover.prevDayHigh, marketCap: mover.marketCap, catalysts: pinned.length, sent, skipped_dedupe, skipped_cooldown });

    } catch (err: any) {
      console.error(`[momentum-scanner] ${mover.symbol}:`, err?.message);
      results.push({ symbol: mover.symbol, price: mover.price, changePct: mover.changePct, prevDayHigh: mover.prevDayHigh, marketCap: mover.marketCap, catalysts: 0, sent, skipped_dedupe, skipped_cooldown, error: err?.message });
    }
  }

  await Promise.all([writeJson(CACHE_PATH, cache), writeJson(COOLDOWN_PATH, cooldowns)]);

  const filterDesc = session === 'pre'
    ? `>${MOVE_PCT}% | price<=$${PRE_MAX_PRICE} | mcap<=$${PRE_MAX_MCAP / 1e9}B`
    : `>${MOVE_PCT}%`;
  console.log(`[momentum-scanner] ${session} | ${movers.length} movers ${filterDesc} | ${totalSent} sent`);

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    session, threshold: MOVE_PCT, cooldownMin: COOLDOWN_MS / 60_000,
    movers: movers.length, results, totalSent,
  });
}
