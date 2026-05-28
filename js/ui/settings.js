// Settings screen: volume slider + mute + reduced-motion + tutorial replay + reset.

import { setMuted, isMuted, setVolume, getVolume, playSound } from '../game/sound.js';
import { getBool, setBool } from './prefs.js';
import { showTutorial } from './tutorial.js';
import { showScreen } from './menu.js';
import { t } from '../i18n/i18n.js';

let onMuteChangedExternal = null;

export function setOnMuteChanged(fn) { onMuteChangedExternal = fn; }

function refreshFromState() {
  const volEl = document.getElementById('setting-volume');
  const volVal = document.getElementById('setting-volume-val');
  const muteEl = document.getElementById('setting-mute');
  const rmEl = document.getElementById('setting-reduced-motion');
  if (!volEl) return;
  const v = Math.round(getVolume() * 100);
  volEl.value = String(v);
  volVal.textContent = v + '%';
  muteEl.checked = isMuted();
  rmEl.checked = getBool('reducedMotion', false);
}

export function bindSettingsControls() {
  const volEl = document.getElementById('setting-volume');
  const volVal = document.getElementById('setting-volume-val');
  const muteEl = document.getElementById('setting-mute');
  const rmEl = document.getElementById('setting-reduced-motion');

  volEl.addEventListener('input', () => {
    const v = (parseInt(volEl.value, 10) || 0) / 100;
    setVolume(v);
    volVal.textContent = volEl.value + '%';
  });
  // Audible preview after the user lets go.
  volEl.addEventListener('change', () => playSound('click'));

  muteEl.addEventListener('change', () => {
    setMuted(muteEl.checked);
    if (onMuteChangedExternal) onMuteChangedExternal();
    if (!muteEl.checked) playSound('click');
  });

  rmEl.addEventListener('change', () => setBool('reducedMotion', rmEl.checked));

  document.querySelectorAll('#screen-settings [data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const a = btn.dataset.action;
      if (a === 'back') { playSound('click'); showScreen('screen-menu'); }
      else if (a === 'settings-tutorial') { playSound('click'); showTutorial(); }
      else if (a === 'settings-reset') {
        if (!confirm(t('settings.confirmReset', 'Reset all settings?'))) return;
        // Wipe everything the app stores.
        for (const k of Object.keys(localStorage)) {
          if (k.startsWith('gradebattle.')) localStorage.removeItem(k);
        }
        // Re-read defaults and reapply runtime state.
        setMuted(false);
        setVolume(0.5);
        if (onMuteChangedExternal) onMuteChangedExternal();
        refreshFromState();
        playSound('click');
      }
    });
  });
}

export function openSettings() {
  refreshFromState();
  showScreen('screen-settings');
}
