// ═══════════════════════════════════════════════
// Admin Controller — Thin HTTP layer
// ═══════════════════════════════════════════════
const adminService = require('../services/admin.service');
const { asyncHandler } = require('../utils/helpers');

/**
 * GET /api/admin/stats
 */
const getStats = asyncHandler(async (req, res) => {
    const data = await adminService.getDashboardStats();
    res.json({ success: true, data });
});

/**
 * GET /api/admin/users
 */
const getUsers = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search;
    const { rows, pagination } = await adminService.getUsersPaginated({ page, limit, search });
    res.json({ success: true, data: { users: rows, pagination } });
});

/**
 * PUT /api/admin/users/:id
 */
const updateUser = asyncHandler(async (req, res) => {
    const user = await adminService.updateUser(req.params.id, req.body);
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
 */
const updateRole = asyncHandler(async (req, res) => {
    const role = await adminService.updateRole(req.params.id, req.body.permissions_json);
    res.json({ success: true, data: { role } });
});

/**
 * GET /api/admin/logs
 */
const getLogs = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const data = await adminService.getLogs({ page, limit });
    res.json({ success: true, data });
});

/**
 * DELETE /api/admin/logs
 */
const clearLogs = asyncHandler(async (req, res) => {
    await adminService.clearLogs();
    res.json({ success: true, message: 'All login logs cleared successfully.' });
});

/**
 * GET /api/admin/search
 */
const globalSearch = asyncHandler(async (req, res) => {
    const results = await adminService.globalSearch(req.query.q);
    res.json({ success: true, data: { results } });
});

/**
 * GET /api/admin/messages
 */
const getMessages = asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 15);
    const status = req.query.status || '';
    const { rows, pagination } = await adminService.getMessages({ page, limit, status });
    res.json({ success: true, data: { messages: rows, pagination } });
});

/**
 * PUT /api/admin/messages/:id/reply
 */
const replyMessage = asyncHandler(async (req, res, next) => {
    const contactCtrl = require('./contact.controller');
    await contactCtrl.reply(req, res, next);
});

/**
 * PUT /api/admin/messages/:id/note
 */
const updateMessageNote = asyncHandler(async (req, res, next) => {
    const contactCtrl = require('./contact.controller');
    await contactCtrl.updateNote(req, res, next);
});

/**
 * DELETE /api/admin/messages/:id
 */
const deleteMessage = asyncHandler(async (req, res) => {
    await adminService.deleteMessage(req.params.id);
    res.json({ success: true, message: 'Message deleted successfully.' });
});

module.exports = {
    getStats, getUsers, updateUser, getRoles, updateRole,
    getLogs, clearLogs, globalSearch, getMessages, replyMessage,
    updateMessageNote, deleteMessage,
};
