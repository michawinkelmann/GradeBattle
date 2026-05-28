import { getCharSprite } from '../render/sprites.js';
import { MAX_POINTS } from './grades.js';

export const CHAR_W = 10;
export const CHAR_H = 18;
export const WALK_SPEED = 55;       // px/s
export const JUMP_VY = -200;
export const MOVE_BUDGET = 340;     // px per turn (was 200 — too tight for tablet play)
export const JUMP_COST = 15;        // px deducted per jump (was 30)

// Shirt/hair color combos + style modifiers for visual differentiation.
// style: 'default' | 'pony' (ponytail) | 'bun' | 'short'
// glasses: bool — small frames over the eyes
export const SHIRT_OPTIONS = ['B', 'R', 'G', 'P', 'C', 'O', 'Y'];
export const HAIR_OPTIONS  = ['h', 'H', 'Y', 'K'];          // brown / dark / blond / black
export const STYLE_OPTIONS = ['default', 'pony', 'bun', 'short'];

export const SHIRT_HEX = { B: '#3a5fb0', R: '#ef5b5b', G: '#4caf50', P: '#a05bcf', C: '#4ad6ff', O: '#ff8a3a', Y: '#ffd54a' };
export const HAIR_HEX  = { h: '#a06030', H: '#3a2820', Y: '#ffd54a', K: '#0a0c1e' };

export const DEFAULT_VARIANTS = [
  { shirt: 'B', hair: 'h', kind: 'student', style: 'default', glasses: false },
  { shirt: 'R', hair: 'Y', kind: 'student', style: 'pony',    glasses: false },
  { shirt: 'G', hair: 'H', kind: 'student', style: 'bun',     glasses: false },
  { shirt: 'P', hair: 'h', kind: 'student', style: 'short',   glasses: true  },
  { shirt: 'C', hair: 'H', kind: 'teacher', style: 'default', glasses: true  },
  { shirt: 'O', hair: 'Y', kind: 'teacher', style: 'bun',     glasses: false }
];

export function makeVariant({ shirt = 'B', hair = 'h', style = 'default', glasses = false, kind = 'student' } = {}) {
  return {
    shirt: SHIRT_OPTIONS.includes(shirt) ? shirt : 'B',
    hair: HAIR_OPTIONS.includes(hair) ? hair : 'h',
    style: STYLE_OPTIONS.includes(style) ? style : 'default',
    glasses: !!glasses,
    kind
  };
}

export function makeCharacter(opts) {
  const variant = opts.variant
    ? makeVariant(opts.variant)
    : DEFAULT_VARIANTS[opts.variantIndex % DEFAULT_VARIANTS.length];
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

  // Style overlays: hair extras + glasses. Drawn in unflipped screen space,
  // anchored to the sprite's head region. The "frame" param lets us track tilt
  // (currently only used for the ponytail bobbing as the character walks).
  if (!ch.outOfGame) {
    drawCharOverlays(ctx, ch, sx, sy, flip, frame);
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

// Resolve a palette key letter (H/h/Y/Z) to the actual hex color used by sprites.js.
// Used so the head overlays match the chosen hair color.
const HAIR_COLORS = {
  H: '#3a2820', h: '#a06030', Y: '#ffd54a', Z: '#b8941f', K: '#0a0c1e'
};

function drawCharOverlays(ctx, ch, sx, sy, flip, frame) {
  const v = ch.variant || {};
  const hairColor = HAIR_COLORS[v.hair] || HAIR_COLORS.h;
  const headTop = sy;                 // top of the 18-tall sprite
  const headCenterX = sx + 6;         // sprite is 12 wide, head sits at columns 2..9
  const eyeRowY = headTop + 3;        // see charStand: row 3 is the eye row

  // Hair style modifier.
  switch (v.style) {
    case 'pony': {
      // Ponytail trailing BEHIND the head. facing>0 means the char looks right,
      // so 'behind' is on the left side (sx + 1).
      const bob = ch.state === 'walk' && (frame % 2 === 1) ? 1 : 0;
      const behindX = flip ? sx + 10 : sx + 1;
      const trailDir = flip ? 1 : -1;       // extends further behind the head
      ctx.fillStyle = hairColor;
      // Base of ponytail
      ctx.fillRect(behindX, headTop + 2 + bob, 1, 5);
      // Trailing strand a pixel further out
      ctx.fillRect(behindX + trailDir, headTop + 3 + bob, 1, 4);
      ctx.fillRect(behindX + trailDir * 2, headTop + 5 + bob, 1, 2);
      break;
    }
    case 'bun': {
      // Round bun on top — three rows, visibly above the head silhouette.
      ctx.fillStyle = hairColor;
      ctx.fillRect(headCenterX - 1, headTop - 3, 3, 1);
      ctx.fillRect(headCenterX - 2, headTop - 2, 5, 1);
      ctx.fillRect(headCenterX - 2, headTop - 1, 5, 1);
      // Tiny dark highlight on the front.
      ctx.fillStyle = '#0a0c1e';
      ctx.fillRect(headCenterX, headTop - 2, 1, 1);
      break;
    }
    case 'short': {
      // Shorter sides — overpaint the bottom of the existing hair with skin tone.
      ctx.fillStyle = '#f5d6a8';
      ctx.fillRect(sx + 1, headTop + 1, 2, 1);
      ctx.fillRect(sx + 9, headTop + 1, 2, 1);
      break;
    }
    // 'default': no-op
  }

  // Glasses: two square lenses connected by a bridge, drawn over the eye row.
  if (v.glasses) {
    ctx.fillStyle = '#0a0c1e';
    // Left lens frame
    ctx.fillRect(sx + 3, eyeRowY, 3, 1);     // top
    ctx.fillRect(sx + 3, eyeRowY + 1, 1, 1); // left
    ctx.fillRect(sx + 5, eyeRowY + 1, 1, 1); // right
    ctx.fillRect(sx + 3, eyeRowY + 2, 3, 1); // bottom
    // Right lens frame
    ctx.fillRect(sx + 7, eyeRowY, 3, 1);
    ctx.fillRect(sx + 7, eyeRowY + 1, 1, 1);
    ctx.fillRect(sx + 9, eyeRowY + 1, 1, 1);
    ctx.fillRect(sx + 7, eyeRowY + 2, 3, 1);
    // Bridge
    ctx.fillRect(sx + 6, eyeRowY + 1, 1, 1);
  }
}

// Renders a standing character sprite plus its style overlays at (x, y) on the
// given context. Used by the character-customizer UI; doesn't need a full
// character state.
export function drawCharacterPreview(ctx, variant, x, y) {
  const v = makeVariant(variant || {});
  const sp = getCharSprite('stand', v, 0);
  ctx.drawImage(sp, x, y);
  drawCharOverlays(ctx, { variant: v, state: 'stand' }, x, y, false, 0);
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
