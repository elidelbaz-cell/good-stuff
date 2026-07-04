# Tentacle Treetops 🐙🌲

A 3D tree-parkour game. You're a little tentacle creature grappling through
an endless forest canopy — but your tentacles only listen to you under
pressure.

## How to play

**Just open `index.html` in a browser.** It's fully self-contained
(three.js is bundled in) — no server, no install.

## The grapple mechanic

1. Leap off a tree — **time slows to a crawl**.
2. A number **1–6** appears with a 5-second timer (real time).
3. Hit that number (keyboard or click the on-screen key) → your tentacle
   fires and you **zip at full speed** to the next tree.
4. Land → time slows again → new number. Chain forever.
5. Miss the window → the tentacles give up and **you fall**.
6. Wrong key costs you **1 second**.

## The little people

Tiny gunners camp in the trees and shoot at you (their bullets crawl through
slow-mo — watch them drift past). Get within range and press **E** or
**click** to tentacle-punch them off their branch: +25 points, +10 HP.

## Controls

| Key | Action |
| --- | --- |
| `1`–`6` | Grapple QTE — hit the shown number |
| `E` / click | Punch a nearby gunner |
| `Space` | Leap from the first tree |
| `R` | Restart after you splat |

## Scoring

+10 per tree chained, +25 per gunner punched. Best score is saved locally.

## Rebuilding from source

```
npm install
npm run build   # bundles src/ into index.html
```

Source lives in `src/` (`game.js`, `style.css`, `ui.html`).
