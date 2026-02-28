'use client';

import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';

interface NewsItem {
  title:       string;
  url:         string;
  publisher:   string;
  publishedAt: number;
}

function timeAgo(unixSec: number): string {
  const diff = Math.floor(Date.now() / 1000) - unixSec;
  if (diff < 60)    return `${diff}s`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export default function NewsPanel({ symbol }: { symbol: string }) {
  const [items,   setItems]   = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!symbol) return;
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`/api/news/symbol?symbol=${symbol}`);
      setItems(res.data.items ?? []);
    } catch {
      setError('Could not load news');
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => { load(); }, [load]);

  return (
    <aside className="w-72 shrink-0 border-l border-gray-800 flex flex-col overflow-hidden bg-[#0a0a0a]">
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-800 flex items-center justify-between">
        <span className="text-[11px] font-semibold text-gray-400 tracking-widest uppercase">
          {symbol} News
        </span>
        <button
          onClick={load}
          className="text-gray-600 hover:text-gray-300 transition-colors text-[10px]"
          title="Refresh"
        >
          ↻
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center h-24 gap-2 text-gray-600 text-xs">
            <span className="w-3 h-3 border border-[#26a69a]/30 border-t-[#26a69a] rounded-full animate-spin" />
            Loading…
          </div>
        )}

        {error && !loading && (
          <p className="text-center text-[11px] text-red-500 mt-6 px-3">{error}</p>
        )}

        {!loading && !error && items.length === 0 && (
          <p className="text-center text-[11px] text-gray-600 mt-6 px-3">No news found for {symbol}</p>
        )}

        {!loading && items.map((item, i) => (
          <a
            key={i}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block px-3 py-2.5 border-b border-gray-900 hover:bg-white/[0.03] transition-colors"
          >
            <p className="text-[11px] text-gray-200 leading-snug line-clamp-3">
              {item.title}
            </p>
            <div className="mt-1 flex items-center gap-1.5 text-[9px] text-gray-600">
              <span className="truncate max-w-[140px]">{item.publisher}</span>
              <span>·</span>
              <span className="shrink-0">{timeAgo(item.publishedAt)}</span>
            </div>
          </a>
        ))}
      </div>
    </aside>
  );
}
