'use client';

import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';

interface NewsItem {
  title:       string;
  url:         string;
  publisher:   string;
  publishedAt: number;
}

const ET_TIME = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false });
const ET_DAY  = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });

function fmtTime(unixSec: number): string {
  const d       = new Date(unixSec * 1000);
  const timeStr = ET_TIME.format(d);
  const artDay  = ET_DAY.format(d);
  const todDay  = ET_DAY.format(new Date());
  if (artDay === todDay) return timeStr + ' ET';
  const diff = Math.floor((Date.now() / 1000 - unixSec) / 86_400);
  if (diff <= 1) return 'yest ' + timeStr;
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'numeric', day: 'numeric' }).format(d) + ' ' + timeStr;
}

function timeAgo(unixSec: number): string {
  const diff = Math.floor(Date.now() / 1000) - unixSec;
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
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
    <aside className="w-72 shrink-0 border-l border-[#111] flex flex-col overflow-hidden bg-[#050505]">
      {/* Header */}
      <div className="px-3 py-1.5 border-b border-[#111] flex items-center justify-between shrink-0">
        <span className="text-[10px] font-black tracking-[0.15em] text-[#26a69a] uppercase">
          {symbol} News
        </span>
        <button
          onClick={load}
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
      <div className="flex-1 overflow-y-auto">
        {loading && items.length === 0 && (
          <div className="flex items-center justify-center h-24 gap-2 text-gray-600 text-[10px]">
            <span className="w-3 h-3 border border-[#26a69a]/30 border-t-[#26a69a] rounded-full animate-spin" />
            Loading…
          </div>
        )}

        {error && !loading && (
          <p className="text-center text-[11px] text-[#ef5350] mt-6 px-3">{error}</p>
        )}

        {!loading && !error && items.length === 0 && (
          <p className="text-center text-[11px] text-gray-700 mt-6 px-3">No news found for {symbol}</p>
        )}

        {items.map((item, i) => (
          <a
            key={i}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block px-3 py-2 border-b border-[#0d0d0d] hover:bg-white/[0.03] transition-colors group"
          >
            <p className="text-[11px] text-gray-300 group-hover:text-gray-100 leading-snug line-clamp-3 transition-colors">
              {item.title}
            </p>
            <div className="mt-1 flex items-center gap-2 text-[9px] text-gray-700">
              <span className="font-mono tabular-nums text-gray-600">{fmtTime(item.publishedAt)}</span>
              <span>·</span>
              <span className="tabular-nums font-mono">{timeAgo(item.publishedAt)}</span>
              <span>·</span>
              <span className="truncate">{item.publisher}</span>
            </div>
          </a>
        ))}
      </div>
    </aside>
  );
}
