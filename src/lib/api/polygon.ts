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
  prevDay: { c: number };
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
