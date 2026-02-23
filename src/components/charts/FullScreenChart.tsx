'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Timeframe, Candle, SupportResistanceLevel } from '@/types';
import axios from 'axios';
import { RefreshCw, TrendingUp, TrendingDown, Wifi } from 'lucide-react';

const CHART_TIMEFRAMES: { label: string; value: Timeframe }[] = [
  { label: '1m',  value: '1m' },
  { label: '5m',  value: '5m' },
  { label: '15m', value: '15m' },
  { label: '1h',  value: '1h' },
  { label: '4h',  value: '4h' },
  { label: 'D',   value: '1D' },
  { label: 'W',   value: '1W' },
  { label: 'M',   value: '1M' },
];

interface ChartData {
  candles: Candle[];
  levels: SupportResistanceLevel[];
}

interface CandleInfo {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time: number;
}

interface LiveQuote {
  c: number;   // current price
  d: number;   // change
  dp: number;  // change percent
  h: number;   // day high
  l: number;   // day low
  o: number;   // open
  pc: number;  // prev close
}

export default function FullScreenChart({ symbol }: { symbol: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<unknown>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>('1D');
  const [data, setData] = useState<ChartData | null>(null);
  const [loading, setLoading] = useState(false);
  const [hovered, setHovered] = useState<CandleInfo | null>(null);
  const [quote, setQuote] = useState<LiveQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchCandles = useCallback(async (tf: Timeframe) => {
    setLoading(true);
    setError(null);
    try {
      const { data: res } = await axios.get(`/api/candles?symbol=${symbol}&timeframe=${tf}`);
      if (res.candles && res.candles.length > 0) {
        setData({ candles: res.candles, levels: res.levels || [] });
      } else {
        setError(`No chart data found for "${symbol}"`);
        setData(null);
      }
    } catch {
      setError('Failed to load chart data. Check the symbol and try again.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  const fetchQuote = useCallback(async () => {
    try {
      const { data: q } = await axios.get(`/api/quote?symbol=${symbol}`);
      setQuote(q);
      setLastUpdate(new Date());
    } catch {
      // silent — quote failure shouldn't break the chart
    }
  }, [symbol]);

  // Fetch candles whenever timeframe or symbol changes
  useEffect(() => {
    setData(null);
    fetchCandles(timeframe);
  }, [timeframe, fetchCandles]);

  // Fetch live quote every 10 seconds
  useEffect(() => {
    setQuote(null);
    fetchQuote();
    const interval = setInterval(fetchQuote, 10_000);
    return () => clearInterval(interval);
  }, [fetchQuote]);

  // Build/rebuild chart whenever data changes
  useEffect(() => {
    if (!data || !containerRef.current || typeof window === 'undefined') return;

    let roDisconnect: (() => void) | undefined;

    import('lightweight-charts').then(({ createChart, CrosshairMode }) => {
      if (!containerRef.current) return;

      // Destroy previous chart
      if (chartRef.current) {
        (chartRef.current as { remove: () => void }).remove();
        chartRef.current = null;
      }

      const chart = createChart(containerRef.current, {
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
        layout: {
          background: { color: '#000000' },
          textColor: '#888888',
        },
        grid: {
          vertLines: { color: '#0d0d0d' },
          horzLines: { color: '#0d0d0d' },
        },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderColor: '#1a1a1a' },
        timeScale: {
          borderColor: '#1a1a1a',
          timeVisible: true,
          secondsVisible: false,
        },
      });

      chartRef.current = chart;

      const typedChart = chart as {
        addCandlestickSeries: (opts: unknown) => unknown;
        addLineSeries: (opts: unknown) => unknown;
        subscribeCrosshairMove: (cb: (p: unknown) => void) => void;
        timeScale: () => { fitContent: () => void };
        applyOptions: (opts: unknown) => void;
      };

      const candleSeries = typedChart.addCandlestickSeries({
        upColor:        '#00ffff',
        downColor:      '#ff6b00',
        borderUpColor:  '#00ffff',
        borderDownColor:'#ff6b00',
        wickUpColor:    '#00ffff',
        wickDownColor:  '#ff6b00',
      });

      const formatted = data.candles
        .filter((c) => c.time && c.open && c.high && c.low && c.close)
        .map((c) => ({ time: c.time as unknown, open: c.open, high: c.high, low: c.low, close: c.close }));

      (candleSeries as { setData: (d: unknown) => void }).setData(formatted);

      // Draw S/R level lines
      data.levels.slice(0, 8).forEach((level) => {
        const line = typedChart.addLineSeries({
          color: level.type === 'resistance'
            ? 'rgba(255, 107, 0, 0.5)'
            : 'rgba(0, 255, 255, 0.5)',
          lineWidth: 1,
          lineStyle: 2, // dashed
          priceLineVisible: false,
          lastValueVisible: false,
        });
        if (formatted.length >= 2) {
          (line as { setData: (d: unknown) => void }).setData([
            { time: (formatted[0] as { time: unknown }).time, value: level.price },
            { time: (formatted[formatted.length - 1] as { time: unknown }).time, value: level.price },
          ]);
        }
      });

      // OHLC crosshair info
      typedChart.subscribeCrosshairMove((param: unknown) => {
        const p = param as { seriesData?: Map<unknown, unknown>; time?: unknown };
        if (!p.time || !p.seriesData) { setHovered(null); return; }
        const bar = p.seriesData.get(candleSeries) as CandleInfo | undefined;
        if (bar) setHovered({ ...bar, time: typeof p.time === 'number' ? p.time : 0 });
      });

      typedChart.timeScale().fitContent();

      // Responsive resize
      const ro = new ResizeObserver(() => {
        if (containerRef.current) {
          typedChart.applyOptions({ width: containerRef.current.clientWidth });
        }
      });
      if (containerRef.current) ro.observe(containerRef.current);
      roDisconnect = () => ro.disconnect();
    });

    return () => {
      roDisconnect?.();
      if (chartRef.current) {
        (chartRef.current as { remove: () => void }).remove();
        chartRef.current = null;
      }
    };
  }, [data]);

  const isGain = quote ? quote.d >= 0 : true;
  const priceColor = isGain ? 'text-cyan-400' : 'text-orange-400';

  const fmtVol = (v: number) => {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
    return v.toString();
  };

  return (
    <div className="flex flex-col h-full bg-black">

      {/* ── Top Toolbar ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#1a1a1a] flex-shrink-0 gap-4">

        {/* Left: symbol + live price */}
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex items-center gap-2">
            {isGain
              ? <TrendingUp  size={15} className="text-cyan-400 flex-shrink-0" />
              : <TrendingDown size={15} className="text-orange-400 flex-shrink-0" />
            }
            <span className="text-base font-bold text-white tracking-wide">{symbol}</span>
          </div>

          {quote ? (
            <div className="flex items-center gap-3 flex-wrap">
              <span className={`text-xl font-bold font-mono ${priceColor}`}>
                ${quote.c.toFixed(2)}
              </span>
              <span className={`text-sm font-mono ${priceColor}`}>
                {isGain ? '+' : ''}{quote.d.toFixed(2)}&nbsp;
                ({isGain ? '+' : ''}{quote.dp.toFixed(2)}%)
              </span>
              <span className="text-[11px] text-gray-600 font-mono hidden md:block">
                O:{quote.o.toFixed(2)}&nbsp; H:{quote.h.toFixed(2)}&nbsp; L:{quote.l.toFixed(2)}&nbsp; PC:{quote.pc.toFixed(2)}
              </span>
              {lastUpdate && (
                <span className="flex items-center gap-1 text-[10px] text-gray-700">
                  <Wifi size={9} className="text-cyan-400/50" />
                  {lastUpdate.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              )}
            </div>
          ) : (
            <span className="text-xs text-gray-600 animate-pulse">Loading quote...</span>
          )}
        </div>

        {/* Right: timeframe buttons + refresh */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {CHART_TIMEFRAMES.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => setTimeframe(value)}
              className={`px-2.5 py-1.5 text-xs rounded font-mono font-medium transition-all ${
                timeframe === value
                  ? 'bg-cyan-400/15 text-cyan-400 border border-cyan-400/30'
                  : 'text-gray-500 hover:text-gray-200 hover:bg-white/5'
              }`}
            >
              {label}
            </button>
          ))}
          <button
            onClick={() => fetchCandles(timeframe)}
            title="Refresh chart"
            className="ml-2 p-1.5 rounded text-gray-500 hover:text-cyan-400 transition-colors"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── OHLC Hover Bar ───────────────────────────────────────── */}
      {hovered ? (
        <div className="flex items-center gap-4 px-4 py-1 bg-[#0a0a0a] border-b border-[#111] text-[11px] font-mono flex-shrink-0">
          <span className="text-gray-600">O</span>
          <span className={hovered.close >= hovered.open ? 'text-cyan-400' : 'text-orange-400'}>
            {hovered.open.toFixed(2)}
          </span>
          <span className="text-gray-600">H</span>
          <span className="text-cyan-400">{hovered.high.toFixed(2)}</span>
          <span className="text-gray-600">L</span>
          <span className="text-orange-400">{hovered.low.toFixed(2)}</span>
          <span className="text-gray-600">C</span>
          <span className={hovered.close >= hovered.open ? 'text-cyan-400' : 'text-orange-400'}>
            {hovered.close.toFixed(2)}
          </span>
          {hovered.volume > 0 && (
            <>
              <span className="text-gray-600">Vol</span>
              <span className="text-gray-400">{fmtVol(hovered.volume)}</span>
            </>
          )}
          <span className={`ml-2 text-[10px] font-semibold ${hovered.close >= hovered.open ? 'text-cyan-400' : 'text-orange-400'}`}>
            {hovered.close >= hovered.open ? '▲' : '▼'}&nbsp;
            {Math.abs(((hovered.close - hovered.open) / hovered.open) * 100).toFixed(2)}%
          </span>
        </div>
      ) : (
        /* S/R Legend (shown when not hovering) */
        data && data.levels.length > 0 && (
          <div className="flex items-center gap-4 px-4 py-1 bg-[#050505] border-b border-[#111] flex-shrink-0">
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-px" style={{ borderTop: '1px dashed rgba(0,255,255,0.5)' }} />
              <span className="text-[10px] text-gray-600">Support</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-px" style={{ borderTop: '1px dashed rgba(255,107,0,0.5)' }} />
              <span className="text-[10px] text-gray-600">Resistance</span>
            </div>
            <span className="text-[10px] text-gray-700">{data.levels.length} key levels</span>
          </div>
        )
      )}

      {/* ── Chart Area ───────────────────────────────────────────── */}
      <div className="flex-1 relative min-h-0">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/70">
            <div className="flex flex-col items-center gap-3">
              <RefreshCw size={22} className="animate-spin text-cyan-400" />
              <span className="text-xs text-gray-500">
                Loading {symbol} · {timeframe}...
              </span>
            </div>
          </div>
        )}
        {error && !loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <p className="text-gray-500 text-sm mb-1">{error}</p>
              <p className="text-gray-700 text-xs">Make sure the symbol is correct (e.g. AAPL, TSLA, NVDA)</p>
            </div>
          </div>
        )}
        <div ref={containerRef} className="w-full h-full" />
      </div>
    </div>
  );
}
