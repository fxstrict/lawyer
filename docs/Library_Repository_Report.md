# Library_Repository_Report.md
## V10 Offline-First Architecture — PHASE 5 / SUB-PHASE 5.9.2 — Library Repository

**Date:** 2026-07-05
**Status:** ✅ **Complete.**

---

## §1. Input Gap

The read-first list for this phase specifies, as item 1:

> `docs/Library_Repository_Audit_Report.md`

This file is **not present** anywhere in the delivered archive
(`Master_v10_5_8.zip`). A full recursive search of the extracted archive
(`find . -iname "*Library*"`) returns exactly one match:
`js/modules/library.js`. No file named `Library_Repository_Audit_Report.md`,
under any numbering variant, exists.

Per this phase's own instruction ("DO NOT GUESS. Create an Input Gap
section. Continue using the nearest verified source."), this gap is
recorded here rather than assumed away. The nearest verified sources were
used instead, consistent with the standing pattern established across every
prior Repository phase (5.2–5.8) whenever a specific input was absent
(e.g. `PROJECT_MAP.md`, never present in this archive at all):

- **`Data_Schema_Specification_Report_PHASE4_V10.md` §4.8 (Library)** —
  present and used as the design-intent source.
- **Direct inspection of `js/modules/library.js`** — present and used as
  the ground truth for every runtime-behavior claim in this report and in
  `LibraryRepository.js` itself, since no dedicated Library audit report
  exists to cross-check design intent against actual behavior (unlike,
  say, Documents, where a chain of extraction/audit/integration reports
  existed for the legacy V9 module — no equivalent chain exists for
  Library beyond `PROJECT_HISTORY.md`'s Phase 10A/10B/10C summary, which
  IS present and was also consulted).
- **`PROJECT_HISTORY.md`** (Phase 10A "Library Module Extraction", Phase
  10B "Library Module Audit", Phase 10C "Library Module Integration") —
  present, and used as a secondary corroborating source for Library's
  V9-era extraction/audit/integration history (all confirmed PASSED /
  Successful there).
- **`NEXT_PHASE.md`** — present, and its Library section (written at the
  end of SUB-PHASE 5.8) was used as a pre-flight checklist of specific
  claims to verify directly, per its own explicit "يجب فحصها مباشرة قبل أي
  افتراض" (must be checked directly before any assumption) instruction.
  Every one of its flagged points was independently re-verified against
  `js/modules/library.js` directly (see §2 below) rather than trusted at
  face value.

No other required read-first file was found missing. All of the following
were present and read: `Data_Schema_Specification_Report_PHASE4_V10.md`,
`Repository_Contract_Report_PHASE2_V10.md`,
`DatabaseService_Design_Report_PHASE3_V10.md`, `PROJECT_STATE.md`,
`PROJECT_HISTORY.md`, `NEXT_PHASE.md`, `js/core/Repository.js`,
`js/repositories/CasesRepository.js`, `js/repositories/ClientsRepository.js`,
`js/repositories/ChildrenRepository.js`,
`js/repositories/SessionsRepository.js`, `js/repositories/TasksRepository.js`,
`js/repositories/FeesRepository.js`, `js/repositories/DocumentsRepository.js`,
`js/modules/library.js`, `index.html`.

---

## §2. Findings (direct inspection, resolving every point `NEXT_PHASE.md` flagged)

### §2.1 Scope

**Files affected:** `js/repositories/LibraryRepository.js` (new file — 575
lines), the eighth concrete, entity-aware Repository, subclassing
`Repository` (`js/core/Repository.js`, unmodified — MD5-verified
unchanged: `1159f37eec831920256a727a30dba709`). No modification to
`js/repositories/CasesRepository.js`, `ClientsRepository.js`,
`ChildrenRepository.js`, `SessionsRepository.js`, `TasksRepository.js`, or
`FeesRepository.js`/`DocumentsRepository.js` — none touched, none imported
from. No modification to `js/modules/library.js`, any other Module,
`index.html`, any CSS, or `Code_v4.gs`. No Business Logic transferred, no
Sync or Cache added, no wiring into `index.html`.

### §2.2 Identifier — `idField: 'id'`

`NEXT_PHASE.md` flagged, as its first point, that a preliminary look at
`saveLibBook()` suggested Library might be the **first** entity in this
migration order to genuinely use the generic `id` field rather than a
dedicated Arabic-named field (unlike Clients/Children/Sessions/Tasks/
Fees/Documents, all six of which turned out to use an Arabic field name
once inspected directly). Direct inspection of the ACTUAL `saveLibBook()`
confirms this preliminary read was correct:

```js
obj['id']              = obj['id']              || uid();
obj['تاريخ_الإنشاء']   = obj['تاريخ_الإنشاء']   || new Date().toISOString();
```

This is independently consistent with Library having **no corresponding
`Code_v4.gs` sheet at all** (see §2.5 below) — there is no sheet-header
naming convention to reconcile against, unlike every synced entity so far.
`idField: 'id'` is configured accordingly, with a `_resolveId()` override
generating a local uid()-equivalent value only when `id` is absent on
`create()` — replicating `saveLibBook()`'s `|| uid()` fallback exactly,
the same override pattern used in every prior Repository (not imported
from any of them).

### §2.3 Validation — single required field, `العنوان`, trimmed

`Data_Schema_Specification_Report.md §4.8` lists a single Required Field:
`العنوان`. Direct inspection of the ACTUAL `saveLibBook()` confirms exactly
this:

```js
var t = document.getElementById('fLibTitle').value.trim();
if (!t) { toast('يرجى إدخال العنوان', 'error'); return; }
```

A single field, checked WITH `.trim()` — no discrepancy against the
planning report, and (since there is only one required field) no
trim/no-trim asymmetry question can even arise, unlike Fees (5.7). No
other field (`الرابط` included) is validated in any way by the live code —
confirmed by direct inspection, not merely assumed from
Data_Schema_Specification §4.8's "لا يوجد قيد خاص" (no special constraint)
claim for every other field.

### §2.4 Search — full-record `Object.values()` join, **including audit fields this time**

`Data_Schema_Specification_Report.md §4.8` states the Search Fields are
`العنوان` and `الوصف`. Direct inspection of the ACTUAL `renderLibrary()`
shows the claim UNDERSTATES the real behavior — the ninth consecutive
occurrence of this pattern since Cases (5.2):

```js
var t = Object.values(b).join(' ').toLowerCase();
return (!s || t.includes(s)) && (!cF || b['القسم'] === cF) && (!tF || b['النوع'] === tF);
```

This phase's own **OVERRIDES** section is explicit and literal about
`_matchesSearch()`: *"Current behavior must remain identical. Search
across ALL values using `Object.values(record)`. Exactly like
`library.js`."* This is a genuine, documented departure from the
convention every prior Repository (Cases through Documents) established:
each of those scoped its `_matchesSearch` override to a curated
legacy-field list that explicitly EXCLUDED the new audit/metadata fields
this Repository layer introduces (`createdAt`/`updatedAt`/`deletedAt`/
`version`/`syncVersion`/`checksum`). `LibraryRepository._matchesSearch`
does **not** exclude them — it calls `Object.values(record)` on the record
exactly as given, matching `renderLibrary()`'s own unscoped call literally,
per this phase's explicit instruction, which takes priority over the
audit-field-exclusion convention. A practical, verified consequence:
searching for a substring of a record's own `checksum` value now returns
that record — confirmed directly in the verification harness (`node
tests/verify_library_repository.js`, check "search() DOES match against
new audit/metadata fields too").

### §2.5 Filter — TWO live controls, one with a genuinely new dynamic-options mechanism

`Data_Schema_Specification §4.8` documents Filter Fields as `النوع` and
`القسم`. Direct inspection of `index.html` and `renderLibrary()` confirms
Library has **two** real, live filter controls today — more than any
prior entity except the two-control case already seen with Documents'
type dropdown plus its unwired case-number field:

- `#filterLibType` — a fixed-option `<select>`, `onchange="renderLibrary()"`,
  exact-equality against `النوع`. Same shape as every fixed-option dropdown
  seen in prior entities (Tasks' `#filterTaskPriority`, Documents'
  `#filterDocType`).
- `#filterLibCat` — **not** a fixed-option dropdown. Its `<option>` list is
  rebuilt on every `renderLibrary()` call directly from the current
  distinct `القسم` values present in `data.library` itself:
  `[...new Set(data.library.map(function(b){return b['القسم'];}).filter(Boolean))]`.
  This is a genuinely new mechanism relative to every static/predefined
  dropdown seen in Phases 5.2–5.8 — confirmed by direct inspection exactly
  as `NEXT_PHASE.md` flagged it should be. This dynamic-options mechanism
  is a rendering-time UI concern only: once a value is selected, the
  underlying filter semantics are still a plain exact-equality match
  (`!cF || b['القسم'] === cF`), so `LibraryRepository` requires no
  entity-specific override of the generic filter engine to support it —
  the additive `filter()` wrapper already handles both fields (and any
  other real field, e.g. `الرابط`) through the base class's generic
  range/equality engine, same pattern as every prior Repository.

The same non-existent `الحالة` (status) field gap seen in Fees/Documents
recurs identically for Library — no `الحالة` field exists anywhere
(absent from `LIBRARY_FIELDS`/`LIBRARY_MAP`, `index.html`, and — since
Library has no sheet at all — trivially absent from `Code_v4.gs` too).
Verified explicitly, as a graceful zero-match case, not assumed away.

### §2.6 Sort — purely additive

`Data_Schema_Specification §4.8` lists `العنوان` as the Sort Field. Direct
inspection of the ACTUAL current `renderLibrary()` shows no `.sort()` call
exists at all — library cards render in `data.library` insertion order
only, identical in kind to Children's (5.4), Tasks' (5.6), Fees' (5.7),
and Documents' (5.8) findings. The additive `sort()` method defaults to
`العنوان` ascending, a genuinely new capability with no existing behavior
to contradict.

### §2.7 Sync — confirmed Local-only-by-design, not a gap

`Data_Schema_Specification_Report.md §4.8` documents Library's Sync
Priority as **"معطَّل بالكامل تصميماً (Local-only-by-design)"** — fully
disabled BY DESIGN, explicitly distinct from a gap. This is independently
confirmed by `js/modules/library.js`'s own file-header comment ("GAS Sheet
name: none — Library has NO backend sync... Library data is local-only
(localStorage), by original design — confirmed by full-file scan") and by
direct inspection of `saveLibBook()`/`deleteLibBook()`, neither of which
calls `syncToSheets()`/`ApiService.syncRow()`/`ApiService.deleteData()` at
all. `Code_v4.gs`'s `SHEET_DEFS` was also directly inspected and confirmed
to contain no `'المكتبة'` (or equivalent) sheet entry whatsoever — Library
is not one of the seven sheet↔key pairs `ApiService.loadAllSheets()`/
`loadFromSheets()` handles (القضايا، الجلسات، الموكلين، الأطفال، المستندات،
المهام، الأتعاب). This is materially different from the
Documents/Tasks/Fees delete-sync GAPS (`PROJECT_STATE.md §11`) — those
entities DO have a real corresponding Sheet that create/update syncs to
but delete does not; Library has no corresponding Sheet at any point in
its lifecycle. `LibraryRepository` adds no Sync layer of any kind,
consistent with every prior Repository — it is a pure localStorage CRUD
layer.

### §2.8 `الرابط` field — no strict validation, confirmed

`NEXT_PHASE.md` flagged that `الرابط` is "مشابه لِـ `رابط_Drive` في
Documents — نص حر بلا تحقق صارم على الأرجح" and should be confirmed
directly before assumption. Direct inspection of `saveLibBook()` confirms
`الرابط` (populated via `collectForm('library')`, not read individually
like `fLibTitle` is) receives no validation of any kind — no URL-format
check, no required-ness check. `_validate()` in `LibraryRepository`
applies no rule to `الرابط`, matching this exactly.

---

## §3. What this file explicitly is not

- Does NOT modify `Repository.js`, `CasesRepository.js`,
  `ClientsRepository.js`, `ChildrenRepository.js`,
  `SessionsRepository.js`, `TasksRepository.js`, `FeesRepository.js`, or
  `DocumentsRepository.js`.
- Does NOT modify `library.js`, any other Module, `index.html`, any CSS,
  or `Code_v4.gs`.
- Is NOT wired into `index.html` — no `<script>` tag added.
- Does NOT implement IndexedDB, does NOT call `DatabaseService`/
  `ApiService`.
- Does NOT transfer any Business Logic (grid/card HTML rendering,
  Drive-link bar building, category-tab generation, modal wiring) out of
  `js/modules/library.js`.
- Does NOT add a Cache or Sync layer of any kind.

---

## §4. Verification summary

See `Library_Repository_Verification_Report.md` for full detail. Summary:
`node --check` clean on `LibraryRepository.js` and, unchanged, on
`Repository.js`, `CasesRepository.js`, `ClientsRepository.js`,
`ChildrenRepository.js`, `SessionsRepository.js`, `TasksRepository.js`,
`FeesRepository.js`, `DocumentsRepository.js`, and every other pre-existing
project JS file. **61/61** functional assertions passed via
`tests/verify_library_repository.js`, an independent fake in-memory
`localStorage` harness sharing no code with any prior Repository's
harness.

---

## §5. Ready for next phase

Per this phase's own instruction, Library Repository is complete and
self-contained. Return: **Library Repository — PASS — Ready For Templates
Repository.**
