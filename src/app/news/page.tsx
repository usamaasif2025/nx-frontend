'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import axios from 'axios';
import type { NewsCategory, NewsSentiment } from '@/lib/news-fetch';

// ── Types ─────────────────────────────────────────────────────────────────────

type FeedItem = {
  id: string;
  title: string;
  url: string;
  publisher: string;
  publishedAt: number;
  thumbnail: string | null;
  summary: string | null;
  source: string;
  category: NewsCategory;
  sentiment: NewsSentiment;
  isPinned: boolean;
  ticker: string | null;
  bigBeat?: boolean;
};

type FeedResponse = {
  items: FeedItem[];
  sources: Record<string, number>;
  total: number;
  fetchedAt: number;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const AUTO_REFRESH_MS = 30_000;

const SRC: Record<string, { short: string; cls: string; full: string }> = {
  cnbc:         { short: 'CNBC', full: 'CNBC',          cls: 'text-blue-400 bg-blue-950/50 border-blue-900/60' },
  marketwatch:  { short: 'MW',   full: 'MarketWatch',   cls: 'text-emerald-400 bg-emerald-950/50 border-emerald-900/60' },
  wsj:          { short: 'WSJ',  full: 'WSJ',           cls: 'text-rose-400 bg-rose-950/50 border-rose-900/60' },
  benzinga:     { short: 'BZ',   full: 'Benzinga',      cls: 'text-pink-400 bg-pink-950/50 border-pink-900/60' },
  investing:    { short: 'INV',  full: 'Investing.com', cls: 'text-orange-400 bg-orange-950/50 border-orange-900/60' },
  seekingalpha: { short: 'SA',   full: 'Seeking Alpha', cls: 'text-amber-400 bg-amber-950/50 border-amber-900/60' },
  prnewswire:   { short: 'PRN',  full: 'PR Newswire',   cls: 'text-teal-400 bg-teal-950/50 border-teal-900/60' },
  fool:         { short: 'FOOL', full: 'Motley Fool',   cls: 'text-purple-400 bg-purple-950/50 border-purple-900/60' },
  globenewswire:{ short: 'GNW',  full: 'GlobeNewswire', cls: 'text-cyan-400 bg-cyan-950/50 border-cyan-900/60' },
  foxbusiness:  { short: 'FOX',  full: 'Fox Business',  cls: 'text-red-400 bg-red-950/50 border-red-900/60' },
  bbc:          { short: 'BBC',  full: 'BBC Business',  cls: 'text-yellow-400 bg-yellow-950/50 border-yellow-900/60' },
  wallst:       { short: '247W', full: '24/7 Wall St.', cls: 'text-violet-400 bg-violet-950/50 border-violet-900/60' },
  appleinsider: { short: 'APLI', full: 'AppleInsider',  cls: 'text-slate-300 bg-slate-900/50 border-slate-800/60' },
  fortune:      { short: 'FORT', full: 'Fortune',       cls: 'text-amber-300 bg-amber-950/50 border-amber-900/60' },
  techcrunch:   { short: 'TC',   full: 'TechCrunch',    cls: 'text-green-400 bg-green-950/50 border-green-900/60' },
  quartz:       { short: 'QZ',   full: 'Quartz',        cls: 'text-lime-400 bg-lime-950/50 border-lime-900/60' },
  nasdaq:       { short: 'NDQ',  full: 'Nasdaq',          cls: 'text-sky-300 bg-sky-950/50 border-sky-900/60' },
  bloomberg:    { short: 'BBG',  full: 'Bloomberg',       cls: 'text-indigo-300 bg-indigo-950/50 border-indigo-900/60' },
  beincrypto:   { short: 'BIC',  full: 'BeInCrypto',      cls: 'text-orange-300 bg-orange-950/50 border-orange-900/60' },
  blackenterprise:{ short: 'BE',   full: 'Black Enterprise',    cls: 'text-amber-600 bg-amber-950/50 border-amber-800/60' },
  cbs:          { short: 'CBS',  full: 'CBS MoneyWatch',       cls: 'text-neutral-300 bg-neutral-900/50 border-neutral-800/60' },
  coindesk:     { short: 'CD',   full: 'CoinDesk',             cls: 'text-yellow-300 bg-yellow-950/50 border-yellow-900/60' },
  cryptonews:   { short: 'CN',   full: 'Cryptonews',           cls: 'text-rose-300 bg-rose-950/50 border-rose-900/60' },
  commobserver: { short: 'CO',   full: 'Commercial Observer',  cls: 'text-fuchsia-400 bg-fuchsia-950/50 border-fuchsia-900/60' },
  coingape:     { short: 'CG',   full: 'CoinGape',             cls: 'text-emerald-300 bg-emerald-950/50 border-emerald-900/60' },
  ft:           { short: 'FT',   full: 'Financial Times',      cls: 'text-red-300 bg-red-950/50 border-red-900/60' },
  decrypt:      { short: 'DCRY', full: 'Decrypt',              cls: 'text-blue-300 bg-blue-950/50 border-blue-900/60' },
  fastco:       { short: 'FC',   full: 'Fast Company',         cls: 'text-lime-300 bg-lime-950/50 border-lime-900/60' },
  etftrends:    { short: 'ETFT', full: 'ETF Trends',           cls: 'text-teal-300 bg-teal-950/50 border-teal-900/60' },
  digitaltrends:{ short: 'DT',   full: 'Digital Trends',       cls: 'text-violet-300 bg-violet-950/50 border-violet-900/60' },
  engadget:     { short: 'ENG',  full: 'Engadget',             cls: 'text-cyan-300 bg-cyan-950/50 border-cyan-900/60' },
  fiercebio:    { short: 'FBIO', full: 'FierceBiotech',        cls: 'text-purple-300 bg-purple-950/50 border-purple-900/60' },
  dailyupside:  { short: 'DU',   full: 'The Daily Upside',     cls: 'text-sky-400 bg-sky-950/50 border-sky-900/60' },
  theblock:     { short: 'TB',   full: 'The Block',            cls: 'text-indigo-400 bg-indigo-950/50 border-indigo-900/60' },
  pymnts:       { short: 'PYM',  full: 'PYMNTS',               cls: 'text-pink-300 bg-pink-950/50 border-pink-900/60' },
  oilprice:     { short: 'OIL',  full: 'OilPrice.com',         cls: 'text-amber-500 bg-amber-950/50 border-amber-900/60' },
  gurufocus:    { short: 'GF',   full: 'GuruFocus',            cls: 'text-orange-500 bg-orange-950/50 border-orange-900/60' },
  latimes:      { short: 'LAT',  full: 'LA Times',             cls: 'text-slate-400 bg-slate-900/50 border-slate-800/60' },
  time:         { short: 'TIME', full: 'Time',                 cls: 'text-rose-500 bg-rose-950/50 border-rose-900/60' },
  freightwaves: { short: 'FWV',  full: 'FreightWaves',         cls: 'text-fuchsia-300 bg-fuchsia-950/50 border-fuchsia-900/60' },
  housingwire:  { short: 'HW',   full: 'HousingWire',          cls: 'text-zinc-300 bg-zinc-900/50 border-zinc-800/60' },
  nbc:          { short: 'NBC',  full: 'NBC Business',         cls: 'text-neutral-400 bg-neutral-900/50 border-neutral-800/60' },
  google:       { short: 'GGL',  full: 'Google News',          cls: 'text-gray-400 bg-gray-900/50 border-gray-800/60' },
};

const CAT_META: Record<NewsCategory, { label: string; cls: string }> = {
  'FDA Approval':         { label: 'FDA',     cls: 'text-purple-300 bg-purple-950/60 border-purple-800/60' },
  'Clinical Trial':       { label: 'TRIAL',   cls: 'text-blue-300 bg-blue-950/60 border-blue-800/60' },
  'Merger & Acquisition': { label: 'M&A',     cls: 'text-orange-300 bg-orange-950/60 border-orange-800/60' },
  'Partnership':          { label: 'DEAL',    cls: 'text-cyan-300 bg-cyan-950/60 border-cyan-800/60' },
  'Government Contract':  { label: 'GOV',     cls: 'text-amber-300 bg-amber-950/60 border-amber-800/60' },
  'Major Investment':     { label: 'INVEST',  cls: 'text-emerald-300 bg-emerald-950/60 border-emerald-800/60' },
  'Geopolitical':         { label: 'GEO',     cls: 'text-red-300 bg-red-950/60 border-red-800/60' },
  'Earnings':             { label: 'EARN',    cls: 'text-sky-300 bg-sky-950/60 border-sky-800/60' },
  'Analyst Rating':       { label: 'ANALYST', cls: 'text-indigo-300 bg-indigo-950/60 border-indigo-800/60' },
  'General':              { label: '',        cls: '' },
};

const SENT_CLS: Record<NewsSentiment, string> = {
  bullish: 'bg-[#26a69a]',
  bearish: 'bg-[#ef5350]',
  neutral: 'bg-gray-700',
};

const ALL_SOURCES    = Object.keys(SRC) as (keyof typeof SRC)[];
const ALL_CATEGORIES = Object.keys(CAT_META) as NewsCategory[];

// ── Impact score (rule-based, 0-100) ──────────────────────────────────────────

const CAT_BASE_SCORE: Record<NewsCategory, number> = {
  'FDA Approval':         85,
  'Merger & Acquisition': 78,
  'Clinical Trial':       75,
  'Earnings':             72,
  'Major Investment':     65,
  'Government Contract':  62,
  'Analyst Rating':       60,
  'Geopolitical':         58,
  'Partnership':          52,
  'General':              20,
};

function computeScore(item: FeedItem): number {
  let s = CAT_BASE_SCORE[item.category] ?? 20;
  if (item.sentiment === 'bullish') s += 10;
  else if (item.sentiment === 'bearish') s += 5;
  if (item.isPinned) s += 5;
  if (item.bigBeat) s += 10;
  return Math.min(100, s);
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-400';
  if (score >= 65) return 'text-yellow-400';
  if (score >= 50) return 'text-orange-400';
  return 'text-gray-600';
}

// ── Catalyst Mode ─────────────────────────────────────────────────────────────
// Categories shown in Catalyst Mode — the market-moving events the user cares about.
const CATALYST_CATS = new Set<NewsCategory>([
  'FDA Approval', 'Clinical Trial', 'Earnings',
  'Merger & Acquisition', 'Major Investment',
  'Geopolitical', 'Analyst Rating',
]);

// Within catalyst mode these categories also require bullish sentiment.
// Geo + M&A are left open (both directions can move stocks).
const CATALYST_BULLISH_ONLY = new Set<NewsCategory>([
  'FDA Approval', 'Clinical Trial', 'Earnings', 'Major Investment', 'Analyst Rating',
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

const ET_DAY_FMT  = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
const ET_TIME_FMT = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false });

function fmtTime(unixSec: number): string {
  const d       = new Date(unixSec * 1000);
  const timeStr = ET_TIME_FMT.format(d);                  // "04:19"
  const artDay  = ET_DAY_FMT.format(d);
  const todDay  = ET_DAY_FMT.format(new Date());
  if (artDay === todDay) return timeStr + ' ET';

  const diff = Math.floor((Date.now() / 1000 - unixSec) / 86_400);
  if (diff <= 1) return 'yest ' + timeStr;

  // e.g. "2/27 04:19"
  const short = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'numeric', day: 'numeric' }).format(d);
  return short + ' ' + timeStr;
}

function fmtTooltip(unixSec: number): string {
  return new Date(unixSec * 1000).toLocaleString('en-US', {
    timeZone:     'America/New_York',
    weekday:      'short',
    month:        'short',
    day:          'numeric',
    hour:         '2-digit',
    minute:       '2-digit',
    second:       '2-digit',
    hour12:       false,
    timeZoneName: 'short',
  });
}

function timeAgo(unixSec: number): string {
  const diff = Math.floor(Date.now() / 1000) - unixSec;
  if (diff < 60)    return `${diff}s`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

// ── CSS animation (injected once) ────────────────────────────────────────────

const FLASH_STYLE = `
  @keyframes newsFlash {
    0%   { background-color: rgba(38,166,154,0.22); border-left-color: #26a69a; }
    40%  { background-color: rgba(38,166,154,0.10); border-left-color: rgba(38,166,154,0.6); }
    100% { background-color: transparent;            border-left-color: transparent; }
  }
  .news-flash {
    animation: newsFlash 7s ease-out forwards;
    border-left: 2px solid transparent;
  }
`;

// ── News row ──────────────────────────────────────────────────────────────────

function NewsRow({ item, isNew, catalystMode }: { item: FeedItem; isNew: boolean; catalystMode: boolean }) {
  const src     = SRC[item.source] ?? { short: item.source.slice(0, 4).toUpperCase(), cls: 'text-gray-500 bg-transparent border-gray-800/40', full: item.source };
  const catMeta = CAT_META[item.category];
  const showBigBeat = item.bigBeat && (item.category === 'Earnings' || item.category === 'Analyst Rating');
  const score = computeScore(item);

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex items-center gap-2 px-3 py-[5px] border-b border-[#0d0d0d] hover:bg-[#0f0f0f] group min-w-0 ${
        isNew ? 'news-flash' : ''
      } ${catalystMode && showBigBeat ? 'bg-amber-950/10 hover:bg-amber-950/20' : ''}`}
    >
      {/* Time */}
      <span className="text-[10px] font-mono text-gray-600 w-24 shrink-0 tabular-nums" title={fmtTooltip(item.publishedAt)}>
        {fmtTime(item.publishedAt)}
      </span>

      {/* Age */}
      <span className="text-[9px] font-mono text-gray-700 w-6 shrink-0 tabular-nums">
        {timeAgo(item.publishedAt)}
      </span>

      {/* Source badge */}
      <span className={`text-[8px] font-bold tracking-wide px-1 py-0.5 rounded border shrink-0 w-10 text-center ${src.cls}`} title={src.full}>
        {src.short}
      </span>

      {/* Ticker */}
      <span className="w-11 shrink-0 text-[10px] font-mono font-bold text-[#26a69a] truncate">
        {item.ticker ? `$${item.ticker}` : ''}
      </span>

      {/* Category / Big-beat badge */}
      <span className="w-14 shrink-0">
        {showBigBeat ? (
          <span className="text-[7px] font-black tracking-wider px-1 py-0.5 rounded border bg-amber-950/60 border-amber-600/60 text-amber-300 whitespace-nowrap">
            ⚡ BIG
          </span>
        ) : catMeta.label ? (
          <span className={`text-[7px] font-bold tracking-wider px-1 py-0.5 rounded border ${catMeta.cls}`}>
            {catMeta.label}
          </span>
        ) : null}
      </span>

      {/* Impact score */}
      <span className={`w-8 shrink-0 text-[9px] font-mono font-bold tabular-nums ${scoreColor(score)}`} title={`Impact score: ${score}/100`}>
        {score}
      </span>

      {/* Sentiment dot */}
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${SENT_CLS[item.sentiment]}`} title={item.sentiment} />

      {/* Headline + NEW badge */}
      <span className="flex-1 min-w-0 flex items-center gap-1.5">
        {isNew && (
          <span className="text-[7px] font-black tracking-wider px-1 py-0.5 rounded border bg-[#26a69a]/15 border-[#26a69a]/50 text-[#26a69a] shrink-0">
            NEW
          </span>
        )}
        <span className={`text-[11px] group-hover:text-gray-100 transition-colors truncate leading-none ${
          catalystMode && showBigBeat ? 'text-amber-200/80' : 'text-gray-400'
        }`}>
          {item.title}
        </span>
      </span>

      {/* Publisher (right-aligned, hidden on small screens) */}
      <span className="text-[9px] text-gray-700 shrink-0 hidden xl:block max-w-[120px] truncate">
        {item.publisher}
      </span>
    </a>
  );
}

// ── Dropdown filter ───────────────────────────────────────────────────────────

function FilterDropdown({
  label, count, children,
}: { label: string; count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1 px-2 py-1 rounded border text-[10px] font-bold tracking-wide transition-all ${
          count > 0
            ? 'bg-[#26a69a]/10 text-[#26a69a] border-[#26a69a]/40'
            : 'text-gray-600 border-[#1a1a1a] hover:text-gray-400 hover:border-gray-700'
        }`}
      >
        {label}
        {count > 0 && <span className="text-[9px] bg-[#26a69a]/20 px-1 rounded">{count}</span>}
        <svg className={`w-2.5 h-2.5 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 10 6" fill="currentColor">
          <path d="M0 0l5 6 5-6z"/>
        </svg>
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 bg-[#0d0d0d] border border-[#1a1a1a] rounded-lg shadow-xl p-2 min-w-[180px] flex flex-col gap-0.5">
          {children}
        </div>
      )}
    </div>
  );
}

function CheckItem({ label, checked, onChange, cls }: {
  label: string; checked: boolean; onChange: () => void; cls?: string;
}) {
  return (
    <button
      onClick={onChange}
      className={`flex items-center gap-2 px-2 py-1 rounded text-[10px] transition-colors w-full text-left ${
        checked ? 'bg-[#26a69a]/10 text-[#26a69a]' : 'text-gray-500 hover:text-gray-300 hover:bg-[#111]'
      }`}
    >
      <span className={`w-3 h-3 rounded border flex items-center justify-center shrink-0 ${checked ? 'bg-[#26a69a] border-[#26a69a]' : 'border-[#333]'}`}>
        {checked && <svg className="w-2 h-2 text-black" viewBox="0 0 10 8" fill="currentColor"><path d="M0 4l3 4 7-8"/></svg>}
      </span>
      <span className={cls}>{label}</span>
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function NewsPage() {
  const [items,      setItems]      = useState<FeedItem[]>([]);
  const [sources,    setSources]    = useState<Record<string, number>>({});
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [fetchedAt,  setFetchedAt]  = useState<Date | null>(null);
  const [newIds,     setNewIds]     = useState<Set<string>>(new Set());
  const [newCount,   setNewCount]   = useState(0);

  // Filters
  const [catalystMode, setCatalystMode] = useState(false);
  const [search,       setSearch]       = useState('');
  const [activeSrcs,   setActiveSrcs]   = useState<Set<string>>(new Set());
  const [activeCats,   setActiveCats]   = useState<Set<NewsCategory>>(new Set());
  const [sentiment,    setSentiment]    = useState<NewsSentiment | 'all'>('all');

  const fetchingRef  = useRef(false);
  const seenIdsRef   = useRef<Set<string>>(new Set());
  const listRef      = useRef<HTMLDivElement>(null);

  const doFetch = useCallback(async (silent = false) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    if (!silent) { setLoading(true); setError(null); }
    try {
      const res = await axios.get<FeedResponse>('/api/news/feed');
      const incoming = res.data.items ?? [];

      // Detect new items vs. previously seen
      const incomingIds = new Set(incoming.map(i => i.id));
      const added       = new Set([...incomingIds].filter(id => !seenIdsRef.current.has(id)));

      if (seenIdsRef.current.size > 0 && added.size > 0) {
        // Replace previous "new" set — old NEW badges clear automatically when
        // a fresh batch of newer articles arrives (next 30 s refresh cycle).
        setNewIds(added);
        setNewCount(added.size);
      }

      seenIdsRef.current = incomingIds;
      setItems(incoming);
      setSources(res.data.sources ?? {});
      setFetchedAt(new Date(res.data.fetchedAt));
    } catch {
      if (!silent) setError('Failed to load news feed');
    } finally {
      fetchingRef.current = false;
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { doFetch(); }, [doFetch]);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') doFetch(true);
    }, AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [doFetch]);

  // Filters
  const toggleSrc = (s: string) =>
    setActiveSrcs(p => { const n = new Set(p); n.has(s) ? n.delete(s) : n.add(s); return n; });
  const toggleCat = (c: NewsCategory) =>
    setActiveCats(p => { const n = new Set(p); n.has(c) ? n.delete(c) : n.add(c); return n; });

  const filtered = items.filter(item => {
    // Source filter always applies in both modes
    if (activeSrcs.size > 0 && !activeSrcs.has(item.source)) return false;

    if (catalystMode) {
      // Only the 7 catalyst categories pass
      if (!CATALYST_CATS.has(item.category)) return false;
      // Most require bullish sentiment; Geo + M&A are neutral/bearish-ok
      if (CATALYST_BULLISH_ONLY.has(item.category) && item.sentiment !== 'bullish') return false;
    } else {
      if (activeCats.size > 0 && !activeCats.has(item.category)) return false;
      if (sentiment !== 'all' && item.sentiment !== sentiment)    return false;
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      if (!item.title.toLowerCase().includes(q) &&
          !(item.ticker ?? '').toLowerCase().includes(q) &&
          !(item.publisher).toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const updatedStr = fetchedAt
    ? fetchedAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    : null;

  const scrollToTop = () => listRef.current?.scrollTo({ top: 0, behavior: 'smooth' });

  return (
    <div className="flex flex-col h-full bg-black overflow-hidden">
      <style>{FLASH_STYLE}</style>

      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-3 py-1.5 border-b border-[#111] shrink-0">
        <span className="text-[11px] font-black tracking-[0.2em] text-[#26a69a] uppercase">Market Pulse</span>
        <span className="w-px h-3 bg-[#222]" />
        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" title="Live · 30s refresh · last 6h" />
        <span className="text-[10px] text-gray-600 font-mono">{filtered.length} stories</span>

        {/* NEW badge */}
        {newCount > 0 && (
          <button
            onClick={() => { scrollToTop(); setNewCount(0); }}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#26a69a]/15 border border-[#26a69a]/40 text-[#26a69a] text-[9px] font-bold animate-pulse"
          >
            +{newCount} NEW
          </button>
        )}

        <span className="flex-1" />

        {/* Source counts */}
        <div className="hidden lg:flex items-center gap-1.5">
          {Object.entries(sources).filter(([, c]) => c > 0).map(([src, count]) => {
            const s = SRC[src];
            if (!s) return null;
            return (
              <span key={src} className={`text-[8px] font-bold px-1 py-0.5 rounded border ${s.cls}`}>
                {s.short} {count}
              </span>
            );
          })}
        </div>

        <span className="flex-1" />

        {updatedStr && <span className="text-[9px] text-gray-700 font-mono">{updatedStr}</span>}

        <button
          onClick={() => doFetch()}
          disabled={loading}
          className="text-gray-700 hover:text-gray-400 transition-colors disabled:opacity-40"
          title="Refresh now"
        >
          <svg className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M23 4v6h-6M1 20v-6h6" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      {/* ── Filter bar ── */}
      <div className={`flex items-center gap-2 px-3 py-1.5 border-b shrink-0 overflow-x-auto transition-colors ${
        catalystMode ? 'border-amber-900/40 bg-amber-950/10' : 'border-[#111] bg-[#050505]'
      }`}>

        {/* ⚡ CATALYST MODE toggle — always visible, always first */}
        <button
          onClick={() => setCatalystMode(m => !m)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-black tracking-wider transition-all shrink-0 ${
            catalystMode
              ? 'bg-amber-500/15 text-amber-300 border-amber-500/50 shadow-[0_0_10px_rgba(245,158,11,0.15)]'
              : 'text-gray-500 border-[#222] hover:text-amber-400 hover:border-amber-800/60'
          }`}
          title="Toggle Catalyst Mode — show only high-impact bullish catalysts"
        >
          <span>⚡</span>
          <span>CATALYST</span>
          {catalystMode && (
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-[8px] text-amber-400/80">ON</span>
            </span>
          )}
        </button>

        {/* Divider */}
        <span className="w-px h-3 bg-[#222] shrink-0" />

        {/* Search — always visible */}
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={catalystMode ? 'Search catalysts…' : 'Search ticker, headline…'}
          className={`border rounded px-2 py-1 text-[10px] text-gray-300 placeholder-gray-700 focus:outline-none w-44 shrink-0 transition-colors ${
            catalystMode
              ? 'bg-amber-950/20 border-amber-900/40 focus:border-amber-600/50'
              : 'bg-[#0d0d0d] border-[#1a1a1a] focus:border-[#26a69a]/40'
          }`}
        />

        {/* Sources dropdown — always visible */}
        <FilterDropdown label="Sources" count={activeSrcs.size}>
          {ALL_SOURCES.map(src => (
            <CheckItem
              key={src}
              label={`${SRC[src].short} — ${SRC[src].full} ${sources[src] ? `(${sources[src]})` : ''}`}
              checked={activeSrcs.has(src)}
              onChange={() => toggleSrc(src)}
              cls={SRC[src].cls.split(' ')[0]}
            />
          ))}
          {activeSrcs.size > 0 && (
            <button onClick={() => setActiveSrcs(new Set())} className="text-[9px] text-gray-600 hover:text-gray-400 px-2 pt-1 text-left">
              clear all
            </button>
          )}
        </FilterDropdown>

        {/* Category + Sentiment — hidden when catalyst mode is active */}
        {!catalystMode && (
          <>
            <FilterDropdown label="Category" count={activeCats.size}>
              {ALL_CATEGORIES.filter(c => CAT_META[c].label).map(cat => (
                <CheckItem
                  key={cat}
                  label={`${CAT_META[cat].label} — ${cat}`}
                  checked={activeCats.has(cat)}
                  onChange={() => toggleCat(cat)}
                />
              ))}
              {activeCats.size > 0 && (
                <button onClick={() => setActiveCats(new Set())} className="text-[9px] text-gray-600 hover:text-gray-400 px-2 pt-1 text-left">
                  clear all
                </button>
              )}
            </FilterDropdown>

            {(['all', 'bullish', 'bearish', 'neutral'] as const).map(s => (
              <button
                key={s}
                onClick={() => setSentiment(s)}
                className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold tracking-wide transition-all shrink-0 ${
                  sentiment === s
                    ? s === 'bullish' ? 'bg-[#26a69a]/15 text-[#26a69a] border border-[#26a69a]/40'
                    : s === 'bearish' ? 'bg-[#ef5350]/15 text-[#ef5350] border border-[#ef5350]/40'
                    : 'bg-[#1a1a1a] text-gray-300 border border-[#333]'
                    : 'text-gray-600 hover:text-gray-400'
                }`}
              >
                {s !== 'all' && (
                  <span className={`w-1.5 h-1.5 rounded-full ${SENT_CLS[s as NewsSentiment]}`} />
                )}
                {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </>
        )}

        {/* Catalyst mode active — show what's being filtered */}
        {catalystMode && (
          <div className="flex items-center gap-1.5 ml-1">
            {(['FDA', 'TRIAL', 'EARN', 'M&A', 'INVEST', 'GEO', 'ANALYST'] as const).map(tag => (
              <span key={tag} className="text-[7px] font-bold tracking-wider px-1 py-0.5 rounded border border-amber-800/40 text-amber-600/80 bg-amber-950/20 shrink-0">
                {tag}
              </span>
            ))}
            <span className="text-[9px] text-amber-700 ml-1">· bullish only (except GEO + M&amp;A)</span>
          </div>
        )}
      </div>

      {/* ── Column header ── */}
      <div className="flex items-center gap-2 px-3 py-1 border-b border-[#0d0d0d] shrink-0 bg-[#030303]">
        <span className="text-[8px] font-bold tracking-widest text-gray-700 uppercase w-24 shrink-0">TIME ET</span>
        <span className="text-[8px] font-bold tracking-widest text-gray-700 uppercase w-6 shrink-0">AGE</span>
        <span className="text-[8px] font-bold tracking-widest text-gray-700 uppercase w-10 shrink-0">SRC</span>
        <span className="text-[8px] font-bold tracking-widest text-gray-700 uppercase w-11 shrink-0">TICKER</span>
        <span className="text-[8px] font-bold tracking-widest text-gray-700 uppercase w-14 shrink-0">TYPE</span>
        <span className="text-[8px] font-bold tracking-widest text-gray-700 uppercase w-8 shrink-0">SCR</span>
        <span className="w-1.5 shrink-0" />
        <span className="text-[8px] font-bold tracking-widest text-gray-700 uppercase flex-1">HEADLINE</span>
      </div>

      {/* ── News list ── */}
      <div ref={listRef} className="flex-1 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-[#1a1a1a]">

        {loading && items.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <span className="w-4 h-4 border-2 border-[#26a69a]/30 border-t-[#26a69a] rounded-full animate-spin" />
            <span className="text-[10px] text-gray-700">Fetching last 6h...</span>
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center h-32">
            <p className="text-[11px] text-[#ef5350]">{error}</p>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && items.length > 0 && (
          <div className="flex items-center justify-center h-32">
            <p className="text-[10px] text-gray-700">
              {catalystMode ? 'No catalyst events in the last 6h' : 'No items match the current filters'}
            </p>
          </div>
        )}

        {filtered.map(item => (
          <NewsRow key={item.id} item={item} isNew={newIds.has(item.id)} catalystMode={catalystMode} />
        ))}
      </div>
    </div>
  );
}
