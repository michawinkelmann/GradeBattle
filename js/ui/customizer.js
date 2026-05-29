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
  cvs.className = 'char-preview';
  el.appendChild(cvs);
  renderPreview(cvs, slot.variant);

  // Body holds two rows: identity (name + human/bot) and appearance controls.
  const body = document.createElement('div');
  body.className = 'char-slot-body';
  el.appendChild(body);

  const row1 = document.createElement('div');
  row1.className = 'cs-row cs-row-id';
  body.appendChild(row1);

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
  row1.appendChild(name);

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
  row1.appendChild(botBtn);

  const row2 = document.createElement('div');
  row2.className = 'cs-row cs-row-look';
  body.appendChild(row2);

  // A labelled cycler: caption above a [◀ value ▶] control. `swatchHexLookup`
  // renders the current value as a colour swatch; otherwise as a text label.
  function cyclerGroup(caption, opts, currentKey, swatchHexLookup) {
    const wrap = document.createElement('div');
    wrap.className = 'cs-cycler';

    const cap = document.createElement('div');
    cap.className = 'cs-cap';
    cap.textContent = caption;
    wrap.appendChild(cap);

    const grp = document.createElement('div');
    grp.className = 'opt-group';
    wrap.appendChild(grp);

    const prev = document.createElement('button');
    prev.type = 'button'; prev.className = 'opt-btn'; prev.textContent = '◀';
    grp.appendChild(prev);

    let valueEl;
    if (swatchHexLookup) {
      valueEl = document.createElement('span');
      valueEl.className = 'opt-swatch';
      valueEl.style.background = swatchHexLookup[slot.variant[currentKey]];
    } else {
      valueEl = document.createElement('span');
      valueEl.className = 'opt-value';
      valueEl.textContent = t(`setup.style.${slot.variant.style}`, slot.variant.style);
    }
    grp.appendChild(valueEl);

    const next = document.createElement('button');
    next.type = 'button'; next.className = 'opt-btn'; next.textContent = '▶';
    grp.appendChild(next);

    function apply(dir) {
      slot.variant[currentKey] = cycle(opts, slot.variant[currentKey], dir);
      slot.variant = makeVariant(slot.variant);
      saveSlots();
      renderPreview(cvs, slot.variant);
      if (swatchHexLookup) valueEl.style.background = swatchHexLookup[slot.variant[currentKey]];
      else valueEl.textContent = t(`setup.style.${slot.variant.style}`, slot.variant.style);
      onChange && onChange();
    }
    prev.addEventListener('click', () => apply(-1));
    next.addEventListener('click', () => apply(1));
    return wrap;
  }

  row2.appendChild(cyclerGroup(t('setup.shirt', 'Shirt'), SHIRT_OPTIONS, 'shirt', SHIRT_HEX));
  row2.appendChild(cyclerGroup(t('setup.hair', 'Haare'), HAIR_OPTIONS, 'hair', HAIR_HEX));
  row2.appendChild(cyclerGroup(t('setup.styleLabel', 'Stil'), STYLE_OPTIONS, 'style'));

  // Glasses toggle (its own labelled cell so it lines up with the cyclers).
  const glWrap = document.createElement('div');
  glWrap.className = 'cs-cycler';
  const glCap = document.createElement('div');
  glCap.className = 'cs-cap';
  glCap.textContent = t('setup.glasses', 'Brille');
  glWrap.appendChild(glCap);
  const glBtn = document.createElement('button');
  glBtn.type = 'button';
  glBtn.className = 'opt-toggle gl-toggle' + (slot.variant.glasses ? ' on' : '');
  glBtn.textContent = slot.variant.glasses ? t('setup.on', 'An') : t('setup.off', 'Aus');
  glBtn.addEventListener('click', () => {
    slot.variant.glasses = !slot.variant.glasses;
    glBtn.classList.toggle('on', slot.variant.glasses);
    glBtn.textContent = slot.variant.glasses ? t('setup.on', 'An') : t('setup.off', 'Aus');
    saveSlots();
    renderPreview(cvs, slot.variant);
    onChange && onChange();
  });
  glWrap.appendChild(glBtn);
  row2.appendChild(glWrap);

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
