'use client';

import { useState, useRef, FormEvent } from 'react';
import dynamic from 'next/dynamic';
import axios from 'axios';

// Chart must be client-only (uses DOM APIs)
const NxChart = dynamic(() => import('@/components/NxChart'), { ssr: false });

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  session: 'pre' | 'regular' | 'post';
}

interface ChartData {
  symbol: string;
  name: string;
  currentPrice: number;
  previousClose: number;
  regularStart: number;
  regularEnd: number;
  candles: Candle[];
}

function SessionDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-gray-500">
      <span className="w-2 h-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

export default function Home() {
  const [ticker, setTicker] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ChartData | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const sym = ticker.trim().toUpperCase();
    if (!sym) return;

    setLoading(true);
    setError(null);
    setData(null);

    try {
      const { data: res } = await axios.get(`/api/chart?symbol=${sym}`);
      setData(res);
    } catch (err: unknown) {
      const msg =
        axios.isAxiosError(err)
          ? err.response?.data?.error || err.message
          : 'Failed to load chart';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  const change = data
    ? data.currentPrice - data.previousClose
    : 0;
  const changePct = data && data.previousClose
    ? (change / data.previousClose) * 100
    : 0;
  const isUp = change >= 0;

  const preCandleCount = data?.candles.filter((c) => c.session === 'pre').length ?? 0;
  const regularCandleCount = data?.candles.filter((c) => c.session === 'regular').length ?? 0;
  const postCandleCount = data?.candles.filter((c) => c.session === 'post').length ?? 0;

  return (
    <div className="flex flex-col h-screen bg-black text-white">

      {/* ── Top bar ── */}
      <header className="flex items-center gap-6 px-5 py-3 border-b border-[#111] shrink-0">
        {/* Brand */}
        <span className="text-sm font-bold tracking-widest text-cyan-400">NX-1</span>

        {/* Ticker input */}
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder="Enter ticker…"
            maxLength={10}
            className="w-36 px-3 py-1.5 rounded bg-[#0a0a0a] border border-[#222] text-white text-sm placeholder-gray-700 focus:outline-none focus:border-cyan-400/50 font-mono uppercase"
          />
          <button
            type="submit"
            disabled={loading || !ticker.trim()}
            className="px-4 py-1.5 rounded bg-cyan-400/10 border border-cyan-400/20 text-cyan-400 text-xs font-bold hover:bg-cyan-400/20 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {loading ? 'Loading…' : 'Chart'}
          </button>
        </form>

        {/* Symbol info */}
        {data && (
          <div className="flex items-center gap-4">
            <div>
              <span className="font-bold text-white mr-2">{data.symbol}</span>
              <span className="text-gray-500 text-xs">{data.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-white">
                ${data.currentPrice.toFixed(2)}
              </span>
              <span
                className={`text-xs font-bold font-mono ${isUp ? 'text-cyan-400' : 'text-orange-400'}`}
              >
                {isUp ? '+' : ''}{change.toFixed(2)} ({isUp ? '+' : ''}{changePct.toFixed(2)}%)
              </span>
            </div>
          </div>
        )}

        {/* Session legend */}
        {data && (
          <div className="ml-auto flex items-center gap-4">
            {preCandleCount > 0 && <SessionDot color="#7c3aed" label={`Pre (${preCandleCount} bars)`} />}
            {regularCandleCount > 0 && <SessionDot color="#00e5ff" label={`Regular (${regularCandleCount} bars)`} />}
            {postCandleCount > 0 && <SessionDot color="#d97706" label={`Post (${postCandleCount} bars)`} />}
          </div>
        )}
      </header>

      {/* ── Chart area ── */}
      <main className="flex-1 overflow-hidden relative">

        {/* Empty state */}
        {!loading && !data && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
            <p className="text-4xl font-black tracking-widest text-[#111]">NX-1</p>
            <p className="text-gray-700 text-sm">Enter a ticker above to load the chart</p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex items-center gap-3 text-gray-500 text-sm">
              <span className="w-4 h-4 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
              Fetching {ticker}…
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center space-y-2">
              <p className="text-orange-400 text-sm font-medium">{error}</p>
              <p className="text-gray-700 text-xs">Check the ticker and try again</p>
            </div>
          </div>
        )}

        {/* Chart */}
        {data && data.candles.length > 0 && (
          <NxChart
            candles={data.candles}
            regularStart={data.regularStart}
            regularEnd={data.regularEnd}
          />
        )}
      </main>

    </div>
  );
}
