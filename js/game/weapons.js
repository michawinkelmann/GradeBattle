// Datengetriebene Waffendefinitionen. Engine-Behandlung erfolgt in effects.js / turn.js.

export const WEAPONS = [
  {
    id: 'papierflieger',
    archetype: 'direct',
    projectile: 'paper',
    damage: 24, radius: 30, windFactor: 1.0, projectileMass: 0.4,
    fuseSeconds: null, gravityScale: 0.5
  },
  {
    id: 'zirkel',
    archetype: 'direct',
    projectile: 'compass',
    damage: 40, radius: 18, windFactor: 0.2, projectileMass: 1.0,
    fuseSeconds: null, gravityScale: 0.7
  },
  {
    id: 'buchwurf',
    archetype: 'lobbed',
    projectile: 'book',
    damage: 28, radius: 42, windFactor: 0.3, projectileMass: 1.0,
    fuseSeconds: null
  },
  {
    id: 'wasserbombe',
    archetype: 'lobbed',
    projectile: 'water',
    damage: 22, radius: 55, windFactor: 0.4, projectileMass: 0.9,
    fuseSeconds: null, knockback: 320
  },
  {
    id: 'bananenschale',
    archetype: 'cluster',
    projectile: 'banana',
    damage: 16, radius: 35, windFactor: 0.3, projectileMass: 0.8,
    fuseSeconds: null, bounces: 2, cluster: 4
  },
  {
    id: 'laptop',
    archetype: 'heavy',
    projectile: 'laptop',
    damage: 38, radius: 65, windFactor: 0.0, projectileMass: 1.8,
    fuseSeconds: null, gravityScale: 1.4
  },
  {
    id: 'megaphon',
    archetype: 'heavy',
    projectile: 'megaphone',
    damage: 20, radius: 70, windFactor: 0.0, projectileMass: 1.2,
    fuseSeconds: null, knockback: 480
  },
  {
    id: 'schulranzen',
    archetype: 'cluster',
    projectile: 'book',
    damage: 14, radius: 30, windFactor: 0.3, projectileMass: 1.3,
    fuseSeconds: null, cluster: 5
  },
  {
    id: 'kreidegewehr',
    archetype: 'salvo',
    projectile: 'chalk',
    damage: 8, radius: 12, windFactor: 0.5, projectileMass: 0.3,
    fuseSeconds: null, salvoCount: 5, salvoInterval: 0.12, gravityScale: 0.3
  },
  {
    id: 'referat',
    archetype: 'area',
    damage: 26, radius: 80, windFactor: 0
  },
  {
    id: 'stinkekaese',
    archetype: 'lingering',
    projectile: 'sandwich',
    damage: 10, radius: 50, windFactor: 0.2, projectileMass: 0.9,
    lingerRounds: 2
  },
  {
    id: 'blauer_brief',
    archetype: 'homing',
    projectile: 'letter',
    damage: 30, radius: 28, windFactor: 0.2, projectileMass: 0.5,
    homing: true, homingStrength: 220
  },
  {
    id: 'hausaufgaben',
    archetype: 'airstrike',
    projectile: 'homework',
    damage: 18, radius: 25, windFactor: 0.3, projectileMass: 1.0,
    strikeCount: 5
  },
  {
    id: 'reisszwecke',
    archetype: 'mine',
    projectile: 'tack',
    damage: 30, radius: 35, windFactor: 0
  },
  {
    id: 'energydrink',
    archetype: 'utility',
    utility: 'extraMove'
  },
  {
    id: 'springseil',
    archetype: 'utility',
    utility: 'rope'
  },
  {
    id: 'spickzettel',
    archetype: 'utility',
    utility: 'teleport'
  },
  {
    id: 'tippex',
    archetype: 'utility',
    utility: 'eraseTerrain',
    radius: 35
  },
  {
    id: 'tisch',
    archetype: 'utility',
    utility: 'placePlatform'
  },
  {
    id: 'apfel',
    archetype: 'utility',
    utility: 'heal',
    healAmount: 20
  },
  {
    id: 'passen',
    archetype: 'utility',
    utility: 'pass'
  }
];

export function getWeaponById(id) {
  return WEAPONS.find(w => w.id === id);
}

export function getWeaponByIndex(i) {
  return WEAPONS[((i % WEAPONS.length) + WEAPONS.length) % WEAPONS.length];
}

// Per-archetype presentation metadata for the weapon wheel: a colour for the
// type badge and the i18n key suffix (weaponcat.<key>) for its label.
export const ARCHETYPE_META = {
  direct:    { key: 'direct',    color: '#4ad6ff' },
  lobbed:    { key: 'lobbed',    color: '#6ee37d' },
  heavy:     { key: 'heavy',     color: '#ef5b5b' },
  cluster:   { key: 'cluster',   color: '#ff8a3a' },
  salvo:     { key: 'salvo',     color: '#ff8a3a' },
  area:      { key: 'area',      color: '#a05bcf' },
  lingering: { key: 'lingering', color: '#c9974c' },
  homing:    { key: 'homing',    color: '#3a5fb0' },
  airstrike: { key: 'airstrike', color: '#a05bcf' },
  mine:      { key: 'mine',      color: '#ef5b5b' },
  utility:   { key: 'utility',   color: '#b9c0d8' }
};

// Broad usage mode that tells the player *how* a weapon is fired. This is the
// primary grouping in the weapon wheel.
//   'aim'     – drag from the character to aim & throw
//   'place'   – tap a spot on the map (airstrike, teleport, erase, platform)
//   'instant' – takes effect immediately on yourself / around you
export function weaponUsage(w) {
  if (isPlaceable(w)) return 'place';
  if (isInstant(w)) return 'instant';
  return 'aim';
}

// Returns true if weapon can be aimed (drag-fire); false for area/utility/airstrike modes.
export function isAimable(w) {
  return ['direct', 'lobbed', 'heavy', 'cluster', 'salvo', 'lingering', 'homing', 'mine'].includes(w.archetype);
}

// True for click-on-map weapons (airstrike, teleport, place platform, erase).
export function isPlaceable(w) {
  if (w.archetype === 'airstrike') return true;
  if (w.archetype === 'utility' && ['teleport', 'eraseTerrain', 'placePlatform'].includes(w.utility)) return true;
  return false;
}

// True for instant self-target weapons (no aiming required).
export function isInstant(w) {
  if (w.archetype === 'area') return true;
  if (w.archetype === 'utility' && ['heal', 'extraMove', 'pass', 'rope'].includes(w.utility)) return true;
  return false;
}
