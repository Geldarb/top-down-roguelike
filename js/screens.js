'use strict';
// =====================================================================
//  Overlay screens: perk offer, shop, risk altar, pause (menu / weapons / perks), end screens
// =====================================================================
const EDGE = 14;
function contentX() { return { l: SA.l + EDGE, r: LW - SA.r - EDGE, cx: SA.l + (LW - SA.l - SA.r) / 2, w: LW - SA.l - SA.r - EDGE * 2 }; }
function pill(x, y, w, h, text, col, size, filled) {
  rr(x, y, w, h, h / 2); ctx.fillStyle = filled ? hexA(col, 0.85) : hexA(col, 0.16); ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = col; ctx.stroke();
  fitTxt(text, x + w / 2, y + h / 2 + 0.5, w - 6, size || 10, filled ? '#05060f' : col, 'center', '800', !filled);
}
function btn(x, y, w, h, label, fn, color, size, enabled) {
  if (enabled === false) { rr(x, y, w, h, 10); ctx.fillStyle = 'rgba(30,34,50,0.7)'; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(120,130,160,0.5)'; ctx.stroke(); fitTxt(label, x + w / 2, y + h / 2 + 1, w - 8, size || 14, '#6d7690', 'center', '800'); hot.push({ x, y: y + hotOff, w, h, fn: () => {}, label: label + ' (off)' }); return; }
  button(x, y, w, h, label, fn, color, size);
}

// ---------------------------------------------------------------- perk offer
function drawPerkScreen() {
  overlay(0.82);
  const g = G, offer = g.perkOffer; if (!offer) return; const n = offer.length, X = contentX();
  const risk = g.perkMode === 'risk', head = risk ? 'RISK REWARD · FREE PERK' : g.cur && g.cur.boss ? 'BOSS DEFEATED' : 'ROOM CLEARED';
  const title = g.banishMode ? 'TAP A PERK TO BANISH IT' : 'CHOOSE A PERK';
  const card = (pk, i, x, y, w, h) => {
    hot.push({ x, y, w, h, fn: () => pickOffer(i), label: 'perk' + i });
    const T = TIERS[pk.tier], cnt = g.perkCount[pk.id] || 0;
    rr(x, y, w, h, 14); ctx.fillStyle = g.banishMode ? 'rgba(40,8,16,0.92)' : 'rgba(6,9,22,0.92)'; ctx.fill(); nstroke(g.banishMode ? '#ff3b6b' : pk.color, 1.8);
    return { T, cnt };
  };
  const tags = (pk, x, y, w, cnt) => {
    const T = TIERS[pk.tier]; let tx = x + w - 10;
    txt(T.name, tx, y + 11, 9, T.color, 'right', '800', false); tx -= ctx.measureText(T.name).width + 8;
    if (pk.cls) { txt('CLASS', tx, y + 11, 9, '#ff3df0', 'right', '800', false); tx -= 40; }
    if (pk.aff) { txt('AFFIX', tx, y + 11, 9, '#ffb347', 'right', '800', false); tx -= 38; }
    if (cnt) txt('owned x' + cnt, tx, y + 11, 9, '#8a93ab', 'right', '700', false);
  };
  const buttons = (y, w0, h0) => {
    const gap = 8, bw = (w0 - gap * 2) / 3, x0 = X.cx - w0 / 2;
    btn(x0, y, bw, h0, 'REROLL ×' + g.rerolls, () => rerollOffer(), '#19f0ff', 12.5, g.rerolls > 0);
    btn(x0 + bw + gap, y, bw, h0, g.banishMode ? 'CANCEL' : 'BANISH ×' + g.banishes, () => { if (g.banishMode) g.banishMode = false; else if (g.banishes > 0) g.banishMode = true; }, '#ff3b6b', 12.5, g.banishMode || g.banishes > 0);
    btn(x0 + (bw + gap) * 2, y, bw, h0, 'SKIP +40¢', () => skipOffer(), '#ffe81a', 12.5);
  };
  if (land) {
    txt(head, X.cx, SA.t + 22, 13, risk ? '#ff3b6b' : '#39ff6a', 'center', '800');
    txt(title, X.cx, SA.t + 46, 22, g.banishMode ? '#ff6a8a' : '#fff', 'center', '900');
    const gap = 10, cw = Math.min(230, (X.w - gap * (n - 1)) / n), ch = Math.min(190, LH - SA.t - SA.b - 150), y = SA.t + 66;
    const x0 = X.cx - (cw * n + gap * (n - 1)) / 2;
    offer.forEach((pk, i) => {
      const x = x0 + i * (cw + gap), c = card(pk, i, x, y, cw, ch); tags(pk, x, y, cw, c.cnt);
      glow(x + cw / 2, y + 50, 38, pk.color, 0.5);
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.arc(x + cw / 2, y + 50, 24, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(x + cw / 2, y + 50, 24, 0, TAU); nstroke(pk.color, 1.6);
      txt(pk.icon, x + cw / 2, y + 51, 24, pk.color, 'center', '800');
      fitTxt(pk.name, x + cw / 2, y + 92, cw - 14, 16, '#fff', 'center', '800');
      wrapLines(pk.desc, cw - 18, 11.5, '600').forEach((l, k) => txt(l, x + cw / 2, y + 114 + k * 14, 11.5, pk.color, 'center', '600', false));
      txt(String(i + 1), x + 10, y + 11, 9, '#8a93ab', 'left', '700', false);
    });
    buttons(y + ch + 12, Math.min(X.w, 520), 36);
    return;
  }
  txt(head, LW / 2, 52 + SA.t, 14, risk ? '#ff3b6b' : '#39ff6a', 'center', '800');
  txt(title, LW / 2, 78 + SA.t, g.banishMode ? 19 : 25, g.banishMode ? '#ff6a8a' : '#fff', 'center', '900');
  const gap = 8, y0 = 102 + SA.t, by = LH - SA.b - 50, h = Math.min(104, (by - 10 - y0 - gap * (n - 1)) / n);
  offer.forEach((pk, i) => {
    const x = 16 + SA.l, w = LW - 32 - SA.l - SA.r, y = y0 + i * (h + gap), c = card(pk, i, x, y, w, h); tags(pk, x, y, w, c.cnt);
    glow(x + 44, y + h / 2, 34, pk.color, 0.5); const rad = Math.min(24, h * 0.3);
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.arc(x + 44, y + h / 2, rad, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(x + 44, y + h / 2, rad, 0, TAU); nstroke(pk.color, 1.6);
    txt(pk.icon, x + 44, y + h / 2 + 1, rad * 0.95, pk.color, 'center', '800');
    fitTxt(pk.name, x + 82, y + h / 2 - 12, w - 100, 18, '#fff', 'left', '800');
    const ls = wrapLines(pk.desc, w - 100, 12.5, '600'); ls.slice(0, 2).forEach((l, k) => txt(l, x + 82, y + h / 2 + 8 + k * 14, 12.5, pk.color, 'left', '600', false));
    txt(String(i + 1), x + 10, y + 11, 9, '#8a93ab', 'left', '700', false);
  });
  buttons(by, LW - 32 - SA.l - SA.r, 42);
}

// ---------------------------------------------------------------- shop terminal + risk altar (rows)
function rowsLayout(n, top, bottom, maxH) { const gap = 7, h = Math.min(maxH, (bottom - top - gap * (n - 1)) / n); return { gap, h }; }
function drawShop() {
  overlay(0.84);
  const g = G, s = g.shop; if (!s) return; const X = contentX(), W = Math.min(X.w, 560), x = X.cx - W / 2;
  txt('SHOP TERMINAL', X.cx, SA.t + (land ? 20 : 44), land ? 17 : 22, '#39ff6a', 'center', '900');
  rr(X.cx - 52, SA.t + (land ? 34 : 60), 104, 22, 11); ctx.fillStyle = 'rgba(40,36,4,0.9)'; ctx.fill(); nstroke('#ffe81a', 1.2, 0.8); txt('¢ ' + g.credits, X.cx, SA.t + (land ? 45 : 71), 14, '#ffe81a', 'center', '900', false);
  const top = SA.t + (land ? 64 : 92), bottom = LH - SA.b - (land ? 48 : 62), L = rowsLayout(s.offers.length, top, bottom, 80);
  const act = g.player.slots[g.player.active];
  s.offers.forEach((o, i) => {
    const y = top + i * (L.h + L.gap), can = !o.sold && g.credits >= o.price;
    hot.push({ x, y: y + hotOff, w: W, h: L.h, fn: () => buyOffer(i), label: 'offer' + i });
    let col = '#39ff6a', name = '', l2 = '', l3 = '', l2c = '#aebbd8';
    if (o.kind === 'weapon') { const R = RARITIES[o.w.rarity]; col = R.color; name = o.w.name; const d = Math.round(weaponDps(o.w) - (act ? weaponDps(act) : 0)); l2 = R.name + ' ' + WEAPON_TYPES[o.w.type].name + ' · DPS ' + Math.round(weaponDps(o.w)) + (act ? (d >= 0 ? '  ▲+' + d : '  ▼' + d) + ' vs equipped' : ''); l2c = d >= 0 ? '#9dffb0' : '#ff9aa8'; l3 = o.w.afx.map(a => AFFIX_BY_ID[a].name).join(' · ') || 'No affixes'; }
    else if (o.kind === 'perk') { col = o.perk.color; name = o.perk.name + '  (' + TIERS[o.perk.tier].name + ')'; l2 = o.perk.desc; l2c = col; }
    else { col = o.kind === 'heal' ? '#6bff8a' : '#19f0ff'; name = o.name; l2 = o.desc; l2c = col; }
    rr(x, y, W, L.h, 12); ctx.fillStyle = o.sold ? 'rgba(14,16,26,0.8)' : 'rgba(6,9,22,0.92)'; ctx.fill();
    if (can) nstroke(col, 1.6); else { ctx.lineWidth = 1.2; ctx.strokeStyle = hexA(col, 0.4); ctx.stroke(); }
    ctx.globalAlpha = o.sold ? 0.4 : 1;
    if (o.kind === 'weapon') drawGun(o.w.type, x + 14, y + L.h / 2, 0, 1.15, col); else { ctx.beginPath(); ctx.arc(x + 26, y + L.h / 2, 14, 0, TAU); nstroke(col, 1.4); txt(o.kind === 'perk' ? o.perk.icon : o.kind === 'heal' ? '+' : o.kind === 'reroll' ? '⚀' : '⌫', x + 26, y + L.h / 2 + 1, 16, col, 'center', '800', false); }
    fitTxt(name, x + 58, y + L.h * (l3 ? 0.27 : 0.33), W - 150, 14, o.kind === 'weapon' ? col : '#fff', 'left', '800');
    fitTxt(l2, x + 58, y + L.h * (l3 ? 0.55 : 0.7), W - 150, 10.5, l2c, 'left', '600');
    if (l3) fitTxt(l3, x + 58, y + L.h * 0.82, W - 150, 10, '#b9c2d6', 'left', '600');
    ctx.globalAlpha = 1;
    const bx = x + W - 84, bh = Math.min(34, L.h - 12), by = y + (L.h - bh) / 2;
    rr(bx, by, 74, bh, 9); ctx.fillStyle = o.sold ? 'rgba(40,40,50,0.8)' : can ? 'rgba(255,232,26,0.2)' : 'rgba(60,20,30,0.6)'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = o.sold ? '#555' : can ? '#ffe81a' : '#ff6a8a'; ctx.stroke();
    fitTxt(o.sold ? 'SOLD' : '¢ ' + o.price, bx + 37, by + bh / 2 + 1, 66, 13, o.sold ? '#777' : can ? '#ffe81a' : '#ff8a9a', 'center', '900');
    txt(String(i + 1), x + W - 10, y + 10, 8, '#6f7890', 'center', '700', false);
  });
  btn(X.cx - 90, LH - SA.b - (land ? 42 : 52), 180, land ? 34 : 42, 'LEAVE', () => leaveShop(), '#7b8cff', 15);
  if (s.offers.some(o => o.kind === 'weapon' && o.sold)) txt('Bought weapons drop by the terminal: stand near one to pick it up', X.cx, LH - SA.b - (land ? 54 : 66), 10, '#8a93ab', 'center', '600', false);
}
function drawRisk() {
  overlay(0.84);
  const g = G, r = g.risk; if (!r) return; const X = contentX(), W = Math.min(X.w, 540), x = X.cx - W / 2;
  txt('RISK ROOM', X.cx, SA.t + (land ? 22 : 50), land ? 19 : 26, '#ff3b6b', 'center', '900');
  wrapLines('Take power now. Your NEXT room is HARDENED: +35% enemy HP, +20% damage (+50% credits).', W, 11.5, '600').slice(0, 2).forEach((l, k) => txt(l, X.cx, SA.t + (land ? 40 : 74) + k * 14, 11.5, '#cfd6e6', 'center', '600', false));
  const opts = [
    { t: 'CURSED ARMS', d: 'A powerful epic / legendary weapon with the Cursed affix (+60% damage, you take +35% more).', c: '#ff3b6b', icon: '☠', fn: () => riskChoose(0) },
    { t: 'FREE PERK', d: 'Choose any perk of rare tier or better, free of charge.', c: '#ffb800', icon: '★', fn: () => riskChoose(1) },
    { t: 'WALK AWAY', d: 'No reward, no penalty.', c: '#7b8cff', icon: '→', fn: () => riskChoose(2) }
  ];
  const top = SA.t + (land ? 66 : 108), bottom = LH - SA.b - 14, L = rowsLayout(3, top, bottom, land ? 84 : 120);
  opts.forEach((o, i) => {
    const y = top + i * (L.h + L.gap);
    hot.push({ x, y: y + hotOff, w: W, h: L.h, fn: o.fn, label: 'risk' + i });
    rr(x, y, W, L.h, 14); ctx.fillStyle = 'rgba(6,9,22,0.92)'; ctx.fill(); nstroke(o.c, 1.8);
    glow(x + 40, y + L.h / 2, 32, o.c, 0.4); ctx.beginPath(); ctx.arc(x + 40, y + L.h / 2, 22, 0, TAU); nstroke(o.c, 1.5); txt(o.icon, x + 40, y + L.h / 2 + 1, 22, o.c, 'center', '800', false);
    txt(o.t, x + 76, y + L.h * 0.28, 16, '#fff', 'left', '900');
    wrapLines(o.d, W - 96, 11.5, '600').slice(0, 3).forEach((l, k) => txt(l, x + 76, y + L.h * 0.28 + 20 + k * 14, 11.5, '#aebbd8', 'left', '600', false));
    txt(String(i + 1), x + W - 12, y + 11, 9, '#8a93ab', 'center', '700', false);
  });
}

// ---------------------------------------------------------------- weapon card (pause > weapons)
function wcard(w, Wv, draw, ox, oy) {
  const g = G, P = g.P, B = WEAPON_TYPES[w.type], R = RARITIES[w.rarity], pad = 12; let y = 0;
  const T = (s, x, yy, sz, c, al, wt) => { if (draw) txt(s, ox + x, oy + yy, sz, c, al, wt, false); };
  y += 14; T('BASE: ' + B.name.toUpperCase() + '  ·  ' + R.name.toUpperCase(), pad, y, 10.5, R.color, 'left', '800'); y += 12;
  const crit = Math.round(P.crit * 100);
  const stats = [
    ['Damage', Math.round(w.dmg) + (w.pellets > 1 ? ' ×' + w.pellets : '')], ['Fire rate', w.rate.toFixed(1) + '/s'],
    ['DPS', String(Math.round(weaponDps(w)))], ['Range', String(Math.round(weaponRange(w)))],
    ['Pellets', String(w.pellets)], ['Pierce', String(B.pierce + (w.fx.piercing ? 2 + P.pierceAff : 0) + P.pierce)],
    ['Crit', crit + '% ×' + P.critDmg.toFixed(2)], [B.boom ? 'Blast' : 'Speed', B.boom ? Math.round(B.boom * (w.dmg / (B.dmg || 1))) + ' dmg' : String(Math.round(B.speed))]
  ];
  const colW = (Wv - pad * 2) / 2;
  for (let r = 0; r < 4; r++) {
    y += 15;
    for (let c = 0; c < 2; c++) { const s = stats[r * 2 + c], x = pad + c * colW; T(s[0], x, y, 10.5, '#8f98ad', 'left', '600'); T(s[1], x + colW - 10, y, 11.5, '#fff', 'right', '800'); }
  }
  y += 12; if (draw) { ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(ox + pad, oy + y, Wv - pad * 2, 1); }
  y += 13; T(w.afx.length ? 'AFFIXES (' + w.afx.length + ')' : 'AFFIXES', pad, y, 9.5, '#9aa4bd', 'left', '800');
  if (!w.afx.length) { y += 14; T('None. Higher rarity weapons roll more affixes.', pad, y, 10.5, '#8a93ab', 'left', '600'); }
  w.afx.forEach(a => {
    const A = AFFIX_BY_ID[a]; y += 14;
    T('◆ ' + A.name, pad, y, 11.5, '#ffd27a', 'left', '800');
    ctx.font = '800 11.5px ' + FONT; const nw = ctx.measureText('◆ ' + A.name).width + 8;
    ctx.font = '600 10.5px ' + FONT; const dw = ctx.measureText(A.desc).width, free = Wv - pad * 2 - nw;
    if (dw <= free) { if (draw) txt(A.desc, ox + pad + nw, oy + y, 10.5, '#b9c2d6', 'left', '600', false); }
    else { const ls = wrapLines(A.desc, Wv - pad * 2 - 12, 10.5, '600'); ls.forEach(l => { y += 12; if (draw) txt(l, ox + pad + 12, oy + y, 10.5, '#b9c2d6', 'left', '600', false); }); }
  });
  weaponCombos(w).forEach(c => { y += 13; T('★ ' + c, pad, y, 10.5, '#ffd27a', 'left', '700'); });
  if (w.fx.cursed) { y += 13; T('You take +35% damage while this is equipped', pad, y, 10, '#ff6a8a', 'left', '700'); }
  return y + 10;
}
function drawWeaponCard(w, i, x, y, W, H, active) {
  const R = RARITIES[w.rarity];
  rr(x, y, W, H, 14); ctx.fillStyle = active ? 'rgba(18,26,52,0.95)' : 'rgba(6,9,22,0.92)'; ctx.fill();
  if (active) { glow(x + W / 2, y + H / 2, Math.max(W, H) * 0.6, R.color, 0.18); nstroke(R.color, 3); } else { ctx.lineWidth = 1.5; ctx.strokeStyle = hexA(R.color, 0.55); ctx.stroke(); }
  if (!active) hot.push({ x, y: y + hotOff, w: W, h: H, fn: () => { const p = G.player; p.active = i; p.cd = 0.12; sfx('swap', 700, 0.06, 'triangle', 0.04); }, label: 'equip' + i });
  // header (not scaled)
  const hh = 40;
  fitTxt(w.name, x + 12, y + 17, W - 130, 16, R.color, 'left', '900');
  txt('SLOT ' + (i + 1), x + 12, y + 33, 9.5, '#8f98ad', 'left', '800', false);
  if (active) pill(x + W - 84, y + 8, 74, 18, '● ACTIVE', R.color, 10, true); else pill(x + W - 96, y + 8, 86, 18, 'TAP TO EQUIP', '#8fa0d8', 9.5, false);
  drawGun(w.type, x + W - 70, y + 36, -0.1, 1.15, R.color);
  const need = wcard(w, W, false, 0, 0), avail = H - hh - 4, k = Math.min(1, avail / need);
  ctx.save(); ctx.translate(x, y + hh); ctx.scale(k, k);
  wcard(w, W / k, true, 0, 0);
  ctx.restore();
  G.wcState.push({ slot: i, active, x, y, w: W, h: H, scale: k, name: w.name, afx: w.afx.slice() });
}
function drawWeaponsTab(x, y, W, H) {
  const p = G.player; G.wcState = [];
  const slots = [0, 1].map(i => ({ i, w: p.slots[i] }));
  const gap = 10;
  if (land) {
    const cw = (W - gap) / 2;
    slots.forEach((s, k) => { const cx0 = x + k * (cw + gap); if (s.w) drawWeaponCard(s.w, s.i, cx0, y, cw, H, p.active === s.i); else emptySlot(s.i, cx0, y, cw, H); });
  } else {
    const need = slots.map(s => (s.w ? wcard(s.w, W, false, 0, 0) : 60) + 46), tot = need[0] + need[1], avail = H - gap;
    const hs = tot <= avail ? [need[0] + (avail - tot) / 2, need[1] + (avail - tot) / 2] : [avail * need[0] / tot, avail * need[1] / tot];
    let cy0 = y;
    slots.forEach((s, k) => { if (s.w) drawWeaponCard(s.w, s.i, x, cy0, W, hs[k], p.active === s.i); else emptySlot(s.i, x, cy0, W, hs[k]); cy0 += hs[k] + gap; });
  }
}
function emptySlot(i, x, y, W, H) { rr(x, y, W, H, 14); ctx.fillStyle = 'rgba(6,9,22,0.7)'; ctx.fill(); ctx.setLineDash([5, 5]); ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(140,150,180,0.5)'; ctx.stroke(); ctx.setLineDash([]); txt('SLOT ' + (i + 1) + ' · EMPTY', x + W / 2, y + H / 2, 13, '#7d869c', 'center', '700'); }

// ---------------------------------------------------------------- perks tab (scrollable)
function drawPerksTab(x, y, W, H) {
  const g = G, P = g.P, ids = Object.keys(g.perkCount).filter(k => g.perkCount[k] > 0);
  const order = { epic: 0, rare: 1, common: 2 };
  ids.sort((a, b) => order[PERK_BY_ID[a].tier] - order[PERK_BY_ID[b].tier] || PERK_BY_ID[a].name.localeCompare(PERK_BY_ID[b].name));
  const rowH = 40, statsH = 44, total = statsH + Math.max(1, ids.length) * rowH + 6;
  g.scrollMax = Math.max(0, total - H); g.scrollY = clamp(g.scrollY, 0, g.scrollMax);
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, W, H); ctx.clip(); ctx.translate(0, -g.scrollY);
  rr(x, y, W, statsH - 6, 10); ctx.fillStyle = 'rgba(6,9,22,0.85)'; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(25,240,255,0.4)'; ctx.stroke();
  fitTxt('DMG +' + Math.round(P.dmg * 100) + '%  ·  RATE +' + Math.round(P.fireRate * 100) + '%  ·  CRIT ' + Math.round(P.crit * 100) + '%  ·  SPD +' + Math.round(P.spd * 100) + '%  ·  ARMOR ' + Math.round(P.armor * 100) + '%', x + W / 2, y + 12, W - 16, 10.5, '#cfd6e6', 'center', '700');
  fitTxt('MAX HP ' + P.maxHp + '  ·  REROLLS ' + g.rerolls + '  ·  BANISHES ' + g.banishes + '  ·  PERKS ' + g.perksTaken.length, x + W / 2, y + 27, W - 16, 10.5, '#9aa4bd', 'center', '700');
  if (!ids.length) txt('No perks yet. Clear a room to pick one.', x + W / 2, y + statsH + 20, 12, '#8a93ab', 'center', '600');
  ids.forEach((id, i) => {
    const pk = PERK_BY_ID[id], cy = y + statsH + i * rowH, T = TIERS[pk.tier];
    if (cy + rowH < y + g.scrollY || cy > y + H + g.scrollY) return;
    rr(x, cy, W, rowH - 5, 9); ctx.fillStyle = 'rgba(6,9,22,0.85)'; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = hexA(pk.color, 0.6); ctx.stroke();
    ctx.beginPath(); ctx.arc(x + 20, cy + (rowH - 5) / 2, 12, 0, TAU); nstroke(pk.color, 1.2); txt(pk.icon, x + 20, cy + (rowH - 5) / 2 + 1, 13, pk.color, 'center', '800', false);
    fitTxt(pk.name + (g.perkCount[id] > 1 ? '  ×' + g.perkCount[id] : ''), x + 40, cy + 11, W - 130, 12.5, '#fff', 'left', '800');
    fitTxt(pk.desc, x + 40, cy + 26, W - 52, 10, pk.color, 'left', '600');
    txt(T.name + (pk.cls ? ' · CLASS' : pk.aff ? ' · AFFIX' : ''), x + W - 8, cy + 11, 8.5, T.color, 'right', '800', false);
  });
  ctx.restore();
  if (g.scrollMax > 0) { const bh = Math.max(24, H * H / total), by = y + (H - bh) * (g.scrollY / g.scrollMax); rr(x + W - 3, by, 3, bh, 1.5); ctx.fillStyle = 'rgba(25,240,255,0.6)'; ctx.fill(); if (g.scrollY < g.scrollMax - 2) txt('▼ drag to scroll', x + W / 2, y + H - 8, 9.5, '#6f7890', 'center', '700', false); }
}

// ---------------------------------------------------------------- pause
function pauseInfo(x, y, W, H) {
  const g = G, p = g.player, C = g.C, cur = g.cur, zi = ZONES[g.zone];
  rr(x, y, W, H, 12); ctx.fillStyle = 'rgba(6,9,22,0.8)'; ctx.fill(); nstroke(C.color, 1, 0.5);
  fitTxt(C.name.toUpperCase() + ' · LV ' + g.lvl + ' · ' + (skillDef(g) ? skillDef(g).name : 'skill locked'), x + W / 2, y + 17, W - 16, 13, C.color, 'center', '800');
  const rows = [['Zone', 'Z' + g.zone + ' ' + zi.name], ['Room', roomLabel(cur)], ['Loop', 'Loop ' + g.loop], ['Credits', '¢ ' + g.credits], ['Time / kills', fmt(g.time) + ' / ' + g.kills], ['Rerolls / banishes', g.rerolls + ' / ' + g.banishes], ['Level / points', 'LV ' + g.lvl + ' / ' + g.pts + ' unspent']];
  const rh = Math.min(20, (H - 36) / rows.length);
  rows.forEach((r, i) => { txt(r[0], x + 14, y + 36 + i * rh, 11.5, '#8f98ad', 'left', '600', false); fitTxt(r[1], x + W - 14, y + 36 + i * rh, W * 0.58, 12, '#fff', 'right', '800'); });
}
function drawPause() {
  overlay(0.8);
  const g = G, X = contentX(); g.wcState = [];
  const tab = g.pauseTab;
  const tabs = (x, y, w, h) => { const gap = 6, bw = (w - gap * 3) / 4; ['MENU', 'WEAPONS', 'PERKS', 'TREE' + (g.pts > 0 ? ' (' + g.pts + ')' : '')].forEach((nm, i) => button(x + i * (bw + gap), y, bw, h, nm, () => { g.pauseTab = i; g.scrollY = 0; }, g.pauseTab === i ? '#19f0ff' : i === 3 && g.pts > 0 ? '#ffe066' : '#4a5788', 12.5)); };
  if (land) {
    txt('PAUSED', X.l, SA.t + 22, 24, '#fff', 'left', '900');
    button(X.r - 120, SA.t + 6, 120, 32, 'RESUME', () => { state = 'play'; }, '#19f0ff', 15);
    tabs(X.l, SA.t + 46, X.w, 30);
    const cy = SA.t + 86, ch = LH - SA.b - cy - 8;
    if (tab === 0) {
      const bw = Math.min(220, X.w * 0.4);
      button(X.l, cy, bw, 44, muted ? 'SOUND: OFF' : 'SOUND: ON', () => { muted = !muted; }, '#7b8cff', 15);
      button(X.l, cy + 54, bw, 44, 'QUIT TO MENU', () => quitToMenu(), '#ff3b6b', 15);
      pauseInfo(X.l + bw + 16, cy, X.w - bw - 16, Math.min(ch, 150));
    } else if (tab === 1) drawWeaponsTab(X.l, cy, X.w, ch);
    else if (tab === 2) drawPerksTab(X.l, cy, X.w, ch);
    else drawTreeTab(X.l, cy, X.w, ch);
    return;
  }
  txt('PAUSED', LW / 2, SA.t + 30, 28, '#fff', 'center', '900');
  tabs(X.l, SA.t + 52, X.w, 34);
  const cy = SA.t + 98, by = LH - SA.b - 54, ch = by - 10 - cy;
  button(LW / 2 - 100, by, 200, 44, 'RESUME', () => { state = 'play'; }, '#19f0ff', 18);
  if (tab === 0) {
    button(LW / 2 - 100, cy, 200, 46, muted ? 'SOUND: OFF' : 'SOUND: ON', () => { muted = !muted; }, '#7b8cff', 16);
    button(LW / 2 - 100, cy + 56, 200, 46, 'QUIT TO MENU', () => quitToMenu(), '#ff3b6b', 16);
    pauseInfo(X.l, cy + 114, X.w, Math.min(ch - 114, 170));
  } else if (tab === 1) drawWeaponsTab(X.l, cy, X.w, ch);
  else if (tab === 2) drawPerksTab(X.l, cy, X.w, ch);
  else drawTreeTab(X.l, cy, X.w, ch);
}

// ---------------------------------------------------------------- end screens (victory with loop option / game over)
function drawEnd(won) {
  const g = G, nb = g.newBest || [], X = contentX();
  overlay(0.84);
  const furthest = won ? 'Loop ' + g.loop + ' · ROOT beaten' : stageName(stageAbs(g));
  const rows = [['Time', fmt(g.time), nb.indexOf('time') >= 0], ['Kills', String(g.kills), nb.indexOf('kills') >= 0], ['Damage dealt', Math.round(g.dmgDealt).toLocaleString(), nb.indexOf('dmg') >= 0],
    ['Weapons found', String(g.found)], ['Perks / level', g.perksTaken.length + ' / LV ' + g.lvl], ['Loop / credits', g.loop + ' / ¢' + g.credits], ['Furthest', furthest, nb.indexOf('stage') >= 0 || nb.indexOf('loop') >= 0]];
  const sub = won ? 'Loop ' + g.loop + ' cleared: ROOT has been deleted.' : 'Fell in ' + ZONES[g.zone].name + ' · ' + roomLabel(g.cur);
  const bestLine = 'Best: ' + (best.bestStage ? stageName(best.bestStage) : '-') + ' · loop ' + (best.bestLoop || 1) + ' · ' + best.mostKills + ' kills';
  const hc = won ? '#ffe81a' : '#ff2b5c', nextLp = Math.round(g.loop * 35), nextDm = Math.round(Math.min(0.8, 0.12 * g.loop) * 100);
  if (land) {
    const cl = X.l + X.w * 0.31, cr = X.l + X.w * 0.78, rh = 24;
    txt(won ? 'VICTORY!' : 'SYSTEM FAILURE', cl, SA.t + 30, 32, hc, 'center', '900');
    fitTxt(sub, cl, SA.t + 56, X.w * 0.55, 12.5, '#cfd6e6', 'center', '600');
    rr(cl - 180, SA.t + 72, 360, rows.length * rh + 16, 14); ctx.fillStyle = 'rgba(6,9,22,0.8)'; ctx.fill(); nstroke(hc, 1.2, 0.6);
    rows.forEach((r, i) => statRow(r[0], r[1], SA.t + 92 + i * rh, r[2], cl - 164, cl + 164));
    const ey = SA.t + 92 + rows.length * rh + 18;
    if (nb.length) txt('★ NEW PERSONAL BEST ★', cl, ey, 13, '#ffe81a', 'center', '800');
    txt(bestLine, cl, ey + 20, 11, '#9aa4bd', 'center', '600', false);
    if (g.coop) { coopEndButtons(won, cr, SA.t + 70); return; }
    if (won) {
      button(cr - 110, SA.t + 70, 220, 62, 'LOOP (NEW GAME+)', () => startLoop(), '#ffe81a', 17);
      fitTxt('Keep weapons, perks & stats. Enemies +' + nextLp + '% HP, +' + nextDm + '% dmg, better drops.', cr, SA.t + 146, 230, 10.5, '#cfd6e6', 'center', '600');
      button(cr - 110, SA.t + 168, 220, 48, 'END RUN / MAIN MENU', () => endToMenu(), '#7b8cff', 14);
    } else {
      button(cr - 100, SA.t + 80, 200, 52, 'RUN AGAIN', () => newRun(g.C.id), '#19f0ff', 19);
      button(cr - 100, SA.t + 142, 200, 44, 'CHANGE CLASS', () => { state = 'select'; }, '#ff2bd6', 15);
      button(cr - 100, SA.t + 196, 200, 40, 'MENU', () => quitToMenu(), '#7b8cff', 15);
    }
    return;
  }
  txt(won ? 'VICTORY!' : 'SYSTEM FAILURE', LW / 2, 62 + SA.t, won ? 42 : 34, hc, 'center', '900');
  fitTxt(sub, LW / 2, 98 + SA.t, LW - 40, 13.5, '#cfd6e6', 'center', '600');
  txt(g.C.name + ' · LV ' + g.lvl + (skillDef(g) ? ' · ' + skillDef(g).name : ''), LW / 2, 118 + SA.t, 12, g.C.color, 'center', '800');
  const rh = 27;
  rr(24, 134 + SA.t, LW - 48, rows.length * rh + 14, 14); ctx.fillStyle = 'rgba(6,9,22,0.8)'; ctx.fill(); nstroke(hc, 1.2, 0.6);
  rows.forEach((r, i) => statRow(r[0], r[1], 158 + SA.t + i * rh, r[2], 40, LW - 40));
  const ey = 134 + SA.t + rows.length * rh + 30;
  if (nb.length) txt('★ NEW PERSONAL BEST ★', LW / 2, ey, 13, '#ffe81a', 'center', '800');
  fitTxt(bestLine, LW / 2, ey + 19, LW - 40, 11, '#9aa4bd', 'center', '600');
  const by = ey + 40;
  if (g.coop) { coopEndButtons(won, LW / 2, by); return; }
  if (won) {
    button(LW / 2 - 120, by, 240, 62, 'LOOP (NEW GAME+)', () => startLoop(), '#ffe81a', 19);
    fitTxt('Keep weapons, perks & stats · enemies +' + nextLp + '% HP, +' + nextDm + '% dmg · better drops', LW / 2, by + 78, LW - 30, 10.5, '#cfd6e6', 'center', '600');
    button(LW / 2 - 120, by + 94, 240, 48, 'END RUN / MAIN MENU', () => endToMenu(), '#7b8cff', 15);
  } else {
    button(LW / 2 - 100, by, 200, 52, 'RUN AGAIN', () => newRun(g.C.id), '#19f0ff', 20);
    button(LW / 2 - 100, by + 62, 200, 42, 'CHANGE CLASS', () => { state = 'select'; }, '#ff2bd6', 15);
    button(LW / 2 - 100, by + 114, 200, 40, 'MENU', () => quitToMenu(), '#7b8cff', 15);
  }
}
