'use client';

import { useState, useRef, useEffect, FormEvent } from 'react';
import dynamic from 'next/dynamic';
import axios from 'axios';

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

const REFRESH_INTERVAL = 10; // seconds

export default function Home() {
  const [ticker, setTicker]           = useState('');
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [data, setData]               = useState<ChartData | null>(null);
  const [activeSymbol, setActiveSymbol] = useState('');
  const [countdown, setCountdown]     = useState(REFRESH_INTERVAL);
  const [refreshing, setRefreshing]   = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Initial fetch ────────────────────────────────────────────────────────
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const sym = ticker.trim().toUpperCase();
    if (!sym) return;

    setLoading(true);
    setError(null);
    setData(null);
    setActiveSymbol('');

    try {
      const { data: res } = await axios.get(`/api/chart?symbol=${sym}`);
      setData(res);
      setActiveSymbol(sym);
      setCountdown(REFRESH_INTERVAL);
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err)
        ? err.response?.data?.error || err.message
        : 'Failed to load chart';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  // ── Auto-refresh every 10 s ──────────────────────────────────────────────
  useEffect(() => {
    if (!activeSymbol) return;

    // Countdown tick (every second)
    const tick = setInterval(() => {
      setCountdown((n) => (n <= 1 ? REFRESH_INTERVAL : n - 1));
    }, 1000);

    // Actual refresh every 10 s
    const refresh = setInterval(async () => {
      setRefreshing(true);
      setCountdown(REFRESH_INTERVAL);
      try {
        const { data: res } = await axios.get(`/api/chart?symbol=${activeSymbol}`);
        setData(res);
      } catch {
        // silent — keep showing last good data
      } finally {
        setRefreshing(false);
      }
    }, REFRESH_INTERVAL * 1000);

    return () => {
      clearInterval(tick);
      clearInterval(refresh);
    };
  }, [activeSymbol]);

  const change    = data ? data.currentPrice - data.previousClose : 0;
  const changePct = data?.previousClose ? (change / data.previousClose) * 100 : 0;
  const isUp      = change >= 0;

  const preCnt     = data?.candles.filter((c) => c.session === 'pre').length     ?? 0;
  const regularCnt = data?.candles.filter((c) => c.session === 'regular').length ?? 0;
  const postCnt    = data?.candles.filter((c) => c.session === 'post').length    ?? 0;

  return (
    <div className="flex flex-col h-screen bg-black text-white">

      {/* ── Header ── */}
      <header className="flex items-center gap-5 px-5 py-3 border-b border-[#111] shrink-0 overflow-x-auto">

        {/* Brand */}
        <span className="text-sm font-bold tracking-widest text-[#26a69a] shrink-0">NX-1</span>

        {/* Ticker form */}
        <form onSubmit={handleSubmit} className="flex items-center gap-2 shrink-0">
          <input
            ref={inputRef}
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder="Ticker…"
            maxLength={10}
            className="w-28 px-3 py-1.5 rounded bg-[#0a0a0a] border border-[#222] text-white text-sm placeholder-gray-700 focus:outline-none focus:border-[#26a69a]/50 font-mono uppercase"
          />
          <button
            type="submit"
            disabled={loading || !ticker.trim()}
            className="px-4 py-1.5 rounded bg-[#26a69a]/10 border border-[#26a69a]/20 text-[#26a69a] text-xs font-bold hover:bg-[#26a69a]/20 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {loading ? 'Loading…' : 'Chart'}
          </button>
        </form>

        {/* Price info */}
        {data && (
          <div className="flex items-center gap-3 shrink-0">
            <span className="font-bold text-white">{data.symbol}</span>
            <span className="text-gray-600 text-xs hidden sm:inline">{data.name}</span>
            <span className="font-mono font-bold text-white">${data.currentPrice.toFixed(2)}</span>
            <span className={`text-xs font-bold font-mono ${isUp ? 'text-[#26a69a]' : 'text-[#ef5350]'}`}>
              {isUp ? '+' : ''}{change.toFixed(2)} ({isUp ? '+' : ''}{changePct.toFixed(2)}%)
            </span>
          </div>
        )}

        {/* Session counts */}
        {data && (
          <div className="flex items-center gap-3 text-xs text-gray-600 shrink-0">
            {preCnt > 0     && <span>Pre <span className="text-gray-500">{preCnt}</span></span>}
            {regularCnt > 0 && <span>Reg <span className="text-gray-500">{regularCnt}</span></span>}
            {postCnt > 0    && <span>Post <span className="text-gray-500">{postCnt}</span></span>}
          </div>
        )}

        {/* Live / refresh indicator */}
        {activeSymbol && (
          <div className="ml-auto flex items-center gap-2 shrink-0">
            {refreshing ? (
              <span className="w-3 h-3 border border-[#26a69a]/40 border-t-[#26a69a] rounded-full animate-spin" />
            ) : (
              <span className="w-1.5 h-1.5 rounded-full bg-[#26a69a] animate-pulse" />
            )}
            <span className="text-xs text-gray-700 font-mono">{countdown}s</span>
          </div>
        )}
      </header>

      {/* ── Chart area ── */}
      <main className="flex-1 overflow-hidden relative">

        {/* Empty state */}
        {!loading && !data && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <p className="text-4xl font-black tracking-widest text-[#111]">NX-1</p>
            <p className="text-gray-700 text-sm">Enter a ticker to load the chart</p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex items-center gap-3 text-gray-500 text-sm">
              <span className="w-4 h-4 border-2 border-[#26a69a]/30 border-t-[#26a69a] rounded-full animate-spin" />
              Fetching {ticker}…
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center space-y-2">
              <p className="text-[#ef5350] text-sm font-medium">{error}</p>
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
