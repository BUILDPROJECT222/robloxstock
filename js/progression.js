// Level/XP, unlock, goals (Rewards), kode redeem, Vault, Rebirth, P&L calendar, leaderboard.

import { UNLOCKS, LEVERAGE_TIERS, ASSET_CLASSES, CODES, REBIRTH_BASE, xpForLevel } from './config.js';
import { gauss, rand, fmtMoney } from './util.js';

const NPC_NAMES = [
  'xX_DiamondHands_Xx', 'NoobTrader2016', 'StonksOnlyGoUp', 'Bacon_Whale', 'PaperHandsPete',
  'BuildermanFan', 'GuestTrader404', 'OofCapital', 'TycoonTina', 'BearGang_Bob', 'MoonBoi_99',
];

export const GOALS = [
  { id: 'first_trade', label: 'Trade Pertama', desc: 'Buka posisi apa saja', reward: 250, check: (g) => g.portfolio.stats.opens >= 1 },
  { id: 'first_close', label: 'First Close', desc: 'Tutup posisi pertamamu', reward: 750, check: (g) => g.portfolio.stats.closes >= 1 },
  { id: 'green', label: 'Hijau!', desc: 'Tutup trade dengan profit', reward: 500, check: (g) => g.portfolio.stats.wins >= 1 },
  { id: 'trades10', label: 'Trader Aktif', desc: 'Buka 10 posisi', reward: 1500, check: (g) => g.portfolio.stats.opens >= 10 },
  { id: 'meme', label: 'Degen', desc: 'Trade meme coin di Pulse', reward: 500, check: (g) => g.portfolio.stats.memeTrades >= 1 },
  { id: 'short', label: 'Bear Gang', desc: 'Buka posisi short', reward: 1000, check: (g) => g.portfolio.stats.shorts >= 1 },
  { id: 'lev5', label: 'Leveraged', desc: 'Trade dengan leverage ≥ 5x', reward: 2000, check: (g) => g.portfolio.stats.maxLev >= 5 },
  { id: 'nw10k', label: 'Net Worth $10K', desc: 'Capai net worth $10.000', reward: 1000, check: (g) => g.netWorth() >= 1e4 },
  { id: 'trades50', label: 'Market Maker', desc: 'Buka 50 posisi', reward: 10000, check: (g) => g.portfolio.stats.opens >= 50 },
  { id: 'nw100k', label: 'Net Worth $100K', desc: 'Capai net worth $100.000', reward: 10000, check: (g) => g.netWorth() >= 1e5 },
  { id: 'algo', label: 'Quant', desc: 'Jalankan bot trading pertama', reward: 5000, check: (g) => g.bots.bots.length >= 1 },
  { id: 'liq', label: 'Pelajaran Mahal', desc: 'Kena likuidasi sekali', reward: 100, check: (g) => g.portfolio.stats.liqs >= 1 },
  { id: 'nw1m', label: 'Jutawan', desc: 'Capai net worth $1.000.000', reward: 100000, check: (g) => g.netWorth() >= 1e6 },
];

export class Progression {
  constructor(game) {
    this.game = game;
    this.level = 1;
    this.xp = 0;
    this.rebirths = 0;
    this.claimed = [];
    this.redeemed = [];
    this.vault = 0;
    this.calendar = {};
    this.dayStartNW = null;
    this.external = 0;
    this.npcs = NPC_NAMES.map((name) => ({ name, nw: Math.round(Math.exp(rand(Math.log(4000), Math.log(4e6)))), skill: rand(-0.0002, 0.0008) }));
  }

  get xpMult() { return 1 + 0.5 * this.rebirths; }
  unlockLevel(key) { return UNLOCKS.find((u) => u.key === key)?.level ?? 99; }
  has(key) { return this.level >= this.unlockLevel(key); }
  canTrade(cls) { return this.has(ASSET_CLASSES[cls].unlock); }
  maxLeverage() { return LEVERAGE_TIERS.filter((t) => this.level >= t.level).at(-1).x; }
  leverageTiers() { return LEVERAGE_TIERS; }
  xpNeeded() { return xpForLevel(this.level); }

  addXP(n) {
    this.xp += n * this.xpMult;
    while (this.xp >= this.xpNeeded() && this.level < 50) {
      this.xp -= this.xpNeeded();
      this.level++;
      const unlocked = UNLOCKS.filter((u) => u.level === this.level).map((u) => u.label);
      this.game.onLevelUp(this.level, unlocked);
    }
  }

  // ---- uang dari luar (bukan hasil trading) dihitung terpisah untuk P&L ----
  grant(amount, why) {
    this.game.portfolio.cash += amount;
    this.external += amount;
    this.game.notify(`💰 +${fmtMoney(amount)} — ${why}`, 'good');
  }

  goalState(goal) {
    if (this.claimed.includes(goal.id)) return 'claimed';
    return goal.check(this.game) ? 'ready' : 'locked';
  }

  claim(id) {
    const goal = GOALS.find((g) => g.id === id);
    if (!goal || this.goalState(goal) !== 'ready') return;
    this.claimed.push(id);
    this.grant(goal.reward * (1 + this.rebirths), `Reward: ${goal.label}`);
    this.addXP(25);
  }

  readyGoals() { return GOALS.filter((g) => this.goalState(g) === 'ready').length; }

  redeem(raw) {
    const code = String(raw || '').trim().toUpperCase();
    if (!CODES[code]) return { ok: false, msg: 'Kode tidak valid' };
    if (this.redeemed.includes(code)) return { ok: false, msg: 'Kode sudah dipakai' };
    this.redeemed.push(code);
    this.grant(CODES[code], `Kode ${code}`);
    return { ok: true };
  }

  // ---- Vault ----
  vaultRate() { return (this.has('vaultpro') ? 0.01 : 0.005) * (1 + 0.25 * this.rebirths); }
  deposit(x) {
    x = Math.min(x, this.game.portfolio.cash);
    if (!(x > 0)) return;
    this.game.portfolio.cash -= x;
    this.vault += x;
  }
  withdraw(x) {
    x = Math.min(x, this.vault);
    if (!(x > 0)) return;
    this.vault -= x;
    this.game.portfolio.cash += x;
  }
  payInterest(days = 1) {
    const i = this.vault * (Math.pow(1 + this.vaultRate(), days) - 1);
    this.vault += i;
    return i;
  }

  // ---- P&L harian ----
  todayPnl() {
    if (this.dayStartNW == null) return 0;
    return this.game.netWorth() - this.dayStartNW - this.external;
  }
  startDay(prevDay) {
    if (this.dayStartNW != null && prevDay != null) this.calendar[prevDay] = this.todayPnl();
    this.dayStartNW = this.game.netWorth();
    this.external = 0;
  }

  // ---- Rebirth ----
  rebirthReq() { return REBIRTH_BASE * Math.pow(3, this.rebirths); }
  canRebirth() { return this.game.netWorth() >= this.rebirthReq(); }

  // ---- Leaderboard ----
  tickNpcs(marketRet) {
    for (const n of this.npcs) n.nw = Math.max(100, n.nw * Math.exp(n.skill / 5 + marketRet * 1.5 + gauss() * 0.0015));
  }
  leaderboard() {
    const me = { name: 'Kamu', nw: this.game.netWorth(), me: true, rebirths: this.rebirths };
    return [...this.npcs, me].sort((a, b) => b.nw - a.nw);
  }

  serialize() {
    const { level, xp, rebirths, claimed, redeemed, vault, calendar, dayStartNW, external, npcs } = this;
    return { level, xp, rebirths, claimed, redeemed, vault, calendar, dayStartNW, external, npcs };
  }
  restore(s) { Object.assign(this, s); }
}
