import { createRng } from './rng.js';

export const WORLD_W = 1920;
export const WORLD_H = 600;

const THEMES = {
  schulhof: {
    // Top -> horizon glow -> low haze.
    sky: ['#5fa6e6', '#a8d8ff', '#dcefff'],
    ground: '#7a5a3a',
    grass: '#4caf50',
    rock: '#6b4a2a',
    backdrop: 'building',
    surface: 'grass'
  },
  klassenraum: {
    // Warm classroom wall light, top is darker, near floor lighter.
    sky: ['#b89570', '#d8c298', '#f0dca8'],
    ground: '#8a6a3a',
    grass: '#a0764a',
    rock: '#4a3320',
    backdrop: 'blackboard',
    surface: 'planks',
    plankDark: '#5e441f',
    plankLight: '#a0764a'
  },
  turnhalle: {
    // Cool fluorescent gym light fading to a brighter floor area.
    sky: ['#a4b5d0', '#c5d3e8', '#e8efff'],
    ground: '#c9974c',
    grass: '#dba867',
    rock: '#705536',
    backdrop: 'wallbars',
    surface: 'planks',
    plankDark: '#8a6630',
    plankLight: '#dba867'
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

  // Surface decoration depends on the theme.
  if (theme.surface === 'planks') {
    // Wooden floor planks: alternating dark/light vertical strips, clipped to the ground silhouette.
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x < w; x++) ctx.lineTo(x, heights[x]);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.clip();
    const plankW = 22;
    for (let x = 0; x < w; x += plankW) {
      const dark = ((x / plankW) | 0) % 2 === 0;
      ctx.fillStyle = dark ? theme.plankDark : theme.plankLight;
      ctx.fillRect(x, 0, plankW, h);
    }
    // Thin dark seams between planks (only inside the clipped ground).
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    for (let x = plankW; x < w; x += plankW) ctx.fillRect(x - 1, 0, 1, h);
    // Wood knots and grain — small randomized blobs for character.
    for (let i = 0; i < 80; i++) {
      const x = (rng.range(0, w)) | 0;
      const y = (rng.range(0, h)) | 0;
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.ellipse(x, y, 2 + rng.range(0, 2), 1, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // Top edge highlight along the silhouette.
    ctx.strokeStyle = theme.grass;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x < w; x++) {
      if (x === 0) ctx.moveTo(x, heights[x]);
      else ctx.lineTo(x, heights[x]);
    }
    ctx.stroke();
  } else {
    // Grass strip on surface (outdoor maps).
    ctx.strokeStyle = theme.grass;
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let x = 0; x < w; x++) {
      if (x === 0) ctx.moveTo(x, heights[x]);
      else ctx.lineTo(x, heights[x]);
    }
    ctx.stroke();
    // Grass blades: short vertical strokes every few px along the ridge.
    ctx.fillStyle = theme.grass;
    for (let x = 4; x < w; x += 3) {
      const y = heights[x];
      const blade = 2 + ((x * 1373) & 1);          // pseudo-random per column
      ctx.fillRect(x, y - blade, 1, blade);
    }
    // Pebbles / soil flecks inside the dirt for texture.
    for (let i = 0; i < 220; i++) {
      const x = (rng.range(0, w)) | 0;
      const baseY = heights[x] + 6 + rng.range(0, h - heights[x] - 10);
      ctx.fillStyle = i % 3 === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.18)';
      ctx.fillRect(x, baseY | 0, 1, 1);
    }
  }

  // Floating platforms (1-3).
  const platCount = rng.int(1, 3);
  for (let i = 0; i < platCount; i++) {
    const px = rng.range(150, w - 250);
    const py = rng.range(120, base - 60);
    const pw = rng.range(60, 140);
    ctx.fillStyle = theme.rock;
    ctx.fillRect(px, py, pw, 12);
    ctx.fillStyle = theme.surface === 'planks' ? theme.plankLight : theme.grass;
    ctx.fillRect(px, py, pw, 3);
  }

  // Theme-specific map features (solid + decorative).
  if (themeName === 'schulhof') {
    addOutdoorFeatures(ctx, rng, w, base, heights, theme);
  } else if (themeName === 'klassenraum') {
    addClassroomFeatures(ctx, rng, w, heights, theme);
  } else if (themeName === 'turnhalle') {
    addGymFeatures(ctx, rng, w, heights, theme);
  }

  // Build a 1-byte-per-pixel solid mask up front. This is what isSolid() reads on every
  // physics sub-step; we keep it in sync incrementally on every explode/addPlatform so
  // we never have to re-read the canvas via getImageData (~36 ms at low-end mobile speeds).
  const mask = new Uint8Array(w * h);
  const img = ctx.getImageData(0, 0, w, h);
  for (let i = 0, p = 3; i < mask.length; i++, p += 4) {
    if (img.data[p] > 16) mask[i] = 1;
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
    mask
  };
  return terrain;
}

// Solid = mask byte === 1. Out-of-bounds = false.
export function isSolid(terrain, x, y) {
  const xi = x | 0, yi = y | 0;
  if (xi < 0 || yi < 0 || xi >= terrain.width || yi >= terrain.height) return false;
  return terrain.mask[yi * terrain.width + xi] === 1;
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
  carveMask(terrain, x, y, radius, 0);

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

// Update the solid mask within a circle: value=0 clears, value=1 fills.
function carveMask(terrain, cx, cy, radius, value) {
  const w = terrain.width, h = terrain.height;
  const x0 = Math.max(0, (cx - radius) | 0);
  const x1 = Math.min(w - 1, (cx + radius) | 0);
  const y0 = Math.max(0, (cy - radius) | 0);
  const y1 = Math.min(h - 1, (cy + radius) | 0);
  const r2 = radius * radius;
  const mask = terrain.mask;
  for (let y = y0; y <= y1; y++) {
    const dy = y - cy;
    const dy2 = dy * dy;
    const rowOff = y * w;
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      if (dx * dx + dy2 <= r2) mask[rowOff + x] = value;
    }
  }
}

function fillMaskRect(terrain, x, y, w, h, value) {
  const tw = terrain.width;
  const th = terrain.height;
  const x0 = Math.max(0, x | 0);
  const y0 = Math.max(0, y | 0);
  const x1 = Math.min(tw, (x + w) | 0);
  const y1 = Math.min(th, (y + h) | 0);
  const mask = terrain.mask;
  for (let yy = y0; yy < y1; yy++) {
    const off = yy * tw;
    for (let xx = x0; xx < x1; xx++) mask[off + xx] = value;
  }
}

// Additive terrain - place a small solid platform (utility weapon).
export function addPlatform(terrain, x, y, w, h, color) {
  terrain.ctx.save();
  terrain.ctx.fillStyle = color || terrain.theme.rock;
  terrain.ctx.fillRect(x | 0, y | 0, w | 0, h | 0);
  terrain.ctx.fillStyle = terrain.theme.surface === 'planks'
    ? terrain.theme.plankLight
    : terrain.theme.grass;
  terrain.ctx.fillRect(x | 0, y | 0, w | 0, 2);
  terrain.ctx.restore();
  fillMaskRect(terrain, x, y, w, h, 1);
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

// ===== Theme features =====
// All features paint *only* on the canvas; the solid mask is built
// after these run in createTerrain, so anything that should be walkable
// just needs to have non-transparent pixels at the right height.

// Pick non-overlapping x positions inside [margin, w-margin].
function spreadPositions(rng, w, count, margin, minGap) {
  const out = [];
  let tries = 0;
  while (out.length < count && tries < count * 30) {
    tries++;
    const x = rng.range(margin, w - margin) | 0;
    if (out.every(p => Math.abs(p - x) > minGap)) out.push(x);
  }
  return out;
}

function addOutdoorFeatures(ctx, rng, w, base, heights, theme) {
  // 3-5 trees scattered along the ground.
  const treeCount = rng.int(3, 5);
  const positions = spreadPositions(rng, w, treeCount, 80, 90);
  for (const tx of positions) {
    const gy = heights[tx];
    drawTree(ctx, tx, gy, rng);
  }
  // 60% chance: jungle gym (climbable frame) somewhere mid-map.
  if (rng.next() < 0.6) {
    const gx = rng.range(w * 0.25, w * 0.75) | 0;
    const gy = heights[gx];
    drawJungleGym(ctx, gx, gy, theme);
  }
}

function drawTree(ctx, x, gy, rng) {
  // Trunk
  ctx.fillStyle = '#5a3a20';
  ctx.fillRect(x - 2, gy - 22, 4, 22);
  // Canopy: three overlapping circles, slightly randomized.
  const r = rng.int(11, 15);
  ctx.fillStyle = '#2f7a33';
  ctx.beginPath();
  ctx.arc(x, gy - 28, r, 0, Math.PI * 2);
  ctx.arc(x - 6, gy - 22, r - 3, 0, Math.PI * 2);
  ctx.arc(x + 6, gy - 22, r - 3, 0, Math.PI * 2);
  ctx.fill();
  // Lighter highlight on top.
  ctx.fillStyle = '#4caf50';
  ctx.beginPath();
  ctx.arc(x - 2, gy - 32, r - 5, 0, Math.PI * 2);
  ctx.fill();
}

function drawJungleGym(ctx, x, gy, theme) {
  // Two vertical bars + three horizontal rungs.
  ctx.strokeStyle = '#7a5a3a';
  ctx.lineWidth = 3;
  const top = gy - 38;
  ctx.beginPath();
  ctx.moveTo(x - 16, gy);     ctx.lineTo(x - 16, top);
  ctx.moveTo(x + 16, gy);     ctx.lineTo(x + 16, top);
  ctx.moveTo(x - 16, top);    ctx.lineTo(x + 16, top);
  ctx.moveTo(x - 16, top + 12); ctx.lineTo(x + 16, top + 12);
  ctx.moveTo(x - 16, top + 24); ctx.lineTo(x + 16, top + 24);
  ctx.stroke();
}

function addClassroomFeatures(ctx, rng, w, heights, theme) {
  // 2-4 desks on the floor surface.
  const count = rng.int(2, 4);
  const positions = spreadPositions(rng, w, count, 120, 140);
  for (const cx of positions) {
    const gy = heights[cx];
    drawDesk(ctx, cx, gy);
  }
  // A chalkboard mid-map (decorative wall element high up).
  const bx = (w / 2) | 0;
  drawWallChalkboard(ctx, bx, 60);
}

function drawDesk(ctx, x, gy) {
  // Desk top: solid platform, brown.
  ctx.fillStyle = '#7a5a3a';
  ctx.fillRect(x - 22, gy - 18, 44, 4);
  // Side rails + legs.
  ctx.fillStyle = '#5a3a20';
  ctx.fillRect(x - 22, gy - 14, 4, 14);
  ctx.fillRect(x + 18, gy - 14, 4, 14);
  // Chair behind the desk (decorative, slightly to the right).
  ctx.fillStyle = '#a06030';
  ctx.fillRect(x + 26, gy - 12, 12, 3);
  ctx.fillStyle = '#7a5a3a';
  ctx.fillRect(x + 26, gy - 22, 3, 10);
  ctx.fillRect(x + 26, gy - 12, 3, 12);
  ctx.fillRect(x + 35, gy - 12, 3, 12);
}

function drawWallChalkboard(ctx, x, y) {
  // Dark green board with light frame, decorative only.
  ctx.fillStyle = '#5e441f';
  ctx.fillRect(x - 50, y - 4, 100, 4);     // top frame
  ctx.fillRect(x - 50, y + 36, 100, 4);    // bottom frame
  ctx.fillRect(x - 50, y, 4, 36);          // left frame
  ctx.fillRect(x + 46, y, 4, 36);          // right frame
  ctx.fillStyle = '#2f7a33';
  ctx.fillRect(x - 46, y, 92, 36);
  // Chalk text streaks.
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillRect(x - 38, y + 6, 24, 1);
  ctx.fillRect(x - 38, y + 12, 36, 1);
  ctx.fillRect(x - 38, y + 18, 28, 1);
  ctx.fillRect(x - 38, y + 24, 32, 1);
  ctx.fillRect(x - 38, y + 30, 20, 1);
}

function addGymFeatures(ctx, rng, w, heights, theme) {
  // Vaulting box on the floor.
  const vx = rng.range(w * 0.2, w * 0.45) | 0;
  drawVaultBox(ctx, vx, heights[vx], theme);
  // Pommel-horse / "Bock" further right.
  const hx = rng.range(w * 0.55, w * 0.85) | 0;
  drawPommelHorse(ctx, hx, heights[hx], theme);
  // Wall-mounted high-bar (decorative, between).
  const bx = (w / 2) | 0;
  drawHighBar(ctx, bx, 90, theme);
}

function drawVaultBox(ctx, x, gy, theme) {
  // Layered tiers like a real vaulting box.
  const layers = [
    { w: 30, h: 8, color: '#8a6630' },
    { w: 36, h: 8, color: '#a07b3a' },
    { w: 42, h: 8, color: '#c9974c' }
  ];
  let yOff = 0;
  for (const l of layers) {
    yOff += l.h;
    ctx.fillStyle = l.color;
    ctx.fillRect(x - l.w / 2, gy - yOff, l.w, l.h);
    // Thin top highlight.
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(x - l.w / 2, gy - yOff, l.w, 1);
  }
}

function drawPommelHorse(ctx, x, gy, theme) {
  // Body
  ctx.fillStyle = '#8a6630';
  ctx.fillRect(x - 22, gy - 18, 44, 8);
  ctx.fillStyle = '#705536';
  // Legs
  ctx.fillRect(x - 18, gy - 10, 3, 10);
  ctx.fillRect(x + 15, gy - 10, 3, 10);
  // Two handles (Pommels).
  ctx.fillStyle = '#d8d8d8';
  ctx.fillRect(x - 12, gy - 24, 4, 6);
  ctx.fillRect(x + 8, gy - 24, 4, 6);
}

function drawHighBar(ctx, x, y, theme) {
  ctx.fillStyle = '#705536';
  ctx.fillRect(x - 30, y, 60, 2);
  // Side supports
  ctx.fillRect(x - 30, y, 2, 14);
  ctx.fillRect(x + 28, y, 2, 14);
}
