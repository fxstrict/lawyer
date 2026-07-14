# DatabaseService_Audit_Report_Part2.md
## PHASE 8 — SUB-PHASE 8.1.2 — Database Layer Deep Audit (READ ONLY)

**Date:** 2026-07-05
**Scope:** `Master_v10_6_0.zip`, full project re-inspected directly from source for this
phase — no finding below is carried over from Part 1 without re-verification against
the actual files.
**Action taken:** None. Read-only (`view`/`grep`/`sed`/`wc`) commands only. No file was
created, modified, renamed, or deleted; no code was generated.

---

## 1. Complete Runtime Data Path — Every Variation Found

The project has **one live, wired data path** (Repository/DatabaseService classes are
not part of it — re-confirmed: `grep '<script' index.html` still shows no
`js/core/Repository.js` or `js/repositories/*.js` entry). Within that one live path there
are **five distinct variations**, depending on entity and operation:

### Variation A — Standard save/delete (7 of 9 entities: Cases, Clients, Sessions,
Tasks, Fees, Documents, and — via an older sub-pattern — Children)

```
UI (onclick="saveX()"/"deleteX()" in index.html)
   ↓
Module save*()/delete*() function (js/modules/*.js)
   ↓  reads/writes data.<entity>[idx] or .push()/.splice() directly
Global `data` object (declared index.html:572-582)
   ↓
saveLocal()  (index.html:586 — the ONE function that persists all 9 keys at once)
   ↓
localStorage.setItem(<entity>, JSON.stringify(data[<entity>]))
```

Confirmed call sites (module:line → function):
`cases.js:182 saveCase()` / `cases.js:229 deleteCase()`;
`clients.js:150 saveClient()` / `clients.js:196 deleteClient()`;
`sessions.js:161 saveSession()` / `sessions.js:208 deleteSession()`;
`tasks.js:136 saveTask()` / `tasks.js:184 deleteTask()`;
`fees.js:169 saveFee()` / `fees.js:220 deleteFee()`;
`documents.js:143 saveDocument()` / `documents.js:194 deleteDocument()`;
`library.js:161 saveLibBook()` / `library.js:208 deleteLibBook()`;
`templates.js:83 saveTemplate()` / `templates.js:130 deleteTemplate()`;
`children.js:38 saveChild()` / `children.js:40 deleteChild()`.
Every one of these 9 save/delete pairs ends in a bare `saveLocal();` call
(confirmed present in all 9 files).

### Variation B — Save/delete **with sync fan-out** (Cases, Clients, Sessions, Tasks,
Fees, Documents)

Same as Variation A, plus a second, parallel branch immediately after `saveLocal()`:

```
saveLocal()
   ↓ (in parallel, same function body, not awaited/blocking)
ApiService.syncRow(sheetName, obj, idx)   [create/update]
ApiService.deleteData(sheetName, idx)     [delete — Cases/Clients/Sessions only]
   ↓
fetch(API_URL, {method:'POST', ...})  →  Code_v4.gs (Apps Script Web App)  →  Google Sheet
```
Confirmed: `cases.js:209,232`; `clients.js:174,199`; `sessions.js:184,210`;
`tasks.js:157` (create/update only — `deleteTask()` at `tasks.js:184` has **no**
matching `ApiService.deleteData` call); `fees.js:191` (create/update only —
`deleteFee()` at `fees.js:220` has none); `documents.js:165` (create/update only —
`deleteDocument()` at `documents.js:194` has none).

### Variation C — Save with sync fan-out via the **older, unmigrated** direct path
(Children only)

```
saveChild()  (children.js:38)
   ↓
saveLocal()
   ↓ (only if API_URL is truthy)
syncToSheets('الأطفال', obj, idx)   ← NOT ApiService, the raw global function
   (settings.js:110)
   ↓
fetch(API_URL, {method:'POST', ...})
```
`deleteChild()` (`children.js:40`) has **no sync call of any kind** — not
`ApiService.deleteData`, not `syncToSheets`. Additionally,
`Code_v4.gs`'s `SHEET_DEFS` (lines 69-141, read in full this phase) contains **no**
`'الأطفال'` sheet definition at all (only `القضايا, الجلسات, الموكلين, المستندات,
المهام, الأتعاب, المكتبة, الصيغ` — 8 sheets total) — so `syncToSheets('الأطفال',...)`
is, today, calling an endpoint for a sheet that structurally does not exist
server-side.

### Variation D — Read-only entities (Library, Templates) — save/delete happen, but
**no sync branch exists at all**, by original design (confirmed: `library.js` header
comment states no Sheet is targeted; `templates.js`'s `saveTemplate()`/
`deleteTemplate()` never call `syncToSheets`/`ApiService`). Their Sheet counterparts
(`'المكتبة'`, `'الصيغ'`, both confirmed present in `Code_v4.gs:134-141`) exist but are
dormant — never read or written by `js/api/api.js` or any module.

### Variation E — Bulk load/import/export/wipe (bypasses per-entity module functions
entirely, writes/reads the **whole `data` object** at once)

- **Initial page load:** `index.html:572-582` — nine `JSON.parse(localStorage.getItem(k)||'[]')`
  calls build `data` directly at script-parse time, before any module has run.
- **Sync-driven bulk reload:** `loadFromSheets()` (`settings.js:119-132`) — iterates a
  **7-entry** `pairs` array (`settings.js:122`; Library/Templates excluded, matching
  their local-only design) and for each entity does
  `data[k] = arr; localStorage.setItem(k, JSON.stringify(arr));` **directly**, bypassing
  `saveLocal()` entirely (a second, independent write path to the same storage keys,
  confirmed at `settings.js:125`).
- **Manual JSON export ("backup"):** `exportData()` (`settings.js:97`) — serializes the
  entire live `data` object in one `Blob`/download, no Repository/DatabaseService
  involved.
- **Manual JSON import ("restore"):** `handleImport()` (`settings.js:99`) — parses an
  uploaded file, overwrites `data[k]` per key wholesale for any key present in the
  file, then calls `saveLocal()` once at the end.
- **Full wipe:** `clearAllData()` (`settings.js:100`) — replaces `data` with a
  fresh all-empty object literal, then `saveLocal()`.

No dedicated "backup" or "restore" function names exist beyond `exportData`/
`importData`/`handleImport` — Export IS the backup mechanism; Import IS the restore
mechanism. There is no incremental/partial backup, no versioned backup, and no
automatic/scheduled backup anywhere in the project.

---

## 2. Exact Locations Where Repository Integration Will Later Replace Existing Logic

| # | File : Line(s) | Current logic | What a wired Repository would replace it with |
|---|---|---|---|
| 1 | `index.html:572-582` | `data = {cases:JSON.parse(localStorage.getItem('cases')||'[]'), ...}` (9x) | `await casesRepo.open()` / `.getAll()`, one per entity |
| 2 | `index.html:586` | `function saveLocal(){...9 keys...localStorage.setItem}` | Removed entirely — each Repository's own `create/update/delete` already persists itself via `_persist()` |
| 3 | `cases.js:182-210` `saveCase()` | Manual required-field check, direct `data.cases[idx]=obj`/`.push()`, `saveLocal()`, `ApiService.syncRow` | `casesRepo.create(obj)` / `casesRepo.update(id,obj)` (validation + persistence unified) |
| 4 | `cases.js:229-234` `deleteCase()` | `data.cases.splice(i,1)`, `saveLocal()`, `ApiService.deleteData` | `casesRepo.delete(id)` (soft-delete per `CasesRepository`'s `softDelete:true`) |
| 5 | `clients.js:150-176` `saveClient()` / `clients.js:196-201` `deleteClient()` | Same pattern as #3/#4 | `clientsRepo.create/update/delete` |
| 6 | `children.js:38` `saveChild()` / `children.js:40` `deleteChild()` | Same pattern, plus the still-unmigrated `syncToSheets()` direct call | `childrenRepo.create/update/delete` — also the natural point to finally resolve the long-open "Children sync policy" decision |
| 7 | `sessions.js:161-186` `saveSession()` / `sessions.js:208-212` `deleteSession()` | Same pattern | `sessionsRepo.create/update/delete` |
| 8 | `tasks.js:136-158` `saveTask()` / `tasks.js:184-187` `deleteTask()` | Same pattern (delete has no sync) | `tasksRepo.create/update/delete` |
| 9 | `fees.js:169-192` `saveFee()` / `fees.js:220-223` `deleteFee()` | Same pattern | `feesRepo.create/update/delete` |
| 10 | `documents.js:143-166` `saveDocument()` / `documents.js:194-197` `deleteDocument()` | Same pattern | `documentsRepo.create/update/delete` |
| 11 | `library.js:161` `saveLibBook()` / `library.js:208` `deleteLibBook()` | Same pattern, no sync | `libraryRepo.create/update/delete` |
| 12 | `templates.js:83` `saveTemplate()` / `templates.js:130` `deleteTemplate()` | Same pattern, no sync | `templatesRepo.create/update/delete` |
| 13 | `cases.js:104`, `children.js:46`, `clients.js:70`, `documents.js:72`, `fees.js:94`, `library.js:94`, `sessions.js:91`, `tasks.js:81` — 8 occurrences of `Object.values(x).join(' ').toLowerCase()...` | Ad-hoc free-text search inline inside each `render*()` | `repo.search({term})`, which already exists and is implemented as `_matchesSearch()` in every one of the 9 Repositories |
| 14 | `cases.js:294,560`, `sessions.js:94`, `calendar.js:145`, `dashboard.js:61` — 5 occurrences of `.sort(function(a,b){...})` | Ad-hoc inline comparators | `repo.sort()`/`_compareRecords()`, already implemented generically in the base class |
| 15 | `documents.js:69` (`val('filterDocType')`), `tasks.js:78` (`val('filterTaskPriority')`), `library.js:84-85` (`val('filterLibCat')`,`val('filterLibType')`), `templates.js:170` (`#templateTabs` tab bar) | Ad-hoc DOM-read-then-`===`-compare filters, inline in each `render*()` | `repo.filter({field:value})`, already implemented generically via `_matchesFilter()` |
| 16 | `settings.js:97` `exportData()` | `JSON.stringify(data,null,2)` whole-object dump | Each Repository's own `export()` (already implemented, Contract §3) called per entity, or a future `DatabaseService`-level aggregate export |
| 17 | `settings.js:99` `handleImport()` | Wholesale `data[k]=im[k]` per key | Each Repository's own `import(entities, mode)` (already implemented) |
| 18 | `settings.js:100` `clearAllData()` | Wholesale `data={...all empty...}` | Each Repository's `clear()` (already implemented), called once per entity |
| 19 | `settings.js:119-132` `loadFromSheets()` | Direct `data[k]=arr; localStorage.setItem(k,...)` per sheet, bypassing `saveLocal()` | Repository `bulkInsert()`/`import()` per entity, feeding a future `SyncService`→`DatabaseService` path instead of touching `localStorage` directly |
| 20 | `cases.js:725-731` `saveCase` wrapper (`_pendingChildren` harvesting) | Reads `window._pendingChildren`, mutates `obj` before persistence | Would need to become a Repository-level composition/hook (e.g. a `_beforeCreate`/pre-validate transform) rather than a function-reassignment wrapper |

---

## 3. Global / Shared / Temporary State Inventory

### 3.1 Declared in `index.html`'s inline bootstrap (module-scope-free, truly global)

| Variable | Line | Purpose | Read/written by |
|---|---|---|---|
| `API_URL` | 570 | Apps Script endpoint | `settings.js` (read/write), all sync-capable modules (read) |
| `DRIVE_URL` | 571 | Google Drive folder link | `settings.js` |
| `data` (object of 9 arrays) | 572-582 | **The** single source of truth for all entity records | every module, `index.html` inline script, `settings.js` |
| `editIdx` (object, 9 keys, all init `-1`) | 583 | Which record index is currently being edited, per entity | every module's `edit*()`/`save*()`/`openAdd*Modal()` — 37 total `editIdx` references across the project |
| `currentPage` | 584 | Active SPA page/route | `navigate()` (index.html:593), all `render*()` gating |
| `calYear`, `calMonth`, `calSelectedDay` | 584 | Calendar view cursor state | `calendar.js` |
| `currentTplFilter` | 584 | Active Templates category tab | `templates.js` |
| `FIELDS`, `MAP` | 625, 636 | Field-id ↔ Arabic-key mapping tables, per entity | `collectForm()`/`fillForm()`/`resetForm()` (print-utils.js) and every module |
| `PAGE_TITLES`, `ADDABLE` | 590-591 | Static UI config | `navigate()`, `openAddModal()` |

### 3.2 Module-scoped "shared" state (top-level `var` in a `js/modules/*.js` file —
persists for the module's lifetime, effectively global once the script is loaded)

| Variable | File:Line | Purpose |
|---|---|---|
| `_caseSelectedClients` | `clients.js:598` | In-progress multi-client selection while a Case modal is open — mutated by `toggleCaseClient()`, read by `renderClientSelectorChips()`/`_syncCaseClientField()`, reset only inside the `resetForm` override (§3.3) |
| `_origSaveCase`, `_origCollect`, `_origFill`, `_origResetForm` | `cases.js:725,736,749,766` | Captured references to the pre-override functions — an override/wrapper chain, not simple data, but a load-order-dependent piece of shared state |
| `_origResetFormForClientSelector`, `_origEditCaseForClientSelector`, `_origSaveCaseForClientSelector` | `clients.js:797,808,819` | A **second layer** of the same wrapper chain, applied on top of `cases.js`'s already-wrapped `resetForm`/`editCase`/`saveCase` |
| `CASES_FIELDS/MAP`, `CLIENTS_FIELDS/MAP`, … (×9) | each module's top | Per-entity duplicates of the same keys already defined in `index.html`'s global `FIELDS`/`MAP` — confirmed dead/unused at runtime for at least Templates (`PROJECT_STATE.md` Phase 11B finding, independently re-confirmed structurally here: `collectForm`/`fillForm`/`resetForm` read the global `FIELDS`/`MAP`, not these per-module constants) |

### 3.3 `window.*` ad-hoc globals (not declared with `var` anywhere — attached directly
to `window`, so no `grep '^var'` scan would find them; located instead by scanning for
`window.` assignment)

| Property | Set at | Read at | Purpose |
|---|---|---|---|
| `window._currentViewCase` | `cases.js:338` | `clients.js:222,927` | Which case is currently open in the shared View/Print modal |
| `window._currentViewSessions` | `cases.js:339` | (print/report builder, same view flow) | Sessions list snapshot for the currently viewed case |
| `window._currentViewClient` | `clients.js:223,253` | `clients.js:926` | Which client is open in the same shared View/Print modal (mutually exclusive with `_currentViewCase` — `clients.js:222` explicitly nulls the case one when a client view opens) |
| `window._currentViewClientIdx` | `clients.js:224,254` | `clients.js:489` | Index of the currently viewed client, used later by `revokeClientPortal()` |
| `window._pendingChildren` | `cases.js:729,740-741` | same file, inside the `collectForm` override | One-shot transfer channel carrying serialized children-in-case JSON from the `saveCase` wrapper into the `collectForm` wrapper |
| `window._portalUrl`, `window._portalToken`, `window._portalClientIdx` | `clients.js:506-508` | `clients.js:536,549,559` | Client-portal QR/link generation state, read later by the "copy link"/"open link"/"revoke" actions |

**None of the above (§3.1-§3.3) is encapsulated by any Repository or module boundary.**
Every module can read and mutate every other module's state (`data`, `editIdx`, and the
`window._*` properties are all plain globals), and the override-wrapper chain in §3.2
means the *order* `<script>` tags load in (`index.html:564-721`) is load-bearing:
`cases.js` (position 4) must load before `clients.js` (position 13) or the second-layer
`resetForm`/`editCase`/`saveCase` wrappers in `clients.js` would wrap `undefined`
instead of the already-wrapped functions.

---

## 4. Function Responsibility Inventory (initial load / save / edit / delete / sync /
export / import / backup / restore)

| Responsibility | Entities covered | File:Line(s) |
|---|---|---|
| **Initial load** | all 9 | `index.html:572-582` (synchronous, from `localStorage`, at script-parse time) |
| **Initial load (remote override)** | 7 of 9 (no Library/Templates) | `settings.js:119-132 loadFromSheets()`, invoked from `index.html:658` (`if(API_URL){loadFromSheets();...}`) inside `DOMContentLoaded` |
| **Save (create+update)** | all 9 | see §1 Variation A/B/C file:line list |
| **Edit (open for edit)** | all 9 | `editCase/editClient/editChild/editSession/editTask/editFee/editDocument/editLibBook/editTemplate` — one per module, sets `editIdx.<entity>=i` then calls `fillForm()` |
| **Delete** | all 9 | see §1 Variation A/B/C |
| **Toggle (status flip, not full edit)** | Tasks only | `tasks.js:202 toggleTask()` |
| **Sync (to Google Sheets)** | 6 of 9 (Cases/Clients/Sessions/Tasks*/Fees*/Documents*, *=create/update only) + Children (older direct path, create/update only) | `js/api/api.js` (`ApiService.syncRow`/`.deleteData`), `settings.js:110-117` (`syncToSheets`/`syncDeleteToSheets`, raw) |
| **Export (full backup)** | all 9 (whole `data` object) | `settings.js:97 exportData()` |
| **Import (full restore)** | all 9 (whichever keys are present in the uploaded file) | `settings.js:99 handleImport()` |
| **Backup** | — | no dedicated function; `exportData()` is the de facto backup mechanism (manual, on-demand, unversioned, no automatic schedule) |
| **Restore** | — | no dedicated function; `handleImport()` is the de facto restore mechanism (manual, on-demand, full-object only, no partial/selective restore, no rollback) |
| **Wipe** | all 9 | `settings.js:100 clearAllData()` |

---

## 5. Ownership Classification

| Responsibility | UI | Module | Repository (built, unwired) | Future DatabaseService | Future Storage Adapter |
|---|---|---|---|---|---|
| Rendering / DOM | ✅ owns | — | — | — | — |
| Reading form input | ✅ (`val()`, `document.getElementById`) | — | — | — | — |
| Required-field validation | — | ✅ owns today (inline in each `save*()`) | ✅ also implements (`_validate()`, unused) | — (Design Report explicitly excludes business validation) | — |
| Free-text search | — | ✅ owns today (inline `Object.values().join()`) | ✅ also implements (`_matchesSearch()`, unused) | — | — |
| Filter (dropdowns/tabs) | ✅ (dropdown markup) | ✅ owns today (inline `val()===` compare) | ✅ also implements (`_matchesFilter()`, unused) | — | — |
| Sort | — | ✅ owns today, ad-hoc, only for 4 of 9 entities (Cases×2, Sessions, Calendar/Dashboard) | ✅ also implements (`_compareRecords()`, unused, all 9) | — | — |
| CRUD orchestration (create/update/delete) | — | ✅ owns today (`data.<entity>` mutation + `saveLocal()`) | ✅ full Contract-literal implementation exists, unused | eventually orchestrates across Repositories/entities | — |
| ID generation / natural-key resolution | — | ✅ owns today (`obj[k]=obj[k]\|\|uid()` inline per module) | ✅ also implements (`_resolveId()`) | — | — |
| Soft-delete / audit metadata (`createdAt` etc.) | — | ❌ not implemented at all today (delete is destructive `splice()`; no `createdAt`/`version`/`checksum` field is ever written by any live module) | ✅ implements (`_attachMetadata`), unused | — | — |
| Raw storage read/write (`localStorage`) | — | `settings.js` writes directly in `loadFromSheets()` | each Repository's own temporary adapter (unused) | should become sole owner | ✅ ultimate owner (not implemented as code anywhere yet) |
| Schema versioning / migrations | — | none exists | none | ✅ designed, not built | — |
| Transactions (atomic multi-op) | — | none exists (each save/delete is a single unguarded mutation) | ✅ implemented per-entity (`transaction()`), unused | ✅ would own cross-entity transactions | — |
| In-memory cache | — | `data` itself functions as an ad-hoc, ungoverned cache | each Repository holds its own `_records` cache once opened (unused) | ✅ designed as the authoritative cache layer | — |
| Network sync (`fetch`/`ApiService`) | — | ✅ owns today (6 of 9 modules + raw `fetch` in `settings.js`) | none (out of scope by design) | out of scope (belongs to future `SyncService`) | — |
| Export/Import/Backup/Restore | ✅ (file picker/download UI) | ✅ owns today (`settings.js`) | partial (`export()`/`import()` exist per-Repository, unused) | future aggregate backup across entities, per Design Report | — |
| Locking (concurrent-write guard) | — | none exists | base class has a `_locked` transaction guard only (single-Repository, in-memory, unused) | ✅ designed (cross-tab/cross-Repository locking) | — |

---

## 6. Duplicate Responsibilities Detected

| Responsibility | Duplicated between | Evidence |
|---|---|---|
| **Validation** | Module `save*()` inline checks **vs.** matching Repository `_validate()` | e.g. `cases.js:186-189` (`if(!num\|\|!title\|\|!client)`) vs. `CasesRepository.js` `_validate()` (`CASES_REQUIRED_FIELDS.forEach(...)`) — same 3 fields, two independent implementations, only one (the module) is ever executed |
| **Search** | Module `render*()` inline `Object.values(x).join(' ')` **vs.** Repository `_matchesSearch()` | 8 occurrences (§2 row 13) vs. 8 matching Repository overrides (Templates is the one entity with neither) |
| **Filter** | Module `render*()` inline `val('#filterX')===` **vs.** Repository `_matchesFilter()`/generic engine | `documents.js:69`, `tasks.js:78`, `library.js:84-85`, `templates.js:170` vs. every Repository's `filter()` wrapper |
| **Sort** | Module ad-hoc `.sort()` **vs.** Repository `_compareRecords()`/`sort()` | `cases.js:294,560`, `sessions.js:94`, `calendar.js:145`, `dashboard.js:61` vs. all 9 Repositories' `sort()` |
| **CRUD** | Module `data.<entity>[idx]=obj`/`.push()`/`.splice()` **vs.** Repository `create()`/`update()`/`delete()` | every one of the 9 save/delete pairs listed in §2 vs. the matching Repository method — full functional duplication, zero code sharing |
| **ID generation** | Module inline `obj[k]=obj[k]\|\|uid()` (e.g. `children.js:38`, `clients.js:~155`) **vs.** Repository `_resolveId()` | same fallback pattern, independently written twice per hybrid-id entity |
| **Storage (localStorage read/write)** | `index.html`'s `saveLocal()`/bootstrap load **vs.** each Repository's own `create<Entity>LocalStorageAdapter()` | both target the exact same `localStorage` keys/shapes — two independent code paths capable of writing to the same physical location, only one of which runs today |
| **Sync** | `ApiService` (`js/api/api.js`) **vs.** `settings.js`'s raw `syncToSheets`/`syncDeleteToSheets`/direct `fetch` calls | `settings.js:110-117,125` still implements its own fetch-based sync/load logic in parallel with `ApiService`, which 6 other modules already use instead |
| **Field-name mapping tables** | Global `FIELDS`/`MAP` (`index.html:625-646`) **vs.** each module's own `<ENTITY>_FIELDS`/`<ENTITY>_MAP` constants | 9 modules each declare their own copy; only the global one is confirmed live (Templates case, `PROJECT_STATE.md` Phase 11B, structurally re-confirmed here) |

---

## 7. Risks a Future `DatabaseService` Insertion May Introduce

| # | Risk | Where it would arise | Why |
|---|---|---|---|
| 1 | **Double writes** | Any entity's save/delete path, the moment a Repository is wired in *alongside* (not instead of) the existing `saveLocal()` call | Both `saveLocal()` (writes all 9 keys) and the Repository's own `_persist()` (writes its one key) target the identical `localStorage[entityKey]` — if a migration step calls both (e.g. to be "safe" during a transition), every write happens twice, and whichever runs last silently wins |
| 2 | **Stale cache** | Repository `_records` in-memory array vs. the global `data.<entity>` array | These would be two independent in-memory copies of the same entity the moment a Repository is opened alongside legacy code; any write through the *old* path (`data.cases.push(obj); saveLocal();`) would leave the Repository's `_records` (loaded once at `open()`) silently out of date, and vice versa |
| 3 | **Circular / load-order dependency** | The `cases.js → clients.js` `resetForm`/`editCase`/`saveCase` override-wrapper chain (§3.2) | These wrappers capture `var _orig* = <currentGlobalFunction>` at **script-parse time**. If a Repository-wiring change alters when/whether `saveCase`/`resetForm` exist as free functions (e.g. replacing them with Repository-method calls before `clients.js` loads), the second-layer wrapper in `clients.js` would either wrap `undefined` or silently skip its own logic (`if(typeof saveCase==='function')` guards exist for `editCase`/`saveCase` overrides but **not** for the `resetForm` override at `clients.js:797`, which assumes `resetForm` is already a function unconditionally) |
| 4 | **Race condition** | `loadFromSheets()` (`settings.js:119-132`) running concurrently with a user actively editing/saving a record in the same entity | `loadFromSheets()` overwrites `data[k]` wholesale, mid-session (triggered on connect, and via `refreshAll()`/`pingConnection` flows) — any in-flight `editIdx.<entity>` a user currently has open would silently point at a now-stale/renumbered index in the freshly-replaced array. Introducing a Repository's own separately-cached `_records` on top of this makes the race three-way instead of two-way |
| 5 | **Lost update** | `data.<entity>[idx] = obj` pattern used by every `save*()` | Index-based (not id-based) update — if two code paths (legacy module + a newly-wired Repository call) both resolve "the record at position `idx`" independently and one path's array has already been reordered/filtered/reloaded (e.g. by `loadFromSheets()` or a soft-delete filtering step a Repository would introduce), the wrong record can be silently overwritten |
| 6 | **Transaction inconsistency** | Any multi-entity operation done today as several independent single-entity mutations — e.g. `saveCase()` embeds children JSON (`أطفال_القضية`) via the `window._pendingChildren` transfer (§2 row 20) while `ChildrenRepository` (if wired) would treat Children as its own independent entity/table | The live app already duplicates child data (embedded in Cases **and** in a separate `children` array — a duplication `Repository_Contract_Report.md §15/§17` already documents as out of scope even for the Repository layer). A `DatabaseService`-level transaction spanning both would need to reconcile two representations of the same fact that the current code never keeps in sync transactionally |
| 7 | **Version conflict** | Every Repository's `_attachMetadata()` stamps a `version` field on `create`/`update` — but no live module writes or reads a `version` field on any record today | The moment real records (already in `localStorage`, versionless) are opened through a Repository for the first time, `_attachMetadata` would treat every existing record as version-less/`undefined`, and the first `update()` would set `version:1` retroactively — a discontinuity that could confuse any optimistic-concurrency logic built on top later |
| 8 | **Synchronization drift (local vs. Sheet)** | The already-present asymmetric sync gaps: `deleteTask()`, `deleteFee()`, `deleteDocument()` never sync deletes; `children.js` never migrated to `ApiService`; `deleteChild()` has no sync call at all; `'الأطفال'` has no server-side Sheet to sync to in the first place | Wiring `DatabaseService`'s `SyncQueue` store on top of this **without first resolving these gaps** would queue sync operations for entities/operations the current design has already decided (by omission) not to sync — the queue would either grow unboundedly for undeliverable Children-delete/Task-delete/Fee-delete/Document-delete operations, or require new policy decisions that don't exist yet |
| 9 | **Duplicate ID / natural-key drift** | Two independent `_resolveId()`-equivalents (module inline `uid()` fallback vs. Repository `_resolveId()`) generating IDs for the *same conceptual create* if both paths ever ran for one record | Low probability today (only one path runs), but a naive "run both to compare" migration strategy would risk two different generated IDs for what should be one record |

---

## 8. Proposed Future Migration Order (with rationale)

**Step 1 — Repository Wiring** (attach the 9 existing, already-built Repositories to
`index.html`; route the 12 module read/write points in §2 through them, one entity at a
time, behind a feature flag if needed).
*Why first:* the Repositories already exist, are already tested (`js/tests/verify_*`),
and are the only layer today that already unifies validation/search/filter/sort/CRUD —
wiring them removes the §6 duplication immediately without needing any new class to be
designed. Doing this before touching storage internals also means the *interface*
(`create/update/delete/search/...`) is proven against real UI usage before a storage
engine swap risks compounding two changes at once.

**Step 2 — DatabaseService** (implement the class `DatabaseService_Design_Report_PHASE3_V10.md`
already specifies; give it exclusive `localStorage` access).
*Why second:* only after Step 1 proves the Repository interface is sufficient for every
live UI interaction does it make sense to build the layer *underneath* the Repositories.
Building `DatabaseService` first, with no wired caller, would repeat the same
"orphan class" pattern the Repository layer itself is in today.

**Step 3 — Storage Adapter (real, shared)** (replace each Repository's own temporary,
per-entity `create<Entity>LocalStorageAdapter()` with one shared adapter backed by the
new `DatabaseService`).
*Why third:* this is the step that actually resolves Risk #1 (double writes) and
Risk #2 (stale cache) — once every Repository's `read`/`write` goes through one
`DatabaseService` instance instead of nine independent `localStorage` wrappers, there is
exactly one in-memory/storage boundary left, matching the Design Report's "exclusive
storage access" mandate.

**Step 4 — Transactions** (promote the already-implemented single-Repository
`transaction()` into cross-entity transactions coordinated by `DatabaseService`, and
resolve the Cases/Children embedded-vs-separate duplication called out in Risk #6).
*Why fourth:* transactions are only meaningful once there is one shared storage
boundary (Step 3) for them to be atomic *against*. Attempting cross-entity transactions
against nine independent adapters (today's state) cannot be made atomic no matter how
the transaction API is designed.

**Step 5 — Cache** (introduce `DatabaseService`'s in-memory cache layer on top of the
now-single storage boundary).
*Why fifth:* caching only pays off, and can only be reasoned about for staleness, once
reads/writes are centralized (Step 3) and transactional (Step 4). Caching before that
would risk caching one of several competing write paths.

**Step 6 — Migration Engine** (schema versioning, upgrade scripts, and — critically —
the one-time backfill of `createdAt`/`updatedAt`/`version`/`checksum` onto every
already-existing `localStorage` record, resolving Risk #7).
*Why sixth:* a migration/versioning engine is only necessary once there is a schema to
version — which only becomes true after Steps 1-5 establish what "the schema" even is
end-to-end (Repository interface + DatabaseService storage + transactions + cache).
Running it earlier would have nothing stable to migrate *to*.

**Step 7 — Cleanup** (delete the now-dead duplicate logic identified in §6: module-level
inline validation/search/filter/sort, the per-module `<ENTITY>_FIELDS/MAP` constants,
`settings.js`'s raw `fetch`-based `syncToSheets`/`syncDeleteToSheets`/`loadFromSheets` in
favor of a `SyncService` built on the new stack, and the `window._*` ad-hoc globals
where a Repository-backed alternative now exists).
*Why last:* cleanup is safe only after the replacement path (Steps 1-6) has been proven
correct in production use — removing the legacy path first, or concurrently, would
remove the fallback the project would need if any earlier step surfaced a regression.

---

## 9. Readiness Matrix

| Module | Status | Justification |
|---|---|---|
| `js/core/Repository.js` | **Ready** | Fully implemented Contract-literal surface (§9 of Part 1), 32/32 self-tests per `PROJECT_STATE.md §15` (re-confirmed structurally: full CRUD/lifecycle/error-model/metadata methods present, `node --check`-clean per prior reports). No wiring blockers of its own. |
| CasesRepository | **Partially Ready** | Feature-complete and tested (30/30), but depends on resolving the `window._pendingChildren`/embedded-children override chain (§3.3, §7 Risk #6) before it can fully replace `saveCase()`. |
| ClientsRepository | **Partially Ready** | Feature-complete (35/35), but `_caseSelectedClients` and the `window._currentViewClient*`/portal-token globals (§3.3) are UI-session state entangled with Client save/view flows that a pure data Repository does not model — these would need a UI-state layer alongside the Repository. |
| ChildrenRepository | **Partially Ready** | Feature-complete (40/40), but the live `children.js` sync path is on the older, unmigrated `syncToSheets()` pattern (§1 Variation C) *and* `الأطفال` has no server-side Sheet at all — wiring must be paired with a Children sync-policy decision (already flagged as open in `PROJECT_STATE.md §11` since before this phase). |
| SessionsRepository | **Partially Ready** | Feature-complete (43/43) and its live module is already fully migrated to `ApiService`, but the Repository deliberately excludes `sanitizeTime()` normalization — wiring would need to decide whether that normalization moves too or stays a Module-layer concern. |
| TasksRepository | **Partially Ready** | Feature-complete (42/42), fully `ApiService`-migrated for create/update, but `deleteTask()` has no sync counterpart — wiring surfaces, but does not itself resolve, the open delete-sync-policy decision. |
| FeesRepository | **Partially Ready** | Feature-complete (46/46), same delete-sync gap as Tasks, plus the documented trim/no-trim validation asymmetry (`رقم_القضية` trimmed, `المبلغ` not) that any wiring must preserve deliberately, not "fix." |
| DocumentsRepository | **Partially Ready** | Feature-complete (61/61, largest test suite), same delete-sync gap as Tasks/Fees. |
| LibraryRepository | **Ready** | Feature-complete, no sync entanglement at all (local-only by design — the simplest entity to wire, no external-sync coordination needed). |
| TemplatesRepository | **Ready** | Feature-complete, no sync entanglement, no search-behavior gap to reconcile (first entity with no live search to replicate — wiring only adds capability, never risks removing one). |
| `js/api/api.js` (ApiService) | **Ready** | Clean, storage-agnostic network layer already in use by 6 of 9 modules; no localStorage coupling to disentangle. |
| `settings.js` | **Not Ready** | Still uses raw `fetch()` (5 call sites) instead of `ApiService`, and `loadFromSheets()` bypasses `saveLocal()` with its own direct `localStorage.setItem` per key (§1 Variation E) — this file needs its own migration pass before or during Repository wiring, not after. |
| `index.html` inline bootstrap | **Not Ready** | Owns the canonical `data`/`editIdx`/`saveLocal()` globals every module depends on; cannot be wired incrementally without first deciding how `data.<entity>` continues to exist (or is shimmed) for modules not yet migrated in a given wiring step. |
| `DatabaseService` | **Not Ready** | Does not exist as code anywhere in the project (confirmed again this phase — no file, no class, no reference outside design-document prose). |
| Storage Adapter (shared) | **Not Ready** | Only per-Repository, temporary, `localStorage`-only adapters exist (9 independent copies); no shared/injectable adapter implementation exists yet. |

---

## 10. Risk Matrix

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Double writes during transition (Risk §7.1) | High (if Step 1 wiring runs the legacy path and a Repository path side-by-side, which is the natural incremental-migration temptation) | Medium (data itself stays correct since both write the same value, but write amplification and hidden bugs if the two paths ever diverge) | Wire one entity fully (legacy path removed) before starting the next, per §8 Step 1; never run both save paths for the same entity simultaneously in production |
| Stale in-memory cache (Repository `_records` vs. global `data`) (Risk §7.2) | High during any partial-wiring period | High (a user could see/edit data that a concurrent path has already changed) | Do not `open()` a Repository until its entity's legacy `data.<entity>` accesses have all been removed from every module in the same wiring step |
| Override-chain breakage (`resetForm`/`editCase`/`saveCase`) (Risk §7.3) | Medium (only triggered if wiring changes function *identity*, not just body) | Medium (breaks Cases/Clients modal reset or the client-selector UI, a visible but non-data-loss bug) | Add the same `typeof X==='function'` guard already used for `editCase`/`saveCase` overrides to the `resetForm` override in `clients.js:797` before any wiring step touches `resetForm` |
| Race condition: `loadFromSheets()` vs. in-progress edit (Risk §7.4) | Medium (requires a connected `API_URL` and a user editing at the exact moment a background sync/ping triggers `loadFromSheets`) | High (silent data loss/mismatch — the user's `editIdx` could point at the wrong record after the array is replaced) | Resolve before/alongside Step 3 (shared Storage Adapter): make `loadFromSheets`'s equivalent merge by id, not replace-the-whole-array; block/queue it while any modal in that entity's page is open |
| Lost update via index-based (`data.<entity>[idx]`) writes (Risk §7.5) | Medium | High (silent overwrite of the wrong record) | Repository `update(id, patch)` is already id-based, not index-based — prioritize wiring entities with the most concurrent-edit exposure (Cases, Sessions) earliest in Step 1 to retire index-based writes soonest |
| Transaction inconsistency from Cases↔Children duplication (Risk §7.6) | Low-Medium (only manifests if both are edited near-simultaneously, or if a future cross-entity transaction assumes single-source-of-truth) | Medium (an inconsistent read between the embedded and standalone children representations, not data loss) | Explicitly out of scope for Repository/DatabaseService per `Repository_Contract_Report.md §15/§17` — must be resolved as its own dedicated design decision before Step 4 (Transactions) is implemented, not silently absorbed into it |
| Version-field discontinuity on first-touch of pre-existing records (Risk §7.7) | High (guaranteed the first time any existing record is `update()`d through a Repository) | Low (cosmetic/metadata only — no functional field is affected) | Treat as expected and document it in the Migration Engine step (Step 6), not as a bug to "fix" retroactively |
| Sync-queue growth for already-broken sync paths (Risk §7.8) | High (Children delete, Task/Fee/Document delete, and Children's missing Sheet are all already-existing, unresolved gaps) | Medium (SyncQueue could grow with undeliverable operations, consuming storage/attention without ever succeeding) | Resolve the four open sync-policy decisions (`PROJECT_STATE.md §11`) *before* Step 2 (DatabaseService/SyncQueue), not after |
| Duplicate/diverging generated IDs (Risk §7.9) | Low (only if both create paths run for one logical record) | Medium (would create two records instead of updating one) | Never run module-inline `uid()` fallback and Repository `_resolveId()` for the same create call — Step 1 wiring must fully replace the module's own id-generation line, not add the Repository's on top |

---

## 11. Wiring Matrix

| Current Component | Future DatabaseService Responsibility | Migration Difficulty |
|---|---|---|
| `index.html:572-582` (`data` object direct `localStorage` load) | Lifecycle: `open()`/initial load, one per Store | **Medium** — straightforward mechanically, but every module currently assumes `data.<entity>` is synchronously available at parse time; a Repository/DatabaseService `open()` is `async`, requiring the app's own bootstrap to become promise-aware |
| `index.html:586` `saveLocal()` | Exclusive storage write, per Store | **Low** — a pure removal once every module routes through its Repository instead |
| `settings.js:110-117` `syncToSheets`/`syncDeleteToSheets` (raw `fetch`) | Out of scope for DatabaseService — belongs to a future `SyncService`; DatabaseService only owns the `SyncQueue` store these would enqueue into | **Medium** — requires `children.js` to first migrate to whatever replaces this (either `ApiService` now, or `SyncService` later) |
| `settings.js:119-132` `loadFromSheets()` (direct per-key `localStorage.setItem`) | Would become a `SyncService`-driven `bulkInsert()`/`import()` call per Repository, with DatabaseService as the storage target underneath | **High** — currently bypasses `saveLocal()` already (a pre-existing inconsistency, §1 Variation E), and would need to reconcile "replace whole array" semantics with the Repository's id-based `bulkInsert`/`import` |
| Each module's inline validation (§6) | Out of scope for DatabaseService (Design Report §3: business validation stays in Repository) | **Low** — this is a Repository-wiring concern (Step 1), not a DatabaseService one |
| Each module's inline search/filter/sort (§6) | Out of scope for DatabaseService (UI/query concern, already served by the existing Repository query hooks) | **Low** — Step 1 concern |
| 9× per-Repository temporary `localStorage` adapters (`create<Entity>LocalStorageAdapter`) | Replaced by one shared adapter backed by `DatabaseService` | **Medium** — mechanically simple (swap the adapter each Repository is constructed with), but is exactly the step that must happen atomically across all 9 to avoid Risk §7.1/§7.2 |
| Repository `transaction()` (single-entity, in-memory-staged, already implemented) | DatabaseService would provide the true storage-level atomic commit underneath, and could extend the model to cross-entity transactions | **High** — cross-entity transaction semantics (esp. the Cases/Children duplication, Risk §7.6) are not designed yet anywhere in the docs read this phase |
| `exportData()`/`handleImport()`/`clearAllData()` (`settings.js:97-100`) | Could become DatabaseService-level aggregate backup/restore/wipe, built from each Repository's already-implemented `export()`/`import()`/`clear()` | **Medium** — mechanically each Repository already has the primitive; the aggregation/orchestration across all 9 is the new work |
| `_attachMetadata` (`createdAt`/`updatedAt`/`version`/`checksum`) already implemented per-Repository | DatabaseService's Versioning Model (`DatabaseService_Design_Report_PHASE3_V10.md §5`) would consume/enforce these at the storage-integrity level | **Medium** — the fields are already generated; the missing piece is the one-time backfill for pre-existing records (Risk §7.7) and the schema-version compatibility gate itself, neither of which exists as code yet |
| No code today implements Locking (§5) | DatabaseService's Locking Model (`§11` of the Design Report) | **High** — nothing to migrate from; this is wholly new implementation, not a refactor of existing logic |

---

## 12. Final Implementation Prerequisites

**Required Documentation Updates**
- Correct `PROJECT_STATE.md §23` / `NEXT_PHASE.md` to reflect that `LibraryRepository`
  is already built (Sub-Phase 5.9.2, predating Templates 5.10.2) — flagged as an Input
  Gap in Part 1 §0 and re-confirmed unresolved this phase.
- Correct `PROJECT_STATE.md §5`'s claim that `saveLocal()` is exported from
  `js/ui-utils.js` — it is defined inline in `index.html:586`; `ui-utils.js` has zero
  `localStorage` references (63 lines, read in full both phases).
- Update `settings.js`'s own header comment (lines 5-13), which still states "This file
  is NOT yet wired into index.html" — it has been wired (`index.html:663`) since at
  least the Settings Integration phase; the comment is stale.
- Document the `window._currentViewCase`/`_currentViewClient*`/`_pendingChildren`/
  `_portalUrl` family (§3.3) formally somewhere — no existing report inventories these,
  and any Repository/DatabaseService wiring plan must account for them explicitly.
- Document the Cases/Children embedded-data duplication's resolution plan before Step 4
  (Transactions) is scheduled, per `Repository_Contract_Report.md §15/§17`'s own
  deferral.

**Required Repository Updates**
- None of the 9 Repositories requires a *code* change to become wireable — all are
  feature-complete and self-tested. The only Repository-adjacent decision still open is
  the Children sync policy (`الأطفال` has no Sheet; `deleteChild()` has no sync call) —
  this is a decision, not a code defect, and predates this phase.
- A shared Storage Adapter implementation (Step 3) does not exist and must be built —
  this is new code, not a Repository update, but is a hard prerequisite before Step 3
  can begin.

**Required Wiring**
- Add `<script src="js/core/Repository.js">` and the 9
  `<script src="js/repositories/*Repository.js">` tags to `index.html`, positioned
  after `js/ui-utils.js` (for `uid()`) and before any module that will call them.
- Replace, one entity at a time (never partially), the module-level direct `data.<entity>`
  mutations (§2 rows 3-12) with calls to the matching Repository's `create/update/delete`.
- Make the app's bootstrap (`index.html`'s inline script) `async`-aware to accommodate
  `Repository.open()`'s promise-based lifecycle, replacing the current synchronous
  `data = {...JSON.parse(localStorage.getItem...)}` construction.
- Add the missing `typeof resetForm==='function'` guard at `clients.js:797` before any
  wiring step that could change `resetForm`'s identity (Risk §7.3 mitigation).

**Required Testing**
- Re-run all 9 existing `js/tests/verify_*_repository.js` harnesses unchanged, to
  reconfirm they still pass against the unmodified Repository files before any wiring
  begins (they were last run standalone, never against real, already-populated
  `localStorage` data from the live app).
- Add a new test pass, not present anywhere in the project today, that runs each
  Repository's `open()` against **real, pre-existing `localStorage` content** captured
  from the live app (not the throwaway in-memory harness data used so far) to surface
  Risk §7.7 (version-field discontinuity) concretely before Step 6.
- Add a concurrency test simulating `loadFromSheets()` firing while a modal is open, to
  give Risk §7.4 empirical evidence before Step 3 is implemented.

**Required Verification**
- After each single-entity wiring step (Step 1, entity-by-entity), verify via `node
  --check` on all touched files and a manual click-through of that entity's
  add/edit/delete/search/filter/sort UI, exactly as prior phases' verification sections
  have done for every previous additive Repository stage.
- Verify, per entity, that `saveLocal()`'s 9-key loop no longer includes any entity that
  has been fully migrated off it (to avoid Risk §7.1's double-write scenario silently
  persisting because `saveLocal()` was never trimmed).
- Verify MD5/line-count diffs on every file touched, matching the discipline already
  established in every `PROJECT_STATE.md` Repository section to date.

---

## Verification (Sub-Phase 8.1.2 instructions)

- [x] No project files modified — this phase used only `view`/`grep`/`sed`/`wc`/`find`
  read-only commands against the scratch copy at `/home/claude/work/`.
- [x] No source code changed.
- [x] No new implementation created — this single report is the only output.
- [x] Every finding above is based on direct re-inspection of source in this phase
  (file:line citations throughout), not carried over unverified from Part 1 — new
  discoveries this phase include the `window._*` global inventory (§3.3), the
  `_caseSelectedClients`/override-wrapper-chain details (§3.2), the confirmed absence of
  an `'الأطفال'` sheet in `Code_v4.gs`'s `SHEET_DEFS` (re-verified directly, lines
  69-141), and the `loadFromSheets()` bypass of `saveLocal()` (§1 Variation E).

---

Database Layer Audit
PART 2
PASS
Project Ready For DatabaseService Contract
