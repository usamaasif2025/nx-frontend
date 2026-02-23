import { NextResponse } from 'next/server';
import * as finnhub from '@/lib/api/finnhub';
import * as polygon from '@/lib/api/polygon';
import * as alphaVantage from '@/lib/api/alphaVantage';
import { detectLevels } from '@/lib/analysis/levels';
import { Candle, Timeframe } from '@/types';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get('symbol')?.toUpperCase();
  const timeframe = (searchParams.get('timeframe') || '1m') as Timeframe;

  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

  const now = Math.floor(Date.now() / 1000);
  const lookbackSeconds: Record<Timeframe, number> = {
    '1m':  60 * 60 * 2,        // 2 hours
    '5m':  60 * 60 * 8,        // 8 hours
    '15m': 60 * 60 * 24,       // 1 day
    '30m': 60 * 60 * 48,       // 2 days
    '1h':  60 * 60 * 24 * 5,   // 5 days
    '4h':  60 * 60 * 24 * 20,  // 20 days
    '1D':  60 * 60 * 24 * 90,  // 90 days
  };

  const from = now - (lookbackSeconds[timeframe] || 3600);
  const fromDate = new Date(from * 1000).toISOString().split('T')[0];
  const toDate = new Date().toISOString().split('T')[0];

  let candles: Candle[] = [];

  // Try Finnhub first
  candles = await finnhub.getCandles(symbol, timeframe, from, now);

  // Fallback to Polygon
  if (candles.length === 0) {
    candles = await polygon.getCandles(symbol, timeframe, fromDate, toDate);
  }

  // Final fallback: Alpha Vantage
  if (candles.length === 0) {
    candles = await alphaVantage.getCandles(symbol, timeframe);
  }

  const levels = detectLevels(candles, timeframe);
  const triggerCandle = candles.length > 0 ? candles[0] : null;

  return NextResponse.json({ symbol, timeframe, candles, levels, triggerCandle });
}
