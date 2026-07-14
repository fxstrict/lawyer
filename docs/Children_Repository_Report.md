# Children Repository Report
## نظام الحسام للمحاماة — V10 Offline-First Architecture
### PHASE 5 — SUB-PHASE 5.4 — Children Repository

---

## ⚠️ Input Gap

| المرجع المطلوب | الحالة |
|---|---|
| `Master_v10_Base.zip` | **غير موجود بهذا الاسم.** لا يوجد رفع جديد لأي أرشيف في هذه المرحلة؛ العمل استمر على نفس شجرة المشروع المستخرَجة سابقاً من `Master_v10_5_2.zip` (`Master_v10.5.2/`)، نفس القبول الموثَّق في `Cases_Repository_Report.md` و`Clients_Repository_Report.md`. |
| `Repository_Core_Report.md` | ✅ موجود — تمت مراجعته سابقاً في المرحلتين 5.2/5.3، ولم يتغيّر. |
| `Repository_Core_Verification_Report.md` | ✅ موجود — كما سبق. |
| `Cases_Repository_Report.md` | ✅ موجود — كما سبق. |
| `Cases_Repository_Verification_Report.md` | ✅ موجود — كما سبق. |
| `Clients_Repository_Report.md` | ✅ موجود (تم إنشاؤه في SUB-PHASE 5.3) — تمت مراجعته للتأكد من نمط القرارات المتَّبع (Storage Adapter مؤقت، `_resolveId` override، إلخ)، دون الاعتماد عليه في أي تفصيل خاص بـ Children (لا اعتمادية كود بين الملفين — فقط نمط تصميمي). |
| `Clients_Repository_Verification_Report.md` | ✅ موجود — كما سبق، نموذج مرجعي لبنية تقرير التحقق فقط. |
| `Repository_Contract_Report.md` | ✅ موجود، بالاسم الفعلي `Repository_Contract_Report_PHASE2_V10.md` — القسم 4.3 "Children Repository" هو المرجع الأساسي هنا. |
| `DatabaseService_Design_Report.md` | ✅ موجود، بالاسم الفعلي `DatabaseService_Design_Report_PHASE3_V10.md` — لم يُستخدَم تفصيلياً (لا علاقة مباشرة بمنطق Children). |
| `Data_Schema_Specification_Report.md` | ✅ موجود، بالاسم الفعلي `Data_Schema_Specification_Report_PHASE4_V10.md` — فُحص القسم 4.3 (Children) بالكامل، المرجع الأساسي لحقول هذا الكيان. |
| `PROJECT_STATE.md` | ✅ موجود. **تمت تسوية الانشقاق بين `PROJECT_STATE.md` و`PROJECT_STATE (7).md` في نهاية SUB-PHASE 5.3** (النسختان متطابقتان تماماً منذ ذلك الحين، مؤكَّد بـ `diff` في بداية هذه المرحلة أيضاً) — لا فجوة متبقية هنا. |
| `PROJECT_HISTORY.md` | موجود فقط باسم مرقَّم `doc/PROJECT_HISTORY (5).md` (لا تغيير في هذه الفجوة منذ SUB-PHASE 5.3). فُحص بالكامل، لا فجوة محتوى. |
| `PROJECT_MAP.md` | **لا يزال غير موجود إطلاقاً في هذا الأرشيف** — نفس الفجوة الموثَّقة في المرحلتين السابقتين. لم يُستخدَم؛ كل تفاصيل حقول Children مأخوذة مباشرة من `Data_Schema_Specification_Report.md §4.3` + فحص مباشر لِـ `js/modules/children.js`، `index.html` (`FIELDS.children`/`MAP.children`)، و`Code_v4.gs`. |
| `NEXT_PHASE.md` | موجود فقط باسم مرقَّم `doc/NEXT_PHASE (5).md`. فُحص بالكامل — يحدد Children Repository صراحة كمرحلة تالية، مع ملاحظات تصميمية مسبقة (مناقَشة أدناه §2.2 و§2.4). |

**خلاصة الفجوة:** لا ملف مرجعي حقيقي غائب أثّر على محتوى هذه المرحلة. الاختلافات الوحيدة الباقية هي نفسها المرحّلة من قبل: (1) اسم أرشيف الكود المصدري، (2) بعض الملفات موجودة بأسماء مرقَّمة بدل الاسم الحرفي المطلوب، (3) غياب `PROJECT_MAP.md` كلياً (غير مؤثِّر). لا تعارض جديد في مواقع الملفات هذه المرة — تم إنشاء `js/repositories/ChildrenRepository.js` مباشرة في المسار الصحيح المطلوب.

---

## 1. نطاق هذه المرحلة

ملف واحد فقط: `js/repositories/ChildrenRepository.js`. يعتمد حصراً على `js/core/Repository.js` (لم يُعدَّل). لا تعديل على `js/core/CasesRepository.js` أو `js/repositories/ClientsRepository.js` (لم يُلمَسا، ولا اعتمادية كود منهما — القسم 3 أدناه). لا تعديل على أي Module/HTML/CSS/Apps Script/DatabaseService/ApiService.

---

## 2. القرارات التصميمية وأساسها

### 2.1 Storage Adapter المؤقت — نفس نمط Cases/Clients

مطابقةً لنفس النمط المتَّبع في SUB-PHASE 5.2 و5.3 (`NEXT_PHASE.md` لا يزال يترك "Adapter مشترك أم Adapter لكل Repository" قراراً مفتوحاً): Storage Adapter صغير خاص بـ Children فقط (`createChildrenLocalStorageAdapter`)، **معرَّف من جديد ومستقل بالكامل** داخل `ChildrenRepository.js` (لا استيراد من `ClientsRepository.js` أو `CasesRepository.js` — يعتمد الملف حصراً على `Repository.js` كما تنص تعليمات هذه المرحلة صراحة)، يقرأ/يكتب **نفس** مفتاح `localStorage['children']` الذي يستخدمه `data.children`/`saveLocal()` الحاليان بالضبط (مؤكَّد بفحص `index.html` مباشرة — `data.children: JSON.parse(localStorage.getItem('children')||'[]')`).

### 2.2 Identifier — نفس نمط التعارض المُحلول في Clients، مؤكَّد مجدداً هنا

`Data_Schema_Specification_Report.md §4.3` يصف الـ Primary Key بشكل مجرَّد: `id (Hybrid)`. لكن الفحص المباشر لِـ `saveChild()` الفعلية في `js/modules/children.js` (السطر 38) يُظهر أن المعرِّف المولَّد يُخزَّن فعلياً تحت الحقل العربي `رقم_الطفل`، وليس تحت حقل عام `id`:

```js
obj['رقم_الطفل']    = obj['رقم_الطفل']    || uid();
obj['تاريخ_الإنشاء'] = obj['تاريخ_الإنشاء'] || new Date().toISOString();
```

**القرار المتخَذ هنا:** نفس القرار المتَّخذ لِـ Clients في SUB-PHASE 5.3 §2.2، بنفس المبرر ("Behavior Compatible 100% مع Children Module الحالي"):
- `idField: 'رقم_الطفل'` يُمرَّر للـ constructor الأساسي (بدل `idField: null`/`id` عام).
- `_resolveId()` عُدِّلت في `ChildrenRepository` (تعريف مستقل، غير مستورَد من `ClientsRepository`) لتوليد معرِّف فقط عند غياب `رقم_الطفل`، مطابِقةً حرفياً لنمط `|| uid()` في `saveChild()`.
- مولِّد المعرِّف (`generateChildId`) نسخة خوارزمية مطابقة حرفياً لِـ `uid()` الفعلية في `js/ui-utils.js`، مُعرَّفة محلياً داخل `ChildrenRepository.js` نفسه (تكرار مستقل لنفس النمط المستخدَم في `ClientsRepository.js`، وليس استيراداً منه — لا اعتمادية عابرة بين ملفات الـ Repositories مسموحة هذه المرحلة).

### 2.3 Validation — لا تعارض بين أي من المصادر الثلاثة

`Data_Schema_Specification_Report.md §4.3`، `Repository_Contract_Report.md §4.3`، والفحص المباشر لِـ `saveChild()` الفعلية (`js/modules/children.js`، السطر 38) متفقة جميعها: **حقلان** إلزاميان — `رقم_القضية` و`الاسم`:

```js
var c=document.getElementById('fChildCaseNum').value.trim();
var n=document.getElementById('fChildName').value.trim();
if(!c||!n){toast('يرجى ملء رقم القضية واسم الطفل','error');return;}
```

(`c` يُطابَق عبر `MAP.children` إلى `رقم_القضية`، و`n` إلى `الاسم`.) لا تعارض هنا بين أي من المصادر الثلاثة؛ `_validate()` تفرض الحقلين معاً، غير فارغين بعد `.trim()`.

### 2.4 Search — تعارض موثَّق ضد **كلا** التقريرين الرسميين، وليس توصية استشرافية واحدة فقط

هذه أهم فجوة اكتُشفت في هذه المرحلة، وأقوى من حالة Clients §2.2/§2.4 (تعارض واحد هناك). **كلا** المصدرين الرسميين يذكران صراحة عدم وجود بحث نصي حر لـ Children:

> `Data_Schema_Specification_Report.md §4.3`: "**Search Fields**: لا بحث نصي حر موثَّق حالياً — فلترة فقط"
> `Repository_Contract_Report.md §4.3`: "**نوع البحث:** فلترة حسب `رقم_القضية` فقط عملياً (**لا بحث نصي حر موثّق في الكود الحالي**)"

لكن الفحص المباشر لِـ `renderChildren()` الفعلية (`js/modules/children.js`، السطر 46) يُظهر العكس تماماً — نفس نمط البحث النصي الحر الكامل المستخدَم فعلاً في `renderCases()`/`renderClients()`:

```js
var rows=data.children.filter(function(c){
  return !s||Object.values(c).join(' ').toLowerCase().includes(s);
});
```

وهذا مربوط فعلياً بحقل بحث حي وفعّال في الواجهة (`index.html`، السطر 121: `<input type="text" id="searchChildren" ... oninput="renderChildren()">`) — وليس كوداً ميتاً أو دالة غير مستخدَمة.

**القرار المتخَذ هنا:** بما أن أولوية هذه المرحلة المعلَنة صراحة هي **"Behavior Compatible 100% مع Children Module الحالي"** — وبما أن دليل سلوك واجهة حية ومربوطة فعلياً اليوم أقوى من توصية تقرير تخطيطي مجرَّد (خصوصاً عندما يتفق تقريران رسميان منفصلان على نفس الافتراض غير الدقيق) — تم اعتماد السلوك الفعلي المُتحقَّق منه مباشرة، وليس ما يذكره أي من التقريرين:
- `_matchesSearch` عُدِّلت في `ChildrenRepository` لتكرار نفس نمط `Object.values(c).join(' ')` عبر `CHILDREN_LEGACY_FIELDS` (كل الحقول القانونية العربية القديمة، باستثناء الحقول البنيوية الجديدة كما في Cases/Clients).
- لا توجد قائمة "Search Fields" رسمية أضيق محفوظة كإعداد بديل (خلافاً لـ Clients التي احتفظت بـ `CLIENTS_SEARCH_FIELDS` كخيار مستقبلي)، لأن كلا المصدرين لا يقترحان أي قائمة أضيق أصلاً — الإعداد `searchFields` في الـ constructor يُمرَّر مباشرة كـ `CHILDREN_LEGACY_FIELDS` الكاملة.

**هذا الانحراف موثَّق بوضوح هنا (وفي تعليق رأس الملف "SEARCH")، وليس "مُصحَّحاً بصمت" — القرار قابل للمراجعة من طرف المهندس المسؤول لاحقاً إذا تبيَّن أن سلوك `renderChildren()` نفسه غير مقصود أصلاً (كود قديم لم يُراجَع عند الفصل).**

### 2.5 Filter / Sort

`filterFields` (`رقم_القضية`) مطابقة حرفياً لِـ `Data_Schema_Specification_Report.md §4.3` **و**`Repository_Contract_Report.md §4.3` معاً (اتفاق تام، وهو أيضاً النمط الاستعلامي الوحيد الفعلي المستخدَم اليوم — "أطفال قضية معيّنة"). `sortFields` (`تاريخ_الميلاد`) من `Data_Schema_Specification_Report.md §4.3` فقط (لا ذكر للفرز في `Repository_Contract_Report.md §4.3`). السلوك الفعلي الحالي لـ `renderChildren()` لا يطبّق أي فرز مبرمَج إطلاقاً (بحث نصي حر فقط، بترتيب الإدخال) — لذلك `sort()` هنا وظيفة إضافية جديدة (Additive)، لا تستبدل أي سلوك موجود، تماماً كما في Cases/Clients.

### 2.6 Soft Delete

`softDelete: true` مطابقة لِـ `Data_Schema_Specification_Report.md §4.3 Delete Rules` ("Soft Delete على مستوى Schema"). يختلف هذا عمداً عن `deleteChild()` الفعلية اليوم (حذف نهائي فوري عبر `splice`) — نفس نمط الاختلاف المصمَّم مسبقاً والمعتمَد في Cases/Clients؛ طبقة الـ Repository الجديدة تُقدِّم Soft Delete كسياسة مستقبلية صريحة دون استبدال `deleteChild()` الفعلية في هذه المرحلة (الملف غير مُوصَّل بعد بأي HTML/Module).

### 2.7 فجوة المزامنة (`syncPolicy`) — مؤكَّدة، غير مُعالَجة في هذه المرحلة

فحص `Code_v4.gs` (`SHEET_DEFS`) يؤكد عدم وجود أي Sheet باسم `الأطفال` في الـ Backend، رغم أن `saveChild()` تستدعي `syncToSheets('الأطفال', obj, idx)` فعلياً عند وجود `API_URL`، وأن `js/modules/settings.js` (السطر 122) يُدرِج الزوج `['الأطفال','children']` ضمن `loadFromSheets()`. هذه فجوة موروثة موثَّقة سلفاً (مذكورة في تدقيق سابق ضمن `PROJECT_STATE.md`)، وموثَّقة أيضاً صراحة في كلا التقريرين الرسميين (`Data_Schema_Specification_Report.md §4.3`: `"syncPolicy = local-only"`؛ `Repository_Contract_Report.md §4.3`: يطلب تصميم `syncPolicy` قابل للتفعيل لاحقاً دون تغيير الـ Contract).

**لم تُعالَج هذه الفجوة في هذه المرحلة** — `ChildrenRepository.js` **لا** يستدعي `ApiService`/`syncToSheets`/`fetch` إطلاقاً (ممنوع صراحة في تعليمات هذه المرحلة، ومطابق لِـ `CasesRepository`/`ClientsRepository` اللتين لا تُزامنان أيضاً). مفهوم `syncPolicy` بالتالي لا ينطبق بعد على أي Repository أُنشئت حتى الآن (Cases، Clients، Children) — لا شيء هنا يمنع إضافة طبقة مزامنة فوق هذا الـ Repository لاحقاً دون تغيير الـ Contract، لكن حسم القرار السياسي نفسه (تفعيل مزامنة حذف الأطفال أم لا) خارج نطاق هذه المرحلة تماماً.

### 2.8 التسمية — insert/remove/filter/sort/validate مقابل Contract §19

نفس الحل المعتمَد في Cases §2.7 وClients §2.7 بالضبط: كل عمليات الـ Contract الحرفية موروثة دون أي تغيير من `Repository.prototype`. إضافةً لذلك، عُرِّفت `insert()`/`remove()`/`filter()`/`sort()`/`validate()` كـ Wrappers إضافية رقيقة (لا تستبدل ولا تُعيد تسمية أي عملية Contract):
- `insert(entity)` → `this.create(entity)`
- `remove(id)` → `this.delete(id)`
- `filter(filterObj)` → `this.search({filter: filterObj}).items`
- `sort(records?, sortSpec?)` → غلاف حول محرك المقارنة الداخلي `_compareRecords`
- `validate(record, operation?)` → غلاف عام حول hook الـ `_validate` المحمي

### 2.9 خارج النطاق — Embedded Children وتكرار البيانات

`Repository_Contract_Report.md §4.2/§15/§17` يوثِّق تعارضاً بنيوياً موجوداً بالفعل: بيانات الأطفال يمكن إدخالها إما Embedded داخل حقل `أطفال_القضية` في سجل القضية نفسه (عبر `toggleChildrenSection`/`addChildRow`/`updateChildrenData`/`loadChildrenRows` في `js/modules/cases.js`)، أو عبر صفحة "الأطفال" المستقلة (`data.children[]`، التي تديرها `ChildrenRepository` هذه). هذا الـ Repository **يغطي فقط** `data.children[]` المستقل (نفس نطاق `js/modules/children.js` المحدَّد صراحة في تعليقه الرأسي §"SCOPE NOTE") — **لا** يمسّ أو يحاول حل تكرار البيانات مع الحقل المضمَّن داخل Cases؛ هذا القرار المعماري (دمج المصدرين أو إبقاؤهما منفصلين) مؤجَّل صراحة في `Repository_Contract_Report.md §15/§17` ولم يُحسَم هنا.

---

## 3. ما لم يُعدَّل (تأكيد Diff)

- `js/core/Repository.js` — **لم يُلمَس إطلاقاً** (MD5 قبل/بعد متطابق تماماً — القسم 4 من تقرير التحقق).
- `js/core/CasesRepository.js` — **لم يُلمَس إطلاقاً** (MD5 متطابق).
- `js/repositories/ClientsRepository.js` — **لم يُلمَس إطلاقاً** (MD5 متطابق؛ بصمة زمنية للملف تسبق بداية هذه المرحلة، مؤكِّدة عدم أي كتابة عليه في هذه الجلسة).
- `js/modules/children.js`, `js/modules/clients.js`, `index.html`, أي CSS، `Code_v4.gs` — **لم يُلمَس أي منها إطلاقاً**.
- `DatabaseService`/`ApiService` — لم يُعدَّلا، ولم يُستدعَيا من `ChildrenRepository.js` بأي شكل.

---

## 4. الملف المُسلَّم

`js/repositories/ChildrenRepository.js` — Repository متخصص واحد، يعتمد فقط على `Repository` (المستورَدة من `js/core/Repository.js`)، بلا أي اعتماد آخر على أي ملف مشروع آخر (لا `data`, لا `FIELDS`/`MAP`, لا `document.*`, لا `toast()`, لا `js/ui-utils.js`, لا `ApiService`/`syncToSheets`/`API_URL`, ولا استيراد من `CasesRepository.js`/`ClientsRepository.js`).

يُصدِّر (CommonJS + `window`/`globalThis`): `ChildrenRepository`, `createChildrenLocalStorageAdapter`.

تفاصيل التحقق الكامل، بما فيها Harness مستقل بالكامل (`verify_children_repository.js`، لا يشارك أي كود مع Harness الخاص بـ Clients أو Cases): `Children_Repository_Verification_Report.md`.

---

## 5. Ready For Sessions Repository

هذا الملف مضاف بالكامل، خامل (Inert) — لا `<script>` يُشير إليه في `index.html`. جاهز كنموذج مرجعي لبناء `SessionsRepository` التالية، مطابقةً لترتيب الترحيل الموثَّق حرفياً في `Data_Schema_Specification_Report.md §"ترتيب تنفيذ Schema"` (`... Clients → Children → Sessions → Cases ...`) وفي `Repository_Contract_Report.md §16`:
- **معرِّف Sessions:** `Data_Schema_Specification_Report.md §4.4` يذكره أيضاً كـ `id (Hybrid)` عام — بناءً على الدرس المتكرِّر الآن مرتين (Clients، Children)، **يجب** فحص `js/modules/sessions.js` مباشرة أولاً لتأكيد اسم الحقل الفعلي (على الأرجح `رقم_الجلسة` بالقياس، لكن غير مؤكَّد بعد بلا فحص مباشر) قبل أي افتراض.
- **بحث نصي:** خلافاً لـ Children، كلا التقريرين الرسميين يوثِّقان بحث نصي فعلي لـ Sessions (`عنوان_القضية`, `رقم_القضية`) — يحتاج تأكيداً مستقلاً من `renderSessions()` الفعلية بنفس منهجية §2.4 هنا (هل يطابق حقلين محدَّدين فقط، أم بحثاً حراً كاملاً كما تبيَّن مراراً لـ Cases/Clients/Children؟).
- **حقول مركَّبة:** `(رقم_القضية + التاريخ)` مذكورة كـ Composite Index — قد تحتاج فرزاً افتراضياً مركَّباً وليس حقلاً واحداً فقط، خلافاً لكل الـ Repositories السابقة.
- **تطبيع بيانات:** `Repository_Contract_Report.md §4.4` يشير صراحة إلى أن `sanitizeTime()` المطبَّقة اليوم على حقل `الوقت` عند `DOMContentLoaded` (وليس داخل `saveSession()` نفسها) يجب أن "تنتقل لتصبح جزءاً من Validation/Normalization Layer داخل الـ Repository" — قرار تصميمي يحتاج فحصاً دقيقاً لموضع `sanitizeTime()` الفعلي قبل تنفيذه.

---

# Children Repository Review

**PASS**

**Ready For Sessions Repository**
