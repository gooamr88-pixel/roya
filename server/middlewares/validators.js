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
    body('notes').optional().trim(),
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
};
