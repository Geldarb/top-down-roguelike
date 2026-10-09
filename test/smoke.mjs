// Headless smoke test: node test/smoke.mjs  (needs puppeteer-core + a local Chrome)
import { createRequire } from 'module';
import { spawn } from 'child_process';
import fs from 'fs';
const require = createRequire(import.meta.url);
const puppeteer = require(process.env.PUPPETEER_PATH || 'puppeteer-core');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(p => fs.existsSync(p));
const PORT = 8187, APP = `http://localhost:${PORT}/`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const srv = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { if ((await fetch(APP)).ok) break; } catch {} await sleep(100); }
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const OUT = process.env.SHOTS || '/workspace/shots-tdr'; fs.mkdirSync(OUT, { recursive: true });
let fail = 0;
try {
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message)); page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(APP + '?god=1', { waitUntil: 'load' });
  await sleep(500);
  await page.screenshot({ path: OUT + '/01-menu.png' });
  // tap START RUN with a real touch
  const btn = await page.evaluate(() => { const h = window.TDR.hot()[0]; const sc = scale, ox = offX, oy = offY; return { x: ox + (h.x + h.w / 2) * sc, y: oy + (h.y + h.h / 2) * sc }; });
  await page.touchscreen.tap(btn.x, btn.y); await sleep(400);
  const st = await page.evaluate(() => window.TDR.state); console.log('state after tap start:', st); if (st !== 'play') fail++;
  // joystick drag with touch
  const t = await page.touchscreen.touchStart(150, 650);
  await t.move(200, 650); await sleep(600);
  const joy = await page.evaluate(() => ({ active: joy.active, mx: joy.mx, my: joy.my, x: G.player.x }));
  console.log('joystick', joy); if (!joy.active || joy.mx <= 0) fail++;
  await page.screenshot({ path: OUT + '/02-play-joystick.png' });
  await t.end(); await sleep(200);
  // tap dash button
  const db = await page.evaluate(() => { const L = layout(); return { x: offX + L.dash.x * scale, y: offY + L.dash.y * scale }; });
  await page.touchscreen.tap(db.x, db.y); await sleep(100);
  const dashed = await page.evaluate(() => G.player.dashCd > 0); console.log('dash used', dashed); if (!dashed) fail++;
  // autoplay full run in god mode via fast-forward
  const res = await page.evaluate(async () => {
    const T = window.TDR; const log = []; let perks = 0, picked = 0, weapons = new Set(), maxEn = 0, rooms = new Set(); const dirs = ['a', 'd', 'w', 's'];
    let steps = 0, seen = new Set();
    const key = (k, d) => window.dispatchEvent(new KeyboardEvent(d ? 'keydown' : 'keyup', { key: k }));
    let cur = null;
    while (steps++ < 120000 && T.state !== 'win' && T.state !== 'over') {
      const g = T.G;
      if (steps % 40 === 1) { if (cur) key(cur, false); cur = dirs[Math.floor(Math.random() * 4)]; key(cur, true); }
      if (T.state === 'perk') { perks++; T.takePerk(g.perkOffer[0]); }
      if (T.state === 'play') {
        rooms.add(g.room); maxEn = Math.max(maxEn, g.enemies.length);
        g.player.slots.forEach(w => w && weapons.add(w.name));
        g.items.forEach(it => { if (it.kind === 'weapon') { seen.add(it.w.name); } });
        if (g.doorOpen) { g.player.x = ARENA.x + ARENA.w / 2; g.player.y = ARENA.y + 10; }
        if (g.items.length && steps % 7 === 0) { const it = g.items[0]; g.player.x = it.x; g.player.y = it.y; }
        if (g.near && steps % 11 === 0) { const n0 = g.found; window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' })); if (g.found > n0) picked++; }
        if (g.chests.length && !g.chests[0].open && steps % 5 === 0) { g.player.x = g.chests[0].x; g.player.y = g.chests[0].y + 5; }
        if (steps % 90 === 0) { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'q' })); window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' })); window.dispatchEvent(new KeyboardEvent('keydown', { key: '2' })); }
        // chase enemies so we actually fight
        if (g.enemies.length && steps % 3 === 0) { const e = g.enemies[0]; const d = Math.hypot(e.x - g.player.x, e.y - g.player.y); if (d > 120) { g.player.x += (e.x - g.player.x) / d * 3; g.player.y += (e.y - g.player.y) / d * 3; } }
      }
      T.update(1 / 60);
      if (steps % 400 === 0) T.render();
    }
    key(cur, false);
    return { state: T.state, steps, perks, picked, weaponsOwned: [...weapons], seenDrops: [...seen].slice(0, 12), maxEn, rooms: [...rooms], kills: T.G.kills, time: T.G.time, best: T.best() };
  });
  console.log(JSON.stringify(res, null, 1));
  if (res.state !== 'win') fail++;
  if (!res.picked) { console.log('FAIL: autoplay never picked up a weapon'); fail++; }
  await sleep(200);
  await page.screenshot({ path: OUT + '/09-end.png' });
  console.log('errors:', errs); if (errs.length) fail++;
  // ---------- pickup flow (portrait): no auto pickup, tooltip only when near, button picks up / swaps
  {
    const pp = await browser.newPage(); const e3 = [];
    pp.on('pageerror', e => e3.push(e.message)); pp.on('console', m => { if (m.type() === 'error') e3.push(m.text()); });
    await pp.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await pp.goto(APP + '?god=1', { waitUntil: 'load' }); await sleep(300);
    await pp.evaluate(() => { TDR.newRun(); for (let i = 0; i < 30; i++) TDR.update(1 / 60); G.enemies.length = 0; G.roomState = 'idle'; });
    const tap = async (r) => { const q = await pp.evaluate(r => ({ x: offX + (r.x + r.w / 2) * scale, y: offY + (r.y + r.h / 2) * scale }), r); await pp.touchscreen.tap(q.x, q.y); await sleep(120); };
    const chk = (name, ok, extra) => { console.log((ok ? 'ok   ' : 'FAIL ') + name, ok ? '' : JSON.stringify(extra || '')); if (!ok) fail++; };
    // weapon far away: no tooltip, no pickup button
    let r = await pp.evaluate(() => { const p = G.player; G.items.push({ kind: 'weapon', w: TDR.genWeapon('shotgun', 2), x: p.x + 90, y: p.y, t: 1, vx: 0, vy: 0 }); TDR.update(1 / 60); return { near: !!G.near, pick: !!layout().pick }; });
    chk('far weapon: no tooltip/button', !r.near && !r.pick, r);
    // walk onto it WITHOUT auto-pickup
    r = await pp.evaluate(() => { const p = G.player, it = G.items[0]; p.x = it.x; p.y = it.y; for (let i = 0; i < 90; i++) TDR.update(1 / 60); return { near: !!G.near, slot1: !!p.slots[1], items: G.items.length, pick: !!layout().pick, swap: !!layout().swap }; });
    chk('standing on weapon: tooltip + Pick Up button, no auto pickup', r.near && !r.slot1 && r.items === 1 && r.pick && !r.swap, r);
    await pp.screenshot({ path: OUT + '/03-pickup-tooltip.png' });
    await tap(await pp.evaluate(() => layout().pick));
    r = await pp.evaluate(() => ({ slot1: G.player.slots[1] && G.player.slots[1].type, active: G.player.active, items: G.items.filter(i => i.kind === 'weapon').length, near: !!G.near }));
    chk('button picks into free slot 2', r.slot1 === 'shotgun' && r.active === 1 && r.items === 0 && !r.near, r);
    // both full: two swap buttons; swap slot 1 (not the active one) and old weapon drops
    r = await pp.evaluate(() => { const p = G.player; window.__old0 = p.slots[0].id; window.__new = TDR.genWeapon('sniper', 3); G.items.push({ kind: 'weapon', w: window.__new, x: p.x + 4, y: p.y, t: 1, vx: 0, vy: 0 }); for (let i = 0; i < 5; i++) TDR.update(1 / 60); const L = layout(); return { near: !!G.near, swap: !!L.swap, pick: !!L.pick, active: p.active }; });
    chk('both slots full: swap buttons shown', r.near && r.swap && !r.pick, r);
    await pp.screenshot({ path: OUT + '/04-swap-buttons.png' });
    await tap(await pp.evaluate(() => layout().swap[0]));
    r = await pp.evaluate(() => { const p = G.player; const d = G.items.filter(i => i.kind === 'weapon'); return { s0: p.slots[0].id === window.__new.id, active: p.active, dropped: d.length === 1 && d[0].w.id === window.__old0, ignore: d[0] && d[0].ignore, near: !!G.near }; });
    chk('swap slot 1 replaces slot 1, old weapon dropped on floor', r.s0 && r.active === 0 && r.dropped && !r.near, r);
    // walk away: tooltip disappears; dropped weapon is not re-offered until stepping away and back
    r = await pp.evaluate(() => { const p = G.player; p.x += 120; if (p.x > ARENA.x + ARENA.w - 20) p.x -= 240; for (let i = 0; i < 5; i++) TDR.update(1 / 60); return { near: !!G.near, pick: !!layout().pick, swap: !!layout().swap }; });
    chk('walking away hides tooltip + buttons', !r.near && !r.pick && !r.swap, r);
    // nearest of several
    r = await pp.evaluate(() => { const p = G.player; G.items.length = 0; const a = { kind: 'weapon', w: TDR.genWeapon('pistol', 1), x: p.x + 25, y: p.y, t: 1, vx: 0, vy: 0 }, b = { kind: 'weapon', w: TDR.genWeapon('smg', 1), x: p.x - 8, y: p.y + 3, t: 1, vx: 0, vy: 0 }; G.items.push(a, b); for (let i = 0; i < 5; i++) TDR.update(1 / 60); return { nearest: G.near === b }; });
    chk('tooltip targets nearest weapon', r.nearest, r);
    // E key swaps into active slot when full
    r = await pp.evaluate(() => { const p = G.player; const act = p.active; window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' })); return { ok: p.slots[act].type === 'smg' }; });
    chk('E key picks up (active slot when full)', r.ok, r);
    // floor weapons draw no text labels: render and make sure fillText/strokeText are not used for item names
    r = await pp.evaluate(() => { G.items.length = 0; const p = G.player; G.items.push({ kind: 'weapon', w: TDR.genWeapon('smg', 2), x: p.x + 70, y: p.y, t: 1, vx: 0, vy: 0 }); G.items.push({ kind: 'weapon', w: TDR.genWeapon('pistol', 2), x: p.x + 76, y: p.y + 4, t: 1, vx: 0, vy: 0 });
      const names = G.items.map(i => i.w.name); const seen = []; const ft = CanvasRenderingContext2D.prototype.fillText; CanvasRenderingContext2D.prototype.fillText = function (t) { seen.push(String(t)); return ft.apply(this, arguments); };
      for (let i = 0; i < 3; i++) { TDR.update(1 / 60); TDR.render(); } CanvasRenderingContext2D.prototype.fillText = ft; return { near: !!G.near, leaked: seen.filter(t => names.some(n => t.indexOf(n) >= 0)) }; });
    chk('no labels on far floor weapons', !r.near && r.leaked.length === 0, r);
    console.log('errors pickup:', e3); if (e3.length) fail++;
    await pp.close();
  }

  // ---------- landscape: layout, thumb zones, safe areas, live orientation change
  {
    const lp = await browser.newPage(); const e4 = [];
    lp.on('pageerror', e => e4.push(e.message)); lp.on('console', m => { if (m.type() === 'error') e4.push(m.text()); });
    const chk = (name, ok, extra) => { console.log((ok ? 'ok   ' : 'FAIL ') + name, ok ? '' : JSON.stringify(extra || '')); if (!ok) fail++; };
    await lp.setViewport({ width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await lp.goto(APP + '?god=1&safe=0,47,21,47', { waitUntil: 'load' }); await sleep(400);
    await lp.screenshot({ path: OUT + '/05-landscape-menu.png' });
    let st = await lp.evaluate(() => ({ land, LW, LH, scale, offX, offY, w: innerWidth, h: innerHeight }));
    chk('landscape detected, canvas fills screen', st.land && Math.abs(st.LW * st.scale - st.w) < 3 && Math.abs(st.LH * st.scale - st.h) < 3, st);
    const hb = await lp.evaluate(() => { const h = TDR.hot()[0]; return { x: offX + (h.x + h.w / 2) * scale, y: offY + (h.y + h.h / 2) * scale }; });
    await lp.touchscreen.tap(hb.x, hb.y); await sleep(300);
    chk('start run in landscape', (await lp.evaluate(() => TDR.state)) === 'play');
    await lp.evaluate(() => { for (let i = 0; i < 30; i++) TDR.update(1 / 60); G.enemies.length = 0; G.roomState = 'idle'; });
    const geo = await lp.evaluate(() => {
      const L = layout(), A = ARENA, out = {}; const inside = r => r.x >= 0 && r.y >= 0 && r.x + r.w <= LW && r.y + r.h <= LH;
      const circ = c => ({ x: c.x - c.r, y: c.y - c.r, w: c.r * 2, h: c.r * 2 });
      const rects = { pause: L.pause, slot0: L.slot[0], slot1: L.slot[1], dash: circ(L.dash), spec: circ(L.spec) };
      out.inside = Object.keys(rects).every(k => inside(rects[k]));
      const ov = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
      out.noArenaOverlap = Object.keys(rects).every(k => !ov(rects[k], A)) && !ov(L.pickBox.single, A) && L.pickBox.swap.every(r => !ov(r, A));
      out.right = L.dash.x > LW / 2 && L.spec.x > LW / 2 && L.pickBox.single.x > LW / 2;
      out.pauseCorner = L.pause.x + L.pause.w > LW - 60 && L.pause.y < 40;
      // safe area: nothing within the 47px (css) side insets / 21px bottom inset
      const sx = 47 / scale, sb = 21 / scale; out.safe = Object.keys(rects).concat([]).every(k => rects[k].x >= sx - 0.5 && rects[k].x + rects[k].w <= LW - sx + 0.5 && rects[k].y + rects[k].h <= LH - sb + 0.5) && A.x >= sx - 0.5 && A.y + A.h <= LH - sb + 0.5;
      out.arenaBig = A.w > 450 && A.h > 300; out.A = A; out.SA = SA;
      return out;
    });
    chk('landscape HUD/controls inside screen', geo.inside, geo); chk('HUD/buttons do not cover the arena', geo.noArenaOverlap, geo);
    chk('action buttons in the right thumb zone, pause in a corner', geo.right && geo.pauseCorner, geo);
    chk('safe-area insets respected', geo.safe && geo.SA.l > 40, geo); chk('arena is large in landscape', geo.arenaBig, geo);
    // joystick (left) via touch + dash tap (right)
    const jt = await lp.touchscreen.touchStart(150, 250); await jt.move(210, 250); await sleep(500);
    const jo = await lp.evaluate(() => ({ active: joy.active, mx: joy.mx, x: G.player.x })); chk('landscape joystick works', jo.active && jo.mx > 0, jo);
    await jt.end();
    const dpos = await lp.evaluate(() => { const L = layout(); return { x: offX + L.dash.x * scale, y: offY + L.dash.y * scale }; });
    await lp.touchscreen.tap(dpos.x, dpos.y); await sleep(100);
    chk('landscape dash button', await lp.evaluate(() => G.player.dashCd > 0));
    // pickup in landscape
    await lp.evaluate(() => { const p = G.player; p.slots[1] = TDR.genWeapon('pistol', 1); G.items.push({ kind: 'weapon', w: TDR.genWeapon('launcher', 3), x: p.x + 3, y: p.y, t: 1, vx: 0, vy: 0 }); for (let i = 0; i < 5; i++) TDR.update(1 / 60); });
    await sleep(150); await lp.screenshot({ path: OUT + '/06-landscape-tooltip.png' });
    const sw = await lp.evaluate(() => { const r = layout().swap[1]; return { x: offX + (r.x + r.w / 2) * scale, y: offY + (r.y + r.h / 2) * scale, ok: !!r }; });
    await lp.touchscreen.tap(sw.x, sw.y); await sleep(120);
    chk('landscape: swap slot 2 button works', await lp.evaluate(() => G.player.slots[1].type === 'launcher' && G.player.active === 1));
    // live resize: rotate to portrait mid-run (pauses), back to landscape, arena/entities stay valid
    const before = await lp.evaluate(() => ({ n: G.enemies.length }));
    await lp.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); await sleep(300);
    st = await lp.evaluate(() => { const p = G.player; return { land, state: TDR.state, A: { ...ARENA }, inside: p.x >= ARENA.x && p.x <= ARENA.x + ARENA.w && p.y >= ARENA.y && p.y <= ARENA.y + ARENA.h, floorW: G.floor.width, LW, LH }; });
    chk('rotate to portrait live: layout switches, run paused, player in arena', !st.land && st.state === 'pause' && st.inside && st.floorW === st.LW * 2 && st.A.w < 345, st);
    await lp.screenshot({ path: OUT + '/07-rotated-portrait.png' });
    await lp.evaluate(() => TDR.setState('play'));
    await lp.setViewport({ width: 667, height: 375, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); await sleep(300);
    st = await lp.evaluate(() => { const p = G.player; for (let i = 0; i < 30; i++) TDR.update(1 / 60); return { land, inside: p.x >= ARENA.x && p.x <= ARENA.x + ARENA.w && p.y >= ARENA.y && p.y <= ARENA.y + ARENA.h, LW, LH, scale, w: innerWidth }; });
    chk('rotate back to landscape (different size) live', st.land && st.inside && Math.abs(st.LW * st.scale - st.w) < 3, st);
    // wide desktop window
    await lp.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 }); await sleep(300);
    st = await lp.evaluate(() => { for (let i = 0; i < 20; i++) TDR.update(1 / 60); TDR.render(); return { land, LW, LH, scale, w: innerWidth, h: innerHeight }; });
    chk('wide desktop uses the full window', st.land && Math.abs(st.LW * st.scale - st.w) < 3 && Math.abs(st.LH * st.scale - st.h) < 3, st);
    await lp.screenshot({ path: OUT + '/08-desktop-wide.png' });
    console.log('errors landscape:', e4); if (e4.length) fail++;
    await lp.close();
  }

  // death path (no god)
  const p2 = await browser.newPage(); const e2 = [];
  p2.on('pageerror', e => e2.push(e.message)); p2.on('console', m => { if (m.type() === 'error') e2.push(m.text()); });
  await p2.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await p2.goto(APP, { waitUntil: 'load' }); await p2.evaluate(() => window.TDR.newRun());
  const d = await p2.evaluate(() => { const T = window.TDR; let n = 0; G.player.hp = 25; while (n++ < 60000 && T.state === 'play' || T.state === 'perk') { if (T.state === 'perk') T.takePerk(G.perkOffer[0]); T.update(1 / 60); if (G.doorOpen) { G.player.x = ARENA.x + ARENA.w / 2; G.player.y = ARENA.y + 8; } } const s1 = T.state; for (let i = 0; i < 100; i++) T.update(1 / 60); return { s1, s: T.state, room: T.G.room, best: T.best() }; });
  console.log('death run', JSON.stringify(d)); if (d.s !== 'over') fail++;
  await p2.screenshot({ path: OUT + '/10-gameover.png' });
  console.log('errors2:', e2); if (e2.length) fail++;
} finally { await browser.close(); srv.kill(); }
console.log(fail ? 'FAILED ' + fail : 'ALL OK'); process.exit(fail ? 1 : 0);
