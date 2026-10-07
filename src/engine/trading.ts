// Player portfolio: market/limit orders, long/short, leverage, TP/SL, liquidation.
// The "amount" the player enters = margin. Exposure = margin × leverage.

import { ASSET_CLASSES, MAINTENANCE } from './config';
import { uid, fmtPrice } from './util';
import type { Asset, ClosedTrade, CloseReason, Order, OrderRequest, Position } from './types';
import type { Dividend } from './market';
import type { Game } from './game';

export interface Stats {
  opens: number;
  closes: number;
  wins: number;
  volume: number;
  realized: number;
  shorts: number;
  liqs: number;
  memeTrades: number;
  maxLev: number;
  best: number;
  dividends: number;
}

export interface Preview {
  fill: number;
  notional: number;
  qty: number;
  fee: number;
  liq: number | null;
  cost: number;
}

const freshStats = (): Stats => ({
  opens: 0, closes: 0, wins: 0, volume: 0, realized: 0, shorts: 0, liqs: 0, memeTrades: 0, maxLev: 1, best: 0, dividends: 0,
});

export class Portfolio {
  cash = 0;
  positions: Position[] = [];
  orders: Order[] = [];
  history: ClosedTrade[] = [];
  stats: Stats = freshStats();

  constructor(private game: Game, cash: number) {
    this.reset(cash);
  }

  reset(cash: number) {
    this.cash = cash;
    this.positions = [];
    this.orders = [];
    this.history = [];
    this.stats = freshStats();
  }

  get market() { return this.game.market; }

  pnl(pos: Position, price: number) { return pos.dir * (price - pos.entry) * pos.qty; }
  posValue(pos: Position) {
    const a = this.market.get(pos.sym);
    const p = a ? a.price : pos.lastPrice ?? pos.entry;
    return Math.max(0, pos.margin + this.pnl(pos, p));
  }
  reserved() { return this.orders.reduce((s, o) => s + o.amount + o.fee, 0); }
  equity() { return this.cash + this.positions.reduce((s, p) => s + this.posValue(p), 0) + this.reserved(); }

  liqPrice(entry: number, dir: number, lev: number) {
    if (lev === 1 && dir === 1) return null; // an unleveraged long can't be liquidated
    return entry * (1 - (dir * (1 - MAINTENANCE)) / lev);
  }

  preview(o: OrderRequest): Preview | null {
    const a = this.market.get(o.sym);
    if (!a) return null;
    const cls = ASSET_CLASSES[a.cls];
    const dir = o.side === 'long' ? 1 : -1;
    const fill = o.type === 'limit' && o.limit && o.limit > 0 ? o.limit : a.price * (1 + (dir * cls.spread) / 2);
    const notional = (o.amount || 0) * o.leverage;
    return {
      fill, notional, qty: notional / fill, fee: notional * cls.fee,
      liq: this.liqPrice(fill, dir, o.leverage), cost: (o.amount || 0) + notional * cls.fee,
    };
  }

  validate(o: OrderRequest): string | null {
    const { game } = this;
    const a = this.market.get(o.sym);
    if (!a || !a.alive) return 'Asset not available';
    if (a.rugged) return 'This asset got rug pulled 💀';
    if (!game.prog.canTrade(a.cls)) return `Locked — unlocks at level ${game.prog.unlockLevel(ASSET_CLASSES[a.cls].unlock)}`;
    if (o.side === 'short' && !game.prog.has('short')) return 'Shorting unlocks at Level 3';
    if (o.leverage > game.prog.maxLeverage()) return `${o.leverage}x leverage is still locked`;
    if (a.cls === 'meme' && o.leverage > 1) return 'Meme coins are 1x only';
    if (!(o.amount > 0)) return 'Enter an amount';
    if (o.amount < 1) return 'Minimum is $1';
    const pv = this.preview(o)!;
    if (pv.cost > this.cash + 1e-9) return 'Insufficient balance';
    if (o.type === 'limit' && !(o.limit && o.limit > 0)) return 'Enter a limit price';
    if (o.type === 'market' && !this.market.isTradable(a, game.open)) return 'Stock market closed — use a Limit order';
    return null;
  }

  placeOrder(o: OrderRequest): { ok: boolean; msg: string } {
    const err = this.validate(o);
    if (err) return { ok: false, msg: err };
    const a = this.market.get(o.sym)!;
    const pv = this.preview(o)!;
    this.cash -= pv.cost;
    if (o.type === 'market') {
      this.openPosition(a, o, pv.fill, pv.fee);
      return { ok: true, msg: `${o.side === 'long' ? 'LONG' : 'SHORT'} ${a.sym} @ ${fmtPrice(pv.fill)}` };
    }
    const order: Order = { ...o, id: uid(), limit: o.limit!, fee: pv.fee, cls: a.cls, placedAt: { ...this.game.clock } };
    this.orders.push(order);
    return { ok: true, msg: `Limit ${o.side.toUpperCase()} ${a.sym} @ ${fmtPrice(order.limit)} placed` };
  }

  cancelOrder(id: string) {
    const i = this.orders.findIndex((o) => o.id === id);
    if (i < 0) return;
    const o = this.orders[i];
    this.cash += o.amount + o.fee;
    this.orders.splice(i, 1);
  }

  openPosition(a: Asset, o: OrderRequest, fill: number, fee: number) {
    const dir = o.side === 'long' ? 1 : -1;
    const notional = o.amount * o.leverage;
    const pos: Position = {
      id: uid(), sym: a.sym, cls: a.cls, side: o.side, dir,
      qty: notional / fill, entry: fill, margin: o.amount, lev: o.leverage, fee,
      tp: o.tpPct && o.tpPct > 0 ? fill * (1 + (dir * o.tpPct) / 100) : null,
      sl: o.slPct && o.slPct > 0 ? fill * (1 - (dir * o.slPct) / 100) : null,
      liq: this.liqPrice(fill, dir, o.leverage),
      openedAt: { ...this.game.clock }, lastPrice: fill,
    };
    this.positions.push(pos);
    const s = this.stats;
    s.opens++;
    s.volume += notional;
    if (dir < 0) s.shorts++;
    if (a.cls === 'meme') s.memeTrades++;
    s.maxLev = Math.max(s.maxLev, o.leverage);
    this.game.onOpen(pos, notional);
    return pos;
  }

  closePosition(id: string, reason: CloseReason = 'manual', priceOverride: number | null = null): { ok: boolean; msg?: string } {
    const i = this.positions.findIndex((p) => p.id === id);
    if (i < 0) return { ok: false, msg: 'Position not found' };
    const pos = this.positions[i];
    const a = this.market.get(pos.sym);
    if (reason === 'manual' && (!a || !this.market.isTradable(a, this.game.open))) {
      return { ok: false, msg: 'Stock market closed — you can close this position at the opening bell' };
    }
    const spread = ASSET_CLASSES[pos.cls].spread;
    const raw = priceOverride ?? (a ? a.price : pos.lastPrice);
    const exit = raw * (1 - (pos.dir * spread) / 2);
    const fee = reason === 'liq' || reason === 'rug' ? 0 : exit * pos.qty * ASSET_CLASSES[pos.cls].fee;
    const value = Math.max(0, pos.margin + this.pnl(pos, exit) - fee);
    this.cash += value;
    const net = value - pos.margin - pos.fee;
    this.positions.splice(i, 1);

    const rec: ClosedTrade = { ...pos, exit, net, reason, closedAt: { ...this.game.clock } };
    this.history.unshift(rec);
    if (this.history.length > 100) this.history.pop();
    const s = this.stats;
    s.closes++;
    s.realized += net;
    s.volume += exit * pos.qty;
    if (net > 0) s.wins++;
    if (reason === 'liq') s.liqs++;
    s.best = Math.max(s.best, net);
    this.game.onClose(rec);
    return { ok: true };
  }

  // Called every tick: checks liquidation, TP/SL and limit orders.
  update() {
    const { market, game } = this;
    for (const pos of [...this.positions]) {
      const a = market.get(pos.sym);
      if (!a) {
        this.closePosition(pos.id, 'delist', pos.lastPrice);
        continue;
      }
      if (!market.isTradable(a, game.open)) continue;
      const p = a.price;
      pos.lastPrice = p;
      const hit = (lvl: number | null, below: boolean) => lvl != null && (below ? p <= lvl : p >= lvl);
      if (hit(pos.liq, pos.dir > 0)) this.closePosition(pos.id, 'liq');
      else if (hit(pos.tp, pos.dir < 0)) this.closePosition(pos.id, 'tp');
      else if (hit(pos.sl, pos.dir > 0)) this.closePosition(pos.id, 'sl');
    }
    for (const o of [...this.orders]) {
      const a = market.get(o.sym);
      if (!a) {
        this.cancelOrder(o.id);
        continue;
      }
      if (!market.isTradable(a, game.open)) continue;
      const p = a.price;
      if ((o.side === 'long' && p <= o.limit) || (o.side === 'short' && p >= o.limit)) {
        const fill = o.side === 'long' ? Math.min(p, o.limit) : Math.max(p, o.limit);
        this.orders.splice(this.orders.indexOf(o), 1);
        const pos = this.openPosition(a, o, fill, o.fee);
        game.notify(`✅ Limit filled: ${o.side.toUpperCase()} ${a.sym} @ ${fmtPrice(fill)}`, 'good');
        game.world?.flash(pos.dir > 0 ? 0x00e676 : 0xff5252);
      }
    }
  }

  // Rug pull: every position & order on that coin is force-closed.
  onRug(a: Asset) {
    for (const pos of this.positions.filter((p) => p.sym === a.sym)) this.closePosition(pos.id, 'rug', a.price);
    for (const o of this.orders.filter((x) => x.sym === a.sym)) this.cancelOrder(o.id);
  }

  payDividends(list: Dividend[]) {
    let total = 0;
    for (const { sym, rate } of list) {
      const a = this.market.get(sym);
      if (!a) continue;
      for (const pos of this.positions.filter((p) => p.sym === sym)) {
        const amt = pos.qty * a.price * rate;
        if (pos.dir > 0) {
          this.cash += amt;
          total += amt;
        } else {
          pos.margin = Math.max(0, pos.margin - amt); // shorts pay the dividend
          total -= amt;
        }
      }
    }
    this.stats.dividends += total;
    return total;
  }

  serialize() {
    return { cash: this.cash, positions: this.positions, orders: this.orders, history: this.history.slice(0, 50), stats: this.stats };
  }

  restore(s: ReturnType<Portfolio['serialize']>) {
    this.cash = s.cash;
    this.positions = s.positions;
    this.orders = s.orders;
    this.history = s.history;
    this.stats = { ...freshStats(), ...s.stats };
  }
}
