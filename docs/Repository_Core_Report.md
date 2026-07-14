# Repository Core Report
## نظام الحسام للمحاماة — V10 Offline-First Architecture
### PHASE 5 — SUB-PHASE 5.1 — Repository Core

---

## ⚠️ Input Gap

توثيق إلزامي، بلا افتراض، لحالة كل مرجع رسمي مطلوب في تعليمات هذه المرحلة:

| المرجع المطلوب | الحالة |
|---|---|
| `Master_v10_Base.zip` | **غير موجود.** الملف المرفوع فعلياً في هذه الرسالة كان `Master_v9.zip`. لا يوجد أي أثر لأي ملف باسم `Master_v10_Base.zip` في هذه المحادثة على الإطلاق. |
| `Data_Schema_Specification_Report.md` | ✅ موجود، بالاسم الفعلي `Data_Schema_Specification_Report_PHASE4_V10.md` — تم فحصه بالكامل واعتماده. |
| `DatabaseService_Design_Report.md` | ✅ موجود، بالاسم الفعلي `DatabaseService_Design_Report_PHASE3_V10.md` — تم فحصه بالكامل واعتماده. |
| `Repository_Contract_Report.md` | ✅ موجود، بالاسم الفعلي `Repository_Contract_Report_PHASE2_V10.md` — تم فحصه بالكامل واعتماده، وهو المرجع الأساسي لكل تصميم هذا الملف. |
| `PROJECT_STATE.md` | ✅ موجود داخل `Master_v9.zip` (`doc/PROJECT_STATE.md`) — تم فحصه. |
| `PROJECT_HISTORY.md` | ✅ موجود داخل `Master_v9.zip` (`doc/PROJECT_HISTORY.md`) — تم فحصه. |
| `PROJECT_MAP.md` | ✅ موجود داخل `Master_v9.zip` (`doc/PROJECT_MAP.md`) — لكنه **قديم** (مبني صراحة على `Master_v8_Stable.zip`، قبل دمج Children/Dashboard). لم يُستخدَم في هذه المرحلة لأن Repository Core لا يعتمد على تفاصيل دمج أي Module بعينه. |
| `NEXT_PHASE.md` | ✅ موجود داخل `Master_v9.zip` (`doc/NEXT_PHASE.md`) — تم فحصه؛ لاحظ أنه كان يشير إلى "قرار سياسة مزامنة Children" كمرحلة تالية على مسار V9 القديم، وهذا **لا يتعارض** مع تنفيذ Repository Core على مسار V10 المنفصل (مساران متوازيان موثَّقان صراحة، لا تضارب حقيقي). |

**خلاصة الفجوة:** المرجع الوحيد الغائب فعلياً هو `Master_v10_Base.zip`. تم الاعتماد حصراً
على `Master_v9.zip` (المرفوع فعلياً والمفحوص مباشرة) + تقارير التصميم الأربعة V10
المرفوعة في هذه الرسالة (PHASE1–PHASE4)، دون أي افتراض من خارج هذه المصادر.

---

## 1. نطاق هذه المرحلة (كما وردت في التعليمات)

- ملف واحد فقط: `js/core/Repository.js`.
- لا إنشاء لأي Repository متخصص (Cases/Clients/Sessions/Children/Documents/Tasks/
  Fees/Library/Templates/Settings) — كل هذه محظورة صراحة في هذه المرحلة.
- Repository Core يحتوي **فقط** على Repository Base، ومسؤول عن: Storage Adapter، CRUD
  Interface، Validation Hooks، Search Hooks، Filter Hooks، Sort Hooks، Transaction
  Hooks، Metadata Hooks. **بلا أي Business Logic.**
- ممنوع تعديل: أي Module، أي HTML، أي CSS، أي API، أي Apps Script، أي `localStorage`.

---

## 2. القرارات التصميمية وأساسها

### 2.1 Storage Adapter — حقن تبعية، وليس تنفيذ

`Repository` لا يبني `DatabaseService` (خارج نطاق هذه المرحلة تماماً — `DatabaseService`
موثَّق في `DatabaseService_Design_Report_PHASE3_V10.md` كمكوّن منفصل لاحق). بدلاً من ذلك،
يقبل الـ constructor كائن `storageAdapter` مُحقَناً من الخارج، ويتحقق فقط (duck-typing)
من وجود `read(entityKey)` و`write(entityKey, records)` عليه — أي شيء آخر (توقيت
Promise/sync، تفاصيل IndexedDB لاحقاً) غير مفروض هنا، تماشياً مع معيار
`DatabaseService_Design_Report.md` §26: *"أي تغيير مستقبلي في محرك التخزين الفعلي
(localStorage → IndexedDB → SQLite) يُعتبَر فشلاً تصميمياً إن استلزم تعديل ولو سطر واحد
في أي Repository."* لذلك كل عمليات الكتابة/القراءة في هذا الملف تستخدم `async/await`
حصراً — حتى مع أن التنفيذ الحالي المتوقَّع (`localStorage`) متزامن فعلياً اليوم — لضمان
عدم الحاجة لأي تعديل عند استبدال المحرك لاحقاً.

### 2.2 لماذا القراءات متزامنة (sync) والكتابات غير متزامنة (async)

Repository Contract §5 (Shared Operations) ينص صراحة: *"`get`/`getAll`/`find`/`exists`/
`count` — قراءة صرفة من النسخة المحلية في الذاكرة، بدون أي استدعاء شبكة أبداً."* بما أن
Repository يحتفظ بنسخة كاملة في الذاكرة (`this._records`) بعد `open()` (نفس مبدأ Cache
الموثَّق في القسم 10/11 من التقريرين السابقين)، فإن كل عمليات القراءة تُنفَّذ بشكل متزامن
مباشرة على هذه النسخة. عمليات الكتابة وحدها (`create/update/delete/bulk*/import/clear/
transaction`) هي `async` لأنها تستدعي `storageAdapter.write()` الذي قد يكون غير متزامن
حقيقياً (IndexedDB مستقبلاً).

### 2.3 Hooks كنقاط امتداد، لا كمنطق أعمال

المطلوب من هذه المرحلة تحديداً هو "Validation Hooks / Search Hooks / Filter Hooks / Sort
Hooks" — **hooks**، وليس قواعد فعلية. لذلك:
- `_validate()` افتراضياً يُرجع `{valid:true}` دائماً — لا حقل إلزامي واحد معروف هنا (لا
  `FIELDS.cases` ولا أي اسم حقل عربي في هذا الملف إطلاقاً). أي Repository متخصص لاحقاً
  (خارج هذه المرحلة) يُلزَم بـ `override` هذه الدالة لإضافة قواعده الخاصة.
- `_matchesFilter()`/`_matchesSearch()`/`_compareRecords()` نُفِّذت بمحرك **عام** (فحص
  مساواة، عوامل نطاق `gte/lte/in/between`، AND/OR مركّب، بحث نصي جزئي غير حساس لحالة
  الأحرف عبر حقول يُمررها الاستدعاء) — هذا ليس "منطق أعمال" لأنه لا يعرف اسم حقل واحد
  بعينه؛ إنه محرك استعلام عام يعمل بنفس الطريقة تماماً بصرف النظر عن الكيان، وهو ما ينص
  عليه صراحة Query Model في `Repository_Contract_Report.md` §7 كجزء من "الـ Contract"
  المشترك، لا كقاعدة عمل خاصة بكيان.
- `_attachMetadata()` ينفذ **حصراً** حقول Audit الإنجليزية العامة (`createdAt`,
  `updatedAt`, `deletedAt`, `version`, `syncVersion`, `checksum`) الموثَّقة في
  `Data_Schema_Specification_Report.md` §3.9/§3.10 — وهي بالتعريف **ليست** بيانات عمل
  قانونية عربية، بل بنية تقنية عامة لكل سجل بلا استثناء؛ هذا يطابق حرفياً تسمية "Metadata
  Hooks" في تعليمات هذه المرحلة.

### 2.4 CRUD Interface: تنفيذ حقيقي، وليس توقيعات فارغة فقط

Repository Contract §3 يُلزِم بوجود توقيع كل عملية من الـ 15 (حتى لو لم يدعمها Repository
معيّن فعلياً — عندها تُرجع `UnsupportedOperationError`). بما أن Repository Base هذا هو
الأساس الذي ستُبنى فوقه كل الـ Repositories المتخصصة لاحقاً، فإن التنفيذ الفعلي (وليس
توقيعاً فارغاً) لكل عملية هنا هو ما يجعل الأساس قابلاً لإعادة الاستخدام دون تكرار — وهذا
منسجم مع Repository Contract §2 (Shared Operations نفس المنطق عبر كل الـ Repositories):
"نفس تدفق: Validate → Write Local (sync) → Persist (sync) → Schedule Remote Sync". طبقة
المزامنة البعيدة (`SyncService`) نفسها **خارج نطاق هذه المرحلة تماماً** (لم تُصمَّم بعد
حتى في تقارير V10 الأربعة نفسها) — لذلك لا استدعاء لأي `SyncService`/`ApiService` هنا؛
فقط الكتابة المحلية (ذاكرة + Storage Adapter).

### 2.5 Soft Delete كافتراضي — وليس قراراً سياسياً محسوماً بمعناه القديم

`Data_Schema_Specification_Report.md` §3.7 يُقدِّم Soft Delete كحل مباشر لفجوة موروثة
موثَّقة سابقاً (حذف Children/Documents/Tasks/Fees لا يُزامَن اليوم). هذا التصميم يجعل
`softDelete: true` هو الافتراضي القابل للتعطيل (`softDelete: false`) — **دون** حسم أي
قرار سياسي بشأن أي كيان بعينه (لا اسم كيان واحد مذكور في هذا الملف)، تماماً كما ينص
Repository Contract §1 مبدأ 10: *"لا قرار سياسي ضمني... التصميم فقط يجعل هذه القرارات
نقاط تحكم صريحة."*

### 2.6 `UnsupportedOperationError` عبر تهيئة، لا عبر حذف الدالة

بدلاً من أن يحذف Repository متخصص مستقبلي (مثل Dashboard/Calendar) دالة `create()` من
تعريفه (وهذا يكسر الـ Contract الموحّد الذي يشترط وجود التوقيع دائماً)، يوفّر الـ
Base class تهيئة `unsupportedOperations: [...]` تُفعِّل حارساً (`_guardSupported`) في
بداية كل عملية — فيبقى التوقيع موجوداً دائماً، ويُرجع خطأً منظّماً بدلاً من ذلك، تماماً
كما يشترط Repository Contract §3 (الملاحظة الإلزامية).

### 2.7 لماذا Natural Key و Generated Key معاً

`Data_Schema_Specification_Report.md` §3.2 يوثّق نوعين فقط من الـ IDs المستخدَمين فعلياً:
Hybrid (`uid()`) لكل الكيانات، و Natural Key (`رقم_القضية`) حصراً لـ Cases. الـ Base
class لا يعرف اسم "Cases" ولا "رقم_القضية" إطلاقاً — لكنه يدعم **الآلية** العامة لكلا
النمطين عبر `idField` (مفتاح طبيعي، يُفرَض تفرّده) أو `idGenerator` (دالة مُحقَنة تولّد
معرِّفاً — الـ Base class لا يحتوي `uid()` نفسها؛ تلك تبقى في `js/ui-utils.js` كما هي).

---

## 3. ما لم يُنفَّذ عمداً في هذه المرحلة (خارج النطاق صراحة)

- **لا `DatabaseService` فعلي.** `Repository.js` يتوقع Storage Adapter لكن لا يبنيه.
- **لا `SyncService`/مزامنة بعيدة حقيقية.** لا استدعاء لـ `ApiService`/`fetch` في أي مكان.
- **لا BackupManager.**
- **لا Orchestration layer** (تنسيق بين Repositories متعددة، مثل حذف قضية يحذف جلساتها) —
  موثَّق صراحة في `Repository_Contract_Report.md` §12 كطبقة أعلى من Repository نفسه.
- **لا أي Repository متخصص واحد.** لا سطر كود واحد يذكر Cases/Clients/Sessions/Children/
  Documents/Tasks/Fees/Library/Templates/Settings/Calendar/Dashboard بالاسم.
- **لا فرض Unique Constraint حقيقي على `رقم_القضية`** — لأن هذا الملف لا يعرف حتى وجود
  هذا الحقل؛ المحرك العام يدعم الآلية (`idField` + فحص تكرار)، والقرار الفعلي لتطبيقها
  على Cases تحديداً يبقى لمرحلة Cases Repository القادمة.

---

## 4. Verification

انظر `Repository_Core_Verification_Report.md` للتفصيل الكامل. ملخص:

- **Syntax:** `node --check js/core/Repository.js` ناجح، وكذلك جميع ملفات JS الـ 15
  الموجودة مسبقاً في المشروع (لم يتأثر أي منها).
- **Dependencies:** صفر اعتماديات — الملف مستقل تماماً (لا يستدعي أي دالة أو متغيّر من
  أي ملف آخر في المشروع).
- **Load Order:** غير مربوط في `index.html` بعد (لا `<script src="js/core/Repository.js">`
  مضاف) — عمداً، هذا خارج نطاق SUB-PHASE 5.1.
- **Backward Compatibility:** MD5 لـ `index.html` و`js/modules/dashboard.js` **متطابقان
  حرفياً** مع القيم الموثَّقة في `PROJECT_STATE.md` §10 قبل هذه المرحلة — دليل قاطع على
  عدم تعديل أي ملف قديم.

---

## 5. Documentation

تم تحديث:
- `PROJECT_STATE.md` — قسم جديد رقم 15 يوثّق Repository Core بالكامل.
- `PROJECT_HISTORY.md` — قسم جديد "V10 Offline-First Architecture — PHASE 5 —
  SUB-PHASE 5.1 — Repository Core" مُضاف في نهاية السجل الزمني.
- `NEXT_PHASE.md` — مُحدَّث ليعكس اكتمال Repository Core والمرحلة التالية المُعلَنة
  (Cases Repository)، مع الإبقاء على مسار V9 القديم (قرار مزامنة Children) كبند منفصل
  غير متأثر.

---

# Repository Core

**PASS**

**Ready For Cases Repository**
