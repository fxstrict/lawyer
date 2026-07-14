# PROJECT_STATE.md
## نظام الحسام للمحاماة — V10 Offline-First Architecture
### Rewritten in full — PHASE 10 / SUB-PHASE 10.7 — Documentation Synchronization
**Date:** 2026-07-11
**Source of truth for this rewrite:** live source code in `Master_v10_5`, verified by
direct reading and by re-executing every runnable test harness in this session. Prior
`PROJECT_STATE.md` (last dated 2026-07-05, frozen at SUB-PHASE 5.10.2) is superseded in
full by this document.

---

## 1. Current Version

**Master_v10_5** — V10 Offline-First Architecture, post-Restore System
(SUB-PHASE 10.6 verified PASS, this synchronization is SUB-PHASE 10.7).

## 2. Completed Phases (V10 Offline-First Architecture numbering)

| Phase | Title | Status |
|---|---|---|
| Phase 1 | Database Architecture Audit | ✅ Complete |
| Phase 2 | Repository Contract Design | ✅ Complete |
| Phase 3 | DatabaseService Design | ✅ Complete |
| Phase 4 | Data Schema Specification | ✅ Complete |
| Phase 5 | Repository Core + all 9 entity Repositories | ✅ Complete |
| Phase 8 | Storage/Database Layer Implementation + Repository Wiring | ✅ Complete |
| Phase 9 | Module Integration (all 9 modules) + Stabilization Audit | ✅ Complete |
| Phase 10 | Restore System (design → implementation → rollout → verification → docs sync) | ✅ Complete |

**Note on numbering:** no document in this project ever used "Phase 6" or "Phase 7" —
the project's own phase sequence jumps from Phase 5 (Repository Core, 2026-07-05) to
Phase 8 (Database/Storage layer, 2026-07-05 same day). This is the project's actual,
observed numbering and is preserved as-is rather than invented or renumbered; it is not
a documentation gap introduced by this rewrite. See `PROJECT_HISTORY.md §0` for detail.

## 3. Completed Sub-Phases

**Phase 5** — 5.1 Repository Core, 5.2 Cases, 5.3 Clients, 5.4 Children, 5.5 Sessions,
5.6 Tasks, 5.7 Fees, 5.8 Documents, 5.9.1–5.9.2 Library, 5.10.1–5.10.2 Templates.

**Phase 8** — 8.1.1–8.1.2 Database Layer Audit, 8.2.1 DatabaseService Contract,
8.3.1 StorageAdapter Interface, 8.3.2 LocalStorageAdapter Implementation,
8.4.1 DatabaseService Core Skeleton, 8.4.2 DatabaseService Integration/Pipeline
Verification, 8.5.1 CasesRepository Wiring Pilot, 8.5.2 Remaining 8 Repositories
Wiring, 8.5.3 Independent Wiring Audit.

**Phase 9** — 9.1 Integration Audit & Migration Plan, 9.2 Compatibility Layer Design,
9.3 Documents (pilot), 9.4 Sessions, 9.5 Tasks, 9.6 Library, 9.7 Templates,
9.8 Children, 9.9 Fees, 9.10 Clients Integration Audit, 9.11 Clients Integration,
9.12 Cases Integration Audit, 9.13 Cases Integration, 9.15 Repository Runtime Wiring,
9.16 Stabilization & Production Readiness Audit. (No standalone report exists for a
"9.14" — not treated here as a defect; see `PROJECT_HISTORY.md §0`.)

**Phase 10** — 10.1 Restore System Design, 10.2 Restore System Architecture +
Repository-layer Implementation, 10.3 Restore Migration Plan + Cases Restore
Integration, 10.4 Restore Rollout (remaining 8 entities), 10.6 Full Restore System
Verification (10.5 — Trash/Recycle-Bin UI — explicitly deferred/out of scope, not yet
started), 10.7 Documentation Synchronization (this document and its companions).

## 4. Current Architecture

Layered, offline-first, `localStorage`-backed today with an explicit abstraction
boundary designed for a future IndexedDB (or other) engine swap with zero Repository
changes required.

```
Modules (js/modules/*.js)
   │  9 of 12 modules call a per-entity Repository instance;
   │  3 (dashboard.js, calendar.js, settings.js) have no Repository dependency at all
   ▼
Repository (js/core/Repository.js) — 1 shared base class, 9 subclasses
   │  create/update/delete/restore/get/getAll/search/exists/transaction/import/export/clear
   ▼
DatabaseService (js/core/DatabaseService.js)
   │  single storage-agnostic entry point, speaks StorageAdapter's interface
   ▼
StorageAdapter (js/core/StorageAdapter.js) — abstract interface (open/read/write/...)
   ▼
LocalStorageAdapter (js/core/LocalStorageAdapter.js) — concrete, only engine wired today
   ▼
Browser localStorage (9 array keys + settings keys)
```

Each Module additionally maintains a **compatibility mirror** — `data.<entity> =
<entity>Repository.getAll()` — so all pre-Repository rendering/search/filter/sort/print
code (which reads the global `data.*` object) continues to work unchanged.

### 4.1 Repository Layer

`js/core/Repository.js` (1364 lines) — base class. Confirmed (this session, live read
+ harness execution) to implement: `create`, `get`, `getAll`, `search`, `exists`,
`update`, `delete` (soft or hard, per-entity configurable), **`restore`** (new in
Phase 10), `transaction` (atomic multi-op with rollback), `import`, `export`, `clear`,
plus internal `_indexOf`, `_isDeleted`, `_attachMetadata`, `_guardSupported`,
`_guardReady`, `_persist`, `_queryInternal`.

9 subclasses under `js/repositories/`, each ~430–650 lines, each configuring
`entityKey`, `idField`, `searchFields`, `softDelete`, `unsupportedOperations`, and an
`idGenerator`, with zero method overrides of `restore()` (fully inherited):

| Repository | File | Lines | `entityKey` | `idField` | `softDelete` |
|---|---|---|---|---|---|
| CasesRepository | CasesRepository.js | 436 | `cases` | `رقم_القضية` | `true` |
| ClientsRepository | ClientsRepository.js | 490 | `clients` | `رقم_الموكل` | `true` |
| SessionsRepository | SessionsRepository.js | 620 | `sessions` | `رقم_الجلسة` | `true` |
| TasksRepository | TasksRepository.js | 596 | `tasks` | `رقم_المهمة` | `true` |
| DocumentsRepository | DocumentsRepository.js | 631 | `documents` | `رقم_المستند` | `true` |
| LibraryRepository | LibraryRepository.js | 588 | `library` | `id` | `true` |
| TemplatesRepository | TemplatesRepository.js | 644 | `templates` | `id` | `true` |
| ChildrenRepository | ChildrenRepository.js | 529 | `children` | `رقم_الطفل` | `true` |
| FeesRepository | FeesRepository.js | 631 | `fees` | `رقم_العملية` | `true` |

All 9 have `unsupportedOperations: []` — every Repository method, including `restore`,
is fully supported on all 9 entities.

### 4.2 DatabaseService

`js/core/DatabaseService.js` (273 lines) — single storage-agnostic façade every
Repository talks to. No Repository accesses `localStorage`, `IndexedDB`, or
`ApiService` directly (confirmed by grep across all 9 repository files — zero direct
storage calls outside `DatabaseService`).

### 4.3 StorageAdapter

`js/core/StorageAdapter.js` (410 lines) — abstract interface (`open`, `read`, `write`,
`delete`, `clear`, etc.) that any concrete storage engine must implement.

### 4.4 LocalStorageAdapter

`js/core/LocalStorageAdapter.js` (631 lines) — the only concrete `StorageAdapter`
implementation wired today; backs onto browser `localStorage`. No IndexedDB
implementation exists anywhere in the codebase (confirmed by grep — zero matches for
`indexedDB` in `js/`), consistent with `DatabaseService_Design_Report_PHASE3_V10.md`'s
original decision to abstract in IndexedDB vocabulary while implementing on
`localStorage` first.

### 4.5 Restore System (Phase 10)

`Repository.prototype.restore(id)` — clears `deletedAt`, re-stamps metadata
(`version`++, `updatedAt`), single adapter write, idempotent on an already-live record
(zero writes), rolls back the in-memory record on a persist failure. Also supported
inside `transaction()` via `{op:'restore', id}`, with full all-or-nothing rollback
semantics matching every other transaction op type.

All 9 Repositories inherit it with no per-repository code. All 9 migrated Modules
expose a `restore<Entity>(id)` wrapper (`restoreCase`, `restoreClient`,
`restoreSession`, `restoreTask`, `restoreDocument`, `restoreLibBook`,
`restoreTemplate`, `restoreChild`, `restoreFee`) that calls the Repository, re-syncs
the `data.*` compatibility mirror, re-renders, updates dashboard badges (except
Library/Templates, which have no badges — same asymmetry `delete` already has), and
shows a toast. No `restore<Entity>()` function calls `ApiService` — Google Sheets sync
on restore is a deliberate, documented non-goal of this phase (see T-02 below).

**No end-user-facing UI (button/screen) calls any `restore<Entity>()` yet.** This is
the sole remaining item of the original Restore System scope (SUB-PHASE 10.5,
Trash/Recycle Bin UI) and is explicitly deferred — see §11 Next Phase.

## 5. Current Runtime Status

`index.html` script loading order (736 lines total), confirmed correct and
dependency-safe by direct read and by live-executing `verify_runtime_wiring.js`
(40/40 passed, this session):

```
api.js → ui-utils.js → print-utils.js → StorageAdapter.js → LocalStorageAdapter.js
→ DatabaseService.js → Repository.js → CasesRepository.js → ClientsRepository.js
→ ChildrenRepository.js → SessionsRepository.js → TasksRepository.js
→ FeesRepository.js → DocumentsRepository.js → LibraryRepository.js
→ TemplatesRepository.js → cases.js → [inline bootstrap] → settings.js
→ calendar.js → children.js → dashboard.js → tasks.js → documents.js
→ sessions.js → clients.js → fees.js → library.js → templates.js
```

Live-confirmed this session: every `window.<entity>Repository` singleton exists at
runtime; all 12 pages (`navigate('<page>')`) resolve without error; `ApiService`,
`print-utils`, and the QR entry point are all present and reachable.

## 6. Production Readiness

Full detail in `Production_Readiness_Audit.md` (updated this phase) and
`Restore_Production_Readiness.md`. Summary: **the Repository/DatabaseService/
StorageAdapter/LocalStorageAdapter/Restore stack is production-ready as a
programmatic data layer.** The application as a whole is **not yet fully
production-ready** due to open items in §7 below (notably T-07's broken standalone
test harnesses, which do not affect runtime behavior but reduce regression-catching
ability, and the missing Restore UI).

## 7. Technical Debt Summary

Full detail in `Technical_Debt_Report.md` (rewritten this phase) and
`Restore_Technical_Debt_Update.md`. Current open items: T-02 (inconsistent Google
Sheets delete-sync coverage), T-03 (no ApiService retry/backoff), T-04 (unbounded
localStorage growth from permanent soft-delete), T-05 (duplicate full-array scan per
render), T-06 (loosely-typed `window._*` globals), T-07 (6 broken standalone test
harnesses), T-09 (missing restore-after-update/import/clear test coverage). T-01 (no
restore path) is **Resolved**. T-08 (stale general documentation) is **Resolved by
this synchronization phase.**

## 8. Current Test Statistics

26 harness files under `js/tests/`. **20 execute successfully; 6 fail immediately with
a pre-existing `MODULE_NOT_FOUND` (T-07), unrelated to Restore or this synchronization
phase.** Live re-run this session, the 20 working harnesses total **943 individual
checks: 941 passed, 2 failed** (both the same pre-existing, explained, non-functional
MD5 scope-pin from Phase 8.5, unrelated to any current code path). `node --check`
against all 34 `.js` files under `js/`: zero syntax errors.

| Harness | Checks | Result |
|---|---|---|
| verify_repository_restore.js | 18 | 18/18 |
| verify_cases_restore_integration.js | 36 | 36/36 |
| verify_restore_rollout.js | 232 | 232/232 |
| verify_database_pipeline.js | 37 | 37/37 |
| verify_database_service_core.js | 26 | 26/26 |
| verify_localstorage_adapter.js | 30 | 30/30 |
| verify_documents_repository.js | 61 | 61/61 |
| verify_templates_repository.js | 55 | 55/55 |
| verify_repository_wiring_all.js | 140 | 139/140 |
| verify_cases_repository_wiring.js | 42 | 41/42 |
| verify_runtime_wiring.js | 40 | 40/40 |
| 9× `verify_*_repository_integration.js` | 228 | 228/228 |
| **Total** | **943** | **941/943** |
| 6× broken (T-07) | — | do not execute (`MODULE_NOT_FOUND`) |

## 9. Current Repository Status

All 9 Repositories: implemented, wired to the real `DatabaseService`/
`LocalStorageAdapter` pipeline (Phase 8), integrated into their Modules (Phase 9),
and restore-capable (Phase 10). No known open defect in any Repository file.

## 10. Current Module Status

| Module | Repository-integrated | `restore<Entity>()` | Notes |
|---|---|---|---|
| cases.js | Yes | `restoreCase` | 1290 lines |
| clients.js | Yes | `restoreClient` | 1415 lines |
| sessions.js | Yes | `restoreSession` | 537 lines |
| tasks.js | Yes | `restoreTask` | 551 lines |
| documents.js | Yes | `restoreDocument` | 496 lines |
| library.js | Yes | `restoreLibBook` | 586 lines (no badge concept) |
| templates.js | Yes | `restoreTemplate` | 578 lines (no badge concept) |
| children.js | Yes | `restoreChild` | 498 lines |
| fees.js | Yes | `restoreFee` | 567 lines |
| dashboard.js | No (by design — aggregates `data.*` mirrors only) | — | 80 lines |
| calendar.js | No (by design) | — | 209 lines |
| settings.js | No (by design) | — | 134 lines |

## 11. Known Limitations

- No IndexedDB (or any non-`localStorage`) `StorageAdapter` implementation exists yet
  — architecture supports it, nothing built.
- No Restore/Trash UI — restore is API-only today.
- Google Sheets delete/restore sync is inconsistent across modules (T-02) and restore
  never syncs to Sheets for any entity (deliberate, not yet revisited).
- 6 of 26 test harnesses cannot run at all (T-07) — reduces automated regression
  coverage for Children/Clients/Sessions/Tasks/Library/Fees standalone Repository
  behavior (their *integration* harnesses, a separate set of files, do run and pass).
- No dedicated live test coverage for restore-after-update / restore-after-import /
  restore-after-clear (T-09) — reasoned safe from source, not yet asserted by a
  harness.

## 12. Current Project Health

**Green.** Zero known functional defects in the Repository/DatabaseService/
StorageAdapter/Restore stack. All production/documentation cross-references verified
consistent as of this phase (see `Documentation_Synchronization_Report.md`). Remaining
debt is tracked, scoped, and non-blocking.

## 13. Next Phase

See `NEXT_PHASE.md` for full detail. Recommended immediate candidates, in order:
Phase 11 (Cache Layer), Phase 12 (IndexedDB Layer), Phase 13 (Advanced
Synchronization) — or, ahead of those, closing T-07 (broken harnesses) and building
the Restore/Trash UI (SUB-PHASE 10.5), both smaller and lower-risk than a new
architectural phase.
