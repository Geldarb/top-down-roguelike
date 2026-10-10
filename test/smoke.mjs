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
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], protocolTimeout: 900000 });
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
  // autoplay full run in god mode via fast-forward: through all 14 stages, shops, risk rooms, loop-free
  const res = await page.evaluate(async () => {
    const T = window.TDR; const g0 = T.G; let perks = 0, picked = 0, weapons = new Set(), maxEn = 0; const dirs = ['a', 'd', 'w', 's'];
    let steps = 0, seen = new Set();
    const key = (k, d) => window.dispatchEvent(new KeyboardEvent(d ? 'keydown' : 'keyup', { key: k }));
    let cur = null; const stages = [], zoneBanners = {}, phases = new Set(), t0 = {}; let shops = 0, risks = 0, credMax = 0;
    while (steps++ < 150000 && T.state !== 'win' && T.state !== 'over') {
      const g = T.G;
      if (steps % 40 === 1) { if (cur) key(cur, false); cur = dirs[Math.floor(Math.random() * 4)]; key(cur, true); }
      if (T.state === 'perk') { perks++; T.takePerk(g.perkOffer[0]); }
      else if (T.state === 'shop') { shops++; for (let i = 0; i < 5; i++) T.buyOffer(i); T.leaveShop(); }
      else if (T.state === 'risk') { risks++; T.riskChoose(risks % 2 ? 0 : 2); }
      if (T.state === 'play') {
        if (!stages.some(s => s.n === g.room)) { stages.push({ n: g.room, zone: g.zone, kind: g.cur.kind, boss: g.cur.boss || null, t: g.time }); }
        if (g.banner && g.banner.zone) zoneBanners[g.zone] = g.banner.text;
        if (g.boss && g.boss.type === 'root') phases.add(g.boss.phase);
        credMax = Math.max(credMax, g.credits);
        maxEn = Math.max(maxEn, g.enemies.length);
        g.player.slots.forEach(w => w && weapons.add(w.name));
        g.items.forEach(it => { if (it.kind === 'weapon') { seen.add(it.w.name); } });
        if (g.doorOpen) { g.player.x = ARENA.x + ARENA.w / 2; g.player.y = ARENA.y + 10; }
        if (g.items.length && steps % 7 === 0) { const it = g.items[0]; g.player.x = it.x; g.player.y = it.y; }
        if (g.near && steps % 11 === 0) { const n0 = g.found; window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' })); if (g.found > n0) picked++; }
        const ch = g.chests[0]; if (ch && !ch.open && !ch.locked && steps % 5 === 0) { g.player.x = ch.x; g.player.y = ch.y + 5; }
        if (steps % 90 === 0) { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'q' })); window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' })); window.dispatchEvent(new KeyboardEvent('keydown', { key: '2' })); }
        // chase enemies so we actually fight
        if (g.enemies.length && steps % 3 === 0) { const e = g.enemies.find(x => !x.dead && !x.invuln) || g.enemies[0]; const d = Math.hypot(e.x - g.player.x, e.y - g.player.y); if (d > 120) { g.player.x += (e.x - g.player.x) / d * 3; g.player.y += (e.y - g.player.y) / d * 3; } }
      }
      T.update(1 / 60);
      if (steps % 400 === 0) T.render();
    }
    key(cur, false);
    const gg = T.G;
    return { state: T.state, steps, perks, picked, shops, risks, credMax, weaponsOwned: [...weapons], seenDrops: [...seen].slice(0, 8), maxEn, stages, zoneBanners, phases: [...phases], kills: gg.kills, time: gg.time, clears: gg.clears, best: T.best() };
  });
  console.log(JSON.stringify({ ...res, stages: res.stages.map(s => `${s.n}:z${s.zone}:${s.boss || s.kind}`).join(' ') }, null, 1));
  if (res.state !== 'win') fail++;
  if (!res.picked) { console.log('FAIL: autoplay never picked up a weapon'); fail++; }
  {
    const ok = (n, c, x) => { console.log((c ? 'ok   ' : 'FAIL ') + n, c ? '' : JSON.stringify(x || '')); if (!c) fail++; };
    ok('zone progression: all 14 stages visited in order', res.stages.length === 14 && res.stages.every((s, i) => s.n === i + 1), res.stages.map(s => s.n));
    ok('zones 1,1,2,2,2,3,3,3,3,4,4,4,4,5', res.stages.map(s => s.zone).join() === '1,1,2,2,2,3,3,3,3,4,4,4,4,5', res.stages.map(s => s.zone));
    ok('zone intro banners with names for all 5 zones', ['BOOT SECTOR', 'FIREWALL ROW', 'DATA SWAMP', 'MIRROR MAINFRAME', 'CORE REACTOR'].every((n, i) => res.zoneBanners[i + 1] === n), res.zoneBanners);
    ok('bosses at stage 5 (Sentinel), 9 (Admin), 13 (Twin), 14 (ROOT)', res.stages[4].boss === 'sentinel' && res.stages[8].boss === 'boss' && res.stages[12].boss === 'twin' && res.stages[13].boss === 'root', res.stages);
    ok('ROOT went through phases 1, 2 and 3', [1, 2, 3].every(p => res.phases.includes(p)), res.phases);
    ok('every zone has room variety (>=2 kinds)', [1, 2, 3, 4].every(z => new Set(res.stages.filter(s => s.zone === z).map(s => s.boss ? 'boss' : s.kind)).size >= 2));
    ok('run collected credits, perks, shopped', res.credMax > 50 && res.perks >= 6, { credMax: res.credMax, perks: res.perks });
    ok('victory does not end the run: clears counted, state win', res.clears === 1 && res.state === 'win');
  }
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
      const sp = await cp.evaluate(() => { G.player.skillT = 0; const s = layout().skill; return { x: offX + s.x * scale, y: offY + s.y * scale }; });
      await cp.touchscreen.tap(sp.x, sp.y); await sleep(150);
      chk('touch on skill button triggers skill (' + tag + ')', await cp.evaluate(() => G.player.skillT > 0));
      await cp.screenshot({ path: OUT + `/12-play-${tag}.png` });
    }
    console.log('errors classes:', e5); if (e5.length) fail++;
    await cp.close();
  }

  // =====================================================================
  // ---------- zones, room types, hazards, bosses, perks, pause > weapons, loop mode
  // =====================================================================
  {
    const chk = (name, ok, extra) => { console.log((ok ? 'ok   ' : 'FAIL ') + name, ok ? '' : JSON.stringify(extra || '')); if (!ok) fail++; };
    const mk = async (w, h, god) => { const pg = await browser.newPage(); const er = []; pg.on('pageerror', e => er.push(e.message)); pg.on('console', m => { if (m.type() === 'error') er.push(m.text()); });
      await pg.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); await pg.goto(APP + (god ? '?god=1' : ''), { waitUntil: 'load' }); await sleep(300); pg.errs = er; return pg; };
    const shot = async (pg, path) => { await pg.bringToFront(); await pg.screenshot({ path }); };
    const tapHot = async (pg, re) => { await pg.bringToFront(); const q = await pg.evaluate(src => { const r = new RegExp(src); const h = TDR.hot().find(h => r.test(h.label)); return h ? { x: offX + (h.x + h.w / 2) * scale, y: offY + (h.y + h.h / 2) * scale, h: h.h * scale, w: h.w * scale, label: h.label } : null; }, re.source); if (!q) return null; await pg.touchscreen.tap(q.x, q.y); await sleep(90); return q; };
    const texts = (pg, fnSrc) => pg.evaluate(src => { const seen = []; const ft = CanvasRenderingContext2D.prototype.fillText; CanvasRenderingContext2D.prototype.fillText = function (t) { seen.push(String(t)); return ft.apply(this, arguments); }; try { (new Function(src))(); TDR.render(); } finally { CanvasRenderingContext2D.prototype.fillText = ft; } return seen; }, fnSrc);
    const gp = await mk(390, 844, true), np = await mk(390, 844, false);

    // ----- run plan: 14 stages, fixed zone structure, variety guaranteed, randomised per run
    let r = await gp.evaluate(() => { const plans = []; for (let i = 0; i < 60; i++) plans.push(TDR.buildPlan()); const ok = { len: true, zones: true, boss: true, variety: true, shop: true, riskLast: true };
      plans.forEach(p => { if (p.length !== 14) ok.len = false; if (p.map(c => c.zone).join() !== '1,1,2,2,2,3,3,3,3,4,4,4,4,5') ok.zones = false;
        if (!(p[4].boss === 'sentinel' && p[8].boss === 'boss' && p[12].boss === 'twin' && p[13].boss === 'root')) ok.boss = false;
        for (const z of [1, 2, 3, 4]) if (new Set(p.filter(c => c.zone === z).map(c => c.kind)).size < 2) ok.variety = false;
        if (!p.some(c => c.kind === 'shop')) ok.shop = false; p.forEach((c, i) => { if (c.kind === 'risk' && p[i + 1] && p[i + 1].boss) ok.riskLast = false; }); });
      ok.random = new Set(plans.map(p => p.map(c => c.kind).join())).size > 5; ok.kinds = [...new Set(plans.flatMap(p => p.map(c => c.kind)))].sort().join(); return ok; });
    chk('plans: 14 stages, 5 zones, 4 bosses, variety per zone, always a shop, randomised', r.len && r.zones && r.boss && r.variety && r.shop && r.riskLast && r.random && /combat.*elite.*gauntlet.*risk.*shop.*vault/.test(r.kinds), r);

    // ----- combat room: waves, clear, chest + perk choice, door
    r = await gp.evaluate(() => { TDR.newRun('runner'); TDR.startRoom(1, 'combat'); const g = G; const out = { en: g.enemies.length, waves: g.waves.length, state: g.roomState }; let guard = 0;
      while (g.roomState === 'fight' && guard++ < 3000) { g.enemies.forEach(e => TDR.killEnemy(e)); TDR.update(1 / 60); } out.cleared = g.roomState; out.chest = g.chests.length;
      for (let i = 0; i < 80; i++) TDR.update(1 / 60); out.state = TDR.state; out.offer = g.perkOffer && g.perkOffer.length; TDR.takePerk(g.perkOffer[0]); out.door = g.doorOpen; out.back = TDR.state; return out; });
    chk('combat room: waves -> clear -> chest -> perk choice -> door opens', r.en > 0 && r.waves === 2 && r.cleared === 'clear' && r.chest === 1 && r.state === 'perk' && r.offer === 3 && r.door && r.back === 'play', r);

    // ----- vault room: guarded chest with a weapon
    r = await gp.evaluate(() => { TDR.newRun('runner'); TDR.startRoom(2, 'vault'); const g = G, c = g.chests[0]; const out = { locked: c.locked, guards: g.enemies.length }; g.player.x = c.x; g.player.y = c.y + 6; g.enemies.forEach(e => { e.spawnT = 99; }); for (let i = 0; i < 20; i++) TDR.update(1 / 60); out.openedEarly = c.open; g.enemies.forEach(e => { e.spawnT = 0; });
      let guard = 0; while (g.roomState === 'fight' && guard++ < 3000) { g.enemies.forEach(e => TDR.killEnemy(e)); TDR.update(1 / 60); } out.unlocked = !c.locked; g.items.length = 0; g.player.x = c.x; g.player.y = c.y + 6; TDR.update(1 / 60); TDR.update(1 / 60);
      const ws = g.items.filter(i => i.kind === 'weapon'); out.opened = c.open; out.weapons = ws.length; out.maxRarity = Math.max(...ws.map(i => i.w.rarity)); return out; });
    chk('vault: chest locked until guards die, then opens with epic+ weapons', r.locked && r.guards > 0 && !r.openedEarly && r.unlocked && r.opened && r.weapons >= 2 && r.maxRarity >= 2, r);

    // ----- gauntlet: non-stop waves against a timer
    r = await gp.evaluate(() => { TDR.newRun('runner'); TDR.startRoom(3, 'gauntlet'); const g = G, ga = g.gaunt; const out = { timer: ga && ga.max, first: g.enemies.length }; let w0 = ga.waves;
      for (let i = 0; i < 60 * 6; i++) { g.enemies.forEach(e => TDR.killEnemy(e)); TDR.update(1 / 60); } out.wavesAfter6s = ga.waves; out.stillFighting = g.roomState === 'fight' && ga.t > 0;
      ga.t = 0.2; for (let i = 0; i < 30; i++) TDR.update(1 / 60); g.enemies.forEach(e => TDR.killEnemy(e)); for (let i = 0; i < 5; i++) TDR.update(1 / 60); out.state = g.roomState; out.credits = g.items.filter(i => i.kind === 'credit').length; return out; });
    chk('gauntlet: timer + repeated waves, clears only after the timer', r.timer > 20 && r.first > 0 && r.wavesAfter6s >= 3 && r.stillFighting && r.state === 'clear' && r.credits > 0, r);

    // ----- elite room: one tough enemy, guaranteed legendary
    r = await gp.evaluate(() => { TDR.newRun('runner'); TDR.startRoom(4, 'elite'); const g = G; const out = { n: g.enemies.length, elite: g.enemies[0].elite, hp: g.enemies[0].max, base: ENEMY_TYPES.chaser.hp }; g.items.length = 0;
      let shots = 0; for (let i = 0; i < 200; i++) { TDR.update(1 / 60); } shots = g.ebullets.length; const e = g.enemies[0]; e.spawnT = 0; TDR.killEnemy(e); out.legendary = g.items.filter(i => i.kind === 'weapon' && i.w.rarity === 3).length; for (let i = 0; i < 10; i++) TDR.update(1 / 60); out.state = g.roomState; return out; });
    chk('elite room: single tough enemy (shoots), drops a guaranteed legendary', r.n === 1 && r.elite && r.hp > r.base * 15 && r.legendary >= 1 && r.state === 'clear', r);

    // ----- shop terminal
    r = await gp.evaluate(() => { TDR.newRun('runner'); G.credits = 0; TDR.startRoom(2, 'shop'); const g = G; const out = { foes: g.enemies.length, state0: g.roomState, door: g.doorOpen, offers: g.shop.offers.map(o => o.kind) }; const s = g.shop;
      g.player.x = s.x; g.player.y = s.y + 6; TDR.update(1 / 60); out.opened = TDR.state; out.cantBuy = TDR.buyOffer(0); g.credits = 1000; g.player.hp = 40; const wi = s.offers.findIndex(o => o.kind === 'weapon');
      const items0 = g.items.length, c0 = g.credits; out.bought = TDR.buyOffer(wi); out.paid = c0 - g.credits === s.offers[wi].price; out.dropped = g.items.length === items0 + 1 && g.items[g.items.length - 1].kind === 'weapon'; out.rebuy = TDR.buyOffer(wi);
      const hi = s.offers.findIndex(o => o.kind === 'heal'); TDR.buyOffer(hi); out.healed = g.player.hp > 40; const pi = s.offers.findIndex(o => o.kind === 'perk'); if (pi >= 0) { const n0 = g.perksTaken.length; TDR.buyOffer(pi); out.perk = g.perksTaken.length === n0 + 1; } else out.perk = true;
      const ti = s.offers.findIndex(o => o.kind === 'reroll' || o.kind === 'banish'); const rr0 = g.rerolls + g.banishes; TDR.buyOffer(ti); out.token = g.rerolls + g.banishes === rr0 + 1; return out; });
    chk('shop: no enemies, opens on approach, buys weapon/heal/perk/token, cannot overspend or rebuy', r.foes === 0 && r.state0 === 'clear' && r.door && r.offers.length >= 4 && r.opened === 'shop' && r.cantBuy === false && r.bought && r.paid && r.dropped && !r.rebuy && r.healed && r.perk && r.token, r);
    r = await gp.evaluate(() => { TDR.leaveShop(); const out = { st: TDR.state }; for (let i = 0; i < 30; i++) TDR.update(1 / 60); out.stay = TDR.state; const s = G.shop; G.player.x = s.x + 120 > ARENA.x + ARENA.w - 10 ? s.x - 120 : s.x + 120; for (let i = 0; i < 5; i++) TDR.update(1 / 60); G.player.x = s.x; G.player.y = s.y; TDR.update(1 / 60); out.again = TDR.state; return out; });
    chk('shop: leaving does not instantly reopen; walking back does', r.st === 'play' && r.stay === 'play' && r.again === 'shop', r);
    // UI: touch the LEAVE button and an offer (portrait)
    r = await gp.evaluate(() => { TDR.render(); G.credits = 500; TDR.render(); return TDR.hot().map(h => ({ l: h.label, ok: h.x >= 0 && h.y >= 0 && h.x + h.w <= LW && h.y + h.h <= LH, hh: h.h })); });
    chk('shop UI: leave + offers on screen and touch-sized', r.some(h => h.l === 'LEAVE') && r.filter(h => /^offer/.test(h.l)).length >= 4 && r.every(h => h.ok), r);
    const free = await gp.evaluate(() => G.shop.offers.findIndex(o => !o.sold && o.price <= G.credits)); const credBefore = await gp.evaluate(() => G.credits); await tapHot(gp, new RegExp('^offer' + free + '$')); chk('shop UI: tapping an offer buys it', await gp.evaluate(b => G.credits < b, credBefore));
    await shot(gp, OUT + '/20-shop.png');
    await tapHot(gp, /^LEAVE$/); chk('shop UI: LEAVE returns to play', (await gp.evaluate(() => TDR.state)) === 'play');

    // ----- risk room
    r = await gp.evaluate(() => { TDR.newRun('runner'); TDR.startRoom(3, 'risk'); const g = G, a = g.risk; const out = { foes: g.enemies.length, door: g.doorOpen }; g.player.x = a.x; g.player.y = a.y + 6; TDR.update(1 / 60); out.opened = TDR.state;
      TDR.riskChoose(2); out.walk = TDR.state === 'play' && !g.hardNext; for (let i = 0; i < 5; i++) TDR.update(1 / 60);
      TDR.openShop; TDR.state = 'risk'; const n0 = g.items.length; TDR.riskChoose(0); const w = g.items[g.items.length - 1]; out.cursed = g.items.length === n0 + 1 && w.kind === 'weapon' && !!w.w.fx.cursed && w.w.rarity >= 2; out.hard = g.hardNext; return out; });
    chk('risk room: walk away is free; cursed weapon drops and flags the next room hardened', r.foes === 0 && r.door && r.opened === 'risk' && r.walk && r.cursed && r.hard, r);
    r = await gp.evaluate(() => { const g = G; TDR.startRoom(4, 'combat'); const e = g.enemies[0]; const out = { hardOn: g.hardOn, ratio: g.hpMul / (1 + 0.12 * 3), eHp: e.max / ENEMY_TYPES[e.type].hp / g.hpMul, next: g.hardNext, cred: g.credMul }; TDR.startRoom(5, 'combat'); out.after = g.hardOn; return out; });
    chk('risk: next room hardened (+35% HP, more credits), then back to normal', r.hardOn && Math.abs(r.ratio - 1.35) < 0.01 && Math.abs(r.eHp - 1) < 0.01 && !r.next && r.cred > 1.4 && !r.after, r);
    r = await gp.evaluate(() => { TDR.newRun('runner'); TDR.startRoom(3, 'risk'); TDR.state = 'risk'; TDR.riskChoose(1); const g = G; return { st: TDR.state, mode: g.perkMode, tiers: g.perkOffer.map(p => p.tier), hard: g.hardNext }; });
    chk('risk room: free perk offers rare+ perks and hardens next room', r.st === 'perk' && r.mode === 'risk' && r.tiers.every(t => t !== 'common') && r.hard, r);
    await gp.evaluate(() => { TDR.takePerk(G.perkOffer[0]); });

    // ----- zone hazards
    r = await np.evaluate(() => { TDR.newRun('runner'); TDR.startRoom(4, 'combat'); const g = G; const out = { lasers: g.lasers.length, turrets: g.enemies.filter(e => e.type === 'turret').length, banner: g.banner && g.banner.text };
      const states = new Set(); for (let i = 0; i < 60 * 6; i++) { g.enemies.forEach(e => { e.spawnT = 99; }); TDR.update(1 / 60); g.lasers.forEach(l => states.add(l.s)); } out.states = [...states].sort().join('');
      const l = g.lasers[0]; g.enemies.length = 0; g.roomState = 'idle'; const hp = g.player.hp; g.player.x = (l.x1 + l.x2) / 2; g.player.y = l.y1; g.player.iframes = 0;
      l.ph = (0.3 - g.time + l.per * 10) % l.per; TDR.update(1 / 60); out.hurtOn = hp - g.player.hp; g.player.iframes = 0; g.player.hp = 100; l.ph = (l.per - 0.4 - g.time + l.per * 10) % l.per; TDR.update(1 / 60); out.hurtWarn = 100 - g.player.hp; return out; });
    chk('zone 2: toggling laser walls (off/warn/on), damage only while on, ICE sentries present', r.lasers >= 2 && r.turrets >= 1 && r.states === '012' && r.hurtOn > 5 && r.hurtWarn === 0, r);
    r = await np.evaluate(() => { TDR.newRun('runner'); TDR.startRoom(7, 'combat'); const g = G; g.enemies.length = 0; g.roomState = 'idle'; const out = { pools: g.pools.length }; const dx = () => { const p = g.player; const x0 = p.x; window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' })); for (let i = 0; i < 15; i++) TDR.update(1 / 60); window.dispatchEvent(new KeyboardEvent('keyup', { key: 'd' })); for (let i = 0; i < 20; i++) TDR.update(1 / 60); return p.x - x0; };
      const q = g.pools[0]; g.pillars.length = 0; g.player.x = q.x - 5; g.player.y = q.y; g.player.vx = g.player.vy = 0; const inD = (() => { const p = g.player, x0 = p.x; window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' })); for (let i = 0; i < 10; i++) TDR.update(1 / 60); window.dispatchEvent(new KeyboardEvent('keyup', { key: 'd' })); return p.x - x0; })();
      g.pools.length = 0; g.player.x = ARENA.x + 40; g.player.y = ARENA.y + 100; g.player.vx = g.player.vy = 0; const outD = (() => { const p = g.player, x0 = p.x; window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' })); for (let i = 0; i < 10; i++) TDR.update(1 / 60); window.dispatchEvent(new KeyboardEvent('keyup', { key: 'd' })); return p.x - x0; })();
      out.ratio = inD / outD; return out; });
    chk('zone 3: data pools slow the player', r.pools >= 2 && r.ratio < 0.8 && r.ratio > 0.2, r);
    r = await np.evaluate(() => { TDR.newRun('runner'); TDR.startRoom(7, 'combat'); const g = G; g.enemies.length = 0; g.roomState = 'idle'; const e = TDR.addEnemy('splitter', ARENA.x + 100, ARENA.y + 120); e.spawnT = 0; TDR.killEnemy(e); const sw = g.enemies.filter(x => x.type === 'swarm').length; const e2 = TDR.addEnemy('splitter', ARENA.x + 200, ARENA.y + 120); e2.spawnT = 0; e2.noSplit = true; TDR.killEnemy(e2); return { sw, after: g.enemies.filter(x => x.type === 'swarm').length }; });
    chk('zone 3: splitters burst into 3 swarm on death', r.sw === 3 && r.after === 3, r);
    r = await np.evaluate(() => { let clones = 0, mirrored = 0, hpOk = 0; for (let k = 0; k < 40; k++) { TDR.newRun('runner'); TDR.startRoom(11, 'combat'); const g = G; g.enemies.length = 0; spawnList(['chaser', 'chaser', 'shooter', 'tank', 'chaser']); g.enemies.filter(e => e.clone).forEach(c => { clones++; const o = g.enemies.find(e => !e.clone && e.type === c.type && Math.abs(e.y - c.y) < 1); if (o && Math.abs(2 * ARENA.x + ARENA.w - o.x - c.x) < 1) mirrored++; if (o && c.max < o.max * 0.7) hpOk++; }); } return { clones, mirrored, hpOk }; });
    chk('zone 4: enemy clones spawn mirrored across the arena with reduced HP', r.clones > 5 && r.mirrored >= r.clones * 0.8 && r.hpOk >= r.clones * 0.9, r);
    r = await np.evaluate(() => { TDR.newRun('runner'); TDR.startRoom(11, 'combat'); const g = G; g.enemies.length = 0; g.roomState = 'idle'; const out = { mirrors: g.pillars.filter(p => p.mirror).length };
      const q = { x: ARENA.x + ARENA.w / 2 - 15, y: ARENA.y + ARENA.h / 2 - 20, w: 30, h: 40, mirror: true }; g.pillars = [q]; g.tiles = []; const p = g.player; p.x = q.x - 70; p.y = q.y + 20; p.iframes = 5; g.bullets.length = 0; fireWeapon(p.slots[0], 0);
      let bounced = false; for (let i = 0; i < 40; i++) { TDR.update(1 / 60); if (g.bullets.some(b => (b.mb || 0) > 0 && b.vx < 0)) bounced = true; } out.playerBounce = bounced;
      g.ebullets.length = 0; const eb = enemyShot(q.x + q.w + 60, q.y + 20, Math.PI, 150, 5, 4, '#fff'); let eBounce = false; for (let i = 0; i < 60; i++) { TDR.update(1 / 60); if ((eb.mb || 0) > 0 && eb.vx > 0) eBounce = true; } out.enemyBounce = eBounce;
      const wall = { x: ARENA.x + ARENA.w / 2 - 15, y: ARENA.y + ARENA.h / 2 - 20, w: 30, h: 40 }; g.pillars = [wall]; g.bullets.length = 0; p.x = wall.x - 70; p.y = wall.y + 20; fireWeapon(p.slots[0], 0); let reflected = false; for (let i = 0; i < 40; i++) { TDR.update(1 / 60); if (g.bullets.some(b => b.vx < 0)) reflected = true; } out.normalWallNoBounce = !reflected; return out; });
    chk('zone 4: mirror walls reflect player and enemy bullets, normal walls do not', r.mirrors >= 2 && r.playerBounce && r.enemyBounce && r.normalWallNoBounce, r);
    r = await np.evaluate(() => { let t = null; for (let k = 0; k < 30 && !t; k++) { TDR.newRun('runner'); TDR.startRoom(11, 'combat'); if (G.tiles.length) t = G.tiles[0]; } const g = G; g.enemies.length = 0; g.roomState = 'idle'; const out = { tiles: g.tiles.length }; const states = new Set(); for (let i = 0; i < 60 * 6; i++) { TDR.update(1 / 60); g.tiles.forEach(q => states.add(q.s)); } out.states = [...states].sort().join('');
      g.pillars.length = 0; const q = g.tiles[0]; g.player.x = q.x + q.w / 2; g.player.y = q.y + q.h / 2; g.player.hp = 100; g.player.iframes = 0; g.tiles.forEach(x => { x.ph = (3.9 - g.time + 50) % 5; }); TDR.update(1 / 60); out.hurt = 100 - g.player.hp; g.tiles.forEach(x => { x.ph = (2.9 - g.time + 50) % 5; }); g.player.iframes = 0; g.player.hp = 100; TDR.update(1 / 60); out.warnHurt = 100 - g.player.hp; return out; });
    chk('zone 4: glitching floor tiles telegraph (flicker) then damage', r.tiles >= 6 && r.states === '012' && r.hurt > 5 && r.warnHurt === 0, r);

    // ----- mini-bosses
    r = await gp.evaluate(() => { TDR.newRun('runner'); TDR.startRoom(5); const g = G, e = g.boss; e.spawnT = 0; e.stun = 999; const out = { type: e.type, shields: e.shields.length }; const p = g.player; g.enemies.filter(x => x !== e).forEach(x => { x.dead = true; }); p.x = e.x; p.y = e.y + 150; p.iframes = 99;
      const shoot = rot => { e.rot = rot; g.bullets.length = 0; const hp0 = e.hp; for (let k = 0; k < 4; k++) { fireWeapon(p.slots[0], -Math.PI / 2); for (let i = 0; i < 25; i++) TDR.update(1 / 60); } return hp0 - e.hp; };
      out.blocked = shoot(Math.PI / 2); out.open = shoot(Math.PI); e.stun = 0; e.spawnT = 0; let eb = 0; for (let i = 0; i < 600; i++) { TDR.update(1 / 60); eb = Math.max(eb, g.ebullets.length); } out.eb = eb;
      e.hp = e.max * 0.45; for (let i = 0; i < 5; i++) TDR.update(1 / 60); out.enraged = !!e.p2 && g.enemies.some(x => x.type === 'turret'); return out; });
    chk('Sentinel: rotating shields absorb shots, gaps let them through, fires patterns, enrages with turrets', r.type === 'sentinel' && r.shields === 2 && r.blocked === 0 && r.open > 20 && r.eb > 5 && r.enraged, r);
    r = await gp.evaluate(() => { const ids = TDR.CLASSES.map(c => c.id), out = {}; const types = ['pistol', 'shotgun', 'smg', 'sniper', 'crossbow', 'launcher'];
      ids.forEach((id, k) => { TDR.newRun(id); const g = G, p = g.player; p.slots[0] = TDR.genWeapon(types[k % 6], 2); TDR.startRoom(13); const e = g.boss; e.spawnT = 0; e.skCd = 0.1; e.fcd = 0.2; let eb = 0, fx = 0; for (let i = 0; i < 60 * 9; i++) { TDR.update(1 / 60); eb = Math.max(eb, g.ebullets.length); fx = Math.max(fx, g.fx.length); }
        out[id] = { cls: e.cls === id, weapon: e.w.type === p.slots[0].type, name: e.title, eb, fx, hp: e.max > 1000 }; });
      return out; });
    chk('Mirror Twin copies class + weapon, shoots and uses each class skill (7 classes x 6 weapon types)', Object.values(r).every(o => o.cls && o.weapon && o.name === 'MIRROR TWIN' && o.eb >= 1 && o.fx >= 1 && o.hp), r);
    r = await gp.evaluate(() => { TDR.newRun('phantom'); const g = G, p = g.player; p.slots[0] = TDR.genWeapon('sniper', 2); TDR.startRoom(13); const e = g.boss; return { color: e.color === g.C.color, hpScaled: e.max >= 1300 }; });
    chk('Mirror Twin uses the player class colour', r.color && r.hpScaled, r);

    // ----- ROOT: 3 phases (god page for flow, non-god page for the safe-zone damage)
    r = await gp.evaluate(() => { TDR.newRun('runner'); TDR.startRoom(14); const g = G, e = g.boss; const out = { name: e.title, zone: g.zone, hp: e.max, banner: g.banner && g.banner.text, pillars: g.pillars.length, fixed: !!e.fixed }; e.spawnT = 0;
      let eb = 0, drones = 0, tl = 0; for (let i = 0; i < 60 * 14; i++) { TDR.update(1 / 60); eb = Math.max(eb, g.ebullets.length); drones = Math.max(drones, g.enemies.length); tl = Math.max(tl, g.fx.filter(f => f.t === 'ring').length); } out.p1Bullets = eb; out.p1Drones = drones > 1; out.p1Telegraph = tl > 0; out.p1Invuln = !!e.invuln;
      const hp1 = e.hp; TDR.dealDamage(e, e.max * 0.45, false); out.phase2 = e.phase; out.invuln = e.invuln; out.nodes = g.enemies.filter(x => x.type === 'node').length; const hp2 = e.hp; g.enemies.filter(x => x.type === 'node').forEach(n => { n.spawnT = 0; });
      out.coreImmune = !TDR.dealDamage(e, 50, false) && e.hp === hp2; for (let i = 0; i < 60 * 3; i++) TDR.update(1 / 60); const nodes = g.enemies.filter(x => x.type === 'node'); let ang0 = Math.atan2(nodes[0].y - e.y, nodes[0].x - e.x); for (let i = 0; i < 30; i++) TDR.update(1 / 60); out.orbit = Math.abs(Math.atan2(nodes[0].y - e.y, nodes[0].x - e.x) - ang0) > 0.1;
      for (let k = 0; k < 3; k++) { TDR.dealDamage(nodes[k], 1e9, false); } for (let i = 0; i < 5; i++) TDR.update(1 / 60); out.stillP2 = e.phase === 2 && e.invuln; TDR.dealDamage(nodes[3], 1e9, false); for (let i = 0; i < 5; i++) TDR.update(1 / 60); out.phase3 = e.phase; out.vulnerable = !e.invuln; out.safe0 = g.safe && g.safe.r;
      for (let i = 0; i < 60 * 40; i++) TDR.update(1 / 60); out.safeEnd = g.safe.r; out.safeMin = g.safe.min; out.keepsShrinking = out.safeEnd < out.safe0 * 0.6; out.alive = TDR.state; return out; });
    chk('ROOT: giant stationary core, drones + slow telegraphed patterns in phase 1', r.name === 'ROOT' && r.zone === 5 && r.pillars === 0 && r.fixed && r.p1Bullets > 5 && r.p1Drones && r.p1Telegraph && !r.p1Invuln, r);
    chk('ROOT phase 2: shield breaks into 4 orbiting nodes, core invulnerable until all are destroyed', r.phase2 === 2 && r.invuln && r.nodes === 4 && r.coreImmune && r.orbit && r.stillP2, r);
    chk('ROOT phase 3: core exposed, bullet hell, safe zone shrinks to a minimum', r.phase3 === 3 && r.vulnerable && r.safe0 > 100 && r.keepsShrinking && Math.abs(r.safeEnd - r.safeMin) < 1 && r.alive === 'play', r);
    r = await np.evaluate(() => { TDR.newRun('runner'); TDR.startRoom(14); const g = G, e = g.boss; e.spawnT = 0; TDR.dealDamage(e, e.max * 0.45, false); g.enemies.filter(x => x.type === 'node').forEach(n => { n.spawnT = 0; TDR.dealDamage(n, 1e9, false); }); for (let i = 0; i < 5; i++) TDR.update(1 / 60);
      const s = g.safe, p = g.player; g.ebullets.length = 0; s.delay = 0; p.x = s.cx; p.y = s.cy; p.iframes = 0; p.hp = 100; const hpIn = (() => { for (let i = 0; i < 40; i++) { g.ebullets.length = 0; TDR.update(1 / 60); } return p.hp; })();
      p.x = ARENA.x + 6; p.y = ARENA.y + ARENA.h - 6; p.iframes = 0; p.hp = 100; s.tick = 0; for (let i = 0; i < 90; i++) { g.ebullets.length = 0; TDR.update(1 / 60); } return { hpIn, hpOut: p.hp }; });
    chk('ROOT phase 3: standing outside the safe zone hurts, inside does not', r.hpIn === 100 && r.hpOut < 90, r);
    r = await gp.evaluate(() => { TDR.newRun('runner'); TDR.startRoom(14); const g = G, e = g.boss; e.spawnT = 0; TDR.dealDamage(e, e.max * 0.45, false); g.enemies.filter(x => x.type === 'node').forEach(n => { n.spawnT = 0; TDR.dealDamage(n, 1e9, false); }); for (let i = 0; i < 5; i++) TDR.update(1 / 60); TDR.dealDamage(e, e.max * 5, false); const out = { dead: e.dead, endT: g.endT > 0, state: TDR.state }; for (let i = 0; i < 60 * 4; i++) TDR.update(1 / 60); out.win = TDR.state; out.clears = g.clears; return out; });
    chk('ROOT dies -> victory screen (run not recorded yet)', r.dead && r.endT && r.win === 'win' && r.clears === 1, r);
    await shot(gp, OUT + '/21-win.png');

    // ----- perks: pool, tiers, synergy filters, reroll / banish / skip, stacking
    r = await gp.evaluate(() => { TDR.newRun('runner'); const P = TDR.PERKS; const tiers = { common: 0, rare: 0, epic: 0 }; P.forEach(p => tiers[p.tier]++); const g = G; const out = { n: P.length, tiers, stack: P.some(p => p.max > 1), classPerks: P.filter(p => p.cls).length, affixPerks: P.filter(p => p.aff).length };
      let leakCls = 0, leakAff = 0, burnSeen = 0, clsSeen = 0; for (let i = 0; i < 400; i++) { const o = TDR.pickPerks(3, [], 0); if (o.length !== 3 || new Set(o.map(p => p.id)).size !== 3) out.badOffer = true; o.forEach(p => { if (p.cls && p.cls !== 'runner') leakCls++; if (p.aff) leakAff++; if (p.cls === 'runner') clsSeen++; }); }
      out.leakCls = leakCls; out.leakAff = leakAff; out.clsSeen = clsSeen; const w = TDR.genWeapon('pistol', 3); w.fx.burning = true; g.player.slots[1] = w; for (let i = 0; i < 400; i++) TDR.pickPerks(3, [], 0).forEach(p => { if (p.aff === 'burning') burnSeen++; }); out.burnSeen = burnSeen;
      let comm = 0; for (let i = 0; i < 200; i++) TDR.pickPerks(3, [], 1).forEach(p => { if (p.tier === 'common') comm++; }); out.commonInRare = comm; return out; });
    chk('perk pool: 30+ perks with common/rare/epic tiers, stackable, class + affix synergies', r.n >= 30 && r.tiers.common >= 8 && r.tiers.rare >= 8 && r.tiers.epic >= 3 && r.stack && r.classPerks >= 7 && r.affixPerks >= 8, r);
    chk('perk offers: 3 distinct, class perks only for own class, affix perks only with that affix, min tier honoured', !r.badOffer && r.leakCls === 0 && r.leakAff === 0 && r.clsSeen > 0 && r.burnSeen > 0 && r.commonInRare === 0, r);
    r = await gp.evaluate(() => { TDR.newRun('runner'); const g = G; g.credits = 0; TDR.offerPerks({}); const before = g.perkOffer.map(p => p.id); const rr0 = g.rerolls; const ok1 = TDR.rerollOffer(); const after = g.perkOffer.map(p => p.id); const out = { used: rr0 - g.rerolls, changed: after.every(id => before.indexOf(id) < 0), n: after.length, st: TDR.state };
      g.rerolls = 0; out.noMore = TDR.rerollOffer() === false; const bid = g.perkOffer[0].id, b0 = g.banishes; out.banished = TDR.banishCard(0); out.bUsed = b0 - g.banishes; out.replaced = g.perkOffer[0].id !== bid && g.perkOffer.length === 3; let seen = 0; for (let i = 0; i < 300; i++) TDR.pickPerks(3, [], 0).forEach(p => { if (p.id === bid) seen++; }); out.neverAgain = seen === 0; g.banishes = 0; out.noMoreBan = TDR.banishCard(1) === false;
      const d0 = g.doorOpen; TDR.skipOffer(); out.skip = { credits: g.credits, st: TDR.state, door: g.doorOpen }; TDR.offerPerks({}); const dm = TDR.PERKS.find(p => p.id === 'dmg'); TDR.takePerk(dm); TDR.offerPerks({}); TDR.takePerk(dm); out.stack = g.perkCount.dmg === 2 && Math.abs(g.P.dmg - 0.2) < 1e-9;
      const glass = TDR.PERKS.find(p => p.id === 'glass'); TDR.offerPerks({}); TDR.takePerk(glass); out.once = !TDR.perkEligible(0).some(p => p.id === 'glass'); TDR.newRun('glitch'); TDR.offerPerks({}); out.glitch4 = G.perkOffer.length; return out; });
    chk('perk reroll: limited tokens, whole offer changes', r.used === 1 && r.changed && r.n === 3 && r.noMore, r);
    chk('perk banish: limited, replaces card, never offered again', r.banished && r.bUsed === 1 && r.replaced && r.neverAgain && r.noMoreBan, r);
    chk('perk skip gives credits + opens door; stacking works; max stacks respected; Glitch keeps 4 choices', r.skip.credits === 40 && r.skip.st === 'play' && r.skip.door && r.stack && r.once && r.glitch4 === 4, r);
    // perk screen UI by touch (portrait)
    r = await gp.evaluate(() => { TDR.newRun('runner'); TDR.offerPerks({}); TDR.render(); return { hot: TDR.hot().map(h => ({ l: h.label, ok: h.x >= 0 && h.y >= 0 && h.x + h.w <= LW && h.y + h.h <= LH, h: h.h })), ids: G.perkOffer.map(p => p.id), rr: G.rerolls }; });
    chk('perk UI: 3 cards + REROLL / BANISH / SKIP buttons on screen', r.hot.filter(h => /^perk\d$/.test(h.l)).length === 3 && r.hot.some(h => /^REROLL/.test(h.l)) && r.hot.some(h => /^BANISH/.test(h.l)) && r.hot.some(h => /^SKIP/.test(h.l)) && r.hot.every(h => h.ok), r.hot);
    await tapHot(gp, /^REROLL/); r = await gp.evaluate(() => ({ rr: G.rerolls, st: TDR.state })); chk('perk UI: touching REROLL rerolls', r.rr === 1 && r.st === 'perk', r);
    await tapHot(gp, /^BANISH/); await tapHot(gp, /^perk1$/); r = await gp.evaluate(() => ({ b: G.banishes, st: TDR.state, n: Object.keys(G.banished).length })); chk('perk UI: BANISH then tap a card banishes it', r.b === 0 && r.n === 1 && r.st === 'perk', r);
    await shot(gp, OUT + '/22-perks.png');
    await tapHot(gp, /^perk0$/); chk('perk UI: tapping a card takes the perk', await gp.evaluate(() => TDR.state === 'play' && G.perksTaken.length === 1));

    // ----- pause menu: Weapons tab, Perks tab (portrait now, landscape below via the same suite)
    const pauseSuite = async (pg, tag) => {
      await pg.evaluate(() => { TDR.newRun('breacher'); const g = G, p = g.player; const a = TDR.genWeapon('shotgun', 3), b = TDR.genWeapon('sniper', 2); p.slots[0] = a; p.slots[1] = b; p.active = 0; g.player.cd = 1;
        ['dmg', 'dmg', 'crit', 'spd', 'glass', 'wind', 'leech', 'exec', 'cred', 'regen', 'armor', 'rate', 'luck', 'dash', 'special', 'maxhp', 'pen', 'bane', 'thorn', 'sprint', 'c_breacher'].forEach(id => { const pk = TDR.PERKS.find(x => x.id === id); pk.apply(g.P, g); g.perkCount[id] = (g.perkCount[id] || 0) + 1; g.perksTaken.push(id); }); TDR.state = 'play'; });
      const pb = await pg.evaluate(() => { const L = layout(); return { x: offX + (L.pause.x + L.pause.w / 2) * scale, y: offY + (L.pause.y + L.pause.h / 2) * scale }; });
      await pg.bringToFront(); await pg.touchscreen.tap(pb.x, pb.y); await sleep(120); chk(tag + ' pause button opens pause menu', (await pg.evaluate(() => TDR.state)) === 'pause');
      let hot = await pg.evaluate(() => { TDR.render(); return TDR.hot().map(h => h.label); });
      chk(tag + ' pause menu has MENU / WEAPONS / PERKS tabs and RESUME', ['MENU', 'WEAPONS', 'PERKS', 'RESUME'].every(l => hot.indexOf(l) >= 0), hot);
      const tb = await tapHot(pg, /^WEAPONS$/); chk(tag + ' touching WEAPONS tab opens it (touch target >= 28px)', (await pg.evaluate(() => G.pauseTab)) === 1 && tb.h >= 28, tb);
      const seen = await texts(pg, '');
      const info = await pg.evaluate(() => { const p = G.player, ws = p.slots.map(w => ({ name: w.name, type: w.type, rar: RARITIES[w.rarity], afx: w.afx.map(a => AFFIX_BY_ID[a]) })); return { ws, cards: G.wcState.map(c => ({ ...c })), LW, LH, active: p.active }; });
      const has = s => seen.some(t => t.indexOf(s) >= 0);
      chk(tag + ' weapons tab: both slots with name + rarity + base type', info.ws.every(w => has(w.name) && has(w.rar.name.toUpperCase()) && has('BASE: ' + w.type.toUpperCase())), { seen: seen.filter(t => /BASE|SLOT/.test(t)), names: info.ws.map(w => w.name) });
      chk(tag + ' weapons tab: all stats shown', ['Damage', 'Fire rate', 'DPS', 'Range', 'Pellets', 'Pierce', 'Crit'].every(has), seen.slice(0, 40));
      chk(tag + ' weapons tab: every affix with its description', info.ws.every(w => w.afx.every(a => has(a.name) && (has(a.desc) || a.desc.split(' ').slice(0, 3).every(wd => has(wd))))), info.ws.map(w => w.afx.map(a => a.name + ': ' + a.desc)));
      chk(tag + ' weapons tab: active slot highlighted (exactly one ACTIVE), other offers equip', info.cards.length === 2 && info.cards.filter(c => c.active).length === 1 && info.cards.find(c => c.active).slot === info.active && has('ACTIVE') && has('TAP TO EQUIP'), info.cards);
      chk(tag + ' weapons tab: cards fully on screen, readable', info.cards.every(c => c.x >= 0 && c.y >= 0 && c.x + c.w <= info.LW && c.y + c.h <= info.LH && c.scale > 0.6), info.cards);
      await pg.screenshot({ path: OUT + `/23-pause-weapons-${tag}.png` });
      const eq = await tapHot(pg, /^equip1$/); chk(tag + ' tapping the other weapon card equips it (touch target >= 44px)', eq && eq.h >= 44 && (await pg.evaluate(() => G.player.active)) === 1, eq);
      const info2 = await pg.evaluate(() => { TDR.render(); return G.wcState.map(c => ({ slot: c.slot, active: c.active })); }); chk(tag + ' highlight follows the equipped slot', info2.find(c => c.active).slot === 1, info2);
      // empty second slot renders gracefully
      const t2 = await texts(pg, "G.player.slots[1] = null; G.player.active = 0;"); chk(tag + ' empty slot shown', t2.some(t => /EMPTY/.test(t)));
      // perks tab with scrolling
      await tapHot(pg, /^PERKS$/); const pt = await texts(pg, ''); const pinfo = await pg.evaluate(() => ({ tab: G.pauseTab, max: G.scrollMax, n: Object.keys(G.perkCount).length }));
      chk(tag + ' perks tab lists current perks (epic first) and is scrollable', pinfo.tab === 2 && pt.some(t => /Glass Cannon/.test(t)) && pt.some(t => /Second Wind/.test(t)) && pinfo.max > 20, { pinfo, sample: pt.slice(0, 10) });
      const sc = await pg.evaluate(() => ({ cx: offX + LW / 2 * scale, y0: offY + (LH * 0.6) * scale, y1: offY + (LH * 0.35) * scale }));
      await pg.bringToFront(); const touch = await pg.touchscreen.touchStart(sc.cx, sc.y0); await touch.move(sc.cx, (sc.y0 + sc.y1) / 2); await touch.move(sc.cx, sc.y1); await touch.end(); await sleep(80);
      const sy = await pg.evaluate(() => G.scrollY); chk(tag + ' perks tab: touch-drag scrolls the list', sy > 20, sy);
      let pt2 = []; for (let y = 0; y <= 560; y += 40) pt2 = pt2.concat(await texts(pg, 'G.scrollY = Math.min(G.scrollMax, ' + y + ');')); chk(tag + ' perks tab: scrolling reveals every perk incl. stacked ones (Heavy Rounds ×2)', pt2.some(t => /Heavy Rounds/.test(t) && /×2/.test(t)) && pt2.some(t => /Swift Boots/.test(t)) && pt2.some(t => /Bossbane/.test(t)), pt2.filter(t => /×|Rounds|Boots/.test(t)));
      await pg.evaluate(() => TDR.render()); await pg.screenshot({ path: OUT + `/24-pause-perks-${tag}.png` });
      await tapHot(pg, /^MENU$/); await tapHot(pg, /^RESUME$/); chk(tag + ' RESUME returns to play', (await pg.evaluate(() => TDR.state)) === 'play');
    };
    await pauseSuite(gp, 'portrait');
    chk('no console errors (portrait zones/rooms/bosses/perks/pause)', gp.errs.length === 0 && np.errs.length === 0, { g: gp.errs, n: np.errs });
    await gp.close(); await np.close();

    // ----- landscape: same UI flows (perk screen, shop, risk, pause weapons, victory + loop)
    const lg = await mk(844, 390, true), lgS = await lg.evaluate(() => ({ land })); chk('landscape page', lgS.land);
    await pauseSuite(lg, 'landscape');
    r = await lg.evaluate(() => { TDR.newRun('glitch'); TDR.offerPerks({}); TDR.render(); return TDR.hot().map(h => ({ l: h.label, ok: h.x >= 0 && h.y >= 0 && h.x + h.w <= LW && h.y + h.h <= LH })); });
    chk('landscape perk UI: 4 cards (Glitch) + 3 buttons on screen', r.filter(h => /^perk\d$/.test(h.l)).length === 4 && r.some(h => /^REROLL/.test(h.l)) && r.every(h => h.ok), r);
    await tapHot(lg, /^SKIP/); chk('landscape: SKIP works', (await lg.evaluate(() => TDR.state)) === 'play');
    await lg.evaluate(() => { TDR.newRun('runner'); G.credits = 400; TDR.startRoom(2, 'shop'); G.player.x = G.shop.x; G.player.y = G.shop.y; TDR.update(1 / 60); TDR.render(); });
    r = await lg.evaluate(() => TDR.hot().map(h => ({ l: h.label, ok: h.x >= 0 && h.y >= 0 && h.x + h.w <= LW && h.y + h.h <= LH, h: h.h * scale })));
    chk('landscape shop UI on screen with touch-sized rows', r.every(h => h.ok) && r.filter(h => /^offer/.test(h.l)).length >= 4 && r.find(h => h.l === 'LEAVE'), r);
    await shot(lg, OUT + '/25-shop-landscape.png');
    await tapHot(lg, /^LEAVE$/);
    await lg.evaluate(() => { TDR.startRoom(3, 'risk'); G.player.x = G.risk.x; G.player.y = G.risk.y; TDR.update(1 / 60); TDR.render(); });
    r = await lg.evaluate(() => ({ st: TDR.state, hot: TDR.hot().map(h => ({ l: h.label, ok: h.x >= 0 && h.y >= 0 && h.x + h.w <= LW && h.y + h.h <= LH })) })); chk('landscape risk UI', r.st === 'risk' && r.hot.filter(h => /^risk\d$/.test(h.l)).length === 3 && r.hot.every(h => h.ok), r);
    await shot(lg, OUT + '/26-risk-landscape.png'); await tapHot(lg, /^risk2$/);

    // ----- loop mode (landscape page): victory offers LOOP / END RUN, loop keeps equipment, scales enemies, HUD + best loop
    await lg.evaluate(() => { localStorage.removeItem('loot_lead_best_v1'); Object.assign(best, { runs: 0, wins: 0, bestRoom: 0, bestTime: 0, mostKills: 0, bestDmg: 0, bestLoop: 0, bestStage: 0 }); });
    const killRoot = () => lg.evaluate(() => { TDR.startRoom(14); const g = G, e = g.boss; e.spawnT = 0; TDR.dealDamage(e, e.max * 0.45, false); g.enemies.filter(x => x.type === 'node').forEach(n => { n.spawnT = 0; TDR.dealDamage(n, 1e9, false); }); for (let i = 0; i < 5; i++) TDR.update(1 / 60); TDR.dealDamage(e, e.max * 5, false); for (let i = 0; i < 60 * 4; i++) TDR.update(1 / 60); TDR.render(); return TDR.state; });
    await lg.evaluate(() => { TDR.newRun('overclock'); const g = G, p = g.player; p.slots[1] = TDR.genWeapon('launcher', 3); ['dmg', 'dmg', 'crit', 'maxhp'].forEach(id => { const pk = TDR.PERKS.find(x => x.id === id); pk.apply(g.P, g); g.perkCount[id] = (g.perkCount[id] || 0) + 1; g.perksTaken.push(id); }); g.credits = 123; g.rerolls = 5; window.__snap = { w0: p.slots[0].id, w1: p.slots[1].id, name1: p.slots[1].name, dmg: g.P.dmg, crit: g.P.crit, maxHp: g.P.maxHp, perks: g.perksTaken.length, credits: g.credits, cls: g.P.cls }; });
    chk('loop: ROOT kill -> victory screen', (await killRoot()) === 'win');
    r = await lg.evaluate(() => ({ hot: TDR.hot().map(h => ({ l: h.label, ok: h.x >= 0 && h.y >= 0 && h.x + h.w <= LW && h.y + h.h <= LH })), best: JSON.parse(localStorage.getItem('loot_lead_best_v1') || '{}') }));
    chk('victory offers LOOP (NEW GAME+) and END RUN / MAIN MENU, on screen; run not recorded yet', r.hot.some(h => h.l === 'LOOP (NEW GAME+)') && r.hot.some(h => h.l === 'END RUN / MAIN MENU') && r.hot.every(h => h.ok) && !(r.best.runs > 0), r);
    await shot(lg, OUT + '/27-win-landscape.png');
    await tapHot(lg, /^LOOP \(NEW GAME\+\)$/); await sleep(100);
    r = await lg.evaluate(() => { const g = G, p = g.player, s = window.__snap, seen = []; const ft = CanvasRenderingContext2D.prototype.fillText; CanvasRenderingContext2D.prototype.fillText = function (t) { seen.push(String(t)); return ft.apply(this, arguments); }; for (let i = 0; i < 5; i++) { TDR.update(1 / 60); } TDR.render(); CanvasRenderingContext2D.prototype.fillText = ft; const e = g.enemies[0];
      return { st: TDR.state, loop: g.loop, room: g.room, zone: g.zone, w0: p.slots[0].id === s.w0, w1: p.slots[1].id === s.w1, dmg: g.P.dmg === s.dmg && g.P.crit === s.crit && g.P.maxHp === s.maxHp, perks: g.perksTaken.length === s.perks, cls: g.P.cls === s.cls, credits: g.credits === s.credits, hp: p.hp === g.P.maxHp, hpMul: g.hpMul, bulMul: g.bulMul, eHp: e.max / ENEMY_TYPES[e.type].hp, luck: g.loopLuck, hud: seen.some(t => /LOOP 2/.test(t)), bestLoop: best.bestLoop, banner: g.banner && g.banner.sub2 }; });
    chk('loop: restarts at Zone 1 with the same weapons, perks, stats, credits', r.st === 'play' && r.loop === 2 && r.room === 1 && r.zone === 1 && r.w0 && r.w1 && r.dmg && r.perks && r.cls && r.credits && r.hp, r);
    chk('loop: enemy HP/damage scale modestly (+35% HP, +12% dmg) and drops improve; LOOP shown in HUD; best loop saved', Math.abs(r.eHp - 1.35) < 0.02 && Math.abs(r.bulMul - 1.12) < 0.001 && r.luck > 0 && r.hud && r.bestLoop === 2, r);
    await shot(lg, OUT + '/28-loop2-landscape.png');
    chk('loop 2: ROOT kill -> victory again', (await killRoot()) === 'win');
    await tapHot(lg, /^LOOP \(NEW GAME\+\)$/); await sleep(100);
    r = await lg.evaluate(() => ({ loop: G.loop, hpMul: G.hpMul, best: best.bestLoop, w: G.player.slots[1].id === window.__snap.w1 })); chk('loop 3 started, equipment kept, scaling grows', r.loop === 3 && Math.abs(r.hpMul - 1.7) < 0.01 && r.best === 3 && r.w, r);
    await killRoot(); await tapHot(lg, /^END RUN \/ MAIN MENU$/); await sleep(100);
    r = await lg.evaluate(() => ({ st: TDR.state, b: JSON.parse(localStorage.getItem('loot_lead_best_v1') || '{}') }));
    chk('END RUN / MAIN MENU records the run: wins = clears, best loop 3, fastest clear, returns to menu', r.st === 'menu' && r.b.runs === 1 && r.b.wins === 3 && r.b.bestLoop === 3 && r.b.bestStage >= 42 && r.b.bestTime > 0, r);
    r = await lg.evaluate(() => { TDR.render(); const seen = []; const ft = CanvasRenderingContext2D.prototype.fillText; CanvasRenderingContext2D.prototype.fillText = function (t) { seen.push(String(t)); return ft.apply(this, arguments); }; TDR.render(); CanvasRenderingContext2D.prototype.fillText = ft; return seen.filter(t => /loop|Loop|Best/i.test(t)); });
    chk('menu shows best loop', r.length > 0, r);
    // death inside a loop records the loop too
    r = await lg.evaluate(() => { localStorage.removeItem('loot_lead_best_v1'); Object.assign(best, { runs: 0, wins: 0, bestRoom: 0, bestTime: 0, mostKills: 0, bestDmg: 0, bestLoop: 0, bestStage: 0 }); TDR.newRun('runner'); G.loop = 4; G.room = 3; G.clears = 3; G.clearTimes = [300, 280, 310]; TDR.endRun(false); return best; });
    chk('dying in a loop records best loop + wins from earlier clears', r.bestLoop === 4 && r.wins === 3 && r.bestTime === 280, r);
    chk('no console errors (landscape)', lg.errs.length === 0, lg.errs);
    await lg.close();
  }

  // death path (no god)
  const p2 = await browser.newPage(); const e2 = [];
  p2.on('pageerror', e => e2.push(e.message)); p2.on('console', m => { if (m.type() === 'error') e2.push(m.text()); });
  await p2.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await p2.goto(APP, { waitUntil: 'load' }); await p2.evaluate(() => window.TDR.newRun());
  const d = await p2.evaluate(() => { const T = window.TDR; let n = 0; G.player.hp = 25; while (n++ < 60000 && T.state === 'play' || T.state === 'perk') { if (T.state === 'perk') T.takePerk(G.perkOffer[0]); T.update(1 / 60); if (G.doorOpen) { G.player.x = ARENA.x + ARENA.w / 2; G.player.y = ARENA.y + 8; } else if (n % 4 === 0) { const e = G.enemies.find(x => !x.dead); if (e) { const dd = Math.hypot(e.x - G.player.x, e.y - G.player.y) || 1; G.player.x += (e.x - G.player.x) / dd * 2; G.player.y += (e.y - G.player.y) / dd * 2; } } } const s1 = T.state; for (let i = 0; i < 100; i++) T.update(1 / 60); return { s1, s: T.state, room: T.G.room, best: T.best() }; });
  console.log('death run', JSON.stringify(d)); if (d.s !== 'over') fail++;
  await p2.screenshot({ path: OUT + '/10-gameover.png' });
  console.log('errors2:', e2); if (e2.length) fail++;
} finally { await browser.close(); srv.kill(); }
console.log(fail ? 'FAILED ' + fail : 'ALL OK'); process.exit(fail ? 1 : 0);
