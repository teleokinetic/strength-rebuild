/* Strength Rebuild — v2: one gym surface, one-press rest, baked-WAV chime.
   No per-set logging: tracked slots capture one working weight (prefilled
   from last session), menu slots take a note. Rest never auto-starts. */

'use strict';

/* ============================== state ============================== */

const STORE_KEY = 'sr-state-v2';
const V1_KEY = 'sr-state-v1';        // read-only: migration source, never written
const APP_VERSION = '2.0.0';

let state = null;

function slug(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function defaultState() {
  return {
    version: 2,
    settings: { unit: 'lb', theme: 'auto', restNormal: 105, restHeavy: 170, lastExport: null },
    program: JSON.parse(JSON.stringify(SEED_PROGRAM)),
    sessions: [],
    active: null,
  };
}

function validState(obj) {
  if (!obj || typeof obj !== 'object') return false;
  if (obj.version !== 2) return false;
  const s = obj.settings;
  if (!s || typeof s !== 'object') return false;
  if (s.unit == null || s.theme == null || !(s.restNormal > 0) || !(s.restHeavy > 0)) return false;
  if (!obj.program || !Array.isArray(obj.program.days)) return false;
  if (!Array.isArray(obj.sessions)) return false;
  return true;
}

// v1 → v2: per-set logs collapse to one working weight (the heaviest set),
// but the raw sets ride along under `sets` so nothing is lost for export
// analysis. The v1 blob itself is left in localStorage untouched as a backup.
function migrateV1Sessions(v1) {
  const out = [];
  const collapse = (entry) => {
    let w = '';
    for (const set of entry.sets || []) {
      const n = parseFloat(set.w);
      if (Number.isFinite(n) && (w === '' || n > w)) w = n;
    }
    return {
      exerciseId: entry.exerciseId || slug(entry.name),
      name: entry.name,
      weight: w,
      note: entry.note || '',
      sets: entry.sets || [],
    };
  };
  for (const sess of v1.sessions || []) {
    out.push({
      id: sess.id, v: 1,
      dayId: sess.dayId, dayName: sess.dayName,
      startedAt: sess.startedAt, endedAt: sess.endedAt,
      note: sess.note || '',
      entries: (sess.entries || []).map(collapse),
    });
  }
  // A v1 session left mid-flight still holds real logged sets — keep them.
  if (v1.active && v1.active.entries) {
    const entries = [];
    for (const slotId in v1.active.entries) {
      const e = v1.active.entries[slotId];
      const done = (e.sets || []).filter((s) => s.done);
      if (done.length) entries.push(collapse({ exerciseId: e.exerciseId, name: e.exerciseId, note: e.note, sets: done }));
    }
    if (entries.length) {
      out.push({
        id: 'v1-active', v: 1,
        dayId: v1.active.dayId, dayName: v1.active.dayId,
        startedAt: v1.active.startedAt, endedAt: v1.active.startedAt,
        note: '(recovered mid-session log)',
        entries,
      });
    }
  }
  return out;
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (validState(parsed)) { state = parsed; return; }
    }
  } catch (e) { /* corrupted → fall through */ }

  state = defaultState();
  try {
    const rawV1 = localStorage.getItem(V1_KEY);
    if (rawV1) {
      const v1 = JSON.parse(rawV1);
      if (v1 && v1.version === 1) {
        state.sessions = migrateV1Sessions(v1);
        if (v1.settings) {
          if (v1.settings.theme) state.settings.theme = v1.settings.theme;
          if (v1.settings.unit) state.settings.unit = v1.settings.unit;
        }
      }
    }
  } catch (e) { /* v1 unreadable → fresh start */ }
  save();
}

let saveTimer = null;
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch (e) { toast('Could not save — storage full?'); }
}
function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 400);
}
function flushSave() { clearTimeout(saveTimer); save(); }
window.addEventListener('pagehide', flushSave);
document.addEventListener('visibilitychange', () => { if (document.hidden) flushSave(); });

/* ============================== helpers ============================== */

const $ = (sel) => document.querySelector(sel);

function esc(str) {
  return String(str).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function fmtDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function fmtMMSS(sec) {
  sec = Math.max(0, Math.round(sec));
  return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function findDay(dayId) { return state.program.days.find((d) => d.id === dayId); }
function findSlot(day, slotId) { return day ? day.slots.find((s) => s.id === slotId) : null; }

function applyTheme() {
  const t = state.settings.theme;
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  else document.documentElement.removeAttribute('data-theme');
}

let toastTimer = null;
function toast(msg) {
  let el = $('#toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/* ========================= history & prefill ========================= */

// Most recent recorded weight for an exercise, matched by name-slug so it
// survives program edits and the v1→v2 migration alike.
function lastWeightFor(exerciseId) {
  for (let i = state.sessions.length - 1; i >= 0; i--) {
    const entry = (state.sessions[i].entries || []).find(
      (e) => e.exerciseId === exerciseId && e.weight !== '' && e.weight != null
    );
    if (entry) return entry.weight;
  }
  return '';
}

function lastSessionFor(dayId) {
  for (let i = state.sessions.length - 1; i >= 0; i--) {
    if (state.sessions[i].dayId === dayId) return state.sessions[i];
  }
  return null;
}

/* ============================ session core ============================ */

// A session begins lazily: the first weight tweak or note creates it. Finishing
// records every tracked slot at its effective (prefilled or adjusted) weight.
function ensureActive(dayId) {
  if (state.active && state.active.dayId === dayId) return state.active;
  state.active = { dayId, startedAt: Date.now(), lastActivityAt: Date.now(), entries: {} };
  return state.active;
}

function activeEntry(dayId, slotId) {
  const a = ensureActive(dayId);
  if (!a.entries[slotId]) a.entries[slotId] = { weight: null, note: '' };
  a.lastActivityAt = Date.now();
  return a.entries[slotId];
}

// Effective weight shown on a slot chip: session adjustment wins, else prefill.
function effectiveWeight(dayId, slot) {
  const a = state.active;
  const e = a && a.dayId === dayId ? a.entries[slot.id] : null;
  if (e && e.weight != null && e.weight !== '') return e.weight;
  if (e && e.weight === '') return '';
  return lastWeightFor(slug(slot.name));
}

function finishSession(dayId, note) {
  const day = findDay(dayId);
  if (!day) return;
  const a = state.active && state.active.dayId === dayId ? state.active : null;
  const entries = [];
  for (const slot of day.slots) {
    const e = a ? a.entries[slot.id] : null;
    const slotNote = e && e.note ? e.note.trim() : '';
    if (slot.track) {
      const w = effectiveWeight(dayId, slot);
      entries.push({ exerciseId: slug(slot.name), name: slot.name, weight: w === '' ? '' : parseFloat(w), note: slotNote });
    } else if (slotNote) {
      entries.push({ exerciseId: slug(slot.name), name: slot.name, weight: '', note: slotNote });
    }
  }
  state.sessions.push({
    id: uid(), v: 2,
    dayId: day.id, dayName: `${day.name} — ${day.subtitle}`,
    startedAt: a ? a.startedAt : Date.now(),
    endedAt: Date.now(),
    note: (note || '').trim(),
    entries,
  });
  state.active = null;
  restCancel();
  save();
  location.hash = '#/';
  toast('Session saved');
}

// A session left hanging past 12h is finished, not lost: adjusted weights and
// notes are real data, and "forgot to hit finish" is the common failure.
const STALE_AFTER_MS = 12 * 3600 * 1000;
function autoFinishStale() {
  const a = state.active;
  if (!a) return;
  const last = a.lastActivityAt || a.startedAt;
  if (Date.now() - last > STALE_AFTER_MS) {
    const here = location.hash;
    finishSession(a.dayId, '(auto-saved — session left open)');
    location.hash = here || '#/';
    toast('Previous session auto-saved');
  }
}

/* ====================== rest engine (baked chime) ======================
   A media element keeps playing with the screen off (like music). We bake
   one WAV = [silence for the rest][chime], so the phone's own audio clock
   rings it even while JS is suspended. Adapted from Still Water. */

const SR = 8000;   // chime partials all < 4 kHz

// Gym bell: the Still Water bell triad, rung twice, normalized near full scale.
const CHIME = (() => {
  const ev = [], notes = [523.25, 659.25, 783.99];
  for (let ring = 0; ring < 2; ring++) {
    for (let r = 0; r < 3; r++) {
      notes.forEach((f, i) => ev.push({ t: ring * 2.4 + r * 0.74 + i * 0.1, f, dur: 0.5, amp: 0.3, k: 6 }));
    }
  }
  return { sec: 5.4, events: ev };
})();

function chimeSamples() {
  const N = Math.round(CHIME.sec * SR);
  const out = new Float32Array(N);
  for (const ev of CHIME.events) {
    const s0 = Math.round(ev.t * SR);
    const s1 = Math.min(N, s0 + Math.round(ev.dur * SR));
    const w = 2 * Math.PI * ev.f / SR;
    for (let s = s0; s < s1; s++) {
      const t = (s - s0) / SR;
      out[s] += Math.sin(w * (s - s0)) * Math.exp(-ev.k * t) * ev.amp;
    }
  }
  let peak = 0;
  for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0) { const g = 0.95 / peak; for (let i = 0; i < N; i++) out[i] *= g; }
  return out;
}

function writeWavHeader(view, dataLen) {
  const w = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); view.setUint32(4, 36 + dataLen, true); w(8, 'WAVE');
  w(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, SR, true);
  view.setUint32(28, SR * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  w(36, 'data'); view.setUint32(40, dataLen, true);
}

function buildBakedBuf(durationSec) {
  const silN = Math.max(0, Math.round(durationSec * SR));
  const ch = chimeSamples();
  const dataLen = (silN + ch.length) * 2;
  const buf = new ArrayBuffer(44 + dataLen);   // silence region is already zero
  const view = new DataView(buf);
  writeWavHeader(view, dataLen);
  let o = 44 + silN * 2;
  for (let i = 0; i < ch.length; i++) {
    const v = Math.max(-1, Math.min(1, ch[i]));
    view.setInt16(o, v * 32767, true);
    o += 2;
  }
  return buf;
}

function bufToDataUri(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return 'data:audio/wav;base64,' + btoa(bin);
}

const rest = { running: false, endsAt: 0, total: 0, tier: null, done: false };
let bgAudio = null, bgUrl = null, bgWavBuf = null, bgSrcMode = null;
let bgLoading = false, bakedArmed = false;
const bakedCache = {};   // durationSec → { url, buf }
let restTick = null;

function makeAudioEl() {
  if (bgAudio) return bgAudio;
  bgAudio = new Audio();
  bgAudio.preload = 'auto';
  bgAudio.loop = false;
  bgAudio.setAttribute('aria-hidden', 'true');
  bgAudio.addEventListener('error', onBgError);
  document.body.appendChild(bgAudio);
  return bgAudio;
}
function onBgError() {
  if (!bgLoading) return;
  if (bgSrcMode === 'blob' && bgWavBuf) {
    bgSrcMode = 'data';
    try {
      bgAudio.src = bufToDataUri(bgWavBuf);
      const p = bgAudio.play(); if (p && p.catch) p.catch(() => {});
    } catch (e) { bakedArmed = false; }
    return;
  }
  bakedArmed = false;
}

// Media can also be refused SILENTLY — no error event, readyState pinned at 0.
// If nothing has loaded a beat after play(), retry as a data: URI, then fall
// back to the foreground Web Audio chime (bakedArmed=false lets it ring).
let bgWatchdog = null;
function armBgWatchdog() {
  clearTimeout(bgWatchdog);
  bgWatchdog = setTimeout(() => {
    if (!rest.running || !bgAudio || bgAudio.readyState > 0) return;
    if (bgSrcMode === 'blob' && bgWavBuf) {
      onBgError();
      armBgWatchdog();
    } else {
      bakedArmed = false;
    }
  }, 2500);
}

function startBgAudio(durationSec) {
  const a = makeAudioEl();
  try { a.pause(); } catch (e) {}
  try {
    let entry = bakedCache[durationSec];
    if (!entry) {
      const buf = buildBakedBuf(durationSec);
      entry = { url: URL.createObjectURL(new Blob([buf], { type: 'audio/wav' })), buf };
      bakedCache[durationSec] = entry;
    }
    bgWavBuf = entry.buf;
    bgUrl = entry.url;
    bakedArmed = true;
    bgSrcMode = 'blob';
    bgLoading = true;
    a.src = bgUrl;
    a.currentTime = 0;
    a.volume = 1;
    const p = a.play();
    if (p && p.catch) p.catch(() => { bakedArmed = false; });
    setMediaSession();
    armBgWatchdog();
  } catch (e) { bakedArmed = false; }
}

function stopBgAudio() {
  bgLoading = false;
  bakedArmed = false;
  clearTimeout(bgWatchdog);
  if (bgAudio) { try { bgAudio.pause(); } catch (e) {} }   // pause only, no load(): avoids a spurious error event
}

function setMediaSession() {
  try {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({ title: 'Rest', artist: 'Strength Rebuild' });
  } catch (e) {}
}

/* ---- foreground chime (Web Audio): preview + fallback ---- */
let audioContext = null;
function getCtx() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!audioContext) audioContext = new AC();
  return audioContext;
}
async function fgChime() {
  try {
    const ctx = getCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') { try { await ctx.resume(); } catch (e) {} }
    if (ctx.state === 'suspended') return;
    const now = ctx.currentTime + 0.04;
    for (const ev of CHIME.events) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(ev.f, now + ev.t);
      g.gain.setValueAtTime(0.0001, now + ev.t);
      g.gain.exponentialRampToValueAtTime(Math.min(ev.amp * 0.8, 0.4), now + ev.t + 0.02);
      g.gain.setTargetAtTime(0.0001, now + ev.t + 0.03, 1 / ev.k);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(now + ev.t); osc.stop(now + ev.t + ev.dur + 0.1);
    }
  } catch (e) {}
}

function buzz() {
  try { if (navigator.vibrate) navigator.vibrate([220, 120, 220, 120, 320]); } catch (e) {}
}

/* ---- screen wake lock (nice-to-have) ---- */
let wakeLock = null;
async function requestWakeLock() {
  try {
    if (!('wakeLock' in navigator)) return;
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch (e) { wakeLock = null; }
}
function releaseWakeLock() {
  try { if (wakeLock) { wakeLock.release(); wakeLock = null; } } catch (e) {}
}

/* ---- rest control ---- */

function restStart(tier) {
  const sec = tier === 'heavy' ? state.settings.restHeavy : state.settings.restNormal;
  rest.running = true;
  rest.done = false;
  rest.tier = tier;
  rest.total = sec;
  rest.endsAt = Date.now() + sec * 1000;
  startBgAudio(sec);        // must run inside the button-press gesture
  requestWakeLock();
  startRestTick();
  renderRestDock();
}

function restCancel() {
  rest.running = false;
  rest.done = false;
  stopBgAudio();
  releaseWakeLock();
  stopRestTick();
  renderRestDock();
}

function restFinish() {
  rest.running = false;
  rest.done = true;
  if (!bakedArmed) fgChime();   // baked track already rang if it could
  buzz();
  releaseWakeLock();
  stopRestTick();
  renderRestDock();
  setTimeout(() => { if (rest.done && !rest.running) { rest.done = false; renderRestDock(); } }, 4000);
}

function startRestTick() {
  stopRestTick();
  restTick = setInterval(() => {
    if (!rest.running) return;
    const left = (rest.endsAt - Date.now()) / 1000;
    if (left <= 0) { restFinish(); return; }
    updateRestTime(left);
  }, 250);
}
function stopRestTick() { clearInterval(restTick); restTick = null; }

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && rest.running && Date.now() >= rest.endsAt) restFinish();
});

/* ============================== views ============================== */

function topbar(backTo) {
  const left = backTo
    ? `<a class="backlink" href="${backTo}">‹ Back</a>`
    : `<div class="wordmark">Strength <span class="half">Rebuild</span></div>`;
  const right = backTo ? '' : `<a class="gear" href="#/settings" aria-label="Settings">⚙</a>`;
  return `<div class="topbar">${left}${right}</div>`;
}

function viewHome() {
  const cards = state.program.days.map((day) => {
    const last = lastSessionFor(day.id);
    const when = last ? `Last: ${fmtDate(last.endedAt)}` : 'Not yet logged';
    return `
      <a class="daycard" href="#/day/${day.id}">
        <div class="daycard-name">${esc(day.name)}</div>
        <div class="daycard-sub">${esc(day.subtitle)}</div>
        <div class="daycard-last">${esc(when)}</div>
      </a>`;
  }).join('');
  return `${topbar()}<div class="daygrid">${cards}</div>`;
}

function slotCardHTML(day, slot) {
  const a = state.active && state.active.dayId === day.id ? state.active.entries[slot.id] : null;
  const note = a && a.note ? a.note : '';
  const menu = slot.menu && slot.menu.length
    ? `<ul class="menu">${slot.menu.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : '';
  const warmup = slot.warmup
    ? `<div class="warmup"><span class="warmup-tag">Warm-up</span> ${esc(slot.warmup)}</div>` : '';
  let chip = '';
  if (slot.track) {
    const w = effectiveWeight(day.id, slot);
    const label = w === '' || w == null ? '—' : (slot.added ? '+' : '') + w;
    chip = `
      <button class="chip" data-action="chip" data-slot="${slot.id}">
        <span class="chip-num">${esc(String(label))}</span>
        <span class="chip-unit">${esc(state.settings.unit)}</span>
      </button>
      <div class="chip-edit hidden" data-edit="${slot.id}">
        <button class="step" data-action="step" data-slot="${slot.id}" data-d="-5">−5</button>
        <input class="chip-input" type="number" inputmode="decimal" step="any"
               data-action="weight" data-slot="${slot.id}" value="${w === '' || w == null ? '' : esc(String(w))}">
        <button class="step" data-action="step" data-slot="${slot.id}" data-d="5">+5</button>
      </div>`;
  }
  return `
    <div class="slot" data-slotcard="${slot.id}">
      <div class="slot-head">
        <div class="slot-name">${esc(slot.name)}</div>
        <div class="slot-target">${esc(slot.target || '')}</div>
      </div>
      ${slot.cue ? `<div class="slot-cue">${esc(slot.cue)}</div>` : ''}
      ${warmup}${menu}
      <div class="slot-foot">
        ${chip}
        <button class="notebtn ${note ? 'has-note' : ''}" data-action="note" data-slot="${slot.id}">✎ note</button>
      </div>
      <div class="note-edit hidden" data-noteedit="${slot.id}">
        <textarea rows="2" data-action="notetext" data-slot="${slot.id}"
          placeholder="What happened?">${esc(note)}</textarea>
      </div>
    </div>`;
}

function restDockHTML() {
  const n = state.settings.restNormal, h = state.settings.restHeavy;
  if (rest.running) {
    const left = (rest.endsAt - Date.now()) / 1000;
    const pct = Math.max(0, Math.min(100, (1 - left / rest.total) * 100));
    return `
      <div class="rest-running">
        <div class="rest-time" data-rest-time>${fmtMMSS(left)}</div>
        <div class="rest-track"><div class="rest-fill" data-rest-fill style="width:${pct}%"></div></div>
        <div class="rest-ctl">
          <button class="rest-mini" data-action="rest-restart">↻</button>
          <button class="rest-mini" data-action="rest-cancel">✕</button>
        </div>
      </div>`;
  }
  if (rest.done) {
    return `<button class="rest-done" data-action="rest-ack">Rest done — go</button>`;
  }
  return `
    <div class="rest-idle">
      <button class="restbtn" data-action="rest" data-tier="normal">Rest <span>${fmtMMSS(n)}</span></button>
      <button class="restbtn heavy" data-action="rest" data-tier="heavy">Rest <span>${fmtMMSS(h)}</span></button>
    </div>`;
}

function renderRestDock() {
  const dock = $('#restdock');
  if (dock) dock.innerHTML = restDockHTML();
}
function updateRestTime(left) {
  const t = $('[data-rest-time]');
  const f = $('[data-rest-fill]');
  if (t) t.textContent = fmtMMSS(left);
  if (f) f.style.width = Math.max(0, Math.min(100, (1 - left / rest.total) * 100)) + '%';
}

function viewDay(dayId) {
  const day = findDay(dayId);
  if (!day) { location.hash = '#/'; return ''; }
  return `
    ${topbar('#/')}
    <div class="dayhead">
      <div class="dayhead-name">${esc(day.name)} <span class="dayhead-sub">${esc(day.subtitle)}</span></div>
    </div>
    <div id="restdock" class="restdock">${restDockHTML()}</div>
    <div class="slots">${day.slots.map((s) => slotCardHTML(day, s)).join('')}</div>
    <button class="finishbtn" data-action="finish" data-day="${day.id}">Finish session</button>`;
}

function viewFinish(dayId) {
  const day = findDay(dayId);
  if (!day) { location.hash = '#/'; return ''; }
  return `
    ${topbar('#/day/' + dayId)}
    <div class="finish-wrap">
      <div class="eyebrow">Finish ${esc(day.name)}</div>
      <p class="finish-hint">Saves every tracked lift at the weight shown on its chip.</p>
      <textarea id="finishnote" rows="3" placeholder="Session note (optional)"></textarea>
      <button class="finishbtn solid" data-action="finish-save" data-day="${day.id}">Save session</button>
    </div>`;
}

function viewSettings() {
  const s = state.settings;
  const seg = (name, val, opts) => opts.map(([v, label]) =>
    `<button class="seg ${val === v ? 'on' : ''}" data-action="${name}" data-v="${v}">${label}</button>`
  ).join('');
  return `
    ${topbar('#/')}
    <div class="settings">
      <div class="setrow">
        <div class="setlabel">Theme</div>
        <div class="segwrap">${seg('theme', s.theme, [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']])}</div>
      </div>
      <div class="setrow">
        <div class="setlabel">Unit</div>
        <div class="segwrap">${seg('unit', s.unit, [['lb', 'lb'], ['kg', 'kg']])}</div>
      </div>
      <div class="setrow">
        <div class="setlabel">Rest — normal</div>
        <input class="setnum" type="number" inputmode="numeric" data-action="rest-normal" value="${s.restNormal}"> s
      </div>
      <div class="setrow">
        <div class="setlabel">Rest — heavy</div>
        <input class="setnum" type="number" inputmode="numeric" data-action="rest-heavy" value="${s.restHeavy}"> s
      </div>
      <div class="setrow">
        <div class="setlabel">Chime</div>
        <button class="setbtn" data-action="chime-test">Test</button>
      </div>
      <div class="setrow">
        <div class="setlabel">Program</div>
        <a class="setbtn" href="#/program">Edit</a>
      </div>
      <div class="setrow">
        <div class="setlabel">Data</div>
        <div class="btnrow">
          <button class="setbtn" data-action="export">Export</button>
          <button class="setbtn" data-action="copy-json">Copy JSON</button>
          <a class="setbtn" href="#/import">Import</a>
        </div>
      </div>
      <div class="setrow">
        <div class="setlabel">Danger</div>
        <button class="setbtn danger" data-action="erase">Erase all data</button>
      </div>
      <div class="version">v${APP_VERSION} · ${state.sessions.length} sessions logged</div>
    </div>`;
}

function viewImport() {
  return `
    ${topbar('#/settings')}
    <div class="settings">
      <div class="eyebrow">Import</div>
      <p class="finish-hint">Paste a Strength Rebuild JSON export. Replaces everything.</p>
      <textarea id="importbox" rows="8" placeholder="{ … }"></textarea>
      <button class="finishbtn solid" data-action="import-load">Load</button>
    </div>`;
}

function viewProgram() {
  const days = state.program.days.map((day) => `
    <div class="eyebrow">${esc(day.name)} — ${esc(day.subtitle)}</div>
    <div class="proglist">
      ${day.slots.map((s) => `
        <a class="progrow" href="#/program/${day.id}/${s.id}">
          <span>${esc(s.name)}</span>
          <span class="progrow-target">${esc(s.target || '')}</span>
        </a>`).join('')}
      <button class="setbtn" data-action="add-slot" data-day="${day.id}">+ Add exercise</button>
    </div>`).join('');
  return `${topbar('#/settings')}<div class="settings">${days}</div>`;
}

function viewSlotEdit(dayId, slotId) {
  const day = findDay(dayId);
  const slot = findSlot(day, slotId);
  if (!slot) { location.hash = '#/program'; return ''; }
  const field = (label, action, value, ph) => `
    <label class="editfield"><span>${label}</span>
      <input type="text" data-action="${action}" value="${esc(value || '')}" placeholder="${ph || ''}"></label>`;
  return `
    ${topbar('#/program')}
    <div class="settings" data-editing-day="${dayId}" data-editing-slot="${slotId}">
      ${field('Name', 'edit-name', slot.name)}
      ${field('Target', 'edit-target', slot.target, 'e.g. 3×6–8 · RIR 2–3')}
      ${field('Cue', 'edit-cue', slot.cue)}
      ${field('Warm-up', 'edit-warmup', slot.warmup)}
      <label class="editfield"><span>Menu (one per line)</span>
        <textarea rows="4" data-action="edit-menu">${esc((slot.menu || []).join('\n'))}</textarea></label>
      <div class="setrow">
        <div class="setlabel">Track weight</div>
        <button class="seg ${slot.track ? 'on' : ''}" data-action="edit-track">${slot.track ? 'On' : 'Off'}</button>
      </div>
      <div class="setrow">
        <div class="setlabel">Added load (+)</div>
        <button class="seg ${slot.added ? 'on' : ''}" data-action="edit-added">${slot.added ? 'On' : 'Off'}</button>
      </div>
      <div class="setrow">
        <div class="setlabel">Rest tier</div>
        <div class="segwrap">
          <button class="seg ${slot.rest !== 'heavy' ? 'on' : ''}" data-action="edit-rest" data-v="normal">Normal</button>
          <button class="seg ${slot.rest === 'heavy' ? 'on' : ''}" data-action="edit-rest" data-v="heavy">Heavy</button>
        </div>
      </div>
      <div class="btnrow">
        <button class="setbtn" data-action="edit-up">↑ Move up</button>
        <button class="setbtn" data-action="edit-down">↓ Move down</button>
        <button class="setbtn danger" data-action="edit-delete">Delete</button>
      </div>
    </div>`;
}

/* ============================== router ============================== */

function render() {
  const hash = location.hash || '#/';
  const parts = hash.replace(/^#\//, '').split('/');
  let html = '';
  if (parts[0] === 'day' && parts[1]) html = viewDay(parts[1]);
  else if (parts[0] === 'finish' && parts[1]) html = viewFinish(parts[1]);
  else if (parts[0] === 'settings') html = viewSettings();
  else if (parts[0] === 'import') html = viewImport();
  else if (parts[0] === 'program' && parts[1] && parts[2]) html = viewSlotEdit(parts[1], parts[2]);
  else if (parts[0] === 'program') html = viewProgram();
  else html = viewHome();
  $('#app').innerHTML = html;
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', render);

/* ============================== actions ============================== */

let pendingErase = false;

function currentDayId() {
  const m = (location.hash || '').match(/^#\/day\/([^/]+)/);
  return m ? m[1] : null;
}

function editedSlot() {
  const wrap = $('[data-editing-slot]');
  if (!wrap) return {};
  const dayId = wrap.getAttribute('data-editing-day');
  const slotId = wrap.getAttribute('data-editing-slot');
  const day = findDay(dayId);
  return { day, slot: findSlot(day, slotId) };
}

document.addEventListener('click', (ev) => {
  const t = ev.target.closest('[data-action]');
  if (!t) return;
  const action = t.getAttribute('data-action');
  const dayId = currentDayId();

  if (action === 'rest') { restStart(t.getAttribute('data-tier')); return; }
  if (action === 'rest-restart') { restStart(rest.tier || 'normal'); return; }
  if (action === 'rest-cancel') { restCancel(); return; }
  if (action === 'rest-ack') { rest.done = false; renderRestDock(); return; }

  if (action === 'chip') {
    const box = $(`[data-edit="${t.getAttribute('data-slot')}"]`);
    if (box) box.classList.toggle('hidden');
    return;
  }
  if (action === 'step') {
    const slotId = t.getAttribute('data-slot');
    const d = parseFloat(t.getAttribute('data-d'));
    const day = findDay(dayId);
    const slot = findSlot(day, slotId);
    if (!slot) return;
    const cur = parseFloat(effectiveWeight(dayId, slot));
    const next = (Number.isFinite(cur) ? cur : 0) + d;
    const e = activeEntry(dayId, slotId);
    e.weight = Math.max(0, next);
    save();
    const input = $(`[data-edit="${slotId}"] .chip-input`);
    if (input) input.value = e.weight;
    const chipNum = $(`[data-slotcard="${slotId}"] .chip-num`);
    if (chipNum) chipNum.textContent = (slot.added ? '+' : '') + e.weight;
    return;
  }
  if (action === 'note') {
    const box = $(`[data-noteedit="${t.getAttribute('data-slot')}"]`);
    if (box) {
      box.classList.toggle('hidden');
      if (!box.classList.contains('hidden')) box.querySelector('textarea').focus();
    }
    return;
  }

  if (action === 'finish') { location.hash = '#/finish/' + t.getAttribute('data-day'); return; }
  if (action === 'finish-save') {
    finishSession(t.getAttribute('data-day'), ($('#finishnote') || {}).value || '');
    return;
  }

  if (action === 'theme') { state.settings.theme = t.getAttribute('data-v'); applyTheme(); save(); render(); return; }
  if (action === 'unit') { state.settings.unit = t.getAttribute('data-v'); save(); render(); return; }
  if (action === 'chime-test') { fgChime(); return; }
  if (action === 'export') { exportJSON(); return; }
  if (action === 'copy-json') {
    navigator.clipboard.writeText(JSON.stringify(state, null, 1))
      .then(() => toast('Copied'))
      .catch(() => toast('Copy failed'));
    return;
  }
  if (action === 'erase') {
    if (!pendingErase) {
      pendingErase = true;
      t.textContent = 'Tap again to erase';
      setTimeout(() => { pendingErase = false; if (document.body.contains(t)) t.textContent = 'Erase all data'; }, 3500);
      return;
    }
    localStorage.removeItem(STORE_KEY);
    state = defaultState();
    save();
    pendingErase = false;
    location.hash = '#/';
    render();
    toast('Erased');
    return;
  }
  if (action === 'import-load') {
    try {
      const parsed = JSON.parse(($('#importbox') || {}).value || '');
      if (validState(parsed)) { state = parsed; }
      else if (parsed && parsed.version === 1) {
        state = defaultState();
        state.sessions = migrateV1Sessions(parsed);
        if (parsed.settings && parsed.settings.theme) state.settings.theme = parsed.settings.theme;
      } else { toast('Not a Strength Rebuild export'); return; }
      save();
      applyTheme();
      location.hash = '#/';
      toast('Imported');
    } catch (e) { toast('Could not parse JSON'); }
    return;
  }

  if (action === 'add-slot') {
    const day = findDay(t.getAttribute('data-day'));
    if (!day) return;
    const id = 's' + uid();
    day.slots.push({ id, name: 'New exercise', target: '', track: true, rest: 'normal', cue: '' });
    save();
    location.hash = `#/program/${day.id}/${id}`;
    return;
  }
  if (action === 'edit-track' || action === 'edit-added') {
    const { slot } = editedSlot();
    if (!slot) return;
    const key = action === 'edit-track' ? 'track' : 'added';
    slot[key] = !slot[key];
    save(); render();
    return;
  }
  if (action === 'edit-rest') {
    const { slot } = editedSlot();
    if (!slot) return;
    slot.rest = t.getAttribute('data-v');
    save(); render();
    return;
  }
  if (action === 'edit-up' || action === 'edit-down') {
    const { day, slot } = editedSlot();
    if (!day || !slot) return;
    const i = day.slots.indexOf(slot);
    const j = action === 'edit-up' ? i - 1 : i + 1;
    if (j < 0 || j >= day.slots.length) return;
    day.slots.splice(i, 1);
    day.slots.splice(j, 0, slot);
    save();
    toast(action === 'edit-up' ? 'Moved up' : 'Moved down');
    return;
  }
  if (action === 'edit-delete') {
    const { day, slot } = editedSlot();
    if (!day || !slot) return;
    day.slots.splice(day.slots.indexOf(slot), 1);
    save();
    location.hash = '#/program';
    return;
  }
});

document.addEventListener('input', (ev) => {
  const t = ev.target.closest('[data-action]');
  if (!t) return;
  const action = t.getAttribute('data-action');
  const dayId = currentDayId();

  if (action === 'weight') {
    const slotId = t.getAttribute('data-slot');
    const e = activeEntry(dayId, slotId);
    e.weight = t.value === '' ? '' : parseFloat(t.value);
    if (!Number.isFinite(e.weight)) e.weight = '';
    const day = findDay(dayId);
    const slot = findSlot(day, slotId);
    const chipNum = $(`[data-slotcard="${slotId}"] .chip-num`);
    if (chipNum && slot) chipNum.textContent = e.weight === '' ? '—' : (slot.added ? '+' : '') + e.weight;
    saveSoon();
    return;
  }
  if (action === 'notetext') {
    const e = activeEntry(dayId, t.getAttribute('data-slot'));
    e.note = t.value;
    const btn = $(`[data-slotcard="${t.getAttribute('data-slot')}"] .notebtn`);
    if (btn) btn.classList.toggle('has-note', !!t.value.trim());
    saveSoon();
    return;
  }
  if (action === 'rest-normal' || action === 'rest-heavy') {
    const n = parseInt(t.value, 10);
    if (Number.isFinite(n) && n >= 10 && n <= 900) {
      state.settings[action === 'rest-normal' ? 'restNormal' : 'restHeavy'] = n;
      saveSoon();
    }
    return;
  }

  const editable = { 'edit-name': 'name', 'edit-target': 'target', 'edit-cue': 'cue', 'edit-warmup': 'warmup' };
  if (editable[action]) {
    const { slot } = editedSlot();
    if (!slot) return;
    slot[editable[action]] = t.value;
    saveSoon();
    return;
  }
  if (action === 'edit-menu') {
    const { slot } = editedSlot();
    if (!slot) return;
    const lines = t.value.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length) slot.menu = lines; else delete slot.menu;
    saveSoon();
    return;
  }
});

/* ============================== export ============================== */

function exportJSON() {
  const json = JSON.stringify(state, null, 1);
  const stamp = new Date().toISOString().slice(0, 10);
  const name = `strength-rebuild-${stamp}.json`;
  const blob = new Blob([json], { type: 'application/json' });
  const file = new File([blob], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file], title: name }).then(() => {
      state.settings.lastExport = Date.now();
      save();
    }).catch(() => {});
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  state.settings.lastExport = Date.now();
  save();
}

/* ============================== boot ============================== */

load();
applyTheme();
autoFinishStale();
render();
