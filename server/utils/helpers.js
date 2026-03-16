// ═══════════════════════════════════════════════
// Shared Helpers — DRY utilities for the backend
// ═══════════════════════════════════════════════

/**
 * parseBool — safely coerce FormData / JSON boolean values.
 * FormData sends booleans as strings ('true', 'false', '1', '0').
 * JSON sends real booleans. This handles both.
 *
 * @param {*} val
 * @returns {boolean}
 */
function parseBool(val) {
    if (typeof val === 'boolean') return val;
    return val === '1' || val === 'true';
}

/**
 * Escape HTML special characters to prevent XSS in email templates.
 * This MUST be used for any user-supplied data rendered inside HTML emails.
 *
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * asyncHandler — wraps an async Express route handler to automatically
 * catch errors and forward them to next(). Eliminates the need for
 * manual try/catch in every controller method.
 *
 * Usage:
 *   router.get('/foo', asyncHandler(async (req, res) => { ... }));
 *
 * @param {Function} fn - Async route handler (req, res, next)
 * @returns {Function}
 */
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

module.exports = { parseBool, escapeHtml, asyncHandler };
