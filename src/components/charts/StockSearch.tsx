'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';
import axios from 'axios';

interface SearchResult {
  symbol: string;
  displaySymbol: string;
  description: string;
  type: string;
}

interface Props {
  onSelect: (symbol: string) => void;
  initialSymbol?: string;
}

export default function StockSearch({ onSelect, initialSymbol }: Props) {
  const [query,   setQuery]   = useState(initialSymbol || '');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open,    setOpen]    = useState(false);

  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounced search
  useEffect(() => {
    if (query.length < 1) { setResults([]); setOpen(false); return; }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await axios.get(`/api/search?q=${encodeURIComponent(query)}`);
        const filtered: SearchResult[] = (data.result || [])
          .filter((r: SearchResult) => r.type === 'Common Stock')
          .slice(0, 8);
        setResults(filtered);
        setOpen(filtered.length > 0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 280);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  // Close on outside click
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  function handleSelect(symbol: string) {
    setQuery(symbol);
    setOpen(false);
    setResults([]);
    onSelect(symbol);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && query.trim()) {
      handleSelect(query.trim().toUpperCase());
    }
  }

  return (
    <div ref={containerRef} className="relative w-64">
      <div className="flex items-center gap-2 bg-[#0d0d0d] border border-[#1a1a1a] rounded-lg px-3 py-1.5 focus-within:border-cyan-400/40 transition-colors">
        <Search size={13} className="text-gray-500 shrink-0" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value.toUpperCase())}
          onFocus={() => results.length > 0 && setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search symbol…"
          className="flex-1 bg-transparent text-white text-sm font-mono outline-none placeholder-gray-600 min-w-0"
        />
        {query && (
          <button onClick={() => { setQuery(''); setResults([]); setOpen(false); }}>
            <X size={11} className="text-gray-500 hover:text-gray-300" />
          </button>
        )}
        {loading && (
          <div className="w-3 h-3 border border-cyan-400/40 border-t-cyan-400 rounded-full animate-spin shrink-0" />
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute top-full mt-1 left-0 right-0 bg-[#0d0d0d] border border-[#1a1a1a] rounded-lg overflow-hidden z-50 shadow-2xl">
          {results.map((r) => (
            <button
              key={r.symbol}
              onClick={() => handleSelect(r.symbol)}
              className="w-full px-3 py-2 text-left hover:bg-white/5 transition-colors border-b border-[#111] last:border-0"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-mono font-bold text-white">{r.displaySymbol}</span>
                <span className="text-[9px] text-gray-600 bg-[#111] px-1.5 py-0.5 rounded shrink-0">
                  {r.type}
                </span>
              </div>
              <div className="text-[11px] text-gray-500 truncate mt-0.5">{r.description}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
