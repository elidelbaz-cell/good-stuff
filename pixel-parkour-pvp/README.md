# CUTLASS — 3D Pixel Parkour PvP

A 3D pixel-art parkour arena brawler that runs in any browser — desktop **and mobile**.
You're a pirate on a chain of floating sky isles. Triple-jump, wall-jump, and grapple
your way around the arena and KO the other five pirates with your cutlass. Most KOs in
3 minutes wins. Fall in the drink and it's a KO on you.

The "PvP" opponents are AI pirates that use the exact same moveset you do — they chase,
parkour across gaps, grapple to orbs, and duel at sword range. (Real online multiplayer
would need a game server; the combat/movement code is shared by player and bots, so a
networked version could reuse all of it.)

## Play it

No build step. Either:

- Open `index.html` directly in a browser, or
- Serve the folder (`npx serve .` or `python3 -m http.server`) and open it —
  required on some browsers for textures when using `file://`.

Everything is self-contained: Three.js is vendored in `vendor/`, all textures are
generated at runtime on tiny canvases (16×16, nearest-filtered), and all sound is
synthesized with WebAudio. No assets, no network.

## Controls

| Action | Desktop | Mobile |
|---|---|---|
| Move | WASD / arrows | left-side virtual joystick |
| Look | mouse (pointer lock, or drag) | drag right side of screen |
| Jump (×3: ground + 2 air) | Space | JUMP button |
| Wall jump | Space while sliding on a wall | JUMP while on a wall |
| Grapple (hold to reel) | hold Right Click or E | hold GRAPPLE button |
| Slash cutlass | Left Click | SLASH button |
| Fullscreen | — | ⛶ button |

The crosshair turns **gold** when your grapple can reach what you're aiming at.
Grapple orbs (floating gold cubes) are easy anchor points, but any surface in range works.

## Mechanics

- **Triple jump** — one ground jump plus two air jumps (pips under your health bar
  show what's left). Coyote time and jump buffering included.
- **Wall slide / wall jump** — touch a wall while airborne to slide slowly; jumping
  kicks you off the wall and doesn't spend an air jump.
- **Grapple** — raycast from your crosshair, up to 48 units. Hold to reel in and swing;
  release for a little upward pop. Auto-releases when you arrive.
- **Cutlass** — the only weapon. Frontal arc hit with a lunge, knockback, and a short
  cooldown. Aim assist snaps your swing to nearby foes (welcome on touch screens).
- **Health** — 100 HP, regenerates after 5 s out of combat. KO'd pirates respawn in
  ~2.5 s with brief spawn protection.

## Tech notes

- **Pixel-art look**: the scene renders at ~1/2 to 1/4 resolution into the canvas and is
  upscaled with `image-rendering: pixelated`; all textures are nearest-filtered. This is
  also why it runs well on phones.
- **Physics**: custom fixed-timestep (60 Hz) AABB physics — axis-by-axis sweep against
  the world's box colliders; the rope is a pull force + length constraint that kills
  outward radial velocity (so you swing).
- **Bots**: a small state machine sharing the player's movement code — target selection,
  gap-jumping probes, stuck detection, orb grappling, void recovery, and human-ish
  reaction delay before attacking.

## Files

```
pixel-parkour-pvp/
├── index.html          HUD, touch controls, menus, CSS
├── game.js             engine + gameplay (rendering, physics, combat, AI, input, audio)
└── vendor/three.min.js Three.js r147 (vendored, UMD build)
```
