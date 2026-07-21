# Strength Rebuild

Personal gym companion for a two-day full-body strength program. Static PWA — no build step, no backend.

v2 model: anchors + task menus, one-press rest. No per-set logging.

- **Rest**: two big buttons (normal / heavy tier, durations in Settings). Press when you rack the weight. The chime is baked into a WAV — [silence][bell] played as media — so it rings with the screen off, like Still Water. Foreground Web Audio fallback if media is refused.
- **Log**: tracked slots capture one working weight, prefilled from the last session by movement-name slug — a session with nothing changed is zero taps. Menu slots (jumps, transitional squats, hangs) list their task variations and take a note instead.
- **Finish**: records every tracked lift at its chip weight plus any notes. A session left open past 12 h auto-saves on next launch — adjusted weights are never lost.
- **Program**: edited in-app (Settings → Program): name, target, cue, warm-up line, task menu, tracked/added-load flags, rest tier, reorder.
- **Data**: lives in `localStorage` (`sr-state-v2`) on the device; export / copy / import as JSON from Settings. v1 per-set history migrates automatically — each old entry collapses to its top working weight with the raw sets preserved underneath.

## Develop

```
python3 -m http.server 8080
```

Open `http://localhost:8080`. The program seed lives in `seed.js` (first run only — after that the program is edited in-app and lives in storage).

## Ship

Push to `main`; GitHub Pages serves the root. Bump `CACHE` in `sw.js` and `APP_VERSION` in `app.js` when shipping changes so installed clients pick up the new version.
