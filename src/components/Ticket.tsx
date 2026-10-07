import { useEffect, useRef, useState } from 'react';
import { useGame } from '../state/useGame';
import { useUI } from '../state/store';
import { ASSET_CLASSES, LEVERAGE_TIERS } from '../engine/config';
import { ema, fmtMoney, fmtPct, fmtPrice, fmtQty, rand } from '../engine/util';
import type { Asset, OrderType, Position, Side } from '../engine/types';
import { upDown } from '../ui';
import { WATCH_TABS } from './Watchlist';

interface Print {
  p: number;
  up: boolean;
  q: number;
}

/** Synthetic "tape": records a print whenever the selected price changes. */
function useTape(a: Asset, version: number) {
  const ref = useRef<{ sym: string; version: number; last: number | null; prints: Print[] }>({ sym: '', version: -1, last: null, prints: [] });
  const t = ref.current;
  if (t.sym !== a.sym) Object.assign(t, { sym: a.sym, version: -1, last: null, prints: [] });
  if (t.version !== version) {
    t.version = version;
    if (t.last != null && a.price !== t.last) {
      t.prints = [{ p: a.price, up: a.price > t.last, q: Math.round(rand(1, 60) * (a.price < 1 ? 10000 : a.price < 50 ? 100 : 5)) }, ...t.prints].slice(0, 7);
    }
    t.last = a.price;
  }
  return t.prints;
}

function MiniChart({ a, positions, version }: { a: Asset; positions: Position[]; version: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d')!;
    const W = cv.width;
    const H = cv.height;
    ctx.clearRect(0, 0, W, H);
    const cs = a.candles.slice(-55);
    if (a.cur) cs.push(a.cur);
    if (!cs.length) return;
    let lo = Math.min(...cs.map((c) => c.l));
    let hi = Math.max(...cs.map((c) => c.h));
    const pad = (hi - lo) * 0.1 || a.price * 0.01;
    lo -= pad;
    hi += pad;
    const y = (p: number) => H - 14 - ((p - lo) / (hi - lo)) * (H - 28);
    const dx = (W - 70) / 56;
    ctx.strokeStyle = 'rgba(140,160,210,0.15)';
    ctx.lineWidth = 1;
    ctx.font = '18px monospace';
    ctx.fillStyle = '#7f8fb5';
    for (let i = 0; i <= 3; i++) {
      const p = lo + ((hi - lo) * i) / 3;
      ctx.beginPath();
      ctx.moveTo(0, y(p));
      ctx.lineTo(W - 70, y(p));
      ctx.stroke();
      ctx.fillText(fmtPrice(p), W - 66, y(p) + 5);
    }
    cs.forEach((c, i) => {
      const x = i * dx + dx / 2;
      ctx.strokeStyle = ctx.fillStyle = c.c >= c.o ? '#00e676' : '#ff4d5a';
      ctx.beginPath();
      ctx.moveTo(x, y(c.h));
      ctx.lineTo(x, y(c.l));
      ctx.stroke();
      ctx.fillRect(x - dx * 0.33, Math.min(y(c.o), y(c.c)), dx * 0.66, Math.max(1.5, Math.abs(y(c.o) - y(c.c))));
    });
    const e = ema(a.candles.slice(-95).map((c) => c.c).concat(a.cur ? [a.cur.c] : []), 9).slice(-cs.length);
    ctx.strokeStyle = '#ffd54f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    e.forEach((v, i) => (i ? ctx.lineTo(i * dx + dx / 2, y(v)) : ctx.moveTo(dx / 2, y(v))));
    ctx.stroke();
    for (const p of positions) {
      for (const [lvl, col] of [[p.entry, '#ffd54f'], [p.tp, '#00e676'], [p.sl, '#ff9100'], [p.liq, '#ff1744']] as const) {
        if (lvl == null || lvl < lo || lvl > hi) continue;
        ctx.setLineDash([6, 5]);
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, y(lvl));
        ctx.lineTo(W - 70, y(lvl));
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }, [a, positions, version]);
  return <canvas id="mini" ref={ref} width={600} height={230} />;
}

function MemeInfo({ a, risk }: { a: Asset; risk: number }) {
  const m = a.meme!;
  return (
    <div className="meme">
      <div><span>Holders</span><b>{m.holders.toLocaleString()}</b></div>
      <div><span>Top 10 hold</span><b className={m.top10 > 60 ? 'down' : ''}>{m.top10.toFixed(0)}%</b></div>
      <div><span>Dev activity</span><b className={m.dev < 30 ? 'down' : 'up'}>{m.dev.toFixed(0)}/100</b></div>
      <div><span>Liquidity</span><b className={m.liq < 20000 ? 'down' : ''}>{fmtMoney(m.liq)}</b></div>
      <div className="risk">
        <span>Rug risk</span>
        <div className="bar">
          <i style={{ width: `${risk * 100}%`, background: risk > 0.6 ? '#ff1744' : risk > 0.35 ? '#ffb300' : '#00e676' }} />
        </div>
      </div>
    </div>
  );
}

function OrderFlow({ a, prints }: { a: Asset; prints: Print[] }) {
  const sp = Math.max(ASSET_CLASSES[a.cls].spread, 0.0002) * a.price;
  const asks = [4, 3, 2, 1, 0].map((i) => a.price + sp / 2 + i * sp);
  const bids = [0, 1, 2, 3, 4].map((i) => a.price - sp / 2 - i * sp);
  return (
    <div className="flow">
      <div className="book">
        {asks.map((p, i) => (
          <div key={'a' + i} className="ask"><span>{fmtPrice(p)}</span><i style={{ width: `${rand(15, 100)}%` }} /></div>
        ))}
        {bids.map((p, i) => (
          <div key={'b' + i} className="bid"><span>{fmtPrice(p)}</span><i style={{ width: `${rand(15, 100)}%` }} /></div>
        ))}
      </div>
      <div className="tape">
        {prints.length ? (
          prints.map((t, i) => (
            <div key={i} className={t.up ? 'up' : 'down'}>
              {fmtPrice(t.p)} <small>{t.q}</small>
            </div>
          ))
        ) : (
          <small className="muted">waiting for trades…</small>
        )}
      </div>
    </div>
  );
}

export function Ticket() {
  const g = useGame();
  const { pushToast, setWatchTab } = useUI();
  const a = g.market.get(g.selected);

  const [side, setSide] = useState<Side>('long');
  const [type, setType] = useState<OrderType>('market');
  const [lev, setLev] = useState(1);
  const [amount, setAmount] = useState('500');
  const [limit, setLimit] = useState('');
  const [tp, setTp] = useState('');
  const [sl, setSl] = useState('');

  // New asset selected: reset the limit price and jump the watchlist to its tab.
  useEffect(() => {
    const cur = g.market.get(g.selected);
    if (!cur) return;
    setLimit(fmtPrice(cur.price));
    const tab = WATCH_TABS.find((t) => t.filter(cur));
    if (tab) setWatchTab(tab.key);
  }, [g, g.selected, setWatchTab]);

  const prints = useTape(a ?? ({ sym: '', price: 0 } as Asset), g.version);
  if (!a) return <aside id="right" className="panel" />;

  const canShort = g.prog.has('short');
  const effSide: Side = side === 'short' && !canShort ? 'long' : side;
  const maxLev = a.cls === 'meme' ? 1 : g.prog.maxLeverage();
  const effLev = lev > maxLev ? 1 : lev;
  const req = {
    sym: a.sym, side: effSide, type, leverage: effLev,
    amount: parseFloat(amount) || 0, limit: parseFloat(limit) || 0, tpPct: parseFloat(tp) || 0, slPct: parseFloat(sl) || 0,
  };
  const pv = g.portfolio.preview(req)!;
  const err = g.portfolio.validate(req);
  const liqPct = pv.liq ? Math.abs(pv.liq / pv.fill - 1) : null;

  const chg = a.price / a.dayRef - 1;
  const c = ASSET_CLASSES[a.cls];
  const positions = g.portfolio.positions.filter((p) => p.sym === a.sym);
  const lockKey = c.unlock;

  const quick = (pct: number) => {
    const fee = c.fee * effLev;
    setAmount(String(Math.floor(((g.portfolio.cash * pct) / (1 + fee)) * 100) / 100));
  };

  const submit = () => {
    const res = g.act(() => g.portfolio.placeOrder(req));
    pushToast(res.ok ? `✅ ${res.msg}` : `⚠️ ${res.msg}`, res.ok ? 'good' : 'bad');
  };

  return (
    <aside id="right" className="panel">
      <div>
        <div className="th1">
          <b>{a.cls === 'meme' ? '$' : ''}{a.sym}</b>
          <span className={`pill ${c.session && !g.open ? 'closed' : 'open'}`}>
            {c.label} · {a.rugged ? 'RUGGED' : c.session ? (g.open ? 'OPEN' : 'CLOSED') : '24/7'}
          </span>
        </div>
        <div className="th2">{a.name}</div>
        <div className="th3">
          <span className={`big ${upDown(chg)}`}>{fmtPrice(a.price)}</span>
          <span className={upDown(chg)}>{fmtPct(chg)}</span>
        </div>
        <div className="th4">
          <span>H {fmtPrice(a.dayHigh)}</span>
          <span>L {fmtPrice(a.dayLow)}</span>
          <span>Vol {Math.round(a.dayVolume * 1000).toLocaleString()}</span>
          {a.div > 0 && <span>Div {(a.div * 100).toFixed(2)}%/day</span>}
        </div>
      </div>

      <MiniChart a={a} positions={positions} version={g.version} />
      <div>
        {a.meme && <MemeInfo a={a} risk={g.market.rugRisk(a)} />}
        <OrderFlow a={a} prints={prints} />
      </div>

      <div id="ticket">
        <div className="seg">
          <button className={`long ${effSide === 'long' ? 'active' : ''}`} onClick={() => setSide('long')}>▲ Long / Buy</button>
          <button className={`short ${effSide === 'short' ? 'active' : ''}`} disabled={!canShort} title={canShort ? '' : 'Unlocks at Level 3'} onClick={() => setSide('short')}>
            ▼ Short / Sell
          </button>
        </div>
        <div className="seg small">
          <button className={type === 'market' ? 'active' : ''} onClick={() => setType('market')}>Market</button>
          <button className={type === 'limit' ? 'active' : ''} onClick={() => setType('limit')}>Limit</button>
        </div>
        {type === 'limit' && (
          <label>
            Limit price <input type="number" step="any" min="0" value={limit} onChange={(e) => setLimit(e.target.value)} />
          </label>
        )}
        <label>
          Amount (USD) <input type="number" step="any" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <div className="quick">
          {[0.1, 0.25, 0.5, 1].map((p) => (
            <button key={p} onClick={() => quick(p)}>{p === 1 ? 'MAX' : `${p * 100}%`}</button>
          ))}
        </div>
        <div className="levs">
          <small>Leverage</small>
          <div id="levs">
            {LEVERAGE_TIERS.map((t) => {
              const lvlLocked = g.prog.level < t.level;
              return (
                <button key={t.x} className={t.x === effLev ? 'active' : ''} disabled={lvlLocked || t.x > maxLev} title={lvlLocked ? `Level ${t.level}` : ''} onClick={() => setLev(t.x)}>
                  {t.x}x{lvlLocked ? '🔒' : ''}
                </button>
              );
            })}
          </div>
        </div>
        <div className="row2">
          <label>
            Take Profit % <input type="number" step="any" min="0" placeholder="optional" value={tp} onChange={(e) => setTp(e.target.value)} />
          </label>
          <label>
            Stop Loss % <input type="number" step="any" min="0" placeholder="optional" value={sl} onChange={(e) => setSl(e.target.value)} />
          </label>
        </div>
        <div className="preview">
          <div><span>Exposure</span><b>{fmtMoney(pv.notional)}</b></div>
          <div><span>Quantity</span><b>{fmtQty(pv.qty || 0)}</b></div>
          <div><span>Est. fill price</span><b>{fmtPrice(pv.fill)}</b></div>
          <div><span>Fee</span><b>{fmtMoney(pv.fee)}</b></div>
          <div>
            <span>Liquidation price</span>
            <b className={liqPct != null && liqPct < 0.05 ? 'down' : ''}>{pv.liq ? `${fmtPrice(pv.liq)} (${(liqPct! * 100).toFixed(1)}%)` : '—'}</b>
          </div>
          <div><span>Total cost</span><b>{fmtMoney(pv.cost)}</b></div>
        </div>
        <button className={`submit ${effSide}`} disabled={!!err} onClick={submit}>
          {err ?? `${type === 'limit' ? 'Place Limit' : 'Send'} ${effSide === 'long' ? 'LONG' : 'SHORT'} ${a.sym}${effLev > 1 ? ` ${effLev}x` : ''}`}
        </button>
        {!g.prog.has(lockKey) && (
          <div className="lock">🔒 {c.label} unlocks at Level {g.prog.unlockLevel(lockKey)}</div>
        )}
      </div>
    </aside>
  );
}
