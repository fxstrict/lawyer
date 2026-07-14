# DatabaseService_Audit_Report_Part1.md
## PHASE 8 — SUB-PHASE 8.1.1 — Database Layer Architecture Audit (READ ONLY)

**Date:** 2026-07-05
**Scope:** `Master_v10_6_0.zip`, full project tree, read-only inspection only.
**Action taken:** None. No file was created, modified, renamed, reformatted, or deleted
by this audit. This report is the only artifact produced.

---

## 0. Input Reading Order — Status

| # | Document | Status |
|---|---|---|
| 1 | `docs/PROJECT_STATE.md` | Present. Read in full (1224 lines). |
| 2 | `docs/PROJECT_HISTORY.md` | Present (1854 lines). Sampled — see §1 note. |
| 3 | `docs/NEXT_PHASE.md` | Present. Read in full (404 lines). |
| 4 | `docs/Database_Architecture_Report_PHASE1_V10.md` | Present. |
| 5 | `docs/Repository_Contract_Report_PHASE2_V10.md` | Present. |
| 6 | `docs/DatabaseService_Design_Report_PHASE3_V10.md` | Present. Read (Responsibilities section in full). |
| 7 | `docs/Data_Schema_Specification_Report_PHASE4_V10.md` | Present. |
| 8 | `docs/Repository_Core_Report.md` | Present. |
| 9 | All Repository reports inside `docs/` | Present — 9 entity Report + 9 Verification-Report pairs, plus `Repository_Core_Verification_Report.md`, `Repository_Contract_Report_PHASE2_V10.md`, `Data_Schema_Specification_Report_PHASE4_V10.md`. See full list in §2. |
| 10 | Entire source code | Read directly (`js/`, `index.html`, `Code_v4.gs`, `css/`). |

**No Input Gap on file presence** — every document in the requested reading order exists
in the archive.

**Input Gap — PROJECT_STATE.md / NEXT_PHASE.md vs. actual delivered code (important,
carried into every finding below):**
`PROJECT_STATE.md` §23 and `NEXT_PHASE.md` both state, in their own prose, that
**Library Repository "has not been built yet"** and describe it as the recommended
next step after Templates (Sub-Phase 5.10.2). Direct inspection of the archive shows
this is stale: `js/repositories/LibraryRepository.js` (575 lines), `docs/Library_Repository_Report.md`
(“PHASE 5 / SUB-PHASE 5.9.2 — Library Repository”, dated 2026-07-05), and
`docs/Library_Repository_Verification_Report.md` all exist and describe Library as
**Complete**. Sub-phase numbering (5.9.2 for Library vs. 5.10.2 for Templates) indicates
Library was actually built *before* Templates, which also resolves the "sequencing gap"
`PROJECT_STATE.md §23` says is still open. This audit treats Library as **built** (9 of 9
entity Repositories exist), per direct code/report inspection, and flags
`PROJECT_STATE.md`/`NEXT_PHASE.md` as out of date on this specific point.

---

## 1. Repository Inventory — Summary Table

All 9 entities have a concrete Repository file under `js/repositories/`. All 9 subclass
the same `Repository` base class (`js/core/Repository.js`) via
`X.prototype = Object.create(Repository.prototype)`. **None of the 9, and not the base
class itself, is referenced by any `<script src="...">` tag in `index.html`.** Confirmed
by a full scan of every `<script>` tag (§6). All ten files (base + 9 subclasses) are
therefore inert / unreachable at runtime today — pure additive dead code from the running
app's point of view, exactly as every `PROJECT_STATE.md` Repository section states.

| Repository | File | Lines | Parent class | idField | softDelete |
|---|---|---|---|---|---|
| Repository (base) | `js/core/Repository.js` | 1274 | — (root class) | n/a (injected) | configurable, default `true` |
| CasesRepository | `js/repositories/CasesRepository.js` | 390 | `Repository` | `'رقم_القضية'` (natural key) | `true` |
| ClientsRepository | `js/repositories/ClientsRepository.js` | 476 | `Repository` | `'رقم_الموكل'` (hybrid: generated if absent) | `true` |
| ChildrenRepository | `js/repositories/ChildrenRepository.js` | 515 | `Repository` | `'رقم_الطفل'` (hybrid) | `true` |
| SessionsRepository | `js/repositories/SessionsRepository.js` | 606 | `Repository` | `'رقم_الجلسة'` (hybrid) | `true` |
| TasksRepository | `js/repositories/TasksRepository.js` | 582 | `Repository` | `'رقم_المهمة'` (hybrid) | `true` |
| FeesRepository | `js/repositories/FeesRepository.js` | 617 | `Repository` | `'رقم_العملية'` (hybrid) | `true` |
| DocumentsRepository | `js/repositories/DocumentsRepository.js` | 618 | `Repository` | `'رقم_المستند'` (hybrid) | `true` |
| LibraryRepository | `js/repositories/LibraryRepository.js` | 575 | `Repository` | `'id'` (generic, generated) | `true` |
| TemplatesRepository | `js/repositories/TemplatesRepository.js` | 630 | `Repository` | `'id'` (generic, generated) | `true` |

Each subclass file independently re-implements its own temporary
`create<Entity>LocalStorageAdapter()` — none imports or shares an adapter with any
sibling Repository (confirmed by absence of any cross-file `require`/reference among
`js/repositories/*.js`).

---

## 2. Per-Repository Detail

### 2.1 Repository (base class) — `js/core/Repository.js`

- **Parent class:** none (root). Exported as `window.Repository` / `module.exports.Repository`
  inside an IIFE (`(function(root){...})(typeof window!=='undefined'?window:...)`).
- **Constructor:** `function Repository(config)` — requires `config.entityKey` (string) and
  `config.storageAdapter` (duck-typed `{read, write}`, validated via `assertStorageAdapter`
  at construction time — throws a structured `StorageError` if missing). Requires either
  `config.idField` or `config.idGenerator`. Optional: `searchFields[]`, `softDelete`
  (default `true`), `unsupportedOperations[]`.
- **Storage dependency:** none built-in — a Storage Adapter object must be injected.
  The base class touches the adapter in exactly one place: `_persist()`
  (`this._storage.write(...)`) and `open()` (`this._storage.read(...)`).
- **External services:** none. No `fetch`, no `ApiService`, no DOM.
- **CRUD methods:** `create`, `update`, `delete`, `get`, `getAll`, `find`, `exists`,
  `count`, `bulkInsert`, `bulkUpdate`, `bulkDelete`, `clear`, `import`, `export`,
  `transaction`.
- **Search methods:** `search(queryModel)` (public) → internally calls
  `_matchesSearch(record, term)` (protected hook, no-op/generic substring scan over
  `this._searchFields`, empty by default).
- **Filter methods:** `_matchesFilter(record, filter)` (protected hook) — generic
  equality / `{op,value}` range operators (`eq,ne,gt,gte,lt,lte,in,between`) / `and`/`or`
  composition. Invoked from `search()`/`count()`/`_queryInternal()`.
- **Sort methods:** `_compareRecords(a,b,sortSpec)` (protected hook) — generic
  multi-field comparator, `sortSpec: [{field, direction}]`.
- **Validation methods:** `_validate(operation, record)` (protected hook) — no-op in the
  base class (always `{valid:true, errors:[]}`); every subclass overrides it.
- **Lifecycle:** `open()`, `isReady()`, `getState()`, `close()`, `dispose()` — states:
  `created → opening → open → ready ⇄ busy/transaction → closed → disposed`.
- **Error model:** `RepositoryErrorTypes` = `ValidationError, StorageError,
  ConflictError, SyncError, PermissionError, NetworkError,
  UnsupportedOperationError`, built via `createRepositoryError()`.
- **Metadata hook:** `_attachMetadata(record, operation)` stamps
  `createdAt/updatedAt/deletedAt/version/syncVersion/checksum`.

### 2.2 CasesRepository

- **Parent class:** `Repository`.
- **Constructor:** `function CasesRepository(config)` → calls `Repository.call(this, {...})`
  with `entityKey:'cases'`.
- **Storage dependency:** `createCasesLocalStorageAdapter()` — reads/writes
  `localStorage['cases']` as a JSON array (same key/shape as the live `data.cases`).
- **External services:** none.
- **Validation:** `_validate()` overridden — requires non-empty (trimmed) `رقم_القضية`,
  `عنوان_القضية`, `اسم_الموكل` (matches live `saveCase()`, not
  `Data_Schema_Specification_Report.md §4.1`'s narrower 2-field list — a documented
  deviation).
- **Search:** `_matchesSearch()` overridden — full-record substring join over the legacy
  Arabic field list (`CASES_LEGACY_FIELDS`), replicating `renderCases()`.
- **Additive methods:** `insert()`, `remove()`, `filter()`, `sort()`, `validate()` — thin
  wrappers over the Contract-literal `create/delete/search/_compareRecords/_validate`.

### 2.3 ClientsRepository

- **Constructor:** `entityKey:'clients'`, adapter reads/writes `localStorage['clients']`.
- **idField:** `'رقم_الموكل'`, with `_resolveId()` override generating a value only if
  absent (`obj['رقم_الموكل']=obj['رقم_الموكل']||uid();` parity).
- **Validation:** requires non-empty (trimmed) `الاسم` only — no discrepancy vs. Data
  Schema §4.2.
- **Search:** full-record join over `CLIENTS_LEGACY_FIELDS` (incl. `رقم_الموكل`,
  `تاريخ_الإنشاء`, `portal_token`).
- **Additive methods:** same `insert/remove/filter/sort/validate` pattern.

### 2.4 ChildrenRepository

- **Constructor:** `entityKey:'children'`, adapter → `localStorage['children']`.
- **idField:** `'رقم_الطفل'`, hybrid generation via `_resolveId()`.
- **Validation:** requires `رقم_القضية` and `الاسم` (matches both planning docs and code).
- **Search:** full-record join over `CHILDREN_LEGACY_FIELDS` — **documented as a
  deviation from both planning reports**, which claim Children has "no free-text search",
  while the live `renderChildren()`/`#searchChildren` input actually implements one.
- **Additive methods:** `insert/remove/filter({رقم_القضية})/sort/validate`.

### 2.5 SessionsRepository

- **Constructor:** `entityKey:'sessions'`, adapter → `localStorage['sessions']`.
- **idField:** `'رقم_الجلسة'`, hybrid generation.
- **Validation:** requires `التاريخ`, `الوقت` — **deviation** from
  `Data_Schema_Specification_Report.md §4.4` (which lists `رقم_القضية`, `التاريخ`);
  direct inspection of `saveSession()` shows `رقم_القضية` is never checked.
- **Search:** full-record join over `SESSIONS_LEGACY_FIELDS` — wider than both planning
  docs' narrower `عنوان_القضية`/`رقم_القضية` claim.
- **Sort:** default single-field `التاريخ` ascending, **not** the two-field composite
  index the Data Schema doc lists.
- **Explicit non-move:** `sanitizeTime()` is deliberately **not** ported into this
  Repository — `الوقت` is stored/read unnormalized here, despite the Contract report
  recommending the move.
- **Additive methods:** `insert/remove/filter({رقم_القضية}|{الحالة})/sort/validate`.

### 2.6 TasksRepository

- **Constructor:** `entityKey:'tasks'`, adapter → `localStorage['tasks']`.
- **idField:** `'رقم_المهمة'`, hybrid generation.
- **Validation:** requires `العنوان` only — no discrepancy.
- **Search:** full-record join over `TASKS_LEGACY_FIELDS` — wider than the `العنوان`-only
  scope both planning docs describe.
- **Filter:** generic pass-through covers `{الأولوية}` (live dropdown) and `{الحالة}`
  (documented, unwired) without a Tasks-specific override.
- **Sort:** default `الموعد_النهائي` ascending — purely additive (`renderTasks()` applies
  no sort today).
- **Explicit omission:** no `toggleStatus(id)` method, despite the Contract report
  proposing one to mirror `toggleTask()` — this phase's closed method list excluded it.
- **Additive methods:** `insert/remove/filter/sort/validate`.

### 2.7 FeesRepository

- **Constructor:** `entityKey:'fees'`, adapter → `localStorage['fees']`.
- **idField:** `'رقم_العملية'`, hybrid generation.
- **Validation:** requires `رقم_القضية` (trimmed) and `المبلغ` (**not** trimmed) — a
  preserved asymmetry mirroring `saveFee()`'s own `c.trim()` vs. raw `a` check.
- **Search:** full-record join over `FEES_LEGACY_FIELDS`.
- **Filter:** generic pass-through for `{رقم_القضية}`, `{المبلغ:{op,value}}`,
  `{تاريخ_الاستلام:{op,value}}`, `{طريقة_الدفع}` — **none of these has a live UI
  control**; Fees has no filter dropdown of any kind, only free-text search. A
  `{الحالة}` filter is accepted but always returns zero matches (no status field exists
  anywhere for Fees).
- **Sort:** default `تاريخ_الاستلام` ascending — purely additive.
- **Additive methods:** `insert/remove/filter/sort/validate`.

### 2.8 DocumentsRepository

- **Constructor:** `entityKey:'documents'`, adapter → `localStorage['documents']`.
- **idField:** `'رقم_المستند'`, hybrid generation.
- **Validation:** requires `رقم_القضية` and `اسم_المستند`, both trimmed symmetrically —
  no discrepancy, no internal asymmetry (unlike Fees).
- **Search:** full-record join over `DOCUMENTS_LEGACY_FIELDS` — wider than the
  single-field claim in the Data Schema doc.
- **Filter:** `{نوع_المستند}` **is** wired to a live `#filterDocType` dropdown
  (`onchange="renderDocuments()"`) — the first live filter dropdown confirmed since
  Tasks. `{رقم_القضية}` remains documented but unwired. `{الحالة}` accepted but always
  empty (no status field exists for Documents either).
- **Sort:** default `تاريخ_الإيداع` ascending — purely additive.
- **Additive methods:** `insert/remove/filter/sort/validate`.

### 2.9 LibraryRepository

- **Constructor:** `entityKey:'library'`, adapter → `localStorage['library']`.
- **idField:** `'id'` — the **first** entity (chronologically, per its own
  Sub-Phase 5.9.2 numbering — see Input Gap in §0) confirmed to genuinely use the
  generic `id` field, matching `saveLibBook()`'s `obj['id']=obj['id']||uid();`.
- **Validation:** requires `العنوان` only.
- **Search:** full-record join over `LIBRARY_LEGACY_FIELDS`.
- **Sync:** `js/modules/library.js` has an explicit file-header comment: no Sheet
  exists, Library is local-only "by original design" — not a gap, a design decision.
- **Additive methods:** `insert/remove/filter/sort/validate`.

### 2.10 TemplatesRepository

- **Constructor:** `entityKey:'templates'`, adapter → `localStorage['templates']`.
- **idField:** `'id'` — second entity to use the generic field (after Library).
- **Validation:** requires `العنوان` **and** `القسم`, both trimmed — a documented
  **deviation** from `Data_Schema_Specification_Report.md §4.9`, which lists `العنوان`
  alone as required.
- **Search:** full-record join — the first entity in the whole sequence with **no live
  search UI to replicate at all** (no search box ever existed for Templates); added as a
  purely additive capability.
- **Filter:** `{القسم}` is live (`#templateTabs`); `{النوع}` is documented but only ever
  used for a display badge, never wired to a filter control.
- **Sync documentation correction:** a dormant `'الصيغ'` Sheet does exist in
  `Code_v4.gs`'s `SHEET_DEFS`, contradicting both planning docs' "no Sheet at all"
  claim — functionally irrelevant since nothing reads/writes it.
- **Additive methods:** `insert/remove/filter/sort/validate`.

---

## 3. Storage Access Inventory

### 3.1 Inside the (unwired) Repository layer

Every one of the 9 concrete Repository files defines its own
`create<Entity>LocalStorageAdapter(storageImpl)` factory with this identical shape:

```
read:  ls.getItem(entityKey) → JSON.parse → Array.isArray guard → [] on falsy/corrupt
write: ls.setItem(entityKey, JSON.stringify(records))
```

`localStorage` occurrence counts confirm consistent adapter size (9–11 references per
file: `getItem`, `setItem`, `JSON.parse`, `JSON.stringify`, plus doc comments).

### 3.2 Inside the live, wired application (actually running today)

| Call | Location |
|---|---|
| `localStorage.getItem('apiUrl'/'driveUrl')` | `index.html:570-571` (inline bootstrap) |
| `data = { cases: JSON.parse(localStorage.getItem('cases')\|\|'[]'), ... }` (9 entities) | `index.html:572-582` |
| `function saveLocal(){ [...9 keys...].forEach(k => localStorage.setItem(k, JSON.stringify(data[k]))) }` | `index.html:586` |
| `localStorage.setItem('sessions', ...)` (post-sanitize re-save) | `index.html:651` (`DOMContentLoaded` handler) |
| `localStorage.getItem('sheetUrl')` | `index.html:656` |
| `localStorage.setItem('apiUrl'\|'driveUrl'\|'sheetUrl', ...)` | `js/modules/settings.js:17,18,31,64,107` |
| `localStorage.setItem(k, JSON.stringify(arr))` (per-sheet, inside `loadFromSheets()`) | `js/modules/settings.js:125` |

**Finding:** `saveLocal()` — the actual, live persistence helper called from every
module's save/delete path — is defined **inline in `index.html` (line 586)**, not in
`js/ui-utils.js`. `PROJECT_STATE.md §5` lists `saveLocal()` as one of `js/ui-utils.js`'s
exports; direct inspection of `js/ui-utils.js` (63 lines, read in full) shows it contains
only pure formatting/identity/DOM-read helpers (`uid`, `pad`, `sanitizeTime`,
`formatTime`, `parseLocalDate`, `formatDate`, `statusBadge`, `daysUntil`,
`urgencyBadge`, `val`) — no `saveLocal`, no `localStorage` reference at all. This is a
second documentation-vs-code drift (see §0's Library note for the first) worth
flagging alongside the Library one.

### 3.3 Create / Update / Delete / Load — file:line inventory (live modules only)

| Entity | Create/Update | Delete | Toggle | Load (initial) |
|---|---|---|---|---|
| Cases | `cases.js:182` `saveCase()` | `cases.js:229` `deleteCase()` | — | `index.html:573` |
| Clients | `clients.js:150` `saveClient()` | `clients.js:196` `deleteClient()` | — | `index.html:575` |
| Children | `children.js:38` `saveChild()` | `children.js:40` `deleteChild()` | — | `index.html:576` |
| Sessions | `sessions.js:161` `saveSession()` | `sessions.js:208` `deleteSession()` | — | `index.html:574` |
| Tasks | `tasks.js:136` `saveTask()` | `tasks.js:184` `deleteTask()` | `tasks.js:202` `toggleTask()` | `index.html:578` |
| Fees | `fees.js:169` `saveFee()` | `fees.js:220` `deleteFee()` | — | `index.html:579` |
| Documents | `documents.js:143` `saveDocument()` | `documents.js:194` `deleteDocument()` | — | `index.html:577` |
| Library | `library.js:161` `saveLibBook()` | `library.js:208` `deleteLibBook()` | — | `index.html:580` |
| Templates | `templates.js:83` `saveTemplate()` | `templates.js:130` `deleteTemplate()` | — | `index.html:581` |

Every Create/Update/Delete path above ends in a call to `saveLocal()` (module-level
`grep` confirmed at least one `saveLocal();` call inside each of the 9 modules).

---

## 4. External Service / Sync Dependency Inventory

| Module | Sync call | Pattern |
|---|---|---|
| `cases.js:209,232` | `ApiService.syncRow(...)` / `ApiService.deleteData(...)` | Migrated to `ApiService` |
| `clients.js:174,199,571,578` | `ApiService.syncRow` / `.deleteData` / `.updateData` / `.getPortalUrl` / `.getQrImageUrl` | Migrated to `ApiService` |
| `sessions.js:184,210` | `ApiService.syncRow` / `.deleteData` | Migrated to `ApiService` |
| `tasks.js:157` | `ApiService.syncRow` (create/update only) | Migrated for create/update; **delete does not sync** |
| `fees.js:191` | `ApiService.syncRow` (create/update only) | Migrated for create/update; **delete does not sync** |
| `documents.js:165` | `ApiService.syncRow` (create/update only) | Migrated for create/update; **delete does not sync** |
| `children.js:38` | `if(API_URL) syncToSheets('الأطفال', obj, idx)` | **Not migrated** — still calls the raw, direct `syncToSheets()` global, not `ApiService`; **`deleteChild()` has no sync call of any kind.** |
| `library.js` | none | Local-only by explicit design (file-header comment). |
| `templates.js` | none | Local-only; `saveTemplate()`/`deleteTemplate()` never call `syncToSheets`/`ApiService`. |
| `settings.js:27,35,81,112,116,125` | raw `fetch(...)` | **Not migrated to `ApiService`** — `testConnection`, `pingConnection`, `syncToSheets`, `syncDeleteToSheets`, `loadFromSheets` all call `fetch` directly. |

`js/api/api.js` (378 lines) defines `ApiService` — confirmed to contain no
`localStorage` access and no DOM access; its only I/O is `fetch()` (lines 47, 64, 244,
270) — a clean, storage-agnostic network layer, consistent with
`DatabaseService_Design_Report_PHASE3_V10.md §3`'s "out of scope: raw network access
belongs to a future `SyncService`, not `DatabaseService`."

---

## 5. window / document / DOM / fetch / ApiService / Storage — Direct Dependency Scan

| Layer | window | document | fetch | ApiService | localStorage |
|---|---|---|---|---|---|
| `js/core/Repository.js` | 1 (UMD wrapper only: `typeof window!=='undefined'?window:...`) | 0 | 0 | 0 | 0 (delegates entirely to injected adapter) |
| `js/repositories/*.js` (×9) | 1 each (same UMD wrapper pattern) | 0 executable (only inside doc-comments quoting original module source, e.g. `ChildrenRepository.js:89-90`) | 0 | 0 | 9–11 each (inside each file's own local adapter only) |
| `js/api/api.js` | not scanned as a concern (network layer) | 0 | 4 call sites | n/a (this file *is* ApiService) | 0 |
| `js/modules/*.js` | — | heavy, expected (rendering) | only `settings.js` (6 call sites) | `cases/clients/sessions/tasks/fees/documents.js` | `cases/clients/documents/fees/library/sessions/tasks/templates.js:1-2 each`, `children.js:0`, `dashboard.js:0`, `calendar.js:0` |
| `index.html` inline bootstrap | — | heavy (SPA shell) | 0 | 0 | 14 |

**Confirmed clean separation in the (unwired) Repository layer:** no Repository file, and
not the base class, contains any executable `window`, `document`, `fetch`, or
`ApiService` reference. The only `window` token in each is the UMD export wrapper; the
only `document` token in `ChildrenRepository.js` is inside a doc-comment reproducing the
original `saveChild()` source for traceability, not live code.

---

## 6. Current Data Flow (as actually wired and running today)

```
UI (index.html + js/modules/*.js render*() functions)
   ↓  (onclick handlers call save*/delete*/toggle*)
Module-level functions (saveCase, saveClient, saveChild, saveSession, saveTask,
saveFee, saveDocument, saveLibBook, saveTemplate — each mutates the single global
`data.<entity>` array directly, in-module, with no intermediating object)
   ↓
saveLocal()  — defined inline in index.html, NOT in a Repository, NOT in ui-utils.js
   ↓
localStorage.setItem(<entity>, JSON.stringify(data[<entity>]))
```

In parallel, for entities that sync (Cases/Clients/Sessions/Tasks/Fees/Documents on
create+update; Children on create+update via the older direct path):

```
Module save*() function
   ↓
ApiService.syncRow(sheetName, obj, idx)   [or, for Children only: syncToSheets(...)]
   ↓
fetch(API_URL, {POST ...})  → Google Apps Script Web App (Code_v4.gs) → Google Sheet
```

**The Repository layer (`Repository.js` + 9 subclasses) sits completely outside this
diagram today.** It exists on disk, is fully self-testing (own `js/tests/verify_*.js`
harnesses, run outside the delivered tree), but is not `require`d, not `<script>`-tagged,
and has zero call sites anywhere in `index.html` or any `js/modules/*.js` file. It is a
parallel, disconnected implementation of the same storage key/shape contract, not yet
in the live data flow.

---

## 7. Architecture Violations Observed

1. **UI → Module → localStorage direct coupling (no Repository/Service indirection).**
   Every module's `save*()`/`delete*()` function reads/writes the shared global `data`
   object directly and calls `saveLocal()` (a bare `localStorage` wrapper) with no
   intervening Repository or DatabaseService abstraction — this is exactly the pattern
   Phase 5's Repository work is intended to eventually replace, and is today's
   ground truth for all 9 entities.
2. **Module → raw `fetch()` (bypassing `ApiService`) in `settings.js`.** `testConnection`,
   `pingConnection`, `syncToSheets`, `syncDeleteToSheets`, `loadFromSheets` all call
   `fetch()` directly rather than through `ApiService`, even though `ApiService` already
   exists and is used by 6 other modules.
3. **Module → raw `syncToSheets()` (bypassing `ApiService`) in `children.js`.**
   Unlike Cases/Clients/Sessions/Tasks/Fees/Documents (all migrated to
   `ApiService.syncRow`/`.deleteData`), `saveChild()` still calls the older, direct
   `syncToSheets('الأطفال', obj, idx)` global function, and `deleteChild()` has no sync
   call of any kind (a known, previously-documented, deliberately-preserved gap).
4. **Inconsistent delete-sync coverage.** `deleteTask()`, `deleteFee()`, `deleteDocument()`
   perform no Sheet-delete call at all (create/update sync, delete does not) — an
   asymmetric, already-flagged gap that means local state and remote Sheet state can
   diverge after any delete on these three entities.
5. **Global mutable shared state (`data`, `editIdx`) as the true source of truth,
   not encapsulated by any Repository/Module boundary.** Every module reads and writes
   the same global `data.<entity>` array by index (`data.cases[idx]=obj`,
   `data.children.splice(i,1)`, etc.) — there is no encapsulation boundary a
   Repository could slot behind without every module also changing.
6. **Two independent, disconnected implementations of the same storage contract.**
   The (unwired) Repository layer's `create<Entity>LocalStorageAdapter()` factories read
   the identical `localStorage` keys/shapes that `index.html`'s inline bootstrap +
   `saveLocal()` already own live — meaning the same physical storage location has two
   separate code paths that can write to it (only one of which, today, is ever actually
   invoked).

No case of `Module → ApiService` or `Module → localStorage` was found to be routed
*through* a Repository — because no Repository is wired in yet, there is currently no
"Repository internals leaking to UI" violation of the kind the audit scope asked to
watch for; the violation today is the *absence* of the Repository/Service indirection
layer altogether, not a leak around an existing one.

---

## 8. Responsibilities Identified for Future `DatabaseService`

Per `DatabaseService_Design_Report_PHASE3_V10.md §3` (read in full) and cross-checked
against the Repository base class's own doc-comments:

**In scope for `DatabaseService` (not yet implemented as code anywhere in the project):**
- Exclusive storage access (`localStorage` today, IndexedDB/SQLite later) — the *only*
  layer allowed to touch the engine directly; every Repository would call
  `DatabaseService` instead of building its own adapter (today, each Repository still
  builds its own temporary `localStorage` adapter — a stand-in, not the real thing).
- Database lifecycle (open/init/upgrade/close).
- Versioning (schema version tracking, upgrade execution, compatibility guards).
- Object Store definition/management (one store per entity + Metadata/SyncQueue/
  Backups/Logs stores).
- Indexing (secondary indexes per store).
- Transactions (atomic read/write units — note: the *Repository*-level
  `transaction()` implemented today is scoped to a single Repository/entity only;
  cross-entity/orchestration-level transactions are explicitly a `DatabaseService`
  concern per the Design Report).
- In-memory cache layer (speed up repeated reads without bypassing the storage engine
  as source of truth).
- Logical locking (prevent concurrent write conflicts within one browser tab).
- Structured, unified error classification for everything inside this layer.
- Recovery/internal backup (integrity check on open, corruption recovery path).
- SyncQueue store (storage only — queued operations awaiting send to Sheets; does
  **not** itself perform the network send).

**Explicitly out of scope for `DatabaseService`** (per the same source document):
- Actual network I/O (`fetch`, `ApiService`) — belongs to a future `SyncService`.
- Business-level validation (duplicate checks, required-field rules) — stays in the
  Repository layer.
- Any rendering/UI logic.
- The decision of *when* to sync a given entity (`syncPolicy`) — a Repository-level
  decision; `DatabaseService` only stores/retrieves the resulting SyncQueue entries.
- Print/QR/Drive-file building.
- Authentication (does not exist anywhere in the project today).

---

## 9. Repository API Surface Exposed (Contract-literal methods)

Every one of the 9 concrete Repositories exposes, unrenamed, the full Contract-literal
method set inherited from `Repository.prototype`:

`open()`, `isReady()`, `getState()`, `close()`, `dispose()`, `create()`, `update()`,
`delete()`, `get()`, `getAll()`, `find()`, `exists()`, `count()`, `bulkInsert()`,
`bulkUpdate()`, `bulkDelete()`, `search()`, `export()`, `import()`, `clear()`,
`transaction()`.

Every one of the 9 additionally exposes these **additive, non-Contract** convenience
methods (thin wrappers, confirmed present in all 9 by the `.prototype.insert =` /
`.remove =` / `.filter =` / `.sort =` / `.validate =` grep in §2's method scan):
`insert()`, `remove()`, `filter()`, `sort()`, `validate()`.

No concrete Repository defines `close()`/`open()` overrides of its own — lifecycle is
inherited unchanged from the base class in all 9 cases (confirmed: no
`X.prototype.open =` or `X.prototype.close =` override exists in any of the 9 files).

---

## 10. Verification (per Sub-Phase 8.1.1 instructions)

- [x] No files modified — this audit only used `view`/`grep`/`wc`/`find`/`unzip`
  (read-only) commands against a scratch copy of the archive at `/home/claude/work/`;
  nothing under the original upload or any project path was written to.
- [x] No files created — other than this single report.
- [x] No files deleted.
- [x] No code generated, suggested, or fixed.
- [x] Only direct observations from the project are reported above; every deviation
  from `Data_Schema_Specification_Report_PHASE4_V10.md`/`Repository_Contract_Report_PHASE2_V10.md`
  noted in §2 is drawn from the Repository files' own doc-comments (which themselves
  cite direct code inspection), cross-checked against the actual `js/modules/*.js`
  source in this archive.
- [x] The one Input Gap found (`PROJECT_STATE.md`/`NEXT_PHASE.md` describing
  `LibraryRepository` as not-yet-built, when it is present and complete) is reported in
  §0 rather than silently corrected or silently assumed away.

---

Database Layer Audit
PART 1
PASS
Ready For Phase 8.1.2
