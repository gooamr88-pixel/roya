// ═══════════════════════════════════════════════
// Auth Controller — Thin HTTP layer
// ═══════════════════════════════════════════════
const authService = require('../services/auth.service');
const tokenService = require('../services/token.service');
const { asyncHandler } = require('../utils/helpers');
const { AppError } = require('../middlewares/errorHandler');

/**
 * POST /api/auth/register
 */
const register = asyncHandler(async (req, res) => {
    const data = await authService.registerUser(req.body);
    res.status(201).json({
        success: true,
        message: 'Registration successful. Please verify your email with the OTP sent.',
        data,
    });
});

/**
 * POST /api/auth/verify-otp
 */
const verifyOTP = asyncHandler(async (req, res) => {
    await authService.verifyOTP(req.body.email, req.body.otp);
    res.json({
        success: true,
        message: 'Email verified successfully. You can now log in.',
    });
});

/**
 * POST /api/auth/resend-otp
 */
const resendOTP = asyncHandler(async (req, res) => {
    await authService.resendOTP(req.body.email);
    res.json({ success: true, message: 'New OTP sent to your email.' });
});

/**
 * POST /api/auth/login
 */
const login = asyncHandler(async (req, res) => {
    const { email, password, rememberMe } = req.body;
    const ip = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'] || '';

    const result = await authService.loginUser({ email, password, rememberMe, ip, userAgent });

    // Set cookies
    tokenService.setAuthCookies(res, result.accessToken, result.refreshToken, result.rememberMe);

    // Debug: log what cookies are being set (remove after fixing)
    console.log(`🔍 [LOGIN DEBUG] Setting cookies for user ${result.user.email} | NODE_ENV: ${process.env.NODE_ENV} | secure: ${!config.isDev} | accessToken length: ${result.accessToken.length}`);

    res.json({
        success: true,
        message: 'Login successful.',
        data: { user: result.user },
    });
});

/**
 * POST /api/auth/logout
 */
const logout = asyncHandler(async (req, res) => {
    await authService.logoutUser(req.cookies?.access_token);
    tokenService.clearAuthCookies(res);
    res.json({ success: true, message: 'Logged out successfully.' });
});

/**
 * POST /api/auth/refresh
 */
const refresh = asyncHandler(async (req, res) => {
    try {
        const result = await authService.refreshTokens(req.cookies?.refresh_token);
        tokenService.setAuthCookies(res, result.accessToken, result.refreshToken, true);
        res.json({
            success: true,
            message: 'Tokens refreshed.',
            data: { user: result.user },
        });
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            throw new AppError('Refresh token expired. Please log in again.', 401, 'REFRESH_EXPIRED');
        }
        throw err;
    }
});

/**
 * POST /api/auth/forgot-password
 */
const forgotPassword = asyncHandler(async (req, res) => {
    await authService.forgotPassword(req.body.email);
    res.json({ success: true, message: 'If an account exists, a reset code has been sent.' });
});

/**
 * POST /api/auth/reset-password
 */
const resetPassword = asyncHandler(async (req, res) => {
    const { email, otp, password } = req.body;
    await authService.resetPassword(email, otp, password);
    res.json({ success: true, message: 'Password reset successfully. You can now log in.' });
});

/**
 * GET /api/auth/me
 */
const me = asyncHandler(async (req, res) => {
    res.json({ success: true, data: { user: req.user } });
});

module.exports = { register, verifyOTP, resendOTP, login, logout, refresh, forgotPassword, resetPassword, me };
