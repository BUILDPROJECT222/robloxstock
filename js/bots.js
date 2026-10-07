// Algo Desk: bot trading otomatis yang memakai uang tunai sungguhan dari portofolio.
// Bot bisa di-upgrade: kecepatan (seberapa sering mengambil keputusan),
// keahlian (fee lebih murah, filter tren, trailing stop) dan jumlah slot.

import { ASSET_CLASSES } from './config.js';
import { ema, rsi, uid } from './util.js';

export const STRATEGIES = {
  momentum: { label: 'Momentum', desc: 'EMA 8 vs EMA 21: ikut arah tren' },
  meanrev:  { label: 'Mean Reversion', desc: 'RSI 14: beli oversold (<30), jual overbought (>70)' },
  breakout: { label: 'Breakout', desc: 'Tembus high/low 20 candle → ikut arah' },
};

const SPEED_TICKS = [0, 25, 18, 12, 8, 5];
const MAX_UP = 5;

export class BotDesk {
  constructor(game) {
    this.game = game;
    this.bots = [];
    this.up = { speed: 1, expertise: 1, slots: 1 };
  }

  get market() { return this.game.market; }
  slotCount() { return this.up.slots; }
  upgradeCost(kind) {
    const lvl = this.up[kind];
    if (kind === 'slots') return lvl >= 4 ? null : 15000 * Math.pow(4, lvl - 1);
    return lvl >= MAX_UP ? null : 5000 * Math.pow(3, lvl - 1);
  }
  upgrade(kind) {
    const cost = this.upgradeCost(kind);
    if (cost == null) return { ok: false, msg: 'Sudah maksimal' };
    if (this.game.portfolio.cash < cost) return { ok: false, msg: 'Saldo tidak cukup' };
    this.game.portfolio.cash -= cost;
    this.up[kind]++;
    return { ok: true };
  }

  value(bot) {
    const a = this.market.get(bot.sym);
    if (!bot.pos || !a) return bot.cash;
    return Math.max(0, bot.cash + bot.pos * (a.price - bot.entry) * bot.qty);
  }
  totalValue() { return this.bots.reduce((s, b) => s + this.value(b), 0); }

  create({ strategy, sym, alloc }) {
    const pf = this.game.portfolio;
    if (!this.game.prog.has('algos')) return { ok: false, msg: 'Algo Desk terbuka di Level 10' };
    if (this.bots.length >= this.slotCount()) return { ok: false, msg: 'Slot bot penuh — upgrade slot' };
    const a = this.market.get(sym);
    if (!a || a.cls === 'meme') return { ok: false, msg: 'Pilih aset yang valid (bukan meme coin)' };
    if (!this.game.prog.canTrade(a.cls)) return { ok: false, msg: 'Aset masih terkunci' };
    if (!(alloc >= 100)) return { ok: false, msg: 'Alokasi minimal $100' };
    if (alloc > pf.cash) return { ok: false, msg: 'Saldo tidak cukup' };
    pf.cash -= alloc;
    this.bots.push({ id: uid(), strategy, sym, cash: alloc, alloc, pos: 0, qty: 0, entry: 0, peak: 0, cool: 0, trades: 0, wins: 0, realized: 0, log: [] });
    return { ok: true };
  }

  remove(id) {
    const i = this.bots.findIndex((b) => b.id === id);
    if (i < 0) return;
    const bot = this.bots[i];
    if (bot.pos) this.exit(bot, 'stop');
    this.game.portfolio.cash += bot.cash;
    this.bots.splice(i, 1);
  }

  feeRate(a) { return ASSET_CLASSES[a.cls].fee * (1 - 0.18 * (this.up.expertise - 1)); }

  enter(bot, a, dir) {
    const fee = bot.cash * this.feeRate(a);
    bot.cash -= fee;
    bot.pos = dir;
    bot.entry = a.price * (1 + dir * ASSET_CLASSES[a.cls].spread / 2);
    bot.qty = bot.cash / bot.entry;
    bot.peak = a.price;
    bot.realized -= fee;
    this.log(bot, `${dir > 0 ? 'LONG' : 'SHORT'} @ ${a.price.toPrecision(6)}`);
  }

  exit(bot, why) {
    const a = this.market.get(bot.sym);
    const px = a ? a.price * (1 - bot.pos * ASSET_CLASSES[a.cls].spread / 2) : bot.entry;
    const pnl = bot.pos * (px - bot.entry) * bot.qty;
    const fee = a ? bot.qty * px * this.feeRate(a) : 0;
    bot.cash = Math.max(0, bot.cash + pnl - fee);
    bot.realized += pnl - fee;
    bot.trades++;
    if (pnl - fee > 0) bot.wins++;
    this.game.prog.addXP(3);
    this.log(bot, `EXIT (${why}) ${pnl - fee >= 0 ? '+' : ''}${(pnl - fee).toFixed(2)}`);
    bot.pos = 0; bot.qty = 0;
  }

  log(bot, msg) {
    bot.log.unshift(msg);
    if (bot.log.length > 6) bot.log.pop();
  }

  signal(bot, a) {
    const closes = a.candles.slice(-60).map((c) => c.c);
    closes.push(a.price);
    if (closes.length < 30) return bot.pos;
    let s = bot.pos;
    if (bot.strategy === 'momentum') {
      const f = ema(closes, 8).at(-1), sl = ema(closes, 21).at(-1);
      const gap = (f - sl) / a.price;
      if (gap > 0.0008) s = 1; else if (gap < -0.0008) s = -1;
    } else if (bot.strategy === 'meanrev') {
      const r = rsi(closes, 14);
      if (r < 30) s = 1; else if (r > 70) s = -1;
      else if ((bot.pos > 0 && r > 52) || (bot.pos < 0 && r < 48)) s = 0;
    } else {
      const look = a.candles.slice(-21, -1);
      const hi = Math.max(...look.map((c) => c.h)), lo = Math.min(...look.map((c) => c.l));
      if (a.price > hi) s = 1; else if (a.price < lo) s = -1;
    }
    // keahlian ≥3: filter tren EMA 50 (hindari melawan tren besar)
    if (this.up.expertise >= 3 && s !== 0 && s !== bot.pos) {
      const trend = ema(closes, 50).at(-1);
      if ((s > 0 && a.price < trend * 0.998) || (s < 0 && a.price > trend * 1.002)) s = bot.pos;
    }
    return s;
  }

  update() {
    for (const bot of this.bots) {
      const a = this.market.get(bot.sym);
      if (!a || !this.market.isTradable(a, this.game.open)) continue;
      // keahlian ≥4: trailing stop 2%
      if (bot.pos && this.up.expertise >= 4) {
        bot.peak = bot.pos > 0 ? Math.max(bot.peak, a.price) : Math.min(bot.peak, a.price);
        if ((bot.pos > 0 && a.price < bot.peak * 0.98) || (bot.pos < 0 && a.price > bot.peak * 1.02)) { this.exit(bot, 'trail'); bot.cool = SPEED_TICKS[this.up.speed] * 2; continue; }
      }
      if (--bot.cool > 0) continue;
      bot.cool = SPEED_TICKS[this.up.speed];
      if (bot.cash <= 1) continue;
      const s = this.signal(bot, a);
      if (s === bot.pos) continue;
      if (bot.pos) this.exit(bot, 'sinyal');
      if (s) this.enter(bot, a, s);
    }
  }

  // Simulasi kasar saat pemain offline ("offline market processing").
  offline(days) {
    let gain = 0;
    for (const bot of this.bots) {
      const r = Math.pow(1 + 0.0015 * this.up.expertise, days) - 1;
      const g = bot.cash * r;
      bot.cash += g; bot.realized += g; gain += g;
    }
    return gain;
  }

  serialize() { return { bots: this.bots, up: this.up }; }
  restore(s) { this.bots = s.bots || []; this.up = { ...this.up, ...s.up }; }
}
