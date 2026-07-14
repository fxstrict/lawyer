# Clients Repository Report
## نظام الحسام للمحاماة — V10 Offline-First Architecture
### PHASE 5 — SUB-PHASE 5.3 — Clients Repository

---

## ⚠️ Input Gap

| المرجع المطلوب | الحالة |
|---|---|
| `Master_v10_Base.zip` | **غير موجود بهذا الاسم.** الملف المرفوع فعلياً في هذه المحادثة كان `Master_v10_5_2.zip` (يفكّ إلى مجلد `Master_v10.5.2/`). يُعتمَد هذا كمصدر الكود الفعلي البديل — نفس نمط القبول الموثَّق في `Repository_Core_Report.md` و`Cases_Repository_Report.md`. |
| `Repository_Core_Report.md` | ✅ موجود، مطابق للاسم — فُحص بالكامل. |
| `Repository_Core_Verification_Report.md` | ✅ موجود، مطابق للاسم — فُحص بالكامل. |
| `Cases_Repository_Report.md` | ✅ موجود، مطابق للاسم — فُحص بالكامل، النموذج المرجعي المباشر لهذه المرحلة. |
| `Cases_Repository_Verification_Report.md` | ✅ موجود، مطابق للاسم — فُحص بالكامل. |
| `Repository_Contract_Report.md` | ✅ موجود، بالاسم الفعلي `Repository_Contract_Report_PHASE2_V10.md` — فُحص بالكامل (القسم 4.2 "Clients Repository" هو المرجع الأساسي هنا). |
| `DatabaseService_Design_Report.md` | ✅ موجود، بالاسم الفعلي `DatabaseService_Design_Report_PHASE3_V10.md`. |
| `Data_Schema_Specification_Report.md` | ✅ موجود، بالاسم الفعلي `Data_Schema_Specification_Report_PHASE4_V10.md` — فُحص بالكامل، المرجع الأساسي لحقول Clients (§4.2). |
| `PROJECT_STATE.md` | ✅ موجود بنسختين: `doc/PROJECT_STATE.md` (الأقدم) و`doc/PROJECT_STATE (7).md` (الأحدث). فُحص الفرق بينهما (`diff`) — النسخة (7) نسخة فائقة تحتوي على كل محتوى النسخة الأولى بالإضافة إلى قسمَي Repository Core وCases Repository (15، 16). اعتُمدت النسخة (7) كمرجع رسمي وحيد لهذه المرحلة. |
| `PROJECT_HISTORY.md` | موجود فقط باسم مرقَّم `doc/PROJECT_HISTORY (5).md` — لا يوجد ملف بالاسم الحرفي `PROJECT_HISTORY.md` في هذا الأرشيف. فُحص بالكامل، لا فجوة محتوى. |
| `PROJECT_MAP.md` | **غير موجود إطلاقاً في هذا الأرشيف** — نفس الفجوة الموثَّقة سابقاً في `Cases_Repository_Report.md` (لم يكن موجوداً حتى في الأرشيفات الأقدم). لم يُستخدَم؛ لا حاجة له — كل تفاصيل الحقول مأخوذة مباشرة من `Data_Schema_Specification_Report.md §4.2` + فحص مباشر لِـ `js/modules/clients.js` و`Code_v4.gs`. |
| `NEXT_PHASE.md` | موجود فقط باسم مرقَّم `doc/NEXT_PHASE (5).md` — فُحص بالكامل. يحتوي توصية تصميمية مسبقة بخصوص Clients (مقتبسة ومناقَشة في القسم 2.2 أدناه) استُبدلت هنا بسلوك الكود الفعلي المتحقَّق منه مباشرة. |

**فجوة إضافية اكتُشفت أثناء الفحص (غير مطلوبة في قائمة المراجع لكن مؤثِّرة على موضع الملف):**
`Cases_Repository_Report.md §4` و`Cases_Repository_Verification_Report.md` يذكران أن الملف المُسلَّم في SUB-PHASE 5.2 هو `js/repositories/CasesRepository.js`، لكن الموضع الفعلي للملف داخل `Master_v10_5_2.zip` هو `js/core/CasesRepository.js` (بجانب `Repository.js` مباشرة، وليس في مجلد `js/repositories/` منفصل). هذا تعارض موثَّق بين التقرير والكود الفعلي المُسلَّم. بما أن تعليمات **هذه** المرحلة تطلب صراحة المسار الحرفي `js/repositories/ClientsRepository.js`، اعتُمد هذا المسار الصريح دون تغيير — لا سلطة لتعارض توثيقي سابق على تعليمة صريحة من المرحلة الحالية. لم يُلمَس `js/core/CasesRepository.js` (يبقى في مكانه الحالي دون نقل أو تعديل — القسم 3 أدناه).

**خلاصة الفجوة:** لا ملف مرجعي حقيقي غائب أثّر على محتوى هذه المرحلة. الاختلافات الوحيدة هي: (1) اسم أرشيف الكود المصدري، (2) بعض الملفات موجودة بأسماء مرقَّمة بدل الاسم الحرفي المطلوب، (3) تعارض موضع ملف `CasesRepository.js` الموثَّق مقابل الفعلي (مُوثَّق أعلاه، ولم يُغيَّر).

---

## 1. نطاق هذه المرحلة

ملف واحد فقط: `js/repositories/ClientsRepository.js`. يعتمد حصراً على `js/core/Repository.js` (لم يُعدَّل — القسم 3 أدناه). لا تعديل على أي Module/HTML/CSS/Apps Script/DatabaseService/ApiService، ولا على `js/core/CasesRepository.js`.

---

## 2. القرارات التصميمية وأساسها

### 2.1 Storage Adapter المؤقت — نفس نمط Cases، قرار محلي لهذه المرحلة

مطابقةً لِـ `NEXT_PHASE (5).md` ("كل Repository قادمة تحتاج قرارها الخاص... قرار مفتوح للمرحلة القادمة")، اعتُمد نفس نمط `CasesRepository.js`: Storage Adapter صغير خاص بـ Clients فقط (`createClientsLocalStorageAdapter`)، داخل `ClientsRepository.js` نفسه، يقرأ/يكتب **نفس** مفتاح `localStorage['clients']` الذي يستخدمه `data.clients`/`saveLocal()` الحاليان بالضبط (مؤكَّد بفحص `index.html` مباشرة — `data.clients: JSON.parse(localStorage.getItem('clients')||'[]')` و`saveLocal()` يكتب لنفس المفتاح). لا مفتاح جديد، لا تغيير في شكل التخزين.

### 2.2 Identifier — تعارض موثَّق بين توصية `NEXT_PHASE.md` والكود الفعلي، ومصدر القرار

`NEXT_PHASE (5).md` (المكتوب في نهاية SUB-PHASE 5.2، قبل الفحص المباشر لهذه المرحلة) توقَّع:

> "Clients لا يملك مفتاحاً طبيعياً فريداً مضموناً (خلافاً لـ Cases) — يحتاج `idField: null` + `idGenerator` (متوقَّع أن يكون `uid()` من `js/ui-utils.js`، مُحقَناً من الخارج)."

هذه التوصية استندت إلى وصف `Data_Schema_Specification_Report.md §4.2` المجرَّد ("Primary Key: `id` (Hybrid)"). لكن الفحص المباشر لِـ `saveClient()` الفعلية في `js/modules/clients.js` (الأسطر 160-161) يُظهر أن المعرِّف المولَّد يُخزَّن فعلياً تحت الحقل العربي `رقم_الموكل`، وليس تحت حقل عام `id`:

```js
obj['رقم_الموكل']    = obj['رقم_الموكل']    || uid();
obj['تاريخ_الإنشاء'] = obj['تاريخ_الإنشاء'] || new Date().toISOString();
```

وفحص `Code_v4.gs` (`SHEET_DEFS`، السطر 102) يؤكد أن `رقم_الموكل` هو أيضاً العمود الأول الفعلي في شيت `الموكلين` — أي أنه المعرِّف المخزَّن فعلياً على مستوى المشروع بأكمله (الواجهة + الـ Sheet)، وليس تفصيلاً داخلياً لطبقة تجريد فقط.

**القرار المتخَذ هنا:** بما أن أولوية هذه المرحلة المعلَنة صراحة هي **"Behavior Compatible 100% مع النظام الحالي"** (نفس المبدأ المستخدَم لحسم تعارض التحقق في Cases §2.3)، اعتُمد السلوك الفعلي المُتحقَّق منه مباشرة بدل توصية `NEXT_PHASE.md` التوقُّعية:
- `idField: 'رقم_الموكل'` يُمرَّر للـ constructor الأساسي (بدل `idField: null`) — بحيث تقرأ/تكتب كل عمليات الـ Contract الموروثة (`get`, `update`, `delete`, `exists`, ...) الحقل الصحيح فعلياً.
- `_resolveId()` (نقطة امتداد داخلية في `Repository.js`، غير Business-Logic بذاتها) عُدِّلت في `ClientsRepository` لتوليد معرِّف فقط عند غياب `رقم_الموكل`، مطابِقةً حرفياً لنمط `|| uid()` في `saveClient()` — خلافاً لسلوك القاعدة الافتراضي عند `idField` مضبوط (`return record[idField]` بلا توليد احتياطي)، وهو سلوك صحيح لـ Cases (مفتاح طبيعي يُدخِله المستخدم دائماً، ومضمون الوجود بفضل Validation) لكنه غير كافٍ لـ Clients (معرِّف Hybrid يُولَّد تلقائياً عند الغياب).
- مولِّد المعرِّف نفسه (`generateClientId`) هو نسخة خوارزمية مطابقة حرفياً لِـ `uid()` الفعلية في `js/ui-utils.js` (`Date.now().toString(36) + Math.random().toString(36).slice(2,6)`)، مُعرَّفة محلياً داخل `ClientsRepository.js` (بدون استيراد `js/ui-utils.js` — لا اعتمادية مسموحة هذه المرحلة تتجاوز `js/core/Repository.js`)، تماماً كما احتفظ `CasesRepository.js` بـ Storage Adapter الخاص به مستقلاً بدل الاستيراد من ملف آخر. قابلة للاستبدال بالكامل عبر `config.idGenerator` عند الحقن الخارجي (توافقاً مع تصميم `Repository.js` الأصلي الذي يطلب حقن `idGenerator` من الخارج دون تعريفه داخلياً).

هذا القرار مُوثَّق أيضاً كتعليق مباشر (قسم "IDENTIFIER") في رأس `ClientsRepository.js`.

### 2.3 Validation — لا تعارض بين التقريرين

`Data_Schema_Specification_Report.md §4.2` و`saveClient()` الفعلية (`js/modules/clients.js`، الأسطر 150-155) متطابقان: حقل واحد إلزامي فقط، `الاسم`:

```js
var name = document.getElementById('fClientName') ? document.getElementById('fClientName').value.trim() : '';
if (!name) {
  toast('يرجى إدخال اسم الموكل', 'error');
  return;
}
```

لا يوجد هنا تعارض شبيه بحالة Cases (§2.3 هناك)؛ `_validate()` تفرض حقلاً واحداً فقط، غير فارغ بعد `.trim()`.

### 2.4 Search — استبدال محرك البحث الافتراضي لضمان توافق سلوكي حرفي

نفس نمط Cases (§2.4 هناك) بالضبط. `renderClients()` الفعلية تبحث في **كل** حقول السجل دون استثناء:

```js
var rows = data.clients.filter(function(c) {
  return !s || Object.values(c).join(' ').toLowerCase().indexOf(s) >= 0;
});
```

تم Override لِـ `_matchesSearch` في `ClientsRepository` ليكرّر بالضبط نفس السلوك (`join` كل الحقول القانونية العربية القديمة `CLIENTS_LEGACY_FIELDS`)، مع استبعاد الحقول البنيوية الجديدة (`createdAt`, `checksum`, إلخ) عمداً لنفس السبب الموثَّق في Cases. `CLIENTS_LEGACY_FIELDS` تضمّ، إضافة إلى حقول `CLIENTS_MAP` العشرة (`js/modules/clients.js`):
- `رقم_الموكل` — المعرِّف نفسه (جزء فعلي من `Object.values(c)` اليوم).
- `تاريخ_الإنشاء` — طابع زمني يضيفه `saveClient()`.
- `portal_token` — حقل QR للبوابة، يُضاف عبر `genClientQR()`/`revokeAndRegenQR()`، ويظهر فعلياً في السجلات التي وُلِّد لها رابط بوابة، وبالتالي جزء من `Object.values(c)` لتلك السجلات اليوم.

`CLIENTS_SEARCH_FIELDS` (المشتقة من `Data_Schema_Specification_Report.md §4.2`: `الاسم`, `الرقم_القومي`, `الهاتف`) بقيت محفوظة كإعداد للـ Repository، لكنها **ليست** المحرك الافتراضي — نفس منطق الأولوية المتَّبع في Cases.

### 2.5 Filter / Sort

`filterFields` (`النوع`) و`sortFields` (`الاسم`) مطابقان حرفياً لـ `Data_Schema_Specification_Report.md §4.2`. السلوك الفعلي الحالي لـ `renderClients()` لا يطبّق أي فلترة أو فرز مبرمَج إطلاقاً (بحث نصي حر فقط) — لذلك `filter()` و`sort()` هنا وظيفتان إضافيتان جديدتان (Additive)، لا تستبدلان أي سلوك موجود ولا تُستخدَمان افتراضياً في أي عملية أخرى، تماماً كما في Cases §2.5.

### 2.6 Soft Delete

`softDelete: true` مطابقة لـ `Data_Schema_Specification_Report.md §4.2 Delete Rules` ("Soft Delete"). يختلف هذا عمداً عن `deleteClient()` الفعلية اليوم (حذف نهائي فوري عبر `splice`) — نفس نمط الاختلاف المصمَّم مسبقاً والمعتمَد في Cases §2.6؛ طبقة الـ Repository الجديدة تُقدِّم Soft Delete كسياسة مستقبلية صريحة، ولا تُستبدَل بها `deleteClient()` الفعلية في هذه المرحلة (الملف غير مُوصَّل بعد بأي HTML/Module).

### 2.7 التسمية — insert/remove/filter/sort/validate مقابل Contract §19

نفس الحل المعتمَد في Cases §2.7 بالضبط: كل عمليات الـ Contract الحرفية موروثة دون أي تغيير من `Repository.prototype`. إضافةً لذلك، عُرِّفت `insert()`/`remove()`/`filter()`/`sort()`/`validate()` كـ Wrappers إضافية رقيقة (لا تستبدل ولا تُعيد تسمية أي عملية Contract):
- `insert(entity)` → `this.create(entity)`
- `remove(id)` → `this.delete(id)`
- `filter(filterObj)` → `this.search({filter: filterObj}).items`
- `sort(records?, sortSpec?)` → غلاف حول محرك المقارنة الداخلي `_compareRecords`
- `validate(record, operation?)` → غلاف عام حول hook الـ `_validate` المحمي

### 2.8 عمليات متخصصة خارج النطاق — Portal Token

`Repository_Contract_Report.md §4.2` يذكر صراحة أن `generatePortalToken`/`revokePortalToken` "عملية متخصصة وليست جزءاً من الـ Contract الموحّد". لم تُضَف أي دالة بهذا الاسم أو بهذا الغرض إلى `ClientsRepository` — خارج نطاق هذه المرحلة تماماً (لا `create`/`update`/`delete`/`insert`/`remove`/`filter`/`sort`/`validate`/`exists`/`count` مطلوبة في التعليمات تغطي هذا السلوك، وأي محاولة لإضافته كانت ستكون Business Logic غير مطلوبة). حقل `portal_token` نفسه مُدرَج فقط ضمن `CLIENTS_LEGACY_FIELDS` لأغراض البحث النصي الحر (§2.4 أعلاه) لأنه موجود فعلياً في شكل السجل.

---

## 3. ما لم يُعدَّل (تأكيد Diff)

- `js/core/Repository.js` — **لم يُلمَس إطلاقاً** (MD5 قبل/بعد متطابق تماماً — القسم 4 من تقرير التحقق).
- `js/core/CasesRepository.js` — **لم يُلمَس إطلاقاً** (MD5 قبل/بعد متطابق تماماً).
- `js/modules/clients.js`, `index.html`, أي CSS، `Code_v4.gs` — **لم يُلمَس إطلاقاً** (لا كتابة على أي منها في هذه الجلسة).
- `DatabaseService`/`ApiService` — لم يُعدَّلا (Adapter المؤقت داخل `ClientsRepository.js` وحده، وليس بديلاً عن `DatabaseService`).

---

## 4. الملف المُسلَّم

`js/repositories/ClientsRepository.js` — Repository متخصص واحد، يعتمد فقط على `Repository` (المستورَدة من `js/core/Repository.js`)، بلا أي اعتماد آخر على أي ملف مشروع آخر (لا `data`, لا `FIELDS`/`MAP`, لا `document.*`, لا `toast()`, لا `js/ui-utils.js`).

يُصدِّر (CommonJS + `window`/`globalThis`): `ClientsRepository`, `createClientsLocalStorageAdapter`.

تفاصيل التحقق الكامل: `Clients_Repository_Verification_Report.md`.

---

## 5. Ready For Children Repository

هذا الملف مضاف بالكامل، خامل (Inert) — لا `<script>` يُشير إليه في `index.html`. جاهز كنموذج مرجعي لبناء `ChildrenRepository` التالية (`Repository_Contract_Report.md §4.3`): معرِّف Hybrid (`id`، بلا مفتاح طبيعي عربي بديل مسجَّل فعلياً في `js/modules/children.js` — يحتاج فحصاً مباشراً منفصلاً بنفس منهجية §2.2 هنا)، لا بحث نصي حر موثَّق (فلترة بـ `رقم_القضية` فقط)، وفجوة `syncPolicy` الموروثة الخاصة بحذف الأطفال (موثَّقة في `Data_Schema_Specification_Report.md §4.3` وغير مُحسومة بعد حسب `NEXT_PHASE.md`) يجب أن تُصمَّم بحيث تبقى قابلة للتفعيل لاحقاً دون تغيير الـ Contract، تماماً كما أوصى `Repository_Contract_Report.md §4.3`.

---

# Clients Repository Review

**PASS**

**Ready For Children Repository**
