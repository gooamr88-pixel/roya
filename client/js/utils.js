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
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${text || 'Please wait...'}`;
        btn.disabled = true;
    } else {
        btn.innerHTML = btn.dataset.original || btn.innerHTML;
        btn.disabled = false;
    }
}

/**
 * Format a numeric amount as USD currency.
 * @param {number} amount
 * @returns {string}
 */
function fmtPrice(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency', currency: 'USD', maximumFractionDigits: 0,
    }).format(amount);
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
