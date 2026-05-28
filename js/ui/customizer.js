// Per-player customization shown in the setup screen.
//
// Slot model:
//   { name: string, isBot: bool, variant: {shirt, hair, style, glasses} }
//
// Slots are persisted in localStorage so the next setup remembers what was picked.

import {
  SHIRT_OPTIONS, HAIR_OPTIONS, STYLE_OPTIONS,
  SHIRT_HEX, HAIR_HEX,
  DEFAULT_VARIANTS, makeVariant,
  drawCharacterPreview
} from '../game/characters.js';
import { t } from '../i18n/i18n.js';

const LS_KEY = 'gradebattle.charSlots';
const MAX_SLOTS = 4;

let cachedSlots = null;

function loadSlots() {
  if (cachedSlots) return cachedSlots;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) cachedSlots = JSON.parse(raw);
  } catch (_) {}
  if (!Array.isArray(cachedSlots)) cachedSlots = [];
  // Pad up to MAX_SLOTS from the defaults.
  while (cachedSlots.length < MAX_SLOTS) {
    const i = cachedSlots.length;
    cachedSlots.push({
      name: '',
      isBot: i >= 1,  // by default slot 0 is human, rest are bots
      variant: { ...DEFAULT_VARIANTS[i % DEFAULT_VARIANTS.length] }
    });
  }
  return cachedSlots;
}

function saveSlots() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(cachedSlots)); } catch (_) {}
}

// Read the canonical slot config (always 4 entries).
export function getSlots() { return loadSlots().slice(); }

// Build the array of player definitions for the engine, sliced to the chosen count.
export function buildPlayerDefs(count, modeIsSingle = false) {
  const slots = loadSlots();
  const defs = [];
  let botNum = 0;
  let humanNum = 0;
  for (let i = 0; i < count; i++) {
    const s = slots[i];
    const isBot = modeIsSingle && i > 0 ? true : !!s.isBot;
    let fallbackName;
    if (isBot) fallbackName = `Bot ${++botNum}`;
    else if (modeIsSingle && i === 0) fallbackName = 'Du';
    else fallbackName = `Spieler ${++humanNum}`;
    defs.push({
      name: s.name && s.name.trim() ? s.name.trim() : fallbackName,
      isBot,
      isLocal: true,
      variant: { ...s.variant }
    });
  }
  return defs;
}

function cycle(arr, current, dir) {
  const idx = arr.indexOf(current);
  const next = ((idx + dir) % arr.length + arr.length) % arr.length;
  return arr[next];
}

function renderPreview(canvas, variant) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // Sprite is 12x18; centre and leave 1px margin so overlays don't clip.
  drawCharacterPreview(ctx, variant, 0, 1);
}

function makeSlotEl(slot, index, onChange) {
  const el = document.createElement('div');
  el.className = 'char-slot';

  // Preview canvas (native sprite resolution, scaled via CSS).
  const cvs = document.createElement('canvas');
  cvs.width = 12; cvs.height = 18;
  el.appendChild(cvs);
  renderPreview(cvs, slot.variant);

  // Name input.
  const name = document.createElement('input');
  name.type = 'text';
  name.className = 'name-input';
  name.maxLength = 14;
  name.value = slot.name || (slot.isBot ? `Bot ${index + 1}` : (index === 0 ? 'Du' : `Spieler ${index + 1}`));
  name.placeholder = name.value;
  name.addEventListener('input', () => {
    slot.name = name.value;
    saveSlots();
    onChange && onChange();
  });
  el.appendChild(name);

  // Bot toggle.
  const botBtn = document.createElement('button');
  botBtn.type = 'button';
  botBtn.className = 'opt-toggle' + (slot.isBot ? ' on' : '');
  botBtn.textContent = slot.isBot ? t('setup.bot', 'Bot') : t('setup.human', 'Mensch');
  botBtn.title = t('setup.toggleBot', 'Bot/Mensch wechseln');
  botBtn.addEventListener('click', () => {
    slot.isBot = !slot.isBot;
    botBtn.classList.toggle('on', slot.isBot);
    botBtn.textContent = slot.isBot ? t('setup.bot', 'Bot') : t('setup.human', 'Mensch');
    saveSlots();
    onChange && onChange();
  });
  el.appendChild(botBtn);

  // Variant cycler: a <- shirtSwatch -> button group, similar for hair + style.
  function cyclerGroup(opts, currentKey, onPick, swatchHexLookup) {
    const grp = document.createElement('span');
    grp.className = 'opt-group';

    const prev = document.createElement('button');
    prev.type = 'button'; prev.className = 'opt-btn'; prev.textContent = '◀';
    prev.addEventListener('click', () => {
      const next = cycle(opts, slot.variant[currentKey], -1);
      slot.variant[currentKey] = next;
      slot.variant = makeVariant(slot.variant);
      saveSlots();
      renderPreview(cvs, slot.variant);
      if (swatchHexLookup) swatch.style.background = swatchHexLookup[slot.variant[currentKey]];
      onChange && onChange();
    });
    grp.appendChild(prev);

    let swatch = null;
    if (swatchHexLookup) {
      swatch = document.createElement('span');
      swatch.className = 'opt-btn';
      swatch.style.background = swatchHexLookup[slot.variant[currentKey]];
      swatch.style.minWidth = '20px';
      swatch.style.padding = '0';
      swatch.style.height = '20px';
      swatch.style.display = 'inline-block';
      grp.appendChild(swatch);
    } else {
      const lbl = document.createElement('span');
      lbl.className = 'opt-btn';
      lbl.textContent = t(`setup.style.${slot.variant.style}`, slot.variant.style);
      lbl.style.cursor = 'default';
      grp.appendChild(lbl);
      grp.dataset.styleLabel = '1';
    }

    const next = document.createElement('button');
    next.type = 'button'; next.className = 'opt-btn'; next.textContent = '▶';
    next.addEventListener('click', () => {
      const v = cycle(opts, slot.variant[currentKey], 1);
      slot.variant[currentKey] = v;
      slot.variant = makeVariant(slot.variant);
      saveSlots();
      renderPreview(cvs, slot.variant);
      if (swatchHexLookup) swatch.style.background = swatchHexLookup[slot.variant[currentKey]];
      else grp.querySelector('.opt-btn:nth-child(2)').textContent = t(`setup.style.${slot.variant.style}`, slot.variant.style);
      onChange && onChange();
    });
    grp.appendChild(next);

    return grp;
  }

  el.appendChild(cyclerGroup(SHIRT_OPTIONS, 'shirt', null, SHIRT_HEX));
  el.appendChild(cyclerGroup(HAIR_OPTIONS, 'hair', null, HAIR_HEX));
  el.appendChild(cyclerGroup(STYLE_OPTIONS, 'style'));

  // Glasses toggle.
  const glBtn = document.createElement('button');
  glBtn.type = 'button';
  glBtn.className = 'opt-toggle' + (slot.variant.glasses ? ' on' : '');
  glBtn.textContent = t('setup.glasses', 'Brille');
  glBtn.title = t('setup.glasses', 'Brille');
  glBtn.addEventListener('click', () => {
    slot.variant.glasses = !slot.variant.glasses;
    glBtn.classList.toggle('on', slot.variant.glasses);
    saveSlots();
    renderPreview(cvs, slot.variant);
    onChange && onChange();
  });
  el.appendChild(glBtn);

  return el;
}

let cachedListEl = null;

// Rebuild the slot list to match the selected player count.
// Called on setup-open and whenever the player-count input changes.
export function renderPlayerSlots(count) {
  const list = document.getElementById('setup-players-list');
  if (!list) return;
  cachedListEl = list;
  const slots = loadSlots();
  list.innerHTML = '';
  for (let i = 0; i < count; i++) {
    list.appendChild(makeSlotEl(slots[i], i, null));
  }
}

export function refreshPlayerSlots() {
  if (!cachedListEl) return;
  const count = cachedListEl.children.length;
  renderPlayerSlots(count);
}
