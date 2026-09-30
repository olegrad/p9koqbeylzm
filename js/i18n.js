// Строки интерфейса лежат в i18n/<lang>.json, код их только подставляет.

let dict = {};

export async function loadI18n(lang = 'ru') {
  const res = await fetch(`i18n/${lang}.json`);
  dict = await res.json();
}

export function t(key, vars = {}) {
  const val = key.split('.').reduce((o, k) => (o == null ? o : o[k]), dict);
  if (typeof val !== 'string') return val ?? key;
  return val.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
}

// Русские формы множественного числа: [1, 2–4, 5+]
export function plural(n, formsKey) {
  const forms = t(formsKey);
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

export function locale() {
  return dict.locale || 'ru-RU';
}
