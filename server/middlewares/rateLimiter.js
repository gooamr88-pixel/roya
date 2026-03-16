// ═══════════════════════════════════════════════
// Rate Limiting Middleware — Enterprise-Grade
//
// PHASE 2 HARDENING:
// ✅ Granular limiters for every sensitive endpoint
// ✅ Login: 5 per 15 min (brute-force defense)
// ✅ OTP/Verify: 5 per 15 min (prevents OTP guessing)
// ✅ Register: 3 per hour (prevents mass account creation)
// ✅ Password Reset: 3 per 15 min (prevents email flood)
// ✅ Upload: 10 per 15 min (prevents resource exhaustion)
// ✅ Contact form: 5 per hour (prevents spam)
// ✅ API global: 200 per 15 min (DDoS layer 1)
// ✅ Strict API: 100 per 15 min (for admin routes)
// ✅ Uses consistent JSON error response format
// ═══════════════════════════════════════════════
const rateLimit = require('express-rate-limit');

/**
 * Helper — consistent rate limit response format
 */
const createLimiter = (windowMs, max, message, keyGenerator) => {
    const opts = {
        windowMs,
        max,
        message: {
            success: false,
            error: {
                code: 'RATE_LIMIT',
                message,
                retryAfter: Math.ceil(windowMs / 1000),
            },
        },
        standardHeaders: true,           // RateLimit-* headers (draft-6)
        legacyHeaders: false,             // Disable X-RateLimit-* headers
        skipSuccessfulRequests: false,    // Count all requests
        validate: { trustProxy: false },  // Suppress trust-proxy warnings
    };
    if (keyGenerator) {
        opts.keyGenerator = keyGenerator;
    }
    return rateLimit(opts);
};

// ── Login: 5 attempts per 15 min per IP ──
const loginLimiter = createLimiter(
    15 * 60 * 1000, 5,
    'Too many login attempts. Please try again after 15 minutes.'
);

// ── OTP Verification: 5 attempts per 15 min per IP ──
// Prevents brute-forcing 6-digit OTP (10^6 combinations)
const otpLimiter = createLimiter(
    15 * 60 * 1000, 5,
    'Too many OTP attempts. Please try again after 15 minutes.'
);

// ── Resend OTP: 3 per 15 min per IP ──
const resendOtpLimiter = createLimiter(
    15 * 60 * 1000, 3,
    'Too many OTP resend requests. Please try again after 15 minutes.'
);

// ── Registration: 3 per hour per IP ──
// Prevents mass account creation / bot registrations
const registerLimiter = createLimiter(
    60 * 60 * 1000, 3,
    'Too many registration attempts. Please try again after 1 hour.'
);

// ── Password Reset: 3 per 15 min per IP ──
// Prevents email flooding / enumeration
const passwordResetLimiter = createLimiter(
    15 * 60 * 1000, 3,
    'Too many password reset requests. Please wait 15 minutes.'
);

// ── Order: 10 per hour per IP ──
const orderLimiter = createLimiter(
    60 * 60 * 1000, 10,
    'Too many order requests. Please try again later.'
);

// ── File Upload: 10 per 15 min per IP ──
// Prevents storage/bandwidth abuse
const uploadLimiter = createLimiter(
    15 * 60 * 1000, 10,
    'Too many file uploads. Please try again after 15 minutes.'
);

// ── Contact Form: 5 per hour per IP ──
// Prevents spam submissions
const contactLimiter = createLimiter(
    60 * 60 * 1000, 5,
    'Too many contact submissions. Please try again later.'
);

// ── General API: 200 requests per 15 min per IP ──
// Acts as DDoS Layer-1 protection; applied globally to /api/*
const apiLimiter = createLimiter(
    15 * 60 * 1000, 200,
    'Too many requests. Please slow down.'
);

// ── Strict API: 100 requests per 15 min ──
// For sensitive admin routes
const strictApiLimiter = createLimiter(
    15 * 60 * 1000, 100,
    'Too many requests to admin endpoints. Please slow down.'
);

module.exports = {
    loginLimiter,
    otpLimiter,
    resendOtpLimiter,
    registerLimiter,
    passwordResetLimiter,
    orderLimiter,
    uploadLimiter,
    contactLimiter,
    apiLimiter,
    strictApiLimiter,
};
