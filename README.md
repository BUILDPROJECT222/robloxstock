# 📈 Blox Stock Exchange 3D

Game simulasi bursa saham **3D berbasis Three.js** yang terinspirasi dari game Roblox **Roblox Stock Exchange 2 (RSE 2)** buatan Summit Productions.
Dibangun dengan Vite + React + TypeScript; dunia 3D memakai Three.js, dan wallet Solana sudah disiapkan untuk mode on-chain.

## ▶️ Cara menjalankan

Dibangun dengan **Vite + React + TypeScript + Three.js** (wallet Solana sudah disiapkan).

```bash
npm install
npm run dev        # server development di http://localhost:5173
npm run build      # build produksi ke folder dist/ (static, bisa di-host di mana saja)
npm run preview    # coba hasil build
npm run typecheck  # cek TypeScript
```

Isi folder `dist/` bisa langsung di-deploy ke GitHub Pages, Netlify, Vercel, Cloudflare Pages, dll.
RPC Solana bisa diganti lewat env `VITE_SOLANA_RPC` (default: devnet).

Kontrol: **drag** = putar kamera · **scroll** = zoom · **Spasi** = pause · **F** = fokus ke chart · **R** = reset kamera.
Klik baris watchlist, ubin heatmap 3D, atau koin di *Pulse Pit* untuk memilih aset.

---

## 🔎 Hasil riset: mekanisme Roblox Stock Exchange 2

| Mekanisme di RSE 2 | Penjelasan singkat |
|---|---|
| **Pasar** | Saham & ETF, Kripto (24 jam), Futures (Lv 5), Forex (Lv 7), Options (Lv 15), Player Stocks (Lv 12), komoditas, dan **Pulse** (meme coin). |
| **Harga** | Pasar biasa bersifat *personal* (tiap pemain punya state pasarnya sendiri). Ritme sesi: ramai saat open & close, sepi saat makan siang, volatilitas berkelompok, berita yang berlanjut (*follow-through*), dan likuiditas di sekitar angka bulat. |
| **Order** | Market & Limit, plus Take Profit / Stop Loss. Tiket menampilkan ukuran posisi, estimasi harga isi, fee dan **harga likuidasi** sebelum dikirim. |
| **Leverage & short** | Short terbuka di Lv 3, leverage 5x di Lv 5, 10x di Lv 10. Makin tinggi leverage makin dekat harga likuidasi. |
| **Event** | Berita, sektor, dividen, IPO, dan kalender event. |
| **Pulse / meme coin** | Dinilai dari konsentrasi holder, aktivitas developer dan likuiditas — risiko rug pull. |
| **Algo bots** | Algo Desk (Lv 10): bot memakai cash sungguhan, tetap jalan saat offline; alokasi, kecepatan & keahlian bisa di-upgrade. |
| **Progresi** | Naik level membuka fitur, **rebirth** untuk bonus permanen, kalender P&L, leaderboard, goals/rewards. |
| **Uang awal** | *Training bonus* $2.500 dan *first-close reward* $750. Vault menyimpan uang dengan bunga per hari game. |
| **Kode** | Mis. `STOCKMARKET`, `MEMECOINS`, `FUTURES`, `UPDATE`, `BULLMARKET`, `RELEASE` (hadiah cash). |

Sumber: [RSE 2 Guide](https://rse.beyondaverage.io/), [Roblox Stock Exchange 2 Codes – Twinfinite](https://twinfinite.net/codes/roblox-stock-exchange-2-codes/), [RobloxDen](https://robloxden.com/game-codes/roblox-stock-exchange-2), [Destructoid](https://www.destructoid.com/roblox-stock-exchange-2-codes/).

---

## 🎮 Apa yang dibuat di versi Three.js ini

**Dunia 3D (Three.js)** — lantai bursa bergaya blocky ala Roblox:
- Layar chart candlestick raksasa (InstancedMesh) dengan volume, EMA 9/21, garis harga, dan garis entry/TP/SL/likuidasi posisi kamu.
- Ticker ring LED berputar di atas lantai, heatmap 3D (tinggi & warna ubin = % perubahan harian), *Pulse Pit* berisi koin meme yang melayang (dan jatuh saat di-rug).
- Patung **bull / bear** sesuai fase pasar, meja trader dengan monitor, NPC blocky yang berjalan, bersorak saat pasar naik dan panik saat turun.
- Siang/malam mengikuti jam game, efek hujan uang saat profit dan kilat merah saat likuidasi.

**Mekanisme game:**
- Jam bursa 09:30–16:00 (≈80 detik nyata), malam dipercepat. Saham tutup di luar sesi dan bisa **gap** saat pembukaan mengikuti futures `BX1!`; kripto/meme/futures/forex jalan 24 jam.
- Model harga: random walk log-normal + faktor pasar & sektor, ritme sesi berbentuk U, volatility clustering, ekor gemuk, magnet angka bulat, regime **bull/bear/sideways**.
- Berita perusahaan/sektor/makro/kripto, jadwal **earnings** (gap saat open), **IPO** saham baru, **dividen** harian.
- Order Market & Limit, Long/Short, leverage 1x/2x/5x/10x/25x, TP/SL, likuidasi, spread & fee per kelas aset, order book & tape sintetis.
- **Pulse**: meme coin baru muncul terus, dengan metrik holder/top-10/dev/likuiditas → risiko rug pull; bisa juga tiba-tiba viral.
- **Level & unlock**: Lv 2 Pulse · Lv 3 Short + 2x · Lv 5 Futures + 5x · Lv 7 Forex · Lv 8 Vault Pro · Lv 10 Algo Desk + 10x · Lv 15 25x.
- **Algo Desk**: bot Momentum (EMA), Mean Reversion (RSI), Breakout; upgrade kecepatan, keahlian (fee murah, filter tren, trailing stop) dan slot.
- **Vault** berbunga, **Rewards/goals**, **kode redeem**, **Kalender P&L** 21 hari + statistik, **leaderboard** vs trader NPC, **Rebirth** (syarat net worth $1M, ×3 tiap rebirth) dengan multiplier permanen.
- Progres otomatis tersimpan di `localStorage`; bunga vault & hasil bot dihitung saat offline (maks 10 hari).

## 🗂️ Struktur

```
index.html                 entry Vite
src/main.tsx               mount React
src/App.tsx                layout + event game → toast/modal
src/engine/                mesin simulasi (TypeScript murni, tanpa React/DOM)
  config.ts                konstanta: jam bursa, kelas aset, unlock, leverage, kode
  market.ts                harga, candle, berita, earnings, IPO, meme coin, regime
  trading.ts               portofolio: order, posisi, TP/SL, likuidasi, dividen
  progression.ts           XP/level, goals, kode, vault, P&L harian, rebirth, leaderboard
  bots.ts                  Algo Desk (bot trading)
  game.ts                  game loop, transisi sesi, simpan/muat, langganan untuk React
src/world/World.ts         dunia 3D Three.js
src/components/            komponen React (TopBar, Watchlist, Ticket, BottomPanel, Modal, Toasts)
src/state/                 store UI (zustand) + hook useGame
src/solana/                provider wallet Solana (Phantom, Backpack, Solflare, dll.)
```

Mode **📝 Paper** = game simulasi saat ini. Tombol **🔗 Real** dan tombol wallet sudah ada sebagai persiapan trading on-chain di Solana (belum aktif).

> Proyek fan-made untuk belajar; bukan produk resmi Roblox atau Summit Productions.
