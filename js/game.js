'use strict';
// =====================================================================
//  Neon Vault – one-thumb top-down roguelike shooter (vanilla canvas)
// =====================================================================
const cv = document.getElementById('c');
const ctx = cv.getContext('2d', { alpha: false });
let LW = 360;                   // logical width (360 in portrait, adaptive in landscape)
let LH = 640;                   // logical height (adaptive)
let land = false;               // landscape layout?
const SA = { l: 0, t: 0, r: 0, b: 0 };   // safe-area insets in logical units
const PICK_R = 34;              // radius (px) within which a floor weapon can be inspected / picked up
let scale = 1, offX = 0, offY = 0, dpr = 1;
const ARENA = { x: 0, y: 0, w: 640, h: 600 };   // WORLD rectangle of the current room (bigger than the screen; the camera scrolls)
const VIEW = { x: 12, y: 62, w: 336, h: 400 };   // SCREEN rectangle the room is drawn into
const cam = { x: 0, y: 0, init: false };         // world coordinate shown at VIEW's top-left
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
let clsId = loadClass();         // last chosen class (persisted)
const sel = { idx: 0, pos: 0 };  // class-select carousel
sel.idx = sel.pos = Math.max(0, CLASSES.findIndex(c => c.id === clsId));
const CLS_KEY = 'neon_vault_class_v1';
function loadClass() { try { const id = localStorage.getItem('neon_vault_class_v1'); if (id && CLASS_BY_ID[id]) return id; } catch (e) { /* ignore */ } return 'runner'; }
function saveClass() { try { localStorage.setItem(CLS_KEY, clsId); } catch (e) { /* ignore */ } }
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
    if (b && typeof b === 'object') return Object.assign({ runs: 0, wins: 0, bestRoom: 0, bestTime: 0, mostKills: 0, bestDmg: 0, bestLoop: 0, bestStage: 0 }, b);
  } catch (e) { /* ignore */ }
  return { runs: 0, wins: 0, bestRoom: 0, bestTime: 0, mostKills: 0, bestDmg: 0, bestLoop: 0, bestStage: 0 };
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
  const wasLand = land;
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
  setView();
  if (joy.active) { joy.active = false; joy.mx = joy.my = 0; joy.id = null; }
  if (G) { cam.init = false; if (land !== wasLand && state === 'play') state = 'pause'; }   // orientation flipped mid-run: pause so the player can re-grip
}
function setView() {
  if (land) { VIEW.x = SA.l + 8; VIEW.y = SA.t + 46; VIEW.w = LW - VIEW.x - SA.r - 168; VIEW.h = LH - VIEW.y - SA.b - 8; }
  else { VIEW.x = 12 + SA.l; VIEW.y = 62 + SA.t; VIEW.w = LW - 24 - SA.l - SA.r; VIEW.h = LH - VIEW.y - 172 - SA.b; }
}
// room size per room kind: combat rooms are ~2.5-3x the visible play area; boss arenas a bit tighter; shops small
function roomSize(cur) { const r = roomSize0(cur); return land ? { w: Math.round(r.h * 1.4), h: Math.round(r.w * 0.76) } : r; }   // landscape screens get wide rooms (same area, matches the wide view)
function roomSize0(cur) {
  if (cur.kind === 'shop' || cur.kind === 'risk') return { w: 460, h: 520 };
  if (cur.boss === 'root') return { w: 620, h: 640 };
  if (cur.boss) return { w: 580, h: 620 };
  if (cur.kind === 'elite') return { w: 600, h: 620 };
  return { w: 680 + rint(-1, 1) * 40, h: 720 + rint(-1, 1) * 40 };
}
function setRoomSize(w, h) { ARENA.x = 0; ARENA.y = 0; ARENA.w = w; ARENA.h = h; cam.init = false; }
// smooth camera: follows the local player with a slight lead in the move direction, clamped to the room
function camTarget() {
  const p = G.player, lead = 46, vx = G.mvx || 0, vy = G.mvy || 0;
  let tx = p.x + vx * lead - VIEW.w / 2, ty = p.y + vy * lead - VIEW.h / 2;
  const pad = 26;
  tx = ARENA.w + pad * 2 <= VIEW.w ? ARENA.x + ARENA.w / 2 - VIEW.w / 2 : clamp(tx, ARENA.x - pad, ARENA.x + ARENA.w + pad - VIEW.w);
  ty = ARENA.h + pad * 2 <= VIEW.h ? ARENA.y + ARENA.h / 2 - VIEW.h / 2 : clamp(ty, ARENA.y - pad, ARENA.y + ARENA.h + pad - VIEW.h);
  return { x: tx, y: ty };
}
function updateCamera(dt) {
  if (!G || !G.player) return;
  const t = camTarget();
  if (!cam.init || G.fade > 0.9) { cam.x = t.x; cam.y = t.y; cam.init = true; return; }
  const k = 1 - Math.pow(0.0025, dt);
  cam.x += (t.x - cam.x) * k; cam.y += (t.y - cam.y) * k;
}
const toScreen = (x, y) => ({ x: VIEW.x + x - cam.x, y: VIEW.y + y - cam.y });
const onScreen = (x, y, m) => { const s = toScreen(x, y); m = m || 0; return s.x >= VIEW.x - m && s.x <= VIEW.x + VIEW.w + m && s.y >= VIEW.y - m && s.y <= VIEW.y + VIEW.h + m; };
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
    bdmg: B.dmg * R.mult * rnd(0.9, 1.15),
    rate: B.rate * rnd(0.92, 1.1) * (1 + (R.mult - 1) * 0.18),
    pellets: B.pellets, shots: 0, id: Math.random()
  };
  w.dmg = w.bdmg * (fx.cursed ? 1.6 : 1);
  w.name = weaponName(w);
  return w;
}
function weaponName(w) {
  return afxList(w).map(a => AFFIX_BY_ID[a].adj).concat(WEAPON_TYPES[w.type].name).join(' ');
}
function afxList(w) { return w.afx; }
// recompute everything derived from the affix list (after a reroll)
function rebuildWeapon(w) {
  w.fx = {}; w.afx.forEach(a => { w.fx[a] = true; });
  w.dmg = w.bdmg * (w.fx.cursed ? 1.6 : 1);
  w.name = weaponName(w);
}
function rerollWeapon(w, all) {
  const ids = AFFIXES.map(a => a.id), n = Math.max(1, RARITIES[w.rarity].affixes);
  if (all) { const na = []; while (na.length < n) { const id = pick(ids); if (na.indexOf(id) < 0) na.push(id); } w.afx = na; }
  else if (w.afx.length) { const i = rint(0, w.afx.length - 1), pool = ids.filter(a => w.afx.indexOf(a) < 0); w.afx[i] = pick(pool); }
  rebuildWeapon(w);
}
function cloneWeapon(w, k) { return Object.assign({}, w, { fx: Object.assign({}, w.fx), afx: w.afx.slice(), dmg: w.dmg * k, shots: 0, id: Math.random() }); }
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
// per-player ("seat") state; in co-op every player has one of these, swapped into G while that player is simulated
function makeSeat(cid) {
  const C = CLASS_BY_ID[cid] || CLASSES[0];
  const P = { cls: C.id, spd: 0, crit: 0.05, critDmg: 1.75, luck: 0, maxHp: 100, fireRate: 0, dmg: 0, dashCd: 1.4, skillCd: 1, magnet: 0, armor: 0,
    credit: 0, regen: 0, clearHeal: 0, pierce: 0, exec: 0, bossDmg: 0, thorns: 0, vamp: 0, moveDmg: 0, revive: 0, echo: 0, shield: 0, dashDmg: 0, dashI: 0, burnMul: 0, chainPlus: 0,
    bouncePlus: 0, vampPlus: 0, splitPlus: 0, shatter: 0, boomR: 0, overN: 5, curseRed: 0, pierceAff: 0, knock: 0, skPow: 0, skDur: 0, skCount: 0, adren: 0, turretLife: 0, turretDmg: 0, glitchPick: 0 };
  TREE_FLAGS.forEach(k => { if (P[k] == null) P[k] = 0; });
  const start = genWeapon('pistol', 0);                    // every class starts with a common pistol and no skill
  return {
    P, C, credits: 0, cashT: 0, perkOffer: null, perksTaken: [], perkCount: {}, rerolls: 2, banishes: 1, banished: {}, shield: 0, perkMode: 'room', perkMin: 0, banishMode: false,
    xp: 0, lvl: 1, pts: 0, tree: {}, choice: {}, skill: null, lvlT: 0, treeSel: null, treeBr: 0,
    near: null, toast: null, mvx: 0, mvy: 0, shop: null, risk: null, found: 1, flash: 0, pauseTab: 0, scrollY: 0,
    player: { x: 0, y: 0, hp: 100, r: 9, vx: 0, vy: 0, aim: -Math.PI / 2, cd: 0, iframes: 0, dashT: 0, dashCd: 0, dashDx: 0, dashDy: 1,
              slots: [start, null], active: 0, overdrive: 0, haste: 0, ambush: false, ambushT: 0, skillT: 0, skillMax: 1, target: null, tgtT: 0, step: 0, face: -Math.PI / 2, blink: 0 }
  };
}
// every optional tree/perk flag read by the combat hooks (all start at 0)
const TREE_FLAGS = ['dmg_pistol', 'dmg_shotgun', 'dmg_smg', 'dmg_sniper', 'dmg_crossbow', 'dmg_launcher', 'critEvery', 'critIgnite', 'critHeal', 'critMark', 'critKillSkill', 'bounceAll',
  'dashCrit', 'dashBoom', 'dashHaste', 'dashAmbush', 'dashLen', 'dashCloak', 'dashStun', 'ambStun', 'ambReset', 'ambCrit', 'killSkill', 'killBoom', 'killShield', 'killPatch', 'killHeart',
  'closeDmg', 'farDmg', 'stillDmg', 'stillCrit', 'fullHpDmg', 'pelletPierce', 'stunCh', 'igniteCh', 'freezeCh', 'explodeCh', 'chaosCh', 'closeIgnite', 'lowArmor', 'lowRate', 'lowSkill',
  'hurtSkill', 'adrenX', 'spinUp', 'overAll', 'burnBoom', 'burnSpread', 'burnVs', 'burnHeal', 'blastR', 'blastDmg', 'blastSlow', 'blastIgnite', 'blastCrit', 'turretRate', 'turretBoom',
  'turretHeal', 'linkRate', 'auraSlow', 'skTwice', 'skEcho', 'skBuff', 'skChain', 'skDecoy', 'skStunAll', 'decoyBoom', 'extraPerk', 'perkLuck', 'pickAfx', 'afxDmg',
  'augNova', 'augHaste', 'augShield', 'augPull', 'augBurn', 'augStun', 'augMark', 'augFreeze', 'augBoom', 'augChain', 'augHeal', 'augReset'];
const SEAT_KEYS = Object.keys(makeSeat('runner'));
function newRun(id, coopList) {
  if (id && CLASS_BY_ID[id]) clsId = id;
  const C = CLASS_BY_ID[clsId] || CLASSES[0]; clsId = C.id; saveClass();
  G = {
    room: 0, zone: 1, time: 0, kills: 0, dmgDealt: 0, shake: 0, fade: 1,
    enemies: [], bullets: [], ebullets: [], parts: [], nums: [], items: [], chests: [], patches: [], fx: [], pillars: [], timers: [], turrets: [], decoys: [],
    pending: 0, waves: [], waveIdx: 0, roomState: 'fight', doorOpen: false,
    boss: null, endT: 0, banner: null, floor: null, hitstop: 0,
    loop: 1, clears: 0, loopStart: 0, clearTimes: [], plan: buildPlan(), cur: null, hardNext: false, hardOn: false,
    hpMul: 1, bulMul: 1, credMul: 1, loopLuck: 0, lasers: [], pools: [], tiles: [], safe: null, gaunt: null
  };
  Object.assign(G, makeSeat(C.id));
  if (coopList) coopInit(coopList);
  startRoom(1);
  state = 'play';
}

function makeFloor(n) {
  // the floor covers the whole room (world space) plus a margin; drawn once per room, blitted with the camera offset
  const M = 60, FW = ARENA.w + M * 2, FH = ARENA.h + M * 2, R = Math.min(2, Math.max(1.25, (dpr || 1) * (scale || 1) * 0.75));
  const c = document.createElement('canvas');
  c.width = Math.round(FW * R); c.height = Math.round(FH * R);
  const x = c.getContext('2d'); x.scale(R, R); x.translate(M - ARENA.x, M - ARENA.y);
  G.floorOff = { x: ARENA.x - M, y: ARENA.y - M, w: FW, h: FH };
  const hue = ZONES[G.zone].hue; G.hue = hue;
  const L = (l, a) => 'hsla(' + hue + ',100%,' + l + '%,' + (a == null ? 1 : a) + ')';
  x.fillStyle = '#03040a'; x.fillRect(ARENA.x - M, ARENA.y - M, FW, FH);
  // faint backdrop grid outside the arena
  x.strokeStyle = L(60, 0.04); x.lineWidth = 1; x.beginPath();
  for (let xx = ARENA.x - M; xx < ARENA.x + ARENA.w + M; xx += 28) { x.moveTo(xx + 0.5, ARENA.y - M); x.lineTo(xx + 0.5, ARENA.y + ARENA.h + M); }
  for (let yy = ARENA.y - M; yy < ARENA.y + ARENA.h + M; yy += 28) { x.moveTo(ARENA.x - M, yy + 0.5); x.lineTo(ARENA.x + ARENA.w + M, yy + 0.5); }
  x.stroke();
  // arena floor: dark glass + neon grid
  x.fillStyle = 'hsl(' + hue + ',60%,4.5%)'; x.fillRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h);
  const gr = x.createRadialGradient(ARENA.x + ARENA.w / 2, ARENA.y + ARENA.h / 2, 10, ARENA.x + ARENA.w / 2, ARENA.y + ARENA.h / 2, Math.max(ARENA.w, ARENA.h) * 0.7);
  gr.addColorStop(0, L(50, 0.10)); gr.addColorStop(1, L(50, 0)); x.fillStyle = gr; x.fillRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h);
  x.save(); x.beginPath(); x.rect(ARENA.x, ARENA.y, ARENA.w, ARENA.h); x.clip();
  const T = 28; x.lineWidth = 1;
  x.strokeStyle = L(55, 0.13); x.beginPath();
  for (let xx = 0; xx <= ARENA.w; xx += T) { x.moveTo(ARENA.x + xx + 0.5, ARENA.y); x.lineTo(ARENA.x + xx + 0.5, ARENA.y + ARENA.h); }
  for (let yy = 0; yy <= ARENA.h; yy += T) { x.moveTo(ARENA.x, ARENA.y + yy + 0.5); x.lineTo(ARENA.x + ARENA.w, ARENA.y + yy + 0.5); }
  x.stroke();
  x.strokeStyle = L(65, 0.22); x.beginPath();
  for (let xx = 0; xx <= ARENA.w; xx += T * 4) { x.moveTo(ARENA.x + xx + 0.5, ARENA.y); x.lineTo(ARENA.x + xx + 0.5, ARENA.y + ARENA.h); }
  for (let yy = 0; yy <= ARENA.h; yy += T * 4) { x.moveTo(ARENA.x, ARENA.y + yy + 0.5); x.lineTo(ARENA.x + ARENA.w, ARENA.y + yy + 0.5); }
  x.stroke();
  for (let i = 0; i < 26 * Math.ceil(ARENA.w * ARENA.h / 134000); i++) { x.fillStyle = L(70, rnd(0.05, 0.2)); x.fillRect(ARENA.x + rnd(0, ARENA.w), ARENA.y + rnd(0, ARENA.h), 2, 2); }
  x.restore();
  // neon walls: halo + core
  const neonRect = (px, py, w, h, col, lw) => {
    x.lineJoin = 'round'; x.strokeStyle = col; x.globalAlpha = 0.12; x.lineWidth = lw * 5; x.strokeRect(px, py, w, h);
    x.globalAlpha = 0.28; x.lineWidth = lw * 2.4; x.strokeRect(px, py, w, h); x.globalAlpha = 1; x.lineWidth = lw; x.strokeRect(px, py, w, h);
  };
  neonRect(ARENA.x - 2, ARENA.y - 2, ARENA.w + 4, ARENA.h + 4, 'hsl(' + hue + ',100%,60%)', 1.6);
  // corner brackets
  x.strokeStyle = '#fff'; x.globalAlpha = 0.7; x.lineWidth = 1.5; x.beginPath();
  [[ARENA.x - 2, ARENA.y - 2, 1, 1], [ARENA.x + ARENA.w + 2, ARENA.y - 2, -1, 1], [ARENA.x - 2, ARENA.y + ARENA.h + 2, 1, -1], [ARENA.x + ARENA.w + 2, ARENA.y + ARENA.h + 2, -1, -1]]
    .forEach(q => { x.moveTo(q[0] + q[2] * 12, q[1]); x.lineTo(q[0], q[1]); x.lineTo(q[0], q[1] + q[3] * 12); }); x.stroke(); x.globalAlpha = 1;
  // pillars: dark blocks with neon edge
  G.pillars.forEach(p => {
    x.fillStyle = 'rgba(0,0,0,0.55)'; x.fillRect(p.x + 3, p.y + 5, p.w, p.h);
    x.fillStyle = '#05060f'; x.fillRect(p.x, p.y, p.w, p.h);
    x.fillStyle = L(50, 0.08); x.fillRect(p.x, p.y, p.w, p.h);
    neonRect(p.x + 0.5, p.y + 0.5, p.w - 1, p.h - 1, p.mirror ? '#e8f8ff' : 'hsl(' + ((hue + 40) % 360) + ',100%,62%)', p.mirror ? 1.8 : 1.2);
    if (p.mirror) {      // reflective wall: pale glass with diagonal sheen
      x.fillStyle = 'rgba(190,230,255,0.22)'; x.fillRect(p.x, p.y, p.w, p.h);
      x.save(); x.beginPath(); x.rect(p.x, p.y, p.w, p.h); x.clip(); x.strokeStyle = 'rgba(255,255,255,0.55)'; x.lineWidth = 1.4; x.beginPath();
      for (let k = -p.h; k < p.w + p.h; k += 9) { x.moveTo(p.x + k, p.y + p.h); x.lineTo(p.x + k + p.h, p.y); } x.stroke(); x.restore();
    }
  });
  if (G.zone === 5) {   // reactor: white-hot core glow
    const rg = x.createRadialGradient(ARENA.x + ARENA.w / 2, ARENA.y + ARENA.h * 0.2, 10, ARENA.x + ARENA.w / 2, ARENA.y + ARENA.h * 0.2, ARENA.h * 0.9);
    rg.addColorStop(0, 'rgba(255,240,190,0.22)'); rg.addColorStop(1, 'rgba(255,200,80,0)'); x.fillStyle = rg; x.fillRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h);
  }
  return c;
}

// random free floor spot at least minFromPlayer from every player; maxFrom (optional) keeps it within reach of one player
// (rooms are much bigger than the screen, so waves spawn in a ring around the players instead of anywhere)
function playersPos() { const g = G; if (g.coop && !g.client && g.seats) return g.seats.filter(s => !s.off && !s.d.player.downed).map(s => s.d.player); return [g.player]; }
function freeSpot(minFromPlayer, r, maxFrom) {
  const g = G, pl = playersPos(), anchor = pl.length ? pick(pl) : g.player;
  for (let i = 0; i < 60; i++) {
    let x, y;
    if (maxFrom && i < 45) { const a = rnd(0, TAU), d = rnd(minFromPlayer, maxFrom); x = anchor.x + Math.cos(a) * d; y = anchor.y + Math.sin(a) * d; if (x < ARENA.x + r + 8 || x > ARENA.x + ARENA.w - r - 8 || y < ARENA.y + r + 8 || y > ARENA.y + ARENA.h - r - 8) continue; }
    else { x = rnd(ARENA.x + r + 8, ARENA.x + ARENA.w - r - 8); y = rnd(ARENA.y + r + 8, ARENA.y + ARENA.h - r - 8); }
    if (pl.some(p => Math.hypot(x - p.x, y - p.y) < minFromPlayer)) continue;
    if (g.pillars.some(q => x > q.x - r - 4 && x < q.x + q.w + r + 4 && y > q.y - r - 4 && y < q.y + q.h + r + 4)) continue;
    return { x, y };
  }
  return { x: ARENA.x + ARENA.w / 2, y: ARENA.y + 80 };
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
  if (e.invuln) { if (!noNum && Math.random() < 0.25) addNum(e.x, e.y - e.r - 4, 'SHIELDED', '#ffe9a0', 10); return false; }
  const P = G.P, pl = G.player;
  if (P.exec && e.hp < e.max * 0.3) dmg *= 1 + P.exec;
  if (P.fullHpDmg && e.hp >= e.max - 0.01) dmg *= 1 + P.fullHpDmg;
  if ((P.closeDmg || P.farDmg) && pl) { const d = Math.hypot(e.x - pl.x, e.y - pl.y); if (d < 110) dmg *= 1 + P.closeDmg; else if (d > 170) dmg *= 1 + P.farDmg; }
  if (e.mark > 0) dmg *= 1.25;
  if (P.burnVs && e.burn > 0) dmg *= 1 + P.burnVs;
  e.lastCrit = !!crit;
  if ((e.boss || e.elite) && P.bossDmg) dmg *= 1 + P.bossDmg;
  if (P.shatter && e.slow > 0) dmg *= 1 + P.shatter;
  e.hp -= dmg; e.hitT = 0.09; G.dmgDealt += dmg;
  if (!noNum) addNum(e.x, e.y - e.r - 4, String(Math.max(1, Math.round(dmg))), color || (crit ? '#ffe066' : '#ffffff'), crit ? 17 : 12);
  if (e.type === 'root' && e.phase === 1 && e.hp <= e.max * 0.6) { e.hp = e.max * 0.6; rootPhase2(e); return true; }
  if (e.hp <= 0) killEnemy(e);
  return true;
}
function killEnemy(e) {
  if (e.dead) return;
  e.dead = true;
  const g = G, p = g.player, T = ENEMY_TYPES[e.type], P = g.P;
  g.kills++;
  burst(e.x, e.y, e.boss ? 60 : 12, e.color || T.color, e.boss ? 260 : 120, e.boss ? 4 : 3, 0.6);
  ring(e.x, e.y, e.r * 2.2, e.color || T.color, 0.3);
  shake(e.boss ? 14 : e.type === 'tank' ? 5 : 2);
  sfx('kill', 180, 0.12, 'sawtooth', 0.05, 0.5);
  const w = p.slots[p.active];
  if (w && w.fx.vampiric && p.hp < P.maxHp) { const hv = 3 + 2 * P.vampPlus; p.hp = Math.min(P.maxHp, p.hp + hv); addNum(p.x, p.y - 16, '+' + hv, '#6bff8a', 12); }
  if (P.vamp && p.hp < P.maxHp) p.hp = Math.min(P.maxHp, p.hp + P.vamp);
  onKillTree(e);
  if (e.type === 'splitter' && !e.noSplit) {                         // Data Swamp: bloats burst into malware
    for (let i = 0; i < 3; i++) { const s = addEnemy('swarm', e.x + rnd(-12, 12), e.y + rnd(-12, 12), 0.7); s.spawnT = 0.25; }
    burst(e.x, e.y, 10, '#8dff3a', 120, 3, 0.5);
  }
  if (e.boss) { bossDeath(e); return; }
  if (e.elite) { dropWeapon(e.x, e.y, 3); dropWeapon(e.x + 14, e.y, 1); spawnCreditsFor(e); g.banner = { text: 'ELITE DELETED', sub: 'Legendary dropped', t: 1.8, col: '#ffb800' }; return; }
  spawnCreditsFor(e);
  const dropChance = e.type === 'tank' ? 0.55 : e.type === 'shooter' ? 0.12 : e.type === 'swarm' ? 0.015 : e.type === 'node' || e.type === 'turret' ? 0 : 0.07;
  if (Math.random() < dropChance + P.luck * 0.03) dropWeapon(e.x, e.y, e.type === 'tank' ? 1 : 0);
  else if (Math.random() < 0.1) g.items.push({ kind: 'heart', x: e.x, y: e.y, t: 0, vy: 0 });
}
// class-tree kill effects + XP (everyone in co-op earns XP from every kill)
function onKillTree(e) {
  const g = G, p = g.player, P = g.P;
  const xp = (XP_VAL[e.type] || 2) * (e.clone ? 0.5 : 1) * (e.noCredit && !e.boss ? 0.5 : 1);
  if (g.coop && !g.client) forEachSeat(() => gainXp(xp)); else gainXp(xp);
  if (P.killSkill && p.skillT > 0) p.skillT = Math.max(0, p.skillT - P.killSkill);
  if (P.critKillSkill && e.lastCrit && p.skillT > 0) p.skillT = Math.max(0, p.skillT - P.critKillSkill);
  if (P.ambReset && e.lastAmb) { p.dashCd = 0; addNum(p.x, p.y - 26, 'DASH READY', '#c58bff', 11); }
  if (P.killShield && Math.random() < P.killShield && g.shield < 2) { g.shield++; ring(p.x, p.y, 30, '#7fd0ff', 0.4); }
  if (p.surge > 0 && p.hp < P.maxHp) p.hp = Math.min(P.maxHp, p.hp + 4);
  if (P.killHeart && Math.random() < P.killHeart) g.items.push({ kind: 'heart', x: e.x, y: e.y, t: 0, vy: 0 });
  if (e.burn > 0) {
    if (P.burnBoom) explode(e.x, e.y, 56, P.burnBoom * (1 + P.dmg), '#ff7a2a', false);
    if (P.burnSpread) g.enemies.forEach(o => { if (!o.dead && o !== e && Math.hypot(o.x - e.x, o.y - e.y) < 80) igniteEnemy(o, Math.max(6, e.burnDps * 2)); });
  }
  if (P.killBoom && !e.boss) explode(e.x, e.y, 50, P.killBoom * (1 + P.dmg), '#ffb070', false);
  if (P.killPatch) addPatch(e.x, e.y, 18, 2.5, 30 * (1 + P.dmg));
}
function dropWeapon(x, y, minR) {
  const g = G;
  const r = rollRarity(g.P.luck + g.room * 0.03 + g.loopLuck, minR || 0);
  const w = genWeapon(null, r);
  const a = rnd(0, TAU);
  g.items.push({ kind: 'weapon', w, x, y, t: 0, vx: Math.cos(a) * 60, vy: Math.sin(a) * 60, ignore: false });
  burst(x, y, 8, RARITIES[r].color, 90, 2.5, 0.5);
}
function hurtPlayer(n, fromX, fromY) {
  const g = G, p = g.player, P = g.P;
  if (p.iframes > 0 || p.dashT > 0 || p.downed || DEBUG) return;
  if (g.shield > 0) { g.shield--; p.iframes = 0.8; ring(p.x, p.y, 34, '#7fd0ff', 0.4); addNum(p.x, p.y - 16, 'BLOCKED', '#7fd0ff', 12); sfx('swap', 500, 0.1, 'triangle', 0.05, 1.6); return; }
  const w = p.slots[p.active];
  let mul = (w && w.fx.cursed ? Math.max(0.95, 1.35 - P.curseRed) : 1) * (1 - Math.min(0.6, P.armor));
  if (P.lowArmor && p.hp < P.maxHp * 0.3) mul *= 1 - P.lowArmor;
  if (P.hurtSkill && p.skillT > 0) p.skillT = Math.max(0, p.skillT - P.hurtSkill);
  n *= mul;
  p.hp -= n; p.iframes = 0.4; g.flash = 0.25;
  shake(7); addNum(p.x, p.y - 14, '-' + Math.round(n), '#ff5a6e', 15);
  burst(p.x, p.y, 10, '#ff5a6e', 130, 3, 0.4);
  sfx('hurt', 120, 0.2, 'sawtooth', 0.08, 0.5);
  if (P.thorns) { explode(p.x, p.y, 74, P.thorns * (1 + P.dmg), '#ffb347', false); }
  if (p.hp <= 0) {
    if (P.revive > 0) {
      P.revive--; p.hp = Math.round(P.maxHp * 0.5); p.iframes = 2.2; g.flash = 0.4;
      explode(p.x, p.y, 120, 80, '#6bff8a', false); g.ebullets.length = 0; g.banner = { text: 'SECOND WIND', sub: 'Revived at 50% HP', t: 1.8, col: '#6bff8a' };
    } else if (g.coop) coopDowned(); else endRun(false);
  }
}

// ---------------------------------------------------------------- shooting
function fireWeapon(w, ang, opt) {
  opt = opt || {};
  const g = G, p = g.player, B = WEAPON_TYPES[w.type], P = g.P, o = opt.from || p, own = !opt.from;
  w.shots++;
  let mul = 1 + P.dmg + (P['dmg_' + w.type] || 0);
  const moving = own && (g.mvx || g.mvy);
  if (moving && P.moveDmg) mul *= 1 + P.moveDmg;
  if (own && !moving && P.stillDmg) mul *= 1 + P.stillDmg;
  if (P.adren) mul *= 1 + P.adren * (P.adrenX ? 2 : 1) * clamp(1 - p.hp / P.maxHp, 0, 1);           // tree: damage rises as health drops
  if (P.afxDmg) mul *= 1 + P.afxDmg * w.afx.length;
  if (p.skBuffT > 0) mul *= 1.4;
  if (p.surge > 0) mul *= 1.3;
  const over = (w.fx.overcharged || P.overAll) && (w.shots % P.overN === 0);
  if (over) { mul *= 3; addNum(o.x, o.y - 20, 'x3!', '#ff9a3c', 13); ring(o.x, o.y, 24, '#ff9a3c', 0.25); }
  let amb = false;
  if (own && p.ambush) { p.ambush = false; amb = true; const am = Math.max(p.ambMul || 0, 1.5 + (P.dashAmbush || 0)); p.ambMul = 0; mul *= am; addNum(p.x, p.y - 22, 'AMBUSH x' + (Math.round(am * 10) / 10), '#c58bff', 13); ring(p.x, p.y, 30, '#a65bff', 0.3); }   // tree: ambush shot
  if (opt.dmgMul) mul *= opt.dmgMul;
  const pel = opt.pellets || w.pellets;
  const extraPierce = (pel > 1 ? (P.pelletPierce || 0) : 0);                                        // tree: Slug Core
  let forceCrit = (own && amb && P.ambCrit) || (own && P.critEvery && w.shots % P.critEvery === 0);
  if (own && p.dashCritN > 0) { p.dashCritN--; forceCrit = true; }
  const critCh = P.crit + (own && !moving ? (P.stillCrit || 0) : 0);
  for (let i = 0; i < pel; i++) {
    const a = ang + (opt.fan ? (i - (pel - 1) / 2) * opt.fan : 0) + rnd(-1, 1) * B.spread * (opt.fan ? 0.2 : 1);
    const crit = forceCrit || Math.random() < critCh;
    let dmg = w.dmg * mul * (crit ? P.critDmg : 1);
    const sp = B.speed * (opt.speedMul || 1);
    const b = {
      x: o.x + Math.cos(a) * 12, y: o.y + Math.sin(a) * 12, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, dmg, crit, life: B.life * (opt.lifeMul || 1),
      pierce: (opt.pierce != null ? opt.pierce : B.pierce) + (w.fx.piercing ? 2 + P.pierceAff : 0) + P.pierce + extraPierce, bounces: (w.fx.ricochet ? 2 + P.bouncePlus : 0) + (P.bounceAll || 0), w, B, over, hit: [], amb: own && amb, chain: own && p.skChainT > 0, size: B.size * (over || amb ? 1.6 : 1) * (opt.big ? 1.6 : 1),
      color: amb ? '#c58bff' : over ? '#ff9a3c' : crit ? '#ffe066' : B.color, trail: 0, stuck: null, fuse: 0, split: false, t: 0
    };
    g.bullets.push(b);
  }
  if (own) p.recoil = 3;
  const snd = { pistol: 520, shotgun: 200, smg: 640, sniper: 300, crossbow: 380, launcher: 140 }[w.type];
  sfx('shot' + w.type, snd, 0.07, 'square', own ? 0.035 : 0.02, 0.5);
}

function explode(x, y, r, dmg, color, ignite) {
  const g = G, P = g.P;
  r *= 1 + (P.blastR || 0); dmg *= 1 + (P.blastDmg || 0); ignite = ignite || !!P.blastIgnite;
  ring(x, y, r, color, 0.35); burst(x, y, 14, color, 160, 3, 0.5); shake(4);
  sfx('boom', 110, 0.25, 'sawtooth', 0.07, 0.4);
  g.enemies.forEach(e => {
    if (e.dead || e.spawnT > 0) return;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d < r + e.r) { const cr = P.blastCrit && Math.random() < P.crit; dealDamage(e, dmg * (1 - 0.4 * d / (r + e.r)) * (cr ? P.critDmg : 1), cr, '#ffb070'); if (ignite) igniteEnemy(e, dmg); if (P.blastSlow) e.slow = Math.max(e.slow || 0, 2); }
  });
}
function thermite() { return 1 + G.P.burnMul; }   // tree/perks: burning + explosive affixes hit harder
function igniteEnemy(e, base) { const m = thermite(); e.burn = 3 * m; e.burnDps = Math.max(e.burnDps || 0, Math.max(2, base * 0.3) * m); }

function onBulletHit(b, e) {
  const g = G, w = b.w, fx = w.fx;
  b.hit.push(e);
  dealDamage(e, b.dmg, b.crit, b.over ? '#ff9a3c' : null);
  if (e.dead && false) return;
  burst(b.x, b.y, 3, b.color, 90, 2, 0.25);
  sfx('hit', 260, 0.04, 'triangle', 0.025);
  if (!e.boss) { const kb = 0.012 * (1 + (g.P.knock || 0)); e.vx += b.vx * kb; e.vy += b.vy * kb; }
  const P = g.P;
  if (b.amb) e.lastAmb = true; else e.lastAmb = false;
  if (fx.burning || (P.igniteCh && Math.random() < P.igniteCh) || (b.crit && P.critIgnite)) igniteEnemy(e, b.dmg);
  if (P.closeIgnite && g.player && Math.hypot(e.x - g.player.x, e.y - g.player.y) < 110) igniteEnemy(e, b.dmg);
  if (fx.freezing || (P.freezeCh && Math.random() < P.freezeCh)) e.slow = 2;
  if (P.stunCh && Math.random() < P.stunCh) e.stun = Math.max(e.stun || 0, e.boss ? 0.3 : 0.8);
  if (b.amb && P.ambStun) e.stun = Math.max(e.stun || 0, e.boss ? 0.5 : 1.2);
  if (b.crit && P.critMark) e.mark = 6;
  if (b.crit && P.critHeal && g.player.hp < P.maxHp) g.player.hp = Math.min(P.maxHp, g.player.hp + P.critHeal);
  if (g.player.surge > 0 && g.player.hp < P.maxHp) g.player.hp = Math.min(P.maxHp, g.player.hp + 0.5);
  if (P.chaosCh && Math.random() < P.chaosCh) chaosProc(e, b.dmg, 2);
  if (P.explodeCh && !b.B.boom && Math.random() < P.explodeCh) explode(b.x, b.y, 34, b.dmg * 0.5, '#ffb070', false);
  if (b.chain && Math.random() < 0.6) chainFrom(e, b, 2);
  if (fx.explosive && !b.B.boom) { const m = thermite(); explode(b.x, b.y, 34 * m * (1 + 0.4 * g.P.boomR), b.dmg * 0.4 * m, '#ffb070', fx.burning); }
  if (fx.chain && Math.random() < 0.45 + 0.15 * g.P.chainPlus) chainFrom(e, b, 2 + g.P.chainPlus);
  if (fx.splitting && !b.split) {
    const base = Math.atan2(b.vy, b.vx);
    for (let k = -1; k <= 1; k += (g.P.splitPlus ? 1 : 2)) {
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
    const b = arr[i];
    if (g.coop && b.seat && b.seat !== g.curSeat) { if (withSeat(b.seat, () => bulletStep(b, dt))) { const k = arr.indexOf(b); if (k >= 0) arr.splice(k, 1); } }
    else if (bulletStep(b, dt)) { const k = arr.indexOf(b); if (k >= 0) arr.splice(k, 1); }
    if (i > arr.length) i = arr.length;
  }
}
// advances one player bullet; returns true when it should be removed
function bulletStep(b, dt) {
  const g = G;
  {
    b.t += dt;
    let remove = false;
    if (b.stuck) {
      if (b.stuck.dead) { b.fuse = 0; } else { b.x = b.stuck.x + b.ox; b.y = b.stuck.y + b.oy; }
      b.fuse -= dt;
      if (b.fuse <= 0) { detonate(b); return true; }
      return false;
    }
    b.life -= dt;
    if (b.life <= 0) { if (b.B.boom && !b.B.stick) detonate(b); else if (b.B.boom && b.B.stick) detonate(b); return true; }
    const steps = Math.ceil(Math.hypot(b.vx, b.vy) * dt / 10);
    const sdt = dt / steps;
    for (let s = 0; s < steps && !remove; s++) {
      const nx = b.x + b.vx * sdt, ny = b.y + b.vy * sdt;
      if (wallAt(nx, ny, 1)) {
        const hx = wallAt(nx, b.y, 1), hy = wallAt(b.x, ny, 1);
        const mq = (!b.B.boom && !b.B.stick) ? mirrorAt(nx, ny) : null;
        if (mq && (b.mb || 0) < 4) {      // Mirror Mainframe: reflective wall bounces bullets (does not use up ricochet)
          b.mb = (b.mb || 0) + 1; if (hx) b.vx = -b.vx; if (hy) b.vy = -b.vy; if (!hx && !hy) { b.vx = -b.vx; b.vy = -b.vy; }
          b.hit.length = 0; burst(b.x, b.y, 3, '#e8f8ff', 80, 2, 0.25); sfx('ric', 1300, 0.04, 'triangle', 0.02);
          continue;
        }
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
      if (shieldBlock(b)) { remove = true; break; }
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
    return remove;
  }
}
function addPatch(x, y, r, life, dmg) {
  const g = G; if (g.patches.length > 70) g.patches.shift();
  g.patches.push({ x, y, r, life, max: life, dmg: Math.max(3, dmg * 0.25), tick: 0 });
}


// ---------------------------------------------------------------- class skills
function skillMaxCd() { const d = skillDef(G); return d ? d.cd * G.P.skillCd : 1; }
function useSkill() {
  const g = G; if (!g || state !== 'play') return false;
  const p = g.player, P = g.P, w = p.slots[p.active];
  if (!g.skill) { if (g.pts > 0) openTree(); return false; }      // locked: tapping the button opens the skill choice
  if (p.skillT > 0 || !w || p.downed) return false;
  if (!castSkill(g.skill)) return false;
  p.skillT = p.skillMax = skillMaxCd();
  if (P.augReset && Math.random() < P.augReset) { p.skillT = 0.3; addNum(p.x, p.y - 40, 'RECURSION', '#39ff6a', 11); }
  sfx('special', 300, 0.3, 'sawtooth', 0.06, 2);
  shake(3);
  return true;
}
function openTree() { const g = G; if (!g) return; resetJoy(); g.pauseTab = 3; g.scrollY = 0; g.treeSel = null; state = 'pause'; }
function curAim() { return G.player.aim; }
function decoyFor(e) {
  const D = G.decoys; if (!D.length) return null;
  let best = null, bd = 1e9; for (let i = 0; i < D.length; i++) { const d = Math.hypot(D[i].x - e.x, D[i].y - e.y); if (d < bd) { bd = d; best = D[i]; } }
  return best;
}
function updateSkillObjects(dt) {
  const g = G;
  for (let i = g.decoys.length - 1; i >= 0; i--) { const d = g.decoys[i]; d.life -= dt; if (d.life <= 0) {
    g.decoys.splice(i, 1); if (!d.hidden) burst(d.x, d.y, 10, '#a65bff', 80, 3, 0.4);
    const boom = () => { if (G.P.decoyBoom && d.kind !== 'mini') explode(d.x, d.y, 90, G.P.decoyBoom * (1 + G.P.dmg), '#a65bff', false); };
    if (g.coop && d.seat && d.seat !== g.curSeat) withSeat(d.seat, boom); else boom(); } }
  for (let i = g.turrets.length - 1; i >= 0; i--) {
    const t = g.turrets[i]; t.life -= dt; t.cd -= dt; if (t.spawn > 0) t.spawn -= dt;
    const inSeat = fn => (g.coop && t.seat && t.seat !== g.curSeat) ? withSeat(t.seat, fn) : fn();
    if (t.life <= 0) { burst(t.x, t.y, 12, '#39ff6a', 100, 3, 0.5); ring(t.x, t.y, 30, '#39ff6a', 0.3); g.turrets.splice(i, 1); inSeat(() => { if (G.P.turretBoom && t.kind !== 'mine') explode(t.x, t.y, 80, G.P.turretBoom * (1 + G.P.dmg), '#39ff6a', false); if (t.kind === 'mine') explode(t.x, t.y, t.R * 0.7, t.dmg * 0.5, '#39ff6a', false); }); continue; }
    if (t.kind === 'mine') {
      if (t.spawn > 0) continue;
      const hit = g.enemies.find(e => !e.dead && e.spawnT <= 0 && Math.hypot(e.x - t.x, e.y - t.y) < e.r + 14);
      if (hit) { g.turrets.splice(i, 1); inSeat(() => explode(t.x, t.y, t.R, t.dmg, '#39ff6a', false)); }
      continue;
    }
    if (t.kind === 'drone') {
      const o = t.owner && !t.owner.downed ? t.owner : null;
      if (o) { t.ph += dt * 2.4; t.x = o.x + Math.cos(t.ph) * 34; t.y = o.y + Math.sin(t.ph) * 34; }
    }
    let tg = null, bd = weaponRange(t.w);
    g.enemies.forEach(e => { if (e.dead || e.spawnT > 0) return; const d = dist(e, t); if (d < bd && los(t, e)) { bd = d; tg = e; } });
    if (tg) {
      const want = Math.atan2(tg.y - t.y, tg.x - t.x); let d = want - t.aim; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; t.aim += d * Math.min(1, dt * 18);
      if (t.cd <= 0 && t.spawn <= 0) { const fire = () => { fireWeapon(t.w, t.aim, { from: t }); t.cd = 1 / (t.w.rate * 0.85 * (1 + G.P.fireRate + (G.P.turretRate || 0))); }; if (g.coop && t.seat && t.seat !== g.curSeat) withSeat(t.seat, fire); else fire(); }
    }
  }
}

function doDash() {
  const g = G; if (!g || state !== 'play') return;
  const p = g.player;
  if (p.dashCd > 0 || p.dashT > 0) return;
  let dx = g.mvx, dy = g.mvy;
  if (Math.hypot(dx, dy) < 0.1) { dx = Math.cos(p.face); dy = Math.sin(p.face); }
  const l = Math.hypot(dx, dy) || 1; p.dashDx = dx / l; p.dashDy = dy / l;
  const P = g.P;
  p.dashT = 0.17 * (1 + (P.dashLen || 0)); p.chargeT = 0; p.dashCd = P.dashCd; p.iframes = Math.max(p.iframes, 0.22 + P.dashI); p.dashHit = [];
  if (P.dashAmbush) { p.ambush = true; p.ambushT = 3.5; }
  if (P.dashCrit) p.dashCritN = P.dashCrit;
  if (P.dashHaste) p.haste = Math.max(p.haste, P.dashHaste);
  if (P.dashCloak) { p.cloak = Math.max(p.cloak || 0, P.dashCloak); g.decoys = g.decoys.filter(d => d.kind !== 'cloak'); g.decoys.push({ x: p.x, y: p.y, life: P.dashCloak, max: P.dashCloak, face: p.face, kind: 'cloak', hidden: true }); }
  if (P.dashBoom) p.dashBoomP = true;
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
  let head = old ? 'Swapped in' : 'Picked up';
  if (g.P.glitchPick && it.w.afx.length && !it.w.glitched && Math.random() < g.P.glitchPick) { rerollWeapon(it.w, false); head = 'Glitched'; addNum(p.x, p.y - 24, 'GLITCH', '#ff3df0', 13); }
  if (g.P.pickAfx && !it.w.glitched && it.w.afx.length < 4) { const pool = AFFIXES.map(a => a.id).filter(a => it.w.afx.indexOf(a) < 0); it.w.afx.push(pick(pool)); rebuildWeapon(it.w); head = 'Glitched +1 affix'; }
  it.w.glitched = true;
  showWeaponToast(it.w, head);
  sfx('pickup', 600, 0.15, 'triangle', 0.06, 1.8);
  ring(p.x, p.y, 30, RARITIES[it.w.rarity].color, 0.4);
  burst(p.x, p.y, 10, RARITIES[it.w.rarity].color, 100, 3, 0.5);
  return true;
}

// ---------------------------------------------------------------- run end
function stageAbs(g) { return (g.loop - 1) * STAGES + g.room; }
function endRun(won) {
  const g = G; if (g.over) return;
  g.over = true; g.won = won;
  best.runs++;
  g.newBest = [];
  best.wins += g.clears;
  const stg = stageAbs(g);
  if (stg > best.bestStage) { best.bestStage = stg; g.newBest.push('stage'); }
  if (g.loop > best.bestLoop) { best.bestLoop = g.loop; g.newBest.push('loop'); }
  if (g.kills > best.mostKills) { best.mostKills = g.kills; g.newBest.push('kills'); }
  if (Math.round(g.dmgDealt) > best.bestDmg) { best.bestDmg = Math.round(g.dmgDealt); g.newBest.push('dmg'); }
  if (g.clearTimes.length) { const tt = Math.min.apply(null, g.clearTimes); if (!best.bestTime || tt < best.bestTime) { best.bestTime = tt; g.newBest.push('time'); } }
  saveBest();
  g.endDelay = won ? 0 : 0.9;
  state = won ? 'win' : 'dying';
  burst(g.player.x, g.player.y, 30, '#ff5a6e', 200, 3, 0.8);
}
function stageName(s) { const l = Math.floor((s - 1) / STAGES) + 1, r = ((s - 1) % STAGES) + 1; return 'L' + l + ' · Zone ' + ZONE_OF_STAGE[r - 1] + (r === STAGES ? ' (ROOT)' : ' · room ' + r); }

// ---------------------------------------------------------------- update
function aliveEnemies() { let n = 0; for (let i = 0; i < G.enemies.length; i++) if (!G.enemies[i].dead) n++; return n; }

function update(dt) {
  const g = G;
  if (!g) return;
  if (g.coop) { coopUpdate(dt); return; }
  if (state === 'dying') { g.endDelay -= dt; updateFx(dt); g.shake *= 0.9; if (g.endDelay <= 0) state = 'over'; return; }
  if (state !== 'play') return;
  g.time += dt;
  const inp = localInput();
  playerTick(dt, inp.x, inp.y);
  worldTick(dt);
}
function localInput() {
  let mx = 0, my = 0;
  if (keys['a'] || keys['arrowleft']) mx -= 1; if (keys['d'] || keys['arrowright']) mx += 1;
  if (keys['w'] || keys['arrowup']) my -= 1; if (keys['s'] || keys['arrowdown']) my += 1;
  if (mx || my) { const l = Math.hypot(mx, my); mx /= l; my /= l; }
  if (joy.active) { mx = joy.mx; my = joy.my; }
  return { x: mx, y: my };
}
// one player's movement, cooldowns, targeting and auto-fire (runs in that player's seat context)
function playerTick(dt, mx, my) {
  const g = G, p = g.player, P = g.P;
  g.mvx = mx; g.mvy = my;

  // ---- timers / cooldowns
  p.iframes -= dt; p.dashCd -= dt; p.overdrive -= dt; p.cd -= dt; if (p.recoil) p.recoil = Math.max(0, p.recoil - dt * 30);
  p.skillT -= dt * (P.lowSkill && p.hp < P.maxHp * 0.3 ? 2 : 1); p.haste -= dt;
  if (p.boost > 0) p.boost -= dt; if (p.cloak > 0) p.cloak -= dt; if (p.surge > 0) p.surge -= dt; if (p.skBuffT > 0) p.skBuffT -= dt; if (p.skChainT > 0) p.skChainT -= dt;
  if (g.lvlT > 0) g.lvlT -= dt; if (P.regen && p.hp < P.maxHp) p.hp = Math.min(P.maxHp, p.hp + P.regen * dt); if (g.cashT > 0) g.cashT -= dt; if (p.ambush) { p.ambushT -= dt; if (p.ambushT <= 0) p.ambush = false; }
  if (g.toast) { g.toast.t -= dt; if (g.toast.t <= 0) g.toast = null; }
  if (g.flash > 0 && g.coop) g.flash = Math.max(0, g.flash - dt);
  if (p.downed) { p.vx = p.vy = 0; return; }

  // ---- player movement
  if (p.dashT > 0) {
    p.dashT -= dt;
    const chg = p.chargeT > 0, dsp = chg ? 600 : 430;
    p.x += p.dashDx * dsp * dt; p.y += p.dashDy * dsp * dt;
    const ddm = (chg ? p.chargeDmg : 0) + (P.dashDmg ? P.dashDmg * (1 + P.dmg) : 0);
    if (ddm || P.dashStun) g.enemies.forEach(e => { if (!e.dead && e.spawnT <= 0 && p.dashHit.indexOf(e) < 0 && dist(e, p) < e.r + p.r + (chg ? 12 : 6)) { p.dashHit.push(e); if (ddm) dealDamage(e, ddm, false, chg ? '#ff8a1f' : '#19f0ff'); if (chg || P.dashStun) { e.stun = Math.max(e.stun || 0, e.boss ? 0.4 : 1.2); if (!e.boss && !e.fixed) { e.vx += p.dashDx * 380; e.vy += p.dashDy * 380; } } ring(e.x, e.y, 26, chg ? '#ff8a1f' : '#19f0ff', 0.25); } });
    if (p.dashT <= 0) {
      if (chg) { p.chargeT = 0; explode(p.x, p.y, 70, p.chargeDmg * 0.6, '#ff8a1f', false); }
      if (p.dashBoomP) { p.dashBoomP = false; explode(p.x, p.y, 64, P.dashBoom * (1 + P.dmg), '#5ff0d0', false); }
    }
    if (Math.random() < 0.9) g.parts.push({ x: p.x, y: p.y, vx: 0, vy: 0, life: 0.25, max: 0.25, size: 8, color: 'rgba(143,227,255,0.5)', ghost: true });
  } else {
    const sp = 112 * Math.max(0.4, 1 + P.spd + (p.boost > 0 ? (p.boostK || 0.5) : 0) + (p.haste > 0 && P.augHaste ? 0.25 : 0)) * (inPool(p) ? 0.55 : 1);
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
      if (e.dead || e.spawnT > 0 || e.invuln) return;
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
    if (P.echo && Math.random() < P.echo) { const ww = w; g.timers.push({ t: 0.08, fn: () => { if (G === g && !g.over) fireWeapon(ww, p.aim, { dmgMul: 0.6 }); } }); }
    let rate = 1 + P.fireRate + (P.lowRate && p.hp < P.maxHp * 0.5 ? P.lowRate : 0) + (P.spinUp ? Math.min(P.spinUp, (p.spin || 0) * 0.03) : 0) + (p.boost > 0 && p.boostK !== 0.3 ? 0.4 : 0);
    if (P.linkRate && g.turrets.some(t => !t.seat || t.seat === g.curSeat)) rate += P.linkRate;
    p.cd = 1 / (w.rate * Math.max(0.3, rate) * (p.overdrive > 0 ? 2 : 1) * (p.haste > 0 ? 1.3 : 1));
    p.spinT = 0.6;
  }
  if (P.spinUp) { if (p.spinT > 0) { p.spinT -= dt; p.spin = (p.spin || 0) + dt; } else p.spin = 0; }
  if (P.turretHeal && p.hp < P.maxHp && g.turrets.some(t => (!t.seat || t.seat === g.curSeat) && Math.hypot(t.x - p.x, t.y - p.y) < 80)) p.hp = Math.min(P.maxHp, p.hp + P.turretHeal * dt);
  if (P.auraSlow) g.enemies.forEach(e => { if (!e.dead && Math.hypot(e.x - p.x, e.y - p.y) < 90 + e.r) e.slow = Math.max(e.slow || 0, 0.2); });
}
function runTimers(dt) {
  const g = G;
  for (let i = g.timers.length - 1; i >= 0; i--) { const t = g.timers[i]; if (!t) continue; t.t -= dt; if (t.t <= 0) { g.timers.splice(i, 1); if (g.coop && t.seat && t.seat !== g.curSeat) withSeat(t.seat, t.fn); else t.fn(); if (G !== g) return; } }
  g.fade = Math.max(0, g.fade - dt * 2.2);
  if (g.banner) { g.banner.t -= dt; if (g.banner.t <= 0) g.banner = null; }
}
function worldTick(dt) {
  const g = G;
  runTimers(dt);
  if (G !== g) return;
  // ---- room logic
  updateHazards(dt);
  if (g.boss && !g.boss.dead) updateBossAI(dt);
  g.enemies.forEach(e => updateEnemy(e, dt));
  for (let i = g.enemies.length - 1; i >= 0; i--) if (g.enemies[i].dead) g.enemies.splice(i, 1);
  separate();
  updateBullets(dt);
  updateEnemyBullets(dt);
  updatePatches(dt);
  updateSkillObjects(dt);
  updateItems(dt);
  updateFx(dt);
  updateRoomFlow(dt);
}

function separate() {
  const E = G.enemies;
  for (let i = 0; i < E.length; i++) for (let j = i + 1; j < E.length; j++) {
    const a = E[i], b = E[j]; const dx = b.x - a.x, dy = b.y - a.y, rr = a.r + b.r;
    const d2 = dx * dx + dy * dy;
    if (d2 < rr * rr && d2 > 0.01) { const d = Math.sqrt(d2), push = (rr - d) * 0.5; const nx = dx / d, ny = dy / d;
      const am = a.boss || a.fixed ? 0 : 1, bm = b.boss || b.fixed ? 0 : 1;
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
  if (e.mark > 0) e.mark -= dt;
  if (e.stun > 0) {
    e.stun -= dt; e.vx *= Math.pow(0.02, dt); e.vy *= Math.pow(0.02, dt); e.x += e.vx * dt; e.y += e.vy * dt; resolveCircle(e, e.r);
    e.warn = false; if (e.type === 'tank' && e.state > 0) { e.state = 0; e.atk = 2; }
    return;
  }
  const slow = (e.slow > 0 ? 0.5 : 1) * (inPool(e) ? 0.7 : 1);
  const tg = decoyFor(e) || p;                                  // enemies chase a decoy hologram if there is one
  const dx = tg.x - e.x, dy = tg.y - e.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
  const dpl = Math.hypot(p.x - e.x, p.y - e.y) || 1;
  let mvx = 0, mvy = 0;
  e.wob += dt * 3;
  switch (e.type) {
    case 'chaser': mvx = ux * e.speed; mvy = uy * e.speed; break;
    case 'swarm': mvx = (ux + Math.cos(e.wob * 2) * 0.5) * e.speed; mvy = (uy + Math.sin(e.wob * 2) * 0.5) * e.speed; break;
    case 'shooter': {
      e.age = (e.age || 0) + dt; e.losT = (e.losT || 0) - dt;
      if (e.losT <= 0) { e.losT = 0.25; e.seen = los(e, tg); }
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
    default: { const r = extEnemyAI(e, dt, tg, dx, dy, d, ux, uy); mvx = r.x; mvy = r.y; }
  }
  e.vx *= Math.pow(0.02, dt); e.vy *= Math.pow(0.02, dt);
  if (e.sideT > 0 && e.type !== 'boss') { e.sideT -= dt; const m = Math.hypot(mvx, mvy); if (m > 0) { const ux2 = mvx / m, uy2 = mvy / m; mvx += -uy2 * e.side * e.speed * 1.1; mvy += ux2 * e.side * e.speed * 1.1; } }
  e.x += (mvx * slow + e.vx) * dt; e.y += (mvy * slow + e.vy) * dt;
  const hit = resolveCircle(e, e.r);
  if (hit && !(e.sideT > 0)) { e.sideT = 0.7; e.side = Math.random() < 0.5 ? -1 : 1; }
  if (hit && e.state === 2) { e.state = 0; e.atk = 3; shake(3); }
  // contact damage
  if (e.cd <= 0 && dpl < e.r + p.r - 1 && e.spawnT <= 0) {
    hurtPlayer(e.dmg * g.bulMul, e.x, e.y); e.cd = e.type === 'swarm' ? 0.7 : 0.9;
    { /* knockback */ p.vx += (p.x - e.x) / dpl * 200; p.vy += (p.y - e.y) / dpl * 200; if (e.type === 'tank' && e.state === 2) { e.state = 0; e.atk = 3; } }
  }
}
function enemyShot(x, y, a, sp, dmg, r, color) {
  const b = { x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, dmg: dmg * G.bulMul, r: r || 4, color: color || '#ff6a6a', life: 5 };
  G.ebullets.push(b);
  sfx('eshot', 300, 0.08, 'square', 0.02, 0.6);
  return b;
}
function updateEnemyBullets(dt) {
  const g = G, p = g.player;
  for (let i = g.ebullets.length - 1; i >= 0; i--) {
    const b = g.ebullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if (b.life <= 0) { if (b.pop) popBullet(b); burst(b.x, b.y, 2, b.color, 50, 2, 0.2); g.ebullets.splice(i, 1); continue; }
    if (wallAt(b.x, b.y, 1)) { if (bounceEnemyBullet(b, dt)) continue; burst(b.x, b.y, 2, b.color, 50, 2, 0.2); g.ebullets.splice(i, 1); continue; }
    if (g.coop) { coopBulletHit(b, i); continue; }
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
function updateItems(dt, part) {
  const g = G, p = g.player, R = 20 + g.P.magnet;
  if (part === 1) { g.items.forEach(it => { it.t += dt; if (it.vx || it.vy) { it.x += it.vx * dt; it.y += it.vy * dt; it.vx *= Math.pow(0.02, dt); it.vy *= Math.pow(0.02, dt); const q = { x: it.x, y: it.y }; resolveCircle(q, 8); it.x = q.x; it.y = q.y; } }); g.chests.forEach(c => { c.t += dt; }); return; }
  if (p.downed) { g.near = null; return; }
  for (let i = g.items.length - 1; i >= 0; i--) {
    const it = g.items[i]; if (!part) it.t += dt;
    if (!part && (it.vx || it.vy)) { it.x += it.vx * dt; it.y += it.vy * dt; it.vx *= Math.pow(0.02, dt); it.vy *= Math.pow(0.02, dt); const q = { x: it.x, y: it.y }; resolveCircle(q, 8); it.x = q.x; it.y = q.y; }
    const d = Math.hypot(it.x - p.x, it.y - p.y);
    if (it.kind === 'credit') {
      const dd = Math.max(1, d);
      if (it.fly && part === 2 && coopNearestSeat(it) !== g.curSeat) continue;
      if (it.fly || dd < 70 + g.P.magnet) { const sp = it.fly ? 420 : 210; it.x += (p.x - it.x) / dd * sp * dt; it.y += (p.y - it.y) / dd * sp * dt; }
      if (dd < 14 + g.P.magnet * 0.5) { g.credits += it.v; g.cashT = 0.7; sfx('credit', 900, 0.05, 'triangle', 0.03, 1.4); g.items.splice(i, 1); }
      continue;
    }
    if (it.kind === 'heart' && d < R + 8) { p.hp = Math.min(g.P.maxHp, p.hp + 12); addNum(p.x, p.y - 16, '+12', '#6bff8a', 13); sfx('heal', 700, 0.12, 'sine', 0.05, 1.5); g.items.splice(i, 1); }
  }
  updateNear();
  g.chests.forEach(c => {
    if (!part) c.t += dt;
    if (!c.open && !c.locked && Math.hypot(c.x - p.x, c.y - p.y) < 26) {
      c.open = true; c.t = 0;
      ring(c.x, c.y, 50, '#ffe066', 0.5); burst(c.x, c.y, 24, '#ffe066', 180, 3, 0.7); shake(3); sfx('chest', 330, 0.3, 'triangle', 0.07, 2.5);
      const n = (c.n || (g.room >= 7 ? 2 : 1)) + (g.coop ? g.seats.length - 1 : 0);    // co-op: one extra drop per extra player
      for (let k = 0; k < n; k++) dropWeapon(c.x, c.y, k === 0 ? (c.min || 1) : 0);
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
function updateAdmin(dt) {
  const g = G, e = g.boss, p = g.player;
  if (!e || e.dead || e.spawnT > 0 || e.stun > 0) return;
  const hpf = e.hp / e.max;
  if (hpf < 0.5 && e.phase === 1) { e.phase = 2; g.banner = { text: 'ADMIN OVERRIDE ENGAGED', t: 1.6 }; shake(10); ring(e.x, e.y, 120, '#ff3355', 0.6);
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
    L.skill = { x: rx - 130, y: by - 36, r: 32 };
    const bx = rx - 160, bw = 152, low = L.dash.y - L.dash.r - 10;
    L.pickBox = { single: { x: bx, y: low - 54, w: bw, h: 54 }, swap: [{ x: bx, y: low - 46 - 52, w: bw, h: 46 }, { x: bx, y: low - 46, w: bw, h: 46 }] };
  } else {
    L.pause = { x: LW - 36 - SA.r, y: 8 + SA.t, w: 28, h: 28 };
    L.slot = [{ x: 12 + SA.l, y: LH - 164 - SA.b, w: 164, h: 40 }, { x: LW - 176 - SA.r, y: LH - 164 - SA.b, w: 164, h: 40 }];
    L.dash = { x: LW - 58 - SA.r, y: LH - 62 - SA.b, r: 40 };
    L.skill = { x: LW - 142 - SA.r, y: LH - 48 - SA.b, r: 32 };
    const bot = VIEW.y + VIEW.h - 6, right = LW - SA.r - 12;
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
  if (state === 'pause' && G) {            // pause menu: taps fire on release so the Tree / Perks lists can be drag-scrolled
    let h = null; for (let i = hot.length - 1; i >= 0; i--) if (inR(p, hot[i])) { h = hot[i]; break; }
    scrollDrag = { id: ev.pointerId, y0: p.y, s0: G.scrollY, moved: false, h }; try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ } return;
  }
  for (let i = hot.length - 1; i >= 0; i--) { if (inR(p, hot[i])) { hot[i].fn(); return; } }
  if (state === 'select') { selDrag = { id: ev.pointerId, x0: p.x, pos0: sel.pos, moved: false }; try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ } return; }
  if (state === 'pause' && G) { scrollDrag = { id: ev.pointerId, y0: p.y, s0: G.scrollY, moved: false }; try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ } return; }
  if (state !== 'play') return;
  const L = layout();
  if (L.pick && inR(p, L.pick)) { pickupNear(); return; }
  if (L.swap) for (let i = 0; i < 2; i++) if (inR(p, L.swap[i])) { pickupNear(i); return; }
  if (inR(p, L.pause)) { state = 'pause'; return; }
  if (inR(p, L.slot[0])) { swapWeapon(0); return; }
  if (inR(p, L.slot[1])) { swapWeapon(1); return; }
  if (G.pts > 0 && inR(p, upgradeBtnRect(L))) { openTree(); return; }
  if (inC(p, L.dash, 8)) { doDash(); return; }
  if (inC(p, L.skill, 8)) { useSkill(); return; }
  if (!joy.active && p.y > VIEW.y && !(land && p.x > VIEW.x + VIEW.w)) {
    joy.active = true; joy.id = ev.pointerId; joy.ox = joy.x = p.x; joy.oy = joy.y = p.y; joy.mx = joy.my = 0;
    try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
  }
}, { passive: false });
let selDrag = null, scrollDrag = null;
cv.addEventListener('pointermove', ev => {
  if (scrollDrag && ev.pointerId === scrollDrag.id && G) { const dy = toLogical(ev).y - scrollDrag.y0; if (Math.abs(dy) > 7) scrollDrag.moved = true; if (scrollDrag.moved) G.scrollY = clamp(scrollDrag.s0 - dy, 0, G.scrollMax || 0); return; }
  if (selDrag && ev.pointerId === selDrag.id) {
    const q = toLogical(ev), dx = q.x - selDrag.x0; if (Math.abs(dx) > 6) selDrag.moved = true;
    sel.pos = clamp(selDrag.pos0 - dx / selGeom().step, -0.35, CLASSES.length - 0.65); return;
  }
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
function endSel(ev) {
  if (!selDrag || ev.pointerId !== selDrag.id) return;
  if (selDrag.moved) selectClass(Math.round(sel.pos + (sel.pos - selDrag.pos0) * 0.35)); else selectClass(sel.idx);
  selDrag = null;
}
cv.addEventListener('pointerup', endSel); cv.addEventListener('pointercancel', endSel);
cv.addEventListener('pointerup', ev => { const sd = scrollDrag; scrollDrag = null; if (sd && sd.id === ev.pointerId && !sd.moved && sd.h && state === 'pause') sd.h.fn(); }); cv.addEventListener('pointercancel', () => { scrollDrag = null; });
function endJoy(ev) { if (joy.active && ev.pointerId === joy.id) { joy.active = false; joy.mx = joy.my = 0; joy.id = null; } }
cv.addEventListener('pointerup', endJoy); cv.addEventListener('pointercancel', endJoy); cv.addEventListener('lostpointercapture', endJoy);
const uiTarget = e => !!(e.target && e.target.closest && e.target.closest('.nv-ui'));
['touchstart', 'touchmove', 'touchend'].forEach(n => document.addEventListener(n, e => { if (!uiTarget(e)) e.preventDefault(); }, { passive: false }));
['gesturestart', 'gesturechange', 'gestureend', 'contextmenu', 'dblclick'].forEach(n => document.addEventListener(n, e => { if (!uiTarget(e)) e.preventDefault(); }));
window.addEventListener('wheel', e => { if (e.ctrlKey) e.preventDefault(); else if (state === 'pause' && G) G.scrollY = clamp(G.scrollY + e.deltaY * 0.5, 0, G.scrollMax || 0); }, { passive: false });

window.addEventListener('keydown', e => {
  if (uiTarget(e) || state === 'coop') return;
  const k = e.key.toLowerCase();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].indexOf(k) >= 0) e.preventDefault();
  if (e.repeat) { keys[k] = true; return; }
  keys[k] = true;
  if (state === 'play') {
    if (k === ' ' || k === 'shift') doDash();
    else if (k === 'q') useSkill();
    else if (k === 'e') pickupNear();
    else if (k === 't') openTree();
    else if (k === '1') swapWeapon(0); else if (k === '2') swapWeapon(1); else if (k === 'tab') { e.preventDefault(); swapWeapon(); }
    else if (k === 'escape' || k === 'p') state = 'pause';
  } else if (state === 'pause') { if (k === 'escape' || k === 'p') state = 'play'; else if (k === 'arrowleft' || k === 'arrowright') G.pauseTab = (G.pauseTab + (k === 'arrowright' ? 1 : 3)) % 4; else if (k === 't') G.pauseTab = 3; }
  else if (state === 'perk' && G.perkOffer) { const i = '1234'.indexOf(k); if (i >= 0 && G.perkOffer[i]) pickOffer(i); else if (k === 'r') rerollOffer(); else if (k === 'b') G.banishMode = !G.banishMode; else if (k === 's') skipOffer(); }
  else if (state === 'shop') shopKey(k);
  else if (state === 'risk') riskKey(k);
  else if (state === 'menu' && (k === 'enter' || k === ' ')) state = 'select';
  else if (state === 'select') {
    if (k === 'arrowleft' || k === 'a') selectClass(sel.idx - 1); else if (k === 'arrowright' || k === 'd') selectClass(sel.idx + 1);
    else if (k === 'enter' || k === ' ') newRun(CLASSES[sel.idx].id); else if (k === 'escape') state = 'menu';
  }
  else if (state === 'win' && (k === 'enter' || k === ' ')) startLoop();
  else if ((state === 'over') && !(G && G.coop) && (k === 'enter' || k === ' ')) newRun(G ? G.C.id : undefined);
});
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; if (state === 'play') state = 'pause'; });
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') state = 'pause'; });

// ---------------------------------------------------------------- rendering helpers (neon)
const FONT = 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
function txt(s, x, y, size, color, align, weight, stroke) {
  ctx.font = (weight || '700') + ' ' + size + 'px ' + FONT;
  ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle';
  if (stroke !== false) { ctx.lineWidth = Math.max(2, size / 4); ctx.strokeStyle = 'rgba(0,0,10,0.8)'; ctx.lineJoin = 'round'; ctx.strokeText(s, x, y); }
  ctx.fillStyle = color || '#fff'; ctx.fillText(s, x, y);
}
function fitTxt(s, x, y, maxW, size, color, align, weight, stroke) {
  ctx.font = (weight || '700') + ' ' + size + 'px ' + FONT;
  const w = ctx.measureText(s).width; if (w > maxW) size = Math.max(7, size * maxW / w);
  txt(s, x, y, size, color, align, weight, stroke);
}
function wrapLines(s, maxW, size, weight) {
  ctx.font = (weight || '600') + ' ' + size + 'px ' + FONT;
  const words = String(s).split(' '), lines = []; let cur = '';
  words.forEach(w => { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; });
  if (cur) lines.push(cur); return lines;
}
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'; }
// additive glow from a cached radial sprite (cheap on mobile: one drawImage per glow, no shadowBlur)
const glowCache = {};
function glowSprite(color) {
  let c = glowCache[color]; if (c) return c;
  c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  if (/^#[0-9a-f]{6}$/i.test(color)) { g.addColorStop(0, hexA(color, 1)); g.addColorStop(0.3, hexA(color, 0.45)); g.addColorStop(1, hexA(color, 0)); }
  else { g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)'); }
  x.fillStyle = g; x.fillRect(0, 0, 64, 64); glowCache[color] = c; return c;
}
function glow(x, y, r, color, a) {
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a; ctx.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}
// stroke the current path as a neon tube: wide faint halo + thin bright core
function nstroke(color, lw, a) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = color; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.globalAlpha = 0.22 * (a == null ? 1 : a); ctx.lineWidth = lw * 3.4; ctx.stroke();
  ctx.globalAlpha = 0.95 * (a == null ? 1 : a); ctx.lineWidth = lw; ctx.stroke(); ctx.restore();
}
function poly(n, r, rot) { ctx.beginPath(); for (let i = 0; i < n; i++) { const a = rot + i / n * TAU; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); }
function button(x, y, w, h, label, fn, color, size) {
  color = color || '#19f0ff';
  hot.push({ x, y: y + hotOff, w, h, fn, label });
  glow(x + w / 2, y + h / 2, Math.max(w, h) * 0.7, color, 0.14);
  rr(x, y, w, h, 10); ctx.fillStyle = hexA(color, 0.16); ctx.fill(); ctx.fillStyle = 'rgba(4,6,16,0.55)'; ctx.fill();
  nstroke(color, 1.6);
  txt(label, x + w / 2, y + h / 2 + 1, size || 18, '#fff', 'center', '800');
}
// class emblem (also used as the in-game hero sprite)
function drawEmblem(id, x, y, r, color, t, filled) {
  ctx.save(); ctx.translate(x, y);
  const core = () => { ctx.fillStyle = hexA(color, filled ? 0.5 : 0.28); ctx.fill(); };
  switch (id) {
    case 'runner': ctx.beginPath(); ctx.moveTo(0, -r * 1.1); ctx.lineTo(r * 0.95, r * 0.8); ctx.lineTo(0, r * 0.35); ctx.lineTo(-r * 0.95, r * 0.8); ctx.closePath(); core(); nstroke(color, Math.max(1.4, r / 9)); break;
    case 'breacher': poly(6, r, Math.PI / 6); core(); nstroke(color, Math.max(1.4, r / 9)); poly(4, r * 0.45, Math.PI / 4 + (t || 0) * 0.5); nstroke(color, Math.max(1, r / 14)); break;
    case 'phantom': ctx.beginPath(); ctx.moveTo(0, -r * 1.15); ctx.lineTo(r * 0.8, 0); ctx.lineTo(0, r * 1.15); ctx.lineTo(-r * 0.8, 0); ctx.closePath(); core(); nstroke(color, Math.max(1.4, r / 9)); ctx.beginPath(); ctx.arc(0, 0, r * 0.28, 0, TAU); nstroke(color, Math.max(1, r / 14)); break;
    case 'overclock': ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); core(); nstroke(color, Math.max(1.4, r / 9)); ctx.beginPath(); for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + i * 2.1; ctx.moveTo(Math.cos(a) * r * 0.25, Math.sin(a) * r * 0.25); ctx.lineTo(Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85); } nstroke(color, Math.max(1, r / 12)); break;
    case 'daemon': ctx.beginPath(); ctx.rect(-r * 0.85, -r * 0.85, r * 1.7, r * 1.7); core(); nstroke(color, Math.max(1.4, r / 9)); ctx.beginPath(); ctx.rect(-r * 0.35, -r * 0.35, r * 0.7, r * 0.7); nstroke(color, Math.max(1, r / 14)); ctx.beginPath(); for (let k = -1; k <= 1; k += 2) { ctx.moveTo(k * r * 0.85, 0); ctx.lineTo(k * r * 1.25, 0); ctx.moveTo(0, k * r * 0.85); ctx.lineTo(0, k * r * 1.25); } nstroke(color, Math.max(1, r / 14)); break;
    case 'blackout': ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); core(); nstroke(color, Math.max(1.4, r / 9)); ctx.beginPath(); ctx.moveTo(-r * 1.25, 0); ctx.lineTo(-r * 0.4, 0); ctx.moveTo(r * 1.25, 0); ctx.lineTo(r * 0.4, 0); ctx.moveTo(0, -r * 1.25); ctx.lineTo(0, -r * 0.4); ctx.moveTo(0, r * 1.25); ctx.lineTo(0, r * 0.4); nstroke(color, Math.max(1, r / 12)); break;
    case 'glitch': { const j = Math.sin((t || 0) * 13) * r * 0.08; ctx.translate(j, 0); ctx.beginPath(); ctx.rect(-r * 0.8, -r * 0.8, r * 1.5, r * 1.5); core(); nstroke('#19f0ff', Math.max(1.2, r / 10)); ctx.translate(-2 * j - r * 0.18, r * 0.12); ctx.beginPath(); ctx.rect(-r * 0.6, -r * 0.7, r * 1.4, r * 1.4); nstroke(color, Math.max(1.2, r / 10)); break; }
    default: ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); core(); nstroke(color, 1.5);
  }
  ctx.restore();
}

function drawGun(type, x, y, ang, s, color) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.scale(s, s);
  const body = (bx, by, w, h, c) => {
    if (c === color) { ctx.fillStyle = color; ctx.fillRect(bx, by, w, h); return; }
    ctx.fillStyle = '#0a1020'; ctx.fillRect(bx, by, w, h); ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.globalAlpha = 0.85; ctx.strokeRect(bx + 0.5, by + 0.5, w - 1, h - 1); ctx.globalAlpha = 1;
  };
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
let fxOverlay = null, fxKey = '';
function scanOverlay() {      // cheap CRT/bloom feel: scanlines + vignette, pre-rendered once per size
  const key = LW + 'x' + LH; if (fxKey === key && fxOverlay) return fxOverlay;
  const c = document.createElement('canvas'); c.width = LW; c.height = LH; const x = c.getContext('2d');
  x.fillStyle = 'rgba(0,0,0,0.10)'; for (let y = 0; y < LH; y += 3) x.fillRect(0, y, LW, 1);
  const g = x.createRadialGradient(LW / 2, LH / 2, Math.min(LW, LH) * 0.35, LW / 2, LH / 2, Math.max(LW, LH) * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,12,0.55)'); x.fillStyle = g; x.fillRect(0, 0, LW, LH);
  fxOverlay = c; fxKey = key; return c;
}
function drawWorld() {
  const g = G, p = g.player, t = performance.now() / 1000;
  const fo = g.floorOff || { x: 0, y: 0, w: LW, h: LH }; ctx.drawImage(g.floor, fo.x, fo.y, fo.w, fo.h);
  const hue = g.hue;
  // door
  const cx = ARENA.x + ARENA.w / 2;
  if (g.doorOpen) {
    glow(cx, ARENA.y + 2, 50, '#19f0ff', 0.7 + Math.sin(t * 5) * 0.15);
    ctx.fillStyle = '#02030a'; ctx.fillRect(cx - 24, ARENA.y - 6, 48, 10);
    ctx.beginPath(); ctx.moveTo(cx - 24, ARENA.y + 4); ctx.lineTo(cx - 24, ARENA.y - 6); ctx.lineTo(cx + 24, ARENA.y - 6); ctx.lineTo(cx + 24, ARENA.y + 4); nstroke('#19f0ff', 2);
    txt('▲', cx, ARENA.y + 16 + Math.sin(t * 6) * 3, 14, '#19f0ff', 'center');
  } else {
    ctx.fillStyle = '#12020a'; ctx.fillRect(cx - 24, ARENA.y - 4, 48, 6);
    ctx.beginPath(); for (let i = 0; i < 5; i++) { ctx.moveTo(cx - 20 + i * 10, ARENA.y - 4); ctx.lineTo(cx - 20 + i * 10, ARENA.y + 2); } nstroke('#ff2b5c', 1.6, 0.9);
  }
  drawHazardsUnder(t);
  // fire / plasma patches
  g.patches.forEach(f => { const a = clamp(f.life / f.max, 0, 1); glow(f.x, f.y, f.r * 2, '#ff5a1a', 0.8 * a); glow(f.x, f.y - 2 + Math.sin(t * 20 + f.x) * 1.5, f.r * 0.9, '#ffe066', 0.8 * a); });
  // chests (data crates)
  g.chests.forEach(c => {
    const o = c.open;
    glow(c.x, c.y, 38, '#ffe81a', o ? 0.18 : 0.55 + Math.sin(t * 4) * 0.12);
    ctx.fillStyle = '#0a0d1a'; rr(c.x - 14, c.y - 8, 28, 19, 3); ctx.fill(); nstroke(o ? '#a08a10' : '#ffe81a', 1.6);
    ctx.beginPath(); ctx.moveTo(c.x - 14, c.y - 1); ctx.lineTo(c.x + 14, c.y - 1); nstroke(o ? '#a08a10' : '#ffe81a', 1.2);
    if (o) { ctx.beginPath(); ctx.moveTo(c.x - 14, c.y - 8); ctx.lineTo(c.x - 10, c.y - 18); ctx.lineTo(c.x + 10, c.y - 18); ctx.lineTo(c.x + 14, c.y - 8); nstroke('#a08a10', 1.4); }
    else { ctx.fillStyle = '#ffe81a'; ctx.fillRect(c.x - 3, c.y - 4, 6, 6); }
  });
  // items: rarity beam + glow only (no labels; details appear in the inspect card when standing close)
  g.items.forEach(it => {
    const bob = Math.sin(t * 4 + it.x) * 2;
    if (it.kind === 'heart') { glow(it.x, it.y, 18, '#39ff6a', 0.8); txt('+', it.x, it.y + bob, 18, '#39ff6a', 'center'); return; }
    if (it.kind === 'credit') { glow(it.x, it.y, 11, '#ffe81a', 0.8); ctx.save(); ctx.translate(it.x, it.y + bob * 0.5); ctx.rotate(Math.PI / 4 + t * 2); ctx.fillStyle = '#ffe81a'; ctx.fillRect(-3, -3, 6, 6); ctx.restore(); return; }
    const R = RARITIES[it.w.rarity], col = R.color;
    if (it.w.rarity > 0) {
      const gr = ctx.createLinearGradient(0, it.y - 80, 0, it.y); gr.addColorStop(0, hexA(col, 0)); gr.addColorStop(1, hexA(col, 0.5 + it.w.rarity * 0.1));
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = gr; ctx.fillRect(it.x - 5 - it.w.rarity, it.y - 80, 10 + it.w.rarity * 2, 80); ctx.globalCompositeOperation = 'source-over';
    }
    glow(it.x, it.y, 26 + it.w.rarity * 4 + Math.sin(t * 5) * 2, col, 0.7 + it.w.rarity * 0.08);
    drawGun(it.w.type, it.x - 6, it.y + bob, -0.35, 1.0, col);
    if (it === g.near) {
      ctx.beginPath(); ctx.arc(it.x, it.y + 2, 17 + Math.sin(t * 6) * 1.5, 0, TAU); nstroke('#ffffff', 1.6, 0.6 + Math.sin(t * 8) * 0.3);
    }
  });
  // turrets & decoys
  g.turrets.forEach(tu => {
    const k = clamp(tu.life / tu.max, 0, 1), col = '#39ff6a';
    if (tu.kind === 'mine') { const armed = !(tu.spawn > 0), bl = armed && Math.floor(t * 6 + tu.x) % 2 === 0; glow(tu.x, tu.y, 16, col, bl ? 0.7 : 0.3); ctx.save(); ctx.translate(tu.x, tu.y); ctx.rotate(Math.PI / 4); ctx.fillStyle = '#04120a'; ctx.fillRect(-5, -5, 10, 10); ctx.restore(); ctx.beginPath(); ctx.arc(tu.x, tu.y, 7, 0, TAU); nstroke(col, 1.2, armed ? 0.9 : 0.4); return; }
    if (tu.kind === 'drone') { glow(tu.x, tu.y, 14, col, 0.6); ctx.save(); ctx.translate(tu.x, tu.y); ctx.rotate(tu.aim); poly(3, 6, 0); ctx.fillStyle = '#04120a'; ctx.fill(); nstroke(col, 1.3); ctx.restore(); return; }
    glow(tu.x, tu.y, 24, col, 0.5);
    ctx.save(); ctx.translate(tu.x, tu.y); poly(6, 9, 0); ctx.fillStyle = '#04120a'; ctx.fill(); nstroke(col, 1.6);
    ctx.rotate(tu.aim); ctx.fillStyle = col; ctx.fillRect(2, -2, 13, 4); ctx.restore();
    ctx.beginPath(); ctx.arc(tu.x, tu.y, 14, -Math.PI / 2, -Math.PI / 2 + TAU * k); nstroke(col, 1.4, 0.8);
  });
  g.decoys.forEach(d => {
    if (d.hidden) return;
    const k = clamp(d.life / d.max, 0, 1), fl = 0.5 + 0.3 * Math.sin(t * 30);
    ctx.globalAlpha = fl * (k < 0.25 ? k * 4 : 1); glow(d.x, d.y, 28, '#a65bff', 0.8); drawEmblem('phantom', d.x, d.y, 10, '#a65bff', t, true);
    ctx.fillStyle = 'rgba(166,91,255,0.5)'; for (let i = -3; i <= 3; i++) ctx.fillRect(d.x - 12, d.y + i * 4, 24, 1);
    ctx.globalAlpha = 1;
  });
  // enemies
  g.enemies.forEach(e => drawEnemy(e, t));
  // enemy bullets (hostile plasma)
  g.ebullets.forEach(b => { glow(b.x, b.y, b.r * 3.2, b.color, 0.85); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.6, 0, TAU); ctx.fill(); });
  // player bullets: bright additive trails
  ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  g.bullets.forEach(b => {
    if (b.stuck) { const q = 3 + (Math.sin(t * 30) + 1) * 1.2; ctx.globalAlpha = 1; ctx.fillStyle = '#ff9a3c'; ctx.beginPath(); ctx.arc(b.x, b.y, q, 0, TAU); ctx.fill(); return; }
    const a = Math.atan2(b.vy, b.vx), len = Math.min(26, 8 + Math.hypot(b.vx, b.vy) * 0.03);
    ctx.strokeStyle = b.color; ctx.globalAlpha = 0.35; ctx.lineWidth = b.size * 3.4;
    ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - Math.cos(a) * len, b.y - Math.sin(a) * len); ctx.stroke();
    ctx.globalAlpha = 1; ctx.lineWidth = b.size * 1.5; ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - Math.cos(a) * len * 0.7, b.y - Math.sin(a) * len * 0.7); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(b.x, b.y, b.size * 0.85, 0, TAU); ctx.fill();
  });
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  // player
  drawPlayer(t);
  drawHazardsOver(t);
  // particles (additive)
  ctx.globalCompositeOperation = 'lighter';
  g.parts.forEach(q => {
    const a = clamp(q.life / q.max, 0, 1);
    if (q.ghost) { ctx.globalAlpha = a * 0.5; ctx.fillStyle = '#19f0ff'; ctx.beginPath(); ctx.arc(q.x, q.y, 8 * a + 2, 0, TAU); ctx.fill(); return; }
    ctx.globalAlpha = a; ctx.fillStyle = q.color; ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
  });
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  g.fx.forEach(f => {
    const k = 1 - f.life / f.m;
    if (f.t === 'ring') { ctx.beginPath(); ctx.arc(f.x, f.y, 4 + (f.max - 4) * k, 0, TAU); nstroke(f.color, 2.2 * (1 - k) + 0.8, 1 - k); }
    else if (f.t === 'bolt') {
      ctx.beginPath(); ctx.moveTo(f.x1, f.y1);
      const n = 5; for (let i = 1; i < n; i++) { const u = i / n; ctx.lineTo(f.x1 + (f.x2 - f.x1) * u + rnd(-6, 6), f.y1 + (f.y2 - f.y1) * u + rnd(-6, 6)); }
      ctx.lineTo(f.x2, f.y2); nstroke('#9fe8ff', 2, f.life / f.m);
    } else if (f.t === 'target') {          // orbital strike telegraph
      const rr0 = f.r * (1 - k) + 8; ctx.beginPath(); ctx.arc(f.x, f.y, rr0, 0, TAU); nstroke('#ffe81a', 2, 0.9);
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, TAU); nstroke('#ffe81a', 1, 0.35);
      ctx.beginPath(); ctx.moveTo(f.x - f.r - 6, f.y); ctx.lineTo(f.x + f.r + 6, f.y); ctx.moveTo(f.x, f.y - f.r - 6); ctx.lineTo(f.x, f.y + f.r + 6); nstroke('#ffe81a', 1, 0.6);
    } else if (f.t === 'beam') {
      const a = f.life / f.m; ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a; ctx.fillStyle = '#fff6b0'; ctx.fillRect(f.x - 14 * a - 2, cam.y - 40, 28 * a + 4, f.y - cam.y + 40); ctx.globalAlpha = a * 0.5; ctx.fillStyle = '#ffe81a'; ctx.fillRect(f.x - 30 * a, cam.y - 40, 60 * a, f.y - cam.y + 40); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      glow(f.x, f.y, 120 * a + 20, '#ffe81a', 0.9 * a);
    }
  });
  // damage numbers
  g.nums.forEach(n => { ctx.globalAlpha = clamp(n.life / n.max * 1.6, 0, 1); txt(n.text, n.x, n.y, n.size, n.color, 'center', '800'); });
  ctx.globalAlpha = 1;
}

function drawEnemy(e, t) {
  const T = ENEMY_TYPES[e.type], col0 = e.color || T.color;
  ctx.save(); ctx.translate(e.x, e.y);
  if (e.clone) ctx.globalAlpha = 0.62 + 0.18 * Math.sin(t * 9);
  if (e.spawnT > 0) {         // glitch-in
    const k = clamp(1 - e.spawnT / (e.boss ? 1.4 : 0.75), 0, 1);
    ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 24); ctx.beginPath(); ctx.arc(0, 0, e.r * (1.8 - k * 0.8), 0, TAU); nstroke(col0, 1.4);
    ctx.globalAlpha = 0.2 + k * 0.4; ctx.fillStyle = col0; ctx.fillRect(-e.r * k, -e.r * k, e.r * 2 * k, e.r * 2 * k); ctx.restore(); ctx.globalAlpha = 1; return;
  }
  const flash = e.hitT > 0, col = flash ? '#ffffff' : col0, p = G.player, fa = Math.atan2(p.y - e.y, p.x - e.x);
  glow(0, 0, e.r * 2.4, col0, e.boss ? 0.5 : 0.38);
  if (e.warn && Math.floor(t * 16) % 2 === 0) glow(0, 0, e.r * 3, '#ff1f4b', 0.9);
  const fillc = flash ? 'rgba(255,255,255,0.55)' : 'rgba(6,8,18,0.92)';
  switch (e.type) {
    case 'chaser': {        // Rogue Drone: quad-rotor ring with an eye
      ctx.beginPath(); ctx.arc(0, 0, e.r * 0.8, 0, TAU); ctx.fillStyle = fillc; ctx.fill(); nstroke(col, 1.6);
      for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + t * 6; ctx.beginPath(); ctx.arc(Math.cos(a) * e.r * 0.95, Math.sin(a) * e.r * 0.95, 3.2, 0, TAU); ctx.fillStyle = col; ctx.fill(); }
      ctx.fillStyle = flash ? '#fff' : '#ff9ab0'; ctx.beginPath(); ctx.arc(Math.cos(fa) * 3, Math.sin(fa) * 3, 2.8, 0, TAU); ctx.fill(); break; }
    case 'swarm': {         // Malware: glitching shard
      const j = Math.sin(t * 40 + e.wob * 9) > 0.7 ? 1.5 : 0;
      ctx.translate(j, -j); ctx.rotate(e.wob); ctx.beginPath(); ctx.rect(-e.r * 0.8, -e.r * 0.8, e.r * 1.6, e.r * 1.6); ctx.fillStyle = fillc; ctx.fill(); nstroke(col, 1.3);
      ctx.fillStyle = col; ctx.fillRect(-1.5, -1.5, 3, 3); break; }
    case 'shooter': {       // ICE Turret: diamond housing + barrel
      ctx.rotate(fa);
      ctx.save(); ctx.rotate(Math.PI / 4); ctx.beginPath(); ctx.rect(-e.r * 0.78, -e.r * 0.78, e.r * 1.56, e.r * 1.56); ctx.fillStyle = fillc; ctx.fill(); nstroke(col, 1.6); ctx.restore();
      ctx.fillStyle = col; ctx.fillRect(2, -2, e.r + 5, 4); ctx.fillStyle = flash ? '#fff' : '#ffe0b0'; ctx.beginPath(); ctx.arc(-1, 0, 2.6, 0, TAU); ctx.fill(); break; }
    case 'tank': {          // Firewall: armoured hex with brick lines
      poly(6, e.r, Math.PI / 6); ctx.fillStyle = fillc; ctx.fill(); nstroke(col, 2.2);
      ctx.beginPath(); ctx.moveTo(-e.r * 0.7, 0); ctx.lineTo(e.r * 0.7, 0); ctx.moveTo(-e.r * 0.35, -e.r * 0.6); ctx.lineTo(-e.r * 0.35, 0); ctx.moveTo(e.r * 0.35, 0); ctx.lineTo(e.r * 0.35, e.r * 0.6); nstroke(col, 1, 0.8);
      ctx.fillStyle = flash ? '#fff' : '#ffb347'; ctx.beginPath(); ctx.arc(Math.cos(fa) * 5, Math.sin(fa) * 5, 3, 0, TAU); ctx.fill(); break; }
    case 'boss': {          // The Admin
      const pulse = 1 + Math.sin(t * 6) * 0.04;
      ctx.save(); ctx.rotate(t * 0.6); poly(8, e.r * pulse, 0); ctx.fillStyle = fillc; ctx.fill(); nstroke(col, 3); ctx.restore();
      ctx.save(); ctx.rotate(-t * 0.9); poly(4, e.r * 0.8, Math.PI / 4); nstroke(e.phase === 2 ? '#ff2a4a' : '#19f0ff', 2); ctx.restore();
      ctx.beginPath(); ctx.arc(0, 0, e.r * 0.34, 0, TAU); ctx.fillStyle = flash ? '#fff' : '#05020a'; ctx.fill(); nstroke(col, 1.6);
      ctx.fillStyle = e.phase === 2 ? '#ff3355' : '#19f0ff'; ctx.beginPath(); ctx.arc(Math.cos(fa) * 6, Math.sin(fa) * 6, 6 + Math.sin(t * 8), 0, TAU); ctx.fill(); break; }
    default: drawEnemyExt(e, t, fillc, col, fa, flash);
  }
  if (e.burn > 0) glow(0, -2, e.r * 1.7, '#ff7a1a', 0.7);
  if (e.slow > 0) { ctx.beginPath(); ctx.arc(0, 0, e.r + 4, 0, TAU); nstroke('#8fe3ff', 1.2, 0.8); }
  if (e.stun > 0) { ctx.beginPath(); ctx.arc(0, -e.r - 6, 5, 0, TAU); ctx.moveTo(-6, -e.r - 6); ctx.lineTo(6, -e.r - 6); nstroke('#ffe81a', 1.2, 0.9 * (0.6 + 0.4 * Math.sin(t * 20))); }
  ctx.restore();
  if (!e.boss && !e.invuln && (e.hp < e.max || e.type === 'tank' || e.elite)) {
    const w = Math.max(18, e.r * 2), x = e.x - w / 2, y = e.y - e.r - 9;
    ctx.fillStyle = 'rgba(0,0,10,0.75)'; ctx.fillRect(x - 1, y - 1, w + 2, 5);
    ctx.fillStyle = e.hp / e.max > 0.5 ? '#39ff6a' : e.hp / e.max > 0.25 ? '#ffe81a' : '#ff2b5c'; ctx.fillRect(x, y, w * clamp(e.hp / e.max, 0, 1), 3);
  }
}

function drawPlayer(t) {
  const g = G;
  if (g.coop) { coopDrawPlayers(t); return; }
  if (state === 'dying' || (g.over && !g.won)) return;
  drawHero(g.player, g.C, t, true);
}
function drawHero(p, C, t, mine) {
  const blink = p.iframes > 0 && p.dashT <= 0 && Math.floor(t * 20) % 2 === 0;
  if (blink) ctx.globalAlpha = 0.45;
  if (p.cloak > 0) ctx.globalAlpha = 0.3 + 0.1 * Math.sin(t * 12);
  if (p.surge > 0) glow(p.x, p.y, 32, '#ff4d6d', 0.45);
  if (p.boost > 0) glow(p.x, p.y, 30, '#5ff0d0', 0.35);
  const w = p.slots[p.active], col = w ? RARITIES[w.rarity].color : '#fff';
  glow(p.x, p.y, 26, C.color, 0.45);
  if (w && w.rarity > 0) glow(p.x, p.y, 30, col, 0.25);
  if (p.overdrive > 0) glow(p.x, p.y, 34, '#ff2a3d', 0.55);
  if (p.haste > 0) glow(p.x, p.y, 32, '#19f0ff', 0.4);
  if (p.ambush) { glow(p.x, p.y, 30, '#a65bff', 0.5 + Math.sin(t * 10) * 0.2); }
  ctx.fillStyle = 'rgba(0,0,10,0.9)'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r - 1, 0, TAU); ctx.fill();
  drawEmblem(C.id, p.x, p.y, p.r, C.color, t, true);
  if (w) drawGun(w.type, p.x + Math.cos(p.aim) * (6 - (p.recoil || 0) * 0.4), p.y + Math.sin(p.aim) * (6 - (p.recoil || 0) * 0.4), p.aim, 1, col);
  ctx.globalAlpha = 1;
  const tg = p.target; if (mine && tg && !tg.dead && p.targetLos) { ctx.strokeStyle = hexA(C.color, 0.2); ctx.lineWidth = 1; ctx.setLineDash([3, 5]); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(tg.x, tg.y); ctx.stroke(); ctx.setLineDash([]); }
}

// ---------------------------------------------------------------- rendering: HUD
function drawSlot(i, s, ws, act, tiny) {
  rr(s.x, s.y, s.w, s.h, 9); ctx.fillStyle = act ? 'rgba(30,40,70,0.75)' : 'rgba(3,5,14,0.7)'; ctx.fill();
  const sc = ws ? RARITIES[ws.rarity].color : '#556';
  if (act) nstroke(sc, 1.8); else { ctx.lineWidth = 1.2; ctx.strokeStyle = sc; ctx.globalAlpha = 0.5; ctx.stroke(); ctx.globalAlpha = 1; }
  if (ws) {
    drawGun(ws.type, s.x + 12, s.y + s.h / 2 + 1, 0, tiny ? 0.8 : 0.9, RARITIES[ws.rarity].color);
    const adj = ws.afx.map(a => AFFIX_BY_ID[a].adj).join(' '), tn = WEAPON_TYPES[ws.type].name;
    fitTxt(adj || tn, s.x + 42, s.y + s.h * 0.35, s.w - 48, tiny ? 11 : 12, RARITIES[ws.rarity].color, 'left');
    fitTxt((adj ? tn + ' · ' : '') + 'DPS ' + Math.round(weaponDps(ws)), s.x + 42, s.y + s.h * 0.74, s.w - 48, tiny ? 9.5 : 10.5, '#b9c2d6', 'left', '600');
  } else txt('Empty slot', s.x + s.w / 2, s.y + s.h / 2, 12, '#7d869c', 'center', '600');
  txt(String(i + 1), s.x + s.w - 9, s.y + 9, 9, '#8a93ab', 'center', '700');
}
function drawPauseBtn(r) {
  rr(r.x, r.y, 28, 28, 7); ctx.fillStyle = 'rgba(3,5,14,0.7)'; ctx.fill(); nstroke('#19f0ff', 1.3, 0.8);
  ctx.fillStyle = '#fff'; ctx.fillRect(r.x + 9, r.y + 8, 3.5, 12); ctx.fillRect(r.x + 15.5, r.y + 8, 3.5, 12);
}
function drawHud() {
  const g = G, p = g.player, P = g.P, L = layout(), t = performance.now() / 1000;
  const w = p.slots[p.active], hpf = clamp(p.hp / P.maxHp, 0, 1), hpCol = hpf > 0.5 ? '#2fe27a' : hpf > 0.25 ? '#ffd21a' : '#ff2b5c';
  const cur = g.cur, zi = ZONES[g.zone], kn = cur.boss ? (cur.boss === 'root' ? 'ROOT' : 'BOSS') : ROOM_KINDS[cur.kind].name;
  const rlab = cur.boss ? '' : ' · R' + cur.rn + '/' + cur.zr;
  const loopTag = g.loop > 1 ? 'LOOP ' + g.loop : '';
  const credStr = '¢ ' + g.credits, credCol = g.cashT > 0 ? '#ffffff' : '#ffe81a';
  if (land) {
    ctx.fillStyle = 'rgba(2,3,10,0.8)'; ctx.fillRect(0, 0, LW, SA.t + 44); ctx.fillStyle = 'rgba(25,240,255,0.45)'; ctx.fillRect(0, SA.t + 43, LW, 1);
    const hx = SA.l + 8, hy = SA.t + 5, hw = 140;
    rr(hx, hy, hw, 18, 6); ctx.fillStyle = '#2a0f16'; ctx.fill();
    if (hpf > 0) { rr(hx, hy, Math.max(8, hw * hpf), 18, 6); ctx.fillStyle = hpCol; ctx.fill(); }
    rr(hx, hy, hw, 18, 6); ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
    txt('♥ ' + Math.ceil(Math.max(0, p.hp)) + ' / ' + P.maxHp, hx + hw / 2, hy + 9.5, 12, '#fff', 'center');
    fitTxt((loopTag ? 'L' + g.loop + ' · ' : '') + 'Z' + g.zone + rlab + ' · ' + credStr + ' · K' + g.kills, hx, SA.t + 33, L.slot[0].x - 10 - hx, 11.5, '#cfd6e6', 'left');
    txt(fmt(g.time), hx + hw + 12, SA.t + 14, 15, '#fff', 'left');
    drawPauseBtn(L.pause);
    L.slot.forEach((sl, i) => drawSlot(i, sl, p.slots[i], p.active === i, true));
    // side panel behind the thumb buttons (keeps the play area clear)
    const px = VIEW.x + VIEW.w + 4;
    ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fillRect(px, VIEW.y, LW - px - SA.r, VIEW.h);
    if (w && w.fx.cursed) txt('CURSED: +35% dmg taken', VIEW.x + 6, VIEW.y + 30, 10.5, '#ff6a8a', 'left', '700');
  } else {
    ctx.fillStyle = 'rgba(2,3,10,0.8)'; ctx.fillRect(0, 0, LW, 58 + SA.t); ctx.fillStyle = 'rgba(25,240,255,0.45)'; ctx.fillRect(0, 57 + SA.t, LW, 1);
    ctx.save(); ctx.translate(0, SA.t);
    const hw = 150, hx = 12 + SA.l;
    rr(hx, 10, hw, 20, 6); ctx.fillStyle = '#2a0f16'; ctx.fill();
    if (hpf > 0) { rr(hx, 10, Math.max(8, hw * hpf), 20, 6); ctx.fillStyle = hpCol; ctx.fill(); }
    rr(hx, 10, hw, 20, 6); ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
    txt('♥ ' + Math.ceil(Math.max(0, p.hp)) + ' / ' + P.maxHp, hx + hw / 2, 20.5, 13, '#fff', 'center');
    fitTxt('Z' + g.zone + rlab + ' · ' + kn, hx, 45, 168, 12.5, '#cfd6e6', 'left');
    txt(fmt(g.time), hx + hw + 28, 20, 14, '#fff', 'center');
    txt(credStr, LW - 46 - SA.r, 20, 14, credCol, 'right', '900');
    txt((loopTag ? loopTag + ' · ' : '') + 'Kills ' + g.kills, LW - 12 - SA.r, 45, 12, loopTag ? '#ffe81a' : '#cfd6e6', 'right');
    if (w && w.fx.cursed) txt('CURSED: +35% dmg taken', VIEW.x + 6, VIEW.y + 30, 10.5, '#ff6a8a', 'left', '700');
    ctx.restore();
    drawPauseBtn(L.pause);
  }
  // boss bar (+ gauntlet timer)
  if (g.boss && !g.boss.dead) {
    const e = g.boss, bw = VIEW.w - 20, bx = VIEW.x + 10, by = VIEW.y + 6, hot_ = e.invuln;
    ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(bx - 1, by - 1, bw + 2, 12);
    ctx.fillStyle = hot_ ? '#8a8fa8' : e.type === 'root' ? (e.phase === 3 ? '#ff6a3c' : '#ffd34a') : e.phase === 2 ? '#ff2a4a' : '#ff2bd6'; ctx.fillRect(bx, by, bw * clamp(e.hp / e.max, 0, 1), 10);
    txt((e.title || 'BOSS') + (e.type === 'root' ? ' · PHASE ' + e.phase + (e.phase === 2 ? ' · NODES ' + e.nodes.filter(n => !n.dead).length + '/4' : '') : ''), VIEW.x + VIEW.w / 2, by + 5.5, 10, '#fff', 'center');
  }
  if (g.elite_ = g.enemies.find(x => x.elite && !x.dead && x.spawnT <= 0)) {
    const e = g.elite_, bw = VIEW.w - 60, bx = VIEW.x + 30, by = VIEW.y + 26;
    ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(bx - 1, by - 1, bw + 2, 10); ctx.fillStyle = e.color || '#ff2bd6'; ctx.fillRect(bx, by, bw * clamp(e.hp / e.max, 0, 1), 8); txt('ELITE: ' + e.title, VIEW.x + VIEW.w / 2, by + 4.5, 9, '#fff', 'center');
  }
  if (g.gaunt && g.roomState === 'fight') {
    const ga = g.gaunt, bw = VIEW.w - 80, bx = VIEW.x + 40, by = VIEW.y + 26, k = clamp(ga.t / ga.max, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(bx - 1, by - 1, bw + 2, 12); ctx.fillStyle = ga.t > 0 ? '#ff5a3c' : '#39ff6a'; ctx.fillRect(bx, by, bw * k, 10);
    txt(ga.t > 0 ? 'GAUNTLET  ' + Math.ceil(ga.t) + 's  ·  wave ' + ga.waves : 'FINISH THEM OFF', VIEW.x + VIEW.w / 2, by + 5.5, 9.5, '#fff', 'center');
  }
  drawRoomChips(t);
  // banner
  if (g.banner && state === 'play') {
    const b = g.banner, a = clamp(b.t * 2, 0, 1), bxm = VIEW.x + VIEW.w / 2, by0 = VIEW.y + VIEW.h * 0.3;
    ctx.globalAlpha = a;
    if (b.zone) { glow(bxm, by0 + 10, VIEW.w * 0.5, b.col || '#fff', 0.25); }
    fitTxt(b.text, bxm, by0, VIEW.w - 16, b.zone ? 25 : 24, b.col && b.zone ? b.col : '#fff', 'center', '900');
    if (b.sub) fitTxt(b.sub, bxm, by0 + 26, VIEW.w - 16, 11.5, '#cfd6e6', 'center', '700');
    if (b.sub2) fitTxt(b.sub2, bxm, by0 + 44, VIEW.w - 16, 12, b.col || '#fff', 'center', '800');
    ctx.globalAlpha = 1;
  }
  // floor weapon inspect card + pickup buttons (only while standing near a weapon), otherwise a short toast
  if (g.near) { drawFloorTip(g.near); drawPickButtons(L, t); }
  else if (g.toast && state === 'play') drawToast(g.toast);
  // slots (portrait; landscape draws them in the top bar)
  if (!land) L.slot.forEach((sl, i) => drawSlot(i, sl, p.slots[i], p.active === i, false));
  // dash + special buttons
  const dcd = clamp(p.dashCd / P.dashCd, 0, 1);
  circBtn(L.dash.x, L.dash.y, L.dash.r, '#1f9bd0', 'DASH', dcd, '⇢');
  const sk = skillDef(g);
  if (sk) {
    const scd = clamp(p.skillT / (p.skillMax || 1), 0, 1);
    circBtn(L.skill.x, L.skill.y, L.skill.r, g.C.color, sk.name.toUpperCase(), scd, '★');
    if (!scd && kbd) txt('Q', L.skill.x + L.skill.r * 0.72, L.skill.y - L.skill.r * 0.72, 10, '#fff', 'center', '800');
  } else lockedSkillBtn(L.skill, g, t);
  drawXpHud(L, t);
  // joystick
  const jh = land ? { x: VIEW.x + 74, y: VIEW.y + VIEW.h - 74 } : { x: 70, y: LH - 74 - SA.b };
  if (joy.active) {
    ctx.globalAlpha = 0.6; ctx.strokeStyle = '#19f0ff'; ctx.lineWidth = 2; ctx.fillStyle = 'rgba(25,240,255,0.08)';
    ctx.beginPath(); ctx.arc(joy.ox, joy.oy, 46, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.globalAlpha = 0.8; ctx.fillStyle = '#19f0ff'; const kx = joy.ox + joy.mx * 40, ky = joy.oy + joy.my * 40; ctx.beginPath(); ctx.arc(kx, ky, 20, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
  } else if (g.time < 7 && g.room === 1) {
    ctx.globalAlpha = 0.45 + Math.sin(t * 4) * 0.15; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(jh.x, jh.y, 40, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(jh.x + Math.sin(t * 2) * 14, jh.y + Math.cos(t * 2) * 10, 16, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill(); ctx.globalAlpha = 1;
    txt('Drag anywhere to move', jh.x, land ? jh.y - 54 : jh.y + 50, 11, '#cfd6e6', 'center', '600');
    txt('Auto-aim & auto-fire', jh.x, land ? jh.y + 56 : jh.y + 64, 11, '#cfd6e6', 'center', '600');
  } else if (land) {
    ctx.globalAlpha = 0.16; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(jh.x, jh.y, 40, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(jh.x, jh.y, 16, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fill(); ctx.globalAlpha = 1;
  }
  if (g.flash > 0) { ctx.fillStyle = 'rgba(255,40,70,' + (g.flash * 0.9).toFixed(2) + ')'; ctx.fillRect(0, 0, LW, LH); }
  if (g.coop) coopHud(L, t);
  if (p.hp / P.maxHp < 0.3 && p.hp > 0) { ctx.strokeStyle = 'rgba(255,40,70,' + (0.25 + Math.sin(t * 6) * 0.15).toFixed(2) + ')'; ctx.lineWidth = 10; ctx.strokeRect(0, 0, LW, LH); }
}

// ---- floor weapon inspect card with stat deltas vs. equipped weapons
const GOOD = '#4dff8a', BAD = '#ff4d6d', NEUT = '#8f98ad';
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
  if (G.P.glitchPick && !w.glitched) lines.push({ c: '#ff3df0', s: 'GLITCH: ' + Math.round(Math.min(1, G.P.glitchPick) * 100) + '% to reroll an affix on pickup' });
  return lines;
}
function drawFloorTip(it) {
  const g = G, p = g.player, w = it.w, R = RARITIES[w.rarity];
  const cols = []; p.slots.forEach((sl, i) => { if (sl) cols.push({ i, w: sl }); });
  const act = p.slots[p.active], lines = floorTipLines(w, act);
  const wd = land ? Math.min(312, VIEW.w - 12) : VIEW.w - 12, rowH = 13.5;
  const h = 12 + 14 + 22 + 14 + STAT_DEFS.length * rowH + 8 + lines.length * 12.5 + 8;
  const ps = toScreen(p.x, p.y);
  const x = land ? (ps.x > VIEW.x + VIEW.w / 2 ? VIEW.x + 6 : VIEW.x + VIEW.w - 6 - wd) : VIEW.x + 6;
  const top = ps.y > VIEW.y + VIEW.h / 2;
  const y = top ? VIEW.y + (g.boss ? 22 : 6) : VIEW.y + VIEW.h - h - (land ? 6 : 60);
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
// skill button before the first upgrade: locked (dim) or pulsing CHOOSE when a point is waiting
function lockedSkillBtn(c, g, t) {
  const ready = g.pts > 0;
  ctx.fillStyle = 'rgba(3,5,14,0.8)'; ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, TAU); ctx.fill();
  if (ready) { glow(c.x, c.y, c.r * 1.7, '#ffe066', 0.35 + 0.25 * Math.sin(t * 6)); ctx.beginPath(); ctx.arc(c.x, c.y, c.r - 2, 0, TAU); nstroke('#ffe066', 3); fitTxt('CHOOSE', c.x, c.y - 4, c.r * 1.6, 10.5, '#fff', 'center', '900'); fitTxt('SKILL', c.x, c.y + 8, c.r * 1.6, 9, '#ffe066', 'center', '800'); }
  else { ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(c.x, c.y, c.r - 2, 0, TAU); ctx.strokeStyle = 'rgba(140,150,180,0.5)'; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]); txt('🔒', c.x, c.y - 5, 12, '#fff', 'center', '700', false); fitTxt('LVL 2', c.x, c.y + 10, c.r * 1.5, 9, '#8a93ab', 'center', '800'); }
}
// level / XP bar, level-up toast and the quick UPGRADE prompt (opens the Tree tab)
function upgradeBtnRect(L) { return land ? { x: LW - SA.r - 160, y: SA.t + 54, w: 152, h: 32 } : { x: L.skill.x - 92, y: L.skill.y - L.skill.r - 36, w: 128, h: 28 }; }
function drawXpHud(L, t) {
  const g = G; if (!g.lvl) return;
  const need = xpNeed(g.lvl), f = clamp(g.xp / need, 0, 1);
  const x = VIEW.x, y = VIEW.y + VIEW.h - 4, w = VIEW.w;
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x, y, w, 4); ctx.fillStyle = '#ffe066'; ctx.fillRect(x, y, w * f, 4);
  txt('LV ' + g.lvl, x + w - 4, y - 7, 9.5, '#ffe066', 'right', '900');
  if (g.pts > 0 && state === 'play' && !(G.client && G.waiting)) {
    const r = upgradeBtnRect(L), pu = 0.5 + 0.5 * Math.sin(t * 6);
    glow(r.x + r.w / 2, r.y + r.h / 2, r.w * 0.6, '#ffe066', 0.2 + 0.2 * pu);
    rr(r.x, r.y, r.w, r.h, r.h / 2); ctx.fillStyle = 'rgba(40,34,4,0.92)'; ctx.fill(); ctx.lineWidth = 1.5 + pu; ctx.strokeStyle = '#ffe066'; ctx.stroke();
    fitTxt('▲ UPGRADE (' + g.pts + ')', r.x + r.w / 2, r.y + r.h / 2 + 1, r.w - 10, 12, '#fff', 'center', '900');
    if (kbd) txt('T', r.x + r.w - 8, r.y + 2, 8.5, '#ffe066', 'center', '800', false);
  }
  if (g.lvlT > 0 && state === 'play') {
    const a = clamp(g.lvlT, 0, 1), cx = VIEW.x + VIEW.w / 2, cy = VIEW.y + VIEW.h * 0.18;
    ctx.globalAlpha = a; glow(cx, cy, 90, '#ffe066', 0.25);
    txt('LEVEL UP!  LV ' + g.lvl, cx, cy, 20, '#ffe066', 'center', '900');
    txt(g.skill ? '+1 skill point · tap UPGRADE' : 'Skill unlocked: tap CHOOSE SKILL', cx, cy + 20, 11, '#fff', 'center', '700');
    ctx.globalAlpha = 1;
  }
}
// off-screen indicators (enemies / teammates / loot / door) and a small room minimap
function drawIndicators() {
  const g = G; if (!g || !g.player || state === 'menu') return;
  const t = performance.now() / 1000, m = 12, cx0 = VIEW.x + VIEW.w / 2, cy0 = VIEW.y + VIEW.h / 2;
  const edge = (wx, wy, col, size, kind) => {
    const s = toScreen(wx, wy); if (s.x >= VIEW.x && s.x <= VIEW.x + VIEW.w && s.y >= VIEW.y && s.y <= VIEW.y + VIEW.h) return;
    const dx = s.x - cx0, dy = s.y - cy0, hw = VIEW.w / 2 - m, hh = VIEW.h / 2 - m, k = Math.min(hw / Math.abs(dx || 1e-6), hh / Math.abs(dy || 1e-6));
    const x = cx0 + dx * k, y = cy0 + dy * k, a = Math.atan2(dy, dx);
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.beginPath(); ctx.moveTo(size, 0); ctx.lineTo(-size * 0.7, size * 0.75); ctx.lineTo(-size * 0.7, -size * 0.75); ctx.closePath();
    ctx.fillStyle = hexA(col, kind === 'enemy' ? 0.8 : 0.95); ctx.fill(); if (kind !== 'enemy') { ctx.lineWidth = 1.2; ctx.strokeStyle = '#fff'; ctx.stroke(); }
    ctx.restore();
  };
  let n = 0;
  g.enemies.forEach(e => { if (e.dead || n > 24) return; n++; edge(e.x, e.y, e.boss || e.elite ? '#ff2bd6' : '#ff3b5c', e.boss || e.elite ? 8 : 5, 'enemy'); });
  g.items.forEach(it => { if (it.kind === 'weapon') edge(it.x, it.y, RARITIES[it.w.rarity].color, 6, 'loot'); });
  g.chests.forEach(c => { if (!c.open) edge(c.x, c.y, '#ffe81a', 6, 'loot'); });
  if (g.shop) edge(g.shop.x, g.shop.y, '#39ff6a', 7, 'loot'); if (g.risk && !g.risk.used) edge(g.risk.x, g.risk.y, '#ff3b6b', 7, 'loot');
  if (g.doorOpen) edge(ARENA.x + ARENA.w / 2, ARENA.y, '#19f0ff', 8 + Math.sin(t * 6), 'door');
  if (g.coop) coopViews().forEach(v => { if (!v.mine && !v.off) edge(v.p.x, v.p.y, v.C.color, 7, 'mate'); });
  drawMinimap(t);
}
function drawMinimap(t) {
  const g = G, mw = land ? 70 : 60, k = mw / ARENA.w, mh = ARENA.h * k;
  const x = VIEW.x + 6, y = VIEW.y + (g.boss && !g.boss.dead ? 22 : 24) + (g.gaunt || g.elite_ ? 12 : 0);
  ctx.globalAlpha = 0.85; rr(x - 2, y - 2, mw + 4, mh + 4, 4); ctx.fillStyle = 'rgba(2,3,10,0.7)'; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = hexA(ZONES[g.zone].col, 0.6); ctx.stroke();
  const P = (wx, wy) => ({ x: x + (wx - ARENA.x) * k, y: y + (wy - ARENA.y) * k });
  ctx.fillStyle = 'rgba(160,170,200,0.35)'; g.pillars.forEach(q => { const a = P(q.x, q.y); ctx.fillRect(a.x, a.y, Math.max(1, q.w * k), Math.max(1, q.h * k)); });
  ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 0.8; const v = P(cam.x, cam.y); ctx.strokeRect(v.x, v.y, VIEW.w * k, VIEW.h * k);
  ctx.fillStyle = '#ff3b5c'; g.enemies.forEach(e => { if (e.dead) return; const a = P(e.x, e.y); ctx.fillRect(a.x - 1, a.y - 1, e.boss ? 4 : 2, e.boss ? 4 : 2); });
  g.items.forEach(it => { if (it.kind !== 'weapon') return; const a = P(it.x, it.y); ctx.fillStyle = RARITIES[it.w.rarity].color; ctx.fillRect(a.x - 1, a.y - 1, 2.5, 2.5); });
  g.chests.forEach(c => { if (c.open) return; const a = P(c.x, c.y); ctx.fillStyle = '#ffe81a'; ctx.fillRect(a.x - 1.5, a.y - 1.5, 3, 3); });
  if (g.doorOpen) { const a = P(ARENA.x + ARENA.w / 2, ARENA.y); ctx.fillStyle = '#19f0ff'; ctx.fillRect(a.x - 4, a.y - 1, 8, 3); }
  if (g.coop) coopViews().forEach(vv => { if (vv.mine || vv.off) return; const a = P(vv.p.x, vv.p.y); ctx.fillStyle = vv.C.color; ctx.beginPath(); ctx.arc(a.x, a.y, 2, 0, TAU); ctx.fill(); });
  const me = P(g.player.x, g.player.y); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(me.x, me.y, 2.4, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;
}
function circBtn(x, y, r, color, label, cd, icon) {
  glow(x, y, r * 1.5, color, cd > 0 ? 0.12 : 0.4);
  ctx.fillStyle = 'rgba(3,5,14,0.8)'; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.fillStyle = hexA(color, cd > 0 ? 0.1 : 0.3); ctx.beginPath(); ctx.arc(x, y, r - 3, 0, TAU); ctx.fill();
  if (cd > 0) {      // cooldown ring fills clockwise as it recharges
    ctx.beginPath(); ctx.arc(x, y, r - 2, 0, TAU); ctx.strokeStyle = hexA(color, 0.25); ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, r - 2, -Math.PI / 2, -Math.PI / 2 + (1 - cd) * TAU); nstroke(color, 3, 0.9);
  } else { ctx.beginPath(); ctx.arc(x, y, r - 2, 0, TAU); nstroke(color, 3); }
  fitTxt(label, x, y + 1, r * 1.55, r > 34 ? 14 : 10.5, cd > 0 ? '#9aa4bd' : '#fff', 'center', '800');
}
function drawToast(T) {
  const w = T.w, R = RARITIES[w.rarity];
  const label = T.head.toUpperCase() + ': ' + w.name;
  ctx.font = '800 12px system-ui,sans-serif';
  const wd = Math.min(VIEW.w - 12, ctx.measureText(label).width + 28), x = VIEW.x + VIEW.w / 2 - wd / 2, y = VIEW.y + (G.boss ? 24 : 8);
  ctx.globalAlpha = clamp(T.t, 0, 0.5) * 2;
  rr(x, y, wd, 24, 12); ctx.fillStyle = 'rgba(8,10,18,0.85)'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = R.color; ctx.stroke();
  fitTxt(label, x + wd / 2, y + 12.5, wd - 16, 12, R.color, 'center', '800');
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- rendering: screens
function overlay(a) { ctx.fillStyle = 'rgba(2,3,10,' + a + ')'; ctx.fillRect(0, 0, LW, LH); }
function statRow(label, val, y, hi, x0, x1) { x0 = x0 == null ? 40 : x0; x1 = x1 == null ? LW - 40 : x1; txt(label, x0, y, 14, '#9aa4bd', 'left', '600'); txt(val, x1, y, 15, hi ? '#ffe81a' : '#fff', 'right', '800'); }
function bestRows() {
  return [['Furthest', best.bestStage ? stageName(best.bestStage) : '-'], ['Best loop', best.bestLoop || '-'], ['Fastest win', best.bestTime ? fmt(best.bestTime) : '-'],
    ['Most kills', best.mostKills || '-'], ['Most damage', best.bestDmg ? best.bestDmg.toLocaleString() : '-'], ['Runs / wins', best.runs + ' / ' + best.wins]];
}
function menuBg(t) {
  ctx.fillStyle = '#03040a'; ctx.fillRect(0, 0, LW, LH);
  // scrolling neon grid
  ctx.strokeStyle = 'rgba(25,240,255,0.07)'; ctx.lineWidth = 1; ctx.beginPath();
  for (let x = 0; x < LW; x += 30) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, LH); }
  const off = (t * 14) % 30; for (let y = -30; y < LH; y += 30) { ctx.moveTo(0, y + off + 0.5); ctx.lineTo(LW, y + off + 0.5); }
  ctx.stroke();
  const cols = ['#19f0ff', '#ff2bd6', '#a65bff', '#39ff6a'];
  for (let i = 0; i < 16; i++) { const x = (i * 97 + Math.sin(t * 0.4 + i) * 20) % LW, y = (i * 53 + t * (10 + i % 7 * 4)) % LH; glow(x, y, 22 + (i % 4) * 7, cols[i % 4], 0.16); }
}
function title(x, y, big) {
  glow(x, y + 24, big ? 150 : 120, '#ff2bd6', 0.16); glow(x, y, big ? 150 : 120, '#19f0ff', 0.14);
  txt('NEON', x - 2, y, big ? 54 : 46, '#19f0ff', 'center', '900');
  txt('VAULT', x + 2, y + (big ? 50 : 44), big ? 54 : 46, '#ff2bd6', 'center', '900');
}
function drawMenuLand(t) {
  menuBg(t);
  const cl = SA.l + (LW - SA.l - SA.r) * 0.27, cr = SA.l + (LW - SA.l - SA.r) * 0.72;
  title(cl, LH * 0.2, false);
  txt('one-thumb neon roguelike shooter', cl, LH * 0.2 + 92, 13, '#9fb0d8', 'center', '600');
  [['pistol', 0], ['smg', 1], ['shotgun', 2], ['sniper', 3]].forEach((q, i) => { const x = cl - 117 + i * 78, y = LH * 0.2 + 128 + Math.sin(t * 2 + i) * 4; glow(x, y, 26, RARITIES[q[1]].color, 0.6); drawGun(q[0], x - 8, y, -0.3, 1.2, RARITIES[q[1]].color); });
  button(cl - 110, LH * 0.2 + 154, 220, 50, 'START RUN', () => { state = 'select'; }, '#19f0ff', 23);
  button(cl - 110, LH * 0.2 + 212, 220, 40, 'CO-OP (1-4 PLAYERS)', () => coopOpen(), '#ff2bd6', 16);
  const cw = 270, cx0 = cr - cw / 2, cy0 = SA.t + 24;
  rr(cx0, cy0, cw, 172, 12); ctx.fillStyle = 'rgba(8,12,28,0.75)'; ctx.fill(); nstroke('#ff2bd6', 1.2, 0.7);
  txt('BEST RUN STATS', cr, cy0 + 20, 13, '#ff2bd6', 'center', '800');
  bestRows().forEach((r, i) => { txt(r[0], cx0 + 16, cy0 + 44 + i * 21, 13, '#9aa4bd', 'left', '600'); txt(String(r[1]), cx0 + cw - 16, cy0 + 44 + i * 21, 14, '#fff', 'right', '800'); });
  ['Drag to move · auto-aim & fire', 'DASH to dodge · SKILL is your class power', 'Stand near a weapon: PICK UP / SWAP button', 'Desktop: WASD, Space dash, Q skill, E pick up, 1/2 equip'].forEach((h, i) => txt(h, cr, cy0 + 198 + i * 17, 11.5, '#8a93ab', 'center', '600', false));
  txt('4 zones + ROOT · 7 classes · New Game+ loops', cr, LH - SA.b - 14, 11.5, '#6f7890', 'center', '600', false);
}
function drawMenu() {
  const t = performance.now() / 1000;
  if (land) { drawMenuLand(t); return; }
  menuBg(t);
  hotOff = Math.max(0, Math.round((LH - 640) * 0.3)); ctx.save(); ctx.translate(0, hotOff);
  title(LW / 2, 98, true);
  txt('one-thumb neon roguelike shooter', LW / 2, 190, 13, '#9fb0d8', 'center', '600');
  [['pistol', 0], ['smg', 1], ['shotgun', 2], ['sniper', 3]].forEach((q, i) => { const x = 62 + i * 78, y = 228 + Math.sin(t * 2 + i) * 4; glow(x, y, 28, RARITIES[q[1]].color, 0.6); drawGun(q[0], x - 8, y, -0.3, 1.2, RARITIES[q[1]].color); });
  button(LW / 2 - 110, 256, 220, 50, 'START RUN', () => { state = 'select'; }, '#19f0ff', 23);
  button(LW / 2 - 110, 314, 220, 40, 'CO-OP (1-4 PLAYERS)', () => coopOpen(), '#ff2bd6', 16);
  rr(28, 366, LW - 56, 160, 12); ctx.fillStyle = 'rgba(8,12,28,0.75)'; ctx.fill(); nstroke('#ff2bd6', 1.2, 0.7);
  txt('BEST RUN STATS', LW / 2, 384, 13, '#ff2bd6', 'center', '800');
  bestRows().forEach((r, i) => { txt(r[0], 44, 406 + i * 20, 13, '#9aa4bd', 'left', '600'); txt(String(r[1]), LW - 44, 406 + i * 20, 14, '#fff', 'right', '800'); });
  ['Drag anywhere to move · auto-aim & fire', 'DASH to dodge · SKILL is your class power', 'Stand near a weapon: PICK UP / SWAP button', 'Desktop: WASD, Space dash, Q skill, E pick up, 1/2 equip']
    .forEach((h, i) => txt(h, LW / 2, 542 + i * 17, 11.5, '#8a93ab', 'center', '600', false));
  txt('4 zones + ROOT · 7 classes · random loot', LW / 2, 640 - 18, 11.5, '#6f7890', 'center', '600', false);
  ctx.restore(); hotOff = 0;
}

// ---- class select
function selGeom() {
  if (land) {
    const W = LW - SA.l - SA.r, cw = Math.min(540, W - 120), y = SA.t + 34, ch = LH - SA.t - SA.b - y - 78;
    return { cw, ch, cx: SA.l + W / 2, y, step: cw + 40, dotY: y + ch + 14, btnY: LH - SA.b - 50 };
  }
  const cw = Math.min(300, LW - 40 - SA.l - SA.r), ch = clamp(LH - SA.t - SA.b - 230, 380, 470), y = SA.t + 54;
  return { cw, ch, cx: SA.l + (LW - SA.l - SA.r) / 2, y, step: cw + 24, dotY: y + ch + 18, btnY: Math.min(LH - SA.b - 68, y + ch + 38) };
}
function selectClass(i) { sel.idx = clamp(i, 0, CLASSES.length - 1); }
function drawClassCard(c, w, h) {
  // origin = card centre
  rr(-w / 2, -h / 2, w, h, 16); ctx.fillStyle = 'rgba(6,9,22,0.92)'; ctx.fill();
  glow(0, -h / 2 + 70, w * 0.45, c.color, 0.22);
  nstroke(c.color, 2);
  const t = performance.now() / 1000, T = TREES[c.id];
  const skills = T.skills.map(id => SKILL_DEFS[id]);
  const list = (x, y, maxW, sz) => { skills.forEach((S, i) => { fitTxt('◆ ' + S.name, x, y + i * (sz * 2.6), maxW, sz + 1, '#fff', 'left', '800'); fitTxt(S.desc, x + 12, y + i * (sz * 2.6) + sz + 2, maxW - 12, sz - 1.5, '#aebbd8', 'left', '600'); }); return y + skills.length * sz * 2.6; };
  if (!land) {
    const top = -h / 2, px = -w / 2 + 20, mw = w - 40;
    drawEmblem(c.id, 0, top + 56, 30, c.color, t, true);
    txt(c.name.toUpperCase(), 0, top + 108, 26, c.color, 'center', '900');
    txt(c.tag, 0, top + 130, 12, '#8f9bbd', 'center', '600', false);
    ctx.fillStyle = hexA(c.color, 0.3); ctx.fillRect(px, top + 144, mw, 1);
    txt('STARTS WITH', px, top + 160, 10, c.color, 'left', '800', false);
    drawGun('pistol', px + 12, top + 180, 0, 1.3, RARITIES[0].color);
    fitTxt('Common Pistol · no skill', px + 46, top + 180, mw - 50, 14, '#fff', 'left', '800');
    txt('SKILL · pick 1 of 3 at your first level-up', px, top + 206, 10, c.color, 'left', '800', false);
    const y = list(px, top + 224, mw, 11.5);
    txt('UPGRADE TREE', px, y + 8, 10, c.color, 'left', '800', false);
    fitTxt(c.branches, px, y + 24, mw, 13, '#fff', 'left', '800');
  } else {
    const L0 = -w / 2 + 20, lw = 150, rx = -w / 2 + lw + 40, mw = w - lw - 60, top = -h / 2;
    drawEmblem(c.id, L0 + lw / 2, top + 54, 30, c.color, t, true);
    txt(c.name.toUpperCase(), L0 + lw / 2, top + 104, 22, c.color, 'center', '900');
    ls_center(c.tag, L0 + lw / 2, top + 126, lw);
    txt('STARTS WITH', L0 + lw / 2, top + 158, 10, c.color, 'center', '800', false);
    drawGun('pistol', L0 + lw / 2 - 16, top + 178, 0, 1.2, RARITIES[0].color);
    fitTxt('Common Pistol', L0 + lw / 2, top + 198, lw, 12, '#fff', 'center', '800');
    fitTxt('no skill yet', L0 + lw / 2, top + 213, lw, 10.5, '#8f9bbd', 'center', '700');
    ctx.fillStyle = hexA(c.color, 0.3); ctx.fillRect(rx - 10, top + 20, 1, h - 40);
    txt('SKILL · pick 1 of 3 at your first level-up', rx, top + 26, 10, c.color, 'left', '800', false);
    const y = list(rx, top + 44, mw, 11);
    txt('UPGRADE TREE', rx, y + 6, 10, c.color, 'left', '800', false);
    fitTxt(c.branches, rx, y + 22, mw, 13, '#fff', 'left', '800');
  }
}
function ls_center(s, x, y, maxW) { wrapLines(s, maxW, 11, '600').forEach((l, i) => txt(l, x, y + i * 13, 11, '#8f9bbd', 'center', '600', false)); }
function drawSelect() {
  menuBg(performance.now() / 1000);
  const G0 = selGeom(), n = CLASSES.length, cur = CLASSES[sel.idx];
  txt('CHOOSE YOUR CLASS', G0.cx, SA.t + (land ? 18 : 28), land ? 15 : 20, '#fff', 'center', '900');
  for (let i = 0; i < n; i++) {
    const o = i - sel.pos, a = Math.abs(o); if (a > 1.7) continue;
    const k = Math.min(1, a);
    ctx.save(); ctx.translate(G0.cx + o * G0.step, G0.y + G0.ch / 2); const sc = 1 - 0.1 * k; ctx.scale(sc, sc); ctx.globalAlpha = 1 - 0.55 * k;
    drawClassCard(CLASSES[i], G0.cw, G0.ch);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  // dots + arrows
  const dgap = 16, dx0 = G0.cx - (n - 1) * dgap / 2;
  for (let i = 0; i < n; i++) { const on = i === sel.idx; glow(dx0 + i * dgap, G0.dotY, on ? 10 : 6, CLASSES[i].color, on ? 0.9 : 0.35); ctx.fillStyle = on ? '#fff' : CLASSES[i].color; ctx.beginPath(); ctx.arc(dx0 + i * dgap, G0.dotY, on ? 3.5 : 2.5, 0, TAU); ctx.fill(); }
  const ar = (x, lbl, d) => { hot.push({ x: x - 22, y: G0.dotY - 16, w: 44, h: 32, fn: () => selectClass(sel.idx + d), label: lbl }); txt(lbl, x, G0.dotY, 24, sel.idx + d < 0 || sel.idx + d >= n ? '#445' : '#fff', 'center', '800', false); };
  ar(G0.cx - (n * dgap) / 2 - 28, '‹', -1); ar(G0.cx + (n * dgap) / 2 + 28, '›', 1);
  if (land) {
    button(SA.l + 16, G0.btnY, 110, 40, 'BACK', () => { state = 'menu'; }, '#7b8cff', 15);
    button(G0.cx - 120, G0.btnY - 4, 240, 48, 'START AS ' + cur.name.toUpperCase(), () => newRun(cur.id), cur.color, 17);
  } else {
    button(G0.cx - 120, G0.btnY, 240, 52, 'START AS ' + cur.name.toUpperCase(), () => newRun(cur.id), cur.color, 17);
    button(G0.cx - 55, G0.btnY + 60, 110, 30, 'BACK', () => { state = 'menu'; }, '#7b8cff', 13);
  }
}

function render() {
  hot = [];
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#02030a'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, offX * dpr, offY * dpr);
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, LW, LH); ctx.clip();
  if (state === 'select') { drawSelect(); ctx.drawImage(scanOverlay(), 0, 0); ctx.restore(); return; }
  if (state === 'coop') { menuBg(performance.now() / 1000); ctx.drawImage(scanOverlay(), 0, 0); ctx.restore(); return; }
  if (state === 'menu' || !G) { drawMenu(); ctx.drawImage(scanOverlay(), 0, 0); ctx.restore(); return; }
  ctx.fillStyle = '#03040a'; ctx.fillRect(0, 0, LW, LH);
  ctx.save();
  ctx.beginPath(); ctx.rect(VIEW.x, VIEW.y, VIEW.w, VIEW.h); ctx.clip();
  if (G.shake > 0) ctx.translate(rnd(-1, 1) * G.shake, rnd(-1, 1) * G.shake);
  ctx.translate(Math.round((VIEW.x - cam.x) * 4) / 4, Math.round((VIEW.y - cam.y) * 4) / 4);
  drawWorld();
  ctx.restore();
  drawIndicators();
  ctx.drawImage(scanOverlay(), 0, 0);
  if (G.fade > 0) { ctx.fillStyle = 'rgba(0,0,0,' + G.fade + ')'; ctx.fillRect(0, 0, LW, LH); }
  drawHud();
  if (state === 'perk') drawPerkScreen();
  else if (state === 'shop') drawShop();
  else if (state === 'risk') drawRisk();
  else if (state === 'pause') drawPause();
  else if (state === 'over') drawEnd(false);
  else if (state === 'win') drawEnd(true);
  if (G && G.coop) coopOverlay();
  ctx.restore();
}

// ---------------------------------------------------------------- main loop
let last = performance.now(), acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000; last = now;
  if (!(dt > 0)) return;
  dt = Math.min(dt, 0.1); acc += dt;
  if (state === 'select' && !selDrag) sel.pos += (sel.idx - sel.pos) * Math.min(1, dt * 12);
  let n = 0;
  while (acc >= 1 / 60 && n < 5) { update(1 / 60); acc -= 1 / 60; n++; }
  if (n === 5) acc = 0;
  updateCamera(dt);
  render();
}
resize();
requestAnimationFrame(frame);

// small hook for automated tests / debugging
window.TDR = {
  get state() { return state; }, set state(v) { state = v; }, get G() { return G; }, newRun, update, render, takePerk, endRun, genWeapon, startRoom,
  setState(s) { state = s; }, best: () => best, hot: () => hot, pickup: pickupNear, layout, resize, useSkill, selectClass, sel, CLASSES,
  startRoom, buildPlan, pickPerks, offerPerks, rerollOffer, banishCard, skipOffer, pickOffer, buyOffer, leaveShop, openShop, riskChoose, startLoop, endToMenu, winRoot, roomCleared, addEnemy, killEnemy, dealDamage,
  spawnCredit, stageName, weaponDps, genCursedWeapon, perkEligible, STAGES, ZONE_OF_STAGE, PERKS,
  makeSeat, playerTick, worldTick, spendNode, gainXp, xpNeed, openTree, castSkill, TREES, SKILL_DEFS, NODE_BY_ID, nodeState, branchPts, cam, VIEW, toScreen, updateCamera,
  get land() { return land; }, SA, ARENA, get LW() { return LW; }, get LH() { return LH; }
};
