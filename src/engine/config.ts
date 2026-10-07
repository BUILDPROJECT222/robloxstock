// Game constants. Tuned so one "trading day" ≈ 100 real seconds.

import type { AssetClass } from './types';

export const TICK_MS = 200; // 1 real tick = 200ms (at 1x speed)
export const CANDLE_TICKS = 5; // 1 candle = 5 ticks
export const MAX_CANDLES = 160;
export const SESSION_OPEN = 9 * 60 + 30; // 09:30
export const SESSION_CLOSE = 16 * 60; // 16:00
export const MIN_PER_TICK_OPEN = 1; // during the session: 1 game minute per tick
export const MIN_PER_TICK_CLOSED = 10; // outside the session time runs faster

export const START_CASH = 2500; // "training bonus"
export const MAINTENANCE = 0.1; // liquidated when remaining margin < 10%

export type UnlockKey = 'stocks' | 'crypto' | 'vault' | 'pulse' | 'short' | 'futures' | 'forex' | 'vaultpro' | 'algos' | 'lev25';

export interface AssetClassInfo {
  label: string;
  spread: number;
  fee: number;
  session: boolean;
  unlock: UnlockKey;
}

// Asset classes: spread & fee per side, and whether they follow exchange hours.
export const ASSET_CLASSES: Record<AssetClass, AssetClassInfo> = {
  stock: { label: 'Stock', spread: 0.0006, fee: 0.001, session: true, unlock: 'stocks' },
  etf: { label: 'ETF', spread: 0.0004, fee: 0.0008, session: true, unlock: 'stocks' },
  crypto: { label: 'Crypto', spread: 0.0012, fee: 0.002, session: false, unlock: 'crypto' },
  meme: { label: 'Pulse', spread: 0.01, fee: 0.01, session: false, unlock: 'pulse' },
  future: { label: 'Futures', spread: 0.0003, fee: 0.0005, session: false, unlock: 'futures' },
  forex: { label: 'Forex', spread: 0.0001, fee: 0.0002, session: false, unlock: 'forex' },
};

// Features unlocked per level (mirrors RSE 2 progression).
export const UNLOCKS: { level: number; key: UnlockKey; label: string }[] = [
  { level: 1, key: 'stocks', label: 'Stocks & ETFs' },
  { level: 1, key: 'crypto', label: 'Crypto (open 24/7)' },
  { level: 1, key: 'vault', label: 'Vault (interest-bearing savings)' },
  { level: 2, key: 'pulse', label: 'Pulse — Meme Coins' },
  { level: 3, key: 'short', label: 'Short selling + 2x leverage' },
  { level: 5, key: 'futures', label: 'Futures + 5x leverage' },
  { level: 7, key: 'forex', label: 'Forex' },
  { level: 8, key: 'vaultpro', label: 'Vault Pro (2x interest)' },
  { level: 10, key: 'algos', label: 'Algo Desk (trading bots) + 10x leverage' },
  { level: 15, key: 'lev25', label: '25x leverage' },
];

export const LEVERAGE_TIERS = [
  { x: 1, level: 1 },
  { x: 2, level: 3 },
  { x: 5, level: 5 },
  { x: 10, level: 10 },
  { x: 25, level: 15 },
];

export const CODES: Record<string, number> = {
  STOCKMARKET: 50000,
  MEMECOINS: 10000,
  FUTURES: 10000,
  RELEASE: 10000,
  UPDATE: 7500,
  BULLMARKET: 5000,
};

export const REBIRTH_BASE = 1_000_000; // net worth required for the first rebirth
export const xpForLevel = (lvl: number) => Math.round(120 * Math.pow(lvl, 1.55));
