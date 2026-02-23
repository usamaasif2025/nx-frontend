import { NextResponse } from 'next/server';
import * as finnhub from '@/lib/api/finnhub';
import * as polygon from '@/lib/api/polygon';
import { getNews } from '@/lib/api/finnhub';
import { detectLevels } from '@/lib/analysis/levels';
import { runStrategyEngine } from '@/lib/strategies';
import { Candle, StockQuote, MarketSession } from '@/types';

async function fetchCandles(symbol: string, timeframe: string, from: number, to: number): Promise<Candle[]> {
  let c = await finnhub.getCandles(symbol, timeframe, from, to);
  if (c.length === 0) {
    const fromDate = new Date(from * 1000).toISOString().split('T')[0];
    const toDate = new Date(to * 1000).toISOString().split('T')[0];
    c = await polygon.getCandles(symbol, timeframe, fromDate, toDate);
  }
  return c;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get('symbol')?.toUpperCase();

  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

  const now = Math.floor(Date.now() / 1000);

  try {
    const [fq, candles1m, candles5m, candles15m, news] = await Promise.all([
      finnhub.getQuote(symbol),
      fetchCandles(symbol, '1m', now - 3600 * 2, now),
      fetchCandles(symbol, '5m', now - 3600 * 8, now),
      fetchCandles(symbol, '15m', now - 3600 * 24, now),
      getNews(symbol),
    ]);

    if (!fq) return NextResponse.json({ error: 'quote not found' }, { status: 404 });

    const quote: StockQuote = {
      symbol,
      name: symbol,
      price: fq.c,
      change: fq.d,
      changePercent: fq.dp,
      volume: 0,
      avgVolume: 0,
      volumeRatio: 1,
      high: fq.h,
      low: fq.l,
      open: fq.o,
      prevClose: fq.pc,
      session: 'regular' as MarketSession,
      timestamp: Date.now(),
      triggered: Math.abs(fq.dp) >= 7,
    };

    const levels = detectLevels([...candles1m, ...candles5m, ...candles15m], '5m');
    const newsScore = news.slice(0, 3).reduce((s, n) => s + n.impactScore, 0) / 3;

    const setups = runStrategyEngine(
      { quote, candles1m, candles5m, candles15m, levels },
      newsScore
    );

    return NextResponse.json({
      symbol,
      setups,
      generatedAt: Date.now(),
      quote,
      newsScore: Math.round(newsScore * 10) / 10,
    });
  } catch (err) {
    console.error('Strategy API error:', err);
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 });
  }
}
