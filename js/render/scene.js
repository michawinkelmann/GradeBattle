import { applyCameraTransform, resetTransform, VIEW_W, VIEW_H } from '../engine/canvas.js';
import { drawCharacter } from '../game/characters.js';
import { drawWorld } from '../game/effects.js';
import { activePlayer } from '../game/state.js';
import { getActiveWeapon } from '../ui/controls.js';
import { getBackdrop } from './sprites.js';
import { previewTrajectory } from '../engine/physics.js';
import { isAimable, isPlaceable } from '../game/weapons.js';

// Procedural cloud field — fixed positions, drift via offset using wind & camera.
const CLOUDS = [
  { x: 60,  y: 30,  w: 28, h: 8 },
  { x: 220, y: 50,  w: 36, h: 10 },
  { x: 380, y: 22,  w: 24, h: 7 },
  { x: 540, y: 60,  w: 32, h: 9 },
  { x: 700, y: 40,  w: 28, h: 8 },
  { x: 880, y: 28,  w: 40, h: 10 },
  { x: 1050,y: 55,  w: 30, h: 9 },
  { x: 1240,y: 35,  w: 36, h: 9 },
  { x: 1420,y: 48,  w: 26, h: 8 },
  { x: 1600,y: 30,  w: 30, h: 9 },
  { x: 1780,y: 50,  w: 34, h: 10 }
];

// Simple sRGB hex mixer used by the sky gradient horizon.
function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ra = (pa >> 16) & 255, ga = (pa >> 8) & 255, ba = pa & 255;
  const rb = (pb >> 16) & 255, gb = (pb >> 8) & 255, bb = pb & 255;
  const r = Math.round(ra * (1 - t) + rb * t);
  const g = Math.round(ga * (1 - t) + gb * t);
  const bl = Math.round(ba * (1 - t) + bb * t);
  return `rgb(${r},${g},${bl})`;
}

// Deterministic positions so streaks don't shimmer randomly each frame.
const WIND_STREAKS = [];
for (let i = 0; i < 24; i++) {
  WIND_STREAKS.push({ y: 8 + Math.random() * 100, phase: Math.random(), width: 6 + Math.random() * 8 });
}

function drawWindStreaks(ctx, wind) {
  const aw = Math.abs(wind);
  if (aw < 0.1) return;
  const dir = wind < 0 ? -1 : 1;
  const speed = (40 + aw * 220) * dir;     // px/s in screen space
  const t = performance.now() / 1000;
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  const visibleCount = Math.min(WIND_STREAKS.length, Math.ceil(aw * 24));
  for (let i = 0; i < visibleCount; i++) {
    const s = WIND_STREAKS[i];
    const drift = (s.phase * VIEW_W + speed * t) % (VIEW_W + 80);
    const x = dir > 0 ? -40 + drift : VIEW_W + 40 - drift;
    ctx.fillRect(Math.round(x), Math.round(s.y), s.width, 1);
  }
}

function drawClouds(ctx, terrain, camera, wind) {
  // Drift is purely visual; modulate by wind so heavier wind => visibly faster sky.
  const driftSpeed = 6 + wind * 30;       // px per sec
  const t = performance.now() / 1000;
  const drift = (driftSpeed * t) % terrain.width;
  for (const c of CLOUDS) {
    let x = c.x - drift;
    x = ((x % terrain.width) + terrain.width) % terrain.width;
    // Screen-space cloud (ignore camera Y for parallax).
    const sx = Math.round(x - camera.x * 0.15);
    const sy = Math.round(c.y - camera.y * 0.05);
    if (sx + c.w < -20 || sx > VIEW_W + 20) continue;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    // Soft-edge cloud: three overlapping rounded rects.
    ctx.fillRect(sx + 3, sy, c.w - 6, c.h);
    ctx.fillRect(sx, sy + 2, c.w, c.h - 4);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillRect(sx + 6, sy - 1, c.w - 14, 1);
    ctx.fillRect(sx + 2, sy + c.h - 1, c.w - 4, 1);
  }
}

export function drawScene(ctx, state, input) {
  const { terrain, camera, players } = state;
  // Sky gradient
  const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  const sky = terrain.theme.sky;
  if (sky.length >= 3) {
    grad.addColorStop(0, sky[0]);
    grad.addColorStop(0.6, sky[1]);
    grad.addColorStop(1, sky[2]);
  } else {
    // Synthesize a middle band so the sky has a horizon glow even with 2 stops.
    grad.addColorStop(0, sky[0]);
    grad.addColorStop(0.65, mixHex(sky[0], sky[1], 0.55));
    grad.addColorStop(1, sky[1]);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // Clouds drifting in the sky — outdoor maps only.
  if (terrain.themeName === 'schulhof') {
    drawClouds(ctx, terrain, camera, state.wind);
  }

  // Wind streaks: short horizontal lines flying in the wind's direction.
  // Number of streaks scales with |wind|; speed too. At wind 0 nothing renders.
  drawWindStreaks(ctx, state.wind);

  // Parallax backdrop (subtle far layer).
  const backdrop = getBackdrop(terrain.theme);
  const baseLine = terrain.height * 0.5;
  const parX = -camera.x * 0.3;
  const parY = baseLine - camera.y - backdrop.height + 12;
  ctx.save();
  ctx.globalAlpha = 0.35;
  for (let x = (parX % backdrop.width) - backdrop.width; x < VIEW_W; x += backdrop.width) {
    ctx.drawImage(backdrop, Math.round(x), Math.round(parY));
  }
  ctx.restore();

  // World transform.
  applyCameraTransform(ctx, camera);

  // Terrain
  ctx.drawImage(terrain.canvas, 0, 0);

  // Characters
  for (const p of players) drawCharacter(ctx, p);

  // Active-player arrow hint (helps spot whose turn it is, esp. on small screens).
  if (state.turnState === 'aim') {
    const me = activePlayer(state);
    if (me && !me.outOfGame && !me.outOfWorld) {
      const ax = Math.round(me.x);
      const ay = Math.round(me.y - me.h - 18 + Math.sin(performance.now() / 250) * 1.5);
      ctx.fillStyle = '#ffd54a';
      ctx.beginPath();
      ctx.moveTo(ax, ay + 4);
      ctx.lineTo(ax - 4, ay - 2);
      ctx.lineTo(ax + 4, ay - 2);
      ctx.closePath();
      ctx.fill();
    }
  }

  // World effects (projectiles, mines, particles, lingerings)
  drawWorld(ctx, state);

  // Aim preview.
  if (input && input.aim && state.turnState === 'aim') {
    const me = activePlayer(state);
    const wp = getActiveWeapon(me);
    if (me && wp && isAimable(wp)) {
      const speed = input.aim.power * 750;
      const vx = Math.cos(input.aim.angle) * speed;
      const vy = Math.sin(input.aim.angle) * speed;
      const startX = me.x + Math.cos(input.aim.angle) * 12;
      const startY = me.y - me.h * 0.7 + Math.sin(input.aim.angle) * 12;
      const pts = previewTrajectory(startX, startY, vx, vy, state.wind, wp.windFactor || 0);
      // Dotted trajectory (slightly bigger so it's readable on phones).
      ctx.fillStyle = 'rgba(255,213,74,0.85)';
      for (let i = 0; i < pts.length; i += 2) {
        ctx.fillRect(Math.round(pts[i].x) - 1, Math.round(pts[i].y) - 1, 2, 2);
      }
      // Slingshot line from char to drag point (mirrors finger position).
      const dragX = me.x - Math.cos(input.aim.angle) * input.aim.power * 30;
      const dragY = (me.y - me.h * 0.6) - Math.sin(input.aim.angle) * input.aim.power * 30;
      ctx.strokeStyle = 'rgba(255,213,74,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(me.x, me.y - me.h * 0.6);
      ctx.lineTo(dragX, dragY);
      ctx.stroke();
      // Power ring around char: green at low power, red at full.
      const pw = input.aim.power;
      const ringR = 6 + pw * 14;
      const hue = Math.round((1 - pw) * 120);
      ctx.strokeStyle = `hsla(${hue},85%,55%,0.9)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(me.x, me.y - me.h * 0.6, ringR, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  resetTransform(ctx);
}
