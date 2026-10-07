// Mesin pasar: harga, candle, berita, earnings, IPO, meme coin, regime bull/bear.
// Model harga: random walk log-normal + faktor pasar & sektor, volatilitas
// berkelompok (volatility clustering), ritme sesi (ramai saat open/close, sepi
// saat makan siang), "magnet" angka bulat, dan dampak berita yang dilepas
// bertahap (news follow-through).

import { gauss, rand, randInt, pick, clamp, uid } from './util.js';
import { ASSET_CLASSES, CANDLE_TICKS, MAX_CANDLES, SESSION_OPEN, SESSION_CLOSE } from './config.js';

export const SECTORS = ['Tech', 'Gaming', 'Energy', 'Finance', 'Health', 'Retail'];

const STOCK_DEFS = [
  { sym: 'BLOX', name: 'Bloxcorp Interactive', sector: 'Gaming',  price: 142,  vol: 0.00108, beta: 1.2, div: 0 },
  { sym: 'OBBY', name: 'Obby Dynamics',        sector: 'Gaming',  price: 61,   vol: 0.00144, beta: 1.4, div: 0 },
  { sym: 'TYCN', name: 'Tycoon Holdings',      sector: 'Finance', price: 310,  vol: 0.00078, beta: 1.0, div: 0.002 },
  { sym: 'BUXX', name: 'Bux Financial',        sector: 'Finance', price: 48,   vol: 0.00096, beta: 1.1, div: 0.003 },
  { sym: 'CHIP', name: 'Microchip Blocks',     sector: 'Tech',    price: 455,  vol: 0.00126, beta: 1.5, div: 0 },
  { sym: 'BYTE', name: 'Bytestream Cloud',     sector: 'Tech',    price: 76,   vol: 0.00114, beta: 1.3, div: 0 },
  { sym: 'BRIK', name: 'Brick Energy',         sector: 'Energy',  price: 88,   vol: 0.00090, beta: 0.8, div: 0.004 },
  { sym: 'OILR', name: 'Oil Rig Petroleum',    sector: 'Energy',  price: 57,   vol: 0.00120, beta: 0.9, div: 0.0035 },
  { sym: 'MEDK', name: 'Medkit Labs',          sector: 'Health',  price: 132,  vol: 0.00102, beta: 0.7, div: 0.0015 },
  { sym: 'ADPT', name: 'Adopt Petcare',        sector: 'Health',  price: 19.4, vol: 0.00156, beta: 0.9, div: 0 },
  { sym: 'NOOB', name: 'Noob Industries',      sector: 'Retail',  price: 23.5, vol: 0.00138, beta: 1.0, div: 0.001 },
  { sym: 'PIZZ', name: 'Pizza Place Co.',      sector: 'Retail',  price: 34,   vol: 0.00096, beta: 0.8, div: 0.0025 },
];

const ETF_DEFS = [
  { sym: 'BLX100', name: 'Blox 100 Index ETF', sector: 'ETF', filter: () => true },
  { sym: 'TECHX',  name: 'Tech & Gaming ETF',  sector: 'ETF', filter: (a) => a.sector === 'Tech' || a.sector === 'Gaming' },
  { sym: 'YIELD',  name: 'Dividend Income ETF', sector: 'ETF', filter: (a) => a.div > 0, div: 0.002 },
];

const CRYPTO_DEFS = [
  { sym: 'BTX',  name: 'Blockcoin',  price: 64200, vol: 0.0012, beta: 1.3 },
  { sym: 'ETHB', name: 'Etherblox',  price: 3210,  vol: 0.0015, beta: 1.5 },
  { sym: 'SOLO', name: 'Solo Chain', price: 146,   vol: 0.0021, beta: 1.8 },
];

const FUTURE_DEFS = [
  { sym: 'BX1!',   name: 'Blox 100 Futures', price: 0,    vol: 0,      beta: 1 },
  { sym: 'OIL1!',  name: 'Crude Oil Futures', price: 78.4, vol: 0.0007, beta: 0.4 },
  { sym: 'GOLD1!', name: 'Gold Futures',      price: 2380, vol: 0.0003, beta: -0.3 },
];

const FOREX_DEFS = [
  { sym: 'EURUSD', name: 'Euro / Dollar',   price: 1.0842, vol: 0.00014 },
  { sym: 'USDJPY', name: 'Dollar / Yen',    price: 151.2,  vol: 0.00017 },
  { sym: 'GBPUSD', name: 'Pound / Dollar',  price: 1.2711, vol: 0.00015 },
];

const MEME_NAMES = [
  'OOF', 'NOOBINU', 'BACON', 'SKIBI', 'DOGEBLOX', 'GUEST', 'RIZZ', 'BRAINROT', 'TUNG', 'SIGMA',
  'OBBYPEPE', 'CATBUX', 'MOONHAT', 'LAVA', 'BANHAMMER', 'ZESTY', 'GRIMACE', 'NPC', 'AURA', 'GYATT',
];

const IPO_POOL = [
  { sym: 'PETS', name: 'Pet Sim Brands',    sector: 'Gaming' },
  { sym: 'BEDW', name: 'Bedwars Defense',   sector: 'Tech' },
  { sym: 'JAIL', name: 'Jailbreak Security', sector: 'Finance' },
  { sym: 'BLOXF', name: 'Blox Fruits Farms', sector: 'Retail' },
  { sym: 'DOOR', name: 'Doors Hospitality', sector: 'Retail' },
  { sym: 'BRKH', name: 'Brookhaven Realty', sector: 'Finance' },
  { sym: 'ARSN', name: 'Arsenal Arms',      sector: 'Tech' },
  { sym: 'THRP', name: 'Therapy Health',    sector: 'Health' },
  { sym: 'SOLR', name: 'Solar Bloxworks',   sector: 'Energy' },
];

const NEWS = {
  companyUp: [
    '{name} meluncurkan produk baru, analis menaikkan target harga',
    '{name} menang kontrak raksasa senilai miliaran',
    'Rumor akuisisi: {name} diincar perusahaan besar',
    '{name} umumkan buyback saham besar-besaran',
    'Influencer besar pamer posisi di {sym}, retail ikut FOMO',
    '{name} masuk indeks Blox 100 — dana pasif wajib beli',
  ],
  companyDown: [
    '{name} kena denda besar dari regulator',
    'CEO {name} mendadak mengundurkan diri',
    '{name} menarik kembali (recall) produk unggulannya',
    'Laporan short-seller menyerang {sym}: "angka tidak masuk akal"',
    'Server {name} down seharian, pengguna marah',
    'Analis menurunkan rating {sym} menjadi SELL',
  ],
  sectorUp: [
    'Sektor {sector} menguat setelah data permintaan kuat',
    'Pemerintah beri subsidi besar untuk sektor {sector}',
  ],
  sectorDown: [
    'Regulasi baru menekan sektor {sector}',
    'Permintaan di sektor {sector} melambat tajam',
  ],
  macroUp: [
    'Bank sentral memangkas suku bunga 50bps — pasar bersorak',
    'Inflasi turun lebih cepat dari perkiraan',
    'Data tenaga kerja solid, ekonomi soft landing',
  ],
  macroDown: [
    'Inflasi lebih panas dari perkiraan, yield melonjak',
    'Bank sentral memberi sinyal hawkish',
    'Ketegangan geopolitik memicu aksi jual global',
  ],
  cryptoUp: [
    'ETF spot {name} disetujui regulator',
    'Whale memborong {sym} dalam jumlah besar',
    'Exchange besar listing {sym} dengan pasangan baru',
  ],
  cryptoDown: [
    'Exchange besar diretas, {sym} anjlok',
    'Whale memindahkan {sym} ke exchange — sinyal jual?',
    'Regulator mengancam larangan staking {sym}',
  ],
};

const fill = (tpl, a) => tpl.replace('{name}', a.name || '').replace('{sym}', a.sym || '').replace('{sector}', a.sector || '');

function sessionMult(minute) {
  const t = clamp((minute - SESSION_OPEN) / (SESSION_CLOSE - SESSION_OPEN), 0, 1);
  const u = 2 * t - 1;
  return 0.55 + 1.6 * u * u; // U-shape: ramai di open & close, sepi siang
}

function roundStep(p) {
  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(p, 1e-9))));
  return mag; // contoh: 142 -> 100, 64200 -> 10000
}

function makeAsset(def, cls) {
  const p = def.price;
  return {
    sym: def.sym, name: def.name, cls, sector: def.sector || ASSET_CLASSES[cls].label,
    price: p, base: p, dayRef: p, dayHigh: p, dayLow: p,
    vol: def.vol || 0.002, beta: def.beta ?? 1, drift: def.drift ?? 0.000002,
    div: def.div || 0, pending: 0, volState: 1, volume: 0, dayVolume: 0,
    candles: [], cur: null, curTicks: 0, alive: true, rugged: 0,
    meme: null, nextEarnings: null, listed: 0,
  };
}

export class Market {
  constructor() {
    this.assets = new Map();
    this.regime = { type: 'bull', daysLeft: 4 };
    this.marketPending = 0;
    this.sectorPending = Object.fromEntries(SECTORS.map((s) => [s, 0]));
    this.overnight = 0;
    this.basis = 0.0008;
    this.news = [];
    this.ipoQueue = [];
    this.listeners = {};
    this.lastMarketRet = 0;
  }

  on(evt, fn) { (this.listeners[evt] ||= []).push(fn); }
  emit(evt, data) { (this.listeners[evt] || []).forEach((fn) => fn(data)); }

  get list() { return [...this.assets.values()]; }
  get(sym) { return this.assets.get(sym); }
  stocks() { return this.list.filter((a) => a.cls === 'stock'); }

  isTradable(a, open) {
    if (!a || !a.alive || a.rugged) return false;
    return ASSET_CLASSES[a.cls].session ? open : true;
  }

  // ---------- setup ----------
  init(day) {
    STOCK_DEFS.forEach((d) => this.assets.set(d.sym, makeAsset(d, 'stock')));
    for (const a of this.stocks()) a.nextEarnings = day + randInt(1, 6);
    ETF_DEFS.forEach((d) => {
      const a = makeAsset({ ...d, price: 100 }, 'etf');
      a.div = d.div || 0;
      this.assets.set(d.sym, a);
    });
    CRYPTO_DEFS.forEach((d) => this.assets.set(d.sym, makeAsset(d, 'crypto')));
    FUTURE_DEFS.forEach((d) => this.assets.set(d.sym, makeAsset(d, 'future')));
    FOREX_DEFS.forEach((d) => this.assets.set(d.sym, makeAsset({ ...d, beta: 0, drift: 0 }, 'forex')));
    for (let i = 0; i < 4; i++) this.spawnMeme(day, true);
    this.syncDerived(true);

    // Isi histori chart supaya tidak kosong saat mulai.
    const fakeClock = { day, minute: SESSION_OPEN };
    for (let i = 0; i < 110 * CANDLE_TICKS; i++) {
      fakeClock.minute = SESSION_OPEN + (i % (SESSION_CLOSE - SESSION_OPEN));
      this.step(fakeClock, true, 1, true);
    }
    for (const a of this.list) { a.dayRef = a.price; a.dayHigh = a.dayLow = a.price; a.dayVolume = 0; }
  }

  etfComponents(sym) {
    const def = ETF_DEFS.find((d) => d.sym === sym);
    return this.stocks().filter((s) => s.alive && def.filter(s));
  }

  syncDerived(reset = false) {
    for (const d of ETF_DEFS) {
      const etf = this.assets.get(d.sym);
      const comps = this.etfComponents(d.sym);
      if (!comps.length) continue;
      const idx = comps.reduce((s, c) => s + c.price / c.base, 0) / comps.length;
      if (reset || !etf.idxBase) { etf.idxBase = idx; etf.base = etf.price; }
      etf.price = etf.base * (idx / etf.idxBase);
    }
  }

  // Saat komponen ETF berubah (IPO / delisting) indeks dikalibrasi ulang
  // supaya harga ETF tidak melompat.
  rebaseEtfs() {
    for (const d of ETF_DEFS) {
      const etf = this.assets.get(d.sym);
      const comps = this.etfComponents(d.sym);
      if (!comps.length) continue;
      const idx = comps.reduce((s, c) => s + c.price / c.base, 0) / comps.length;
      etf.idxBase = idx; etf.base = etf.price;
    }
  }

  spawnMeme(day, quiet = false) {
    const used = new Set(this.list.map((a) => a.sym));
    const name = MEME_NAMES.filter((n) => !used.has(n));
    if (!name.length) return;
    const sym = pick(name);
    const a = makeAsset({ sym, name: `$${sym} Coin`, price: rand(0.0004, 0.08), vol: rand(0.005, 0.011), beta: 0.5, drift: -0.0001 }, 'meme');
    a.meme = { top10: rand(15, 85), dev: rand(5, 95), liq: rand(4000, 120000), holders: randInt(80, 4000) };
    a.listed = day;
    this.assets.set(sym, a);
    if (!quiet) this.pushNews({ text: `🚀 Meme coin baru diluncurkan di Pulse: $${sym}`, sym, impact: 0, tag: 'pulse' });
    this.emit('listing', a);
  }

  rugRisk(a) {
    const m = a.meme;
    return clamp(((m.top10 - 25) / 75) * 0.55 + (1 - m.dev / 100) * 0.3 + (m.liq < 20000 ? 0.25 : 0), 0.02, 1);
  }

  pushNews(n) {
    n.id = uid();
    n.at = this.clockRef ? { ...this.clockRef } : null;
    this.news.unshift(n);
    if (this.news.length > 80) this.news.pop();
    this.emit('news', n);
  }

  // ---------- simulasi per tick ----------
  step(clock, open, dt, quiet = false) {
    this.clockRef = clock;
    const sm = open ? sessionMult(clock.minute) : 1;
    const sq = Math.sqrt(dt);
    const regimeDrift = this.regime.type === 'bull' ? 0.000014 : this.regime.type === 'bear' ? -0.000018 : 0;

    const mRelease = this.marketPending * 0.12;
    this.marketPending -= mRelease;
    const mRet = gauss() * 0.0004 * sq * (open ? sm : 0.6) + (open ? regimeDrift * dt : 0) + mRelease;
    this.lastMarketRet = mRet;
    if (!open) this.overnight += mRet;

    const sRet = {};
    for (const s of SECTORS) {
      const rel = this.sectorPending[s] * 0.12;
      this.sectorPending[s] -= rel;
      sRet[s] = gauss() * 0.0003 * sq * sm + rel;
    }

    for (const a of this.assets.values()) {
      if (!a.alive || a.cls === 'etf' || a.sym === 'BX1!') continue;
      const cls = ASSET_CLASSES[a.cls];
      if (cls.session && !open) continue;
      if (a.rugged) { a.rugged++; this.updateCandle(a, a.price, 0); continue; }

      const rel = a.pending * 0.12;
      a.pending -= rel;
      a.volState = 1 + (a.volState - 1) * 0.96;
      const sigma = a.vol * (cls.session ? sm : 1) * a.volState * sq;
      let z = gauss();
      if (Math.random() < 0.003) z *= 3.5; // ekor gemuk
      let ret = a.drift * dt + rel + z * sigma;
      if (a.cls === 'stock') ret += a.beta * mRet + (sRet[a.sector] || 0);
      else if (a.cls === 'crypto' || a.cls === 'meme') ret += a.beta * mRet;
      else if (a.sym === 'GOLD1!') ret += -0.3 * mRet;
      else if (a.sym === 'OIL1!') ret += 0.6 * sRet.Energy;

      // likuiditas di sekitar angka bulat
      const st = roundStep(a.price) / 2;
      const nearest = Math.round(a.price / st) * st;
      const d = (nearest - a.price) / a.price;
      if (Math.abs(d) < 0.0015) ret += d * 0.08;

      if (Math.abs(z) > 2.4) a.volState = Math.min(4, a.volState + 0.35);
      a.price = Math.max(a.price * Math.exp(ret), 1e-7);

      if (a.meme && !quiet) this.memeStep(a, clock);
      this.updateCandle(a, a.price, (0.5 + Math.abs(z)) * sm);
    }

    // ETF & futures indeks (turunan)
    if (open) {
      this.syncDerived();
      for (const d of ETF_DEFS) this.updateCandle(this.assets.get(d.sym), this.assets.get(d.sym).price, sm);
    }
    const bx = this.assets.get('BX1!');
    const idx = this.assets.get('BLX100');
    this.basis += (0.0008 - this.basis) * 0.02 + gauss() * 0.00004;
    bx.price = idx.price * Math.exp(this.overnight) * (1 + this.basis);
    this.updateCandle(bx, bx.price, sm);

    if (!quiet) this.randomEvents(clock, open);
  }

  updateCandle(a, p, volUnits) {
    const v = volUnits * (1 + Math.random());
    if (!a.cur) a.cur = { o: p, h: p, l: p, c: p, v: 0 };
    a.cur.h = Math.max(a.cur.h, p);
    a.cur.l = Math.min(a.cur.l, p);
    a.cur.c = p;
    a.cur.v += v;
    a.dayVolume += v;
    a.dayHigh = Math.max(a.dayHigh, p);
    a.dayLow = Math.min(a.dayLow, p);
    if (++a.curTicks >= CANDLE_TICKS) {
      a.candles.push(a.cur);
      if (a.candles.length > MAX_CANDLES) a.candles.shift();
      a.cur = null;
      a.curTicks = 0;
    }
  }

  memeStep(a, clock) {
    const m = a.meme;
    m.dev = clamp(m.dev + gauss() * 1.2, 0, 100);
    m.top10 = clamp(m.top10 + gauss() * 0.6, 5, 98);
    m.liq = Math.max(500, m.liq * (1 + gauss() * 0.01) * (a.price / (a.prevP || a.price)));
    m.holders = Math.max(10, Math.round(m.holders * (1 + gauss() * 0.004 + 0.0005)));
    a.prevP = a.price;
    const risk = this.rugRisk(a);
    if (Math.random() < risk * 0.0011) {
      a.price *= rand(0.02, 0.09);
      a.rugged = 1;
      this.updateCandle(a, a.price, 20);
      this.pushNews({ text: `💀 RUG PULL! Dev $${a.sym} kabur membawa likuiditas. Harga -95%`, sym: a.sym, impact: -1, tag: 'pulse' });
      this.emit('rug', a);
    } else if (Math.random() < 0.0012) {
      const boost = rand(0.4, 2.5);
      a.pending += Math.log(1 + boost);
      a.volState = 3;
      m.holders = Math.round(m.holders * 1.5);
      this.pushNews({ text: `🌕 $${a.sym} viral di TikTok! Pembeli membanjir`, sym: a.sym, impact: 1, tag: 'pulse' });
    }
  }

  randomEvents(clock, open) {
    // berita perusahaan / sektor saat bursa buka
    if (open && Math.random() < 1 / 45) {
      const r = Math.random();
      if (r < 0.62) {
        const a = pick(this.stocks().filter((s) => s.alive));
        const up = Math.random() < 0.52;
        const mag = rand(0.01, 0.05);
        a.pending += up ? mag : -mag;
        a.volState = Math.min(4, a.volState + 1.2);
        this.pushNews({ text: fill(pick(up ? NEWS.companyUp : NEWS.companyDown), a), sym: a.sym, impact: up ? 1 : -1, tag: 'saham' });
      } else if (r < 0.88) {
        const sector = pick(SECTORS);
        const up = Math.random() < 0.5;
        this.sectorPending[sector] += (up ? 1 : -1) * rand(0.006, 0.025);
        this.pushNews({ text: fill(pick(up ? NEWS.sectorUp : NEWS.sectorDown), { sector }), sector, impact: up ? 1 : -1, tag: 'sektor' });
      } else {
        const up = Math.random() < 0.5;
        this.marketPending += (up ? 1 : -1) * rand(0.006, 0.02);
        this.pushNews({ text: pick(up ? NEWS.macroUp : NEWS.macroDown), impact: up ? 1 : -1, tag: 'makro' });
      }
    }
    // berita kripto kapan saja
    if (Math.random() < 1 / 160) {
      const a = pick(this.list.filter((x) => x.cls === 'crypto'));
      const up = Math.random() < 0.5;
      a.pending += (up ? 1 : -1) * rand(0.015, 0.06);
      a.volState = 3;
      this.pushNews({ text: fill(pick(up ? NEWS.cryptoUp : NEWS.cryptoDown), a), sym: a.sym, impact: up ? 1 : -1, tag: 'kripto' });
    }
    // meme coin baru & delisting
    const memes = this.list.filter((a) => a.cls === 'meme');
    if (memes.filter((a) => !a.rugged).length < 6 && Math.random() < 1 / 180) this.spawnMeme(clock.day);
    for (const a of memes) {
      if (a.rugged > 25 || (a.price < 1e-6 && !a.rugged)) {
        a.alive = false;
        this.assets.delete(a.sym);
        this.emit('delist', a);
      }
    }
  }

  // ---------- transisi sesi ----------
  onSessionOpen(day) {
    const gaps = [];
    // IPO hari ini
    for (const ipo of this.ipoQueue.filter((q) => q.day === day)) {
      const a = makeAsset({ ...ipo, price: Math.round(rand(12, 90)), vol: rand(0.0015, 0.0025), beta: rand(1, 1.6) }, 'stock');
      a.nextEarnings = day + randInt(3, 7);
      a.listed = day;
      a.pending = rand(-0.08, 0.25); // "IPO pop"
      a.volState = 3;
      this.assets.set(a.sym, a);
      this.rebaseEtfs();
      this.pushNews({ text: `🔔 IPO: ${a.name} (${a.sym}) resmi melantai di bursa hari ini!`, sym: a.sym, impact: 1, tag: 'ipo' });
      this.emit('listing', a);
    }
    this.ipoQueue = this.ipoQueue.filter((q) => q.day !== day);

    for (const a of this.stocks()) {
      let g = a.beta * this.overnight + gauss() * 0.004;
      if (a.nextEarnings === day) {
        const surprise = gauss() * 0.05;
        g += surprise;
        a.volState = 3;
        a.nextEarnings = day + randInt(5, 9);
        this.pushNews({
          text: `📊 Earnings ${a.sym}: ${surprise >= 0 ? 'melampaui' : 'meleset dari'} estimasi — gap ${(surprise * 100).toFixed(1)}%`,
          sym: a.sym, impact: surprise >= 0 ? 1 : -1, tag: 'earnings',
        });
      }
      a.price *= Math.exp(g);
      gaps.push(a.sym);
    }
    this.overnight = 0;
    this.syncDerived();
    this.pushNews({ text: `🔔 Bel pembukaan berbunyi — Hari ${day} dimulai`, impact: 0, tag: 'sesi' });
    return gaps;
  }

  onSessionClose(day) {
    const dividends = [];
    for (const a of this.list) {
      if (a.div > 0 && (a.cls === 'stock' || a.cls === 'etf')) dividends.push({ sym: a.sym, rate: a.div });
    }
    for (const a of this.list) { a.dayRef = a.price; a.dayHigh = a.dayLow = a.price; a.dayVolume = 0; }

    if (--this.regime.daysLeft <= 0) {
      const r = Math.random();
      const type = r < 0.45 ? 'bull' : r < 0.75 ? 'sideways' : 'bear';
      this.regime = { type, daysLeft: randInt(3, 7) };
      const label = { bull: '🐂 BULL MARKET', bear: '🐻 BEAR MARKET', sideways: '😴 pasar SIDEWAYS' }[type];
      this.pushNews({ text: `Analis: pasar memasuki fase ${label}`, impact: type === 'bull' ? 1 : type === 'bear' ? -1 : 0, tag: 'makro' });
    }

    if (Math.random() < 0.3 && this.stocks().length < 18 && !this.ipoQueue.length) {
      const pool = IPO_POOL.filter((p) => !this.assets.has(p.sym));
      if (pool.length) {
        const ipo = { ...pick(pool), day: day + randInt(1, 2) };
        this.ipoQueue.push(ipo);
        this.pushNews({ text: `🗓️ ${ipo.name} (${ipo.sym}) dijadwalkan IPO pada Hari ${ipo.day}`, sym: ipo.sym, impact: 0, tag: 'ipo' });
      }
    }
    this.pushNews({ text: `🔕 Bel penutupan — bursa saham tutup. Kripto, futures & forex tetap jalan.`, impact: 0, tag: 'sesi' });
    return dividends;
  }

  upcoming(day) {
    const ev = [];
    for (const a of this.stocks()) if (a.nextEarnings) ev.push({ day: a.nextEarnings, type: 'Earnings', sym: a.sym });
    for (const q of this.ipoQueue) ev.push({ day: q.day, type: 'IPO', sym: q.sym });
    return ev.filter((e) => e.day >= day).sort((a, b) => a.day - b.day).slice(0, 12);
  }

  // ---------- simpan / muat ----------
  serialize() {
    return {
      regime: this.regime, overnight: this.overnight, basis: this.basis, ipoQueue: this.ipoQueue,
      news: this.news.slice(0, 30),
      assets: this.list.map((a) => ({ ...a, candles: a.candles.slice(-120) })),
    };
  }

  restore(s) {
    this.regime = s.regime; this.overnight = s.overnight; this.basis = s.basis;
    this.ipoQueue = s.ipoQueue || []; this.news = s.news || [];
    this.assets.clear();
    for (const a of s.assets) this.assets.set(a.sym, a);
  }
}
