import { MOB_COLORS, TIERS } from './config.js';
import { hashStr } from './utils.js';

export const SAVE_KEY = 'crimecity-save-v1';

export function defaultState(mobName = 'The Family', mobColor = null) {
  return {
    version: 1,
    mobName,
    mobColor: mobColor || MOB_COLORS[hashStr(mobName) % MOB_COLORS.length],
    bounty: 0,
    cash: 500,
    weapons: { pistol: true, tommy: false, shotgun: false },
    ammo: { pistol: 60, tommy: 0, shotgun: 0 },
    upgrades: { doors: false, medical: false, armory: false, lookout: false },
    henchmen: [],            // array of type keys, e.g. ['thug','thug']
    turf: [],                // captured turf ids
    stats: { time: 0, bountyEarned: 0, henchLost: 0, copsDowned: 0 },
    wonGame: false,
    night: false,
  };
}

export function saveGame(state) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); return true; }
  catch { return false; }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || s.version !== 1) return null;
    // merge over defaults so missing fields never crash
    return { ...defaultState(s.mobName, s.mobColor), ...s,
      weapons: { ...defaultState().weapons, ...s.weapons },
      ammo: { ...defaultState().ammo, ...s.ammo },
      upgrades: { ...defaultState().upgrades, ...s.upgrades },
      stats: { ...defaultState().stats, ...s.stats } };
  } catch { return null; }
}

export const hasSave = () => !!localStorage.getItem(SAVE_KEY);
export const clearSave = () => localStorage.removeItem(SAVE_KEY);

export function tierIndex(bounty) {
  let idx = 0;
  for (let i = 0; i < TIERS.length; i++) if (bounty >= TIERS[i].bounty) idx = i;
  return idx;
}
export const maxSquad = (bounty) => TIERS[tierIndex(bounty)].squad;
