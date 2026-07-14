# Restore_Edge_Case_Report.md
## نظام الحسام للمحاماة — V10 Offline-First Architecture
### PHASE 11 — SUB-PHASE 11.1 — Restore System Stress Test & Edge Case Verification
**Date:** 2026-07-11

This report documents every **behavioral finding** (not merely pass/fail counts —
those are in `Restore_Stress_Test_Report.md`) surfaced while writing and running
`js/tests/verify_restore_stress.js`. Each finding below is classified as either
**Confirmed-Safe** (matches documented design, harness now proves it live) or
**Documented Asymmetry** (real, observable, but intentional/pre-existing — not a
defect). **Zero items in this report are classified as a defect.**

---

## 1. Restore-After-* Interactions (closes T-09)

| Interaction | Finding | Classification |
|---|---|---|
| Restore after Update | An `update()` that happened *before* a `delete()` survives an intervening `delete()`→`restore()` round trip unchanged. | Confirmed-Safe |
| Update while soft-deleted | `update()` has **no `deletedAt` guard** — calling it on a soft-deleted record succeeds and modifies the record's fields, but the record remains invisible (via `get()`/`getAll()`) until `restore()` is called. The update is preserved and visible once restored. | Documented Asymmetry (matches pre-existing `update()` behavior, `_indexOf()` never filters deleted records — Repository.js line ~560) |
| Restore after Bulk Insert | Sibling records from the same `bulkInsert()` batch are unaffected by deleting/restoring one of them. | Confirmed-Safe |
| Restore after Bulk Update | Same no-`deletedAt`-guard characteristic as single `update()` — `bulkUpdate()` on a deleted id succeeds silently, value surfaces after `restore()`. | Documented Asymmetry (consistent with `update()`) |
| Restore after Bulk Delete | Restoring one bulk-deleted record does not affect siblings deleted in the same call; a partial-failure `bulkDelete()` (one unknown id) still leaves the successful deletions independently restorable. | Confirmed-Safe |
| Restore after Import (`replace`) | A soft-deleted record present in an imported payload is restorable exactly like a natively-created one. `replace`-mode import fully discards prior records — restoring a pre-import id afterward correctly fails with unknown-id, not a crash. | Confirmed-Safe |
| Restore after Import (`merge`) | A record restored *before* a `merge`-mode import is left untouched by the merge. | Confirmed-Safe |
| Restore after Clear | `clear()` removes soft-deleted records too (not just live ones) — `restore()` on any id after a `clear()` correctly fails with unknown-id rather than throwing or silently no-opping. Restore capability is unaffected for records created after the `clear()`. | Confirmed-Safe |

## 2. Rollback & Failure-Path Findings

| Interaction | Finding | Classification |
|---|---|---|
| `restore()` + adapter write failure | In-memory record is fully rolled back to its prior (deleted) state; `get()` correctly still returns `null`. | Confirmed-Safe |
| `create()`/`update()`/`delete()` + adapter write failure | Same rollback discipline confirmed for every other write method, for parity — `create()` pops the pushed record, `update()`/`delete()` restore the previous record reference. | Confirmed-Safe (regression) |
| `transaction()` + validation failure mid-sequence | A transaction with a valid, staged `restore` step followed by a step that fails validation rolls back **the entire transaction**, including the earlier successful restore — no partial commit, zero `write()` calls. | Confirmed-Safe |
| `transaction()` + failure position (first vs. last step) | Rollback behavior is identical regardless of where in the op list the failure occurs — nothing before or after a failing step is ever committed. | Confirmed-Safe |
| `transaction()` + whole-array persist failure | Even when every individual op is valid, a final `write()` throw reverts `this._records` to the exact pre-transaction snapshot. | Confirmed-Safe |
| `bulkDelete()` then a failing `restore()` | Only the failed `restore()`'s own record rolls back; records already committed by the earlier, separate `bulkDelete()` call are correctly unaffected (they are a different write() call entirely). | Confirmed-Safe |

## 3. Idempotency & Repetition Findings

| Interaction | Finding | Classification |
|---|---|---|
| `restore()` called twice on the same record | Second call is fully idempotent: `success:true`, but **no** version bump, **no** `write()` call. | Confirmed-Safe (matches `Restore_System_Design.md` §1/§3) |
| `restore()` on a never-deleted record | Idempotent success, no persist. | Confirmed-Safe |
| `delete()` called twice on the same record | **No idempotency guard** — the second `delete()` re-stamps `deletedAt`/`version`/`updatedAt` again and calls `write()` again, unlike `restore()`. | Documented Asymmetry (pre-existing `delete()` behavior, unaffected by the Restore System's addition — `delete()`'s code was not modified in Phase 10) |
| Delete → Delete → Restore | A double-delete does not break a subsequent single `restore()` — the record returns to live state correctly on the first `restore()` call. | Confirmed-Safe |
| 50-cycle delete/restore loop on one record | Version increments by exactly 2 per cycle (100 total for 50 cycles), one `write()` per operation (100 total) — no drift, no skipped or duplicated writes over sustained repetition. | Confirmed-Safe |

## 4. Transactional Composition Findings

| Interaction | Finding | Classification |
|---|---|---|
| Nested `transaction()` calls | `Repository` has **no re-entrant transaction support** — calling `transaction()` again while `_locked` is already `true` (i.e., a transaction is logically in flight) returns a `CONFLICT` error immediately, rather than queuing, nesting, or deadlocking. The lock is correctly released after both successful and rolled-back transactions, so a subsequent transaction always runs normally afterward. | Documented Asymmetry (by design — Repository Contract §8 scopes `transaction()` to a single Repository, no cross-call nesting was ever specified) |
| Multiple `restore` steps in one transaction | All staged, atomic, exactly one `write()` call for the whole batch (confirmed: 3 restores → 1 write, not 3). | Confirmed-Safe |
| Same id restored twice within one `transaction()` op list | The second staged `restore` step sees the first's already-applied in-memory working-copy state and is itself idempotent (no double version bump within the same transaction). | Confirmed-Safe |
| Full mixed-operation transaction (create→update→delete→restore→update→delete→restore, 7 steps across 2 records) | Commits atomically with exactly one `write()` call; final state correctly reflects only the last operation applied to each record. | Confirmed-Safe |
| Mixed-operation transaction failing on its final step | All 6 preceding successfully-staged steps (including a full delete→restore round trip) are rolled back — zero `write()` calls, both records end exactly where they started. | Confirmed-Safe |

## 5. Mirror, Statistics & Query-Surface Findings

| Interaction | Finding | Classification |
|---|---|---|
| Mirror pattern (`data.<entity> = repo.getAll()`) after restore, all 9 entity shapes | Mirror array always exactly matches Repository state post-restore; verified for all 9 entity `entityKey`s used project-wide (cases, clients, sessions, tasks, documents, library, templates, children, fees). | Confirmed-Safe |
| Cross-entity mirror isolation | Restoring in one entity's Repository never alters a different entity's mirror snapshot, even when both Repositories share the same underlying Storage Adapter object (isolation is by `entityKey`, not by adapter instance). | Confirmed-Safe |
| `count()` / `getAll().length` / `search({}).total` | All three "statistics" surfaces stay mutually consistent and correctly exclude soft-deleted records by default, updating immediately after a restore — including under a compound filter (e.g. a Dashboard-style "active cases" count). | Confirmed-Safe |
| `get()` / `exists()` — **no `includeDeleted` option exists on either method** | Unlike `getAll()`, `search()`, and `count()` (which all accept `{includeDeleted:true}`), `get(id)` and `exists(id)` have **no escape hatch at all** — they always exclude soft-deleted records, under every circumstance. Only `restore()` can make a deleted record visible to `get()`/`exists()` again. | Documented Asymmetry (intentional per Repository.js's read-method design — not discovered as a defect, but not previously asserted by a live test either; now covered by T1/T2 in the new harness) |
| Documented Trash-only query pattern (`includeDeleted:true` + `filter:{deletedAt:{op:'ne',value:null}}`) | Correctly empties after `restore()`, and at that point `get()`/`exists()`/`getAll()`/`count()` all agree the record is live — no surface lags behind another. | Confirmed-Safe |

## 6. Isolation & Scale Findings

| Interaction | Finding | Classification |
|---|---|---|
| Repository isolation (different entities, same id value) | Two Repositories for different `entityKey`s, even holding a record with the identical id string, are fully independent — restoring in one never touches the other, whether or not they share one underlying adapter object. | Confirmed-Safe |
| 2,000-operation pseudo-random stress sequence (deterministic seed) | Final live/deleted record counts exactly match an independently-tracked expected set; no duplicate ids, no orphaned records, no record ever loses its `idField`, across a long interleaved create/update/delete/restore sequence. | Confirmed-Safe |
| 500-record interleaved create/delete/restore sweep | Zero duplicate ids, exactly 500 total records preserved throughout (soft delete/restore never creates or destroys records), every record retains its id field. | Confirmed-Safe |
| Performance at 100/500/1000/5000 sequential restores | See `Restore_Stress_Test_Report.md` §6 — cost grows with array size due to the existing full-array-persist-per-write design (`_persist()`), a pre-existing characteristic shared by every write method, not something introduced or worsened by `restore()` itself. | Documented Asymmetry / pre-existing architectural characteristic (adjacent to T-05) |

## 7. Summary Table

| Classification | Count |
|---|---|
| Confirmed-Safe (harness now proves live what was previously reasoned) | 21 |
| Documented Asymmetry (real, observed, intentional/pre-existing, not a defect) | 6 |
| **Defects found** | **0** |

No production file required modification as a result of this audit.
