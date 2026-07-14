# NEXT_PHASE.md
## نظام الحسام للمحاماة — V10 Offline-First Architecture
### Rewritten in full — PHASE 10 / SUB-PHASE 10.7 — Documentation Synchronization
**Date:** 2026-07-11. Prior version was frozen at "Documentation Cleanup
(print-utils.js)", 2026-07-03, predating the entire Repository layer, DatabaseService
layer, all Module integrations, and the whole Restore System. Fully superseded.

---

## 1. Current Status

**Phase 10 — Restore System: COMPLETE** (sub-phases 10.1–10.4, 10.6, 10.7 done;
10.5 — Restore/Trash UI — scoped but explicitly deferred, not started).

**Restore System: COMPLETE** at the Repository/Module (programmatic) layer.
`restore(id)` is live on `Repository.prototype`, inherited by all 9 entity
Repositories, and wired into a `restore<Entity>(id)` function in all 9 migrated
Modules. Verified PASS in SUB-PHASE 10.6 (941/943 checks passed live, 2 explained
non-functional). Not yet exposed through any end-user UI.

## 2. Current Production Status

The Repository/DatabaseService/StorageAdapter/LocalStorageAdapter/Restore stack is
production-ready as a programmatic data layer (see `Production_Readiness_Audit.md`,
updated this phase, and `Restore_Production_Readiness.md`). The application overall
is stable and has zero known functional defects, but is not yet "fully" production
complete in the end-user sense: no Restore/Trash UI exists, Google Sheets sync
coverage is inconsistent across modules (T-02), and 6 of 26 test harnesses cannot run
at all (T-07), reducing automated regression coverage for 6 entities' standalone
Repository behavior (their integration harnesses still run and pass).

## 3. Current Technical Debt

See `Technical_Debt_Report.md` (rewritten this phase) for full detail. Open,
non-blocking items: T-02 (Sheets delete-sync coverage), T-03 (no ApiService
retry/backoff), T-04 (unbounded localStorage growth from permanent soft-delete),
T-05 (duplicate full-array scan per render), T-06 (loosely-typed `window._*`
globals), T-07 (6 broken standalone harnesses), T-09 (missing restore-after-
update/import/clear test coverage). Resolved: T-01 (no restore path), T-08 (stale
general documentation, resolved by this phase).

## 4. Remaining Risks

- **T-04** is the most likely to become user-visible over time: soft-deleted records
  are never purged, and the existence of Restore may now encourage more frequent
  deletion (since it feels reversible), accelerating storage growth.
- **T-07** silently reduces the safety net for 6 entities' lowest-level Repository
  behavior if a future change introduces a regression there — their higher-level
  integration harnesses would likely (but not certainly) still catch it.
- **No Restore UI** means the resolved T-01 capability is currently unreachable by
  actual end users, limiting its real-world value until 10.5 is implemented.
- **Documentation drift** (the condition that produced T-08) can recur if future
  phases don't update `PROJECT_STATE.md`/`NEXT_PHASE.md`/`PROJECT_MAP.md` as they go,
  rather than only at dedicated synchronization phases — recommend making a brief
  doc-sync check a standard closing step of every future phase, not a separate phase.

## 5. Recommended Order

1. **SUB-PHASE 10.5 — Restore / Trash UI.** Smaller, lower-risk than a new
   architectural phase; makes the already-resolved T-01 capability actually usable.
   Natural, direct continuation of completed Phase 10 work.
2. **T-07 cleanup** — fix the broken `require()` paths in the 6 standalone repository
   harnesses. Small, isolated, improves regression safety net before any new
   architectural layer is added on top.
3. **T-09 closure** — add the 3 missing restore-interaction assertions
   (restore-after-update/import/clear) to `verify_repository_restore.js`. Small.
4. **Phase 11 — Cache Layer.** In-memory/read caching in front of `DatabaseService`
   to reduce redundant `getAll()`/`search()` calls (also partially addresses T-05).
5. **Phase 12 — IndexedDB Layer.** Implement a second concrete `StorageAdapter`
   (IndexedDB) alongside `LocalStorageAdapter`, exercising the abstraction boundary
   the Phase 3 design and Phase 8 implementation were built for. No Repository or
   Module change should be required, by design — this phase would be a strong
   real-world test of that architectural claim.
6. **Phase 13 — Advanced Synchronization.** Consistent, retry-capable
   (addressing T-03), full-coverage (addressing T-02) Google Sheets sync across all 9
   entities, including delete/restore sync — currently out of scope everywhere.

## 6. Future Roadmap (indicative, not committed)

Cache Layer (11) → IndexedDB Layer (12) → Advanced Synchronization (13) →
multi-device/remote sync exploration → Restore/Trash UI polish (if not done earlier
as recommended in §5) → purge/hard-delete policy for T-04 → PWA/offline-install
hardening.

This roadmap is a recommendation based on current technical debt and architecture
readiness, not a commitment; each phase should still begin with its own read-only
audit against the source code current at that time, per this project's established
methodology.
