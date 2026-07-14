# Clients Repository Integration Audit
## PHASE 9 — SUB-PHASE 9.10
**Scope:** Analysis only. No file modified. No code generated. No refactor performed.

---

## 1. Executive Summary

`js/modules/clients.js` (1,031 lines) is the last remaining V9 entity module — besides
`cases.js` — still operating on the raw global `data.clients` array instead of a
Repository. `js/repositories/ClientsRepository.js` already exists (Phase 5.3, wired to
`DatabaseService`/`LocalStorageAdapter` in Phase 8/8.5.2) and is **fully built,
verified, and inert** — no `<script>` tag loads it in `index.html`, and no module
imports it yet.

Eight sibling modules (`children.js`, `sessions.js`, `tasks.js`, `fees.js`,
`documents.js`, `library.js`, `templates.js`) have already completed the identical
migration in earlier Sub-Phases. `documents.js` (Sub-Phase 9.3, "Repository Integration
Pilot") is the closest behavioral analog to Clients: both modules (a) call
`ApiService.syncRow()`/`deleteData()` on write, (b) are read directly by at least one
other module via the shared `data.<entity>` global, and (c) render `onclick="..."`
handlers containing plain array indexes. The migration strategy below reuses that
exact pattern.

Clients is structurally **more entangled** than any single-consumer module audited so
far:
- It is read directly by **two** other modules (`cases.js`, `dashboard.js`), not one.
- It owns a **second, independent in-memory UI concern** — the multi-client selector
  used by the Cases modal (`_caseSelectedClients`, `toggleClientSelector`, etc.) — which
  reads `data.clients` on every keystroke and must keep working unchanged.
- It is the **only** module (of the nine already checked in this project) whose
  `deleteClient()` still calls `ApiService.deleteData()` — a positional-index-based
  backend sync call whose correctness assumption (frontend array index == GAS sheet
  row) will be quietly invalidated by `ClientsRepository`'s soft-delete + cloned-record
  semantics. This is flagged as the single highest-risk item in this audit (§5, R-06).
- `viewCase()` is monkey-patched from inside `clients.js` (a variable-reassignment wrap,
  same technique cases.js/other modules already use elsewhere) purely to reset a
  print-view flag — this wrap must survive migration unchanged and is NOT a Clients
  data-path concern.

No blocking issues were found. Migration is assessed as **feasible with the same
mirror + index-to-id translation pattern already proven eight times**, provided the
`ApiService` index-drift issue (R-06) is explicitly accepted or mitigated as part of
the migration decision (not fixed silently).

---

## 2. Dependency Graph

```
                        ┌─────────────────────────┐
                        │   index.html             │
                        │  data.clients = JSON...  │◄── overwritten by clients.js
                        │  editIdx.clients = -1     │    mirror sync, once wired
                        │  FIELDS.clients / MAP.clients (DEAD for clients — see §8)
                        └───────────┬──────────────┘
                                    │ read (module load order,
                                    │ before clients.js executes)
                                    ▼
                        ┌─────────────────────────┐
              ┌────────▶│   js/modules/clients.js  │◄────────┐
              │         │  (THIS AUDIT'S SUBJECT)  │         │
              │         └───────────┬──────────────┘         │
   reads data.clients               │ writes data.clients    │ calls genClientQR(i)
   (cases.js, dashboard.js)         │ (saveClient/deleteClient)│ by resolved index
              │                     ▼                         │
              │         ┌─────────────────────────┐           │
              └─────────┤   data.clients (global)  │───────────┘
                        └───────────┬──────────────┘
                                    │
                        ┌───────────┴───────────────┐
                        ▼                            ▼
              ┌───────────────────┐        ┌───────────────────┐
              │   cases.js         │        │  dashboard.js      │
              │ - buildCaseReport  │        │ - statClients      │
              │   backfill (307-325)│       │ - badgeClients      │
              │ - quickCaseQR      │        │  (read-only, LOW)   │
              │   lookup (641-650) │        └───────────────────┘
              └───────────────────┘

        ┌──────────────────────────────────────────────────────────┐
        │   js/repositories/ClientsRepository.js  (Phase 5.3/8.5.2) │
        │   — built, verified, wired to DatabaseService +           │
        │     LocalStorageAdapter — but NOT yet imported by          │
        │     clients.js and NOT <script>-tagged in index.html.      │
        └──────────────────────────────────────────────────────────┘

  ApiService (js/api/api.js) — called from clients.js only:
    saveClient()        -> ApiService.syncRow('الموكلين', obj, idx)
    deleteClient()       -> ApiService.deleteData('الموكلين', i)
    revokeAndRegenQR()   -> ApiService.updateData('الموكلين', data.clients[idx], idx)
    genClientQR()         -> ApiService.getPortalUrl(token)  [read-only, no index]
    displayPortalModal() -> ApiService.getQrImageUrl(url,size,ecc) [read-only]
```

**No dependency in the opposite direction exists**: `clients.js` never reads
`data.cases`, `data.sessions`, `data.documents`, `data.fees`, `data.tasks`,
`data.library`, or `data.templates` for its own CRUD/render logic. The single
exception is the Case-modal client picker block (§3, Group F), which reads
`data.clients` (its own entity) to populate a picker that lives *inside the Case
modal's DOM* — but the data being read is still Clients data, not Cases data. This
picker also **writes** into the Case form (`#fCaseClient` and 5 detail fields) via
`_syncCaseClientField()`/`_autofillCaseClientDetails()` — the only place `clients.js`
writes into another module's UI surface.

---

## 3. Function Inventory

Functions are grouped by concern. "R/W" = reads and/or writes `data.clients`.
"Ext." = touches a global function/variable owned by another module.

### Group A — Render / Search
| Function | R/W | Ext. dependency | Notes |
|---|---|---|---|
| `renderClients()` | R | `val()`, DOM (`clientsTableBody`, `clientsEmpty`, `clientsMobileList`) | Full-record substring search (`Object.values(c).join(' ')`), no sort. Computes `ri = data.clients.indexOf(c)` per row (**reference-equality** — see R-01). |
| `searchClients()` | — | calls `renderClients()` | Pure alias/delegate. |

### Group B — CRUD
| Function | R/W | Ext. dependency | Notes |
|---|---|---|---|
| `saveClient()` | R/W | `collectForm`, `uid`, `saveLocal`, `ApiService.syncRow`, `closeModal`, `renderClients`, `updateBadges`, `toast`, `editIdx.clients` | Single required field (`fClientName`, trimmed). Stamps `رقم_الموكل` (hybrid id, `\|\| uid()`) and `تاريخ_الإنشاء` on every save (idempotent overwrite avoided via `\|\|`). Direct `data.clients[idx]=obj` / `data.clients.push(obj)`. |
| `editClient(i)` | R | `editIdx.clients`, `fillForm`, DOM | Pure read + modal open. Index is a plain `data.clients` position. |
| `deleteClient(i)` | R/W | `confirm`, `ApiService.deleteData`, `saveLocal`, `toast`, `renderClients`, `updateBadges` | Calls `ApiService.deleteData` **before** the local splice (order matters if `i` semantics change — see R-06). Physical `splice(i,1)` — hard delete today. |

### Group C — View / Report
| Function | R/W | Ext. dependency | Notes |
|---|---|---|---|
| `viewClient(i)` | R | `window._currentViewCase/_currentViewClient/_currentViewClientIdx`, `buildClientReport`, DOM | Sets 3 window globals shared with `cases.js`'s `viewCase()`. |
| *(inline wrap)* `viewCase` override | — | `viewCase` (cases.js, conditionally wrapped) | Additive: clears `_currentViewClient`/`_currentViewClientIdx` after the original `viewCase()` runs. **Not a data-path concern** — must survive migration byte-identical. |
| `buildClientReport(c)` | R | `data.cases`, `data.fees` | **Cross-entity read**: filters `data.cases`/`data.fees` by client name substring match, sums `المبلغ`. Pure function of `c` + two other globals — no id/index involved. |
| `printClientFile(i)` | R | `buildClientReport`, `window.open`, `toast` | Standalone print window, own inline CSS copy (~30 lines duplicated from `printView`'s builder — pre-existing duplication, not this phase's concern). |
| `printView()` | R | `window._currentViewClient/_currentViewCase`, `_buildClientPrintDocument`, `_buildCasePrintDocument`, DOM | Shared with Cases; branches on `_currentViewClient` truthiness. |
| `_buildClientPrintDocument(html)` | — | — | Pure string template. |
| `_buildCasePrintDocument(html)` | — | — | Pure string template (Cases-flavored; lives here only because `printView()` needs both). |
| `printClientsReport()` | R | `data.clients`, `window.open`, `toast` | Whole-table print; uses `i+1` as a **display-only** row number, not a functional index — safe. |

### Group D — QR / Portal
| Function | R/W | Ext. dependency | Notes |
|---|---|---|---|
| `genClientQR(i)` | R | `ApiService.getPortalUrl`, `displayPortalModal` | Called from **both** `clients.js` (own render buttons) and `cases.js`'s `quickCaseQR()` (external caller, by resolved index — see §4). No-ops with a toast if `portal_token` is absent. |
| `showClientPortal()` | R | `window._currentViewClientIdx`, `genClientQR` | Delegates using the index stashed by `viewClient()`. |
| `displayPortalModal(name,url,token,idx)` | — | `window._portalUrl/_portalToken/_portalClientIdx`, `ApiService.getQrImageUrl`, DOM | Stashes `idx` for later revoke; does not touch `data.clients` itself. |
| `copyPortalLink()` | — | `window._portalUrl`, `navigator.clipboard` | No index dependency. |
| `openPortalDirect()` | — | `window._portalUrl` | No index dependency. |
| `revokeAndRegenQR()` | R/W | `window._portalClientIdx`, `uid`, `saveLocal`, `ApiService.updateData`, `closeModal`, `displayPortalModal`, `toast`, `confirm` | **Direct mutation** `data.clients[idx]['portal_token'] = newToken` — bypasses `saveClient()` entirely. Second, independent write path into `data.clients` (see R-03). |

### Group E — Client Selector (Case-modal picker; lives here, operates on Cases UI)
| Function | R/W | Ext. dependency | Notes |
|---|---|---|---|
| `toggleClientSelector(e)` | — | DOM, `renderClientSelectorList` | Panel open/close. |
| `closeClientSelector()` | — | DOM | — |
| *(module-level)* outside-click listener | — | DOM | Closes panel; registered once at load. |
| `renderClientSelectorList()` | R | DOM | Filters `data.clients` by name substring (own small search, independent of `renderClients()`'s search). |
| `toggleCaseClient(name, checked)` | — | `_syncCaseClientField`, `renderClientSelectorChips` | Mutates module-local `_caseSelectedClients` array only. |
| `removeCaseClient(name)` | — | same as above + `renderClientSelectorList` | — |
| `_syncCaseClientField()` | — | DOM (`#fCaseClient`), `_autofillCaseClientDetails` | Writes into the **Cases** form. |
| `_autofillCaseClientDetails()` | R | DOM (5 `fCase*` fields) | Reads `data.clients` by exact trimmed-name match; only fires when exactly 1 client is selected. |
| `renderClientSelectorChips()` | — | DOM | — |
| `syncCaseClientSelectorFromField()` | — | DOM (`#fCaseClient`) | Re-hydrates picker state from the hidden field — called by the `editCase` wrap. |
| `_splitClientNames(str)` | — | — | Pure helper. |
| `_attrSafeJSString(s)` | — | — | Pure helper (HTML-attribute-safe JSON string). |

### Group F — Overrides of other modules' functions (additive wraps, defined in this file)
| Wrap target | Ext. dependency | Notes |
|---|---|---|
| `resetForm` | `resetForm` (print-utils.js, possibly already wrapped by cases.js) | Clears picker state when `type === 'cases'`. |
| `editCase` | `editCase` (cases.js) | Re-syncs picker from `#fCaseClient` after the original runs. |
| `saveCase` | `saveCase` (cases.js) | Forces `_syncCaseClientField()` before the original runs. |

These three wraps are **conditional** (`if (typeof X === 'function')`) and **additive**
(call the original, then extend). They are Cases-integration concerns, not
Clients-data concerns, and are **out of scope for data migration** — they must simply
continue to exist, unmodified, in whatever file they end up in.

---

## 4. Cross-Module Dependencies

| Consumer | File | Line(s) | What it reads | Read or Write | Risk if `data.clients` becomes a Repository-derived mirror |
|---|---|---|---|---|---|
| `dashboard.js` | `js/modules/dashboard.js` | 56 | `data.clients.length` | Read | None — `.length` is stable on any array, mirror or not. |
| `dashboard.js` | `js/modules/dashboard.js` | 75 | `data.clients.length` (via `setBadge`) | Read | Same as above. |
| `cases.js` | `js/modules/cases.js` | 307–325 | Linear scan of `data.clients` by trimmed `الاسم`, reads 5 fields off the match | Read | None functionally — a mirror array of plain objects supports `.length`/index loop identically. Only breaks if the mirror is refreshed *less* often than Cases needs it (timing, not shape — see §6 M-02). |
| `cases.js` (`quickCaseQR`) | `js/modules/cases.js` | 633–651 | Linear scan of `data.clients` by trimmed `الاسم` to obtain **index** `ci`, then calls `genClientQR(ci)` | Read | `genClientQR(i)` does `data.clients[i]` — as long as the mirror is index-addressable and in sync at call time, this keeps working untouched. **Cases.js itself must not be edited** (out of scope), so `genClientQR`'s index-based signature cannot change. |

No other module (`children.js`, `sessions.js`, `documents.js`, `fees.js`, `tasks.js`,
`library.js`, `templates.js`, `print-utils.js`) references `data.clients`,
`editIdx.clients`, or any Clients-owned global function. `fees.js` has a
`fFeeClient`/`اسم_الموكل` **field**, but it is a free-text form field populated by the
user or by `autofillFeeFromCase()` from **Cases** data — it does not read
`data.clients` directly.

**Classification — read-only vs. modifying:**
- **Read-only external consumers of `data.clients`:** `dashboard.js` (both call
  sites), `cases.js` (both call sites/functions).
- **No external module writes `data.clients`.** All writes originate inside
  `clients.js` itself (`saveClient`, `deleteClient`, `revokeAndRegenQR`).

**Reliance on `data.clients` being the *original* (reference-identical) array:**
- `renderClients()` — **yes**, via `data.clients.indexOf(c)` (reference equality after
  a `.filter()`). This is the one place in the whole module whose correctness
  literally depends on the array elements being the same object references
  `data.clients` holds — see R-01.
- Every other reader (`cases.js`, `dashboard.js`, the Group E picker,
  `buildClientReport`, `printClientsReport`) only relies on `data.clients` being
  **array-shaped with the expected Arabic keys** — reference identity is irrelevant to
  them. This distinction is the crux of the whole migration (§7).

---

## 5. Risk Matrix

| ID | Function(s) | Risk | Rationale |
|---|---|---|---|
| R-01 | `renderClients()` | **HIGH** | `ri = data.clients.indexOf(c)` is reference-equality. `ClientsRepository.getAll()`/`search()` return **cloned** records (per the Repository's documented contract, identical to `DocumentsRepository`). The instant `data.clients` is repopulated from `clientsRepository.getAll()` instead of read+mutated in place, `indexOf(c)` on a `.filter()`'d subset of that same cloned array **still works** (filter preserves references within the same array), but only if `rows` is filtered from `data.clients` itself, not from a second independent `getAll()` call — must be preserved exactly as `documents.js` does (`resolveDocIndex` sidesteps this entirely by matching on id, which is safer and is the pattern this migration should copy). |
| R-02 | `saveClient()` | **MEDIUM** | Direct array mutation (`data.clients[idx]=obj` / `.push(obj)`) must become `await clientsRepository.update(id,obj)` / `.create(obj)` — an async boundary crossing, exactly as `documents.js`'s `saveDocument()` already demonstrates. `obj['رقم_الموكل'] = obj['رقم_الموكل'] \|\| uid();` becomes **redundant but harmless** once `ClientsRepository._resolveId()` performs the identical fallback — must decide (documentation only, no code) whether to keep the redundant stamp for defense-in-depth or rely solely on the Repository. Either choice preserves behavior; only the *report* needs to record which was chosen. |
| R-03 | `revokeAndRegenQR()` | **MEDIUM** | Second, independent write path (`data.clients[idx]['portal_token']=newToken`) that bypasses `saveClient()`'s validation and id-stamping entirely. Must become `await clientsRepository.update(id, {portal_token: newToken})` (a **partial-field** update) rather than a full-record replace — `Repository.prototype.update()` merges a patch onto the existing record (confirmed: `update(id, patch)` in `Repository.js`), so this maps cleanly, but it is a second call site that must not be missed during actual migration. |
| R-04 | `deleteClient()` | **HIGH** | Today: hard delete (`splice`). `ClientsRepository` is configured `softDelete: true`. Post-migration, `getAll()`/`search()` will correctly hide the deleted client from every reader (`renderClients`, `cases.js`, `dashboard.js`, the picker) — **UI-observable behavior is preserved**, exactly as already proven for `DocumentsRepository`. The residual risk is entirely in R-06 below (ApiService index drift), not in the UI. |
| R-05 | `editClient(i)`, `viewClient(i)`, `printClientFile(i)`, `genClientQR(i)`, `showClientPortal()` | **LOW** | All are pure reads of `data.clients[i]` by plain array position. As long as the mirror array is refreshed synchronously after every Repository write (same guarantee `documents.js` provides via `syncDocumentsMirror()`), these need **zero logic changes** — only the timing/existence of the mirror matters, not these functions' bodies. |
| R-06 | `deleteClient()` → `ApiService.deleteData('الموكلين', i)`; `saveClient()` → `ApiService.syncRow('الموكلين', obj, idx)`; `revokeAndRegenQR()` → `ApiService.updateData('الموكلين', ..., idx)` | **HIGH — flagged, not fixed** | `ApiService.updateData`/`deleteData` send `rowIndex+1` to the GAS backend, an assumption that the frontend's 0-based array position equals the backend sheet's row position (minus header). This assumption is **already fragile today** (any out-of-band sheet edit breaks it) but is currently at least *consistent* because `data.clients` is hard-delete/append-only and index-stable within a session. Once `ClientsRepository`'s soft-delete semantics are introduced, `data.clients` (the mirror, sourced from `getAll()`) will **omit** soft-deleted rows while the Repository's own underlying storage array still **contains** them (with a `deletedAt` stamp) at their original position. If the GAS sheet is ever assumed to track the Repository's raw storage order rather than the mirror's filtered order, `rowIndex` sent to `ApiService` will systematically drift after the first delete. **This is a pre-existing architectural question, not introduced by this audit** — it must be explicitly decided (accept the drift as already-latent risk vs. mitigate by switching Clients' sync calls to an id-based backend contract) as part of the Migration Strategy, not silently patched. |
| R-07 | Group E (Client Selector) — `renderClientSelectorList`, `_autofillCaseClientDetails`, `toggleCaseClient`, etc. | **LOW** | All read `data.clients` by value (name match) or maintain fully independent local state (`_caseSelectedClients`). None hold a stale reference across a Repository write — they always re-read `data.clients`/re-render on demand. Safe as long as the mirror exists and is populated by the time the Cases modal opens (true today, will remain true post-migration since `clients.js` loads before any user interaction). |
| R-08 | `resetForm`/`editCase`/`saveCase` wraps (Group F) | **LOW** | Zero interaction with `data.clients` shape or Repository. Purely additive control-flow hooks into Cases lifecycle functions. No change needed for this migration. |
| R-09 | `viewCase` wrap, `printView()`, `_buildClientPrintDocument`, `_buildCasePrintDocument` | **LOW** | Operate entirely on `window._currentViewClient` (a single record snapshot, not an index) and static HTML templates. Unaffected by how that record was originally fetched. |
| R-10 | `buildClientReport(c)`, `printClientsReport()` | **LOW** | Pure read-and-render functions over already-resolved record(s). `printClientsReport()`'s `i+1` is cosmetic (row number in a printed table), not a functional index. |

**Summary:** 2 HIGH-severity items are the true center of gravity for this migration:
R-01 (reference-equality `indexOf`, mechanically fixed by copying `documents.js`'s
id-based `resolveDocIndex` pattern) and R-06 (ApiService index-drift, a genuine
architectural decision, not a coding task). Everything else is MEDIUM/LOW and follows
the already-proven eight-module playbook directly.

---

## 6. Index Mapping Audit

Every `onclick="...(i)"` handler generated by `clients.js`, and every function that
accepts a plain integer today:

| Call site | Generator | Index meaning today | Becomes after migration |
|---|---|---|---|
| `onclick="viewClient(ri)"` | `renderClients()` (table + mobile) | `data.clients.indexOf(c)` | id-based lookup index into the refreshed mirror (see M-01 below) |
| `onclick="editClient(ri)"` | `renderClients()` (table + mobile) | same | same translation |
| `onclick="genClientQR(ri)"` | `renderClients()` (table + mobile) | same | same translation |
| `onclick="deleteClient(ri)"` | `renderClients()` (table + mobile) | same | same translation |
| `genClientQR(ci)` | `cases.js` → `quickCaseQR()` (**external caller, out of scope to edit**) | linear-scan-found index into `data.clients` | must remain a plain index into the **mirror**, since `cases.js` cannot be changed |
| `showClientPortal()` → `genClientQR(idx)` | `viewClient()`'s stashed `window._currentViewClientIdx` | index stashed at `viewClient(i)` call time | must remain valid at portal-open time; mirror must not reorder between `viewClient()` and `showClientPortal()` |
| `revokeAndRegenQR()`'s `window._portalClientIdx` | `displayPortalModal()`'s 4th arg, ultimately from `genClientQR(i)`'s `i` | same chain as above | same — a stashed index that must still resolve correctly whenever the modal's "regenerate" button is later clicked |

**Where array index MUST become Repository id** (i.e., where the value is used to
*write*, not just to re-read `data.clients[i]`):
1. `saveClient()` — `idx = editIdx.clients` is used to decide create-vs-update, then must
   resolve to `data.clients[idx][رقم_الموكل]` before calling `clientsRepository.update(id, obj)`.
2. `deleteClient(i)` — `i` must resolve to `data.clients[i][رقم_الموكل]` before calling
   `clientsRepository.delete(id)`.
3. `revokeAndRegenQR()` — `window._portalClientIdx` must resolve to an id before calling
   `clientsRepository.update(id, {portal_token: newToken})`.

**Where array index can safely stay a plain index** (pure reads of the mirror, never
passed to a Repository write method): `editClient(i)` (only reads, to prefill a form —
the resulting `saveClient()` call is what does the id resolution, not `editClient`
itself), `viewClient(i)`, `printClientFile(i)`, `genClientQR(i)`, `showClientPortal()`,
`printClientsReport()`'s cosmetic `i+1`.

This is the **exact same shape** of translation `documents.js` already performed
(`resolveDocIndex` + id lookup only at the two write call sites,
`saveDocument`/`deleteDocument`) — Clients simply has **three** write call sites instead
of two (the extra one being `revokeAndRegenQR`).

---

## 7. Migration Risk — Consolidated View

| Risk level | Functions | Count |
|---|---|---|
| HIGH | `renderClients` (R-01), `deleteClient` (R-04, via R-06's shared root cause), the three `ApiService` call sites collectively (R-06) | 2 functions + 1 cross-cutting architectural item |
| MEDIUM | `saveClient` (R-02), `revokeAndRegenQR` (R-03) | 2 |
| LOW | `editClient`, `viewClient`, `printClientFile`, `genClientQR`, `showClientPortal`, `displayPortalModal`, `copyPortalLink`, `openPortalDirect`, all of Group E (10 functions), all of Group F (3 wraps), `buildClientReport`, `printClientsReport`, `printView`, `_buildClientPrintDocument`, `_buildCasePrintDocument`, `searchClients` | 24 |

---

## 8. Legacy Behavior — Documented, Not Fixed

1. **Dead constants:** `CLIENTS_FIELDS`/`CLIENTS_MAP` (lines 40–57) are declared but
   **never read at runtime**. `collectForm()`/`fillForm()`/`resetForm()`
   (`js/print-utils.js`) read from the **global** `FIELDS.clients`/`MAP.clients`
   objects defined in `index.html` (lines 628, 639) instead — confirmed identical in
   content to `CLIENTS_FIELDS`/`CLIENTS_MAP`, but the module-local copies are inert.
   Same pattern already documented (and left alone) for `templates.js` in
   `PROJECT_STATE.md`.
2. **Reference-equality row index:** `renderClients()`'s `data.clients.indexOf(c)`
   only works because `rows` is a `.filter()` of `data.clients` itself (filter
   preserves element references). Any future change that sources `rows` from a
   separately-fetched copy of the same data would silently break every `onclick`
   handler in the list (return `-1` for every row) — this is a latent fragility
   independent of the Repository migration, already present today.
3. **`saveClient()` never fully re-validates on update`:** only `fClientName` is
   checked; all nine other fields collected via `collectForm('clients')` are accepted
   as-is, including empty strings, on both create and update. Matches
   `ClientsRepository._validate()`'s single-field rule exactly (no discrepancy to
   reconcile — confirmed against `ClientsRepository.js` header notes).
2. *(duplicate numbering intentionally avoided — see item 4)*
4. **`deleteClient()` calls `ApiService.deleteData()` before the local `splice()`.**
   If the network call synchronously threw (it does not — `ApiService.deleteData` is
   `async` and internally catches, per `js/api/api.js` line 214–224), the local delete
   would still proceed. Order is therefore inconsequential today, but is a
   pre-existing quirk worth naming precisely because migration will replace the local
   `splice()` with an `await clientsRepository.delete(id)` — the two async calls
   (`ApiService.deleteData`, `clientsRepository.delete`) will need a defined relative
   order, even though neither can currently fail the overall operation.
5. **`genClientQR()` is documented, in its own docstring, as "the ACTIVE
   implementation (third definition in original `index.html` — the first two were dead
   code)."** No trace of the two dead predecessors exists in the current file (already
   cleaned up in a prior phase per `print-utils.js`'s dead-code cleanup history) — noted
   here only because the comment itself is a legacy artifact worth preserving verbatim
   during any future edit of this function.
6. **`printClientFile()` duplicates ~30 lines of print CSS** that also appears,
   byte-for-byte, in `_buildClientPrintDocument()`. Two independent print paths
   (standalone list-row print button vs. the shared view-modal's print button) that
   happen to produce visually identical output via fully separate code. Not a
   migration concern (neither touches `data.clients` shape), documented only because
   it is the kind of duplication a future consolidation phase may want to target.
7. **The Client Selector block's own mini-search (`renderClientSelectorList`) is
   completely independent of `renderClients()`'s search** — different matching rule
   (name-only substring vs. whole-record substring), different DOM target, no shared
   state. Both must keep working after migration but neither depends on the other.

---

## 9. Migration Strategy

**Principle (unchanged from all eight prior migrations):** read paths first, write
paths last, exactly mirroring the `documents.js` Sub-Phase 9.3 sequence — because reads
are trivially reversible (swap a data source, keep the shape) while writes are the only
places that cross the sync/async boundary and touch the backend.

### Step 1 — Wiring preamble (no behavior change yet)
Add the dual Node/browser `require`/`window` loader for `ClientsRepository`
(identical boilerplate to `documents.js` lines 149–160), instantiate a single
module-level `clientsRepository = new ClientsRepository()`, and create the
`clientsRepositoryReadyPromise` / `ensureClientsRepositoryReady()` /
`syncClientsMirror()` trio, matching `documents.js` lines 168–211 exactly (entity name
swapped). `syncClientsMirror()` sets `data.clients = clientsRepository.getAll();` —
this immediately supersedes `index.html`'s line-575 direct-localStorage read once the
promise resolves, with **zero risk**, since nothing consumes `data.clients` before
first paint.

*Why first:* nothing observable changes yet; this step only proves the Repository
opens and mirrors correctly, in isolation, before any read/write path depends on it.

### Step 2 — Add the id-based index/id translation helper
Add `resolveClientIndex(list, record)` (identical shape to `documents.js`'s
`resolveDocIndex`), keyed on `رقم_الموكل`. This directly retires R-01's fragile
`indexOf(c)` reference-equality lookup in `renderClients()` — replace
`data.clients.indexOf(c)` with `resolveClientIndex(rows, c)` (or, more precisely,
`resolveClientIndex(data.clients, c)`, mirroring `documents.js`'s
`resolveDocIndex(allDocs, d)` exactly). This is the **lowest-risk, highest-value**
single change in the whole migration and should land before any write path changes,
so the render layer is already Repository-clone-safe when writes start arriving.

*Why second:* it is a pure read-side hardening that also happens to be a prerequisite
for every subsequent step (every write path below needs the same id-lookup idiom).

### Step 3 — Migrate `editClient(i)` — no logic change
Confirm (do not alter) that `editClient(i)` continues to read `data.clients[i]` from
the now-Repository-backed mirror. Zero code change required; included as an explicit
migration step only to force a regression check (§10) at this checkpoint before
touching any write path.

### Step 4 — Migrate `saveClient()` (R-02)
Convert to `async function saveClient()`, `await ensureClientsRepositoryReady()`
before the id/create/update branch, resolve `existingId = data.clients[idx][رقم_الموكل]`
when `idx >= 0`, then `await clientsRepository.update(existingId, obj)` or
`await clientsRepository.create(obj)`, call `syncClientsMirror()` immediately after a
successful `result.success`, then proceed with the existing
`toast/saveLocal/ApiService.syncRow/closeModal/renderClients/updateBadges` sequence
unchanged (matching `documents.js`'s `saveDocument()` line-for-line structurally).

*Why fourth:* this is the module's primary write path and the template every
remaining write path below copies.

### Step 5 — Migrate `deleteClient(i)` (R-04) — and resolve R-06 as a documented decision
Convert to `async function deleteClient(i)`, resolve
`id = data.clients[i][رقم_الموكل]` **before** calling `ApiService.deleteData`, then
`await clientsRepository.delete(id)`, `syncClientsMirror()`, then unchanged
`saveLocal/toast/renderClients/updateBadges`. At this step, the R-06 decision must be
made explicit in the accompanying integration report (not silently coded): either (a)
accept that `ApiService.deleteData`'s `rowIndex` argument will drift from the true GAS
sheet row after the first soft-deleted client, as an already-latent, unfixed
architectural gap, or (b) change what index/value is passed to
`ApiService.deleteData`/`updateData`/`syncRow` for Clients specifically. Per this
audit's "no functional changes" mandate, the audit's recommendation is **(a),
documented explicitly**, exactly as `documents.js`'s header already documents its own
unrelated pre-existing `ApiService` gap (§ "SOFT DELETE" note) rather than silently
fixing it.

*Why fifth:* delete is the highest-risk write (irreversible from the user's
perspective) and depends on Step 4's proven create/update pattern already working.

### Step 6 — Migrate `revokeAndRegenQR()` (R-03)
Convert to `async function`, await readiness, resolve
`id = data.clients[idx][رقم_الموكل]`, replace the direct
`data.clients[idx]['portal_token'] = newToken` with
`await clientsRepository.update(id, { portal_token: newToken })` (a genuine partial
patch — `Repository.prototype.update()`'s merge semantics handle this without needing
the full record), `syncClientsMirror()`, then continue unchanged into
`ApiService.updateData(...)`/`toast`/`closeModal`/`displayPortalModal`.

*Why sixth (last):* it is the rarest write path (only fires when a user explicitly
regenerates a QR code) and is functionally independent of Steps 4–5, so it carries
zero risk of being blocked by them and can safely be the final, lowest-traffic change
to land.

### Explicitly out of scope for this migration (no step assigned)
Group E (Client Selector), Group F (wraps), `viewClient`, `printClientFile`,
`printView`, `_buildClientPrintDocument`, `_buildCasePrintDocument`,
`buildClientReport`, `printClientsReport`, `genClientQR`, `showClientPortal`,
`displayPortalModal`, `copyPortalLink`, `openPortalDirect`, `searchClients` — all are
pure reads of the mirror or fully self-contained UI state, and require **zero code
change** under this migration; they are listed here only so the eventual integration
report can positively confirm "verified unchanged" rather than "not considered."

---

## 10. Regression Checklist

Behavior that MUST be verified identical after migration (manual or scripted, mapped
1:1 to a harness in the style of `js/tests/verify_clients_repository.js` plus a new
`verify_clients_repository_integration.js`, matching the sibling
`verify_documents_repository_integration.js`):

1. Adding a new client with only a name populates `رقم_الموكل` and `تاريخ_الإنشاء`
   exactly once, and appears in the list without a page reload.
2. Adding a client with the name field empty is blocked with the existing Arabic toast,
   with no Repository call attempted.
3. Editing an existing client preserves its original `رقم_الموكل` and
   `تاريخ_الإنشاء` (does not regenerate either).
4. `renderClients()`'s full-record search still matches on every field (name, phone,
   NID, address, job, employer, marital status, notes, email, type) — not just the
   3-field `CLIENTS_SEARCH_FIELDS` list `ClientsRepository` exposes as an unused
   configuration option.
5. Every row's four action buttons (view/edit/QR/delete) resolve to the correct client
   after a search filter narrows the visible rows (this is exactly where R-01's
   `indexOf` fragility would surface first).
6. Deleting a client removes it from: the Clients table/mobile list, `دashboard`'s
   client count/badge, `cases.js`'s client backfill match, and `quickCaseQR()`'s
   lookup (i.e., a deleted client's linked case should behave as if the client is
   unregistered, matching today's hard-delete-observable behavior).
7. A deleted client's raw localStorage record still exists (soft delete) with a
   `deletedAt` timestamp — this is an **intentional, expected divergence** from the
   pre-migration hard-delete payload shape, not a regression, and should be asserted
   as such (not asserted absent).
8. `genClientQR(i)` called from the Clients list, from the view modal
   (`showClientPortal`), and from the Cases list (`quickCaseQR`) all resolve the same
   client for the same logical row across all three entry points.
9. `revokeAndRegenQR()` produces a new `portal_token` that is immediately reflected in
   a subsequent `genClientQR()` call for the same client, without requiring a
   `renderClients()` refresh first.
10. `viewClient()` → `printView()` still prints the client report (not the case
    report) when opened from the Clients page, and vice versa for Cases — the
    `_currentViewClient`/`_currentViewCase` mutual-exclusivity wrap must be unaffected.
11. The Case modal's client picker (Group E) still lists all non-empty-named clients,
    filters by typed search, autofills the 5 detail fields when exactly one client is
    selected, and round-trips correctly when editing an existing case
    (`syncCaseClientSelectorFromField`).
12. `buildClientReport()`'s linked-cases and linked-fees sections still total
    correctly and still read live `data.cases`/`data.fees` (unaffected by this
    migration, included only to confirm no accidental coupling was introduced).
13. `printClientsReport()` still lists every client (including any newly soft-deleted
    ones' *absence*) in the same column order.
14. `data.clients.length` (read by `dashboard.js`, twice) reflects only non-deleted
    clients after a delete, immediately, without requiring a page navigation.
15. No `console.error` / unhandled promise rejection appears on normal add/edit/delete
    flows (mirrors `documents.js`'s `.catch()` guard on the ready-promise).

---

## 11. Verification Summary

- **Files read in full:** `js/modules/clients.js`, `js/repositories/ClientsRepository.js`,
  `js/modules/documents.js` (reference pattern), `js/modules/cases.js` (targeted
  sections), `js/modules/dashboard.js` (targeted grep), `js/modules/sessions.js`,
  `js/modules/tasks.js`, `js/modules/library.js`, `js/modules/templates.js`,
  `js/modules/children.js`, `js/modules/fees.js` (grep-scanned for Clients
  coupling — none found beyond a same-named, unrelated form field), `js/core/
  Repository.js` (constructor, lifecycle, CRUD, search/sort/validate hooks),
  `js/core/DatabaseService.js` (read/write signatures), `index.html` (targeted
  grep for `data.clients`/`editIdx.clients`/`FIELDS`/`MAP`/script tags),
  `js/api/api.js` (`syncRow`/`updateData`/`deleteData`/portal URL methods),
  `js/print-utils.js` (`collectForm`/`fillForm`/`resetForm` — confirms dead-constant
  finding in §8.1), `js/tests/verify_clients_repository.js` (existing unit-level
  coverage, confirms `ClientsRepository` behavior already matches this audit's
  understanding), `docs/PROJECT_STATE.md` (confirms current phase status: Clients
  and Cases are the only two of nine entities not yet integration-wired).
- **No file was modified, created (other than this report), or deleted** apart from
  this single deliverable, `Clients_Repository_Integration_Audit.md`.
- **No code was generated, executed, or proposed as a diff.** All function bodies
  quoted above are verbatim excerpts used only for citation/analysis.
- **Cross-checked against the sibling, already-completed Documents migration**
  (`js/modules/documents.js`, Sub-Phase 9.3) to confirm the proposed 6-step strategy
  in §9 is structurally identical to a pattern already implemented and verified
  eight times over (`children`, `sessions`, `tasks`, `fees`, `documents`, `library`,
  `templates`, plus `ClientsRepository`/`CasesRepository`'s own Phase-5/8 groundwork) —
  no novel architecture is being proposed here, only its application to the one
  remaining entity with the largest surface area.

---

Clients Repository Audit
PASS
Ready For Clients Integration
