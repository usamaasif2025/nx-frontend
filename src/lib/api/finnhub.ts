import axios from 'axios';
import { Candle, NewsItem, NewsImpact } from '@/types';

const BASE = 'https://finnhub.io/api/v1';
const KEY = process.env.NEXT_PUBLIC_FINNHUB_KEY || process.env.FINNHUB_KEY || '';

const client = axios.create({ baseURL: BASE, params: { token: KEY } });

// ─── Quote ────────────────────────────────────────────────────────────────────

export interface FinnhubQuote {
  c: number;  // current price
  d: number;  // change
  dp: number; // change percent
  h: number;  // high
  l: number;  // low
  o: number;  // open
  pc: number; // prev close
  t: number;  // timestamp
}

export async function getQuote(symbol: string): Promise<FinnhubQuote | null> {
  try {
    const { data } = await client.get<FinnhubQuote>('/quote', { params: { symbol } });
    return data;
  } catch {
    return null;
  }
}

export async function getBatchQuotes(symbols: string[]): Promise<Record<string, FinnhubQuote>> {
  const results = await Promise.allSettled(symbols.map((s) => getQuote(s)));
  const out: Record<string, FinnhubQuote> = {};
  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value) out[symbols[i]] = r.value;
  });
  return out;
}

// ─── Candles ──────────────────────────────────────────────────────────────────

const RESOLUTION_MAP: Record<string, string> = {
  '1m': '1', '5m': '5', '15m': '15', '30m': '30', '1h': '60', '4h': '240', '1D': 'D', '1W': 'W', '1M': 'M',
};

export async function getCandles(
  symbol: string,
  timeframe: string,
  from: number,
  to: number
): Promise<Candle[]> {
  try {
    const resolution = RESOLUTION_MAP[timeframe] || '1';
    const { data } = await client.get('/stock/candle', {
      params: { symbol, resolution, from, to },
    });

    if (data.s !== 'ok' || !data.t) return [];

    return data.t.map((t: number, i: number) => ({
      time: t,
      open: data.o[i],
      high: data.h[i],
      low: data.l[i],
      close: data.c[i],
      volume: data.v[i],
    }));
  } catch {
    return [];
  }
}

// ─── News ─────────────────────────────────────────────────────────────────────

interface FinnhubNews {
  id: number;
  headline: string;
  summary: string;
  source: string;
  url: string;
  datetime: number;
  related: string;
}

function scoreNews(headline: string, summary: string): { impact: NewsImpact; score: number } {
  const text = (headline + ' ' + summary).toLowerCase();

  const bullish = ['beat', 'record', 'surge', 'jump', 'soar', 'upgrade', 'buy', 'bullish',
    'revenue growth', 'profit', 'exceed', 'acquisition', 'partnership', 'approval', 'launch'];
  const bearish = ['miss', 'cut', 'downgrade', 'sell', 'bearish', 'loss', 'decline', 'fall',
    'investigation', 'lawsuit', 'recall', 'bankruptcy', 'layoff', 'warning', 'concern'];

  let score = 0;
  bullish.forEach((kw) => { if (text.includes(kw)) score += 1.5; });
  bearish.forEach((kw) => { if (text.includes(kw)) score -= 1.5; });

  score = Math.max(-10, Math.min(10, score));

  let impact: NewsImpact;
  if (score >= 6) impact = 'high_bullish';
  else if (score >= 3) impact = 'medium_bullish';
  else if (score >= 1) impact = 'low_bullish';
  else if (score <= -6) impact = 'high_bearish';
  else if (score <= -3) impact = 'medium_bearish';
  else if (score <= -1) impact = 'low_bearish';
  else impact = 'neutral';

  return { impact, score };
}

export async function getNews(symbol: string): Promise<NewsItem[]> {
  try {
    const { data } = await client.get<FinnhubNews[]>('/company-news', {
      params: {
        symbol,
        from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        to: new Date().toISOString().split('T')[0],
      },
    });

    return data.slice(0, 20).map((n) => {
      const { impact, score } = scoreNews(n.headline, n.summary);
      return {
        id: String(n.id),
        symbol,
        headline: n.headline,
        summary: n.summary || '',
        source: n.source,
        url: n.url,
        publishedAt: n.datetime,
        impact,
        impactScore: score,
        sentiment: score / 10,
        keywords: [],
        addToWatchlist: score >= 3,
        removeFromWatchlist: score <= -3,
      };
    });
  } catch {
    return [];
  }
}

// ─── WebSocket ────────────────────────────────────────────────────────────────

export function createFinnhubWebSocket(
  symbols: string[],
  onTrade: (symbol: string, price: number, volume: number, timestamp: number) => void
): WebSocket | null {
  if (typeof window === 'undefined') return null;
  const ws = new WebSocket(`wss://ws.finnhub.io?token=${KEY}`);

  ws.onopen = () => {
    symbols.forEach((s) => ws.send(JSON.stringify({ type: 'subscribe', symbol: s })));
  };

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'trade' && msg.data) {
      msg.data.forEach((t: { s: string; p: number; v: number; t: number }) => {
        onTrade(t.s, t.p, t.v, t.t);
      });
    }
  };

  ws.onerror = () => {};

  return ws;
}
