import { applyCameraTransform, resetTransform, VIEW_W, VIEW_H } from '../engine/canvas.js';
import { drawCharacter } from '../game/characters.js';
import { drawWorld } from '../game/effects.js';
import { activePlayer } from '../game/state.js';
import { getActiveWeapon } from '../ui/controls.js';
import { getBackdrop } from './sprites.js';
import { previewTrajectory } from '../engine/physics.js';
import { isAimable, isPlaceable } from '../game/weapons.js';

export function drawScene(ctx, state, input) {
  const { terrain, camera, players } = state;
  // Sky gradient
  const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  grad.addColorStop(0, terrain.theme.sky[0]);
  grad.addColorStop(1, terrain.theme.sky[1]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

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
      ctx.fillStyle = 'rgba(255,213,74,0.85)';
      for (let i = 0; i < pts.length; i += 2) {
        ctx.fillRect(Math.round(pts[i].x) - 1, Math.round(pts[i].y) - 1, 2, 2);
      }
      // Aim line + dot at character.
      ctx.fillStyle = '#ffd54a';
      ctx.fillRect(me.x - 1, me.y - me.h * 0.7 - 1, 2, 2);
    }
  }

  // Placement crosshair: when current weapon is placeable, show cursor at world coords if recent.
  // (Implementation left to controls; we just hint at aim location.)

  resetTransform(ctx);
}
