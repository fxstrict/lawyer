# PROJECT_MAP.md
## نظام الحسام للمحاماة — V10 Offline-First Architecture
### Regenerated in full — PHASE 10 / SUB-PHASE 10.7 — Documentation Synchronization
**Date:** 2026-07-11. Prior version described `Master_v8_Stable.zip`, a pre-Repository
snapshot with no `js/core/`, no `js/repositories/`, and no `children.js`; it is fully
superseded. Every path below was confirmed to exist in this session by direct
filesystem listing of `Master_v10_5`.

---

## 1. Full Directory Tree

```
Master_v10_5/
├── index.html                          (736 lines — entry point, script loader)
├── Code_v4.gs                          (990 lines — Google Apps Script backend)
├── css/
│   ├── base.css
│   ├── components.css
│   ├── layout.css
│   ├── responsive.css
│   └── variables.css
├── js/
│   ├── ui-utils.js                     (63 lines)
│   ├── print-utils.js                  (36 lines)
│   ├── api/
│   │   └── api.js                      (378 lines — ApiService, Google Sheets sync)
│   ├── core/
│   │   ├── Repository.js               (1364 lines — base class, all CRUD+restore+transaction)
│   │   ├── DatabaseService.js          (273 lines — storage-agnostic façade)
│   │   ├── StorageAdapter.js           (410 lines — abstract adapter interface)
│   │   └── LocalStorageAdapter.js      (631 lines — concrete localStorage engine)
│   ├── repositories/                   (9 files, all extend Repository)
│   │   ├── CasesRepository.js          (436 lines)
│   │   ├── ClientsRepository.js        (490 lines)
│   │   ├── SessionsRepository.js       (620 lines)
│   │   ├── TasksRepository.js          (596 lines)
│   │   ├── DocumentsRepository.js      (631 lines)
│   │   ├── LibraryRepository.js        (588 lines)
│   │   ├── TemplatesRepository.js      (644 lines)
│   │   ├── ChildrenRepository.js       (529 lines)
│   │   └── FeesRepository.js           (631 lines)
│   ├── modules/                        (12 files)
│   │   ├── cases.js                    (1290 lines — Repository-integrated, restoreCase)
│   │   ├── clients.js                  (1415 lines — Repository-integrated, restoreClient)
│   │   ├── sessions.js                 (537 lines — Repository-integrated, restoreSession)
│   │   ├── tasks.js                    (551 lines — Repository-integrated, restoreTask)
│   │   ├── documents.js                (496 lines — Repository-integrated, restoreDocument)
│   │   ├── library.js                  (586 lines — Repository-integrated, restoreLibBook)
│   │   ├── templates.js                (578 lines — Repository-integrated, restoreTemplate)
│   │   ├── children.js                 (498 lines — Repository-integrated, restoreChild)
│   │   ├── fees.js                     (567 lines — Repository-integrated, restoreFee)
│   │   ├── dashboard.js                (80 lines — no Repository dependency, reads data.* mirrors only)
│   │   ├── calendar.js                 (209 lines — no Repository dependency)
│   │   └── settings.js                 (134 lines — no Repository dependency)
│   └── tests/                          (26 files — see §5)
└── docs/                               (65 files after this phase — see §6)
```

## 2. Execution Flow / Browser Loading Order

Confirmed by direct read of `index.html` `<script>` tags (lines 564-734) and by
live-executing `verify_runtime_wiring.js` (40/40 passed, this session):

```
1.  api.js                    (ApiService — Google Sheets sync, independent of Repository)
2.  ui-utils.js                (shared DOM/toast/helpers)
3.  print-utils.js             (print/QR helpers)
4.  StorageAdapter.js          (abstract interface)
5.  LocalStorageAdapter.js     (concrete engine)
6.  DatabaseService.js         (façade, wraps the adapter)
7.  Repository.js              (base class, depends on DatabaseService)
8.  CasesRepository.js  ┐
9.  ClientsRepository.js│
10. ChildrenRepository.js
11. SessionsRepository.js  each depends only on Repository.js + DatabaseService.js
12. TasksRepository.js     (order among the 9 is not behaviorally significant)
13. FeesRepository.js
14. DocumentsRepository.js
15. LibraryRepository.js
16. TemplatesRepository.js┘
17. cases.js                   (first module; depends on CasesRepository singleton)
18. [inline bootstrap script]  (creates window.<entity>Repository singletons, initial data.* mirrors)
19. settings.js
20. calendar.js
21. children.js
22. dashboard.js
23. tasks.js
24. documents.js
25. sessions.js
26. clients.js
27. fees.js
28. library.js
29. templates.js
```

Every Repository-dependent module loads after its Repository class **and** after the
inline bootstrap that instantiates the singletons — no ordering defect (confirmed
live).

## 3. Layer Relationship Graph

```
┌─────────────────────────── Modules (12) ───────────────────────────┐
│  9 Repository-integrated:        3 not integrated (no dependency):  │
│  cases, clients, sessions,       dashboard.js  (reads data.* only)  │
│  tasks, documents, library,      calendar.js   (independent)        │
│  templates, children, fees       settings.js   (independent)        │
└──────────────┬────────────────────────────────────────────────────┘
               │ each calls its own <Entity>Repository instance
               ▼
┌─────────────────────── Repository (base class) ─────────────────────┐
│ create / get / getAll / search / exists / update / delete / restore  │
│ / transaction / import / export / clear                              │
│ 9 subclasses: Cases, Clients, Sessions, Tasks, Documents, Library,    │
│ Templates, Children, Fees — zero method overrides, 100% inherited    │
└──────────────┬────────────────────────────────────────────────────┘
               │ all storage I/O funneled through
               ▼
┌────────────────────────── DatabaseService ───────────────────────────┐
│ single façade — no Repository ever touches localStorage/IndexedDB/   │
│ ApiService directly (confirmed: zero direct storage calls in any of  │
│ the 9 repository files)                                              │
└──────────────┬────────────────────────────────────────────────────┘
               ▼
┌──────────────────────────── StorageAdapter ───────────────────────────┐
│ abstract interface — engine-agnostic contract                        │
└──────────────┬────────────────────────────────────────────────────┘
               ▼
┌─────────────────────────── LocalStorageAdapter ───────────────────────┐
│ only concrete engine wired today — backs onto browser localStorage   │
│ (no IndexedDB implementation exists anywhere in the codebase)        │
└────────────────────────────────────────────────────────────────────┘

Separately, each Module maintains:
  data.<entity> = <entity>Repository.getAll()     ("Mirror Layer")
so all pre-Repository render/search/filter/sort/print code (reading global `data.*`)
keeps working unchanged. `getAll()` excludes soft-deleted records by default, so the
mirror layer automatically reflects delete/restore state after each sync call.

Google Sheets Layer (ApiService, js/api/api.js) is architecturally independent of the
entire Repository/DatabaseService stack — zero references to `Repository` in
`api.js`, confirmed by grep. Modules call `ApiService` directly (for entities/actions
where sync exists) — this predates and is untouched by the Repository/Restore work.

Restore Layer (Phase 10) is not a new architectural tier — it is one additional method
(`restore()`) on the existing Repository base class plus one wrapper function
(`restore<Entity>()`) per Module. It required zero changes to DatabaseService,
StorageAdapter, LocalStorageAdapter, or any of dashboard.js/calendar.js/settings.js/
print-utils.js/ui-utils.js/api.js/Code_v4.gs (confirmed: zero references to `restore`
in any of those 7 files, this session).

Verification Layer (js/tests/) sits outside the runtime stack entirely — Node.js
harnesses that `require()` the same source files directly (with a mock
`StorageAdapter`/`localStorage`) to assert behavior without a browser. See §5.
```

## 4. Cross-Module Dependencies

- **dashboard.js** depends only on the `data.*` mirror objects (populated by the 9
  Repository-integrated modules' `sync<Entity>Mirror()` calls) — zero direct
  Repository or DatabaseService reference.
- **calendar.js**, **settings.js** — same: zero Repository dependency.
- **print-utils.js**, **ui-utils.js**, **api.js** — zero Repository dependency, zero
  `restore` reference. Shared/used by all 12 modules for printing, DOM helpers, and
  Google Sheets sync respectively, but none of the three has ever needed modification
  by any Repository- or Restore-related phase.
- **Code_v4.gs** — Google Apps Script backend, entirely separate execution
  environment (server-side, not loaded by `index.html`); zero Repository or restore
  reference; untouched since before Phase 1.
- No circular dependency exists between any two Modules; no Module depends on another
  Module directly (all cross-module state flows through the shared `data.*` object or
  `window._*` globals, per the existing, pre-Repository architecture — see
  `Technical_Debt_Report.md` T-06).

## 5. Verification Layer — Every Test Harness

| File | Tests | Status (live, this session) |
|---|---|---|
| verify_repository_restore.js | 18 | ✅ 18/18 |
| verify_cases_restore_integration.js | 36 | ✅ 36/36 |
| verify_restore_rollout.js | 232 | ✅ 232/232 |
| verify_database_pipeline.js | 37 | ✅ 37/37 |
| verify_database_service_core.js | 26 | ✅ 26/26 |
| verify_localstorage_adapter.js | 30 | ✅ 30/30 |
| verify_documents_repository.js | 61 | ✅ 61/61 |
| verify_templates_repository.js | 55 | ✅ 55/55 |
| verify_repository_wiring_all.js | 140 | ⚠️ 139/140 (1 stale MD5 pin, explained) |
| verify_cases_repository_wiring.js | 42 | ⚠️ 41/42 (1 stale MD5 pin, explained) |
| verify_runtime_wiring.js | 40 | ✅ 40/40 |
| verify_cases_repository_integration.js | 45 | ✅ 45/45 |
| verify_clients_repository_integration.js | 39 | ✅ 39/39 |
| verify_children_repository_integration.js | 20 | ✅ 20/20 |
| verify_sessions_repository_integration.js | 18 | ✅ 18/18 |
| verify_tasks_repository_integration.js | 21 | ✅ 21/21 |
| verify_fees_repository_integration.js | 20 | ✅ 20/20 |
| verify_documents_repository_integration.js | 17 | ✅ 17/17 |
| verify_library_repository_integration.js | 25 | ✅ 25/25 |
| verify_templates_repository_integration.js | 23 | ✅ 23/23 |
| verify_children_repository.js | — | ❌ MODULE_NOT_FOUND (T-07) |
| verify_clients_repository.js | — | ❌ MODULE_NOT_FOUND (T-07) |
| verify_sessions_repository.js | — | ❌ MODULE_NOT_FOUND (T-07) |
| verify_tasks_repository.js | — | ❌ MODULE_NOT_FOUND (T-07) |
| verify_library_repository.js | — | ❌ MODULE_NOT_FOUND (T-07) |
| verify_fees_repository.js | — | ❌ MODULE_NOT_FOUND (T-07) |

**20/26 harness files execute; 943 total checks across them; 941 pass.**

## 6. Every Documentation File (`docs/`, 65 files after this phase)

Grouped by subject (all confirmed present by filesystem listing this session):

**V10 foundational design (Phases 1–4):** `Database_Architecture_Report_PHASE1_V10.md`,
`Repository_Contract_Report_PHASE2_V10.md`, `DatabaseService_Design_Report_PHASE3_V10.md`,
`Data_Schema_Specification_Report_PHASE4_V10.md`.

**Phase 5 — Repository Core + 9 entities:** `Repository_Core_Report.md`,
`Repository_Core_Verification_Report.md`, `Cases_Repository_Report.md`,
`Cases_Repository_Verification_Report.md`, `Clients_Repository_Report.md`,
`Clients_Repository_Verification_Report.md`, `Children_Repository_Report.md`,
`Children_Repository_Verification_Report.md`, `Sessions_Repository_Report.md`,
`Sessions_Repository_Verification_Report.md`, `Tasks_Repository_Report.md`,
`Tasks_Repository_Verification_Report.md`, `Fees_Repository_Report.md`,
`Fees_Repository_Verification_Report.md`, `Documents_Repository_Report.md`,
`Documents_Repository_Verification_Report.md`, `Library_Repository_Report.md`,
`Library_Repository_Verification_Report.md`, `Templates_Repository_Report.md`,
`Templates_Repository_Verification_Report.md`.

**Phase 8 — Storage/Database layer + wiring:** `DatabaseService_Audit_Report_Part1.md`,
`DatabaseService_Audit_Report_Part2.md`, `DatabaseService_Contract_V1.md`,
`StorageAdapter_Interface_Report.md`, `LocalStorageAdapter_Report.md`,
`DatabaseService_Core_Report.md`, `Database_Pipeline_Report.md`,
`CasesRepository_Wiring_Report.md`, `Repository_Wiring_Final_Report.md`,
`Repository_Wiring_Audit_Report.md`.

**Phase 9 — Module integration + Stabilization:**
`Repository_Integration_Audit_Report.md`, `Repository_Compatibility_Layer_Design.md`,
`Documents_Repository_Integration_Report.md`, `Sessions_Repository_Integration_Report.md`,
`Tasks_Repository_Integration_Report.md`, `Library_Repository_Integration_Report.md`,
`Templates_Repository_Integration_Report.md`, `Children_Repository_Integration_Report.md`,
`Fees_Repository_Integration_Report.md`, `Clients_Repository_Integration_Audit.md`,
`Clients_Repository_Integration_Report.md`, `Cases_Repository_Integration_Audit.md`,
`Cases_Repository_Integration_Report.md`, `Repository_Runtime_Wiring_Report.md`,
`Stabilization_Report.md`.

**Phase 10 — Restore System:** `Restore_System_Design.md`,
`Restore_System_Architecture.md`, `Restore_System_Migration_Plan.md`,
`Repository_Restore_Implementation_Report.md`, `Cases_Restore_Integration_Report.md`,
`Restore_Rollout_Report.md`, `Restore_Final_Verification_Report.md`,
`Restore_Production_Readiness.md`, `Restore_Technical_Debt_Update.md`.

**Project-wide tracking (rewritten this phase):** `PROJECT_MAP.md` (this file),
`PROJECT_STATE.md`, `PROJECT_HISTORY.md`, `NEXT_PHASE.md`, `Technical_Debt_Report.md`,
`Production_Readiness_Audit.md`, `Documentation_Synchronization_Report.md` (new, this
phase).

Every path referenced above was confirmed to exist via direct filesystem listing in
this session — no stale or missing reference.

## 7. Every Production File

4 Core + 9 Repositories + 12 Modules + `api.js` + `print-utils.js` + `ui-utils.js` +
`index.html` + `Code_v4.gs` + 5 CSS files = **34 production files**, all enumerated in
§1 above with confirmed line counts.

## 8. Every Test Harness

26 files under `js/tests/`, all enumerated in §5 above.
