// ═══════════════════════════════════════════════
// Contact Routes — PHASE 3: Validation + Rate Limiting + CSRF
//
// SECURITY FIXES:
// ✅ Added express-validator chain on POST / (submit)
// ✅ Added email-specific rate limiter on admin reply (10/15min)
// ✅ CSRF protection on public submit
// ✅ All ID params validated
// ═══════════════════════════════════════════════
const router = require('express').Router();
const ctrl = require('../controllers/contact.controller');
const { authenticate, authorizeRole } = require('../middlewares/auth');
const { contactLimiter } = require('../middlewares/rateLimiter');
const { idParamValidation } = require('../middlewares/validators');
const { csrfToken, csrfProtection } = require('../middlewares/csrf');
const { body } = require('express-validator');
const { validate } = require('../middlewares/validators');
const rateLimit = require('express-rate-limit');

// ── Reply-specific rate limiter ──
// SECURITY: Prevents a compromised admin account from being used as a spam relay.
// 10 email replies per 15 minutes is generous for legitimate admin use,
// but blocks bulk email abuse.
const replyEmailLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
    message: {
        success: false,
        error: {
            code: 'RATE_LIMIT',
            message: 'Too many email replies. Please wait before sending more.',
            retryAfter: 900,
        },
    },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: false },
});

// ── Contact Submit Validation Chain ──
// SECURITY: Validates and sanitizes all fields before they reach the controller.
const contactSubmitValidation = [
    body('name').trim().notEmpty().withMessage('Name is required')
        .isLength({ max: 200 }).withMessage('Name must not exceed 200 characters'),
    body('email').trim().isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('subject').optional().trim().isLength({ max: 500 })
        .withMessage('Subject must not exceed 500 characters'),
    body('message').trim().notEmpty().withMessage('Message is required')
        .isLength({ min: 10, max: 5000 }).withMessage('Message must be 10-5000 characters'),
    validate,
];

// ── Reply Validation Chain ──
const replyValidation = [
    body('reply_message').trim().notEmpty().withMessage('Reply message is required')
        .isLength({ max: 5000 }).withMessage('Reply must not exceed 5000 characters'),
    validate,
];

// ── Note Validation Chain ──
const noteValidation = [
    body('internal_notes').optional({ values: 'null' }).trim()
        .isLength({ max: 2000 }).withMessage('Notes must not exceed 2000 characters'),
    validate,
];

// ═══════════════════════════════════════════════
// Public Routes
// ═══════════════════════════════════════════════

// Get CSRF token (for contact form page)
router.get('/csrf-token', csrfToken, (req, res) => {
    res.json({ csrfToken: res.locals.csrfToken });
});

// Submit contact message (5 per hour + CSRF + validation)
router.post('/',
    contactLimiter,
    csrfProtection,
    contactSubmitValidation,
    ctrl.submit
);

// ═══════════════════════════════════════════════
// Admin Routes
// ═══════════════════════════════════════════════

// List all contacts
router.get('/admin',
    authenticate,
    authorizeRole('supervisor'),
    ctrl.getAll
);

// Reply to contact (with email rate limit)
// SECURITY: replyEmailLimiter prevents spam relay abuse
router.post('/admin/:id/reply',
    authenticate,
    authorizeRole('admin'),
    replyEmailLimiter,
    idParamValidation,
    replyValidation,
    ctrl.reply
);

// Save internal note
router.put('/admin/:id/note',
    authenticate,
    authorizeRole('supervisor'),
    idParamValidation,
    noteValidation,
    ctrl.updateNote
);

module.exports = router;
