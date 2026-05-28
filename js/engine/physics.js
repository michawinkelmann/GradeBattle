import { isSolid, explodeAt, WORLD_W, WORLD_H } from './terrain.js';

export const GRAVITY = 380;          // px/s^2
export const WIND_FACTOR = 80;        // px/s^2 per unit windFactor * wind
export const MAX_FALL = 600;

// Step a projectile with fine sub-stepping to avoid tunneling.
// Returns { hit: bool, x, y, reason }.
export function stepProjectile(p, terrain, wind, dt) {
  const speed = Math.hypot(p.vx, p.vy);
  // Sub-step so per-substep movement < 2px.
  const subSteps = Math.max(1, Math.ceil(speed * dt / 2));
  const sdt = dt / subSteps;
  const windAcc = (p.windFactor || 0) * wind * WIND_FACTOR;
  const gravity = p.gravityScale != null ? GRAVITY * p.gravityScale : GRAVITY;

  for (let i = 0; i < subSteps; i++) {
    p.vx += windAcc * sdt;
    p.vy += gravity * sdt;
    if (p.vy > MAX_FALL) p.vy = MAX_FALL;
    const nx = p.x + p.vx * sdt;
    const ny = p.y + p.vy * sdt;

    // Off-world
    if (nx < -50 || nx > WORLD_W + 50 || ny > WORLD_H + 100) {
      p.x = nx; p.y = ny;
      return { hit: true, reason: 'offworld' };
    }

    if (isSolid(terrain, nx, ny)) {
      p.x = nx; p.y = ny;
      return { hit: true, reason: 'terrain' };
    }
    p.x = nx; p.y = ny;
  }
  return { hit: false };
}

// Simple AABB-vs-terrain for character movement; returns updated x,y and grounded flag.
// Tries to step up small ledges.
export function moveCharacter(ch, terrain, dt) {
  ch.vy += GRAVITY * dt;
  if (ch.vy > MAX_FALL) ch.vy = MAX_FALL;

  const dx = ch.vx * dt;
  const dy = ch.vy * dt;

  // Horizontal move with step-up.
  if (dx !== 0) {
    const sign = dx > 0 ? 1 : -1;
    const steps = Math.max(1, Math.ceil(Math.abs(dx)));
    for (let i = 0; i < steps; i++) {
      const tryX = ch.x + sign;
      if (!collideChar(terrain, tryX, ch.y, ch.w, ch.h)) {
        ch.x = tryX;
      } else {
        // Try step-up by up to 4 px.
        let stepped = false;
        for (let s = 1; s <= 4; s++) {
          if (!collideChar(terrain, tryX, ch.y - s, ch.w, ch.h)) {
            ch.y -= s;
            ch.x = tryX;
            stepped = true;
            break;
          }
        }
        if (!stepped) { ch.vx = 0; break; }
      }
    }
  }

  // Vertical move.
  ch.grounded = false;
  const vSteps = Math.max(1, Math.ceil(Math.abs(dy)));
  const vSign = dy > 0 ? 1 : -1;
  for (let i = 0; i < vSteps; i++) {
    const tryY = ch.y + vSign;
    if (!collideChar(terrain, ch.x, tryY, ch.w, ch.h)) {
      ch.y = tryY;
    } else {
      if (vSign > 0) ch.grounded = true;
      ch.vy = 0;
      break;
    }
  }

  // Off-world fall.
  if (ch.y - ch.h > WORLD_H + 50 || ch.x < -100 || ch.x > WORLD_W + 100) {
    ch.outOfWorld = true;
  }
}

export function collideChar(terrain, x, y, w, h) {
  // x,y is bottom-center; sample a few points along feet & body.
  const left = (x - w / 2) | 0;
  const right = (x + w / 2) | 0;
  const top = (y - h) | 0;
  const bottom = y | 0;
  for (let sx = left; sx <= right; sx += 2) {
    if (isSolid(terrain, sx, bottom)) return true;
  }
  // Body sides.
  for (let sy = top; sy <= bottom; sy += 3) {
    if (isSolid(terrain, left, sy)) return true;
    if (isSolid(terrain, right, sy)) return true;
  }
  return false;
}

// Apply explosion impulse to a target character; returns damage 0..1 scaled by config.
export function applyExplosion(target, ex, ey, radius, force = 200) {
  const cx = target.x;
  const cy = target.y - target.h / 2;
  const dx = cx - ex;
  const dy = cy - ey;
  const d = Math.hypot(dx, dy);
  if (d > radius * 1.3) return 0;
  const t = 1 - Math.min(1, d / radius);
  const nx = d === 0 ? 0 : dx / d;
  const ny = d === 0 ? -1 : dy / d;
  target.vx += nx * force * t;
  target.vy += ny * force * t - 60 * t;
  target.grounded = false;
  return t; // 0..1 closeness factor
}

// Trajectory preview points (no terrain collision, just visualization).
export function previewTrajectory(x, y, vx, vy, wind, windFactor, steps = 28, stepSize = 0.04) {
  const pts = [];
  let px = x, py = y;
  let pvx = vx, pvy = vy;
  for (let i = 0; i < steps; i++) {
    pvx += windFactor * wind * WIND_FACTOR * stepSize;
    pvy += GRAVITY * stepSize;
    px += pvx * stepSize;
    py += pvy * stepSize;
    if (px < 0 || px > WORLD_W || py > WORLD_H) break;
    pts.push({ x: px, y: py });
  }
  return pts;
}
