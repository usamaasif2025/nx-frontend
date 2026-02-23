'use client';

import { useState } from 'react';
import Navbar       from '@/components/layout/Navbar';
import StockSearch  from '@/components/charts/StockSearch';
import TradingChart from '@/components/charts/TradingChart';
import BacktestPanel from '@/components/charts/BacktestPanel';
import { BarChart2, FlaskConical } from 'lucide-react';

export default function ChartsPage() {
  const [symbol,       setSymbol]       = useState('AAPL');
  const [showBacktest, setShowBacktest] = useState(false);

  return (
    <div className="flex flex-col h-screen bg-black text-white overflow-hidden">
      <Navbar />

      {/* ── Page toolbar ────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#1a1a1a] mt-14 bg-[#050505] shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <BarChart2 size={14} className="text-cyan-400" />
            <span className="text-sm font-semibold text-white">Charts</span>
          </div>
          <StockSearch onSelect={setSymbol} initialSymbol={symbol} />
        </div>

        <button
          onClick={() => setShowBacktest((v) => !v)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border transition-all ${
            showBacktest
              ? 'bg-cyan-400/15 text-cyan-400 border-cyan-400/30'
              : 'text-gray-400 border-[#1a1a1a] hover:text-white hover:bg-white/5'
          }`}
        >
          <FlaskConical size={12} />
          Backtest
        </button>
      </div>

      {/* ── Main area ───────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Chart */}
        <div className="flex-1 min-w-0">
          <TradingChart symbol={symbol} />
        </div>

        {/* Backtest panel — toggled via button */}
        {showBacktest && (
          <div className="w-72 shrink-0 overflow-hidden">
            <BacktestPanel symbol={symbol} />
          </div>
        )}
      </div>
    </div>
  );
}
