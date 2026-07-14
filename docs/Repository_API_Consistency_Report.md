# Repository_API_Consistency_Report.md
## نظام الحسام للمحاماة — V10 Offline-First Architecture
### PHASE 11 — SUB-PHASE 11.2 — Repository Hardening & API Consistency
**Date:** 2026-07-12

---

## Executive Summary

SUB-PHASE 11.2 closes the two open Repository API inconsistencies identified
in `Phase11_Validation_Report.md`'s "Documented Asymmetry" list (items #1 and
#4) and requested explicitly by this sub-phase's own scope:

1. `update()`/`bulkUpdate()` had no `deletedAt` guard — a caller could
   silently edit a soft-deleted record's fields (or even, before this phase,
   accidentally clear `deletedAt` itself) without going through the proper
   `restore()` path.
2. `get()`/`exists()` had no `includeDeleted` option, unlike `getAll()`,
   `search()`, and `count()`.

Both are now resolved by 4 surgical changes to `js/core/Repository.js`
(FIX 1–4 below). No Cache Layer, no IndexedDB, no UI change, and no Module
change was made — Repository Layer only, exactly as scoped. **This is the
last planned change to `Repository.js` before Phase 11.3 (Cache Layer).**

Two pre-existing test harnesses (`verify_documents_repository.js`,
`verify_restore_stress.js`) contained assertions that encoded the *old*,
now-intentionally-changed behavior as correct; both were updated in this
phase to assert the new, correct behavior (see "Files Modified" below —
this is the "proven dependency" this phase's own constraints require before
touching any file besides `Repository.js`).

---

## Architecture Impact

**Contained to `Repository.js`.** No change to `DatabaseService.js`,
`StorageAdapter.js`, `LocalStorageAdapter.js`, any of the 9 entity
Repositories, any Module, `index.html`, or CSS. The layered architecture in
`PROJECT_STATE.md` §4 is unaffected — only the base Repository class's
public-method contract gained two new optional parameters and one new
per-item flag, all backward compatible (see Compatibility Analysis below).

---

## Code Changes (all in `js/core/Repository.js`)

### FIX 1 — `update(id, patch, options?)`

Before merging and persisting, `update()` now checks whether the target
record is currently soft-deleted (`this._isDeleted(existing)`). If it is,
and the caller did not pass `{allowDeleted: true}`, `update()` returns
immediately with:

```js
{ success: false, record: null, error: {
    type: 'ConflictError', recoverable: true,
    message: 'Cannot update record with id "..." in "..." — record is
              soft-deleted. Restore it first, or pass {allowDeleted:true}
              to modify it while deleted.'
} }
```

No mutation, no `_persist()` call. The guard runs **after** the existing
"unknown id" check (unchanged `ValidationError`) and **before**
`_validate()` (so validation still runs normally once the guard is
satisfied — see `verify_repository_api_consistency.js` §M).

`{allowDeleted:true}` restores the exact pre-11.2 behavior for a caller
that genuinely wants to edit a soft-deleted record's fields without
un-hiding it (a real, if narrow, use case — e.g. correcting a typo on a
record pending permanent purge). It does **not** special-case `deletedAt`
in the patch; if a caller's own patch happens to include `deletedAt: null`
*and* they passed `allowDeleted:true`, the merge still clears it exactly
as it always has (this is now the one remaining way `update()` can affect
`deletedAt`, and it requires two explicit opt-ins instead of zero).

### FIX 2 — `bulkUpdate(patches[])` — same guard, per item

Each `patches[i]` may now carry its own `allowDeleted:true`. An item
targeting a soft-deleted record without that flag is rejected with the
same `ConflictError` shape as FIX 1, in the same per-item error-array
position used for "unknown id" today — it does not abort the batch or
affect sibling items. Batch persist/rollback semantics are completely
unchanged: rejected items are simply never staged into the in-memory
working set, so there is nothing new to roll back.

### FIX 3 — `get(id, options?)`

Adds `{includeDeleted?: boolean}`, same shape and default (`false`) as
`getAll()`/`search()`/`count()`. With no `options` argument (or
`includeDeleted:false`), behavior is byte-for-byte identical to before
this phase.

### FIX 4 — `exists(id, options?)`

Same extension as FIX 3, same option shape.

### Not changed (explicitly out of this phase's scope)

- `find()` — still has no `includeDeleted` option and still unconditionally
  skips soft-deleted records. Not requested by this phase's FIX list, and
  `find()`'s predicate-based contract makes an `includeDeleted` flag a
  materially different design question (should the predicate see
  soft-deleted records too?) than the option-object extension used for
  `get()`/`exists()`. Left as-is; flagged in Remaining Technical Debt below
  if a future phase wants it.
- `transaction()`'s `{op:'update'}` step — intentionally **not** given the
  FIX 1 guard. `transaction()` is a distinct code path (its own inline
  merge/validate logic, not a call into `Repository.prototype.update()`),
  and extending it was not in this phase's FIX list (only "Verify find()
  filter() search() count() remain behavior-compatible" and the 4
  numbered fixes — transaction() isn't named). Adding the guard there would
  be a second, unrequested behavioral change to a different method under
  a phase explicitly scoped to "Repository Layer only... No Module changes
  unless absolutely required" and a strict "modify Repository.js" list
  that named 4 specific methods. **Explicitly flagged as remaining
  technical debt** (see below), verified present and unchanged by
  `verify_repository_api_consistency.js` §K4.

---

## Repository Public API Consistency Matrix

All 21 public (non-underscore-prefixed) `Repository.prototype` methods,
confirmed by direct read of `js/core/Repository.js` this session:

| Method | Arguments | Return Type | Sync/Promise | `includeDeleted` | Validation | Errors |
|---|---|---|---|---|---|---|
| `open()` | — | `void` | Promise | n/a | n/a | `StorageError` (open failure) |
| `isReady()` | — | `boolean` | Sync | n/a | n/a | none |
| `getState()` | — | `string` | Sync | n/a | n/a | none |
| `close()` | — | `void` | Sync | n/a | n/a | none |
| `dispose()` | — | `void` | Sync | n/a | n/a | none |
| `create(entity)` | `entity: Object` | `WriteResult` | Promise | n/a (creates are never "deleted") | yes (`_validate('create', ...)`) | `ValidationError`, `ConflictError` (dup id), `StorageError` (persist) |
| `update(id, patch, options?)` | `id, patch, {allowDeleted?}` | `WriteResult` | Promise | n/a — **new in 11.2:** `allowDeleted` guard (not `includeDeleted`; see rationale below) | yes (`_validate('update', ...)`, runs after the FIX 1 guard) | `ValidationError` (unknown id / invalid patch), **`ConflictError`** (soft-deleted, new in 11.2), `StorageError` (persist) |
| `delete(id)` | `id` | `WriteResult` | Promise | n/a | no | `ValidationError` (unknown id), `StorageError` (persist) |
| `restore(id)` | `id` | `WriteResult` | Promise | n/a | no (mirrors `delete()`, not `update()`) | `ValidationError` (unknown id), `UnsupportedOperationError` (`softDelete:false`), `StorageError` (persist) |
| `get(id, options?)` | `id, {includeDeleted?}` | `?Object` | Sync | **yes — new in 11.2** | n/a (read) | none (returns `null`) |
| `getAll(options?)` | `{includeDeleted?}` | `Object[]` | Sync | yes (pre-existing) | n/a | none |
| `find(predicateOrQuery)` | `Function \| Object` | `?Object` | Sync | **no — out of scope, documented above** | n/a | none (returns `null`) |
| `exists(id, options?)` | `id, {includeDeleted?}` | `boolean` | Sync | **yes — new in 11.2** | n/a | none |
| `count(queryModel?)` | `{filter?, search?, includeDeleted?}` | `number` | Sync | yes (pre-existing, via `queryModel`) | n/a | none |
| `bulkInsert(entities[])` | `Object[]` | `WriteResult[]` | Promise | n/a | yes (per item, `'create'`) | `ValidationError` (per item), `StorageError` (persist, all-or-nothing) |
| `bulkUpdate(patches[])` | `{id, patch, allowDeleted?}[]` | `WriteResult[]` | Promise | n/a — same `allowDeleted` shape as `update()`, per item, new in 11.2 | yes (per item, `'update'`, runs after the FIX 2 guard) | `ValidationError` (per item, unknown id / invalid patch), **`ConflictError`** (per item, soft-deleted, new in 11.2), `StorageError` (persist, all-or-nothing) |
| `bulkDelete(ids[])` | `string[]` | `WriteResult[]` | Promise | n/a | no | `ValidationError` (per item, unknown id), `StorageError` (persist, all-or-nothing) |
| `search(queryModel?)` | `{filter?, search?, sort?, offset?, limit?, projection?, includeDeleted?}` | `QueryResult` | Sync | yes (pre-existing) | n/a | none |
| `export()` | — | `Object[]` | Sync | always includes deleted (backup semantics, unconditional — no option needed) | n/a | none |
| `import(entities[], mode?)` | `Object[], 'replace'\|'merge'` | `ImportResult` | Promise | n/a (accepts records as-is, including any `deletedAt` already on them) | no (trusted-source, by design) | `ValidationError` (unknown mode), `StorageError` (persist) |
| `clear()` | — | `WriteResult` | Promise | n/a | no | `StorageError` (persist) |
| `transaction(ops[])` | `Array<{op, ...}>` | `TransactionResult` | Promise | n/a (each op type has its own semantics; `restore` op is idempotent like `restore()`, `update` op has **no** FIX 1 guard — see Remaining Technical Debt) | yes (`create`/`update` steps) | `ValidationError`, `ConflictError` (dup id / re-entrant lock), `UnsupportedOperationError` (`restore` op on `softDelete:false`), `StorageError` (persist) |

**Why `update()`/`bulkUpdate()` use `allowDeleted` and not `includeDeleted`:**
`includeDeleted` (FIX 3/4, `get`/`exists`, and pre-existing on
`getAll`/`search`/`count`) is a **read-visibility** flag — "should this
deleted record be part of the result set at all?" `allowDeleted` (FIX 1/2)
is a **write-permission** flag — "may this write proceed against a record
that is currently deleted?" They answer different questions on different
method families; reusing the same option name across both would blur that
distinction rather than clarify it, so this phase intentionally used two
names.

---

## Compatibility Analysis

**Fully backward compatible for every existing call site in this project.**
Grep confirms zero production call sites (Modules or Repositories) invoke
`get()`, `exists()`, `update()`, or `bulkUpdate()` with a 2nd/3rd positional
argument today:

```
grep -rn "Repository\.get(\|epository\.exists(" js/     -> zero matches
grep -rn "\.update(\|\.bulkUpdate(" js/modules/*.js      -> all 2-arg calls
                                                             (id, patch) or
                                                             (patches[]) only
```

Every one of the 9 Modules' `update<Entity>()`/edit flows calls
`XRepository.update(existingId, obj)` with exactly 2 arguments, and only
ever on a record the UI is currently rendering — which, by construction,
is never a soft-deleted record (soft-deleted records are excluded from
`getAll()`/`search()`, so they never appear in an editable list/row in the
first place). **No Module will ever hit the new FIX 1 `ConflictError`
path in normal use** — the guard is a correctness backstop against a
theoretical direct-Repository-call bug, not a behavior any existing UI
flow currently exercises. Same conclusion for `bulkUpdate()` — grep finds
zero Module call sites for it at all today.

`get(id)`/`exists(id)` with no 2nd argument behave identically to before
this phase in all 100% of the (currently zero) production call sites, and
in the 3 verification harnesses (`verify_repository_restore.js`,
`verify_restore_stress.js`, `verify_documents_repository_integration.js`
via its underlying repository) that do call them.

---

## Regression Analysis

Full regression suite re-run this session, no file modified beforehand
except the 3 in this phase's exact scope (see "Modification Scope"):

| Harness | Before this phase | After this phase | Delta |
|---|---|---|---|
| `verify_documents_repository.js` | 61/61 | 61/61 | **0** (3 assertions rewritten — see below — net checks unchanged) |
| `verify_restore_stress.js` | 83/83 | 83/83 | **0** (2 assertions rewritten — see below — net checks unchanged) |
| All other 18 runnable harnesses | unchanged | unchanged | **0** |
| `verify_repository_api_consistency.js` (**NEW**) | — | 66/66 (733 individual assertion executions) | **+66 checks** |

**Why 2 pre-existing harnesses needed an assertion rewrite, not just a
pass-through:** `verify_documents_repository.js` step 10 used
`update(id, {deletedAt:null})` as *the documented pattern* for restoring a
soft-deleted record — a pattern written before `restore()` existed
(Phase 5.1) and never updated after Phase 10.2 added the real `restore()`
method. FIX 1 correctly blocks that pattern now (any `update()` on a
soft-deleted record, including one whose patch happens to touch
`deletedAt`, is blocked without `allowDeleted:true`). Similarly,
`verify_restore_stress.js`'s `C3`/`E2` cases were **written specifically
to assert that update()/bulkUpdate() had no guard** — i.e. they encoded
the exact bug this phase fixes as "expected, documented legacy behavior."
Both are now updated to call `repo.restore()` (the correct, current API)
and to assert the new guarded behavior respectively — this is not a scope
violation but the direct, necessary consequence of intentionally fixing a
previously-documented asymmetry; leaving them unedited would have left the
regression suite self-contradictory (asserting old and new behavior
simultaneously) and produced 5 false "regressions."

**Zero unexplained regressions.** The only non-passing results in the full
run are the 2 pre-existing, previously-explained stale-MD5-pin failures
(`verify_cases_repository_wiring.js` 41/42,
`verify_repository_wiring_all.js` 139/140 — both from Phase 8.5, both
unrelated to Repository.js's read/write methods, both unchanged by this
phase) and the 6 pre-existing T-07 `MODULE_NOT_FOUND` harnesses (broken
`require()` paths, unrelated to this phase, unchanged).

---

## Performance Impact

**None measurable.** FIX 1/2 add one `this._isDeleted(existing)` boolean
check (already-computed, O(1)) per `update()`/`bulkUpdate()`-item call,
before the existing merge/validate/persist path — negligible relative to
the pre-existing O(n) `_indexOf()` scan and O(n) `_persist()` full-array
write every write method already performs (T-05, unrelated pre-existing
debt, unchanged by this phase). FIX 3/4 add one boolean-OR check to an
already-O(1) lookup. No new O(n) or O(n²) behavior introduced anywhere.

---

## Remaining Technical Debt

Everything in `Technical_Debt_Report.md` (T-02 through T-07) remains open
exactly as described, unaffected by this phase. In addition, this phase's
own audit surfaces one new, narrow, explicitly-scoped-out item:

- **T-10 (new, LOW severity):** `transaction()`'s `{op:'update'}` step does
  not receive the FIX 1 `allowDeleted` guard — it can still silently edit a
  soft-deleted record's fields inside a transaction, exactly like
  `update()` could before this phase. Deliberately out of this phase's
  exact scope (see "Not changed" above and `verify_repository_api_consistency.js`
  §K4, which asserts and documents this gap live rather than leaving it
  merely described). Low severity because `transaction()` has no
  production Module call site today (grep confirms zero — `transaction()`
  is currently exercised only by test harnesses), so this is a latent
  inconsistency, not an active one. Recommended for a future micro-phase
  if `transaction()` ever gains a real Module caller.
- `find()` has no `includeDeleted` option (documented above under "Not
  changed") — LOW severity, no current Module call site relies on one.

T-01 (no restore path) remains **Resolved** (Phase 10). T-09 (missing
restore-interaction test coverage) remains **verification-closed**
(Phase 11.1) — both unaffected by this phase.

---

## Verdict

```
REPOSITORY API CONSISTENCY AUDIT COMPLETE

PASS
```
