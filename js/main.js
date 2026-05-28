import { initI18n, t, applyToDom, onLangChange } from './i18n/i18n.js';
import { setupCanvas, fitCanvasCss, updateCamera } from './engine/canvas.js';
import { createLoop } from './engine/loop.js';
import { createGameState, activePlayer, nextAliveIndex } from './game/state.js';
import { startTurn, updateTurn, markFired } from './game/turn.js';
import { stepWorld, fireWeapon } from './game/effects.js';
import { WALK_SPEED, JUMP_VY, JUMP_COST } from './game/characters.js';
import { setupHud, renderHud, openWeaponWheel, closeWeaponWheel, invalidateHud } from './ui/hud.js';
import { setupMenu, showScreen, setLobbyCode, setLobbyPlayers, showEndScreen } from './ui/menu.js';
import { createControls, getActiveWeapon } from './ui/controls.js';
import { bindTutorialControls, showTutorial, hasSeenTutorial } from './ui/tutorial.js';
import { bindSettingsControls, setOnMuteChanged } from './ui/settings.js';
import { drawScene } from './render/scene.js';
import { WEAPONS } from './game/weapons.js';
import { planBotTurn, executeBotPlan } from './ai/bot.js';
import { playSound, setMuted, isMuted } from './game/sound.js';
import { createHost, joinHost } from './net/peer.js';
import { snapshotForClients, applySnapshot } from './net/sync.js';
import { randomSeed } from './engine/rng.js';
import { explodeAt, addPlatform } from './engine/terrain.js';
import { moveCharacter as moveChar } from './engine/physics.js';

const App = {
  canvas: null,
  ctx: null,
  hud: null,
  controls: null,
  state: null,
  loop: null,
  net: null,                  // { kind:'host'|'client', api, ... }
  paused: false,
  botTimer: 0,
  config: null,
  remoteSnapshot: null,        // for client renderers
  localPlayerId: null,         // for net
};

window.addEventListener('DOMContentLoaded', boot);

async function boot() {
  await initI18n();
  applyToDom();
  App.canvas = document.getElementById('game-canvas');
  App.ctx = setupCanvas(App.canvas);
  fitCanvasCss(App.canvas);
  App.hud = setupHud();

  // HUD buttons
  function syncMuteButton() {
    App.hud.btnMute.textContent = isMuted() ? '🔇' : '🔊';
  }
  App.hud.btnMute.addEventListener('click', () => {
    setMuted(!isMuted());
    syncMuteButton();
  });
  syncMuteButton();
  setOnMuteChanged(syncMuteButton);

  App.hud.btnPause.addEventListener('click', togglePause);
  App.hud.btnWeapons.addEventListener('click', () => {
    if (!App.state) return;
    if (!isLocalActivePlayer()) return;
    openWeaponWheel(App.hud, App.state, (idx) => {
      const me = activePlayer(App.state);
      me.selectedWeaponIdx = idx;
      closeWeaponWheel(App.hud);
      playSound('click');
    });
  });

  setupMenu({
    onStart: startGame,
    onJoinLobby: joinLobby,
    onStartLobby: startLobbyGame,
    onLeaveLobby: leaveLobby,
    onRematch: () => { if (App.config) startGame(App.config); },
    onQuit: quitGame,
    onResume: () => togglePause(false)
  });

  // Orientation check.
  checkOrientation();
  window.addEventListener('resize', checkOrientation);
  window.addEventListener('orientationchange', checkOrientation);

  // Guard against accidental F5 / tab close mid-match.
  window.addEventListener('beforeunload', (e) => {
    if (App.state && !App.state.winner && !App.state.endedReason) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  App.loop = createLoop({
    update: tick,
    render: render
  });
  App.loop.start();

  onLangChange(() => { if (App.hud) invalidateHud(App.hud); });

  // Tutorial: bind controls + show on first launch.
  bindTutorialControls();
  if (!hasSeenTutorial()) {
    setTimeout(() => showTutorial(), 250);
  }
  // Settings screen wiring.
  bindSettingsControls();

  showScreen('screen-menu');
}

function checkOrientation() {
  // Show portrait hint only on small screens in portrait.
  const small = Math.min(window.innerWidth, window.innerHeight) < 500;
  const portrait = window.innerHeight > window.innerWidth;
  const o = document.getElementById('orientation-overlay');
  if (small && portrait) o.classList.remove('hidden');
  else o.classList.add('hidden');
}

function startGame(config) {
  App.config = { ...config };
  App.endShown = false;
  if (config.mode === 'host' && App.net && App.net.kind === 'host') {
    // Mix human peers + bots to fill playerCount.
    const peers = App.net.lobbyPlayers; // [{peerId, name}]
    const total = config.playerCount;
    const humanCount = 1 + peers.length;   // host + clients
    const botCount = Math.max(0, total - humanCount);
    config.botCount = botCount;
    config.playerDefs = [];
    config.playerDefs.push({ name: 'Host', isBot: false, isLocal: true, peerId: null });
    for (const peer of peers) config.playerDefs.push({ name: peer.name, isBot: false, isLocal: false, peerId: peer.peerId });
    for (let i = 0; i < botCount; i++) config.playerDefs.push({ name: `Bot ${i + 1}`, isBot: true, isLocal: true });
  } else if (config.mode === 'client') {
    // Client path handled separately via remote snapshots.
  } else {
    // single / hotseat - the customizer has already produced playerDefs in
    // menu.js readSetup(). Fall back to the legacy generator only if missing
    // (e.g. when startGame is called programmatically by Rematch with the
    // previous config that already has defs).
    if (!Array.isArray(config.playerDefs) || config.playerDefs.length !== config.playerCount) {
      config.playerDefs = [];
      const humanCount = Math.max(0, config.playerCount - config.botCount);
      for (let i = 0; i < humanCount; i++) {
        config.playerDefs.push({ name: config.mode === 'single' ? 'Du' : `Spieler ${i + 1}`, isBot: false, isLocal: true });
      }
      for (let i = 0; i < config.botCount; i++) {
        config.playerDefs.push({ name: `Bot ${i + 1}`, isBot: true, isLocal: true });
      }
    }
  }

  App.state = createGameState(config);
  // Host broadcasts terrain edits so clients stay in sync (snapshots don't carry the bitmap).
  if (config.mode === 'host' && App.net && App.net.kind === 'host') {
    App.state.onTerrainEvent = (ev) => App.net.api.broadcast({ type: 'terrain', ...ev });
  }
  window.__APP_STATE__ = App.state;
  startTurn(App.state);

  // Controls (suppress if pure client – they will only send inputs over net).
  App.controls = createControls({
    canvas: App.canvas,
    getState: () => App.state,
    getActiveLocalPlayer: () => {
      const me = activePlayer(App.state);
      if (!me) return null;
      if (App.state.config.mode === 'client') {
        return me.peerId === App.net.peerId ? me : null;
      }
      if (me.isBot) return null;
      if (!me.isLocal) return null;
      return me;
    },
    onWeaponWheelToggle: () => {
      if (!isLocalActivePlayer()) return;
      if (App.hud.weaponWheel.classList.contains('hidden')) {
        openWeaponWheel(App.hud, App.state, idx => {
          const me = activePlayer(App.state); me.selectedWeaponIdx = idx;
          closeWeaponWheel(App.hud); playSound('click');
        });
      } else {
        closeWeaponWheel(App.hud);
      }
    },
    onPauseToggle: togglePause,
    sendInput: App.state.config.mode === 'client' ? (msg) => App.net.api.send(msg) : null
  });

  // For host: broadcast initial start.
  if (config.mode === 'host' && App.net && App.net.kind === 'host') {
    App.net.api.broadcast({
      type: 'start',
      seed: App.state.seed,
      map: App.state.config.map,
      players: App.state.players.map(p => ({ id: p.id, name: p.name, isBot: p.isBot, peerId: p.peerId, variantIndex: p.id })),
      turnTime: config.turnTime, roundLimit: config.roundLimit,
      activeIdx: App.state.activeIdx
    });
  }

  showScreen('screen-game');
  playSound('bell');
}

function tick(dt) {
  if (App.paused) return;
  if (!App.state) return;

  // Client: drives only the camera + simple animations; world simulation comes via snapshots.
  if (App.state.config.mode === 'client') {
    // smooth interpolation: nothing to do; just camera follow.
    const cur = activePlayer(App.state);
    if (cur) updateCamera(App.state.camera, cur.x, cur.y - 30, App.state.terrain.width, App.state.terrain.height, dt);
    return;
  }

  const me = activePlayer(App.state);

  // Handle movement for local human active player.
  if (me && !me.outOfGame && !me.outOfWorld && me.isLocal && !me.isBot && App.state.turnState === 'aim') {
    handleMovement(me, dt);
  }
  // Apply network-relayed movement for remote active player (host-side only).
  if (me && !me.outOfGame && !me.outOfWorld && !me.isLocal && !me.isBot && App.state.turnState === 'aim') {
    applyRemoteMovement(me, dt);
  }

  // Bot turn logic + "Bot überlegt…" overlay (only toggle when the state flips).
  const isBotTurn = me && me.isBot && App.state.turnState === 'aim';
  if (isBotTurn !== App._lastBotTurn) {
    document.getElementById('bot-thinking')?.classList.toggle('hidden', !isBotTurn);
    App._lastBotTurn = isBotTurn;
  }
  if (isBotTurn) {
    App.botTimer += dt;
    if (App.botTimer > 0.9) {
      App.botTimer = 0;
      const plan = planBotTurn(App.state, me);
      if (plan) executeBotPlan(App.state, me, plan);
    }
  } else {
    App.botTimer = 0;
  }

  // Step world (projectiles, particles).
  stepWorld(App.state, dt);

  // Apply character physics (every char that's not stuck out).
  for (const c of App.state.players) {
    if (c.outOfGame && !c.outOfWorld) {
      // Still subject to gravity until they hit ground; then idle.
      moveChar(c, App.state.terrain, dt);
      continue;
    }
    if (c.outOfWorld) continue;
    moveChar(c, App.state.terrain, dt);
  }

  // Turn machine.
  updateTurn(App.state, dt);

  // Win condition transitions to end screen.
  if (App.state.winner !== null || App.state.endedReason === 'draw' || App.state.endedReason === 'timeUp') {
    if (!App.endShown) {
      App.endShown = true;
      setTimeout(() => {
        showEndScreen(App.state);
      }, 1500);
    }
  }

  // Camera target = active or last projectile.
  let camTarget = null;
  if (App.state.world.projectiles.length > 0) {
    const last = App.state.world.projectiles[App.state.world.projectiles.length - 1];
    camTarget = { x: last.x, y: last.y };
  } else if (me) {
    camTarget = { x: me.x, y: me.y - 30 };
  }
  if (camTarget) updateCamera(App.state.camera, camTarget.x, camTarget.y, App.state.terrain.width, App.state.terrain.height, dt);

  // Host broadcasts snapshot.
  if (App.state.config.mode === 'host' && App.net && App.net.kind === 'host') {
    App.netSnapTimer = (App.netSnapTimer || 0) + dt;
    if (App.netSnapTimer >= 0.08) {
      App.netSnapTimer = 0;
      App.net.api.broadcast({ type: 'snapshot', snap: snapshotForClients(App.state) });
    }
  }
}

function handleMovement(me, dt) {
  const move = App.controls && App.controls.moveDir ? App.controls.moveDir : 0;
  if (move !== 0 && me.moveLeft > 0 && me.grounded) {
    me.vx = move * WALK_SPEED;
    me.facing = move;
    me.state = 'walk';
    me.moveLeft -= Math.abs(WALK_SPEED) * dt;
  } else if (me.grounded) {
    me.vx = 0;
    if (me.state !== 'throw') me.state = 'stand';
  }
  if (App.controls && App.controls.jumpRequested) {
    App.controls.jumpRequested = false;
    if (me.grounded && me.moveLeft > 20) {
      me.vy = JUMP_VY;
      me.grounded = false;
      me.moveLeft -= JUMP_COST;
      playSound('jump');
    }
  }
  // Reset throw state after a moment.
  if (me.state === 'throw' && me.stateTime > 0.4) me.state = 'stand';
  me.stateTime += dt;
}

function applyRemoteMovement(me, dt) {
  const move = me._netMove || 0;
  if (move !== 0 && me.moveLeft > 0 && me.grounded) {
    me.vx = move * WALK_SPEED;
    me.facing = move;
    me.state = 'walk';
    me.moveLeft -= Math.abs(WALK_SPEED) * dt;
  } else if (me.grounded) {
    me.vx = 0;
    if (me.state !== 'throw') me.state = 'stand';
  }
  if (me._netJump) {
    me._netJump = false;
    if (me.grounded && me.moveLeft > 20) {
      me.vy = JUMP_VY;
      me.grounded = false;
      me.moveLeft -= JUMP_COST;
      playSound('jump');
    }
  }
  if (me.state === 'throw' && me.stateTime > 0.4) me.state = 'stand';
  me.stateTime += dt;
}

function render() {
  if (!App.state) return;
  drawScene(App.ctx, App.state, App.controls);
  renderHud(App.hud, App.state);
}

function togglePause(force) {
  const p = typeof force === 'boolean' ? force : !App.paused;
  App.paused = p;
  document.getElementById('pause-overlay').classList.toggle('hidden', !p);
}

function quitGame() {
  // Close any net connections, clear state.
  if (App.net) {
    try { App.net.api && App.net.api.close && App.net.api.close(); } catch (e) {}
    App.net = null;
  }
  App.state = null;
  App.endShown = false;
  togglePause(false);
}

function isLocalActivePlayer() {
  if (!App.state) return false;
  const me = activePlayer(App.state);
  if (!me) return false;
  if (App.state.config.mode === 'client') {
    return me.peerId === App.net?.peerId;
  }
  return me.isLocal && !me.isBot;
}

// ============ Networking ============

async function hostLobby(config) {
  if (App._hosting) return;
  App._hosting = true;
  try {
    App.net = { kind: 'host', lobbyPlayers: [] };
    const api = await createHost({
      onPlayerJoin: (peerId, name) => {
        App.net.lobbyPlayers.push({ peerId, name });
        refreshLobby();
      },
      onPlayerLeave: (peerId) => {
        App.net.lobbyPlayers = App.net.lobbyPlayers.filter(p => p.peerId !== peerId);
        refreshLobby();
      },
      onMessage: (peerId, msg) => onHostMessage(peerId, msg),
      onError: (e) => console.error('Host error', e),
    });
    App.net.api = api;
    setLobbyCode(api.code);
    refreshLobby();
    showScreen('screen-lobby');
  } catch (e) {
    alert('Host fehlgeschlagen: ' + (e.message || e));
  } finally {
    App._hosting = false;
  }
}

function refreshLobby() {
  if (!App.net || App.net.kind !== 'host') return;
  const list = [{ name: 'Host', isHost: true }, ...App.net.lobbyPlayers.map(p => ({ name: p.name }))];
  setLobbyPlayers(list);
  // Push the same list to every connected client so they see who's in.
  if (App.net.api) App.net.api.broadcast({ type: 'lobby', players: list });
}

function startLobbyGame() {
  if (!App.net || App.net.kind !== 'host') return;
  const cfg = readQuickConfigForHost();
  startGame(cfg);
}

function readQuickConfigForHost() {
  return {
    mode: 'host',
    playerCount: Math.min(4, 1 + App.net.lobbyPlayers.length + 0), // bots fill in startGame
    botCount: 0,
    botLevel: 'medium',
    turnTime: 30,
    roundLimit: null,
    map: 'schulhof'
  };
}

async function joinLobby(code) {
  try {
    App.net = { kind: 'client' };
    const api = await joinHost({
      code, name: 'Spieler',
      onMessage: onClientMessage,
      onClose: () => {
        alert(t('msg.hostLost', 'Lost connection'));
        quitGame();
        showScreen('screen-menu');
      },
      onError: (e) => console.error('Net err', e)
    });
    App.net.api = api;
    App.net.peerId = api.peer.id;
    showScreen('screen-lobby');
    setLobbyCode(code);
    setLobbyPlayers([{ name: 'Host', isHost: true }, { name: 'Du' }]);
  } catch (e) {
    alert('Verbindung fehlgeschlagen: ' + (e.message || e));
    showScreen('screen-menu');
  }
}

function leaveLobby() { quitGame(); }

function onHostMessage(peerId, msg) {
  if (!App.state) return;
  if (msg.type === 'input') {
    // Map peerId -> player
    const player = App.state.players.find(p => p.peerId === peerId);
    if (!player) return;
    if (App.state.activeIdx !== player.id) return; // Only active may input.
    if (msg.kind === 'fire') {
      const w = WEAPONS.find(w => w.id === msg.weaponId);
      if (!w) return;
      fireWeapon(App.state, player, w, msg);
      if (App.state.world.turnEnded || App.state.world.projectiles.length > 0) markFired(App.state);
    } else if (msg.kind === 'move') {
      player._netMove = Math.max(-1, Math.min(1, msg.dir | 0));
      if (msg.jump) player._netJump = true;
    } else if (msg.kind === 'selectWeapon') {
      const len = WEAPONS.length;
      const idx = Number.isFinite(msg.idx) ? msg.idx : 0;
      player.selectedWeaponIdx = ((idx % len) + len) % len;
    }
  }
}

function onClientMessage(msg) {
  if (msg.type === 'start') {
    // Build a local renderable game state from start info.
    App.config = { mode: 'client', map: msg.map, playerCount: msg.players.length, turnTime: msg.turnTime, roundLimit: msg.roundLimit, playerDefs: msg.players.map((p, i) => ({ name: p.name, isBot: p.isBot, isLocal: false, peerId: p.peerId })), seed: msg.seed };
    App.state = createGameState(App.config);
    App.endShown = false;
    showScreen('screen-game');
    App.controls = createControls({
      canvas: App.canvas,
      getState: () => App.state,
      getActiveLocalPlayer: () => {
        const me = activePlayer(App.state);
        if (!me) return null;
        return me.peerId === App.net.peerId ? me : null;
      },
      onWeaponWheelToggle: () => {
        if (App.hud.weaponWheel.classList.contains('hidden')) {
          openWeaponWheel(App.hud, App.state, idx => {
            App.net.api.send({ type: 'input', kind: 'selectWeapon', idx });
            closeWeaponWheel(App.hud);
          });
        } else closeWeaponWheel(App.hud);
      },
      onPauseToggle: togglePause,
      sendInput: (input) => {
        const { type: kind, ...rest } = input;
        App.net.api.send({ type: 'input', kind, ...rest });
      }
    });
  } else if (msg.type === 'snapshot') {
    if (App.state) applySnapshot(App.state, msg.snap);
  } else if (msg.type === 'terrain') {
    if (App.state) {
      if (msg.kind === 'explode') explodeAt(App.state.terrain, msg.x, msg.y, msg.r);
      else if (msg.kind === 'platform') addPlatform(App.state.terrain, msg.x, msg.y, msg.w, msg.h);
    }
  } else if (msg.type === 'lobby') {
    setLobbyPlayers(msg.players || []);
  } else if (msg.type === 'end') {
    showEndScreen(App.state);
  }
}

// Hook: menu host action triggers lobby.
// Wire it up *after* setupMenu by intercepting the host button (it already routed to setup; we replace).
document.addEventListener('click', (e) => {
  const btn = e.target.closest && e.target.closest('[data-action]');
  if (!btn) return;
  const a = btn.dataset.action;
  if (a === 'net-host') {
    // Show setup as before; the actual lobby creation happens when Start is pressed in host mode.
  }
});

// When Start is pressed in setup with mode 'host', open lobby first instead of starting immediately.
// We post-process by wrapping startGame in main; here we replace the onStart handler used by setupMenu.

// Patch path: re-register Start to detect host mode.
window.addEventListener('DOMContentLoaded', () => {
  const startBtn = document.querySelector('#screen-setup [data-action="start-game"]');
  if (!startBtn) return;
  // Wrap existing click handlers by stopPropagation.
  startBtn.addEventListener('click', async (e) => {
    const mode = document.getElementById('screen-setup').dataset.mode;
    if (mode === 'host') {
      e.stopImmediatePropagation();
      const cfg = readSetupFromDOM();
      cfg.mode = 'host';
      // Open host lobby; remember cfg for later.
      App._pendingHostCfg = cfg;
      await hostLobby(cfg);
    }
  }, true);
  const lobbyStartBtn = document.querySelector('#screen-lobby [data-action="lobby-start"]');
  if (lobbyStartBtn) {
    lobbyStartBtn.addEventListener('click', () => {
      const cfg = App._pendingHostCfg || readSetupFromDOM();
      cfg.mode = 'host';
      // Update playerCount: at least host + connected peers; pad with bots up to selected count.
      const total = cfg.playerCount || (1 + (App.net?.lobbyPlayers?.length || 0));
      const humans = 1 + (App.net?.lobbyPlayers?.length || 0);
      cfg.botCount = Math.max(0, total - humans);
      cfg.playerCount = humans + cfg.botCount;
      startGame(cfg);
    }, true);
  }
});

function readSetupFromDOM() {
  const playerCount = clamp(parseInt(document.getElementById('setup-players').value, 10) || 2, 2, 4);
  const botLevel = document.getElementById('setup-bot-level').value;
  const turnTime = clamp(parseInt(document.getElementById('setup-turn-time').value, 10) || 30, 10, 120);
  const roundLimitEnabled = document.getElementById('setup-round-limit').checked;
  const rounds = clamp(parseInt(document.getElementById('setup-rounds').value, 10) || 15, 3, 50);
  const map = document.getElementById('setup-map').value;
  const mode = document.getElementById('screen-setup').dataset.mode || 'single';
  return { mode, playerCount, botCount: 0, botLevel, turnTime, roundLimit: roundLimitEnabled ? rounds : null, map };
}

function clamp(v, mn, mx) { return Math.max(mn, Math.min(mx, v)); }
