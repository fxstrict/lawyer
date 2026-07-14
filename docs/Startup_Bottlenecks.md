# Startup Bottlenecks — Root Cause Ranking

Phase 12.4A — Boot Performance Audit.

## 1. Root Cause Ranking (Most → Least Likely Contributor to the ~90s Delay)

| Rank | Cause | Location | Est. % Contribution | Evidence |
|---|---|---|---|---|
| 1 | **Sequential, un-timeout-bounded Google Apps Script sync loop** (`loadFromSheets()`), gating the loading overlay | `js/modules/settings.js:119-132`, triggered from `index.html:671` | **~95-99%** | 7 sequential `await fetch()` calls with zero `AbortSignal`/timeout, unlike every other network call in the codebase (`api.js`'s `ping()`/`setup()`, `settings.js`'s own `testConnection()`). `showLoading(true)`/`showLoading(false)` bracket the entire loop, so the visible "not usable" state is exactly this loop's duration. Independent of local data volume or module count — matches the reported symptom precisely. |
| 2 | `pingConnection()` follow-up call | `js/modules/settings.js:78-95`, scheduled via `setTimeout(pingConnection, 2000)` at `index.html:671` | ~1-4% (worst case ~8s, but runs in parallel and does not touch `showLoading`) | Has its own 8s `AbortSignal` timeout and does not gate any overlay — a secondary, much smaller, already-correctly-bounded contributor at most. |
| 3 | Initial `data.*` load + first `renderDashboard()`/`updateBadges()` pass | inline script + `DOMContentLoaded` handler | <1% | Confirmed cheap array operations over the in-memory mirror; scales with data volume, and the brief states data volume is currently minimal. |
| 4 | Repository/DatabaseService/LocalStorageAdapter initialization (9× `.open()`) | 9 module top-levels | <1% | Confirmed to be a synchronous reachability probe wrapped in an already-resolving Promise; no I/O beyond what's already been read into `data.*` separately. Not on the critical path to Dashboard at all (Dashboard reads `data.*`, never the Repository layer). |
| 5 | Script parse/execution of 27 `<script src>` tags + inline block | HTML parse phase | <1% | Standard synchronous script loading; all files are small-to-medium (largest Repository ~650 lines); no bundler/minification present but volume is far too small to explain seconds, let alone 90 of them. |
| 6 | Service Worker / manifest.json | N/A | 0% | Neither exists anywhere in the project — ruled out entirely. |
| 7 | Duplicate boot listeners / duplicate `Repository.open()` calls | N/A | 0% | Confirmed: exactly one `DOMContentLoaded` listener, zero duplicate `.open()` calls, no `window.onload` handler exists. |

## 2. Why Rank #1 Explains the Full Symptom

The phase brief states the app takes ~90 seconds to become usable **even
with only a few modules and very little data**. Every other candidate
bottleneck in this codebase (render cost, Repository open cost, mirror
rebuild cost, script parse cost) scales with either **data volume** or
**module count** — and the brief explicitly says both are currently small.
`loadFromSheets()`'s cost scales with neither: it scales with **Google Apps
Script's own per-request response time, multiplied by 7 (sequential), with
no ceiling.** Google Apps Script Web Apps are well known to have
variable — and sometimes multi-second-to-tens-of-seconds — cold-start and
execution latency, especially under any quota pressure. Seven such requests
run back-to-back, unbounded, is fully sufficient on its own to produce a
~90 second wait, and this is the only mechanism in the traced boot path
whose cost is independent of the stated "few modules, little data"
condition.

## 3. Contributing Design Issues (Not Root Cause, But Related)

- **No timeout on the 7 sheet-load fetches.** Every sibling network call in
  the project (`ping`, `setup`, `testConnection`) uses `AbortSignal.timeout(...)`.
  This one loop is the sole exception, which is very likely why it was never
  caught by manual testing on a fast connection/fast Apps Script deployment
  and only became visible as "90 seconds" under real-world Apps Script
  latency.
- **Sequential instead of parallel.** The 7 sheets have no dependency on
  each other — nothing in `loadFromSheets()` reads sheet *i*'s result before
  fetching sheet *i+1*. A `Promise.all()` across all 7 would reduce total
  wait time to roughly the slowest single request instead of the sum of all
  seven, independent of any timeout fix.
- **The loading overlay is tied to the wrong scope.** `showLoading(true)`
  currently brackets "sync my local data with the cloud," which is a
  background-refresh concern, not a "the app is not ready" concern. The app
  *is* ready — Dashboard has already rendered from local data — by the time
  `loadFromSheets()` even starts. Gating the overlay on this call conflates
  "first paint" with "background sync completed."
- **No user-visible way to skip or cancel.** If Apps Script is slow or
  unreachable, the person waiting at F5 has no indication of *why* the
  overlay is still up, or any way to dismiss it and use locally-cached data
  immediately — `catch (e)` blocks inside the loop only `console.warn`, they
  never surface to `showLoading(false)` early or to a toast mid-loop.

## 4. Explicitly Ruled Out

- Data volume / number of records — not the driver (confirmed: cost is
  network-round-trip-bound, not data-size-bound, at "very little data").
  Note this may become an *additional* contributor later — see §5.
- Number of modules loaded — not the driver (script execution measured at
  well under 100ms combined).
- Repository/DatabaseService architecture from Phases 5-10 — not on the
  Dashboard's critical path at all; confirmed idle at boot by design.
- Duplicate event listeners or duplicate boot routines — none found.
- Service Worker / PWA manifest — does not exist in this project.
- `UndoManager.js` (Phase 12.2/12.3 work) — never loaded by `index.html`,
  contributes zero boot cost.

## 5. One Forward-Looking Note (Not In Scope for This Phase)

Once local data volume grows, `loadFromSheets()`'s `arr.length>0` overwrite
of `data[k]` combined with a full `localStorage.setItem(JSON.stringify(arr))`
per sheet will add a second, data-size-dependent cost on top of the
network-bound one documented here. Today, with "very little data," that
second cost is negligible and does not need to be counted in this phase's
ranking — but a future optimization pass should re-measure once real
production data volumes exist, since T-04 (unbounded localStorage growth
from permanent soft-delete, per `Technical_Debt_Report.md`) means that
volume is only expected to increase over time.
