import { activePlayer } from '../game/state.js';
import { gradeOneDecimal, MAX_POINTS, gradeColor } from '../game/grades.js';
import { t } from '../i18n/i18n.js';
import { getActiveWeapon } from './controls.js';
import { WEAPONS, ARCHETYPE_META, weaponUsage } from '../game/weapons.js';
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
  // Weapon name + its type badge so the player sees the kind without opening the wheel.
  const weaponLabel = wp ? t(`weapon.${wp.id}.name`, wp.id) : '';
  if (last.weaponLabel !== weaponLabel) {
    const meta = wp ? ARCHETYPE_META[wp.archetype] : null;
    const catLabel = meta ? t(`weaponcat.${meta.key}`, meta.key) : '';
    hud.weaponName.innerHTML = meta
      ? `<span class="wtype-badge" style="background:${meta.color}">${escapeHtml(catLabel)}</span>${escapeHtml(weaponLabel)}`
      : escapeHtml(weaponLabel);
    last.weaponLabel = weaponLabel;
  }
}

// Force the next renderHud call to update every field (e.g. after a language change).
export function invalidateHud(hud) { hud._last = {}; }

// Weapons grouped by how you use them; this is the primary, least-confusing
// way to chunk the 21-item roster.
const USAGE_ORDER = ['aim', 'place', 'instant'];

export function openWeaponWheel(hud, state, onPick) {
  const cur = activePlayer(state);
  if (!cur) return;
  const wheel = hud.weaponWheel;
  wheel.innerHTML = '';

  // Header / title bar.
  const header = document.createElement('div');
  header.className = 'wheel-header';
  header.innerHTML = `<span>${escapeHtml(t('hud.weapons', 'Waffen'))}</span>`;
  const closeBtn = document.createElement('button');
  closeBtn.className = 'wheel-close';
  closeBtn.textContent = '✕';
  closeBtn.setAttribute('aria-label', t('ui.cancel', 'Cancel'));
  closeBtn.addEventListener('click', (e) => { e.stopPropagation(); closeWeaponWheel(hud); });
  header.appendChild(closeBtn);
  wheel.appendChild(header);

  const scroll = document.createElement('div');
  scroll.className = 'wheel-scroll';
  wheel.appendChild(scroll);

  // Bucket weapon indices by usage mode.
  const buckets = { aim: [], place: [], instant: [] };
  for (let i = 0; i < WEAPONS.length; i++) {
    buckets[weaponUsage(WEAPONS[i])].push(i);
  }

  for (const usage of USAGE_ORDER) {
    const idxs = buckets[usage];
    if (!idxs.length) continue;
    const section = document.createElement('div');
    section.className = 'wheel-section';
    const h = document.createElement('div');
    h.className = 'wheel-section-title';
    h.innerHTML = `<span class="wheel-section-icon">${USAGE_ICON[usage]}</span>${escapeHtml(t(`weaponuse.${usage}`, usage))}`;
    section.appendChild(h);

    const grid = document.createElement('div');
    grid.className = 'wheel-grid';
    for (const i of idxs) {
      grid.appendChild(makeWeaponCard(WEAPONS[i], i, i === cur.selectedWeaponIdx, onPick));
    }
    section.appendChild(grid);
    scroll.appendChild(section);
  }

  // Tap on the backdrop (not on a card) closes the wheel without picking.
  wheel.onclick = (e) => { if (e.target === wheel || e.target === scroll) closeWeaponWheel(hud); };
  wheel.classList.remove('hidden');

  // Scroll the selected card into view.
  const sel = wheel.querySelector('.weapon-item.selected');
  if (sel) sel.scrollIntoView({ block: 'center' });
}

const USAGE_ICON = { aim: '🎯', place: '📍', instant: '⚡' };

function makeWeaponCard(w, index, selected, onPick) {
  const meta = ARCHETYPE_META[w.archetype] || ARCHETYPE_META.utility;
  const item = document.createElement('div');
  item.className = 'weapon-item' + (selected ? ' selected' : '');

  const top = document.createElement('div');
  top.className = 'wi-top';
  const c = document.createElement('canvas');
  c.width = 24; c.height = 24;
  c.className = 'wi-icon';
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(getWeaponIcon(w.id), 0, 0);
  top.appendChild(c);

  const badge = document.createElement('span');
  badge.className = 'wi-badge';
  badge.style.background = meta.color;
  badge.textContent = t(`weaponcat.${meta.key}`, meta.key);
  top.appendChild(badge);
  item.appendChild(top);

  const name = document.createElement('div');
  name.className = 'wi-name';
  name.textContent = t(`weapon.${w.id}.name`, w.id);
  item.appendChild(name);

  const stats = document.createElement('div');
  stats.className = 'wi-stats';
  stats.innerHTML = weaponStatsHtml(w);
  item.appendChild(stats);

  item.addEventListener('click', (e) => { e.stopPropagation(); onPick(index); });
  return item;
}

// Compact stat line: damage + radius bars for offensive weapons, else the
// localized short description so the player knows what a utility does.
function weaponStatsHtml(w) {
  if (w.damage && w.damage > 0) {
    const dmg = w.salvoCount ? `${w.damage}×${w.salvoCount}` : `${w.damage}`;
    const dmgBar = statBar(Math.min(1, w.damage / 40), '#ef5b5b');
    const radBar = statBar(Math.min(1, (w.radius || 0) / 80), '#4ad6ff');
    return `<span class="wi-stat"><b>${escapeHtml(t('weaponstat.dmg', 'Schaden'))}</b> ${dmg}${dmgBar}</span>`
      + `<span class="wi-stat"><b>${escapeHtml(t('weaponstat.rad', 'Radius'))}</b> ${w.radius || 0}${radBar}</span>`;
  }
  // Utility / no-damage: show the short description.
  return `<span class="wi-desc">${escapeHtml(t(`weapon.${w.id}.desc`, ''))}</span>`;
}

function statBar(frac, color) {
  const pct = Math.round(Math.max(0, Math.min(1, frac)) * 100);
  return `<span class="wi-bar"><span class="wi-bar-fill" style="width:${pct}%;background:${color}"></span></span>`;
}

export function closeWeaponWheel(hud) {
  hud.weaponWheel.classList.add('hidden');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
