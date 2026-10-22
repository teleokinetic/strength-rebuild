# Strength Rebuild

Personal gym companion for a three-day full-body strength program (Day C Monday · Day A Wednesday · Day B Saturday). Static PWA — no build step, no backend.

v2 model: anchors + task menus, one-press rest. No per-set logging.

- **Rest**: two big buttons showing just their times (normal / heavy tier, durations in Settings). Press when you rack the weight. The chime is baked into a WAV — [silence][bell] played as media — so it rings with the screen off, like Still Water. Foreground Web Audio fallback if media is refused.
- **Log**: tracked slots capture one working weight, prefilled from the last session by movement-name slug — a session with nothing changed is zero taps. Menu slots (jumps, transitional squats, hangs) list their task variations and take a note instead.
- **Finish**: records every tracked lift at its chip weight plus any notes. A session left open past 12 h auto-saves on next launch — adjusted weights are never lost.
- **Program**: edited in-app (Settings → Program): name, target, cue, warm-up line, task menu, tracked/added-load flags, rest tier, reorder.
- **Home**: the date and a greeting, then *Up next* — today's or the next scheduled day (or the open session) as one card, its focus name over its day letter, with the hillside oak standing beside Start. Under it, this week as seven dots (filled = trained, sky ring = still planned, today's letter in a capsule), then the other days and Progression as rows (a pill when lifts are ready, a line when recalibration is due). Fits one iPhone screen. At launch the greeting plays once as its own screen (about 1.3 s): the oak draws itself, the words glide into place; tap to skip, off under reduced motion.
- **Look**: Dusk (dark) and Overcast (light) with one sky accent — system font for words, Barlow Condensed for numbers. A session is a sheet over home: it rises in and drops away.
- **Finishing**: completing an exercise is one phrase — the arc closes, a soft fill blooms, the check writes itself, a halo widens, then the row dims. A lift under way keeps a soft highlight; logging a set folds away an open weight/reps editor. A pair or trio header turns to *done*, the trail ripples and Finish turns solid when the last ring fills, and the save screen draws the oak.
- **Progression**: home → the Progression strip. The targets board sits at the top of the page. Everything you train sorted by motion, computed from the log alone: *next session* (logged at the top of the rep range — a load goes up), *climbing*, *holding* (3+ sessions without a change). Tap a row for the trend line, pace, and verdict; rung slots open into their ladder. The targets board answers "where am I"; the sections below it answer "what's moving".
- **Data**: lives in `localStorage` (`sr-state-v2`) on the device; export / copy / import as JSON from Settings.
- **Drive**: Settings → Drive backs everything up to Google Drive after each Finish (and when the app is left with program changes), through the Gym Sync Apps Script in [`drive-sync/`](drive-sync/README.md), which also keeps the *Gym Log* Google Sheet. Restore from Drive on a new phone. Its config lives under `sr-sync`, apart from the exported state. v1 per-set history migrates automatically — each old entry collapses to its top working weight with the raw sets preserved underneath.

## Develop

```
python3 -m http.server 8080
```

Open `http://localhost:8080`. The program seed lives in `seed.js` (first run only — after that the program is edited in-app and lives in storage).

## Ship

Push to `main`; GitHub Pages serves the root. Bump `CACHE` in `sw.js` and `APP_VERSION` in `app.js` when shipping changes so installed clients pick up the new version.
