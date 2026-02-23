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
  // Extended-hours price lines (D/W/MO only)
  closePrice?: number;
  preMarketPrice?: number;
  postMarketPrice?: number;
  // Key level lines (all timeframes)
  lastDayHigh?: number;
  lastWeekHigh?: number;
  lastMonthHigh?: number;
}

const UP   = '#26a69a';
const DOWN = '#ef5350';
const UP_VOL   = '#1a3d38';
const DOWN_VOL = '#3d1a1a';

export default function NxChart({
  candles, regularStart, regularEnd,
  closePrice = 0, preMarketPrice = 0, postMarketPrice = 0,
  lastDayHigh = 0, lastWeekHigh = 0, lastMonthHigh = 0,
}: Props) {
  const containerRef    = useRef<HTMLDivElement>(null);
  const chartRef        = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const closeLineRef    = useRef<IPriceLine | null>(null);
  const preLineRef      = useRef<IPriceLine | null>(null);
  const postLineRef     = useRef<IPriceLine | null>(null);
  const dayHighLineRef  = useRef<IPriceLine | null>(null);
  const weekHighLineRef = useRef<IPriceLine | null>(null);
  const monHighLineRef  = useRef<IPriceLine | null>(null);
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
      dayHighLineRef.current  = null;
      weekHighLineRef.current = null;
      monHighLineRef.current  = null;
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

  // ── All price lines ────────────────────────────────────────────────────
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;

    // Clear every managed line
    const clear = (ref: React.MutableRefObject<IPriceLine | null>) => {
      if (ref.current) { series.removePriceLine(ref.current); ref.current = null; }
    };
    clear(closeLineRef); clear(preLineRef); clear(postLineRef);
    clear(dayHighLineRef); clear(weekHighLineRef); clear(monHighLineRef);

    const line = (
      ref: React.MutableRefObject<IPriceLine | null>,
      price: number, color: string, title: string,
      style: LineStyle = LineStyle.Dashed,
    ) => {
      if (price <= 0) return;
      ref.current = series.createPriceLine({
        price, color, lineWidth: 1, lineStyle: style,
        axisLabelVisible: true, title,
      });
    };

    // Extended-hours lines (D/W/MO only — caller passes 0 for intraday)
    line(closeLineRef, closePrice, '#555555', 'close');
    line(preLineRef,  preMarketPrice,  preMarketPrice  >= (closePrice || preMarketPrice)  ? UP : DOWN, 'pre');
    line(postLineRef, postMarketPrice, postMarketPrice >= (closePrice || postMarketPrice) ? UP : DOWN, 'post');

    // Key level lines — shown on every timeframe
    line(dayHighLineRef,  lastDayHigh,   '#f59e0b', 'D-H',  LineStyle.SparseDotted);
    line(weekHighLineRef, lastWeekHigh,  '#a855f7', 'W-H',  LineStyle.SparseDotted);
    line(monHighLineRef,  lastMonthHigh, '#3b82f6', 'M-H',  LineStyle.SparseDotted);

  }, [closePrice, preMarketPrice, postMarketPrice, lastDayHigh, lastWeekHigh, lastMonthHigh]);

  return <div ref={containerRef} className="w-full h-full" />;
}
