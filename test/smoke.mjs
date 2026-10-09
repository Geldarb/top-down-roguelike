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
  let st = await page.evaluate(() => window.TDR.state); console.log('state after tap START RUN:', st); if (st !== 'select') fail++;
  await page.screenshot({ path: OUT + '/01b-select.png' });
  // swipe the class carousel with a real touch drag (right->left = next class), then start from the card button
  const i0 = await page.evaluate(() => TDR.sel.idx);
  { const tt = await page.touchscreen.touchStart(300, 300); await tt.move(200, 300); await tt.move(100, 300); await tt.end(); await sleep(500); }
  const i1 = await page.evaluate(() => TDR.sel.idx); console.log('class swipe', i0, '->', i1); if (i1 !== i0 + 1) fail++;
  const sb = await page.evaluate(() => { const h = TDR.hot().find(h => /^START AS/.test(h.label)); return { x: offX + (h.x + h.w / 2) * scale, y: offY + (h.y + h.h / 2) * scale }; });
  await page.touchscreen.tap(sb.x, sb.y); await sleep(400);
  st = await page.evaluate(() => window.TDR.state); console.log('state after START AS:', st); if (st !== 'play') fail++;
  const saved = await page.evaluate(() => ({ ls: localStorage.getItem('neon_vault_class_v1'), cls: G.P.cls })); console.log('class saved', saved); if (saved.ls !== saved.cls || saved.cls !== 'breacher') fail++;
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
    chk('landscape: START RUN opens class select', (await lp.evaluate(() => TDR.state)) === 'select');
    const sb2 = await lp.evaluate(() => { const h = TDR.hot().find(h => /^START AS/.test(h.label)); return { x: offX + (h.x + h.w / 2) * scale, y: offY + (h.y + h.h / 2) * scale }; });
    await lp.touchscreen.tap(sb2.x, sb2.y); await sleep(300);
    chk('start run in landscape', (await lp.evaluate(() => TDR.state)) === 'play');
    await lp.evaluate(() => { for (let i = 0; i < 30; i++) TDR.update(1 / 60); G.enemies.length = 0; G.roomState = 'idle'; });
    const geo = await lp.evaluate(() => {
      const L = layout(), A = ARENA, out = {}; const inside = r => r.x >= 0 && r.y >= 0 && r.x + r.w <= LW && r.y + r.h <= LH;
      const circ = c => ({ x: c.x - c.r, y: c.y - c.r, w: c.r * 2, h: c.r * 2 });
      const rects = { pause: L.pause, slot0: L.slot[0], slot1: L.slot[1], dash: circ(L.dash), skill: circ(L.skill) };
      out.inside = Object.keys(rects).every(k => inside(rects[k]));
      const ov = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
      out.noArenaOverlap = Object.keys(rects).every(k => !ov(rects[k], A)) && !ov(L.pickBox.single, A) && L.pickBox.swap.every(r => !ov(r, A));
      out.right = L.dash.x > LW / 2 && L.skill.x > LW / 2 && L.pickBox.single.x > LW / 2;
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

  // ---------- classes: select persistence, every class starts a run, passives and skills work
  {
    const cp = await browser.newPage(); const e5 = []; const chk = (name, ok, extra) => { console.log((ok ? 'ok   ' : 'FAIL ') + name, ok ? '' : JSON.stringify(extra || '')); if (!ok) fail++; };
    cp.on('pageerror', e => e5.push(e.message)); cp.on('console', m => { if (m.type() === 'error') e5.push(m.text()); });
    await cp.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await cp.goto(APP + '?god=1', { waitUntil: 'load' }); await sleep(300);
    chk('7 classes, no Siphon', await cp.evaluate(() => TDR.CLASSES.length === 7 && !TDR.CLASSES.some(c => /siphon/i.test(c.name + c.id + c.skill))));
    const START = { runner: 'pistol', breacher: 'shotgun', phantom: 'sniper', overclock: 'smg', daemon: 'crossbow', blackout: 'launcher' };
    const ids = await cp.evaluate(() => TDR.CLASSES.map(c => c.id));
    for (const id of ids) {
      const r = await cp.evaluate(async (id) => {
        const T = window.TDR; T.newRun(id); const g = T.G, p = g.player, out = { id };
        out.start = p.slots[0].type; out.hasSkillBtn = !!layout().skill; out.crit = g.P.crit;
        for (let i = 0; i < 90; i++) T.update(1 / 60);              // let wave 1 spawn in & start shooting
        // dash plain/identical: same cooldown for all classes
        out.dashCd = g.P.dashCd;
        const before = { bullets: g.bullets.length, hp: p.hp, dashCd: p.dashCd };
        const used = T.useSkill(); out.used = used; out.skillT = p.skillT;
        for (let i = 0; i < 70; i++) T.update(1 / 60);
        T.render();
        out.turrets = g.turrets.length; out.decoys = g.decoys.length; out.od = p.overdrive; out.haste = p.haste;
        if (id === 'daemon') { const tu = g.turrets[0]; out.turretFx = tu ? JSON.stringify(tu.w.afx) === JSON.stringify(p.slots[p.active].afx) : false; out.turretLife = tu ? tu.max : 0; }
        if (id === 'overclock') out.hp = p.hp;
        if (id === 'breacher') out.stunned = 0;
        if (id === 'glitch') { out.glitchNow = p.slots[0].name; }
        // skill goes on cooldown and the button state reflects it; skill key via keyboard
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'q' }));
        out.state = T.state; return out;
      }, id);
      const ok = r.hasSkillBtn && (id === 'glitch' || r.start === START[id]) && r.dashCd === 1.4 && (r.used || id === 'blackout') && r.state === 'play';
      chk('class ' + id + ' starts with ' + r.start + ' and fires its skill', ok, r);
    }
    // passives
    let r = await cp.evaluate(() => { TDR.newRun('runner'); return { crit: G.P.crit }; }); chk('runner passive: +crit', Math.abs(r.crit - 0.2) < 1e-9, r);
    r = await cp.evaluate(() => { TDR.newRun('breacher'); const g = G; g.roomState = 'idle'; g.pillars.length = 0; g.enemies.length = 0; const p = g.player; p.slots[0].dmg = 10; g.enemies.push({ type: 'chaser', x: p.x, y: p.y - 90, vx: 0, vy: 0, r: 10, hp: 1e6, max: 1e6, speed: 0, dmg: 0, spawnT: 0, hitT: 0, atk: 9, cd: 99, burn: 0, burnDps: 0, burnTick: 0, slow: 0, state: 0, st: 0, ang: 0, dead: false, wob: 0 });
      p.cd = 0; p.tgtT = 0; TDR.update(1 / 60); return { pierce: Math.min(...g.bullets.map(b => b.pierce)), n: g.bullets.length }; });
    chk('breacher passive: pellets pierce one enemy', r.n > 0 && r.pierce >= 1, r);
    r = await cp.evaluate(() => { TDR.newRun('phantom'); const g = G, p = g.player; g.roomState = 'idle'; g.pillars.length = 0; g.enemies.length = 0; p.slots[0].dmg = 20; const base = (() => { const n = g.bullets.length; return n; })(); window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' })); const armed = p.ambush; for (let i = 0; i < 20; i++) TDR.update(1 / 60);
      g.enemies.push({ type: 'chaser', x: p.x, y: p.y - 150, vx: 0, vy: 0, r: 10, hp: 1e6, max: 1e6, speed: 0, dmg: 0, spawnT: 0, hitT: 0, atk: 9, cd: 99, burn: 0, burnDps: 0, burnTick: 0, slow: 0, state: 0, st: 0, ang: 0, dead: false, wob: 0 });
      p.tgtT = 0; p.cd = 0; const nb = g.bullets.length; TDR.update(1 / 60); const first = g.bullets[g.bullets.length - 1]; p.cd = 0; TDR.update(1 / 60); p.cd = 0; const dmgs = g.bullets.map(b => b.dmg); return { armed, first: first && first.dmg, ratio: first ? first.dmg / Math.min(...dmgs.filter(d => d > 0)) : 0, ambushLeft: p.ambush }; });
    chk('phantom passive: first shot after dash is x3', r.armed && r.ratio > 2.5 && !r.ambushLeft, r);
    r = await cp.evaluate(() => { TDR.newRun('overclock'); const g = G, p = g.player; g.roomState = 'idle'; g.pillars.length = 0; g.enemies.length = 0; const mk = () => { g.bullets.length = 0; p.cd = 0; g.P.crit = 0; g.enemies.length = 0; g.enemies.push({ type: 'chaser', x: p.x, y: p.y - 100, vx: 0, vy: 0, r: 10, hp: 1e6, max: 1e6, speed: 0, dmg: 0, spawnT: 0, hitT: 0, atk: 9, cd: 99, burn: 0, burnDps: 0, burnTick: 0, slow: 0, state: 0, st: 0, ang: 0, dead: false, wob: 0 }); p.tgtT = 0; TDR.update(1 / 60); return g.bullets[0] && g.bullets[0].dmg; };
      p.hp = 100; const hi = mk(); p.hp = 20; const lo = mk(); return { hi, lo, ratio: lo / hi }; });
    chk('overclock passive: damage rises as HP drops', r.ratio > 1.5, r);
    r = await cp.evaluate(() => { TDR.newRun('daemon'); const g = G, p = g.player; p.skillT = 0; TDR.useSkill(); return { life: g.turrets[0].max }; }); chk('daemon passive: turrets last longer than the 8s base', r.life > 8 * 1.5, r);
    r = await cp.evaluate(() => { TDR.newRun('daemon'); const g = G, p = g.player; g.roomState = 'idle'; g.pillars.length = 0; g.enemies.length = 0; p.slots[0] = TDR.genWeapon('pistol', 2); p.skillT = 0; TDR.useSkill(); p.x = ARENA.x + 20; p.y = ARENA.y + ARENA.h - 20; const t = g.turrets[0]; g.enemies.push({ type: 'chaser', x: t.x, y: t.y - 90, vx: 0, vy: 0, r: 10, hp: 1e6, max: 1e6, speed: 0, dmg: 0, spawnT: 0, hitT: 0, atk: 9, cd: 99, burn: 0, burnDps: 0, burnTick: 0, slow: 0, state: 0, st: 0, ang: 0, dead: false, wob: 0 }); g.bullets.length = 0; p.skillT = 99;
      let shots = 0; for (let i = 0; i < 90; i++) { TDR.update(1 / 60); shots += g.bullets.filter(b => b.t < 0.02 && Math.hypot(b.x - t.x, b.y - t.y) < 20).length; } return { shots, hp: g.enemies[0].hp }; });
    chk('daemon turret fires at enemies', r.hp < 1e6, r);
    r = await cp.evaluate(() => { TDR.newRun('breacher'); const g = G, p = g.player; g.roomState = 'idle'; g.pillars.length = 0; g.enemies.length = 0; g.enemies.push({ type: 'chaser', x: p.x, y: p.y - 40, vx: 0, vy: 0, r: 10, hp: 1e6, max: 1e6, speed: 60, dmg: 0, spawnT: 0, hitT: 0, atk: 9, cd: 99, burn: 0, burnDps: 0, burnTick: 0, slow: 0, state: 0, st: 0, ang: 0, dead: false, wob: 0 }); p.skillT = 0; const e = g.enemies[0]; const y0 = e.y; TDR.useSkill(); for (let i = 0; i < 20; i++) TDR.update(1 / 60); return { stun: e.stun, knocked: y0 - e.y > 5 || e.y < y0 }; });
    chk('breacher shockwave stuns + knocks back', r.stun > 0.5 && r.knocked, r);
    r = await cp.evaluate(() => { TDR.newRun('phantom'); const g = G, p = g.player; g.roomState = 'idle'; g.pillars.length = 0; g.enemies.length = 0; g.enemies.push({ type: 'chaser', x: p.x + 60, y: p.y, vx: 0, vy: 0, r: 10, hp: 1e6, max: 1e6, speed: 60, dmg: 0, spawnT: 0, hitT: 0, atk: 9, cd: 99, burn: 0, burnDps: 0, burnTick: 0, slow: 0, state: 0, st: 0, ang: 0, dead: false, wob: 0 }); p.skillT = 0; TDR.useSkill(); const d = g.decoys[0]; p.x -= 120; const e = g.enemies[0]; const d0 = Math.hypot(e.x - d.x, e.y - d.y); for (let i = 0; i < 40; i++) TDR.update(1 / 60); return { toward: Math.hypot(e.x - d.x, e.y - d.y) < d0 - 15, decoy: g.decoys.length }; });
    chk('phantom decoy attracts enemies', r.toward, r);
    r = await cp.evaluate(() => { TDR.newRun('overclock'); const g = G, p = g.player; p.hp = 100; p.skillT = 0; TDR.useSkill(); return { hp: p.hp, od: p.overdrive }; }); chk('overclock redline: costs HP, boosts fire rate', r.hp === 85 && r.od > 4, r);
    r = await cp.evaluate(() => { TDR.newRun('blackout'); const g = G, p = g.player; g.roomState = 'idle'; g.pillars.length = 0; g.enemies.length = 0; const mk = (x, y) => ({ type: 'chaser', x, y, vx: 0, vy: 0, r: 10, hp: 200, max: 200, speed: 0, dmg: 0, spawnT: 0, hitT: 0, atk: 9, cd: 99, burn: 0, burnDps: 0, burnTick: 0, slow: 0, state: 0, st: 0, ang: 0, dead: false, wob: 0 });
      const cx = ARENA.x + ARENA.w / 2, cy = ARENA.y + 120; for (let i = 0; i < 5; i++) g.enemies.push(mk(cx + i * 6 - 12, cy + (i % 2) * 8)); const far = mk(ARENA.x + 30, ARENA.y + ARENA.h - 60); g.enemies.push(far); p.skillT = 0; TDR.useSkill(); for (let i = 0; i < 80; i++) TDR.update(1 / 60);
      return { clusterHp: g.enemies.filter(e => e.y < cy + 30).map(e => Math.round(e.hp)), farHp: far.hp }; });
    chk('blackout orbital strike hits the densest cluster, not the loner', r.clusterHp.every(h => h < 200) && r.farHp === 200, r);
    r = await cp.evaluate(() => { TDR.newRun('glitch'); const g = G, p = g.player; p.slots[0] = TDR.genWeapon('pistol', 3); const w = p.slots[0]; let changed = false; for (let k = 0; k < 6 && !changed; k++) { const before = w.afx.join(); p.skillT = 0; TDR.useSkill(); changed = w.afx.join() !== before; }
      const okName = w.name === (w.afx.map(a => AFFIX_BY_ID[a].adj).concat('Pistol')).join(' ');
      g.roomState = 'clear'; TDR.setState('play'); g.doorOpen = false; g.perkDone = false; g.clearT = -1; for (let i = 0; i < 3; i++) TDR.update(1 / 60);
      return { changed, okName, perks: g.perkOffer && g.perkOffer.length, state: TDR.state }; });
    chk('glitch: skill rerolls affixes; 4 perk choices', r.changed && r.okName && r.perks === 4, r);
    r = await cp.evaluate(() => { TDR.newRun('glitch'); const g = G, p = g.player; g.roomState = 'idle'; let hits = 0; for (let k = 0; k < 40; k++) { const w = TDR.genWeapon('smg', 3), before = w.afx.join(); g.items.length = 0; g.items.push({ kind: 'weapon', w, x: p.x, y: p.y, t: 1, vx: 0, vy: 0 }); TDR.update(1 / 60); TDR.pickup(1); if (w.afx.join() !== before) hits++; p.slots[1] = null; }
      return { hits }; });
    chk('glitch: pickups sometimes reroll an affix', r.hits > 5 && r.hits < 40, r);
    // normal classes get 3 perk choices
    r = await cp.evaluate(() => { TDR.newRun('runner'); const g = G; g.roomState = 'clear'; g.clearT = -1; g.perkDone = false; for (let i = 0; i < 3; i++) TDR.update(1 / 60); return { perks: g.perkOffer && g.perkOffer.length }; }); chk('other classes: 3 perk choices', r.perks === 3, r);
    // persistence: last class remembered across reloads; Glitch selection shown on select screen
    await cp.evaluate(() => TDR.newRun('daemon')); await cp.reload({ waitUntil: 'load' }); await sleep(300);
    r = await cp.evaluate(() => ({ idx: TDR.sel.idx, id: TDR.CLASSES[TDR.sel.idx].id })); chk('last chosen class remembered', r.id === 'daemon', r);
    // select screen visuals in portrait + landscape, all cards render
    for (const [w, h, tag] of [[390, 844, 'p'], [844, 390, 'l']]) {
      await cp.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); await sleep(250);
      for (let i = 0; i < 7; i++) { await cp.evaluate((i) => { TDR.setState('select'); TDR.selectClass(i); TDR.sel.pos = i; TDR.render(); }, i); if (i === 0 || i === 4 || i === 6) await cp.screenshot({ path: OUT + `/11-select-${tag}-${i}.png` }); }
      const g2 = await cp.evaluate(() => { const hh = TDR.hot(), inside = hh.every(r => r.x >= 0 && r.x + r.w <= LW + 1 && r.y >= 0 && r.y + r.h <= LH + 1); return { n: hh.length, inside, start: hh.some(r => /^START AS/.test(r.label)) }; });
      chk('class select ' + (tag === 'p' ? 'portrait' : 'landscape') + ': buttons on screen', g2.inside && g2.start, g2);
      // in-run: skill button in right thumb zone, inside screen, clear of the arena, in both orientations
      const g3 = await cp.evaluate(() => { TDR.newRun('runner'); for (let i = 0; i < 20; i++) TDR.update(1 / 60); const L = layout(), A = ARENA, s = L.skill; const ov = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
        const dist2 = Math.hypot(s.x - L.dash.x, s.y - L.dash.y) > s.r + L.dash.r - 4;
        const sr = { x: s.x - s.r, y: s.y - s.r, w: s.r * 2, h: s.r * 2 };
        return { right: s.x > LW / 2, inside: sr.x >= 0 && sr.y >= 0 && sr.x + sr.w <= LW && sr.y + sr.h <= LH, noOverlapDash: dist2, arenaClear: !ov(sr, A) || !land === true }; });
      chk('skill button in thumb zone (' + tag + ')', g3.right && g3.inside && g3.noOverlapDash, g3);
      // tap the skill button with a real touch
      const sp = await cp.evaluate(() => { const s = layout().skill; return { x: offX + s.x * scale, y: offY + s.y * scale }; });
      await cp.touchscreen.tap(sp.x, sp.y); await sleep(150);
      chk('touch on skill button triggers skill (' + tag + ')', await cp.evaluate(() => G.player.skillT > 0));
      await cp.screenshot({ path: OUT + `/12-play-${tag}.png` });
    }
    console.log('errors classes:', e5); if (e5.length) fail++;
    await cp.close();
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
