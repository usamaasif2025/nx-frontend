'use client';

import { useEffect, useState, useCallback } from 'react';
import { NewsItem, NewsImpact } from '@/types';
import { useWatchlistStore } from '@/store/watchlistStore';
import axios from 'axios';
import { Newspaper, ExternalLink, Plus, Minus, TrendingUp, TrendingDown, Minus as MinusIcon } from 'lucide-react';

const IMPACT_CONFIG: Record<NewsImpact, { label: string; color: string; bg: string; border: string }> = {
  high_bullish:    { label: '🔥 HIGH BULL',  color: 'text-cyan-400',   bg: 'bg-cyan-400/10',   border: 'border-cyan-400/30' },
  medium_bullish:  { label: '↑ BULLISH',     color: 'text-cyan-300',   bg: 'bg-cyan-400/5',    border: 'border-cyan-400/20' },
  low_bullish:     { label: '↗ MILD BULL',   color: 'text-cyan-500',   bg: 'bg-cyan-400/5',    border: 'border-cyan-400/10' },
  neutral:         { label: '— NEUTRAL',     color: 'text-gray-500',   bg: 'bg-white/5',       border: 'border-white/10'    },
  low_bearish:     { label: '↘ MILD BEAR',   color: 'text-orange-500', bg: 'bg-orange-500/5',  border: 'border-orange-500/10' },
  medium_bearish:  { label: '↓ BEARISH',     color: 'text-orange-400', bg: 'bg-orange-500/5',  border: 'border-orange-500/20' },
  high_bearish:    { label: '🔥 HIGH BEAR',  color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30' },
};

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts * 1000) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function NewsCard({ item }: { item: NewsItem }) {
  const { hasSymbol, addItem, removeItem } = useWatchlistStore();
  const inWatchlist = hasSymbol(item.symbol);
  const cfg = IMPACT_CONFIG[item.impact];
  const isPositive = item.impactScore > 0;
  const isNegative = item.impactScore < 0;

  return (
    <div className={`rounded border ${cfg.border} ${cfg.bg} p-3 slide-in`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-white font-bold text-xs">{item.symbol}</span>
          <span className={`text-[10px] font-semibold ${cfg.color}`}>{cfg.label}</span>
          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
            isPositive ? 'bg-cyan-400/10 text-cyan-400' :
            isNegative ? 'bg-orange-400/10 text-orange-400' :
            'bg-white/5 text-gray-500'
          }`}>
            {isPositive ? '+' : ''}{item.impactScore.toFixed(1)}
          </span>
        </div>
        <span className="text-gray-600 text-[10px] shrink-0">{timeAgo(item.publishedAt)}</span>
      </div>

      <p className="text-gray-200 text-xs leading-relaxed mb-2">{item.headline}</p>

      {item.summary && (
        <p className="text-gray-500 text-[11px] leading-relaxed mb-2 line-clamp-2">{item.summary}</p>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-gray-600 text-[10px]">{item.source}</span>
          <a href={item.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
            className="text-gray-600 hover:text-cyan-400 transition-colors">
            <ExternalLink size={10} />
          </a>
        </div>

        {/* Watchlist action */}
        <div className="flex items-center gap-1.5">
          {isPositive && !inWatchlist && (
            <span className="text-[10px] text-cyan-400/60">+ watchlist?</span>
          )}
          {isNegative && inWatchlist && (
            <span className="text-[10px] text-orange-400/60">- watchlist?</span>
          )}
          <button
            onClick={() => {
              if (inWatchlist) removeItem(item.symbol);
              else addItem({
                symbol: item.symbol, name: item.symbol, addedAt: Date.now(),
                addedReason: `News: ${item.headline.slice(0, 50)}...`,
                currentPrice: 0, changePercent: 0, tags: ['news'], pinned: false,
              });
            }}
            className={`p-1 rounded border transition-all ${
              inWatchlist
                ? 'border-orange-400/20 text-orange-400 hover:bg-orange-400/10'
                : 'border-cyan-400/15 text-cyan-400 hover:bg-cyan-400/10'
            }`}
          >
            {inWatchlist ? <Minus size={10} /> : <Plus size={10} />}
          </button>
        </div>
      </div>
    </div>
  );
}

interface NewsSummary {
  count: number;
  avgScore: number;
  topImpactScore: number;
  bullish: number;
  bearish: number;
  addToWatchlist: boolean;
  removeFromWatchlist: boolean;
}

export default function NewsFeed({ symbol }: { symbol: string }) {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [summary, setSummary] = useState<NewsSummary | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchNews = useCallback(async () => {
    if (!symbol) return;
    setLoading(true);
    try {
      const { data } = await axios.get(`/api/news?symbol=${symbol}`);
      setNews(data.news || []);
      setSummary(data.summary || null);
    } catch {
      setNews([]);
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => { fetchNews(); }, [fetchNews]);

  if (!symbol) return (
    <div className="flex items-center justify-center h-full text-gray-600 text-sm">
      Select a stock to view news
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#1a1a1a]">
        <div className="flex items-center gap-2">
          <Newspaper size={13} className="text-cyan-400" />
          <span className="text-sm font-semibold text-white">{symbol} News</span>
        </div>
        {summary && (
          <div className="flex items-center gap-2 text-[10px]">
            <span className="text-cyan-400">{summary.bullish}↑</span>
            <span className="text-orange-400">{summary.bearish}↓</span>
            <span className={`font-bold ${summary.avgScore > 0 ? 'text-cyan-400' : summary.avgScore < 0 ? 'text-orange-400' : 'text-gray-500'}`}>
              avg: {summary.avgScore > 0 ? '+' : ''}{summary.avgScore}
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-1">
            <Newspaper size={16} className="text-cyan-400/50 mx-auto animate-pulse" />
            <p className="text-gray-600 text-xs">Loading news...</p>
          </div>
        </div>
      ) : news.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-600 text-sm">No news found for {symbol}</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {news.map((item) => <NewsCard key={item.id} item={item} />)}
        </div>
      )}
    </div>
  );
}
