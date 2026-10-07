import { useUI } from '../state/store';

export function Toasts() {
  const toasts = useUI((s) => s.toasts);
  return (
    <div id="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind} ${t.out ? 'out' : ''}`}>{t.msg}</div>
      ))}
    </div>
  );
}
