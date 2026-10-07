import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useGame } from '../state/useGame';
import { useUI } from '../state/store';
import { fmtClock, fmtMoney } from '../engine/util';
import { upDown } from '../ui';

const SPEEDS = [
  { v: 0, label: '⏸', title: 'Pause (Space)' },
  { v: 1, label: '1x' },
  { v: 2, label: '2x' },
  { v: 4, label: '4x' },
];

export function TopBar() {
  const g = useGame();
  const { world, mode, setMode, setModal, pushToast } = useUI();
  const dp = g.prog.todayPnl();
  const xpPct = (g.prog.xp / g.prog.xpNeeded()) * 100;

  return (
    <header id="topbar" className="panel">
      <div className="brand">
        📈 <b>BLOX</b> STOCK EXCHANGE <span className="tag3d">3D</span>
      </div>
      <div className="clock">
        <span>Day {g.clock.day} · {fmtClock(g.clock.minute)}</span>
        <span className={`pill ${g.open ? 'open' : 'closed'}`}>{g.open ? '● MARKET OPEN' : '○ MARKET CLOSED'}</span>
      </div>
      <div className="speed">
        {SPEEDS.map((s) => (
          <button key={s.v} title={s.title} className={g.speed === s.v ? 'active' : ''} onClick={() => g.setSpeed(s.v)}>
            {s.label}
          </button>
        ))}
      </div>
      <div className="mode" title="Choose how you trade">
        <button className={mode === 'paper' ? 'active' : ''} onClick={() => setMode('paper')}>
          📝 Paper
        </button>
        <button
          className={mode === 'real' ? 'active real' : ''}
          onClick={() => pushToast('🔗 Real on-chain trading on Solana is coming soon. Connect your wallet to get ready!', 'info')}
          title="Real on-chain trading — coming soon"
        >
          🔗 Real <small>soon</small>
        </button>
      </div>
      <div className="stat">
        <small>Cash</small>
        <b>{fmtMoney(g.portfolio.cash)}</b>
      </div>
      <div className="stat">
        <small>Net Worth</small>
        <b>{fmtMoney(g.netWorth())}</b>
      </div>
      <div className="stat">
        <small>Today's P&amp;L</small>
        <b className={upDown(dp)}>{fmtMoney(dp, { sign: true })}</b>
      </div>
      <div className="level">
        <div className="lvl-row">
          <b>
            Lv {g.prog.level}
            {g.prog.rebirths ? ` ♻️${g.prog.rebirths}` : ''}
          </b>
          <small>
            {Math.floor(g.prog.xp)} / {g.prog.xpNeeded()} XP
          </small>
        </div>
        <div className="bar">
          <i style={{ width: `${xpPct}%` }} />
        </div>
      </div>
      <div className="cam">
        <WalletMultiButton />
        <button title="Focus chart (F)" onClick={() => world?.focusChart()}>🎯</button>
        <button title="Reset camera (R)" onClick={() => world?.resetView()}>🏛️</button>
        <button title="How to play" onClick={() => setModal({ kind: 'help', first: false })}>❔</button>
      </div>
    </header>
  );
}
