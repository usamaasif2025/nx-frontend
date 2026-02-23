'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Timeframe, Candle, SupportResistanceLevel } from '@/types';
import axios from 'axios';
import { RefreshCw, TrendingUp } from 'lucide-react';

const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '30m', '1h', '4h', '1D'];

interface ChartData {
  candles: Candle[];
  levels: SupportResistanceLevel[];
  triggerCandle: Candle | null;
}

interface CandleInfo {
  open: number; high: number; low: number; close: number; volume: number; time: number;
}

function MiniBar({ open, high, low, close }: { open: number; high: number; low: number; close: number }) {
  const isGain = close >= open;
  return (
    <div className="flex items-center gap-1">
      <div className={`w-2 h-4 rounded-sm ${isGain ? 'bg-cyan-400' : 'bg-orange-400'}`} />
      <div className="text-xs font-mono text-gray-300">
        O{open.toFixed(2)} H{high.toFixed(2)} L{low.toFixed(2)} C{close.toFixed(2)}
      </div>
    </div>
  );
}

export default function CandleChart({ symbol }: { symbol: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<unknown>(null);
  const seriesRef = useRef<unknown>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>('5m');
  const [data, setData] = useState<ChartData | null>(null);
  const [loading, setLoading] = useState(false);
  const [hovered, setHovered] = useState<CandleInfo | null>(null);

  const fetchData = useCallback(async (tf: Timeframe) => {
    setLoading(true);
    try {
      const { data: res } = await axios.get(`/api/candles?symbol=${symbol}&timeframe=${tf}`);
      setData({ candles: res.candles, levels: res.levels, triggerCandle: res.triggerCandle });
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  // Load LightweightCharts dynamically (client-side only)
  useEffect(() => {
    fetchData(timeframe);
  }, [timeframe, fetchData]);

  useEffect(() => {
    if (!data || !containerRef.current || typeof window === 'undefined') return;

    let chart: unknown;

    import('lightweight-charts').then(({ createChart, CrosshairMode }) => {
      if (!containerRef.current) return;

      // Destroy existing chart
      if (chartRef.current) {
        (chartRef.current as { remove: () => void }).remove();
        chartRef.current = null;
      }

      chart = createChart(containerRef.current, {
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
        layout: {
          background: { color: '#000000' },
          textColor: '#888888',
        },
        grid: {
          vertLines: { color: '#111111' },
          horzLines: { color: '#111111' },
        },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderColor: '#1a1a1a' },
        timeScale: { borderColor: '#1a1a1a', timeVisible: true, secondsVisible: false },
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
        upColor: '#00ffff',
        downColor: '#ff6b00',
        borderUpColor: '#00ffff',
        borderDownColor: '#ff6b00',
        wickUpColor: '#00ffff',
        wickDownColor: '#ff6b00',
      });

      seriesRef.current = candleSeries;

      const formattedCandles = data.candles
        .filter((c) => c.time && c.open && c.high && c.low && c.close)
        .map((c) => ({ time: c.time as unknown, open: c.open, high: c.high, low: c.low, close: c.close }));

      (candleSeries as { setData: (d: unknown) => void }).setData(formattedCandles);

      // Add S/R level lines
      data.levels.forEach((level) => {
        const line = typedChart.addLineSeries({
          color: level.type === 'resistance' ? 'rgba(255, 107, 0, 0.4)' : 'rgba(0, 255, 255, 0.4)',
          lineWidth: 1,
          lineStyle: 2, // dashed
          priceLineVisible: false,
          lastValueVisible: false,
        });
        if (formattedCandles.length >= 2) {
          const firstTime = (formattedCandles[0] as { time: unknown }).time;
          const lastTime = (formattedCandles[formattedCandles.length - 1] as { time: unknown }).time;
          (line as { setData: (d: unknown) => void }).setData([
            { time: firstTime, value: level.price },
            { time: lastTime,  value: level.price },
          ]);
        }
      });

      // Crosshair handler
      typedChart.subscribeCrosshairMove((param: unknown) => {
        const p = param as { seriesData?: Map<unknown, unknown>; time?: unknown };
        if (!p.time || !p.seriesData) { setHovered(null); return; }
        const bar = p.seriesData.get(candleSeries) as CandleInfo | undefined;
        if (bar) setHovered({ ...bar, time: typeof p.time === 'number' ? p.time : 0 });
      });

      typedChart.timeScale().fitContent();

      // Resize observer
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

  return (
    <div className="flex flex-col h-full bg-black">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#1a1a1a]">
        <div className="flex items-center gap-2">
          <TrendingUp size={13} className="text-cyan-400" />
          <span className="text-sm font-bold text-white">{symbol}</span>
          {data?.triggerCandle && (
            <div className="text-xs text-gray-500">
              <MiniBar
                open={data.triggerCandle.open}
                high={data.triggerCandle.high}
                low={data.triggerCandle.low}
                close={data.triggerCandle.close}
              />
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-2 py-1 text-[10px] rounded font-mono font-medium transition-all ${
                timeframe === tf
                  ? 'bg-cyan-400/15 text-cyan-400 border border-cyan-400/30'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
              }`}
            >
              {tf}
            </button>
          ))}
          <button
            onClick={() => fetchData(timeframe)}
            className="ml-1 p-1 rounded text-gray-500 hover:text-cyan-400 transition-colors"
          >
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* OHLC hover display */}
      {hovered && (
        <div className="flex items-center gap-3 px-3 py-1 bg-[#0a0a0a] border-b border-[#111] text-[10px] font-mono">
          <span className="text-gray-500">O</span><span className={hovered.close >= hovered.open ? 'text-cyan-400' : 'text-orange-400'}>{hovered.open.toFixed(2)}</span>
          <span className="text-gray-500">H</span><span className="text-cyan-400">{hovered.high.toFixed(2)}</span>
          <span className="text-gray-500">L</span><span className="text-orange-400">{hovered.low.toFixed(2)}</span>
          <span className="text-gray-500">C</span><span className={hovered.close >= hovered.open ? 'text-cyan-400' : 'text-orange-400'}>{hovered.close.toFixed(2)}</span>
          {hovered.volume > 0 && <><span className="text-gray-500">V</span><span className="text-gray-400">{(hovered.volume / 1000).toFixed(0)}K</span></>}
        </div>
      )}

      {/* Level legend */}
      {data && data.levels.length > 0 && (
        <div className="flex items-center gap-3 px-3 py-1 bg-[#050505] border-b border-[#111]">
          <div className="flex items-center gap-1">
            <div className="w-3 h-px bg-cyan-400/40" style={{ borderTop: '1px dashed rgba(0,255,255,0.4)' }} />
            <span className="text-[9px] text-gray-600">Support</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-px" style={{ borderTop: '1px dashed rgba(255,107,0,0.4)' }} />
            <span className="text-[9px] text-gray-600">Resistance</span>
          </div>
          <span className="text-[9px] text-gray-700">{data.levels.length} levels</span>
        </div>
      )}

      {/* Chart */}
      <div className="flex-1 relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/60">
            <RefreshCw size={16} className="animate-spin text-cyan-400" />
          </div>
        )}
        <div ref={containerRef} className="w-full h-full" />
        {!data && !loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-gray-600 text-sm">Select a stock to view chart</p>
          </div>
        )}
      </div>
    </div>
  );
}
