/* Gym Sync — one Apps Script for Strength Rebuild (Tanner) and Forte (Carolina).

   The phones POST their whole app state here after a finished session (and
   when the app is left with program/settings changes). This script:
     • keeps  Gym Sync/<App>/latest.json   — what "Restore from Drive" reads
     • keeps  Gym Sync/<App>/history/YYYY-MM-DD.json — one copy per day
     • rebuilds the "Gym Log" Google Sheet: a Sessions tab and a Progress tab
       per person.
   A phone with fewer sessions than Drive (fresh install, erased) is refused
   instead of overwriting the backup; only Import/Restore sends `force`, and
   even then the replaced copy is kept in history/.

   Optional: also commits each app's data to a private GitHub repo (state.json
   + a readable log.md with the current program), so any LLM can read both
   programs and histories in one place. Needs Script Properties `githubToken`
   (fine-grained, that one repo, Contents: read/write) and, if not the
   default, `githubRepo` (owner/name).

   Setup (once): see drive-sync/README.md. Deploy as a web app (Execute as:
   Me, Who has access: Anyone), paste the /exec URL into WEB_APP_URL below,
   then run setup(). It prints one sync code per app and saves them to
   Gym Sync/Sync codes.txt. */

const WEB_APP_URL = '';            // ← paste the Web app URL (ends in /exec) here, then run setup()

const TZ = 'America/Denver';
const ROOT_NAME = 'Gym Sync';
const SHEET_NAME = 'Gym Log';

const APPS = {
  sr: {
    person: 'Tanner', label: 'Strength Rebuild', folder: 'Strength Rebuild', repoDir: 'strength-rebuild',
    theme: { accent: '#9A5B12', wash: '#F4EBDD', up: '#F8EEDC', ink: '#1D1A15', dim: '#746D5E', faint: '#ABA393', tab: '#9A5B12' },
  },
  forte: {
    person: 'Carolina', label: 'Forte', folder: 'Forte', repoDir: 'forte',
    theme: { accent: '#A3415D', wash: '#F7E8EC', up: '#FBEEF1', ink: '#3B2A27', dim: '#87675F', faint: '#B9A19A', tab: '#B44E6B' },
  },
};
const ORDER = ['sr', 'forte'];
const WORD_FONT = 'Inter';
const NUM_FONT = 'Barlow Condensed';

/* ============================== web endpoints ============================== */

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json({ ok: false, error: 'bad-json' }); }
  const appId = body && body.app;
  if (!APPS[appId]) return json({ ok: false, error: 'bad-app' });
  if (!keyOk(appId, body.key)) return json({ ok: false, error: 'bad-key' });
  const st = body.state;
  if (!st || typeof st !== 'object' || !Array.isArray(st.sessions) || !st.program) {
    return json({ ok: false, error: 'bad-state' });
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) return json({ ok: false, error: 'busy' });
  try {
    const folder = appFolder(appId);
    const history = subFolder(folder, 'history');
    const latest = fileIn(folder, 'latest.json');
    const stamp = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');

    if (latest) {
      let prev = null;
      try { prev = JSON.parse(latest.getBlob().getDataAsString()); } catch (err) { /* unreadable → overwrite */ }
      const had = prev && Array.isArray(prev.sessions) ? prev.sessions.length : 0;
      if (!body.force && had > st.sessions.length) {
        return json({ ok: false, error: 'behind', drive: had, phone: st.sessions.length });
      }
      if (body.force && prev) {
        const when = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd-HHmmss');
        history.createFile(`${when}-replaced.json`, latest.getBlob().getDataAsString(), 'application/json');
      }
    }

    const text = JSON.stringify(st);
    writeFile(folder, 'latest.json', text);
    writeFile(history, `${stamp}.json`, text);

    let sheet = true;
    try { buildTabs(appId, st); } catch (err) { sheet = false; console.error(err); }
    let github = null;                       // null = not set up; true/false = commit result
    if (githubToken()) {
      try { github = pushToGithub(appId, st); } catch (err) { github = false; console.error(err); }
    }
    return json({ ok: true, savedAt: Date.now(), sessions: st.sessions.length, sheet, github });
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (!p.app) return ContentService.createTextOutput('Gym Sync is running.');
  if (!APPS[p.app]) return json({ ok: false, error: 'bad-app' });
  if (!keyOk(p.app, p.key)) return json({ ok: false, error: 'bad-key' });
  const latest = fileIn(appFolder(p.app), 'latest.json');
  if (!latest) return json({ ok: false, error: 'empty' });
  let st;
  try { st = JSON.parse(latest.getBlob().getDataAsString()); } catch (err) { return json({ ok: false, error: 'unreadable' }); }
  return json({ ok: true, savedAt: latest.getLastUpdated().getTime(), state: st });
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function keyOk(appId, key) {
  const want = PropertiesService.getScriptProperties().getProperty('key_' + appId);
  return !!want && typeof key === 'string' && key === want;
}

/* ============================== setup ============================== */

function setup() {
  const props = PropertiesService.getScriptProperties();
  rootFolder();
  ORDER.forEach((id) => { subFolder(appFolder(id), 'history'); });
  spreadsheet();
  ORDER.forEach((id) => {
    if (!props.getProperty('key_' + id)) {
      props.setProperty('key_' + id, Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8));
    }
  });

  if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(WEB_APP_URL)) {
    console.log('Folders, sheet and keys are ready. Now deploy as a web app, paste its /exec URL into WEB_APP_URL at the top, and run setup() again for the sync codes.');
    return;
  }
  const lines = ['Gym Sync — sync codes. Paste each into its app: Settings → Drive → Connect.', ''];
  ORDER.forEach((id) => {
    const code = 'GS1.' + Utilities.base64Encode(JSON.stringify({ u: WEB_APP_URL, k: props.getProperty('key_' + id), a: id }));
    lines.push(`${APPS[id].label} (${APPS[id].person}):`, code, '');
    console.log(`${APPS[id].label} (${APPS[id].person}) sync code:\n${code}`);
  });
  writeFile(rootFolder(), 'Sync codes.txt', lines.join('\n'));
  console.log(`Saved to Drive → ${ROOT_NAME}/Sync codes.txt. Sheet: ${spreadsheet().getUrl()}`);
}

// Run if a code ever leaks: new keys, old codes stop working. Then run setup().
function rotateKeys() {
  const props = PropertiesService.getScriptProperties();
  ORDER.forEach((id) => props.deleteProperty('key_' + id));
  setup();
}

// Redraw both people's tabs from latest.json (after editing this file's layout).
function rebuildSheet() {
  ORDER.forEach((id) => {
    const f = fileIn(appFolder(id), 'latest.json');
    if (f) buildTabs(id, JSON.parse(f.getBlob().getDataAsString()));
  });
}

/* ============================== drive ============================== */

function rootFolder() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('rootId');
  if (id) { try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (err) { /* gone */ } }
  const it = DriveApp.getRootFolder().getFoldersByName(ROOT_NAME);
  const f = it.hasNext() ? it.next() : DriveApp.getRootFolder().createFolder(ROOT_NAME);
  props.setProperty('rootId', f.getId());
  return f;
}

function appFolder(appId) { return subFolder(rootFolder(), APPS[appId].folder); }

function subFolder(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function fileIn(folder, name) {
  const it = folder.getFilesByName(name);
  return it.hasNext() ? it.next() : null;
}

function writeFile(folder, name, text) {
  const f = fileIn(folder, name);
  if (f) f.setContent(text);
  else folder.createFile(name, text, name.endsWith('.json') ? 'application/json' : 'text/plain');
}

function spreadsheet() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('sheetId');
  if (id) { try { const s = SpreadsheetApp.openById(id); if (!DriveApp.getFileById(id).isTrashed()) return s; } catch (err) { /* gone */ } }
  const ss = SpreadsheetApp.create(SHEET_NAME);
  DriveApp.getFileById(ss.getId()).moveTo(rootFolder());
  ss.setSpreadsheetTimeZone(TZ);
  props.setProperty('sheetId', ss.getId());
  ORDER.forEach((appId) => { tab(ss, appId, 'Sessions'); tab(ss, appId, 'Progress'); });
  const blank = ss.getSheetByName('Sheet1');
  if (blank && ss.getSheets().length > 1) ss.deleteSheet(blank);
  orderTabs(ss);
  return ss;
}

function tab(ss, appId, kind) {
  const name = `${APPS[appId].person} · ${kind}`;
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.setTabColor(APPS[appId].theme.tab);
    sh.setHiddenGridlines(true);
  }
  return sh;
}

function orderTabs(ss) {
  let i = 1;
  ORDER.forEach((appId) => ['Sessions', 'Progress'].forEach((kind) => {
    const sh = ss.getSheetByName(`${APPS[appId].person} · ${kind}`);
    if (sh) { ss.setActiveSheet(sh); ss.moveActiveSheet(i++); }
  }));
  const first = ss.getSheetByName(`${APPS[ORDER[0]].person} · Sessions`);
  if (first) ss.setActiveSheet(first);
}

/* ============================== the log, read ============================== */

function slug(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function num(v) {
  if (v === '' || v == null) return null;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function when(sess) {
  const t = sess.endedAt || sess.startedAt;
  const d = new Date(typeof t === 'string' && /^\d+$/.test(t) ? Number(t) : t);
  return isNaN(d.getTime()) ? null : d;
}

// Program slots by exercise id, in program order, with what the numbers mean.
function slotIndex(appId, st) {
  const map = {};
  const order = [];
  ((st.program && st.program.days) || []).forEach((day) => {
    (day.slots || []).forEach((s) => {
      const id = slug(s.name);
      if (map[id]) return;
      const assisted = !s.added && (/assist/i.test(s.target || '') || (appId === 'forte' && /chin-?ups?\b/i.test(s.name)));
      // A ladder is either explicit rungs or (Forte) the menu's short names, in order.
      const rungs = Array.isArray(s.rungs) ? s.rungs
        : Array.isArray(s.menu) ? s.menu.map((m) => String(m).split(/\s+—\s+/)[0]) : null;
      map[id] = { name: s.name, added: !!s.added, assisted, rungs };
      order.push(id);
    });
  });
  return { map, order };
}

// Every session oldest → newest, each entry read once, with "moved up"
// computed against that exercise's previous session of the same day.
function readLog(appId, st) {
  const idx = slotIndex(appId, st);
  const sessions = st.sessions
    .map((s) => ({ s, d: when(s) }))
    .filter((x) => x.d)
    .sort((a, b) => a.d - b.d);
  const prev = {};
  return {
    idx,
    unit: (st.settings && st.settings.unit) || 'lb',
    program: st.program,
    sessions: sessions.map(({ s, d }) => {
      const entries = (s.entries || []).map((e) => {
        const id = e.exerciseId || slug(e.name || '');
        const slot = idx.map[id] || { name: e.name || id, added: false, assisted: false, rungs: null };
        let w = num(e.weight);
        if (w === 0 && !slot.added && !slot.assisted) w = null;      // a logged 0 is a mishap
        const r = num(e.reps);
        const rung = e.rung || '';
        const ri = rung && slot.rungs ? slot.rungs.indexOf(rung) : -1;
        const sets = Array.isArray(e.sets) ? e.sets.length : num(e.sets);
        const up = { w: false, r: false, rung: false };
        const pk = `${s.dayId}|${id}`;       // per day: Voo's lighter practice never reads as "down" from Terra
        const p = prev[pk];
        if (p) {
          if (ri !== -1 && p.ri !== -1 && ri > p.ri) up.rung = true;
          if (w != null && p.w != null && w !== p.w) up.w = slot.assisted ? w < p.w : w > p.w;
          const sameLoad = (w == null && p.w == null) || w === p.w;
          const sameRung = ri === p.ri;
          if (r != null && p.r != null && r > p.r && sameLoad && sameRung) up.r = true;
        }
        if (w != null || r != null || ri !== -1) prev[pk] = { w, r, ri };
        return { id, slot, w, r, rung, sets: sets || null, note: (e.note || '').trim(), up };
      });
      const mins = s.startedAt && s.endedAt ? Math.round((when({ endedAt: s.endedAt }) - when({ endedAt: s.startedAt })) / 60000) : null;
      return { id: s.id, dayId: s.dayId || s.dayName || '', d, day: s.dayName || s.dayId || '', note: (s.note || '').trim(), mins: mins > 0 && mins < 300 ? mins : null, entries };
    }),
  };
}

function loadText(w, unit, slot) {
  if (w == null) return '';
  if (slot.added) return w > 0 ? `+${w} ${unit}` : 'bodyweight';
  if (slot.assisted) return w > 0 ? `${w} ${unit} help` : 'unassisted';
  return `${w} ${unit}`;
}

function cellText(e) {
  const parts = [];
  if (e.rung) parts.push(e.rung);
  if (e.w != null) parts.push(e.slot.added ? (e.w > 0 ? '+' + e.w : 'BW') : String(e.w));
  let t = parts.join(' · ');
  if (e.r != null) t = t ? `${t} × ${e.r}` : `× ${e.r}`;
  return t;
}

/* ============================== the sheet, written ============================== */

function buildTabs(appId, st) {
  const ss = spreadsheet();
  const log = readLog(appId, st);
  const synced = Utilities.formatDate(new Date(), TZ, "EEE d MMM yyyy, h:mm a");
  buildSessions(tab(ss, appId, 'Sessions'), appId, log, synced);
  buildProgress(tab(ss, appId, 'Progress'), appId, log);
}

// A painter: rows of cells, each with its own look, written in one pass.
function Grid(cols, theme) {
  this.cols = cols; this.theme = theme; this.rows = []; this.merges = []; this.heights = [];
}
Grid.prototype.row = function (cells, look, height) {
  const lk = look || {};
  const r = [];
  for (let c = 0; c < this.cols; c++) {
    const cell = cells[c];
    const v = cell && typeof cell === 'object' ? cell : { v: cell == null ? '' : cell };
    r.push(Object.assign({ bg: lk.bg || null, color: lk.color || this.theme.ink, weight: lk.weight || 'normal',
      style: lk.style || 'normal', size: lk.size || 11, font: lk.font || WORD_FONT, align: lk.align || 'left', wrap: !!lk.wrap }, v));
  }
  this.rows.push(r);
  this.heights.push(height || 24);
  if (lk.merge) this.merges.push(this.rows.length);
  return this.rows.length;
};
Grid.prototype.paint = function (sh) {
  const nR = Math.max(this.rows.length, 1);
  sh.clear();
  const all = sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns());
  all.breakApart();
  if (sh.getMaxRows() < nR) sh.insertRowsAfter(sh.getMaxRows(), nR - sh.getMaxRows());
  if (sh.getMaxRows() > nR + 2) sh.deleteRows(nR + 3, sh.getMaxRows() - nR - 2);
  if (sh.getMaxColumns() < this.cols) sh.insertColumnsAfter(sh.getMaxColumns(), this.cols - sh.getMaxColumns());
  if (sh.getMaxColumns() > this.cols + 1) sh.deleteColumns(this.cols + 2, sh.getMaxColumns() - this.cols - 1);
  if (!this.rows.length) return;
  const rng = sh.getRange(1, 1, this.rows.length, this.cols);
  const pick = (k) => this.rows.map((r) => r.map((c) => c[k]));
  rng.setNumberFormat('@')             // text before values, so "14 Oct" never turns into a date
    .setValues(pick('v'))
    .setBackgrounds(pick('bg'))
    .setFontColors(pick('color'))
    .setFontWeights(pick('weight'))
    .setFontStyles(pick('style'))
    .setFontSizes(pick('size'))
    .setFontFamilies(pick('font'))
    .setHorizontalAlignments(pick('align'))
    .setWrapStrategies(this.rows.map((r) => r.map((c) => c.wrap ? SpreadsheetApp.WrapStrategy.WRAP : SpreadsheetApp.WrapStrategy.CLIP)))
    .setVerticalAlignment('middle');
  this.merges.forEach((r) => sh.getRange(r, 1, 1, this.cols).merge());
  // Group equal heights into runs to keep the call count low.
  let start = 0;
  for (let i = 1; i <= this.heights.length; i++) {
    if (i === this.heights.length || this.heights[i] !== this.heights[start]) {
      sh.setRowHeightsForced(start + 1, i - start, this.heights[start]);
      start = i;
    }
  }
};

// Sessions: a journal, newest first. A tinted band per session (date, day,
// length), then one row per exercise; ▲ marks what moved up since last time.
function buildSessions(sh, appId, log, synced) {
  const app = APPS[appId];
  const T = app.theme;
  const g = new Grid(6, T);
  const n = log.sessions.length;
  g.row([`${app.person} · ${app.label}`], { size: 18, weight: 'bold', color: T.accent, merge: true }, 38);
  g.row([`${n} session${n === 1 ? '' : 's'} · updated ${synced} · ▲ = up since last time`], { size: 10, color: T.dim, merge: true }, 20);
  g.row([], {}, 12);
  const list = log.sessions.slice().reverse();
  if (!list.length) g.row(['No sessions yet.'], { color: T.faint, style: 'italic', merge: true });
  list.forEach((s) => {
    const date = Utilities.formatDate(s.d, TZ, 'EEE d MMM yyyy');
    const bits = [date, s.day, s.mins ? `${s.mins} min` : ''].filter(Boolean);
    g.row([bits.join('  ·  ')], { bg: T.wash, color: T.accent, weight: 'bold', size: 12, merge: true }, 32);
    s.entries.forEach((e) => {
      const mark = (txt, on) => on ? { v: `${txt}  ▲`, color: T.accent, weight: 'bold', bg: T.up } : { v: txt };
      g.row([
        { v: e.slot.name },
        Object.assign(mark(loadText(e.w, log.unit, e.slot), e.up.w), { font: NUM_FONT, size: 13, align: 'right' }),
        Object.assign(mark(e.r != null ? `${e.r} reps` : '', e.up.r), { font: NUM_FONT, size: 13, align: 'right' }),
        mark(e.rung, e.up.rung),
        { v: e.sets ? `${e.sets} sets` : '', color: T.dim, font: NUM_FONT, size: 13, align: 'right' },
        { v: e.note, color: T.dim, style: e.note ? 'italic' : 'normal', wrap: true },
      ], {}, 26);
    });
    if (!s.entries.length) g.row(['Nothing recorded.'], { color: T.faint, style: 'italic', merge: true });
    if (s.note) g.row([`“${s.note}”`], { color: T.dim, style: 'italic', merge: true, wrap: true }, 26);
    g.row([], {}, 14);
  });
  g.paint(sh);
  [200, 104, 74, 170, 64, 280].forEach((w, i) => sh.setColumnWidth(i + 1, w));
  sh.setFrozenRows(2);
  sh.setFrozenColumns(0);
}

// Progress: one block per training day — its exercises down, its sessions
// across, newest on the left. Cells read "weight × reps" or "rung × reps";
// tinted bold = up since that day's last session.
function buildProgress(sh, appId, log) {
  const app = APPS[appId];
  const T = app.theme;
  const unit = log.unit;

  // Days in program order, then any the log has that the program no longer does.
  const days = [];
  const dayOf = {};
  ((log.program && log.program.days) || []).forEach((d) => { dayOf[d.id] = { id: d.id, name: d.name, order: (d.slots || []).map((x) => slug(x.name)), list: [] }; days.push(dayOf[d.id]); });
  log.sessions.slice().reverse().forEach((s) => {
    if (!dayOf[s.dayId]) {
      // Older logs may carry a day id the program has since renamed — match by name.
      const nm = String(s.day).split(' — ')[0];
      const same = days.find((d) => d.name === nm);
      if (same) dayOf[s.dayId] = same;
    }
    if (!dayOf[s.dayId]) { dayOf[s.dayId] = { id: s.dayId, name: String(s.day).split(' — ')[0] || 'Other', order: [], list: [] }; days.push(dayOf[s.dayId]); }
    dayOf[s.dayId].list.push(s);
  });
  const blocks = days.filter((d) => d.list.length);
  const cols = Math.max(2, 1 + Math.max(0, ...blocks.map((d) => d.list.length)));
  const g = new Grid(cols, T);
  // Column A is frozen, so these two lines must fit its width (no merging across a freeze).
  g.row([`${app.person} · Progress`], { size: 16, weight: 'bold', color: T.accent }, 36);
  g.row(['Newest on the left · tinted = up'], { size: 10, color: T.dim }, 20);
  if (!blocks.length) g.row(['Nothing logged yet.'], { color: T.faint, style: 'italic' });

  blocks.forEach((day) => {
    g.row([], {}, 14);
    const head = day.list.map((s) => ({ v: Utilities.formatDate(s.d, TZ, 'd MMM'), font: NUM_FONT, size: 13, align: 'center' }));
    g.row([{ v: day.name, size: 13 }].concat(head), { bg: T.wash, color: T.accent, weight: 'bold' }, 30);
    const seen = {};
    day.list.forEach((s) => s.entries.forEach((e) => { if (cellText(e)) seen[e.id] = e.slot.name; }));
    const ids = day.order.filter((id) => seen[id]);
    const retired = Object.keys(seen).filter((id) => ids.indexOf(id) === -1).sort((a, b) => seen[a].localeCompare(seen[b]));
    ids.concat(retired).forEach((id) => {
      const isRetired = ids.indexOf(id) === -1;
      const slot = log.idx.map[id] || { name: seen[id] };
      const unitNote = slot.added ? ` (+${unit})` : slot.assisted ? ` (${unit} help)` : '';
      const cells = [{ v: slot.name + unitNote, color: isRetired ? T.faint : T.ink, weight: 'bold', wrap: true }];
      // Ladder rows carry words, not numbers: smaller, wrapped, a taller row.
      const words = day.list.some((s) => s.entries.some((x) => x.id === id && x.rung));
      const face = words ? { font: WORD_FONT, size: 9, wrap: true } : { font: NUM_FONT, size: 13 };
      day.list.forEach((s) => {
        const e = s.entries.find((x) => x.id === id);
        const txt = e ? cellText(e) : '';
        const up = e && (e.up.w || e.up.r || e.up.rung);
        cells.push(Object.assign(up ? { v: txt, bg: T.up, color: T.accent, weight: 'bold', align: 'center' }
                                    : { v: txt, color: isRetired ? T.faint : T.ink, align: 'center' }, face));
      });
      g.row(cells, {}, words ? 46 : 28);
    });
  });

  g.paint(sh);
  sh.setColumnWidth(1, 230);
  sh.setColumnWidths(2, cols - 1, 84);
  sh.setFrozenRows(2);
  sh.setFrozenColumns(1);
}

/* ============================== GitHub mirror ============================== */

const DEFAULT_REPO = 'teleokinetic/gym-data';

function githubToken() { return PropertiesService.getScriptProperties().getProperty('githubToken'); }
function githubRepo() { return PropertiesService.getScriptProperties().getProperty('githubRepo') || DEFAULT_REPO; }

function gh(method, path, body) {
  const res = UrlFetchApp.fetch(`https://api.github.com/repos/${githubRepo()}${path}`, {
    method, muteHttpExceptions: true, contentType: 'application/json',
    headers: { Authorization: `Bearer ${githubToken()}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    payload: body ? JSON.stringify(body) : undefined,
  });
  const code = res.getResponseCode();
  if (code >= 300) throw new Error(`GitHub ${method} ${path} → ${code}: ${res.getContentText().slice(0, 300)}`);
  return JSON.parse(res.getContentText() || '{}');
}

// One commit per sync: <app>/state.json (the app's whole state, readable
// indentation) and <app>/log.md (program + every session in plain words).
// Skips the commit when nothing changed.
function pushToGithub(appId, st) {
  const app = APPS[appId];
  const ref = gh('get', '/git/ref/heads/main');
  const parent = ref.object.sha;
  const base = gh('get', `/git/commits/${parent}`).tree.sha;
  const tree = gh('post', '/git/trees', {
    base_tree: base,
    tree: [
      { path: `${app.repoDir}/state.json`, mode: '100644', type: 'blob', content: JSON.stringify(st, null, 1) + '\n' },
      { path: `${app.repoDir}/log.md`, mode: '100644', type: 'blob', content: logMarkdown(appId, st) },
    ],
  });
  if (tree.sha === base) return true;
  const last = st.sessions.length ? when(st.sessions.reduce((a, b) => ((when(b) || 0) > (when(a) || 0) ? b : a))) : null;
  const msg = `${app.person} · ${app.label}: ${st.sessions.length} sessions` +
    (last ? `, last ${Utilities.formatDate(last, TZ, 'EEE d MMM')}` : '');
  const commit = gh('post', '/git/commits', { message: msg, tree: tree.sha, parents: [parent] });
  gh('patch', '/git/refs/heads/main', { sha: commit.sha });
  return true;
}

function logMarkdown(appId, st) {
  const app = APPS[appId];
  const log = readLog(appId, st);
  const u = log.unit;
  const out = [];
  out.push(`# ${app.person} · ${app.label}`, '');
  out.push(`Generated by Gym Sync from the app's data on ${Utilities.formatDate(new Date(), TZ, 'EEE d MMM yyyy, h:mm a')}. ` +
    `${log.sessions.length} sessions · loads in ${u} · "(up)" = moved up since that day's previous session. ` +
    `Full data: state.json.`, '');
  out.push('## Current program', '');
  ((st.program && st.program.days) || []).forEach((d) => {
    out.push(`### ${d.name}${d.subtitle ? ' — ' + d.subtitle : ''}`, '');
    (d.slots || []).forEach((s) => {
      const kind = [s.track ? (s.added ? `added load (${u})` : /assist/i.test(s.target || '') || (appId === 'forte' && /chin-?ups?\b/i.test(s.name)) ? `assistance (${u}, lower is harder)` : `load (${u})`) : '',
        s.reps ? 'reps' : '', s.rest ? `${s.rest} rest` : ''].filter(Boolean).join(', ');
      out.push(`- **${s.name}**${s.target ? ` — ${s.target}` : ''}${kind ? ` _(${kind})_` : ''}`);
      if (s.warmup) out.push(`  - Warm-up: ${s.warmup}`);
      if (s.cue) out.push(`  - Cue: ${s.cue}`);
      const ladder = Array.isArray(s.rungs) ? s.rungs : null;
      if (ladder) out.push(`  - Ladder: ${ladder.join(' → ')}`);
      if (Array.isArray(s.menu) && s.menu.length) out.push(`  - Options: ${s.menu.join('; ')}`);
    });
    out.push('');
  });
  out.push('## Sessions, newest first', '');
  log.sessions.slice().reverse().forEach((s) => {
    out.push(`### ${Utilities.formatDate(s.d, TZ, 'EEE d MMM yyyy')} · ${s.day}${s.mins ? ` · ${s.mins} min` : ''}`, '');
    s.entries.forEach((e) => {
      const bits = [];
      const load = loadText(e.w, u, e.slot);
      if (e.rung) bits.push(e.rung + (e.up.rung ? ' (up)' : ''));
      if (load) bits.push(load + (e.up.w ? ' (up)' : ''));
      if (e.r != null) bits.push(`${e.r} reps` + (e.up.r ? ' (up)' : ''));
      if (e.sets) bits.push(`${e.sets} sets`);
      out.push(`- ${e.slot.name}${bits.length ? ': ' + bits.join(' · ') : ''}${e.note ? ` — ${e.note}` : ''}`);
    });
    if (s.note) out.push('', `> ${s.note}`);
    out.push('');
  });
  return out.join('\n');
}

// Run once after adding the githubToken property: mirrors both apps' latest
// Drive copy to the repo right away and reports what happened.
function syncGithubNow() {
  if (!githubToken()) { console.log('Add a githubToken Script Property first (Project Settings → Script Properties).'); return; }
  ORDER.forEach((id) => {
    const f = fileIn(appFolder(id), 'latest.json');
    if (!f) { console.log(`${APPS[id].label}: nothing on Drive yet — it goes up with the first sync.`); return; }
    pushToGithub(id, JSON.parse(f.getBlob().getDataAsString()));
    console.log(`${APPS[id].label}: committed to ${githubRepo()}.`);
  });
}
