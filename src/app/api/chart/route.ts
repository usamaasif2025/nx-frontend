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

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  Accept: 'application/json',
};

// ── Level helpers ──────────────────────────────────────────────────────────

interface Bar { time: number; high: number; }

/** Midnight UTC timestamp for the day a unix-second timestamp falls on */
function dayUTC(ts: number) {
  const d = new Date(ts * 1000);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Midnight UTC of the Monday of the week containing nowMs */
function weekStartUTC(nowMs: number) {
  const d = new Date(nowMs);
  const dow = d.getUTCDay(); // 0=Sun … 6=Sat
  const toMon = dow === 0 ? 6 : dow - 1;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - toMon);
}

function computeLevels(bars: Bar[]) {
  const now       = Date.now();
  const todayUTC  = dayUTC(Math.floor(now / 1000));

  // ── Previous trading day ────────────────────────────────────────────────
  // Last bar whose date is strictly before today
  const prevDayBars = bars.filter(b => dayUTC(b.time) < todayUTC);
  const lastDayHigh = prevDayBars.length
    ? prevDayBars[prevDayBars.length - 1].high
    : 0;

  // ── Previous calendar week (Mon–Sun) ────────────────────────────────────
  const thisWeekStart = weekStartUTC(now);
  const prevWeekStart = thisWeekStart - 7 * 86_400_000;
  const prevWeekBars  = bars.filter(b => {
    const d = dayUTC(b.time);
    return d >= prevWeekStart && d < thisWeekStart;
  });
  const lastWeekHigh  = prevWeekBars.length
    ? Math.max(...prevWeekBars.map(b => b.high))
    : 0;

  // ── Previous calendar month ─────────────────────────────────────────────
  const nowD           = new Date(now);
  const thisMonthStart = Date.UTC(nowD.getUTCFullYear(), nowD.getUTCMonth(), 1);
  const prevMonthStart = Date.UTC(
    nowD.getUTCMonth() === 0 ? nowD.getUTCFullYear() - 1 : nowD.getUTCFullYear(),
    nowD.getUTCMonth() === 0 ? 11 : nowD.getUTCMonth() - 1,
    1,
  );
  const prevMonthBars = bars.filter(b => {
    const d = dayUTC(b.time);
    return d >= prevMonthStart && d < thisMonthStart;
  });
  const lastMonthHigh = prevMonthBars.length
    ? Math.max(...prevMonthBars.map(b => b.high))
    : 0;

  return { lastDayHigh, lastWeekHigh, lastMonthHigh };
}

// ── Route ──────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get('symbol') || '').toUpperCase().trim();
  const tf     = (searchParams.get('tf') || '1m') as TF;

  if (!symbol) {
    return NextResponse.json({ error: 'symbol is required' }, { status: 400 });
  }

  const config = TF_CONFIG[tf] ?? TF_CONFIG['1m'];

  try {
    // Three parallel requests:
    //   1. chart data (candles for chosen timeframe)
    //   2. real-time quote (reliable pre/post market prices)
    //   3. 3-month daily bars (for D-High / W-High / M-High levels)
    const [chartRes, quoteRes, levelsRes] = await Promise.allSettled([
      axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`, {
        params:  { interval: config.interval, range: config.range, includePrePost: config.includePrePost },
        headers: HEADERS,
        timeout: 10_000,
      }),
      axios.get('https://query1.finance.yahoo.com/v7/finance/quote', {
        params:  { symbols: symbol },
        headers: HEADERS,
        timeout: 10_000,
      }),
      axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`, {
        params:  { interval: '1d', range: '3mo' },
        headers: HEADERS,
        timeout: 10_000,
      }),
    ]);

    if (chartRes.status === 'rejected') {
      throw new Error(chartRes.reason?.message || 'Chart request failed');
    }

    const result = chartRes.value.data?.chart?.result?.[0];
    if (!result) {
      return NextResponse.json({ error: 'No data returned for this symbol' }, { status: 404 });
    }

    // Real-time quote — graceful fallback
    const liveQuote = quoteRes.status === 'fulfilled'
      ? (quoteRes.value.data?.quoteResponse?.result?.[0] ?? {})
      : {};

    // Level computation from 3-month daily bars — graceful fallback
    let lastDayHigh = 0, lastWeekHigh = 0, lastMonthHigh = 0;
    if (levelsRes.status === 'fulfilled') {
      const lvlResult = levelsRes.value.data?.chart?.result?.[0];
      if (lvlResult) {
        const lvlTs: number[]   = lvlResult.timestamp || [];
        const lvlHigh: number[] = lvlResult.indicators?.quote?.[0]?.high || [];
        const bars: Bar[] = lvlTs
          .map((t, i) => ({ time: t, high: lvlHigh[i] }))
          .filter(b => b.high != null);
        ({ lastDayHigh, lastWeekHigh, lastMonthHigh } = computeLevels(bars));
      }
    }

    // Main candles
    const timestamps: number[] = result.timestamp || [];
    const ohlcv      = result.indicators?.quote?.[0] || {};
    const opens:   number[] = ohlcv.open   || [];
    const highs:   number[] = ohlcv.high   || [];
    const lows:    number[] = ohlcv.low    || [];
    const closes:  number[] = ohlcv.close  || [];
    const volumes: number[] = ohlcv.volume || [];

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
      .filter(c => c.open != null && c.high != null && c.low != null && c.close != null);

    const currentPrice    = liveQuote.regularMarketPrice        || meta.regularMarketPrice   || closes[closes.length - 1] || 0;
    const previousClose   = liveQuote.regularMarketPreviousClose || meta.chartPreviousClose  || meta.previousClose        || 0;
    const preMarketPrice  = liveQuote.preMarketPrice             || meta.preMarketPrice       || 0;
    const postMarketPrice = liveQuote.postMarketPrice            || meta.postMarketPrice      || 0;
    const bid             = liveQuote.bid  || 0;
    const ask             = liveQuote.ask  || 0;
    const bidSize         = liveQuote.bidSize || 0;
    const askSize         = liveQuote.askSize || 0;

    return NextResponse.json({
      symbol,
      name:           meta.longName || meta.shortName || symbol,
      currency:       meta.currency || 'USD',
      currentPrice,
      previousClose,
      preMarketPrice,
      postMarketPrice,
      bid,
      ask,
      bidSize,
      askSize,
      lastDayHigh,
      lastWeekHigh,
      lastMonthHigh,
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
