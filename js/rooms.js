'use strict';
// =====================================================================
//  Run structure: plan, zones, room kinds, hazards, bosses, perks, shop
//  (classic script: shares globals with game.js; everything here is called at runtime)
// =====================================================================
const ZONE_OF_STAGE = [1, 1, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5];
const STAGES = ZONE_OF_STAGE.length;
const ZONE_FIRST = { 1: 1, 2: 3, 3: 6, 4: 10, 5: 14 };
const BOSS_AT = { 5: 'sentinel', 9: 'boss', 13: 'twin', 14: 'root' };
const BOSS_NAMES = { sentinel: 'SENTINEL', boss: 'THE ADMIN', twin: 'MIRROR TWIN', root: 'ROOT' };
const ELITE_NAMES = { 1: 'Bit Overseer', 2: 'ICE Warden', 3: 'Bloat Prime', 4: 'Prism Guard' };
const GAUNT_TIME = 32, GAUNT_GAP = 5;

function shuffled(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

// ---------------------------------------------------------------- plan: 14 stages, rooms randomised per run, every zone has variety
function buildPlan() {
  const z = {};
  z[1] = ['combat', pick(['vault', 'shop'])];
  z[2] = [pick(['combat', 'gauntlet']), pick(['elite', 'risk', 'shop', 'vault'])];
  let a = [pick(['combat', 'gauntlet']), pick(['vault', 'risk', 'elite']), pick(['shop', 'elite', 'risk'])];
  if (a[1] === a[2]) a[2] = 'shop';
  z[3] = shuffled(a);
  z[4] = shuffled([pick(['combat', 'gauntlet']), pick(['elite', 'vault']), pick(['shop', 'risk'])]);
  [1, 2, 3, 4].forEach(k => { const r = z[k]; if (r[r.length - 1] === 'risk') { const t = r[r.length - 1]; r[r.length - 1] = r[r.length - 2]; r[r.length - 2] = t; } });   // a risk room right before a boss would waste its penalty
  if ([].concat(z[1], z[2], z[3], z[4]).indexOf('shop') < 0) z[4] = z[4].map(k => k === 'risk' ? 'shop' : k);     // every run has at least one shop
  const plan = [];
  [1, 2, 3, 4].forEach(k => {
    const r = z[k];
    r.forEach((kind, i) => plan.push({ zone: k, kind, rn: i + 1, zr: r.length }));
    if (k >= 2) plan.push({ zone: k, kind: 'boss', boss: k === 2 ? 'sentinel' : k === 3 ? 'boss' : 'twin', rn: r.length + 1, zr: r.length });
  });
  plan.push({ zone: 5, kind: 'boss', boss: 'root', rn: 1, zr: 1 });
  plan.forEach((c, i) => { c.n = i + 1; });
  return plan;
}
function roomLabel(c) { return c.boss ? (c.boss === 'root' ? 'FINAL BOSS: ROOT' : 'MINI-BOSS: ' + BOSS_NAMES[c.boss]).replace('MINI-BOSS: THE ADMIN', 'BOSS: THE ADMIN') : 'ROOM ' + c.rn + '/' + c.zr + ' · ' + ROOM_KINDS[c.kind].name; }

// ---------------------------------------------------------------- room start
function startRoom(n, forceKind) {
  const g = G;
  let cur = g.plan[n - 1];
  if (forceKind) cur = forceKind === 'boss' ? { zone: ZONE_OF_STAGE[n - 1], kind: 'boss', boss: BOSS_AT[n] || 'sentinel', n, rn: 1, zr: 1 } : { zone: ZONE_OF_STAGE[n - 1], kind: forceKind, n, rn: 1, zr: 1 };
  g.cur = cur; g.room = n; g.zone = cur.zone;
  g.roomState = 'fight'; g.doorOpen = false; g.boss = null;
  g.enemies.length = 0; g.bullets.length = 0; g.ebullets.length = 0; g.items.length = 0; g.chests.length = 0; g.patches.length = 0; g.fx.length = 0; g.timers.length = 0; g.nums.length = 0; g.near = null; g.turrets.length = 0; g.decoys.length = 0;
  g.lasers = []; g.pools = []; g.tiles = []; g.safe = null; g.gaunt = null; g.shop = null; g.risk = null; g.sentries = null;
  g.shield = g.P.shield;
  const noFoes = cur.kind === 'shop' || cur.kind === 'risk';
  g.hardOn = !!(g.hardNext && !noFoes); if (g.hardOn) g.hardNext = false;
  const lp = g.loop - 1;
  g.hpMul = (1 + 0.12 * (n - 1)) * (1 + 0.35 * lp) * (g.hardOn ? 1.35 : 1);
  g.bossMul = (1 + 0.35 * lp) * (g.hardOn ? 1.15 : 1);
  g.bulMul = Math.min(1.8, 1 + 0.12 * lp) * (g.hardOn ? 1.2 : 1);
  g.credMul = (1 + 0.15 * lp) * (g.hardOn ? 1.5 : 1);
  g.loopLuck = 0.35 * lp;
  genPillars(cur);
  setupHazardLayout(cur);
  const p = g.player;
  p.x = ARENA.x + ARENA.w / 2; p.y = ARENA.y + ARENA.h - 34; p.vx = p.vy = 0; p.dashT = 0; p.iframes = 1;
  g.fade = 1;
  g.floor = makeFloor(n);
  g.waveIdx = 0; g.pending = 0; g.perkDone = false; g.endT = 0; g.waves = [];
  const zi = ZONES[cur.zone];
  const pre = g.loop > 1 ? 'LOOP ' + g.loop + ' · ' : '';
  if (n === ZONE_FIRST[cur.zone] || forceKind === 'zone') g.banner = { text: zi.name, sub: pre + (cur.zone < 5 ? 'ZONE ' + cur.zone + ' / 4 · ' : '') + zi.hint, sub2: roomLabel(cur), t: 3.2, col: zi.col, zone: true };
  else g.banner = { text: roomLabel(cur), sub: (cur.boss ? '' : ROOM_KINDS[cur.kind].desc), t: 2.3, col: ROOM_KINDS[cur.kind].col };
  if (cur.boss) { spawnBossFor(cur.boss); return; }
  switch (cur.kind) {
    case 'combat': g.waves = genWaves(cur); spawnWave(); break;
    case 'vault': {
      g.waves = genWaves(cur); spawnWave();
      g.chests.push({ x: ARENA.x + ARENA.w / 2, y: ARENA.y + ARENA.h * 0.40, open: false, t: 0, locked: true, min: 2, n: 2 });
      break; }
    case 'gauntlet':
      g.gaunt = { t: GAUNT_TIME, max: GAUNT_TIME, next: GAUNT_GAP, waves: 0 };
      spawnList(genWave(cur.zone, n, 5 + 0.7 * n)); g.gaunt.waves = 1; spawnSentries(); break;
    case 'elite': {
      const e = addEnemy('elite', ARENA.x + ARENA.w / 2, ARENA.y + 100, g.hpMul);
      e.elite = true; e.title = ELITE_NAMES[cur.zone] || 'Elite'; e.color = ZONES[cur.zone].col; e.spawnT = 1.2; e.atk = 2; e.n = 0;
      g.banner.sub = 'ELITE: ' + e.title; break; }
    case 'shop': setupShop(); break;
    case 'risk': setupRisk(); break;
  }
}

function genPillars(cur) {
  const g = G; g.pillars = [];
  const cx = ARENA.x + ARENA.w / 2, my = ARENA.y + ARENA.h * 0.55;
  if (cur.zone === 5 || cur.kind === 'shop' || cur.kind === 'risk') return;
  if (cur.boss === 'boss') { g.pillars.push({ x: ARENA.x + 50, y: my - 20, w: 30, h: 40 }, { x: ARENA.x + ARENA.w - 80, y: my - 20, w: 30, h: 40 }); return; }
  if (cur.boss === 'sentinel') return;
  if (cur.boss === 'twin') { g.pillars.push({ x: ARENA.x + 46, y: my - 22, w: 30, h: 44, mirror: true }, { x: ARENA.x + ARENA.w - 76, y: my - 22, w: 30, h: 44, mirror: true }); return; }
  const count = cur.zone === 4 ? rint(3, 4) : rint(2, 4);
  let tries = 0;
  while (g.pillars.length < count && tries++ < 80) {
    const w = rint(26, 62), h = rint(26, 62);
    const x = rnd(ARENA.x + 30, ARENA.x + ARENA.w - 30 - w), y = rnd(ARENA.y + 70, ARENA.y + ARENA.h - 90 - h);
    if (x < cx + 44 && x + w > cx - 44) { if (y < ARENA.y + 110) continue; }    // keep door lane free
    if (x < cx + 56 && x + w > cx - 56 && y + h > ARENA.y + ARENA.h - 120) continue; // keep start free
    if (g.pillars.some(q => x < q.x + q.w + 34 && x + w + 34 > q.x && y < q.y + q.h + 34 && y + h + 34 > q.y)) continue;
    g.pillars.push({ x, y, w, h });
  }
  if (cur.zone === 4) shuffled(g.pillars).slice(0, 2).forEach(q => { q.mirror = true; });       // reflective walls
}

// ---------------------------------------------------------------- zone hazards: layout
function setupHazardLayout(cur) {
  const g = G, z = cur.zone;
  if (cur.boss || cur.kind === 'shop' || cur.kind === 'risk') return;
  const cx = ARENA.x + ARENA.w / 2;
  if (z === 2) {              // toggling laser walls with a gap; ICE sentries guard the gap
    const walls = (cur.rn === 1 || cur.kind === 'elite') ? 1 : 2;
    g.sentries = [];
    for (let i = 0; i < walls; i++) {
      const y = ARENA.y + ARENA.h * (i === 0 ? 0.40 : 0.66), gw = 84;
      const gx = rnd(ARENA.x + 36, ARENA.x + ARENA.w - 36 - gw), ph = rnd(0, 4.4);
      g.lasers.push({ x1: ARENA.x, y1: y, x2: gx, y2: y, ph, per: 4.4, on: 1.5, warn: 0.9 }, { x1: gx + gw, y1: y, x2: ARENA.x + ARENA.w, y2: y, ph, per: 4.4, on: 1.5, warn: 0.9 });
      g.pillars = g.pillars.filter(q => !(q.y < y + 28 && q.y + q.h > y - 28));
      if (cur.kind !== 'elite') { g.sentries.push({ x: gx - 16, y: y - 22 }); if (i === 0) g.sentries.push({ x: gx + gw + 16, y: y - 22 }); }
    }
  } else if (z === 3) {       // slow corrupted data pools
    const n = rint(2, 3); let tries = 0;
    while (g.pools.length < n && tries++ < 50) {
      const r = rint(30, 46), x = rnd(ARENA.x + r, ARENA.x + ARENA.w - r), y = rnd(ARENA.y + r + 40, ARENA.y + ARENA.h - r - 60);
      if (Math.hypot(x - cx, y - (ARENA.y + ARENA.h - 34)) < r + 60) continue;
      if (Math.abs(x - cx) < r + 30 && y < ARENA.y + 100) continue;
      if (g.pools.some(q => Math.hypot(q.x - x, q.y - y) < q.r + r + 10)) continue;
      g.pools.push({ x, y, r, ph: rnd(0, 6) });
    }
  } else if (z === 4) {       // glitching floor tiles
    const T = 28, cols = Math.floor(ARENA.w / T), rows = Math.floor(ARENA.h / T);
    for (let k = 0; k < 4; k++) {
      const c0 = rint(1, cols - 4), r0 = rint(2, rows - 5), w = rint(2, 3), h = 2, ph = rnd(0, 5);
      const tx = ARENA.x + c0 * T, ty = ARENA.y + r0 * T;
      if (tx < cx + 60 && tx + w * T > cx - 60 && (ty < ARENA.y + 90 || ty + h * T > ARENA.y + ARENA.h - 100)) continue;       // keep door lane + start clear
      for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) g.tiles.push({ x: tx + i * T, y: ty + j * T, w: T, h: T, ph });
    }
  }
}
function spawnSentries() { const g = G; if (g.sentries) { g.sentries.forEach(s => { const e = addEnemy('turret', s.x, s.y, g.hpMul); e.spawnT = 0.9; }); g.sentries = null; } }

// ---------------------------------------------------------------- hazards: update / queries
function inPool(o) { const P = G && G.pools; if (!P) return false; for (let i = 0; i < P.length; i++) { const q = P[i]; if (Math.hypot(o.x - q.x, o.y - q.y) < q.r) return true; } return false; }
function mirrorAt(x, y) { const P = G.pillars; for (let i = 0; i < P.length; i++) { const q = P[i]; if (q.mirror && x > q.x - 1.5 && x < q.x + q.w + 1.5 && y > q.y - 1.5 && y < q.y + q.h + 1.5) return q; } return null; }
function laserState(l, t) { const u = (t + l.ph) % l.per; return u < l.on ? 2 : u > l.per - l.warn ? 1 : 0; }     // 2 = firing, 1 = warning, 0 = off
function tileState(q, t) { const u = (t + q.ph) % 5; return u > 3.4 && u < 4.4 ? 2 : u > 2.4 && u <= 3.4 ? 1 : 0; }
function segDist(px, py, x1, y1, x2, y2) { const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy || 1; let u = ((px - x1) * dx + (py - y1) * dy) / l2; u = clamp(u, 0, 1); return Math.hypot(px - (x1 + u * dx), py - (y1 + u * dy)); }
function updateHazards(dt) {
  const g = G, p = g.player;
  if (g.lasers.length) g.lasers.forEach(l => { l.s = laserState(l, g.time); if (l.s === 2 && segDist(p.x, p.y, l.x1, l.y1, l.x2, l.y2) < p.r + 2.5) hurtPlayer(14 * g.bulMul); });
  if (g.tiles.length) g.tiles.forEach(q => { q.s = tileState(q, g.time); if (q.s === 2 && p.x > q.x - p.r * 0.5 && p.x < q.x + q.w + p.r * 0.5 && p.y > q.y - p.r * 0.5 && p.y < q.y + q.h + p.r * 0.5) hurtPlayer(10 * g.bulMul); });
  const s = g.safe;
  if (s && s.on) {
    if (s.delay > 0) s.delay -= dt; else s.r = Math.max(s.min, s.r - s.rate * dt);
    s.tick -= dt;
    if (Math.hypot(p.x - s.cx, p.y - s.cy) > s.r) { if (s.tick <= 0) { s.tick = 0.6; hurtPlayer(7 * g.bulMul); } }
  }
}

// ---------------------------------------------------------------- enemies / waves
function addEnemy(t, x, y, hpMul) {
  const T = ENEMY_TYPES[t], hm = hpMul == null ? G.hpMul : hpMul;
  const e = { type: t, x, y, vx: 0, vy: 0, r: T.r, hp: T.hp * hm, max: T.hp * hm, speed: T.speed * rnd(0.92, 1.08), dmg: T.dmg * (1 + (G.room - 1) * 0.04),
              spawnT: 0.75, hitT: 0, atk: rnd(0.8, 2), cd: 0, burn: 0, burnDps: 0, burnTick: 0, slow: 0, state: 0, st: 0, ang: 0, dead: false, wob: rnd(0, 6), fixed: !!T.fixed };
  G.enemies.push(e); return e;
}
function zonePool(z, s) {
  if (z === 1) return s >= 2 ? ['chaser', 'chaser', 'swarm', 'swarm'] : ['chaser', 'chaser', 'swarm'];
  if (z === 2) return ['chaser', 'chaser', 'shooter', 'shooter', 'swarm'].concat(s >= 5 ? ['tank'] : []);
  if (z === 3) return ['chaser', 'splitter', 'splitter', 'swarm', 'shooter', 'shooter', 'tank'];
  return ['chaser', 'shooter', 'shooter', 'tank', 'swarm', 'splitter'];
}
function genWave(z, s, budget) {
  const list = [], pool = zonePool(z, s); let b = budget, guard = 0;
  while (b > 0.9 && guard++ < 40) {
    const t = pick(pool);
    if (t === 'swarm') { const k = rint(5, 7); for (let i = 0; i < k; i++) list.push('swarm'); b -= 3; }
    else { list.push(t); b -= ENEMY_TYPES[t].cost; }
    if (list.length > 18) break;
  }
  if (!list.length) list.push('chaser');
  return list;
}
function genWaves(cur) {
  const s = G.room, budget = (10 + 2.2 * s) * (cur.kind === 'vault' ? 0.8 : 1), nW = (cur.kind === 'vault' || s <= 2) ? 2 : 3, waves = [];
  for (let w = 0; w < nW; w++) waves.push(genWave(cur.zone, s, budget / nW * (w === nW - 1 ? 1.1 : 0.95)));
  return waves;
}
function spawnWave() { const g = G; spawnList(g.waves[g.waveIdx++]); if (g.waveIdx === 1) spawnSentries(); }
function spawnList(list) {
  const g = G; let cluster = null;
  list.forEach(t => {
    let s;
    if (t === 'swarm') { if (!cluster) cluster = freeSpot(150, 30); s = { x: cluster.x + rnd(-26, 26), y: cluster.y + rnd(-26, 26) }; }
    else { s = freeSpot(140, ENEMY_TYPES[t].r); cluster = null; }
    s.x = clamp(s.x, ARENA.x + 10, ARENA.x + ARENA.w - 10); s.y = clamp(s.y, ARENA.y + 10, ARENA.y + ARENA.h - 10);
    const e = addEnemy(t, s.x, s.y);
    if (g.zone === 4 && t !== 'swarm' && Math.random() < 0.28) {            // Mirror Mainframe: enemy clones appear across the mirror line
      let cx = 2 * ARENA.x + ARENA.w - s.x; if (Math.abs(cx - s.x) < 40) cx = clamp(s.x + 44, ARENA.x + 12, ARENA.x + ARENA.w - 12);
      const c = addEnemy(t, cx, s.y, g.hpMul * 0.55); c.clone = true; c.noCredit = true; e.hasClone = true;
    }
  });
}
function spawnBossFor(kind) {
  const g = G, cx = ARENA.x + ARENA.w / 2, bm = g.bossMul;
  const mk = (type, x, y, hm, title) => { const e = addEnemy(type, x, y, hm); e.boss = true; e.title = title; e.spawnT = 1.4; e.phase = 1; e.pat = 0; e.atk = 2.2; e.state = 0; g.boss = e; return e; };
  if (kind === 'boss') { mk('boss', cx, ARENA.y + 90, bm, 'THE ADMIN'); }
  else if (kind === 'sentinel') {
    const e = mk('sentinel', cx, ARENA.y + 96, bm, 'SENTINEL'); e.rot = 0; e.shields = [{ off: 0, span: 1.9 }, { off: Math.PI, span: 1.9 }]; e.atk = 2.6;
  } else if (kind === 'twin') {
    const p = g.player, w = cloneWeapon(p.slots[p.active] || p.slots[0], 1), C = g.C;
    const hp = clamp(1050 + weaponDps(w) * 11, 1300, 2600) * bm / 1;
    const e = mk('twin', cx, ARENA.y + 90, 1, 'MIRROR TWIN'); e.max = e.hp = hp; e.w = w; e.cls = C.id; e.color = C.color; e.atk = 2; e.fcd = 1.6; e.skCd = 4.5; e.dir = 1; e.dirT = 2; e.dmg = 15; e.r = 11;
  } else if (kind === 'root') {
    const e = mk('root', cx, ARENA.y + 82, bm, 'ROOT'); e.spawnT = 2.0; e.sumT = 3.5; e.orb = 0; e.nodes = []; e.atk = 2.2; e.fixed = true;
    e.dmg = 22;
  }
}

// ---------------------------------------------------------------- enemy AI for the extra types (returns desired velocity)
function extEnemyAI(e, dt, tg, dx, dy, d, ux, uy) {
  const g = G;
  switch (e.type) {
    case 'splitter': return { x: (ux + Math.cos(e.wob * 1.4) * 0.35) * e.speed, y: (uy + Math.sin(e.wob * 1.4) * 0.35) * e.speed };
    case 'turret': {            // stationary ICE sentry: telegraphed 3-round burst
      if (e.life != null) { e.life -= dt; if (e.life <= 0) { e.dead = true; burst(e.x, e.y, 10, e.color || '#ff9a1f', 100, 3, 0.5); return { x: 0, y: 0 }; } }
      e.atk -= dt; e.warn = e.atk > 0 && e.atk <= 0.4;
      if (e.atk <= 0) {
        e.atk = rnd(2.3, 3.0);
        if (los(e, tg)) { const a = Math.atan2(dy, dx); for (let k = 0; k < 3; k++) g.timers.push({ t: k * 0.16, fn: () => { if (!e.dead) enemyShot(e.x, e.y, a, 150, e.dmg + 2, 4, e.color || '#ffa63d'); } }); }
      }
      return { x: 0, y: 0 }; }
    case 'elite': {
      e.atk -= dt;
      if (e.state === 0) {
        const k = d > 150 ? 1 : d < 95 ? -0.7 : 0.1, sd = Math.sin(e.wob * 0.5);
        if (e.atk <= 0) { e.state = 1; e.st = 0.6; e.warn = true; e.n++; }
        return { x: ux * k * e.speed + -uy * sd * e.speed * 0.8, y: uy * k * e.speed + ux * sd * e.speed * 0.8 };
      }
      e.st -= dt;
      if (e.st <= 0) {
        e.warn = false; const a = Math.atan2(dy, dx), col = e.color || '#ff2bd6';
        for (let v = 0; v < 2; v++) g.timers.push({ t: v * 0.3, fn: () => { if (e.dead) return; for (let k = -2; k <= 2; k++) enemyShot(e.x, e.y, a + k * 0.21 + (v ? 0.1 : 0), 160, e.dmg * 0.55, 4.5, col); } });
        if (e.n % 3 === 0 && g.enemies.length < 12) for (let k = 0; k < 2; k++) { const s = addEnemy('swarm', e.x + rnd(-20, 20), e.y + rnd(-20, 20), 1); s.spawnT = 0.4; s.noCredit = true; }
        e.state = 0; e.atk = rnd(1.9, 2.5);
      }
      return { x: 0, y: 0 }; }
    case 'node': {
      e.atk -= dt; e.warn = e.atk > 0 && e.atk <= 0.45;
      if (e.atk <= 0) { e.atk = 2.8; const a = Math.atan2(g.player.y - e.y, g.player.x - e.x); enemyShot(e.x, e.y, a, 125, 8, 4, '#ffe9a0'); }
      return { x: 0, y: 0 }; }
    default: return { x: 0, y: 0 };
  }
}

// ---------------------------------------------------------------- bullets vs shields / mirrors
function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; }
function shieldBlock(b) {
  const g = G;
  for (let i = 0; i < g.enemies.length; i++) {
    const e = g.enemies[i]; if (!e.shields || e.dead || e.spawnT > 0) continue;
    const dx = b.x - e.x, dy = b.y - e.y, d = Math.hypot(dx, dy), Rs = e.r + 14;
    if (d > Rs - 7 && d < Rs + 7 && (b.vx * dx + b.vy * dy) < 0) {
      const a = Math.atan2(dy, dx);
      for (let k = 0; k < e.shields.length; k++) { const s = e.shields[k]; if (Math.abs(angDiff(a, e.rot + s.off)) < s.span / 2) {
        burst(b.x, b.y, 5, '#ff9a3c', 100, 2, 0.3); sfx('ric', 500, 0.05, 'square', 0.02); e.shieldFlash = 0.12;
        if (b.B.boom && !b.B.stick) detonate(b);
        return true; } }
    }
  }
  return false;
}
function bounceEnemyBullet(b, dt) {
  const mq = mirrorAt(b.x, b.y);
  if (!((mq && (b.mb || 0) < 3) || b.bounce > 0)) return false;
  if (!mq) b.bounce--; else b.mb = (b.mb || 0) + 1;
  const px = b.x - b.vx * dt, py = b.y - b.vy * dt, hx = wallAt(b.x, py, 1), hy = wallAt(px, b.y, 1);
  if (hx) b.vx = -b.vx; if (hy) b.vy = -b.vy; if (!hx && !hy) { b.vx = -b.vx; b.vy = -b.vy; }
  b.x = px; b.y = py; burst(b.x, b.y, 2, '#e8f8ff', 60, 2, 0.2); return true;
}
function popBullet(b) { const n = b.pop.n, off = rnd(0, TAU); for (let i = 0; i < n; i++) enemyShot(b.x, b.y, off + i / n * TAU, b.pop.sp, b.pop.dmg, 4, b.color); ring(b.x, b.y, 30, b.color, 0.3); }

// ---------------------------------------------------------------- boss AI dispatch
function updateBossAI(dt) {
  const t = G.boss.type;
  if (t === 'boss') updateAdmin(dt); else if (t === 'sentinel') updateSentinel(dt); else if (t === 'twin') updateTwin(dt); else if (t === 'root') updateRoot(dt);
}
function bossDeath(e) {
  const g = G;
  g.ebullets.length = 0;
  g.enemies.forEach(x => { if (x !== e && !x.dead) { x.noSplit = true; x.noCredit = true; killEnemy(x); } });
  if (e.type === 'root') {
    g.endT = 2.4; for (let i = 0; i < 3; i++) dropWeapon(e.x + rnd(-40, 40), e.y + 40 + rnd(0, 30), 3);
    for (let k = 0; k < 10; k++) spawnCredit(e.x + rnd(-40, 40), e.y + rnd(20, 70), 20);
    ring(e.x, e.y, 200, '#fff6c0', 0.8); ring(e.x, e.y, 120, '#ffd34a', 0.7); burst(e.x, e.y, 90, '#ffd34a', 300, 4, 1.0); g.safe = null;
    g.banner = { text: 'ROOT DELETED', sub: 'Core Reactor offline', t: 2.4, col: '#ffe9a0' };
    return;
  }
  const n = e.type === 'boss' ? 3 : 2;
  for (let i = 0; i < n; i++) dropWeapon(e.x + rnd(-30, 30), e.y + rnd(-30, 30), 2);
  for (let k = 0; k < 6; k++) spawnCredit(e.x + rnd(-30, 30), e.y + rnd(-30, 30), 14);
  g.banner = { text: (BOSS_NAMES[e.type === 'boss' ? 'boss' : e.type]) + ' DEFEATED', t: 1.8, col: '#ffe81a' };
}
function bossShot(e, a, sp, dmg, r, col) { return enemyShot(e.x, e.y, a, sp, dmg, r, col); }

// ---- Sentinel: turret fortress with rotating shield arcs
function updateSentinel(dt) {
  const g = G, e = g.boss, p = g.player; if (!e || e.dead || e.spawnT > 0 || e.stun > 0) return;
  const hp2 = e.hp / e.max < 0.5;
  if (hp2 && !e.p2) {
    e.p2 = true; g.banner = { text: 'SENTINEL ENRAGED', sub: 'Shields spin faster', t: 1.6, col: '#ff6a1f' }; shake(8); ring(e.x, e.y, 120, '#ff6a1f', 0.5);
    [-1, 1].forEach(k => { const s = addEnemy('turret', e.x + k * 110, e.y + 40, g.hpMul); s.spawnT = 0.8; s.noCredit = true; });
    e.shields.forEach(s => { s.span = 2.1; });
  }
  e.rot += dt * (hp2 ? 1.5 : 0.9) * (e.slow > 0 ? 0.5 : 1);
  if (e.shieldFlash > 0) e.shieldFlash -= dt;
  e.atk -= dt;
  const col = '#ff7a3c';
  if (e.state === 0) {
    if (e.atk <= 0) { e.pat = (e.pat + 1) % 3; e.state = 1; e.st = 0.75; e.warn = true; }
  } else if (e.state === 1) {
    e.st -= dt;
    if (e.st <= 0) {
      e.warn = false;
      if (e.pat === 0) { for (let v = 0; v < 3; v++) g.timers.push({ t: v * 0.38, fn: () => { if (e.dead) return; const a = Math.atan2(p.y - e.y, p.x - e.x); for (let k = -2; k <= 2; k++) bossShot(e, a + k * 0.2, 150, 9, 5, col); } }); e.state = 0; e.atk = 2.0; }
      else if (e.pat === 1) { e.state = 2; e.st = 2.4; e.sp = 0; e.cang = rnd(0, TAU); }
      else { for (let v = 0; v < 2; v++) g.timers.push({ t: v * 0.55, fn: () => { if (e.dead) return; const off = rnd(0, TAU); for (let k = 0; k < 18; k++) bossShot(e, off + k / 18 * TAU, 125, 8, 4.5, col); ring(e.x, e.y, 60, col, 0.3); } }); e.state = 0; e.atk = 2.4; }
    }
  } else if (e.state === 2) {
    e.st -= dt; e.sp -= dt;
    if (e.sp <= 0) { e.sp = 0.16; e.cang += 0.31 * (hp2 ? 1.2 : 1); for (let k = 0; k < 4; k++) bossShot(e, e.cang + k * Math.PI / 2, 115, 8, 4, col); }
    if (e.st <= 0) { e.state = 0; e.atk = 1.8; }
  }
}

// ---- Mirror Twin: copy of the player's class, weapon and skill
function updateTwin(dt) {
  const g = G, e = g.boss, p = g.player; if (!e || e.dead || e.spawnT > 0 || e.stun > 0) return;
  const w = e.w, pref = { pistol: 150, shotgun: 105, smg: 140, sniper: 210, crossbow: 160, launcher: 190 }[w.type] || 150;
  const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
  const k = d > pref + 25 ? 1 : d < pref - 25 ? -1 : 0;
  e.dirT -= dt; if (e.dirT <= 0) { e.dir = -e.dir; e.dirT = rnd(1.5, 3); }
  const sp = 64 * (e.slow > 0 ? 0.5 : 1) * (e.rage > 0 ? 1.2 : 1);
  e.x += (ux * k * sp + -uy * e.dir * sp * 0.8) * dt; e.y += (uy * k * sp + ux * e.dir * sp * 0.8) * dt;
  resolveCircle(e, e.r);
  if (e.rage > 0) e.rage -= dt;
  e.fcd -= dt; e.skCd -= dt;
  if (e.fcd <= 0) twinFire(e);
  if (e.skCd <= 0) twinSkill(e);
}
function twinFire(e) {
  const g = G, p = g.player, w = e.w, col = e.color, a = Math.atan2(p.y - e.y, p.x - e.x), dm = e.dmg, rg = e.rage > 0 ? 0.5 : 1;
  const flav = b => { if (!b) return; if (w.fx.ricochet) b.bounce = 1; if (w.fx.burning) b.color = '#ff7a2a'; if (w.fx.freezing) b.color = '#8fe3ff'; };
  switch (w.type) {
    case 'pistol': flav(enemyShot(e.x, e.y, a, 215, dm * 0.75, 4, col)); e.fcd = 0.85 * rg; break;
    case 'shotgun': for (let k = -2; k <= 2; k++) flav(enemyShot(e.x, e.y, a + k * 0.2, 175, dm * 0.5, 4, col)); e.fcd = 1.9 * rg; break;
    case 'smg': for (let k = 0; k < 4; k++) g.timers.push({ t: k * 0.11, fn: () => { if (!e.dead) flav(enemyShot(e.x, e.y, Math.atan2(g.player.y - e.y, g.player.x - e.x) + rnd(-0.1, 0.1), 200, dm * 0.4, 3.5, col)); } }); e.fcd = 1.5 * rg; break;
    case 'sniper': {
      e.warn = true; g.fx.push({ t: 'tline', x: e.x, y: e.y, a, life: 0.8, m: 0.8, col });
      g.timers.push({ t: 0.8, fn: () => { e.warn = false; if (!e.dead) { const b = enemyShot(e.x, e.y, a, 430, dm * 1.5, 4.5, col); flav(b); } } }); e.fcd = 2.8 * rg; break; }
    case 'crossbow': flav(enemyShot(e.x, e.y, a, 255, dm * 0.9, 5, col)); e.fcd = 1.25 * rg; break;
    case 'launcher': { const b = enemyShot(e.x, e.y, a, 135, dm * 0.6, 8, col); b.life = 0.85; b.pop = { n: 10, sp: 120, dmg: dm * 0.35 }; e.fcd = 2.3 * rg; break; }
  }
}
function twinSkill(e) {
  const g = G, p = g.player, col = e.color; e.skCd = rnd(7, 8.5); e.fcd = Math.max(e.fcd, 1.0);
  switch (e.cls) {
    case 'runner': e.warn = true; ring(e.x, e.y, 50, col, 0.6); g.timers.push({ t: 0.6, fn: () => { e.warn = false; if (e.dead) return; for (let k = 0; k < 14; k++) enemyShot(e.x, e.y, k / 14 * TAU, 140, e.dmg * 0.6, 4, col); ring(e.x, e.y, 70, col, 0.4); } }); break;
    case 'breacher': { const x = e.x, y = e.y; g.fx.push({ t: 'danger', x, y, r: 92, life: 0.9, m: 0.9 });
      g.timers.push({ t: 0.9, fn: () => { ring(x, y, 100, '#ff8a1f', 0.4); shake(6); if (Math.hypot(g.player.x - x, g.player.y - y) < 92) { hurtPlayer(16 * g.bulMul); const dd = Math.hypot(g.player.x - x, g.player.y - y) || 1; g.player.vx += (g.player.x - x) / dd * 320; g.player.vy += (g.player.y - y) / dd * 320; } } }); break; }
    case 'phantom': case 'glitch': {
      const n = e.cls === 'glitch' ? 2 : 1;
      for (let i = 0; i < n; i++) g.timers.push({ t: 0.5 + i * 0.7, fn: () => {
        if (e.dead) return; ring(e.x, e.y, 40, col, 0.4); const s = freeSpot(110, 12); e.x = s.x; e.y = s.y; ring(e.x, e.y, 40, col, 0.4); burst(e.x, e.y, 14, col, 120, 3, 0.5);
        const a = Math.atan2(g.player.y - e.y, g.player.x - e.x); for (let k = -3; k <= 3; k++) enemyShot(e.x, e.y, a + k * 0.17, 150, e.dmg * 0.5, 4, col); } });
      ring(e.x, e.y, 50, col, 0.5); break; }
    case 'overclock': e.rage = 4.5; ring(e.x, e.y, 60, '#ff2a3d', 0.5); addNum(e.x, e.y - 24, 'REDLINE', '#ff2a3d', 12); break;
    case 'daemon': {
      const mine = g.enemies.filter(x => !x.dead && x.type === 'turret' && x.twinOwned);
      if (mine.length >= 2) mine[0].life = 0.01;
      const s = addEnemy('turret', e.x, e.y, g.hpMul * 0.5); s.life = 10; s.twinOwned = true; s.noCredit = true; s.color = col; s.spawnT = 0.5; ring(e.x, e.y, 40, col, 0.4); break; }
    case 'blackout': {
      const tx = p.x, ty = p.y; g.fx.push({ t: 'danger', x: tx, y: ty, r: 72, life: 1.1, m: 1.1 });
      g.timers.push({ t: 1.1, fn: () => { ring(tx, ty, 90, '#ffe81a', 0.4); burst(tx, ty, 30, '#ffe81a', 220, 4, 0.7); shake(8); if (Math.hypot(g.player.x - tx, g.player.y - ty) < 72) hurtPlayer(26 * g.bulMul); } }); break; }
  }
}

// ---- ROOT: stationary core, 3 phases
function rootPhase2(e) {
  const g = G;
  e.phase = 2; e.invuln = true; e.state = 0; e.atk = 3.0; e.warn = false; e.nodes = []; e.sumT = 5;
  g.ebullets.length = 0; shake(12); ring(e.x, e.y, 160, '#ffe9a0', 0.7);
  g.banner = { text: 'PHASE 2', sub: 'Shield breaks into 4 nodes: destroy them', t: 2.4, col: '#ffe9a0' };
  for (let i = 0; i < 4; i++) { const n = addEnemy('node', e.x, e.y, g.bossMul); n.spawnT = 0.7; n.owner = e; n.idx = i; n.atk = 2 + i * 0.6; n.noCredit = false; e.nodes.push(n); }
}
function rootPhase3(e) {
  const g = G, cx = ARENA.x + ARENA.w / 2, R0 = Math.min(ARENA.w, ARENA.h) / 2 - 6;
  e.phase = 3; e.invuln = false; e.state = 0; e.atk = 1.8; e.warn = false; g.ebullets.length = 0; shake(12);
  g.safe = { on: true, cx, cy: ARENA.y + ARENA.h * 0.56, r: R0, min: R0 * 0.42, rate: R0 * 0.58 / 30, delay: 1.6, tick: 0.6 };
  g.banner = { text: 'PHASE 3', sub: 'Core overload: stay inside the safe zone', t: 2.6, col: '#ff6a3c' };
  ring(e.x, e.y, 180, '#ff6a3c', 0.7);
}
function rootPattern(e, name, ph) {
  const g = G, p = g.player, hell = ph === 3, col = hell ? '#ff7a3c' : '#ffd34a', sp = hell ? 112 : 100, dm = hell ? 10 : 9;
  const aim = () => Math.atan2(p.y - e.y, p.x - e.x);
  if (name === 'fan') {
    for (let v = 0; v < 3; v++) g.timers.push({ t: v * 0.5, fn: () => { if (e.dead) return; const a = aim(), n = hell ? 11 : 9, st = 0.17; for (let k = 0; k < n; k++) enemyShot(e.x, e.y, a + (k - (n - 1) / 2 + (v % 2 ? 0.5 : 0)) * st, sp + 8, dm, 5, col); ring(e.x, e.y, 56, col, 0.25); } });
    return 1.6;
  }
  if (name === 'ring') {
    for (let v = 0; v < 2; v++) g.timers.push({ t: v * 0.6, fn: () => { if (e.dead) return; const n = hell ? 30 : 24, a0 = aim(), off = v * Math.PI / n; for (let k = 0; k < n; k++) { const a = off + k / n * TAU; if (Math.abs(angDiff(a, a0)) < 0.3) continue; enemyShot(e.x, e.y, a, sp - 8, dm, 4.5, col); } ring(e.x, e.y, 66, col, 0.3); shake(2); } });
    return 1.4;
  }
  // spiral: runs for a duration
  e.state = 2; e.st = hell ? 3.2 : 2.4; e.sp = 0; e.cang = rnd(0, TAU); e.cdir = Math.random() < 0.5 ? 1 : -1; e.arms = hell ? 4 : 3;
  return 0;
}
function updateRoot(dt) {
  const g = G, e = g.boss, p = g.player; if (!e || e.dead || e.spawnT > 0) return;
  e.t = (e.t || 0) + dt; e.orb += dt * 0.7;
  const ph = e.phase;
  if (ph === 2) {
    e.nodes = e.nodes.filter(n => !n.dead);
    e.nodes.forEach(n => { const a = e.orb + n.idx * Math.PI / 2; n.x = e.x + Math.cos(a) * 100; n.y = e.y + Math.sin(a) * 100; });
    if (!e.nodes.length) { rootPhase3(e); return; }
  }
  // pattern machine
  e.atk -= dt;
  if (e.state === 0) {
    if (e.atk <= 0 && !(ph === 2 && e.nodes.length === 0)) {
      const list = ph === 1 ? ['fan', 'spiral', 'ring'] : ph === 2 ? ['ring'] : ['fan', 'spiral', 'ring', 'spiral'];
      e.curPat = list[(e.pat++) % list.length]; e.state = 1; e.st = 0.85; e.warn = true; ring(e.x, e.y, 70, '#ff3355', 0.8);
    }
  } else if (e.state === 1) {
    e.st -= dt;
    if (e.st <= 0) { e.warn = false; const gap = rootPattern(e, e.curPat, ph); if (e.state === 1) { e.state = 0; e.atk = (ph === 1 ? 2.6 : ph === 2 ? 4.2 : 1.6) + gap; } }
  } else if (e.state === 2) {
    e.st -= dt; e.sp -= dt;
    if (e.sp <= 0) { e.sp = 0.12; e.cang += 0.37 * e.cdir; for (let k = 0; k < e.arms; k++) enemyShot(e.x, e.y, e.cang + k / e.arms * TAU, ph === 3 ? 108 : 95, 8, 4.5, ph === 3 ? '#ff7a3c' : '#ffd34a'); }
    if (e.st <= 0) { e.state = 0; e.atk = ph === 3 ? 1.5 : 2.6; }
  }
  // drone waves
  if (ph !== 3) {
    e.sumT -= dt;
    if (e.sumT <= 0) {
      e.sumT = ph === 1 ? 8 : 10;
      if (aliveEnemies() <= 6 + (ph === 2 ? 4 : 0)) { const list = ph === 1 ? ['chaser', 'chaser', 'chaser', 'swarm', 'swarm', 'swarm', 'swarm', 'swarm'] : ['chaser', 'chaser']; spawnList(list); g.banner = { text: 'DRONES INCOMING', t: 1.0, col: '#ff6a6a' }; }
    }
  }
}

// ---------------------------------------------------------------- credits
const CREDIT_VAL = { chaser: 3, swarm: 1, shooter: 5, tank: 12, turret: 4, splitter: 4, elite: 45, node: 12 };
function spawnCredit(x, y, v) {
  const g = G; v = Math.max(1, Math.round(v * (1 + g.P.credit) * g.credMul));
  let n = 0; for (let i = 0; i < g.items.length; i++) if (g.items[i].kind === 'credit') n++;
  if (n > 45) { g.credits += v; return; }
  const a = rnd(0, TAU); g.items.push({ kind: 'credit', v, x, y, t: 0, vx: Math.cos(a) * 70, vy: Math.sin(a) * 70 });
}
function spawnCreditsFor(e) {
  if (e.noCredit) return;
  if (e.type === 'swarm' && Math.random() > 0.5) return;
  spawnCredit(e.x, e.y, (CREDIT_VAL[e.type] || 2) * (e.type === 'swarm' ? 1 : rnd(0.8, 1.3)));
}

// ---------------------------------------------------------------- room flow
function softBanner(b) { const g = G; if (g.banner && g.banner.zone && g.banner.t > 0.5) return; g.banner = b; }
function roomCleared() {
  const g = G, cur = g.cur, k = cur.kind;
  g.roomState = 'clear'; g.clearT = 0.9; g.perkDone = false;
  const cx = ARENA.x + ARENA.w / 2, cy = ARENA.y + ARENA.h * 0.42;
  if (k === 'vault') { g.chests.forEach(c => { c.locked = false; }); g.banner = { text: 'VAULT UNLOCKED', sub: 'Open the chest', t: 1.8, col: '#ffe81a' }; }
  else {
    if (!cur.boss && k !== 'elite') {
      const c = { x: cx, y: cy, open: false, t: 0 };
      if (wallAt(c.x, c.y, 14)) { const s = freeSpot(40, 16); c.x = s.x; c.y = s.y; }
      g.chests.push(c);
    }
    softBanner({ text: cur.boss ? 'BOSS CLEARED' : 'ROOM CLEARED', t: 1.5, col: '#39ff6a' });
  }
  if (g.gaunt) { const bonus = 30 + g.room * 3; for (let i = 0; i < 5; i++) spawnCredit(cx + rnd(-30, 30), cy + rnd(-20, 20), bonus / 5); g.banner = { text: 'GAUNTLET SURVIVED', sub: '+' + Math.round(bonus * (1 + g.P.credit) * g.credMul) + ' bonus credits', t: 1.8, col: '#ff5a3c' }; }
  g.items.forEach(it => { if (it.kind === 'credit') it.fly = true; });
  const p = g.player; p.hp = Math.min(g.P.maxHp, p.hp + 8 + g.P.clearHeal);
  sfx('clear', 520, 0.4, 'triangle', 0.07, 2.2);
  g.ebullets.length = 0;
}
function winRoot() {
  const g = G; if (state === 'win') return;
  g.clears++; g.clearTimes.push(g.time - g.loopStart); g.won = true; state = 'win';
  g.items.forEach(it => { if (it.kind === 'credit') it.fly = true; });
}
function startLoop() {
  const g = G; if (!g || state !== 'win') return false;
  g.loop++; g.loopStart = g.time; g.plan = buildPlan(); g.hardNext = false; g.over = false; g.won = false; g.perkOffer = null; g.near = null;
  g.player.hp = g.P.maxHp; g.player.iframes = 1.5;
  if (g.loop > best.bestLoop) best.bestLoop = g.loop;
  saveBest();
  state = 'play'; startRoom(1);
  sfx('perk', 500, 0.3, 'triangle', 0.07, 2);
  return true;
}
function endToMenu() { if (!G) return; endRun(true); state = 'menu'; G = null; resize(); }

function advanceDoor() { const g = G; if (g.room < STAGES) startRoom(g.room + 1); }
function updateRoomFlow(dt) {
  const g = G, p = g.player, cur = g.cur, cx = ARENA.x + ARENA.w / 2;
  if (g.roomState === 'fight') {
    const alive = aliveEnemies();
    if (cur.boss === 'root') { if (g.endT > 0) { g.endT -= dt; if (g.endT <= 0) winRoot(); } }
    else if (g.gaunt) {
      const ga = g.gaunt;
      if (ga.t > 0) {
        ga.t -= dt; ga.next -= dt;
        if ((ga.next <= 0 || (alive <= 1 && ga.next < GAUNT_GAP - 1.5)) && alive < 20) { spawnList(genWave(cur.zone, g.room, 5 + 0.7 * g.room)); ga.waves++; ga.next = GAUNT_GAP; softBanner({ text: 'WAVE ' + ga.waves, t: 0.9, col: '#ff5a3c' }); sfx('clear', 300, 0.2, 'sawtooth', 0.04, 1.6); }
      } else if (alive === 0) roomCleared();
    }
    else if (alive === 0) {
      if (g.waveIdx < g.waves.length) { g.pending += dt; if (g.pending > 0.7) { g.pending = 0; spawnWave(); softBanner({ text: 'WAVE ' + g.waveIdx + ' / ' + g.waves.length, t: 1, col: '#fff' }); } }
      else roomCleared();
    }
  }
  if (g.roomState === 'clear') {
    g.clearT -= dt;
    if (g.clearT <= 0 && !g.doorOpen && state === 'play' && !g.perkOffer && !g.perkDone) { g.perkDone = true; offerPerks({ boss: !!cur.boss }); }
    if (g.doorOpen && state === 'play') {
      if (p.y < ARENA.y + 16 && Math.abs(p.x - cx) < 30) { advanceDoor(); return; }
    }
    const spot = g.shop || g.risk;
    if (spot && state === 'play') {
      const d = Math.hypot(p.x - spot.x, p.y - spot.y);
      if (spot.ign) { if (d > spot.r + 26) spot.ign = false; }
      else if (d < spot.r && !(g.risk && g.risk.used)) { if (g.shop) openShop(); else openRisk(); }
    }
  }
}

// ---------------------------------------------------------------- shop terminal
const WEAPON_PRICE = [40, 85, 150, 260], PERK_PRICE = { common: 60, rare: 95, epic: 150 };
function setupShop() {
  const g = G, cx = ARENA.x + ARENA.w / 2, ty = ARENA.y + ARENA.h * 0.42;
  g.roomState = 'clear'; g.doorOpen = true; g.perkDone = true; g.clearT = 0;
  const lk = g.P.luck + g.loopLuck + 0.2;
  const w1 = genWeapon(null, Math.max(1, rollRarity(lk, 1))), w2 = genWeapon(null, Math.max(2, rollRarity(lk + 0.3, 2)));
  const offers = [{ kind: 'weapon', w: w1, price: WEAPON_PRICE[w1.rarity] }, { kind: 'weapon', w: w2, price: WEAPON_PRICE[w2.rarity] }];
  const pk = pickPerks(1, [], 0)[0];
  if (pk) offers.push({ kind: 'perk', perk: pk, price: PERK_PRICE[pk.tier] });
  offers.push({ kind: 'heal', name: 'Repair Kit', desc: 'Heal 60% of max HP', price: 40 });
  offers.push(Math.random() < 0.5 ? { kind: 'reroll', name: 'Reroll Chip', desc: '+1 perk reroll', price: 50 } : { kind: 'banish', name: 'Banish Chip', desc: '+1 perk banish', price: 60 });
  g.shop = { x: cx, y: ty, r: 34, ign: false, offers };
  if (!(g.banner && g.banner.zone)) g.banner = { text: 'SHOP TERMINAL', sub: 'Walk up to the terminal to spend credits', t: 2.6, col: '#39ff6a' };
}
function openShop() { joy.active = false; joy.mx = joy.my = 0; joy.id = null; state = 'shop'; }
function leaveShop() { if (state !== 'shop') return; state = 'play'; if (G.shop) G.shop.ign = true; }
function buyOffer(i) {
  const g = G, s = g.shop; if (!s) return false;
  const o = s.offers[i]; if (!o || o.sold || g.credits < o.price) return false;
  g.credits -= o.price; o.sold = true;
  if (o.kind === 'weapon') g.items.push({ kind: 'weapon', w: o.w, x: s.x + (i % 2 ? 26 : -26), y: s.y + 46, t: 0, vx: 0, vy: 0, ignore: false });
  else if (o.kind === 'perk') applyPerk(o.perk);
  else if (o.kind === 'heal') { g.player.hp = Math.min(g.P.maxHp, g.player.hp + g.P.maxHp * 0.6); }
  else if (o.kind === 'reroll') g.rerolls++;
  else if (o.kind === 'banish') g.banishes++;
  sfx('pickup', 600, 0.15, 'triangle', 0.06, 1.8);
  return true;
}
function shopKey(k) { const i = '12345'.indexOf(k); if (i >= 0) buyOffer(i); else if (k === 'escape' || k === 'enter' || k === ' ') leaveShop(); }

// ---------------------------------------------------------------- risk room
function setupRisk() {
  const g = G, cx = ARENA.x + ARENA.w / 2, ty = ARENA.y + ARENA.h * 0.42;
  g.roomState = 'clear'; g.doorOpen = true; g.perkDone = true; g.clearT = 0;
  g.risk = { x: cx, y: ty, r: 34, ign: false, used: false };
  if (!(g.banner && g.banner.zone)) g.banner = { text: 'RISK ROOM', sub: 'Take power now, face a harder next room', t: 2.6, col: '#ff3b6b' };
}
function openRisk() { joy.active = false; joy.mx = joy.my = 0; joy.id = null; state = 'risk'; }
function genCursedWeapon() {
  const w = genWeapon(null, Math.random() < 0.35 ? 3 : 2);
  if (w.afx.indexOf('cursed') < 0) w.afx[0] = 'cursed';
  rebuildWeapon(w); return w;
}
function riskChoose(i) {
  const g = G, r = g.risk; if (state !== 'risk' || !r) return;
  if (i === 2) { state = 'play'; r.ign = true; return; }
  if (r.used) return;
  r.used = true; g.hardNext = true; r.ign = true;
  g.banner = { text: 'NEXT ROOM HARDENED', sub: '+35% enemy HP, +20% damage, +50% credits', t: 2.4, col: '#ff3b6b' };
  if (i === 0) { const w = genCursedWeapon(); g.items.push({ kind: 'weapon', w, x: r.x, y: r.y + 44, t: 0, vx: 0, vy: 0, ignore: false }); state = 'play'; }
  else offerPerks({ mode: 'risk', min: 1 });
}
function riskKey(k) { const i = '123'.indexOf(k); if (i >= 0) riskChoose(i); else if (k === 'escape') riskChoose(2); }

// ---------------------------------------------------------------- perks: offer / reroll / banish / skip
function perkEligible(min) {
  const g = G, P = g.P, eq = g.player.slots.filter(Boolean);
  return PERKS.filter(pk => {
    if ((g.perkCount[pk.id] || 0) >= pk.max || g.banished[pk.id]) return false;
    if (pk.cls && pk.cls !== P.cls) return false;
    if (pk.aff && !eq.some(w => w.fx[pk.aff])) return false;
    return TIER_IDX[pk.tier] >= (min || 0);
  });
}
function pickPerks(n, exclude, min, luckBonus) {
  const g = G, lk = g.P.luck + g.loopLuck + (luckBonus || 0);
  let pool = perkEligible(min).filter(p => exclude.indexOf(p.id) < 0);
  if (pool.length < n) perkEligible(0).forEach(p => { if (exclude.indexOf(p.id) < 0 && pool.indexOf(p) < 0 && pool.length < n) pool.push(p); });
  const out = [];
  while (out.length < n && pool.length) {
    const ws = pool.map(p => TIERS[p.tier].w * (p.tier === 'rare' ? 1 + lk * 0.4 : p.tier === 'epic' ? 1 + lk * 0.8 : 1) * ((p.cls || p.aff) ? 1.25 : 1) * Math.pow(0.8, g.perkCount[p.id] || 0));
    let x = Math.random() * ws.reduce((a, b) => a + b, 0), i = 0;
    for (; i < ws.length - 1; i++) { x -= ws[i]; if (x <= 0) break; }
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}
function offerPerks(opts) {
  opts = opts || {};
  const g = G, n = g.P.cls === 'glitch' ? 4 : 3;
  joy.active = false; joy.mx = joy.my = 0; joy.id = null;
  g.perkMode = opts.mode || 'room'; g.perkMin = opts.min || 0; g.banishMode = false;
  g.perkOffer = pickPerks(n, [], g.perkMin, opts.boss ? 0.5 : 0); state = 'perk';
}
function applyPerk(perk) { const g = G; perk.apply(g.P, g); g.perkCount[perk.id] = (g.perkCount[perk.id] || 0) + 1; g.perksTaken.push(perk.id); }
function finishOffer() {
  const g = G; g.perkOffer = null; g.banishMode = false; state = 'play';
  if (!g.doorOpen) { g.doorOpen = true; g.banner = { text: 'DOOR OPEN', sub: g.plan[g.room] ? 'Next: ' + (g.plan[g.room].boss ? 'BOSS' : ROOM_KINDS[g.plan[g.room].kind].name) : '', t: 1.6, col: '#19f0ff' }; }
}
function takePerk(perk) { applyPerk(perk); sfx('perk', 500, 0.3, 'triangle', 0.07, 2); finishOffer(); }
function pickOffer(i) { const g = G; if (!g.perkOffer || !g.perkOffer[i]) return; if (g.banishMode) banishCard(i); else takePerk(g.perkOffer[i]); }
function rerollOffer() {
  const g = G; if (state !== 'perk' || g.rerolls <= 0) return false;
  g.rerolls--; g.banishMode = false; g.perkOffer = pickPerks(g.perkOffer.length, g.perkOffer.map(p => p.id), g.perkMin); sfx('swap', 700, 0.08, 'triangle', 0.05); return true;
}
function banishCard(i) {
  const g = G; if (state !== 'perk' || g.banishes <= 0 || !g.perkOffer[i]) return false;
  g.banishes--; g.banished[g.perkOffer[i].id] = true; g.banishMode = false;
  const rep = pickPerks(1, g.perkOffer.map(p => p.id), g.perkMin)[0];
  if (rep) g.perkOffer[i] = rep; else g.perkOffer.splice(i, 1);
  sfx('hurt', 200, 0.12, 'sawtooth', 0.04, 0.5);
  if (!g.perkOffer.length) skipOffer();
  return true;
}
function skipOffer() { const g = G; if (state !== 'perk') return; g.credits += 40; g.cashT = 0.8; finishOffer(); }

// ---------------------------------------------------------------- rendering: room icons, hazards, objects
function drawRoomIcon(kind, x, y, r, col) {
  ctx.save(); ctx.translate(x, y);
  const lw = Math.max(1.2, r / 5);
  switch (kind) {
    case 'combat': ctx.beginPath(); ctx.moveTo(-r, -r); ctx.lineTo(r, r); ctx.moveTo(r, -r); ctx.lineTo(-r, r); nstroke(col, lw); break;
    case 'vault': ctx.beginPath(); ctx.rect(-r, -r * 0.8, r * 2, r * 1.6); nstroke(col, lw); ctx.beginPath(); ctx.arc(0, 0, r * 0.3, 0, TAU); nstroke(col, lw * 0.8); break;
    case 'gauntlet': ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); nstroke(col, lw); ctx.beginPath(); ctx.moveTo(0, -r * 0.6); ctx.lineTo(0, 0); ctx.lineTo(r * 0.5, r * 0.25); nstroke(col, lw * 0.8); break;
    case 'elite': ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i / 10 * TAU, rr0 = i % 2 ? r * 0.45 : r * 1.1; ctx.lineTo(Math.cos(a) * rr0, Math.sin(a) * rr0); } ctx.closePath(); nstroke(col, lw); break;
    case 'shop': ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); nstroke(col, lw); txt('¢', 0, 1, r * 1.5, col, 'center', '900', false); break;
    case 'risk': ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r, r * 0.85); ctx.lineTo(-r, r * 0.85); ctx.closePath(); nstroke(col, lw); txt('!', 0, r * 0.2, r * 1.2, col, 'center', '900', false); break;
    default: poly(6, r, 0); nstroke(col, lw); ctx.beginPath(); ctx.arc(0, 0, r * 0.3, 0, TAU); nstroke(col, lw * 0.8);
  }
  ctx.restore();
}
function drawRoomChips(t) {
  const g = G, cx = ARENA.x + ARENA.w / 2;
  if (g.doorOpen && g.plan[g.room] && state === 'play') {            // door shows what is behind it
    const nx = g.plan[g.room], k = nx.boss ? 'boss' : nx.kind, K = ROOM_KINDS[k], lab = nx.boss ? (nx.boss === 'root' ? 'ROOT' : BOSS_NAMES[nx.boss]) : K.name;
    rr(cx - 62, ARENA.y + 30, 124, 22, 11); ctx.fillStyle = 'rgba(6,9,22,0.85)'; ctx.fill(); nstroke(K.col, 1.2, 0.8);
    drawRoomIcon(k, cx - 46, ARENA.y + 41, 6, K.col); fitTxt('NEXT: ' + lab, cx + 6, ARENA.y + 41.5, 88, 10.5, '#fff', 'center', '800');
  }
  if (!g.boss && g.cur) { const K = ROOM_KINDS[g.cur.kind]; drawRoomIcon(g.cur.kind, ARENA.x + 14, ARENA.y + 14, 6, K.col); txt(K.name, ARENA.x + 25, ARENA.y + 14.5, 10, K.col, 'left', '800', false); }
}
function drawHazardsUnder(t) {
  const g = G;
  g.pools.forEach(q => {
    glow(q.x, q.y, q.r * 1.7, '#39ff6a', 0.34); ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, TAU); ctx.fillStyle = 'rgba(30,120,50,0.33)'; ctx.fill(); nstroke('#39ff6a', 1.2, 0.8);
    for (let i = 0; i < 4; i++) { const a = t * 0.8 + q.ph + i * 1.7, rr0 = q.r * (0.25 + 0.5 * ((i * 0.37 + t * 0.2) % 1)); ctx.fillStyle = 'rgba(160,255,160,0.5)'; ctx.beginPath(); ctx.arc(q.x + Math.cos(a) * rr0, q.y + Math.sin(a) * rr0, 2 + (i % 2), 0, TAU); ctx.fill(); }
  });
  g.tiles.forEach(q => {
    const s = q.s || 0;
    if (s === 0) { if (Math.sin(t * 7 + q.x * 0.3 + q.y * 0.2 + q.ph) > 0.93) { ctx.fillStyle = 'rgba(255,60,240,0.12)'; ctx.fillRect(q.x + 1, q.y + 1, q.w - 2, q.h - 2); } ctx.strokeStyle = 'rgba(255,60,240,0.22)'; ctx.lineWidth = 1; ctx.strokeRect(q.x + 1.5, q.y + 1.5, q.w - 3, q.h - 3); }
    else if (s === 1) { const f = Math.floor(t * 14) % 2 === 0; ctx.fillStyle = f ? 'rgba(255,60,240,0.35)' : 'rgba(255,255,255,0.12)'; ctx.fillRect(q.x + 1, q.y + 1, q.w - 2, q.h - 2); ctx.strokeStyle = '#ff3df0'; ctx.lineWidth = 1.4; ctx.strokeRect(q.x + 1.5, q.y + 1.5, q.w - 3, q.h - 3); }
    else { ctx.fillStyle = 'rgba(255,40,230,0.7)'; ctx.fillRect(q.x, q.y, q.w, q.h); glow(q.x + q.w / 2, q.y + q.h / 2, 26, '#ff3df0', 0.7); ctx.fillStyle = '#fff'; ctx.fillRect(q.x + rnd(2, 20), q.y + rnd(2, 20), 6, 2); }
  });
  const obj = g.shop || g.risk;
  if (obj) {
    const isShop = !!g.shop, col = isShop ? '#39ff6a' : '#ff3b6b', used = g.risk && g.risk.used, a = used ? 0.3 : 1;
    glow(obj.x, obj.y, 54, col, 0.45 * a); ctx.globalAlpha = a;
    ctx.fillStyle = '#05080f'; rr(obj.x - 20, obj.y - 20, 40, 40, 6); ctx.fill(); nstroke(col, 1.8);
    if (isShop) { txt('¢', obj.x, obj.y + 1, 24, col, 'center', '900', false); ctx.beginPath(); ctx.moveTo(obj.x - 14, obj.y - 12); ctx.lineTo(obj.x + 14, obj.y - 12); nstroke(col, 1); }
    else { ctx.beginPath(); ctx.moveTo(obj.x, obj.y - 14); ctx.lineTo(obj.x + 13, obj.y + 11); ctx.lineTo(obj.x - 13, obj.y + 11); ctx.closePath(); nstroke(col, 1.8); txt('!', obj.x, obj.y + 3, 16, col, 'center', '900', false); }
    ctx.beginPath(); ctx.arc(obj.x, obj.y, obj.r - 4 + Math.sin(t * 3) * 2, 0, TAU); nstroke(col, 1, 0.35 * a); ctx.globalAlpha = 1;
    if (!used && Math.hypot(g.player.x - obj.x, g.player.y - obj.y) > obj.r + 20) txt(isShop ? 'WALK UP TO SHOP' : 'WALK UP TO CHOOSE', obj.x, obj.y - 34, 10.5, col, 'center', '800');
  }
}
function drawHazardsOver(t) {
  const g = G;
  g.lasers.forEach(l => {
    const s = l.s || 0, hor = Math.abs(l.y1 - l.y2) < 1;
    ctx.beginPath(); ctx.arc(l.x1, l.y1, 3, 0, TAU); ctx.arc(l.x2, l.y2, 3, 0, TAU); ctx.fillStyle = '#ff5a2a'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(l.x1, l.y1); ctx.lineTo(l.x2, l.y2);
    if (s === 0) { ctx.save(); ctx.setLineDash([2, 10]); ctx.strokeStyle = 'rgba(255,100,40,0.35)'; ctx.lineWidth = 1; ctx.stroke(); ctx.restore(); }
    else if (s === 1) { if (Math.floor(t * 14) % 2 === 0) nstroke('#ff7a2a', 1.2, 0.8); else { ctx.save(); ctx.setLineDash([4, 6]); ctx.strokeStyle = 'rgba(255,180,100,0.7)'; ctx.lineWidth = 1; ctx.stroke(); ctx.restore(); } }
    else { nstroke('#ff3b1f', 3.2, 1); ctx.beginPath(); ctx.moveTo(l.x1, l.y1); ctx.lineTo(l.x2, l.y2); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.stroke(); glow((l.x1 + l.x2) / 2, l.y1, Math.abs(l.x2 - l.x1) * 0.5 + 10, '#ff3b1f', 0.25); }
  });
  g.fx.forEach(f => {
    if (f.t === 'tline') { const k = f.life / f.m; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x + Math.cos(f.a) * 520, f.y + Math.sin(f.a) * 520); nstroke(f.col || '#fff', 1 + (1 - k) * 1.5, 0.35 + (1 - k) * 0.6); }
    else if (f.t === 'danger') { const k = 1 - f.life / f.m; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, TAU); ctx.fillStyle = 'rgba(255,40,70,' + (0.10 + 0.22 * k).toFixed(2) + ')'; ctx.fill(); nstroke('#ff3355', 1.6, 0.9); ctx.beginPath(); ctx.arc(f.x, f.y, f.r * k, 0, TAU); nstroke('#ff9aa8', 1.2, 0.8); }
  });
  g.chests.forEach(c => { if (c.locked) { ctx.fillStyle = 'rgba(255,40,70,0.9)'; ctx.fillRect(c.x - 5, c.y - 3, 10, 8); ctx.beginPath(); ctx.arc(c.x, c.y - 3, 4, Math.PI, TAU); nstroke('#ff3355', 1.4); glow(c.x, c.y, 40, '#ff3355', 0.25); } });
  const b = g.boss;
  if (b && b.type === 'root' && b.phase === 2) b.nodes.forEach(n => { if (n.dead) return; ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(n.x, n.y); nstroke('#ffe9a0', 1, 0.4); });
  const s = g.safe;
  if (s && s.on) {
    ctx.save(); ctx.beginPath(); ctx.rect(ARENA.x, ARENA.y, ARENA.w, ARENA.h); ctx.arc(s.cx, s.cy, s.r, 0, TAU, true); ctx.clip('evenodd');
    ctx.fillStyle = 'rgba(255,40,50,' + (0.20 + 0.06 * Math.sin(t * 5)).toFixed(2) + ')'; ctx.fillRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h);
    ctx.strokeStyle = 'rgba(255,90,60,0.35)'; ctx.lineWidth = 1; ctx.beginPath(); for (let k = -ARENA.h; k < ARENA.w; k += 14) { ctx.moveTo(ARENA.x + k, ARENA.y + ARENA.h); ctx.lineTo(ARENA.x + k + ARENA.h, ARENA.y); } ctx.stroke(); ctx.restore();
    ctx.beginPath(); ctx.arc(s.cx, s.cy, s.r, 0, TAU); nstroke(s.delay > 0 ? '#ffffff' : '#ffd34a', 2, 0.9);
  }
}
function drawEnemyExt(e, t, fillc, col, fa, flash) {
  switch (e.type) {
    case 'turret': {
      poly(8, e.r, Math.PI / 8); ctx.fillStyle = fillc; ctx.fill(); nstroke(col, 1.8); ctx.save(); ctx.rotate(fa); ctx.fillStyle = col; ctx.fillRect(2, -2.5, e.r + 6, 5); ctx.restore();
      ctx.fillStyle = flash ? '#fff' : '#ffe0b0'; ctx.beginPath(); ctx.arc(0, 0, 3, 0, TAU); ctx.fill(); break; }
    case 'splitter': {
      const k = 1 + Math.sin(t * 6 + e.wob) * 0.07;
      ctx.beginPath(); ctx.arc(0, 0, e.r * 0.85 * k, 0, TAU); ctx.fillStyle = fillc; ctx.fill(); nstroke(col, 1.8);
      for (let i = 0; i < 3; i++) { const a = i / 3 * TAU + t * 1.2; ctx.beginPath(); ctx.arc(Math.cos(a) * e.r * 0.42, Math.sin(a) * e.r * 0.42, 3, 0, TAU); nstroke(col, 1, 0.9); }
      break; }
    case 'elite': {
      ctx.save(); ctx.rotate(t * 0.8); poly(6, e.r * 1.05, 0); ctx.fillStyle = fillc; ctx.fill(); nstroke(col, 2.6); ctx.restore();
      ctx.save(); ctx.rotate(-t * 1.3); poly(3, e.r * 0.6, 0); nstroke('#fff', 1.4, 0.8); ctx.restore();
      ctx.fillStyle = flash ? '#fff' : col; ctx.beginPath(); ctx.arc(Math.cos(fa) * 5, Math.sin(fa) * 5, 4.5, 0, TAU); ctx.fill(); break; }
    case 'node': {
      ctx.save(); ctx.rotate(t * 2); ctx.beginPath(); ctx.rect(-e.r * 0.7, -e.r * 0.7, e.r * 1.4, e.r * 1.4); ctx.fillStyle = fillc; ctx.fill(); nstroke(col, 2); ctx.restore();
      ctx.fillStyle = flash ? '#fff' : '#fff6c0'; ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, TAU); ctx.fill(); break; }
    case 'sentinel': {
      poly(8, e.r, Math.PI / 8); ctx.fillStyle = fillc; ctx.fill(); nstroke(col, 2.6);
      ctx.save(); ctx.rotate(t * 0.5); poly(4, e.r * 0.62, 0); nstroke('#ffb347', 1.6); ctx.restore();
      for (let i = 0; i < 4; i++) { const a = fa + i * Math.PI / 2; ctx.fillStyle = col; ctx.save(); ctx.rotate(a); ctx.fillRect(e.r * 0.55, -2.5, e.r * 0.6, 5); ctx.restore(); }
      ctx.fillStyle = flash ? '#fff' : '#ffe0b0'; ctx.beginPath(); ctx.arc(0, 0, 6, 0, TAU); ctx.fill();
      if (e.shields) e.shields.forEach(s => { const a0 = e.rot + s.off - s.span / 2; ctx.beginPath(); ctx.arc(0, 0, e.r + 14, a0, a0 + s.span); nstroke(e.shieldFlash > 0 ? '#ffffff' : '#ff9a3c', 4, 1); });
      break; }
    case 'twin': {
      const gl = 0.5 + 0.3 * Math.sin(t * 8);
      ctx.globalAlpha = 0.9; drawEmblem(e.cls, 0, 0, e.r, e.color, t, true); ctx.beginPath(); ctx.arc(0, 0, e.r + 5, 0, TAU); nstroke('#ffffff', 1, gl);
      const rc = RARITIES[e.w.rarity].color; drawGun(e.w.type, Math.cos(fa) * 6, Math.sin(fa) * 6, fa, 1, rc); ctx.globalAlpha = 1;
      if (e.rage > 0) glow(0, 0, e.r * 3, '#ff2a3d', 0.5); break; }
    case 'root': {
      const pul = 1 + Math.sin(t * 3) * 0.03, hot = e.phase === 3;
      glow(0, 0, e.r * 2.4, hot ? '#ff6a3c' : '#ffd34a', 0.5 + Math.sin(t * 4) * 0.1);
      ctx.save(); ctx.rotate(t * 0.3); poly(10, e.r * pul, 0); ctx.fillStyle = fillc; ctx.fill(); nstroke(hot ? '#ff7a3c' : '#ffd34a', 3.4); ctx.restore();
      ctx.save(); ctx.rotate(-t * 0.5); poly(5, e.r * 0.72, 0); nstroke('#fff6c0', 1.8, 0.9); ctx.restore();
      ctx.save(); ctx.rotate(t * 0.9); for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.fillStyle = hot ? '#ff7a3c' : '#ffd34a'; ctx.fillRect(e.r * 0.78, -3, 10, 6); } ctx.restore();
      ctx.beginPath(); ctx.arc(0, 0, e.r * 0.34, 0, TAU); ctx.fillStyle = flash ? '#fff' : (hot ? '#fff0d0' : '#fffbe0'); ctx.fill(); glow(0, 0, e.r * 0.9, '#fff', 0.8);
      if (e.invuln) { ctx.beginPath(); ctx.arc(0, 0, e.r + 8 + Math.sin(t * 6) * 2, 0, TAU); nstroke('#ffe9a0', 2.4, 0.9); ctx.fillStyle = 'rgba(255,233,160,0.10)'; ctx.fill(); }
      break; }
  }
}
