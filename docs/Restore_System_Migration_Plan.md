# Restore_System_Migration_Plan.md
## PHASE 10 — SUB-PHASE 10.1 — خطة التنفيذ المرحلية لـ Restore (T-01)
### Audit + Design Only — لا كود، لا Patch، لا Diff، لا تنفيذ

هذا الملف يبني على `Restore_System_Design.md` (الأسئلة 1–13) و`Restore_System_Architecture.md` (الأسئلة 14–25) ليضع **خطة تنفيذ مرحلية آمنة**، متوافقة مع Repository Migration Standard وEngineering Audit Standard وVerification & QA Standard، لتحويل هذا التصميم إلى كود فعلي في مراحل لاحقة (10.2 وما بعدها) — **دون تنفيذ أي منها الآن**.

---

## 1. المبدأ الحاكم للخطة

بحسب تحليل الأثر في `Restore_System_Architecture.md`، التغيير الفعلي المطلوب محصور بالكامل في **ملف واحد**: `js/core/Repository.js`. كل الطبقات الأخرى (DatabaseService, StorageAdapter, LocalStorageAdapter, الـ 9 Repositories, ApiService, Dashboard) تستفيد من `restore()` "مجاناً" بالوراثة أو بالتجاهل التام. لذلك، الخطة مبنية على مبدأ **"Core أولاً، معزول ومُتحقَّق منه بالكامل، قبل أي لمسة UI"** — بالضبط كما يفرض Engineering Audit Standard: "understand the system completely before writing a single line of code"، وVerification Standard: "no implementation phase is considered complete until all verification steps pass".

---

## 2. تسلسل المراحل المقترح

### SUB-PHASE 10.2 — تنفيذ `restore()` على `Repository.js` (Core فقط)

**النطاق (Scope) — الوحيد المسموح بالتعديل:**
- `js/core/Repository.js` فقط.

**الممنوع صراحة في هذه المرحلة (بالضبط كما في Migration Scope للـ Skill):**
- لا تعديل على `DatabaseService.js`.
- لا تعديل على `StorageAdapter.js`.
- لا تعديل على `LocalStorageAdapter.js`.
- لا تعديل على أي من الـ 9 ملفات في `js/repositories/`.
- لا تعديل على أي Module في `js/modules/`.
- لا تعديل على `index.html`، CSS، أو `js/api/api.js`.

**محتوى التنفيذ (بحسب `Restore_System_Design.md` §1-6):**
1. إضافة `Repository.prototype.restore = async function (id) {...}` بجانب `delete()` مباشرة في §5 (CRUD Interface)، بنفس الحراسات (`_guardSupported('restore')`, `_guardReady()`) ونفس أسلوب التعديل المباشر لا عبر `update()` (§3 من ملف التصميم).
2. إضافة `'restore'` إلى قائمة العمليات القابلة للتعطيل عبر `unsupportedOperations` (لا حاجة لتغيير أي Repository فرعي، لأن القائمة تُقرأ ديناميكياً من الـ config الممرَّر أصلاً في كل ملف).
3. تعديل `transaction(ops[])` لإضافة فرع `else if (step.op === 'restore')` (§4 من ملف التصميم) — هذا **التعديل الوحيد على منطق قائم بالفعل**؛ كل ما سبق إضافات صرفة (Additive).
4. **لا** إضافة `deletedBy` (§6)، **لا** إضافة `restoreAll()` (§7)، **لا** إضافة `restoreMode` (§8)، **لا** إضافة أي Event جديد (§5) — كلها استُبعِدت صراحة في التصميم.

**الدليل المطلوب (Deliverables لـ 10.2، بحسب Repository Migration Standard):**
- `js/core/Repository.js` المعدَّل.
- Harness اختبار Node.js مستقل جديد (بنمط `verify_*_repository.js` الموجودة)، يغطي:
  - `restore()` على سجل محذوف فعلياً → ينجح، `deletedAt` يعود `null`، `version` يزيد، `updatedAt` يتحدث.
  - `restore()` على سجل حي بالفعل → ينجح (idempotent)، بلا زيادة `version` وبلا كتابة فعلية (تأكيد أن `_persist()` لم تُستدعَ — يمكن تأكيده بعدد استدعاءات mock adapter).
  - `restore()` على `id` غير موجود إطلاقاً → `ValidationError` غير قابل للاسترجاع.
  - `restore()` على Repository بـ `softDelete:false` (إن وُجد Repository اختباري وهمي بهذا الشكل) → `UnsupportedOperationError` إن أُضيفت لقائمة `unsupportedOperations`، أو سلوك يُوثَّق صراحة إن لم تُعطَّل تلقائياً.
  - `restore()` بعد `getAll({includeDeleted:true})` → السجل المسترجَع يظهر في `getAll()` القياسية (بلا `includeDeleted`) بعد الاسترجاع مباشرة.
  - `transaction([{op:'restore', id}])` منفردة ومركَّبة مع `create`/`update`/`delete` أخرى في نفس المعاملة، بما في ذلك حالة تراجع (Rollback) عند فشل خطوة لاحقة.
  - إعادة تشغيل **كل** الـ Harnesses السابقة (`verify_*_repository*.js`، 9+ ملفات) للتأكد من عدم وجود Regression على `create`/`update`/`delete`/`transaction` الحاليين (Regression Policy).
- تقرير Migration Report يغطي البنود القياسية (Executive Summary, Migration Scope, Dependency Analysis, Mirror Strategy [لا أثر]، Repository Integration, Regression Results, Known Limitations [T-02 المذكورة في تحليل الأثر]، PASS/FAIL).

**معيار PASS لـ 10.2:** كل الـ Harnesses القديمة + الجديدة تمر 100%، لا تعديل خارج `Repository.js`، لا تغيير في أي توقيع method موجود مسبقاً (فقط إضافة method/فرع جديد).

---

### SUB-PHASE 10.3 — تفعيل `restore()` على مستوى Module واحد تجريبي (Pilot)

**لماذا Module واحد أولاً، لا التسعة دفعة واحدة؟** لتقليل نصف قطر الانفجار (Blast Radius) لأي خطأ غير متوقع في التكامل الفعلي (Module ↔ Repository)، تماماً كما اتُّبِع في الهجرات السابقة (Phase 9 هاجرت module واحدة في كل Sub-Phase: 9.3 Documents، 9.5 Sessions، إلخ — بحسب سجل الذاكرة/الـ history الموثَّق).

**الترشيح المقترح للـ Pilot:** **Cases** — أعلى أولوية بحسب `Technical_Debt_Report §T-01` ("Recommended priority: High... at least the highest-value modules (Cases, Clients)")، وأيضاً أول Repository هُوجِر أصلاً (Phase 8.5.2) فأدوات اختبارها الأكثر نضجاً.

**النطاق:**
- `js/modules/cases.js` فقط (إضافة دالة `restoreCase(id)` جديدة — Additive بحتة، بلا تعديل على `saveCase()`/`deleteCase()` الموجودتين).
- لا تعديل على أي HTML/CSS في هذه الفرعية بعد — يمكن اختبار `restoreCase()` مبدئياً عبر console/harness قبل ربطها بزر UI فعلي (فصل "المنطق" عن "الواجهة" كخطوتين منفصلتين، اتساقاً مع "HTML Preservation" في الـ Skill: "Do not modify HTML... unless the task explicitly allows it").
- قرار صريح موثَّق (وليس ضمنياً) بشأن استدعاء `ApiService.syncRow()` من داخل `restoreCase()` أم لا (بحسب التحليل في `Restore_System_Architecture.md §15`) — أياً كان القرار، يُسجَّل كـ "Known Limitation" أو "Explicit Design Decision" في تقرير هذه الفرعية.

**الدليل المطلوب:** نفس بنية أي تقرير Integration سابق (`Cases_Repository_Integration_Report.md` كنموذج)، بالإضافة إلى Harness يتحقق من: `restoreCase()` → `syncCasesMirror()` استُدعيت → `data.cases` يعكس السجل المسترجَع → `renderDashboard()`/`updateBadges()` (إن استُدعيتا) تعكسان الرقم الصحيح (تأكيد عملي على تحليل الأثر في `Restore_System_Architecture.md §17-18`).

---

### SUB-PHASE 10.4 — تعميم `restoreX()` على باقي الوحدات الثمانية

**النطاق:** نفس نمط 10.3 بالضبط، مكرَّراً على Clients، ثم الست الباقية (Sessions, Tasks, Fees, Documents, Children, Library, Templates) — يُفضَّل بنفس ترتيب أولوية Phase 9 الأصلي إن وُجد (لتقليل قرارات جديدة، والاستفادة من نفس أنماط الاختبار المؤكدة).

**قاعدة ثابتة لكل فرعية:** ملف Module واحد فقط يُعدَّل في كل مرة (نفس انضباط Migration Scope الأصلي)، مع Harness مستقل، وتقرير Integration مستقل — لا "دفعة واحدة لكل الوحدات الثمانية" حتى لو بدا التكرار مملاً، لأن هذا هو بالضبط ما يمنح كل فرعية Blast Radius صغيراً وقابلاً للتراجع الفوري عند الحاجة.

---

### SUB-PHASE 10.5 (اختيارية، تالية) — واجهة Trash / Recycle Bin

**لا تُنفَّذ إلا بعد اكتمال 10.2-10.4 بالكامل ونجاحها في الإنتاج لفترة كافية.** تشمل:
- شاشة Trash موحَّدة (أو شاشة لكل Entity، حسب قرار UX) تستخدم نمط الاستعلام الموثَّق (`search({includeDeleted:true, filter:{deletedAt:{op:'ne', value:null}}})`).
- أزرار Restore لكل عنصر (تستدعي دوال `restoreX(id)` المُنجَزة في 10.2-10.4).
- **لا `bulkRestore()`/"Restore All" في هذه الفرعية** إلا كقرار منفصل صريح لاحق (`Restore_System_Design.md §7`).
- **لا "Permanent Delete/Purge" في هذه الفرعية إطلاقاً** — ذلك مرتبط بـ T-04 (نمو التخزين غير المحدود)، وهو Technical Debt منفصل بأولوية مختلفة، ويحتاج تصميماً مستقلاً كاملاً (بما فيه قرارات حساسة: هل الحذف النهائي رجعي؟ من يُصرَّح له بذلك؟) لا يجوز دمجها ضمنياً مع T-01.

---

## 3. مصفوفة التبعيات بين المراحل

| المرحلة | تعتمد على | تُنتج |
|---|---|---|
| 10.1 (هذا التقرير) | Phase 9 مكتملة، Technical Debt Report، Production Readiness Audit | تصميم + تحليل أثر (بلا كود) |
| 10.2 | 10.1 معتمَد | `restore()` على `Repository.js` + Harness + Migration Report |
| 10.3 | 10.2 PASS | `restoreCase()` على `cases.js` + Integration Report |
| 10.4 | 10.3 PASS | `restoreX()` على باقي الثمانية، فرعية لكل وحدة |
| 10.5 | 10.2-10.4 PASS ومستقرة في الإنتاج | واجهة Trash (خارج نطاق T-01 التقني البحت) |

**قاعدة صارمة:** لا تبدأ أي مرحلة قبل أن تحقق المرحلة السابقة معيار PASS الكامل بحسب Verification & QA Standard (Syntax → Static → Repository Compatibility → Behavior → Regression → Backward Compatibility → Scope → Final Review) — لا اختصار لهذا الترتيب.

---

## 4. المخاطر المعروفة التي يجب تتبعها عبر كل المراحل (Carried-Forward Risks)

هذه ليست مخاطر جديدة أنشأها Restore، بل مخاطر **قائمة أصلاً** (موثَّقة في `PROJECT_STATE.md`/`NEXT_PHASE.md` والذاكرة التراكمية للمشروع) يجب الانتباه لعدم تفاقمها أثناء تنفيذ 10.2-10.4:

- **انزياح فهرس (Row-Index Drift) في `ApiService`:** أي منطق `restoreX()` مستقبلي يجب ألا يفترض تطابق ترتيب `_records` مع صفوف الشيت (نفس التحذير القائم أصلاً لكل عمليات update/delete الحالية).
- **بيانات `dashboard.js` القديمة (Stale-Data Risk):** إن استُدعيت `renderDashboard()`/`updateBadges()` من نقاط غير متزامنة مع `syncXMirror()` الجديدة، فقد تُعرَض أرقام قديمة مؤقتاً — نفس الخطر القائم أصلاً، تنطبق عليه نفس الحماية القائمة (استدعاء `syncXMirror()` ثم `updateBadges()`/`renderDashboard()` بنفس الترتيب الحالي).
- **T-02 (فجوة مزامنة الحذف):** ستتضح أكثر مع Restore كما وُثِّق في `Restore_System_Architecture.md §15` — يجب تتبعها صراحة في كل تقرير فرعية من 10.3 فصاعداً، لا تجاهلها.

---

## 5. التحقق النهائي (Verification لهذا التقرير نفسه — SUB-PHASE 10.1)

- ✅ لا يوجد تعديل لأي ملف مصدر (`js/`, `index.html`, `css/`) — تم التحقق: كل الأدوات المستخدمة في هذه المرحلة هي `view`/`grep`/`bash` للقراءة فقط، لا `str_replace` ولا `create_file` استُخدمت إلا لإنشاء الثلاثة ملفات الجديدة تحت `docs/`.
- ✅ لا يوجد توليد كود قابل للتنفيذ — كل الأمثلة أعلاه توصيف سلوكي نثري (prose)، لا كتل كود JavaScript فعلية.
- ✅ لا يوجد Patch ولا Diff.
- ✅ لا يوجد تنفيذ فعلي — Audit + Design فقط، بحسب تعليمات هذه الفرعية بالحرف.
- ✅ الملفات الثلاثة المطلوبة أُنشئت فقط: `Restore_System_Design.md`، `Restore_System_Architecture.md`، `Restore_System_Migration_Plan.md`.

---

## Restore System Design

## PASS

## Ready For Restore Implementation
