// Co-op smoke test: node test/coop.mjs  (starts server/index.js locally, drives 4 headless phone clients)
// COOP_URL=https://... runs the join/sync part against a live deployment instead (2 clients).
import { createRequire } from 'module';
import { spawn } from 'child_process';
import fs from 'fs';
const require = createRequire(import.meta.url);
const puppeteer = require(process.env.PUPPETEER_PATH || 'puppeteer-core');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(p => fs.existsSync(p));
const LIVE = process.env.COOP_URL, PORT = 8291, APP = LIVE || `http://localhost:${PORT}/`;
const N = LIVE ? 2 : 4;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const OUT = process.env.SHOTS || '/workspace/shots-tdr'; fs.mkdirSync(OUT, { recursive: true });
let srv = null;
if (!LIVE) {
  srv = spawn('node', ['server/index.js'], { cwd: new URL('..', import.meta.url).pathname, env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'inherit', 'inherit'] });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(APP + 'healthz')).ok) break; } catch {} await sleep(100); }
}
let fail = 0;
const ok = (n, c, x) => { console.log((c ? 'ok   ' : 'FAIL ') + n, c ? '' : JSON.stringify(x === undefined ? '' : x)); if (!c) fail++; };
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 300000,
  args: ['--no-sandbox', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const errs = [];
const views = [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 375, height: 667 }, { width: 740, height: 360 }];
const pages = [];
async function mkPage(i) {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(i + ' pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(i + ' console: ' + m.text()); });
  await p.setViewport({ ...views[i], deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  return p;
}
const tapEl = async (p, sel) => { await p.waitForSelector(sel, { visible: true, timeout: 90000 }); await p.tap(sel); };
const tapHot = async (p, re) => { const q = await p.evaluate(src => { const h = TDR.hot().find(h => new RegExp(src).test(h.label)); return h ? { x: offX + (h.x + h.w / 2) * scale, y: offY + (h.y + h.h / 2) * scale } : null; }, re.source); if (!q) return false; await p.touchscreen.tap(q.x, q.y); return true; };
const until = async (p, fn, arg, ms = 15000) => { const t0 = Date.now(); for (;;) { const v = await p.evaluate(fn, arg); if (v) return v; if (Date.now() - t0 > ms) return v; await sleep(100); } };
try {
  // ---------- host creates a room from the main menu
  const H = await mkPage(0); pages.push(H);
  await H.goto(APP, { waitUntil: 'load' }); await sleep(400);
  ok('menu has a CO-OP button', await tapHot(H, /^CO-OP/));
  await sleep(200);
  ok('co-op screen open', await H.evaluate(() => TDR.state === 'coop' && !document.getElementById('nvc').hidden));
  await H.evaluate(() => { document.getElementById('nvc-name').value = 'Hosty'; });
  await tapEl(H, '#nvc-create');
  const code = await until(H, () => COOP.NET.code, null, 90000);
  ok('room created with a 4-char code', /^[A-Z0-9]{4}$/.test(code || ''), code);
  await H.screenshot({ path: OUT + '/c01-host-lobby.png' });
  const link = await H.evaluate(() => COOP.inviteUrl());
  ok('share link contains ?room=CODE', link.includes('?room=' + code), link);
  // ---------- clients: invite link auto-join (and one manual code join)
  for (let i = 1; i < N; i++) {
    const p = await mkPage(i); pages.push(p);
    if (i === 3) {
      await p.goto(APP, { waitUntil: 'load' }); await sleep(300); await tapHot(p, /^CO-OP/); await sleep(150);
      await p.evaluate(c => { document.getElementById('nvc-name').value = 'Dee'; document.getElementById('nvc-code').value = c.toLowerCase(); }, code);
      await tapEl(p, '#nvc-join');
    } else await p.goto(link.replace(/^https?:\/\/[^/]+\//, APP), { waitUntil: 'load' });
    const j = await until(p, () => COOP.NET.code && COOP.NET.lobby && COOP.NET.role, null, 60000);
    ok('client ' + i + ' joined (' + (i === 3 ? 'code' : 'link') + ')', j === 'client', j);
    for (let k = 0; k < i; k++) await tapEl(p, '#nvc-next');           // different classes
    await sleep(150);
  }
  let lob = await until(H, n => COOP.NET.lobby && COOP.NET.lobby.players.length === n && COOP.NET.lobby.players, N);
  ok('host lobby lists ' + N + ' players', lob && lob.length === N, lob);
  ok('host start disabled until everyone is ready', await H.evaluate(() => document.getElementById('nvc-start').disabled));
  for (let i = 1; i < N; i++) await tapEl(pages[i], '#nvc-ready');
  lob = await until(H, () => COOP.NET.lobby.players.every(p => p.host || p.ready) && COOP.NET.lobby.players);
  ok('ready states + chosen classes shown', lob && lob.every(p => p.host || p.ready) && new Set(lob.map(p => p.cls)).size === N, lob);
  await sleep(200); await pages[1].screenshot({ path: OUT + '/c02-client-lobby-landscape.png' });
  await tapEl(H, '#nvc-start');
  for (let i = 0; i < N; i++) { const st = await until(pages[i], () => TDR.state === 'play' && G && G.coop && !G.waiting && TDR.state); ok('page ' + i + ' in run', st === 'play', st); }
  await sleep(1500);
  const hs = await H.evaluate(() => ({ seats: G.seats.length, cls: G.seats.map(s => s.d.C.id), en: G.enemies.length, mul: G.enemies.filter(e => e.type === 'chaser').map(e => e.max / (ENEMY_TYPES.chaser.hp * G.hpMul)) }));
  ok('host simulates ' + N + ' seats with their own classes', hs.seats === N && new Set(hs.cls).size === N, hs);
  ok('enemy HP scales with player count', hs.mul.length === 0 || hs.mul.every(m => Math.abs(m - (1 + 0.65 * (N - 1))) < 0.01), hs);
  const cs = await pages[1].evaluate(() => ({ en: G.enemies.length, views: Object.keys(G.views).length, room: G.room, floor: !!G.floor, snaps: COOP.NET.stats.snaps }));
  ok('client receives snapshots: enemies + teammates', cs.en > 0 && cs.views === N - 1 && cs.room === 1, cs);
  await pages[0].screenshot({ path: OUT + '/c03-host-play.png' }); await pages[1].screenshot({ path: OUT + '/c04-client-play-landscape.png' });
  // ---------- input sync: client 1 joystick drag moves its seat on the host
  const pidB = await pages[1].evaluate(() => COOP.NET.pid);
  const x0 = await H.evaluate(id => { const s = G.seats.find(s => s.id === id); return s.d.player.x; }, pidB);
  { const t = await pages[1].touchscreen.touchStart(200, 250); await t.move(260, 250); await sleep(900); await t.end(); }
  await sleep(400);
  const x1 = await H.evaluate(id => G.seats.find(s => s.id === id).d.player.x, pidB);
  ok('client joystick moves its player on the host (authoritative)', x1 > x0 + 15, { x0, x1 });
  const pr = await pages[1].evaluate(() => { const v = G.player; return { x: v.x, sx: null }; });
  const hx = await H.evaluate(id => { const s = G.seats.find(s => s.id === id); return s.d.player.x; }, pidB);
  const mapped = await pages[1].evaluate(hxv => { const A = G.map; return null; }, hx);
  // client dash button -> host seat dashes
  const db = await pages[1].evaluate(() => { const L = layout(); return { x: offX + L.dash.x * scale, y: offY + L.dash.y * scale }; });
  await pages[1].touchscreen.tap(db.x, db.y); await sleep(500);
  ok('client DASH reaches host', await H.evaluate(id => G.seats.find(s => s.id === id).d.player.dashCd > 0, pidB));
  const sb = await pages[1].evaluate(() => { const L = layout(); return { x: offX + L.skill.x * scale, y: offY + L.skill.y * scale }; });
  await pages[1].touchscreen.tap(sb.x, sb.y); await sleep(500);
  ok('client SKILL reaches host', await H.evaluate(id => G.seats.find(s => s.id === id).d.player.skillT > 0, pidB));
  // ---------- calm the room for the deterministic parts
  await H.evaluate(() => { G.enemies.length = 0; G.ebullets.length = 0; G.waves = []; G.waveIdx = 0; G.roomState = 'idle'; G.seats.forEach(s => { s.d.player.iframes = 0; }); });
  // shared-but-claimable weapon pickup by a client
  await H.evaluate(id => { const s = G.seats.find(s => s.id === id), p = s.d.player; G.items.push({ kind: 'weapon', w: TDR.genWeapon('sniper', 3), x: p.x + 3, y: p.y, t: 1, vx: 0, vy: 0 }); }, pidB);
  const nr = await until(pages[1], () => G.near && layout().pick && G.near.w.type);
  ok('client sees inspect card + PICK UP for a nearby weapon', nr === 'sniper', nr);
  const pk = await pages[1].evaluate(() => { const r = layout().pick; return { x: offX + (r.x + r.w / 2) * scale, y: offY + (r.y + r.h / 2) * scale }; });
  await pages[1].touchscreen.tap(pk.x, pk.y); await sleep(500);
  ok('client picks weapon into its own slot (host state)', await H.evaluate(id => { const p = G.seats.find(s => s.id === id).d.player; return p.slots[1] && p.slots[1].type === 'sniper'; }, pidB));
  ok('client HUD shows the new weapon', await until(pages[1], () => G.player.slots[1] && G.player.slots[1].type === 'sniper'));
  // ---------- downed + revive
  const pidC = await pages[2].evaluate(() => COOP.NET.pid);
  await H.evaluate(id => { const s = G.seats.find(s => s.id === id); COOP.withSeat(s, () => { G.player.iframes = 0; hurtPlayer(9999); }); }, pidC);
  ok('player goes down instead of ending the run', await H.evaluate(id => G.seats.find(s => s.id === id).d.player.downed && TDR.state === 'play', pidC));
  ok('downed state synced to that client', await until(pages[2], () => G.player.downed));
  await H.evaluate(id => { const c = G.seats.find(s => s.id === id).d.player, me = G.player; me.x = c.x + 12; me.y = c.y; }, pidC);
  await sleep(1500);
  const mid = await pages[1].evaluate(id => { const v = G.views[id]; return v && v.p.rv; }, pidC);
  ok('revive progress visible to other clients', mid > 0.15 && mid < 1, mid);
  await pages[1].screenshot({ path: OUT + '/c05-revive.png' });
  await sleep(2600);
  const rv = await H.evaluate(id => { const p = G.seats.find(s => s.id === id).d.player; return { downed: p.downed, hp: p.hp }; }, pidC);
  ok('teammate standing close for 3s revives', !rv.downed && rv.hp > 0, rv);
  // ---------- per-player perks: room clear -> each picks; door opens when all chose
  await H.evaluate(() => { G.roomState = 'fight'; G.waves = []; G.waveIdx = 0; });
  const offers = await until(pages[1], () => TDR.state === 'perk' && G.perkOffer && G.perkOffer.length, null, 8000);
  ok('room clear: client gets its own perk offer', offers >= 3, offers);
  await pages[1].screenshot({ path: OUT + '/c06-client-perk.png' });
  ok('door stays shut while players choose', await H.evaluate(() => !G.doorOpen && G.perkDone));
  for (let i = 1; i < N; i++) { await until(pages[i], () => TDR.state === 'perk' && G.perkOffer); await tapHot(pages[i], /^perk0$/); }
  await sleep(500);
  ok('door still shut until host picks too', await H.evaluate(() => !G.doorOpen));
  await H.evaluate(() => TDR.pickOffer(0)); await sleep(300);
  const pt = await H.evaluate(() => ({ door: G.doorOpen, taken: G.seats.map(s => (s === G.curSeat ? G.perksTaken : s.d.perksTaken).length) }));
  ok('everyone took a perk into their own build; door opens', pt.door && pt.taken.every(n => n === 1), pt);
  // ---------- pause in co-op does not pause the run; host can pause all
  await pages[1].evaluate(() => { TDR.state = 'pause'; });
  const t0 = await H.evaluate(() => G.time); await sleep(600); const t1 = await H.evaluate(() => G.time);
  ok('client pause menu does not pause the game', t1 > t0 + 0.3, { t0, t1 });
  ok('client stays in its pause menu', await pages[1].evaluate(() => TDR.state === 'pause'));
  await pages[1].evaluate(() => { TDR.state = 'play'; });
  await H.evaluate(() => { TDR.state = 'pause'; }); await sleep(100);
  ok('host pause menu has PAUSE ALL', await tapHot(H, /^PAUSE ALL/));
  await sleep(400); const p0 = await H.evaluate(() => G.time); await sleep(500); const p1 = await H.evaluate(() => G.time);
  ok('host PAUSE ALL freezes the run', p1 === p0 && await pages[1].evaluate(() => G.paused), { p0, p1 });
  await tapHot(H, /^RESUME FOR ALL/); await H.evaluate(() => { TDR.state = 'play'; });
  // ---------- next room through the door (any player)
  await H.evaluate(id => { const p = G.seats.find(s => s.id === id).d.player; p.x = ARENA.x + ARENA.w / 2; p.y = ARENA.y + 10; }, pidB);
  const room2 = await until(pages[1], () => G.room === 2 && G.room);
  ok('a player walking through the door moves everyone to room 2', room2 === 2, room2);
  // ---------- disconnect + reconnect within the grace window
  if (N >= 4) {
    const pidD = await pages[3].evaluate(() => COOP.NET.pid);
    await pages[3].evaluate(() => COOP.NET.ws.close());
    const off = await until(H, id => G.seats.find(s => s.id === id).off, pidD, 5000);
    ok('dropped player is marked offline on the host', off === true, off);
    const back = await until(H, id => !G.seats.find(s => s.id === id).off, pidD, 20000);
    const cl = await until(pages[3], () => !COOP.NET.reconnecting && G && G.coop && TDR.state !== 'coop');
    ok('client reconnects within the grace window and resumes', back && cl, { back, cl });
  }
  // ---------- loop mode in co-op
  await H.evaluate(() => { G.enemies.length = 0; TDR.winRoot(); });
  ok('win screen on clients', await until(pages[1], () => TDR.state === 'win'));
  await pages[1].screenshot({ path: OUT + '/c07-client-win.png' });
  await H.evaluate(() => TDR.startLoop());
  const lp = await until(pages[1], () => G.loop === 2 && TDR.state === 'play' && G.room === 1 && G.loop);
  ok('loop (New Game+) restarts everyone at zone 1, loop 2', lp === 2, lp);
  ok('loop keeps the client\'s weapons', await pages[1].evaluate(() => G.player.slots[1] && G.player.slots[1].type === 'sniper'));
  // ---------- all players down -> run over for everyone
  await H.evaluate(() => { G.seats.forEach(s => COOP.withSeat(s, () => { G.player.iframes = 0; G.P.revive = 0; hurtPlayer(9999); })); });
  const ov = await until(pages[1], () => TDR.state === 'over', null, 8000);
  ok('run ends for all when everyone is down', ov && await H.evaluate(() => TDR.state === 'over'));
  await pages[1].screenshot({ path: OUT + '/c08-client-over.png' });
  const bw = await pages[1].evaluate(() => Math.round(COOP.NET.stats.bytes / Math.max(1, COOP.NET.stats.snaps)));
  console.log('avg snapshot size (bytes, before ws compression):', bw);
  // ---------- back to lobby, then host leaves -> clients get a clear message
  await tapHot(H, /^BACK TO LOBBY/);
  ok('clients return to the lobby', await until(pages[1], () => TDR.state === 'coop' && !document.getElementById('nvc-room').hidden));
  await H.close();
  const msg = await until(pages[1], () => TDR.state === 'coop' && document.getElementById('nvc-msg').textContent, null, 8000);
  ok('host leaving shows a clear message to clients', /host/i.test(msg || ''), msg);
} catch (e) { console.log('EXCEPTION', e); fail++; }
console.log('errors:', errs); if (errs.length) fail++;
await browser.close(); if (srv) srv.kill();
console.log(fail ? 'FAILED ' + fail : 'ALL OK'); process.exit(fail ? 1 : 0);
