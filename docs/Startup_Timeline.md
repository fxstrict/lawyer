# Startup Timeline — Function-Level Profile

Phase 12.4A — Boot Performance Audit. Every function executed between F5 and
the app becoming "usable," in call order, as traced from source (no
production file modified).

## 1. Boot Timeline (Stages)

```
HTML parse
   ↓  <50ms
Script execution (27 <script src> tags + 1 inline block, in document order)
   ↓  <50ms combined (9 Repository .open() calls, all cheap/async, no I/O wait)
DOMContentLoaded fires
   ↓  <20ms synchronous body (sessions sanitize, updateBadges, renderDashboard,
   │        updateConnectionStatus, DOM lookups)
   ├──→ loadFromSheets() fired, NOT awaited by the handler ───┐
   │                                                           │
window.load — no handler registered, no-op                     │
   ↓                                                            │
"Ready" (DOM interactive, handler returned)                     │
                                                                 ↓
                                        showLoading(true) — overlay shown
                                        7 × sequential await fetch() to
                                        Google Apps Script, NO TIMEOUT
                                        ~10-13s+ each (Apps Script cold
                                        start / quota, unbounded) × 7
                                        ≈ 80-90+ seconds
                                                                 ↓
                                        updateBadges() + renderDashboard()
                                        (re-run, cheap)
                                                                 ↓
                                        showLoading(false) — overlay hidden
                                        ← THIS is the moment the phase
                                          brief's "usable" refers to
```

The JS thread itself is never blocked for 90 seconds — each `await fetch()`
yields control. What is blocked for ~90 seconds is the **loading overlay**
(`#loadingOverlay.show`), which is the user-visible definition of "usable."

## 2. Function-by-Function Profile

| Function | Caller | Purpose | Await? | Blocking? | Async? | Reads localStorage | Reads Google | Writes localStorage | Writes Google | DOM work | Est. cost | Can run later? | Must block UI? |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| inline: `data={...}` init | top-level script eval | Load all 9 entity arrays from localStorage into memory | No | Yes (sync) | No | Yes (9× `getItem`+`JSON.parse`) | No | No | No | No | <10ms (small data) | No — needed before render | Yes, but negligible |
| `CasesRepository.open()` (+ 8 siblings) | each module's top-level script eval | Verify storage engine reachable, mark Repository ready | Yes (returns Promise, awaited internally by `casesRepositoryReadyPromise`, not by boot) | No | Yes | No (probe only, no data read here) | No | No | No | No | <1ms each, ~9ms total | Yes — already deferred via Promise | No |
| `data.sessions.map(sanitizeTime)` | `DOMContentLoaded` handler | Normalize legacy time strings | No | Yes (sync) | No | No | No | Yes (1× `setItem`) | No | No | <5ms (small data) | Could move to lazy/on-render | No |
| `updateBadges()` | `DOMContentLoaded` handler | Set 7 sidebar badge counts | No | Yes (sync) | No | No (reads in-memory `data.*`) | No | No | No | Yes (7× `textContent`) | <5ms | No — cheap, fine as-is | Yes, but negligible |
| `renderDashboard()` | `DOMContentLoaded` handler | Render dashboard stats/alerts/upcoming lists | No | Yes (sync) | No | No (reads in-memory `data.*`) | No | No | No | Yes (~10 element writes, `innerHTML` builds) | <15ms (small data) | No — is the "first paint" | Yes, but negligible |
| `updateConnectionStatus()` | `DOMContentLoaded` handler | Toggle status-dot CSS class based on `API_URL` presence | No | Yes (sync) | No | No | No | No | No | Yes (2 class toggles) | <1ms | No | Yes, but negligible |
| **`loadFromSheets()`** | `DOMContentLoaded` handler (fire-and-forget) | Pull all 7 sheets from Google Apps Script and overwrite local mirrors | **No (caller does not await it)** | **UX-blocking via overlay, not thread-blocking** | **Yes** | No | **Yes — 7× sequential `fetch()`** | Yes (7× `setItem` on success) | No | Yes (`showLoading` overlay show/hide, badges/dashboard re-render) | **~80-90+ seconds, unbounded** | **Yes — this is the fix** | **Currently yes (overlay) — should not be** |
| `fetch(API_URL+'?sheet=...')` ×7 (inside `loadFromSheets`) | `loadFromSheets()` | One HTTP GET per sheet | Yes (each awaited before the next starts) | Blocks the *loop*, not the thread | Yes | No | Yes | No (data written after) | No | No | Unbounded — no `AbortSignal` | Yes — parallelize or defer | Should not block UI |
| `setTimeout(pingConnection, 2000)` | `DOMContentLoaded` handler | Schedule a connectivity check 2s after load | N/A (schedules, does not run inline) | No | N/A | No | No (not yet — deferred) | No | No | No | <1ms to schedule | Already deferred | No |
| `pingConnection()` | `setTimeout` callback, 2s after DOMContentLoaded | Check Apps Script reachability, update status dot | Yes | No (own async context) | Yes | No | Yes (1× `fetch`, 8s timeout) | No | No | Yes (status dot/text) | ≤8s, bounded, parallel to everything else | Already appropriately deferred | No |
| `showLoading(true)` / `showLoading(false)` | `loadFromSheets()` start/end | Toggle full-screen loading overlay | No | Yes (sync DOM op) | No | No | No | No | No | Yes (1 class toggle) | <1ms each | N/A | This IS the block — see above |

## 3. Blocking Operations, Classified

| Operation | Classification |
|---|---|
| Initial `data.*` load from localStorage (inline script) | **Required** — needed before any render |
| 9× `Repository.open()` | **Required**, but already async/non-blocking — no action needed |
| `updateBadges()` / `renderDashboard()` (first pass) | **Required** — this is the first paint |
| `updateConnectionStatus()` | **Required**, negligible |
| `loadFromSheets()` — the call itself | **Optional** — only relevant if the user has configured a Google Sheets URL; should not gate the loading overlay |
| The 7 sequential `fetch()` calls inside `loadFromSheets()` | **Background candidate** — data can arrive after first paint and re-render the dashboard when ready, exactly the way `pingConnection()` already does correctly |
| `setTimeout(pingConnection, 2000)` / `pingConnection()` | **Background candidate**, already implemented as one (correctly deferred, correctly bounded — the template the sync loop should follow) |

## 4. Mirror / Repository / LocalStorage Counts During Boot

- **Mirror rebuilds (`syncMirror`/`syncCases`/etc. equivalents)**: none of
  those literal function names exist in this codebase. The nearest
  equivalent — the `data.*` compatibility mirror — is populated **once**
  from `localStorage` at script-eval time and re-populated **once more per
  successful sheet** inside `loadFromSheets()` (up to 7 times, only if a
  Sheets URL is configured and each sheet actually returns data).
- **Repository `.open()` calls during boot**: exactly 9 (one per entity),
  none opened twice.
- **`Repository.getAll()`/`.search()`/`.count()` during boot**: **zero.**
  Dashboard and badges read the legacy `data.*` mirror directly, not the
  Repository layer, by the project's own documented design
  (`PROJECT_STATE.md` §10: "dashboard.js — No (by design)"). This means the
  Repository/DatabaseService/LocalStorageAdapter stack introduced in Phases
  5-10 currently contributes **no measurable boot cost at all** — it is
  fully idle until a page other than Dashboard is opened.
- **`JSON.parse()` during boot**: 9 (initial `data.*` load) + up to 7 more
  inside `loadFromSheets()` (`await r.json()`), only if Sheets sync runs.
- **`JSON.stringify()`/`localStorage.setItem()` during boot**: 1
  (`sessions` sanitize-and-save) + up to 7 more inside `loadFromSheets()`.
- **`DOMContentLoaded` listeners**: exactly 1. **`window.onload` listeners**:
  0. **`boot()`/`init()`/`setup()` named functions**: none exist under
  those names — the DOMContentLoaded closure is the entire boot routine.

## 5. Google / API Call Chain During Boot

```
DOMContentLoaded
   → if (API_URL) loadFromSheets()      [fire-and-forget, gates loadingOverlay]
        → showLoading(true)
        → for sheet in [7 sheets]:
             → await fetch(API_URL + '?sheet=' + sheet)   [NO timeout]
             → await r.json()
             → data[k] = arr; localStorage.setItem(k, ...)
        → updateBadges(); renderDashboard()
        → showLoading(false)
   → setTimeout(pingConnection, 2000)   [independent, 8s-bounded, parallel]
```

**Yes — startup does functionally wait for Google Apps Script before the
app feels usable**, because the loading overlay (the user's signal for
"not ready yet") stays up for the full duration of the 7-request loop, even
though the DOM itself was interactive underneath it much earlier.
