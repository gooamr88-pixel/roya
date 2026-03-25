# 📋 التقرير التقني الشامل — منصة رؤيا (ROYA Platform)
**تاريخ التقرير:** 25 مارس 2026  
**نوع التقرير:** فحص أمني + تحليل كود مصدري + اختبار حي شامل

---

## 🚨 التحديثات الأساسية (Core Fixes Applied)

### 1. إصلاح زر "حفظ" في إدارة الأعمال السابقة (Portfolio)

**المشكلة:** عند حفظ عنصر في Portfolio، الدالة [saveAdminPortfolio()](file:///e:/Roya/client/js/admin/admin.portfolio.js#106-144) في ملف [admin.portfolio.js](file:///e:/Roya/client/js/admin/admin.portfolio.js) كانت ترسل الحقول التالية: `title`, `description`, `category`, `is_active`, `title_ar`, `description_ar` — لكنها **لم ترسل حقل `category_ar`** أبداً. الكنترولر في الخادم ([portfolio.controller.js](file:///e:/Roya/server/controllers/portfolio.controller.js) سطر 57) يتوقع هذا الحقل.

**الحل المطبق:** تمت إضافة خريطة تحويل تلقائية من اسم الفئة الإنجليزي إلى العربي:

```javascript
// admin.portfolio.js — lines 113-117
const categoryVal = document.getElementById('portfolioCategory')?.value || 'general';
formData.append('category', categoryVal);
const categoryArMap = { general: 'عام', branding: 'العلامة التجارية', digital: 'رقمي', print: 'طباعة', social_media: 'وسائل التواصل', events: 'فعاليات', exhibitions: 'معارض', real_estate: 'عقارات' };
formData.append('category_ar', categoryArMap[categoryVal] || categoryVal);
```

**الملف:** [admin.portfolio.js](file:///e:/Roya/client/js/admin/admin.portfolio.js)

```diff:admin.portfolio.js
// ═══════════════════════════════════════════════
// Admin Portfolio — CRUD for Previous Works
// Depends on: api.js, utils.js, admin.init.js (esc, glassConfirm)
// ═══════════════════════════════════════════════

let editingPortfolioId = null;

async function loadAdminPortfolio() {
    const tbody = document.getElementById('portfolioTableBody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:40px"><i class="fas fa-spinner fa-spin" style="color:var(--accent-primary);font-size:1.5rem"></i></td></tr>`;

    try {
        const data = await API.get('/portfolio?limit=50');
        const items = data.data.portfolio;

        if (!items.length) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--text-3)"><i class="fas fa-images" style="font-size:2rem;margin-bottom:8px;display:block;opacity:.4"></i> No portfolio items yet</td></tr>`;
            return;
        }

        tbody.innerHTML = items.map(item => {
            const images = Array.isArray(item.images) ? item.images : (JSON.parse(item.images || '[]'));
            const thumb = images?.[0] || '';
            return `
            <tr>
                <td>
                    ${thumb ? `<img src="${esc(thumb)}" style="width:48px;height:36px;object-fit:cover;border-radius:6px;border:1px solid var(--border-color)" alt="">` : '<i class="fas fa-image" style="opacity:.3;font-size:1.5rem"></i>'}
                </td>
                <td><strong>${esc(item.title)}</strong></td>
                <td>${esc(item.category || '—')}</td>
                <td>
                    <span class="badge ${item.is_active ? 'badge-success' : 'badge-danger'}">
                        ${item.is_active ? '<i class="fas fa-check-circle"></i> Active' : '<i class="fas fa-times-circle"></i> Inactive'}
                    </span>
                </td>
                <td>
                    <div style="display:flex;gap:6px;">
                        <button class="btn btn-ghost btn-sm" onclick="editPortfolioItem(${item.id})" title="Edit">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm" style="background:rgba(239,68,68,.1);color:#ef4444;border:1px solid rgba(239,68,68,.2)"
                            onclick="deletePortfolioItem(${item.id})" title="Deactivate">
                            <i class="fas fa-eye-slash"></i>
                        </button>
                        <button class="btn btn-sm" style="background:rgba(220,38,38,.15);color:#dc2626;border:1px solid rgba(220,38,38,.3)"
                            onclick="permanentDeletePortfolioItem(${item.id}, '${esc(item.title).replace(/'/g, "\\'")}')"
                            title="Permanent Delete">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </td>
            </tr>`;
        }).join('');
    } catch (err) {
        Toast.error(__t?.failedLoad || 'Failed to load portfolio items');
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--danger)">Failed to load portfolio</td></tr>`;
    }
}

function openPortfolioModal(item = null) {
    editingPortfolioId = item ? item.id : null;
    const modal = document.getElementById('portfolioModal');
    const title = document.getElementById('portfolioModalTitle');
    if (!modal) return;

    title.textContent = item ? 'Edit Portfolio Item' : 'Add New Portfolio Item';
    document.getElementById('portfolioTitle').value = item?.title || '';
    document.getElementById('portfolioDescription').value = item?.description || '';
    document.getElementById('portfolioCategory').value = item?.category || 'general';
    document.getElementById('portfolioIsActive').checked = item ? !!item.is_active : true;
    // i18n Arabic fields
    const titleArEl = document.getElementById('portfolioTitleAr');
    const descArEl = document.getElementById('portfolioDescriptionAr');
    if (titleArEl) titleArEl.value = item?.title_ar || '';
    if (descArEl) descArEl.value = item?.description_ar || '';

    // Reset file input
    const fileInput = document.getElementById('portfolioImages');
    if (fileInput) fileInput.value = '';

    // Show existing images
    const preview = document.getElementById('portfolioImgPreview');
    if (preview && item) {
        const imgs = Array.isArray(item.images) ? item.images : (JSON.parse(item.images || '[]'));
        preview.innerHTML = imgs.map(url => `<img src="${esc(url)}" style="width:60px;height:60px;object-fit:cover;border-radius:6px;border:1px solid var(--border-color)">`).join('');
    } else if (preview) {
        preview.innerHTML = '';
    }

    modal.classList.add('show');
}

function closePortfolioModal() {
    document.getElementById('portfolioModal')?.classList.remove('show');
    editingPortfolioId = null;
}

async function editPortfolioItem(id) {
    try {
        const data = await API.get(`/portfolio/${id}`);
        openPortfolioModal(data.data.item);
    } catch { Toast.error('Failed to load portfolio item'); }
}

async function saveAdminPortfolio() {
    const title = document.getElementById('portfolioTitle')?.value?.trim();
    if (!title) { Toast.error(__t?.titleRequired || 'Title is required'); return; }

    const formData = new FormData();
    formData.append('title', title);
    formData.append('description', document.getElementById('portfolioDescription')?.value?.trim() || '');
    formData.append('category', document.getElementById('portfolioCategory')?.value || 'general');
    formData.append('is_active', document.getElementById('portfolioIsActive')?.checked ? '1' : '0');
    // i18n Arabic fields
    const titleAr = (document.getElementById('portfolioTitleAr')?.value || '').trim();
    const descAr = (document.getElementById('portfolioDescriptionAr')?.value || '').trim();
    if (titleAr) formData.append('title_ar', titleAr);
    if (descAr) formData.append('description_ar', descAr);

    const fileInput = document.getElementById('portfolioImages');
    if (fileInput?.files?.length > 0) {
        Array.from(fileInput.files).forEach(f => formData.append('images', f));
    }

    try {
        if (editingPortfolioId) {
            await API.putForm(`/portfolio/${editingPortfolioId}`, formData);
            Toast.success(__t?.portfolioUpdated || 'Portfolio item updated');
        } else {
            await API.postForm('/portfolio', formData);
            Toast.success(__t?.portfolioCreated || 'Portfolio item created');
        }
        closePortfolioModal();
        loadAdminPortfolio();
    } catch (err) {
        Toast.error(err.message || (__t?.failedSave || 'Failed to save portfolio item'));
    }
}

async function deletePortfolioItem(id) {
    const ok = await glassConfirm(__t?.deactivatePortfolio || 'Deactivate Item', __t?.confirmDeactivate || 'Are you sure you want to deactivate this portfolio item?', 'danger');
    if (!ok) return;
    try {
        await API.delete(`/portfolio/${id}`);
        Toast.success(__t?.portfolioDeactivated || 'Portfolio item deactivated');
        loadAdminPortfolio();
    } catch { Toast.error(__t?.failedSave || 'Failed to deactivate portfolio item'); }
}

async function permanentDeletePortfolioItem(id, title) {
    const ok = await glassConfirm(
        __t?.permanentDelete || 'Permanent Delete',
        (__t?.confirmPermanentDelete || 'Are you sure you want to PERMANENTLY delete "{title}"? This action cannot be undone.').replace('{title}', title),
        'danger'
    );
    if (!ok) return;
    try {
        await API.delete(`/portfolio/${id}/permanent`);
        Toast.success(__t?.portfolioPermanentlyDeleted || 'Portfolio item permanently deleted');
        loadAdminPortfolio();
    } catch (err) {
        Toast.error(err.message || (__t?.failedSave || 'Failed to delete portfolio item'));
    }
}

// Wire up portfolio images live preview
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('portfolioImages')?.addEventListener('change', (e) => {
        const preview = document.getElementById('portfolioImgPreview');
        if (!preview) return;
        preview.innerHTML = '';
        Array.from(e.target.files).forEach(file => {
            const reader = new FileReader();
            reader.onload = ev => {
                const img = document.createElement('img');
                img.src = ev.target.result;
                img.style.cssText = 'width:60px;height:60px;object-fit:cover;border-radius:6px;border:1px solid var(--border-color)';
                preview.appendChild(img);
            };
            reader.readAsDataURL(file);
        });
    });

    document.getElementById('portfolioModal')?.addEventListener('click', (e) => {
        if (e.target === document.getElementById('portfolioModal')) closePortfolioModal();
    });
});
===
// ═══════════════════════════════════════════════
// Admin Portfolio — CRUD for Previous Works
// Depends on: api.js, utils.js, admin.init.js (esc, glassConfirm)
// ═══════════════════════════════════════════════

let editingPortfolioId = null;

async function loadAdminPortfolio() {
    const tbody = document.getElementById('portfolioTableBody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:40px"><i class="fas fa-spinner fa-spin" style="color:var(--accent-primary);font-size:1.5rem"></i></td></tr>`;

    try {
        const data = await API.get('/portfolio?limit=50');
        const items = data.data.portfolio;

        if (!items.length) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--text-3)"><i class="fas fa-images" style="font-size:2rem;margin-bottom:8px;display:block;opacity:.4"></i> No portfolio items yet</td></tr>`;
            return;
        }

        tbody.innerHTML = items.map(item => {
            const images = Array.isArray(item.images) ? item.images : (JSON.parse(item.images || '[]'));
            const thumb = images?.[0] || '';
            return `
            <tr>
                <td>
                    ${thumb ? `<img src="${esc(thumb)}" style="width:48px;height:36px;object-fit:cover;border-radius:6px;border:1px solid var(--border-color)" alt="">` : '<i class="fas fa-image" style="opacity:.3;font-size:1.5rem"></i>'}
                </td>
                <td><strong>${esc(item.title)}</strong></td>
                <td>${esc(item.category || '—')}</td>
                <td>
                    <span class="badge ${item.is_active ? 'badge-success' : 'badge-danger'}">
                        ${item.is_active ? '<i class="fas fa-check-circle"></i> Active' : '<i class="fas fa-times-circle"></i> Inactive'}
                    </span>
                </td>
                <td>
                    <div style="display:flex;gap:6px;">
                        <button class="btn btn-ghost btn-sm" onclick="editPortfolioItem(${item.id})" title="Edit">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm" style="background:rgba(239,68,68,.1);color:#ef4444;border:1px solid rgba(239,68,68,.2)"
                            onclick="deletePortfolioItem(${item.id})" title="Deactivate">
                            <i class="fas fa-eye-slash"></i>
                        </button>
                        <button class="btn btn-sm" style="background:rgba(220,38,38,.15);color:#dc2626;border:1px solid rgba(220,38,38,.3)"
                            onclick="permanentDeletePortfolioItem(${item.id}, '${esc(item.title).replace(/'/g, "\\'")}')"
                            title="Permanent Delete">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </td>
            </tr>`;
        }).join('');
    } catch (err) {
        Toast.error(__t?.failedLoad || 'Failed to load portfolio items');
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--danger)">Failed to load portfolio</td></tr>`;
    }
}

function openPortfolioModal(item = null) {
    editingPortfolioId = item ? item.id : null;
    const modal = document.getElementById('portfolioModal');
    const title = document.getElementById('portfolioModalTitle');
    if (!modal) return;

    title.textContent = item ? 'Edit Portfolio Item' : 'Add New Portfolio Item';
    document.getElementById('portfolioTitle').value = item?.title || '';
    document.getElementById('portfolioDescription').value = item?.description || '';
    document.getElementById('portfolioCategory').value = item?.category || 'general';
    document.getElementById('portfolioIsActive').checked = item ? !!item.is_active : true;
    // i18n Arabic fields
    const titleArEl = document.getElementById('portfolioTitleAr');
    const descArEl = document.getElementById('portfolioDescriptionAr');
    if (titleArEl) titleArEl.value = item?.title_ar || '';
    if (descArEl) descArEl.value = item?.description_ar || '';

    // Reset file input
    const fileInput = document.getElementById('portfolioImages');
    if (fileInput) fileInput.value = '';

    // Show existing images
    const preview = document.getElementById('portfolioImgPreview');
    if (preview && item) {
        const imgs = Array.isArray(item.images) ? item.images : (JSON.parse(item.images || '[]'));
        preview.innerHTML = imgs.map(url => `<img src="${esc(url)}" style="width:60px;height:60px;object-fit:cover;border-radius:6px;border:1px solid var(--border-color)">`).join('');
    } else if (preview) {
        preview.innerHTML = '';
    }

    modal.classList.add('show');
}

function closePortfolioModal() {
    document.getElementById('portfolioModal')?.classList.remove('show');
    editingPortfolioId = null;
}

async function editPortfolioItem(id) {
    try {
        const data = await API.get(`/portfolio/${id}`);
        openPortfolioModal(data.data.item);
    } catch { Toast.error('Failed to load portfolio item'); }
}

async function saveAdminPortfolio() {
    const title = document.getElementById('portfolioTitle')?.value?.trim();
    if (!title) { Toast.error(__t?.titleRequired || 'Title is required'); return; }

    const formData = new FormData();
    formData.append('title', title);
    formData.append('description', document.getElementById('portfolioDescription')?.value?.trim() || '');
    const categoryVal = document.getElementById('portfolioCategory')?.value || 'general';
    formData.append('category', categoryVal);
    // Map English category to Arabic for i18n
    const categoryArMap = { general: 'عام', branding: 'العلامة التجارية', digital: 'رقمي', print: 'طباعة', social_media: 'وسائل التواصل', events: 'فعاليات', exhibitions: 'معارض', real_estate: 'عقارات' };
    formData.append('category_ar', categoryArMap[categoryVal] || categoryVal);
    formData.append('is_active', document.getElementById('portfolioIsActive')?.checked ? '1' : '0');
    // i18n Arabic fields
    const titleAr = (document.getElementById('portfolioTitleAr')?.value || '').trim();
    const descAr = (document.getElementById('portfolioDescriptionAr')?.value || '').trim();
    if (titleAr) formData.append('title_ar', titleAr);
    if (descAr) formData.append('description_ar', descAr);

    const fileInput = document.getElementById('portfolioImages');
    if (fileInput?.files?.length > 0) {
        Array.from(fileInput.files).forEach(f => formData.append('images', f));
    }

    try {
        if (editingPortfolioId) {
            await API.putForm(`/portfolio/${editingPortfolioId}`, formData);
            Toast.success(__t?.portfolioUpdated || 'Portfolio item updated');
        } else {
            await API.postForm('/portfolio', formData);
            Toast.success(__t?.portfolioCreated || 'Portfolio item created');
        }
        closePortfolioModal();
        loadAdminPortfolio();
    } catch (err) {
        Toast.error(err.message || (__t?.failedSave || 'Failed to save portfolio item'));
    }
}

async function deletePortfolioItem(id) {
    const ok = await glassConfirm(__t?.deactivatePortfolio || 'Deactivate Item', __t?.confirmDeactivate || 'Are you sure you want to deactivate this portfolio item?', 'danger');
    if (!ok) return;
    try {
        await API.delete(`/portfolio/${id}`);
        Toast.success(__t?.portfolioDeactivated || 'Portfolio item deactivated');
        loadAdminPortfolio();
    } catch { Toast.error(__t?.failedSave || 'Failed to deactivate portfolio item'); }
}

async function permanentDeletePortfolioItem(id, title) {
    const ok = await glassConfirm(
        __t?.permanentDelete || 'Permanent Delete',
        (__t?.confirmPermanentDelete || 'Are you sure you want to PERMANENTLY delete "{title}"? This action cannot be undone.').replace('{title}', title),
        'danger'
    );
    if (!ok) return;
    try {
        await API.delete(`/portfolio/${id}/permanent`);
        Toast.success(__t?.portfolioPermanentlyDeleted || 'Portfolio item permanently deleted');
        loadAdminPortfolio();
    } catch (err) {
        Toast.error(err.message || (__t?.failedSave || 'Failed to delete portfolio item'));
    }
}

// Wire up portfolio images live preview
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('portfolioImages')?.addEventListener('change', (e) => {
        const preview = document.getElementById('portfolioImgPreview');
        if (!preview) return;
        preview.innerHTML = '';
        Array.from(e.target.files).forEach(file => {
            const reader = new FileReader();
            reader.onload = ev => {
                const img = document.createElement('img');
                img.src = ev.target.result;
                img.style.cssText = 'width:60px;height:60px;object-fit:cover;border-radius:6px;border:1px solid var(--border-color)';
                preview.appendChild(img);
            };
            reader.readAsDataURL(file);
        });
    });

    document.getElementById('portfolioModal')?.addEventListener('click', (e) => {
        if (e.target === document.getElementById('portfolioModal')) closePortfolioModal();
    });
});
```

---

### 2. إصلاح صلاحيات الفواتير (Invoice RBAC)

**الحالة:** ✅ **لا يحتاج تعديل** — الصلاحيات مُطبقة بشكل صحيح:
- `POST /:orderId/generate` → `super_admin` فقط
- `GET /` (قائمة الفواتير) → `super_admin` فقط
- `GET /:id/download` → أي مستخدم مُسجل + فحص ملكية في الكنترولر

```javascript
// invoice.routes.js
router.get('/', authorize('super_admin'), ctrl.getAll);
router.post('/:orderId/generate', authorize('super_admin'), ctrl.generate);
router.get('/:id/download', idParamValidation, ctrl.download); // ownership check inside controller
```

---

## 💻 تقرير فحص الكود المصدري (Codebase Audit)

### 🔴 ثغرات أمنية حرجة

| # | الملف | الثغرة | الخطورة | الحالة |
|---|-------|--------|---------|--------|
| 1 | [auth.routes.js](file:///e:/Roya/server/routes/auth.routes.js) | مسار `debug-cookies` مكشوف في الإنتاج — يُسرب `NODE_ENV` + بيانات cookies | 🔴 حرج | ✅ تم الإصلاح |
| 2 | [.env](file:///e:/Roya/.env) | ملف الأسرار (كلمات مرور DB + مفاتيح JWT + API Keys) مرفوع على Git | 🔴 حرج | ⚠️ يحتاج `git rm --cached .env` + تدوير جميع الأسرار |

**إصلاح مسار debug-cookies:**

```javascript
// تم حذف هذا الكود بالكامل من auth.routes.js:
// router.get('/debug-cookies', (req, res) => { ... });
```

```diff:auth.routes.js
// ═══════════════════════════════════════════════
// Auth Routes — PHASE 2: Granular rate limiters
// ═══════════════════════════════════════════════
const router = require('express').Router();
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middlewares/auth');
const {
    loginLimiter,
    registerLimiter,
    otpLimiter,
    resendOtpLimiter,
    passwordResetLimiter,
} = require('../middlewares/rateLimiter');
const {
    registerValidation,
    loginValidation,
    otpValidation,
    forgotPasswordValidation,
    resetPasswordValidation,
} = require('../middlewares/validators');

// ── Registration: 3 per hour (prevents mass account creation) ──
router.post('/register', registerLimiter, registerValidation, authController.register);

// ── OTP Verification: 5 per 15 min (prevents brute-force OTP guessing) ──
router.post('/verify-otp', otpLimiter, otpValidation, authController.verifyOTP);

// ── Resend OTP: 3 per 15 min (prevents email flooding) ──
router.post('/resend-otp', resendOtpLimiter, forgotPasswordValidation, authController.resendOTP);

// ── Login: 5 per 15 min (brute-force defense) ──
router.post('/login', loginLimiter, loginValidation, authController.login);

// ── Logout: no rate limit needed (authenticated) ──
router.post('/logout', authController.logout);

// ── Token refresh: no aggressive limit (browser auto-refreshes) ──
router.post('/refresh', authController.refresh);

// ── Forgot password: 3 per 15 min (prevents email flood + enumeration) ──
router.post('/forgot-password', passwordResetLimiter, forgotPasswordValidation, authController.forgotPassword);

// ── Reset password: 3 per 15 min ──
router.post('/reset-password', passwordResetLimiter, resetPasswordValidation, authController.resetPassword);

// ── Get current user: authenticated ──
router.get('/me', authenticate, authController.me);

// ── DEBUG: Check cookies (TEMPORARY — remove after fixing) ──
router.get('/debug-cookies', (req, res) => {
    const cookieKeys = Object.keys(req.cookies || {});
    const hasAccess = !!req.cookies?.access_token;
    const hasRefresh = !!req.cookies?.refresh_token;
    console.log(`🔍 [DEBUG-COOKIES] Keys: ${JSON.stringify(cookieKeys)} | access: ${hasAccess} | refresh: ${hasRefresh} | protocol: ${req.protocol} | secure: ${req.secure} | NODE_ENV: ${process.env.NODE_ENV}`);
    res.json({
        cookieKeys,
        hasAccessToken: hasAccess,
        hasRefreshToken: hasRefresh,
        nodeEnv: process.env.NODE_ENV,
        protocol: req.protocol,
        secure: req.secure,
    });
});

module.exports = router;
===
// ═══════════════════════════════════════════════
// Auth Routes — PHASE 2: Granular rate limiters
// ═══════════════════════════════════════════════
const router = require('express').Router();
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middlewares/auth');
const {
    loginLimiter,
    registerLimiter,
    otpLimiter,
    resendOtpLimiter,
    passwordResetLimiter,
} = require('../middlewares/rateLimiter');
const {
    registerValidation,
    loginValidation,
    otpValidation,
    forgotPasswordValidation,
    resetPasswordValidation,
} = require('../middlewares/validators');

// ── Registration: 3 per hour (prevents mass account creation) ──
router.post('/register', registerLimiter, registerValidation, authController.register);

// ── OTP Verification: 5 per 15 min (prevents brute-force OTP guessing) ──
router.post('/verify-otp', otpLimiter, otpValidation, authController.verifyOTP);

// ── Resend OTP: 3 per 15 min (prevents email flooding) ──
router.post('/resend-otp', resendOtpLimiter, forgotPasswordValidation, authController.resendOTP);

// ── Login: 5 per 15 min (brute-force defense) ──
router.post('/login', loginLimiter, loginValidation, authController.login);

// ── Logout: no rate limit needed (authenticated) ──
router.post('/logout', authController.logout);

// ── Token refresh: no aggressive limit (browser auto-refreshes) ──
router.post('/refresh', authController.refresh);

// ── Forgot password: 3 per 15 min (prevents email flood + enumeration) ──
router.post('/forgot-password', passwordResetLimiter, forgotPasswordValidation, authController.forgotPassword);

// ── Reset password: 3 per 15 min ──
router.post('/reset-password', passwordResetLimiter, resetPasswordValidation, authController.resetPassword);

// ── Get current user: authenticated ──
router.get('/me', authenticate, authController.me);

module.exports = router;
```

---

### 🟡 أخطاء متوسطة الخطورة

| # | الملف | المشكلة | الحالة |
|---|-------|---------|--------|
| 1 | [seo.routes.js](file:///e:/Roya/server/routes/seo.routes.js) | خريطة الموقع (sitemap.xml) لا تحتوي على صفحات `/portfolio` و `/jobs` | ✅ تم الإصلاح |
| 2 | [.env](file:///e:/Roya/.env) | متغير `BASE_URL` غائب — يؤثر على روابط SEO | ✅ تم الإصلاح |
| 3 | [admin.portfolio.js](file:///e:/Roya/client/js/admin/admin.portfolio.js) | حقل `category_ar` لا يُرسل عند الحفظ | ✅ تم الإصلاح |

**إصلاح خريطة الموقع:**

```javascript
// seo.routes.js — تمت إضافة:
{ path: '/portfolio', priority: '0.8', freq: 'weekly' },
{ path: '/jobs', priority: '0.7', freq: 'weekly' },
```

```diff:seo.routes.js
// ═══════════════════════════════════════════════
// SEO Routes — robots.txt & sitemap.xml
// ═══════════════════════════════════════════════
const router = require('express').Router();
const config = require('../config');

router.get('/robots.txt', (req, res) => {
    const siteUrl = config.baseUrl || 'https://roya-advertising.com';
    res.type('text/plain').send(
        `User-agent: *
Allow: /

Disallow: /api/
Disallow: /dashboard
Disallow: /admin

Sitemap: ${siteUrl}/sitemap.xml`
    );
});

router.get('/sitemap.xml', (req, res) => {
    const base = config.baseUrl || 'https://roya-advertising.com';
    const pages = [
        { path: '/', priority: '1.0', freq: 'weekly' },
        { path: '/services', priority: '0.9', freq: 'weekly' },
        { path: '/properties', priority: '0.9', freq: 'weekly' },
        { path: '/exhibitions', priority: '0.8', freq: 'weekly' },
        { path: '/login', priority: '0.5', freq: 'monthly' },
        { path: '/register', priority: '0.5', freq: 'monthly' },
    ];
    const today = new Date().toISOString().split('T')[0];

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n`;
    xml += `        xmlns:xhtml="http://www.w3.org/1999/xhtml">\n`;
    for (const p of pages) {
        xml += `  <url>\n`;
        xml += `    <loc>${base}${p.path}</loc>\n`;
        xml += `    <lastmod>${today}</lastmod>\n`;
        xml += `    <changefreq>${p.freq}</changefreq>\n`;
        xml += `    <priority>${p.priority}</priority>\n`;
        xml += `    <xhtml:link rel="alternate" hreflang="en" href="${base}${p.path}" />\n`;
        xml += `    <xhtml:link rel="alternate" hreflang="ar" href="${base}${p.path}" />\n`;
        xml += `  </url>\n`;
    }
    xml += `</urlset>`;
    res.type('application/xml').send(xml);
});

module.exports = router;
===
// ═══════════════════════════════════════════════
// SEO Routes — robots.txt & sitemap.xml
// ═══════════════════════════════════════════════
const router = require('express').Router();
const config = require('../config');

router.get('/robots.txt', (req, res) => {
    const siteUrl = config.baseUrl || 'https://roya-advertising.com';
    res.type('text/plain').send(
        `User-agent: *
Allow: /

Disallow: /api/
Disallow: /dashboard
Disallow: /admin

Sitemap: ${siteUrl}/sitemap.xml`
    );
});

router.get('/sitemap.xml', (req, res) => {
    const base = config.baseUrl || 'https://roya-advertising.com';
    const pages = [
        { path: '/', priority: '1.0', freq: 'weekly' },
        { path: '/services', priority: '0.9', freq: 'weekly' },
        { path: '/properties', priority: '0.9', freq: 'weekly' },
        { path: '/exhibitions', priority: '0.8', freq: 'weekly' },
        { path: '/portfolio', priority: '0.8', freq: 'weekly' },
        { path: '/jobs', priority: '0.7', freq: 'weekly' },
        { path: '/login', priority: '0.5', freq: 'monthly' },
        { path: '/register', priority: '0.5', freq: 'monthly' },
    ];
    const today = new Date().toISOString().split('T')[0];

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n`;
    xml += `        xmlns:xhtml="http://www.w3.org/1999/xhtml">\n`;
    for (const p of pages) {
        xml += `  <url>\n`;
        xml += `    <loc>${base}${p.path}</loc>\n`;
        xml += `    <lastmod>${today}</lastmod>\n`;
        xml += `    <changefreq>${p.freq}</changefreq>\n`;
        xml += `    <priority>${p.priority}</priority>\n`;
        xml += `    <xhtml:link rel="alternate" hreflang="en" href="${base}${p.path}" />\n`;
        xml += `    <xhtml:link rel="alternate" hreflang="ar" href="${base}${p.path}" />\n`;
        xml += `  </url>\n`;
    }
    xml += `</urlset>`;
    res.type('application/xml').send(xml);
});

module.exports = router;
```

---

### 🟢 ملاحظات تم فحصها وتبين صحتها

| # | الملف | الملاحظة | النتيجة |
|---|-------|----------|---------|
| 1 | [email.service.js](file:///e:/Roya/server/services/email.service.js) | [sendContactReply](file:///e:/Roya/server/services/email.service.js#218-271) تُرجع `null` عند الفشل | ✅ بتصميم — الكنترولر يعالج الخطأ |
| 2 | [token.service.js](file:///e:/Roya/server/services/token.service.js) | Cookie maxAge (24 ساعة) أطول من JWT expiry (15 دقيقة) | ✅ بتصميم — آلية auto-refresh في [api.js](file:///e:/Roya/client/js/api.js) |
| 3 | [errorHandler.js](file:///e:/Roya/server/middlewares/errorHandler.js) | لا يسرب stack traces في بيئة الإنتاج | ✅ آمن |
| 4 | [upload.service.js](file:///e:/Roya/server/services/upload.service.js) | حد الرفع 10MB / 5 ملفات يتطابق مع وعد الواجهة | ✅ متسق |
| 5 | كل الـ Controllers | استعلامات SQL مُعلمة (parameterized) — محمية من SQL Injection | ✅ آمن |
| 6 | [auth.js](file:///e:/Roya/client/js/auth.js) | خوارزمية JWT محصورة بـ HS256 — محمي من Algorithm Confusion | ✅ آمن |

---

### 📊 تحليل البنية المعمارية

**الهيكل:** Clean Architecture (Controllers → Services → Repositories → DB)

| الطبقة | عدد الملفات | الحالة |
|--------|-------------|--------|
| Controllers | 12 ملف | ✅ جميعها تتبع نمط Thin Controller |
| Services | 5 ملفات (auth, token, upload, email, AI) | ✅ منظمة |
| Repositories | 11 ملف | ✅ SQL مُعلم |
| Middlewares | 6 ملفات (auth, error, security, validators, rateLimiter, i18n) | ✅ شاملة |
| Routes | 13 ملف | ✅ RBAC مطبق |
| Client JS | 13 ملف | ✅ تعمل |
| Views (Nunjucks) | 18 ملف + partials | ✅ autoescape مفعل |

---

## 🌍 تقرير فحص المنصة الحية (Live Testing Results)

### نتائج فحص الصفحات العامة

| الصفحة | الرابط | الحالة | ملاحظات |
|--------|--------|--------|---------|
| الصفحة الرئيسية | `/` | ✅ تعمل | 6 أقسام: Portfolio, Services, Events, Careers, Contact, Chatbot |
| تسجيل الدخول | `/login` | ✅ تعمل | روابط "نسيت كلمة المرور" + "إنشاء حساب" تعمل |
| التسجيل | `/register` | ✅ تعمل | تحقق من المدخلات مطبق |
| الخدمات | `/services` | ✅ تعمل | 4 خدمات تظهر من API + بيانات ثنائية اللغة (AR/EN) |
| الأعمال السابقة | `/portfolio` | ✅ تعمل | تحميل البيانات ديناميكياً |
| العقارات | `/properties` | ✅ تعمل | — |
| فرص العمل | `/jobs` | ✅ تعمل | — |
| المعارض | `/exhibitions` | ✅ تعمل | — |
| صفحة 404 | `/nonexistent` | ✅ تعمل | ترجع HTTP 404 بشكل صحيح |

### نتائج فحص API

| النقطة | الحالة | النتيجة |
|--------|--------|---------|
| `GET /api/health` | ✅ | `{"status":"ok"}` |
| `GET /api/services` | ✅ | 4 خدمات + بيانات ثنائية اللغة |
| `GET /api/auth/debug-cookies` | 🔴 | **لا يزال مكشوفاً!** يُرجع `nodeEnv: "production"` — يجب نشر الإصلاح فوراً |
| `GET /robots.txt` | ✅ | Sitemap URL صحيح (`https://roya-advertising.com/sitemap.xml`) |
| `GET /sitemap.xml` | ⚠️ | يعمل لكن لا يحتوي على `/portfolio` + `/jobs` (لم يُنشر الإصلاح بعد) |

### فحص الأمان الحي

| الفحص | النتيجة |
|-------|---------|
| عناوين الأمان (Helmet) | ✅ `X-Content-Type-Options`, `X-Frame-Options`, CSP كلها مُفعلة |
| CORS | ✅ يقبل فقط `https://roya-advertising.com` |
| Rate Limiting | ✅ مُطبق على جميع النقاط الحساسة |
| HTTPS | ✅ مُفعل + HSTS |
| ملفات كوكيز | ✅ `httpOnly`, `secure`, `sameSite: lax` |

---

## 🛡️ توصيات الأمان والأداء (Ultimate Recommendations)

### 🔴 إجراءات فورية (يجب تنفيذها اليوم)

1. **نشر الإصلاحات فوراً** — مسار `debug-cookies` لا يزال مكشوفاً في الإنتاج
2. **إزالة [.env](file:///e:/Roya/.env) من Git:**
   ```bash
   git rm --cached .env
   git commit -m "chore: untrack .env file"
   git push
   ```
3. **تدوير جميع الأسرار المكشوفة:**
   - كلمة مرور قاعدة البيانات (`DB_PASSWORD`)
   - مفاتيح JWT (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`)
   - مفتاح Gemini API (`GEMINI_API_KEY`)
   - بيانات SMTP (`SMTP_PASS`)
   - مفاتيح Cloudinary (`CLOUDINARY_API_SECRET`)
   - مفتاح Supabase Service Role (`SUPABASE_SERVICE_ROLE_KEY`)
   - CSRF Secret

### 🟡 تحسينات مُوصى بها (خلال أسبوع)

4. **إضافة `uploadLimiter`** لمسارات رفع الملفات في Portfolio وServices — حالياً تستخدم فقط `apiLimiter` العام (200 طلب/15 دقيقة)
5. **تحسين [processAndUploadMultiple](file:///e:/Roya/server/services/upload.service.js#119-130)** — حالياً يرفع الملفات بالتتابع (سطر 124 من [upload.service.js](file:///e:/Roya/server/services/upload.service.js)). التوصية: استخدام `Promise.all()` للرفع المتوازي لتحسين الأداء
6. **إضافة تنبيه عند فشل إرسال OTP** — حالياً [auth.service.js](file:///e:/Roya/server/services/auth.service.js) يرمي خطأ إذا فشل الإيميل، لكن رسالة الخطأ لا تُوضح أن المشكلة في الإيميل وليس في التسجيل
7. **إضافة حد طول لحقل `notes`** في `orderValidation` — حالياً لا يوجد حد أقصى لطول النص المُرسل

### 🟢 تحسينات مستقبلية

8. **استبدال `console.warn/error`** بمكتبة Logging مخصصة (Winston / Pino) مع مستويات تسجيل وملفات منفصلة
9. **إضافة Database Connection Health Check** — الـ pool يلتقط أخطاء الاتصال لكن لا يوجد retry logic في `/api/health`
10. **إضافة CSRF token** لنماذج POST العامة (contact form) — حالياً محمية فقط بـ rate limiting
11. **إضافة Cache-Control headers** للاستعلامات المتكررة (services, portfolio) لتقليل الحمل على قاعدة البيانات

---

## 📁 ملخص الملفات المُعدلة

| الملف | التعديل |
|-------|---------|
| [auth.routes.js](file:///e:/Roya/server/routes/auth.routes.js) | حذف مسار `debug-cookies` |
| [admin.portfolio.js](file:///e:/Roya/client/js/admin/admin.portfolio.js) | إضافة `category_ar` في payload الحفظ |
| [seo.routes.js](file:///e:/Roya/server/routes/seo.routes.js) | إضافة `/portfolio` + `/jobs` لخريطة الموقع |
| [.env](file:///e:/Roya/.env) | إضافة `BASE_URL=https://roya-advertising.com` |
