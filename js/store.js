// Все данные живут только в localStorage этого устройства.
// Формат версионирован (schema), чтобы старые данные переживали обновления.

import { isValidKey, todayKey } from './dates.js';

const KEY = 'cyclePartner';
export const SCHEMA = 1;

export const DEFAULT_MOODS = [
  ['calm', 'спокойная'],
  ['kind', 'добрая'],
  ['cheerful', 'весёлая'],
  ['playful', 'игривая'],
  ['tired', 'уставшая'],
  ['irritated', 'раздражённая'],
  ['angry', 'злая'],
  ['sad', 'грустная'],
  ['quiet', 'хочет тишины'],
  ['hugs', 'хочет обниматься'],
].map(([id, label]) => ({ id, label, hidden: false }));

function fresh() {
  return {
    schema: SCHEMA,
    createdAt: todayKey(),
    settings: {
      cycleLength: 28,
      periodLength: 5,
      reminderHour: 20,
      lastExportAt: null,
    },
    starts: [],
    entries: {}, // 'YYYY-MM-DD' -> { moods: [id], note: '' }
    moods: DEFAULT_MOODS.map((m) => ({ ...m })),
  };
}

// Приводит любые входные данные (старые версии, импорт) к текущей схеме.
export function migrate(raw) {
  const base = fresh();
  if (!raw || typeof raw !== 'object') return base;
  const s = { ...base, settings: { ...base.settings } };
  if (isValidKey(raw.createdAt)) s.createdAt = raw.createdAt;
  for (const k of Object.keys(base.settings)) {
    if (raw.settings && k in raw.settings) s.settings[k] = raw.settings[k];
  }
  if (s.settings.lastExportAt !== null && !isValidKey(s.settings.lastExportAt)) s.settings.lastExportAt = null;
  for (const [k, lo, hi] of [['cycleLength', 18, 60], ['periodLength', 2, 10], ['reminderHour', 0, 23]]) {
    const n = Number(s.settings[k]);
    s.settings[k] = Number.isInteger(n) && n >= lo && n <= hi ? n : base.settings[k];
  }
  s.starts = Array.isArray(raw.starts) ? [...new Set(raw.starts.filter(isValidKey))].sort() : [];
  s.entries = {};
  for (const [k, v] of Object.entries(raw.entries || {})) {
    if (!isValidKey(k) || !v) continue;
    const moods = Array.isArray(v.moods) ? v.moods.filter((m) => typeof m === 'string') : [];
    const note = typeof v.note === 'string' ? v.note.slice(0, 500) : '';
    if (moods.length || note) s.entries[k] = { moods, note };
  }
  s.moods = Array.isArray(raw.moods) && raw.moods.length
    ? raw.moods.filter((m) => m && m.id && m.label).map((m) => ({ id: String(m.id), label: String(m.label), hidden: !!m.hidden }))
    : base.moods;
  s.schema = SCHEMA;
  return s;
}

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return migrate(raw ? JSON.parse(raw) : null);
  } catch {
    return fresh();
  }
}

const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); }

export function get() { return state; }

export function update(mutator) {
  mutator(state);
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    alert('Не удалось сохранить данные: ' + e.message);
  }
  listeners.forEach((fn) => fn(state));
}

export function replaceAll(raw) {
  update((s) => {
    const next = migrate(raw);
    Object.keys(s).forEach((k) => delete s[k]);
    Object.assign(s, next);
  });
}

export function resetAll() {
  replaceAll(null);
}

// ---- удобные операции ----

export function addStart(date) {
  update((s) => {
    if (!s.starts.includes(date)) s.starts = [...s.starts, date].sort();
  });
}

export function removeStart(date) {
  update((s) => { s.starts = s.starts.filter((d) => d !== date); });
}

export function toggleMood(date, id) {
  update((s) => {
    const e = s.entries[date] || { moods: [], note: '' };
    e.moods = e.moods.includes(id) ? e.moods.filter((m) => m !== id) : [...e.moods, id];
    setEntry(s, date, e);
  });
}

export function setNote(date, note) {
  update((s) => {
    const e = s.entries[date] || { moods: [], note: '' };
    e.note = note.trim().slice(0, 500);
    setEntry(s, date, e);
  });
}

function setEntry(s, date, e) {
  if (e.moods.length || e.note) s.entries[date] = e;
  else delete s.entries[date];
}

export function moodLabel(id) {
  return state.moods.find((m) => m.id === id)?.label ?? id;
}

// Просим браузер не вычищать хранилище (на iOS помогает для установленной PWA).
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch { /* не критично */ }
}
