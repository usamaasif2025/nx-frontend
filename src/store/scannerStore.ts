import { create } from 'zustand';
import { StockQuote, MarketSession } from '@/types';

interface ScannerState {
  stocks: StockQuote[];
  selectedSymbol: string | null;
  isScanning: boolean;
  lastUpdated: number | null;
  filterSession: MarketSession | 'all';
  minChangePercent: number;
  sortBy: keyof StockQuote;
  sortDir: 'asc' | 'desc';

  setStocks: (stocks: StockQuote[]) => void;
  addOrUpdateStock: (stock: StockQuote) => void;
  removeStock: (symbol: string) => void;
  selectSymbol: (symbol: string | null) => void;
  setScanning: (scanning: boolean) => void;
  setFilter: (session: MarketSession | 'all') => void;
  setMinChange: (pct: number) => void;
  setSortBy: (key: keyof StockQuote, dir: 'asc' | 'desc') => void;
}

export const useScannerStore = create<ScannerState>((set) => ({
  stocks: [],
  selectedSymbol: null,
  isScanning: false,
  lastUpdated: null,
  filterSession: 'all',
  minChangePercent: 3,
  sortBy: 'changePercent',
  sortDir: 'desc',

  setStocks: (stocks) => set({ stocks, lastUpdated: Date.now() }),

  addOrUpdateStock: (stock) =>
    set((state) => {
      const existing = state.stocks.findIndex((s) => s.symbol === stock.symbol);
      if (existing >= 0) {
        const updated = [...state.stocks];
        updated[existing] = stock;
        return { stocks: updated, lastUpdated: Date.now() };
      }
      return { stocks: [stock, ...state.stocks], lastUpdated: Date.now() };
    }),

  removeStock: (symbol) =>
    set((state) => ({
      stocks: state.stocks.filter((s) => s.symbol !== symbol),
    })),

  selectSymbol: (symbol) => set({ selectedSymbol: symbol }),
  setScanning: (isScanning) => set({ isScanning }),
  setFilter: (filterSession) => set({ filterSession }),
  setMinChange: (minChangePercent) => set({ minChangePercent }),
  setSortBy: (sortBy, sortDir) => set({ sortBy, sortDir }),
}));
