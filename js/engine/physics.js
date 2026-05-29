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
    let nx = p.x + p.vx * sdt;
    let ny = p.y + p.vy * sdt;

    // Side / top walls: bounce off so projectiles stay in play.
    if (nx < 2) { nx = 2; p.vx = Math.abs(p.vx) * 0.55; }
    if (nx > WORLD_W - 2) { nx = WORLD_W - 2; p.vx = -Math.abs(p.vx) * 0.55; }
    if (ny < -40) { ny = -40; p.vy = Math.abs(p.vy) * 0.4; }

    // Off-world only when falling past the bottom of the map.
    if (ny > WORLD_H + 100) {
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
const MAX_CHAR_VX = 220;
export function moveCharacter(ch, terrain, dt) {
  ch.vy += GRAVITY * dt;
  if (ch.vy > MAX_FALL) ch.vy = MAX_FALL;
  if (ch.vx > MAX_CHAR_VX) ch.vx = MAX_CHAR_VX;
  if (ch.vx < -MAX_CHAR_VX) ch.vx = -MAX_CHAR_VX;

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

  // Friction once grounded so impulses fade when char lands.
  // Active walking is enforced from main.js by re-setting vx each frame,
  // so dampening it here is fine.
  if (ch.grounded) ch.vx *= Math.pow(0.01, dt);

  // Solid school-fence walls at world borders. The character bounces back
  // softly instead of falling off the map sideways.
  if (ch.x < 4) {
    ch.x = 4;
    if (ch.vx < 0) ch.vx = -ch.vx * 0.35;
  }
  if (ch.x > WORLD_W - 4) {
    ch.x = WORLD_W - 4;
    if (ch.vx > 0) ch.vx = -ch.vx * 0.35;
  }
  // Soft top so a strong upward knockback doesn't fly off the top of the world.
  if (ch.y - ch.h < -4) {
    ch.y = ch.h - 4;
    if (ch.vy < 0) ch.vy = 0;
  }

  // Only a true fall through the floor counts as out-of-world.
  if (ch.y - ch.h > WORLD_H + 50) ch.outOfWorld = true;
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
export function applyExplosion(target, ex, ey, radius, force = 120) {
  const cx = target.x;
  const cy = target.y - target.h / 2;
  const dx = cx - ex;
  const dy = cy - ey;
  const d = Math.hypot(dx, dy);
  if (d > radius * 1.3) return 0;
  const t = 1 - Math.min(1, d / radius);
  const nx = d === 0 ? 0 : dx / d;
  const ny = d === 0 ? -1 : dy / d;
  // Cap impulse so a single hit never throws a character off the map.
  const impulseX = Math.max(-180, Math.min(180, nx * force * t));
  const impulseY = Math.max(-200, Math.min(120, ny * force * t - 40 * t));
  target.vx += impulseX;
  target.vy += impulseY;
  target.grounded = false;
  return t;
}

// Trajectory preview points (no terrain collision, just visualization).
// gravityScale lets the preview match weapons with non-standard gravity
// (paper plane, compass, chalk, laptop, ...).
export function previewTrajectory(x, y, vx, vy, wind, windFactor, steps = 60, stepSize = 0.05, gravityScale = 1) {
  const pts = [];
  let px = x, py = y;
  let pvx = vx, pvy = vy;
  const g = GRAVITY * gravityScale;
  for (let i = 0; i < steps; i++) {
    pvx += windFactor * wind * WIND_FACTOR * stepSize;
    pvy += g * stepSize;
    px += pvx * stepSize;
    py += pvy * stepSize;
    if (px < 0 || px > WORLD_W || py > WORLD_H) break;
    pts.push({ x: px, y: py });
  }
  return pts;
}
