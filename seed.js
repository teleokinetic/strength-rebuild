// Strength Rebuild — program seed (v2.1)
// This is only the FIRST-RUN seed. After first launch the program lives in
// localStorage and is edited in-app; changes here won't overwrite it.
//
// v0.3 model: no per-set logging. Two kinds of slot —
//   track: true   → one working-weight capture, prefilled from last session
//   menu: [...]   → task menu (ecological variation), note instead of numbers
//   rungs: [...]  → ordered ladder; tap today's rung, the targets board reads it
// rest: 'normal' | 'heavy' picks which rest-button tier the slot suggests.
// pair: slots sharing a key within a day are done together, alternating sets —
//   short: the name partners use when pointing at this slot.
//   pairRest: optional rest (seconds) the group takes instead of the normal tier.

const SEED_PROGRAM = {
  specVersion: '2.1',
  days: [
    {
      id: 'dayA',
      name: 'Day A',
      subtitle: 'Squat + Horizontal',
      slots: [
        {
          id: 'prep-dayA', name: 'Prep', target: '~3 min',
          track: false, rest: 'normal',
        },
        {
          id: 'a2', name: 'Back squat', target: '4×5 · RIR 2–3',
          track: true, rest: 'heavy',
        },
        {
          id: 'a3', name: 'DB bench press', target: '3×6–8 · RIR 2–3',
          track: true, reps: true, rest: 'normal', pair: 'a', short: 'the bench',
        },
        {
          id: 'a4', name: 'One-arm DB row', target: '3×8–10 /side',
          track: true, reps: true, rest: 'normal', pair: 'a', short: 'the row',
        },
        {
          id: 'a5', name: 'Stork squat', target: '3×8–10 /side',
          track: true, reps: true, rest: 'normal',
        },
        {
          id: 'a10', name: 'Hamstring curl machine', target: '3×8–12 · RIR 2–3',
          track: true, reps: true, rest: 'normal', pair: 'b', short: 'curls',
        },
        {
          id: 'a7', name: 'Suitcase carry', target: '3×30–40 m /side',
          track: true, rest: 'normal', pair: 'b', short: 'the carry',
        },
        {
          id: 'a9', name: 'Hang / grip', target: '2×30–45 s',
          track: false, rest: 'normal',
          menu: [
            'Active→passive hang', 'Offset grip', 'Single-arm assisted', 'Traverse the bar',
            'Hanging leg raise — knees or toes-to-bar; curl the pelvis first, no swing',
            'Dead-hang max — occasional test: 60 s solid · 90 s strong (log it in a note)',
          ],
          cue: 'Active shoulders',
        },
      ],
    },
    {
      id: 'dayB',
      name: 'Day B',
      subtitle: 'Hinge + Vertical',
      slots: [
        {
          id: 'prep-dayB', name: 'Prep', target: '~4 min',
          track: false, rest: 'normal',
        },
        {
          id: 'b1', name: 'Kettlebell swing', target: '4×6',
          track: true, rest: 'normal',
        },
        {
          id: 'b2', name: 'DB Romanian deadlift', target: '4×6–8 · RIR 2–3',
          track: true, reps: true, rest: 'heavy',
        },
        {
          id: 'b3', name: 'DB standing overhead press', target: '3×6–10 · RIR 2–3',
          track: true, reps: true, rest: 'heavy', short: 'the press',
        },
        {
          id: 'b4', name: 'Chin-up, strict', target: '3×5–12',
          track: true, added: true, reps: true, rest: 'heavy', short: 'chins',
        },
        {
          id: 'b5', name: 'Transitional squats', target: '3 sets · one per shape',
          track: true, rest: 'normal',
          menu: ['Rotational squat', 'Unicorn', 'Deep rotational squat'],
        },
        {
          id: 'b9', name: 'Pallof press', target: '2×10–12 /side',
          track: true, reps: true, rest: 'normal',
        },
        {
          id: 'b6', name: 'Anti-extension ladder', target: '1–2×5–8',
          track: false, rest: 'normal', pair: 'b', short: 'the ladder', pairRest: 60,
          rungs: [
            'Hollow body',
            'All-fours to plank',
            'Accordion walk',
            'Elbow accordion',
            'Kneeling walkout',
            'Kneeling rollout',
            'Standing rollout',
          ],
        },
        {
          id: 'b7', name: 'Heel-to-butt curl', target: '2×5–8 /side',
          track: false, rest: 'normal', pair: 'b', short: 'heel curls', pairRest: 60,
          menu: [
            'Prone curl',
            'Standing pull',
            'Assisted overpressure',
            'Toes turned in',
          ],
        },
        {
          id: 'b8', name: 'Calf, single-leg', target: '2×8–15 /side',
          track: true, reps: true, rest: 'normal', pair: 'b', short: 'calves', pairRest: 60,
          menu: [
            'Split squat iso + calf raise',
            '3D calf raise',
          ],
        },
      ],
    },
  ],
};
