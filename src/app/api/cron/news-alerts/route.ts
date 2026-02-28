/**
 * GET /api/cron/news-alerts
 *
 * Scans the full market news feed (45+ sources) through the same filter
 * rules as Catalyst Mode in the UI, then fires Telegram alerts for any
 * new items that haven't been seen before.
 *
 * Query params:
 *   ?test=1   — bypass dedup/cooldown, fire the first matching alert
 *               immediately. Use this to verify Telegram is working.
 *
 * Catalyst rules (mirrors news/page.tsx CATALYST_CATS):
 *   Pass:   FDA Approval · Clinical Trial · Earnings · Merger & Acquisition
 *           Major Investment · Geopolitical · Analyst Rating
 *   Bullish-only: all of the above except Geo + M&A (both sentiments ok)
 *
 * Config (.env.local):
 *   TELEGRAM_BOT_TOKEN          — required
 *   TELEGRAM_CHAT_ID            — required
 *   NEWS_ALERT_COOLDOWN_MINUTES — per-category cooldown, default 10
 *   APP_URL                     — optional, appended as a chart link
 */

import { NextRequest, NextResponse } from 'next/server';
import fs                            from 'fs/promises';
import path                          from 'path';
import { fetchAllMarketNews }        from '@/lib/news-fetch';
import type { NewsCategory }         from '@/lib/news-fetch';
import { buildCatalystNewsAlert, sendTelegram } from '@/lib/telegram';

export const runtime    = 'nodejs';
export const maxDuration = 60;

// ── Catalyst filter (mirrors UI Catalyst Mode) ────────────────────────────────

const CATALYST_CATS = new Set<NewsCategory>([
  'FDA Approval', 'Clinical Trial', 'Earnings',
  'Merger & Acquisition', 'Major Investment',
  'Geopolitical', 'Analyst Rating',
]);

const CATALYST_BULLISH_ONLY = new Set<NewsCategory>([
  'FDA Approval', 'Clinical Trial', 'Earnings', 'Major Investment', 'Analyst Rating',
]);

// ── Persistence paths ─────────────────────────────────────────────────────────

const DATA_DIR    = path.join(process.cwd(), 'data');
const CACHE_PATH  = path.join(DATA_DIR, 'news-alerts-sent.json');
const COOL_PATH   = path.join(DATA_DIR, 'news-alerts-cooldowns.json');
const LOG_PATH    = path.join(DATA_DIR, 'news-alerts-log.jsonl');

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;   // forget items after 24h
const COOLDOWN_MS  = parseInt(process.env.NEWS_ALERT_COOLDOWN_MINUTES ?? '10', 10) * 60_000;

// ── File helpers ──────────────────────────────────────────────────────────────

async function readJson<T>(p: string, fallback: T): Promise<T> {
  try { return JSON.parse(await fs.readFile(p, 'utf-8')) as T; }
  catch { return fallback; }
}

async function writeJson(p: string, data: unknown) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(p, JSON.stringify(data, null, 2));
}

async function appendLog(entry: object) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.appendFile(LOG_PATH, JSON.stringify(entry) + '\n');
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const testMode = req.nextUrl.searchParams.get('test') === '1';
  const appUrl   = process.env.APP_URL ?? '';

  let [cache, cooldowns] = await Promise.all([
    readJson<Record<string, number>>(CACHE_PATH, {}),
    readJson<Record<string, number>>(COOL_PATH,  {}),
  ]);

  const now = Date.now();

  // Prune stale cache entries
  cache = Object.fromEntries(
    Object.entries(cache).filter(([, ts]) => now - ts < CACHE_TTL_MS),
  );

  let fetched = 0;
  let sent    = 0;
  let skipped = 0;
  const sentItems: { ticker: string | null; title: string; category: string; bigBeat: boolean }[] = [];

  try {
    const { items } = await fetchAllMarketNews();
    fetched = items.length;

    // Apply Catalyst Mode filter
    const catalysts = items.filter(item => {
      if (!CATALYST_CATS.has(item.category)) return false;
      if (CATALYST_BULLISH_ONLY.has(item.category) && item.sentiment !== 'bullish') return false;
      return true;
    });

    for (const item of catalysts) {
      const ticker    = item.ticker ?? null;
      const bigBeat   = item.bigBeat ?? false;
      const cacheKey  = `news:${item.id}`;
      const coolKey   = `news:${item.category}`;

      const logBase = {
        ts:       new Date().toISOString(),
        ticker,
        category: item.category,
        bigBeat,
        title:    item.title,
        source:   item.source,
        id:       item.id,
        test:     testMode,
      };

      if (!testMode) {
        // ── Dedup: skip if already sent ──────────────────────────────────────
        if (cache[cacheKey]) {
          await appendLog({ ...logBase, sent: false, reason: 'dedupe' });
          skipped++;
          continue;
        }

        // ── Cooldown: one alert per category per N minutes ───────────────────
        const lastSent = cooldowns[coolKey] ?? 0;
        if (now - lastSent < COOLDOWN_MS) {
          const remainMin = Math.ceil((COOLDOWN_MS - (now - lastSent)) / 60_000);
          await appendLog({ ...logBase, sent: false, reason: `cooldown:${remainMin}m` });
          skipped++;
          continue;
        }
      }

      // ── Send ──────────────────────────────────────────────────────────────
      const text     = buildCatalystNewsAlert(item, ticker, bigBeat);
      const chartUrl = ticker && appUrl ? `${appUrl}/?symbol=${ticker}&tf=1m` : undefined;

      await sendTelegram(text, chartUrl);

      cache[cacheKey]   = now;
      cooldowns[coolKey] = now;
      sent++;

      sentItems.push({ ticker, title: item.title, category: item.category, bigBeat });
      await appendLog({ ...logBase, sent: true, reason: null });

      // Telegram rate limit: max 30 msg/sec
      await new Promise(r => setTimeout(r, 350));

      // In test mode, send just the first match and stop
      if (testMode) break;
    }
  } catch (err: any) {
    console.error('[news-alerts] error:', err?.message);
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }

  // Persist (skip in test mode to avoid polluting dedup cache)
  if (!testMode) {
    await Promise.all([
      writeJson(CACHE_PATH, cache),
      writeJson(COOL_PATH,  cooldowns),
    ]);
  }

  console.log(`[news-alerts] test=${testMode} fetched=${fetched} sent=${sent} skipped=${skipped}`);

  return NextResponse.json({
    mode:      testMode ? 'test' : 'live',
    scannedAt: new Date().toISOString(),
    fetched,
    catalysts: fetched,
    sent,
    skipped,
    sentItems,
  });
}
