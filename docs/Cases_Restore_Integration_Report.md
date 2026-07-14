# Cases_Restore_Integration_Report.md
## PHASE 10 — SUB-PHASE 10.3 — Cases Restore Pilot
### Repository Restore Integration (Pilot) — `js/modules/cases.js` Only

---

## 1. Executive Summary

A new function, `restoreCase(id)`, has been added to `js/modules/cases.js`. It restores a soft-deleted case by calling `casesRepository.restore(id)` — the Core capability added to `js/core/Repository.js` in SUB-PHASE 10.2 (`docs/Repository_Restore_Implementation_Report.md`) — then refreshes the `data.cases` compatibility mirror, persists via `saveLocal()`, shows a toast, re-renders the list, and updates dashboard badges, exactly mirroring `deleteCase()`'s own refresh sequence in reverse.

**Exactly one production file was modified: `js/modules/cases.js`.** The change is purely additive: **+80 lines, 0 lines removed or altered** (confirmed by recursive diff against the pristine uploaded archive — see §9). No other file — `Repository.js`, `DatabaseService.js`, `StorageAdapter.js`, `LocalStorageAdapter.js`, any of the other 8 `js/repositories/*.js` files, any other Module, `index.html`, `js/api/api.js`, any CSS, `Code_v4.gs` — was touched.

Two new files were created, both explicitly authorized by this phase's instructions:
- `js/tests/verify_cases_restore_integration.js` — new verification harness, **36/36 checks passing** (target was 30+).
- `docs/Cases_Restore_Integration_Report.md` — this report.

No `restoreAll()`, no Trash UI, no deleted filter, no undo queue, no bulk restore, no transactions, no cache, no IndexedDB, no events, and no other new feature were introduced — all explicitly forbidden by this phase's instructions.

**Verdict: PASS.**

---

## 2. Audit Findings (performed before any code was written)

Per this phase's mandatory audit checklist:

1. **Where `deleteCase` currently calls `CasesRepository.delete()`:** `js/modules/cases.js`, inside `async function deleteCase(i)`. It translates the frontend array index `i` to a record via `data.cases[i]`, reads the natural-key id (`رقم_القضية`) off that record, calls `ApiService.deleteData('القضايا', i)` (pre-existing, unchanged, plain index — a pre-existing, documented architectural limitation, R-06/audit-carried, not this phase's concern), then `await casesRepository.delete(id)`, then `syncCasesMirror()` → `saveLocal()` → toast → `renderCases()` → `updateBadges()`.

2. **Where restore should live:** As a new, additive, standalone function `restoreCase(id)` placed immediately after `deleteCase()`, following the exact same structural shape (guard → repository call → mirror sync → persist → toast → render → badges). `Repository.prototype.restore()` already exists on the base class (SUB-PHASE 10.2) and is inherited automatically by `CasesRepository` — no repository-layer code was needed.

3. **How deleted records are excluded today:** `Repository.prototype._isDeleted(record)` returns true when `this._softDelete && record.deletedAt != null`. `getAll()` and `search()` both exclude such records by default (unless `includeDeleted:true` is passed). `CasesRepository` is configured with `softDelete: true` and `unsupportedOperations: []` (`js/repositories/CasesRepository.js`), so `restore()` is fully supported and inherited without any repository-file change.

4. **How `syncCasesMirror()` works:** `function syncCasesMirror() { data.cases = casesRepository.getAll(); }` — a direct, unconditional reassignment. Because `getAll()` excludes soft-deleted records, calling `syncCasesMirror()` after a successful `restore()` automatically makes the restored record reappear in `data.cases` — no change to `syncCasesMirror()` itself was needed, exactly as `Restore_System_Architecture.md §14` predicted.

5. **How `renderCases()` reads `Repository.search()`:** `renderCases()` calls `syncCasesMirror()` first, then `casesRepository.search(queryModel).items` for the actual rendered rows, then resolves each row's frontend index via `resolveCaseIndex(data.cases, c)` (identifier-based lookup, not reference-based, since Repository reads return clones). This function was **not modified**; it already re-renders correctly once `restoreCase()` calls it, since the restored record is present in both `data.cases` and the live `search()` result set as soon as `syncCasesMirror()` has run.

6. **How statistics behave:** `getCaseStats()` computes `total`/`active`/`closed`/`pending` directly from `data.cases.length`/`.filter(...)`. Once `syncCasesMirror()` runs post-restore, these figures rise automatically to include the restored record — confirmed as **expected, correct behavior** (`Restore_System_Architecture.md §18`), not a bug, and verified explicitly in §6 of the new harness.

7. **Whether edit/view already work correctly after restore:** Yes, with no change needed. `editCase(i)`/`viewCase(i)`/`quickPrintCase(i)`/`quickCaseQR(i)` all operate on `data.cases[i]`, which — once `restoreCase()` has run `syncCasesMirror()` and `renderCases()` — contains the restored record at whatever index `resolveCaseIndex()` currently assigns it, identically to any other live record. No index-translation code was added or altered for these functions.

**Documented design decision (not silently resolved):** `restoreCase(id)` does **not** call `ApiService.syncRow()` or any other `ApiService` method. See §5 (Known Limitations) below.

---

## 3. Implementation

```
restoreCase(id)
  └─ await ensureCasesRepositoryReady()
  └─ await casesRepository.restore(id)
       ├─ failure → toast('حدث خطأ أثناء استرجاع القضية', 'error'); return
       └─ success →
            syncCasesMirror()
            saveLocal()
            toast('تم استرجاع القضية', 'success')
            renderCases()
            updateBadges()
```

- Takes the Repository **id** (`رقم_القضية`), not a frontend array index — a deliberate, documented divergence from `editCase(i)`/`deleteCase(i)`/etc. (see the function's own doc comment and §2 above): a soft-deleted case is by definition absent from `data.cases`, so there is no array position to translate an index from.
- No HTML/CSS/`index.html` change — no Trash button or UI wiring exists yet (Pilot scope; `restoreCase()` is callable today via console or a future Trash screen, per `Restore_System_Design.md §13` and `Restore_System_Migration_Plan.md` SUB-PHASE 10.3 scope).
- `saveCase()` and `deleteCase()` were not touched.

---

## 4. Restore Flow (as implemented)

```
Repository.restore()
  ↓
syncCasesMirror()
  ↓
saveLocal()
  ↓
renderCases()
  ↓
updateBadges()
```

Matches the instructed flow exactly, with `updateBadges()` appended for parity with `deleteCase()`'s own refresh sequence (dashboard badge counts must reflect the restored record immediately, same as they reflect a deletion immediately today).

---

## 5. Mirror Behavior

`data.cases` continues to work exactly as before for every other consumer (`dashboard.js`, `clients.js`, `sessions.js`, `documents.js`, `fees.js`, print/QR paths) — none of these files were touched, and none needed to be. `syncCasesMirror()`'s own logic is unchanged; it is simply invoked one more place (`restoreCase()`), exactly as it already is from `saveCase()` and `deleteCase()`.

**Known Limitation / Explicit Design Decision (documented, not fixed — carried forward from `Restore_System_Architecture.md §15/§16`, T-02):** `restoreCase()` does not call `ApiService.syncRow()`. `deleteCase()` calls `ApiService.deleteData()` before the Repository write; the theoretical Sheets-side "undo" of a restore would be `ApiService.syncRow()` (an update, since the soft-deleted row was never physically removed from the sheet). Whether a future `restoreCase()` should call `syncRow()` is an explicitly deferred Module-level decision per the SUB-PHASE 10.1 design docs and is out of this minimal Pilot's scope. Left uncalled here — confirmed by harness §9 (`verify_cases_restore_integration.js`) that neither `ApiService.syncRow()` nor `ApiService.deleteData()` is invoked by `restoreCase()`. Existing Google Sheets synchronization behavior is therefore completely untouched by this phase.

---

## 6. Regression Results

### 6.1 Syntax
`node --check` passed on every file under `js/core/`, `js/repositories/`, `js/modules/`, `js/api/`, including the modified `js/modules/cases.js` and the new `js/tests/verify_cases_restore_integration.js`.

### 6.2 New harness

`js/tests/verify_cases_restore_integration.js` — **36/36 checks passed** (target: 30+), covering: `delete()`, `restore()`, idempotent restore, restore on an unknown id, mirror sync, render refresh, statistics unchanged/correctly-updated, search after restore, soft-delete visibility, `includeDeleted`, persistence after reopen (fresh Repository instance on same storage), backward compatibility (legacy-shaped seed data), duplicate/repeated restore prevention, no data loss, and a no-`ApiService`-call assertion.

### 6.3 Pre-existing harnesses re-run

| Harness | Result |
|---|---|
| `verify_cases_repository_integration.js` | 45/45 passed |
| `verify_cases_repository_wiring.js` | 41/42 passed (1 pre-existing, non-functional exception — see §6.4) |
| `verify_repository_restore.js` | 18/18 passed |
| `verify_repository_wiring_all.js` | 139/140 passed (same pre-existing exception — see §6.4) |
| `verify_runtime_wiring.js` | 40/40 passed (OVERALL: PASS) |
| `verify_database_pipeline.js` | 37/37 passed |
| `verify_database_service_core.js` | 26/26 passed |
| `verify_localstorage_adapter.js` | 30/30 passed |
| `verify_documents_repository.js` | 61/61 passed |
| `verify_templates_repository.js` | 55/55 passed |
| `verify_clients_repository_integration.js` | 39/39 passed |
| `verify_children_repository_integration.js` | 20/20 passed |
| `verify_sessions_repository_integration.js` | 18/18 passed |
| `verify_tasks_repository_integration.js` | 21/21 passed |
| `verify_fees_repository_integration.js` | 20/20 passed |
| `verify_documents_repository_integration.js` | 17/17 passed |
| `verify_library_repository_integration.js` | 25/25 passed |
| `verify_templates_repository_integration.js` | 23/23 passed |

**Total: 615 pre-existing checks executed, 613 passed, 2 non-passing (explained in §6.4)**, plus the 36 new checks in §6.2, for a combined **651/653**.

### 6.4 The 2 non-passing checks — explained, not a functional regression

Both are the same pre-existing assertion type already documented in `Repository_Restore_Implementation_Report.md §11.4` (SUB-PHASE 10.2): a hardcoded-MD5 "Repository.js is untouched" pin dating from Phase 8.5.1/8.5.2, whose value predates SUB-PHASE 10.2's own authorized change to `Repository.js`. This phase did not touch `Repository.js` at all (its MD5, `370d858bf0ba441abdc2f914ce1cf6aa`, is identical before and after this phase's work — see §9); the two failing assertions are stale scope-pins from two phases prior to 10.2, not caused or worsened by this phase, and were already failing before this phase began.

### 6.5 Harnesses not executed (pre-existing, out-of-scope defect — not caused by this phase)

`verify_children_repository.js`, `verify_clients_repository.js`, `verify_sessions_repository.js`, `verify_tasks_repository.js`, `verify_fees_repository.js`, `verify_library_repository.js` (6 files) crash immediately with `MODULE_NOT_FOUND` — the pre-existing T-07 defect (`Technical_Debt_Report.md`), unrelated to `cases.js`, unmodified by this phase, identical failure mode before and after this change.

---

## 7. Backward Compatibility

- No existing function signature changed (`saveCase`, `deleteCase`, `editCase`, `viewCase`, `renderCases`, `syncCasesMirror`, `resolveCaseIndex`, `getCaseStats`, all embedded-children helpers, all cross-module autofill helpers) — all unchanged, confirmed by §6.3's 100%-pass re-run of the pre-existing Cases integration harness (45/45).
- `restoreCase(id)` is a pure prototype-level addition to the module's exported surface; no existing code path was edited.
- Legacy `localStorage['cases']` shape continues loading unchanged (harness §8: legacy-seeded record round-trips through delete → restore correctly).
- Existing Google Sheets synchronization, QR code generation, and printing are untouched — none of the functions that use them (`quickPrintCase`, `quickCaseQR`, `buildCaseReport`, `viewCase`) were modified, and `restoreCase()` calls no `ApiService` method (§5, §6.2 assertion 9).
- `index.html` is unchanged (MD5 identical — §9); no HTML/CSS was touched.

---

## 8. Known Limitations

Carried forward, none introduced by this phase:

- **No Trash/Recycle Bin UI** — `restoreCase(id)` exists only at the Module/JS layer; no button or screen calls it yet. Deferred to a possible future SUB-PHASE 10.5 per `Restore_System_Migration_Plan.md`.
- **No Google Sheets sync on restore** — `restoreCase()` does not call `ApiService.syncRow()`. This is an explicit, documented design decision (§5), not an oversight; whether to wire this is deferred to a future Module-level decision.
- **`ApiService.deleteData()` row-index drift (R-06/T-02 class)** — pre-existing, unrelated to restore, unchanged by this phase (still documented in `cases.js`'s own file header).
- **`restoreAll()`/bulk restore/Trash UI/undo queue/transactions/cache/IndexedDB/events** — none implemented, per this phase's explicit "Pilot only" instruction.
- **T-07-class broken `require()` paths** in 6 pre-existing harnesses (§6.5) remain unfixed — unrelated to and out of this phase's one-file scope.

---

## 9. Modification Scope Verification (Diff)

**Recursive diff, pristine unmodified archive vs. this phase's working copy:**

```
Files Master_v10_3/js/modules/cases.js and
      .../current/Master_v10_3/js/modules/cases.js differ
Only in .../current/Master_v10_3/js/tests: verify_cases_restore_integration.js
```

No other line of output — every other file in the project tree is byte-identical to the original upload. `docs/Cases_Restore_Integration_Report.md` (this file) is also new, as explicitly authorized.

**Line-level diff of the one changed file:**

```
js/modules/cases.js:  1210 lines -> 1290 lines  (+80 / -0)
```

`diff -u` confirms zero removed or altered lines — the entire diff is the new `restoreCase()` function, its export entry, and a short additive header note.

**MD5 confirmation of untouched files:**

| File | MD5 |
|---|---|
| `js/core/Repository.js` | `370d858bf0ba441abdc2f914ce1cf6aa` — unchanged |
| `js/repositories/CasesRepository.js` | `ee1649dd366b8f88733765a25191643a` — unchanged |
| `js/core/DatabaseService.js` | `2f448ca20584f91cdc600190587849ca` — unchanged |
| `js/core/LocalStorageAdapter.js` | `45e7346d88e080b93074ff83f268bd10` — unchanged |
| `index.html` | `0633c6a87f54afc02257d5a9a469e926` — unchanged |
| `Code_v4.gs` | `78bba97e310222740ccebfd6dec110ef` — unchanged |
| `js/modules/cases.js` | `491b31fcfebd28c5175c19be95db0f8f` — **changed (this phase's authorized objective)** |

**Note on `docs/PROJECT_MAP.md`:** this phase's instructions list `PROJECT_MAP.md` among the required input reading; no such file exists anywhere in the delivered archive (confirmed by recursive search). All other listed inputs (`PROJECT_STATE.md`, `PROJECT_HISTORY.md`, `Repository_Restore_Implementation_Report.md`, `Restore_System_Design.md`, `Restore_System_Architecture.md`, `Restore_System_Migration_Plan.md`, and the five source files) were read in full before any code was written. This gap is noted here as an Input Gap, consistent with how prior phases (e.g. `Fees_Repository_Report.md`) have documented packaging discrepancies, and did not block this phase's work.

---

## 10. Final Verdict

# CASES RESTORE PILOT

# PASS

**Summary:** `restoreCase(id)` has been added to `js/modules/cases.js` — the only production file modified, purely additively (+80/-0 lines). It restores a soft-deleted case through the existing `casesRepository.restore(id)` (inherited unmodified from `Repository.prototype.restore`, SUB-PHASE 10.2), refreshes the `data.cases` mirror, persists, toasts, re-renders, and updates badges — the exact instructed flow. 36/36 new verification checks pass; 613/615 pre-existing checks pass across every re-run harness capable of executing, with the 2 non-passing checks being pre-existing, non-functional, scope-pinning assertions unrelated to and unaffected by this phase's work. Recursive diff confirms only `js/modules/cases.js` (additive-only) plus the two authorized new files changed anywhere in the project.

Ready For SUB-PHASE 10.4
