# CUTLASS — 3D Pixel Pirate Adventure

A 3D pixel-art browser game for desktop **and mobile**, with two modes behind one
title screen:

1. **SURVIVAL: MANHUNT** — freeroam survival in endless procedural wilds. Mine,
   craft, build, swing through trees with your grapple, and don't get caught by
   the hunters. Your flying cutlass **CUTTY** is your companion. Worlds save.
2. **ARENA PVP** — a 3-minute cutlass deathmatch on floating sky isles against
   five AI pirates. Most KOs wins.

No build step, no assets, no network: Three.js is vendored, all textures are
generated at runtime on 16×16 canvases (nearest-filtered), and all sound is
WebAudio-synthesized. The pixel look comes from rendering at ~¼ resolution and
upscaling with `image-rendering: pixelated` — which is also why it runs well on
phones.

## Play it

Open `index.html` in a browser, or serve the folder (`npx serve .` /
`python3 -m http.server`) — serving is required on some browsers for `file://`
texture loading.

## Survival: Manhunt

Your score is **how long you survive**. Hunters — red-eyed pirates with your
exact moveset — spawn from the wilds and track you down, more of them and faster
as time passes, bolder at night. Death resets the clock but **keeps your world,
buildings, loot, and upgrades**; your best time is recorded.

- **Endless world** — chunked, procedurally generated terrain streams around you:
  meadows, forests, rocky highlands with iron ore, snowy peaks, lakes. Seed +
  every change you make (mining, chopping, building) persist in `localStorage`.
- **CUTTY, the flying sword** — hovers beside you, does the actual slashing when
  you attack, glows red when hunters are near, calls out their distance and
  bearing, and coaches you through the game.
- **Mining & gathering** — swing at terrain for stone, trees for wood, ore rocks
  for iron, bushes for berries. Hunters drop loot too.
- **Building** — select wood/stone in the hotbar and place 1 m blocks (green
  ghost cube shows placement). Bridges, walls, towers — blocks are solid,
  climbable, grappleable, and persist.
- **Crafting** — blade upgrades (Iron → Gold → Crystal, more damage), longer
  grapple rope, iron armor, and eating berries to heal.
- **Movement** — same parkour kit as the arena: triple jump, wall slide/jump,
  coyote time, and a crosshair-aimed grapple that works on trees, cliffs, and
  your own buildings. Water is swimmable and slows you.
- **Day/night** — ~2.5 min days; hunters spawn faster in the dark.

### Controls (survival)

| Action | Desktop | Mobile |
|---|---|---|
| Move / look | WASD + mouse | joystick + drag right side |
| Jump ×3 / wall jump | Space | JUMP |
| Grapple (hold) | E | GRAPPLE |
| Slash / chop / mine | Left Click | SLASH |
| Place block | Right Click | PLACE (with wood/stone selected) |
| Hotbar | 1 / 2 / 3 | tap slots |
| Crafting | C | CRAFT |

## Arena PVP

Same movement kit, five AI pirates, 3-minute matches, KO scoring, kill feed,
respawns; fall in the sea and it's a KO. See in-game menu for controls.

## Files

```
pixel-parkour-pvp/
├── index.html          mode select + both HUDs + CSS
├── game.js             arena mode (window.__ARENA)
├── survival.js         survival mode (window.__SURVIVAL): chunked world gen,
│                       mining/building diffs + saves, hunters, CUTTY, crafting
└── vendor/three.min.js Three.js r147 (vendored, UMD build)
```

### Tech notes

- Custom fixed-timestep AABB physics; terrain is a heightfield (2×2 m cells,
  auto step-up ≤1 m, cliffs act as wall-jumpable walls); trees/rocks/blocks are
  AABB solids per chunk.
- Terrain and flora render as per-chunk `InstancedMesh`es (2 draw calls for
  ground + a few for objects per chunk). r147 doesn't compute instance-aware
  bounds, so each chunk mesh gets a hand-set bounding sphere for culling.
- The world save is just `{seed, diffs}` — diffs are mined-cell deltas, removed
  objects, and placed blocks, so saves stay tiny no matter how far you roam.
- `window.__SURV_DEBUG` exposes a small hook surface (inv, aim, mine, spawn
  hunter…) used by the headless Playwright tests.
