# XENOTERRA 🪐⛏️

First-person voxel survival on an alien planet — mine every block you
see, build with what you dig, eat what glows, and survive the night.

## How to play

**Just open `index.html` in a browser.** Fully self-contained (three.js
is bundled in) — no server, no install. Add `?seed=1234` to the URL to
replay a specific world.

## The planet

A procedurally generated shard of alien land (128×128 blocks): violet
turf over mauve loam and teal stone, shallow pearl-sand seas, spire-wood
trees with glowing magenta canopies and golden **glowfruit**,
**shimmer-shrooms** on the meadows, and **sunshard crystal** veins deep
in the rock that glow in the dark. Two moons and a ringed gas giant hang
in the sky. Days last 4 minutes; nights belong to the **skitters** —
six-legged things with red eyes that hunt you until dawn burns them off.

## Survival

- 💜 **Health** and 🍖 **hunger**. Hunger drains with time (faster when
  sprinting); at zero you starve. Keep it high and health regenerates.
- **Eat** glowfruit (+4) and shimmer-shrooms (+3) — right-click while
  holding them. Skitters drop the glowfruit they've stolen.
- Fall damage is real. The sea is swimmable (Space to paddle up).
- Dying keeps your inventory — you respawn at your landing site.

## Controls

| Input | Action |
| --- | --- |
| Mouse | Look (click locks pointer, Esc releases) |
| `W A S D` | Move · `Shift` sprint · `Space` jump / swim |
| **Hold LMB** | Mine the highlighted block (progress ring) · punch skitters |
| **RMB** | Place selected block — or eat, if holding food |
| `1`–`9` / wheel | Hotbar |

Every block type is minable and placeable: turf, loam, stone, sand,
spire-wood, glow canopy, shrooms, fruit, and sunshard crystal (slow to
mine, glorious as glowing decoration).

## Rebuilding from source

```
npm install
npm run build   # bundles src/ into index.html
```

Source lives in `src/` (`game.js`, `style.css`, `ui.html`).
