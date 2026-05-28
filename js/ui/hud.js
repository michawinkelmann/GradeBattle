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
  };
  return hud;
}

export function renderHud(hud, state) {
  const cur = activePlayer(state);
  if (!cur) return;

  // Player list
  const html = state.players.map(p => {
    const t01 = p.outOfGame ? 0 : p.points / MAX_POINTS;
    const w = Math.max(0, Math.min(100, t01 * 100));
    const cls = (p.id === cur.id ? 'active' : '') + (p.outOfGame ? ' out' : '');
    return `<div class="hud-player ${cls}">
      <div class="name-row"><span>${escapeHtml(p.name)}</span><span>${p.outOfGame ? '6' : gradeOneDecimal(p.points)}</span></div>
      <div class="grade-bar-bg"><div class="grade-bar-fg" style="width:${w}%;background:${gradeColor(p.points)};"></div></div>
    </div>`;
  }).join('');
  if (hud.playersEl.innerHTML !== html) hud.playersEl.innerHTML = html;

  // Wind
  const w = state.wind;
  const arrow = w > 0.05 ? '→' : w < -0.05 ? '←' : '·';
  hud.windArrow.textContent = arrow;
  hud.windValue.textContent = (Math.abs(w) * 10).toFixed(1);

  // Timer
  hud.timer.textContent = Math.max(0, Math.ceil(state.turnTimer || 0));
  hud.timer.style.color = (state.turnTimer || 0) < 5 ? '#ef5b5b' : '';

  // Current
  hud.currentName.textContent = cur.name;
  const wp = getActiveWeapon(cur);
  hud.weaponName.textContent = wp ? t(`weapon.${wp.id}.name`, wp.id) : '';
}

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
    item.addEventListener('click', () => onPick(i));
    hud.weaponWheel.appendChild(item);
  }
  hud.weaponWheel.classList.remove('hidden');
}

export function closeWeaponWheel(hud) {
  hud.weaponWheel.classList.add('hidden');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
