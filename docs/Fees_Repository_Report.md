# Fees Repository Report
## نظام الحسام للمحاماة — V10 Offline-First Architecture
### PHASE 5 — SUB-PHASE 5.7 — Fees Repository

---

## ⚠️ Input Gap

| المرجع المطلوب | الحالة |
|---|---|
| `Master_v10_Base.zip` | **غير موجود بهذا الاسم.** العمل استمر على نفس شجرة المشروع المستخرَجة فعلياً من `Master_v10_5_6.zip`. |
| `Repository_Core_Report.md` / `Repository_Core_Verification_Report.md` | ✅ موجودان — كما سبق. |
| `Cases_Repository_Report.md` / `Cases_Repository_Verification_Report.md` | ✅ موجودان — كما سبق. |
| `Clients_Repository_Report.md` / `Clients_Repository_Verification_Report.md` | ✅ موجودان — مرجع نمط فقط، لا اعتمادية كود. |
| `Children_Repository_Report.md` / `Children_Repository_Verification_Report.md` | ✅ موجودان (أحدهما بنسخة مكرَّرة `Children_Repository_Verification_Report (1).md` — محتوى مطابق). |
| `Sessions_Repository_Report.md` / `Sessions_Repository_Verification_Report.md` | ✅ موجودان — مرجع نمط فقط. |
| `Tasks_Repository_Report.md` / `Tasks_Repository_Verification_Report.md` | ✅ موجودان (SUB-PHASE 5.6) — راجَعتهما هذه المرحلة مباشرةً كأحدث نمط قرارات (Storage Adapter، `_resolveId`، `_validate`، `_matchesSearch`، `filter`/`sort` wrappers) — لا اعتمادية كود، `FeesRepository.js` لا يستورد منهما أي شيء. |
| `Repository_Contract_Report.md` | ✅ موجود، بالاسم الفعلي `Repository_Contract_Report_PHASE2_V10.md` — القسم 4.5 "Fees Repository" هو المرجع الأساسي هنا. |
| `DatabaseService_Design_Report.md` | ✅ موجود، بالاسم الفعلي `DatabaseService_Design_Report_PHASE3_V10.md` — لم يُستخدَم تفصيلياً (هذه المرحلة لا تلمس DatabaseService). |
| `Data_Schema_Specification_Report.md` | ✅ موجود، بالاسم الفعلي `Data_Schema_Specification_Report_PHASE4_V10.md` — فُحص القسم 4.5 (Fees) بالكامل. |
| `PROJECT_STATE.md` | موجود فقط باسم مرقَّم `doc/PROJECT_STATE (9).md`. فُحص بالكامل وعُومِل كالمرجع الرسمي. |
| `PROJECT_HISTORY.md` | موجود فقط باسم مرقَّم `doc/PROJECT_HISTORY (5) (2).md`. فُحص بالكامل. |
| `PROJECT_MAP.md` | **لا يزال غير موجود إطلاقاً في هذا الأرشيف** — نفس الفجوة الموثَّقة في كل المراحل السابقة. كل تفاصيل حقول Fees مأخوذة مباشرة من `Data_Schema_Specification_Report.md §4.5` + فحص مباشر لِـ `js/modules/fees.js`، `index.html` (`FIELDS.fees`/`MAP.fees`)، و`Code_v4.gs`. |
| `NEXT_PHASE.md` | موجود فقط باسم مرقَّم `doc/NEXT_PHASE (5) (2).md`. فُحص بالكامل — يحدد Fees Repository صراحة كمرحلة تالية، مع ملاحظات تصميمية مسبقة (مناقَشة أدناه §2.2، §2.3، §2.4، §2.7). |

**فجوة إضافية خاصة بهذه المرحلة — مواقع الملفات المرجعية:** هذه المرحلة تطلب مراجعة `CasesRepository.js`، `SessionsRepository.js`، و`TasksRepository.js` باعتبارها موجودة تحت `js/repositories/` (كما تنص عليه رؤوس هذه الملفات نفسها، و`Tasks_Repository_Report.md §1`، و`NEXT_PHASE.md`). الفحص المباشر للأرشيف المُستلَم يُظهر أنها موجودة فعلياً تحت `js/core/` (فقط `ClientsRepository.js` و`ChildrenRepository.js` موجودان فعلياً تحت `js/repositories/`). تم التحقق أن محتوى كل ملف مطابق تماماً (MD5) للقيم المسجَّلة سابقاً في `Tasks_Repository_Report.md §5` لأربعة من الخمسة، وتمت قراءتها من مكانها الفعلي (`js/core/`) دون أي نقل أو تعديل أو إعادة تسمية — هذا تناقض في **تعبئة الأرشيف** فقط، وليس تغييراً في الكود. تسليم هذه المرحلة (`FeesRepository.js`) أُنشئ في المسار الصحيح الذي تطلبه التعليمات حرفياً: `js/repositories/FeesRepository.js`.

**خلاصة الفجوة:** لا ملف مرجعي حقيقي غائب أثّر على محتوى هذه المرحلة. الاختلافات الوحيدة الباقية هي نفسها المرحّلة من قبل عبر كل المراحل (أسماء ملفات مرقَّمة بدل الاسم الحرفي، غياب `PROJECT_MAP.md`)، بالإضافة إلى فجوة تعبئة المسارات الموضَّحة أعلاه (غير مؤثِّرة على محتوى أو سلوك `FeesRepository.js`).

---

## 1. نطاق هذه المرحلة

ملف واحد فقط: `js/repositories/FeesRepository.js` (617 سطراً). يعتمد حصراً على `js/core/Repository.js` (لم يُعدَّل — MD5 مطابق قبل/بعد، القسم 3 أدناه). لا تعديل على `js/core/CasesRepository.js`، `js/repositories/ClientsRepository.js`، `js/repositories/ChildrenRepository.js`، `js/core/SessionsRepository.js`، أو `js/core/TasksRepository.js` (لم يُلمَس أي منها، ولا اعتمادية كود منها). لا تعديل على أي Module/HTML/CSS/Apps Script/DatabaseService/ApiService. لا نقل لأي Business Logic (حسابات الإجمالي/العدّ في `renderFees()` بقيت كما هي في `js/modules/fees.js`). لا إضافة Sync أو Cache.

---

## 2. القرارات التصميمية وأساسها

### 2.1 Storage Adapter المؤقت — نفس نمط Cases/Clients/Children/Sessions/Tasks

مطابقةً لنفس النمط المتَّبع في كل المراحل السابقة (`NEXT_PHASE.md` لا يزال يترك "Adapter مشترك أم Adapter لكل Repository" قراراً مفتوحاً): Storage Adapter صغير خاص بـ Fees فقط (`createFeesLocalStorageAdapter`)، **معرَّف من جديد ومستقل بالكامل** داخل `FeesRepository.js` (لا استيراد من أي Repository آخر)، يقرأ/يكتب **نفس** مفتاح `localStorage['fees']` الذي يستخدمه `data.fees`/`saveLocal()` الحاليان بالضبط.

### 2.2 Identifier — نفس نمط التعارض المُحلول في Clients/Children/Sessions/Tasks، مؤكَّد مجدداً هنا (تماماً كما توقَّع `NEXT_PHASE.md`)

`Data_Schema_Specification_Report.md §4.5` يصف الـ Primary Key بشكل مجرَّد: `id (Hybrid)`. `NEXT_PHASE.md` نبَّه صراحة إلى ضرورة فحص `js/modules/fees.js` مباشرة قبل افتراض `id` عام. الفحص المباشر لِـ `saveFee()` الفعلية يؤكد نفس النمط للمرة الخامسة: المعرِّف المولَّد يُخزَّن فعلياً تحت الحقل العربي `رقم_العملية`:

```js
obj['رقم_العملية']   = obj['رقم_العملية']   || uid();
obj['تاريخ_الإنشاء'] = obj['تاريخ_الإنشاء'] || new Date().toISOString();
```

تأكيد مستقل إضافي: `Code_v4.gs` — `SHEET_DEFS` لِـ `'الأتعاب'` يبدأ رأس الأعمدة بـ `'رقم_العملية'` حرفياً.

**القرار المتخَذ هنا:** نفس القرار المتَّخذ لِـ Clients/Children/Sessions/Tasks، بنفس المبرر: `idField: 'رقم_العملية'` مع `_resolveId()` override يولِّد معرِّفاً فقط عند غياب `رقم_العملية`. مولِّد المعرِّف (`generateFeeId`) نسخة خوارزمية مطابقة حرفياً لِـ `uid()` الفعلية، مُعرَّفة محلياً داخل `FeesRepository.js` نفسه (تكرار مستقل، لا اعتمادية عابرة).

### 2.3 Validation — **لا تعارض بين التقريرين والكود، لكن تفاوت داخلي دقيق داخل الكود نفسه بين الحقلين**

`Data_Schema_Specification_Report.md §4.5` يذكر حقلين إلزاميين: `رقم_القضية` و`المبلغ`. الفحص المباشر لِـ `saveFee()` الفعلية يؤكد ذلك تماماً:

```js
var c = document.getElementById('fFeeCaseNum').value.trim();
var a = document.getElementById('fFeeAmount').value;
if (!c || !a) {
  toast('يرجى ملء رقم القضية والمبلغ', 'error');
  return;
}
```

**ملاحظة دقيقة يجب الحفاظ عليها:** `c` (رقم_القضية) يُقرَأ بعد `.trim()` قبل فحص الفراغ، بينما `a` (المبلغ) يُقرَأ **بدون** `.trim()` — فحص فراغ خام (`!a`) فقط. النتيجة الفعلية: قيمة `المبلغ` المكوَّنة من مسافات فقط (`'   '`) لا تُرفَض اليوم بواسطة `saveFee()` (لأن سلسلة غير فارغة = صحيح منطقياً)، بينما `رقم_القضية` المكوَّن من مسافات فقط **يُرفَض** (لأن `.trim()` يفرغه أولاً). `_validate()` في `FeesRepository.js` يُعيد إنتاج هذا التفاوت حرفياً حقلاً بحقل بدلاً من تطبيق قاعدة موحَّدة "غير فارغ بعد trim" على الحقلين — تم التحقق بالاختبارات §"validate() ACCEPTS whitespace-only المبلغ" و"validate() rejects whitespace-only رقم_القضية" في التقرير التالي.

بالإضافة إلى ذلك، `Data_Schema_Specification_Report.md §4.5` يذكر صراحة: *"`المبلغ` رقمي (توصية — لا فرض نوع صارم حالياً في الكود، الحقل نص HTML عادي)"* — أي أن الرقمية **توصية فقط، غير مفروضة**. لم تُضَف أي فحص نوعي رقمي في `_validate()`، مطابقةً لهذه التوصية الصريحة وللكود الفعلي (الذي لا يستدعي `Number()`/`parseFloat()` قبل الحفظ في `saveFee()` — فقط لاحقاً داخل `renderFees()` لأغراض العرض والإجمالي، وهذا Business Logic ممنوع نقله في هذه المرحلة).

### 2.4 Search — نفس النمط المتكرر: البحث الفعلي أوسع مما تصفه التقارير

`Data_Schema_Specification_Report.md §4.5` يحصر حقول البحث في: `اسم_الموكل`, `رقم_القضية`. الفحص المباشر لِـ `renderFees()` الفعلية (`js/modules/fees.js`) يُظهر النمط المتكرر ذاته منذ Cases: البحث ليس محصوراً بحقلين، بل بحث نصي حر عبر كل السجل:

```js
var rows = data.fees.filter(function(f) {
  return !s || Object.values(f).join(' ').toLowerCase().includes(s);
});
```

مربوطاً فعلياً بحقل بحث حي (`#searchFees`, `oninput="renderFees()"`). لأن أولوية هذه المرحلة الصريحة هي "Behavior Compatible 100% مع Fees Module الحالي" — وسلوك واجهة حي فعلي أقوى دليلاً من قائمة حقول ضيّقة في تقرير تخطيطي مجرَّد — تم Override لِـ `_matchesSearch` لمطابقة سلوك الانضمام النصي الحر بالضبط عبر `FEES_LEGACY_FIELDS` (كل الحقول التجارية القديمة، باستثناء حقول Audit/Metadata الجديدة التي لم تكن موجودة قبل طبقة الـ Repository هذه).

### 2.5 Filter — **فجوة حقيقية بين تعليمات هذه المرحلة والواجهة الفعلية: لا يوجد حقل "حالة" إطلاقاً لِـ Fees**

`Data_Schema_Specification_Report.md §4.5` و`Repository_Contract_Report.md §4.5` يوثِّقان حقول تصفية محدودة لِـ Fees: `رقم_القضية` ونطاق تاريخ على `تاريخ_الاستلام` فقط. الفحص المباشر لثلاثة مصادر مستقلة يؤكد **عدم وجود** أي حقل "حالة" (`الحالة`) لِـ Fees في أي مكان بالمشروع:

1. `FEES_FIELDS`/`FEES_MAP` في `js/modules/fees.js` — سبعة حقول فقط، لا يوجد بينها أي حقل حالة.
2. نموذج الأتعاب في `index.html` — لا يوجد أي عنصر واجهة لحالة الأتعاب (مقارنة بحقل `fCaseStatus`/`الحالة` الموجود فعلياً في نموذج القضايا فقط).
3. `Code_v4.gs` — أعمدة ورقة `'الأتعاب'`: `['رقم_العملية','رقم_القضية','اسم_الموكل','نوع_الأتعاب','المبلغ','تاريخ_الاستلام','طريقة_الدفع','الملاحظات','تاريخ_الإنشاء']` — لا عمود حالة.

كذلك، **لا يوجد أي عنصر تصفية حي في الواجهة إطلاقاً** لِـ Fees — لا لرقم القضية، لا لطريقة الدفع، لا لنطاق المبلغ، لا لنطاق التاريخ — فقط مربع بحث نصي حر (`#searchFees`). هذا يختلف عن حالة Tasks (5.6) التي كان لديها على الأقل قائمة أولوية حية (`#filterTaskPriority`)؛ هنا **لا يوجد أي عنصر Filter حي إطلاقاً**.

تعليمات هذه المرحلة تطلب تحديداً اختبار: "Status Filter"، "Payment Method Filter"، "Amount Range Filter"، "Date Range Filter" ضمن الـ Harness. بما أن هذه المرحلة تُحظر الافتراض ("ولا تفترض أي شيء")، **لم يُضَف أي حقل حالة وهمي**. القرار المتَّخذ: `filter()` — كما في كل الـ Repositories السابقة — بقيت غلافاً عاماً مدفوعاً بالبيانات (Generic pass-through) بدون أي حقل مُبرمَج مسبقاً. هذا يعني:

- **Payment Method Filter** (`طريقة_الدفع`) — حقل حقيقي موجود في البيانات، يعمل مباشرة عبر `filter()` رغم عدم وجود قائمة منسدلة حية له.
- **Amount Range Filter** (`المبلغ`) — حقل حقيقي، يعمل عبر محرك النطاقات العام في `Repository.js` (`{op, value}`) رغم عدم توثيقه كـ Filter Field رسمي وعدم وجود عنصر واجهة له.
- **Date Range Filter** (`تاريخ_الاستلام`) — حقل حقيقي وموثَّق فعلاً كـ Filter Field في كلا التقريرين، يعمل عبر نفس المحرك.
- **Status Filter** (`الحالة`) — **لا يوجد حقل حقيقي بهذا الاسم لِـ Fees على الإطلاق.** تم تنفيذ الاختبار المطلوب كتحقق من السلوك الآمن: تمرير `{الحالة: 'paid'}` إلى `filter()` **لا يُسبِّب أي خطأ** ويُعيد مصفوفة فارغة بشكل متوقَّع (لأن لا سجل يحمل هذا المفتاح إطلاقاً) — بدلاً من افتراض وجود حقل حالة غير موجود في المخطط الفعلي. هذه الفجوة موثَّقة صراحةً في رأس `FeesRepository.js` (قسم "FILTER").

### 2.6 Sort — قدرة إضافية بحتة، لا تعارض مع سلوك حي (نفس نمط Children/Tasks)

`Data_Schema_Specification_Report.md §4.5` يذكر `تاريخ_الاستلام` كحقل فرز. الفحص المباشر لِـ `renderFees()` الفعلية يؤكد عدم وجود أي `.sort()` إطلاقاً — العرض بترتيب الإدخال في `data.fees` فقط، مطابقاً لنفس اكتشاف Children (5.4) وTasks (5.6). بما أن أولوية هذه المرحلة "Behavior Compatible 100%"، فإن `sort()` هنا قدرة جديدة بحتة (افتراضي: `تاريخ_الاستلام` تصاعدياً)، وليست محاكاة لسلوك حي موجود.

### 2.7 عدم نقل Business Logic — الإجمالي/العدّ يبقيان في `fees.js`

`renderFees()` تحسب `feesTotalNum` (إجمالي المبالغ عبر `reduce`) و`feesCountNum` (عدد السجلات) من `data.fees` الكامل غير المُصفَّى. هذه حسابات عرض (Business/Presentation Logic) صريحة، ولا علاقة لها بطبقة الـ Repository — لم تُنقَل ولم تُكرَّر هنا، مطابقةً صراحةً لتعليمات هذه المرحلة ("لا تنقل أي Business Logic").

### 2.8 عدم إضافة Sync — فجوة الحذف المحلي تبقى كما هي

`Code_v4.gs` يؤكد وجود ورقة `'الأتعاب'` فعلية، و`saveFee()` يستدعي `ApiService.syncRow('الأتعاب', obj, idx)` (الإنشاء/التعديل يُزامَنان)، لكن `deleteFee()` **لا يستدعي** `ApiService.deleteData()`/`syncDeleteToSheets()` إطلاقاً — فجوة موروثة موثَّقة صراحة داخل تعليق `fees.js` نفسه فوق `deleteFee()`، ومطابقة لِـ `Data_Schema_Specification_Report.md §4.5` (`syncPolicy` حذف = local-only) وملاحظة `PROJECT_STATE.md`/`NEXT_PHASE.md` العامة حول "فجوة مزامنة حذف Documents/Tasks/Fees". هذه المرحلة **لا تحل** هذه الفجوة ولا تضيف أي طبقة Sync — طبقة CRUD محلية بحتة فقط، كما هو مطلوب صراحة.

---

## 3. سلامة الملفات السابقة — لم تُلمَس إطلاقاً

| الملف | MD5 (قبل هذه المرحلة) | MD5 (بعد هذه المرحلة) | الحالة |
|---|---|---|---|
| `js/core/Repository.js` | `1159f37eec831920256a727a30dba709` | `1159f37eec831920256a727a30dba709` | ✅ مطابق |
| `js/core/CasesRepository.js` | `f12ff30e02bdfc2da709fe11cfb91fe7` | `f12ff30e02bdfc2da709fe11cfb91fe7` | ✅ مطابق |
| `js/repositories/ClientsRepository.js` | `a6e2a29bd6e96e787c1219ea0d7a8a5b` | `a6e2a29bd6e96e787c1219ea0d7a8a5b` | ✅ مطابق |
| `js/repositories/ChildrenRepository.js` | `a202e04f56de3728361f1bf028ba1061` | `a202e04f56de3728361f1bf028ba1061` | ✅ مطابق |
| `js/core/SessionsRepository.js` | `947de954ef8a09fd3710e8957cc33c04` | `947de954ef8a09fd3710e8957cc33c04` | ✅ مطابق |
| `js/core/TasksRepository.js` | `748c96131b84c5620b4a65b575a17d93` | `748c96131b84c5620b4a65b575a17d93` | ✅ مطابق |
| `js/modules/fees.js` | `54952a4cfd91fcfe51e7a0c3902ce971` | `54952a4cfd91fcfe51e7a0c3902ce971` | ✅ مطابق (لم تُمَس) |
| `index.html` | `bc93f6b82a9a822de620fa77502ed200` | `bc93f6b82a9a822de620fa77502ed200` | ✅ مطابق |
| `Code_v4.gs` | `78bba97e310222740ccebfd6dec110ef` | `78bba97e310222740ccebfd6dec110ef` | ✅ مطابق |

كل ملفات JS في المشروع (بما فيها `FeesRepository.js` و`verify_fees_repository.js` الجديدان) اجتازت `node --check` بنجاح دون أي خطأ Syntax.

---

## 4. الملف الجديد

`js/repositories/FeesRepository.js` — **617 سطراً**. Repository متخصص واحد، يعتمد فقط على `Repository` (المستورَدة من `js/core/Repository.js`)، بلا أي اعتماد آخر على أي ملف مشروع آخر. العمليات المنفَّذة بالضبط: `getAll()`, `get(id)`, `insert(entity)`, `update(id, entity)`, `remove(id)`, `exists(id)`, `count()`, `search()`, `filter()`, `sort()`, `validate()` — بالإضافة إلى `create()`/`update()`/`delete()` الموروثة بلا تغيير (Contract-literal)، وكل عمليات القاعدة الأخرى (`get`, `getAll`, `find`, `exists`, `count`, `bulkInsert`, `bulkUpdate`, `bulkDelete`, `search`, `export`, `import`, `clear`, `transaction`, `open`, `close`) موروثة كما هي دون تعديل.

`js/repositories/verify_fees_repository.js` — **425 سطراً**. Harness مستقل بالكامل (Node.js، لا اعتماد على أي harness سابق)، 46 اختباراً — تفاصيل كاملة في `Fees_Repository_Verification_Report.md`.

---

## 5. الخلاصة

Fees Repository

PASS

Ready For Documents Repository
