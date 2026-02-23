'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Search, X, BarChart2 } from 'lucide-react';

const FullScreenChart = dynamic(
  () => import('@/components/charts/FullScreenChart'),
  { ssr: false, loading: () => <ChartPlaceholder /> }
);

const POPULAR_STOCKS = [
  'AAPL', 'TSLA', 'NVDA', 'MSFT', 'AMZN',
  'META', 'GOOGL', 'SPY', 'QQQ', 'AMD',
];

function ChartPlaceholder() {
  return (
    <div className="flex-1 flex items-center justify-center bg-black">
      <div className="flex flex-col items-center gap-3">
        <BarChart2 size={32} className="text-gray-700" />
        <p className="text-gray-600 text-sm">Loading chart...</p>
      </div>
    </div>
  );
}

function ChartPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [symbol, setSymbol] = useState(searchParams.get('symbol')?.toUpperCase() || 'AAPL');
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep URL in sync with selected symbol
  useEffect(() => {
    router.replace(`/chart?symbol=${symbol}`, { scroll: false });
  }, [symbol, router]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const s = input.trim().toUpperCase();
    if (s) {
      setSymbol(s);
      setInput('');
      inputRef.current?.blur();
    }
  };

  const handlePopular = (s: string) => {
    setSymbol(s);
    setInput('');
  };

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] bg-black">

      {/* ── Search & Quick Picks ──────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-[#1a1a1a] bg-[#040404] flex-shrink-0 flex-wrap gap-y-2">

        {/* Search form */}
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <div className="relative flex items-center">
            <Search size={13} className="absolute left-2.5 text-gray-600 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value.toUpperCase().replace(/[^A-Z.]/g, ''))}
              placeholder="Enter symbol — AAPL, TSLA, NVDA…"
              className="pl-8 pr-8 py-1.5 bg-[#111] border border-[#252525] rounded text-sm text-white placeholder-gray-600 focus:outline-none focus:border-cyan-400/50 w-64 font-mono tracking-wide"
              maxLength={10}
            />
            {input && (
              <button
                type="button"
                onClick={() => setInput('')}
                className="absolute right-2 text-gray-600 hover:text-white"
              >
                <X size={12} />
              </button>
            )}
          </div>
          <button
            type="submit"
            className="px-3 py-1.5 bg-cyan-400/10 border border-cyan-400/30 text-cyan-400 rounded text-xs font-medium hover:bg-cyan-400/20 transition-colors"
          >
            Load Chart
          </button>
        </form>

        {/* Popular symbols quick-pick */}
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[10px] text-gray-700 mr-0.5">Quick:</span>
          {POPULAR_STOCKS.map((s) => (
            <button
              key={s}
              onClick={() => handlePopular(s)}
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium transition-all ${
                symbol === s
                  ? 'bg-cyan-400/15 text-cyan-400 border border-cyan-400/20'
                  : 'text-gray-500 hover:text-white hover:bg-white/5 border border-transparent'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* ── Chart ────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0">
        <FullScreenChart key={symbol} symbol={symbol} />
      </div>
    </div>
  );
}

export default function ChartPage() {
  return (
    <Suspense fallback={<ChartPlaceholder />}>
      <ChartPageInner />
    </Suspense>
  );
}
