'use strict';
// =====================================================================
//  Class upgrade trees (Borderlands-style): in-run XP -> levels -> skill points.
//  Every class starts with a common pistol and NO skill. The first point picks 1 of 3 skills.
//  Each class has 3 branches; tiers unlock by points spent in that branch.
//  Node kinds: 'stat' (1-5 ranks, stackable) and 'choice' (pick 1 of 3 options, permanent).
// =====================================================================
const TIER_REQ = [0, 0, 3, 7];             // points in branch needed for tier 1..3
const XP_BASE = 16, XP_STEP = 7;
function xpNeed(lvl) { return XP_BASE + XP_STEP * (lvl - 1); }
const XP_VAL = { chaser: 3, swarm: 1, shooter: 4, tank: 10, turret: 4, splitter: 4, elite: 40, sentinel: 90, boss: 120, twin: 110, root: 200, node: 15 };

// apply helpers: A = additive, M = multiplicative
const A = o => P => { for (const k in o) P[k] = (P[k] || 0) + o[k]; };
const M = o => P => { for (const k in o) P[k] = (P[k] == null ? 1 : P[k]) * o[k]; };
const AM = (a, m) => P => { A(a)(P); M(m)(P); };
const stat = (id, tier, name, max, desc, fx) => ({ id, tier, name, max, desc, fx, kind: 'stat' });
const choice = (id, tier, name, opts) => ({ id, tier, name, max: 1, kind: 'choice', opts });
const opt = (name, desc, fx) => ({ name, desc, fx });

// ---- generic skill augments (choose-1-of-3 nodes in each class's skill branch)
const AUG = {
  nova:   opt('Shrapnel Nova',   'Skill also fires a 12-bullet ring with your weapon (60% dmg)', A({ augNova: 1 })),
  haste:  opt('Kickstart',       'Skill also grants Haste for 3s (+30% fire rate, +25% speed)', A({ augHaste: 1 })),
  shield: opt('Hardlight Shield','Skill also grants a shield charge that blocks one hit (max 2)', A({ augShield: 1 })),
  pull:   opt('Gravity Well',    'Skill also pulls enemies within 160 toward its centre', A({ augPull: 1 })),
  burn:   opt('Thermal Residue', 'Skill also leaves a ring of burning ground', A({ augBurn: 1 })),
  stun:   opt('Flashbang',       'Skill also stuns enemies within 120 for 1.2s', A({ augStun: 1 })),
  mark:   opt('Target Lock',     'Skill marks enemies within 170: they take +25% damage for 6s', A({ augMark: 1 })),
  freeze: opt('Cryo Pulse',      'Skill also slows enemies within 150 by 50% for 3s', A({ augFreeze: 1 })),
  boom:   opt('Detonator',       'Skill also triggers a 90-radius blast at its centre', A({ augBoom: 1 })),
  chain:  opt('Arc Relay',       'Skill also zaps the 5 nearest enemies with chain lightning', A({ augChain: 1 })),
  heal:   opt('Patch Job',       'Skill also heals 12% of your max HP', A({ augHeal: 1 })),
  reset:  opt('Recursion',       '30% chance the skill cooldown is fully refunded', A({ augReset: 0.3 }))
};
const ECHO_CAST = opt('Echo Cast', '35% chance your skill casts a second time for free', A({ skTwice: 0.35 }));
const SUPERCHARGE = opt('Supercharger', 'Skill power +60% (damage, radius, duration)', A({ skPow: 0.6 }));

// ---- skill variants (3 per class). cd in seconds; implementation lives in castSkill()
const SKILL_DEFS = {
  overload:   { name: 'Overload',      cd: 9,  desc: '16-way bullet burst, resets dash, +30% fire rate for 3s' },
  afterburn:  { name: 'Afterburner',   cd: 10, desc: '4s of +50% speed and +40% fire rate; dash instantly recharged' },
  fanhammer:  { name: 'Fan the Hammer',cd: 7,  desc: 'Three rapid 5-bullet volleys at your target' },
  shockwave:  { name: 'Shockwave',     cd: 10, desc: 'Blast around you that damages, knocks back and stuns' },
  charge:     { name: 'Breach Charge', cd: 8,  desc: 'Invulnerable shoulder-charge that rams, stuns and ends in a blast' },
  vortex:     { name: 'Vortex Grenade',cd: 11, desc: 'Grenade that sucks enemies together for 1s, then explodes' },
  decoy:      { name: 'Decoy',         cd: 12, desc: 'Hologram lures enemies for 5s; your next shot deals x3' },
  phasestrike:{ name: 'Phase Strike',  cd: 9,  desc: 'Blink behind the nearest enemy and slash it; primes an ambush shot' },
  cloak:      { name: 'Cloak',         cd: 13, desc: 'Turn invisible for 4s (+30% speed); enemies lose you; next shot x3' },
  redline:    { name: 'Redline',       cd: 12, desc: 'Double fire rate for 5s, costs 15 HP' },
  vent:       { name: 'Overheat Vent', cd: 9,  desc: 'Vent heat: a fiery 110-radius blast that ignites, costs 8 HP' },
  bloodsurge: { name: 'Bloodsurge',    cd: 14, desc: '5s: +30% damage, hits heal 0.5 HP, kills heal 4 HP' },
  turret:     { name: 'Turret',        cd: 11, desc: 'Plant a turret that copies your weapon and its affixes' },
  drones:     { name: 'Drone Swarm',   cd: 13, desc: '2 drones orbit you for 9s and fire copies of your weapon' },
  logicbomb:  { name: 'Logic Bomb',    cd: 10, desc: 'Scatter 4 proximity mines around you (12s)' },
  orbital:    { name: 'Orbital Strike',cd: 13, desc: 'Plasma blast on the densest enemy cluster' },
  napalm:     { name: 'Napalm Line',   cd: 9,  desc: 'A line of burning plasma toward your target' },
  barrage:    { name: 'Cluster Barrage',cd: 12, desc: '6 small strikes rain on random enemies' },
  reroll:     { name: 'Reroll',        cd: 20, desc: 'Rerolls every affix of your equipped weapon' },
  blink:      { name: 'Glitch Blink',  cd: 7,  desc: 'Teleport away from danger, leaving a glitch nova behind' },
  chaos:      { name: 'Chaos Field',   cd: 12, desc: 'Every enemy within 230 gets a random burn, freeze or shock' }
};

const TREES = {
  runner: { skills: ['overload', 'afterburn', 'fanhammer'], branches: [
    { id: 'gun', name: 'GUNPLAY', col: '#ffe066', nodes: [
      stat('r_qd', 1, 'Quickdraw', 5, '+5% fire rate per rank', A({ fireRate: 0.05 })),
      stat('r_ss', 1, 'Sharpshooter', 5, '+3% crit chance per rank', A({ crit: 0.03 })),
      stat('r_pl', 2, 'Pistolero', 3, '+10% pistol damage per rank', A({ dmg_pistol: 0.10 })),
      choice('r_td', 2, 'Trigger Discipline', [opt('Hollow Tips', '+40% crit damage', A({ critDmg: 0.4 })), opt('Hair Trigger', '+15% fire rate', A({ fireRate: 0.15 })), opt('Lucky Strike', 'Critical hits heal 1 HP', A({ critHeal: 1 }))]),
      choice('r_sig', 3, 'Signature Style', [opt('Deadeye', 'Every 4th shot is a guaranteed critical hit', P => { P.critEvery = P.critEvery ? Math.min(P.critEvery, 4) : 4; }), opt('Hot Lead', 'Critical hits ignite enemies (synergy: Burning)', A({ critIgnite: 1 })), opt('Ricochet Ace', 'All bullets bounce off walls +1 time (stacks with Ricochet)', A({ bounceAll: 1 }))])
    ] },
    { id: 'spd', name: 'SPEED', col: '#5ff0d0', nodes: [
      stat('r_ff', 1, 'Fleet Foot', 5, '+4% move speed per rank', A({ spd: 0.04 })),
      stat('r_qs', 1, 'Quick Step', 5, 'Dash recharges 6% faster per rank', M({ dashCd: 0.94 })),
      stat('r_rg', 2, 'Run & Gun', 3, '+6% damage while moving per rank', A({ moveDmg: 0.06 })),
      choice('r_fw', 2, 'Footwork', [opt('Slide Tackle', 'Dashing through enemies deals 40 damage, +0.1s dash invulnerability', A({ dashDmg: 40, dashI: 0.1 })), opt('Second Step', 'After a dash your next 3 shots are critical hits', A({ dashCrit: 3 })), opt('Evasive', 'Take 10% less damage and +6% speed', A({ armor: 0.10, spd: 0.06 }))]),
      choice('r_flow', 3, 'Flow State', [opt('Momentum', '+25% damage while moving', A({ moveDmg: 0.25 })), opt('Afterimage', 'Dashes end with a 60-damage blast', A({ dashBoom: 60 })), opt('Blur', 'Dash recharges 25% faster and grants 1.5s Haste', P => { P.dashCd *= 0.75; P.dashHaste = (P.dashHaste || 0) + 1.5; })])
    ] },
    { id: 'ovl', name: 'OVERLOAD', col: '#19f0ff', skill: true, nodes: [
      stat('r_cap', 1, 'Capacitor', 5, 'Skill recharges 5% faster per rank', M({ skillCd: 0.95 })),
      stat('r_amp', 1, 'Amplifier', 5, '+8% skill power per rank', A({ skPow: 0.08 })),
      stat('r_fb', 2, 'Feedback', 3, 'Kills cut 0.15s off the skill cooldown per rank', A({ killSkill: 0.15 })),
      choice('r_aug', 2, 'Skill Augment', [AUG.nova, AUG.haste, AUG.shield]),
      choice('r_op', 3, 'Overload Protocol', [SUPERCHARGE, ECHO_CAST, opt('Static Field', 'For 5s after your skill, every hit arcs chain lightning (synergy: Chain)', A({ skChain: 5 }))])
    ] }
  ] },
  breacher: { skills: ['shockwave', 'charge', 'vortex'], branches: [
    { id: 'demo', name: 'DEMOLITION', col: '#ff8a1f', skill: true, nodes: [
      stat('b_dc', 1, 'Det Cord', 5, '+8% skill power per rank', A({ skPow: 0.08 })),
      stat('b_fc', 1, 'Fuse Cutter', 5, 'Skill recharges 5% faster per rank', M({ skillCd: 0.95 })),
      stat('b_br', 2, 'Blast Radius', 3, 'All explosions +8% radius per rank (synergy: Explosive, Launcher)', A({ blastR: 0.08 })),
      choice('b_aug', 2, 'Skill Augment', [AUG.pull, AUG.burn, AUG.stun]),
      choice('b_wc', 3, 'Wrecking Crew', [opt('Aftershock', 'Your skill repeats as a 60% echo 0.6s later', A({ skEcho: 1 })), opt('Chain Reaction', 'Enemies you kill explode for 30 damage', A({ killBoom: 30 })), opt('Breach & Clear', '+40% damage for 4s after using your skill', A({ skBuff: 4 }))])
    ] },
    { id: 'bulw', name: 'BULWARK', col: '#b8c4d8', nodes: [
      stat('b_pl', 1, 'Plating', 5, 'Take 3% less damage per rank', A({ armor: 0.03 })),
      stat('b_rf', 1, 'Reinforced', 5, '+10 max HP per rank', (P, g) => { P.maxHp += 10; g.player.hp += 10; }),
      stat('b_rm', 2, 'Regen Mesh', 3, 'Regenerate 0.4 HP/s per rank', A({ regen: 0.4 })),
      choice('b_hd', 2, 'Hardened', [opt('Reactive Plating', 'When hit, release a 40-damage blast', A({ thorns: 40 })), opt('Kinetic Barrier', 'Block the first hit in every room', A({ shield: 1 })), opt('Stand Firm', '+20% damage while standing still', A({ stillDmg: 0.2 }))]),
      choice('b_ft', 3, 'Fortress', [opt('Last Stand', 'Below 30% HP you take 40% less damage', A({ lowArmor: 0.4 })), opt('Overshield Loop', 'Kills have a 6% chance to grant a shield charge', A({ killShield: 0.06 })), opt('Riot Frame', '+60 max HP, -8% move speed', (P, g) => { P.maxHp += 60; g.player.hp += 60; P.spd -= 0.08; })])
    ] },
    { id: 'cq', name: 'CLOSE QUARTERS', col: '#ffc27a', nodes: [
      stat('b_pb', 1, 'Point Blank', 5, '+6% damage to enemies within 110 per rank', A({ closeDmg: 0.06 })),
      stat('b_sc', 1, 'Slug Core', 1, 'Multi-pellet weapons pierce 1 enemy', A({ pelletPierce: 1 })),
      stat('b_kb', 2, 'Kickback', 3, '+25% knockback and +5% shotgun damage per rank', A({ knock: 0.25, dmg_shotgun: 0.05 })),
      choice('b_spec', 2, 'Specialist', [opt('Scattergun', '+25% shotgun damage', A({ dmg_shotgun: 0.25 })), opt('Ram Dash', 'Dashing through enemies deals 55 damage', A({ dashDmg: 55 })), opt('Stagger', 'Hits have an 8% chance to stun for 0.8s', A({ stunCh: 0.08 }))]),
      choice('b_dk', 3, 'Door Kicker', [opt('Executioner', '+50% damage to enemies under 30% HP', A({ exec: 0.5 })), opt('Shell Shock', 'Hits within 110 ignite enemies (synergy: Burning)', A({ closeIgnite: 1 })), opt('Bulldozer', 'Dashing stuns enemies you pass and deals 30 damage', A({ dashStun: 1, dashDmg: 30 }))])
    ] }
  ] },
  phantom: { skills: ['decoy', 'phasestrike', 'cloak'], branches: [
    { id: 'mark', name: 'MARKSMAN', col: '#8fe3ff', nodes: [
      stat('p_ls', 1, 'Long Shot', 5, '+6% damage to enemies farther than 170 per rank', A({ farDmg: 0.06 })),
      stat('p_pr', 1, 'Precision', 5, '+3% crit chance per rank', A({ crit: 0.03 })),
      stat('p_st', 2, 'Sniper Training', 3, '+10% sniper and +5% pistol damage per rank', A({ dmg_sniper: 0.10, dmg_pistol: 0.05 })),
      choice('p_ammo', 2, 'Special Ammo', [opt('Hollow Point', '+40% crit damage', A({ critDmg: 0.4 })), opt('Penetrator', 'Bullets pierce 1 more enemy (synergy: Piercing)', A({ pierce: 1 })), opt('Mark Target', 'Critical hits mark enemies: +25% damage taken for 6s', A({ critMark: 1 }))]),
      choice('p_ks', 3, 'Kill Shot', [opt('Assassinate', '+60% damage to enemies at full HP', A({ fullHpDmg: 0.6 })), opt('Headhunter', 'Critical kills cut 1s off the skill cooldown', A({ critKillSkill: 1 })), opt('Overwatch', '+30% crit chance while standing still', A({ stillCrit: 0.3 }))])
    ] },
    { id: 'shad', name: 'SHADOW', col: '#a65bff', nodes: [
      stat('p_am', 1, 'Ambusher', 5, 'Dashing primes an ambush: next shot deals x1.5, +0.4x per rank', A({ dashAmbush: 0.4 })),
      stat('p_lt', 1, 'Light Step', 5, 'Dash recharges 6% faster per rank', M({ dashCd: 0.94 })),
      stat('p_fd', 2, 'Fade', 3, '+0.06s dash invulnerability per rank', A({ dashI: 0.06 })),
      choice('p_ss', 2, 'Shadowcraft', [opt('Shadow Step', 'Dashes travel 40% farther', A({ dashLen: 0.4 })), opt('Backstab', 'Ambush shots stun the target for 1.2s', A({ ambStun: 1 })), opt('Vanish', 'Dashing makes enemies lose track of you for 1s', A({ dashCloak: 1 }))]),
      choice('p_nt', 3, 'Night Terror', [opt('Serial Ambush', 'Kills with an ambush shot instantly recharge your dash', A({ ambReset: 1 })), opt('Shadow Blades', 'Dashing through enemies deals 70 damage', A({ dashDmg: 70 })), opt('Lethal Grace', 'Ambush shots are always critical hits', A({ ambCrit: 1 }))])
    ] },
    { id: 'holo', name: 'HOLOGRAM', col: '#c78bff', skill: true, nodes: [
      stat('p_pj', 1, 'Projector', 5, 'Skill recharges 5% faster per rank', M({ skillCd: 0.95 })),
      stat('p_pe', 1, 'Persistence', 5, 'Skill effects last +0.4s per rank', A({ skDur: 0.4 })),
      stat('p_fl', 2, 'Feedback Loop', 3, '+8% skill power per rank', A({ skPow: 0.08 })),
      choice('p_aug', 2, 'Skill Augment', [AUG.mark, AUG.freeze, AUG.boom]),
      choice('p_mp', 3, 'Mirage Protocol', [opt('Holo Bomb', 'Decoys and cloaks end in a 130-damage blast', A({ decoyBoom: 130 })), opt('Double Image', 'Your skill also drops a decoy hologram (3s)', A({ skDecoy: 1 })), ECHO_CAST])
    ] }
  ] },
  overclock: { skills: ['redline', 'vent', 'bloodsurge'], branches: [
    { id: 'burn', name: 'BURNOUT', col: '#ff2a3d', nodes: [
      stat('o_ad', 1, 'Adrenaline', 5, 'Damage rises as HP drops: up to +12% per rank', A({ adren: 0.12 })),
      stat('o_tb', 1, 'Thick Blood', 5, '+10 max HP per rank', (P, g) => { P.maxHp += 10; g.player.hp += 10; }),
      stat('o_bl', 2, 'Bloodlust', 3, 'Heal 1 HP on every kill per rank', A({ vamp: 1 })),
      choice('o_rm', 2, 'Pain Engine', [opt('Red Mist', 'Below 50% HP: +20% fire rate', A({ lowRate: 0.2 })), opt('Second Wind', 'Once per run, survive a killing blow with 50% HP', A({ revive: 1 })), opt('Pain Battery', 'Taking damage cuts 1s off the skill cooldown', A({ hurtSkill: 1 }))]),
      choice('o_rl', 3, 'Redline Life', [opt('Deathwish', 'Adrenaline bonus is doubled', A({ adrenX: 1 })), opt('Vampire Core', 'Critical hits heal 2 HP (synergy: Vampiric)', A({ critHeal: 2 })), opt('Overdrive Heart', 'Below 30% HP your skill recharges twice as fast', A({ lowSkill: 1 }))])
    ] },
    { id: 'vel', name: 'VELOCITY', col: '#9dffb0', nodes: [
      stat('o_cr', 1, 'Cyclic Rate', 5, '+5% fire rate per rank', A({ fireRate: 0.05 })),
      stat('o_lt', 1, 'Light Trigger', 5, '+4% damage per rank', A({ dmg: 0.04 })),
      stat('o_sm', 2, 'Spray Control', 3, '+10% SMG and +5% pistol damage per rank', A({ dmg_smg: 0.10, dmg_pistol: 0.05 })),
      choice('o_ft', 2, 'Feed System', [opt('Echo Rounds', '15% chance each shot fires a free echo shot', A({ echo: 0.15 })), opt('Spin-Up', 'Fire rate builds +3%/s while shooting (max +30%)', A({ spinUp: 0.3 })), opt('Hollow Spray', 'Bullets pierce 1 more enemy', A({ pierce: 1 }))]),
      choice('o_bh', 3, 'Bullet Hose', [opt('Overcharged Barrel', 'Every 5th shot deals x3 (stacks with Overcharged)', A({ overAll: 1 })), opt('Ricochet Storm', 'All bullets bounce +1 time', A({ bounceAll: 1 })), opt('Lead Rain', '+35% fire rate, -10% damage', A({ fireRate: 0.35, dmg: -0.10 }))])
    ] },
    { id: 'melt', name: 'MELTDOWN', col: '#ff9a3c', skill: true, nodes: [
      stat('o_hs', 1, 'Heat Sink', 5, 'Skill recharges 5% faster per rank', M({ skillCd: 0.95 })),
      stat('o_ab', 1, 'Afterburn', 5, '+8% skill power per rank', A({ skPow: 0.08 })),
      stat('o_th', 2, 'Thermal', 3, 'Burning and explosions +10% per rank (synergy: Burning)', A({ burnMul: 0.10 })),
      choice('o_aug', 2, 'Skill Augment', [AUG.burn, AUG.haste, AUG.heal]),
      choice('o_cb', 3, 'Core Breach', [opt('Ignition', 'All hits have a 15% chance to ignite', A({ igniteCh: 0.15 })), SUPERCHARGE, opt('Burnout', 'Burning enemies explode on death for 40 damage', A({ burnBoom: 40 }))])
    ] }
  ] },
  daemon: { skills: ['turret', 'drones', 'logicbomb'], branches: [
    { id: 'net', name: 'NETWORK', col: '#39ff6a', skill: true, nodes: [
      stat('d_up', 1, 'Uptime', 5, 'Constructs (turrets, drones, mines) last 12% longer per rank', A({ turretLife: 0.12 })),
      stat('d_bw', 1, 'Bandwidth', 5, 'Constructs deal 8% more damage per rank', A({ turretDmg: 0.08 })),
      stat('d_cp', 2, 'Compiler', 3, 'Skill recharges 6% faster per rank', M({ skillCd: 0.94 })),
      choice('d_aug', 2, 'Skill Augment', [AUG.chain, AUG.shield, AUG.reset]),
      choice('d_bn', 3, 'Botnet', [opt('Dual Core', '+1 construct per cast (one more turret, drone or mine)', A({ skCount: 1 })), opt('Overclocked Bots', 'Constructs fire 50% faster', A({ turretRate: 0.5 })), opt('Uplink', '+20% fire rate while you have a construct out', A({ linkRate: 0.2 }))])
    ] },
    { id: 'pay', name: 'PAYLOAD', col: '#ffb070', nodes: [
      stat('d_dt', 1, 'Detonators', 5, 'Explosions deal 8% more damage per rank (synergy: Explosive, Crossbow)', A({ blastDmg: 0.08 })),
      stat('d_wa', 1, 'Wide Area', 5, 'Explosions +6% radius per rank', A({ blastR: 0.06 })),
      stat('d_cb', 2, 'Crossbow Rig', 3, '+10% crossbow and +5% pistol damage per rank', A({ dmg_crossbow: 0.10, dmg_pistol: 0.05 })),
      choice('d_vol', 2, 'Volatile Code', [opt('Volatile', 'Hits have a 10% chance to cause a small blast', A({ explodeCh: 0.10 })), opt('Shrapnel', 'Explosions slow enemies for 2s', A({ blastSlow: 1 })), opt('Firestarter', 'Explosions ignite enemies', A({ blastIgnite: 1 }))]),
      choice('d_lb', 3, 'Payload Delivery', [opt('Chain Reaction', 'Enemies you kill explode for 40 damage', A({ killBoom: 40 })), opt('Self-Destruct', 'Constructs explode for 120 when they expire', A({ turretBoom: 120 })), opt('Big Bang', 'Explosions +40% radius and +40% damage', A({ blastR: 0.4, blastDmg: 0.4 }))])
    ] },
    { id: 'fw', name: 'FIREWALL', col: '#7fd0ff', nodes: [
      stat('d_en', 1, 'Encryption', 5, 'Take 3% less damage per rank', A({ armor: 0.03 })),
      stat('d_rd', 1, 'Redundancy', 5, '+10 max HP per rank', (P, g) => { P.maxHp += 10; g.player.hp += 10; }),
      stat('d_pt', 2, 'Hotfix', 3, 'Regenerate 0.4 HP/s per rank', A({ regen: 0.4 })),
      choice('d_ice', 2, 'Intrusion Countermeasures', [opt('ICE Coat', 'Hits have a 10% chance to freeze (synergy: Freezing)', A({ freezeCh: 0.10 })), opt('Packet Shield', 'Block the first hit in every room', A({ shield: 1 })), opt('Honeypot', 'When hit, release a 35-damage blast', A({ thorns: 35 }))]),
      choice('d_kn', 3, 'Kernel', [opt('Self-Repair', 'Standing near your constructs heals 2 HP/s', A({ turretHeal: 2 })), opt('Failsafe', 'Once per run, survive a killing blow with 50% HP', A({ revive: 1 })), opt('Quarantine', 'Enemies within 90 of you are slowed by 30%', A({ auraSlow: 1 }))])
    ] }
  ] },
  blackout: { skills: ['orbital', 'napalm', 'barrage'], branches: [
    { id: 'therm', name: 'THERMITE', col: '#ff7a2a', nodes: [
      stat('k_tm', 1, 'Thermite', 5, 'Burning and explosive effects +10% per rank (synergy: Burning, Explosive)', A({ burnMul: 0.10 })),
      stat('k_ig', 1, 'Igniter', 5, 'Hits have a 3% chance to ignite per rank', A({ igniteCh: 0.03 })),
      stat('k_fa', 2, 'Fuel-Air', 3, 'Explosions +8% radius per rank', A({ blastR: 0.08 })),
      choice('k_wf', 2, 'Wildfire', [opt('Spreading Flames', 'Burning enemies spread fire to neighbours when they die', A({ burnSpread: 1 })), opt('Scorched Earth', 'Kills leave a patch of burning ground', A({ killPatch: 1 })), opt('Heatwave', '+20% damage to burning enemies', A({ burnVs: 0.2 }))]),
      choice('k_inf', 3, 'Inferno', [opt('Firestorm', 'All hits have +20% chance to ignite', A({ igniteCh: 0.2 })), opt('Burnout', 'Burning enemies explode on death for 45 damage', A({ burnBoom: 45 })), opt('White Phosphorus', 'Burn damage +60%', A({ burnMul: 0.6 }))])
    ] },
    { id: 'art', name: 'ARTILLERY', col: '#ffe81a', skill: true, nodes: [
      stat('k_sp', 1, 'Spotter', 5, 'Skill recharges 5% faster per rank', M({ skillCd: 0.95 })),
      stat('k_pl', 1, 'Payload', 5, '+8% skill power per rank', A({ skPow: 0.08 })),
      stat('k_lr', 2, 'Launcher Rig', 3, '+10% launcher and +5% pistol damage per rank', A({ dmg_launcher: 0.10, dmg_pistol: 0.05 })),
      choice('k_aug', 2, 'Skill Augment', [AUG.boom, AUG.pull, AUG.stun]),
      choice('k_dc', 3, 'Danger Close', [opt('Carpet Bombing', 'Skill fires one extra strike / line / volley', A({ skCount: 1 })), SUPERCHARGE, ECHO_CAST])
    ] },
    { id: 'fall', name: 'FALLOUT', col: '#b6ff5a', nodes: [
      stat('k_hz', 1, 'Hazmat', 5, 'Take 3% less damage per rank', A({ armor: 0.03 })),
      stat('k_rs', 1, 'Rad Shield', 5, '+10 max HP per rank', (P, g) => { P.maxHp += 10; g.player.hp += 10; }),
      stat('k_sv', 2, 'Salvage', 3, '+10% credits per rank', A({ credit: 0.10 })),
      choice('k_hl', 2, 'Half-Life', [opt('Irradiate', 'Explosions slow enemies for 2s', A({ blastSlow: 1 })), opt('Med Drop', 'Kills have a 5% chance to drop a heart', A({ killHeart: 0.05 })), opt('Iso Shield', 'Block the first hit in every room', A({ shield: 1 }))]),
      choice('k_gz', 3, 'Ground Zero', [opt('Nuclear Option', 'Explosions +40% radius and +40% damage', A({ blastR: 0.4, blastDmg: 0.4 })), opt('Rad Leech', 'Burn ticks on enemies heal you 0.3 HP', A({ burnHeal: 0.3 })), opt('Critical Mass', 'Explosions can critically hit', A({ blastCrit: 1 }))])
    ] }
  ] },
  glitch: { skills: ['reroll', 'blink', 'chaos'], branches: [
    { id: 'ent', name: 'ENTROPY', col: '#ff3df0', nodes: [
      stat('g_bf', 1, 'Bit Flip', 5, 'Picked-up weapons: +12% chance per rank to reroll an affix', A({ glitchPick: 0.12 })),
      stat('g_nz', 1, 'Noise', 5, 'Hits: +3% chance per rank to apply a random burn / freeze / shock', A({ chaosCh: 0.03 })),
      stat('g_us', 2, 'Unstable', 3, '+3% damage per affix on your weapon, per rank', A({ afxDmg: 0.03 })),
      choice('g_cd', 2, 'Corrupt Data', [opt('Hex Tolerance', 'Cursed penalty reduced by 25%', A({ curseRed: 0.25 })), opt('Chaos Rounds', '+10% random-status chance on hit', A({ chaosCh: 0.10 })), opt('Data Mine', '+30% weapon drop quality', A({ luck: 0.3 }))]),
      choice('g_ee', 3, 'Entropy Engine', [opt('Affix Storm', '+8% damage per affix on your weapon', A({ afxDmg: 0.08 })), opt('Glitched Pickup', 'Picked-up weapons gain a random extra affix (max 4)', A({ pickAfx: 1 })), opt('Wild Magic', '+20% random-status chance on hit', A({ chaosCh: 0.2 }))])
    ] },
    { id: 'luck', name: 'LUCK', col: '#ffd27a', nodes: [
      stat('g_ft', 1, 'Fortune', 5, '+10% weapon drop quality per rank', A({ luck: 0.10 })),
      stat('g_lc', 1, 'Lucky Shot', 5, '+3% crit chance per rank', A({ crit: 0.03 })),
      stat('g_jp', 2, 'Jackpot', 3, '+10% credits per rank', A({ credit: 0.10 })),
      choice('g_ex', 2, 'House Edge', [opt('Extra Option', 'Perk offers show 1 more choice', A({ extraPerk: 1 })), opt('Loaded Dice', '+2 perk rerolls', (P, g) => { g.rerolls += 2; }), opt('Insurance', 'Once per run, survive a killing blow with 50% HP', A({ revive: 1 }))]),
      choice('g_rg', 3, 'Rigged Game', [opt('Snake Eyes', '+10% crit chance and +60% crit damage', A({ crit: 0.1, critDmg: 0.6 })), opt('High Roller', 'Rare and epic perks show up far more often', A({ luck: 1.0, perkLuck: 1 })), opt('Double Down', '20% chance each shot fires a free echo shot', A({ echo: 0.2 }))])
    ] },
    { id: 'cor', name: 'CORRUPTION', col: '#c78bff', skill: true, nodes: [
      stat('g_ok', 1, 'Overclock Kernel', 5, 'Skill recharges 5% faster per rank', M({ skillCd: 0.95 })),
      stat('g_cr', 1, 'Corruption', 5, '+8% skill power per rank', A({ skPow: 0.08 })),
      stat('g_pl', 2, 'Packet Loss', 3, 'Skill effects last +0.3s per rank', A({ skDur: 0.3 })),
      choice('g_aug', 2, 'Skill Augment', [AUG.freeze, AUG.chain, AUG.nova]),
      choice('g_sf', 3, 'Segfault', [ECHO_CAST, opt('Crash Dump', 'Skill cooldown -30%', M({ skillCd: 0.7 })), opt('Blue Screen', 'Your skill also stuns every enemy within 180 for 1.5s', A({ skStunAll: 1 }))])
    ] }
  ] }
};
const NODE_BY_ID = {};
for (const cid in TREES) TREES[cid].branches.forEach(b => b.nodes.forEach(n => { n.branch = b.id; n.cls = cid; NODE_BY_ID[n.id] = n; }));

// ---------------------------------------------------------------- state helpers (seat context)
function treeOf(g) { return TREES[(g || G).P.cls] || TREES.runner; }
function branchPts(g, bid) { let s = 0; const T = treeOf(g); const b = T.branches.find(x => x.id === bid); if (b) b.nodes.forEach(n => { s += g.tree[n.id] || 0; }); return s; }
function totalSpent(g) { let s = g.skill ? 1 : 0; for (const k in g.tree) s += g.tree[k]; return s; }
function nodeState(g, n) {             // 'max' | 'open' | 'locked' | 'noskill'
  const r = g.tree[n.id] || 0;
  if (r >= n.max) return 'max';
  if (!g.skill) return 'noskill';
  if (branchPts(g, n.branch) < TIER_REQ[n.tier]) return 'locked';
  return 'open';
}
function canSpend(g, n) { return g.pts > 0 && nodeState(g, n) === 'open'; }
function gainXp(v) {
  const g = G; if (!g || v <= 0 || !g.lvl) return;
  g.xp += v;
  let up = 0;
  while (g.xp >= xpNeed(g.lvl)) { g.xp -= xpNeed(g.lvl); g.lvl++; g.pts++; up++; }
  if (up) {
    g.lvlT = 2.6; const p = g.player;
    if (p) { ring(p.x, p.y, 46, '#ffe066', 0.5); burst(p.x, p.y, 16, '#ffe066', 140, 3, 0.6); addNum(p.x, p.y - 28, 'LEVEL ' + g.lvl, '#ffe066', 15); }
    sfx('lvl', 660, 0.35, 'triangle', 0.06, 2);
  }
}
// spend a point: skill pick (node 'skill', opt = variant index) or a tree node (opt = option index for choice nodes)
function spendNode(id, o) {
  const g = G; if (!g || g.pts <= 0) return false;
  const T = treeOf(g);
  if (id === 'skill') {
    if (g.skill) return false;
    const sid = T.skills[o | 0]; if (!sid) return false;
    g.skill = sid; g.pts--; const p = g.player; p.skillT = 0; p.skillMax = skillMaxCd();
    g.banner = { text: 'SKILL UNLOCKED', sub: SKILL_DEFS[sid].name + ' · ' + SKILL_DEFS[sid].desc, t: 2.4, col: g.C.color };
    sfx('perk', 520, 0.3, 'triangle', 0.07, 2); return true;
  }
  const n = NODE_BY_ID[id]; if (!n || n.cls !== g.P.cls || !canSpend(g, n)) return false;
  if (n.kind === 'choice') { const op = n.opts[o | 0]; if (!op) return false; g.choice[n.id] = o | 0; op.fx(g.P, g); }
  else n.fx(g.P, g);
  g.tree[n.id] = (g.tree[n.id] || 0) + 1; g.pts--;
  if (g.player.hp > g.P.maxHp) g.player.hp = g.P.maxHp;
  sfx('perk', 560, 0.2, 'triangle', 0.06, 1.8);
  return true;
}
function skillDef(g) { g = g || G; return g.skill ? SKILL_DEFS[g.skill] : null; }

// ---------------------------------------------------------------- skills
function skillPow() { return 1 + (G.P.skPow || 0); }
function castSkill(id, again) {
  const g = G, p = g.player, P = g.P, w = p.slots[p.active], k = skillPow(), dur = P.skDur || 0, extra = P.skCount || 0;
  let cx = p.x, cy = p.y;
  const nearest = (maxD, from) => { from = from || p; let b = null, bd = maxD || 1e9; g.enemies.forEach(e => { if (e.dead || e.spawnT > 0 || e.invuln) return; const d = dist(e, from); if (d < bd) { bd = d; b = e; } }); return b; };
  const cluster = () => { let best = null, bs = 0; g.enemies.forEach(e => { if (e.dead || e.spawnT > 0) return; let sc = 0; g.enemies.forEach(o => { if (!o.dead && o.spawnT <= 0 && Math.hypot(o.x - e.x, o.y - e.y) < 70) sc += o.boss ? 8 : 1; }); if (sc > bs) { bs = sc; best = e; } }); return best; };
  switch (id) {
    case 'overload': {
      const nn = 16 + 4 * extra;
      fireWeapon(w, p.aim, { pellets: nn, fan: TAU / nn, dmgMul: 0.75 * k });
      p.dashCd = 0; p.haste = Math.max(p.haste, 3 + dur); ring(p.x, p.y, 70, '#19f0ff', 0.4); ring(p.x, p.y, 40, '#fff', 0.25); burst(p.x, p.y, 18, '#19f0ff', 160, 3, 0.5);
      addNum(p.x, p.y - 22, 'OVERLOAD', '#19f0ff', 13); break; }
    case 'afterburn': p.boost = Math.max(p.boost || 0, (4 + dur) * Math.sqrt(k)); p.dashCd = 0; p.iframes = Math.max(p.iframes, 0.4); ring(p.x, p.y, 50, '#5ff0d0', 0.4); burst(p.x, p.y, 20, '#5ff0d0', 160, 3, 0.5); addNum(p.x, p.y - 22, 'AFTERBURNER', '#5ff0d0', 13); break;
    case 'fanhammer': {
      const n = 3 + extra;
      for (let i = 0; i < n; i++) g.timers.push({ t: i * 0.14, fn: () => { if (G !== g || !p.slots[p.active]) return; fireWeapon(p.slots[p.active], p.aim, { pellets: 5, fan: 0.12, dmgMul: 0.9 * k }); } });
      addNum(p.x, p.y - 22, 'FAN THE HAMMER', '#ffe066', 12); break; }
    case 'shockwave': {
      const bk = Math.sqrt(k); explode(p.x, p.y, 90 * bk, (40 + w.dmg * 3) * (1 + P.dmg) * k, '#ff8a1f', false); ring(p.x, p.y, 100, '#fff', 0.3); ring(p.x, p.y, 60, '#ff8a1f', 0.35);
      g.enemies.forEach(e => { const d = Math.max(1, dist(e, p)); if (d < 125 * bk && !e.dead) { if (!e.boss) { e.vx += (e.x - p.x) / d * 420; e.vy += (e.y - p.y) / d * 420; } e.stun = (e.boss ? 0.7 : 1.7) + dur * 0.5; } });
      g.ebullets = g.ebullets.filter(b => Math.hypot(b.x - p.x, b.y - p.y) > 115 * bk); break; }
    case 'charge': {
      let dx = g.mvx, dy = g.mvy; if (Math.hypot(dx, dy) < 0.1) { const t0 = nearest(400); if (t0) { dx = t0.x - p.x; dy = t0.y - p.y; } else { dx = Math.cos(p.face); dy = Math.sin(p.face); } }
      const l = Math.hypot(dx, dy) || 1; p.dashDx = dx / l; p.dashDy = dy / l; p.dashT = 0.32 + 0.04 * extra; p.chargeT = p.dashT; p.iframes = Math.max(p.iframes, p.dashT + 0.2); p.dashHit = []; p.chargeDmg = (60 + w.dmg * 2.5) * (1 + P.dmg) * k;
      addNum(p.x, p.y - 22, 'BREACH!', '#ff8a1f', 13); break; }
    case 'vortex': {
      const tg = cluster() || nearest(260); const a = p.aim; cx = tg ? tg.x : p.x + Math.cos(a) * 120; cy = tg ? tg.y : p.y + Math.sin(a) * 120;
      const q = { x: cx, y: cy }; resolveCircle(q, 4); cx = q.x; cy = q.y; const R = 150 * Math.sqrt(k), X = cx, Y = cy;
      g.fx.push({ t: 'target', x: X, y: Y, r: R * 0.6, life: 1.3, m: 1.3 });
      for (let i = 0; i < 8; i++) g.timers.push({ t: 0.25 + i * 0.12, fn: () => { g.enemies.forEach(e => { if (e.dead || e.boss || e.fixed) return; const d = Math.hypot(e.x - X, e.y - Y); if (d < R && d > 6) { e.vx += (X - e.x) / d * 160; e.vy += (Y - e.y) / d * 160; } }); ring(X, Y, R * (1 - i / 9), '#ff8a1f', 0.2); } });
      g.timers.push({ t: 1.35, fn: () => { explode(X, Y, 95 * Math.sqrt(k), (70 + w.dmg * 3) * (1 + P.dmg) * k, '#ff8a1f', false); shake(8); } });
      break; }
    case 'decoy': { g.decoys = g.decoys.filter(d => d.kind !== 'decoy'); const dl = (5 + dur) * Math.sqrt(k); g.decoys.push({ x: p.x, y: p.y, life: dl, max: dl, face: p.face, kind: 'decoy' }); p.ambush = true; p.ambushT = dl; p.ambMul = Math.max(p.ambMul || 0, 3);
      ring(p.x, p.y, 40, '#a65bff', 0.4); burst(p.x, p.y, 16, '#a65bff', 90, 3, 0.6); addNum(p.x, p.y - 22, 'DECOY', '#c58bff', 13); break; }
    case 'phasestrike': {
      const tg = nearest(320); if (!tg) { addNum(p.x, p.y - 20, 'NO TARGET', '#c58bff', 11); return false; }
      const a = Math.atan2(tg.y - p.y, tg.x - p.x); ring(p.x, p.y, 30, '#a65bff', 0.3); burst(p.x, p.y, 12, '#a65bff', 120, 3, 0.4);
      p.x = tg.x + Math.cos(a) * (tg.r + 16); p.y = tg.y + Math.sin(a) * (tg.r + 16); resolveCircle(p, p.r); p.iframes = Math.max(p.iframes, 0.5);
      for (let i = 0; i < 1 + extra; i++) { const t2 = i === 0 ? tg : nearest(140); if (t2) { dealDamage(t2, (80 + w.dmg * 4) * (1 + P.dmg) * k * P.critDmg, true, '#c58bff'); ring(t2.x, t2.y, 30, '#fff', 0.25); } }
      p.ambush = true; p.ambushT = 3.5; p.ambMul = Math.max(p.ambMul || 0, 2.5); cx = p.x; cy = p.y; addNum(p.x, p.y - 22, 'PHASE STRIKE', '#c58bff', 12); break; }
    case 'cloak': { const dl = (4 + dur) * Math.sqrt(k); p.cloak = dl; p.boost = Math.max(p.boost || 0, dl); p.boostK = 0.3; g.decoys = g.decoys.filter(d => d.kind !== 'cloak'); g.decoys.push({ x: p.x, y: p.y, life: dl, max: dl, face: p.face, kind: 'cloak', hidden: true });
      p.ambush = true; p.ambushT = dl; p.ambMul = Math.max(p.ambMul || 0, 3); ring(p.x, p.y, 40, '#a65bff', 0.4); addNum(p.x, p.y - 22, 'CLOAK', '#c58bff', 13); break; }
    case 'redline': { const rc = 15; p.overdrive = (5 + dur) * Math.sqrt(k); p.hp = Math.max(1, p.hp - rc); addNum(p.x, p.y - 20, '-' + rc, '#ff5a6e', 13); addNum(p.x, p.y - 34, 'REDLINE', '#ff2a3d', 13); ring(p.x, p.y, 50, '#ff2a3d', 0.4); g.flash = Math.max(g.flash, 0.1); break; }
    case 'vent': { p.hp = Math.max(1, p.hp - 8); addNum(p.x, p.y - 20, '-8', '#ff5a6e', 12); const R = 110 * Math.sqrt(k); explode(p.x, p.y, R, (55 + w.dmg * 3) * (1 + P.dmg) * k, '#ff5a1a', true); ring(p.x, p.y, R + 20, '#ffe066', 0.4);
      for (let i = 0; i < 1 + extra; i++) g.timers.push({ t: 0.5 + i * 0.5, fn: () => explode(p.x, p.y, R * 0.7, (30 + w.dmg * 2) * (1 + P.dmg) * k, '#ff5a1a', true) });
      g.ebullets = g.ebullets.filter(b => Math.hypot(b.x - p.x, b.y - p.y) > R * 0.8); break; }
    case 'bloodsurge': p.surge = (5 + dur) * Math.sqrt(k); ring(p.x, p.y, 50, '#ff2a3d', 0.4); burst(p.x, p.y, 18, '#ff4d6d', 140, 3, 0.5); addNum(p.x, p.y - 22, 'BLOODSURGE', '#ff4d6d', 13); break;
    case 'turret': {
      for (let i = 0; i <= extra; i++) { const life = 14 * (1 + (P.turretLife || 0)), a = i * 2.1;
        g.turrets.push({ kind: 'turret', x: p.x + (i ? Math.cos(a) * 26 : 0), y: p.y + (i ? Math.sin(a) * 26 : 0), life, max: life, cd: 0.4, w: cloneWeapon(w, 0.6 * k * (1 + (P.turretDmg || 0))), aim: p.aim, spawn: 0.3 }); }
      const own = g.turrets.filter(t => t.kind === 'turret'); while (own.length > 2 + extra) { const o = own.shift(); g.turrets.splice(g.turrets.indexOf(o), 1); }
      ring(p.x, p.y, 36, '#39ff6a', 0.4); burst(p.x, p.y, 12, '#39ff6a', 80, 3, 0.5); break; }
    case 'drones': {
      g.turrets = g.turrets.filter(t => t.kind !== 'drone'); const n = 2 + extra, life = (9 + dur) * (1 + (P.turretLife || 0));
      for (let i = 0; i < n; i++) g.turrets.push({ kind: 'drone', x: p.x, y: p.y, ph: i / n * TAU, life, max: life, cd: 0.3 + i * 0.15, w: cloneWeapon(w, 0.38 * k * (1 + (P.turretDmg || 0))), aim: p.aim, spawn: 0.2, owner: p });
      ring(p.x, p.y, 40, '#39ff6a', 0.4); addNum(p.x, p.y - 22, 'DRONES', '#39ff6a', 13); break; }
    case 'logicbomb': {
      const n = 4 + extra, life = 12 * (1 + (P.turretLife || 0));
      for (let i = 0; i < n; i++) { const a = i / n * TAU + rnd(-0.3, 0.3), q = { x: p.x + Math.cos(a) * rnd(40, 70), y: p.y + Math.sin(a) * rnd(40, 70) }; resolveCircle(q, 6);
        g.turrets.push({ kind: 'mine', x: q.x, y: q.y, life, max: life, cd: 0.5, aim: 0, spawn: 0.5, dmg: (50 + w.dmg * 2.2) * (1 + P.dmg) * k * (1 + (P.turretDmg || 0)), R: 70 * Math.sqrt(k) }); }
      const mines = g.turrets.filter(t => t.kind === 'mine'); while (mines.length > 12) { const o = mines.shift(); g.turrets.splice(g.turrets.indexOf(o), 1); }
      ring(p.x, p.y, 70, '#39ff6a', 0.4); break; }
    case 'orbital': {
      const best = cluster(); if (!best) { addNum(p.x, p.y - 20, 'NO TARGETS', '#ffe81a', 11); return false; }
      const tx = best.x, ty = best.y, sr = 82 * Math.sqrt(k); cx = tx; cy = ty;
      for (let sI = 0; sI <= extra; sI++) {
        const dly = 0.9 + sI * 0.8;
        g.timers.push({ t: dly - 0.9, fn: () => g.fx.push({ t: 'target', x: tx, y: ty, r: sr - 2, life: 0.9, m: 0.9 }) });
        g.timers.push({ t: dly, fn: () => { explode(tx, ty, sr, 170 * (1 + P.dmg) * k, '#ffe81a', true); ring(tx, ty, sr + 18, '#fff', 0.4); ring(tx, ty, sr - 12, '#ffe81a', 0.5); burst(tx, ty, 40, '#ffe81a', 260, 4, 0.8); shake(10); g.fx.push({ t: 'beam', x: tx, y: ty, life: 0.35, m: 0.35 }); } });
      }
      break; }
    case 'napalm': {
      const tg = nearest(400); const a = tg ? Math.atan2(tg.y - p.y, tg.x - p.x) : p.aim; const n = 7 + 2 * extra;
      for (let i = 0; i < n; i++) g.timers.push({ t: i * 0.05, fn: () => { const x = p.x + Math.cos(a) * (24 + i * 30), y = p.y + Math.sin(a) * (24 + i * 30); if (wallAt(x, y, 0)) return; addPatch(x, y, 24 * Math.sqrt(k), 4 + dur, (28 + w.dmg) * (1 + P.dmg) * k * 4); explode(x, y, 30, (18 + w.dmg) * (1 + P.dmg) * k, '#ff7a2a', true); } });
      cx = p.x + Math.cos(a) * 100; cy = p.y + Math.sin(a) * 100; break; }
    case 'barrage': {
      const live = g.enemies.filter(e => !e.dead && e.spawnT <= 0); if (!live.length) { addNum(p.x, p.y - 20, 'NO TARGETS', '#ffe81a', 11); return false; }
      const n = 6 + 2 * extra;
      for (let i = 0; i < n; i++) { const e = pick(live), tx = e.x + rnd(-14, 14), ty = e.y + rnd(-14, 14), sr = 50 * Math.sqrt(k);
        g.timers.push({ t: i * 0.15, fn: () => g.fx.push({ t: 'target', x: tx, y: ty, r: sr, life: 0.55, m: 0.55 }) });
        g.timers.push({ t: i * 0.15 + 0.55, fn: () => { explode(tx, ty, sr, 70 * (1 + P.dmg) * k, '#ffe81a', i % 2 === 0); g.fx.push({ t: 'beam', x: tx, y: ty, life: 0.25, m: 0.25 }); } }); }
      break; }
    case 'reroll': rerollWeapon(w, true); showWeaponToast(w, 'Rerolled'); addNum(p.x, p.y - 20, 'REROLL', '#ff3df0', 13); ring(p.x, p.y, 50, '#ff3df0', 0.4); burst(p.x, p.y, 20, '#ff3df0', 140, 3, 0.6); break;
    case 'blink': {
      const ox = p.x, oy = p.y; fireWeapon(w, 0, { pellets: 14, fan: TAU / 14, dmgMul: 0.6 * k, from: { x: ox, y: oy } }); ring(ox, oy, 50, '#ff3df0', 0.4); burst(ox, oy, 20, '#ff3df0', 140, 3, 0.5);
      let best = null, bs = -1; for (let i = 0; i < 24; i++) { const a = rnd(0, TAU), d = rnd(90, 170) * Math.sqrt(k), x = ox + Math.cos(a) * d, y = oy + Math.sin(a) * d; if (wallAt(x, y, p.r + 2)) continue; let m = 1e9; g.enemies.forEach(e => { if (!e.dead) m = Math.min(m, Math.hypot(e.x - x, e.y - y)); }); if (m > bs) { bs = m; best = { x, y }; } }
      if (best) { p.x = best.x; p.y = best.y; } p.iframes = Math.max(p.iframes, 0.6 + dur * 0.3); ring(p.x, p.y, 40, '#19f0ff', 0.4); break; }
    case 'chaos': {
      const R = 230 * Math.sqrt(k); ring(p.x, p.y, R, '#ff3df0', 0.5);
      g.enemies.forEach(e => { if (e.dead || e.spawnT > 0 || Math.hypot(e.x - p.x, e.y - p.y) > R) return; chaosProc(e, (30 + w.dmg * 2) * (1 + P.dmg) * k, 3 + dur); });
      addNum(p.x, p.y - 22, 'CHAOS FIELD', '#ff3df0', 13); break; }
    default: return false;
  }
  if (!again) onSkillCast(cx, cy, id);
  return true;
}
function chaosProc(e, dmg, t) {
  const r = Math.random();
  if (r < 0.34) { igniteEnemy(e, dmg); addNum(e.x, e.y - e.r - 8, 'BURN', '#ff9a3c', 9); }
  else if (r < 0.67) { e.slow = Math.max(e.slow || 0, t || 2); addNum(e.x, e.y - e.r - 8, 'FREEZE', '#8fe3ff', 9); }
  else chainFrom(e, { dmg, w: { fx: {} } }, 2);
}
// augments + capstone hooks that fire on every skill use
function onSkillCast(x, y, id) {
  const g = G, p = g.player, P = g.P, w = p.slots[p.active], k = skillPow();
  if (P.augNova && w) fireWeapon(w, 0, { pellets: 12, fan: TAU / 12, dmgMul: 0.6, from: { x, y } });
  if (P.augHaste) p.haste = Math.max(p.haste, 3);
  if (P.augShield) { g.shield = Math.min(2, g.shield + 1); ring(p.x, p.y, 30, '#7fd0ff', 0.4); }
  if (P.augPull) g.enemies.forEach(e => { if (e.dead || e.boss || e.fixed) return; const d = Math.hypot(e.x - x, e.y - y); if (d < 160 && d > 8) { e.vx += (x - e.x) / d * 380; e.vy += (y - e.y) / d * 380; } });
  if (P.augBurn) for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; addPatch(x + Math.cos(a) * 46, y + Math.sin(a) * 46, 18, 3.5, 40 * k); }
  if (P.augStun) g.enemies.forEach(e => { if (!e.dead && Math.hypot(e.x - x, e.y - y) < 120) e.stun = Math.max(e.stun || 0, e.boss ? 0.5 : 1.2); });
  if (P.augMark) g.enemies.forEach(e => { if (!e.dead && Math.hypot(e.x - x, e.y - y) < 170) e.mark = 6; });
  if (P.augFreeze) g.enemies.forEach(e => { if (!e.dead && Math.hypot(e.x - x, e.y - y) < 150) e.slow = Math.max(e.slow || 0, 3); });
  if (P.augBoom) explode(x, y, 90, 80 * k * (1 + P.dmg), '#ffb070', false);
  if (P.augChain) { const src = { x, y, dead: false }; chainFrom(src, { dmg: 60 * k * (1 + P.dmg), w: { fx: {} } }, 5); }
  if (P.augHeal) { const h = Math.round(P.maxHp * 0.12); p.hp = Math.min(P.maxHp, p.hp + h); addNum(p.x, p.y - 30, '+' + h, '#6bff8a', 12); }
  if (P.skStunAll) g.enemies.forEach(e => { if (!e.dead && Math.hypot(e.x - p.x, e.y - p.y) < 180) e.stun = Math.max(e.stun || 0, e.boss ? 0.6 : 1.5); });
  if (P.skBuff) p.skBuffT = P.skBuff;
  if (P.skChain) p.skChainT = P.skChain;
  if (P.skDecoy && id !== 'decoy') g.decoys.push({ x: p.x, y: p.y, life: 3, max: 3, face: p.face, kind: 'mini' });
  if (P.skEcho) g.timers.push({ t: 0.6, fn: () => { if (G === g && !g.over) { const sp = P.skPow; P.skPow = (P.skPow || 0) - 0.4; castSkill(id, true); P.skPow = sp; } } });
  if (P.skTwice && Math.random() < P.skTwice) g.timers.push({ t: 0.35, fn: () => { if (G === g && !g.over) { castSkill(id, true); addNum(p.x, p.y - 36, 'ECHO', '#fff', 11); } } });
}

// ---------------------------------------------------------------- UI: Tree tab + skill choice
const NODE_ROW = 44;
function drawSkillChoice(x, y, W, H, interactive) {
  const g = G, T = treeOf(g), C = g.C, n = 3, gap = 8;
  const can = interactive && g.pts > 0;
  txt(can ? 'CHOOSE YOUR SKILL (1 OF 3)' : 'SKILL LOCKED · reach level 2 to choose 1 of 3 skills', x + W / 2, y + 10, can ? 13 : 11, can ? '#ffe066' : '#9aa4bd', 'center', '900');
  const top = y + 24;
  if (land) {
    const cw = (W - gap * 2) / 3, ch = Math.min(H - 28, 170);
    T.skills.forEach((sid, i) => skillCard(sid, i, x + i * (cw + gap), top, cw, ch, can, C));
  } else {
    const ch = Math.min(110, (H - 28 - gap * 2) / 3);
    T.skills.forEach((sid, i) => skillCard(sid, i, x, top + i * (ch + gap), W, ch, can, C));
  }
}
function skillCard(sid, i, x, y, w, h, can, C) {
  const S = SKILL_DEFS[sid];
  if (can) hot.push({ x, y: y + hotOff, w, h, fn: () => spendNode('skill', i), label: 'skill' + i });
  rr(x, y, w, h, 12); ctx.fillStyle = 'rgba(6,9,22,0.94)'; ctx.fill(); if (can) nstroke(C.color, 1.8); else { ctx.lineWidth = 1; ctx.strokeStyle = hexA(C.color, 0.4); ctx.stroke(); }
  fitTxt(S.name.toUpperCase(), x + 12, y + 18, w - 70, 15, can ? '#fff' : '#9aa4bd', 'left', '900');
  txt(S.cd + 's', x + w - 12, y + 18, 11, C.color, 'right', '800', false);
  wrapLines(S.desc, w - 24, 11, '600').slice(0, Math.max(1, Math.floor((h - 32) / 13))).forEach((l, k) => txt(l, x + 12, y + 38 + k * 13, 11, '#aebbd8', 'left', '600', false));
  if (can) pill(x + w - 70, y + h - 24, 60, 17, 'UNLOCK', C.color, 9.5, true);
}
function drawTreeTab(x, y, W, H) {
  const g = G, T = treeOf(g), C = g.C;
  if (g.treeBr == null) g.treeBr = 0;
  // header: level, xp bar, points
  const need = xpNeed(g.lvl), f = clamp(g.xp / need, 0, 1);
  rr(x, y, W, 34, 9); ctx.fillStyle = 'rgba(6,9,22,0.85)'; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = hexA(C.color, 0.5); ctx.stroke();
  txt('LVL ' + g.lvl, x + 10, y + 12, 13, '#ffe066', 'left', '900', false);
  rr(x + 10, y + 22, W * 0.3, 6, 3); ctx.fillStyle = '#1a1f33'; ctx.fill(); if (f > 0) { rr(x + 10, y + 22, Math.max(6, W * 0.3 * f), 6, 3); ctx.fillStyle = '#ffe066'; ctx.fill(); }
  txt(Math.floor(g.xp) + ' / ' + need + ' XP', x + 16 + W * 0.3, y + 25, 9.5, '#9aa4bd', 'left', '700', false);
  const sk = skillDef(g);
  txt(g.pts > 0 ? g.pts + ' POINT' + (g.pts > 1 ? 'S' : '') + ' TO SPEND' : 'NO POINTS', x + W - 10, y + 12, 12, g.pts > 0 ? '#39ff6a' : '#8a93ab', 'right', '900', false);
  fitTxt(sk ? 'SKILL: ' + sk.name : 'SKILL: locked', x + W - 10, y + 26, W * 0.42, 10, sk ? C.color : '#8a93ab', 'right', '800');
  const top = y + 42;
  if (!g.skill) { drawSkillChoice(x, top, W, y + H - top, true); return; }
  // branch selector
  const bw = (W - 12) / 3;
  T.branches.forEach((b, i) => { const pts = branchPts(g, b.id), on = g.treeBr === i;
    hot.push({ x: x + i * (bw + 6), y: top + hotOff, w: bw, h: 30, fn: () => { g.treeBr = i; g.treeSel = null; g.scrollY = 0; }, label: 'branch' + i });
    rr(x + i * (bw + 6), top, bw, 30, 9); ctx.fillStyle = on ? hexA(b.col, 0.25) : 'rgba(6,9,22,0.85)'; ctx.fill(); if (on) nstroke(b.col, 1.6); else { ctx.lineWidth = 1; ctx.strokeStyle = hexA(b.col, 0.45); ctx.stroke(); }
    fitTxt(b.name + ' · ' + pts, x + i * (bw + 6) + bw / 2, top + 15.5, bw - 8, 11.5, on ? '#fff' : b.col, 'center', '900'); });
  const br = T.branches[g.treeBr], ly = top + 38, LH2 = y + H - ly;
  // rows (scrollable)
  const rows = []; let cur = 0;
  br.nodes.forEach(n => { if (n.tier !== cur) { cur = n.tier; rows.push({ hdr: n.tier }); } rows.push({ n }); });
  const rowH = r => r.hdr ? 18 : r.n.id === g.treeSel ? nodeExpH(r.n, W) : NODE_ROW;
  const total = rows.reduce((s, r) => s + rowH(r) + 4, 0);
  g.scrollMax = Math.max(0, total - LH2); g.scrollY = clamp(g.scrollY || 0, 0, g.scrollMax);
  ctx.save(); ctx.beginPath(); ctx.rect(x, ly, W, LH2); ctx.clip();
  let yy = ly - g.scrollY; const bp = branchPts(g, br.id);
  rows.forEach(r => {
    const h = rowH(r);
    if (yy + h >= ly && yy <= ly + LH2) {
      if (r.hdr) { const req = TIER_REQ[r.hdr], ok = bp >= req; txt('TIER ' + r.hdr + (req ? (ok ? '  ·  unlocked' : '  ·  needs ' + req + ' points in ' + br.name + ' (' + bp + '/' + req + ')') : ''), x + 4, yy + 9, 10, ok ? br.col : '#6f7890', 'left', '800', false); }
      else drawNodeRow(r.n, x, yy, W, h, br, ly, LH2);
    }
    yy += h + 4;
  });
  ctx.restore();
  if (g.scrollMax > 0) { const bh = Math.max(24, LH2 * LH2 / total), by = ly + (LH2 - bh) * (g.scrollY / g.scrollMax); rr(x + W - 3, by, 3, bh, 1.5); ctx.fillStyle = hexA(br.col, 0.6); ctx.fill(); }
}
function nodeExpH(n, W) { const lines = wrapLines(n.desc || '', W - 24, 10.5, '600').length; return n.kind === 'choice' ? 34 + 3 * 46 : 52 + lines * 13 + 40; }
function drawNodeRow(n, x, y, W, h, br, clipY, clipH) {
  const g = G, st = nodeState(g, n), r = g.tree[n.id] || 0, sel = g.treeSel === n.id, can = canSpend(g, n);
  const col = st === 'locked' || st === 'noskill' ? '#5a6280' : br.col;
  const vis = (yy, hh) => yy + hh > clipY && yy < clipY + clipH;
  const hp = (hx, hy, hw, hh, fn, label) => { if (!vis(hy, hh)) return; const y0 = Math.max(hy, clipY), y1 = Math.min(hy + hh, clipY + clipH); hot.push({ x: hx, y: y0 + hotOff, w: hw, h: y1 - y0, fn, label }); };
  hp(x, y, W, NODE_ROW, () => { g.treeSel = sel ? null : n.id; }, 'node:' + n.id);
  rr(x, y, W, h, 10); ctx.fillStyle = sel ? 'rgba(16,22,44,0.96)' : 'rgba(6,9,22,0.88)'; ctx.fill();
  if (can) nstroke(col, sel ? 2 : 1.4, 0.6 + 0.4 * Math.sin(performance.now() / 250)); else { ctx.lineWidth = 1.1; ctx.strokeStyle = hexA(col, st === 'max' ? 0.9 : 0.5); ctx.stroke(); }
  // icon: diamond for choice, square for stat
  ctx.save(); ctx.translate(x + 20, y + NODE_ROW / 2); if (n.kind === 'choice') ctx.rotate(Math.PI / 4); ctx.beginPath(); ctx.rect(-9, -9, 18, 18); ctx.fillStyle = r ? hexA(col, 0.6) : 'rgba(0,0,0,0.5)'; ctx.fill(); nstroke(col, 1.3); ctx.restore();
  if (st === 'locked' || st === 'noskill') txt('🔒', x + 20, y + NODE_ROW / 2 + 1, 10, '#fff', 'center', '700', false);
  const rankTxt = n.kind === 'choice' ? (r ? 'CHOSEN' : 'PICK 1 OF 3') : r + '/' + n.max;
  fitTxt(n.name, x + 38, y + 15, W - 130, 13, st === 'locked' ? '#8a93ab' : '#fff', 'left', '800');
  txt(rankTxt, x + W - 10, y + 15, 10.5, st === 'max' ? '#39ff6a' : can ? '#ffe066' : '#8a93ab', 'right', '900', false);
  const sub = n.kind === 'choice' ? (r ? n.opts[g.choice[n.id]].name + ': ' + n.opts[g.choice[n.id]].desc : n.opts.map(o => o.name).join(' / ')) : n.desc;
  fitTxt(sub, x + 38, y + 31, W - 50, 10, n.kind === 'choice' && r ? br.col : '#9aa4bd', 'left', '600');
  if (!sel) return;
  // expanded tooltip
  let yy = y + NODE_ROW;
  const lockMsg = st === 'noskill' ? 'Choose your skill first' : st === 'locked' ? 'Locked: spend ' + TIER_REQ[n.tier] + ' points in ' + br.name + ' to unlock tier ' + n.tier : st === 'max' ? 'Maxed' : g.pts <= 0 ? 'No skill points: level up by killing enemies' : '';
  if (n.kind === 'choice') {
    n.opts.forEach((o, i) => {
      const oy = yy + i * 46, chosen = r && g.choice[n.id] === i, ok = can;
      rr(x + 8, oy, W - 16, 40, 8); ctx.fillStyle = chosen ? hexA(br.col, 0.3) : 'rgba(3,5,14,0.9)'; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = hexA(br.col, chosen || ok ? 0.9 : 0.3); ctx.stroke();
      fitTxt(o.name, x + 18, oy + 13, W - 120, 12, chosen ? '#fff' : ok ? br.col : '#8a93ab', 'left', '900');
      fitTxt(o.desc, x + 18, oy + 29, W - 120, 10, '#b9c2d6', 'left', '600');
      if (ok) { pill(x + W - 82, oy + 11, 66, 18, 'TAKE', br.col, 10, true); hp(x + 8, oy, W - 16, 40, () => { if (spendNode(n.id, i)) g.treeSel = null; }, 'opt:' + n.id + ':' + i); }
      else if (chosen) pill(x + W - 82, oy + 11, 66, 18, 'CHOSEN', br.col, 9.5, false);
    });
    if (lockMsg && !r) txt(lockMsg, x + W / 2, yy + 3 * 46 + 6, 9.5, '#ff9a3c', 'center', '700', false);
  } else {
    wrapLines(n.desc, W - 24, 10.5, '600').forEach((l, i) => txt(l, x + 12, yy + 8 + i * 13, 10.5, '#cfd6e6', 'left', '600', false));
    const ly = yy + 8 + wrapLines(n.desc, W - 24, 10.5, '600').length * 13;
    txt('Rank ' + r + ' / ' + n.max, x + 12, ly + 6, 10, br.col, 'left', '800', false);
    if (can) btn(x + W - 128, ly - 4, 118, 32, 'SPEND POINT', () => spendNode(n.id), br.col, 12);
    else if (lockMsg) fitTxt(lockMsg, x + W - 12, ly + 10, W * 0.6, 9.5, '#ff9a3c', 'right', '700');
  }
}
