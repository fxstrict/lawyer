# DatabaseService Design Report
## نظام الحسام للمحاماة — PHASE 3: DatabaseService Design
### V10 — Offline First Architecture

---

## 1. Executive Summary

هذا التقرير يصمم `DatabaseService` كطبقة وحيدة ونهائية للتعامل مع التخزين، بحيث لا يصل أي Repository (من الـ 12 المصمَّمة في `Repository_Contract_Report.md`) مباشرة إلى `localStorage`, IndexedDB, Google Sheets, أو `ApiService`. الواقع الفعلي المُتحقَّق منه في الكود الحالي (`Master_v9.zip`): محرك التخزين الوحيد المستخدم اليوم هو `localStorage` (تسع مفاتيح مصفوفة + ثلاثة مفاتيح إعداد مفردة)، **ولا يوجد أي استخدام لـ IndexedDB في المشروع حالياً إطلاقاً** (تم التحقق بالبحث الكامل في كل الملفات — صفر نتائج). لذلك هذا التصميم يبني `DatabaseService` كطبقة تجريد (abstraction) تتحدث بمفردات IndexedDB (Stores, Indexes, Transactions) لأنها المتطلب المستقبلي المُعلَن، بينما **التنفيذ الفعلي القادم في المرحلة القادمة سيبقى مسؤولاً عن ترجمة هذه المفردات إلى `localStorage` كمحرك افتراضي حالي**، تمهيداً لاستبداله بـ IndexedDB حقيقي لاحقاً دون تغيير أي Repository.

---

## 2. Input Gap

| المرجع المطلوب | الحالة |
|---|---|
| `Master_v10_Base.zip` | **غير موجود.** لم يُرفَع أي ملف في هذه الرسالة؛ الاعتماد على `Master_v9.zip` المرفوع والمفحوص في المرحلة السابقة (PHASE 2) — تم التحقق حينها من مطابقته لـ `PROJECT_STATE.md` (MD5 لـ `index.html` و`dashboard.js` مطابقان). لا يوجد أي إصدار v10 مرفوع حتى الآن في هذه المحادثة. |
| `Repository_Contract_Report.md` | **غير مرفوع كملف مستقل بهذا الاسم بالضبط.** التقرير المُنتَج فعلياً في المرحلة السابقة من هذه الجلسة (`Repository_Contract_Report_PHASE2_V10.md`) يُعتمَد كمصدره — نفس المحتوى، اسم ملف مختلف فقط. |
| `PROJECT_STATE.md` | ✅ موجود من المرحلة السابقة، لا تغيير. |
| `PROJECT_HISTORY.md` | ✅ موجود، لا تغيير. |
| `PROJECT_MAP.md` | ✅ موجود (قديم — مبني على `Master_v8_Stable.zip`)، يُستخدم فقط للحقائق البنيوية الثابتة كما في المرحلة السابقة. |
| `NEXT_PHASE.md` | ✅ موجود، لا تغيير. |
| **استخدام IndexedDB الفعلي في المشروع** | **غير موجود إطلاقاً** (تحقق مباشر: `grep -rin "indexeddb"` على كامل المشروع = صفر نتائج). هذه ليست فجوة إدخال بل **حقيقة معمارية مؤكَّدة** يُبنى عليها التصميم أدناه: DatabaseService تصميم تجريدي جديد بالكامل، وليس توثيقاً لطبقة قائمة. |

لا يوجد افتراض خارج ما هو مُتحقَّق منه أعلاه.

---

## 3. DatabaseService Responsibilities

### داخل النطاق

| المسؤولية | التفصيل |
|---|---|
| **الوصول الحصري للتخزين** | الطبقة الوحيدة المسموح لها بلمس `localStorage`/IndexedDB (مستقبلاً) مباشرة. كل Repository يستدعي `DatabaseService` فقط. |
| **إدارة دورة حياة القاعدة** | فتح/تهيئة/ترقية/إغلاق محرك التخزين (القسم 4). |
| **إدارة الإصدارات (Versioning)** | تتبع نسخة المخطط (Schema)، تنفيذ الترقيات، منع تشغيل نسخة تطبيق مع مخطط بيانات غير متوافق (القسم 5). |
| **تعريف وإدارة الـ Object Stores** | Store واحد لكل كيان بيانات + Stores بنيوية إضافية (Metadata, SyncQueue, Backups, Logs — القسم 7). |
| **الفهرسة** | إنشاء وصيانة الفهارس الثانوية داخل كل Store (القسم 8). |
| **طبقة المعاملات (Transactions)** | تنفيذ القراءة/الكتابة كوحدات ذرّية متسقة (القسم 9). |
| **التخزين المؤقت في الذاكرة (Cache)** | تسريع القراءات المتكررة دون تجاوز محرك التخزين كمصدر الحقيقة (القسم 10). |
| **القفل المنطقي (Locking)** | منع تعارضات الكتابة المتزامنة داخل نفس تبويب المتصفح (القسم 11). |
| **معالجة الأخطاء وتصنيفها** | إرجاع أخطاء منظّمة موحّدة لكل ما يحدث داخل الطبقة (القسم 12). |
| **التعافي والنسخ الاحتياطي الداخلي** | فحص سلامة البيانات عند الفتح، مسار تعافٍ عند التلف (القسم 13). |
| **قائمة انتظار المزامنة (SyncQueue Store)** | الاحتفاظ بسجل العمليات التي تنتظر إرسالها لـ Google Sheets — **تخزين فقط، وليس تنفيذ الإرسال نفسه** (الفرق موضّح أدناه). |

### خارج النطاق (Explicitly Out of Scope)

| ما هو مستبعد | لماذا ولمن يتبع |
|---|---|
| **الاتصال الفعلي بالشبكة (`fetch`, `ApiService`)** | يتبع `SyncService` حصراً. `DatabaseService` لا يعرف عن وجود `API_URL` أو Google Sheets إطلاقاً — فقط يخزّن/يقرأ سجلات `SyncQueue` كبيانات عادية، ومن يقرأ هذه القائمة وينفّذ الإرسال الفعلي هو `SyncService`. |
| **منطق التحقق من صحة البيانات على مستوى الأعمال (Business Validation)** | يتبع Repository Layer (موثَّق مسبقاً في `Repository_Contract_Report.md`، القسم 9 هناك) — DatabaseService يفرض فقط سلامة بنيوية (Schema Integrity)، لا قواعد عمل (مثل: هل `رقم_القضية` مكرر منطقياً). |
| **منطق العرض/الواجهة** | يتبع UI/Module Layer بالكامل — لا علاقة لـ DatabaseService بها إطلاقاً. |
| **قرار "متى" تُزامَن البيانات مع Sheets (`syncPolicy` لكل كيان)** | القرار يتبع Repository (كما صُمِّم في المرحلة السابقة)؛ DatabaseService ينفّذ الأمر (تخزين/استرجاع من SyncQueue) دون أن "يقرر" هو نفسه سياسة المزامنة. |
| **بناء تقارير الطباعة، QR، ملفات Drive** | خارج نطاق التخزين بالكامل. |
| **المصادقة (Authentication)** | غير موجودة في المشروع حالياً بتاتاً (موثَّق سابقاً)، ومحجوزة كطبقة منفصلة مستقبلية إن وُجدت. |

---

## 4. Database Lifecycle

```
Closed → Opening → Opened → Ready ⇄ Busy → Closing → Closed
                       │
                       ├─→ Upgrade (عند تغيّر Schema Version) → Opened
                       │
                       └─→ Recovery (عند فشل الفتح/تلف مكتشف) → Opened | Closed(fatal)
                       
                                              → Disposed (نهاية عمر التبويب)
```

- **Closed:** الحالة الابتدائية قبل أي تفاعل — لا اتصال بمحرك التخزين بعد.
- **Opening:** بدء فتح الاتصال بمحرك التخزين الفعلي (اليوم: قراءة أولية من `localStorage`؛ مستقبلاً: `indexedDB.open(dbName, version)`).
- **Version Check (جزء من Opening):** مقارنة نسخة المخطط المخزَّنة فعلياً بالنسخة المتوقَّعة من الكود (القسم 5) — يقرر إن كانت هناك حاجة لـ `Upgrade`.
- **Upgrade:** تنفيذ خطوات الترقية التراكمية بين النسخ (القسم 5) — حالة مؤقتة، تُغلَق أمامها كل الطلبات الأخرى حتى تكتمل.
- **Opened:** الاتصال قائم لكن التهيئة الداخلية (بناء الفهارس في الذاكرة، فحوصات السلامة الأولية) لم تكتمل بعد.
- **Ready:** جاهزة لاستقبال أي معاملة (Transaction) من أي Repository.
- **Busy:** أثناء تنفيذ معاملة كتابة فعلية — حالة قصيرة (طبيعة JS أحادي الخيط تجعلها لحظية عملياً مع `localStorage`، لكنها ستصبح فعلية أكثر زمنياً مع IndexedDB الحقيقي غير المتزامن).
- **Closing:** بدء إنهاء الاتصال (يحدث فعلياً فقط عند تفريغ الصفحة أو تبديل قاعدة بيانات — لا سيناريو "إغلاق يدوي" في نمط SPA وحيد الصفحة الحالي).
- **Recovery:** حالة استثنائية تُدخَل عند اكتشاف تلف بيانات أو فشل فتح (القسم 13) — تحاول الإصلاح التلقائي، وتنتقل إلى `Opened` عند النجاح أو تبقى `Closed` مع خطأ فادح (`fatal error`) عند الفشل الكامل.
- **Disposed:** إنهاء نهائي عند إغلاق التبويب — لا حاجة لتنظيف صريح مع `localStorage` (البيانات باقية بطبيعتها)، لكنها حالة منطقية ضرورية لتوافق مستقبلي مع IndexedDB حيث الاتصالات المفتوحة تحتاج إغلاقاً صريحاً.

---

## 5. Versioning Model

يجب التفريق بين ثلاثة مفاهيم مختلفة، مُتداخلة لكن غير متطابقة:

| المفهوم | التعريف | مثال واقعي بالمشروع |
|---|---|---|
| **Database Version** | رقم إصدار الاتصال بمحرك التخزين نفسه (المكافئ المنطقي لـ `indexedDB.open(name, version)`) — يزيد فقط عند تغيّر بنية الـ Stores (إضافة/حذف Store أو فهرس). | لم توجد بعد (لا IndexedDB اليوم) — تبدأ من `1` عند أول تنفيذ فعلي لهذا التصميم. |
| **Schema Version** | إصدار **شكل السجل** داخل كل Store (مثال: إضافة حقل جديد لسجل Case، أو تغيير نوع حقل). مستقل عن Database Version — يمكن أن يتغيّر Schema دون تغيير عدد/أسماء الـ Stores. | مثال حقيقي محتمل: تحويل `أطفال_القضية` من نص حر داخل سجل القضية إلى مصفوفة معرِّفات (حل تكرار البيانات الموثَّق في `Repository_Contract_Report.md` القسم 15). |
| **Migration Version** | رقم تسلسلي لكل خطوة ترحيل تُنفَّذ فعلياً (قد تغطي خطوة ترحيل واحدة أكثر من تغيير Schema، أو تغييرين في خطوة واحدة) — هو "التاريخ التنفيذي" وليس "الحالة النهائية". | يبدأ من `0` (الحالة الحالية: 9 مصفوفات JSON في `localStorage`، بلا أي Store رسمي بعد) → `1` = أول تنفيذ لـ DatabaseService نفسه. |

### Compatibility Rules
- التطبيق **يرفض العمل** إذا كانت Schema Version المخزَّنة فعلياً أحدث من التي يتوقعها كود التطبيق الحالي (سيناريو: نسخة تطبيق قديمة تُفتَح بعد ترقية تمت من جهاز/تبويب آخر) — بدل محاولة قراءة بيانات لا يفهم بنيتها.
- الترقية دائماً **تراكمية وتسلسلية** (Migration Version N → N+1 → N+2 ...)، لا يوجد قفز مباشر من إصدار قديم جداً لإصدار حديث دون المرور بكل خطوة وسيطة — لضمان أن كل خطوة ترحيل تبقى بسيطة وقابلة للاختبار بمعزل.
- كل ترقية **يجب أن تكون Additive أولاً** (نفس مبدأ Strangler من `Repository_Contract_Report.md` القسم 16) — لا تُحذف بيانات قديمة الشكل فوراً، بل تُضاف بجانبها البيانات بالشكل الجديد حتى يثبت استقرار الترحيل.

### Rollback Rules
- إن فشلت خطوة ترقية في المنتصف (مثال: نفدت مساحة التخزين أثناء كتابة الشكل الجديد)، يجب أن **يعود Migration Version للقيمة التي كانت قبل بدء هذه الخطوة تحديداً** ولا يُثبَّت أي تغيير جزئي — يُعامَل كـ Transaction واحدة فاشلة (تفصيل في القسم 9).
- لا "Rollback" حقيقي بمعنى العودة لإصدار Schema أقدم بعد نجاح الترقية والاستخدام الفعلي للبيانات الجديدة (هذا يعادل فقدان بيانات) — الـ Rollback مسموح به **فقط** أثناء تنفيذ خطوة الترقية نفسها، قبل تأكيد نجاحها الكامل.

---

## 6. Database Architecture

- **Database Name:** اسم منطقي واحد ثابت يمثّل قاعدة بيانات التطبيق بأكملها (مكافئ منطقي لاسم قاعدة IndexedDB) — يمثّل حاوية كل الـ Stores أدناه، بدل التبعثر الحالي بين مفاتيح `localStorage` المستقلة كل واحد بمفرده.
- **Object Stores:** كل Store مقابل تماماً إما لكيان بيانات حقيقي (من الـ 9 المصفوفات الفعلية في `data.*`)، أو Store بنيوي مساند لا يقابله كيان في `data.*` اليوم (Metadata, SyncQueue, Backups, Logs) — تفصيل كامل بالقسم 7.
- **Store Responsibilities:** كل Store مسؤول عن مجموعة سجلات من نوع واحد فقط — لا Store "عام" يخزّن أنواعاً مختلطة (هذا يعكس تماماً فصل `data.cases` عن `data.sessions` إلخ الموجود فعلياً اليوم، لكن بصورة رسمية داخل محرك تخزين واحد بدل تسع مفاتيح `localStorage` منفصلة).
- **Store Relationships:** العلاقات بين الـ Stores **منطقية فقط عبر قيم مفاتيح مشتركة (Foreign Key بالمعنى المنطقي، وليس فرضاً بنيوياً من محرك التخزين)** — تماماً كما هو موثَّق في `Repository_Contract_Report.md` (لا فرض Foreign Key فعلي حالياً في الكود، والحفاظ على هذا السلوك مقصود لتفادي كسر التوافق). العلاقة الوحيدة المُفترَض أن تُفرَض بصرامة على مستوى Store هي `Primary Key` الفريد داخل كل Store نفسه.

---

## 7. Store Registry

| Store | يقابل كيان `data.*`؟ | الوظيفة |
|---|---|---|
| **Cases** | ✅ `data.cases` | سجلات القضايا الكاملة (35 حقلاً). المفتاح الأساسي `رقم_القضية`. |
| **Clients** | ✅ `data.clients` | سجلات الموكلين + رمز بوابة الموكل (Portal Token). |
| **Children** | ✅ `data.children` | سجلات الأطفال المرتبطة بقضايا حضانة/نفقة. |
| **Sessions** | ✅ `data.sessions` | جلسات المحكمة، مرتبطة بـ `رقم_القضية`. |
| **Fees** | ✅ `data.fees` | سجلات الأتعاب المالية. |
| **Tasks** | ✅ `data.tasks` | مهام المتابعة. |
| **Documents** | ✅ `data.documents` | سجلات المستندات (روابط Drive نصية حالياً). |
| **Library** | ✅ `data.library` | مكتبة قانونية مرجعية — Local-only-by-design (لا Sheet مقابل). |
| **Templates** | ✅ `data.templates` | صيغ الدعاوى الجاهزة — Local-only-by-design. |
| **Settings** | ⚠️ جزئياً — يقابل مفاتيح `localStorage` المفردة الحالية `apiUrl`/`driveUrl`/`sheetUrl` | Store من سجل واحد (Singleton Store) بدل مصفوفة — إعدادات الاتصال والمزامنة. لا علاقة له بأي Store آخر بنيوياً، لكنه Dependency قرائي لـ SyncService (القسم 15). |
| **Calendar** | ❌ لا يقابل أي `data.*` | **ليس Store بيانات مستقل فعلياً** — تماماً كما وُثِّق في `Repository_Contract_Report.md` (القسم 4.11: Calendar Repository هو Query Adapter فوق Sessions). ضمن هذا التصميم، Calendar يُمثَّل بسجل صغير داخل **Metadata Store** (حالة UI محلية بحتة: `calYear`, `calMonth`, `calSelectedDay` — نفس المتغيرات العامة الموجودة فعلياً في `index.html` اليوم) — **وليس Store منفصلاً بالمعنى الكامل للكلمة**، لتفادي التعارض مع مبدأ "لا Store بلا سجلات كيان حقيقية". |
| **Metadata** | ❌ جديد | Store بنيوي: يحتفظ بـ Schema Version الحالية، Migration Version، تاريخ آخر فتح ناجح، حالة Calendar UI أعلاه، وأي بيانات تعريف عامة عن قاعدة البيانات نفسها لا تخص كياناً بعينه. |
| **SyncQueue** | ❌ جديد | Store بنيوي: قائمة عمليات كتابة (create/update/delete) بانتظار إرسالها لـ Google Sheets عبر `SyncService`. **تخزين فقط** — DatabaseService لا يعرف كيف يُرسِل، فقط يخزّن ماذا ينتظر الإرسال ويزيل العنصر عند تأكيد `SyncService` نجاح الإرسال. هذا يحل فجوة موثَّقة سابقاً (فشل مزامنة الحذف في Children/Documents/Tasks/Fees لا يُعاد محاولته أبداً اليوم لأنه لا توجد قائمة انتظار من الأساس). |
| **Backups** | ❌ جديد | Store بنيوي: نسخ لقطة (snapshot) دورية أو يدوية من كل البيانات — يُستهلَك من `BackupManager` (موثَّق في التقرير السابق) لدعم `Recovery` (القسم 13) بمعزل عن `export()`/`import()` اليدوي الحالي (`exportData`/`handleImport`). |
| **Logs** | ❌ جديد | Store بنيوي: سجل أحداث تشخيصية (فشل مزامنة، أخطاء ترقية، أخطاء تعافٍ) — لأغراض تتبع المشاكل لاحقاً، لا يوجد أي مكافئ له في الكود الحالي (لا تسجيل أخطاء منظّم اليوم، فقط `console.warn` متفرقة في `api.js`). |

**ملاحظة معمارية صريحة:** Dashboard **غير مُدرَج** في قائمة الـ Stores المطلوبة في التعليمات، وهذا **متسق تماماً** مع التصميم السابق (`Repository_Contract_Report.md` القسم 4.12) الذي وصفه كطبقة Aggregation صرفة بلا بيانات خاصة — لا حاجة لـ Store له بنفس منطق Calendar تقريباً، لكن دون حتى حاجة لسجل Metadata (Dashboard لا يملك حالة UI تحتاج حفظاً بين الجلسات، خلافاً لـ Calendar).

---

## 8. Primary Keys, Composite Keys, Unique Keys, Secondary Indexes, Compound Indexes

| Store | Primary Key | Unique Keys إضافية | Secondary Indexes | Compound Indexes |
|---|---|---|---|---|
| Cases | `رقم_القضية` | لا يوجد آخر (يُفرَض هنا بصرامة على مستوى المخزن، خلافاً لعدم فرضه اليوم في الكود — تحسين موثَّق مسبقاً في التقرير السابق) | `الحالة`, `تاريخ_الجلسة_القادمة` | `(الحالة + تاريخ_الجلسة_القادمة)` — لدعم استعلام Dashboard "القضايا المنظورة القادمة" بفهرس واحد بدل فلترة متتالية |
| Clients | معرِّف داخلي مولَّد (لا يوجد حقل مرشَّح طبيعي فريد فعلياً — لا `رقم_قومي` مضموناً دائماً كإلزامي في `FIELDS.clients`) | `الرقم_القومي` (فريد اختياري — قد يكون فارغاً) | `الاسم`, `الهاتف` | — |
| Children | معرِّف داخلي مولَّد | لا يوجد | `رقم_القضية` | — |
| Sessions | معرِّف داخلي مولَّد | لا يوجد | `رقم_القضية`, `التاريخ` | `(رقم_القضية + التاريخ)` — لدعم Calendar/Case timeline بفهرس واحد |
| Fees | معرِّف داخلي مولَّد | لا يوجد | `رقم_القضية`, `تاريخ_الاستلام` | `(رقم_القضية + تاريخ_الاستلام)` |
| Tasks | معرِّف داخلي مولَّد | لا يوجد | `الحالة`, `الموعد_النهائي` | `(الحالة + الموعد_النهائي)` — دعم مباشر لعداد Dashboard "مهام مستحقة غير منجزة" |
| Documents | معرِّف داخلي مولَّد | لا يوجد | `رقم_القضية`, `نوع_المستند` | — |
| Library | معرِّف داخلي مولَّد | لا يوجد | `النوع`, `القسم` | — |
| Templates | معرِّف داخلي مولَّد | لا يوجد | `النوع`, `القسم` | — |
| Settings | مفتاح ثابت واحد (Singleton — سجل وحيد دائماً) | — | — | — |
| Metadata | مفتاح ثابت واحد لكل نوع بيانات تعريف (`schemaVersion`, `migrationVersion`, `calendarState`, ...) | — | — | — |
| SyncQueue | معرِّف داخلي مولَّد تسلسلياً (ترتيب الإدخال = ترتيب المحاولة) | — | `entityStore` (أي Store صاحب العملية المعلَّقة), `status` (pending/failed/done) | `(entityStore + status)` |
| Backups | معرِّف داخلي مولَّد (طابع زمني) | — | `createdAt` | — |
| Logs | معرِّف داخلي مولَّد تسلسلياً | — | `level` (error/warning/info), `timestamp` | `(level + timestamp)` |

**ملاحظة على "معرِّف داخلي مولَّد":** هذا يقابل تماماً دالة `uid()` الموجودة فعلياً في `js/ui-utils.js` والمُستخدَمة اليوم عند إنشاء سجلات جديدة — لا يُستبدَل، بل يُعتمَد كمصدر الـ Primary Key الفعلي حيث لا يوجد مفتاح طبيعي فريد موثوق في بيانات المشروع الحالية (وهذه هي غالبية الـ Stores، باستثناء Cases التي تملك `رقم_القضية` كمرشَّح طبيعي واضح).

---

## 9. Index Strategy

- **Search Indexes:** فهارس المساواة على الحقول الأكثر استخداماً في فلاتر القوائم الحالية (`الحالة` في Cases/Tasks، `النوع`/`القسم` في Library/Templates) — تُبنى كفهارس ثانوية أحادية الحقل.
- **Date Indexes:** فهرس مرتَّب زمنياً على كل حقل تاريخ محوري (`تاريخ_الجلسة_القادمة` في Cases، `التاريخ` في Sessions، `الموعد_النهائي` في Tasks، `تاريخ_الاستلام` في Fees) — يخدم مباشرة استعلامات Date Range الموثَّقة في `Query Model` بالتقرير السابق.
- **Status Indexes:** فهرس مخصص على أي حقل "حالة" (`الحالة` في Cases/Sessions/Tasks) — الأكثر استخداماً في Dashboard (عدّادات) والقوائم المفلترة.
- **Foreign Indexes:** فهرس على كل حقل يمثّل علاقة منطقية بكيان آخر (`رقم_القضية` في Sessions/Documents/Tasks/Fees/Children) — يخدم استعلام "كل سجلات هذا الكيان المرتبطة بقضية معيّنة" بأداء ثابت (O(log n) بدل مسح كامل).
- **Composite Indexes:** فهارس مركّبة (القسم 8) تُبنى فقط حين يوجد نمط استعلام مزدوج متكرر فعلياً في التطبيق الحالي (لا فهرسة تخمينية) — الأمثلة المذكورة أعلاه مبنية على أنماط استعلام حقيقية موثَّقة (Dashboard، Calendar، القوائم المفلترة).

**مبدأ صارم:** لا يُنشأ أي فهرس بلا نمط استعلام حقيقي موثَّق في الكود الحالي أو في `Repository_Contract_Report.md` يبرر وجوده — تفادياً لتضخيم غير مبرر في مساحة التخزين وتعقيد الترقيات المستقبلية.

---

## 10. Transaction Model

| نوع | الوصف | الاستخدام النموذجي |
|---|---|---|
| **Read Transaction** | معاملة قراءة فقط، لا تحجز قفل كتابة (القسم 11) — يمكن تنفيذ عدة معاملات قراءة متزامنة. | `Repository.get/getAll/search/count` |
| **Write Transaction** | معاملة كتابة مفردة على Store واحد — ذرّية (تُطبَّق بالكامل أو لا شيء). | `Repository.create/update/delete` المفردة |
| **Batch Transaction** | معاملة كتابة تضم عدة سجلات على **نفس Store** — ذرّية كوحدة واحدة. | `Repository.bulkInsert/bulkUpdate/bulkDelete`, استيراد من `loadFromSheets` |
| **Atomic Transaction** | معاملة تضم عمليات متعددة **قد تشمل أكثر من Store واحد** (مثال حقيقي: حذف قضية يستلزم حذفاً متسلسلاً في Sessions/Documents/Tasks/Fees/Children + تسجيل في SyncQueue لكل عملية) — تُطبَّق كوحدة واحدة عبر كل الـ Stores المعنية معاً أو تفشل بالكامل. |
| **Rollback** | عند فشل أي خطوة داخل Batch أو Atomic Transaction، تُلغى كل الخطوات السابقة قبل أي Commit فعلي — لا حالة وسيطة تُكتب أبداً في محرك التخزين الدائم. |
| **Commit** | تثبيت التغييرات نهائياً في محرك التخزين + تحديث الـ Cache (القسم 10 من التقرير السابق / القسم 10 هنا) بشكل متسق معه في نفس اللحظة المنطقية. |
| **Recovery** | عند انقطاع غير متوقَّع أثناء Transaction (مثال: إغلاق التبويب فجأة أثناء Batch كبيرة) — عند إعادة الفتح التالية، `DatabaseService` يفحص إن كانت آخر معاملة غير مكتملة موثَّقة (عبر Metadata Store) ويُعيدها لحالة ما قبل بدئها (لا يحاول إكمالها تلقائياً بلا تأكيد). |

**الفرق الجوهري بين هذا القسم وما صُمِّم سابقاً في `Repository_Contract_Report.md` (القسم 8 هناك):** ذاك التصميم وصف Transaction من منظور Repository (منطق أعمال). هذا القسم يصف Transaction من منظور محرك التخزين نفسه (ذرّية فعلية على مستوى الكتابة الفيزيائية) — `Repository.transaction(ops[])` يُترجَم داخلياً إلى استدعاء واحد أو أكثر من `DatabaseService` transactions حسب عدد الـ Stores المتأثرة.

---

## 11. Cache Model

- **Memory Cache:** كل Store يحتفظ بنسخة كاملة في الذاكرة بعد أول فتح ناجح — هذا فعلياً **يطابق تماماً السلوك الحالي** (`data.*` بالكامل محمَّل بالذاكرة من `localStorage` عند الإقلاع). لا تغيير جوهري هنا، فقط رسمنة السلوك ضمن `DatabaseService` بدل تركه متفرقاً في `index.html`.
- **Hot Data:** البيانات الأكثر قراءة تكراراً (Cases, Sessions, Tasks — تُقرأ في كل تحميل صفحة Dashboard تقريباً) تبقى دائماً في الذاكرة الكاملة، بلا استثناء أو تفريغ.
- **Cold Data:** Stores بنيوية نادرة القراءة (Logs, Backups القديمة) — لا حاجة لتحميلها كاملة في الذاكرة عند الفتح؛ تُقرأ عند الطلب فقط (هذا تمييز جديد غير موجود اليوم لأن كل شيء يُحمَّل دفعة واحدة حالياً بلا تفريق، لكنه ضروري تحسباً لنمو Logs/Backups بلا حدود واضحة).
- **Lazy Cache:** لا يُطبَّق على الكيانات التسع الحقيقية حالياً (حجم البيانات الحالي لا يبرره، نفس الاستنتاج في التقرير السابق) — يُطبَّق فقط على Logs/Backups (Cold Data) كخطوة أولى للتمييز.
- **Cache Invalidation:** يحدث في لحظتين فقط ومحدَّدتين بدقة: (1) بعد أي `Commit` ناجح لمعاملة كتابة — تُحدَّث نسخة الذاكرة فوراً بنفس القيمة المكتوبة (لا إعادة قراءة من القرص، توفيراً للأداء). (2) بعد `import`/`bulkInsert` كامل (استبدال الكيان بأكمله من مصدر خارجي) — هنا تُعاد بناء نسخة الذاكرة بالكامل من الصفر بدل التحديث الجزئي.

---

## 12. Locking Model

- **طبيعة البيئة:** تطبيق SPA بتبويب متصفح واحد نشط عادة (لا Service Worker متعدد التبويبات موثَّق حالياً، ولا Web Workers) — القفل هنا **منطقي وليس فيزيائياً حقيقياً بمعنى أنظمة قواعد البيانات متعددة العمليات**.
- **Read Lock:** لا حاجة فعلية لقفل قراءة صريح — القراءات من نسخة الذاكرة (Cache) لا تتعارض أبداً مع بعضها (JS أحادي الخيط، القراءة لا تُعدِّل الحالة).
- **Write Lock:** كل Store يحجز قفل كتابة منطقي أثناء تنفيذ أي `Write/Batch/Atomic Transaction` عليه — أي طلب كتابة آخر على **نفس الـ Store** يُصفّ (queue) وينتظر تحرر القفل، بدل تنفيذ متزامن قد يُنتج حالة غير متسقة في نسخة الذاكرة.
- **Concurrent Access:** الكتابة على Stores مختلفة في نفس اللحظة **مسموحة ومتوازية منطقياً** (لا تعارض بين تحديث Cases وتحديث Tasks في نفس اللحظة) — القفل محصور بمستوى الـ Store الواحد، لا قفل شامل لقاعدة البيانات كلها.
- **Conflict Resolution:** نفس السياسة الموثَّقة في `Repository_Contract_Report.md` (القسم 8 هناك) — **Local-Wins** صراحة، لأنه لا سيناريو تعدد مستخدمين حقيقي حالياً (تبويب واحد، جهاز واحد فعلياً في الاستخدام النموذجي). أي تعدد تبويبات فعلي على نفس الجهاز (نادر لكن ممكن) يُعامَل بنفس منطق Write Lock أعلاه، دون آلية تعارض متقدمة (خارج نطاق هذه المرحلة، ومحجوز كقيد صريح لـ "Future Multi-user Support" في القسم 21).

---

## 13. Error Model

| نوع الخطأ | مثال واقعي | مصدره |
|---|---|---|
| `DatabaseError` | فشل عام في فتح الاتصال بمحرك التخزين (نادر مع `localStorage`، أكثر احتمالاً مع IndexedDB مستقبلاً — مثلاً وضع التصفح الخاص في بعض المتصفحات). | `Opening` |
| `TransactionError` | فشل تنفيذ معاملة كتابة لسبب غير متوقَّع أثناء التنفيذ (وليس بسبب فشل Validation — ذاك مسؤولية Repository). | أي Transaction |
| `MigrationError` | فشل خطوة ترقية Schema Version في المنتصف (القسم 5). | `Upgrade` |
| `CorruptionError` | فشل تحليل (`JSON.parse`) بيانات مخزَّنة فعلياً — سيناريو حقيقي معروف اليوم لو تم تعديل `localStorage` يدوياً بشكل غير صالح. | `Opening` / `Recovery` |
| `QuotaError` | تجاوز حد سعة `localStorage` (نموذجياً 5-10 ميجابايت حسب المتصفح) — خطر حقيقي مذكور صراحة في القسم 22. | أي Write/Batch Transaction |
| `StorageError` | فشل عام آخر أثناء الكتابة الفعلية لا يقع ضمن الأنواع أعلاه. | أي Write |

كل خطأ يُرجَع بنفس بنية `Repository_Contract_Report.md` (القسم 10 هناك): `{ type, message, store?, recoverable: boolean }` — مع إضافة حقل `store` هنا تحديداً لأن الخطأ على مستوى `DatabaseService` غالباً مرتبط بـ Store بعينه (خلافاً لأخطاء `ValidationError` على مستوى Repository التي ترتبط بحقل). `QuotaError`/`CorruptionError` تُعتبَر `recoverable: false` افتراضياً ما لم ينجح مسار التعافي (القسم 14) صراحة.

---

## 14. Recovery Model

- **Database Recovery:** عند اكتشاف `CorruptionError` أثناء `Opening`، يحاول `DatabaseService` قراءة كل Store **بمعزل عن الآخرين** (بدل فشل شامل واحد) — Store تالف واحد لا يمنع فتح باقي الـ Stores السليمة.
- **Auto Recovery:** لكل Store فشلت قراءته، يُهيَّأ فارغاً تلقائياً (مصفوفة فارغة) **بدل** إيقاف التطبيق بالكامل — يوازي منطقياً `JSON.parse(localStorage.getItem(k)||'[]')` الحالي (لو المفتاح غير موجود أو فاسد، القيمة الافتراضية `[]` تُستخدَم بالفعل اليوم بنفس الروح، فقط بلا تسجيل الحادثة — هذا التصميم يضيف التسجيل عبر Logs Store).
- **Integrity Check:** فحص خفيف عند كل `Opening` (وليس فحصاً عميقاً مكلفاً في كل مرة) — التحقق من أن كل Store قابل للتحليل (`JSON.parse` ناجح) وأن Schema Version المخزَّنة معروفة ومدعومة.
- **Backup Recovery:** عند فشل `Auto Recovery` لأي Store (تلف يمنع حتى التهيئة الفارغة الآمنة — سيناريو نادر جداً)، يحاول `DatabaseService` استرجاع آخر نسخة سليمة من **Backups Store** (القسم 7) قبل اللجوء لتصفير الـ Store بالكامل.
- **Repair Flow:** تسلسل واضح ومرتَّب: `Integrity Check فشل` → `Auto Recovery لكل Store متأثر` → إن فشل → `Backup Recovery` → إن فشل → `تسجيل Fatal Error في Logs Store` + الانتقال لحالة `Closed` مع رسالة خطأ واضحة للمستخدم (وليس تجميداً صامتاً للتطبيق).

---

## 15. Performance Strategy

- **Lazy Loading:** يُطبَّق فقط على Cold Data (Logs, Backups القديمة — القسم 10) — الكيانات التسع الحقيقية تبقى Eager-loaded بالكامل عند الفتح، بلا تغيير عن السلوك الحالي.
- **Batch Reads:** أي قراءة لعدة سجلات (مثل `getAll`) تُنفَّذ كعملية واحدة على مستوى محرك التخزين، لا حلقة قراءات فردية متكررة.
- **Batch Writes:** كل عمليات `import`/`loadFromSheets`/استعادة نسخة احتياطية تُنفَّذ كـ Batch Transaction واحدة (القسم 10) بدل استدعاء كتابة منفصل لكل سجل — يطابق التوصية نفسها في `Repository_Contract_Report.md` (القسم 14 هناك) لكن على المستوى الفيزيائي هنا بدل المنطقي.
- **Cursor Strategy:** محجوزة للاستخدام المستقبلي مع IndexedDB الحقيقي (مسح تدريجي للسجلات بدل تحميل الكل دفعة واحدة) — غير ضرورية اليوم بحجم البيانات الحالي مع `localStorage`، لكنها جزء من الـ Contract تحسباً للنمو (نفس مبدأ `Paging` في `Query Model` بالتقرير السابق).
- **Memory Optimization:** التمييز بين Hot/Cold Data (القسم 10) هو خط الدفاع الأول — لا حاجة لأي استراتيجية إخلاء ذاكرة (eviction) أعقد بحجم بيانات مكتب قانوني فردي واقعي.
- **Index Optimization:** الفهارس (القسم 9) مبنية فقط على أنماط استعلام حقيقية موثَّقة — لا فهرسة زائدة تُبطئ الكتابة بلا فائدة قراءة مقابلة.

---

## 16. Security Strategy

- **Validation:** `DatabaseService` يفرض **سلامة بنيوية فقط** (Structural Integrity) — أن كل سجل قابل للتحليل (`JSON.parse`) ويحتوي مفتاحاً أساسياً صالحاً قبل الكتابة الفعلية. لا يفرض قواعد أعمال (تلك مسؤولية Repository كما في القسم 3 أعلاه — حدود واضحة، لا تكرار مسؤوليات بين الطبقتين).
- **Integrity:** كل Batch/Atomic Transaction تُتحقَّق بالكامل (كل عناصرها صالحة بنيوياً) **قبل** بدء أي كتابة فعلية على أي Store — يمنع حالة "نصف الدفعة مكتوبة، نصفها لا" حتى في أسوأ سيناريو فشل منتصف الطريق.
- **Tampering Detection:** لا حماية تشفيرية أو توقيع رقمي على البيانات المخزَّنة اليوم (وهذا امتداد صريح لنفس القيد الموثَّق في `Repository_Contract_Report.md` القسم 15 — أي مستخدم بصلاحية الجهاز يمكنه تعديل `localStorage` مباشرة عبر console) — **لا يحل هذا التصميم هذه الفجوة**، فقط يوسّع `Integrity Check` (القسم 14) لرصد أي تعديل يكسر البنية المتوقَّعة عند الفتح التالي (رصد لاحق، وليس منعاً استباقياً).
- **Corruption Detection:** جزء من `Integrity Check` نفسه (القسم 14) — أي Store لا يمر فحص `JSON.parse` يُصنَّف تالفاً فوراً ويُسجَّل في Logs Store قبل تفعيل مسار `Auto Recovery`.

---

## 17. العلاقة بين DatabaseService وRepository وSyncService وBackupManager وUI وApiService

```
                     ┌───────────────────────┐
                     │   UI / Modules Layer    │
                     └───────────┬────────────┘
                                 │ (Contract فقط، من التقرير السابق)
                     ┌───────────▼────────────┐
                     │   Repository Layer       │  ← 12 Repository (مصمَّمة سابقاً)
                     │  (منطق أعمال + Validation│
                     │   + syncPolicy لكل كيان) │
                     └───┬───────────────┬─────┘
                         │               │
              (كل قراءة/كتابة       (بعد نجاح الكتابة محلياً:
               تمر هنا فقط،          تسجيل عملية معلَّقة في
               بلا استثناء)          SyncQueue Store)
                         │               │
              ┌──────────▼───────────────▼─────┐
              │        DatabaseService           │  ← هذا التصميم (PHASE 3)
              │  (Stores, Transactions, Cache,   │
              │   Locking, Recovery, Versioning) │
              └──────────┬────────────────────┬──┘
                         │                    │
                (القراءة/الكتابة        (SyncService يقرأ
                 الفعلية على             SyncQueue Store
                 محرك التخزين:           بشكل دوري/عند
                 localStorage اليوم،     الطلب، وليس
                 IndexedDB مستقبلاً)      DatabaseService
                         │              من يستدعيه)
              ┌──────────▼───────┐   ┌───▼─────────────┐
              │  Storage Engine   │   │   SyncService     │
              │  (localStorage /  │   │ (يستدعي ApiService │
              │   IndexedDB)      │   │  فعلياً، ويُحدِّث  │
              └───────────────────┘   │  حالة SyncQueue    │
                                       │  بعد كل محاولة)    │
                                       └───┬─────────────┘
                                           │
                                    ┌──────▼──────┐
                                    │ ApiService   │  ← موجود فعلاً بالكامل
                                    │ (fetch إلى   │     (js/api/api.js)
                                    │ Code_v4.gs)  │
                                    └─────────────┘

              ┌───────────────────┐
              │   BackupManager    │  ← يستدعي DatabaseService مباشرة لقراءة/
              │                    │     كتابة Backups Store (لقطات دورية)،
              │                    │     منفصل تماماً عن SyncService (النسخ
              │                    │     الاحتياطي محلي بحت، لا علاقة بالشبكة)
              └───────────────────┘
```

**الحد الفاصل الحاسم في هذا التصميم:** `DatabaseService` **لا يستدعي `SyncService` أو `ApiService` أبداً في أي اتجاه** — العلاقة الوحيدة هي أن `SyncService` **يقرأ** `SyncQueue Store` عبر `DatabaseService` (كأي قارئ آخر، بلا امتياز خاص) ثم يتخذ قراره بمعزل تام. هذا يحقق حرفياً الشرط الصريح في التعليمات: *"ولا يجوز لأي Repository الوصول مباشرة إلى ApiService"* — والتوسّع المنطقي الطبيعي لهذا الشرط هو أن `DatabaseService` نفسه أيضاً لا يصل لـ `ApiService` مباشرة، حفاظاً على نفس مبدأ الفصل الطبقي.

---

## 18. Dependency Graph

```
UI/Modules
   └── depends on → Repository Layer (Contract فقط)
                        └── depends on → DatabaseService (Contract فقط)
                                            └── depends on → Storage Engine (localStorage اليوم)
                        └── depends on → SyncService (لجدولة المزامنة فقط، وليس تنفيذها المباشر)
                                            └── depends on → DatabaseService (لقراءة/تحديث SyncQueue)
                                            └── depends on → ApiService (لتنفيذ الاتصال الفعلي)

BackupManager
   └── depends on → DatabaseService (Backups Store مباشرة)
   └── depends on → Repository Layer (export()/import() لكل الكيانات، من التقرير السابق)

DatabaseService
   └── depends on → NOTHING خارج Storage Engine نفسه (لا يعرف بوجود SyncService/ApiService/UI إطلاقاً)
```

**ملاحظة اتجاه الاعتماد:** الاعتماد أحادي الاتجاه بالكامل من أعلى لأسفل (UI → Repository → DatabaseService → Storage Engine) — لا اعتماد عكسي في أي طبقة، ولا اعتماد أفقي بين Repositories (كما تقرر سابقاً)، ولا بين `DatabaseService` وأي طبقة أعلى منه.

---

## 19. Call Graph

```
Repository.create(entity)
   → DatabaseService.beginTransaction(store: 'cases', mode: 'write')
       → DatabaseService.validateStructural(entity)         [فحص بنيوي فقط]
       → Storage Engine: write(store, key, entity)          [الكتابة الفعلية]
       → DatabaseService.updateCache(store, entity)          [تحديث الذاكرة]
       → DatabaseService.commit()
   ← WriteResult
   [Repository — منفصلاً وبعد نجاح ما سبق] → DatabaseService.enqueueSyncOperation('cases', entity, 'create')
                                                  → Storage Engine: write('syncQueue', ...)

Repository.getAll()
   → DatabaseService.readAll(store: 'cases')
       → Cache Hit? → إرجاع فوري من الذاكرة
       → Cache Miss (نادر — فقط أول فتح) → Storage Engine: readAll(store) → تحديث Cache → إرجاع

DatabaseService.open()
   → Version Check (Metadata Store: schemaVersion)
       → إن كان أقدم → Upgrade Flow (القسم 5/18)
       → إن كان مطابقاً → Integrity Check (القسم 14) → Ready

SyncService.processPendingQueue()  [دوري أو عند الطلب — ليس DatabaseService من يستدعيه]
   → DatabaseService.readAll(store: 'syncQueue', filter: {status: 'pending'})
   → لكل عنصر: ApiService.syncRow(...) / ApiService.deleteData(...)
       → نجاح → DatabaseService.deleteRecord('syncQueue', itemId)
       → فشل → DatabaseService.updateRecord('syncQueue', itemId, {status: 'failed', retryCount+1})

BackupManager.createSnapshot()
   → لكل Repository حقيقي (9): Repository.export()
   → DatabaseService.write('backups', {timestamp, data: {...كل الكيانات}})
```

---

## 20. Startup Flow

```
1. Browser Open (تحميل الصفحة، تنفيذ السكريبتات بالترتيب الحالي في index.html)
2. Database Open        → DatabaseService.open() يبدأ (الحالة: Closed → Opening)
3. Version Check         → قراءة Metadata Store: schemaVersion الحالية مقابل المتوقَّعة بالكود
4. Upgrade (إن لزم)       → تنفيذ خطوات الترقية التراكمية (القسم 5) قبل المتابعة — يحجب كل شيء لاحقاً حتى الانتهاء
5. Integrity Check        → فحص كل Store (القسم 14) — Auto Recovery لأي Store متأثر إن لزم
6. Database Ready          → الحالة: Ready — كل الـ Stores محمَّلة في Cache (Hot Data)
7. Repositories Ready       → كل Repository الـ 12 يهيّئ نفسه فوق DatabaseService الجاهزة الآن (Repository Lifecycle: Open → Ready، من التقرير السابق)
8. UI Ready                  → navigate('dashboard') الافتراضي، renderDashboard() يستدعي Repositories الجاهزة الآن
   [موازٍ، غير حاجب]:
   SyncService.processPendingQueue() يبدأ في الخلفية إن كان API_URL معرَّفاً (يوازي pingConnection/loadFromSheets الحاليين بعد DOMContentLoaded)
```

**مطابقة صريحة للسلوك الحالي:** هذا التسلسل يطابق منطقياً `window.addEventListener('DOMContentLoaded', ...)` الموجود فعلياً اليوم في `index.html` (الذي يستدعي `updateBadges()`, `renderDashboard()`, `updateConnectionStatus()`, ثم `loadFromSheets()` إن وُجد `API_URL`) — الفرق الوحيد هو إدخال خطوات `Version Check`/`Upgrade`/`Integrity Check` الرسمية التي لا وجود لها اليوم إطلاقاً (لا حاجة لها اليوم لأن `localStorage` بلا مفهوم إصدار Schema من الأساس).

---

## 21. Shutdown Flow

```
1. Commit        → أي معاملة كتابة قيد التنفيذ (نادرة الحدوث فعلياً عند الإغلاق بسبب سرعة العمليات المتزامنة مع localStorage) تُكمَل أو تُلغى بالكامل — لا حالة وسيطة أبداً
2. Flush Cache    → لا حاجة فعلية مع localStorage (كل Commit يكتب فوراً للقرص أصلاً، لا فرق بين الذاكرة والتخزين الدائم زمنياً) — تصبح خطوة فعلية وضرورية فقط مع IndexedDB مستقبلاً (حيث الكتابة غير متزامنة وقد تكون معلَّقة)
3. Close Transactions → إغلاق أي قفل كتابة معلَّق (القسم 11) بشكل نظيف
4. Close Database  → الحالة: Closing → Closed
```

**ملاحظة واقعية:** في نمط SPA وحيد الصفحة الحالي، لا يوجد استدعاء صريح لـ Shutdown Flow اليوم (المستخدم يغلق التبويب مباشرة، والمتصفح ينهي كل شيء فوراً) — هذا التسلسل **محجوز رسمياً** ليُستدعى عبر `window.addEventListener('beforeunload', ...)` (غير موجود اليوم في `index.html`) كتحسين مستقبلي، وضروري جداً بمجرد الانتقال الفعلي لـ IndexedDB حيث معاملات معلَّقة عند الإغلاق المفاجئ تعني فعلياً بيانات مفقودة أو تالفة.

---

## 22. Risk Assessment

| الخطر | الاحتمالية الواقعية اليوم | الأثر | كيف يخفِّفه هذا التصميم |
|---|---|---|---|
| **Database Corruption** | منخفضة لكن حقيقية (تعديل يدوي من console، خطأ متصفح نادر) | عالٍ (فقدان بيانات قانونية حساسة) | Integrity Check عند كل فتح + Auto/Backup Recovery (القسم 14) |
| **Quota Limit** | **متوسطة إلى عالية على المدى الطويل** — `localStorage` محدود عملياً بـ 5-10 ميجابايت حسب المتصفح، وحقول Cases الـ 35 حقلاً + نمو Sessions/Documents عبر سنوات ممارسة قانونية فعلية قد تصل الحد فعلياً | عالٍ (فشل كتابة صامت أو خطأ صريح يوقف الحفظ) | `QuotaError` مصنَّف صراحة (القسم 13) بدل فشل صامت غير مفهوم؛ + هذا الخطر تحديداً هو الدافع المعماري الحقيقي وراء طلب دعم IndexedDB مستقبلاً (سعة أكبر بمراحل) |
| **Version Conflict** | منخفضة اليوم (لا Schema Version موجود أصلاً بعد) لكن ستزيد مع كل ترقية مستقبلية | متوسط | Compatibility Rules الصارمة (القسم 5) — رفض العمل بدل تخمين توافق غير مؤكَّد |
| **Migration Failure** | منخفضة لكن الأثر كارثي إن حدثت بلا حماية | عالٍ جداً | Rollback Rules (القسم 5) + معاملة Migration كـ Atomic Transaction كاملة (القسم 9/10) |
| **Unexpected Shutdown** | متوسطة (إغلاق تبويب مفاجئ أثناء كتابة نشطة) | منخفض اليوم مع localStorage (كتابة متزامنة فورية)، **سيزيد** مع IndexedDB الفعلي مستقبلاً | Shutdown Flow محجوز (القسم 21) + طبيعة Write Transaction الذرّية (القسم 9) تمنع حالة نصف-مكتوبة بنيوياً |
| **Browser Compatibility** | منخفضة لـ `localStorage` (دعم شبه شامل)، **أعلى** لـ IndexedDB في بيئات تصفح خاص/محدودة الصلاحيات على بعض الأجهزة | متوسط | `DatabaseService.open()` يُصمَّم بحيث فشل فتح IndexedDB (مستقبلاً) يمكن أن يتراجع (fallback) منطقياً لمحرك `localStorage` كخيار احتياطي، حفاظاً على استمرارية Offline-First حتى في أضعف البيئات |

---

## 23. خطة Migration — من `data[]` إلى `DatabaseService`

**تُبنى فوق** Migration Contract الموثَّق مسبقاً في `Repository_Contract_Report.md` (القسم 16 هناك)، وتحدِّد تحديداً الخطوات الخاصة بطبقة `DatabaseService` نفسها ضمن نفس نمط Strangler العام:

**المرحلة أ — بناء DatabaseService فوق localStorage بلا تغيير الشكل الخارجي:**
`DatabaseService` يُهيَّأ في هذه المرحلة بحيث تنفيذه الداخلي **لا يزال فعلياً** يقرأ/يكتب نفس تسع مفاتيح `localStorage` الحالية بنفس الأسماء بالضبط (`cases`, `sessions`, ...) — فقط عبر واجهة `DatabaseService` الرسمية بدل الوصول المباشر. أي كود قديم لم يُرحَّل بعد يستمر بالعمل دون أي تعديل (نفس مبدأ الترحيل السابق تماماً).

**المرحلة ب — تفعيل Metadata/SyncQueue/Backups/Logs Stores:**
هذه الـ Stores الأربعة الجديدة (لا مقابل لها في `localStorage` الحالي) تُنشأ كإضافة صرفة (Additive) — لا تمس التسع مفاتيح القائمة إطلاقاً.

**المرحلة ج — ربط Repository Layer بـ DatabaseService بدل `data[]` المباشر:**
تتبع حرفياً ترتيب الترحيل الموثَّق مسبقاً (Library → Templates → Fees → Documents → Tasks → Clients → Children → Sessions → Cases) — كل Repository في دوره يستبدل قراءته/كتابته المباشرة لـ `data.<entity>` باستدعاء `DatabaseService` بدلاً منه.

**المرحلة د — الانتقال الفعلي لمحرك IndexedDB (اختياري، مؤجَّل):**
فقط بعد استقرار المرحلة ج بالكامل عبر كل الـ Repositories، يُستبدَل التنفيذ الداخلي لـ `DatabaseService` (وليس واجهته) من `localStorage` إلى IndexedDB فعلياً — بما في ذلك أول استخدام حقيقي لـ Database Version (القسم 5) بمعناه الكامل. **هذه الخطوة غير ملزمة زمنياً** — يمكن للتطبيق أن يعمل بشكل صحيح ومستقر إلى أجل غير مسمى بمحرك `localStorage` وحده تحت غطاء `DatabaseService`، والانتقال لـ IndexedDB يصبح ضرورياً فقط عند الاقتراب الفعلي من حد Quota (القسم 22).

---

## 24. Compatibility Report

| المتطلب | كيف يضمنه هذا التصميم |
|---|---|
| **Offline First** | لا تغيير في المبدأ الأساسي (Repository_Contract_Report القسم 4) — DatabaseService لا يضيف أي اعتماد على شبكة، بل يزيد الموثوقية عبر SyncQueue Store (استرجاع محاولات مزامنة فاشلة بدل فقدانها صامتة كما يحدث اليوم). |
| **Future SQLite** | نفس مبدأ استبدال Storage Engine فقط دون لمس واجهة `DatabaseService` (القسم 6) — SQLite (عبر WASM مثلاً) نقطة استبدال بديلة مكافئة لـ IndexedDB، خلف نفس الواجهة. |
| **Future REST API** | لا علاقة مباشرة بـ `DatabaseService` أصلاً (خارج نطاقه صراحة، القسم 3) — يخص `SyncService`/`ApiService` فقط، معزول بالفعل. |
| **Future Cloud** | SyncQueue Store + طبيعة `DatabaseService` المعزولة عن الشبكة تماماً تجعل أي مزامنة سحابية مستقبلية (مصدر حقيقة سحابي بدل Google Sheets) تمس `SyncService` فقط دون أي تغيير في `DatabaseService` أو Repositories. |
| **Future Mobile** | نفس منطق `Repository_Contract_Report.md` (القسم 17 هناك) — الـ Contract لا يفترض بيئة متصفح تحديداً؛ أي منصة تدعم مفهوم Stores/Transactions المكافئ يمكنها تبني نفس التصميم. |
| **Future Multi-user** | Locking Model (القسم 12) وConflict Resolution (Local-Wins الصريح) موثَّقان كقيد معروف ومعزول تماماً داخل `DatabaseService`/`SyncService` — استبدالهما مستقبلياً لا يمس Repository أو UI إطلاقاً. |

**بدون إعادة كتابة المشروع:** كل الضمانات أعلاه محققة بفضل المرحلة أ في القسم 23 (DatabaseService يبدأ كغلاف فوق `localStorage` القائم فعلياً، وليس استبدالاً فورياً له).

---

## 25. Implementation Roadmap

1. تنفيذ `DatabaseService` بمحرك `localStorage` (المرحلة أ، القسم 23) — Stores التسع الحقيقية أولاً، بواجهة Contract كاملة لكن تنفيذ داخلي مطابق للسلوك الحالي حرفياً.
2. إضافة Metadata Store + أول Schema/Migration Version رسمية (يبدأ من `1`).
3. إضافة SyncQueue/Backups/Logs Stores (المرحلة ب).
4. ربط Repository Layer بـ `DatabaseService` حسب الترتيب الموثَّق سابقاً (المرحلة ج).
5. بناء `SyncService` كمستهلك لـ SyncQueue Store (يحل فجوات مزامنة الحذف الموثَّقة سابقاً في Children/Documents/Tasks/Fees كخطوة `syncPolicy` تفعيل، لا تعديل بنية).
6. بناء `BackupManager` فوق Backups Store.
7. تفعيل Integrity Check + Recovery Flow في الإنتاج، ومراقبة Logs Store لأي حوادث فعلية.
8. عند الاقتراب من حد Quota فعلياً (وليس استباقياً) — تنفيذ المرحلة د: الانتقال الفعلي لمحرك IndexedDB خلف نفس واجهة `DatabaseService`.

---

## 26. DatabaseService Standards

- الواجهة العامة لـ `DatabaseService` **لا تكشف أبداً** تفاصيل محرك التخزين الفعلي (لا `localStorage.getItem` ولا `indexedDB.transaction` مرئية لأي طبقة أعلى) — Repository يتعامل مع مفاهيم Store/Transaction فقط، بصرف النظر عن التنفيذ الداخلي.
- كل عملية كتابة تمر حتماً عبر Transaction رسمية (لا كتابة "مباشرة" خارج نطاق معاملة، حتى لو كانت عملية مفردة بسيطة) — يضمن اتساق سلوك الذاكرة/القرص دائماً.
- كل Store الجديدة (Metadata, SyncQueue, Backups, Logs) تلتزم بنفس بنية الخطأ الموحّدة (القسم 13) ونفس نموذج الفهرسة (القسم 8/9) — لا معاملة استثنائية لأي Store بحجة أنه "بنيوي" وليس كياناً حقيقياً.
- أي تغيير مستقبلي في محرك التخزين الفعلي (localStorage → IndexedDB → SQLite) **يُعتبَر فشلاً تصميمياً** إن استلزم تعديل ولو سطر واحد في أي Repository — هذا هو معيار النجاح الأهم لكامل هذا التصميم.

---

## Ready For Data Schema Specification

كل ما سبق تصميم معماري فقط: لا كود، لا ملفات جديدة داخل المشروع، لا تعديل على أي ملف من `Master_v9.zip`، ولا تنفيذ فعلي لـ IndexedDB API. القرارات السياسية المفتوحة (مزامنة حذف Children/Documents/Tasks/Fees) تبقى غير محسومة هنا أيضاً — يحلها `syncPolicy` عبر `SyncService` في مرحلة لاحقة، تماماً كما وُثِّق في المرحلة السابقة.

---

# DatabaseService Design Review

**PASS**

**Ready For Data Schema Specification**
