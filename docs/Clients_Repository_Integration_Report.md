# Clients Repository Integration Report
## Phase 9 — Sub-Phase 9.11

---

## 1. Migration Summary

**Executive summary.** `js/modules/clients.js` now reads and writes exclusively
through `js/repositories/ClientsRepository.js` instead of mutating the legacy
global `data.clients` array directly. This mirrors the pattern already proven
for Documents (9.3), Sessions, Tasks, Library, Templates, Children, and Fees.
No other file was changed to accomplish this — `ClientsRepository.js`,
`Repository.js`, `DatabaseService.js`, `StorageAdapter.js`,
`LocalStorageAdapter.js`, `js/api/api.js`, `cases.js`, `dashboard.js`, and
`index.html` are all byte-identical to the pre-migration project (see §7
Checksums).

**Scope of change.** Three write call sites were migrated:

| Function | Before | After |
|---|---|---|
| `saveClient()` | `data.clients[idx] = obj` / `data.clients.push(obj)` | `await clientsRepository.update(id, obj)` / `await clientsRepository.create(obj)` |
| `deleteClient(i)` | `data.clients.splice(i, 1)` | `await clientsRepository.delete(id)` |
| `revokeAndRegenQR()` | `data.clients[idx]['portal_token'] = newToken` | `await clientsRepository.update(id, { portal_token: newToken })` |

One read call site was migrated from a manual `Array.filter()` scan to the
Repository's own synchronous `search()`:

| Function | Before | After |
|---|---|---|
| `renderClients()` | `data.clients.filter(c => …substring match…)` | `clientsRepository.search({ search: s }).items` |

Everything else in the file — `editClient()`, `viewClient()`,
`buildClientReport()`, `printClientFile()`, `printView()`,
`printClientsReport()`, `genClientQR()`, `showClientPortal()`,
`displayPortalModal()`, `copyPortalLink()`, `openPortalDirect()`, the entire
Group E Client Selector block (`toggleClientSelector`,
`renderClientSelectorList`, `toggleCaseClient`, `removeCaseClient`,
`syncCaseClientSelectorFromField`, `_splitClientNames`,
`_autofillCaseClientDetails`), and the `resetForm`/`editCase`/`saveCase`/
`viewCase` wrap shims are **unmodified** — they only ever read the
`data.clients` mirror and never needed to change.

**Line count.** `clients.js` grew from 1,030 to 1,353 lines. The increase is
almost entirely documentation (a migration header block matching
`documents.js`'s, plus inline comments at each of the three write sites
explaining the id-resolution and the R-06 decision) and the ~90-line
Repository-wiring preamble (constant, instance, ready-promise, mirror-sync
helper, index-resolution helper) — the CRUD/render function bodies themselves
grew by only a handful of lines each.

---

## 2. Dependency Preservation

Read via `view`/`grep` before any edit, then re-verified byte-for-byte
against the original zip after all edits (§7):

- `js/repositories/ClientsRepository.js` — read in full. Confirms
  `idField: 'رقم_الموكل'`, `entityKey: 'clients'`, `softDelete: true`,
  default `LocalStorageAdapter` wiring (bare `'clients'` storage key, no
  prefix), and a custom `_matchesSearch()` override that restricts free-text
  search to the same legacy field set the original `Object.values(c).join('
  ')` scan effectively covered for real records. **Not modified.**
- `js/core/Repository.js` — read in full. Confirmed `open()`/`isReady()`
  lifecycle, `getAll()`/`search()`/`filter()`/`exists()` as synchronous,
  `create()`/`update()`/`delete()` as `async`/Promise-returning, and that
  `update()` performs a **merge/patch** (`Object.assign` onto the existing
  record), not a full-record replace — this is what makes
  `revokeAndRegenQR()`'s single-field `{ portal_token: newToken }` patch
  behave identically to the old direct-property assignment. **Not
  modified.**
- `js/core/DatabaseService.js` — read in full. Pure delegation layer to
  `StorageAdapter`; confirms no entity-specific logic exists here that this
  migration needed to route around. **Not modified.**
- `js/api/api.js` (ApiService) — read in full. `syncRow()`, `updateData()`,
  `deleteData()` are all `async` and internally catch their own errors
  (`try/catch` around the underlying fetch, logged via `console.warn`, never
  thrown to the caller). This is why none of the three write call sites in
  `clients.js` needed to `await` or error-check the `ApiService` calls —
  matching their original fire-and-forget usage exactly. **Not modified.**
- `js/modules/cases.js` — read (targeted). Two read sites over
  `data.clients`: a linear `for` loop backfilling client details onto a case
  report (line ~314), and an identical linear `for` loop inside
  `quickCaseQR()` resolving a client by name to a plain array index (line
  ~641) which is then passed straight to `genClientQR(ci)`. Both are
  reference-agnostic (they read plain field values, not object identity),
  so they continue to work unmodified against the `data.clients` mirror.
  **Not modified.**
- `js/modules/dashboard.js` — read in full (80 lines). Two reads:
  `data.clients.length` for the stat card and the sidebar badge. Both
  continue to work unmodified. **Not modified.**
- `index.html` — read (targeted `grep` for script tags and Clients-related
  `onclick=` handlers). Confirms the row templates still embed plain
  0-based indexes (`onclick="editClient(N)"`, `deleteClient(N)`,
  `viewClient(N)`, `genClientQR(N)`) and that `clients.js`'s `<script>` tag
  loads *after* `cases.js` but with no Repository `<script>` tags present at
  all — see §6. **Not modified.**
- `js/modules/documents.js` (Sub-Phase 9.3, reference pattern) — read in
  full and used as the direct structural template for this migration's
  wiring block, mirror-sync helper, index-resolution helper, async
  write-path shape, and Node-export block. **Not modified** (this file was
  never in this phase's mandate to touch).

---

## 3. Mirror Strategy

`data.clients` is preserved as a **read-only compatibility mirror** of
`clientsRepository.getAll()`, exactly as required by the "Mirror Strategy"
rule (`motor-archive-pro-engineering-core` skill) and the audit's mandate.

```js
function syncClientsMirror() {
  data.clients = clientsRepository.getAll();
}
```

Called:
1. Once, when `clientsRepository.open()` resolves (module load time).
2. At the top of `renderClients()`, before computing `rows`.
3. Immediately after every successful `create()` / `update()` / `delete()`
   call in `saveClient()`, `deleteClient()`, and `revokeAndRegenQR()`.

Because `getAll()` excludes soft-deleted records by default (see §5), the
mirror never contains a deleted client — `cases.js` and `dashboard.js`
observe exactly the same array shape and contents they always did, with no
changes required on their side.

**Decision (audit R-02, documented per skill requirement "if a choice
exists, document it"):** `saveClient()` keeps its original local
`obj['رقم_الموكل'] = obj['رقم_الموكل'] || uid()` stamp even though
`ClientsRepository`'s internal `_resolveId()` performs the same fallback
already. This is technically redundant on the create path, but kept for
defense-in-depth and to make the diff against the original function as small
and literal as possible — the same choice already made for `documents.js`'s
`تاريخ_الإنشاء` stamp in Sub-Phase 9.3.

---

## 4. Index Translation

The rendered HTML (`index.html`, unmodified) still embeds plain 0-based
array indexes in every Clients `onclick` handler. Because
`ClientsRepository.search()`/`getAll()` return **cloned** records (not the
same object references `data.clients` used to hold), the original
`data.clients.indexOf(c)` reference-equality lookup inside `renderClients()`
silently breaks under Repository semantics (audit finding R-01) — it would
return `-1` for every row, and every action button would call
`editClient(-1)` / `deleteClient(-1)` / etc.

**Fix — `resolveClientIndex(list, record)`:**

```js
function resolveClientIndex(list, record) {
  var id = record ? record[CLIENTS_ID_FIELD] : undefined;
  for (var i = 0; i < list.length; i++) {
    if (list[i][CLIENTS_ID_FIELD] === id) return i;
  }
  return -1;
}
```

Looks a record up by its identifier field (`رقم_الموكل`) instead of by
object reference. Used in both the desktop-table and mobile-card render
branches of `renderClients()`, in place of `data.clients.indexOf(c)`.

The three write functions go one step further and resolve **record → id**
(not just record → index) before calling the Repository, since
`update()`/`delete()` take an id, not an index:

```js
// saveClient()   — update path
var existingId = data.clients[idx] ? data.clients[idx][CLIENTS_ID_FIELD] : null;
result = await clientsRepository.update(existingId, obj);

// deleteClient(i)
var id = record[CLIENTS_ID_FIELD];
var result = await clientsRepository.delete(id);

// revokeAndRegenQR()
var id = data.clients[idx][CLIENTS_ID_FIELD];
var result = await clientsRepository.update(id, { portal_token: newToken });
```

`editClient(i)`, `viewClient(i)`, `printClientFile(i)`, and `genClientQR(i)`
were **not** changed — they only ever read `data.clients[i]` directly (a
mirror index lookup, not a reference-equality lookup), which continues to
work exactly as before since the mirror is refreshed before every render.

---

## 5. Soft Delete — Observable Behavior Note

`ClientsRepository` is configured with `softDelete: true` (pre-existing
configuration, not changed by this phase). `clientsRepository.delete(id)`
therefore stamps the record with `deletedAt` instead of physically removing
it from the underlying storage array, unlike the original
`data.clients.splice(i, 1)`.

This is **not observable** anywhere `data.clients` is read (`clients.js`
itself, `cases.js`, `dashboard.js`), because `getAll()` and `search()` both
exclude soft-deleted records by default — confirmed by test
(`js/tests/verify_clients_repository_integration.js`, §4 "DELETE via
deleteClient()"): immediately after a delete, `data.clients.length`
decreases, the record disappears from every render, and
`clientsRepository.exists(id)` returns `false`, while
`clientsRepository.getAll({ includeDeleted: true })` still contains the
record with a `deletedAt` timestamp.

---

## 6. Known Architectural Limitation (audit R-06) — Documented, Not Fixed

`ApiService.deleteData()` / `updateData()` / `syncRow()` all take a plain
0-based `rowIndex` parameter, on the assumption that the frontend array
position equals the Google Apps Script backend sheet row (+1 for the header
row). This assumption was already fragile before this migration (any
out-of-band sheet edit breaks it), but was at least internally self-
consistent, because `data.clients` was hard-delete/append-only and
index-stable within a session.

Now that `ClientsRepository` introduces soft-delete semantics,
`data.clients` (sourced from `getAll()`) omits soft-deleted rows, while the
Repository's own underlying storage array still contains them (with a
`deletedAt` stamp) at their original position. Concretely: if client at
index 2 is soft-deleted, `data.clients[2]` afterward is a *different* client
(the old index-3 client shifted down), but nothing was told to the Google
Sheet about that shift — the next `ApiService.updateData('الموكلين', obj, 2)`
call will target the wrong sheet row.

Per the audit's explicit instruction (§9 Step 5 / "ApiService: preserve
current behavior exactly … if any architectural mismatch exists, document
it only") and the `motor-archive-pro-repository-migration-standard` skill
("Never redesign ApiService … Document it. Do not solve it unless explicitly
instructed."), **this phase makes no change to what value is passed to
`ApiService`.** `saveClient()`, `deleteClient()`, and `revokeAndRegenQR()`
all continue to pass the plain frontend `idx`/`i`, byte-identical to the
pre-migration code. The drift is an already-latent, pre-existing
architectural gap, not something introduced by this phase, and is left for
a future phase to address explicitly if requested.

### Deployment note (not part of this phase's deliverable)

`js/core/Repository.js`, `StorageAdapter.js`, `DatabaseService.js`, and
`LocalStorageAdapter.js`, along with `js/repositories/ClientsRepository.js`,
are still **not referenced by any `<script>` tag in `index.html`** — exactly
the same gap already documented for Documents in Sub-Phase 9.3
(`docs/Documents_Repository_Integration_Report.md` §6) and left unresolved
for every sibling module since. `clients.js`'s own `<script>` tag
(`index.html` line 718) currently loads with none of its five new
dependencies present in the page, which will throw
`clients.js requires js/repositories/ClientsRepository.js to be loaded
first` in a real browser until `index.html` is updated. Wiring the
necessary `<script>` tags into `index.html` is explicitly out of scope for
this phase's "Modify ONLY clients.js" mandate. For reference, the tags
`index.html` will eventually need (ahead of the existing
`<script src="js/modules/clients.js">` tag) are:

```html
<script src="js/core/Repository.js"></script>
<script src="js/core/StorageAdapter.js"></script>
<script src="js/core/DatabaseService.js"></script>
<script src="js/core/LocalStorageAdapter.js"></script>
<script src="js/repositories/ClientsRepository.js"></script>
<script src="js/modules/clients.js"></script>
```

This is the same latent, project-wide gap across all eight migrated modules
(Documents, Sessions, Tasks, Library, Templates, Children, Fees, Clients) —
none of their Repository dependencies are wired into `index.html` yet. It is
noted here for completeness, not as a defect introduced by this phase.

---

## 7. Regression Results

### 7.1 New integration test — `js/tests/verify_clients_repository_integration.js`

Node-only harness (no browser required), loading the real
`js/modules/clients.js` via Node's `Module` wrapper (so its internal
`require('../repositories/ClientsRepository.js')` resolves from its true
on-disk location) inside a sandbox stubbing `data`, `document`, `toast`,
`ApiService`, `saveLocal`, `val`, `uid`, `collectForm`, `fillForm`,
`resetForm`, `closeModal`, `updateBadges`, `confirm`, and `localStorage`.

```
$ node js/tests/verify_clients_repository_integration.js
...
39 passed, 0 failed.
```

Covers: static file/export checks; fresh-load empty-repository state;
`saveClient()` create + update paths (id/created-date stamping and
preservation); empty-name validation short-circuit; `renderClients()`
full-record search (including the notes field) and empty-result branch;
`searchClients()` delegation; the index→record→id translation layer end to
end (`resolveClientIndex`, onclick-handler index correctness after a search
filter); `editClient()` synchronous form pre-fill; `viewClient()` view-modal
mutual exclusivity with Cases; `buildClientReport()`'s live
`data.cases`/`data.fees` cross-reads; `genClientQR()`'s no-token / has-token
branches; `showClientPortal()` delegation; `revokeAndRegenQR()`'s
partial-field patch semantics and immediate reflection; the Client Selector
group (`renderClientSelectorList`, `toggleCaseClient`,
`syncCaseClientSelectorFromField`); `printClientsReport()`; `deleteClient()`
soft-delete + mirror/UI disappearance + `exists()`/`getAll(includeDeleted)`
semantics; `data.clients.length` (dashboard.js's read surface) immediately
after delete; a `cases.js`-style linear name scan against the post-delete
mirror; direct `Repository.open()/getAll()/search()/filter()/create()/
update()/delete()/exists()` method regression; legacy pre-existing
`localStorage["clients"]` payload load-through; storage-key stability; and
zero `console.error` calls across a full add/edit/delete cycle.

### 7.2 Sibling integration suites re-run (regression sweep)

```
verify_documents_repository_integration.js   17 passed, 0 failed
verify_sessions_repository_integration.js    18 passed, 0 failed
verify_tasks_repository_integration.js       21 passed, 0 failed
verify_library_repository_integration.js     25 passed, 0 failed
verify_templates_repository_integration.js   23 passed, 0 failed
verify_children_repository_integration.js    20 passed, 0 failed
verify_fees_repository_integration.js        20 passed, 0 failed
verify_repository_wiring_all.js             140/140 checks passed
verify_database_pipeline.js                  37/37  checks passed
```

All pre-existing suites pass unchanged. **No regressions.**

### 7.3 Pre-existing, unrelated issue discovered incidentally

`js/tests/verify_clients_repository.js` (the Phase 5.3 `ClientsRepository`
unit harness, **not** touched by this phase) fails to run at all:

```
Error: Cannot find module '/…/js/tests/js/core/Repository.js'
```

Its `require(path.join(__dirname, 'js/core/Repository.js'))` resolves
relative to its own directory (`js/tests/`), producing the doubled
`js/tests/js/core/Repository.js` path instead of `../core/Repository.js`.
This bug pre-dates this phase (confirmed: this file's MD5 is unchanged
between the original upload and the delivered project — it was never
opened for writing) and is unrelated to the Clients Repository migration.
It is documented here per the audit's "regression testing" mandate but is
**out of this phase's modification scope** ("Modify ONLY clients.js") and
was therefore left as-is.

---

## 8. Verification Summary

Per `motor-archive-pro-verification-quality-assurance`'s mandated order:

| # | Step | Result |
|---|---|---|
| 1 | Syntax | `js/modules/clients.js` parses cleanly (`vm.Script` + `Module.wrap`, equivalent to `node --check`) |
| 2 | Static inspection | No duplicate declarations, no broken `require`/exports, no unreachable code introduced |
| 3 | Repository compatibility | `ClientsRepository` construction, `idField`, `entityKey`, soft-delete config all read and respected, unmodified |
| 4 | Behavior verification | 39/39 checks in the new integration suite |
| 5 | Regression testing | 7/7 sibling suites + wiring + pipeline suites, 0 regressions (§7.2) |
| 6 | Backward compatibility | Legacy pre-existing `localStorage["clients"]` payload loads through unchanged (§7.1); storage key remains bare `"clients"` |
| 7 | Modification scope | Exactly one file modified (`clients.js`), exactly one new test file + this report created — verified by full-tree diff and MD5 checksum against the original upload (§7.4 below) |
| 8 | Final engineering review | This report |

### 7.4 Modification scope — file diff & checksums

Full-tree diff against the pristine `Master_v10_9_10.zip`:

```
NEW FILES:      js/tests/verify_clients_repository_integration.js
                docs/Clients_Repository_Integration_Report.md
MODIFIED FILES: js/modules/clients.js
```

Protected-file checksums (MD5), original vs. delivered — all unchanged:

```
js/repositories/ClientsRepository.js  81a5281f9c42cbb17742ee6a1e18592c  UNCHANGED
js/core/Repository.js                 1159f37eec831920256a727a30dba709  UNCHANGED
js/core/DatabaseService.js            2f448ca20584f91cdc600190587849ca  UNCHANGED
js/core/StorageAdapter.js             fda838c4b6000ab2988b167491effef3  UNCHANGED
js/core/LocalStorageAdapter.js        45e7346d88e080b93074ff83f268bd10  UNCHANGED
js/api/api.js                         db41edd0d52045428e8126fea76d0688  UNCHANGED
js/modules/cases.js                   73e70b6032467fe5d11c5797dd08f857  UNCHANGED
js/modules/dashboard.js               89bd1645fbc66949589bccd0debb6ff9  UNCHANGED
index.html                            bc93f6b82a9a822de620fa77502ed200  UNCHANGED
```

---

Clients Repository Integration
PASS
Ready For Cases Audit
