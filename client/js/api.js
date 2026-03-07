// ═══════════════════════════════════════════════
// API Client — Shared fetch wrapper + Global Settings
// ═══════════════════════════════════════════════

// ── i18n Helper — detect page language for bilingual messages ──
const i18n = {
    isAr: document.documentElement.lang === 'ar',
    t(en, ar) { return this.isAr ? ar : en; },

    // API Interceptor mapping
    backendMessages: {
        "User created successfully": "تم إنشاء الحساب بنجاح",
        "Username already exists": "اسم المستخدم موجود بالفعل",
        "Email already in use": "البريد الإلكتروني مستخدم بالفعل",
        "Invalid credentials": "بيانات الاعتماد غير صالحة",
        "Invalid token": "رمز غير صالح",
        "No token provided": "لم يتم توفير رمز",
        "Service requested successfully": "تم طلب الخدمة بنجاح",
        "Internal Server Error": "خطأ في الخادم الداخلي",
        "Property not found": "العقار غير موجود",
        "Service not found": "الخدمة غير موجودة",
        "Exhibition not found": "المعرض غير موجود",
        "Please provide all required fields": "الرجاء توفير جميع الحقول الإلزامية"
    },

    translateApiMessage(msg) {
        if (this.isAr && this.backendMessages[msg]) {
            return this.backendMessages[msg];
        }
        return msg;
    }
};

const API = {
    baseUrl: '/api',

    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        const { skipAuthRefresh, ...fetchOptions } = options;
        const config = {
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            ...fetchOptions,
        };

        // Don't set Content-Type for FormData
        if (fetchOptions.body instanceof FormData) {
            delete config.headers['Content-Type'];
        }

        try {
            const response = await fetch(url, config);

            // Handle token refresh — but NOT for auth endpoints (login, register, etc.)
            if (response.status === 401 && !skipAuthRefresh) {
                const refreshed = await this.refreshToken();
                if (refreshed) {
                    return fetch(url, config).then(r => r.json());
                }
                // Redirect to login
                window.location.href = '/login';
                return null;
            }

            const data = await response.json();
            if (!response.ok) {
                const message = data.error?.message || data.message || 'Something went wrong';
                throw new Error(i18n.translateApiMessage(message));
            }
            return data;
        } catch (err) {
            if (err.message === 'Failed to fetch') {
                throw new Error(i18n.translateApiMessage('Network error. Please check your connection.'));
            }
            throw err;
        }
    },

    async get(endpoint) {
        return this.request(endpoint, { method: 'GET' });
    },

    async post(endpoint, body, extraOptions = {}) {
        const options = { method: 'POST', ...extraOptions };
        if (body instanceof FormData) {
            options.body = body;
        } else {
            options.body = JSON.stringify(body);
        }
        return this.request(endpoint, options);
    },

    async put(endpoint, body) {
        return this.request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(body),
        });
    },

    async delete(endpoint) {
        return this.request(endpoint, { method: 'DELETE' });
    },

    async postForm(endpoint, formData) {
        return this.request(endpoint, { method: 'POST', body: formData });
    },

    async putForm(endpoint, formData) {
        return this.request(endpoint, { method: 'PUT', body: formData });
    },

    async refreshToken() {
        try {
            const response = await fetch(`${this.baseUrl}/auth/refresh`, {
                method: 'POST',
                credentials: 'same-origin',
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
        this.container = document.getElementById('toastContainer');
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.className = 'toast-container';
            this.container.id = 'toastContainer';
            document.body.appendChild(this.container);
        }
    },

    show(message, type = 'info', duration = 4000) {
        if (!this.container) this.init();

        const icons = {
            success: 'fas fa-check-circle',
            error: 'fas fa-exclamation-circle',
            warning: 'fas fa-exclamation-triangle',
            info: 'fas fa-info-circle',
        };

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        // Use DOM creation instead of innerHTML to prevent XSS from error messages
        const iconEl = document.createElement('i');
        iconEl.className = icons[type] || icons.info;
        const spanEl = document.createElement('span');
        spanEl.textContent = message;
        toast.appendChild(iconEl);
        toast.appendChild(document.createTextNode(' '));
        toast.appendChild(spanEl);

        this.container.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease-in forwards';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    },

    success(msg) { this.show(msg, 'success'); },
    error(msg) { this.show(msg, 'error'); },
    warning(msg) { this.show(msg, 'warning'); },
    info(msg) { this.show(msg, 'info'); },
};

// ── Utility ──
const Utils = {
    formatCurrency(amount) {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
    },

    formatDate(date) {
        return new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    },

    truncate(str, max = 100) {
        return str.length > max ? str.substring(0, max) + '...' : str;
    },
};

// ══════════════════════════════════════════
//  GLOBAL SETTINGS SYNC (Theme + Language)
// ══════════════════════════════════════════
const Settings = {
    defaults: { theme: 'dark' },

    get() {
        return {
            theme: localStorage.getItem('theme') || this.defaults.theme,
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
        const themeBtn = document.getElementById('themeToggle');
        if (themeBtn) {
            const icon = themeBtn.querySelector('i');
            if (icon) icon.className = theme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
        }
    },

    toggleTheme() {
        const current = this.get().theme;
        this.set('theme', current === 'light' ? 'dark' : 'light');
    },
};

// ── syncSettings — call on every page load ──
function syncSettings() {
    Settings.apply();

    // Bind theme toggle (any page)
    const themeBtn = document.getElementById('themeToggle');
    if (themeBtn) {
        themeBtn.addEventListener('click', () => Settings.toggleTheme());
    }
    // Language toggle is now a plain <a> link — no JS needed
}

// Initialize on every page
document.addEventListener('DOMContentLoaded', () => syncSettings());
