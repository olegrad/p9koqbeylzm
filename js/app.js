import * as store from './store.js';
import { cycleInfo, upcoming, effectiveLength, insights, PHASES } from './cycle.js';
import { todayKey, toDayNum, weekdayMon, isValidKey, diffDays } from './dates.js';
import { loadI18n, t, plural, locale } from './i18n.js';
import { VERSION } from './version.js';
import { pushCheck } from './push-check.js';

const $view = document.getElementById('view');
const $sheet = document.getElementById('sheet');
const $sheetBody = document.getElementById('sheet-body');

let content = null; // content/ru/phases.json
let calMonth = todayKey().slice(0, 7); // 'YYYY-MM'
let phaseExpanded = false;
let sheetMode = null; // { type: 'day', date } | { type: 'pms' }
let pushResult = null; // null | 'running' | [[название, ok, подробность]]

// ---------- утилиты ----------

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function fmtDate(key, opts = { day: 'numeric', month: 'long' }) {
  return new Intl.DateTimeFormat(locale(), { ...opts, timeZone: 'UTC' }).format(new Date(toDayNum(key) * 86400000));
}

function daysWord(n) { return plural(n, 'days'); }

function route() {
  const r = location.hash.slice(1);
  return ['today', 'calendar', 'diary', 'settings'].includes(r) ? r : 'today';
}

function state() { return store.get(); }

// ---------- общие куски разметки ----------

function claim(c) {
  const src = (c.source || [])
    .map((k) => content.sources[k])
    .filter(Boolean)
    .map((s) => `<a class="src" href="${esc(s.url)}" target="_blank" rel="noopener" title="${esc(s.title)}">${esc(s.short)}</a>`)
    .join(' ');
  return `<li>${esc(c.text)} <span class="meta"><span class="conf conf-${esc(c.confidence)}">${esc(t('confidence.' + c.confidence))}</span>${src ? ' ' + src : ''}</span></li>`;
}

function claimList(items) {
  return items?.length ? `<ul class="claims">${items.map(claim).join('')}</ul>` : '';
}

function moodChips(date) {
  const s = state();
  const selected = s.entries[date]?.moods || [];
  const moods = s.moods.filter((m) => !m.hidden || selected.includes(m.id));
  return `<div class="chips">${moods
    .map((m) => `<button type="button" class="chip${selected.includes(m.id) ? ' on' : ''}" data-action="mood" data-date="${date}" data-id="${esc(m.id)}" aria-pressed="${selected.includes(m.id)}">${esc(m.label)}</button>`)
    .join('')}</div>`;
}

function noteInput(date) {
  const note = state().entries[date]?.note || '';
  return `<input class="note" type="text" maxlength="500" enterkeyhint="done" data-action="note" data-date="${date}" placeholder="${esc(t('today.notePlaceholder'))}" value="${esc(note)}">`;
}

// ---------- экран «Сегодня» ----------

function renderSetup() {
  const today = todayKey();
  return `
  <section class="card">
    <h2>${t('setup.title')}</h2>
    <p class="muted">${t('setup.lead')}</p>
    <form id="setup-form" class="form">
      <label>${t('setup.lastStart')}
        <input type="date" name="start" required max="${today}" value="${today}">
      </label>
      <label>${t('setup.cycleLength')}
        <input type="number" name="len" min="18" max="60" value="${state().settings.cycleLength}" inputmode="numeric">
      </label>
      <button class="btn primary" type="submit">${t('setup.save')}</button>
    </form>
  </section>`;
}

function banners(info) {
  const s = state();
  const today = todayKey();
  const out = [];
  if (info.overdue > 0) {
    out.push(`<div class="banner">
      <p>${t('banner.overdue')}</p>
      <div class="row">
        <button class="btn primary" data-action="start-today">${t('banner.overdueYes')}</button>
        <label class="btn">${t('banner.overduePick')}<input type="date" class="hidden-date" data-action="start-pick" max="${today}"></label>
      </div>
    </div>`);
  }
  const hasEntry = !!s.entries[today];
  if (!hasEntry && new Date().getHours() >= s.settings.reminderHour) {
    out.push(`<a class="banner soft" href="#journal">${t('banner.journal')}</a>`);
  }
  if (needsExportReminder()) {
    out.push(`<div class="banner soft"><p>${t('banner.export')}</p><button class="btn" data-action="export">${t('banner.exportBtn')}</button></div>`);
  }
  return out.join('');
}

function needsExportReminder() {
  const s = state();
  if (!Object.keys(s.entries).length) return false;
  const last = s.settings.lastExportAt || s.createdAt;
  return diffDays(todayKey(), last) >= 30;
}

function eventLine(e) {
  const when = e.inDays === 0 ? t('today.todayWord') : e.inDays === 1 ? t('today.tomorrow') : t('today.inDays', { n: e.inDays, days: daysWord(e.inDays) });
  return `<li><span class="dot ph-${e.type === 'period' ? 'menstrual' : e.type === 'pms' ? 'luteal' : 'ovulation'}"></span>
    <span class="ev-name">${t('today.event_' + e.type)}</span>
    <span class="ev-when">${when}, ${fmtDate(e.date, { day: 'numeric', month: 'short' })}</span></li>`;
}

function renderToday() {
  const s = state();
  if (!s.starts.length) return renderSetup();
  const today = todayKey();
  const up = upcoming(s, today);
  const info = up.info;
  const ph = content.phases[info.phase];

  const dayLine = info.overdue > 0
    ? t('today.overdueDay', { day: info.day })
    : t('today.dayOf', { day: info.day, length: info.length });

  const details = phaseExpanded
    ? `<div class="details">
        ${ph.body.length ? `<h4>${t('today.body')}</h4>${claimList(ph.body)}` : ''}
        ${ph.mood.length ? `<h4>${t('today.mood')}</h4>${claimList(ph.mood)}` : ''}
        ${ph.wants.length ? `<h4>${t('today.wants')}</h4>${claimList(ph.wants)}` : ''}
        ${ph.avoid.length ? `<h4>${t('today.avoid')}</h4>${claimList(ph.avoid)}` : ''}
      </div>`
    : '';

  const events = info.overdue > 0 ? up.events.filter((e) => e.type !== 'period' && e.type !== 'pms') : up.events;

  return `
  ${banners(info)}
  <section class="card phase-card ph-${info.phase}">
    <div class="phase-top">
      <div>
        <div class="day-line">${dayLine}</div>
        <h2>${esc(ph.name)}${info.pms ? ` <span class="tag">${t('phase.pms')}</span>` : ''}</h2>
      </div>
      <div class="ring" style="--p:${Math.min(info.day / info.length, 1)}"><span>${info.day}</span></div>
    </div>
    <p>${esc(ph.summary)}</p>
    <h4>${t('today.tips')}</h4>
    ${claimList(ph.tips)}
    <button class="link" data-action="toggle-phase">${phaseExpanded ? t('today.less') : t('today.more')}</button>
    ${details}
  </section>

  <section class="card" id="journal">
    <h3>${t('today.journal')}</h3>
    ${moodChips(today)}
    ${noteInput(today)}
  </section>

  <section class="card">
    <h3>${t('today.ahead')}</h3>
    <ul class="events">${events.map(eventLine).join('')}</ul>
    <p class="muted small">${t('today.approx')}</p>
  </section>

  <div class="actions">
    ${s.starts.includes(today) ? '' : `<button class="btn" data-action="start-today-confirm">${t('today.startedToday')}</button>`}
    <button class="link" data-action="open-pms">${t('today.pmsLink')}</button>
  </div>`;
}

// ---------- календарь ----------

function renderCalendar() {
  const s = state();
  const today = todayKey();
  const first = `${calMonth}-01`;
  const [y, m] = calMonth.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = weekdayMon(first);
  const title = new Intl.DateTimeFormat(locale(), { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(toDayNum(first) * 86400000));

  let cells = '';
  for (let i = 0; i < lead; i++) cells += '<div class="cell empty"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${calMonth}-${String(d).padStart(2, '0')}`;
    const info = cycleInfo(key, s, today);
    const cls = ['cell'];
    if (info) {
      cls.push('ph-' + info.phase);
      if (info.pms) cls.push('pms');
      if (info.predicted || key > today) cls.push('pred');
    }
    if (key === today) cls.push('today');
    const isStart = s.starts.includes(key);
    const hasEntry = !!s.entries[key];
    cells += `<button type="button" class="${cls.join(' ')}" data-action="open-day" data-date="${key}">
      <span class="num">${d}</span>
      <span class="marks">${isStart ? '<i class="m-start"></i>' : ''}${hasEntry ? '<i class="m-entry"></i>' : ''}</span>
    </button>`;
  }

  const up = upcoming(s, today);
  const forecast = up
    ? `<section class="card"><h3>${t('calendar.forecast')}</h3><ul class="forecast">${up.nextStarts.map((d) => `<li>${fmtDate(d, { day: 'numeric', month: 'long', year: 'numeric' })}</li>`).join('')}</ul><p class="muted small">${t('today.approx')}</p></section>`
    : '';

  return `
  <section class="card cal">
    <div class="cal-head">
      <button class="icon-btn" data-action="month" data-step="-1" aria-label="‹">‹</button>
      <h2>${title}</h2>
      <button class="icon-btn" data-action="month" data-step="1" aria-label="›">›</button>
    </div>
    <div class="grid wd">${t('calendar.weekdays').map((w) => `<div>${w}</div>`).join('')}</div>
    <div class="grid days">${cells}</div>
    <div class="legend">
      ${PHASES.map((p) => `<span><i class="sw ph-${p}"></i>${t('phase.' + p)}</span>`).join('')}
      <span><i class="m-start"></i>${t('calendar.legendStart')}</span>
      <span><i class="m-entry"></i>${t('calendar.legendEntry')}</span>
      <span><i class="sw pred-sw"></i>${t('calendar.legendPredicted')}</span>
    </div>
    ${calMonth !== today.slice(0, 7) ? `<button class="link" data-action="month-today">${t('calendar.todayBtn')}</button>` : ''}
  </section>
  ${forecast}`;
}

// ---------- дневник и сводка ----------

function percentile(sorted, p) {
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  return Math.round(sorted[lo] + (sorted[Math.ceil(i)] - sorted[lo]) * (i - lo));
}

function renderInsights() {
  const s = state();
  const ins = insights(s);
  const parts = [`<h3>${t('diary.summary')}</h3>`];
  if (ins.lengthStats) parts.push(`<p class="muted">${t('diary.lengths', ins.lengthStats)}</p>`);
  if (!ins.entriesCounted) {
    parts.push(`<p class="muted">${t('diary.noData')}</p>`);
    return `<section class="card">${parts.join('')}</section>`;
  }
  parts.push(`<p class="muted small">${ins.completedCycles >= 3 ? t('diary.summaryLead') : t('diary.notEnough', { n: ins.completedCycles })}</p>`);

  for (const p of PHASES) {
    const b = ins.byPhase[p];
    if (!b.entries) continue;
    const top = Object.entries(b.moods).sort((a, c) => c[1] - a[1]).slice(0, 4);
    parts.push(`<div class="ins-phase">
      <div class="ins-title"><i class="sw ph-${p}"></i>${t('phase.' + p)} <span class="muted small">· ${t('diary.phaseEntries', { n: b.entries, entries: plural(b.entries, 'entriesWord') })}</span></div>
      ${top.map(([id, n]) => {
        const pct = Math.round((n / b.entries) * 100);
        return `<div class="bar"><span class="bar-label">${esc(store.moodLabel(id))}</span><span class="bar-track"><span class="bar-fill ph-${p}" style="width:${pct}%"></span></span><span class="bar-val">${pct}%</span></div>`;
      }).join('')}
    </div>`);
  }

  const typical = Object.entries(ins.byMood)
    .filter(([, days]) => days.length >= 3)
    .map(([id, days]) => {
      const d = [...days].sort((a, b) => a - b);
      return { id, from: percentile(d, 0.25), to: percentile(d, 0.75), n: d.length };
    })
    .sort((a, b) => a.from - b.from);
  if (typical.length) {
    parts.push(`<h4>${t('diary.typicalDays')}</h4><ul class="typical">${typical
      .map((x) => `<li><span>${esc(store.moodLabel(x.id))}</span><span class="muted">${x.from === x.to ? x.from : `${x.from}–${x.to}`} · ${x.n} ${plural(x.n, 'times')}</span></li>`)
      .join('')}</ul>`);
  }
  return `<section class="card">${parts.join('')}</section>`;
}

function renderDiary() {
  const s = state();
  const dates = Object.keys(s.entries).sort().reverse();
  const list = dates.length
    ? `<ul class="entries">${dates.map((d) => {
        const e = s.entries[d];
        const info = cycleInfo(d, s);
        return `<li><button type="button" class="entry" data-action="open-day" data-date="${d}">
          <div class="entry-head"><span>${fmtDate(d, { weekday: 'short', day: 'numeric', month: 'long' })}</span>
          ${info ? `<span class="muted small"><i class="sw ph-${info.phase}"></i>${t('day.cycleDay', { day: info.day, phase: t('phase.' + info.phase) })}</span>` : ''}</div>
          ${e.moods.length ? `<div class="entry-moods">${e.moods.map((m) => `<span class="chip sm on">${esc(store.moodLabel(m))}</span>`).join('')}</div>` : ''}
          ${e.note ? `<div class="entry-note">${esc(e.note)}</div>` : ''}
        </button></li>`;
      }).join('')}</ul>`
    : `<p class="muted">${t('diary.empty')}</p>`;

  return `${renderInsights()}<section class="card"><h3>${t('diary.entries')}</h3>${list}</section>`;
}

// ---------- настройки ----------

function renderSettings() {
  const s = state();
  const eff = effectiveLength(s.starts, s.settings.cycleLength);
  const hours = Array.from({ length: 24 }, (_, h) => `<option value="${h}"${h === s.settings.reminderHour ? ' selected' : ''}>${String(h).padStart(2, '0')}:00</option>`).join('');
  const visible = s.moods.filter((m) => !m.hidden);
  const hidden = s.moods.filter((m) => m.hidden);

  return `
  <section class="card">
    <h3>${t('settings.cycle')}</h3>
    <div class="form">
      <label>${t('settings.cycleLength')}
        <input type="number" min="18" max="60" inputmode="numeric" data-action="setting" data-key="cycleLength" value="${s.settings.cycleLength}">
      </label>
      <p class="muted small">${t('settings.cycleLengthHint')}${eff.learned ? ' ' + t('settings.learned', { n: eff.length, days: daysWord(eff.length), c: eff.count, cycles: plural(eff.count, 'cyclesWord') }) : ''}</p>
      <label>${t('settings.periodLength')}
        <input type="number" min="2" max="10" inputmode="numeric" data-action="setting" data-key="periodLength" value="${s.settings.periodLength}">
      </label>
    </div>
    <h4>${t('settings.starts')}</h4>
    <ul class="starts">${[...s.starts].reverse().map((d) => `<li><span>${fmtDate(d, { day: 'numeric', month: 'long', year: 'numeric' })}</span><button class="link danger" data-action="remove-start" data-date="${d}">${t('settings.remove')}</button></li>`).join('')}</ul>
    <label class="btn">${t('settings.addStart')}<input type="date" class="hidden-date" data-action="start-pick" max="${todayKey()}"></label>
  </section>

  <section class="card">
    <h3>${t('settings.moods')}</h3>
    <ul class="mood-edit">${visible.map((m) => moodRow(m)).join('')}</ul>
    <form id="mood-add" class="row">
      <input type="text" name="label" maxlength="40" placeholder="${esc(t('settings.newMood'))}" required>
      <button class="btn" type="submit">${t('settings.addMood')}</button>
    </form>
    ${hidden.length ? `<h4 class="muted">${t('settings.hidden')}</h4><ul class="mood-edit">${hidden.map((m) => moodRow(m)).join('')}</ul>` : ''}
  </section>

  <section class="card">
    <h3>${t('settings.reminders')}</h3>
    <label class="form">${t('settings.reminderHour')}
      <select data-action="setting" data-key="reminderHour">${hours}</select>
    </label>
    <p class="muted small">${t('settings.reminderNote')}</p>
  </section>

  <section class="card">
    <h3>${t('push.title')}</h3>
    <p class="muted small">${t('push.lead')}</p>
    ${Array.isArray(pushResult) ? `<ul class="checks">${pushResult.map(([name, ok, extra]) => `<li class="${ok ? 'ok' : 'bad'}">${ok ? '✓' : '✗'} ${esc(name)}${extra ? ` <span class="muted small">${esc(extra)}</span>` : ''}</li>`).join('')}</ul>` : ''}
    <button class="btn" data-action="push-check"${pushResult === 'running' ? ' disabled' : ''}>${pushResult === 'running' ? t('push.running') : t('push.run')}</button>
  </section>

  <section class="card">
    <h3>${t('settings.data')}</h3>
    <p class="muted small">${t('settings.dataLead')}</p>
    <p class="small">${t('settings.lastExport', { date: s.settings.lastExportAt ? fmtDate(s.settings.lastExportAt, { day: 'numeric', month: 'long', year: 'numeric' }) : t('settings.never') })}</p>
    <div class="stack">
      <button class="btn primary" data-action="export">${t('settings.export')}</button>
      <label class="btn">${t('settings.import')}<input type="file" accept="application/json,.json" class="hidden-date" data-action="import"></label>
      <button class="btn danger" data-action="reset">${t('settings.reset')}</button>
    </div>
  </section>

  <section class="card">
    <h3>${t('settings.about')}</h3>
    <p class="muted small">${t('settings.aboutLead')}</p>
    <h4>${t('settings.sources')}</h4>
    <ul class="sources">${Object.values(content.sources).map((src) => `<li><a href="${esc(src.url)}" target="_blank" rel="noopener">${esc(src.title)}</a> <span class="muted small">— ${esc(src.kind)}</span></li>`).join('')}</ul>
    <p class="muted small">${t('settings.version', { v: VERSION })}</p>
  </section>`;
}

function moodRow(m) {
  return `<li><input type="text" maxlength="40" value="${esc(m.label)}" data-action="rename-mood" data-id="${esc(m.id)}">
    <button class="link" data-action="toggle-mood-hidden" data-id="${esc(m.id)}">${m.hidden ? t('settings.showMood') : t('settings.hideMood')}</button></li>`;
}

// ---------- нижний лист: день и ПМС ----------

function renderDaySheet(date) {
  const s = state();
  const info = cycleInfo(date, s);
  const isStart = s.starts.includes(date);
  const future = date > todayKey();
  return `
    <h2>${fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
    <p class="muted">${info ? `<i class="sw ph-${info.phase}"></i>${t('day.cycleDay', { day: info.day, phase: t('phase.' + info.phase) })}${info.pms ? ' · ' + t('phase.pms') : ''}` : t('day.noCycle')}</p>
    ${future ? '' : `<label class="check"><input type="checkbox" data-action="toggle-start" data-date="${date}"${isStart ? ' checked' : ''}> ${t('day.startHere')}</label>
    ${moodChips(date)}
    ${noteInput(date)}`}
    <button class="btn primary wide" data-action="close-sheet">${t('day.close')}</button>`;
}

function renderPmsSheet() {
  const p = content.pms;
  return `
    <h2>${esc(p.title)}</h2>
    ${claimList(p.items)}
    <h4>${t('pms.doctor')}</h4>
    ${claimList(p.doctor)}
    <div class="banner urgent">${claimList([p.urgent])}</div>
    <h4>${t('pms.howto')}</h4>
    ${claimList(p.howto)}
    <button class="btn primary wide" data-action="close-sheet">${t('day.close')}</button>`;
}

function openSheet(mode) {
  sheetMode = mode;
  renderSheet();
  if (!$sheet.open) $sheet.showModal();
}

function renderSheet() {
  if (!sheetMode) return;
  $sheetBody.innerHTML = sheetMode.type === 'day' ? renderDaySheet(sheetMode.date) : renderPmsSheet();
}

$sheet.addEventListener('close', () => { sheetMode = null; });
$sheet.addEventListener('click', (e) => { if (e.target === $sheet) $sheet.close(); });

// ---------- отрисовка ----------

function render() {
  const r = route();
  document.querySelectorAll('.tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.route === r));
  // не перерисовываем поле, в котором сейчас печатают
  const focused = document.activeElement;
  const typing = focused && focused.matches?.('input[type=text], input[type=number]') && $view.contains(focused);
  if (!typing) {
    $view.innerHTML = { today: renderToday, calendar: renderCalendar, diary: renderDiary, settings: renderSettings }[r]();
  }
  if ($sheet.open && !($sheet.contains(focused) && focused.matches?.('input[type=text]'))) renderSheet();
}

// ---------- действия ----------

async function exportData() {
  const s = state();
  const name = `cycle-partner-${todayKey()}.json`;
  const json = JSON.stringify({ ...s, exportedAt: new Date().toISOString(), app: 'cycle-partner', appVersion: VERSION }, null, 2);
  const file = new File([json], name, { type: 'application/json' });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      markExported();
      return;
    }
  } catch (e) {
    if (e.name === 'AbortError') return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  markExported();
}

function markExported() {
  store.update((s) => { s.settings.lastExportAt = todayKey(); });
}

async function importData(file) {
  try {
    const raw = JSON.parse(await file.text());
    if (!raw || typeof raw !== 'object' || !('entries' in raw || 'starts' in raw)) throw new Error('не похоже на копию Cycle Partner');
    if (!confirm(t('settings.importConfirm'))) return;
    store.replaceAll(raw);
    alert(t('settings.importOk'));
  } catch (e) {
    alert(t('settings.importBad', { msg: e.message }));
  }
}

function clampSetting(key, v) {
  const lim = { cycleLength: [18, 60], periodLength: [2, 10], reminderHour: [0, 23] }[key];
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return null;
  return Math.min(lim[1], Math.max(lim[0], n));
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const { action, date, id } = el.dataset;
  switch (action) {
    case 'mood': store.toggleMood(date, id); break;
    case 'toggle-phase': phaseExpanded = !phaseExpanded; render(); break;
    case 'start-today': store.addStart(todayKey()); break;
    case 'start-today-confirm': if (confirm(t('today.startedTodayConfirm'))) store.addStart(todayKey()); break;
    case 'open-pms': openSheet({ type: 'pms' }); break;
    case 'open-day': openSheet({ type: 'day', date }); break;
    case 'close-sheet': $sheet.close(); break;
    case 'month': {
      const [y, m] = calMonth.split('-').map(Number);
      const d = new Date(Date.UTC(y, m - 1 + Number(el.dataset.step), 1));
      calMonth = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      render();
      break;
    }
    case 'month-today': calMonth = todayKey().slice(0, 7); render(); break;
    case 'remove-start':
      if (confirm(t('settings.removeStartConfirm', { date: fmtDate(date, { day: 'numeric', month: 'long', year: 'numeric' }) }))) store.removeStart(date);
      break;
    case 'toggle-mood-hidden':
      store.update((s) => { const m = s.moods.find((x) => x.id === id); if (m) m.hidden = !m.hidden; });
      break;
    case 'export': exportData(); break;
    case 'push-check':
      pushResult = 'running';
      render();
      pushCheck().then((r) => { pushResult = r; render(); }, (e) => { pushResult = [[t('push.title'), false, e.message]]; render(); });
      break;
    case 'reset':
      if (confirm(t('settings.resetConfirm')) && confirm(t('settings.resetConfirm2'))) store.resetAll();
      break;
  }
});

document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const { action, date, id, key } = el.dataset;
  switch (action) {
    case 'note': store.setNote(date, el.value); break;
    case 'start-pick': if (isValidKey(el.value) && el.value <= todayKey()) store.addStart(el.value); break;
    case 'toggle-start': el.checked ? store.addStart(date) : store.removeStart(date); break;
    case 'setting': {
      const v = clampSetting(key, el.value);
      if (v != null) store.update((s) => { s.settings[key] = v; });
      break;
    }
    case 'rename-mood': {
      const label = el.value.trim();
      if (label) store.update((s) => { const m = s.moods.find((x) => x.id === id); if (m) m.label = label; });
      break;
    }
    case 'import': if (el.files?.[0]) importData(el.files[0]); el.value = ''; break;
  }
});

// Enter в заметке = сохранить и убрать клавиатуру
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('input.note, .mood-edit input')) e.target.blur();
});

document.addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  if (f.id === 'setup-form') {
    const start = f.start.value;
    if (!isValidKey(start) || start > todayKey()) return;
    const len = clampSetting('cycleLength', f.len.value) ?? 28;
    store.update((s) => { s.settings.cycleLength = len; s.starts = [start]; });
    store.requestPersistence();
  } else if (f.id === 'mood-add') {
    const label = f.label.value.trim();
    if (!label) return;
    store.update((s) => { s.moods.push({ id: 'm' + Date.now().toString(36), label, hidden: false }); });
  }
});

// ---------- запуск ----------

async function init() {
  const [, phases] = await Promise.all([loadI18n('ru'), fetch('content/ru/phases.json').then((r) => r.json())]);
  content = phases;
  document.querySelectorAll('.tabbar a').forEach((a) => { a.querySelector('span').textContent = t('nav.' + a.dataset.route); });
  store.subscribe(render);
  window.addEventListener('hashchange', () => { phaseExpanded = false; window.scrollTo(0, 0); render(); });
  // день мог смениться, пока приложение было свёрнуто
  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
  render();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();
