'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { Play, RefreshCw, ChevronUp, ChevronDown, ArrowUpRight } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type MarketType = 'pre_market' | 'regular' | 'post_market';
type SortKey    = 'preMarketChangePct' | 'preMarketPrice' | 'preMarketVolume' | 'preMarketChange' | 'prevClose';

interface PreMarketStock {
  symbol:             string;
  exchange:           string;
  prevClose:          number;
  preMarketPrice:     number;
  preMarketChange:    number;
  preMarketChangePct: number;
  preMarketVolume:    number;
}

interface ScanResult {
  scannedAt:  string;
  session:    'pre' | 'regular' | 'post' | 'closed';
  marketType: MarketType;
  source:     'primary' | 'fallback';
  count:      number;
  stocks:     PreMarketStock[];
  message?:   string;
}

// ── Tab config ────────────────────────────────────────────────────────────────

interface TabCfg {
  key:        MarketType;
  label:      string;
  hours:      string;
  volLabel:   string;
  defaults: { minChangePct: number; maxPrice: number; minVol: number };
}

const TABS: TabCfg[] = [
  {
    key:      'pre_market',
    label:    'PRE-MARKET',
    hours:    '4:00–9:30 AM ET',
    volLabel: 'PM VOL ≥',
    defaults: { minChangePct: 12, maxPrice: 30,  minVol: 12_000  },
  },
  {
    key:      'regular',
    label:    'REGULAR',
    hours:    '9:30 AM–4:00 PM ET',
    volLabel: 'VOL ≥',
    defaults: { minChangePct: 5,  maxPrice: 500, minVol: 500_000 },
  },
  {
    key:      'post_market',
    label:    'POST-MARKET',
    hours:    '4:00–8:00 PM ET',
    volLabel: 'AH VOL ≥',
    defaults: { minChangePct: 3,  maxPrice: 200, minVol: 10_000  },
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtVol(v: number): string {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
  if (v >= 1_000)     return (v / 1_000).toFixed(1)     + 'K';
  return v > 0 ? String(v) : '—';
}

function timeAgo(iso: string): string {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 5)  return 'just now';
  if (s < 60) return `${s}s ago`;
  return `${Math.round(s / 60)}m ago`;
}

const AUTO_INTERVAL = 60;

// ── Sub-components ────────────────────────────────────────────────────────────

function SortTh({ label, k, active, dir, onSort }: {
  label: string; k: SortKey; active: boolean; dir: 'asc' | 'desc';
  onSort: (k: SortKey) => void;
}) {
  return (
    <th
      onClick={() => onSort(k)}
      className={`px-3 py-2.5 text-left text-[10px] font-bold tracking-widest uppercase select-none cursor-pointer whitespace-nowrap transition-colors ${
        active ? 'text-[#26a69a]' : 'text-gray-600 hover:text-gray-400'
      }`}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        {active && (dir === 'desc' ? <ChevronDown size={10} /> : <ChevronUp size={10} />)}
      </span>
    </th>
  );
}

function FilterNum({ label, value, onChange, prefix, suffix, step = 1 }: {
  label: string; value: number; onChange: (v: number) => void;
  prefix?: string; suffix?: string; step?: number;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-gray-600 tracking-wider uppercase shrink-0">{label}</span>
      <div className="flex items-center bg-[#0a0a0a] border border-[#1a1a1a] rounded overflow-hidden focus-within:border-[#26a69a]/40 transition-colors">
        {prefix && <span className="pl-2 text-xs text-gray-600 select-none">{prefix}</span>}
        <input
          type="number" value={value} step={step}
          onChange={e => onChange(Number(e.target.value))}
          className="w-20 px-2 py-1 bg-transparent text-white text-xs font-mono focus:outline-none"
        />
        {suffix && <span className="pr-2 text-xs text-gray-600 select-none">{suffix}</span>}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ScannerPage() {
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<MarketType>('pre_market');
  const tab = TABS.find(t => t.key === activeTab)!;

  // Filters — reset to tab defaults when tab changes
  const [minChangePct, setMinChangePct] = useState(tab.defaults.minChangePct);
  const [maxPrice,     setMaxPrice]     = useState(tab.defaults.maxPrice);
  const [minVol,       setMinVol]       = useState(tab.defaults.minVol);

  // Scan state
  const [result,      setResult]      = useState<ScanResult | null>(null);
  const [scanning,    setScanning]    = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [autoScan,    setAutoScan]    = useState(false);
  const [force,       setForce]       = useState(false);
  const [countdown,   setCountdown]   = useState(AUTO_INTERVAL);
  const [renderTick,  setRenderTick]  = useState(0);

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>('preMarketChangePct');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Keep latest filter values accessible in stable callbacks
  const stateRef = useRef({ minChangePct, maxPrice, minVol, force, activeTab });
  stateRef.current = { minChangePct, maxPrice, minVol, force, activeTab };

  // ── Switch tab ──────────────────────────────────────────────────────────────
  function switchTab(next: MarketType) {
    const nextTab = TABS.find(t => t.key === next)!;
    setActiveTab(next);
    setMinChangePct(nextTab.defaults.minChangePct);
    setMaxPrice(nextTab.defaults.maxPrice);
    setMinVol(nextTab.defaults.minVol);
    setResult(null);
    setError(null);
    setAutoScan(false);
    setCountdown(AUTO_INTERVAL);
  }

  // ── Scan ────────────────────────────────────────────────────────────────────
  const runScan = useCallback(async (silent = false) => {
    const { minChangePct, maxPrice, minVol, force, activeTab } = stateRef.current;
    if (!silent) { setScanning(true); setError(null); }

    const q = new URLSearchParams({
      marketType: activeTab,
      minChange:  String(minChangePct),
      maxPrice:   String(maxPrice),
      minVol:     String(minVol),
      ...(force ? { force: '1' } : {}),
    });

    try {
      const { data } = await axios.get<ScanResult>(`/api/scan/pre-market?${q}`);
      setResult(data);
      if (!silent) setCountdown(AUTO_INTERVAL);
    } catch (err: any) {
      if (!silent) setError(err?.response?.data?.error ?? err?.message ?? 'Scan failed');
    } finally {
      if (!silent) setScanning(false);
    }
  }, []);

  // ── Auto-scan ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!autoScan) return;
    const id = setInterval(() => {
      setCountdown(n => {
        if (n <= 1) { runScan(true); return AUTO_INTERVAL; }
        return n - 1;
      });
    }, 1_000);
    return () => clearInterval(id);
  }, [autoScan, runScan]);

  // ── "X ago" tick ────────────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setRenderTick(n => n + 1), 10_000);
    return () => clearInterval(id);
  }, []);
  void renderTick;

  // ── Sort ────────────────────────────────────────────────────────────────────
  function handleSort(k: SortKey) {
    if (sortKey === k) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(k); setSortDir('desc'); }
  }

  const sorted = useMemo(() => {
    if (!result?.stocks?.length) return [];
    return [...result.stocks].sort((a, b) => {
      const av = a[sortKey] as number, bv = b[sortKey] as number;
      return sortDir === 'desc' ? bv - av : av - bv;
    });
  }, [result?.stocks, sortKey, sortDir]);

  // ── Session indicator ───────────────────────────────────────────────────────
  const sess     = result?.session;
  const dotColor = sess === 'pre' || sess === 'regular' ? '#26a69a' : sess === 'post' ? '#f59e0b' : '#333';
  const dotGlow  = (sess === 'pre' || sess === 'regular') ? `0 0 6px #26a69a` : sess === 'post' ? `0 0 6px #f59e0b` : 'none';
  const sessLabel = sess === 'pre' ? 'PRE-MARKET' : sess === 'regular' ? 'REGULAR' : sess === 'post' ? 'POST-MARKET' : '—';

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-black text-white overflow-hidden">

      {/* ── Tab row ── */}
      <div className="flex items-end gap-px px-4 pt-3 border-b border-[#111] shrink-0 bg-[#030303]">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => switchTab(t.key)}
            title={t.hours}
            className={`px-4 py-2 text-[11px] font-bold tracking-widest uppercase rounded-t transition-all ${
              activeTab === t.key
                ? 'bg-black border-t border-l border-r border-[#1a1a1a] text-white -mb-px'
                : 'text-gray-600 hover:text-gray-400 border-t border-l border-r border-transparent'
            }`}
          >
            {t.label}
          </button>
        ))}

        <div className="flex-1" />

        {/* Session pill */}
        {sess && (
          <div className="flex items-center gap-1.5 pb-2 pr-1">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: dotColor, boxShadow: dotGlow }} />
            <span className="text-[10px] font-mono tracking-wider" style={{ color: dotColor }}>{sessLabel}</span>
          </div>
        )}

        {/* Countdown */}
        {autoScan && (
          <span className="text-[10px] font-mono text-gray-700 pb-2 pl-2">↻ {countdown}s</span>
        )}
      </div>

      {/* ── Filter bar ── */}
      <div className="flex items-center gap-3 px-5 py-2 border-b border-[#0d0d0d] bg-[#020202] shrink-0 flex-wrap gap-y-2">
        <FilterNum label="CHG% ≥"    value={minChangePct} onChange={setMinChangePct} suffix="%" />
        <FilterNum label="PRICE ≤"   value={maxPrice}     onChange={setMaxPrice}     prefix="$" />
        <FilterNum label={tab.volLabel} value={minVol}    onChange={setMinVol}       step={1000} />

        <div className="flex-1" />

        <button
          onClick={() => setForce(f => !f)}
          title={`Force scan outside ${tab.hours}`}
          className={`px-2.5 py-1 rounded text-[10px] font-bold tracking-wider border transition-all ${
            force
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
              : 'bg-[#0d0d0d] border-[#1a1a1a] text-gray-600 hover:text-gray-400'
          }`}
        >FORCE</button>

        <button
          onClick={() => { setAutoScan(a => !a); setCountdown(AUTO_INTERVAL); }}
          title="Auto-rescan every 60 seconds"
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-bold tracking-wider border transition-all ${
            autoScan
              ? 'bg-[#26a69a]/10 border-[#26a69a]/30 text-[#26a69a]'
              : 'bg-[#0d0d0d] border-[#1a1a1a] text-gray-500 hover:text-gray-300'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${autoScan ? 'bg-[#26a69a] animate-pulse' : 'bg-[#333]'}`} />
          AUTO
        </button>

        <button
          onClick={() => runScan(false)}
          disabled={scanning}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded bg-[#26a69a]/10 border border-[#26a69a]/25 text-[#26a69a] text-xs font-bold hover:bg-[#26a69a]/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {scanning ? <RefreshCw size={11} className="animate-spin" /> : <Play size={11} />}
          {scanning ? 'SCANNING…' : 'SCAN'}
        </button>
      </div>

      {/* ── Status bar ── */}
      {(result || error) && (
        <div className="flex items-center gap-2 px-5 py-1.5 border-b border-[#080808] bg-[#010101] shrink-0">
          {error ? (
            <span className="text-[11px] text-[#ef5350]">{error}</span>
          ) : result ? (
            <>
              <span className="text-[11px] font-mono text-gray-400">
                <span className="text-white font-bold">{result.count}</span> result{result.count !== 1 ? 's' : ''}
              </span>
              <span className="text-[#1a1a1a]">·</span>
              <span className={`text-[10px] font-mono uppercase tracking-wide ${
                result.source === 'primary' ? 'text-[#26a69a]/50' : 'text-amber-600/50'
              }`}>
                Alpaca {result.source}
              </span>
              <span className="text-[#1a1a1a]">·</span>
              <span className="text-[10px] text-gray-700 font-mono" suppressHydrationWarning>
                {timeAgo(result.scannedAt)}
              </span>
              {scanning && (
                <>
                  <span className="text-[#1a1a1a]">·</span>
                  <span className="text-[10px] text-gray-600 flex items-center gap-1">
                    <RefreshCw size={9} className="animate-spin" /> refreshing
                  </span>
                </>
              )}
            </>
          ) : null}
        </div>
      )}

      {/* ── Content ── */}
      <div className="flex-1 overflow-auto">

        {/* Idle */}
        {!result && !scanning && !error && (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <p className="text-[#0d0d0d] text-5xl font-black tracking-[0.2em]">SCAN</p>
            <p className="text-gray-700 text-sm">{tab.hours}</p>
            <p className="text-gray-800 text-xs">Set filters and press SCAN</p>
          </div>
        )}

        {/* Loading */}
        {scanning && !result && (
          <div className="flex items-center justify-center h-full gap-3 text-gray-600 text-sm">
            <RefreshCw size={15} className="animate-spin" /> Scanning Alpaca…
          </div>
        )}

        {/* No results */}
        {result && sorted.length === 0 && !scanning && (
          <div className="flex flex-col items-center justify-center h-full gap-3 px-8 text-center">
            {result.message ? (
              <>
                <p className="text-gray-600 text-sm max-w-md">{result.message}</p>
                {!force && (
                  <button
                    onClick={() => setForce(true)}
                    className="text-xs text-[#26a69a]/60 hover:text-[#26a69a] underline underline-offset-2 transition-colors"
                  >
                    Enable FORCE mode to scan outside {tab.hours}
                  </button>
                )}
              </>
            ) : (
              <p className="text-gray-600 text-sm">No stocks matched your filters</p>
            )}
          </div>
        )}

        {/* Results table */}
        {sorted.length > 0 && (
          <table className="w-full border-collapse text-sm min-w-[600px]">
            <thead>
              <tr className="bg-[#050505] border-b border-[#0f0f0f] sticky top-0 z-10">
                <th className="px-3 py-2.5 text-left text-[10px] font-bold text-gray-700 uppercase tracking-widest w-8 select-none">#</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-bold text-gray-600 uppercase tracking-widest select-none">SYMBOL</th>
                <SortTh label="PRICE"  k="preMarketPrice"     active={sortKey==='preMarketPrice'}     dir={sortDir} onSort={handleSort} />
                <SortTh label="CHG %"  k="preMarketChangePct" active={sortKey==='preMarketChangePct'} dir={sortDir} onSort={handleSort} />
                <SortTh label="CHG $"  k="preMarketChange"    active={sortKey==='preMarketChange'}    dir={sortDir} onSort={handleSort} />
                <SortTh label="VOL"    k="preMarketVolume"    active={sortKey==='preMarketVolume'}    dir={sortDir} onSort={handleSort} />
                <SortTh label="PREV"   k="prevClose"          active={sortKey==='prevClose'}          dir={sortDir} onSort={handleSort} />
                <th className="w-14 select-none" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((s, i) => {
                const up    = s.preMarketChangePct >= 0;
                const color = up ? '#26a69a' : '#ef5350';
                return (
                  <tr
                    key={s.symbol}
                    onClick={() => router.push(`/?symbol=${s.symbol}&tf=1m`)}
                    className="border-b border-[#080808] hover:bg-[#0c1a18] cursor-pointer transition-colors group"
                  >
                    <td className="px-3 py-3 text-gray-800 font-mono text-xs w-8">{i + 1}</td>

                    <td className="px-3 py-3">
                      <div className="flex items-baseline gap-2">
                        <span className="font-bold font-mono text-white text-[13px] tracking-wide">{s.symbol}</span>
                        {s.exchange && <span className="text-[10px] text-gray-700 uppercase">{s.exchange}</span>}
                      </div>
                    </td>

                    <td className="px-3 py-3 font-mono text-white tabular-nums">
                      ${s.preMarketPrice.toFixed(2)}
                    </td>

                    <td className="px-3 py-3 font-mono font-bold tabular-nums" style={{ color }}>
                      {up ? '+' : ''}{s.preMarketChangePct.toFixed(2)}%
                    </td>

                    <td className="px-3 py-3 font-mono tabular-nums" style={{ color }}>
                      {up ? '+' : ''}{s.preMarketChange.toFixed(2)}
                    </td>

                    <td className="px-3 py-3 font-mono text-gray-400 tabular-nums">
                      {fmtVol(s.preMarketVolume)}
                    </td>

                    <td className="px-3 py-3 font-mono text-gray-600 tabular-nums">
                      {s.prevClose > 0 ? s.prevClose.toFixed(2) : '—'}
                    </td>

                    <td className="px-3 py-3 w-14 text-right">
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-800 group-hover:text-[#26a69a] transition-colors">
                        CHART <ArrowUpRight size={10} />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
