# Tentacle Treetops: The Last Rocket 🐙🚀

A two-act, first-person alien adventure. You are **Splort the Slippery** —
two tentacles, 4,362 counts of grand larceny, one stolen moon.

## How to play

**Just open `index.html` in a browser.** Fully self-contained (three.js
is bundled in) — no server, no install.

## Act 1 — The Escape

The Galactic Patrol raids your hideout (opening cutscene). Grapple
tree-to-tree through the grove to the coast, hitting the slow-mo number
QTE (1–6 within 3.5 s) each hop while the sirens chase you. Reach the
end and you dive off the edge...

## Act 2 — Novoya Isle (free roam)

...and wash up on an island you explore **on foot**:

- **WASD** to walk, **mouse** to look (push to the screen edge to turn).
- **SPACE** grapples when a tree is circled in your reticle — optional
  traversal for shortcuts and rooftops — or jumps when there's no tree.
- **Walk up to anyone** and they'll talk to you. Quests are how you get
  off this rock.

### The quest chain

Follow the **GOLD beam** to your current objective. The chain:

1. **Blend In** — visit the Mask Maker for a disguise (drops your wanted level).
2. **Get a Weapon** — Old Zeb the Hunter wants a favor first.
3. **Camp Cleanout** — punch 4 beach goons out of his old camp.
4. **Claim your Zapper** — back to Zeb; now **left click shoots** (auto-aim).
5. **Rocket Rumors** — Rusty the Junk Dealer knows where the one rocket is.
6. **Scrap Run** — collect 4 pieces of scrap (two are up in the trees — grapple for them).
7. **The Mechanic** — bring it to Pia; she straightens the old mail rocket out.
8. **Fuel Heist** — steal a fuel cell from the patrol depot. This gets LOUD.
9. **Launch!** — sprint back to the rocket and blast off the planet.

### Wanted ★★★

Punching depot guards (or being spotted un-disguised) raises your heat;
each star sends a patrol saucer after you in real time. Break away and it
cools. Get caught → busted (fined, dumped back on the beach). The disguise
keeps you cold — until the fuel heist trips the alarm and pins you at ★★★
for the final run.

## Controls

| Key | Action |
| --- | --- |
| `WASD` / arrows | Walk (island) |
| Mouse | Look / steer |
| `Space` | Grapple circled tree · jump · numbers 1–6 in slow-mo · advance dialogue |
| Left click / `E` | Tentacle-punch → **Zapper** once earned |

## Rebuilding from source

```
npm install
npm run build   # bundles src/ into index.html
```

Source lives in `src/` (`game.js`, `style.css`, `ui.html`).
