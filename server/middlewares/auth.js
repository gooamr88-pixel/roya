// ═══════════════════════════════════════════════
// Auth Middleware — JWT + Role-Based Access + Ban Check
// ═══════════════════════════════════════════════
const jwt = require('jsonwebtoken');
const config = require('../config');
const { query } = require('../config/database');
const { AppError } = require('./errorHandler');

/**
 * Authenticate — verifies JWT from HttpOnly cookie
 * Checks: valid token → user exists → not banned → email verified
 */
const authenticate = async (req, res, next) => {
    try {
        const token = req.cookies?.access_token;

        if (!token) {
            throw new AppError('Authentication required. Please log in.', 401, 'AUTH_REQUIRED');
        }

        const decoded = jwt.verify(token, config.jwt.accessSecret);

        // Fetch user from DB to ensure current data (including ban fields)
        const result = await query(
            `SELECT u.id, u.name, u.email, u.phone, u.is_active, u.is_verified,
                    u.ban_type, u.ban_expires_at,
                    r.name as role, r.permissions_json
             FROM users u
             LEFT JOIN roles r ON u.role_id = r.id
             WHERE u.id = $1`,
            [decoded.userId]
        );

        if (result.rows.length === 0) {
            throw new AppError('User not found.', 401, 'USER_NOT_FOUND');
        }

        const user = result.rows[0];

        // ── Ban Check ──
        if (!user.is_active) {
            if (user.ban_type === 'permanent') {
                throw new AppError('Your account has been permanently banned. Contact support for assistance.', 403, 'ACCOUNT_BANNED');
            }
            if (user.ban_type === 'temporary' && user.ban_expires_at) {
                if (new Date() < new Date(user.ban_expires_at)) {
                    const expiresAt = new Date(user.ban_expires_at).toLocaleDateString();
                    throw new AppError(`Your account is temporarily suspended until ${expiresAt}. Contact support for assistance.`, 403, 'ACCOUNT_BANNED_TEMP');
                } else {
                    // Temp ban expired — auto-unban
                    await query(
                        `UPDATE users SET is_active = TRUE, ban_type = NULL, ban_expires_at = NULL WHERE id = $1`,
                        [user.id]
                    );
                    user.is_active = true;
                    user.ban_type = null;
                }
            } else {
                throw new AppError('Account has been deactivated. Contact support.', 403, 'ACCOUNT_DEACTIVATED');
            }
        }

        if (!user.is_verified) {
            throw new AppError('Email not verified. Please verify your email.', 403, 'EMAIL_NOT_VERIFIED');
        }

        // Attach user to request
        req.user = {
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            role: user.role || 'client',
            permissions: user.permissions_json || [],
        };

        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return next(new AppError('Session expired. Please refresh or log in again.', 401, 'TOKEN_EXPIRED'));
        }
        if (err.name === 'JsonWebTokenError') {
            return next(new AppError('Invalid token.', 401, 'INVALID_TOKEN'));
        }
        next(err);
    }
};

/**
 * Authorize — checks user role(s)
 * @param {...string} roles - Allowed roles
 */
const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return next(new AppError('Authentication required.', 401, 'AUTH_REQUIRED'));
        }

        if (!roles.includes(req.user.role)) {
            return next(new AppError('You do not have permission to perform this action.', 403, 'FORBIDDEN'));
        }

        next();
    };
};

/**
 * Check Permission — checks specific permission in role
 * @param {string} permission - Required permission
 */
const checkPermission = (permission) => {
    return (req, res, next) => {
        if (!req.user) {
            return next(new AppError('Authentication required.', 401, 'AUTH_REQUIRED'));
        }

        const perms = req.user.permissions || [];
        if (!perms.includes('all') && !perms.includes(permission)) {
            return next(new AppError('Insufficient permissions.', 403, 'INSUFFICIENT_PERMISSIONS'));
        }

        next();
    };
};

module.exports = { authenticate, authorize, checkPermission };
