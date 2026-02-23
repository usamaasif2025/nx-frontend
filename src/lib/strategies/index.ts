import { Candle, SupportResistanceLevel, StockQuote, TradeSetup, StrategyName, Conviction } from '@/types';
import { getNearestLevels } from '@/lib/analysis/levels';

interface StrategyInput {
  quote: StockQuote;
  candles1m: Candle[];
  candles5m: Candle[];
  candles15m: Candle[];
  levels: SupportResistanceLevel[];
}

function riskReward(entry: number, stop: number, target: number): number {
  const risk = Math.abs(entry - stop);
  const reward = Math.abs(target - entry);
  return risk > 0 ? Math.round((reward / risk) * 100) / 100 : 0;
}

function calcConviction(score: number): Conviction {
  if (score >= 8) return 'A';
  if (score >= 5) return 'B';
  return 'C';
}

// ─── Strategy 1: Gap & Go ─────────────────────────────────────────────────────

function gapAndGo(input: StrategyInput): TradeSetup | null {
  const { quote, candles1m, levels } = input;
  if (candles1m.length < 3) return null;

  const gap = ((quote.open - quote.prevClose) / quote.prevClose) * 100;
  if (Math.abs(gap) < 3) return null;

  const firstCandle = candles1m[0];
  const isLong = gap > 0;
  const entry = isLong ? firstCandle.high + 0.01 : firstCandle.low - 0.01;
  const stop = isLong ? firstCandle.low - 0.01 : firstCandle.high + 0.01;
  const range = Math.abs(entry - stop);
  const target1 = isLong ? entry + range * 1.5 : entry - range * 1.5;
  const target2 = isLong ? entry + range * 2.5 : entry - range * 2.5;
  const target3 = isLong ? entry + range * 4.0 : entry - range * 4.0;

  const nearest = getNearestLevels(quote.price, levels);
  const levelBonus = nearest.resistance && isLong ? 0 : nearest.support && !isLong ? 0 : 2;
  const score = 6 + levelBonus + (Math.abs(gap) > 7 ? 2 : 0);

  return {
    strategy: 'gap_and_go',
    strategyLabel: 'Gap & Go',
    symbol: quote.symbol,
    direction: isLong ? 'long' : 'short',
    entry,
    stopLoss: stop,
    target1,
    target2,
    target3,
    riskReward: riskReward(entry, stop, target2),
    riskPercent: 1,
    conviction: calcConviction(score),
    riskLevel: 'medium',
    reasoning: [
      `${Math.abs(gap).toFixed(1)}% gap ${isLong ? 'up' : 'down'} from prev close`,
      `Entry on first 1m candle ${isLong ? 'high' : 'low'} break`,
      `Stop below first candle ${isLong ? 'low' : 'high'}`,
    ],
    timeframe: '1m',
    validUntil: Date.now() + 15 * 60 * 1000,
    generatedAt: Date.now(),
  };
}

// ─── Strategy 2: Momentum Breakout ───────────────────────────────────────────

function momentumBreakout(input: StrategyInput): TradeSetup | null {
  const { quote, candles5m, levels } = input;
  if (candles5m.length < 5) return null;
  if (quote.changePercent < 5) return null;

  const recent = candles5m.slice(-5);
  const highestHigh = Math.max(...recent.map((c) => c.high));
  const lowestLow = Math.min(...recent.map((c) => c.low));
  const avgVol = recent.reduce((s, c) => s + c.volume, 0) / recent.length;
  const lastVol = recent[recent.length - 1].volume;
  const volSurge = lastVol > avgVol * 1.5;

  if (!volSurge) return null;

  const entry = highestHigh + 0.01;
  const stop = lowestLow - 0.01;
  const range = entry - stop;
  const target1 = entry + range * 1;
  const target2 = entry + range * 2;
  const target3 = entry + range * 3.5;

  const score = 5 + (volSurge ? 2 : 0) + (quote.changePercent > 10 ? 2 : 0);

  return {
    strategy: 'momentum_breakout',
    strategyLabel: 'Momentum Breakout',
    symbol: quote.symbol,
    direction: 'long',
    entry,
    stopLoss: stop,
    target1,
    target2,
    target3,
    riskReward: riskReward(entry, stop, target2),
    riskPercent: 1.5,
    conviction: calcConviction(score),
    riskLevel: 'high',
    reasoning: [
      `+${quote.changePercent.toFixed(1)}% momentum with ${(lastVol / avgVol).toFixed(1)}x volume surge`,
      `Breakout above 5-candle high at $${highestHigh.toFixed(2)}`,
      `Stop below 5-candle consolidation low`,
    ],
    timeframe: '5m',
    validUntil: Date.now() + 30 * 60 * 1000,
    generatedAt: Date.now(),
  };
}

// ─── Strategy 3: VWAP Reclaim ─────────────────────────────────────────────────

function vwapReclaim(input: StrategyInput): TradeSetup | null {
  const { quote, candles5m } = input;
  if (candles5m.length < 10) return null;

  // Calculate VWAP from 5m candles
  let cumVolPrice = 0;
  let cumVol = 0;
  for (const c of candles5m) {
    const typical = (c.high + c.low + c.close) / 3;
    cumVolPrice += typical * c.volume;
    cumVol += c.volume;
  }
  const vwap = cumVol > 0 ? cumVolPrice / cumVol : 0;
  if (vwap === 0) return null;

  const lastCandle = candles5m[candles5m.length - 1];
  const prevCandle = candles5m[candles5m.length - 2];

  // VWAP reclaim: prev candle below VWAP, current closes above
  const reclaim = prevCandle.close < vwap && lastCandle.close > vwap;
  if (!reclaim) return null;

  const entry = lastCandle.close;
  const stop = vwap * 0.998; // stop just below VWAP
  const range = entry - stop;
  const target1 = entry + range * 1.5;
  const target2 = entry + range * 2.5;
  const target3 = entry + range * 4;

  return {
    strategy: 'vwap_reclaim',
    strategyLabel: 'VWAP Reclaim',
    symbol: quote.symbol,
    direction: 'long',
    entry,
    stopLoss: stop,
    target1,
    target2,
    target3,
    riskReward: riskReward(entry, stop, target2),
    riskPercent: 1,
    conviction: 'B',
    riskLevel: 'low',
    reasoning: [
      `Price reclaimed VWAP at $${vwap.toFixed(2)}`,
      `Previous candle closed below, current candle closed above`,
      `Stop just below VWAP — high probability hold zone`,
    ],
    timeframe: '5m',
    validUntil: Date.now() + 20 * 60 * 1000,
    generatedAt: Date.now(),
  };
}

// ─── Strategy 4: First Candle Hold ───────────────────────────────────────────

function firstCandleHold(input: StrategyInput): TradeSetup | null {
  const { quote, candles1m } = input;
  if (candles1m.length < 5) return null;

  const first = candles1m[0];
  const last = candles1m[candles1m.length - 1];

  // Price is holding above first candle low (for longs)
  const isHolding = quote.changePercent > 0 && last.close > first.low && last.close >= first.open;
  if (!isHolding) return null;

  const entry = first.high + 0.01;
  const stop = first.low - 0.01;
  const range = entry - stop;
  const target1 = entry + range * 1;
  const target2 = entry + range * 2;
  const target3 = entry + range * 3;

  return {
    strategy: 'first_candle_hold',
    strategyLabel: 'First Candle Hold',
    symbol: quote.symbol,
    direction: 'long',
    entry,
    stopLoss: stop,
    target1,
    target2,
    target3,
    riskReward: riskReward(entry, stop, target2),
    riskPercent: 1,
    conviction: 'B',
    riskLevel: 'medium',
    reasoning: [
      `First 1m candle: O $${first.open.toFixed(2)} H $${first.high.toFixed(2)} L $${first.low.toFixed(2)} C $${first.close.toFixed(2)}`,
      `Price holding above first candle low — bullish structure`,
      `Entry on first candle high break, stop below first candle low`,
    ],
    timeframe: '1m',
    validUntil: Date.now() + 10 * 60 * 1000,
    generatedAt: Date.now(),
  };
}

// ─── Strategy 5: News Catalyst ────────────────────────────────────────────────

function newsCatalyst(input: StrategyInput, newsScore: number): TradeSetup | null {
  const { quote, candles5m } = input;
  if (Math.abs(newsScore) < 3) return null;
  if (candles5m.length < 3) return null;

  const isLong = newsScore > 0;
  const last = candles5m[candles5m.length - 1];
  const entry = isLong ? last.high + 0.01 : last.low - 0.01;
  const stop = isLong ? last.low - 0.01 : last.high + 0.01;
  const range = Math.abs(entry - stop);
  const target1 = isLong ? entry + range : entry - range;
  const target2 = isLong ? entry + range * 2 : entry - range * 2;
  const target3 = isLong ? entry + range * 3.5 : entry - range * 3.5;
  const impactLabel = newsScore >= 6 ? 'HIGH' : 'MEDIUM';

  return {
    strategy: 'news_catalyst',
    strategyLabel: 'News Catalyst',
    symbol: quote.symbol,
    direction: isLong ? 'long' : 'short',
    entry,
    stopLoss: stop,
    target1,
    target2,
    target3,
    riskReward: riskReward(entry, stop, target2),
    riskPercent: 1,
    conviction: newsScore >= 6 ? 'A' : 'B',
    riskLevel: 'medium',
    reasoning: [
      `${impactLabel} impact news catalyst detected (score: ${newsScore > 0 ? '+' : ''}${newsScore})`,
      `Trading in direction of news sentiment`,
      `Entry on candle break, stop opposite side`,
    ],
    timeframe: '5m',
    validUntil: Date.now() + 25 * 60 * 1000,
    generatedAt: Date.now(),
  };
}

// ─── Master Strategy Engine ───────────────────────────────────────────────────

export function runStrategyEngine(
  input: StrategyInput,
  newsScore = 0
): TradeSetup[] {
  const candidates: (TradeSetup | null)[] = [
    gapAndGo(input),
    momentumBreakout(input),
    vwapReclaim(input),
    firstCandleHold(input),
    newsCatalyst(input, newsScore),
  ];

  const valid = candidates.filter(Boolean) as TradeSetup[];

  // Score and sort: A > B > C, then by risk-reward
  const convScore: Record<Conviction, number> = { A: 3, B: 2, C: 1 };
  return valid.sort(
    (a, b) =>
      convScore[b.conviction] - convScore[a.conviction] ||
      b.riskReward - a.riskReward
  );
}

export const STRATEGY_LABELS: Record<StrategyName, string> = {
  momentum_breakout: 'Momentum Breakout',
  vwap_reclaim: 'VWAP Reclaim',
  first_candle_hold: 'First Candle Hold',
  gap_and_go: 'Gap & Go',
  reversal_hammer: 'Reversal Hammer',
  news_catalyst: 'News Catalyst',
};
