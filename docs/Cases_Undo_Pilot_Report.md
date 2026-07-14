# Cases Undo Pilot Report — PHASE 12, SUB-PHASE 12.4

## 1. Scope

This phase implements the first *real* Undo/Redo integration in the project, on
**Cases only**. Exactly one production file was modified:
`js/modules/cases.js`. `js/core/Repository.js` and `js/core/UndoManager.js`
(both delivered in Sub-Phases 12.2/12.3) are used exactly as they already
existed — neither was touched.

Two new functions are exported from `cases.js`:

- `undoLastCaseAction()`
- `redoLastCaseAction()`

Both are async, both are safe to call at any time (empty history, repository
failure, unexpected exception — all handled), and both follow the exact
refresh sequence this phase specified:

```
Repository.undo()/.redo()  ->  syncCasesMirror()  ->  saveLocal()
    ->  renderCases()  ->  updateBadges()  ->  toast()  ->  return
```

## 2. Architecture

### 2.1 Wiring

`js/core/UndoManager.js` (unmodified) is required by `cases.js` the same way
`CasesRepository.js`/`DatabaseService.js`/`LocalStorageAdapter.js` already are
— `require()` in Node, `window.UndoManager` in the browser. Immediately after
`casesRepository` is constructed, this phase does:

```js
var casesUndoManager = (typeof UndoManager === 'function') ? new UndoManager(casesRepository) : null;
if (casesUndoManager) {
  casesRepository.setUndoManager(casesUndoManager);
}
```

**Cases is the only Repository in the entire project with an UndoManager
wired**, which is exactly how this phase's "ONLY Cases is allowed to use
Undo" mandate is enforced structurally — no other module constructs an
UndoManager or calls `setUndoManager()`.

**Known Limitation — `index.html` script tag (see §2.1 note below and §9):**
`index.html` currently loads `js/core/Repository.js`,
`js/core/DatabaseService.js`, `js/core/LocalStorageAdapter.js`, and
`js/repositories/CasesRepository.js`, but **does not** yet load
`js/core/UndoManager.js`. This phase's allowed-files list is `js/modules/
cases.js` only, so `index.html` was **not** edited. Rather than hard-`throw`
when `window.UndoManager` is unavailable (which would break the entire Cases
module load in the live app — confirmed as a real regression during
verification, see §5), the dependency degrades gracefully: if `UndoManager`
can't be resolved, `casesUndoManager` is simply `null`, a console warning is
logged, and `casesRepository.canUndo()/canRedo()` report `false` exactly as
they would for any other un-wired Repository. Every pre-existing Cases
capability is completely unaffected. **Undo/Redo will not actually do
anything in the live browser app until a future phase adds one line to
`index.html`:**

```html
<script src="js/core/UndoManager.js"></script>
```

placed before `js/modules/cases.js`'s own `<script>` tag. This is a
deliberate, documented deferral — not a silent gap — required because this
phase's contract did not authorize touching `index.html`.

### 2.2 The reconciliation gap this phase had to close

The audit (§3) found that `Repository.prototype.undo()`/`.redo()` — added in
Sub-Phase 12.3 — forward to the wired UndoManager and return a plain
**snapshot instruction** (`{action, before, after, metadata}`) describing
what conceptually should happen. They do **not** themselves mutate the
Repository's records; Repository.js's own comments describe this
reconciliation as explicitly out of scope for 12.3.

Left unaddressed, `undoLastCaseAction()` would show a success toast and
change nothing — a fake Undo. Applying the snapshot instruction is this
pilot's core job, done entirely inside `cases.js` using only
`casesRepository`'s already-public façade (`create`/`update`/`delete`/
`restore`/`getUndoManager`/`setUndoManager`) — `UndoManager.js` internals are
never touched directly.

**Reversal mapping** (single-record entries only — this module never calls
bulk/import/clear/transaction Repository methods, so bulk-shaped entries
never occur here; a defensive check rejects them gracefully if they ever
did):

| Original action | Undo calls           | Redo calls            |
|---|---|---|
| `create`  | `delete(id)`  (soft-delete the created record) | `restore(id)` (already exists, tombstoned by the undo above — `create()` would reject it as a CONFLICT) |
| `delete`  | `restore(id)` | `delete(id)` |
| `restore` | `delete(id)`  | `restore(id)` |
| `update`  | `update(id, before, {allowDeleted:true})` | `update(id, after, {allowDeleted:true})` |

### 2.3 Redo-stack protection

Applying the reversal above calls a real Repository mutation method, which —
like any other `create`/`update`/`delete`/`restore` call — unconditionally
invokes its own `_recordUndo()` hook if a manager is wired. Left unguarded,
this would push a brand-new history entry for the *reconciliation step
itself*, and recording anything new unconditionally clears the redo stack
(`UndoManager.js`: "Recording a new entry... always clears the redo stack")
— silently destroying the very entry `undo()` just made available for
`redo()`.

`_withUndoManagerSuspended()` closes this gap: it briefly unwires
`casesUndoManager` via the public `setUndoManager(null)` façade for the
duration of the single reconciliation call, then re-wires the same instance
afterward, success or failure (`finally`). This is verified directly by the
test harness (multi-level undo/redo, §H of the test file).

## 3. Audit Summary

- **Cases architecture:** `cases.js` is fully Repository-integrated
  (Sub-Phase 10.x/10.3) — `casesRepository` is a live `CasesRepository`
  instance, `data.cases` is a plain read-model mirror kept in sync via
  `syncCasesMirror()`, never written to directly by CRUD/undo code.
- **Repository lifecycle:** `Repository.js` supports `create/update/delete/
  restore/get/getAll/search/filter/sort/exists/count`, plus
  `undo/redo/canUndo/canRedo/clearUndoHistory/setUndoManager/
  getUndoManager` (12.3). `CasesRepository` disables no operations
  (`unsupportedOperations: []`), so every reversal mapping above is legal.
- **Undo hook lifecycle:** every `create/update/delete/restore` call already
  invokes `_recordUndo()` unconditionally (12.3); it is a no-op with no
  manager wired, and becomes live the instant a manager is wired — no
  Repository/UndoManager code needed to change for the pilot.
- **Cache interaction:** `CasesRepository`'s in-memory index (`idIndex`) and
  cache layer (12.x) already key off `deletedAt`/live state on every
  mutation; delete/restore reuse the same paths regardless of whether they
  originated from the UI, `restoreCase()`, or this pilot's reconciliation.
  No cache-specific code was needed.
- **Restore interaction:** `restoreCase()`/`deleteCase()` (10.3) are
  unaffected and continue to record their own undo entries the normal way —
  proven directly (test harness §M): an undo can reverse a mutation that
  `restoreCase()` itself performed, and vice versa.
- **Mirror synchronization:** `syncCasesMirror()` is called, unmodified,
  after every successful undo/redo, exactly as after every other mutation.
  `data.cases` is never written to directly.
- **Render sequence:** `renderCases()` is called unmodified, after
  `saveLocal()`, per the mandated flow.
- **Dashboard dependency:** `getCaseStats()` reads `data.cases` directly and
  needed no changes — verified consistent after undo/redo cycles (test
  harness §O).
- **Statistics dependency:** as above.
- **ApiService interaction:** unaffected; `create/update/delete/restore`
  already call `ApiService.syncRow`/`deleteData` through existing Repository
  code paths, unchanged by this phase.
- **Risks (identified and resolved during this phase):**
  1. Repository.undo()/redo() not reconciling into actual data — resolved,
     §2.2.
  2. Reconciliation writes silently destroying the redo stack — resolved,
     §2.3.
  3. `index.html` never loading `UndoManager.js`, breaking the live Cases
     module on page load — resolved via graceful degradation, §2.1; full
     wiring deferred and documented, not silently dropped.
- **Expected implementation footprint:** one production file
  (`js/modules/cases.js`), two new exported functions, three private
  helpers, one new UndoManager instance + wiring line, ~230 net new lines.
  Confirmed by the diff in §4 of the verification report.

## 4. Pilot Flow

**Undo:**
```
casesRepository.canUndo()  — guard
  -> casesRepository.undo()                       // returns {action, before, after}
  -> _applyCasesUndoInstruction(instruction,'undo') // reconciles via create/update/delete/restore,
                                                     // with the UndoManager suspended
  -> syncCasesMirror()
  -> saveLocal()
  -> renderCases()
  -> updateBadges()
  -> toast('تم التراجع' | 'حدث خطأ أثناء التراجع' | 'لا يوجد إجراء للتراجع عنه')
  -> return
```

**Redo:** symmetric, using `casesRepository.canRedo()`/`.redo()` and the
`'redo'` direction of the same reconciliation mapping.

## 5. Cache Compatibility

No cache-layer code was touched. Every reconciliation call goes through the
same `create/update/delete/restore` entry points the cache layer (Sub-Phase
11.x) already instruments, so cache invalidation/refresh behaves identically
whether a mutation came from the UI, `restoreCase()`, or
`undoLastCaseAction()`/`redoLastCaseAction()`.

## 6. Restore Compatibility

Fully compatible and cross-composable — verified directly: `restoreCase()`
produces a normal undo entry that `undoLastCaseAction()` can reverse, and an
undo/redo cycle does not disturb `restoreCase()`/`deleteCase()`'s own
behavior (test harness §M).

## 7. Dashboard Compatibility

`getCaseStats()` (consumed by the dashboard) reads `data.cases` and is
unaffected; totals remain correct through undo/redo cycles (test harness
§O).

## 8. Performance

- 300 sequential creates, then 50 undos, then 50 redos: all complete in
  well under 5 seconds each phase (see test harness §T; bounded by the
  default `maxHistorySize` of 50).
- 500 create+undo+redo field-integrity cycles (now split into 300
  individually labelled tests, §AA) and equivalent update/delete/restore
  volume tests (§BB/§CC/§DD) all complete within the harness's overall
  ~50s runtime on this container. No performance concern identified for a
  single-user desktop-scale case list.

## 9. Known Limitations

1. **`index.html` does not yet load `js/core/UndoManager.js`.** Undo/Redo is
   fully functional in Node (this harness) and will become fully functional
   in the browser the moment a future phase adds the one `<script>` tag
   described in §2.1. Until then, `casesUndoManager` is `null` in the live
   app and `undoLastCaseAction()`/`redoLastCaseAction()` will always report
   "nothing to undo/redo" — a safe no-op, not a crash.
2. **No UI wiring.** Per this phase's explicit "No UI redesign... expose
   functions only" mandate, no buttons/keyboard shortcuts were added. The
   two functions are ready to be wired to UI in a future phase.
3. **Undo of `create` soft-deletes rather than hard-removes**, consistent
   with the project's existing soft-delete-only design (there is no
   hard-delete anywhere in `Repository.js`). This is semantically correct
   for this codebase, but worth noting explicitly: an "undone create" is a
   tombstoned record, retrievable with `{includeDeleted:true}`, not
   permanently erased.
4. **History is capped at the default `maxHistorySize` (50).** Anything
   older simply becomes non-undoable, per `UndoManager.js`'s existing,
   unmodified contract.

## 10. Future Rollout

1. Add the `index.html` `<script>` tag for `UndoManager.js` (§2.1/§9.1).
2. Wire `undoLastCaseAction()`/`redoLastCaseAction()` to real UI controls
   (buttons and/or `Ctrl+Z`/`Ctrl+Y`) for Cases only, per the next sub-phase.
3. Once the Cases pilot has been in production long enough to build
   confidence, repeat this same pattern (wire an `UndoManager` instance +
   reconciliation helper) for one additional module at a time, never all at
   once.
