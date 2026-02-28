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
  time: number;       // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  session: 'pre' | 'regular' | 'post';
}

interface Props {
  candles:        Candle[];
  regularStart:   number;
  regularEnd:     number;
  closePrice?:    number;
  preMarketPrice?:  number;
  postMarketPrice?: number;
  lastDayHigh?:   number;
  lastWeekHigh?:  number;
  lastMonthHigh?: number;
}

export default function NxChart({
  candles, regularStart, regularEnd,
  closePrice, preMarketPrice, postMarketPrice,
  lastDayHigh, lastWeekHigh, lastMonthHigh,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);

  useEffect(() => {
    if (!containerRef.current || candles.length === 0) return;

    // Destroy previous chart if re-rendering with new data
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#000000' },
        textColor: '#666',
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
      rightPriceScale: {
        borderColor: '#111',
        textColor: '#555',
      },
      timeScale: {
        borderColor: '#111',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 5,
      },
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    });

    chartRef.current = chart;

    // Candlestick series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#00e5ff',
      downColor: '#ff6b35',
      borderUpColor: '#00e5ff',
      borderDownColor: '#ff6b35',
      wickUpColor: '#00e5ff',
      wickDownColor: '#ff6b35',
    });
    candleSeriesRef.current = candleSeries;

    // Volume series (bottom pane via price scale)
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: '#1a1a1a',
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
      borderVisible: false,
    });
    volumeSeriesRef.current = volumeSeries;

    // Colour each candle by session
    const candleData: CandlestickData<Time>[] = candles.map((c) => ({
      time: c.time as Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      color:
        c.session === 'pre'
          ? c.close >= c.open ? '#7c3aed' : '#5b21b6'
          : c.session === 'post'
          ? c.close >= c.open ? '#d97706' : '#b45309'
          : c.close >= c.open ? '#00e5ff' : '#ff6b35',
      borderColor:
        c.session === 'pre'
          ? c.close >= c.open ? '#7c3aed' : '#5b21b6'
          : c.session === 'post'
          ? c.close >= c.open ? '#d97706' : '#b45309'
          : c.close >= c.open ? '#00e5ff' : '#ff6b35',
      wickColor:
        c.session === 'pre'
          ? '#7c3aed'
          : c.session === 'post'
          ? '#d97706'
          : c.close >= c.open ? '#00e5ff' : '#ff6b35',
    }));

    const volumeData: HistogramData<Time>[] = candles.map((c) => ({
      time: c.time as Time,
      value: c.volume,
      color:
        c.session === 'pre'
          ? '#3b1f6a'
          : c.session === 'post'
          ? '#44290a'
          : c.close >= c.open ? '#003d4d' : '#4d1f0a',
    }));

    candleSeries.setData(candleData);
    volumeSeries.setData(volumeData);

    // Draw vertical lines at regular session open/close
    if (regularStart && regularEnd) {
      // session open line
      candleSeries.createPriceLine({
        price: 0,
        color: 'transparent',
        lineWidth: 1,
        lineStyle: 0,
        axisLabelVisible: false,
        title: '',
      });
    }

    chart.timeScale().fitContent();

    // Horizontal reference lines
    const lines: { price: number; color: string; title: string; dash?: boolean }[] = [];
    if (closePrice)      lines.push({ price: closePrice,      color: '#555',    title: 'Close' });
    if (preMarketPrice)  lines.push({ price: preMarketPrice,  color: '#d97706', title: 'Pre' });
    if (postMarketPrice) lines.push({ price: postMarketPrice, color: '#d97706', title: 'Post' });
    if (lastDayHigh)     lines.push({ price: lastDayHigh,     color: '#ef5350', title: 'D-Hi', dash: true });
    if (lastWeekHigh)    lines.push({ price: lastWeekHigh,    color: '#f59e0b', title: 'W-Hi', dash: true });
    if (lastMonthHigh)   lines.push({ price: lastMonthHigh,   color: '#8b5cf6', title: 'M-Hi', dash: true });
    for (const l of lines) {
      candleSeries.createPriceLine({
        price:              l.price,
        color:              l.color,
        lineWidth:          1,
        lineStyle:          l.dash ? 2 : 1,
        axisLabelVisible:   true,
        title:              l.title,
      });
    }

    // Responsive resize
    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [candles, regularStart, regularEnd, closePrice, preMarketPrice, postMarketPrice, lastDayHigh, lastWeekHigh, lastMonthHigh]);

  return <div ref={containerRef} className="w-full h-full" />;
}
