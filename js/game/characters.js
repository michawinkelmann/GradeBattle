import { getCharSprite } from '../render/sprites.js';
import { MAX_POINTS } from './grades.js';

export const CHAR_W = 10;
export const CHAR_H = 18;
export const WALK_SPEED = 50;       // px/s
export const JUMP_VY = -180;
export const MOVE_BUDGET = 200;     // px per turn

// Shirt/hair color combos for visual differentiation.
const VARIANTS = [
  { shirt: 'B', hair: 'h', kind: 'student' },
  { shirt: 'R', hair: 'Y', kind: 'student' },
  { shirt: 'G', hair: 'H', kind: 'student' },
  { shirt: 'P', hair: 'h', kind: 'student' },
  { shirt: 'C', hair: 'H', kind: 'teacher' },
  { shirt: 'O', hair: 'Y', kind: 'teacher' }
];

export function makeCharacter(opts) {
  const variant = VARIANTS[opts.variantIndex % VARIANTS.length];
  return {
    id: opts.id,
    name: opts.name,
    isBot: !!opts.isBot,
    botLevel: opts.botLevel || 'medium',
    isLocal: opts.isLocal !== false, // default true (for local hotseat / host)
    peerId: opts.peerId || null,
    x: opts.x,
    y: opts.y,
    w: CHAR_W,
    h: CHAR_H,
    vx: 0,
    vy: 0,
    facing: opts.facing || 1,
    grounded: false,
    state: 'stand',       // stand | walk | throw | sit
    stateTime: 0,
    points: MAX_POINTS,
    outOfGame: false,
    outOfWorld: false,
    moveLeft: MOVE_BUDGET,
    variant,
    selectedWeaponIdx: 0,
    weaponAmmo: { apfel: 2 },
    effectsActive: [],       // e.g. energydrink (extra movement)
    pendingExtraJump: false
  };
}

export function setState(ch, s) {
  if (ch.state !== s) { ch.state = s; ch.stateTime = 0; }
}

export function drawCharacter(ctx, ch) {
  if (ch.outOfWorld) return;
  // Soft shadow on the ground while the character is on or near it.
  if (ch.grounded) {
    ctx.fillStyle = 'rgba(10,12,30,0.25)';
    ctx.beginPath();
    ctx.ellipse(ch.x, ch.y + 1, 6, 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Walk cycle ~6 fps; throw plays wind-up -> release.
  let frame = 0;
  if (ch.state === 'walk') frame = Math.floor(ch.stateTime * 6);
  else if (ch.state === 'throw') frame = ch.stateTime < 0.12 ? 0 : 1;
  const sp = getCharSprite(ch.outOfGame ? 'sit' : ch.state, ch.variant, frame);
  const flip = ch.facing < 0;
  const sx = Math.round(ch.x - sp.width / 2);
  const sy = Math.round(ch.y - sp.height);
  if (flip) {
    ctx.save();
    ctx.translate(sx + sp.width, sy);
    ctx.scale(-1, 1);
    ctx.drawImage(sp, 0, 0);
    ctx.restore();
  } else {
    ctx.drawImage(sp, sx, sy);
  }

  // Name + grade bar above head.
  if (!ch.outOfGame) {
    const bw = 16, bh = 2;
    const bx = Math.round(ch.x - bw / 2);
    const by = sy - 4;
    ctx.fillStyle = 'rgba(10,12,30,0.8)';
    ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
    const t = ch.points / MAX_POINTS;
    const col = `rgb(${Math.round(110 + (1 - t) * 145)},${Math.round(80 + t * 140)},${Math.round(80)})`;
    ctx.fillStyle = col;
    ctx.fillRect(bx, by, Math.round(bw * t), bh);
  }
}

export function spawnPositions(count, terrain) {
  // Spread evenly with a comfortable margin so all players are reachable.
  const out = [];
  const margin = 320;
  const span = Math.max(200, terrain.width - margin * 2);
  for (let i = 0; i < count; i++) {
    const x = margin + (count === 1 ? span / 2 : (i / (count - 1)) * span);
    const y = (terrain.heights[x | 0] || terrain.height * 0.5) - 2;
    out.push({ x, y });
  }
  return out;
}
