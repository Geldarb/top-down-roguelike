'use strict';
// ---------- Static game data: rarities, weapon types, affixes, perks, enemies ----------
const RARITIES = [
  { id: 'common',    name: 'Common',    color: '#b9c6ff', mult: 1.0,  affixes: 0, weight: 62 },
  { id: 'rare',      name: 'Rare',      color: '#2aa8ff', mult: 1.25, affixes: 1, weight: 27 },
  { id: 'epic',      name: 'Epic',      color: '#c23cff', mult: 1.55, affixes: 2, weight: 9.5 },
  { id: 'legendary', name: 'Legendary', color: '#ffb800', mult: 1.95, affixes: 3, weight: 2.5 }
];

// dmg = per pellet, rate = shots / second, speed = px/s, life = seconds of flight
const WEAPON_TYPES = {
  pistol:   { name: 'Pistol',   dmg: 14, rate: 3.4, speed: 430, spread: 0.04, pellets: 1, life: 0.95, pierce: 0, size: 3,   color: '#ffe08a' },
  shotgun:  { name: 'Shotgun',  dmg: 7,  rate: 1.15, speed: 380, spread: 0.32, pellets: 6, life: 0.42, pierce: 0, size: 2.6, color: '#ffc27a' },
  smg:      { name: 'SMG',      dmg: 5,  rate: 10,  speed: 470, spread: 0.13, pellets: 1, life: 0.8,  pierce: 0, size: 2.4, color: '#9dffb0' },
  sniper:   { name: 'Sniper',   dmg: 50, rate: 0.85, speed: 950, spread: 0.0,  pellets: 1, life: 1.3,  pierce: 3, size: 3.6, color: '#8fe3ff' },
  crossbow: { name: 'Crossbow', dmg: 22, rate: 1.3, speed: 520, spread: 0.02, pellets: 1, life: 1.1,  pierce: 0, size: 3.2, color: '#d9b38c', stick: true, boom: 34, boomR: 50, fuse: 0.8 },
  launcher: { name: 'Launcher', dmg: 14, rate: 0.85, speed: 260, spread: 0.03, pellets: 1, life: 1.7, pierce: 0, size: 5,   color: '#ff8a5c', boom: 40, boomR: 58 }
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
  { id: 'special', name: 'Quick Boot',     desc: 'Skill recharges 25% faster', icon: '★', color: '#c78bff', apply: P => { P.skillCd *= 0.75; } },
  { id: 'magnet',  name: 'Magnet',         desc: 'Pick up items from farther', icon: '◎', color: '#7fd0ff', apply: P => { P.magnet += 30; } },
  { id: 'armor',   name: 'Thick Skin',     desc: 'Take 10% less damage',     icon: '▣', color: '#b8c4d8', apply: P => { P.armor = Math.min(0.5, P.armor + 0.10); } },
  { id: 'heal',    name: 'Field Medic',    desc: 'Heal 50% of max HP',       icon: '+', color: '#6bff8a', apply: (P, g) => { g.player.hp = Math.min(P.maxHp, g.player.hp + P.maxHp * 0.5); } }
];

// hp, speed, radius, contact damage, color
const ENEMY_TYPES = {
  chaser:  { name: 'Rogue Drone',    hp: 30,  speed: 62, r: 10, dmg: 10, color: '#ff3b5c', cost: 1 },
  swarm:   { name: 'Malware',        hp: 9,   speed: 88, r: 6,  dmg: 4,  color: '#4dff7a', cost: 0.5 },
  shooter: { name: 'ICE Turret',     hp: 26,  speed: 55, r: 10, dmg: 6,  color: '#ff9a1f', cost: 2 },
  tank:    { name: 'Firewall',       hp: 170, speed: 34, r: 17, dmg: 18, color: '#b04dff', cost: 4 },
  boss:    { name: 'The Admin',      hp: 2600, speed: 50, r: 30, dmg: 20, color: '#ff2bd6', cost: 0 }
};

// ---------- Classes: starting weapon, passive and one active skill each ----------
// start: weapon type (null = random); skill cd in seconds
const CLASSES = [
  { id: 'runner',    name: 'Runner',    color: '#19f0ff', start: 'pistol',   tag: 'Fast hands, sharp shots',
    passive: 'Gunslinger', pdesc: '+15% crit chance',
    skill: 'Overload', sdesc: 'Burst of shots in all directions, flushes heat: dash resets and fire rate +30% for 3s', cd: 9 },
  { id: 'breacher',  name: 'Breacher',  color: '#ff8a1f', start: 'shotgun',  tag: 'Close-range door kicker',
    passive: 'Slug Core', pdesc: 'Pellets pierce one enemy',
    skill: 'Shockwave', sdesc: 'Blast that knocks back and stuns nearby enemies', cd: 10 },
  { id: 'phantom',   name: 'Phantom',   color: '#a65bff', start: 'sniper',   tag: 'Strike from the shadows',
    passive: 'Ambush', pdesc: 'First shot after a dash deals triple damage',
    skill: 'Decoy', sdesc: 'Hologram lures enemies for 5s while you reposition', cd: 12 },
  { id: 'overclock', name: 'Overclock', color: '#ff2a3d', start: 'smg',      tag: 'Burn bright, burn fast',
    passive: 'Adrenaline', pdesc: 'Damage rises as your health drops (up to +80%)',
    skill: 'Redline', sdesc: 'Double fire rate for 5s, costs 15 HP', cd: 12 },
  { id: 'daemon',    name: 'Daemon',    color: '#39ff6a', start: 'crossbow', tag: 'Let the machines work',
    passive: 'Long Uptime', pdesc: 'Your turrets last 75% longer',
    skill: 'Turret', sdesc: 'Plant a turret that copies your weapon and its affixes', cd: 11 },
  { id: 'blackout',  name: 'Blackout',  color: '#ffe81a', start: 'launcher', tag: 'Fire from above',
    passive: 'Thermite', pdesc: 'Burning and Explosive affixes are 50% stronger',
    skill: 'Orbital Strike', sdesc: 'Plasma blast on the densest enemy cluster', cd: 13 },
  { id: 'glitch',    name: 'Glitch',    color: '#ff3df0', start: null,       tag: 'Reality is a suggestion',
    passive: 'Corrupted Luck', pdesc: '4 perk choices; picked-up weapons may reroll an affix',
    skill: 'Reroll', sdesc: 'Rerolls the affixes of your equipped weapon', cd: 20 }
];
const CLASS_BY_ID = {}; CLASSES.forEach(c => { CLASS_BY_ID[c.id] = c; });
