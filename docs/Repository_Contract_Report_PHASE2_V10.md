# Repository Contract Report
## نظام الحسام للمحاماة — PHASE 2: Repository Layer Design
### V10 — Offline First Architecture

---

## ⚠️ Input Gap (يُوثَّق هنا فقط، لا يؤثر على باقي التقرير)

قبل البدء، توثيق إلزامي للفجوة في المدخلات المرجعية المطلوبة أصلاً:

| المرجع المطلوب | الحالة |
|---|---|
| `Database_Architecture_Report.md` | **غير موجود.** الملف المرفوع بهذا الاسم يحتوي فعلياً على نص تعليمات PHASE 2 نفسه، وليس تقريراً معمارياً لقاعدة البيانات. |
| `Master_v10_Base.zip` | **غير موجود.** المرفوع فعلياً هو `Master_v9.zip`. |
| `PROJECT_STATE.md` | ✅ موجود ومُتحقَّق منه — تم التأكد من تطابقه حرفياً مع كود `Master_v9.zip` الفعلي (MD5 لـ `index.html` و`dashboard.js` مطابقان تماماً لما هو موثّق فيه، 12 موديول محمّلة فعلياً، `print-utils.js` = 36 سطراً كما هو موثق). **يُعتمَد كمرجع أساسي بديل.** |
| `PROJECT_HISTORY.md` | ✅ موجود. |
| `PROJECT_MAP.md` | ✅ موجود لكنه **قديم** (مبني على `Master_v8_Stable.zip`، قبل دمج Children وDashboard). استُخدم فقط لتفاصيل بنيوية ثابتة لم تتغيّر (`FIELDS`/`MAP`/العلاقات/تعارضات التسمية القديمة)، وليس لحالة الدمج الحالية. |
| `NEXT_PHASE.md` | ✅ موجود. |

بناءً على تعليمات المستخدم الصريحة: التصميم أدناه مبني **حصراً** على `PROJECT_STATE.md` + `PROJECT_MAP.md` + فحص مباشر لكود `Master_v9.zip` الفعلي (`index.html`, `Code_v4.gs`, `js/api/api.js`, بنية `data`/`FIELDS`/`MAP`)، دون أي افتراض من خارج المشروع.

---

## 1. Repository Principles

مبادئ حاكمة لكل Repository في النظام:

1. **عزل كامل عن مصدر التخزين.** لا Module يعرف إن كانت البيانات قادمة من `localStorage`, `IndexedDB` مستقبلاً, أو Google Sheets عبر `ApiService`. الـ Repository هو الحائط الوحيد.
2. **واجهة موحدة، تنفيذ داخلي حر.** كل Repositories تلتزم بنفس الـ Contract (القسم 3)، لكن كل واحد حر في كيفية تنفيذه داخلياً حسب طبيعة بياناته.
3. **مصدر واحد للحقيقة داخل الجلسة (Single Source of Truth).** الـ Repository — وليس أي Module — هو من يملك نسخة `data.*` المخزَّنة في الذاكرة. الـ Modules تقرأ عبر الـ Repository فقط.
4. **Offline-first دائماً.** كل عملية كتابة تنجح محلياً (in-memory + `localStorage`) أولاً وبشكل متزامن (sync)، ثم تُزامَن مع Google Sheets بشكل غير متزامن (async) و**best-effort** — فشل الشبكة لا يفشل العملية المحلية أبداً.
5. **لا منطق عرض (UI) داخل Repository.** ممنوع `toast()`, `closeModal()`, `document.*` داخل أي Repository. الـ Repository يُرجع نتائج/أخطاء منظّمة فقط، والـ Module هو من يقرر كيف يعرضها.
6. **لا منطق نموذج (Form) داخل Repository.** `collectForm`/`fillForm`/`resetForm`/`FIELDS`/`MAP` تبقى طبقة UI منفصلة تتحدث مع الـ Repository بكائنات بيانات نظيفة (Arabic-keyed row objects) — نفس الشكل المستخدم حالياً في `data.*`.
7. **Repository لا يعرف عن Repository آخر مباشرة.** أي علاقة بين الكيانات (مثلاً Case → Sessions) تُدار عبر مُعرِّف مشترك (`رقم_القضية`) يُمرَّر من الـ Module/Orchestration layer، وليس عبر استدعاء Repository لـ Repository. (تفصيل الاستثناء الوحيد المسموح به في القسم 12).
8. **كل تغيير قابل للتتبع.** كل عملية Write تُنتج نتيجة تحتوي: نجاح/فشل، مصدر الفشل (محلي أو مزامنة)، والحالة الناتجة.
9. **التوافق الخلفي أولوية مطلقة.** بنية `data.*` (المصفوفات التسع)، مفاتيح `localStorage`، وأسماء الحقول العربية في `MAP` **لا تتغيّر شكلاً** — الـ Repository يغلّفها، لا يستبدلها.
10. **لا قرار سياسي ضمني.** الفجوات المعروفة والمفتوحة حالياً (حذف الأطفال لا يزامن، حذف Documents/Tasks/Fees محلي فقط) **لا يحلّها هذا التصميم** — التصميم فقط يجعل هذه القرارات نقاط تحكم صريحة وواضحة داخل كل Repository (`syncPolicy`)، بدل أن تكون قراراً ضمنياً مبعثراً في كل Module.

### ما المحظور وجوده داخل Repository

- استدعاء `document.*` أو أي DOM API.
- استدعاء `toast()`, `closeModal()`, `showLoading()`.
- قراءة/كتابة `FIELDS`, `MAP`, `editIdx`, `currentPage` مباشرة (هذه ملك طبقة الـ Module/Form).
- منطق تنقّل (`navigate()`).
- بناء HTML أو قوالب طباعة (`buildCaseReport`, `vf`, `printView`).
- منطق مصادقة (لا يوجد حالياً أصلاً في المشروع — القسم 17).
- معرفة بمصدر الشبكة الفعلي (`fetch`, `API_URL`) — هذا حصراً داخل `ApiService`، والـ Repository يستدعي `ApiService` كـ dependency معرَّفة، لا يبنيها.

---

## 2. Repository Responsibilities

كل Repository مسؤول عن **دورة حياة كيان بيانات واحد** (Entity) بالكامل:

| المسؤولية | التفصيل |
|---|---|
| **الاحتفاظ بالحالة** | يملك نسخة الحقيقة لمصفوفة `data.<entity>` أثناء الجلسة. |
| **القراءة** | `get`, `getAll`, `find`, `search`, `exists`, `count` — بدون أي تأثير جانبي. |
| **الكتابة المحلية المتزامنة** | `create`, `update`, `delete` تُطبَّق فوراً على النسخة في الذاكرة + `localStorage`، وتُرجع نتيجة فورية دون انتظار الشبكة. |
| **جدولة المزامنة** | بعد نجاح الكتابة المحلية، يستدعي `ApiService` (إن كان `API_URL` معرَّفاً) حسب `syncPolicy` الخاصة بالكيان — بدون حجب (blocking) العملية المحلية. |
| **التحقق (Validation)** | يطبّق قواعد الحقل الإلزامي، الفرادة، والـ Foreign Key **قبل** الكتابة (تفصيل في القسم 9)، ويرفض العملية برسالة خطأ منظّمة إذا فشل التحقق. |
| **الفهرسة الداخلية** | يحتفظ بفهارس مساعدة (مثلاً `رقم_القضية → [sessions indices]`) لتسريع البحث والعلاقات، دون كشفها للخارج. |
| **إعادة تحميل من المصدر البعيد** | `import`/`refresh` — استبدال أو دمج البيانات القادمة من Google Sheets. |
| **التصدير** | `export` — إرجاع نسخة نظيفة قابلة للتسلسل (serialize) لأغراض `exportData()`/النسخ الاحتياطي. |

**ما لا يقع ضمن مسؤولية الـ Repository:**
- عرض البيانات (Rendering) — مسؤولية `render*()` في الـ Module.
- التحقق من صحة النموذج على مستوى الـ UI (مثل تنسيق حقل تاريخ HTML) — تبقى في `collectForm`/`resetForm`.
- قرار "متى" تُستدعى العملية (مثل ماذا يحدث عند الضغط على زر) — مسؤولية الـ Module.
- بناء تقارير الطباعة أو QR — مسؤولية `print-utils.js`/`clients.js` (تستهلك بيانات من Repository فقط).

---

## 3. Repository Contract

Contract موحد **يجب** أن يلتزم به كل Repository دون استثناء. (تصميم توقيعات منطقية فقط — لا كود):

| العملية | الوصف | نوع الإرجاع (منطقي) |
|---|---|---|
| `create(entity)` | إضافة سجل جديد بعد Validation | `WriteResult` |
| `update(id, patch)` | تعديل سجل قائم بعد Validation | `WriteResult` |
| `delete(id)` | حذف سجل (منطق الحذف — soft/hard حسب الكيان، القسم 6) | `WriteResult` |
| `get(id)` | إرجاع سجل واحد أو `null` | `Entity \| null` |
| `getAll()` | إرجاع كل السجلات (نسخة، وليست مرجعاً مباشراً للمصفوفة الداخلية) | `Entity[]` |
| `find(predicate \| queryModel)` | إرجاع أول سجل مطابق | `Entity \| null` |
| `exists(id)` | فحص وجود سجل | `boolean` |
| `count(queryModel?)` | عدد السجلات (مع فلترة اختيارية) | `number` |
| `bulkInsert(entities[])` | إدخال دفعة (مثلاً عند `importData`) | `WriteResult[]` |
| `bulkUpdate(patches[])` | تعديل دفعة | `WriteResult[]` |
| `bulkDelete(ids[])` | حذف دفعة | `WriteResult[]` |
| `search(queryModel)` | بحث نصي/فلترة/فرز/ترقيم (القسم 7) | `QueryResult` |
| `export()` | نسخة كاملة قابلة للتسلسل لأغراض النسخ الاحتياطي | `Entity[]` |
| `import(entities[], mode)` | استيراد كامل (`replace` أو `merge`) — يُستخدم في `handleImport`/`loadFromSheets` | `ImportResult` |
| `clear()` | تفريغ كامل للكيان — يُستخدم في `clearAllData()` | `WriteResult` |
| `transaction(ops[])` | تنفيذ عدة عمليات كوحدة واحدة (القسم 8) | `TransactionResult` |

**ملاحظة إلزامية:** ليس كل Repository يحتاج فعلياً كل هذه العمليات (مثلاً `Dashboard` Repository لا معنى لـ `create` عنده — القسم 4)، لكن **التوقيع موجود دائماً في الـ Contract نفسه**؛ الـ Repository الذي لا يدعم عملية معيّنة يُرجع خطأ `UnsupportedOperationError` منظّم بدل أن يغيب التوقيع، حفاظاً على تناسق الواجهة عبر كل الـ 12 Repository.

---

## 4. Repository Catalog

بناءً على مصفوفات `data.*` الفعلية التسع + الكيانات المشتقة من الصفحات الثلاث بدون مصفوفة بيانات خاصة بها (Library, Templates موجودتان فعلاً ضمن الـ 9، لكن Settings/Calendar/Dashboard لا تملك مصفوفة `data.*` مستقلة).

### 4.1 Cases Repository
- **المسؤوليات:** دورة حياة القضية الكاملة؛ أكبر كيان من حيث عدد الحقول (35 حقلاً في `FIELDS.cases`).
- **البيانات المُدارة:** `data.cases` — مفتاح طبيعي `رقم_القضية` (`فريد منطقياً` لكن **غير مفروض حالياً بالكود** — نقطة يجب أن يفرضها Repository عبر Validation، القسم 9).
- **العلاقات:** يُشار إليه من Sessions, Documents, Tasks, Fees, Children عبر `رقم_القضية` (foreign key منطقي، لا فرض قاعدة بيانات فعلي حالياً). حقل `أطفال_القضية` مضمّن داخل سجل القضية نفسه أيضاً (تكرار بيانات موثّق — إدخال الأطفال إما Embedded داخل القضية أو عبر Children Repository المستقل، وهذا تضارب بنيوي موجود بالفعل في المشروع، القسم 15/17).
- **الفهارس المطلوبة:** `رقم_القضية` (فهرس أساسي)، `الحالة` (فلترة شائعة في `renderCases`)، `تاريخ_الجلسة_القادمة` (لترتيب Dashboard/Urgency badges).
- **نوع البحث:** فلترة حسب الحالة/النوع + بحث نصي حر عبر اسم الموكل/الخصم/رقم القضية (نمط شائع في كل صفحات القوائم الحالية).
- **نوع العمليات:** CRUD كامل + `search` مكثّف (يُستهلَك من Dashboard وSessions وFees وDocuments وTasks عبر `populateCaseDropdown`).

### 4.2 Clients Repository
- **المسؤوليات:** بيانات الموكلين + Portal Token (QR).
- **البيانات المُدارة:** `data.clients`.
- **العلاقات:** لا Foreign Key صريح تجاه Cases في البيانات الحالية (الربط يتم بالاسم النصي `اسم_الموكل` وليس معرِّف — فجوة تصميم موثقة، القسم 15).
- **الفهارس المطلوبة:** `الاسم`, `الرقم_القومي`.
- **نوع البحث:** بحث نصي بالاسم/الرقم القومي/الهاتف.
- **نوع العمليات:** CRUD + عملية خاصة `generatePortalToken`/`revokePortalToken` (القسم 6 — عملية متخصصة وليست جزءاً من الـ Contract الموحّد).

### 4.3 Children Repository
- **المسؤوليات:** بيانات الأطفال المرتبطين بقضايا الحضانة/النفقة.
- **البيانات المُدارة:** `data.children`.
- **العلاقات:** `رقم_القضية` → Cases (foreign key منطقي).
- **الفهارس المطلوبة:** `رقم_القضية` (كل استعلامات Children عملياً هي "أطفال قضية معيّنة").
- **نوع البحث:** فلترة حسب `رقم_القضية` فقط عملياً (لا بحث نصي حر موثّق في الكود الحالي).
- **نوع العمليات:** CRUD. **فجوة موروثة يجب أن يعكسها الـ Repository صراحة:** `delete()` في هذا الـ Repository له `syncPolicy = local-only` حالياً (القرار السياسي لم يُحسم بعد حسب `NEXT_PHASE.md`) — الحقل غير موجود أصلاً كـ Sheet في `Code_v4.gs` (`SHEET_DEFS` لا يحتوي `الأطفال`)، فيجب أن يُصمَّم هذا الـ Repository بحيث `syncPolicy` كله (create/update/delete) قابل للتفعيل لاحقاً فور حسم القرار وإضافة الـ Sheet، دون تغيير الـ Contract.

### 4.4 Sessions Repository
- **المسؤوليات:** جلسات المحكمة.
- **البيانات المُدارة:** `data.sessions`.
- **العلاقات:** `رقم_القضية` → Cases.
- **الفهارس المطلوبة:** `رقم_القضية`, `التاريخ` (Dashboard وCalendar يعتمدان بشدة على الترتيب الزمني).
- **نوع البحث:** فلترة بنطاق تاريخ (Date Range) — أساسي لصفحة Calendar وDashboard (الجلسات القادمة).
- **نوع العمليات:** CRUD؛ ملاحظة خاصة: `sanitizeTime()` تُطبَّق على حقل `الوقت` عند التحميل (`DOMContentLoaded`) — هذا تطبيع بيانات (data normalization) يجب أن ينتقل ليكون جزءاً من Validation/Normalization Layer داخل هذا الـ Repository بدل أن يبقى منطقاً معزولاً في `index.html`.

### 4.5 Fees Repository
- **المسؤوليات:** سجلات الأتعاب المالية.
- **البيانات المُدارة:** `data.fees`.
- **العلاقات:** `رقم_القضية` → Cases، `اسم_الموكل` (نصي) → Clients.
- **الفهارس المطلوبة:** `رقم_القضية`, `تاريخ_الاستلام`.
- **نوع البحث:** فلترة بنطاق تاريخ + تجميع (Aggregation) للمبالغ — مطلوب فعلياً لأي تقرير مالي مستقبلي رغم عدم وجوده حالياً بالواجهة.
- **نوع العمليات:** CRUD؛ **فجوة موروثة:** `delete()` محلي فقط حالياً (لا مزامنة حذف) — نفس نمط `syncPolicy` الصريح المطلوب في Children.

### 4.6 Tasks Repository
- **المسؤوليات:** مهام المتابعة.
- **البيانات المُدارة:** `data.tasks`.
- **العلاقات:** `رقم_القضية` → Cases (اختياري — المهمة قد لا ترتبط بقضية).
- **الفهارس المطلوبة:** `الحالة`, `الموعد_النهائي`.
- **نوع البحث:** فلترة حسب الحالة + الأولوية + نطاق تاريخ الاستحقاق.
- **نوع العمليات:** CRUD + عملية متخصصة `toggleStatus(id)` (مطابقة لـ `toggleTask()` الحالية) — عملية جزئية (partial update) على حقل واحد، مصمَّمة كعملية خاصة وليست `update()` عامة لتفادي إرسال كامل السجل عبر الشبكة لتغيير حقل واحد فقط (تحسين أداء، القسم 14). **فجوة موروثة:** `delete()` محلي فقط.

### 4.7 Documents Repository
- **المسؤوليات:** سجلات المستندات المرتبطة بروابط Google Drive.
- **البيانات المُدارة:** `data.documents`.
- **العلاقات:** `رقم_القضية` → Cases.
- **الفهارس المطلوبة:** `رقم_القضية`, `نوع_المستند`.
- **نوع البحث:** فلترة حسب القضية + النوع.
- **نوع العمليات:** CRUD. **فجوة موروثة:** `delete()` محلي فقط (نفس نمط Fees/Tasks). ملاحظة: الحقل `رابط_Drive` نصي فقط حالياً — لا تكامل فعلي مع رفع ملفات (`ApiService.uploadFile` معرَّفة لكن **غير مستخدَمة** في أي مكان بالكود الحالي، موثّق في `PROJECT_MAP.md`).

### 4.8 Library Repository
- **المسؤوليات:** مكتبة قانونية مرجعية (كتب/مصادر).
- **البيانات المُدارة:** `data.library`.
- **العلاقات:** لا علاقات — كيان مستقل بالكامل.
- **الفهارس المطلوبة:** `النوع`, `القسم`.
- **نوع البحث:** فلترة حسب القسم/النوع.
- **نوع العمليات:** CRUD محلي بالكامل فقط. **`syncPolicy = local-only` تصميماً وليس فجوة** — موثّق في `PROJECT_MAP.md` أن هذا الكيان "Local-only by design" (لا Sheet مقابل له في الخلفية أصلاً بخلاف Children/Fees/Tasks/Documents التي لها أوراق لكن الحذف فقط لا يُزامَن).

### 4.9 Templates Repository
- **المسؤوليات:** صيغ الدعاوى الجاهزة.
- **البيانات المُدارة:** `data.templates`.
- **العلاقات:** لا علاقات.
- **الفهارس المطلوبة:** `النوع`, `القسم`.
- **نوع البحث:** فلترة (يُستخدم فعلياً عبر `currentTplFilter` global حالياً — يجب أن ينتقل هذا الفلتر ليكون معياراً في `QueryModel` بدل global منفصل).
- **نوع العمليات:** CRUD محلي بالكامل فقط (نفس وضع Library — `local-only by design`).

### 4.10 Settings Repository
- **المسؤوليات:** *ليست بيانات كيان عادي* — هذا Repository استثنائي: يدير **إعدادات الاتصال** (`apiUrl`, `driveUrl`, `sheetUrl`) وليس مصفوفة سجلات.
- **البيانات المُدارة:** مفاتيح `localStorage` المفردة: `apiUrl`, `driveUrl`, `sheetUrl` (وليس `data.*`).
- **العلاقات:** لا علاقات بيانات — لكنه **Dependency** لكل الـ Repositories الأخرى (يزوّدها بـ `API_URL` اللازم لسياسة المزامنة، القسم 12).
- **الفهارس المطلوبة:** لا يوجد (سجل مفرد Singleton، ليس مجموعة).
- **نوع البحث:** لا ينطبق.
- **نوع العمليات:** `get()`/`update()` فقط من الـ Contract الموحّد؛ باقي العمليات (`bulkInsert`, `search`, إلخ) تُرجع `UnsupportedOperationError`. عمليات متخصصة: `testConnection()`, `pingConnection()`, `exportAllData()` (تصدير شامل يجمع كل الـ Repositories الأخرى — الاستثناء الوحيد الموثّق في القسم 12 حيث Repository "ينسّق" لا "يستدعي" باقي الـ Repositories عبر طبقة تنسيق منفصلة).

### 4.11 Calendar Repository
- **المسؤوليات:** *ليس كياناً بيانات خاصاً به إطلاقاً* — Calendar هو **عرض مشتق (Derived View)** فوق `Sessions Repository` (فلترة بنطاق شهر/يوم) + حالة UI محلية (`calYear`, `calMonth`, `calSelectedDay`).
- **البيانات المُدارة:** لا يملك بيانات خاصة. يُعرَّف كـ Repository شكلاً (للالتزام بالـ Contract الموحّد) لكنه فعلياً **Query Adapter** فوق `Sessions.search({dateRange})`.
- **العلاقات:** يعتمد كلياً على Sessions Repository (اعتماد للقراءة فقط).
- **الفهارس المطلوبة:** لا يملك فهارس خاصة — يستخدم فهرس `التاريخ` الموجود أصلاً في Sessions.
- **نوع البحث:** Date Range حصراً (شهر معيّن → أيام → جلسات اليوم المحدد `renderCalSessions`).
- **نوع العمليات:** `search()` فقط من الـ Contract؛ كل عمليات الكتابة (`create`/`update`/`delete`) تُرجع `UnsupportedOperationError` — الكتابة الفعلية تمر عبر Sessions Repository مباشرة.

### 4.12 Dashboard Repository
- **المسؤوليات:** *ليس كياناً بيانات أيضاً* — طبقة **Aggregation** للقراءة فقط، تجمع عدادات وتنبيهات (badges) من عدة Repositories (Cases القادمة، Sessions القادمة، Tasks المستحقة).
- **البيانات المُدارة:** لا يملك بيانات.
- **العلاقات:** يعتمد على Cases + Sessions + Tasks (قراءة فقط، عبر طبقة تنسيق — القسم 12).
- **الفهارس المطلوبة:** لا يوجد.
- **نوع البحث:** لا ينطبق — عمليات تجميع مباشرة (`count`, `aggregate`) عبر الـ Contract.
- **نوع العمليات:** `count()`/`search()` فقط من الـ Contract؛ كل الكتابة تُرجع `UnsupportedOperationError`.

---

## 5. Shared Operations

عمليات مشتركة تُطبَّق **بنفس المنطق** عبر كل الـ Repositories التسع الحقيقية (Cases, Clients, Children, Sessions, Fees, Tasks, Documents, Library, Templates):

- `create` / `update` / `delete` — نفس تدفق: Validate → Write Local (sync) → Persist `localStorage` (sync) → Schedule Remote Sync (async, best-effort حسب `syncPolicy`).
- `get` / `getAll` / `find` / `exists` / `count` — قراءة صرفة من النسخة المحلية في الذاكرة، بدون أي استدعاء شبكة أبداً (حتى لو `API_URL` معرَّفاً).
- `export` / `import` / `clear` — تُستخدم حصراً من مسار Settings (`exportData`, `handleImport`, `clearAllData`) — منطق موحّد: لا Validation صارم عند `import` (البيانات القادمة من نسخة احتياطية موثوقة أصلاً)، لكن `create`/`update` العاديين يفرضان Validation كاملاً.
- `bulkInsert` — تُستخدم من `loadFromSheets`/`ApiService.loadAllSheets` عند التحميل الأولي من الخلفية — منطق موحّد: استبدال كامل للمصفوفة (`replace mode`) وليس دمجاً افتراضياً، لأن هذا هو السلوك الحالي الموثّق في `loadFromSheets`.

## 6. Specialized Operations (لكل Repository)

| Repository | عملية خاصة | السبب |
|---|---|---|
| Clients | `generatePortalToken(id)` / `revokePortalToken(id)` | توليد/إلغاء رمز بوابة الموكل — منطق لا ينطبق على أي كيان آخر. |
| Tasks | `toggleStatus(id)` | تعديل جزئي على حقل واحد (`الحالة`) — تحسين أداء يتجنّب إرسال السجل الكامل. |
| Sessions | `normalizeTime(record)` | تطبيع حقل `الوقت` (منقول من منطق `sanitizeTime` الحالي في `DOMContentLoaded`) — يُطبَّق تلقائياً داخل `create`/`update`، وأيضاً كعملية Migration لمرة واحدة عند أول تحميل (يوازي السلوك الحالي). |
| Cases | `getChildrenSummary(caseId)` | قراءة مجمّعة لحقل `أطفال_القضية` المضمّن + سجلات Children Repository المرتبطة — لحل تكرار البيانات الموثّق (القسم 15)، دون حسم القرار المعماري نهائياً في هذه المرحلة. |
| Settings | `testConnection(url)`, `pingConnection()`, `exportAllData()` | إدارة اتصال، وليست عمليات على مجموعة بيانات. |
| Calendar | `getMonthView(year, month)`, `getDaySessions(date)` | Query Adapters متخصصة فوق Sessions. |
| Dashboard | `getBadgeCounts()`, `getUpcoming(limit)` | Aggregation queries متخصصة عبر Cases/Sessions/Tasks. |

---

## 7. Query Model

نموذج استعلام موحّد (بدون تنفيذ) يُستخدَم في `search()`/`count()` عبر كل Repository:

- **Filter:** شروط مساواة/نطاق على حقول محددة (مثال منطقي: `{الحالة: 'منظورة'}`) — تُطبَّق بشكل AND افتراضياً.
- **Compound Filters:** دمج عدة `Filter` بـ AND/OR صريح — مطلوب لصفحات مثل Cases (فلترة حالة + بحث نصي في آن واحد).
- **Sort:** ترتيب حسب حقل واحد أو أكثر، اتجاه تصاعدي/تنازلي — الافتراضي غير موحّد حالياً بين الصفحات (كل `render*()` يفرز بمنطقه الخاص) → يجب أن يصبح `sortSpec` صريحاً يمرره الـ Module بدل فرز ضمني داخل دالة العرض.
- **Paging:** `offset`/`limit` — **غير مستخدَم حالياً في أي مكان بالكود** (كل الصفحات تعرض القائمة كاملة) لكنه جزء إلزامي من الـ Contract تحسباً للنمو المستقبلي (القسم 14 — الأداء).
- **Search (نصي):** بحث جزئي غير حساس لحالة الأحرف عبر حقل واحد أو أكثر معرَّف مسبقاً لكل Repository (مثال: Cases تبحث في اسم الموكل + الخصم + رقم القضية معاً).
- **Full Text Search:** غير مطلوب حالياً بمستوى المشروع (لا فهرسة نصية معقّدة في الكود الحالي) — الـ Contract يحجز له مكاناً منطقياً (`fullTextQuery`) دون التزام بتنفيذه الآن.
- **Date Range:** فلترة `من/إلى` على حقل تاريخ محدد — أساسي لـ Sessions/Calendar/Fees/Tasks.
- **Projection:** إرجاع حقول محددة فقط بدل السجل الكامل — مفيد لقوائم `populateCaseDropdown` (تحتاج `رقم_القضية` + `عنوان_القضية` فقط) بدل تحميل 35 حقلاً كاملة لكل خيار.
- **Aggregation:** عمليات تجميع (count/sum/group by) — تُستخدم حصراً من Dashboard/Calendar Repositories.

`QueryResult` (منطقياً): `{ items: Entity[], total: number, hasMore: boolean }`.

---

## 8. Transaction Model

- **Single Operation:** العملية الافتراضية (`create`/`update`/`delete` مفردة) — ذرّية محلياً (تُطبَّق بالكامل أو لا تُطبَّق إطلاقاً على النسخة في الذاكرة)، وغير ذرّية عبر الشبكة (المزامنة قد تفشل بعد نجاح الجزء المحلي — هذا سلوك مقصود ومطابق للسلوك الحالي: العملية المحلية لا تنتظر ولا تتراجع بسبب فشل الشبكة).
- **Multi Operation (`transaction(ops[])`):** تنفيذ عدة عمليات كـ "وحدة منطقية" على **نفس الـ Repository** فقط (لا معاملات عابرة للـ Repositories في هذه المرحلة — قيد صريح، القسم 12). مثال حقيقي يبرر الحاجة: عملية "حذف قضية" يجب أن تُنشئ لاحقاً (خارج نطاق هذا الـ Repository نفسه) حذفاً متتالياً لسجلات Sessions/Documents/Tasks/Fees/Children المرتبطة — هذا **تنسيق بين Repositories متعددة** وليس Transaction داخل Repository واحد؛ يقع في طبقة تنسيق أعلى (القسم 12)، وليس ضمن `transaction()` الخاص بأي Repository بمفرده.
- **Commit:** تثبيت التغييرات في النسخة الداخلية + `localStorage` معاً كخطوة واحدة غير قابلة للتقسيم.
- **Rollback:** عند فشل أي عملية ضمن `ops[]` (مثلاً فشل Validation في العملية الثالثة من خمس)، تُلغى كل العمليات السابقة في نفس الـ `transaction()` قبل الـ Commit — لا حالة وسيطة تُكتب أبداً في `localStorage`.
- **Atomic Operations:** الذرّية مضمونة فقط على مستوى الذاكرة/`localStorage` المحلي (بيئة تنفيذ واحدة synchronous)، وليست مضمونة عبر الشبكة (لا two-phase commit مع Google Sheets — هذا يتجاوز حدود offline-first المعقولة لتطبيق بحجم المشروع الحالي).
- **Conflict Resolution:** لا يوجد مصدر تعارض حقيقي متعدد الأجهزة في المعمارية الحالية (مستخدم واحد، جلسة واحدة نشطة). عند إعادة تحميل من Sheets (`loadFromSheets`) بعد تعديل محلي غير مُزامَن بعد: **Local-Wins** هو السلوك الحالي الفعلي (لا الكود الحالي يفحص تعارضاً إطلاقاً) — يُوثَّق كسلوك صريح للـ Repository الآن بدل أن يبقى ضمنياً.

---

## 9. Validation Model

- **Required Fields:** لكل Repository قائمة حقول إلزامية مشتقة من `FIELDS.<entity>` الفعلية — Repository يرفض `create`/`update` إن غاب أي حقل إلزامي، **قبل** أي كتابة محلية.
- **Unique Keys:** `رقم_القضية` في Cases يجب أن يُفرض كمفتاح فريد منطقياً على مستوى الـ Repository — هذه فرضية جديدة **غير موجودة في الكود الحالي إطلاقاً** (لا فحص تكرار عند حفظ قضية اليوم) ويجب توثيقها كتحسين أمان بيانات مطلوب في المرحلة القادمة (وليس تنفيذاً في هذه المرحلة).
- **Foreign Keys (منطقية لا قاعدة بيانات فعلية):** `رقم_القضية` في Sessions/Documents/Tasks/Fees/Children — Repository يتحقق (عبر تنسيق خارجي وليس استدعاء مباشر لـ Cases Repository، القسم 12) من وجود القضية المشار إليها قبل الحفظ، ويُرجع تحذيراً وليس رفضاً صارماً (لأن الكود الحالي يسمح فعلياً بإدخال `رقم_القضية` حر النص في `populateCaseDropdown` بدون فرض صارم — الحفاظ على التوافق الخلفي أولوية، مبدأ رقم 9).
- **Business Rules:** مثال حقيقي من الكود الحالي: `sanitizeTime()` على حقل الوقت في Sessions يجب أن يُطبَّق كقاعدة عمل ضمن Validation قبل الحفظ (وليس بعد التحميل فقط كما هو حالياً).
- **Data Integrity:** كل Repository يضمن أن كل سجل يحتوي بنية الحقول المتوقعة (لا حقول ناقصة تتسبب في كسر لاحق في `MAP`/`FIELDS`) — عبر تطبيق قيم افتراضية فارغة للحقول غير المُدخلة، مطابقاً للسلوك الحالي لـ `collectForm`.

---

## 10. Error Model

| نوع الخطأ | مثال حقيقي من السياق | من يرفعه |
|---|---|---|
| `ValidationError` | حقل إلزامي غائب، `رقم_القضية` مكرر | Repository، قبل أي كتابة |
| `StorageError` | فشل `localStorage.setItem` (نادر — امتلاء التخزين) | Repository، أثناء الكتابة المحلية |
| `ConflictError` | تعارض نظري عند استيراد بيانات (القسم 8) | Repository، أثناء `import`/`bulkUpdate` |
| `SyncError` | فشل `ApiService.saveData`/`updateData`/`deleteData` (شبكة، انقطاع) | Repository، بعد نجاح الكتابة المحلية — **لا يُلغي العملية المحلية أبداً** |
| `PermissionError` | لا يوجد حالياً (لا مصادقة في المشروع) — محجوز للمستقبل | — |
| `NetworkError` | `ApiService.ping`/`setup` بلا استجابة (Timeout) | Settings Repository حصراً |
| `UnsupportedOperationError` | استدعاء `create()` على Dashboard/Calendar Repository | أي Repository لا يدعم عملية من الـ Contract |

كل خطأ يُرجَع بشكل منظّم (لا `throw` خام غير موصوف): `{ type, message, field?, entity?, recoverable: boolean }`. `recoverable=true` لكل أخطاء `SyncError`/`NetworkError` (يمكن إعادة المحاولة لاحقاً)، `false` لأخطاء `ValidationError`.

---

## 11. Repository Lifecycle

`Create → Open → Ready → (Busy ⇄ Ready) → (Transaction → Commit|Rollback → Ready) → Closed → Disposed`

- **Create:** إنشاء نسخة الـ Repository (تُنشأ مرة واحدة لكل كيان عند إقلاع التطبيق).
- **Open:** تحميل البيانات الأولية من `localStorage` إلى الذاكرة (يوازي السطر الحالي `JSON.parse(localStorage.getItem(...))`).
- **Ready:** جاهز لاستقبال أي عملية من الـ Contract.
- **Busy:** أثناء تنفيذ عملية كتابة فعلية (قصيرة جداً محلياً؛ حالة منطقية أكثر منها زمنية فعلية بسبب طبيعة JS أحادي الخيط).
- **Transaction:** حالة مؤقتة أثناء تنفيذ `transaction(ops[])` — تُغلَق كل عمليات الكتابة الأخرى على نفس الـ Repository حتى الانتهاء.
- **Commit / Rollback:** نتيجة الـ Transaction، ثم عودة فورية لـ `Ready`.
- **Closed:** لا يوجد فعلياً في نمط SPA بصفحة واحدة دائمة التشغيل حالياً (لا سيناريو "إغلاق" الـ Repository أثناء الجلسة) — محجوزة للتوافق المستقبلي مع نمط تطبيقات متعددة الصفحات/PWA بعمر جلسة محدود.
- **Disposed:** عند إغلاق التبويب/الصفحة — لا حاجة لتنظيف صريح حالياً لأن `localStorage` هو مصدر البقاء الدائم أصلاً.

---

## 12. العلاقة بين Repository وDatabaseService وSyncService وBackupManager وUI وModules

```
                     ┌───────────────────────┐
                     │   UI / Modules Layer   │   (render*, save*, edit*, delete*,
                     │  (cases.js, clients.js, │    collectForm/fillForm/resetForm,
                     │   ... 12 module files)  │    navigate, toast, closeModal)
                     └───────────┬────────────┘
                                 │  (استدعاء Contract فقط)
                     ┌───────────▼────────────┐
                     │   Repository Layer      │   ← هذا التصميم (12 Repository)
                     │ (Cases, Clients, ...,   │
                     │  Calendar, Dashboard)   │
                     └───┬───────────────┬─────┘
                         │               │
          (قراءة/كتابة محلية)      (مزامنة، best-effort)
                         │               │
              ┌──────────▼───────┐   ┌───▼─────────────┐
              │  DatabaseService  │   │   SyncService    │  ← يستدعي ApiService
              │ (localStorage اليوم│   │ (يغلّف ApiService │     الموجود فعلاً
              │  → IndexedDB لاحقاً)│   │  الحالي: syncRow, │
              └──────────┬───────┘   │  deleteData, ...) │
                         │            └───┬─────────────┘
                         │                │
                         │         ┌──────▼──────┐
                         │         │ Google Apps  │
                         │         │ Script Backend│
                         │         │ (Code_v4.gs)  │
                         │         └─────────────┘
              ┌──────────▼───────┐
              │  BackupManager    │  ← يستهلك export()/import() من كل
              │ (exportData,      │     Repository — لا يكتب مباشرة لأي
              │  handleImport,    │     مصدر تخزين، ينسّق فقط.
              │  clearAllData)    │
              └───────────────────┘

    طبقة تنسيق أعلى من الـ Repositories (Orchestration — غير موضحة كصندوق
    منفصل هنا لأنها خارج نطاق "Repository Design"، لكنها **مطلوبة منطقياً**
    لعمليات تمس أكثر من Repository، مثل: حذف قضية ← حذف كل ما يرتبط بها في
    Sessions/Documents/Tasks/Fees/Children؛ أو Dashboard الذي يقرأ من ثلاث
    Repositories معاً. هذه الطبقة تستدعي عدة Repositories بالتتابع، والـ
    Repositories نفسها لا تستدعي بعضها البعض مباشرة أبداً (مبدأ رقم 7).
```

- **Repository ↔ DatabaseService:** كل Repository يعتمد على `DatabaseService` كطبقة تجريد فوق آلية التخزين الفعلية (`localStorage` اليوم). هذا يحقق شرط "Future SQLite/IndexedDB Support" (القسم 17) دون تغيير أي Repository لاحقاً.
- **Repository ↔ SyncService:** `SyncService` يغلّف `ApiService` الموجود فعلياً بالكامل (`syncRow`, `deleteData`, `loadAllSheets`) ويضيف فوقه `syncPolicy` لكل كيان (فوري/مؤجَّل/معطَّل حسب الفجوات الموثّقة في القسم 4).
- **Repository ↔ BackupManager:** `BackupManager` يستهلك `export()`/`import()`/`clear()` من كل الـ 9 Repositories الحقيقية بالتتابع — لا يكتب لأي تخزين مباشرة، هو مجرد منسِّق (نفس دور `exportData`/`handleImport`/`clearAllData` الحالي).
- **Repository ↔ UI/Modules:** اتجاه واحد فقط — الـ Module يستدعي الـ Repository، والعكس ممنوع تماماً (Repository لا يستدعي `toast()` ولا أي دالة UI، مبدأ رقم 5).

---

## 13. Call Graph (منطقي، على مستوى Repository لا دوال)

```
UI/Module.save(entity)
   → Repository.create(data) | Repository.update(id, data)
       → Repository.validate(data)                          [محلي]
       → DatabaseService.write(entityKey, allRecords)        [محلي، متزامن]
       → SyncService.push(entityKey, data, syncPolicy)       [بعيد، غير متزامن]
           → ApiService.syncRow(sheetName, data, rowIndex)   [موجود فعلاً]

UI/Module.render()
   → Repository.search(queryModel) | Repository.getAll()
       → DatabaseService.read(entityKey)                     [محلي فقط، أبداً شبكة]

UI/Module (Settings page) → refreshAll()
   → SyncService.pullAll()
       → ApiService.loadAllSheets()                          [موجود فعلاً]
       → لكل entityKey: Repository.import(records, 'replace')

Dashboard Repository.getBadgeCounts()
   → Orchestration.readAcross([Cases, Sessions, Tasks])       [تنسيق، وليس استدعاء Repository↔Repository]

Calendar Repository.getMonthView(year, month)
   → Sessions.search({dateRange: {...}})                      [حالة خاصة: Calendar Repository
                                                                 هو Adapter فوق Sessions فقط،
                                                                 موثَّق كاستثناء صريح في القسم 4.11]
```

---

## 14. Performance Strategy

- **Cache Strategy:** كل Repository يحتفظ بنسخة كاملة في الذاكرة طوال عمر الجلسة (نفس نمط `data.*` الحالي بالضبط) — لا حاجة لـ cache إضافي بحجم البيانات الحالي (تطبيق قانوني فردي/مكتب صغير، ليس نطاقاً ضخماً).
- **Lazy Loading:** غير مطلوب حالياً بحجم البيانات المتوقع، لكن `Query Model` (القسم 7) يحجز `Paging` تحسباً للنمو — يُفعَّل لاحقاً بدون تغيير الـ Contract.
- **Batch Operations:** `bulkInsert`/`bulkUpdate`/`bulkDelete` تُستخدم حصراً لعمليات `import`/`loadFromSheets` — كتابة دفعة واحدة لـ `localStorage` بدل استدعاء `setItem` لكل سجل (تحسين مباشر عن أي تنفيذ ساذج).
- **Indexes:** الفهارس المذكورة في القسم 4 (مثل `رقم_القضية` في Sessions/Documents/Tasks/Fees/Children) تُبنى كـ `Map` داخلية عند `Open` (القسم 11) وتُحدَّث تدريجياً مع كل `create`/`update`/`delete`، لا إعادة بناء كاملة إلا عند `import`.
- **Search Optimization:** البحث النصي الحالي (`renderCases` وغيرها) يمسح المصفوفة كاملة في كل استدعاء — الفهرسة المقترحة تُسرِّع فلاتر المساواة (`رقم_القضية`, `الحالة`) فقط؛ البحث النصي الحر يبقى O(n) لأن بيانات المشروع لا تبرر Full-Text Index حقيقياً بعد.
- **Memory Usage:** حمل معقول جداً (تطبيق مكتب فردي، آلاف السجلات كحد أقصى واقعي) — الاحتفاظ بكل شيء بالذاكرة مقبول ولا يستدعي أي استراتيجية تفريغ (eviction).

---

## 15. Security Strategy

- **Data Validation:** كل مدخل يمر عبر Validation Layer (القسم 9) قبل الوصول لـ `DatabaseService` — يمنع كتابة سجلات ناقصة تكسر `MAP`/`FIELDS` لاحقاً.
- **Injection:** لا استعلامات SQL في المعمارية الحالية (لا خطر SQL Injection مباشر)، لكن `رابط_Drive` وحقول نصية أخرى تُعرَض لاحقاً في HTML عبر `render*()` — تعقيم (sanitization) مخرجات العرض يبقى مسؤولية طبقة UI، لكن Repository يجب ألا "يثق" ضمنياً بأن كل نص مُدخل آمن للعرض المباشر؛ هذا يُوثَّق كملاحظة تسليم بين الطبقتين.
- **Tampering:** لا حماية حالياً ضد تعديل مباشر لـ `localStorage` من console المتصفح (أي مستخدم بصلاحية جهاز الكمبيوتر يمكنه تعديل البيانات مباشرة) — هذه حقيقة معمارية موروثة من نمط offline-first بلا مصادقة، **ليست ثغرة يحلّها الـ Repository Layer** بل تتطلب طبقة مصادقة/تشفير غير موجودة في نطاق هذه المرحلة (القسم 17).
- **Corruption:** كل عملية `DatabaseService.write` يجب أن تتحقق من نجاح التسلسل (`JSON.stringify`) قبل استبدال القيمة القديمة في `localStorage` — لتفادي فقدان بيانات كاملة بسبب خطأ تسلسل جزئي (سيناريو نادر لكن مكلف الأثر).
- **Recovery:** `BackupManager.export()`/`import()` (القسم 12) هو خط الدفاع الوحيد الحالي ضد فقدان البيانات — يجب أن يبقى بلا Validation صارم عند `import` (مبدأ التعافي يجب ألا يُعطَّل بسبب سجل واحد غير صالح ضمن نسخة احتياطية كبيرة).

---

## 16. Migration Contract

كيف تنتقل الـ 12 Module الحالية من التعامل المباشر مع `data[]` إلى استخدام Repository، **دون كسر المشروع**:

**المرحلة أ — إدخال الطبقة دون حذف القديم (Strangler Pattern):**
كل Repository يُهيَّأ عند الإقلاع بحيث `Repository.getAll() === data.<entity>` (نفس المرجع، وليس نسخة، مؤقتاً في هذه المرحلة الانتقالية فقط) — أي كود قديم يقرأ `data.cases` مباشرة يستمر بالعمل دون أي تعديل، بينما أي كود جديد يستخدم `CasesRepository.getAll()` ويحصل على نفس البيانات فعلياً.

**المرحلة ب — تحويل الكتابة أولاً (أعلى خطورة، لذلك أولاً وبحذر):**
دوال `save*()`/`delete*()` في كل Module تُستبدل تدريجياً (Module واحد في كل مرة) لتستدعي `Repository.create/update/delete` بدل التعديل المباشر على `data.<entity>` + استدعاء `saveLocal()` + `ApiService.syncRow()` يدوياً — الـ Repository يبتلع هذا التسلسل الثلاثي كاملاً داخلياً.

**المرحلة ج — تحويل القراءة:**
دوال `render*()` تُستبدل لتستدعي `Repository.search()`/`getAll()` بدل قراءة `data.<entity>` مباشرة.

**المرحلة د — فصل المرجع المشترك:**
بعد اكتمال أ+ب+ج لكل الموديولات الـ 12، يتوقف `Repository.getAll()` عن إرجاع نفس مرجع `data.<entity>` القديم (يُرجع نسخة محمية بدلاً من ذلك) — وعندها فقط يُحذف global `data` القديم نهائياً. هذه آخر خطوة فقط، بعد تأكد أن لا كود متبقٍ يعتمد على المرجع المباشر.

**ترتيب الموديولات المقترح للترحيل** (الأبسط أولاً لتقليل المخاطرة، بناءً على عدد الحقول والعلاقات في القسم 4): Library → Templates → Fees → Documents → Tasks → Clients → Children → Sessions → Cases (الأكثر تعقيداً وعلاقات، أخيراً). Settings/Calendar/Dashboard تُرحَّل بعد كل الكيانات الحقيقية لأنها تعتمد عليها (القسم 12).

---

## 17. Compatibility Report

| المتطلب | كيف يضمنه هذا التصميم |
|---|---|
| **Backward Compatibility** | مبدأ 9 + Migration Contract (القسم 16) بنمط Strangler — لا كسر لأي كود قائم في أي مرحلة انتقالية. |
| **Offline First** | مبدأ 4 — كل كتابة تنجح محلياً أولاً دائماً، والمزامنة `best-effort` غير حاجبة، مطابق تماماً للسلوك الحالي الفعلي في `ApiService`. |
| **Future Cloud Support** | `DatabaseService` (القسم 12) كطبقة تجريد فوق التخزين تسمح باستبدال `localStorage` بمزامنة سحابية حقيقية دون لمس أي Repository. |
| **Future Mobile Support** | الـ Contract (القسم 3) لا يفترض بيئة متصفح — أي منصة تدعم نفس التوقيعات المنطقية (حتى Native) يمكنها استهلاك نفس الـ Repositories. |
| **Future Multi-user Support** | Conflict Resolution (القسم 8) موثَّق حالياً كـ Local-Wins **صراحة كقيد معروف** — أي دعم متعدد المستخدمين مستقبلاً يتطلب استبدال هذه السياسة تحديداً فقط، وهي معزولة داخل `SyncService`/Repository، لا مبعثرة عبر الكود. |
| **Future SQLite Support** | `DatabaseService` نفسه (القسم 12) هو نقطة الاستبدال الوحيدة — Repository لا يفترض `JSON.parse(localStorage...)` في توقيعه، بل في تنفيذه الداخلي فقط. |
| **Future REST API Support** | `SyncService` معزول عن `ApiService` الحالي بواجهة، فاستبدال Google Apps Script بـ REST API حقيقي يمس `SyncService` فقط. |

**بدون إعادة كتابة النظام:** كل الضمانات أعلاه محققة لأن التصميم بأكمله Additive (طبقة تُضاف فوق `data[]`/`localStorage`/`ApiService` الحالية دون حذفها في المرحلة الأولى)، وليس Replacement فورياً.

---

## 18. Implementation Roadmap (تخطيط فقط — لا تنفيذ في هذه المرحلة)

1. تصميم `DatabaseService` (المرحلة التالية المعلَّقة عليها هذا التقرير — القسم 20).
2. تصميم `SyncService` كغلاف فوق `ApiService` الحالي + `syncPolicy` صريحة لكل كيان.
3. تنفيذ Repository الأبسط أولاً (Library) كـ Proof of Concept، اختباره كاملاً بمعزل عن باقي المشروع.
4. اتباع ترتيب الترحيل الموثّق في القسم 16 لباقي الـ 8 Repositories الحقيقية.
5. تصميم Repositories المشتقة (Settings, Calendar, Dashboard) بعد استقرار الـ 9 الحقيقية فقط، لأنها تعتمد عليها.
6. حسم القرارات السياسية المفتوحة (مزامنة حذف Children/Documents/Tasks/Fees) كخطوة `syncPolicy` تهيئة، وليس تعديل بنية.
7. تفعيل المرحلة د من الترحيل (فصل المرجع المشترك، حذف `data` القديم).

---

## 19. Repository Standards

- كل Repository يلتزم حرفياً بأسماء عمليات الـ Contract (القسم 3) — لا مرادفات (`fetch` بدل `get`, إلخ) لضمان قابلية التنبؤ عبر الـ 12 Repository.
- كل Repository يوثّق `syncPolicy` الخاصة به صراحة (immediate / deferred / disabled / local-only-by-design) كجزء من تعريفه، وليس كتعليق متفرق.
- كل خطأ يُرجَع بالبنية الموحّدة في القسم 10 — لا `throw` نصوص حرة.
- كل Repository يُغلَّف بحيث لا يُصدِّر (export) أي حالة داخلية قابلة للتعديل من الخارج مباشرة (`getAll()` يُرجع نسخة، لا مرجعاً حياً — باستثناء المرحلة الانتقالية أ في القسم 16 فقط).
- التسمية: كل Repository يُسمَّى `<Entity>Repository` (مثال: `CasesRepository`) لضمان اتساق مع أسماء `data.<entity>` الحالية حرفياً.

---

## 20. Ready For DatabaseService Design

كل ما سبق تصميم فقط: لا كود، لا ملفات جديدة داخل المشروع، لا تعديل على أي ملف من `Master_v9.zip`، ولا حسم لأي قرار سياسي مفتوح (Children/Documents/Tasks/Fees sync gaps) — هذه القرارات تبقى صريحة داخل `syncPolicy` لكل Repository إلى أن تُحسم في مرحلة لاحقة.

---

# Repository Contract Review

**PASS**

**Ready For DatabaseService Design**
