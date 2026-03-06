// ═══════════════════════════════════════════════
// Auth Routes
// ═══════════════════════════════════════════════
const router = require('express').Router();
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middlewares/auth');
const { loginLimiter } = require('../middlewares/rateLimiter');
const {
    registerValidation,
    loginValidation,
    otpValidation,
    forgotPasswordValidation,
    resetPasswordValidation,
} = require('../middlewares/validators');

router.post('/register', registerValidation, authController.register);
router.post('/verify-otp', otpValidation, authController.verifyOTP);
router.post('/resend-otp', forgotPasswordValidation, authController.resendOTP);
router.post('/login', loginLimiter, loginValidation, authController.login);
router.post('/logout', authController.logout);
router.post('/refresh', authController.refresh);
router.post('/forgot-password', forgotPasswordValidation, authController.forgotPassword);
router.post('/reset-password', resetPasswordValidation, authController.resetPassword);
router.get('/me', authenticate, authController.me);

module.exports = router;
