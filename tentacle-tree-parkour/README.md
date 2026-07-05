# Tentacle Treetops: Neon Sprawl 🐙🌆🚀

A GTA-style open city on an alien world — first-person, free-roam, with
Spider-Man-style tentacle swinging. You are **Splort the Slippery** —
two tentacles, 4,362 counts of grand larceny, one stolen moon — cornered
in the neon city of Novoya Sprawl. This city has exactly **one rocket
left**, and it's got your name on it.

## How to play

**Just open `index.html` in a browser.** Fully self-contained (three.js
is bundled in) — no server, no install.

## Controls

| Input | Action |
| --- | --- |
| **Click / Shift** | Shift-lock mouse look (Esc releases) |
| **W A S D** | Run |
| **Space** | Jump · advance dialogue |
| **Hold E** | Tentacle-swing — fires at the glowing anchor point, pendulum physics, release mid-arc to fly. Pump with W while swinging. |
| **Left click** | Tentacle-punch → your **Zapper** once you earn it (auto-aim, can shoot down saucers) |

No number QTEs. Just swing.

## The city

A neon grid of alien towers (all climbable/swingable — the cyan marker
shows where your tentacle will latch), glowing street lanes, hovercars,
and streets full of little alien pedestrians. Punching a civilian is a
crime, and crime raises your ★★★ wanted level — patrol saucers hunt you
in real time; break line and the heat cools. Busted → fined and dumped
back at the plaza.

## The story

The game opens with the Galactic Patrol raiding your rooftop hideout.
You start WANTED — swing away, lose them, then work the quest chain
(gold beam marks your objective, quest bar top-left):

1. **Blend In** — the Mask Maker builds you a disguise (clears your heat).
2. **Get a Weapon** — Old Zeb wants his alley cleaned out first...
3. **Alley Cleanout** — punch 4 goons.
4. **Claim your Zapper** — left click now shoots.
5. **Rocket Rumors** — Rusty the junk dealer knows about the mail rocket.
6. **Scrap Run** — collect 4 scrap; two are on ROOFTOPS. Swing.
7. **The Mechanic** — Pia fixes the rocket... but the tank is dry.
8. **Fuel Heist** — steal a fuel cell from the patrol depot. Alarm. ★★★. Chaos.
9. **Launch!** — swing across the city to the rocket and BLAST OFF.

## Rebuilding from source

```
npm install
npm run build   # bundles src/ into index.html
```

Source lives in `src/` (`game.js`, `style.css`, `ui.html`).
