# Restore_Technical_Debt_Update.md
## PHASE 10 — SUB-PHASE 10.6 — Technical Debt Review After Restore System

---

## 1. Purpose

Reviews every item in `docs/Technical_Debt_Report.md` (dated Phase 9.16, pre-Restore)
against the current, live state of the codebase after SUB-PHASES 10.1–10.4, and adds
any new items surfaced during this verification phase. Every status below is based on
direct source reading and/or live harness execution performed in this session (see
`Restore_Final_Verification_Report.md` for full evidence).

---

## 2. Status of Each Existing Item

### T-01 — No restore/undelete path for soft-deleted records
**Status: RESOLVED.**
`Repository.prototype.restore(id)` exists (`js/core/Repository.js:764-808`), is
inherited by all 9 entity Repositories (confirmed: `softDelete:true`,
`unsupportedOperations:[]` on all 9), and is wired into a `restore<Entity>(id)`
function in all 9 migrated Modules. Live-verified: 286/286 restore-specific harness
checks pass this session (`verify_repository_restore.js` 18/18,
`verify_cases_restore_integration.js` 36/36, `verify_restore_rollout.js` 232/232).
**Any accidental deletion of a Case, Client, Session, Task, Fee, Document, Child
record, Library entry, or Template is now recoverable** via the Repository/Module API,
resolving the HIGH-severity impact originally described. **Remaining gap:** no
end-user-facing UI (button/screen) calls `restore<Entity>()` yet — this is documented
as an explicit, deferred SUB-PHASE 10.5 scope item, not a re-opening of T-01 itself
(T-01 was scoped as "restore path", not "restore UI").

### T-02 — Inconsistent Google Sheets delete-sync coverage across modules
**Status: STILL OPEN — unchanged, and explicitly not addressed by Restore System
design (by deliberate, documented decision, not oversight).**
Confirmed live: `grep` for `ApiService` inside every `restore<Entity>()` function body,
across all 9 modules, returns zero matches. `Restore_System_Architecture.md §15`
explicitly analyzed this interaction and deferred it as a Module-level decision;
`Cases_Restore_Integration_Report.md §5` and `Restore_Rollout_Report.md §4` both
record the same explicit "left uncalled" decision for all 9 entities. The underlying
gap (Tasks/Documents/Fees/Library/Templates/Children never sync deletes to Sheets;
Children never syncs anything) is completely unchanged by this phase.

### T-03 — No retry/backoff logic in ApiService
**Status: STILL OPEN — unaffected.** `js/api/api.js` was never modified by any
Restore-phase work (confirmed: MD5 `db41edd0d52045428e8126fea76d0688`, identical
across SUB-PHASES 10.2–10.6).

### T-04 — Unbounded localStorage growth from permanent soft-delete
**Status: STILL OPEN — technically unchanged, but now more product-relevant.**
No purge/hard-delete-after-soft-delete method was added anywhere (`grep -n "purge"
js/core/Repository.js` → no match). `restore()` does not itself add to storage growth
beyond what one additional write already does — same complexity class as any other
write. However, as `Restore_System_Architecture.md §22` itself flags, the fact that
deletion is now visibly reversible may encourage more frequent deletion, which would
accelerate the accumulation T-04 already describes. Recommended priority unchanged
(Low near-term, Medium-High before long-term production commitment) but worth
re-reading in light of Restore's existence when T-04 is eventually scheduled.

### T-05 — Duplicate full-array scan per render cycle (getAll + search)
**Status: STILL OPEN — unaffected.** Every `restore<Entity>()` follows the identical
existing `sync<Entity>Mirror()` (→`getAll()`) then `render<Entity>()` (→`search()`)
two-pass pattern already documented; no new instance of the inefficiency was
introduced, and none was fixed (correctly out of scope for this work).

### T-06 — Loosely-typed shared `window._*` globals for cross-module view state
**Status: STILL OPEN — unaffected.** None of the 9 `restore<Entity>()` functions read
or write any `window._*` global (confirmed by full-body reading of all 9 functions).

### T-07 — Broken `require()` paths in standalone repository test harnesses
**Status: STILL OPEN — unchanged, re-confirmed live this session, and the scope is
now 6 files, not 5.** `verify_children_repository.js`, `verify_clients_repository.js`,
`verify_sessions_repository.js`, `verify_tasks_repository.js`,
`verify_library_repository.js`, and `verify_fees_repository.js` were all re-run live
this session; all 6 crash immediately with `MODULE_NOT_FOUND`, identical failure mode
to the originally-documented defect (SUB-PHASE 10.2 first noted the 6th file,
`verify_fees_repository.js`, as also affected — `Repository_Restore_Implementation_
Report.md §11.5`). None of these 6 files reference `restore` in any way; not
introduced, worsened, or touched by any Restore-phase work.

---

## 3. New Items Surfaced by This Phase

### T-08 (NEW) — General project-tracking documentation is stale relative to the
current codebase (Phase 6–10 undocumented in mandatory-reading files)

**Description:** Five documents listed as mandatory reading for this phase have not
been updated to reflect Phase 6 through Phase 10 (the entire second half of the
Repository migration plus the whole Restore System):

- `docs/PROJECT_STATE.md` — last entry is "V10 PHASE 5 / SUB-PHASE 5.10.2 — Templates
  Repository", dated 2026-07-05. Zero mentions of `restore`, `Phase 10`, or
  `SUB-PHASE 10`.
- `docs/NEXT_PHASE.md` — last entry is "Documentation Cleanup (`print-utils.js`)",
  dated 2026-07-03. Zero mentions of `restore` or `Phase 10`.
- `docs/PROJECT_MAP.md` — describes `Master_v8_Stable.zip`, a pre-Repository
  snapshot with no `js/core/`, no `js/repositories/`, and no `children.js` module at
  all. This staleness was already flagged once before, in
  `Restore_Rollout_Report.md §9` ("its content describes an earlier snapshot... and
  is therefore stale relative to the current codebase") — it has not been refreshed
  since.
- `docs/Production_Readiness_Audit.md` — still lists "no restore/undelete path" (T-01)
  as an open finding (§2.2, §"Finding — no restore/undelete path").
- `docs/PROJECT_HISTORY.md` — uses an entirely different, unrelated "Phase 10A/10B/10C"
  numbering scheme (Library Module Extraction/Audit/Integration) that predates and has
  no relationship to the current "PHASE 10 — Restore System" numbering used by
  `Restore_System_Design.md` onward. Two different, non-overlapping meanings of
  "Phase 10" now coexist in the project's own documentation.

**Evidence:** `grep -n "restore\|Phase 10" docs/PROJECT_STATE.md
docs/NEXT_PHASE.md` → zero matches in either file. `grep -n "Phase 10"
docs/PROJECT_HISTORY.md` → matches only "Phase 10A/10B/10C" (Library Extraction),
unrelated. `grep -n "restore" docs/Production_Readiness_Audit.md` → 6 matches, all
describing the gap as still open.

**Severity:** LOW (no functional/behavioral impact — verified independently that the
actual Restore System implementation is correct regardless of these documents'
staleness) but **growing risk** — a future engineer or phase relying on
`PROJECT_STATE.md`/`NEXT_PHASE.md` as their primary orientation (as this phase's own
instructions initially directed) would form a materially incorrect picture of the
project's current state (would not know Repositories 6-9, the entire Restore System,
or Phase 9's Stabilization audit exist at all).

**Impact:** Documentation drift compounds each phase it is left unaddressed;
`PROJECT_MAP.md`'s staleness was already flagged once (`Restore_Rollout_Report.md`)
without being fixed, suggesting this is not self-correcting.

**Estimated effort:** Medium — requires a dedicated documentation-refresh phase
synthesizing Phases 6 through 10 into `PROJECT_STATE.md`/`NEXT_PHASE.md`/
`PROJECT_MAP.md`, resolving the `PROJECT_HISTORY.md` phase-numbering collision (likely
via renumbering or an explicit "two numbering eras" note), and updating
`Production_Readiness_Audit.md`'s T-01 finding to reflect resolution.

**Recommended priority:** Medium — should precede Phase 11 if Phase 11 depends on
`PROJECT_STATE.md`/`NEXT_PHASE.md` for its own mandatory reading, to avoid compounding
the drift further.

### T-09 (NEW) — Restore harness suite has no dedicated coverage for
restore-after-update / restore-after-import / restore-after-clear

**Description:** See `Restore_Production_Readiness.md §6` for full detail. These three
interactions are correctly reasoned as safe by direct source reading, but are not
exercised by any live assertion in the current harness suite.

**Severity:** LOW (reasoning-verified, not defect-suspected; the individual methods
involved are each independently well-tested).

**Estimated effort:** Small — each is a short addition to
`verify_repository_restore.js` following the existing pattern.

**Recommended priority:** Low — worth closing before the Restore System is relied
upon as a data-safety guarantee in marketing/documentation language, consistent with
how T-01 itself was originally prioritized.

---

## 4. Summary Table

| ID | Title | Status |
|---|---|---|
| T-01 | No restore/undelete path | **RESOLVED** |
| T-02 | Inconsistent Google Sheets delete-sync coverage | Still Open (unchanged, deliberate) |
| T-03 | No retry/backoff logic in ApiService | Still Open (unaffected) |
| T-04 | Unbounded localStorage growth | Still Open (unchanged, more relevant) |
| T-05 | Duplicate full-array scan per render cycle | Still Open (unaffected) |
| T-06 | Loosely-typed `window._*` globals | Still Open (unaffected) |
| T-07 | Broken `require()` paths (now 6 files) | Still Open (unchanged) |
| T-08 | Stale general project documentation (Phase 6-10 undocumented) | **New** |
| T-09 | Missing restore-after-update/import/clear test coverage | **New** |

**No CRITICAL-severity items.** One HIGH-severity item from the prior report (T-01) is
now resolved. Nothing in this update blocks Phase 11.
