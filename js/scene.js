// Blocky (Roblox-like) 3D trading floor built with Three.js:
// giant candlestick screen, LED ticker ring, 3D heatmap, a "Pulse pit"
// for meme coins, bull/bear statue, trader desks and blocky NPCs.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { fmtPrice, fmtPct, ema, rand, pick, clamp } from './util.js';

const WALL_Z = -20;
const SCR = { x0: -18, x1: 18, y0: 5, y1: 21 };
const PRICE = { y0: 7.3, h: 11.4 };
const VOL = { y0: 5.4, h: 1.5 };
const CX0 = -17.4, CW = 31.6;
const MAX_VIS = 72;
const OV_W = 2048, OV_H = 910;

const GREEN = new THREE.Color(0x00e676);
const RED = new THREE.Color(0xff4d5a);
const GREEN_D = new THREE.Color(0x0d5c36);
const RED_D = new THREE.Color(0x6b1f27);

function canvasTex(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return { c, ctx: c.getContext('2d'), t };
}

function studTexture() {
  const { c, ctx, t } = canvasTex(64, 64);
  ctx.fillStyle = '#2a2f3d'; ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = '#232837'; ctx.lineWidth = 2; ctx.strokeRect(0, 0, 64, 64);
  const g = ctx.createRadialGradient(28, 28, 2, 32, 32, 16);
  g.addColorStop(0, '#3a4153'); g.addColorStop(1, '#262b38');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(32, 32, 14, 0, Math.PI * 2); ctx.fill();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function faceTexture() {
  const { ctx, t } = canvasTex(64, 64);
  ctx.fillStyle = '#f5cd30'; ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#111';
  ctx.fillRect(20, 22, 6, 10); ctx.fillRect(38, 22, 6, 10);
  ctx.lineWidth = 4; ctx.strokeStyle = '#111';
  ctx.beginPath(); ctx.arc(32, 36, 13, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
  return t;
}

function labelSprite(w = 256, h = 128, scale = [2.6, 1.3]) {
  const { c, ctx, t } = canvasTex(w, h);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  sp.scale.set(...scale);
  sp.userData.canvas = { c, ctx, t };
  return sp;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

export class World {
  constructor(container, { onSelect }) {
    this.container = container;
    this.onSelect = onSelect;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b1224);
    this.scene.fog = new THREE.Fog(0x0b1224, 60, 130);

    this.camera = new THREE.PerspectiveCamera(52, 1, 0.1, 400);
    this.camera.position.set(0, 13, 33);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 10, -8);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = 1.48;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 70;
    this.controls.update();

    this.time = 0;
    this.mood = 0;
    this.tiles = new Map();
    this.coins = new Map();
    this.particles = [];
    this.pickables = [];
    this.flashT = 0;

    this.buildLights();
    this.buildRoom();
    this.buildScreen();
    this.buildTicker();
    this.buildDesks();
    this.buildStatues();
    this.buildNpcs(14);
    this.buildParticles();
    this.heatGroup = new THREE.Group();
    this.scene.add(this.heatGroup);
    this.coinGroup = new THREE.Group();
    this.scene.add(this.coinGroup);

    this.setupPicking();
    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
  }

  resize() {
    const w = this.container.clientWidth || 1, h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ---------------- building ----------------
  buildLights() {
    this.hemi = new THREE.HemisphereLight(0xbfd4ff, 0x20242e, 0.9);
    this.scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(18, 40, 22);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 40, bottom: -40, near: 1, far: 120 });
    this.sun = sun;
    this.scene.add(sun);
    this.moodLight = new THREE.PointLight(0x00e676, 60, 60, 1.6);
    this.moodLight.position.set(0, 14, -12);
    this.scene.add(this.moodLight);
  }

  buildRoom() {
    const tex = studTexture();
    tex.repeat.set(45, 36);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(90, 72), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = 14;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const wallMat = new THREE.MeshStandardMaterial({ color: 0x1a2236, roughness: 0.9 });
    const back = new THREE.Mesh(new THREE.BoxGeometry(90, 32, 1), wallMat);
    back.position.set(0, 16, WALL_Z - 1.2);
    back.receiveShadow = true;
    this.scene.add(back);

    // city windows on the side walls (change with day/night)
    this.windowMats = [];
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(1, 32, 72), wallMat);
      wall.position.set(side * 45, 16, 14);
      this.scene.add(wall);
      for (let i = 0; i < 5; i++) {
        const mat = new THREE.MeshBasicMaterial({ color: 0x6fa8ff });
        this.windowMats.push(mat);
        const win = new THREE.Mesh(new THREE.PlaneGeometry(10, 14), mat);
        win.position.set(side * 44.4, 15, -10 + i * 12);
        win.rotation.y = -side * Math.PI / 2;
        this.scene.add(win);
      }
    }
    // big logo on the wall
    const { ctx, t } = canvasTex(1024, 128);
    const text = 'BLOX STOCK EXCHANGE';
    let size = 92;
    do { ctx.font = `bold ${size}px "Trebuchet MS", sans-serif`; size -= 4; } while (ctx.measureText(text).width > 980);
    ctx.fillStyle = '#ffd54f'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 512, 68);
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(32, 4), new THREE.MeshBasicMaterial({ map: t, transparent: true }));
    logo.position.set(0, 24.6, WALL_Z - 0.6);
    this.scene.add(logo);
  }

  buildScreen() {
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x0c0f18, metalness: 0.6, roughness: 0.4, emissive: 0x000000 });
    this.frameMat = frameMat;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(38.4, 17.6, 0.6), frameMat);
    frame.position.set(0, 13, WALL_Z - 0.3);
    frame.castShadow = true;
    this.scene.add(frame);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(36, 16), new THREE.MeshBasicMaterial({ color: 0x060a14 }));
    panel.position.set(0, 13, WALL_Z + 0.02);
    this.scene.add(panel);

    const g = this.chartGroup = new THREE.Group();
    g.position.z = WALL_Z + 0.25;
    this.scene.add(g);
    const basic = () => new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    this.bodies = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 0.35), basic(), MAX_VIS + 1);
    this.wicks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 1, 0.12), basic(), MAX_VIS + 1);
    this.vols = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 0.12), basic(), MAX_VIS + 1);
    for (const m of [this.bodies, this.wicks, this.vols]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.count = 0;
      m.frustumCulled = false;
      g.add(m);
      m.setColorAt(0, GREEN);
    }
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((MAX_VIS + 1) * 3), 3));
    this.emaLine = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xffd54f, toneMapped: false }));
    this.emaLine.frustumCulled = false;
    g.add(this.emaLine);
    const lineGeo2 = lineGeo.clone();
    this.emaLine2 = new THREE.Line(lineGeo2, new THREE.LineBasicMaterial({ color: 0x40c4ff, toneMapped: false }));
    this.emaLine2.frustumCulled = false;
    g.add(this.emaLine2);
    this.priceLine = new THREE.Mesh(new THREE.BoxGeometry(CW + 0.6, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
    g.add(this.priceLine);

    this.overlay = canvasTex(OV_W, OV_H);
    const ov = new THREE.Mesh(new THREE.PlaneGeometry(36, 16), new THREE.MeshBasicMaterial({ map: this.overlay.t, transparent: true, depthWrite: false, toneMapped: false }));
    ov.position.set(0, 13, WALL_Z + 0.65);
    this.scene.add(ov);
  }

  buildTicker() {
    this.tick = canvasTex(4096, 96);
    const mk = (side, flip) => {
      const t = this.tick.t.clone();
      t.wrapS = THREE.RepeatWrapping;
      t.repeat.set(flip ? -3 : 3, 1);
      const m = new THREE.Mesh(
        new THREE.CylinderGeometry(19, 19, 1.8, 96, 1, true),
        new THREE.MeshBasicMaterial({ map: t, side, transparent: true, toneMapped: false }),
      );
      m.position.set(0, 29.5, -1);
      this.scene.add(m);
      return t;
    };
    this.tickTexOut = mk(THREE.FrontSide, false);
    this.tickTexIn = mk(THREE.BackSide, true);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(19, 0.12, 8, 96), new THREE.MeshBasicMaterial({ color: 0xffd54f }));
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, 30.5, -1);
    this.scene.add(ring);
    const ring2 = ring.clone();
    ring2.position.y = 28.5;
    this.scene.add(ring2);
  }

  buildDesks() {
    this.monitorMats = [];
    const deskMat = new THREE.MeshStandardMaterial({ color: 0x8d6e63, roughness: 0.7 });
    const legMat = new THREE.MeshStandardMaterial({ color: 0x37474f });
    for (const x of [24, 33]) {
      for (let i = 0; i < 4; i++) {
        const z = -14 + i * 7;
        const g = new THREE.Group();
        const top = new THREE.Mesh(new THREE.BoxGeometry(6, 0.3, 2.4), deskMat);
        top.position.y = 2.4; top.castShadow = top.receiveShadow = true;
        g.add(top);
        for (const lx of [-2.7, 2.7]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.4, 2.2), legMat);
          leg.position.set(lx, 1.2, 0); g.add(leg);
        }
        for (const mx of [-1.6, 0, 1.6]) {
          const mat = new THREE.MeshBasicMaterial({ color: 0x00e676, toneMapped: false });
          this.monitorMats.push(mat);
          const mon = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.95, 0.1), mat);
          mon.position.set(mx, 3.2, -0.6);
          mon.rotation.x = -0.12;
          g.add(mon);
          const back = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.05, 0.08), legMat);
          back.position.set(mx, 3.2, -0.68);
          back.rotation.x = -0.12;
          g.add(back);
        }
        g.position.set(x, 0, z);
        g.rotation.y = -Math.PI / 2;
        this.scene.add(g);
      }
    }
    // "PULSE PIT" sign
    const sp = labelSprite(512, 128, [9, 2.25]);
    const { ctx, t } = sp.userData.canvas;
    ctx.font = 'bold 72px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'center'; ctx.fillStyle = '#ff6ef9';
    ctx.fillText('⚡ PULSE PIT', 256, 88); t.needsUpdate = true;
    sp.position.set(-27, 10, -6);
    this.scene.add(sp);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 0.3, 48), new THREE.MeshStandardMaterial({ color: 0x3b1a4a, emissive: 0x2a0a40 }));
    pad.position.set(-27, 0.15, -6);
    pad.receiveShadow = true;
    this.scene.add(pad);
  }

  buildAnimal(kind) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: kind === 'bull' ? 0xffc83d : 0x7a4a2a, metalness: kind === 'bull' ? 0.7 : 0.1, roughness: 0.35 });
    const box = (w, h, d, x, y, z, m = mat) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      b.position.set(x, y, z); b.castShadow = true; g.add(b); return b;
    };
    box(5, 2.6, 2.6, 0, 3.4, 0);
    box(2, 2, 2, kind === 'bull' ? 3.2 : 3, kind === 'bull' ? 3.6 : 4.2, 0);
    for (const lx of [-1.8, 1.8]) for (const lz of [-0.8, 0.8]) box(0.8, 2.2, 0.8, lx, 1.1, lz);
    if (kind === 'bull') {
      const horn = new THREE.MeshStandardMaterial({ color: 0xffffff });
      box(0.4, 0.4, 1.2, 3.6, 4.8, -1.1, horn); box(0.4, 0.4, 1.2, 3.6, 4.8, 1.1, horn);
      box(0.4, 0.9, 0.4, 3.6, 5.3, -1.6, horn); box(0.4, 0.9, 0.4, 3.6, 5.3, 1.6, horn);
    } else {
      box(0.6, 0.6, 0.4, 2.8, 5.4, -0.7); box(0.6, 0.6, 0.4, 2.8, 5.4, 0.7);
      box(0.7, 0.7, 0.9, 4.2, 4, 0, new THREE.MeshStandardMaterial({ color: 0x3e2618 }));
    }
    return g;
  }

  buildStatues() {
    const ped = new THREE.Mesh(new THREE.BoxGeometry(8, 1.2, 5), new THREE.MeshStandardMaterial({ color: 0x455a64 }));
    ped.position.set(28, 0.6, 16);
    ped.receiveShadow = true;
    this.scene.add(ped);
    this.bull = this.buildAnimal('bull');
    this.bear = this.buildAnimal('bear');
    for (const a of [this.bull, this.bear]) {
      a.position.set(28, 1.2, 16);
      a.rotation.y = -2.4;
      this.scene.add(a);
    }
    this.bear.visible = false;
    this.regimeLabel = labelSprite(512, 128, [8, 2]);
    this.regimeLabel.position.set(28, 9, 16);
    this.scene.add(this.regimeLabel);
  }

  buildNpcs(n) {
    const face = faceTexture();
    const skin = new THREE.MeshStandardMaterial({ color: 0xf5cd30 });
    const faceMat = new THREE.MeshStandardMaterial({ map: face });
    const shirts = [0x1e88e5, 0xe53935, 0x43a047, 0x8e24aa, 0xfb8c00, 0x00897b, 0x212121, 0xffffff];
    const pants = [0x2e7d32, 0x1a237e, 0x4e342e, 0x212121, 0x546e7a];
    this.npcs = [];
    for (let i = 0; i < n; i++) {
      const g = new THREE.Group();
      const shirt = new THREE.MeshStandardMaterial({ color: pick(shirts) });
      const pant = new THREE.MeshStandardMaterial({ color: pick(pants) });
      const part = (w, h, d, mat, px, py) => {
        const pivot = new THREE.Group();
        pivot.position.set(px, py, 0);
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        m.position.y = -h / 2; m.castShadow = true;
        pivot.add(m); g.add(pivot);
        return pivot;
      };
      const legL = part(0.95, 2, 0.95, pant, -0.5, 2);
      const legR = part(0.95, 2, 0.95, pant, 0.5, 2);
      const torso = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 1), shirt);
      torso.position.y = 3; torso.castShadow = true; g.add(torso);
      const armL = part(0.95, 2, 0.95, skin, -1.5, 4);
      const armR = part(0.95, 2, 0.95, skin, 1.5, 4);
      const head = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), [skin, skin, skin, skin, faceMat, skin]);
      head.position.y = 4.6; head.castShadow = true; g.add(head);
      g.scale.setScalar(0.62);
      const npc = { g, legL, legR, armL, armR, target: this.randomSpot(), state: 'walk', wait: 0, speed: rand(2.2, 3.6), phase: rand(0, 6) };
      g.position.copy(this.randomSpot());
      this.scene.add(g);
      this.npcs.push(npc);
    }
  }

  randomSpot() {
    const zones = [
      [-34, 34, 2, 24],   // front area
      [-38, -16, -16, 0], // near the pulse pit
      [16, 21, -16, 10],  // desk aisle
    ];
    const [x0, x1, z0, z1] = pick(zones);
    return new THREE.Vector3(rand(x0, x1), 0, rand(z0, z1));
  }

  buildParticles() {
    const geo = new THREE.PlaneGeometry(0.5, 0.25);
    this.partMesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, toneMapped: false }), 300);
    this.partMesh.count = 0;
    this.partMesh.frustumCulled = false;
    this.partMesh.setColorAt(0, GREEN);
    this.scene.add(this.partMesh);
  }

  // ---------------- interaction ----------------
  setupPicking() {
    const ray = new THREE.Raycaster();
    const v = new THREE.Vector2();
    let down = null;
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
    el.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
      const r = el.getBoundingClientRect();
      v.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(v, this.camera);
      const hit = ray.intersectObjects(this.pickables, true)[0];
      if (hit) {
        let o = hit.object;
        while (o && !o.userData.sym) o = o.parent;
        if (o) this.onSelect(o.userData.sym);
      }
    });
  }

  // ---------------- heatmap & pulse ----------------
  syncAssets(assets) {
    const heat = assets.filter((a) => a.cls !== 'meme');
    const memes = assets.filter((a) => a.cls === 'meme');
    const key = heat.map((a) => a.sym).join(',');
    if (key !== this.heatKey) {
      this.heatKey = key;
      this.heatGroup.clear();
      this.tiles.clear();
      const cols = 8, size = 2.7, gap = 0.35;
      heat.forEach((a, i) => {
        const col = i % cols, row = Math.floor(i / cols);
        const mat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.4, emissive: 0x000000 });
        const m = new THREE.Mesh(new THREE.BoxGeometry(size, 1, size), mat);
        m.castShadow = true; m.receiveShadow = true;
        const x = (col - (cols - 1) / 2) * (size + gap);
        const z = -10.5 + row * (size + gap);
        m.position.set(x, 0.5, z);
        m.userData.sym = a.sym;
        const label = labelSprite();
        label.position.set(x, 2, z);
        label.userData.sym = a.sym;
        this.heatGroup.add(m, label);
        this.tiles.set(a.sym, { m, label, h: 0.3, lastDraw: -1 });
      });
    }
    // meme coins
    const live = new Set(memes.map((a) => a.sym));
    for (const [sym, c] of this.coins) if (!live.has(sym)) { this.coinGroup.remove(c.g); this.coins.delete(sym); }
    memes.forEach((a) => {
      if (this.coins.has(a.sym)) return;
      const g = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(Math.random(), 0.8, 0.55), metalness: 0.6, roughness: 0.25, emissive: 0x220022 });
      const coin = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.3, 32), mat);
      coin.rotation.x = Math.PI / 2;
      coin.castShadow = true;
      const label = labelSprite(256, 128, [2.8, 1.4]);
      label.position.y = 2;
      g.add(coin, label);
      g.userData.sym = a.sym;
      this.coinGroup.add(g);
      this.coins.set(a.sym, { g, coin, mat, label, phase: rand(0, 6), fall: 0 });
    });
    this.pickables = [...this.heatGroup.children, ...this.coinGroup.children];
    // arrange coins in a circle
    let i = 0;
    const n = this.coins.size;
    for (const c of this.coins.values()) {
      const ang = (i++ / Math.max(1, n)) * Math.PI * 2;
      c.home = new THREE.Vector3(-27 + Math.cos(ang) * 5.5, 3.2, -6 + Math.sin(ang) * 5.5);
      if (!c.placed) { c.g.position.copy(c.home); c.placed = true; }
    }
  }

  drawLabel(sp, title, sub, color, selected) {
    const { ctx, t, c } = sp.userData.canvas;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = selected ? 'rgba(255,213,79,0.92)' : 'rgba(10,14,26,0.78)';
    roundRect(ctx, 6, 6, c.width - 12, c.height - 12, 18); ctx.fill();
    ctx.textAlign = 'center';
    ctx.fillStyle = selected ? '#111' : '#fff';
    ctx.font = 'bold 44px "Trebuchet MS", sans-serif';
    ctx.fillText(title, c.width / 2, 54);
    ctx.fillStyle = selected ? '#111' : color;
    ctx.font = 'bold 36px "Trebuchet MS", sans-serif';
    ctx.fillText(sub, c.width / 2, 100);
    t.needsUpdate = true;
  }

  updateAssets(assets, selected, unlocked) {
    for (const a of assets) {
      const chg = a.price / a.dayRef - 1;
      const tile = this.tiles.get(a.sym);
      if (tile) {
        const locked = !unlocked(a);
        const k = clamp(Math.abs(chg) / 0.04, 0, 1);
        const col = locked ? new THREE.Color(0x2b2f3a) : (chg >= 0 ? GREEN_D.clone().lerp(GREEN, k) : RED_D.clone().lerp(RED, k));
        tile.m.material.color.copy(col);
        tile.m.material.emissive.copy(col).multiplyScalar(a.sym === selected ? 0.6 : 0.15);
        tile.h = locked ? 0.3 : 0.4 + clamp(Math.abs(chg) * 50, 0, 3.2);
        const sub = locked ? '🔒' : fmtPct(chg);
        const sig = `${sub}|${a.sym === selected}`;
        if (sig !== tile.lastDraw) {
          tile.lastDraw = sig;
          this.drawLabel(tile.label, a.sym, sub, chg >= 0 ? '#69f0ae' : '#ff8a80', a.sym === selected);
        }
      }
      const coin = this.coins.get(a.sym);
      if (coin) {
        coin.rugged = !!a.rugged;
        if (a.rugged) coin.mat.color.set(0x555555);
        const sub = a.rugged ? 'RUGGED' : fmtPct(chg, 1);
        const sig = `${sub}|${a.sym === selected}`;
        if (sig !== coin.lastDraw) {
          coin.lastDraw = sig;
          this.drawLabel(coin.label, '$' + a.sym, sub, a.rugged ? '#9e9e9e' : chg >= 0 ? '#69f0ae' : '#ff8a80', a.sym === selected);
        }
      }
    }
  }

  // ---------------- ticker ----------------
  updateTicker(assets) {
    const { ctx, c } = this.tick;
    ctx.fillStyle = '#05070d';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.font = 'bold 54px "Courier New", monospace';
    ctx.textBaseline = 'middle';
    let x = 20;
    const list = assets.filter((a) => a.cls !== 'meme' || !a.rugged);
    let i = 0;
    while (x < c.width) {
      const a = list[i++ % list.length];
      const chg = a.price / a.dayRef - 1;
      const s1 = `${a.sym} ${fmtPrice(a.price)} `;
      const s2 = `${chg >= 0 ? '▲' : '▼'}${(Math.abs(chg) * 100).toFixed(2)}%   `;
      ctx.fillStyle = '#ffd54f'; ctx.fillText(s1, x, 50); x += ctx.measureText(s1).width;
      ctx.fillStyle = chg >= 0 ? '#00e676' : '#ff5252'; ctx.fillText(s2, x, 50); x += ctx.measureText(s2).width;
      if (i > 200) break;
    }
    this.tickTexOut.needsUpdate = true;
    this.tickTexIn.needsUpdate = true;
  }

  // ---------------- chart ----------------
  updateChart(a, { open, sessionAsset, positions = [], orders = [] }) {
    if (!a) return;
    const cs = a.candles.slice(-(MAX_VIS - (a.cur ? 1 : 0)));
    if (a.cur) cs.push(a.cur);
    const n = cs.length;
    let lo = Infinity, hi = -Infinity;
    for (const c of cs) { lo = Math.min(lo, c.l); hi = Math.max(hi, c.h); }
    if (!isFinite(lo)) { lo = a.price * 0.99; hi = a.price * 1.01; }
    const pad = (hi - lo) * 0.08 || a.price * 0.01;
    lo -= pad; hi += pad;
    const yOf = (p) => PRICE.y0 + ((p - lo) / (hi - lo)) * PRICE.h;
    const dx = CW / MAX_VIS;
    const vmax = Math.max(...cs.map((c) => c.v), 1e-9);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), sc = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const c = cs[i];
      const x = CX0 + (i + 0.5) * dx;
      const up = c.c >= c.o;
      const yo = yOf(c.o), yc = yOf(c.c);
      const bh = Math.max(Math.abs(yc - yo), 0.05);
      m4.compose(pos.set(x, (yo + yc) / 2, 0), q, sc.set(dx * 0.68, bh, 1));
      this.bodies.setMatrixAt(i, m4);
      this.bodies.setColorAt(i, up ? GREEN : RED);
      const yh = yOf(c.h), yl = yOf(c.l);
      m4.compose(pos.set(x, (yh + yl) / 2, 0), q, sc.set(1, Math.max(yh - yl, 0.02), 1));
      this.wicks.setMatrixAt(i, m4);
      this.wicks.setColorAt(i, up ? GREEN : RED);
      const vh = (c.v / vmax) * VOL.h;
      m4.compose(pos.set(x, VOL.y0 + vh / 2, 0), q, sc.set(dx * 0.68, Math.max(vh, 0.02), 1));
      this.vols.setMatrixAt(i, m4);
      this.vols.setColorAt(i, up ? GREEN_D : RED_D);
    }
    for (const m of [this.bodies, this.wicks, this.vols]) {
      m.count = n;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    // EMA 9 & 21
    const all = a.candles.slice(-(MAX_VIS + 40)).map((c) => c.c);
    if (a.cur) all.push(a.cur.c);
    for (const [line, period] of [[this.emaLine, 9], [this.emaLine2, 21]]) {
      const e = ema(all, period).slice(-n);
      const arr = line.geometry.attributes.position.array;
      for (let i = 0; i < n; i++) {
        arr[i * 3] = CX0 + (i + 0.5) * dx;
        arr[i * 3 + 1] = yOf(e[i]);
        arr[i * 3 + 2] = 0.3;
      }
      line.geometry.attributes.position.needsUpdate = true;
      line.geometry.setDrawRange(0, n);
    }
    const chg = a.price / a.dayRef - 1;
    this.priceLine.position.set(CX0 + CW / 2, yOf(a.price), 0.3);
    this.priceLine.material.color.copy(chg >= 0 ? GREEN : RED);

    this.drawOverlay(a, { lo, hi, yOf, open, sessionAsset, positions, orders, chg });
  }

  drawOverlay(a, { lo, hi, yOf, open, sessionAsset, positions, orders, chg }) {
    const { ctx, t } = this.overlay;
    const px = (x) => ((x - SCR.x0) / (SCR.x1 - SCR.x0)) * OV_W;
    const py = (y) => ((SCR.y1 - y) / (SCR.y1 - SCR.y0)) * OV_H;
    ctx.clearRect(0, 0, OV_W, OV_H);
    // price grid
    ctx.font = '26px "Courier New", monospace';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= 5; i++) {
      const p = lo + ((hi - lo) * i) / 5;
      const y = py(yOf(p));
      ctx.strokeStyle = 'rgba(120,140,190,0.18)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(px(CX0), y); ctx.lineTo(px(CX0 + CW), y); ctx.stroke();
      ctx.fillStyle = '#8fa3cf';
      ctx.fillText(fmtPrice(p), px(CX0 + CW) + 14, y);
    }
    // position & order lines
    const hline = (p, color, text, dash) => {
      if (p == null || p < lo || p > hi) return;
      const y = py(yOf(p));
      ctx.setLineDash(dash ? [14, 10] : []);
      ctx.strokeStyle = color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(px(CX0), y); ctx.lineTo(px(CX0 + CW), y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = 'bold 24px "Trebuchet MS", sans-serif';
      const w = ctx.measureText(text).width + 16;
      ctx.fillStyle = color; ctx.fillRect(px(CX0) + 6, y - 32, w, 28);
      ctx.fillStyle = '#000'; ctx.fillText(text, px(CX0) + 14, y - 18);
    };
    for (const p of positions) {
      hline(p.entry, '#ffd54f', `${p.side.toUpperCase()} ${p.lev}x entry`, false);
      hline(p.tp, '#00e676', 'TP', true);
      hline(p.sl, '#ff9100', 'SL', true);
      hline(p.liq, '#ff1744', 'LIQUIDATION', true);
    }
    for (const o of orders) hline(o.limit, '#b388ff', `LIMIT ${o.side.toUpperCase()}`, true);

    // current price tag
    const y = py(yOf(a.price));
    ctx.fillStyle = chg >= 0 ? '#00c853' : '#d50000';
    roundRect(ctx, px(CX0 + CW) + 4, y - 22, 190, 44, 8); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 28px "Courier New", monospace';
    ctx.fillText(fmtPrice(a.price), px(CX0 + CW) + 14, y);

    // title
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 64px "Trebuchet MS", sans-serif';
    ctx.fillText(a.sym, 40, 80);
    const wSym = ctx.measureText(a.sym).width;
    ctx.fillStyle = '#8fa3cf'; ctx.font = '34px "Trebuchet MS", sans-serif';
    ctx.fillText(`${a.name} · ${a.sector}`, 60 + wSym, 78);
    ctx.textAlign = 'right';
    ctx.fillStyle = chg >= 0 ? '#00e676' : '#ff5252'; ctx.font = 'bold 64px "Courier New", monospace';
    ctx.fillText(`${fmtPrice(a.price)}  ${fmtPct(chg)}`, OV_W - 40, 80);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffd54f'; ctx.font = '24px "Trebuchet MS", sans-serif';
    ctx.fillText('— EMA 9', 40, 122);
    ctx.fillStyle = '#40c4ff'; ctx.fillText('— EMA 21', 160, 122);

    if (sessionAsset && !open) {
      ctx.fillStyle = 'rgba(5,8,16,0.55)';
      ctx.fillRect(0, 140, OV_W, OV_H - 140);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd54f'; ctx.font = 'bold 96px "Trebuchet MS", sans-serif';
      ctx.fillText('🔕 MARKET CLOSED', OV_W / 2, OV_H / 2 + 20);
      ctx.font = '36px "Trebuchet MS", sans-serif'; ctx.fillStyle = '#cfd8dc';
      ctx.fillText('Reopens at 09:30 — place limit orders or trade crypto/futures', OV_W / 2, OV_H / 2 + 80);
      ctx.textAlign = 'left';
    }
    if (a.rugged) {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ff1744'; ctx.font = 'bold 120px "Trebuchet MS", sans-serif';
      ctx.fillText('💀 RUG PULLED', OV_W / 2, OV_H / 2);
      ctx.textAlign = 'left';
    }
    t.needsUpdate = true;
  }

  // ---------------- atmosphere ----------------
  setSession(open, minute, regime) {
    const dayT = clamp((minute - 360) / (1200 - 360), 0, 1); // 06:00..20:00
    const daylight = Math.sin(dayT * Math.PI);
    const bg = new THREE.Color(0x060914).lerp(new THREE.Color(0x1c3157), daylight);
    this.scene.background.copy(bg);
    this.scene.fog.color.copy(bg);
    this.hemi.intensity = 0.35 + 0.75 * daylight;
    this.sun.intensity = 0.3 + 1.5 * daylight;
    const wc = new THREE.Color(0x0a1330).lerp(new THREE.Color(0x8cc4ff), daylight);
    for (const m of this.windowMats) m.color.copy(wc);
    this.open = open;
    if (regime !== this.regime) {
      this.regime = regime;
      this.bull.visible = regime !== 'bear';
      this.bear.visible = regime === 'bear';
      const text = { bull: '🐂 BULL MARKET', bear: '🐻 BEAR MARKET', sideways: '😴 SIDEWAYS' }[regime];
      const { ctx, t, c } = this.regimeLabel.userData.canvas;
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.font = 'bold 64px "Trebuchet MS", sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = regime === 'bear' ? '#ff5252' : regime === 'bull' ? '#00e676' : '#ffd54f';
      ctx.fillText(text, 256, 84); t.needsUpdate = true;
    }
  }

  setMood(chg) {
    this.mood = chg;
    this.moodLight.color.set(chg >= 0 ? 0x00e676 : 0xff3d3d);
    this.moodLight.intensity = 30 + clamp(Math.abs(chg) * 4000, 0, 120);
    for (const m of this.monitorMats) {
      if (Math.random() < 0.3) m.color.set(Math.random() < 0.5 + chg * 20 ? 0x00c853 : 0xd50000);
    }
  }

  flash(color) {
    this.frameMat.emissive.set(color);
    this.flashT = 1;
  }

  burst(good, amount = 60) {
    const origin = new THREE.Vector3(0, 13, WALL_Z + 2);
    for (let i = 0; i < amount; i++) {
      if (this.particles.length >= 300) this.particles.shift();
      this.particles.push({
        p: origin.clone().add(new THREE.Vector3(rand(-14, 14), rand(-5, 5), 0)),
        v: new THREE.Vector3(rand(-4, 4), rand(2, 9), rand(6, 16)),
        r: new THREE.Euler(rand(0, 6), rand(0, 6), rand(0, 6)),
        w: new THREE.Vector3(rand(-6, 6), rand(-6, 6), rand(-6, 6)),
        life: rand(2.5, 4.5),
        color: good ? (Math.random() < 0.8 ? GREEN : new THREE.Color(0xffd54f)) : RED,
      });
    }
    for (const n of this.npcs) {
      n.react = good ? 'cheer' : 'panic';
      n.reactT = 2.5;
    }
  }

  // ---------------- animation loop ----------------
  frame(dt) {
    this.time += dt;
    const t = this.time;
    this.controls.update();
    this.tickTexOut.offset.x = (this.tickTexOut.offset.x + dt * 0.012) % 1;
    this.tickTexIn.offset.x = (this.tickTexIn.offset.x - dt * 0.012) % 1;

    for (const tile of this.tiles.values()) {
      const m = tile.m;
      m.scale.y += (tile.h - m.scale.y) * Math.min(1, dt * 4);
      m.position.y = m.scale.y / 2;
      tile.label.position.y = m.scale.y + 1;
    }
    for (const c of this.coins.values()) {
      if (c.rugged) {
        c.fall = Math.min(1, c.fall + dt * 0.8);
        c.g.position.y = THREE.MathUtils.lerp(c.home.y, 0.55, c.fall);
        c.coin.rotation.set(Math.PI / 2 * (1 - c.fall), 0, c.fall * 1.3);
      } else {
        c.g.position.x = c.home.x; c.g.position.z = c.home.z;
        c.g.position.y = c.home.y + Math.sin(t * 2 + c.phase) * 0.35;
        c.coin.rotation.z = t * 2.4 + c.phase;
      }
    }

    if (this.flashT > 0) {
      this.flashT = Math.max(0, this.flashT - dt * 1.5);
      this.frameMat.emissiveIntensity = this.flashT;
    }

    // NPC
    const tmp = new THREE.Vector3();
    for (const n of this.npcs) {
      const g = n.g;
      if (n.reactT > 0) n.reactT -= dt;
      const mood = n.reactT > 0 ? n.react : this.mood > 0.012 ? 'cheer' : this.mood < -0.012 ? 'panic' : null;
      if (mood && n.state !== mood && Math.random() < (n.reactT > 0 ? 0.08 : 0.004)) {
        n.state = mood;
        n.wait = 2.5;
      }
      if (n.state === 'walk') {
        tmp.subVectors(n.target, g.position);
        const d = tmp.length();
        if (d < 0.3) { n.state = 'idle'; n.wait = rand(1, 4); }
        else {
          tmp.normalize();
          g.position.addScaledVector(tmp, Math.min(d, n.speed * dt));
          const ang = Math.atan2(tmp.x, tmp.z);
          g.rotation.y += ((((ang - g.rotation.y) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI) * Math.min(1, dt * 8);
        }
        const s = Math.sin(t * 9 + n.phase) * 0.7;
        n.legL.rotation.x = s; n.legR.rotation.x = -s;
        n.armL.rotation.x = -s; n.armR.rotation.x = s;
        n.armL.rotation.z = n.armR.rotation.z = 0;
        g.position.y = 0;
      } else {
        n.wait -= dt;
        n.legL.rotation.x = n.legR.rotation.x = 0;
        if (n.state === 'cheer') {
          g.position.y = Math.abs(Math.sin(t * 7 + n.phase)) * 0.9;
          n.armL.rotation.x = n.armR.rotation.x = Math.PI;
          n.armL.rotation.z = -0.3; n.armR.rotation.z = 0.3;
        } else if (n.state === 'panic') {
          g.position.y = 0;
          n.armL.rotation.x = n.armR.rotation.x = Math.PI * 0.85 + Math.sin(t * 20) * 0.08;
          n.armL.rotation.z = 0.6; n.armR.rotation.z = -0.6;
        } else {
          g.position.y = 0;
          n.armL.rotation.x = n.armR.rotation.x = Math.sin(t * 1.5 + n.phase) * 0.06;
          n.armL.rotation.z = n.armR.rotation.z = 0;
        }
        if (n.wait <= 0) { n.state = 'walk'; n.target = this.randomSpot(); }
      }
    }

    // money particles
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
    let k = 0;
    this.particles = this.particles.filter((p) => (p.life -= dt) > 0 && p.p.y > -1);
    for (const p of this.particles) {
      p.v.y -= 9 * dt;
      p.v.multiplyScalar(1 - dt * 0.6);
      p.p.addScaledVector(p.v, dt);
      if (p.p.y < 0.05) { p.p.y = 0.05; p.v.set(0, 0, 0); }
      p.r.x += p.w.x * dt; p.r.y += p.w.y * dt;
      q.setFromEuler(p.r);
      m4.compose(p.p, q, one);
      this.partMesh.setMatrixAt(k, m4);
      this.partMesh.setColorAt(k, p.color);
      k++;
    }
    this.partMesh.count = k;
    this.partMesh.instanceMatrix.needsUpdate = true;
    if (this.partMesh.instanceColor) this.partMesh.instanceColor.needsUpdate = true;

    this.renderer.render(this.scene, this.camera);
  }

  focusChart() {
    this.camera.position.set(0, 13, 14);
    this.controls.target.set(0, 13, WALL_Z);
  }
  resetView() {
    this.camera.position.set(0, 13, 33);
    this.controls.target.set(0, 10, -8);
  }
}
