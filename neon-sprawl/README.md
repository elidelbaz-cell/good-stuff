# NEON SPRAWL 🐙🌆

A 2D pixel-art side-scroller. You are **Splort the Slippery** — the most
wanted tentacle in the galaxy — cornered in a neon alien city with
exactly **one rocket left**. Swing the skyline Spider-Man style, work
the quest line, dodge the patrol, and get off this rock.

## How to play

**Just open `index.html` in a browser.** Fully self-contained, no
install — rendered as chunky pixels on a 480×270 canvas.

## Controls

| Input | Action |
| --- | --- |
| `A` / `D` | Run |
| `Space` | Jump · advance dialogue |
| **Hold `E`** | Tentacle-swing — your tentacle latches onto the marked rooftop anchor (aim with the mouse) and you swing on pendulum physics. Pump with A/D, release to fly. You can dive-swing off tall roofs. |
| Left click | Tentacle punch → your **Zapper** once you earn it (aims at the mouse) |

## The city

A 6,400-pixel-wide neon strip: towers with lit windows and rooftop
anchors, hovercars drifting between them, lampposts, alien pedestrians
going about their day (punching one is a crime), and a parallax sky
with a ringed gas giant. Shops have signs — MASKS, PAWN, SCRAP,
PATROL — and the gold beam + quest arrow always point at your
objective.

## Wanted ★★★

Crime raises your heat: each star sends a patrol saucer after you,
strobing red-blue and shooting. Outrun them and the heat cools. Get
caught → **BUSTED**, fined, dumped back at the plaza.

## The quest line

The game opens with the Galactic Patrol trying to arrest you on your
rooftop (letterboxed cutscene). Then:

1. **Blend In** — the Mask Maker builds you a disguise (clears your heat; your sprite wears the mask).
2. **Get a Weapon** — Old Zeb at the pawn shop wants a favor first.
3. **Alley Cleanout** — punch 4 goons.
4. **Claim your Zapper** — left click now shoots.
5. **Rocket Rumors** — Rusty the scrap dealer knows about the mail rocket.
6. **Scrap Run** — collect 4 scrap; two are on ROOFTOPS. Swing.
7. **The Mechanic** — Pia fixes the rocket... but the tank is dry.
8. **Fuel Heist** — the fuel cell is on the patrol depot ROOF. Alarm. ★★★.
9. **Launch!** — swing back across the city and BLAST OFF (the rocket actually lifts off).

## Rebuilding from source

```
npm install
npm run build   # bundles src/ into index.html
```

Source lives in `src/` (`game.js`, `style.css`, `ui.html`).
