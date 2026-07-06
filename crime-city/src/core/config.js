// All tuning numbers live here.

export const CITY = {
  blocks: 6,          // 6x6 grid
  block: 40,          // buildable block size
  street: 20,         // road 12 + 4 sidewalk each side
  road: 12,
  pitch: 60,
  min: -190, max: 190,          // city extent (streets included)
  parkBlock: [2, 2],            // block index that is the park
  dock: { x0: -252, x1: -190 }, // dock strip on the west edge
  waterX: -252,
};

// street centerlines (both axes)
export const ROADS = [-180, -120, -60, 0, 60, 120, 180];

export const BASE = {
  // warehouse by the docks, entrance faces east (toward the city)
  x0: -248, x1: -208, z0: -26, z1: 26,
  doorZ0: -3.5, doorZ1: 3.5, doorH: 5,
  wall: 0.9, height: 11,
  zone: { x0: -256, x1: -196, z0: -40, z1: 40 }, // safe zone rect
};

export const PLAYER = {
  eye: 1.65, radius: 0.42, height: 1.8,
  walk: 7.2, sprint: 11.5, accel: 42, air: 10,
  jump: 8.2, gravity: -26,
  hp: 100, regenDelay: 4, regen: 14, regenBase: 45,
  deathCashLoss: 0.3,
};

export const WEAPONS = {
  fists:   { name: 'FISTS',   melee: true, dmg: 34, rate: 2.2, range: 2.7 },
  pistol:  { name: 'PISTOL',  dmg: 22, rate: 5,  mag: 12, reload: 1.1, spread: 0.012, auto: false, kick: 0.5 },
  tommy:   { name: 'TOMMY',   dmg: 11, rate: 11, mag: 40, reload: 1.9, spread: 0.034, auto: true,  kick: 0.28, cost: 2500 },
  shotgun: { name: 'SHOTGUN', dmg: 9,  rate: 1.15, mag: 6, reload: 2.2, spread: 0.075, auto: false, kick: 1.1, pellets: 8, cost: 4200 },
};
export const AMMO_PACKS = {
  pistol:  { amount: 36, cost: 120 },
  tommy:   { amount: 80, cost: 260 },
  shotgun: { amount: 16, cost: 220 },
};

export const BOUNTY = {
  cop: 50_000, swat: 75_000, copCar: 100_000, swatVan: 120_000,
  stickup: 250_000, turf: 400_000, escort: 750_000, chase: 1_000_000,
  GOAL: 10_000_000,
};
export const CASH = {
  cop: 150, swat: 300, copCar: 400, stickup: 1500,
  turfCapture: 800, turfTick: 100, escort: 4000, chase: 5000,
};

export const TIERS = [
  { bounty: 0,         squad: 2,  unlock: 'thug',      label: 'STREET THUGS' },
  { bounty: 500_000,   squad: 4,  unlock: 'gunman',    label: 'GUNMEN' },
  { bounty: 1_500_000, squad: 6,  unlock: 'enforcer',  label: 'ENFORCERS' },
  { bounty: 3_000_000, squad: 8,  unlock: 'bruiser',   label: 'BRUISERS' },
  { bounty: 5_000_000, squad: 10, unlock: 'veteran',   label: 'VETERANS' },
  { bounty: 8_000_000, squad: 12, unlock: 'bodyguard', label: 'BODYGUARDS' },
];

export const HENCH = {
  thug:      { name: 'Street Thug', cost: 500,  hp: 70,  weapon: 'bat',     dmg: 22, rate: 1.3, range: 2.4,  speed: 6.8 },
  gunman:    { name: 'Gunman',      cost: 1200, hp: 90,  weapon: 'pistol',  dmg: 14, rate: 1.6, range: 38,   speed: 6.4 },
  enforcer:  { name: 'Enforcer',    cost: 2600, hp: 135, weapon: 'tommy',   dmg: 8,  rate: 6.5, range: 32,   speed: 6.2 },
  bruiser:   { name: 'Bruiser',     cost: 4200, hp: 230, weapon: 'shotgun', dmg: 38, rate: 0.9, range: 16,   speed: 5.8 },
  veteran:   { name: 'Veteran',     cost: 6500, hp: 155, weapon: 'rifle',   dmg: 27, rate: 1.7, range: 55,   speed: 6.6 },
  bodyguard: { name: 'Bodyguard',   cost: 9000, hp: 330, weapon: 'pistol',  dmg: 17, rate: 2.2, range: 34,   speed: 7.4 },
};

export const UPGRADES = {
  doors:   { name: 'Reinforced Doors', cost: 3000, desc: 'Cops can never follow you inside. Heat drops fast indoors.' },
  medical: { name: 'Medical Station',  cost: 2500, desc: 'Heal much faster at the base.' },
  armory:  { name: 'Armory',           cost: 2000, desc: 'Ammo costs 40% less.' },
  lookout: { name: 'Lookout',          cost: 1500, desc: 'Cops show on your minimap.' },
};

export const POLICE = {
  copHP: 60, swatHP: 170, carHP: 130, vanHP: 320, truckHP: 2600,
  copDmg: [4, 8], swatDmg: [7, 12],
  copsByStar: [0, 3, 5, 8, 10, 13],
  carsByStar: [0, 0, 1, 2, 2, 3],
  vansByStar: [0, 0, 0, 0, 1, 2],
  decayTime: 15,        // seconds unseen before losing a star
  maxCops: 14, maxSwat: 10,
};

export const MOB_COLORS = ['#e33b3b', '#3b7be3', '#2fbf4f', '#c33be0', '#ff8b1f', '#12c9c9'];

export const HENCH_NAMES = [
  'Vinny', 'Sal', 'Rocco', 'Lefty', 'Knuckles', 'Big Tony', 'Slim', 'Mo',
  'The Ferret', 'Ice', 'Gino', 'Paulie', 'Freddy Two-Hats', 'Bricks', 'Ace',
  'Little Mike', 'Sticks', 'Duke', 'Marbles', 'Cheddar', 'Nails', 'Smokes',
];
