# Repository_Undo_Hook_Report.md
## نظام الحسام للمحاماة — V10 Offline-First Architecture
### PHASE 12 — SUB-PHASE 12.3 — Repository ↔ Undo Manager Hook Integration
**Date:** 2026-07-13

---

## Scope Note

See `Undo_Manager_Implementation_Report.md §0` / `Phase12_2_Verification_Report.md`
for the pre-existing "Phase 12" numbering discrepancy (every other project
document reserves Phase 12 for the IndexedDB Storage Adapter Layer) — already
raised and explicitly overridden by the operator before Sub-Phase 12.2 began.
This report continues under the same operator-assigned label.

This sub-phase wires `js/core/UndoManager.js` (delivered, unmodified, in
Sub-Phase 12.2) into `js/core/Repository.js` through hooks only. **No Module,
no UI, no Cases integration, no keyboard shortcut, no toolbar** — Repository
remains the sole public façade; nothing outside `Repository.js` calls
`UndoManager` directly, and `Repository.js` is the only production file
changed.

---

## 1. Architecture

### 1.1 Repository lifecycle (unchanged, extended)

`Repository` already moves through `'new' → 'ready' → 'busy' → 'ready' →
('closed' | 'disposed')` (Sub-Phase 8/11 contract). This sub-phase adds exactly
one new piece of instance state, set at construction and cleared at
`dispose()`:

```js
this._undoManager = null;   // added to the constructor
```

No new Repository lifecycle state was introduced — `_undoManager` simply rides
along with every other private field for the object's whole life. `dispose()`
now also does `this._undoManager = null;`, matching the existing pattern of
"nothing live should survive disposal" already used for `_records`/`_idIndex`/
`_liveCount`.

### 1.2 Current transaction flow

`transaction(ops)` already stages every op in memory, calls `_persist()`
exactly once, and only calls `_afterCommit()` / flips `_locked = false` /
returns a success `txResult` **after** that single persist succeeds; any
staging failure or persist failure takes the pre-existing rollback path
(`this._records = previousRecords; this._rebuildIndex();`) and returns before
ever reaching the new code. The undo hook for `transaction()` was inserted
**after** `_rebuildIndex()` on the success path and **before** `_afterCommit()`
— i.e. after the operation is fully durable and fully reflected in the
in-memory cache, but before any application-level "commit" callback fires.

### 1.3 Cache layer (Sub-Phase 11.4)

`_idIndex` (a `Map<id, arrayIndex>`) and `_liveCount` are Repository's own
authoritative bookkeeping, rebuilt or incrementally adjusted by every mutation
method. Every new hook call added in this sub-phase happens strictly **after**
all cache bookkeeping for that method has already completed — the hook never
sits between a cache mutation and its corresponding array mutation, so it can
never observe (or cause) a torn cache state.

### 1.4 Restore flow (Sub-Phase 10.2)

`restore(id)` has two branches: an idempotent no-op (record already live —
returns success immediately, **no persist call**) and a real restore (record
currently soft-deleted — mutates, persists, returns success). The undo hook
was placed only on the second branch, immediately mirroring the "after
successful persist only" rule from §1.6 below — the idempotent branch performs
zero mutation, so recording it would create a phantom undo entry for an
operation that changed nothing.

### 1.5 Mutation lifecycle (all methods, one shape)

Every Repository write method follows the same shape already established in
Sub-Phase 8/11: stage in memory → `this._state = 'busy'` → `await
this._persist()` inside `try` → on success, `this._state = 'ready'` → return
success. On failure: restore `this._records`/`_idIndex`/`_liveCount` from the
pre-mutation snapshot inside `catch` → `this._state = 'ready'` → return
failure. The new undo hook call is inserted at exactly one place across every
method: the first line of the success path, immediately after `this._state =
'ready'` and immediately before the method's own `return`. It is **never**
reachable from the `catch` block.

### 1.6 Rollback behavior

Per the governing prompt: *"Failed persist = NO history."* This is enforced
structurally, not defensively — the `_recordUndo()` call site simply does not
exist anywhere inside a `catch` block or on any early-return failure branch
across `create()`, `update()`, `delete()`, `restore()`, `bulkInsert()`,
`bulkUpdate()`, `bulkDelete()`, `import()`, `clear()`, or `transaction()`.
There is no flag or condition to get this wrong; the call is textually absent
from every failure path.

### 1.7 Hook opportunities identified vs. taken

| Candidate hook point | Taken? | Reason |
|---|---|---|
| Before staging (pre-validation) | No | Would record entries for operations that end up failing validation |
| After staging, before persist | No | Would record entries for operations that end up failing persist |
| After persist succeeds, before return | **Yes** | Only point at which the mutation is both validated *and* durable |
| Inside `catch` (rollback path) | No | Explicitly forbidden by the governing prompt |
| Per-item inside a bulk loop | No | Would create N history entries per bulk call instead of 1 |

### 1.8 Why hooks are safer than direct calls

1. **Single call site per method** — `_recordUndo(method, args)` is the only
   place any write method ever touches `this._undoManager`. A future bug in
   undo wiring is isolated to one 12-line private helper, not scattered across
   nine methods' worth of ad-hoc `if (this._undoManager) ...` blocks.
2. **Failure isolation** — `_recordUndo()` wraps the manager call in its own
   `try/catch` (see §"Failure Isolation" below). A hook can never propagate an
   exception into the caller's control flow; a direct call sprinkled into each
   method's success path could not offer this guarantee without repeating the
   same `try/catch` nine times (and it would be easy to forget once).
3. **Optionality is free** — because the hook is a no-op when
   `this._undoManager` is `null`, every existing Repository instance in the
   project (Clients, Cases, Children, Sessions, Tasks, Fees, Documents,
   Library, Templates — none of which call `setUndoManager()` anywhere yet)
   is **provably unaffected** by this sub-phase: `_recordUndo()`'s first line
   is `if (!this._undoManager) return;`.
4. **Testability** — a single private method can be exercised with mock
   managers (spy, throwing, incomplete) without needing a different double for
   every one of the nine write methods.

### 1.9 Compatibility with Cache Layer

Verified in the test harness (`verify_repository_undo_hooks.js` §P, "cache
compatibility"): `_idIndex` and `_liveCount` are byte-identical after an
identical sequence of operations, whether or not an `UndoManager` is wired,
including with a manager that throws on every call and including across
`setUndoManager()`/`setUndoManager(null)` churn interleaved with writes. This
holds because `_recordUndo()` never reads or writes `this._idIndex` or
`this._liveCount` — `UndoManager` only ever receives deep-cloned snapshots
(via the pre-existing `cloneRecord()` helper), never live references, so
nothing an `UndoManager` (or a broken stand-in) does to its own copies can
reach Repository's cache.

### 1.10 Compatibility with Restore

`restore()`'s existing soft-delete guard, idempotency check, and
`_liveCount`/`_idIndex` bookkeeping are entirely unchanged; the hook is additive
only on the success path of the real-restore branch. A `delete() → restore()
→ update()` cycle (§Q1 of the harness) logs exactly the entries that
genuinely changed state, in the exact order performed, without the
soft-delete guard being affected in either direction by whether a manager is
wired.

### 1.11 Expected implementation scope (as audited, before writing code)

- **One** production file: `js/core/Repository.js`.
- **One** new private field, **one** new private helper, **seven** new public
  methods, **ten** call sites (one per write method: `create`, `update`,
  `delete`, `restore`, `bulkInsert`, `bulkUpdate`, `bulkDelete`, `import`,
  `clear`, `transaction`), **one** validation helper function.
- **Zero** changes to `js/core/UndoManager.js` (delivered correct in
  Sub-Phase 12.2; no bug was found in it during this sub-phase — see §7 of
  `Phase12_3_Verification_Report.md`).
- **Zero** new load-time dependencies: `Repository.js` still has no
  `require()`/import of `UndoManager.js` anywhere; validation is duck-typed at
  call time, with an `instanceof` check only as a bonus when a global
  `UndoManager` constructor happens to already be reachable from `root`.

This audit was confirmed accurate at delivery time — no scope creep occurred;
see `Phase12_3_Verification_Report.md §8` for the file-diff proof.

---

## 2. Hook Lifecycle

```
                       ┌─────────────────────────────┐
caller -> create()/... │ 1. validate / stage in memory│
                       │ 2. this._state = 'busy'      │
                       │ 3. await this._persist()     │
                       └───────────┬─────────┬────────┘
                            success│         │failure
                                   ▼         ▼
                     this._state='ready'   restore snapshot
                     ─────────────────     this._state='ready'
                     _recordUndo(...)  ←── NEVER reached
                     ─────────────────     from this branch
                     return success()      return failure()
```

`_recordUndo(method, args)`:

```js
Repository.prototype._recordUndo = function (method, args) {
  if (!this._undoManager) return;
  var fn = this._undoManager[method];
  if (typeof fn !== 'function') return;
  try {
    fn.apply(this._undoManager, args);
  } catch (e) {
    // Intentionally swallowed — see "Failure Isolation" below.
  }
};
```

## 3. Persist Ordering

For every one of the ten write methods, the ordering is fixed and identical:

1. Stage changes in `this._records` / adjust `this._liveCount` /
   `this._idIndex` as before (Sub-Phase 11.4 behavior, untouched).
2. `await this._persist()`.
3. **On success only:** flip state back to `'ready'`, then call
   `_recordUndo(...)`, then `return` the success result.
4. **On failure:** roll back the in-memory snapshot (pre-existing behavior,
   untouched), flip state back to `'ready'`, `return` the failure result —
   `_recordUndo(...)` is never reached.

## 4. Rollback Behavior

Confirmed by dedicated tests in every one of sections F–O of
`verify_repository_undo_hooks.js` ("persist failure" cases): a
`makeFailingAdapter` that throws on `write()` produces a Repository-level
failure result **and** zero calls to the wired spy manager, for every one of
`create`, `update`, `delete`, `restore`, `bulkInsert`, `bulkUpdate`,
`bulkDelete`, `import`, `clear`, and `transaction`.

## 5. Bulk Strategy

Per-record hook calls were explicitly rejected (see §1.7). Instead:

- **`bulkInsert`** — collects exactly the items that passed validation and
  were actually appended (`toAppend`, pre-existing array) and calls
  `recordCreate(toAppend.map(cloneRecord), {bulk:true, op:'bulkInsert',
  count})` **once**, skipped entirely if `toAppend.length === 0`.
- **`bulkUpdate`** — collects parallel `undoBefore`/`undoAfter` arrays only
  for patches that were actually staged (skipping unknown ids and
  soft-delete-guard rejections), calls `recordUpdate(...)` **once**, skipped
  if nothing was staged.
- **`bulkDelete`** — collects parallel `undoBefore` (pre-delete snapshots) and
  `undoAfter` (post-delete snapshots, `null` for hard deletes) arrays, calls
  `recordDelete(undoBefore, {..., after: undoAfter})` **once** — `after`
  is folded into `metadata` because `UndoManager.recordDelete()`'s own
  `after` parameter is hardcoded `null` by its own (unmodified) design, so
  no information is discarded.

All three are exercised at batch sizes up to 2000 items in
`verify_repository_undo_hooks.js` (§J–L, §V, §Y) with **exactly one** history
entry confirmed at every size.

## 6. Transaction Strategy

`transaction(ops)` can freely mix `create`/`update`/`delete`/`restore` steps
in a single call — no single `recordCreate`/`recordUpdate`/`recordDelete`/
`recordRestore` type could represent an arbitrary mix. It is recorded as
**one** `recordUpdate(previousRecords, this._records, {op:'transaction',
opsCount, opTypes})` call after a successful commit — a full before/after
snapshot of the whole Repository state around the transaction, sufficient for
a future full-revert, with `opTypes` preserved in metadata for
introspection. An empty `ops: []` transaction commits successfully but
records nothing (nothing changed).

`import()` (`replace`/`merge`) and `clear()` follow the same
"one `recordUpdate`/`recordDelete` snapshot of the whole affected range"
strategy, for the same reason — see `js/core/Repository.js` inline comments
at each call site for the exact rationale per method.

## 7. Compatibility Matrix

| Concern | Status | Evidence |
|---|---|---|
| `_idIndex` / `_liveCount` integrity | ✅ unaffected by undo wiring, with or without a manager, with a throwing manager, across churn | harness §P |
| `restore()` soft-delete guard | ✅ unaffected | harness §Q |
| Existing WriteResult shapes | ✅ byte-identical (undo metadata is never mixed into the returned WriteResult) | harness §F–O (every "success" assertion) |
| A misbehaving/throwing `UndoManager` | ✅ never breaks the primary mutation path | harness §U2, §W |
| All 8 existing entity Repositories (Clients/Cases/Children/Sessions/Tasks/Fees/Documents/Library/Templates) | ✅ zero behavior change — none wires an `UndoManager`, so `_undoManager` stays `null` and every hook is a no-op | full regression run, §5 of `Phase12_3_Verification_Report.md` |
| `UndoManager.js` itself | ✅ zero modification | file diff, `Phase12_3_Verification_Report.md §8` |

## 8. Performance

- 300 sequential `create()` calls with a real `UndoManager` wired vs. none
  wired: overhead stayed within the harness's generous sanity bound (§V1) —
  informational only, not a hard perf gate (matches the convention already
  used in `Cache_Performance_Report.md`/`Undo_Manager_Implementation_Report.md`).
- A single `bulkInsert()` of 2000 items logs **exactly one** history entry
  regardless of batch size (§V2, §Y1) — the hook's cost is O(1) per call, not
  O(n) in the number of records touched (the manager itself still does O(n)
  work to clone the array once; Repository does not add a second O(n) pass).

## 9. Future Module Integration (explicitly out of scope here)

Not implemented in this sub-phase (per the governing prompt's "GOAL"): no
Module calls `repository.undo()`/`redo()`, no keyboard shortcut (e.g.
Ctrl+Z), no toolbar button, no Cases-specific wiring. `Repository.undo()`/
`redo()` currently just forward to the manager's own `undo()`/`redo()` and
return whatever snapshot-instruction object the manager returns — Repository
itself does **not** yet reconcile that instruction back into its own
`_records`/`_idIndex`/`_liveCount`. That reconciliation step is the natural
scope of a future Sub-Phase 12.4, once a Module needs to actually *apply* an
undo/redo instruction to the UI and storage.
