import { WEAPONS, isAimable, isInstant, isPlaceable } from '../game/weapons.js';
import { GRAVITY, WIND_FACTOR } from '../engine/physics.js';
import { fireWeapon } from '../game/effects.js';
import { markFired } from '../game/turn.js';
import { isSolid, WORLD_W, WORLD_H } from '../engine/terrain.js';

const PREFERRED_WEAPONS = {
  easy: ['buchwurf', 'wasserbombe', 'zirkel'],
  medium: ['buchwurf', 'wasserbombe', 'zirkel', 'laptop', 'papierflieger', 'bananenschale', 'megaphon'],
  hard: ['buchwurf', 'laptop', 'megaphon', 'zirkel', 'wasserbombe', 'blauer_brief', 'kreidegewehr', 'schulranzen']
};

// Returns plan or null if not ready to commit yet.
// state: full game state; bot: character (active player & isBot)
export function planBotTurn(state, bot) {
  const level = bot.botLevel || 'medium';
  const allowed = PREFERRED_WEAPONS[level] || PREFERRED_WEAPONS.medium;
  const wpns = WEAPONS.filter(w => allowed.includes(w.id) && (isAimable(w) || w.id === 'apfel'));

  // Self-heal sometimes if low, but only while apples remain.
  const apples = bot.weaponAmmo?.apfel ?? 0;
  if (apples > 0 && bot.points < 30 && state.rng.next() < (level === 'hard' ? 0.85 : 0.4)) {
    return { weaponId: 'apfel', mode: 'instant', params: {} };
  }

  // Find target = closest enemy.
  const targets = state.players.filter(p => !p.outOfGame && !p.outOfWorld && p.id !== bot.id);
  if (targets.length === 0) return { weaponId: 'passen', mode: 'instant', params: {} };
  targets.sort((a, b) => Math.hypot(a.x - bot.x, a.y - bot.y) - Math.hypot(b.x - bot.x, b.y - bot.y));
  const target = targets[0];

  // Pick a weapon.
  const weapon = wpns[Math.floor(state.rng.next() * wpns.length)] || WEAPONS.find(w => w.id === 'buchwurf');

  // Compute aim.
  const aim = solveAim(state, bot, target, weapon, level);
  if (!aim) {
    return { weaponId: 'passen', mode: 'instant', params: {} };
  }
  return { weaponId: weapon.id, mode: 'aim', params: aim };
}

// Returns { angle, power } or null.
function solveAim(state, bot, target, weapon, level) {
  // Sample angles & powers, simulate flight; pick the one with smallest distance to target.
  const triesAngle = level === 'hard' ? 28 : level === 'medium' ? 16 : 8;
  const triesPower = level === 'hard' ? 8 : level === 'medium' ? 5 : 3;
  const angles = [];
  const dirX = target.x - bot.x;
  const sign = dirX >= 0 ? 1 : -1;
  // Lobbed = high arcs; direct = flat arcs.
  const arcType = weapon.archetype;
  const angleMin = arcType === 'direct' ? -0.6 : -1.4;
  const angleMax = arcType === 'direct' ? 0.6 : -0.1;
  for (let i = 0; i < triesAngle; i++) {
    const t = i / Math.max(1, triesAngle - 1);
    let a = angleMin + (angleMax - angleMin) * t;
    a = sign === 1 ? a : Math.PI - a;
    angles.push(a);
  }

  let best = null;
  let bestD = Infinity;
  for (const a of angles) {
    for (let pi = 0; pi < triesPower; pi++) {
      const power = 0.15 + (pi / Math.max(1, triesPower - 1)) * 0.85;
      const imp = simulateFlight(state, bot, weapon, a, power, target);
      if (imp.d < bestD) {
        bestD = imp.d;
        best = { angle: a, power };
      }
    }
  }
  if (!best) return null;
  // Add some inaccuracy by level.
  const noiseAngle = level === 'hard' ? 0.02 : level === 'medium' ? 0.07 : 0.18;
  const noisePower = level === 'hard' ? 0.02 : level === 'medium' ? 0.06 : 0.18;
  best.angle += (state.rng.next() - 0.5) * 2 * noiseAngle;
  best.power = Math.max(0.2, Math.min(1, best.power + (state.rng.next() - 0.5) * 2 * noisePower));
  return best;
}

function simulateFlight(state, bot, weapon, angle, power, target) {
  const speed = power * 750;
  let x = bot.x + Math.cos(angle) * 12;
  let y = bot.y - bot.h * 0.7 + Math.sin(angle) * 12;
  let vx = Math.cos(angle) * speed;
  let vy = Math.sin(angle) * speed;
  const dt = 1 / 30;
  const wind = state.wind;
  const windAcc = (weapon.windFactor || 0) * wind * WIND_FACTOR;
  const grav = GRAVITY * (weapon.gravityScale != null ? weapon.gravityScale : 1);
  let minD = Infinity;
  for (let step = 0; step < 120; step++) {
    vx += windAcc * dt;
    vy += grav * dt;
    x += vx * dt;
    y += vy * dt;
    if (x < 0 || x > WORLD_W || y > WORLD_H + 50) break;
    const d = Math.hypot(x - target.x, y - (target.y - target.h / 2));
    if (d < minD) minD = d;
    if (isSolid(state.terrain, x, y)) break;
  }
  return { d: minD };
}

export function executeBotPlan(state, bot, plan) {
  const weapon = WEAPONS.find(w => w.id === plan.weaponId);
  if (!weapon) return;
  if (plan.mode === 'instant') {
    fireWeapon(state, bot, weapon, {});
  } else if (plan.mode === 'aim') {
    fireWeapon(state, bot, weapon, plan.params);
    markFired(state);
  } else if (plan.mode === 'place') {
    fireWeapon(state, bot, weapon, plan.params);
    markFired(state);
  }
}
