# Cache_Layer_Migration_Plan.md
## نظام الحسام للمحاماة — V10 Offline-First Architecture
### PHASE 11 — SUB-PHASE 11.3 — Cache Layer Design & Architecture Audit
**Date:** 2026-07-12
**Type:** Design + Audit only. No production file modified. No code written.
**This document plans future sub-phases (11.4+). It authorizes nothing itself.**

---

## 1. Governing Principle

Following the exact precedent `Restore_System_Migration_Plan.md` set for
Phase 10 ("Core أولاً، معزول ومُتحقَّق منه بالكامل، قبل أي لمسة UI" — Core
first, isolated and fully verified, before any UI touch) and the Repository
Migration Standard's "smallest safe change... one responsibility per phase":
this plan confines all future implementation work to **exactly one file**,
`js/core/Repository.js`, split into small, independently-verifiable
sub-phases, each ending with a fully working, fully regression-tested
project — never a partially-applied index.

## 2. Proposed Sub-Phase Sequence (Phase 11.4 onward — not started)

### SUB-PHASE 11.4 — `_idIndex` Core (single-record operations only)

**Scope — the only file this sub-phase may modify:** `js/core/Repository.js`.

**In scope:**
- Add `this._idIndex = new Map()` and `this._liveCount = 0` to the
  constructor.
- Build both in `open()`, once, per `Cache_Layer_Architecture.md §2`.
- Swap `_indexOf()`-based lookups for `_idIndex`-based lookups in: `get()`,
  `exists()`, `update()`, `delete()`, `restore()`, `create()`'s duplicate
  check.
- Add the paired index mutations for `create()` and hard-`delete()` per
  `Cache_Layer_Architecture.md §3`.
- Add `_liveCount` maintenance to the same methods.
- Reset both in `dispose()`.
- Add rollback-path rebuilds to every write method touched above.

**Explicitly out of scope for 11.4** (deferred to later sub-phases below):
`bulkInsert`, `bulkUpdate`, `bulkDelete`, `import`, `transaction`, `clear`,
`count()`'s O(1) fast path.

**Rationale for this split:** single-record operations are the most
frequently called (every Module's edit/view/delete flow), the least risky to
change (one record, one index entry), and — critically — `_indexOf()` itself
stays alive and unchanged in the file throughout 11.4 (it is not deleted,
only no longer called from the 6 methods above), so any bug in the new path
can be diagnosed by direct comparison against the still-present old
implementation without needing to revert anything.

**Deliverables:** modified `Repository.js`; new
`js/tests/verify_cache_layer_core.js` harness (id-lookup parity: for every
existing repository-restore/repository-api-consistency/transaction-
consistency test scenario already in the suite, assert `_idIndex.get(id)`
and `_indexOf(id)` agree on every state transition); `docs/Cache_Layer_Core_Report.md`.

### SUB-PHASE 11.5 — Bulk & Import Operations

**Scope:** `js/core/Repository.js` only (same file, next slice).

**In scope:** `bulkInsert`, `bulkUpdate`, `bulkDelete` (soft and hard),
`import()` (`'replace'` and `'merge'`), `clear()` — per
`Cache_Layer_Architecture.md §3`.

**Why split from 11.4:** these are lower-frequency, higher-blast-radius
operations (multi-record mutation in one call) — isolating them into their
own sub-phase means an 11.4 regression (if any) is already caught and fixed
before the higher-complexity bulk paths are touched, consistent with "one
responsibility per phase."

**Deliverables:** modified `Repository.js`; extended
`verify_cache_layer_core.js` (or a new `verify_cache_layer_bulk.js`,
matching this project's existing one-harness-per-concern convention, e.g.
`verify_restore_rollout.js` vs `verify_repository_restore.js`);
`docs/Cache_Layer_Bulk_Report.md`.

### SUB-PHASE 11.6 — Transaction Commit Integration + count() Fast Path

**Scope:** `js/core/Repository.js` only.

**In scope:** full `_idIndex`/`_liveCount` rebuild on `transaction()`'s
successful commit path (Design doc §13); `count()`'s O(1) fast path for the
no-`queryModel` case (Design doc §6).

**Why last:** `transaction()` has zero current production Module callers
(confirmed by grep, multiple prior phases) — lowest real-world urgency,
appropriately sequenced last; `count()`'s fast path depends on `_liveCount`
already being correctly maintained by every write path landed in 11.4/11.5,
so it cannot safely land before them.

**Deliverables:** modified `Repository.js`; extended
`verify_transaction_consistency.js` (three-way parity sections already
established there, per `Transaction_Consistency_Report.md §E`, extended to
also assert index-consistency after commit) or a new
`verify_cache_layer_transaction.js`; `docs/Cache_Layer_Transaction_Report.md`.

### SUB-PHASE 11.7 — Independent Verification & Performance Confirmation

**Scope:** read-only + test files only, no production change.

**In scope:** full regression suite re-run; a dedicated stress harness
(pattern-matched to `verify_restore_stress.js`) exercising 100/1,000/10,000
synthetic records to convert this phase's *estimated* complexity claims
(`Performance_Baseline_Report.md`) into *measured*, live numbers; a
`docs/Cache_Layer_Verification_Report.md` closing the loop the same way
`Restore_Final_Verification_Report.md` closed Phase 10.

**Not in scope for 11.7 or any sub-phase above:** any Module change, any
`DatabaseService.js`/`StorageAdapter.js`/`LocalStorageAdapter.js` change, any
UI change, any change to any of the 9 entity Repository subclasses (all
inherit every change automatically, with zero per-entity code — same
inheritance precedent `restore()` and the Phase 11.2/11.2.1 fixes already
established).

## 3. Why Not One Single Sub-Phase?

Three concrete reasons, each grounded in this project's own established
precedent rather than generic caution:

1. **`_indexOf()` staying alive throughout 11.4–11.6** (only its *callers*
   change, one group at a time) means each sub-phase is independently
   revertible by reverting only that sub-phase's specific call-site edits —
   exactly the granularity `Repository_Hardening_Report.md` and
   `Transaction_Consistency_Report.md` both already used successfully
   (4 surgical changes in 11.2; 3 edit sites in 11.2.1), never a single
   large rewrite.
2. **Different risk profiles per operation group** — single-record ops
   (11.4) are exercised by every Module today; bulk ops (11.5) have far
   fewer real call sites (grep-confirmed elsewhere in this project's history
   that most Modules never call `bulkUpdate`/`bulkDelete`/`import` directly);
   `transaction()` (11.6) has zero production callers at all. Sequencing
   from highest-exposure to lowest-exposure front-loads the sub-phase most
   likely to surface a real bug where it can still be caught cheaply.
3. **Verification cost scales with change size** — the Verification & QA
   Standard's mandated 8-step order (Syntax → Static → Repository
   Compatibility → Behavior → Regression → Backward Compatibility → Scope →
   Final Review) must be run in full after *every* sub-phase; splitting the
   work means each run is scoped to a smaller diff, mirroring exactly the
   diff sizes already seen in 11.2 (+45 lines) and 11.2.1 (+44 net lines) —
   both of which stayed easily reviewable at that size.

## 4. Risk Analysis

| Risk | Likelihood | Impact | Mitigation (built into the sequence above) |
|---|---|---|---|
| Index drifts out of sync with `_records` (a mutation site is missed) | Low, if 11.4's parity harness (`_idIndex.get(id)` vs `_indexOf(id)` on every state transition) is honored as a hard gate | High — silent wrong-record bugs are the worst class of regression | The parity harness is not optional in 11.4's deliverables; every subsequent sub-phase re-runs it as part of full regression, exactly as `verify_repository_api_consistency.js` was re-run, unmodified in its unrelated sections, through 11.2.1 |
| Hard-delete re-indexing (`splice()` shifting all subsequent positions) implemented incorrectly | Low-Medium — this is the one genuinely non-trivial mutation in the whole Design | Medium — only affects `softDelete:false` Repositories; **zero of the 9 real entity Repositories use `softDelete:false`** (confirmed, `PROJECT_STATE.md §4.1` table — all 9 are `softDelete:true`), so a bug here has no live production surface at all today, only test-harness/future-entity exposure | 11.4's harness must include an explicit hard-delete-configured mock Repository (matching the pattern `verify_repository_restore.js` already uses for its `softDelete:false` no-op assertions) |
| `bulkInsert()`'s currently-absent duplicate check is mistaken for something this phase should also fix | Low | Low — would be scope creep | Explicitly documented in `Performance_Baseline_Report.md` as a **pre-existing behavior, not a defect of this Design, and not in scope to change** — carried forward as observed fact per Engineering Core Skill ("Known legacy behavior must remain unless the task explicitly requests fixing it") |
| Performance claims in this phase's docs are treated as measured fact rather than estimates | Medium (documentation-consumption risk, not a code risk) | Low-Medium — could mislead a future phase's prioritization | `Performance_Baseline_Report.md` explicitly labels every number as Big-O estimation, not benchmark output, and 11.7 is specifically scoped to produce the first real measurements |
| `transaction()`'s deferred (unoptimized) internal lookup is mistaken for "the cache doesn't cover transactions" | Low | Low | Explicitly documented in three places (Design doc §13, Architecture doc §3, this document §2's 11.6 scope note) that the *commit-time* index rebuild is covered starting at 11.4 (every commit already replaces `_records`, so the *next* read after any transaction is correctly indexed) — only the *internal per-step* lookup during a transaction's execution is deferred, and it has zero production callers today regardless |

## 5. Rollback Strategy (for each future implementation sub-phase)

Consistent with every prior Phase-11 sub-phase's own stated approach
(`Repository_Hardening_Report.md §8`, `Phase11_2_1_Verification_Report.md`
"Checksums"): no MD5-pin mechanism is proposed here beyond what already
exists project-wide. Instead:

1. Each sub-phase (11.4/11.5/11.6) touches exactly one file
   (`Repository.js`) with a documented, reviewable diff — reverting is a
   single-file `git revert`-equivalent operation (or, in this project's
   actual workflow, restoring the previous session's copy of that one file).
2. Because `_indexOf()` remains present and callable throughout 11.4–11.6
   (§3 above), a partial rollback that only reverts *some* call sites back
   to `_indexOf()` is safe and behaviorally correct at every intermediate
   point — there is no "half-migrated, broken" state possible, only "fewer
   methods have been sped up yet."
3. Full regression suite (all runnable harnesses, currently 941+/943 passing
   at time of this audit — see `Performance_Baseline_Report.md`) is the
   rollback trigger condition: any new failure not already explained by the
   two pre-existing stale-MD5-pin harnesses or the 6 T-07 broken harnesses
   blocks that sub-phase from being marked PASS, exactly as every prior
   Phase 11 sub-phase already enforced.

## 6. Compatibility Matrix (forward-looking — what future sub-phases must preserve)

| Layer | Must remain unchanged through 11.4–11.7 |
|---|---|
| Module → Repository call signatures | 100% — no Module file may require any edit |
| `Repository` public method signatures | 100% — every parameter, default, and return shape identical |
| `DatabaseService.js` | 100% untouched — not read at runtime by any part of this Design |
| `StorageAdapter.js` / `LocalStorageAdapter.js` | 100% untouched |
| All 9 entity Repository subclasses | 100% untouched — every fix inherited automatically (same precedent as `restore()`, Phase 11.2, Phase 11.2.1) |
| `index.html`, CSS | 100% untouched |
| `localStorage` data shape on disk | 100% unchanged — `_idIndex`/`_liveCount` are never persisted, never appear in any `write()` payload |
| Existing 943-check regression baseline | Must remain 941+/943 passing (2 pre-existing explained, 6 pre-existing T-07 broken) with zero new unexplained failures at the close of every sub-phase |

## 7. Recommended Order Relative to Other Open Work

This plan does not re-prioritize `NEXT_PHASE.md §5`'s existing recommended
order; it only elaborates the internal structure of the one item already
named "Phase 11 (Cache Layer)" there. T-07 (broken harnesses) and the
Restore/Trash UI (SUB-PHASE 10.5) remain independent, smaller, lower-risk
items that this plan does not depend on and does not block.

---

## Verdict

```
CACHE LAYER MIGRATION PLAN

PASS

READY FOR PHASE 11.4
```
