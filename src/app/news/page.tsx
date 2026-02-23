'use client';

import { useState } from 'react';
import Navbar from '@/components/layout/Navbar';
import NewsFeed from '@/components/news/NewsFeed';
import CandleChart from '@/components/charts/CandleChart';
import { Search } from 'lucide-react';

export default function NewsPage() {
  const [symbol, setSymbol] = useState('AAPL');
  const [input, setInput] = useState('AAPL');
  const [showChart, setShowChart] = useState(false);

  const handleSearch = () => {
    const s = input.trim().toUpperCase();
    if (s) setSymbol(s);
  };

  return (
    <div className="flex flex-col h-screen bg-black text-white overflow-hidden">
      <Navbar />
      <div className="flex flex-col flex-1 overflow-hidden mt-14">
        {/* Search bar */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-[#111] bg-[#050505]">
          <div className="flex gap-2 flex-1 max-w-xs">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Enter symbol..."
              className="flex-1 bg-[#0d0d0d] border border-[#1a1a1a] rounded px-3 py-1.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-cyan-400/30"
            />
            <button
              onClick={handleSearch}
              className="px-3 py-1.5 rounded border border-cyan-400/20 text-cyan-400 hover:bg-cyan-400/10 transition-all"
            >
              <Search size={14} />
            </button>
          </div>
          <button
            onClick={() => setShowChart(!showChart)}
            className={`text-xs px-3 py-1.5 rounded border transition-all ${
              showChart ? 'border-cyan-400/30 text-cyan-400 bg-cyan-400/10' : 'border-[#222] text-gray-500 hover:text-gray-300'
            }`}
          >
            {showChart ? 'Hide Chart' : 'Show Chart'}
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className={showChart ? 'w-1/2 border-r border-[#111] overflow-hidden' : 'flex-1 max-w-2xl mx-auto overflow-hidden'}>
            <NewsFeed symbol={symbol} />
          </div>
          {showChart && (
            <div className="flex-1 overflow-hidden">
              <CandleChart symbol={symbol} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
