import { Candle, Timeframe, MarketSession, BacktestTrade, BacktestResult } from '@/types';
import { runStrategyEngine } from '@/lib/strategies';
import { detectLevels } from '@/lib/analysis/levels';

const MIN_LOOKBACK = 30;  // minimum candles before first signal check
const MAX_HOLD     = 20;  // candles to hold before time-stop

export function runBacktest(
  candles: Candle[],
  symbol: string,
  timeframe: Timeframe,
  strategyFilter?: string
): BacktestResult {
  const trades: BacktestTrade[] = [];

  let i = MIN_LOOKBACK;

  while (i < candles.length - 1) {
    const slice  = candles.slice(0, i + 1);
    const latest = slice[slice.length - 1];
    const prev   = slice[slice.length - 2];

    const changePct =
      prev.close > 0 ? ((latest.close - prev.close) / prev.close) * 100 : 0;

    // Build a synthetic StockQuote from the current slice
    const quote = {
      symbol,
      name: symbol,
      price: latest.close,
      change: latest.close - prev.close,
      changePercent: changePct,
      volume: latest.volume,
      avgVolume: latest.volume,
      volumeRatio: 1,
      high: latest.high,
      low: latest.low,
      open: latest.open,
      prevClose: prev.close,
      session: 'regular' as MarketSession,
      timestamp: latest.time * 1000,
      triggered: Math.abs(changePct) >= 7,
    };

    const levels     = detectLevels(slice, timeframe);
    // Strategies were designed for intraday candles; we feed the same slice
    // for all three timeframe inputs so they can still fire on daily/weekly bars.
    const recentSlice = slice.slice(-30);

    const setups = runStrategyEngine({
      quote,
      candles1m:  recentSlice,
      candles5m:  recentSlice,
      candles15m: recentSlice,
      levels,
    });

    const filtered = strategyFilter
      ? setups.filter((s) => s.strategy === strategyFilter)
      : setups.slice(0, 1);

    if (filtered.length > 0) {
      const setup      = filtered[0];
      const entryCandle = candles[i + 1];
      const entryPrice  = entryCandle.open;

      let exitPrice = entryCandle.close;
      let exitTime  = entryCandle.time;
      let outcome: BacktestTrade['outcome'] = 'timeout';
      let exitIdx = i + 1;

      const endIdx = Math.min(i + 1 + MAX_HOLD, candles.length);

      for (let j = i + 1; j < endIdx; j++) {
        const c = candles[j];

        if (setup.direction === 'long') {
          if (c.high >= setup.target2) {
            exitPrice = setup.target2;
            exitTime  = c.time;
            outcome   = 'win';
            exitIdx   = j;
            break;
          }
          if (c.low <= setup.stopLoss) {
            exitPrice = setup.stopLoss;
            exitTime  = c.time;
            outcome   = 'loss';
            exitIdx   = j;
            break;
          }
        } else {
          if (c.low <= setup.target2) {
            exitPrice = setup.target2;
            exitTime  = c.time;
            outcome   = 'win';
            exitIdx   = j;
            break;
          }
          if (c.high >= setup.stopLoss) {
            exitPrice = setup.stopLoss;
            exitTime  = c.time;
            outcome   = 'loss';
            exitIdx   = j;
            break;
          }
        }

        exitPrice = c.close;
        exitTime  = c.time;
        exitIdx   = j;
      }

      const pnlPct =
        setup.direction === 'long'
          ? ((exitPrice - entryPrice) / entryPrice) * 100
          : ((entryPrice - exitPrice) / entryPrice) * 100;

      const riskPct = Math.abs((setup.stopLoss - entryPrice) / entryPrice) * 100;
      const rr      = riskPct > 0 ? Math.abs(pnlPct) / riskPct : 0;

      trades.push({
        entryTime:  entryCandle.time,
        exitTime,
        entryPrice,
        exitPrice,
        direction: setup.direction as 'long' | 'short',
        target:    setup.target2,
        stop:      setup.stopLoss,
        outcome,
        pnlPercent: Math.round(pnlPct * 100) / 100,
        rr:         Math.round(rr  * 100) / 100,
        strategy:   setup.strategy,
      });

      // Advance past the completed trade to avoid overlapping signals
      i = exitIdx + 1;
    } else {
      i++;
    }
  }

  // ─── Performance Metrics ────────────────────────────────────────────────────

  const wins   = trades.filter((t) => t.outcome === 'win').length;
  const losses = trades.filter((t) => t.outcome !== 'win').length;

  const totalPnl = trades.reduce((s, t) => s + t.pnlPercent, 0);
  const avgRR    = trades.length > 0
    ? trades.reduce((s, t) => s + t.rr, 0) / trades.length
    : 0;

  // Max drawdown from peak cumulative P&L
  let peak = 0, cumPnl = 0, maxDD = 0;
  for (const t of trades) {
    cumPnl += t.pnlPercent;
    if (cumPnl > peak) peak = cumPnl;
    const dd = peak - cumPnl;
    if (dd > maxDD) maxDD = dd;
  }

  return {
    symbol,
    timeframe,
    strategy:         strategyFilter || 'all',
    trades,
    winRate:          trades.length > 0 ? Math.round((wins / trades.length) * 1000) / 10 : 0,
    totalPnlPercent:  Math.round(totalPnl * 100) / 100,
    avgRR:            Math.round(avgRR   * 100) / 100,
    maxDrawdown:      Math.round(maxDD   * 100) / 100,
    totalTrades:      trades.length,
    wins,
    losses,
  };
}
