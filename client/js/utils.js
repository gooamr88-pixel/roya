// ═══════════════════════════════════════════════
// Shared Utilities — Loaded globally via base.njk
// Depends on: api.js (API, Toast, Utils, Settings)
// ═══════════════════════════════════════════════

/**
 * HTML-escape a string to prevent XSS in innerHTML.
 * @param {string} str
 * @returns {string}
 */
function esc(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

/**
 * Resolve a bilingual DB field based on the active locale.
 * If Arabic is active and obj[field + '_ar'] exists, returns it.
 * Otherwise falls back to obj[field].
 * @param {object} obj - The API data object (e.g. service, job, exhibition)
 * @param {string} field - The base field name (e.g. 'title', 'description', 'category')
 * @returns {string}
 */
function localize(obj, field) {
    if (!obj) return '';
    const lang = document.documentElement.lang;
    if (lang === 'ar' && obj[field + '_ar']) return obj[field + '_ar'];
    return obj[field] || '';
}

/**
 * Map an order/item status to a badge colour class.
 * @param {string} status
 * @returns {string}
 */
function statusColor(status) {
    return {
        pending: 'warning', confirmed: 'info', in_progress: 'info',
        completed: 'success', cancelled: 'danger',
    }[status] || 'primary';
}

/**
 * Toggle a button between its normal state and a spinner.
 * @param {HTMLElement} btn
 * @param {boolean} loading
 * @param {string} [text='Please wait...'] — spinner label
 */
function setLoading(btn, loading, text) {
    if (!btn) return;
    if (loading) {
        btn.dataset.original = btn.innerHTML;
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${text || (typeof i18n !== 'undefined' ? i18n.t('Please wait...', 'يرجى الانتظار...') : 'Please wait...')}`;
        btn.disabled = true;
    } else {
        btn.innerHTML = btn.dataset.original || btn.innerHTML;
        btn.disabled = false;
    }
}

/**
 * Format a numeric amount with the given currency.
 * @param {number} amount
 * @param {string} [currency='SAR']
 * @returns {string}
 */
function fmtPrice(amount, currency = 'SAR') {
    const cur = currency || 'SAR';
    try {
        return new Intl.NumberFormat('en-US', {
            style: 'currency', currency: cur, maximumFractionDigits: 0,
        }).format(amount);
    } catch {
        return `${cur} ${Number(amount || 0).toFixed(0)}`;
    }
}

/**
 * Format a service price — supports fixed price and price range.
 * @param {object} service - Service object with price, price_type, price_max, currency
 * @returns {string}
 */
function fmtServicePrice(service) {
    if (!service) return '';
    const cur = service.currency || 'SAR';
    const price = parseFloat(service.price) || 0;
    const priceMax = parseFloat(service.price_max) || 0;

    if (service.price_type === 'range' && priceMax > 0) {
        return `${fmtPrice(price, cur)} – ${fmtPrice(priceMax, cur)}`;
    }
    return fmtPrice(price, cur);
}

/**
 * Safely extract the first image URL from a JSON string or array.
 * @param {string|Array} images
 * @param {string} fallback
 * @returns {string}
 */
function getImageUrl(images, fallback) {
    const arr = Array.isArray(images)
        ? images
        : (typeof images === 'string' ? (() => { try { return JSON.parse(images); } catch { return []; } })() : []);
    return arr[0] || fallback;
}

/**
 * Render pagination buttons into a container.
 * @param {{ page: number, totalPages: number }} pagination
 * @param {string} containerId
 * @param {function(number): void} callback
 */
function renderPagination(pagination, containerId, callback) {
    const container = document.getElementById(containerId);
    if (!container || !pagination || pagination.totalPages <= 1) {
        if (container) container.innerHTML = '';
        return;
    }
    const prev = i18n.t('← Prev', '← السابق');
    const next = i18n.t('Next →', 'التالي →');
    let html = `<button ${pagination.page <= 1 ? 'disabled' : ''} data-page="${pagination.page - 1}">${prev}</button>`;
    const maxPages = Math.min(pagination.totalPages, 7);
    const startPage = Math.max(1, pagination.page - 3);
    const endPage = Math.min(pagination.totalPages, startPage + maxPages - 1);
    if (startPage > 1) html += `<button data-page="1">1</button><span style="padding:0 4px;color:var(--text-muted)">…</span>`;
    for (let i = startPage; i <= endPage; i++) {
        html += `<button class="${i === pagination.page ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }
    if (endPage < pagination.totalPages) html += `<span style="padding:0 4px;color:var(--text-muted)">…</span><button data-page="${pagination.totalPages}">${pagination.totalPages}</button>`;
    html += `<button ${pagination.page >= pagination.totalPages ? 'disabled' : ''} data-page="${pagination.page + 1}">${next}</button>`;
    container.innerHTML = html;
    container.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
            const p = parseInt(btn.dataset.page);
            if (p >= 1 && p <= pagination.totalPages) callback(p);
        });
    });
}
