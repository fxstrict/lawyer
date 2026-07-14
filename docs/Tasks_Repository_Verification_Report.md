# Tasks Repository Verification Report
## نظام الحسام للمحاماة — V10 Offline-First Architecture
### PHASE 5 — SUB-PHASE 5.6 — Tasks Repository

---

## 1. Syntax

```
$ node --check js/core/Repository.js
(no output — success)

$ node --check js/repositories/TasksRepository.js
(no output — success)

$ node --check js/core/verify_tasks_repository.js
(no output — success)
```

Also re-run across every pre-existing project JS file (`js/api/api.js`, `js/ui-utils.js`,
`js/print-utils.js`, all 12 `js/modules/*.js`, `js/core/Repository.js`,
`js/core/CasesRepository.js`, `js/repositories/ClientsRepository.js`,
`js/repositories/ChildrenRepository.js`, `js/repositories/SessionsRepository.js`) — all
still pass, unmodified.

**Result:** ✅ PASS.

---

## 2. Dependencies

- `js/repositories/TasksRepository.js` requires `Repository`/`RepositoryErrorTypes`/
  `createRepositoryError` from `js/core/Repository.js` only.
- **No reference whatsoever** to `js/repositories/ClientsRepository.js`,
  `js/repositories/ChildrenRepository.js`, `js/repositories/SessionsRepository.js`,
  or `js/core/CasesRepository.js` — confirmed by direct grep across the final file:
  the storage adapter (`createTasksLocalStorageAdapter`) and the identifier
  generator (`generateTaskId`) are both independent, self-contained
  re-implementations of the same pattern, not shared imports.
- No reference to `data`, `FIELDS`, `MAP`, `editIdx`, `currentPage`, `saveLocal()`,
  `ApiService`, `syncToSheets()`, `API_URL`, `toast()`, `closeModal()`,
  `showLoading()`, `navigate()`, `uid()` (imported), or any other global defined in
  `index.html` or any `js/modules/*.js` file. Confirmed by direct grep across the
  final file.
- No `document.*`, no DOM API, no `IndexedDB`/`indexedDB` reference anywhere.
- Does **not** import or reference `js/ui-utils.js` — the `uid()`-equivalent
  identifier generator is a self-contained, algorithmically identical local
  function (`generateTaskId`).
- No `toggleStatus()` method exists — confirmed both by grep of the delivered
  file and by an explicit harness assertion (§6).

**Result:** ✅ PASS — no coupling to any file other than `js/core/Repository.js`.

---

## 3. Load Order

- `js/repositories/TasksRepository.js` is **not** referenced by any
  `<script src="...">` tag in `index.html`. Confirmed by direct search — zero
  matches for `repositories/TasksRepository` or `TasksRepository` in `index.html`.
- Matches the Strangler-pattern Migration Contract
  (`Repository_Contract_Report_PHASE2_V10.md` §16) and this phase's own
  instructions: pure addition, inert until a later wiring stage.

**Result:** ✅ PASS.

---

## 4. Backward Compatibility

| File | MD5 before this stage | MD5 after this stage | Match? |
|---|---|---|---|
| `js/core/Repository.js` | `1159f37eec831920256a727a30dba709` | `1159f37eec831920256a727a30dba709` | ✅ identical |
| `js/core/CasesRepository.js` | `f12ff30e02bdfc2da709fe11cfb91fe7` | `f12ff30e02bdfc2da709fe11cfb91fe7` | ✅ identical |
| `js/repositories/ClientsRepository.js` | `a6e2a29bd6e96e787c1219ea0d7a8a5b` | `a6e2a29bd6e96e787c1219ea0d7a8a5b` | ✅ identical |
| `js/repositories/ChildrenRepository.js` | `a202e04f56de3728361f1bf028ba1061` | `a202e04f56de3728361f1bf028ba1061` | ✅ identical |
| `js/repositories/SessionsRepository.js` | `947de954ef8a09fd3710e8957cc33c04` | `947de954ef8a09fd3710e8957cc33c04` | ✅ identical |
| `js/modules/tasks.js` | `114cbd22ec98a9eaea6f7143754e6073` | `114cbd22ec98a9eaea6f7143754e6073` | ✅ identical — never written to |
| `index.html` | `bc93f6b82a9a822de620fa77502ed200` | `bc93f6b82a9a822de620fa77502ed200` | ✅ identical |
| `Code_v4.gs` | `78bba97e310222740ccebfd6dec110ef` | `78bba97e310222740ccebfd6dec110ef` | ✅ identical |
| all CSS files | not touched | not touched | ✅ (no write ever issued) |

`localStorage['tasks']` key/shape: `TasksRepository`'s temporary Storage Adapter
reads/writes the exact same key (`'tasks'`) and the exact same flat JSON-array
shape that `data.tasks` / `saveLocal()` already use today — verified by the
round-trip test in the harness (§6) below.

**Result:** ✅ PASS — zero existing project file modified; storage format unchanged.

---

## 5. Repository Interface (Contract §3 + this phase's instructions)

| Operation required | Source | Present on `TasksRepository` instances | How |
|---|---|---|---|
| `getAll()` | phase instructions + Contract | ✅ | inherited unchanged from `Repository.prototype` |
| `get(id)` | phase instructions + Contract | ✅ | inherited unchanged |
| `insert(entity)` | phase instructions | ✅ | new alias → calls inherited `create(entity)` |
| `update(id, entity)` | phase instructions + Contract | ✅ | inherited unchanged (`update(id, patch)`) |
| `remove(id)` | phase instructions | ✅ | new alias → calls inherited `delete(id)` |
| `exists(id)` | phase instructions + Contract | ✅ | inherited unchanged |
| `count()` | phase instructions + Contract | ✅ | inherited unchanged |
| `search()` | phase instructions + Contract | ✅ | inherited, `_matchesSearch` overridden (§2.4) |
| `filter()` | phase instructions | ✅ | new method → wraps `search({filter})` |
| `sort()` | phase instructions | ✅ | new method → wraps `_compareRecords` |
| `validate()` | phase instructions | ✅ | new method → wraps `_validate` hook |
| `create`/`update`/`delete` (Contract-literal, §19) | `Repository_Contract_Report.md §19` | ✅ | inherited unchanged — never renamed |
| `find`, `bulkInsert`, `bulkUpdate`, `bulkDelete`, `export`, `import`, `clear`, `transaction` | Contract §3 | ✅ | inherited unchanged |
| `toggleStatus(id)` | proposed in `Repository_Contract_Report.md §4.6` | ❌ (deliberate) | not implemented — outside this phase's closed method list, see `Tasks_Repository_Report.md §2.7` |

**Result:** ✅ PASS — every operation named in this phase's instructions ("نفذ فقط")
is present under its exact requested name, AND every Contract-literal operation name
from `Repository_Contract_Report.md §19` remains present and unrenamed. The one
Contract-report-proposed method NOT in this phase's list (`toggleStatus`) is
confirmed absent, matching the deliberate scope exclusion in
`Tasks_Repository_Report.md §2.7`.

---

## 6. Independent Automated Verification Harness

Run with: `node js/core/verify_tasks_repository.js` (Node v22, no browser required
— uses a fake in-memory object satisfying the exact `Storage` shape `getItem`/
`setItem` that the real browser `localStorage` exposes — the only mock used, per
this phase's "لا تستخدم Mock غير ضروري" instruction). **Fully independent**: this
harness does not import, require, or share any helper code with
`verify_clients_repository.js`, `verify_children_repository.js`,
`verify_sessions_repository.js`, or the Cases-phase harness — a self-contained
file, per this phase's "Harness مستقل" instruction. Actually executed against the
delivered file — not simulated.

```
PASS — TasksRepository is a function / class
PASS — open() on empty localStorage (no "tasks" key) starts with zero records, no throw
PASS — Empty repository: getAll()/count()/search()/exists()/get() behave correctly with zero records
PASS — open() loads existing legacy localStorage["tasks"] array unchanged
PASS — getAll() returns a copy, not a live reference (Contract §19)
PASS — validate() rejects a record missing العنوان
PASS — validate() accepts a record with العنوان present, even with everything else absent
PASS — validate() rejects whitespace-only العنوان (matches .trim() check in saveTask())
PASS — insert() [alias of create()] adds a new task, auto-generating رقم_المهمة when absent
PASS — insert() preserves a caller-supplied رقم_المهمة instead of overwriting it (matches saveTask()'s || uid() fallback)
PASS — insert() [Duplicate ID] rejects a second record with an explicitly duplicate رقم_المهمة
PASS — insert() [Invalid Entity] rejects a record missing a required field before touching storage
PASS — get(id) returns the task by رقم_المهمة
PASS — get(id) returns null for unknown id
PASS — exists(id) true/false
PASS — update(id, entity) merges fields and stamps updatedAt/version
PASS — update(id, entity) rejects a patch that would violate a required field
PASS — update(id, entity) on an unknown id fails gracefully (base Repository.js reports ValidationError for "no record with this id" — unchanged Phase 5.1 base-class behavior)
PASS — count() reflects current non-deleted record count
PASS — remove(id) [alias of delete()] soft-deletes by default (Data_Schema §3.7 / §4.6 Delete Rules)
PASS — soft-deleted record excluded from default getAll()/get()
PASS — getAll({includeDeleted:true}) still returns the soft-deleted record
PASS — count() excludes the soft-deleted record after remove()
PASS — remove(id) on an unknown id fails gracefully (base Repository.js reports ValidationError for "no record with this id" — unchanged Phase 5.1 base-class behavior)
PASS — search() free-text matches across ANY legacy field, case-insensitively (matches renderTasks(), despite both planning reports claiming search is scoped to العنوان only)
PASS — search() free-text matches a non-title field (case number)
PASS — search() does NOT match against new audit/metadata fields (checksum/version etc.)
PASS — search() excludes soft-deleted records by default
PASS — filter() by الأولوية returns exactly the tasks with that priority (matches renderTasks()'s #filterTaskPriority)
PASS — filter() by الحالة returns exactly the tasks with that status (documented Filter Field, generic pass-through works even without a live dropdown)
PASS — filter() with a date-range operator on الموعد_النهائي returns only tasks due within range
PASS — filter() by a priority with no tasks returns an empty array
PASS — sort() orders by الموعد_النهائي ascending by default (purely additive — no live sort exists in renderTasks() to reconcile against)
PASS — sort() accepts an explicit sortSpec and array of records without mutating input
PASS — sort() with direction "desc" reverses the order
PASS — Contract-literal create/update/delete are still present and callable
PASS — insert/remove/filter/sort/validate are additive aliases, not overriding create/update/delete
PASS — getAll/get/exists/count/find/bulkInsert/bulkUpdate/bulkDelete/export/import/clear/transaction all present
PASS — no toggleStatus() method exists (deliberately excluded — not in the phase's requested method list)
PASS — written localStorage["tasks"] is a plain JSON array parseable exactly like index.html expects
PASS — a second TasksRepository instance opening the same storage sees identical data (no data loss across "reload")
PASS — TasksRepository does not reference ClientsRepository/CasesRepository/ChildrenRepository/SessionsRepository at runtime (independent harness, independent class)

42/42 checks passed.
```

**Result:** ✅ PASS — 42/42.

### 6.1 CRUD
Covered: `insert`/`create` (success including hybrid-id auto-generation, preserving
a caller-supplied id, duplicate-id conflict, validation rejection), `get` (found /
not found), `exists`, `update` (merge semantics, validation rejection, unknown-id
handling), `remove`/`delete` (soft delete, hidden from default reads, still
retrievable via `includeDeleted`, unknown-id handling).

### 6.2 Validation
Covered: the single required field (`العنوان`) — missing, present, and
whitespace-only (`.trim()` parity with the actual `saveTask()` check). No
discrepancy against either planning report for this entity, unlike Sessions
(Phase 5.5).

### 6.3 Search
Covered: full free-text substring match across every legacy Arabic field
(replicating `renderTasks()`'s `Object.values(t).join(' ')` exactly, including a
match on a non-title field — case number), confirmed NOT matching against new
structural/audit fields (`checksum`), and confirmed excluding soft-deleted records
by default. Explicitly labeled as validating the divergence from both official
planning reports (see `Tasks_Repository_Report.md §2.4`).

### 6.4 Sort
Covered: default `sortFields`-based comparator (`الموعد_النهائي` ascending) with
no mutation of the input array, an explicit custom `sortSpec` producing a
correctly (chronologically) ordered result, and a `desc` direction producing the
exact reverse of the `asc` ordering. Labeled as a purely additive capability
(§2.6) since no live sort exists in `renderTasks()` to reconcile against.

### 6.5 Filter
Covered: filtering by `الأولوية` returning exactly the tasks with that priority
(matching the real `#filterTaskPriority` dropdown), filtering by `الحالة`
returning exactly the tasks with that status (a documented Filter Field with no
live UI dropdown yet — confirmed working via the generic pass-through engine
regardless), a date-range filter (`{op:'lte', value:...}`) on `الموعد_النهائي`
correctly excluding a far-future task, and a priority with zero matches returning
an empty array.

### 6.6 Priority Filter
Explicitly covered (§6.5 above) — `filter({'الأولوية': 'high'})` returns exactly
the one matching legacy-seeded task, matching the real, live
`#filterTaskPriority` dropdown pattern in `renderTasks()`.

### 6.7 Status Filter
Explicitly covered (§6.5 above) — `filter({'الحالة': 'pending'})` returns exactly
the one matching task. Documented as a Filter Field with no live UI control today
(§2.5) — the generic, data-driven `_matchesFilter` engine inherited from
`Repository.js` already supports it without any Tasks-specific override.

### 6.8 Date Filter
Explicitly covered (§6.5 above) — a range operator (`{op:'lte', value:
'2026-12-31'}`) on `الموعد_النهائي` correctly includes an in-range task and
excludes a task due in 2027, using the base class's generic
`_applyFilterOperator` engine with no Tasks-specific override needed.

### 6.9 Duplicate ID
Covered: inserting a second record with an explicitly duplicate `رقم_المهمة` is
rejected with a structured `ConflictError`, and the auto-generated case confirms a
freshly generated id is always unique per insert.

### 6.10 Empty Repository
Covered: opening a `TasksRepository` against an empty `localStorage` (no
`'tasks'` key set yet — the real first-run condition for a brand-new install)
starts with zero records and does not throw; `getAll()`, `count()`, `search()`,
`exists()`, `get()`, and `filter()` all confirmed to behave correctly with zero
records.

### 6.11 Invalid Entity
Covered: `insert()` on a record missing the required field (`العنوان`) is
rejected with a structured `ValidationError` before any write reaches storage.

### 6.12 Legacy localStorage Compatibility
Covered: loading a pre-existing legacy-shaped `localStorage['tasks']` array
unchanged (including the exact field set `renderTasks()` already renders today),
persisting back to the same key in the same array-of-plain-objects shape, and a
second, independent `TasksRepository` instance opening the same storage seeing
identical data (simulating a page reload).

### 6.13 Repository Interface
Covered: every Contract-literal method (§5 table above) is present and callable;
every phase-requested convenience method (`insert`/`remove`/`filter`/`sort`/
`validate`) is present, distinct from (not overriding) the Contract-literal
methods it wraps; a structural check confirms `TasksRepository` extends
`Repository` directly (no indirection through any other Repository); and an
explicit check confirms NO `toggleStatus()` method exists, matching the
deliberate scope exclusion in `Tasks_Repository_Report.md §2.7`.

### 6.14 Syntax
Covered by `node --check` in §1 above, plus the harness itself running to
completion without any uncaught exception (0 failed assertions).

---

## 7. Known, Explicitly Documented Deviations From Prior Reports

(Not defects — all deliberate, justified, and documented in full in
`Tasks_Repository_Report.md §2.2` / `§2.4` / `§2.5` / `§2.6` / `§2.7`.)

1. **Identifier field** — `idField: 'رقم_المهمة'` (with a generate-on-absence
   override) instead of `Data_Schema_Specification_Report.md §4.6`'s abstract
   "Primary Key: id (Hybrid)" description. Same reconciliation pattern already
   applied to Clients/Children/Sessions.
2. **Validation** — no deviation for this entity; both planning reports and the
   actual code agree on exactly one required field (`العنوان`).
3. **Search** — default free-text engine scans all legacy business fields
   (matching `renderTasks()`'s actual behavior), going beyond the narrower
   `العنوان`-only field list both planning reports describe. Resolved in favor
   of the actual, live, UI-wired runtime behavior — same resolution pattern as
   Cases/Clients/Children/Sessions.
4. **Filter** — `الحالة` is a documented Filter Field with no live UI dropdown
   in `index.html` today (unlike `الأولوية`, which is live-wired). Not a code
   discrepancy — the generic `filter()` wrapper already supports both fields
   regardless of UI wiring status.
5. **Sort** — default `sort()` uses `الموعد_النهائي` ascending, matching
   `Data_Schema_Specification_Report.md §4.6`'s recommendation directly, since
   no live sort exists in `renderTasks()` to reconcile against (a purely
   additive capability, unlike Sessions' Phase 5.5 single-vs-composite
   reconciliation).
6. **`toggleStatus(id)`** — proposed in `Repository_Contract_Report.md §4.6` as
   a specialized partial-update operation mirroring `toggleTask()`, but
   deliberately NOT implemented here — outside this phase's closed,
   instruction-specified method list.

---

# Tasks Repository Verification Review

**PASS**

**Ready For Fees Repository**
