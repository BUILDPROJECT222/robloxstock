import { useGame } from '../state/useGame';
import { useUI, type WatchTab } from '../state/store';
import { fmtPct, fmtPrice } from '../engine/util';
import type { Asset } from '../engine/types';
import type { UnlockKey } from '../engine/config';
import { upDown } from '../ui';

export const WATCH_TABS: { key: WatchTab; label: string; unlock: UnlockKey; filter: (a: Asset) => boolean }[] = [
  { key: 'stocks', label: 'Stocks', unlock: 'stocks', filter: (a) => a.cls === 'stock' || a.cls === 'etf' },
  { key: 'crypto', label: 'Crypto', unlock: 'crypto', filter: (a) => a.cls === 'crypto' },
  { key: 'pulse', label: 'Pulse', unlock: 'pulse', filter: (a) => a.cls === 'meme' },
  { key: 'futures', label: 'Futures', unlock: 'futures', filter: (a) => a.cls === 'future' },
  { key: 'forex', label: 'Forex', unlock: 'forex', filter: (a) => a.cls === 'forex' },
];

export function Watchlist() {
  const g = useGame();
  const { watchTab, setWatchTab } = useUI();
  const tab = WATCH_TABS.find((t) => t.key === watchTab)!;
  const list = g.market.list.filter(tab.filter);
  const locked = !g.prog.has(tab.unlock);

  return (
    <aside id="left" className="panel">
      <div className="tabs">
        {WATCH_TABS.map((t) => {
          const lk = !g.prog.has(t.unlock);
          return (
            <button key={t.key} className={`${t.key === watchTab ? 'active' : ''} ${lk ? 'locked' : ''}`} onClick={() => setWatchTab(t.key)}>
              {t.label}
              {lk ? ` 🔒${g.prog.unlockLevel(t.unlock)}` : ''}
            </button>
          );
        })}
      </div>
      <div className="watch">
        {locked && <div className="lockbox">🔒 Unlocks at Level {g.prog.unlockLevel(tab.unlock)} — you can still watch the prices.</div>}
        {list.map((a) => {
          const chg = a.price / a.dayRef - 1;
          return (
            <div key={a.sym} className={`wrow ${a.sym === g.selected ? 'sel' : ''} ${a.rugged ? 'rug' : ''}`} onClick={() => g.select(a.sym)}>
              <div className="wl">
                <b>
                  {a.cls === 'meme' ? '$' : ''}
                  {a.sym}
                </b>
                <small>{a.name}</small>
              </div>
              <div className="wr">
                <span className="wp">{fmtPrice(a.price)}</span>
                <span className={`wc ${upDown(chg)}`}>{a.rugged ? 'RUG' : fmtPct(chg)}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="hint">Click a row, a heatmap tile, or a coin in the Pulse Pit to select an asset. Drag to rotate the camera.</div>
    </aside>
  );
}
