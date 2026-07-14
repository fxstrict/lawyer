# Repository_Compatibility_Layer_Design.md

## PHASE 9 — SUB-PHASE 9.2 — Repository Compatibility Layer Design

This is a **read-only, design-only** deliverable. No source file was
modified, no code was implemented, and no file was created other than
this report. Every finding below comes from direct re-inspection of the
current source tree (`Repository.js`, `DatabaseService.js`, all 9
Repository files, all 12 Module files, `index.html`) — not from trusting
Phase 9.1's report, though its conclusions are independently re-confirmed
where reused.

---

## 1. Investigation

### 1.1 Repository public methods — which are actually async

Direct inspection of `js/core/Repository.js` (base class) plus the
per-entity subclass files shows the async/sync split is **not** "all
Repository methods are async." It is a specific, consistent pattern:

**ASYNC (return a Promise) — all of these call `_persist()`, which
`await`s `storage.write()`, or call `storage.read()`:**

| Method | Defined in | Notes |
|---|---|---|
| `open()` | Repository.js:288 | `await this._storage.read(...)` |
| `create(entity)` | Repository.js:610 | calls `_persist()` |
| `update(id, patch)` | Repository.js:655 | calls `_persist()` |
| `delete(id)` | Repository.js:704 | calls `_persist()` |
| `bulkInsert(entities)` | Repository.js:834 | calls `_persist()` once |
| `bulkUpdate(patches)` | Repository.js:877 | calls `_persist()` once |
| `bulkDelete(ids)` | Repository.js:925 | calls `_persist()` once |
| `import(entities, mode)` | Repository.js:1047 | calls `_persist()` |
| `clear()` | Repository.js:1094 | calls `_persist()` |
| `transaction(ops)` | Repository.js:1132 | calls `_persist()` |
| `insert(entity)` | every `*Repository.js` subclass | thin alias: `return this.create(entity)` — not declared `async` itself, but **returns the Promise from `create()`**, so it behaves identically to an async call at every call site |
| `remove(id)` | every `*Repository.js` subclass | alias: `return this.delete(id)` — same as above |

**SYNCHRONOUS (plain return value, no Promise) — all of these read only
from the already-loaded, in-memory `this._records` array populated once
by `open()`:**

| Method | Defined in | Notes |
|---|---|---|
| `isReady()` | Repository.js:306 | |
| `getState()` | Repository.js:310 | |
| `get(id)` | Repository.js:751 | returns `cloneRecord(record)` synchronously |
| `getAll(options)` | Repository.js:768 | returns a synchronous array copy |
| `find(predicateOrQuery)` | Repository.js:785 | synchronous linear scan |
| `exists(id)` | Repository.js:806 | synchronous |
| `count(queryModel)` | Repository.js:818 | synchronous |
| `search(queryModel)` | Repository.js:1018 | synchronous |
| `export()` | Repository.js:1032 | synchronous |
| `filter(filterObj)` | every subclass | subclass-added convenience wrapper around `search()` — synchronous |
| `sort(records, sortSpec)` | every subclass | synchronous, operates on an array already in memory |
| `validate(record, operation)` | every subclass | wraps `_validate()` — synchronous |
| `close()` / `dispose()` | Repository.js:319/323 | synchronous |

**This split is the single most important fact for this design.** Once a
Repository has been `open()`-ed (one `await`, done once at startup), every
*read* operation a Module currently performs synchronously against
`data.<entity>` (`.filter()`, free-text scan, `.indexOf()`, single-record
lookup) has a **synchronous** Repository equivalent (`getAll()`, `filter()`,
`search()`, `get()`). Only the *write* operations (`create`/`update`/
`delete`, plus their `insert`/`remove` aliases) and the one-time `open()`
are genuinely asynchronous. This means the async-conversion problem
identified in Phase 9.1 (§4) is real, but narrower than "every Module
function must become async" — it only applies to the **save/delete
call sites**, not to render/search/filter call sites, once `open()` has
completed.

`DatabaseService.js` mirrors this: `read`/`write`/`delete`/`clear`/`exists`
all delegate to the injected adapter and are themselves `async` (or
Promise-returning); `open`/`close`/`destroy` are synchronous bookkeeping.
This is consistent with, and does not change, the Repository-level split
above — Modules never call `DatabaseService` directly, only through their
Repository.

### 1.2 Current Module call sites that assume synchronous execution

Every one of the 9 entity Modules follows the identical shape (confirmed
in Phase 9.1, re-confirmed here by re-reading each `save*`/`delete*`
function):

```
function saveX() {
  ... read form fields, validate ...
  var obj = collectForm('x');
  var idx = editIdx.x;
  if (idx >= 0) { data.x[idx] = obj; toast('updated'); }
  else          { data.x.push(obj);  toast('added');   }
  saveLocal();                          // <-- synchronous write, blocks nothing
  ApiService.syncRow('SheetName', obj, idx);   // fire-and-forget, not awaited today either
  closeModal('modalX');
  renderX();                            // <-- immediately re-reads data.x
  updateBadges();
}

function deleteX(i) {
  if (!confirm('...')) return;
  ApiService.deleteData('SheetName', i);       // fire-and-forget
  data.x.splice(i, 1);
  saveLocal();
  toast('deleted');
  renderX();
  updateBadges();
}
```

The synchronous assumption is specifically: **the mutation
(`push`/`splice`/index-assign) is guaranteed complete, in memory, before
`renderX()` runs on the very next line.** `renderX()` re-reads `data.x`
directly, with no round-trip — there is no `await`, no callback, no event
to wait for. `ApiService.syncRow`/`deleteData` are `async` functions
already, but they are **called without `await` today** (fire-and-forget) —
so the project already tolerates a Promise being "dangled" for the
*remote* sync call; it does not yet tolerate one for the *local* write.

`renderX()` functions themselves (`renderCases`, `renderClients`, etc.)
are also synchronous top-to-bottom: they call `data.x.filter(...)`, build
HTML strings inline (using `data.x.indexOf(c)` to compute a row index
baked into the generated `onclick="editX(<i>)"`/`onclick="deleteX(<i>)"`
attribute strings — see §1.3), and assign `innerHTML` — all in one
synchronous pass with no awaited call anywhere in the chain.

### 1.3 Inline HTML handlers — every function invoked directly by `onclick`/`onchange`/`oninput`/`onsubmit`

Two categories exist, both scanned directly (static attributes in
`index.html`, and dynamically-generated attribute strings built inside
each Module's `render*()` function):

**A. Static handlers, wired directly in `index.html`:**
`closeModal`, `navigate`, `toggleSidebar`, `openAddModal`,
`openAddChildModal`, `openAddDocModal`, `openAddFeeModal`,
`openAddLibModal`, `openAddTemplateModal`, `openDriveModal`,
`openPortalDirect`, `saveCase`, `saveChild`, `saveClient`, `saveDocument`,
`saveFee`, `saveLibBook`, `saveSession`, `saveTask`, `saveTemplate`,
`saveApiUrl`, `saveDriveUrl`, `saveDriveFromModal`, `testConnection`,
`refreshAll`, `exportData`, `importData`, `handleImport`, `clearAllData`,
`copySheetUrl`, `copyPortalLink`, `revokeAndRegenQR`, `showClientPortal`,
`toggleClientSelector`, `renderClientSelectorList`, `printView`,
`toggleChildrenSection`, `addChildRow`, `updateChildrenData`,
`autofillSessionFromCase`, `autofillFeeFromCase`, `toggleCaseClient`,
`calPrev`, `calNext`, `calSelectDay`, `filterTemplates`, `renderCases`,
`renderClients`, `renderChildren`, `renderSessions`, `renderTasks`,
`renderFees`, `renderDocuments`, `renderLibrary` (the last 8 as
`oninput`/`onchange` re-render triggers on search/filter fields).

**B. Dynamically-generated handlers, built by each Module's `render*()`
function as string-concatenated HTML (`'<button onclick="editCase('+ri+')">'`),
present only once the table/list is rendered:**
`editCase`, `deleteCase`, `viewCase`, `quickPrintCase`, `quickCaseQR`,
`editClient`, `deleteClient`, `viewClient`, `genClientQR`, `editChild`,
`deleteChild`, `editSession`, `deleteSession`, `editTask`, `deleteTask`,
`toggleTask`, `editFee`, `deleteFee`, `editDocument`, `deleteDocument`,
`editLibBook`, `deleteLibBook`, `editTemplate`, `deleteTemplate`.

**Critical detail found in this pass, not previously called out in Phase
9.1:** every `edit*(i)`/`delete*(i)` handler receives a **raw array
index**, computed inline in the `render*()` function as
`data.<entity>.indexOf(c)` (confirmed directly, e.g. `cases.js` line 128:
`var ri = data.cases.indexOf(c);`, and the identical pattern in every
other Module's render function). That index is baked as a literal number
into the generated `onclick="editCase(3)"` string at render time. This
means:
- The index is only valid **relative to the exact array `data.<entity>`
  held at render time.** If Repository methods return a *new cloned
  array* on each call (which `getAll()` does — `Repository.js` explicitly
  clones every record via `cloneRecord()` and never returns a live
  reference), then a compatibility layer that swaps `data.<entity>` for
  a **fresh call to `getAll()`** on every render will still work
  correctly, *as long as ordering is stable between the `getAll()` call
  used to render the index into the button and the later call used to
  resolve that index back into a record* — but it will break if anything
  in between (a `create`/`update`/`delete` from another tab, a
  soft-delete filter change, etc.) changes the array's order or length
  before the button is clicked.
- This is an existing fragility in the *current* code too (if two browser
  tabes race, or if `data.cases` were reordered between render and click,
  the same bug would exist today) — the compatibility layer does not need
  to fix it, but it must not make it *worse*, and must preserve the exact
  same index-resolution semantics the Modules already rely on.

### 1.4 Can a thin wrapper preserve current Module APIs while internally awaiting Repository calls?

**Partially, and only for the write side — with one hard constraint that
rules out a pure "drop-in synchronous facade":** JavaScript has no
mechanism to turn a genuinely asynchronous operation (a `Promise` from
`create()`/`update()`/`delete()`, which in turn awaits `LocalStorageAdapter`
→ real `localStorage.setItem()`) into a value a *synchronous* caller can
read on the very next line, without either (a) blocking the main thread
(not possible in browser JS — there is no synchronous-wait-for-promise
primitive), or (b) the underlying storage operation itself being made
synchronous. Since `localStorage.setItem()` **is already synchronous** in
real browsers (`LocalStorageAdapter.js`'s only genuinely blocking-capable
work), the `Promise`-wrapping in `Repository.js`/`DatabaseService.js` is a
deliberate *design-time* abstraction (so a future non-synchronous storage
engine — IndexedDB, remote API, etc. — could be swapped in later, per
that file's own header comments: *"Repository never assumes these are
synchronous or asynchronous — it always awaits them... the entire reason
a storage-engine swap [is possible]"*) rather than a reflection of the
*current* adapter's real behavior. This distinction matters directly for
Design Alternative C below.

---

## 2. Design alternatives

### A) Convert every Module to `async`

Rewrite every `save*`/`delete*`/`toggle*` function (and their transitive
callers) to `async function`, `await` every Repository call directly, and
move the `renderX()`/`toast()`/`updateBadges()` calls to after the
`await`.

**Pros**
- Architecturally the "correct," final-state shape — no indirection layer
  to maintain going forward.
- Makes the code's true asynchronous nature explicit and visible at every
  call site; easiest to reason about long-term.
- No hidden behavior — a reviewer reading `saveCase()` sees exactly what
  happens and in what order.

**Cons**
- Touches all 9 entity Modules simultaneously (or forces a long
  half-migrated state where some Modules are `async` and some are not,
  reintroducing exactly the "half of one thing, half of another"
  confusion this compatibility layer is meant to avoid).
- Every dynamically-generated `onclick="editCase(3)"` string and every
  static `onclick="saveCase()"` in `index.html` continues to work
  unmodified (inline handlers tolerate calling an `async function` — the
  returned Promise is simply discarded), **but** any code that currently
  assumes `saveCase()` "has already updated `data.cases`" by the time the
  very next statement runs (there is no such code today, since nothing
  currently runs between a `save*()` call and the next user action) would
  break; low risk today, but this must be re-verified module-by-module
  during implementation, not assumed.
- Largest single-PR blast radius of the three options — violates Phase
  9's own stated goal ("without immediately rewriting every Module").

### B) Compatibility Layer (thin wrapper module, e.g. `js/core/RepositoryCompat.js`)

Introduce one new, additive file that exposes **synchronous-looking**
functions with the same names/signatures Modules already call
conceptually (`compatSave('cases', obj, idx)`, `compatDelete('cases', i)`),
which internally:
1. Resolve the array index `idx`/`i` to the record's actual `idField`
   value using the Repository's own already-in-memory `getAll()` (sync).
2. Call the real async `Repository.create()`/`update()`/`delete()`.
3. `await` it internally, then synchronously perform the exact same
   `renderX()`/`toast()`/`updateBadges()`/`closeModal()` sequence the
   Module function used to run immediately after its own mutation — i.e.
   the wrapper owns the "mutate → persist → re-render" sequence as a
   single atomic async function, and each Module's `save*`/`delete*`
   function becomes a **very small edit**: replace its 3–4 lines of
   direct `data.x` mutation + `saveLocal()` with one call into the
   compatibility layer, keeping its own signature (still callable
   directly from `onclick=`, still not itself declared `async` if not
   desired — it can simply return the compat layer's Promise
   undeclared/un-awaited, exactly as `ApiService.syncRow` is already
   dangled today).
4. For **reads** (`renderX()`'s `data.x.filter(...)`), the compatibility
   layer does *not* need to do anything asynchronous at all — per §1.1,
   `getAll()`/`filter()`/`search()` are already synchronous once
   `open()` has completed at startup, so `renderX()` can be edited to
   read from `Repository.getAll()` instead of `data.x` with **no async
   conversion needed at all** for the render path.

**Pros**
- Every Module's *public* function names, signatures, and direct
  callability from `onclick=` are fully preserved — `index.html` and every
  dynamically-generated button string need **zero changes**.
- Isolates the entire async-handling burden (the one genuinely hard part
  of this migration) into one new, small, independently-testable file,
  matching Phase 9.1's recommended one-module-at-a-time migration order —
  each Module can be switched over to calling the compat layer
  independently, in the exact sequence already recommended (Documents →
  Sessions → Tasks → Library → Templates → Children → Fees → Clients →
  Cases), without waiting for the others.
- Directly solves the index→id resolution problem identified in §1.3 in
  one place, once, rather than reinventing it in all 9 Modules.
- Smallest, most reversible per-module diff of the three options — each
  Module's `save*`/`delete*` function shrinks rather than being
  restructured, and the change can be rolled back per-module if a
  regression appears.

**Cons**
- Introduces one more file/layer of indirection that has to be understood
  and maintained going forward (though it can be deleted once every
  Module has been fully converted to call Repositories directly, if that
  end-state is ever desired).
- The compat layer's internal `await` still means `renderX()` runs
  *after* the compat layer's own microtask resolves, not synchronously in
  the exact same tick as the (now-removed) direct `data.x` mutation — a
  human clicking "Save" then instantly clicking something else in the
  same synchronous frame could, in principle, observe a one-microtask
  window where the record isn't in the array yet. In practice this window
  is a single microtask (same order of magnitude as `localStorage`'s own
  I/O), and is very unlikely to be user-perceptible, but it is not
  literally "zero-latency synchronous" the way today's code is — this
  should be explicitly acknowledged, not hidden.

### C) Repository synchronous facade (force `create`/`update`/`delete` to resolve synchronously by writing directly, bypassing the `await`)

Add a second, synchronous-only method set to each Repository (or a
wrapper) that performs the exact same in-memory mutation and calls
`LocalStorageAdapter`'s underlying `localStorage.setItem()` *directly and
synchronously*, skipping the `Promise`/`await` machinery entirely for the
local-storage-only case, since (per §1.4) the actual current adapter
*is* synchronous under the hood.

**Pros**
- Would restore truly zero-latency, same-tick synchronous behavior,
  identical in timing to today's code.
- No `async`/`await` conversion needed anywhere, in any Module or any
  wrapper.

**Cons**
- **Directly contradicts the explicit, documented design intent of
  `Repository.js` itself** — its own comments state the storage interface
  is deliberately treated as "may be sync or async" specifically "so a
  storage-engine swap" (e.g. to IndexedDB, or a remote-first store) can
  happen later without touching Repository/Module code. A synchronous
  facade would either (a) only work for the current `LocalStorageAdapter`
  and silently break the moment a different adapter is substituted, or
  (b) require maintaining two full parallel code paths (sync and async)
  inside every Repository indefinitely, roughly doubling the surface
  area of the one part of the codebase (Phase 8) that has already been
  audited, verified, and signed off as complete and untouched.
- Requires **modifying already-verified, checksum-confirmed-unchanged
  core files** (`Repository.js`, `DatabaseService.js`,
  `LocalStorageAdapter.js`) or the 9 already-verified Repository files —
  reopening work that Phase 8.5.3 explicitly closed out with "no
  corrective work required," for no functional gain over Option B.
- Silently reintroduces the exact same fragility a genuinely async
  storage engine was meant to protect against, and does so by touching
  the most stable, most heavily-verified layer of the whole project —
  the highest-risk option of the three by a wide margin, for essentially
  the same behavioral outcome as Option B.

---

## 3. Recommendation

**Option B — a thin Compatibility Layer — is recommended.**

It is the only option that satisfies the Phase 9 objective as literally
stated ("allowing the existing synchronous Modules to work with
asynchronous Repository methods without immediately rewriting every
Module") without either (a) touching the already-verified, checksummed
core/Repository layer from Phase 8 (which Option C would require), or
(b) forcing a single large, all-9-Modules-at-once rewrite (which Option A
would require, and which also conflicts with Phase 9.1's explicit
recommendation of a staged, one-entity-at-a-time migration order).

Additionally, §1.1's finding — that *reads* (`getAll`/`get`/`filter`/
`search`) are already synchronous once `open()` completes — means the
Compatibility Layer's actual scope is smaller than it might first appear:
it only needs to wrap the **write** operations
(`create`/`update`/`delete`/`insert`/`remove`) and the one-time `open()`
call at bootstrap. `renderX()` functions can point at
`Repository.getAll()` directly, with no wrapper needed at all, the moment
a given entity's Repository is loaded.

---

## 4. Proposed runtime flow

### CURRENT

```
                UI (onclick="saveCase()" / "editCase(3)" / etc.)
                                 │
                                 ▼
                    Module (saveCase(), deleteCase(), renderCases()
                             — fully synchronous)
                                 │
                                 ▼
                data  (single global object, 9 arrays,
                       mutated in place: push/splice/index-assign)
                                 │
                                 ▼
                    saveLocal()  (synchronous, blind
                     JSON.stringify + localStorage.setItem
                     over all 9 keys)
```

### FUTURE (with Compatibility Layer)

```
                UI (onclick="saveCase()" / "editCase(3)" / etc.
                     — UNCHANGED, no HTML/template edits required)
                                 │
                                 ▼
        Module (saveCase(), deleteCase() — signatures unchanged;
                 internal body shrinks to: validate, collect obj,
                 then delegate the mutate+persist+rerender sequence
                 to the Compatibility Layer, exactly as it already
                 delegates remote sync to ApiService today)
                                 │
                                 ▼
     Compatibility Layer (js/core/RepositoryCompat.js — new, additive)
     — resolves array-index → record id (§1.3) using the target
       Repository's own synchronous getAll(); calls the real async
       create()/update()/delete(); awaits it; then runs the same
       renderX()/toast()/updateBadges()/closeModal() sequence the
       Module used to run immediately inline
                                 │
                                 ▼
        Repository (js/repositories/*Repository.js — UNCHANGED,
                     already verified in Phase 8)
     — create/update/delete: async, Promise-returning
     — getAll/get/filter/search: synchronous, in-memory, used
       directly by renderX() with NO wrapper needed
                                 │
                                 ▼
        DatabaseService (js/core/DatabaseService.js — UNCHANGED)
                                 │
                                 ▼
      LocalStorageAdapter (js/core/LocalStorageAdapter.js — UNCHANGED)
                                 │
                                 ▼
                          localStorage
```

`ApiService`/legacy sync calls remain exactly where they are today —
called (still un-awaited, still fire-and-forget, unchanged) from inside
each Module's `save*`/`delete*` function, immediately after the
Compatibility Layer call is issued — this design does not touch the
remote-sync layer at all, consistent with Phase 9.1's scoping.

---

## 5. Migration impact

**Files affected (design-time estimate, no changes made in this phase):**
- **1 new file**: `js/core/RepositoryCompat.js` (or similarly named) —
  additive only, follows the same "depends only on Repository.js, no
  cross-Repository imports" discipline already enforced across the
  9 Repository files.
- **Up to 9 Module files** (`cases.js`, `clients.js`, `children.js`,
  `sessions.js`, `tasks.js`, `fees.js`, `documents.js`, `library.js`,
  `templates.js`), but only ever **one at a time**, per Phase 9.1's
  recommended order — each edit is confined to that entity's
  `save*`/`delete*`/`toggle*` functions (the write call sites); each
  entity's `render*()` function gets a much smaller, separate edit
  (swap `data.x` for `Repository.getAll()`) that can even be done as an
  independent, lower-risk sub-step.
- **`index.html` bootstrap** (lines ~572–586): eventually needs each
  migrated entity's `data.x = JSON.parse(localStorage.getItem('x')||'[]')`
  line replaced by an `await XRepository.open()` call, and `saveLocal()`
  edited to stop double-writing that entity's key — but this is a
  bootstrap-only change, made once per entity, not per save/delete call.
- **0 changes** to `js/core/Repository.js`, `js/core/DatabaseService.js`,
  `js/core/StorageAdapter.js`, `js/core/LocalStorageAdapter.js`, or any
  of the 9 `js/repositories/*Repository.js` files — all already verified
  complete in Phase 8 and untouched by this design.

**Functions affected (per migrated entity, e.g. Cases):**
`saveCase()`, `deleteCase()` (write call sites — edited to call the
compat layer) and `renderCases()` (read call site — edited to call
`getAll()`/`filter()` directly, no compat layer involvement). Entities
with an extra partial-update path (Tasks' `toggleTask()`, Clients'
portal-token update) need one additional compat-layer call site each,
using `update(id, patch)` rather than a full-object replace — already
anticipated in Phase 9.1 §5's risk analysis.

**Risk:** **LOW–MEDIUM**, materially lower than Option A or C. The
compat layer itself is a small, single-purpose, independently testable
unit (index→id resolution + one `await` + the existing render/toast/
badge sequence) rather than a change spread across 9 Modules
simultaneously. The main residual risk is the microtask-timing nuance
noted in §2 Option B's cons (a vanishingly small window between "write
issued" and "render reflects it"), and the pre-existing index-baked-into-
`onclick` fragility from §1.3, which the compat layer must faithfully
preserve rather than accidentally worsen.

**Complexity:** **LOW** for the compat layer itself (a handful of
generic functions, likely one shared implementation parameterized by
entity name/Repository instance rather than 9 bespoke ones); **LOW** per
Module edit (each Module's diff shrinks rather than grows); the only
genuinely non-trivial design element is the index→id resolution
(§1.3), which needs to be implemented once, carefully, and reused for
every entity rather than re-derived per Module.

---

## 6. Readiness

**Implementation can begin**, starting with the Compatibility Layer
itself (a standalone, additive file with no dependency on any Module
being changed yet), followed by Documents and Sessions — the two
zero-coupling, lowest-risk entities identified in Phase 9.1 §6 — as the
first Modules wired through it. No further analysis is required before
that first step; the remaining decisions flagged in Phase 9.1 §8
(async-conversion strategy — now resolved by this design; cross-module
read bridging; and whether to preserve or fix the Library/Templates
bulk-load gap and the Children delete-without-sync asymmetry) remain
open but do not block starting the Compatibility Layer and the first two
Modules, since Documents and Sessions have no cross-module read
dependencies to bridge (per Phase 9.1 §5) and neither carries a
legacy-sync or partial-update wrinkle.

---

## Compatibility Layer Design

**PASS**

**Ready For Implementation**
