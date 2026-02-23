import { NextResponse } from 'next/server';
import axios from 'axios';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get('symbol') || '').toUpperCase().trim();

  if (!symbol) {
    return NextResponse.json({ error: 'symbol is required' }, { status: 400 });
  }

  try {
    // Yahoo Finance: 1-min candles for today including pre + post market
    const { data } = await axios.get(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`,
      {
        params: {
          interval: '1m',
          range: '1d',
          includePrePost: true,
        },
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          Accept: 'application/json',
        },
        timeout: 10_000,
      }
    );

    const result = data?.chart?.result?.[0];
    if (!result) {
      return NextResponse.json({ error: 'No data returned for this symbol' }, { status: 404 });
    }

    const timestamps: number[] = result.timestamp || [];
    const quote = result.indicators?.quote?.[0] || {};
    const opens: number[] = quote.open || [];
    const highs: number[] = quote.high || [];
    const lows: number[] = quote.low || [];
    const closes: number[] = quote.close || [];
    const volumes: number[] = quote.volume || [];

    const meta = result.meta || {};
    const regularStart: number = meta.regularTradingPeriodStartTime || 0;
    const regularEnd: number = meta.regularTradingPeriodEndTime || 0;

    // Build candles, skip bars where all OHLC are null (market closed gaps)
    const candles = timestamps
      .map((t, i) => ({
        time: t,
        open: opens[i],
        high: highs[i],
        low: lows[i],
        close: closes[i],
        volume: volumes[i] || 0,
        session:
          t < regularStart ? 'pre' : t >= regularEnd ? 'post' : 'regular',
      }))
      .filter(
        (c) =>
          c.open != null &&
          c.high != null &&
          c.low != null &&
          c.close != null
      );

    return NextResponse.json({
      symbol,
      name: meta.longName || meta.shortName || symbol,
      currency: meta.currency || 'USD',
      currentPrice: meta.regularMarketPrice || closes[closes.length - 1] || 0,
      previousClose: meta.chartPreviousClose || meta.previousClose || 0,
      regularStart,
      regularEnd,
      candles,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch chart data';
    console.error(`[chart] ${symbol}:`, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
