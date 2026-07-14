# Tasks_Repository_Integration_Report.md

## PHASE 9 — SUB-PHASE 9.5 — Repository Integration (Tasks Module)

This phase migrates `js/modules/tasks.js` off the global `data.tasks`
array and onto its already-wired `js/repositories/TasksRepository.js`,
using the Documents module integration (SUB-PHASE 9.3) and the Sessions
module integration (SUB-PHASE 9.4) as the proven reference pattern.
Only `js/modules/tasks.js` was modified. No Repository, no Core file, no
other Module, and no HTML template was changed.

---

## 1. Scope

**Modified:**

```
js/modules/tasks.js
```

**Created:**

```
js/tests/verify_tasks_repository_integration.js
docs/Tasks_Repository_Integration_Report.md
```

**Read only (not modified — used exactly as they exist today):**

```
js/core/Repository.js
js/core/DatabaseService.js
js/core/StorageAdapter.js
js/core/LocalStorageAdapter.js
js/repositories/TasksRepository.js
js/repositories/DocumentsRepository.js   (reference pattern, inspected only)
js/repositories/SessionsRepository.js    (reference pattern, inspected only)
js/modules/documents.js                  (reference implementation, inspected only)
js/modules/sessions.js                   (reference implementation, inspected only)
js/modules/dashboard.js    (reads data.tasks — inspected, not edited)
js/ui-utils.js / js/print-utils.js (collectForm/fillForm/val/uid/
                                     formatDate/urgencyBadge/statusBadge
                                     — inspected, not edited)
index.html                 (inspected — see §6 for the one open follow-up item)
```

A directory diff against the pre-phase archive confirms every file in
the second and third lists is byte-identical to before this phase; only
`js/modules/tasks.js` differs, and the two new files above did not exist
before.

---

## 2. What changed inside tasks.js

| Function | Before | After |
|---|---|---|
| `renderTasks()` | Filtered `data.tasks` in plain JS (`Object.values(t).join(' ')` search + `t['الأولوية']===pr` filter), no sort | Calls `TasksRepository.search({search, filter})` — a **synchronous** Repository read that performs the search and the priority filter in one call. `data.tasks` is refreshed from `TasksRepository.getAll()` at the top of the function (also synchronous) and used only to resolve row indexes. No sort option is passed, matching the original's insertion-order-only behavior. |
| `saveTask()` | Mutated `data.tasks[idx]`/`.push(obj)` directly, then `saveLocal()`; manually stamped `obj['رقم_المهمة'] = obj['رقم_المهمة'] \|\| uid();` | `async`. Awaits `TasksRepository.create(obj)` or `.update(existingId, obj)` (two of the only three calls in this file that cross the async boundary), then refreshes the mirror and calls `saveLocal()`/`ApiService.syncRow()`/`renderTasks()`/`updateBadges()` in the same order as before. The manual `رقم_المهمة` stamp was removed — `TasksRepository._resolveId()` already replicates the exact same `\|\| uid()`-equivalent fallback on `create()`. |
| `editTask(i)` | Read `data.tasks[i]` | **Unchanged**, still just reads `data.tasks[i]`. No Repository call needed — it is a pure read of the already-synced mirror. |
| `deleteTask(i)` | `data.tasks.splice(i,1)`; did **not** call `ApiService.deleteData()` (pre-existing gap) | `async`. Resolves `data.tasks[i]` to its `رقم_المهمة` id, then awaits `TasksRepository.delete(id)` (soft delete under the hood — see §5), then refreshes the mirror. Still does **not** call `ApiService.deleteData()` — the pre-existing gap is preserved unchanged, exactly as this phase's "preserve identical behavior" rule requires. |
| `toggleTask(i)` | `data.tasks[i]['الحالة'] = ... ? 'pending' : 'done'` mutated directly; no `ApiService` sync | `async` (the third function crossing the async boundary). Resolves `data.tasks[i]` to its `رقم_المهمة` id, then awaits `TasksRepository.update(id, {'الحالة': newStatus})` — a partial-field update, since `TasksRepository` deliberately does not expose a specialized `toggleStatus()` operation (see `TasksRepository.js` file header "TOGGLE" note). Still does **not** call `ApiService.syncRow()`, matching the original exactly. |

`TASKS_FIELDS`/`TASKS_MAP` are untouched. HTML templates for the task
list items are byte-identical to before — only the value fed into
`toggleTask(N)`/`editTask(N)`/`deleteTask(N)` changed *how* it is
computed, not the markup itself.

---

## 3. The index → record → id translation layer

The rendered rows still embed plain 0-based indexes
(`onclick="editTask(2)"`), and index.html's row templates were left
untouched, so the translation had to happen entirely inside `tasks.js`:

1. **Index → record**: `data.tasks[i]` (unchanged — `data.tasks` is kept
   as a live mirror of `TasksRepository.getAll()`, refreshed after every
   Repository read/write this file performs).
2. **Record → id**: `record['رقم_المهمة']` (the `TASKS_ID_FIELD`
   constant, duplicated here to match `TasksRepository`'s own private
   constant of the same name — no import of Repository internals).
3. **id → Repository call**: `TasksRepository.update(id, patch)` /
   `.delete(id)`.

The one new helper, `resolveTaskIndex(list, record)`, is the mirror
image of step 1: it replaces the old `data.tasks.indexOf(t)` used inside
`renderTasks()`'s row-mapping code. That old lookup relied on `t` being
the *exact same object reference* held in `data.tasks` — which broke the
moment reads started coming from `TasksRepository.search()`/`getAll()`,
both of which return **cloned** records (Repository Contract §19: reads
never hand back a live reference). `resolveTaskIndex()` finds the same
position by comparing `رقم_المهمة` values instead of object identity —
the smallest change that keeps the existing
`onclick="toggleTask(N)"`/`editTask(N)`/`deleteTask(N)` markup working
unmodified.

Tasks has one extra wrinkle versus Sessions/Documents: a *third*
mutating action, `toggleTask(i)`, also needs this same index → record →
id resolution before it can call the Repository — it is handled
identically to `deleteTask(i)`.

---

## 4. Read/write split (as required by this phase)

- **Reads** (`renderTasks`) use only `TasksRepository.getAll()` and
  `.search()` — both synchronous once the Repository is open. No
  `async`/`await` was introduced into `renderTasks()` or `editTask()`.
- **Writes** (`saveTask`, `deleteTask`, `toggleTask`) are the *only*
  three functions in the file marked `async`, and the *only* places an
  `await` appears against a Repository call — exactly matching
  `Repository.create()`/`.update()`/`.delete()` being the only
  Promise-returning Contract methods this module needed.
  `toggleTask()` counts as a write because it mutates stored data
  through `update()`, even though its original inline form looked like a
  simple in-place property flip.

### Search / filter via one Query Model call

`renderTasks()` builds a single Query Model object and passes it to
`TasksRepository.search()`:

```js
var queryModel = {};
if (s)  queryModel.search = s;
if (pr) queryModel.filter = { 'الأولوية': pr };
var rows = tasksRepository.search(queryModel).items;
```

- **Search**: `TasksRepository._matchesSearch()` (an override already
  present in TasksRepository.js, not touched by this phase) replicates
  the exact `Object.values(t).join(' ').toLowerCase().includes(s)`
  free-text join the inline module used, scoped to
  `TASKS_LEGACY_FIELDS` (the same field set `Object.values()` would have
  produced on a real record).
- **Filter**: the base class's generic `_matchesFilter` engine handles
  plain equality (`{'الأولوية': pr}`) with no override needed — identical
  behavior to the original `t['الأولوية'] === pr`.
- **Sort**: no sort option is ever passed. The original inline
  `renderTasks()` never called `.sort()` at all (insertion order only —
  confirmed by direct inspection, and documented as such in
  `TasksRepository.js`'s own file header "SORT" note). `TasksRepository`
  does expose an additive `sort()` convenience method, but this phase's
  "preserve identical behavior" mandate means it is intentionally **not**
  used here, since doing so would change observable row order versus the
  original.

### Startup ordering

`TasksRepository.open()` is itself async (it awaits
`LocalStorageAdapter.read()`), so `tasks.js` calls it once at module
load time and stores the resulting promise
(`tasksRepositoryReadyPromise`). `LocalStorageAdapter.read()`/`write()`
are each a `new Promise(function (resolve, reject) { /* synchronous
body, resolves immediately */ })` — no `setTimeout`, no real I/O
latency — so the whole chain resolves via ordinary microtasks. Per the
HTML spec, the microtask queue drains after each parser-blocking
`<script>` element finishes executing and again before
`DOMContentLoaded` fires, so by the time any
`oninput="renderTasks()"` / `onclick="saveTask()"` handler can actually
run, the Repository is already `ready`. `renderTasks()` and all three
write functions still carry a defensive
`isReady()`/`ensureTasksRepositoryReady()` guard for the theoretical
case this ordering assumption is ever violated (e.g. a future change
makes the adapter genuinely async), but this is a safety net, not
something the normal code path exercises.

---

## 5. Soft delete — what is, and is not, observably different

`TasksRepository` is configured with `softDelete: true` (a decision made
in PHASE 5.6, not this phase — unchanged). `delete(id)` therefore stamps
`deletedAt` on the record and keeps it in the Repository's in-memory
array and in whatever it persists, instead of physically removing it
the way `data.tasks.splice(i,1)` used to.

**What stays identical:** `getAll()` and `search()` both exclude
soft-deleted records by default, and `data.tasks` — the only thing
`dashboard.js` ever reads — is always populated from one of those two
calls. A deleted task therefore disappears from the task list and the
sidebar badge count exactly as before, and can never reappear. From
every angle a user or another Module can observe, this is
indistinguishable from the old hard delete. The integration test's
delete-path check confirms both halves of this directly: the tombstone
exists in `getAll({includeDeleted:true})` but `exists(id)` — and
everything built on it — correctly hides it.

**What is different, and why it doesn't matter here:** the raw JSON
array persisted under the `tasks` localStorage key will, over time,
accumulate soft-delete tombstones rather than shrinking, if nothing ever
purges them — an internal storage-size detail, not a behavior change any
Module or user interaction can observe today. This is the same
documented tradeoff already accepted for Documents/Sessions/Cases/
Clients/Children in prior phases, not a new decision made here.

`toggleTask()` is unaffected by soft delete — it only ever calls
`update()`, never `delete()`.

---

## 6. Deployment note (out of scope for this phase)

`index.html` does not yet load `js/repositories/TasksRepository.js`,
`js/core/Repository.js`, `js/core/DatabaseService.js`, or
`js/core/LocalStorageAdapter.js` via `<script>` tags ahead of
`js/modules/tasks.js`. Wiring those tags in is required before this
module runs correctly in a real browser, but editing `index.html` is
explicitly out of scope for this phase's "Modify ONLY tasks.js" mandate
— the same open item already flagged for Documents and Sessions in
their respective integration reports, still unresolved for Tasks here
as well. Until that follow-up phase, this module is correctly proven
only via the Node harness
(`js/tests/verify_tasks_repository_integration.js`), which loads the
same files Node-side exactly as they exist on disk.

`index.html` may also still contain its own `DOMContentLoaded`
migration/read logic touching the same `tasks` localStorage key
`TasksRepository` uses. This is a pre-existing, unmodified piece of
`index.html` and is unaffected by this phase — it was already there
before Tasks had a Repository, and this phase's mandate excludes editing
`index.html`.

---

## 7. Regression testing

`js/tests/verify_tasks_repository_integration.js` (21 checks, all
passing) exercises, against the real `js/modules/tasks.js`,
`js/repositories/TasksRepository.js`, `js/core/Repository.js`,
`js/core/DatabaseService.js`, and `js/core/LocalStorageAdapter.js` files
on disk:

- **Static integrity**: `tasks.js` parses as valid JS; `TasksRepository.js`
  and `Repository.js` are confirmed unmodified (still export the same
  public surface).
- **Open**: fresh (empty) localStorage loads zero records; the
  `data.tasks` mirror matches `TasksRepository.getAll()`.
- **Validation**: an empty/whitespace-only `العنوان` is still blocked
  before ever reaching the Repository (same DOM-level guard as before).
- **Create**: `saveTask()` inserts a new record via
  `TasksRepository.create()`, auto-generates `رقم_المهمة` (no manual
  stamp needed anymore), stamps `تاريخ_الإنشاء`, calls `saveLocal()`,
  `ApiService.syncRow('المهام', ...)`, `closeModal('modalTask')`, and
  `updateBadges()` in the same order as before.
- **Search**: free-text search matches across the full legacy field
  set, identical to the original `Object.values(t).join(' ')` join.
- **Filter**: `#filterTaskPriority` exact-equality filter combines with
  search using AND semantics, matching the original.
- **Sort**: rows render in plain insertion order — confirmed that no
  `.sort()` behavior was introduced, matching the original inline
  `renderTasks()` exactly.
- **Empty result**: no matches shows `#tasksEmpty` and clears the list.
- **Index → record → id translation**: rendered `onclick` handlers
  (`toggleTask`, `editTask`, `deleteTask`) embed indexes that
  `resolveTaskIndex()` correctly resolves back to the same `data.tasks`
  mirror position.
- **Update**: `editTask()` stays fully synchronous (no Repository
  call); `saveTask()`'s update path preserves the record's id and array
  position via `TasksRepository.update()`.
- **Toggle**: `toggleTask()` flips `الحالة` between `'pending'` and
  `'done'` via a partial `TasksRepository.update(id, {'الحالة': ...})`
  call, leaves every other field on the record untouched, does not
  add/remove records, and — matching the original — never calls
  `ApiService.syncRow()`.
- **Delete**: `deleteTask()` soft-deletes via `TasksRepository.delete()`
  — vanishes from the mirror/UI exactly like the old hard delete, and
  still does **not** call `ApiService.deleteData()`, preserving the
  pre-existing gap unchanged.
- **exists()/count()**: spot-checked directly against the live
  Repository after the create/update/toggle/delete sequence above,
  confirming both correctly reflect the current soft-delete-aware record
  set.
- **Persistence / backward compatibility**: a pre-existing legacy-shaped
  `tasks` localStorage key (no Repository metadata fields) loads
  correctly through `TasksRepository`, and writes continue to land under
  the same bare `tasks` key with no prefix.
- **Mirror synchronization**: `data.tasks` is refreshed after every
  Repository open/create/update/toggle/delete this module performs, and
  stays in lock-step with `TasksRepository.getAll()` throughout.

The full pre-existing test suite (`js/tests/*.js`) was also re-run.
`verify_repository_wiring_all.js` (140/140), `verify_cases_repository_
wiring.js` (42/42), `verify_database_pipeline.js` (37/37),
`verify_database_service_core.js` (26/26), `verify_documents_repository.js`
(61/61), `verify_documents_repository_integration.js` (17/17),
`verify_localstorage_adapter.js` (30/30), `verify_templates_repository.js`
(55/55), and `verify_sessions_repository_integration.js` (18/18) all
still pass unchanged. A handful of pre-existing, unrelated standalone
harnesses (`verify_children_repository.js`, `verify_clients_repository.js`,
`verify_fees_repository.js`, `verify_library_repository.js`,
`verify_sessions_repository.js`, `verify_tasks_repository.js`) fail with a
`MODULE_NOT_FOUND` error unrelated to this phase's change (a broken
relative `require()` path inside those pre-existing test files
themselves) — confirmed present identically before this phase's change
(reproduced against the original, un-migrated archive) and out of scope
for a "Modify ONLY tasks.js" mandate.

---

## 8. Verification — mandate compliance

- [x] Only `js/modules/tasks.js` modified (directory diff against the
      pre-phase archive confirms this — see §1).
- [x] No Repository file modified (`Repository.js`, `DatabaseService.js`,
      `StorageAdapter.js`, `LocalStorageAdapter.js`,
      `TasksRepository.js`).
- [x] No Core file modified.
- [x] No other Module modified (`documents.js`, `sessions.js`, `cases.js`,
      `clients.js`, `children.js`, `fees.js`, `calendar.js`,
      `dashboard.js`, `templates.js`, `library.js`, `settings.js`).
- [x] No HTML/CSS changed; generated markup for task rows is
      byte-identical to before.
- [x] UI behavior preserved: Open, Create, Update, Delete, Toggle,
      Search, Filter, Sort (absence thereof), Persistence, Backward
      compatibility, Mirror synchronization — all verified in §7.

---

## Tasks Repository Integration
## PASS
## Ready For Library Integration
