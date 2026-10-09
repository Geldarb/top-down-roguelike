'use strict';
// ---------- Static game data: rarities, weapon types, affixes, perks, enemies ----------
const RARITIES = [
  { id: 'common',    name: 'Common',    color: '#c8d0d8', mult: 1.0,  affixes: 0, weight: 62 },
  { id: 'rare',      name: 'Rare',      color: '#4aa3ff', mult: 1.25, affixes: 1, weight: 27 },
  { id: 'epic',      name: 'Epic',      color: '#b45cff', mult: 1.55, affixes: 2, weight: 9.5 },
  { id: 'legendary', name: 'Legendary', color: '#ffb23e', mult: 1.95, affixes: 3, weight: 2.5 }
];

// dmg = per pellet, rate = shots / second, speed = px/s, life = seconds of flight
const WEAPON_TYPES = {
  pistol:   { name: 'Pistol',   dmg: 14, rate: 3.4, speed: 430, spread: 0.04, pellets: 1, life: 0.95, pierce: 0, size: 3,   color: '#ffe08a',
              special: 'Quickdraw', sdesc: 'Unload 8 rapid shots' },
  shotgun:  { name: 'Shotgun',  dmg: 7,  rate: 1.15, speed: 380, spread: 0.32, pellets: 6, life: 0.42, pierce: 0, size: 2.6, color: '#ffc27a',
              special: 'Shockwave', sdesc: 'Blast that hurts and knocks back' },
  smg:      { name: 'SMG',      dmg: 5,  rate: 10,  speed: 470, spread: 0.13, pellets: 1, life: 0.8,  pierce: 0, size: 2.4, color: '#9dffb0',
              special: 'Overdrive', sdesc: '2x fire rate for 4s' },
  sniper:   { name: 'Sniper',   dmg: 50, rate: 0.85, speed: 950, spread: 0.0,  pellets: 1, life: 1.3,  pierce: 3, size: 3.6, color: '#8fe3ff',
              special: 'Railshot', sdesc: 'Huge piercing shot (6x)' },
  crossbow: { name: 'Crossbow', dmg: 22, rate: 1.3, speed: 520, spread: 0.02, pellets: 1, life: 1.1,  pierce: 0, size: 3.2, color: '#d9b38c', stick: true, boom: 34, boomR: 50, fuse: 0.8,
              special: 'Volley', sdesc: 'Fan of 5 exploding bolts' },
  launcher: { name: 'Launcher', dmg: 14, rate: 0.85, speed: 260, spread: 0.03, pellets: 1, life: 1.7, pierce: 0, size: 5,   color: '#ff8a5c', boom: 40, boomR: 58,
              special: 'Barrage', sdesc: 'Rain of 5 rockets' }
};
const WEAPON_ORDER = ['pistol', 'shotgun', 'smg', 'sniper', 'crossbow', 'launcher'];

const AFFIXES = [
  { id: 'ricochet',    adj: 'Ricochet',    name: 'Ricochet',        desc: 'Bullets bounce off walls (2x)' },
  { id: 'burning',     adj: 'Burning',     name: 'Burning',         desc: 'Ignites enemies for 3s' },
  { id: 'chain',       adj: 'Arcing',      name: 'Chain Lightning', desc: '45% chance to arc to 2 foes' },
  { id: 'vampiric',    adj: 'Vampiric',    name: 'Vampiric',        desc: 'Heal 3 HP on kill' },
  { id: 'splitting',   adj: 'Splitting',   name: 'Splitting',       desc: 'Hits split into 2 shards' },
  { id: 'overcharged', adj: 'Overcharged', name: 'Overcharged',     desc: 'Every 5th shot deals 3x damage' },
  { id: 'cursed',      adj: 'Cursed',      name: 'Cursed',          desc: '+60% damage, but you take +35% damage' },
  { id: 'freezing',    adj: 'Frozen',      name: 'Freezing',        desc: 'Hits slow enemies by 50%' },
  { id: 'explosive',   adj: 'Explosive',   name: 'Explosive',       desc: 'Hits cause a small blast' },
  { id: 'piercing',    adj: 'Piercing',    name: 'Piercing',        desc: 'Passes through 2 extra enemies' }
];
const AFFIX_BY_ID = {};
AFFIXES.forEach(a => { AFFIX_BY_ID[a.id] = a; });

const PERKS = [
  { id: 'spd',     name: 'Swift Boots',    desc: '+12% move speed',          icon: '»', color: '#5ff0d0', apply: P => { P.spd += 0.12; } },
  { id: 'crit',    name: 'Eagle Eye',      desc: '+8% crit chance',          icon: '✦', color: '#ffe066', apply: P => { P.crit += 0.08; } },
  { id: 'critdmg', name: 'Hollow Points',  desc: '+35% crit damage',         icon: '✸', color: '#ff9a3c', apply: P => { P.critDmg += 0.35; } },
  { id: 'luck',    name: 'Fortune',        desc: 'Better weapon drop quality', icon: '♣', color: '#ffb23e', apply: P => { P.luck += 0.3; } },
  { id: 'maxhp',   name: 'Vitality',       desc: '+25 max HP and heal 25',   icon: '♥', color: '#ff5a6e', apply: (P, g) => { P.maxHp += 25; g.player.hp = Math.min(P.maxHp, g.player.hp + 25); } },
  { id: 'rate',    name: 'Trigger Happy',  desc: '+12% fire rate',           icon: '≫', color: '#9dffb0', apply: P => { P.fireRate += 0.12; } },
  { id: 'dmg',     name: 'Heavy Rounds',   desc: '+12% damage',              icon: '●', color: '#ff7a5c', apply: P => { P.dmg += 0.12; } },
  { id: 'dash',    name: 'Quick Step',     desc: 'Dash recharges 20% faster', icon: '⇢', color: '#8fe3ff', apply: P => { P.dashCd *= 0.8; } },
  { id: 'special', name: 'Quick Charge',   desc: 'Special recharges 25% faster', icon: '★', color: '#c78bff', apply: P => { P.specialCd *= 0.75; } },
  { id: 'magnet',  name: 'Magnet',         desc: 'Pick up items from farther', icon: '◎', color: '#7fd0ff', apply: P => { P.magnet += 30; } },
  { id: 'armor',   name: 'Thick Skin',     desc: 'Take 10% less damage',     icon: '▣', color: '#b8c4d8', apply: P => { P.armor = Math.min(0.5, P.armor + 0.10); } },
  { id: 'heal',    name: 'Field Medic',    desc: 'Heal 50% of max HP',       icon: '+', color: '#6bff8a', apply: (P, g) => { g.player.hp = Math.min(P.maxHp, g.player.hp + P.maxHp * 0.5); } }
];

// hp, speed, radius, contact damage, color
const ENEMY_TYPES = {
  chaser:  { hp: 30,  speed: 62, r: 10, dmg: 10, color: '#ff5a5a', cost: 1 },
  swarm:   { hp: 9,   speed: 88, r: 6,  dmg: 4,  color: '#7dff6a', cost: 0.5 },
  shooter: { hp: 26,  speed: 55, r: 10, dmg: 6,  color: '#ffa63d', cost: 2 },
  tank:    { hp: 170, speed: 34, r: 17, dmg: 18, color: '#a05cff', cost: 4 },
  boss:    { hp: 2600, speed: 50, r: 30, dmg: 20, color: '#d6264f', cost: 0 }
};
