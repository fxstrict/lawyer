# Large_Data_Bottlenecks.md
## نظام الحسام للمحاماة — V10/V12 Offline-First Architecture
### PHASE 13 — SUB-PHASE 13.0 — Static Analysis + Top-20 Bottlenecks
**Date:** 2026-07-15. Companion to `Large_Data_Performance_Audit.md` (measured
timings) and `Phase13_0_Verification_Report.md` (sign-off). No production
file modified.

---

## 1. Static Analysis — Grep Sweep Across `js/` (production files, tests excluded)

| Pattern | Total occurrences | Files touched |
|---|---|---|
| `JSON.parse` / `JSON.stringify` | 33 | `settings.js`, `clients.js`, `cases.js`, `api.js`, `Repository.js`, `UndoManager.js`, `LocalStorageAdapter.js`, `index.html` |
| `localStorage.getItem` / `localStorage.setItem` | 30 | `settings.js`, `firstrun.js`, `StorageAdapter.js`, `LocalStorageAdapter.js`, `index.html` |
| `innerHTML =` | 62 | all 12 `js/modules/*.js` files + `index.html` |

Per-module `innerHTML =` counts (every module that renders a list/table
does at least one full-string rebuild-and-assign, none use incremental
DOM patching):

```
calendar.js: 3    clients.js: 10   library.js: 3    tasks.js: 2
cases.js: 9       dashboard.js: 6  sessions.js: 2    templates.js: 3
children.js: 3    documents.js: 4  settings.js: 6
fees.js: 4        firstrun.js: 5
```

Per-module `Array.map/filter/find/sort/reduce` counts:

```
                map filter find sort reduce
calendar.js      3    2     0    1     0
cases.js         2    9     2    2     0
children.js      2    0     0    2     0
clients.js       6    7     0    0     1
dashboard.js     3    8     0    1     0
documents.js     2    1     0    0     0
fees.js          2    0     0    1     1
library.js       4    2     0    1     0
sessions.js      1    2     0    0     0
settings.js      2    2     0    0     0
tasks.js         1    1     0    1     0
templates.js     4    5     0    1     0
```

`dashboard.js` has the highest `.filter()` density (8) despite having *no*
Repository dependency by design (`PROJECT_STATE.md` §10) — it filters the
plain `data.*` mirror arrays directly, once per stat card, on every
`renderDashboard()` call. At current expected scale (tens–low thousands)
this is negligible (confirmed: 0.20–0.90 ms measured live, §2 of the
Performance Audit); it would become the dashboard's own bottleneck first
if any single entity mirror grew past roughly 10,000–20,000 live records,
well past this audit's confirmed `cases`-key storage ceiling (~6,937, §3
of the Performance Audit) — i.e., **the storage ceiling is reached before
the dashboard-filter cost would become the limiting factor**, for the
`cases` entity specifically.

`forEach`/`for`/`while` counts per module — no module was found using
`while` at all; every module's iteration is `forEach` or bounded `for`,
none unbounded:

```
              forEach  for  while
calendar.js      0      2     0
cases.js         5      4     0
children.js      0      1     0
clients.js       3      1     0
documents.js     0      1     0
fees.js          0      1     0
library.js       1      1     0
sessions.js      0      1     0
settings.js      1      0     0
tasks.js         0      1     0
templates.js     1      1     0
```

## 2. Full-Array-Scan Inventory (Repository base class, `js/core/Repository.js`)

Confirmed by direct read (not grep alone — every entry below was traced to
its actual body):

| Method | Scan type | Post-Cache-Layer status (Phase 11.4, already shipped) |
|---|---|---|
| `_indexOf(id)` | *was* O(n) linear `for` | **Fixed — now O(1)-avg `Map.get()`** |
| `get(id)` | via `_indexOf` | **O(1)-avg** (confirmed flat 0.00–0.20ms, n=100→50,000) |
| `exists(id)` | via `_indexOf` | **O(1)-avg** (confirmed flat) |
| `update(id)` | `_indexOf` (O(1)) + O(n) persist | O(n), persist-dominated |
| `delete(id)` | `_indexOf` (O(1)) + O(n) persist | O(n), persist-dominated |
| `create(entity)` | `_indexOf` dup-check (O(1)) + O(n) persist | O(n), persist-dominated |
| `getAll()` | full O(n) `.filter().map()` | **Unfixed — inherent to the contract (§4)** |
| `search(queryModel)` | full O(n) filter/search + optional O(n log n) sort | **Unfixed — inherent** |
| `count(queryModel)` w/ filter or search | full O(n) scan | Unfixed — no filter/search-aware fast path exists |
| `count()` no filter | `_liveCount` | **O(1) — fixed, Phase 11.4** |
| `bulkUpdate(m)`/`bulkDelete(m)`/`import('merge',m)` | *was* O(m·n) | **Fixed — now O(m + n)**, `_idIndex` lookups per item |
| `_rebuildIndex()` | full O(n) rebuild | Runs after hard-delete, `import('replace')`, `clear()`, `transaction()` commit — correctly O(n), unavoidable |
| `transaction(k ops)` internal `working.findIndex()`/`.some()` | O(k·n), **deliberately NOT accelerated** (documented, `Repository.js` line ~1929: zero production callers today, explicitly deferred) | Unfixed by design, currently inconsequential (no caller) |
| `_persist()` | O(n) `JSON.stringify` of the WHOLE array, every single write, no exception | **The single largest unaddressed bottleneck in the whole stack** — see §3 #1 |

## 3. Top 20 Bottlenecks, Ranked by Measured Impact

Ranked by how much real, measured cost (§4/§5 of the Performance Audit)
each item is responsible for, worst first:

1. **`localStorage`'s ~10 MiB per-origin cap (5,242,880-char `setItem`
   ceiling, measured live) is a hard wall, not a slowdown.** At this
   project's real ~790-char/record `cases` schema, that is **≈6,937
   records** — full stop, `QuotaExceededError`, no partial degradation.
   This is the #1 bottleneck by a wide margin: everything else in this
   list is "slower," this one is "does not work at all" past that point.
2. **Every single-record write (`create`/`update`/`delete`/`restore`)
   re-serializes and re-writes the ENTIRE entity array.** No storage layer
   in this stack supports per-record persistence. Measured: `create()` at
   n=10,000 costs 186 ms (browser) / at n=50,000 costs 429–605 ms (Node) —
   for changing ONE record.
3. **`renderCases()` (and every sibling `render<Entity>()`) rebuilds the
   entire visible table as one `innerHTML=` string, every call, no
   pagination/virtualization.** Measured 1.44 s at 10,000 rows — the
   single worst "feels broken" number in this whole audit, worse even than
   any individual Repository call.
4. **T-05 — double full-array pass per render** (`getAll()` for the
   mirror, then `search()` for the rendered rows) — confirmed live in
   `cases.js`'s `renderCases()`, same pattern in 8 other modules
   (`Technical_Debt_Report.md` T-05, still open). Roughly doubles the
   Repository-layer cost of every render, on top of #3.
5. **`transaction(k ops)`'s internal per-step `working.findIndex()`/
   `.some()` calls are unaccelerated** (O(k·n), by explicit documented
   design choice, since it has zero production callers today) — measured
   115 ms (n=5,000) → 884 ms (n=50,000) for a 20-op transaction; would
   become materially worse the moment any Module actually starts calling
   `transaction()` at scale.
6. **`bulkInsert`/`bulkUpdate`/`bulkDelete` all still persist once per
   call (O(n)), on top of their now-O(m) lookups** — the O(m·n)→O(m+n) win
   from the Cache Layer only removed the lookup term; the O(n) persist
   term was always there and dominates at scale (measured 632 ms for a
   200-item `bulkInsert` at n=50,000).
7. **`search({sort:...})` (O(n log n))** is consistently the single
   slowest *read* operation measured at every size (e.g. 364.78 ms at
   n=50,000, worse than plain `getAll()`'s 319.04 ms at the same size) —
   the sort comparator's per-comparison `readField()`/`toComparable()`
   calls add real overhead on top of the theoretical n log n.
8. **`JSON.stringify`/`JSON.parse` of the full array is now a visible
   cost in its own right at scale** — 525 ms / 439 ms respectively at
   n=50,000 (Node) — meaning even a hypothetical storage engine with no
   quota ceiling would still pay this every persist/open, since the
   Repository layer's clone-on-read/write discipline
   (`cloneRecord = JSON.parse(JSON.stringify(record))`) is JSON-based
   throughout.
9. **`search({search: term})` (substring scan across `_searchFields`)** —
   151.79 ms at n=50,000 (Node); scales with `_searchFields.length ×
   record count`, and Cases has one of the larger `searchFields` arrays of
   the 9 entities.
10. **`count(queryModel)` with any filter/search still falls through to a
    full O(n) scan** (only the no-filter fast path got the Phase 11.4
    O(1) treatment) — measured 131 ms at n=50,000 for a single-field
    equality filter, i.e. materially slower than the near-zero unfiltered
    `count()`.
11. **`cloneRecord()` runs on every single record returned by `get`,
    `getAll`, `search`, `find`, `export`, and every write-result** — a
    JSON round-trip per record, multiplied by however many records a call
    returns; the dominant per-record cost inside `getAll()`'s 319 ms at
    n=50,000.
12. **No pagination/limit exists anywhere in `search()`'s query model** —
    a "search" that returns 40,000 of 50,000 records still clones and
    returns all 40,000 (confirmed by reading `Repository.js`'s `search()`
    body — no `limit`/`offset`/`page` parameter is honored, despite
    `Performance_Baseline_Report.md`'s own timing table listing "O(page)
    clone" as if paging were already implemented — it is not, this is a
    documentation/reality gap worth flagging on its own).
13. **`dashboard.js`'s 8 `.filter()` calls against plain `data.*` mirrors,
    once per `renderDashboard()` call** — individually cheap today
    (confirmed 0.20–0.90 ms live) but uncached and re-run on every
    dashboard visit/navigation regardless of whether the underlying data
    changed since the last visit.
14. **`_rebuildIndex()` (full O(n) Map rebuild) fires on every hard-delete,
    `import('replace')`, `clear()`, and `transaction()` commit** — correct
    and unavoidable given those operations' semantics, but stacks with
    whatever else already ran in the same call (e.g. a hard `delete()`
    pays splice cost + index rebuild + persist, all O(n), sequentially).
15. **`array_map`/`array_sort` native ops show a visible, slightly
    non-monotonic jump in the Node cross-check around n=25,000** (15.04 ms
    map / 17.82 ms sort — both meaningfully worse than their n=10,000 and
    n=50,000 neighbors) — most likely V8 GC/deopt noise rather than a real
    algorithmic cliff; flagged here as an observation, not a confirmed
    bottleneck (see caveats, `Phase13_0_Verification_Report.md` §5).
16. **`saveLocal()` (the pre-Repository legacy global function still
    defined in `index.html`'s inline bootstrap) serializes all 9 entities'
    `data.*` mirrors in one `forEach`, every time it's called** — a
    parallel, independent full-array-write path that exists alongside the
    Repository's own `_persist()`, for any code path that still calls the
    legacy function rather than going through a Repository (confirmed
    present in `index.html` line 781; this audit did not attempt to
    enumerate every remaining call site, out of scope for a read-only
    phase, but flags it as worth a follow-up grep).
17. **No debounce on search-input-triggered `renderCases()`** — every
    keystroke in the search box re-runs the full T-05 double-scan (#4)
    plus the full DOM rebuild (#3); at 10,000 rows that is ≈1.44 s of
    main-thread work **per keystroke**, confirmed by this audit's own
    §5 DOM timing table, not a separate measurement — flagged here purely
    to connect #3/#4's numbers to the actual triggering UI event.
18. **`restore()`'s timing is consistently among the highest of the basic
    CRUD ops at scale** (177.70 ms at n=10,000 browser; 604 ms at
    n=50,000 Node) despite being architecturally identical in cost to
    `update()` — likely explained by `restore()`'s additional
    `_recordUndo()` call (Cases only, Phase 12.4's Undo pilot) doing its
    own clone of the previous+new record on top of the standard write
    path; worth isolating in a future phase if Undo is rolled out beyond
    the current Cases-only pilot.
19. **`import('merge', m)` and `bulkUpdate`/`bulkDelete`'s shared O(m+n)
    complexity means the "n" term never disappears** — even a 1-record
    `bulkUpdate` against a 50,000-record entity still pays the full O(n)
    persist; there is no way, in the current architecture, to make a
    single-record change cheaper than "rewrite everything," no matter
    which method is used to express that change.
20. **No content-length/byte-budget guard exists anywhere in
    `LocalStorageAdapter.write()`** — the adapter's own `write()` (read in
    full, §per `Large_Data_Performance_Audit.md` §1) catches
    `QuotaExceededError` only generically as a `StorageError`, with no
    proactive "you are approaching the limit" warning before the failure
    actually occurs; the user experience for hitting #1 today is a raw
    failed write with no advance notice.

## 4. Complexity Analysis Summary (per layer, post-Cache-Layer reality — not the pre-11.4 estimate)

| Layer | Typical operation | Complexity today |
|---|---|---|
| Storage engine (`localStorage`) | any `setItem`/`getItem` | O(n) in payload size; **hard ceiling independent of complexity class**, see §3 #1 |
| `LocalStorageAdapter` | `read`/`write` | O(n) — one `JSON.parse`/`JSON.stringify` of the whole array |
| `Repository` — id-keyed ops | `get`/`exists`/`update`/`delete`/`create` dup-check | **O(1) avg** (index) + O(n) (persist, for writes) |
| `Repository` — bulk id-keyed ops | `bulkUpdate`/`bulkDelete`/`import('merge')` | **O(m + n)** (index) — was O(m·n) pre-11.4 |
| `Repository` — full scans | `getAll`/`search`/`find`/`export`/`count` w/ filter | O(n), O(n log n) if sorted |
| `Repository` — no-filter count | `count()` | **O(1)** (`_liveCount`) |
| `Repository` — transaction internals | per-step lookups inside `transaction()` | O(k·n) — unaccelerated by design, zero current callers |
| Module render layer | `render<Entity>()` | O(n) Repository read + O(n) DOM string build + O(n) DOM insert/reflow — three stacked O(n) costs, not one |
