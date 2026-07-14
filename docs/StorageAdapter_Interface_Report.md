# StorageAdapter_Interface_Report.md
## PHASE 8 — SUB-PHASE 8.3.1 — Storage Adapter Interface (نظام الحسام للمحاماة)

**Date:** 2026-07-05
**Scope:** Create only `js/core/StorageAdapter.js` (abstraction) and this report.
**Action taken:** One file created (`js/core/StorageAdapter.js`), read-only inspection of
two existing documents. No other project file was created, modified, renamed, or
deleted. No `localStorage` logic, no `DatabaseService`, no Repository file was touched.

---

## 0. Input Reading Order — Status

| # | Document | Status |
|---|---|---|
| 1 | `docs/DatabaseService_Contract_V1.md` | Present (produced Sub-Phase 8.2.1 this session). Read in full — specifically §0 (grounding fact), §1 (design constraints), §4 (Storage), §14 (Storage Adapter shim). |
| 2 | `js/core/Repository.js` | Present (1274 lines). Re-confirmed directly (not assumed from the prior report) which adapter methods are actually called and where. |

No Input Gap — both required documents exist and were read before any code was written.

---

## 1. Grounding Fact Re-Confirmed (direct re-inspection, not carried over unverified)

`grep -n "_storage\." js/core/Repository.js` returns exactly two matches:

| Line | Call |
|---|---|
| 292 | `var loaded = await this._storage.read(this.entityKey);` (inside `open()`) |
| 577 | `await this._storage.write(this.entityKey, this._records);` (inside `_persist()`) |

No other line in `Repository.js` references `this._storage`. This confirms, independent
of `DatabaseService_Contract_V1.md §0`'s own statement of the same fact, that
`read(entityKey)` and `write(entityKey, records)` are the entire adapter surface
Repository.js requires today. The additional five methods this interface defines
(`open`, `close`, `destroy`, `delete`, `clear`, `exists`) are **not** called anywhere in
`Repository.js` — they exist on this interface because the task specification requires
them and because `DatabaseService_Contract_V1.md` §14's Storage Adapter shim design
anticipates a lower, engine-facing abstraction offering lifecycle and whole-entity
delete/clear/exists primitives underneath the DatabaseService layer, even though no
current caller invokes them yet.

Also re-confirmed: `assertStorageAdapter()` (Repository.js lines 132–159) only validates
presence of `read` and `write` as functions at construction time — it does not require
`open`/`close`/`destroy`/`delete`/`clear`/`exists` to exist at all. A concrete
`StorageAdapter` subclass therefore satisfies Repository.js's construction-time guard the
moment it overrides just those two methods (verified in §4 below).

---

## 2. What Was Built

`js/core/StorageAdapter.js` — a single abstract base class, `StorageAdapter`, plus one
supporting error type, `NotImplementedError`. No concrete engine binding of any kind.

### 2.1 Method Surface (exactly the 8 methods specified, no more, no fewer)

| Method | Category | Called by Repository.js today? |
|---|---|---|
| `open()` | Lifecycle | No |
| `close()` | Lifecycle | No |
| `destroy()` | Lifecycle | No |
| `read(entityKey)` | Whole-entity storage | **Yes** — `open()`, line 292 |
| `write(entityKey, records)` | Whole-entity storage | **Yes** — `_persist()`, line 577 |
| `delete(entityKey)` | Whole-entity storage | No |
| `clear()` | Whole-entity storage | No |
| `exists(entityKey)` | Whole-entity storage | No |

Every method carries full JSDoc covering: parameters, return type, exceptions, and async
behavior, per the phase instructions — including, for each method, an explicit note on
what a *concrete* override is expected to do differently from this abstract base (e.g.
"a concrete override is expected to reject its Promise, never throw synchronously, on a
real storage failure").

### 2.2 `NotImplementedError`

A real `Error` subclass (not a plain structured object, unlike `Repository.js`'s own
`RepositoryErrorTypes` model) — deliberately different, because this represents a
programming error (a concrete subclass forgot to override a required method), not a
runtime/data condition a caller branches on. Carries `methodName` and `className` fields
so a partially-overridden subclass produces a message naming both the missing method and
the actual subclass constructor it was called on (e.g.
`"TestAdapter.open() is not implemented..."`), not just the abstract base's own name.

**Bug found and fixed during this phase's own verification (§3 below):** the first draft
built `NotImplementedError` via `Error.call(this, message)`, which — per the JS spec, and
confirmed empirically in Node during this phase's own testing — returns a **new,
detached** `Error` object rather than initializing `this`, silently breaking
`instanceof NotImplementedError` for any `new NotImplementedError(...)` call. This was
caught by this phase's own verification step (§3), not assumed away, and fixed by
assigning `message`/`name`/`methodName`/`className` directly onto `this` instead (the
standard reliable ES5 `Error`-subclassing pattern), re-verified afterward.

### 2.3 Constructor

`StorageAdapter(config)` is the only method that does **not** throw. It stores `config`
verbatim on `this._config`, never reads or validates it — config shape is entirely a
concrete subclass's own concern, mirroring `Repository.js`'s general pattern of pushing
entity-specific decisions down to the subclass while the base class stays generic.

### 2.4 Zero Engine/Browser/DOM Dependency (verified, not assumed)

`grep -n "localStorage" js/core/StorageAdapter.js` returns 8 matches — every one inside a
doc-comment (describing what a *future* concrete subclass, e.g.
`LocalStorageAdapter`, will do). `grep -n "window\.\|document\.\|fetch("` (excluding
comment lines) returns **zero** matches outside the UMD export wrapper itself
(`typeof window !== 'undefined' ? window : ...` — the same pattern `Repository.js` and
every Repository subclass already use, confirmed identical in style). No executable line
in this file touches `localStorage`, `indexedDB`, `sessionStorage`, `fetch`, `window`, or
`document`.

---

## 3. Verification Performed

All verification below was executed directly against the created file with Node, not
asserted from reading the code alone.

1. **Syntax:** `node --check js/core/StorageAdapter.js` → passes.
2. **Every abstract method throws `NotImplementedError`:** instantiated a bare
   `new StorageAdapter()` and called all 8 methods (`open`, `close`, `destroy`, `read`,
   `write`, `delete`, `clear`, `exists`) — confirmed each throws synchronously, each
   thrown value is `instanceof NotImplementedError` **and** `instanceof Error`, each
   carries the correct `.name === 'NotImplementedError'` and the correct `.methodName`.
   (First run caught the `Error.call` bug from §2.2 above — `instanceof` failed on every
   method; fixed; re-run passed on all 8.)
3. **Constructor never throws**, with or without a `config` argument.
4. **Repository.js can consume a concrete subclass unchanged** — built a minimal
   `TestAdapter extends StorageAdapter` overriding only `read`/`write` (an in-memory
   object, no `localStorage`), passed it as `storageAdapter` into
   `new Repository({...})` with no other change to `Repository.js`, then ran
   `repo.open()` → `repo.create({...})` → `repo.getAll()` end-to-end successfully. This
   is the direct, executed proof (not an inference) that Repository.js's existing duck-
   typed contract is satisfied by a `StorageAdapter` subclass with zero modification to
   `Repository.js` itself.
5. **Un-overridden methods on a partial subclass still throw correctly** — on the same
   `TestAdapter` (which only overrides `read`/`write`), calling `adapter.open()`
   confirmed it still throws `NotImplementedError` with `className: 'TestAdapter'`,
   `methodName: 'open'` — proving the abstract-method fallback correctly attributes the
   error to the actual calling subclass, not just to `StorageAdapter` itself, for every
   method a future concrete adapter has not yet gotten around to implementing.
6. **No files other than `js/core/StorageAdapter.js` were modified** — confirmed via the
   same read-only discipline as every prior phase in this project (only `view`, `grep`,
   `wc`, and `node --check`/`node -e` — a sandboxed, throwaway Node process — were used
   against the working copy; no `str_replace` or edit touched `Repository.js` or any
   `js/repositories/*.js` file).

---

## 4. Confirmation Against Phase Instructions

- [x] Only the Storage Adapter Interface was implemented — no `localStorage` logic
  exists anywhere in the file (§2.4).
- [x] `DatabaseService` was not implemented — no file named or shaped like it exists in
  this phase's output.
- [x] `Repository.js` was not modified (re-confirmed via `git`-independent line-count/
  content check: the file's grounding-fact grep in §1 was run against the **unmodified**
  file, and no edit tool was invoked against it this phase).
- [x] No Repository (`js/repositories/*.js`) was modified.
- [x] The adapter is generic — does not depend on `localStorage`, IndexedDB, Browser
  APIs, the DOM, or `window` for any of its actual (non-doc-comment) logic.
- [x] All 8 required methods are defined: `open()`, `close()`, `destroy()`,
  `read(entityKey)`, `write(entityKey, records)`, `delete(entityKey)`, `clear()`,
  `exists(entityKey)`.
- [x] Each method includes JSDoc, parameters, return type, exceptions, and async
  behavior (§2.1; full text in the file itself).
- [x] An abstract base was created (`StorageAdapter`), and every method except the
  constructor throws `NotImplementedError` (§3, item 2).
- [x] Verified Repository.js can later consume this adapter (§3, item 4 — executed, not
  assumed).
- [x] No implementation exists — only abstraction (constructor stores opaque config;
  every other method's body is exactly one line, `abstractMethod(this, '<name>')`).

---

Storage Adapter Interface
PASS
Ready For localStorage Adapter
