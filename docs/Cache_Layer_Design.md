# Cache_Layer_Design.md
## نظام الحسام للمحاماة — V10 Offline-First Architecture
### PHASE 11 — SUB-PHASE 11.3 — Cache Layer Design & Architecture Audit
**Date:** 2026-07-12
**Type:** Design + Audit only. No production file modified. No code written.

---

## 0. Grounding Fact (read before any question below)

`js/core/Repository.js` already holds a full in-memory copy of every entity's
records in `this._records`, explicitly documented at construction time
(line 266-268) as the *"in-memory single-source-of-truth for this entity,
valid only after `open()`"*. Every read method (`get`, `getAll`, `find`,
`exists`, `count`, `search`) already reads exclusively from `this._records` —
**none of them touch the Storage Adapter**. Only `open()` (once) and every
write method's `_persist()` call touch `localStorage`.

This means **Phase 11.3 is not designing a cache to avoid storage I/O** — that
already happened, for free, in Phase 5. What is actually slow is **finding a
record inside the already-cached array**: `Repository.prototype._indexOf(id)`
(line 560) is a linear `for` loop, and it is the single method behind `get()`,
`exists()`, `update()`, `delete()`, `restore()`, `create()`'s duplicate check,
and every per-item iteration of `bulkUpdate()`/`bulkDelete()`. This Design
therefore answers all 20 mandated questions around one central proposal: **an
id → array-index `Map`, maintained in lockstep with `_records`, living inside
`Repository.js` itself** — not a new tier below `DatabaseService`, and not a
second copy of the data.

`DatabaseService_Contract_V1.md §8` already documents a *different*,
currently-unimplemented cache (`enableCache`/`disableCache`/`clearCache` on
`DatabaseService`, guarding whole-entity `read()`/`bulkRead()` calls against
the Storage Engine). That contract is unaffected by this Design — it solves a
different problem (Storage Engine round-trips) that does not exist today
(`DatabaseService.js` is currently an 8-method skeleton with zero caching of
any kind — confirmed by direct read, this session) and would only start to
matter once a slower engine (e.g. IndexedDB, Phase 12) replaces
`LocalStorageAdapter`. This Design's proposed id-index is a distinct,
independent, `Repository`-internal concern and does not preclude the
`DatabaseService`-level cache from being designed and built later exactly as
already contracted.

---

## 1. What data should be cached?

**An id → array-index `Map` per Repository instance** (`this._idIndex`),
mapping every record's `idField` value (or `id` value) to its current
position inside `this._records`. Not the record content itself — `_records`
already *is* the record-content cache; duplicating record bodies into a
second structure would double memory for zero benefit and create a second
place that could drift out of sync. The index is purely positional: `id ->
integer offset into this._records`.

Secondary, smaller candidate: a running **live (non-deleted) count**, to make
argument-less `count()` O(1) instead of an O(n) filter — see §6.

Explicitly **not** cached in this phase: query/`search()` results (see §5),
and no second copy of `_records` at any layer.

## 2. Should cache contain raw records or cloned records?

**Neither, directly — it contains array indices, not records at all.**
`this._records[idIndex.get(id)]` is the live (internal, uncloned) record,
exactly as `this._indexOf(id)` already yields today via
`this._records[idx]`. The existing clone boundary is untouched: every method
that returns a record to a caller still calls `cloneRecord()` at the exact
same point it does today (Repository Contract §19: "getAll() returns a copy,
never a live reference"). The cache changes *how fast the internal index is
found*, never *what is handed to the caller* or *when it is cloned*.

## 3. How should cache stay synchronized?

**Synchronously, in the same tick, as part of the same mutation that already
touches `this._records`.** There is no background sync, no polling, no event
bus (`Restore_System_Design.md §"لا تُضاف أي Events"` already rules out an
event bus for a much smaller change than this one, a fortiori it stays ruled
out here). Every one of the ~10 places `_records` is currently mutated
(`push`, `splice`, direct `this._records[idx] = merged`, `this._records =
this._records.concat(...)`, `this._records = (...).map(cloneRecord)`,
`this._records = []`) gets one paired `_idIndex` mutation immediately
alongside it — never before (the id might not be resolved yet) and never
deferred to a later read.

## 4. Should cache rebuild after create / update / delete / restore / bulk operations / transaction / clear / import?

Split by cost, per operation:

| Operation | Index strategy | Why |
|---|---|---|
| `create()` | Incremental: one `_idIndex.set(id, this._records.length - 1)` after push | Single append, O(1) |
| `update()` | No index change | Same id, same array position — only the record content at that position changes |
| `delete()` (soft) | No index change | Record stays at the same array position, only `deletedAt` is set — see §19 |
| `delete()` (hard, `softDelete:false`) | Incremental: `_idIndex.delete(id)` + re-index every entry after the removed splice point | `splice()` shifts every subsequent element's array offset by 1 — the *positions*, not just one entry, are stale |
| `restore()` | No index change | Same array position, mirrors `update()`/soft `delete()` |
| `bulkInsert()` | Incremental: one `_idIndex.set()` per appended record, batched after the loop | Same reasoning as `create()`, done m times instead of 1 |
| `bulkUpdate()` | No index change | Same reasoning as `update()`, per item |
| `bulkDelete()` (soft) | No index change | Same reasoning as soft `delete()` |
| `bulkDelete()` (hard) | Full rebuild after the loop | Multiple `splice()` calls in one batch make incremental re-indexing more expensive and more error-prone than one O(n) rebuild at the end |
| `transaction()` | Full rebuild once, only on successful commit | `transaction()` already builds a separate `working` array and only replaces `this._records` with it after every step succeeds (§13 below) — the index is derived exactly once, at the same moment |
| `clear()` | Full rebuild (trivially, to an empty Map) | `this._records = []` |
| `import()` (`'replace'` mode) | Full rebuild | Entire array is replaced from an external source, per Contract §5 — this already matches the *"Cache Invalidation... بعد import/bulkInsert كامل"* precedent already documented in `DatabaseService_Design_Report_PHASE3_V10.md §11` |
| `import()` (`'merge'` mode) | Incremental, per item (`set` on match, `set` on append) | Mirrors the existing per-item `_indexOf`-then-push-or-replace loop already in `import()`'s merge branch |
| Any write's `_persist()` failure / rollback | Full rebuild from the restored `this._records` | See §14/§20 — never attempt to "undo" an index mutation; always re-derive from the array that is now, again, ground truth |

**Rule of thumb driving every row above:** if the operation changes *which*
array position an id lives at for records other than the one directly
touched (i.e. any hard-delete `splice()`, any `working`-array replacement, any
full-array replace), rebuild; if it only changes content at an already-known
position, or appends at the end, patch incrementally.

## 5. Should search cache or raw storage?

**Raw storage (i.e. no new cache for `search()`/`filter()`/`count(queryModel)`
in this phase.)** An id-index only accelerates *"find the record with this
exact id"* — it cannot accelerate an arbitrary `{filter, search, sort}`
predicate scan without a full inverted-index/query-planner layer per
field, which is unjustified complexity at this project's current and
foreseeable record counts (§11) and is explicitly the kind of
architecture-before-need Anthropic's own Engineering Core Skill (`Never
redesign existing behavior unless explicitly requested`, `Optimization
last`) warns against. `search()`/`filter()`/predicate-`find()` remain full
O(n) scans over `this._records`, exactly as today.

This also means **T-05 (duplicate full-array scan per render cycle:
`getAll()` then `search()`)** is **not** solved by this Design. It is a
different problem — repeated *identical* query execution across two call
sites in the same render tick, not slow id lookup — and is flagged as a
distinct, optional, future enhancement (a small LRU memo of the last N
`queryModel` results, invalidated on every write exactly like the id-index)
rather than folded into this phase's scope. See Performance_Baseline_Report.md
§Risk Analysis.

## 6. How should count() be optimized?

Two-tier answer, split by whether `count()` is called with a `queryModel`:

- **`count()` / `count({})` (no filter, no search)** — maintain a running
  `this._liveCount` integer (count of non-deleted records), updated by ±1 at
  the exact same synchronous point every create/delete/restore/bulk variant
  already updates `_idIndex` (§3-4). Reduces this common case from O(n) to
  O(1).
- **`count({filter, search, ...})`** — unchanged, still routes through
  `_queryInternal()`'s O(n) scan, because an arbitrary predicate cannot be
  answered by a single integer or an id index. No shortcut exists here
  without the same inverted-index complexity ruled out in §5.

## 7. How should exists() be optimized?

`this._idIndex.has(id)` replaces `this._indexOf(id) !== -1` — O(1) average
instead of O(n). The existing `includeDeleted` semantics (Phase 11.2, FIX 4)
are layered on top exactly as today: a `has()` hit only proves the id exists
*somewhere* in `_records` (deleted or not, per §19); the existing
`this._isDeleted(this._records[idx])` check after the lookup is unchanged.

## 8. Can get(id) be O(1)? Explain.

**Yes, for the index-lookup portion — not for the full call end-to-end.**
`this._idIndex.get(id)` is O(1) average (V8 `Map` — hash-based, not the
linear scan `_indexOf` performs today). The *remaining* cost, unchanged and
unavoidable without violating Contract §19 ("never a live reference"), is
`cloneRecord()` — `JSON.parse(JSON.stringify(record))` — which is O(record
size), not O(n) or O(1). So the true complexity moves from **O(n) index scan
+ O(record size) clone** today to **O(1) index lookup + O(record size)
clone** — the clone cost was always there and is orthogonal to this Design;
what disappears is the linear dependency on the *total dataset size*.

## 9. Should cache use Map, Object, Array, WeakMap, or hybrid?

**`Map<string, number>`** (id → array index), for four concrete reasons
specific to this codebase:

- **Not `WeakMap`** — `WeakMap` keys must be objects, and every real
  `idField` in this project is a string (`رقم_القضية`, `رقم_الموكل`, ... or a
  generated `id` string) — `WeakMap` cannot be keyed by a string at all, so it
  is disqualified outright, not just suboptimal.
- **Not a plain `Object`** — natural-key ids are partly derived from
  user-entered data flowing toward Arabic case/session/client numbers; a
  plain object used as a hash map carries a live prototype-pollution surface
  (`"__proto__"`, `"constructor"`, `"toString"` as a colliding key) that a
  `Map` structurally cannot have (a `Map`'s keys never touch the prototype
  chain). `Object` property deletion (`delete obj[k]`) is also a known V8
  de-optimization trigger for hot objects; `Map.prototype.delete` has no such
  penalty.
- **Not a second `Array`** — a parallel array keeping "which index has which
  id" is exactly the linear-scan problem this Design exists to remove; it
  would need to be searched the same way `_indexOf` already is.
- **`Map` chosen over a `Map<string, Object>` (id → record) hybrid** — storing
  the *index* rather than the *record* keeps `this._records` as the one and
  only place record content lives, so there is only one place any future
  developer needs to reason about "is this the current data" — eliminating an
  entire class of two-copies-drifting-apart bugs before they can exist. It
  also means index rebuild (§4) is a cheap O(n) loop of `Map.set(id, i)`
  calls, not an O(n) loop of full-record copies.

## 10. Memory tradeoffs

A `Map` entry costs roughly a string key (dataset id, already held by the
record itself, so this is a *reference* to an already-allocated string, not a
new allocation of comparable size) plus one small-integer value plus V8's
internal hash-table bookkeeping overhead per entry — on the order of tens of
bytes per entry, essentially independent of how large the *record* itself is.
Records in this project (case/client/session/etc. objects with Arabic field
names, audit metadata, and — for Documents — potentially embedded content)
are typically hundreds of bytes to low kilobytes each. At every scale in §11,
the id-index's memory footprint is a low single-digit percentage addition on
top of the array it indexes — never a doubling, and negligible relative to
the fact that `Repository.js` already, today, holds the entire dataset in
memory unconditionally (this is the pre-existing baseline this Design adds
to, not a new baseline it establishes).

## 11. Large dataset analysis — 100 / 1,000 / 10,000 / 50,000 records

Complexity, not measured wall-clock (this phase runs no code — see
`Performance_Baseline_Report.md` for the estimation methodology and its
explicit caveats):

| Records (n) | `_indexOf()` today (O(n)) | `_idIndex.get()` after this Design (O(1) avg) | `_persist()` (O(n), unaffected by this Design either way) |
|---|---|---|---|
| 100 | ~100 comparisons worst case | 1 hash lookup | 1 full-array `JSON.stringify` + `localStorage.setItem`, ~100 records' worth of bytes |
| 1,000 | ~1,000 | 1 | ~1,000 records' worth of bytes |
| 10,000 | ~10,000 | 1 | ~10,000 records' worth of bytes |
| 50,000 | ~50,000 | 1 | ~50,000 records' worth of bytes (approaching the 5–10MB `localStorage` quota ceiling already flagged as T-04, independent of this Design) |

The practical takeaway: at n=100 (this project's realistic current scale for
a single-office practice), the difference between O(n) and O(1) lookup is
imperceptible to a human — the win only becomes measurable as n grows into
the thousands, which is exactly the range `Technical_Debt_Report.md T-05`
already flagged as "negligible... would only matter at a scale this app's
current architecture isn't targeting." This Design does not contradict that
assessment; it prepares for the range where it *would* start to matter,
consistent with `NEXT_PHASE.md`'s own framing of Phase 11 as anticipatory,
not reactive, work. Critically, **`_persist()`'s O(n) full-array
`JSON.stringify`/`localStorage.setItem` cost is untouched by any part of this
Design at any n** — the id-index only ever helps *finding* a record, never
*writing* one, since every write method still persists the entire array
(unchanged Repository Contract §5 semantics — see
`Performance_Baseline_Report.md` for why this is explicitly out of scope).

## 12. Interaction with Restore

`restore(id)` (line 820) currently calls `this._indexOf(id)` once. Under this
Design it calls `this._idIndex.get(id)` instead — same O(1)-lookup benefit as
`get()`/`exists()`/`update()`/`delete()`. No index *mutation* occurs on
restore (§4 table — same array position, only `deletedAt` clears), matching
the fact that `restore()` is already documented as symmetric with `delete()`
at the array-mutation level (`Repository.js` restore() doc-comment: "mutates
a copy of the existing record directly... via the same `_attachMetadata`
call `delete()` itself already uses"). The idempotent early-return path
(already-live record, no persist) is unaffected — it still short-circuits
before touching `_records` or, now, `_idIndex`.

## 13. Interaction with Transactions

`transaction()` builds `var working = this._records.slice()` and only
assigns `this._records = working` after every op in the batch succeeds and
`_persist()` resolves. The id-index must follow the exact same
staged-then-committed discipline: **during** a transaction, ops keep using
`working.findIndex()` (unchanged — `transaction()` has zero current
production Module callers per `Repository_API_Consistency_Report.md`'s and
`Transaction_Consistency_Report.md`'s own grep evidence, so optimizing its
internal per-step lookup is low-value/low-priority and is explicitly
deferred, not solved, by this phase); **only on successful commit** does
`this._idIndex` get rebuilt once from the new `this._records` — the same
single O(n) rebuild point already required for any full-array replacement
(§4). This keeps the index never observably stale to any external caller
(nothing outside `transaction()` can read `this._idIndex` mid-transaction,
since `this._locked` already blocks re-entrant reads' Repository state
changes at the level the rest of the API relies on) and requires zero change
to `transaction()`'s existing working-array algorithm.

## 14. Interaction with Rollback

Every write method's existing rollback pattern restores `this._records` to
its pre-mutation value on a `_persist()` failure (e.g. `update()`:
`this._records[idx] = previous`). The id-index rollback rule is deliberately
the simplest possible one: **never attempt to reverse an index mutation
directly — always rebuild `this._idIndex` from whatever `this._records` has
just been restored to.** This is the same choice already made for
`transaction()`'s working-array discard (§13) and for full-replace operations
(§4): re-derivation from the array that is definitionally ground truth is
strictly safer than maintaining a second, hand-written "undo" code path for
every one of the ~10 mutation sites, at the cost of one extra O(n) pass only
on the failure path — which, per every existing regression report read this
session, is rare (`_persist()` failures do not occur in normal
`LocalStorageAdapter` operation; the rollback branches exist for defensive
correctness, exercised primarily by test harnesses simulating adapter
failure).

## 15. Interaction with future IndexedDB layer (Phase 12)

Zero coupling. The id-index is built exclusively from `this._records`, which
is itself populated exclusively by `await this._storage.read(this.entityKey)`
inside `open()` — the id-index has no awareness of *which* Storage Adapter
supplied that array. Swapping `LocalStorageAdapter` for a future
`IndexedDBAdapter` (Phase 12, not yet started per `NEXT_PHASE.md §5`)
requires precisely zero change to the id-index design, matching this
project's standing architectural invariant (`PROJECT_STATE.md §4`: "no
Repository changes required" on engine swap) exactly as `restore()` already
did in Phase 10 and as `Repository_Hardening_Report.md`'s Phase 11.2 changes
already did.

## 16. Interaction with future Sync Engine (Phase 13)

None required. A future Sync Engine (`NEXT_PHASE.md §5` item 6, not started)
would, by this project's own architecture rule ("Repositories are the ONLY
layer allowed to communicate with DatabaseService" — Engineering Core Skill),
read and write through the same `Repository` CRUD surface every Module
already uses — so it automatically inherits every id-index benefit this
Design provides with no special-casing, exactly mirroring the precedent
already set for Restore ("no special Cache invalidation logic needed... any
future Cache layer designed to invalidate itself on any `write()`" —
`Restore_System_Architecture.md §24`).

## 17. Interaction with Dashboard mirrors

`data.<entity> = <entity>Repository.getAll()` (the compatibility mirror, one
per migrated Module) is unaffected in its output — `getAll()`'s return shape,
ordering, and cloning behavior are all unchanged by this Design (§5: no new
cache for the array-scan/filter/map that backs `getAll()`). `getAll()`
becomes marginally cheaper only in the sense that it no longer needs
`_indexOf` for anything (it never did — `getAll()` scans `_records` directly
today), so this Design has **no observable effect on the Mirror Strategy at
all**, positive or negative — flagged explicitly so a future reader does not
assume `getAll()`/mirror-sync got faster from this phase; it did not (see
§5's T-05 discussion for the actual, separate, deferred opportunity here).

## 18. Interaction with ApiService

None. `js/api/api.js` has zero references to `Repository` (confirmed by grep,
multiple prior phases, re-confirmed this session) and this Design touches
nothing outside `Repository.js`'s own internal `_records`/`_idIndex`
relationship. `ApiService` calls remain entirely Module-level and
architecturally independent, unchanged.

## 19. Interaction with softDelete

The id-index deliberately indexes **every** record, deleted or not — it
mirrors `this._records` itself, which (per `Technical_Debt_Report.md T-04`
and direct source read) never removes a soft-deleted record from the array,
only sets `deletedAt`. This means:

- A single index, not two (no separate "live-only" vs "all" index needed) —
  visibility filtering (`includeDeleted`) stays exactly where Phase 11.2
  already put it: applied *after* the O(1) index lookup, at the
  `this._isDeleted(record)` check, unchanged.
- Soft `delete()`/`restore()` never need an index mutation (§4) — the id
  never leaves `_idIndex`, only the record's `deletedAt` field at its
  existing array position changes.
- Hard-delete (`softDelete:false`) Repositories *do* need index maintenance
  on delete (§4's `splice()` row) precisely because the record actually
  leaves the array — this is the one place soft-delete configuration changes
  the index-maintenance strategy, and it already exists as a documented
  branch inside `delete()`/`bulkDelete()`/`transaction()`'s delete step
  today (the `if (this._softDelete) {...} else {...}` branches), so this
  Design adds an index-mutation line to an already-existing branch, not a
  new branch.

## 20. Failure recovery strategy

One rule, applied uniformly everywhere in §4's table that says "rebuild" or
"no index change": **the id-index is always treated as fully derivable, never
as independently authoritative, state.** Concretely:

1. On any `_persist()` failure (any write method), after `this._records` is
   restored to its pre-mutation value, rebuild `this._idIndex` from that
   restored array (§14) — never attempt a symmetric "undo" of whatever
   partial index mutation may have already happened.
2. On `open()` (first load, or any future re-open), build `this._idIndex`
   fresh from the newly-loaded `this._records` — the index has no
   persistence of its own and is never read from or written to storage; it
   is pure, disposable, in-memory derived state, exactly like `_records`
   itself already is (Repository Contract §11 lifecycle: `_records` is only
   valid "after `open()`" — `_idIndex`'s validity window is identical).
3. On `dispose()` (line 323), clear `this._idIndex` alongside the existing
   `this._records = []` reset, for the same lifecycle-hygiene reason.
4. **No corruption state is possible that requires manual intervention** —
   because the index is always one O(n) rebuild away from a guaranteed-correct
   state derived from `this._records`, and every failure path already
   performs (or, under this Design, will perform) that rebuild automatically.
   This is a deliberately conservative choice, prioritizing correctness and
   simplicity over shaving the rebuild cost on the rare failure path — fully
   consistent with this project's standing engineering principle:
   "Correctness before speed... Compatibility before optimization"
   (Engineering Core Skill, Final Rule).

---

## Cache Goals — Confirmed Achievable Without Any Forbidden Change

| Goal (from this sub-phase's instructions) | Met by this Design? |
|---|---|
| Zero Module changes | Yes — `_idIndex` is a private (`_`-prefixed) field, never exposed on any public method signature |
| Zero Repository API changes | Yes — every public method (`get`, `exists`, `update`, `delete`, `restore`, `create`, `bulkUpdate`, `bulkDelete`, `count`) keeps its exact current signature and return shape; only internal lookup implementation changes |
| Zero DatabaseService API changes | Yes — `DatabaseService.js`'s 8-method skeleton is never read or referenced by this Design |
| Completely transparent | Yes — no external caller (Module, test harness, or `DatabaseService`) can observe whether `_idIndex` exists; every method's *output* for every existing test case is byte-for-byte identical to today, only the internal path to that output changes (see `Performance_Baseline_Report.md` §Compatibility Matrix) |

---

## Verdict

```
CACHE LAYER DESIGN

PASS

READY FOR PHASE 11.4
```
