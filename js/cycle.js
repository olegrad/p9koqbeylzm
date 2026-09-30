// Расчёт фаз. Модель простая и честная: лютеиновая фаза в среднем ≈ 12–13 дней
// (Bull et al., 2019: 12,4 дня по 600 тыс. циклов), поэтому овуляция ≈ длина цикла − 13.
// У реальных людей это плавает на несколько дней, поэтому прогнозы в интерфейсе подаются как «примерно».

import { toDayNum, fromDayNum, todayKey } from './dates.js';

export const PHASES = ['menstrual', 'follicular', 'ovulation', 'luteal'];

// Интервалы короче/длиннее этого считаем ошибкой ввода и не учитываем в средней.
const MIN_CYCLE = 18;
const MAX_CYCLE = 60;
const LEARN_WINDOW = 6; // сколько последних циклов усредняем
const LUTEAL_DAYS = 13;
const PMS_DAYS = 6; // последние дни цикла, когда чаще бывают предменструальные симптомы

export function sortedStarts(starts) {
  return [...new Set(starts)].sort();
}

// Длины завершённых циклов по фактическим датам начала.
export function actualLengths(starts) {
  const s = sortedStarts(starts);
  const out = [];
  for (let i = 1; i < s.length; i++) {
    const len = toDayNum(s[i]) - toDayNum(s[i - 1]);
    out.push({ start: s[i - 1], length: len, valid: len >= MIN_CYCLE && len <= MAX_CYCLE });
  }
  return out;
}

// Длина, по которой прогнозируем: средняя по последним реальным циклам, иначе из настроек.
export function effectiveLength(starts, fallback) {
  const valid = actualLengths(starts).filter((c) => c.valid).slice(-LEARN_WINDOW);
  if (!valid.length) return { length: fallback, learned: false, count: 0 };
  const mean = valid.reduce((a, c) => a + c.length, 0) / valid.length;
  return { length: Math.round(mean), learned: true, count: valid.length };
}

export function phaseForDay(day, length, periodLength) {
  const ov = ovulationDay(length, periodLength);
  let phase;
  if (day <= periodLength) phase = 'menstrual';
  else if (day < ov - 1) phase = 'follicular';
  else if (day <= ov + 1) phase = 'ovulation';
  else phase = 'luteal';
  const pms = phase === 'luteal' && day > length - PMS_DAYS;
  return { phase, pms, ovulationDay: ov };
}

export function ovulationDay(length, periodLength) {
  return Math.max(length - LUTEAL_DAYS, periodLength + 2);
}

// Главная функция: информация о любом дне.
// state: { starts, settings: { cycleLength, periodLength } }
// Возвращает null, если день раньше первой отмеченной даты или отметок нет.
export function cycleInfo(dateKey, state, today = todayKey()) {
  const starts = sortedStarts(state.starts);
  if (!starts.length) return null;
  const D = toDayNum(dateKey);
  const periodLength = state.settings.periodLength;
  const { length: L } = effectiveLength(starts, state.settings.cycleLength);

  // последняя отмеченная дата начала не позже D
  let idx = -1;
  for (let i = starts.length - 1; i >= 0; i--) {
    if (toDayNum(starts[i]) <= D) { idx = i; break; }
  }
  if (idx === -1) return null;
  const s = toDayNum(starts[idx]);

  // Прошлый, уже завершённый цикл: длина известна точно.
  if (idx < starts.length - 1) {
    const len = toDayNum(starts[idx + 1]) - s;
    const day = D - s + 1;
    return build(day, len, fromDayNum(s), false, 0, periodLength);
  }

  // Текущий цикл и прогноз. Если ожидаемая дата уже прошла без отметки,
  // следующий цикл прогнозируем не раньше завтрашнего дня.
  const T = toDayNum(today);
  const nextStart = Math.max(s + L, T + 1);
  if (D < nextStart) {
    const day = D - s + 1;
    const overdue = Math.max(0, day - L);
    return build(day, L, fromDayNum(s), false, overdue, periodLength);
  }
  const k = Math.floor((D - nextStart) / L);
  const cs = nextStart + k * L;
  return build(D - cs + 1, L, fromDayNum(cs), true, 0, periodLength);
}

function build(day, length, cycleStart, predicted, overdue, periodLength) {
  const effDay = Math.min(day, length);
  const p = phaseForDay(effDay, length, periodLength);
  return {
    day,
    length,
    cycleStart,
    predicted,
    overdue,
    phase: p.phase,
    pms: p.pms || overdue > 0,
    ovulationDay: p.ovulationDay,
  };
}

// Ближайшие события относительно today.
export function upcoming(state, today = todayKey(), cycles = 6) {
  const info = cycleInfo(today, state, today);
  if (!info) return null;
  const L = info.length;
  const pl = state.settings.periodLength;
  const T = toDayNum(today);
  const cs = toDayNum(info.cycleStart);

  const nextStarts = [];
  let first = Math.max(cs + L, T + 1);
  for (let k = 0; k < cycles; k++) nextStarts.push(fromDayNum(first + k * L));

  const ov = ovulationDay(L, pl);
  const events = [];
  const ovNum = cs + ov - 1;
  if (ovNum >= T) events.push({ type: 'ovulation', date: fromDayNum(ovNum), inDays: ovNum - T });
  else events.push({ type: 'ovulation', date: fromDayNum(first + ov - 1), inDays: first + ov - 1 - T });
  const pmsNum = cs + L - PMS_DAYS;
  if (pmsNum >= T) events.push({ type: 'pms', date: fromDayNum(pmsNum), inDays: pmsNum - T });
  else if (!info.pms) events.push({ type: 'pms', date: fromDayNum(first + L - PMS_DAYS), inDays: first + L - PMS_DAYS - T });
  events.push({ type: 'period', date: nextStarts[0], inDays: toDayNum(nextStarts[0]) - T });
  events.sort((a, b) => a.inDays - b.inDays);

  return { info, events, nextStarts };
}

// Сводка по отметкам: какие состояния в какой фазе и в какие дни отмечались.
// Считаем только по завершённым циклам (там фазы известны точнее).
export function insights(state) {
  const starts = sortedStarts(state.starts);
  const cycles = actualLengths(starts).filter((c) => c.valid);
  const byPhase = Object.fromEntries(PHASES.map((p) => [p, { entries: 0, moods: {} }]));
  const byMood = {};
  let counted = 0;
  const firstDone = starts[0];
  const lastDone = starts[starts.length - 1];

  for (const [date, entry] of Object.entries(state.entries)) {
    if (!entry.moods?.length) continue;
    if (!firstDone || date < firstDone || date >= lastDone) continue;
    const info = cycleInfo(date, state);
    if (!info) continue;
    counted++;
    const bucket = byPhase[info.phase];
    bucket.entries++;
    for (const m of entry.moods) {
      bucket.moods[m] = (bucket.moods[m] || 0) + 1;
      (byMood[m] ||= []).push(info.day);
    }
  }

  const lengths = cycles.map((c) => c.length);
  return {
    completedCycles: cycles.length,
    entriesCounted: counted,
    byPhase,
    byMood,
    lengthStats: lengths.length
      ? { min: Math.min(...lengths), max: Math.max(...lengths), avg: Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length) }
      : null,
  };
}
