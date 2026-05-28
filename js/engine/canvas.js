// Internal canvas resolution stays low (pixel art),
// CSS handles scaling; camera tracks the action.

export const VIEW_W = 480;
export const VIEW_H = 270;

export function setupCanvas(canvasEl) {
  const ctx = canvasEl.getContext('2d', { alpha: false });
  ctx.imageSmoothingEnabled = false;
  canvasEl.width = VIEW_W;
  canvasEl.height = VIEW_H;
  return ctx;
}

export function createCamera() {
  return { x: 0, y: 0, w: VIEW_W, h: VIEW_H, shake: 0, shakeTime: 0 };
}

export function updateCamera(camera, targetX, targetY, worldW, worldH, dt) {
  const cx = targetX - VIEW_W / 2;
  const cy = targetY - VIEW_H / 2;
  camera.x += (cx - camera.x) * Math.min(1, dt * 5);
  camera.y += (cy - camera.y) * Math.min(1, dt * 5);
  camera.x = Math.max(0, Math.min(worldW - VIEW_W, camera.x));
  camera.y = Math.max(-100, Math.min(worldH - VIEW_H, camera.y));
  if (camera.shakeTime > 0) camera.shakeTime -= dt;
  else camera.shake = 0;
}

export function addShake(camera, amount, time = 0.3) {
  camera.shake = Math.max(camera.shake, amount);
  camera.shakeTime = Math.max(camera.shakeTime, time);
}

export function applyCameraTransform(ctx, camera) {
  let ox = 0, oy = 0;
  if (camera.shakeTime > 0) {
    ox = (Math.random() - 0.5) * camera.shake;
    oy = (Math.random() - 0.5) * camera.shake;
  }
  ctx.setTransform(1, 0, 0, 1, -Math.round(camera.x) + ox, -Math.round(camera.y) + oy);
}

export function resetTransform(ctx) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// Convert screen (CSS) coords to internal canvas coords, then to world.
export function screenToWorld(canvasEl, camera, sx, sy) {
  const r = canvasEl.getBoundingClientRect();
  const ix = (sx - r.left) * (VIEW_W / r.width);
  const iy = (sy - r.top) * (VIEW_H / r.height);
  return { x: ix + camera.x, y: iy + camera.y };
}

export function fitCanvasCss(canvasEl) {
  // CSS scaling is handled by 100% width/height; nothing to do for now.
  canvasEl.style.imageRendering = 'pixelated';
}
