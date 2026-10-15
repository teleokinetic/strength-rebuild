# Gym Sync — Drive backup for Strength Rebuild and Forte

One Google Apps Script in Tanner's account. Both apps send their data to it;
it keeps JSON backups in Drive and a readable Google Sheet.

```
Gym Sync/
  Gym Log                      ← Google Sheet: Tanner · Sessions / Progress, Carolina · Sessions / Progress
  Sync codes.txt               ← one code per app (keep private)
  Strength Rebuild/latest.json ← what "Restore from Drive" loads
  Strength Rebuild/history/    ← one copy per day (+ any copy replaced by an import/restore)
  Forte/…                      ← same for Carolina
```

## Set up (once, ~5 minutes, on a computer)

1. Go to <https://script.google.com> → **New project**. Name it *Gym Sync*.
2. Replace everything in `Code.gs` with this folder's `Code.gs`. Save.
3. **Deploy → New deployment** → type **Web app**.
   *Execute as:* **Me**. *Who has access:* **Anyone**. → **Deploy**.
   Google asks for permission (Drive + Sheets). It warns the app isn't
   verified — it's your own script: **Advanced → Go to Gym Sync**.
4. Copy the **Web app URL** (ends in `/exec`). Paste it into the
   `WEB_APP_URL` line at the top of `Code.gs`. Save.
5. Pick **setup** in the function menu → **Run**. The log prints two sync
   codes; they're also saved to `Gym Sync/Sync codes.txt` in Drive.
6. On each phone: open the app → **Settings → Drive** → paste that app's
   code → **Connect**.

"Anyone" only means the phones can reach it without a Google sign-in; every
request still needs that app's secret key, which lives only in the code.

## How it behaves

- Sends after **Finish**, and when you leave the app with program or
  settings changes. No signal → it waits and sends on the next open.
- A phone with **fewer sessions than Drive** (new phone, erased) is refused
  rather than overwriting the backup. Settings says so — tap **Restore**.
- **Import** and **Restore** replace Drive's copy on purpose; the copy they
  replace is kept in `history/`.

## Maintenance

- Changed `Code.gs`? **Deploy → Manage deployments → Edit → Version: New
  version → Deploy** — the phones talk to the deployed version, and the URL
  stays the same. Then run `rebuildSheet` to redraw the sheet right away.
- A code leaked? Run `rotateKeys` and reconnect both phones.
