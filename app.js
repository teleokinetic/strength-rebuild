/* Strength Rebuild — gym companion
   Vanilla JS single-page app. State lives in localStorage; the program is
   editable data seeded from seed.js on first run. */

'use strict';

/* ============================== state ============================== */

const STORE_KEY = 'sr-state-v1';
const APP_VERSION = '1.0.0';

let state = null;

function slug(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'exercise';
}

function defaultState() {
  const s = {
    version: 1,
    settings: { unit: 'lb', sound: true, wake: true, week: 1, block: 1, lastExport: null },
    exercises: {},
    program: JSON.parse(JSON.stringify(SEED_PROGRAM)),
    sessions: [],
    active: null,
  };
  for (const day of s.program.days) {
    for (const slot of day.slots) {
      slot.exerciseId = slug(slot.name);
      s.exercises[slot.exerciseId] = { id: slot.exerciseId, name: slot.name };
    }
  }
  return s;
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) { state = JSON.parse(raw); return; }
  } catch (e) { /* corrupted → reseed */ }
  state = defaultState();
  save();
}

let saveTimer = null;
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch (e) { toast('Could not save — storage full?'); }
}
function saveSoon() {          // debounced save for keystroke-level updates
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 400);
}

/* ============================== helpers ============================== */

const $ = (sel) => document.querySelector(sel);

function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtDate(ts, withYear) {
  const d = new Date(ts);
  const opts = { month: 'short', day: 'numeric' };
  if (withYear || d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('en-US', opts);
}

function fmtClock(sec) {
  sec = Math.max(0, Math.round(sec));
  return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
}

function fmtRest(sec) {
  if (!sec) return '';
  return sec % 60 === 0 ? (sec / 60) + ' min' : fmtClock(sec);
}

function metricUnit(slot) {
  return slot.metric === 'seconds' ? 's' : slot.metric === 'meters' ? 'm' : '';
}

function findDay(dayId) { return state.program.days.find((d) => d.id === dayId); }
function findSlot(day, slotId) { return day ? day.slots.find((s) => s.id === slotId) : null; }

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

let toastTimer = null;
function toast(msg) {
  let el = $('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/* ====================== history & progression ====================== */

// Most recent completed entry for an exercise, searched across all sessions.
function lastEntryFor(exerciseId) {
  for (let i = state.sessions.length - 1; i >= 0; i--) {
    const sess = state.sessions[i];
    const entry = sess.entries.find((e) => e.exerciseId === exerciseId && e.sets.length);
    if (entry) return { entry, session: sess };
  }
  return null;
}

function allEntriesFor(exerciseId) {
  const out = [];
  for (const sess of state.sessions) {
    const entry = sess.entries.find((e) => e.exerciseId === exerciseId && e.sets.length);
    if (entry) out.push({ entry, session: sess });
  }
  return out;
}

// §5 double progression: every work set at the top of the rep range at
// target RIR → suggest the smallest jump and a reset to the bottom.
function nudgeFor(slot) {
  if (slot.progression !== 'load' && slot.progression !== 'variation') return null;
  const last = lastEntryFor(slot.exerciseId);
  if (!last || last.session.week === 4) return null;   // deload sessions don't earn a bump
  const sets = last.entry.sets;
  if (sets.length < 2) return null;
  const top = slot.reps[1];
  const allTop = sets.every((s) => Number(s.r) >= top && (!slot.trackRIR || s.rir === '' || Number(s.rir) >= 2));
  if (!allTop) return null;
  if (slot.progression === 'variation') {
    return { type: 'variation', text: `All sets hit ${top} — ready to progress the variation: ${slot.progressionNote}` };
  }
  const topW = Math.max(...sets.map((s) => Number(s.w) || 0));
  const next = topW + (slot.increment || 5);
  return {
    type: 'load', weight: next,
    text: `All sets hit ${top} at target RIR last time — go ${next} ${state.settings.unit}, build back from ${slot.reps[0]}.`,
  };
}

function fmtSets(sets, metric) {
  if (!sets.length) return '';
  const unit = metric === 'seconds' ? 's' : metric === 'meters' ? 'm' : '';
  const ws = sets.map((s) => s.w).filter((w) => w !== '' && w != null && Number(w) !== 0);
  const sameW = ws.length === sets.length && ws.every((w) => w === ws[0]);
  let body;
  if (sameW) body = `${ws[0]} × ${sets.map((s) => s.r + unit).join(', ')}`;
  else if (ws.length) body = sets.map((s) => (s.w !== '' && s.w != null && Number(s.w) !== 0 ? s.w + '×' : '') + s.r + unit).join(', ');
  else body = sets.map((s) => s.r + unit).join(', ');
  const rirs = sets.map((s) => s.rir).filter((r) => r !== '' && r != null);
  if (rirs.length) {
    const u = [...new Set(rirs)];
    body += ` @${u.length === 1 ? u[0] : Math.min(...u.map(Number)) + '–' + Math.max(...u.map(Number))} RIR`;
  }
  return body;
}

/* ============================== timer ============================== */

const timer = { endsAt: 0, total: 0, next: null, zeroFired: true };

let audioCtx = null;
function unlockAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
}
document.addEventListener('touchend', unlockAudio, { once: true, passive: true });
document.addEventListener('click', unlockAudio, { once: true });

function chime() {
  if (!state.settings.sound || !audioCtx || audioCtx.state !== 'running') return;
  const now = audioCtx.currentTime;
  [[880, 0], [880, 0.22], [1174.7, 0.44]].forEach(([freq, dt]) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = freq;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.0001, now + dt);
    gain.gain.exponentialRampToValueAtTime(0.4, now + dt + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dt + 0.28);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now + dt);
    osc.stop(now + dt + 0.3);
  });
  if (navigator.vibrate) { try { navigator.vibrate([180, 90, 180]); } catch (e) {} }
}

function startTimer(sec, next) {
  timer.endsAt = Date.now() + sec * 1000;
  timer.total = sec;
  timer.next = next || null;
  timer.zeroFired = false;
  renderTimer();
}

function stopTimer() {
  timer.endsAt = 0;
  timer.zeroFired = true;
  $('#timerbar').classList.add('hidden');
  $('#clock').classList.add('hidden');
}

function renderTimer() {
  const bar = $('#timerbar');
  const clock = $('#clock');
  if (!timer.endsAt) return;
  const remain = (timer.endsAt - Date.now()) / 1000;
  const frac = timer.total ? Math.max(0, remain / timer.total) : 0;
  const atZero = remain <= 0;
  if (atZero && !timer.zeroFired) { timer.zeroFired = true; chime(); }

  const nextHTML = timer.next
    ? `<b>${esc(timer.next.name)}</b>${esc(timer.next.detail)}`
    : `<b>Session done</b>Finish when ready`;

  bar.className = 'timerbar' + (atZero ? ' zero' : '');
  bar.innerHTML = `
    <div class="track" style="width:${(frac * 100).toFixed(1)}%"></div>
    <div class="digits" data-act="clock-open">${atZero ? 'GO' : fmtClock(remain)}</div>
    <div class="nextup" data-act="clock-open">${nextHTML}</div>
    <button class="tb-btn" data-act="timer-add">+30s</button>
    <button class="tb-btn" data-act="timer-stop" aria-label="Dismiss timer">✕</button>`;

  if (!clock.classList.contains('hidden')) {
    clock.className = 'clock' + (atZero ? ' zero' : '');
    clock.innerHTML = `
      <div class="eyebrow phase">${atZero ? 'Rest done' : 'Rest'}</div>
      <div class="bigdigits">${atZero ? 'GO' : fmtClock(remain)}</div>
      <div class="drain"><div class="fill" style="width:${(frac * 100).toFixed(1)}%"></div></div>
      <div class="ondeck">${timer.next
        ? `<b>${esc(timer.next.name)}</b>${esc(timer.next.detail)}`
        : `<b>Session done</b>Finish when ready`}</div>
      <div class="clock-btns">
        <button data-act="timer-add">+30s</button>
        <button data-act="clock-close">Back to sets</button>
      </div>`;
  }
}

setInterval(() => {
  if (timer.endsAt) renderTimer();
  const el = $('#elapsed');
  if (el && state.active) el.textContent = elapsedText();
}, 500);

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) { if (timer.endsAt) renderTimer(); acquireWakeLock(); }
});

function elapsedText() {
  const min = Math.floor((Date.now() - state.active.startedAt) / 60000);
  return min + ' min';
}

/* ============================ wake lock ============================ */

let wakeLock = null;
async function acquireWakeLock() {
  if (!state || !state.settings.wake || !state.active || !('wakeLock' in navigator)) return;
  try { wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {}
}
function releaseWakeLock() {
  if (wakeLock) { try { wakeLock.release(); } catch (e) {} wakeLock = null; }
}

/* ============================ session core ============================ */

function startSession(dayId) {
  const day = findDay(dayId);
  if (!day) return;
  const entries = {};
  for (const slot of day.slots) {
    const last = lastEntryFor(slot.exerciseId);
    const nudge = nudgeFor(slot);
    const deload = state.settings.week === 4;
    const nSets = Math.max(1, slot.sets - (deload ? 1 : 0));
    const sets = [];
    for (let i = 0; i < nSets; i++) {
      const prev = last ? (last.entry.sets[i] || last.entry.sets[last.entry.sets.length - 1]) : null;
      sets.push({
        w: nudge && nudge.type === 'load' ? String(nudge.weight) : (prev && prev.w != null ? String(prev.w) : ''),
        r: nudge && nudge.type === 'load' ? String(slot.reps[0]) : (prev && prev.r != null ? String(prev.r) : ''),
        rir: '',
        done: false, t: 0,
      });
    }
    entries[slot.id] = { exerciseId: slot.exerciseId, sets, note: '' };
  }
  state.active = { dayId, startedAt: Date.now(), week: state.settings.week, block: state.settings.block, entries };
  save();
  acquireWakeLock();
  location.hash = '#/session';
}

// Flattened work order: supersets interleave (A1, B1, A2, B2…), everything
// else runs sequentially. Drives the "next up" line on the timer.
function workOrder(day) {
  const items = [];
  const handled = new Set();
  for (const slot of day.slots) {
    if (handled.has(slot.id)) continue;
    const group = slot.group ? day.slots.filter((s) => s.group === slot.group) : [slot];
    group.forEach((s) => handled.add(s.id));
    const counts = group.map((s) => (state.active.entries[s.id] ? state.active.entries[s.id].sets.length : 0));
    const maxSets = Math.max(...counts);
    for (let i = 0; i < maxSets; i++) {
      for (const s of group) {
        if (state.active.entries[s.id] && i < state.active.entries[s.id].sets.length) {
          items.push({ slot: s, setIdx: i });
        }
      }
    }
  }
  return items;
}

function nextPending(day) {
  for (const item of workOrder(day)) {
    const set = state.active.entries[item.slot.id].sets[item.setIdx];
    if (!set.done) return item;
  }
  return null;
}

function logSet(slotId, setIdx) {
  const day = findDay(state.active.dayId);
  const slot = findSlot(day, slotId);
  const entry = state.active.entries[slotId];
  const set = entry.sets[setIdx];
  set.done = true;
  set.t = Date.now();
  save();
  render();
  const next = nextPending(day);
  if (slot.restSec > 0) {
    let nextInfo = null;
    if (next) {
      const nEntry = state.active.entries[next.slot.id];
      const nSet = nEntry.sets[next.setIdx];
      const target = [nSet.w ? nSet.w + ' ' + state.settings.unit : '', nSet.r ? '× ' + nSet.r + metricUnit(next.slot) : ''].filter(Boolean).join(' ');
      nextInfo = {
        name: next.slot.name,
        detail: `Set ${next.setIdx + 1} of ${nEntry.sets.length}${target ? ' — ' + target : ''}`,
      };
    }
    startTimer(slot.restSec, nextInfo);
  }
}

function finishSession(note) {
  const day = findDay(state.active.dayId);
  const entries = [];
  for (const slot of day.slots) {
    const entry = state.active.entries[slot.id];
    if (!entry) continue;
    const done = entry.sets.filter((s) => s.done).map((s) => ({
      w: slot.load === 'none' ? '' : (s.w === '' ? '' : Number(s.w)),
      r: s.r === '' ? '' : Number(s.r),
      rir: slot.trackRIR && s.rir !== '' ? Number(s.rir) : '',
    }));
    if (done.length) {
      entries.push({
        exerciseId: entry.exerciseId,
        name: slot.name, pattern: slot.pattern, metric: slot.metric, perSide: slot.perSide,
        sets: done,
        note: entry.note.trim(),
      });
    }
  }
  state.sessions.push({
    id: uid(),
    dayId: day.id, dayName: `${day.name} — ${day.subtitle}`,
    startedAt: state.active.startedAt, endedAt: Date.now(),
    week: state.active.week, block: state.active.block,
    note: (note || '').trim(),
    entries,
  });
  state.active = null;
  stopTimer();
  releaseWakeLock();

  // Auto-advance the block calendar after the 2nd session of the week.
  const { week, block } = state.settings;
  const inWeek = state.sessions.filter((s) => s.week === week && s.block === block).length;
  let advanced = '';
  if (inWeek >= 2) {
    if (week >= 4) { state.settings.week = 1; state.settings.block = block + 1; advanced = `Block ${block + 1}, Week 1`; }
    else { state.settings.week = week + 1; advanced = `Week ${week + 1}${week + 1 === 4 ? ' — deload' : ''}`; }
  }
  save();
  location.hash = '#/';
  toast(advanced ? `Session saved · advanced to ${advanced}` : 'Session saved');
}

/* ============================== charts ============================== */

// Single-series trend: top-set load when the movement is loaded, otherwise
// best reps/seconds/meters. Brass on dark, validated palette step.
function seriesFor(exerciseId) {
  const rows = allEntriesFor(exerciseId);
  const loaded = rows.some(({ entry }) => entry.sets.some((s) => Number(s.w) > 0));
  const pts = rows.map(({ entry, session }) => {
    const v = loaded
      ? Math.max(...entry.sets.map((s) => Number(s.w) || 0))
      : Math.max(...entry.sets.map((s) => Number(s.r) || 0));
    return { v, t: session.startedAt, entry };
  });
  const metric = rows.length ? rows[rows.length - 1].entry.metric : 'reps';
  const yLabel = loaded ? `top set, ${state.settings.unit}`
    : metric === 'seconds' ? 'best hold, s' : metric === 'meters' ? 'best carry, m' : 'best reps';
  return { pts, yLabel, loaded };
}

function chartSVG(pts, yLabel) {
  if (pts.length < 2) return '';
  const W = 320, H = 150, L = 38, R = 12, T = 12, B = 24;
  const vs = pts.map((p) => p.v);
  let lo = Math.min(...vs), hi = Math.max(...vs);
  if (lo === hi) { lo -= 1; hi += 1; }
  const span = hi - lo;
  lo = Math.max(0, lo - span * 0.15); hi = hi + span * 0.15;
  const x = (i) => L + (i / (pts.length - 1)) * (W - L - R);
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const ticks = [lo + (hi - lo) * 0.1, (lo + hi) / 2, hi - (hi - lo) * 0.1].map((v) => Math.round(v));
  const grid = [...new Set(ticks)].map((v) =>
    `<line x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="var(--line)" stroke-width="1"/>
     <text x="${L - 6}" y="${(y(v) + 3.5).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--dim)">${v}</text>`).join('');
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  const dots = pts.map((p, i) =>
    `<circle cx="${x(i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="4.5" fill="var(--brass-chart)" stroke="var(--card)" stroke-width="2" data-pt="${i}"/>
     <circle cx="${x(i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="13" fill="transparent" data-pt="${i}"/>`).join('');
  const x0 = fmtDate(pts[0].t), x1 = fmtDate(pts[pts.length - 1].t);
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Trend, ${esc(yLabel)}">
    ${grid}
    <text x="${L}" y="${H - 6}" font-size="10" fill="var(--dim)">${x0}</text>
    <text x="${W - R}" y="${H - 6}" text-anchor="end" font-size="10" fill="var(--dim)">${x1}</text>
    <path d="${path}" fill="none" stroke="var(--brass-chart)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}
  </svg>`;
}

function sparkSVG(pts) {
  if (pts.length < 2) return '<svg width="72" height="28"></svg>';
  const W = 72, H = 28, P = 3;
  const vs = pts.map((p) => p.v);
  let lo = Math.min(...vs), hi = Math.max(...vs);
  if (lo === hi) { lo -= 1; hi += 1; }
  const x = (i) => P + (i / (pts.length - 1)) * (W - 2 * P);
  const y = (v) => P + (1 - (v - lo) / (hi - lo)) * (H - 2 * P);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  const last = pts.length - 1;
  return `<svg class="sparkline" width="72" height="28" viewBox="0 0 ${W} ${H}" aria-hidden="true">
    <path d="${path}" fill="none" stroke="var(--brass-chart)" stroke-width="1.5" stroke-linejoin="round"/>
    <circle cx="${x(last).toFixed(1)}" cy="${y(pts[last].v).toFixed(1)}" r="2.5" fill="var(--brass-chart)"/>
  </svg>`;
}

/* ============================== views ============================== */

function weekPill() {
  const { week, block } = state.settings;
  const deload = week === 4;
  return `<button class="pill ${deload ? 'brass' : ''}" data-act="nav" data-to="#/settings">Wk ${week} · Blk ${block}${deload ? ' · deload' : ''}</button>`;
}

function viewHome() {
  const lastSess = state.sessions[state.sessions.length - 1];
  const suggestId = lastSess && lastSess.dayId === 'dayA' ? 'dayB' : 'dayA';
  const days = [...state.program.days].sort((a, b) => (a.id === suggestId ? -1 : b.id === suggestId ? 1 : 0));

  const resume = state.active ? `
    <button class="card day-start suggested" data-act="nav" data-to="#/session">
      <div class="eyebrow">In progress · started ${fmtDate(state.active.startedAt)}</div>
      <div class="day-name">Resume session</div>
      <div class="day-sub">${esc((findDay(state.active.dayId) || {}).name || '')} — pick up where you left off</div>
      <span class="go">Continue →</span>
    </button>` : '';

  const dayCards = state.active ? '' : days.map((day) => {
    const suggested = day.id === suggestId;
    const preview = day.slots.map((s) => s.name).join(' · ');
    return `
      <button class="card day-start ${suggested ? 'suggested' : ''}" data-act="start-day" data-day="${day.id}">
        <div class="eyebrow">${suggested ? (lastSess ? 'Up next' : 'Start here') : 'Or'}</div>
        <div class="day-name">${esc(day.name)}</div>
        <div class="day-sub">${esc(day.subtitle)}</div>
        ${suggested ? `<div class="day-preview">${esc(preview)}</div><span class="go">Start session →</span>` : ''}
      </button>`;
  }).join('');

  const standaloneHint = ('standalone' in navigator) && !navigator.standalone && /iPhone|iPad/.test(navigator.userAgent)
    ? `<div class="footer-note">For the full experience: Share → Add to Home Screen.<br>It opens like an app and works offline.</div>` : '';

  return `
    <div class="topbar">
      <div class="wordmark">Strength <span class="half">Rebuild</span></div>
      ${weekPill()}
    </div>
    ${state.settings.week === 4 ? `<div class="deload-banner"><span class="tag">Deload week</span>One set fewer per movement, leave 4–5 RIR. Recovery and re-grooving, not stimulus.</div>` : ''}
    ${resume}
    ${dayCards}
    <div class="navrow">
      <button class="navbtn" data-act="nav" data-to="#/history">History</button>
      <button class="navbtn" data-act="nav" data-to="#/program">Program</button>
      <button class="navbtn" data-act="nav" data-to="#/settings">Settings</button>
    </div>
    ${standaloneHint}`;
}

function setRowsHTML(slot, entry, deload) {
  const noLoad = slot.load === 'none';
  const noRIR = !slot.trackRIR;
  const cls = `${noLoad ? ' no-load' : ''}${noRIR ? ' no-rir' : ''}`;
  const unit = metricUnit(slot);
  const labels = `
    <div class="set-labels${cls}">
      <span>Set</span>
      ${noLoad ? '' : `<span>${slot.load === 'added' ? '+' : ''}${state.settings.unit}</span>`}
      <span>${slot.metric === 'seconds' ? 'sec' : slot.metric === 'meters' ? 'm' : 'reps'}${slot.perSide ? '/side' : ''}</span>
      ${noRIR ? '' : `<span>RIR</span>`}
      <span></span>
    </div>`;
  const rows = entry.sets.map((set, i) => `
    <div class="set-row${cls}${set.done ? ' done' : ''}">
      <span class="set-idx">${i + 1}</span>
      ${noLoad ? '' : `<input type="text" inputmode="decimal" value="${esc(set.w)}" placeholder="—" data-in="set" data-slot="${slot.id}" data-set="${i}" data-f="w" ${set.done ? 'readonly' : ''}>`}
      <input type="text" inputmode="numeric" value="${esc(set.r)}" placeholder="${slot.reps[0]}–${slot.reps[1]}${unit}" data-in="set" data-slot="${slot.id}" data-set="${i}" data-f="r" ${set.done ? 'readonly' : ''}>
      ${noRIR ? '' : `<input type="text" inputmode="numeric" value="${esc(set.rir)}" placeholder="${deload ? '4–5' : esc(slot.rir) || '—'}" data-in="set" data-slot="${slot.id}" data-set="${i}" data-f="rir" ${set.done ? 'readonly' : ''}>`}
      <button class="log" data-act="${set.done ? 'unlog-set' : 'log-set'}" data-slot="${slot.id}" data-set="${i}" aria-label="${set.done ? 'Undo set' : 'Log set'}">✓</button>
    </div>`).join('');
  return labels + rows;
}

function slotCardHTML(day, slot, deload) {
  const entry = state.active.entries[slot.id];
  if (!entry) return '';
  const last = lastEntryFor(slot.exerciseId);
  const nudge = nudgeFor(slot);
  const setsShown = entry.sets.length;
  const unit = metricUnit(slot);
  const repsTxt = slot.reps[0] === slot.reps[1] ? slot.reps[0] + unit : `${slot.reps[0]}–${slot.reps[1]}${unit}`;
  const rx = `<b>${setsShown} × ${repsTxt}</b>${slot.perSide ? ' /side' : ''}${slot.trackRIR ? ` @ ${deload ? '4–5' : esc(slot.rir)} RIR` : ''}${slot.restSec ? ` · rest ${fmtRest(slot.restSec)}` : ''}`;
  const lastLine = last
    ? `<div class="lastline">Last (${fmtDate(last.session.startedAt)}): <b>${esc(fmtSets(last.entry.sets, slot.metric))}</b>${last.entry.note ? ` — <i>${esc(last.entry.note)}</i>` : ''}</div>`
    : '';
  const nudgeHTML = nudge ? `<div class="nudge"><span class="tag">${nudge.type === 'load' ? 'Progression earned' : 'Variation ready'}</span>${esc(nudge.text)}</div>` : '';
  const noteOpen = entry.note !== '';
  return `
    <div class="card" id="slot-${slot.id}">
      <div class="slot-head">
        <span class="eyebrow">${esc(slot.pattern)}</span>
      </div>
      <button class="slot-name" data-act="nav" data-to="#/exercise/${slot.exerciseId}">${esc(slot.name)}</button>
      <div class="rx">${rx}</div>
      ${slot.cue ? `<div class="cue">${esc(slot.cue)}</div>` : ''}
      ${nudgeHTML}
      ${lastLine}
      <div class="sets">${setRowsHTML(slot, entry, deload)}</div>
      <div class="slot-foot">
        <button class="linklike" data-act="toggle-note" data-slot="${slot.id}">${noteOpen ? 'note ↓' : '+ note'}</button>
        <span>
          <button class="linklike" data-act="remove-set" data-slot="${slot.id}">– set</button>
          &nbsp;&nbsp;
          <button class="linklike" data-act="add-set" data-slot="${slot.id}">+ set</button>
        </span>
      </div>
      <div class="note-box" style="${noteOpen ? '' : 'display:none'}" id="note-${slot.id}">
        <textarea class="note" placeholder="How did it feel? Anything for next time…" data-in="note" data-slot="${slot.id}">${esc(entry.note)}</textarea>
      </div>
    </div>`;
}

function viewSession() {
  if (!state.active) { location.hash = '#/'; return ''; }
  const day = findDay(state.active.dayId);
  const deload = state.active.week === 4;
  const handled = new Set();
  const cards = [];
  for (const slot of day.slots) {
    if (handled.has(slot.id)) continue;
    if (slot.group) {
      const group = day.slots.filter((s) => s.group === slot.group);
      group.forEach((s) => handled.add(s.id));
      cards.push(group.map((s) => slotCardHTML(day, s, deload)).join(`<div class="superset-tie">superset — alternate sets</div>`));
    } else {
      handled.add(slot.id);
      cards.push(slotCardHTML(day, slot, deload));
    }
  }
  return `
    <div class="session-top">
      <div>
        <div class="title">${esc(day.name)}</div>
        <div class="meta">${esc(day.subtitle)} · Wk ${state.active.week} · <span id="elapsed">${elapsedText()}</span></div>
      </div>
      <button class="finish" data-act="nav" data-to="#/finish">Finish</button>
    </div>
    ${deload ? `<div class="deload-banner"><span class="tag">Deload week</span>One set fewer, 4–5 RIR, moderate load. Re-groove, don't push.</div>` : ''}
    ${cards.join('')}
    <button class="btn primary" data-act="nav" data-to="#/finish">Finish session</button>`;
}

function viewFinish() {
  if (!state.active) { location.hash = '#/'; return ''; }
  const day = findDay(state.active.dayId);
  let logged = 0, total = 0;
  for (const slot of day.slots) {
    const e = state.active.entries[slot.id];
    if (!e) continue;
    total += e.sets.length;
    logged += e.sets.filter((s) => s.done).length;
  }
  return `
    <button class="back" data-act="nav" data-to="#/session">← Back to session</button>
    <div class="card">
      <div class="eyebrow">Finish ${esc(day.name)}</div>
      <div class="day-name" style="font-size:28px">${logged} of ${total} sets logged</div>
      <div class="day-sub">${elapsedText()} · ${esc(day.subtitle)}</div>
      <div class="note-box">
        <textarea class="note" id="session-note" placeholder="Session note — energy, sleep, what to change next time… (optional)"></textarea>
      </div>
    </div>
    <button class="btn primary" data-act="finish-session">Save session</button>
    <button class="btn quiet" data-act="nav" data-to="#/session">Keep training</button>
    <button class="btn danger" data-act="discard-session">Discard session</button>`;
}

function viewHistory() {
  const sessions = [...state.sessions].reverse();
  const exRows = Object.values(state.exercises)
    .map((ex) => ({ ex, rows: allEntriesFor(ex.id) }))
    .filter((r) => r.rows.length)
    .sort((a, b) => b.rows[b.rows.length - 1].session.startedAt - a.rows[a.rows.length - 1].session.startedAt);

  const sessHTML = sessions.length ? sessions.map((s) => `
    <button class="card tappable h-session" data-act="nav" data-to="#/session-log/${s.id}">
      <div class="h-date">${fmtDate(s.startedAt, true)}</div>
      <div class="h-meta">${esc(s.dayName)} · ${s.entries.length} movements · Wk ${s.week}, Blk ${s.block}</div>
      ${s.note ? `<div class="h-note">${esc(s.note)}</div>` : ''}
    </button>`).join('')
    : `<div class="empty">No sessions yet. The first one starts the record.</div>`;

  const exHTML = exRows.map(({ ex, rows }) => {
    const { pts } = seriesFor(ex.id);
    const last = rows[rows.length - 1];
    return `
      <button class="card tappable" data-act="nav" data-to="#/exercise/${ex.id}">
        <div class="ex-info">
          <div class="ex-name">${esc(ex.name)}</div>
          <div class="ex-last">${fmtDate(last.session.startedAt)} · ${esc(fmtSets(last.entry.sets, last.entry.metric))}</div>
        </div>
        ${sparkSVG(pts)}
      </button>`;
  }).join('');

  return `
    <button class="back" data-act="nav" data-to="#/">← Home</button>
    <div class="topbar"><div class="wordmark">History</div>${weekPill()}</div>
    ${exRows.length ? `<div class="eyebrow" style="margin-bottom:10px">By movement</div><div class="ex-list">${exHTML}</div>` : ''}
    <div class="section-head"><span class="eyebrow">Sessions</span></div>
    ${sessHTML}`;
}

function viewSessionLog(id) {
  const s = state.sessions.find((x) => x.id === id);
  if (!s) { location.hash = '#/history'; return ''; }
  const entries = s.entries.map((e) => `
    <div class="h-entry">
      <div class="h-ex">${esc(e.name)}</div>
      <div class="h-sets">${esc(fmtSets(e.sets, e.metric))}${e.perSide ? ' /side' : ''}</div>
      ${e.note ? `<div class="h-enote">${esc(e.note)}</div>` : ''}
    </div>`).join('');
  const dur = s.endedAt ? Math.round((s.endedAt - s.startedAt) / 60000) + ' min' : '';
  return `
    <button class="back" data-act="nav" data-to="#/history">← History</button>
    <div class="card">
      <div class="h-date" style="font-family:var(--display);font-weight:600;font-size:22px;text-transform:uppercase">${fmtDate(s.startedAt, true)}</div>
      <div class="h-meta" style="color:var(--dim);font-size:13.5px">${esc(s.dayName)} · ${dur} · Wk ${s.week}, Blk ${s.block}</div>
      ${s.note ? `<div class="h-note" style="color:var(--dim);font-style:italic;margin-top:8px">${esc(s.note)}</div>` : ''}
    </div>
    <div class="card">${entries || '<div class="empty">Nothing logged.</div>'}</div>
    <button class="btn danger" data-act="delete-session" data-id="${s.id}">Delete this session</button>`;
}

function viewExercise(exId) {
  const ex = state.exercises[exId];
  if (!ex) { location.hash = '#/history'; return ''; }
  const rows = allEntriesFor(exId).reverse();
  const { pts, yLabel } = seriesFor(exId);
  const chart = chartSVG(pts, yLabel);
  const table = rows.map(({ entry, session }, i) => `
    <div class="h-entry">
      <div class="h-ex">${fmtDate(session.startedAt, true)} <span style="color:var(--dim);font-weight:400">· Wk ${session.week}</span></div>
      <div class="h-sets">${esc(fmtSets(entry.sets, entry.metric))}${entry.perSide ? ' /side' : ''}</div>
      ${entry.note ? `<div class="h-enote">${esc(entry.note)}</div>` : ''}
    </div>`).join('');
  return `
    <button class="back" data-act="nav" data-to="#/history">← History</button>
    <div class="topbar"><div class="wordmark" style="font-size:24px">${esc(ex.name)}</div></div>
    ${chart ? `
      <div class="card">
        <div class="eyebrow">${esc(yLabel)}</div>
        <div class="chart-wrap" data-ex="${exId}">${chart}</div>
        <div class="chart-tip" id="chart-tip">tap a point for detail</div>
      </div>` : ''}
    <div class="card">
      ${table || '<div class="empty">No history yet for this movement.</div>'}
    </div>`;
}

function viewProgram() {
  const days = state.program.days.map((day) => {
    const slots = day.slots.map((slot, i) => {
      const unit = metricUnit(slot);
      const repsTxt = slot.reps[0] === slot.reps[1] ? slot.reps[0] + unit : `${slot.reps[0]}–${slot.reps[1]}${unit}`;
      return `
      <div class="prog-slot">
        <button class="ps-main" data-act="nav" data-to="#/slot/${day.id}/${slot.id}">
          <div class="ps-name">${slot.group ? slot.group + '·' : ''} ${esc(slot.name)}</div>
          <div class="ps-rx">${esc(slot.pattern)} · ${slot.sets} × ${repsTxt}${slot.perSide ? ' /side' : ''}${slot.restSec ? ' · rest ' + fmtRest(slot.restSec) : ''}</div>
        </button>
        <button class="mv" data-act="move-slot" data-day="${day.id}" data-slot="${slot.id}" data-dir="-1" aria-label="Move up" ${i === 0 ? 'disabled style="opacity:.3"' : ''}>↑</button>
        <button class="mv" data-act="move-slot" data-day="${day.id}" data-slot="${slot.id}" data-dir="1" aria-label="Move down" ${i === day.slots.length - 1 ? 'disabled style="opacity:.3"' : ''}>↓</button>
      </div>`;
    }).join('');
    return `
      <div class="section-head"><span class="eyebrow">${esc(day.name)} — ${esc(day.subtitle)}</span></div>
      <div class="card" style="display:grid;gap:12px">${slots}
        <button class="linklike" data-act="nav" data-to="#/slot/${day.id}/new" style="text-align:left">+ add movement</button>
      </div>`;
  }).join('');
  return `
    <button class="back" data-act="nav" data-to="#/">← Home</button>
    <div class="topbar"><div class="wordmark">Program</div><span class="pill">spec v${esc(state.program.specVersion)}</span></div>
    ${days}
    <div class="footer-note">Tap a movement to edit sets, reps, rest, cues, progression.<br>History follows the movement name — pick an existing name from the suggestions to keep its history linked.</div>`;
}

function viewSlotEdit(dayId, slotId) {
  const day = findDay(dayId);
  if (!day) { location.hash = '#/program'; return ''; }
  const isNew = slotId === 'new';
  const slot = isNew ? {
    id: 's' + uid(), name: '', pattern: '', sets: 3, reps: [8, 10], rir: '2–3', trackRIR: true,
    load: 'external', metric: 'reps', perSide: false, restSec: 90,
    progression: 'load', increment: 5, progressionNote: '', cue: '', group: '',
  } : findSlot(day, slotId);
  if (!slot) { location.hash = '#/program'; return ''; }
  const names = [...new Set(Object.values(state.exercises).map((e) => e.name))];
  const opt = (val, cur, label) => `<option value="${val}" ${val === cur ? 'selected' : ''}>${label}</option>`;
  return `
    <button class="back" data-act="nav" data-to="#/program">← Program</button>
    <div class="topbar"><div class="wordmark" style="font-size:22px">${isNew ? 'Add movement' : 'Edit movement'}</div></div>
    <div class="card">
      <div class="field">
        <label for="f-name">Movement</label>
        <input type="text" id="f-name" value="${esc(slot.name)}" list="ex-names" placeholder="e.g. Front squat">
        <datalist id="ex-names">${names.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
        <div class="hint">Pick from suggestions to keep history linked to an existing movement.</div>
      </div>
      <div class="field">
        <label for="f-pattern">Pattern label</label>
        <input type="text" id="f-pattern" value="${esc(slot.pattern)}" placeholder="e.g. Squat main">
      </div>
      <div class="field-row">
        <div class="field"><label for="f-sets">Sets</label><input type="number" id="f-sets" value="${slot.sets}" min="1" max="10"></div>
        <div class="field"><label for="f-rlo">Reps low</label><input type="number" id="f-rlo" value="${slot.reps[0]}" min="1"></div>
        <div class="field"><label for="f-rhi">Reps high</label><input type="number" id="f-rhi" value="${slot.reps[1]}" min="1"></div>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="f-metric">Counting</label>
          <select id="f-metric">${opt('reps', slot.metric, 'Reps')}${opt('seconds', slot.metric, 'Seconds')}${opt('meters', slot.metric, 'Meters')}</select>
        </div>
        <div class="field">
          <label for="f-perside">Per side</label>
          <select id="f-perside">${opt('no', slot.perSide ? 'yes' : 'no', 'No')}${opt('yes', slot.perSide ? 'yes' : 'no', 'Yes')}</select>
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="f-load">Load</label>
          <select id="f-load">${opt('external', slot.load, 'Weighted')}${opt('added', slot.load, 'BW + added')}${opt('none', slot.load, 'Bodyweight')}</select>
        </div>
        <div class="field">
          <label for="f-rir">Target RIR</label>
          <input type="text" id="f-rir" value="${esc(slot.rir)}" placeholder="2–3">
        </div>
        <div class="field">
          <label for="f-trackrir">Track RIR</label>
          <select id="f-trackrir">${opt('yes', slot.trackRIR ? 'yes' : 'no', 'Yes')}${opt('no', slot.trackRIR ? 'yes' : 'no', 'No')}</select>
        </div>
      </div>
      <div class="field-row">
        <div class="field"><label for="f-rest">Rest (seconds)</label><input type="number" id="f-rest" value="${slot.restSec}" min="0" step="5"></div>
        <div class="field"><label for="f-inc">Smallest jump (${esc(state.settings.unit)})</label><input type="number" id="f-inc" value="${slot.increment}" min="0" step="0.5"></div>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="f-prog">Progression</label>
          <select id="f-prog">${opt('load', slot.progression, 'Load (double progression)')}${opt('variation', slot.progression, 'Variation runway')}${opt('output', slot.progression, 'Output/quality')}${opt('none', slot.progression, 'None')}</select>
        </div>
        <div class="field">
          <label for="f-group">Superset group</label>
          <input type="text" id="f-group" value="${esc(slot.group || '')}" placeholder="blank = none">
        </div>
      </div>
      <div class="field">
        <label for="f-prognote">Progression note</label>
        <input type="text" id="f-prognote" value="${esc(slot.progressionNote)}" placeholder="e.g. Bilateral → single-leg → Nordics">
      </div>
      <div class="field">
        <label for="f-cue">Key cue</label>
        <input type="text" id="f-cue" value="${esc(slot.cue)}" placeholder="e.g. Upright torso, full depth">
      </div>
    </div>
    <button class="btn primary" data-act="save-slot" data-day="${dayId}" data-slot="${isNew ? 'new' : slot.id}" data-newid="${slot.id}">Save</button>
    ${isNew ? '' : `<button class="btn danger" data-act="delete-slot" data-day="${dayId}" data-slot="${slot.id}">Remove from program</button>`}`;
}

function viewSettings() {
  const s = state.settings;
  return `
    <button class="back" data-act="nav" data-to="#/">← Home</button>
    <div class="topbar"><div class="wordmark">Settings</div></div>
    <div class="card">
      <div class="setting-row">
        <div><div class="s-label">Block week</div><div class="s-sub">Week 4 = deload; advances after 2 sessions/week</div></div>
        <div class="stepper">
          <button data-act="week-step" data-dir="-1" aria-label="Week down">–</button>
          <span class="val">${s.week}</span>
          <button data-act="week-step" data-dir="1" aria-label="Week up">+</button>
        </div>
      </div>
      <div class="setting-row">
        <div><div class="s-label">Block</div><div class="s-sub">§5 mesocycle counter</div></div>
        <div class="stepper">
          <button data-act="block-step" data-dir="-1" aria-label="Block down">–</button>
          <span class="val">${s.block}</span>
          <button data-act="block-step" data-dir="1" aria-label="Block up">+</button>
        </div>
      </div>
      <div class="setting-row">
        <div><div class="s-label">Unit label</div><div class="s-sub">Label only — no conversion of logged numbers</div></div>
        <div class="seg">
          <button class="${s.unit === 'lb' ? 'on' : ''}" data-act="set-unit" data-v="lb">lb</button>
          <button class="${s.unit === 'kg' ? 'on' : ''}" data-act="set-unit" data-v="kg">kg</button>
        </div>
      </div>
      <div class="setting-row">
        <div><div class="s-label">Timer chime</div><div class="s-sub">Sound + vibration when rest ends</div></div>
        <div class="seg">
          <button class="${s.sound ? 'on' : ''}" data-act="set-sound" data-v="1">On</button>
          <button class="${!s.sound ? 'on' : ''}" data-act="set-sound" data-v="0">Off</button>
        </div>
      </div>
      <div class="setting-row">
        <div><div class="s-label">Keep screen awake</div><div class="s-sub">During a session, so the timer stays visible</div></div>
        <div class="seg">
          <button class="${s.wake ? 'on' : ''}" data-act="set-wake" data-v="1">On</button>
          <button class="${!s.wake ? 'on' : ''}" data-act="set-wake" data-v="0">Off</button>
        </div>
      </div>
    </div>
    <div class="section-head"><span class="eyebrow">Data</span></div>
    <div class="card">
      <div class="setting-row">
        <div><div class="s-label">Export everything</div><div class="s-sub">${s.lastExport ? 'Last export ' + fmtDate(s.lastExport, true) : 'Never exported — data lives only on this phone'}</div></div>
        <div class="seg"><button data-act="export">Export</button></div>
      </div>
      <div class="setting-row">
        <div><div class="s-label">Import</div><div class="s-sub">Replace everything with an exported backup</div></div>
        <div class="seg"><button data-act="nav" data-to="#/import">Import</button></div>
      </div>
    </div>
    <button class="btn danger" data-act="erase">Erase all data</button>
    <div class="footer-note">Strength Rebuild v${APP_VERSION} · ${state.sessions.length} sessions on record<br>Data lives in this browser. Export monthly, or before switching phones.</div>`;
}

function viewImport() {
  return `
    <button class="back" data-act="nav" data-to="#/settings">← Settings</button>
    <div class="topbar"><div class="wordmark">Import backup</div></div>
    <div class="card">
      <div class="field">
        <label for="import-json">Paste exported JSON</label>
        <textarea class="note" id="import-json" style="min-height:140px" placeholder='{"version":1, …}'></textarea>
        <div class="hint">This replaces the program, history, and settings on this device.</div>
      </div>
    </div>
    <button class="btn primary" data-act="import-confirm">Replace with this backup</button>`;
}

/* ============================== router ============================== */

function render() {
  const hash = location.hash || '#/';
  const parts = hash.replace(/^#\//, '').split('/');
  let html = '';
  if (hash === '#/' || hash === '') html = viewHome();
  else if (parts[0] === 'session') html = viewSession();
  else if (parts[0] === 'finish') html = viewFinish();
  else if (parts[0] === 'history') html = viewHistory();
  else if (parts[0] === 'session-log') html = viewSessionLog(parts[1]);
  else if (parts[0] === 'exercise') html = viewExercise(parts.slice(1).join('/'));
  else if (parts[0] === 'program') html = viewProgram();
  else if (parts[0] === 'slot') html = viewSlotEdit(parts[1], parts[2]);
  else if (parts[0] === 'settings') html = viewSettings();
  else if (parts[0] === 'import') html = viewImport();
  else html = viewHome();
  $('#app').innerHTML = html;
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', render);

/* ============================== actions ============================== */

let pendingErase = false;

document.addEventListener('click', (ev) => {
  // chart point tap
  const pt = ev.target.closest('[data-pt]');
  if (pt) {
    const wrap = ev.target.closest('.chart-wrap');
    const i = Number(pt.dataset.pt);
    const { pts } = seriesFor(wrap.dataset.ex);
    const p = pts[i];
    if (p) {
      const tip = $('#chart-tip');
      if (tip) tip.innerHTML = `<b>${fmtDate(p.t, true)}</b> — ${esc(fmtSets(p.entry.sets, p.entry.metric))}`;
    }
    return;
  }

  const el = ev.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;

  if (act !== 'erase') pendingErase = false;

  switch (act) {
    case 'nav':
      location.hash = el.dataset.to;
      break;

    case 'start-day':
      startSession(el.dataset.day);
      break;

    case 'log-set':
      logSet(el.dataset.slot, Number(el.dataset.set));
      break;

    case 'unlog-set': {
      const set = state.active.entries[el.dataset.slot].sets[Number(el.dataset.set)];
      set.done = false;
      save(); render();
      break;
    }

    case 'add-set': {
      const entry = state.active.entries[el.dataset.slot];
      const lastSet = entry.sets[entry.sets.length - 1];
      entry.sets.push({ w: lastSet ? lastSet.w : '', r: lastSet ? lastSet.r : '', rir: '', done: false, t: 0 });
      save(); render();
      break;
    }

    case 'remove-set': {
      const entry = state.active.entries[el.dataset.slot];
      for (let i = entry.sets.length - 1; i >= 0; i--) {
        if (!entry.sets[i].done) { entry.sets.splice(i, 1); break; }
      }
      if (!entry.sets.length) entry.sets.push({ w: '', r: '', rir: '', done: false, t: 0 });
      save(); render();
      break;
    }

    case 'toggle-note': {
      const box = $('#note-' + el.dataset.slot);
      if (box) {
        const show = box.style.display === 'none';
        box.style.display = show ? '' : 'none';
        if (show) box.querySelector('textarea').focus();
      }
      break;
    }

    case 'finish-session':
      finishSession(($('#session-note') || {}).value || '');
      break;

    case 'discard-session':
      if (confirm('Discard this session? Logged sets will be lost.')) {
        state.active = null;
        stopTimer(); releaseWakeLock(); save();
        location.hash = '#/';
      }
      break;

    case 'delete-session':
      if (confirm('Delete this session from history?')) {
        state.sessions = state.sessions.filter((s) => s.id !== el.dataset.id);
        save();
        location.hash = '#/history';
      }
      break;

    case 'timer-add':
      if (timer.endsAt) {
        timer.endsAt = Math.max(Date.now(), timer.endsAt) + 30000;
        timer.total += 30;
        timer.zeroFired = false;
        renderTimer();
      }
      break;

    case 'timer-stop':
      stopTimer();
      break;

    case 'clock-open':
      $('#clock').classList.remove('hidden');
      renderTimer();
      break;

    case 'clock-close':
      $('#clock').classList.add('hidden');
      break;

    case 'move-slot': {
      const day = findDay(el.dataset.day);
      const idx = day.slots.findIndex((s) => s.id === el.dataset.slot);
      const to = idx + Number(el.dataset.dir);
      if (to >= 0 && to < day.slots.length) {
        const [moved] = day.slots.splice(idx, 1);
        day.slots.splice(to, 0, moved);
        save(); render();
      }
      break;
    }

    case 'save-slot': {
      const day = findDay(el.dataset.day);
      const isNew = el.dataset.slot === 'new';
      const name = $('#f-name').value.trim();
      if (!name) { toast('Give the movement a name'); break; }
      const exId = slug(name);
      if (!state.exercises[exId]) state.exercises[exId] = { id: exId, name };
      const data = {
        id: isNew ? el.dataset.newid : el.dataset.slot,
        name, exerciseId: exId,
        pattern: $('#f-pattern').value.trim(),
        sets: Math.max(1, Number($('#f-sets').value) || 3),
        reps: [Math.max(1, Number($('#f-rlo').value) || 1), Math.max(1, Number($('#f-rhi').value) || 1)],
        rir: $('#f-rir').value.trim(),
        trackRIR: $('#f-trackrir').value === 'yes',
        load: $('#f-load').value,
        metric: $('#f-metric').value,
        perSide: $('#f-perside').value === 'yes',
        restSec: Math.max(0, Number($('#f-rest').value) || 0),
        progression: $('#f-prog').value,
        increment: Math.max(0, Number($('#f-inc').value) || 0),
        progressionNote: $('#f-prognote').value.trim(),
        cue: $('#f-cue').value.trim(),
        group: $('#f-group').value.trim() || undefined,
      };
      if (data.reps[1] < data.reps[0]) data.reps[1] = data.reps[0];
      if (isNew) day.slots.push(data);
      else {
        const idx = day.slots.findIndex((s) => s.id === el.dataset.slot);
        day.slots[idx] = data;
      }
      save();
      location.hash = '#/program';
      toast('Program updated');
      break;
    }

    case 'delete-slot': {
      if (!confirm('Remove this movement from the program? Its history stays.')) break;
      const day = findDay(el.dataset.day);
      day.slots = day.slots.filter((s) => s.id !== el.dataset.slot);
      save();
      location.hash = '#/program';
      break;
    }

    case 'week-step': {
      const w = state.settings.week + Number(el.dataset.dir);
      state.settings.week = Math.min(4, Math.max(1, w));
      save(); render();
      break;
    }

    case 'block-step': {
      const b = state.settings.block + Number(el.dataset.dir);
      state.settings.block = Math.max(1, b);
      save(); render();
      break;
    }

    case 'set-unit':
      state.settings.unit = el.dataset.v;
      save(); render();
      break;

    case 'set-sound':
      state.settings.sound = el.dataset.v === '1';
      save(); render();
      break;

    case 'set-wake':
      state.settings.wake = el.dataset.v === '1';
      if (!state.settings.wake) releaseWakeLock();
      save(); render();
      break;

    case 'export':
      exportData();
      break;

    case 'import-confirm': {
      try {
        const parsed = JSON.parse($('#import-json').value);
        if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.sessions) || !parsed.program) {
          toast('That does not look like a Strength Rebuild backup'); break;
        }
        state = parsed;
        save();
        location.hash = '#/';
        render();
        toast('Backup restored — ' + state.sessions.length + ' sessions');
      } catch (e) {
        toast('Could not parse that JSON');
      }
      break;
    }

    case 'erase':
      if (!pendingErase) {
        pendingErase = true;
        toast('Tap "Erase all data" again to confirm');
      } else {
        pendingErase = false;
        localStorage.removeItem(STORE_KEY);
        state = defaultState();
        save();
        location.hash = '#/';
        render();
        toast('Fresh start');
      }
      break;
  }
});

// Live-sync set inputs and notes into the active session.
document.addEventListener('input', (ev) => {
  const el = ev.target;
  if (!el.dataset || !state.active) return;
  if (el.dataset.in === 'set') {
    const entry = state.active.entries[el.dataset.slot];
    if (entry) {
      entry.sets[Number(el.dataset.set)][el.dataset.f] = el.value.trim();
      saveSoon();
    }
  } else if (el.dataset.in === 'note') {
    const entry = state.active.entries[el.dataset.slot];
    if (entry) { entry.note = el.value; saveSoon(); }
  }
});

/* ============================== export ============================== */

async function exportData() {
  const json = JSON.stringify(state, null, 1);
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `strength-rebuild-${stamp}.json`;
  let done = false;
  if (navigator.share && navigator.canShare) {
    try {
      const file = new File([json], filename, { type: 'application/json' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Strength Rebuild backup' });
        done = true;
      }
    } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  if (!done) {
    try {
      await navigator.clipboard.writeText(json);
      toast('Backup copied to clipboard — paste it somewhere safe');
      done = true;
    } catch (e) {}
  }
  if (!done) {
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
    done = true;
  }
  state.settings.lastExport = Date.now();
  save();
  render();
}

/* ============================== boot ============================== */

load();
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {});
}
render();
if (state.active) acquireWakeLock();
