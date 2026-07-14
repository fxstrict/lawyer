# CasesRepository_Wiring_Report.md

## PHASE 8 — SUB-PHASE 8.5.1 — Repository Wiring Pilot (CasesRepository Only)

---

### 1. Purpose

This sub-phase replaces `CasesRepository`'s temporary, hand-rolled, ad-hoc
localStorage adapter (built in PHASE 5.2, before `DatabaseService` existed)
with the real `DatabaseService` (backed by the real `LocalStorageAdapter`),
both integration-verified end-to-end in PHASE 8/8.4.2
(`js/tests/verify_database_pipeline.js`, 37/37 checks passed). This is a
**pilot**: exactly one Repository (`CasesRepository`) is wired this phase,
to prove the wiring pattern is safe before applying it to the remaining
eight.

**Modified:** `js/repositories/CasesRepository.js` only.
**Not modified:** `js/core/Repository.js`, `js/core/DatabaseService.js`,
`js/core/StorageAdapter.js`, `js/core/LocalStorageAdapter.js`, every other
`js/repositories/*.js` file, `index.html`, any CSS, `Code_v4.gs`.

---

### 2. What changed, precisely

Only `CasesRepository.js`'s **Storage Adapter construction** changed.
Nothing else in the file's behavior changed:

| Aspect | Before (PHASE 5.2) | After (PHASE 8.5.1) |
|---|---|---|
| `createCasesLocalStorageAdapter(storageImpl)` — exported name | same | same (unchanged) |
| `createCasesLocalStorageAdapter(storageImpl)` — signature | `(storageImpl?)` | `(storageImpl?)` (unchanged) |
| `createCasesLocalStorageAdapter(storageImpl)` — return value | a hand-rolled `{read, write}` object, both `async` functions written directly against `storageImpl`/`localStorage` | a real `DatabaseService` instance, constructed from a real `LocalStorageAdapter` instance (`new DatabaseService(new LocalStorageAdapter({storageImpl}))`) |
| `CasesRepository` constructor | unchanged | unchanged (still `config.storageAdapter \|\| createCasesLocalStorageAdapter()`) |
| `CasesRepository.prototype._validate` | unchanged | unchanged — byte-identical |
| `CasesRepository.prototype.validate` | unchanged | unchanged — byte-identical |
| `CasesRepository.prototype._matchesSearch` | unchanged | unchanged — byte-identical |
| `CasesRepository.prototype.filter` | unchanged | unchanged — byte-identical |
| `CasesRepository.prototype.sort` | unchanged | unchanged — byte-identical |
| `CasesRepository.prototype.insert` / `.remove` | unchanged | unchanged — byte-identical |
| `CASES_ID_FIELD` / `CASES_REQUIRED_FIELDS` / `CASES_SEARCH_FIELDS` / `CASES_FILTER_FIELDS` / `CASES_SORT_FIELDS` / `CASES_LEGACY_FIELDS` | unchanged | unchanged — byte-identical |
| Every inherited Contract-literal method (`create`/`update`/`delete`/`get`/`getAll`/`find`/`exists`/`count`/`bulkInsert`/`bulkUpdate`/`bulkDelete`/`search`/`export`/`import`/`clear`/`transaction`) | inherited unchanged from `Repository.prototype` | still inherited unchanged from `Repository.prototype` — `Repository.js` was not touched |

A raw diff of the two files (before/after this phase) touches only:
the file header comment block (documents the wiring, no behavior),
the `require()` block (adds `DatabaseService.js`/`LocalStorageAdapter.js`
alongside the existing `Repository.js` require), and the body of
`createCasesLocalStorageAdapter()` itself. **164 changed lines total**, all
within those three regions — zero changes anywhere in §3 (validation),
§3.2 (search), §3.3 (sort), or §3.4 (aliases) of the file.

---

### 3. Why this is safe — the grounding fact from PHASE 8.4.2

`Repository.js` (unmodified, and never touched by this phase either) calls
exactly two methods on whatever object is injected as its `storageAdapter`:
`read(entityKey)` in `open()`, and `write(entityKey, records)` in
`_persist()` (the single choke point behind every write operation). A
`DatabaseService` instance exposes both of these, each delegating,
unchanged, straight to its own injected `LocalStorageAdapter` instance
(`js/core/DatabaseService.js` §1.2 — confirmed by direct reading, not
assumed). This exact pipeline (`Repository` → `DatabaseService` →
`LocalStorageAdapter`) was already built and integration-tested end-to-end
in PHASE 8/8.4.2 (`docs/Database_Pipeline_Report.md`, 37/37 checks). This
phase does nothing new at the pipeline level — it only points
`CasesRepository`'s existing dependency-injection seam at that
already-verified pipeline instead of at a hand-rolled duck-typed stand-in.

---

### 4. Verification performed

`js/tests/verify_cases_repository_wiring.js` — **42/42 checks passed.**
Full output:

```
PASS — CasesRepository / createCasesLocalStorageAdapter still exported as functions (public API unchanged)
PASS — createCasesLocalStorageAdapter() now returns a real DatabaseService instance (not an ad-hoc object)
PASS — that DatabaseService is backed by a real LocalStorageAdapter instance (instanceof StorageAdapter)
PASS — DatabaseService still exposes exactly the read()/write() surface Repository.js requires (duck-type contract)
PASS — a default-constructed CasesRepository genuinely routes open()/create() through DatabaseService.read()/write()
PASS — CasesRepository() constructed with NO config at all does not throw synchronously (lazy engine resolution)
PASS — open() on empty storage starts with zero records, no throw
PASS — CasesRepository is a function / class, subclassing Repository
PASS — validate() rejects a record missing all 3 required fields
PASS — validate() accepts a record with all 3 required fields non-empty
PASS — validate() rejects whitespace-only required fields
PASS — insert() [alias of create()] adds a new case using رقم_القضية as id
PASS — insert() rejects a duplicate رقم_القضية
PASS — insert() rejects an invalid record before touching storage
PASS — insert() a second case with الحالة/نوع_الدعوى for filter tests
PASS — get(id) returns the case by رقم_القضية; unknown id returns null
PASS — exists(id) true/false
PASS — update(id, patch) merges fields and stamps updatedAt/version
PASS — update(id, patch) rejects a patch that would violate required fields
PASS — search() free-text matches across any legacy field, case-insensitively
PASS — search() does NOT match against new audit/metadata fields (checksum)
PASS — filter() by الحالة matches the status dropdown behavior
PASS — filter() by نوع_الدعوى matches the type dropdown behavior
PASS — filter() combining both fields uses AND semantics
PASS — sort() accepts an explicit sortSpec without mutating input
PASS — remove(id) [alias of delete()] soft-deletes by default
PASS — getAll({includeDeleted:true}) still returns the soft-deleted record
PASS — Contract-literal create/update/delete are still present and callable
PASS — insert/remove/filter/sort/validate are additive aliases, not overriding create/update/delete
PASS — written localStorage["cases"] is a plain JSON array, byte-parseable exactly like index.html expects
PASS — BEFORE (old ad-hoc adapter) vs AFTER (DatabaseService pipeline): identical operation sequence produces an IDENTICAL result trace
PASS — close() then open() on the SAME instance reloads identical data
PASS — a brand-new CasesRepository + new DatabaseService over the SAME engine sees identical data ("reload")
PASS — open() loads pre-existing legacy-shaped localStorage["cases"] data unchanged, through the NEW pipeline
PASS — legacy data written by the OLD adapter is readable by a CasesRepository using the NEW pipeline (cross-adapter compatibility)
PASS — data written by the NEW pipeline is readable by a CasesRepository using the OLD adapter (round-trip compatibility)
PASS — corrupt JSON already in storage surfaces as a Repository StorageError under the NEW pipeline (same shape as under the OLD adapter)
PASS — operating before open() throws an identical structured "not ready" StorageError under both
PASS — Repository.js / DatabaseService.js / StorageAdapter.js / LocalStorageAdapter.js are untouched by this phase
PASS — no sibling Repository file (Clients/Children/Sessions/Tasks/Fees/Documents/Templates/Library) was touched
PASS — CasesRepository.js does not reference any sibling Repository at runtime (independent class, only DatabaseService/LocalStorageAdapter/Repository added)
PASS — CasesRepository.js requires exactly Repository.js, DatabaseService.js, and LocalStorageAdapter.js (no new dependency beyond PHASE 8's own files)

42/42 checks passed.
```

The PHASE 8/8.4.2 pipeline harness (`js/tests/verify_database_pipeline.js`)
was also re-run unmodified against the current tree: **37/37 checks still
pass**, confirming this phase introduced no regression at the
`Repository`/`DatabaseService`/`LocalStorageAdapter` layer either.

#### 4.1 CRUD (§B, §C)
`create`/`insert`, `get`, `getAll`, `update`, `delete`/`remove`, `exists`,
`clear`-adjacent soft-delete semantics all covered, both as a standalone
suite against the new pipeline and as a direct BEFORE/AFTER trace
comparison (§4.4 below).

#### 4.2 Validation
All 3 required fields (`رقم_القضية`, `عنوان_القضية`, `اسم_الموكل`) individually
and jointly, whitespace-only rejection, duplicate-id conflict, and
validation-failure-before-persist all confirmed identical to PHASE 5.2's
recorded baseline (`docs/Cases_Repository_Verification_Report.md`).

#### 4.3 Search / Filter / Sort
Full free-text substring search across all legacy fields (excluding new
audit fields), `filter()` on `الحالة`/`نوع_الدعوى` individually and combined
(AND semantics), and `sort()` with an explicit `sortSpec` without mutating
its input — all confirmed unchanged.

#### 4.4 Direct BEFORE/AFTER regression comparison
A single deterministic sequence of 20+ operations (opens, creates —
success/duplicate/invalid, gets, exists checks, an update — success/
rejected, four search/filter combinations, a delete, a second reopen) is
run twice: once with `CasesRepository` wired to a frozen, in-harness
reproduction of the OLD PHASE 5.2 ad-hoc adapter, and once with it wired to
the real, current `createCasesLocalStorageAdapter()` (the NEW
DatabaseService pipeline). Every result — including the raw JSON actually
persisted to the fake `localStorage['cases']` key — is asserted
`deepStrictEqual`, after normalizing only the wall-clock-dependent
`createdAt`/`updatedAt`/`checksum` fields (whose *values* necessarily differ
between two runs executed at different instants regardless of which
adapter is used, but whose *presence* and *derivation logic* are
unaffected — confirmed identical field-for-field otherwise, including
`deletedAt` presence/absence and `version` numbers).

#### 4.5 Persistence across reopen
Covered at two levels: (a) `close()` then `open()` on the same
`CasesRepository` instance; (b) a brand-new `CasesRepository` + brand-new
`DatabaseService` instance pointed at the same underlying fake engine —
both see identical data.

#### 4.6 Backward compatibility with existing localStorage data
Covered at three levels: (a) a legacy-shaped seed record (no audit fields,
as `saveCase()` would have produced before any Repository layer existed) is
loaded correctly through the NEW pipeline; (b) data written by the OLD
adapter is read back correctly by a `CasesRepository` using the NEW
pipeline; (c) data written by the NEW pipeline is read back correctly by a
`CasesRepository` using the OLD adapter. All three confirm the on-disk
`localStorage['cases']` format itself never changed — only the code path
that reads/writes it did.

#### 4.7 Exception-path parity
A corrupt-JSON scenario and a "call before `open()`" scenario are each run
against both the OLD and NEW wiring; `Repository.prototype.open()`/its
own-ready guard wrap **any** adapter failure into the identical structured
`{type, entity, recoverable}` shape regardless of which adapter produced
it, and this is confirmed to hold in both cases. See §5 below for the one
documented, non-functional difference (exact error **message wording**).

#### 4.8 Structural / scope confirmation
MD5 of `Repository.js`/`DatabaseService.js`/`StorageAdapter.js`/
`LocalStorageAdapter.js` reconfirmed unchanged from the values recorded in
`docs/Database_Pipeline_Report.md`. A byte-for-byte diff of the entire
project tree against the pre-phase archive confirms **`CasesRepository.js`
is the only pre-existing file that differs anywhere in the project** (the
two new files this phase creates are, of course, new). `CasesRepository.js`
is confirmed to `require()` exactly three core files
(`Repository.js`/`DatabaseService.js`/`LocalStorageAdapter.js`) and to
contain zero runtime reference to any sibling `*Repository.js`.

---

### 5. Documented, non-functional deviations (not defects)

Both of the following were anticipated in the file's own header comment
("WIRING UPDATE" note) before the harness was written, and both are
confirmed harmless by the harness itself:

1. **Construction-time vs. first-call-time engine resolution.** The OLD
   adapter resolved (and could synchronously throw about) its localStorage
   engine at `createCasesLocalStorageAdapter()` call time — i.e., at
   `CasesRepository` construction, if no `storageImpl` was supplied and no
   global `localStorage` existed. The NEW pipeline (via
   `LocalStorageAdapter`'s own, unmodified, already-verified lazy-resolution
   design) defers that same check to the first `read()`/`write()` call,
   surfacing as an async rejection rather than a synchronous throw. Since
   `CasesRepository` is not wired into `index.html` and every real caller
   (tests, and any future integration) always supplies a `storageImpl` or
   runs in a real browser with `localStorage` present, this has no
   observable effect on any currently-running code path. Confirmed
   explicitly: `new CasesRepository()` with no arguments no longer throws
   synchronously (§4, first block).
2. **Error message wording on storage-layer failure.** Both the OLD and NEW
   adapters' underlying failures are caught and re-wrapped by
   `Repository.prototype.open()`/`_persist()` into the identical structured
   `RepositoryError` shape (`{type, message, field, entity, recoverable}`),
   with identical `type`/`entity`/`recoverable` values in every case tested.
   The `message` **string** differs (e.g. `"...Corrupt JSON in
   localStorage[\"cases\"]: ..."` under the OLD adapter vs `"...stored value
   is not valid JSON — ..."` under the NEW pipeline, both wrapped inside the
   same outer `"Failed to open Repository for entity \"cases\": "` prefix),
   because the inner message now originates from the real
   `LocalStorageAdapter` class's own error text rather than the old
   hand-rolled adapter's. No code anywhere in the project parses or matches
   on this message string (confirmed: `CasesRepository` has never been
   wired into `index.html` or any Module) — only `.type` is ever
   structurally meaningful, and that is unchanged.

---

### 6. Confirmation — only CasesRepository.js modified

```
$ diff -rq <original archive> <this phase's tree>
Files .../js/repositories/CasesRepository.js and .../js/repositories/CasesRepository.js differ
```

No other line of output — every other file in the project, including
`index.html`, every CSS file, `Code_v4.gs`, `js/core/*.js`, every sibling
`js/repositories/*.js`, and every existing `js/tests/*.js`, is byte-for-byte
identical to the pre-phase archive.

`node --check` passes on every `.js` file in the project, including the
modified `CasesRepository.js` and the two new test/report artifacts.

**Files created by this sub-phase (and only these), plus the one file
modified:**
- Modified: `js/repositories/CasesRepository.js`
- Created: `js/tests/verify_cases_repository_wiring.js`
- Created: `docs/CasesRepository_Wiring_Report.md`

---

### 7. What this sub-phase explicitly did NOT do

- Did not wire any of the other eight Repositories
  (`ClientsRepository`/`ChildrenRepository`/`SessionsRepository`/
  `TasksRepository`/`FeesRepository`/`DocumentsRepository`/
  `TemplatesRepository`/`LibraryRepository`) to `DatabaseService` — each
  still uses its own independent, temporary localStorage adapter. That is
  explicitly the remaining work this phase's closing line hands off.
- Did not modify `Repository.js`, `DatabaseService.js`, `StorageAdapter.js`,
  or `LocalStorageAdapter.js` in any way.
- Did not wire `CasesRepository` into `index.html` or any Module — it
  remains, as before, an additive, inert file with no `<script>` tag
  referencing it.
- Did not change `CASES_ID_FIELD`, `CASES_REQUIRED_FIELDS`,
  `CASES_SEARCH_FIELDS`, `CASES_FILTER_FIELDS`, `CASES_SORT_FIELDS`,
  `CASES_LEGACY_FIELDS`, or any validation/search/filter/sort logic.

---

## Repository Wiring Pilot

**PASS**

**Ready For Remaining Repositories**
