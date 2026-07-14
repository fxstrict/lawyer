# Boot Optimization Plan (Recommendation Only — Not Implemented This Phase)

Phase 12.4A mandate: audit and document only. **No code in this plan has
been implemented.** This document exists so the next sub-phase can execute
against a concrete, pre-reviewed plan rather than starting its own
from-scratch audit.

## 1. Recommended Optimization Order

1. **Un-gate the loading overlay from `loadFromSheets()`.**
   `showLoading(true)`/`showLoading(false)` should bracket only the initial
   local-data first paint (already fast), not the background Sheets sync.
   Dashboard already renders correctly from local `data.*` before
   `loadFromSheets()` is even called — the overlay should come down at that
   point, with the Sheets sync running invisibly (or with a small
   non-blocking "syncing…" indicator) behind it, the same way
   `pingConnection()` already runs without blocking anything.
   **Highest impact, lowest risk** — this alone converts the user-visible
   90-second wait into effectively 0, without changing any data-correctness
   behavior.

2. **Add a timeout to each of the 7 `fetch()` calls inside `loadFromSheets()`.**
   Bring it in line with every sibling network call in the project
   (`AbortSignal.timeout(...)`, e.g. matching `pingConnection()`'s 8000ms or
   `testConnection()`'s 30000ms). This bounds the *worst case* even before
   §1 is done, and remains valuable defense-in-depth after §1 regardless.

3. **Parallelize the 7 sheet fetches** (`Promise.all()` instead of a
   sequential `for` loop). Independent of §1/§2, this reduces total sync
   time from "sum of 7 requests" to "duration of the slowest request,"
   which matters once the overlay-gating problem is fixed and Sheets sync
   duration becomes something users might still notice (e.g. a "last
   synced" indicator).

4. **Surface sync failures instead of only `console.warn`.** If a sheet
   fetch times out or fails, the person should see a toast (or the
   already-existing `toast()` function) rather than a silent
   `console.warn`, especially once §1 makes the sync happen invisibly by
   default — silent background failures are much easier to miss than a
   currently-visible frozen overlay.

5. **(Lower priority, not blocking)** Re-measure boot cost once real
   production data volumes exist, per `Startup_Bottlenecks.md` §5 — today's
   "very little data" condition means `JSON.parse`/`JSON.stringify`/
   `localStorage.setItem` costs inside `loadFromSheets()` are negligible,
   but T-04 (unbounded soft-delete growth) means this should not be assumed
   permanent.

## 2. What This Plan Deliberately Does NOT Recommend Changing

- **No change to `Repository.js`, `DatabaseService.js`,
  `LocalStorageAdapter.js`, `UndoManager.js`, or any Repository/Module
  file's Repository-layer code.** None of it is on the critical path for
  this bottleneck (§6 of `Boot_Performance_Audit.md`) — touching it would
  violate this phase's scope and the project's "one responsibility per
  phase" rule.
- **No change to the Google Apps Script backend (`Code_v4.gs`)** — the
  fix is entirely client-side (overlay scope + timeout + parallelization),
  and does not require the backend to be faster.
- **No removal of the Google Sheets sync feature itself** — the
  recommendation is to stop blocking the UI on it, not to stop doing it.

## 3. Suggested Verification for the Implementation Sub-Phase

When this plan is implemented, the following should be verified (per this
project's standard verification methodology in
`motor-archive-pro-verification-quality-assurance`):

- Manual/scripted timing: overlay visible duration before vs. after the
  fix, with a simulated slow/unresponsive Apps Script endpoint (e.g. a
  mock endpoint with an artificial multi-second delay) to reproduce the
  reported ~90s condition without depending on live Google infrastructure.
- Regression: full existing test-harness suite (per `PROJECT_STATE.md` §8
  baseline — 20/26 harnesses executable, 941/943 checks passing) should
  show identical pass/fail counts before and after, since none of the
  affected functions (`loadFromSheets`, `pingConnection`, `showLoading`)
  currently have dedicated harness coverage of their own — this should
  also be flagged as a gap in the implementation phase's own audit step,
  not silently left uncovered.
- Confirm `data.*` mirror and `localStorage` end state is identical
  whether Sheets sync succeeds, times out, or fails — only the *timing* and
  *overlay behavior* should change, not the data-correctness contract.

## 4. Estimated Impact

| Metric | Before | After (Projected) |
|---|---|---|
| Time to first paint (Dashboard visible, interactive) | Already fast (<100ms) — but hidden behind the overlay | Same — now actually visible immediately |
| Time overlay stays up (perceived "not usable") | ~80-90+ seconds (unbounded, Apps-Script-latency-dependent) | ~0 seconds (§1) or, if a smaller sync indicator is kept, at most a few seconds (§2+§3 bound it) |
| Worst-case total Sheets sync duration | Unbounded | ≤ max single-request timeout (§2), further reduced by parallelization (§3) |
| Risk to existing Repository/Undo/Restore functionality | N/A — untouched | None — no shared code path is modified |
