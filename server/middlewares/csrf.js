// ═══════════════════════════════════════════════
// CSRF Protection — Double-Submit Cookie Pattern
//
// No extra dependencies needed.
// Works by:
//   1. Setting a random token in a cookie (readable by JS)
//   2. Requiring the same token in the X-CSRF-Token header on POST
//   3. Verifying both match
//
// Usage in routes:
//   const { csrfProtection, csrfToken } = require('../middlewares/csrf');
//   router.get('/form', csrfToken, ctrl.showForm);  // Sets cookie
//   router.post('/form', csrfProtection, ctrl.submit); // Validates token
// ═══════════════════════════════════════════════
const crypto = require('crypto');
const { AppError } = require('./errorHandler');
const config = require('../config');

const COOKIE_NAME = 'roya_csrf';

/**
 * Middleware: Set CSRF token cookie (for GET requests that serve forms)
 */
const csrfToken = (req, res, next) => {
    // Generate or reuse existing token
    let token = req.cookies[COOKIE_NAME];
    if (!token) {
        token = crypto.randomBytes(32).toString('hex');
        res.cookie(COOKIE_NAME, token, {
            httpOnly: false,         // JS must read this to put it in headers
            secure: !config.isDev,
            sameSite: 'strict',
            maxAge: 2 * 60 * 60 * 1000, // 2 hours
            path: '/',
        });
    }
    // Make token available to template engine if needed
    res.locals.csrfToken = token;
    next();
};

/**
 * Middleware: Validate CSRF token on POST
 */
const csrfProtection = (req, res, next) => {
    const cookieToken = req.cookies[COOKIE_NAME];
    const headerToken = req.headers['x-csrf-token'];

    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
        return next(new AppError(
            'Invalid or missing CSRF token. Please refresh the page and try again.',
            403,
            'CSRF_VALIDATION_FAILED'
        ));
    }

    next();
};

module.exports = { csrfToken, csrfProtection };
