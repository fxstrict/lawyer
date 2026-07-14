# Undo_Manager_Implementation_Report.md
## نظام الحسام للمحاماة — V10 Offline-First Architecture
### PHASE 12 — SUB-PHASE 12.2 — Undo Manager Core Implementation
**Date:** 2026-07-13

---

## 0. Scope Note (read this first)

Every existing project document that mentions "Phase 12" (`NEXT_PHASE.md §5`,
`PROJECT_STATE.md §13`, `Cache_Layer_Design.md §15`, `Cache_Layer_Implementation_
Report.md`, `Performance_Baseline_Report.md`, `Phase11_5_Verification_Report.md`)
defines it as the **IndexedDB Storage Adapter Layer**, not an Undo Manager. No
`Undo_System_Design.md` / `Undo_System_Architecture.md` / `Undo_System_Migration_
Plan.md` / `Undo_System_Risk_Assessment.md` (i.e. a prerequisite "Sub-Phase 12.1")
exist anywhere in this project. This discrepancy was raised explicitly before any
code was written; the operator instructed **"تجاهل التعارض"** ("ignore the
conflict") and to proceed with the task exactly as specified under the label
"Phase 12 / Sub-Phase 12.2". This report documents that decision rather than
silently absorbing it — a future phase reconciling the numbering (e.g. renaming
this work to a different phase number, or still doing the real IndexedDB layer
under "Phase 12") should treat this note, not the label in the file header, as
authoritative about what actually happened and why.

---

## 1. Audit Summary

Performed against the live project source (`js/core/Repository.js`, 1720 lines,
read in full) before any code was written:

- **Repository architecture:** a single storage-agnostic `Repository` base class
  (Phase 5), 9 entity subclasses, each configuring `entityKey`/`idField`/
  `searchFields`/`softDelete`/`unsupportedOperations`. All CRUD (`create`,
  `get`/`getAll`/`search`/`exists`, `update`, `delete`, `restore`, `transaction`,
  `import`/`export`/`clear`) already exists and is stable (Phase 11.5, "READY FOR
  PHASE 12").
- **Cache architecture (Phase 11.4/11.5):** `this._idIndex` (Map, id → array
  index) and `this._liveCount` are maintained in lockstep with every mutation,
  always derivable via `_rebuildIndex()`, never independently authoritative.
- **Transaction flow:** `transaction(ops)` stages every step against a working
  copy (`working = this._records.slice()`), throws-to-rollback on any step
  failure (nothing persisted), commits once via a single `_persist()` call, then
  rebuilds the cache. `{op:'update'}` steps call the same `_stageUpdate()`
  helper as `update()`/`bulkUpdate()` (Phase 11.2.1, T-10 fix) — one guard/merge/
  validate implementation, not three.
- **Restore flow:** `restore(id)` clears `deletedAt`, idempotent when already
  live (no mutation, no persist), rolls back the in-memory record on a persist
  failure, supported inside `transaction()` via `{op:'restore', id}` with the
  same all-or-nothing semantics as every other op type.
- **Current rollback flow:** every write method (`create`/`update`/`delete`/
  `restore`/`transaction`) follows the identical pattern: mutate `this._records`
  (and the cache) first, `await this._persist()`, and on failure revert both the
  record array and the cache to their pre-mutation state before returning a
  failed `WriteResult`.
- **Mirror strategy:** Modules (`js/modules/*.js`) maintain a `data.<entity> =
  <entity>Repository.getAll()` compatibility mirror after every write — this is
  Module-layer behavior, entirely orthogonal to and untouched by this sub-phase.
- **Why Undo needs hooks:** the Repository's own write methods have no concept
  of "the value before this call" surviving past the call itself — `update()`
  and `delete()` know the prior record only transiently, inside their own
  function body, then discard it. An Undo Manager needs that before/after pair
  captured at the moment of the call, which is why `record*()` methods take
  explicit `before`/`after` arguments rather than trying to infer them from
  Repository state after the fact.
- **Why UndoManager must stay outside Repository:** Repository.js is the
  established "one wall" between Modules and storage (file header, unchanged
  since Phase 5) — it has zero knowledge of undo/redo semantics today, and Phase
  11's Cache Layer, Phase 10's Restore System, and this sub-phase all follow the
  same discipline of extending capability via new methods/files rather than
  entangling unrelated concerns into one class. Keeping `UndoManager` a
  standalone class also lets a *future* wiring phase decide, per Module, whether
  undo/redo is even wanted for that entity — Repository.js itself stays exactly
  as it is today (confirmed unmodified, see §4 below).
- **Current compatibility with Restore:** `recordDelete()`/`recordRestore()`
  snapshot whatever `before`/`after` object a future caller passes in — including
  one with a `deletedAt` field — with zero assumption about the shape, so this
  engine is already compatible with Restore System snapshots without any
  Restore-specific code inside `UndoManager.js`.
- **Expected implementation footprint:** one new file (`js/core/UndoManager.js`,
  387 lines), one new test harness (`js/tests/verify_undo_manager.js`, 1587
  lines), two new docs (this file and `Phase12_2_Verification_Report.md`). Zero
  bytes changed in any pre-existing file.

Files reviewed as part of this audit: `PROJECT_STATE.md`, `PROJECT_MAP.md`,
`PROJECT_HISTORY.md`, `NEXT_PHASE.md`, `Technical_Debt_Report.md`,
`Repository_Hardening_Report.md`, `Transaction_Consistency_Report.md`,
`Phase11_2_Verification_Report.md`, `Phase11_2_1_Verification_Report.md`,
`Cache_Layer_Design.md`, `Phase11_5_Verification_Report.md`,
`Production_Readiness_Audit.md`, and `js/core/Repository.js` in full.

---

## 2. Architecture

`UndoManager` is a single, dependency-free, entity-agnostic class:

```
UndoManager(repository, { maxHistorySize = 50 })
  ._repository   — forward-compatible handle only, NEVER called
  ._history      — array used as a stack (push = newest at the end)
  ._redo         — array used as a stack, same convention
  ._maxHistory   — bound applied to BOTH _history and _redo
  ._enabled      — gates record*() only
  ._disposed     — informational flag set by dispose()
```

Every history entry: `{ type, before, after, timestamp, metadata }`, all four
data fields deep-cloned via `JSON.parse(JSON.stringify(...))` — the identical
technique `Repository.js`'s own `cloneRecord()` uses, chosen deliberately for
consistency and because it is exactly what `serialize()`/`deserialize()` need
(the whole state must already be JSON-safe).

## 3. API

| Method | Behavior |
|---|---|
| `enable()` / `disable()` / `isEnabled()` | Toggle whether `record*()` accepts new entries. Never affects `undo()`/`redo()`. |
| `clear()` | Empties both stacks. Does not change `_enabled`. |
| `canUndo()` / `canRedo()` | `true` iff the respective stack is non-empty. |
| `historySize()` / `redoSize()` | Current stack lengths. |
| `recordCreate(after, metadata?)` | Pushes a `type:'create'` entry (`before:null`). |
| `recordUpdate(before, after, metadata?)` | Pushes a `type:'update'` entry. |
| `recordDelete(before, metadata?)` | Pushes a `type:'delete'` entry (`after:null`). |
| `recordRestore(before, after, metadata?)` | Pushes a `type:'restore'` entry. |
| `undo()` | Pops history → pushes to redo → returns `{action, before, after, metadata}` (or `null` if empty). Never calls the repository. |
| `redo()` | Symmetric: pops redo → pushes to history → returns the same shape. |
| `exportHistory()` | `{maxHistorySize, history, redo}`, fully cloned. |
| `importHistory(data)` | Validates shape (each entry's `type` must be one of `create`/`update`/`delete`/`restore`), replaces internal state, re-applies the FIFO bound. |
| `serialize()` / `deserialize(json)` | JSON-string wrappers around `exportHistory()`/`importHistory()`. |
| `dispose()` | Clears both stacks, disables recording, releases the repository handle. Idempotent — safe to call more than once. |

## 4. Memory

Both stacks are hard-capped at `maxHistorySize` (default 50) via a shared
`_pushBounded()` helper: `stack.push(entry); while (stack.length > max)
stack.shift();` — oldest entry dropped first (FIFO), verified directly (§ Memory
tests in the harness) for `maxHistorySize` values of 10/20/25/50/100 under 20x
overload, and for a synthetic 2000-entry run capped at 100 (§ Large History
tests). No unbounded growth path exists.

## 5. Complexity

- `record*()`: O(1) amortized push + O(k) clone where k = size of the
  before/after/metadata payload (unavoidable — a deep clone must visit every
  field). Overflow trim is O(1) per dropped element (`Array.shift()` is O(n) in
  the worst case for very large arrays, but n is bounded by `maxHistorySize`,
  so this is O(maxHistorySize) at most, not O(total operations)).
- `undo()`/`redo()`: O(1) pop/push plus O(k) clone for the returned instruction.
- `exportHistory()`/`serialize()`: O(n·k) where n = current stack sizes (both
  bounded by `maxHistorySize`).
- `importHistory()`/`deserialize()`: O(n·k) validate + clone.

## 6. Design Decisions

1. **`_enabled` gates recording only, not undo/redo.** Disabling the manager
   mid-session (e.g. during a bulk import a Module doesn't want individually
   undoable) should not strand whatever undo/redo history already exists.
2. **`null` and `undefined` metadata both normalize to `{}`.** Found and fixed
   during this sub-phase's own test run (§7) — the first draft only normalized
   `undefined`, leaving an explicit `null` metadata argument stored as `null`
   instead of `{}`, which is inconsistent with every other "defaults to `{}`"
   entry point in the API.
3. **`undo()`/`redo()` return the *original* `action` type, never an inverted
   one.** E.g. undoing a `'create'` entry returns `action:'create'` (not some
   invented `'uncreate'`), leaving the caller (a future Repository-integration
   phase) to decide, per action type, what the correct reversal call is. This
   keeps `UndoManager.js` from having to encode any Repository-specific
   knowledge about what "undoing a create" means operationally.
4. **Redo stack shares the same `maxHistorySize` bound as history**, for
   symmetry and to keep total memory use bounded regardless of how long a
   caller alternates `undo()`/`redo()`.
5. **`dispose()` is idempotent and never throws**, matching the same safety
   expectation as `Repository.prototype.dispose()`.

## 7. Stress Results

From `js/tests/verify_undo_manager.js` (this session, `node
js/tests/verify_undo_manager.js`):

- 500 random record operations (mixed create/update/delete/restore) against a
  30-entry cap: `historySize() <= 30` and `>= 1` held at every one of 500
  checkpoints; redo was empty after every fresh record, every time.
- 500 alternating undo/redo calls against a 40-entry history: `historySize() +
  redoSize()` remained exactly constant across all 500 iterations (no entry
  ever created or destroyed by pure undo/redo).
- 300 iterations of record-then-immediately-undo: fully drained history and
  produced exactly one redo entry, every single time.
- 200 iterations of export → import round trips (variable-length histories,
  1–20 entries): every round trip preserved `historySize()` and the full
  history content byte-for-byte (`assert.deepStrictEqual`).
- 200 iterations of a seeded-random mix of all four record types plus
  probabilistic undo/redo, against a 25-entry cap: `historySize()` never
  exceeded the cap and neither stack size ever went negative.
- 2000 sequential `recordCreate()` calls against a 100-entry cap: capped
  correctly, oldest-first eviction verified by exact ids, `undo()` afterward
  still correctly reversed the most recent surviving entry.
- 10,000 `recordCreate()` calls completed in well under the 5-second sanity
  bound; 5,000 undo/redo alternations likewise; 100 serialize/deserialize round
  trips on a 100-entry history likewise.

## 8. Coverage

211 labelled tests, 5,089 individual assertions, 0 failures (after the one fix
in §6.2, found by this same harness on its first run). Exceeds the sub-phase's
stated minimums (150 tests / 3000 assertions). See
`Phase12_2_Verification_Report.md` for the full verification sign-off.

## 9. Compatibility

No pre-existing file was modified (confirmed by a full `diff -rq` against the
original, pristine `Master_v11_5.zip` upload — see §4 "Files Unchanged" in the
companion Verification Report). `UndoManager.js` has zero `require()`/`import`
of any other project file and makes zero DOM/`window`/`document`/`localStorage`
calls, matching the "Pure JavaScript" requirement exactly.

## 10. Future Integration Points (explicitly out of scope for this sub-phase)

- **Wiring into Repository writes.** A future sub-phase would have each
  Module (or a Repository-level hook) call `recordCreate()`/`recordUpdate()`/
  `recordDelete()`/`recordRestore()` immediately after a successful
  `WriteResult`, using the Repository's own before/after snapshots.
  `UndoManager.js` requires no change to support this — it already accepts
  arbitrary plain-object before/after payloads.
- **Executing `undo()`/`redo()` instructions.** Today `undo()`/`redo()` return
  `{action, before, after, metadata}` only. A future phase would map
  `action:'create'` → call `repository.delete(after[idField])`, `action:'delete'`
  → call `repository.restore(before[idField])` (if soft-delete) or
  `repository.create(before)` (if hard-delete), `action:'update'` → call
  `repository.update(before[idField], before)`, and `action:'restore'` → call
  `repository.delete(after[idField])` — none of which this file performs today.
- **UI (toolbar/keyboard shortcuts).** Explicitly out of scope per the governing
  task; `UndoManager.js` has no DOM dependency of any kind to build on top of.
