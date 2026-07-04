# Tentacle Treetops: Open Grove 🐙🛸

A free-roam, first-person alien parkour game. You are **Splort the
Slippery** — two tentacles, 4,362 counts of grand larceny, one stolen
moon — cornered on a backwater world by the Galactic Patrol. There is
exactly **one ship left off this planet**. Find it. Take it.

## How to play

**Just open `index.html` in a browser.** It's fully self-contained
(three.js is bundled in) — no server, no install.

## The world

One big open grove (~150 grapple trees) you can roam in any direction:

- **3 villages** (green light beams) with quest-giving elders
- **20 floating platforms** manned by hostile little gunners
- A **patrol station** (red beam) the saucers fly from
- The **LAST SHIP**, shielded on a mesa (cyan beam → gold when unlocked)

## Traversal

Look with the mouse (push toward the screen edge or use A/D to turn),
then SPACE/click to grapple at the tree you're facing. Time slows —
hit the shown number (1–6) within **3.5 s** or you fall. A **magenta
reticle** means twin trees: two numbers, hit both to **cannonball**
through them in a full barrel roll, smushing anyone you pass.

## Wanted ★★★

Punching patrol goons is, technically, a crime. Your heat meter fills;
each star sends another patrol saucer after you — and they fly in
**real time**, so slow-mo doesn't save you. Escape by breaking away:
stay out of their reach and the heat cools until they give up. Get
caught → **BUSTED** (score fine, respawn). Shot down or splatted →
respawn at the nearest safe pad.

## Quests (3 parts → 1 ship)

| Village | Quest | Reward |
| --- | --- | --- |
| Spore village | **Spore Harvest** — collect 6 glow-spores | FUEL CELL |
| Grove village | **Bully Busters** — punch 5 marked gunners | IGNITION CRYSTAL |
| Runner village | **The Spore-Runner Race** — 5 rings in 75 s | STAR MAP |

Collect all 3 parts and the ship's shield drops — but the patrol finds
out, your wanted maxes out permanently, and the finale is a full-map
chase to the gold beam. Reach the ship → **OFF-WORLD AT LAST**.

## Controls

| Key | Action |
| --- | --- |
| Mouse | Look / steer (screen-edge turning), aim punches |
| `Space` / click | Grapple toward where you're looking |
| `1`–`6` | Slow-mo QTE numbers |
| Click / `E` | Auto tentacle-punch nearest gunner |
| `Esc` | Decline a quest |

## Rebuilding from source

```
npm install
npm run build   # bundles src/ into index.html
```

Source lives in `src/` (`game.js`, `style.css`, `ui.html`).
