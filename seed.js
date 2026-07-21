// Strength Rebuild — program seed (v0.3)
// This is only the FIRST-RUN seed. After first launch the program lives in
// localStorage and is edited in-app; changes here won't overwrite it.
//
// v0.3 model: no per-set logging. Two kinds of slot —
//   track: true   → one working-weight capture, prefilled from last session
//   menu: [...]   → task menu (ecological variation), note instead of numbers
// rest: 'normal' | 'heavy' picks which rest-button tier the slot suggests.

const SEED_PROGRAM = {
  specVersion: '0.3',
  days: [
    {
      id: 'dayA',
      name: 'Day A',
      subtitle: 'Squat + Horizontal',
      slots: [
        {
          id: 'a1', name: 'Jump to targets', target: '4 rounds · 3 jumps',
          track: false, rest: 'normal',
          menu: [
            'Broad jump to a chosen target',
            'Lateral bound to target',
            'Single-leg takeoff → two-leg stick',
            'Jump up onto a box / step',
          ],
          cue: 'Pick a target, stick the landing — a couple past comfortable, never to fatigue',
        },
        {
          id: 'a2', name: 'Front squat', target: '4×5 · RIR 2–3',
          track: true, rest: 'heavy',
          warmup: 'Rack ATM — light bar: where are the ribs, scapula, breath?',
          cue: 'Upright torso, full depth',
        },
        {
          id: 'a3', name: 'DB bench press', target: '3×6–8 · RIR 2–3',
          track: true, rest: 'normal',
          cue: 'Free the scapula',
        },
        {
          id: 'a4', name: 'One-arm DB row', target: '3×8–10 /side',
          track: true, rest: 'normal',
          cue: 'Bench support; lead with the shoulder blade',
        },
        {
          id: 'a5', name: 'Bulgarian split squat (RFE)', target: '3×8–10 /side',
          track: true, rest: 'normal',
          cue: 'Knee tracks past the toes, heel down',
        },
        {
          id: 'a6', name: 'Slider leg curl', target: '3×6–8',
          track: false, rest: 'normal',
          menu: ['Bilateral', 'Slow / paused', 'Single-leg (R first)', 'Nordic negatives'],
          cue: 'Slow eccentric; right side leads, rep-matched',
        },
        {
          id: 'a7', name: 'Suitcase carry', target: '3×30–40 m /side',
          track: true, rest: 'normal',
          cue: "Ribcage stacked, don't tip",
        },
        {
          id: 'a8', name: 'Pallof press', target: '2×10–12 /side',
          track: true, rest: 'normal',
          cue: "Resist rotation, don't create it",
        },
        {
          id: 'a9', name: 'Hang / grip', target: '2×30–45 s',
          track: false, rest: 'normal',
          menu: ['Active→passive hang', 'Offset grip', 'Single-arm assisted', 'Traverse the bar'],
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
          id: 'b1', name: 'Kettlebell swing', target: '4×6',
          track: true, rest: 'normal',
          cue: 'Snap the hips, float the bell — never to fatigue',
        },
        {
          id: 'b2', name: 'DB Romanian deadlift', target: '4×6–8 · RIR 2–3',
          track: true, rest: 'heavy',
          cue: 'Long hamstrings, neutral spine',
        },
        {
          id: 'b3', name: 'DB standing overhead press', target: '3×6–8 · RIR 2–3',
          track: true, rest: 'normal',
          cue: 'Ribs down; vary the tempo or the attention',
        },
        {
          id: 'b4', name: 'Chin-up, strict', target: '3×5–12',
          track: true, added: true, rest: 'normal',
          cue: 'Dead hang, chin over; rotate grips freely',
        },
        {
          id: 'b5', name: 'Transitional squats', target: '3 shapes · 1 set each',
          track: true, rest: 'normal',
          menu: ['Rotational squat', 'Unicorn', 'Deep rotational squat'],
          cue: 'Light and smooth — own each shape',
        },
        {
          id: 'b6', name: 'Hanging leg raise', target: '3×8–12',
          track: false, rest: 'normal',
          menu: ['Bent knee', 'Straight leg', 'Toes-to-bar'],
          cue: 'Curl the pelvis first, no swing',
        },
      ],
    },
  ],
};
