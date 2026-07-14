# Documents Repository Report
## نظام الحسام للمحاماة — V10 Offline-First Architecture
### PHASE 5 — SUB-PHASE 5.8 — Documents Repository

---

## ⚠️ Input Gap

| المرجع المطلوب | الحالة |
|---|---|
| `Master_v10_Base.zip` | **غير موجود بهذا الاسم.** العمل استمر على نفس شجرة المشروع المستخرَجة فعلياً من `Master_v10_5_7.zip`. |
| `Repository.js` | ✅ موجود في `js/core/Repository.js`. لم يُعدَّل — MD5 مطابق قبل/بعد (القسم 3 أدناه). |
| `Repository_Contract_Report.md` | ✅ موجود، بالاسم الفعلي `Repository_Contract_Report_PHASE2_V10.md` — القسم 4.7 "Documents" هو المرجع الأساسي هنا. |
| `DatabaseService_Design_Report.md` | ✅ موجود، بالاسم الفعلي `DatabaseService_Design_Report_PHASE3_V10.md` — لم يُستخدَم تفصيلياً (هذه المرحلة لا تلمس DatabaseService). |
| `Data_Schema_Specification_Report.md` | ✅ موجود، بالاسم الفعلي `Data_Schema_Specification_Report_PHASE4_V10.md` — فُحص القسم 4.7 (Documents) بالكامل. |
| `PROJECT_STATE.md` | ✅ موجود بالاسم الحرفي الكامل هذه المرة تحت `docs/` — **لا فجوة تسمية** (تحسُّن عن أرشيف المرحلة السابقة الذي كان يحمل أسماء مرقَّمة). فُحص بالكامل. |
| `PROJECT_HISTORY.md` | ✅ موجود بالاسم الحرفي الكامل — فُحص بالكامل. |
| `NEXT_PHASE.md` | ✅ موجود بالاسم الحرفي الكامل — يحدد Documents Repository صراحة كمرحلة تالية، مع ملاحظات تصميمية مسبقة مفصَّلة (مناقَشة أدناه §2.2–§2.6). |

**فجوة إضافية من المرحلة السابقة — تصحيح تعبئة الأرشيف (لم تعد قائمة):** `Fees_Repository_Report.md` (SUB-PHASE 5.7) وثَّق أن `CasesRepository.js`، `SessionsRepository.js`، و`TasksRepository.js` كانت موجودة فعلياً تحت `js/core/` بدلاً من `js/repositories/`. الفحص المباشر لهذا الأرشيف (`Master_v10_5_7.zip`) يُظهر أن هذا التناقض **لم يعد موجوداً**: كل الـ Repositories الستة السابقة (`CasesRepository.js`، `ClientsRepository.js`، `ChildrenRepository.js`، `SessionsRepository.js`، `TasksRepository.js`، `FeesRepository.js`) موجودة الآن معاً تحت `js/repositories/`، وكل Harnesses التحقق السابقة موجودة معاً تحت `js/tests/`. هذا تصحيح في تعبئة الأرشيف فقط، وليس تغييراً في الكود — لم يُنقَل أو يُعدَّل أو يُعاد تسمية أي من هذه الملفات بواسطة هذه المرحلة. تسليم هذه المرحلة (`DocumentsRepository.js`) أُنشئ في المسار الصحيح الذي تطلبه التعليمات حرفياً: `js/repositories/DocumentsRepository.js`، والـ Harness في `js/tests/verify_documents_repository.js` (نفس مجلد كل Harnesses السابقة).

**خلاصة الفجوة:** لا ملف مرجعي حقيقي غائب أثّر على محتوى هذه المرحلة. الفجوة الوحيدة المتبقية هي غياب `PROJECT_MAP.md` (موثَّقة عبر كل المراحل السابقة، دون أثر على محتوى هذا التسليم).

---

## 1. نطاق هذه المرحلة

ملف واحد فقط: `js/repositories/DocumentsRepository.js` (618 سطراً). يعتمد حصراً على `js/core/Repository.js` (لم يُعدَّل — MD5 مطابق قبل/بعد، القسم 3 أدناه). لا تعديل على `js/repositories/CasesRepository.js`، `js/repositories/ClientsRepository.js`، `js/repositories/ChildrenRepository.js`، `js/repositories/SessionsRepository.js`، `js/repositories/TasksRepository.js`، أو `js/repositories/FeesRepository.js` (لم يُلمَس أي منها، ولا اعتمادية كود منها). لا تعديل على أي Module/HTML/CSS/Apps Script/DatabaseService/ApiService. لا نقل لأي Business Logic (بناء صفوف الجدول، رابط Drive، بطاقات الموبايل في `renderDocuments()` بقيت كما هي في `js/modules/documents.js`). لا إضافة Sync أو Cache.

---

## 2. القرارات التصميمية وأساسها

### 2.1 Storage Adapter المؤقت — نفس نمط Cases/Clients/Children/Sessions/Tasks/Fees

مطابقةً لنفس النمط المتَّبع في كل المراحل السابقة (`NEXT_PHASE.md` لا يزال يترك "Adapter مشترك أم Adapter لكل Repository" قراراً مفتوحاً): Storage Adapter صغير خاص بـ Documents فقط (`createDocumentsLocalStorageAdapter`)، **معرَّف من جديد ومستقل بالكامل** داخل `DocumentsRepository.js` (لا استيراد من أي Repository آخر)، يقرأ/يكتب **نفس** مفتاح `localStorage['documents']` الذي يستخدمه `data.documents`/`saveLocal()` الحاليان بالضبط.

### 2.2 Identifier — نفس نمط التعارض المُحلول في Clients/Children/Sessions/Tasks/Fees، مؤكَّد مجدداً هنا (تماماً كما توقَّع `NEXT_PHASE.md`)

`Data_Schema_Specification_Report.md §4.7` يصف الـ Primary Key بشكل مجرَّد: `id (Hybrid)`. `NEXT_PHASE.md` نبَّه صراحة إلى ضرورة فحص `js/modules/documents.js` مباشرة قبل افتراض `id` عام. الفحص المباشر لِـ `saveDocument()` الفعلية يؤكد نفس النمط للمرة السادسة: المعرِّف المولَّد يُخزَّن فعلياً تحت الحقل العربي `رقم_المستند`:

```js
obj['رقم_المستند']   = obj['رقم_المستند']   || uid();
obj['تاريخ_الإنشاء'] = obj['تاريخ_الإنشاء'] || new Date().toISOString();
```

تأكيد مستقل إضافي: `Code_v4.gs` — `SHEET_DEFS` لِـ `'المستندات'` يبدأ رأس الأعمدة بـ `'رقم_المستند'` حرفياً.

**القرار المتخَذ هنا:** نفس القرار المتَّخذ لِـ Clients/Children/Sessions/Tasks/Fees، بنفس المبرر: `idField: 'رقم_المستند'` مع `_resolveId()` override يولِّد معرِّفاً فقط عند غياب `رقم_المستند`. مولِّد المعرِّف (`generateDocumentId`) نسخة خوارزمية مطابقة حرفياً لِـ `uid()` الفعلية، مُعرَّفة محلياً داخل `DocumentsRepository.js` نفسه (تكرار مستقل، لا اعتمادية عابرة).

### 2.3 Validation — **لا تعارض بين التقرير والكود، ولا أي تفاوت داخلي بين الحقلين (خلافاً لِـ Fees)**

`Data_Schema_Specification_Report.md §4.7` يذكر حقلين إلزاميين: `رقم_القضية` و`اسم_المستند`. الفحص المباشر لِـ `saveDocument()` الفعلية يؤكد ذلك تماماً:

```js
var c = document.getElementById('fDocCaseNum').value.trim();
var n = document.getElementById('fDocName').value.trim();
if (!c || !n) {
  toast('يرجى ملء رقم القضية واسم المستند', 'error');
  return;
}
```

**ملاحظة مهمة تميِّز هذه المرحلة عن Fees (5.7):** كلا الحقلين `c` (رقم_القضية) و`n` (اسم_المستند) يُقرآن بعد `.trim()` قبل فحص الفراغ — **لا يوجد أي تفاوت داخلي** بينهما، خلافاً للتفاوت المتعمَّد الذي وُجِد ووُثِّق في Fees (حيث `المبلغ` يُفحص خاماً بلا `.trim()`). هذه أول مرة منذ Tasks (5.6) لا يوجد فيها أي تعارض على قائمة الحقول الإلزامية **ولا** أي تفاوت داخلي في طريقة الفحص — زوج متماثل تماماً. `_validate()` في `DocumentsRepository.js` يطبِّق نفس قاعدة "غير فارغ بعد trim" على كلا الحقلين بالتساوي، مطابقةً للسلوك الفعلي بالضبط — تم التحقق بالاختبارات "validate() rejects whitespace-only رقم_القضية" و"validate() ALSO rejects whitespace-only اسم_المستند" في التقرير التالي.

بالإضافة إلى ذلك، `Data_Schema_Specification_Report.md §4.7` يذكر صراحة أن `رابط_Drive` نص حر بلا تحقق URL صارم: *"لا تحقق URL صارم حالياً — `ApiService.uploadFile` موجودة لكن غير مستخدَمة فعلياً"*. لم تُضَف أي فحص لصيغة الرابط في `_validate()`، مطابقةً لهذه التوصية الصريحة وللكود الفعلي (الذي لا يتحقق من شكل `رابط_Drive` إطلاقاً قبل الحفظ في `saveDocument()`).

### 2.4 Search — نفس النمط المتكرر: البحث الفعلي أوسع مما يصفه التقرير

`Data_Schema_Specification_Report.md §4.7` يحصر حقل البحث في: `اسم_المستند` فقط (حقل واحد، أضيق حتى من الحقلين اللذين ادَّعتهما التقارير لـ Fees). الفحص المباشر لِـ `renderDocuments()` الفعلية (`js/modules/documents.js`) يُظهر النمط المتكرر ذاته للمرة السابعة على التوالي منذ Cases: البحث ليس محصوراً بحقل واحد، بل بحث نصي حر عبر كل السجل:

```js
var rows = data.documents.filter(function(d) {
  var t = Object.values(d).join(' ').toLowerCase();
  return (!s || t.includes(s)) && (!ty || d['نوع_المستند'] === ty);
});
```

مربوطاً فعلياً بحقل بحث حي (`#searchDocuments`, `oninput="renderDocuments()"`). لأن أولوية هذه المرحلة الصريحة هي "Behavior Compatible 100% مع Documents Module الحالي" — وسلوك واجهة حي فعلي أقوى دليلاً من حقل واحد في تقرير تخطيطي مجرَّد — تم Override لِـ `_matchesSearch` لمطابقة سلوك الانضمام النصي الحر بالضبط عبر `DOCUMENTS_LEGACY_FIELDS` (كل الحقول التجارية القديمة، باستثناء حقول Audit/Metadata الجديدة التي لم تكن موجودة قبل طبقة الـ Repository هذه).

### 2.5 Filter — **أول مرة منذ Tasks (5.6) يوجد فيها فعلياً عنصر تصفية حي — خلافاً تماماً لِـ Fees (5.7) التي لم يكن لديها أي عنصر تصفية إطلاقاً**

`Data_Schema_Specification_Report.md §4.7` و`Repository_Contract_Report.md §4.7` يوثِّقان حقلي تصفية لِـ Documents: `رقم_القضية` و`نوع_المستند`. الفحص المباشر لثلاثة مصادر مستقلة (`index.html`، `renderDocuments()`، `Code_v4.gs`) يؤكد:

1. `#filterDocType` — عنصر `<select>` **حي وفعلي** (`onchange="renderDocuments()"`) بقيمة افتراضية "كل الأنواع" وسبع قيم ثابتة: عقد زواج، شهادة ميلاد، مفردات مرتب، محضر، إيصال، حكم، مستند آخر.
2. `renderDocuments()` تُطبِّق هذا الفلتر فعلياً كمساواة تامة **بالإضافة إلى** البحث النصي الحر، وليس بدلاً منه: `(!ty || d['نوع_المستند'] === ty)`.
3. `رقم_القضية`، بالمقابل، **لا يملك أي عنصر واجهة تصفية حي على الإطلاق** — حقل حقيقي، موثَّق كـ Filter Field، لكن غير مربوط بأي Dropdown أو Input.

هذا يختلف جوهرياً عن حالة Fees (5.7) التي لم يكن لديها **أي** عنصر تصفية حي إطلاقاً، ويشبه (لكن يتجاوز) حالة Tasks (5.6) التي كان لديها `#filterTaskPriority` حياً فقط. القرار المتَّخذ هنا (كما في كل الـ Repositories السابقة): `filter()` بقيت غلافاً عاماً مدفوعاً بالبيانات (Generic pass-through) بدون أي حقل مُبرمَج مسبقاً — وهذا يعني أن الفلتر الحي الفعلي (`نوع_المستند`) والفلتر غير الحي الموثَّق (`رقم_القضية`) كلاهما يعملان تلقائياً عبر نفس المحرك العام دون أي Override خاص. **Status Filter** — كما في Fees — لا يوجد حقل `الحالة` إطلاقاً لِـ Documents في أي مصدر (لا `DOCUMENTS_FIELDS`/`DOCUMENTS_MAP`، لا `index.html`، لا أعمدة `Code_v4.gs`)؛ تم التحقق من السلوك الآمن (لا رمي خطأ، نتيجة فارغة) تماماً كما فُعل مع Fees.

### 2.6 Sort — قدرة إضافية بحتة، لا تعارض مع سلوك حي (نفس نمط Children/Tasks/Fees)

`Data_Schema_Specification_Report.md §4.7` يذكر `تاريخ_الإيداع` كحقل فرز. الفحص المباشر لِـ `renderDocuments()` الفعلية يؤكد عدم وجود أي `.sort()` إطلاقاً — العرض بترتيب الإدخال في `data.documents` فقط، مطابقاً لنفس اكتشاف Children (5.4)، Tasks (5.6)، وFees (5.7). بما أن أولوية هذه المرحلة "Behavior Compatible 100%"، فإن `sort()` هنا قدرة جديدة بحتة (افتراضي: `تاريخ_الإيداع` تصاعدياً)، وليست محاكاة لسلوك حي موجود.

### 2.7 عدم نقل Business Logic — بناء الصفوف/البطاقات وروابط Drive يبقيان في `documents.js`

`renderDocuments()` تبني HTML للجدول وبطاقات الموبايل، بما في ذلك رابط `<a>` مشروط لفتح `رابط_Drive` في تبويب جديد. هذا Presentation Logic صريح، ولا علاقة له بطبقة الـ Repository — لم يُنقَل ولم يُكرَّر هنا، مطابقةً صراحةً لتعليمات هذه المرحلة ("لا تنقل أي Business Logic").

### 2.8 عدم إضافة Sync — فجوة الحذف المحلي تبقى كما هي، وهذه المرة موثَّقة صراحةً داخل الكود نفسه

`Code_v4.gs` يؤكد وجود ورقة `'المستندات'` فعلية، و`saveDocument()` يستدعي `ApiService.syncRow('المستندات', obj, idx)` (الإنشاء/التعديل يُزامَنان)، لكن `deleteDocument()` **لا يستدعي** `ApiService.deleteData()`/`syncDeleteToSheets()` إطلاقاً. خلافاً لِـ Fees (حيث هذه الفجوة موثَّقة فقط في التقارير التخطيطية)، هنا `js/modules/documents.js` نفسه يحمل تعليق JSDoc صريح فوق `deleteDocument()` يذكر هذه الفجوة حرفياً كـ"NOTE: Preserves original behaviour exactly" ويشير إلى `DOCUMENTS_MODULE_REPORT.md` كتوثيق سابق لها — أوضح توثيق ذاتي لهذه الفجوة عبر كل الكيانات حتى الآن. هذه المرحلة **لا تحل** هذه الفجوة ولا تضيف أي طبقة Sync — طبقة CRUD محلية بحتة فقط، كما هو مطلوب صراحة.

---

## 3. سلامة الملفات السابقة — لم تُلمَس إطلاقاً

| الملف | MD5 (قبل هذه المرحلة) | MD5 (بعد هذه المرحلة) | الحالة |
|---|---|---|---|
| `js/core/Repository.js` | `1159f37eec831920256a727a30dba709` | `1159f37eec831920256a727a30dba709` | ✅ مطابق |
| `js/repositories/CasesRepository.js` | `f12ff30e02bdfc2da709fe11cfb91fe7` | `f12ff30e02bdfc2da709fe11cfb91fe7` | ✅ مطابق |
| `js/repositories/ClientsRepository.js` | `a6e2a29bd6e96e787c1219ea0d7a8a5b` | `a6e2a29bd6e96e787c1219ea0d7a8a5b` | ✅ مطابق |
| `js/repositories/ChildrenRepository.js` | `a202e04f56de3728361f1bf028ba1061` | `a202e04f56de3728361f1bf028ba1061` | ✅ مطابق |
| `js/repositories/SessionsRepository.js` | `947de954ef8a09fd3710e8957cc33c04` | `947de954ef8a09fd3710e8957cc33c04` | ✅ مطابق |
| `js/repositories/TasksRepository.js` | `748c96131b84c5620b4a65b575a17d93` | `748c96131b84c5620b4a65b575a17d93` | ✅ مطابق |
| `js/repositories/FeesRepository.js` | `117a6e3f4659fe624ba9bd81f7d00804` | `117a6e3f4659fe624ba9bd81f7d00804` | ✅ مطابق |
| `js/modules/documents.js` | `85b117b1c631374246d0623eb18184d4` | `85b117b1c631374246d0623eb18184d4` | ✅ مطابق (لم تُمَس) |
| `index.html` | `bc93f6b82a9a822de620fa77502ed200` | `bc93f6b82a9a822de620fa77502ed200` | ✅ مطابق |
| `Code_v4.gs` | `78bba97e310222740ccebfd6dec110ef` | `78bba97e310222740ccebfd6dec110ef` | ✅ مطابق |

كل ملفات JS في المشروع (بما فيها `DocumentsRepository.js` و`verify_documents_repository.js` الجديدان) اجتازت `node --check` بنجاح دون أي خطأ Syntax.

---

## 4. الملف الجديد

`js/repositories/DocumentsRepository.js` — **618 سطراً**. Repository متخصص واحد، يعتمد فقط على `Repository` (المستورَدة من `js/core/Repository.js`)، بلا أي اعتماد آخر على أي ملف مشروع آخر. العمليات المنفَّذة بالضبط: `getAll()`, `get(id)`, `insert(entity)`, `update(id, entity)`, `remove(id)`, `exists(id)`, `count()`, `search()`, `filter()`, `sort()`, `validate()` — بالإضافة إلى `create()`/`update()`/`delete()` الموروثة بلا تغيير (Contract-literal)، وكل عمليات القاعدة الأخرى (`get`, `getAll`, `find`, `exists`, `count`, `bulkInsert`, `bulkUpdate`, `bulkDelete`, `search`, `export`, `import`, `clear`, `transaction`, `open`, `close`) موروثة كما هي دون تعديل.

`js/tests/verify_documents_repository.js` — **553 سطراً**. Harness مستقل بالكامل (Node.js، لا اعتماد على أي harness سابق)، **61 اختباراً** (يتجاوز الحد الأدنى المطلوب — 45) — تفاصيل كاملة في `Documents_Repository_Verification_Report.md`.

---

## 5. الخلاصة

Documents Repository

PASS

Ready For Library Repository
