# Transaction_Consistency_Report.md
## نظام الحسام للمحاماة — V10 Offline-First Architecture
### PHASE 11 — SUB-PHASE 11.2.1 — Transaction Consistency Hardening
**Date:** 2026-07-12

---

## Executive Summary

SUB-PHASE 11.2 (`Repository_API_Consistency_Report.md`) added a
soft-delete guard to `update()` and `bulkUpdate()` (FIX 1/FIX 2) but,
per that report's own "Remaining Technical Debt" section, left
`transaction()`'s `{op:'update'}` step unguarded, tracked as **T-10**.
This sub-phase closes T-10: `transaction({op:'update'})` now enforces
the exact same soft-delete guard, in the exact same way, as
`update()`/`bulkUpdate()` — by calling one shared private helper,
`Repository.prototype._stageUpdate()`, from all three call sites,
instead of maintaining three parallel copies of guard/merge/validate
logic.

**Verdict: PASS.**

---

## Audit Summary

`js/core/Repository.js` was read in full (1409 lines, pre-phase) before
any modification, focusing on the write-path methods named in this
phase's objective:

| Method | Guard present before this phase? |
|---|---|
| `update(id, patch, options)` | Yes — FIX 1 (Phase 11.2): rejects a soft-deleted target unless `options.allowDeleted` |
| `bulkUpdate(patches[])` | Yes — FIX 2 (Phase 11.2): same guard, per-item, via `patches[i].allowDeleted` |
| `transaction([{op:'update', id, patch}])` | **No.** The step performed its own inline `findIndex` → `Object.assign` merge → `_validate('update', ...)` sequence, with no soft-delete check anywhere in that path. |
| `rollback` (transaction try/catch + `_onRollback`) | Present and correct; not itself the defect — it faithfully rolls back whatever the update step lets through, including edits it should have refused |
| `restore` (both standalone and the `{op:'restore'}` transaction step) | Present, correct, out of this phase's scope — untouched |
| `delete` (both standalone and the `{op:'delete'}` transaction step) | Present, correct, out of this phase's scope — untouched |
| `persist` (`_persist()`, single-write-per-call-commit semantics) | Present, correct, out of this phase's scope — untouched |
| `validation` (`_validate()` hook) | Present, correct; confirmed to still run, and to still run **after** the guard, in all three call sites post-fix |

**Confirmed:** `transaction({op:'update'})` bypassed the deleted-record
guard entirely — not a partial or conditional bypass, the check was
simply absent from that code path. It did **not** duplicate `update()`'s
logic byte-for-byte (its merge/validate lines were a separately
hand-written near-copy, already slightly divergent in error-message
text from `update()`'s), which is itself a symptom of the same root
cause: three independent implementations of one concept, free to drift.

**Root cause:** SUB-PHASE 11.2 added the guard to `update()` and
`bulkUpdate()` as two separate inline edits and explicitly scoped
`transaction()` out ("out of this phase's exact scope" —
`Phase11_2_Verification_Report.md`, "Known Issues"). No shared
implementation existed for either sub-phase to reuse, so the omission
was structural, not accidental: there was no single place a fix to one
call site would have automatically propagated to the other two.

---

## Fix

### Design

A new private instance method, `Repository.prototype._stageUpdate(existing, patch, allowDeleted, label)`,
is now the **single** place that:

1. Checks `!allowDeleted && this._isDeleted(existing)` → returns a
   `CONFLICT` error object (never throws — see below) if the guard
   fires.
2. Merges `patch` onto `existing` via `Object.assign`, preserving the
   id field exactly as `update()` always has.
3. Runs `this._validate('update', merged)` and returns a `VALIDATION`
   error object if it fails.
4. Otherwise returns `{ok:true, merged}`.

It deliberately never throws — `update()`/`bulkUpdate()` want a
`WriteResult`-shaped failure to return, while `transaction()` wants to
`throw` (its existing try/catch-based rollback mechanism already
converts any thrown error into a full rollback). Each of the three call
sites decides for itself how to surface a `{ok:false, error}` outcome,
but none of them re-derive *what* the outcome should be — that logic now
lives in exactly one place.

### Call sites, before → after

- **`update(id, patch, options)`** — its guard/merge/validate block
  (previously ~20 inline lines) is replaced by one call:
  `this._stageUpdate(existing, patch, allowDeleted, 'update()')`. Every
  other line of `update()` (index lookup, metadata, persist, rollback-
  on-persist-failure) is untouched.
- **`bulkUpdate(patches[])`** — same replacement, per loop iteration,
  with a per-item label (`'bulkUpdate() item #' + i`) so error messages
  stay item-specific.
- **`transaction()`'s `{op:'update'}` step** — same replacement. This is
  the actual T-10 fix: the step now calls `_stageUpdate(working[uIdx],
  step.patch, !!step.allowDeleted, 'transaction() step #' + i + ' (update)')`
  and `throw`s `uStaged.error` on failure, which the transaction's
  existing `catch` block (unchanged) already turns into a full,
  no-partial-write rollback.

### New surface: `allowDeleted` on a transaction update step

Per-step opt-out now exists, mirroring `bulkUpdate()`'s per-item shape:

```js
repo.transaction([
  { op: 'update', id: 'x1', patch: { name: 'edited-while-deleted' }, allowDeleted: true }
]);
```

Omitting it (or passing `false`) preserves the new, correct default:
reject a soft-deleted target.

---

## Code Changes

**File modified: `js/core/Repository.js` only** (per this sub-phase's
constraint — no other file required a dependent change).

- **+88 / −44 lines** (net +44), 3 edit sites:
  1. New `Repository.prototype._stageUpdate()` method inserted between
     `create()` and `update()` (~48 lines, all new).
  2. `update()` body: 24 lines of inline guard/merge/validate replaced
     by a 4-line call to `_stageUpdate()`.
  3. `bulkUpdate()` body: same replacement inside its loop.
  4. `transaction()`'s `{op:'update'}` branch: same replacement, plus
     updated JSDoc for `transaction()` itself (ops-array type signature
     now documents `allowDeleted?:boolean` on the update variant, and a
     `{op:'restore', id}` variant that existed in code but was missing
     from the type union comment — a pre-existing doc gap, fixed as a
     trivial byproduct of touching this comment block, not a behavior
     change).

No other method (`create`, `delete`, `restore`, `bulkInsert`,
`bulkDelete`, `import`, `export`, `clear`, the `{op:'create'}` /
`{op:'delete'}` / `{op:'restore'}` transaction steps, any `_guard*`
method, `_persist`, `_attachMetadata`, `_isDeleted`, `_indexOf`,
`_validate`, `_matchesFilter`, `_queryInternal`, or the constructor) was
touched.

---

## Compatibility

**Fully backward compatible except for the one deliberate behavior
change this sub-phase's objective requires.**

- Every existing `{op:'update', id, patch}` step **without** a
  soft-deleted target is byte-for-byte unaffected — same merge, same
  validation, same metadata, same result shape.
- Grep-confirmed zero production Module call sites use `transaction()`
  at all today (same finding as `Repository_API_Consistency_Report.md`
  — `transaction()` has no Module caller yet), so this is a zero-risk
  change from a live-application standpoint: nothing in `js/modules/*.js`
  observes any difference.
- The one intentional behavior change: a `transaction()` update step
  targeting a soft-deleted record, previously silently applied, now
  requires `allowDeleted:true` — exactly mirroring `update()`/
  `bulkUpdate()`'s Phase 11.2 behavior, which is the whole point of this
  sub-phase (closing the inconsistency, not preserving it).
- `verify_repository_api_consistency.js` §K4 previously asserted the old
  (bypassing) behavior as a documented gap; it has been rewritten (see
  "Test File Changes" below) to assert the new, guarded behavior instead
  — the same precedent Phase 11.2 itself set when it updated 2 test
  files whose assertions had become stale by its own fix.

---

## Test File Changes

| File | Type | Change | Justification |
|---|---|---|---|
| `js/tests/verify_repository_api_consistency.js` | Test | §K4 rewritten from "documents transaction(update) bypasses the guard" to "confirms transaction(update) now enforces the guard, matching update()/bulkUpdate(), including its allowDeleted opt-out". Section-K header comment in the file's top-of-file summary updated to match. | The old K4 asserted `res.success === true` for a transaction update against a soft-deleted record with no `allowDeleted` — that assertion is now false by design; leaving it unedited would make the regression suite self-contradictory (asserting the pre-fix bug as correct behavior) and produce a false "regression" against this sub-phase's own intended fix. Same category of edit Phase 11.2 itself made to 2 test files for the identical reason. |
| `js/tests/verify_transaction_consistency.js` | Test (new) | Full new harness, 45 test blocks / 156 static `assert.*` call sites / **453 assertions executed at runtime** (stress sections loop 40, 15, and 30 times respectively) | This sub-phase's mandated new test file |

No test file's *unrelated* assertions were touched. No production file
other than `Repository.js` was touched.

---

## Regression

**Full suite re-run, this session, after the fix:**

| Result | Count |
|---|---|
| Total checks passed (all runnable harnesses, excluding pre-existing broken ones) | **1097** |
| Total checks failed | **2** (both pre-existing, explained below — unrelated to this phase) |
| Pre-existing broken harnesses (T-07, `MODULE_NOT_FOUND`) | 6 — unaffected, unrelated, unchanged |
| New harness (`verify_transaction_consistency.js`) | 45/45 blocks passed, 453 runtime assertions, 0 failures |
| Modified harness (`verify_repository_api_consistency.js`) | 66/66 passed (was 66/66 pre-phase too — same count, K4's assertions changed but its pass/fail outcome under the *new* code is still a pass) |
| `node --check` against every `.js` file under `js/` | Zero syntax errors |

**The 2 pre-existing failures** (`verify_cases_repository_wiring.js`
41/42, `verify_repository_wiring_all.js` 139/140) are stale MD5-style
pin checks asserting `Repository.js` is "untouched by this phase" — a
Phase-8-era invariant that has been failing since Phase 11.2 itself
first touched `Repository.js`, and continues to fail (identically, by
design) whenever any phase legitimately modifies that file. **Verified
this session** by re-running both harnesses against an unmodified,
pre-11.2.1 copy of `Repository.js` — both fail identically there too,
confirming they are unrelated to this sub-phase's specific change.

**One additional pre-existing issue surfaced during this session's full
regression pass, unrelated to T-10:** `verify_templates_repository.js`
prints `55 passed, 0 failed (of 55 total checks)` and then crashes with
an unhandled promise rejection from one `check()` call (line ~336) whose
callback is `async` but is registered with the synchronous `check()`
helper rather than `checkAsync()`, so its rejection is never awaited or
caught. The rejecting assertion itself (line 338) exercises the
*pre-Restore-System* pattern `update(id, {deletedAt:null})` as an
improvised "restore," which Phase 11.2's `update()` guard (FIX 1)
correctly now refuses without `allowDeleted:true` — the same obsolete
pattern that `Phase11_2_Verification_Report.md` already identified and
fixed in `verify_documents_repository.js` ("1 block (3 assertions)
updated: obsolete pre-`restore()` pattern → `repo.restore()`"), but which
was never made in `verify_templates_repository.js`, an apparent gap in
that phase's own file-by-file sweep. **Confirmed this session** by
running the same harness against an unmodified, pre-11.2.1 copy of
`Repository.js` — it fails identically there, proving this is pre-
existing and outside this sub-phase's exact scope (`Repository.js`
only). Logged below as a new debt item rather than fixed, per this
project's established discipline of not silently expanding a phase's
file-modification scope.

**Zero new regressions.** No harness that passed before this sub-phase
now fails, and no harness's failure reason has changed.

---

## Performance

**None measurable.** `_stageUpdate()` performs exactly the same work
(`_isDeleted` check, `Object.assign` merge, `_validate()` call) that
`update()`/`bulkUpdate()` already performed inline, now behind one
function call instead of duplicated inline code — a negligible,
non-asymptotic call-overhead difference, not a new O(n) or O(n²) code
path. `transaction()`'s update step gained the exact same single `_isDeleted()`
boolean check `update()`/`bulkUpdate()` already had, in front of its
existing O(1)-per-step working-array lookup — no new scan, no new
persist call, no new rendering (this phase touches no UI code).

---

## Remaining Technical Debt

Everything in `Technical_Debt_Report.md` (T-02 through T-07) and
`Repository_API_Consistency_Report.md`'s `find()`-`includeDeleted` gap
remain open exactly as described, unaffected by this sub-phase.

- **T-10 — Resolved by this sub-phase.** `transaction({op:'update'})` now
  shares `update()`/`bulkUpdate()`'s exact guard via `_stageUpdate()`.
- **T-11 (new, LOW severity, discovered not caused):**
  `verify_templates_repository.js` has one `check()`-wrapped `async`
  callback whose rejection is never awaited (a harness bug, not a
  production bug), tripping over an obsolete pre-Restore-System
  `update(id,{deletedAt:null})` "restore" pattern that Phase 11.2's
  `update()` guard already correctly rejects. Confirmed pre-existing
  (present against pre-11.2.1 `Repository.js` too) and out of this
  sub-phase's exact scope (`Repository.js` only, per this phase's
  constraint). Recommended fix (future micro-phase, mirroring the
  identical fix already applied to `verify_documents_repository.js` in
  Phase 11.2): replace the obsolete pattern with `dRepo.restore(id)` and
  change that one `check(` call to `checkAsync(`.
- `find()` has no `includeDeleted` option — unchanged, LOW severity, no
  current Module call site relies on one.

T-01 and T-09 remain **Resolved**, unaffected by this sub-phase.

---

## Verdict

```
TRANSACTION CONSISTENCY AUDIT COMPLETE

PASS
```
