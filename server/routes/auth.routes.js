// ═══════════════════════════════════════════════
// Auth Routes — PHASE 2: Granular rate limiters
// ═══════════════════════════════════════════════
const router = require('express').Router();
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middlewares/auth');
const {
    loginLimiter,
    registerLimiter,
    otpLimiter,
    resendOtpLimiter,
    passwordResetLimiter,
} = require('../middlewares/rateLimiter');
const {
    registerValidation,
    loginValidation,
    otpValidation,
    forgotPasswordValidation,
    resetPasswordValidation,
} = require('../middlewares/validators');

// ── Registration: 3 per hour (prevents mass account creation) ──
router.post('/register', registerLimiter, registerValidation, authController.register);

// ── OTP Verification: 5 per 15 min (prevents brute-force OTP guessing) ──
router.post('/verify-otp', otpLimiter, otpValidation, authController.verifyOTP);

// ── Resend OTP: 3 per 15 min (prevents email flooding) ──
router.post('/resend-otp', resendOtpLimiter, forgotPasswordValidation, authController.resendOTP);

// ── Login: 5 per 15 min (brute-force defense) ──
router.post('/login', loginLimiter, loginValidation, authController.login);

// ── Logout: no rate limit needed (authenticated) ──
router.post('/logout', authController.logout);

// ── Token refresh: no aggressive limit (browser auto-refreshes) ──
router.post('/refresh', authController.refresh);

// ── Forgot password: 3 per 15 min (prevents email flood + enumeration) ──
router.post('/forgot-password', passwordResetLimiter, forgotPasswordValidation, authController.forgotPassword);

// ── Reset password: 3 per 15 min ──
router.post('/reset-password', passwordResetLimiter, resetPasswordValidation, authController.resetPassword);

// ── Get current user: authenticated ──
router.get('/me', authenticate, authController.me);

// ── DEBUG: Check cookies (TEMPORARY — remove after fixing) ──
router.get('/debug-cookies', (req, res) => {
    const cookieKeys = Object.keys(req.cookies || {});
    const hasAccess = !!req.cookies?.access_token;
    const hasRefresh = !!req.cookies?.refresh_token;
    console.log(`🔍 [DEBUG-COOKIES] Keys: ${JSON.stringify(cookieKeys)} | access: ${hasAccess} | refresh: ${hasRefresh} | protocol: ${req.protocol} | secure: ${req.secure} | NODE_ENV: ${process.env.NODE_ENV}`);
    res.json({
        cookieKeys,
        hasAccessToken: hasAccess,
        hasRefreshToken: hasRefresh,
        nodeEnv: process.env.NODE_ENV,
        protocol: req.protocol,
        secure: req.secure,
    });
});

module.exports = router;
