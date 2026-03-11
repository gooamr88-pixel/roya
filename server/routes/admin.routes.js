// ═══════════════════════════════════════════════
// Admin Routes
// ═══════════════════════════════════════════════
const router = require('express').Router();
const ctrl = require('../controllers/admin.controller');
const { authenticate, authorize, checkPermission } = require('../middlewares/auth');
const { idParamValidation } = require('../middlewares/validators');

router.use(authenticate);
router.use(authorize('super_admin', 'admin', 'supervisor'));

router.get('/stats', ctrl.getStats);
router.get('/search', ctrl.globalSearch);
router.get('/users', ctrl.getUsers);
router.put('/users/:id', authorize('super_admin'), idParamValidation, ctrl.updateUser);
router.get('/roles', ctrl.getRoles);
router.put('/roles/:id', authorize('super_admin'), checkPermission('manage_roles'), idParamValidation, ctrl.updateRole);
router.get('/logs', authorize('super_admin'), checkPermission('view_logs'), ctrl.getLogs);
router.delete('/logs', authorize('super_admin'), ctrl.clearLogs);

// Messages
router.get('/messages', ctrl.getMessages);
router.put('/messages/:id/reply', idParamValidation, ctrl.replyMessage);
router.put('/messages/:id/note', idParamValidation, ctrl.updateMessageNote);
router.delete('/messages/:id', idParamValidation, ctrl.deleteMessage);

module.exports = router;
