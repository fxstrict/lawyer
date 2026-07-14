# Data Schema Specification Report
## نظام الحسام للمحاماة — PHASE 4: Data Schema Specification
### V10 — Offline First Architecture

---

## 1. Executive Summary

هذا التقرير يحدد Schema كاملة لكل Object Store من الـ 15 المصمَّمة في `DatabaseService_Design_Report.md` (9 كيانات حقيقية + Settings + Calendar + 4 Stores بنيوية)، اعتماداً **حصراً** على الحقول الفعلية الموجودة اليوم في الكود (`FIELDS`/`MAP` في `index.html`، أسطر 625-664) — لا حقل واحد مُخترَع أو مُضاف لم يكن موجوداً أصلاً في النموذج الحالي. أهم اكتشاف واقعي أثّر على هذا التصميم: **لا يوجد أي حقل `required` في HTML اليوم** (تحقُّق مباشر: صفر نتائج بحث)، أي أن كل الحقول اختيارية فعلياً على مستوى الواجهة الحالية — لذلك قوائم "Required Fields" أدناه هي **قاعدة جديدة مقترَحة** على مستوى Schema (الحد الأدنى الوظيفي: المفتاح الأساسي فقط في الغالبية)، وليست توثيقاً لسلوك قائم، وهذا موضَّح صراحة عند كل Store.

كذلك تم التحقق من: نمط توليد المعرِّفات الفعلي (`uid()` = طابع زمني base36 + عشوائي base36 — نمط Hybrid، ليس UUID ولا Increment خالصاً)، وأن الحقول "المنطقية" (Boolean) مثل `وجود_أطفال`/`وجود_قائمة_منقولات` مخزَّنة فعلياً كنص عربي ثلاثي الحالة (`'نعم'`/`'لا'`/فارغ) عبر `<select>` وليست Boolean حقيقي.

---

## 2. Input Gap

| المرجع المطلوب | الحالة |
|---|---|
| `Master_v10_Base.zip` | **غير موجود** (لم يُرفَع في أي رسالة حتى الآن) — الاعتماد على `Master_v9.zip` المفحوص في PHASE 2، لا تغيير. |
| `DatabaseService_Design_Report.md` | **غير مرفوع كملف مستقل بهذا الاسم بالضبط** — يُعتمَد المحتوى المُنتَج فعلياً في هذه الجلسة (`DatabaseService_Design_Report_PHASE3_V10.md`) كمصدره. |
| `Repository_Contract_Report.md` | نفس الحالة — يُعتمَد `Repository_Contract_Report_PHASE2_V10.md` المُنتَج سابقاً في هذه الجلسة. |
| `PROJECT_STATE.md` / `PROJECT_HISTORY.md` / `PROJECT_MAP.md` / `NEXT_PHASE.md` | ✅ موجودة من PHASE 2، لا تغيير. |
| **حقول `required` في الكود الفعلي** | **غير موجودة إطلاقاً** (`grep -n "required" index.html` = صفر نتائج) — هذه حقيقة مؤكَّدة وليست فجوة إدخال، لكنها تُغيّر جوهرياً معنى "Required Fields" في هذا التقرير كما هو موضَّح في القسم 1. |

---

## 3. Naming Standards

### 3.1 Naming Convention العامة
- **أسماء Stores:** بالإنجليزية، PascalCase مفرد أو جمع حسب المعنى الطبيعي، مطابقة تماماً لأسماء `data.*` الحالية بصيغتها (`cases`, `sessions`, ...) لضمان تتبع مباشر بلا حاجة لخريطة تسمية إضافية.
- **أسماء الحقول (Field Keys) المخزَّنة فعلياً:** **تبقى بالعربية حرفياً** كما هي اليوم في `MAP` (مثل `رقم_القضية`, `تاريخ_الجلسة_القادمة`) — هذا قرار توافق خلفي إلزامي (Backward Compatibility، مبدأ 9 من `Repository_Contract_Report.md`)؛ إعادة تسمية الحقول العربية إلى إنجليزية تُعتبَر "تغيير أسماء" وهو ممنوع صراحة في تعليمات كل مرحلة حتى الآن.
- **أسماء حقول الواجهة (Form IDs):** تبقى بصيغة `f<Entity><Field>` بالإنجليزية (مثل `fCaseNum`) كما هي اليوم في `FIELDS` — هذه طبقة UI منفصلة تماماً عن Schema التخزين، ولا علاقة مباشرة بينها وبين تسمية الحقول المخزَّنة (الربط عبر `MAP` فقط، كما هو حالياً بالضبط).
- **أسماء الحقول البنيوية الجديدة** (غير موجودة في المشروع اليوم: `id`, `createdAt`, `updatedAt`, `deletedAt`, `version`, `syncVersion`, `checksum` — القسم 8/9) تُسمَّى بالإنجليزية camelCase حصراً، لتمييزها بوضوح كحقول Schema بنيوية وليست بيانات عمل قانونية عربية — تمييز بصري فوري بين نوعي الحقول عند القراءة.

### 3.2 أنواع الـ IDs

| النوع | يُستخدَم في | التبرير |
|---|---|---|
| **Hybrid (الافتراضي لكل السجلات الجديدة في كل Store حقيقي)** | Cases, Clients, Children, Sessions, Fees, Tasks, Documents, Library, Templates | يطابق تماماً `uid()` الموجودة فعلياً اليوم في `js/ui-utils.js` (طابع زمني `Date.now().toString(36)` + عشوائي `Math.random().toString(36).slice(2,6)`) — **لا يتغيّر**، فقط يُعتمَد رسمياً كـ Primary Key الفعلي لكل Store لا يملك مفتاحاً طبيعياً (كل الكيانات باستثناء Cases). ميزة Hybrid هنا: قابل للترتيب الزمني تقريبياً (البادئة زمنية) + احتمال تصادم شبه معدوم لعمليات إدخال فردية من مستخدم واحد. |
| **Natural Key (استثناء وحيد)** | Cases فقط | `رقم_القضية` — مُدخَل يدوياً من طرف المستخدم (المهندس القانوني) وله معنى عملي خارج النظام (رقم القضية الرسمي بالمحكمة) — لا يجوز توليده تلقائياً، لكن **يُفرَض كـ Unique Constraint** لأول مرة في هذا التصميم (لم يكن مفروضاً في الكود سابقاً، القسم 6). |
| **Increment** | **لا يُستخدَم في أي Store** | لا مبرر له في بيئة single-user offline-first بلا خادم مركزي يضمن تسلسلاً — يتعارض مع طبيعة Hybrid المعتمدة أصلاً وموجودة فعلياً في الكود. |
| **UUID (v4 كامل)** | **لا يُستخدَم حالياً، محجوز فقط لـ Future Multi-user** | تكلفة إضافية (طول، تعقيد قراءة) بلا فائدة حقيقية في بيئة مستخدم واحد؛ إن استلزم دعم متعدد المستخدمين مستقبلاً فعلاً (كما وُثِّق كقيد صريح سابقاً)، عندها فقط يصبح UUID v4 ضرورياً لضمان عدم تصادم معرِّفات بين أجهزة مختلفة — قرار مؤجَّل بالكامل. |

### 3.3 قواعد Date Storage
- كل حقل تاريخ يُخزَّن كنص **ISO 8601 بصيغة `YYYY-MM-DD`** حصراً (بدون وقت) — يطابق تماماً ما تتوقعه فعلياً `parseLocalDate()` الموجودة في `js/ui-utils.js` (النمط الأول الذي تتحقق منه الدالة: `/^(\d{4})-(\d{1,2})-(\d{1,2})/`).
- حقل `الوقت` في Sessions تحديداً (مستقل عن التاريخ) يُخزَّن كنص `HH:MM` (24 ساعة) — يطابق `sanitizeTime()` الموجودة فعلياً.
- حقول الطابع الزمني البنيوية الجديدة (`createdAt`, `updatedAt`, `deletedAt` — القسم 3.1/9) تُخزَّن كنص ISO 8601 **كامل مع الوقت** (`YYYY-MM-DDTHH:mm:ss.sssZ`) لأنها لأغراض تقنية دقيقة (ترتيب، تدقيق) لا عرض للمستخدم مباشرة، خلافاً لحقول التاريخ القانونية أعلاه المعروضة للمستخدم بصيغة مبسطة.

### 3.4 قواعد Boolean Storage
- **الواقع الحالي المؤكَّد:** لا يوجد Boolean حقيقي (`true`/`false`) في أي مكان بالمخطط الحالي. الحقلان الوحيدان بمعنى منطقي (`وجود_قائمة_منقولات`, `وجود_أطفال` في Cases) مخزَّنان كنص عربي ثلاثي الحالة عبر `<select>`: `'نعم'` | `'لا'` | `''` (فارغ = لم يُحدَّد بعد، وليس `false`).
- **القاعدة المعتمَدة في هذا التصميم:** الإبقاء على نفس النمط الثلاثي النصي حرفياً (توافق خلفي إلزامي — لا كسر) — **وليس** التحويل إلى Boolean حقيقي، لأن الفارغ `''` له معنى مختلف عن `'لا'` (عدم تحديد مقابل نفي صريح)، وBoolean حقيقي بقيمتين فقط يفقد هذا التمييز الثلاثي المهم قانونياً (مثال: "هل يوجد قائمة منقولات" — الفراغ يعني "لم يُسأل السؤال بعد"، وليس "لا يوجد").

### 3.5 قواعد Enum Storage
- كل حقل تعداد (Enum) يُخزَّن كنص عربي **حرفي مطابق تماماً** لقيم `<option>` الموجودة فعلياً في النموذج الحالي (مثال: `الحالة` في Cases تُخزَّن كأحد النصوص الفعلية المستخدَمة اليوم مثل `'نشطة'`, `'منتهية'`, `'معلقة'`, `'مُحالة'`, `'مُرجأة'`, `'قادمة'` — مستخرجة من `statusBadge()` في `js/ui-utils.js`) — **لا تحويل لأكواد رقمية أو إنجليزية** في طبقة التخزين (يكسر التوافق مع Google Sheets المقروءة/المكتوبة بنفس النص العربي مباشرة اليوم).
- التعيين البصري (Badge classes: `active`/`closed`/`pending`/`info`) يبقى **طبقة عرض فقط** (كما هو حالياً في `statusBadge()`)، لا يُخزَّن أبداً كجزء من السجل نفسه.
- قائمة القيم المسموحة لكل حقل Enum (Validation Rule) تُشتَق من قيم `<option>` الفعلية الموجودة في `index.html` وليست قائمة مُخترَعة جديدة — أي قيمة عربية مغايرة تُقبَل حالياً بلا رفض (لا `required`/`pattern` على `<select>` اليوم) لكن Schema هذه المرحلة تُوصي **مستقبلاً** (وليس فرضاً فورياً كاسراً) بتقييدها لقيم `<option>` المعروفة فقط.

### 3.6 قواعد Null Handling
- **الفراغ النصي `''` هو التمثيل الوحيد لـ "غير محدَّد" في كل الحقول العربية اليوم** (لا `null` حقيقي يُستخدَم إطلاقاً في `data.*` الحالية — كل الحقول الفارغة هي سلسلة نصية فارغة، متسقة مع كون Google Sheets لا تفرّق بين خلية فارغة و`null`). هذا النمط **يبقى كما هو** لكل الحقول العربية القديمة.
- الحقول البنيوية الجديدة (`deletedAt`, إلخ) **تستخدم `null` الحقيقي (وليس نص فارغ)** للتفريق الصريح بين "لم يُحذَف بعد" (`null`) و"قيمة فارغة عن قصد" — لأنها حقول تقنية جديدة بلا قيد توافق خلفي يمنع استخدام `null` الحقيقي فيها.

### 3.7 قواعد Soft Delete
- **لا يوجد Soft Delete في الكود الحالي إطلاقاً** لأي كيان — كل عمليات `delete*()` الحالية تحذف السجل نهائياً من `data.*` ومن `localStorage` فوراً (Hard Delete صرف).
- **هذا التصميم يُقدِّم Soft Delete كقاعدة جديدة اختيارية عبر حقل `deletedAt`** (القسم 3.6) لكل Store حقيقي فقط — سجل بـ `deletedAt != null` يُعامَل كمحذوف منطقياً من كل عمليات `search()`/`getAll()` الافتراضية (تُستثنى تلقائياً)، لكنه **يبقى فعلياً في محرك التخزين** حتى Hard Delete صريح لاحق (يُنفَّذ فقط عبر عملية تنظيف دورية منفصلة، غير موجودة اليوم، ومحجوزة لمرحلة تنفيذ لاحقة).
- **هذا حل مباشر لفجوة موروثة موثَّقة مسبقاً:** حذف Children/Documents/Tasks/Fees لا يُزامَن اليوم (`local-only` عند الحذف) — Soft Delete يجعل "الحذف بانتظار المزامنة" حالة صريحة وقابلة للاستعلام (`deletedAt != null AND syncedAt == null`) بدل أن يكون الحذف عملية فورية غير قابلة للتراجع أو إعادة المحاولة.

### 3.8 قواعد Versioning (على مستوى السجل الواحد)
- كل سجل يحمل حقل `version` رقمي يبدأ من `1` عند الإنشاء ويزيد بمقدار `1` عند كل `update()` ناجح — يخدم غرضين: (1) اكتشاف تعارض تحرير متزامن نظري (Optimistic Concurrency)، (2) تتبع عدد مرات تعديل السجل لأغراض تدقيقية. لا وجود لهذا المفهوم في الكود الحالي إطلاقاً — إضافة صرفة (Additive).

### 3.9 قواعد Metadata (على مستوى السجل الواحد، وليس Metadata Store)
- كل سجل (باستثناء الـ Stores البنيوية الأربعة) يحمل كتلة Metadata ثابتة الشكل: `{createdAt, updatedAt, deletedAt, version, syncVersion, checksum}` بجانب حقول العمل القانونية العربية — لا تختلط أبداً بصرياً أو بنيوياً مع الحقول العربية (تسمية إنجليزية صريحة، القسم 3.1).

### 3.10 قواعد Audit Fields

| الحقل | النوع | الغرض |
|---|---|---|
| `createdAt` | ISO datetime | لحظة إنشاء السجل لأول مرة — لا تتغيّر أبداً بعد الإنشاء. |
| `updatedAt` | ISO datetime | لحظة آخر تعديل ناجح — تُحدَّث في كل `update()`. |
| `deletedAt` | ISO datetime أو `null` | لحظة الحذف المنطقي (Soft Delete، القسم 3.7) — `null` يعني سجل حي. |
| `version` | رقم صحيح | عدّاد تعديلات السجل (القسم 3.8). |
| `syncVersion` | رقم صحيح أو `null` | آخر قيمة `version` تم تأكيد مزامنتها بنجاح مع Google Sheets — الفرق بين `version` و`syncVersion` يكشف فوراً أي سجل "معلَّق مزامنة" بلا حاجة لفحص SyncQueue Store كاملة. |
| `checksum` | نص (hash قصير) | بصمة محتوى السجل (حساب خفيف، مثل مجموع تحقق بسيط على تسلسل الحقول) — تُستخدَم في Integrity Check (موثَّق في `DatabaseService_Design_Report.md` القسم 14) لاكتشاف تلف/تعديل غير متوقَّع للسجل دون الحاجة لمقارنة كل حقل يدوياً. |

---

## 4. Store Specifications

لكل Store: الغرض، Primary Key، Indexes، Unique/Foreign، الحقول الفعلية (Required/Optional/Nullable حسب القسم 1)، Validation، Default، Search/Sort/Filter، Relationship/Delete/Cascade Rules، Backup/Sync Priority، الحجم المتوقَّع.

> **ملاحظة عامة تنطبق على كل Store حقيقي (9 كيانات):** أعمدة "Required Fields" أدناه هي الحد الأدنى الوظيفي المقترَح لأول مرة في هذا التصميم (المفتاح الأساسي + الحقل الذي يعطي السجل معنى أساسياً، مثل الاسم)، **وليست انعكاساً لقيد موجود بالكود الحالي** (القسم 1) — أي حقل غير مذكور صراحة كـ Required هو Optional، ويُقبَل فارغاً `''` كما يحدث فعلياً اليوم دون أي رفض.

### 4.1 Cases

| الخاصية | القيمة |
|---|---|
| **الغرض** | السجل المركزي لكل قضية قانونية — أكبر Store من حيث عدد الحقول (34 حقل عمل + 6 حقول Audit). |
| **Primary Key** | `رقم_القضية` (Natural Key — القسم 3.2) |
| **Indexes** | `الحالة`, `تاريخ_الجلسة_القادمة`, `تاريخ_القيد` |
| **Composite Indexes** | `(الحالة + تاريخ_الجلسة_القادمة)` — استعلام "القضايا المنظورة القادمة" لـ Dashboard |
| **Unique Indexes** | `رقم_القضية` (المفتاح الأساسي نفسه — إلزام جديد، القسم 3.2) |
| **Foreign References** | لا يشير لأي Store آخر (هو المُشار إليه من الجميع) |
| **Required Fields** | `رقم_القضية`, `عنوان_القضية` |
| **Optional Fields** | باقي الـ 32 حقلاً (`رقم_الدعوى`, `نوع_الدعوى`, `المحكمة`, `نوع_الموكل`, `اسم_الموكل`, `رقم_قومي_الموكل`, `هاتف_الموكل`, `عنوان_الموكل`, `عمل_الموكل`, `جهة_عمل_الموكل`, `اسم_الخصم`, `رقم_قومي_الخصم`, `هاتف_الخصم`, `عنوان_الخصم`, `عمل_الخصم`, `جهة_عمل_الخصم`, `الحالة`, `تاريخ_القيد`, `تاريخ_الجلسة_القادمة`, `أتعاب_المحاماة`, `تاريخ_عقد_الزواج`, `رقم_وثيقة_الزواج`, `مكتب_التوثيق`, `وجود_قائمة_منقولات`, `وجود_أطفال`, `الطلبات_القانونية`, `الدفوع_القانونية`, `إجراءات_الدعوى`, `قرارات_المحكمة`, `تاريخ_الحكم`, `رقم_التنفيذ`, `إجراءات_التنفيذ`, `الملاحظات`) |
| **Nullable Fields** | كل الحقول الاختيارية أعلاه تقبل `''` (فارغ نصي، وليس `null` — القسم 3.6) |
| **Validation Rules** | `رقم_القضية` فريد إلزامياً (جديد). `تاريخ_القيد`/`تاريخ_الجلسة_القادمة`/`تاريخ_عقد_الزواج`/`تاريخ_الحكم` بصيغة ISO Date (القسم 3.3) إن وُجدت. `الحالة`/`وجود_قائمة_منقولات`/`وجود_أطفال` تُفضَّل ضمن قيم `<option>` المعروفة (توصية، القسم 3.5). |
| **Default Values** | كل الحقول النصية تبدأ `''`؛ `وجود_قائمة_منقولات`/`وجود_أطفال` تبدأ `''` (غير محدَّد) لا `'لا'` — يطابق `<option value="">—</option>` الفعلية اليوم. |
| **Search Fields** | `اسم_الموكل`, `اسم_الخصم`, `رقم_القضية`, `عنوان_القضية` |
| **Sort Fields** | `تاريخ_الجلسة_القادمة`, `تاريخ_القيد` |
| **Filter Fields** | `الحالة`, `نوع_الدعوى` |
| **Relationship Rules** | يُشار إليه منطقياً (بـ `رقم_القضية`) من Sessions/Documents/Tasks/Fees/Children — لا فرض Foreign Key فعلي (توافق خلفي، كما وُثِّق سابقاً). |
| **Delete Rules** | Soft Delete (القسم 3.7) هو الافتراضي. |
| **Cascade Rules** | **لا Cascade تلقائي** — حذف قضية لا يحذف تلقائياً سجلات Sessions/Documents/Tasks/Fees/Children المرتبطة (قرار صريح: الحذف المتسلسل عملية Atomic Transaction منفصلة تتطلب تأكيداً صريحاً من المستخدم على مستوى UI، وليس سلوكاً ضمنياً خطيراً على مستوى Schema). |
| **Backup Priority** | **حرجة (الأعلى)** — أهم كيان في النظام قانونياً. |
| **Sync Priority** | فوري (Immediate) |
| **Expected Record Count** | مئات إلى بضعة آلاف على مدى سنوات ممارسة فردية واقعية |
| **Storage Growth** | بطيء-متوسط (سجل واحد لكل قضية جديدة، وحجم كل سجل كبير نسبياً بسبب 34 حقلاً نصياً طويلاً أحياناً مثل `الطلبات_القانونية`/`إجراءات_الدعوى`) |

### 4.2 Clients

| الخاصية | القيمة |
|---|---|
| **الغرض** | بيانات الموكلين + دعم بوابة الموكل (QR Portal Token). |
| **Primary Key** | `id` (Hybrid — القسم 3.2؛ لا مفتاح طبيعي فريد مضمون دائماً) |
| **Indexes** | `الاسم`, `الهاتف` |
| **Composite Indexes** | لا يوجد (لا نمط استعلام مزدوج متكرر موثَّق) |
| **Unique Indexes** | لا يوجد إلزامي (الرقم القومي قد يتكرر واقعياً بسبب أخطاء إدخال أو تكرار موكل بأكثر من قضية بنفس البيانات — لا يُفرَض Unique عليه احتراماً لواقع البيانات الحالي) |
| **Foreign References** | لا شيء صريح (الربط بـ Cases عبر الاسم النصي `اسم_الموكل`، وليس معرِّف — فجوة تصميم موروثة موثَّقة سابقاً، لا تُحَل في هذه المرحلة) |
| **Required Fields** | `الاسم` |
| **Optional Fields** | `النوع`, `الرقم_القومي`, `الهاتف`, `البريد`, `العنوان`, `الوظيفة`, `جهة_العمل`, `الحالة_الاجتماعية`, `ملاحظات` |
| **Nullable Fields** | كل الحقول الاختيارية = `''` |
| **Validation Rules** | `الرقم_القومي` إن وُجد يُفضَّل رقمياً بطول قياسي (14 رقماً — الرقم القومي المصري) لكن **لا رفض صارم** (لا `pattern` في الكود الحالي — الحفاظ على المرونة). `البريد` إن وُجد يُفضَّل صيغة بريد صالحة (توصية غير كاسرة). |
| **Default Values** | كل الحقول `''` |
| **Search Fields** | `الاسم`, `الرقم_القومي`, `الهاتف` |
| **Sort Fields** | `الاسم` |
| **Filter Fields** | `النوع` |
| **Relationship Rules** | علاقة نصية غير مفروضة مع Cases/Fees عبر الاسم — لا Foreign Key فعلي. |
| **Delete Rules** | Soft Delete |
| **Cascade Rules** | لا Cascade — حذف موكل لا يمس أي قضية مرتبطة (الربط نصي أصلاً، لا كسر تقني ممكن). |
| **Backup Priority** | عالية |
| **Sync Priority** | فوري |
| **Expected Record Count** | مئات |
| **Storage Growth** | بطيء |

### 4.3 Children

| الخاصية | القيمة |
|---|---|
| **الغرض** | سجلات الأطفال المرتبطين بقضايا الحضانة/النفقة. |
| **Primary Key** | `id` (Hybrid) |
| **Indexes** | `رقم_القضية` |
| **Composite Indexes** | لا يوجد |
| **Unique Indexes** | لا يوجد |
| **Foreign References** | `رقم_القضية` → Cases (منطقي فقط) |
| **Required Fields** | `رقم_القضية`, `الاسم` |
| **Optional Fields** | `تاريخ_الميلاد`, `السن`, `المدرسة`, `محل_الإقامة`, `الحضانة_الحالية`, `النفقة_الحالية`, `ملاحظات` |
| **Nullable Fields** | كل الحقول الاختيارية = `''` |
| **Validation Rules** | `تاريخ_الميلاد` بصيغة ISO Date إن وُجد. |
| **Default Values** | `''` |
| **Search Fields** | لا بحث نصي حر موثَّق حالياً — فلترة فقط |
| **Sort Fields** | `تاريخ_الميلاد` |
| **Filter Fields** | `رقم_القضية` (النمط الوحيد الفعلي الموثَّق) |
| **Relationship Rules** | `رقم_القضية` → Cases منطقياً، **مع تنبيه صريح موروث من التقرير السابق:** لا Sheet مقابل لهذا Store في `Code_v4.gs` حالياً (`SHEET_DEFS` لا يحتوي `الأطفال`) — القرار السياسي لمزامنته لم يُحسم بعد. |
| **Delete Rules** | Soft Delete على مستوى Schema، **لكن `syncPolicy = local-only` فعلياً حتى يُحسَم القرار** (لا فرق عملي عن الحذف الصلب اليوم من ناحية المزامنة، فقط يصبح الحذف المحلي نفسه قابلاً للتراجع منطقياً). |
| **Cascade Rules** | لا Cascade عكسي (حذف قضية لا يحذف أطفالها تلقائياً، كما في Cases 4.1). |
| **Backup Priority** | عالية (بيانات حساسة قانونياً/اجتماعياً) |
| **Sync Priority** | **معطَّل مؤقتاً (Disabled) لعمليات الحذف تحديداً** — Create/Update فقط تُزامَن اليوم (يطابق الفجوة الموثَّقة)؛ Read محلي دائماً بلا شرط. |
| **Expected Record Count** | عشرات إلى مئات |
| **Storage Growth** | بطيء جداً |

### 4.4 Sessions

| الخاصية | القيمة |
|---|---|
| **الغرض** | جلسات المحكمة المرتبطة بالقضايا. |
| **Primary Key** | `id` (Hybrid) |
| **Indexes** | `رقم_القضية`, `التاريخ` |
| **Composite Indexes** | `(رقم_القضية + التاريخ)` — Case timeline وCalendar |
| **Unique Indexes** | لا يوجد |
| **Foreign References** | `رقم_القضية` → Cases |
| **Required Fields** | `رقم_القضية`, `التاريخ` |
| **Optional Fields** | `عنوان_القضية`, `نوع_الدعوى`, `المحكمة`, `الوقت`, `القاضي`, `الحالة`, `ما_تم_في_الجلسة`, `القرار`, `التأجيل_إلى`, `الملاحظات` |
| **Nullable Fields** | كل الحقول الاختيارية = `''` |
| **Validation Rules** | `التاريخ`/`التأجيل_إلى` ISO Date. `الوقت` صيغة `HH:MM` (تُطبَّع تلقائياً عبر قاعدة معادلة لـ `sanitizeTime()` الحالية — منقولة من `DOMContentLoaded` لتصبح Validation Rule رسمية بدل منطق معزول، كما أوصى `Repository_Contract_Report.md` سابقاً). |
| **Default Values** | `''` |
| **Search Fields** | `عنوان_القضية`, `رقم_القضية` |
| **Sort Fields** | `التاريخ` (تصاعدي افتراضياً لعرض القادم أولاً) |
| **Filter Fields** | `رقم_القضية`, `الحالة`, نطاق `التاريخ` (Date Range — أساسي لـ Calendar) |
| **Relationship Rules** | `رقم_القضية` → Cases منطقياً. |
| **Delete Rules** | Soft Delete |
| **Cascade Rules** | لا Cascade |
| **Backup Priority** | عالية |
| **Sync Priority** | فوري |
| **Expected Record Count** | أعلى معدل نمو بين كل الكيانات (كل قضية نشطة تُنتج عدة جلسات على مدى شهور/سنوات) — الأكبر عدداً على الأرجح على المدى الطويل |
| **Storage Growth** | **الأسرع نمواً بين كل الـ Stores الحقيقية** — أهم عامل فعلي وراء خطر Quota الموثَّق في `DatabaseService_Design_Report.md` (القسم 22 هناك) |

### 4.5 Fees

| الخاصية | القيمة |
|---|---|
| **الغرض** | سجلات الأتعاب المالية. |
| **Primary Key** | `id` (Hybrid) |
| **Indexes** | `رقم_القضية`, `تاريخ_الاستلام` |
| **Composite Indexes** | `(رقم_القضية + تاريخ_الاستلام)` |
| **Unique Indexes** | لا يوجد |
| **Foreign References** | `رقم_القضية` → Cases، `اسم_الموكل` → Clients (نصي، غير مفروض) |
| **Required Fields** | `رقم_القضية`, `المبلغ` |
| **Optional Fields** | `اسم_الموكل`, `نوع_الأتعاب`, `تاريخ_الاستلام`, `طريقة_الدفع`, `الملاحظات` |
| **Nullable Fields** | كل الحقول الاختيارية = `''` |
| **Validation Rules** | `المبلغ` رقمي (توصية — لا فرض نوع صارم حالياً في الكود، الحقل نص HTML عادي). `تاريخ_الاستلام` ISO Date. |
| **Default Values** | `''` |
| **Search Fields** | `اسم_الموكل`, `رقم_القضية` |
| **Sort Fields** | `تاريخ_الاستلام` |
| **Filter Fields** | `رقم_القضية`, نطاق `تاريخ_الاستلام` |
| **Relationship Rules** | `رقم_القضية` → Cases منطقياً. |
| **Delete Rules** | Soft Delete على مستوى Schema، **`syncPolicy` حذف = local-only حالياً** (نفس فجوة Children). |
| **Cascade Rules** | لا Cascade |
| **Backup Priority** | **حرجة** (بيانات مالية) |
| **Sync Priority** | فوري للإنشاء/التعديل، معطَّل للحذف (فجوة موروثة) |
| **Expected Record Count** | مئات إلى آلاف |
| **Storage Growth** | متوسط |

### 4.6 Tasks

| الخاصية | القيمة |
|---|---|
| **الغرض** | مهام المتابعة الشخصية للمحامي. |
| **Primary Key** | `id` (Hybrid) |
| **Indexes** | `الحالة`, `الموعد_النهائي` |
| **Composite Indexes** | `(الحالة + الموعد_النهائي)` — عداد "مهام مستحقة" في Dashboard |
| **Unique Indexes** | لا يوجد |
| **Foreign References** | `رقم_القضية` → Cases (اختياري — مهمة قد لا ترتبط بقضية) |
| **Required Fields** | `العنوان` |
| **Optional Fields** | `رقم_القضية`, `الأولوية`, `الموعد_النهائي`, `الحالة`, `الملاحظات` |
| **Nullable Fields** | كل الحقول الاختيارية = `''` |
| **Validation Rules** | `الموعد_النهائي` ISO Date. |
| **Default Values** | `الحالة` تبدأ فارغة (يطابق عدم وجود قيمة افتراضية صريحة في الكود اليوم؛ التعامل الفعلي "غير منجزة" يُحدَّد بمنطق `toggleTask()` القائم لا بقيمة تخزين ابتدائية). |
| **Search Fields** | `العنوان` |
| **Sort Fields** | `الموعد_النهائي` |
| **Filter Fields** | `الحالة`, `الأولوية` |
| **Relationship Rules** | `رقم_القضية` → Cases منطقياً، اختياري. |
| **Delete Rules** | Soft Delete على مستوى Schema، **`syncPolicy` حذف = local-only حالياً**. |
| **Cascade Rules** | لا Cascade |
| **Backup Priority** | متوسطة |
| **Sync Priority** | فوري للإنشاء/التعديل (بما في ذلك `toggleStatus` الجزئي الموثَّق سابقاً)، معطَّل للحذف |
| **Expected Record Count** | مئات |
| **Storage Growth** | متوسط |

### 4.7 Documents

| الخاصية | القيمة |
|---|---|
| **الغرض** | سجلات مستندات مرتبطة بروابط Google Drive نصية. |
| **Primary Key** | `id` (Hybrid) |
| **Indexes** | `رقم_القضية`, `نوع_المستند` |
| **Composite Indexes** | لا يوجد نمط مزدوج متكرر موثَّق |
| **Unique Indexes** | لا يوجد |
| **Foreign References** | `رقم_القضية` → Cases |
| **Required Fields** | `رقم_القضية`, `اسم_المستند` |
| **Optional Fields** | `نوع_المستند`, `تاريخ_الإيداع`, `رابط_Drive`, `الملاحظات` |
| **Nullable Fields** | كل الحقول الاختيارية = `''` |
| **Validation Rules** | `تاريخ_الإيداع` ISO Date. `رابط_Drive` نص حر (لا تحقق URL صارم حالياً — `ApiService.uploadFile` موجودة لكن غير مستخدَمة فعلياً كما وُثِّق سابقاً، فالحقل يبقى نصاً يدوياً). |
| **Default Values** | `''` |
| **Search Fields** | `اسم_المستند` |
| **Sort Fields** | `تاريخ_الإيداع` |
| **Filter Fields** | `رقم_القضية`, `نوع_المستند` |
| **Relationship Rules** | `رقم_القضية` → Cases منطقياً. |
| **Delete Rules** | Soft Delete على مستوى Schema، **`syncPolicy` حذف = local-only حالياً**. |
| **Cascade Rules** | لا Cascade |
| **Backup Priority** | عالية |
| **Sync Priority** | فوري للإنشاء/التعديل، معطَّل للحذف |
| **Expected Record Count** | مئات إلى آلاف |
| **Storage Growth** | متوسط-سريع |

### 4.8 Library

| الخاصية | القيمة |
|---|---|
| **الغرض** | مكتبة قانونية مرجعية (كتب/مصادر) — Local-only-by-design. |
| **Primary Key** | `id` (Hybrid) |
| **Indexes** | `النوع`, `القسم` |
| **Composite Indexes** | لا يوجد |
| **Unique Indexes** | لا يوجد |
| **Foreign References** | لا يوجد — كيان مستقل بالكامل |
| **Required Fields** | `العنوان` |
| **Optional Fields** | `النوع`, `القسم`, `الرابط`, `الوصف` |
| **Nullable Fields** | كل الحقول الاختيارية = `''` |
| **Validation Rules** | لا يوجد قيد خاص |
| **Default Values** | `''` |
| **Search Fields** | `العنوان`, `الوصف` |
| **Sort Fields** | `العنوان` |
| **Filter Fields** | `النوع`, `القسم` |
| **Relationship Rules** | لا يوجد |
| **Delete Rules** | Soft Delete |
| **Cascade Rules** | لا يوجد |
| **Backup Priority** | منخفضة (مرجعية عامة، ليست بيانات قضايا حساسة) |
| **Sync Priority** | **معطَّل بالكامل تصميماً (Local-only-by-design)** — لا Sheet مقابل أصلاً، ليست فجوة بل قرار مقصود موثَّق سابقاً. |
| **Expected Record Count** | عشرات إلى مئات |
| **Storage Growth** | بطيء جداً |

### 4.9 Templates

| الخاصية | القيمة |
|---|---|
| **الغرض** | صيغ الدعاوى الجاهزة — Local-only-by-design. |
| **Primary Key** | `id` (Hybrid) |
| **Indexes** | `النوع`, `القسم` |
| **Composite Indexes** | لا يوجد |
| **Unique Indexes** | لا يوجد |
| **Foreign References** | لا يوجد |
| **Required Fields** | `العنوان` |
| **Optional Fields** | `النوع`, `القسم`, `الرابط`, `الوصف` |
| **Nullable Fields** | كل الحقول الاختيارية = `''` |
| **Validation Rules** | لا يوجد قيد خاص |
| **Default Values** | `''` |
| **Search Fields** | `العنوان`, `الوصف` |
| **Sort Fields** | `العنوان` |
| **Filter Fields** | `النوع`, `القسم` (يطابق `currentTplFilter` الحالي — يُصبح معياراً صريحاً في QueryModel بدل global منفصل، كما أوصى التقرير السابق) |
| **Relationship Rules** | لا يوجد |
| **Delete Rules** | Soft Delete |
| **Cascade Rules** | لا يوجد |
| **Backup Priority** | منخفضة |
| **Sync Priority** | معطَّل بالكامل تصميماً |
| **Expected Record Count** | عشرات |
| **Storage Growth** | بطيء جداً |

### 4.10 Settings

| الخاصية | القيمة |
|---|---|
| **الغرض** | إعدادات اتصال المزامنة — Singleton (سجل وحيد دائماً، وليس مجموعة). |
| **Primary Key** | مفتاح ثابت واحد (`'default'` أو مكافئ) |
| **Indexes** | لا يوجد (سجل وحيد) |
| **Composite/Unique Indexes** | لا ينطبق |
| **Foreign References** | لا يوجد بيانات، لكنه Dependency قرائي لكل الـ Repositories الأخرى |
| **Required Fields** | لا يوجد (كل الحقول قد تكون فارغة قبل أول إعداد اتصال) |
| **Optional Fields** | `apiUrl`, `driveUrl`, `sheetUrl` (تطابق مفاتيح `localStorage` الفعلية اليوم بنفس الأسماء تماماً) |
| **Nullable Fields** | الثلاثة أعلاه = `''` قبل الإعداد |
| **Validation Rules** | إن وُجدت قيمة، تُفضَّل صيغة URL صالحة (توصية غير كاسرة — لا فرض حالياً). |
| **Default Values** | `''` لكل حقل |
| **Search/Sort/Filter Fields** | لا ينطبق (سجل وحيد) |
| **Relationship Rules** | لا يوجد |
| **Delete Rules** | لا Delete منطقي (Singleton لا يُحذَف، فقط تُصفَّر قيمه) |
| **Cascade Rules** | لا يوجد |
| **Backup Priority** | متوسطة (إعادة إعداد الاتصال يدوية بسيطة، ليست بيانات لا تُعوَّض) |
| **Sync Priority** | لا ينطبق (هذا Store نفسه لا يُزامَن مع Sheets — هو يزوِّد بيانات الاتصال، وليس عكسياً) |
| **Expected Record Count** | 1 دائماً |
| **Storage Growth** | صفر |

### 4.11 Calendar

| الخاصية | القيمة |
|---|---|
| **الغرض** | **ليس Store بيانات مستقل فعلياً** — كما وُثِّق في `DatabaseService_Design_Report.md` (القسم 7 هناك)، يُمثَّل بسجل واحد صغير داخل **Metadata Store** يحمل حالة UI للتقويم (`calYear`, `calMonth`, `calSelectedDay`) — نفس المتغيرات العامة الموجودة فعلياً في `index.html` اليوم (`var n=new Date();calYear=n.getFullYear();calMonth=n.getMonth();`). |
| **Primary Key** | مفتاح ثابت واحد ضمن Metadata Store (`'calendarState'`) |
| **Indexes / Composite / Unique** | لا ينطبق |
| **Foreign References** | لا يوجد — الجلسات المعروضة فعلياً تُقرأ من Sessions Store مباشرة عبر Query Adapter، لا تخزين مكرَّر هنا. |
| **Required Fields** | لا يوجد |
| **Optional Fields** | `calYear` (رقم سنة), `calMonth` (0-11), `calSelectedDay` (رقم يوم أو `null`) |
| **Nullable Fields** | `calSelectedDay` = `null` إن لم يُحدَّد يوم |
| **Validation Rules** | `calMonth` ضمن المدى 0-11. |
| **Default Values** | `calYear`/`calMonth` = السنة/الشهر الحاليان عند أول فتح (يطابق السلوك الحالي حرفياً)، `calSelectedDay` = `null` |
| **Search/Sort/Filter Fields** | لا ينطبق (حالة UI، ليست مجموعة بيانات) |
| **Relationship Rules** | اعتماد قرائي على Sessions فقط |
| **Delete Rules** | لا يوجد |
| **Cascade Rules** | لا يوجد |
| **Backup Priority** | منخفضة جداً (حالة UI تفضيلية، ليست بيانات عمل) |
| **Sync Priority** | معطَّل بالكامل (حالة UI محلية بحتة، لا معنى لمزامنتها) |
| **Expected Record Count** | 1 (كجزء من سجل Metadata) |
| **Storage Growth** | صفر |

### 4.12 Metadata

| الخاصية | القيمة |
|---|---|
| **الغرض** | Store بنيوي جديد بالكامل — بيانات تعريف عن قاعدة البيانات نفسها (وليست بيانات عمل قانونية): Schema Version، Migration Version، حالة Calendar (4.11)، تاريخ آخر فتح ناجح. |
| **Primary Key** | مفتاح نصي لكل نوع بيانات تعريف (`'schemaVersion'`, `'migrationVersion'`, `'calendarState'`, `'lastOpenedAt'`, ...) — Store بصيغة Key-Value، وليس مجموعة سجلات متجانسة الشكل. |
| **Indexes / Composite / Unique** | لا ينطبق (وصول مباشر بالمفتاح دائماً، لا حاجة فهرسة) |
| **Foreign References** | لا يوجد |
| **Required Fields** | `schemaVersion`, `migrationVersion` (يجب أن يكونا موجودَين دائماً بعد أول تشغيل ناجح — القسم 5 من التقرير السابق) |
| **Optional Fields** | `calendarState`, `lastOpenedAt`, وأي مفتاح تعريف إضافي مستقبلي |
| **Nullable Fields** | `lastOpenedAt` قد يكون غائباً عند أول تشغيل فقط |
| **Validation Rules** | `schemaVersion`/`migrationVersion` أرقام صحيحة موجبة فقط. |
| **Default Values** | `schemaVersion=1`, `migrationVersion=1` عند أول إنشاء (يطابق بداية الترقيم في `DatabaseService_Design_Report.md` القسم 5). |
| **Search/Sort/Filter Fields** | لا ينطبق |
| **Relationship Rules** | لا يوجد |
| **Delete Rules** | لا Delete منطقي — Store دائم الوجود طوال عمر قاعدة البيانات. |
| **Cascade Rules** | لا يوجد |
| **Backup Priority** | **حرجة من ناحية أخرى** — ليس لأن فقدانها يفقد بيانات عمل، بل لأن فقدان `schemaVersion` يمنع `DatabaseService` من معرفة كيف يقرأ باقي الـ Stores بأمان عند إعادة الفتح. |
| **Sync Priority** | معطَّل بالكامل (بيانات تقنية محلية بحتة، لا معنى لمزامنتها مع Sheets) |
| **Expected Record Count** | عدد صغير جداً وثابت تقريباً (أقل من 10 مفاتيح) |
| **Storage Growth** | صفر تقريباً |

### 4.13 SyncQueue

| الخاصية | القيمة |
|---|---|
| **الغرض** | Store بنيوي جديد — قائمة انتظار عمليات كتابة (create/update/delete) بانتظار إرسالها فعلياً لـ Google Sheets عبر `SyncService`. تخزين فقط، لا تنفيذ إرسال (موثَّق سابقاً في `DatabaseService_Design_Report.md` القسم 3/17). |
| **Primary Key** | `id` (Hybrid، تسلسل الإدخال يقارب ترتيب المحاولة) |
| **Indexes** | `entityStore` (اسم الـ Store صاحب العملية)، `status` |
| **Composite Indexes** | `(entityStore + status)` — استعلام "كل عمليات Fees المعلَّقة" مثلاً |
| **Unique Indexes** | لا يوجد |
| **Foreign References** | `entityStore` (اسم منطقي لأحد الـ 9 Stores الحقيقية)، `entityId` (معرِّف السجل المتأثر داخل ذلك Store) |
| **Required Fields** | `entityStore`, `entityId`, `operation` (`create`/`update`/`delete`), `status`, `createdAt` |
| **Optional Fields** | `retryCount`, `lastAttemptAt`, `lastError` |
| **Nullable Fields** | `lastAttemptAt`/`lastError` = `null` قبل أول محاولة |
| **Validation Rules** | `operation` ضمن ثلاث قيم فقط. `status` ضمن (`pending`/`failed`/`done`). |
| **Default Values** | `status='pending'`, `retryCount=0` |
| **Search/Sort Fields** | `createdAt` (لمعالجة الأقدم أولاً — FIFO) |
| **Filter Fields** | `entityStore`, `status` |
| **Relationship Rules** | يشير منطقياً لأي سجل في أي Store حقيقي عبر `(entityStore, entityId)` — علاقة عابرة لكل الـ Stores، وهذا مبرِّر وجوده كـ Store بنيوي منفصل بدل تكرار الحقل داخل كل Store. |
| **Delete Rules** | Hard Delete فوري بمجرد تأكيد `SyncService` نجاح الإرسال (لا معنى للاحتفاظ بعنصر ناجح — خلافاً لـ Soft Delete في الكيانات الحقيقية). |
| **Cascade Rules** | لا يوجد |
| **Backup Priority** | منخفضة (قابلة لإعادة البناء من حالة `syncVersion` في السجلات الحقيقية نفسها عند الحاجة القصوى) |
| **Sync Priority** | لا ينطبق (هذا الـ Store نفسه هو أداة المزامنة، لا يُزامَن هو ذاته) |
| **Expected Record Count** | متغيّر جداً — يفترض أن يبقى **صغيراً دائماً** في التشغيل الطبيعي (عناصر معلَّقة قصيرة الأجل)؛ نموه المستمر بلا تناقص هو مؤشر خطر (اتصال شبكة معطَّل طويلاً) يستحق تنبيهاً على مستوى UI. |
| **Storage Growth** | يُفترَض ثابتاً تقريباً (دورة حياة قصيرة لكل عنصر) |

### 4.14 Backups

| الخاصية | القيمة |
|---|---|
| **الغرض** | Store بنيوي جديد — لقطات (snapshots) دورية أو يدوية لكل البيانات، يستهلكها `BackupManager` لدعم Recovery (موثَّق سابقاً). |
| **Primary Key** | `id` (طابع زمني — ترتيب طبيعي حسب لحظة الإنشاء) |
| **Indexes** | `createdAt` |
| **Composite/Unique Indexes** | لا يوجد |
| **Foreign References** | لا يوجد (كل لقطة تحتوي نسخة كاملة مستقلة من كل الكيانات، وليست إشارة لسجلات خارجية) |
| **Required Fields** | `createdAt`, `data` (الحمولة الكاملة — نتاج `export()` من كل الـ 9 Repositories الحقيقية مجتمعة) |
| **Optional Fields** | `label` (وصف اختياري يدوي، مثل "قبل الترقية الكبرى") |
| **Nullable Fields** | `label` = `''` إن لم يُحدَّد |
| **Validation Rules** | `data` يجب أن يكون قابلاً للتحليل (`JSON.parse`) بالكامل قبل قبول اللقطة كصالحة (فحص سلامة بنيوية، كما في `DatabaseService_Design_Report.md` القسم 16). |
| **Default Values** | `label=''` |
| **Search/Sort Fields** | `createdAt` (الأحدث أولاً افتراضياً) |
| **Filter Fields** | لا يوجد نمط تصفية موثَّق حالياً بخلاف الترتيب الزمني |
| **Relationship Rules** | لا يوجد |
| **Delete Rules** | Hard Delete يدوي فقط، أو تنظيف دوري تلقائي (يحتفظ بآخر N لقطة فقط — عدد N يُحدَّد لاحقاً في مرحلة تنفيذ، ليس هنا) لتفادي استهلاك Quota (القسم 12). |
| **Cascade Rules** | لا يوجد |
| **Backup Priority** | لا ينطبق (هو نفسه آلية النسخ الاحتياطي) |
| **Sync Priority** | معطَّل (نسخ احتياطي محلي بحت، لا علاقة له بـ Google Sheets) |
| **Expected Record Count** | صغير جداً (لقطات دورية/يدوية قليلة، وليس لكل عملية) |
| **Storage Growth** | **الأخطر على Quota إن لم يُضبَط** — كل لقطة تحتوي نسخة كاملة من كل البيانات، فتراكم لقطات بلا تنظيف دوري يُضاعف حجم التخزين الفعلي بسرعة (تنبيه صريح يخص القسم 12 أدناه). |

### 4.15 Logs

| الخاصية | القيمة |
|---|---|
| **الغرض** | Store بنيوي جديد — سجل أحداث تشخيصية (فشل مزامنة، أخطاء ترقية، أخطاء تعافٍ) — لا مكافئ له اليوم (فقط `console.warn` متفرقة غير محفوظة). |
| **Primary Key** | `id` (تسلسلي/Hybrid) |
| **Indexes** | `level`, `timestamp` |
| **Composite Indexes** | `(level + timestamp)` — استعلام "كل أخطاء المزامنة في آخر أسبوع" مثلاً |
| **Unique Indexes** | لا يوجد |
| **Foreign References** | `relatedStore` اختياري (اسم Store سبب الحدث، إن انطبق) |
| **Required Fields** | `level` (`error`/`warning`/`info`), `message`, `timestamp` |
| **Optional Fields** | `relatedStore`, `details` (كائن إضافي حر البنية لسياق تقني) |
| **Nullable Fields** | `relatedStore`/`details` = `null` إن لم ينطبق |
| **Validation Rules** | `level` ضمن ثلاث قيم فقط. |
| **Default Values** | لا يوجد (كل حدث Log فعلي ومقصود، لا سجلات فارغة ابتدائية) |
| **Search/Sort Fields** | `timestamp` (الأحدث أولاً) |
| **Filter Fields** | `level` |
| **Relationship Rules** | لا يوجد فرض |
| **Delete Rules** | Hard Delete عبر تنظيف دوري تلقائي (الاحتفاظ بآخر فترة زمنية محدودة فقط، مثل آخر 30-90 يوماً — رقم دقيق يُحدَّد في مرحلة تنفيذ لاحقة) — **إلزامي** لأن هذا Store الوحيد المصمَّم بنمو غير محدود نظرياً بلا تنظيف. |
| **Cascade Rules** | لا يوجد |
| **Backup Priority** | منخفضة جداً (بيانات تشخيصية، ليست بيانات عمل لا تُعوَّض) |
| **Sync Priority** | معطَّل بالكامل |
| **Expected Record Count** | **الأعلى نمواً نظرياً بين كل الـ 15 Store** إن لم يُطبَّق تنظيف دوري — يُصنَّف Cold Data (كما في `DatabaseService_Design_Report.md` القسم 11) |
| **Storage Growth** | سريع جداً بلا تنظيف، ثابت تقريباً مع تنظيف دوري مفعَّل |

---

## 5. Entity Relationships

### 5.1 Relationship Diagram (منطقي — بدون فرض بنيوي فعلي)

```
                              ┌───────────┐
                    ┌────────▶│   Cases    │◀────────┐
                    │         │(رقم_القضية)│         │
                    │         └─────┬──────┘         │
                    │               │                │
        رقم_القضية  │               │ رقم_القضية      │ رقم_القضية
                    │               │                │
             ┌──────┴───┐    ┌──────▼──────┐   ┌─────┴──────┐
             │ Sessions  │    │  Children    │   │ Documents   │
             └───────────┘    └─────────────┘   └────────────┘
                    │
                    │ رقم_القضية               ┌────────────┐
                    └──────────────────────────▶│    Tasks    │ (اختياري)
                                                 └────────────┘
             ┌───────────┐
             │    Fees    │◀── رقم_القضية (Cases) + اسم_الموكل نصي (Clients)
             └───────────┘

             ┌───────────┐        اسم نصي غير مفروض
             │  Clients   │◀ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─▶ Cases (اسم_الموكل)
             └───────────┘

    Library, Templates, Settings  — كيانات مستقلة بلا أي علاقة خارجية

    Calendar (داخل Metadata) ──[قراءة فقط]──▶ Sessions
    Metadata / SyncQueue / Backups / Logs — Stores بنيوية، بلا علاقات كيانية
    (SyncQueue فقط تشير عبر entityStore/entityId إلى أي Store حقيقي، عابرة الاتجاه)
```

### 5.2 Entity Diagram (ملخّص الحقول المفتاحية لكل كيان)

```
Cases        [PK: رقم_القضية]        { عنوان_القضية, الحالة, اسم_الموكل, اسم_الخصم, ... 34 حقلاً }
Clients      [PK: id]                { الاسم, الرقم_القومي, الهاتف, ... }
Children     [PK: id, FK: رقم_القضية] { الاسم, تاريخ_الميلاد, ... }
Sessions     [PK: id, FK: رقم_القضية] { التاريخ, الوقت, الحالة, ... }
Fees         [PK: id, FK: رقم_القضية] { المبلغ, تاريخ_الاستلام, ... }
Tasks        [PK: id, FK?: رقم_القضية]{ العنوان, الموعد_النهائي, الحالة, ... }
Documents    [PK: id, FK: رقم_القضية] { اسم_المستند, رابط_Drive, ... }
Library      [PK: id]                { العنوان, النوع, القسم, ... }
Templates    [PK: id]                { العنوان, النوع, القسم, ... }
Settings     [PK: 'default']         { apiUrl, driveUrl, sheetUrl }
Metadata     [PK: key]               { schemaVersion, migrationVersion, calendarState, ... }
SyncQueue    [PK: id]                { entityStore, entityId, operation, status, ... }
Backups      [PK: id/timestamp]      { createdAt, data, label }
Logs         [PK: id]                { level, message, timestamp, ... }
```

جميع علاقات `FK` أعلاه **منطقية فقط** (لا فرض بنيوي فعلي من محرك التخزين، توافقاً مع القرار المكرَّر عبر كل المراحل السابقة).

---

## 6. Validation Rules (Matrix مجمَّعة)

| نوع القاعدة | تنطبق على | آلية الفرض |
|---|---|---|
| **Primary Key فريد** | كل Store (Cases: `رقم_القضية` بصرامة جديدة؛ الباقي: `id` مضمون فرادته بحكم `uid()`) | فحص وجود مسبق قبل `create()` |
| **Required Fields** (القسم 4، الحد الأدنى الجديد) | كل Store حقيقي | رفض `create()`/`update()` إن غاب الحقل — `ValidationError` (تصنيف موثَّق سابقاً) |
| **صيغة التاريخ ISO** | كل حقل تاريخ مذكور في القسم 4 | تطبيع/رفض عند الكتابة |
| **قيم Enum ضمن `<option>` المعروفة** | `الحالة` (Cases/Sessions/Tasks)، `وجود_قائمة_منقولات`/`وجود_أطفال` (Cases) | **توصية غير كاسرة** (تحذير لا رفض) في هذه المرحلة، تشدَّد لاحقاً عند الاستقرار |
| **`operation`/`status` Enum صارم** | SyncQueue، `level` Enum صارم في Logs | رفض صارم (Stores بنيوية جديدة بلا قيد توافق خلفي يمنع الصرامة) |
| **سلامة بنيوية (`JSON.parse` ناجح)** | كل Store، وتحديداً `data` في Backups | فحص عند الكتابة وعند `Integrity Check` (كما في `DatabaseService_Design_Report.md`) |

---

## 7. Index Strategy (ملخّص شامل عبر كل الـ 15 Store)

مبدأ حاكم واحد يتكرر من التقرير السابق ولا يتغيّر: **لا فهرس بلا نمط استعلام حقيقي موثَّق.** الفهارس النهائية المعتمَدة مُجمَّعة بالكامل في جدول القسم 4 لكل Store على حدة (عمودا Indexes/Composite Indexes) — لا تكرار هنا، فقط تصنيف الأنواع:

- **فهارس Foreign (الأكثر شيوعاً):** `رقم_القضية` في خمسة Stores (Children, Sessions, Fees, Tasks, Documents).
- **فهارس Date:** `تاريخ_الجلسة_القادمة` (Cases)، `التاريخ` (Sessions)، `تاريخ_الاستلام` (Fees)، `الموعد_النهائي` (Tasks)، `createdAt`/`timestamp` (Backups/Logs).
- **فهارس Status:** `الحالة` (Cases/Sessions/Tasks)، `status` (SyncQueue).
- **فهارس Search نصي:** بلا فهرسة خاصة (Full-Text) — بحث O(n) كما تقرر سابقاً، غير مبرَّر بحجم البيانات الحالي.
- **فهارس Composite:** 4 فقط عبر كل النظام (Cases, Sessions, Fees, Tasks) — كلها مبنية على أنماط Dashboard/Calendar/Timeline الفعلية الموثَّقة.

---

## 8. Version Rules

- **Schema Version / Migration Version:** كما وُثِّق بالكامل في `DatabaseService_Design_Report.md` (القسم 5 هناك) — لا تكرار، هذا التقرير يضيف فقط: أول Schema Version فعلية (`1`) **تُطابق تماماً** المحتوى الموصوف في هذا التقرير (34 حقل Cases، إلخ) — أي تعديل لاحق على حقل واحد يستوجب `Schema Version 2` بحد أدنى.
- **Record Version (`version`/`syncVersion`):** كما في القسم 3.8/3.10 أعلاه — على مستوى السجل الواحد، مستقل عن Schema Version (مفهوم مختلف تماماً، لا يُخلَط بينهما).
- **Compatibility Rules:** نفس القاعدة الصارمة من التقرير السابق — رفض العمل إن كانت Schema Version المخزَّنة فعلياً أحدث من المتوقَّعة بالكود الحالي.
- **Rollback Rules:** نفس القاعدة — Rollback مسموح فقط أثناء تنفيذ خطوة الترقية نفسها قبل تأكيد نجاحها، لا بعد الاستخدام الفعلي للبيانات بالشكل الجديد.

---

## 9. Metadata Rules

- Metadata Store (القسم 4.12) هو المصدر الوحيد لـ `schemaVersion`/`migrationVersion` — لا يُخزَّنان في أي مكان آخر مكرَّر (لا ازدواجية مصدر حقيقة).
- كل سجل بيانات (باستثناء الـ 4 Stores البنيوية) يحمل كتلة Metadata على مستوى السجل (القسم 3.9/3.10) منفصلة تماماً عن Metadata Store (الذي يخص قاعدة البيانات ككل، لا سجلاً بعينه) — لا خلط بين المفهومين رغم تشابه الاسم.
- `lastOpenedAt` في Metadata Store يُحدَّث في كل Startup Flow ناجح (كما وُصِف في التقرير السابق) — يُستخدَم مستقبلاً لتحليل نمط استخدام (Storage Growth، القسم 12) دون أي غرض آخر.

---

## 10. Search Strategy

- **بحث المساواة/الفلترة:** عبر الفهارس المذكورة في القسم 7 مباشرة — أداء ثابت تقريباً.
- **بحث نصي حر:** مسح خطي (O(n)) عبر الحقول المذكورة صراحة في عمود "Search Fields" لكل Store (القسم 4) فقط — لا بحث نصي عبر حقول لم تكن مبحوثة فعلياً في الكود الحالي (مثال: `الملاحظات` غير مضمَّن في بحث Cases اليوم، فلا يُضاف هنا بلا مبرر موثَّق).
- **بحث Date Range:** أساسي ومباشر عبر فهارس Date (القسم 7) — يخدم Sessions/Calendar/Fees/Tasks كما تقرر في التقرير السابق (Query Model).
- **لا Full-Text Search حقيقي:** نفس القرار المتكرر من كل المراحل — غير مبرَّر بحجم بيانات مكتب قانوني فردي واقعي.

---

## 11. Backup Strategy

- **أولوية النسخ الاحتياطي لكل Store** موثَّقة صراحة في عمود "Backup Priority" بالقسم 4 — الترتيب التنازلي الكامل: Cases وMetadata (حرجة) > Fees > Children/Documents/Sessions/Clients (عالية) > Tasks/Settings (متوسطة) > Library/Templates/Calendar (منخفضة) > Logs/SyncQueue (منخفضة جداً/غير قابلة للتطبيق).
- **آلية اللقطة:** `BackupManager` (موثَّق سابقاً) يستدعي `export()` من كل الـ 9 Repositories الحقيقية + `Settings` + `Metadata`، ويجمعها في سجل واحد داخل **Backups Store نفسه** (القسم 4.14) — لقطة ذاتية الاحتواء بالكامل.
- **قاعدة تنظيف إلزامية:** يجب تحديد حد أقصى لعدد اللقطات المحتفَظ بها (رقم دقيق يُحدَّد في مرحلة تنفيذ لاحقة، ليس هنا) — لأن Backups هو أخطر Store على استهلاك Quota كما وُثِّق صراحة في القسم 4.14، وأي غياب لهذا الحد يُعتبَر عيباً تصميمياً يجب تفاديه.
- **النسخ الاحتياطي اليدوي الحالي (`exportData`/`handleImport`) يبقى قائماً بالتوازي** — Backups Store إضافة تلقائية دورية، وليست استبدالاً للتصدير اليدوي الحالي (توافق خلفي، لا كسر).

---

## 12. Storage Growth Analysis

| Store | معدل النمو المتوقَّع | العامل الأكبر |
|---|---|---|
| **Sessions** | **الأسرع** بين الكيانات الحقيقية | كل قضية نشطة تنتج جلسات متكررة على مدى شهور/سنوات |
| **Cases** | بطيء-متوسط لكن **حجم السجل الفردي كبير** (34 حقلاً، بعضها نصوص طويلة) | تفصيل قانوني موسَّع لكل قضية |
| **Documents/Fees** | متوسط | تراكم طبيعي مع نشاط القضايا |
| **Tasks/Clients/Children** | بطيء | معدل إدخال أقل تكراراً |
| **Library/Templates/Calendar/Settings** | بطيء جداً إلى صفر | محتوى مرجعي/تفضيلي محدود بطبيعته |
| **Metadata** | صفر تقريباً | عدد مفاتيح ثابت تقريباً |
| **SyncQueue** | يُفترَض ثابتاً (دورة حياة قصيرة) — **نموه المستمر مؤشر خطر تشغيلي وليس نمواً طبيعياً** | انقطاع اتصال طويل الأمد |
| **Backups** | **الأخطر إن لم يُضبَط تنظيف دوري** | كل لقطة = نسخة كاملة من كل شيء |
| **Logs** | **الأسرع نظرياً بلا تنظيف دوري إلزامي** | حدث واحد لكل عملية تشخيصية |

**التقدير الإجمالي لحجم قاعدة البيانات:** بحجم بيانات مكتب قانوني فردي واقعي على مدى عدة سنوات (آلاف الجلسات، مئات-آلاف القضايا/المستندات/الأتعاب) — **ضمن حدود `localStorage` المعقولة (5-10 ميجابايت) لفترة متوسطة المدى (سنوات وليس أشهر)**، مع خطر تجاوز فعلي تدريجي يبرر مسار الانتقال المستقبلي لـ IndexedDB الموثَّق سابقاً — **بشرط إلزامي:** تفعيل تنظيف دوري لـ Logs وحد أقصى للقطات Backups، وإلا فهذان الـ Store وحدهما قد يستهلكان Quota أسرع من كل بيانات العمل القانونية الحقيقية مجتمعة.

---

## 13. Migration Compatibility

- **من `data[]`/`localStorage` الحالي إلى هذه الـ Schema:** يتبع حرفياً خطة Migration الموثَّقة في `DatabaseService_Design_Report.md` (القسم 23 هناك، المراحل أ-د) — هذا التقرير لا يضيف مسار ترحيل جديداً، بل **يحدد الشكل النهائي الدقيق** (Schema) الذي تهبط عليه تلك الخطة في نهاية المرحلة ج/د.
- **إضافة حقول Audit (القسم 3.10) للسجلات القديمة الموجودة فعلاً:** عند أول ترقية فعلية (Migration Version 1)، كل سجل قديم موجود في `localStorage` يحصل على قيم Audit افتراضية معقولة: `createdAt`/`updatedAt` = تاريخ تنفيذ الترقية نفسها (لأن التاريخ الحقيقي غير معروف لبيانات قديمة بلا Audit)، `version=1`, `syncVersion=null` (يُعامَل كمعلَّق مزامنة حتى تأكيد عكس ذلك — أكثر أماناً من افتراض مزامنته بلا دليل)، `deletedAt=null`.
- **حقل `id` الجديد للسجلات التي لا تملك مفتاحاً طبيعياً:** يُولَّد عبر `uid()` (نفس الدالة الحالية) لكل سجل قديم عند أول ترقية — عملية Batch Transaction واحدة لكل Store (كما وُصِف في `DatabaseService_Design_Report.md` القسم 25، الخطوة 2).
- **لا كسر لأي سجل قديم:** كل الحقول العربية القديمة تبقى بنفس الاسم والقيمة تماماً؛ الإضافات (Audit fields, `id` إن لم يوجد) هي الإضافة الوحيدة، ولا حذف أو إعادة تسمية لأي حقل قديم.

---

## 14. Risk Assessment

| الخطر | الاحتمالية | الأثر | التخفيف في هذه الـ Schema |
|---|---|---|---|
| **تضخم Backups/Logs بلا ضابط** | عالية إن لم يُطبَّق تنظيف دوري | عالٍ (استهلاك Quota سريع) | حد أقصى إلزامي موثَّق صراحة (القسم 4.14/4.15/11) |
| **تعارض `رقم_القضية` مكرر عند فرض Unique لأول مرة** | متوسطة (بيانات قديمة قد تحتوي فعلياً تكراراً غير مكتشَف اليوم لعدم وجود الفحص أصلاً) | متوسط (فشل ترقية أولى إن وُجد تكرار فعلي) | يجب أن تتضمن خطوة الترقية الأولى **فحص اكتشاف تكرار قبل فرض القيد**، وليس فرضاً أعمى — أي تكرار مكتشَف يُسجَّل في Logs Store كـ `warning` بدل فشل الترقية بالكامل، ويُترَك للمستخدم لحله يدوياً لاحقاً. |
| **بيانات قديمة بحقل تاريخ بصيغة غير ISO (إدخال يدوي تاريخي متساهل)** | متوسطة (`parseLocalDate` الحالية تتسامح مع صيغ متعددة فعلاً) | منخفض (الدالة الحالية تتعامل مع هذا التسامح أصلاً) | الترقية **لا تفرض** إعادة تنسيق قسري لحقول تاريخ قديمة غامضة الصيغة — تُترَك كما هي (توافق خلفي)، فقط السجلات الجديدة تلتزم ISO صراحة من الآن فصاعداً. |
| **فرض Required Fields جديدة على سجلات قديمة تفتقدها فعلياً** | متوسطة (لا `required` كان مفروضاً من قبل، فمن الممكن وجود سجلات فعلية بحقول "Required" الجديدة فارغة) | متوسط | Required Fields (القسم 4) **تُفرَض فقط على العمليات الجديدة (`create`/`update` بعد الترقية)** — لا رفض رجعي لسجلات قديمة موجودة فعلاً بحقل مطلوب فارغ، فقط تحذير `warning` في Logs عند اكتشافها أثناء Integrity Check. |

---

## 15. Testing Strategy

خطة اختبار الـ Schema (تخطيط فقط، لا تنفيذ):

1. **اختبار توافق البيانات القديمة:** تحميل نسخة فعلية حالية من `localStorage` (من `Master_v9.zip` الحقيقي) عبر مسار الترقية الكاملة، والتأكد أن كل سجل قديم يظهر بعد الترقية بنفس القيم العربية حرفياً + حقول Audit الجديدة المتوقَّعة فقط.
2. **اختبار فرض Unique على `رقم_القضية`:** إدخال بيانات اختبارية تحتوي عمداً تكراراً، والتأكد من سلوك الاكتشاف والتسجيل الموصوف في القسم 14 (وليس فشلاً صامتاً أو كارثياً).
3. **اختبار Required Fields الجديدة:** محاولة `create()` بحقل مطلوب فارغ لكل Store من الـ 9 — التأكد من رفض واضح (`ValidationError`) بدل قبول صامت كما يحدث اليوم.
4. **اختبار Soft Delete:** حذف سجل من كل Store، والتأكد أنه يختفي من `search()`/`getAll()` الافتراضية لكنه يبقى فعلياً قابلاً للاسترجاع عبر استعلام صريح يشمل المحذوفات.
5. **اختبار نمو SyncQueue/Logs/Backups:** محاكاة تراكم مصطنع (مئات العناصر) والتأكد أن آليات التنظيف الدورية (القسم 11/14) تُفعَّل فعلياً ولا تسمح بنمو غير محدود.
6. **اختبار Composite Indexes:** التأكد أن استعلامات Dashboard الفعلية (عدّادات، قوائم قادمة) تعطي نفس النتائج قبل وبعد تفعيل الفهارس المركّبة — لا فرق في النتيجة، فقط في الأداء.
7. **اختبار Foreign References المنطقية:** إنشاء سجل Session بـ `رقم_القضية` غير موجود فعلياً في Cases — التأكد من سلوك التحذير (وليس الرفض الصارم، كما تقرر في `Repository_Contract_Report.md` القسم 9) يعمل كما هو مصمَّم.

---

## 16. Future Expansion

يتوسّع هذا القسم على ما وثَّقه `DatabaseService_Design_Report.md` (القسم 24 هناك — Compatibility Report) بتفصيل خاص بمستوى الـ Schema تحديداً:

- **Future SQLite/Cloud/REST API/Mobile/Multi-user:** لا تأثير على Schema نفسها (أسماء الحقول، الأنواع، العلاقات المنطقية) — فقط على محرك التخزين الفعلي الذي يقرأ/يكتب هذه الـ Schema (خارج نطاق هذا التقرير تماماً، كما تقرر سابقاً).
- **توسّع حقول Cases مستقبلاً (مثال واقعي: تحويل `أطفال_القضية`/Children من نمط مزدوج التمثيل إلى نمط موحَّد — فجوة موثَّقة في `Repository_Contract_Report.md` القسم 15/17):** يتطلب Schema Version جديدة (القسم 8)، إضافية أولاً (Additive) قبل أي حذف، بنفس منهج Migration الموثَّق بالكامل هنا.
- **توسّع Enum مستقبلي (حالات قضية جديدة، مثلاً):** إضافة قيمة جديدة لقائمة `<option>` لا تستوجب Schema Version جديدة إطلاقاً (القيم Enum نصوص حرة أصلاً كما وُثِّق في القسم 3.5 — لا قيد بنيوي صارم يمنع قيمة جديدة اليوم، والتوصية بالتقييد مستقبلية غير كاسرة).

---

## 17. Implementation Notes

*(ملاحظات تسليم لمرحلة التنفيذ القادمة — وليست تنفيذاً بحد ذاتها):*

- ترتيب تنفيذ Schema لكل Store يجب أن يتبع حرفياً ترتيب الترحيل الموثَّق في `Repository_Contract_Report.md` (القسم 16 هناك): Library → Templates → Fees → Documents → Tasks → Clients → Children → Sessions → Cases، ثم Stores البنيوية الأربعة، ثم Settings/Calendar أخيراً.
- أول تنفيذ فعلي لـ Metadata Store يجب أن يسبق أي تنفيذ آخر (حتى Library الأبسط) — لأن `schemaVersion`/`migrationVersion` هما شرط الدخول لأي Startup Flow لاحق (كما في `DatabaseService_Design_Report.md` القسم 20).
- قرار الحد الأقصى الدقيق لعدد لقطات Backups والفترة الزمنية للاحتفاظ بـ Logs (المذكوران كـ "رقم يُحدَّد لاحقاً" في القسمين 11/4.15) هو **قرار تنفيذي صريح مؤجَّل عمداً** لمرحلة التنفيذ القادمة، وليس فجوة تصميم — هذه المرحلة (Specification) تحدد وجود القاعدة، لا قيمتها الدقيقة.

---

## 18. Ready For Repository Implementation

كل ما سبق Specification فقط: لا كود، لا ملفات جديدة داخل المشروع، لا تعديل على أي ملف من `Master_v9.zip`، ولا حسم للأرقام التنفيذية الدقيقة المؤجَّلة عمداً (حدود التنظيف الدورية، القسم 17). القرارات السياسية المفتوحة من المراحل السابقة (مزامنة حذف Children/Documents/Tasks/Fees) تبقى غير محسومة هنا أيضاً — تُترجَم فقط إلى حقول `syncPolicy`/Soft Delete صريحة في هذه الـ Schema (القسم 4)، دون حسمها نهائياً.

---

# Data Schema Specification

**PASS**

**Ready For Repository Implementation**
