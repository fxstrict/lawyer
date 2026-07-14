# Tasks Repository Report
## نظام الحسام للمحاماة — V10 Offline-First Architecture
### PHASE 5 — SUB-PHASE 5.6 — Tasks Repository

---

## ⚠️ Input Gap

| المرجع المطلوب | الحالة |
|---|---|
| `Master_v10_Base.zip` | **غير موجود بهذا الاسم.** العمل استمر على نفس شجرة المشروع المستخرَجة سابقاً (`Master_v10_5_4/`) — نفس القبول الموثَّق في كل تقارير Repository السابقة. |
| `Repository_Core_Report.md` | ✅ موجود — تمت مراجعته سابقاً في المراحل 5.2–5.5، ولم يتغيّر. |
| `Repository_Core_Verification_Report.md` | ✅ موجود — كما سبق. |
| `Cases_Repository_Report.md` / `Cases_Repository_Verification_Report.md` | ✅ موجودان — كما سبق. |
| `Clients_Repository_Report.md` / `Clients_Repository_Verification_Report.md` | ✅ موجودان — مرجع نمط فقط، لا اعتمادية كود. |
| `Children_Repository_Report.md` / `Children_Repository_Verification_Report.md` | ✅ موجودان — مرجع نمط فقط (خصوصاً حالة "لا فرز فعلي موجود" المشابهة هنا). |
| `Sessions_Repository_Report.md` / `Sessions_Repository_Verification_Report.md` | ✅ موجودان (SUB-PHASE 5.5) — راجَعتهما هذه المرحلة مباشرةً كأحدث نمط قرارات (Storage Adapter، `_resolveId`، `_validate`، `_matchesSearch`، `filter`/`sort` wrappers) — لا اعتمادية كود، `TasksRepository.js` لا يستورد منهما أي شيء. |
| `Repository_Contract_Report.md` | ✅ موجود، بالاسم الفعلي `Repository_Contract_Report_PHASE2_V10.md` — القسم 4.6 "Tasks Repository" هو المرجع الأساسي هنا. |
| `DatabaseService_Design_Report.md` | ✅ موجود، بالاسم الفعلي `DatabaseService_Design_Report_PHASE3_V10.md` — لم يُستخدَم تفصيلياً. |
| `Data_Schema_Specification_Report.md` | ✅ موجود، بالاسم الفعلي `Data_Schema_Specification_Report_PHASE4_V10.md` — فُحص القسم 4.6 (Tasks) بالكامل. |
| `PROJECT_STATE.md` | ✅ موجود، ومطابق تماماً لـ `PROJECT_STATE (7).md` (مؤكَّد بـ `diff` في بداية هذه المرحلة أيضاً — لا فروق). |
| `PROJECT_HISTORY.md` | موجود فقط باسم مرقَّم `doc/PROJECT_HISTORY (5).md` (نفس الفجوة منذ SUB-PHASE 5.3). فُحص بالكامل، لا فجوة محتوى. |
| `PROJECT_MAP.md` | **لا يزال غير موجود إطلاقاً في هذا الأرشيف** — نفس الفجوة الموثَّقة في كل المراحل السابقة. كل تفاصيل حقول Tasks مأخوذة مباشرة من `Data_Schema_Specification_Report.md §4.6` + فحص مباشر لِـ `js/modules/tasks.js`، `index.html` (`FIELDS.tasks`/`MAP.tasks`)، و`Code_v4.gs`. |
| `NEXT_PHASE.md` | موجود فقط باسم مرقَّم `doc/NEXT_PHASE (5).md`. فُحص بالكامل — يحدد Tasks Repository صراحة كمرحلة تالية، مع ملاحظات تصميمية مسبقة (مناقَشة أدناه §2.2، §2.4، §2.7). |

**خلاصة الفجوة:** لا ملف مرجعي حقيقي غائب أثّر على محتوى هذه المرحلة. الاختلافات الوحيدة الباقية هي نفسها المرحّلة من قبل: (1) اسم أرشيف الكود المصدري، (2) بعض الملفات موجودة بأسماء مرقَّمة بدل الاسم الحرفي المطلوب، (3) غياب `PROJECT_MAP.md` كلياً (غير مؤثِّر). تم إنشاء `js/repositories/TasksRepository.js` مباشرة في المسار الصحيح المطلوب.

---

## 1. نطاق هذه المرحلة

ملف واحد فقط: `js/repositories/TasksRepository.js`. يعتمد حصراً على `js/core/Repository.js` (لم يُعدَّل). لا تعديل على `js/core/CasesRepository.js`، `js/repositories/ClientsRepository.js`، `js/repositories/ChildrenRepository.js`، أو `js/repositories/SessionsRepository.js` (لم يُلمَس أي منها، ولا اعتمادية كود منها — القسم 3 أدناه). لا تعديل على أي Module/HTML/CSS/Apps Script/DatabaseService/ApiService. لا نقل لأي Business Logic. لا إضافة Sync أو Cache.

---

## 2. القرارات التصميمية وأساسها

### 2.1 Storage Adapter المؤقت — نفس نمط Cases/Clients/Children/Sessions

مطابقةً لنفس النمط المتَّبع في المراحل السابقة (`NEXT_PHASE.md` لا يزال يترك "Adapter مشترك أم Adapter لكل Repository" قراراً مفتوحاً): Storage Adapter صغير خاص بـ Tasks فقط (`createTasksLocalStorageAdapter`)، **معرَّف من جديد ومستقل بالكامل** داخل `TasksRepository.js` (لا استيراد من أي Repository آخر)، يقرأ/يكتب **نفس** مفتاح `localStorage['tasks']` الذي يستخدمه `data.tasks`/`saveLocal()` الحاليان بالضبط.

### 2.2 Identifier — نفس نمط التعارض المُحلول في Clients/Children/Sessions، مؤكَّد مجدداً هنا (تماماً كما توقَّع `NEXT_PHASE.md`)

`Data_Schema_Specification_Report.md §4.6` يصف الـ Primary Key بشكل مجرَّد: `id (Hybrid)`. `NEXT_PHASE.md` نبَّه صراحة إلى ضرورة فحص `js/modules/tasks.js` مباشرة قبل افتراض `id` عام. الفحص المباشر لِـ `saveTask()` الفعلية (`js/modules/tasks.js`، السطر 144) يؤكد نفس النمط للمرة الرابعة: المعرِّف المولَّد يُخزَّن فعلياً تحت الحقل العربي `رقم_المهمة`:

```js
obj['رقم_المهمة']    = obj['رقم_المهمة']    || uid();
obj['تاريخ_الإنشاء'] = obj['تاريخ_الإنشاء'] || new Date().toISOString();
```

**القرار المتخَذ هنا:** نفس القرار المتَّخذ لِـ Clients/Children/Sessions، بنفس المبرر: `idField: 'رقم_المهمة'` مع `_resolveId()` override يولِّد معرِّفاً فقط عند غياب `رقم_المهمة`. مولِّد المعرِّف (`generateTaskId`) نسخة خوارزمية مطابقة حرفياً لِـ `uid()` الفعلية، مُعرَّفة محلياً داخل `TasksRepository.js` نفسه (تكرار مستقل، لا اعتمادية عابرة).

### 2.3 Validation — **لا تعارض هذه المرة**، خلافاً لِـ Sessions (5.5)

`Data_Schema_Specification_Report.md §4.6` يذكر حقلاً إلزامياً واحداً فقط: `العنوان`. الفحص المباشر لِـ `saveTask()` الفعلية (الأسطر 137-141) يؤكد ذلك تماماً:

```js
var t = document.getElementById('fTaskTitle').value.trim();
if (!t) {
  toast('يرجى إدخال عنوان المهمة', 'error');
  return;
}
```

(`t` يُطابَق عبر `MAP.tasks` إلى `العنوان`.) لا تعارض هنا؛ `_validate()` تفرض هذا الحقل الواحد فقط، غير فارغ بعد `.trim()`.

### 2.4 Search — تعارض ضد **كلا** التقريرين الرسميين (النمط المتكرِّر الآن للمرة الخامسة)

`Data_Schema_Specification_Report.md §4.6` و`Repository_Contract_Report.md §4.6` يذكران Search Fields كـ `العنوان` فقط. الفحص المباشر لِـ `renderTasks()` الفعلية (الأسطر 80-83) يُظهر أن التوثيق الرسمي **يُقلِّل من** السلوك الفعلي — نفس نمط البحث النصي الحر الكامل المتكرِّر في كل الكيانات السابقة:

```js
var rows = data.tasks.filter(function(t) {
  var tx = Object.values(t).join(' ').toLowerCase();
  return (!s || tx.includes(s)) && (!pr || t['الأولوية'] === pr);
});
```

مربوط فعلياً بحقل بحث حي (`#searchTasks`). **القرار المتخَذ هنا:** نفس منهجية كل المراحل السابقة — `_matchesSearch` عُدِّلت لتكرار `Object.values(t).join(' ')` عبر `TASKS_LEGACY_FIELDS` الكاملة. هذا الانحراف موثَّق بوضوح في تعليق رأس الملف "SEARCH".

### 2.5 Filter — لا فجوة كود، لكن فجوة توثيق/واجهة يجب توضيحها

`Data_Schema_Specification_Report.md §4.6` و`Repository_Contract_Report.md §4.6` يذكران حقلي تصفية: `الحالة` و`الأولوية`. الفحص المباشر لِـ `index.html` يؤكد وجود عنصر واجهة واحد فقط: `#filterTaskPriority` — **لا يوجد** أي `#filterTaskStatus` أو ما يعادله. تبديل الحالة الوحيد الموجود هو `toggleTask()` (تعديل مباشر، وليس تصفية). هذه ليست "تعارضاً" بالمعنى الذي واجهناه في Sessions (كود يخالف توثيقاً)، بل فجوة بين خطة موثَّقة وواجهة لم تُبنَ بعد. **القرار المتخَذ هنا:** `filter()` Wrapper عام غير مُقيَّد بحقل واحد (نفس نمط `ChildrenRepository.filter()`/`SessionsRepository.filter()`)، فيدعم `{الأولوية: ...}` (الفعلي المربوط بواجهة حية) **و**`{الحالة: ...}` (الموثَّق لكن غير مربوط بواجهة بعد) دون أي تخصيص إضافي — كلاهما يعملان اليوم عبر محرك `_matchesFilter` العام الموروث من `Repository.js`، بما في ذلك عوامل المدى (`{op:'lte', value:...}`) لفلترة `الموعد_النهائي` بنطاق تاريخ.

### 2.6 Sort — قدرة إضافية بحتة، لا تعارض لأن لا سلوك حي موجود لمضاهاته

`Data_Schema_Specification_Report.md §4.6` يذكر `الموعد_النهائي` كحقل فرز. الفحص المباشر لِـ `renderTasks()` يؤكد **عدم وجود أي `.sort()` فعلي إطلاقاً** — نفس اكتشاف Children (5.4) بالضبط (ترتيب الإدخال فقط). **القرار المتخَذ هنا:** الافتراضي في `sort()` هو `الموعد_النهائي` تصاعدياً، تطبيقاً مباشراً لتوصية `Data_Schema_Specification_Report.md` بما أنه لا يوجد سلوك فعلي مخالف يستوجب تفضيله بدلاً من ذلك (خلافاً لحالة Sessions حيث تم تفضيل السلوك الفعلي أحادي الحقل على توصية Composite Index).

### 2.7 عملية `toggleStatus` المقترَحة في `Repository_Contract_Report.md §4.6` — مستبعَدة عمداً هذه المرحلة

`Repository_Contract_Report.md §4.6` يقترح صراحةً عملية متخصصة `toggleStatus(id)` تحاكي `toggleTask()` الفعلية (تعديل جزئي لحقل واحد، وليس `update()` كاملة، لتفادي إرسال السجل بأكمله عبر الشبكة). **القرار المتخَذ هنا:** تعليمات هذه المرحلة تُعدِّد مجموعة مغلقة ومحدَّدة من العمليات المطلوبة ("نفذ فقط: getAll/get/insert/update/remove/exists/count/search/filter/sort/validate") — `toggleStatus` ليست منها، ولم تُضَف. سلوك `toggleTask()` (تبديل 'done'⇄'pending'، بلا مزامنة ApiService) يبقى بالكامل داخل `js/modules/tasks.js` دون أي محاكاة هنا. هذا استبعاد نطاق مقصود وموثَّق، وليس إغفالاً.

### 2.8 المزامنة (`المهام` Sheet) — فجوة حذف موروثة ومؤكَّدة، غير مُعالَجة

فحص `Code_v4.gs` (`SHEET_DEFS`، السطر 118) يؤكد وجود Sheet حقيقي باسم `المهام`، وأن `saveTask()` تستدعي `ApiService.syncRow('المهام', obj, idx)` فعلياً (الإنشاء/التعديل يُزامَنان). لكن `deleteTask()` **لا** تستدعي أي مزامنة حذف إطلاقاً — فجوة موروثة موثَّقة صراحة في تعليق الكود نفسه وفي `Data_Schema_Specification_Report.md §4.6` (`syncPolicy` حذف = local-only) و`PROJECT_STATE.md §11` ("Documents/Tasks/Fees delete-sync gap"). **لم تُعالَج هذه الفجوة هنا** — `TasksRepository.js` لا يستدعي `ApiService`/`syncToSheets`/`fetch` إطلاقاً بصرف النظر، مطابقةً لكل الـ Repositories السابقة.

### 2.9 التسمية — insert/remove/filter/sort/validate مقابل Contract §19

نفس الحل المعتمَد في كل المراحل السابقة بالضبط: كل عمليات الـ Contract الحرفية موروثة دون أي تغيير من `Repository.prototype`. إضافةً لذلك، عُرِّفت `insert()`/`remove()`/`filter()`/`sort()`/`validate()` كـ Wrappers إضافية رقيقة (لا تستبدل ولا تُعيد تسمية أي عملية Contract).

### 2.10 Soft Delete

`softDelete: true` مطابقة لِـ `Data_Schema_Specification_Report.md §4.6 Delete Rules` ("Soft Delete على مستوى Schema"). يختلف هذا عمداً عن `deleteTask()` الفعلية اليوم (حذف نهائي فوري عبر `splice`) — نفس نمط الاختلاف المصمَّم مسبقاً والمعتمَد في كل الـ Repositories السابقة.

---

## 3. ما لم يُعدَّل (تأكيد Diff)

- `js/core/Repository.js` — **لم يُلمَس إطلاقاً** (MD5: `1159f37eec831920256a727a30dba709`).
- `js/core/CasesRepository.js` — **لم يُلمَس إطلاقاً** (MD5: `f12ff30e02bdfc2da709fe11cfb91fe7`).
- `js/repositories/ClientsRepository.js` — **لم يُلمَس إطلاقاً** (MD5: `a6e2a29bd6e96e787c1219ea0d7a8a5b`).
- `js/repositories/ChildrenRepository.js` — **لم يُلمَس إطلاقاً** (MD5: `a202e04f56de3728361f1bf028ba1061`).
- `js/repositories/SessionsRepository.js` — **لم يُلمَس إطلاقاً** (MD5: `947de954ef8a09fd3710e8957cc33c04`).
- `js/modules/tasks.js` — **لم يُلمَس إطلاقاً** (MD5: `114cbd22ec98a9eaea6f7143754e6073`).
- `index.html` — **لم يُلمَس إطلاقاً** (MD5: `bc93f6b82a9a822de620fa77502ed200`).
- `Code_v4.gs` — **لم يُلمَس إطلاقاً** (MD5: `78bba97e310222740ccebfd6dec110ef`).
- أي CSS، `DatabaseService`/`ApiService` — **لم يُلمَس أي منها إطلاقاً**.

---

## 4. الملف المُسلَّم

`js/repositories/TasksRepository.js` (582 سطراً) — Repository متخصص واحد، يعتمد فقط على `Repository` (المستورَدة من `js/core/Repository.js`)، بلا أي اعتماد آخر على أي ملف مشروع آخر.

يُصدِّر (CommonJS + `window`/`globalThis`): `TasksRepository`, `createTasksLocalStorageAdapter`.

تفاصيل التحقق الكامل، بما فيها Harness مستقل بالكامل (`verify_tasks_repository.js`): `Tasks_Repository_Verification_Report.md`.

---

## 5. Ready For Fees Repository

هذا الملف مضاف بالكامل، خامل (Inert) — لا `<script>` يُشير إليه في `index.html`. جاهز كنموذج مرجعي لبناء `FeesRepository` التالية.

ملاحظات تصميمية معروفة سلفاً يجب فحصها مباشرة قبل أي افتراض:
- **معرِّف Fees:** يُرجَّح ذكره أيضاً كـ `id (Hybrid)` عام — يجب فحص `js/modules/fees.js` مباشرة أولاً لتأكيد اسم الحقل الفعلي قبل أي افتراض (الدرس المتكرِّر الآن خمس مرات).
- **بحث/فرز/تصفية:** يجب فحص `renderFees()`/`saveFee()` الفعلية مباشرة — النمط المتكرِّر حتى الآن هو أن الكود الفعلي غالباً يفوق ما تصفه التقارير الرسمية في البحث (بحث حر كامل).
- **حقول مالية:** `Data_Schema_Specification_Report.md §4.5` يذكر `المبلغ` كحقل رقمي بلا فرض نوع صارم في الكود الحالي (نص HTML عادي) — يحتاج فحصاً مباشراً لِـ `saveFee()` لتأكيد ما إذا كان يُفرَض أي تحقق رقمي فعلياً قبل أي افتراض حول Validation.
- **فجوة المزامنة:** `Data_Schema_Specification_Report.md §4.5` يذكر نفس فجوة الحذف (`syncPolicy` = local-only) — يجب التأكد من وجود Sheet مقابل في `Code_v4.gs` وسلوك حذفها الفعلي.

---

# Tasks Repository

**PASS**

**Ready For Fees Repository**
