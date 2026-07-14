# Performance_Baseline_Report.md
## نظام الحسام للمحاماة — V10 Offline-First Architecture
### PHASE 11 — SUB-PHASE 11.3 — Cache Layer Design & Architecture Audit
**Date:** 2026-07-12
**Type:** Design + Audit only. No production file modified. No code executed against
live data — every timing figure below is a **Big-O / order-of-magnitude estimate**
derived from direct source reading, not a measured benchmark. Measured benchmarks
are explicitly deferred to SUB-PHASE 11.7 (`Cache_Layer_Migration_Plan.md §2`).

---

## 1. Executive Summary

`js/core/Repository.js` (1409+44 lines, post-11.2.1) already keeps every
entity's full record set in memory (`this._records`) after `open()` — there
is no storage-I/O cache problem to solve. The actual, audited bottleneck is
**linear id lookup**: `_indexOf(id)` is a `for` loop over `this._records`,
called by `get`, `exists`, `update`, `delete`, `restore`, `create`'s
duplicate check, and once per item inside `bulkUpdate`, `bulkDelete`, and
`import('merge')`. This makes those last three methods **O(m·n)** for m
input items against n existing records — the single largest inefficiency
this audit found. `Cache_Layer_Design.md`/`Cache_Layer_Architecture.md`
propose a private `Map<id, arrayIndex>` (`_idIndex`) plus a running
non-deleted counter (`_liveCount`), fully transparent to every existing
caller, reducing those lookups to O(1) average without touching
`_persist()`'s (unavoidable, unrelated) O(n) full-array write.

## 2. Current Repository Timings (estimated, by complexity class)

Methodology: each method's dominant term identified by direct source
reading (`js/core/Repository.js`, this session); "record" assumed to be a
typical case/client/session-shaped object (Arabic field names, ~15-30
fields, audit metadata) of roughly 0.3–1.5 KB serialized, consistent with
the field counts documented in `Data_Schema_Specification_Report_PHASE4_V10.md`.
No wall-clock number below was measured — see §0 disclaimer.

| Method | Dominant cost today | Order of growth |
|---|---|---|
| `get(id)` | `_indexOf` scan + 1 clone | O(n) |
| `exists(id)` | `_indexOf` scan | O(n) |
| `update(id, patch)` | `_indexOf` scan + O(n) persist | O(n) |
| `delete(id)` (soft) | `_indexOf` scan + O(n) persist | O(n) |
| `delete(id)` (hard) | `_indexOf` scan + `splice` + O(n) persist | O(n) |
| `restore(id)` | `_indexOf` scan + O(n) persist (0 if idempotent) | O(n) |
| `create(entity)` | `_indexOf` duplicate-check + O(n) persist | O(n) |
| `bulkInsert(m)` | O(m) validate/append + O(n) persist | **O(m + n)** (already efficient — no duplicate check exists) |
| `bulkUpdate(m)` | m × `_indexOf` scan + O(n) persist | **O(m·n)** |
| `bulkDelete(m)` | m × `_indexOf` scan (+ splice shifting if hard) + O(n) persist | **O(m·n)** |
| `import('replace')` | O(n) clone-map + O(n) persist | O(n) |
| `import('merge', m)` | m × `_indexOf` scan + O(n) persist | **O(m·n)** |
| `getAll()` | O(n) filter + O(n) clone | O(n) |
| `search(queryModel)` | O(n) filter/search + O(n log n) sort (if requested) + O(page) clone | O(n) to O(n log n) |
| `count()` (no filter) | O(n) filter | O(n) |
| `count(queryModel)` | O(n) filter/search | O(n) |
| `find(predicate)` | O(n) worst case, early-exit | O(n) |
| `clear()` | O(1) reset + O(n) persist (empty write) | O(n) (persist-dominated) |
| `export()` | O(n) clone | O(n) |
| `transaction(k ops)` | k × O(n) `findIndex`/`some` + O(n) persist once | **O(k·n)** |

## 3. Expected Cache Timings (after the design in `Cache_Layer_Design.md`/`Cache_Layer_Architecture.md`, once implemented per `Cache_Layer_Migration_Plan.md`)

| Method | Dominant cost after this Design | Order of growth | Delta |
|---|---|---|---|
| `get(id)` | O(1) avg index lookup + 1 clone | **O(1) avg** (clone cost unchanged, independent of n) | n → 1 |
| `exists(id)` | O(1) avg index lookup | **O(1) avg** | n → 1 |
| `update(id, patch)` | O(1) avg lookup + O(n) persist | O(n), **persist-dominated, unchanged overall order** | lookup term removed |
| `delete(id)` (soft) | O(1) avg lookup + O(n) persist | O(n), persist-dominated | lookup term removed |
| `delete(id)` (hard) | O(1) avg lookup + splice + O(n) re-index + O(n) persist | O(n), persist-dominated (re-index is same order as splice itself) | no asymptotic change, still correctly O(n) |
| `restore(id)` | O(1) avg lookup + O(n) persist (0 if idempotent) | O(n), persist-dominated | lookup term removed |
| `create(entity)` | O(1) avg duplicate-check + O(n) persist | O(n), persist-dominated | lookup term removed |
| `bulkInsert(m)` | Unchanged | O(m + n) | no change (already efficient) |
| `bulkUpdate(m)` | O(m) avg lookups + O(n) persist | **O(m + n)** | **O(m·n) → O(m + n)** — largest win |
| `bulkDelete(m)` | O(m) avg lookups (+O(n) rebuild if hard) + O(n) persist | **O(m + n)** | **O(m·n) → O(m + n)** |
| `import('merge', m)` | O(m) avg lookups + O(n) persist | **O(m + n)** | **O(m·n) → O(m + n)** |
| `getAll()`, `search()`, `find()`, `export()` | Unchanged | Unchanged | none — not id-based (Design doc §5) |
| `count()` (no filter, `softDelete:true`) | O(1) via `_liveCount` | **O(1)** | n → 1 |
| `count(queryModel)` | Unchanged | O(n) | none — arbitrary predicate |
| `clear()` | O(1) index reset + O(n) persist | O(n), persist-dominated | no change |
| `transaction(k ops)` | Unchanged internally + one O(n) index rebuild on commit | O(k·n) + O(n) | no change to the dominant term (deferred, Design doc §13) |

**`_persist()` itself is never improved by this Design at any n** — it is
explicitly out of scope (`Cache_Layer_Architecture.md §5`) and remains the
true floor for every write method's overall complexity regardless of how
fast the lookup that precedes it becomes.

## 4. Complexity Comparison — Side by Side

| Method | Before | After | Improved? |
|---|---|---|---|
| `get`, `exists` | O(n) | O(1) avg | **Yes — order-of-magnitude** |
| `update`, `delete`, `restore`, `create` | O(n) | O(n) (persist floor) | Lookup term removed; overall order unchanged because persist already dominates |
| `bulkUpdate`, `bulkDelete`, `import(merge)` | **O(m·n)** | **O(m+n)** | **Yes — order-of-magnitude, the headline win of this Design** |
| `bulkInsert` | O(m+n) | O(m+n) | No change (already efficient) |
| `count()` (no filter) | O(n) | O(1) | **Yes** |
| `count(queryModel)`, `search`, `getAll`, `find`, `export` | O(n) [or O(n log n)] | Unchanged | No — explicitly out of scope |
| `transaction` | O(k·n) | O(k·n) + O(n) commit rebuild | No — explicitly deferred |
| `clear` | O(n) | O(n) | No change |

## 5. Large-Dataset Estimation Table (100 / 1,000 / 10,000 / 50,000 records)

Reproduced from `Cache_Layer_Design.md §11`, extended with the bulk-operation
case (m=50 items, representative of a realistic "select 50 rows, bulk-edit"
UI action, which does not exist in any current Module today but is a
plausible future one):

| n (records) | `get()`/`exists()` before | `get()`/`exists()` after | `bulkUpdate(m=50)` before | `bulkUpdate(m=50)` after |
|---|---|---|---|---|
| 100 | ~100 comparisons | 1 lookup | ~5,000 comparisons | ~50 lookups |
| 1,000 | ~1,000 | 1 | ~50,000 | ~50 |
| 10,000 | ~10,000 | 1 | ~500,000 | ~50 |
| 50,000 | ~50,000 | 1 | ~2,500,000 | ~50 |

At n=100 (this project's current realistic scale), the absolute difference
is imperceptible to a human regardless of column — consistent with
`Technical_Debt_Report.md T-05`'s own conclusion that current-scale
inefficiency is "negligible." The table's purpose is to show *where the
curves diverge*, not to claim a present-day user-visible slowdown exists
today.

## 6. Memory Comparison

| Structure | Size relative to `_records` |
|---|---|
| `this._records` (existing, unchanged) | Baseline — already 100% of the dataset, held unconditionally today |
| `this._idIndex` (new) | A few tens of bytes per entry (string-key reference + integer + Map bookkeeping) — low single-digit percent of `_records`'s footprint at every n in §5, never a doubling |
| `this._liveCount` (new) | One integer — effectively zero |
| A hypothetical `Map<id, clonedRecord>` design (rejected — Design doc §9) | Would have approached 2× `_records`'s footprint — explicitly why the index stores positions, not record copies |

## 7. Risk Analysis

| Risk category | Assessment |
|---|---|
| Architectural risk | Low — confined to one file, one private internal structure, zero public surface change (Design doc, "Cache Goals" table) |
| Regression risk | Low-Medium, concentrated entirely in correct index-maintenance at each of the ~19 mutation call sites (`Cache_Layer_Architecture.md §3`) — mitigated by the mandated 11.4 parity harness (`Cache_Layer_Migration_Plan.md §4`) |
| Production exposure of the one non-trivial case (hard-delete re-indexing) | None today — zero of the 9 real entity Repositories use `softDelete:false` (`PROJECT_STATE.md §4.1`) |
| Scope-creep risk | Actively guarded against — `bulkInsert()`'s missing duplicate check, `_persist()`'s O(n) write floor, and T-05's duplicate-scan pattern are all explicitly named and explicitly left unfixed by this Design, each with a stated reason (§8 below) |
| Documentation-vs-reality risk | This report's numbers are Big-O estimates, not benchmarks (§0) — flagged repeatedly across all four deliverables to prevent a future phase from citing them as measured fact |

## 8. Explicitly Out-of-Scope Findings (documented per Engineering Audit Standard, not fixed)

| Finding | Why it is not fixed by this phase |
|---|---|
| `bulkInsert()` has no duplicate-id check (unlike `create()`) | Pre-existing behavior; not raised as an inconsistency by prior Repository API Consistency work; changing it would be a validation-behavior change, explicitly outside a Cache Layer's scope, and would need its own audit against every current `bulkInsert()` call site's assumptions |
| `_persist()` always writes the full array, for every write method, regardless of how many records changed | Storage Adapter contract limitation (`localStorage` has no partial-write primitive); fixing this needs either a new Storage Adapter contract or a different storage engine (naturally Phase 12, IndexedDB) — see `Cache_Layer_Architecture.md §5` |
| T-05 — duplicate `getAll()` + `search()` full scan per render, across all 9 Modules | A *query-result* caching problem, not an *id-lookup* problem — a different mechanism (memoization) than this Design proposes; flagged as a distinct future candidate, not folded in here, to keep this phase's diff minimal and reviewable |
| `transaction()`'s internal per-step `working.findIndex()`/`.some()` calls remain O(n) per step | Zero current production Module callers (grep-confirmed, multiple phases); deferred to keep 11.4's initial diff focused on the highest-exposure methods first (`Cache_Layer_Migration_Plan.md §3`) |
| `DatabaseService_Contract_V1.md §8`'s `enableCache`/`disableCache`/`clearCache` contract remains unimplemented | A different, `DatabaseService`-level cache (guards Storage Engine round-trips) solving a problem that does not exist yet under `LocalStorageAdapter` (every read already comes from `Repository._records`, never from a live `DatabaseService.read()` call after `open()`) — remains a valid, separate future contract, most relevant once Phase 12 (IndexedDB) introduces a storage engine with real per-call latency |

## 9. Migration Strategy (summary — full detail in `Cache_Layer_Migration_Plan.md`)

Four sequenced sub-phases (11.4 single-record ops → 11.5 bulk/import ops →
11.6 transaction-commit integration + `count()` fast path → 11.7 independent
verification with real measured benchmarks), each touching only
`Repository.js`, each ending with a full regression pass, each independently
revertible because `_indexOf()` remains present and callable throughout
until the final sub-phase.

## 10. Rollback Strategy (summary — full detail in `Cache_Layer_Migration_Plan.md §5`)

No new rollback mechanism beyond this project's existing per-sub-phase
single-file-diff discipline: every implementation sub-phase is a
reviewable, revertible diff to one file; the full regression suite (currently
941+/943 passing, 2 pre-existing explained, 6 pre-existing T-07 broken) is
the gate that must hold, unchanged in its pass/fail profile beyond the new
harness(es) each sub-phase adds, before any sub-phase is marked PASS.

## 11. Compatibility Matrix

| Layer / Contract | Compatibility after this Design (once implemented) |
|---|---|
| Module → Repository calls | 100% unchanged — no Module requires any edit |
| `Repository` public method signatures, return shapes, error types | 100% unchanged |
| `DatabaseService.js` | 100% unchanged, not read at runtime |
| `StorageAdapter.js` / `LocalStorageAdapter.js` | 100% unchanged |
| All 9 entity Repository subclasses | 100% unchanged — inherited automatically |
| `index.html`, CSS | 100% unchanged |
| `localStorage` on-disk data shape | 100% unchanged — `_idIndex`/`_liveCount` never persisted |
| Existing 943-check regression baseline | Must remain 941+/943, zero new unexplained failures, at the close of every future sub-phase |
| `DatabaseService_Contract_V1.md §8` future cache contract | Unaffected, remains independently valid for a future `DatabaseService`-level cache |
| Future IndexedDB Storage Adapter (Phase 12) | Zero coupling — index rebuilds identically from whatever `adapter.read()` returns (Design doc §15) |

---

## 12. Summary — Current Bottlenecks, Expected Gains, Implementation Order, Risks, Compatibility

**Current bottlenecks:** linear `_indexOf()` scans behind every id-based
read/write, most severely compounded in `bulkUpdate`/`bulkDelete`/
`import('merge')` where it becomes O(m·n). `_persist()`'s O(n) full-array
write is a separate, unrelated, unavoidable-at-this-layer floor.

**Expected gains:** O(n) → O(1) average for all single-id lookups; O(m·n) →
O(m+n) for all multi-id batch operations — the headline result of this
Design. No gain for query/predicate-based methods (`search`, `getAll`,
`find`, filtered `count`) or for `_persist()`'s write cost, by design.

**Implementation order:** SUB-PHASE 11.4 (single-record ops) → 11.5
(bulk/import) → 11.6 (transaction commit + `count()` fast path) → 11.7
(independent verification with real benchmarks) — see
`Cache_Layer_Migration_Plan.md` for full detail.

**Risks:** low overall; concentrated in correct index maintenance at ~19
call sites, mitigated by a mandatory parity test harness in the first
implementation sub-phase; zero production exposure for the one genuinely
non-trivial case (hard-delete re-indexing), since no real entity uses
`softDelete:false` today.

**Compatibility:** total — zero Module changes, zero Repository API changes,
zero DatabaseService changes, zero UI changes, fully transparent by
construction (§11 above).

---

## Final Verification

- No production file (`js/core/`, `js/repositories/`, `js/modules/`,
  `js/api/`, `index.html`, `Code_v4.gs`, `css/`) was modified by this
  sub-phase. Confirmed by direct inspection: this sub-phase created exactly
  four files, all under `docs/`
  (`Cache_Layer_Design.md`, `Cache_Layer_Architecture.md`,
  `Cache_Layer_Migration_Plan.md`, `Performance_Baseline_Report.md` — this
  file), and modified none.
- No Repository edit occurred. No Module edit occurred. No DatabaseService
  edit occurred. No Adapter edit occurred. No UI edit occurred. No code was
  generated, patched, or diffed against any production file — matching this
  sub-phase's stated CONSTRAINTS exactly.

---

## Verdict

```
CACHE LAYER DESIGN

PASS

READY FOR PHASE 11.4
```
