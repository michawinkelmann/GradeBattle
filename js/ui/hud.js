import { activePlayer } from '../game/state.js';
import { gradeOneDecimal, MAX_POINTS, gradeColor } from '../game/grades.js';
import { t } from '../i18n/i18n.js';
import { getActiveWeapon } from './controls.js';
import { WEAPONS } from '../game/weapons.js';
import { getWeaponIcon } from '../render/sprites.js';

export function setupHud() {
  const hud = {
    playersEl: document.getElementById('hud-players'),
    windArrow: document.getElementById('hud-wind-arrow'),
    windValue: document.getElementById('hud-wind-value'),
    timer: document.getElementById('hud-timer'),
    currentName: document.getElementById('hud-current-name'),
    weaponName: document.getElementById('hud-weapon-name'),
    btnWeapons: document.getElementById('btn-weapons'),
    btnMute: document.getElementById('hud-mute'),
    btnPause: document.getElementById('hud-pause'),
    weaponWheel: document.getElementById('weapon-wheel'),
    pauseOverlay: document.getElementById('pause-overlay'),
    // Cache of last-rendered values so we skip touching the DOM when nothing changed.
    _last: {}
  };
  return hud;
}

export function renderHud(hud, state) {
  const cur = activePlayer(state);
  if (!cur) return;
  const last = hud._last;

  // Player list (fingerprint over data points -> only rebuild HTML when something changed).
  const playerFp = state.players.map(p => `${p.id}:${p.outOfGame?'X':Math.round(p.points)}:${p.id===cur.id?1:0}`).join('|');
  if (playerFp !== last.playerFp) {
    hud.playersEl.innerHTML = state.players.map(p => {
      const t01 = p.outOfGame ? 0 : p.points / MAX_POINTS;
      const w = Math.max(0, Math.min(100, t01 * 100));
      const cls = (p.id === cur.id ? 'active' : '') + (p.outOfGame ? ' out' : '');
      return `<div class="hud-player ${cls}">
        <div class="name-row"><span>${escapeHtml(p.name)}</span><span>${p.outOfGame ? '6' : gradeOneDecimal(p.points)}</span></div>
        <div class="grade-bar-bg"><div class="grade-bar-fg" style="width:${w}%;background:${gradeColor(p.points)};"></div></div>
      </div>`;
    }).join('');
    last.playerFp = playerFp;
  }

  // Wind
  const w = state.wind;
  const arrow = w > 0.05 ? '→' : w < -0.05 ? '←' : '·';
  const windVal = (Math.abs(w) * 10).toFixed(1);
  if (last.windArrow !== arrow) { hud.windArrow.textContent = arrow; last.windArrow = arrow; }
  if (last.windVal !== windVal) { hud.windValue.textContent = windVal; last.windVal = windVal; }

  // Timer (whole-second granularity)
  const tsec = Math.max(0, Math.ceil(state.turnTimer || 0));
  if (last.tsec !== tsec) {
    hud.timer.textContent = tsec;
    hud.timer.style.color = tsec < 5 ? '#ef5b5b' : '';
    last.tsec = tsec;
  }

  // Current
  if (last.curName !== cur.name) { hud.currentName.textContent = cur.name; last.curName = cur.name; }
  const wp = getActiveWeapon(cur);
  const weaponLabel = wp ? t(`weapon.${wp.id}.name`, wp.id) : '';
  if (last.weaponLabel !== weaponLabel) { hud.weaponName.textContent = weaponLabel; last.weaponLabel = weaponLabel; }
}

// Force the next renderHud call to update every field (e.g. after a language change).
export function invalidateHud(hud) { hud._last = {}; }

export function openWeaponWheel(hud, state, onPick) {
  const cur = activePlayer(state);
  if (!cur) return;
  hud.weaponWheel.innerHTML = '';
  for (let i = 0; i < WEAPONS.length; i++) {
    const w = WEAPONS[i];
    const item = document.createElement('div');
    item.className = 'weapon-item' + (i === cur.selectedWeaponIdx ? ' selected' : '');
    const c = document.createElement('canvas');
    c.width = 24; c.height = 24;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const icon = getWeaponIcon(w.id);
    ctx.drawImage(icon, 0, 0);
    const label = document.createElement('div');
    label.textContent = t(`weapon.${w.id}.name`, w.id);
    item.appendChild(c);
    item.appendChild(label);
    item.addEventListener('click', (e) => { e.stopPropagation(); onPick(i); });
    hud.weaponWheel.appendChild(item);
  }
  // Tap on the backdrop (not on an item) closes the wheel without picking.
  hud.weaponWheel.onclick = (e) => {
    if (e.target === hud.weaponWheel) closeWeaponWheel(hud);
  };
  hud.weaponWheel.classList.remove('hidden');
}

export function closeWeaponWheel(hud) {
  hud.weaponWheel.classList.add('hidden');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
