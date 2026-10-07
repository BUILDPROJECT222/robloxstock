// Main game loop: exchange clock, session transitions, events, save/load, rebirth.
// The engine has no DOM/React knowledge: the UI subscribes to change notifications
// and to "toast" / "modal" events.

import { Market } from './market';
import { Portfolio } from './trading';
import { Progression } from './progression';
import { BotDesk } from './bots';
import { TICK_MS, SESSION_OPEN, SESSION_CLOSE, MIN_PER_TICK_OPEN, MIN_PER_TICK_CLOSED, START_CASH } from './config';
import { fmtMoney } from './util';
import type { ClosedTrade, Clock, Position, ToastKind } from './types';

const SAVE_KEY = 'blox-stock-exchange-3d-v1';
const UI_EMIT_MS = 120; // React refresh throttle

// What the 3D layer must provide; the engine only calls these hooks.
export interface WorldHooks {
  flash(color: number): void;
  burst(good: boolean, amount?: number): void;
  sync(game: Game, full: boolean): void;
  frame(dt: number): void;
}

export type GameModal =
  | { kind: 'levelup'; level: number; unlocked: string[] }
  | { kind: 'rebirth'; rebirths: number; cash: number; xpMult: number }
  | { kind: 'welcome'; days: number; interest: number; botGain: number };

type GameEvents = {
  toast: { msg: string; kind: ToastKind };
  modal: GameModal;
};

export class Game {
  market = new Market();
  portfolio: Portfolio;
  prog: Progression;
  bots: BotDesk;
  clock: Clock = { day: 1, minute: SESSION_OPEN };
  open = true;
  speed = 1;
  selected = 'BLOX';
  ticks = 0;
  started = false; // false until the training bonus is claimed
  version = 0; // bumped whenever React should re-render
  world: WorldHooks | null = null;

  private changeListeners = new Set<() => void>();
  private listeners: Record<string, ((d: never) => void)[]> = {};
  private acc = 0;
  private last = 0;
  private lastEmit = 0;
  private dirty = false;
  private raf = 0;
  private pendingWelcome: GameModal | null = null;

  constructor() {
    this.portfolio = new Portfolio(this, START_CASH);
    this.prog = new Progression(this);
    this.bots = new BotDesk(this);
    const saved = this.load();
    this.market.clockRef = this.clock;
    if (saved) {
      this.started = true;
      this.offlineProgress(saved.savedAt);
    } else {
      this.market.init(this.clock.day);
      this.portfolio.cash = 0;
    }
    this.bindMarket();
  }

  // ---------- subscriptions (React uses useSyncExternalStore) ----------
  subscribe = (fn: () => void) => {
    this.changeListeners.add(fn);
    return () => this.changeListeners.delete(fn);
  };
  getVersion = () => this.version;

  on<K extends keyof GameEvents>(evt: K, fn: (d: GameEvents[K]) => void) {
    (this.listeners[evt] ||= []).push(fn);
    return () => {
      this.listeners[evt] = (this.listeners[evt] || []).filter((f) => f !== fn);
    };
  }
  private emit<K extends keyof GameEvents>(evt: K, data: GameEvents[K]) {
    (this.listeners[evt] || []).forEach((fn) => (fn as (d: GameEvents[K]) => void)(data));
  }

  /** Notify React right away (after a player action). */
  changed() {
    this.version++;
    this.dirty = false;
    this.lastEmit = performance.now();
    this.changeListeners.forEach((fn) => fn());
  }

  /** Run a player action and refresh the UI + 3D world. */
  act<T>(fn: () => T): T {
    const r = fn();
    this.world?.sync(this, false);
    this.changed();
    return r;
  }

  notify(msg: string, kind: ToastKind = 'info') { this.emit('toast', { msg, kind }); }

  netWorth() { return this.portfolio.equity() + this.prog.vault + this.bots.totalValue(); }

  setSpeed(s: number) { this.act(() => { this.speed = s; }); }

  select(sym: string) {
    if (!this.market.get(sym)) return;
    this.act(() => { this.selected = sym; });
  }

  claimTrainingBonus() {
    if (this.started) return;
    this.started = true;
    this.portfolio.cash = START_CASH;
    this.prog.startDay(null);
    this.world?.burst(true, 120);
    this.notify(`💵 ${fmtMoney(START_CASH)} training bonus received! Happy trading.`, 'good');
    this.save();
    this.changed();
  }

  /** The welcome-back modal is shown once the UI is listening. */
  takePendingWelcome() {
    const m = this.pendingWelcome;
    this.pendingWelcome = null;
    return m;
  }

  private bindMarket() {
    const m = this.market;
    m.on('rug', (a) => {
      const had = this.portfolio.positions.some((p) => p.sym === a.sym);
      this.portfolio.onRug(a);
      if (had) {
        this.world?.burst(false, 80);
        this.world?.flash(0xff1744);
      }
      this.notify(`💀 $${a.sym} got RUG PULLED!`, 'bad');
    });
    m.on('listing', () => this.world?.sync(this, true));
    m.on('delist', (a) => {
      if (this.selected === a.sym) this.selected = 'BLOX';
      this.world?.sync(this, true);
    });
    m.on('news', (n) => {
      const mine = n.sym && (n.sym === this.selected || this.portfolio.positions.some((p) => p.sym === n.sym));
      if (mine || n.tag === 'macro' || n.tag === 'ipo') this.notify('📰 ' + n.text, n.impact > 0 ? 'good' : n.impact < 0 ? 'bad' : 'info');
    });
  }

  // ---------- callbacks from portfolio / progression ----------
  onOpen(pos: Position, notional: number) {
    this.prog.addXP(5 + Math.min(notional / 400, 40));
    this.world?.flash(pos.dir > 0 ? 0x00e676 : 0xff5252);
  }

  onClose(rec: ClosedTrade) {
    const xp = 10 + Math.min((rec.margin * rec.lev) / 300, 60) + (rec.net > 0 ? 15 : 0);
    this.prog.addXP(xp);
    const tag = { tp: '🎯 TP', sl: '🛑 SL', liq: '💥 LIQUIDATED', rug: '💀 RUG', manual: '', delist: 'Delisted' }[rec.reason] || '';
    this.notify(`${tag} Closed ${rec.side.toUpperCase()} ${rec.sym}: ${fmtMoney(rec.net, { sign: true })}`.trim(), rec.net >= 0 ? 'good' : 'bad');
    if (rec.reason === 'liq') {
      this.world?.burst(false, 90);
      this.world?.flash(0xff1744);
    } else if (rec.net > 0) this.world?.burst(true, Math.min(140, 20 + Math.log10(1 + rec.net) * 25));
  }

  onLevelUp(level: number, unlocked: string[]) {
    this.world?.burst(true, 150);
    this.world?.flash(0xffd54f);
    this.notify(`⭐ LEVEL UP! You are now Level ${level}`, 'good');
    if (unlocked.length) this.emit('modal', { kind: 'levelup', level, unlocked });
  }

  // ---------- one simulation tick ----------
  tick() {
    const c = this.clock;
    let dt: number;
    if (this.open) {
      dt = MIN_PER_TICK_OPEN;
      c.minute += dt;
    } else {
      dt = MIN_PER_TICK_CLOSED;
      let next = c.minute + dt;
      if (c.minute < SESSION_OPEN && next > SESSION_OPEN) {
        dt = SESSION_OPEN - c.minute;
        next = SESSION_OPEN;
      }
      c.minute = next;
      if (c.minute >= 1440) {
        c.minute -= 1440;
        c.day++;
      }
    }
    const nowOpen = c.minute >= SESSION_OPEN && c.minute < SESSION_CLOSE;
    if (nowOpen && !this.open) {
      this.open = true;
      this.market.onSessionOpen(c.day);
      this.prog.startDay(c.day - 1);
      this.world?.sync(this, true);
    } else if (!nowOpen && this.open) {
      this.open = false;
      const divs = this.market.onSessionClose(c.day);
      const paid = this.portfolio.payDividends(divs);
      const interest = this.prog.payInterest(1);
      if (paid) this.notify(`💵 Dividends: ${fmtMoney(paid, { sign: true })}`, paid > 0 ? 'good' : 'bad');
      if (interest > 0.01) this.notify(`🏦 Vault interest: +${fmtMoney(interest)}`, 'good');
    }

    this.market.step(c, this.open, Math.max(dt, 0.1));
    this.portfolio.update();
    this.bots.update();
    this.prog.tickNpcs(this.market.lastMarketRet);
    this.ticks++;
    this.world?.sync(this, false);
    this.dirty = true;
  }

  // ---------- loop ----------
  start() {
    if (this.raf) return;
    this.last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      if (this.started) {
        this.acc += dt * 1000 * this.speed;
        let n = 0;
        while (this.acc >= TICK_MS && n < 8) {
          this.tick();
          this.acc -= TICK_MS;
          n++;
        }
        if (n >= 8) this.acc = 0;
      }
      if (this.dirty && now - this.lastEmit > UI_EMIT_MS) this.changed();
      this.world?.frame(dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    window.addEventListener('beforeunload', () => this.save());
    setInterval(() => this.save(), 5000);
  }

  // ---------- rebirth ----------
  rebirth() {
    if (!this.prog.canRebirth()) return;
    const p = this.prog;
    p.rebirths++;
    p.level = 1;
    p.xp = 0;
    p.vault = 0;
    this.bots.reset();
    this.portfolio.reset(START_CASH * (1 + p.rebirths));
    p.startDay(null);
    this.world?.burst(true, 250);
    this.emit('modal', { kind: 'rebirth', rebirths: p.rebirths, cash: this.portfolio.cash, xpMult: p.xpMult });
    this.save();
    this.changed();
  }

  // ---------- save / load ----------
  save() {
    if (!this.started) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        v: 1, savedAt: Date.now(), clock: this.clock, open: this.open, selected: this.selected, speed: this.speed,
        market: this.market.serialize(), portfolio: this.portfolio.serialize(), prog: this.prog.serialize(), bots: this.bots.serialize(),
      }));
    } catch {
      /* storage full / blocked: ignore */
    }
  }

  private load(): { savedAt: number } | null {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      this.clock = s.clock;
      this.open = s.open;
      this.selected = s.selected;
      this.speed = s.speed ?? 1;
      this.market.restore(s.market);
      this.portfolio.restore(s.portfolio);
      this.prog.restore(s.prog);
      this.bots.restore(s.bots);
      if (!this.market.get(this.selected)) this.selected = 'BLOX';
      return s;
    } catch (e) {
      console.warn('Corrupted save, starting fresh', e);
      this.market = new Market();
      return null;
    }
  }

  private offlineProgress(savedAt: number) {
    const secs = (Date.now() - savedAt) / 1000;
    if (secs < 60) return;
    const days = Math.min(secs / 100, 10);
    const interest = this.prog.payInterest(days);
    const botGain = this.bots.offline(days);
    if (interest + botGain >= 0.01) this.pendingWelcome = { kind: 'welcome', days, interest, botGain };
  }

  resetSave() {
    localStorage.removeItem(SAVE_KEY);
    this.started = false;
    location.reload();
  }
}

export const game = new Game();
