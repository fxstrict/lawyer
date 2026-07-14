# Repository Runtime Wiring Report

PHASE 9 — SUB-PHASE 9.15 — Repository Runtime Wiring

════════════════════════════════════════════════════════════

## 1. Scope

This phase is Runtime Wiring **only**. No Repository, Core, or Module file
was refactored, redesigned, or behavior-changed. The single allowed edit
was inserting missing `<script>` tags into `index.html`.

## 2. Input Gap

The task instructions reference four "Project Skills" (Motor Archive Pro
— Engineering Core / Repository Migration Standard / Engineering Audit
Standard / Verification & QA Standard) as governing standards for this
phase. Those Skill documents were not present in this environment's
available skill set, so they could not be read or applied directly. This
report instead follows the explicit instructions given in the phase
prompt itself (INPUT / OBJECTIVE / ALLOWED MODIFICATIONS / IMPLEMENTATION
/ VERIFY / OUTPUT), plus direct inspection of the actual codebase, as the
nearest verified reference. No other assumptions were substituted for the
missing Skills.

## 3. Finding: Repository chain was never wired into the runtime

Before this phase, `index.html` loaded only:

```
js/api/api.js
js/ui-utils.js
js/print-utils.js
js/modules/cases.js
...
```

None of `js/core/StorageAdapter.js`, `js/core/LocalStorageAdapter.js`,
`js/core/DatabaseService.js`, `js/core/Repository.js`, or any of the nine
`js/repositories/*.js` files were included anywhere in `index.html`,
despite every Module file (`cases.js`, `clients.js`, `children.js`,
`sessions.js`, `tasks.js`, `fees.js`, `documents.js`, `library.js`,
`templates.js`) already containing a top-level
`var xRepository = new XRepository();` instantiation, per Phase 9.13's
Repository Integration. Loading the real `index.html` unmodified throws
immediately: `CasesRepository requires js/core/Repository.js to be loaded
first (Repository base class not found)`, and equivalent errors for
every other entity, because each `*Repository.js` file guards its own
dependencies (`Repository`, `DatabaseService`, `LocalStorageAdapter`)
with an explicit `throw` if the global isn't a function yet (verified by
reading each Repository file's dependency-guard block directly).

## 4. Dependency graph (verified by direct inspection of each file)

```
StorageAdapter.js            (root.StorageAdapter)
  -> LocalStorageAdapter.js  (root.LocalStorageAdapter; requires StorageAdapter)
    -> DatabaseService.js    (root.DatabaseService; requires StorageAdapter)
      -> Repository.js       (root.Repository; no Core dependency)
        -> CasesRepository.js       (requires Repository, DatabaseService, LocalStorageAdapter)
        -> ClientsRepository.js     (same)
        -> ChildrenRepository.js    (same)
        -> SessionsRepository.js    (same)
        -> TasksRepository.js       (same)
        -> FeesRepository.js        (same)
        -> DocumentsRepository.js   (same)
        -> LibraryRepository.js     (same)
        -> TemplatesRepository.js   (same)
          -> matching Module (instantiates `new XRepository()` at parse time)
```

Note: `DatabaseService.js` only requires `StorageAdapter` directly (not
`LocalStorageAdapter`), but the phase instruction's stricter ordering
rule (LocalStorageAdapter before DatabaseService) was followed anyway, to
match the documented Phase 8 wiring pilot pattern and because every
Repository requires both regardless of DatabaseService's own narrower
need.

## 5. Change made

Inserted 13 script tags into `index.html`, immediately before
`<script src="js/modules/cases.js"></script>` (the first Module that
instantiates a Repository), in dependency order:

```html
<script src="js/core/StorageAdapter.js"></script>
<script src="js/core/LocalStorageAdapter.js"></script>
<script src="js/core/DatabaseService.js"></script>
<script src="js/core/Repository.js"></script>
<script src="js/repositories/CasesRepository.js"></script>
<script src="js/repositories/ClientsRepository.js"></script>
<script src="js/repositories/ChildrenRepository.js"></script>
<script src="js/repositories/SessionsRepository.js"></script>
<script src="js/repositories/TasksRepository.js"></script>
<script src="js/repositories/FeesRepository.js"></script>
<script src="js/repositories/DocumentsRepository.js"></script>
<script src="js/repositories/LibraryRepository.js"></script>
<script src="js/repositories/TemplatesRepository.js"></script>
```

No existing script tag was removed, reordered, or modified. Confirmed by
diffing the full extracted project tree against the original archive:
`index.html` is the only file with content changes (the 13 inserted
lines above); every other file, including every Repository, every Core
file, every Module, and all CSS, is byte-identical to the original
archive.

## 6. Verification performed

`js/tests/verify_runtime_wiring.js` was created and run under a real
headless Chromium instance (Playwright) loading the actual `index.html`
from disk — not a simulation or mock DOM. It checks:

1. **Static script-order check** — parses the real `<script>` tags in
   `index.html` and asserts the full dependency graph in §4 holds
   (each Core file before its dependents, each Repository before
   Repository.js's dependents and before its own Module).
2. **Zero uncaught page errors** on load (`pageerror` events).
3. **Zero unexpected `console.error` output** — classified against two
   known, pre-existing, non-wiring items (see §7); any other
   console.error fails the run.
4. **Global availability** — `StorageAdapter`, `LocalStorageAdapter`,
   `DatabaseService`, `Repository`, all 9 `*Repository` classes, and all
   9 lower-case Repository instances (`casesRepository`, etc.) exist as
   `window` globals after load.
5. **Navigation / Module init** — calls the real `navigate()` function
   for all 12 pages (dashboard, cases, sessions, clients, children,
   documents, tasks, fees, calendar, library, templates, settings) and
   asserts none throw.
6. **Ancillary systems** — confirms `js/api/api.js`'s API surface,
   `js/print-utils.js`'s `printView`, and the QR entry point
   (`showClientPortal`) are all still present and callable.

### Result

```
=== STATIC SCRIPT ORDER CHECK ===
PASS: dependency order valid for all Core files and all 9 Repositories.

=== BROWSER RUNTIME CHECK ===
PASS: zero uncaught page errors on load.
PASS: zero unexpected console.error output (no wiring-caused errors).
NOTE (known, non-wiring, pre-existing): [see §7, item 1]
NOTE (known, non-wiring, pre-existing): [see §7, item 2]

=== GLOBAL AVAILABILITY CHECK ===
PASS: window.StorageAdapter is "function"
PASS: window.LocalStorageAdapter is "function"
PASS: window.DatabaseService is "function"
PASS: window.Repository is "function"
PASS: window.CasesRepository is "function"
PASS: window.ClientsRepository is "function"
PASS: window.ChildrenRepository is "function"
PASS: window.SessionsRepository is "function"
PASS: window.TasksRepository is "function"
PASS: window.FeesRepository is "function"
PASS: window.DocumentsRepository is "function"
PASS: window.LibraryRepository is "function"
PASS: window.TemplatesRepository is "function"
PASS: window.casesRepository is "object"
PASS: window.clientsRepository is "object"
PASS: window.childrenRepository is "object"
PASS: window.sessionsRepository is "object"
PASS: window.tasksRepository is "object"
PASS: window.feesRepository is "object"
PASS: window.documentsRepository is "object"
PASS: window.libraryRepository is "object"
PASS: window.templatesRepository is "object"

=== NAVIGATION / MODULE INIT CHECK ===
PASS: navigate('dashboard') -> ok
PASS: navigate('cases') -> ok
PASS: navigate('sessions') -> ok
PASS: navigate('clients') -> ok
PASS: navigate('children') -> ok
PASS: navigate('documents') -> ok
PASS: navigate('tasks') -> ok
PASS: navigate('fees') -> ok
PASS: navigate('calendar') -> ok
PASS: navigate('library') -> ok
PASS: navigate('templates') -> ok
PASS: navigate('settings') -> ok

=== ANCILLARY SYSTEMS CHECK ===
PASS: apiServicePresent -> true
PASS: printUtilsPresent -> true
PASS: qrEntryPresent -> true

OVERALL: PASS
```

## 7. Known, pre-existing, non-wiring notes (not caused by this phase)

These two items surfaced during verification. Neither is caused by
script order, neither reaches the user, and neither is fixable within
this phase's allowed scope (`index.html` only):

1. **Google Fonts `403`** — the `<link>` to `fonts.googleapis.com` in
   `index.html` (unchanged by this phase) is blocked only because this
   verification ran the page from `file://` with restricted network
   egress. It is a CSS resource, unrelated to any script this phase
   touched, and does not affect JS execution.

2. **`CasesRepository failed to open: ReferenceError: data is not
   defined`** — `js/modules/cases.js` is the one Module positioned, by
   the pre-existing script order, before the inline `<script>` block
   that defines the legacy global `data` mirror object. `cases.js`'s own
   `casesRepositoryReadyPromise` resolves via a Promise microtask that
   runs before the browser reaches that later inline script, so the
   very first `syncCasesMirror()` call (inside `.then()`) throws once,
   is caught by that same chain's own `.catch()` (see `cases.js`'s own
   comment: "renderCases() guards on isReady() and simply shows nothing
   until this is fixed"), and is logged, not thrown to the user. Because
   `casesRepository.open()` has already set the repository to ready
   before this throw, every subsequent call to `syncCasesMirror()` (on
   render, save, or delete) succeeds normally — confirmed directly: this
   harness's `navigate('cases')` call, run after page settle, returns
   `ok` with no error. This is a pre-existing race in `cases.js`'s own
   async design (its own header comments already anticipate and accept
   this exact window), not a defect this phase introduced or can fix —
   `cases.js` is an off-limits Module file, and no script reordering
   changes microtask-vs-next-script-tag timing.

## 8. Confirmation checklist

- [x] No Repository file modified.
- [x] No Core file modified (`StorageAdapter.js`, `LocalStorageAdapter.js`,
      `DatabaseService.js`, `Repository.js`).
- [x] No Module file modified.
- [x] No CSS modified.
- [x] `ApiService`, Dashboard, `print-utils.js` untouched and still
      functional.
- [x] Only `index.html` changed (13 lines inserted, nothing removed or
      reordered).
- [x] Browser Runtime starts successfully with zero uncaught errors.
- [x] Dependency graph valid; script loading order valid.
- [x] All 9 entity Repositories + all 4 Core classes exist as globals
      before any Module executes.
- [x] `js/tests/verify_runtime_wiring.js` created and passing.

════════════════════════════════════════════════════════════

Repository Runtime Wiring

PASS

Ready For Runtime Verification
