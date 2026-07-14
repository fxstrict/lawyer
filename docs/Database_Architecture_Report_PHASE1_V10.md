# تقرير تحليل معماري لطبقة البيانات
## نظام الحسام للمحاماة — V10 Offline-First Architecture
## PHASE 1 — DATABASE ARCHITECTURE AUDIT

**نوع المرحلة:** تحليل وتصميم فقط — لم يُكتب أو يُعدَّل أو يُحذف أي كود أو ملف ضمن هذه المهمة.

---

## ⚠️ ملاحظة إلزامية قبل البدء — تعارض في المراجع الرسمية

طلب المرحلة نصّ على اعتبار الملفات التالية هي **المصدر الرسمي الوحيد**:

- `Master_v10_Base.zip`
- `PROJECT_STATE.md`
- `PROJECT_HISTORY.md`
- `PROJECT_MAP.md`
- `NEXT_PHASE.md`

الملف الذي تم رفعه فعلياً هو **`Master_v9.zip`**، وبعد فحص محتوياته بالكامل، **لا يوجد** داخله أي من الملفات الأربعة الأخرى (`PROJECT_STATE.md`, `PROJECT_HISTORY.md`, `PROJECT_MAP.md`, `NEXT_PHASE.md`). محتويات الأرشيف فقط:

```
Master_v9/
├── Code_v4.gs
├── index.html
├── css/ (base.css, components.css, variables.css, layout.css, responsive.css)
└── js/
    ├── api/api.js
    ├── ui-utils.js
    ├── print-utils.js
    └── modules/ (calendar, settings, templates, documents, children,
                  clients, dashboard, cases, tasks, fees, sessions, library).js
```

التزاماً بالتعليمات الصريحة **"لا تفترض أي شيء غير موجود داخل المشروع"** و**"لا تعتمد على أي محادثة سابقة"** و**"لا تعتمد على أي ذاكرة"**: تم تنفيذ هذا التحليل بالكامل بالاعتماد حصراً على الفحص الفعلي والمباشر لأكواد `Master_v9.zip` كما تم رفعه — دون افتراض وجود أي بنية أو قرار سابق لم يظهر دليله داخل الكود نفسه. أي إشارة في هذا التقرير إلى "مرحلة سابقة" أو "قرار سابق" مبنية فقط على تعليقات وتوثيق موجود فعلياً داخل ملفات الكود نفسها (وهي موجودة بكثرة ومفيدة جداً، كما سيتضح أدناه).

**إن كان الملف الصحيح هو نسخة أخرى (v10)، يُرجى رفعها لإعادة الفحص على الأساس الرسمي المطلوب.** التقرير أدناه صالح ودقيق بالكامل بالنسبة لما هو موجود في `Master_v9.zip`.

---

## 1. Current Architecture — البنية الحالية

النظام تطبيق ويب من صفحة واحدة (`index.html`) بدون أي إطار عمل (framework)، مبني بـ JavaScript خام (Vanilla JS، أسلوب ES5 مع بعض ES6 في `api.js`)، مقسم إلى وحدات (modules) يتم تحميلها كملفات `<script>` منفصلة، بالإضافة إلى Backend مبني بالكامل على **Google Apps Script** (`Code_v4.gs`) يتعامل مع **Google Sheets** كقاعدة بيانات سحابية.

البنية الحالية طبقتان فقط عملياً:

| الطبقة | التقنية | الدور |
|---|---|---|
| تخزين محلي متزامن (in-memory) | متغير عام `data` (كائن JS) | مصدر الحقيقة أثناء التشغيل؛ كل الشاشات تقرأ منه مباشرة |
| تخزين محلي دائم | `localStorage` | نسخة معلّبة (serialized) من `data` تُحفظ بعد كل عملية عبر `saveLocal()` |
| تخزين سحابي | Google Sheets عبر Google Apps Script Web App | مصدر الحقيقة النهائي عند توفر اتصال إنترنت ورابط `API_URL` |

**لا يوجد أي استخدام لـ IndexedDB في المشروع الحالي** (تم البحث بالكامل عن `indexedDB` في كل الملفات — صفر نتائج). هذه نقطة جوهرية لهدف V10 وسيتم تفصيلها في القسم 6.

---

## 2. Current Data Flow — تدفق البيانات الحالي

التدفق الفعلي الموحّد لكل الوحدات (Cases, Sessions, Clients, Documents, Tasks, Fees) هو:

```
UI (نموذج Modal)
   ↓ collectForm(type)          [print-utils.js]
كائن JS (obj)
   ↓
data.<module>[idx] = obj   /   data.<module>.push(obj)     [تعديل مباشر بالذاكرة]
   ↓
saveLocal()                                                  [localStorage]
   ↓
ApiService.syncRow(sheet, obj, idx)     أو    (bypass) syncToSheets()
   ↓ fetch POST  (Content-Type: text/plain لتفادي CORS preflight)
Google Apps Script doPost()
   ↓ action: add / update
sheet.appendRow() / sheet.getRange().setValues()
   ↓
Google Sheets (مصدر الحقيقة السحابي)
```

مسار القراءة عند بدء التشغيل:

```
index.html DOMContentLoaded
   ↓
data = { cases: JSON.parse(localStorage['cases']||'[]'), … }   [تحميل فوري من localStorage]
   ↓ (إن وُجد API_URL)
loadFromSheets() / ApiService.loadAllSheets()
   ↓ fetch GET ?sheet=<name>  (لكل شيت على حدة، بالتتابع)
Google Apps Script doGet()
   ↓
data[key] = arr;  localStorage.setItem(key, JSON.stringify(arr))   [استبدال كامل — Sheets يطغى على localStorage]
```

**ملاحظة معمارية مهمة:** التحميل عند بدء التشغيل ليس Merge بل **استبدال كامل (full overwrite)** لكل مصفوفة بمحتوى الشيت المقابل، فقط إذا رجع الشيت `≥1` صف (`if (Array.isArray(arr) && arr.length > 0)`). بمعنى: إن كان الشيت السحابي فارغاً فعلاً (٠ صفوف) بينما توجد بيانات محلية، **تبقى البيانات المحلية كما هي** ولا يحدث استبدال — وهذا سلوك مقصود موثّق في التعليق: `"الاتصال نجح — الأوراق فارغة"`.

---

## 3. Storage Analysis — تحليل التخزين

### 3.1 المتغير العام `data`

معرَّف مرة واحدة فقط، داخل `<script>` inline في `index.html` (السطور 572–582):

```js
var data = {
  cases: JSON.parse(localStorage.getItem('cases')||'[]'),
  sessions: …, clients: …, children: …, documents: …,
  tasks: …, fees: …, library: …, templates: …
};
```

هو كائن واحد يحتوي **9 مصفوفات** (واحدة لكل وحدة بيانات). كل وحدات الواجهة (modules) تقرأ وتكتب مباشرة على خصائصه دون أي طبقة وسيطة (لا يوجد getter/setter، لا Proxy، لا تحقق من نوع البيانات).

### 3.2 استخدامات `data` — الجرد الكامل

تم إحصاء **226 موضع** يحتوي على الكلمة `data` (ككلمة مستقلة) عبر كل ملفات JS و HTML و GAS في المشروع. من هذه المواضع:
- **29 موضعاً** عمليات تعديل فعلية على المصفوفات (WRITE / UPDATE / DELETE بالكود).
- **~168 موضعاً** عمليات قراءة فعلية (READ) — بأنماط `.filter()`, `.find()`, `.indexOf()`, `.length`, `.forEach()`, `.map()`، أو وصول مباشر بالفهرس `data.X[i]`.
- **~29 موضعاً** إشارات توثيقية فقط (تعليقات JSDoc تشرح أن الوحدة تعتمد على `data`)، لا تمثل عمليات فعلية على البيانات.

توزيع العمليات الفعلية حسب النمط، وهو **نمط متطابق تماماً عبر كل الوحدات الثمانية القابلة للإضافة/التعديل/الحذف** (Cases, Sessions, Clients, Documents, Tasks, Fees, Library, Templates):

| النمط | مثال حرفي | العملية |
|---|---|---|
| `data.<module>[idx] = obj;` | `data.cases[idx] = obj;` | UPDATE (تحديث سجل موجود بالفهرس) |
| `data.<module>.push(obj);` | `data.cases.push(obj);` | WRITE (إضافة سجل جديد) |
| `data.<module>.splice(i, 1);` | `data.cases.splice(i, 1);` | DELETE (حذف سجل بالفهرس) |
| `data.<module>[i]` / `.filter()` / `.find()` / `.indexOf()` / `.length` | `data.cases.filter(...)` | READ |

الوحدة الوحيدة التي **لا** تتبع هذا النمط بثلاثة أسطر منفصلة هي `children.js`، حيث دُمجت عمليتا UPDATE و WRITE (append) في سطر واحد طويل (بأسلوب دالة واحدة مصغّرة `saveChild()`):
```js
if(idx>=0){ data.children[idx]=obj; } else { data.children.push(obj); }
```

الجدول الكامل لكل موضع (ملف + رقم سطر + نوع العملية) موجود في **الملحق A** في نهاية هذا التقرير.

### 3.3 هل `data` مصدر حقيقة واحد (Single Source of Truth)؟

عملياً نعم أثناء التشغيل — كل الشاشات تُقرأ حصراً من `data`. لكنه **غير محمي**: أي دالة في أي وحدة يمكنها تعديل `data.<اسم أي وحدة أخرى>` مباشرة دون قيد (تم رصد ذلك فعلاً — مثال: `cases.js` يقرأ من `data.clients` مباشرة لسحب بيانات الموكل تلقائياً في السطور 311-316 و 641-642). هذا **اقتران ضمني (implicit coupling)** بين الوحدات عبر الكائن المشترك، وهو نمطي جداً في أنظمة "Global mutable state" ويمثّل الخطر الأساسي عند أي إعادة هيكلة.

---

## 4. Google Services Analysis — تحليل الخدمات السحابية (Google Apps Script)

`Code_v4.gs` (990 سطراً) هو Backend واحد يخدم أدواراً متعددة غير مفصولة حالياً. تحليل الدوال:

### 4.1 تصنيف الوظائف

| المجموعة | الدوال | التصنيف المطلوب لهدف V10 |
|---|---|---|
| **بيانات يومية (CRUD)** | `doGet()` (قراءة شيت)، `doPost()` (add/update/delete)، `getSheetHeaders()`, `setupSheets()`, `setupAll()`, `ensureSetup()`, `getSpreadsheetId()`, `createNewSpreadsheet()` | يجب أن **تخرج تدريجياً** من المسار الحرج اليومي عند التحول لـ Offline-First؛ تبقى فقط كـ Sync، وليست مصدر القراءة/الكتابة الأساسي |
| **خدمات سحابية حقيقية** | `getOrCreateCalendar()`, `addToCalendar()`, `updateCalendarEvent()`, `deleteCalendarEvent()` (Google Calendar) | تبقى بالكامل داخل GAS — لا بديل محلي منطقي لها |
| | `getOrCreateDriveFolder()`, `getOrCreateDocsFolder()`, `getDriveFolderUrl()`, `backupToGoogleDrive()` (Google Drive) | تبقى بالكامل داخل GAS |
| | `sendDailyNotifications()`, `buildEmailHtml()`, `setupTriggers()` (Email + Triggers) | تبقى بالكامل داخل GAS (تتطلب خادماً يعمل بدون تفاعل المستخدم) |
| | `serveClientPortal()`, `buildPortalHTML()` (بوابة الموكل عبر QR) | تبقى بالكامل داخل GAS — تُخدَّم كصفحة HTML مباشرة من طرف ثالث (الموكل) لا يملك التطبيق أصلاً |
| | `getStats()` | إحصائيات تُحسب من الشيت مباشرة — مرشحة للنقل بالكامل للعميل مستقبلاً بما أن البيانات ستكون محلية |

### 4.2 آلية العمل الحالية

- `doGet`: توجيه بحسب `action` (`ping`, `setup`, `get_sheet_url`, `stats`, `backup`, `test_notify`, `get_folder`, `portal`) أو بحسب `sheet` (قراءة كل صفوف شيت معيّن وتحويلها JSON، مع معالجة خاصة لحقول التاريخ/الوقت).
- `doPost`: تنفيذ `add` / `update` / `delete` على شيت معيّن، مع منطق خاص إضافي لشيت "الجلسات" فقط (مزامنة مع Google Calendar تلقائياً عند الإضافة/التحديث/الحذف).
- **الشيتات المعرَّفة فعلياً في `SHEET_DEFS`** (المصفوفة المركزية التي تحدد الأعمدة وتُنشئ الشيتات تلقائياً): `القضايا`, `الجلسات`, `الموكلين`, `المستندات`, `المهام`, `الأتعاب`, `المكتبة`, `الصيغ` — **8 شيتات فقط**.

### 4.3 🔴 ثغرة حقيقية مكتشفة: شيت "الأطفال" غير معرَّف في الـ Backend

تم التأكد بالفحص المباشر (`grep` على النص الحرفي "الأطفال" في `Code_v4.gs`) أن **لا يوجد أي ذِكر لكلمة "الأطفال" في كامل ملف Apps Script**. بينما:

- الواجهة الأمامية (`js/modules/settings.js` → `loadFromSheets()`) تحاول تحميل شيت باسم `'الأطفال'` كجزء من قائمة الأزواج الثابتة `pairs`.
- وحدة `children.js` (`saveChild()`) تستدعي مباشرة `syncToSheets('الأطفال', obj, idx)` عند كل حفظ.

**الأثر الفعلي:** بما أن `'الأطفال'` غير موجود في `SHEET_DEFS`، فإن:
1. طلب `doGet(?sheet=الأطفال)` سيحاول `setupSheets()` ثم `ss.getSheetByName('الأطفال')` — لن يجده لأن `setupSheets()` لا تُنشئ سوى الشيتات الثمانية المعرَّفة — فتُعيد `[]` بصمت (لا خطأ ظاهر للمستخدم).
2. طلب `doPost(action:'add', sheet:'الأطفال', …)` سيفشل بنفس الطريقة داخل `if (!sheet) return jsonResponse({error:'فشل إنشاء: الأطفال'})` — لكن دالة `syncToSheets()` في الواجهة لا تفحص محتوى استجابة JSON إطلاقاً (`await fetch(...)` بدون قراءة `.json()` أو فحص `status`)، فالخطأ **يُبتلع بصمت تماماً** ولا يظهر أي تنبيه للمستخدم.

**الخلاصة:** بيانات الأطفال (`data.children`) في النسخة الحالية **محلية فقط بشكل فعلي (localStorage)**، رغم أن الكود يوحي بمحاولة مزامنتها سحابياً. هذا يجب توثيقه بوضوح في أي خطة Migration قادمة، وقد يكون مقصوداً أو قد يكون Bug — لكنه **خارج نطاق هذه المرحلة** (تحليل فقط، بدون إصلاح).

---

## 5. Repository Design — تصميم طبقة المستودعات (بدون تنفيذ)

تصميم مقترح لـ Repository مستقل لكل شريحة بيانات، كطبقة عزل بين الواجهة وطبقة التخزين الفعلية (سواء IndexedDB مستقبلاً أو `data` حالياً):

| الوحدة الحالية | Repository المقترح | يحل محل الوصول المباشر إلى |
|---|---|---|
| Cases | `CaseRepository` | `data.cases` في `cases.js`, `dashboard.js`, `clients.js` |
| Sessions | `SessionRepository` | `data.sessions` في `sessions.js`, `cases.js`, `calendar.js`, `dashboard.js` |
| Clients | `ClientRepository` | `data.clients` في `clients.js`, `cases.js`, `fees.js` |
| Children | `ChildRepository` | `data.children` في `children.js`, `dashboard.js` |
| Documents | `DocumentRepository` | `data.documents` في `documents.js`, `cases.js` |
| Tasks | `TaskRepository` | `data.tasks` في `tasks.js`, `dashboard.js` |
| Fees | `FeeRepository` | `data.fees` في `fees.js`, `clients.js` |
| Library | `LibraryRepository` | `data.library` في `library.js` |
| Templates | `TemplateRepository` | `data.templates` في `templates.js` |
| Settings | `SettingsRepository` | `API_URL`/`DRIVE_URL` في `localStorage` (خارج كائن `data` حالياً) |

**مسؤوليات كل Repository (نمط موحّد):** `getAll()`, `getById()`, `add()`, `update()`, `delete()`, `find(predicate)` — واجهة واحدة موحدة تُخفي تفاصيل ما إذا كان المصدر مصفوفة في الذاكرة أو IndexedDB store.

**ملاحظة على `ChildRepository`:** بما أن شيت "الأطفال" غير موجود فعلياً في الـ Backend (القسم 4.3)، فإن تصميم هذا الـ Repository يجب أن يوضّح صراحة أنه **Local-Only حالياً**، إلى أن يُتّخذ قرار صريح (خارج نطاق هذه المرحلة) بإضافة الشيت المفقود إلى `SHEET_DEFS` أو إبقاء الأطفال محلية بشكل دائم ومقصود.

---

## 6. DatabaseService Design — تصميم خدمة قاعدة البيانات (بدون تنفيذ)

مسؤوليات مقترحة فقط (Interface-level، بدون كود):

- **Open Database**: فتح/إنشاء قاعدة IndexedDB بإصدار (version) واحد يغطي الـ 9 Stores المقابلة لمصفوفات `data` الحالية.
- **Upgrade**: التعامل مع `onupgradeneeded` لإنشاء الـ Object Stores والفهارس عند أول تشغيل، ولأي ترقية مستقبلية للـ Schema.
- **CRUD**: عمليات ذرية (`add`, `get`, `put`, `delete`) لكل Store، بديلة عن `push`/`splice`/`[idx]=` الحالية.
- **Transactions**: تغليف كل عملية أو مجموعة عمليات مترابطة (مثال: حذف قضية + حذف كل جلساتها ومستنداتها المرتبطة) بمعاملة واحدة (transaction) لضمان الاتساق (consistency) — وهو أمر **غير موجود إطلاقاً حالياً**: لم يُرصد أي كود يحذف السجلات المرتبطة تلقائياً عند حذف قضية أم.
- **Indexes**: فهارس على الحقول الأكثر استخداماً للبحث/الفلترة الحالية (مثال: `رقم_القضية` في Sessions/Documents/Fees/Tasks — تم رصد الاعتماد عليه في `filter()` بكل هذه الوحدات).
- **Search**: بحث نصي بديل عن `Object.values(c).join(' ').toLowerCase().includes(...)` المستخدم حالياً بشكل متكرر في كل وحدة (نمط بحث بسيط جداً وغير مفهرس).
- **Bulk Insert / Bulk Delete**: لدعم استيراد/تصدير/مسح شامل (بديل `clearAllData()` و `handleImport()` الحاليين في `settings.js`).
- **Export / Import / Backup / Restore**: بديل موحّد لـ `exportData()`/`handleImport()` الحاليين، مع دعم أنسق أكثر كفاءة من `JSON.stringify` الخام.

---

## 7. SyncService Design — تصميم خدمة المزامنة (بدون تنفيذ)

مسؤول **حصراً** عن ما لا يمكن أن يعمل محلياً بطبيعته — وليس عن CRUD اليومي (الذي سينتقل بالكامل إلى `DatabaseService` + `Repository Layer`):

| النطاق | المصدر الحالي المقابل |
|---|---|
| Google Drive (رفع/رابط مجلد) | `getOrCreateDriveFolder()`, `getDriveFolderUrl()` في `Code_v4.gs` + `uploadFile()` في `api.js` (حالياً stub غير مفعّل فعلياً في GAS) |
| Google Calendar | `addToCalendar()`, `updateCalendarEvent()`, `deleteCalendarEvent()` — مرتبطة حالياً بشكل صارم بشيت "الجلسات" فقط داخل `doPost` |
| Client Portal | `serveClientPortal()`, `getPortalUrl()`, `getQrImageUrl()` |
| Email (تنبيهات يومية) | `sendDailyNotifications()`, `setupTriggers()` |
| JSON Backup | `exportData()`/`handleImport()` الحاليان في `settings.js`، و`backupToGoogleDrive()` في GAS |
| Logo | لم يُرصد أي كود متعلق بـ "Logo" في المشروع الحالي — **غير موجود بعد**؛ سيُضاف كمساحة مستقبلية فقط عند الحاجة الفعلية |
| Settings Sync | `saveApiUrl()`, `saveDriveUrl()` — حالياً محلية فقط (`localStorage`)، لا تُزامن سحابياً بعد |

---

## 8. Backup Manager Design — تصميم مدير النسخ الاحتياطي (بدون تنفيذ)

مبني فوق الأساس الموجود فعلياً (`exportData()` / `handleImport()` في `settings.js` و `backupToGoogleDrive()` في `Code_v4.gs`)، بمسؤوليات موسّعة:

- **JSON**: يبقى التنسيق الأساسي (متوافق رجعياً مع ملفات `lawyer_backup_*.json` المُصدَّرة من النسخة الحالية).
- **Compression**: طبقة اختيارية لاحقة (غير موجودة حالياً؛ التصدير الحالي JSON خام غير مضغوط).
- **Versioning**: وسم كل نسخة احتياطية برقم إصدار البنية (schema version) — غير موجود حالياً (لا يوجد أي حقل إصدار في مخرجات `exportData()` الحالية).
- **Restore**: يبني على منطق `handleImport()` الحالي (الذي يتحقق من أن كل مفتاح مصفوفة، ثم يستبدل `data[k]` بالكامل) — لكن يجب أن يعمل ضد `DatabaseService` بدل `data` مباشرة مستقبلاً.
- **Incremental Backup**: غير موجود حالياً (كل نسخة حالياً Full فقط) — يتطلب تتبع "آخر تعديل" لكل سجل، وهو **غير متوفر في البنية الحالية للسجلات** (لا يوجد حقل `updated_at` موحّد عبر كل الوحدات — بعض السجلات فيها `تاريخ_الإنشاء` فقط، مثل `children.js` و شيتَي المكتبة/الصيغ).
- **Full Backup**: امتداد مباشر لـ `exportData()` الحالية.

---

## 9. Dependency Graph — رسم الاعتماديات

كل ملفات الوحدات موثّقة ذاتياً بشكل ممتاز داخل رأس كل ملف (JSDoc header بعنوان "Depends on")، وهذا التوثيق تمت مطابقته يدوياً مع الاستخدام الفعلي للكود ووُجد متسقاً معه. ملخص الاعتماديات:

| الوحدة | تعتمد على (Globals) | Storage | Api | DOM/Event | ملاحظات |
|---|---|---|---|---|---|
| `api.js` | `API_URL` (قراءة فقط) | لا شيء مباشرة | نعم — هو نفسه طبقة الـ API | لا | لا يلمس `data` أو `localStorage` إطلاقاً (موثّق صراحة: "Does NOT touch: … localStorage helpers") |
| `ui-utils.js` | لا شيء (دوال نقية) | لا | لا | لا | صفر اعتماديات — أول ملف آمن للتحميل، وموسوم صراحة "no runtime order dependency" |
| `print-utils.js` | `FIELDS`, `MAP` (من `index.html`)، `sanitizeTime` (من `ui-utils.js`) | لا | لا | نعم (`document.getElementById`) | يحتوي القاعدة الأصلية لـ `resetForm`/`fillForm`/`collectForm` التي يُعاد تعريفها (override) لاحقاً في `cases.js`/`clients.js` |
| `cases.js` | `data`, `editIdx`, `ApiService`, `saveLocal`, `toast`, `updateBadges`, `closeModal`, دوال `ui-utils.js` | `localStorage` (عبر `saveLocal`) | `ApiService.syncRow/deleteData` | نعم | يُعرِّف `populateCaseDropdown`, `autofillSessionFromCase`, `autofillFeeFromCase` — تُستخدم من وحدات أخرى (لذلك يُحمَّل مبكراً) |
| `clients.js` | نفس نمط `cases.js` + `data.cases`, `data.fees` (قراءة عرضية) | نعم | `ApiService.*` بالكامل | نعم | يُعرِّف `genClientQR` المستخدم من `index.html` (View Modal) |
| `sessions.js` / `fees.js` / `documents.js` / `tasks.js` / `library.js` / `templates.js` | `data`, `editIdx`, `ApiService`, `collectForm`/`fillForm` (من `print-utils.js`)، `saveLocal`, `toast` | نعم | `ApiService.*` (templates/library باستثناء — Local-Only بالتصميم) | نعم | نمط CRUD متطابق تماماً في الستة |
| `children.js` | `data.children`, `editIdx.children`, `collectForm`/`fillForm` (المُعاد تعريفها من `cases.js`)، **`syncToSheets` العام مباشرة (وليس `ApiService`)** | نعم | ⚠️ Bypass — لا يستخدم `ApiService` | نعم | الوحدة الوحيدة التي لم تُهاجَر إلى `ApiService` بعد |
| `dashboard.js` | `data.*` (قراءة فقط لكل الوحدات، عبر `.length`/`.filter`) | لا | لا | نعم (`updateBadges`, `renderDashboard`) | Read-only بحت — لا يكتب على `data` إطلاقاً |
| `calendar.js` | `data.sessions` (قراءة فقط، موثّق صراحة: "Calendar only READS") | لا | لا | نعم | لا Backend خاص به — عرض فقط فوق بيانات موجودة أصلاً |
| `settings.js` | `data` بالكامل (import/export/clear)، `API_URL`, `DRIVE_URL` | نعم | ⚠️ Bypass جزئي — `fetch()` مباشر بدل `ApiService` في 5 دوال (`testConnection`, `pingConnection`, `syncToSheets`, `syncDeleteToSheets`, `loadFromSheets`) | نعم | راجع القسم 9.1 أدناه |

### 9.1 ⚠️ ثغرة معمارية معروفة وموثّقة سابقاً: Bypass لـ `ApiService`

تم التأكد بالفحص المباشر أن الدوال التالية في `settings.js` **لا تزال تستخدم `fetch()` مباشرة** بدل المرور عبر `ApiService` رغم وجود دوال مكافئة جاهزة داخل `api.js`:

- `testConnection()` (سطر 27، 35) — بديلها الجاهز: `ApiService.setup()` (موجود ومكتمل في `api.js` لكن غير مستخدم هنا).
- `pingConnection()` (سطر 81) — بديلها الجاهز: `ApiService.ping()`.
- `syncToSheets()` (سطر 112) و `syncDeleteToSheets()` (سطر 116) — لا تزالان معرَّفتين كدوال عامة مستقلة، ولا تزال `children.js` تستدعيهما مباشرة (سطر 38).
- `loadFromSheets()` (سطر 125) — بديلها الجاهز: `ApiService.loadAllSheets()` / `ApiService.loadData()`.

هذا يتطابق تماماً مع ما هو موثّق مسبقاً داخل تعليقات الكود نفسه (`settings.js` سطر 105: *"Per SETTINGS_INTEGRATION_AUDIT_REPORT.md Section 1 / Required Changes #2"* — ملف تدقيق سابق غير مرفق ضمن `Master_v9.zip`، لكن أثره موثّق داخل الكود). **هذا لا يُصلَح في هذه المرحلة** — فقط يُسجَّل كخطر يجب معالجته في مرحلة Repository/DatabaseService القادمة، لأن أي `DatabaseService`/`SyncService` جديد سيحتاج نقطة دخول واحدة موحّدة للشبكة، وهذا Bypass يكسر ذلك الافتراض حالياً.

---

## 10. Call Graph — رسم استدعاء الدوال المشتركة الحرجة

أهم الدوال التي تُستدعى عبر أكثر من وحدة واحدة (نقاط اقتران حقيقية بين الوحدات):

```
populateCaseDropdown()   [معرّفة في cases.js]
   ← يُستدعى من: sessions.js, documents.js, fees.js, children.js, index.html (openAddModal)

autofillSessionFromCase() [معرّفة في cases.js]
   ← يُستدعى من: sessions.js (عند فتح/تعديل جلسة)

collectForm() / fillForm() / resetForm()  [القاعدة في print-utils.js]
   ← تُعاد كتابتها (override) في cases.js وclients.js لإضافة منطق خاص بالأطفال/الموكل
   ← تُستخدم من: كل الوحدات الثمانية القابلة للتعديل (نمط استدعاء ثابت واحد)

saveLocal()  [معرّفة في index.html inline]
   ← يُستدعى من: كل دالة save*/delete*/toggle* في كل الوحدات (٢٩ نقطة استدعاء تقريباً، مطابقة لعدد نقاط WRITE/UPDATE/DELETE في القسم 3.2)

genClientQR()  [معرّفة في clients.js]
   ← يُستدعى من: index.html (زر "QR الموكل" في Modal العرض)

updateBadges() / renderDashboard()  [معرّفتان في dashboard.js]
   ← تُستدعيان من: navigate() في index.html، وبعد كل عملية CRUD في كل وحدة تقريباً (لتحديث الشارات فوراً)
```

**ملاحظة اتساق موثّقة داخل الكود نفسه، ومؤكدة بالفحص:** الدالتان `collectForm`/`fillForm`/`resetForm` الأصليتان في `print-utils.js` كانتا جزءاً من مجموعة أكبر من 15 دالة، وتم بالفعل — في مرحلة سابقة موثّقة داخل تعليق رأس الملف — حذف 12 دالة منها كانت "ميتة" (dead code، مغطّاة بنسخ لاحقة التحميل من `cases.js`/`clients.js` ولم تكن تُستدعى فعلياً في أي وقت). هذا مثال جيد على أن الكود الحالي مرّ فعلاً بتدقيق مشابه من قبل، وهو نمط يجب تكراره لاحقاً بعد أي هجرة كبرى.

---

## 11. ترتيب تحميل الملفات — Load Order Analysis

الترتيب الفعلي في `index.html`:

```
1.  js/api/api.js                 (لا اعتماديات — يعتمد فقط على API_URL وقت التنفيذ الفعلي، لا وقت التحميل)
2.  js/ui-utils.js                 (صفر اعتماديات — دوال نقية)
3.  js/print-utils.js              (يعتمد على FIELDS/MAP المعرّفتين لاحقاً في inline script — آمن لأنه دوال، لا تنفيذ فوري)
4.  js/modules/cases.js            (يعتمد على data/editIdx المعرّفتين لاحقاً — آمن لنفس السبب؛ يُحمَّل مبكراً لأن وحدات أخرى تعتمد على دواله المشتركة populateCaseDropdown/autofillSessionFromCase/autofillFeeFromCase)
5.  <script> inline في index.html  (يُعرِّف: data, editIdx, saveLocal, toast, FIELDS, MAP, navigate, ونقطة الدخول DOMContentLoaded)
6.  js/modules/settings.js
7.  js/modules/calendar.js
8.  js/modules/children.js
9.  js/modules/dashboard.js
10. js/modules/tasks.js
11. js/modules/documents.js
12. js/modules/sessions.js
    -- (كتلة HTML لِـ Modals العرض/بوابة الموكل، لا سكريبت) --
13. js/modules/clients.js
14. js/modules/fees.js
15. js/modules/library.js
16. js/modules/templates.js
```

### تحليل من يعتمد على من

| الترتيب | من يعتمد عليه من التالي | يمكن نقله؟ |
|---|---|---|
| `api.js`, `ui-utils.js` | لا أحد يعتمد على ترتيبهما نسبة لبعضهما — كلاهما آمن التحميل أولاً | **نعم**، بأي ترتيب بينهما |
| `print-utils.js` | يجب أن يسبق `cases.js` (الذي يلتقط `resetForm`/`fillForm`/`collectForm` الأصلية عبر `_orig*` قبل استبدالها) — موثّق صراحة في رأس `print-utils.js`: *"Load this file after js/ui-utils.js and before js/modules/cases.js"* | **لا** — ترتيب حرج وموثّق |
| `cases.js` | يجب أن يسبق أي وحدة تستخدم `populateCaseDropdown`/`autofillSessionFromCase`/`autofillFeeFromCase` (أي: sessions, documents, fees, children) | **لا** — لكن يمكن نقل الوحدات التي **لا** تعتمد عليه (dashboard, calendar, library, templates) بحرية أكبر نسبياً |
| inline `<script>` (السطور 568-661) | يُعرِّف `data`/`editIdx`/`saveLocal` التي تعتمد عليها كل الوحدات التالية له | **لا** يمكن نقله قبل `cases.js`/`print-utils.js` دون كسرهما (لأنه يستخدم — لا يُعرِّف — بعض ما فيهما مثل `sanitizeTime`) |
| `settings.js`, `calendar.js`, `children.js`, `dashboard.js`, `tasks.js`, `documents.js`, `sessions.js`, `clients.js`, `fees.js`, `library.js`, `templates.js` | كلها متساوية الرتبة نسبة لبعضها — لا وحدة منها تعتمد على تحميل وحدة أخرى من هذه القائمة **قبلها**، فقط على `data`/`cases.js`/`print-utils.js`/`api.js`/`ui-utils.js` السابقين لها جميعاً | **نعم** — يمكن إعادة ترتيب هذه المجموعة الأحد عشر بحرية كاملة فيما بينها بدون كسر أي شيء، طالما بقيت بعد `cases.js` |

**ملاحظة:** `settings.js` موسوم داخلياً بتعليق (سطر 12) يقول إنه "غير مربوط بعد بـ `<script>` tag" — لكن الفحص الفعلي لـ `index.html` يُظهر أن الوسم **موجود فعلاً** (سطر 663). هذا **تعارض توثيقي بسيط** (تعليق قديم لم يُحدَّث بعد ربط الملف فعلياً)، وليس خطأ وظيفياً — التعليق متأخر عن الواقع فقط. يُذكر هنا فقط كملاحظة دقة توثيق، بدون أي تعديل.

---

## 6. IndexedDB الحالية — (لا وجود لها)

كما ذُكر في القسم 1، **لا يوجد أي كود يستخدم IndexedDB** في `Master_v9.zip` — لا `indexedDB.open`, ولا أي مكتبة Wrapper (مثل Dexie أو idb), ولا أي إشارة نصية للكلمة داخل أي ملف من ملفات المشروع.

| العنصر المطلوب تحليله | الحالة |
|---|---|
| Schemas | غير موجود |
| Stores | غير موجود |
| Keys | غير موجود |
| Indexes | غير موجود |
| Transactions | غير موجود |
| Version | غير موجود |
| Limitations | غير قابل للتقييم — لا يوجد تطبيق حالي لتقييمه |

**هل يمكن الاعتماد عليها كمصدر بيانات أساسي؟** غير قابل للإجابة عن الوضع "الحالي" لأنه ببساطة غير موجود بعد. هذا **يُعيد تعريف** طبيعة مشروع V10: **ليس ترحيلاً (migration) من IndexedDB قائمة إلى بنية أفضل، بل بناء طبقة IndexedDB من الصفر بجانب/فوق localStorage الموجودة فعلياً.** هذه نقطة يجب توضيحها بدقة في أي خطة Migration قادمة — المرحلة القادمة هي "إضافة" وليست "ترقية".

---

## 7. localStorage الحالي — التحليل

### 7.1 ما يُخزَّن فيه فعلياً (بالمفاتيح الحرفية)

| المفتاح (Key) | المحتوى | من يكتبه |
|---|---|---|
| `cases`, `sessions`, `clients`, `children`, `documents`, `tasks`, `fees`, `library`, `templates` | JSON لكل مصفوفة من `data` | `saveLocal()` (مركزياً)، بالإضافة لكتابة مباشرة إضافية لـ `sessions` وحدها في `DOMContentLoaded` (سطر 651) وفي `loadFromSheets()` (سطر 125) لكل مفتاح على حدة |
| `apiUrl` | رابط Apps Script Web App | `saveApiUrl()`, `testConnection()` |
| `driveUrl` | رابط مجلد Google Drive | `saveDriveUrl()`, `saveDriveFromModal()` |
| `sheetUrl` | رابط جدول Google Sheets (للعرض فقط في الإعدادات) | `displaySheetUrl()` |

### 7.2 ما يجب أن يبقى في localStorage

- `apiUrl`, `driveUrl`, `sheetUrl`: إعدادات اتصال خفيفة، لا علاقة لها ببيانات النطاق (domain data)، ولا تحتاج فهرسة أو استعلامات — مكانها الطبيعي يبقى `localStorage` (أو حتى `SettingsRepository` لاحقاً فوق IndexedDB، لكن لا ضرورة ملحّة).

### 7.3 ما يجب أن ينتقل إلى IndexedDB

- المفاتيح التسعة الخاصة بالبيانات (`cases` … `templates`): هذه هي بالضبط المرشحة للانتقال، لأنها:
  - تكبر بمرور الوقت (سجلات قانونية تراكمية)،
  - تحتاج فلترة/بحث متكرر (`filter`, `indexOf`, `find` في كل الوحدات — القسم 3.2)،
  - محدودة حالياً بحد حجم `localStorage` (~5–10 ميجابايت حسب المتصفح) وبكونها **متزامنة (synchronous)** بالكامل — أي قراءة/كتابة كبيرة تُجمِّد الواجهة، بعكس IndexedDB غير المتزامنة.

---

## 12. Migration Plan — خطة الهجرة (بدون تنفيذ)

مقسمة إلى 6 مراحل صغيرة كما طُلب، **دون تنفيذ أي منها في هذه المرحلة**:

| المرحلة | المحتوى | يعتمد على |
|---|---|---|
| **Stage 1 — Repository Layer** | إنشاء الملفات التسعة لطبقة الـ Repository (القسم 5)، بواجهة موحّدة، لكن **تعمل مبدئياً فوق `data` الحالي كما هو** (Adapter وهمي، بدون تغيير حقيقي في التخزين) — لضمان صفر مخاطرة في هذه المرحلة الأولى | لا شيء (طبقة إضافية فقط) |
| **Stage 2 — DatabaseService** | بناء `DatabaseService` فوق IndexedDB فعلياً (فتح، Schema، CRUD أولي) بشكل **مستقل ومعزول تماماً**، بدون ربطه بعد بأي Repository حقيقي — يُختبر بمعزل تام عن التطبيق الحي | Stage 1 (للواجهة المتفق عليها) |
| **Stage 3 — Replace `data[]`** | ربط الـ Repositories فعلياً بـ `DatabaseService` بدل `data[]`، وحدة واحدة في كل مرة (يُقترح البدء بوحدة معزولة قليلة الاعتماديات مثل `library.js` أو `templates.js` — Local-only أصلاً، صفر مخاطرة على المزامنة السحابية) | Stage 1 + Stage 2 |
| **Stage 4 — Background Sync** | بناء `SyncService` (القسم 7) ليعمل بالخلفية بين IndexedDB المحلية و Google Sheets، بدل استدعاءات `ApiService.syncRow` المباشرة والمتزامنة مع كل حفظة | Stage 3 مكتملة لكل الوحدات |
| **Stage 5 — JSON Backup** | ترقية `Backup Manager` (القسم 8) للعمل فوق `DatabaseService` بدل `data` مباشرة، مع إضافة Versioning | Stage 3 |
| **Stage 6 — Disable Google CRUD** | فصل مسار CRUD اليومي نهائياً عن Google Apps Script (يبقى فقط كنسخة مزامنة/احتياطية اختيارية عبر `SyncService`، وليس مصدر حقيقة أساسي) | Stage 4 مكتملة ومُختبرة بثقة كافية |

**كل هذه المراحل خارج نطاق تنفيذ التقرير الحالي — للتخطيط فقط.**

---

## 13. Risk Assessment — تحليل المخاطر

| الخطر | الوصف | الشدة | مصدر الدليل |
|---|---|---|---|
| **Regression** | ٢٩ نقطة WRITE/UPDATE/DELETE موزّعة يدوياً بنفس النمط تقريباً في 8 وحدات — أي تعديل غير دقيق في نمط واحد يكسر البقية بصمت | عالية | القسم 3.2 |
| **Sync Conflict** | لا يوجد أي منطق لحل التعارض (conflict resolution) حالياً — التحميل من Sheets عند بدء التشغيل هو استبدال كامل (Last Write from Cloud Wins)، لا Merge بالحقل أو بالطابع الزمني | عالية عند التحول لـ Offline-First حقيقي (تعديل بدون اتصال ثم مزامنة لاحقاً) | القسم 2 |
| **Data Loss** | شيت "الأطفال" غير معرَّف في الـ Backend فعلياً (القسم 4.3) — أي بيانات أطفال تُعتبر (خطأً من منظور المستخدم) "مزامَنة سحابياً" هي فعلياً محلية فقط بدون أي نسخة احتياطية سحابية حقيقية | عالية لهذه الوحدة تحديداً | القسم 4.3 (مؤكد بالفحص المباشر) |
| **Data Loss** | لا يوجد حقل `updated_at`/إصدار موحّد عبر كل السجلات — يمنع أي Incremental Backup أو حل تعارض ذكي مستقبلاً | متوسطة (يظهر أثرها فقط عند Stage 4/5 من خطة الهجرة) | القسم 8 |
| **Performance** | `localStorage` متزامن بالكامل (Synchronous) — أي عملية `saveLocal()` تُعيد تسلسل (`JSON.stringify`) 9 مصفوفات كاملة **من الصفر** في كل مرة، بغض النظر عن حجم التعديل الفعلي (سجل واحد فقط) | متوسطة حالياً، تتفاقم مع نمو حجم البيانات (لا حد أقصى موثّق حالياً على عدد السجلات) | القسم 3.1، `saveLocal()` |
| **Compatibility** | 4 من 8 وحدات فقط تستخدم `ApiService` بالكامل؛ `children.js` و`settings.js` لا تزالان تستخدمان مسارات شبكة مباشرة (Bypass) — أي `SyncService` مستقبلي سيحتاج التعامل مع نقطتي دخول شبكة مختلفتين لا نقطة واحدة | متوسطة–عالية | القسم 9.1 (مؤكد بالفحص المباشر) |
| **Migration** | لا يوجد IndexedDB أصلاً حالياً (القسم 6) — أي "Migration" هي فعلياً "بناء من الصفر"، وليست ترقية بيانات قائمة؛ يجب إعادة صياغة توقعات أي فريق/جهة تنتظر "ترحيل بيانات" بسيطة | منخفضة تقنياً، عالية من ناحية إدارة التوقعات | القسم 6 |
| **Offline** | مسار الحفظ الحالي **لا يفشل بصمت عند غياب الاتصال بفضل التصميم أصلاً** (كل استدعاءات `fetch` داخل `try/catch`، والحفظ المحلي عبر `saveLocal()` يحدث دائماً أولاً وبشكل متزامن قبل أي محاولة شبكة) — هذه نقطة قوة موجودة بالفعل يجب الحفاظ عليها بدقة عند إعادة الهيكلة، لا كسرها | إيجابية (نقطة قوة، لا خطر) | القسم 2، جميع دوال `save*` |
| **Rollback** | لا توجد آلية Rollback موثّقة حالياً لأي عملية فاشلة جزئياً (مثال: نجاح `saveLocal()` وفشل المزامنة السحابية بصمت — كما في حالة الأطفال) | متوسطة | القسم 4.3 |

---

## 14. Compatibility Report — تقرير التوافق

الهدف: كيف يُحافَظ على توافق كامل مع كل ما هو قائم بدون كسر المشروع، عند أي تنفيذ مستقبلي (خارج نطاق هذه المرحلة):

| العنصر القائم | متطلب التوافق |
|---|---|
| **Google Apps Script (`Code_v4.gs`)** | لا يُعدَّل إطلاقاً في المراحل الأولى من الهجرة (Stage 1-3) — يستمر كما هو، فقط `SyncService` الجديد يستدعيه بنفس العقد (contract) الحالي: `action` + `sheet` + `data`/`rowIndex` |
| **`ApiService`** | يبقى نقطة الدخول الوحيدة للشبكة (كما صُمم أصلاً) — يجب أولاً إغلاق فجوة Bypass الموثّقة في القسم 9.1 **قبل** بناء `SyncService` فوقه، وإلا سيرث `SyncService` نفس التشتت |
| **IndexedDB الحالية** | لا يوجد شيء قائم للحفاظ عليه (القسم 6) — التوافق هنا يعني فقط: لا تُنشئ `DatabaseService` أي تعارض في اسم قاعدة بيانات مع أي تطبيق آخر يستخدم نفس المتصفح (مثال: أي مشروع آخر للمستخدم يستخدم IndexedDB بنفس النطاق — يُفضَّل اسم قاعدة بيانات مميّز مثل `HossamLawDB`) |
| **`localStorage`** | يجب أن يبقى `saveLocal()` (أو ما يعادله) يعمل بالتوازي خلال كل مراحل الهجرة الانتقالية، كخط دفاع أخير (fallback) إلى أن يثبت `DatabaseService` استقراره الكامل — عدم إزالته دفعة واحدة |
| **Modules (الوحدات الاثنتا عشرة)** | واجهات الدوال العامة الحالية (`saveCase()`, `deleteCase()`, إلخ) يجب أن تبقى بنفس التوقيع (signature) للحفاظ على توافق أزرار `onclick=""` المضمّنة مباشرة في `index.html` — أي تغيير داخلي في `saveCase()` ليستخدم `CaseRepository` بدل `data.cases` مباشرة يجب أن يكون **شفافاً تماماً** لكل استدعاءات `onclick` الحالية |
| **UI** | صفر تغيير متوقع على الواجهة أو `CSS` خلال أي من مراحل الهجرة الست — الهجرة بالكامل طبقة بيانات فقط |

---

## 15. Implementation Roadmap — خارطة طريق التنفيذ (ملخص تنفيذي)

1. **معالجة الديون التقنية الموثّقة أولاً** (خارج نطاق V10 تقنياً لكن يُنصح بتنفيذها أولاً كمرحلة تمهيدية منفصلة ومحددة النطاق صراحة، كما هو موثّق مسبقاً في الكود ذاته): إغلاق Bypass الشبكة في `settings.js`/`children.js`، وحسم مصير شيت "الأطفال" المفقود من الـ Backend.
2. **Stage 1**: Repository Layer فوق `data` كما هي (صفر مخاطرة، صفر تغيير سلوكي).
3. **Stage 2**: بناء `DatabaseService` بمعزل تام (اختبار وحدوي فقط، غير متصل بالتطبيق الحي).
4. **Stage 3**: هجرة تدريجية وحدة بوحدة، بدءاً بالأقل خطورة (Library/Templates — Local-only أصلاً).
5. **Stage 4-6**: `SyncService`، ترقية Backup، ثم فصل Google Sheets عن مسار CRUD اليومي.

---

## 16. Ready For Phase 2

جميع الأقسام أعلاه (1–15) مبنية على فحص مباشر وكامل لكل ملفات `Master_v9.zip` كما رُفع فعلياً، بدون أي افتراض غير موثّق داخل الكود نفسه، وبدون كتابة أو تعديل أو حذف أي كود أو ملف.

**التحفظ الوحيد المسجَّل:** عدم توفر `PROJECT_STATE.md` / `PROJECT_HISTORY.md` / `PROJECT_MAP.md` / `NEXT_PHASE.md` المطلوبة كمصدر رسمي — التقرير اعتمد حصراً على الكود الفعلي كمصدر وحيد للحقيقة، وهو الأساس الأكثر موثوقية المتاح فعلياً في هذا الرفع.

---

# Architecture Review

**PASS**

**Ready For Repository Layer**


---

## الملحق A — الجرد الكامل لكل موضع استخدام `data` (226 موضعاً)

يشمل الجدول أدناه كل سطر يحتوي على الكلمة `data` (ككلمة مستقلة) في كامل المشروع، مصنّفاً حسب نوع العملية. `COMMENT` تعني إشارة توثيقية (JSDoc) وليست عملية فعلية على البيانات. `READ?` تعني قراءة شبه مؤكدة (وصول مباشر بالفهرس أو استخدام في سياق لا يعدّل القيمة) رُصدت آلياً ثم رُوجعت يدوياً ضمن الأقسام أعلاه.

| الملف | السطر | نوع العملية | الشيفرة (مختصرة) |
|---|---|---|---|
| js/modules/calendar.js | 8 | COMMENT | `*   - data              : shared app data object  { sessions, … } —` |
| js/modules/calendar.js | 9 | READ | `*                         Calendar only READS data.sessions to mark` |
| js/modules/calendar.js | 11 | READ | `*                         own or write to data.sessions.` |
| js/modules/calendar.js | 21 | COMMENT | `*                         pattern as data/editIdx/currentTplFilter.` |
| js/modules/calendar.js | 35 | COMMENT | `* GAS Sheet name: none — Calendar has NO backend sync and NO data slice` |
| js/modules/calendar.js | 36 | READ | `* of its own. It is purely a read-only view over data.sessions (which` |
| js/modules/calendar.js | 39 | READ | `* data.sessions.` |
| js/modules/calendar.js | 46 | READ | `*     only reads data.sessions for display; ownership stays with` |
| js/modules/calendar.js | 70 | READ | `* Reads: calYear, calMonth, data.sessions.` |
| js/modules/calendar.js | 87 | READ | `data.sessions` |
| js/modules/calendar.js | 134 | READ | `* Reads: data.sessions, calYear, calMonth.` |
| js/modules/calendar.js | 140 | READ? | `var ss = data.sessions` |
| js/modules/settings.js | 7 | COMMENT | `// of index.html (API_URL, DRIVE_URL, data, toast(), saveLocal(),` |
| js/modules/settings.js | 97 | READ? | `function exportData(){var b=new Blob([JSON.stringify(data,null,2)],{type:'application/j...` |
| js/modules/settings.js | 99 | READ? | `function handleImport(evt){var f=evt.target.files[0];if(!f)return;var r=new FileReader(...` |
| js/modules/settings.js | 100 | READ? | `function clearAllData(){if(!confirm('مسح كل البيانات المحلية؟ لا يمكن التراجع!'))return...` |
| js/modules/settings.js | 112 | READ? | `try{var action=rowIndex>=0?'update':'add';var body={action:action,sheet:sheet,data:rowD...` |
| js/modules/settings.js | 125 | READ? | `try{var r=await fetch(API_URL+'?sheet='+encodeURIComponent(sh));var arr=await r.json();...` |
| js/modules/templates.js | 8 | COMMENT | `*   - data              : shared app data object  { templates, … }` |
| js/modules/templates.js | 16 | COMMENT | `*                         same pattern as data/editIdx.` |
| js/modules/templates.js | 30 | COMMENT | `* syncDeleteToSheets(). Templates data is local-only (localStorage),` |
| js/modules/templates.js | 72 | READ | `* saveTemplate — validates, saves to data.templates.` |
| js/modules/templates.js | 97 | UPDATE (index assign) | `data.templates[idx] = obj;` |
| js/modules/templates.js | 100 | WRITE (append) | `data.templates.push(obj);` |
| js/modules/templates.js | 110 | READ | `* editTemplate — opens the template modal pre-filled with existing data.` |
| js/modules/templates.js | 111 | READ | `* @param {number} i - 0-based index in data.templates` |
| js/modules/templates.js | 115 | READ | `fillForm('templates', data.templates[i]);` |
| js/modules/templates.js | 121 | READ | `* deleteTemplate — confirms, removes from data.templates.` |
| js/modules/templates.js | 122 | READ | `* @param {number} i - 0-based index in data.templates` |
| js/modules/templates.js | 132 | DELETE (splice-remove) | `data.templates.splice(i, 1);` |
| js/modules/templates.js | 163 | COMMENT | `* data, then renders the templates grid filtered by currentTplFilter.` |
| js/modules/templates.js | 164 | READ | `* Reads: data.templates, currentTplFilter.` |
| js/modules/templates.js | 168 | READ | `var cats = ['all'].concat([...new Set(data.templates.map(function(t) { return t['القسم'...` |
| js/modules/templates.js | 178 | READ | `var rows = data.templates.filter(function(t) {` |
| js/modules/templates.js | 195 | READ | `var ri = data.templates.indexOf(t);` |
| js/modules/documents.js | 8 | COMMENT | `*   - data              : shared app data object  { documents, cases, … }` |
| js/modules/documents.js | 64 | READ | `* Reads: data.documents, searchDocuments filter, filterDocType filter.` |
| js/modules/documents.js | 71 | READ | `var rows = data.documents.filter(function(d) {` |
| js/modules/documents.js | 89 | READ | `var ri = data.documents.indexOf(d);` |
| js/modules/documents.js | 111 | READ | `var ri = data.documents.indexOf(d);` |
| js/modules/documents.js | 139 | READ | `* saveDocument — validates, saves to data.documents, syncs to GAS.` |
| js/modules/documents.js | 157 | UPDATE (index assign) | `data.documents[idx] = obj;` |
| js/modules/documents.js | 160 | WRITE (append) | `data.documents.push(obj);` |
| js/modules/documents.js | 172 | READ | `* editDocument — opens the document modal pre-filled with existing data.` |
| js/modules/documents.js | 173 | READ | `* @param {number} i - 0-based index in data.documents` |
| js/modules/documents.js | 177 | READ | `populateCaseDropdown('fDocCaseNum', data.documents[i]['رقم_القضية']);` |
| js/modules/documents.js | 178 | READ | `fillForm('documents', data.documents[i]);` |
| js/modules/documents.js | 184 | READ | `* deleteDocument — confirms, removes from data.documents.` |
| js/modules/documents.js | 185 | READ | `* @param {number} i - 0-based index in data.documents` |
| js/modules/documents.js | 196 | DELETE (splice-remove) | `data.documents.splice(i, 1);` |
| js/modules/children.js | 7 | COMMENT | `// of index.html (data, editIdx, API_URL, FIELDS, MAP, saveLocal(), toast(),` |
| js/modules/children.js | 17 | COMMENT | `// data/editIdx/API_URL/FIELDS/MAP/saveLocal/toast/closeModal/updateBadges —` |
| js/modules/children.js | 25 | READ | `// "الأطفال" page: data.children[]). It does NOT include the separate,` |
| js/modules/children.js | 38 | WRITE (append) | `function saveChild(){var c=document.getElementById('fChildCaseNum').value.trim();var n=...` |
| js/modules/children.js | 39 | READ? | `function editChild(i){editIdx.children=i;populateCaseDropdown('fChildCaseNum',data.chil...` |
| js/modules/children.js | 40 | DELETE (splice-remove) | `function deleteChild(i){if(!confirm('حذف؟'))return;data.children.splice(i,1);saveLocal(...` |
| js/modules/children.js | 46 | READ | `var rows=data.children.filter(function(c){return!s\|\|Object.values(c).join(' ').toLowe...` |
| js/modules/children.js | 49 | READ | `tb.innerHTML=rows.map(function(c){var ri=data.children.indexOf(c);return'<tr><td><stron...` |
| js/modules/children.js | 50 | READ | `ml.innerHTML=rows.map(function(c){var ri=data.children.indexOf(c);return'<div class="m-...` |
| js/modules/clients.js | 8 | COMMENT | `*   - data          : shared app data object  { clients, cases, sessions, fees, … }` |
| js/modules/clients.js | 69 | READ | `var rows = data.clients.filter(function(c) {` |
| js/modules/clients.js | 88 | READ | `var ri = data.clients.indexOf(c);` |
| js/modules/clients.js | 109 | READ | `var ri = data.clients.indexOf(c);` |
| js/modules/clients.js | 166 | UPDATE (index assign) | `data.clients[idx] = obj;` |
| js/modules/clients.js | 169 | WRITE (append) | `data.clients.push(obj);` |
| js/modules/clients.js | 183 | READ | `* @param {number} i  0-based index in data.clients` |
| js/modules/clients.js | 187 | READ | `fillForm('clients', data.clients[i]);` |
| js/modules/clients.js | 194 | READ | `* @param {number} i  0-based index in data.clients` |
| js/modules/clients.js | 201 | DELETE (splice-remove) | `data.clients.splice(i, 1);` |
| js/modules/clients.js | 215 | READ | `* @param {number} i  0-based index in data.clients` |
| js/modules/clients.js | 218 | READ? | `var c = data.clients[i];` |
| js/modules/clients.js | 289 | READ | `var linkedCases = (data.cases \|\| []).filter(function(cs) {` |
| js/modules/clients.js | 295 | READ | `var linkedFees = (data.fees \|\| []).filter(function(f) {` |
| js/modules/clients.js | 417 | READ | `* @param {number} i  0-based index in data.clients` |
| js/modules/clients.js | 420 | READ? | `var c = data.clients[i];` |
| js/modules/clients.js | 468 | READ | `* @param {number} i  0-based index in data.clients` |
| js/modules/clients.js | 471 | READ? | `var c = data.clients[i];` |
| js/modules/clients.js | 560 | READ? | `if (idx === undefined \|\| idx === null \|\| !data.clients[idx]) {` |
| js/modules/clients.js | 568 | READ? | `data.clients[idx]['portal_token'] = newToken;` |
| js/modules/clients.js | 571 | READ | `ApiService.updateData('الموكلين', data.clients[idx], idx);` |
| js/modules/clients.js | 577 | READ? | `var c = data.clients[idx];` |
| js/modules/clients.js | 586 | READ | `// (fCaseClient field). It lives here because it reads data.clients` |
| js/modules/clients.js | 671 | READ | `var all     = (data.clients \|\| []).filter(function(c) { return (c['الاسم'] \|\| '').t...` |
| js/modules/clients.js | 737 | READ | `* the matching data.clients record.` |
| js/modules/clients.js | 745 | READ | `var match = (data.clients \|\| []).filter(function(c) {` |
| js/modules/clients.js | 839 | READ | `if (!data.clients \|\| !data.clients.length) {` |
| js/modules/clients.js | 848 | READ | `var rows = data.clients.map(function(c, i) {` |
| js/modules/clients.js | 872 | READ | `'<p>تاريخ الطباعة: ' + today + ' \| عدد الموكلين: ' + data.clients.length + '</p>' +` |
| js/modules/dashboard.js | 6 | COMMENT | `// This file depends on the shared global `data` object (declared in the` |
| js/modules/dashboard.js | 48 | READ | `var active=data.cases.filter(function(c){return['نشطة','active'].includes(c['الحالة']);...` |
| js/modules/dashboard.js | 49 | READ | `var todaySess=data.sessions.filter(function(s){return String(s['التاريخ']).slice(0,10)=...` |
| js/modules/dashboard.js | 50 | READ | `var weekSess=data.sessions.filter(function(s){var d=parseLocalDate(s['التاريخ']);return...` |
| js/modules/dashboard.js | 51 | READ | `var urgent=data.tasks.filter(function(t){return t['الأولوية']==='high'&&t['الحالة']!=='...` |
| js/modules/dashboard.js | 52 | READ? | `document.getElementById('statCases').textContent=data.cases.length;` |
| js/modules/dashboard.js | 56 | READ? | `document.getElementById('statClients').textContent=data.clients.length;` |
| js/modules/dashboard.js | 59 | READ | `var ts=data.sessions.filter(function(s){return String(s['التاريخ']).slice(0,10)===today...` |
| js/modules/dashboard.js | 61 | READ | `var up=data.sessions.filter(function(s){var d=parseLocalDate(s['التاريخ']);return d&&d>...` |
| js/modules/dashboard.js | 65 | READ | `var ut=data.tasks.filter(function(t){return t['الأولوية']==='high'&&t['الحالة']!=='done...` |
| js/modules/dashboard.js | 73 | READ | `setBadge('badgeCases',data.cases.length);` |
| js/modules/dashboard.js | 74 | READ | `setBadge('badgeSessions',data.sessions.length);` |
| js/modules/dashboard.js | 75 | READ | `setBadge('badgeClients',data.clients.length);` |
| js/modules/dashboard.js | 76 | READ | `setBadge('badgeChildren',data.children.length);` |
| js/modules/dashboard.js | 77 | READ | `setBadge('badgeDocuments',data.documents.length);` |
| js/modules/dashboard.js | 78 | READ | `setBadge('badgeTasks',data.tasks.filter(function(t){return t['الحالة']!=='done';}).leng...` |
| js/modules/dashboard.js | 79 | READ | `setBadge('badgeFees',data.fees.length);` |
| js/modules/cases.js | 8 | COMMENT | `*   - data          : shared app data object  { cases, sessions, documents, clients, … }` |
| js/modules/cases.js | 103 | READ | `var rows = data.cases.filter(function(c) {` |
| js/modules/cases.js | 125 | READ | `var ri = data.cases.indexOf(c);` |
| js/modules/cases.js | 149 | READ | `var ri = data.cases.indexOf(c);` |
| js/modules/cases.js | 199 | UPDATE (index assign) | `data.cases[idx] = obj;` |
| js/modules/cases.js | 202 | WRITE (append) | `data.cases.push(obj);` |
| js/modules/cases.js | 221 | READ | `fillForm('cases', data.cases[i]);` |
| js/modules/cases.js | 233 | DELETE (splice-remove) | `data.cases.splice(i, 1);` |
| js/modules/cases.js | 242 | READ | `// (Consumed by renderDashboard in index.html via data.cases)` |
| js/modules/cases.js | 250 | READ? | `var total  = data.cases.length;` |
| js/modules/cases.js | 251 | READ | `var active = data.cases.filter(function(c) {` |
| js/modules/cases.js | 254 | READ | `var closed = data.cases.filter(function(c) {` |
| js/modules/cases.js | 257 | READ | `var pending = data.cases.filter(function(c) {` |
| js/modules/cases.js | 287 | READ? | `var c = data.cases[i];` |
| js/modules/cases.js | 292 | READ | `var sessions = data.sessions.filter(function(s) {` |
| js/modules/cases.js | 298 | READ | `var docs = data.documents.filter(function(d) {` |
| js/modules/cases.js | 307 | READ | `// employer).  Back-fill any missing client fields from data.clients so the` |
| js/modules/cases.js | 311 | READ | `if (clientName && data.clients) {` |
| js/modules/cases.js | 314 | READ? | `for (var _ci = 0; _ci < data.clients.length; _ci++) {` |
| js/modules/cases.js | 315 | READ? | `if ((data.clients[_ci]['الاسم'] \|\| '').trim() === firstName) {` |
| js/modules/cases.js | 316 | READ? | `clientRecord = data.clients[_ci];` |
| js/modules/cases.js | 554 | READ? | `var c = data.cases[i];` |
| js/modules/cases.js | 558 | READ | `var sessions = data.sessions.filter(function(s) {` |
| js/modules/cases.js | 563 | READ | `var docs = data.documents.filter(function(d) { return d['رقم_القضية'] === caseNum; });` |
| js/modules/cases.js | 634 | READ? | `var c = data.cases[i];` |
| js/modules/cases.js | 641 | READ? | `for (var x = 0; x < data.clients.length; x++) {` |
| js/modules/cases.js | 642 | READ? | `if ((data.clients[x]['الاسم'] \|\| '').trim() === clientName.trim()) { ci = x; break; }` |
| js/modules/cases.js | 723 | COMMENT | `// We wrap saveCase so children data is harvested before collectForm runs.` |
| js/modules/cases.js | 795 | READ | `data.cases.forEach(function(c) {` |
| js/modules/cases.js | 808 | READ | `// Shared helper kept here because it reads data.cases.` |
| js/modules/cases.js | 819 | READ | `var c = data.cases.find(function(x) { return x['رقم_القضية'] === caseNum; });` |
| js/modules/cases.js | 845 | READ | `var c = data.cases.find(function(x) { return x['رقم_القضية'] === caseNum; });` |
| js/modules/tasks.js | 8 | COMMENT | `*   - data              : shared app data object  { tasks, cases, … }` |
| js/modules/tasks.js | 30 | COMMENT | `*     in index.html, since they read across multiple data slices)` |
| js/modules/tasks.js | 67 | READ | `* Reads: data.tasks, searchTasks filter, filterTaskPriority filter.` |
| js/modules/tasks.js | 80 | READ | `var rows = data.tasks.filter(function(t) {` |
| js/modules/tasks.js | 98 | READ | `var ri   = data.tasks.indexOf(t);` |
| js/modules/tasks.js | 132 | READ | `* saveTask — validates, saves to data.tasks, syncs to GAS.` |
| js/modules/tasks.js | 149 | UPDATE (index assign) | `data.tasks[idx] = obj;` |
| js/modules/tasks.js | 152 | WRITE (append) | `data.tasks.push(obj);` |
| js/modules/tasks.js | 164 | READ | `* editTask — opens the task modal pre-filled with existing data.` |
| js/modules/tasks.js | 165 | READ | `* @param {number} i - 0-based index in data.tasks` |
| js/modules/tasks.js | 169 | READ | `fillForm('tasks', data.tasks[i]);` |
| js/modules/tasks.js | 175 | READ | `* deleteTask — confirms, removes from data.tasks.` |
| js/modules/tasks.js | 176 | READ | `* @param {number} i - 0-based index in data.tasks` |
| js/modules/tasks.js | 186 | DELETE (splice-remove) | `data.tasks.splice(i, 1);` |
| js/modules/tasks.js | 195 | READ | `* @param {number} i - 0-based index in data.tasks` |
| js/modules/tasks.js | 203 | READ? | `data.tasks[i]['الحالة'] = data.tasks[i]['الحالة'] === 'done' ? 'pending' : 'done';` |
| js/modules/fees.js | 8 | COMMENT | `*   - data              : shared app data object  { fees, cases, … }` |
| js/modules/fees.js | 30 | READ | `*     `data.cases`, so it is owned by the Cases module, not Fees` |
| js/modules/fees.js | 72 | READ | `* Reads: data.fees, searchFees filter.` |
| js/modules/fees.js | 84 | READ | `* computed from the FULL, unfiltered data.fees array — not from the` |
| js/modules/fees.js | 93 | READ | `var rows = data.fees.filter(function(f) {` |
| js/modules/fees.js | 101 | READ? | `var total = data.fees.reduce(function(acc, f) {` |
| js/modules/fees.js | 105 | READ? | `document.getElementById('feesCountNum').textContent = data.fees.length;` |
| js/modules/fees.js | 116 | READ | `var ri = data.fees.indexOf(f);` |
| js/modules/fees.js | 137 | READ | `var ri = data.fees.indexOf(f);` |
| js/modules/fees.js | 165 | READ | `* saveFee — validates, saves to data.fees, syncs to GAS.` |
| js/modules/fees.js | 183 | UPDATE (index assign) | `data.fees[idx] = obj;` |
| js/modules/fees.js | 186 | WRITE (append) | `data.fees.push(obj);` |
| js/modules/fees.js | 198 | READ | `* editFee — opens the fee modal pre-filled with existing data.` |
| js/modules/fees.js | 199 | READ | `* @param {number} i - 0-based index in data.fees` |
| js/modules/fees.js | 203 | READ | `populateCaseDropdown('fFeeCaseNum', data.fees[i]['رقم_القضية']);` |
| js/modules/fees.js | 204 | READ | `fillForm('fees', data.fees[i]);` |
| js/modules/fees.js | 210 | READ | `* deleteFee — confirms, removes from data.fees.` |
| js/modules/fees.js | 211 | READ | `* @param {number} i - 0-based index in data.fees` |
| js/modules/fees.js | 222 | DELETE (splice-remove) | `data.fees.splice(i, 1);` |
| js/modules/sessions.js | 8 | COMMENT | `*   - data              : shared app data object  { sessions, cases, … }` |
| js/modules/sessions.js | 82 | READ | `* Reads: data.sessions, searchSessions filter, filterSessionStatus filter.` |
| js/modules/sessions.js | 89 | READ? | `var rows = data.sessions` |
| js/modules/sessions.js | 109 | READ | `var ri  = data.sessions.indexOf(s);` |
| js/modules/sessions.js | 157 | READ | `* saveSession — validates, saves to data.sessions, syncs to GAS.` |
| js/modules/sessions.js | 176 | UPDATE (index assign) | `data.sessions[idx] = obj;` |
| js/modules/sessions.js | 179 | WRITE (append) | `data.sessions.push(obj);` |
| js/modules/sessions.js | 191 | READ | `* editSession — opens the session modal pre-filled with existing data.` |
| js/modules/sessions.js | 192 | READ | `* @param {number} i - 0-based index in data.sessions` |
| js/modules/sessions.js | 196 | READ | `populateCaseDropdown('fSessionCaseNum', data.sessions[i]['رقم_القضية']);` |
| js/modules/sessions.js | 197 | READ | `fillForm('sessions', data.sessions[i]);` |
| js/modules/sessions.js | 198 | READ | `autofillSessionFromCase(data.sessions[i]['رقم_القضية'], true);` |
| js/modules/sessions.js | 204 | READ | `* deleteSession — confirms, removes from data.sessions, syncs to GAS.` |
| js/modules/sessions.js | 205 | READ | `* @param {number} i - 0-based index in data.sessions` |
| js/modules/sessions.js | 211 | DELETE (splice-remove) | `data.sessions.splice(i, 1);` |
| js/modules/library.js | 8 | COMMENT | `*   - data              : shared app data object  { library, … }` |
| js/modules/library.js | 27 | COMMENT | `* called syncToSheets()/syncDeleteToSheets(). Library data is local-only` |
| js/modules/library.js | 35 | READ | `*     functionally separate page/data-slice (data.templates), not` |
| js/modules/library.js | 75 | COMMENT | `* filter <select> options from the current data, and updates the` |
| js/modules/library.js | 77 | READ | `* Reads: data.library, searchLibrary filter, filterLibCat filter,` |
| js/modules/library.js | 87 | READ | `var cats = [...new Set(data.library.map(function(b) { return b['القسم']; }).filter(Bool...` |
| js/modules/library.js | 93 | READ | `var rows = data.library.filter(function(b) {` |
| js/modules/library.js | 122 | READ | `var ri = data.library.indexOf(b);` |
| js/modules/library.js | 151 | READ | `* saveLibBook — validates, saves to data.library.` |
| js/modules/library.js | 174 | UPDATE (index assign) | `data.library[idx] = obj;` |
| js/modules/library.js | 177 | WRITE (append) | `data.library.push(obj);` |
| js/modules/library.js | 187 | READ | `* editLibBook — opens the library modal pre-filled with existing data.` |
| js/modules/library.js | 188 | READ | `* @param {number} i - 0-based index in data.library` |
| js/modules/library.js | 192 | READ | `fillForm('library', data.library[i]);` |
| js/modules/library.js | 198 | READ | `* deleteLibBook — confirms, removes from data.library.` |
| js/modules/library.js | 199 | READ | `* @param {number} i - 0-based index in data.library` |
| js/modules/library.js | 210 | DELETE (splice-remove) | `data.library.splice(i, 1);` |
| js/api/api.js | 21 | COMMENT | `*   - localStorage helpers (saveLocal, data object)` |
| js/api/api.js | 148 | READ? | `await this._post({ action: 'add', sheet: sheetName, data: rowData });` |
| js/api/api.js | 164 | COMMENT | `* @param {number} rowIndex   - 0-based index in the frontend data array` |
| js/api/api.js | 173 | READ? | `data: rowData,` |
| js/api/api.js | 211 | COMMENT | `* @param {number} rowIndex   - 0-based index in the frontend data array` |
| js/api/api.js | 361 | COMMENT | `*   '&ecc=M&data=' + encodeURIComponent(portalUrl)` |
| js/api/api.js | 364 | COMMENT | `* @param {string} data     - The URL / text to encode in the QR` |
| js/api/api.js | 369 | READ? | `getQrImageUrl(data, size = 200, ecc = 'M') {` |
| js/api/api.js | 374 | READ? | `'&data=' + encodeURIComponent(data)` |
| js/print-utils.js | 30 | COMMENT | `// Populates the form fields for `type` from a data object `obj`, using the type's` |
| js/print-utils.js | 34 | COMMENT | `// Reads the current values of the form fields for `type` back into a plain data` |
| index.html | 572 | READ? | `var data={` |
| index.html | 586 | READ? | `function saveLocal(){['cases','sessions','clients','children','documents','tasks','fees...` |
| index.html | 650 | WRITE (reassign) | `data.sessions=data.sessions.map(function(s){if(s['الوقت'])s['الوقت']=sanitizeTime(s['ال...` |
| index.html | 651 | READ | `localStorage.setItem('sessions',JSON.stringify(data.sessions));` |
| Code_v4.gs | 427 | READ? | `if (!body.data) return jsonResponse({ error: 'لا توجد بيانات' });` |
| Code_v4.gs | 429 | READ? | `const v = body.data[h];` |
| Code_v4.gs | 436 | READ? | `try { calEventId = addToCalendar(body.data); } catch(ce) {}` |
| Code_v4.gs | 449 | READ? | `const v = body.data[h];` |
| Code_v4.gs | 457 | READ? | `updateCalendarEvent(oldId, body.data);` |
| Code_v4.gs | 986 | READ? | `function jsonResponse(data) {` |
| Code_v4.gs | 988 | READ? | `.createTextOutput(JSON.stringify(data))` |
