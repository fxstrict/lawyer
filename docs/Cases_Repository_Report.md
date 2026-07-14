# Cases Repository Report
## نظام الحسام للمحاماة — V10 Offline-First Architecture
### PHASE 5 — SUB-PHASE 5.2 — Cases Repository

---

## ⚠️ Input Gap

| المرجع المطلوب | الحالة |
|---|---|
| `Master_v10_Base.zip` | **غير موجود بهذا الاسم.** الملف المرفوع فعلياً في هذه المحادثة كان `Master_v10_5_1.zip` (يفكّ إلى مجلد `Master_v10.5.1/`). يُعتمَد هذا كمصدر الكود الفعلي البديل — نفس نمط القبول الموثَّق في `Repository_Core_Report.md` (حيث قُبِل `Master_v9.zip` بدل `Master_v10_Base.zip`). |
| `Repository_Core_Report.md` | ✅ موجود، مطابق للاسم — فُحص بالكامل. |
| `Repository_Core_Verification_Report.md` | ✅ موجود، مطابق للاسم — فُحص بالكامل. |
| `Repository_Contract_Report.md` | ✅ موجود، بالاسم الفعلي `Repository_Contract_Report_PHASE2_V10.md` — فُحص بالكامل، وهو المرجع الأساسي لأسماء العمليات والـ Query Model. |
| `DatabaseService_Design_Report.md` | ✅ موجود، بالاسم الفعلي `DatabaseService_Design_Report_PHASE3_V10.md`. |
| `Data_Schema_Specification_Report.md` | ✅ موجود، بالاسم الفعلي `Data_Schema_Specification_Report_PHASE4_V10.md` — فُحص بالكامل، المرجع الأساسي لحقول Cases (§4.1). |
| `PROJECT_STATE.md` | ✅ موجود (نسختان: `doc/PROJECT_STATE.md` و`doc/PROJECT_STATE (6).md`) — كلتاهما فُحصتا؛ لا فرق مؤثر على نطاق هذه المرحلة. |
| `PROJECT_HISTORY.md` | ✅ موجود، بالاسم الفعلي `doc/PROJECT_HISTORY (4).md`. |
| `PROJECT_MAP.md` | **غير موجود في هذا الأرشيف على الإطلاق** (لم يكن موجوداً حتى في `Master_v9.zip` الأصلي المستخدَم في PHASE 2/4 حسب توثيقهما، وهو غائب هنا أيضاً). لم يُستخدَم — لا حاجة له في نطاق Cases Repository لأن كل تفاصيل الحقول مأخوذة مباشرة من `Data_Schema_Specification_Report.md` + فحص مباشر لـ `js/modules/cases.js` الفعلي. |
| `NEXT_PHASE.md` | ✅ موجود، بالاسم الفعلي `doc/NEXT_PHASE (4).md` — يوثّق صراحة أن قرار Storage Adapter المؤقت لـ Cases Repository **متروك لهذه المرحلة نفسها** (مقتبس أدناه في القسم 2.1). |

**خلاصة الفجوة:** لا ملف مرجعي حقيقي غائب أثّر على هذه المرحلة. الاختلاف الوحيد هو اسم أرشيف الكود المصدري (`Master_v10_5_1.zip` بدل `Master_v10_Base.zip`)، وهو نفس نمط القبول المُتَّبَع في المراحل السابقة.

---

## 1. نطاق هذه المرحلة

ملف واحد فقط: `js/repositories/CasesRepository.js`. يعتمد حصراً على `js/core/Repository.js` (لم يُعدَّل — القسم 4 أدناه). لا تعديل على أي Module/HTML/CSS/Apps Script/DatabaseService.

---

## 2. القرارات التصميمية وأساسها

### 2.1 Storage Adapter المؤقت — قرار مُفوَّض صراحة لهذه المرحلة

`DatabaseService` (المصمَّم في `DatabaseService_Design_Report_PHASE3_V10.md`) **غير منفَّذ ككود** في أي مكان بالمشروع — تحقُّق مباشر: بحث شامل عن `DatabaseService` في كل ملفات `.js`/`.html` لا يُرجع أي نتيجة خارج تعليقات `Repository.js` نفسه.

`NEXT_PHASE.md` (آخر مرحلة مكتملة) يوثّق هذه الفجوة صراحة ويُفوِّض قرارها لهذه المرحلة بالذات:

> "قرار ترتيب تنفيذ `DatabaseService` مقابل استخدام Storage Adapter مؤقت لأغراض Cases Repository هو قرار يُترَك للمرحلة القادمة نفسها، وليس محسوماً هنا."

**القرار المتخَذ هنا:** تعريف Storage Adapter صغير خاص بـ Cases فقط (`createCasesLocalStorageAdapter`)، داخل `CasesRepository.js` نفسه، يقرأ/يكتب **نفس** مفتاح `localStorage['cases']` الذي يستخدمه `data.cases`/`saveLocal()` الحاليان بالضبط — بدون أي مفتاح جديد، وبدون أي تغيير في شكل التخزين (مصفوفة JSON مسطّحة). هذا Adapter محقون افتراضياً في الـ constructor لكن قابل للاستبدال بالكامل (حقن تبعية خارجية) دون لمس هذا الملف عندما يُنفَّذ `DatabaseService` الحقيقي لاحقاً — بالضبط كما يتوقع `Repository.js` (تعليق §2 فيه: "أي شيء يطابق هذا العقد duck-typed قابل للحقن، بما فيه adapter مؤقت للاختبار").

### 2.2 Primary Key — رقم_القضية (Natural Key)

مطابقة حرفية لِـ `Repository_Contract_Report.md §4.1` و`Data_Schema_Specification_Report.md §4.1/§3.2`: Cases هو الاستثناء الوحيد بمفتاح طبيعي (`رقم_القضية`) بدل `id` المولَّد (`uid()`). `idField: 'رقم_القضية'` يُمرَّر للـ constructor الأساسي؛ الفرادة تُفرَض تلقائياً عبر منطق `create()`/`_indexOf()` الموجود أصلاً في `Repository.js` دون أي كود إضافي هنا.

### 2.3 Validation — تعارض موثَّق بين تقريرين، ومصدر القرار

`Data_Schema_Specification_Report.md §4.1` يذكر حقلين إلزاميين فقط لـ Cases: `رقم_القضية` و`عنوان_القضية`. لكن الفحص المباشر لِـ `saveCase()` الفعلية في `js/modules/cases.js` (الأسطر 182-190) يُظهر تحققاً ثالثاً مطبَّقاً اليوم فعلياً في الكود:

```js
if (!num || !title || !client) {
  toast('يرجى ملء الحقول الإلزامية', 'error');
  return;
}
```

أي أن `اسم_الموكل` (`client`) إلزامي أيضاً في السلوك الفعلي الحالي. تقرير Data Schema نفسه يوضّح سبب هذه الفجوة في منهجيته (§1): تدقيقه للحقول الإلزامية اعتمد على `grep "required"` في HTML (صفر نتائج)، وهذا لا يلتقط تحققاً برمجياً يدوياً داخل دالة JS مثل هذا. بما أن أولوية هذه المرحلة المعلَنة صراحة هي **"Behavior Compatible 100% مع النظام الحالي"**، اعتُمد السلوك الفعلي المُتحقَّق منه مباشرة (3 حقول) في `_validate()`، وليس قائمة تقرير Data Schema الأضيق (حقلان). هذا القرار مُوثَّق أيضاً كتعليق مباشر في رأس `CasesRepository.js`.

### 2.4 Search — استبدال محرك البحث الافتراضي لضمان توافق سلوكي حرفي

المحرك الافتراضي في `Repository.js` (`_matchesSearch`) يبحث فقط ضمن `searchFields` مُهيَّأة. لكن `renderCases()` الفعلية اليوم تبحث في **كل** حقول السجل دون استثناء:

```js
var t = Object.values(c).join(' ').toLowerCase();
return (!s || t.includes(s)) && ...
```

لضمان توافق سلوكي حرفي 100% إذا اسُتخدِم هذا الـ Repository لاحقاً ليحل محل هذا المنطق، تم Override لِـ `_matchesSearch` في `CasesRepository` ليكرّر بالضبط نفس السلوك (`join` كل الحقول القانونية العربية القديمة `CASES_LEGACY_FIELDS`). تم استبعاد الحقول البنيوية الجديدة (`createdAt`, `checksum`, إلخ) من هذا الـ join عمداً — هذه الحقول لم تكن موجودة في شكل السجل قبل طبقة الـ Repository، وتضمينها كان سيُغيِّر نتائج البحث الفعلية (يكسر التوافق الخلفي بدل أن يحافظ عليه).

`CASES_SEARCH_FIELDS` (المشتقة من `Data_Schema_Specification_Report.md §4.1`) بقيت محفوظة كإعداد للـ Repository (تُستخدَم من طرف أي استدعاء مستقبلي يريد بحثاً مُقيَّداً بحقول محدَّدة عبر `search()` مباشرة)، لكنها **ليست** المحرك الافتراضي — التوافق الخلفي الحرفي أخذ الأولوية.

### 2.5 Filter / Sort

`filterFields` (`الحالة`, `نوع_الدعوى`) مطابقة حرفياً لقائمتَي التصفية الفعليتين في `renderCases()` (`filterCaseStatus`, `filterCaseType`) — لا تعارض هنا بين التقارير والكود الفعلي. `sortFields` (`تاريخ_الجلسة_القادمة`, `تاريخ_القيد`) مأخوذة من `Data_Schema_Specification_Report.md §4.1`؛ السلوك الفعلي الحالي لا يطبّق أي فرز إطلاقاً (ترتيب الإدخال فقط)، لذلك `sort()` هنا وظيفة إضافية جديدة (Additive) لا تستبدل أي سلوك موجود ولا تُستخدَم افتراضياً في أي عملية أخرى.

### 2.6 Soft Delete

`softDelete: true` مطابقة لـ `Data_Schema_Specification_Report.md §4.1 Delete Rules` ("Soft Delete هو الافتراضي" لـ Cases) — قرار مصمَّم ومعتمَد مسبقاً في مرحلة رسمية سابقة (Phase 4)، وليس قراراً جديداً يُتَّخذ هنا. يختلف هذا عمداً عن `deleteCase()` الفعلية اليوم (حذف نهائي فوري عبر `splice`) — هذا الاختلاف مقصود ومُصمَّم مسبقاً كجزء من نمط Strangler الإضافي (`Repository_Contract_Report.md §16`): طبقة الـ Repository الجديدة تُقدِّم Soft Delete كسياسة مستقبلية صريحة، ولا تُستبدَل بها `deleteCase()` الفعلية في هذه المرحلة (الملف غير مُوصَّل بعد بأي HTML/Module).

### 2.7 التسمية — insert/remove/filter/sort/validate مقابل Contract §19

`Repository_Contract_Report.md §19` يُلزم بأسماء العمليات الحرفية للـ Contract (`create`/`update`/`delete`، بلا مرادفات) لضمان اتساق كل الـ 12 Repository. لكن تعليمات هذه المرحلة بالذات تطلب حرفياً `insert()`, `remove()`, `filter()`, `sort()`, `validate()`. الحل المعتمَد: كل عمليات الـ Contract الحرفية (`create`, `update`, `delete`, `get`, `getAll`, `find`, `exists`, `count`, `bulkInsert`, `bulkUpdate`, `bulkDelete`, `search`, `export`, `import`, `clear`, `transaction`) موروثة **دون أي تغيير** من `Repository.prototype` وتبقى هي الواجهة القانونية لكل Repository لاحق — تحقيقاً كاملاً لـ §19. إضافةً لذلك، عُرِّفت `insert()`/`remove()`/`filter()`/`sort()`/`validate()` كـ Wrappers إضافية رقيقة (لا تستبدل ولا تُعيد تسمية أي عملية Contract):
- `insert(entity)` → `this.create(entity)`
- `remove(id)` → `this.delete(id)`
- `filter(filterObj)` → `this.search({filter: filterObj}).items`
- `sort(records?, sortSpec?)` → غلاف حول محرك المقارنة الداخلي `_compareRecords`
- `validate(record, operation?)` → غلاف عام حول hook الـ `_validate` المحمي

---

## 3. ما لم يُعدَّل (تأكيد Diff)

- `js/core/Repository.js` — **لم يُلمَس إطلاقاً** (MD5 قبل/بعد متطابق تماماً — القسم 5 من تقرير التحقق).
- `js/modules/cases.js`, `index.html`, أي CSS، أي ملف `Code_v4.gs` — **لم يُلمَس إطلاقاً** (لا كتابة على أي منها في هذه الجلسة).
- `DatabaseService` — لم يُنشَأ ولم يُعدَّل (هو غير موجود أصلاً؛ Adapter المؤقت داخل `CasesRepository.js` وحده، وليس بديلاً عن `DatabaseService`).

---

## 4. الملف المُسلَّم

`js/repositories/CasesRepository.js` — Repository متخصص واحد، يعتمد فقط على `Repository` (المستورَدة من `js/core/Repository.js`)، بلا أي اعتماد آخر على أي ملف مشروع آخر (لا `data`, لا `FIELDS`/`MAP`, لا `document.*`, لا `toast()`).

يُصدِّر (CommonJS + `window`/`globalThis`): `CasesRepository`, `createCasesLocalStorageAdapter`.

تفاصيل التحقق الكامل: `Cases_Repository_Verification_Report.md`.

---

## 5. Ready For Clients Repository

هذا الملف مضاف بالكامل، خامل (Inert) — لا `<script>` يُشير إليه في `index.html`. جاهز كنموذج مرجعي لبناء `ClientsRepository` التالية بنفس النمط (Storage Adapter مؤقت خاص بها، `idField: null` + `idGenerator: uid` بما أن Clients لا تملك مفتاحاً طبيعياً حسب `Data_Schema_Specification_Report.md §4.2`، ونفس أسلوب توثيق أي تعارض بين التقارير والكود الفعلي).

---

# Cases Repository Review

**PASS**

**Ready For Clients Repository**
