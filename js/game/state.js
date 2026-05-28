import { createTerrain } from '../engine/terrain.js';
import { createCamera } from '../engine/canvas.js';
import { createRng, randomSeed } from '../engine/rng.js';
import { createWorld } from './effects.js';
import { makeCharacter, spawnPositions } from './characters.js';
import { t } from '../i18n/i18n.js';

export function createGameState(config) {
  const seed = config.seed != null ? config.seed : randomSeed();
  const terrain = createTerrain(seed, config.map || 'schulhof');
  const camera = createCamera();
  const rng = createRng(seed ^ 0x9e3779b9);

  const players = [];
  const spots = spawnPositions(config.playerCount, terrain);
  for (let i = 0; i < config.playerCount; i++) {
    const p = config.playerDefs ? config.playerDefs[i] : null;
    const isBot = p ? !!p.isBot : i >= (config.playerCount - (config.botCount || 0));
    const name = p?.name || (isBot ? `Bot ${i + 1}` : `Spieler ${i + 1}`);
    players.push(makeCharacter({
      id: i,
      name,
      isBot,
      botLevel: config.botLevel,
      isLocal: p?.isLocal ?? true,
      peerId: p?.peerId || null,
      variantIndex: i,
      x: spots[i].x,
      y: spots[i].y,
      facing: spots[i].x < terrain.width / 2 ? 1 : -1
    }));
  }

  return {
    config,
    seed,
    terrain,
    camera,
    rng,
    players,
    activeIdx: 0,
    round: 1,
    wind: 0,
    turnTimer: config.turnTime || 30,
    turnState: 'idle',     // idle | aim | inflight | resolving | ended
    world: createWorld(),
    mode: config.mode,      // 'single' | 'hotseat' | 'host' | 'client'
    winner: null,
    endedReason: null,
    log: []
  };
}

export function rollWind(state) {
  state.wind = state.rng.range(-1, 1);
}

export function activePlayer(state) {
  return state.players[state.activeIdx];
}

export function aliveCount(state) {
  return state.players.filter(p => !p.outOfGame && !p.outOfWorld).length;
}

export function nextAliveIndex(state) {
  let idx = state.activeIdx;
  for (let i = 0; i < state.players.length; i++) {
    idx = (idx + 1) % state.players.length;
    if (idx === state.activeIdx) {
      // wrapped fully back; if active itself dead, continue scan
      const p = state.players[idx];
      if (!p.outOfGame && !p.outOfWorld) return idx;
      continue;
    }
    const p = state.players[idx];
    if (!p.outOfGame && !p.outOfWorld) return idx;
  }
  return state.activeIdx;
}
