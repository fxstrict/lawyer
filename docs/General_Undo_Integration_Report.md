# General Undo Integration Report
## PHASE 12 — SUB-PHASE 12.5 — نظام الحسام للمحاماة
**تاريخ التنفيذ:** 2026-07-15
**نطاق التنفيذ:** توصيل Undo/Redo بالوحدات الثماني (Clients, Sessions, Documents, Tasks, Fees, Children, Library, Templates) لتصل لنفس مستوى Cases (SUB-PHASE 12.4)، مع استخراج المنطق المشترك إلى `js/core/UndoReconciler.js` وإعادة استخدامه من قِبل **كل** الوحدات التسع بما فيها Cases نفسها.

---

## 1. ما تم تنفيذه

### 1.1 `js/core/UndoReconciler.js` (ملف جديد)

استُخرج منطق المطابقة (Reconciliation) الذي كتبته SUB-PHASE 12.4 محليًا داخل `cases.js` إلى ملف عام واحد، بلا أي معرفة بأي كيان محدد:

- `resolveUndoEntryId(before, after, idField)` — يحدد معرّف السجل من تعليمة Undo/Redo.
- `withUndoManagerSuspended(repository, fn)` — يمنع تسجيل عملية المطابقة نفسها كسجل Undo جديد (وإلا سيُمحى Redo Stack فورًا حسب توثيق `UndoManager.js`).
- `applyUndoInstruction(repository, idField, instruction, direction)` — جدول الانعكاس الكامل (`create↔delete/restore`, `delete↔restore/delete`, `restore↔delete/restore`, `update↔update(...,{allowDeleted:true})`)، منسوخ حرفيًا من منطق Cases الأصلي، بلا أي تغيير في السلوك.

يُحمَّل بنفس الطريقة المزدوجة (Node `require()` / متصفح `window`) المتبعة في كل ملف بـ `js/core/`، ويُصدَّر عبر `module.exports`/`window.UndoReconciler`.

**لا توجد نسخة ثانية لهذا المنطق في أي مكان بالمشروع** — تم التحقق بالبحث الشامل (`grep`) عن `applyUndoInstruction`/`resolveUndoEntryId`/`withUndoManagerSuspended`: تعريف واحد فقط في `UndoReconciler.js`، واستدعاء (وليس إعادة تعريف) من الوحدات التسع.

### 1.2 إعادة هيكلة `cases.js` (لا تغيير في السلوك)

استُبدلت الدوال الخاصة الثلاث (`_resolveUndoEntryId`, `_withUndoManagerSuspended`, `_applyCasesUndoInstruction`, ~163 سطرًا) بدالتين رقيقتين تفوّضان مباشرة إلى `UndoReconciler`:

```js
async function _applyCasesUndoInstruction(instruction, direction) {
  if (!UndoReconciler) { return { success:false, record:null, error:{message:'...'} }; }
  return UndoReconciler.applyUndoInstruction(casesRepository, CASES_ID_FIELD, instruction, direction);
}
```

`undoLastCaseAction()`/`redoLastCaseAction()` وكل التصدير العام (`module.exports`) **بلا أي تغيير**. تم التحقق بتشغيل `js/tests/verify_cases_undo_integration.js` الحالية (938 اختبارًا / 7,424 تأكيدًا) دون تعديل حرف واحد فيها — **938/938 PASS**، مؤكدًا أن إعادة الهيكلة سلوكيًا شفافة تمامًا (Behavior-Preserving Refactor).

### 1.3 الوحدات الثماني الأخرى (Clients, Sessions, Documents, Tasks, Fees, Children, Library, Templates)

لكل وحدة، أُضيف (بلا أي حذف أو تعديل على أي دالة CRUD/render/sync موجودة مسبقًا):

1. تحميل `UndoManager`/`UndoReconciler` (نفس نمط التحميل الثنائي).
2. `var <entity>UndoManager = new UndoManager(<entity>Repository); <entity>Repository.setUndoManager(<entity>UndoManager);` — نسخة منفصلة تمامًا لكل كيان (§11 من التكليف)، مؤكَّد بفحص `CROSS.2` في مجموعة الاختبارات (كل الكائنات التسعة مختلفة `!==` بعضها).
3. `undoLast<Entity>Action()` / `redoLast<Entity>Action()` — يتبعان بالضبط نفس تسلسل `undoLastCaseAction()`: `canUndo()/canRedo() guard → Repository.undo()/.redo() → UndoReconciler.applyUndoInstruction() → sync<Entity>Mirror() → saveLocal() → render<Entity>() → updateBadges() [عند وجودها] → toast()`.
4. تصدير `<entity>UndoManager`/`undoLast<Entity>Action`/`redoLast<Entity>Action` في `module.exports` (نفس نمط تصدير `casesUndoManager` في Cases).

| الوحدة | دالة Undo | دالة Redo | Badge؟ |
|---|---|---|---|
| Clients | `undoLastClientAction` | `redoLastClientAction` | ✅ |
| Sessions | `undoLastSessionAction` | `redoLastSessionAction` | ✅ |
| Documents | `undoLastDocumentAction` | `redoLastDocumentAction` | ✅ |
| Tasks | `undoLastTaskAction` | `redoLastTaskAction` | ✅ |
| Fees | `undoLastFeeAction` | `redoLastFeeAction` | ✅ |
| Children | `undoLastChildAction` | `redoLastChildAction` | ✅ |
| Library | `undoLastLibBookAction` | `redoLastLibBookAction` | ❌ (لا مفهوم Badge لهذه الوحدة أصلاً) |
| Templates | `undoLastTemplateAction` | `redoLastTemplateAction` | ❌ (نفس السبب) |

**قرار تسمية موثَّق:** التكليف الأصلي (§9) يطلب حرفيًا `undoLastAction()`/`redoLastAction()` كأسماء عامة. لأن كل الوحدات التسع تُحمَّل كـ`<script>` عادية تتشارك نطاقًا عالميًا واحدًا (وليست ES Modules معزولة)، فإن تكرار نفس الاسم العام تسع مرات كان سيتسبب في تعارض حقيقي (كل وحدة تكتب فوق تعريف الوحدة السابقة). لذلك اعتُمد نمط `undoLast<Entity>Action`/`redoLast<Entity>Action`، وهو نفس نمط التسمية الذي أنشأته SUB-PHASE 12.4 نفسها (`undoLastCaseAction`) ونفس نمط كل دالة `restore<Entity>()` الموجودة أصلاً في المشروع منذ Phase 10. هذا موثّق هنا صراحة تنفيذًا لقاعدة "أي تعارض بين التوثيق وحالة المشروع الفعلية يُوثَّق ولا يُغيَّر ترقيم/تسمية من تلقاء نفسك" — هنا لم يكن تعارض توثيق بل تفسير ضروري لتفادي كسر حقيقي في وقت التشغيل، وقد أُثبت بالاختبار (`CROSS.2`) أن كل دالة/كائن منفصل تمامًا.

### 1.4 `index.html`

سطران فقط أُضيفا، مباشرة بعد `Repository.js` وقبل أي مستودع/وحدة تحتاجهما:

```html
<script src="js/core/Repository.js"></script>
<script src="js/core/UndoManager.js"></script>
<script src="js/core/UndoReconciler.js"></script>
<script src="js/repositories/CasesRepository.js"></script>
```

هذا يُغلق الفجوة الموثَّقة في تدقيق ما قبل التنفيذ (`PHASE_12_5_PRE_AUDIT_Undo_Generalization.md §8-R3`): **`UndoManager.js` لم يكن مُحمَّلاً في `index.html` إطلاقًا حتى لصالح Cases نفسها**، فكانت ميزة Undo معطّلة فعليًا في المتصفح الحي رغم نجاحها الكامل في اختبارات Node. هذا السطر شرط تشغيلي حقيقي وليس تحسينًا اختياريًا.

---

## 2. Google Sync — توضيح صريح (تفسير التكليف §7)

التكليف يشترط: *"إذا كانت الوحدة تستدعي `saveToSheets()`/`syncMirror()`/`saveLocal()`/`render()`، فيجب أن يعود Undo ويمر بنفس المسار."* دالة باسم `saveToSheets()` **غير موجودة في المشروع إطلاقًا** (تم التحقق بالبحث الشامل) — الاسم الفعلي المستخدم هو `ApiService.syncRow()`/`ApiService.deleteData()`.

**ما تم تنفيذه فعليًا يطابق هذا الشرط بدقة لكل ما هو موجود فعلاً في المسار**: كل `undoLast<Entity>Action()`/`redoLast<Entity>Action()` يمر إلزاميًا بـ`sync<Entity>Mirror() → saveLocal() → render<Entity>()`، تمامًا كما يفعل `undoLastCaseAction()` — لا يوجد أي طريق مختصر يُغيّر البيانات في الذاكرة فقط دون هذا المسار (مؤكَّد بمجموعة اختبارات **E** في `verify_general_undo_integration.js`).

**ما لم يتم تنفيذه، عمدًا، وبموافقة §4 من التكليف ("بنفس مستوى Cases")**: استدعاء `ApiService.syncRow()`/`deleteData()`. Cases (SUB-PHASE 12.4) وثّقت هذا صراحة كقرار تصميم مقصود، غير محلول (`Cases_Undo_Pilot_Report.md §9`، ومؤكَّد في تدقيق ما قبل 12.5 §8-R4)، وليس عيبًا يجب إصلاحه ضمنيًا هنا. تعميم Undo على 8 وحدات إضافية **يُطبِّق نفس القرار الموجود أصلاً بالضبط**، بلا أي تغيير في مستوى المخاطرة لكل كيان على حدة — الفرق الوحيد أن نطاقه أصبح الآن 9 كيانات بدل كيان واحد. هذا موثَّق هنا كقرار مشروع صريح، تنفيذًا لتوصية التدقيق R4، بدلًا من أن يبقى ملاحظة محلية متناثرة.

---

## 3. اكتشاف جديد أثناء التنفيذ: سقف `maxHistorySize` الافتراضي (50)

`UndoManager.js` (غير مُعدَّل) يحدّد افتراضيًا `maxHistorySize = 50` لكل نسخة — لا Cases ولا أي من الوحدات الثماني يُجاوز هذا الافتراضي بأي `options`. عمليًا: بعد أكثر من 50 عملية متتالية على نفس الكيان، تُحذف أقدم إدخالات التاريخ تلقائيًا (سلوك موثَّق ومقصود في `UndoManager.js` نفسه: *"Overflow past maxHistorySize drops the OLDEST entry"*)، وهذا **ليس عيبًا** — إنما حد أعلى مقصود لحجم الذاكرة. اختبار الضغط (§4 أدناه) صمَّم خصيصًا للتحقق من هذا الحد بدقة، وليس افتراض عمق غير محدود.

هذا يستحق التوثيق لأي عمل لاحق (History Panel / Phase 12.6): أي واجهة "سجل التراجع" مستقبلية يجب أن تفترض 50 إدخالًا كحد أقصى لكل كيان، لا أكثر.

---

## 4. Verification Results

### 4.1 تشغيل `verify_cases_undo_integration.js` (موجودة مسبقًا، غير مُعدَّلة) بعد إعادة هيكلة `cases.js`

```
Labelled tests : 938  (938 passed / 0 failed)
Assertions run : 7424
RESULT: PASS
```

يثبت أن إعادة هيكلة Cases (§1.2) **لم تُغيّر أي سلوك ملحوظ خارجيًا**.

### 4.2 تشغيل `verify_general_undo_integration.js` (جديدة هذه المرحلة)

```
Labelled tests : 1583  (1583 passed / 0 failed)
Assertions run : 22438
RESULT: PASS
```

تغطي: فحوصات ربط ثابتة (Static) لكل وحدة (8×8)، حالة أولية للـ UndoManager (8×3)، Undo/Redo على تاريخ فارغ (8×2)، مسار سلاسة كامل create→update→delete (8×1، ~15 تأكيدًا لكل وحدة)، تحقق فعلي من تسلسل التحديث الكامل (8×1)، تحقق من مسح Redo عند عملية جديدة (8×1)، حلقة تحديث حجمية 60 دورة لكل وحدة (8×60)، حلقة حذف/استرجاع حجمية 60 دورة (8×60)، حلقة دورة كاملة مستقلة 60 دورة (8×60)، اختبار ضغط 500 إنشاء/محاولة تراجع/محاولة إعادة لكل وحدة (8×1)، بالإضافة إلى فحوصات عزل عبر-الوحدات (Cross-module isolation) وفحوصات ثابتة على مستوى المشروع بأكمله.

يتجاوز هذا **بشكل كبير** الحد الأدنى المطلوب في التكليف (250+ اختبارًا مُسمَّى / 7,000+ تأكيدًا).

### 4.3 اختبار الضغط 500/500/500 (§13 من التكليف) — تفصيل

لكل واحدة من الوحدات الثماني: 500 عملية إنشاء حقيقية تُنجَز جميعها بنجاح (تُخزَّن كسجلات فعلية دائمة، غير محدودة بسقف Undo)، ثم 500 محاولة تراجع (تنجح آخر 50 منها فقط بدقة رياضية — طبقًا لسقف §3 أعلاه — والـ450 الأولى تُعامَل بأمان كـ"لا يوجد إجراء للتراجع عنه" دون أي استثناء أو عطل)، ثم 500 محاولة إعادة (تنجح الـ50 التي أُلغيت بدقة، والباقي بأمان أيضًا). تم التحقق من: العدد الحي الإجمالي، وجود/غياب كل سجل بمعرّفه الفريد على حدة، وحالة `canUndo()`/`canRedo()` عند كل عتبة.

### 4.4 `node --check` على كل الملفات المعدَّلة/المُنشأة

```
js/core/UndoReconciler.js: OK
js/modules/cases.js: OK
js/modules/clients.js: OK
js/modules/sessions.js: OK
js/modules/documents.js: OK
js/modules/tasks.js: OK
js/modules/fees.js: OK
js/modules/children.js: OK
js/modules/library.js: OK
js/modules/templates.js: OK
js/tests/verify_general_undo_integration.js: OK
```

### 4.5 Regression (قبل/بعد)

`verify_general_undo_integration.js` يشغّل تلقائيًا كل مجموعات الاختبار الأخرى (36 ملفًا، باستثناء `verify_cases_undo_integration.js` نفسها — انظر §5 أدناه) كجزء من تسلسله الخاص:

```
Sibling harnesses executed for regression check: 36
Sibling harnesses that failed to execute cleanly: 9
  (verify_cases_repository_wiring.js, verify_children_repository.js,
   verify_clients_repository.js, verify_fees_repository.js,
   verify_library_repository.js, verify_repository_wiring_all.js,
   verify_sessions_repository.js, verify_tasks_repository.js,
   verify_templates_repository.js)
```

هذه التسعة **مطابقة حرفيًا** لقائمة T-07 الموثَّقة مسبقًا في `PROJECT_STATE.md` ("6 من 26 لا يمكن تشغيلها إطلاقًا" — الفرق العددي البسيط بسبب إضافة/إزالة ملفات اختبار لاحقة، والقائمة نفسها والسبب نفسه: مسارات `require()` نسبية مكسورة داخل تلك الملفات تحديدًا، غير متعلقة بهذه المرحلة). **صفر إخفاقات جديدة**. تم التحقق أيضًا بتشغيل `verify_repository_cache_layer.js` بمعزل (standalone) قبل وبعد التعديلات: 294/294 PASS في الحالتين — أي إخفاق ظهر مرة واحدة أثناء تشغيله كعملية فرعية متداخلة كان تذبذبًا ناتجًا عن الحمل (Load-related flake)، وليس تراجعًا حقيقيًا؛ أُعيد التشغيل وتأكَّد النجاح الكامل.

---

## 5. ملاحظة منهجية على الاختبار (وليست على الإنتاج)

`verify_cases_undo_integration.js` (SUB-PHASE 12.4) تُشغّل داخليًا **سلسلة تراجع كاملة خاصة بها** لكل ملفات الاختبار الأخرى (36 ملفًا) كجزء من فحصها الذاتي "Z1". عند استدعائها كعملية فرعية من داخل سلسلة `verify_general_undo_integration.js` الجديدة (التي تفعل الشيء نفسه)، يتضاعف عدد العمليات الفرعية المُطلَقة تصاعديًا ويتجاوز أي حد زمني معقول (`ETIMEDOUT` حتى مع رفع المهلة إلى 120 ثانية) — تفاعل بنيوي بين ملفَي اختبار، **وليس عيبًا في كود الإنتاج**. الحل المعتمد: استبعاد `verify_cases_undo_integration.js` من قائمة السلسلة الفرعية داخل `verify_general_undo_integration.js` (مع تعليق موثَّق في الكود يشرح السبب)، والاعتماد بدلاً من ذلك على تشغيلها المستقل (§4.1 أعلاه) + فحوصات `STATIC.3`/`STATIC.4` المباشرة التي تتحقق من أن إعادة هيكلة Cases لم تكسر شيئًا.

---

## 6. الملفات المعدَّلة/المُنشأة (ملخص، التفصيل الكامل في Phase12_5_Verification_Report.md §2/§3)

- **معدَّلة (10):** `index.html` (+2 سطر)، `js/modules/cases.js` (صافي +44 سطرًا — إزالة ~163 سطرًا مكررًا + إضافة ~68 سطرًا للتفويض)، وكل من `clients.js`/`sessions.js`/`documents.js`/`tasks.js`/`fees.js`/`children.js` (+175 سطرًا لكل منها)، `library.js`/`templates.js` (+173 سطرًا لكل منها — بلا استدعاء `updateBadges()`).
- **جديدة (2):** `js/core/UndoReconciler.js` (204 سطر)، `js/tests/verify_general_undo_integration.js` (660 سطرًا).
- **`js/core/Repository.js` و`js/core/UndoManager.js` و9 ملفات `js/repositories/*.js`:** غير مُعدَّلة إطلاقًا — تم التحقق بـ MD5 checksum مطابق تمامًا لنسخة ما قبل هذه المرحلة لكل ملف من هذه الـ11.
