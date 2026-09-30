// Даты храним как строки 'YYYY-MM-DD' в локальном времени,
// а считаем через номер дня (UTC-полночь), чтобы не ловить сдвиги часовых поясов и перевода часов.

const DAY_MS = 86400000;

export function toDayNum(key) {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function fromDayNum(n) {
  const dt = new Date(n * DAY_MS);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayKey(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(key, n) {
  return fromDayNum(toDayNum(key) + n);
}

export function diffDays(a, b) {
  return toDayNum(a) - toDayNum(b);
}

export function isValidKey(key) {
  return typeof key === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(key) && fromDayNum(toDayNum(key)) === key;
}

// Понедельник = 0
export function weekdayMon(key) {
  return (new Date(toDayNum(key) * DAY_MS).getUTCDay() + 6) % 7;
}
