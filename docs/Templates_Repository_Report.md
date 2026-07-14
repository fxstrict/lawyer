# Templates_Repository_Report.md
## V10 Offline-First Architecture — PHASE 5 / SUB-PHASE 5.10.2 — Templates Repository

**تاريخ:** 2026-07-05
**يلي مباشرة:** PHASE 5 / SUB-PHASE 5.10.1 — Templates Repository Audit (READ-ONLY، مُنتَج في هذه المحادثة).
**الملف المُنتَج:** `js/repositories/TemplatesRepository.js` (630 سطراً).
**Harness التحقق:** `js/tests/verify_templates_repository.js` — **55/55** فحصاً ناجحاً (الحد الأدنى المطلوب: 45).

---

## 1. Input Gap

| # | الفجوة | التفصيل |
|---|---|---|
| 1 | **تسلسل المشروع** | الأرشيف المُدقَّق في 5.10.1 ينتهي عند SUB-PHASE 5.8 (Documents) في `PROJECT_STATE.md`/`NEXT_PHASE.md`. **لا يوجد** `LibraryRepository.js` في الأرشيف، رغم أن `NEXT_PHASE.md` وترتيب الترحيل الموثَّق في كلا التقريرين التخطيطيين يضعان **Library قبل Templates**. لم يُحسَم هذا الملف هذه الفجوة — Templates مستقل تماماً عن Library (لا اعتماد بينهما في أي مصدر)، فبناؤه لا يتطلب انتظار Library، لكن يجب بناء LibraryRepository.js في مرحلة لاحقة لتصحيح تسلسل التوثيق. |
| 2 | **خطأ في السبب الموثَّق لتعطيل المزامنة** | كلا `Data_Schema_Specification_Report_PHASE4_V10.md §4.9` و`Repository_Contract_Report_PHASE2_V10.md §4.9` يذكران "لا Sheet مقابل أصلاً". الفحص المباشر لـ `Code_v4.gs`’s `SHEET_DEFS` يُظهر وجود تعريف Sheet خامد باسم `'الصيغ'` (نفس Headers تعريف `'المكتبة'` تماماً). النتيجة الوظيفية (لا مزامنة تحدث فعلياً) صحيحة، لكن السبب المذكور غير دقيق — التصحيح: "Sheet خامد غير مفعَّل"، لا "لا Sheet أصلاً". |
| 3 | **ثوابت ميتة** | `TEMPLATES_FIELDS`/`TEMPLATES_MAP` المعرَّفتان داخل `js/modules/templates.js` غير مستخدَمتين في أي مكان تنفيذي (الكود الفعلي يعتمد على `FIELDS.templates`/`MAP.templates` العامّين في `index.html`). لم يُعتمَدا كمصدر حقيقة في هذا الملف. |

## 2. القرارات التصميمية (Design Decisions) — مع الحسم لصالح السلوك الفعلي

### 2.1 Primary Key
`idField: 'id'` — Hybrid، يُولَّد فقط عند الغياب. **أول كيان في هذا التسلسل يستخدم فعلياً `id` عاماً** (بخلاف Clients→Documents التي استخدمت جميعها حقلاً عربياً مخصَّصاً)، مؤكَّد بفحص `saveTemplate()` مباشرة: `obj['id'] = obj['id'] || uid();`.

### 2.2 Validation — حسم تعارض موثَّق
`Data_Schema_Specification_Report §4.9` يذكر حقلاً إلزامياً واحداً (`العنوان`). الفحص المباشر لـ `saveTemplate()` يُظهر **حقلين** فعلياً (`العنوان` و`القسم`)، كلاهما بعد `.trim()` — زوج متماثل بلا تفاوت، مؤكَّد إضافياً بعلامة `<span class="req">*</span>` على كلا الحقلين في `index.html`. **`_validate()` في هذا الملف تفرض الحقلين معاً**، حسماً للتعارض لصالح الكود الفعلي — بنفس منهجية حسم Sessions (5.5).

### 2.3 Search — قرار إضافي بلا سابقة حية (حالة فريدة)
لا يوجد أي بحث نصي حر في الكود الحالي إطلاقاً (مؤكَّد أيضاً في `PROJECT_HISTORY.md §Phase 11A`) — أول كيان من التسعة بلا أي سابقة بحث للمحاكاة. **القرار المُتَّخذ:** تطبيق نفس محرك البحث العام (`Object.values().join(' ')`) المستخدَم في كل الكيانات السابقة، كقدرة **إضافية** جديدة (لا استبدال لسلوك موجود)، تماماً كما عومل الفرز الغائب في Children/Tasks/Fees/Documents. البديل المرفوض: عدم دعم بحث إطلاقاً (`UnsupportedOperationError`) — رُفض لأنه يكسر اتساق العقد (Contract) بلا فائدة توافقية حقيقية.

### 2.4 Filter
`القسم`: حي وفعّال (تبويبات `#templateTabs` الديناميكية). `النوع`: موثَّق لكن غير مربوط بواجهة (يُستخدَم فقط لعرض شارة). كلاهما يعمل عبر `filter()` العام دون Override خاص — نفس نمط Fees/Documents.

### 2.5 Sort
لا فرز حالي في `renderTemplates()` — الافتراضي الإضافي: `العنوان` تصاعدياً (نفس نمط Children/Tasks/Fees/Documents).

### 2.6 Soft Delete
`softDelete: true` — قدرة إضافية فوق الحذف الفعلي المباشر (`splice()`) في `deleteTemplate()`، بنفس القرار القياسي المتَّبع في كل الكيانات السبعة السابقة (لا حسم خاص مطلوب هنا).

### 2.7 Sync
لا مزامنة مُضافة — يطابق أن `templates.js` لا يستدعي `ApiService`/`syncToSheets` بأي شكل. انظر Input Gap #2 أعلاه لتصحيح السبب الموثَّق.

## 3. ما لم يتغيَّر (Untouched Files — مؤكَّد بـ MD5)
| ملف | MD5 |
|---|---|
| `js/core/Repository.js` | `1159f37eec831920256a727a30dba709` — **غير مُعدَّل** (مطابق للقيمة المسجَّلة في `PROJECT_STATE.md`). |
| `index.html` | `bc93f6b82a9a822de620fa77502ed200` — **غير مُعدَّل**. |
| `Code_v4.gs` | `78bba97e310222740ccebfd6dec110ef` — **غير مُعدَّل**. |
| `js/modules/templates.js` | `82baf67fc8207b22d11663294f565353` — **غير مُعدَّل** (لم تُكتَب إليه). |

لا استيراد أو اعتماد على أي Repository شقيق (Cases/Clients/Children/Sessions/Tasks/Fees/Documents) — مؤكَّد ببحث آلي عن استدعاءات `require()` داخل الملف (لا وجود لأي منها) ضمن Harness التحقق نفسه.

## 4. الخلاصة
`TemplatesRepository.js` جاهز كملف إضافي مستقل تماماً، غير مربوط بـ `index.html`، لا يمسّ أي كود V9 قائم، ولا يعتمد على أي Repository آخر — بنفس نمط الاستراتيجية التراكمية (Strangler Pattern) المتَّبعة في كل الثماني مراحل السابقة.
