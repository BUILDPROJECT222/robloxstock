// Konstanta game. Diatur supaya satu "hari bursa" ≈ 100 detik nyata.

export const TICK_MS = 200;            // 1 tick nyata = 200ms (pada speed 1x)
export const CANDLE_TICKS = 5;         // 1 candle = 5 tick
export const MAX_CANDLES = 160;
export const SESSION_OPEN = 9 * 60 + 30;   // 09:30
export const SESSION_CLOSE = 16 * 60;      // 16:00
export const MIN_PER_TICK_OPEN = 1;        // saat sesi: 1 menit game / tick
export const MIN_PER_TICK_CLOSED = 10;     // di luar sesi waktu dipercepat

export const START_CASH = 2500;            // "training bonus"
export const FIRST_CLOSE_REWARD = 750;

export const MAINTENANCE = 0.1;            // likuidasi saat sisa margin < 10%

// Kelas aset: spread & fee per sisi, dan apakah ikut jam bursa.
export const ASSET_CLASSES = {
  stock:  { label: 'Saham',   spread: 0.0006, fee: 0.0010, session: true,  unlock: 'stocks'  },
  etf:    { label: 'ETF',     spread: 0.0004, fee: 0.0008, session: true,  unlock: 'stocks'  },
  crypto: { label: 'Kripto',  spread: 0.0012, fee: 0.0020, session: false, unlock: 'crypto'  },
  meme:   { label: 'Pulse',   spread: 0.0100, fee: 0.0100, session: false, unlock: 'pulse'   },
  future: { label: 'Futures', spread: 0.0003, fee: 0.0005, session: false, unlock: 'futures' },
  forex:  { label: 'Forex',   spread: 0.0001, fee: 0.0002, session: false, unlock: 'forex'   },
};

// Fitur yang terbuka per level (meniru progresi RSE 2).
export const UNLOCKS = [
  { level: 1,  key: 'stocks',  label: 'Saham & ETF' },
  { level: 1,  key: 'crypto',  label: 'Kripto (buka 24 jam)' },
  { level: 1,  key: 'vault',   label: 'Vault (tabungan berbunga)' },
  { level: 2,  key: 'pulse',   label: 'Pulse — Meme Coin' },
  { level: 3,  key: 'short',   label: 'Short selling + leverage 2x' },
  { level: 5,  key: 'futures', label: 'Futures + leverage 5x' },
  { level: 7,  key: 'forex',   label: 'Forex' },
  { level: 8,  key: 'vaultpro', label: 'Vault Pro (bunga 2x)' },
  { level: 10, key: 'algos',   label: 'Algo Desk (bot trading) + leverage 10x' },
  { level: 15, key: 'lev25',   label: 'Leverage 25x' },
];

export const LEVERAGE_TIERS = [
  { x: 1, level: 1 },
  { x: 2, level: 3 },
  { x: 5, level: 5 },
  { x: 10, level: 10 },
  { x: 25, level: 15 },
];

export const CODES = {
  STOCKMARKET: 50000,
  MEMECOINS: 10000,
  FUTURES: 10000,
  RELEASE: 10000,
  UPDATE: 7500,
  BULLMARKET: 5000,
};

export const REBIRTH_BASE = 1_000_000;     // syarat net worth rebirth pertama
export const xpForLevel = (lvl) => Math.round(120 * Math.pow(lvl, 1.55));
