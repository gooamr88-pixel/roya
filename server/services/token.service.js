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
        secure: !config.isDev,
        sameSite: 'strict',
        domain: config.isDev ? undefined : config.security.cookieDomain,
    };

    res.cookie('access_token', accessToken, {
        ...cookieOptions,
        maxAge: 15 * 60 * 1000, // 15 minutes
    });

    const rtOptions = {
        ...cookieOptions,
        path: '/api/auth/refresh',
    };

    // If rememberMe is true, store for 30 days.
    // If false, it acts as a session cookie (no maxAge), clearing when browser closes.
    if (rememberMe) {
        rtOptions.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
    }

    res.cookie('refresh_token', refreshToken, rtOptions);
};

/**
 * Clear auth cookies (logout)
 */
const clearAuthCookies = (res) => {
    res.clearCookie('access_token');
    res.clearCookie('refresh_token', { path: '/api/auth/refresh' });
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
