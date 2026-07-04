# Tentacle Treetops 🐙🛸

A first-person 3D parkour game on an alien world. You crash-landed in a
bioluminescent grove and your saucer is parked at the far end — grapple
the canopy with your tentacles and punch every little gunner between you
and home.

## How to play

**Just open `index.html` in a browser.** It's fully self-contained
(three.js is bundled in) — no server, no install.

## The grapple mechanic

1. Leap off the crash site — **time slows to a crawl**.
2. A number **1–6** appears with a **3.5-second** timer (real time).
3. Hit that number (keyboard or click the on-screen key) → your tentacle
   fires and you **zip at full speed** to the next tree.
4. Land → time slows again → new number. Chain to the ship.
5. Miss the window → the tentacles give up and **you fall**.
6. Wrong key costs you **0.75 seconds**.

## Maneuvers

- **Cannonball** — when two trees grow close together, the QTE shows
  **two numbers**. Hit both in order and you blast through the first tree
  and barrel-roll a ballistic arc to the second — no second QTE, +30
  points, and any gunner you barrel through gets smushed.

## The little gunners

They camp on **floating platforms** beside your flight path and shoot at
you (their bolts crawl through slow-mo — watch them drift past).
**Left click** (or **E**) auto-fires a tentacle punch at the nearest one
in range — the crosshair glows magenta when someone is punchable:
+25 points, +10 HP.

## The goal

Reach your saucer at the end of the grove. Each level the grove gets
longer, gunners get more numerous, and twin trees more common. Score
carries across levels; dying restarts the current level.

## Controls

| Key | Action |
| --- | --- |
| `1`–`6` | Grapple QTE — hit the shown number(s) |
| Left click / `E` | Auto tentacle-punch the nearest gunner |
| `Space` | Leap from the crash site / next level |
| `R` | Restart after you splat |
| Mouse | Look around slightly while flying |

## Scoring

+10 per tree, +25 per gunner punched, +30 per cannonball, +100 per level.
Best score is saved locally.

## Rebuilding from source

```
npm install
npm run build   # bundles src/ into index.html
```

Source lives in `src/` (`game.js`, `style.css`, `ui.html`).
