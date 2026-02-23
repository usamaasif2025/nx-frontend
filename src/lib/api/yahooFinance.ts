import axios from 'axios';
import { StockQuote, MarketSession } from '@/types';

// Curated watchlist of high-volume stocks that commonly move in pre/post market
export const WATCHLIST = [
  // Mega-cap tech
  'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'GOOG', 'META', 'TSLA', 'AVGO', 'AMD',
  'NFLX', 'INTC', 'QCOM', 'CRM', 'ORCL', 'ADBE', 'MU', 'AMAT', 'LRCX', 'SMCI',
  // Leveraged ETFs & volatility
  'SPY', 'QQQ', 'IWM', 'SOXS', 'SOXL', 'TQQQ', 'SPXL', 'UVXY', 'SQQQ', 'SPXS',
  // Financials
  'JPM', 'BAC', 'GS', 'MS', 'WFC', 'C', 'V', 'MA', 'PYPL', 'SQ',
  // Energy
  'XOM', 'CVX', 'OXY', 'HAL', 'SLB',
  // Biotech / pharma (frequent extended-hours movers on trial/FDA data)
  'MRNA', 'BNTX', 'NVAX', 'BIIB', 'GILD', 'AMGN', 'REGN', 'VRTX', 'SRPT', 'SGEN',
  // Consumer / retail
  'COST', 'WMT', 'TGT', 'HD', 'SBUX', 'MCD', 'NKE',
  // High-volatility / retail favourites
  'PLTR', 'RIVN', 'LCID', 'HOOD', 'SOFI', 'UPST', 'AFRM', 'COIN',
  'MARA', 'RIOT', 'CLSK', 'HUT', 'GME', 'AMC', 'BB', 'DJT',
];

interface YahooQuote {
  symbol: string;
  shortName?: string;
  longName?: string;
  regularMarketPrice: number;
  regularMarketPreviousClose: number;
  regularMarketVolume: number;
  regularMarketDayHigh: number;
  regularMarketDayLow: number;
  regularMarketOpen: number;
  averageDailyVolume3Month?: number;
  // Pre-market fields
  preMarketPrice?: number;
  preMarketChange?: number;
  preMarketChangePercent?: number;
  // Post-market fields
  postMarketPrice?: number;
  postMarketChange?: number;
  postMarketChangePercent?: number;
}

const YF_BASE = 'https://query1.finance.yahoo.com/v7/finance/quote';
const CHUNK = 40; // Yahoo handles up to ~50 symbols per request reliably

async function fetchChunk(symbols: string[]): Promise<YahooQuote[]> {
  try {
    const { data } = await axios.get(YF_BASE, {
      params: { symbols: symbols.join(',') },
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 10_000,
    });
    return (data?.quoteResponse?.result as YahooQuote[]) || [];
  } catch {
    return [];
  }
}

/**
 * Scans the watchlist via Yahoo Finance and returns extended-hours movers.
 * session='pre'  → uses preMarketPrice / preMarketChangePercent
 * session='post' → uses postMarketPrice / postMarketChangePercent
 */
export async function getExtendedHoursMovers(
  session: 'pre' | 'post',
  minChangePct: number
): Promise<StockQuote[]> {
  const results: StockQuote[] = [];

  // Fetch in chunks so we stay well under Yahoo's URL-length limits
  for (let i = 0; i < WATCHLIST.length; i += CHUNK) {
    const quotes = await fetchChunk(WATCHLIST.slice(i, i + CHUNK));

    for (const q of quotes) {
      const price =
        session === 'pre' ? q.preMarketPrice : q.postMarketPrice;
      const changePct =
        session === 'pre'
          ? q.preMarketChangePercent
          : q.postMarketChangePercent;
      const change =
        session === 'pre' ? q.preMarketChange : q.postMarketChange;

      if (!price || changePct == null || Math.abs(changePct) < minChangePct) continue;

      const prevClose = q.regularMarketPreviousClose || 0;
      const avgVol = q.averageDailyVolume3Month || q.regularMarketVolume || 0;

      results.push({
        symbol: q.symbol,
        name: q.shortName || q.longName || q.symbol,
        price,
        change: change ?? price - prevClose,
        changePercent: changePct,
        volume: q.regularMarketVolume || 0,
        avgVolume: avgVol,
        volumeRatio: avgVol > 0 ? (q.regularMarketVolume || 0) / avgVol : 1,
        high: q.regularMarketDayHigh || price,
        low: q.regularMarketDayLow || price,
        open: q.regularMarketOpen || price,
        prevClose,
        session: session as MarketSession,
        timestamp: Date.now(),
        triggered: Math.abs(changePct) >= minChangePct,
      });
    }
  }

  return results.sort(
    (a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent)
  );
}
