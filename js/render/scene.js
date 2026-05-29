import { applyCameraTransform, resetTransform, VIEW_W, VIEW_H } from '../engine/canvas.js';
import { drawCharacter } from '../game/characters.js';
import { drawWorld } from '../game/effects.js';
import { activePlayer } from '../game/state.js';
import { getActiveWeapon } from '../ui/controls.js';
import { getBackdrop, getFarBackdrop } from './sprites.js';
import { previewTrajectory, predictTrajectory } from '../engine/physics.js';
import { isAimable, isPlaceable } from '../game/weapons.js';
import { isReducedMotion } from '../ui/prefs.js';
import { SHIRT_HEX } from '../game/characters.js';

// Tiny world-overview shown as an HTML canvas in the HUD. Each call re-draws
// the terrain silhouette (cheap, sampled from the heights array) and overlays
// the players + projectiles as coloured dots.
// Shared: given the current aim input, compute the predicted shot. Returns
// { pts, impact, hue } or null when there's no active aimable drag.
export function computeAimShot(state, input) {
  if (!input || !input.aim || state.turnState !== 'aim') return null;
  const me = activePlayer(state);
  const wp = me ? getActiveWeapon(me) : null;
  if (!me || !wp || !isAimable(wp)) return null;
  const aim = input.aim;
  const speed = aim.power * 750;
  const dirX = Math.cos(aim.angle), dirY = Math.sin(aim.angle);
  const startX = me.x + dirX * 12;
  const startY = me.y - me.h * 0.7 + dirY * 12;
  const { pts, impact } = predictTrajectory(
    startX, startY, dirX * speed, dirY * speed, state.wind, wp.windFactor || 0,
    state.terrain, wp.gravityScale != null ? wp.gravityScale : 1
  );
  return { pts, impact, hue: Math.round((1 - aim.power) * 120) };
}

let _lastMinimap = 0;
export function drawMinimap(state, input) {
  const el = document.getElementById('hud-minimap');
  if (!el || el.classList.contains('hidden')) return;
  // Throttle to ~12 fps; the minimap doesn't need 60 Hz fidelity.
  // While aiming, refresh faster so the predicted line tracks the drag.
  const aiming = input && input.aim && state.turnState === 'aim';
  const now = performance.now();
  if (now - _lastMinimap < (aiming ? 30 : 80)) return;
  _lastMinimap = now;
  const ctx = el.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const w = el.width, h = el.height;
  const { terrain, camera, players, world } = state;
  const sx = w / terrain.width;
  const sy = h / terrain.height;

  // Sky background
  ctx.fillStyle = '#0a0c1e';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(126,203,255,0.35)';
  ctx.fillRect(0, 0, w, h);

  // Terrain silhouette from cached heights[] (cheap, no readback).
  ctx.fillStyle = terrain.theme.ground;
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x < terrain.width; x += 6) {
    ctx.lineTo(x * sx, terrain.heights[x] * sy);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();

  // Camera viewport rectangle
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 1;
  ctx.strokeRect(camera.x * sx, camera.y * sy, camera.w * sx, camera.h * sy);

  // Projectiles as tiny white dots.
  ctx.fillStyle = '#f1f1f1';
  for (const p of world.projectiles) {
    ctx.fillRect(Math.round(p.x * sx) - 1, Math.round(p.y * sy) - 1, 2, 2);
  }
  // Lingerings as semi-transparent yellow blobs.
  for (const l of world.lingerings) {
    ctx.fillStyle = 'rgba(201,151,76,0.5)';
    ctx.beginPath();
    ctx.arc(l.x * sx, l.y * sy, Math.max(2, l.radius * sx), 0, Math.PI * 2);
    ctx.fill();
  }
  // Players as their shirt-coloured dots, active player highlighted yellow.
  for (const p of players) {
    if (p.outOfWorld) continue;
    const color = p.outOfGame ? '#4f568a' : (SHIRT_HEX[p.variant.shirt] || '#f1f1f1');
    ctx.fillStyle = color;
    const px = Math.round(p.x * sx), py = Math.round(p.y * sy);
    ctx.fillRect(px - 2, py - 3, 4, 4);
    if (p.id === state.activeIdx) {
      ctx.strokeStyle = '#ffd54a';
      ctx.lineWidth = 1;
      ctx.strokeRect(px - 3, py - 4, 6, 6);
    }
  }

  // Predicted aim trajectory + impact, so you can judge the shot on the
  // overview while you drag.
  const shot = computeAimShot(state, input);
  if (shot) {
    const col = `hsl(${shot.hue},90%,60%)`;
    ctx.fillStyle = col;
    for (let i = 0; i < shot.pts.length; i += 2) {
      ctx.fillRect(Math.round(shot.pts[i].x * sx), Math.round(shot.pts[i].y * sy), 1, 1);
    }
    if (shot.impact) {
      const ix = Math.round(shot.impact.x * sx), iy = Math.round(shot.impact.y * sy);
      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      ctx.strokeRect(ix - 2, iy - 2, 4, 4);
      ctx.fillStyle = col;
      ctx.fillRect(ix, iy - 4, 1, 3);
      ctx.fillRect(ix, iy + 2, 1, 3);
      ctx.fillRect(ix - 4, iy, 3, 1);
      ctx.fillRect(ix + 2, iy, 3, 1);
    }
  }
}

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

  const reduced = isReducedMotion();
  // Clouds drifting in the sky — outdoor maps only.
  if (!reduced && terrain.themeName === 'schulhof') {
    drawClouds(ctx, terrain, camera, state.wind);
  }

  // Wind streaks: short horizontal lines flying in the wind's direction.
  // Number of streaks scales with |wind|; speed too. At wind 0 nothing renders.
  if (!reduced) drawWindStreaks(ctx, state.wind);

  // Parallax: far layer (very slow drift) drawn behind, near layer drawn in front.
  const baseLine = terrain.height * 0.5;
  const far = getFarBackdrop(terrain.theme);
  const farX = -camera.x * 0.12;
  const farY = baseLine - camera.y - far.height + 26;
  ctx.save();
  ctx.globalAlpha = 0.5;
  for (let x = (farX % far.width) - far.width; x < VIEW_W; x += far.width) {
    ctx.drawImage(far, Math.round(x), Math.round(farY));
  }
  ctx.restore();

  const backdrop = getBackdrop(terrain.theme);
  const parX = -camera.x * 0.3;
  const parY = baseLine - camera.y - backdrop.height + 12;
  ctx.save();
  ctx.globalAlpha = 0.45;
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
      drawAimPreview(ctx, state, me, wp, input.aim, reduced);
    }
  }

  resetTransform(ctx);
}

// Rich, high-contrast aiming visualization: power-coloured launch arrow,
// a bold dotted arc that fades toward the end, and a pulsing impact reticle
// where the shot is predicted to land.
function drawAimPreview(ctx, state, me, wp, aim, reduced) {
  const pw = aim.power;
  const speed = pw * 750;
  const dirX = Math.cos(aim.angle);
  const dirY = Math.sin(aim.angle);
  const vx = dirX * speed;
  const vy = dirY * speed;
  const muzzleX = me.x;
  const muzzleY = me.y - me.h * 0.6;
  const startX = me.x + dirX * 12;
  const startY = me.y - me.h * 0.7 + dirY * 12;

  // Power → colour: green (weak) through yellow to red (full power).
  const hue = Math.round((1 - pw) * 120);
  const powerColor = `hsl(${hue},90%,55%)`;
  const t = performance.now() / 1000;
  const pulse = reduced ? 0.8 : 0.6 + 0.4 * Math.sin(t * 6);

  const { pts, impact } = predictTrajectory(
    startX, startY, vx, vy, state.wind, wp.windFactor || 0,
    state.terrain, wp.gravityScale != null ? wp.gravityScale : 1
  );

  // 1) Dotted arc. Each dot = dark halo + bright core, shrinking & fading
  //    toward the end so the eye reads direction and "reach".
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const f = i / Math.max(1, n - 1);       // 0 at muzzle → 1 at end
    const fade = 1 - f * 0.55;               // keep the tail visible but lighter
    const r = 2.6 - f * 1.1;                 // taper 2.6px → 1.5px
    const px = pts[i].x, py = pts[i].y;
    // Dark halo for contrast on bright sky / pale terrain.
    ctx.fillStyle = `rgba(10,12,30,${0.55 * fade})`;
    ctx.beginPath();
    ctx.arc(px, py, r + 1, 0, Math.PI * 2);
    ctx.fill();
    // Bright power-coloured core.
    ctx.fillStyle = hslA(hue, 90, 60, fade);
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // 2) Launch arrow from the character: thick power-coloured shaft + head,
  //    length scales with power so you feel the charge.
  const arrowLen = 14 + pw * 26;
  const ax = muzzleX + dirX * arrowLen;
  const ay = muzzleY + dirY * arrowLen;
  ctx.save();
  ctx.lineCap = 'round';
  // Dark outline first.
  ctx.strokeStyle = 'rgba(10,12,30,0.7)';
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(muzzleX, muzzleY); ctx.lineTo(ax, ay); ctx.stroke();
  // Bright shaft.
  ctx.strokeStyle = powerColor;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(muzzleX, muzzleY); ctx.lineTo(ax, ay); ctx.stroke();
  // Arrowhead.
  const ah = 5, perpX = -dirY, perpY = dirX;
  ctx.fillStyle = powerColor;
  ctx.strokeStyle = 'rgba(10,12,30,0.7)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(ax + dirX * ah, ay + dirY * ah);
  ctx.lineTo(ax + perpX * ah * 0.7, ay + perpY * ah * 0.7);
  ctx.lineTo(ax - perpX * ah * 0.7, ay - perpY * ah * 0.7);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // 3) Power gauge: an arc around the character that fills with the charge.
  const gaugeR = 13;
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(10,12,30,0.55)';
  ctx.beginPath(); ctx.arc(muzzleX, muzzleY, gaugeR, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = powerColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(muzzleX, muzzleY, gaugeR, -Math.PI / 2, -Math.PI / 2 + pw * Math.PI * 2);
  ctx.stroke();

  // 4) Impact reticle: pulsing target where the shot is predicted to hit.
  if (impact) {
    const rr = (5 + pulse * 3);
    ctx.save();
    ctx.translate(impact.x, impact.y);
    // Outer ring.
    ctx.strokeStyle = `rgba(10,12,30,0.6)`;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, rr + 1, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = hslA(hue, 90, 60, 0.95);
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, rr, 0, Math.PI * 2); ctx.stroke();
    // Crosshair ticks.
    ctx.beginPath();
    ctx.moveTo(-rr - 3, 0); ctx.lineTo(-rr + 2, 0);
    ctx.moveTo(rr - 2, 0); ctx.lineTo(rr + 3, 0);
    ctx.moveTo(0, -rr - 3); ctx.lineTo(0, -rr + 2);
    ctx.moveTo(0, rr - 2); ctx.lineTo(0, rr + 3);
    ctx.stroke();
    ctx.restore();
  }
}

function hslA(h, s, l, a) { return `hsla(${h},${s}%,${l}%,${a})`; }
