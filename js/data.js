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

// ---------- Perks: common / rare / epic, stackable (max stacks), optional class or affix synergy ----------
const TIERS = {
  common: { name: 'COMMON', color: '#b9c6ff', w: 60 },
  rare:   { name: 'RARE',   color: '#2aa8ff', w: 30 },
  epic:   { name: 'EPIC',   color: '#ffb800', w: 10 }
};
const TIER_IDX = { common: 0, rare: 1, epic: 2 };
const PK = (id, name, tier, max, icon, color, desc, apply, extra) => Object.assign({ id, name, tier, max, icon, color, desc, apply }, extra || {});
const PERKS = [
  // ---- common
  PK('spd', 'Swift Boots', 'common', 5, '»', '#5ff0d0', '+10% move speed', P => { P.spd += 0.10; }),
  PK('crit', 'Eagle Eye', 'common', 6, '✦', '#ffe066', '+6% crit chance', P => { P.crit += 0.06; }),
  PK('critdmg', 'Hollow Points', 'common', 4, '✸', '#ff9a3c', '+30% crit damage', P => { P.critDmg += 0.30; }),
  PK('maxhp', 'Vitality', 'common', 6, '♥', '#ff5a6e', '+20 max HP and heal 20', (P, g) => { P.maxHp += 20; g.player.hp = Math.min(P.maxHp, g.player.hp + 20); }),
  PK('rate', 'Trigger Happy', 'common', 6, '≫', '#9dffb0', '+10% fire rate', P => { P.fireRate += 0.10; }),
  PK('dmg', 'Heavy Rounds', 'common', 8, '●', '#ff7a5c', '+10% damage', P => { P.dmg += 0.10; }),
  PK('dash', 'Quick Step', 'common', 4, '⇢', '#8fe3ff', 'Dash recharges 15% faster', P => { P.dashCd *= 0.85; }),
  PK('special', 'Quick Boot', 'common', 4, '★', '#c78bff', 'Skill recharges 15% faster', P => { P.skillCd *= 0.85; }),
  PK('magnet', 'Magnet', 'common', 3, '◎', '#7fd0ff', 'Pick up items from farther', P => { P.magnet += 30; }),
  PK('armor', 'Thick Skin', 'common', 5, '▣', '#b8c4d8', 'Take 8% less damage', P => { P.armor = Math.min(0.5, P.armor + 0.08); }),
  PK('heal', 'Field Medic', 'common', 99, '+', '#6bff8a', 'Heal 40% of max HP', (P, g) => { g.player.hp = Math.min(P.maxHp, g.player.hp + P.maxHp * 0.4); }),
  PK('luck', 'Fortune', 'common', 4, '♣', '#ffb23e', 'Better weapon drop quality', P => { P.luck += 0.25; }),
  PK('cred', 'Scavenger', 'common', 4, '¢', '#ffe81a', '+25% credits from enemies', P => { P.credit += 0.25; }),
  PK('regen', 'Nanofix', 'common', 4, '✚', '#4dffb0', 'Regenerate 0.6 HP per second', P => { P.regen += 0.6; }),
  PK('after', 'Aftercare', 'common', 3, '☤', '#6bff8a', '+10 HP whenever a room is cleared', P => { P.clearHeal += 10; }),
  PK('cache', 'Data Cache', 'common', 99, '¤', '#ffe81a', 'Instantly gain 60 credits', (P, g) => { g.credits += 60; }),
  // ---- rare
  PK('pen', 'Overpenetrate', 'rare', 3, '⇉', '#8fe3ff', 'Bullets pierce 1 more enemy', P => { P.pierce += 1; }),
  PK('dice', 'Lucky Dice', 'rare', 4, '⚀', '#ffd27a', '+1 perk reroll', (P, g) => { g.rerolls += 1; }),
  PK('del', 'Delete Key', 'rare', 3, '⌫', '#ff6a8a', '+1 perk banish', (P, g) => { g.banishes += 1; }),
  PK('ghost', 'Ghost Step', 'rare', 3, '◌', '#a8d8ff', 'Dash invulnerability lasts 0.12s longer', P => { P.dashI += 0.12; }),
  PK('exec', 'Finisher', 'rare', 3, '☠', '#ff5a5a', '+30% damage to enemies under 30% HP', P => { P.exec += 0.30; }),
  PK('bane', 'Bossbane', 'rare', 3, '♛', '#ff2bd6', '+25% damage to bosses and elites', P => { P.bossDmg += 0.25; }),
  PK('leech', 'Leech', 'rare', 5, '❤', '#ff7aa0', 'Heal 1 HP on every kill', P => { P.vamp += 1; }),
  PK('sprint', 'Run & Gun', 'rare', 3, '➤', '#5ff0d0', '+15% damage while moving', P => { P.moveDmg += 0.15; }),
  PK('ram', 'Ram Dash', 'rare', 3, '⛯', '#19f0ff', 'Dashing through enemies deals 40 damage', P => { P.dashDmg += 40; }),
  PK('thorn', 'Reactive Plating', 'rare', 3, '✷', '#ffb347', 'When hit, release a blast (30 damage)', P => { P.thorns += 30; }),
  // ---- epic
  PK('glass', 'Glass Cannon', 'epic', 1, '◆', '#ff3355', '+40% damage, -20% max HP', (P, g) => { P.dmg += 0.4; const m = P.maxHp; P.maxHp = Math.round(P.maxHp * 0.8); g.player.hp = Math.min(g.player.hp, P.maxHp); }),
  PK('wind', 'Second Wind', 'epic', 2, '⟳', '#6bff8a', 'Once per run, survive a killing blow with 50% HP', P => { P.revive += 1; }),
  PK('echo', 'Echo Rounds', 'epic', 3, '⁝', '#c78bff', '15% chance each shot fires a free echo shot', P => { P.echo += 0.15; }),
  PK('shield', 'Overshield', 'epic', 2, '⬡', '#7fd0ff', 'Absorb the first hit in every room', P => { P.shield += 1; }),
  PK('core', 'Overdrive Core', 'epic', 1, '⚙', '#ffe066', 'Skill recharges 30% faster and +10% fire rate', P => { P.skillCd *= 0.7; P.fireRate += 0.1; }),
  PK('titan', 'Titan Frame', 'epic', 2, '▰', '#b8c4d8', '+50 max HP and take 12% less damage', (P, g) => { P.maxHp += 50; P.armor = Math.min(0.5, P.armor + 0.12); g.player.hp += 50; }),
  // ---- affix synergy (only offered while an equipped weapon carries the affix)
  PK('slowburn', 'Slow Burn', 'rare', 3, '♨', '#ff9a3c', 'Burning and explosive hits are 25% stronger', P => { P.burnMul += 0.25; }, { aff: 'burning' }),
  PK('storm', 'Storm Conductor', 'rare', 3, 'ϟ', '#9fe8ff', 'Chain Lightning: +1 arc and +15% chance', P => { P.chainPlus += 1; }, { aff: 'chain' }),
  PK('pinball', 'Pinball Wizard', 'rare', 3, '◈', '#ffe066', 'Ricochet: +1 bounce', P => { P.bouncePlus += 1; }, { aff: 'ricochet' }),
  PK('bloodp', 'Blood Pact', 'rare', 3, '✝', '#ff4d6d', 'Vampiric: heal 2 more HP per kill', P => { P.vampPlus += 1; }, { aff: 'vampiric' }),
  PK('frag', 'Fragmentation', 'rare', 1, '❖', '#ffb070', 'Splitting: hits split into 3 shards', P => { P.splitPlus = 1; }, { aff: 'splitting' }),
  PK('shatter', 'Cryo Shatter', 'rare', 3, '❄', '#8fe3ff', 'Freezing: +25% damage to slowed enemies', P => { P.shatter += 0.25; }, { aff: 'freezing' }),
  PK('volatile', 'Volatile Mix', 'rare', 3, '✺', '#ffb070', 'Explosive: +40% blast radius', P => { P.boomR += 1; }, { aff: 'explosive' }),
  PK('trigger', 'Hair Trigger', 'epic', 2, '⚡', '#ff9a3c', 'Overcharged: triggers every shot sooner (-1 shot)', P => { P.overN = Math.max(3, P.overN - 1); }, { aff: 'overcharged' }),
  PK('curse', 'Curse Mastery', 'rare', 2, '☾', '#ff6a8a', 'Cursed: take 18% less of the curse penalty', P => { P.curseRed += 0.18; }, { aff: 'cursed' }),
  PK('needle', 'Needle Rounds', 'rare', 2, '↟', '#8fe3ff', 'Piercing: pierce 1 more and +10% damage', P => { P.pierceAff += 1; P.dmg += 0.10; }, { aff: 'piercing' }),
  // ---- class synergy (only offered to that class)
  PK('c_runner', 'Overload Mastery', 'rare', 2, '⌖', '#19f0ff', 'Overload fires 24 bullets and hastes you for 5s', P => { P.runnerPlus += 1; }, { cls: 'runner' }),
  PK('c_breacher', 'Concussive Blast', 'rare', 2, '◉', '#ff8a1f', 'Shockwave: +30% radius and +1s stun', P => { P.breachPlus += 1; }, { cls: 'breacher' }),
  PK('c_phantom', 'Deep Cover', 'rare', 2, '◇', '#a65bff', 'Ambush shot x4.5 and Decoy lasts 3s longer', P => { P.phantomPlus += 1; }, { cls: 'phantom' }),
  PK('c_overclock', 'Meltdown', 'epic', 1, '☢', '#ff2a3d', 'Adrenaline +40% and Redline costs only 7 HP', P => { P.ocPlus += 1; }, { cls: 'overclock' }),
  PK('c_daemon', 'Dual Core', 'rare', 2, '▥', '#39ff6a', 'One more turret at once and +25% turret damage', P => { P.turretPlus += 1; }, { cls: 'daemon' }),
  PK('c_blackout', 'Carpet Bombing', 'epic', 1, '☄', '#ffe81a', 'Orbital Strike is 30% wider and fires twice', P => { P.strikePlus += 1; }, { cls: 'blackout' }),
  PK('c_glitch', 'Fractal Luck', 'rare', 2, '⌬', '#ff3df0', 'Pickups reroll 90% of the time, Reroll cooldown -25%', P => { P.glitchPlus += 1; }, { cls: 'glitch' })
];
const PERK_BY_ID = {}; PERKS.forEach(p => { PERK_BY_ID[p.id] = p; });

// ---------- Zones, room kinds ----------
const ZONES = {
  1: { name: 'BOOT SECTOR',      col: '#19f0ff', hue: 190, hint: 'Basic drones and malware' },
  2: { name: 'FIREWALL ROW',     col: '#ff7a2a', hue: 18,  hint: 'Laser walls toggle. ICE sentries guard chokepoints' },
  3: { name: 'DATA SWAMP',       col: '#39ff6a', hue: 130, hint: 'Slow data pools. Swarms split when killed' },
  4: { name: 'MIRROR MAINFRAME', col: '#d05bff', hue: 295, hint: 'Enemy clones, mirror walls, glitching tiles' },
  5: { name: 'CORE REACTOR',     col: '#ffe9a0', hue: 45,  hint: 'ROOT awaits' }
};
const ROOM_KINDS = {
  combat:   { name: 'COMBAT',        col: '#19f0ff', desc: 'Clear every wave' },
  vault:    { name: 'VAULT',         col: '#ffe81a', desc: 'Guarded chest: beat the guards to open it' },
  gauntlet: { name: 'GAUNTLET',      col: '#ff5a3c', desc: 'Non-stop waves against the clock' },
  elite:    { name: 'ELITE',         col: '#ff2bd6', desc: 'One tough foe, guaranteed legendary drop' },
  shop:     { name: 'SHOP TERMINAL', col: '#39ff6a', desc: 'Spend your credits' },
  risk:     { name: 'RISK ROOM',     col: '#ff3b6b', desc: 'Trade a harder next room for power' },
  boss:     { name: 'BOSS',          col: '#ff2bd6', desc: 'Boss fight' }
};

// hp, speed, radius, contact damage, color
const ENEMY_TYPES = {
  chaser:  { name: 'Rogue Drone',    hp: 30,  speed: 62, r: 10, dmg: 10, color: '#ff3b5c', cost: 1 },
  swarm:   { name: 'Malware',        hp: 9,   speed: 88, r: 6,  dmg: 4,  color: '#4dff7a', cost: 0.5 },
  shooter: { name: 'ICE Turret',     hp: 26,  speed: 55, r: 10, dmg: 6,  color: '#ff9a1f', cost: 2 },
  tank:    { name: 'Firewall',       hp: 170, speed: 34, r: 17, dmg: 18, color: '#b04dff', cost: 4 },
  boss:    { name: 'The Admin',      hp: 2600, speed: 50, r: 30, dmg: 20, color: '#ff2bd6', cost: 0 },
  turret:  { name: 'ICE Sentry',     hp: 55,  speed: 0,  r: 11, dmg: 6,  color: '#ff9a1f', cost: 2, fixed: true },
  splitter:{ name: 'Bloat',          hp: 46,  speed: 52, r: 11, dmg: 8,  color: '#8dff3a', cost: 1.6 },
  elite:   { name: 'Elite',          hp: 650, speed: 46, r: 19, dmg: 16, color: '#ff2bd6', cost: 0 },
  sentinel:{ name: 'Sentinel',       hp: 1700, speed: 0, r: 30, dmg: 18, color: '#ff6a1f', cost: 0, fixed: true },
  twin:    { name: 'Mirror Twin',    hp: 1400, speed: 70, r: 10, dmg: 14, color: '#ffffff', cost: 0 },
  root:    { name: 'ROOT',           hp: 3000, speed: 0, r: 44, dmg: 25, color: '#ffd34a', cost: 0, fixed: true },
  node:    { name: 'Shield Node',    hp: 360, speed: 0,  r: 14, dmg: 10, color: '#ffe9a0', cost: 0, fixed: true }
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
