// ═══════════════════════════════════════════════
// Auth Middleware — JWT + Role-Based Access + Ban Check
//
// PHASE 2 HARDENING:
// ✅ Uses user.repository instead of raw SQL
// ✅ Strict JWT algorithm enforcement (HS256 only)
// ✅ Token type validation (prevents refresh token misuse as access token)
// ✅ JWT issuer/audience validation
// ✅ Request ID propagation
// ✅ Security event logging for failed auth
// ═══════════════════════════════════════════════
const jwt = require('jsonwebtoken');
const config = require('../config');
const userRepo = require('../repositories/user.repository');
const { AppError } = require('./errorHandler');

// ── Hierarchical Role Weights ──
// Higher weight = more privileges. authorizeRole(minRole) checks user.weight >= min.
const ROLE_HIERARCHY = {
    viewer: 1, client: 1, supervisor: 1,
    editor: 2,
    admin: 3,
    super_admin: 4,
};

/**
 * Authenticate — verifies JWT from HttpOnly cookie.
 * Checks: valid token → correct type → user exists → not banned → verified.
 */
const authenticate = async (req, res, next) => {
    try {
        const token = req.cookies?.access_token;

        if (!token) {
            throw new AppError('Authentication required. Please log in.', 401, 'AUTH_REQUIRED');
        }

        // ── Strict JWT verification ──
        // Enforce HS256 only — prevents algorithm confusion attacks (e.g. "none" or RS256 swap)
        let decoded;
        try {
            decoded = jwt.verify(token, config.jwt.accessSecret, {
                algorithms: ['HS256'],
                issuer: 'roya-platform',
                audience: 'roya-api',
            });
        } catch (jwtErr) {
            if (jwtErr.name === 'TokenExpiredError') {
                throw new AppError('Session expired. Please refresh or log in again.', 401, 'TOKEN_EXPIRED');
            }
            if (jwtErr.name === 'JsonWebTokenError') {
                throw new AppError('Invalid token.', 401, 'INVALID_TOKEN');
            }
            if (jwtErr.name === 'NotBeforeError') {
                throw new AppError('Token not yet valid.', 401, 'TOKEN_NOT_ACTIVE');
            }
            throw jwtErr;
        }

        // ── Token type validation ──
        // Prevents refresh tokens being used as access tokens
        if (decoded.type && decoded.type !== 'access') {
            throw new AppError('Invalid token type.', 401, 'INVALID_TOKEN_TYPE');
        }

        if (!decoded.userId) {
            throw new AppError('Malformed token payload.', 401, 'MALFORMED_TOKEN');
        }

        // ── Fetch user from DB — always get live data ──
        const user = await userRepo.findById(decoded.userId);

        if (!user) {
            throw new AppError('User not found.', 401, 'USER_NOT_FOUND');
        }

        // ── Ban Check ──
        if (!user.is_active) {
            if (user.ban_type === 'permanent') {
                throw new AppError(
                    'Your account has been permanently banned. Contact support for assistance.',
                    403, 'ACCOUNT_BANNED'
                );
            }
            if (user.ban_type === 'temporary' && user.ban_expires_at) {
                if (new Date() < new Date(user.ban_expires_at)) {
                    const expiresAt = new Date(user.ban_expires_at).toLocaleDateString();
                    throw new AppError(
                        `Your account is temporarily suspended until ${expiresAt}. Contact support for assistance.`,
                        403, 'ACCOUNT_BANNED_TEMP'
                    );
                } else {
                    // Temp ban expired — auto-unban
                    await userRepo.clearBan(user.id);
                    user.is_active = true;
                    user.ban_type = null;
                }
            } else {
                throw new AppError('Account has been deactivated. Contact support.', 403, 'ACCOUNT_DEACTIVATED');
            }
        }

        // ── Email verification check ──
        if (!user.is_verified) {
            throw new AppError('Email not verified. Please verify your email.', 403, 'EMAIL_NOT_VERIFIED');
        }

        // ── Attach sanitized user to request ──
        req.user = {
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            role: user.role || 'client',
            permissions: (() => {
                const perms = user.permissions_json;
                if (Array.isArray(perms)) return perms;
                if (typeof perms === 'string') {
                    try { return JSON.parse(perms); } catch { return []; }
                }
                return [];
            })(),
        };

        next();
    } catch (err) {
        // ── Security event: log failed authentication ──
        if (err.statusCode === 401 || err.statusCode === 403) {
            const ip = req.ip || req.connection?.remoteAddress;
            console.warn(
                `🔒 [AUTH FAIL] ${err.code || 'UNKNOWN'} | IP: ${ip} | ` +
                `Path: ${req.method} ${req.originalUrl} | ` +
                `ReqID: ${req.id || 'none'}`
            );
        }
        next(err);
    }
};

/**
 * Authorize — checks user role(s).
 * Accepts one or more role names. Super_admin bypasses all role checks.
 *
 * @param {...string} roles - Allowed roles
 */
const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return next(new AppError('Authentication required.', 401, 'AUTH_REQUIRED'));
        }

        // super_admin always passes role checks
        if (req.user.role === 'super_admin') {
            return next();
        }

        if (!roles.includes(req.user.role)) {
            console.warn(
                `🔒 [RBAC DENIED] User ${req.user.id} (${req.user.role}) ` +
                `tried to access ${req.method} ${req.originalUrl} | ` +
                `Required: ${roles.join(', ')}`
            );
            return next(new AppError(
                'You do not have permission to perform this action.',
                403, 'FORBIDDEN'
            ));
        }

        next();
    };
};

/**
 * Check Permission — checks specific permission in the user's role.
 * Permissions are stored as a JSON array in the role's permissions_json column.
 * The special permission 'all' grants universal access.
 *
 * @param {string} permission - Required permission key
 */
const checkPermission = (permission) => {
    return (req, res, next) => {
        if (!req.user) {
            return next(new AppError('Authentication required.', 401, 'AUTH_REQUIRED'));
        }

        // super_admin with 'all' permission always passes
        const perms = req.user.permissions || [];
        if (perms.includes('all')) {
            return next();
        }

        if (!perms.includes(permission)) {
            console.warn(
                `🔒 [PERMISSION DENIED] User ${req.user.id} missing "${permission}" | ` +
                `Has: [${perms.join(', ')}]`
            );
            return next(new AppError(
                'Insufficient permissions.',
                403, 'INSUFFICIENT_PERMISSIONS'
            ));
        }

        next();
    };
};

/**
 * ownerOrAdmin — ensures the requesting user is either the resource
 * owner (matching :id param or a custom key) or an admin.
 * Prevents horizontal privilege escalation.
 *
 * @param {string} [paramKey='id'] - The req.params key holding the resource owner's user ID
 */
/**
 * Authorize by Role Level — hierarchical role check.
 * Uses weight-based comparison: user role weight must be >= minimum role weight.
 * E.g., authorizeRole('admin') allows admin (3) and super_admin (4),
 * but blocks editor (2), viewer (1), client (1).
 *
 * @param {string} minRole - Minimum required role name
 */
const authorizeRole = (minRole) => {
    const minWeight = ROLE_HIERARCHY[minRole] || 0;
    return (req, res, next) => {
        if (!req.user) {
            return next(new AppError('Authentication required.', 401, 'AUTH_REQUIRED'));
        }
        const userWeight = ROLE_HIERARCHY[req.user.role] || 0;
        if (userWeight >= minWeight) {
            return next();
        }
        console.warn(
            `🔒 [RBAC LEVEL] User ${req.user.id} (${req.user.role}, weight ${userWeight}) ` +
            `denied access to ${req.method} ${req.originalUrl} | Required: ${minRole} (weight ${minWeight})`
        );
        return next(new AppError(
            'Insufficient role privileges.',
            403, 'ROLE_INSUFFICIENT'
        ));
    };
};

const ownerOrAdmin = (paramKey = 'id') => {
    return (req, res, next) => {
        if (!req.user) {
            return next(new AppError('Authentication required.', 401, 'AUTH_REQUIRED'));
        }

        const adminRoles = ['super_admin', 'admin'];
        const resourceOwnerId = parseInt(req.params[paramKey], 10);
        const isOwner = req.user.id === resourceOwnerId;

        if (!isOwner && !adminRoles.includes(req.user.role)) {
            return next(new AppError(
                'You can only access your own resources.',
                403, 'OWNERSHIP_REQUIRED'
            ));
        }

        next();
    };
};

/**
 * Optional Auth — same as authenticate but non-blocking.
 * If the cookie is missing or the token is invalid, the request continues as guest.
 * Used on public routes that need to optionally attach user context for admin-specific behavior.
 */
const optionalAuth = async (req, res, next) => {
    try {
        const token = req.cookies?.access_token;
        if (!token) return next();

        const decoded = jwt.verify(token, config.jwt.accessSecret, {
            algorithms: ['HS256'],
            issuer: 'roya-platform',
            audience: 'roya-api',
        });

        if (decoded.type && decoded.type !== 'access') return next();
        if (!decoded.userId) return next();

        const user = await userRepo.findById(decoded.userId);
        if (!user || !user.is_active || !user.is_verified) return next();

        req.user = {
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            role: user.role || 'client',
            permissions: (() => {
                const perms = user.permissions_json;
                if (Array.isArray(perms)) return perms;
                if (typeof perms === 'string') {
                    try { return JSON.parse(perms); } catch { return []; }
                }
                return [];
            })(),
        };

        next();
    } catch {
        // Token invalid/expired — continue as guest
        next();
    }
};

module.exports = { authenticate, authorize, authorizeRole, checkPermission, ownerOrAdmin, optionalAuth, ROLE_HIERARCHY };
