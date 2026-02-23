'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Timeframe, Candle, SupportResistanceLevel } from '@/types';
import axios from 'axios';
import { RefreshCw } from 'lucide-react';

const TIMEFRAMES: { label: string; value: Timeframe }[] = [
  { label: '1m',  value: '1m'  },
  { label: '1h',  value: '1h'  },
  { label: '1D',  value: '1D'  },
  { label: '1W',  value: '1W'  },
  { label: '1M',  value: '1M'  },
];

interface ChartData {
  candles: Candle[];
  levels:  SupportResistanceLevel[];
}

interface HoveredBar {
  open:   number;
  high:   number;
  low:    number;
  close:  number;
  volume: number;
  time:   number;
}

interface Props {
  symbol: string;
}

export default function TradingChart({ symbol }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef     = useRef<unknown>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>('1D');
  const [data,    setData]    = useState<ChartData | null>(null);
  const [loading, setLoading] = useState(false);
  const [hovered, setHovered] = useState<HoveredBar | null>(null);

  const fetchData = useCallback(async (tf: Timeframe) => {
    setLoading(true);
    try {
      const { data: res } = await axios.get(`/api/candles?symbol=${symbol}&timeframe=${tf}`);
      setData({ candles: res.candles, levels: res.levels });
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => { fetchData(timeframe); }, [timeframe, fetchData]);

  useEffect(() => {
    if (!data || !containerRef.current || typeof window === 'undefined') return;

    import('lightweight-charts').then(({ createChart, CrosshairMode }) => {
      if (!containerRef.current) return;

      // Remove previous chart instance
      if (chartRef.current) {
        (chartRef.current as { remove: () => void }).remove();
        chartRef.current = null;
      }

      const chart = createChart(containerRef.current, {
        width:  containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
        layout: {
          background: { color: '#000000' },
          textColor:  '#888888',
        },
        grid: {
          vertLines: { color: '#0e0e0e' },
          horzLines: { color: '#0e0e0e' },
        },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderColor: '#1a1a1a' },
        timeScale: {
          borderColor:    '#1a1a1a',
          timeVisible:    true,
          secondsVisible: false,
        },
      });

      chartRef.current = chart;

      const typedChart = chart as {
        addCandlestickSeries:  (opts: unknown) => unknown;
        addHistogramSeries:    (opts: unknown) => unknown;
        addLineSeries:         (opts: unknown) => unknown;
        priceScale:            (id: string) => { applyOptions: (opts: unknown) => void };
        subscribeCrosshairMove:(cb: (p: unknown) => void) => void;
        timeScale:             () => { fitContent: () => void };
        applyOptions:          (opts: unknown) => void;
      };

      // ── Candlestick series ──────────────────────────────────────────────────
      const candleSeries = typedChart.addCandlestickSeries({
        upColor:        '#00ffff',
        downColor:      '#ff6b00',
        borderUpColor:  '#00ffff',
        borderDownColor:'#ff6b00',
        wickUpColor:    '#00ffff',
        wickDownColor:  '#ff6b00',
      });

      // ── Volume histogram (overlay, bottom 20 %) ─────────────────────────────
      const volumeSeries = typedChart.addHistogramSeries({
        priceScaleId: 'volume',
      });

      typedChart.priceScale('volume').applyOptions({
        scaleMargins: { top: 0.82, bottom: 0 },
        visible:      false,
      });

      // ── Data ────────────────────────────────────────────────────────────────
      const validCandles = data.candles.filter(
        (c) => c.time && c.open && c.high && c.low && c.close
      );

      const candleData = validCandles.map((c) => ({
        time:  c.time as unknown,
        open:  c.open,
        high:  c.high,
        low:   c.low,
        close: c.close,
      }));

      const volumeData = validCandles.map((c) => ({
        time:  c.time as unknown,
        value: c.volume ?? 0,
        color: c.close >= c.open
          ? 'rgba(0, 255, 255, 0.18)'
          : 'rgba(255, 107, 0, 0.18)',
      }));

      (candleSeries as { setData: (d: unknown) => void }).setData(candleData);
      (volumeSeries as { setData: (d: unknown) => void }).setData(volumeData);

      // ── Support / Resistance lines ──────────────────────────────────────────
      if (candleData.length >= 2) {
        const firstTime = (candleData[0] as { time: unknown }).time;
        const lastTime  = (candleData[candleData.length - 1] as { time: unknown }).time;

        data.levels.forEach((level) => {
          const line = typedChart.addLineSeries({
            color:              level.type === 'resistance'
                                  ? 'rgba(255,107,0,0.35)'
                                  : 'rgba(0,255,255,0.35)',
            lineWidth:          1,
            lineStyle:          2, // dashed
            priceLineVisible:   false,
            lastValueVisible:   false,
          });
          (line as { setData: (d: unknown) => void }).setData([
            { time: firstTime, value: level.price },
            { time: lastTime,  value: level.price },
          ]);
        });
      }

      // ── Crosshair ───────────────────────────────────────────────────────────
      typedChart.subscribeCrosshairMove((param: unknown) => {
        const p = param as { seriesData?: Map<unknown, unknown>; time?: unknown };
        if (!p.time || !p.seriesData) { setHovered(null); return; }

        const bar = p.seriesData.get(candleSeries) as {
          open: number; high: number; low: number; close: number;
        } | undefined;

        if (bar) {
          const ts = typeof p.time === 'number' ? p.time : 0;
          const raw = data.candles.find((c) => c.time === ts);
          setHovered({ ...bar, volume: raw?.volume ?? 0, time: ts });
        } else {
          setHovered(null);
        }
      });

      typedChart.timeScale().fitContent();

      const ro = new ResizeObserver(() => {
        if (containerRef.current) {
          typedChart.applyOptions({ width: containerRef.current.clientWidth });
        }
      });
      if (containerRef.current) ro.observe(containerRef.current);
      return () => ro.disconnect();
    });

    return () => {
      if (chartRef.current) {
        (chartRef.current as { remove: () => void }).remove();
        chartRef.current = null;
      }
    };
  }, [data]);

  const fmtVol = (v: number) =>
    v >= 1_000_000 ? `${(v / 1_000_000).toFixed(2)}M` : `${(v / 1_000).toFixed(0)}K`;

  return (
    <div className="flex flex-col h-full bg-black">
      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#1a1a1a] shrink-0">
        {/* OHLCV readout */}
        <div className="flex items-center gap-3 text-[11px] font-mono min-h-[20px]">
          {hovered ? (
            <>
              <span className="text-gray-500">O</span>
              <span className={hovered.close >= hovered.open ? 'text-cyan-400' : 'text-orange-400'}>
                {hovered.open.toFixed(2)}
              </span>
              <span className="text-gray-500">H</span>
              <span className="text-green-400">{hovered.high.toFixed(2)}</span>
              <span className="text-gray-500">L</span>
              <span className="text-red-400">{hovered.low.toFixed(2)}</span>
              <span className="text-gray-500">C</span>
              <span className={hovered.close >= hovered.open ? 'text-cyan-400' : 'text-orange-400'}>
                {hovered.close.toFixed(2)}
              </span>
              {hovered.volume > 0 && (
                <>
                  <span className="text-gray-500">Vol</span>
                  <span className="text-gray-400">{fmtVol(hovered.volume)}</span>
                </>
              )}
            </>
          ) : (
            <span className="text-gray-700">Hover candle for OHLCV</span>
          )}
        </div>

        {/* Timeframe buttons + refresh */}
        <div className="flex items-center gap-1">
          {TIMEFRAMES.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => setTimeframe(value)}
              className={`px-2.5 py-1 text-[11px] rounded font-mono font-medium transition-all ${
                timeframe === value
                  ? 'bg-cyan-400/15 text-cyan-400 border border-cyan-400/30'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
              }`}
            >
              {label}
            </button>
          ))}
          <button
            onClick={() => fetchData(timeframe)}
            className="ml-1 p-1.5 rounded text-gray-500 hover:text-cyan-400 transition-colors"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── Chart canvas ────────────────────────────────────────────────────── */}
      <div className="flex-1 relative min-h-0">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/70">
            <RefreshCw size={20} className="animate-spin text-cyan-400" />
          </div>
        )}
        <div ref={containerRef} className="w-full h-full" />
        {!data && !loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-gray-600 text-sm">No chart data available</p>
          </div>
        )}
      </div>
    </div>
  );
}
