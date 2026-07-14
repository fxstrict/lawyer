# Restore_System_Design.md
## PHASE 10 — SUB-PHASE 10.1 — Restore Architecture Design (T-01)
### Audit + Design Only — لا كود، لا Patch، لا Diff، لا تنفيذ

---

## 0. منهجية القراءة (Evidence Base)

تم قراءة كل الملفات التالية بالكامل قبل كتابة أي سطر في هذا التقرير، ولم يُعدَّل أي منها:

- `js/core/Repository.js` (1275 سطر) — القاعدة المشتركة لكل الـ Repositories.
- `js/core/DatabaseService.js` (274 سطر) — Skeleton يفوّض 8 methods فقط (open/close/destroy/read/write/delete/clear/exists) لا شيء غيرها.
- `js/core/StorageAdapter.js` — الواجهة المجردة (نفس الـ 8 methods)، مع `NotImplementedError`.
- `js/core/LocalStorageAdapter.js` — التطبيق الفعلي الوحيد المستخدم اليوم.
- كل ملفات `js/repositories/*.js` التسعة (Cases, Clients, Children, Sessions, Tasks, Fees, Documents, Library, Templates).
- `docs/Technical_Debt_Report.md` §T-01، §T-04.
- `docs/Production_Readiness_Audit.md` §2.2 (Repository Layer)، §2.6 (Mirror Strategy).
- `docs/Repository_Contract_Report_PHASE2_V10.md` (القسم المطابق لـ "Repository_Contract_Report.md" المذكور في التعليمات).
- `docs/DatabaseService_Contract_V1.md` (القسم المطابق لـ "DatabaseService_Contract.md")، خصوصاً §12 Events.
- `docs/Repository_Migration_Standard` (Skill).

**حقيقة تأسيسية محورية (Grounding Fact) يعتمد عليها كل تصميم لاحق:**
`Repository.js` **لا يحتوي اليوم على أي نظام Events على الإطلاق**. الـ Hooks الوحيدة الموجودة هي `_beforeTransaction` / `_afterCommit` / `_onRollback`، وهي خاصة بـ `transaction()` فقط ولا تُطلَق من `create()`/`update()`/`delete()`. أي حديث عن `beforeWrite`/`afterWrite` هو حصراً من `DatabaseService_Contract_V1.md` §12 — وهو **عقد مستقبلي موثَّق، غير مُنفَّذ بعد** حتى على مستوى `DatabaseService.js` نفسه (الذي ما زال Skeleton من 8 methods فقط، PHASE 8.4.1)، وليس موجوداً إطلاقاً على مستوى `Repository.js`. هذا التمييز حاسم للإجابة على السؤال 5 أدناه.

---

## 1. كيف سيتم إضافة `restore(id)` داخل Repository؟

`restore(id)` يُضاف كـ **method تاسع عشر تقريباً** على `Repository.prototype`، بنفس الأسلوب المعماري الحرفي لكل method كتابة موجود حالياً (`create`/`update`/`delete`)، وليس كملف أو طبقة منفصلة. الشكل المقترح للسلوك (توصيف سلوكي، وليس كوداً):

- **المدخل:** `id` (نفس مفهوم الـ id في `delete(id)` — يُترجَم عبر `_indexOf(id)` الموجودة فعلاً).
- **الحارس الأول:** `_guardSupported('restore')` — بنفس نمط كل method آخر، بحيث يمكن لأي Repository مستقبلي تعطيل `restore` عبر `unsupportedOperations` تماماً كما يُعطَّل `create`/`update`/`delete` اليوم (مثال مستقبلي: Repository للسجلات غير القابلة للحذف أصلاً).
- **الحارس الثاني:** `_guardReady()` — نفس حارس كل عملية كتابة أخرى.
- **منطق العثور على السجل:** يستخدم `_indexOf(id)` **كما هي بدون تعديل** — وهذه نقطة تصميمية مهمة: `_indexOf()` لا تستثني السجلات المحذوفة (Technical_Debt_Report §T-01، الدليل الثالث)، لذا فهي بالفعل قادرة على العثور على سجل `deletedAt != null`. هذا يعني أن `restore()` **لا يحتاج أي تعديل على `_indexOf()`** — الثغرة الموثقة في التقرير ليست خطأ يجب إصلاحه، بل هي بالضبط الآلية التي سيُبنى عليها `restore()` رسمياً بدل استغلالها بشكل غير موثَّق.
- **حالة الخطأ:** إذا لم يوجد سجل بهذا الـ `id` إطلاقاً (لا حي ولا محذوف) → نفس شكل الخطأ في `update()`/`delete()` اليوم: `ValidationError` غير قابل للاسترجاع (`recoverable:false`).
- **حالة "السجل غير محذوف أصلاً":** يجب أن تُعامَل كحالة صريحة وليس نجاحاً صامتاً وليس فشلاً قاسياً. التوصية: **نجاح idempotent** — استدعاء `restore()` على سجل حي بالفعل (`deletedAt == null`) يُعيد `WriteResult` ناجحاً بنفس السجل دون أي كتابة فعلية (لا `_persist()` تُستدعى)، لأن هذا يطابق مبدأ "smallest safe change" ولا يخلق حالة خطأ من فعل غير ضار.

---

## 2. هل ستكون `Repository.prototype.restore()` أم `SoftDeleteRepository.prototype.restore()`؟

**التوصية: `Repository.prototype.restore()` مباشرة على القاعدة الحالية — وليس كلاس فرعي جديد `SoftDeleteRepository`.**

**الأسباب المستندة إلى الكود الفعلي:**

1. **لا يوجد تمايز طبقي بين "Repository عادي" و"Repository بـ Soft Delete" في التصميم الحالي أصلاً.** `_softDelete` هو مجرد `boolean` على نفس الكلاس (`this._softDelete = config.softDelete !== false;` — Repository.js سطر 260)، وليس نوعاً فرعياً. كل الـ 9 Repositories الحالية تمرر `softDelete: true` كـ config فقط، دون أي وراثة إضافية (`Production_Readiness_Audit.md` §2.2: "No entity Repository overrides or shadows a base method"). إدخال `SoftDeleteRepository` كطبقة وسيطة الآن يكسر هذا التماثل المعماري بلا داعٍ لأن كل الـ 9 Repositories ستحتاج تغيير سلسلة الوراثة الخاصة بها (تعديل خارج نطاق ملف واحد، يخالف Repository Migration Standard "Migration Scope").
2. **`restore()` هو ببساطة الوجه المعاكس لـ `delete()` الموجودة أصلاً على القاعدة نفسها.** `delete()` تتحقق داخلياً من `this._softDelete` وتتفرّع (سطر 721: `if (this._softDelete) {...} else {...}`). بنفس المنطق، `restore()` تتحقق داخلياً: إن كانت `this._softDelete === false` (Repository بلا soft delete أصلاً)، فإن `restore()` تُغلَق فوراً كـ `UnsupportedOperationError` عبر `_guardSupported`، لأن مفهوم "استرجاع" لا معنى له على سجل حُذف نهائياً (hard-deleted) — وهذا يُدار عبر config (`unsupportedOperations` أو فحص داخلي `this._softDelete`)، وليس عبر كلاس منفصل.
3. **لا حاجة عملية اليوم لكلاس فرعي:** كل الـ 9 Repositories الحالية `softDelete: true` (100%). كلاس فرعي منفصل يخدم فرضية مستقبلية (Repository بلا soft delete) لا وجود لها اليوم، وإضافته الآن مخالفة لمبدأ "Behavior parity first, Architecture consistency second, Optimization last" (Repository Migration Standard، "Engineering Principles").

**الخلاصة:** `restore()` يُضاف كـ prototype method واحد على `Repository` نفسها، بجانب `delete()` مباشرة في نفس القسم (§5 CRUD Interface)، مع فحص داخلي على `this._softDelete` تماماً كما يفعل `delete()` اليوم.

---

## 3. هل `restore()` سيستخدم `update()` أم سيعدل مباشرة؟

**التوصية: تعديل مباشر على `_records[idx]`، بنفس نمط `delete()` — وليس استدعاء داخلي لـ `this.update()`.**

**السبب:** `update(id, patch)` الحالية (سطر 655) تستدعي `_indexOf(id)` ثم **لا تتحقق من `_isDeleted()`** أيضاً (نفس الثغرة/الميزة الموجودة في `_indexOf`) — لذا تقنياً `this.update(id, {deletedAt: null})` كانت ستعمل (وهذا بالضبط ما وثّقه `Technical_Debt_Report.md §T-01` كاستغلال غير موثَّق). لكن إعادة استخدام `update()` داخلياً لتنفيذ `restore()` تُدخل مشكلتين:

1. `update()` تمر عبر `this._validate('update', merged)` (سطر 672) — وهذا **hook قد يحتوي على قواعد عمل خاصة بكل Entity** (مثلاً تحقق من حقول مطلوبة). استدعاء الـ validation الكامل فقط لأجل مسح `deletedAt` هو عبء غير ضروري وقد يرفض عملية استرجاع مشروعة لأسباب لا علاقة لها بالاسترجاع (مثال افتراضي: لو Repository مستقبلي أضاف قاعدة "لا يمكن update سجل تاريخه أقدم من كذا").
2. `update()` تزيد `version` (سطر 382: `record.version = (... ) + 1`) — وهذا سلوك **صحيح ومطلوب لـ restore أيضاً** (كل تغيير على السجل يجب أن يزيد النسخة)، لكن الأصح تصميمياً أن يمر هذا عبر نفس `_attachMetadata(record, 'update')` **مباشرة**، وليس عبر `update()` كواجهة عامة، تماماً كما تفعل `delete()` الحالية بالضبط (سطر 724: `this._attachMetadata(softDeleted, 'update');`).

لذلك: `restore()` تبني نسخة معدَّلة من السجل (`Object.assign({}, existing)` ثم `restored.deletedAt = null`)، تستدعي `this._attachMetadata(restored, 'update')` مباشرة (بنفس استدعاء `delete()` الحرفي)، ثم تكتب `this._records[idx] = restored` وتستدعي `this._persist()` — **نفس الهيكل الحرفي لـ `delete()` مقلوباً**، وليس مروراً عبر `update()` العامة. هذا يحافظ على التماثل البنيوي (`delete()`/`restore()` أخوان بنفس الشكل)، ولا يُحمّل `restore()` أي قواعد validation غير متعلقة بالاسترجاع، ويطابق مبدأ الوثيقة الأصلية "restore يجب أن يكون متماثلاً (symmetric) مع delete" (Technical_Debt_Report §T-01، "Estimated effort").

**ملاحظة مهمة:** هل يجب أن يمر `restore()` عبر `_validate()` بأي شكل؟ التوصية: **لا** بشكل افتراضي — تماماً كما أن `delete()` الحالية لا تستدعي `_validate('delete', ...)` إطلاقاً اليوم (تأكيد بالقراءة: لا يوجد `_validate` داخل `delete()` سطر 704-742). التماثل يقتضي أن `restore()` تتبع نفس الغياب.

---

## 4. هل `restore()` سيحترم Transactions؟

نعم — بمعنيين منفصلين يجب التفريق بينهما بدقة:

**أ) `restore()` كعملية مفردة تحترم قفل الـ Transaction الحالي (`this._locked`):**
لا حاجة لإضافة أي فحص جديد صراحة، لأن `restore()` — مثل `create`/`update`/`delete` المفردة اليوم — **لا تفحص `this._locked` أصلاً** (فقط `transaction()` نفسها تفحصه، سطر 1136). هذا يطابق التصميم الحالي بدقة: العمليات المفردة (`create`/`update`/`delete`) ليست محمية من التداخل مع transaction جارٍ عبر قفل صريح على مستواها الخاص — الافتراض المعماري القائم هو أن الكود المستدعي (Module) لا يستدعي عمليتين متزامنتين على نفس الـ Repository. `restore()` يجب أن تتبع **نفس هذا الافتراض تماماً بلا انحراف** (behavior parity)، لا أكثر ولا أقل.

**ب) `restore()` كـ `op` جديد داخل `transaction(ops[])`:**
هذا هو الامتداد الحقيقي المطلوب. `transaction()` الحالية (سطر 1132) تدعم فقط 3 أنواع عمليات: `{op:'create'}`, `{op:'update'}`, `{op:'delete'}` (سطر 1157-1223)، وأي `op` آخر يُرفض بـ `ValidationError: "unknown op"` (سطر 1218). لإضافة `{op:'restore', id:string}` **يجب تعديل `transaction()` نفسها** — وهذا **خارج نطاق ملف Repository واحد بمعنى "لا نلمس Core"، بل هو بالتحديد تعديل على `Repository.js` (Core) نفسه**، الذي يوثِّق التقرير أنه Read-Only في هذه المرحلة (10.1) لكنه بالضبط الملف الذي يجب تعديله في 10.2 التنفيذية (Repository_Migration_Standard يمنع تعديل Core **إلا إذا سمحت المهمة صراحة** — وإضافة `restore()` نفسها هي بالتحديد ترخيص صريح لتعديل هذا الملف تحديداً، وليس أي ملف آخر).

المنطق المقترح لفرع `op === 'restore'` داخل `transaction()` (توصيف سلوكي فقط):
- يجد السجل بنفس منطق فرع `delete` (`working.findIndex`)، لكن **بدون** الشرط الحالي الذي يفحص "غير موجود" فقط — يحتاج أيضاً فحصاً منطقياً اختيارياً: هل هو أصلاً محذوف؟ (نفس منطق idempotency في السؤال 1).
- يبني `restored = Object.assign({}, working[idx]); restored.deletedAt = null;`
- يستدعي `_attachMetadata(restored, 'update')` (**وليس** `_validate()`، اتساقاً مع الإجابة 3).
- يضعه في `working[idx]` ويضيف `WriteResult` ناجحاً لمصفوفة `results`.

بهذا، عملية مركّبة مثل *"استرجاع قضية + استرجاع كل الجلسات المرتبطة بها دفعة واحدة"* تصبح ممكنة عبر `transaction()` واحدة على نفس الـ Repository (تذكير: `transaction()` هنا Repository واحد فقط، لا عبر عدة Repositories — هذا قيد موثَّق أصلاً في `transaction()` الحالية، سطر 1116: "no cross-Repository transactions here").

---

## 5. هل `restore()` سيطلق Events: `beforeRestore`/`afterRestore` أم `beforeWrite`/`afterWrite`؟

**الإجابة الدقيقة: لا شيء من الاثنين — لأن أياً منهما غير موجود اليوم في `Repository.js` على الإطلاق.**

كما وُثِّق في §0 أعلاه: `Repository.js` الحالي **لا يملك أي نظام Events عام** (`emit`/`on`/`dispatchEvent` — بحث شامل لم يُظهر أي نتيجة). الـ Hooks الوحيدة الموجودة هي الثلاثة الخاصة بـ `transaction()` فقط: `_beforeTransaction`، `_afterCommit`، `_onRollback` (سطور 538-544)، وهي `no-op` افتراضياً معدّة للـ override من كلاس فرعي، **وليست** أحداثاً عامة (Event Bus) بمعنى `on(eventName, listener)`.

أما `beforeWrite`/`afterWrite`/`beforeDelete`/`afterDelete` فهي موثَّقة **حصراً** في `DatabaseService_Contract_V1.md` §12، وهو **عقد لطبقة `DatabaseService` المستقبلية** (ليس `Repository`)، وحتى على مستوى `DatabaseService`، غير مُنفَّذ بعد — `DatabaseService.js` الحالي Skeleton من 8 methods توكيلية فقط (لا Events، لا Cache، لا Transactions — موثَّق صراحة في رأس الملف سطر 59-64: "It does NOT... no Events"). كذلك، هذه الأحداث في العقد المستقبلي مرتبطة صراحة بـ `write()`/`bulkWrite()`/`commit()` و `delete()`/`bulkDelete()` **على مستوى `storeName, key`**، وهو شكل توقيع مختلف تماماً عن شكل `Repository`'s الحالي (`entityKey` على مستوى المصفوفة الكاملة، لا سجل مفرد).

**التوصية للمرحلة 10.2 (التنفيذ):**
- **لا تُضاف أي Events مع `restore()` في هذه المرحلة.** إضافة Event Bus كامل إلى `Repository.js` تغيير معماري أكبر بكثير من نطاق "إضافة `restore()`"، ويحتاج قراراً منفصلاً (وربما مرحلة مستقلة لاحقة، لأنه سيؤثر على كل الـ 9 Repositories دفعة واحدة، لا Repository واحدة).
- `restore()` تسلك تماماً مسلك `delete()` اليوم: **بلا أي Event على الإطلاق** — فقط قيمة إرجاع `WriteResult` تُعلِم المستدعي (Module) بالنجاح/الفشل بشكل متزامن (نفس نمط `create`/`update`/`delete` الحالي).
- **إذا** قرر فريق الهندسة مستقبلاً إضافة Events عامة إلى `Repository.js` (توسعة تسبق أو تلي `DatabaseService_Contract_V1.md §12`)، فالتسمية الأصح معمارياً حينها ستكون `beforeRestore`/`afterRestore` مخصصة (وليس إعادة استخدام `beforeWrite`/`afterWrite`)، لأن Contract §12 نفسه يُعرّف `afterWrite` كنقطة تكامل لـ `SyncQueue` بمعنى "تمت كتابة سجل جديد/معدَّل بحاجة لمزامنة" — بينما استرجاع سجل موجود أصلاً هو حدث دلالي مختلف (undelete) يفيد مستهلكين مختلفين (مثال: تنبيه UI "تم استرجاع القضية X" مقابل "تمت مزامنة تغيير"). لكن هذا **قرار مستقبلي مؤجل بالكامل**، غير مطلوب لتنفيذ T-01.

---

## 6. هل `restore()` سيعيد `deletedAt=null` فقط أم `deletedBy` أيضاً؟

**`deletedAt=null` فقط. لا يوجد حقل `deletedBy` في أي مكان بالمشروع اليوم.**

تدقيق `Data_Schema_Specification_Report_PHASE4_V10.md` (§3.9/§3.10، كتلة الـ Metadata الثابتة) يؤكد أن كتلة الـ Audit الرسمية الوحيدة المعتمدة اليوم هي بالضبط:
```
{ createdAt, updatedAt, deletedAt, version, syncVersion, checksum }
```
لا يوجد `deletedBy`، ولا `createdBy`، ولا أي حقل "مستخدم منفّذ" في أي مكان بالـ Schema الحالي — والسبب البنيوي الأعمق: **النظام كله لا يملك مفهوم "مستخدم مسجَّل دخول" (Multi-user/Auth) في نطاقه الحالي أصلاً** (لا `currentUser`، لا Session-based auth ظاهرة في أي من الملفات المقروءة). إضافة `deletedBy` الآن تفترض وجود هوية مستخدم لا مصدر بيانات لها.

**لذلك:**
- `restore()` تعيد `deletedAt = null` حصراً — هذا يكفي تماماً ليعامله `_isDeleted()` (سطر 568: `return this._softDelete && record && record.deletedAt != null;`) كسجل حي مجدداً، وهذا كل ما يلزم لإخراجه من الاستثناء في `getAll()`/`get()`/`search()`.
- `updatedAt` و`version` يُحدَّثان تلقائياً عبر `_attachMetadata(restored, 'update')` (كما في الإجابة 3) — وهذا يكفي كـ "أثر تدقيقي زمني" (متى حدث الاسترجاع) دون حاجة لحقل جديد.
- **لا يُضاف أي حقل `deletedBy`/`restoredBy`/`restoredAt` في هذه المرحلة.** إن احتاج المشروع مستقبلاً تتبع "من حذف/استرجع" فهذا توسعة Schema منفصلة تماماً (تغيير في `Data_Schema_Specification_Report`) تسبق أي تنفيذ لـ `restore()`، وليست جزءاً من حل T-01 الحالي — وإدخالها الآن تحت غطاء "تنفيذ Restore" يخالف مبدأ "Never redesign business logic. Never optimize behavior... unless explicitly requested" (Repository Migration Standard).

---

## 7. هل يوجد `restoreAll()`؟

**لا — ليس في هذه المرحلة (10.2)، لكنه امتداد منطقي محجوز لمرحلة لاحقة اختيارية، وليس ضرورة فورية.**

**السبب المستند لواقع الكود:** لاحظ التماثل مع `bulkDelete(ids[])` الموجودة فعلاً (سطر 925) — وهي بالفعل **جماعية بمعرّفات محددة**، وليست "احذف كل شيء". المكافئ المباشر والمتماثل معمارياً هو `bulkRestore(ids[])` (بجانب `bulkInsert`/`bulkUpdate`/`bulkDelete` الحالية)، **وليس** `restoreAll()` بمعنى "استرجع كل السجلات المحذوفة في هذا الـ Entity دفعة واحدة" — لأن هذا الأخير عملية أخطر (استرجاع جماعي غير انتقائي) لا يوجد نظير مباشر لها في التصميم الحالي (`bulkDelete` نفسها تتطلب قائمة `ids` صريحة من المستدعي، لا "احذف الكل").

**التوصية الدقيقة:**
- **10.2 (هذه المرحلة القادمة):** `restore(id)` المفردة فقط — أصغر تغيير آمن يحل T-01 مباشرة (Cases وClients، كما أوصى `Technical_Debt_Report §T-01` "Estimated effort").
- **مرحلة لاحقة اختيارية (بعد إثبات `restore(id)` في الإنتاج):** `bulkRestore(ids[])` بنفس نمط `bulkDelete` تماماً (input/output shape متطابق: `Array<{id}> -> Array<WriteResult>`)، إن احتاجت واجهة "سلة المهملات" (Trash UI، سؤال 13) خياراً لاسترجاع عدة عناصر مختارة دفعة واحدة.
- **`restoreAll()` بمعنى "الكل بلا انتقاء" غير مُوصى به إطلاقاً** كـ Repository-level primitive — لو احتاجته واجهة Trash مستقبلاً، الأصح تنفيذه على مستوى الـ Module/UI كحلقة تستدعي `bulkRestore(allDeletedIds)` بعد جلب القائمة عبر `getAll({includeDeleted:true})` والتصفية على `deletedAt != null` (سؤال 8) — لا كـ method جديدة في `Repository.js` تخفي عملية "استرجاع الكل" الخطيرة خلف اسم واحد بلا تأكيد صريح من المستخدم لكل عنصر.

---

## 8. هل `search()` و`getAll()` سيدعمان `includeDeleted`/`restoreMode`؟

**`includeDeleted` — نعم، وهو موجود ومطبَّق بالفعل اليوم على كلا الـ methods. لا حاجة لأي تعديل.**

تدقيق مباشر يؤكد:
- `getAll(options)` (سطر 768): تدعم `options.includeDeleted` بالفعل — `var includeDeleted = !!(options && options.includeDeleted);` ثم تُستخدم في الفلترة (سطر 774).
- `search(queryModel)` → `_queryInternal(queryModel)` (سطر 969): تدعم `queryModel.includeDeleted` بالفعل — نفس الآلية بالضبط (سطر 971).
- `get(id)` (سطر 751): **لا** تدعم `includeDeleted` اليوم — دائماً تعيد `null` لأي سجل `_isDeleted()`، بلا استثناء (سطر 757). هذه نقطة يجب الانتباه لها: أي شاشة "معاينة سجل قبل الاسترجاع" (سؤال 13) **لا يمكنها استخدام `get(id)` مباشرة** لعرض بيانات سجل محذوف — يجب أن تمر عبر `getAll({includeDeleted:true})` ثم تصفية بـ `id`، أو عبر `search({includeDeleted:true, filter:{...}})`.

**`restoreMode` — غير موجود، وغير مُوصى بإضافته كخيار على `getAll()`/`search()`.**

لا حاجة لمفهوم "restoreMode" منفصل عن `includeDeleted` الموجود. الحالات الثلاث المطلوبة لأي واجهة Trash تُغطى بالكامل بما هو موجود فعلاً + فلتر بسيط على `deletedAt` عبر آلية الفلترة العامة الموجودة (`_matchesFilter`، سؤال §4.5 في Repository.js):
1. **"السجلات الحية فقط" (الافتراضي في كل الشاشات الحالية):** `getAll()` بلا خيارات، أو `search({})` — سلوك اليوم بلا تغيير.
2. **"سلة المهملات — المحذوفة فقط":** `search({includeDeleted:true, filter:{deletedAt:{op:'ne', value:null}}})` — ممكن **اليوم بالفعل** بمحرك الفلترة الموجود (`_applyFilterOperator` تدعم `'ne'` سطر 471) بلا أي تعديل على `Repository.js` إطلاقاً.
3. **"كل شيء (حي + محذوف) لأغراض تقنية/Export":** `getAll({includeDeleted:true})` أو `search({includeDeleted:true})` — موجود اليوم أيضاً (هذا بالضبط ما تفعله `export()` الحالية، سطر 1032).

**الخلاصة:** لا حاجة لإضافة `restoreMode` كمفهوم جديد. المتطلب بالكامل مغطّى بـ `includeDeleted` (موجود) + الفلترة العامة (موجودة). التوصية الوحيدة العملية: توثيق نمط الاستعلام رقم 2 أعلاه (`filter:{deletedAt:{op:'ne', value:null}}`) كـ "الطريقة الرسمية لجلب سلة المهملات" في تقرير 10.2، حتى لا يُعاد اختراعها بأشكال مختلفة في كل Module.

---

## 9. هل يحتاج `DatabaseService` لأي تعديل؟

**لا — إطلاقاً، وهذه نتيجة مؤكدة وليست تقديراً.**

`DatabaseService.js` الحالي يوكِّل فقط 8 methods (`open/close/destroy/read/write/delete/clear/exists`) بشكل توكيل حرفي أعمى (`return this._adapter.<method>(...)`) على مستوى **الكيان الكامل** (`entityKey` → كل المصفوفة)، وليس على مستوى سجل مفرد. `Repository.js` (وبالتالي `restore()` المستقبلية) **لا يستدعي `DatabaseService` مباشرة على الإطلاق** — بل يستدعي `this._storage` (اسم عام لأي Storage Adapter مُحقَن)، وحقيقة أن هذا الكائن *قد يكون* `DatabaseService` لاحقاً لا تغيّر شيئاً: `restore()` تستخدم فقط `this._storage.write(entityKey, this._records)` عبر `_persist()` الموجودة أصلاً (سطر 575-585) — **نفس بالضبط** ما تستخدمه `delete()`/`update()`/`create()` اليوم. لا استدعاء جديد، لا method جديدة على `DatabaseService`، لا تغيير في التوقيع.

---

## 10. هل يحتاج `LocalStorageAdapter` لأي تعديل؟

**لا — لنفس السبب بالضبط.** `LocalStorageAdapter` يطبّق فقط `read(entityKey)`/`write(entityKey, records)` (ضمن الـ 8 methods) على مستوى المصفوفة الكاملة. `restore()` — تماماً كـ `delete()` (soft) اليوم — تُحدِّث `this._records` في الذاكرة ثم تستدعي `write()` بالمصفوفة الكاملة المعدَّلة. الـ Adapter لا "يعرف" ولا يحتاج أن يعرف أن سجلاً بعينه استُرجع — هو فقط يستقبل مصفوفة JSON كاملة ويكتبها، تماماً كما يفعل مع أي `create`/`update`/`delete` اليوم.

---

## 11. هل تحتاج الـ Repositories التسعة لأي تعديل؟

**لا تعديل وظيفي مطلوب — لأن `restore()` تُورَث تلقائياً من `Repository.prototype` فور إضافتها هناك، تماماً كما ورثت كل الـ 9 Repositories الحالية `create`/`update`/`delete`/`getAll`/... بلا أي override (مؤكَّد في `Production_Readiness_Audit.md §2.2`: "No entity Repository overrides or shadows a base method").**

الاستثناء الوحيد المحتمل (اختياري، غير إلزامي): إن أراد Repository معيّن سلوك استرجاع مختلفاً منطقياً (مثال افتراضي: `Dashboard`-type repository إن وُجد مستقبلاً بـ `unsupportedOperations` تشمل الكتابة أصلاً) — عندها يُضاف `'restore'` إلى قائمة `unsupportedOperations` الموجودة أصلاً في constructor config الخاصة به (سطر config موجود فعلاً في كل ملف Repository، مثال: `CasesRepository.js:280`)، وهو **تعديل بقيمة config واحدة فقط، بلا لمس أي منطق**، وحتى هذا غير مطلوب اليوم لأن كل الـ 9 الحالية `unsupportedOperations: []` (فارغة) ومصممة جميعها لتكون قابلة للحذف/الاسترجاع.

---

## 12. هل تحتاج الـ Modules لأي تعديل؟

**لا تعديل إلزامي لتشغيل T-01 من الناحية التقنية البحتة — لكن تعديل اختياري (Additive) مطلوب فعلياً لجعل `restore()` "قابلة للاستخدام" من واجهة المستخدم.**

يجب التفريق بدقة بين مستويين:

**أ) المستوى التقني (Repository ↔ Module الحالي):** بما أن كل الـ Modules التسعة تستخدم بالفعل نمط `xRepositoryReadyPromise` + `syncXMirror()` بعد كل كتابة ناجحة (`Production_Readiness_Audit.md §2.3`)، فإن استدعاء `restore()` من أي Module **لن يكسر شيئاً** إن أُضيف — لأنه write operation عادية تتبع نفس العقد (`WriteResult`) الذي تتعامل معه دوال `save*`/`delete*` الحالية بالفعل. لا حاجة لتغيير `resolveXIndex()`/index-translation الموجودة، لأن `restore(id)` تأخذ `id` مباشرة (نفس ما يفعله `delete(id)` اليوم بعد ترجمة index→record→id الموجودة أصلاً في كل Module).

**ب) المستوى الوظيفي (واجهة UI):** **لا يوجد اليوم أي زر/إجراء "استرجاع" في أي Module** (لا HTML، لا `onclick`). لتفعيل T-01 فعلياً للمستخدم النهائي (لا فقط توفير الـ API)، لا بد من دالة جديدة *مضافة* بنمط الدوال الحالية تماماً (مثال بنمط `deleteCase(idx)` الموجودة اليوم): دالة مثل `restoreCase(id)` تستدعي `casesRepository.restore(id)` ثم `syncCasesMirror()` ثم `toast()` — وهذا **إضافة (Additive) لدالة جديدة**، وليس تعديلاً على أي دالة أو منطق موجود، وبالتالي لا يخالف "Migration Scope" (الذي يمنع **تعديل** منطق قائم، لا **إضافة** منطق جديد صريح المطلوب). هذا هو نطاق SUB-PHASE منفصلة لاحقة (مقترحة في خطة الهجرة أدناه)، وليس جزءاً من 10.2 نفسها (التي تُنفِّذ `restore()` على مستوى Repository فقط، حسب توجيه هذه المرحلة).

---

## 13. كيف ستكون واجهة المستخدم مستقبلاً (Trash / Recycle Bin / Restore / Restore All / Permanent Delete)؟

هذا القسم **تصميم مفاهيمي (Concept) فقط**، غير مطلوب تنفيذه في 10.2:

- **Trash / سلة المهملات:** شاشة جديدة إضافية (لكل Entity رئيسي، تبدأ بـ Cases وClients حسب أولوية `Technical_Debt_Report §T-01`) تعرض نتيجة `search({includeDeleted:true, filter:{deletedAt:{op:'ne', value:null}}})` (نمط الاستعلام الموثَّق في السؤال 8) بدل الشاشة الرئيسية العادية.
- **Restore (زر لكل عنصر):** يستدعي `restoreCase(id)`/المكافئ (سؤال 12-ب) لعنصر واحد، يُنقل السجل فوراً خارج شاشة Trash وإلى الشاشة الرئيسية.
- **Restore All (اختياري، لاحق):** زر جماعي يستدعي `bulkRestore(ids[])` (سؤال 7) على كل العناصر المعروضة حالياً في Trash (وليس بالضرورة "كل المحذوف في تاريخ النظام" — يُقيَّد بما هو ظاهر/مُنتقى في الشاشة لتفادي مفاجأة استرجاع جماعي غير مقصود).
- **Permanent Delete / حذف نهائي:** هذا **خارج نطاق T-01 بالكامل** — T-01 يعالج فقط "الاسترجاع"، وليس "التطهير النهائي" (ذلك مرتبط بـ T-04، "Unbounded storage growth"، وهو Technical Debt منفصل بأولوية أقل حالياً حسب `Technical_Debt_Report`). أي زر "حذف نهائي" يحتاج method جديدة تماماً (`purge(id)` أو استدعاء صريح لمسار hard-delete غير موجود اليوم على `_softDelete:true` Repositories)، ويجب أن يُصمَّم في مرحلة منفصلة تالياً لهذه (تُذكر فقط في خطة الهجرة كملاحظة مستقبلية، لا كالتزام).

**ترتيب الأولوية المقترح لواجهات UI (إن وُسِّع النطاق لاحقاً):** Cases و Clients أولاً (أعلى قيمة حسب `Technical_Debt_Report §T-01`: "Estimated effort... at least the highest-value modules")، ثم بقية الـ 7 Entities بنفس النمط الموحّد.

---

## خلاصة القسم

كل الإجابات أعلاه (1–13) تُبنى **حصراً** على السلوك الموثَّق فعلياً في `Repository.js`/`DatabaseService.js`/`StorageAdapter.js`/`LocalStorageAdapter.js` وملفات الـ Repositories التسعة كما هي اليوم، دون أي افتراض خارج هذه الملفات. لا كود جُرِّب أو كُتب. لا Patch. لا Diff.

**تابع في:** `Restore_System_Architecture.md` (تأثير T-01 على Mirror/Sync/ApiService/Dashboard/Search/Filters/Pagination/Performance/Transactions/Cache/IndexedDB — الأسئلة 14–25).
