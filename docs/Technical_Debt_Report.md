# Technical Debt Report

PHASE 9 — SUB-PHASE 9.16 — Stabilization & Production Readiness Audit

════════════════════════════════════════════════════════════

Every item below was found by direct inspection of the current project
source, or by running an existing test harness (never by assumption).
File names and line numbers are cited where practical so each item is
independently reproducible.

════════════════════════════════════════════════════════════

## T-01 — No restore/undelete path for soft-deleted records

**Description:** All 9 entity Repositories are configured with
`softDelete: true`. `Repository.prototype.delete()`
(`js/core/Repository.js` lines 704–740) marks a record with `deletedAt`
and keeps it in storage forever, excluded from `getAll()`/`get()`/
`exists()`/`search()`/`count()` by default. No `restore()` method exists
on the base `Repository` class, and no entity Repository or Module adds
one.

**Evidence:**
- `grep -n "Repository.prototype" js/core/Repository.js` — no `restore`
  entry among the 24 prototype methods listed.
- `grep -rn "restore" js/ --include="*.js"` (excluding `js/tests/`) —
  only match is an unrelated comment in `cases.js` about form-field UI
  restoration, not data restoration.
- `Repository.prototype._indexOf()` (line 560) does not filter out
  deleted records, so a raw `update(id, {deletedAt: null})` call would
  technically clear the flag — but this is an internal implementation
  detail, never called anywhere in the codebase, and not part of the
  documented Repository Contract surface.

**Severity:** HIGH
**Impact:** Any accidental deletion of a Case, Client, Session, Task,
Fee, Document, Child record, Library entry, or Template is permanently
irrecoverable through every supported code path or UI action, even
though the data still physically exists in `localStorage`.
**Estimated effort:** Medium — add a `restore(id)` method to
`Repository.js` (clears `deletedAt`, symmetric with `delete()`), plus a
"deleted items" view/action in at least the highest-value modules
(Cases, Clients).
**Recommended priority:** High — should precede any V1.0 claim that
speaks to data safety.

────────────────────────────────────────────────────────────

## T-02 — Inconsistent Google Sheets delete-sync coverage across modules

**Description:** Only `cases.js`, `sessions.js`, and `clients.js` call
`ApiService.deleteData(...)` when a record is deleted. `tasks.js`,
`documents.js`, and `fees.js` explicitly do not (each admits this in its
own comments). `library.js` and `templates.js` never call any
`ApiService` method for save or delete. `children.js` never calls any
`ApiService` method at all, for any operation.

**Evidence (all direct grep matches against the real modules):**
```
cases.js:533       ApiService.deleteData('القضايا', i);
sessions.js:455    ApiService.deleteData('الجلسات', i);
clients.js:455     ApiService.deleteData('الموكلين', i);
tasks.js:416       "deleteTask() does NOT call syncDeleteToSheets()/ApiService.deleteData()"
documents.js:399   "deleteDocument() does NOT call syncDeleteToSheets()/ApiService.deleteData()"
fees.js:470        "deleteFee() does NOT call syncDeleteToSheets()/ApiService.deleteData()"
library.js:160     "migration therefore adds NO ApiService.syncRow()/deleteData() calls"
templates.js:155   "therefore adds NO ApiService.syncRow()/deleteData() calls anywhere"
children.js:101    (module header note — zero ApiService calls of any kind in the file)
```

**Severity:** MEDIUM
**Impact:** Google Sheets (the system's only off-device backup) silently
drifts out of sync with local data for 6 of 9 entity types on delete,
and never receives Children data at all. Not a migration regression —
every one of these gaps is explicitly documented as a pre-existing,
unchanged carry-over from the original pre-Repository app.
**Estimated effort:** Medium — requires deciding, per entity, whether
Sheets sync is actually wanted (Library/Templates may be intentionally
local-only reference material), then adding the missing calls uniformly.
**Recommended priority:** Medium — worth a deliberate product decision
before V1.0, not an emergency fix.

────────────────────────────────────────────────────────────

## T-03 — No retry/backoff logic in ApiService

**Description:** Every method in `js/api/api.js` (`syncRow`,
`updateData`, `deleteData`, `loadFromSheets`/`loadAllSheets`) wraps its
network call in `try/catch`, logging via `console.warn` on failure, with
no automatic retry, backoff, or user-facing recovery affordance.

**Evidence:** `grep -n "retry|attempt|backoff" js/api/api.js` — zero
functional matches (378 total lines). 5 separate `catch (e)` blocks
identified, each terminating in a `console.warn`/no-op, never a retry
loop or re-throw.

**Severity:** MEDIUM
**Impact:** A single transient network failure (cold Google Apps Script
instance, temporary quota, brief connectivity loss) permanently drops
that sync attempt; Sheets only catches up whenever the user happens to
trigger another write to the same row later.
**Estimated effort:** Small–Medium — a bounded exponential-backoff
wrapper around the existing `fetch` calls would cover most transient
failures without any architecture change.
**Recommended priority:** Medium.

────────────────────────────────────────────────────────────

## T-04 — Unbounded localStorage growth from permanent soft-delete

**Description:** Because no purge or hard-delete-after-soft-delete
policy exists anywhere in `Repository.js` or any entity Repository,
every deleted record accumulates in `localStorage` forever. Directly
tied to T-01 (no restore also implies no purge — there's no "trash" UX
of any kind, just permanent silent accumulation).

**Evidence:** `Repository.prototype.delete()` never calls `.splice()` in
the `softDelete: true` branch (only the `else` hard-delete branch does,
`js/core/Repository.js` lines 720–727); all 9 Repositories use
`softDelete: true` (§ Repository Layer table, `Production_Readiness_
Audit.md` §2.2).

**Severity:** LOW today, escalating to HIGH over a long production
lifetime.
**Impact:** Browser `localStorage` quotas are typically 5–10MB per
origin. A multi-year, high-volume legal practice logging many
cases/sessions/documents could theoretically approach this ceiling with
no warning and no built-in mitigation.
**Estimated effort:** Medium — either a periodic archive-to-Sheets-then-
purge job, or a storage-usage indicator plus manual purge action.
**Recommended priority:** Low near-term, Medium-High before a
multi-year production commitment.

────────────────────────────────────────────────────────────

## T-05 — Duplicate full-array scan per render cycle (getAll + search)

**Description:** Every migrated module calls `xRepository.getAll()`
once (to refresh the `data.x` mirror) and then, when the user is on that
page, `xRepository.search(queryModel)` again (to compute the filtered/
sorted render rows) — two independent full passes over the in-memory
record array per render cycle rather than one.

**Evidence:** e.g. `cases.js:303` (`data.cases =
casesRepository.getAll();`) and `cases.js:354` (`var rows =
casesRepository.search(queryModel).items;`) — same pattern confirmed in
`children.js`, `clients.js`, `documents.js`, `fees.js`, `library.js`,
`sessions.js`, `tasks.js`, `templates.js` (9/9 modules).

**Severity:** LOW
**Impact:** Negligible at current expected record counts (tens to low
thousands of rows); would only matter at a scale this app's current
architecture isn't targeting.
**Estimated effort:** N/A — documented only, per phase instructions;
no fix attempted or recommended at this time.
**Recommended priority:** Low. Note only; a future caching layer
(already anticipated by the `DatabaseService`/`StorageAdapter` split)
would naturally absorb this.

────────────────────────────────────────────────────────────

## T-06 — Loosely-typed shared `window._*` globals for cross-module view state

**Description:** `cases.js` and `clients.js` communicate transient
"currently viewed record" state through ad hoc `window._*` globals
(`window._currentViewCase`, `window._currentViewClient`,
`window._currentViewClientIdx`, `window._pendingChildren`,
`window._portalUrl`, `window._portalToken`, `window._portalClientIdx`)
rather than a scoped, typed mechanism.

**Evidence:** `grep -n "window\.[a-zA-Z_]* *=" js/modules/cases.js
js/modules/clients.js` — 12 assignment sites across the two files.

**Severity:** LOW
**Impact:** Works correctly today (single-threaded, single-view-at-a-
time UI), but is fragile to future concurrent-view features and offers
no protection against a typo silently creating a new global. Pre-existing
pattern, not introduced by the Repository migration.
**Estimated effort:** Small, but touches Module files, which are
off-limits for this and the prior phase.
**Recommended priority:** Low.

────────────────────────────────────────────────────────────

## T-07 — 5 of 14 standalone test harnesses have broken `require()` paths

**Description:** `verify_clients_repository.js`,
`verify_children_repository.js`, `verify_sessions_repository.js`,
`verify_tasks_repository.js`, and `verify_library_repository.js` all
throw `MODULE_NOT_FOUND` immediately when run, regardless of working
directory, because their internal `require(path.join(__dirname, ...))`
calls construct a path that does not correspond to any real file
location relative to `js/tests/` (where `__dirname` always resolves,
independent of the shell's current directory).

**Evidence (exact broken constructions found in each file):**
```
verify_clients_repository.js:13   path.join(__dirname, 'js/core/Repository.js')
                                   -> resolves to js/tests/js/core/Repository.js (does not exist)
verify_children_repository.js:16  path.join(__dirname, 'js/core/Repository.js')
                                   -> same bug
verify_sessions_repository.js:16  path.join(__dirname, 'Repository.js')
                                   -> resolves to js/tests/Repository.js (does not exist;
                                      real file is js/core/Repository.js)
verify_tasks_repository.js:16     path.join(__dirname, 'Repository.js')
                                   -> same bug
verify_library_repository.js:18   path.join(__dirname, '..', 'js', 'core', 'Repository.js')
                                   -> resolves to js/js/core/Repository.js (extra 'js' segment;
                                      does not exist)
```
Each file's own header "Run:" instruction is also internally
inconsistent with its actual require paths (e.g.
`verify_fees_repository.js` documents "Run: node
js/repositories/verify_fees_repository.js" — a path where the file does
not live; `verify_tasks_repository.js` documents "Run: node
js/core/verify_tasks_repository.js" — also wrong;
`verify_library_repository.js` documents "Run: node
tests/verify_library_repository.js" — missing the `js/` prefix).

**Confirmed NOT a Repository bug:** temporary corrected copies of all 5
files (fixed `require()` paths only, run from `/tmp`, never saved back
into the project) were executed as a diagnostic. All 5 pass completely:
`verify_clients_repository.js` 35/35, `verify_children_repository.js`
40/40, `verify_sessions_repository.js` 43/43,
`verify_tasks_repository.js` 42/42, `verify_library_repository.js`
61/61 — 221/221 total. This proves `ClientsRepository`,
`ChildrenRepository`, `SessionsRepository`, `TasksRepository`, and
`LibraryRepository` themselves are sound; only their standalone test
harnesses are broken.

**Severity:** MEDIUM (QA-process integrity, not a production defect)
**Impact:** As delivered, these 5 harnesses cannot be run successfully
by any engineer following their own documented instructions, which
means any prior sign-off claiming these specific harnesses were "run
and passed" could not have been reproduced as written. The
corresponding `*_integration.js` harnesses for the same 5 entities *do*
run correctly from the project root and do pass, so overall Repository
behavior has still been exercised — just not through these particular
unit-level files.
**Estimated effort:** Small — each fix is a one-line path correction per
file.
**Recommended priority:** Medium — should be fixed before these 5
harnesses are relied upon again in any future phase's verification
step.

════════════════════════════════════════════════════════════

## Summary Table

| ID | Title | Severity | Priority |
|---|---|---|---|
| T-01 | No restore/undelete path for soft-deleted records | HIGH | High |
| T-02 | Inconsistent Google Sheets delete-sync coverage | MEDIUM | Medium |
| T-03 | No retry/backoff logic in ApiService | MEDIUM | Medium |
| T-04 | Unbounded localStorage growth from permanent soft-delete | LOW→HIGH (long-term) | Low near-term |
| T-05 | Duplicate full-array scan per render cycle | LOW | Low (documented only) |
| T-06 | Loosely-typed shared `window._*` cross-module globals | LOW | Low |
| T-07 | 5 of 14 test harnesses have broken require() paths | MEDIUM | Medium |

No CRITICAL-severity items were found. Nothing in this inventory blocks
current single-user usage; T-01 is the item most worth resolving before
any release explicitly marketed on data-safety guarantees.

════════════════════════════════════════════════════════════
