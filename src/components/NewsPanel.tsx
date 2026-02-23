'use client';

import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import type { NewsItem } from '@/app/api/news/route';

interface Props {
  symbol: string;
}

function timeAgo(unixSec: number): string {
  const diff = Math.floor(Date.now() / 1000) - unixSec;
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function NewsPanel({ symbol }: Props) {
  const [items, setItems]     = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!symbol) return;
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get('/api/news', { params: { symbol } });
      setItems(res.data.items || []);
    } catch {
      setError('Could not load news');
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => { fetch(); }, [fetch]);

  return (
    <aside className="flex flex-col w-[320px] shrink-0 border-l border-[#111] bg-[#040404] overflow-hidden">

      {/* Panel header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#111] shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold tracking-widest text-gray-600 uppercase">News</span>
          <span className="text-[10px] text-gray-700 font-mono">{symbol}</span>
        </div>
        <button
          onClick={fetch}
          disabled={loading}
          className="text-gray-700 hover:text-gray-400 transition-colors disabled:opacity-40"
          title="Refresh"
        >
          <svg className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M23 4v6h-6M1 20v-6h6" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-[#1a1a1a]">

        {loading && items.length === 0 && (
          <div className="flex items-center justify-center h-24">
            <span className="w-4 h-4 border-2 border-[#26a69a]/30 border-t-[#26a69a] rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center h-24">
            <p className="text-[11px] text-[#ef5350]">{error}</p>
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <div className="flex items-center justify-center h-24">
            <p className="text-[11px] text-gray-700">No news found</p>
          </div>
        )}

        <ul className="divide-y divide-[#0d0d0d]">
          {items.map((item) => (
            <li key={item.id}>
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex gap-2.5 p-3 hover:bg-[#0a0a0a] transition-colors group"
              >
                {/* Thumbnail */}
                {item.thumbnail && (
                  <img
                    src={item.thumbnail}
                    alt=""
                    className="w-14 h-14 rounded object-cover shrink-0 opacity-80 group-hover:opacity-100 transition-opacity"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                )}

                <div className="flex flex-col gap-1 min-w-0">
                  <p className="text-[12px] leading-snug text-gray-300 group-hover:text-white transition-colors line-clamp-3">
                    {item.title}
                  </p>
                  <div className="flex items-center gap-1.5 mt-auto">
                    <span className="text-[10px] text-gray-700 truncate">{item.publisher}</span>
                    <span className="text-[10px] text-gray-800">·</span>
                    <span className="text-[10px] text-gray-700 shrink-0">{timeAgo(item.publishedAt)}</span>
                  </div>
                </div>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
