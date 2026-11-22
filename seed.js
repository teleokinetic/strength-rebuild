// Strength Rebuild — program seed (v3.5)
// This is only the FIRST-RUN seed. After first launch the program lives in
// localStorage and is edited in-app; changes here won't overwrite it.
// (Installed phones get v3.0 once, through patchProgram.)
//
// v0.3 model: no per-set logging. Two kinds of slot —
//   track: true   → one working-weight capture, prefilled from last session
//   menu: [...]   → task menu (ecological variation), note instead of numbers
//   rungs: [...]  → ordered ladder; tap today's rung, the targets board reads it
// rest: 'normal' | 'heavy' picks which rest-button tier the slot suggests.
// pair: slots sharing a key within a day are done together, alternating sets —
//   short: the name partners use when pointing at this slot.
//   pairRest: optional rest (seconds) the group takes instead of the normal tier.
//
// v3.0 additions —
//   dow: the weekday a day belongs to (1 = Monday … 6 = Saturday); Up next
//     follows the calendar and the week counts "of 3".
//   bw: reps only — no weight row (bodyweight practice, rollouts, core).
//   light: the easier repeat of a lift trained harder on another day. Its own
//     name keeps its own history, so it never prefills the main lift; the
//     progression page leaves it out.
//   optional: doesn't hold back the trail or Finish.
//   step: the chip's ± step (default 5); 2.5 where the dumbbells go up by 2.5.
//   start: a one-time Week 1 prefill, used until the lift is next logged.
//   backoff: squat back-off sets as a fraction of the top set, shown live.
//
// Days (his 10/17 call): A and B keep their letters and their history —
// A is still squat + horizontal (now Wednesday), B still hinge + vertical
// (now Saturday). C is the new light Monday.
//
// v3.5 (his 11/22 spec): new angles on press, row and pull; Day C becomes
// dips + face pulls, slider curls + bottoms-up carry, transitional squats.
// History carries only where the lift is near-identical (chin-up → weighted
// pull-up, reverse crunch → incline reverse crunch — relabelled in
// patchProgram); everything else that changed starts its own line. One-line
// cues on the new lifts only. Off-day no-hangs and Friday sprints live
// outside the days (state.offdays) and never count toward "of 3".

const SEED_PROGRAM = {
  specVersion: '3.5',
  days: [
    {
      id: 'dayC',
      title: 'Hips & Ease',
      name: 'Day C',
      subtitle: 'Hips + Easy upper',
      dow: 1,
      slots: [
        {
          id: 'c1', name: 'Smith hip thrust', target: '3×8–12 · RIR 3',
          track: true, reps: true, rest: 'heavy', start: 135,
        },
        {
          id: 'c5', name: 'Parallel bar dips', target: '2×6–10 · RIR 3–4',
          track: true, bw: true, reps: true, rest: 'normal', pair: 'a', pairRest: 90, short: 'dips',
          cue: '3 s down, comfortable depth — practice, not a grinder',
        },
        {
          id: 'c6', name: 'Cable rope face pull', target: '2×12–15 · RIR 3',
          track: true, reps: true, rest: 'normal', pair: 'a', short: 'face pulls',
          cue: 'Thumbs back · pause in the goalpost, hands beat elbows',
        },
        {
          id: 'c7', name: 'Slider eccentric leg curl', target: '2×6–10 /side · RIR 3',
          track: true, bw: true, reps: true, rest: 'normal', pair: 'b', pairRest: 90, short: 'slider curls',
          cue: '2 up, 1 down · right first, 3–4 s lowering, hips high',
        },
        {
          id: 'c8', name: 'Bottoms-up KB carry', target: '2×30–40 m /side',
          track: true, rest: 'normal', pair: 'b', short: 'the carry',
          cue: 'Start light · elbow at 90°, wrist stacked, ribs quiet',
        },
        {
          id: 'c9', name: 'Loaded transitional squats', target: '3 sets · one per shape',
          track: true, rest: 'normal',
          menu: ['Cossack squat', 'Rotational squat', 'Unicorn / deep rotational'],
        },
      ],
    },
    {
      id: 'dayA',
      title: 'Squat & Press',
      name: 'Day A',
      subtitle: 'Squat + Horizontal',
      dow: 3,
      slots: [
        {
          id: 'a2', name: 'Back squat', target: '4×5–8 · top + 3 back-off',
          track: true, reps: true, rest: 'heavy', backoff: 0.92,
          cue: 'Top set ~2 RIR · reps first — top set hits 8, then +5 lb',
        },
        {
          id: 'a13', name: 'Low-incline DB press', target: '3×5–8 · RIR 2',
          track: true, reps: true, rest: 'normal', pair: 'a', pairRest: 90, short: 'the press',
          cue: 'Bench on notch 1–2 (15–30°) · elbows ~30–45° from the torso',
        },
        {
          id: 'a14', name: 'Chest-supported DB row', target: '3×8–12 · RIR 2',
          track: true, reps: true, rest: 'normal', pair: 'a', short: 'the row',
          cue: 'Same bench, chest down · elbows ~45°, pause at full squeeze',
        },
        {
          id: 'a11', name: 'Single-leg curl', target: '2×8–12 /side · RIR 2–3',
          track: true, reps: true, rest: 'normal', pair: 'b', pairRest: 90, short: 'curls',
          cue: 'Right leg first · lb per leg',
        },
        {
          id: 'a12', name: 'Ab-wheel rollout', target: '2×5–8 · kneeling, wall-stopped',
          track: true, bw: true, reps: true, rest: 'normal', pair: 'b', short: 'rollouts',
          cue: 'Exploring rib and pelvis control — no forced progression',
        },
        {
          id: 'a15', name: 'Single-leg calf raise, hip lock + reach', target: '2×8–15 /side',
          track: true, reps: true, rest: 'normal', pair: 'c', pairRest: 60, short: 'calves',
          cue: 'Free knee locked at 90/90 · same-side arm reaches tall',
          menu: [
            'Same-side reach — the default',
            'Light KB overhead in the reaching hand',
            'Bottoms-up KB overhead',
            'Opposite-arm reach',
          ],
        },
        {
          id: 'a16', name: 'High-tension bar hang', target: '2–3×10–15 s /side',
          track: false, rest: 'normal', pair: 'c', short: 'hang',
          cue: '3–5 s in reserve — stop before fingers uncurl or shoulders shrug',
          menu: [
            'Single-arm, 3-finger assist',
            'Single-arm, 2-finger assist',
            'Single-arm, 1-finger assist',
            'Towel draped over the bar',
            'Light hold on the working wrist',
            'Two-hand towel hang',
          ],
        },
      ],
    },
    {
      id: 'dayB',
      title: 'Hinge & Pull',
      name: 'Day B',
      subtitle: 'Hinge + Vertical',
      dow: 6,
      slots: [
        {
          id: 'b13', name: 'Single-arm KB swing', target: '3×6–8 /side',
          track: true, rest: 'normal',
          menu: [
            'Single-arm — one side, then the other',
            'Hand-to-hand alternating — 3×12–16 total',
            'Rotational med-ball slam — 3×6–8, if forearms are cooked',
          ],
        },
        {
          id: 'b14', name: 'B-stance DB RDL, contralateral', target: '3×6–10 /side · RIR 2',
          track: true, reps: true, rest: 'normal', short: 'the RDL',
          cue: '~80–85% on the front foot · DB in the opposite hand · hips square',
        },
        {
          id: 'b4', name: 'Weighted pull-up', target: '3×5–8 · RIR 2',
          track: true, added: true, reps: true, rest: 'heavy', short: 'pull-ups',
          cue: '8,8,8 crisp two Saturdays → +5',
          menu: [
            'Supinated (underhand)',
            'Neutral grip',
            'Mini-clusters — 3 + 3 with 10–15 s off the bar, if grip goes before lats',
          ],
        },
        {
          id: 'b15', name: 'See-saw KB press', target: '3×6–8 /side · RIR 2',
          track: true, reps: true, rest: 'heavy', short: 'the press',
          cue: 'One bell lowers as the other presses · pull the lowering bell down',
        },
        {
          id: 'b11', name: 'Incline reverse crunch', target: '2–3×8–12',
          track: true, bw: true, reps: true, rest: 'normal', short: 'core',
          menu: [
            'Incline bench — roll the pelvis up toward the ribs',
            'Hanging knee-to-chest — slow down, zero swing',
            'Ab straps or captain’s chair — if forearms are cooked',
            'Angled knee raise — knees toward the opposite armpit',
          ],
        },
        {
          id: 'b16', name: 'Seated calf raise', target: '2×10–15 · RIR 2–3',
          track: true, reps: true, optional: true, rest: 'normal', short: 'calves',
          cue: 'Pause 2 s in the bottom stretch · skip if sprints cooked the calves',
        },
      ],
    },
  ],
};
