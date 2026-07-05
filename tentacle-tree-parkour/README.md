# SPACE SWINGER 🐙🌆🥊

Third-person tentacle-swinging brawler in the neon alien city of
Novoya Sprawl. You are Splort the Slippery — and so is everyone else
in the deathmatch queue.

## How to play

**Just open `index.html` in a browser.** Fully self-contained (three.js
is bundled in) — no server, no install.

## Modes

### QUICK MATCH
Matchmaking → lobby (4 swingers, ready checks, countdown) → **3:00
DEATHMATCH** in the city. Most KOs wins. Kill feed top-right, hold
**TAB** for the scoreboard, rematch from the results screen.

> The opponents are AI swingers standing in for live players — a single
> HTML file can't reach a game server, so the whole online flow
> (matchmaking, lobby, kill feed, standings) is built like a real
> multiplayer game with bots filling the slots. Swap in netcode later
> and the structure is already there.

### STORY
The wanted-fugitive quest chain: escape the rooftop raid, get a
disguise from the Mask Maker, earn Old Zeb's zapper, run Rusty's scrap,
get Pia to fix the last rocket, steal patrol fuel, and blast off.

## Controls

| Input | Action |
| --- | --- |
| **Click / Shift** | Shift-lock mouse look (Esc releases) |
| **W A S D** | Run |
| **Space** | Jump · advance dialogue |
| **Hold E** | Tentacle-swing — your right tentacle arm stretches out and latches on. Pendulum physics; pump with W; release mid-arc to fly. |
| **Left click** | Punch combos: jab → hook → **UPPERCUT** (launches). Third-person lunge auto-targets the nearest fighter. |
| **Tab** | Scoreboard (in a match) |

## The swinger

You see Splort from behind: purple body, two tentacle arms. The right
arm IS the grapple — it stretches from his shoulder all the way to the
anchor point when you swing, and whips out at whoever you punch.

## Rebuilding from source

```
npm install
npm run build   # bundles src/ into index.html
```

Source lives in `src/` (`game.js`, `style.css`, `ui.html`).
