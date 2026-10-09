'use strict';
// =====================================================================
//  Loot & Lead – one-thumb top-down roguelike shooter (vanilla canvas)
// =====================================================================
const cv = document.getElementById('c');
const ctx = cv.getContext('2d', { alpha: false });
let LW = 360;                   // logical width (360 in portrait, adaptive in landscape)
let LH = 640;                   // logical height (adaptive)
let land = false;               // landscape layout?
const SA = { l: 0, t: 0, r: 0, b: 0 };   // safe-area insets in logical units
const PICK_R = 34;              // radius (px) within which a floor weapon can be inspected / picked up
let scale = 1, offX = 0, offY = 0, dpr = 1;
const ARENA = { x: 12, y: 62, w: 336, h: 400 };
const BOSS_ROOM = 6;
const TAU = Math.PI * 2;
const DEBUG = /[?&]god=1/.test(location.search);

let state = 'menu';             // menu | play | perk | pause | over | win
let G = null;                   // current run
let best = loadBest();
let hot = [];
let hotOff = 0;                   // clickable hotspots rebuilt each frame
const keys = {};
const joy = { id: null, active: false, ox: 0, oy: 0, x: 0, y: 0, mx: 0, my: 0 };
let muted = false;
let audio = null;
let lastSfx = {};

const rnd = (a, b) => a + Math.random() * (b - a);
const rint = (a, b) => Math.floor(rnd(a, b + 1));
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const fmt = t => { t = Math.floor(t); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };

// ---------------------------------------------------------------- persistence
function loadBest() {
  try {
    const b = JSON.parse(localStorage.getItem('loot_lead_best_v1'));
    if (b && typeof b === 'object') return Object.assign({ runs: 0, wins: 0, bestRoom: 0, bestTime: 0, mostKills: 0, bestDmg: 0 }, b);
  } catch (e) { /* ignore */ }
  return { runs: 0, wins: 0, bestRoom: 0, bestTime: 0, mostKills: 0, bestDmg: 0 };
}
function saveBest() { try { localStorage.setItem('loot_lead_best_v1', JSON.stringify(best)); } catch (e) { /* ignore */ } }

// ---------------------------------------------------------------- audio (tiny synth)
function sfx(name, freq, dur, type, vol, slide) {
  if (muted) return;
  const now = performance.now();
  if (lastSfx[name] && now - lastSfx[name] < 45) return;
  lastSfx[name] = now;
  try {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, audio.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), audio.currentTime + dur);
    g.gain.setValueAtTime((vol || 0.05), audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + dur);
    o.connect(g); g.connect(audio.destination);
    o.start(); o.stop(audio.currentTime + dur);
  } catch (e) { /* audio unavailable */ }
}

// ---------------------------------------------------------------- resize / scaling / safe areas
const saProbe = document.createElement('div');
saProbe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
  'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
document.body.appendChild(saProbe);
function readSafePx() {
  const m = /[?&]safe=([\d.]+),([\d.]+),([\d.]+),([\d.]+)/.exec(location.search);   // debug override: ?safe=top,right,bottom,left (CSS px)
  if (m) return { t: +m[1], r: +m[2], b: +m[3], l: +m[4] };
  const cs = getComputedStyle(saProbe);
  return { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
}
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const iw = window.innerWidth, ih = window.innerHeight;
  cv.width = Math.round(iw * dpr); cv.height = Math.round(ih * dpr);
  const old = { x: ARENA.x, y: ARENA.y, w: ARENA.w, h: ARENA.h }, wasLand = land;
  land = iw > ih;
  if (land) {
    const ar = iw / ih;
    LH = 400; LW = LH * ar;
    if (LW < 600) { LW = 600; LH = LW / ar; }
    LW = Math.round(Math.min(LW, 960)); LH = Math.round(LH);
  } else { LW = 360; LH = clamp(Math.round(LW * ih / iw), 600, 780); }
  scale = Math.min(iw / LW, ih / LH);
  offX = (iw - LW * scale) / 2; offY = (ih - LH * scale) / 2;
  const px = readSafePx();
  SA.l = Math.max(0, (px.l - offX) / scale); SA.r = Math.max(0, (px.r - offX) / scale);
  SA.t = Math.max(0, (px.t - offY) / scale); SA.b = Math.max(0, (px.b - offY) / scale);
  setArena();
  if (joy.active) { joy.active = false; joy.mx = joy.my = 0; joy.id = null; }
  if (G && old.w > 0 && (Math.abs(old.x - ARENA.x) + Math.abs(old.y - ARENA.y) + Math.abs(old.w - ARENA.w) + Math.abs(old.h - ARENA.h) > 0.5)) {
    remapRun(old);
    if (land !== wasLand && state === 'play') state = 'pause';   // orientation flipped mid-run: pause so the player can re-grip
  }
}
function setArena() {
  if (land) { ARENA.x = SA.l + 8; ARENA.y = SA.t + 46; ARENA.w = LW - ARENA.x - SA.r - 168; ARENA.h = LH - ARENA.y - SA.b - 8; }
  else { ARENA.x = 12 + SA.l; ARENA.y = 62 + SA.t; ARENA.w = LW - 24 - SA.l - SA.r; ARENA.h = LH - ARENA.y - 172 - SA.b; }
}
// live resize: map everything in the current run from the old arena rectangle to the new one
function remapRun(o) {
  const g = G, sx = ARENA.w / o.w, sy = ARENA.h / o.h;
  const mx = x => ARENA.x + (x - o.x) * sx, my = y => ARENA.y + (y - o.y) * sy;
  const mv = a => { if (a && a.x != null) { a.x = mx(a.x); a.y = my(a.y); } };
  [g.enemies, g.bullets, g.ebullets, g.items, g.chests, g.patches, g.parts, g.nums].forEach(arr => arr.forEach(mv));
  g.bullets.forEach(b => { if (b.stuck && b.stuck.wall) mv(b.stuck); });
  g.fx.forEach(f => { if (f.x != null) mv(f); if (f.x1 != null) { f.x1 = mx(f.x1); f.y1 = my(f.y1); f.x2 = mx(f.x2); f.y2 = my(f.y2); } });
  g.pillars.forEach(q => { q.x = mx(q.x); q.y = my(q.y); q.w *= sx; q.h *= sy; });
  mv(g.player); resolveCircle(g.player, g.player.r);
  g.floor = makeFloor(g.room);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 120));
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);

// ---------------------------------------------------------------- weapons
function rollRarity(luck, minIdx) {
  const w = RARITIES.map((r, i) => {
    let v = r.weight;
    if (i === 0) v *= Math.max(0.15, 1 - luck * 0.55);
    else v *= 1 + luck * i * 1.1;
    return i < minIdx ? 0 : v;
  });
  let t = w.reduce((a, b) => a + b, 0), x = Math.random() * t;
  for (let i = 0; i < w.length; i++) { x -= w[i]; if (x <= 0) return i; }
  return minIdx || 0;
}
function genWeapon(type, rarityIdx) {
  type = type || pick(WEAPON_ORDER);
  const B = WEAPON_TYPES[type], R = RARITIES[rarityIdx];
  const ids = AFFIXES.map(a => a.id);
  const afx = [];
  while (afx.length < R.affixes) { const id = pick(ids); if (afx.indexOf(id) < 0) afx.push(id); }
  const fx = {}; afx.forEach(a => { fx[a] = true; });
  const w = {
    type, rarity: rarityIdx, afx, fx,
    dmg: B.dmg * R.mult * rnd(0.9, 1.15) * (fx.cursed ? 1.6 : 1),
    rate: B.rate * rnd(0.92, 1.1) * (1 + (R.mult - 1) * 0.18),
    pellets: B.pellets, spCd: 0, spMax: 7, shots: 0, id: Math.random()
  };
  w.name = weaponName(w);
  return w;
}
function weaponName(w) {
  return afxList(w).map(a => AFFIX_BY_ID[a].adj).concat(WEAPON_TYPES[w.type].name).join(' ');
}
function afxList(w) { return w.afx; }
function weaponDps(w) { return w.dmg * w.pellets * w.rate; }
function weaponCombos(w) {
  const c = [];
  if (w.fx.burning && w.fx.ricochet) c.push('Combo: leaves trails of fire');
  if (w.fx.burning && w.fx.explosive) c.push('Combo: blasts ignite enemies');
  if (w.fx.freezing && w.fx.chain) c.push('Combo: arcs freeze foes');
  return c;
}
function weaponRange(w) { const B = WEAPON_TYPES[w.type]; return B.speed * B.life * 0.92; }

// ---------------------------------------------------------------- run setup
function newRun() {
  const P = { spd: 0, crit: 0.05, critDmg: 1.75, luck: 0, maxHp: 100, fireRate: 0, dmg: 0, dashCd: 1.4, specialCd: 1, magnet: 0, armor: 0 };
  G = {
    P, room: 0, time: 0, kills: 0, dmgDealt: 0, found: 1, shake: 0, flash: 0, fade: 1,
    enemies: [], bullets: [], ebullets: [], parts: [], nums: [], items: [], chests: [], patches: [], fx: [], pillars: [], timers: [],
    toast: null, mvx: 0, mvy: 0, perkOffer: null, perksTaken: [], pending: 0, waves: [], waveIdx: 0, roomState: 'fight', doorOpen: false,
    boss: null, endT: 0, banner: null, floor: null, hitstop: 0,
    player: { x: 0, y: 0, hp: 100, r: 9, vx: 0, vy: 0, aim: -Math.PI / 2, cd: 0, iframes: 0, dashT: 0, dashCd: 0, dashDx: 0, dashDy: 1,
              slots: [genWeapon('pistol', 0), null], active: 0, overdrive: 0, target: null, tgtT: 0, step: 0, face: -Math.PI / 2, blink: 0 }
  };
  G.toast = null; G.near = null;
  startRoom(1);
  state = 'play';
}

function startRoom(n) {
  const g = G;
  g.room = n; g.roomState = 'fight'; g.doorOpen = false; g.boss = null;
  g.enemies.length = 0; g.bullets.length = 0; g.ebullets.length = 0; g.items.length = 0; g.chests.length = 0; g.patches.length = 0; g.fx.length = 0; g.timers.length = 0; g.nums.length = 0; g.near = null;
  genPillars(n);
  const p = g.player;
  p.x = ARENA.x + ARENA.w / 2; p.y = ARENA.y + ARENA.h - 34; p.vx = p.vy = 0; p.dashT = 0; p.iframes = 1;
  g.fade = 1;
  g.floor = makeFloor(n);
  g.waveIdx = 0; g.pending = 0; g.perkDone = false; g.endT = 0;
  if (n === BOSS_ROOM) {
    g.waves = [];
    g.banner = { text: 'BOSS: THE WARDEN', t: 2.2 };
    spawnBoss();
  } else {
    g.waves = genWaves(n);
    g.banner = { text: 'ROOM ' + n + ' / 5', t: 1.6 };
    spawnWave();
  }
}

function genPillars(n) {
  const g = G; g.pillars = [];
  if (n === BOSS_ROOM) {
    const cx = ARENA.x + ARENA.w / 2;
    const my = ARENA.y + ARENA.h * 0.55;
    g.pillars.push({ x: ARENA.x + 50, y: my - 20, w: 30, h: 40 }, { x: ARENA.x + ARENA.w - 80, y: my - 20, w: 30, h: 40 });
    return;
  }
  const count = rint(2, 4);
  let tries = 0;
  while (g.pillars.length < count && tries++ < 60) {
    const w = rint(26, 62), h = rint(26, 62);
    const x = rnd(ARENA.x + 30, ARENA.x + ARENA.w - 30 - w), y = rnd(ARENA.y + 70, ARENA.y + ARENA.h - 90 - h);
    const cx = ARENA.x + ARENA.w / 2;
    if (x < cx + 44 && x + w > cx - 44) { if (y < ARENA.y + 110) continue; }    // keep door lane free
    if (x < cx + 56 && x + w > cx - 56 && y + h > ARENA.y + ARENA.h - 120) continue; // keep start free
    if (g.pillars.some(q => x < q.x + q.w + 34 && x + w + 34 > q.x && y < q.y + q.h + 34 && y + h + 34 > q.y)) continue;
    g.pillars.push({ x, y, w, h });
  }
}

function makeFloor(n) {
  const c = document.createElement('canvas');
  c.width = Math.round(LW * 2); c.height = Math.round(LH * 2);
  const x = c.getContext('2d'); x.scale(2, 2);
  const hues = [215, 160, 275, 20, 335, 0];
  const hue = hues[(n - 1) % hues.length];
  x.fillStyle = '#07080d'; x.fillRect(0, 0, LW, LH);
  // arena floor
  x.fillStyle = 'hsl(' + hue + ',22%,13%)';
  x.fillRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h);
  const T = 28;
  for (let yy = 0; yy < ARENA.h; yy += T) for (let xx = 0; xx < ARENA.w; xx += T) {
    if (((xx / T + yy / T) & 1) === 0) { x.fillStyle = 'hsla(' + hue + ',25%,60%,0.035)'; x.fillRect(ARENA.x + xx, ARENA.y + yy, Math.min(T, ARENA.w - xx), Math.min(T, ARENA.h - yy)); }
  }
  for (let i = 0; i < 40; i++) { x.fillStyle = 'rgba(255,255,255,' + rnd(0.01, 0.04).toFixed(3) + ')'; x.fillRect(ARENA.x + rnd(0, ARENA.w), ARENA.y + rnd(0, ARENA.h), rnd(1, 3), rnd(1, 3)); }
  // walls
  x.strokeStyle = 'hsl(' + hue + ',40%,38%)'; x.lineWidth = 4;
  x.strokeRect(ARENA.x - 2, ARENA.y - 2, ARENA.w + 4, ARENA.h + 4);
  x.strokeStyle = 'hsla(' + hue + ',60%,70%,0.25)'; x.lineWidth = 1;
  x.strokeRect(ARENA.x + 1, ARENA.y + 1, ARENA.w - 2, ARENA.h - 2);
  // pillars
  G.pillars.forEach(p => {
    x.fillStyle = 'rgba(0,0,0,0.45)'; x.fillRect(p.x + 3, p.y + 5, p.w, p.h);
    x.fillStyle = 'hsl(' + hue + ',18%,26%)'; x.fillRect(p.x, p.y, p.w, p.h);
    x.fillStyle = 'hsl(' + hue + ',24%,36%)'; x.fillRect(p.x, p.y, p.w, 4);
    x.strokeStyle = 'hsl(' + hue + ',30%,50%)'; x.lineWidth = 1; x.strokeRect(p.x + 0.5, p.y + 0.5, p.w - 1, p.h - 1);
  });
  return c;
}

function genWaves(n) {
  const budget = 11 + n * 5;
  const nW = 3;
  const waves = [];
  for (let w = 0; w < nW; w++) {
    let b = budget / nW * (w === nW - 1 ? 1.1 : 0.95); const list = [];
    const pool = ['chaser', 'chaser', 'swarm'];
    if (n >= 2) pool.push('shooter', 'shooter');
    if (n >= 3) pool.push('tank');
    if (n >= 4) pool.push('shooter', 'tank');
    let guard = 0;
    while (b > 0.9 && guard++ < 40) {
      const t = pick(pool);
      if (t === 'swarm') { const k = rint(5, 7); for (let i = 0; i < k; i++) list.push('swarm'); b -= 3; }
      else { list.push(t); b -= ENEMY_TYPES[t].cost; }
      if (list.length > 18) break;
    }
    if (!list.length) list.push('chaser');
    waves.push(list);
  }
  return waves;
}

function freeSpot(minFromPlayer, r) {
  const g = G, p = g.player;
  for (let i = 0; i < 40; i++) {
    const x = rnd(ARENA.x + r + 8, ARENA.x + ARENA.w - r - 8), y = rnd(ARENA.y + r + 8, ARENA.y + ARENA.h - r - 8);
    if (Math.hypot(x - p.x, y - p.y) < minFromPlayer) continue;
    if (g.pillars.some(q => x > q.x - r - 4 && x < q.x + q.w + r + 4 && y > q.y - r - 4 && y < q.y + q.h + r + 4)) continue;
    return { x, y };
  }
  return { x: ARENA.x + ARENA.w / 2, y: ARENA.y + 80 };
}

function spawnWave() {
  const g = G, list = g.waves[g.waveIdx++];
  const hpMul = 1 + 0.22 * (g.room - 1);
  let cluster = null;
  list.forEach(t => {
    let s;
    if (t === 'swarm') { if (!cluster) cluster = freeSpot(150, 30); s = { x: cluster.x + rnd(-26, 26), y: cluster.y + rnd(-26, 26) }; }
    else { s = freeSpot(140, ENEMY_TYPES[t].r); if (t !== 'swarm') cluster = null; }
    s.x = clamp(s.x, ARENA.x + 10, ARENA.x + ARENA.w - 10); s.y = clamp(s.y, ARENA.y + 10, ARENA.y + ARENA.h - 10);
    addEnemy(t, s.x, s.y, hpMul);
  });
}
function addEnemy(t, x, y, hpMul) {
  const T = ENEMY_TYPES[t];
  const e = { type: t, x, y, vx: 0, vy: 0, r: T.r, hp: T.hp * (hpMul || 1), max: T.hp * (hpMul || 1), speed: T.speed * rnd(0.92, 1.08), dmg: T.dmg * (1 + (G.room - 1) * 0.06),
              spawnT: 0.75, hitT: 0, atk: rnd(0.8, 2), cd: 0, burn: 0, burnDps: 0, burnTick: 0, slow: 0, state: 0, st: 0, ang: 0, dead: false, wob: rnd(0, 6) };
  G.enemies.push(e); return e;
}
function spawnBoss() {
  const g = G;
  const e = addEnemy('boss', ARENA.x + ARENA.w / 2, ARENA.y + 90, 1);
  e.spawnT = 1.4; e.boss = true; e.phase = 1; e.pat = 0; e.atk = 2.2; e.sum = false;
  g.boss = e;
}

// ---------------------------------------------------------------- helpers: walls
function wallAt(x, y, r) {
  r = r || 0;
  if (x < ARENA.x + r || x > ARENA.x + ARENA.w - r || y < ARENA.y + r || y > ARENA.y + ARENA.h - r) return true;
  const P = G.pillars;
  for (let i = 0; i < P.length; i++) { const q = P[i]; if (x > q.x - r && x < q.x + q.w + r && y > q.y - r && y < q.y + q.h + r) return true; }
  return false;
}
function los(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), n = Math.ceil(d / 10);
  for (let i = 1; i < n; i++) { const t = i / n, x = a.x + dx * t, y = a.y + dy * t; const P = G.pillars; for (let k = 0; k < P.length; k++) { const q = P[k]; if (x > q.x && x < q.x + q.w && y > q.y && y < q.y + q.h) return false; } }
  return true;
}
function resolveCircle(o, r) {
  // arena bounds
  o.x = clamp(o.x, ARENA.x + r, ARENA.x + ARENA.w - r);
  o.y = clamp(o.y, ARENA.y + r, ARENA.y + ARENA.h - r);
  const P = G.pillars; let hit = false;
  for (let i = 0; i < P.length; i++) {
    const q = P[i];
    const nx = clamp(o.x, q.x, q.x + q.w), ny = clamp(o.y, q.y, q.y + q.h);
    let dx = o.x - nx, dy = o.y - ny; const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      hit = true;
      if (d2 > 0.0001) { const d = Math.sqrt(d2); o.x = nx + dx / d * r; o.y = ny + dy / d * r; }
      else {
        const l = o.x - q.x, rr = q.x + q.w - o.x, t = o.y - q.y, b = q.y + q.h - o.y, m = Math.min(l, rr, t, b);
        if (m === l) o.x = q.x - r; else if (m === rr) o.x = q.x + q.w + r; else if (m === t) o.y = q.y - r; else o.y = q.y + q.h + r;
      }
    }
  }
  return hit;
}

// ---------------------------------------------------------------- fx helpers
function burst(x, y, n, color, spd, size, life) {
  const g = G; if (g.parts.length > 320) return;
  for (let i = 0; i < n; i++) {
    const a = rnd(0, TAU), s = rnd(0.2, 1) * spd;
    g.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rnd(0.3, 1) * (life || 0.5), max: life || 0.5, size: rnd(0.6, 1) * (size || 2.5), color });
  }
}
function addNum(x, y, text, color, size) { if (G.nums.length < 60) G.nums.push({ x: x + rnd(-6, 6), y, text, color, size: size || 12, life: 0.8, max: 0.8 }); }
function shake(m) { G.shake = Math.max(G.shake, m); }
function ring(x, y, r, color, life) { G.fx.push({ t: 'ring', x, y, r: 4, max: r, color, life: life || 0.3, m: life || 0.3 }); }

// ---------------------------------------------------------------- damage
function dealDamage(e, dmg, crit, color, noNum) {
  if (e.dead || e.spawnT > 0) return false;
  e.hp -= dmg; e.hitT = 0.09; G.dmgDealt += dmg;
  if (!noNum) addNum(e.x, e.y - e.r - 4, String(Math.max(1, Math.round(dmg))), color || (crit ? '#ffe066' : '#ffffff'), crit ? 17 : 12);
  if (e.hp <= 0) killEnemy(e);
  return true;
}
function killEnemy(e) {
  if (e.dead) return;
  e.dead = true;
  const g = G, p = g.player, T = ENEMY_TYPES[e.type];
  g.kills++;
  burst(e.x, e.y, e.boss ? 60 : 12, T.color, e.boss ? 260 : 120, e.boss ? 4 : 3, 0.6);
  ring(e.x, e.y, e.r * 2.2, T.color, 0.3);
  shake(e.boss ? 14 : e.type === 'tank' ? 5 : 2);
  sfx('kill', 180, 0.12, 'sawtooth', 0.05, 0.5);
  const w = p.slots[p.active];
  if (w && w.fx.vampiric && p.hp < g.P.maxHp) { p.hp = Math.min(g.P.maxHp, p.hp + 3); addNum(p.x, p.y - 16, '+3', '#6bff8a', 12); }
  if (e.boss) { g.endT = 2.2; g.ebullets.length = 0; g.enemies.forEach(x => { if (x !== e) killEnemy(x); }); for (let i = 0; i < 3; i++) dropWeapon(e.x + rnd(-30, 30), e.y + rnd(-30, 30), 2); return; }
  const dropChance = e.type === 'tank' ? 0.55 : e.type === 'shooter' ? 0.12 : e.type === 'swarm' ? 0.015 : 0.07;
  if (Math.random() < dropChance + g.P.luck * 0.03) dropWeapon(e.x, e.y, e.type === 'tank' ? 1 : 0);
  else if (Math.random() < 0.1) g.items.push({ kind: 'heart', x: e.x, y: e.y, t: 0, vy: 0 });
}
function dropWeapon(x, y, minR) {
  const g = G;
  const r = rollRarity(g.P.luck + g.room * 0.05, minR || 0);
  const w = genWeapon(null, r);
  const a = rnd(0, TAU);
  g.items.push({ kind: 'weapon', w, x, y, t: 0, vx: Math.cos(a) * 60, vy: Math.sin(a) * 60, ignore: false });
  burst(x, y, 8, RARITIES[r].color, 90, 2.5, 0.5);
}
function hurtPlayer(n, fromX, fromY) {
  const g = G, p = g.player;
  if (p.iframes > 0 || p.dashT > 0 || DEBUG) return;
  const w = p.slots[p.active];
  let mul = (w && w.fx.cursed ? 1.35 : 1) * (1 - g.P.armor);
  n *= mul;
  p.hp -= n; p.iframes = 0.4; g.flash = 0.25;
  shake(7); addNum(p.x, p.y - 14, '-' + Math.round(n), '#ff5a6e', 15);
  burst(p.x, p.y, 10, '#ff5a6e', 130, 3, 0.4);
  sfx('hurt', 120, 0.2, 'sawtooth', 0.08, 0.5);
  if (p.hp <= 0) endRun(false);
}

// ---------------------------------------------------------------- shooting
function fireWeapon(w, ang, opt) {
  opt = opt || {};
  const g = G, p = g.player, B = WEAPON_TYPES[w.type], P = g.P;
  w.shots++;
  let mul = 1 + P.dmg;
  const over = w.fx.overcharged && (w.shots % 5 === 0);
  if (over) { mul *= 3; addNum(p.x, p.y - 20, 'x3!', '#ff9a3c', 13); ring(p.x, p.y, 24, '#ff9a3c', 0.25); }
  if (opt.dmgMul) mul *= opt.dmgMul;
  const pel = opt.pellets || w.pellets;
  for (let i = 0; i < pel; i++) {
    const a = ang + (opt.fan ? (i - (pel - 1) / 2) * opt.fan : 0) + rnd(-1, 1) * B.spread * (opt.fan ? 0.2 : 1);
    const crit = Math.random() < P.crit;
    let dmg = w.dmg * mul * (crit ? P.critDmg : 1);
    const sp = B.speed * (opt.speedMul || 1);
    const b = {
      x: p.x + Math.cos(a) * 12, y: p.y + Math.sin(a) * 12, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, dmg, crit, life: B.life * (opt.lifeMul || 1),
      pierce: (opt.pierce != null ? opt.pierce : B.pierce) + (w.fx.piercing ? 2 : 0), bounces: w.fx.ricochet ? 2 : 0, w, B, over, hit: [], size: B.size * (over ? 1.6 : 1) * (opt.big ? 1.6 : 1),
      color: over ? '#ff9a3c' : crit ? '#ffe066' : B.color, trail: 0, stuck: null, fuse: 0, split: false, t: 0
    };
    g.bullets.push(b);
  }
  p.recoil = 3;
  const snd = { pistol: 520, shotgun: 200, smg: 640, sniper: 300, crossbow: 380, launcher: 140 }[w.type];
  sfx('shot' + w.type, snd, 0.07, 'square', 0.035, 0.5);
}

function explode(x, y, r, dmg, color, ignite) {
  const g = G;
  ring(x, y, r, color, 0.35); burst(x, y, 14, color, 160, 3, 0.5); shake(4);
  sfx('boom', 110, 0.25, 'sawtooth', 0.07, 0.4);
  g.enemies.forEach(e => {
    if (e.dead || e.spawnT > 0) return;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d < r + e.r) { dealDamage(e, dmg * (1 - 0.4 * d / (r + e.r)), false, '#ffb070'); if (ignite) igniteEnemy(e, dmg); if (e.boss && false) return; }
  });
}
function igniteEnemy(e, base) { e.burn = 3; e.burnDps = Math.max(e.burnDps || 0, Math.max(2, base * 0.3)); }

function onBulletHit(b, e) {
  const g = G, w = b.w, fx = w.fx;
  b.hit.push(e);
  dealDamage(e, b.dmg, b.crit, b.over ? '#ff9a3c' : null);
  if (e.dead && false) return;
  burst(b.x, b.y, 3, b.color, 90, 2, 0.25);
  sfx('hit', 260, 0.04, 'triangle', 0.025);
  if (!e.boss) { e.vx += b.vx * 0.012; e.vy += b.vy * 0.012; }
  if (fx.burning) igniteEnemy(e, b.dmg);
  if (fx.freezing) e.slow = 2;
  if (fx.explosive && !b.B.boom) explode(b.x, b.y, 34, b.dmg * 0.4, '#ffb070', fx.burning);
  if (fx.chain && Math.random() < 0.45) chainFrom(e, b, 2);
  if (fx.splitting && !b.split) {
    const base = Math.atan2(b.vy, b.vx);
    for (let k = -1; k <= 1; k += 2) {
      const a = base + k * 0.6, sp = Math.hypot(b.vx, b.vy) * 0.9;
      g.bullets.push({ x: b.x, y: b.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, dmg: b.dmg * 0.4, crit: false, life: 0.4, pierce: 0, bounces: 0, w, B: { boom: 0, stick: false }, over: false,
        hit: [e], size: b.size * 0.7, color: b.color, trail: 0, stuck: null, fuse: 0, split: true, t: 0 });
    }
  }
}
function chainFrom(src, b, n) {
  const g = G; let from = src; const used = [src];
  for (let i = 0; i < n; i++) {
    let best = null, bd = 100;
    g.enemies.forEach(e => { if (e.dead || e.spawnT > 0 || used.indexOf(e) >= 0) return; const d = dist(e, from); if (d < bd) { bd = d; best = e; } });
    if (!best) break;
    g.fx.push({ t: 'bolt', x1: from.x, y1: from.y, x2: best.x, y2: best.y, life: 0.18, m: 0.18 });
    dealDamage(best, b.dmg * 0.5, false, '#7fd0ff');
    if (b.w.fx.freezing) best.slow = 2;
    if (b.w.fx.burning) igniteEnemy(best, b.dmg * 0.5);
    used.push(best); from = best;
  }
  sfx('zap', 900, 0.1, 'sawtooth', 0.03, 0.4);
}

function detonate(b) {
  const B = b.B; if (!B.boom) return;
  explode(b.stuck ? b.stuck.x : b.x, b.stuck ? b.stuck.y : b.y, B.boomR, B.boom * (b.dmg / b.w.dmg) * (1 + 0), b.B.color || '#ffb070', b.w.fx.burning);
  // note: boom damage scales with weapon roll via dmg ratio
}

function updateBullets(dt) {
  const g = G, arr = g.bullets;
  for (let i = arr.length - 1; i >= 0; i--) {
    const b = arr[i]; b.t += dt;
    let remove = false;
    if (b.stuck) {
      if (b.stuck.dead) { b.fuse = 0; } else { b.x = b.stuck.x + b.ox; b.y = b.stuck.y + b.oy; }
      b.fuse -= dt;
      if (b.fuse <= 0) { detonate(b); arr.splice(i, 1); }
      continue;
    }
    b.life -= dt;
    if (b.life <= 0) { if (b.B.boom && !b.B.stick) detonate(b); else if (b.B.boom && b.B.stick) detonate(b); arr.splice(i, 1); continue; }
    const steps = Math.ceil(Math.hypot(b.vx, b.vy) * dt / 10);
    const sdt = dt / steps;
    for (let s = 0; s < steps && !remove; s++) {
      const nx = b.x + b.vx * sdt, ny = b.y + b.vy * sdt;
      if (wallAt(nx, ny, 1)) {
        const hx = wallAt(nx, b.y, 1), hy = wallAt(b.x, ny, 1);
        if (b.bounces > 0) {
          if (hx) b.vx = -b.vx; if (hy) b.vy = -b.vy; if (!hx && !hy) { b.vx = -b.vx; b.vy = -b.vy; }
          b.bounces--; burst(b.x, b.y, 4, b.color, 80, 2, 0.25); sfx('ric', 1100, 0.04, 'triangle', 0.02);
          b.hit.length = 0;
          if (b.w.fx.burning) addPatch(b.x, b.y, 14, 2.2, b.dmg);
          continue;
        }
        if (b.B.stick) { b.ox = 0; b.oy = 0; b.fuse = b.B.fuse; b.stuck = { x: b.x, y: b.y, dead: false, wall: true }; }
        else { if (b.B.boom) detonate(b); else burst(b.x, b.y, 3, b.color, 70, 2, 0.2); remove = true; }
        break;
      }
      b.x = nx; b.y = ny;
      // enemy hit
      for (let k = 0; k < g.enemies.length; k++) {
        const e = g.enemies[k];
        if (e.dead || e.spawnT > 0 || b.hit.indexOf(e) >= 0) continue;
        const rr = e.r + b.size;
        if ((e.x - b.x) * (e.x - b.x) + (e.y - b.y) * (e.y - b.y) < rr * rr) {
          onBulletHit(b, e);
          if (b.B.stick) { b.stuck = e; b.ox = b.x - e.x; b.oy = b.y - e.y; b.fuse = b.B.fuse; }
          else if (b.B.boom) { detonate(b); remove = true; }
          else if (b.pierce > 0) b.pierce--;
          else remove = true;
          break;
        }
      }
      if (b.stuck) break;
    }
    if (b.stuck && b.stuck.wall) { b.stuck.x = b.x; b.stuck.y = b.y; }
    if (b.w.fx.burning && b.w.fx.ricochet && !remove && !b.stuck) { b.trail -= dt; if (b.trail <= 0) { b.trail = 0.09; addPatch(b.x, b.y, 10, 1.4, b.dmg * 0.6); } }
    if (remove) arr.splice(i, 1);
  }
}
function addPatch(x, y, r, life, dmg) {
  const g = G; if (g.patches.length > 70) g.patches.shift();
  g.patches.push({ x, y, r, life, max: life, dmg: Math.max(3, dmg * 0.25), tick: 0 });
}


// ---------------------------------------------------------------- specials
function useSpecial() {
  const g = G; if (!g || state !== 'play') return;
  const p = g.player, w = p.slots[p.active];
  if (!w || w.spCd > 0) return;
  const B = WEAPON_TYPES[w.type];
  w.spCd = w.spMax * g.P.specialCd;
  const ang = p.aim;
  const sched = (n, gap, fn) => { for (let i = 0; i < n; i++) g.timers.push({ t: i * gap, fn: () => fn(i) }); };
  if (w.type === 'pistol') sched(8, 0.06, () => fireWeapon(w, curAim(), { dmgMul: 1.1 }));
  else if (w.type === 'shotgun') {
    explode(p.x, p.y, 85, w.dmg * 7, '#ffc27a', false); ring(p.x, p.y, 90, '#fff', 0.3);
    g.enemies.forEach(e => { const d = Math.max(1, dist(e, p)); if (d < 110 && !e.boss) { e.vx += (e.x - p.x) / d * 420; e.vy += (e.y - p.y) / d * 420; } });
    g.ebullets.length = 0;
  }
  else if (w.type === 'smg') { p.overdrive = 4; addNum(p.x, p.y - 20, 'OVERDRIVE', '#9dffb0', 13); ring(p.x, p.y, 40, '#9dffb0', 0.4); }
  else if (w.type === 'sniper') fireWeapon(w, ang, { dmgMul: 6, pierce: 99, big: true, speedMul: 1.2 });
  else if (w.type === 'crossbow') fireWeapon(w, ang, { pellets: 5, fan: 0.22, dmgMul: 1 });
  else if (w.type === 'launcher') sched(5, 0.12, i => fireWeapon(w, curAim() + rnd(-0.5, 0.5) + (i - 2) * 0.12, { dmgMul: 1 }));
  sfx('special', 300, 0.3, 'sawtooth', 0.06, 2);
  shake(3);
}
function curAim() { return G.player.aim; }

function doDash() {
  const g = G; if (!g || state !== 'play') return;
  const p = g.player;
  if (p.dashCd > 0 || p.dashT > 0) return;
  let dx = g.mvx, dy = g.mvy;
  if (Math.hypot(dx, dy) < 0.1) { dx = Math.cos(p.face); dy = Math.sin(p.face); }
  const l = Math.hypot(dx, dy) || 1; p.dashDx = dx / l; p.dashDy = dy / l;
  p.dashT = 0.17; p.dashCd = g.P.dashCd; p.iframes = Math.max(p.iframes, 0.22);
  burst(p.x, p.y, 8, '#8fe3ff', 100, 3, 0.35);
  sfx('dash', 400, 0.15, 'sine', 0.06, 2.2);
}
function swapWeapon(i) {
  const g = G; if (!g || state !== 'play') return;
  const p = g.player;
  if (i == null) i = 1 - p.active;
  if (!p.slots[i] || p.active === i) { if (p.slots[i]) showWeaponToast(p.slots[i]); return; }
  p.active = i; p.cd = 0.12; sfx('swap', 700, 0.06, 'triangle', 0.04);
  showWeaponToast(p.slots[i], 'Equipped');
}

function showWeaponToast(w, head) { if (G) G.toast = { w, head: head || 'Picked up', t: 2.2, m: 2.2 }; }

// Weapons on the floor are never picked up automatically: standing within PICK_R shows an inspect card + a Pick Up / Swap button.
function pickRadius() { return PICK_R + (G ? G.P.magnet * 0.5 : 0); }
function updateNear() {
  const g = G, p = g.player, R = pickRadius();
  let best = null, bd = 1e9;
  for (let i = 0; i < g.items.length; i++) {
    const it = g.items[i]; if (it.kind !== 'weapon') continue;
    const d = Math.hypot(it.x - p.x, it.y - p.y);
    if (it.ignore) { if (d > R + 10) it.ignore = false; continue; }     // just-dropped weapons are ignored until the player steps away
    if (d <= R && d < bd) { bd = d; best = it; }
  }
  const cur = g.near;                                                    // hysteresis so the card does not flicker between two close weapons
  if (cur && !cur.ignore && g.items.indexOf(cur) >= 0) { const dc = Math.hypot(cur.x - p.x, cur.y - p.y); if (dc <= R + 8 && (!best || dc <= bd + 6)) best = cur; }
  g.near = best;
}
// Which slot a pickup goes to: a free slot if there is one, otherwise the requested slot (default: the active weapon)
function pickupSlot(req) {
  const p = G.player;
  if (!p.slots[0]) return 0; if (!p.slots[1]) return 1;
  return (req === 0 || req === 1) ? req : p.active;
}
function pickupNear(req) {
  const g = G; if (!g || state !== 'play' || !g.near) return false;
  const it = g.near, p = g.player, idx = g.items.indexOf(it); if (idx < 0) { g.near = null; return false; }
  const slot = pickupSlot(req), old = p.slots[slot];
  g.items.splice(idx, 1);
  p.slots[slot] = it.w; p.active = slot; p.cd = Math.max(p.cd, 0.1); g.found++;
  if (old) g.items.push({ kind: 'weapon', w: old, x: p.x, y: p.y, t: 0, vx: rnd(-60, 60), vy: rnd(-60, 60), ignore: true });
  g.near = null;
  showWeaponToast(it.w, old ? 'Swapped in' : 'Picked up');
  sfx('pickup', 600, 0.15, 'triangle', 0.06, 1.8);
  ring(p.x, p.y, 30, RARITIES[it.w.rarity].color, 0.4);
  burst(p.x, p.y, 10, RARITIES[it.w.rarity].color, 100, 3, 0.5);
  return true;
}

// ---------------------------------------------------------------- perks
function offerPerks() {
  const pool = PERKS.slice(); const offer = [];
  while (offer.length < 3) offer.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  G.perkOffer = offer; state = 'perk';
}
function takePerk(perk) {
  perk.apply(G.P, G); G.perksTaken.push(perk.id);
  G.perkOffer = null; state = 'play'; G.doorOpen = true;
  G.banner = { text: 'DOOR OPEN', t: 1.4 };
  sfx('perk', 500, 0.3, 'triangle', 0.07, 2);
}

// ---------------------------------------------------------------- run end
function endRun(won) {
  const g = G; if (g.over) return;
  g.over = true; g.won = won;
  best.runs++;
  g.newBest = [];
  if (won) best.wins++;
  const roomReached = won ? 6 : g.room;
  if (roomReached > best.bestRoom) { best.bestRoom = roomReached; g.newBest.push('room'); }
  if (g.kills > best.mostKills) { best.mostKills = g.kills; g.newBest.push('kills'); }
  if (Math.round(g.dmgDealt) > best.bestDmg) { best.bestDmg = Math.round(g.dmgDealt); g.newBest.push('dmg'); }
  if (won && (!best.bestTime || g.time < best.bestTime)) { best.bestTime = g.time; g.newBest.push('time'); }
  saveBest();
  g.endDelay = won ? 0 : 0.9;
  state = won ? 'win' : 'dying';
  if (won) { state = 'win'; }
  burst(g.player.x, g.player.y, 30, '#ff5a6e', 200, 3, 0.8);
}

// ---------------------------------------------------------------- update
function aliveEnemies() { let n = 0; for (let i = 0; i < G.enemies.length; i++) if (!G.enemies[i].dead) n++; return n; }

function update(dt) {
  const g = G;
  if (!g) return;
  if (state === 'dying') { g.endDelay -= dt; updateFx(dt); g.shake *= 0.9; if (g.endDelay <= 0) state = 'over'; return; }
  if (state !== 'play') return;
  g.time += dt;
  const p = g.player, P = g.P;

  // ---- input vector
  let mx = 0, my = 0;
  if (keys['a'] || keys['arrowleft']) mx -= 1; if (keys['d'] || keys['arrowright']) mx += 1;
  if (keys['w'] || keys['arrowup']) my -= 1; if (keys['s'] || keys['arrowdown']) my += 1;
  if (mx || my) { const l = Math.hypot(mx, my); mx /= l; my /= l; }
  if (joy.active) { mx = joy.mx; my = joy.my; }
  g.mvx = mx; g.mvy = my;

  // ---- timers / cooldowns
  p.iframes -= dt; p.dashCd -= dt; p.overdrive -= dt; p.cd -= dt; if (p.recoil) p.recoil = Math.max(0, p.recoil - dt * 30);
  p.slots.forEach(w => { if (w && w.spCd > 0) w.spCd -= dt; });
  for (let i = g.timers.length - 1; i >= 0; i--) { const t = g.timers[i]; t.t -= dt; if (t.t <= 0) { t.fn(); g.timers.splice(i, 1); } }
  g.fade = Math.max(0, g.fade - dt * 2.2);
  if (g.banner) { g.banner.t -= dt; if (g.banner.t <= 0) g.banner = null; }
  if (g.toast) { g.toast.t -= dt; if (g.toast.t <= 0) g.toast = null; }

  // ---- player movement
  if (p.dashT > 0) {
    p.dashT -= dt;
    p.x += p.dashDx * 430 * dt; p.y += p.dashDy * 430 * dt;
    if (Math.random() < 0.9) g.parts.push({ x: p.x, y: p.y, vx: 0, vy: 0, life: 0.25, max: 0.25, size: 8, color: 'rgba(143,227,255,0.5)', ghost: true });
  } else {
    const sp = 112 * (1 + P.spd);
    p.vx += (mx * sp - p.vx) * Math.min(1, dt * 14); p.vy += (my * sp - p.vy) * Math.min(1, dt * 14);
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (mx || my) { p.face = Math.atan2(my, mx); p.step += dt * 12; }
  }
  resolveCircle(p, p.r);

  // ---- targeting & auto fire
  p.tgtT -= dt;
  const w = p.slots[p.active];
  if (p.tgtT <= 0) {
    p.tgtT = 0.08;
    let best = null, bd = 1e9, bestLos = null, bld = 1e9;
    g.enemies.forEach(e => {
      if (e.dead || e.spawnT > 0) return;
      const d = dist(e, p); if (d < bd) { bd = d; best = e; }
      if (d < bld && los(p, e)) { bld = d; bestLos = e; }
    });
    p.target = bestLos || best; p.targetLos = !!bestLos;
  }
  const tgt = p.target && !p.target.dead ? p.target : null;
  if (tgt) { const want = Math.atan2(tgt.y - p.y, tgt.x - p.x); let d = want - p.aim; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; p.aim += d * Math.min(1, dt * 22); }
  else if (mx || my) p.aim = p.face;
  if (w && tgt && p.cd <= 0 && p.dashT <= 0 && (p.targetLos || w.fx.ricochet) && dist(tgt, p) < weaponRange(w)) {
    fireWeapon(w, p.aim);
    p.cd = 1 / (w.rate * (1 + P.fireRate) * (p.overdrive > 0 ? 2 : 1));
  }

  // ---- room logic
  if (g.room === BOSS_ROOM) updateBoss(dt);
  g.enemies.forEach(e => updateEnemy(e, dt));
  for (let i = g.enemies.length - 1; i >= 0; i--) if (g.enemies[i].dead) g.enemies.splice(i, 1);
  separate();
  updateBullets(dt);
  updateEnemyBullets(dt);
  updatePatches(dt);
  updateItems(dt);
  updateFx(dt);

  if (g.roomState === 'fight' && aliveEnemies() === 0) {
    if (g.room === BOSS_ROOM) { if (g.endT > 0) { g.endT -= dt; if (g.endT <= 0) endRun(true); } }
    else if (g.waveIdx < g.waves.length) { g.pending += dt; if (g.pending > 0.7) { g.pending = 0; spawnWave(); g.banner = { text: 'WAVE ' + g.waveIdx + ' / ' + g.waves.length, t: 1 }; } }
    else roomCleared();
  }
  if (g.roomState === 'clear') {
    g.clearT -= dt;
    if (g.clearT <= 0 && !g.doorOpen && state === 'play' && !g.perkOffer && !g.perkDone) { g.perkDone = true; offerPerks(); }
    if (g.doorOpen) {
      const cx = ARENA.x + ARENA.w / 2;
      if (p.y < ARENA.y + 16 && Math.abs(p.x - cx) < 30) startRoom(g.room + 1);
    }
  }
}

function roomCleared() {
  const g = G;
  g.roomState = 'clear'; g.clearT = 0.9; g.perkDone = false;
  const c = freeSpot(0, 16); c.x = ARENA.x + ARENA.w / 2; c.y = ARENA.y + ARENA.h * 0.42;
  // keep chest out of pillars
  if (wallAt(c.x, c.y, 14)) { const s = freeSpot(40, 16); c.x = s.x; c.y = s.y; }
  g.chests.push({ x: c.x, y: c.y, open: false, t: 0 });
  const p = g.player; p.hp = Math.min(g.P.maxHp, p.hp + 8);
  g.banner = { text: 'ROOM CLEARED', t: 1.5 };
  sfx('clear', 520, 0.4, 'triangle', 0.07, 2.2);
  g.ebullets.length = 0;
}

function separate() {
  const E = G.enemies;
  for (let i = 0; i < E.length; i++) for (let j = i + 1; j < E.length; j++) {
    const a = E[i], b = E[j]; const dx = b.x - a.x, dy = b.y - a.y, rr = a.r + b.r;
    const d2 = dx * dx + dy * dy;
    if (d2 < rr * rr && d2 > 0.01) { const d = Math.sqrt(d2), push = (rr - d) * 0.5; const nx = dx / d, ny = dy / d;
      const am = a.boss ? 0 : 1, bm = b.boss ? 0 : 1;
      a.x -= nx * push * am; a.y -= ny * push * am; b.x += nx * push * bm; b.y += ny * push * bm; }
  }
}

function updateEnemy(e, dt) {
  const g = G, p = g.player, T = ENEMY_TYPES[e.type];
  if (e.dead) return;
  if (e.spawnT > 0) { e.spawnT -= dt; return; }
  e.hitT -= dt; e.cd -= dt;
  if (e.burn > 0) { e.burn -= dt; e.burnTick -= dt; if (e.burnTick <= 0) { e.burnTick = 0.4; dealDamage(e, e.burnDps * 0.4, false, '#ff9a3c'); } if (Math.random() < 0.3) burst(e.x, e.y - 2, 1, '#ff9a3c', 30, 2, 0.4); }
  if (e.slow > 0) e.slow -= dt;
  const slow = e.slow > 0 ? 0.5 : 1;
  const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
  let mvx = 0, mvy = 0;
  e.wob += dt * 3;
  switch (e.type) {
    case 'chaser': mvx = ux * e.speed; mvy = uy * e.speed; break;
    case 'swarm': mvx = (ux + Math.cos(e.wob * 2) * 0.5) * e.speed; mvy = (uy + Math.sin(e.wob * 2) * 0.5) * e.speed; break;
    case 'shooter': {
      e.age = (e.age || 0) + dt; e.losT = (e.losT || 0) - dt;
      if (e.losT <= 0) { e.losT = 0.25; e.seen = los(e, p); }
      const pref = Math.max(70, 150 - e.age * 3); let k = !e.seen ? 1 : d > pref + 25 ? 1 : d < pref - 35 ? -1 : 0;
      mvx = ux * k * e.speed + -uy * Math.sin(e.wob * 0.7) * e.speed * 0.6; mvy = uy * k * e.speed + ux * Math.sin(e.wob * 0.7) * e.speed * 0.6;
      e.atk -= dt;
      if (e.atk <= 0.35 && e.atk > 0) e.warn = true; else e.warn = false;
      if (e.atk <= 0) { e.atk = rnd(1.7, 2.4); const a = Math.atan2(dy, dx); if (e.seen)
        enemyShot(e.x, e.y, a, 170, e.dmg + 3, 4, '#ffa63d'); }
      break; }
    case 'tank':
      if (e.state === 0) { mvx = ux * e.speed; mvy = uy * e.speed; e.atk -= dt; if (e.atk <= 0 && d < 220) { e.state = 1; e.st = 0.7; e.ang = Math.atan2(dy, dx); } }
      else if (e.state === 1) { e.st -= dt; e.warn = true; if (e.st <= 0) { e.state = 2; e.st = 0.55; e.warn = false; } }
      else { e.st -= dt; mvx = Math.cos(e.ang) * 240; mvy = Math.sin(e.ang) * 240; if (e.st <= 0) { e.state = 0; e.atk = rnd(3, 4.5); } }
      break;
    case 'boss': mvx = mvy = 0; break;
  }
  e.vx *= Math.pow(0.02, dt); e.vy *= Math.pow(0.02, dt);
  if (e.sideT > 0 && e.type !== 'boss') { e.sideT -= dt; const m = Math.hypot(mvx, mvy); if (m > 0) { const ux2 = mvx / m, uy2 = mvy / m; mvx += -uy2 * e.side * e.speed * 1.1; mvy += ux2 * e.side * e.speed * 1.1; } }
  e.x += (mvx * slow + e.vx) * dt; e.y += (mvy * slow + e.vy) * dt;
  const hit = resolveCircle(e, e.r);
  if (hit && !(e.sideT > 0)) { e.sideT = 0.7; e.side = Math.random() < 0.5 ? -1 : 1; }
  if (hit && e.state === 2) { e.state = 0; e.atk = 3; shake(3); }
  // contact damage
  if (e.cd <= 0 && (e.type !== 'boss' || true) && d < e.r + p.r - 1 && e.spawnT <= 0) {
    hurtPlayer(e.dmg, e.x, e.y); e.cd = e.type === 'swarm' ? 0.7 : 0.9;
    if (p.iframes > 0 || true) { /* knockback */ p.vx += ux * 200; p.vy += uy * 200; if (e.type === 'tank' && e.state === 2) { e.state = 0; e.atk = 3; } }
  }
}
function enemyShot(x, y, a, sp, dmg, r, color) {
  G.ebullets.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, dmg, r: r || 4, color: color || '#ff6a6a', life: 5 });
  sfx('eshot', 300, 0.08, 'square', 0.02, 0.6);
}
function updateEnemyBullets(dt) {
  const g = G, p = g.player;
  for (let i = g.ebullets.length - 1; i >= 0; i--) {
    const b = g.ebullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if (b.life <= 0 || wallAt(b.x, b.y, 1)) { burst(b.x, b.y, 2, b.color, 50, 2, 0.2); g.ebullets.splice(i, 1); continue; }
    const rr = b.r + p.r - 2;
    if ((b.x - p.x) * (b.x - p.x) + (b.y - p.y) * (b.y - p.y) < rr * rr) {
      if (p.dashT <= 0 && p.iframes <= 0) { hurtPlayer(b.dmg); g.ebullets.splice(i, 1); }
    }
  }
}
function updatePatches(dt) {
  const g = G;
  for (let i = g.patches.length - 1; i >= 0; i--) {
    const f = g.patches[i]; f.life -= dt; f.tick -= dt;
    if (f.life <= 0) { g.patches.splice(i, 1); continue; }
    if (f.tick <= 0) { f.tick = 0.3; g.enemies.forEach(e => { if (!e.dead && e.spawnT <= 0 && Math.hypot(e.x - f.x, e.y - f.y) < f.r + e.r) { dealDamage(e, f.dmg, false, '#ff9a3c'); igniteEnemy(e, f.dmg * 3); } }); }
  }
}
function updateItems(dt) {
  const g = G, p = g.player, R = 20 + g.P.magnet;
  for (let i = g.items.length - 1; i >= 0; i--) {
    const it = g.items[i]; it.t += dt;
    if (it.vx || it.vy) { it.x += it.vx * dt; it.y += it.vy * dt; it.vx *= Math.pow(0.02, dt); it.vy *= Math.pow(0.02, dt); const q = { x: it.x, y: it.y }; resolveCircle(q, 8); it.x = q.x; it.y = q.y; }
    const d = Math.hypot(it.x - p.x, it.y - p.y);
    if (it.kind === 'heart' && d < R + 8) { p.hp = Math.min(g.P.maxHp, p.hp + 12); addNum(p.x, p.y - 16, '+12', '#6bff8a', 13); sfx('heal', 700, 0.12, 'sine', 0.05, 1.5); g.items.splice(i, 1); }
  }
  updateNear();
  g.chests.forEach(c => {
    c.t += dt;
    if (!c.open && Math.hypot(c.x - p.x, c.y - p.y) < 26) {
      c.open = true; c.t = 0;
      ring(c.x, c.y, 50, '#ffe066', 0.5); burst(c.x, c.y, 24, '#ffe066', 180, 3, 0.7); shake(3); sfx('chest', 330, 0.3, 'triangle', 0.07, 2.5);
      const n = g.room >= 4 ? 2 : 1;
      for (let k = 0; k < n; k++) dropWeapon(c.x, c.y, k === 0 ? 1 : 0);
    }
  });
}
function updateFx(dt) {
  const g = G;
  for (let i = g.parts.length - 1; i >= 0; i--) {
    const q = g.parts[i]; q.life -= dt; if (q.life <= 0) { g.parts.splice(i, 1); continue; }
    q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= Math.pow(0.1, dt); q.vy *= Math.pow(0.1, dt);
  }
  for (let i = g.nums.length - 1; i >= 0; i--) { const n = g.nums[i]; n.life -= dt; n.y -= 28 * dt; if (n.life <= 0) g.nums.splice(i, 1); }
  for (let i = g.fx.length - 1; i >= 0; i--) { const f = g.fx[i]; f.life -= dt; if (f.life <= 0) g.fx.splice(i, 1); }
  g.shake *= Math.pow(0.003, dt); if (g.shake < 0.2) g.shake = 0;
  g.flash = Math.max(0, g.flash - dt);
}

// ---------------------------------------------------------------- boss
function updateBoss(dt) {
  const g = G, e = g.boss, p = g.player;
  if (!e || e.dead || e.spawnT > 0) return;
  const hpf = e.hp / e.max;
  if (hpf < 0.5 && e.phase === 1) { e.phase = 2; g.banner = { text: 'THE WARDEN IS ENRAGED', t: 1.6 }; shake(10); ring(e.x, e.y, 120, '#ff3355', 0.6);
    for (let i = 0; i < 4; i++) { const s = freeSpot(100, 10); addEnemy('chaser', s.x, s.y, 1.3); } }
  const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
  const spd = e.phase === 2 ? 1.35 : 1;
  e.atk -= dt;
  if (e.state === 0) {
    e.x += dx / d * 28 * spd * dt * (e.slow > 0 ? 0.5 : 1); e.y += dy / d * 28 * spd * dt * (e.slow > 0 ? 0.5 : 1);
    if (e.atk <= 0) {
      e.pat = (e.pat + 1) % 4;
      if (e.pat === 0) { e.state = 1; e.st = 2.2; e.sp = 0; }                        // spiral
      else if (e.pat === 1) { e.state = 2; e.st = 0.8; }                              // ring bursts
      else if (e.pat === 2) { e.state = 3; e.st = 0.7; e.ang = Math.atan2(dy, dx); e.warn = true; }  // charge
      else { for (let k = 0; k < 3; k++) g.timers.push({ t: k * 0.25, fn: () => { if (e.dead) return; const a = Math.atan2(g.player.y - e.y, g.player.x - e.x); for (let s = -2; s <= 2; s++) enemyShot(e.x, e.y, a + s * 0.16, 190, 10, 5, '#ff4466'); } }); e.atk = 2.2 / spd; }
    }
  } else if (e.state === 1) {
    e.st -= dt; e.sp -= dt;
    if (e.sp <= 0) { e.sp = 0.07 / spd; e.ang += 0.55; enemyShot(e.x, e.y, e.ang, 150, 8, 4, '#ff4466'); if (e.phase === 2) enemyShot(e.x, e.y, e.ang + Math.PI, 150, 8, 4, '#ff4466'); }
    if (e.st <= 0) { e.state = 0; e.atk = 1.6 / spd; }
  } else if (e.state === 2) {
    e.st -= dt;
    if (e.st <= 0) { const n = e.phase === 2 ? 22 : 16, off = rnd(0, TAU);
      for (let k = 0; k < n; k++) enemyShot(e.x, e.y, off + k / n * TAU, 140, 9, 5, '#ff7a3c');
      ring(e.x, e.y, 60, '#ff7a3c', 0.4); shake(4);
      if (!e.again) { e.again = true; e.st = 0.55; } else { e.again = false; e.state = 0; e.atk = 1.5 / spd; } }
  } else if (e.state === 3) {
    e.st -= dt;
    if (e.warn && e.st <= 0) { e.warn = false; e.st = 0.6; e.charge = true; }
    else if (e.charge) {
      e.x += Math.cos(e.ang) * 330 * spd * dt; e.y += Math.sin(e.ang) * 330 * spd * dt;
      const q = { x: e.x, y: e.y }; if (resolveCircle(q, e.r) && (Math.abs(q.x - e.x) > 0.1 || Math.abs(q.y - e.y) > 0.1)) { e.st = 0; shake(8); for (let k = 0; k < 10; k++) enemyShot(e.x, e.y, k / 10 * TAU, 160, 8, 4, '#ff4466'); }
      e.x = q.x; e.y = q.y;
      if (e.st <= 0) { e.charge = false; e.state = 0; e.atk = 1.2 / spd; }
    }
  }
}

// ---------------------------------------------------------------- input
function toLogical(ev) { return { x: (ev.clientX - offX) / scale, y: (ev.clientY - offY) / scale }; }
function layout() {
  const L = {};
  if (land) {
    const rx = LW - SA.r, by = LH - SA.b;
    L.pause = { x: rx - 36, y: SA.t + 7, w: 28, h: 28 };
    const sw = 150, sx1 = L.pause.x - 10 - sw;
    L.slot = [{ x: sx1 - 6 - sw, y: SA.t + 5, w: sw, h: 34 }, { x: sx1, y: SA.t + 5, w: sw, h: 34 }];
    L.dash = { x: rx - 52, y: by - 52, r: 40 };
    L.spec = { x: rx - 130, y: by - 36, r: 32 };
    const bx = rx - 160, bw = 152, low = L.dash.y - L.dash.r - 10;
    L.pickBox = { single: { x: bx, y: low - 54, w: bw, h: 54 }, swap: [{ x: bx, y: low - 46 - 52, w: bw, h: 46 }, { x: bx, y: low - 46, w: bw, h: 46 }] };
  } else {
    L.pause = { x: LW - 36 - SA.r, y: 8 + SA.t, w: 28, h: 28 };
    L.slot = [{ x: 12 + SA.l, y: LH - 164 - SA.b, w: 164, h: 40 }, { x: LW - 176 - SA.r, y: LH - 164 - SA.b, w: 164, h: 40 }];
    L.dash = { x: LW - 58 - SA.r, y: LH - 62 - SA.b, r: 40 };
    L.spec = { x: LW - 142 - SA.r, y: LH - 48 - SA.b, r: 32 };
    const bot = ARENA.y + ARENA.h - 6, right = LW - SA.r - 12;
    L.pickBox = { single: { x: right - 184, y: bot - 50, w: 184, h: 50 }, swap: [{ x: right - 184, y: bot - 50, w: 88, h: 50 }, { x: right - 88, y: bot - 50, w: 88, h: 50 }] };
  }
  // pickup buttons only exist while a floor weapon is in range
  if (G && state === 'play' && G.near) {
    const full = G.player.slots[0] && G.player.slots[1];
    if (full) L.swap = L.pickBox.swap; else L.pick = L.pickBox.single;
  }
  return L;
}
const inR = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
const inC = (p, c, pad) => Math.hypot(p.x - c.x, p.y - c.y) <= c.r + (pad || 0);

cv.addEventListener('pointerdown', ev => {
  ev.preventDefault();
  try { cv.focus(); if (audio && audio.state === 'suspended') audio.resume(); } catch (e) { /* ignore */ }
  const p = toLogical(ev);
  for (let i = hot.length - 1; i >= 0; i--) { if (inR(p, hot[i])) { hot[i].fn(); return; } }
  if (state !== 'play') return;
  const L = layout();
  if (L.pick && inR(p, L.pick)) { pickupNear(); return; }
  if (L.swap) for (let i = 0; i < 2; i++) if (inR(p, L.swap[i])) { pickupNear(i); return; }
  if (inR(p, L.pause)) { state = 'pause'; return; }
  if (inR(p, L.slot[0])) { swapWeapon(0); return; }
  if (inR(p, L.slot[1])) { swapWeapon(1); return; }
  if (inC(p, L.dash, 8)) { doDash(); return; }
  if (inC(p, L.spec, 8)) { useSpecial(); return; }
  if (!joy.active && p.y > ARENA.y && !(land && p.x > ARENA.x + ARENA.w)) {
    joy.active = true; joy.id = ev.pointerId; joy.ox = joy.x = p.x; joy.oy = joy.y = p.y; joy.mx = joy.my = 0;
    try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
  }
}, { passive: false });
cv.addEventListener('pointermove', ev => {
  if (!joy.active || ev.pointerId !== joy.id) return;
  ev.preventDefault();
  const p = toLogical(ev); let dx = p.x - joy.ox, dy = p.y - joy.oy; const d = Math.hypot(dx, dy), R = 46;
  if (d > R) { // drag the base along so the thumb never leaves it
    joy.ox += dx / d * (d - R); joy.oy += dy / d * (d - R); dx = p.x - joy.ox; dy = p.y - joy.oy;
  }
  joy.x = p.x; joy.y = p.y;
  const m = Math.hypot(dx, dy);
  if (m < 6) { joy.mx = joy.my = 0; } else { const k = Math.min(1, (m - 6) / (R - 6)); joy.mx = dx / m * k; joy.my = dy / m * k; }
}, { passive: false });
function endJoy(ev) { if (joy.active && ev.pointerId === joy.id) { joy.active = false; joy.mx = joy.my = 0; joy.id = null; } }
cv.addEventListener('pointerup', endJoy); cv.addEventListener('pointercancel', endJoy); cv.addEventListener('lostpointercapture', endJoy);
['touchstart', 'touchmove', 'touchend'].forEach(n => document.addEventListener(n, e => { e.preventDefault(); }, { passive: false }));
['gesturestart', 'gesturechange', 'gestureend', 'contextmenu', 'dblclick'].forEach(n => document.addEventListener(n, e => e.preventDefault()));
window.addEventListener('wheel', e => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });

window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].indexOf(k) >= 0) e.preventDefault();
  if (e.repeat) { keys[k] = true; return; }
  keys[k] = true;
  if (state === 'play') {
    if (k === ' ' || k === 'shift') doDash();
    else if (k === 'q') useSpecial();
    else if (k === 'e') pickupNear();
    else if (k === '1') swapWeapon(0); else if (k === '2') swapWeapon(1); else if (k === 'tab') { e.preventDefault(); swapWeapon(); }
    else if (k === 'escape' || k === 'p') state = 'pause';
  } else if (state === 'pause') { if (k === 'escape' || k === 'p') state = 'play'; }
  else if (state === 'perk' && G.perkOffer) { const i = '123'.indexOf(k); if (i >= 0) takePerk(G.perkOffer[i]); }
  else if (state === 'menu' && (k === 'enter' || k === ' ')) newRun();
  else if ((state === 'over' || state === 'win') && (k === 'enter' || k === ' ')) newRun();
});
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; if (state === 'play') state = 'pause'; });
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') state = 'pause'; });

// ---------------------------------------------------------------- rendering helpers
function txt(s, x, y, size, color, align, weight, stroke) {
  ctx.font = (weight || '700') + ' ' + size + 'px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
  ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle';
  if (stroke !== false) { ctx.lineWidth = Math.max(2, size / 4); ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineJoin = 'round'; ctx.strokeText(s, x, y); }
  ctx.fillStyle = color || '#fff'; ctx.fillText(s, x, y);
}
function fitTxt(s, x, y, maxW, size, color, align, weight) {
  ctx.font = (weight || '700') + ' ' + size + 'px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
  const w = ctx.measureText(s).width; if (w > maxW) size = Math.max(7, size * maxW / w);
  txt(s, x, y, size, color, align, weight);
}
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function glow(x, y, r, color, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = a; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
}
function button(x, y, w, h, label, fn, color, size) {
  hot.push({ x, y: y + hotOff, w, h, fn });
  rr(x, y, w, h, 10); ctx.fillStyle = color || '#1f6f5f'; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.stroke();
  txt(label, x + w / 2, y + h / 2 + 1, size || 18, '#fff', 'center');
}
function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'; }

function drawGun(type, x, y, ang, s, color) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.scale(s, s);
  ctx.fillStyle = '#222'; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1;
  const body = (bx, by, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(bx, by, w, h); };
  switch (type) {
    case 'pistol': body(0, -2, 13, 4, '#3b3f4a'); body(0, -2, 4, 7, '#2a2d36'); body(10, -2.5, 4, 2, color); break;
    case 'shotgun': body(0, -2.5, 20, 5, '#4a3f36'); body(8, -2, 14, 2, color); body(8, 0.5, 14, 2, color); break;
    case 'smg': body(0, -2.5, 16, 5, '#2e3a36'); body(4, 2, 4, 6, '#222'); body(14, -1.5, 5, 3, color); break;
    case 'sniper': body(0, -2, 26, 3.5, '#33404f'); body(6, -4.5, 7, 2.5, color); body(22, -1.2, 8, 1.6, color); break;
    case 'crossbow': body(0, -1.5, 14, 3, '#5a4630'); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(10, -8); ctx.lineTo(12, 0); ctx.lineTo(10, 8); ctx.stroke(); body(10, -0.8, 8, 1.6, color); break;
    case 'launcher': body(0, -3.5, 20, 7, '#4a4f3a'); body(17, -4.5, 5, 9, color); body(3, 3, 5, 5, '#222'); break;
  }
  ctx.restore();
}

// ---------------------------------------------------------------- rendering: world
function drawWorld() {
  const g = G, p = g.player, t = performance.now() / 1000;
  ctx.drawImage(g.floor, 0, 0, LW, LH);
  // door
  const cx = ARENA.x + ARENA.w / 2;
  if (g.doorOpen) {
    glow(cx, ARENA.y + 2, 46, '#5ff0d0', 0.55 + Math.sin(t * 5) * 0.15);
    ctx.fillStyle = '#0b0d14'; ctx.fillRect(cx - 24, ARENA.y - 6, 48, 10);
    ctx.fillStyle = '#5ff0d0'; ctx.fillRect(cx - 24, ARENA.y - 6, 4, 10); ctx.fillRect(cx + 20, ARENA.y - 6, 4, 10);
    txt('▲', cx, ARENA.y + 14 + Math.sin(t * 6) * 3, 14, '#5ff0d0', 'center');
  } else {
    ctx.fillStyle = '#2a0f16'; ctx.fillRect(cx - 24, ARENA.y - 4, 48, 6);
    ctx.fillStyle = '#c93a52'; for (let i = 0; i < 5; i++) ctx.fillRect(cx - 22 + i * 10, ARENA.y - 4, 3, 6);
  }
  // fire patches
  g.patches.forEach(f => { const a = clamp(f.life / f.max, 0, 1); glow(f.x, f.y, f.r * 1.6, '#ff7a1a', 0.75 * a); glow(f.x, f.y - 2 + Math.sin(t * 20 + f.x) * 1.5, f.r * 0.7, '#ffd24a', 0.7 * a); });
  // chests
  g.chests.forEach(c => {
    const o = c.open;
    glow(c.x, c.y, 34, '#ffe066', o ? 0.12 : 0.4 + Math.sin(t * 4) * 0.1);
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(c.x, c.y + 11, 15, 5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = o ? '#6b4a1f' : '#a8742a'; rr(c.x - 14, c.y - 6, 28, 17, 3); ctx.fill();
    ctx.fillStyle = o ? '#3a2810' : '#c8902f'; rr(c.x - 14, o ? c.y - 14 : c.y - 11, 28, o ? 6 : 8, 3); ctx.fill();
    ctx.fillStyle = '#ffe066'; ctx.fillRect(c.x - 3, c.y - 4, 6, 6);
  });
  // items
  g.items.forEach(it => {
    const bob = Math.sin(t * 4 + it.x) * 2;
    if (it.kind === 'heart') { glow(it.x, it.y, 16, '#6bff8a', 0.5); txt('+', it.x, it.y + bob, 18, '#6bff8a', 'center'); return; }
    const R = RARITIES[it.w.rarity], col = R.color;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(it.x, it.y + 9, 11, 4, 0, 0, TAU); ctx.fill();
    if (it.w.rarity > 0) { const gr = ctx.createLinearGradient(0, it.y - 70, 0, it.y); gr.addColorStop(0, hexA(col, 0)); gr.addColorStop(1, hexA(col, 0.4 + it.w.rarity * 0.08)); ctx.fillStyle = gr; ctx.fillRect(it.x - 6 - it.w.rarity, it.y - 70, 12 + it.w.rarity * 2, 70); }
    glow(it.x, it.y, 22 + it.w.rarity * 3 + Math.sin(t * 5) * 2, col, 0.55 + it.w.rarity * 0.1);
    drawGun(it.w.type, it.x - 6, it.y + bob, -0.35, 1.0, col);
    if (it === g.near) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.globalAlpha = 0.6 + Math.sin(t * 8) * 0.3;
      ctx.beginPath(); ctx.arc(it.x, it.y + 2, 17 + Math.sin(t * 6) * 1.5, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
    }
  });
  // enemies
  g.enemies.forEach(e => drawEnemy(e, t));
  // enemy bullets
  g.ebullets.forEach(b => { glow(b.x, b.y, b.r * 2.6, b.color, 0.55); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.55, 0, TAU); ctx.fill(); ctx.fillStyle = b.color; ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.globalAlpha = 0.7; ctx.fill(); ctx.globalAlpha = 1; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.5, 0, TAU); ctx.fill(); });
  // player bullets
  g.bullets.forEach(b => {
    if (b.stuck) { ctx.fillStyle = '#ff9a3c'; ctx.beginPath(); ctx.arc(b.x, b.y, 3 + (Math.sin(t * 30) + 1) * 1.2, 0, TAU); ctx.fill(); return; }
    const a = Math.atan2(b.vy, b.vx), len = Math.min(18, 5 + Math.hypot(b.vx, b.vy) * 0.018);
    ctx.strokeStyle = b.color; ctx.lineCap = 'round'; ctx.globalAlpha = 0.35; ctx.lineWidth = b.size * 2.6;
    ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - Math.cos(a) * len, b.y - Math.sin(a) * len); ctx.stroke();
    ctx.globalAlpha = 1; ctx.lineWidth = b.size * 1.4; ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - Math.cos(a) * len * 0.6, b.y - Math.sin(a) * len * 0.6); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(b.x, b.y, b.size * 0.8, 0, TAU); ctx.fill();
  });
  // player
  drawPlayer(t);
  // particles
  g.parts.forEach(q => {
    const a = clamp(q.life / q.max, 0, 1);
    if (q.ghost) { ctx.globalAlpha = a * 0.5; ctx.fillStyle = '#8fe3ff'; ctx.beginPath(); ctx.arc(q.x, q.y, 8 * a + 2, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; return; }
    ctx.globalAlpha = a; ctx.fillStyle = q.color; ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
  });
  ctx.globalAlpha = 1;
  g.fx.forEach(f => {
    const k = 1 - f.life / f.m;
    if (f.t === 'ring') { ctx.strokeStyle = f.color; ctx.globalAlpha = 1 - k; ctx.lineWidth = 3 * (1 - k) + 1; ctx.beginPath(); ctx.arc(f.x, f.y, 4 + (f.max - 4) * k, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; }
    else if (f.t === 'bolt') {
      ctx.strokeStyle = '#bfe8ff'; ctx.lineWidth = 2.5; ctx.globalAlpha = f.life / f.m; ctx.beginPath(); ctx.moveTo(f.x1, f.y1);
      const n = 5; for (let i = 1; i < n; i++) { const u = i / n; ctx.lineTo(f.x1 + (f.x2 - f.x1) * u + rnd(-6, 6), f.y1 + (f.y2 - f.y1) * u + rnd(-6, 6)); }
      ctx.lineTo(f.x2, f.y2); ctx.stroke(); ctx.globalAlpha = 1;
    }
  });
  // damage numbers
  g.nums.forEach(n => { ctx.globalAlpha = clamp(n.life / n.max * 1.6, 0, 1); txt(n.text, n.x, n.y, n.size, n.color, 'center', '800'); });
  ctx.globalAlpha = 1;
}

function drawEnemy(e, t) {
  const T = ENEMY_TYPES[e.type];
  ctx.save(); ctx.translate(e.x, e.y);
  if (e.spawnT > 0) {
    const k = clamp(1 - e.spawnT / (e.boss ? 1.4 : 0.75), 0, 1);
    ctx.strokeStyle = T.color; ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 20); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, e.r * (1.8 - k * 0.8), 0, TAU); ctx.stroke(); ctx.globalAlpha = 0.25 + k * 0.4; ctx.fillStyle = T.color; ctx.beginPath(); ctx.arc(0, 0, e.r * k, 0, TAU); ctx.fill(); ctx.restore(); ctx.globalAlpha = 1; return;
  }
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(0, e.r * 0.8, e.r * 0.95, e.r * 0.4, 0, 0, TAU); ctx.fill();
  const flash = e.hitT > 0; const col = flash ? '#ffffff' : T.color;
  const p = G.player; const fa = Math.atan2(p.y - e.y, p.x - e.x);
  if (e.warn && Math.floor(t * 16) % 2 === 0) glow(0, 0, e.r * 2.4, '#ff3355', 0.8);
  switch (e.type) {
    case 'chaser': {
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, e.r, 0, TAU); ctx.fill();
      ctx.fillStyle = flash ? '#fff' : '#8a1d1d'; for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + t * 2; ctx.beginPath(); ctx.arc(Math.cos(a) * e.r, Math.sin(a) * e.r, 2.6, 0, TAU); ctx.fill(); }
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(Math.cos(fa) * 3 - 3, Math.sin(fa) * 3 - 2, 2.4, 0, TAU); ctx.arc(Math.cos(fa) * 3 + 3, Math.sin(fa) * 3 - 2, 2.4, 0, TAU); ctx.fill(); break; }
    case 'swarm': ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, e.r, 0, TAU); ctx.fill(); ctx.fillStyle = '#143d0e'; ctx.beginPath(); ctx.arc(Math.cos(fa) * 2, Math.sin(fa) * 2, 2, 0, TAU); ctx.fill(); break;
    case 'shooter': {
      ctx.rotate(fa); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(e.r + 3, 0); ctx.lineTo(0, e.r); ctx.lineTo(-e.r, 0); ctx.lineTo(0, -e.r); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#5a2d00'; ctx.fillRect(2, -2, e.r + 5, 4); ctx.fillStyle = '#fff'; ctx.fillRect(-3, -2, 4, 4); break; }
    case 'tank': {
      ctx.fillStyle = col; ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + Math.PI / 6; ctx.lineTo(Math.cos(a) * e.r, Math.sin(a) * e.r); } ctx.closePath(); ctx.fill();
      ctx.strokeStyle = flash ? '#fff' : '#53268f'; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = flash ? '#fff' : '#3a1a66'; ctx.beginPath(); ctx.arc(0, 0, e.r * 0.5, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffdd55'; ctx.beginPath(); ctx.arc(Math.cos(fa) * 4, Math.sin(fa) * 4, 3, 0, TAU); ctx.fill(); break; }
    case 'boss': {
      const pulse = 1 + Math.sin(t * 6) * 0.04;
      glow(0, 0, e.r * 2.3, e.phase === 2 ? '#ff2244' : '#aa2255', 0.5);
      ctx.fillStyle = col; ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + t * 0.5; const rr2 = e.r * pulse * (i % 2 ? 0.88 : 1.08); ctx.lineTo(Math.cos(a) * rr2, Math.sin(a) * rr2); } ctx.closePath(); ctx.fill();
      ctx.strokeStyle = flash ? '#fff' : '#ff8aa0'; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = flash ? '#fff' : '#2a0610'; ctx.beginPath(); ctx.arc(0, 0, e.r * 0.55, 0, TAU); ctx.fill();
      ctx.fillStyle = e.phase === 2 ? '#ff3355' : '#ffdd55'; ctx.beginPath(); ctx.arc(Math.cos(fa) * 7, Math.sin(fa) * 7, 7 + Math.sin(t * 8), 0, TAU); ctx.fill(); break; }
  }
  if (e.burn > 0) glow(0, -2, e.r * 1.5, '#ff7a1a', 0.5);
  if (e.slow > 0) { ctx.strokeStyle = '#8fe3ff'; ctx.lineWidth = 2; ctx.globalAlpha = 0.8; ctx.beginPath(); ctx.arc(0, 0, e.r + 3, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; }
  ctx.restore();
  if (!e.boss && (e.hp < e.max || e.type === 'tank')) {
    const w = Math.max(18, e.r * 2); const x = e.x - w / 2, y = e.y - e.r - 8;
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(x - 1, y - 1, w + 2, 5);
    ctx.fillStyle = e.hp / e.max > 0.5 ? '#6bff8a' : e.hp / e.max > 0.25 ? '#ffd24a' : '#ff5a5a'; ctx.fillRect(x, y, w * clamp(e.hp / e.max, 0, 1), 3);
  }
}

function drawPlayer(t) {
  const g = G, p = g.player;
  if (state === 'dying' || (g.over && !g.won)) return;
  const blink = p.iframes > 0 && p.dashT <= 0 && Math.floor(t * 20) % 2 === 0;
  ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(p.x, p.y + 8, 10, 4, 0, 0, TAU); ctx.fill();
  if (blink) ctx.globalAlpha = 0.45;
  const w = p.slots[p.active], col = w ? RARITIES[w.rarity].color : '#fff';
  if (w && w.rarity > 0) glow(p.x, p.y, 26, col, 0.3);
  if (p.overdrive > 0) glow(p.x, p.y, 30, '#9dffb0', 0.35);
  ctx.fillStyle = '#27d6c0'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#0c6a5f'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#0c3d42'; ctx.beginPath(); ctx.arc(p.x + Math.cos(p.aim) * 3, p.y + Math.sin(p.aim) * 3, 4.5, 0, TAU); ctx.fill();
  if (w) drawGun(w.type, p.x + Math.cos(p.aim) * (5 - (p.recoil || 0) * 0.4), p.y + Math.sin(p.aim) * (5 - (p.recoil || 0) * 0.4), p.aim, 1, col);
  ctx.globalAlpha = 1;
  if (g.target || p.target) { const tg = p.target; if (tg && !tg.dead && p.targetLos) { ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 1; ctx.setLineDash([3, 5]); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(tg.x, tg.y); ctx.stroke(); ctx.setLineDash([]); } }
}

// ---------------------------------------------------------------- rendering: HUD
function drawSlot(i, s, ws, act, tiny) {
  rr(s.x, s.y, s.w, s.h, 9); ctx.fillStyle = act ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.5)'; ctx.fill();
  ctx.lineWidth = act ? 2.5 : 1.5; ctx.strokeStyle = ws ? RARITIES[ws.rarity].color : 'rgba(255,255,255,0.25)'; ctx.globalAlpha = act ? 1 : 0.6; ctx.stroke(); ctx.globalAlpha = 1;
  if (ws) {
    drawGun(ws.type, s.x + 12, s.y + s.h / 2 + 1, 0, tiny ? 0.8 : 0.9, RARITIES[ws.rarity].color);
    const adj = ws.afx.map(a => AFFIX_BY_ID[a].adj).join(' '), tn = WEAPON_TYPES[ws.type].name;
    fitTxt(adj || tn, s.x + 42, s.y + s.h * 0.35, s.w - 48, tiny ? 11 : 12, RARITIES[ws.rarity].color, 'left');
    fitTxt((adj ? tn + ' · ' : '') + 'DPS ' + Math.round(weaponDps(ws)), s.x + 42, s.y + s.h * 0.74, s.w - 48, tiny ? 9.5 : 10.5, '#b9c2d6', 'left', '600');
  } else txt('Empty slot', s.x + s.w / 2, s.y + s.h / 2, 12, '#7d869c', 'center', '600');
  txt(String(i + 1), s.x + s.w - 9, s.y + 9, 9, '#8a93ab', 'center', '700');
}
function drawPauseBtn(r) {
  rr(r.x, r.y, 28, 28, 7); ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.fillRect(r.x + 9, r.y + 8, 3.5, 12); ctx.fillRect(r.x + 15.5, r.y + 8, 3.5, 12);
}
function drawHud() {
  const g = G, p = g.player, P = g.P, L = layout(), t = performance.now() / 1000;
  const w = p.slots[p.active], hpf = clamp(p.hp / P.maxHp, 0, 1), hpCol = hpf > 0.5 ? '#2fcf6a' : hpf > 0.25 ? '#e0b030' : '#e0384e';
  const roomTxt = g.room === BOSS_ROOM ? 'BOSS' : 'ROOM ' + g.room + '/5';
  if (land) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, LW, SA.t + 44);
    const hx = SA.l + 8, hy = SA.t + 5, hw = 140;
    rr(hx, hy, hw, 18, 6); ctx.fillStyle = '#2a0f16'; ctx.fill();
    if (hpf > 0) { rr(hx, hy, Math.max(8, hw * hpf), 18, 6); ctx.fillStyle = hpCol; ctx.fill(); }
    rr(hx, hy, hw, 18, 6); ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
    txt('♥ ' + Math.ceil(Math.max(0, p.hp)) + ' / ' + P.maxHp, hx + hw / 2, hy + 9.5, 12, '#fff', 'center');
    txt(roomTxt + '  ·  Kills ' + g.kills, hx, SA.t + 33, 11.5, '#cfd6e6', 'left');
    txt(fmt(g.time), hx + hw + 12, SA.t + 14, 15, '#fff', 'left');
    drawPauseBtn(L.pause);
    L.slot.forEach((sl, i) => drawSlot(i, sl, p.slots[i], p.active === i, true));
    // side panel behind the thumb buttons (keeps the play area clear)
    const px = ARENA.x + ARENA.w + 4;
    ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fillRect(px, ARENA.y, LW - px - SA.r, ARENA.h);
    if (w && w.fx.cursed) txt('CURSED: +35% dmg taken', ARENA.x + 6, ARENA.y + 10, 10.5, '#ff6a8a', 'left', '700');
  } else {
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, LW, 58 + SA.t);
    ctx.save(); ctx.translate(0, SA.t);
    const hw = 150, hx = 12 + SA.l;
    rr(hx, 10, hw, 20, 6); ctx.fillStyle = '#2a0f16'; ctx.fill();
    if (hpf > 0) { rr(hx, 10, Math.max(8, hw * hpf), 20, 6); ctx.fillStyle = hpCol; ctx.fill(); }
    rr(hx, 10, hw, 20, 6); ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
    txt('♥ ' + Math.ceil(Math.max(0, p.hp)) + ' / ' + P.maxHp, hx + hw / 2, 20.5, 13, '#fff', 'center');
    txt(roomTxt, hx, 45, 13, '#cfd6e6', 'left');
    txt(fmt(g.time), hx + hw + 28, 20, 14, '#fff', 'center');
    txt('Kills ' + g.kills, hx + 96, 45, 13, '#cfd6e6', 'left');
    if (w && w.fx.cursed) txt('CURSED: +35% dmg taken', LW - 12 - SA.r, 45, 11, '#ff6a8a', 'right', '700');
    ctx.restore();
    drawPauseBtn(L.pause);
  }
  // boss bar
  if (g.boss && !g.boss.dead) {
    const e = g.boss, bw = ARENA.w - 20, bx = ARENA.x + 10, by = ARENA.y + 6;
    ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(bx - 1, by - 1, bw + 2, 12);
    ctx.fillStyle = e.phase === 2 ? '#ff2a4a' : '#d6264f'; ctx.fillRect(bx, by, bw * clamp(e.hp / e.max, 0, 1), 10);
    txt('THE WARDEN', ARENA.x + ARENA.w / 2, by + 5.5, 10, '#fff', 'center');
  }
  // banner
  if (g.banner && state === 'play') { const a = clamp(g.banner.t * 2, 0, 1); ctx.globalAlpha = a; txt(g.banner.text, ARENA.x + ARENA.w / 2, ARENA.y + ARENA.h * 0.3, 26, '#fff', 'center', '800'); ctx.globalAlpha = 1; }
  // floor weapon inspect card + pickup buttons (only while standing near a weapon), otherwise a short toast
  if (g.near) { drawFloorTip(g.near); drawPickButtons(L, t); }
  else if (g.toast && state === 'play') drawToast(g.toast);
  // slots (portrait; landscape draws them in the top bar)
  if (!land) L.slot.forEach((sl, i) => drawSlot(i, sl, p.slots[i], p.active === i, false));
  // dash + special buttons
  const dcd = clamp(p.dashCd / P.dashCd, 0, 1);
  circBtn(L.dash.x, L.dash.y, L.dash.r, '#1f9bd0', 'DASH', dcd, '⇢');
  const scd = w ? clamp(w.spCd / (w.spMax * P.specialCd), 0, 1) : 1;
  circBtn(L.spec.x, L.spec.y, L.spec.r, '#a04ad8', w ? WEAPON_TYPES[w.type].special.toUpperCase() : '-', scd, '★');
  // joystick
  const jh = land ? { x: ARENA.x + 74, y: ARENA.y + ARENA.h - 74 } : { x: 70, y: LH - 74 - SA.b };
  if (joy.active) {
    ctx.globalAlpha = 0.5; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath(); ctx.arc(joy.ox, joy.oy, 46, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.globalAlpha = 0.75; ctx.fillStyle = '#fff'; const kx = joy.ox + joy.mx * 40, ky = joy.oy + joy.my * 40; ctx.beginPath(); ctx.arc(kx, ky, 20, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
  } else if (g.time < 7 && g.room === 1) {
    ctx.globalAlpha = 0.45 + Math.sin(t * 4) * 0.15; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(jh.x, jh.y, 40, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(jh.x + Math.sin(t * 2) * 14, jh.y + Math.cos(t * 2) * 10, 16, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill(); ctx.globalAlpha = 1;
    txt('Drag anywhere to move', jh.x, land ? jh.y - 54 : jh.y + 50, 11, '#cfd6e6', 'center', '600');
    txt('Auto-aim & auto-fire', jh.x, land ? jh.y + 56 : jh.y + 64, 11, '#cfd6e6', 'center', '600');
  } else if (land) {
    ctx.globalAlpha = 0.16; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(jh.x, jh.y, 40, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(jh.x, jh.y, 16, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fill(); ctx.globalAlpha = 1;
  }
  if (g.flash > 0) { ctx.fillStyle = 'rgba(255,40,70,' + (g.flash * 0.9).toFixed(2) + ')'; ctx.fillRect(0, 0, LW, LH); }
  if (p.hp / P.maxHp < 0.3 && p.hp > 0) { ctx.strokeStyle = 'rgba(255,40,70,' + (0.25 + Math.sin(t * 6) * 0.15).toFixed(2) + ')'; ctx.lineWidth = 10; ctx.strokeRect(0, 0, LW, LH); }
}

// ---- floor weapon inspect card with stat deltas vs. equipped weapons
const GOOD = '#6bff8a', BAD = '#ff6a7a', NEUT = '#8f98ad';
const STAT_DEFS = [
  { label: 'Damage', get: w => w.dmg * w.pellets, fmt: (v, w) => Math.round(v) + (w.pellets > 1 ? ' (' + w.pellets + '×' + w.dmg.toFixed(0) + ')' : ''), eps: 0.5, dfmt: d => Math.round(Math.abs(d)) },
  { label: 'Fire rate', get: w => w.rate, fmt: v => v.toFixed(1) + '/s', eps: 0.05, dfmt: d => Math.abs(d).toFixed(1) },
  { label: 'DPS', get: w => weaponDps(w), fmt: v => String(Math.round(v)), eps: 0.5, dfmt: d => Math.round(Math.abs(d)) },
  { label: 'Range', get: w => weaponRange(w), fmt: v => String(Math.round(v)), eps: 1, dfmt: d => Math.round(Math.abs(d)) },
  { label: 'Rarity', get: w => w.rarity, fmt: v => RARITIES[v].name, eps: 0.5, dfmt: d => Math.abs(d) + (Math.abs(d) > 1 ? ' tiers' : ' tier') }
];
function deltaTxt(def, a, b) {   // a = floor weapon, b = equipped
  const d = def.get(a) - def.get(b);
  if (Math.abs(d) < def.eps) return { s: '=', c: NEUT };
  return d > 0 ? { s: '▲ +' + def.dfmt(d), c: GOOD } : { s: '▼ -' + def.dfmt(d), c: BAD };
}
function floorTipLines(w, act) {
  const lines = [];
  w.afx.forEach(a => { const has = act && act.fx[a], A = AFFIX_BY_ID[a]; lines.push(has ? { c: '#9aa4bd', s: '= ' + A.name + ': ' + A.desc } : { c: GOOD, s: '+ NEW ' + A.name + ': ' + A.desc }); });
  if (!w.afx.length) lines.push({ c: NEUT, s: 'No affixes' });
  const lost = act ? act.afx.filter(a => !w.fx[a]) : [];
  if (lost.length) lines.push({ c: BAD, s: '− Lose: ' + lost.map(a => AFFIX_BY_ID[a].name).join(', ') });
  weaponCombos(w).forEach(c => lines.push({ c: '#ffd27a', s: '★ ' + c }));
  const B = WEAPON_TYPES[w.type];
  lines.push({ c: '#c9a8ff', s: 'Special – ' + B.special + ': ' + B.sdesc });
  return lines;
}
function drawFloorTip(it) {
  const g = G, p = g.player, w = it.w, R = RARITIES[w.rarity];
  const cols = []; p.slots.forEach((sl, i) => { if (sl) cols.push({ i, w: sl }); });
  const act = p.slots[p.active], lines = floorTipLines(w, act);
  const wd = land ? Math.min(312, ARENA.w - 12) : ARENA.w - 12, rowH = 13.5;
  const h = 12 + 14 + 22 + 14 + STAT_DEFS.length * rowH + 8 + lines.length * 12.5 + 8;
  const x = land ? (p.x > ARENA.x + ARENA.w / 2 ? ARENA.x + 6 : ARENA.x + ARENA.w - 6 - wd) : ARENA.x + 6;
  const top = p.y > ARENA.y + ARENA.h / 2;
  const y = top ? ARENA.y + (g.boss ? 22 : 6) : ARENA.y + ARENA.h - h - (land ? 6 : 60);
  rr(x, y, wd, h, 10); ctx.fillStyle = 'rgba(8,10,18,0.9)'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = R.color; ctx.stroke();
  txt('ON THE FLOOR  ·  ' + R.name.toUpperCase(), x + 10, y + 12, 10, R.color, 'left', '700');
  fitTxt(w.name, x + 10, y + 31, wd - 20, 16, R.color, 'left', '800');
  // column headers
  const cx = cols.length === 2 ? [x + wd - 150, x + wd - 72] : [x + wd - 92];
  const hy = y + 50;
  cols.forEach((c, k) => { const isAct = c.i === p.active; txt((cols.length === 1 ? 'vs equipped' : 'vs ' + (c.i + 1)) + (isAct && cols.length > 1 ? '●' : ''), cx[k], hy, 9, isAct ? '#fff' : '#8a93ab', 'left', '700', false); });
  STAT_DEFS.forEach((def, r) => {
    const ry = hy + 14 + r * rowH;
    txt(def.label, x + 10, ry, 10.5, '#9aa4bd', 'left', '600', false);
    txt(def.fmt(def.get(w), w), x + 66, ry, 11, def.label === 'Rarity' ? R.color : '#fff', 'left', '800', false);
    cols.forEach((c, k) => { const d = deltaTxt(def, w, c.w); txt(d.s, cx[k], ry, 10.5, d.c, 'left', '800', false); });
  });
  const ly = hy + 14 + STAT_DEFS.length * rowH + 8;
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + 10, ly - 8); ctx.lineTo(x + wd - 10, ly - 8); ctx.stroke();
  lines.forEach((l, i) => fitTxt(l.s, x + 10, ly + i * 12.5, wd - 20, 10, l.c, 'left', '600'));
}
const kbd = typeof matchMedia === 'function' && !matchMedia('(pointer: coarse)').matches;
function drawPickButtons(L, t) {
  const g = G, p = g.player, n = g.near, R = RARITIES[n.w.rarity], pulse = 0.5 + 0.5 * Math.sin(t * 6);
  const pb = (r, title, sub, subCol, hl, hint) => {
    glow(r.x + r.w / 2, r.y + r.h / 2, r.w * 0.62, R.color, 0.25 + pulse * 0.25);
    rr(r.x, r.y, r.w, r.h, 12); ctx.fillStyle = hl ? hexA(R.color, 0.45) : 'rgba(10,14,24,0.92)'; ctx.fill();
    ctx.lineWidth = 2.5 + pulse; ctx.strokeStyle = R.color; ctx.stroke();
    fitTxt(title, r.x + r.w / 2, r.y + r.h * 0.38, r.w - 12, 15, '#fff', 'center', '800');
    fitTxt(sub, r.x + r.w / 2, r.y + r.h * 0.74, r.w - 12, 10, subCol, 'center', '700');
    if (hint && kbd) { rr(r.x + r.w - 20, r.y + 3, 17, 15, 4); ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fill(); txt('E', r.x + r.w - 11.5, r.y + 11, 10, '#111', 'center', '800', false); }
  };
  if (L.pick) pb(L.pick, 'PICK UP', n.w.name, R.color, true, true);
  else if (L.swap) L.swap.forEach((r, i) => { const o = p.slots[i]; pb(r, 'SWAP SLOT ' + (i + 1), 'drops ' + (o ? o.name : ''), o ? RARITIES[o.rarity].color : '#aaa', p.active === i, p.active === i); });
}
function circBtn(x, y, r, color, label, cd, icon) {
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.fillStyle = cd > 0 ? 'rgba(80,90,110,0.55)' : color; ctx.globalAlpha = cd > 0 ? 1 : 0.85; ctx.beginPath(); ctx.arc(x, y, r - 3, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
  if (cd > 0) { ctx.fillStyle = color; ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r - 3, -Math.PI / 2, -Math.PI / 2 + (1 - cd) * TAU); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1; }
  ctx.strokeStyle = cd > 0 ? 'rgba(255,255,255,0.3)' : '#fff'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, r - 1, 0, TAU); ctx.stroke();
  fitTxt(label, x, y + 1, r * 1.55, r > 34 ? 14 : 10.5, '#fff', 'center', '800');
}
function drawToast(T) {
  const w = T.w, R = RARITIES[w.rarity];
  const label = T.head.toUpperCase() + ': ' + w.name;
  ctx.font = '800 12px system-ui,sans-serif';
  const wd = Math.min(ARENA.w - 12, ctx.measureText(label).width + 28), x = ARENA.x + ARENA.w / 2 - wd / 2, y = ARENA.y + (G.boss ? 24 : 8);
  ctx.globalAlpha = clamp(T.t, 0, 0.5) * 2;
  rr(x, y, wd, 24, 12); ctx.fillStyle = 'rgba(8,10,18,0.85)'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = R.color; ctx.stroke();
  fitTxt(label, x + wd / 2, y + 12.5, wd - 16, 12, R.color, 'center', '800');
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- rendering: screens
function overlay(a) { ctx.fillStyle = 'rgba(4,5,10,' + a + ')'; ctx.fillRect(0, 0, LW, LH); }
function statRow(label, val, y, hi, x0, x1) { x0 = x0 == null ? 40 : x0; x1 = x1 == null ? LW - 40 : x1; txt(label, x0, y, 14, '#9aa4bd', 'left', '600'); txt(val, x1, y, 15, hi ? '#ffe066' : '#fff', 'right', '800'); }

function bestRows() {
  return [['Furthest room', best.bestRoom ? (best.bestRoom >= 6 ? 'Boss' : best.bestRoom + ' / 5') : '-'], ['Fastest win', best.bestTime ? fmt(best.bestTime) : '-'],
    ['Most kills', best.mostKills || '-'], ['Most damage', best.bestDmg ? best.bestDmg.toLocaleString() : '-'], ['Runs / wins', best.runs + ' / ' + best.wins]];
}
function drawMenuLand(t) {
  ctx.fillStyle = '#0b0d14'; ctx.fillRect(0, 0, LW, LH);
  for (let i = 0; i < 26; i++) { const x = (i * 97 + Math.sin(t * 0.4 + i) * 20) % LW, y = (i * 53 + t * (10 + i % 7 * 4)) % LH; glow(x, y, 20 + (i % 4) * 6, RARITIES[i % 4].color, 0.12); }
  const cl = SA.l + (LW - SA.l - SA.r) * 0.27, cr = SA.l + (LW - SA.l - SA.r) * 0.72;
  glow(cl, LH * 0.3, 150, '#27d6c0', 0.18);
  txt('LOOT', cl, LH * 0.2, 50, '#27d6c0', 'center', '900');
  txt('& LEAD', cl, LH * 0.2 + 46, 42, '#ffb23e', 'center', '900');
  txt('one-thumb roguelike shooter', cl, LH * 0.2 + 82, 14, '#aab3c9', 'center', '600');
  [['pistol', 0], ['smg', 1], ['shotgun', 2], ['sniper', 3]].forEach((q, i) => { const x = cl - 117 + i * 78, y = LH * 0.2 + 118 + Math.sin(t * 2 + i) * 4; glow(x, y, 24, RARITIES[q[1]].color, 0.5); drawGun(q[0], x - 8, y, -0.3, 1.2, RARITIES[q[1]].color); });
  button(cl - 110, LH * 0.2 + 150, 220, 56, 'START RUN', () => newRun(), '#1f8f7a', 24);
  const cw = 270, cx0 = cr - cw / 2, cy0 = SA.t + 24;
  rr(cx0, cy0, cw, 150, 12); ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill();
  txt('BEST RUN STATS', cr, cy0 + 20, 13, '#ffb23e', 'center', '800');
  bestRows().forEach((r, i) => { txt(r[0], cx0 + 16, cy0 + 44 + i * 21, 13, '#9aa4bd', 'left', '600'); txt(String(r[1]), cx0 + cw - 16, cy0 + 44 + i * 21, 14, '#fff', 'right', '800'); });
  ['Drag to move · auto-aim & fire', 'DASH to dodge · SPECIAL for weapon power', 'Stand near a weapon: PICK UP / SWAP button', 'Desktop: WASD, Space dash, Q special, E pick up, 1/2 equip'].forEach((h, i) => txt(h, cr, cy0 + 176 + i * 18, 11.5, '#8a93ab', 'center', '600', false));
  txt('5 rooms + boss · random weapons & affixes', cr, LH - SA.b - 14, 11.5, '#6f7890', 'center', '600', false);
}
function drawMenu() {
  const t = performance.now() / 1000;
  if (land) { drawMenuLand(t); return; }
  ctx.fillStyle = '#0b0d14'; ctx.fillRect(0, 0, LW, LH);
  hotOff = Math.max(0, Math.round((LH - 640) * 0.3)); ctx.save(); ctx.translate(0, hotOff);
  for (let i = 0; i < 26; i++) { const x = (i * 97 + Math.sin(t * 0.4 + i) * 20) % LW, y = (i * 53 + t * (10 + i % 7 * 4)) % LH; glow(x, y, 20 + (i % 4) * 6, RARITIES[i % 4].color, 0.12); }
  glow(LW / 2, 130, 150, '#27d6c0', 0.18);
  txt('LOOT', LW / 2, 98, 52, '#27d6c0', 'center', '900');
  txt('& LEAD', LW / 2, 146, 44, '#ffb23e', 'center', '900');
  txt('one-thumb roguelike shooter', LW / 2, 182, 14, '#aab3c9', 'center', '600');
  // demo weapons
  [['pistol', 0], ['smg', 1], ['shotgun', 2], ['sniper', 3]].forEach((q, i) => { const x = 62 + i * 78, y = 222 + Math.sin(t * 2 + i) * 4; glow(x, y, 26, RARITIES[q[1]].color, 0.5); drawGun(q[0], x - 8, y, -0.3, 1.2, RARITIES[q[1]].color); });
  button(LW / 2 - 110, 262, 220, 56, 'START RUN', () => newRun(), '#1f8f7a', 24);
  rr(28, 338, LW - 56, 154, 12); ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill();
  txt('BEST RUN STATS', LW / 2, 358, 13, '#ffb23e', 'center', '800');
  const rows = bestRows();
  rows.forEach((r, i) => { txt(r[0], 44, 382 + i * 22, 13, '#9aa4bd', 'left', '600'); txt(String(r[1]), LW - 44, 382 + i * 22, 14, '#fff', 'right', '800'); });
  const hint = ['Drag anywhere to move · auto-aim & fire', 'DASH to dodge · SPECIAL for weapon power', 'Stand near a weapon: PICK UP / SWAP button', 'Desktop: WASD, Space dash, Q special, E pick up, 1/2 equip'];
  hint.forEach((h, i) => txt(h, LW / 2, 520 + i * 18, 11.5, '#8a93ab', 'center', '600', false));
  txt('5 rooms + boss · random weapons & affixes', LW / 2, 640 - 24, 11.5, '#6f7890', 'center', '600', false);
  ctx.restore(); hotOff = 0;
}

function drawPerkScreen() {
  overlay(0.78);
  if (land) {
    const cxm = SA.l + (LW - SA.l - SA.r) / 2;
    txt('ROOM CLEARED', cxm, SA.t + 34, 14, '#6bff8a', 'center', '800');
    txt('CHOOSE A PERK', cxm, SA.t + 62, 26, '#fff', 'center', '900');
    const offer = G.perkOffer; if (!offer) return;
    const gap = 14, cw = Math.min(230, (LW - SA.l - SA.r - 40 - gap * 2) / 3), ch = Math.min(200, LH - SA.t - SA.b - 150), y = SA.t + 90;
    const x0 = cxm - (cw * 3 + gap * 2) / 2;
    offer.forEach((pk, i) => {
      const x = x0 + i * (cw + gap);
      hot.push({ x, y, w: cw, h: ch, fn: () => takePerk(pk) });
      rr(x, y, cw, ch, 14); ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = pk.color; ctx.stroke();
      glow(x + cw / 2, y + 50, 40, pk.color, 0.5);
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.arc(x + cw / 2, y + 50, 28, 0, TAU); ctx.fill(); ctx.strokeStyle = pk.color; ctx.lineWidth = 2; ctx.stroke();
      txt(pk.icon, x + cw / 2, y + 51, 28, pk.color, 'center', '800');
      fitTxt(pk.name, x + cw / 2, y + 108, cw - 20, 19, '#fff', 'center', '800');
      fitTxt(pk.desc, x + cw / 2, y + 136, cw - 20, 13, pk.color, 'center', '600');
      txt(String(i + 1), x + cw - 12, y + 13, 11, '#8a93ab', 'center', '700');
    });
    txt('Tap a card to take it', cxm, y + ch + 22, 12, '#8a93ab', 'center', '600');
    return;
  }
  txt('ROOM CLEARED', LW / 2, 70, 15, '#6bff8a', 'center', '800');
  txt('CHOOSE A PERK', LW / 2, 98, 26, '#fff', 'center', '900');
  const offer = G.perkOffer; if (!offer) return;
  const h = Math.min(104, (LH - 250) / 3), gap = 12, y0 = 128;
  offer.forEach((pk, i) => {
    const x = 20, y = y0 + i * (h + gap), w = LW - 40;
    hot.push({ x, y, w, h, fn: () => takePerk(pk) });
    rr(x, y, w, h, 14); ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = pk.color; ctx.stroke();
    glow(x + 46, y + h / 2, 36, pk.color, 0.5);
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.arc(x + 46, y + h / 2, 26, 0, TAU); ctx.fill(); ctx.strokeStyle = pk.color; ctx.lineWidth = 2; ctx.stroke();
    txt(pk.icon, x + 46, y + h / 2 + 1, 26, pk.color, 'center', '800');
    fitTxt(pk.name, x + 88, y + h / 2 - 14, w - 100, 20, '#fff', 'left', '800');
    fitTxt(pk.desc, x + 88, y + h / 2 + 12, w - 100, 14, pk.color, 'left', '600');
    txt(String(i + 1), x + w - 14, y + 14, 11, '#8a93ab', 'center', '700');
  });
  txt('Tap a card to take it', LW / 2, y0 + 3 * (h + gap) + 12, 12, '#8a93ab', 'center', '600');
}

function drawPause() {
  overlay(0.72);
  if (land) {
    const cl = SA.l + (LW - SA.l - SA.r) * 0.3, cr = SA.l + (LW - SA.l - SA.r) * 0.72;
    txt('PAUSED', cl, SA.t + 70, 38, '#fff', 'center', '900');
    button(cl - 100, SA.t + 110, 200, 52, 'RESUME', () => { state = 'play'; }, '#1f8f7a', 20);
    button(cl - 100, SA.t + 176, 200, 46, muted ? 'SOUND: OFF' : 'SOUND: ON', () => { muted = !muted; }, '#3a4560', 16);
    button(cl - 100, SA.t + 236, 200, 46, 'QUIT TO MENU', () => { state = 'menu'; G = null; resize(); }, '#8a2f45', 16);
    if (G) { const p = G.player; [0, 1].forEach(i => { const w = p.slots[i]; if (w) fitTxt((i + 1) + '. ' + w.name + '  (DPS ' + Math.round(weaponDps(w)) + ')', cr, SA.t + 130 + i * 26, LW * 0.4, 13, RARITIES[w.rarity].color, 'center'); });
      fitTxt('Perks: ' + (G.perksTaken.length ? G.perksTaken.map(id => PERKS.find(x => x.id === id).name).join(', ') : 'none'), cr, SA.t + 200, LW * 0.4, 11, '#9aa4bd', 'center', '600'); }
    return;
  }
  txt('PAUSED', LW / 2, 150, 38, '#fff', 'center', '900');
  button(LW / 2 - 100, 200, 200, 52, 'RESUME', () => { state = 'play'; }, '#1f8f7a', 20);
  button(LW / 2 - 100, 268, 200, 46, muted ? 'SOUND: OFF' : 'SOUND: ON', () => { muted = !muted; }, '#3a4560', 16);
  button(LW / 2 - 100, 330, 200, 46, 'QUIT TO MENU', () => { state = 'menu'; G = null; resize(); }, '#8a2f45', 16);
  if (G) { const p = G.player; [0, 1].forEach(i => { const w = p.slots[i]; if (w) { fitTxt((i + 1) + '. ' + w.name + '  (DPS ' + Math.round(weaponDps(w)) + ')', LW / 2, 410 + i * 24, LW - 40, 13, RARITIES[w.rarity].color, 'center'); } });
    txt('Perks taken: ' + (G.perksTaken.length ? G.perksTaken.map(id => PERKS.find(x => x.id === id).name).join(', ') : 'none'), LW / 2, 470, 10.5, '#9aa4bd', 'center', '600', false); }
}

function drawEnd(won) {
  const g = G;
  overlay(0.8);
  if (land) {
    const cl = SA.l + (LW - SA.l - SA.r) * 0.35, cr = SA.l + (LW - SA.l - SA.r) * 0.8, nb = g.newBest || [];
    txt(won ? 'VICTORY!' : 'YOU DIED', cl, SA.t + 34, 38, won ? '#ffb23e' : '#ff5a6e', 'center', '900');
    txt(won ? 'The Warden has fallen.' : 'Reached ' + (g.room === BOSS_ROOM ? 'the boss' : 'room ' + g.room + ' of 5'), cl, SA.t + 66, 14, '#cfd6e6', 'center', '600');
    rr(cl - 170, SA.t + 84, 340, 170, 14); ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fill();
    [['Time', fmt(g.time), nb.indexOf('time') >= 0], ['Kills', String(g.kills), nb.indexOf('kills') >= 0], ['Damage dealt', Math.round(g.dmgDealt).toLocaleString(), nb.indexOf('dmg') >= 0],
      ['Weapons found', String(g.found)], ['Perks taken', String(g.perksTaken.length)], ['Furthest room', won ? 'Boss defeated' : (g.room === BOSS_ROOM ? 'Boss' : g.room + ' / 5'), nb.indexOf('room') >= 0]]
      .forEach((r, i) => statRow(r[0], r[1], SA.t + 106 + i * 26, r[2], cl - 152, cl + 152));
    if (nb.length) txt('★ NEW PERSONAL BEST ★', cl, SA.t + 276, 14, '#ffe066', 'center', '800');
    txt('Best: room ' + (best.bestRoom >= 6 ? 'Boss' : best.bestRoom) + ' · ' + best.mostKills + ' kills' + (best.bestTime ? ' · win in ' + fmt(best.bestTime) : ''), cl, SA.t + 300, 11.5, '#9aa4bd', 'center', '600', false);
    button(cr - 100, SA.t + 120, 200, 54, 'RUN AGAIN', () => newRun(), '#1f8f7a', 20);
    button(cr - 100, SA.t + 188, 200, 44, 'MENU', () => { state = 'menu'; G = null; resize(); }, '#3a4560', 16);
    return;
  }
  txt(won ? 'VICTORY!' : 'YOU DIED', LW / 2, 100, 44, won ? '#ffb23e' : '#ff5a6e', 'center', '900');
  txt(won ? 'The Warden has fallen.' : 'Reached ' + (g.room === BOSS_ROOM ? 'the boss' : 'room ' + g.room + ' of 5'), LW / 2, 140, 15, '#cfd6e6', 'center', '600');
  rr(28, 168, LW - 56, 200, 14); ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fill();
  const nb = g.newBest || [];
  statRow('Time', fmt(g.time), 196, nb.indexOf('time') >= 0);
  statRow('Kills', String(g.kills), 224, nb.indexOf('kills') >= 0);
  statRow('Damage dealt', Math.round(g.dmgDealt).toLocaleString(), 252, nb.indexOf('dmg') >= 0);
  statRow('Weapons found', String(g.found), 280);
  statRow('Perks taken', String(g.perksTaken.length), 308);
  statRow('Furthest room', won ? 'Boss defeated' : (g.room === BOSS_ROOM ? 'Boss' : g.room + ' / 5'), 336, nb.indexOf('room') >= 0);
  if (nb.length) txt('★ NEW PERSONAL BEST ★', LW / 2, 392, 14, '#ffe066', 'center', '800');
  txt('Best: room ' + (best.bestRoom >= 6 ? 'Boss' : best.bestRoom) + ' · ' + best.mostKills + ' kills' + (best.bestTime ? ' · win in ' + fmt(best.bestTime) : ''), LW / 2, 416, 11.5, '#9aa4bd', 'center', '600', false);
  button(LW / 2 - 100, 444, 200, 54, 'RUN AGAIN', () => newRun(), '#1f8f7a', 20);
  button(LW / 2 - 100, 510, 200, 44, 'MENU', () => { state = 'menu'; G = null; resize(); }, '#3a4560', 16);
}

function render() {
  hot = [];
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#05060a'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, offX * dpr, offY * dpr);
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, LW, LH); ctx.clip();
  if (state === 'menu' || !G) { drawMenu(); ctx.restore(); return; }
  ctx.save();
  if (G.shake > 0) ctx.translate(rnd(-1, 1) * G.shake, rnd(-1, 1) * G.shake);
  drawWorld();
  ctx.restore();
  if (G.fade > 0) { ctx.fillStyle = 'rgba(0,0,0,' + G.fade + ')'; ctx.fillRect(0, 0, LW, LH); }
  drawHud();
  if (state === 'perk') drawPerkScreen();
  else if (state === 'pause') drawPause();
  else if (state === 'over') drawEnd(false);
  else if (state === 'win') drawEnd(true);
  ctx.restore();
}

// ---------------------------------------------------------------- main loop
let last = performance.now(), acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000; last = now;
  if (!(dt > 0)) return;
  dt = Math.min(dt, 0.1); acc += dt;
  let n = 0;
  while (acc >= 1 / 60 && n < 5) { update(1 / 60); acc -= 1 / 60; n++; }
  if (n === 5) acc = 0;
  render();
}
resize();
requestAnimationFrame(frame);

// small hook for automated tests / debugging
window.TDR = {
  get state() { return state; }, get G() { return G; }, newRun, update, render, takePerk, endRun, genWeapon, startRoom,
  setState(s) { state = s; }, best: () => best, hot: () => hot, pickup: pickupNear, layout, resize,
  get land() { return land; }, SA, ARENA, get LW() { return LW; }, get LH() { return LH; }
};
