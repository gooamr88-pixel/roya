// ═══════════════════════════════════════════════
// Rate Limiting Middleware
// ═══════════════════════════════════════════════
const rateLimit = require('express-rate-limit');

// Login rate limiter — 5 attempts per 15 minutes
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: {
        success: false,
        error: {
            code: 'RATE_LIMIT',
            message: 'Too many login attempts. Please try again after 15 minutes.',
        },
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Order rate limiter — 10 per hour
const orderLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    message: {
        success: false,
        error: {
            code: 'RATE_LIMIT',
            message: 'Too many order requests. Please try again later.',
        },
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// General API limiter — 100 per 15 minutes
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: {
        success: false,
        error: {
            code: 'RATE_LIMIT',
            message: 'Too many requests. Please slow down.',
        },
    },
    standardHeaders: true,
    legacyHeaders: false,
});

module.exports = { loginLimiter, orderLimiter, apiLimiter };
