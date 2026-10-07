// Portofolio pemain: order market/limit, long/short, leverage, TP/SL, likuidasi.
// "Jumlah" yang dimasukkan pemain = modal (margin). Eksposur = modal × leverage.

import { ASSET_CLASSES, MAINTENANCE } from './config.js';
import { uid, fmtPrice } from './util.js';

export class Portfolio {
  constructor(game, cash) {
    this.game = game;
    this.reset(cash);
  }

  reset(cash) {
    this.cash = cash;
    this.positions = [];
    this.orders = [];
    this.history = [];
    this.stats = { opens: 0, closes: 0, wins: 0, volume: 0, realized: 0, shorts: 0, liqs: 0, memeTrades: 0, maxLev: 1, best: 0, dividends: 0 };
  }

  get market() { return this.game.market; }

  pnl(pos, price) { return pos.dir * (price - pos.entry) * pos.qty; }
  posValue(pos) {
    const a = this.market.get(pos.sym);
    const p = a ? a.price : pos.lastPrice ?? pos.entry;
    return Math.max(0, pos.margin + this.pnl(pos, p));
  }
  reserved() { return this.orders.reduce((s, o) => s + o.amount + o.fee, 0); }
  equity() { return this.cash + this.positions.reduce((s, p) => s + this.posValue(p), 0) + this.reserved(); }
  unrealized() { return this.positions.reduce((s, p) => s + this.posValue(p) - p.margin, 0); }

  liqPrice(entry, dir, lev) {
    if (lev === 1 && dir === 1) return null; // long tanpa leverage tidak bisa dilikuidasi
    return entry * (1 - dir * (1 - MAINTENANCE) / lev);
  }

  preview({ sym, side, type, amount, leverage, limit }) {
    const a = this.market.get(sym);
    if (!a) return null;
    const cls = ASSET_CLASSES[a.cls];
    const dir = side === 'long' ? 1 : -1;
    const fill = type === 'limit' && limit > 0 ? limit : a.price * (1 + dir * cls.spread / 2);
    const notional = (amount || 0) * leverage;
    return {
      fill, notional, qty: notional / fill, fee: notional * cls.fee,
      liq: this.liqPrice(fill, dir, leverage), cost: (amount || 0) + notional * cls.fee,
    };
  }

  validate(o) {
    const { game } = this;
    const a = this.market.get(o.sym);
    if (!a || !a.alive) return 'Aset tidak tersedia';
    if (a.rugged) return 'Aset ini sudah di-rug pull 💀';
    if (!game.prog.canTrade(a.cls)) return `Terkunci — buka di level ${game.prog.unlockLevel(ASSET_CLASSES[a.cls].unlock)}`;
    if (o.side === 'short' && !game.prog.has('short')) return 'Short terbuka di Level 3';
    if (o.leverage > game.prog.maxLeverage()) return `Leverage ${o.leverage}x belum terbuka`;
    if (a.cls === 'meme' && o.leverage > 1) return 'Meme coin hanya bisa 1x';
    if (!(o.amount > 0)) return 'Masukkan jumlah modal';
    if (o.amount < 1) return 'Minimal $1';
    const pv = this.preview(o);
    if (pv.cost > this.cash + 1e-9) return 'Saldo tidak cukup';
    if (o.type === 'limit' && !(o.limit > 0)) return 'Masukkan harga limit';
    if (o.type === 'market' && !this.market.isTradable(a, game.open)) return 'Bursa saham tutup — pakai order Limit';
    return null;
  }

  placeOrder(o) {
    const err = this.validate(o);
    if (err) return { ok: false, msg: err };
    const a = this.market.get(o.sym);
    const pv = this.preview(o);
    if (o.type === 'market') {
      this.cash -= pv.cost;
      const pos = this.openPosition(a, o, pv.fill, pv.fee);
      return { ok: true, msg: `${o.side === 'long' ? 'LONG' : 'SHORT'} ${a.sym} @ ${fmtPrice(pv.fill)}`, pos };
    }
    this.cash -= pv.cost;
    const order = { id: uid(), ...o, fee: pv.fee, cls: a.cls, placedAt: { ...this.game.clock } };
    this.orders.push(order);
    return { ok: true, msg: `Order limit ${o.side.toUpperCase()} ${a.sym} @ ${fmtPrice(o.limit)} dipasang` };
  }

  cancelOrder(id) {
    const i = this.orders.findIndex((o) => o.id === id);
    if (i < 0) return;
    const o = this.orders[i];
    this.cash += o.amount + o.fee;
    this.orders.splice(i, 1);
  }

  openPosition(a, o, fill, fee) {
    const dir = o.side === 'long' ? 1 : -1;
    const notional = o.amount * o.leverage;
    const pos = {
      id: uid(), sym: a.sym, cls: a.cls, side: o.side, dir,
      qty: notional / fill, entry: fill, margin: o.amount, lev: o.leverage, fee,
      tp: o.tpPct > 0 ? fill * (1 + dir * o.tpPct / 100) : null,
      sl: o.slPct > 0 ? fill * (1 - dir * o.slPct / 100) : null,
      liq: this.liqPrice(fill, dir, o.leverage),
      openedAt: { ...this.game.clock }, lastPrice: fill,
    };
    this.positions.push(pos);
    const s = this.stats;
    s.opens++; s.volume += notional;
    if (dir < 0) s.shorts++;
    if (a.cls === 'meme') s.memeTrades++;
    s.maxLev = Math.max(s.maxLev, o.leverage);
    this.game.onOpen(pos, notional);
    return pos;
  }

  closePosition(id, reason = 'manual', priceOverride = null) {
    const i = this.positions.findIndex((p) => p.id === id);
    if (i < 0) return { ok: false, msg: 'Posisi tidak ditemukan' };
    const pos = this.positions[i];
    const a = this.market.get(pos.sym);
    if (reason === 'manual' && (!a || !this.market.isTradable(a, this.game.open))) {
      return { ok: false, msg: 'Bursa saham tutup — posisi bisa ditutup saat bel pembukaan' };
    }
    const spread = ASSET_CLASSES[pos.cls].spread;
    const raw = priceOverride ?? (a ? a.price : pos.lastPrice);
    const exit = raw * (1 - pos.dir * spread / 2);
    const fee = reason === 'liq' || reason === 'rug' ? 0 : exit * pos.qty * ASSET_CLASSES[pos.cls].fee;
    const value = Math.max(0, pos.margin + this.pnl(pos, exit) - fee);
    this.cash += value;
    const net = value - pos.margin - pos.fee;
    this.positions.splice(i, 1);

    const rec = { ...pos, exit, net, reason, closedAt: { ...this.game.clock } };
    this.history.unshift(rec);
    if (this.history.length > 100) this.history.pop();
    const s = this.stats;
    s.closes++; s.realized += net; s.volume += exit * pos.qty;
    if (net > 0) s.wins++;
    if (reason === 'liq') s.liqs++;
    s.best = Math.max(s.best, net);
    this.game.onClose(rec);
    return { ok: true, rec };
  }

  // Dipanggil setiap tick: cek likuidasi, TP/SL, dan order limit.
  update() {
    const { market, game } = this;
    for (const pos of [...this.positions]) {
      const a = market.get(pos.sym);
      if (!a) { this.closePosition(pos.id, 'delist', pos.lastPrice); continue; }
      if (!market.isTradable(a, game.open)) continue;
      const p = a.price;
      pos.lastPrice = p;
      const hit = (lvl, below) => lvl != null && (below ? p <= lvl : p >= lvl);
      if (hit(pos.liq, pos.dir > 0)) this.closePosition(pos.id, 'liq');
      else if (hit(pos.tp, pos.dir < 0)) this.closePosition(pos.id, 'tp');
      else if (hit(pos.sl, pos.dir > 0)) this.closePosition(pos.id, 'sl');
    }
    for (const o of [...this.orders]) {
      const a = market.get(o.sym);
      if (!a) { this.cancelOrder(o.id); continue; }
      if (!market.isTradable(a, game.open)) continue;
      const p = a.price;
      if ((o.side === 'long' && p <= o.limit) || (o.side === 'short' && p >= o.limit)) {
        const fill = o.side === 'long' ? Math.min(p, o.limit) : Math.max(p, o.limit);
        this.orders.splice(this.orders.indexOf(o), 1);
        const pos = this.openPosition(a, o, fill, o.fee);
        game.notify(`✅ Limit terisi: ${o.side.toUpperCase()} ${a.sym} @ ${fmtPrice(fill)}`, 'good');
        game.world?.flash(pos.dir > 0 ? 0x00e676 : 0xff5252);
      }
    }
  }

  // Rug pull: semua posisi & order pada coin tsb ditutup paksa.
  onRug(a) {
    for (const pos of this.positions.filter((p) => p.sym === a.sym)) this.closePosition(pos.id, 'rug', a.price);
    for (const o of this.orders.filter((x) => x.sym === a.sym)) this.cancelOrder(o.id);
  }

  payDividends(list) {
    let total = 0;
    for (const { sym, rate } of list) {
      const a = this.market.get(sym);
      if (!a) continue;
      for (const pos of this.positions.filter((p) => p.sym === sym)) {
        const amt = pos.qty * a.price * rate;
        if (pos.dir > 0) { this.cash += amt; total += amt; }
        else { pos.margin = Math.max(0, pos.margin - amt); total -= amt; } // short membayar dividen
      }
    }
    this.stats.dividends += total;
    return total;
  }

  serialize() {
    return { cash: this.cash, positions: this.positions, orders: this.orders, history: this.history.slice(0, 50), stats: this.stats };
  }

  restore(s) {
    Object.assign(this, { cash: s.cash, positions: s.positions, orders: s.orders, history: s.history });
    this.stats = { ...this.stats, ...s.stats };
  }
}
