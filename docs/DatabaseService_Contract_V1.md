# DatabaseService_Contract_V1.md
## PHASE 8 — SUB-PHASE 8.2.1 — DatabaseService Contract Definition (نظام الحسام للمحاماة)

**Date:** 2026-07-05
**Status:** CONTRACT ONLY — no implementation.
**Action taken:** This document only. No file under `js/`, `index.html`, `Code_v4.gs`, or
`css/` was created, modified, renamed, or deleted. No Repository was wired. No
`localStorage` code was written or replaced.

**Input read in full for this contract:**
- `docs/DatabaseService_Audit_Report_Part1.md` (Sub-Phase 8.1.1)
- `docs/DatabaseService_Audit_Report_Part2.md` (Sub-Phase 8.1.2)
- `docs/DatabaseService_Design_Report_PHASE3_V10.md` (§§1–26)
- `docs/Repository_Contract_Report_PHASE2_V10.md` (§§1–20)
- `js/core/Repository.js` (1274 lines, read in full)
- All 9 concrete Repositories under `js/repositories/*.js` (read for their storage-adapter
  usage pattern; confirmed identical shape across all 9 — see §0 below)

---

## 0. Grounding Fact — What Repository Actually Calls Today

Direct inspection of `js/core/Repository.js` shows the base class touches its injected
Storage Adapter in **exactly two places**, and nowhere else:

| Call site | Line | Adapter method used | Shape |
|---|---|---|---|
| `Repository.prototype.open` | 292 | `this._storage.read(this.entityKey)` | `(entityKey: string) → Array<Object> \| Promise<Array<Object>>` |
| `Repository.prototype._persist` | 577 | `this._storage.write(this.entityKey, this._records)` | `(entityKey: string, records: Array<Object>) → void \| Promise<void>` |

Every other Repository operation (`create`, `update`, `delete`, `get`, `getAll`, `find`,
`exists`, `count`, `bulkInsert`, `bulkUpdate`, `bulkDelete`, `search`, `export`, `import`,
`clear`, `transaction`) is implemented **entirely in-memory** against `this._records`
(Validation Hooks, Filter Hooks, Search Hooks, Sort Hooks, Metadata Hooks, the Error
Model, and the in-memory-staged `transaction()` engine all live in the base class and
never touch the adapter directly) — the array is read once via `open()`, mutated
in-memory, and the **entire array** is written back via `_persist()` after every mutating
call.

**This is the load-bearing fact for this Contract.** Whatever public API
`DatabaseService` exposes, the minimum shape a Repository actually requires from it is:
a whole-store read and a whole-store write, keyed by `entityKey`. Everything else this
Contract adds (per-record operations, transactions, cache, versioning, locking, events,
migration) is the richer, IndexedDB-vocabulary surface required by
`DatabaseService_Design_Report_PHASE3_V10.md §3/§6/§26` for the future storage-engine
swap — but it must be designed so that a **thin Storage Adapter shim** (§9 below) can
satisfy Repository's two-method duck-typed contract using nothing but this Contract's
public methods. No Repository file requires any change, and no Repository requires
direct `localStorage` access, under this design (verified in §11).

---

## 1. Design Constraints Carried Forward (non-negotiable, from Design Report §3/§26)

- `DatabaseService` is the **only** layer permitted to touch the storage engine directly
  (`localStorage` today; IndexedDB/SQLite later). No Repository, Module, or UI code may
  bypass it.
- `DatabaseService` knows nothing about `fetch`, `ApiService`, `SyncService`, or the DOM.
  It stores/retrieves `SyncQueue` entries as plain data — it never sends them.
- `DatabaseService` enforces **structural integrity only** (parseable JSON, valid primary
  key present). It enforces **no business rules** (required fields, uniqueness,
  duplicate `رقم_القضية`, `sanitizeTime()`) — those remain a Repository concern
  (`_validate()` hooks already implemented per-entity).
- Every write passes through a Transaction — there is no "bare" write path, even for a
  single-record `create()`.
- Swapping the underlying engine (`localStorage` → IndexedDB → SQLite) must never
  require editing a single line of any Repository or this Contract's public surface —
  only `DatabaseService`'s internal implementation changes.
- Store Registry (from Design Report §7), fixed for this Contract's `storeName`
  parameter: `cases`, `clients`, `children`, `sessions`, `fees`, `tasks`, `documents`,
  `library`, `templates` (9 entity stores, 1:1 with existing `data.*`/`localStorage`
  keys) + `settings` (singleton) + `metadata`, `syncQueue`, `backups`, `logs`
  (structural, additive, no `data.*` counterpart today).

---

## 2. Shared Types (used throughout this Contract)

```
DBError:
  {
    type:        'DatabaseError'|'TransactionError'|'MigrationError'|'CorruptionError'
                 |'QuotaError'|'StorageError'|'ValidationError'|'LockError'|'NotFoundError',
    message:     string,
    store:       string | null,   // which Store this error concerns, if any
    key:         string | null,   // which record key this error concerns, if any
    recoverable: boolean          // true only for LockError (retry-after-queue) by default
  }

WriteResult:
  { success: boolean, record: Object | null, error: DBError | null }

BulkResult:
  { success: boolean, results: Array<WriteResult>, error: DBError | null }

QueryResult:
  { items: Array<Object>, total: number, hasMore: boolean }

TransactionHandle:
  { id: string, store: string | Array<string>, mode: 'read'|'write', state: 'active'|'committed'|'rolledback' }

Statistics:
  { store: string, recordCount: number, sizeBytesApprox: number, lastWriteAt: string | null }
```

All `DBError` objects are returned, never bare-thrown, matching the same discipline
`Repository.js`'s `createRepositoryError()` already establishes (Repository Contract §10).
The one exception is `assertStorageAdapter`-style construction-time guards, which may
throw synchronously, exactly as `Repository`'s own constructor does today.

---

## 3. Lifecycle

### `open(): Promise<void>`
Opens the database connection. Runs, in order: Version Check (§6) → Upgrade (§7, if
schema is behind) → Integrity Check (§8) → transition to `Ready`. Idempotent — calling
`open()` while already `Ready`/`Busy` is a no-op (mirrors `Repository.prototype.open`'s
own idempotency at line 289).
- **Args:** none.
- **Returns:** resolves with no value once state is `Ready`.
- **Async:** always async, even against `localStorage` today (Design Report §4:
  synchronous today, must remain `await`-compatible for the future IndexedDB swap without
  any caller change).
- **Throws:** never throws synchronously; rejects with `DatabaseError` (fatal open
  failure) or `CorruptionError` (if Recovery, §8, also fails) via the Promise.
- **State transition:** `Closed → Opening → (Upgrade?) → Opened → Ready`.

### `close(): Promise<void>`
Begins the Shutdown Flow (Design Report §21): commits/rejects any in-flight transaction,
releases all logical write locks, transitions to `Closed`. Safe no-op today beyond the
state transition (no explicit teardown needed for `localStorage`; reserved for future
IndexedDB connection teardown per Design Report §4's `Closing` state).
- **Args:** none. **Returns:** resolves once `Closed`. **Async:** yes.
- **Throws:** never — always resolves; any in-flight transaction that cannot commit
  cleanly is rolled back rather than surfaced as a rejection (shutdown must not hang).

### `destroy(): Promise<void>`
Terminal teardown — equivalent to `Repository.prototype.dispose()`'s effect but at the
whole-database level: calls `close()` internally, then clears all in-memory Cache state
and transitions to `Disposed`. Does **not** delete underlying storage data (that is
`clear(storeName)`'s job, per-store, called explicitly) — `destroy()` only tears down the
`DatabaseService` instance's own runtime state (Cache, locks, listeners). Reserved for
tab-close / instance-replacement scenarios (Design Report §4's `Disposed` state).
- **Args:** none. **Returns:** resolves once `Disposed`. **Async:** yes.
- **Compatibility rule:** once `Disposed`, every other method on this Contract must
  reject with a `DatabaseError` ("DatabaseService has been destroyed") rather than
  silently no-op — mirrors `Repository._guardReady()`'s existing discipline of refusing
  operations outside the `ready`/`busy` states.

---

## 4. Storage (single-record primitives)

These five methods are the per-record primitives every Repository CRUD method
ultimately compiles down to (see §11 mapping table). None of them may be called before
`open()` has resolved — each begins with the same `_guardReady()`-equivalent check
`Repository.js` already performs at its own layer (line 347), duplicated here at the
`DatabaseService` layer per Design Report §16 ("Structural Integrity" enforcement point).

### `read(storeName, key): Promise<Object | null>`
Reads one record by primary key from one Store.
- **Args:** `storeName: string` (one of §1's Store Registry), `key: string` (the Store's
  Primary Key value — `رقم_القضية` for Cases, generated `id`/hybrid id for the other 8).
- **Returns:** the record (plain object, deep-clonable — same "never a live reference"
  guarantee `Repository.js`'s `cloneRecord()` already gives callers, Repository Contract
  §19) or `null` if no record with that key exists in that Store.
- **Async:** always. **Runs inside:** an implicit Read Transaction if no
  `TransactionHandle` is passed (an optional 3rd arg `txHandle?` lets a caller run it
  inside an explicit transaction — see §5).
- **Throws:** never synchronously; rejects with `StorageError` on an underlying
  read failure (e.g. corrupt JSON for that Store — see `CorruptionError` in §8),
  `DatabaseError` if called before `open()`.

### `write(storeName, key, record): Promise<WriteResult>`
Writes (creates or overwrites) exactly one record by primary key in one Store, as one
atomic Write Transaction (Transaction Model §10 of the Design Report:
"every write passes through a Transaction, even a simple single write").
- **Args:** `storeName: string`, `key: string`, `record: Object` (must already carry its
  own primary-key field set to `key` — `DatabaseService` does not decide id generation;
  that remains the Repository's `_resolveId()`/`idGenerator` concern, Repository Contract
  §3).
- **Returns:** `WriteResult`. `record` echoes back the persisted value (post-Structural-
  Integrity-check, never post-business-validation — that already happened one layer up
  in the Repository before this call was made).
- **Async:** always.
- **Throws:** never synchronously; on failure resolves `{success:false, record:null,
  error: DBError}` where `error.type` is one of `StorageError` (generic write failure),
  `QuotaError` (storage full, Design Report §13/§22), or `ValidationError` (record fails
  Structural Integrity — not parseable / missing primary key value — Design Report §16;
  **not** a business-rule failure, those never reach this layer).
- **Events:** fires `beforeWrite` before the physical write, `afterWrite` after a
  successful commit (§8 of this Contract — Events).

### `delete(storeName, key): Promise<WriteResult>`
Removes exactly one record by primary key, as one atomic Write Transaction.
- **Args:** `storeName: string`, `key: string`.
- **Returns:** `WriteResult` (`record` is the deleted record's last known value, for
  caller convenience/undo — mirrors `Repository.transaction()`'s existing pattern of
  echoing back `working[dIdx]` before splice, line 1212).
- **Important scope note:** this is a **hard, physical** delete at the storage-engine
  level. Soft-delete (setting `deletedAt` instead of removing the row) is a
  **Repository-layer** decision (`softDelete` config, `Repository.js` line 260) —
  `DatabaseService.delete()` is what a Repository's soft-delete path calls internally via
  `write()` (setting `deletedAt` and writing the record back, never calling
  `DatabaseService.delete()` at all), while a Repository's **hard**-delete path (or
  `clearAllData()`/`clear()`, §4 below) is what actually reaches this method. This
  mirrors `Repository.js`'s own `delete()` implementation (which for `softDelete:true`
  entities never removes a record from `this._records`, only mutates it) exactly one
  layer down.
- **Async:** always.
- **Throws:** never synchronously; rejects/resolves-false with `NotFoundError` if `key`
  does not exist in `storeName` (recoverable: false), or `StorageError` for a generic
  failure.
- **Events:** fires `beforeDelete` / `afterDelete`.

### `clear(storeName): Promise<WriteResult>`
Empties one Store entirely — the per-Store primitive `clearAllData()` (`settings.js:100`)
must call once per Store (Wiring Matrix, Audit Part 2 §11), and what a Repository's own
`clear()` (already implemented, Repository Contract §3) compiles down to.
- **Args:** `storeName: string`.
- **Returns:** `WriteResult` with `record: null`.
- **Async:** always. Runs as one Batch Transaction (Design Report §10) — never a loop of
  individual `delete()` calls, to keep the operation atomic and to avoid firing
  `beforeDelete`/`afterDelete` once per record for what is logically one event.
- **Throws:** never synchronously; rejects/resolves-false with `StorageError`.

### `exists(storeName, key): Promise<boolean>`
Existence check without materializing the full record.
- **Args:** `storeName: string`, `key: string`.
- **Returns:** `true`/`false`. Never `null`/`undefined`.
- **Async:** always (even though a `localStorage`-backed implementation could answer
  synchronously — the Contract signature must stay Promise-based project-wide so a
  future IndexedDB swap needs zero caller changes, Design Report §26's hard rule).
- **Throws:** never; a read failure resolves `false` rather than rejecting (existence
  checks are advisory, not authoritative — the authoritative failure surfaces on the
  subsequent `read()`/`write()` a caller performs).

---

## 5. Transactions

### `beginTransaction(storeName, mode): Promise<TransactionHandle>`
Opens an explicit transaction scope. `storeName` may be a single string (single-Store
Write/Batch Transaction) or an `Array<string>` (Atomic Transaction spanning multiple
Stores — Design Report §10's "Atomic Transaction", e.g. a future cascading case-delete
touching Sessions/Documents/Tasks/Fees/Children + SyncQueue in one unit).
- **Args:** `storeName: string | Array<string>`, `mode: 'read' | 'write'`.
- **Returns:** a `TransactionHandle` (`state: 'active'`).
- **Async:** always.
- **Throws:** never synchronously; rejects with `LockError` (`recoverable: true`) if a
  `'write'` mode transaction is requested against a Store that already holds an active
  write lock (§10 Locking Model below) — the caller may retry; `DatabaseService` does not
  auto-queue at this method (auto-queueing happens inside `transaction()`, the
  convenience wrapper below, not this lower-level primitive).
- **Concurrency:** `'read'` mode transactions never conflict with each other or block
  anything (Cache-backed reads, Design Report §11/§12). `'write'` mode holds an
  exclusive logical lock scoped to exactly the Store(s) named — writes to a disjoint
  Store proceed concurrently and are never blocked (Design Report §12: "Concurrent
  Access... محصور بمستوى الـ Store الواحد").

### `commit(txHandle): Promise<void>`
Finalizes every read/write staged under `txHandle` as one indivisible unit: physical
storage write + Cache update happen together (Design Report §10 "Commit"). Transitions
`txHandle.state` to `'committed'`.
- **Args:** `txHandle: TransactionHandle`.
- **Returns:** resolves once persisted.
- **Async:** always.
- **Throws:** never synchronously; rejects with `TransactionError` (generic mid-commit
  failure, not a Validation failure — Structural Integrity was already checked per-op
  before staging, Design Report §16) or `QuotaError`. On rejection, `DatabaseService`
  guarantees the underlying storage was **not** partially written (all-or-nothing,
  Design Report §16: "يمنع حالة نصف الدفعة مكتوبة").

### `rollback(txHandle): Promise<void>`
Discards every staged op under `txHandle` without touching physical storage at all.
Transitions `txHandle.state` to `'rolledback'`.
- **Args:** `txHandle: TransactionHandle`.
- **Returns:** resolves once discarded (always succeeds — rollback of an in-memory
  staging area cannot itself fail in a way callers need to handle, mirroring
  `Repository.transaction()`'s own `_onRollback` hook, which is a void notification, not
  a fallible operation).
- **Async:** yes (kept Promise-shaped for engine-swap consistency even though it is
  effectively synchronous against `localStorage` today).
- **Throws:** never.

### `transaction(ops): Promise<{success: boolean, results: Array<WriteResult>, error: DBError | null}>`
The convenience, all-in-one wrapper: internally calls `beginTransaction` → stages every
op in `ops` → `commit()` on full success or `rollback()` on any single op's failure —
**never writes an intermediate state**, exactly matching `Repository.prototype.transaction`'s
existing all-staged-then-commit-once discipline (`Repository.js` lines 1132–1250), one
layer further down (physical storage instead of in-memory array).
- **Args:** `ops: Array<{op:'write', store:string, key:string, record:Object} |
  {op:'delete', store:string, key:string}>` — deliberately store-qualified per-op (unlike
  `Repository.transaction()`'s single-entity `ops[]`, this Contract's version may span
  multiple Stores in one call, to support the future Atomic cross-entity transaction the
  Design Report §10/§19 calls for; a single-Store caller simply repeats the same `store`
  value on every op).
- **Returns:** `{success, results: Array<WriteResult>, error}` — same shape family as
  `Repository`'s own `TransactionResult` (Repository Contract §3), one level down.
- **Async:** always.
- **Throws:** never synchronously; `success:false` with populated `error` on any staged
  op's Structural-Integrity failure or on a commit-time `QuotaError`/`TransactionError`.
- **Locking:** internally calls `beginTransaction` for every distinct `store` named
  across `ops`, in a stable (alphabetical) order, to avoid a lock-ordering deadlock if
  two concurrent `transaction()` calls touch the same two Stores in different orders.

---

## 6. Bulk Operations

These operate on an entire array of records for one Store in a single Batch Transaction
(Design Report §10) — the exact primitive `Repository.prototype._persist()` needs (§0
above: `write(entityKey, records)` writes the **whole array**), and what
`bulkInsert`/`bulkUpdate`/`bulkDelete`/`import`/`export`/`clear` at the Repository layer
ultimately compile down to.

### `bulkRead(storeName): Promise<Array<Object>>`
Reads every record currently in one Store, as one Read Transaction.
- **Args:** `storeName: string`.
- **Returns:** `Array<Object>` — never `null`; an empty/never-yet-written Store resolves
  `[]` (mirrors `Repository.prototype.open`'s own `Array.isArray(loaded) ? loaded : []`
  guard, line 293 — that exact guard becomes unnecessary at the Repository layer once
  `DatabaseService.bulkRead` guarantees an array is always returned).
- **Async:** always.
- **Throws:** never synchronously; on a `CorruptionError` for that specific Store (§8),
  resolves `[]` after Auto Recovery runs (Design Report §14) rather than rejecting — a
  single corrupt Store must not prevent the rest of the app from opening (Design Report
  §14: "Store تالف واحد لا يمنع فتح باقي الـ Stores السليمة").

### `bulkWrite(storeName, records): Promise<BulkResult>`
Writes/overwrites an entire Store's contents as one Batch Transaction — **this is the
exact method the Storage Adapter shim (§9) uses to satisfy `Repository._persist()`'s
`write(entityKey, this._records)` call.**
- **Args:** `storeName: string`, `records: Array<Object>` — the full replacement array
  (whole-array replace semantics, matching `loadFromSheets()`'s existing
  `data[k]=arr; localStorage.setItem(k, JSON.stringify(arr))` behavior, Audit Part 2 §1
  Variation E, and `Repository._persist()`'s own whole-array write).
- **Returns:** `BulkResult` — `results` is one `WriteResult` per record in `records`
  (all succeed or all fail together, since this is one Batch Transaction — Design Report
  §16: validated in full before any physical write begins).
- **Async:** always.
- **Throws:** never synchronously; `success:false` + populated top-level `error` (one
  `QuotaError`/`StorageError`) if the batch as a whole cannot be committed — no partial
  write ever reaches physical storage.

### `bulkDelete(storeName, keys): Promise<BulkResult>`
Deletes multiple records by key from one Store as one Batch Transaction.
- **Args:** `storeName: string`, `keys: Array<string>`.
- **Returns:** `BulkResult`.
- **Async:** always.
- **Throws:** never synchronously; a `key` not found in the Store yields that entry's
  `WriteResult.success = false` with a `NotFoundError`, but does **not** abort the rest
  of the batch (per-key `NotFoundError` is treated as a data-state fact, not a batch-
  fatal error — unlike a Structural-Integrity failure in `bulkWrite`, which is batch-
  fatal because it indicates a caller bug, not a data-state fact).

---

## 7. Metadata

Backed by the additive `metadata` Store (Design Report §7) — a Store of single-key
records, no counterpart in today's `data.*`/`localStorage` shape.

### `getVersion(): Promise<{schemaVersion: number, migrationVersion: number}>`
Reads the two version numbers defined in Design Report §5 (`Database Version` itself is
not exposed by this Contract at all — it is an internal `localStorage`-vs-future-
IndexedDB implementation detail per Design Report §5's own table, not something any
Repository or Module needs to know).
- **Args:** none. **Returns:** current versions (defaults `{schemaVersion: 0,
  migrationVersion: 0}` before this Contract's first real implementation ever runs,
  matching Design Report §5's stated starting point: "الحالة الحالية: 9 مصفوفات JSON...
  بلا أي Store رسمي بعد").
- **Async:** always. **Throws:** never; a missing/corrupt `metadata` record resolves the
  same `{0,0}` default rather than rejecting (Auto Recovery applies to `metadata` exactly
  like any other Store, §8).

### `setVersion(schemaVersion, migrationVersion): Promise<void>`
Writes new version numbers into the `metadata` Store. Called only by the Migration
methods (§8 below) — never called directly by a Repository or Module (Compatibility
Rule, §1).
- **Args:** `schemaVersion: number`, `migrationVersion: number` (both must be
  `>=` the currently stored values — Compatibility Rules, Design Report §5: never allow a
  silent downgrade of the recorded version through this method; use `downgrade()`, §8,
  for the one narrow case that is actually permitted).
- **Returns:** resolves once persisted. **Async:** always.
- **Throws:** never synchronously; rejects with `ValidationError` if either argument is
  less than the currently stored value (guards against exactly the "app opened after a
  newer schema was already written" scenario Design Report §5's Compatibility Rules
  describe, one layer down from where the *rejection* of that scenario happens — see
  `open()`/`migrate()`).

### `checksum(storeName): Promise<string>`
A cheap, non-cryptographic content fingerprint over an entire Store — the
`DatabaseService`-level analog of `Repository._computeChecksum()` (already implemented
per-record, `Repository.js` line 394), computed here over the whole Store for Integrity
Check use (Design Report §14, §22).
- **Args:** `storeName: string`. **Returns:** a short string fingerprint.
- **Async:** always. **Throws:** never; a Store that fails to parse resolves a sentinel
  value (e.g. `'corrupt'`) rather than rejecting, since `checksum()` is itself one of the
  Integrity Check's own diagnostic tools (§8) — it must not itself throw on the exact
  condition it exists to detect.

### `statistics(storeName?): Promise<Statistics | Array<Statistics>>`
Diagnostic counts — record count, approximate size, last-write timestamp — either for
one named Store or, if `storeName` is omitted, for every Store at once (used by a future
diagnostics panel; Design Report never wires this to any current UI, purely additive).
- **Args:** `storeName?: string` (optional).
- **Returns:** one `Statistics` object, or `Array<Statistics>` (all Stores) if omitted.
- **Async:** always. **Throws:** never; per-Store failures surface as a `Statistics`
  entry with `recordCount: 0` rather than aborting the whole call when `storeName` is
  omitted (one bad Store must not blank out the diagnostics for every other Store).

---

## 8. Cache

Backed by the Memory Cache model already described (Design Report §11): every Store
kept fully in memory after first successful `open()`/`bulkRead()`, invalidated only on
Commit or full `bulkWrite()`/`import()` (Design Report §11's two precise invalidation
moments). These three methods are **operational controls over that already-on-by-
default cache**, not a way to opt into caching in the first place.

### `enableCache(storeName?): void`
Re-enables the Memory Cache for one Store (or all Stores if omitted) after a prior
`disableCache()` call. Enabled by default for every Store immediately after `open()` —
this method only matters after an explicit `disableCache()`.
- **Args:** `storeName?: string`. **Returns:** `void`. **Async:** **synchronous** — this
  is a pure in-memory flag flip, no storage I/O occurs (unlike every method in §4–§7,
  which all remain Promise-based for engine-swap consistency; a flag flip has no such
  future-engine dependency, so this Contract does not force it to be async).
- **Throws:** never.

### `disableCache(storeName?): void`
Forces every subsequent `read()`/`bulkRead()` against the named Store (or all Stores) to
bypass Cache and hit the Storage Engine directly. Reserved for diagnostics/debugging
(e.g. confirming a suspected stale-cache bug) — no current caller in the project needs
this in normal operation (Design Report §11 describes Cache as always-on for Hot Data
with no scenario calling for disabling it in production use).
- **Args:** `storeName?: string`. **Returns:** `void`. **Async:** synchronous.
- **Throws:** never.

### `clearCache(storeName?): void`
Forces an immediate in-memory Cache invalidation for one Store (or all Stores),
independent of the two automatic invalidation moments (§11 of the Design Report) — the
next `read()`/`bulkRead()` after this call re-reads from the Storage Engine.
- **Args:** `storeName?: string`. **Returns:** `void`. **Async:** synchronous.
- **Throws:** never. **Note:** this does **not** touch physical storage at all — it only
  discards the in-memory copy. Never use this as a substitute for `clear(storeName)`
  (§4), which is a destructive storage operation; `clearCache()` is purely a memory
  operation with zero data-loss risk.

---

## 9. Migration

Backed by the Versioning Model (Design Report §5) and driven entirely by `metadata`
(§7). None of these are called by any Repository directly — they run once, internally,
during `open()`'s Version Check/Upgrade step (§3).

### `migrate(targetSchemaVersion): Promise<{success: boolean, appliedSteps: number, error: DBError | null}>`
Runs the full cumulative migration sequence from the currently stored `schemaVersion`
up to `targetSchemaVersion`, one integer step at a time — never a direct jump (Design
Report §5's Compatibility Rules: "لا يوجد قفز مباشر... لا بد المرور بكل خطوة وسيطة").
Internally calls `upgrade()` once per intermediate version.
- **Args:** `targetSchemaVersion: number`.
- **Returns:** `{success, appliedSteps, error}`.
- **Async:** always.
- **Throws:** never synchronously; on any intermediate step's failure, rejects/resolves
  `success:false` with a `MigrationError`, and — per the Rollback Rules (Design Report
  §5) — the stored `migrationVersion` is guaranteed to reflect the value **before this
  specific failed step began**, never a partially-applied value.

### `upgrade(fromVersion, toVersion): Promise<void>`
Applies exactly one migration step (`fromVersion → toVersion`, always `toVersion =
fromVersion + 1`). Every upgrade step is Additive-first (Design Report §5's Strangler
principle, mirroring Repository Contract §16): old-shape data is never deleted by an
upgrade step, only new-shape data is added alongside it, until the new shape has proven
stable.
- **Args:** `fromVersion: number`, `toVersion: number` (must be exactly 1 apart —
  enforced synchronously as a caller-contract violation, distinct from a runtime
  `MigrationError`, since calling this with a non-adjacent pair is a programming error in
  `migrate()`'s own driving loop, not a data condition).
- **Returns:** resolves once this one step's Write Transaction (Design Report §5/§9: an
  upgrade step is itself one Atomic Transaction) commits.
- **Async:** always.
- **Throws:** rejects with `MigrationError` on failure; per the Rollback Rules, a failed
  `upgrade()` leaves `migrationVersion` unchanged from its pre-call value (this method
  never partially advances the stored version).

### `downgrade(fromVersion, toVersion): Promise<void>`
The **only** sanctioned "rollback to an older Schema Version" path, and — per the
Design Report §5's Rollback Rules — it is legal **only while an `upgrade()` step is still
in-flight and not yet confirmed successful**; it is explicitly **not** a general
"undo a completed migration" tool ("لا 'Rollback' حقيقي... بعد نجاح الترقية والاستخدام
الفعلي للبيانات الجديدة" — Design Report §5). In practice, `downgrade()` is what
`migrate()`/`upgrade()` call internally on their own failure path (§9's `upgrade()`
rejection above) — it is exposed on this Contract mainly so a future in-flight-Migration
Recovery routine (Design Report §14's Repair Flow, extended to mid-migration crash
scenarios) has an explicit, named primitive to call, rather than a bespoke internal-only
function.
- **Args:** `fromVersion: number`, `toVersion: number` (`toVersion < fromVersion`).
- **Returns:** resolves once reverted. **Async:** always.
- **Throws:** rejects with `MigrationError` if called with `fromVersion`/`toVersion` that
  do not correspond to an in-flight, uncommitted upgrade step (guards against the
  Design Report's explicit "not a real rollback after success" rule being violated by a
  caller).

---

## 10. Locking Model (governs §5's Transactions — not a separate public method set)

Per Design Report §12, restated here as a binding compatibility rule for any concrete
implementation of §5:

- **Read locks:** none — concurrent reads never block one another or any write.
- **Write locks:** scoped to exactly the Store(s) named in `beginTransaction`/
  `transaction()`; exclusive per-Store, never a whole-database lock.
- **Concurrent, disjoint-Store writes:** always allowed in parallel — a write to `tasks`
  never waits on a write to `cases`.
- **Conflict Resolution policy:** Local-Wins, explicit (Design Report §12, restating
  Repository Contract §8) — `DatabaseService` itself never attempts multi-tab/multi-
  device conflict detection; that remains out of scope until a documented future
  Multi-user Support phase.
- A `beginTransaction('write')` call against an already-locked Store rejects with
  `LockError` (`recoverable:true`); `transaction()`'s convenience wrapper (§5) may retry
  internally with a short queue, but `beginTransaction()` itself never auto-queues — it
  is a caller decision whether to retry.

---

## 11. Error Model

| Type | Raised by | Real trigger | `recoverable` default |
|---|---|---|---|
| `DatabaseError` | `open()`, any method called before `open()`/after `destroy()` | Connection-level failure (rare with `localStorage`; more likely with future IndexedDB in restrictive private-browsing modes, Design Report §22) | `false` |
| `TransactionError` | `commit()`, `transaction()` | Mid-commit failure not caused by Structural-Integrity rejection | `false` |
| `MigrationError` | `migrate()`, `upgrade()`, `downgrade()` | A migration step fails mid-way | `false` |
| `CorruptionError` | `open()`, `bulkRead()`, any `read()` | `JSON.parse` failure on a Store's stored content | `false` unless Recovery (§8) succeeds |
| `QuotaError` | `write()`, `bulkWrite()`, `commit()` | `localStorage` capacity exceeded (Design Report §22: realistic risk given Cases' 35 fields and multi-year Sessions/Documents growth) | `false` |
| `StorageError` | any write/read primitive | Generic engine-level failure not covered by a more specific type above | `false` |
| `ValidationError` | `write()`, `bulkWrite()`, `setVersion()` | **Structural** integrity only (unparseable record, missing/invalid primary-key value, invalid version ordering) — **never** a business rule; those stay a Repository concern one layer up | `false` |
| `LockError` | `beginTransaction()` | Requested Store already holds an active write lock | `true` |
| `NotFoundError` | `delete()`, `bulkDelete()` (per-key) | Key does not exist in the named Store | `false` |

Every error returned by this Contract uses the exact same structured shape
`Repository.js`'s own `createRepositoryError()` already establishes (Repository Contract
§10), extended with a `store`/`key` field in place of Repository's `field`/`entity`
(§2's `DBError` shape) — never a bare `throw`, consistent top-to-bottom across both
layers.

---

## 12. Events

Four lifecycle hooks, fired synchronously (listeners run to completion before the
triggering call's Promise resolves — no fire-and-forget dispatch, so a listener that
itself needs to block a write, e.g. a future audit-logger, can do so deterministically).

### `beforeWrite: (storeName, key, record) => void | Promise<void>`
Fires immediately before a `write()`/`bulkWrite()`/`commit()`'s physical write. A
listener may throw/reject to **veto** the write — the write is then aborted and the
triggering call resolves `{success:false, error: DBError}` with the listener's thrown
value wrapped as a `ValidationError` (reserved for a future audit/policy layer; no
current Repository or Module registers a listener here — purely additive per this
Contract).

### `afterWrite: (storeName, key, record) => void | Promise<void>`
Fires immediately after a successful `write()`/`bulkWrite()`/`commit()` — this is the
integration point `SyncQueue` enqueueing (Design Report §17/§19: "بعد نجاح الكتابة
محلياً: تسجيل عملية معلَّقة في SyncQueue Store") is expected to eventually hang off of,
though that wiring itself is a Repository-layer/future-`SyncService` decision, not
something `DatabaseService` does on its own initiative (Design Report §3: out of scope
— "قرار متى تُزامَن... يتبع Repository").

### `beforeDelete: (storeName, key) => void | Promise<void>`
Fires immediately before `delete()`/`bulkDelete()`'s physical removal. Same veto
semantics as `beforeWrite`.

### `afterDelete: (storeName, key, deletedRecord) => void | Promise<void>`
Fires immediately after a successful delete.

**Registration:** a single method, `on(eventName, listener): () => void` (returns an
unsubscribe function), is part of this Contract's public surface for all four event
names above. `off(eventName, listener)` is the explicit counterpart. No Repository
registers a listener today — this section exists so `SyncService`/`BackupManager`
(both explicitly future, per Design Report §17) have a documented, stable hook to attach
to later without requiring any change to `DatabaseService`'s own core methods.

---

## 13. Recovery & Integrity (operational contract for `open()`/`bulkRead()`, not new public methods)

Restated from Design Report §14 as binding behavior every implementation of this
Contract must honor:

1. **Integrity Check** runs during every `open()` — lightweight, per-Store: confirm each
   Store's stored content is parseable and its recorded `schemaVersion` is known/
   supported.
2. **Auto Recovery**: a Store that fails Integrity Check is initialized empty (`[]`)
   rather than aborting the whole `open()` — one corrupt Store never blocks the other
   Stores from opening (§0's grounding fact extended: this is exactly the same fallback
   `JSON.parse(localStorage.getItem(k)||'[]')` already provides today, formalized).
3. **Backup Recovery**: only attempted if Auto Recovery itself is impossible (a
   pathological case) — restores that one Store's last known-good snapshot from the
   `backups` Store before falling back to Auto Recovery's empty-array default.
4. **Repair Flow order**: Integrity Check fails → Auto Recovery → (if that fails) Backup
   Recovery → (if that fails) log a fatal `CorruptionError` to the `logs` Store and
   surface it to the caller of `open()` — never a silent freeze.

---

## 14. Storage Adapter Shim — Satisfying Repository's Existing Duck-Type

Per §0's grounding fact, `Repository.js` requires an injected object shaped exactly
`{read(entityKey): Promise<Array>, write(entityKey, records): Promise<void>}`. Under
this Contract, that shim is trivial and requires **zero** changes to any Repository file:

```
shimAdapter = {
  read:  (entityKey) => databaseService.bulkRead(entityKey),
  write: (entityKey, records) => databaseService.bulkWrite(entityKey, records)
          .then(result => { if (!result.success) throw result.error; })
}
```

This is the entire integration surface between the (already fully implemented, unwired)
Repository layer and this Contract — confirmed sufficient because §0 already
established that `read`/`write` are the *only* two adapter methods any Repository ever
calls.

---

## 15. Verification — Every Repository Method Covered By This Contract Alone

| Repository Contract-literal method (Repository Contract §3) | Implemented today via (in-memory, `Repository.js`) | Compiles down to, under this Contract |
|---|---|---|
| `open()` | reads `this._storage.read(entityKey)` once | `bulkRead(storeName)` via §14 shim |
| `create(entity)` | validates, mutates `this._records`, then `_persist()` | `bulkWrite(storeName, fullArray)` via §14 shim (whole-array replace after in-memory push) |
| `update(id, patch)` | mutates in place, then `_persist()` | same — `bulkWrite(storeName, fullArray)` |
| `delete(id)` (soft) | mutates `deletedAt` in place, then `_persist()` | same — `bulkWrite(storeName, fullArray)` (never calls `DatabaseService.delete()` — see §4's scope note) |
| `delete(id)` (hard, `softDelete:false`) | splices, then `_persist()` | same — `bulkWrite(storeName, fullArray)`; a future direct-wiring optimization could instead call `DatabaseService.delete(storeName, id)` per-record, but is not required for correctness |
| `get(id)` / `getAll()` / `find()` / `exists()` / `count()` | pure in-memory reads over `this._records` (loaded once at `open()`) | no further `DatabaseService` calls needed per-op — already satisfied by the one `bulkRead()` at `open()` time |
| `bulkInsert()` / `bulkUpdate()` / `bulkDelete()` | in-memory array ops, then one `_persist()` | `bulkWrite(storeName, fullArray)` |
| `search()` / `sort()` / `filter()` | pure in-memory hooks (`_matchesSearch`/`_matchesFilter`/`_compareRecords`) | none — no storage call at all |
| `export()` | returns a clone of `this._records` | none — already in memory from `open()`'s `bulkRead()` |
| `import(entities, mode)` | replaces/merges `this._records`, then `_persist()` | `bulkWrite(storeName, fullArray)` |
| `clear()` | empties `this._records`, then `_persist()` | `bulkWrite(storeName, [])`, or equivalently `DatabaseService.clear(storeName)` directly |
| `transaction(ops[])` | stages in-memory, then one `_persist()` on full success | `bulkWrite(storeName, fullArray)` after in-memory staging succeeds — **or**, for a future direct (non-shimmed) wiring, `DatabaseService.transaction(ops)` per §5 maps 1:1 onto the same staged-ops shape |

**Conclusion:** every Contract-literal Repository operation across all 9 concrete
Repositories (§9 of `DatabaseService_Audit_Report_Part1.md`) is satisfiable using only
`bulkRead()` and `bulkWrite()` from this Contract (§6) via the trivial shim in §14 — no
Repository requires `read()`/`write()`/`delete()` per-record primitives, no Repository
requires `beginTransaction`/`commit`/`rollback` directly, and **no Repository requires
any direct `localStorage` access** under this design. The richer per-record,
Transaction, Cache, Versioning, Locking, Migration, and Event surface in §§3–13 exists
to satisfy `DatabaseService_Design_Report_PHASE3_V10.md`'s own architectural
requirements (future IndexedDB/SQLite swap, SyncQueue, Backups, structural integrity,
recovery) — it is additive capability sitting *underneath* the two methods Repository
already, today, exclusively depends on.

---

## 16. Thread Safety & Compatibility Rules (summary)

- Single-tab, single-thread JS execution model (Design Report §12) — "thread safety" here
  means logical write-lock ordering per Store, not true concurrent-execution safety.
  Multi-tab is a documented, explicit out-of-scope limitation (Local-Wins, §10).
- Every public method in §3–§9 is Promise-based (`async`), with the sole, deliberate
  exception of the three Cache control methods in §8 (pure synchronous flag operations
  with no storage I/O) — this asymmetry is intentional and documented, not an oversight.
- No method in this Contract may be called before `open()` resolves, except `open()`
  itself; every method rejects with `DatabaseError` if called against a `Closed` or
  `Disposed` instance.
- Swapping `localStorage` for IndexedDB/SQLite in the future must change only this
  Contract's *internal implementation* — every signature in §§3–13 is written to already
  be compatible with an asynchronous, non-blocking future engine (Design Report §26's
  hard success criterion), so no Repository, Module, or this Contract's own public
  surface needs to change on that future swap.

---

DatabaseService Contract
PASS
Ready For Core Implementation
