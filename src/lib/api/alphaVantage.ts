import axios from 'axios';
import { Candle } from '@/types';

const BASE = 'https://www.alphavantage.co/query';
const KEY = process.env.NEXT_PUBLIC_ALPHA_KEY || process.env.ALPHA_KEY || 'demo';

const AV_FUNCTION_MAP: Record<string, string> = {
  '1m':  'TIME_SERIES_INTRADAY',
  '5m':  'TIME_SERIES_INTRADAY',
  '15m': 'TIME_SERIES_INTRADAY',
  '30m': 'TIME_SERIES_INTRADAY',
  '60m': 'TIME_SERIES_INTRADAY',
  '1h':  'TIME_SERIES_INTRADAY',
  '1D':  'TIME_SERIES_DAILY',
  '1W':  'TIME_SERIES_WEEKLY',
  '1M':  'TIME_SERIES_MONTHLY',
};

const AV_INTERVAL_MAP: Record<string, string> = {
  '1m': '1min', '5m': '5min', '15m': '15min', '30m': '30min', '1h': '60min',
};

export async function getCandles(symbol: string, timeframe: string): Promise<Candle[]> {
  const func = AV_FUNCTION_MAP[timeframe] || 'TIME_SERIES_DAILY';
  const interval = AV_INTERVAL_MAP[timeframe];

  try {
    const params: Record<string, string> = {
      function: func,
      symbol,
      apikey: KEY,
      outputsize: 'compact',
    };
    if (interval) params.interval = interval;

    const { data } = await axios.get(BASE, { params });

    // Find the time series key
    const tsKey = Object.keys(data).find((k) => k.includes('Time Series'));
    if (!tsKey || !data[tsKey]) return [];

    const series = data[tsKey] as Record<string, Record<string, string>>;
    return Object.entries(series)
      .map(([dateStr, bar]) => ({
        time: Math.floor(new Date(dateStr).getTime() / 1000),
        open: parseFloat(bar['1. open']),
        high: parseFloat(bar['2. high']),
        low: parseFloat(bar['3. low']),
        close: parseFloat(bar['4. close']),
        volume: parseFloat(bar['5. volume']),
      }))
      .sort((a, b) => a.time - b.time);
  } catch {
    return [];
  }
}

export async function getTopGainers(): Promise<Array<{ symbol: string; changePercent: string; price: string }>> {
  try {
    const { data } = await axios.get(BASE, {
      params: { function: 'TOP_GAINERS_LOSERS', apikey: KEY },
    });
    return data.top_gainers || [];
  } catch {
    return [];
  }
}
