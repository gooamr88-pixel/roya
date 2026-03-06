// ═══════════════════════════════════════════════
// Contact Routes
// ═══════════════════════════════════════════════
const router = require('express').Router();
const ctrl = require('../controllers/contact.controller');
const { authenticate, authorize } = require('../middlewares/auth');
const { apiLimiter } = require('../middlewares/rateLimiter');
const { idParamValidation } = require('../middlewares/validators');

// Public — submit contact message
router.post('/', apiLimiter, ctrl.submit);

// Admin — list all contacts
router.get('/admin', authenticate, authorize('super_admin', 'admin', 'supervisor'), ctrl.getAll);

// Admin — reply to contact
router.post('/admin/:id/reply', authenticate, authorize('super_admin', 'admin'), idParamValidation, ctrl.reply);

// Admin — save internal note
router.put('/admin/:id/note', authenticate, authorize('super_admin', 'admin', 'supervisor'), idParamValidation, ctrl.updateNote);

module.exports = router;
