# Boot Performance Audit — نظام الحسام للمحاماة (Motor Archive Pro)

**Phase:** 12.4A — Boot Performance Audit & Startup Profiling
**Mode:** Strict Read-Only Audit — no production file modified, no fix applied.
**Date:** 2026-07-14
**Scope:** Full startup trace, F5 → usable UI.

---

## 0. Phase-Numbering Note (Documented, Not Resolved Here)

`docs/Phase12_4_Verification_Report.md` already documents a completed
**Phase 12.4 — Cases Undo Pilot Integration** (938/938 tests, "READY FOR
SUB-PHASE 12.5"). The project's ledger docs (`PROJECT_STATE.md`,
`PROJECT_MAP.md`, `PROJECT_HISTORY.md`, `NEXT_PHASE.md`) are all frozen at
Phase 10.7 (2026-07-11) and were never updated through the Phase 11
(Cache Layer) or Phase 12 (Undo Manager) work, so there is no authoritative
sequence to check this phase's number against. This audit proceeds under the
label given in the phase brief ("12.4A") without renumbering it, and flags
the conflict for reconciliation rather than silently absorbing it — consistent
with how the Phase 12 planning-document mismatch was handled previously.

---

## 1. Files Modified

**None.** This was a strict read-only audit. No production file was opened
for editing; only read via `view`/`grep`/`cat`.

## 2. Files Created

- `docs/Boot_Performance_Audit.md` (this file)
- `docs/Startup_Timeline.md`
- `docs/Startup_Bottlenecks.md`
- `docs/Boot_Optimization_Plan.md`

## 3. Startup Sequence (Traced From Source)

```
Browser requests index.html
   ↓
HTML parse — <head> + body markup (no blocking <script> before the
   dependency chain; all app scripts are plain synchronous <script src>
   tags in document order, no defer/async)
   ↓
Script execution, in this exact order (index.html lines 564-580, 662-682, 731-734):
   js/api/api.js
   js/ui-utils.js
   js/print-utils.js
   js/core/StorageAdapter.js
   js/core/LocalStorageAdapter.js
   js/core/DatabaseService.js
   js/core/Repository.js
   js/repositories/CasesRepository.js
   js/repositories/ClientsRepository.js
   js/repositories/ChildrenRepository.js
   js/repositories/SessionsRepository.js
   js/repositories/TasksRepository.js
   js/repositories/FeesRepository.js
   js/repositories/DocumentsRepository.js
   js/repositories/LibraryRepository.js
   js/repositories/TemplatesRepository.js
   js/modules/cases.js         — instantiates casesRepository, calls .open() (async, unblocking)
   [inline <script>]           — declares data{}, saveLocal(), toast(), navigate(), FIELDS/MAP,
                                  and the DOMContentLoaded handler (see §3.1)
   js/modules/settings.js      — declares loadFromSheets(), pingConnection(), sync fns (NOT wired
                                  into any <script> tag call yet other than by name at runtime)
   js/modules/calendar.js
   js/modules/children.js      — instantiates childrenRepository, calls .open()
   js/modules/dashboard.js     — declares renderDashboard(), updateBadges()
   js/modules/tasks.js         — instantiates tasksRepository, calls .open()
   js/modules/documents.js     — instantiates documentsRepository, calls .open()
   js/modules/sessions.js      — instantiates sessionsRepository, calls .open()
   [large static HTML block: view/portal modals]
   js/modules/clients.js       — instantiates clientsRepository, calls .open()
   js/modules/fees.js          — instantiates feesRepository, calls .open()
   js/modules/library.js       — instantiates libraryRepository, calls .open()
   js/modules/templates.js    — instantiates templatesRepository, calls .open()
   ↓
DOMContentLoaded fires (index.html line 662) — see §3.1
   ↓
window.load — no handler registered; nothing runs here
   ↓
"Ready" — UI is interactive once DOMContentLoaded's synchronous body finishes;
   loadFromSheets(), if triggered, keeps `loadingOverlay` shown afterward (§3.1)
```

Every Repository is opened exactly once (`new <Entity>Repository()` +
`.open()`, once each, no duplicate `open()` calls found anywhere in the 9
modules or in `index.html`).

### 3.1 The DOMContentLoaded Handler (index.html:662-673) — Verbatim Trace

```js
window.addEventListener('DOMContentLoaded', function () {
  data.sessions = data.sessions.map(...sanitizeTime...);     // O(n) over sessions, n is tiny
  localStorage.setItem('sessions', JSON.stringify(data.sessions));
  ... calYear/calMonth setup ...
  updateBadges();                // cheap — see §6
  renderDashboard();              // cheap — see §6
  updateConnectionStatus();       // cheap — DOM class toggle only
  ... driveOpenBtn / sheetUrl display, both cheap DOM ops ...
  if (API_URL) {
    loadFromSheets();             // <-- NOT awaited. Fire-and-forget from
                                   //     DOMContentLoaded's point of view.
    setTimeout(pingConnection, 2000);
  }
  ... modal-overlay click listeners ...
});
```

`loadFromSheets()` is not `await`-ed by the handler, so the handler itself
returns quickly and the DOM technically finishes its `DOMContentLoaded`
dispatch fast. **This is why the delay is a UX-blocking delay, not a
JS-engine-blocking delay** — see §5. The user experiences it as "the app is
not usable" because `loadFromSheets()` calls `showLoading(true)` immediately
and does not call `showLoading(false)` until every one of its 7 sequential
network requests has settled (successfully or by exception).

## 4. Boot Timeline (Stage Cost Estimates)

| Stage | Contents | Est. Cost | Blocking? |
|---|---|---|---|
| HTML parse | index.html, 737 lines, no external CSS/JS blocking render beyond normal `<script>` execution | <50 ms | Yes (standard parser-blocking `<script>`) |
| Script execution (all 27 `<script src>` + 1 inline block) | Function/class declarations only; only 9 Repository `.open()` calls do any actual work, each a cheap synchronous localStorage reachability check wrapped in a resolved Promise | <50 ms combined | Yes, but negligible |
| DOMContentLoaded handler body (synchronous portion) | sessions map/sanitize + 1 localStorage write, `updateBadges()`, `renderDashboard()`, `updateConnectionStatus()`, 2 DOM lookups, 1 `querySelectorAll` loop | <20 ms with "a few modules and very little data" | Yes, but negligible |
| **`loadFromSheets()` — 7 sequential, un-timeout-bounded `fetch()` calls to a Google Apps Script backend** | See §5 and `Startup_Bottlenecks.md` | **~80-90+ seconds, scales with Apps Script round-trip time × 7, fully sequential** | **UX-blocking via `showLoading(true)` overlay; not JS-thread-blocking** |
| `setTimeout(pingConnection, 2000)` | 1 more `fetch()`, 8s timeout, fires 2s after DOMContentLoaded, independent of `loadFromSheets()` | up to 8s in the worst case, but does not gate `showLoading` | No — runs in parallel, no overlay tied to it |

**Total measured/estimated "usable" time**: the synchronous/local portion of
boot is on the order of tens of milliseconds. The reported ~90 seconds is
essentially 100% attributable to §5's finding — it does not scale with the
number of modules or the amount of local data, which matches the symptom
described in the phase brief ("only a few modules and very little data").

## 5. Root Cause (Full Detail in `Startup_Bottlenecks.md`)

`loadFromSheets()` (`js/modules/settings.js:119-132`) is called
unconditionally and un-awaited from the `DOMContentLoaded` handler whenever
`API_URL` (`localStorage.apiUrl`) is set. It:

1. Calls `showLoading(true)` — a full-screen loading overlay — before
   anything else.
2. Iterates 7 sheet names (`القضايا, الجلسات, الموكلين, الأطفال, المستندات,
   المهام, الأتعاب`) in a `for` loop with `await fetch(...)` **inside the
   loop body**, i.e. fully sequential, one Google Apps Script HTTP round trip
   at a time.
3. **None of these 7 `fetch()` calls has an `AbortSignal`/timeout** — every
   other network call in this codebase (`api.js`'s `ping()` — 8000ms,
   `setup()` — 30000ms, and `settings.js`'s own `testConnection()` — 30000ms
   and 10000ms) is timeout-bounded except this one. An unresponsive or slow
   Apps Script deployment (a well-known characteristic of Google Apps
   Script Web Apps — cold-start execution and per-request quota throttling
   routinely add multiple seconds per call) has no ceiling here.
4. Only after all 7 requests settle (success or per-request `catch`) does
   `showLoading(false)` run.

This is a "Google Sync" dependency exactly as suspected in the phase brief's
boot trace (`... → Google Sync → Mirror sync → Dashboard → ...`), except it
does **not** sit before Dashboard in the actual code — Dashboard renders
first, then Google Sync runs and re-renders on completion — but it still
gates the loading overlay for the entire sequential-fetch duration, which is
functionally indistinguishable from "the app isn't usable yet" to the
person waiting at F5.

## 6. Everything Else Audited and Ruled Out

- **Repository/DatabaseService/LocalStorageAdapter startup cost**: negligible.
  `LocalStorageAdapter.open()` is a synchronous reachability probe
  (`typeof engine.getItem === 'function'`) wrapped in an already-resolving
  `Promise` — no I/O beyond what the constructor/`resolveEngine()` already
  did. Confirmed by direct read of `js/core/LocalStorageAdapter.js`.
- **Repository re-opening**: each of the 9 Repositories is instantiated and
  `.open()`-ed exactly once, at its own module's top level — no duplicate
  `open()` calls found in any module or in `index.html`.
- **Dashboard render cost**: `renderDashboard()`/`updateBadges()`
  (`js/modules/dashboard.js`) are plain `Array.prototype.filter()`/`.map()`
  passes over the in-memory `data.*` mirror, with no Repository or
  `DatabaseService` calls at all (by design — dashboard.js has no Repository
  dependency, confirmed in `PROJECT_STATE.md` §10 and by direct read).
  Negligible with "very little data."
- **Duplicate boot listeners**: exactly one `DOMContentLoaded` listener
  found in `index.html`; no `window.onload`, no second `boot()`/`init()`.
- **Service Worker / manifest.json**: neither exists anywhere in the
  project (`find` returned no matches) — ruled out as a startup contributor
  entirely (also worth flagging separately: there is no PWA install/offline
  manifest at all, which is a separate observation, not a boot bottleneck).
- **UndoManager.js**: not loaded by `index.html` at all (confirmed — no
  `<script src="js/core/UndoManager.js">` tag exists), consistent with
  `Phase12_4_Verification_Report.md`'s documented graceful-degradation
  design. Contributes zero boot cost since it never loads.
- **`pingConnection()`**: fires 2 seconds after `DOMContentLoaded`, has its
  own 8-second timeout, and does not touch `showLoading` — runs
  independently of the loading-overlay-gated path and was ruled out as the
  primary cause (though it does add a second, smaller, parallel network
  call that a full fix should still account for).

## 7. PASS / FAIL

**PASS** (as an audit phase — read-only, root cause found with high
confidence, no code touched).

```
BOOT PERFORMANCE AUDIT

ROOT CAUSE: FOUND — sequential, un-timeout-bounded loadFromSheets()
Google Sheets sync loop in js/modules/settings.js, triggered
unconditionally on every boot when apiUrl is configured.

PASS

NOT FIXED — per phase mandate. See Boot_Optimization_Plan.md for the
recommended fix, to be implemented in the next sub-phase.
```
