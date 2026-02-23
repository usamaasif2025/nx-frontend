'use client';

import { useState } from 'react';
import axios from 'axios';
import { FlaskConical, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { BacktestResult, BacktestTrade } from '@/types';

const TIMEFRAMES = ['1h', '4h', '1D', '1W', '1M'] as const;
type BtTimeframe = (typeof TIMEFRAMES)[number];

const STRATEGIES = [
  { value: 'all',              label: 'All Strategies'    },
  { value: 'gap_and_go',       label: 'Gap & Go'          },
  { value: 'momentum_breakout',label: 'Momentum Breakout' },
  { value: 'vwap_reclaim',     label: 'VWAP Reclaim'      },
  { value: 'first_candle_hold',label: 'First Candle Hold' },
  { value: 'news_catalyst',    label: 'News Catalyst'     },
];

function Metric({
  label, value, sub, color,
}: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-[#080808] border border-[#1a1a1a] rounded-lg p-3">
      <div className="text-[9px] text-gray-600 uppercase tracking-widest mb-1">{label}</div>
      <div className={`text-base font-bold font-mono ${color ?? 'text-white'}`}>{value}</div>
      {sub && <div className="text-[9px] text-gray-600 mt-0.5">{sub}</div>}
    </div>
  );
}

function TradeRow({ trade }: { trade: BacktestTrade }) {
  const isWin  = trade.outcome === 'win';
  const isLoss = trade.outcome === 'loss';
  const date   = new Date(trade.entryTime * 1000).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  });

  return (
    <div
      className={`flex items-center justify-between px-2.5 py-1.5 rounded border text-[10px] font-mono ${
        isWin  ? 'bg-cyan-400/5  border-cyan-400/15'
        : isLoss ? 'bg-red-400/5   border-red-400/15'
        : 'bg-[#0a0a0a] border-[#1a1a1a]'
      }`}
    >
      <div className="flex items-center gap-1.5">
        {isWin  ? <TrendingUp   size={9} className="text-cyan-400" />
        : isLoss ? <TrendingDown size={9} className="text-red-400" />
        : <Minus size={9} className="text-gray-500" />}
        <span className="text-gray-400">{date}</span>
        <span className="text-gray-600">{trade.direction === 'long' ? 'L' : 'S'}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-gray-600">${trade.entryPrice.toFixed(2)}</span>
        <span className={isWin ? 'text-cyan-400' : isLoss ? 'text-red-400' : 'text-gray-500'}>
          {trade.pnlPercent >= 0 ? '+' : ''}{trade.pnlPercent}%
        </span>
      </div>
    </div>
  );
}

export default function BacktestPanel({ symbol }: { symbol: string }) {
  const [timeframe, setTimeframe] = useState<BtTimeframe>('1D');
  const [strategy,  setStrategy]  = useState('all');
  const [loading,   setLoading]   = useState(false);
  const [result,    setResult]    = useState<BacktestResult | null>(null);
  const [error,     setError]     = useState('');

  async function run() {
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const qs = new URLSearchParams({ symbol, timeframe });
      if (strategy !== 'all') qs.set('strategy', strategy);
      const { data } = await axios.get(`/api/backtest?${qs}`);
      setResult(data);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Backtest failed — check console for details');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full bg-black border-l border-[#1a1a1a] overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#1a1a1a] flex items-center gap-2 shrink-0">
        <FlaskConical size={13} className="text-cyan-400" />
        <span className="text-sm font-semibold text-white">Backtest</span>
        <span className="text-xs text-gray-500 font-mono">{symbol}</span>
      </div>

      {/* Controls */}
      <div className="p-4 space-y-3 border-b border-[#1a1a1a] shrink-0">
        {/* Timeframe */}
        <div>
          <div className="text-[9px] text-gray-600 uppercase tracking-widest mb-2">Timeframe</div>
          <div className="flex gap-1 flex-wrap">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-2 py-0.5 text-[10px] font-mono rounded transition-all border ${
                  timeframe === tf
                    ? 'bg-cyan-400/15 text-cyan-400 border-cyan-400/30'
                    : 'text-gray-500 hover:text-gray-300 bg-[#0d0d0d] border-[#1a1a1a]'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        {/* Strategy */}
        <div>
          <div className="text-[9px] text-gray-600 uppercase tracking-widest mb-2">Strategy</div>
          <select
            value={strategy}
            onChange={(e) => setStrategy(e.target.value)}
            className="w-full bg-[#0d0d0d] border border-[#1a1a1a] text-white text-xs rounded px-2 py-1.5 outline-none focus:border-cyan-400/40"
          >
            {STRATEGIES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        <button
          onClick={run}
          disabled={loading}
          className="w-full py-2 bg-cyan-400/10 hover:bg-cyan-400/20 text-cyan-400 border border-cyan-400/30 rounded text-xs font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Running…' : 'Run Backtest'}
        </button>

        {error && (
          <div className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded px-3 py-2">
            {error}
          </div>
        )}
      </div>

      {/* Results */}
      {result ? (
        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
          {/* Metrics grid */}
          <div className="grid grid-cols-2 gap-2">
            <Metric
              label="Win Rate"
              value={`${result.winRate}%`}
              sub={`${result.wins}W / ${result.losses}L`}
              color={result.winRate >= 50 ? 'text-cyan-400' : 'text-orange-400'}
            />
            <Metric
              label="Total P&amp;L"
              value={`${result.totalPnlPercent >= 0 ? '+' : ''}${result.totalPnlPercent}%`}
              color={result.totalPnlPercent >= 0 ? 'text-cyan-400' : 'text-red-400'}
            />
            <Metric
              label="Avg R:R"
              value={result.avgRR.toFixed(2)}
              sub="actual risk/reward"
            />
            <Metric
              label="Max Drawdown"
              value={`${result.maxDrawdown.toFixed(1)}%`}
              color={result.maxDrawdown > 10 ? 'text-red-400' : 'text-orange-400'}
            />
          </div>

          <Metric
            label="Total Trades"
            value={String(result.totalTrades)}
            sub={`${result.timeframe} bars · ${result.strategy}`}
          />

          {/* Trade list */}
          {result.trades.length > 0 ? (
            <div>
              <div className="text-[9px] text-gray-600 uppercase tracking-widest mb-2">
                Trades ({result.trades.length})
              </div>
              <div className="space-y-1">
                {result.trades.slice(0, 60).map((t, i) => (
                  <TradeRow key={i} trade={t} />
                ))}
                {result.trades.length > 60 && (
                  <div className="text-[10px] text-gray-700 text-center py-1">
                    + {result.trades.length - 60} more
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-6 text-gray-600 text-xs">
              No trades generated — try a different strategy or timeframe
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <FlaskConical size={28} className="text-gray-800 mx-auto mb-3" />
            <p className="text-gray-600 text-sm">Select settings above</p>
            <p className="text-gray-700 text-xs mt-1">then click Run Backtest</p>
          </div>
        </div>
      )}
    </div>
  );
}
