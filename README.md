# Neon Vault

A short-run, loot-driven **neon top-down roguelike shooter** you can play with **one thumb** on your phone
(portrait or landscape) or with keyboard/mouse on desktop. Vanilla canvas, no build step.

**Play:** https://top-down-roguelike.onrender.com

## Controls

| Action | Touch | Desktop |
|---|---|---|
| Move | Drag anywhere (floating joystick) | WASD / arrows |
| Aim / fire | Automatic | Automatic |
| Dash | **DASH** button (same for every class) | Space / Shift |
| Class skill | **SKILL** button with cooldown ring | Q |
| Inspect / pick up weapon | Stand near it, tap **PICK UP** (or **SWAP SLOT 1 / 2** when both slots are full) | E (swaps into the active slot) |
| Equip slot | Tap weapon slot | 1 / 2 / Tab |
| Pause | Corner button | Esc / P |

Weapons on the floor are never picked up automatically and show no labels, only a rarity beam. Standing within a
small radius of one shows an inspect card (stat deltas vs. both equipped weapons with green/red arrows, rarity,
affix differences) plus the Pick Up / Swap buttons in the right thumb zone. Swapped-out weapons drop on the floor.

Landscape: arena fills the screen, HUD sits in the top bar, joystick on the left, buttons on the right, safe-area insets
respected, and rotating / resizing mid-run re-lays everything out live (a rotation pauses the run).

## Classes (pick on the class-select screen; last choice is remembered)

| Class | Start | Passive | Skill |
|---|---|---|---|
| Runner (cyan) | Pistol | +15% crit chance | Overload: 16-way burst, dash reset, +30% fire rate 3s |
| Breacher (orange) | Shotgun | Pellets pierce one enemy | Shockwave: knockback + stun |
| Phantom (violet) | Sniper | First shot after a dash deals x3 | Decoy: hologram lures enemies |
| Overclock (red) | SMG | Damage rises as HP drops (up to +80%) | Redline: 2x fire rate 5s, costs 15 HP |
| Daemon (green) | Crossbow | Turrets last 75% longer | Turret: copies your weapon + affixes |
| Blackout (yellow) | Launcher | Burning / Explosive affixes 50% stronger | Orbital Strike on the densest cluster |
| Glitch (magenta) | Random | 4 perk choices; pickups may reroll an affix | Reroll: new affixes on equipped weapon |

## Game

* **5 rooms + a boss** (The Admin). Each room has 3 waves; after the room, pick 1 of 3 perks (4 for Glitch) and open the data crate.
* Enemies: Rogue Drones, Malware swarms, ICE Turrets, Firewalls.
* Weapons: pistol, shotgun, SMG, sniper, crossbow, launcher in 4 rarities (common to legendary) with 10 affixes
  (ricochet, burning, chain lightning, vampiric, splitting, overcharged, cursed, freezing, explosive, piercing) and combos.
* Look: neon vector shapes with cheap additive glow sprites, neon grid floor, scanline/vignette overlay (no shadowBlur).

## Dev

```
npm install            # puppeteer-core (needs a local Chrome)
npm test               # headless: menu, class select + swipe, every class + skill, pickup flow, landscape/safe areas/live resize, full auto run, death path
npm start              # python static server on :8080
```

Deployed as a Render static site (`render.yaml`), auto-deploys on push to `main`.
