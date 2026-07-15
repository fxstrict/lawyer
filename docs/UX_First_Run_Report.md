# UX_First_Run_Report.md
## PHASE UX-01 — First Run Experience + Branding + Onboarding
**Scope:** UI only (as mandated). No Repository, Undo, Database, Cache, or
Google Sync code was read for the purpose of modification, and none was
modified. Verified below by checksum.

---

## 0. Pre-Work Reading (per phase brief)

Read in full before any edit, in this order: `PROJECT_STATE.md`,
`PROJECT_HISTORY.md`, `PROJECT_MAP.md`, `NEXT_PHASE.md`, `index.html`,
all 5 `css/*.css` files, `js/modules/settings.js`, `js/modules/dashboard.js`,
and all other `js/modules/*.js` files (for load-order/dependency context),
plus the Startup-related audit docs already in `docs/` (`Startup_Timeline.md`,
`Boot_Optimization_Plan.md`, `Startup_Bottlenecks.md`).

**Documentation-drift finding (architectural, not fixed — per phase brief
instruction to only document such findings):** `PROJECT_STATE.md`,
`PROJECT_HISTORY.md`, `PROJECT_MAP.md`, and `NEXT_PHASE.md` are all dated
2026-07-11 and describe the project as frozen at **Phase 10** ("Master_v10_5"),
recommending Phase 11 (Cache Layer) as the *next* candidate. The actual
source tree in this zip (`Master_v12_4B`) already contains a `js/core/
UndoManager.js`, ten Undo/Cache-related test harnesses
(`verify_undo_manager.js`, `verify_repository_undo_hooks.js`,
`verify_cases_undo_integration.js`, `verify_repository_cache_layer.js`,
`verify_cache_validation.js`, `verify_restore_stress.js`,
`verify_transaction_consistency.js`, `verify_repository_api_consistency.js`,
etc.), a `Phase12_4_Verification_Report.md`, `Boot_Optimization_Plan.md`,
`Startup_Bottlenecks.md`, and a `settings.js` comment block explicitly
labeled `PHASE 12.4B — INSTANT STARTUP HOTFIX`. None of Phase 11, Phase 12,
or the Undo/Cache work is reflected anywhere in the four tracking documents.
This is exactly the "documentation drift" risk `NEXT_PHASE.md §4` warned
about recurring. **Not fixed in this phase** (out of the UI-only scope) —
flagged here for a future documentation-synchronization pass.

---

## 1. What Was Built

### 1.1 Splash Screen (`#splashScreen`)
- New element, first child of `<body>`, visible by default in the markup
  (no JS required for first paint — never a blank page).
- Light background (`#F8F5EF`, matches the app's existing cream palette) —
  **not** black/dark, per the brief.
- Content: circular gold badge with a balance-scale glyph (⚖, matches the
  glyph already used for the sidebar logo and the Cases nav icon —
  no new iconography introduced), "الحسام" / "نظام إدارة مكاتب المحاماة",
  a small animated "جارٍ التحميل..." indicator, and a footer line with the
  office's WhatsApp number. The number (01016000360) is not new — it is
  the same number already used throughout `Code_v4.gs`'s client-portal
  pages; reused verbatim for consistency, linked as `wa.me/201016000360`.
- Hidden by `js/modules/firstrun.js` shortly after local data has rendered:
  - A hard 1.5s safety cap (`setTimeout(...,1500)`), matching the brief's
    "no longer than 1.5s if local data is ready" ceiling.
  - In the normal case, hidden right after the existing (unmodified)
    `DOMContentLoaded` handler in `index.html` has already synchronously
    rendered local data — with only a small minimum-visible-time (450ms)
    added so the brand moment doesn't read as a flicker.
  - **Never gated on Google Sheets sync.** `loadFromSheets()` was already
    converted to a non-blocking, parallelized, timeout-bounded background
    call in the prior PHASE 12.4B hotfix (confirmed by reading
    `settings.js` and `Boot_Optimization_Plan.md`/`Startup_Timeline.md`
    before writing any code) — this phase does not touch that function or
    its call site at all. The splash hiding logic is entirely independent
    of it, satisfying "if the app needs sync, the splash disappears and
    the app starts, then sync runs in the background."

### 1.2 First Run Wizard (`#firstRunWizard`)
- Shown whenever `localStorage.getItem('apiUrl')` (the existing `API_URL`
  global) is empty — on first run, and automatically again any time the
  value is removed later (e.g. via Settings → "مسح كل البيانات"), exactly
  as specified.
- Not a browser `alert()` — a full modal built from the app's existing
  `.modal-overlay`/`.modal`/`.modal-body`/`.modal-footer` primitives (same
  classes already used by every other modal in the app), with a dedicated
  `.firstrun-*` styling layer for the hero/privacy sections.
- Content, in order: large logo badge (⚖) → "الحسام" / "نظام إدارة مكاتب
  المحاماة" → welcome paragraph explaining the app runs fully locally and
  each user's Google Apps Script URL is private to them → a dedicated
  privacy box (🔒) spelling out: each user has their own link, no link is
  ever stored by the developer, the link is stored only in the user's own
  browser → the URL input → a result line → action buttons.
- **اختبار الاتصال (Test Connection):** calls the same `?action=setup`
  Apps Script endpoint `testConnection()` in `settings.js` already calls,
  independently implemented in `firstrun.js` (not by editing
  `testConnection()`, to keep the Settings page's existing behavior at
  zero risk). Success → "✓ تم الاتصال بنجاح." Failure → "✗ تعذر الاتصال.
  راجع الرابط ثم حاول مرة أخرى." — the exact wording requested.
- **حفظ وبدء البرنامج (Save & Start):** writes `apiUrl` to `localStorage`,
  updates `API_URL`, updates the sidebar connection dot (calls the
  existing `updateConnectionStatus()`), closes the wizard, and — 500ms
  later, in the background — triggers the existing `loadFromSheets()`.
  **No page reload anywhere in this path.** The dashboard underneath is
  already fully rendered from local data before the wizard ever appears,
  so closing the overlay is the entire "start the app" step.
- **تخطي الآن (Skip) — flagged for explicit approval, not in the literal
  brief:** the wizard's own welcome text tells the user the app "يعمل
  البرنامج بالكامل محلياً على جهازك" (works fully locally on your device),
  and the app is provably able to run with an empty `apiUrl` (that is
  already its default, fully-supported state per the existing codebase).
  A wizard with no way to proceed without entering a URL would contradict
  that same paragraph. A small, secondary "تخطي الآن" button was added so
  an offline-only user is never blocked on first run. It is **session-only**
  — it does not write any localStorage flag — so, consistent with "إذا حذف
  المستخدم الرابط يعود Wizard تلقائياً," the wizard will correctly reappear
  on the next load as long as `apiUrl` is still empty. If this behavior is
  not wanted, it can be removed by deleting the one button and its handler
  (`wizardSkip()`) in `firstrun.js` — no other code depends on it.

### 1.3 Sidebar Redesign
- Background changed from a dark navy gradient (`#0D1B2A → #162436`) to a
  light off-white/gray (`#F7F8FA`), per the brief's "ليس غامقاً" / "أبيض
  مائل للرمادي" direction.
- Hover state: calm blue tint (`rgba(41,128,185,0.08)`, text `#1B5E8C`) —
  the app's existing `--info` blue, reused rather than inventing a new hue.
- Active item: a simple gold chip (`rgba(201,168,76,…)` gradient + a thin
  inset gold border), replacing the old dark-theme left-border indicator.
- Modern rounded corners (`border-radius:10px`) on every nav item.
- Slightly larger icons (16px → 17px) for clarity, unchanged glyphs.
- A light drop shadow on the sidebar itself (`box-shadow:2px 0 18px
  rgba(20,30,45,0.05)`) instead of the previous flat dark panel.
- Fixed a pre-existing low-contrast issue surfaced by this redesign: the
  nav badge (`.nav-badge`) used `color:var(--navy)`, which in the current
  (already-light) variable set resolves to a near-white cream — nearly
  unreadable against the gold badge background. Changed to
  `var(--offwhite)` (`#2C3E50`, dark slate), an existing variable already
  used elsewhere for readable text-on-light-accent, restoring legible
  contrast. This is a styling-only correction within the sidebar scope
  requested by the brief, not a logic change.
- No markup structure changed beyond adding one badge `<div>` around the
  existing logo glyph (see §1.4) — every `id`/`onclick`/`navigate(...)`
  attribute is untouched, so `navigate()`, `toggleSidebar()`, and badge
  updates in `dashboard.js` continue to target the same elements.

### 1.4 Identity / Branding polish
- The sidebar logo block already contained the office name, the lawyer's
  name, and a version number (`v3.0`) — the brief's three asks were already
  present. What was missing was a distinct small mark; wrapped the existing
  ⚖ glyph in a circular gold badge (`.sidebar-logo-badge`) matching the
  splash/wizard badge treatment, so the same mark now appears consistently
  in the splash screen, the wizard, and the sidebar.

### 1.5 Empty-Data States
- **Dashboard, zero cases (true first-use state):** added a
  `#dashboardWelcome` hero ("مرحباً بك..." / "ابدأ رحلتك بإضافة أول قضية..."
  / "➕ إضافة قضية جديدة" button) shown **instead of** the stats/dashboard
  grids — toggled in `renderDashboard()` (`dashboard.js`) purely via
  `style.display`, scoped with `#page-dashboard .stats-grid` /
  `#page-dashboard .dashboard-grid` selectors specifically because the
  `.stats-grid` class name is also reused, unrelated, on the Fees page —
  confirmed by grep before writing the selector, to avoid an unintended
  cross-page regression.
- **Cases table, filtered-empty state:** the existing `#casesEmpty` block
  already said "لا توجد قضايا / أضف قضيتك الأولى" but had no button. Added
  the same "➕ إضافة قضية جديدة" action, calling the existing
  `openAddModal()` (no new function needed, since the user is already on
  the Cases page when this element is visible).

---

## 2. Files Changed

| File | Type | Nature of change |
|---|---|---|
| `index.html` | Modified | Added splash screen markup, first-run wizard markup, dashboard welcome markup, one button in `#casesEmpty`, one `<script src="js/modules/firstrun.js">` tag, wrapped the sidebar logo glyph in a badge `<div>`. No existing element removed, renamed, or re-ordered; no existing `<script>` tag touched. |
| `js/modules/dashboard.js` | Modified | Added one guarded block (8 lines) at the end of `renderDashboard()` toggling `#dashboardWelcome` vs. the stats/dashboard grids. No existing line changed. |
| `js/modules/firstrun.js` | **Created** | New module: splash-hide timing, first-run wizard show/hide/test/save/skip logic. |
| `css/layout.css` | Modified | Sidebar palette/shape rewritten (see §1.3); `.app-shell`, `.main`, `.topbar`, `.page`, `.sidebar-overlay`, `.burger`, `.table-wrap`, `.mobile-card-list` untouched. |
| `css/components.css` | Modified | Added splash screen, first-run wizard, and dashboard-welcome rule blocks at the end of the file. No existing rule edited or removed. |
| `css/responsive.css` | Modified | Added one small mobile block for the three new UI pieces, appended inside the existing `@media(max-width:768px)` block. No existing rule edited or removed. |
| `docs/UX_First_Run_Report.md` | **Created** | This report. |

### Files explicitly NOT touched (verified by re-reading + checksum after all edits)
`js/core/Repository.js`, `js/core/DatabaseService.js`,
`js/core/StorageAdapter.js`, `js/core/LocalStorageAdapter.js`,
`js/core/UndoManager.js`, all 9 files in `js/repositories/`, `js/api/api.js`,
`js/ui-utils.js`, `js/print-utils.js`, `Code_v4.gs`, every file under
`js/tests/`. Per the phase brief's explicit prohibition (Repository / Undo /
Database / Cache / Google Sync).

---

## 3. Verification

- **Syntax:** `node --check` run against every `.js` file under `js/`
  (all core, repository, module, and the new `firstrun.js` files) —
  **zero syntax errors.**
- **HTML structural check:** no duplicate `id` attributes anywhere in
  `index.html` (Python regex scan); `<div>` open/close tag counts balanced
  (401/401).
- **Regression spot-check:** re-ran `verify_runtime_wiring.js`
  (40/40 checks, `OVERALL: PASS`) and `verify_database_pipeline.js`
  (37/37 checks passed) — both untouched by this phase, both still pass,
  confirming the Repository/DatabaseService/StorageAdapter stack is
  unaffected.
- **Scope check:** grepped for the old dark-sidebar hex values
  (`#0D1B2A`, `#162436`, `#8A9BB0`) outside `layout.css` — every remaining
  occurrence is an unrelated, pre-existing **text-color** or **print-style**
  use (e.g. `.m-card-title`, `.view-section-title`, `@media print`), not a
  sidebar-background leftover.
- **Cross-page selector check:** confirmed `.stats-grid` is also used,
  independently, on the Fees page before scoping the dashboard-welcome
  toggle to `#page-dashboard .stats-grid` specifically — the Fees page's
  own stats grid is unaffected.

---

## 4. Known Legacy / Pre-Existing Observations (documented only, not changed)

- `settings.js` and `dashboard.js` each still carry a header comment saying
  "This file is NOT yet wired into index.html (no `<script>` tag added)" —
  both files **are** in fact wired in (`index.html` lines 742 and 746
  respectively). Stale comment left over from an earlier extraction phase;
  harmless (doesn't affect runtime), out of this phase's UI-only scope to
  clean up, noted here for a future doc-hygiene pass.
- The documentation-drift finding in §0 (Phase 11/12 work not reflected in
  `PROJECT_STATE.md`/`PROJECT_HISTORY.md`/`PROJECT_MAP.md`/`NEXT_PHASE.md`).
- The wizard's "تخطي الآن" (Skip) button in §1.2 — an addition beyond the
  literal brief, flagged explicitly for approval or removal.

---

## 5. Result

```
FIRST RUN EXPERIENCE

PASS

READY FOR UX-02
```
