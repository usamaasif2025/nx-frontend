'use client';

import { useState } from 'react';
import Navbar from '@/components/layout/Navbar';
import WatchlistPanel from '@/components/watchlist/WatchlistPanel';
import CandleChart from '@/components/charts/CandleChart';
import StrategyEngine from '@/components/strategies/StrategyEngine';

export default function WatchlistPage() {
  const [activeSymbol, setActiveSymbol] = useState<string | null>(null);

  return (
    <div className="flex flex-col h-screen bg-black text-white overflow-hidden">
      <Navbar />
      <div className="flex flex-1 overflow-hidden mt-14">
        <div className="w-72 shrink-0 border-r border-[#111] overflow-hidden">
          <WatchlistPanel onSelectSymbol={setActiveSymbol} />
        </div>
        <div className="flex-1 flex flex-col overflow-hidden border-r border-[#111]">
          {activeSymbol
            ? <CandleChart symbol={activeSymbol} />
            : (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-gray-600 text-sm">Select a watchlist stock to view chart</p>
              </div>
            )
          }
        </div>
        <div className="w-96 shrink-0 overflow-hidden">
          <StrategyEngine symbol={activeSymbol || ''} />
        </div>
      </div>
    </div>
  );
}
