# Children_Repository_Integration_Report.md

## PHASE 9 — SUB-PHASE 9.8 — Repository Integration (Children Module)

This phase migrates `js/modules/children.js` off the global
`data.children` array and onto its already-wired `js/repositories/
ChildrenRepository.js`, using the Documents module integration
(SUB-PHASE 9.3), Sessions (SUB-PHASE 9.4), Tasks (SUB-PHASE 9.5),
Library (SUB-PHASE 9.6), and Templates (SUB-PHASE 9.7) integrations as
the proven reference pattern. Only `js/modules/children.js` was
modified. No Repository, no Core file, no other Module, and no HTML
template was changed.

---

## 1. Scope

**Modified:**

```
js/modules/children.js
```

**Created:**

```
js/tests/verify_children_repository_integration.js
docs/Children_Repository_Integration_Report.md
```

**Read only (not modified — used exactly as they exist today):**

```
js/core/Repository.js
js/core/DatabaseService.js
js/core/StorageAdapter.js
js/core/LocalStorageAdapter.js
js/repositories/ChildrenRepository.js
js/repositories/DocumentsRepository.js   (reference pattern, inspected only)
js/repositories/SessionsRepository.js    (reference pattern, inspected only)
js/repositories/TasksRepository.js       (reference pattern, inspected only)
js/repositories/LibraryRepository.js     (reference pattern, inspected only)
js/repositories/TemplatesRepository.js   (reference pattern, inspected only)
js/modules/documents.js                  (reference implementation, inspected only)
js/modules/sessions.js                   (reference implementation, inspected only)
js/modules/tasks.js                      (reference implementation, inspected only)
js/modules/library.js                    (reference implementation, inspected only)
js/modules/templates.js                  (reference implementation, inspected only)
js/modules/dashboard.js    (reads data.children — inspected, not edited)
js/modules/cases.js        (populateCaseDropdown(), resetForm()/collectForm()/
                             fillForm() overrides, embedded case-modal children
                             section — inspected, not edited)
js/modules/settings.js     (syncToSheets()/syncDeleteToSheets()/loadFromSheets()
                             — inspected, not edited; see §5)
js/ui-utils.js / js/print-utils.js (uid()/val() — inspected, not edited)
index.html                 (inspected — see §6 for the one open follow-up item)
Code_v4.gs                  (inspected to confirm the SHEET_DEFS gap — see §5)
```

A directory diff against the pre-phase archive confirms every file in
the second and third lists is byte-identical to before this phase; only
`js/modules/children.js` differs, and the two new files above did not
exist before.

---

## 2. Audit of children.js (performed before writing any code)

The pre-migration `js/modules/children.js` was 51 lines and contained
exactly five functions, all copied byte-for-byte from index.html's
original inline `<script>` block:

| Function | Behavior |
|---|---|
| `openAddChildModal()` | Resets `editIdx.children` to `-1`, calls the (cases.js-overridden) `resetForm('children')`, opens `#modalChild` in create mode, and populates the case dropdown via `populateCaseDropdown('fChildCaseNum')`. |
| `saveChild()` | Reads `#fChildCaseNum`/`#fChildName` directly from the DOM and blocks with a toast if either is empty after `.trim()`. Calls `collectForm('children')`, stamps `رقم_الطفل` (`\|\| uid()`) and `تاريخ_الإنشاء` (`\|\| new Date().toISOString()`) directly onto the plain object, then either overwrites `data.children[idx]` or `.push()`es a new record. Calls `saveLocal()`, then `if(API_URL)syncToSheets('الأطفال',obj,idx)`, then `closeModal`/`renderChildren`/`updateBadges`. |
| `editChild(i)` | Sets `editIdx.children=i`, calls `populateCaseDropdown('fChildCaseNum', data.children[i]['رقم_القضية'])`, `fillForm('children', data.children[i])`, opens the modal in edit mode. |
| `deleteChild(i)` | Confirms, `data.children.splice(i,1)`, `saveLocal()`, toast, `renderChildren()`, `updateBadges()`. **No sync call of any kind** — this was already true before this phase. |
| `renderChildren()` | Reads `#searchChildren`, filters `data.children` with `Object.values(c).join(' ').toLowerCase().includes(s)` (no filter dropdown, no sort), and renders both the desktop table (`#childrenTableBody`) and the mobile card list (`#childrenMobileList`), using `data.children.indexOf(c)` to compute each row's `editChild(ri)`/`deleteChild(ri)` index. |

**Dependencies identified:** `data`, `editIdx`, `API_URL`, `syncToSheets()`
(settings.js), `saveLocal()`, `toast()`, `closeModal()`, `updateBadges()`,
`val()`/`uid()` (ui-utils.js), `collectForm()`/`fillForm()`/`resetForm()`
(overridden by cases.js), `populateCaseDropdown()` (cases.js).

**Sync operation identified:** exactly one — the `syncToSheets('الأطفال',
obj, idx)` call inside `saveChild()`, gated behind `if(API_URL)`. No
`syncDeleteToSheets()` call exists anywhere in the file.

**Legacy path identified:** the entire module is a "legacy path" by this
phase's definition — every other already-migrated module now calls
`ApiService.syncRow()`/`ApiService.deleteData()` instead of the raw
`syncToSheets()`/`syncDeleteToSheets()` globals. Children is the one
remaining module still calling the old global directly, and per this
phase's explicit instruction this was preserved, not migrated (see §5).

**Other reads of `data.children` found in the project:**
`js/modules/dashboard.js` line 76 (`setBadge('badgeChildren',
data.children.length)`), confirming the mirror requirement described in
§3.

No other special behavior, hidden dependency, or additional sync path
was found. This matches exactly what `ChildrenRepository.js`'s own file
header already documented from its Phase 5.4/8.5.2 audit (required
fields, free-text search override, hybrid id, soft-delete config) — no
new discrepancy was discovered during this phase's re-audit.

---

## 3. What changed inside children.js

| Function | Before | After |
|---|---|---|
| `openAddChildModal()` | Purely DOM/modal setup | **Unchanged.** No Repository call needed. |
| `saveChild()` | Mutated `data.children[idx]`/`.push(obj)` directly, then `saveLocal()`; manually stamped `obj['رقم_الطفل'] = obj['رقم_الطفل'] \|\| uid();` | `async`. Awaits `ChildrenRepository.create(obj)` or `.update(existingId, obj)` (the only two calls in this file that cross the async boundary, together with `delete()`), then refreshes the mirror and calls `saveLocal()`/`syncToSheets()`/`closeModal()`/`renderChildren()`/`updateBadges()` in the same order as before. The manual `رقم_الطفل` stamp was removed — `ChildrenRepository._resolveId()` already replicates the exact same `\|\| uid()`-equivalent fallback on `create()`. `syncToSheets()` now receives `result.record` (the Repository's returned record, which includes the generated id) instead of the local `obj` variable — the smallest change needed so the synced payload still contains the id, matching the precedent already set for `ApiService.syncRow(..., result.record, ...)` in Tasks/Sessions/Documents. |
| `editChild(i)` | Read `data.children[i]` | **Unchanged**, still just reads `data.children[i]`. No Repository call needed — it is a pure read of the already-synced mirror. |
| `deleteChild(i)` | `data.children.splice(i,1)`; never called any sync function | `async`. Resolves `data.children[i]` to its `رقم_الطفل` id, then awaits `ChildrenRepository.delete(id)` (soft delete under the hood — see §4), then refreshes the mirror. Still does **not** call `syncToSheets()`/`syncDeleteToSheets()` — the pre-existing gap (there never was a delete-sync call for Children) is preserved unchanged. |
| `renderChildren()` | Filtered `data.children` in plain JS (`Object.values(c).join(' ')` search), no filter dropdown, no sort | Calls `ChildrenRepository.search({search})` — a **synchronous** Repository read that performs the free-text search in one call. `data.children` is refreshed from `ChildrenRepository.getAll()` at the top of the function (also synchronous) and used only to resolve row indexes. No filter option and no sort option is passed, matching the original's behavior exactly (there is no filter dropdown on the Children page, and the original never called `.sort()`). |

No `FIELDS`/`MAP` constants were introduced in this file — unlike
Tasks.js's local `TASKS_FIELDS`/`TASKS_MAP` (which duplicate but never
actually reference the global equivalents), the original
`js/modules/children.js` never defined such constants at all;
`collectForm('children')`/`fillForm('children')` continue to resolve
against the existing global `FIELDS.children`/`MAP.children` defined in
index.html's inline script, exactly as before. HTML templates for the
children table rows and mobile cards are byte-identical to before —
only the value fed into `editChild(N)`/`deleteChild(N)` changed *how*
it is computed, not the markup itself.

---

## 4. The index → record → id translation layer & soft delete

The rendered rows still embed plain 0-based indexes
(`onclick="editChild(2)"`), and index.html's row templates were left
untouched, so the translation had to happen entirely inside
`children.js`:

1. **Index → record**: `data.children[i]` (unchanged — `data.children`
   is kept as a live mirror of `ChildrenRepository.getAll()`, refreshed
   after every Repository read/write this file performs).
2. **Record → id**: `record['رقم_الطفل']` (the `CHILDREN_ID_FIELD`
   constant, duplicated here to match `ChildrenRepository`'s own
   private constant of the same name — no import of Repository
   internals).
3. **id → Repository call**: `ChildrenRepository.update(id, patch)` /
   `.delete(id)`.

The one new helper, `resolveChildIndex(list, record)`, is the mirror
image of step 1: it replaces the old `data.children.indexOf(c)` used
inside `renderChildren()`'s row-mapping code. That old lookup relied on
`c` being the *exact same object reference* held in `data.children` —
which broke the moment reads started coming from
`ChildrenRepository.search()`/`getAll()`, both of which return
**cloned** records (Repository Contract §19: reads never hand back a
live reference). `resolveChildIndex()` finds the same position by
comparing `رقم_الطفل` values instead of object identity — the smallest
change that keeps the existing `onclick="editChild(N)"`/`deleteChild(N)`
markup working unmodified.

**Soft delete — observable behavior note:** `ChildrenRepository` is
configured with `softDelete: true` (unchanged, not this phase's
decision — set back in PHASE 5.4). `delete(id)` therefore keeps the
record in storage with a `deletedAt` stamp instead of physically
removing it, unlike the original `data.children.splice(i,1)`. What
stays identical: `getAll()`/`search()` both exclude soft-deleted
records by default, and `data.children` — the only thing
`dashboard.js` ever reads — is always populated from one of those two
calls. A deleted child therefore disappears from the list and the
sidebar badge count exactly as before, and can never reappear. From
every angle a user or another Module can observe, this is
indistinguishable from the old hard delete. The integration test's
delete-path check confirms both halves of this directly: the tombstone
exists in `getAll({includeDeleted:true})` but `exists(id)` correctly
hides it.

---

## 5. Legacy Behavior Preserved

This section documents, per this phase's explicit instruction, exactly
why `syncToSheets()` was intentionally left unchanged in
`js/modules/children.js`, rather than migrated to `ApiService.syncRow()`
the way Documents, Sessions, Tasks, Library, and Templates all were.

**What was found:**

1. `saveChild()`'s original inline body called the legacy global
   `syncToSheets('الأطفال', obj, idx)`, gated behind `if(API_URL)` —
   never `ApiService.syncRow()`.
2. Direct inspection of `Code_v4.gs`'s `SHEET_DEFS` confirms there is
   **no `'الأطفال'` sheet** defined anywhere in the Apps Script backend.
   Every other synced entity (`القضايا`, `الجلسات`, `الموكلين`,
   `المستندات`, `المهام`, `الأتعاب`) has a corresponding sheet
   definition; Children does not.
3. `js/modules/settings.js`'s `loadFromSheets()` nonetheless still
   includes the pair `['الأطفال','children']` in the list of sheets it
   attempts to pull on refresh — meaning the client already asks the
   server for a sheet the server was never given.
4. `js/repositories/ChildrenRepository.js`'s own file header ("SYNC"
   note, PHASE 5.4) already documented this exact gap independently,
   confirming it is not a new discovery of this phase but a
   long-standing, already-known condition of the application.

**Why it was preserved rather than fixed or migrated:**

This phase's mandate is Repository integration — moving
`data.children` reads/writes onto `ChildrenRepository` — and explicitly
excludes touching the sync mechanism or sync target for Children. The
instructions for this sub-phase state plainly: *"Treat both as
existing application behavior. Do NOT fix them. Do NOT migrate them.
Do NOT replace them with ApiService."* Migrating this call to
`ApiService.syncRow()` would be indistinguishable, from the outside, from
"fixing" the sync path — and there is still no `'الأطفال'` sheet on the
server for either `syncToSheets()` or `ApiService.syncRow()` to
succeed against, so doing so would not restore real functionality; it
would only change *which* broken call is made, a scope decision
explicitly reserved for a later phase (a hypothetical "add the الأطفال
sheet to Code_v4.gs and wire ApiService for Children" phase, not this
one).

**What this phase actually changed about the sync call:** only the
*value* passed as `rowData` — `result.record` (the Repository's
returned record, which reliably contains the generated `رقم_الطفل` id)
instead of the local `obj` variable — so that if/when a server-side
`'الأطفال'` sheet is ever added, the payload already being sent today
contains a complete, id-bearing record. The function name
(`syncToSheets`), the gating condition (`if(API_URL)`), the sheet name
argument (`'الأطفال'`), and the `idx` argument are all byte-identical
to the original call.

**What was left completely alone:** `deleteChild()` still does not call
`syncToSheets()`/`syncDeleteToSheets()` at all — this was already true
before this phase (there never was a delete-sync call for Children,
unlike Sessions, which does call `ApiService.deleteData()`). No
functional change was made to that gap either.

---

## 6. Deployment note (out of scope for this phase)

`index.html` does not yet load `js/repositories/ChildrenRepository.js`,
`js/core/Repository.js`, `js/core/DatabaseService.js`, or
`js/core/LocalStorageAdapter.js` via `<script>` tags ahead of
`js/modules/children.js`. Wiring those tags in is required before this
module runs correctly in a real browser, but editing `index.html` is
explicitly out of scope for this phase's "Modify ONLY children.js"
mandate — the same open item already flagged for Documents, Sessions,
Tasks, Library, and Templates in their respective integration reports,
still unresolved for Children here as well. Until that follow-up phase,
this module is correctly proven only via the Node harness
(`js/tests/verify_children_repository_integration.js`), which loads the
same files Node-side exactly as they exist on disk.

The pre-existing `'الأطفال'` server-sheet gap (§5) and `index.html`'s
own `DOMContentLoaded` migration/read logic touching the same
`children` localStorage key `ChildrenRepository` uses are both
unmodified, pre-existing conditions, unaffected by this phase.

---

## 7. Regression testing

`js/tests/verify_children_repository_integration.js` (20 checks, all
passing) exercises, against the real `js/modules/children.js`,
`js/repositories/ChildrenRepository.js`, `js/core/Repository.js`,
`js/core/DatabaseService.js`, and `js/core/LocalStorageAdapter.js` files
on disk:

- **Static integrity**: `children.js` parses as valid JS;
  `ChildrenRepository.js` and `Repository.js` are confirmed unmodified
  (still export the same public surface).
- **Open**: fresh (empty) localStorage loads zero records; the
  `data.children` mirror matches `ChildrenRepository.getAll()`.
- **`openAddChildModal()`**: resets `editIdx.children`, opens the
  modal, calls `populateCaseDropdown()` — confirmed synchronous, no
  Repository call.
- **Validation**: empty/whitespace-only `رقم القضية`/`اسم الطفل` is
  still blocked before ever reaching the Repository (same DOM-level
  guard, same Arabic error message, as before).
- **Create**: `saveChild()` inserts a new record via
  `ChildrenRepository.create()`, auto-generates `رقم_الطفل` (no manual
  stamp needed anymore), stamps `تاريخ_الإنشاء`, calls `saveLocal()`,
  `closeModal('modalChild')`, and `updateBadges()` in the same order as
  before — and confirms `syncToSheets()` is correctly gated behind
  `API_URL` (not called when `API_URL` is empty, matching the
  original).
- **Search**: free-text search matches across the full legacy field
  set, identical to the original `Object.values(c).join(' ')` join.
- **Sort**: rows render in plain insertion order — confirmed that no
  `.sort()` behavior was introduced, matching the original inline
  `renderChildren()` exactly.
- **Empty result**: no matches shows `#childrenEmpty` and clears both
  the table body and the mobile card list.
- **Index → record → id translation**: rendered `onclick` handlers
  (`editChild`, `deleteChild`) embed indexes that `resolveChildIndex()`
  correctly resolves back to the same `data.children` mirror position.
- **Update**: `editChild()` stays fully synchronous (no Repository
  call, correctly re-populates the case dropdown with the record's
  `رقم_القضية`); `saveChild()`'s update path preserves the record's id
  and array position via `ChildrenRepository.update()`.
- **Legacy sync call preserved**: `saveChild()` calls the legacy global
  `syncToSheets('الأطفال', ...)` — not `ApiService.syncRow()` — when
  `API_URL` is set, and the synced payload includes the record's
  generated `رقم_الطفل` id.
- **Delete**: `deleteChild()` soft-deletes via
  `ChildrenRepository.delete()` — vanishes from the mirror/UI exactly
  like the old hard delete, and still does **not** call any sync
  function at all, preserving the pre-existing gap unchanged.
- **`exists()`/`count()`**: spot-checked directly against the live
  Repository after the create/update/delete sequence above, confirming
  both correctly reflect the current soft-delete-aware record set.
- **Persistence / backward compatibility**: a pre-existing legacy-shaped
  `children` localStorage key (no Repository metadata fields) loads
  correctly through `ChildrenRepository`, and writes continue to land
  under the same bare `children` key with no prefix.
- **Mirror synchronization**: `data.children` is refreshed after every
  Repository open/create/update/delete this module performs, and stays
  in lock-step with `ChildrenRepository.getAll()` throughout.

The full pre-existing test suite (`js/tests/*.js`) was also re-run.
`verify_repository_wiring_all.js` (140/140), `verify_cases_repository_
wiring.js` (42/42), `verify_database_pipeline.js` (37/37),
`verify_database_service_core.js` (26/26), `verify_documents_
repository.js` (61/61), `verify_documents_repository_integration.js`
(17/17), `verify_localstorage_adapter.js` (30/30),
`verify_templates_repository.js` (55/55), `verify_templates_repository_
integration.js` (23/23), `verify_library_repository_integration.js`
(25/25), `verify_sessions_repository_integration.js` (18/18), and
`verify_tasks_repository_integration.js` (21/21) all still pass
unchanged. The same pre-existing, unrelated standalone harnesses
already flagged in prior integration reports
(`verify_children_repository.js`, `verify_clients_repository.js`,
`verify_fees_repository.js`, `verify_library_repository.js`,
`verify_sessions_repository.js`, `verify_tasks_repository.js`) still
fail with a `MODULE_NOT_FOUND` error unrelated to this phase's change (a
broken relative `require()` path inside those pre-existing test files
themselves) — confirmed present identically before this phase's change
and out of scope for a "Modify ONLY children.js" mandate.

---

## 8. Verification — mandate compliance

- [x] Only `js/modules/children.js` modified (directory diff against
      the pre-phase archive confirms this — see §1).
- [x] No Repository file modified (`Repository.js`, `DatabaseService.js`,
      `StorageAdapter.js`, `LocalStorageAdapter.js`,
      `ChildrenRepository.js`).
- [x] No Core file modified.
- [x] No other Module modified (`documents.js`, `sessions.js`,
      `cases.js`, `clients.js`, `tasks.js`, `fees.js`, `calendar.js`,
      `dashboard.js`, `templates.js`, `library.js`, `settings.js`).
- [x] No HTML/CSS changed; generated markup for children rows/cards is
      byte-identical to before.
- [x] `syncToSheets()` legacy behavior preserved, not migrated, not
      fixed (see §5).
- [x] UI behavior preserved: Open, Create, Update, Delete, Search, Sort
      (absence thereof), Persistence, Backward compatibility, Mirror
      synchronization, Legacy sync behavior — all verified in §7.

---

## Children Repository Integration
## PASS
## Ready For Fees Integration
