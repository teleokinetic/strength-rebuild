// Strength Rebuild — program seed (v3.0)
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

const SEED_PROGRAM = {
  specVersion: '3.2',
  days: [
    {
      id: 'dayC',
      title: 'Hips & Ease',
      name: 'Day C',
      subtitle: 'Hips + Easy upper',
      dow: 1,
      slots: [
        {
          id: 'c1', name: 'Smith hip thrust', target: '2×8–12 · RIR 3',
          track: true, reps: true, rest: 'normal', start: 135,
        },
        {
          id: 'c2', name: 'Push-up practice', target: '2×6–10 · RIR 3–4',
          track: true, bw: true, reps: true, light: true, rest: 'normal', pair: 'a', short: 'push-ups',
          cue: 'One variation · 3 s down, 1 s pause',
        },
        {
          id: 'c3', name: 'Chin-up practice', target: '2×5–6 · RIR 3–4',
          track: true, bw: true, reps: true, light: true, rest: 'normal', pair: 'a', short: 'chins',
        },
        {
          id: 'c4', name: 'Single-leg curl, light', target: '2×10–15 /side · RIR 3',
          track: true, reps: true, light: true, rest: 'normal', pair: 'b', short: 'curls', start: 30,
          cue: 'Right leg first · lb per leg',
        },
        {
          id: 'a8', name: 'Pallof press', target: '2×10–12 /side · 2 s pause',
          track: true, reps: true, rest: 'normal', pair: 'b', short: 'Pallof',
        },
        {
          id: 'a7', name: 'Suitcase carry', target: '2×30–40 m /side',
          track: true, rest: 'normal', pair: 'c', short: 'the carry',
        },
        {
          id: 'a5', name: 'Stork squat', target: '2×8–10 /side',
          track: true, reps: true, rest: 'normal', pair: 'c', short: 'stork',
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
          id: 'a2', name: 'Back squat', target: '4×5 · top + 3 back-off',
          track: true, rest: 'heavy', backoff: 0.92,
          cue: 'Top set ~2 RIR · wk 2: top 185, then +5 every 1–2 wks',
        },
        {
          id: 'a3', name: 'DB bench press', target: '3×5–8 · RIR 2',
          track: true, reps: true, rest: 'normal', pair: 'a', short: 'the bench',
        },
        {
          id: 'a4', name: 'One-arm DB row', target: '3×6–10 /side · RIR 2',
          track: true, reps: true, rest: 'normal', pair: 'a', short: 'the row',
        },
        {
          id: 'a11', name: 'Single-leg curl', target: '2×8–12 /side · RIR 2–3',
          track: true, reps: true, rest: 'normal', pair: 'b', short: 'curls',
          cue: 'Right leg first · lb per leg',
        },
        {
          id: 'a12', name: 'Ab-wheel rollout', target: '2×5–8 · kneeling, wall-stopped',
          track: true, bw: true, reps: true, rest: 'normal', pair: 'b', short: 'rollouts',
          cue: 'Wall where 5–6 feel solid, no low-back arch · 2×8 → move back',
        },
        {
          id: 'b8', name: 'Calf, single-leg', target: '2×8–15 /side · RIR 2',
          track: true, reps: true, rest: 'normal', pair: 'c', short: 'calves',
          menu: [
            'Split squat iso + calf raise',
            '3D calf raise',
          ],
        },
        {
          id: 'a9', name: 'Hang / grip', target: '2×20–40 s',
          track: false, rest: 'normal', pair: 'c', short: 'hang',
          menu: [
            'Active→passive hang', 'Offset grip', 'Single-arm assisted', 'Traverse the bar',
            'Dead-hang max — occasional test: 60 s solid · 90 s strong (log it in a note)',
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
          id: 'prep-dayB', name: 'Prep', target: '~4 min',
          track: false, rest: 'normal',
        },
        {
          id: 'b1', name: 'Kettlebell swing', target: '3×6–8 · crisp',
          track: true, rest: 'normal',
        },
        {
          id: 'b2', name: 'DB Romanian deadlift', target: '3×6–8 /hand · RIR 2–3',
          track: true, reps: true, rest: 'heavy',
          cue: 'Wk 2: back to 65',
        },
        {
          id: 'b4', name: 'Chin-up, strict', target: '3×5–8 · RIR 2',
          track: true, added: true, reps: true, rest: 'heavy', short: 'chins',
          cue: '8,8,8 crisp two Saturdays → +5',
        },
        {
          id: 'b3', name: 'DB standing overhead press', target: '3×6–10 · RIR 2–3',
          track: true, reps: true, rest: 'heavy', short: 'the press', step: 2.5,
          cue: 'Wk 2–3: 37.5–40',
        },
        {
          id: 'b10', name: 'Bulgarian split squat (RFE)', target: '2×8–10 /leg · RIR 3–4',
          track: true, reps: true, rest: 'normal', step: 2.5, start: 20,
          cue: 'Check the right knee on the pad · wk 2–3: 25–27.5',
        },
        {
          id: 'b11', name: 'Reverse crunch / knee raise', target: '2×6–10',
          track: true, bw: true, reps: true, rest: 'normal', pair: 'b', short: 'core',
          menu: [
            'Reverse crunch — floor; the default when grip is cooked',
            'Hanging knee raise — curl the pelvis first, no swing',
          ],
        },
        {
          id: 'b12', name: 'Calf, single-leg (optional)', target: '0–2×12–20 /side · if under 70 min',
          track: true, reps: true, light: true, optional: true, rest: 'normal', pair: 'b', short: 'calves',
          start: 18,
        },
      ],
    },
  ],
};
