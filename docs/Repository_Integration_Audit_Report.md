# Repository_Integration_Audit_Report.md

## PHASE 9 — SUB-PHASE 9.1 — Repository Integration Audit & Migration Plan

This is a **read-only, analysis-only** audit. No source file was modified,
no code was generated, and no file was created other than this report.
Every finding below comes from direct inspection of the current source
tree (`grep`, direct reading, `node --check`, `md5sum`) — not from trusting
any prior phase's report. Where a prior report (`Repository_Wiring_Audit_Report.md`,
Phase 8/Sub-Phase 8.5.3) is referenced, its claims were independently
re-verified against the live files before being relied upon.

Pre-check performed: `md5sum` of the four core files reproduces the exact
values recorded in the Phase 8.5.3 report (`Repository.js` →
`1159f37eec831920256a727a30dba709`, `DatabaseService.js` →
`2f448ca20584f91cdc600190587849ca`, `StorageAdapter.js` →
`fda838c4b6000ab2988b167491effef3`, `LocalStorageAdapter.js` →
`45e7346d88e080b93074ff83f268bd10`) — the core layer is still untouched.
`node --check` was run against every module, repository, core, and api
file in the tree — all pass with no syntax errors.

---

## 1. Scope

Modules inspected directly (all 9, byte-for-byte, plus supporting files):

```
js/modules/cases.js        js/modules/fees.js
js/modules/clients.js      js/modules/documents.js
js/modules/children.js     js/modules/library.js
js/modules/sessions.js     js/modules/templates.js
js/modules/tasks.js        js/modules/settings.js   (legacy sync path)
js/api/api.js              (ApiService — current partial sync layer)
index.html                 (bootstrap: data{}, editIdx{}, saveLocal())
js/repositories/*.js        (9 Repository classes, from Phase 8)
js/core/*.js                 (Repository, DatabaseService, StorageAdapter,
                              LocalStorageAdapter — unchanged, MD5-verified)
```

---

## 2. Per-module findings

For every module: reads from `data.*`, writes to `data.*`, `saveLocal()` /
`loadLocal()` calls, `editIdx` usage, CRUD, search/filter/sort, validation,
sync, `ApiService` usage, and direct `localStorage` access.

### 2.1 `cases.js` (849 lines)

| # | Item | Finding |
|---|---|---|
| Reads | `data.cases`, `data.clients` (read-only, autofill), `data.documents` (read-only, `viewCase` report), `data.sessions` (read-only, `viewCase` report) |
| Writes | `data.cases[idx] = obj` (update), `data.cases.push(obj)` (create), `data.cases.splice(i,1)` (delete) — all in `saveCase()` / `deleteCase()` |
| `saveLocal()` | 3 calls: `saveCase()`, `deleteCase()`, and inside `updateChildrenData()` (embedded案 children JSON field, not the standalone Children entity) |
| `loadLocal()` | none (no such function exists anywhere in the project — `data` is populated once at bootstrap in `index.html`, see §3) |
| `editIdx` | `editIdx.cases` read/written in `saveCase()`, `editCase()` |
| CRUD | `saveCase()` (create+update, branches on `editIdx.cases>=0`), `editCase()` (read+stage), `deleteCase()` (delete) |
| Search/Filter | `searchCases()`/`filterCases()` are thin wrappers that just re-invoke `renderCases()`, which does the actual `Array.filter()` + free-text scan inline |
| Sort | none at the top level; `viewCase()` sorts the *linked* sessions list by parsed date, not `data.cases` itself |
| Validation | manual required-field checks (`num`, `title`, `client`) inline in `saveCase()`, plus generic `collectForm('cases')` |
| Sync | `ApiService.syncRow('القضايا', obj, idx)` in `saveCase()`; `ApiService.deleteData('القضايا', i)` in `deleteCase()` — both already migrated to `ApiService` (per Phase 8.5.3 finding, confirmed still true) |
| Direct `localStorage` | none |
| **Cross-module coupling** | `cases.js` **reads** `data.clients`, `data.documents`, `data.sessions` for report/autofill purposes only — it never writes to them. |

### 2.2 `clients.js` (1030 lines)

| # | Item | Finding |
|---|---|---|
| Reads | `data.clients`; **read-only**: `data.cases` (linked-cases panel), `data.fees` (linked-fees panel) |
| Writes | `data.clients[idx]=obj`, `data.clients.push(obj)`, `data.clients.splice(i,1)`, plus a **portal-token-only** write `data.clients[idx]['portal_token']=newToken` inside `generatePortalLink()`-style code, synced separately via `ApiService.updateData('الموكلين', ..., idx)` |
| `saveLocal()` | 4 calls |
| `editIdx` | `editIdx.clients` |
| CRUD | `saveClient()`-equivalent (create/update), `editClient()`, `deleteClient()`, plus the extra portal-token update path (a **partial-record update** outside the normal save flow — see Risk §5) |
| Search/Filter | inline `Array.filter()` in render, plus `populateCaseDropdown`-style client-name filter used by `cases.js`'s autofill (cross-module read dependency) |
| Sort | none |
| Validation | required-field checks + `collectForm('clients')` |
| Sync | `ApiService.syncRow`, `ApiService.deleteData`, `ApiService.updateData` (the token path), plus `ApiService.getPortalUrl` / `ApiService.getQrImageUrl` (read-only, no `data` interaction) |
| Direct `localStorage` | none |
| **Cross-module coupling** | Reads `data.cases`/`data.fees` read-only; is itself **read by `cases.js`** for the client-dropdown/autofill feature. Two-way *read* coupling with Cases, no write coupling. |

### 2.3 `children.js` (51 lines — standalone "الأطفال" page; distinct from the embedded case-children block, which lives inside `cases.js`)

| # | Item | Finding |
|---|---|---|
| Reads/Writes | `data.children[idx]=obj`, `data.children.push(obj)`, `data.children.splice(i,1)` |
| `saveLocal()` | 3 calls |
| `editIdx` | `editIdx.children` |
| CRUD | `saveChild()`, `editChild()`, `deleteChild()` |
| Search | inline `Array.filter()` + `Object.values(c).join(' ')` free-text scan in `renderChildren()` |
| Validation | required-field check on case number + child name |
| Sync | **`saveChild()` still calls legacy `syncToSheets('الأطفال', obj, idx)` guarded by `if(API_URL)` — it was never migrated to `ApiService`, exactly as flagged in Phase 8.5.3.** `deleteChild()` has **no sync call at all** — an existing, pre-migration asymmetry (delete is not remotely synced even under the legacy path). This is a **pre-existing behavioral quirk**, not something introduced by this analysis, and must be preserved (not "fixed") during migration unless separately authorized. |
| Direct `localStorage` | none |
| **Cross-module coupling** | None — fully self-contained, but depends on `resetForm`/`collectForm`/`fillForm` **overrides installed by `cases.js`**, and on `populateCaseDropdown()` defined in `cases.js` (load-order dependency, not a data dependency). |

### 2.4 `sessions.js` (216 lines)

| # | Item | Finding |
|---|---|---|
| Reads/Writes | `data.sessions[idx]=obj`, `.push`, `.splice` |
| `saveLocal()` | 3 calls |
| `editIdx` | `editIdx.sessions` |
| CRUD | `saveSession()`, `editSession()`, `deleteSession()` |
| Sync | `ApiService.syncRow` ×2, `ApiService.deleteData` ×2 — already on `ApiService` |
| Cross-module | none written; **read by `cases.js`** (`viewCase()` report) |

### 2.5 `tasks.js` (207 lines)

| # | Item | Finding |
|---|---|---|
| Reads/Writes | `data.tasks[idx]=obj`, `.push`, `.splice` |
| `saveLocal()` | 4 calls (extra one inside `toggleTask()`, a **partial-field update** — flips a completion flag without going through the full `saveTask()` path) |
| `editIdx` | `editIdx.tasks` |
| CRUD | `saveTask()`, `editTask()`, `deleteTask()`, `toggleTask()` (partial update) |
| Sync | `ApiService.syncRow` ×3 (once from `saveTask()`, once from `toggleTask()`), `ApiService.deleteData` — already on `ApiService` |
| Cross-module | none |

### 2.6 `fees.js` (227 lines)

| # | Item | Finding |
|---|---|---|
| Reads | `data.fees`; **read-only** `data.cases` (case-number autofill/lookup — comment explicitly notes `data.cases` "is owned by the Cases module, not Fees") |
| Writes | `data.fees[idx]=obj`, `.push`, `.splice` |
| `saveLocal()` | 3 calls |
| `editIdx` | `editIdx.fees` |
| CRUD | `saveFee()`, `editFee()`, `deleteFee()` |
| Sync | `ApiService.syncRow` ×2, `ApiService.deleteData` — already on `ApiService` |
| Cross-module | reads `data.cases` read-only; **is itself read by `clients.js`** for the linked-fees panel. |

### 2.7 `documents.js` (201 lines)

| # | Item | Finding |
|---|---|---|
| Reads/Writes | `data.documents[idx]=obj`, `.push`, `.splice` |
| `saveLocal()` | 3 calls |
| `editIdx` | `editIdx.documents` |
| CRUD | `saveDocument()`, `editDocument()`, `deleteDocument()` |
| Sync | `ApiService.syncRow` ×2, `ApiService.deleteData` — already on `ApiService` |
| Cross-module | none written; **read by `cases.js`** (`viewCase()` report) |

### 2.8 `library.js` (214 lines)

| # | Item | Finding |
|---|---|---|
| Reads/Writes | `data.library[idx]=obj`, `.push`, `.splice`; comment references `data.templates` in passing (documentation only, no actual cross-read of `data.templates` executes in this file) |
| `saveLocal()` | 3 calls |
| `editIdx` | `editIdx.library` |
| CRUD | `saveLibBook()`, `editLibBook()`, `deleteLibBook()` |
| Sync | `ApiService.syncRow`, `ApiService.deleteData` — already on `ApiService`. The one `ApiService.loadAllSheets` hit found by an earlier grep pass is **inside a comment**, not executable code — confirmed by direct line inspection. |
| **Remote-load gap** | Neither the legacy `loadFromSheets()` (in `settings.js`) nor `ApiService.loadAllSheets()` (in `api.js`) include `library` in their sheet→key pairs list (both enumerate exactly the same 7 keys: cases, sessions, clients, children, documents, tasks, fees). **`library` data can be pushed to Sheets via `syncRow`/`deleteData` but can never be pulled back down** through either existing bulk-load path. This is a pre-existing gap in the *Module* layer, unrelated to Repository wiring, but directly relevant to migration behavior parity (see §5). |

### 2.9 `templates.js` (217 lines)

| # | Item | Finding |
|---|---|---|
| Reads/Writes | `data.templates[idx]=obj`, `.push`, `.splice` |
| `saveLocal()` | 3 calls |
| `editIdx` | `editIdx.templates` |
| CRUD | `saveTemplate()`, `editTemplate()`, `deleteTemplate()` |
| Filter | `filterTemplates(cat)` — category filter, feeds `renderTemplates()` |
| Sync | `ApiService.syncRow`, `ApiService.deleteData` — already on `ApiService`. Same as Library, the `loadAllSheets` hit is a comment, not a call. |
| **Remote-load gap** | Same finding as Library: `templates` is excluded from both bulk-load paths' 7-key lists. Identical pre-existing gap. |

### 2.10 `settings.js` / bootstrap (supporting, not itself migrated in this phase)

- `index.html` line 572–582 builds `data = { cases: JSON.parse(localStorage.getItem('cases')||'[]'), … }` for all 9 keys, **with no `try/catch`** around any of the 9 `JSON.parse` calls — a pre-existing crash risk on corrupted localStorage, previously flagged in Phase 6.1 and independently re-confirmed here still present and unchanged.
- `saveLocal()` (index.html line 586) is the single global function every module calls; it iterates the same 9-key list and does a blind `localStorage.setItem(k, JSON.stringify(data[k]))` — synchronous, no error handling.
- No `loadLocal()` function exists anywhere in the project; the equivalent responsibility is performed inline, once, at `data` construction time in `index.html`.
- The legacy sync trio (`syncToSheets`, `syncDeleteToSheets`, `loadFromSheets`, all in `settings.js`) remains the **only currently-wired, callable data-loading path** in the live app (`children.js`'s `saveChild()` still calls `syncToSheets` directly). `ApiService` is a parallel, more complete implementation, but per the Phase 8.5.3 finding — independently re-confirmed by inspection here — `ApiService.loadAllSheets()`, `ApiService.ping()`, and `ApiService.setup()` are never actually invoked by any module; only `ApiService.syncRow`, `ApiService.deleteData`, `ApiService.updateData`, `ApiService.getPortalUrl`, and `ApiService.getQrImageUrl` are live-called today.

---

## 3. Migration mapping (current → future)

| Current implementation | Future Repository / DatabaseService equivalent |
|---|---|
| `data.<entity>.push(obj)` | `await <Entity>Repository.create(obj)` |
| `data.<entity>[idx] = obj` | `await <Entity>Repository.update(id, patch)` — **note:** current code replaces the *whole record* by array index; `update()` is a **patch/merge** operation keyed by `idField` (e.g. `رقم_القضية`, `رقم_الطفل`), not by array position. The call site must be rewritten to pass the full object as the patch (safe, since it's a full overwrite) and to resolve `idx` → the record's actual id value before calling, not the array index itself. |
| `data.<entity>.splice(i, 1)` | `await <Entity>Repository.delete(id)` — same index→id resolution requirement as above. |
| `data.<entity>` (whole-array read, e.g. for render) | `await <Entity>Repository.getAll()` |
| `data.<entity>[i]` (single read by index, e.g. `editCase(i)`) | `await <Entity>Repository.get(id)` — again requires index→id resolution; UI code that currently passes the array index `i` into `edit*(i)`/`delete*(i)` must be changed to pass/resolve the record's id instead, or the Repository's `getAll()` result order must be relied upon to keep index-based lookups valid (risk — see §5). |
| `Array.filter(fn)` inline in `render*()` (free-text search) | `Repository.filter(predicate)` or `Repository.search(term)` (Repository's own `_matchesSearch` already reimplements the same `Object.values().join(' ')` free-text scan per entity, confirmed identical in Phase 8.5.3 audit) |
| `Array.find`-style lookups (e.g. matching a case number) | `Repository.get(id)` (by id) or `Repository.filter(predicate)` (by arbitrary field, e.g. matching `رقم_القضية` across sessions/documents in `viewCase()`) |
| `saveLocal()` | Removed entirely for migrated entities — `Repository.create/update/delete` already calls `DatabaseService.write()` → `LocalStorageAdapter` internally via `_persist()`. **Caution:** `saveLocal()` currently persists *all 9* keys in one blind pass; once even one entity is migrated, `saveLocal()` must stop being called for that entity's data (double-write risk, though not corrupting, since both would write the same key) — or better, `saveLocal()` itself is edited to exclude migrated keys once and only once, in a single, tightly-scoped follow-up change (not part of this phase). |
| Bootstrap `data.<entity> = JSON.parse(localStorage.getItem(k)||'[]')` (index.html) | `await <Entity>Repository.open()` (this is exactly what `open()` does: `this._records = await this._storage.read(this.entityKey)`, already error-wrapped inside `Repository.js`, unlike the current bare `JSON.parse`) |
| `editIdx.<entity>` (array-index staging variable) | Should become an **id-staging variable** (e.g. store the record's `idField` value, not its array position) once the entity is Repository-backed, since Repository result ordering is not contractually guaranteed to match the old array's insertion order across `create`/`update`/`delete` cycles. |
| `ApiService.syncRow` / `ApiService.deleteData` / legacy `syncToSheets` / `syncDeleteToSheets` | **Out of scope for the Repository migration** — these are the *remote* (Google Sheets) sync calls, entirely orthogonal to the *local* storage layer being migrated here. They continue to run exactly as today, unchanged, immediately after (not instead of) the new Repository call. |

---

## 4. Migration risk analysis (per module)

| Module | Risk | Rationale |
|---|---|---|
| **Cases** | **MEDIUM** | Simplest entity in isolation (no `idGenerator`/hybrid id — natural key `رقم_القضية`), but is the **most cross-read** module: `viewCase()` cross-filters `data.sessions` and `data.documents` by matching field values, and `cases.js` supplies `populateCaseDropdown()`/`autofillSessionFromCase()`/`autofillFeeFromCase()` consumed by Sessions, Fees, and Children. Any change to how Cases exposes/filters records has ripple effects on 3 other modules' autofill features. |
| **Clients** | **MEDIUM–HIGH** | Has the extra **partial-field update** path (`portal_token` write via `ApiService.updateData`, bypassing the normal save flow) and is both a reader of `data.cases`/`data.fees` *and* is read by `cases.js` for autofill — the most bidirectionally-coupled module. The portal-token partial update in particular needs its own explicit `Repository.update(id, {portal_token: ...})` patch call, not a full-record replace, to avoid clobbering concurrent edits. |
| **Children** | **MEDIUM** | Structurally simple and functionally isolated (no other module reads/writes `data.children`), but sits on the **legacy `syncToSheets()` sync path**, not `ApiService`, and has the pre-existing **delete-without-sync asymmetry**. Migrating storage without touching sync means this module's sync behavior (including its existing inconsistency) must be preserved byte-for-byte; the temptation to "fix" the missing delete-sync call during this work must be resisted, as it is out of scope. |
| **Sessions** | **LOW–MEDIUM** | Clean, symmetric CRUD, already on `ApiService`, no writes from/to it by other modules — only read *from* by `cases.js`'s report view (read-only, does not care about Sessions' internal storage mechanism as long as `getAll()`/`filter()` return equivalent data). |
| **Tasks** | **MEDIUM** | Has its own **partial-update path** (`toggleTask()` flips a completion flag independent of `saveTask()`), which needs a dedicated `Repository.update(id, {<flag field>: value})` patch call rather than a full replace, mirroring the Clients portal-token case. |
| **Fees** | **LOW–MEDIUM** | Clean CRUD, already on `ApiService`; its only coupling is a read-only dependency on `data.cases` for autofill (consumer, not producer) and being read by `clients.js`'s linked-fees panel — no write coupling either direction. |
| **Documents** | **LOW** | Clean, symmetric CRUD, already on `ApiService`, only read *from* (not written to) by `cases.js`'s report view — the lowest-coupling module together with Sessions. |
| **Library** | **MEDIUM** | Structurally clean CRUD, already on `ApiService` for outbound sync, **but excluded from both bulk-load paths** (`loadFromSheets()` / `ApiService.loadAllSheets()`) — a pre-existing remote-sync gap that must be neither silently fixed nor silently perpetuated without the person's awareness; flagged here as a decision point, not resolved. |
| **Templates** | **MEDIUM** | Identical profile to Library: clean CRUD, same bulk-load-path exclusion gap, plus a `filterTemplates(cat)` category-filter entry point that must map cleanly onto `Repository.filter()`. |

**Cross-cutting HIGH-risk factor affecting every module equally:** every `Repository.prototype.{create,update,delete,get,getAll,filter,search,...}` method is **`async`, returns a Promise**, and returns a `{success, record, error}` result envelope (confirmed directly in `Repository.js`: `Repository.prototype.create = async function (entity) {...}`, etc.). Every current Module function (`saveCase`, `deleteCase`, `saveChild`, …) is presently **fully synchronous**, called directly from inline `onclick="..."` HTML attributes with no `await` anywhere in the call chain, and mutates the shared `data.*` array **in place** before immediately calling `renderX()` synchronously afterward. Converting the storage calls to `await Repository.X(...)` requires every calling Module function to become `async`, every `onclick` handler in `index.html` to tolerate a returned Promise (harmless if unhandled, but the *UI update / `renderX()` / `toast()` calls that currently run synchronously right after the mutation* must move *inside* the `.then()`/after-`await`, or the render will fire before the write completes). This is not specific to any one entity — it is a uniform, project-wide shape change and is the single largest source of behavioral-parity risk in the whole migration, independent of the per-module risk ratings above.

---

## 5. Dependency analysis

**Write dependencies:** None. No module ever writes to another module's `data.<entity>` array. Every `data.<entity>[idx]=/.push/.splice` write is confined to that entity's own module. This means, from a **pure write-isolation** standpoint, all 9 modules could technically migrate in any order without breaking another module's *write* path.

**Read dependencies (the actual coupling that constrains ordering):**

```
cases.js   --reads-->  data.clients   (autofill: fCaseClient dropdown)
cases.js   --reads-->  data.sessions  (viewCase() report)
cases.js   --reads-->  data.documents (viewCase() report)
clients.js --reads-->  data.cases     (linked-cases panel)
clients.js --reads-->  data.fees      (linked-fees panel)
fees.js    --reads-->  data.cases     (case-number autofill)
children.js -- (embedded-children variant inside cases.js) -- no dependency on standalone children.js
```

Because every one of these is a **read**, not a write, the dependency is
satisfied as long as the *reading* module can still get a correct array of
records from the *read* module — regardless of whether that data currently
lives in `data.<entity>` or has already moved behind
`<Entity>Repository.getAll()`. This means, in principle, no module is
strictly blocked from migrating by another module still being
un-migrated, **provided a temporary compatibility shim is used**: for any
module still reading a *migrated* entity's data via the old `data.<entity>`
global, the migrated entity's Repository would need to keep `data.<entity>`
in sync (e.g., by also writing through to the global array) until the
reading module itself migrates. This is the one piece of **hidden
coupling** worth calling out explicitly: **Clients and Cases are mutually
read-dependent** (Cases reads Clients for the dropdown; Clients reads Cases
for the linked-cases panel) — migrating one without a bridge for the other
risks either an empty dropdown or an empty linked-cases panel mid-migration,
even though neither module ever writes to the other's array.

**Which module must migrate first:** **Documents** or **Sessions** — they are read *from* (by Cases) but never read *anything themselves*, and nothing reads *their* Repository-migrated state except a read-only consumer (Cases) that only needs `getAll()`/`filter()` to keep working, which Repository already supports identically. They are the safest possible first movers: zero outbound read dependency, so nothing is broken if they alone convert to Repository-backed storage while the rest of the app is untouched.

**Which module must migrate last:** **Cases**, followed by **Clients** — Cases is both the most-depended-upon module (Clients, Fees, and the embedded-children feature inside `cases.js` itself all key off case data) and itself the heaviest reader (of Clients, Sessions, and Documents). Migrating Cases early would force at least three other modules to be bridged simultaneously; migrating it last means every module it depends on (Clients, Sessions, Documents) is already stable and Repository-backed, so Cases' own migration only has to solve its own read/write conversion, not coordinate anyone else's.

**Modules with no dependency in either direction (fully isolated):** Children, Tasks, Library, Templates — none of these are read from or write to any other module's `data.*`. They can be migrated in any order relative to each other and relative to the rest of the sequence, constrained only by their own internal risk factors (Children's legacy sync path; Tasks' partial-update `toggleTask()`; Library/Templates' bulk-load gap).

---

## 6. Recommended migration order

```
Documents  →  Sessions  →  Tasks  →  Library  →  Templates  →  Children  →  Fees  →  Clients  →  Cases
```

Justification for each step:

1. **Documents** — zero read/write coupling in either direction; simplest possible proof-of-concept for the async-conversion pattern (§4's cross-cutting risk) with the smallest blast radius if something goes wrong.
2. **Sessions** — same zero-coupling profile as Documents; migrating it second, right after Documents, lets the same async-conversion pattern be validated twice on similarly-shaped, low-risk modules before touching anything with cross-module reads.
3. **Tasks** — isolated, but introduces the **partial-update** pattern (`toggleTask()`) for the first time; validating `Repository.update()` with a small patch object (rather than a full-record replace) here, on an isolated module, de-risks the same pattern showing up later in Clients (portal token).
4. **Library** — isolated; also the first module where the **bulk-load-path gap** (excluded from `loadFromSheets`/`loadAllSheets`) must be explicitly decided on (preserve the gap as-is, or flag it to the person) before migrating its local-storage layer.
5. **Templates** — isolated, identical shape to Library; migrating immediately after Library reuses the exact same gap-handling decision made in step 4, plus validates the `filterTemplates(cat)` → `Repository.filter()` mapping.
6. **Children** — isolated from every other *module*, but carries the **legacy `syncToSheets()`** path and the **delete-without-sync** asymmetry; placed after the four fully-clean isolated modules so the team's async-conversion process is already proven before dealing with this module's extra legacy-sync wrinkle.
7. **Fees** — first module with a real (read-only) dependency: reads `data.cases`. Placed after all isolated modules but before Clients/Cases so that only *one* cross-module read relationship needs a bridge at a time.
8. **Clients** — reads `data.cases` and `data.fees` (now migrated in step 7), and is read *by* Cases; also carries the **portal-token partial-update** path. Migrating Clients here means Fees is already stable, so only the Clients↔Cases mutual-read relationship remains as an open bridge going into the final step.
9. **Cases** — migrated last, once Clients, Sessions, Documents, and Fees are all already Repository-backed, so Cases' own conversion (the heaviest module, with the most outbound reads) only has to consume already-stable Repository-backed data rather than coordinate simultaneous bridges across four other modules.

---

## 7. Architecture

### CURRENT

```
                UI (index.html — onclick handlers, inline <script>)
                                 │
                                 ▼
        Modules (cases.js, clients.js, children.js, sessions.js,
                 tasks.js, fees.js, documents.js, library.js,
                 templates.js) — synchronous functions, direct
                 array mutation (push/splice/index-assign)
                                 │
                                 ▼
              data  (single global object, 9 arrays,
                     populated once at bootstrap via
                     bare JSON.parse(localStorage.getItem(k)))
                                 │
                                 ▼
                    saveLocal()  (synchronous, blind
                     JSON.stringify + localStorage.setItem
                     over all 9 keys every time, regardless
                     of which single entity actually changed)
                                 │
                                 ▼
                          localStorage
```

Parallel, currently-inert layer (built, verified, not yet wired — per
Phase 8.5.3, independently re-confirmed here): `Repository → DatabaseService
→ LocalStorageAdapter → localStorage`, fully functional in isolation but
with **no `<script>` tag in `index.html` referencing any file under
`js/repositories/`** — still true today.

### TARGET

```
                UI (index.html — handlers become async-aware)
                                 │
                                 ▼
        Modules (same 9 files) — functions become async,
                 call `await <Entity>Repository.<method>()`
                 instead of mutating `data.<entity>` directly;
                 render/toast calls move to after the await
                                 │
                                 ▼
        Repositories (js/repositories/*Repository.js)
     — unchanged from Phase 8: create/update/delete/get/getAll/
       filter/search/exists/count/bulk*/export/import/clear/
       transaction, each Promise-returning, `{success,record,error}`
       envelopes
                                 │
                                 ▼
        DatabaseService (js/core/DatabaseService.js)
     — unchanged: pure delegation of read/write/open/close/
       destroy/delete/clear/exists to its injected adapter
                                 │
                                 ▼
      LocalStorageAdapter (js/core/LocalStorageAdapter.js)
     — unchanged: sole layer touching real localStorage,
       default empty keyPrefix keeps keys byte-identical
                                 │
                                 ▼
                          localStorage
        (same bare keys: cases, clients, children, sessions,
         tasks, fees, documents, library, templates)
```

`ApiService` / legacy `syncToSheets`/`syncDeleteToSheets`/`loadFromSheets`
remain **outside and orthogonal** to this diagram in both CURRENT and
TARGET states — they are the remote (Google Sheets) sync layer, called
immediately after the local write completes, and are explicitly **out of
scope** for this migration.

---

## 8. Readiness determination

**Additional preparation is required before Phase 9.2 (implementation)
can begin.** Specifically, three decisions/preparations should be made
explicit and agreed before any code is written, none of which require
code changes now:

1. **Async-conversion strategy** (§4, cross-cutting): confirm whether each
   Module function becomes `async`/`await`-based directly, or whether a
   thin synchronous-looking wrapper (e.g., queuing renders on `.then()`)
   is preferred, since every `onclick="saveX()"` call site in `index.html`
   is currently written assuming synchronous completion.
2. **Cross-module read bridging** (§5): confirm how Cases↔Clients (and
   Cases→Sessions/Documents, Fees→Cases, Clients→Fees) reads should behave
   for modules *not yet* migrated when another module *has* — i.e.,
   whether `saveLocal()`/`data.<entity>` stay in sync with a migrated
   entity's Repository until every dependent module has moved over, or
   whether all mutually-reading modules must migrate together as a group.
3. **Pre-existing gaps to explicitly preserve or fix** (§2.8/§2.9/§2.3):
   the Library/Templates bulk-load exclusion and the Children
   delete-without-sync asymmetry are real, pre-existing behaviors that
   this migration could accidentally "fix" as a side effect of touching
   the code around them. A decision on "preserve exactly" vs. "fix now"
   should be made explicitly rather than left to fall out incidentally
   during Phase 9.2 implementation.

None of the 9 Repository implementations, and none of the 4 core files,
require any further work — they passed Phase 8.5.3's wiring audit and are
independently re-confirmed unchanged here (checksums match). The work
remaining is entirely in the *Module* and *bootstrap* layers, and in the
three decisions above.

---

## Repository Integration Audit

**PASS**

**Ready For Repository Integration**
