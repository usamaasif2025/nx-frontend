import { NextResponse } from 'next/server';
import axios from 'axios';

type TF = '1m' | '1h' | '1d' | '1w' | '1mo';

const TF_CONFIG: Record<TF, { interval: string; range: string; includePrePost: boolean }> = {
  '1m':  { interval: '1m',  range: '1d',  includePrePost: true  },
  '1h':  { interval: '1h',  range: '60d', includePrePost: true  },
  '1d':  { interval: '1d',  range: '1y',  includePrePost: false },
  '1w':  { interval: '1wk', range: '5y',  includePrePost: false },
  '1mo': { interval: '1mo', range: '10y', includePrePost: false },
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get('symbol') || '').toUpperCase().trim();
  const tf     = (searchParams.get('tf') || '1m') as TF;

  if (!symbol) {
    return NextResponse.json({ error: 'symbol is required' }, { status: 400 });
  }

  const config = TF_CONFIG[tf] ?? TF_CONFIG['1m'];

  try {
    const { data } = await axios.get(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`,
      {
        params: {
          interval:        config.interval,
          range:           config.range,
          includePrePost:  config.includePrePost,
        },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
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
    const quote    = result.indicators?.quote?.[0] || {};
    const opens:   number[] = quote.open   || [];
    const highs:   number[] = quote.high   || [];
    const lows:    number[] = quote.low    || [];
    const closes:  number[] = quote.close  || [];
    const volumes: number[] = quote.volume || [];

    const meta         = result.meta || {};
    const regularStart = config.includePrePost ? (meta.regularTradingPeriodStartTime || 0) : 0;
    const regularEnd   = config.includePrePost ? (meta.regularTradingPeriodEndTime   || 0) : 0;

    const candles = timestamps
      .map((t, i) => ({
        time:    t,
        open:    opens[i],
        high:    highs[i],
        low:     lows[i],
        close:   closes[i],
        volume:  volumes[i] || 0,
        session: !config.includePrePost
          ? 'regular'
          : t < regularStart ? 'pre' : t >= regularEnd ? 'post' : 'regular',
      }))
      .filter((c) => c.open != null && c.high != null && c.low != null && c.close != null);

    return NextResponse.json({
      symbol,
      name:             meta.longName || meta.shortName || symbol,
      currency:         meta.currency || 'USD',
      currentPrice:     meta.regularMarketPrice || closes[closes.length - 1] || 0,
      previousClose:    meta.chartPreviousClose  || meta.previousClose || 0,
      preMarketPrice:   meta.preMarketPrice  || 0,
      postMarketPrice:  meta.postMarketPrice || 0,
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
