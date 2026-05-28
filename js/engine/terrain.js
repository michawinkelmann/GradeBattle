import { createRng } from './rng.js';

export const WORLD_W = 1600;
export const WORLD_H = 600;

const THEMES = {
  schulhof: {
    sky: ['#7ecbff', '#aee8ff'],
    ground: '#7a5a3a',
    grass: '#4caf50',
    rock: '#6b4a2a',
    backdrop: 'building'
  },
  klassenraum: {
    sky: ['#d8c298', '#f0dca8'],
    ground: '#6b4a2a',
    grass: '#8a6a3a',
    rock: '#4a3320',
    backdrop: 'blackboard'
  },
  turnhalle: {
    sky: ['#c5d3e8', '#e8efff'],
    ground: '#a07b4a',
    grass: '#c9974c',
    rock: '#705536',
    backdrop: 'wallbars'
  }
};

export function getTheme(name) { return THEMES[name] || THEMES.schulhof; }

export function createTerrain(seed, themeName = 'schulhof') {
  const rng = createRng(seed);
  const w = WORLD_W;
  const h = WORLD_H;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  const theme = getTheme(themeName);

  // Build heightmap via summed sines for hilly outline.
  const heights = new Float32Array(w);
  const base = h * 0.55;
  const layers = [
    { amp: 60, freq: 0.005, phase: rng.range(0, Math.PI * 2) },
    { amp: 30, freq: 0.013, phase: rng.range(0, Math.PI * 2) },
    { amp: 14, freq: 0.027, phase: rng.range(0, Math.PI * 2) },
    { amp: 6, freq: 0.06, phase: rng.range(0, Math.PI * 2) }
  ];
  for (let x = 0; x < w; x++) {
    let y = base;
    for (const l of layers) y += Math.sin(x * l.freq + l.phase) * l.amp;
    // Soft edges so spawn points exist near borders.
    const edge = Math.min(x, w - 1 - x);
    if (edge < 80) y -= (80 - edge) * 0.4;
    heights[x] = Math.max(40, Math.min(h - 20, y));
  }

  // Fill ground.
  ctx.fillStyle = theme.ground;
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x < w; x++) ctx.lineTo(x, heights[x]);
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();

  // Grass strip on surface.
  ctx.strokeStyle = theme.grass;
  ctx.lineWidth = 4;
  ctx.beginPath();
  for (let x = 0; x < w; x++) {
    if (x === 0) ctx.moveTo(x, heights[x]);
    else ctx.lineTo(x, heights[x]);
  }
  ctx.stroke();

  // Floating platforms (1-3).
  const platCount = rng.int(1, 3);
  for (let i = 0; i < platCount; i++) {
    const px = rng.range(150, w - 250);
    const py = rng.range(120, base - 60);
    const pw = rng.range(60, 140);
    ctx.fillStyle = theme.rock;
    ctx.fillRect(px, py, pw, 12);
    ctx.fillStyle = theme.grass;
    ctx.fillRect(px, py, pw, 3);
  }

  const terrain = {
    canvas,
    ctx,
    width: w,
    height: h,
    seed,
    themeName,
    theme,
    heights,
    _imageData: null,
    _dirty: true
  };
  return terrain;
}

function ensureImageData(terrain) {
  if (terrain._dirty || !terrain._imageData) {
    terrain._imageData = terrain.ctx.getImageData(0, 0, terrain.width, terrain.height);
    terrain._dirty = false;
  }
  return terrain._imageData;
}

export function markTerrainDirty(terrain) { terrain._dirty = true; }

// Solid = alpha > 16.
export function isSolid(terrain, x, y) {
  const xi = x | 0, yi = y | 0;
  if (xi < 0 || yi < 0 || xi >= terrain.width || yi >= terrain.height) return false;
  const img = ensureImageData(terrain);
  const i = (yi * terrain.width + xi) * 4 + 3;
  return img.data[i] > 16;
}

// Faster: read a rect once.
export function readSolidRect(terrain, x, y, w, h) {
  x = Math.max(0, x | 0); y = Math.max(0, y | 0);
  w = Math.min(terrain.width - x, w | 0);
  h = Math.min(terrain.height - y, h | 0);
  if (w <= 0 || h <= 0) return { data: null, x, y, w, h };
  const img = terrain.ctx.getImageData(x, y, w, h);
  return { data: img.data, x, y, w, h };
}

export function rectIsSolidPixel(rect, lx, ly) {
  if (!rect.data) return false;
  const i = (ly * rect.w + lx) * 4 + 3;
  return rect.data[i] > 16;
}

// Destructive crater. Returns true if anything changed.
export function explodeAt(terrain, x, y, radius) {
  terrain.ctx.save();
  terrain.ctx.globalCompositeOperation = 'destination-out';
  terrain.ctx.beginPath();
  terrain.ctx.arc(x, y, radius, 0, Math.PI * 2);
  terrain.ctx.fill();
  terrain.ctx.restore();
  markTerrainDirty(terrain);

  // Update height map roughly.
  const x0 = Math.max(0, (x - radius) | 0);
  const x1 = Math.min(terrain.width - 1, (x + radius) | 0);
  for (let xi = x0; xi <= x1; xi++) {
    const dx = xi - x;
    const dh = Math.sqrt(Math.max(0, radius * radius - dx * dx));
    if (terrain.heights[xi] >= y - dh && terrain.heights[xi] <= y + dh) {
      terrain.heights[xi] = y + dh;
    }
  }
  return true;
}

// Additive terrain - place a small solid platform (utility weapon).
export function addPlatform(terrain, x, y, w, h, color) {
  terrain.ctx.save();
  terrain.ctx.fillStyle = color || terrain.theme.rock;
  terrain.ctx.fillRect(x | 0, y | 0, w | 0, h | 0);
  terrain.ctx.fillStyle = terrain.theme.grass;
  terrain.ctx.fillRect(x | 0, y | 0, w | 0, 2);
  terrain.ctx.restore();
  markTerrainDirty(terrain);
  // Update height where lower than top of platform.
  for (let xi = x | 0; xi < (x + w) | 0; xi++) {
    if (xi >= 0 && xi < terrain.width && terrain.heights[xi] > y) {
      terrain.heights[xi] = y;
    }
  }
}

// Probe surface height at column x (top-most solid pixel).
export function surfaceY(terrain, x) {
  if (x < 0 || x >= terrain.width) return terrain.height;
  // Use cached heights for speed.
  return terrain.heights[x | 0];
}
