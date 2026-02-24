'use client';

import { useState, useRef, useEffect, useCallback, FormEvent } from 'react';
import dynamic from 'next/dynamic';
import axios from 'axios';

const NxChart    = dynamic(() => import('@/components/NxChart'),  { ssr: false });
const NewsPanel  = dynamic(() => import('@/components/NewsPanel'), { ssr: false });

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
  preMarketPrice: number;
  postMarketPrice: number;
  bid: number;
  ask: number;
  bidSize: number;
  askSize: number;
  lastDayHigh: number;
  lastWeekHigh: number;
  lastMonthHigh: number;
  regularStart: number;
  regularEnd: number;
  candles: Candle[];
}

type TF = '1m' | '1h' | '1d' | '1w' | '1mo';

const TIMEFRAMES: { label: string; value: TF }[] = [
  { label: '1M',  value: '1m'  },
  { label: '1H',  value: '1h'  },
  { label: '1D',  value: '1d'  },
  { label: '1W',  value: '1w'  },
  { label: 'MO',  value: '1mo' },
];

// Only intraday timeframes get live auto-refresh
const INTRADAY: TF[] = ['1m', '1h'];
const REFRESH_SEC = 10;

export default function Home() {
  const [ticker, setTicker]         = useState('');
  const [tf, setTf]                 = useState<TF>('1m');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [data, setData]             = useState<ChartData | null>(null);
  const [activeSymbol, setActiveSymbol] = useState('');
  const [activeTf, setActiveTf]     = useState<TF>('1m');
  const [countdown, setCountdown]   = useState(REFRESH_SEC);
  const [refreshing, setRefreshing] = useState(false);
  const [briefing, setBriefing]     = useState(false);
  const [briefSent, setBriefSent]   = useState(false);
  const [briefError, setBriefError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Shared fetch ─────────────────────────────────────────────────────────
  const fetchChart = useCallback(async (
    sym: string,
    timeframe: TF,
    silent = false,
  ): Promise<ChartData | null> => {
    if (!silent) {
      setLoading(true);
      setError(null);
      setData(null);
    } else {
      setRefreshing(true);
    }
    try {
      const { data: res } = await axios.get<ChartData>(`/api/chart?symbol=${sym}&tf=${timeframe}`);
      setData(res);
      return res;
    } catch (err: unknown) {
      if (!silent) {
        const msg = axios.isAxiosError(err)
          ? err.response?.data?.error || err.message
          : 'Failed to load chart';
        setError(msg);
      }
      return null;
    } finally {
      if (!silent) setLoading(false);
      else setRefreshing(false);
    }
  }, []);

  // ── Deep-link: auto-load from URL on first mount ─────────────────────────
  useEffect(() => {
    const params   = new URLSearchParams(window.location.search);
    const sym      = params.get('symbol')?.toUpperCase();
    const tfParam  = (params.get('tf') as TF) || '1m';
    if (!sym) return;

    setTicker(sym);
    setTf(tfParam);

    fetchChart(sym, tfParam).then((res) => {
      if (res) {
        setActiveSymbol(sym);
        setActiveTf(tfParam);
        setCountdown(REFRESH_SEC);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fire chart-open Telegram alert (fire-and-forget) ─────────────────────
  function fireChartAlert(res: ChartData, sym: string, timeframe: TF) {
    const chartUrl = `${window.location.origin}/?symbol=${sym}&tf=1m`;
    const change   = res.currentPrice - res.previousClose;
    const pct      = res.previousClose
      ? (change / res.previousClose) * 100
      : 0;

    axios
      .post('/api/telegram/chart-alert', {
        symbol: sym,
        name:   res.name,
        price:  res.currentPrice,
        change,
        pct,
        tf: timeframe,
        chartUrl,
      })
      .then((r) => { if (!r.data?.ok) console.error('[chart-alert] API error:', r.data); })
      .catch((e) => console.error('[chart-alert] request failed:', e?.response?.data || e?.message));
  }

  // ── Form submit ──────────────────────────────────────────────────────────
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const sym = ticker.trim().toUpperCase();
    if (!sym) return;

    const res = await fetchChart(sym, tf);
    if (res) {
      setActiveSymbol(sym);
      setActiveTf(tf);
      setCountdown(REFRESH_SEC);
      // Update URL for deep-linking
      const params = new URLSearchParams({ symbol: sym, tf });
      window.history.pushState({}, '', `/?${params}`);
      // Alert Telegram
      fireChartAlert(res, sym, tf);
    }
  }

  // ── Timeframe change while a symbol is already loaded ───────────────────
  async function handleTfChange(next: TF) {
    setTf(next);
    if (!activeSymbol) return;
    const res = await fetchChart(activeSymbol, next);
    if (res) {
      setActiveTf(next);
      setCountdown(REFRESH_SEC);
      // Keep URL in sync with new TF
      const params = new URLSearchParams({ symbol: activeSymbol, tf: next });
      window.history.pushState({}, '', `/?${params}`);
    }
  }

  // ── Catalyst brief (manual, great for closed market) ────────────────────
  async function handleBrief() {
    const sym = ticker.trim().toUpperCase() || activeSymbol;
    if (!sym) return;

    setBriefing(true);
    const chartUrl = `${window.location.origin}/?symbol=${sym}&tf=1m`;

    try {
      const res = await axios.post('/api/telegram/catalyst-brief', {
        symbol: sym,
        chartUrl,
        // Pass live price/name from current chart if already loaded for same symbol
        ...(data && data.symbol === sym
          ? { price: data.currentPrice, name: data.name }
          : {}),
      });
      if (res.data?.ok) {
        setBriefSent(true);
        setTimeout(() => setBriefSent(false), 3000);
      } else {
        throw new Error(res.data?.error || 'Unknown error');
      }
    } catch (err: any) {
      const detail = err?.response?.data?.error || err?.message || String(err);
      console.error('[brief] ERROR:', detail);
      setBriefError(true);
      setTimeout(() => setBriefError(false), 4000);
    } finally {
      setBriefing(false);
    }
  }

  // ── Auto-refresh (intraday only) ─────────────────────────────────────────
  useEffect(() => {
    if (!activeSymbol || !INTRADAY.includes(activeTf)) return;

    const tick = setInterval(() => {
      setCountdown((n) => (n <= 1 ? REFRESH_SEC : n - 1));
    }, 1000);

    const refresh = setInterval(() => {
      setCountdown(REFRESH_SEC);
      fetchChart(activeSymbol, activeTf, true);
    }, REFRESH_SEC * 1000);

    return () => {
      clearInterval(tick);
      clearInterval(refresh);
    };
  }, [activeSymbol, activeTf, fetchChart]);

  const change    = data ? data.currentPrice - data.previousClose : 0;
  const changePct = data?.previousClose ? (change / data.previousClose) * 100 : 0;
  const isUp      = change >= 0;
  const isLive    = activeSymbol && INTRADAY.includes(activeTf);

  const preCnt     = data?.candles.filter((c) => c.session === 'pre').length     ?? 0;
  const regularCnt = data?.candles.filter((c) => c.session === 'regular').length ?? 0;
  const postCnt    = data?.candles.filter((c) => c.session === 'post').length    ?? 0;

  const briefSymbol = ticker.trim().toUpperCase() || activeSymbol;

  return (
    <div className="flex flex-col h-screen bg-black text-white">

      {/* ── Header ── */}
      <header className="flex items-center gap-4 px-5 py-3 border-b border-[#111] shrink-0">

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

          {/* Catalyst Brief button */}
          <button
            type="button"
            onClick={handleBrief}
            disabled={briefing || !briefSymbol}
            title="Send today's catalyst news to Telegram"
            className={`px-3 py-1.5 rounded border text-xs font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
              briefError
                ? 'bg-[#ef5350]/10 border-[#ef5350]/40 text-[#ef5350]'
                : briefSent
                  ? 'bg-[#26a69a]/20 border-[#26a69a]/40 text-[#26a69a]'
                  : 'bg-[#1a1a2e]/60 border-[#3a3a5c]/40 text-[#7b7bff] hover:bg-[#1a1a2e] hover:border-[#5a5aaf]/60'
            }`}
          >
            {briefing ? '…' : briefError ? 'Error ✗' : briefSent ? 'Sent ✓' : 'Brief'}
          </button>
        </form>

        {/* Timeframe selector */}
        <div className="flex items-center gap-1 shrink-0">
          {TIMEFRAMES.map((t) => (
            <button
              key={t.value}
              onClick={() => handleTfChange(t.value)}
              className={`px-2.5 py-1 rounded text-xs font-bold transition-all ${
                tf === t.value
                  ? 'bg-[#26a69a]/20 text-[#26a69a] border border-[#26a69a]/30'
                  : 'text-gray-600 hover:text-gray-400 border border-transparent'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Price info */}
        {data && (
          <div className="flex items-center gap-3 shrink-0">
            <span className="font-bold text-white">{data.symbol}</span>
            <span className="text-gray-600 text-xs hidden md:inline">{data.name}</span>
            <span className="font-mono font-bold text-white">${data.currentPrice.toFixed(2)}</span>
            <span className={`text-xs font-bold font-mono ${isUp ? 'text-[#26a69a]' : 'text-[#ef5350]'}`}>
              {isUp ? '+' : ''}{change.toFixed(2)} ({isUp ? '+' : ''}{changePct.toFixed(2)}%)
            </span>
          </div>
        )}

        {/* Bid / Ask (intraday only) */}
        {data && INTRADAY.includes(activeTf) && data.bid > 0 && data.ask > 0 && (
          <div className="flex items-center gap-3 shrink-0 border-l border-[#1a1a1a] pl-3">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-gray-600 uppercase tracking-wider">Bid</span>
              <span className="font-mono text-sm font-bold text-[#26a69a]">{data.bid.toFixed(2)}</span>
              {data.bidSize > 0 && (
                <span className="text-[10px] text-gray-700">×{data.bidSize}</span>
              )}
            </div>
            <div className="w-px h-3 bg-[#222]" />
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-gray-600 uppercase tracking-wider">Ask</span>
              <span className="font-mono text-sm font-bold text-[#ef5350]">{data.ask.toFixed(2)}</span>
              {data.askSize > 0 && (
                <span className="text-[10px] text-gray-700">×{data.askSize}</span>
              )}
            </div>
            <div className="w-px h-3 bg-[#222]" />
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-gray-600">Spread</span>
              <span className="font-mono text-[11px] text-gray-500">
                {(data.ask - data.bid).toFixed(2)}
              </span>
            </div>
          </div>
        )}

        {/* Session counts (intraday only) */}
        {data && INTRADAY.includes(activeTf) && (
          <div className="flex items-center gap-3 text-xs text-gray-600 shrink-0">
            {preCnt > 0     && <span>Pre <span className="text-gray-500">{preCnt}</span></span>}
            {regularCnt > 0 && <span>Reg <span className="text-gray-500">{regularCnt}</span></span>}
            {postCnt > 0    && <span>Post <span className="text-gray-500">{postCnt}</span></span>}
          </div>
        )}

        {/* Live indicator */}
        {isLive && (
          <div className="ml-auto flex items-center gap-2 shrink-0">
            {refreshing
              ? <span className="w-3 h-3 border border-[#26a69a]/40 border-t-[#26a69a] rounded-full animate-spin" />
              : <span className="w-1.5 h-1.5 rounded-full bg-[#26a69a] animate-pulse" />
            }
            <span className="text-xs text-gray-700 font-mono">{countdown}s</span>
          </div>
        )}
      </header>

      {/* ── Chart + News ── */}
      <main className="flex-1 overflow-hidden flex">

        {/* Chart column */}
        <div className="flex-1 overflow-hidden relative">

          {!loading && !data && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <p className="text-4xl font-black tracking-widest text-[#111]">NX-1</p>
              <p className="text-gray-700 text-sm">Enter a ticker to load the chart</p>
            </div>
          )}

          {loading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex items-center gap-3 text-gray-500 text-sm">
                <span className="w-4 h-4 border-2 border-[#26a69a]/30 border-t-[#26a69a] rounded-full animate-spin" />
                Fetching {ticker} {TIMEFRAMES.find((t) => t.value === tf)?.label}…
              </div>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center space-y-2">
                <p className="text-[#ef5350] text-sm font-medium">{error}</p>
                <p className="text-gray-700 text-xs">Check the ticker and try again</p>
              </div>
            </div>
          )}

          {data && data.candles.length > 0 && (
            <NxChart
              candles={data.candles}
              regularStart={data.regularStart}
              regularEnd={data.regularEnd}
              closePrice={!INTRADAY.includes(activeTf) ? data.currentPrice : 0}
              preMarketPrice={!INTRADAY.includes(activeTf) ? data.preMarketPrice : 0}
              postMarketPrice={!INTRADAY.includes(activeTf) ? data.postMarketPrice : 0}
              lastDayHigh={data.lastDayHigh}
              lastWeekHigh={data.lastWeekHigh}
              lastMonthHigh={data.lastMonthHigh}
            />
          )}
        </div>

        {/* News sidebar — only when a symbol is loaded */}
        {data && <NewsPanel symbol={data.symbol} />}

      </main>

    </div>
  );
}
