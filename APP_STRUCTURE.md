# بنية مشروع Lempo Particle Editor

> وصف للبنية الموجودة حاليًا. واجهة المحرر الأساسية ما زالت Dear PyGui؛ نقل الـviewport إلى WebView لم يُنفّذ بعد. الموجود حاليًا هو Spike A وSpike B وخط أساس الأداء ضمن `LEMPO_VIEWPORT_MIGRATION_PLAN.md`.

## 1) شجرة المشروع

```text
Lempo-FX/
├── editor/
│   ├── studio_imgui.py          # المحرر الرئيسي: Dear PyGui والـviewport ثنائي/ثلاثي الأبعاد
│   ├── particle_studio.py       # منطق مشترك ومحرك Python وواجهة Tk الاحتياطية
│   ├── raster_view.py           # يربط رندر OpenGL بصورة GPU داخل DPG عند كثافة الجسيمات
│   ├── mesh_cache.py            # قراءة وتحضير النماذج المخصصة
│   ├── viewport_host.py         # مضيف pywebview تجريبي عبر --viewport-host (Spike B)
│   ├── trail_render.py          # حسابات رسم شرائط trails
│   ├── trail_widgets.py         # محررات منحنيات وتدرجات trails
│   └── trail_templates_ui.py    # واجهة قوالب trails
├── core/
│   ├── particle_core.cpp        # نواة محاكاة C++
│   ├── trail_templates.h        # تسجيل/دمج/بحث قوالب trails
│   ├── build_core.py            # بناء امتداد Python الأصلي
│   ├── test_parity.py           # مطابقة نتائج C++ وPython
│   └── test_behavior.py         # اختبارات السلوك والأداء للنواة
├── render/
│   └── gl_view.py               # رندر OpenGL 3.3 خارج الشاشة باستخدام GLFW وctypes
├── preview/
│   ├── preview.ts / preview.js  # محرك الجسيمات لمعاينة المتصفح
│   ├── main.ts / main.js        # بدء المعاينة ومزامنة التأثير
│   ├── three_scene.ts / .js     # مشهد 3D باستخدام Three.js
│   ├── pixi_scene.ts / .js      # مشهد 2D باستخدام PixiJS
│   ├── preview.html             # قالب صفحة المعاينة
│   ├── live_bundle.js           # حزمة JavaScript للمعاينة
│   ├── live_effect.html         # صفحة معاينة مستقلة مضمّنة الموارد
│   ├── last_effect.json         # آخر تأثير يكتبه المحرر للمزامنة الحية
│   └── test_*.mjs / test_server.py
├── lempo-runtime/
│   ├── src/                     # محمّل TypeScript لأنواع التأثيرات
│   └── test_loader.mjs          # اختبار محمّل runtime
├── contracts/
│   ├── contracts.json           # مصدر العقود المشترك
│   └── gen/                     # ملفات Python/C++/TypeScript المولّدة
├── tests/                       # اختبارات المحرر والعقود والمحاكاة وtrails
├── bench/
│   ├── bench_cores.py           # قياس نواة المحاكاة
│   ├── bench_preview.py         # قياسات مراحل العرض الحالية
│   ├── bench_current_viewport.py # قياس مشاهد الـviewport الفعلية
│   ├── baseline-viewport.json   # خط أساس Explosion/Fire/Rain/Snow في 2D و3D
│   └── BASELINE.md              # خطوط أساس أقدم للنواة والمعاينة
├── tools/
│   ├── rebuild_app.py           # بناء التطبيق وإجراء smoke boot وإعادة إنشاء الاختصار
│   ├── spike_viewport_bridge.py # Spike A: DPG + pywebview وقياس JSON Lines
│   ├── build_preview.py         # إنشاء حزمة المعاينة
│   ├── generate_contracts.py    # توليد وفحص العقود
│   ├── make_icon.py             # إعداد الأيقونات
│   └── patch_*.py               # أدوات ترقية/تعديل الإكستنشن
├── packaging/
│   └── LempoParticleEditor.spec # إعداد PyInstaller للنسخة one-file
├── assets/                      # الأيقونات وقوالب trails المضمّنة
├── presets/                     # أمثلة تأثيرات trails بصيغة التصدير
├── AdvancedParticleEmitter.json # إكستنشن GDevelop
├── sample_*.json                # أمثلة التأثيرات
├── README.md                    # استخدام التطبيق وخصائصه
├── PROGRESS.md                  # سجل العمل ونتائج المراحل
└── LEMPO_VIEWPORT_MIGRATION_PLAN.md
```

توجد مخرجات محلية مثل `particle_core.pyd` و`dist/` و`node_modules/` أثناء البناء، لكنها مخرجات وليست مصادر المشروع.

## 2) المكونات ومسؤولياتها

| المكوّن | المسؤولية الحالية |
|---|---|
| `editor/studio_imgui.py` | واجهة Dear PyGui، المحرر والـinspector، اختيار وضع 2D/3D، عرض الجسيمات، تفاعل الفأرة والاختصارات، undo/redo، التصدير، وكتابة التأثير للمعاينة. يبدأ كذلك مضيف Spike B عند تمرير `--viewport-host`. |
| `editor/particle_studio.py` | القيم الافتراضية والقوالب والتحقق ومحاكاة Python، والمنطق الذي تستخدمه واجهة Tk الاحتياطية. |
| `editor/raster_view.py` و`render/gl_view.py` | يقدّمان مسار raster اختياريًا: GLFW/OpenGL يرسم خارج الشاشة ثم تُرفع صورة إلى DPG. يبقى رسم الخلفيات والأدلة والتفاعل في طبقة DPG. عند تعذر المسار أو عدم انطباقه يستمر الرسم بالـdrawlist. |
| `core/particle_core.cpp` | تنفيذ C++ اختياري لمحاكاة الجسيمات. يستخدمه المحرر متى توفرت الوحدة الأصلية؛ توجد محاكاة Python كمسار احتياطي. |
| `preview/` | معاينة منفصلة في المتصفح بمحرك TypeScript/JavaScript، وثلاثة أبعاد عبر Three.js وبعدان عبر PixiJS. الصفحة `live_effect.html` مجمعة لتعمل دون جلب مكتبات عبر الشبكة؛ المحرر يحدّث `last_effect.json` لمزامنة المعاينة. |
| `AdvancedParticleEmitter.json` | تنفيذ الإكستنشن داخل GDevelop، ويستهلك التأثيرات المصدرة. يتطلب الإصدار الحالي GDevelop 5.6.284 أو أحدث لعرض 3D بالمقياس الصحيح. |
| `lempo-runtime/` | حزمة TypeScript منفصلة لتحميل والتحقق من ملفات التأثير؛ ليست بديلًا عن الإكستنشن ولا عن محرّك المعاينة. |
| `contracts/` | تعريف مشترك لشكل سجل الجسيمات والأشكال ونسخة التصدير وقيم easing وblend modes؛ الملفات داخل `contracts/gen/` مولّدة. |

### مسار رسم الـviewport الحالي

1. `studio_imgui.py` يحدّث المحاكاة لكل إطار، باستخدام C++ عند توفره أو Python كبديل.
2. إذا كان raster متاحًا وينطبق على المشهد، يرسم `raster_view.py` طبقة الجسيمات في صورة OpenGL؛ ثم يرسم DPG الأدلة وواجهات التحكم فوقها.
3. عند عدم استخدام raster، يرسم DPG الجسيمات ومكونات المشهد عبر drawlist مباشرة. trails تظهر في طبقة الـviewport ولا تستخدم مسار raster نفسه.
4. هذه هي الواجهة الحالية. `viewport_host.py` حاليًا spike مستقل لفتح نافذة pywebview، وليس جسرًا موصولًا بالمحرر أو بديلًا عن الـviewport القديم.

## 3) الإصدارات والعقود

- `contracts/contracts.json` يحدد صيغة التصدير `1.2`، وحقول سجل الجسيمات (22 حقلًا)، وترتيب الأشكال الاثني عشر، ونافذة morph من `0.25` إلى `0.75`.
- يستخدم `package.json` الآن `three 0.185.1` لمعاينة المتصفح لمطابقة GDevelop 5.6.284، مع `pixi.js ^8.21.0` وTypeScript وesbuild. نسخة Pixi للمعاينة ما زالت مختلفة عن GDevelop (7.4.2) لحين قرار توافق مستقل.
- الحد الأدنى المدعوم من الإكستنشن هو GDevelop 5.6.284؛ إصدار GDJS هذا يستخدم Three.js runtime `0.185.1` وPixiJS `7.4.2`. نتيجة الفحص والمصادر الرسمية مسجلة في `docs/viewport-migration-notes.md`.
- `lempo-runtime/` (إصدار الحزمة `1.0.0`) محمّل/مطبّع typed وليس محرك محاكاة. التنفيذ الفعلي للمحاكاة موجود في أكواد الإكستنشن؛ المحمّل لا يحتفظ حاليًا بكل حقول runtime مثل seed وfields وtrails، والتفاصيل في ملاحظات الترحيل.

## 4) البناء والتشغيل

### التطوير

```powershell
python editor/studio_imgui.py
```

### بناء Windows

```powershell
python tools/rebuild_app.py
```

يبني السكربت نواة C++ عند الحاجة، ثم يحزم التطبيق بواسطة `packaging/LempoParticleEditor.spec`، ويجري smoke boot، ويعيد إنشاء اختصار Windows. الحزمة تتضمن ملفات المعاينة والأصول و`render/` ومكتبتي Three.js وPixiJS وملفات GLFW المتاحة. إعداد PyInstaller يتضمن `viewport_host` و`webview` لاختبار `--viewport-host`.

لاستخدام مسار `--viewport-host` في بيئة بناء جديدة، يجب تثبيت اعتماد pywebview قبل البناء. على Windows، Spike B يجبر EdgeChromium ويحتاج WebView2 Runtime و.NET Framework 4.6.2 أو أحدث. فتح `preview/live_effect.html` في المتصفح الافتراضي عند تعذر WebView2 موثق كـfallback، لكن تشغيله تلقائيًا لم يُنفذ بعد.

## 5) القياس وخطة ترحيل الـviewport

- `tools/spike_viewport_bridge.py`: تشغيل DPG مع عملية pywebview فرعية وقياس round-trip JSON Lines. نتيجة Spike A: وسيط `0.259 ms` وp95 `31.046 ms` من 100 عينة.
- `editor/viewport_host.py`: إثبات تشغيل مضيف EdgeChromium من نسخة PyInstaller عبر `--viewport-host` (Spike B). لا يرحّل هذا المسار بيانات الواجهة بعد.
- `bench/bench_current_viewport.py`: يعيد قياس القوالب الأربعة في وضعَي 2D و3D، ويكتب إلى `bench/baseline-viewport.json`. خط الأساس الحالي: p50 للإطار `16.528–16.560 ms` وp95 `16.814–17.077 ms` على الجهاز المسجل داخل ملف JSON.
- Dear PyGui لا يوفّر عداد GPU draw calls؛ لذلك `draw_calls` في خط الأساس `null` وعدد drawlist commands مجرد proxy موضح في التقرير.
- مراحل نقل الـviewport والتوافق والأداء المتبقية موثقة في `LEMPO_VIEWPORT_MIGRATION_PLAN.md`، ونتائج الاستكشاف في `docs/viewport-migration-notes.md`.

## 6) تدفق البيانات المبسّط

```text
contracts/contracts.json ──generate_contracts.py──> contracts/gen/*
core/particle_core.cpp ──build_core.py──> particle_core.pyd
                                                │
editor/studio_imgui.py ──step()─────────────────┤
  ├─ Dear PyGui drawlist                         ├─ render/raster_view.py + render/gl_view.py (اختياري)
  ├─ preview/last_effect.json ──> preview/live_effect.html
  └─ export JSON ──> AdvancedParticleEmitter.json ──> GDevelop

editor/ + core/ + render/ + preview/ + assets/ + presets/
    └── packaging/LempoParticleEditor.spec ──PyInstaller──> dist/LempoParticleEditor.exe
```
