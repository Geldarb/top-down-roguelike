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
    const T = window.TDR; const log = []; let perks = 0, weapons = new Set(), maxEn = 0, rooms = new Set(); const dirs = ['a', 'd', 'w', 's'];
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
        if (g.chests.length && !g.chests[0].open && steps % 5 === 0) { g.player.x = g.chests[0].x; g.player.y = g.chests[0].y + 5; }
        if (steps % 90 === 0) { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' })); window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' })); window.dispatchEvent(new KeyboardEvent('keydown', { key: '2' })); }
        // chase enemies so we actually fight
        if (g.enemies.length && steps % 3 === 0) { const e = g.enemies[0]; const d = Math.hypot(e.x - g.player.x, e.y - g.player.y); if (d > 120) { g.player.x += (e.x - g.player.x) / d * 3; g.player.y += (e.y - g.player.y) / d * 3; } }
      }
      T.update(1 / 60);
      if (steps % 400 === 0) T.render();
    }
    key(cur, false);
    return { state: T.state, steps, perks, weaponsOwned: [...weapons], seenDrops: [...seen].slice(0, 12), maxEn, rooms: [...rooms], kills: T.G.kills, time: T.G.time, best: T.best() };
  });
  console.log(JSON.stringify(res, null, 1));
  if (res.state !== 'win') fail++;
  await sleep(200);
  await page.screenshot({ path: OUT + '/09-end.png' });
  console.log('errors:', errs); if (errs.length) fail++;
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
