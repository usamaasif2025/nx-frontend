import { create } from 'zustand';
import { TradeSetup, CandleAnalysis } from '@/types';

interface StrategyState {
  setups: Record<string, TradeSetup[]>; // keyed by symbol
  candleData: Record<string, CandleAnalysis>; // keyed by `${symbol}_${timeframe}`
  analyzing: Set<string>;
  selectedSetup: TradeSetup | null;

  setSetups: (symbol: string, setups: TradeSetup[]) => void;
  setCandleData: (key: string, data: CandleAnalysis) => void;
  setAnalyzing: (symbol: string, state: boolean) => void;
  selectSetup: (setup: TradeSetup | null) => void;
  clearSymbol: (symbol: string) => void;
}

export const useStrategyStore = create<StrategyState>((set) => ({
  setups: {},
  candleData: {},
  analyzing: new Set(),
  selectedSetup: null,

  setSetups: (symbol, setups) =>
    set((state) => ({
      setups: { ...state.setups, [symbol]: setups },
    })),

  setCandleData: (key, data) =>
    set((state) => ({
      candleData: { ...state.candleData, [key]: data },
    })),

  setAnalyzing: (symbol, analyzing) =>
    set((state) => {
      const next = new Set(state.analyzing);
      analyzing ? next.add(symbol) : next.delete(symbol);
      return { analyzing: next };
    }),

  selectSetup: (selectedSetup) => set({ selectedSetup }),

  clearSymbol: (symbol) =>
    set((state) => {
      const setups = { ...state.setups };
      delete setups[symbol];
      return { setups };
    }),
}));
