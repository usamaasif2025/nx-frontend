'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { TradeSetup, Conviction } from '@/types';
import axios from 'axios';
import { Lightbulb, RefreshCw, TrendingUp, TrendingDown, Target, Shield, Zap } from 'lucide-react';

const CONVICTION_CONFIG: Record<Conviction, { label: string; color: string; bg: string }> = {
  A: { label: 'A — STRONG',  color: 'text-cyan-400',   bg: 'bg-cyan-400/10' },
  B: { label: 'B — MODERATE', color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
  C: { label: 'C — WEAK',    color: 'text-gray-400',   bg: 'bg-white/5' },
};

const RISK_CONFIG = {
  low:    { label: 'Low Risk',    color: 'text-cyan-400' },
  medium: { label: 'Med Risk',    color: 'text-yellow-400' },
  high:   { label: 'High Risk',   color: 'text-orange-400' },
};

function SetupCard({ setup, isTop }: { setup: TradeSetup; isTop: boolean }) {
  const conv = CONVICTION_CONFIG[setup.conviction];
  const risk = RISK_CONFIG[setup.riskLevel];
  const isLong = setup.direction === 'long';
  const timeLeft = Math.max(0, Math.floor((setup.validUntil - Date.now()) / 1000 / 60));

  return (
    <div className={`rounded border p-4 slide-in ${
      isTop
        ? 'border-cyan-400/30 bg-cyan-400/5'
        : 'border-[#1a1a1a] bg-[#0a0a0a]'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {isTop && <Zap size={12} className="text-cyan-400" />}
          <span className="text-white font-bold text-sm">{setup.strategyLabel}</span>
          {isTop && <span className="text-[9px] bg-cyan-400/20 text-cyan-400 px-1.5 py-0.5 rounded font-bold">BEST</span>}
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`text-[10px] font-semibold ${conv.color} ${conv.bg} px-1.5 py-0.5 rounded`}>
            {conv.label}
          </span>
          {isLong
            ? <TrendingUp size={12} className="text-cyan-400" />
            : <TrendingDown size={12} className="text-orange-400" />
          }
          <span className={`text-[10px] font-bold ${isLong ? 'text-cyan-400' : 'text-orange-400'}`}>
            {setup.direction.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Price levels */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        {/* Entry */}
        <div className="rounded bg-[#050505] border border-[#1a1a1a] p-2">
          <p className="text-[9px] text-gray-600 uppercase tracking-wider mb-0.5">Entry</p>
          <p className={`text-base font-bold font-mono ${isLong ? 'text-cyan-400' : 'text-orange-400'}`}>
            ${setup.entry.toFixed(2)}
          </p>
        </div>

        {/* Stop Loss */}
        <div className="rounded bg-[#050505] border border-[#1a1a1a] p-2">
          <p className="text-[9px] text-gray-600 uppercase tracking-wider mb-0.5 flex items-center gap-1">
            <Shield size={8} /> Stop Loss
          </p>
          <p className="text-base font-bold font-mono text-orange-400">${setup.stopLoss.toFixed(2)}</p>
        </div>

        {/* Targets */}
        <div className="col-span-2 rounded bg-[#050505] border border-[#1a1a1a] p-2">
          <p className="text-[9px] text-gray-600 uppercase tracking-wider mb-1 flex items-center gap-1">
            <Target size={8} /> Targets
          </p>
          <div className="flex items-center gap-3">
            <div>
              <p className="text-[9px] text-gray-600">T1</p>
              <p className="text-sm font-bold font-mono text-cyan-300">${setup.target1.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-[9px] text-gray-600">T2</p>
              <p className="text-sm font-bold font-mono text-cyan-400">${setup.target2.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-[9px] text-gray-600">T3</p>
              <p className="text-sm font-bold font-mono text-cyan-500">${setup.target3.toFixed(2)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-3 text-[10px] mb-2">
        <span className="text-gray-500">R:R</span>
        <span className={`font-bold ${setup.riskReward >= 2 ? 'text-cyan-400' : setup.riskReward >= 1 ? 'text-yellow-400' : 'text-orange-400'}`}>
          1:{setup.riskReward}
        </span>
        <span className={`${risk.color}`}>{risk.label}</span>
        <span className="text-gray-600">{setup.timeframe}</span>
        <span className="text-gray-600 ml-auto">⏱ {timeLeft}m left</span>
      </div>

      {/* Reasoning */}
      <div className="space-y-1">
        {setup.reasoning.map((r, i) => (
          <p key={i} className="text-[10px] text-gray-500 flex items-start gap-1.5">
            <span className="text-cyan-400/40 mt-0.5">›</span> {r}
          </p>
        ))}
      </div>
    </div>
  );
}

export default function StrategyEngine({ symbol }: { symbol: string }) {
  const [setups, setSetups] = useState<TradeSetup[]>([]);
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const analyze = useCallback(async () => {
    if (!symbol) return;
    setLoading(true);
    setCountdown(15);

    // 15-second countdown
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCountdown((c) => { if (c <= 1) { clearInterval(timerRef.current!); return 0; } return c - 1; });
    }, 1000);

    try {
      const { data } = await axios.get(`/api/strategies?symbol=${symbol}`);
      setSetups(data.setups || []);
    } catch {
      setSetups([]);
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    if (symbol) analyze();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [symbol, analyze]);

  if (!symbol) return (
    <div className="flex items-center justify-center h-full text-gray-600 text-sm">
      Select a stock to run strategy engine
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#1a1a1a]">
        <div className="flex items-center gap-2">
          <Lightbulb size={13} className="text-cyan-400" />
          <span className="text-sm font-semibold text-white">Strategy Engine</span>
          <span className="text-xs text-gray-600">{symbol}</span>
        </div>
        <div className="flex items-center gap-2">
          {loading && countdown > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="w-16 h-1 bg-[#1a1a1a] rounded-full overflow-hidden">
                <div
                  className="h-full bg-cyan-400 transition-all"
                  style={{ width: `${(1 - countdown / 15) * 100}%` }}
                />
              </div>
              <span className="text-xs text-cyan-400 font-mono">{countdown}s</span>
            </div>
          )}
          <button
            onClick={analyze}
            disabled={loading}
            className="flex items-center gap-1.5 px-2 py-1 rounded border border-cyan-400/20 text-cyan-400 text-xs hover:bg-cyan-400/10 transition-all disabled:opacity-50"
          >
            <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
            Analyze
          </button>
        </div>
      </div>

      {/* Content */}
      {loading && setups.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <div className="w-10 h-10 rounded-full border border-cyan-400/30 flex items-center justify-center mx-auto">
              <RefreshCw size={16} className="animate-spin text-cyan-400" />
            </div>
            <p className="text-gray-500 text-xs">Running strategy engine...</p>
            {countdown > 0 && (
              <p className="text-cyan-400 font-mono text-sm">{countdown}s</p>
            )}
          </div>
        </div>
      ) : setups.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-2">
            <Lightbulb size={20} className="text-gray-700 mx-auto" />
            <p className="text-gray-600 text-sm">No setups found</p>
            <p className="text-gray-700 text-xs">Conditions don't match any strategy criteria</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          <div className="flex items-center justify-between text-[10px] text-gray-600 mb-1">
            <span>{setups.length} setup{setups.length !== 1 ? 's' : ''} found</span>
            <span>sorted by conviction</span>
          </div>
          {setups.map((setup, i) => (
            <SetupCard key={`${setup.strategy}-${i}`} setup={setup} isTop={i === 0} />
          ))}
        </div>
      )}
    </div>
  );
}
