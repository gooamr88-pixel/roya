// ═══════════════════════════════════════════════
// Auth Middleware — JWT + Role-Based Access + Ban Check
//
// PHASE 3 HARDENING:
// ✅ Token revocation via JTI blacklist check (scaffolded)
// ✅ Strict JWT algorithm enforcement (HS256 only)
// ✅ Token type validation (prevents refresh token misuse)
// ✅ JWT issuer/audience validation
// ✅ Immutable role hierarchy (Object.freeze)
// ✅ DRY: shared permission parser + user sanitizer
// ✅ Minimal PII on req.user (no phone/name by default)
// ✅ NaN-safe ownerOrAdmin
// ✅ Request ID propagation
// ✅ Security event logging for failed auth
// ═══════════════════════════════════════════════
const jwt = require('jsonwebtoken');
const config = require('../config');
const userRepo = require('../repositories/user.repository');
const { AppError } = require('./errorHandler');

// ── Hierarchical Role Weights ──
// Higher weight = more privileges. authorizeRole(minRole) checks user.weight >= min.
// SECURITY: Object.freeze prevents runtime mutation of role weights
const ROLE_HIERARCHY = Object.freeze({
    viewer: 1,
    client: 1,
    supervisor: 1,
    editor: 2,
    admin: 3,
    super_admin: 4,
});

// ── JWT verification options (shared between authenticate & optionalAuth) ──
// SECURITY: Single source of truth prevents config drift between the two functions
const JWT_VERIFY_OPTIONS = Object.freeze({
    algorithms: ['HS256'],
    issuer: 'roya-platform',
    audience: 'roya-api',
});

// ── DRY: Parse permissions_json safely ──
// Extracted from authenticate() and optionalAuth() to eliminate duplication
function parsePermissions(permissionsJson) {
    if (Array.isArray(permissionsJson)) return permissionsJson;
    if (typeof permissionsJson === 'string') {
        try {
            const parsed = JSON.parse(permissionsJson);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }
    return [];
}

// ── DRY: Build sanitized user object for req.user ──
// SECURITY: Only attach fields needed for authorization decisions.
// PII (name, phone) is excluded to prevent leakage via logs/error serializers.
// If a downstream handler needs PII, it should query the DB explicitly.
function buildRequestUser(user) {
    return {
        id: user.id,
        email: user.email,
        role: user.role || 'client',
        permissions: parsePermissions(user.permissions_json),
    };
}

/**
 * Authenticate — verifies JWT from HttpOnly cookie.
 * Pipeline: valid token → correct type → JTI not revoked → user exists → not banned → verified.
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
            decoded = jwt.verify(token, config.jwt.accessSecret, JWT_VERIFY_OPTIONS);
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

        // ── TOKEN REVOCATION CHECK ──
        // When you implement a token blacklist (Redis set of revoked JTIs),
        // uncomment and wire this up:
        //
        // if (decoded.jti) {
        //     const isRevoked = await tokenBlacklist.isRevoked(decoded.jti);
        //     if (isRevoked) {
        //         throw new AppError('Token has been revoked.', 401, 'TOKEN_REVOKED');
        //     }
        // }

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

        // ── Attach minimal user context (no PII leakage) ──
        req.user = buildRequestUser(user);

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

/**
 * ownerOrAdmin — ensures the requesting user is either the resource
 * owner (matching :id param or a custom key) or an admin.
 * Prevents horizontal privilege escalation.
 * SECURITY: NaN-safe parseInt with explicit validation.
 *
 * @param {string} [paramKey='id'] - The req.params key holding the resource owner's user ID
 */
const ownerOrAdmin = (paramKey = 'id') => {
    return (req, res, next) => {
        if (!req.user) {
            return next(new AppError('Authentication required.', 401, 'AUTH_REQUIRED'));
        }

        const adminRoles = ['super_admin', 'admin'];

        // SECURITY: Explicit NaN guard — reject invalid ID params outright
        const resourceOwnerId = parseInt(req.params[paramKey], 10);
        if (Number.isNaN(resourceOwnerId)) {
            return next(new AppError('Invalid resource identifier.', 400, 'INVALID_PARAM'));
        }

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

        // SECURITY: Reuse shared JWT_VERIFY_OPTIONS — single source of truth
        const decoded = jwt.verify(token, config.jwt.accessSecret, JWT_VERIFY_OPTIONS);

        if (decoded.type && decoded.type !== 'access') return next();
        if (!decoded.userId) return next();

        const user = await userRepo.findById(decoded.userId);
        if (!user || !user.is_active || !user.is_verified) return next();

        // DRY: Reuse the same builder as authenticate()
        req.user = buildRequestUser(user);

        next();
    } catch {
        // Token invalid/expired — continue as guest
        next();
    }
};

module.exports = { authenticate, authorize, authorizeRole, checkPermission, ownerOrAdmin, optionalAuth, ROLE_HIERARCHY };
