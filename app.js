/* Strength Rebuild — gym companion
   Vanilla JS single-page app. State lives in localStorage; the program is
   editable data seeded from seed.js on first run. */

'use strict';

/* ============================== state ============================== */

const STORE_KEY = 'sr-state-v1';
const REPAIR_BACKUP_KEY = STORE_KEY + '.backup.prefill-repair';
const APP_VERSION = '1.8.0';

let state = null;

function slug(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'exercise';
}

function defaultState() {
  const s = {
    version: 1,
    // prefillRepairV1: a fresh state has no history to repair — mark it done.
    settings: { unit: 'lb', sound: true, wake: true, theme: 'auto', week: 1, block: 1, weekSessionCount: 0, lastExport: null, prefillRepairV1: true },
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

// Shape-check a state object before trusting it (boot load or import). Guards
// against a parseable-but-wrong blob bricking the app on the next render.
function validState(obj) {
  if (!obj || typeof obj !== 'object') return false;
  if (obj.version !== 1) return false;
  const s = obj.settings;
  if (!s || typeof s !== 'object') return false;
  if (s.unit == null || s.theme == null || s.week == null || s.block == null) return false;
  if (!obj.exercises || typeof obj.exercises !== 'object') return false;
  if (!obj.program || !Array.isArray(obj.program.days)) return false;
  if (!Array.isArray(obj.sessions)) return false;
  return true;
}

// One-time repair for the checked-but-blank habit: historical blank reps/weight
// are backfilled from the most recent PRIOR session's non-blank value for that
// set index (an entry's last set stands in past its length), and blank RIR
// inherits the set above within each entry — the same rules new sessions now
// follow (see lastLoggedSetValue and finishSession). The full pre-migration
// state is kept under REPAIR_BACKUP_KEY so this is reversible; the settings
// flag keeps it one-time, and the walk never touches non-blank values, so a
// re-run is a no-op anyway.
function runPrefillRepair() {
  if (state.settings.prefillRepairV1 === true) return;
  try { localStorage.setItem(REPAIR_BACKUP_KEY, JSON.stringify(state)); }
  catch (e) { return; }   // no backup written → leave history alone, retry next boot
  const blank = (v) => v === '' || v == null;
  state.sessions.forEach((sess, si) => {
    if (sess.week === 4) return;   // deload records stay as logged — never invent working loads there
    for (const entry of sess.entries) {
      entry.sets.forEach((set, i) => {
        if (!blank(set.r)) return;   // never touch a set that was really logged
        for (let j = si - 1; j >= 0; j--) {
          if (state.sessions[j].week === 4) continue;   // eased deload loads aren't a backfill source
          const prev = state.sessions[j].entries.find((e) => e.exerciseId === entry.exerciseId && e.sets.length);
          if (!prev) continue;
          const src = prev.sets[i] || prev.sets[prev.sets.length - 1];
          if (src && !blank(src.r)) {
            set.r = src.r;
            if (blank(set.w)) set.w = src.w;
            break;
          }
        }
      });
      let carry = '';
      for (const set of entry.sets) {
        if (!blank(set.rir)) carry = set.rir;
        else if (carry !== '') set.rir = carry;
      }
    }
  });
  state.settings.prefillRepairV1 = true;
  save();
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (validState(parsed)) { state = parsed; runPrefillRepair(); return; }
    }
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
// Flush a pending debounced write immediately so the last keystrokes survive the
// PWA being backgrounded or killed inside the 400ms debounce window.
function flushSave() { clearTimeout(saveTimer); save(); }
window.addEventListener('pagehide', flushSave);
document.addEventListener('visibilitychange', () => { if (document.hidden) flushSave(); });

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
  return fmtClock(sec);   // always m:ss (1:00, 1:45, 0:40, 2:50)
}

function metricUnit(slot) {
  return slot.metric === 'seconds' ? 's' : slot.metric === 'meters' ? 'm' : '';
}

function findDay(dayId) { return state.program.days.find((d) => d.id === dayId); }
function findSlot(day, slotId) { return day ? day.slots.find((s) => s.id === slotId) : null; }

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

// 'auto' follows the OS; 'light'/'dark' pin it. Keep the status-bar color in sync.
function applyTheme() {
  const t = (state && state.settings && state.settings.theme) || 'auto';
  const root = document.documentElement;
  if (t === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', t);
  const isLight = t === 'light' ||
    (t === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', isLight ? '#F4EFE6' : '#131518');
}

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

// Most recent NON-BLANK value for one set position of an exercise, scanned
// newest→oldest across all sessions. A checked-but-blank set (r === '') is
// skipped — keep looking further back. When setIndex is beyond an entry's
// length, that entry's last set stands in. Returns {w, r, rir} or null.
function lastLoggedSetValue(exerciseId, setIndex) {
  for (let i = state.sessions.length - 1; i >= 0; i--) {
    const sess = state.sessions[i];
    if (sess.week === 4) continue;   // snap-back: eased deload loads never become the baseline
    const entry = sess.entries.find((e) => e.exerciseId === exerciseId && e.sets.length);
    if (!entry) continue;
    const set = entry.sets[setIndex] || entry.sets[entry.sets.length - 1];
    if (set && set.r !== '' && set.r != null) return { w: set.w, r: set.r, rir: set.rir };
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

// Most recent *non-deload* entry — the working-weight baseline. Prefill reads
// from this so a deload week's eased loads never become the new normal (a
// deload is a dip, not a reset).
function lastNonDeloadEntryFor(exerciseId) {
  for (let i = state.sessions.length - 1; i >= 0; i--) {
    const sess = state.sessions[i];
    if (sess.week === 4) continue;
    const entry = sess.entries.find((e) => e.exerciseId === exerciseId && e.sets.length);
    if (entry) return { entry, session: sess };
  }
  return null;
}

// Deload week: suggest ~15% under the last working top set, rounded to the
// movement's smallest jump. Null for bodyweight movements or when there's no
// prior working load to ease from.
function deloadLoadFor(slot) {
  if (slot.load === 'none') return null;
  const base = lastNonDeloadEntryFor(slot.exerciseId);
  if (!base) return null;
  const topW = Math.max(...base.entry.sets.map((s) => Number(s.w) || 0));
  if (!topW) return null;
  const inc = slot.increment || 5;
  return Math.max(inc, Math.round((topW * 0.85) / inc) * inc);
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
  // A tracked-but-blank RIR can't confirm the set was left in the tank — treat
  // it as a fail so we don't nudge on unconfirmed effort.
  const allTop = sets.every((s) => Number(s.r) >= top && (!slot.trackRIR || (s.rir !== '' && s.rir != null && Number(s.rir) >= 2)));
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
let audioReady = false;
// iOS/Safari won't let the AudioContext reach "running" from resume() alone —
// a sound has to actually START inside a user gesture. So on every early tap we
// create the context, kick a silent 1-sample buffer, and resume; we keep the
// listeners attached (retrying) until the context is confirmed running.
function ensureAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
  }
  try {
    const buf = audioCtx.createBuffer(1, 1, 22050);
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    src.connect(audioCtx.destination);
    src.start(0);
  } catch (e) { /* already running / not needed */ }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  if (audioCtx.state === 'running') { audioReady = true; detachUnlock(); }
}
function detachUnlock() {
  ['pointerdown', 'touchend', 'click'].forEach((ev) => document.removeEventListener(ev, ensureAudio));
}
['pointerdown', 'touchend', 'click'].forEach((ev) => document.addEventListener(ev, ensureAudio, { passive: true }));

function chime() {
  if (!state.settings.sound) return;
  // Vibration (Android) is independent of audio unlock — fire it regardless.
  if (navigator.vibrate) { try { navigator.vibrate([180, 90, 180]); } catch (e) {} }
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  if (audioCtx.state !== 'running') return;   // still locked — nothing to play
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
  renderClockTick();
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
        <button data-act="timer-sub">−30s</button>
        <button data-act="timer-add">+30s</button>
        <button data-act="timer-stop">Skip</button>
        <button data-act="clock-close">Back to sets</button>
      </div>`;
  }
  renderClockTick();
}

setInterval(() => {
  if (timer.endsAt) renderTimer();
}, 500);

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    if (timer.endsAt) renderTimer();
    acquireWakeLock();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  }
});


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
    const deload = state.settings.week === 4;
    const nudge = deload ? null : nudgeFor(slot);
    const deloadW = deload ? deloadLoadFor(slot) : null;
    const easeLoad = deload && deloadW != null;
    const nSets = Math.max(1, slot.sets - (deload ? 1 : 0));
    const sets = [];
    for (let i = 0; i < nSets; i++) {
      // Per-set fallback: a set left blank last session pre-fills from the most
      // recent session where it WAS logged — skipping deload sessions, so eased
      // loads never become the baseline (snap-back lives in the helper).
      const prev = lastLoggedSetValue(slot.exerciseId, i);
      sets.push({
        w: easeLoad ? String(deloadW)
           : (nudge && nudge.type === 'load' ? String(nudge.weight)
           : (prev && prev.w != null ? String(prev.w) : '')),
        r: nudge && nudge.type === 'load' ? String(slot.reps[0]) : (prev && prev.r != null ? String(prev.r) : ''),
        rir: '',
        done: false, t: 0,
        deload: easeLoad,
      });
    }
    entries[slot.id] = { exerciseId: slot.exerciseId, sets, note: '' };
  }
  state.active = { dayId, startedAt: Date.now(), week: state.settings.week, block: state.settings.block, entries };
  clockPanel = null;
  save();
  acquireWakeLock();
  location.hash = '#/outline';
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

// "Next up" scans the work order forward from the set just logged, so it points
// to what you'd naturally do next (the next set of this lift, or its superset
// partner) rather than the earliest unfinished set. Wraps to catch skipped work.
function nextPending(day, after) {
  const order = workOrder(day);
  const notDone = (item) => !state.active.entries[item.slot.id].sets[item.setIdx].done;
  let start = 0;
  if (after) {
    const i = order.findIndex((it) => it.slot.id === after.slotId && it.setIdx === after.setIdx);
    if (i >= 0) start = i + 1;
  }
  for (let j = start; j < order.length; j++) if (notDone(order[j])) return order[j];
  for (let j = 0; j < start; j++) if (notDone(order[j])) return order[j];
  return null;
}

// Most recently logged set (by timestamp) — the clock and outline continue the
// work order from here, so an out-of-order jump keeps its place after logging
// instead of snapping back to the earliest unfinished set. Derived from
// persisted data, so it survives a reload mid-session.
function lastLoggedRef() {
  let ref = null, t = 0;
  for (const id in state.active.entries) {
    state.active.entries[id].sets.forEach((s, i) => {
      if (s.done && s.t > t) { t = s.t; ref = { slotId: id, setIdx: i }; }
    });
  }
  return ref;
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
  const next = nextPending(day, { slotId, setIdx });
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
  // Non-numeric entries must never reach storage — NaN becomes null after a
  // JSON round-trip and silently rewrites the displayed history.
  const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : ''; };
  for (const slot of day.slots) {
    const entry = state.active.entries[slot.id];
    if (!entry) continue;
    // RIR inherits the set above: rating set 1 and leaving the rest blank is
    // the common habit, and an unrated tail would block nudgeFor (it needs
    // every set at RIR ≥ 2). The first set has nothing above — stays as-is.
    let carryRIR = '';
    const done = entry.sets.filter((s) => s.done).map((s) => {
      let rir = slot.trackRIR ? num(s.rir) : '';
      if (slot.trackRIR) {
        if (rir === '') rir = carryRIR;
        else carryRIR = rir;
      }
      return {
        w: slot.load === 'none' ? '' : num(s.w),
        r: num(s.r),
        rir,
      };
    });
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

  // Auto-advance the block calendar after the 2nd session of the week. A
  // dedicated counter (not an all-time session filter) so import / re-enter /
  // delete can't desync advancement from the visible calendar.
  const { week, block } = state.settings;
  const count = (state.settings.weekSessionCount || 0) + 1;
  let advanced = '';
  if (count >= 2) {
    state.settings.weekSessionCount = 0;
    if (week >= 4) { state.settings.week = 1; state.settings.block = block + 1; advanced = `Block ${block + 1}, Week 1`; }
    else { state.settings.week = week + 1; advanced = `Week ${week + 1}${week + 1 === 4 ? ' — deload' : ''}`; }
  } else {
    state.settings.weekSessionCount = count;
  }
  save();
  location.hash = '#/';
  toast(advanced ? `Session saved · advanced to ${advanced}` : 'Session saved');
}

// A resumed session that's been idle for hours is yesterday's session, not a
// live one. Instead of silently continuing its clock, the active-session routes
// pause on one explicit choice — continue / save / discard — because logged
// sets are real data and must never be thrown away without a decision.
const STALE_AFTER_MS = 6 * 3600 * 1000;
let staleAcked = false;   // per-app-run; logging any set moves lastActivityAt forward anyway

function lastActivityAt() {
  let t = state.active.startedAt;
  for (const id in state.active.entries) {
    for (const s of state.active.entries[id].sets) if (s.done && s.t > t) t = s.t;
  }
  return t;
}

function sessionIsStale() {
  return !!state.active && !staleAcked && Date.now() - lastActivityAt() > STALE_AFTER_MS;
}

function viewStaleResume() {
  const day = findDay(state.active.dayId);
  let doneSets = 0;
  for (const id in state.active.entries) doneSets += state.active.entries[id].sets.filter((s) => s.done).length;
  const hrs = Math.max(1, Math.round((Date.now() - lastActivityAt()) / 3600000));
  const ago = hrs >= 48 ? `${Math.round(hrs / 24)} days` : `${hrs} h`;
  return `
    <button class="back" data-act="nav" data-to="#/">← Home</button>
    <div class="topbar"><div class="wordmark">Still going?</div></div>
    <div class="card">
      <div class="eyebrow">In progress · started ${fmtDate(state.active.startedAt)}</div>
      <div class="day-name">${esc(day ? day.name : 'Session')}</div>
      <div class="day-sub">Last activity ~${ago} ago${doneSets ? ` · ${doneSets} set${doneSets === 1 ? '' : 's'} logged — safe either way` : ' · nothing logged yet'}.</div>
    </div>
    <button class="btn primary" data-act="stale-continue">Continue where you left off</button>
    ${doneSets ? `<button class="btn" data-act="stale-finish">Finish &amp; save what's logged</button>` : ''}
    <button class="btn quiet" data-act="discard-session">Discard session</button>`;
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
    `<circle class="chart-dot" cx="${x(i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="4.5" fill="var(--brass-chart)" stroke="var(--card)" stroke-width="2" data-pt="${i}"/>
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
  // No brass on the pill in deload — the banner and slot cards already carry it;
  // three stacked brass elements read as busy. The "· deload" text still marks it.
  return `<button class="pill" data-act="nav" data-to="#/settings">Wk ${week} · Blk ${block}${deload ? ' · deload' : ''}</button>`;
}

function viewHome() {
  const lastSess = state.sessions[state.sessions.length - 1];
  const suggestId = lastSess && lastSess.dayId === 'dayA' ? 'dayB' : 'dayA';
  const days = [...state.program.days].sort((a, b) => (a.id === suggestId ? -1 : b.id === suggestId ? 1 : 0));

  const resume = state.active ? `
    <button class="card day-start suggested" data-act="nav" data-to="#/clock">
      <div class="eyebrow">In progress · started ${fmtDate(state.active.startedAt)}</div>
      <div class="day-name">Resume session</div>
      <div class="day-sub">${esc((findDay(state.active.dayId) || {}).name || '')} — pick up where you left off</div>
      <span class="go">Continue →</span>
    </button>` : '';

  const dayCards = state.active ? '' : days.map((day) => {
    const suggested = day.id === suggestId;
    const preview = day.slots.map((s) => s.name).join(' · ');
    return `
      <button class="card day-start tappable ${suggested ? 'suggested' : ''}" data-act="start-day" data-day="${day.id}">
        <div class="eyebrow">${suggested ? (lastSess ? 'Up next' : 'Start here') : 'Or'}</div>
        <div class="day-name">${esc(day.name)}</div>
        <div class="day-sub">${esc(day.subtitle)}</div>
        ${suggested
          ? `<div class="day-preview">${esc(preview)}</div><span class="go">Start session →</span>`
          : `<span class="go quiet">Start →</span>`}
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
  const repsPh = slot.reps[0] === slot.reps[1] ? slot.reps[0] + unit : `${slot.reps[0]}–${slot.reps[1]}${unit}`;
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
      ${noLoad ? '' : `<input type="text"${set.deload ? ' class="deload-w"' : ''} inputmode="decimal" value="${esc(set.w)}" placeholder="—" data-in="set" data-slot="${slot.id}" data-set="${i}" data-f="w" ${set.done ? 'readonly' : ''}>`}
      <input type="text" inputmode="numeric" value="${esc(set.r)}" placeholder="${repsPh}" data-in="set" data-slot="${slot.id}" data-set="${i}" data-f="r" ${set.done ? 'readonly' : ''}>
      ${noRIR ? '' : `<input type="text" inputmode="numeric" value="${esc(set.rir)}" placeholder="${deload ? '4–5' : esc(slot.rir) || '—'}" data-in="set" data-slot="${slot.id}" data-set="${i}" data-f="rir" ${set.done ? 'readonly' : ''}>`}
      <button class="log" data-act="${set.done ? 'unlog-set' : 'log-set'}" data-slot="${slot.id}" data-set="${i}" aria-label="${set.done ? 'Undo set' : 'Log set'}">✓</button>
    </div>`).join('');
  return labels + rows;
}

// The sheet folded into the route — stops expand in place to the same editor
// (see viewOutline). The old URL redirects so muscle memory keeps working.
function viewSession() {
  location.hash = state.active ? '#/outline' : '#/';
  return '';
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
    <button class="back" data-act="nav" data-to="#/outline">← Back to the route</button>
    <div class="card">
      <div class="eyebrow">Finish ${esc(day.name)}</div>
      <div class="day-name" style="font-size:28px">${logged} of ${total} sets logged</div>
      <div class="day-sub">${esc(day.subtitle)}</div>
      <div class="note-box">
        <textarea class="note" id="session-note" placeholder="Session note — energy, sleep, what to change next time… (optional)"></textarea>
      </div>
    </div>
    <button class="btn primary" data-act="finish-session">Save session</button>
    <button class="btn quiet" data-act="nav" data-to="#/clock">Keep training</button>
    <button class="btn danger" data-act="discard-session">Discard session</button>`;
}

/* ==================== outline & clock (in-session front end) ==================== */

// Expanded log panel on the #/clock route: {slotId, setIdx} or null (calm state).
// Route-local — render() clears it whenever the hash leaves #/clock.
let clockPanel = null;

// Route-stop jump target: {slotId, setIdx} or null (follow the work order).
// Pins that set on the clock's deck; dissolves once it's logged or on leaving
// the clock route, and the order continues from wherever was logged last.
let clockJump = null;

// Which route stop is expanded to its in-place editor (the old sheet's grid):
// the stop's first slot id, or null. One at a time; local to the #/outline route.
let outlineOpen = null;

// Rough session length: every remaining set costs its rest plus ~45s of work,
// rounded to the nearest 5 minutes.
function estMinutes(sec) {
  return Math.max(5, Math.round(sec / 300) * 5);
}

// One-line pre-fill summary for the on-deck card ("148 lb × 5 /side" or why it's blank).
function clockPrefillLine(slot, set) {
  if (set.r === '' || set.r == null) {
    return lastEntryFor(slot.exerciseId) ? 'left blank last time — nothing to pre-fill' : 'first time — no history yet';
  }
  const parts = [];
  if (slot.load !== 'none' && set.w !== '' && set.w != null) parts.push(set.w + ' ' + state.settings.unit);
  parts.push('× ' + set.r + metricUnit(slot));
  return parts.join(' ') + (slot.perSide ? ' /side' : '');
}

function prevSetStr(slot, prev) {
  const parts = [];
  if (slot.load !== 'none' && prev.w !== '' && prev.w != null) parts.push(prev.w + ' ' + state.settings.unit);
  parts.push('× ' + prev.r + metricUnit(slot));
  let s = parts.join(' ');
  if (slot.trackRIR && prev.rir !== '' && prev.rir != null) s += ' @ ' + prev.rir + ' RIR';
  return s + (slot.perSide ? ' /side' : '');
}

function viewOutline() {
  if (!state.active) { location.hash = '#/'; return ''; }
  const day = findDay(state.active.dayId);
  const deload = state.active.week === 4;
  const unit = state.settings.unit;
  const running = timer.endsAt > Date.now();
  const remain = running ? (timer.endsAt - Date.now()) / 1000 : 0;

  // Stops in work order: a superset group is ONE stop with A/B rows.
  const handled = new Set();
  const stops = [];
  for (const slot of day.slots) {
    if (handled.has(slot.id)) continue;
    const group = slot.group ? day.slots.filter((s) => s.group === slot.group) : [slot];
    group.forEach((s) => handled.add(s.id));
    const withEntries = group.filter((s) => state.active.entries[s.id]);
    if (withEntries.length) stops.push(withEntries);
  }

  let totalSets = 0, doneSets = 0, totalSec = 0, remainSec = 0, movements = 0;
  for (const slot of day.slots) {
    const e = state.active.entries[slot.id];
    if (!e) continue;
    movements++;
    for (const s of e.sets) {
      totalSets++;
      totalSec += slot.restSec + 45;
      if (s.done) doneSets++;
      else remainSec += slot.restSec + 45;
    }
  }
  const started = doneSets > 0;
  const current = nextPending(day, lastLoggedRef());

  const rxLine = (slot, entry) => {
    const u = metricUnit(slot);
    const repsTxt = slot.reps[0] === slot.reps[1] ? slot.reps[0] + u : `${slot.reps[0]}–${slot.reps[1]}${u}`;
    let t = `${entry.sets.length} × ${repsTxt}`;
    if (slot.perSide) t += ' /side';
    if (slot.trackRIR) t += ` @ ${deload ? '4–5' : esc(slot.rir)}`;
    if (slot.restSec) t += ` · rest ${fmtRest(slot.restSec)}`;
    return t;
  };
  const tagFor = (slot) => {
    if (deload) return slot.load !== 'none' ? `&nbsp;<span class="rtag dl">▼ deload</span>` : '';
    const n = nudgeFor(slot);
    if (n && n.type === 'load') return `&nbsp;<span class="rtag">▲ +${slot.increment || 5} ${esc(unit)}</span>`;
    if (n && n.type === 'variation') return `&nbsp;<span class="rtag">▲ variation</span>`;
    return '';
  };
  const dotsFor = (slot, entry) => {
    const dots = entry.sets.map((s) => `<i${s.done ? ' class="f"' : ''}></i>`).join('');
    const pill = running && current && current.slot.id === slot.id
      ? `<span class="restpill" id="ol-restpill">Resting ${fmtClock(remain)}</span>` : '';
    return `<div class="dots">${dots}${pill}</div>`;
  };

  const order = workOrder(day);
  let doneStops = 0;

  // Expanded stop: the old sheet's editor, in place on the rail. Grid, ± set,
  // note, and history live here; "On the clock ▸" hands the stop's earliest
  // undone set to the clock (supersets interleave via the work order).
  const openStopHTML = (group, node, isCur) => {
    const target = order.find((it) =>
      group.some((s) => s.id === it.slot.id) && !state.active.entries[it.slot.id].sets[it.setIdx].done);
    const sections = group.map((s, gi) => {
      const entry = state.active.entries[s.id];
      const last = lastEntryFor(s.exerciseId);
      const nudge = deload ? null : nudgeFor(s);
      const noteOpen = entry.note !== '';
      return `
        ${group.length > 1 ? `<div class="x-sub"><span class="ab">${String.fromCharCode(65 + gi)}</span>${esc(s.name)}<span class="x-subrx">${rxLine(s, entry)}</span></div>` : ''}
        <div class="sets">${setRowsHTML(s, entry, deload)}</div>
        ${nudge ? `<div class="nudge"><span class="tag">${nudge.type === 'load' ? 'Progression earned' : 'Variation ready'}</span>${esc(nudge.text)}</div>` : ''}
        ${last ? `<div class="lastline">Last (${fmtDate(last.session.startedAt)}): <b>${esc(fmtSets(last.entry.sets, s.metric))}</b>${last.entry.note ? ` — <i>${esc(last.entry.note)}</i>` : ''}</div>` : ''}
        ${deload && entry.sets.some((x) => x.deload) ? `<div class="deload-note">✱ Deload loads — eased ~15%, shown in green. Ease into 4–5 RIR.</div>` : ''}
        <div class="x-foot">
          <span>
            <button class="linklike" data-act="toggle-note" data-slot="${s.id}">${noteOpen ? 'note ↓' : '+ note'}</button>
            &nbsp;&nbsp;
            <button class="linklike" data-act="nav" data-to="#/exercise/${s.exerciseId}">history</button>
          </span>
          <span>
            <button class="linklike" data-act="remove-set" data-slot="${s.id}">– set</button>
            &nbsp;&nbsp;
            <button class="linklike" data-act="add-set" data-slot="${s.id}">+ set</button>
          </span>
        </div>
        <div class="note-box" style="${noteOpen ? '' : 'display:none'}" id="note-${s.id}">
          <textarea class="note" placeholder="How did it feel? Anything for next time…" data-in="note" data-slot="${s.id}">${esc(entry.note)}</textarea>
        </div>`;
    }).join('');
    const head = group.length > 1
      ? `<div class="st-tie">Superset · alternate</div>`
      : `<div class="st-name">${esc(group[0].name)}</div>
         <div class="st-rx">${rxLine(group[0], state.active.entries[group[0].id])}${tagFor(group[0])}</div>`;
    return `
      <div class="stop open${isCur ? ' cur' : target ? '' : ' done'}">
        <div class="node">${node}</div>
        <div class="x-head">
          <button class="x-collapse" data-act="ol-toggle" data-key="${group[0].id}" aria-expanded="true">${head}</button>
          ${target ? `<button class="x-clock" data-act="ol-jump" data-slot="${target.slot.id}" data-set="${target.setIdx}">On the clock ▸</button>` : ''}
        </div>
        ${sections}
      </div>`;
  };

  const stopHTML = stops.map((group, idx) => {
    const allDone = group.every((s) => state.active.entries[s.id].sets.every((x) => x.done));
    if (allDone) doneStops++;
    const isCur = !allDone && current && group.some((s) => s.id === current.slot.id);
    const node = allDone ? '✓' : String(idx + 1);
    if (outlineOpen === group[0].id) return openStopHTML(group, node, isCur);
    let body;
    if (group.length > 1) {
      body = `<div class="st-tie">Superset · alternate</div>` + group.map((s, gi) => `
        <div class="st-sub">
          <div class="st-name"><span class="ab">${String.fromCharCode(65 + gi)}</span>${esc(s.name)}</div>
          <div class="st-rx">${rxLine(s, state.active.entries[s.id])}${tagFor(s)}</div>
          ${dotsFor(s, state.active.entries[s.id])}
        </div>`).join('');
    } else {
      const s = group[0];
      body = `
        <div class="st-name">${esc(s.name)}</div>
        <div class="st-rx">${rxLine(s, state.active.entries[s.id])}${tagFor(s)}</div>
        ${dotsFor(s, state.active.entries[s.id])}`;
    }
    // Every stop opens in place — done ones included (that's where a logged
    // set gets fixed now that the sheet is gone).
    return `<button class="stop${allDone ? ' done' : isCur ? ' cur' : ''}" data-act="ol-toggle" data-key="${group[0].id}" aria-expanded="false">
      <div class="node">${node}</div>${body}<span class="st-go">›</span></button>`;
  }).join('');

  // Elapsed reads in minutes only while minutes mean something: hours past
  // 90 min, gone entirely past the stale threshold — "min left" does the pacing.
  const elapsedMin = Math.max(1, Math.round((Date.now() - state.active.startedAt) / 60000));
  const elapsedChip = elapsedMin > 360 ? ''
    : `<span class="pill">${elapsedMin >= 90 ? (elapsedMin / 60).toFixed(1).replace(/\.0$/, '') + ' h' : elapsedMin + ' min'} in</span>`;
  const chips = started
    ? `${elapsedChip}<span class="pill brass">~${estMinutes(remainSec)} min left</span>`
    : `<span class="pill brass">Est ~${estMinutes(totalSec)} min</span><span class="pill">${stops.length} stops · ${movements} movements</span>`;
  const primary = current
    ? (started
      ? `<button class="btn primary" data-act="nav" data-to="#/clock">Return to clock</button>`
      : `<button class="btn primary" data-act="nav" data-to="#/clock">Start ▸ ${esc(current.slot.name)}</button>`)
    : `<button class="btn primary" data-act="nav" data-to="#/finish">Finish session</button>`;

  return `
    <button class="back" data-act="nav" data-to="#/">← Home</button>
    <div class="outline-head">
      <div class="eyebrow">Week ${state.active.week} · Block ${state.active.block}${deload ? ' · deload' : ''}</div>
      <div class="ol-title">${esc(day.name)}</div>
      <div class="ol-sub">${esc(day.subtitle)}${started ? ` · ${doneStops} of ${stops.length} stops done` : ''}</div>
      <div class="ol-chips">${chips}</div>
    </div>
    <div class="route">${stopHTML}</div>
    ${primary}
    ${current && started ? `<button class="btn quiet" data-act="nav" data-to="#/finish">Finish early</button>` : ''}`;
}

// RIR chips: 4+/2–3/0–1 storing '4'/'2'/'1'. The slot's target gets a dashed
// brass ring until any chip is chosen (then only the selection reads brass).
function rirRowHTML(slot, set, setIdx, deload) {
  const opts = [
    { v: '4', lab: '4+', hint: 'easy' },
    { v: '2', lab: '2–3', hint: 'on target' },
    { v: '1', lab: '0–1', hint: 'near max' },
  ];
  const m = String(deload ? '4–5' : slot.rir || '').match(/\d+/);
  const n = m ? Number(m[0]) : 2;
  const targetV = n <= 1 ? '1' : n >= 4 ? '4' : '2';
  const cur = set.rir === '' || set.rir == null ? NaN : Number(set.rir);
  const onV = Number.isFinite(cur) ? (cur >= 4 ? '4' : cur <= 1 ? '1' : '2') : null;
  return `<div class="rir-row${onV ? ' has-on' : ''}">` + opts.map((o) => `
    <button data-act="cl-rir" data-slot="${slot.id}" data-set="${setIdx}" data-v="${o.v}"
      class="${o.v === targetV ? 'target' : ''}${o.v === onV ? ' on' : ''}"
      aria-pressed="${o.v === onV ? 'true' : 'false'}">${o.lab}<span class="hint">${o.hint}</span></button>`).join('') + `</div>`;
}

// Provenance for the expanded panel — where this set's pre-fill came from.
// app.js sets carry no src field, so derive it from the engine.
function clockProvHTML(slot, set, setIdx, deload) {
  if (deload) {
    return `<div class="prov"><span class="cl-deloadtag">▼ Deload</span>${slot.load !== 'none' && set.deload ? 'Load eased ~15%. ' : ''}Leave 4–5 in the tank — re-groove, don't push.</div>`;
  }
  const nudge = nudgeFor(slot);
  if (nudge && nudge.type === 'load') return `<div class="prov nudge"><b>Progression earned.</b> ${esc(nudge.text)}</div>`;
  if (nudge && nudge.type === 'variation') return `<div class="prov nudge"><b>Variation ready.</b> ${esc(nudge.text)}</div>`;
  const last = lastEntryFor(slot.exerciseId);
  if (set.r === '' || set.r == null) {
    if (!last) return `<div class="prov">No history yet for this movement.</div>`;
    return `<div class="prov blank"><span class="pbadge">—</span><b>Was left blank last time.</b> Nothing to carry forward — this set starts from empty.</div>`;
  }
  const prev = lastLoggedSetValue(slot.exerciseId, setIdx);
  if (prev) return `<div class="prov"><b>Last time:</b> ${esc(prevSetStr(slot, prev))} — carried forward.</div>`;
  if (!last) return `<div class="prov">No history yet for this movement.</div>`;
  return '';
}

function clockPanelHTML(day) {
  const { slotId, setIdx } = clockPanel;
  const slot = findSlot(day, slotId);
  const entry = state.active.entries[slotId];
  const set = entry.sets[setIdx];
  const deload = state.active.week === 4;
  const unit = state.settings.unit;
  const running = timer.endsAt > Date.now();
  const remain = running ? (timer.endsAt - Date.now()) / 1000 : 0;
  const noteOpen = entry.note !== '';
  const repLabel = slot.metric === 'seconds' ? 'Seconds' : slot.metric === 'meters' ? 'Meters' : 'Reps';
  return `
    <div class="clockview logging">
      <div class="cl-log">
        <div class="cl-pill${running ? '' : ' idle'}" id="cl-pill">${running ? `Resting <span id="cl-pilltime">${fmtClock(remain)}</span>` : 'Logging'}</div>
        <div class="mv">${esc(slot.name)}</div>
        <div class="setof">Set ${setIdx + 1} of ${entry.sets.length}</div>
        ${slot.cue ? `<div class="cue">${esc(slot.cue)}</div>` : ''}
        ${clockProvHTML(slot, set, setIdx, deload)}
        <div class="cl-fields">
          ${slot.load === 'none' ? '' : `
          <div class="cl-field">
            <div class="flabel">Load</div>
            <div class="cl-stepper">
              <button data-act="cl-load" data-slot="${slot.id}" data-set="${setIdx}" data-dir="-1" aria-label="Less load">−</button>
              <span class="v${set.w === '' ? ' empty' : ''}"><span id="cl-loadval">${set.w === '' ? '—' : esc(set.w)}</span><small>${slot.load === 'added' ? '+' : ''}${esc(unit)}</small></span>
              <button data-act="cl-load" data-slot="${slot.id}" data-set="${setIdx}" data-dir="1" aria-label="More load">+</button>
            </div>
          </div>`}
          <div class="cl-field">
            <div class="flabel">${repLabel}${slot.perSide ? ' /side' : ''}</div>
            <div class="cl-stepper">
              <button data-act="cl-rep" data-slot="${slot.id}" data-set="${setIdx}" data-dir="-1" aria-label="Fewer">−</button>
              <span class="v${set.r === '' ? ' empty' : ''}"><span id="cl-repval">${set.r === '' ? '—' : esc(set.r)}</span></span>
              <button data-act="cl-rep" data-slot="${slot.id}" data-set="${setIdx}" data-dir="1" aria-label="More">+</button>
            </div>
          </div>
          ${slot.trackRIR ? `
          <div class="cl-field cl-rir">
            <div class="flabel">Left in the tank · RIR <span class="target-hint">(target ${deload ? '4–5' : esc(slot.rir) || '2–3'})</span></div>
            <div id="cl-rirwrap">${rirRowHTML(slot, set, setIdx, deload)}</div>
          </div>` : ''}
        </div>
        <button class="btn primary" id="cl-logbtn" data-act="cl-log" data-slot="${slot.id}" data-set="${setIdx}" style="margin-top:16px">Log &amp; rest</button>
        <div class="cl-subrow">
          <button class="linklike" data-act="toggle-note" data-slot="${slot.id}">${noteOpen ? 'note ↓' : '+ note'}</button>
          <button class="linklike" data-act="cl-collapse">&#8617;&#xFE0E; back to clock</button>
        </div>
        <div class="note-box" style="${noteOpen ? '' : 'display:none'}" id="note-${slot.id}">
          <textarea class="note cl-note" placeholder="How did it feel? Anything for next time…" data-in="note" data-slot="${slot.id}">${esc(entry.note)}</textarea>
        </div>
      </div>
    </div>`;
}

function viewClock() {
  if (!state.active) { location.hash = '#/'; return ''; }
  const day = findDay(state.active.dayId);
  if (clockJump) {
    const e = state.active.entries[clockJump.slotId];
    const s = e && e.sets[clockJump.setIdx];
    if (!s || s.done || !findSlot(day, clockJump.slotId)) clockJump = null;
  }
  const next = clockJump
    ? { slot: findSlot(day, clockJump.slotId), setIdx: clockJump.setIdx }
    : nextPending(day, lastLoggedRef());
  if (!next) { location.hash = '#/finish'; return ''; }

  // Stale-panel guard: the referenced set must still exist and be un-logged.
  if (clockPanel) {
    const e = state.active.entries[clockPanel.slotId];
    const s = e && e.sets[clockPanel.setIdx];
    if (!s || s.done) clockPanel = null;
  }
  if (clockPanel) return clockPanelHTML(day);

  const slot = next.slot;
  const entry = state.active.entries[slot.id];
  const set = entry.sets[next.setIdx];
  const running = timer.endsAt > Date.now();
  const atZero = timer.endsAt > 0 && !running;
  const remain = running ? (timer.endsAt - Date.now()) / 1000 : 0;
  const frac = running && timer.total ? Math.max(0, remain / timer.total) : 0;
  const blank = set.r === '' || set.r == null;
  return `
    <div class="clockview">
      <div class="eyebrow" id="cl-lbl">${running ? 'Rest' : atZero ? 'Rest done — next set ready' : 'Ready'}</div>
      <div class="cl-big${running ? '' : ' zero'}" id="cl-big">${running ? fmtClock(remain) : 'GO'}</div>
      <div class="cl-drain"><div class="fill" id="cl-drainfill" style="width:${(frac * 100).toFixed(1)}%"></div></div>
      <button class="cl-ondeck${blank ? ' blankflag' : ''}" id="cl-ondeck" data-act="cl-expand" data-slot="${slot.id}" data-set="${next.setIdx}">
        <span class="lbl">On deck · set ${next.setIdx + 1} of ${entry.sets.length}</span>
        <span class="mv">${esc(slot.name)}</span>
        <span class="det">${esc(clockPrefillLine(slot, set))}</span>
        <span class="tap">tap to log ▸</span>
      </button>
      <div class="cl-btns">
        <button data-act="timer-sub">−30s</button>
        <button data-act="timer-add">+30s</button>
        <button data-act="timer-stop">Skip rest</button>
      </div>
      <div class="cl-btns">
        <button data-act="nav" data-to="#/outline">Route</button>
      </div>
    </div>`;
}

// Live updates for the #/clock route and the outline's resting pill. Cheap
// no-op off those routes; called from renderTimer's tick and stopTimer.
function renderClockTick() {
  const running = timer.endsAt > Date.now();
  const remain = running ? (timer.endsAt - Date.now()) / 1000 : 0;
  const big = $('#cl-big');
  if (big) {
    const atZero = timer.endsAt > 0 && !running;
    big.textContent = running ? fmtClock(remain) : 'GO';
    big.classList.toggle('zero', !running);
    const lbl = $('#cl-lbl');
    if (lbl) lbl.textContent = running ? 'Rest' : atZero ? 'Rest done — next set ready' : 'Ready';
    const fill = $('#cl-drainfill');
    if (fill) fill.style.width = ((running && timer.total ? Math.max(0, remain / timer.total) : 0) * 100).toFixed(1) + '%';
  }
  const pill = $('#cl-pill');
  if (pill) {
    if (running) { pill.classList.remove('idle'); pill.innerHTML = `Resting <span id="cl-pilltime">${fmtClock(remain)}</span>`; }
    else if (!pill.classList.contains('idle')) { pill.classList.add('idle'); pill.textContent = 'Logging'; }
  }
  const op = $('#ol-restpill');
  if (op) {
    if (running) op.textContent = 'Resting ' + fmtClock(remain);
    else op.style.display = 'none';
  }
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
  return `
    <button class="back" data-act="nav" data-to="#/history">← History</button>
    <div class="card">
      <div class="h-date" style="font-family:var(--display);font-weight:600;font-size:22px;text-transform:uppercase">${fmtDate(s.startedAt, true)}</div>
      <div class="h-meta" style="color:var(--dim);font-size:13.5px">${esc(s.dayName)} · Wk ${s.week}, Blk ${s.block}</div>
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
          <div class="ps-name">${esc(slot.name)}</div>
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
          <select id="f-prog">${opt('load', slot.progression, 'Double progression')}${opt('variation', slot.progression, 'Variation runway')}${opt('output', slot.progression, 'Output/quality')}${opt('none', slot.progression, 'None')}</select>
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
        <div><div class="s-label">Block</div><div class="s-sub">Resets to week 1 each new block</div></div>
        <div class="stepper">
          <button data-act="block-step" data-dir="-1" aria-label="Block down">–</button>
          <span class="val">${s.block}</span>
          <button data-act="block-step" data-dir="1" aria-label="Block up">+</button>
        </div>
      </div>
      <div class="setting-row">
        <div><div class="s-label">Theme</div><div class="s-sub">Auto follows your phone's light/dark setting</div></div>
        <div class="seg">
          <button class="${s.theme === 'auto' ? 'on' : ''}" data-act="set-theme" data-v="auto">Auto</button>
          <button class="${s.theme === 'light' ? 'on' : ''}" data-act="set-theme" data-v="light">Light</button>
          <button class="${s.theme === 'dark' ? 'on' : ''}" data-act="set-theme" data-v="dark">Dark</button>
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
        <div><div class="s-label">Test chime</div><div class="s-sub">Play it now — also primes sound for the session</div></div>
        <div class="seg"><button data-act="test-chime">Play</button></div>
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

let lastHash = null;

function render() {
  const hash = location.hash || '#/';
  const parts = hash.replace(/^#\//, '').split('/');
  let html = '';
  if (parts[0] !== 'clock') { clockPanel = null; clockJump = null; }   // both are local to the clock route
  if (parts[0] !== 'outline') outlineOpen = null;                      // stop expansion is local to the route
  document.body.classList.toggle('route-clock', parts[0] === 'clock');
  // Session routes pause on the stale interstitial until the resume decision is made.
  const stale = ['session', 'outline', 'clock'].includes(parts[0]) && sessionIsStale();
  if (hash === '#/' || hash === '') html = viewHome();
  else if (stale) html = viewStaleResume();
  else if (parts[0] === 'session') html = viewSession();
  else if (parts[0] === 'outline') html = viewOutline();
  else if (parts[0] === 'clock') html = viewClock();
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
  if (hash !== lastHash) window.scrollTo(0, 0);   // only reset on route change, not in-place updates
  lastHash = hash;
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
      // Enlarge + brass-ring the tapped dot so the caption's point is unmistakable.
      wrap.querySelectorAll('.chart-dot').forEach((c) => {
        const sel = Number(c.dataset.pt) === i;
        c.setAttribute('r', sel ? '6.5' : '4.5');
        c.setAttribute('stroke', sel ? 'var(--brass)' : 'var(--card)');
        c.setAttribute('stroke-width', sel ? '3' : '2');
      });
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

    case 'timer-sub':
      if (timer.endsAt) {
        // Trim 30s, but never below ~5s from now.
        timer.endsAt = Math.max(Date.now() + 5000, timer.endsAt - 30000);
        timer.total = Math.max(5, timer.total - 30);
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

    case 'ol-jump': {
      clockJump = { slotId: el.dataset.slot, setIdx: Number(el.dataset.set) };
      location.hash = '#/clock';
      break;
    }

    case 'ol-toggle': {
      outlineOpen = outlineOpen === el.dataset.key ? null : el.dataset.key;
      render();
      break;
    }

    case 'stale-continue':
      staleAcked = true;
      render();
      break;

    case 'stale-finish':
      finishSession('');   // keeps only logged sets; empty movements are dropped
      break;

    case 'cl-expand': {
      clockPanel = { slotId: el.dataset.slot, setIdx: Number(el.dataset.set) };
      render();
      const b = $('#cl-logbtn');
      if (b) b.focus();
      break;
    }

    case 'cl-collapse': {
      clockPanel = null;
      render();
      const od = $('#cl-ondeck');
      if (od) od.focus();
      break;
    }

    case 'cl-load': {
      const day = findDay(state.active.dayId);
      const slot = findSlot(day, el.dataset.slot);
      const setIdx = Number(el.dataset.set);
      const set = state.active.entries[slot.id].sets[setIdx];
      const prev = lastLoggedSetValue(slot.exerciseId, setIdx);
      const anchor = prev && prev.w !== '' && prev.w != null ? Number(prev.w) : null;
      let base = set.w === '' ? (anchor != null ? anchor : 0) : Number(set.w);
      if (!Number.isFinite(base)) base = 0;
      // First tap on an empty field recalls the anchor itself; deltas start on the next tap.
      const v = set.w === '' && anchor != null
        ? anchor
        : Math.max(0, base + Number(el.dataset.dir) * (slot.increment || 5));
      set.w = String(v);
      saveSoon();
      const lv = $('#cl-loadval');
      if (lv) { lv.textContent = v; lv.parentElement.classList.remove('empty'); }
      break;
    }

    case 'cl-rep': {
      const day = findDay(state.active.dayId);
      const slot = findSlot(day, el.dataset.slot);
      const set = state.active.entries[slot.id].sets[Number(el.dataset.set)];
      const step = slot.metric === 'reps' ? 1 : 5;
      let base = set.r === '' ? slot.reps[0] : Number(set.r);
      if (!Number.isFinite(base)) base = slot.reps[0];
      // First tap on an empty field lands ON the prescription floor, not one past it.
      const v = set.r === ''
        ? slot.reps[0]
        : Math.max(0, base + Number(el.dataset.dir) * step);
      set.r = String(v);
      saveSoon();
      const rv = $('#cl-repval');
      if (rv) { rv.textContent = v; rv.parentElement.classList.remove('empty'); }
      break;
    }

    case 'cl-rir': {
      const day = findDay(state.active.dayId);
      const slot = findSlot(day, el.dataset.slot);
      const setIdx = Number(el.dataset.set);
      const set = state.active.entries[slot.id].sets[setIdx];
      set.rir = el.dataset.v;   // '4' | '2' | '1' — string, like the sheet inputs
      saveSoon();
      const wrap = $('#cl-rirwrap');
      if (wrap) {
        wrap.innerHTML = rirRowHTML(slot, set, setIdx, state.active.week === 4);
        const b = wrap.querySelector(`[data-v="${el.dataset.v}"]`);
        if (b) b.focus();
      }
      break;
    }

    case 'cl-log': {
      clockPanel = null;
      logSet(el.dataset.slot, Number(el.dataset.set));   // marks done, saves, renders, starts the real timer
      const od = $('#cl-ondeck');
      if (od) od.classList.add('flash');
      break;
    }

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
      const thisId = isNew ? el.dataset.newid : el.dataset.slot;
      // Same name on a different slot means both write to one exerciseId — history pools.
      const shares = state.program.days.some((d) => d.slots.some((sl) =>
        sl.id !== thisId && (sl.exerciseId || slug(sl.name)) === exId));
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
      toast(shares ? 'Saved — this name shares history with another movement' : 'Program updated');
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
      state.settings.weekSessionCount = 0;   // manual calendar change resets the auto-advance counter
      save(); render();
      break;
    }

    case 'block-step': {
      const b = state.settings.block + Number(el.dataset.dir);
      state.settings.block = Math.max(1, b);
      state.settings.weekSessionCount = 0;
      save(); render();
      break;
    }

    case 'set-theme':
      state.settings.theme = el.dataset.v;
      save(); applyTheme(); render();
      break;

    case 'set-unit':
      state.settings.unit = el.dataset.v;
      save(); render();
      break;

    case 'set-sound':
      state.settings.sound = el.dataset.v === '1';
      save(); render();
      break;

    case 'test-chime': {
      // This runs inside a real tap, so it unlocks iOS audio and confirms it works.
      const wasOn = state.settings.sound;
      state.settings.sound = true;   // let the test play even if the setting is Off
      ensureAudio();
      chime();
      state.settings.sound = wasOn;
      if (!wasOn) toast('Chime is currently Off for rests — turn it On above');
      else toast('If you heard it, sound is primed for this session');
      break;
    }

    case 'set-wake':
      state.settings.wake = el.dataset.v === '1';
      if (!state.settings.wake) releaseWakeLock();
      save(); render();
      break;

    case 'export':
      exportData();
      break;

    case 'import-confirm': {
      let parsed;
      try {
        parsed = JSON.parse($('#import-json').value);
      } catch (e) {
        toast('Could not parse that JSON'); break;
      }
      if (!validState(parsed)) {
        toast('That does not look like a Strength Rebuild backup'); break;
      }
      const prev = state;
      try {
        state = parsed;
        location.hash = '#/';
        render();
      } catch (e) {
        state = prev;
        location.hash = '#/';
        render();
        toast('That backup could not be loaded — kept your current data');
        break;
      }
      save();
      toast('Backup restored — ' + state.sessions.length + ' sessions');
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
applyTheme();
if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    if (state.settings.theme === 'auto') applyTheme();
  });
}
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {});
}
render();
if (state.active) acquireWakeLock();
