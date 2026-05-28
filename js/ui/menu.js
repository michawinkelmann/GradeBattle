import { setLang, t, applyToDom } from '../i18n/i18n.js';
import { playSound } from '../game/sound.js';
import { showTutorial } from './tutorial.js';
import { renderPlayerSlots, refreshPlayerSlots, buildPlayerDefs } from './customizer.js';

const SCREEN_IDS = ['screen-menu', 'screen-setup', 'screen-lobby', 'screen-join', 'screen-game', 'screen-end'];

export function showScreen(id) {
  for (const s of SCREEN_IDS) {
    document.getElementById(s).classList.toggle('active', s === id);
  }
}

export function setupMenu({ onStart, onHostLobby, onJoinLobby, onStartLobby, onLeaveLobby, onRematch, onQuit, onResume }) {
  // Top-level menu buttons
  document.querySelectorAll('.menu-buttons [data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      playSound('click');
      const a = btn.dataset.action;
      if (a === 'single') openSetup('single');
      else if (a === 'hotseat') openSetup('hotseat');
      else if (a === 'net-host') openSetup('host');
      else if (a === 'net-join') showScreen('screen-join');
      else if (a === 'tutorial') showTutorial();
    });
  });

  document.querySelectorAll('.lang-btn').forEach(b => {
    b.addEventListener('click', async () => {
      await setLang(b.dataset.lang);
    });
  });

  // Setup screen actions
  document.querySelectorAll('#screen-setup [data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      playSound('click');
      const a = btn.dataset.action;
      if (a === 'back') showScreen('screen-menu');
      else if (a === 'start-game') {
        const cfg = readSetup();
        onStart && onStart(cfg);
      }
    });
  });

  // Join screen
  document.querySelectorAll('#screen-join [data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      playSound('click');
      const a = btn.dataset.action;
      if (a === 'back') showScreen('screen-menu');
      else if (a === 'join-confirm') {
        const code = document.getElementById('join-code').value.trim().toUpperCase();
        if (code) onJoinLobby && onJoinLobby(code);
      }
    });
  });

  // Lobby
  document.querySelectorAll('#screen-lobby [data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      playSound('click');
      const a = btn.dataset.action;
      if (a === 'lobby-leave') { onLeaveLobby && onLeaveLobby(); showScreen('screen-menu'); }
      else if (a === 'lobby-start') onStartLobby && onStartLobby();
    });
  });

  // End screen
  document.querySelectorAll('#screen-end [data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      playSound('click');
      const a = btn.dataset.action;
      if (a === 'rematch') onRematch && onRematch();
      else if (a === 'to-menu') { onQuit && onQuit(); showScreen('screen-menu'); }
    });
  });

  // Pause overlay
  document.querySelectorAll('#pause-overlay [data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      playSound('click');
      const a = btn.dataset.action;
      if (a === 'resume') onResume && onResume();
      else if (a === 'quit-game') { onQuit && onQuit(); showScreen('screen-menu'); }
    });
  });

  // Mode-tag for setup so we know what we are building.
  function openSetup(mode) {
    document.getElementById('screen-setup').dataset.mode = mode;
    const playerInput = document.getElementById('setup-players');
    renderPlayerSlots(parseInt(playerInput.value, 10) || 2);
    showScreen('screen-setup');
  }

  // Re-render slots when player count changes.
  document.getElementById('setup-players').addEventListener('input', (e) => {
    const n = clamp(parseInt(e.target.value, 10) || 2, 2, 4);
    renderPlayerSlots(n);
  });

  function readSetup() {
    const mode = document.getElementById('screen-setup').dataset.mode || 'single';
    const playerCount = clamp(parseInt(document.getElementById('setup-players').value, 10) || 2, 2, 4);
    const botLevel = document.getElementById('setup-bot-level').value;
    const turnTime = clamp(parseInt(document.getElementById('setup-turn-time').value, 10) || 30, 10, 120);
    const roundLimitEnabled = document.getElementById('setup-round-limit').checked;
    const rounds = clamp(parseInt(document.getElementById('setup-rounds').value, 10) || 15, 3, 50);
    const map = document.getElementById('setup-map').value;
    const playerDefs = buildPlayerDefs(playerCount, mode === 'single');
    const botCount = playerDefs.filter(d => d.isBot).length;
    return {
      mode,
      playerCount,
      botCount,
      botLevel,
      turnTime,
      roundLimit: roundLimitEnabled ? rounds : null,
      map,
      playerDefs
    };
  }
}

function clamp(v, mn, mx) { return Math.max(mn, Math.min(mx, v)); }

export function setLobbyCode(code) {
  document.getElementById('lobby-code').textContent = code;
}

export function setLobbyPlayers(players) {
  const ul = document.getElementById('lobby-players');
  ul.innerHTML = players.map(p => `<li>${escapeHtml(p.name)}${p.isHost ? ' (Host)' : ''}</li>`).join('');
}

export function showEndScreen(state) {
  const cont = document.getElementById('end-report');
  cont.innerHTML = '';
  // Sort by points desc.
  const players = [...state.players].sort((a, b) => (b.outOfGame ? 0 : b.points) - (a.outOfGame ? 0 : a.points));
  const winnerId = state.winner ? state.winner.id : null;
  for (const p of players) {
    const row = document.createElement('div');
    row.className = 'report-row' + (winnerId === p.id ? ' winner' : '');
    const finalGrade = p.outOfGame ? '6' : ((100 - p.points) / 100 * 5 + 1).toFixed(1);
    row.innerHTML = `<span>${escapeHtml(p.name)}</span><span>${t('grade.' + Math.round(parseFloat(finalGrade) || 1), '')} (${finalGrade})</span>`;
    cont.appendChild(row);
  }
  if (!state.winner) {
    const drawRow = document.createElement('div');
    drawRow.style.marginTop = '12px';
    drawRow.textContent = t('end.draw', 'Draw');
    cont.appendChild(drawRow);
  }
  showScreen('screen-end');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
