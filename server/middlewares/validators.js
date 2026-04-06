// ═══════════════════════════════════════════════
// Validators — Input Validation Chains
// ═══════════════════════════════════════════════
const { body, param, query: queryValidator, validationResult } = require('express-validator');
const { AppError } = require('./errorHandler');

/**
 * Handle validation errors
 */
const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const messages = errors.array().map(e => e.msg).join(', ');
        return next(new AppError(messages, 400, 'VALIDATION_ERROR'));
    }
    next();
};

// ── Auth Validators ──
const registerValidation = [
    body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 100 }),
    body('email').trim().isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('phone').trim().notEmpty().withMessage('Phone number is required').matches(/^\+?[0-9]{8,15}$/).withMessage('Valid phone number required (8-15 digits)'),
    body('password')
        .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
        .matches(/[A-Z]/).withMessage('Password must contain an uppercase letter')
        .matches(/[a-z]/).withMessage('Password must contain a lowercase letter')
        .matches(/[0-9]/).withMessage('Password must contain a number')
        .matches(/[!@#$%^&*]/).withMessage('Password must contain a special character'),
    validate,
];

const loginValidation = [
    body('email').trim().isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
    validate,
];

const otpValidation = [
    body('email').trim().isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('otp').trim().isLength({ min: 6, max: 6 }).isNumeric().withMessage('Valid 6-digit OTP required'),
    validate,
];

const forgotPasswordValidation = [
    body('email').trim().isEmail().normalizeEmail().withMessage('Valid email is required'),
    validate,
];

const resetPasswordValidation = [
    // BUG FIX #3: Controller reads req.body.otp — was incorrectly validating 'token' field
    body('email').trim().isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('otp').trim().isLength({ min: 6, max: 6 }).isNumeric().withMessage('Valid 6-digit OTP required'),
    body('password')
        .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
        .matches(/[A-Z]/).withMessage('Password must contain an uppercase letter')
        .matches(/[a-z]/).withMessage('Password must contain a lowercase letter')
        .matches(/[0-9]/).withMessage('Password must contain a number'),
    validate,
];

// ── Service Validators ──
const serviceValidation = [
    body('title').trim().notEmpty().withMessage('Title is required').isLength({ max: 200 }),
    body('description').optional().trim(),
    body('price').optional().isFloat({ min: 0 }).withMessage('Price must be a positive number'),
    body('category').optional().trim().isLength({ max: 100 }),
    validate,
];

// ── Order Validators ──
const orderValidation = [
    body('service_id').isInt({ min: 1 }).withMessage('Valid service ID required'),
    body('notes').optional().trim().isLength({ max: 1000 }).withMessage('Notes must not exceed 1000 characters'),
    validate,
];

const orderStatusValidation = [
    body('status').isIn(['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'])
        .withMessage('Invalid status value'),
    validate,
];

// ── Profile Validators ──
const profileUpdateValidation = [
    body('name').optional().trim().notEmpty().isLength({ max: 100 }),
    body('phone').optional().trim().matches(/^\+?[0-9]{8,15}$/),
    validate,
];

// ── Pagination Validator ──
const paginationValidation = [
    queryValidator('page').optional().isInt({ min: 1 }).toInt(),
    queryValidator('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    validate,
];

// ── ID Param ──
const idParamValidation = [
    param('id').isInt({ min: 1 }).withMessage('Valid ID required'),
    validate,
];

// ── Change Password ──
const changePasswordValidation = [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword')
        .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
        .matches(/[A-Z]/).withMessage('Must contain an uppercase letter')
        .matches(/[a-z]/).withMessage('Must contain a lowercase letter')
        .matches(/[0-9]/).withMessage('Must contain a number'),
    validate,
];

// ═══════════════════════════════════════════════
// Admin-Specific Validators (Phase 3)
// ═══════════════════════════════════════════════

// ── Admin: Update User ──
// SECURITY: Whitelist only allowed fields with strict type enforcement.
const adminUpdateUserValidation = [
    body('role_id').optional().isInt({ min: 1 }).withMessage('role_id must be a positive integer'),
    body('role_name').optional().trim().isLength({ min: 1, max: 50 })
        .matches(/^[a-zA-Z_]+$/).withMessage('role_name must contain only letters and underscores'),
    body('is_active').optional().isBoolean().withMessage('is_active must be a boolean'),
    body('is_verified').optional().isBoolean().withMessage('is_verified must be a boolean'),
    body('ban_type').optional({ values: 'null' }).isIn(['temporary', 'permanent', null, ''])
        .withMessage('ban_type must be "temporary", "permanent", or null'),
    body('ban_expires_at').optional({ values: 'null' }).isISO8601()
        .withMessage('ban_expires_at must be a valid ISO 8601 date'),
    validate,
];

// ── Admin: Update Role Permissions ──
// SECURITY: Ensures permissions_json is a non-empty array of non-empty strings.
// Prevents undefined, numbers, or objects from corrupting the DB.
const adminUpdateRoleValidation = [
    body('permissions_json')
        .exists({ checkNull: true }).withMessage('permissions_json is required')
        .isArray({ min: 1 }).withMessage('permissions_json must be a non-empty array'),
    body('permissions_json.*')
        .isString().withMessage('Each permission must be a string')
        .trim().notEmpty().withMessage('Permissions cannot be empty strings')
        .isLength({ max: 100 }).withMessage('Permission keys must not exceed 100 characters'),
    validate,
];

// ── Admin: Global Search ──
// SECURITY: Cap search query length to prevent expensive ILIKE full-table scans
const adminSearchValidation = [
    queryValidator('q')
        .trim()
        .isLength({ min: 2, max: 100 }).withMessage('Search query must be 2-100 characters'),
    validate,
];

// ── Admin: Message Status Filter ──
// SECURITY: Whitelist valid status values to prevent wasted DB queries
const adminMessageStatusValidation = [
    queryValidator('status').optional().isIn(['new', 'replied', 'archived', ''])
        .withMessage('Invalid status filter. Allowed: new, replied, archived'),
    validate,
];

module.exports = {
    validate,
    registerValidation,
    loginValidation,
    otpValidation,
    forgotPasswordValidation,
    resetPasswordValidation,
    serviceValidation,
    orderValidation,
    orderStatusValidation,
    profileUpdateValidation,
    paginationValidation,
    idParamValidation,
    changePasswordValidation,
    adminUpdateUserValidation,
    adminUpdateRoleValidation,
    adminSearchValidation,
    adminMessageStatusValidation,
};

