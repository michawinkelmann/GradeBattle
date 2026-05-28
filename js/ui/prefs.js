// Tiny user-prefs module: reads/writes booleans backed by localStorage.

const LS_PREFIX = 'gradebattle.';

export function getBool(key, fallback = false) {
  const raw = localStorage.getItem(LS_PREFIX + key);
  if (raw === '1') return true;
  if (raw === '0') return false;
  return fallback;
}

export function setBool(key, value) {
  localStorage.setItem(LS_PREFIX + key, value ? '1' : '0');
}

// Convenience for reduced-motion mode (scene.js consults this every frame).
export function isReducedMotion() {
  return getBool('reducedMotion', false)
    || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
}

export function setReducedMotion(v) { setBool('reducedMotion', v); }

// "Static overview" camera: keep the whole world in view instead of panning.
export function isStaticCamera() { return getBool('staticCamera', false); }
export function setStaticCamera(v) { setBool('staticCamera', v); }

// "Confirm fire": drag-aim freezes preview on release; player must tap a
// confirm button before the throw is sent. Helps against accidental fires.
export function isConfirmFire() { return getBool('confirmFire', false); }
export function setConfirmFire(v) { setBool('confirmFire', v); }
