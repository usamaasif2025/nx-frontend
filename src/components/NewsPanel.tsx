'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import axios from 'axios';
import type { NewsItem, NewsCategory, NewsSentiment } from '@/app/api/news/route';

interface Props {
  symbol: string;
}

const AUTO_REFRESH_MS = 10_000;

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(unixSec: number): string {
  const diff = Math.floor(Date.now() / 1000) - unixSec;
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const CATEGORY_META: Record<NewsCategory, { label: string; cls: string }> = {
  'FDA Approval':         { label: 'FDA',      cls: 'bg-purple-900/50 text-purple-300 border-purple-700/60' },
  'Clinical Trial':       { label: 'TRIAL',    cls: 'bg-blue-900/50 text-blue-300 border-blue-700/60' },
  'Merger & Acquisition': { label: 'M&A',      cls: 'bg-orange-900/50 text-orange-300 border-orange-700/60' },
  'Partnership':          { label: 'DEAL',     cls: 'bg-cyan-900/50 text-cyan-300 border-cyan-700/60' },
  'Government Contract':  { label: 'GOV',      cls: 'bg-amber-900/50 text-amber-300 border-amber-700/60' },
  'Major Investment':     { label: 'INVEST',   cls: 'bg-emerald-900/50 text-emerald-300 border-emerald-700/60' },
  'Geopolitical':         { label: 'GEO',      cls: 'bg-red-900/50 text-red-300 border-red-700/60' },
  'Earnings':             { label: 'EARN',     cls: 'bg-sky-900/50 text-sky-300 border-sky-700/60' },
  'Analyst Rating':       { label: 'ANALYST',  cls: 'bg-indigo-900/50 text-indigo-300 border-indigo-700/60' },
  'General':              { label: '',         cls: '' },
};

const SENTIMENT_CLS: Record<NewsSentiment, string> = {
  bullish: 'bg-[#26a69a]',
  bearish: 'bg-[#ef5350]',
  neutral: 'bg-gray-600',
};

// ── Sub-components ────────────────────────────────────────────────────────────

function CategoryBadge({ category }: { category: NewsCategory }) {
  const { label, cls } = CATEGORY_META[category];
  if (!label) return null;
  return (
    <span className={`inline-flex items-center px-1 py-0.5 rounded text-[8px] font-bold tracking-wider border ${cls}`}>
      {label}
    </span>
  );
}

function SentimentDot({ sentiment }: { sentiment: NewsSentiment }) {
  return (
    <span
      className={`w-1.5 h-1.5 rounded-full shrink-0 ${SENTIMENT_CLS[sentiment]}`}
      title={sentiment}
    />
  );
}

function CatalystItem({ item }: { item: NewsItem }) {
  return (
    <li>
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex flex-col gap-1.5 px-3 py-2.5 border-l-2 border-amber-500/50 bg-amber-950/10 hover:bg-amber-950/20 transition-colors group"
      >
        <div className="flex items-center gap-1.5">
          <CategoryBadge category={item.category} />
          <SentimentDot sentiment={item.sentiment} />
        </div>
        <p className="text-[12px] leading-snug text-gray-200 group-hover:text-white transition-colors line-clamp-3">
          {item.title}
        </p>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-gray-600 truncate">{item.publisher}</span>
          <span className="text-[10px] text-gray-700">·</span>
          <span className="text-[10px] text-gray-600 shrink-0">{timeAgo(item.publishedAt)}</span>
        </div>
      </a>
    </li>
  );
}

function RegularItem({ item }: { item: NewsItem }) {
  return (
    <li>
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex gap-2.5 p-3 hover:bg-[#0a0a0a] transition-colors group"
      >
        {item.thumbnail && (
          <img
            src={item.thumbnail}
            alt=""
            className="w-14 h-14 rounded object-cover shrink-0 opacity-75 group-hover:opacity-100 transition-opacity"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        )}
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <CategoryBadge category={item.category} />
            <SentimentDot sentiment={item.sentiment} />
          </div>
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
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function NewsPanel({ symbol }: Props) {
  const [items, setItems]             = useState<NewsItem[]>([]);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const fetchingRef                   = useRef(false);

  const doFetch = useCallback(async (silent = false) => {
    if (fetchingRef.current || !symbol) return;
    fetchingRef.current = true;
    if (!silent) { setLoading(true); setError(null); }
    try {
      const res = await axios.get('/api/news', { params: { symbol } });
      setItems(res.data.items || []);
      setLastUpdated(new Date());
    } catch {
      if (!silent) setError('Could not load news');
    } finally {
      fetchingRef.current = false;
      if (!silent) setLoading(false);
    }
  }, [symbol]);

  // Initial load
  useEffect(() => { doFetch(); }, [doFetch]);

  // Auto-refresh every 10s (pauses when tab is hidden)
  useEffect(() => {
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        doFetch(true);
      }
    }, AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [doFetch]);

  const pinned  = items.filter(i => i.isPinned);
  const regular = items.filter(i => !i.isPinned);

  const updatedStr = lastUpdated
    ? lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    : null;

  return (
    <aside className="flex flex-col w-[320px] shrink-0 border-l border-[#111] bg-[#040404] overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#111] shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold tracking-widest text-gray-600 uppercase">News</span>
          <span className="text-[10px] text-gray-700 font-mono">{symbol}</span>
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" title="Auto-refresh every 10s" />
        </div>
        <div className="flex items-center gap-2">
          {updatedStr && (
            <span className="text-[9px] text-gray-700 font-mono">{updatedStr}</span>
          )}
          <button
            onClick={() => doFetch()}
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

        {/* Catalyst / high-impact section */}
        {pinned.length > 0 && (
          <section>
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-950/20 border-b border-amber-900/30">
              <span className="text-[9px] font-bold tracking-widest text-amber-500 uppercase">⚡ Catalyst</span>
              <span className="text-[9px] text-amber-700 font-mono">{pinned.length}</span>
            </div>
            <ul className="divide-y divide-[#0d0d0d]">
              {pinned.map(item => (
                <CatalystItem key={item.id} item={item} />
              ))}
            </ul>
            <div className="h-px bg-[#111] my-1" />
          </section>
        )}

        {/* Regular news */}
        {regular.length > 0 && (
          <ul className="divide-y divide-[#0d0d0d]">
            {regular.map(item => (
              <RegularItem key={item.id} item={item} />
            ))}
          </ul>
        )}

      </div>
    </aside>
  );
}
