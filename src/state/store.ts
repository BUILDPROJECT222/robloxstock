// UI-only state (tabs, toasts, modals, trading mode). Simulation state lives in the engine.

import { create } from 'zustand';
import type { GameModal } from '../engine/game';
import type { ToastKind } from '../engine/types';
import type { World } from '../world/World';

export type WatchTab = 'stocks' | 'crypto' | 'pulse' | 'futures' | 'forex';
export type BottomTab = 'pos' | 'orders' | 'hist' | 'news' | 'cal' | 'algo' | 'vault' | 'rewards' | 'lead';
export type TradingMode = 'paper' | 'real';

export type ModalState =
  | GameModal
  | { kind: 'help'; first: boolean }
  | { kind: 'confirm'; title: string; body: string; confirmLabel: string; danger?: boolean; onConfirm: () => void };

export interface Toast {
  id: number;
  msg: string;
  kind: ToastKind;
  out: boolean;
}

interface UIState {
  watchTab: WatchTab;
  bottomTab: BottomTab;
  mode: TradingMode;
  toasts: Toast[];
  modal: ModalState | null;
  world: World | null;
  setWatchTab: (t: WatchTab) => void;
  setBottomTab: (t: BottomTab) => void;
  setMode: (m: TradingMode) => void;
  setModal: (m: ModalState | null) => void;
  setWorld: (w: World | null) => void;
  pushToast: (msg: string, kind?: ToastKind) => void;
}

let toastId = 0;

export const useUI = create<UIState>((set, get) => ({
  watchTab: 'stocks',
  bottomTab: 'pos',
  mode: 'paper',
  toasts: [],
  modal: null,
  world: null,
  setWatchTab: (watchTab) => set({ watchTab }),
  setBottomTab: (bottomTab) => set({ bottomTab }),
  setMode: (mode) => set({ mode }),
  setModal: (modal) => set({ modal }),
  setWorld: (world) => set({ world }),
  pushToast: (msg, kind = 'info') => {
    const id = ++toastId;
    set({ toasts: [{ id, msg, kind, out: false }, ...get().toasts].slice(0, 5) });
    setTimeout(() => set({ toasts: get().toasts.map((t) => (t.id === id ? { ...t, out: true } : t)) }), 3800);
    setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), 4300);
  },
}));
