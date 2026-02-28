/**
 * GET /api/cron/market-scan
 *
 * Broad-market catalyst scanner — no watchlist needed.
 * Scans general financial news feeds and targeted Google News searches
 * for ANY stock with a high-impact event (FDA, M&A, Earnings, etc.).
 * Extracts the ticker symbol from the headline and sends a Telegram alert.
 *
 * Deduplication uses the same data/sent-alerts.json as the watchlist scanner
 * so you never receive the same headline twice regardless of which route found it.
 *
 * Config (via .env.local):
 *   TELEGRAM_BOT_TOKEN        — required
 *   TELEGRAM_CHAT_ID          — required
 *   ALERT_COOLDOWN_MINUTES    — default 15 (shared with watchlist scanner)
 *   APP_URL                   — optional, appended as a chart link
 */

import { NextResponse }                          from 'next/server';
import fs                                        from 'fs/promises';
import path                                      from 'path';
import { fetchBroadMarketNews }                  from '@/lib/news-fetch';
import { buildMarketScanAlertMessage, sendTelegram } from '@/lib/telegram';

const DATA_DIR    = '/tmp/market-scan';
const CACHE_PATH  = path.join(DATA_DIR, 'sent-alerts.json');
const LOG_PATH    = path.join(DATA_DIR, 'alert-log.jsonl');

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

async function appendLog(entry: object): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.appendFile(LOG_PATH, JSON.stringify(entry) + '\n');
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function GET() {
  const [rawCache, cooldownMap] = await Promise.all([
    readJson<Record<string, number>>(CACHE_PATH, {}),
    readJson<Record<string, number>>(
      path.join(DATA_DIR, 'cooldowns.json'), {},
    ),
  ]);

  const now = Date.now();

  // Prune stale cache entries
  const cache: Record<string, number> = Object.fromEntries(
    Object.entries(rawCache).filter(([, ts]) => now - ts < CACHE_TTL_MS),
  );

  let fetched = 0;
  let sent    = 0;
  let skipped = 0;

  const appUrl = process.env.APP_URL ?? '';

  try {
    const results = await fetchBroadMarketNews();
    fetched = results.length;

    for (const { item, ticker } of results) {
      // Cache key: based on item id (no symbol required)
      const cacheKey    = `market:${item.id}`;
      // Cooldown key: category-level (e.g. one FDA alert every N minutes)
      const cooldownKey = `market:${item.category}`;

      const logBase = {
        ts:          new Date().toISOString(),
        ticker:      ticker ?? '?',
        category:    item.category,
        headline_id: item.id,
        source:      item.source,
        title:       item.title,
        mode:        'market-scan',
      };

      // ── Deduplicate ───────────────────────────────────────────────────────
      if (cache[cacheKey]) {
        await appendLog({ ...logBase, sent: false, reason: 'dedupe' });
        skipped++;
        continue;
      }

      // ── Cooldown per category ─────────────────────────────────────────────
      const lastAlerted = cooldownMap[cooldownKey] ?? 0;
      if (now - lastAlerted < COOLDOWN_MS) {
        const remainMin = Math.ceil((COOLDOWN_MS - (now - lastAlerted)) / 60_000);
        await appendLog({ ...logBase, sent: false, reason: `cooldown:${remainMin}m` });
        skipped++;
        continue;
      }

      // ── Send ──────────────────────────────────────────────────────────────
      const text     = buildMarketScanAlertMessage(item, ticker);
      const chartUrl = ticker && appUrl ? `${appUrl}/?symbol=${ticker}&tf=1m` : undefined;
      await sendTelegram(text, chartUrl);

      cache[cacheKey]          = now;
      cooldownMap[cooldownKey] = now;
      sent++;

      await appendLog({ ...logBase, sent: true, reason: null });

      // Stay within Telegram's 30 msg/sec limit
      await new Promise(r => setTimeout(r, 300));
    }
  } catch (err: any) {
    console.error('[market-scan] error:', err?.message);
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }

  // Persist updated caches
  await Promise.all([
    writeJson(CACHE_PATH, cache),
    writeJson(path.join(DATA_DIR, 'cooldowns.json'), cooldownMap),
  ]);

  console.log(`[market-scan] fetched=${fetched} sent=${sent} skipped=${skipped}`);

  return NextResponse.json({
    scannedAt: new Date().toISOString(),
    fetched,
    sent,
    skipped,
  });
}
