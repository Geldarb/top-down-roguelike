# Neon Vault — class upgrade trees

Borderlands-style trees, one per class. Generated from `js/trees.js` by `node tools/gen-trees-doc.js`.

## Rules

- Every class starts a run with a **Common Pistol** and **no skill**. The SKILL button shows a lock ("LVL 2").
- Kills give XP (chaser 3, swarm 1, shooter 4, tank 10, turret 4, splitter 4, elite 40, sentinel 90, boss 120, twin 110, root 200, node 15); clearing a room gives `6 + 2×room` XP (+20 on boss rooms).
- XP to the next level: `16 + 7 × (level − 1)`. Each level gives **1 skill point**.
- **The first point picks 1 of 3 skills.** Until a skill is chosen, the tree nodes are locked.
- Each class has **3 branches** with 3 tiers. Tier 2 needs 3 points in that branch; tier 3 needs 7.
- Node kinds: **stat nodes** (1–5 ranks, stackable) and **choice nodes** ("pick 1 of 3", permanent). Every class has an augment choice in its skill branch that changes how any of its 3 skills behaves.
- The random perk offers after each room are still there. Loop mode (New Game+) keeps level, points, skill and tree.
- Co-op: XP from every kill goes to every player; each player has their own level, points, skill and tree, synced from the host.
- UI: level-up toast and ▲ UPGRADE pill on the HUD, the locked skill button, `T` key, or pause → **TREE** tab. Tap a node to see its details / options; tap **SPEND POINT** or **TAKE**. Drag to scroll.

## Runner — Fast hands, sharp shots

16 nodes (incl. skill pick), 6 choose-1-of-3 nodes.

**Skills (pick 1 of 3):**

- **Overload** (9s): 16-way bullet burst, resets dash, +30% fire rate for 3s
- **Afterburner** (10s): 4s of +50% speed and +40% fire rate; dash instantly recharged
- **Fan the Hammer** (7s): Three rapid 5-bullet volleys at your target

### GUNPLAY

| Tier | Node | Ranks | Effect |
|---|---|---|---|
| 1 | Quickdraw | 5 | +5% fire rate per rank |
| 1 | Sharpshooter | 5 | +3% crit chance per rank |
| 2 | Pistolero | 3 | +10% pistol damage per rank |
| 2 | Trigger Discipline | pick 1 | **Hollow Tips**: +40% crit damage<br>**Hair Trigger**: +15% fire rate<br>**Lucky Strike**: Critical hits heal 1 HP |
| 3 | Signature Style | pick 1 | **Deadeye**: Every 4th shot is a guaranteed critical hit<br>**Hot Lead**: Critical hits ignite enemies (synergy: Burning)<br>**Ricochet Ace**: All bullets bounce off walls +1 time (stacks with Ricochet) |

### SPEED

| Tier | Node | Ranks | Effect |
|---|---|---|---|
| 1 | Fleet Foot | 5 | +4% move speed per rank |
| 1 | Quick Step | 5 | Dash recharges 6% faster per rank |
| 2 | Run & Gun | 3 | +6% damage while moving per rank |
| 2 | Footwork | pick 1 | **Slide Tackle**: Dashing through enemies deals 40 damage, +0.1s dash invulnerability<br>**Second Step**: After a dash your next 3 shots are critical hits<br>**Evasive**: Take 10% less damage and +6% speed |
| 3 | Flow State | pick 1 | **Momentum**: +25% damage while moving<br>**Afterimage**: Dashes end with a 60-damage blast<br>**Blur**: Dash recharges 25% faster and grants 1.5s Haste |

### OVERLOAD (skill branch)

| Tier | Node | Ranks | Effect |
|---|---|---|---|
| 1 | Capacitor | 5 | Skill recharges 5% faster per rank |
| 1 | Amplifier | 5 | +8% skill power per rank |
| 2 | Feedback | 3 | Kills cut 0.15s off the skill cooldown per rank |
| 2 | Skill Augment | pick 1 | **Shrapnel Nova**: Skill also fires a 12-bullet ring with your weapon (60% dmg)<br>**Kickstart**: Skill also grants Haste for 3s (+30% fire rate, +25% speed)<br>**Hardlight Shield**: Skill also grants a shield charge that blocks one hit (max 2) |
| 3 | Overload Protocol | pick 1 | **Supercharger**: Skill power +60% (damage, radius, duration)<br>**Echo Cast**: 35% chance your skill casts a second time for free<br>**Static Field**: For 5s after your skill, every hit arcs chain lightning (synergy: Chain) |

## Breacher — Close-range door kicker

16 nodes (incl. skill pick), 6 choose-1-of-3 nodes.

**Skills (pick 1 of 3):**

- **Shockwave** (10s): Blast around you that damages, knocks back and stuns
- **Breach Charge** (8s): Invulnerable shoulder-charge that rams, stuns and ends in a blast
- **Vortex Grenade** (11s): Grenade that sucks enemies together for 1s, then explodes

### DEMOLITION (skill branch)

| Tier | Node | Ranks | Effect |
|---|---|---|---|
| 1 | Det Cord | 5 | +8% skill power per rank |
| 1 | Fuse Cutter | 5 | Skill recharges 5% faster per rank |
| 2 | Blast Radius | 3 | All explosions +8% radius per rank (synergy: Explosive, Launcher) |
| 2 | Skill Augment | pick 1 | **Gravity Well**: Skill also pulls enemies within 160 toward its centre<br>**Thermal Residue**: Skill also leaves a ring of burning ground<br>**Flashbang**: Skill also stuns enemies within 120 for 1.2s |
| 3 | Wrecking Crew | pick 1 | **Aftershock**: Your skill repeats as a 60% echo 0.6s later<br>**Chain Reaction**: Enemies you kill explode for 30 damage<br>**Breach & Clear**: +40% damage for 4s after using your skill |

### BULWARK

| Tier | Node | Ranks | Effect |
|---|---|---|---|
| 1 | Plating | 5 | Take 3% less damage per rank |
| 1 | Reinforced | 5 | +10 max HP per rank |
| 2 | Regen Mesh | 3 | Regenerate 0.4 HP/s per rank |
| 2 | Hardened | pick 1 | **Reactive Plating**: When hit, release a 40-damage blast<br>**Kinetic Barrier**: Block the first hit in every room<br>**Stand Firm**: +20% damage while standing still |
| 3 | Fortress | pick 1 | **Last Stand**: Below 30% HP you take 40% less damage<br>**Overshield Loop**: Kills have a 6% chance to grant a shield charge<br>**Riot Frame**: +60 max HP, -8% move speed |

### CLOSE QUARTERS

| Tier | Node | Ranks | Effect |
|---|---|---|---|
| 1 | Point Blank | 5 | +6% damage to enemies within 110 per rank |
| 1 | Slug Core | 1 | Multi-pellet weapons pierce 1 enemy |
| 2 | Kickback | 3 | +25% knockback and +5% shotgun damage per rank |
| 2 | Specialist | pick 1 | **Scattergun**: +25% shotgun damage<br>**Ram Dash**: Dashing through enemies deals 55 damage<br>**Stagger**: Hits have an 8% chance to stun for 0.8s |
| 3 | Door Kicker | pick 1 | **Executioner**: +50% damage to enemies under 30% HP<br>**Shell Shock**: Hits within 110 ignite enemies (synergy: Burning)<br>**Bulldozer**: Dashing stuns enemies you pass and deals 30 damage |

## Phantom — Strike from the shadows

16 nodes (incl. skill pick), 6 choose-1-of-3 nodes.

**Skills (pick 1 of 3):**

- **Decoy** (12s): Hologram lures enemies for 5s; your next shot deals x3
- **Phase Strike** (9s): Blink behind the nearest enemy and slash it; primes an ambush shot
- **Cloak** (13s): Turn invisible for 4s (+30% speed); enemies lose you; next shot x3

### MARKSMAN

| Tier | Node | Ranks | Effect |
|---|---|---|---|
| 1 | Long Shot | 5 | +6% damage to enemies farther than 170 per rank |
| 1 | Precision | 5 | +3% crit chance per rank |
| 2 | Sniper Training | 3 | +10% sniper and +5% pistol damage per rank |
| 2 | Special Ammo | pick 1 | **Hollow Point**: +40% crit damage<br>**Penetrator**: Bullets pierce 1 more enemy (synergy: Piercing)<br>**Mark Target**: Critical hits mark enemies: +25% damage taken for 6s |
| 3 | Kill Shot | pick 1 | **Assassinate**: +60% damage to enemies at full HP<br>**Headhunter**: Critical kills cut 1s off the skill cooldown<br>**Overwatch**: +30% crit chance while standing still |

### SHADOW

| Tier | Node | Ranks | Effect |
|---|---|---|---|
| 1 | Ambusher | 5 | Dashing primes an ambush: next shot deals x1.5, +0.4x per rank |
| 1 | Light Step | 5 | Dash recharges 6% faster per rank |
| 2 | Fade | 3 | +0.06s dash invulnerability per rank |
| 2 | Shadowcraft | pick 1 | **Shadow Step**: Dashes travel 40% farther<br>**Backstab**: Ambush shots stun the target for 1.2s<br>**Vanish**: Dashing makes enemies lose track of you for 1s |
| 3 | Night Terror | pick 1 | **Serial Ambush**: Kills with an ambush shot instantly recharge your dash<br>**Shadow Blades**: Dashing through enemies deals 70 damage<br>**Lethal Grace**: Ambush shots are always critical hits |

### HOLOGRAM (skill branch)

| Tier | Node | Ranks | Effect |
|---|---|---|---|
| 1 | Projector | 5 | Skill recharges 5% faster per rank |
| 1 | Persistence | 5 | Skill effects last +0.4s per rank |
| 2 | Feedback Loop | 3 | +8% skill power per rank |
| 2 | Skill Augment | pick 1 | **Target Lock**: Skill marks enemies within 170: they take +25% damage for 6s<br>**Cryo Pulse**: Skill also slows enemies within 150 by 50% for 3s<br>**Detonator**: Skill also triggers a 90-radius blast at its centre |
| 3 | Mirage Protocol | pick 1 | **Holo Bomb**: Decoys and cloaks end in a 130-damage blast<br>**Double Image**: Your skill also drops a decoy hologram (3s)<br>**Echo Cast**: 35% chance your skill casts a second time for free |

## Overclock — Burn bright, burn fast

16 nodes (incl. skill pick), 6 choose-1-of-3 nodes.

**Skills (pick 1 of 3):**

- **Redline** (12s): Double fire rate for 5s, costs 15 HP
- **Overheat Vent** (9s): Vent heat: a fiery 110-radius blast that ignites, costs 8 HP
- **Bloodsurge** (14s): 5s: +30% damage, hits heal 0.5 HP, kills heal 4 HP

### BURNOUT

| Tier | Node | Ranks | Effect |
|---|---|---|---|
| 1 | Adrenaline | 5 | Damage rises as HP drops: up to +12% per rank |
| 1 | Thick Blood | 5 | +10 max HP per rank |
| 2 | Bloodlust | 3 | Heal 1 HP on every kill per rank |
| 2 | Pain Engine | pick 1 | **Red Mist**: Below 50% HP: +20% fire rate<br>**Second Wind**: Once per run, survive a killing blow with 50% HP<br>**Pain Battery**: Taking damage cuts 1s off the skill cooldown |
| 3 | Redline Life | pick 1 | **Deathwish**: Adrenaline bonus is doubled<br>**Vampire Core**: Critical hits heal 2 HP (synergy: Vampiric)<br>**Overdrive Heart**: Below 30% HP your skill recharges twice as fast |

### VELOCITY

| Tier | Node | Ranks | Effect |
|---|---|---|---|
| 1 | Cyclic Rate | 5 | +5% fire rate per rank |
| 1 | Light Trigger | 5 | +4% damage per rank |
| 2 | Spray Control | 3 | +10% SMG and +5% pistol damage per rank |
| 2 | Feed System | pick 1 | **Echo Rounds**: 15% chance each shot fires a free echo shot<br>**Spin-Up**: Fire rate builds +3%/s while shooting (max +30%)<br>**Hollow Spray**: Bullets pierce 1 more enemy |
| 3 | Bullet Hose | pick 1 | **Overcharged Barrel**: Every 5th shot deals x3 (stacks with Overcharged)<br>**Ricochet Storm**: All bullets bounce +1 time<br>**Lead Rain**: +35% fire rate, -10% damage |

### MELTDOWN (skill branch)

| Tier | Node | Ranks | Effect |
|---|---|---|---|
| 1 | Heat Sink | 5 | Skill recharges 5% faster per rank |
| 1 | Afterburn | 5 | +8% skill power per rank |
| 2 | Thermal | 3 | Burning and explosions +10% per rank (synergy: Burning) |
| 2 | Skill Augment | pick 1 | **Thermal Residue**: Skill also leaves a ring of burning ground<br>**Kickstart**: Skill also grants Haste for 3s (+30% fire rate, +25% speed)<br>**Patch Job**: Skill also heals 12% of your max HP |
| 3 | Core Breach | pick 1 | **Ignition**: All hits have a 15% chance to ignite<br>**Supercharger**: Skill power +60% (damage, radius, duration)<br>**Burnout**: Burning enemies explode on death for 40 damage |

## Daemon — Let the machines work

16 nodes (incl. skill pick), 6 choose-1-of-3 nodes.

**Skills (pick 1 of 3):**

- **Turret** (11s): Plant a turret that copies your weapon and its affixes
- **Drone Swarm** (13s): 2 drones orbit you for 9s and fire copies of your weapon
- **Logic Bomb** (10s): Scatter 4 proximity mines around you (12s)

### NETWORK (skill branch)

| Tier | Node | Ranks | Effect |
|---|---|---|---|
| 1 | Uptime | 5 | Constructs (turrets, drones, mines) last 12% longer per rank |
| 1 | Bandwidth | 5 | Constructs deal 8% more damage per rank |
| 2 | Compiler | 3 | Skill recharges 6% faster per rank |
| 2 | Skill Augment | pick 1 | **Arc Relay**: Skill also zaps the 5 nearest enemies with chain lightning<br>**Hardlight Shield**: Skill also grants a shield charge that blocks one hit (max 2)<br>**Recursion**: 30% chance the skill cooldown is fully refunded |
| 3 | Botnet | pick 1 | **Dual Core**: +1 construct per cast (one more turret, drone or mine)<br>**Overclocked Bots**: Constructs fire 50% faster<br>**Uplink**: +20% fire rate while you have a construct out |

### PAYLOAD

| Tier | Node | Ranks | Effect |
|---|---|---|---|
| 1 | Detonators | 5 | Explosions deal 8% more damage per rank (synergy: Explosive, Crossbow) |
| 1 | Wide Area | 5 | Explosions +6% radius per rank |
| 2 | Crossbow Rig | 3 | +10% crossbow and +5% pistol damage per rank |
| 2 | Volatile Code | pick 1 | **Volatile**: Hits have a 10% chance to cause a small blast<br>**Shrapnel**: Explosions slow enemies for 2s<br>**Firestarter**: Explosions ignite enemies |
| 3 | Payload Delivery | pick 1 | **Chain Reaction**: Enemies you kill explode for 40 damage<br>**Self-Destruct**: Constructs explode for 120 when they expire<br>**Big Bang**: Explosions +40% radius and +40% damage |

### FIREWALL

| Tier | Node | Ranks | Effect |
|---|---|---|---|
| 1 | Encryption | 5 | Take 3% less damage per rank |
| 1 | Redundancy | 5 | +10 max HP per rank |
| 2 | Hotfix | 3 | Regenerate 0.4 HP/s per rank |
| 2 | Intrusion Countermeasures | pick 1 | **ICE Coat**: Hits have a 10% chance to freeze (synergy: Freezing)<br>**Packet Shield**: Block the first hit in every room<br>**Honeypot**: When hit, release a 35-damage blast |
| 3 | Kernel | pick 1 | **Self-Repair**: Standing near your constructs heals 2 HP/s<br>**Failsafe**: Once per run, survive a killing blow with 50% HP<br>**Quarantine**: Enemies within 90 of you are slowed by 30% |

## Blackout — Fire from above

16 nodes (incl. skill pick), 6 choose-1-of-3 nodes.

**Skills (pick 1 of 3):**

- **Orbital Strike** (13s): Plasma blast on the densest enemy cluster
- **Napalm Line** (9s): A line of burning plasma toward your target
- **Cluster Barrage** (12s): 6 small strikes rain on random enemies

### THERMITE

| Tier | Node | Ranks | Effect |
|---|---|---|---|
| 1 | Thermite | 5 | Burning and explosive effects +10% per rank (synergy: Burning, Explosive) |
| 1 | Igniter | 5 | Hits have a 3% chance to ignite per rank |
| 2 | Fuel-Air | 3 | Explosions +8% radius per rank |
| 2 | Wildfire | pick 1 | **Spreading Flames**: Burning enemies spread fire to neighbours when they die<br>**Scorched Earth**: Kills leave a patch of burning ground<br>**Heatwave**: +20% damage to burning enemies |
| 3 | Inferno | pick 1 | **Firestorm**: All hits have +20% chance to ignite<br>**Burnout**: Burning enemies explode on death for 45 damage<br>**White Phosphorus**: Burn damage +60% |

### ARTILLERY (skill branch)

| Tier | Node | Ranks | Effect |
|---|---|---|---|
| 1 | Spotter | 5 | Skill recharges 5% faster per rank |
| 1 | Payload | 5 | +8% skill power per rank |
| 2 | Launcher Rig | 3 | +10% launcher and +5% pistol damage per rank |
| 2 | Skill Augment | pick 1 | **Detonator**: Skill also triggers a 90-radius blast at its centre<br>**Gravity Well**: Skill also pulls enemies within 160 toward its centre<br>**Flashbang**: Skill also stuns enemies within 120 for 1.2s |
| 3 | Danger Close | pick 1 | **Carpet Bombing**: Skill fires one extra strike / line / volley<br>**Supercharger**: Skill power +60% (damage, radius, duration)<br>**Echo Cast**: 35% chance your skill casts a second time for free |

### FALLOUT

| Tier | Node | Ranks | Effect |
|---|---|---|---|
| 1 | Hazmat | 5 | Take 3% less damage per rank |
| 1 | Rad Shield | 5 | +10 max HP per rank |
| 2 | Salvage | 3 | +10% credits per rank |
| 2 | Half-Life | pick 1 | **Irradiate**: Explosions slow enemies for 2s<br>**Med Drop**: Kills have a 5% chance to drop a heart<br>**Iso Shield**: Block the first hit in every room |
| 3 | Ground Zero | pick 1 | **Nuclear Option**: Explosions +40% radius and +40% damage<br>**Rad Leech**: Burn ticks on enemies heal you 0.3 HP<br>**Critical Mass**: Explosions can critically hit |

## Glitch — Reality is a suggestion

16 nodes (incl. skill pick), 6 choose-1-of-3 nodes.

**Skills (pick 1 of 3):**

- **Reroll** (20s): Rerolls every affix of your equipped weapon
- **Glitch Blink** (7s): Teleport away from danger, leaving a glitch nova behind
- **Chaos Field** (12s): Every enemy within 230 gets a random burn, freeze or shock

### ENTROPY

| Tier | Node | Ranks | Effect |
|---|---|---|---|
| 1 | Bit Flip | 5 | Picked-up weapons: +12% chance per rank to reroll an affix |
| 1 | Noise | 5 | Hits: +3% chance per rank to apply a random burn / freeze / shock |
| 2 | Unstable | 3 | +3% damage per affix on your weapon, per rank |
| 2 | Corrupt Data | pick 1 | **Hex Tolerance**: Cursed penalty reduced by 25%<br>**Chaos Rounds**: +10% random-status chance on hit<br>**Data Mine**: +30% weapon drop quality |
| 3 | Entropy Engine | pick 1 | **Affix Storm**: +8% damage per affix on your weapon<br>**Glitched Pickup**: Picked-up weapons gain a random extra affix (max 4)<br>**Wild Magic**: +20% random-status chance on hit |

### LUCK

| Tier | Node | Ranks | Effect |
|---|---|---|---|
| 1 | Fortune | 5 | +10% weapon drop quality per rank |
| 1 | Lucky Shot | 5 | +3% crit chance per rank |
| 2 | Jackpot | 3 | +10% credits per rank |
| 2 | House Edge | pick 1 | **Extra Option**: Perk offers show 1 more choice<br>**Loaded Dice**: +2 perk rerolls<br>**Insurance**: Once per run, survive a killing blow with 50% HP |
| 3 | Rigged Game | pick 1 | **Snake Eyes**: +10% crit chance and +60% crit damage<br>**High Roller**: Rare and epic perks show up far more often<br>**Double Down**: 20% chance each shot fires a free echo shot |

### CORRUPTION (skill branch)

| Tier | Node | Ranks | Effect |
|---|---|---|---|
| 1 | Overclock Kernel | 5 | Skill recharges 5% faster per rank |
| 1 | Corruption | 5 | +8% skill power per rank |
| 2 | Packet Loss | 3 | Skill effects last +0.3s per rank |
| 2 | Skill Augment | pick 1 | **Cryo Pulse**: Skill also slows enemies within 150 by 50% for 3s<br>**Arc Relay**: Skill also zaps the 5 nearest enemies with chain lightning<br>**Shrapnel Nova**: Skill also fires a 12-bullet ring with your weapon (60% dmg) |
| 3 | Segfault | pick 1 | **Echo Cast**: 35% chance your skill casts a second time for free<br>**Crash Dump**: Skill cooldown -30%<br>**Blue Screen**: Your skill also stuns every enemy within 180 for 1.5s |

## Rooms, camera and pacing (same update)

- Room sizes come from `roomSize()` in `js/game.js`: combat rooms are 640–720 × 680–760 world units in portrait (about 2.2× the visible area) and the same area turned wide in landscape (about 2.5×). Elite, boss and ROOT arenas are a bit tighter; shops and risk rooms are small.
- The camera follows the local player with a 46-unit lead in the move direction, eases in (frame-rate independent), and is clamped to the room with a 26-unit margin. In co-op each client's camera follows its own player.
- Off-screen enemies, teammates and loot get edge arrows. The minimap shows walls, the door, enemies, loot and players.
- Pacing: enemies spawn in a ring around a random living player, wave budgets are ×1.4 (gauntlet ×1.3) with a cap on how many are alive at once, there are more hazard tiles and laser walls per room, and boss and ROOT positions scale with room height. Enemies target the nearest living player and ignore cloaked players when someone else is visible.
