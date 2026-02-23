// ─── Stock & Scanner Types ────────────────────────────────────────────────────

export type MarketSession = 'pre' | 'regular' | 'post';

export interface StockQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  avgVolume: number;
  volumeRatio: number;
  high: number;
  low: number;
  open: number;
  prevClose: number;
  marketCap?: number;
  float?: number;
  session: MarketSession;
  timestamp: number;
  triggered: boolean; // crossed 7% threshold
}

// ─── Candle Types ─────────────────────────────────────────────────────────────

export type Timeframe = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1D';

export interface Candle {
  time: number; // unix timestamp
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface CandleAnalysis {
  symbol: string;
  timeframe: Timeframe;
  candles: Candle[];
  triggerCandle: Candle | null; // the 1m candle that triggered
  levels: SupportResistanceLevel[];
}

// ─── Support/Resistance ───────────────────────────────────────────────────────

export type LevelType = 'support' | 'resistance' | 'pivot';

export interface SupportResistanceLevel {
  price: number;
  type: LevelType;
  strength: number; // 1-10 — how many times price touched it
  timeframe: Timeframe;
}

// ─── News Types ───────────────────────────────────────────────────────────────

export type NewsImpact = 'high_bullish' | 'medium_bullish' | 'low_bullish' | 'neutral' | 'low_bearish' | 'medium_bearish' | 'high_bearish';

export interface NewsItem {
  id: string;
  symbol: string;
  headline: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: number; // unix timestamp
  impact: NewsImpact;
  impactScore: number; // -10 to +10
  sentiment: number; // -1 to 1
  keywords: string[];
  addToWatchlist: boolean;
  removeFromWatchlist: boolean;
}

// ─── Strategy Types ───────────────────────────────────────────────────────────

export type StrategyName =
  | 'momentum_breakout'
  | 'vwap_reclaim'
  | 'first_candle_hold'
  | 'gap_and_go'
  | 'reversal_hammer'
  | 'news_catalyst';

export type RiskLevel = 'low' | 'medium' | 'high';
export type Conviction = 'A' | 'B' | 'C'; // A = strongest

export interface TradeSetup {
  strategy: StrategyName;
  strategyLabel: string;
  symbol: string;
  direction: 'long' | 'short';
  entry: number;
  stopLoss: number;
  target1: number;
  target2: number;
  target3: number;
  riskReward: number;
  riskPercent: number; // % of account risk
  conviction: Conviction;
  riskLevel: RiskLevel;
  reasoning: string[];
  timeframe: Timeframe;
  validUntil: number; // unix timestamp — setup expires
  generatedAt: number;
}

// ─── Watchlist ────────────────────────────────────────────────────────────────

export interface WatchlistItem {
  symbol: string;
  name: string;
  addedAt: number;
  addedReason: string;
  currentPrice: number;
  changePercent: number;
  alertPrice?: number;
  notes?: string;
  tags: string[];
  pinned: boolean;
}

// ─── Claude AI Analysis ───────────────────────────────────────────────────────

export interface ClaudeAnalysisResult {
  symbol: string;
  conviction: 'A' | 'B' | 'C';
  direction: 'long' | 'short' | 'neutral';
  entry_price: number;
  stop_loss: number;
  target_price: number;
  summary: string;
  catalysts: string[];
  risks: string[];
  key_levels: string[];
  generatedAt: number;
}

// ─── API Config ───────────────────────────────────────────────────────────────

export interface ApiKeys {
  finnhub: string;
  polygon: string;
  alphaVantage: string;
}
