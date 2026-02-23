'use client';

import { useEffect, useRef } from 'react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  ColorType,
  CrosshairMode,
  IChartApi,
  ISeriesApi,
  CandlestickData,
  HistogramData,
  Time,
} from 'lightweight-charts';

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  session: 'pre' | 'regular' | 'post';
}

interface Props {
  candles: Candle[];
  regularStart: number;
  regularEnd: number;
}

const UP   = '#26a69a';
const DOWN = '#ef5350';
const UP_VOL   = '#1a3d38';
const DOWN_VOL = '#3d1a1a';

export default function NxChart({ candles, regularStart, regularEnd }: Props) {
  const containerRef   = useRef<HTMLDivElement>(null);
  const chartRef       = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const firstDataRef   = useRef(true);  // fitContent only on first load

  // ── Create chart once on mount ──────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#000000' },
        textColor: '#555',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: '#111' },
        horzLines: { color: '#111' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#333', labelBackgroundColor: '#111' },
        horzLine: { color: '#333', labelBackgroundColor: '#111' },
      },
      rightPriceScale: { borderColor: '#111' },
      timeScale: {
        borderColor: '#111',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 5,
      },
      width:  containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    });

    chartRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor:        UP,
      downColor:      DOWN,
      borderUpColor:  UP,
      borderDownColor: DOWN,
      wickUpColor:    UP,
      wickDownColor:  DOWN,
    });
    candleSeriesRef.current = candleSeries;

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat:  { type: 'volume' },
      priceScaleId: 'volume',
    });
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
      borderVisible: false,
    });
    volumeSeriesRef.current = volumeSeries;

    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({
          width:  containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current       = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      firstDataRef.current   = true;
    };
  }, []); // runs once — never recreates the chart

  // ── Update data whenever candles change (silent refresh, no flicker) ───
  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current || candles.length === 0) return;

    const candleData: CandlestickData<Time>[] = candles.map((c) => ({
      time:        c.time as Time,
      open:        c.open,
      high:        c.high,
      low:         c.low,
      close:       c.close,
      color:       c.close >= c.open ? UP   : DOWN,
      borderColor: c.close >= c.open ? UP   : DOWN,
      wickColor:   c.close >= c.open ? UP   : DOWN,
    }));

    const volumeData: HistogramData<Time>[] = candles.map((c) => ({
      time:  c.time as Time,
      value: c.volume,
      color: c.close >= c.open ? UP_VOL : DOWN_VOL,
    }));

    candleSeriesRef.current.setData(candleData);
    volumeSeriesRef.current.setData(volumeData);

    // fitContent only on the very first data load — preserve zoom on refresh
    if (firstDataRef.current) {
      chartRef.current?.timeScale().fitContent();
      firstDataRef.current = false;
    }
  }, [candles, regularStart, regularEnd]);

  return <div ref={containerRef} className="w-full h-full" />;
}
