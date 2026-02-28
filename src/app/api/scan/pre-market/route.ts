/**
 * GET /api/scan/pre-market
 *
 * Unified scanner endpoint for all three market sessions.
 *
 * Query params:
 *   ?marketType=pre_market|regular|post_market  (default: pre_market)
 *   ?minChange=12   override default min % change
 *   ?maxPrice=30    override default max price
 *   ?minVol=12000   override default min session volume
 *   ?alert=1        also send a Telegram digest (pre-market only)
 *   ?force=1        run even outside the expected session window
 */

import { NextResponse }                          from 'next/server';
import fs                                        from 'fs/promises';
import path                                      from 'path';
import {
  scanPreMarket,
  getMarketSession,
  SESSION_DEFAULTS,
  type MarketType,
  type ScanFilters,
  type PreMarketStock,
}                                                from '@/lib/pre-market-scanner';
import { buildPreMarketDigestMessage, sendTelegram } from '@/lib/telegram';

const DATA_DIR      = path.join(process.cwd(), 'data');
const PM_CACHE_PATH = path.join(DATA_DIR, 'pm-scan-cache.json');
const DIGEST_COOLDOWN = parseInt(process.env.PRE_MARKET_DIGEST_COOLDOWN_MINUTES ?? '30', 10) * 60_000;

// ── Session gate ──────────────────────────────────────────────────────────────

const SESSION_GATE: Record<MarketType, ReturnType<typeof getMarketSession>> = {
  pre_market:  'pre',
  regular:     'regular',
  post_market: 'post',
};

const SESSION_HOURS: Record<MarketType, string> = {
  pre_market:  '4:00–9:30 AM ET',
  regular:     '9:30 AM–4:00 PM ET',
  post_market: '4:00–8:00 PM ET',
};

// ── Cache (Telegram dedup for pre-market digest) ──────────────────────────────

interface PmCache {
  lastSentAt:    number;
  lastSymbolSet: string;
  sentToday:     string[];
  todayDate:     string;
}

async function readCache(): Promise<PmCache> {
  try { return JSON.parse(await fs.readFile(PM_CACHE_PATH, 'utf-8')) as PmCache; }
  catch { return { lastSentAt: 0, lastSymbolSet: '[]', sentToday: [], todayDate: '' }; }
}
async function writeCache(c: PmCache): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(PM_CACHE_PATH, JSON.stringify(c, null, 2));
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const url        = new URL(req.url);
  const alert      = url.searchParams.get('alert')      === '1';
  const force      = url.searchParams.get('force')      === '1';
  const marketType = (url.searchParams.get('marketType') ?? 'pre_market') as MarketType;

  // Per-session filter defaults, overrideable via URL params
  const defaults  = SESSION_DEFAULTS[marketType] ?? SESSION_DEFAULTS.pre_market;
  const FILTERS: ScanFilters = {
    maxPrice:           parseFloat(url.searchParams.get('maxPrice')  ?? String(defaults.maxPrice)),
    minPreMarketVolume: parseInt(  url.searchParams.get('minVol')    ?? String(defaults.minPreMarketVolume), 10),
    maxMarketCap:       parseFloat(url.searchParams.get('maxMcap')   ?? String(defaults.maxMarketCap)),
    minChangePct:       parseFloat(url.searchParams.get('minChange') ?? String(defaults.minChangePct)),
  };

  const session        = getMarketSession();
  const expectedSession = SESSION_GATE[marketType];

  if (session !== expectedSession && !force) {
    return NextResponse.json({
      scannedAt: new Date().toISOString(),
      session,
      marketType,
      message:   `${marketType.replace(/_/g, ' ')} scanner only runs ${SESSION_HOURS[marketType]} (pass ?force=1 to override)`,
      count:     0,
      stocks:    [],
    });
  }

  // ── Run scan ───────────────────────────────────────────────────────────────
  let stocks: PreMarketStock[];
  let source: 'primary' | 'fallback';

  try {
    ({ stocks, source } = await scanPreMarket(FILTERS, marketType));
  } catch (err: any) {
    console.error('[scan] scanner error:', err?.message);
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }

  console.log(`[scan/${marketType}] ${stocks.length} matches (source: ${source})`);

  // ── Telegram digest (pre-market only) ─────────────────────────────────────
  let alertSent    = false;
  let alertSkipped = '';

  if (alert && marketType === 'pre_market') {
    const now       = Date.now();
    const todayStr  = new Date().toISOString().slice(0, 10);
    const cache     = await readCache();
    const symbolSet = JSON.stringify(stocks.map(s => s.symbol).sort());

    if (cache.todayDate !== todayStr) { cache.sentToday = []; cache.todayDate = todayStr; }

    if (cache.lastSymbolSet === symbolSet && now - cache.lastSentAt < DIGEST_COOLDOWN) {
      alertSkipped = `same result set, cooldown ${Math.ceil((DIGEST_COOLDOWN - (now - cache.lastSentAt)) / 60_000)}m remaining`;
    } else {
      try {
        await sendTelegram(buildPreMarketDigestMessage(stocks, FILTERS, source));
        cache.lastSentAt    = now;
        cache.lastSymbolSet = symbolSet;
        cache.sentToday     = [...new Set([...cache.sentToday, ...stocks.map(s => s.symbol)])];
        await writeCache(cache);
        alertSent = true;
      } catch (err: any) {
        console.error('[scan] telegram error:', err?.message);
      }
    }
  }

  return NextResponse.json({
    scannedAt:  new Date().toISOString(),
    session,
    marketType,
    source,
    filters:    FILTERS,
    count:      stocks.length,
    stocks,
    alert:      alert ? { sent: alertSent, skipped: alertSkipped || null } : undefined,
  });
}
