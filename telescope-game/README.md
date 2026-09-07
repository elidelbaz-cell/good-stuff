# Starfinder — a pocket telescope game

Sweep the night sky with a telescope, find twelve invented planets, and fill the
Planetary Index. Every world only shows itself at the right hour, in the right
part of the sky, and through good enough glass — so you earn credits from each
observation and spend them in the Workshop on a wider mirror, stronger
eyepieces, a steadier mount, a nebula filter, a better camera, and a star chart.

Runs in any phone browser as a single page. Add it to your home screen and it
behaves like an installed app (offline too, via the service worker).

## Play

- **Telescope** — drag to sweep the sky; pinch, or tap the ± buttons (press and
  hold to run through the range) to zoom from ×1 out to ×256, where a gas giant
  fills the whole eyepiece. **Tap a planet** and the mount swings onto it and
  picks a magnification that frames it. Centre one in the reticle and hold it
  there for three seconds to log an observation; the mount then tracks it, and a
  better mount tracks better.
  Points that do not twinkle are planets you have not zoomed into yet; faint
  smudges need a bigger mirror; hazy blobs are hiding in dust and need the filter.
- **Index** — the catalogue of all twelve entries. Unknown entries sell three
  hints each: *When* (hours and cadence), *Where* (bearing and altitude) and
  *Gear* (what the telescope needs). The **Tonight** tab is the almanac: it lists
  when each known planet rises and sets and whether it is up right now.
- **Workshop** — upgrades, plus *Sleep until dawn* to skip to the next night.
- The time button in the top bar runs the clock at 1×, 6× or 20× so you can
  wait for a late riser. A night lasts 18:00–06:00; each dawn pays a small grant.

A first discovery pays four times the planet's value. Each planet can be logged
once per night.

## The twelve worlds

| # | Planet | Kind | Faintness | Zoom | Filter | Cadence |
|---|--------|------|-----------|------|--------|---------|
| 1 | Aurelia | Banded gas giant | 1 | ×2 | – | every night |
| 2 | Thessaly | Ocean world | 1 | ×4 | – | every night |
| 3 | Marrow | Cratered dwarf | 2 | ×8 | – | every night |
| 4 | Vespera | Ringed ice giant | 2 | ×4 | – | every night |
| 5 | Kelthar | Lava world | 2 | ×8 | – | every other night |
| 6 | Cerule | Cloud giant | 3 | ×4 | – | every night |
| 7 | Nimbrel | Aurora ice world | 3 | ×8 | – | every other night |
| 8 | Quillon | Triple-ringed world | 3 | ×4 | yes | every night |
| 9 | Ilvane | Storm world | 4 | ×8 | yes | every night |
| 10 | Orrun | Contact binary | 4 | ×8 | – | every third night |
| 11 | Sable Nine | Dark bioluminescent world | 5 | ×8 | – | every other night |
| 12 | Pyrrhic Crown | Ember rogue | 5 | ×8 | yes | every third night |

## Files

```
telescope-game/
├── index.html            page shell
├── style.css             styles (mobile-first, safe-area aware)
├── game.js               sky simulation, eyepiece renderer, index, almanac, workshop, saves
├── planets.js            the planet catalogue: sky mechanics + SVG model for each world
├── manifest.json, icon.svg, sw.js   installable-app bits
├── build-single.js       bundles everything into dist/starfinder.html (one file to open anywhere)
└── design/
    ├── build-artboards.js   generates the Claude Design artboards from planets.js
    ├── Main.dc.html         the index sheet (all twelve models)
    ├── <Planet>.dc.html     one artboard per planet model
    └── canvas.json          canvas layout
```

## The sky

Stars are drawn as points of light, never as discs, so nothing in the star field
can be mistaken for a planet: they carry spectral colour (blue-white through
amber to red), brightness-scaled twinkle that worsens near the horizon, and
diffraction spikes on the brightest ones once you are past ×4. A band of faint
stars runs across the sky like a galaxy seen edge-on, with a handful of open
clusters and close double stars scattered through it. Planets are the things
that hold steady and grow into discs as you zoom.

## Planet models and Claude Design

Every planet model is a 200×200 SVG in `planets.js`. The same SVG is drawn on
the canvas in the eyepiece, shown in the index, and laid out on the Claude
Design canvas in `design/`. `node design/build-artboards.js` regenerates the
artboards after you change a model, so the design canvas and the game never
drift apart.

## Run locally

Serve the folder with any static server (the service worker needs http):

```
cd telescope-game
python3 -m http.server 8000
```

Then open `http://localhost:8000` on your phone (same Wi-Fi) or in a desktop
browser. Arrow keys pan and `+`/`-` zoom on a keyboard.

Or build the single-file version and open it directly:

```
node build-single.js
```

Progress is saved in the browser's local storage.
