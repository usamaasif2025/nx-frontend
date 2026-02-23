'use client';

import { useEffect, useRef } from 'react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  IChartApi,
  ISeriesApi,
  IPriceLine,
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
  // Price lines — only passed for D/W/MO timeframes
  closePrice?: number;       // regular session close  → gray dashed
  preMarketPrice?: number;   // pre-market price       → colored dashed (if > 0)
  postMarketPrice?: number;  // post-market price      → colored dashed (if > 0)
}

const UP   = '#26a69a';
const DOWN = '#ef5350';
const UP_VOL   = '#1a3d38';
const DOWN_VOL = '#3d1a1a';

export default function NxChart({
  candles, regularStart, regularEnd,
  closePrice = 0, preMarketPrice = 0, postMarketPrice = 0,
}: Props) {
  const containerRef    = useRef<HTMLDivElement>(null);
  const chartRef        = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const closeLineRef    = useRef<IPriceLine | null>(null);
  const preLineRef      = useRef<IPriceLine | null>(null);
  const postLineRef     = useRef<IPriceLine | null>(null);
  const firstDataRef    = useRef(true);

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
      chartRef.current        = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      closeLineRef.current    = null;
      preLineRef.current      = null;
      postLineRef.current     = null;
      firstDataRef.current    = true;
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

  // ── Price lines (D / W / MO only) ─────────────────────────────────────
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;

    // Clear all existing lines
    if (closeLineRef.current)  { series.removePriceLine(closeLineRef.current);  closeLineRef.current  = null; }
    if (preLineRef.current)    { series.removePriceLine(preLineRef.current);    preLineRef.current    = null; }
    if (postLineRef.current)   { series.removePriceLine(postLineRef.current);   postLineRef.current   = null; }

    // 1. Regular-session close (gray) — always drawn when closePrice is set
    if (closePrice > 0) {
      closeLineRef.current = series.createPriceLine({
        price: closePrice, color: '#555555', lineWidth: 1,
        lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'close',
      });
    }

    // 2. Pre-market price (colored vs close)
    if (preMarketPrice > 0) {
      const up = preMarketPrice >= (closePrice || preMarketPrice);
      preLineRef.current = series.createPriceLine({
        price: preMarketPrice, color: up ? UP : DOWN, lineWidth: 1,
        lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'pre',
      });
    }

    // 3. Post-market price (colored vs close)
    if (postMarketPrice > 0) {
      const up = postMarketPrice >= (closePrice || postMarketPrice);
      postLineRef.current = series.createPriceLine({
        price: postMarketPrice, color: up ? UP : DOWN, lineWidth: 1,
        lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'post',
      });
    }
  }, [closePrice, preMarketPrice, postMarketPrice]);

  return <div ref={containerRef} className="w-full h-full" />;
}
