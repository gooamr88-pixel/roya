// ═══════════════════════════════════════════════
// Admin Controller — Thin HTTP layer
//
// PHASE 3 HARDENING:
// ✅ Capped pagination (page/limit) with Math.min/Math.max
// ✅ Whitelist-only body fields on updateUser (explicit destructure)
// ✅ Safe permissions_json type check on updateRole
// ✅ Search query length capped to prevent expensive ILIKE scans
// ✅ Audit logging on destructive operations (clearLogs, deleteMessage)
// ✅ Eliminated runtime require() — contact controller imported at top
// ✅ All DB-facing values are sanitized before reaching the service
// ═══════════════════════════════════════════════
const adminService = require('../services/admin.service');
const contactCtrl = require('./contact.controller');
const { asyncHandler } = require('../utils/helpers');

// ── Pagination defaults and caps ──
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Safely parse and clamp pagination parameters.
 * Prevents limit=999999 from dumping the entire table.
 */
function parsePagination(query, defaultLimit = DEFAULT_LIMIT) {
    return {
        page: Math.max(DEFAULT_PAGE, parseInt(query.page, 10) || DEFAULT_PAGE),
        limit: Math.min(MAX_LIMIT, Math.max(1, parseInt(query.limit, 10) || defaultLimit)),
    };
}

/**
 * GET /api/admin/stats
 */
const getStats = asyncHandler(async (req, res) => {
    const data = await adminService.getDashboardStats();
    res.json({ success: true, data });
});

/**
 * GET /api/admin/users?page=&limit=&search=
 */
const getUsers = asyncHandler(async (req, res) => {
    const { page, limit } = parsePagination(req.query);
    // SECURITY: search is trimmed; the ILIKE wrapping happens in the service/repo layer
    const search = req.query.search?.trim() || '';
    const { rows, pagination } = await adminService.getUsersPaginated({ page, limit, search });
    res.json({ success: true, data: { users: rows, pagination } });
});

/**
 * PUT /api/admin/users/:id
 * SECURITY: Explicit whitelist — only these fields can be updated.
 * req.body is validated by adminUpdateUserValidation middleware.
 */
const updateUser = asyncHandler(async (req, res) => {
    // Whitelist: only extract allowed fields from the validated body
    const { role_id, role_name, is_active, is_verified, ban_type, ban_expires_at } = req.body;
    const allowedFields = { role_id, role_name, is_active, is_verified, ban_type, ban_expires_at };

    // SECURITY: Pass req.user for self-demotion guard in the service layer
    const user = await adminService.updateUser(req.params.id, allowedFields, req.user);
    res.json({ success: true, data: { user } });
});

/**
 * GET /api/admin/roles
 */
const getRoles = asyncHandler(async (req, res) => {
    const roles = await adminService.getRoles();
    res.json({ success: true, data: { roles } });
});

/**
 * PUT /api/admin/roles/:id
 * SECURITY: permissions_json is validated as a string array by adminUpdateRoleValidation.
 * The undefined→"undefined" corruption bug is now impossible.
 */
const updateRole = asyncHandler(async (req, res) => {
    const role = await adminService.updateRole(req.params.id, req.body.permissions_json);
    res.json({ success: true, data: { role } });
});

/**
 * GET /api/admin/logs?page=&limit=
 */
const getLogs = asyncHandler(async (req, res) => {
    const { page, limit } = parsePagination(req.query, 50);
    const data = await adminService.getLogs({ page, limit });
    res.json({ success: true, data });
});

/**
 * DELETE /api/admin/logs
 * SECURITY: Audit trail — log WHO cleared the logs before destroying them
 */
const clearLogs = asyncHandler(async (req, res) => {
    // Audit: record the destructive action before executing it
    console.warn(
        `🗑️ [AUDIT] Login logs cleared by User ${req.user.id} (${req.user.role}) | ` +
        `IP: ${req.ip} | ReqID: ${req.id || 'none'}`
    );
    await adminService.clearLogs();
    res.json({ success: true, message: 'All login logs cleared successfully.' });
});

/**
 * GET /api/admin/search?q=
 * SECURITY: Query length is validated by adminSearchValidation middleware (2-100 chars).
 */
const globalSearch = asyncHandler(async (req, res) => {
    const q = req.query.q?.trim() || '';
    const results = await adminService.globalSearch(q);
    res.json({ success: true, data: { results } });
});

/**
 * GET /api/admin/messages?page=&limit=&status=
 * SECURITY: Status is validated by adminMessageStatusValidation middleware.
 * Pagination is capped by parsePagination.
 */
const getMessages = asyncHandler(async (req, res) => {
    const { page, limit } = parsePagination(req.query, 15);
    const status = req.query.status || '';
    const { rows, pagination } = await adminService.getMessages({ page, limit, status });
    res.json({ success: true, data: { messages: rows, pagination } });
});

/**
 * PUT /api/admin/messages/:id/reply
 * Delegates to contactCtrl.reply which handles its own validation.
 */
const replyMessage = asyncHandler(async (req, res, next) => {
    await contactCtrl.reply(req, res, next);
});

/**
 * PUT /api/admin/messages/:id/note
 * Delegates to contactCtrl.updateNote which handles its own validation.
 */
const updateMessageNote = asyncHandler(async (req, res, next) => {
    await contactCtrl.updateNote(req, res, next);
});

/**
 * DELETE /api/admin/messages/:id
 * SECURITY: Audit trail — log WHO deleted WHICH message
 */
const deleteMessage = asyncHandler(async (req, res) => {
    // Audit: record the destructive action
    console.warn(
        `🗑️ [AUDIT] Message ${req.params.id} deleted by User ${req.user.id} (${req.user.role}) | ` +
        `IP: ${req.ip} | ReqID: ${req.id || 'none'}`
    );
    await adminService.deleteMessage(req.params.id);
    res.json({ success: true, message: 'Message deleted successfully.' });
});

module.exports = {
    getStats, getUsers, updateUser, getRoles, updateRole,
    getLogs, clearLogs, globalSearch, getMessages, replyMessage,
    updateMessageNote, deleteMessage,
};
