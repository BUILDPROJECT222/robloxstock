// Helper umum: angka acak, format uang/harga, indikator teknikal.

export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const uid = () => Math.random().toString(36).slice(2, 10);

// Distribusi normal standar (Box–Muller).
export function gauss() {
  let u = 0, v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function fmtMoney(n, { sign = false, compact = true } = {}) {
  if (!isFinite(n)) return '$0';
  const s = n < 0 ? '-' : sign && n > 0 ? '+' : '';
  const a = Math.abs(n);
  let body;
  if (compact && a >= 1e12) body = (a / 1e12).toFixed(2) + 'T';
  else if (compact && a >= 1e9) body = (a / 1e9).toFixed(2) + 'B';
  else if (compact && a >= 1e6) body = (a / 1e6).toFixed(2) + 'M';
  else if (compact && a >= 1e4) body = (a / 1e3).toFixed(1) + 'K';
  else body = a.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return s + '$' + body;
}

export function priceDecimals(p) {
  const a = Math.abs(p);
  if (a >= 1000) return 2;
  if (a >= 10) return 2;
  if (a >= 1) return 3;
  if (a >= 0.01) return 4;
  return 7;
}

export const fmtPrice = (p) => Number(p).toFixed(priceDecimals(p));
export const fmtPct = (x, d = 2) => (x >= 0 ? '+' : '') + (x * 100).toFixed(d) + '%';
export const fmtQty = (q) => (q >= 100 ? q.toFixed(1) : q >= 1 ? q.toFixed(3) : q.toPrecision(3));

export function fmtClock(minute) {
  const h = Math.floor(minute / 60) % 24;
  const m = Math.floor(minute % 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

// ---- Indikator ----
export function ema(values, period) {
  const out = new Array(values.length);
  const k = 2 / (period + 1);
  let prev = values[0];
  for (let i = 0; i < values.length; i++) {
    prev = i === 0 ? values[0] : values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function rsi(values, period = 14) {
  if (values.length < period + 1) return 50;
  let gain = 0, loss = 0;
  for (let i = values.length - period; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    if (d > 0) gain += d; else loss -= d;
  }
  if (loss === 0) return 100;
  const rs = gain / loss;
  return 100 - 100 / (1 + rs);
}
