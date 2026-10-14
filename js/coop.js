'use strict';
// =====================================================================
//  Online co-op (1-4 players). Host-authoritative: the host's browser runs the
//  simulation with one "seat" per player; clients send inputs/commands and render
//  20 Hz snapshots (smoothed, own movement predicted). A tiny Node server relays.
// =====================================================================
const SNAP_HZ = 20, PERK_TIMEOUT = 30, REVIVE_TIME = 3, REVIVE_R = 38;
const R1 = v => Math.round(v * 10) / 10;
const NET = { ws: null, role: null, pid: null, code: null, token: null, lobby: null, seats: null, myCls: null, ready: false, msg: '', seq: 0, seqT: {}, lastIn: 0, lastX: 9, lastY: 9,
  snapT: 0, snapK: 0, ping: 0, reconnecting: false, recUntil: 0, leaving: false, stats: { snaps: 0, bytes: 0 } };
const EVQ = [];
let evSfx = new Set();

// ---------------------------------------------------------------- seat context
function coopHpMul() { return G && G.coop ? 1 + 0.65 * (G.seats.length - 1) : 1; }
function forEachSeat(fn) { if (!G || !G.coop || G.client) { fn(0, 1); return; } const n = G.seats.length; G.seats.slice().forEach((s, i) => withSeat(s, () => fn(i, n))); }
const TAG_ARRS = ['timers', 'bullets', 'turrets', 'decoys', 'patches'];
function seatOut(s) { const g = G, d = s.d; for (let i = 0; i < SEAT_KEYS.length; i++) d[SEAT_KEYS[i]] = g[SEAT_KEYS[i]]; s.ui = state; }
function seatIn(s) { const g = G, d = s.d; for (let i = 0; i < SEAT_KEYS.length; i++) g[SEAT_KEYS[i]] = d[SEAT_KEYS[i]]; state = s.ui; g.curSeat = s; }
function withSeat(s, fn) {
  const g = G; if (!g || !g.coop || g.client || !s) return fn();
  const prev = g.curSeat, sw = s !== prev;
  if (sw) { seatOut(prev); seatIn(s); }
  const lens = TAG_ARRS.map(k => g[k].length);
  try { return fn(); } finally {
    if (G === g) {
      TAG_ARRS.forEach((k, j) => { const a = g[k]; for (let i = lens[j]; i < a.length; i++) if (a[i] && !a[i].seat) a[i].seat = s; });
      if (sw) { seatOut(s); seatIn(prev); }
    }
  }
}
function seatAlive(s) { return !s.off && !s.d.player.downed; }
// enemies target the nearest living player (cloaked players are ignored while anyone else is visible)
function coopTargetFor(e) { let b = null, bd = 1e9; G.seats.forEach(s => { if (!seatAlive(s)) return; const p = s.d.player, d = Math.hypot(p.x - e.x, p.y - e.y) + (p.cloak > 0 ? 5000 : 0); if (d < bd) { bd = d; b = s; } }); return b; }
function coopNearestSeat(o) { return coopTargetFor(o); }
function coopInit(list) {
  const g = G; g.coop = true; g.host = true; g.paused = false; g.perkT = 0;
  g.seats = list.map((L, i) => ({ id: L.pid, name: L.name, idx: i, local: i === 0, ui: 'play', d: i === 0 ? {} : makeSeat(L.cls), inp: { x: 0, y: 0, seq: 0 }, off: false, sent: {} }));
  const s0 = g.seats[0]; for (const k of SEAT_KEYS) s0.d[k] = g[k];
  g.curSeat = s0;
}
function coopDowned() {
  const g = G, p = g.player; p.hp = 0; p.downed = true; p.rv = 0; p.dashT = 0; p.vx = p.vy = 0;
  burst(p.x, p.y, 26, '#ff5a6e', 180, 3, 0.7); ring(p.x, p.y, 40, '#ff2b5c', 0.5); shake(8);
  g.banner = { text: (g.curSeat ? g.curSeat.name : 'PLAYER').toUpperCase() + ' IS DOWN', sub: 'Stand next to them for ' + REVIVE_TIME + 's to revive', t: 2.2, col: '#ff2b5c' };
}
function coopBulletHit(b, i) {
  const S = G.seats;
  for (let k = 0; k < S.length; k++) {
    const s = S[k]; if (!seatAlive(s)) continue; const p = s.d.player, rr = b.r + p.r - 2;
    if ((b.x - p.x) * (b.x - p.x) + (b.y - p.y) * (b.y - p.y) < rr * rr) {
      if (p.dashT <= 0 && p.iframes <= 0) { withSeat(s, () => hurtPlayer(b.dmg)); if (G.ebullets[i] === b) G.ebullets.splice(i, 1); }
      return;
    }
  }
}

// ---------------------------------------------------------------- host simulation
function coopUpdate(dt) { if (G.client) clientTick(dt); else hostTick(dt); }
function hostTick(dt) {
  const g = G, seats = g.seats;
  hostPump();
  if (G !== g) return;
  if (g.over) { updateFx(dt); if (!g.won && g.endDelay > 0) { g.endDelay -= dt; if (g.endDelay <= 0) forEachSeat(() => { state = 'over'; }); } return; }
  if (g.won || g.paused) return;
  g.time += dt;
  seats.forEach(s => {
    if (s.off) return;
    withSeat(s, () => {
      let x = 0, y = 0;
      if (s.local) { if (state === 'play') { const i = localInput(); x = i.x; y = i.y; } }
      else if (state === 'play') { x = s.inp.x; y = s.inp.y; }
      playerTick(dt, x, y);
    });
  });
  // revive: a living teammate standing close fills the downed player's ring
  seats.forEach(s => {
    const p = s.d.player; if (!p.downed || s.off) return;
    const near = seats.some(o => o !== s && seatAlive(o) && Math.hypot(o.d.player.x - p.x, o.d.player.y - p.y) < REVIVE_R);
    p.rv = near ? (p.rv || 0) + dt / REVIVE_TIME : Math.max(0, (p.rv || 0) - dt * 0.5);
    if (p.rv >= 1) withSeat(s, () => { p.downed = false; p.rv = 0; p.hp = Math.round(G.P.maxHp * 0.35); p.iframes = 2; ring(p.x, p.y, 50, '#39ff6a', 0.5); burst(p.x, p.y, 20, '#39ff6a', 140, 3, 0.6); G.banner = { text: s.name.toUpperCase() + ' REVIVED', t: 1.4, col: '#39ff6a' }; sfx('heal', 700, 0.2, 'sine', 0.06, 1.5); });
  });
  runTimers(dt); if (G !== g) return;
  let first = true; seats.forEach(s => { if (s.off) return; withSeat(s, () => updateHazards(dt, !first)); first = false; });
  if (g.boss && !g.boss.dead) { const s = coopTargetFor(g.boss); if (s) withSeat(s, () => updateBossAI(dt)); }
  g.enemies.forEach(e => { const s = coopTargetFor(e); if (s) withSeat(s, () => updateEnemy(e, dt)); });
  for (let i = g.enemies.length - 1; i >= 0; i--) if (g.enemies[i].dead) g.enemies.splice(i, 1);
  separate();
  updateBullets(dt);
  updateEnemyBullets(dt);
  updatePatches(dt);
  updateSkillObjects(dt);
  updateItems(dt, 1);
  seats.forEach(s => { if (!s.off) withSeat(s, () => updateItems(dt, 2)); });
  updateFx(dt);
  updateRoomFlow(dt);
  seats.forEach(s => { if (!s.off) withSeat(s, seatRoomFlow); });
  // door opens once every player has picked a perk (or after a timeout: stragglers skip)
  if (g.roomState === 'clear' && g.perkDone && !g.doorOpen) {
    g.perkT -= dt;
    const sv = (s, k) => s === g.curSeat ? g[k] : s.d[k];
    const waiting = seats.filter(s => !s.off && sv(s, 'perkOffer') && sv(s, 'perkMode') !== 'risk');
    if (g.perkT <= 0) waiting.forEach(s => withSeat(s, () => { if (G.perkOffer) { state = 'perk'; skipOffer(); } }));
    if (!waiting.length || g.perkT <= 0) { g.doorOpen = true; g.banner = { text: 'DOOR OPEN', sub: g.plan[g.room] ? 'Next: ' + (g.plan[g.room].boss ? 'BOSS' : ROOM_KINDS[g.plan[g.room].kind].name) + ' · any player can go through' : '', t: 1.8, col: '#19f0ff' }; }
  }
  if (g.advance) { g.advance = false; advanceDoor(); }
  const act = seats.filter(s => !s.off);
  if (act.length && act.every(s => s.d.player.downed) && !g.over) { endRun(false); }
}
function hostCmd(m) {
  const g = G; if (!g || !g.coop || g.client) return;
  const s = g.seats.find(x => x.id === m.from); if (!s) return;
  if (m.t === 'in') { const l = Math.hypot(+m.x || 0, +m.y || 0), k = l > 1 ? 1 / l : 1; s.inp.x = (+m.x || 0) * k; s.inp.y = (+m.y || 0) * k; s.inp.seq = m.q | 0; return; }
  const i = m.i == null ? undefined : m.i | 0;
  withSeat(s, () => {
    switch (m.c) {
      case 'dash': doDash(); break;
      case 'skill': useSkill(); break;
      case 'pick': pickupNear(i); break;
      case 'swap': swapWeapon(i); break;
      case 'perk': if (state === 'perk') { G.banishMode = !!m.b; pickOffer(i); } break;
      case 'reroll': rerollOffer(); break;
      case 'skip': skipOffer(); break;
      case 'buy': if (state === 'shop') buyOffer(i); break;
      case 'leaveShop': leaveShop(); break;
      case 'risk': riskChoose(i); break;
      case 'tree': spendNode(String(m.n || ''), i); break;
    }
  });
}
function hostNet(m) {
  const g = G;
  if (m.t === 'in' || m.t === 'cmd') { hostCmd(m); return; }
  if (!g || !g.coop || g.client) return;
  const s = g.seats.find(x => x.id === m.pid);
  if (m.t === 'drop' && s) { s.off = true; g.banner = { text: s.name.toUpperCase() + ' DISCONNECTED', sub: 'Waiting 30s for them to reconnect', t: 2.2, col: '#ff9a3c' }; }
  else if (m.t === 'rejoin' && s) { s.off = false; s.sent = {}; s.d.player.iframes = 2; g.banner = { text: s.name.toUpperCase() + ' RECONNECTED', t: 1.6, col: '#39ff6a' }; }
  else if (m.t === 'leave' && s) {
    if (s === g.curSeat) return;
    g.seats.splice(g.seats.indexOf(s), 1); g.seats.forEach((x, i) => { x.idx = i; });
    TAG_ARRS.forEach(k => g[k].forEach(o => { if (o.seat === s) o.seat = null; }));
    g.banner = { text: s.name.toUpperCase() + ' LEFT', t: 1.8, col: '#ff9a3c' };
  }
}

// ---------------------------------------------------------------- host -> clients snapshots
const EN_KEYS = ['type', 'x', 'y', 'r', 'hp', 'max', 'spawnT', 'hitT', 'warn', 'burn', 'slow', 'stun', 'boss', 'elite', 'invuln', 'clone', 'color', 'phase', 'title', 'wob', 'state', 'rot', 'shieldFlash', 'cls', 'rage'];
function serEnemy(e) {
  const o = { n: e.nid };
  for (let i = 0; i < EN_KEYS.length; i++) { const k = EN_KEYS[i], v = e[k]; if (v === undefined || v === null || v === false || v === 0) continue; o[k] = typeof v === 'number' ? R1(v) : v; }
  if (e.shields) o.shields = e.shields;
  if (e.w) o.w = { type: e.w.type, rarity: e.w.rarity };
  if (e.nodes) o.nodes = e.nodes.filter(x => !x.dead).map(x => x.nid);
  return o;
}
const serW = w => w ? { type: w.type, rarity: w.rarity, afx: w.afx, fx: w.fx, bdmg: R1(w.bdmg), rate: Math.round(w.rate * 1000) / 1000, pellets: w.pellets, dmg: R1(w.dmg), name: w.name, id: w.id } : null;
function serShop(sh) { return sh ? { x: R1(sh.x), y: R1(sh.y), r: sh.r, ign: sh.ign, offers: sh.offers.map(o => o.kind === 'perk' ? { kind: 'perk', perk: o.perk.id, price: o.price, sold: o.sold } : o.kind === 'weapon' ? { kind: 'weapon', w: serW(o.w), price: o.price, sold: o.sold } : o) } : null; }
function seatDetail(s) {
  const d = s.d, p = d.player;
  return {
    cr: d.credits, cs: d.cashT > 0 ? 1 : 0, sl: p.slots.map(serW), ac: p.active, dc: R1(p.dashCd), sk: R1(p.skillT), skm: R1(p.skillMax || 1), P: d.P,
    po: d.perkOffer ? d.perkOffer.map(k => k.id) : null, pt: d.perksTaken, pc: d.perkCount, rr: d.rerolls, bn: d.banishes, pm: d.perkMode,
    near: d.near ? d.near.nid : 0, toast: d.toast ? { head: d.toast.head, w: serW(d.toast.w), t: R1(d.toast.t), m: d.toast.m } : null,
    shop: serShop(d.shop), risk: d.risk, found: d.found, fl: R1(d.flash || 0),
    tr: { xp: Math.floor(d.xp), lv: d.lvl, pt: d.pts, t: d.tree, c: d.choice, sk: d.skill }, sh: d.shield
  };
}
function buildSnap() {
  const g = G; seatOut(g.curSeat);
  g.items.forEach(it => { if (!it.nid) it.nid = (g.nidC = (g.nidC || 0) + 1); });
  const ws = g.won ? 'win' : g.over ? (g.endDelay > 0 ? 'dying' : 'over') : 'play';
  const m = {
    t: 'snap', k: ++NET.snapK, A: [ARENA.x, ARENA.y, ARENA.w, ARENA.h].map(R1), room: g.room, zone: g.zone, loop: g.loop, cur: g.cur, nx: g.plan[g.room] || null,
    rs: g.roomState, door: g.doorOpen, kills: g.kills, dmg: Math.round(g.dmgDealt), tm: R1(g.time), clears: g.clears, ws, paused: !!g.paused, banner: g.banner, gaunt: g.gaunt,
    safe: g.safe, shake: R1(g.shake), boss: g.boss ? g.boss.nid : 0, perkT: g.perkDone && !g.doorOpen && g.roomState === 'clear' ? Math.ceil(g.perkT) : 0, fade: R1(g.fade),
    pil: g.pillars, las: g.lasers.map(l => [l.x1, l.y1, l.x2, l.y2, l.s || 0]), pools: g.pools, tiles: g.tiles.map(q => [q.x, q.y, q.w, q.h, q.s || 0, q.ph]),
    en: g.enemies.map(serEnemy),
    eb: g.ebullets.map(b => [R1(b.x), R1(b.y), R1(b.vx), R1(b.vy), b.r, b.color]),
    pb: g.bullets.map(b => [R1(b.x), R1(b.y), R1(b.stuck ? 0 : b.vx), R1(b.stuck ? 0 : b.vy), R1(b.size), b.color, b.stuck ? 1 : 0]),
    it: g.items.map(it => it.kind === 'weapon' ? [it.nid, 'w', R1(it.x), R1(it.y), serW(it.w)] : [it.nid, it.kind, R1(it.x), R1(it.y)]),
    ch: g.chests.map(c => [R1(c.x), R1(c.y), c.open ? 1 : 0, c.locked ? 1 : 0, R1(c.t)]),
    tu: g.turrets.map(t => [R1(t.x), R1(t.y), R1(t.aim), R1(t.life), t.max, t.kind || 'turret', t.spawn > 0 ? 1 : 0]),
    de: g.decoys.filter(d => !d.hidden).map(d => [R1(d.x), R1(d.y), R1(d.life), d.max, d.face]),
    pa: g.patches.map(f => [R1(f.x), R1(f.y), f.r, R1(f.life), f.max]),
    fx: [], nm: [], ev: EVQ.splice(0, EVQ.length),
    S: g.seats.map(s => { const p = s.d.player, w = p.slots[p.active]; return { id: s.id, nm: s.name, c: s.d.C.id, x: R1(p.x), y: R1(p.y), aim: R1(p.aim), face: R1(p.face), hp: R1(Math.max(0, p.hp)), mh: s.d.P.maxHp,
      dn: p.downed ? 1 : 0, ck: p.cloak > 0 ? 1 : 0, bo: p.boost > 0 ? 1 : 0, su: p.surge > 0 ? 1 : 0, lv: s.d.lvl, rv: R1(p.rv || 0), ifr: R1(p.iframes), dt: R1(p.dashT), od: p.overdrive > 0 ? 1 : 0, hs: p.haste > 0 ? 1 : 0, am: p.ambush ? 1 : 0, w: w ? [w.type, w.rarity] : null, off: s.off ? 1 : 0, ack: s.inp.seq, ui: s.ui }; }),
    D: {}
  };
  g.fx.forEach(f => { if (!f._s) { f._s = 1; m.fx.push(f); } });
  g.nums.forEach(n => { if (!n._s) { n._s = 1; m.nm.push([R1(n.x), R1(n.y), n.text, n.color, n.size]); } });
  evSfx = new Set();
  g.seats.forEach(s => {
    if (s.local || s.off) return;
    const det = seatDetail(s), out = {}; let any = false;
    for (const k in det) { const j = JSON.stringify(det[k]); if (s.sent[k] !== j) { s.sent[k] = j; out[k] = det[k]; any = true; } }
    if (any) m.D[s.id] = out;
  });
  return m;
}
function hostPump() {
  const now = performance.now();
  if (now - NET.snapT < 1000 / SNAP_HZ) return;
  NET.snapT = now;
  if (!NET.ws || NET.ws.readyState !== 1) return;
  if (NET.ws.bufferedAmount > 512 * 1024) return;          // host uplink is congested: skip a frame
  const s = JSON.stringify(buildSnap());
  NET.stats.snaps++; NET.stats.bytes += s.length;
  NET.ws.send(s);
}
// hooks so clients can replay particle bursts and sounds
{ const _burst = burst; burst = function (x, y, n, color, spd, size, life) { if (G && G.coop && G.host && EVQ.length < 70) EVQ.push(['b', R1(x), R1(y), n, color, spd, size, life]); return _burst(x, y, n, color, spd, size, life); }; }
{ const _sfx = sfx; sfx = function (name, freq, dur, type, vol, slide) { if (G && G.coop && G.host && !evSfx.has(name) && EVQ.length < 90) { evSfx.add(name); EVQ.push(['s', name, freq, dur, type, vol, slide]); } return _sfx(name, freq, dur, type, vol, slide); }; }

// ---------------------------------------------------------------- client: apply snapshots, predict, smooth
const ORIG = {};
const CLIENT_FNS = {
  doDash() { const g = G; if (!g || state !== 'play') return; const p = g.player; if (p.downed) return; netSend({ t: 'cmd', c: 'dash' });
    if (p.dashCd <= 0 && p.dashT <= 0) { let dx = g.mvx, dy = g.mvy; if (Math.hypot(dx, dy) < 0.1) { dx = Math.cos(p.face); dy = Math.sin(p.face); } const l = Math.hypot(dx, dy) || 1; p.dashDx = dx / l; p.dashDy = dy / l; p.dashT = 0.17; p.dashCd = g.P.dashCd; ORIG.sfx('dash', 400, 0.15, 'sine', 0.06, 2.2); } },
  useSkill() { if (state !== 'play' || G.player.downed) return false; if (!G.skill) { if (G.pts > 0) openTree(); return false; } netSend({ t: 'cmd', c: 'skill' }); return true; },
  spendNode(n, i) { if (!G || G.pts <= 0) return false; netSend({ t: 'cmd', c: 'tree', n: String(n), i: i | 0 }); G.pts--; if (n === 'skill') G.skill = treeOf(G).skills[i | 0]; else { G.tree[n] = (G.tree[n] || 0) + 1; if (NODE_BY_ID[n] && NODE_BY_ID[n].kind === 'choice') G.choice[n] = i | 0; } return true; },
  pickupNear(i) { if (state === 'play' && G.near) netSend({ t: 'cmd', c: 'pick', i }); return true; },
  swapWeapon(i) { if (state === 'play') { if (i == null) i = 1 - G.player.active; netSend({ t: 'cmd', c: 'swap', i }); } },
  pickOffer(i) { netSend({ t: 'cmd', c: 'perk', i, b: !!G.banishMode }); G.banishMode = false; G.perkOffer = null; },
  rerollOffer() { netSend({ t: 'cmd', c: 'reroll' }); return true; },
  skipOffer() { netSend({ t: 'cmd', c: 'skip' }); G.perkOffer = null; },
  buyOffer(i) { netSend({ t: 'cmd', c: 'buy', i }); return true; },
  leaveShop() { netSend({ t: 'cmd', c: 'leaveShop' }); state = 'play'; G.uiHold = 0.4; },
  riskChoose(i) { netSend({ t: 'cmd', c: 'risk', i }); if (i !== 1) { state = 'play'; G.uiHold = 0.4; } },
  startLoop() { return false; },
  endToMenu() { coopLeave(); },
  newRun() { coopLeave(); }
};
function installClient() { for (const k in CLIENT_FNS) { if (!ORIG[k]) ORIG[k] = window[k]; window[k] = CLIENT_FNS[k]; } if (!ORIG.sfx) ORIG.sfx = sfx; }
function uninstallClient() { for (const k in CLIENT_FNS) if (ORIG[k]) window[k] = ORIG[k]; }
function clientStart(seats) {
  installClient();
  const me = seats.find(s => s.pid === NET.pid) || seats[0];
  G = {
    coop: true, client: true, waiting: true, seats, views: {}, room: 1, zone: 1, loop: 1, time: 0, kills: 0, dmgDealt: 0, shake: 0, fade: 1, clears: 0, clearTimes: [],
    enemies: [], bullets: [], ebullets: [], parts: [], nums: [], items: [], chests: [], patches: [], fx: [], pillars: [], timers: [], turrets: [], decoys: [],
    roomState: 'fight', doorOpen: false, boss: null, banner: null, cur: { zone: 1, kind: 'combat', rn: 1, zr: 2, n: 1 }, plan: [], lasers: [], pools: [], tiles: [], safe: null, gaunt: null,
    enMap: new Map(), itMap: new Map(), wstate: 'play', paused: false, perkT: 0, uiHold: 0, floorKey: '', newBest: []
  };
  Object.assign(G, makeSeat(me.cls));
  G.player.x = ARENA.x + ARENA.w / 2; G.player.y = ARENA.y + ARENA.h - 34;
  G.floor = makeFloor(1);
  state = 'play';
}
function clientSnap(m) {
  const g = G; if (!g || !g.client) return;
  NET.stats.snaps++;
  const H = m.A;
  if (ARENA.x !== H[0] || ARENA.y !== H[1] || ARENA.w !== H[2] || ARENA.h !== H[3]) { ARENA.x = H[0]; ARENA.y = H[1]; ARENA.w = H[2]; ARENA.h = H[3]; cam.init = false; }
  const sx = 1, sy = 1, k = 1, X = x => x, Y = y => y;
  g.map = { sx, sy, k };
  g.waiting = false;
  g.room = m.room; g.zone = m.zone; g.loop = m.loop; g.cur = m.cur; g.plan = []; g.plan[m.room] = m.nx; g.roomState = m.rs; g.doorOpen = m.door; g.kills = m.kills; g.dmgDealt = m.dmg;
  g.time = m.tm; g.clears = m.clears; g.wstate = m.ws; g.paused = m.paused; g.perkT = m.perkT; g.fade = Math.max(g.fade * 0.5, m.fade);
  g.banner = m.banner; g.gaunt = m.gaunt; g.shake = Math.max(g.shake, m.shake);
  g.safe = m.safe ? Object.assign({}, m.safe, { cx: X(m.safe.cx), cy: Y(m.safe.cy), r: m.safe.r * k, min: m.safe.min * k }) : null;
  g.pillars = m.pil.map(q => ({ x: X(q.x), y: Y(q.y), w: q.w * sx, h: q.h * sy, mirror: q.mirror }));
  g.lasers = m.las.map(l => ({ x1: X(l[0]), y1: Y(l[1]), x2: X(l[2]), y2: Y(l[3]), s: l[4] }));
  g.pools = m.pools.map(q => ({ x: X(q.x), y: Y(q.y), r: q.r * k, ph: q.ph }));
  g.tiles = m.tiles.map(q => ({ x: X(q[0]), y: Y(q[1]), w: q[2] * sx, h: q[3] * sy, s: q[4], ph: q[5] }));
  const fk = m.room + '|' + m.loop + '|' + m.zone + '|' + H.join() + '|' + ARENA.x + ',' + ARENA.y + ',' + ARENA.w + ',' + ARENA.h + '|' + LW + 'x' + LH + '|' + m.pil.length;
  if (fk !== g.floorKey) { const newRoom = !g.floorKey || g.floorKey.split('|')[0] !== String(m.room) || g.floorKey.split('|')[1] !== String(m.loop); g.floorKey = fk; g.floor = makeFloor(m.room); if (newRoom) { g.fade = 1; g.parts.length = 0; g.fx.length = 0; g.nums.length = 0; g.player.snapNext = true; } }
  // enemies (smoothed toward the latest snapshot)
  const em = new Map();
  m.en.forEach(o => {
    let e = g.enMap.get(o.n); const tx = X(o.x), ty = Y(o.y);
    if (!e) { e = { nid: o.n, x: tx, y: ty }; }
    for (const kk of EN_KEYS) if (kk !== 'x' && kk !== 'y') e[kk] = o[kk] === undefined ? 0 : o[kk];
    e.r = (o.r || 10) * k; e.dead = false; e.shields = o.shields || null; e.w = o.w || null; e.tx = tx; e.ty = ty; e._nodes = o.nodes || null;
    em.set(o.n, e);
  });
  em.forEach(e => { e.nodes = e._nodes ? e._nodes.map(id => em.get(id)).filter(Boolean) : undefined; });
  g.enMap = em; g.enemies = [...em.values()]; g.boss = m.boss ? em.get(m.boss) || null : null;
  g.ebullets = m.eb.map(b => ({ x: X(b[0]), y: Y(b[1]), vx: b[2] * sx, vy: b[3] * sy, r: b[4], color: b[5] }));
  g.bullets = m.pb.map(b => ({ x: X(b[0]), y: Y(b[1]), vx: b[2] * sx, vy: b[3] * sy, size: b[4], color: b[5], stuck: b[6] ? {} : null }));
  const im = new Map();
  m.it.forEach(a => { let it = g.itMap.get(a[0]); const tx = X(a[2]), ty = Y(a[3]); if (!it) it = { nid: a[0], x: tx, y: ty, t: 0 }; it.kind = a[1] === 'w' ? 'weapon' : a[1]; if (a[4]) it.w = a[4]; it.tx = tx; it.ty = ty; im.set(a[0], it); });
  g.itMap = im; g.items = [...im.values()];
  g.chests = m.ch.map(c => ({ x: X(c[0]), y: Y(c[1]), open: !!c[2], locked: !!c[3], t: c[4] }));
  g.turrets = m.tu.map(t => ({ x: X(t[0]), y: Y(t[1]), aim: t[2], life: t[3], max: t[4], kind: t[5], spawn: t[6] ? 1 : 0 }));
  g.decoys = m.de.map(d => ({ x: X(d[0]), y: Y(d[1]), life: d[2], max: d[3], face: d[4] }));
  g.patches = m.pa.map(f => ({ x: X(f[0]), y: Y(f[1]), r: f[2] * k, life: f[3], max: f[4] }));
  m.fx.forEach(f => { const o = Object.assign({}, f); if (o.x != null) { o.x = X(o.x); o.y = Y(o.y); } if (o.x1 != null) { o.x1 = X(o.x1); o.y1 = Y(o.y1); o.x2 = X(o.x2); o.y2 = Y(o.y2); } if (o.r != null) o.r *= k; if (o.max != null && o.t === 'ring') o.max *= k; if (g.fx.length < 120) g.fx.push(o); });
  m.nm.forEach(n => { if (g.nums.length < 60) g.nums.push({ x: X(n[0]), y: Y(n[1]), text: n[2], color: n[3], size: n[4], life: 0.8, max: 0.8 }); });
  m.ev.forEach(e => { if (e[0] === 'b') burst(X(e[1]), Y(e[2]), e[3], e[4], e[5] * k, e[6], e[7]); else if (e[0] === 's') ORIG.sfx(e[1], e[2], e[3], e[4], e[5], e[6]); });
  // players
  const seen = {};
  m.S.forEach(o => {
    seen[o.id] = 1;
    if (o.id === NET.pid) { clientOwn(o, X(o.x), Y(o.y), m); return; }
    let v = g.views[o.id]; const tx = X(o.x), ty = Y(o.y);
    if (!v) v = g.views[o.id] = { id: o.id, p: { x: tx, y: ty, r: 9, slots: [null], active: 0, recoil: 0 } };
    const p = v.p; v.name = o.nm; v.C = CLASS_BY_ID[o.c] || CLASSES[0]; v.off = !!o.off;
    p.tx = tx; p.ty = ty; p.aim = o.aim; p.face = o.face; p.hp = o.hp; p.mh = o.mh; p.downed = !!o.dn; p.rv = o.rv; p.iframes = o.ifr; p.dashT = o.dt; p.overdrive = o.od; p.haste = o.hs; p.ambush = !!o.am; p.cloak = o.ck; p.boost = o.bo; p.surge = o.su; p.r = 9 * k;
    p.slots[0] = o.w ? { type: o.w[0], rarity: o.w[1] } : null;
    if (Math.hypot(tx - p.x, ty - p.y) > 80) { p.x = tx; p.y = ty; }
  });
  for (const id in g.views) if (!seen[id]) delete g.views[id];
  const D = m.D && m.D[NET.pid]; if (D) clientDetail(D, X, Y);
}
function clientOwn(o, sxp, syp, m) {
  const g = G, p = g.player;
  p.hp = o.hp; p.downed = !!o.dn; p.rv = o.rv; p.iframes = o.ifr; p.aim = o.aim; p.overdrive = o.od; p.haste = o.hs; p.ambush = !!o.am; p.cloak = o.ck; p.boost = o.bo; p.surge = o.su; p.r = 9 * g.map.k;
  if (g.P.maxHp !== o.mh) g.P.maxHp = o.mh;
  // reconciliation: compare the host position (+ how far we expect to have moved since that input) with our prediction
  const sent = NET.seqT[o.ack], lat = sent ? Math.min(0.6, (performance.now() - sent) / 1000) : 0.15;
  const ex = sxp + (o.dt > 0 ? 0 : p.vx * lat), ey = syp + (o.dt > 0 ? 0 : p.vy * lat);
  const err = Math.hypot(ex - p.x, ey - p.y);
  if (p.snapNext || err > 70 || p.downed) { p.x = sxp; p.y = syp; p.snapNext = false; }
  else { const gain = err > 18 ? 0.45 : 0.2; p.x += (ex - p.x) * gain; p.y += (ey - p.y) * gain; }
  if (g.uiHold > 0) return;
  const ui = o.ui;
  const wsS = g.wstate === 'win' ? 'win' : g.wstate === 'over' ? 'over' : g.wstate === 'dying' ? 'dying' : null;
  if (wsS) state = wsS;
  else if (state !== 'pause' || ui === 'perk' && !g.perkSeen) { state = ui === 'pause' ? 'play' : ui; if (ui === 'perk') g.perkSeen = true; }
  if (ui !== 'perk') g.perkSeen = false;
}
function clientDetail(D, X, Y) {
  const g = G, p = g.player;
  if ('cr' in D) g.credits = D.cr; if ('cs' in D) g.cashT = D.cs ? 0.5 : 0;
  if ('sl' in D) p.slots = D.sl; if ('ac' in D) p.active = D.ac;
  if ('dc' in D && !(p.dashT > 0)) p.dashCd = D.dc; if ('sk' in D) p.skillT = D.sk; if ('skm' in D) p.skillMax = D.skm;
  if ('P' in D) { Object.assign(g.P, D.P); g.C = CLASS_BY_ID[g.P.cls] || g.C; }
  if ('po' in D) { g.perkOffer = D.po ? D.po.map(id => PERK_BY_ID[id]).filter(Boolean) : null; if (!g.perkOffer) g.banishMode = false; }
  if ('pt' in D) g.perksTaken = D.pt; if ('pc' in D) g.perkCount = D.pc; if ('rr' in D) g.rerolls = D.rr; if ('bn' in D) g.banishes = D.bn; if ('pm' in D) g.perkMode = D.pm;
  if ('near' in D) g.nearId = D.near;
  if ('tr' in D) { const T = D.tr; if (T.lv > g.lvl) g.lvlT = 2.6; g.xp = T.xp; g.lvl = T.lv; g.pts = T.pt; g.tree = T.t || {}; g.choice = T.c || {}; g.skill = T.sk; }
  if ('sh' in D) g.shield = D.sh;
  if ('toast' in D) g.toast = D.toast;
  if ('shop' in D) g.shopRaw = D.shop; if ('risk' in D) g.riskRaw = D.risk; if ('found' in D) g.found = D.found; if ('fl' in D) g.flash = Math.max(g.flash, D.fl);
  g.shop = g.shopRaw ? Object.assign({}, g.shopRaw, { x: X(g.shopRaw.x), y: Y(g.shopRaw.y), offers: g.shopRaw.offers.map(o => o.kind === 'perk' ? Object.assign({}, o, { perk: PERK_BY_ID[o.perk] }) : o) }) : null;
  g.risk = g.riskRaw ? Object.assign({}, g.riskRaw, { x: X(g.riskRaw.x), y: Y(g.riskRaw.y) }) : null;
}
function clientTick(dt) {
  const g = G;
  if (g.uiHold > 0) g.uiHold -= dt;
  const p = g.player, playing = state === 'play' && g.wstate === 'play' && !g.paused && !p.downed && !g.waiting;
  const inp = playing ? localInput() : { x: 0, y: 0 };
  clientSendInput(inp);
  g.mvx = inp.x; g.mvy = inp.y;
  // predicted own movement (same rules as the host), scaled into this device's arena
  const mp = g.map || { sx: 1, sy: 1 };
  p.dashCd -= dt; p.skillT -= dt; if (p.recoil) p.recoil = Math.max(0, p.recoil - dt * 30);
  if (g.toast) { g.toast.t -= dt; if (g.toast.t <= 0) g.toast = null; }
  if (g.banner) { g.banner.t -= dt; if (g.banner.t <= 0) g.banner = null; }
  g.fade = Math.max(0, g.fade - dt * 2.2);
  if (!p.downed && g.wstate === 'play' && !g.paused) {
    if (p.dashT > 0) { p.dashT -= dt; p.x += p.dashDx * 430 * mp.sx * dt; p.y += p.dashDy * 430 * mp.sy * dt; if (Math.random() < 0.9) g.parts.push({ x: p.x, y: p.y, vx: 0, vy: 0, life: 0.25, max: 0.25, size: 8, color: 'rgba(143,227,255,0.5)', ghost: true }); }
    else {
      const sp = 112 * (1 + g.P.spd) * (inPool(p) ? 0.55 : 1);
      p.vx += (inp.x * sp * mp.sx - p.vx) * Math.min(1, dt * 14); p.vy += (inp.y * sp * mp.sy - p.vy) * Math.min(1, dt * 14);
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (inp.x || inp.y) { p.face = Math.atan2(inp.y, inp.x); p.step += dt * 12; }
    }
    resolveCircle(p, p.r);
  } else { p.vx = p.vy = 0; }
  const a = Math.min(1, dt * 16);
  g.enemies.forEach(e => { if (e.tx != null) { e.x += (e.tx - e.x) * a; e.y += (e.ty - e.y) * a; } if (e.hitT > 0) e.hitT -= dt; if (e.spawnT > 0) e.spawnT -= dt; });
  g.items.forEach(it => { it.t += dt; if (it.tx != null) { it.x += (it.tx - it.x) * a; it.y += (it.ty - it.y) * a; } });
  for (const id in g.views) { const v = g.views[id].p; v.x += (v.tx - v.x) * a; v.y += (v.ty - v.y) * a; }
  g.ebullets.forEach(b => { b.x += b.vx * dt; b.y += b.vy * dt; });
  g.bullets.forEach(b => { if (!b.stuck) { b.x += b.vx * dt; b.y += b.vy * dt; } });
  g.near = g.nearId ? g.itMap.get(g.nearId) || null : null;
  updateFx(dt);
}
function clientSendInput(inp) {
  const now = performance.now(), moved = Math.abs(inp.x - NET.lastX) > 0.04 || Math.abs(inp.y - NET.lastY) > 0.04, moving = inp.x || inp.y;
  if (!(moved && now - NET.lastIn > 33) && !(moving && now - NET.lastIn > 50) && !(now - NET.lastIn > 400)) return;
  NET.lastIn = now; NET.lastX = inp.x; NET.lastY = inp.y;
  const q = ++NET.seq; NET.seqT[q] = now; delete NET.seqT[q - 120];
  netSend({ t: 'in', x: R1(inp.x * 10) / 10, y: R1(inp.y * 10) / 10, q });
}

// ---------------------------------------------------------------- drawing
function coopViews() {
  const g = G;
  if (g.client) { const out = Object.values(g.views).map(v => ({ p: v.p, C: v.C, name: v.name, off: v.off, mine: false })); out.push({ p: g.player, C: g.C, name: NET.name || 'You', mine: true }); return out; }
  return g.seats.map(s => ({ p: s.d.player, C: s === g.curSeat ? g.C : s.d.C, name: s.name, off: s.off, mine: s.local }));
}
function coopDrawPlayers(t) {
  const g = G, V = coopViews();
  V.forEach(v => {
    const p = v.p; if (v.off) { ctx.globalAlpha = 0.25; drawEmblem(v.C.id, p.x, p.y, 9, '#8a93ab', t, false); ctx.globalAlpha = 1; txt(v.name + ' (reconnecting)', p.x, p.y - 18, 9, '#8a93ab', 'center', '700'); return; }
    if (p.downed) {
      ctx.globalAlpha = 0.4; drawEmblem(v.C.id, p.x, p.y, 9, v.C.color, t, false); ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, 17, 0, TAU); ctx.strokeStyle = 'rgba(255,43,92,0.5)'; ctx.lineWidth = 3; ctx.stroke();
      if (p.rv > 0) { ctx.beginPath(); ctx.arc(p.x, p.y, 17, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(p.rv, 0, 1)); nstroke('#39ff6a', 3); }
      txt('DOWN', p.x, p.y + 26, 9, '#ff2b5c', 'center', '800');
    } else drawHero(p, v.C, t, v.mine);
    txt(v.mine ? 'YOU' : v.name, p.x, p.y - 19, 9, v.C.color, 'center', '800');
  });
}
function coopHud(L, t) {
  const g = G, V = coopViews().filter(v => !v.mine);
  const x0 = VIEW.x + VIEW.w - 98, y0 = VIEW.y + (g.boss && !g.boss.dead ? 22 : 8) + (g.gaunt ? 30 : 0);
  V.forEach((v, i) => {
    const y = y0 + i * 16, p = v.p, mh = p.mh || (v.mine ? g.P.maxHp : 100), f = clamp(p.hp / mh, 0, 1);
    ctx.fillStyle = 'rgba(2,3,10,0.6)'; ctx.fillRect(x0 - 4, y - 6, 98, 14);
    fitTxt(v.name, x0, y + 1, 46, 9.5, v.off ? '#666' : v.C.color, 'left', '800');
    ctx.fillStyle = '#2a0f16'; ctx.fillRect(x0 + 50, y - 2, 40, 6);
    ctx.fillStyle = p.downed ? '#ff2b5c' : f > 0.5 ? '#2fe27a' : f > 0.25 ? '#ffd21a' : '#ff2b5c'; ctx.fillRect(x0 + 50, y - 2, p.downed ? 40 * clamp(p.rv || 0, 0, 1) : 40 * f, 6);
    if (p.downed) txt('DOWN', x0 + 70, y + 1, 7.5, '#fff', 'center', '800');
  });
  const tag = 'CO-OP ' + (NET.code || '') + (g.client && NET.ping ? ' · ' + NET.ping + 'ms' : '') + (g.paused ? ' · HOST PAUSED' : '');
  txt(tag, VIEW.x + 6, VIEW.y + VIEW.h - 8, 9, '#8a93ab', 'left', '700');
  const p = g.player;
  if (p.downed && state === 'play') { const cx = VIEW.x + VIEW.w / 2, cy = VIEW.y + VIEW.h * 0.62; txt('YOU ARE DOWN', cx, cy, 20, '#ff2b5c', 'center', '900'); txt('A teammate can revive you by standing next to you', cx, cy + 20, 10.5, '#cfd6e6', 'center', '700'); }
  if (g.roomState === 'clear' && !g.doorOpen && g.perkT > 0 && state === 'play' && !g.perkOffer) txt('Waiting for teammates to pick perks · ' + g.perkT + 's', VIEW.x + VIEW.w / 2, VIEW.y + VIEW.h * 0.5, 11, '#ffe81a', 'center', '800');
}
function coopOverlay() {
  const g = G;
  if (g.client && g.waiting) { overlay(0.7); txt('Connecting to host…', LW / 2, LH / 2, 16, '#fff', 'center', '800'); }
  if (NET.reconnecting) { ctx.fillStyle = 'rgba(2,3,10,0.75)'; ctx.fillRect(0, LH / 2 - 24, LW, 48); txt('Connection lost · reconnecting…', LW / 2, LH / 2, 15, '#ff9a3c', 'center', '800'); }
  if (g.paused && state === 'play') { ctx.fillStyle = 'rgba(2,3,10,0.6)'; ctx.fillRect(0, LH / 2 - 30, LW, 60); txt('PAUSED BY HOST', LW / 2, LH / 2, 20, '#fff', 'center', '900'); }
  if (state === 'perk' && g.perkT > 0 && g.perkMode !== 'risk') txt('Auto-skip in ' + g.perkT + 's', LW - SA.r - 12, SA.t + 12, 10, '#ffe81a', 'right', '800');
  if (state === 'pause' && g.pauseTab === 0) {
    const X = contentX();
    if (land) { const bw = Math.min(220, X.w * 0.4), y = SA.t + 86 + 108; if (!g.client) btn(X.l, y, bw, 40, g.paused ? 'RESUME FOR ALL' : 'PAUSE ALL PLAYERS', () => { G.paused = !G.paused; }, '#ffe81a', 13); txt('Co-op: the run keeps going while this menu is open', X.l, y + (g.client ? 10 : 54), 10, '#8a93ab', 'left', '600', false); }
    else { const by = LH - SA.b - 54; if (!g.client) btn(LW / 2 - 100, by - 52, 200, 40, g.paused ? 'RESUME FOR ALL' : 'PAUSE ALL PLAYERS', () => { G.paused = !G.paused; }, '#ffe81a', 14); txt('Co-op: the run keeps going while this menu is open', LW / 2, by - (g.client ? 14 : 62), 10, '#8a93ab', 'center', '600', false); }
  }
}
function coopEndButtons(won, cx, y) {
  const g = G;
  if (g.client) { txt('Waiting for the host…', cx, y + 20, 14, '#cfd6e6', 'center', '800'); button(cx - 90, y + 44, 180, 44, 'LEAVE ROOM', () => coopLeave(), '#7b8cff', 15); return; }
  if (won) { button(cx - 120, y, 240, 58, 'LOOP (NEW GAME+)', () => startLoop(), '#ffe81a', 18); button(cx - 120, y + 70, 240, 44, 'END RUN · BACK TO LOBBY', () => coopEndRun(), '#7b8cff', 14); }
  else { button(cx - 110, y, 220, 52, 'BACK TO LOBBY', () => coopEndRun(), '#19f0ff', 18); button(cx - 90, y + 64, 180, 40, 'LEAVE ROOM', () => coopLeave(), '#7b8cff', 14); }
}
function quitToMenu() { if (G && G.coop) { coopLeave(); return; } state = 'menu'; G = null; resize(); }

// ---------------------------------------------------------------- network
function wsUrl() {
  const q = /[?&]ws=([^&]+)/.exec(location.search); if (q) return decodeURIComponent(q[1]);
  if (location.hostname === 'top-down-roguelike.onrender.com') return 'wss://neon-vault-coop.onrender.com/ws';
  return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
}
function netSend(o) { if (NET.ws && NET.ws.readyState === 1) NET.ws.send(JSON.stringify(o)); }
function netConnect(first) {
  return new Promise((res, rej) => {
    if (NET.ws) { NET.leaving = true; try { NET.ws.close(); } catch (e) { /* ignore */ } NET.ws = null; }
    let ws; try { ws = new WebSocket(wsUrl()); } catch (e) { rej(e); return; }
    const to = setTimeout(() => { try { ws.close(); } catch (e) { /* ignore */ } rej(new Error('timeout')); }, 70000);
    ws.onopen = () => { clearTimeout(to); NET.ws = ws; res(ws); ws.send(JSON.stringify(first)); };
    ws.onerror = () => { clearTimeout(to); rej(new Error('connect failed')); };
    ws.onmessage = ev => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } if (m.t === 'snap') NET.stats.bytes += ev.data.length; netMsg(m); };
    ws.onclose = () => { if (NET.ws === ws) { NET.ws = null; netClosed(); } };
  });
}
setInterval(() => { if (NET.ws && NET.ws.readyState === 1) netSend({ t: 'ping', c: performance.now() }); }, 2000);
// closing/navigating away: tell the server right away instead of waiting for the socket to time out
addEventListener('pagehide', e => { if (!e.persisted && NET.ws && NET.ws.readyState === 1) { try { NET.ws.send(JSON.stringify({ t: 'leave' })); } catch (err) { /* ignore */ } } });
function netMsg(m) {
  switch (m.t) {
    case 'joined':
      NET.code = m.code; NET.pid = m.pid; NET.token = m.token; NET.role = m.host ? 'host' : 'client'; NET.lobby = m.lobby;
      try { sessionStorage.setItem('nv_coop', JSON.stringify({ code: m.code, token: m.token })); } catch (e) { /* ignore */ }
      if (NET.reconnecting) { NET.reconnecting = false; if (!m.rejoin && G && G.coop) { coopFail('The run ended while you were away'); return; } }
      if (m.rejoin && !(G && G.coop) && m.seats) { lobbyHide(); clientStart(m.seats); }
      if (!m.rejoin) lobbyRender();
      break;
    case 'lobby': NET.lobby = m; if (!(G && G.coop)) lobbyRender(); break;
    case 'err': NET.msg = m.msg; lobbyRender(); break;
    case 'pong': NET.ping = Math.round(performance.now() - m.c); break;
    case 'start': NET.seats = m.seats; lobbyHide(); if (NET.role === 'host') { const me = m.seats[0]; newRun(me.cls, m.seats); } else clientStart(m.seats); break;
    case 'snap': clientSnap(m); break;
    case 'toLobby': if (G && G.coop) { uninstallClient(); G = null; } state = 'coop'; NET.ready = false; lobbyShow(); break;
    case 'hostLeft': coopFail(m.msg || 'The host left: run ended'); break;
    case 'in': case 'cmd': case 'drop': case 'rejoin': case 'leave': if (NET.role === 'host') hostNet(m); break;
  }
}
function netClosed() {
  if (NET.leaving) { NET.leaving = false; return; }
  if (NET.role === 'client' && G && G.coop && NET.token) {         // try to get back in within the server's grace window
    NET.reconnecting = true; NET.recUntil = performance.now() + 28000;
    const retry = () => {
      if (!NET.reconnecting) return;
      if (performance.now() > NET.recUntil) { NET.reconnecting = false; coopFail('Connection lost'); return; }
      netConnect({ t: 'join', code: NET.code, token: NET.token, name: NET.name, cls: NET.myCls }).catch(() => setTimeout(retry, 2000));
    };
    setTimeout(retry, 800); return;
  }
  if (G && G.coop) coopFail(NET.role === 'host' ? 'Lost connection to the co-op server' : 'Connection lost');
  else if (state === 'coop') { NET.msg = 'Disconnected from server'; NET.code = null; lobbyRender(); }
}
function coopFail(msg) {
  uninstallClient(); NET.reconnecting = false;
  if (NET.ws) { NET.leaving = true; try { NET.ws.close(); } catch (e) { /* ignore */ } NET.ws = null; }
  NET.code = null; NET.lobby = null; NET.role = null;
  G = null; state = 'coop'; NET.msg = msg; lobbyShow(); resize();
}
function coopLeave() {
  netSend({ t: 'leave' }); NET.leaving = true; try { if (NET.ws) NET.ws.close(); } catch (e) { /* ignore */ }
  NET.ws = null; NET.code = null; NET.lobby = null; NET.role = null; NET.reconnecting = false;
  try { sessionStorage.removeItem('nv_coop'); } catch (e) { /* ignore */ }
  uninstallClient(); G = null; state = 'menu'; lobbyHide(); resize();
}
function coopEndRun() { if (!G || G.client) return; if (!G.over) endRun(false); netSend({ t: 'toLobby' }); G = null; state = 'coop'; lobbyShow(); resize(); }

// ---------------------------------------------------------------- lobby UI (DOM overlay)
const LCSS = `
#nvc{position:fixed;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#fff;
 padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);box-sizing:border-box;touch-action:manipulation;-webkit-user-select:none;user-select:none}
#nvc[hidden],#nvc [hidden]{display:none!important}
#nvc .pn{touch-action:pan-y;width:min(92vw,420px);max-height:calc(100% - 16px);overflow:auto;background:rgba(6,9,22,.93);border:1.5px solid #ff2bd6;border-radius:16px;padding:14px 16px;box-shadow:0 0 30px rgba(255,43,214,.25);box-sizing:border-box}
#nvc h2{margin:2px 0 10px;text-align:center;font-weight:900;letter-spacing:2px;color:#ff2bd6;font-size:22px}
#nvc label{display:block;font-size:12px;color:#9aa4bd;font-weight:700;margin:6px 0 4px}
#nvc input{width:100%;box-sizing:border-box;background:#0a0f22;border:1.5px solid #3a4a80;border-radius:10px;color:#fff;font-size:17px;padding:10px;font-weight:800;-webkit-user-select:text;user-select:text}
#nvc input.code{text-transform:uppercase;letter-spacing:6px;text-align:center}
#nvc button{display:block;width:100%;margin:8px 0;padding:12px;border-radius:10px;border:1.6px solid #19f0ff;background:rgba(25,240,255,.12);color:#fff;font-size:16px;font-weight:900;letter-spacing:1px}
#nvc button:disabled{opacity:.4}
#nvc button.pk{border-color:#ff2bd6;background:rgba(255,43,214,.14)} #nvc button.gr{border-color:#39ff6a;background:rgba(57,255,106,.14)} #nvc button.dim{border-color:#7b8cff;background:rgba(123,140,255,.1);font-size:14px;padding:9px}
#nvc .row{display:flex;gap:8px;align-items:center} #nvc .row>*{flex:1}
#nvc .rc{text-align:center;font-size:13px;color:#9aa4bd;font-weight:700} #nvc .rc b{display:block;font-size:40px;letter-spacing:10px;color:#19f0ff;margin:2px 0 4px}
#nvc ul{list-style:none;padding:0;margin:8px 0} #nvc li{display:flex;justify-content:space-between;align-items:center;padding:8px 10px;margin:5px 0;border-radius:10px;background:#0a0f22;border:1px solid #26305a;font-weight:800;font-size:14px}
#nvc li small{font-weight:700;color:#9aa4bd} #nvc .ok{color:#39ff6a} #nvc .no{color:#ff9a3c}
#nvc .cls{display:flex;align-items:center;gap:8px;margin:6px 0} #nvc .cls button{width:48px;flex:0 0 48px;margin:0;padding:8px} #nvc .cls div{flex:1;text-align:center;font-weight:900;font-size:17px}
#nvc .cls div small{display:block;font-size:11px;color:#9aa4bd;font-weight:600}
#nvc .msg{min-height:16px;text-align:center;color:#ff9a3c;font-weight:800;font-size:13px;margin:6px 0}
#nvc .hint{font-size:11px;color:#8a93ab;text-align:center;margin:4px 0}`;
let LUI = null;
function lobbyEl() {
  if (LUI) return LUI;
  const st = document.createElement('style'); st.textContent = LCSS; document.head.appendChild(st);
  const d = document.createElement('div'); d.id = 'nvc'; d.className = 'nv-ui'; d.hidden = true;
  d.innerHTML = `<div class="pn"><h2>CO-OP</h2>
  <div id="nvc-home"><label>YOUR NAME</label><input id="nvc-name" maxlength="12" autocomplete="off" placeholder="Player">
   <button id="nvc-create" class="pk">CREATE ROOM</button>
   <label>OR JOIN WITH A CODE</label><div class="row"><input id="nvc-code" class="code" maxlength="5" autocomplete="off" placeholder="CODE"><button id="nvc-join" style="flex:0 0 96px">JOIN</button></div>
   <div class="hint">Up to 4 players · each picks a class · the host's phone runs the game</div></div>
  <div id="nvc-room" hidden><div class="rc">ROOM CODE<b id="nvc-rc"></b></div>
   <button id="nvc-share" class="dim">SHARE INVITE LINK</button><div class="hint" id="nvc-link"></div>
   <ul id="nvc-players"></ul>
   <label>YOUR CLASS</label><div class="cls"><button id="nvc-prev">‹</button><div id="nvc-cls"></div><button id="nvc-next">›</button></div>
   <button id="nvc-ready" class="gr">READY</button><button id="nvc-start" class="pk">START RUN</button></div>
  <div class="msg" id="nvc-msg"></div><button id="nvc-back" class="dim">BACK</button></div>`;
  document.body.appendChild(d); LUI = d;
  const $ = id => d.querySelector('#' + id);
  const nm = $('nvc-name'); try { nm.value = localStorage.getItem('nv_name') || ''; } catch (e) { /* ignore */ }
  const name = () => { const v = (nm.value || '').trim().slice(0, 12) || 'Player'; NET.name = v; try { localStorage.setItem('nv_name', v); } catch (e) { /* ignore */ } return v; };
  const go = first => { NET.msg = 'Connecting… (the server may take ~50s to wake up)'; lobbyRender(); NET.myCls = NET.myCls || clsId; netConnect(Object.assign(first, { name: name(), cls: NET.myCls })).catch(() => { NET.msg = 'Could not reach the co-op server'; lobbyRender(); }); };
  $('nvc-create').onclick = () => go({ t: 'create' });
  $('nvc-join').onclick = () => { const c = ($('nvc-code').value || '').toUpperCase().trim(); if (c.length < 4) { NET.msg = 'Enter the 4-letter room code'; lobbyRender(); return; } go({ t: 'join', code: c }); };
  $('nvc-code').onkeydown = e => { if (e.key === 'Enter') $('nvc-join').onclick(); };
  const cyc = k => { const i = (CLASSES.findIndex(c => c.id === NET.myCls) + k + CLASSES.length) % CLASSES.length; NET.myCls = CLASSES[i].id; clsId = NET.myCls; saveClass(); netSend({ t: 'set', cls: NET.myCls }); lobbyRender(); };
  $('nvc-prev').onclick = () => cyc(-1); $('nvc-next').onclick = () => cyc(1);
  $('nvc-ready').onclick = () => { NET.ready = !NET.ready; netSend({ t: 'set', ready: NET.ready }); lobbyRender(); };
  $('nvc-start').onclick = () => netSend({ t: 'start' });
  $('nvc-share').onclick = () => { const url = inviteUrl(); if (navigator.share) navigator.share({ title: 'Neon Vault co-op', text: 'Join my Neon Vault run: room ' + NET.code, url }).catch(() => {}); else if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => { NET.msg = 'Link copied'; lobbyRender(); }, () => {}); };
  $('nvc-back').onclick = () => { if (NET.code) { netSend({ t: 'leave' }); NET.leaving = true; try { NET.ws.close(); } catch (e) { /* ignore */ } NET.ws = null; NET.code = null; NET.lobby = null; NET.msg = ''; lobbyRender(); } else { lobbyHide(); state = 'menu'; } };
  return d;
}
function inviteUrl() { return location.origin + location.pathname + '?room=' + NET.code + (/[?&]ws=/.test(location.search) ? '&ws=' + encodeURIComponent(wsUrl()) : ''); }
function lobbyShow() { lobbyEl().hidden = false; lobbyRender(); }
function lobbyHide() { if (LUI) LUI.hidden = true; }
function lobbyRender() {
  const d = lobbyEl(), $ = id => d.querySelector('#' + id), L = NET.lobby, inRoom = !!(NET.code && L);
  $('nvc-home').hidden = inRoom; $('nvc-room').hidden = !inRoom; $('nvc-msg').textContent = NET.msg || '';
  $('nvc-back').textContent = inRoom ? 'LEAVE ROOM' : 'BACK';
  if (!inRoom) return;
  NET.msg = NET.msg === 'Connecting… (the server may take ~50s to wake up)' ? '' : NET.msg; $('nvc-msg').textContent = NET.msg || '';
  $('nvc-rc').textContent = NET.code; $('nvc-link').textContent = inviteUrl();
  const host = NET.role === 'host';
  $('nvc-players').innerHTML = L.players.map(p => { const C = CLASS_BY_ID[p.cls] || CLASSES[0]; return `<li><span style="color:${C.color}">${esc(p.name)}${p.pid === NET.pid ? ' (you)' : ''}<br><small>${C.name} · ${C.branches}</small></span><span class="${p.host || p.ready ? 'ok' : 'no'}">${p.off ? 'offline' : p.host ? 'HOST' : p.ready ? 'READY' : 'not ready'}</span></li>`; }).join('');
  const meP = L.players.find(p => p.pid === NET.pid); if (meP) NET.myCls = meP.cls;
  const C = CLASS_BY_ID[NET.myCls] || CLASSES[0];
  $('nvc-cls').innerHTML = `<span style="color:${C.color}">${C.name.toUpperCase()}</span><small>Pistol start · tree: ${esc(C.branches)}</small>`;
  $('nvc-ready').hidden = host; $('nvc-ready').textContent = NET.ready ? 'READY ✓ (tap to cancel)' : 'READY';
  $('nvc-start').hidden = !host;
  const allReady = L.players.every(p => p.host || p.ready);
  $('nvc-start').disabled = !allReady; $('nvc-start').textContent = allReady ? 'START RUN (' + L.players.length + 'P)' : 'WAITING FOR READY…';
}
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function coopOpen() { state = 'coop'; NET.msg = ''; NET.myCls = NET.myCls || clsId; lobbyShow(); }
// invite links: ?room=CODE opens the co-op screen and joins
(function autoJoin() {
  const m = /[?&]room=([A-Za-z0-9]{4,5})/.exec(location.search); if (!m) return;
  setTimeout(() => {
    coopOpen(); const d = lobbyEl(); d.querySelector('#nvc-code').value = m[1].toUpperCase();
    if (!d.querySelector('#nvc-name').value) d.querySelector('#nvc-name').value = 'Player' + Math.floor(Math.random() * 90 + 10);
    d.querySelector('#nvc-join').onclick();
  }, 50);
})();
window.COOP = { NET, get G() { return G; }, withSeat, coopViews, buildSnap, clientSnap, coopOpen, coopLeave, coopEndRun, hostCmd, lobbyEl, inviteUrl };
