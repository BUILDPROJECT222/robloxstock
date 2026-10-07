import { useState } from 'react';
import { useGame } from '../state/useGame';
import { useUI, type BottomTab } from '../state/store';
import { UNLOCKS } from '../engine/config';
import { STRATEGIES, type Strategy, type UpgradeKind } from '../engine/bots';
import { GOALS } from '../engine/progression';
import { clamp, fmtMoney, fmtPct, fmtPrice, fmtQty } from '../engine/util';
import type { CloseReason, Result } from '../engine/types';
import { upDown, when } from '../ui';

const TABS: [BottomTab, string][] = [
  ['pos', 'Positions'], ['orders', 'Orders'], ['hist', 'History'], ['news', 'News'], ['cal', 'P&L Calendar'],
  ['algo', 'Algo Desk'], ['vault', 'Vault'], ['rewards', 'Rewards'], ['lead', 'Leaderboard'],
];

const REASON: Record<CloseReason | 'stop', string> = {
  manual: 'Manual', tp: 'Take Profit', sl: 'Stop Loss', liq: '💥 Liquidated', rug: '💀 Rug pull', delist: 'Delisting', stop: 'Bot stop',
};

/** Shows an error toast when an engine call fails. */
function useResult() {
  const pushToast = useUI((s) => s.pushToast);
  return (res: Result | void, okMsg?: string) => {
    if (res && !res.ok) pushToast('⚠️ ' + res.msg, 'bad');
    else if (okMsg) pushToast(okMsg, 'good');
  };
}

function Positions() {
  const g = useGame();
  const report = useResult();
  const pf = g.portfolio;
  if (!pf.positions.length) return <div className="empty">No open positions yet. Pick an asset and send an order from the right panel →</div>;
  const closeAll = () => {
    for (const p of [...pf.positions]) report(g.act(() => pf.closePosition(p.id)));
  };
  return (
    <table>
      <thead>
        <tr>
          <th>Asset</th><th>Side</th><th>Qty</th><th>Entry</th><th>Price</th><th>Margin</th><th>P&amp;L</th><th>TP / SL</th><th>Liquidation</th>
          <th><button className="mini" onClick={closeAll}>Close all</button></th>
        </tr>
      </thead>
      <tbody>
        {pf.positions.map((p) => {
          const a = g.market.get(p.sym);
          const price = a ? a.price : p.lastPrice;
          const pnl = pf.posValue(p) - p.margin;
          const near = p.liq != null && Math.abs(price / p.liq - 1) < 0.02;
          return (
            <tr key={p.id} className={near ? 'danger' : ''} onClick={() => g.select(p.sym)}>
              <td><b>{p.sym}</b></td>
              <td className={p.dir > 0 ? 'up' : 'down'}>{p.side.toUpperCase()} {p.lev}x</td>
              <td>{fmtQty(p.qty)}</td>
              <td>{fmtPrice(p.entry)}</td>
              <td>{fmtPrice(price)}</td>
              <td>{fmtMoney(p.margin)}</td>
              <td className={upDown(pnl)}>{fmtMoney(pnl, { sign: true })} <small>({fmtPct(pnl / p.margin)})</small></td>
              <td>{p.tp ? fmtPrice(p.tp) : '—'} / {p.sl ? fmtPrice(p.sl) : '—'}</td>
              <td className={near ? 'down' : ''}>{p.liq ? fmtPrice(p.liq) : '—'}</td>
              <td>
                <button className="mini" onClick={(e) => { e.stopPropagation(); report(g.act(() => pf.closePosition(p.id))); }}>Close</button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Orders() {
  const g = useGame();
  const { pushToast } = useUI();
  const orders = g.portfolio.orders;
  if (!orders.length) return <div className="empty">No limit orders. Limit orders stay active while the market is closed and fill when the price reaches your level.</div>;
  return (
    <table>
      <thead>
        <tr><th>Asset</th><th>Side</th><th>Limit</th><th>Current</th><th>Margin</th><th>Leverage</th><th>Placed</th><th /></tr>
      </thead>
      <tbody>
        {orders.map((o) => {
          const a = g.market.get(o.sym);
          return (
            <tr key={o.id} onClick={() => g.select(o.sym)}>
              <td><b>{o.sym}</b></td>
              <td className={o.side === 'long' ? 'up' : 'down'}>{o.side.toUpperCase()}</td>
              <td>{fmtPrice(o.limit)}</td>
              <td>{a ? fmtPrice(a.price) : '—'}</td>
              <td>{fmtMoney(o.amount)}</td>
              <td>{o.leverage}x</td>
              <td>{when(o.placedAt)}</td>
              <td>
                <button className="mini" onClick={(e) => { e.stopPropagation(); g.act(() => g.portfolio.cancelOrder(o.id)); pushToast('Order cancelled'); }}>Cancel</button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function History() {
  const g = useGame();
  const h = g.portfolio.history;
  if (!h.length) return <div className="empty">Your trade history will show up here.</div>;
  return (
    <table>
      <thead>
        <tr><th>Asset</th><th>Side</th><th>Entry</th><th>Exit</th><th>Margin</th><th>Net result</th><th>Reason</th><th>Open → Close</th></tr>
      </thead>
      <tbody>
        {h.slice(0, 40).map((r) => (
          <tr key={r.id}>
            <td><b>{r.sym}</b></td>
            <td className={r.dir > 0 ? 'up' : 'down'}>{r.side.toUpperCase()} {r.lev}x</td>
            <td>{fmtPrice(r.entry)}</td>
            <td>{fmtPrice(r.exit)}</td>
            <td>{fmtMoney(r.margin)}</td>
            <td className={upDown(r.net)}>{fmtMoney(r.net, { sign: true })} <small>({fmtPct(r.net / r.margin)})</small></td>
            <td>{REASON[r.reason] ?? r.reason}</td>
            <td><small>{when(r.openedAt)} → {when(r.closedAt)}</small></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function News() {
  const g = useGame();
  const n = g.market.news;
  if (!n.length) return <div className="empty">No news yet.</div>;
  return (
    <div className="news">
      {n.map((x) => (
        <div
          key={x.id}
          className={`nitem ${x.impact > 0 ? 'up' : x.impact < 0 ? 'down' : ''} ${x.sym ? 'clickable' : ''}`}
          onClick={() => x.sym && g.select(x.sym)}
        >
          <span className="ntag">{x.tag}</span>
          <small>{when(x.at)}</small> {x.text}
        </div>
      ))}
    </div>
  );
}

function Calendar() {
  const g = useGame();
  const pr = g.prog;
  const s = g.portfolio.stats;
  const day = g.clock.day;
  const cells = [];
  for (let d = Math.max(1, day - 20); d <= day; d++) {
    const v = d === day ? pr.todayPnl() : pr.calendar[d];
    const k = v == null ? 0 : clamp(Math.abs(v) / Math.max(500, g.netWorth() * 0.05), 0.15, 1);
    const bg = v == null ? 'transparent' : v >= 0 ? `rgba(0,230,118,${k})` : `rgba(255,77,90,${k})`;
    cells.push(
      <div key={d} className={`cday ${d === day ? 'today' : ''}`} style={{ background: bg }}>
        <small>D{d}</small>
        <b>{v == null ? '—' : fmtMoney(v, { sign: true })}</b>
      </div>,
    );
  }
  const events = g.market.upcoming(day);
  const wr = s.closes ? (s.wins / s.closes) * 100 : 0;
  return (
    <div className="cal-wrap">
      <div>
        <h4>P&amp;L Calendar (21 days)</h4>
        <div className="cal">{cells}</div>
      </div>
      <div>
        <h4>Market calendar</h4>
        {events.length ? (
          events.map((e) => (
            <div key={e.type + e.sym + e.day} className="ev">
              <b>D{e.day}</b> {e.type === 'IPO' ? '🔔 IPO' : '📊 Earnings'}{' '}
              <span className="link" onClick={() => g.select(e.sym)}>{e.sym}</span>
              {e.day === day && <small> (today)</small>}
            </div>
          ))
        ) : (
          <small className="muted">No upcoming events</small>
        )}
      </div>
      <div>
        <h4>Stats</h4>
        <div className="kv"><span>Trades opened</span><b>{s.opens}</b></div>
        <div className="kv"><span>Win rate</span><b>{wr.toFixed(0)}% ({s.wins}/{s.closes})</b></div>
        <div className="kv"><span>Realized P&amp;L</span><b className={upDown(s.realized)}>{fmtMoney(s.realized, { sign: true })}</b></div>
        <div className="kv"><span>Best trade</span><b className="up">{fmtMoney(s.best, { sign: true })}</b></div>
        <div className="kv"><span>Dividends</span><b>{fmtMoney(s.dividends)}</b></div>
        <div className="kv"><span>Volume</span><b>{fmtMoney(s.volume)}</b></div>
        <div className="kv"><span>Liquidations</span><b>{s.liqs}</b></div>
        <div className="kv"><span>Regime</span><b>{g.market.regime.type.toUpperCase()}</b></div>
      </div>
    </div>
  );
}

function Algo() {
  const g = useGame();
  const report = useResult();
  const d = g.bots;
  const assets = g.market.list.filter((a) => a.cls !== 'meme' && g.prog.canTrade(a.cls));
  const [strategy, setStrategy] = useState<Strategy>('momentum');
  const [sym, setSym] = useState(g.selected);
  const [alloc, setAlloc] = useState('1000');

  if (!g.prog.has('algos')) {
    return <div className="empty">🤖 Algo Desk unlocks at <b>Level 10</b>. Trading bots use your real cash and keep running (roughly) while you're offline.</div>;
  }
  const botSym = assets.some((a) => a.sym === sym) ? sym : assets[0]?.sym ?? '';
  const up = (k: UpgradeKind, label: string, desc: string) => {
    const c = d.upgradeCost(k);
    return (
      <div className="upg">
        <b>{label} Lv {d.up[k]}</b>
        <small>{desc}</small>
        <button className="mini" disabled={c == null} onClick={() => report(g.act(() => d.upgrade(k)), '⬆️ Upgrade complete')}>
          {c == null ? 'MAX' : 'Upgrade ' + fmtMoney(c)}
        </button>
      </div>
    );
  };
  return (
    <>
      <div className="form-row">
        <select value={strategy} onChange={(e) => setStrategy(e.target.value as Strategy)}>
          {Object.entries(STRATEGIES).map(([k, s]) => (
            <option key={k} value={k}>{s.label} — {s.desc}</option>
          ))}
        </select>
        <select value={botSym} onChange={(e) => setSym(e.target.value)}>
          {assets.map((a) => <option key={a.sym}>{a.sym}</option>)}
        </select>
        <input type="number" min="100" placeholder="Allocation $" value={alloc} onChange={(e) => setAlloc(e.target.value)} />
        <button className="primary" onClick={() => report(g.act(() => d.create({ strategy, sym: botSym, alloc: parseFloat(alloc) })), '🤖 Bot created and trading')}>
          + Create Bot
        </button>
      </div>
      <div className="upgs">
        {up('speed', '⚡ Speed', 'Decides more often')}
        {up('expertise', '🧠 Expertise', 'Cheaper fees · Lv3 trend filter · Lv4 trailing stop')}
        {up('slots', '🗄️ Slots', `${d.bots.length}/${d.slotCount()} bots active`)}
      </div>
      <div className="bots">
        {d.bots.length ? (
          d.bots.map((b) => {
            const v = d.value(b);
            const pnl = v - b.alloc;
            return (
              <div key={b.id} className="bot">
                <div>
                  <b>{STRATEGIES[b.strategy].label}</b> · {b.sym} <span className="pill">{b.pos > 0 ? 'LONG' : b.pos < 0 ? 'SHORT' : 'FLAT'}</span>
                </div>
                <div className="kv"><span>Value</span><b>{fmtMoney(v)}</b></div>
                <div className="kv"><span>P&amp;L</span><b className={upDown(pnl)}>{fmtMoney(pnl, { sign: true })} ({fmtPct(pnl / b.alloc)})</b></div>
                <div className="kv"><span>Trades</span><b>{b.trades} · win {b.trades ? Math.round((b.wins / b.trades) * 100) : 0}%</b></div>
                <div className="log">{b.log.map((l, i) => <div key={i}>{l}</div>)}</div>
                <button className="mini" onClick={() => report(g.act(() => d.remove(b.id)), 'Bot stopped, funds returned to cash')}>Stop &amp; withdraw</button>
              </div>
            );
          })
        ) : (
          <div className="empty">No bots yet. Pick a strategy, asset &amp; allocation above.</div>
        )}
      </div>
    </>
  );
}

function Vault() {
  const g = useGame();
  const p = g.prog;
  const [amt, setAmt] = useState('');
  const n = parseFloat(amt) || 0;
  return (
    <>
      <div className="form-row">
        <input type="number" min="0" placeholder="Amount $" value={amt} onChange={(e) => setAmt(e.target.value)} />
        <button className="primary" onClick={() => g.act(() => p.deposit(n))}>Deposit</button>
        <button onClick={() => g.act(() => p.withdraw(n))}>Withdraw</button>
        <button onClick={() => g.act(() => p.deposit(g.portfolio.cash))}>Deposit all</button>
        <button onClick={() => g.act(() => p.withdraw(p.vault))}>Withdraw all</button>
      </div>
      <div className="vault">
        <div className="big">🏦 {fmtMoney(p.vault, { compact: false })}</div>
        <div className="kv"><span>Interest per trading day</span><b className="up">{(p.vaultRate() * 100).toFixed(2)}%</b></div>
        <div className="kv"><span>Estimated interest tomorrow</span><b>{fmtMoney(p.vault * p.vaultRate())}</b></div>
        <p className="muted">
          Money in the vault is safe from liquidation and earns interest at every closing bell (also while offline, up to 10 days). Vault Pro at Level 8 doubles the rate.
        </p>
      </div>
    </>
  );
}

function Rewards() {
  const g = useGame();
  const report = useResult();
  const { setModal } = useUI();
  const p = g.prog;
  const [code, setCode] = useState('');
  const req = p.rebirthReq();
  const nw = g.netWorth();
  const redeem = () => {
    const res = g.act(() => p.redeem(code));
    if (res.ok) setCode('');
    else report(res);
  };
  return (
    <>
      <div className="form-row">
        <input type="text" placeholder="Enter a code (e.g. STOCKMARKET)" value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && redeem()} />
        <button className="primary" onClick={redeem}>🎁 Redeem</button>
      </div>
      <div className="rew">
        <div>
          <h4>Goals</h4>
          {GOALS.map((x) => {
            const st = p.goalState(x);
            return (
              <div key={x.id} className={`goal ${st}`}>
                <div>
                  <b>{x.label}</b>
                  <small>{x.desc}</small>
                </div>
                <span>{fmtMoney(x.reward * (1 + p.rebirths))}</span>
                {st === 'ready' ? (
                  <button className="mini primary" onClick={() => g.act(() => p.claim(x.id))}>Claim</button>
                ) : (
                  <span className="muted">{st === 'claimed' ? '✔' : '…'}</span>
                )}
              </div>
            );
          })}
        </div>
        <div>
          <h4>Level roadmap</h4>
          {UNLOCKS.map((u) => (
            <div key={u.key} className={`unl ${p.level >= u.level ? 'ok' : ''}`}>
              <b>Lv {u.level}</b> {u.label}
            </div>
          ))}
        </div>
        <div>
          <h4>♻️ Rebirth ({p.rebirths})</h4>
          <p className="muted">
            Resets cash, positions, bots, vault &amp; level. Permanent rewards: XP ×{(1 + 0.5 * (p.rebirths + 1)).toFixed(1)}, starting cash &amp; goal rewards ×{p.rebirths + 2}, vault interest +{25 * (p.rebirths + 1)}%.
          </p>
          <div className="bar"><i style={{ width: `${clamp(nw / req, 0, 1) * 100}%` }} /></div>
          <div className="kv"><span>Net worth required</span><b>{fmtMoney(nw)} / {fmtMoney(req)}</b></div>
          <button
            className="primary"
            disabled={!p.canRebirth()}
            onClick={() =>
              setModal({
                kind: 'confirm', title: '♻️ Rebirth?', confirmLabel: 'Rebirth!',
                body: 'All positions, orders, bots, cash & vault will be reset and your level goes back to 1. You get a permanent bonus. Continue?',
                onConfirm: () => g.rebirth(),
              })
            }
          >
            Rebirth now
          </button>
        </div>
      </div>
    </>
  );
}

function Leaderboard() {
  const g = useGame();
  const rows = g.prog.leaderboard();
  return (
    <table className="lead">
      <thead>
        <tr><th>#</th><th>Trader</th><th>Net worth</th></tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.name} className={r.me ? 'me' : ''}>
            <td>{i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</td>
            <td>{r.name}{r.me && r.rebirths ? ` ♻️${r.rebirths}` : ''}</td>
            <td>{fmtMoney(r.nw)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const BODIES: Record<BottomTab, () => React.JSX.Element> = {
  pos: Positions, orders: Orders, hist: History, news: News, cal: Calendar, algo: Algo, vault: Vault, rewards: Rewards, lead: Leaderboard,
};

function Badges({ tab }: { tab: BottomTab }) {
  const g = useGame();
  const counts: Partial<Record<BottomTab, number>> = {
    pos: g.portfolio.positions.length, orders: g.portfolio.orders.length, rewards: g.prog.readyGoals(), algo: g.bots.bots.length,
  };
  const v = counts[tab] ?? 0;
  if (!v) return null;
  return <span className={`badge ${tab === 'rewards' ? 'hot' : ''}`}>{v}</span>;
}

export function BottomPanel() {
  const { bottomTab, setBottomTab } = useUI();
  const Body = BODIES[bottomTab];
  return (
    <section id="bottom" className="panel">
      <div className="tabs">
        {TABS.map(([k, label]) => (
          <button key={k} className={k === bottomTab ? 'active' : ''} onClick={() => setBottomTab(k)}>
            {label}
            <Badges tab={k} />
          </button>
        ))}
      </div>
      <div id="tabBody">
        <Body />
      </div>
    </section>
  );
}
