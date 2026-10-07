import type { ReactNode } from 'react';
import { useUI, type ModalState } from '../state/store';
import { game } from '../engine/game';
import { fmtMoney } from '../engine/util';

interface Action {
  label: string;
  cls?: string;
  onClick?: () => void;
}

function Card({ children, actions }: { children: ReactNode; actions: Action[] }) {
  const setModal = useUI((s) => s.setModal);
  return (
    <div id="modal">
      <div className="card">
        {children}
        <div className="actions">
          {actions.map((a) => (
            <button
              key={a.label}
              className={a.cls}
              onClick={() => {
                setModal(null);
                a.onClick?.();
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Help({ first }: { first: boolean }) {
  const setModal = useUI((s) => s.setModal);
  const actions: Action[] = first
    ? [{ label: 'Claim the $2,500 training bonus & start! 🚀', cls: 'primary', onClick: () => game.claimTrainingBonus() }]
    : [
        {
          label: '🗑️ Reset progress',
          onClick: () =>
            setTimeout(() =>
              setModal({
                kind: 'confirm', title: 'Reset all progress?', body: 'Your save will be permanently deleted.',
                confirmLabel: 'Delete & restart', danger: true, onConfirm: () => game.resetSave(),
              }),
            ),
        },
        { label: 'Close', cls: 'primary' },
      ];
  return (
    <Card actions={actions}>
      <h2>📈 Blox Stock Exchange 3D</h2>
      <p>
        A Three.js game inspired by <b>Roblox Stock Exchange 2</b>. Start with a small bankroll, trade stocks, ETFs, crypto, meme coins, futures and forex,
        level up to unlock new features, then <b>rebirth</b> once you're a millionaire.
      </p>
      <ul>
        <li><b>Long</b> = profit when the price goes up. <b>Short</b> (Lv 3) = profit when the price goes down.</li>
        <li><b>Leverage</b> multiplies your exposure — and your <b>liquidation</b> risk. Check the liquidation price in the preview before sending.</li>
        <li><b>Market</b> orders fill instantly, <b>Limit</b> orders wait for your price. Add <b>TP/SL</b> to exit automatically.</li>
        <li>
          The stock market is open <b>09:30–16:00</b> (busy at the open &amp; close, quiet at lunch). Crypto, Pulse, futures &amp; forex trade 24/7. Outside market
          hours stocks can <b>gap</b> at the open (watch the BX1! futures).
        </li>
        <li>Follow the <b>news</b>, plus upcoming <b>earnings</b> &amp; <b>IPOs</b> in the Calendar tab. Dividend stocks pay out at every close.</li>
        <li><b>Pulse</b> (Lv 2): ultra-volatile meme coins. Watch holder concentration, dev activity &amp; liquidity — <b>rug pull</b> risk!</li>
        <li><b>Vault</b>: savings that earn interest every day. <b>Algo Desk</b> (Lv 10): upgradeable automated trading bots.</li>
        <li>
          <b>📝 Paper</b> mode is the game you're playing now. <b>🔗 Real</b> on-chain trading on Solana is coming soon — you can already connect a wallet.
        </li>
        <li>
          Claim prizes in the <b>Rewards</b> tab and try these codes: <code>STOCKMARKET</code>, <code>MEMECOINS</code>, <code>FUTURES</code>, <code>RELEASE</code>,{' '}
          <code>UPDATE</code>, <code>BULLMARKET</code>.
        </li>
      </ul>
      <p className="muted">Controls: drag = rotate camera, scroll = zoom, Space = pause, F = focus chart, R = reset camera.</p>
    </Card>
  );
}

function Body({ m }: { m: ModalState }) {
  switch (m.kind) {
    case 'help':
      return <Help first={m.first} />;
    case 'confirm':
      return (
        <Card actions={[{ label: 'Cancel' }, { label: m.confirmLabel, cls: m.danger ? 'danger' : 'primary', onClick: m.onConfirm }]}>
          <h2>{m.title}</h2>
          <p>{m.body}</p>
        </Card>
      );
    case 'levelup':
      return (
        <Card actions={[{ label: 'Awesome!', cls: 'primary' }]}>
          <h2>⭐ Level {m.level}!</h2>
          <p>New features unlocked:</p>
          <ul>{m.unlocked.map((u) => <li key={u}><b>{u}</b></li>)}</ul>
        </Card>
      );
    case 'rebirth':
      return (
        <Card actions={[{ label: "Let's go!", cls: 'primary' }]}>
          <h2>♻️ Rebirth {m.rebirths}!</h2>
          <p>You start over with {fmtMoney(m.cash)} and a permanent XP bonus of ×{m.xpMult.toFixed(1)}. Let's go again!</p>
        </Card>
      );
    case 'welcome':
      return (
        <Card actions={[{ label: 'Keep trading', cls: 'primary' }]}>
          <h2>👋 Welcome back!</h2>
          <p>While you were away (~{m.days.toFixed(1)} trading days):</p>
          <ul>
            <li>Vault interest: <b className="up">+{fmtMoney(m.interest)}</b></li>
            <li>Bot earnings (offline): <b className="up">+{fmtMoney(m.botGain)}</b></li>
          </ul>
        </Card>
      );
  }
}

export function ModalHost() {
  const modal = useUI((s) => s.modal);
  return modal ? <Body m={modal} /> : null;
}
