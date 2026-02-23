import axios from 'axios';
import { Candle } from '@/types';

const BASE = 'https://api.polygon.io';
const KEY = process.env.NEXT_PUBLIC_POLYGON_KEY || process.env.POLYGON_KEY || '';

const client = axios.create({ baseURL: BASE, params: { apiKey: KEY } });

const MULTIPLIER_MAP: Record<string, { multiplier: number; timespan: string }> = {
  '1m':  { multiplier: 1,   timespan: 'minute' },
  '5m':  { multiplier: 5,   timespan: 'minute' },
  '15m': { multiplier: 15,  timespan: 'minute' },
  '30m': { multiplier: 30,  timespan: 'minute' },
  '1h':  { multiplier: 1,   timespan: 'hour' },
  '4h':  { multiplier: 4,   timespan: 'hour' },
  '1D':  { multiplier: 1,   timespan: 'day' },
  '1W':  { multiplier: 1,   timespan: 'week' },
  '1M':  { multiplier: 1,   timespan: 'month' },
};

export async function getCandles(
  symbol: string,
  timeframe: string,
  fromDate: string, // YYYY-MM-DD
  toDate: string
): Promise<Candle[]> {
  const mapping = MULTIPLIER_MAP[timeframe];
  if (!mapping) return [];

  try {
    const { data } = await client.get(
      `/v2/aggs/ticker/${symbol}/range/${mapping.multiplier}/${mapping.timespan}/${fromDate}/${toDate}`,
      { params: { adjusted: true, sort: 'asc', limit: 5000 } }
    );

    if (!data.results) return [];

    return data.results.map((r: { t: number; o: number; h: number; l: number; c: number; v: number }) => ({
      time: Math.floor(r.t / 1000), // convert ms to seconds
      open: r.o,
      high: r.h,
      low: r.l,
      close: r.c,
      volume: r.v,
    }));
  } catch {
    return [];
  }
}

export interface PolygonSnapshot {
  ticker: string;
  day: { o: number; h: number; l: number; c: number; v: number; vw: number };
  prevDay: { c: number; v: number };
  min: { o: number; h: number; l: number; c: number; v: number };
  lastTrade: { p: number };
  todaysChangePerc: number;
  todaysChange: number;
}

export async function getGainers(minChangePct = 7): Promise<PolygonSnapshot[]> {
  try {
    const { data } = await client.get('/v2/snapshot/locale/us/markets/stocks/gainers');
    if (!data.tickers) return [];
    return data.tickers.filter(
      (t: PolygonSnapshot) => Math.abs(t.todaysChangePerc) >= minChangePct
    );
  } catch {
    return [];
  }
}

// Popular/active stocks to scan during pre-market hours
const PRE_MARKET_WATCHLIST = [
  // Mega-cap tech
  'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'AVGO', 'AMD',
  'NFLX', 'INTC', 'QCOM', 'CRM', 'ORCL', 'ADBE', 'MU', 'AMAT', 'LRCX', 'SMCI',
  // Leveraged ETFs & volatility
  'SPY', 'QQQ', 'IWM', 'SOXS', 'SOXL', 'TQQQ', 'SPXL', 'UVXY', 'SQQQ',
  // Financials
  'JPM', 'BAC', 'GS', 'MS', 'WFC', 'C', 'V', 'MA', 'PYPL',
  // Energy
  'XOM', 'CVX', 'OXY', 'HAL', 'SLB',
  // Biotech / pharma (frequent pre-market movers on trial data)
  'MRNA', 'BNTX', 'NVAX', 'BIIB', 'GILD', 'AMGN', 'REGN', 'VRTX', 'SRPT',
  // Consumer / retail
  'COST', 'WMT', 'TGT', 'HD', 'SBUX', 'MCD', 'NKE',
  // High-volatility / meme / retail favourites
  'PLTR', 'RIVN', 'LCID', 'HOOD', 'SOFI', 'UPST', 'AFRM', 'COIN',
  'MARA', 'RIOT', 'CLSK', 'HUT', 'GME', 'AMC', 'BB',
].join(',');

/**
 * Returns pre-market movers by comparing lastTrade.p (most recent extended-hours
 * trade) against prevDay.c (previous regular-session close).
 * Used in place of getGainers() during pre-market (4:00 AM – 9:30 AM ET).
 */
export async function getPreMarketMovers(minChangePct = 5): Promise<PolygonSnapshot[]> {
  try {
    const { data } = await client.get('/v2/snapshot/locale/us/markets/stocks/tickers', {
      params: { tickers: PRE_MARKET_WATCHLIST },
    });
    if (!data.tickers) return [];

    return (data.tickers as PolygonSnapshot[])
      .map((t) => {
        const prePrice = t.lastTrade?.p ?? 0;
        const prevClose = t.prevDay?.c ?? 0;
        const changePct =
          prePrice && prevClose > 0 ? ((prePrice - prevClose) / prevClose) * 100 : 0;
        return {
          ...t,
          todaysChangePerc: changePct,
          todaysChange: prePrice - prevClose,
        };
      })
      .filter((t) => Math.abs(t.todaysChangePerc) >= minChangePct)
      .sort((a, b) => Math.abs(b.todaysChangePerc) - Math.abs(a.todaysChangePerc));
  } catch {
    return [];
  }
}

export async function getTickerSnapshot(symbol: string): Promise<PolygonSnapshot | null> {
  try {
    const { data } = await client.get(
      `/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}`
    );
    return data.ticker || null;
  } catch {
    return null;
  }
}
