# Library_Repository_Integration_Report.md

## PHASE 9 — SUB-PHASE 9.6 — Repository Integration (Library Module)

This phase migrates `js/modules/library.js` off the global `data.library`
array and onto its already-wired `js/repositories/LibraryRepository.js`,
using the Documents module integration (SUB-PHASE 9.3), the Sessions
module integration (SUB-PHASE 9.4), and the Tasks module integration
(SUB-PHASE 9.5) as the proven reference pattern. Only
`js/modules/library.js` was modified. No Repository, no Core file, no
other Module, and no HTML template was changed.

---

## 1. Scope

**Modified:**

```
js/modules/library.js
```

**Created:**

```
js/tests/verify_library_repository_integration.js
docs/Library_Repository_Integration_Report.md
```

**Read only (not modified — used exactly as they exist today):**

```
js/core/Repository.js
js/core/DatabaseService.js
js/core/StorageAdapter.js
js/core/LocalStorageAdapter.js
js/repositories/LibraryRepository.js
js/repositories/DocumentsRepository.js   (reference pattern, inspected only)
js/repositories/SessionsRepository.js    (reference pattern, inspected only)
js/repositories/TasksRepository.js       (reference pattern, inspected only)
js/modules/documents.js                  (reference implementation, inspected only)
js/modules/sessions.js                   (reference implementation, inspected only)
js/modules/tasks.js                      (reference implementation, inspected only)
js/ui-utils.js / js/print-utils.js (collectForm/fillForm/val/uid
                                     — inspected, not edited)
index.html                 (inspected — see §6 for the one open follow-up item)
```

A directory diff against the pre-phase archive confirms every file in
the second and third lists is byte-identical to before this phase; only
`js/modules/library.js` differs, and the two new files above did not
exist before.

---

## 2. What changed inside library.js

| Function | Before | After |
|---|---|---|
| `renderLibrary()` | Filtered `data.library` in plain JS (`Object.values(b).join(' ')` search + `b['القسم']===cF && b['النوع']===tF` filters), no sort; rebuilt `#filterLibCat` options and the Drive-link bar from `data.library` directly | Calls `LibraryRepository.search({search, filter})` — a **synchronous** Repository read that performs the search and both filters (combined via the base engine's AND semantics) in one call. `data.library` is refreshed from `LibraryRepository.getAll()` at the top of the function (also synchronous) and used only to rebuild the category dropdown and to resolve row indexes. No sort option is passed, matching the original's insertion-order-only behavior. The `#filterLibCat` dynamic-options rebuild and the Drive-link bar logic are otherwise untouched, still reading the freshly-synced `data.library` mirror and the `DRIVE_URL` global exactly as before. |
| `saveLibBook()` | Mutated `data.library[idx]`/`.push(obj)` directly, then `saveLocal()`; manually stamped `obj['id'] = obj['id'] \|\| uid();` (which, because `collectForm('library')` never produces an `id` key, actually fired on *every* save, create or update) | `async`. Awaits `LibraryRepository.create(obj)` or `.update(existingId, obj)` (the only two calls in this file that cross the async boundary), then refreshes the mirror and calls `saveLocal()`/`closeModal()`/`renderLibrary()` in the same order as before. The manual `id` stamp was removed — `LibraryRepository._resolveId()` already replicates the exact same `\|\| uid()`-equivalent fallback on `create()`, and `Repository.prototype.update()` unconditionally preserves the existing record's id regardless of what the patch contains (see §4 below for why this is not an observable behavior change). |
| `editLibBook(i)` | Read `data.library[i]` | **Unchanged**, still just reads `data.library[i]`. No Repository call needed — it is a pure read of the already-synced mirror. |
| `deleteLibBook(i)` | `data.library.splice(i,1)`; no GAS sync call of any kind (Library was never synced) | `async`. Resolves `data.library[i]` to its `id`, then awaits `LibraryRepository.delete(id)` (soft delete under the hood — see §5), then refreshes the mirror. Still makes **no** `ApiService` call anywhere — Library had none to begin with, and this migration adds none. |

`LIBRARY_FIELDS`/`LIBRARY_MAP` are untouched. HTML templates for the
library grid cards are byte-identical to before — only the value fed
into `editLibBook(N)`/`deleteLibBook(N)` changed *how* it is computed,
not the markup itself.

---

## 3. The index → record → id translation layer

The rendered cards still embed plain 0-based indexes
(`onclick="editLibBook(2)"`), and index.html's card template was left
untouched, so the translation had to happen entirely inside
`library.js`:

1. **Index → record**: `data.library[i]` (unchanged — `data.library` is
   kept as a live mirror of `LibraryRepository.getAll()`, refreshed
   after every Repository read/write this file performs).
2. **Record → id**: `record['id']` (the `LIBRARY_ID_FIELD` constant,
   duplicated here to match `LibraryRepository`'s own private constant
   of the same name — no import of Repository internals). Library is
   the first entity migrated in this phase sequence whose identifier is
   the generic key `id` rather than a dedicated Arabic field name (see
   `LibraryRepository.js` file header "IDENTIFIER" note) — the
   translation layer's *shape* is identical to Documents/Sessions/Tasks,
   only the field name constant differs.
3. **id → Repository call**: `LibraryRepository.update(id, patch)` /
   `.delete(id)`.

The one new helper, `resolveLibIndex(list, record)`, is the mirror image
of step 1: it replaces the old `data.library.indexOf(b)` used inside
`renderLibrary()`'s card-mapping code. That old lookup relied on `b`
being the *exact same object reference* held in `data.library` — which
broke the moment reads started coming from
`LibraryRepository.search()`/`getAll()`, both of which return **cloned**
records (Repository Contract §19: reads never hand back a live
reference). `resolveLibIndex()` finds the same position by comparing
`id` values instead of object identity — the smallest change that keeps
the existing `onclick="editLibBook(N)"`/`deleteLibBook(N)` markup
working unmodified.

---

## 4. Read/write split (as required by this phase)

- **Reads** (`renderLibrary`) use only `LibraryRepository.getAll()` and
  `.search()` — both synchronous once the Repository is open. No
  `async`/`await` was introduced into `renderLibrary()` or
  `editLibBook()`.
- **Writes** (`saveLibBook`, `deleteLibBook`) are the *only* two
  functions in the file marked `async`, and the *only* places an
  `await` appears against a Repository call — exactly matching
  `Repository.create()`/`.update()`/`.delete()` being the only
  Promise-returning Contract methods this module needed.

### Search / filter via one Query Model call

`renderLibrary()` builds a single Query Model object and passes it to
`LibraryRepository.search()`:

```js
var queryModel = {};
if (s) queryModel.search = s;
var filterObj = {};
if (cF) filterObj['القسم'] = cF;
if (tF) filterObj['النوع'] = tF;
if (Object.keys(filterObj).length) queryModel.filter = filterObj;
var rows = libraryRepository.search(queryModel).items;
```

- **Search**: `LibraryRepository._matchesSearch()` (an override already
  present in `LibraryRepository.js`, not touched by this phase)
  replicates the exact `Object.values(b).join(' ').toLowerCase().includes(s)`
  free-text join the inline module used, literally over every field the
  record has — this Repository's `_matchesSearch()` deliberately does
  **not** exclude audit/metadata fields (unlike every prior Repository),
  per `LibraryRepository.js`'s own file header "SEARCH" note. `library.js`
  needed no change to accommodate this — it already just calls
  `search()` and trusts the override.
- **Filter**: the base class's generic `_matchesFilter` engine handles
  both `{'القسم': cF}` and `{'النوع': tF}` with plain equality and no
  override needed, and — critically for this entity, which has **two**
  live filter controls where Tasks/Documents each had only one —
  `Object.keys(filter).every(...)` (Repository.js §4.5) combines multiple
  filter keys with AND semantics automatically, reproducing the
  original's `&&`-chained `b['القسم']===cF && b['النوع']===tF` exactly.
  This was verified directly: a category/type combination that matches
  neither original record correctly returns zero rows (see the
  integration test's "mismatched قسم/نوع combination" check).
- **Sort**: no sort option is ever passed. The original inline
  `renderLibrary()` never called `.sort()` at all (insertion order
  only — confirmed by direct inspection, and documented as such in
  `LibraryRepository.js`'s own file header "SORT" note). `LibraryRepository`
  does expose an additive `sort()` convenience method, but this phase's
  "preserve identical behavior" mandate means it is intentionally **not**
  used here, since doing so would change observable row order versus
  the original.

### The `id`-stamp quirk, and why removing it changes nothing observable

The original inline `saveLibBook()` read:

```js
var obj = collectForm('library');
obj['id']              = obj['id']              || uid();
```

`collectForm('library')` only ever returns the 5 fields declared in
`MAP.library` (`fLibTitle`/`fLibType`/`fLibCat`/`fLibUrl`/`fLibDesc`) —
none of which is `id`. So `obj['id']` was **always** absent at that
line, on both the create path (`data.library.push(obj)`) and the update
path (`data.library[idx] = obj`) — meaning the original code actually
generated a **brand-new random id on every single save, including
every update**, and simply overwrote whatever `id` the record at that
array position previously held.

This migration does not replicate that specific quirk, for two
independent reasons that were each verified directly (see the
integration test's "update path... preserves list position and id"
check):

1. On the **create** path, `LibraryRepository._resolveId()` already
   generates an id exactly the same way (`existing != null ? existing :
   uid()-equivalent`) — no behavior difference at all here, since `obj`
   never had an `id` to begin with either way.
2. On the **update** path, `Repository.prototype.update()`
   unconditionally re-stamps `merged[idField] = existing[idField]` on
   the merged record (Repository.js, `update()`, line: `if
   (this._idField) merged[this._idField] = existing[this._idField];`),
   **regardless of what the patch object contains**. So even if
   `library.js` were changed to pass a freshly-generated `id` in `obj`
   (replicating the original literally), the Repository would silently
   discard it and keep the existing id anyway. There is no way to make
   `update()` change the identifier through this call.

Whether the stored `id` changes on every update was never observable
anywhere in the UI or in any other Module — `id` is never displayed,
never read by `renderLibrary()`'s card markup, and (before this phase)
was never used for anything except being pushed/assigned wholesale into
the array. The only place an `id`'s *stability* now actually matters is
the index-translation layer this phase introduces (§3), and that layer
only ever needs the id to stay constant **within** a single render
pass — which it already did before this phase too (nothing re-ran
`saveLibBook()` mid-render). Net effect: zero observable behavior
change, and a strictly more correct/stable identifier lifecycle than
before.

### Startup ordering

`LibraryRepository.open()` is itself async (it awaits
`LocalStorageAdapter.read()`), so `library.js` calls it once at module
load time and stores the resulting promise
(`libraryRepositoryReadyPromise`). `LocalStorageAdapter.read()`/`write()`
are each a `new Promise(function (resolve, reject) { /* synchronous
body, resolves immediately */ })` — no `setTimeout`, no real I/O
latency — so the whole chain resolves via ordinary microtasks. Per the
HTML spec, the microtask queue drains after each parser-blocking
`<script>` element finishes executing and again before
`DOMContentLoaded` fires, so by the time any
`oninput="renderLibrary()"` / `onclick="saveLibBook()"` handler can
actually run, the Repository is already `ready`. `renderLibrary()` and
both write functions still carry a defensive
`isReady()`/`ensureLibraryRepositoryReady()` guard for the theoretical
case this ordering assumption is ever violated (e.g. a future change
makes the adapter genuinely async), but this is a safety net, not
something the normal code path exercises.

---

## 5. Soft delete — what is, and is not, observably different

`LibraryRepository` is configured with `softDelete: true` (a decision
made in PHASE 5.9.2, not this phase — unchanged). `delete(id)` therefore
stamps `deletedAt` on the record and keeps it in the Repository's
in-memory array and in whatever it persists, instead of physically
removing it the way `data.library.splice(i,1)` used to.

**What stays identical:** `getAll()` and `search()` both exclude
soft-deleted records by default, and `data.library` — which, per a
full-project scan, only `library.js` itself ever reads — is always
populated from one of those two calls. A deleted library item therefore
disappears from the grid exactly as before, and can never reappear. From
every angle a user or another Module can observe, this is
indistinguishable from the old hard delete. The integration test's
delete-path check confirms both halves of this directly: the tombstone
exists in `getAll({includeDeleted:true})` but `exists(id)` — and
everything built on it — correctly hides it.

**What is different, and why it doesn't matter here:** the raw JSON
array persisted under the `library` localStorage key will, over time,
accumulate soft-delete tombstones rather than shrinking, if nothing ever
purges them — an internal storage-size detail, not a behavior change any
Module or user interaction can observe today. This is the same
documented tradeoff already accepted for Documents/Sessions/Tasks (and
Cases/Clients/Children before them) in prior phases, not a new decision
made here.

---

## 6. Deployment note (out of scope for this phase)

`index.html` does not yet load `js/repositories/LibraryRepository.js`,
`js/core/Repository.js`, `js/core/DatabaseService.js`, or
`js/core/LocalStorageAdapter.js` via `<script>` tags ahead of
`js/modules/library.js`. Wiring those tags in is required before this
module runs correctly in a real browser, but editing `index.html` is
explicitly out of scope for this phase's "Modify ONLY library.js"
mandate — the same open item already flagged for Documents, Sessions,
and Tasks in their respective integration reports, still unresolved for
Library here as well. Until that follow-up phase, this module is
correctly proven only via the Node harness
(`js/tests/verify_library_repository_integration.js`), which loads the
same files Node-side exactly as they exist on disk.

`index.html` may also still contain its own `DOMContentLoaded`
migration/read logic touching the same `library` localStorage key
`LibraryRepository` uses. This is a pre-existing, unmodified piece of
`index.html` and is unaffected by this phase — it was already there
before Library had a Repository, and this phase's mandate excludes
editing `index.html`.

---

## 7. Regression testing

`js/tests/verify_library_repository_integration.js` (25 checks, all
passing) exercises, against the real `js/modules/library.js`,
`js/repositories/LibraryRepository.js`, `js/core/Repository.js`,
`js/core/DatabaseService.js`, and `js/core/LocalStorageAdapter.js` files
on disk:

- **Static integrity**: `library.js` parses as valid JS;
  `LibraryRepository.js` and `Repository.js` are confirmed unmodified
  (still export the same public surface).
- **Open**: fresh (empty) localStorage loads zero records; the
  `data.library` mirror matches `LibraryRepository.getAll()`.
- **Validation**: an empty/whitespace-only `العنوان` is still blocked
  before ever reaching the Repository (same DOM-level guard as before).
- **Create**: `saveLibBook()` inserts a new record via
  `LibraryRepository.create()`, auto-generates `id` (no manual stamp
  needed anymore), stamps `تاريخ_الإنشاء`, calls `saveLocal()` and
  `closeModal('modalLibrary')` in the same order as before.
- **Search**: free-text search matches across the full field set,
  identical to the original `Object.values(b).join(' ')` join.
- **Filter**: `#filterLibCat`/`#filterLibType` exact-equality filters
  combine with each other and with search using AND semantics, matching
  the original — including the negative case (a category/type
  combination that matches neither record returns zero rows).
- **Dynamic dropdown**: `#filterLibCat`'s `<option>` list is still
  rebuilt on every render from the distinct `القسم` values present in
  the current data.
- **Drive-link bar**: both the "not connected" and "connected" states
  (driven by the `DRIVE_URL` global) render correctly, exactly as
  before.
- **Sort**: rows render in plain insertion order — confirmed that no
  `.sort()` behavior was introduced, matching the original inline
  `renderLibrary()` exactly.
- **Empty result**: no matches shows `#libEmpty` and clears the grid.
- **Index → record → id translation**: rendered `onclick` handlers
  (`editLibBook`, `deleteLibBook`) embed indexes that `resolveLibIndex()`
  correctly resolves back to the same `data.library` mirror position.
- **Update**: `editLibBook()` stays fully synchronous (no Repository
  call); `saveLibBook()`'s update path preserves the record's id and
  array position via `LibraryRepository.update()`, and correctly
  replaces every mapped field with the new form values (full-record
  replace semantics, matching the original `data.library[idx] = obj`).
- **Delete**: `deleteLibBook()` soft-deletes via
  `LibraryRepository.delete()` — vanishes from the mirror/UI exactly
  like the old hard delete.
- **No sync**: `saveLibBook()`/`deleteLibBook()`'s function bodies
  contain no `ApiService.*` call of any kind, matching the original
  (Library was never synced to begin with).
- **exists()/count()**: spot-checked directly against the live
  Repository after the create/update/delete sequence above, confirming
  both correctly reflect the current soft-delete-aware record set.
- **Additive convenience methods**: `LibraryRepository.filter()`/
  `.sort()`/`.validate()` (not used by `library.js` itself, but part of
  the Repository's public surface) remain usable and unmodified against
  the same data.
- **Persistence / backward compatibility**: a pre-existing legacy-shaped
  `library` localStorage key (generic `id`-based, no Arabic identifier
  field — a first for this migration sequence) loads correctly through
  `LibraryRepository`, and writes continue to land under the same bare
  `library` key with no prefix.
- **Mirror synchronization**: `data.library` is refreshed after every
  Repository open/create/update/delete this module performs, and stays
  in lock-step with `LibraryRepository.getAll()` throughout.

The full pre-existing test suite (`js/tests/*.js`) was also re-run.
`verify_repository_wiring_all.js` (140/140), `verify_cases_repository_
wiring.js` (42/42), `verify_database_pipeline.js` (37/37),
`verify_database_service_core.js` (26/26), `verify_documents_repository.js`
(61/61), `verify_documents_repository_integration.js` (17/17),
`verify_localstorage_adapter.js` (30/30), `verify_templates_repository.js`
(55/55), `verify_sessions_repository_integration.js` (18/18), and
`verify_tasks_repository_integration.js` (21/21) all still pass
unchanged. A handful of pre-existing, unrelated standalone harnesses
(`verify_children_repository.js`, `verify_clients_repository.js`,
`verify_fees_repository.js`, `verify_library_repository.js`,
`verify_sessions_repository.js`, `verify_tasks_repository.js`) fail with
a `MODULE_NOT_FOUND` error unrelated to this phase's change (a broken
relative `require()` path inside those pre-existing test files
themselves) — confirmed present identically before this phase's change
(reproduced against the original, un-migrated archive) and out of scope
for a "Modify ONLY library.js" mandate. This is the same set of
pre-existing failures already documented in the Tasks/Sessions/Documents
integration reports — nothing new is broken by this phase.

---

## 8. Verification — mandate compliance

- [x] Only `js/modules/library.js` modified (directory diff against the
      pre-phase archive confirms this — see §1).
- [x] No Repository file modified (`Repository.js`, `DatabaseService.js`,
      `StorageAdapter.js`, `LocalStorageAdapter.js`,
      `LibraryRepository.js`).
- [x] No Core file modified.
- [x] No other Module modified (`documents.js`, `sessions.js`,
      `tasks.js`, `cases.js`, `clients.js`, `children.js`, `fees.js`,
      `calendar.js`, `dashboard.js`, `templates.js`, `settings.js`).
- [x] No HTML/CSS changed; generated markup for library cards is
      byte-identical to before.
- [x] UI behavior preserved: `open()`, `create()`, `update()`,
      `delete()`, `search()`, `filter()`, `sort()` (absence thereof),
      `exists()`, backward-compatible legacy localStorage loading, and
      mirror synchronization — all verified in §7. Library has no
      `import()`/`export()` UI feature to preserve (no such control
      exists in the original `renderLibrary()`/toolbar — confirmed by
      direct inspection of `index.html`'s Library page markup; the
      Contract-level `Repository.prototype.import()`/`.export()`
      methods themselves remain inherited, unmodified, and available on
      `libraryRepository` regardless, exactly as on every other entity).

---

## Library Repository Integration
## PASS
## Ready For Templates Integration
