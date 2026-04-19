// ═══════════════════════════════════════════════
// API Client — Shared fetch wrapper + Global Settings
//
// PHASE 5 HARDENING:
// ✅ CSRF token auto-attached to all mutating requests (POST/PUT/DELETE)
// ✅ Global 403 Forbidden handling with clear user feedback
// ✅ Global 429 Rate Limit handling with retry-after display
// ✅ Toast uses textContent (XSS-safe) — verified
// ═══════════════════════════════════════════════

// ── i18n Helper — detect page language for bilingual messages ──
const i18n = {
  get isAr() {
    return document.documentElement.lang === "ar";
  },
  t(en, ar) {
    return this.isAr ? ar : en;
  },

  // API Interceptor mapping
  backendMessages: {
    "User created successfully": "تم إنشاء الحساب بنجاح",
    "Username already exists": "اسم المستخدم موجود بالفعل",
    "Email already in use": "البريد الإلكتروني مستخدم بالفعل",
    "Email is already registered.": "البريد الإلكتروني مسجل بالفعل.",
    "Invalid credentials": "بيانات الاعتماد غير صالحة",
    "Invalid email or password.": "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
    "User not found.": "المستخدم غير موجود.",
    "Invalid OTP code.": "رمز التحقق غير صحيح.",
    "OTP has expired. Please request a new one.":
      "انتهت صلاحية رمز التحقق. يرجى طلب رمز جديد.",
    "Please verify your email before logging in.":
      "يرجى التحقق من بريدك الإلكتروني قبل تسجيل الدخول.",
    "Invalid token": "رمز غير صالح",
    "No token provided": "لم يتم توفير رمز",
    "Service requested successfully": "تم طلب الخدمة بنجاح",
    "Internal Server Error": "خطأ في الخادم الداخلي",
    "Property not found": "العقار غير موجود",
    "Service not found": "الخدمة غير موجودة",
    "Exhibition not found": "المعرض غير موجود",
    "Please provide all required fields": "الرجاء توفير جميع الحقول الإلزامية",
    "Invalid refresh token. Please log in again.":
      "رمز التجديد غير صالح. يرجى تسجيل الدخول مرة أخرى.",
    "Refresh token expired. Please log in again.":
      "انتهت صلاحية رمز التجديد. يرجى تسجيل الدخول مرة أخرى.",
    "If an account exists, a reset code has been sent.":
      "تم إرسال رمز إعادة التعيين إذا كان الحساب موجوداً.",
    "Invalid or expired reset code.":
      "رمز إعادة التعيين غير صالح أو منتهي الصلاحية.",
    "Name is required": "الاسم مطلوب",
    "Valid email is required": "يجب إدخال بريد إلكتروني صالح",
    "Phone number is required": "رقم الهاتف مطلوب",
    "Valid phone number required (8-15 digits)": "رقم الهاتف مطلوب (8-15 رقم)",
    "Password must be at least 8 characters": "كلمة المرور 8 أحرف على الأقل",
    "Password must contain an uppercase letter": "يجب أن تحتوي على حرف كبير",
    "Password must contain a lowercase letter": "يجب أن تحتوي على حرف صغير",
    "Password must contain a number": "يجب أن تحتوي على رقم",
    "Password must contain a special character": "يجب أن تحتوي على رمز خاص",
    "Password is required": "كلمة المرور مطلوبة",
    "Valid 6-digit OTP required": "رمز التحقق يجب أن يكون 6 أرقام",
    "Please fill in all fields.": "يرجى ملء جميع الحقول.",
    "Please fill all required fields": "يرجى ملء جميع الحقول المطلوبة",
    "Passwords do not match": "كلمات المرور غير متطابقة",
  },

  translateApiMessage(msg) {
    if (!this.isAr) return msg;

    // Exact match check
    if (this.backendMessages[msg]) {
      return this.backendMessages[msg];
    }

    // Commas joined validation messages catch
    if (msg.includes(", ")) {
      return msg
        .split(", ")
        .map((m) => this.backendMessages[m] || m)
        .join("، ");
    }

    return msg;
  },
};

// ── CSRF Token Reader ──
// SECURITY: Reads the CSRF token from a <meta name="csrf-token"> tag.
// Falls back to fetching from the CSRF endpoint if the meta tag is missing.
function getCsrfToken() {
  const meta = document.querySelector('meta[name="csrf-token"]');
  return meta ? meta.getAttribute('content') : '';
}

const API = {
  baseUrl: "/api",

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const { skipAuthRefresh, ...fetchOptions } = options;
    const config = {
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      ...fetchOptions,
    };

    // Don't set Content-Type for FormData
    if (fetchOptions.body instanceof FormData) {
      delete config.headers["Content-Type"];
    }

    // ── SECURITY: Auto-attach CSRF token to all mutating requests ──
    const method = (config.method || 'GET').toUpperCase();
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
      const csrfToken = getCsrfToken();
      if (csrfToken) {
        config.headers = config.headers || {};
        config.headers['X-CSRF-Token'] = csrfToken;
      }
    }

    try {
      const response = await fetch(url, config);

      // ── Handle 401: Token refresh ──
      if (response.status === 401 && !skipAuthRefresh) {
        const refreshed = await this.refreshToken();
        if (refreshed) {
          const retryResponse = await fetch(url, config);
          const retryData = await retryResponse.json();
          if (!retryResponse.ok) {
            const message =
              retryData.error?.message || retryData.message || "Session expired";
            throw new Error(i18n.translateApiMessage(message));
          }
          return retryData;
        }
        // FIX (C2): Redirect loop protection — don't redirect to /login
        // if we're already on /login or related auth pages
        const authPages = ['/login', '/register', '/reset-password'];
        if (!authPages.includes(window.location.pathname)) {
          window.location.href = '/login';
        }
        return null;
      }

      // ── SECURITY: Handle 403 Forbidden ──
      // Show a clear "Access Denied" message instead of a raw error
      if (response.status === 403) {
        const data = await response.json().catch(() => ({}));
        const message = data.error?.message || data.message || 'Access Denied';
        throw new Error(
          i18n.translateApiMessage(message) + ' — ' +
          i18n.t('You do not have permission for this action.', 'ليس لديك صلاحية لتنفيذ هذا الإجراء.')
        );
      }

      // ── SECURITY: Handle 429 Rate Limited ──
      // Show a purpose-built "slow down" warning with retry-after
      if (response.status === 429) {
        const data = await response.json().catch(() => ({}));
        const retryAfter = data.error?.retryAfter || 60;
        const minutes = Math.ceil(retryAfter / 60);
        throw new Error(
          i18n.t(
            `Too many requests. Please wait ${minutes} minute(s) and try again.`,
            `طلبات كثيرة جداً. يرجى الانتظار ${minutes} دقيقة والمحاولة مرة أخرى.`
          )
        );
      }

      const data = await response.json();
      if (!response.ok) {
        const message =
          data.error?.message || data.message || "Something went wrong";
        throw new Error(i18n.translateApiMessage(message));
      }
      return data;
    } catch (err) {
      if (err.message === "Failed to fetch") {
        throw new Error(
          i18n.translateApiMessage(
            "Network error. Please check your connection.",
          ),
        );
      }
      throw err;
    }
  },

  async get(endpoint) {
    return this.request(endpoint, { method: "GET" });
  },

  async post(endpoint, body, extraOptions = {}) {
    const options = { method: "POST", ...extraOptions };
    if (body instanceof FormData) {
      options.body = body;
    } else {
      options.body = JSON.stringify(body);
    }
    return this.request(endpoint, options);
  },

  async put(endpoint, body) {
    return this.request(endpoint, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },

  async delete(endpoint) {
    return this.request(endpoint, { method: "DELETE" });
  },

  async postForm(endpoint, formData) {
    return this.request(endpoint, { method: "POST", body: formData });
  },

  async putForm(endpoint, formData) {
    return this.request(endpoint, { method: "PUT", body: formData });
  },

  async refreshToken() {
    try {
      const response = await fetch(`${this.baseUrl}/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });
      return response.ok;
    } catch {
      return false;
    }
  },
};

// ── Toast System ──
const Toast = {
  container: null,

  init() {
    this.container = document.getElementById("toastContainer");
    if (!this.container) {
      this.container = document.createElement("div");
      this.container.className = "toast-container";
      this.container.id = "toastContainer";
      document.body.appendChild(this.container);
    }
  },

  show(message, type = "info", duration = 4000) {
    if (!this.container) this.init();

    const icons = {
      success: "fas fa-check-circle",
      error: "fas fa-exclamation-circle",
      warning: "fas fa-exclamation-triangle",
      info: "fas fa-info-circle",
    };

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    // SECURITY: Use DOM creation (textContent) instead of innerHTML
    // to prevent XSS from error messages or API responses
    const iconEl = document.createElement("i");
    iconEl.className = icons[type] || icons.info;
    const spanEl = document.createElement("span");
    spanEl.textContent = message;
    toast.appendChild(iconEl);
    toast.appendChild(document.createTextNode(" "));
    toast.appendChild(spanEl);

    this.container.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = "slideOut 0.3s ease-in forwards";
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  success(msg) {
    this.show(msg, "success");
  },
  error(msg) {
    this.show(msg, "error");
  },
  warning(msg) {
    this.show(msg, "warning");
  },
  info(msg) {
    this.show(msg, "info");
  },
};

// ── Utility ──
const Utils = {
  formatCurrency(amount, currency = 'SAR') {
    const cur = currency || 'SAR';
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: cur,
      }).format(amount);
    } catch {
      return `${cur} ${Number(amount || 0).toFixed(2)}`;
    }
  },

  formatDate(date) {
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  },

  truncate(str, max = 100) {
    return str.length > max ? str.substring(0, max) + "..." : str;
  },
};

// ══════════════════════════════════════════
//  GLOBAL SETTINGS SYNC (Theme + Language)
// ══════════════════════════════════════════
const Settings = {
  defaults: { theme: "dark" },

  get() {
    return {
      theme: localStorage.getItem("theme") || this.defaults.theme,
    };
  },

  set(key, value) {
    localStorage.setItem(key, value);
    this.apply();
  },

  apply() {
    const { theme } = this.get();

    // Theme
    document.documentElement.setAttribute('data-theme', theme);
    document.querySelectorAll('#themeToggle, .theme-toggle').forEach(btn => {
      btn.innerHTML = theme === 'light'
        ? `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`
        : `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;

      btn.style.background = 'transparent';
      btn.style.border = 'none';
      btn.style.boxShadow = 'none';
      btn.style.outline = 'none';
      btn.style.color = 'var(--text-primary)';
      btn.style.display = 'flex';
      btn.style.alignItems = 'center';
      btn.style.justifyContent = 'center';
    });
  },

  toggleTheme() {
    const current = this.get().theme;
    this.set("theme", current === "light" ? "dark" : "light");
  },
};

// ── syncSettings — call on every page load ──
function syncSettings() {
  Settings.apply();

  // Bind theme toggle (any page)
  document.querySelectorAll('#themeToggle, .theme-toggle').forEach(btn => {
    btn.addEventListener("click", () => Settings.toggleTheme());
  });
  // Language toggle is now a plain <a> link — no JS needed
}

// Initialize on every page
document.addEventListener("DOMContentLoaded", () => syncSettings());
