// Level/XP, unlocks, goals (Rewards), redeem codes, Vault, Rebirth, P&L calendar, leaderboard.

import { UNLOCKS, LEVERAGE_TIERS, ASSET_CLASSES, CODES, REBIRTH_BASE, xpForLevel, type UnlockKey } from './config';
import { gauss, rand, fmtMoney } from './util';
import type { AssetClass, Result } from './types';
import type { Game } from './game';

const NPC_NAMES = [
  'xX_DiamondHands_Xx', 'NoobTrader2016', 'StonksOnlyGoUp', 'Bacon_Whale', 'PaperHandsPete',
  'BuildermanFan', 'GuestTrader404', 'OofCapital', 'TycoonTina', 'BearGang_Bob', 'MoonBoi_99',
];

export interface Goal {
  id: string;
  label: string;
  desc: string;
  reward: number;
  check: (g: Game) => boolean;
}

export type GoalState = 'ready' | 'claimed' | 'locked';

export const GOALS: Goal[] = [
  { id: 'first_trade', label: 'First Trade', desc: 'Open any position', reward: 250, check: (g) => g.portfolio.stats.opens >= 1 },
  { id: 'first_close', label: 'First Close', desc: 'Close your first position', reward: 750, check: (g) => g.portfolio.stats.closes >= 1 },
  { id: 'green', label: 'In the Green!', desc: 'Close a trade in profit', reward: 500, check: (g) => g.portfolio.stats.wins >= 1 },
  { id: 'trades10', label: 'Active Trader', desc: 'Open 10 positions', reward: 1500, check: (g) => g.portfolio.stats.opens >= 10 },
  { id: 'meme', label: 'Degen', desc: 'Trade a meme coin on Pulse', reward: 500, check: (g) => g.portfolio.stats.memeTrades >= 1 },
  { id: 'short', label: 'Bear Gang', desc: 'Open a short position', reward: 1000, check: (g) => g.portfolio.stats.shorts >= 1 },
  { id: 'lev5', label: 'Leveraged', desc: 'Trade with ≥ 5x leverage', reward: 2000, check: (g) => g.portfolio.stats.maxLev >= 5 },
  { id: 'nw10k', label: 'Net Worth $10K', desc: 'Reach a $10,000 net worth', reward: 1000, check: (g) => g.netWorth() >= 1e4 },
  { id: 'trades50', label: 'Market Maker', desc: 'Open 50 positions', reward: 10000, check: (g) => g.portfolio.stats.opens >= 50 },
  { id: 'nw100k', label: 'Net Worth $100K', desc: 'Reach a $100,000 net worth', reward: 10000, check: (g) => g.netWorth() >= 1e5 },
  { id: 'algo', label: 'Quant', desc: 'Launch your first trading bot', reward: 5000, check: (g) => g.bots.bots.length >= 1 },
  { id: 'liq', label: 'Expensive Lesson', desc: 'Get liquidated once', reward: 100, check: (g) => g.portfolio.stats.liqs >= 1 },
  { id: 'nw1m', label: 'Millionaire', desc: 'Reach a $1,000,000 net worth', reward: 100000, check: (g) => g.netWorth() >= 1e6 },
];

export interface Npc {
  name: string;
  nw: number;
  skill: number;
}

export interface LeaderRow {
  name: string;
  nw: number;
  me?: boolean;
  rebirths?: number;
}

export class Progression {
  level = 1;
  xp = 0;
  rebirths = 0;
  claimed: string[] = [];
  redeemed: string[] = [];
  vault = 0;
  calendar: Record<number, number> = {};
  dayStartNW: number | null = null;
  external = 0;
  npcs: Npc[] = NPC_NAMES.map((name) => ({ name, nw: Math.round(Math.exp(rand(Math.log(4000), Math.log(4e6)))), skill: rand(-0.0002, 0.0008) }));

  constructor(private game: Game) {}

  get xpMult() { return 1 + 0.5 * this.rebirths; }
  unlockLevel(key: UnlockKey) { return UNLOCKS.find((u) => u.key === key)?.level ?? 99; }
  has(key: UnlockKey) { return this.level >= this.unlockLevel(key); }
  canTrade(cls: AssetClass) { return this.has(ASSET_CLASSES[cls].unlock); }
  maxLeverage() { return LEVERAGE_TIERS.filter((t) => this.level >= t.level).at(-1)!.x; }
  xpNeeded() { return xpForLevel(this.level); }

  addXP(n: number) {
    this.xp += n * this.xpMult;
    while (this.xp >= this.xpNeeded() && this.level < 50) {
      this.xp -= this.xpNeeded();
      this.level++;
      const unlocked = UNLOCKS.filter((u) => u.level === this.level).map((u) => u.label);
      this.game.onLevelUp(this.level, unlocked);
    }
  }

  // ---- outside money (not from trading) is tracked separately for P&L ----
  grant(amount: number, why: string) {
    this.game.portfolio.cash += amount;
    this.external += amount;
    this.game.notify(`💰 +${fmtMoney(amount)} — ${why}`, 'good');
  }

  goalState(goal: Goal): GoalState {
    if (this.claimed.includes(goal.id)) return 'claimed';
    return goal.check(this.game) ? 'ready' : 'locked';
  }

  claim(id: string) {
    const goal = GOALS.find((g) => g.id === id);
    if (!goal || this.goalState(goal) !== 'ready') return;
    this.claimed.push(id);
    this.grant(goal.reward * (1 + this.rebirths), `Reward: ${goal.label}`);
    this.addXP(25);
  }

  readyGoals() { return GOALS.filter((g) => this.goalState(g) === 'ready').length; }

  redeem(raw: string): Result {
    const code = String(raw || '').trim().toUpperCase();
    if (!CODES[code]) return { ok: false, msg: 'Invalid code' };
    if (this.redeemed.includes(code)) return { ok: false, msg: 'Code already redeemed' };
    this.redeemed.push(code);
    this.grant(CODES[code], `Code ${code}`);
    return { ok: true };
  }

  // ---- Vault ----
  vaultRate() { return (this.has('vaultpro') ? 0.01 : 0.005) * (1 + 0.25 * this.rebirths); }
  deposit(x: number) {
    x = Math.min(x, this.game.portfolio.cash);
    if (!(x > 0)) return;
    this.game.portfolio.cash -= x;
    this.vault += x;
  }
  withdraw(x: number) {
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

  // ---- Daily P&L ----
  todayPnl() {
    if (this.dayStartNW == null) return 0;
    return this.game.netWorth() - this.dayStartNW - this.external;
  }
  startDay(prevDay: number | null) {
    if (this.dayStartNW != null && prevDay != null) this.calendar[prevDay] = this.todayPnl();
    this.dayStartNW = this.game.netWorth();
    this.external = 0;
  }

  // ---- Rebirth ----
  rebirthReq() { return REBIRTH_BASE * Math.pow(3, this.rebirths); }
  canRebirth() { return this.game.netWorth() >= this.rebirthReq(); }

  // ---- Leaderboard ----
  tickNpcs(marketRet: number) {
    for (const n of this.npcs) n.nw = Math.max(100, n.nw * Math.exp(n.skill / 5 + marketRet * 1.5 + gauss() * 0.0015));
  }
  leaderboard(): LeaderRow[] {
    const me: LeaderRow = { name: 'You', nw: this.game.netWorth(), me: true, rebirths: this.rebirths };
    return [...this.npcs, me].sort((a, b) => b.nw - a.nw);
  }

  serialize() {
    const { level, xp, rebirths, claimed, redeemed, vault, calendar, dayStartNW, external, npcs } = this;
    return { level, xp, rebirths, claimed, redeemed, vault, calendar, dayStartNW, external, npcs };
  }
  restore(s: ReturnType<Progression['serialize']>) { Object.assign(this, s); }
}
