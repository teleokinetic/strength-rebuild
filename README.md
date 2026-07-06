# Strength Rebuild

Personal gym companion for a two-day full-body strength program. Static PWA — no build step, no backend.

- **Log**: weight × reps × RIR per work set, prefilled from the last session of the same movement
- **Rest clock**: auto-starts on each logged set with that slot's prescribed rest; timestamp-based so it survives screen lock
- **Progression nudges**: when every work set hits the top of the rep range at target RIR, the next session opens with the suggested load bump (double progression)
- **Block awareness**: 4-week mesocycle counter; week 4 renders as a deload (one fewer set, 4–5 RIR)
- **Notes**: optional per-movement and per-session, surfaced in history
- **History**: per-movement trend chart + full session log
- **Data**: lives in `localStorage` on the device; export/import as JSON from Settings

## Develop

```
python3 -m http.server 8080
```

Open `http://localhost:8080`. The program seed lives in `seed.js` (first run only — after that the program is edited in-app and lives in storage).

## Ship

Push to `main`; GitHub Pages serves the root. Bump `CACHE` in `sw.js` and `APP_VERSION` in `app.js` when shipping changes so installed clients pick up the new version.
