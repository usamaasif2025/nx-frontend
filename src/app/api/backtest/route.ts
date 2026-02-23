import { NextResponse } from 'next/server';
import * as finnhub from '@/lib/api/finnhub';
import * as polygon from '@/lib/api/polygon';
import { runBacktest } from '@/lib/backtest/engine';
import { Candle, Timeframe } from '@/types';

// Longer lookbacks than the chart API — needed to generate enough trades
const LOOKBACK: Partial<Record<Timeframe, number>> = {
  '1h':  60 * 60 * 24 * 30,       // 30 days
  '4h':  60 * 60 * 24 * 60,       // 60 days
  '1D':  60 * 60 * 24 * 730,      // 2 years
  '1W':  60 * 60 * 24 * 365 * 4,  // 4 years
  '1M':  60 * 60 * 24 * 365 * 8,  // 8 years
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol    = searchParams.get('symbol')?.toUpperCase();
  const timeframe = (searchParams.get('timeframe') || '1D') as Timeframe;
  const strategy  = searchParams.get('strategy') || undefined;

  if (!symbol) {
    return NextResponse.json({ error: 'symbol required' }, { status: 400 });
  }

  const lookback = LOOKBACK[timeframe];
  if (!lookback) {
    return NextResponse.json(
      { error: `Timeframe '${timeframe}' is not supported for backtesting` },
      { status: 400 }
    );
  }

  const now      = Math.floor(Date.now() / 1000);
  const from     = now - lookback;
  const fromDate = new Date(from  * 1000).toISOString().split('T')[0];
  const toDate   = new Date(now   * 1000).toISOString().split('T')[0];

  let candles: Candle[] = [];

  candles = await finnhub.getCandles(symbol, timeframe, from, now);

  if (candles.length === 0) {
    candles = await polygon.getCandles(symbol, timeframe, fromDate, toDate);
  }

  if (candles.length < 30) {
    return NextResponse.json(
      { error: 'Not enough historical data to run a backtest (need ≥ 30 bars)' },
      { status: 422 }
    );
  }

  const result = runBacktest(candles, symbol, timeframe, strategy);
  return NextResponse.json(result);
}
