/* Form clips — a faint play ring on rows that have clips. Tapping it grows a
   full-screen viewer out of the ring: Good form, swipe to Common mistake.
   Motion follows Marvin Schwaibold's lab viewer: one critically damped spring
   (tension 300, friction 35), the page behind scales back and blurs, and the
   labels sharpen as they land. Pull down or tap ✕ to send it home. */
(() => {
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* The clips, keyed by the slot's name. Each clip page loops one view. */
  const TUTS = [{
    match: /see-?saw/i,
    page: 'clips/see-saw-press.html',
    clips: [
      { mode: 'correct', view: 'front', label: 'Good form',
        cap: '<b>Bells pass at head height.</b> One presses up as the other lowers with control; ribs stay stacked over the hips.' },
      { mode: 'mistake', view: 'side', label: 'Common mistake',
        cap: '<b>Leaning back.</b> The ribs flare, the low back arches and the top bell drifts out in front of the face.' },
    ],
  }];
  const tutFor = (name) => TUTS.find((t) => t.match.test(name || ''));

  const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle class="tr" cx="12" cy="12" r="10.6"/><path class="tp" d="M10 8.2v7.6l6-3.8z"/></svg>';

  /* ---------- the ring, on rows that have clips ---------- */
  function decorate() {
    document.querySelectorAll('.slot[data-slotcard]').forEach((card) => {
      if (card.querySelector('[data-tut]')) return;
      const nameEl = card.querySelector('.slot-name');
      const row = card.querySelector('.slot-row');
      if (!nameEl || !row || !tutFor(nameEl.textContent)) return;
      const id = card.dataset.slotcard, name = nameEl.textContent.trim();
      const sub = ((card.querySelector('.slot-sub') || {}).textContent || '').trim();
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'tut-btn tut-row';
      b.setAttribute('aria-label', `Watch form for ${name}`);
      b.innerHTML = PLAY;
      Object.assign(b.dataset, { tut: id, tname: name, tsub: sub });
      if (isOpen && srcId === id) b.classList.add('away');
      const chip = row.querySelector('.chip');
      chip ? row.insertBefore(b, chip) : row.appendChild(b);
    });
  }

  /* ---------- springs: tension/friction (mass 1) as a CSS linear() easing ---------- */
  function spring(k, c) {
    let x = 0, v = 0, t = 0; const dt = 1 / 600, pts = [];
    while (t < 2.5) {
      const a = k * (1 - x) - c * v; v += a * dt; x += v * dt; t += dt; pts.push(x);
      if (Math.abs(1 - x) < 0.003 && Math.abs(v) < 0.02) break;
    }
    const n = 40, out = [];
    for (let i = 0; i <= n; i++) out.push(`${(i === n ? 1 : pts[Math.min(pts.length - 1, Math.round(pts.length * i / n))]).toFixed(4)} ${(100 * i / n).toFixed(1)}%`);
    return { easing: `linear(${out.join(', ')})`, duration: Math.round(t * 1000) };
  }
  const S = spring(300, 35);                     // open, close and spring-back
  const POP = spring(0.36, 0.6).easing;          // the ring's small pop on return

  /* ---------- the viewer ---------- */
  let root, sheet, content, pager, tabs, bar, scrim, src = null, srcId = null, isOpen = false, anims = [];
  function build() {
    root = document.createElement('div');
    root.className = 'tut-root'; root.hidden = true;
    root.innerHTML = `<div class="tut-scrim"></div>
      <div class="tut-sheet" role="dialog" aria-modal="true" aria-label="Form">
        <div class="tut-content">
          <div class="tut-head"><div class="tut-title"><b></b><span></span></div>
            <button type="button" class="tut-x" aria-label="Close"><svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></button></div>
          <div class="tut-tabs" role="tablist"></div>
          <div class="tut-pager"></div>
          <span class="tut-grab" aria-hidden="true"></span>
        </div>
      </div>`;
    document.body.appendChild(root);
    sheet = root.querySelector('.tut-sheet'); content = root.querySelector('.tut-content');
    pager = root.querySelector('.tut-pager'); tabs = root.querySelector('.tut-tabs');
    scrim = root.querySelector('.tut-scrim');
    root.querySelector('.tut-x').onclick = () => close();
    pager.addEventListener('scroll', paintTabs, { passive: true });
    addEventListener('resize', paintTabs);
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen) close(); });
    dragToDismiss();
  }

  function fill(btn) {
    const t = tutFor(btn.dataset.tname);
    root.querySelector('.tut-title b').textContent = btn.dataset.tname;
    root.querySelector('.tut-title span').textContent = btn.dataset.tsub;
    tabs.innerHTML = t.clips.map((c, i) => `<button type="button" role="tab" class="tut-tab" data-p="${i}"><i></i>${c.label}</button>`).join('') + '<span class="tut-bar"></span>';
    bar = tabs.querySelector('.tut-bar');
    tabs.querySelectorAll('.tut-tab').forEach((b) => b.onclick = () => pager.scrollTo({ left: +b.dataset.p * pager.clientWidth, behavior: reduced() ? 'auto' : 'smooth' }));
    pager.innerHTML = t.clips.map((c) => `<section class="tut-page" aria-label="${c.label}">
        <div class="tut-stage"><iframe src="${t.page}?mode=${c.mode}&view=${c.view}" title="${c.label}, looping" tabindex="-1"></iframe></div>
        <p class="tut-cap">${c.cap}</p></section>`).join('');
    pager.scrollLeft = 0;
  }

  function paintTabs() {
    if (!bar) return;
    const f = pager.clientWidth ? pager.scrollLeft / pager.clientWidth : 0;
    const ts = [...tabs.querySelectorAll('.tut-tab')];
    if (ts.length < 2) return;
    // offset* ignores the open's scale, so the bar is right mid-animation too.
    const [a, b] = ts;
    const left = a.offsetLeft + (b.offsetLeft - a.offsetLeft) * f, w = a.offsetWidth + (b.offsetWidth - a.offsetWidth) * f;
    bar.style.transform = `translateX(${left}px) scaleX(${w})`; bar.style.width = '1px';
    ts.forEach((t, i) => { t.classList.toggle('on', Math.round(f) === i); t.setAttribute('aria-selected', Math.round(f) === i); });
  }

  const insetFor = (r, rad) => `inset(${r.top}px ${innerWidth - r.right}px ${innerHeight - r.bottom}px ${r.left}px round ${rad}px)`;
  const stopAll = () => { anims.forEach((a) => a.cancel()); anims = []; };
  const appEl = () => document.getElementById('app');
  const T = () => ({ duration: S.duration, easing: S.easing, fill: 'both' });
  // The app redraws its screen wholesale, so find the ring again by its row.
  const liveBtn = () => (src && src.isConnected ? src : document.querySelector(`[data-tut="${srcId}"]`));

  function open(btn) {
    if (!root) build();
    if (isOpen) return;
    isOpen = true; src = btn; srcId = btn.dataset.tut;
    fill(btn);
    root.hidden = false; root.classList.add('live');
    requestAnimationFrame(paintTabs);
    const r = btn.getBoundingClientRect(), rad = Math.min(r.height / 2, 14);
    btn.classList.add('away');
    stopAll();
    sheet.style.transform = ''; sheet.style.clipPath = '';
    content.style.transformOrigin = `${r.left + r.width / 2}px ${r.top + r.height / 2}px`;
    if (reduced()) { anims.push(root.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120, easing: 'ease-out' })); return; }
    const small = `scale(${Math.max(r.width / innerWidth, 0.12)})`;
    anims.push(sheet.animate([{ clipPath: insetFor(r, rad) }, { clipPath: 'inset(0px 0px 0px 0px round 0px)' }], T()));
    anims.push(content.animate([{ transform: small }, { transform: 'scale(1)' }], T()));
    // Offsets are in spring progress (the easing maps time to progress first),
    // so the 10–90% band is Marvin's.
    anims.push(scrim.animate([{ opacity: 0, offset: 0 }, { opacity: 0, offset: 0.1 }, { opacity: 0.65, offset: 0.9 }, { opacity: 0.65, offset: 1 }], T()));
    anims.push(content.animate([{ opacity: 0, offset: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 1, offset: 1 }], T()));
    root.querySelectorAll('.tut-head, .tut-tabs, .tut-cap').forEach((el) => anims.push(el.animate([
      { opacity: 0, filter: 'blur(3px)', transform: 'scale(1.07)', offset: 0 },
      { opacity: 0, filter: 'blur(3px)', transform: 'scale(1.07)', offset: 0.1 },
      { opacity: 1, filter: 'blur(0px)', transform: 'scale(1)', offset: 1 }], T())));
    anims.push(appEl().animate([
      { transform: 'scale(1)', filter: 'blur(0px)', offset: 0 },
      { transform: 'scale(0.97)', filter: 'blur(0px)', offset: 0.1 },
      { transform: 'scale(0.94)', filter: 'blur(16px)', offset: 0.9 },
      { transform: 'scale(0.94)', filter: 'blur(16px)', offset: 1 }], T()));
  }

  function close(drag) {
    if (!isOpen) return;
    isOpen = false;
    const btn = liveBtn();
    const r = btn ? btn.getBoundingClientRect() : null;
    const home = r && r.width > 0 && r.bottom > 0 && r.top < innerHeight;
    stopAll();
    root.classList.remove('live');
    const done = () => {
      root.hidden = true; stopAll(); sheet.style.transform = ''; sheet.style.clipPath = ''; scrim.style.opacity = '';
      pager.innerHTML = '';
      const b = liveBtn(); src = null; srcId = null;
      if (!b) return;
      b.classList.remove('away');
      if (!reduced()) b.animate([{ transform: 'scale(1.14)' }, { transform: 'scale(1)' }], { duration: 420, easing: POP });
      b.focus({ preventScroll: true });
    };
    // No ring on screen to go home to (or reduced motion): a plain fade.
    if (reduced() || !home) {
      const a = root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: reduced() ? 120 : 220 });
      a.onfinish = () => { a.cancel(); done(); };
      return;
    }
    content.style.transformOrigin = `${r.left + r.width / 2}px ${r.top + r.height / 2}px`;
    const small = `scale(${Math.max(r.width / innerWidth, 0.12)})`;
    const rad = Math.min(r.height / 2, 14);
    anims.push(sheet.animate([
      { clipPath: drag ? drag.clip : 'inset(0px 0px 0px 0px round 0px)', transform: drag ? drag.transform : 'none' },
      { clipPath: insetFor(r, rad), transform: 'none' }], T()));
    anims.push(content.animate([{ transform: 'scale(1)' }, { transform: small }], T()));
    anims.push(content.animate([{ opacity: 1, offset: 0 }, { opacity: 1, offset: 0.45 }, { opacity: 0, offset: 0.8 }, { opacity: 0, offset: 1 }], T()));
    anims.push(scrim.animate([{ opacity: drag ? +scrim.style.opacity || 0.65 : 0.65, offset: 0 }, { opacity: 0.65, offset: 0.1 }, { opacity: 0, offset: 0.9 }, { opacity: 0, offset: 1 }], T()));
    const a = appEl().animate([
      { transform: 'scale(0.94)', filter: 'blur(16px)', offset: 0 },
      { transform: 'scale(0.94)', filter: 'blur(16px)', offset: 0.1 },
      { transform: 'scale(0.97)', filter: 'blur(0px)', offset: 0.9 },
      { transform: 'scale(1)', filter: 'blur(0px)', offset: 1 }], T());
    anims.push(a);
    a.onfinish = done;
  }

  /* Pull down anywhere to close: the sheet follows the finger, shrinks a
     little and rounds its corners; let go past 30% of the screen (or flick)
     and it goes home into the ring, otherwise it springs back. */
  function dragToDismiss() {
    let st = null;
    sheet.addEventListener('pointerdown', (e) => {
      if (!isOpen || e.target.closest('button')) return;
      st = { x: e.clientX, y: e.clientY, mode: null, sl: pager.scrollLeft, id: e.pointerId, ly: e.clientY, lt: performance.now(), v: 0 };
    });
    sheet.addEventListener('pointermove', (e) => {
      if (!st || e.pointerId !== st.id) return;
      const dx = e.clientX - st.x, dy = e.clientY - st.y;
      if (!st.mode) {
        if (dy > 5 && dy > Math.abs(dx)) { st.mode = 'v'; try { sheet.setPointerCapture(e.pointerId); } catch (_) {} stopAll(); }
        else if (e.pointerType === 'mouse' && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) { st.mode = 'h'; try { sheet.setPointerCapture(e.pointerId); } catch (_) {} pager.style.scrollSnapType = 'none'; }
        else return;
      }
      if (st.mode === 'h') { pager.scrollLeft = st.sl - dx; return; }
      const now = performance.now();
      st.v = (e.clientY - st.ly) / Math.max(1, now - st.lt); st.ly = e.clientY; st.lt = now;
      const d = Math.max(0, dy), s = 1 - d / (2 * innerHeight) * 0.6, rad = Math.min(d / 3, 44);
      st.transform = `translateY(${d * 0.5}px) scale(${s})`;
      st.clip = `inset(0px 0px 0px 0px round ${rad}px)`;
      sheet.style.transform = st.transform; sheet.style.clipPath = st.clip;
      scrim.style.opacity = String(0.65 * (1 - Math.min(1, d / (2 * innerHeight))));
      // Hold the page behind where the open left it while dragging.
      appEl().style.transform = 'scale(0.94)'; appEl().style.filter = 'blur(16px)';
    });
    const end = (e) => {
      if (!st || e.pointerId !== st.id) return;
      const s = st; st = null;
      if (s.mode === 'h') {
        const w = pager.clientWidth, dx = e.clientX - s.x;
        const p = Math.max(0, Math.min(1, Math.round((s.sl - dx * 1.6) / w)));
        pager.style.scrollSnapType = '';
        pager.scrollTo({ left: p * w, behavior: 'smooth' });
        return;
      }
      if (s.mode !== 'v') return;
      appEl().style.transform = ''; appEl().style.filter = '';
      const dy = e.clientY - s.y;
      if (dy > 0.3 * innerHeight || (s.v > 0.1 && dy > 24)) { close({ transform: s.transform, clip: s.clip }); return; }
      sheet.style.transform = ''; sheet.style.clipPath = ''; scrim.style.opacity = '';
      anims.push(sheet.animate([{ transform: s.transform, clipPath: s.clip }, { transform: 'none', clipPath: 'inset(0px 0px 0px 0px round 0px)' }], { duration: S.duration, easing: S.easing }));
      anims.push(appEl().animate([{ transform: 'scale(0.94)', filter: 'blur(16px)' }], { duration: 1, fill: 'forwards' }));
    };
    sheet.addEventListener('pointerup', end);
    sheet.addEventListener('pointercancel', end);
  }

  /* Taps on the ring never reach the row's own handler. */
  addEventListener('click', (e) => {
    const b = e.target.closest('[data-tut]');
    if (!b) return;
    e.stopPropagation(); e.preventDefault();
    open(b);
  }, true);

  const app = document.getElementById('app');
  if (app) { new MutationObserver(decorate).observe(app, { childList: true, subtree: true }); decorate(); }
})();
