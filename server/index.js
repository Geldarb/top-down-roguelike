'use strict';
// Neon Vault co-op server: serves the static game and relays a host-authoritative co-op session.
// The host's browser simulates the run; clients send inputs, the host broadcasts state snapshots.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = +process.env.PORT || 8080;
const ROOT = path.resolve(__dirname, '..');
const MAX_PLAYERS = 4, DROP_GRACE_MS = 30000, CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon' };
const PUBLIC = /^\/(index\.html|js\/[\w.-]+\.js|README\.md)?$/;

const rooms = new Map();
const started = Date.now();

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/healthz') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, rooms: rooms.size, up: Math.round((Date.now() - started) / 1000) })); return; }
  if (!PUBLIC.test(url.pathname)) { res.writeHead(404); res.end('not found'); return; }
  const file = path.join(ROOT, url.pathname === '/' ? 'index.html' : url.pathname);
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(buf);
  });
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 512 * 1024, perMessageDeflate: { threshold: 1024, zlibDeflateOptions: { level: 3 } } });

function newCode() { for (;;) { let c = ''; for (let i = 0; i < 4; i++) c += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]; if (!rooms.has(c)) return c; } }
const clean = (s, n) => String(s || '').replace(/[^\w \-.!?]/g, '').trim().slice(0, n);
function send(ws, obj) { if (ws && ws.readyState === 1) ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj)); }
function lobbyMsg(room) { return { t: 'lobby', code: room.code, state: room.state, players: room.players.map(p => ({ pid: p.pid, name: p.name, cls: p.cls, ready: p.ready, host: p === room.players[0], off: !p.ws })) }; }
function broadcastLobby(room) { const m = JSON.stringify(lobbyMsg(room)); room.players.forEach(p => send(p.ws, m)); }
function closeRoom(room, reason) {
  room.players.forEach(p => { clearTimeout(p.dropT); if (p.ws && p !== room.players[0]) { send(p.ws, { t: 'hostLeft', msg: reason }); p.ws.room = null; } });
  rooms.delete(room.code);
}
function joinedMsg(room, p, rejoin) {
  return { t: 'joined', code: room.code, pid: p.pid, token: p.token, host: p === room.players[0], rejoin: !!rejoin, state: room.state, seats: room.seats || null, lobby: lobbyMsg(room) };
}
function bind(ws, room, p) { ws.room = room; ws.player = p; p.ws = p.ws && p.ws !== ws ? (p.ws.terminate(), ws) : ws; }

function removePlayer(room, p) {
  const i = room.players.indexOf(p); if (i < 0) return;
  clearTimeout(p.dropT);
  if (i === 0) { closeRoom(room, 'The host left the room'); return; }
  room.players.splice(i, 1);
  if (room.state === 'game') send(room.players[0].ws, { t: 'leave', pid: p.pid });
  broadcastLobby(room);
}

wss.on('connection', ws => {
  ws.alive = true; ws.on('pong', () => { ws.alive = true; });
  ws.on('message', (data, isBinary) => {
    if (isBinary) return;
    const raw = data.toString();
    const room = ws.room, me = ws.player;
    // hot path: host snapshots are relayed unparsed to every connected client
    if (raw.startsWith('{"t":"snap"')) {
      if (!room || room.players[0] !== me) return;
      for (let i = 1; i < room.players.length; i++) { const c = room.players[i].ws; if (c && c.readyState === 1 && c.bufferedAmount < 384 * 1024) c.send(raw); }
      return;
    }
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;
    switch (m.t) {
      case 'ping': send(ws, { t: 'pong', c: m.c }); return;
      case 'create': {
        if (room) return;
        const code = newCode();
        const p = { pid: crypto.randomBytes(4).toString('hex'), token: crypto.randomBytes(12).toString('hex'), name: clean(m.name, 12) || 'Player', cls: clean(m.cls, 12) || 'runner', ready: true, ws: null };
        const r = { code, state: 'lobby', players: [p], seats: null, created: Date.now() };
        rooms.set(code, r); bind(ws, r, p);
        send(ws, joinedMsg(r, p)); return;
      }
      case 'join': {
        if (room) return;
        const r = rooms.get(String(m.code || '').toUpperCase().trim());
        if (!r) { send(ws, { t: 'err', msg: 'Room not found' }); return; }
        const old = m.token && r.players.find(p => p.token === m.token);
        if (old) {                                    // reconnect within the grace window
          clearTimeout(old.dropT); bind(ws, r, old);
          send(ws, joinedMsg(r, old, r.state === 'game'));
          if (r.state === 'game' && old !== r.players[0]) send(r.players[0].ws, { t: 'rejoin', pid: old.pid });
          broadcastLobby(r); return;
        }
        if (r.state !== 'lobby') { send(ws, { t: 'err', msg: 'That run has already started' }); return; }
        if (r.players.length >= MAX_PLAYERS) { send(ws, { t: 'err', msg: 'Room is full (4 players)' }); return; }
        const p = { pid: crypto.randomBytes(4).toString('hex'), token: crypto.randomBytes(12).toString('hex'), name: clean(m.name, 12) || 'Player', cls: clean(m.cls, 12) || 'runner', ready: false, ws: null };
        r.players.push(p); bind(ws, r, p);
        send(ws, joinedMsg(r, p)); broadcastLobby(r); return;
      }
      case 'set': {
        if (!room || room.state !== 'lobby') return;
        if (m.cls != null) me.cls = clean(m.cls, 12) || me.cls;
        if (m.name != null) me.name = clean(m.name, 12) || me.name;
        if (m.ready != null && me !== room.players[0]) me.ready = !!m.ready;
        broadcastLobby(room); return;
      }
      case 'start': {
        if (!room || room.players[0] !== me || room.state !== 'lobby') return;
        if (room.players.some(p => !p.ws)) room.players = room.players.filter(p => p.ws);
        if (room.players.some((p, i) => i > 0 && !p.ready)) { send(ws, { t: 'err', msg: 'Everyone must be ready' }); return; }
        room.state = 'game';
        room.seats = room.players.map(p => ({ pid: p.pid, name: p.name, cls: p.cls }));
        const msg = JSON.stringify({ t: 'start', seats: room.seats });
        room.players.forEach(p => send(p.ws, msg)); broadcastLobby(room); return;
      }
      case 'toLobby': {
        if (!room || room.players[0] !== me) return;
        room.state = 'lobby'; room.seats = null;
        room.players = room.players.filter(p => p.ws || p === me);
        room.players.forEach((p, i) => { p.ready = i === 0; send(p.ws, { t: 'toLobby' }); });
        broadcastLobby(room); return;
      }
      case 'kick': return;
      case 'leave': { if (room) { ws.room = null; removePlayer(room, me); } return; }
      case 'in': case 'cmd': {                        // client -> host input / commands
        if (!room || room.state !== 'game' || room.players[0] === me) return;
        m.from = me.pid; send(room.players[0].ws, m); return;
      }
    }
  });
  ws.on('close', () => {
    const room = ws.room, me = ws.player; if (!room || !me || me.ws !== ws) return;
    me.ws = null;
    if (room.players[0] === me) { closeRoom(room, 'The host disconnected'); return; }
    if (room.state === 'game') {
      send(room.players[0].ws, { t: 'drop', pid: me.pid });
      me.dropT = setTimeout(() => { if (!me.ws) removePlayer(room, me); }, DROP_GRACE_MS);
      broadcastLobby(room);
    } else removePlayer(room, me);
  });
});

setInterval(() => { wss.clients.forEach(ws => { if (!ws.alive) { ws.terminate(); return; } ws.alive = false; try { ws.ping(); } catch (e) { /* ignore */ } }); }, 10000);
setInterval(() => { const now = Date.now(); rooms.forEach(r => { if (!r.players.some(p => p.ws) && now - r.created > 60000) rooms.delete(r.code); }); }, 60000);

server.listen(PORT, () => console.log('Neon Vault co-op server on :' + PORT));
