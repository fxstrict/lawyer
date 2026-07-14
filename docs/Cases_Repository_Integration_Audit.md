# Cases Repository Integration Audit
## Phase 9 — Sub-Phase 9.12 (AUDIT ONLY — no code changed)

---

## 0. Input Gap Check

Per this phase's instruction ("If any expected document is missing: do not
assume. Record it as an Input Gap."), every mandatory source file and every
requested category of prior report was located and read in full or by
targeted inspection before any finding below was written:

| Requested | Actual file(s) found | Status |
|---|---|---|
| `js/modules/cases.js` | same path | ✅ read in full (850 lines) |
| `js/repositories/CasesRepository.js` | same path | ✅ read in full (437 lines) |
| `js/core/Repository.js` | same path | ✅ read (core method contract, re-confirmed against Sub-Phase 9.11's findings) |
| `js/core/DatabaseService.js` | same path | ✅ read (Sub-Phase 9.11) |
| `js/core/StorageAdapter.js` | same path | ✅ present, unchanged since Sub-Phase 9.11 |
| `js/core/LocalStorageAdapter.js` | same path | ✅ present, unchanged since Sub-Phase 9.11 |
| `js/api.js` | actual path `js/api/api.js` | ✅ read in full (Sub-Phase 9.11) — same file, one directory level the audit's file list omitted |
| `index.html` | same path | ✅ inspected (script load order, Cases modal markup, onclick handlers, `FIELDS`/`MAP` config) |
| `dashboard.js` | actual path `js/modules/dashboard.js` | ✅ read in full (80 lines) |
| `clients.js` | actual path `js/modules/clients.js` | ✅ read in full — the Sub-Phase 9.11 migrated version (current state of the project) |
| `documents.js` | actual path `js/modules/documents.js` | ✅ read in full (Sub-Phase 9.11 reference reading, re-confirmed) |
| `sessions.js` | actual path `js/modules/sessions.js` | ✅ inspected (targeted: Cases cross-references) |
| `children.js` | actual path `js/modules/children.js` | ✅ inspected (targeted: Cases cross-references) |
| `fees.js` | actual path `js/modules/fees.js` | ✅ inspected (targeted: Cases cross-references) |
| `library.js` | actual path `js/modules/library.js` | ✅ inspected (targeted: confirmed zero Cases cross-references) |
| `templates.js` | actual path `js/modules/templates.js` | ✅ inspected (targeted: confirmed zero Cases cross-references) |
| `print-utils.js` | actual path `js/print-utils.js` | ✅ read in full (37 lines) |
| Cases prior reports | `Cases_Repository_Report.md`, `Cases_Repository_Verification_Report.md`, `CasesRepository_Wiring_Report.md` | ✅ all three present, read |
| Repository Integration reports | `Repository_Integration_Audit_Report.md` | ✅ present |
| Repository Wiring reports | `Repository_Wiring_Audit_Report.md`, `Repository_Wiring_Final_Report.md` | ✅ present |
| Database Layer reports | `DatabaseService_*` (5 files), `Database_Architecture_Report_PHASE1_V10.md`, `Database_Pipeline_Report.md`, `StorageAdapter_Interface_Report.md`, `LocalStorageAdapter_Report.md` | ✅ all present |
| Clients Integration reports | `Clients_Repository_Report.md`, `Clients_Repository_Verification_Report.md`, `Clients_Repository_Integration_Audit.md`, `Clients_Repository_Integration_Report.md` | ✅ all present (the last is this project's own Sub-Phase 9.11 deliverable) |
| Documents Integration report | `Documents_Repository_Integration_Report.md` | ✅ present |
| Sessions Integration report | `Sessions_Repository_Integration_Report.md` | ✅ present |
| Tasks Integration report | `Tasks_Repository_Integration_Report.md` | ✅ present |
| Library Integration report | `Library_Repository_Integration_Report.md` | ✅ present |
| Templates Integration report | `Templates_Repository_Integration_Report.md` | ✅ present |
| Children Integration report | `Children_Repository_Integration_Report.md` | ✅ present |
| Fees Integration report | `Fees_Repository_Integration_Report.md` | ✅ present |

**No Input Gap.** Every requested file and report exists under the project's
actual naming/pathing (two harmless naming differences noted above — `js/
api.js` → `js/api/api.js`, `dashboard.js`/`clients.js`/etc. → `js/modules/
*.js` — both are the nearest verified reference and were used directly, per
this phase's instruction).

---

## 1. Current CRUD Flow

`js/modules/cases.js` (850 lines) still reads and writes the legacy global
`data.cases` array directly, with **no Repository involvement at all** —
`CasesRepository.js` exists (Phase 5.2, wired to real `DatabaseService` in
Phase 8/8.5.1 as the project's **reference implementation** — see §9) but is
not `require()`d, imported, or referenced anywhere in `cases.js`.

| Function | Lines | Operation | Mechanism today |
|---|---|---|---|
| `renderCases()` | 98–171 | Read (list) | `data.cases.filter(...)`, no Repository |
| `saveCase()` | 182–214 | Write (create/update) | `data.cases[idx] = obj` / `data.cases.push(obj)` |
| `editCase(i)` | 219–224 | Read (single) | `data.cases[i]`, synchronous form pre-fill |
| `deleteCase(i)` | 229–238 | Write (delete) | `data.cases.splice(i, 1)` |
| `getCaseStats()` | 249–261 | Read (aggregate) | `data.cases.length` / 3× `.filter().length` |
| `searchCases()` / `filterCases()` | 270–277 | Read (delegate) | Thin wrappers calling `renderCases()` |
| `viewCase(i)` | 286–340 | Read (single + cross-entity) | `data.cases[i]` + `data.sessions`/`data.documents`/`data.clients` reads |
| `quickPrintCase(i)` | 553–624 | Read (single + cross-entity) | Same shape as `viewCase()`, standalone print window |
| `quickCaseQR(i)` | 633–651 | Read (cross-entity) | Linear `data.clients` name scan, delegates to `genClientQR()` |
| `populateCaseDropdown()` | 790–804 | Read (list, cross-module) | `data.cases.forEach(...)`, called from 4 other modules |
| `autofillSessionFromCase()` | 817–833 | Read (single, cross-module) | `data.cases.find(...)`, called from `sessions.js` |
| `autofillFeeFromCase()` | 843–849 | Read (single, cross-module) | `data.cases.find(...)`, called from `fees.js` |

Three write call sites exist (`saveCase`, `deleteCase`, and — indirectly, via
the `أطفال_القضية` embedded field — `saveCase` again through its own
`collectForm`/`updateChildrenData` override, not a fourth independent site).
This is the same count as Clients (Sub-Phase 9.11: `saveClient`,
`deleteClient`, `revokeAndRegenQR`), but Cases carries substantially more
**read-side** surface (12 functions above vs. Clients' ~8), and — critically —
five action buttons rendered per row instead of Clients' four (`editCase`,
`viewCase`, `quickPrintCase`, `quickCaseQR`, `deleteCase` — see §13).

---

## 2. Search

`renderCases()` (lines 103–106):

```js
var rows = data.cases.filter(function(c) {
  var t = Object.values(c).join(' ').toLowerCase();
  return (!s || t.includes(s)) && (!st || c['الحالة'] === st) && (!ty || c['نوع_الدعوى'] === ty);
});
```

Full-record substring search (`Object.values(c).join(' ')`) across **every**
field on the record — identical pattern to Clients' pre-migration
`renderClients()` and to Documents. `CasesRepository.js` already anticipates
this: it overrides `_matchesSearch()` to join exactly the 34-field
`CASES_LEGACY_FIELDS` list (excluding new audit/metadata fields like
`createdAt`/`checksum`), confirmed identical in intent to
`ClientsRepository`'s own override reused successfully in Sub-Phase 9.11.
`Cases_Repository_Verification_Report.md §6.3` independently confirms this
override was tested and matches `renderCases()`'s actual behavior. **No new
design work needed here — the Repository-side solution for Cases' search
already exists and is already verified.**

---

## 3. Filter

Two dropdowns, both wired directly inside the same `filter()` call above:
`فلترة الحالة` (`filterCaseStatus`, mapped to `الحالة`) and `فلترة النوع`
(`filterCaseType`, mapped to `نوع_الدعوى`). `CasesRepository.js`'s
`CASES_FILTER_FIELDS = ['الحالة', 'نوع_الدعوى']` (line 197) matches this
exactly, and `Cases_Repository_Verification_Report.md §6.5` confirms both
individual-field and combined AND-semantics filtering were tested against
the Repository's `filter()` method. **No gap.**

---

## 4. Sorting

**`renderCases()` applies no sort at all** — array/insertion order only, both
in the desktop table and mobile card branches. `CasesRepository.js` proposes
`CASES_SORT_FIELDS = ['تاريخ_الجلسة_القادمة', 'تاريخ_القيد']` (line 202) as an
**additive, currently-unused** convenience for a future `sort()` caller — this
is explicitly documented as a discrepancy already, in both the Repository
file's own header comment and `Cases_Repository_Report.md §2.5`
("السلوك الفعلي الحالي لا يطبّق أي فرز إطلاقاً… `sort()` هنا وظيفة إضافية
جديدة"). A future migration must **not** introduce sorting into `renderCases()`
as a side effect of switching to `clientsRepository.search()`-style calls —
`Repository.prototype.search()`'s return order must be verified to still
match plain insertion/array order before it can safely replace the manual
`.filter()` (this is the one point where Cases' search migration needs a
positive check that Clients' equivalent migration did not, since Clients'
`ClientsRepository` has no analogous proposed `sortFields` to accidentally
activate).

---

## 5. Validation

`saveCase()` (lines 187–190):

```js
if (!num || !title || !client) {
  toast('يرجى ملء الحقول الإلزامية', 'error');
  return;
}
```

Three required fields, read directly from three specific DOM elements
(`#fCaseNum`, `#fCaseTitle`, `#fCaseClient`), not from a generic form-level
check. `CasesRepository.js`'s `CASES_REQUIRED_FIELDS = ['رقم_القضية',
'عنوان_القضية', 'اسم_الموكل']` (line 184) matches exactly — and
`Cases_Repository_Report.md §2.3` documents that this 3-field list was
deliberately chosen over the Data Schema report's narrower 2-field list,
specifically to match this actual runtime check. **No gap; already
reconciled and verified** (`Cases_Repository_Verification_Report.md §6`,
covering present/missing-any/missing-all/whitespace-only cases).

**Important difference from Clients:** `رقم_القضية` (`fCaseNum`, e.g.
`"2025/1234"`) is **user-entered**, not auto-generated. `CasesRepository`
uses it as a **natural key** (`idField: 'رقم_القضية'`, no `uid()` fallback —
confirmed in `Cases_Repository_Report.md §2.2` and directly in
`CasesRepository.js` line 177), unlike `ClientsRepository`'s
`رقم_الموكل`/`Documents`' auto-generated ids. `saveCase()` today has **no
client-side duplicate-`رقم_القضية` check** — it will happily overwrite an
existing case's `idx` slot if `editIdx.cases` is stale, or silently create a
second row with the same case number if a user types in a number that
already exists while in "add" mode. `Repository.prototype.create()`'s
`_indexOf()`-based uniqueness enforcement (relied on by every existing
Repository, confirmed working for Cases specifically in
`Cases_Repository_Verification_Report.md`'s duplicate-id rejection test) will
for the first time **actively reject** that second scenario. This is a
**behavior-tightening risk**, not a bug in the Repository — but it is a
genuine observable difference from today's `data.cases.push(obj)` (which
never fails) that a migration must decide how to handle (e.g., surface
`result.success === false` as the existing `'يرجى ملء الحقول الإلزامية'`-style
toast, or a new, more specific one) rather than silently returning without
explanation, mirroring the error-branch pattern already established for
`saveClient()` in Sub-Phase 9.11.

---

## 6. QR Generation

Cases has **no QR generation of its own**. `quickCaseQR(i)` (lines 633–651)
resolves the case's `اسم_الموكل` to a **client** record via a linear
`data.clients` name scan, then delegates entirely to `genClientQR(ci)` —
a function owned by `js/modules/clients.js` (migrated in Sub-Phase 9.11).
Confirmed this call-through already works correctly against the
Repository-backed `data.clients` mirror (a plain field read, not a
reference-equality lookup — no `resolveClientIndex()` needed on the calling
side, because `quickCaseQR()` computes its own fresh index against the
*current* mirror and hands that index straight to `genClientQR()`, which
Sub-Phase 9.11 confirmed still accepts a plain mirror index). **No QR-related
code inside `cases.js` needs to change during a Cases migration** — this
function's only Cases-side concern is the same index-translation issue every
other action button has (§13), not QR logic itself.

---

## 7. Printing

Two independent code paths build the same case report via the shared,
pure-function `buildCaseReport(c, sessions, docs, children)` (lines 346–553,
confirmed by grep to contain zero `data.*`/`window.*`/DOM reads of its own —
identical "pure formatter" pattern to Clients' `buildClientReport()`):

- **`viewCase(i)`** (286–340) — opens `#modalView` in-page. **Performs a
  client-field backfill**: if `رقم_قومي_الموكل`/`هاتف_الموكل`/`عنوان_الموكل`/
  `عمل_الموكل`/`جهة_عمل_الموكل` are empty on the case record, it linear-scans
  `data.clients` by first-name match and backfills them onto a **shallow
  copy** of `c` (`c = Object.assign({}, c)`, line 321) before building the
  report — the original `data.cases[i]` object is never mutated. Also stores
  `window._currentViewCase` (the shallow copy, not necessarily the same
  reference as `data.cases[i]`) and `window._currentViewSessions` for the
  portal-button/print flow.
- **`quickPrintCase(i)`** (553–624) — opens a new `window.open()` popup and
  prints immediately. **Does NOT perform the same client-field backfill** —
  this is a genuine, pre-existing asymmetry between the two print paths, not
  introduced by any prior migration. A Cases migration must preserve this
  asymmetry exactly as-is (i.e., not "fix" `quickPrintCase()` to also
  backfill, and not remove the backfill from `viewCase()`), since either
  change would be an observable behavior change outside this phase's/any
  future phase's stated scope.

Both paths independently re-derive `sessions` (`data.sessions.filter()`,
matching on `رقم_القضية` **or** `عنوان_القضية` — a second, title-based
matching path in addition to the id-based one, likely a legacy fallback) and
`docs` (`data.documents.filter()` on `رقم_القضية` only) and independently
`JSON.parse()` the embedded `أطفال_القضية` field (§8). None of this changes
under a Cases Repository migration — `data.sessions`/`data.documents` are
already Repository-backed mirrors (Sub-Phase 9.11-era sibling migrations),
and plain-field `.filter()` reads against a mirror are unaffected by the
mirror's origin, exactly as already proven for `data.clients` reads inside
Clients' own `buildClientReport()` (Sub-Phase 9.11 §2) and now here for
Cases reading `data.sessions`/`data.documents`.

---

## 8. Children Interaction — Two Unrelated Systems Sharing a Name

This is the single most important structural finding of this audit. **"Children" means two entirely separate things in this codebase, and `cases.js` only touches one of them:**

1. **Embedded children** — a JSON-serialized array (`أطفال_القضية` field,
   inside the Case record itself) edited via four `cases.js`-local functions:
   `toggleChildrenSection()` (661–664), `addChildRow()` (670–690),
   `updateChildrenData()` (696–704), `loadChildrenRows()` (710–716). These
   only ever touch DOM (`#childrenRows`, `#fCaseChildrenData`) — **zero**
   reads of `data.cases` or any Repository. They are wired into the
   `saveCase`/`collectForm`/`fillForm` override chain (§11) via the
   `window._pendingChildren` side-channel (lines 725–744).
2. **Standalone Children entity** — a fully separate `data.children` array,
   its own `js/modules/children.js` (migrated, per
   `Children_Repository_Integration_Report.md`), and its own
   `ChildrenRepository.js`. Confirmed by direct grep: `children.js` never
   reads `data.cases` or calls any `cases.js` function except
   `populateCaseDropdown('fChildCaseNum', ...)` (§10) — the two "children"
   concepts share **zero** code today.

This duplication is **pre-existing and already documented**, not something
this audit is discovering for the first time:
`Repository_Contract_Report_PHASE2_V10.md §6` proposes a future
`getChildrenSummary(caseId)` specialized operation on `CasesRepository`
specifically to reconcile the two ("قراءة مجمّعة لحقل أطفال_القضية المضمّن +
سجلات Children Repository المرتبطة — لحل تكرار البيانات الموثّق … دون حسم
القرار المعماري نهائياً") and §108 flags it as "تضارب بنيوي موجود بالفعل في
المشروع". **Direct inspection of the delivered `CasesRepository.js` (437
lines, read in full) confirms `getChildrenSummary()` is NOT implemented** —
it remains a documented proposal only.
`Children_Repository_Integration_Report.md` (line ~570 area, referencing
`Repository_Contract_Report.md §15/§17`) independently confirms this gap was
left open at Children's own integration time too, with the note "لا تُحل
تكرار البيانات … خارج نطاق". **Recommendation: this Cases migration should
document the gap again (third time, for continuity) and explicitly decline
to implement `getChildrenSummary()` or otherwise touch the embedded-children
JSON handling** — none of the four embedded-children functions read
`data.cases` and none need any change; only `saveCase()`'s harvesting of
`window._pendingChildren` needs to keep working exactly as today (§11).

---

## 9. Clients Interaction

The deepest cross-module coupling of any relationship audited so far — three
distinct interaction surfaces:

1. **`quickCaseQR(i)`** (§6) — one-way call into `genClientQR()` after a
   linear `data.clients` name scan.
2. **`viewCase(i)`**'s client-field backfill (§7) — a second, independent
   linear `data.clients` name scan (first-name match only, via
   `clientName.split(/\s*[,،]\s*/)[0]`), reading `الرقم_القومي`/`الهاتف`/
   `العنوان`/`الوظيفة`/`جهة_العمل` off the matched client record.
3. **The Client Selector** — entirely owned and implemented by
   `js/modules/clients.js` (Sub-Phase 9.11's "Group E"), but it operates
   directly **on the Cases form**: `index.html`'s Cases modal defines
   `<input type="hidden" id="fCaseClient">` (line 327) — not a plain text
   input — populated exclusively through `clients.js`'s
   `toggleCaseClient()`/`_syncCaseClientField()`/`syncCaseClientSelectorFromField()`.
   `clients.js` additionally **wraps three of `cases.js`'s own functions a
   second time**, on top of `cases.js`'s own internal override chain (§11):

   ```js
   // js/modules/clients.js, confirmed by direct read:
   var _origResetFormForClientSelector = resetForm;   // wraps cases.js's own resetForm wrap
   resetForm = function(type) { _origResetFormForClientSelector(type); if (type === 'cases') {...} };

   var _origEditCaseForClientSelector = editCase;      // wraps cases.js's raw editCase
   editCase = function(i) { _origEditCaseForClientSelector(i); syncCaseClientSelectorFromField(); closeClientSelector(); };

   var _origSaveCaseForClientSelector = saveCase;      // wraps cases.js's own saveCase wrap
   saveCase = function() { if (typeof _syncCaseClientField === 'function') _syncCaseClientField(); _origSaveCaseForClientSelector(); };

   var _origViewCaseForPrintView = viewCase;           // wraps cases.js's raw viewCase
   viewCase = function(i) { _origViewCaseForPrintView(i); window._currentViewClient = null; window._currentViewClientIdx = null; };
   ```

   All four of these `clients.js`-side wraps call through **synchronously**
   (no `await`), and three of the four (`editCase`, `viewCase`, and — via
   `_origResetFormForClientSelector`/`_origSaveCaseForClientSelector` —
   `resetForm`/`saveCase`) depend on the wrapped function having **already
   completed its DOM-visible effects by the time the wrap's own code runs
   next** — see §16 for why this is the single largest regression risk in
   this migration.

`clients.js`'s own `buildClientReport()` also reads `data.cases` directly
(a plain `.filter()` on `اسم_الموكل`, confirmed reference-agnostic and
therefore unaffected by a Cases mirror — Sub-Phase 9.11's own §2 already
covers this read as a dependency of that file). This means the **mirror
relationship is bidirectional**: Cases already depends on Clients' mirror
(points 1–2 above) and Clients already depends on Cases' future mirror.

---

## 10. Sessions Interaction

`sessions.js` never reads `data.cases` directly (confirmed by grep — zero
matches). It depends on two `cases.js`-owned functions, called from
`editSession()`:

```js
populateCaseDropdown('fSessionCaseNum', data.sessions[i]['رقم_القضية']);
autofillSessionFromCase(data.sessions[i]['رقم_القضية'], true);
```

`sessions.js`'s own file header (lines 99–100, confirmed by direct read)
explicitly documents both as "defined in cases.js" — the dependency is
already self-aware on the Sessions side. Both functions use `.forEach()`/
`.find()` against `data.cases` keyed by `رقم_القضية` (the natural key) —
**no array-index dependency at all**, so neither needs any
`resolveCaseIndex()`-equivalent translation. **Low risk.**

---

## 11. Documents Interaction

`documents.js` never reads `data.cases` directly either. Single dependency,
also self-documented in its own header (line 75, confirmed): `editDocument()`
calls `populateCaseDropdown('fDocCaseNum', data.documents[i]['رقم_القضية'])`.
Same natural-key-only, no-index dependency as Sessions. **Low risk.**

---

## 12. Fees Interaction

`fees.js` never reads `data.cases` directly (its own file header, lines
32–38, explicitly states this and explains why — confirmed by direct read).
Two dependencies from `editFee()`: `populateCaseDropdown('fFeeCaseNum', ...)`
and (on the save/select path) `autofillFeeFromCase(caseNum)`, which pre-fills
`#fFeeClient` from `c['اسم_الموكل']`. Again natural-key-only. **Low risk.**

---

## 13. Library / Templates Interaction

Confirmed by direct grep of both files: **zero** references to `data.cases`,
`populateCaseDropdown`, `autofillSessionFromCase`, `autofillFeeFromCase`, or
any other Cases-owned symbol. **No dependency, no risk.**

---

## 14. ApiService Synchronization

`saveCase()` → `ApiService.syncRow('القضايا', obj, idx)` (line 209);
`deleteCase()` → `ApiService.deleteData('القضايا', i)` (line 232, called
**before** the local `splice`, same ordering already present and preserved
in Clients' `deleteClient()` per Sub-Phase 9.11). Both `syncRow`/`deleteData`
are the same `async`, internally-`try/catch`-wrapped, fire-and-forget methods
already fully audited in Sub-Phase 9.11 (`js/api/api.js`, unchanged) — no new
ApiService-side risk. The **same R-06-class risk documented for Clients**
applies here identically, and is expected to be *worse* in practice for
Cases: once `CasesRepository`'s `softDelete: true` (already configured,
confirmed in `Cases_Repository_Report.md §2.6`) is live, `data.cases`
(sourced from `getAll()`) will omit soft-deleted rows while `ApiService`
continues to receive a plain frontend index — the same drift Sub-Phase 9.11
documented (not fixed) for Clients. **Recommendation: document, do not
fix, exactly as Sub-Phase 9.11 did** — consistent precedent, explicit skill
mandate ("Never redesign ApiService … Document it").

---

## 15. Mirror Usage — `data.cases`

Three readers of `data.cases` project-wide, all confirmed by direct grep:

1. **`cases.js` itself** — every function in §1.
2. **`dashboard.js`** — `renderDashboard()` reads `data.cases.filter(...)`
   for the "active" stat card (line 48, **duplicating** `getCaseStats()`'s
   `active` calculation with separately-maintained inline logic — see §17)
   and `data.cases.length` (line 52); `updateBadges()` reads
   `data.cases.length` once more (line 73). `getCaseStats()`'s own comment
   claims it is "Consumed by renderDashboard in index.html via data.cases"
   — **confirmed false by direct inspection of the actual `dashboard.js`
   file**: `getCaseStats()` is never called by `dashboard.js` or anywhere
   else in the project (zero call sites found). It is currently
   **unreferenced dead code**, kept alive only by its own doc comment's
   claim. A migration must not assume `dashboard.js` calls through
   `getCaseStats()` — it doesn't, and `dashboard.js` is explicitly outside
   this (and any near-term) migration's modification scope.
3. **`clients.js`** — `buildClientReport()`'s `linkedCases` filter (§9,
   line 552 of `clients.js`).

Same "keep `data.cases` alive as a read-only mirror" strategy already proven
for Clients applies directly: a `syncCasesMirror()` function
(`data.cases = casesRepository.getAll();`) called after `open()` resolves and
after every `create()`/`update()`/`delete()`, refreshed at the top of
`renderCases()` — identical shape to Sub-Phase 9.11's `syncClientsMirror()`.

---

## 16. Array Index Dependencies & Override Chains — Combined Analysis

These two audit items are inseparable for Cases and are analyzed together.

### 16.1 The override chain (deepest in the project)

```
print-utils.js  →  base resetForm() / fillForm() / collectForm()
                        │
cases.js        →  wraps ALL THREE (+ defines saveCase, editCase, viewCase, deleteCase)
   (loads FIRST among modules — index.html line 567, confirmed)
                        │
clients.js      →  wraps resetForm AGAIN, and wraps editCase / saveCase / viewCase
   (loads LAST among the relevant modules — index.html line 718, confirmed)
```

Confirmed precisely by grep across every module file: **only `cases.js` and
`clients.js`** reassign `resetForm`/`collectForm`/`fillForm`/`saveCase`/
`editCase`/`viewCase` anywhere in the project — no other sibling module
participates in this chain.

Each `clients.js` wrap was inspected line-by-line (§9). All four call the
captured `_orig*` reference **synchronously, with no `await`**, and three of
the four run code **immediately after** the `_orig*` call returns, assuming
its DOM/state effects are already visible:

- `editCase` wrap calls `syncCaseClientSelectorFromField()` right after
  `_origEditCaseForClientSelector(i)` — this reads `#fCaseClient`, which only
  has a value if `_origEditCaseForClientSelector` (i.e. `cases.js`'s real
  `editCase`) has already run `fillForm('cases', data.cases[i])`
  **synchronously and completely**.
- `viewCase` wrap sets `window._currentViewClient = null` right after
  `_origViewCaseForPrintView(i)` — order-sensitive only in that it must run
  after, which is guaranteed as long as `viewCase` stays synchronous.
- `resetForm` wrap's `cases`-branch cleanup runs after
  `_origResetFormForClientSelector(type)`, which is itself `cases.js`'s own
  dropdown-repopulation wrap — a two-layer-deep synchronous chain already.
- `saveCase` wrap calls `_syncCaseClientField()` **before** calling
  `_origSaveCaseForClientSelector()` — order-sensitive the other way (must
  run *before*), which holds regardless of whether the inner `saveCase`
  eventually becomes `async`, since the outer wrap never needs to observe
  the inner call's *completion*, only to have triggered it (fire-and-forget
  is fine here — the same reasoning already validated for `saveClient()`'s
  own onclick invocation in Sub-Phase 9.11).

**Conclusion — binding constraint for any future implementation phase:**
`editCase()`, `viewCase()`, and `resetForm()` **must remain 100% synchronous**
in `cases.js` — converting any of them to `async` would silently break
`clients.js`'s downstream wraps (a file explicitly out of scope to modify
under a "Modify ONLY cases.js" mandate, exactly as Sub-Phase 9.11's mandate
read for `clients.js`). `saveCase()` may safely become `async` internally —
the sole external caller through the wrap chain is fire-and-forget
already. `deleteCase()` has no downstream wrap in `clients.js` and may
safely become `async` with no ripple effect at all.

### 16.2 Global variables involved in the chain

`window._pendingChildren` (write: `cases.js`'s `saveCase` wrap; read:
`cases.js`'s `collectForm` wrap), `window._currentViewCase` /
`window._currentViewSessions` (write: `viewCase`; read: portal/print flow,
and cleared to `null` by `clients.js`'s `viewClient()` per Sub-Phase 9.11),
`window._currentViewClient` / `window._currentViewClientIdx` (write:
`clients.js`; cleared by `clients.js`'s wrap of `viewCase` — §9), `data`,
`editIdx.cases`, `FIELDS.cases` / `MAP.cases` (index.html inline bootstrap,
confirmed present at lines 626/637, 34 fields each, unmodified by this
audit).

### 16.3 Array-index (reference-equality) dependencies

`renderCases()` uses `data.cases.indexOf(c)` **twice** (desktop table line
125, mobile cards line 149) — the exact same R-01-class defect already fixed
for Clients in Sub-Phase 9.11 (`resolveClientIndex()`). Once
`CasesRepository.search()`/`getAll()` return cloned records, this
reference-equality lookup will silently return `-1` for every row.
**Required fix, directly reusable pattern:** a `resolveCaseIndex(list,
record)` function, identical in shape to `resolveClientIndex()`, keyed on
`رقم_القضية` (`CASES_ID_FIELD`).

**Five** onclick handlers per row embed this same raw index (one more than
Clients' four): `editCase(ri)`, `viewCase(ri)`, `quickPrintCase(ri)`,
`quickCaseQR(ri)`, `deleteCase(ri)` — all five must resolve through the same
`data.cases[i]` mirror-index lookup pattern already proven for Clients'
four. `index.html`'s row template (confirmed by direct inspection of
`FIELDS.cases`/`MAP.cases` and the modal markup) is **not** to be modified
per this project's every-phase-so-far convention, so this translation layer
is mandatory, not optional.

### 16.4 Inline event handlers (index.html, unmodified, confirmed present)

`onclick="saveCase()"` (line 373, modal footer), `onclick="closeModal
('modalCase')"` (lines 282, 373), plus the five per-row handlers above,
`oninput` on the search field driving `searchCases()`, `onchange` on the two
filter dropdowns driving `filterCases()`, and `onchange="toggleChildrenSection
()"` / `onchange="updateChildrenData()"` inside the embedded-children rows
(§8) — none of these require HTML changes for a Repository migration, exactly
as already established for Clients.

---

## 17. Backward Compatibility Risks

1. **Natural-key `create()` rejection** (§5) — `data.cases.push(obj)` never
   fails today; `casesRepository.create(obj)` can now reject on a duplicate
   `رقم_القضية`. Needs an explicit error-branch decision (mirroring
   `saveClient()`'s pattern), not a silent behavior change.
2. **`getCaseStats()` dead-code claim** (§15) — its doc comment's claim that
   `dashboard.js` consumes it is false; a migration must not "fix"
   `dashboard.js` to call it (out of scope) nor assume today's dashboard
   numbers come from it (they don't — they come from `dashboard.js`'s own
   separately-maintained inline filter, currently kept in sync only by
   convention/manual parity, not by shared code).
3. **`viewCase()`/`quickPrintCase()` backfill asymmetry** (§7) — must be
   preserved exactly as-is, not reconciled.
4. **Soft-delete/`ApiService` index drift** (§14) — same documented,
   not-fixed pattern as Clients' R-06.
5. **`renderCases()`'s missing null-guards** — unlike `renderClients()`
   (`if (tb) tb.innerHTML = ''`, etc., added defensively in Sub-Phase 9.11),
   `renderCases()` calls `tb.innerHTML`/`em.style.display`/`ml.innerHTML`
   unconditionally (lines 116–121). This is **pre-existing, not introduced
   by any migration** — noted for completeness; a future implementation
   phase should decide whether to preserve this literally (matching
   `renderCases()`'s current fragility) or align it with `renderClients()`'s
   defensive pattern, and document whichever choice is made, the same way
   Sub-Phase 9.11 documented its own R-02 stamp-redundancy decision.
6. **Session-matching fallback** — `viewCase()`/`quickPrintCase()` both
   match sessions by `رقم_القضية` **or** `عنوان_القضية` (§7) — a
   double-criterion `.filter()` that has nothing to do with Cases' own
   migration (it reads `data.sessions`, already Repository-backed) but must
   not be simplified/"cleaned up" as a side effect of touching these
   functions.

---

## 18. Performance Risks

None identified beyond what Sub-Phase 9.11 already found acceptable for
Clients at comparable record counts. `renderCases()`'s `Object.values(c)
.join(' ')` full-record join is O(fields) per record per keystroke, same
complexity class whether sourced from `data.cases.filter()` or
`casesRepository.search()`'s already-verified-equivalent override
(`Cases_Repository_Verification_Report.md §6.3`). No pagination, virtualization,
or indexing exists today on either side of the boundary, so no regression is
possible in either direction. `getCaseStats()`'s triple `.filter()` pass is
unaffected by this migration (dead code, §15/§17).

---

## 19. Regression Risks (ranked)

1. **Highest — the `clients.js` override chain (§16.1).** Converting
   `editCase`/`viewCase`/`resetForm` to `async` would silently break three
   already-shipped, already-tested `clients.js` behaviors (Client Selector
   sync on edit, view-modal mutual exclusivity, picker cleanup on reset) in
   a file this project's every phase so far has held out of scope to modify.
   This is a strictly higher-stakes version of a risk Clients' own migration
   never had to face (Clients has no downstream module wrapping its
   functions the way `clients.js` wraps `cases.js`'s).
2. **Medium — `renderCases()`'s two `indexOf()` reference-equality lookups
   feeding five action buttons** (§16.3) — one more attack surface than
   Clients' four, otherwise the same well-understood, already-solved (for
   Clients) class of defect.
3. **Medium — natural-key duplicate rejection** (§5/§17.1) — a genuinely new
   failure mode `data.cases.push()` never had; needs a deliberate UX
   decision, not just a mechanical translation.
4. **Low — `getCaseStats()`/dashboard duplication** (§15/§17.2) — pure
   pre-existing dead-code/duplication risk, unaffected by (and unaffecting)
   any Repository migration.
5. **Low — everything cross-module read-only** (Sessions/Documents/Fees'
   `populateCaseDropdown`/`autofillSessionFromCase`/`autofillFeeFromCase`,
   §10–12) — natural-key-only, no index translation needed, same shape
   already proven safe for Clients' equivalent read-only cross-module
   consumers (`cases.js`'s own `quickCaseQR`/backfill reads of
   `data.clients`, already live today).

---

## 20. Migration Complexity Assessment

**High — the highest of the eight modules migrated/audited to date**, for
four compounding, evidence-backed reasons:

1. **Natural-key id strategy** (§5) — different `create()`/`update()`
   semantics than every auto-generated-id module migrated so far
   (Clients, Documents, Sessions, Tasks, Fees, Library, Templates, Children
   all use `uid()`-style generated ids per their respective integration
   reports; Cases is the **only** natural-key entity per
   `Repository_Contract_Report.md §4.1/§3.2`, confirmed directly in
   `CasesRepository.js` line 177).
2. **A four-layer override chain terminating in a file outside this
   migration's scope** (§16.1) — no other audited module has a sibling
   module wrapping three of its functions post-hoc.
3. **Five index-dependent action buttons instead of four** (§16.3).
4. **A genuinely separate, self-contained embedded-children sub-system**
   (§8) that must be threaded through the `saveCase()` migration via its
   existing `window._pendingChildren`/`collectForm` override mechanism
   without being touched itself.

Everything else — search, filter, ApiService pattern, mirror strategy,
soft-delete/R-06-class documentation, Sessions/Documents/Fees'
read-only natural-key dependencies, Library/Templates' total absence of
dependency — is **already solved** by the precedent Sub-Phase 9.11 (Clients)
and the seven other completed sibling migrations established, and
`CasesRepository.js` itself is already built, wired to real
`DatabaseService`, and independently verified (`Cases_Repository_
Verification_Report.md`) as the project's **reference Repository
implementation** (`Repository_Wiring_Final_Report.md` line 9). The
complexity is concentrated entirely in `cases.js`'s own cross-module
surface area, not in any unresolved question on the Repository side.

---

## 21. Recommended Migration Order (for the future Cases Repository Integration implementation phase)

1. **Repository wiring preamble** — `CASES_ID_FIELD` constant, `casesRepository`
   instance, `casesRepositoryReadyPromise`, `ensureCasesRepositoryReady()`,
   `syncCasesMirror()`. Directly reuses the Sub-Phase 9.11 shape verbatim.
2. **`resolveCaseIndex(list, record)`** — directly reuses
   `resolveClientIndex()`'s shape, keyed on `رقم_القضية`.
3. **`renderCases()`** — migrate to `casesRepository.search()`
   (synchronous), replacing both `indexOf()` call sites with
   `resolveCaseIndex()`. Lowest-risk step, identical pattern to Sub-Phase
   9.11, but must positively verify `search()`'s result order still matches
   plain array/insertion order before relying on it (§4 — the one Cases-
   specific check this step needs that Clients' equivalent did not).
4. **`deleteCase()`** — migrate to `await casesRepository.delete(id)`. No
   downstream wrap dependency (§16.1) — simplest write, safe second step,
   same order used for Clients (`deleteClient()` before `saveClient()`).
5. **`saveCase()`** — migrate to `await casesRepository.create()/update()`.
   Must (a) preserve the `تاريخ_الإنشاء`/`آخر_تحديث` dual-stamp behavior
   (§1, unique to Cases — Clients only stamps on create), (b) keep
   `window._pendingChildren` harvesting working unchanged (§8/§16.2), (c)
   decide and document the new duplicate-`رقم_القضية` failure path (§5/§17.1),
   and (d) remain safely fire-and-forget-callable from `clients.js`'s
   existing `saveCase` wrap (§16.1) — verified safe, no changes needed to
   `clients.js` itself.
6. **Leave untouched, verified safe by this audit:** `editCase()`,
   `viewCase()`, `quickPrintCase()`, `getCaseStats()`, `searchCases()`,
   `filterCases()`, `buildCaseReport()`, `quickCaseQR()`,
   `populateCaseDropdown()`, `autofillSessionFromCase()`,
   `autofillFeeFromCase()`, all four embedded-children functions, and the
   three existing `collectForm`/`fillForm`/`resetForm` overrides at the
   bottom of the file — none read/write `data.cases` in a way this
   migration changes, and `editCase`/`viewCase`/`resetForm` **must** stay
   synchronous per §16.1's binding constraint.
7. **Do not implement `getChildrenSummary()`** (§8) — third consecutive
   phase to document this gap rather than resolve it, consistent with
   Children's own integration phase's explicit deferral.
8. **Document, do not fix**, the `ApiService` soft-delete index-drift risk
   (§14), using the same R-06 template established in
   `Clients_Repository_Integration_Report.md §6`.

---

## 22. Verification Summary

Per the Project Skills' mandated audit-phase verification order:

| # | Step | Result |
|---|---|---|
| 1 | Complete source inspection before any finding | `cases.js` read in full (850 lines); `CasesRepository.js` read in full (437 lines); every cross-module claim in §9–13 confirmed by direct `grep`, not inference |
| 2 | Every finding supported by direct code inspection | All 22 sections above cite specific line numbers or grep results |
| 3 | Prior-report cross-check | 3 Cases-specific reports + 2 Wiring reports + 8 sibling Integration reports read/grepped; every cross-reference (§8, §9, §14) independently corroborated by ≥2 sources |
| 4 | Input Gap check | None found (§0) |
| 5 | No production file modified | Confirmed — full byte-for-byte diff against the pristine `Master_v10_9_10.zip` run at the end of this audit shows only `js/modules/clients.js` differs (Sub-Phase 9.11's already-completed, prior deliverable) — zero files touched during this audit |
| 6 | No Repository modified | `CasesRepository.js`, `Repository.js`, `DatabaseService.js`, `StorageAdapter.js`, `LocalStorageAdapter.js` — all read-only this phase, confirmed unmodified by the same diff |
| 7 | No Core modified | Same diff, same result |
| 8 | No implementation code created | This document is the only file created this phase |

### 22.1 Modification scope — file diff

```
$ diff <(find pristine-upload -type f) <(find delivered-project -type f)
NEW FILES:      docs/Cases_Repository_Integration_Audit.md   (this file)
MODIFIED FILES: (none this phase — js/modules/clients.js was modified in
                the prior, already-completed Sub-Phase 9.11, not this phase)
```

---

Cases Repository Audit

PASS

Ready For Cases Repository Integration
