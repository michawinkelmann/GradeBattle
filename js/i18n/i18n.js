const LS_KEY = 'gradebattle.lang';
const FALLBACK = 'de';
const SUPPORTED = ['de', 'en', 'uk'];

let dictionaries = {};
let current = FALLBACK;
const listeners = new Set();

export async function initI18n() {
  const stored = localStorage.getItem(LS_KEY);
  if (stored && SUPPORTED.includes(stored)) current = stored;
  await loadLang(current);
  applyToDom();
}

async function loadLang(lang) {
  if (dictionaries[lang]) return;
  const res = await fetch(`./js/i18n/${lang}.json`);
  if (!res.ok) throw new Error(`i18n load failed: ${lang}`);
  dictionaries[lang] = await res.json();
}

export async function setLang(lang) {
  if (!SUPPORTED.includes(lang)) return;
  await loadLang(lang);
  current = lang;
  localStorage.setItem(LS_KEY, lang);
  applyToDom();
  listeners.forEach(fn => fn(lang));
}

export function getLang() { return current; }

export function t(key, fallback) {
  const dict = dictionaries[current] || {};
  if (dict[key] != null) return dict[key];
  const fb = dictionaries[FALLBACK] || {};
  if (fb[key] != null) return fb[key];
  return fallback != null ? fallback : key;
}

export function onLangChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function applyToDom(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const val = t(key, el.textContent);
    el.textContent = val;
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    el.placeholder = t(key, el.placeholder);
  });
  root.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    el.title = t(key, el.title);
  });
  document.documentElement.lang = current;
  document.querySelectorAll('.lang-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.lang === current);
  });
}
