import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { WatchlistItem } from '@/types';

interface WatchlistState {
  items: WatchlistItem[];
  addItem: (item: WatchlistItem) => void;
  removeItem: (symbol: string) => void;
  updateItem: (symbol: string, updates: Partial<WatchlistItem>) => void;
  pinItem: (symbol: string) => void;
  clearAll: () => void;
  hasSymbol: (symbol: string) => boolean;
}

export const useWatchlistStore = create<WatchlistState>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (item) =>
        set((state) => {
          if (state.items.some((i) => i.symbol === item.symbol)) return state;
          return { items: [item, ...state.items] };
        }),

      removeItem: (symbol) =>
        set((state) => ({
          items: state.items.filter((i) => i.symbol !== symbol),
        })),

      updateItem: (symbol, updates) =>
        set((state) => ({
          items: state.items.map((i) =>
            i.symbol === symbol ? { ...i, ...updates } : i
          ),
        })),

      pinItem: (symbol) =>
        set((state) => ({
          items: state.items.map((i) =>
            i.symbol === symbol ? { ...i, pinned: !i.pinned } : i
          ),
        })),

      clearAll: () => set({ items: [] }),

      hasSymbol: (symbol) => get().items.some((i) => i.symbol === symbol),
    }),
    { name: 'momentum-watchlist' }
  )
);
