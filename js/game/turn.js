import { applyLingeringAtTurnStart, worldBusy } from './effects.js';
import { activePlayer, nextAliveIndex, rollWind, aliveCount } from './state.js';
import { playSound } from './sound.js';
import { MOVE_BUDGET } from './characters.js';
import { pointsToGrade } from './grades.js';
import { t } from '../i18n/i18n.js';

const RESOLVE_DELAY = 0.6;          // seconds to wait after projectiles settle
const POST_TURN_PAUSE = 0.8;

export function startTurn(state) {
  const p = activePlayer(state);
  p.state = 'stand';
  p.moveLeft = MOVE_BUDGET;
  p.pendingExtraJump = false;
  rollWind(state);
  state.turnTimer = state.config.turnTime || 30;
  state.turnState = 'aim';
  state.world.turnEnded = false;
  state.world.resolveTimer = 0;
  applyLingeringAtTurnStart(state);
  playSound('turn');
}

// Called every fixed step.
export function updateTurn(state, dt) {
  if (state.winner != null || state.endedReason) return;
  // Promote out-of-world to out-of-game so the report card shows "6".
  for (const p of state.players) {
    if (p.outOfWorld && !p.outOfGame) {
      p.outOfGame = true;
      p.points = 0;
      p._justFailed = true;
    }
    if (p._justFailed && !p._failLogged) {
      p._failLogged = true;
      const key = p.outOfWorld ? 'msg.outOfWorld' : 'msg.failed';
      state.log.push(`${p.name} ${t(key)}`);
      playSound('fail');
    }
  }
  // Continuous win check (catches out-of-world & external state mods).
  checkWinCondition(state);
  if (state.winner != null) return;
  if (state.turnState === 'aim') {
    state.turnTimer -= dt;
    if (state.turnTimer <= 0) {
      // Time ran out – auto-pass.
      state.turnState = 'resolving';
      state.world.turnEnded = true;
      state.world.resolveTimer = 0.4;
    }
    // If a weapon ended the turn during aim (utility), advance.
    if (state.world.turnEnded) {
      state.turnState = 'resolving';
      state.world.resolveTimer = 0;
    }
  } else if (state.turnState === 'inflight') {
    if (!worldBusy(state.world)) {
      state.turnState = 'resolving';
      state.world.resolveTimer = 0;
    }
  } else if (state.turnState === 'resolving') {
    state.world.resolveTimer += dt;
    if (state.world.resolveTimer >= RESOLVE_DELAY) {
      finalizeTurn(state);
    }
  } else if (state.turnState === 'ended') {
    state.world.resolveTimer += dt;
    if (state.world.resolveTimer >= POST_TURN_PAUSE) {
      advanceTurn(state);
    }
  }
}

export function markFired(state) {
  // Called when a weapon was fired and projectile is in air.
  state.turnState = 'inflight';
}

function finalizeTurn(state) {
  // Make sure out-of-world chars are also marked out-of-game (updateTurn already does this).
  for (const p of state.players) {
    if ((p.outOfWorld || p.points <= 0) && !p.outOfGame) {
      p.outOfGame = true;
    }
  }
  state.turnState = 'ended';
  state.world.resolveTimer = 0;
  checkWinCondition(state);
}

function advanceTurn(state) {
  if (state.winner != null) return;
  state.activeIdx = nextAliveIndex(state);
  // Round bumps when we wrap past the lowest active id.
  state.round += 1;
  if (state.config.roundLimit && state.round > state.config.roundLimit) {
    // Best grade wins.
    determineWinnerByGrade(state, 'timeUp');
    return;
  }
  startTurn(state);
}

function checkWinCondition(state) {
  const alive = state.players.filter(p => !p.outOfGame && !p.outOfWorld);
  if (alive.length === 1) {
    state.winner = alive[0];
    state.endedReason = 'lastStanding';
    playSound('win');
  } else if (alive.length === 0) {
    state.winner = null;
    state.endedReason = 'draw';
    playSound('lose');
  }
}

function determineWinnerByGrade(state, reason) {
  const alive = state.players.filter(p => !p.outOfGame && !p.outOfWorld);
  if (alive.length === 0) {
    state.winner = null;
    state.endedReason = 'draw';
    return;
  }
  alive.sort((a, b) => b.points - a.points);
  if (alive.length === 1 || alive[0].points > alive[1].points) {
    state.winner = alive[0];
  } else {
    state.winner = null; // tie
  }
  state.endedReason = reason;
  playSound(state.winner ? 'win' : 'lose');
}
