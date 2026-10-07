// Game loop utama: jam bursa, transisi sesi, event, simpan/muat, rebirth.

import { Market } from './market.js';
import { Portfolio } from './trading.js';
import { Progression } from './progression.js';
import { BotDesk } from './bots.js';
import { World } from './scene.js';
import { UI } from './ui.js';
import {
  TICK_MS, SESSION_OPEN, SESSION_CLOSE, MIN_PER_TICK_OPEN, MIN_PER_TICK_CLOSED, START_CASH,
} from './config.js';
import { fmtMoney } from './util.js';

const SAVE_KEY = 'blox-stock-exchange-3d-v1';

class Game {
  constructor() {
    this.market = new Market();
    this.portfolio = new Portfolio(this, START_CASH);
    this.prog = new Progression(this);
    this.bots = new BotDesk(this);
    this.clock = { day: 1, minute: SESSION_OPEN };
    this.open = true;
    this.speed = 1;
    this.selected = 'BLOX';
    this.ticks = 0;

    const loaded = this.load();
    this.market.clockRef = this.clock;
    if (!loaded) {
      this.market.init(this.clock.day);
      this.portfolio.cash = 0;
    }

    this.world = new World(document.getElementById('world'), { onSelect: (sym) => this.select(sym) });
    this.ui = new UI(this);
    this.bindMarket();
    this.refreshWorld(true);
    this.ui.refresh(true);

    if (!loaded) {
      this.ui.showHelp(true);
      // training bonus seperti di RSE 2
      const m = document.getElementById('modal');
      const giveBonus = () => {
        if (this.bonusGiven) return;
        this.bonusGiven = true;
        this.portfolio.cash = START_CASH;
        this.prog.startDay(null);
        this.world.burst(true, 120);
        this.ui.notify(`💵 Training bonus ${fmtMoney(START_CASH)} masuk! Selamat trading.`, 'good');
        this.save();
      };
      m.addEventListener('click', (e) => { if (e.target.closest('button')) giveBonus(); });
    } else {
      this.bonusGiven = true;
      this.offlineProgress(loaded);
    }

    this.last = performance.now();
    this.acc = 0;
    requestAnimationFrame((t) => this.loop(t));
    window.addEventListener('beforeunload', () => this.save());
    setInterval(() => this.save(), 5000);
  }

  netWorth() { return this.portfolio.equity() + this.prog.vault + this.bots.totalValue(); }

  setSpeed(s) { this.speed = s; this.ui.refresh(true); }

  select(sym) {
    if (!this.market.get(sym)) return;
    this.selected = sym;
    this.ui.onSelect();
    this.refreshWorld();
    this.ui.refresh(true);
  }

  bindMarket() {
    const m = this.market;
    m.on('rug', (a) => {
      const had = this.portfolio.positions.some((p) => p.sym === a.sym);
      this.portfolio.onRug(a);
      if (had) { this.world.burst(false, 80); this.world.flash(0xff1744); }
      this.ui.notify(`💀 $${a.sym} kena RUG PULL!`, 'bad');
    });
    m.on('listing', () => this.world && this.refreshWorld(true));
    m.on('delist', (a) => {
      if (this.selected === a.sym) this.select('BLOX');
      this.refreshWorld(true);
    });
    m.on('news', (n) => {
      if (!this.ui) return;
      const mine = n.sym && (n.sym === this.selected || this.portfolio.positions.some((p) => p.sym === n.sym));
      if (mine || n.tag === 'makro' || n.tag === 'ipo') this.ui.notify('📰 ' + n.text, n.impact > 0 ? 'good' : n.impact < 0 ? 'bad' : 'info');
    });
  }

  // ---- callback dari portofolio / progresi ----
  onOpen(pos, notional) {
    this.prog.addXP(5 + Math.min(notional / 400, 40));
    this.world?.flash(pos.dir > 0 ? 0x00e676 : 0xff5252);
  }

  onClose(rec) {
    const xp = 10 + Math.min((rec.margin * rec.lev) / 300, 60) + (rec.net > 0 ? 15 : 0);
    this.prog.addXP(xp);
    const tag = { tp: '🎯 TP', sl: '🛑 SL', liq: '💥 LIKUIDASI', rug: '💀 RUG', manual: '', delist: 'Delist' }[rec.reason] || '';
    const msg = `${tag} Tutup ${rec.side.toUpperCase()} ${rec.sym}: ${fmtMoney(rec.net, { sign: true })}`;
    this.ui?.notify(msg.trim(), rec.net >= 0 ? 'good' : 'bad');
    if (rec.reason === 'liq') { this.world.burst(false, 90); this.world.flash(0xff1744); }
    else if (rec.net > 0) this.world.burst(true, Math.min(140, 20 + Math.log10(1 + rec.net) * 25));
  }

  onLevelUp(level, unlocked) {
    this.world?.burst(true, 150);
    this.world?.flash(0xffd54f);
    if (!this.ui) return;
    this.ui.notify(`⭐ LEVEL UP! Sekarang Level ${level}`, 'good');
    if (unlocked.length) {
      this.ui.modal(`<h2>⭐ Level ${level}!</h2><p>Fitur baru terbuka:</p><ul>${unlocked.map((u) => `<li><b>${u}</b></li>`).join('')}</ul>`, [{ label: 'Mantap!', cls: 'primary' }]);
    }
    this.ui.renderWatch(true);
    this.ui.syncForm();
    if (['algo', 'rewards'].includes(this.ui.bottomTab)) this.ui.openTab(this.ui.bottomTab);
  }

  notify(msg, kind) { this.ui?.notify(msg, kind); }

  // ---- satu tick simulasi ----
  tick() {
    const c = this.clock;
    let dt;
    if (this.open) {
      dt = MIN_PER_TICK_OPEN;
      c.minute += dt;
    } else {
      dt = MIN_PER_TICK_CLOSED;
      let next = c.minute + dt;
      if (c.minute < SESSION_OPEN && next > SESSION_OPEN) { dt = SESSION_OPEN - c.minute; next = SESSION_OPEN; }
      c.minute = next;
      if (c.minute >= 1440) { c.minute -= 1440; c.day++; }
    }
    const nowOpen = c.minute >= SESSION_OPEN && c.minute < SESSION_CLOSE;
    if (nowOpen && !this.open) {
      this.open = true;
      this.market.onSessionOpen(c.day);
      this.prog.startDay(c.day - 1);
      this.refreshWorld(true);
    } else if (!nowOpen && this.open) {
      this.open = false;
      const divs = this.market.onSessionClose(c.day);
      const paid = this.portfolio.payDividends(divs);
      const interest = this.prog.payInterest(1);
      if (paid) this.notify(`💵 Dividen: ${fmtMoney(paid, { sign: true })}`, paid > 0 ? 'good' : 'bad');
      if (interest > 0.01) this.notify(`🏦 Bunga vault: +${fmtMoney(interest)}`, 'good');
    }

    this.market.step(c, this.open, Math.max(dt, 0.1));
    this.portfolio.update();
    this.bots.update();
    this.prog.tickNpcs(this.market.lastMarketRet);
    this.ticks++;
    this.refreshWorld();
    this.ui.refresh();
  }

  refreshWorld(full = false) {
    const w = this.world;
    if (!w) return;
    const list = this.market.list;
    if (full || this.ticks % 25 === 0) w.syncAssets(list);
    w.updateAssets(list, this.selected, (a) => this.prog.canTrade(a.cls));
    const a = this.market.get(this.selected);
    w.updateChart(a, {
      open: this.open,
      sessionAsset: a && ['stock', 'etf'].includes(a.cls),
      positions: this.portfolio.positions.filter((p) => p.sym === this.selected),
      orders: this.portfolio.orders.filter((o) => o.sym === this.selected),
    });
    if (full || this.ticks % 5 === 0) w.updateTicker(list);
    w.setSession(this.open, this.clock.minute, this.market.regime.type);
    const idx = this.market.get('BLX100');
    w.setMood(idx ? idx.price / idx.dayRef - 1 : 0);
  }

  loop(now) {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.bonusGiven) {
      this.acc += dt * 1000 * this.speed;
      let n = 0;
      while (this.acc >= TICK_MS && n < 8) { this.tick(); this.acc -= TICK_MS; n++; }
      if (n >= 8) this.acc = 0;
    }
    this.world.frame(dt);
    requestAnimationFrame((t) => this.loop(t));
  }

  // ---- rebirth ----
  rebirth() {
    if (!this.prog.canRebirth()) return;
    const p = this.prog;
    p.rebirths++;
    p.level = 1; p.xp = 0; p.vault = 0;
    this.bots.bots = [];
    this.bots.up = { speed: 1, expertise: 1, slots: 1 };
    this.portfolio.reset(START_CASH * (1 + p.rebirths));
    p.startDay(null);
    this.world.burst(true, 250);
    this.ui.modal(`<h2>♻️ Rebirth ${p.rebirths}!</h2><p>Kamu mulai lagi dengan ${fmtMoney(this.portfolio.cash)} dan bonus permanen XP ×${p.xpMult.toFixed(1)}. Gas lagi!</p>`, [{ label: 'Gas!', cls: 'primary' }]);
    this.ui.renderWatch(true);
    this.ui.syncForm();
    this.ui.openTab(this.ui.bottomTab);
    this.save();
  }

  // ---- simpan / muat ----
  save() {
    if (!this.bonusGiven) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        v: 1, savedAt: Date.now(), clock: this.clock, open: this.open, selected: this.selected, speed: this.speed,
        market: this.market.serialize(), portfolio: this.portfolio.serialize(), prog: this.prog.serialize(), bots: this.bots.serialize(),
      }));
    } catch (e) { /* storage penuh / diblokir: abaikan */ }
  }

  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      this.clock = s.clock; this.open = s.open; this.selected = s.selected; this.speed = s.speed ?? 1;
      this.market.restore(s.market);
      this.portfolio.restore(s.portfolio);
      this.prog.restore(s.prog);
      this.bots.restore(s.bots);
      if (!this.market.get(this.selected)) this.selected = 'BLOX';
      return s;
    } catch (e) {
      console.warn('Save rusak, mulai baru', e);
      return null;
    }
  }

  offlineProgress(saved) {
    const secs = (Date.now() - saved.savedAt) / 1000;
    if (secs < 60) return;
    const days = Math.min(secs / 100, 10);
    const interest = this.prog.payInterest(days);
    const botGain = this.bots.offline(days);
    if (interest + botGain < 0.01) return;
    this.ui.modal(`<h2>👋 Selamat datang kembali!</h2><p>Selama kamu pergi (~${days.toFixed(1)} hari bursa):</p>
      <ul><li>Bunga vault: <b class="up">+${fmtMoney(interest)}</b></li><li>Hasil bot (offline): <b class="up">+${fmtMoney(botGain)}</b></li></ul>`, [{ label: 'Lanjut trading', cls: 'primary' }]);
  }

  resetSave() {
    localStorage.removeItem(SAVE_KEY);
    this.bonusGiven = false;
    location.reload();
  }
}

window.game = new Game();
