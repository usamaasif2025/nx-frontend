/**
 * Pre/Regular/Post-market stock scanner — Alpaca Markets edition
 *
 * Scans the full US equity market using the Alpaca screener API.
 * Returns stocks that simultaneously satisfy all active filters.
 *
 * Supports three market sessions:
 *   pre_market   — 4:00–9:30 AM ET   | volume from minute bars 4:00–9:30
 *   regular      — 9:30 AM–4:00 PM ET | volume from snapshot dailyBar.v
 *   post_market  — 4:00–8:00 PM ET   | volume from minute bars 16:00–20:00
 *
 * Strategy:
 *   1. Primary  — Alpaca /v1beta1/screener/stocks/movers with matching
 *      market_type. Covers ALL US equities, sorted by % change.
 *   2. Fallback — Batched snapshots of every active US equity asset,
 *      filtered client-side. Used when the movers endpoint fails.
 *
 * Env vars required:
 *   ALPACA_KEY    — Alpaca API key ID
 *   ALPACA_SECRET — Alpaca API secret key
 */

import axios from 'axios';

const ALPACA_DATA  = 'https://data.alpaca.markets';
const ALPACA_API   = 'https://paper-api.alpaca.markets';

export type MarketType = 'pre_market' | 'regular' | 'post_market';

function alpacaHeaders() {
  return {
    'APCA-API-KEY-ID':     process.env.ALPACA_KEY    ?? '',
    'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET ?? '',
    Accept:                'application/json',
  };
}

// ── ET time helper ────────────────────────────────────────────────────────────

/** Build a UTC Date from today's ET hours:minutes (handles EST/EDT automatically) */
function etTimeToday(hours: number, mins: number): Date {
  const now   = new Date();
  const etNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const etToUtcMs = now.getTime() - etNow.getTime(); // ms offset ET→UTC
  const target = new Date(etNow);
  target.setHours(hours, mins, 0, 0);
  return new Date(target.getTime() + etToUtcMs);
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ScanFilters {
  maxPrice:            number;
  minPreMarketVolume:  number;  // "volume" field — applies to whichever session is active
  maxMarketCap:        number;  // interface-compat; not enforced (Alpaca doesn't provide it)
  minChangePct:        number;
}

export const DEFAULT_FILTERS: ScanFilters = {
  maxPrice:           30,
  minPreMarketVolume: 12_000,
  maxMarketCap:       2_000_000_000,
  minChangePct:       12,
};

export const SESSION_DEFAULTS: Record<MarketType, ScanFilters> = {
  pre_market:  { maxPrice: 30,  minPreMarketVolume: 12_000,  maxMarketCap: 2e9, minChangePct: 12 },
  regular:     { maxPrice: 500, minPreMarketVolume: 500_000, maxMarketCap: 2e9, minChangePct: 5  },
  post_market: { maxPrice: 200, minPreMarketVolume: 10_000,  maxMarketCap: 2e9, minChangePct: 3  },
};

export interface PreMarketStock {
  symbol:             string;
  name:               string;
  exchange:           string;
  prevClose:          number;
  preMarketPrice:     number;
  preMarketChange:    number;
  preMarketChangePct: number;
  preMarketVolume:    number;  // volume for whichever session was scanned
  marketCap:          number;  // 0 — not available from Alpaca free tier
  sector:             string | null;
}

// ── Alpaca shapes ─────────────────────────────────────────────────────────────

interface AlpacaBar {
  t: string; o: number; h: number; l: number; c: number; v: number; vw: number;
}

interface AlpacaSnapshot {
  latestTrade:  { p: number; s: number; t: string } | null;
  latestQuote:  { ap: number; bp: number }           | null;
  minuteBar:    AlpacaBar | null;
  dailyBar:     AlpacaBar | null;
  prevDailyBar: AlpacaBar | null;
}

// ── Session minute-bar volume ─────────────────────────────────────────────────
// Sums 1-Min bars between two ET times for each symbol.

async function fetchSessionVolumes(
  symbols: string[],
  startH: number, startM: number,
  endH:   number, endM:   number,
): Promise<Record<string, number>> {
  if (!symbols.length) return {};

  const startUtc = etTimeToday(startH, startM);
  const endUtc   = new Date(Math.min(etTimeToday(endH, endM).getTime(), Date.now()));

  if (endUtc <= startUtc) return {};

  try {
    const res = await axios.get(`${ALPACA_DATA}/v2/stocks/bars`, {
      headers: alpacaHeaders(),
      params: {
        symbols:    symbols.join(','),
        timeframe:  '1Min',
        start:      startUtc.toISOString(),
        end:        endUtc.toISOString(),
        feed:       'iex',
        limit:      10_000,
        adjustment: 'raw',
      },
      timeout: 20_000,
    });
    const bars: Record<string, { v: number }[]> = res.data?.bars ?? {};
    const out: Record<string, number> = {};
    for (const [sym, symBars] of Object.entries(bars)) {
      out[sym] = symBars.reduce((s, b) => s + b.v, 0);
    }
    return out;
  } catch (err: any) {
    console.warn('[scanner] session-volume fetch failed:', err?.message);
    return {};
  }
}

// ── Batch snapshot fetch ──────────────────────────────────────────────────────

async function fetchSnapshots(symbols: string[]): Promise<Record<string, AlpacaSnapshot>> {
  if (!symbols.length) return {};
  try {
    const res = await axios.get(`${ALPACA_DATA}/v2/stocks/snapshots`, {
      headers: alpacaHeaders(),
      params:  { symbols: symbols.join(','), feed: 'iex' },
      timeout: 15_000,
    });
    return (res.data ?? {}) as Record<string, AlpacaSnapshot>;
  } catch (err: any) {
    console.warn('[scanner] snapshot fetch failed:', err?.message);
    return {};
  }
}

// ── Volume by market type ────────────────────────────────────────────────────

async function getVolumeMap(
  symbols:    string[],
  marketType: MarketType,
  snapshots:  Record<string, AlpacaSnapshot>,
): Promise<Record<string, number>> {
  if (marketType === 'regular') {
    // Use cumulative daily bar volume — already in snapshot, no extra call
    const out: Record<string, number> = {};
    for (const sym of symbols) out[sym] = snapshots[sym]?.dailyBar?.v ?? 0;
    return out;
  }
  if (marketType === 'pre_market')  return fetchSessionVolumes(symbols, 4, 0, 9, 30);
  if (marketType === 'post_market') return fetchSessionVolumes(symbols, 16, 0, 20, 0);
  return {};
}

// ── Primary: Alpaca screener movers ──────────────────────────────────────────

async function primaryScan(
  f:          ScanFilters,
  marketType: MarketType,
): Promise<PreMarketStock[]> {
  const res = await axios.get(`${ALPACA_DATA}/v1beta1/screener/stocks/movers`, {
    headers: alpacaHeaders(),
    params:  { top: 100 },
    timeout: 15_000,
  });

  const gainers: { symbol: string; percent_change: number; change: number; price: number }[] =
    res.data?.gainers ?? [];

  const candidates = gainers.filter(
    g => g.percent_change >= f.minChangePct && g.price > 0 && g.price <= f.maxPrice,
  );
  if (!candidates.length) return [];

  const symbols    = candidates.map(g => g.symbol);
  const snapshots  = await fetchSnapshots(symbols);
  const volumeMap  = await getVolumeMap(symbols, marketType, snapshots);

  return candidates
    .map(g => ({
      symbol:             g.symbol,
      name:               g.symbol,
      exchange:           '',
      prevClose:          snapshots[g.symbol]?.prevDailyBar?.c ?? 0,
      preMarketPrice:     g.price,
      preMarketChange:    g.change,
      preMarketChangePct: g.percent_change,
      preMarketVolume:    volumeMap[g.symbol] ?? 0,
      marketCap:          0,
      sector:             null,
    } satisfies PreMarketStock))
    .filter(s => s.preMarketVolume >= f.minPreMarketVolume)
    .sort((a, b) => b.preMarketChangePct - a.preMarketChangePct);
}

// ── Fallback: batched full-market snapshot scan ───────────────────────────────

async function fallbackScan(
  f:          ScanFilters,
  marketType: MarketType,
): Promise<PreMarketStock[]> {
  const assetRes = await axios.get(`${ALPACA_API}/v2/assets`, {
    headers: alpacaHeaders(),
    params:  { status: 'active', asset_class: 'us_equity' },
    timeout: 30_000,
  });

  const assets: { symbol: string; exchange: string; tradable: boolean }[] = assetRes.data ?? [];
  const tradable = assets.filter(a => a.tradable && a.exchange !== 'OTC');
  const symbols  = tradable.map(a => a.symbol);

  // Batch into groups of 100, fetch 5 at a time
  const CHUNK = 100, CONCURRENCY = 5;
  const chunks: string[][] = [];
  for (let i = 0; i < symbols.length; i += CHUNK) chunks.push(symbols.slice(i, i + CHUNK));

  const allSnapshots: Record<string, AlpacaSnapshot> = {};
  for (let i = 0; i < chunks.length; i += CONCURRENCY) {
    const results = await Promise.allSettled(chunks.slice(i, i + CONCURRENCY).map(fetchSnapshots));
    for (const r of results) {
      if (r.status === 'fulfilled') Object.assign(allSnapshots, r.value);
    }
    await new Promise(r => setTimeout(r, 200));
  }

  // First-pass price + change filter
  const candidates: string[] = [];
  for (const sym of symbols) {
    const snap      = allSnapshots[sym];
    const prevClose = snap?.prevDailyBar?.c ?? 0;
    const curPrice  = snap?.latestTrade?.p  ?? 0;
    if (!prevClose || !curPrice) continue;
    const chgPct = ((curPrice - prevClose) / prevClose) * 100;
    if (chgPct >= f.minChangePct && curPrice <= f.maxPrice) candidates.push(sym);
  }
  if (!candidates.length) return [];

  const volumeMap    = await getVolumeMap(candidates, marketType, allSnapshots);
  const exchangeMap  = Object.fromEntries(tradable.map(a => [a.symbol, a.exchange]));

  return candidates
    .map(sym => {
      const snap      = allSnapshots[sym]!;
      const prevClose = snap.prevDailyBar?.c ?? 0;
      const curPrice  = snap.latestTrade?.p  ?? 0;
      return {
        symbol:             sym,
        name:               sym,
        exchange:           exchangeMap[sym] ?? '',
        prevClose,
        preMarketPrice:     curPrice,
        preMarketChange:    curPrice - prevClose,
        preMarketChangePct: ((curPrice - prevClose) / prevClose) * 100,
        preMarketVolume:    volumeMap[sym] ?? 0,
        marketCap:          0,
        sector:             null,
      } satisfies PreMarketStock;
    })
    .filter(s => s.preMarketVolume >= f.minPreMarketVolume)
    .sort((a, b) => b.preMarketChangePct - a.preMarketChangePct);
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function scanPreMarket(
  filters:    ScanFilters  = DEFAULT_FILTERS,
  marketType: MarketType   = 'pre_market',
): Promise<{ stocks: PreMarketStock[]; source: 'primary' | 'fallback' }> {
  try {
    const stocks = await primaryScan(filters, marketType);
    return { stocks, source: 'primary' };
  } catch (err: any) {
    const status = err?.response?.status;
    if (status === 401 || status === 403) {
      throw new Error(
        `Alpaca authentication failed (${status}). ` +
        `Check ALPACA_KEY and ALPACA_SECRET in your .env.local — ` +
        `regenerate them at https://app.alpaca.markets/paper/dashboard/overview`,
      );
    }
    console.warn('[scanner] primary failed, trying fallback:', err?.message);
  }
  try {
    const stocks = await fallbackScan(filters, marketType);
    return { stocks, source: 'fallback' };
  } catch (err: any) {
    const status = err?.response?.status;
    if (status === 401 || status === 403) {
      throw new Error(
        `Alpaca authentication failed (${status}). ` +
        `Check ALPACA_KEY and ALPACA_SECRET in your .env.local — ` +
        `regenerate them at https://app.alpaca.markets/paper/dashboard/overview`,
      );
    }
    throw err;
  }
}

// ── Market session ────────────────────────────────────────────────────────────

export function getMarketSession(): 'pre' | 'regular' | 'post' | 'closed' {
  const ny   = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day  = ny.getDay();
  const mins = ny.getHours() * 60 + ny.getMinutes();
  if (day === 0 || day === 6) return 'closed';
  if (mins >= 240  && mins < 570)  return 'pre';      // 04:00–09:30 ET
  if (mins >= 570  && mins < 960)  return 'regular';  // 09:30–16:00 ET
  if (mins >= 960  && mins < 1200) return 'post';     // 16:00–20:00 ET
  return 'closed';
}
