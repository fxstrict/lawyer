# Cases Repository Integration Report
## Phase 9 — Sub-Phase 9.13

---

## 1. Migration Summary

`js/modules/cases.js` now reads and writes through
`js/repositories/CasesRepository.js` instead of the legacy global
`data.cases` array. This is the eighth module migrated in Phase 9
(following Documents, Sessions, Fees, Tasks, Children, Library,
Templates, and Clients in Sub-Phase 9.11), and executes exactly the
plan laid out in `docs/Cases_Repository_Integration_Audit.md`.

No file other than `js/modules/cases.js` was modified. Verified by a
full recursive checksum diff between the delivered project and the
original upload — see §11.1.

| Function | Before | After |
|---|---|---|
| `renderCases()` | `data.cases.filter(...)` (manual join/lowercase search) | `casesRepository.search({ search, filter })` |
| `saveCase()` | `data.cases[idx] = obj` / `data.cases.push(obj)` (sync) | `await casesRepository.update(id, obj)` / `await casesRepository.create(obj)` (async) |
| `deleteCase()` | `data.cases.splice(i, 1)` (sync, hard delete) | `await casesRepository.delete(id)` (async, soft delete) |
| `editCase()`, `viewCase()`, `quickPrintCase()`, `quickCaseQR()`, `getCaseStats()`, `searchCases()`, `filterCases()`, `buildCaseReport()`, embedded-children functions (×4), `populateCaseDropdown()`, `autofillSessionFromCase()`, `autofillFeeFromCase()`, the three `collectForm`/`fillForm`/`resetForm` overrides | unchanged | unchanged — all read the `data.cases` mirror exactly as before |

`data.cases` itself still exists, still holds plain objects, and is
still what `dashboard.js` and `clients.js` read directly — see §3.

---

## 2. Dependency Preservation

Confirmed by direct diff and by `js/tests/verify_cases_repository_wiring.js`
(re-run, still 42/42 — see §10.2): `CasesRepository.js` requires exactly
`Repository.js`, `DatabaseService.js`, and `LocalStorageAdapter.js`. None
of those three files, nor `CasesRepository.js` itself, were opened for
writing at any point in this phase. `cases.js`'s new
`require('../repositories/CasesRepository.js')` (Node path) /
`window.CasesRepository` (browser path) is the *only* new dependency
this phase introduces, mirroring `clients.js`'s identical Sub-Phase 9.11
wiring exactly.

`js/modules/dashboard.js`, `js/modules/clients.js`,
`js/modules/sessions.js`, `js/modules/documents.js`,
`js/modules/fees.js`, `js/modules/library.js`,
`js/modules/templates.js`, `js/print-utils.js`, and `index.html` are
all byte-identical to the original upload (§11.1).

---

## 3. Mirror Strategy

`dashboard.js` reads `data.cases.filter(...)` and `data.cases.length`
directly (3 call sites); `clients.js`'s `buildClientReport()` reads
`data.cases` directly for its `linkedCases` filter. Neither file is in
this phase's modification scope, so `data.cases` is kept alive as a
plain array, refreshed by a new `syncCasesMirror()` helper:

```js
function syncCasesMirror() {
  data.cases = casesRepository.getAll();
}
```

Called once after `CasesRepository.open()` resolves, and again at the
top of `renderCases()` and immediately after every successful
create/update/delete in `saveCase()`/`deleteCase()`. `getAll()` excludes
soft-deleted records by default (same as the Repository's own read
contract), so `data.cases` never contains a deleted case — dashboard.js
and clients.js see accurate data without knowing Cases moved to the
Repository at all.

---

## 4. Index Translation

`index.html`'s Cases row template embeds five index-dependent handlers
per row — one more than Clients' four:

```
onclick="editCase(N)"   onclick="viewCase(N)"     onclick="quickPrintCase(N)"
onclick="quickCaseQR(N)" onclick="deleteCase(N)"
```

`index.html` was **not modified** (out of scope), so these still receive
a plain 0-based index into `data.cases`. Because `CasesRepository.
search()`/`getAll()` return **cloned** records, the old
`data.cases.indexOf(c)` reference-equality lookup silently breaks (it
always returns `-1` against a clone). A new helper replaces it:

```js
function resolveCaseIndex(list, record) {
  var id = record ? record[CASES_ID_FIELD] : undefined;
  for (var i = 0; i < list.length; i++) {
    if (list[i][CASES_ID_FIELD] === id) return i;
  }
  return -1;
}
```

`renderCases()`'s two `indexOf()` call sites (desktop table + mobile
card list) were replaced with `resolveCaseIndex(data.cases, c)`.
Verified directly in `js/tests/verify_cases_repository_integration.js`
("embeds resolvable indexes in all FIVE per-row onclick handlers").

`editCase(i)`, `viewCase(i)`, `quickPrintCase(i)`, `quickCaseQR(i)`, and
`deleteCase(i)` themselves are unchanged in signature — they still
receive a plain mirror index and index into `data.cases[i]` exactly as
before; only how that index is produced by `renderCases()` changed.

---

## 5. Natural-Key ID — Cases' Structural Difference From Every Prior Module

Every previously migrated module (Documents, Sessions, Fees, Tasks,
Children, Library, Templates, Clients) uses an auto-generated id.
`رقم_القضية` (case number) is **user-entered** and is
`CasesRepository`'s own natural key. This has one real, observable
consequence: `data.cases.push(obj)` never used to fail, but
`Repository.prototype.create()` rejects a second record with a
duplicate `رقم_القضية` (`RepositoryErrorTypes.CONFLICT`).

`saveCase()` surfaces that specific rejection as its own toast, distinct
from the generic failure toast:

```js
if (!result || !result.success) {
  if (result && result.error && result.error.type === 'ConflictError') {
    toast('رقم القضية "' + num + '" مستخدم بالفعل، يرجى استخدام رقم آخر', 'error');
  } else {
    toast('حدث خطأ أثناء حفظ بيانات القضية', 'error');
  }
  return;
}
```

This is a **new, additive** safeguard, not a behavior removal: before
this phase, entering a duplicate case number silently created two rows
sharing one case number, which nothing downstream (Sessions, Documents,
Fees, Children dropdowns) could tell apart. That silent-duplicate
condition is no longer possible after this phase. No test in the
regression suite depended on being able to create a duplicate
`رقم_القضية`.

Verified: `js/tests/verify_cases_repository_integration.js` — "create
path with a رقم_القضية that already exists is now REJECTED", plus a
direct `Repository.create()` conflict check bypassing `saveCase()`
entirely.

---

## 6. Soft Delete — Observable Behavior Note

`CasesRepository` is configured with `softDelete: true` (pre-existing,
not this phase's decision — confirmed unchanged, §11.1). `deleteCase()`
now calls `casesRepository.delete(id)`, which stamps `deletedAt` instead
of physically removing the record, unlike the original
`data.cases.splice(i, 1)`.

This is **not observable** anywhere in the current codebase:
`getAll()`/`search()` both exclude soft-deleted records by default, and
every read of Cases data (`renderCases()`, `dashboard.js`, `clients.js`)
goes through `getAll()`/the `data.cases` mirror derived from it — never
through a raw storage dump. Verified directly:

```js
const includingDeleted = casesRepository.getAll({ includeDeleted: true });
const tombstone = includingDeleted.find(c => c[CASES_ID_FIELD] === deletedId);
assert.ok(tombstone && tombstone.deletedAt); // it IS still in storage...
assert.ok(!casesRepository.exists(deletedId)); // ...but invisible everywhere that matters
```

---

## 7. Known Architectural Limitation — Documented, Not Fixed This Phase

Same class of issue already documented for Clients in Sub-Phase 9.11
(audit R-06 / §14): `ApiService.deleteData('القضايا', i)` sends a
0-based `rowIndex` on the assumption that the frontend array position
equals the backend Google-Sheets row. Now that soft-delete semantics
apply, `data.cases` (sourced from `getAll()`) omits soft-deleted rows
while the Repository's own underlying storage array still contains
them at their original position — so `i` can drift from the true sheet
row after any prior deletion in the same session.

This phase does **not** change what value is passed to `ApiService` for
Cases (still the plain frontend index, exactly as before migration).
The drift is a pre-existing, already-latent architectural gap between
the frontend index model and the backend's row-based sync contract; it
is accepted and documented here, not silently patched, per the audit's
explicit scope note (§14).

### Deployment note (not part of this phase's deliverable)

`index.html` does not yet `<script>`-load `js/core/Repository.js`,
`js/core/DatabaseService.js`, `js/core/LocalStorageAdapter.js`, or
`js/repositories/CasesRepository.js` ahead of
`<script src="js/modules/cases.js">` — confirmed by direct grep, and
true of **every** already-migrated module's script tag, including
Clients. Adding those four tags is what "Modify ONLY cases.js" /
"Do NOT modify … HTML" explicitly forbids for this phase. Until a future
phase adds them, `cases.js` will throw
`"cases.js requires js/repositories/CasesRepository.js to be loaded
first"` if loaded standalone in a real browser — exactly the same
transitional state Clients has been in since Sub-Phase 9.11, and the
Node test harness (`verify_cases_repository_integration.js`) loads
`CasesRepository.js` itself via `require()`, sidestepping this gap
entirely for verification purposes.

---

## 8. Not Implemented — Third Consecutive Phase to Document This Gap

"Children" means two entirely separate things in this codebase: the
embedded `أطفال_القضية` JSON field on a Case record (four
`cases.js`-local functions — `toggleChildrenSection`, `addChildRow`,
`updateChildrenData`, `loadChildrenRows` — completely untouched by this
migration, still threading through `window._pendingChildren` exactly as
before), and the fully separate standalone Children entity
(`data.children`, `js/modules/children.js`, `ChildrenRepository.js`,
migrated in an earlier sub-phase). A `getChildrenSummary(caseId)`
reconciling the two was considered and, consistent with every prior
phase that has touched either side of this boundary, intentionally
**not implemented** — it was never part of this phase's mandate
("preserve completely… existing public API"), and inventing a new public
function is out of scope for a migration phase.

---

## 9. View/Print Backfill Asymmetry — Preserved As-Is

`viewCase()` back-fills missing client detail fields
(`رقم_قومي_الموكل`, phone, address, job, employer) from `data.clients`
onto a **shallow copy** before building its report; `quickPrintCase()`
deliberately does not perform the same backfill. This pre-existing
asymmetry is unchanged by this migration and is now explicitly covered
by regression tests (§10.1) that assert both behaviors independently,
including that `viewCase()`'s backfill never mutates the original
`data.cases[i]` object.

---

## 10. Regression Results

### 10.1 New integration test — `js/tests/verify_cases_repository_integration.js`

```
45 passed, 0 failed.
```

Covers: static file/dependency checks; fresh-load empty state; create
(with dual-stamp `تاريخ_الإنشاء`/`آخر_تحديث`); duplicate-key rejection
(direct and through `saveCase()`); DOM-level required-field validation
(unchanged, runs before any Repository call); full-record free-text
search; combined status/type filter + search (AND semantics, single
`Repository.search()` call); empty-result path; `searchCases()`/
`filterCases()` alias behavior; result-order preservation; all five
index-dependent action buttons in both desktop and mobile render paths;
`editCase()` synchronicity; update path (id/created-date preserved,
updated-date refreshed); `viewCase()`/`quickPrintCase()` backfill
asymmetry; `quickCaseQR()` linked-client resolution (both found and
not-found paths); `getCaseStats()`; the embedded-children JSON
round-trip through `saveCase()`; `populateCaseDropdown()`,
`autofillSessionFromCase()`, `autofillFeeFromCase()`, and the
`resetForm()` override (all four cross-module, natural-key-only
dependencies); soft-delete semantics end-to-end; the pre-existing R-06
index-drift behavior (documented, confirmed unchanged); Repository core
CRUD methods exercised directly; legacy localStorage backward
compatibility; and a full add/edit/delete cycle with zero
`console.error` calls.

### 10.2 Sibling integration suites re-run (regression sweep)

| Suite | Result |
|---|---|
| `verify_cases_repository_wiring.js` | 42/42 passed |
| `verify_children_repository_integration.js` | 20 passed, 0 failed |
| `verify_clients_repository_integration.js` | 39 passed, 0 failed |
| `verify_database_pipeline.js` | 37/37 passed |
| `verify_database_service_core.js` | 26/26 passed |
| `verify_documents_repository.js` | 61/61 passed |
| `verify_documents_repository_integration.js` | 17 passed, 0 failed |
| `verify_fees_repository_integration.js` | 20 passed, 0 failed |
| `verify_library_repository_integration.js` | 25 passed, 0 failed |
| `verify_localstorage_adapter.js` | 30/30 passed |
| `verify_repository_wiring_all.js` | 140/140 passed |
| `verify_sessions_repository_integration.js` | 18 passed, 0 failed |
| `verify_tasks_repository_integration.js` | 21 passed, 0 failed |
| `verify_templates_repository.js` | 55/55 passed |
| `verify_templates_repository_integration.js` | 23 passed, 0 failed |

**Zero regressions across every suite that runs.**

### 10.3 Pre-existing, unrelated issue re-confirmed (not caused by this phase)

`verify_children_repository.js`, `verify_clients_repository.js`,
`verify_fees_repository.js`, `verify_library_repository.js`,
`verify_sessions_repository.js`, and `verify_tasks_repository.js` (the
older, Phase-5-era per-repository unit harnesses — **not** the
`_integration.js` suites, and **not** touched by this phase) all fail to
run, e.g.:

```
Error: Cannot find module '/…/js/tests/js/core/Repository.js'
```

Each does `require(path.join(__dirname, 'js/core/Repository.js'))`,
which resolves relative to `js/tests/` itself, producing a doubled
`js/tests/js/core/...` path instead of `../core/...`. This exact issue
and root cause was already discovered and documented for
`verify_clients_repository.js` in the Sub-Phase 9.11
`Clients_Repository_Integration_Report.md` §7.3; this phase confirms it
also affects five sibling harnesses for other, already-migrated
entities. It pre-dates this phase (all six files are byte-identical to
the original upload, §11.1) and is unrelated to the Cases migration. It
is documented here per the audit's regression-testing mandate but is
out of this phase's modification scope ("Modify ONLY cases.js") and was
therefore left as-is.

---

## 11. Verification Summary

- ✅ Repository compatibility (CRUD, search, filter, sort order, validation)
- ✅ Soft delete behavior (tombstoned in storage, invisible everywhere it matters)
- ✅ Mirror synchronization (`data.cases` always reflects `getAll()`)
- ✅ Index resolution (`resolveCaseIndex`, all five action buttons, both render paths)
- ✅ Dashboard compatibility (file untouched, reads unaffected)
- ✅ Clients compatibility (file untouched, `linkedCases` reads unaffected)
- ✅ Children compatibility (embedded-JSON sub-system untouched; standalone entity untouched)
- ✅ Sessions / Documents / Fees compatibility (`populateCaseDropdown`, `autofillSessionFromCase`, `autofillFeeFromCase` unchanged, natural-key-only reads)
- ✅ Library / Templates compatibility (zero Cases cross-references, confirmed by grep)
- ✅ QR generation (`quickCaseQR` linked-client resolution, both paths)
- ✅ Printing (`quickPrintCase`, including the preserved backfill asymmetry with `viewCase`)
- ✅ ApiService synchronization (`syncRow`/`deleteData` call sites and arguments unchanged in shape)
- ✅ Backward compatibility (legacy localStorage shape loads unchanged; storage key unchanged)
- ✅ Regression (all 15 sibling `_integration`/core suites re-run, zero regressions)
- ✅ Directory diff / modification scope (§11.1 — exactly one file modified, one new file added)
- ✅ Checksums (§11.1)

### 11.1 Modification scope — file diff & checksums

Full recursive `md5sum` comparison, original upload vs. delivered
project, every file in the archive:

```
63c63
< 73e70b6032467fe5d11c5797dd08f857  ./js/modules/cases.js
---
> db24a1ba7fcebe34b20c4ee02054a6c8  ./js/modules/cases.js
83a84
> 1af91c40f8fb39ab433924d38e60dfb9  ./js/tests/verify_cases_repository_integration.js
```

Exactly one line changed (`js/modules/cases.js`, the only file this
phase was permitted to modify) and exactly one line added (the new test
harness). Every other file in the project — including
`js/repositories/CasesRepository.js`, `js/core/Repository.js`,
`js/core/DatabaseService.js`, `js/core/StorageAdapter.js`,
`js/core/LocalStorageAdapter.js`, `js/api/api.js`, `index.html`,
`dashboard.js`, `clients.js`, `documents.js`, `sessions.js`,
`children.js`, `fees.js`, `library.js`, `templates.js`,
`print-utils.js`, and every other sibling test/report file — is
byte-identical to the original upload.

`js/modules/cases.js`: 849 → 1210 lines (+361, mostly the rewritten
header doc-comment, the Repository-wiring block, and the migrated
`saveCase()`/`deleteCase()` bodies with their expanded doc-comments;
~391 lines differ from the original in a line-by-line diff, reflecting
the header rewrite rather than logic churn — `editCase`, `viewCase`,
`quickPrintCase`, `quickCaseQR`, `getCaseStats`, `searchCases`,
`filterCases`, `buildCaseReport`, all four embedded-children functions,
`populateCaseDropdown`, `autofillSessionFromCase`,
`autofillFeeFromCase`, and the three `collectForm`/`fillForm`/
`resetForm` overrides are byte-identical to the original, apart from
one one-line fix to the pre-existing `saveCase` children-JSON wrapper —
see §12).

---

## 12. One Necessary Fix Beyond the Audit's Plan

`cases.js`'s own pre-existing children-JSON `saveCase` wrapper
(`var _origSaveCase = saveCase; saveCase = function() { … ;
_origSaveCase(); };`) called the wrapped function without returning its
result. This was harmless while `saveCase()` was synchronous, but once
the base `saveCase()` became `async` (this phase, required for
`Repository.create()`/`update()`), the missing `return` meant
`saveCase()` as exported from this file resolved *before* the
create/update actually completed — a real, silent race condition
discovered by this phase's own test harness (`await saveCase()` observed
an empty mirror immediately after a successful create).

Fixed with a one-word change, entirely inside `cases.js`:

```diff
- _origSaveCase();
+ return _origSaveCase();
```

This has no effect on the existing `onclick="saveCase()"` HTML handler
(ignores any return value either way) or on `clients.js`'s own further
wrap of `saveCase` (out of scope, unchanged, also ignores the return
value) — both remain fire-and-forget from the browser's point of view,
exactly as before this phase. It only matters to a caller that actually
awaits `saveCase()`, which is new behavior this phase introduces and
which the regression suite now exercises directly.

---

## Cases Repository Integration

**PASS**

Ready For Full Repository Migration Verification
