// Unified input using Pointer Events. Handles:
//  - drag-aim from active character (angle + power)
//  - keyboard movement (desktop)
//  - touch movement buttons
//  - tap placement for placeable weapons

import { screenToWorld } from '../engine/canvas.js';
import { WEAPONS, isAimable, isInstant, isPlaceable } from '../game/weapons.js';
import { fireWeapon } from '../game/effects.js';
import { markFired } from '../game/turn.js';
import { playSound } from '../game/sound.js';

const KEY = {
  left: ['ArrowLeft', 'a', 'A'],
  right: ['ArrowRight', 'd', 'D'],
  jump: ['ArrowUp', 'w', 'W', ' '],
  prevWeapon: ['q', 'Q'],
  nextWeapon: ['e', 'E'],
  weapons: ['Tab'],
  pause: ['Escape']
};

export function getActiveWeapon(player) {
  const len = WEAPONS.length;
  const i = Number.isFinite(player.selectedWeaponIdx) ? player.selectedWeaponIdx : 0;
  return WEAPONS[((i % len) + len) % len];
}

export function createControls({ canvas, getState, getActiveLocalPlayer, onWeaponWheelToggle, onPauseToggle, sendInput }) {
  const input = {
    keys: new Set(),
    aim: null,
    moveDir: 0,
    jumpRequested: false,
    _lastSentMoveDir: 0,
  };

  // Detect touch-first devices upfront (also matches iPad in laptop-mode).
  let touchDetected = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  function setTouchVisible(visible) {
    document.getElementById('touch-controls')?.classList.toggle('hidden', !visible);
  }
  function ensureTouchLayout() { if (touchDetected) setTouchVisible(true); }
  ensureTouchLayout();
  // Hide buttons after sustained keyboard/mouse use, re-show as soon as a real touch starts.
  window.addEventListener('keydown', (e) => {
    if (!['ArrowLeft','ArrowRight','ArrowUp','a','A','d','D','w','W',' '].includes(e.key)) return;
    setTouchVisible(false);
  });
  window.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') { touchDetected = true; setTouchVisible(true); }
  });

  // For networked clients: relay movement/jump changes to the host.
  if (sendInput) {
    setInterval(() => {
      if (input.moveDir !== input._lastSentMoveDir) {
        sendInput({ type: 'move', dir: input.moveDir });
        input._lastSentMoveDir = input.moveDir;
      }
      if (input.jumpRequested) {
        sendInput({ type: 'move', dir: input.moveDir, jump: true });
        input.jumpRequested = false;
      }
    }, 50);
  }

  document.querySelectorAll('#touch-controls .touch-btn').forEach(btn => {
    const d = btn.dataset.touch;
    const start = (e) => {
      e.preventDefault(); touchDetected = true;
      if (d === 'left') input.moveDir = -1;
      else if (d === 'right') input.moveDir = 1;
      else if (d === 'jump') input.jumpRequested = true;
    };
    const end = (e) => {
      e.preventDefault();
      if (d === 'left' && input.moveDir === -1) input.moveDir = 0;
      if (d === 'right' && input.moveDir === 1) input.moveDir = 0;
    };
    btn.addEventListener('pointerdown', start);
    btn.addEventListener('pointerup', end);
    btn.addEventListener('pointercancel', end);
    btn.addEventListener('pointerleave', end);
  });

  window.addEventListener('keydown', (e) => {
    const k = e.key;
    if (KEY.left.includes(k)) input.moveDir = -1;
    else if (KEY.right.includes(k)) input.moveDir = 1;
    else if (KEY.jump.includes(k)) { input.jumpRequested = true; e.preventDefault(); }
    else if (KEY.prevWeapon.includes(k)) cycleWeapon(getActiveLocalPlayer, -1);
    else if (KEY.nextWeapon.includes(k)) cycleWeapon(getActiveLocalPlayer, 1);
    else if (KEY.weapons.includes(k)) { e.preventDefault(); onWeaponWheelToggle?.(); }
    else if (KEY.pause.includes(k)) { e.preventDefault(); onPauseToggle?.(); }
    input.keys.add(k);
  });
  window.addEventListener('keyup', (e) => {
    const k = e.key;
    if (KEY.left.includes(k) && input.moveDir === -1) input.moveDir = 0;
    if (KEY.right.includes(k) && input.moveDir === 1) input.moveDir = 0;
    input.keys.delete(k);
  });

  canvas.addEventListener('wheel', (e) => {
    const state = getState();
    if (!state || state.turnState !== 'aim') return;     // ignore during inflight/resolving/ended
    if (!getActiveLocalPlayer()) return;
    e.preventDefault();
    cycleWeapon(getActiveLocalPlayer, e.deltaY > 0 ? 1 : -1);
  }, { passive: false });

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);

  function onPointerDown(e) {
    if (e.pointerType === 'touch') { touchDetected = true; ensureTouchLayout(); }
    const state = getState();
    if (!state) return;
    const me = getActiveLocalPlayer();
    if (!me) return;
    if (state.turnState !== 'aim') return;
    const weapon = getActiveWeapon(me);
    if (!weapon) return;

    const wpt = screenToWorld(canvas, state.camera, e.clientX, e.clientY);

    if (isPlaceable(weapon)) {
      if (sendInput) {
        sendInput({ type: 'fire', weaponId: weapon.id, targetX: wpt.x, targetY: wpt.y });
      } else {
        fireWeapon(state, me, weapon, { targetX: wpt.x, targetY: wpt.y });
        if (state.world.turnEnded || state.world.projectiles.length > 0) markFired(state);
      }
      e.preventDefault();
      return;
    }

    if (isInstant(weapon)) {
      if (sendInput) {
        sendInput({ type: 'fire', weaponId: weapon.id });
      } else {
        fireWeapon(state, me, weapon, {});
        if (state.world.turnEnded || state.world.projectiles.length > 0) markFired(state);
      }
      e.preventDefault();
      return;
    }

    if (!isAimable(weapon)) return;

    input.aim = {
      x: wpt.x, y: wpt.y,
      angle: 0, power: 0,
      weaponId: weapon.id,
      pointerId: e.pointerId
    };
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (!input.aim) return;
    const state = getState();
    const me = getActiveLocalPlayer();
    if (!state || !me) return;
    const wpt = screenToWorld(canvas, state.camera, e.clientX, e.clientY);
    input.aim.x = wpt.x;
    input.aim.y = wpt.y;
    const dx = me.x - wpt.x;
    const dy = (me.y - me.h * 0.6) - wpt.y;
    input.aim.angle = Math.atan2(dy, dx);
    const dist = Math.hypot(dx, dy);
    input.aim.power = Math.max(0.05, Math.min(1, dist / 110));
    me.facing = Math.cos(input.aim.angle) >= 0 ? 1 : -1;
  }

  function onPointerUp(e) {
    if (!input.aim) return;
    const state = getState();
    const me = getActiveLocalPlayer();
    if (state && me && state.turnState === 'aim') {
      const w = getActiveWeapon(me);
      if (w && isAimable(w) && input.aim.power > 0.08) {
        if (sendInput) {
          sendInput({ type: 'fire', weaponId: w.id, angle: input.aim.angle, power: input.aim.power });
        } else {
          fireWeapon(state, me, w, { angle: input.aim.angle, power: input.aim.power });
          markFired(state);
        }
      }
    }
    try { if (input.aim.pointerId != null) canvas.releasePointerCapture(input.aim.pointerId); } catch (_) {}
    input.aim = null;
  }

  return input;
}

function cycleWeapon(getActiveLocalPlayer, dir) {
  const me = getActiveLocalPlayer();
  if (!me) return;
  let idx = me.selectedWeaponIdx + dir;
  if (idx < 0) idx = WEAPONS.length - 1;
  if (idx >= WEAPONS.length) idx = 0;
  me.selectedWeaponIdx = idx;
  playSound('click');
}
