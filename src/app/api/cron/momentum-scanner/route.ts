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
 *
 *  Regular session  (9:30 AM – 4:00 PM ET):
 *    • regularMarketChangePercent >= PRICE_MOVE_PCT
 *
 *  Closed / post-market → skip, return early
 *
 *  3. Skip tickers already in cooldown  (saves 7 news-API calls per ticker)
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

const DATA_DIR      = path.join(process.cwd(), 'data');
const CACHE_PATH    = path.join(DATA_DIR, 'sent-alerts.json');
const COOLDOWN_PATH = path.join(DATA_DIR, 'cooldowns.json');
const LOG_PATH      = path.join(DATA_DIR, 'alert-log.jsonl');

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const COOLDOWN_MS  = parseInt(process.env.ALERT_COOLDOWN_MINUTES ?? '15', 10) * 60_000;
const MOVE_PCT     = parseFloat(process.env.PRICE_MOVE_PCT ?? '7');
const MAX_MOVERS   = parseInt(process.env.MAX_MOVERS ?? '15', 10);

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
};

// ── Types ─────────────────────────────────────────────────────────────────────

type Session = 'pre' | 'regular' | 'closed';

interface Mover {
  symbol:      string;
  name:        string;
  price:       number;   // pre-market price or regular market price
  changePct:   number;   // % change relative to previous close
  prevDayHigh: number;   // yesterday's regular session high (for pre-market filter)
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

// ── Mover fetch ───────────────────────────────────────────────────────────────

async function fetchMovers(session: Session, minPct: number, max: number): Promise<Mover[]> {
  // most_actives surfaces pre-market volume leaders; day_gainers for regular
  const scrId = session === 'pre' ? 'most_actives' : 'day_gainers';

  const res = await axios.get(
    'https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved',
    { params: { count: 100, scrIds: scrId, start: 0 }, headers: HEADERS, timeout: 12_000 },
  );

  const quotes: any[] = res.data?.finance?.result?.[0]?.quotes ?? [];

  const filtered = quotes.filter(q => {
    if (session === 'pre') {
      const pct      = q.preMarketChangePercent ?? 0;
      const prePrice = q.preMarketPrice         ?? 0;
      const prevHigh = q.regularMarketDayHigh   ?? 0;
      // Must clear both hurdles: big % move AND price breaking above yesterday's high
      return pct >= minPct && prevHigh > 0 && prePrice > prevHigh;
    }
    // Regular session: straightforward % filter
    return (q.regularMarketChangePercent ?? 0) >= minPct;
  });

  return filtered.slice(0, max).map(q => ({
    symbol:      q.symbol,
    name:        q.shortName ?? q.longName ?? q.symbol,
    price:       session === 'pre'
                   ? (q.preMarketPrice        ?? 0)
                   : (q.regularMarketPrice    ?? 0),
    changePct:   session === 'pre'
                   ? (q.preMarketChangePercent     ?? 0)
                   : (q.regularMarketChangePercent ?? 0),
    prevDayHigh: q.regularMarketDayHigh ?? 0,
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
        ? `No stocks up >${MOVE_PCT}% AND above yesterday's high in pre-market`
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
    symbol: string; changePct: number; prevDayHigh: number;
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
        results.push({ symbol: mover.symbol, changePct: mover.changePct, prevDayHigh: mover.prevDayHigh, catalysts: 0, sent: 0, skipped_dedupe: 0, skipped_cooldown: 1 });
        continue;
      }

      // Fetch Tier-1 news for this mover
      const { items } = await fetchNewsForSymbol(mover.symbol);
      const pinned = items.filter(i => i.isPinned);

      if (pinned.length === 0) {
        results.push({ symbol: mover.symbol, changePct: mover.changePct, prevDayHigh: mover.prevDayHigh, catalysts: 0, sent: 0, skipped_dedupe: 0, skipped_cooldown: 0 });
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

      results.push({ symbol: mover.symbol, changePct: mover.changePct, prevDayHigh: mover.prevDayHigh, catalysts: pinned.length, sent, skipped_dedupe, skipped_cooldown });

    } catch (err: any) {
      console.error(`[momentum-scanner] ${mover.symbol}:`, err?.message);
      results.push({ symbol: mover.symbol, changePct: mover.changePct, prevDayHigh: mover.prevDayHigh, catalysts: 0, sent, skipped_dedupe, skipped_cooldown, error: err?.message });
    }
  }

  await Promise.all([writeJson(CACHE_PATH, cache), writeJson(COOLDOWN_PATH, cooldowns)]);

  console.log(`[momentum-scanner] ${session} | ${movers.length} movers >${MOVE_PCT}% | ${totalSent} sent`);

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    session, threshold: MOVE_PCT, cooldownMin: COOLDOWN_MS / 60_000,
    movers: movers.length, results, totalSent,
  });
}
