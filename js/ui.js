// Antarmuka HTML di atas dunia 3D: top bar, watchlist, tiket order, panel bawah.

import { ASSET_CLASSES, LEVERAGE_TIERS, UNLOCKS } from './config.js';
import { STRATEGIES } from './bots.js';
import { GOALS } from './progression.js';
import { fmtMoney, fmtPrice, fmtPct, fmtQty, fmtClock, ema, clamp, rand } from './util.js';

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cls = (x) => (x >= 0 ? 'up' : 'down');

const WATCH_TABS = [
  { key: 'stocks', label: 'Saham', unlock: 'stocks', filter: (a) => a.cls === 'stock' || a.cls === 'etf' },
  { key: 'crypto', label: 'Kripto', unlock: 'crypto', filter: (a) => a.cls === 'crypto' },
  { key: 'pulse', label: 'Pulse', unlock: 'pulse', filter: (a) => a.cls === 'meme' },
  { key: 'futures', label: 'Futures', unlock: 'futures', filter: (a) => a.cls === 'future' },
  { key: 'forex', label: 'Forex', unlock: 'forex', filter: (a) => a.cls === 'forex' },
];

const BOTTOM_TABS = [
  ['pos', 'Posisi'], ['orders', 'Order'], ['hist', 'Riwayat'], ['news', 'Berita'], ['cal', 'Kalender P&L'],
  ['algo', 'Algo Desk'], ['vault', 'Vault'], ['rewards', 'Rewards'], ['lead', 'Peringkat'],
];

const REASON = { manual: 'Manual', tp: 'Take Profit', sl: 'Stop Loss', liq: '💥 Likuidasi', rug: '💀 Rug pull', delist: 'Delisting', stop: 'Bot stop' };
const when = (t) => (t ? `H${t.day} ${fmtClock(t.minute)}` : '');

export class UI {
  constructor(game) {
    this.game = game;
    this.watchTab = 'stocks';
    this.bottomTab = 'pos';
    this.form = { side: 'long', type: 'market', lev: 1, amount: 500, limit: 0, tp: 0, sl: 0 };
    this.tape = [];
    this.lastTapePrice = null;
    this.busy = false;
    this.build();
  }

  get g() { return this.game; }

  // ======================= kerangka =======================
  build() {
    const root = $('#ui');
    root.innerHTML = `
      <header id="topbar" class="panel">
        <div class="brand">📈 <b>BLOX</b> STOCK EXCHANGE <span class="tag3d">3D</span></div>
        <div class="clock"><span id="clock"></span><span id="session" class="pill"></span></div>
        <div class="speed" id="speed">
          <button data-speed="0" title="Pause (Spasi)">⏸</button><button data-speed="1">1x</button><button data-speed="2">2x</button><button data-speed="4">4x</button>
        </div>
        <div class="stat"><small>Cash</small><b id="cash"></b></div>
        <div class="stat"><small>Net Worth</small><b id="nw"></b></div>
        <div class="stat"><small>P&L Hari Ini</small><b id="dpnl"></b></div>
        <div class="level"><div class="lvl-row"><b id="lvl"></b><small id="xptext"></small></div><div class="bar"><i id="xpbar"></i></div></div>
        <div class="cam"><button id="camChart" title="Fokus ke chart (F)">🎯</button><button id="camReset" title="Reset kamera (R)">🏛️</button><button id="help" title="Cara main">❔</button></div>
      </header>

      <aside id="left" class="panel">
        <div class="tabs" id="watchTabs"></div>
        <div class="watch" id="watch"></div>
        <div class="hint">Klik baris, ubin heatmap, atau koin di Pulse Pit untuk memilih aset. Drag untuk memutar kamera.</div>
      </aside>

      <aside id="right" class="panel">
        <div id="tHead"></div>
        <canvas id="mini" width="600" height="230"></canvas>
        <div id="tExtra"></div>
        <div id="ticket">
          <div class="seg" id="sideSeg"><button data-side="long" class="long">▲ Long / Beli</button><button data-side="short" class="short">▼ Short / Jual</button></div>
          <div class="seg small" id="typeSeg"><button data-type="market">Market</button><button data-type="limit">Limit</button></div>
          <label id="limitRow">Harga limit <input id="limit" type="number" step="any" min="0"></label>
          <label>Modal (USD) <input id="amount" type="number" step="any" min="0"></label>
          <div class="quick" id="quick"><button data-pct="0.1">10%</button><button data-pct="0.25">25%</button><button data-pct="0.5">50%</button><button data-pct="1">MAX</button></div>
          <div class="levs"><small>Leverage</small><div id="levs"></div></div>
          <div class="row2">
            <label>Take Profit % <input id="tp" type="number" step="any" min="0" placeholder="opsional"></label>
            <label>Stop Loss % <input id="sl" type="number" step="any" min="0" placeholder="opsional"></label>
          </div>
          <div class="preview" id="preview"></div>
          <button id="submit" class="submit long">Kirim Order</button>
          <div id="lockMsg" class="lock hidden"></div>
        </div>
      </aside>

      <section id="bottom" class="panel">
        <div class="tabs" id="bottomTabs">${BOTTOM_TABS.map(([k, l]) => `<button data-tab="${k}">${l}<span class="badge" data-badge="${k}"></span></button>`).join('')}</div>
        <div id="tabBody"></div>
      </section>
      <div id="toasts"></div>
      <div id="modal" class="hidden"></div>`;

    $('#speed').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) this.g.setSpeed(+b.dataset.speed); });
    $('#camChart').onclick = () => this.g.world.focusChart();
    $('#camReset').onclick = () => this.g.world.resetView();
    $('#help').onclick = () => this.showHelp();

    $('#watchTabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { this.watchTab = b.dataset.key; this.renderWatch(true); } });
    $('#watch').addEventListener('click', (e) => { const r = e.target.closest('[data-sym]'); if (r) this.g.select(r.dataset.sym); });

    $('#sideSeg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { this.form.side = b.dataset.side; this.syncForm(); } });
    $('#typeSeg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { this.form.type = b.dataset.type; this.syncForm(); } });
    $('#levs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && !b.disabled) { this.form.lev = +b.dataset.lev; this.syncForm(); } });
    $('#quick').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const a = this.g.market.get(this.g.selected); if (!a) return;
      const fee = ASSET_CLASSES[a.cls].fee * this.form.lev;
      this.form.amount = Math.floor((this.g.portfolio.cash * +b.dataset.pct) / (1 + fee) * 100) / 100;
      $('#amount').value = this.form.amount;
      this.updateTicket();
    });
    for (const id of ['amount', 'limit', 'tp', 'sl']) {
      $('#' + id).addEventListener('input', (e) => { this.form[id] = parseFloat(e.target.value) || 0; this.updateTicket(); });
    }
    $('#amount').value = this.form.amount;
    $('#submit').onclick = () => this.submit();

    $('#bottomTabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) this.openTab(b.dataset.tab); });
    const bottom = $('#bottom');
    bottom.addEventListener('pointerdown', () => { this.busy = true; });
    window.addEventListener('pointerup', () => { setTimeout(() => { this.busy = false; }, 0); });
    bottom.addEventListener('click', (e) => this.onBottomClick(e));

    window.addEventListener('keydown', (e) => {
      if (e.target.matches('input, select, textarea')) return;
      if (e.code === 'Space') { e.preventDefault(); this.g.setSpeed(this.g.speed ? 0 : 1); }
      if (e.key === 'f' || e.key === 'F') this.g.world.focusChart();
      if (e.key === 'r' || e.key === 'R') this.g.world.resetView();
    });

    this.openTab('pos');
    this.renderWatch(true);
    this.onSelect();
  }

  // ======================= notifikasi =======================
  notify(msg, kind = 'info') {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = msg;
    $('#toasts').prepend(el);
    setTimeout(() => el.classList.add('out'), 3800);
    setTimeout(() => el.remove(), 4300);
    const all = $('#toasts').children;
    if (all.length > 5) all[all.length - 1].remove();
  }

  modal(html, buttons = [{ label: 'OK' }]) {
    const m = $('#modal');
    m.innerHTML = `<div class="card">${html}<div class="actions">${buttons.map((b, i) => `<button data-i="${i}" class="${b.cls || ''}">${b.label}</button>`).join('')}</div></div>`;
    m.classList.remove('hidden');
    m.onclick = (e) => {
      const b = e.target.closest('button[data-i]');
      if (!b) return;
      m.classList.add('hidden');
      buttons[+b.dataset.i].onClick?.();
    };
  }

  showHelp(first = false) {
    this.modal(`
      <h2>📈 Blox Stock Exchange 3D</h2>
      <p>Versi Three.js yang terinspirasi dari <b>Roblox Stock Exchange 2</b>. Mulai dengan modal kecil, trading saham, ETF, kripto, meme coin, futures dan forex, naik level untuk membuka fitur baru, lalu <b>rebirth</b> saat jadi jutawan.</p>
      <ul>
        <li><b>Long</b> = untung saat harga naik. <b>Short</b> (Lv 3) = untung saat harga turun.</li>
        <li><b>Leverage</b> melipatgandakan eksposur — dan risiko <b>likuidasi</b>. Cek harga likuidasi di preview sebelum kirim.</li>
        <li><b>Market</b> langsung terisi, <b>Limit</b> menunggu harga tertentu. Tambahkan <b>TP/SL</b> untuk keluar otomatis.</li>
        <li>Bursa saham buka <b>09:30–16:00</b> (ramai saat open & close, sepi siang). Kripto, Pulse, futures & forex jalan 24 jam. Di luar jam bursa harga saham bisa <b>gap</b> saat pembukaan (ikuti futures BX1!).</li>
        <li>Pantau <b>berita</b>, jadwal <b>earnings</b> & <b>IPO</b> di tab Kalender. Saham berdividen membayar tiap penutupan.</li>
        <li><b>Pulse</b> (Lv 2): meme coin super volatil. Perhatikan konsentrasi holder, aktivitas dev & likuiditas — risiko <b>rug pull</b>!</li>
        <li><b>Vault</b>: tabungan berbunga tiap hari. <b>Algo Desk</b> (Lv 10): bot trading otomatis yang bisa di-upgrade.</li>
        <li>Klaim hadiah di tab <b>Rewards</b> dan coba kode: <code>STOCKMARKET</code>, <code>MEMECOINS</code>, <code>FUTURES</code>, <code>RELEASE</code>, <code>UPDATE</code>, <code>BULLMARKET</code>.</li>
      </ul>
      <p class="muted">Kontrol: drag = putar kamera, scroll = zoom, Spasi = pause, F = fokus chart, R = reset kamera.</p>`,
      first
        ? [{ label: 'Ambil training bonus $2,500 & mulai! 🚀', cls: 'primary' }]
        : [
          { label: '🗑️ Reset progres', onClick: () => this.modal('<h2>Reset semua progres?</h2><p>Save akan dihapus permanen.</p>', [{ label: 'Batal' }, { label: 'Hapus & mulai ulang', cls: 'danger', onClick: () => this.g.resetSave() }]) },
          { label: 'Tutup', cls: 'primary' },
        ]);
  }

  // ======================= watchlist =======================
  renderWatch(rebuild = false) {
    const g = this.g;
    const tabs = WATCH_TABS.map((t) => {
      const locked = !g.prog.has(t.unlock);
      return `<button data-key="${t.key}" class="${t.key === this.watchTab ? 'active' : ''} ${locked ? 'locked' : ''}">${t.label}${locked ? ` 🔒${g.prog.unlockLevel(t.unlock)}` : ''}</button>`;
    }).join('');
    if (tabs !== this.lastWatchTabs) { $('#watchTabs').innerHTML = tabs; this.lastWatchTabs = tabs; }

    const tab = WATCH_TABS.find((t) => t.key === this.watchTab);
    const list = g.market.list.filter(tab.filter);
    const key = list.map((a) => a.sym).join(',') + '|' + this.watchTab;
    const wrap = $('#watch');
    if (rebuild || key !== this.watchKey) {
      this.watchKey = key;
      const locked = !g.prog.has(tab.unlock);
      wrap.innerHTML = (locked ? `<div class="lockbox">🔒 Terbuka di Level ${g.prog.unlockLevel(tab.unlock)} — kamu masih bisa melihat harga.</div>` : '') +
        list.map((a) => `
          <div class="wrow" data-sym="${a.sym}">
            <div class="wl"><b>${a.cls === 'meme' ? '$' : ''}${a.sym}</b><small>${esc(a.name)}</small></div>
            <div class="wr"><span class="wp"></span><span class="wc"></span></div>
          </div>`).join('');
    }
    for (const row of wrap.querySelectorAll('.wrow')) {
      const a = g.market.get(row.dataset.sym);
      if (!a) continue;
      const chg = a.price / a.dayRef - 1;
      row.classList.toggle('sel', a.sym === g.selected);
      row.classList.toggle('rug', !!a.rugged);
      row.querySelector('.wp').textContent = fmtPrice(a.price);
      const c = row.querySelector('.wc');
      c.textContent = a.rugged ? 'RUG' : fmtPct(chg);
      c.className = 'wc ' + cls(chg);
    }
  }

  // ======================= tiket order =======================
  onSelect() {
    const a = this.g.market.get(this.g.selected);
    if (!a) return;
    const tab = WATCH_TABS.find((t) => t.filter(a));
    if (tab && tab.key !== this.watchTab) { this.watchTab = tab.key; this.renderWatch(true); }
    this.form.limit = +fmtPrice(a.price);
    $('#limit').value = this.form.limit;
    this.tape = [];
    this.lastTapePrice = null;
    if (a.cls === 'meme') this.form.lev = 1;
    this.syncForm();
  }

  syncForm() {
    const f = this.form, g = this.g;
    const a = g.market.get(g.selected);
    if (f.side === 'short' && !g.prog.has('short')) f.side = 'long';
    if (f.lev > g.prog.maxLeverage() || (a?.cls === 'meme' && f.lev > 1)) f.lev = 1;
    for (const b of $('#sideSeg').children) {
      b.classList.toggle('active', b.dataset.side === f.side);
      if (b.dataset.side === 'short') { b.disabled = !g.prog.has('short'); b.title = b.disabled ? 'Terbuka di Level 3' : ''; }
    }
    for (const b of $('#typeSeg').children) b.classList.toggle('active', b.dataset.type === f.type);
    $('#limitRow').classList.toggle('hidden', f.type !== 'limit');
    $('#levs').innerHTML = LEVERAGE_TIERS.map((t) => {
      const locked = g.prog.level < t.level || (a?.cls === 'meme' && t.x > 1);
      return `<button data-lev="${t.x}" class="${t.x === f.lev ? 'active' : ''}" ${locked ? 'disabled' : ''} title="${locked ? `Level ${t.level}` : ''}">${t.x}x${g.prog.level < t.level ? '🔒' : ''}</button>`;
    }).join('');
    const sub = $('#submit');
    sub.className = `submit ${f.side}`;
    this.updateTicket();
  }

  updateTicket() {
    const g = this.g, f = this.form;
    const a = g.market.get(g.selected);
    if (!a) return;
    const chg = a.price / a.dayRef - 1;
    const c = ASSET_CLASSES[a.cls];
    $('#tHead').innerHTML = `
      <div class="th1"><b>${a.cls === 'meme' ? '$' : ''}${a.sym}</b><span class="pill ${c.session && !g.open ? 'closed' : 'open'}">${c.label} · ${a.rugged ? 'RUGGED' : c.session ? (g.open ? 'BUKA' : 'TUTUP') : '24 JAM'}</span></div>
      <div class="th2">${esc(a.name)}</div>
      <div class="th3"><span class="big ${cls(chg)}">${fmtPrice(a.price)}</span><span class="${cls(chg)}">${fmtPct(chg)}</span></div>
      <div class="th4"><span>H ${fmtPrice(a.dayHigh)}</span><span>L ${fmtPrice(a.dayLow)}</span><span>Vol ${Math.round(a.dayVolume * 1000).toLocaleString()}</span>${a.div ? `<span>Div ${(a.div * 100).toFixed(2)}%/hari</span>` : ''}</div>`;

    this.drawMini(a);
    this.renderExtra(a);

    const pv = g.portfolio.preview({ sym: a.sym, side: f.side, type: f.type, amount: f.amount, leverage: f.lev, limit: f.limit });
    const liqPct = pv.liq ? Math.abs(pv.liq / pv.fill - 1) : null;
    $('#preview').innerHTML = `
      <div><span>Eksposur</span><b>${fmtMoney(pv.notional)}</b></div>
      <div><span>Kuantitas</span><b>${fmtQty(pv.qty || 0)}</b></div>
      <div><span>Est. harga isi</span><b>${fmtPrice(pv.fill)}</b></div>
      <div><span>Fee</span><b>${fmtMoney(pv.fee)}</b></div>
      <div><span>Harga likuidasi</span><b class="${liqPct != null && liqPct < 0.05 ? 'down' : ''}">${pv.liq ? `${fmtPrice(pv.liq)} (${(liqPct * 100).toFixed(1)}%)` : '—'}</b></div>
      <div><span>Total dipotong</span><b>${fmtMoney(pv.cost)}</b></div>`;

    const err = g.portfolio.validate({ sym: a.sym, side: f.side, type: f.type, amount: f.amount, leverage: f.lev, limit: f.limit });
    const sub = $('#submit');
    sub.textContent = err ? err : `${f.type === 'limit' ? 'Pasang Limit' : 'Kirim'} ${f.side === 'long' ? 'LONG' : 'SHORT'} ${a.sym}${f.lev > 1 ? ` ${f.lev}x` : ''}`;
    sub.disabled = !!err;
    const lockKey = ASSET_CLASSES[a.cls].unlock;
    const lock = $('#lockMsg');
    if (!g.prog.has(lockKey)) { lock.textContent = `🔒 ${ASSET_CLASSES[a.cls].label} terbuka di Level ${g.prog.unlockLevel(lockKey)}`; lock.classList.remove('hidden'); }
    else lock.classList.add('hidden');
  }

  renderExtra(a) {
    // order book & tape sintetis + info meme coin
    if (this.lastTapePrice != null && a.price !== this.lastTapePrice) {
      this.tape.unshift({ p: a.price, up: a.price > this.lastTapePrice, q: Math.round(rand(1, 60) * (a.price < 1 ? 10000 : a.price < 50 ? 100 : 5)) });
      if (this.tape.length > 7) this.tape.pop();
    }
    this.lastTapePrice = a.price;
    const sp = Math.max(ASSET_CLASSES[a.cls].spread, 0.0002) * a.price;
    const rows = [];
    for (let i = 4; i >= 0; i--) rows.push(`<div class="ask"><span>${fmtPrice(a.price + sp / 2 + i * sp)}</span><i style="width:${rand(15, 100)}%"></i></div>`);
    for (let i = 0; i < 5; i++) rows.push(`<div class="bid"><span>${fmtPrice(a.price - sp / 2 - i * sp)}</span><i style="width:${rand(15, 100)}%"></i></div>`);
    let meme = '';
    if (a.meme) {
      const risk = this.g.market.rugRisk(a);
      meme = `<div class="meme">
        <div><span>Holders</span><b>${a.meme.holders.toLocaleString()}</b></div>
        <div><span>Top 10 pegang</span><b class="${a.meme.top10 > 60 ? 'down' : ''}">${a.meme.top10.toFixed(0)}%</b></div>
        <div><span>Aktivitas dev</span><b class="${a.meme.dev < 30 ? 'down' : 'up'}">${a.meme.dev.toFixed(0)}/100</b></div>
        <div><span>Likuiditas</span><b class="${a.meme.liq < 20000 ? 'down' : ''}">${fmtMoney(a.meme.liq)}</b></div>
        <div class="risk"><span>Risiko rug</span><div class="bar"><i style="width:${risk * 100}%;background:${risk > 0.6 ? '#ff1744' : risk > 0.35 ? '#ffb300' : '#00e676'}"></i></div></div>
      </div>`;
    }
    $('#tExtra').innerHTML = `${meme}<div class="flow"><div class="book">${rows.join('')}</div><div class="tape">${this.tape.map((t) => `<div class="${t.up ? 'up' : 'down'}">${fmtPrice(t.p)} <small>${t.q}</small></div>`).join('') || '<small class="muted">menunggu transaksi…</small>'}</div></div>`;
  }

  drawMini(a) {
    const cv = $('#mini'), ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    const cs = a.candles.slice(-55);
    if (a.cur) cs.push(a.cur);
    if (!cs.length) return;
    let lo = Math.min(...cs.map((c) => c.l)), hi = Math.max(...cs.map((c) => c.h));
    const pad = (hi - lo) * 0.1 || a.price * 0.01; lo -= pad; hi += pad;
    const y = (p) => H - 14 - ((p - lo) / (hi - lo)) * (H - 28);
    const dx = (W - 70) / 56;
    ctx.strokeStyle = 'rgba(140,160,210,0.15)'; ctx.lineWidth = 1;
    ctx.font = '18px monospace'; ctx.fillStyle = '#7f8fb5';
    for (let i = 0; i <= 3; i++) {
      const p = lo + ((hi - lo) * i) / 3;
      ctx.beginPath(); ctx.moveTo(0, y(p)); ctx.lineTo(W - 70, y(p)); ctx.stroke();
      ctx.fillText(fmtPrice(p), W - 66, y(p) + 5);
    }
    cs.forEach((c, i) => {
      const x = i * dx + dx / 2;
      ctx.strokeStyle = ctx.fillStyle = c.c >= c.o ? '#00e676' : '#ff4d5a';
      ctx.beginPath(); ctx.moveTo(x, y(c.h)); ctx.lineTo(x, y(c.l)); ctx.stroke();
      ctx.fillRect(x - dx * 0.33, Math.min(y(c.o), y(c.c)), dx * 0.66, Math.max(1.5, Math.abs(y(c.o) - y(c.c))));
    });
    const e = ema(a.candles.slice(-95).map((c) => c.c).concat(a.cur ? [a.cur.c] : []), 9).slice(-cs.length);
    ctx.strokeStyle = '#ffd54f'; ctx.lineWidth = 2; ctx.beginPath();
    e.forEach((v, i) => (i ? ctx.lineTo(i * dx + dx / 2, y(v)) : ctx.moveTo(dx / 2, y(v))));
    ctx.stroke();
    for (const p of this.g.portfolio.positions.filter((p) => p.sym === a.sym)) {
      for (const [lvl, col] of [[p.entry, '#ffd54f'], [p.tp, '#00e676'], [p.sl, '#ff9100'], [p.liq, '#ff1744']]) {
        if (lvl == null || lvl < lo || lvl > hi) continue;
        ctx.setLineDash([6, 5]); ctx.strokeStyle = col; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(0, y(lvl)); ctx.lineTo(W - 70, y(lvl)); ctx.stroke(); ctx.setLineDash([]);
      }
    }
  }

  submit() {
    const g = this.g, f = this.form;
    const res = g.portfolio.placeOrder({ sym: g.selected, side: f.side, type: f.type, amount: f.amount, leverage: f.lev, limit: f.limit, tpPct: f.tp, slPct: f.sl });
    this.notify(res.ok ? `✅ ${res.msg}` : `⚠️ ${res.msg}`, res.ok ? 'good' : 'bad');
    this.refresh(true);
  }

  // ======================= panel bawah =======================
  openTab(tab) {
    this.bottomTab = tab;
    for (const b of $('#bottomTabs').children) b.classList.toggle('active', b.dataset.tab === tab);
    const body = $('#tabBody');
    const g = this.g;
    if (tab === 'algo' && g.prog.has('algos')) {
      const assets = g.market.list.filter((a) => a.cls !== 'meme' && g.prog.canTrade(a.cls));
      body.innerHTML = `
        <div class="form-row">
          <select id="botStrat">${Object.entries(STRATEGIES).map(([k, s]) => `<option value="${k}">${s.label} — ${s.desc}</option>`).join('')}</select>
          <select id="botSym">${assets.map((a) => `<option ${a.sym === g.selected ? 'selected' : ''}>${a.sym}</option>`).join('')}</select>
          <input id="botAlloc" type="number" min="100" value="1000" placeholder="Alokasi $">
          <button data-act="bot-create" class="primary">+ Buat Bot</button>
        </div>
        <div class="dyn"></div>`;
    } else if (tab === 'vault') {
      body.innerHTML = `
        <div class="form-row"><input id="vaultAmt" type="number" min="0" placeholder="Jumlah $">
          <button data-act="vault-dep" class="primary">Setor</button><button data-act="vault-wd">Tarik</button>
          <button data-act="vault-depall">Setor semua</button><button data-act="vault-wdall">Tarik semua</button></div>
        <div class="dyn"></div>`;
    } else if (tab === 'rewards') {
      body.innerHTML = `
        <div class="form-row"><input id="code" type="text" placeholder="Masukkan kode (mis. STOCKMARKET)"><button data-act="redeem" class="primary">🎁 Redeem</button></div>
        <div class="dyn"></div>`;
    } else {
      body.innerHTML = `<div class="dyn"></div>`;
    }
    this.lastDyn = null;
    this.renderBottom(true);
  }

  renderBottom(force = false) {
    if (this.busy && !force) return;
    const dyn = $('#tabBody .dyn');
    if (!dyn) return;
    const html = this['tab_' + this.bottomTab]();
    if (html !== this.lastDyn) { dyn.innerHTML = html; this.lastDyn = html; }
  }

  tab_pos() {
    const g = this.g, pf = g.portfolio;
    if (!pf.positions.length) return `<div class="empty">Belum ada posisi terbuka. Pilih aset dan kirim order dari panel kanan →</div>`;
    return `<table><thead><tr><th>Aset</th><th>Arah</th><th>Qty</th><th>Entry</th><th>Harga</th><th>Modal</th><th>P&L</th><th>TP / SL</th><th>Likuidasi</th><th><button data-act="close-all" class="mini">Tutup semua</button></th></tr></thead><tbody>
      ${pf.positions.map((p) => {
        const a = g.market.get(p.sym);
        const price = a ? a.price : p.lastPrice;
        const val = pf.posValue(p);
        const pnl = val - p.margin;
        const near = p.liq && Math.abs(price / p.liq - 1) < 0.02;
        return `<tr class="${near ? 'danger' : ''}" data-sel="${p.sym}">
          <td><b>${p.sym}</b></td><td class="${p.dir > 0 ? 'up' : 'down'}">${p.side.toUpperCase()} ${p.lev}x</td>
          <td>${fmtQty(p.qty)}</td><td>${fmtPrice(p.entry)}</td><td>${fmtPrice(price)}</td><td>${fmtMoney(p.margin)}</td>
          <td class="${cls(pnl)}">${fmtMoney(pnl, { sign: true })} <small>(${fmtPct(pnl / p.margin)})</small></td>
          <td>${p.tp ? fmtPrice(p.tp) : '—'} / ${p.sl ? fmtPrice(p.sl) : '—'}</td>
          <td class="${near ? 'down' : ''}">${p.liq ? fmtPrice(p.liq) : '—'}</td>
          <td><button data-act="close" data-id="${p.id}" class="mini">Tutup</button></td></tr>`;
      }).join('')}</tbody></table>`;
  }

  tab_orders() {
    const g = this.g;
    if (!g.portfolio.orders.length) return `<div class="empty">Tidak ada order limit. Order limit tetap aktif saat bursa tutup dan terisi saat harga menyentuh level-mu.</div>`;
    return `<table><thead><tr><th>Aset</th><th>Arah</th><th>Limit</th><th>Harga kini</th><th>Modal</th><th>Leverage</th><th>Dipasang</th><th></th></tr></thead><tbody>
      ${g.portfolio.orders.map((o) => {
        const a = g.market.get(o.sym);
        return `<tr data-sel="${o.sym}"><td><b>${o.sym}</b></td><td class="${o.side === 'long' ? 'up' : 'down'}">${o.side.toUpperCase()}</td><td>${fmtPrice(o.limit)}</td><td>${a ? fmtPrice(a.price) : '—'}</td><td>${fmtMoney(o.amount)}</td><td>${o.leverage}x</td><td>${when(o.placedAt)}</td><td><button data-act="cancel" data-id="${o.id}" class="mini">Batal</button></td></tr>`;
      }).join('')}</tbody></table>`;
  }

  tab_hist() {
    const h = this.g.portfolio.history;
    if (!h.length) return `<div class="empty">Riwayat trade akan muncul di sini.</div>`;
    return `<table><thead><tr><th>Aset</th><th>Arah</th><th>Entry</th><th>Exit</th><th>Modal</th><th>Hasil bersih</th><th>Alasan</th><th>Buka → Tutup</th></tr></thead><tbody>
      ${h.slice(0, 40).map((r) => `<tr><td><b>${r.sym}</b></td><td class="${r.dir > 0 ? 'up' : 'down'}">${r.side.toUpperCase()} ${r.lev}x</td><td>${fmtPrice(r.entry)}</td><td>${fmtPrice(r.exit)}</td><td>${fmtMoney(r.margin)}</td>
        <td class="${cls(r.net)}">${fmtMoney(r.net, { sign: true })} <small>(${fmtPct(r.net / r.margin)})</small></td><td>${REASON[r.reason] || r.reason}</td><td><small>${when(r.openedAt)} → ${when(r.closedAt)}</small></td></tr>`).join('')}
      </tbody></table>`;
  }

  tab_news() {
    const n = this.g.market.news;
    return `<div class="news">${n.map((x) => `<div class="nitem ${x.impact > 0 ? 'up' : x.impact < 0 ? 'down' : ''}" ${x.sym ? `data-sel="${x.sym}"` : ''}>
      <span class="ntag">${x.tag}</span><small>${when(x.at)}</small> ${esc(x.text)}</div>`).join('') || '<div class="empty">Belum ada berita.</div>'}</div>`;
  }

  tab_cal() {
    const g = this.g, pr = g.prog, s = g.portfolio.stats;
    const day = g.clock.day;
    const cells = [];
    for (let d = Math.max(1, day - 20); d <= day; d++) {
      const v = d === day ? pr.todayPnl() : pr.calendar[d];
      const k = v == null ? 0 : clamp(Math.abs(v) / Math.max(500, g.netWorth() * 0.05), 0.15, 1);
      const bg = v == null ? 'transparent' : v >= 0 ? `rgba(0,230,118,${k})` : `rgba(255,77,90,${k})`;
      cells.push(`<div class="cday ${d === day ? 'today' : ''}" style="background:${bg}"><small>H${d}</small><b>${v == null ? '—' : fmtMoney(v, { sign: true })}</b></div>`);
    }
    const up = g.market.upcoming(day);
    const wr = s.closes ? (s.wins / s.closes) * 100 : 0;
    return `<div class="cal-wrap">
      <div><h4>Kalender P&L (21 hari)</h4><div class="cal">${cells.join('')}</div></div>
      <div><h4>Agenda pasar</h4>${up.map((e) => `<div class="ev"><b>H${e.day}</b> ${e.type === 'IPO' ? '🔔 IPO' : '📊 Earnings'} <span data-sel="${e.sym}" class="link">${e.sym}</span>${e.day === day ? ' <small>(hari ini)</small>' : ''}</div>`).join('') || '<small class="muted">Tidak ada agenda</small>'}</div>
      <div><h4>Statistik</h4>
        <div class="kv"><span>Trade dibuka</span><b>${s.opens}</b></div>
        <div class="kv"><span>Win rate</span><b>${wr.toFixed(0)}% (${s.wins}/${s.closes})</b></div>
        <div class="kv"><span>Realized P&L</span><b class="${cls(s.realized)}">${fmtMoney(s.realized, { sign: true })}</b></div>
        <div class="kv"><span>Trade terbaik</span><b class="up">${fmtMoney(s.best, { sign: true })}</b></div>
        <div class="kv"><span>Dividen</span><b>${fmtMoney(s.dividends)}</b></div>
        <div class="kv"><span>Volume</span><b>${fmtMoney(s.volume)}</b></div>
        <div class="kv"><span>Likuidasi</span><b>${s.liqs}</b></div>
        <div class="kv"><span>Regime</span><b>${g.market.regime.type.toUpperCase()}</b></div>
      </div></div>`;
  }

  tab_algo() {
    const g = this.g, d = g.bots;
    if (!g.prog.has('algos')) return `<div class="empty">🤖 Algo Desk terbuka di <b>Level 10</b>. Bot trading memakai cash sungguhan dan tetap berjalan (kasar) saat kamu offline.</div>`;
    const up = (k, label, desc) => {
      const c = d.upgradeCost(k);
      return `<div class="upg"><b>${label} Lv ${d.up[k]}</b><small>${desc}</small><button data-act="bot-up" data-kind="${k}" class="mini" ${c == null ? 'disabled' : ''}>${c == null ? 'MAX' : 'Upgrade ' + fmtMoney(c)}</button></div>`;
    };
    return `<div class="upgs">
        ${up('speed', '⚡ Kecepatan', 'Keputusan lebih sering')}
        ${up('expertise', '🧠 Keahlian', 'Fee lebih murah · Lv3 filter tren · Lv4 trailing stop')}
        ${up('slots', '🗄️ Slot', `${d.bots.length}/${d.slotCount()} bot aktif`)}
      </div>
      <div class="bots">${d.bots.map((b) => {
        const v = d.value(b), pnl = v - b.alloc;
        return `<div class="bot"><div><b>${STRATEGIES[b.strategy].label}</b> · ${b.sym} <span class="pill">${b.pos > 0 ? 'LONG' : b.pos < 0 ? 'SHORT' : 'FLAT'}</span></div>
          <div class="kv"><span>Nilai</span><b>${fmtMoney(v)}</b></div>
          <div class="kv"><span>P&L</span><b class="${cls(pnl)}">${fmtMoney(pnl, { sign: true })} (${fmtPct(pnl / b.alloc)})</b></div>
          <div class="kv"><span>Trade</span><b>${b.trades} · win ${b.trades ? Math.round((b.wins / b.trades) * 100) : 0}%</b></div>
          <div class="log">${b.log.map((l) => `<div>${esc(l)}</div>`).join('')}</div>
          <button data-act="bot-stop" data-id="${b.id}" class="mini">Stop & tarik dana</button></div>`;
      }).join('') || '<div class="empty">Belum ada bot. Pilih strategi, aset & alokasi di atas.</div>'}</div>`;
  }

  tab_vault() {
    const p = this.g.prog;
    return `<div class="vault"><div class="big">🏦 ${fmtMoney(p.vault, { compact: false })}</div>
      <div class="kv"><span>Bunga per hari bursa</span><b class="up">${(p.vaultRate() * 100).toFixed(2)}%</b></div>
      <div class="kv"><span>Estimasi bunga besok</span><b>${fmtMoney(p.vault * p.vaultRate())}</b></div>
      <p class="muted">Uang di vault aman dari likuidasi dan dibayar bunga tiap bel penutupan (juga saat offline, maks 10 hari). Vault Pro di Level 8 menggandakan bunga.</p></div>`;
  }

  tab_rewards() {
    const g = this.g, p = g.prog;
    const goals = GOALS.map((x) => {
      const st = p.goalState(x);
      return `<div class="goal ${st}"><div><b>${x.label}</b><small>${x.desc}</small></div><span>${fmtMoney(x.reward * (1 + p.rebirths))}</span>
        ${st === 'ready' ? `<button data-act="claim" data-id="${x.id}" class="mini primary">Klaim</button>` : st === 'claimed' ? '<span class="muted">✔</span>' : '<span class="muted">…</span>'}</div>`;
    }).join('');
    const unlocks = UNLOCKS.map((u) => `<div class="unl ${p.level >= u.level ? 'ok' : ''}"><b>Lv ${u.level}</b> ${u.label}</div>`).join('');
    const req = p.rebirthReq();
    const nw = g.netWorth();
    return `<div class="rew">
      <div><h4>Goals</h4>${goals}</div>
      <div><h4>Roadmap level</h4>${unlocks}</div>
      <div><h4>♻️ Rebirth (${p.rebirths})</h4>
        <p class="muted">Reset cash, posisi, bot, vault & level. Imbalan permanen: XP ×${(1 + 0.5 * (p.rebirths + 1)).toFixed(1)}, modal awal & reward goal ×${p.rebirths + 2}, bunga vault +${25 * (p.rebirths + 1)}%.</p>
        <div class="bar"><i style="width:${clamp(nw / req, 0, 1) * 100}%"></i></div>
        <div class="kv"><span>Syarat net worth</span><b>${fmtMoney(nw)} / ${fmtMoney(req)}</b></div>
        <button data-act="rebirth" class="primary" ${p.canRebirth() ? '' : 'disabled'}>Rebirth sekarang</button>
      </div></div>`;
  }

  tab_lead() {
    const rows = this.g.prog.leaderboard();
    return `<table class="lead"><thead><tr><th>#</th><th>Trader</th><th>Net worth</th></tr></thead><tbody>
      ${rows.map((r, i) => `<tr class="${r.me ? 'me' : ''}"><td>${i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</td><td>${esc(r.name)}${r.me && r.rebirths ? ` ♻️${r.rebirths}` : ''}</td><td>${fmtMoney(r.nw)}</td></tr>`).join('')}</tbody></table>`;
  }

  onBottomClick(e) {
    const g = this.g;
    const sel = e.target.closest('[data-sel]');
    const btn = e.target.closest('button[data-act]');
    if (!btn) { if (sel) g.select(sel.dataset.sel); return; }
    const id = btn.dataset.id;
    const amt = () => parseFloat($('#vaultAmt')?.value) || 0;
    let res;
    switch (btn.dataset.act) {
      case 'close': res = g.portfolio.closePosition(id); break;
      case 'close-all':
        for (const p of [...g.portfolio.positions]) { const r = g.portfolio.closePosition(p.id); if (!r.ok) res = r; }
        break;
      case 'cancel': g.portfolio.cancelOrder(id); this.notify('Order dibatalkan'); break;
      case 'claim': g.prog.claim(id); break;
      case 'redeem': {
        res = g.prog.redeem($('#code').value);
        if (res.ok) { $('#code').value = ''; res = null; }
        break;
      }
      case 'vault-dep': g.prog.deposit(amt()); break;
      case 'vault-wd': g.prog.withdraw(amt()); break;
      case 'vault-depall': g.prog.deposit(g.portfolio.cash); break;
      case 'vault-wdall': g.prog.withdraw(g.prog.vault); break;
      case 'bot-create':
        res = g.bots.create({ strategy: $('#botStrat').value, sym: $('#botSym').value, alloc: parseFloat($('#botAlloc').value) });
        if (res.ok) { this.notify('🤖 Bot dibuat & mulai trading', 'good'); res = null; }
        break;
      case 'bot-stop': g.bots.remove(id); this.notify('Bot dihentikan, dana kembali ke cash'); break;
      case 'bot-up': res = g.bots.upgrade(btn.dataset.kind); if (res.ok) { this.notify('⬆️ Upgrade berhasil', 'good'); res = null; } break;
      case 'rebirth':
        this.modal(`<h2>♻️ Rebirth?</h2><p>Semua posisi, order, bot, cash & vault akan di-reset dan level kembali ke 1. Kamu mendapat bonus permanen. Lanjutkan?</p>`,
          [{ label: 'Batal' }, { label: 'Rebirth!', cls: 'primary', onClick: () => g.rebirth() }]);
        break;
    }
    if (res && !res.ok) this.notify('⚠️ ' + res.msg, 'bad');
    this.busy = false;
    this.refresh(true);
  }

  // ======================= refresh per tick =======================
  refresh(force = false) {
    const g = this.g;
    $('#clock').textContent = `Hari ${g.clock.day} · ${fmtClock(g.clock.minute)}`;
    const ses = $('#session');
    ses.textContent = g.open ? '● BURSA BUKA' : '○ BURSA TUTUP';
    ses.className = 'pill ' + (g.open ? 'open' : 'closed');
    for (const b of $('#speed').children) b.classList.toggle('active', +b.dataset.speed === g.speed);
    $('#cash').textContent = fmtMoney(g.portfolio.cash);
    $('#nw').textContent = fmtMoney(g.netWorth());
    const dp = g.prog.todayPnl();
    const dpe = $('#dpnl');
    dpe.textContent = fmtMoney(dp, { sign: true });
    dpe.className = cls(dp);
    $('#lvl').textContent = `Lv ${g.prog.level}${g.prog.rebirths ? ` ♻️${g.prog.rebirths}` : ''}`;
    $('#xptext').textContent = `${Math.floor(g.prog.xp)} / ${g.prog.xpNeeded()} XP`;
    $('#xpbar').style.width = `${(g.prog.xp / g.prog.xpNeeded()) * 100}%`;

    this.renderWatch();
    this.updateTicket();
    this.renderBottom(force);

    const badges = { pos: g.portfolio.positions.length, orders: g.portfolio.orders.length, rewards: g.prog.readyGoals(), algo: g.bots.bots.length };
    for (const el of document.querySelectorAll('[data-badge]')) {
      const v = badges[el.dataset.badge];
      el.textContent = v ? v : '';
      el.classList.toggle('hot', el.dataset.badge === 'rewards' && v > 0);
    }
  }
}
