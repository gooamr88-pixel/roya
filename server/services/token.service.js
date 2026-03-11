// ═══════════════════════════════════════════════
// Token Service — JWT Generation & Verification
// ═══════════════════════════════════════════════
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const config = require('../config');
const { query } = require('../config/database');

/**
 * Generate an access token (short-lived)
 */
const generateAccessToken = (userId, role) => {
    return jwt.sign(
        { userId, role },
        config.jwt.accessSecret,
        { expiresIn: config.jwt.accessExpiry }
    );
};

/**
 * Generate a refresh token (long-lived)
 */
const generateRefreshToken = (userId) => {
    return jwt.sign(
        { userId, type: 'refresh' },
        config.jwt.refreshSecret,
        { expiresIn: config.jwt.refreshExpiry }
    );
};

/**
 * Verify access token
 */
const verifyAccessToken = (token) => {
    return jwt.verify(token, config.jwt.accessSecret);
};

/**
 * Verify refresh token
 */
const verifyRefreshToken = (token) => {
    return jwt.verify(token, config.jwt.refreshSecret);
};

/**
 * Store hashed refresh token in DB (for rotation)
 */
const storeRefreshToken = async (userId, refreshToken) => {
    const hash = await bcrypt.hash(refreshToken, 10);
    await query(
        'UPDATE users SET refresh_token_hash = $1 WHERE id = $2',
        [hash, userId]
    );
};

/**
 * Validate stored refresh token
 */
const validateStoredRefreshToken = async (userId, refreshToken) => {
    const result = await query(
        'SELECT refresh_token_hash FROM users WHERE id = $1',
        [userId]
    );

    if (result.rows.length === 0 || !result.rows[0].refresh_token_hash) {
        return false;
    }

    return bcrypt.compare(refreshToken, result.rows[0].refresh_token_hash);
};

/**
 * Invalidate refresh token (logout)
 */
const invalidateRefreshToken = async (userId) => {
    await query(
        'UPDATE users SET refresh_token_hash = NULL WHERE id = $1',
        [userId]
    );
};

/**
 * Generate a cryptographically secure OTP (6 digits)
 * Uses crypto.randomInt() instead of Math.random() to prevent prediction attacks
 */
const generateOTP = () => {
    return crypto.randomInt(100000, 999999).toString();
};

/**
 * Generate a secure reset token
 */
const generateResetToken = () => {
    return crypto.randomBytes(32).toString('hex');
};

/**
 * Set auth cookies on response
 */
const setAuthCookies = (res, accessToken, refreshToken, rememberMe = false) => {
    const cookieOptions = {
        httpOnly: true,
        secure: true, // Force true or use config depending if we strictly need to bypass dev env
        sameSite: 'none', // Needed for cross-device/mobile if domains differ, or 'lax' depending on setup. Let's use 'lax' or strictly 'strict' but mobile might need 'lax'. We'll use 'lax' for broader mobile support if not explicitly cross-origin, or strictly follow instructions. The instruction says: "Ensure maxAge, secure, sameSite, and httpOnly are set correctly to fix the mobile issue." Usually, sameSite: 'none' and secure: true fixes mobile issues if it's an API, or sameSite: 'lax' for same-site mobile.
        domain: config.isDev ? undefined : config.security.cookieDomain,
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days for ALL devices
    };

    // The instruction says: "Set the cookie configuration to be valid for exactly 1 month (30 days) across ALL devices."
    cookieOptions.sameSite = 'lax'; // 'lax' is safer but 'none' is better for cross-origin mobile apps. Let's use 'lax' and secure: true. Or 'strict' if the mobile is just a web view on the same domain. Let's set secure: true, sameSite: 'lax', httpOnly: true.

    res.cookie('access_token', accessToken, {
        ...cookieOptions,
        // Also extend access token cookie or just keep it 30 days if required by "across ALL devices"? Usually access token is short. "Fix session cookies" usually means the main session/refresh cookie. Let's set both to 30 days to be safe based on "Set the cookie configuration to be valid for exactly 1 month (30 days) across ALL devices."
        maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    const rtOptions = {
        ...cookieOptions,
        path: '/api/auth/refresh',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    };

    res.cookie('refresh_token', refreshToken, rtOptions);
};

/**
 * Clear auth cookies (logout)
 * BUG FIX #8: Must pass the same options used when setting the cookie.
 * Browsers silently ignore clearCookie calls if options don't match.
 */
const clearAuthCookies = (res) => {
    const cookieOptions = {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        domain: config.isDev ? undefined : config.security.cookieDomain,
    };
    res.clearCookie('access_token', cookieOptions);
    res.clearCookie('refresh_token', { ...cookieOptions, path: '/api/auth/refresh' });
};

module.exports = {
    generateAccessToken,
    generateRefreshToken,
    verifyAccessToken,
    verifyRefreshToken,
    storeRefreshToken,
    validateStoredRefreshToken,
    invalidateRefreshToken,
    generateOTP,
    generateResetToken,
    setAuthCookies,
    clearAuthCookies,
};
