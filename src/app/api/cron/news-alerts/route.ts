/**
 * GET /api/cron/news-alerts
 *
 * Called by scripts/news-monitor.js every N seconds locally,
 * or by a Vercel Cron Job in production.
 *
 * Pipeline per ticker:
 *   1. Fetch news → identify high-impact (Tier-1) catalyst items
 *   2. Headline dedupe  — skip if this exact article was already sent (7-day cache)
 *   3. Ticker cooldown  — skip if this ticker was alerted within ALERT_COOLDOWN_MINUTES
 *   4. Send Telegram alert
 *   5. Append every attempt (sent OR skipped) to data/alert-log.jsonl
 */

import { NextResponse }       from 'next/server';
import fs                     from 'fs/promises';
import path                   from 'path';
import { fetchNewsForSymbol } from '@/lib/news-fetch';
import { sendTelegramAlert }  from '@/lib/telegram';

const DATA_DIR       = path.join(process.cwd(), 'data');
const WATCHLIST_PATH = path.join(DATA_DIR, 'watchlist.json');
const CACHE_PATH     = path.join(DATA_DIR, 'sent-alerts.json');
const COOLDOWN_PATH  = path.join(DATA_DIR, 'cooldowns.json');
const LOG_PATH       = path.join(DATA_DIR, 'alert-log.jsonl');

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const COOLDOWN_MS  = parseInt(process.env.ALERT_COOLDOWN_MINUTES ?? '15', 10) * 60_000;

// ── File helpers ──────────────────────────────────────────────────────────────

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

// ── Log entry ─────────────────────────────────────────────────────────────────

interface LogEntry {
  ts:          string;   // ISO timestamp
  ticker:      string;
  category:    string;
  headline_id: string;
  source:      string;
  title:       string;
  sent:        boolean;
  reason:      string | null; // null = sent  |  'dedupe' | 'cooldown:Xm' = skipped
}

async function appendLog(entry: LogEntry): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.appendFile(LOG_PATH, JSON.stringify(entry) + '\n');
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function GET() {
  const watchlist = await readJson<string[]>(WATCHLIST_PATH, []);

  if (watchlist.length === 0) {
    return NextResponse.json({
      message: 'Watchlist is empty — add tickers to data/watchlist.json',
      sent: 0,
    });
  }

  const [rawCache, cooldowns] = await Promise.all([
    readJson<Record<string, number>>(CACHE_PATH, {}),
    readJson<Record<string, number>>(COOLDOWN_PATH, {}),
  ]);

  const now = Date.now();

  // Prune headline cache entries older than 7 days
  const cache: Record<string, number> = Object.fromEntries(
    Object.entries(rawCache).filter(([, ts]) => now - ts < CACHE_TTL_MS),
  );

  const results: {
    symbol: string;
    catalysts: number;
    sent: number;
    skipped_dedupe: number;
    skipped_cooldown: number;
    error?: string;
  }[] = [];

  for (const symbol of watchlist) {
    let catalysts = 0;
    let sent = 0;
    let skipped_dedupe = 0;
    let skipped_cooldown = 0;

    try {
      const { items } = await fetchNewsForSymbol(symbol);
      const pinned = items.filter(i => i.isPinned);
      catalysts = pinned.length;

      for (const item of pinned) {
        const key     = `${symbol}:${item.id}`;
        const logBase = {
          ts:          new Date().toISOString(),
          ticker:      symbol,
          category:    item.category,
          headline_id: item.id,
          source:      item.source,
          title:       item.title,
        };

        // ── Step 1: Headline dedupe ───────────────────────────────────────
        if (cache[key]) {
          await appendLog({ ...logBase, sent: false, reason: 'dedupe' });
          skipped_dedupe++;
          continue;
        }

        // ── Step 2: Per-ticker cooldown ───────────────────────────────────
        const lastAlerted = cooldowns[symbol] ?? 0;
        if (now - lastAlerted < COOLDOWN_MS) {
          const remainMin = Math.ceil((COOLDOWN_MS - (now - lastAlerted)) / 60_000);
          await appendLog({ ...logBase, sent: false, reason: `cooldown:${remainMin}m` });
          skipped_cooldown++;
          continue;
        }

        // ── Step 3: Send ──────────────────────────────────────────────────
        await sendTelegramAlert(item, symbol, process.env.APP_URL ?? '');
        cache[key]        = now;
        cooldowns[symbol] = now;
        sent++;

        await appendLog({ ...logBase, sent: true, reason: null });

        // Stay within Telegram's 30 msg/sec limit
        await new Promise(r => setTimeout(r, 300));
      }

      results.push({ symbol, catalysts, sent, skipped_dedupe, skipped_cooldown });
    } catch (err: any) {
      console.error(`[news-alerts] error for ${symbol}:`, err?.message);
      results.push({ symbol, catalysts, sent, skipped_dedupe, skipped_cooldown, error: err?.message });
    }
  }

  // Persist updated cache and cooldowns atomically
  await Promise.all([
    writeJson(CACHE_PATH, cache),
    writeJson(COOLDOWN_PATH, cooldowns),
  ]);

  const totalSent = results.reduce((s, r) => s + r.sent, 0);
  console.log(
    `[news-alerts] ${watchlist.length} tickers | ${totalSent} sent | cooldown ${COOLDOWN_MS / 60_000}m`,
  );

  return NextResponse.json({
    checkedAt:   new Date().toISOString(),
    cooldownMin: COOLDOWN_MS / 60_000,
    watchlist,
    results,
    totalSent,
  });
}
