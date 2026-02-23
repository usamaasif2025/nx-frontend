/**
 * GET /api/cron/news-alerts
 *
 * Called by scripts/news-monitor.js every 5 minutes locally,
 * or by a Vercel Cron Job in production.
 *
 * For each ticker in data/watchlist.json it fetches news, identifies
 * catalyst (high-impact) items, and sends a Telegram alert for any
 * article not already in the sent-alerts cache.
 */

import { NextResponse }        from 'next/server';
import fs                      from 'fs/promises';
import path                    from 'path';
import { fetchNewsForSymbol }  from '@/lib/news-fetch';
import { sendTelegramAlert }   from '@/lib/telegram';

const DATA_DIR      = path.join(process.cwd(), 'data');
const WATCHLIST_PATH = path.join(DATA_DIR, 'watchlist.json');
const CACHE_PATH    = path.join(DATA_DIR, 'sent-alerts.json');

// 7 days in ms — old cache entries are pruned to keep the file small
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function readWatchlist(): Promise<string[]> {
  try {
    const raw = await fs.readFile(WATCHLIST_PATH, 'utf-8');
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.map((s: string) => s.toUpperCase().trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

async function readCache(): Promise<Record<string, number>> {
  try {
    const raw = await fs.readFile(CACHE_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeCache(cache: Record<string, number>): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(CACHE_PATH, JSON.stringify(cache, null, 2));
}

export async function GET() {
  const watchlist = await readWatchlist();

  if (watchlist.length === 0) {
    return NextResponse.json({ message: 'Watchlist is empty — add tickers to data/watchlist.json', sent: 0 });
  }

  const cache  = await readCache();
  const now    = Date.now();

  // Prune stale entries
  const pruned: Record<string, number> = Object.fromEntries(
    Object.entries(cache).filter(([, ts]) => now - ts < CACHE_TTL_MS),
  );

  const results: { symbol: string; catalysts: number; sent: number; error?: string }[] = [];

  for (const symbol of watchlist) {
    let catalysts = 0;
    let sent = 0;
    try {
      const { items } = await fetchNewsForSymbol(symbol);
      const pinned    = items.filter(i => i.isPinned);
      catalysts = pinned.length;

      for (const item of pinned) {
        const key = `${symbol}:${item.id}`;
        if (pruned[key]) continue; // already alerted

        await sendTelegramAlert(item, symbol);
        pruned[key] = now;
        sent++;

        // Small delay to avoid Telegram rate-limit (30 msg/sec)
        await new Promise(r => setTimeout(r, 300));
      }

      results.push({ symbol, catalysts, sent });
    } catch (err: any) {
      console.error(`[news-alerts] error for ${symbol}:`, err?.message);
      results.push({ symbol, catalysts, sent, error: err?.message });
    }
  }

  await writeCache(pruned);

  const totalSent = results.reduce((s, r) => s + r.sent, 0);
  console.log(`[news-alerts] checked ${watchlist.length} tickers, sent ${totalSent} alerts`);

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    watchlist,
    results,
    totalSent,
  });
}
