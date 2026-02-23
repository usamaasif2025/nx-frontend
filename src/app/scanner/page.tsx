'use client';

import { useState } from 'react';
import Navbar from '@/components/layout/Navbar';
import ScannerTable from '@/components/scanner/ScannerTable';
import CandleChart from '@/components/charts/CandleChart';
import NewsFeed from '@/components/news/NewsFeed';
import StrategyEngine from '@/components/strategies/StrategyEngine';
import WatchlistPanel from '@/components/watchlist/WatchlistPanel';
import { useScannerStore } from '@/store/scannerStore';

export default function ScannerPage() {
  const [activeSymbol, setActiveSymbol] = useState<string | null>(null);
  const { minChangePercent, setMinChange, filterSession, setFilter } = useScannerStore();
  const [rightTab, setRightTab] = useState<'news' | 'strategies'>('strategies');

  const handleSelectStock = (symbol: string) => {
    setActiveSymbol(symbol);
  };

  return (
    <div className="flex flex-col h-screen bg-black text-white overflow-hidden">
      <Navbar />

      {/* Filter bar */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-[#111] mt-14 bg-[#050505]">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-600">Min Change:</span>
          {[5, 7, 10, 15, 20].map((pct) => (
            <button
              key={pct}
              onClick={() => setMinChange(pct)}
              className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                minChangePercent === pct
                  ? 'bg-cyan-400/15 text-cyan-400 border border-cyan-400/30'
                  : 'text-gray-500 hover:text-gray-300 border border-transparent'
              }`}
            >
              {pct}%
            </button>
          ))}
        </div>
        <div className="h-3 w-px bg-[#222]" />
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-600">Session:</span>
          {(['all', 'pre', 'regular', 'post'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all ${
                filterSession === s
                  ? 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
                  : 'text-gray-500 hover:text-gray-300 border border-transparent'
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Main grid */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Scanner table */}
        <div className="w-[480px] shrink-0 border-r border-[#111] flex flex-col overflow-hidden">
          <ScannerTable onSelectStock={handleSelectStock} />
        </div>

        {/* Center: Chart */}
        <div className="flex-1 flex flex-col overflow-hidden border-r border-[#111]">
          {activeSymbol ? (
            <CandleChart symbol={activeSymbol} />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-2">
                <div className="w-12 h-12 rounded-full border border-[#1a1a1a] flex items-center justify-center mx-auto">
                  <span className="text-2xl">📈</span>
                </div>
                <p className="text-gray-600 text-sm">Click a stock in the scanner</p>
                <p className="text-gray-700 text-xs">Chart and analysis will appear here</p>
              </div>
            </div>
          )}
        </div>

        {/* Right: News + Strategy + Watchlist */}
        <div className="w-[380px] shrink-0 flex flex-col overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-[#111]">
            {(['strategies', 'news'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setRightTab(tab)}
                className={`flex-1 py-2.5 text-xs font-medium transition-all ${
                  rightTab === tab
                    ? 'text-cyan-400 border-b-2 border-cyan-400 bg-cyan-400/5'
                    : 'text-gray-500 hover:text-gray-300 border-b-2 border-transparent'
                }`}
              >
                {tab === 'strategies' ? '⚡ Strategies' : '📰 News'}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {rightTab === 'strategies' ? (
              <StrategyEngine symbol={activeSymbol || ''} />
            ) : (
              <NewsFeed symbol={activeSymbol || ''} />
            )}
          </div>

          {/* Bottom: Watchlist */}
          <div className="h-64 border-t border-[#111] flex flex-col overflow-hidden">
            <WatchlistPanel onSelectSymbol={handleSelectStock} />
          </div>
        </div>
      </div>
    </div>
  );
}
