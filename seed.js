// Strength Rebuild — program seed (v1.4)
// This is only the FIRST-RUN seed. After first launch the program lives in
// localStorage and is edited in-app; changes here won't overwrite it.
//
// v0.3 model: no per-set logging. Two kinds of slot —
//   track: true   → one working-weight capture, prefilled from last session
//   menu: [...]   → task menu (ecological variation), note instead of numbers
//   rungs: [...]  → ordered ladder; tap today's rung, the targets board reads it
// rest: 'normal' | 'heavy' picks which rest-button tier the slot suggests.

const SEED_PROGRAM = {
  specVersion: '1.4',
  days: [
    {
      id: 'dayA',
      name: 'Day A',
      subtitle: 'Squat + Horizontal',
      slots: [
        {
          id: 'prep-dayA', name: 'Prep', target: '~3 min',
          track: false, rest: 'normal',
          menu: [
            'Wrist circles — slow, through the end-ranges',
            'Quadruped rocking on palms — fingers forward, out, back toward knees',
            'Back-of-hand rocking, light',
          ],
          cue: 'Wake the wrists — easy loading, wide angles, nothing near effort',
        },
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
          id: 'a2', name: 'Back squat', target: '4×5 · RIR 2–3',
          track: true, rest: 'heavy',
          warmup: 'Rack ATM — light bar: where are the ribs, scapula, breath?',
          cue: 'Upright torso, full depth',
        },
        {
          id: 'a3', name: 'DB bench press', target: '3×6–8 · RIR 2–3',
          track: true, reps: true, rest: 'normal',
          cue: 'Free the scapula',
        },
        {
          id: 'a4', name: 'One-arm DB row', target: '3×8–10 /side',
          track: true, reps: true, rest: 'normal',
          cue: 'Reps first — build to 3×8–10, then +5 · bench support, lead with the shoulder blade',
        },
        {
          id: 'a5', name: 'Stork squat', target: '3×8–10 /side',
          track: true, reps: true, rest: 'normal',
          cue: 'Knee tracks past the toes, heel down',
        },
        {
          id: 'a6', name: 'Nordic ladder', target: '3×4–8',
          track: false, rest: 'normal',
          rungs: [
            'Bilateral slider', 'Single-leg slider', 'Shallow negative',
            'Full negative', 'Band assist', 'Full Nordic',
          ],
          cue: 'Slow 3–5 s eccentric; right leads, rep-matched — own a rung crisp, then move up',
        },
        {
          id: 'a7', name: 'Suitcase carry', target: '3×30–40 m /side',
          track: true, rest: 'normal',
          cue: "Ribcage stacked, don't tip",
        },
        {
          id: 'a8', name: 'Pallof press', target: '2×10–12 /side',
          track: true, reps: true, rest: 'normal',
          cue: "Resist rotation, don't create it",
        },
        {
          id: 'a9', name: 'Hang / grip', target: '2×30–45 s',
          track: false, rest: 'normal',
          menu: [
            'Active→passive hang', 'Offset grip', 'Single-arm assisted', 'Traverse the bar',
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
          menu: [
            'Wrist circles — slow, through the end-ranges',
            'Quadruped rocking on palms — fingers forward, out, back toward knees',
            'Back-of-hand rocking, light',
            'Passive hang → active hang × 2',
          ],
          cue: 'Wake the wrists and shoulders — easy loading, wide angles, nothing near effort',
        },
        {
          id: 'b1', name: 'Kettlebell swing', target: '4×6',
          track: true, rest: 'normal',
          cue: 'Snap the hips, float the bell — never to fatigue',
        },
        {
          id: 'b2', name: 'DB Romanian deadlift', target: '4×6–8 · RIR 2–3',
          track: true, reps: true, rest: 'heavy',
          cue: 'Long hamstrings, neutral spine',
        },
        {
          id: 'b3', name: 'DB standing overhead press', target: '3×6–8 · RIR 2–3',
          track: true, reps: true, rest: 'normal',
          cue: 'Ribs down; vary the tempo or the attention',
        },
        {
          id: 'b4', name: 'Chin-up, strict', target: '3×5–12',
          track: true, added: true, reps: true, rest: 'normal',
          cue: 'Dead hang, chin over; rotate grips freely',
        },
        {
          id: 'b5', name: 'Transitional squats', target: '3 shapes · 1 set each',
          track: true, rest: 'normal',
          menu: ['Rotational squat', 'Unicorn', 'Deep rotational squat'],
          cue: 'Light and smooth — own each shape',
        },
        {
          id: 'b6', name: 'Hollow body', target: '3×20–30 s',
          track: false, rest: 'normal',
          menu: [
            'Tuck hollow — low back pressed into the floor',
            'One leg extended',
            'Full hollow — arms overhead last',
            'Rocking hollow — once the shape is solid',
          ],
          cue: 'Low back glued down — shrink the shape before it breaks',
        },
        {
          id: 'b7', name: 'Heel-to-butt curl', target: '2×5–8 /side',
          track: false, rest: 'normal',
          menu: [
            'Prone curl — pause 3–5 s at max closure',
            'Standing pull — hip extended, no back arch',
            'Assisted overpressure — hand or strap closes the last bit, hold against it',
            'Any of these with toes turned in — medial-hamstring bias',
          ],
          cue: 'Right leads, rep-matched — the last 20° of closure is the exercise; clicking OK, sharp pinch = back off',
        },
        {
          id: 'b8', name: 'Calf, single-leg', target: '2×8–15 /side',
          track: true, reps: true, rest: 'normal',
          menu: [
            'Split Squat Iso w Calf Raise — front foot off a box edge, nothing moves but the heel',
            '3D Calf Raise — drive the roller into the wall, find the angles',
          ],
          cue: 'Right leads, rep-matched — bent knee, full range, slow heel drop; ribs down, weight forward',
        },
      ],
    },
  ],
};
