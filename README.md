# Loot & Lead

A short-run, loot-driven **top-down roguelike shooter** you can play with **one thumb** on your phone
(think *Gunfire Reborn*, but 5-8 minute runs). Vanilla HTML5 canvas + JavaScript – no build step, no assets.

## Play

Open the hosted build (see the repo description / Render URL) on your phone, or run it locally:

```bash
python3 -m http.server 8080   # or any static server
# open http://localhost:8080
```

## Controls

| Action | Touch | Desktop |
| --- | --- | --- |
| Move | Drag anywhere on the lower screen (floating joystick) | WASD / arrows (or click-drag) |
| Aim & fire | Automatic – nearest enemy | Automatic |
| Dash (i-frames) | **DASH** button, bottom right | Space / Shift |
| Weapon special | **SPECIAL** button (named after the weapon's special) | E / Q |
| Swap weapon | Tap a weapon slot | 1 / 2 / Tab |
| Pause | Pause button, top right | Esc / P |

All buttons live in the bottom-right thumb zone; the run auto-pauses when the tab loses focus.

## The run

* **5 small rooms + a boss** (The Warden). Each room is 3 waves; the door opens when the room is cleared.
* After every room: **pick 1 of 3 random perks** (move speed, crit chance/damage, drop quality, max HP, fire rate, damage,
  dash/special cooldowns, pickup magnet, armor, healing) and open the **chest** for a guaranteed rare-or-better weapon.
* Enemies drop weapons too (tanks most often). Walk over a weapon to pick it up; you carry **2** and can swap any time.
* Enemies: **chaser**, **shooter**, **tank** (telegraphed charge), **swarm**, plus the multi-phase **boss**.
* Health bars, damage numbers, crits, screen shake, particles, game-over / victory screens with **best-run stats** in `localStorage`.

## Weapons, rarities, affixes

* Types: **pistol, shotgun, SMG, sniper (piercing), crossbow (sticks, then explodes), launcher (splash)** – each with its own **special**
  (Quickdraw, Shockwave, Overdrive, Railshot, Volley, Barrage).
* Rarities: **common, rare, epic, legendary** (coloured glow + light beam on the floor). Higher rarity = bigger stats, more affixes (0-3).
* 10 affixes: **ricochet, burning, chain lightning, vampiric, splitting, overcharged** (every 5th shot x3), **cursed** (+60% dmg, +35% damage taken),
  **freezing, explosive, piercing**.
* Names are generated from the affixes (e.g. *Burning Ricochet SMG*) and the full stats/affix text is shown when you pick one up.
* Combos: burning + ricochet leaves **trails of fire**, burning + explosive makes blasts ignite, freezing + chain lightning arcs freeze.

## Tests

```bash
npm install            # puppeteer-core (uses your local Chrome/Chromium)
npm test               # headless load, touch joystick, full auto-played run, death path; fails on any console error
```

## Deploy

It is a static site: publish the repo root (`.`) with no build command (see `render.yaml`).
