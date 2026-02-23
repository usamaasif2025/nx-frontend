'use client';

import { useState } from 'react';
import { useWatchlistStore } from '@/store/watchlistStore';
import { useScannerStore } from '@/store/scannerStore';
import { LayoutDashboard, Pin, Trash2, TrendingUp, TrendingDown, Plus, X } from 'lucide-react';

export default function WatchlistPanel({ onSelectSymbol }: { onSelectSymbol?: (symbol: string) => void }) {
  const { items, removeItem, pinItem, clearAll } = useWatchlistStore();
  const { selectSymbol } = useScannerStore();
  const [newSymbol, setNewSymbol] = useState('');
  const { addItem, hasSymbol } = useWatchlistStore();

  const sorted = [...items].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return b.addedAt - a.addedAt;
  });

  const handleAdd = () => {
    const sym = newSymbol.trim().toUpperCase();
    if (!sym || hasSymbol(sym)) { setNewSymbol(''); return; }
    addItem({
      symbol: sym, name: sym, addedAt: Date.now(),
      addedReason: 'Manual add', currentPrice: 0,
      changePercent: 0, tags: ['manual'], pinned: false,
    });
    setNewSymbol('');
  };

  const handleSelect = (symbol: string) => {
    selectSymbol(symbol);
    onSelectSymbol?.(symbol);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#1a1a1a]">
        <div className="flex items-center gap-2">
          <LayoutDashboard size={13} className="text-cyan-400" />
          <span className="text-sm font-semibold text-white">Watchlist</span>
          <span className="text-xs text-gray-600">{items.length} stocks</span>
        </div>
        {items.length > 0 && (
          <button onClick={clearAll} className="text-[10px] text-gray-600 hover:text-orange-400 transition-colors">
            Clear all
          </button>
        )}
      </div>

      {/* Add manually */}
      <div className="px-3 py-2 border-b border-[#111]">
        <div className="flex gap-2">
          <input
            value={newSymbol}
            onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="Add symbol (e.g. AAPL)"
            className="flex-1 bg-[#0d0d0d] border border-[#1a1a1a] rounded px-2 py-1.5 text-xs text-white placeholder:text-gray-600 focus:outline-none focus:border-cyan-400/30"
          />
          <button
            onClick={handleAdd}
            className="px-2 py-1.5 rounded border border-cyan-400/20 text-cyan-400 hover:bg-cyan-400/10 transition-all"
          >
            <Plus size={12} />
          </button>
        </div>
      </div>

      {/* List */}
      {sorted.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-2">
            <LayoutDashboard size={20} className="text-gray-700 mx-auto" />
            <p className="text-gray-600 text-sm">Watchlist is empty</p>
            <p className="text-gray-700 text-xs">Add stocks from scanner or news feed</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {sorted.map((item) => (
            <div
              key={item.symbol}
              onClick={() => handleSelect(item.symbol)}
              className="flex items-center justify-between px-3 py-2.5 border-b border-[#0d0d0d] hover:bg-white/[0.02] cursor-pointer group"
            >
              <div className="flex items-center gap-2">
                {item.pinned && <Pin size={10} className="text-cyan-400" />}
                <div>
                  <p className="text-white font-bold text-sm">{item.symbol}</p>
                  <p className="text-gray-600 text-[10px] line-clamp-1">{item.addedReason}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {item.changePercent !== 0 && (
                  <div className="flex items-center gap-1">
                    {item.changePercent >= 0
                      ? <TrendingUp size={10} className="text-cyan-400" />
                      : <TrendingDown size={10} className="text-orange-400" />
                    }
                    <span className={`text-xs font-mono font-bold ${item.changePercent >= 0 ? 'text-cyan-400' : 'text-orange-400'}`}>
                      {item.changePercent >= 0 ? '+' : ''}{item.changePercent.toFixed(1)}%
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => { e.stopPropagation(); pinItem(item.symbol); }}
                    className="p-1 rounded hover:bg-cyan-400/10 text-gray-600 hover:text-cyan-400 transition-all"
                  >
                    <Pin size={10} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeItem(item.symbol); }}
                    className="p-1 rounded hover:bg-orange-400/10 text-gray-600 hover:text-orange-400 transition-all"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
