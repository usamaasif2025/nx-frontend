/**
 * GET /api/cron/momentum-scanner
 *
 * No watchlist needed. Pipeline:
 *   1. Fetch today's top gainers from Yahoo Finance
 *   2. Filter to stocks moving >= PRICE_MOVE_PCT % (default 7%)
 *   3. Skip tickers already in cooldown (avoids redundant news fetches)
 *   4. Fetch Tier-1 news for each remaining mover
 *   5. Skip headlines already sent (dedupe)
 *   6. Send Telegram alert (momentum-style message with % move)
 *   7. Append every attempt to data/alert-log.jsonl
 */

import { NextResponse }       from 'next/server';
import axios                  from 'axios';
import fs                     from 'fs/promises';
import path                   from 'path';
import { fetchNewsForSymbol } from '@/lib/news-fetch';
import { buildMomentumAlertMessage, sendTelegram } from '@/lib/telegram';

const DATA_DIR       = path.join(process.cwd(), 'data');
const CACHE_PATH     = path.join(DATA_DIR, 'sent-alerts.json');
const COOLDOWN_PATH  = path.join(DATA_DIR, 'cooldowns.json');
const LOG_PATH       = path.join(DATA_DIR, 'alert-log.jsonl');

const CACHE_TTL_MS  = 7 * 24 * 60 * 60 * 1000;
const COOLDOWN_MS   = parseInt(process.env.ALERT_COOLDOWN_MINUTES ?? '15', 10) * 60_000;
const MOVE_PCT      = parseFloat(process.env.PRICE_MOVE_PCT ?? '7');
const MAX_MOVERS    = parseInt(process.env.MAX_MOVERS ?? '15', 10);

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface Mover {
  symbol:    string;
  name:      string;
  price:     number;
  changePct: number;
}

interface LogEntry {
  ts:          string;
  ticker:      string;
  category:    string;
  headline_id: string;
  source:      string;
  title:       string;
  sent:        boolean;
  reason:      string | null;
}

// ── File helpers ──────────────────────────────────────────────────────────────

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try { return JSON.parse(await fs.readFile(filePath, 'utf-8')) as T; }
  catch { return fallback; }
}

async function writeJson(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

async function appendLog(entry: LogEntry): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.appendFile(LOG_PATH, JSON.stringify(entry) + '\n');
}

// ── Gainers fetch ─────────────────────────────────────────────────────────────

async function fetchMovers(minPct: number, max: number): Promise<Mover[]> {
  const res = await axios.get(
    'https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved',
    {
      params:  { count: 50, scrIds: 'day_gainers', start: 0 },
      headers: HEADERS,
      timeout: 12_000,
    },
  );

  const quotes: any[] = res.data?.finance?.result?.[0]?.quotes ?? [];

  return quotes
    .filter(q => (q.regularMarketChangePercent ?? 0) >= minPct)
    .slice(0, max)
    .map(q => ({
      symbol:    q.symbol,
      name:      q.shortName ?? q.longName ?? q.symbol,
      price:     q.regularMarketPrice ?? 0,
      changePct: q.regularMarketChangePercent ?? 0,
    }));
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function GET() {
  // 1. Get movers
  let movers: Mover[];
  try {
    movers = await fetchMovers(MOVE_PCT, MAX_MOVERS);
  } catch (err: any) {
    console.error('[momentum-scanner] failed to fetch movers:', err?.message);
    return NextResponse.json({ error: 'Failed to fetch movers: ' + err?.message }, { status: 500 });
  }

  if (movers.length === 0) {
    return NextResponse.json({
      checkedAt: new Date().toISOString(),
      message:   `No stocks moving >${MOVE_PCT}% found (market may be closed)`,
      movers:    0,
      totalSent: 0,
    });
  }

  // 2. Load shared cache + cooldowns
  const [rawCache, cooldowns] = await Promise.all([
    readJson<Record<string, number>>(CACHE_PATH,   {}),
    readJson<Record<string, number>>(COOLDOWN_PATH, {}),
  ]);

  const now = Date.now();
  const cache: Record<string, number> = Object.fromEntries(
    Object.entries(rawCache).filter(([, ts]) => now - ts < CACHE_TTL_MS),
  );

  const results: {
    symbol: string; changePct: number; catalysts: number;
    sent: number; skipped_dedupe: number; skipped_cooldown: number;
    error?: string;
  }[] = [];

  let totalSent = 0;

  for (const mover of movers) {
    let sent = 0, skipped_dedupe = 0, skipped_cooldown = 0;

    try {
      // 3. Skip news fetch entirely if ticker is already in cooldown
      const lastAlerted = cooldowns[mover.symbol] ?? 0;
      if (now - lastAlerted < COOLDOWN_MS) {
        const remainMin = Math.ceil((COOLDOWN_MS - (now - lastAlerted)) / 60_000);
        results.push({ symbol: mover.symbol, changePct: mover.changePct, catalysts: 0, sent: 0, skipped_dedupe: 0, skipped_cooldown: 1 });
        console.log(`[momentum-scanner] ${mover.symbol} in cooldown (${remainMin}m left), skipping news fetch`);
        continue;
      }

      // 4. Fetch news for this mover
      const { items } = await fetchNewsForSymbol(mover.symbol);
      const pinned = items.filter(i => i.isPinned);

      if (pinned.length === 0) {
        results.push({ symbol: mover.symbol, changePct: mover.changePct, catalysts: 0, sent: 0, skipped_dedupe: 0, skipped_cooldown: 0 });
        continue;
      }

      // 5. Check each catalyst headline
      for (const item of pinned) {
        const key     = `${mover.symbol}:${item.id}`;
        const logBase = {
          ts:          new Date().toISOString(),
          ticker:      mover.symbol,
          category:    item.category,
          headline_id: item.id,
          source:      item.source,
          title:       item.title,
        };

        // Headline dedupe
        if (cache[key]) {
          await appendLog({ ...logBase, sent: false, reason: 'dedupe' });
          skipped_dedupe++;
          continue;
        }

        // 6. Send Telegram alert
        const text     = buildMomentumAlertMessage(mover.symbol, mover.name, mover.changePct, item);
        const chartUrl = process.env.APP_URL ? `${process.env.APP_URL}/?symbol=${mover.symbol}&tf=1m` : undefined;
        await sendTelegram(text, chartUrl);

        cache[key]              = now;
        cooldowns[mover.symbol] = now;
        sent++;
        totalSent++;

        // 7. Log
        await appendLog({ ...logBase, sent: true, reason: null });

        // Telegram rate limit
        await new Promise(r => setTimeout(r, 300));
      }

      results.push({ symbol: mover.symbol, changePct: mover.changePct, catalysts: pinned.length, sent, skipped_dedupe, skipped_cooldown });

    } catch (err: any) {
      console.error(`[momentum-scanner] error for ${mover.symbol}:`, err?.message);
      results.push({ symbol: mover.symbol, changePct: mover.changePct, catalysts: 0, sent, skipped_dedupe, skipped_cooldown, error: err?.message });
    }
  }

  await Promise.all([writeJson(CACHE_PATH, cache), writeJson(COOLDOWN_PATH, cooldowns)]);

  console.log(`[momentum-scanner] ${movers.length} movers >${MOVE_PCT}% | ${totalSent} alert(s) sent`);

  return NextResponse.json({
    checkedAt:  new Date().toISOString(),
    threshold:  MOVE_PCT,
    cooldownMin: COOLDOWN_MS / 60_000,
    movers:     movers.length,
    results,
    totalSent,
  });
}
