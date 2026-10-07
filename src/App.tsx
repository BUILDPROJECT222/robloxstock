import { useEffect } from 'react';
import { game } from './engine/game';
import { useUI } from './state/store';
import { WalletProviders } from './solana/WalletProviders';
import { WorldView } from './components/WorldView';
import { TopBar } from './components/TopBar';
import { Watchlist } from './components/Watchlist';
import { Ticket } from './components/Ticket';
import { BottomPanel } from './components/BottomPanel';
import { Toasts } from './components/Toasts';
import { ModalHost } from './components/ModalHost';

export default function App() {
  const { pushToast, setModal } = useUI();

  useEffect(() => {
    const offToast = game.on('toast', ({ msg, kind }) => pushToast(msg, kind));
    const offModal = game.on('modal', (m) => setModal(m));
    if (!game.started) setModal({ kind: 'help', first: true });
    else {
      const welcome = game.takePendingWelcome();
      if (welcome) setModal(welcome);
    }
    game.start();
    return () => {
      offToast();
      offModal();
    };
  }, [pushToast, setModal]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches('input, select, textarea')) return;
      const world = useUI.getState().world;
      if (e.code === 'Space') {
        e.preventDefault();
        game.setSpeed(game.speed ? 0 : 1);
      }
      if (e.key === 'f' || e.key === 'F') world?.focusChart();
      if (e.key === 'r' || e.key === 'R') world?.resetView();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <WalletProviders>
      <WorldView />
      <div id="ui">
        <TopBar />
        <Watchlist />
        <Ticket />
        <BottomPanel />
        <Toasts />
        <ModalHost />
      </div>
    </WalletProviders>
  );
}
