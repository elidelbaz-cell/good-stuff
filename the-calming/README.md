# THE CALMING

First-person horror vertical slice. Three scenes, one core mechanic, one fail
state. **Fully playable with placeholders** — boxes for models, synth beeps
for audio — real assets swap in via a single manifest edit each.

## Engine

**Three.js (r185, vendored) + WebAudio, vanilla ES modules, no build step.**
Chosen for fastest playable build: runs in any browser, WebAudio gives a
sample-accurate audio clock for the rhythm scene, FBXLoader handles the Meshy
exports, `PathLine` is the ghost's spline. Everything is offline — no CDN.

## Run it

```
cd the-calming
python3 -m http.server 8080     # or: npx serve
```

Open http://localhost:8080 — click, headphones on.

| URL | What |
|---|---|
| `/` | Full game: cutscene → chase → piano |
| `/?scene=chase` | Straight into the library chase |
| `/?scene=piano` | Straight into the piano scene |
| `/?debug=1` | Live state overlay (combine with any scene) |
| `/tools/turntable.html?asset=shadow` | FBX import QA viewer |

**Controls** — chase: WASD (sprint is always on) + mouse, `Space` jump,
`Shift`/`Ctrl` slide-duck. Piano: number keys `1`–`7`. Cutscene: hold `F` to
skip (optional). Death restarts at the last checkpoint (chase start / piano
start) — never the cutscene.

## Where things live

| File | What you edit there |
|---|---|
| `assets/manifest.js` | **The asset swap point.** Point `file:` at a delivered FBX/WAV and it's live. Per-model import fixes (targetHeight/upAxisFix/yaw). |
| `src/config.js` | Every gameplay tunable: speeds, gaps, hit windows behaviour, ghost steps, hand lerps, death timings. `onMelodyComplete` hook lives here. |
| `assets/beatmaps/melody_main.json` | The beatmap (placeholder — replace with the hand-authored strong-beats one; the loader takes whatever is in it). |
| `assets/data/cutscene_timeline.json` | Scene 1 named beats — retime any beat here. |
| `assets/data/chase_triggers.json` | Bookshelf trigger placements (s along path, side, jump/slide). |
| `assets/data/piano_keys.json` | The 7 key hitboxes + key-caps — nudge x/y/z per key to line up with the real piano texture. |

## Systems map (delivery order 1–9)

1. **Player controller** — `src/game/player.js` (sprint-only, jump, slide-duck, pointer-lock look)
2. **Death + checkpoints** — `src/game/death.js` (one handler: seize camera → face ghost → hold 2s → black → silence → checkpoint)
3. **Ghost pursuer** — `src/game/ghost.js` (rigid object on the path spline, NOT AI; distance drives drone audio + emission glow; distance 0 = death)
4. **Library chase** — `src/game/chase.js` (corridor with one reconverging branch, scripted shelf topples: jump-over vs slide-under, 3 staggers = caught, lights fail behind the ghost, door slam into the reading room)
5. **Piano rhythm** — `src/game/piano.js` (beatmap loader, 7 hitboxes + visible key-caps over the fused mesh, all timing off the audio clock; feedback: clean note / flat off-time note / dissonant wrong key / silent miss; ghost closeness is the only health bar; `OnMelodyComplete` window event + `CONFIG.onMelodyComplete`)
6. **Hands** — `src/game/hands.js` (rigid, no skeleton, pure position-lerp; 1–3 left, 5–7 right, 4 = least-recently-moved; hovers next key one beat early)
7. **Cutscene** — `src/game/cutscene.js` + timeline JSON (named beats: deal → house → cut-to-black act → aftermath → the turn → hard cut, control arrives seamlessly)
8. **Import pipeline** — `src/engine/importer.js` (Meshy texture reconnection by filename, scale/axis/pivot normalisation) + `tools/turntable.html`
9. **Swap real assets** — edit `assets/manifest.js` only (see `assets/models/README.md`, `assets/audio/README.md`)

## Placeholder set dressing I flagged for real assets

- Corridor wall shelving (instanced grey blocks) and reading-room walls/doors
- The deal set: table, window plane, envelope; the house hallway walls
- Key-cap tint + floating 1–7 key labels (`CONFIG.dev.showKeyLabels` — turn
  off once the real piano art lands)
- Slide-under shelves fall as a leaning "tent" of two stacks; the slide gap is
  honest at the corridor centre, generous at the edges — revisit with real art

## Open decisions (unchanged, waiting on you)

- The shape in cutscene beats 5–6: placeholdered as the `shadow` — one marked
  line in `src/game/cutscene.js` `build()` swaps it to the `human`.
- What happens on melody completion: `OnMelodyComplete` fires; the default
  hook in `src/config.js` just holds on '...' and fades out.
- Final melody length (placeholder beatmap runs ~57s to match).
