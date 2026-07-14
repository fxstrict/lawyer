# Restore_System_Architecture.md
## PHASE 10 — SUB-PHASE 10.1 — تحليل الأثر المعماري لـ Restore على كامل المشروع (T-01)
### Audit + Design Only — لا كود، لا Patch، لا Diff، لا تنفيذ

هذا الملف يكمل `Restore_System_Design.md` (الأسئلة 1–13) بتحليل الأثر (Impact Analysis) لإضافة `restore()` على كل طبقة أخرى في المشروع (الأسئلة 14–25)، بناءً على قراءة فعلية لـ: `js/modules/*.js` (خصوصاً `dashboard.js`، `clients.js`, `cases.js`), `js/api/api.js`, `docs/Production_Readiness_Audit.md` (§2.3 Module Layer, §2.4 ApiService, §2.6 Mirror Strategy), `docs/Technical_Debt_Report.md` (§T-02, §T-04, §T-05).

---

## 14. التأثير على Mirror Strategy (`data.*`)

**تأثير مباشر لكنه بسيط ومطابق تماماً لنمط `delete()` الحالي — لا حاجة لتصميم جديد.**

كل Module مهاجَر (التسعة) يحافظ على `syncXMirror()` يُستدعى بعد كل كتابة ناجحة (`Production_Readiness_Audit.md §2.3`، مؤكَّد بنفس النمط في كل ملف). `syncXMirror()` نفسها — بحسب الأدلة المقروءة من كل ملف Module — تُعيد ببساطة `data.x = xRepository.getAll();` (كما هو موثَّق حرفياً في `Technical_Debt_Report §T-05`: `data.cases = casesRepository.getAll();`).

بما أن `getAll()` **مستبعِدة للسجلات المحذوفة افتراضياً** (بدون `includeDeleted`)، فإن استدعاء `syncXMirror()` بعد `restore()` ناجحة سيُعيد بناء `data.x` بحيث **يظهر السجل المسترجَع من جديد** تلقائياً — بلا أي تعديل على `syncXMirror()` نفسها. هذا بالضبط نفس الآلية التي تُخفي السجل من `data.x` بعد `delete()` اليوم، لكن بالاتجاه المعاكس. **الشرط الوحيد:** أي دالة Module جديدة من نوع `restoreCase(id)` (سؤال 12-ب في التقرير السابق) **يجب** أن تستدعي `syncXMirror()` بعد `restore()` الناجحة، تماماً كما تفعل `deleteCase()`/`saveCase()` اليوم — وإلا سيبقى `data.x` (وبالتالي Dashboard/Calendar/Print) غير مدرك لوجود السجل المسترجَع حتى يُعاد تحميل الصفحة.

**لا تأثير على Mirror الخاص بشاشة Trash نفسها (سؤال 13):** شاشة Trash تعرض بيانات عبر استعلام `search({includeDeleted:true, ...})` مباشرة على الـ Repository، **وليس** عبر `data.x` — لأن `data.x` بتصميمه الحالي يستبعد المحذوف دائماً (هذا هو الغرض منه أصلاً). لذلك Trash تحتاج مصدر بيانات منفصل عن الـ Mirror القياسي، لا تعديلاً عليه.

---

## 15. التأثير على مزامنة Google Sheets (Google Sheets Sync)

**لا تأثير تقني مباشر على `restore()` نفسها، لكنها تكشف فجوة موثَّقة مسبقاً (T-02) ستتضاعف بدلالة عكسية إن لم تُعالَج بوعي.**

`ApiService` (`js/api/api.js`) لا يملك أي مفهوم "استرجاع" اليوم — فقط `syncRow()` (إنشاء/تحديث) و`deleteData()` (حذف) و`loadFromSheets()` (تحميل). الاسترجاع من الناحية المنطقية هو **تحديث لحقل واحد فقط (`deletedAt` من قيمة إلى `null`)** على سجل موجود بالفعل في الشيت (لأن الحذف كان Soft، لم يُحذف الصف من الشيت أصلاً في الحالات التي تُزامِن الحذف: Cases/Sessions/Clients). لذلك، من الناحية النظرية، الاسترجاع **يجب أن يستدعي `syncRow()` (نفس دالة التحديث)**، وليس `deleteData()` ولا دالة جديدة — لأنه تحديثياً لا يختلف عن أي `update()` عادي من منظور الشيت.

**لكن هذا يصطدم مباشرة بفجوة T-02 الموثَّقة مسبقاً:**
- Cases/Sessions/Clients: تستدعي `ApiService.deleteData()` عند الحذف — لذا فإن `restore()` عليها، **إن أُريد أن تنعكس على الشيت أيضاً**، تحتاج استدعاء `syncRow()` مقابلاً (تحديث صريح على وحدة `deleteData` سابقاً)، وإلا فالشيت سيبقى "يظهر السجل كمحذوف" (منطقياً حسب آخر مزامنة) بينما هو مسترجَع محلياً — **تناقض بين المصدرين، جديد، وناتج مباشرة عن T-01 إن لم يُعالَج بوعي.**
- Tasks/Documents/Fees/Library/Templates/Children: أصلاً **لا تزامن الحذف على الإطلاق اليوم** (T-02) — لذا فإن `restore()` عليها لن تُحدِث أي تناقض جديد (لأن الشيت أصلاً غير متزامن مع حالة الحذف من البداية)، لكنها أيضاً لن "تصلح" شيئاً؛ الفجوة القائمة تبقى كما هي.

**التوصية لمرحلة 10.2:** `restore()` على مستوى `Repository`/`js/core` **لا تستدعي `ApiService` إطلاقاً** (تماماً كما لا يستدعيها `create`/`update`/`delete` القاعديان — استدعاء الـ API يحدث فقط من داخل دوال الـ Module: `saveCase()`/`deleteCase()`، وليس من `Repository.js` نفسها؛ هذا فصل طبقي (Repository لا يعرف بوجود ApiService) موجود ومُلتزَم به اليوم بالفعل). القرار بشأن **هل تستدعي `restoreCase()` المستقبلية (Module-level) دالة `ApiService.syncRow()` أم لا** هو قرار Module-level منفصل تماماً، خارج نطاق `restore()` نفسها على `Repository`، ويجب توثيقه صراحة في تقرير 10.2 كـ "Known Limitation" إن تُرك بلا مزامنة (اتساقاً مع مبدأ "Legacy Behavior: Document it... Never silently fix it" في Repository Migration Standard — بما أن T-02 عيب موروث أصلاً، وليس من اختصاص T-01 حله).

---

## 16. التأثير على `ApiService`

**صفر تأثير مباشر على كود `ApiService` نفسه.** كما في الإجابة 15، `ApiService` لا يُستدعى من `Repository.js` مطلقاً اليوم (فصل طبقي كامل: Repository لا "يعرف" ApiService). إضافة `restore()` إلى `Repository.js` **لا تتطلب أي تعديل على `js/api/api.js`** لا في التوقيعات ولا في المنطق. أي استدعاء لـ `ApiService` مرتبط بـ Restore (إن قُرِّر لاحقاً) سيحدث حصراً من داخل Module جديد (`restoreCase()` مثلاً)، باستخدام دالة `syncRow()` **الموجودة أصلاً بلا أي تعديل عليها** — لا حاجة لدالة `ApiService.restoreData()` جديدة.

---

## 17. التأثير على `Dashboard`

**صفر تأثير مباشر، بتأكيد مضاعف من القراءة الفعلية لـ `dashboard.js`.**

`dashboard.js` (80 سطر) يقرأ حصراً من `data.cases`/`data.sessions`/`data.clients`/`data.tasks` (المتغير العام `data`)، **ولا يستدعي أي Repository مطلقاً** (مؤكَّد بالقراءة المباشرة أعلاه، ومؤكَّد أيضاً في `Production_Readiness_Audit.md §2.6`: "`grep -n "Repository" js/modules/dashboard.js`... returns nothing"). بما أن `data.*` يُحدَّث فقط عبر `syncXMirror()` (الإجابة 14)، فإن `Dashboard` سيرى تلقائياً أي سجل مسترجَع **بمجرد** أن يستدعي الـ Module المعني `syncXMirror()` بعد `restore()` — تماماً كما يرى اليوم اختفاء أي سجل محذوف. **لا تعديل مطلوب على `dashboard.js` إطلاقاً.**

**ملاحظة دقة:** `renderDashboard()` تحسب `data.cases.length`/`active`/`todaySess`/... مباشرة من طول/فلترة `data.cases` — أي سجل مسترجَع سيُحتسَب تلقائياً في هذه الإحصاءات بمجرد ظهوره في `data.cases`، وهو السلوك الصحيح المرغوب (سؤال 18 التالي يفصّل هذا أكثر).

---

## 18. التأثير على Statistics (الإحصائيات)

**تأثير سلوكي إيجابي متوقّع وصحيح — لا يحتاج كوداً جديداً، لكنه يستحق توثيقاً حتى لا يُفسَّر كـ "Bug" لاحقاً.**

أي إحصائية مبنية على `data.x.length` أو فلاتر على `data.x` (كما في `renderDashboard()` أعلاه، وأي شاشة إحصائيات مشابهة في `cases.js`/`clients.js`) **سترتفع تلقائياً** فور استرجاع سجل، لأن `data.x` (بعد `syncXMirror()`) لن يعود يستثنيه. هذا **هو السلوك الصحيح المطلوب دلالياً**: سجل مسترجَع هو سجل "حي" من جديد بكل معنى الكلمة، ويجب أن يُحتسَب في كل مكان يُحتسَب فيه أي سجل حي آخر — لا استثناء خاص مطلوب. **التوصية الوحيدة:** ذكر هذه النقطة صراحة في `Migration Report` الخاص بـ 10.2 كنتيجة متوقعة (Expected Behavior)، حتى لا يُفهَم ارتفاع رقم في Dashboard بعد استرجاع سجل قديم كخلل في القراءة، أثناء أي اختبار Regression لاحق.

---

## 19. التأثير على Search

**تأثير مباشر ومقصود، مغطّى بالكامل بآلية موجودة فعلاً (`includeDeleted`) — لا تعديل مطلوب على محرك البحث نفسه.**

`_matchesSearch()` (Repository.js §4.6) تُطبَّق فقط على السجلات التي تجاوزت فلتر `includeDeleted` أصلاً في `_queryInternal()` (الترتيب: استبعاد المحذوف أولاً، ثم `filter`، ثم `search`، سطور 971-981). بمعنى: البحث النصي القياسي (كما تستخدمه كل شاشة اليوم بلا `includeDeleted`) **سيستمر في تجاهل السجلات المحذوفة تماماً كما هو الحال اليوم**، ولن "يتسرب" أي سجل محذوف إلى نتائج بحث عادية بعد إضافة `restore()` — لأن `restore()` لا تغيّر منطق البحث، فقط تغيّر قيمة `deletedAt` لسجل بعينه (فيخرج من كونه "محذوفاً" أصلاً، فيعود ليُطابَق بواسطة البحث العادي كأي سجل حي آخر). أما بحث شاشة Trash (سؤال 8/13) فهو استخدام صريح ومقصود لـ `includeDeleted:true`، منفصل تماماً عن البحث القياسي.

---

## 20. التأثير على Filters

**نفس منطق البحث تماماً (سؤال 19) — لا تعديل على `_matchesFilter()`/`_applyFilterOperator()` مطلوب.** الفلاتر تُطبَّق بعد استبعاد المحذوف (ما لم يُطلَب `includeDeleted` صراحة)، فأي فلتر Module قائم (حالة القضية، الأولوية، إلخ) يستمر بالعمل بلا تغيير على سجل مسترجَع فور ظهوره من جديد كسجل حي. الإضافة الوحيدة الممكنة مستقبلاً (اختيارية، لشاشة Trash فقط) هي فلتر صريح جديد **على مستوى الـ Module/UI** بالشكل `{deletedAt:{op:'ne', value:null}}` الموثَّق في `Restore_System_Design.md` §8 — وهذا استخدام لآلية فلترة موجودة أصلاً، وليس تعديلاً عليها.

---

## 21. التأثير على Pagination

**صفر تأثير.** `_queryInternal()` تحسب `total`/`hasMore`/`offset`/`limit` **بعد** استبعاد المحذوف (ما لم يُطلَب خلاف ذلك) — سطور 983-992: `total = items.length` يُحسَب من `items` بعد الفلترة الكاملة (استبعاد الحذف + filter + search)، ثم يُطبَّق `offset`/`limit` عليها. لذا، أي سجل مسترجَع سيُحتسَب ضمن `total` للصفحات القياسية تلقائياً (بصفته أصبح سجلاً حياً)، وأي Pagination على شاشة Trash نفسها (إن وُجدت) تعمل بنفس الآلية تماماً لكن على مجموعة `includeDeleted:true` المُصفّاة بـ `deletedAt != null`. لا حاجة لأي تغيير في منطق الـ Pagination.

---

## 22. التأثير على الأداء (Performance)

**تأثير مهمَل عملياً، وهو نفس نوع الأثر الذي تُحدثه أي `update()`/`delete()` أخرى — لا نوع جديد من العبء.**

`restore()` (بحسب التصميم في السؤال 1-3 من `Restore_System_Design.md`) عملية O(n) واحدة للعثور على السجل (`_indexOf`) + كتابة كاملة واحدة للمصفوفة (`_persist()`نفس ما تفعله `delete()`/`update()` اليوم بالضبط) — لا فرق في تعقيد الأداء عن أي عملية كتابة موجودة فعلاً. **الأثر غير المباشر الوحيد ذو الصلة (مرتبط بـ T-04، وليس بـ Restore نفسها):** بما أن Soft Delete أصلاً لا يزيل السجلات من `localStorage` (T-04 "Unbounded storage growth")، فإن وجود `restore()` **قد يُشجِّع فعلياً على تراكم أكبر** (لأن المستخدم يعرف الآن أن الحذف "قابل للتراجع"، فقد يحذف بلا قلق) — وهذا يزيد أهمية معالجة T-04 لاحقاً (تنظيف/أرشفة دورية)، لكنه لا يُغيّر تعقيد أداء `restore()` نفسها اليوم عند الأحجام الحالية للبيانات (عشرات إلى آلاف السجلات، كما وثّق T-05).

---

## 23. التأثير على Transactions

مُغطّى بالتفصيل في `Restore_System_Design.md §4` — الخلاصة: `restore()` كعملية مفردة لا تتفاعل مع `_locked` (بنفس غياب هذا الفحص في `create`/`update`/`delete` المفردة اليوم)، لكن دعم `{op:'restore', id}` **داخل** `transaction(ops[])` يتطلب تعديلاً فعلياً على `Repository.js` نفسها (إضافة فرع جديد في حلقة `transaction()`، سطور 1156-1224) — وهذا **التعديل الوحيد المطلوب فعلياً على `Repository.js` في هذا التصميم بأكمله**، ومُرخَّص صراحة لأن المهمة نفسها هي "أضف `restore()`" على هذا الملف بالذات.

---

## 24. التأثير على طبقة Cache المستقبلية

**لا تأثير اليوم (Cache غير موجودة أصلاً)، لكن ملاحظة تصميمية مهمة لمن يبني هذه الطبقة لاحقاً.**

`DatabaseService_Contract_V1.md §8` يوثّق `enableCache`/`disableCache`/`clearCache` كعقد مستقبلي بالكامل، غير مُنفَّذ في `DatabaseService.js` الحالي (Skeleton من 8 methods فقط، لا Cache). بما أن `Repository.js` نفسها أصلاً تحتفظ بنسخة كاملة في الذاكرة (`this._records`) كـ "single-source-of-truth" بعد `open()` (التعليق في السطر 266-268: "in-memory single-source-of-truth for this entity")، فإن أي طبقة Cache مستقبلية على مستوى `DatabaseService` (تخزين نتائج `read(entityKey)` مؤقتاً) **يجب أن تُبطَل (invalidate)** فور أي `write(entityKey, records)` ناجحة — وهذا ينطبق على `restore()` **بالضبط كما ينطبق على أي `create`/`update`/`delete` اليوم**؛ لا حاجة لمنطق إبطال Cache خاص بـ Restore وحدها، طالما أن أي طبقة Cache مستقبلية تُصمَّم لتُبطِل نفسها عند أي `write()` بغض النظر عن سبب الكتابة (وهذا هو التصميم الصحيح المتوقَّع أصلاً حسب طبيعة `write()` الحالية: "استبدال كامل للمصفوفة" لا "تحديث جزئي").

---

## 25. التأثير على طبقة IndexedDB المستقبلية

**لا تأثير اليوم، وهذا بالضبط الغرض التصميمي المعلَن لكل من `Repository.js` و`StorageAdapter.js`.**

كلا الملفين يوثّقان صراحة في رؤوسهما أن الهدف من فصل Repository عن Storage Adapter هو ضمان أن "storage-engine swap (localStorage → IndexedDB → SQLite) must never require editing this file" (`Repository.js` سطر 129-131، وتكرار مماثل في `StorageAdapter.js` سطر 20-24 و`DatabaseService.js` سطر 27-33). بما أن `restore()` — حسب التصميم في `Restore_System_Design.md` — تستخدم **فقط** `this._storage.write(entityKey, this._records)` عبر `_persist()` الموجودة أصلاً (بلا أي استدعاء جديد على الـ Storage Adapter)، فإن أي محرك تخزين مستقبلي (بما فيه IndexedDB) سيدعم `restore()` "مجاناً" بمجرد أنه يطبّق `read`/`write` بشكل صحيح على مستوى الكيان الكامل — تماماً كما يدعم `create`/`update`/`delete` اليوم بلا وعي بوجودها من الأساس. **هذا يؤكد أن `restore()` مصمَّمة بانسجام كامل مع القيد المعماري الأهم في المشروع (Design Constraint من `DatabaseService_Design_Report §3/§26`): تبديل محرك التخزين يجب ألا يتطلب لمس `Repository.js` (باستثناء إضافة `restore()` نفسها مرة واحدة اليوم) ولا `StorageAdapter.js` ولا أي Repository فرعي.**

---

## خلاصة تحليل الأثر (14–25)

| # | الطبقة | تعديل مطلوب؟ |
|---|---|---|
| 14 | Mirror Strategy | لا (استخدام `syncXMirror()` القائمة) |
| 15 | Google Sheets Sync | لا على `Repository`؛ قرار Module منفصل بشأن `syncRow()` |
| 16 | ApiService | لا إطلاقاً |
| 17 | Dashboard | لا إطلاقاً |
| 18 | Statistics | لا (سلوك صحيح تلقائي) |
| 19 | Search | لا (`includeDeleted` موجودة) |
| 20 | Filters | لا (`_matchesFilter` موجودة) |
| 21 | Pagination | لا |
| 22 | Performance | لا (نفس تعقيد `update`/`delete`) |
| 23 | Transactions | **نعم — الوحيد**: فرع `restore` داخل `transaction()` |
| 24 | Cache (مستقبلي) | لا (يُحل عبر invalidate-on-write عام) |
| 25 | IndexedDB (مستقبلي) | لا |

**النتيجة الإجمالية:** إضافة `restore()` هي **أصغر تغيير معماري ممكن** يحل T-01 بالكامل — تعديل فعلي واحد فقط على ملف واحد (`Repository.js`: إضافة method جديدة + فرع جديد داخل `transaction()`)، بلا أي تعديل على `DatabaseService.js`، `StorageAdapter.js`، `LocalStorageAdapter.js`، أياً من الـ 9 Repositories، `ApiService`، أو `Dashboard`/`Calendar`/`Print`. هذا يطابق تماماً مبدأ "Smallest safe change / Minimal diff / Maximum compatibility" (Repository Migration Standard).

**تابع في:** `Restore_System_Migration_Plan.md` (خطة التنفيذ المرحلية لـ SUB-PHASE 10.2 وما بعدها).
