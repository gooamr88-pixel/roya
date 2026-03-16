// ═══════════════════════════════════════════════
// Admin Routes — PHASE 2: Strict RBAC + rate limiting
// ═══════════════════════════════════════════════
const router = require('express').Router();
const ctrl = require('../controllers/admin.controller');
const { authenticate, authorize, checkPermission } = require('../middlewares/auth');
const { idParamValidation } = require('../middlewares/validators');
const { strictApiLimiter } = require('../middlewares/rateLimiter');

// ── All admin routes require authentication + admin role ──
router.use(authenticate);
router.use(authorize('super_admin', 'admin', 'supervisor'));
router.use(strictApiLimiter); // 100 req/15min for admin endpoints

// ── Dashboard Stats ──
router.get('/stats', ctrl.getStats);

// ── Global Search ──
router.get('/search', ctrl.globalSearch);

// ── User Management ──
router.get('/users', checkPermission('manage_users'), ctrl.getUsers);
router.put('/users/:id', authorize('super_admin'), checkPermission('manage_users'), idParamValidation, ctrl.updateUser);

// ── Role Management ──
router.get('/roles', checkPermission('manage_roles'), ctrl.getRoles);
router.put('/roles/:id', authorize('super_admin'), checkPermission('manage_roles'), idParamValidation, ctrl.updateRole);

// ── Login Logs ──
router.get('/logs', authorize('super_admin'), checkPermission('view_logs'), ctrl.getLogs);
router.delete('/logs', authorize('super_admin'), checkPermission('view_logs'), ctrl.clearLogs);

// ── Messages ──
router.get('/messages', checkPermission('manage_messages'), ctrl.getMessages);
router.put('/messages/:id/reply', checkPermission('manage_messages'), idParamValidation, ctrl.replyMessage);
router.put('/messages/:id/note', checkPermission('manage_messages'), idParamValidation, ctrl.updateMessageNote);
router.delete('/messages/:id', authorize('super_admin', 'admin'), checkPermission('manage_messages'), idParamValidation, ctrl.deleteMessage);

module.exports = router;
