import { Candle, SupportResistanceLevel, Timeframe } from '@/types';

/**
 * Detects support/resistance levels from candle data
 * by finding price zones where price reversed multiple times.
 */
export function detectLevels(
  candles: Candle[],
  timeframe: Timeframe,
  lookback = 50,
  tolerance = 0.003 // 0.3% price zone
): SupportResistanceLevel[] {
  if (candles.length < 5) return [];

  const recent = candles.slice(-Math.min(lookback, candles.length));
  const levels: SupportResistanceLevel[] = [];

  // Find swing highs and swing lows
  for (let i = 2; i < recent.length - 2; i++) {
    const c = recent[i];

    // Swing high
    if (
      c.high >= recent[i - 1].high &&
      c.high >= recent[i - 2].high &&
      c.high >= recent[i + 1].high &&
      c.high >= recent[i + 2].high
    ) {
      levels.push({
        price: c.high,
        type: 'resistance',
        strength: 1,
        timeframe,
      });
    }

    // Swing low
    if (
      c.low <= recent[i - 1].low &&
      c.low <= recent[i - 2].low &&
      c.low <= recent[i + 1].low &&
      c.low <= recent[i + 2].low
    ) {
      levels.push({
        price: c.low,
        type: 'support',
        strength: 1,
        timeframe,
      });
    }
  }

  // Merge nearby levels and count touches
  const merged: SupportResistanceLevel[] = [];
  for (const level of levels) {
    const existing = merged.find(
      (m) =>
        m.type === level.type &&
        Math.abs(m.price - level.price) / level.price <= tolerance
    );
    if (existing) {
      existing.strength += 1;
      existing.price = (existing.price + level.price) / 2; // average price
    } else {
      merged.push({ ...level });
    }
  }

  // Only return levels touched 2+ times, sorted by strength
  return merged
    .filter((l) => l.strength >= 1)
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 10);
}

/**
 * Calculates pivot points (Classic method) from previous day's OHLC
 */
export function calcPivotPoints(prev: Candle): SupportResistanceLevel[] {
  const pivot = (prev.high + prev.low + prev.close) / 3;
  const r1 = 2 * pivot - prev.low;
  const s1 = 2 * pivot - prev.high;
  const r2 = pivot + (prev.high - prev.low);
  const s2 = pivot - (prev.high - prev.low);

  return [
    { price: pivot, type: 'pivot', strength: 5, timeframe: '1D' },
    { price: r1,    type: 'resistance', strength: 3, timeframe: '1D' },
    { price: r2,    type: 'resistance', strength: 2, timeframe: '1D' },
    { price: s1,    type: 'support',    strength: 3, timeframe: '1D' },
    { price: s2,    type: 'support',    strength: 2, timeframe: '1D' },
  ];
}

/**
 * Returns the nearest support below price and resistance above price
 */
export function getNearestLevels(
  price: number,
  levels: SupportResistanceLevel[]
): { support: SupportResistanceLevel | null; resistance: SupportResistanceLevel | null } {
  const supports = levels.filter((l) => l.type === 'support' && l.price < price);
  const resistances = levels.filter((l) => (l.type === 'resistance' || l.type === 'pivot') && l.price > price);

  supports.sort((a, b) => b.price - a.price);
  resistances.sort((a, b) => a.price - b.price);

  return {
    support: supports[0] || null,
    resistance: resistances[0] || null,
  };
}
