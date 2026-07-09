# Pre-fill review — three open decisions

Proposals only; none of this is coded. Context: the prefill-fix branch already makes pre-fill
fall back past checked-but-blank sets (per set index), carries RIR down within an entry at
save time, and repairs historical blanks once with a backup.

---

## 1. Pre-fill last performance vs. the target prescription

**BEFORE (current):** Every set pre-fills with your last *performance* (now: the most recent
non-blank one). The prescription only appears as placeholder text (`5`, `8–10`) when a field
is empty, and in the "3 × 8–10 @ 2–3 RIR" rx line.

**Option A — keep last performance (recommended).** What you actually did last time is the
honest starting point for double progression; one tap logs a repeat, and small edits capture
real change. Pre-filling the prescription would let an aspirational number get logged as if
it happened, corrupting the trend charts and the nudge logic that reads history.

**Option B — pre-fill the prescription.** AFTER: a set you've never beaten the bottom of the
range on would show `8` instead of last time's `6`. Cleaner-looking, but it records intent,
not fact, whenever a set is logged untouched — the exact failure mode this branch fixes.

**Recommendation: A.** Keep prescription visible as placeholder/rx only. If anything, make the
placeholder styling more distinct from a real pre-filled value so blank-vs-carried is obvious.

---

## 2. Reps reset to bottom of range when a load bump is earned

**BEFORE (current):** When `nudgeFor` fires a load bump, every set pre-fills
`new weight × reps[0]` (bottom of the range) — classic double progression.

**Option A — keep the reset (recommended).** After a load jump you shouldn't be expected to
hold top-of-range reps; resetting to the bottom keeps target RIR honest and gives the block
somewhere to progress. Note: for fixed-rep slots (`reps[0] === reps[1]`, e.g. front squat
5×5), the "reset" is a no-op and the prescription simply carries — already correct.

**Option B — keep last session's reps at the new load.** AFTER: pre-fill shows
`105 × 8` right after earning the bump from `100 × 8`. Only realistic on small percentage
jumps; on a 5 lb jump for lighter DB movements it invites grinding past target RIR, which
then blocks or falsifies the next nudge.

**Recommendation: A**, unchanged. If a set actually beats the bottom-of-range pre-fill, the
user edits upward — cheap. The reverse (failing an over-ambitious pre-fill) costs a rewrite
of every set.

---

## 3. Cloning the last set when this session prescribes more sets than the prior one had

**BEFORE (current):** A set index past the prior entry's length pre-fills from that entry's
*last* set (and with this branch's fix, from the most recent non-blank one). So going 3 → 4
sets clones set 3 into set 4.

**Option A — keep clone-the-last-set (recommended).** The last set is the best available
predictor of the set that follows it — same load, fatigue-adjusted reps. It also covers the
deload → normal-week transition (deload drops a set; next week the restored set still gets a
sane value).

**Option B — leave the extra set blank.** AFTER: added sets show `— / 8–10` placeholders.
"Pure" (no invented data), but it reintroduces exactly the blank-set-committed-untouched
problem, one set from the bottom, every time set counts go up.

**Option C — clone the heaviest/top set of the prior entry.** AFTER: set 4 pre-fills from
whichever prior set had the highest load. Marginally different from A only when load varies
across sets (ramping); for this program's straight-sets prescriptions it's identical, and
when it does differ it over-predicts a fatigued extra set.

**Recommendation: A**, unchanged. Revisit only if ramping/top-set schemes get added to the
program spec.
