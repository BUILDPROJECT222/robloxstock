// Shared types for the simulation engine.

export type AssetClass = 'stock' | 'etf' | 'crypto' | 'meme' | 'future' | 'forex';
export type Side = 'long' | 'short';
export type OrderType = 'market' | 'limit';
export type CloseReason = 'manual' | 'tp' | 'sl' | 'liq' | 'rug' | 'delist';
export type Regime = 'bull' | 'bear' | 'sideways';

export interface Clock {
  day: number;
  minute: number;
}

export interface Candle {
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface MemeStats {
  top10: number;
  dev: number;
  liq: number;
  holders: number;
}

export interface Asset {
  sym: string;
  name: string;
  cls: AssetClass;
  sector: string;
  price: number;
  base: number;
  dayRef: number;
  dayHigh: number;
  dayLow: number;
  vol: number;
  beta: number;
  drift: number;
  div: number;
  pending: number;
  volState: number;
  volume: number;
  dayVolume: number;
  candles: Candle[];
  cur: Candle | null;
  curTicks: number;
  alive: boolean;
  rugged: number;
  meme: MemeStats | null;
  nextEarnings: number | null;
  listed: number;
  idxBase?: number;
  prevP?: number;
}

export interface OrderRequest {
  sym: string;
  side: Side;
  type: OrderType;
  amount: number;
  leverage: number;
  limit?: number;
  tpPct?: number;
  slPct?: number;
}

export interface Order extends OrderRequest {
  id: string;
  limit: number;
  fee: number;
  cls: AssetClass;
  placedAt: Clock;
}

export interface Position {
  id: string;
  sym: string;
  cls: AssetClass;
  side: Side;
  dir: 1 | -1;
  qty: number;
  entry: number;
  margin: number;
  lev: number;
  fee: number;
  tp: number | null;
  sl: number | null;
  liq: number | null;
  openedAt: Clock;
  lastPrice: number;
}

export interface ClosedTrade extends Position {
  exit: number;
  net: number;
  reason: CloseReason;
  closedAt: Clock;
}

export interface NewsItem {
  id: string;
  text: string;
  sym?: string;
  sector?: string;
  impact: number;
  tag: string;
  at: Clock | null;
}

export interface Result {
  ok: boolean;
  msg?: string;
}

export type ToastKind = 'info' | 'good' | 'bad';
