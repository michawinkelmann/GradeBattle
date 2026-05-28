// Lightweight 4-step tutorial overlay shown on first launch and via the menu button.

import { t } from '../i18n/i18n.js';
import { playSound } from '../game/sound.js';

const SEEN_KEY = 'gradebattle.tutorialSeen';
const PAGE_COUNT = 4;

let currentPage = 0;
let onClose = null;

function setPage(i) {
  currentPage = Math.max(0, Math.min(PAGE_COUNT - 1, i));
  document.querySelectorAll('#tutorial-overlay .tutorial-page').forEach(el => {
    el.classList.toggle('active', parseInt(el.dataset.page, 10) === currentPage);
  });
  document.querySelectorAll('#tutorial-overlay .tutorial-dots .dot').forEach((el, idx) => {
    el.classList.toggle('active', idx === currentPage);
  });
  const prev = document.querySelector('[data-action="tutorial-prev"]');
  const next = document.querySelector('[data-action="tutorial-next"]');
  if (prev) prev.disabled = currentPage === 0;
  if (next) next.textContent = currentPage === PAGE_COUNT - 1
    ? t('tutorial.done', "Let's go!")
    : t('tutorial.next', 'Next');
}

export function showTutorial(closedBy) {
  onClose = closedBy || null;
  currentPage = 0;
  setPage(0);
  document.getElementById('tutorial-overlay').classList.remove('hidden');
}

export function hideTutorial() {
  document.getElementById('tutorial-overlay').classList.add('hidden');
  localStorage.setItem(SEEN_KEY, '1');
  if (onClose) { onClose(); onClose = null; }
}

export function hasSeenTutorial() {
  return localStorage.getItem(SEEN_KEY) === '1';
}

export function bindTutorialControls() {
  document.querySelectorAll('#tutorial-overlay [data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      playSound('click');
      const a = btn.dataset.action;
      if (a === 'tutorial-prev') setPage(currentPage - 1);
      else if (a === 'tutorial-next') {
        if (currentPage === PAGE_COUNT - 1) hideTutorial();
        else setPage(currentPage + 1);
      } else if (a === 'tutorial-close') hideTutorial();
    });
  });
}
