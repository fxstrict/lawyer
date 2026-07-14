# Cache_Layer_Architecture.md
## نظام الحسام للمحاماة — V10 Offline-First Architecture
### PHASE 11 — SUB-PHASE 11.3 — Cache Layer Design & Architecture Audit
**Date:** 2026-07-12
**Type:** Design + Audit only. No production file modified. No code written.

---

## 1. Where This Layer Lives

Confirmed by `Cache_Layer_Design.md §0`: this is **not** a new tier in the
`Modules → Repositories → DatabaseService → StorageAdapter → localStorage`
stack. It is an **internal, private refinement of `Repository.js`'s own
existing `_records` in-memory store** — an auxiliary positional index, not a
new layer, not a new file, not a new class.

```
Modules (unchanged)
   │
   ▼
Repository (js/core/Repository.js)          ← the ONLY file this Design touches
   │  this._records   (existing, unchanged: full in-memory record array)
   │  this._idIndex    (NEW, private: Map<id, arrayIndex>, derived from _records)
   │  this._liveCount   (NEW, private: running non-deleted count, derived from _records)
   ▼
DatabaseService (js/core/DatabaseService.js)  ← UNCHANGED, not read/touched at runtime
   ▼
StorageAdapter (js/core/StorageAdapter.js)    ← UNCHANGED
   ▼
LocalStorageAdapter (js/core/LocalStorageAdapter.js)  ← UNCHANGED
   ▼
Browser localStorage                          ← UNCHANGED, still receives one
                                                  full-array JSON.stringify write
                                                  per write method call, exactly
                                                  as today
```

This diagram is deliberately identical to `PROJECT_MAP.md §3`'s Layer
Relationship Graph except for the two new private fields inside the
`Repository` box — nothing else in the stack changes shape, depth, or
direction of dependency.

## 2. Data Structures

```js
/** @private id -> current index into this._records.
 *  Built fresh in open(), kept in lockstep with every _records mutation,
 *  fully rebuildable from _records at any time (never itself persisted,
 *  never itself the source of truth — Cache_Layer_Design.md §20). */
this._idIndex = new Map();

/** @private running count of non-deleted records, kept in lockstep with
 *  every create/delete/restore/bulk mutation. Only meaningful when
 *  this._softDelete is true; for softDelete:false Repositories this always
 *  equals this._records.length (no deleted records can exist there). */
this._liveCount = 0;
```

Both fields are initialized in the constructor (alongside the existing
`this._records = []`) and populated for the first time at the end of
`open()`, immediately after `this._records = Array.isArray(loaded) ? loaded
: []` — a single O(n) loop:

```js
// Conceptual shape only — Phase 11.4 implements the exact code.
this._idIndex = new Map();
this._liveCount = 0;
var idField = this._idField || 'id';
for (var i = 0; i < this._records.length; i++) {
  this._idIndex.set(this._records[i][idField], i);
  if (!this._isDeleted(this._records[i])) this._liveCount++;
}
```

This is the **only** new O(n) pass this Design introduces anywhere in the
Repository lifecycle, and it occurs exactly once per `open()` call — `open()`
is already documented as idempotent-if-already-ready (`if (this._state ===
'ready' || this._state === 'busy') return;`, line 289), so this cost is paid
once per page load per entity, not once per read.

## 3. Per-Method Integration Points

Every row below names the exact existing line(s) in `js/core/Repository.js`
(as read this session, post-11.2.1, 1409+44 lines) where the id-index either
replaces an existing `_indexOf()` call or requires a paired mutation. No
method's *signature*, *return shape*, *error type*, or *validation order*
changes — only the internal lookup/bookkeeping mechanism.

| Method | Current lookup (unchanged fallback shown for contrast) | Change under this Design |
|---|---|---|
| `get(id, options)` | `this._indexOf(id)` → O(n) | `this._idIndex.get(id)` → O(1) avg; `undefined` maps to the existing `idx === -1` branch |
| `exists(id, options)` | `this._indexOf(id)` → O(n) | `this._idIndex.has(id)` → O(1) avg |
| `update(id, patch, options)` | `this._indexOf(id)` → O(n) | `this._idIndex.get(id)` → O(1) avg. **No index mutation after the update** — same array slot (§4 of Design doc) |
| `delete(id)` (soft) | `this._indexOf(id)` → O(n) | O(1) avg lookup; **no index mutation** (§19 of Design doc) |
| `delete(id)` (hard) | `this._indexOf(id)` → O(n), then `splice()` | O(1) avg lookup, then `splice()` **plus** an O(n) re-index loop for every entry after the removed slot (their array positions shifted by 1) |
| `restore(id)` | `this._indexOf(id)` → O(n) | O(1) avg lookup; **no index mutation** |
| `create(entity)` | `this._indexOf(id)` duplicate-check → O(n) | `this._idIndex.has(id)` → O(1) avg duplicate-check; on success, `this._idIndex.set(id, this._records.length)` **before** `push()` (or immediately after, using `length` pre-push — exact ordering is a Phase 11.4 implementation detail, not a design ambiguity, since both orderings are O(1) and equivalent) |
| `bulkInsert(entities[])` | No duplicate check today (confirmed — see `Performance_Baseline_Report.md` audit table) | One `this._idIndex.set(id, idx)` per appended record, in the same loop that already builds `toAppend` — O(m), not O(n·m) |
| `bulkUpdate(patches[])` | `this._indexOf(patches[i].id)` per item → O(n) each, O(m·n) total | `this._idIndex.get(...)` per item → O(1) avg each, **O(m) total** — the single largest asymptotic improvement in this Design |
| `bulkDelete(ids[])` (soft) | `this._indexOf(ids[i])` per item → O(m·n) total | O(1) avg per item lookup, O(m) total; no index mutation |
| `bulkDelete(ids[])` (hard) | `this._indexOf(ids[i])` per item → O(m·n), then per-item `splice()` | O(1) avg per item lookup for O(m); full `_idIndex` rebuild once after the loop (multiple splices make incremental re-indexing more expensive than one final O(n) pass — Design doc §4) |
| `transaction()` create/update/delete/restore steps | `working.findIndex()` / `working.some()` per step → O(n) each | **Unchanged in this Design** — `transaction()` operates on a separate `working` array with no current production caller (§13 of Design doc); the *committed* `_idIndex` is rebuilt once, O(n), only after a successful commit replaces `this._records` |
| `count()` (no `queryModel`) | `this._queryInternal({}).total` → O(n) filter | `this._liveCount` → O(1) (only for `softDelete:true` Repositories with no filter/search; unchanged O(n) path otherwise) |
| `count(queryModel)` (with filter/search) | O(n) | **Unchanged** — arbitrary predicates require a scan (Design doc §5/§6) |
| `getAll()`, `search()`, `find()`, `export()` | O(n) scan of `_records` | **Unchanged** — these were never `_indexOf`-based; this Design does not touch them (Design doc §5/§17) |
| `import()` (`'replace'`) | N/A (full replace) | Full `_idIndex`/`_liveCount` rebuild, paired with the existing `this._records = (...).map(cloneRecord)` line |
| `import()` (`'merge'`) | `self._indexOf(record[idField])` per item → O(n) each | O(1) avg per item; index `set()` on both the "found, replace" and "not found, push" branches |
| `clear()` | N/A | `this._idIndex = new Map()`, `this._liveCount = 0`, paired with the existing `this._records = []` |
| Any write's rollback branch | Restores `this._records`/`this._records[idx]` | Rebuild `_idIndex`/`_liveCount` from the restored array (Design doc §14/§20) — **one new call site per existing rollback branch**, not new rollback logic |
| `dispose()` | `this._records = []` | Also reset `this._idIndex = new Map()`, `this._liveCount = 0` |

**Total surface touched:** every one of the ~19 write/read call sites already
enumerated in the "AUDIT" section below gets, at most, a 1–3 line change
(a lookup-method swap, and/or one paired index mutation). No method grows a
new branch of *business* logic, no method's parameter list changes, no
method's error-handling structure changes.

## 4. Complexity Classification — Full Audit (per this sub-phase's mandate)

Classified by direct reading of every method named in the task's AUDIT
section, against `js/core/Repository.js` as it exists today (pre-Phase
11.3, i.e. the actual current codebase), and the complexity each would have
**after** this Design (not yet implemented):

| Method | Current complexity | Current allocations/scans | After this Design | Notes |
|---|---|---|---|---|
| `get(id)` | O(n) index scan + O(record size) clone | 1 clone | **O(1) avg + O(record size) clone** | See Design doc §8 |
| `getAll()` | O(n) filter + O(n) map(clone) | n clones | **Unchanged, O(n)** | Not id-based; see §5/§17 of Design doc |
| `search()` | O(n) filter(s) + O(n log n) sort (if any) + O(page) clone/project | up to n clones (pre-pagination filter), page-sized after | **Unchanged, O(n)** | Query-model based, not id-based |
| `filter()` | *(no standalone `filter()` method exists on `Repository.prototype` — filtering is reached only via `search()`/`count()`'s shared `_queryInternal()`, confirmed by direct read; this audit item is answered as "N/A, folded into search()/count()"* | — | — | Documented for completeness per this phase's literal method list |
| `count()` (no args) | O(n) filter | 0 clones (returns a number) | **O(1)** via `_liveCount` (softDelete:true only) | See Design doc §6 |
| `count(queryModel)` | O(n) | 0 clones | **Unchanged, O(n)** | Arbitrary predicate |
| `exists(id)` | O(n) index scan | 0 clones | **O(1) avg** | See Design doc §7 |
| `find(predicate)` | O(n) worst case, early-exit on match | 1 clone on hit | **Unchanged, O(n) worst case** | Predicate-based, not id-based — out of this phase's `includeDeleted` scope too (Repository_API_Consistency_Report.md, "Not changed") |
| `create()` | O(n) duplicate-check (`_indexOf`) + O(1) push + O(n) persist | 1 clone in, 1 clone out | **O(1) avg duplicate-check** + O(1) push + **O(n) persist unchanged** | Persist cost is orthogonal — see §5 below |
| `update()` | O(n) index scan + O(1) merge + O(n) persist | 1 clone (patch) + 1 clone out | **O(1) avg index scan**, rest unchanged | |
| `delete()` (soft) | O(n) index scan + O(1) mutate + O(n) persist | 1 clone out | **O(1) avg index scan**, rest unchanged | |
| `delete()` (hard) | O(n) index scan + O(n) splice + O(n) persist | 1 clone out | **O(1) avg index scan**, splice + re-index still O(n) | Splice itself is inherently O(n) in any array — irreducible without abandoning array-based `_records`, which is out of scope |
| `restore()` | O(n) index scan + O(1) mutate + O(n) persist (0 persist if idempotent no-op) | 1 clone out | **O(1) avg index scan**, rest unchanged | |
| `bulkInsert(m items)` | O(m) validate + O(m) append (**no duplicate check today** — see finding below) + O(n) persist | m clones in, m clones out | **Unchanged, O(m)** — this method was already efficient | Confirmed finding, not a defect: `bulkInsert()` never calls `_indexOf` |
| `bulkUpdate(m items)` | **O(m·n)** — O(n) `_indexOf` per item | m clones out (on success) | **O(m) avg** | Largest single improvement — see §3 table |
| `bulkDelete(m items)` (soft) | **O(m·n)** | m clones out | **O(m) avg** | |
| `bulkDelete(m items)` (hard) | **O(m·n)** lookup + O(m·n) worst-case splice shifting | m clones out | **O(m) avg lookup** + one O(n) rebuild at the end | Splice-shifting cost for m hard deletes is inherently at least O(n) regardless of indexing — irreducible |
| `import(replace)` | O(n) map(clone) | n clones | **Unchanged, O(n)** + one new O(n) index rebuild (same order, not a new order of magnitude) | |
| `import(merge, m items)` | **O(m·n)** — `_indexOf` per incoming item | up to m clones | **O(m) avg** | |
| `clear()` | O(1) reset + O(n) persist (empty array) | 0 clones | **Unchanged** | |
| `transaction(k ops)` | O(k·n) — `findIndex`/`some` per step against `working` | up to k clones out | **Unchanged in this Design** (deferred, §13 of Design doc) + one O(n) index rebuild on successful commit | |

**Memory allocations, clone frequency, temporary arrays, duplicate scans,
avoidable work — summary:**
- **Clone frequency is entirely unaffected by this Design** — every existing
  `cloneRecord()` call site (Contract §19 compliance) stays exactly where it
  is; this Design only changes how the *pre-clone* record is located.
- **Temporary arrays** (`working.slice()` in `transaction()`,
  `before = this._records.slice()` in every bulk method's rollback
  preparation) are unaffected — none of them are proposed for removal or
  replacement by this Design; they are a separate, already-necessary
  rollback-safety mechanism, out of scope here.
- **Duplicate scans identified, not fixed by this phase:** T-05 (`getAll()`
  then `search()` per render, across all 9 Modules) — confirmed still
  present, confirmed **not solved** by an id-index (different problem class,
  Design doc §5/§17), logged again here as the primary candidate for a
  *future*, distinct optimization (query-result memoization), not this
  phase's id-index.
- **Avoidable work newly discovered by this audit, not previously
  documented:** `bulkInsert()`'s O(n) `_persist()` write already writes the
  *entire* array on every call, including records untouched by that specific
  `bulkInsert()` — this is identical to every other write method's existing,
  already-documented `_persist()` behavior (Repository Contract §5: "replace-
  mode, batch persist"), not a new finding specific to `bulkInsert()`, and is
  explicitly out of this phase's scope (§5 below).

## 5. What This Design Does Not Touch — `_persist()`

`Repository.prototype._persist()` (line 575) is the **sole** place any
Repository method touches the Storage Adapter's `write()`. It always writes
`this._records` — the complete, current array — regardless of how many
records the triggering operation actually changed. This is correct,
documented, existing behavior (Repository Contract §5, "replace-mode"), and
this Design does not propose changing it, for three reasons directly tied to
this project's engineering rules:

1. **It is out of this sub-phase's stated goals** — the goals list
   "Requires ZERO... DatabaseService API changes" and the explicit
   constraint "NO Repository changes" (this is a design-only phase) both
   bound scope to *read-path lookup speed*, not *write-path persistence
   strategy*.
2. **Changing it would require either a different Storage Adapter contract
   (partial/incremental writes) or a fundamentally different persistence
   model** — either is a materially larger architectural change than
   "Cache Layer," and belongs, if ever pursued, to a future phase with its
   own dedicated audit (most naturally Phase 12's IndexedDB work, where
   incremental/keyed writes become a native engine capability instead of a
   `localStorage` workaround).
3. **It would violate this project's "smallest safe change" discipline** —
   exactly the discipline `Repository_API_Consistency_Report.md` and
   `Transaction_Consistency_Report.md` both cite as their own governing
   principle for far smaller changes than a persistence-model rewrite would
   be.

## 6. Lifecycle Integration Summary

| Lifecycle event | `_idIndex` / `_liveCount` behavior |
|---|---|
| Constructor | Both initialized empty/zero, alongside existing `this._records = []` |
| `open()` (first successful call) | Both built fresh, O(n), once — see §2 |
| `open()` (subsequent calls while already ready/busy) | No-op, unchanged (existing early-return, line 289) — index untouched, still valid |
| Every write method, success path | Index/count updated per the §3 table — O(1) or O(n) depending on operation shape, never worse than the operation's own existing complexity |
| Every write method, `_persist()` failure / rollback path | Full rebuild from restored `_records` (Design doc §14/§20) |
| `transaction()`, mid-transaction | Untouched — `working` array only, no index maintained for it (Design doc §13) |
| `transaction()`, successful commit | Full rebuild, once |
| `transaction()`, rollback (any step fails) | No rebuild needed — `this._records` was never reassigned, so `this._idIndex` was never stale to begin with |
| `close()` | No change (existing no-op beyond state transition, unaffected) |
| `dispose()` | Both reset to empty, alongside existing `this._records = []` |

---

## Verdict

```
CACHE LAYER ARCHITECTURE

PASS

READY FOR PHASE 11.4
```
