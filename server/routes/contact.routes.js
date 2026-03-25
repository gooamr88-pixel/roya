// ═══════════════════════════════════════════════
// Contact Routes — PHASE 2: Rate limiting + CSRF for spam prevention
// ═══════════════════════════════════════════════
const router = require('express').Router();
const ctrl = require('../controllers/contact.controller');
const { authenticate, authorize } = require('../middlewares/auth');
const { contactLimiter } = require('../middlewares/rateLimiter');
const { idParamValidation } = require('../middlewares/validators');
const { csrfToken, csrfProtection } = require('../middlewares/csrf');

// Public — get CSRF token (for contact form page)
router.get('/csrf-token', csrfToken, (req, res) => {
    res.json({ csrfToken: res.locals.csrfToken });
});

// Public — submit contact message (5 per hour + CSRF protection)
router.post('/', contactLimiter, csrfProtection, ctrl.submit);

// Admin — list all contacts
router.get('/admin', authenticate, authorize('super_admin', 'admin', 'supervisor'), ctrl.getAll);

// Admin — reply to contact
router.post('/admin/:id/reply', authenticate, authorize('super_admin', 'admin'), idParamValidation, ctrl.reply);

// Admin — save internal note
router.put('/admin/:id/note', authenticate, authorize('super_admin', 'admin', 'supervisor'), idParamValidation, ctrl.updateNote);

module.exports = router;
