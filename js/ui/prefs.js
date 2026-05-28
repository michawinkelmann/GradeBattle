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
