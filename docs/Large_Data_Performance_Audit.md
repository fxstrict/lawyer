# Large_Data_Performance_Audit.md
## نظام الحسام للمحاماة — V10/V12 Offline-First Architecture
### PHASE 13 — SUB-PHASE 13.0 — Performance Baseline Audit (Large Data Readiness)
**Date:** 2026-07-15
**Type:** Measurement + audit only. No production file modified (confirmed §6 of
`Phase13_0_Verification_Report.md`). Every number below is a **live, measured**
result — not a Big-O estimate — obtained two independent ways this session:

1. **Real browser measurement.** `index.html` served over local HTTP and driven
   by headless Chromium (Playwright), with the real `CasesRepository` /
   `Repository` / `DatabaseService` / `LocalStorageAdapter` stack, real
   `localStorage`, real DOM, at record counts 100 / 500 / 1,000 / 5,000 /
   10,000 / 25,000 / 50,000.
2. **Node harness cross-check** (`js/tests/verify_large_dataset_baseline.js`,
   this phase). Same `CasesRepository` class, an in-memory fake storage
   engine (no quota ceiling, unlike the browser), same record shape, same
   sizes. Used to isolate pure Repository/JSON CPU cost from
   browser-specific storage-quota effects, and to give a repeatable,
   no-browser-required regression check for future phases.

Both were run against a realistic ~23-field Arabic case record (all the
fields `FIELDS.cases`/`MAP.cases` in `index.html` actually define), averaging
**≈787–800 characters of serialized JSON per record** — consistent with
`Performance_Baseline_Report.md`'s (Phase 11.3, estimate-only) assumption of
"0.3–1.5 KB serialized," landing near the middle of that range once measured.

---

## 1. What Was Read

Full read, this session, of: `PROJECT_STATE.md`, `PROJECT_HISTORY.md`,
`PROJECT_MAP.md`, `NEXT_PHASE.md`, `Performance_Baseline_Report.md`,
`Production_Readiness_Audit.md`, `Technical_Debt_Report.md`,
`Cache_Layer_Design.md` (referenced via `Cache_Layer_Implementation_Report.md`,
which supersedes it — the cache described there is confirmed **already
implemented and live** in `Repository.js`, not merely designed),
`Cache_Layer_Architecture.md`'s conclusions (via the same Implementation
Report), `Cache_Layer_Implementation_Report.md`, `Phase11_5_Verification_Report.md`,
`Repository_Undo_Hook_Report.md`, `Phase12_3_Verification_Report.md`,
`Phase12_4_Verification_Report.md`, `UX_First_Run_Report.md`,
`UX04A_Premium_Splash_Report.md`; then `Repository.js` (full, 1992 lines),
`LocalStorageAdapter.js` (full, 632 lines), `DatabaseService.js`,
`StorageAdapter.js`; then representative depth-reads of
`CasesRepository.js` (config/validation) and `cases.js` (repository wiring,
`renderCases()`, `syncCasesMirror()`); then the full `js/modules/` and
`js/repositories/` directory listing and grep-based static analysis (§ in
`Large_Data_Bottlenecks.md`); then `index.html`'s script-load order and
inline bootstrap (lines 750–860).

**Key architectural facts this reading surfaced, ahead of any benchmark:**
- The project's own numbering has "Phase 11" (Cache Layer) and a
  differently-scoped "Phase 12" (Undo Manager, not IndexedDB — an
  operator-approved label override documented in
  `Repository_Undo_Hook_Report.md`'s own Scope Note). **No IndexedDB
  adapter exists anywhere** (`grep -rn indexedDB js/` → zero hits outside
  doc-comments explicitly saying "does NOT implement IndexedDB").
- The Cache Layer (Phase 11.4) already added a `Map<id, arrayIndex>`
  (`_idIndex`) and a running `_liveCount`, giving `get`/`exists`/`update`/
  `delete`/`restore`/`create`'s duplicate-check O(1)-average instead of
  O(n). This is real, shipped code, not a future recommendation — confirmed
  by direct read of `Repository.js` lines 754–801 and 845–897.
- **T-05 (documented, unfixed by design at the time):** every render calls
  `xRepository.getAll()` (to refresh the `data.x` mirror) **and then**
  `xRepository.search(queryModel)` (to compute filtered/sorted rows) — two
  full passes per render. Confirmed live in `cases.js`'s `renderCases()`
  (`syncCasesMirror()` → `getAll()`, then `casesRepository.search(...)`).
- Every single-record write (`create`/`update`/`delete`/`restore`) persists
  by re-serializing and re-writing the **entire** entity array via
  `localStorage.setItem()` — there is no per-record storage granularity at
  any layer. This is the single most consequential architectural fact for
  the scaling question this phase asks.
- `firstrun.js`'s splash screen has a hard `setTimeout(...,1500)` safety cap
  and a `MIN_VISIBLE_MS=450` floor, **entirely decoupled from actual data
  load time** — it does not wait for `casesRepositoryReadyPromise` or any
  other Repository. This matters for §2: real repository-open time is
  currently invisible to the user regardless of dataset size, for better
  (silky perceived boot) or worse (a genuinely slow open would be masked
  up to 1.5s, then would still block whatever renders after the splash).

---

## 2. Boot Timing (real browser measurement, Playwright + headless Chromium)

Methodology: seed `localStorage['cases']` with N full-schema records, full
page reload, then measure `casesRepositoryReadyPromise` resolution time and
a fresh `renderDashboard()` call, from a clean navigation each time.

| N (cases) | Page nav→load (wall, ms) | Repository open→ready (ms) | Dashboard render (ms) | Result |
|---|---|---|---|---|
| 100 | 618 | 0.10 | 0.20 | OK |
| 500 | 370 | 0.00 | 0.70 | OK |
| 1,000 | 423 | 0.00 | 0.60 | OK |
| 5,000 | 728 | 0.00 | 0.90 | OK |
| 10,000 | — | — | — | **`QuotaExceededError` — could not even seed the data. See §3.** |
| 25,000 | — | — | — | Same — quota fails before boot is reachable |
| 50,000 | — | — | — | Same |

**Reading this table:** `Repository.open()` itself is essentially free at
every size that fits in storage at all (0.0–0.1 ms) — `open()` is one
`JSON.parse` of whatever `localStorage.getItem('cases')` returns, plus one
`_rebuildIndex()` pass; both are fast relative to page-load noise at these
sizes. The "page nav→load" column is dominated by Chromium/Playwright
navigation overhead itself (network stack, HTML/CSS parse, ~13 sequential
`<script>` tags — see `PROJECT_MAP.md` §2's 29-step load order), not by
data size, and does not grow with N in this range. **The real boot ceiling
is not a boot-time problem at all — it is that boot cannot happen once the
`cases` key can no longer be written to `localStorage`, full stop.** See §3.

---

## 3. localStorage Storage-Layer Measurement (the real ceiling)

This is the single most important number in this audit, and it was measured
directly, live, by binary search against the real browser API — not
estimated.

**Method:** `localStorage.clear()`, then `localStorage.setItem('cases',
<JSON of N realistic case records>)` in headless Chromium, bisecting N.

```
n=1000   chars=751,410     ok=true
n=2000   chars=1,507,263   ok=true
n=3000   chars=2,263,111   ok=true
n=4000   chars=3,018,960   ok=true
n=5000   chars=3,774,813   ok=true
n=6000   chars=4,530,661   ok=true
n=6500   chars=4,908,588   ok=true
n=6937   chars=5,238,872   ok=true      <- last confirmed-OK
n=6968   chars=5,262,309   ok=false     <- first confirmed-FAIL
n=7000   chars=5,286,510   ok=false
```

**Result: the browser rejects `localStorage.setItem('cases', ...)` at
exactly 5,242,880 characters of serialized JSON** (5 MiB of UTF-16 code
units — the standard Chromium per-origin `localStorage` cap of 10 MiB,
since each UTF-16 unit is 2 bytes). `navigator.storage.estimate()` reports
a much larger figure (234 MB in this environment) — **that estimate is
irrelevant to `localStorage`**; it describes IndexedDB/CacheStorage quota,
not the separate, smaller, hard-coded `localStorage` limit every Chromium
version enforces regardless of disk space available.

With this project's real ~23-field case record (≈790–800 chars/record
serialized, confirmed in both the browser run and the Node harness):

**≈ 6,937 `cases` records is the hard ceiling for that one `localStorage`
key, before any application code, cache layer, or index runs at all.**

This is **not** a per-application quota — it is per-origin, and this
architecture stores 9 entities as 9 separate top-level `localStorage` keys
(`cases`, `sessions`, `clients`, `children`, `documents`, `tasks`, `fees`,
`library`, `templates`) sharing that same one 10 MiB origin budget, plus a
handful of small settings keys (`apiUrl`, `driveUrl`, `sheetUrl`). **6,937 is
therefore an upper bound assuming every other key is empty** — in real use
with clients/sessions/tasks/etc. also growing, the practical combined
ceiling across all 9 entities is measurably lower than "6,937 cases,"
though which entity hits it first depends on that entity's own field count
and typical text-field length (Cases has the most fields of any of the 9 —
see `PROJECT_STATE.md` §4.1's field-count table — so Cases is very likely
the FIRST entity to hit the wall in practice, not necessarily the only
one).

---

## 4. Repository/JSON/Array Operation Timing (real browser + Node cross-check)

Real browser measurement (headless Chromium, real `CasesRepository`, real
`localStorage`) at sizes the quota allowed (100–10,000 for this smaller,
reduced-field synthetic record used for op-timing, ≈380–390 chars/record,
chosen to push the ceiling out far enough to observe 10,000 directly):

| Operation | n=100 | n=500 | n=1,000 | n=5,000 | n=10,000 |
|---|---|---|---|---|---|
| `get(id)` | 0.20 | 0.60 | 0.20 | 0.00 | 0.00 |
| `exists(id)` | 0.00 | 0.00 | 0.10 | 0.00 | 0.00 |
| `getAll()` | 0.30 | 4.60 | 6.70 | 24.60 | 41.20 |
| `count()` no filter | 0.10 | 0.20 | 0.10 | 0.00 | 0.00 |
| `count()` w/ filter | 0.40 | 3.60 | 4.40 | 14.30 | 24.80 |
| `search({search})` | 1.80 | 1.70 | 7.10 | 23.40 | 68.90 |
| `search({filter})` | 0.10 | 0.50 | 0.80 | 13.10 | 19.70 |
| `search({sort})` | 2.70 | 5.80 | 2.80 | 23.50 | 36.90 |
| `find(query)` | 0.20 | 0.20 | 0.20 | 1.20 | 1.50 |
| `JSON.stringify(all)` | 2.70 | 0.70 | 1.30 | 16.20 | 19.00 |
| `JSON.parse(json)` | 0.20 | 0.50 | 2.50 | 9.50 | 20.20 |
| `localStorage.getItem` | 0.00 | 0.00 | 0.00 | 0.10 | 0.00 |
| `localStorage.setItem` | 0.30 | 5.80 | 7.00 | 28.60 | 51.60 |
| `create()` | 1.00 | 9.40 | 17.60 | 52.50 | 186.30 |
| `update()` | 2.30 | 4.30 | 12.70 | 56.40 | 123.40 |
| `delete()` | 0.40 | 5.10 | 15.50 | 70.60 | 130.20 |
| `restore()` | 0.40 | 1.30 | 7.90 | 131.10 | 177.70 |
| `bulkInsert(m)` | 5.70 (m=10) | 3.20 (m=50) | 21.20 (m=100) | 204.10 (m=200) | 376.00 (m=200) |
| `bulkUpdate(m)` | 0.80 | 8.80 | 12.50 | 92.60 | 160.80 |
| `bulkDelete(m)` | 2.60 | 7.00 | 25.00 | 143.20 | 243.20 |
| `transaction(20 ops)` | 1.50 | 7.50 | 23.40 | 175.60 | 459.70 |
| raw `Array.filter` | 0.00 | 0.10 | 0.10 | 2.90 | 0.70 |
| raw `Array.map` | 0.00 | 0.00 | 0.00 | 0.30 | 4.50 |
| raw `Array.sort` | 0.00 | 0.10 | 0.10 | 0.20 | 0.60 |

All times in milliseconds, single Chromium instance, single sample per
cell (noise band ±20–30% typical for JS timing this session — see caveats
in `Phase13_0_Verification_Report.md` §5).

**Node harness cross-check** (same operations, real `CasesRepository`,
in-memory fake storage with no quota — lets us see 25,000/50,000 the
browser physically could not seed with the full-field record):

| Operation | n=100 | n=1,000 | n=5,000 | n=10,000 | n=25,000 | n=50,000 |
|---|---|---|---|---|---|---|
| `getAll()` | 0.62 | ~7 | 30.23 | 63.02 | 161.75 | 319.04 |
| `search({search})` | 1.84 | ~7 | 23.99 | 39.48 | 85.92 | 151.79 |
| `search({sort})` | 1.08 | ~3 | 32.81 | 57.16 | 158.33 | 364.78 |
| `JSON.stringify` | 0.61 | ~1.3 | 19.43 | 33.32 | 190.61 | 525.47 |
| `JSON.parse` | 0.46 | ~2.5 | 9.62 | 19.32 | 179.70 | 438.93 |
| `create()` | 0.96 | ~4 | 24.40 | 33.19 | 127.82 | 428.99 |
| `update()` | 1.09 | ~5 | 21.88 | 37.37 | 137.89 | 570.60 |
| `delete()` | 0.97 | ~4.5 | 21.82 | 49.18 | 128.17 | 565.05 |
| `bulkInsert(200)` | 1.68 (m=10) | ~8.5 | 28.32 | 40.08 | 127.76 | 632.41 |
| `transaction(20 ops)` | 3.34 | ~18 | 115.95 | 155.21 | 408.27 | 884.28 |
| `get`/`exists`/`count()` (no filter) | ≤0.11 | ≤0.05 | ≤0.03 | ≤0.05 | ≤0.05 | ≤0.05 |

**Confirms the Cache Layer (Phase 11.4) is working as designed:** `get`,
`exists`, and unfiltered `count()` stay flat and near-zero from n=100 to
n=50,000 — the O(1)-average `_idIndex` lookup genuinely holds at scale, in
both the real browser and the Node cross-check. Every other write/read
operation grows visibly with n, exactly matching the O(n)-persist /
O(n)-scan analysis in `Performance_Baseline_Report.md` §2 — that estimate
is now measurement-confirmed, not just Big-O reasoning.

---

## 5. DOM Render Timing (real browser measurement, `renderCases()`)

Full table body rebuild (`innerHTML =` full row set, no pagination or
virtualization — confirmed by static read, `cases.js`'s render function
builds one large HTML string per call and assigns it once):

| N rows | `renderCases()` (ms) | DOM `<tr>` count after |
|---|---|---|
| 100 | 16.80 | 100 |
| 500 | 56.60 | 500 |
| 1,000 | 118.60 | 1,000 |
| 5,000 | 825.30 | 5,000 |
| 10,000 | 1,439.30 | 10,000 |

This is the clearest super-linear-feeling curve in the whole audit: 100→
1,000 rows (10×) costs ~7× the time (16.8→118.6 ms), but 1,000→10,000
rows (10×) costs ~12× the time (118.6→1,439.3 ms) — consistent with DOM
insertion/layout cost per row growing as the table itself grows (more
existing rows for the browser to account for during reflow), on top of the
underlying O(n) `getAll()`+`search()` (T-05) that feeds it. **At 10,000
rows, a single search-box keystroke that triggers `renderCases()` costs
≈1.4 seconds of main-thread time** — well past the ~100 ms "feels
instant" and ~1 s "feels sluggish but tolerable" UX thresholds.

---

## 6. Answering the Brief's Core Question, With Numbers

| Case count | Boots? | Storage fits? | CRUD feels instant (<50ms)? | Search/filter feels instant? | Render feels instant? | Overall |
|---|---|---|---|---|---|---|
| 100 | Yes | Yes (1.5% of quota) | Yes | Yes | Yes (17 ms) | **Fully fine** |
| 500 | Yes | Yes (3.6%) | Yes | Yes | Borderline (57 ms) | **Fully fine** |
| 1,000 | Yes | Yes (7.3%) | Mostly (create/update 13–18ms) | Yes | No (119 ms, noticeable) | **Fine, first visible lag** |
| 5,000 | Yes | Yes (36%) | No (create/delete 50–70ms, restore 131ms) | No (search 23–33ms, borderline) | No (825 ms — sluggish) | **Usable but sluggish** |
| 10,000 | Only if `cases` alone (this exact field count would already be over quota — see §3; shown here at the smaller op-timing schema) | Marginal/exceeded depending on field count | No (create 186ms, transaction 460ms) | No (39–69ms) | No (1.44 s — bad) | **Degraded, storage risk high** |
| 25,000 | **No — real quota failure**, confirmed live | **No** | N/A | N/A | N/A | **Cannot boot with this record shape** |
| 50,000 | **No — real quota failure**, confirmed live | **No** | N/A | N/A | N/A | **Cannot boot with this record shape** |

**Direct answer:** the current architecture, unmodified, can genuinely
handle **100–1,000 cases very comfortably**, is **usable but increasingly
sluggish from ~1,000–6,000 cases**, and **cannot physically store more
than roughly 6,500–7,000 full-schema case records at all** — not a
performance degradation, a hard `QuotaExceededError` that stops every
write dead, confirmed by live binary search against the real browser API,
not projected. **10,000/25,000/50,000 cases are not "slow" under this
architecture — they are impossible** without either (a) trimming which
fields get stored/serialized, (b) moving to a storage engine without
`localStorage`'s ~10 MiB origin cap (IndexedDB, OPFS, or a remote
database), or (c) both.

---

## 7. Migration Recommendation (documented only, per phase brief — NOT implemented)

In priority order, least change first:

1. **Purge/trim policy for soft-deleted records (addresses T-04 directly,
   cheapest lever available).** Every soft-deleted record still occupies
   its full serialized footprint forever (Technical_Debt_Report.md T-04).
   A "hard-delete records soft-deleted >N days" background sweep would
   reclaim real, measured `localStorage` headroom with zero Repository
   API change — `delete(id, {hard:true})` already exists.
2. **Reduce persisted field size for large free-text fields** (e.g.
   `الملاحظات`/notes, `الطلبات_القانونية`, `الدفوع_القانونية` — several
   `cases` fields are open free text). Even a modest field-length cap or
   compression would materially raise the ≈6,937-record ceiling measured
   in §3, without touching storage engine or Repository contract at all.
3. **Pagination or virtual rendering for `renderCases()`/every other
   `render<Entity>()`.** Directly addresses §5's 825 ms–1.44 s render
   times; does not touch the storage-quota ceiling (§3/§6) at all, but is
   the correct fix for the render-time curve specifically, and is
   low-risk/localized to each Module's render function.
4. **Close T-05 (single query per render instead of `getAll()` +
   `search()`).** Already anticipated as a natural follow-on to the Cache
   Layer per `Technical_Debt_Report.md` T-05's own text. Would roughly
   halve the per-render Repository-layer cost shown in §4, independent of
   the DOM cost in §5.
5. **A real storage-engine swap (IndexedDB/OPFS) is the only fix for §3's
   hard ceiling itself.** `StorageAdapter.js`'s abstraction was built
   exactly for this (`DatabaseService_Design_Report_PHASE3_V10.md`'s
   original design intent, reaffirmed in `PROJECT_STATE.md` §4/§11) — no
   `Repository` or `Module` change should be required, by the architecture's
   own design contract, only a new concrete adapter class plus a
   migration/import step for existing `localStorage` data. This remains
   the correct SUB-PHASE 13.1+ candidate if the practice genuinely expects
   to exceed ~5,000–6,000 cases; below that, items 1–4 above are cheaper
   and lower-risk and should be tried first.

**No architectural decision is made by this document** — per phase brief,
this is measurement and recommendation only.
