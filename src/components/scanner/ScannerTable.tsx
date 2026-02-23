'use client';

import { useEffect, useState, useCallback } from 'react';
import { StockQuote } from '@/types';
import { useScannerStore } from '@/store/scannerStore';
import { useWatchlistStore } from '@/store/watchlistStore';
import { Activity, Plus, Minus, TrendingUp, TrendingDown, RefreshCw } from 'lucide-react';
import axios from 'axios';

const REFRESH_INTERVAL = 30_000; // 30 seconds

function Badge({ children, variant }: { children: React.ReactNode; variant: 'gain' | 'loss' | 'neutral' | 'pre' | 'post' | 'regular' }) {
  const styles = {
    gain:    'bg-cyan-400/10 text-cyan-400 border-cyan-400/20',
    loss:    'bg-orange-500/10 text-orange-400 border-orange-500/20',
    neutral: 'bg-white/5 text-gray-400 border-white/10',
    pre:     'bg-purple-500/10 text-purple-400 border-purple-500/20',
    post:    'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    regular: 'bg-green-500/10 text-green-400 border-green-500/20',
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${styles[variant]}`}>
      {children}
    </span>
  );
}

function StockRow({ stock, onSelect }: { stock: StockQuote; onSelect: (s: StockQuote) => void }) {
  const { hasSymbol, addItem, removeItem } = useWatchlistStore();
  const inWatchlist = hasSymbol(stock.symbol);
  const isGain = stock.changePercent >= 0;

  return (
    <tr
      className="scanner-row border-b border-[#111] cursor-pointer transition-all hover:bg-white/[0.02]"
      onClick={() => onSelect(stock)}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full ${isGain ? 'bg-cyan-400' : 'bg-orange-400'}`} />
          <span className="font-bold text-white text-sm">{stock.symbol}</span>
        </div>
      </td>
      <td className="px-4 py-3 text-right">
        <span className="text-white font-mono text-sm">${stock.price.toFixed(2)}</span>
      </td>
      <td className="px-4 py-3 text-right">
        <span className={`font-bold font-mono text-sm ${isGain ? 'text-cyan-400' : 'text-orange-400'}`}>
          {isGain ? '+' : ''}{stock.changePercent.toFixed(2)}%
        </span>
      </td>
      <td className="px-4 py-3 text-right text-gray-400 font-mono text-xs">
        {stock.volume >= 1_000_000
          ? `${(stock.volume / 1_000_000).toFixed(1)}M`
          : stock.volume >= 1_000
          ? `${(stock.volume / 1_000).toFixed(0)}K`
          : stock.volume.toLocaleString()}
      </td>
      <td className="px-4 py-3 text-right text-gray-500 font-mono text-xs">
        ${stock.high.toFixed(2)} / ${stock.low.toFixed(2)}
      </td>
      <td className="px-4 py-3 text-center">
        <Badge variant={stock.session}>{stock.session.toUpperCase()}</Badge>
      </td>
      <td className="px-4 py-3 text-center">
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (inWatchlist) {
              removeItem(stock.symbol);
            } else {
              addItem({
                symbol: stock.symbol,
                name: stock.name,
                addedAt: Date.now(),
                addedReason: `Scanner: +${stock.changePercent.toFixed(1)}%`,
                currentPrice: stock.price,
                changePercent: stock.changePercent,
                tags: ['scanner', stock.session],
                pinned: false,
              });
            }
          }}
          className={`p-1.5 rounded border transition-all ${
            inWatchlist
              ? 'border-orange-400/30 text-orange-400 hover:bg-orange-400/10'
              : 'border-cyan-400/20 text-cyan-400 hover:bg-cyan-400/10'
          }`}
        >
          {inWatchlist ? <Minus size={12} /> : <Plus size={12} />}
        </button>
      </td>
    </tr>
  );
}

export default function ScannerTable({ onSelectStock }: { onSelectStock?: (symbol: string) => void }) {
  const { stocks, setStocks, isScanning, setScanning, minChangePercent, filterSession, lastUpdated } = useScannerStore();
  const { selectSymbol } = useScannerStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStocks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await axios.get(`/api/scanner?minPct=${minChangePercent}`);
      setStocks(data.stocks || []);
    } catch {
      setError('Failed to fetch scanner data. Check your API keys.');
    } finally {
      setLoading(false);
    }
  }, [minChangePercent, setStocks]);

  useEffect(() => {
    fetchStocks();
    const interval = setInterval(fetchStocks, REFRESH_INTERVAL);
    setScanning(true);
    return () => { clearInterval(interval); setScanning(false); };
  }, [fetchStocks, setScanning]);

  const handleSelect = (stock: StockQuote) => {
    selectSymbol(stock.symbol);
    onSelectStock?.(stock.symbol);
  };

  const filtered = stocks
    .filter((s) => filterSession === 'all' || s.session === filterSession)
    .filter((s) => Math.abs(s.changePercent) >= minChangePercent);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1a1a1a]">
        <div className="flex items-center gap-2">
          <Activity size={14} className="text-cyan-400" />
          <span className="text-sm font-semibold text-white">Live Scanner</span>
          {isScanning && <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 pulse-live" />}
          <span className="text-xs text-gray-600 ml-1">≥{minChangePercent}% movers</span>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-gray-600">
              {new Date(lastUpdated).toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={fetchStocks}
            disabled={loading}
            className="p-1.5 rounded border border-[#222] text-gray-400 hover:text-cyan-400 hover:border-cyan-400/20 transition-all"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
          <span className={`text-xs font-bold ${filtered.length > 0 ? 'text-cyan-400' : 'text-gray-600'}`}>
            {filtered.length} SIGNALS
          </span>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mt-3 p-3 rounded border border-orange-500/20 bg-orange-500/5 text-orange-400 text-xs">
          {error}
        </div>
      )}

      {/* Table */}
      {loading && stocks.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-2">
            <RefreshCw size={20} className="animate-spin text-cyan-400 mx-auto" />
            <p className="text-gray-500 text-xs">Scanning markets...</p>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-2">
            <Activity size={24} className="text-gray-700 mx-auto" />
            <p className="text-gray-600 text-sm">No stocks above {minChangePercent}%</p>
            <p className="text-gray-700 text-xs">Scanner updates every 30s</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#111]">
                {['Symbol', 'Price', 'Change', 'Volume', 'H / L', 'Session', ''].map((h) => (
                  <th key={h} className={`px-4 py-2 text-[10px] uppercase tracking-wider text-gray-600 font-medium ${h === 'Symbol' ? 'text-left' : 'text-right'} ${h === 'Session' || h === '' ? 'text-center' : ''}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((stock) => (
                <StockRow key={stock.symbol} stock={stock} onSelect={handleSelect} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
