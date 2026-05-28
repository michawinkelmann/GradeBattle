// Host-authoritative sync. Host simulates; clients render snapshots.
//
// Message types:
//   { type:'hello', name }                          (client -> host)
//   { type:'start', seed, map, players, turnTime, roundLimit, activeIdx }
//   { type:'snapshot', state }                      compact snapshot for renderable state
//   { type:'event', kind, payload }                 e.g. explosion, fire, terrain edit
//   { type:'input', kind, payload }                 (client -> host) action requests
//   { type:'end', winnerId, reason }

export function snapshotForClients(state) {
  return {
    activeIdx: state.activeIdx,
    round: state.round,
    wind: state.wind,
    turnTimer: state.turnTimer,
    turnState: state.turnState,
    players: state.players.map(p => ({
      id: p.id, x: p.x, y: p.y, vx: p.vx, vy: p.vy, facing: p.facing,
      state: p.state, points: p.points, outOfGame: p.outOfGame, outOfWorld: p.outOfWorld,
      selectedWeaponIdx: p.selectedWeaponIdx, name: p.name
    })),
    projectiles: state.world.projectiles.map(p => ({
      x: p.x, y: p.y, vx: p.vx, vy: p.vy, sprite: p.sprite, weaponId: p.weaponId
    })),
    mines: state.world.mines.map(m => ({ x: m.x, y: m.y, armed: m.armed })),
    lingerings: state.world.lingerings.map(l => ({ x: l.x, y: l.y, radius: l.radius })),
    winner: state.winner ? state.winner.id : null,
    endedReason: state.endedReason
  };
}

export function applySnapshot(state, snap) {
  state.activeIdx = snap.activeIdx;
  state.round = snap.round;
  state.wind = snap.wind;
  state.turnTimer = snap.turnTimer;
  state.turnState = snap.turnState;
  for (const sp of snap.players) {
    const p = state.players[sp.id];
    if (!p) continue;
    p.x = sp.x; p.y = sp.y; p.vx = sp.vx; p.vy = sp.vy; p.facing = sp.facing;
    p.state = sp.state; p.points = sp.points;
    p.outOfGame = sp.outOfGame; p.outOfWorld = sp.outOfWorld;
    p.selectedWeaponIdx = sp.selectedWeaponIdx; p.name = sp.name;
  }
  // Projectiles/mines: replace lists for visualization.
  state.world.projectiles = snap.projectiles.map(p => ({ ...p, age: 0, ownerId: -1 }));
  state.world.mines = snap.mines.map(m => ({ ...m, radius: 24, damage: 0, ownerId: -1, age: 1, armTime: 0 }));
  state.world.lingerings = snap.lingerings.map(l => ({ ...l, damage: 0, roundsLeft: 99 }));
  if (snap.winner != null) state.winner = state.players[snap.winner];
  state.endedReason = snap.endedReason;
}
