// ═══════════════════════════════════════════════
// Notification Routes
// ═══════════════════════════════════════════════
const router = require('express').Router();
const ctrl = require('../controllers/notification.controller');
const { authenticate } = require('../middlewares/auth');

router.use(authenticate);

router.get('/', ctrl.getAll);
router.put('/read-all', ctrl.markAllRead);
router.put('/:id/read', ctrl.markRead);

module.exports = router;
