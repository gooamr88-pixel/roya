# 🔧 التقرير الفني — وضع الصيانة وتنظيف الجلسات والشعار الشفاف

## تنبيه مهم: البنية التقنية الفعلية

> [!WARNING]
> المشروع يعمل بتقنيات **Express.js + Nunjucks + PostgreSQL + JWT** وليس Next.js/Supabase. جميع التعديلات تمت وفقاً للبنية الفعلية.

---

## ١. وضع الصيانة مع تجاوز المطوّر (Maintenance Mode)

### الملفات المُنشأة والمعدّلة

| ملف | نوع | الوصف |
|-----|------|-------|
| [maintenance.js](file:///e:/Roya/server/middlewares/maintenance.js) | **جديد** | Middleware يحظر كل الزيارات عند تفعيل وضع الصيانة |
| [maintenance.njk](file:///e:/Roya/client/views/pages/maintenance.njk) | **جديد** | صفحة صيانة احترافية بتصميم متحرك وألوان ذهبية |
| [app.js](file:///e:/Roya/server/app.js) | **معدّل** | تسجيل middleware الصيانة بعد cookie-parser مباشرة |
| [.env.example](file:///e:/Roya/.env.example) | **معدّل** | إضافة متغيرات وضع الصيانة |

### كيفية التفعيل

**الخطوة ١:** أضف هذين السطرين في ملف `.env`:

```env
MAINTENANCE_MODE=true
MAINTENANCE_BYPASS_KEY=YOUR_SECRET_KEY_HERE
```

> اختر مفتاح سري قوي مثل: `nabda_Xk9$mP2qR7wL`

**الخطوة ٢:** أعد تشغيل السيرفر:
```bash
npm run dev
```

**النتيجة:** كل الزوار سيرون صفحة الصيانة. كل طلبات API ستحصل على `503 Service Unavailable`.

### كيفية التجاوز (الدخول كمطوّر)

زُر أي صفحة مع إضافة المفتاح السري كـ query parameter:

```
https://your-domain.com/?dev_bypass=YOUR_SECRET_KEY_HERE
```

**ما يحدث تلقائياً:**
1. يُنشئ كوكي آمن (`nabda_dev_bypass`) صالح لـ 7 أيام
2. يُعيد التوجيه للصفحة بدون المفتاح في الرابط
3. تتصفح الموقع بالكامل بشكل طبيعي

### كيفية الإلغاء

```env
MAINTENANCE_MODE=false
```

---

## ٢. تسجيل الخروج الإجباري (إبطال كل الجلسات)

> [!IMPORTANT]
> المنصة تستخدم JWT وليس Supabase. لإبطال **كل** الجلسات الحالية فوراً:

### الطريقة: تغيير مفاتيح JWT

في ملف `.env`، غيّر هاتين القيمتين إلى قيم **جديدة تماماً**:

```env
JWT_ACCESS_SECRET=new_random_secret_v2_march2026
JWT_REFRESH_SECRET=new_random_refresh_v2_march2026
```

**النتيجة الفورية:**
- كل الـ Access Tokens و Refresh Tokens المُصدرة سابقاً تصبح **غير صالحة**
- كل المستخدمين يُسجَّل خروجهم تلقائياً عند محاولة أي طلب
- لن يحتاجوا حتى ينتظروا انتهاء صلاحية الـ token

> يمكنك توليد مفاتيح عشوائية قوية بهذا الأمر:
> ```bash
> node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
> ```

---

## ٣. الشعار الشفاف

### ما تم تنفيذه

| ملف | الوصف |
|-----|-------|
| [nabda-logo-transparent.svg](file:///e:/Roya/client/images/nabda-logo-transparent.svg) | **جديد** — الشعار بدون خلفية |

**التحليل الفني للتعديل:**
- عنصر الخلفية الأصلي: `<rect class="st1" width="1080" height="1080"/>` — مستطيل `1080×1080` بلون `#231f20` (أسود داكن)
- تم حذف هذا العنصر بالكامل + حذف تعريف الـ CSS class `.st1`
- العناصر الذهبية (`.st5` gradient) والبيضاء (`.st2`) تبقى كما هي
- الشعار الآن شفاف 100% ويظهر بشكل ممتاز على الخلفيات الفاتحة والداكنة

---

## ملخص الملفات

```
✅ server/middlewares/maintenance.js    — NEW
✅ client/views/pages/maintenance.njk   — NEW  
✅ client/images/nabda-logo-transparent.svg — NEW
✅ server/app.js                        — MODIFIED (middleware registration)
✅ .env.example                         — MODIFIED (new env vars)
```
