// ═══════════════════════════════════════════════
// Admin Routes — PHASE 3: Strict RBAC + Input Validation + Rate Limiting
//
// SECURITY FIXES:
// ✅ Replaced fragile double-chaining authorize() with authorizeRole()
// ✅ Added input validation chains on all mutating endpoints
// ✅ Added pagination validation on all list endpoints
// ✅ Added search query validation with length cap
// ✅ Added message status whitelist validation
// ═══════════════════════════════════════════════
const router = require('express').Router();
const ctrl = require('../controllers/admin.controller');
const { authenticate, authorizeRole, checkPermission } = require('../middlewares/auth');
const {
    idParamValidation,
    paginationValidation,
    adminUpdateUserValidation,
    adminUpdateRoleValidation,
    adminSearchValidation,
    adminMessageStatusValidation,
} = require('../middlewares/validators');
const { strictApiLimiter } = require('../middlewares/rateLimiter');

// ── All admin routes require authentication + minimum admin-tier role ──
// SECURITY: authorizeRole uses hierarchical weight-based check.
// supervisor (1) < editor (2) < admin (3) < super_admin (4)
// Using 'supervisor' as min allows supervisor, admin, and super_admin.
router.use(authenticate);
router.use(authorizeRole('supervisor'));
router.use(strictApiLimiter); // 100 req/15min for admin endpoints

// ── Dashboard Stats ──
router.get('/stats', ctrl.getStats);

// ── Global Search ──
// SECURITY: adminSearchValidation caps query length at 100 chars
router.get('/search', adminSearchValidation, ctrl.globalSearch);

// ── User Management ──
// SECURITY: paginationValidation caps limit at 100 and enforces positive integers
router.get('/users', checkPermission('manage_users'), paginationValidation, ctrl.getUsers);
// SECURITY: authorizeRole('super_admin') is clear — only weight >= 4 passes.
// adminUpdateUserValidation whitelists body fields with strict types.
router.put('/users/:id',
    authorizeRole('super_admin'),
    checkPermission('manage_users'),
    idParamValidation,
    adminUpdateUserValidation,
    ctrl.updateUser
);

// ── Role Management ──
router.get('/roles', checkPermission('manage_roles'), ctrl.getRoles);
// SECURITY: adminUpdateRoleValidation ensures permissions_json is a string array
router.put('/roles/:id',
    authorizeRole('super_admin'),
    checkPermission('manage_roles'),
    idParamValidation,
    adminUpdateRoleValidation,
    ctrl.updateRole
);

// ── Login Logs ──
router.get('/logs',
    authorizeRole('super_admin'),
    checkPermission('view_logs'),
    paginationValidation,
    ctrl.getLogs
);
router.delete('/logs',
    authorizeRole('super_admin'),
    checkPermission('view_logs'),
    ctrl.clearLogs
);

// ── Messages ──
router.get('/messages',
    checkPermission('manage_messages'),
    paginationValidation,
    adminMessageStatusValidation,
    ctrl.getMessages
);
router.put('/messages/:id/reply',
    checkPermission('manage_messages'),
    idParamValidation,
    ctrl.replyMessage
);
router.put('/messages/:id/note',
    checkPermission('manage_messages'),
    idParamValidation,
    ctrl.updateMessageNote
);
router.delete('/messages/:id',
    authorizeRole('admin'),
    checkPermission('manage_messages'),
    idParamValidation,
    ctrl.deleteMessage
);

module.exports = router;
