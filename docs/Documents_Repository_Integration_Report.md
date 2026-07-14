# Documents_Repository_Integration_Report.md

## PHASE 9 — SUB-PHASE 9.3 — Repository Integration Pilot (Documents Module)

This is the pilot for migrating a live UI Module off the global
`data.<entity>` array and onto its already-wired Repository. Documents was
chosen as the pilot entity (per this phase's own instructions). Only
`js/modules/documents.js` was modified. No Repository, no Core file, no
other Module, and no HTML template was changed.

---

## 1. Scope

**Modified:**

```
js/modules/documents.js
```

**Created:**

```
js/tests/verify_documents_repository_integration.js
docs/Documents_Repository_Integration_Report.md
```

**Read only (not modified — used exactly as they exist today):**

```
js/core/Repository.js
js/core/DatabaseService.js
js/core/StorageAdapter.js
js/core/LocalStorageAdapter.js
js/repositories/DocumentsRepository.js
js/modules/cases.js        (reads data.documents — inspected, not edited)
js/modules/dashboard.js    (reads data.documents — inspected, not edited)
js/ui-utils.js / js/print-utils.js (collectForm/fillForm/val/uid — inspected, not edited)
index.html                 (inspected — see §6 for the one open follow-up item)
```

MD5 comparison against the pre-phase archive confirms every file in the
second and third lists is byte-identical to before this phase; only
`js/modules/documents.js` differs, and the two new files above did not
exist before.

---

## 2. What changed inside documents.js

| Function | Before | After |
|---|---|---|
| `renderDocuments()` | Filtered `data.documents` in plain JS (`Object.values(d).join(' ')` search + `d['نوع_المستند']===ty` filter) | Calls `DocumentsRepository.search({search, filter})` — a **synchronous** Repository read. `data.documents` is refreshed from `DocumentsRepository.getAll()` at the top of the function (also synchronous) and used only to resolve row indexes. |
| `saveDocument()` | Mutated `data.documents[idx]`/`.push(obj)` directly, then `saveLocal()` | `async`. Awaits `DocumentsRepository.create(obj)` or `.update(existingId, obj)` (the only two calls in this file that cross the async boundary), then refreshes the mirror and calls `saveLocal()`/`ApiService.syncRow()`/`renderDocuments()`/`updateBadges()` in the same order as before. |
| `editDocument(i)` | Read `data.documents[i]` | **Unchanged**, still just reads `data.documents[i]`. No Repository call needed — it is a pure read of the already-synced mirror. |
| `deleteDocument(i)` | `data.documents.splice(i,1)` | `async`. Resolves `data.documents[i]` to its `رقم_المستند` id, then awaits `DocumentsRepository.delete(id)` (soft delete under the hood — see §5), then refreshes the mirror. |

`DOCUMENTS_FIELDS`/`DOCUMENTS_MAP` are untouched. HTML templates for the
table rows and mobile cards are byte-identical to before — only the
value fed into `editDocument(N)`/`deleteDocument(N)` changed *how* it is
computed, not the markup itself.

---

## 3. The index → record → id translation layer

The rendered rows still embed plain 0-based indexes
(`onclick="editDocument(3)"`), and index.html's row templates were left
untouched, so the translation had to happen entirely inside
`documents.js`:

1. **Index → record**: `data.documents[i]` (unchanged — `data.documents`
   is kept as a live mirror of `DocumentsRepository.getAll()`, refreshed
   after every Repository read/write this file performs).
2. **Record → id**: `record['رقم_المستند']` (the `DOCUMENTS_ID_FIELD`
   constant, duplicated here to match `DocumentsRepository`'s own private
   constant of the same name — no import of Repository internals).
3. **id → Repository call**: `DocumentsRepository.update(id, patch)` /
   `.delete(id)`.

The one new helper, `resolveDocIndex(list, record)`, is the mirror image
of step 1: it replaces the old `data.documents.indexOf(d)` used inside
`renderDocuments()`'s row-mapping code. That old lookup relied on `d`
being the *exact same object reference* held in `data.documents` — which
broke the moment reads started coming from
`DocumentsRepository.search()`/`getAll()`, both of which return **cloned**
records (Repository Contract §19: reads never hand back a live
reference). `resolveDocIndex()` finds the same position by comparing
`رقم_المستند` values instead of object identity — the smallest change
that keeps the existing `onclick="editDocument(N)"` markup working
unmodified.

---

## 4. Read/write split (as required by this phase)

- **Reads** (`renderDocuments`) use only `DocumentsRepository.getAll()`
  and `.search()` — both synchronous once the Repository is open. No
  `async`/`await` was introduced into `renderDocuments()` or
  `editDocument()`.
- **Writes** (`saveDocument`, `deleteDocument`) are the *only* two
  functions in the file marked `async`, and the *only* two places an
  `await` appears against a Repository call — exactly matching
  `Repository.create()`/`.update()`/`.delete()` being the only
  Promise-returning Contract methods this module needed.

### Startup ordering

`DocumentsRepository.open()` is itself async (it awaits
`LocalStorageAdapter.read()`), so `documents.js` calls it once at module
load time and stores the resulting promise
(`documentsRepositoryReadyPromise`). `LocalStorageAdapter.read()`/`write()`
are each a `new Promise(function (resolve, reject) { /* synchronous body,
resolves immediately */ })` — no `setTimeout`, no real I/O latency — so
the whole chain resolves via ordinary microtasks. Per the HTML spec, the
microtask queue drains after each parser-blocking `<script>` element
finishes executing and again before `DOMContentLoaded` fires, so by the
time any `oninput="renderDocuments()"` / `onclick="saveDocument()"`
handler can actually run, the Repository is already `ready`. Both
`renderDocuments()` and the two write functions still carry a defensive
`isReady()`/`ensureDocumentsRepositoryReady()` guard for the theoretical
case this ordering assumption is ever violated (e.g. a future change
makes the adapter genuinely async), but this is a safety net, not
something the normal code path exercises.

---

## 5. Soft delete — what is, and is not, observably different

`DocumentsRepository` is configured with `softDelete: true` (a decision
made in PHASE 5.8, not this phase — unchanged). `delete(id)` therefore
stamps `deletedAt` on the record and keeps it in the Repository's
in-memory array and in whatever it persists, instead of physically
removing it the way `data.documents.splice(i,1)` used to.

**What stays identical:** `getAll()` and `search()` both exclude
soft-deleted records by default, and `data.documents` — the only thing
`cases.js` and `dashboard.js` ever read — is always populated from one of
those two calls. A deleted document therefore disappears from the table,
the mobile cards, the per-case document list (`cases.js`), and the
sidebar badge count (`dashboard.js`) exactly as before, and can never
reappear. From every angle a user or another Module can observe, this is
indistinguishable from the old hard delete. The integration test's
delete-path check confirms both halves of this directly: the tombstone
exists in `getAll({includeDeleted:true})` but `exists(id)` — and
everything built on it — correctly hides it.

**What is different, and why it doesn't matter here:** the raw JSON
array persisted under the `documents` localStorage key will, over time,
accumulate soft-delete tombstones rather than shrinking, *if* nothing
else in the app ever overwrites that key. In practice something else
usually will: `index.html`'s global `saveLocal()` — still called by every
not-yet-migrated Module (`cases.js`, `clients.js`, etc.) — rewrites *all
nine* localStorage keys, including `documents`, from the current
`data.*` object every time any of those Modules saves. Since
`data.documents` only ever holds the tombstone-free mirror, the next
unrelated save anywhere else in the app will overwrite the `documents`
key with the tombstone-free set — closely reproducing the original
hard-delete storage shape, not the Repository's own richer audit trail.
This is an emergent interaction between an already-migrated Module
(Documents) and eight not-yet-migrated ones sharing one legacy
persistence function, not a defect in `documents.js` itself, and it
produces **zero** observable difference in the UI. It is called out here
so the next Module's migration phase goes in with eyes open, and is
expected to resolve itself naturally as more Modules migrate off
`saveLocal()`.

Separately: because `collectForm('documents')` never includes
`رقم_المستند` (only the six form fields are in `MAP.documents`), the
**original** `saveDocument()` actually generated a brand-new id and a
brand-new `تاريخ_الإنشاء` on every edit, not just on create — replacing
`data.documents[idx]` wholesale. Neither field is ever rendered anywhere
in the UI or read by any other Module, so this was never observable
either. `DocumentsRepository.update()` preserves the *original* id
instead (Contract-mandated: `merged[idField] = existing[idField]`), which
is what let this migration also keep the edited row in the exact same
list position — an outcome that mattered far more for observable
behavior than which internal id string is attached to it. See the
integration test's dedicated "update path... preserves list position and
id" check.

---

## 6. Deployment note (not part of this phase's deliverable)

`DocumentsRepository.js`, `Repository.js`, `DatabaseService.js`, and
`LocalStorageAdapter.js` are still not referenced by any `<script>` tag in
`index.html` (confirmed unchanged from `Repository_Wiring_Audit_Report.md`
§6's own finding). `documents.js` now `require()`s `DocumentsRepository`
when running under Node (which is how the new test harness loads it) and
falls back to `window.DocumentsRepository` in a browser — but that
global will not exist in an actual browser session until `index.html`
adds four more `<script src="...">` tags, ahead of the existing
`<script src="js/modules/documents.js">` tag:

```html
<script src="js/core/Repository.js"></script>
<script src="js/core/StorageAdapter.js"></script>
<script src="js/core/DatabaseService.js"></script>
<script src="js/core/LocalStorageAdapter.js"></script>
<script src="js/repositories/DocumentsRepository.js"></script>
<script src="js/modules/documents.js"></script>
```

Adding these is explicitly **out of scope** for this phase's "Modify ONLY
documents.js" mandate, and `index.html` was therefore left untouched
(confirmed byte-identical via MD5, §1). This mirrors the project's own
established phasing convention (`Repository_Wiring_Audit_Report.md` §6:
"deliberate, still-open follow-on integration step for a later phase")
and is flagged here as the one concrete prerequisite before this pilot
can run in an actual browser, rather than only under the Node
verification harness below.

---

## 7. Verification

`node js/tests/verify_documents_repository_integration.js` — **17/17
checks pass**:

- Static: `documents.js` parses cleanly; `DocumentsRepository.js` and
  `Repository.js` are unmodified and still export what this file
  depends on.
- Fresh load: repository opens with zero records; `data.documents`
  mirror starts as `[]`.
- Create (twice), via `saveDocument()` with `editIdx.documents = -1`:
  routes to `DocumentsRepository.create()`, stamps `رقم_المستند`/
  `تاريخ_الإنشاء`, toasts, calls `saveLocal()`/`ApiService.syncRow()`/
  `closeModal()`/`updateBadges()` in the original order.
- Read: `renderDocuments()` free-text search across the full legacy
  field set; `#filterDocType` exact-equality filter combined with
  search (AND semantics, matching the original
  `(!s||...) && (!ty||...)`); empty-result path shows `#documentsEmpty`
  and clears both lists; rendered `onclick` indexes resolve back to the
  correct mirror position.
- `editDocument(i)`: confirmed synchronous, makes no Repository call,
  reads the mirror only.
- Update, via `saveDocument()` with `editIdx.documents >= 0`: same array
  position preserved, same id preserved (`DocumentsRepository.update()`
  semantics), correct toast.
- Delete, via `deleteDocument(i)`: record vanishes from the mirror/UI;
  confirmed to be a soft delete under the hood (`deletedAt` present via
  `getAll({includeDeleted:true})`) while `exists()`/`getAll()`/`get()`
  all correctly hide it (see §5).
- Confirmed `deleteDocument()` still never calls any `ApiService`
  delete/sync method (pre-existing, intentionally preserved gap).
- Validation: empty `رقم_القضية`/`اسم_المستند` still short-circuits
  before any Repository or async call, exactly as before.
- Backward compatibility: a legacy-shaped `documents` localStorage
  payload (no new audit fields) loads through the Repository unchanged,
  and new writes still land under the same bare `documents` key with no
  prefix.

Existing, unmodified harnesses were re-run to confirm zero regression
elsewhere in the Repository layer:

- `node js/tests/verify_documents_repository.js` → **61/61** pass.
- `node js/tests/verify_repository_wiring_all.js` → **140/140** pass.
- `node js/tests/verify_cases_repository_wiring.js` → **42/42** pass.

MD5 of every other file in the project (`js/core/*.js`,
`js/repositories/*.js`, every other `js/modules/*.js`, `index.html`) was
compared against the pre-phase archive and found byte-identical (§1).

---

## 8. Readiness determination

`js/modules/documents.js` now reads exclusively through
`DocumentsRepository.getAll()`/`.search()` (synchronous) and writes
exclusively through `DocumentsRepository.create()`/`.update()`/`.delete()`
(the only three places this file crosses the async boundary). Every
observable behavior verified before this phase — create, update, delete,
search, filter, persistence key/shape, and the pre-existing
delete-does-not-sync gap — is confirmed unchanged by a dedicated,
independent Node harness (17/17), and zero regression was introduced
anywhere else in the project (MD5-confirmed unmodified; 243/243 checks
across the three pre-existing harnesses still pass). The one open item —
wiring the necessary `<script>` tags into `index.html` — is explicitly
out of this phase's scope and is called out in §6 as the concrete
prerequisite for the next phase.

---

## Repository Integration Pilot

**PASS**

**Ready For Next Module**
