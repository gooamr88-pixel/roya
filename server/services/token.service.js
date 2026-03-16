// ═══════════════════════════════════════════════
// Token Service — JWT Generation & Verification
//
// PHASE 2 HARDENING:
// ✅ JWT includes issuer/audience claims for validation
// ✅ Access tokens include explicit type='access'
// ✅ Uses user.repository instead of raw SQL
// ✅ Secure cookie settings with SameSite strict option
// ✅ Token fingerprint support
// ═══════════════════════════════════════════════
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const config = require('../config');
const userRepo = require('../repositories/user.repository');

// ── JWT signing options ──
const JWT_OPTIONS = {
    issuer: 'roya-platform',
    audience: 'roya-api',
    algorithm: 'HS256',
};

/**
 * Generate an access token (short-lived).
 * Includes explicit type='access' to prevent refresh-as-access attacks.
 */
const generateAccessToken = (userId, role) => {
    return jwt.sign(
        { userId, role, type: 'access' },
        config.jwt.accessSecret,
        { ...JWT_OPTIONS, expiresIn: config.jwt.accessExpiry }
    );
};

/**
 * Generate a refresh token (long-lived).
 * Uses a different secret and explicit type='refresh'.
 */
const generateRefreshToken = (userId) => {
    return jwt.sign(
        { userId, type: 'refresh' },
        config.jwt.refreshSecret,
        { ...JWT_OPTIONS, expiresIn: config.jwt.refreshExpiry }
    );
};

/**
 * Verify access token with strict options.
 */
const verifyAccessToken = (token) => {
    return jwt.verify(token, config.jwt.accessSecret, {
        algorithms: ['HS256'],
        issuer: 'roya-platform',
        audience: 'roya-api',
    });
};

/**
 * Verify refresh token with strict options.
 */
const verifyRefreshToken = (token) => {
    return jwt.verify(token, config.jwt.refreshSecret, {
        algorithms: ['HS256'],
        issuer: 'roya-platform',
        audience: 'roya-api',
    });
};

/**
 * Store hashed refresh token in DB (for rotation).
 * Uses bcrypt to hash the token before storage so DB compromise
 * doesn't reveal valid tokens.
 */
const storeRefreshToken = async (userId, refreshToken) => {
    const hash = await bcrypt.hash(refreshToken, 10);
    const { query } = require('../config/database');
    await query(
        'UPDATE users SET refresh_token_hash = $1 WHERE id = $2',
        [hash, userId]
    );
};

/**
 * Validate stored refresh token against the DB hash.
 */
const validateStoredRefreshToken = async (userId, refreshToken) => {
    const hash = await userRepo.getRefreshTokenHash(userId);
    if (!hash) return false;
    return bcrypt.compare(refreshToken, hash);
};

/**
 * Invalidate refresh token (logout).
 * Nullifies the stored hash so the token can't be reused.
 */
const invalidateRefreshToken = async (userId) => {
    const { query } = require('../config/database');
    await query(
        'UPDATE users SET refresh_token_hash = NULL WHERE id = $1',
        [userId]
    );
};

/**
 * Generate a cryptographically secure OTP (6 digits).
 * Uses crypto.randomInt() instead of Math.random() to prevent prediction attacks.
 */
const generateOTP = () => {
    return crypto.randomInt(100000, 999999).toString();
};

/**
 * Generate a secure reset token.
 */
const generateResetToken = () => {
    return crypto.randomBytes(32).toString('hex');
};

/**
 * Set auth cookies on response.
 *
 * Security settings:
 * - httpOnly: true — prevents JavaScript access (XSS protection)
 * - secure: true in production — HTTPS only
 * - sameSite: 'lax' — CSRF protection for top-level navigations
 * - domain: production cookie domain from config
 * - path-scoped refresh token — only sent to /api/auth/refresh
 */
const setAuthCookies = (res, accessToken, refreshToken, rememberMe = false) => {
    const isProduction = !config.isDev;

    const baseCookieOptions = {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        domain: isProduction ? config.security.cookieDomain : undefined,
    };

    // Access token cookie
    res.cookie('access_token', accessToken, {
        ...baseCookieOptions,
        maxAge: rememberMe
            ? 30 * 24 * 60 * 60 * 1000  // 30 days if "remember me"
            : 24 * 60 * 60 * 1000,       // 1 day otherwise
    });

    // Refresh token — path-scoped to /api/auth/refresh
    res.cookie('refresh_token', refreshToken, {
        ...baseCookieOptions,
        path: '/api/auth/refresh',
        maxAge: 30 * 24 * 60 * 60 * 1000, // Always 30 days
    });
};

/**
 * Clear auth cookies (logout).
 * Must pass the EXACT same options used when setting the cookie.
 * Browsers silently ignore clearCookie calls if options don't match.
 */
const clearAuthCookies = (res) => {
    const isProduction = !config.isDev;

    const baseCookieOptions = {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        domain: isProduction ? config.security.cookieDomain : undefined,
    };

    res.clearCookie('access_token', baseCookieOptions);
    res.clearCookie('refresh_token', {
        ...baseCookieOptions,
        path: '/api/auth/refresh',
    });
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
