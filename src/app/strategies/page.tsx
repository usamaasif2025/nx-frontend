'use client';

import { useState } from 'react';
import Navbar from '@/components/layout/Navbar';
import StrategyEngine from '@/components/strategies/StrategyEngine';
import CandleChart from '@/components/charts/CandleChart';
import { Search } from 'lucide-react';

const POPULAR = ['AAPL', 'TSLA', 'NVDA', 'AMD', 'SPY', 'QQQ', 'AMZN', 'MSFT'];

export default function StrategiesPage() {
  const [symbol, setSymbol] = useState('NVDA');
  const [input, setInput] = useState('NVDA');

  const handleSearch = () => {
    const s = input.trim().toUpperCase();
    if (s) setSymbol(s);
  };

  return (
    <div className="flex flex-col h-screen bg-black text-white overflow-hidden">
      <Navbar />
      <div className="flex flex-col flex-1 overflow-hidden mt-14">
        {/* Search */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-[#111] bg-[#050505]">
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Enter symbol..."
              className="bg-[#0d0d0d] border border-[#1a1a1a] rounded px-3 py-1.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-cyan-400/30 w-40"
            />
            <button
              onClick={handleSearch}
              className="px-3 py-1.5 rounded border border-cyan-400/20 text-cyan-400 hover:bg-cyan-400/10 transition-all"
            >
              <Search size={14} />
            </button>
          </div>
          <div className="flex items-center gap-1">
            {POPULAR.map((s) => (
              <button
                key={s}
                onClick={() => { setSymbol(s); setInput(s); }}
                className={`px-2 py-1 rounded text-[10px] font-medium transition-all ${
                  symbol === s
                    ? 'bg-cyan-400/15 text-cyan-400 border border-cyan-400/30'
                    : 'text-gray-500 hover:text-gray-300 border border-[#1a1a1a]'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-hidden border-r border-[#111]">
            <CandleChart symbol={symbol} />
          </div>
          <div className="w-[420px] shrink-0 overflow-hidden">
            <StrategyEngine symbol={symbol} />
          </div>
        </div>
      </div>
    </div>
  );
}
