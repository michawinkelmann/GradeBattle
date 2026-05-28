import { explodeAt, addPlatform, isSolid } from '../engine/terrain.js';
import { stepProjectile, applyExplosion, GRAVITY, WIND_FACTOR } from '../engine/physics.js';
import { getProjectileSprite } from '../render/sprites.js';
import { applyDamage } from './grades.js';
import { getWeaponById } from './weapons.js';
import { playSound } from './sound.js';
import { addShake } from '../engine/canvas.js';

// World-level effect lists. The "state.world" object owns these arrays.

export function createWorld() {
  return {
    projectiles: [],
    particles: [],
    mines: [],
    lingerings: [],
    floatingPlatforms: [],
    turnEnded: false,
    pendingResolve: false
  };
}

// === Firing ===

export function fireWeapon(state, attacker, weapon, params) {
  const { angle, power, targetX, targetY } = params;
  const w = weapon;

  attacker.state = 'throw';
  attacker.stateTime = 0;

  switch (w.archetype) {
    case 'direct':
    case 'lobbed':
    case 'heavy':
    case 'lingering':
      spawnProjectile(state, attacker, w, angle, power);
      break;
    case 'cluster':
      spawnProjectile(state, attacker, w, angle, power, { cluster: true });
      break;
    case 'salvo':
      spawnSalvo(state, attacker, w, angle, power);
      break;
    case 'homing':
      spawnProjectile(state, attacker, w, angle, power, { homing: true });
      break;
    case 'mine':
      spawnProjectile(state, attacker, w, angle, power, { isMine: true });
      break;
    case 'area':
      triggerArea(state, attacker, w);
      break;
    case 'airstrike':
      triggerAirstrike(state, w, targetX);
      break;
    case 'utility':
      triggerUtility(state, attacker, w, params);
      break;
  }
}

function spawnProjectile(state, attacker, w, angle, power, opts = {}) {
  const speed = power * 360;
  const vx = Math.cos(angle) * speed;
  const vy = Math.sin(angle) * speed;
  const startX = attacker.x + Math.cos(angle) * 12;
  const startY = attacker.y - attacker.h * 0.7 + Math.sin(angle) * 12;
  attacker.facing = Math.cos(angle) >= 0 ? 1 : -1;

  state.world.projectiles.push({
    x: startX, y: startY,
    vx, vy,
    weaponId: w.id,
    sprite: w.projectile || 'book',
    radius: w.radius,
    damage: w.damage,
    windFactor: w.windFactor,
    gravityScale: w.gravityScale != null ? w.gravityScale : 1,
    bouncesLeft: w.bounces || 0,
    cluster: opts.cluster ? (w.cluster || 0) : 0,
    homing: !!opts.homing,
    homingStrength: w.homingStrength || 0,
    isMine: !!opts.isMine,
    knockback: w.knockback || 200,
    fuseSeconds: w.fuseSeconds,
    age: 0,
    ownerId: attacker.id,
    isLingerSeed: w.archetype === 'lingering',
    lingerRounds: w.lingerRounds || 0
  });
  playSound('throw');
}

function spawnSalvo(state, attacker, w, angle, power) {
  state.world.pendingSalvo = {
    count: w.salvoCount,
    interval: w.salvoInterval,
    timer: 0,
    weapon: w,
    angle,
    power,
    attackerId: attacker.id
  };
}

function triggerArea(state, attacker, w) {
  // Effect ring around attacker.
  state.world.particles.push({
    x: attacker.x, y: attacker.y - attacker.h / 2,
    radius: 0, maxRadius: w.radius,
    life: 0.6, age: 0,
    color: '#ffd54a', kind: 'ring'
  });
  // Damage everyone (including self with distance falloff -> self at center gets some, OK).
  for (const c of state.players) {
    if (c.outOfGame) continue;
    if (c.id === attacker.id) continue;
    const dx = c.x - attacker.x;
    const dy = (c.y - c.h / 2) - (attacker.y - attacker.h / 2);
    const d = Math.hypot(dx, dy);
    if (d <= w.radius) {
      const t = 1 - d / w.radius;
      applyDamage(c, Math.round(w.damage * t));
      applyExplosion(c, attacker.x, attacker.y - attacker.h / 2, w.radius, 120);
    }
  }
  playSound('area');
  state.world.turnEnded = true;
}

function triggerAirstrike(state, w, targetX) {
  // Spawn N projectiles falling from sky around targetX.
  const count = w.strikeCount || 5;
  const spread = 80;
  for (let i = 0; i < count; i++) {
    const x = targetX - spread / 2 + (i / Math.max(1, count - 1)) * spread + (Math.random() - 0.5) * 8;
    state.world.projectiles.push({
      x, y: -20,
      vx: 0, vy: 60 + i * 5,
      weaponId: w.id,
      sprite: w.projectile || 'homework',
      radius: w.radius,
      damage: w.damage,
      windFactor: w.windFactor,
      gravityScale: 1,
      bouncesLeft: 0,
      cluster: 0,
      ownerId: -1,
      age: 0,
      delay: i * 0.18
    });
  }
  state.world.turnEnded = true;
  playSound('airstrike');
}

function triggerUtility(state, attacker, w, params) {
  switch (w.utility) {
    case 'extraMove':
      attacker.moveLeft += 250;
      attacker.pendingExtraJump = true;
      playSound('drink');
      state.world.turnEnded = false; // Spieler darf weiter agieren – Zug endet erst nach Wurf/Pass
      break;
    case 'heal': {
      const before = attacker.points;
      attacker.points = Math.min(100, attacker.points + (w.healAmount || 20));
      state.world.particles.push({
        x: attacker.x, y: attacker.y - attacker.h, vx: 0, vy: -20,
        life: 1, age: 0, color: '#6ee37d', kind: 'text', text: `+${attacker.points - before}`
      });
      playSound('heal');
      state.world.turnEnded = true;
      break;
    }
    case 'teleport': {
      // Move attacker to params.targetX, drop to terrain.
      if (params.targetX != null) {
        const tx = Math.max(20, Math.min(state.terrain.width - 20, params.targetX));
        const ty = Math.max(20, Math.min(state.terrain.height - 30, params.targetY));
        attacker.x = tx;
        attacker.y = ty;
        attacker.vx = 0; attacker.vy = 0;
        playSound('teleport');
      }
      state.world.turnEnded = true;
      break;
    }
    case 'eraseTerrain': {
      if (params.targetX != null) {
        explodeAt(state.terrain, params.targetX, params.targetY, w.radius || 35);
        addShake(state.camera, 4, 0.2);
      }
      state.world.turnEnded = true;
      break;
    }
    case 'placePlatform': {
      if (params.targetX != null) {
        const px = params.targetX - 30;
        const py = params.targetY - 4;
        addPlatform(state.terrain, px, py, 60, 8);
      }
      state.world.turnEnded = true;
      break;
    }
    case 'rope': {
      // Quick boost: jump higher in facing direction.
      attacker.vy = -250;
      attacker.vx = attacker.facing * 180;
      attacker.grounded = false;
      playSound('jump');
      state.world.turnEnded = false;
      break;
    }
    case 'pass':
    default:
      state.world.turnEnded = true;
      break;
  }
}

// === Projectile simulation per frame ===

export function stepWorld(state, dt) {
  const { world, terrain, wind, players } = state;

  // Salvo emission.
  if (world.pendingSalvo) {
    const s = world.pendingSalvo;
    s.timer += dt;
    const attacker = players.find(p => p.id === s.attackerId);
    if (!attacker) world.pendingSalvo = null;
    else {
      while (s.timer >= s.interval && s.count > 0) {
        s.timer -= s.interval;
        s.count -= 1;
        const jitter = (Math.random() - 0.5) * 0.06;
        spawnProjectile(state, attacker, s.weapon, s.angle + jitter, s.power);
      }
      if (s.count <= 0) world.pendingSalvo = null;
    }
  }

  // Lingering clouds: apply damage on first frame of new turn handled in turn.js.
  // Visual particles only here.

  // Projectiles.
  for (let i = world.projectiles.length - 1; i >= 0; i--) {
    const p = world.projectiles[i];
    if (p.delay && p.delay > 0) { p.delay -= dt; continue; }
    p.age += dt;

    // Homing logic.
    if (p.homing) {
      const target = findClosestEnemy(p, players);
      if (target) {
        const dx = target.x - p.x;
        const dy = (target.y - target.h / 2) - p.y;
        const d = Math.hypot(dx, dy) || 1;
        const ax = (dx / d) * p.homingStrength * dt;
        const ay = (dy / d) * p.homingStrength * dt;
        p.vx += ax; p.vy += ay;
      }
    }

    // Fuse timer.
    if (p.fuseSeconds != null && p.age >= p.fuseSeconds) {
      explode(state, p, p.x, p.y);
      world.projectiles.splice(i, 1);
      continue;
    }

    const res = stepProjectile(p, terrain, wind, dt);

    // Character hit (skip very first frames to avoid hitting owner).
    if (p.age > 0.08) {
      for (const c of players) {
        if (c.outOfGame || c.outOfWorld) continue;
        if (c.id === p.ownerId && p.age < 0.3) continue;
        const dx = c.x - p.x;
        const dy = (c.y - c.h / 2) - p.y;
        const r = c.w * 0.6;
        if (dx * dx + dy * dy < r * r) {
          explode(state, p, p.x, p.y);
          world.projectiles.splice(i, 1);
          break;
        }
      }
      if (world.projectiles[i] !== p) continue;
    }

    if (res.hit) {
      if (res.reason === 'offworld') {
        world.projectiles.splice(i, 1);
        continue;
      }
      // Mine: instead of exploding, plant.
      if (p.isMine && p.age > 0.2) {
        world.mines.push({
          x: p.x, y: p.y, radius: p.radius, damage: p.damage,
          ownerId: p.ownerId, armed: false, armTime: 0.6, age: 0
        });
        world.projectiles.splice(i, 1);
        continue;
      }
      // Bouncer.
      if (p.bouncesLeft > 0) {
        p.bouncesLeft -= 1;
        // Reflect by sampling terrain slope.
        const normal = sampleNormal(terrain, p.x, p.y);
        const dot = p.vx * normal.x + p.vy * normal.y;
        p.vx = (p.vx - 2 * dot * normal.x) * 0.55;
        p.vy = (p.vy - 2 * dot * normal.y) * 0.55;
        // Nudge out.
        p.x += normal.x * 2; p.y += normal.y * 2;
        continue;
      }
      explode(state, p, p.x, p.y);
      world.projectiles.splice(i, 1);
    }
  }

  // Mines.
  for (let i = world.mines.length - 1; i >= 0; i--) {
    const m = world.mines[i];
    m.age += dt;
    if (!m.armed) {
      if (m.age >= m.armTime) m.armed = true;
      continue;
    }
    for (const c of players) {
      if (c.outOfGame || c.outOfWorld) continue;
      const dx = c.x - m.x;
      const dy = (c.y - c.h / 2) - m.y;
      if (dx * dx + dy * dy < 100) {
        const fake = { x: m.x, y: m.y, radius: m.radius, damage: m.damage, knockback: 260, ownerId: m.ownerId, weaponId: 'reisszwecke' };
        explode(state, fake, m.x, m.y);
        world.mines.splice(i, 1);
        break;
      }
    }
  }

  // Particles.
  for (let i = world.particles.length - 1; i >= 0; i--) {
    const pt = world.particles[i];
    pt.age += dt;
    if (pt.vx != null) pt.x += pt.vx * dt;
    if (pt.vy != null) {
      pt.y += pt.vy * dt;
      pt.vy += (pt.gravity || 200) * dt;
    }
    if (pt.kind === 'ring') {
      pt.radius = pt.maxRadius * (pt.age / pt.life);
    }
    if (pt.age >= pt.life) world.particles.splice(i, 1);
  }
}

function findClosestEnemy(p, players) {
  let best = null, bestD = Infinity;
  for (const c of players) {
    if (c.outOfGame || c.outOfWorld) continue;
    if (c.id === p.ownerId) continue;
    const d = Math.hypot(c.x - p.x, c.y - c.h / 2 - p.y);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

function sampleNormal(terrain, x, y) {
  // Sample three points to estimate slope normal.
  const eps = 3;
  const l = isSolid(terrain, x - eps, y) ? 1 : 0;
  const r = isSolid(terrain, x + eps, y) ? 1 : 0;
  const u = isSolid(terrain, x, y - eps) ? 1 : 0;
  const d = isSolid(terrain, x, y + eps) ? 1 : 0;
  let nx = l - r;
  let ny = u - d;
  if (nx === 0 && ny === 0) ny = -1;
  const m = Math.hypot(nx, ny) || 1;
  return { x: nx / m, y: ny / m };
}

export function explode(state, p, x, y) {
  // Lingering: place a cloud instead of carving terrain.
  if (p.isLingerSeed) {
    state.world.lingerings.push({
      x, y, radius: p.radius, damage: p.damage, roundsLeft: p.lingerRounds
    });
    spawnParticles(state.world, x, y, 14, '#c9974c');
    playSound('soft');
    return;
  }

  explodeAt(state.terrain, x, y, p.radius);
  addShake(state.camera, 4 + p.radius / 20, 0.25);
  spawnParticles(state.world, x, y, 18, particleColorForWeapon(p.weaponId));

  // Damage + knockback to characters.
  for (const c of state.players) {
    if (c.outOfGame || c.outOfWorld) continue;
    const closeness = applyExplosion(c, x, y, p.radius, p.knockback || 200);
    if (closeness > 0) {
      const dmg = Math.round(p.damage * closeness);
      applyDamage(c, dmg);
    }
  }

  // Cluster: spawn shards.
  if (p.cluster && p.cluster > 0) {
    for (let i = 0; i < p.cluster; i++) {
      const a = (-Math.PI / 2) + ((i / Math.max(1, p.cluster - 1)) - 0.5) * Math.PI * 0.7;
      const speed = 140 + Math.random() * 60;
      state.world.projectiles.push({
        x, y: y - 4,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        weaponId: p.weaponId,
        sprite: 'book',
        radius: Math.max(14, p.radius * 0.5),
        damage: Math.round(p.damage * 0.6),
        windFactor: p.windFactor * 0.8,
        gravityScale: 1,
        bouncesLeft: 0,
        cluster: 0,
        ownerId: p.ownerId,
        age: 0
      });
    }
  }
  playSound('explode');
}

function particleColorForWeapon(id) {
  switch (id) {
    case 'wasserbombe': return '#4ad6ff';
    case 'kreidegewehr': return '#f1f1f1';
    case 'laptop': return '#222';
    case 'megaphon': return '#ffd54a';
    case 'stinkekaese': return '#c9974c';
    default: return '#d8d8d8';
  }
}

function spawnParticles(world, x, y, count, color) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 60 + Math.random() * 140;
    world.particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      gravity: 200,
      life: 0.5 + Math.random() * 0.4, age: 0,
      color, kind: 'dot'
    });
  }
}

// Apply lingering clouds at start of turn.
export function applyLingeringAtTurnStart(state) {
  for (const l of state.world.lingerings) {
    for (const c of state.players) {
      if (c.outOfGame || c.outOfWorld) continue;
      const dx = c.x - l.x;
      const dy = (c.y - c.h / 2) - l.y;
      if (dx * dx + dy * dy < l.radius * l.radius) {
        applyDamage(c, l.damage);
      }
    }
    l.roundsLeft -= 1;
  }
  state.world.lingerings = state.world.lingerings.filter(l => l.roundsLeft > 0);
}

// === Drawing ===

export function drawWorld(ctx, state) {
  const { world } = state;
  // Mines
  for (const m of world.mines) {
    const sp = getProjectileSprite('tack');
    ctx.drawImage(sp, Math.round(m.x - sp.width / 2), Math.round(m.y - sp.height));
    if (!m.armed) {
      ctx.fillStyle = '#ffd54a';
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(m.x, m.y - 4, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  // Lingerings (clouds)
  for (const l of world.lingerings) {
    ctx.fillStyle = 'rgba(201,151,76,0.35)';
    ctx.beginPath();
    ctx.arc(l.x, l.y, l.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(201,151,76,0.6)';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + Date.now() * 0.001;
      ctx.beginPath();
      ctx.arc(l.x + Math.cos(a) * l.radius * 0.6, l.y + Math.sin(a) * l.radius * 0.6, 10, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Projectiles
  for (const p of world.projectiles) {
    if (p.delay && p.delay > 0) continue;
    const sp = getProjectileSprite(p.sprite || 'book');
    ctx.drawImage(sp, Math.round(p.x - sp.width / 2), Math.round(p.y - sp.height / 2));
  }
  // Particles
  for (const pt of world.particles) {
    if (pt.kind === 'ring') {
      ctx.strokeStyle = pt.color;
      ctx.globalAlpha = 1 - (pt.age / pt.life);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (pt.kind === 'text') {
      ctx.font = '8px monospace';
      ctx.fillStyle = pt.color;
      ctx.globalAlpha = 1 - (pt.age / pt.life);
      ctx.textAlign = 'center';
      ctx.fillText(pt.text, pt.x, pt.y);
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = pt.color;
      ctx.globalAlpha = Math.max(0, 1 - pt.age / pt.life);
      ctx.fillRect(Math.round(pt.x), Math.round(pt.y), 2, 2);
      ctx.globalAlpha = 1;
    }
  }
}

export function worldBusy(world) {
  return world.projectiles.length > 0
    || world.pendingSalvo
    || world.particles.some(p => p.life > 0.4 && p.age < p.life * 0.5);
}
