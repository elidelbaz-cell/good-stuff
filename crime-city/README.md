# CRIME CITY — New Amsterdam

A low-poly, first-person, open-world crime game built with **Three.js + Vite**.
Chunky flat-shaded visuals, arcade over-the-top action, no gore. Name your mob,
bounty your way from **$0 to $10,000,000**, build a henchman army, and fight the
whole NYPD in one last stand.

## Play it

**Option A — the single file (no install):**
Open **`crime-city.html`** in a browser. That's the whole game in one
self-contained file (Three.js bundled in, every texture is generated at runtime,
all sound is synthesized — nothing to download). Just double-click it.

**Option B — dev server:**
```bash
npm install
npm run dev      # then open the printed http://localhost:5173
```

**Rebuild the single file:**
```bash
npm run singlefile   # writes crime-city.html
```

## Controls

| Key | Action |
|-----|--------|
| **WASD** | move / drive |
| **Mouse** | look / shoot |
| **Shift** | sprint |
| **Space** | jump (helicopter: ascend) |
| **Ctrl** | helicopter: descend |
| **1–8 / scroll** | weapons (fists, pistol, tommy, shotgun, rifle, minigun, molotov, RPG) |
| **R** | reload |
| **E** | interact — rob stores, deal drugs, enter/hijack vehicles, base stations, revive crew |
| **F / G / T** | squad: follow / hold position / attack my target |
| **N** | day / night |
| **Esc** | pause |

Testing keys (also listed in-game under Controls): `[` +$250k bounty · `]` +$5k
cash · `K` +1 wanted star.

## How it plays

- **The city** — a Manhattan-flavored instanced grid: brownstones, glass towers,
  a park, the docks, taxis and parked cars, pedestrians who flee at gunfire,
  scattering pigeons, day/night lighting and a skyline.
- **Your base** — a dock warehouse with your mob's name glowing over the door.
  Walk in to spend cash: unlock weapons, recruit henchmen, buy upgrades
  (reinforced doors / medical / armory / lookout), heal, and save. It's a safe
  zone — until the finale.
- **Bounty is the progression.** Make money and infamy a dozen ways:
  - **Store robberies** — walk in strapped, take out the clerk, then crack the safe.
  - **Drug corners** — deal product at the green corners (fast cash, brings heat).
  - **Arson** — torch cars and storefronts with the molotov.
  - **Vehicle theft** — hijack cop cars, steal the **helicopter** off its dock pad
    (and fly it, with a chin gun), or take the **cargo ship** moored at the docks.
  - Plus taking out cops, wrecking cop cars, turf takeovers, escort runs, and
    surviving 5-star chases.
- **8 weapons** — fists, pistol, tommy gun, shotgun, assault rifle, minigun,
  molotov, and RPG.
- Every bounty tier unlocks a bigger squad and a tougher recruit class:
  Thugs ($0) → Gunmen ($500k) → Enforcers ($1.5M) → Bruisers ($3M) →
  Veterans ($5M) → **Bodyguards ($8M)**, up to a **12-man crew**.
- **Wanted stars 1–5** scale the heat: more cops, cop cars, then SWAT vans and
  shield squads.
- **The final brawl** — hit **$10,000,000** and the whole NYPD converges on your
  base. You and your full army fight out the front door through escalating waves
  of police, SWAT, and an armored riot truck. Win → *THE CITY IS YOURS*.

Progress (mob name, color, bounty, cash, weapons, upgrades, henchmen, turf) saves
to `localStorage` automatically whenever you step inside your base.
