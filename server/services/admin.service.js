// ═══════════════════════════════════════════════
// Admin Service — Business logic for admin operations
//
// PHASE 3 HARDENING:
// ✅ Closed column whitelist for updateUser (no dynamic column injection)
// ✅ Explicit type coercion (boolean, integer) before DB write
// ✅ Self-demotion guard — super_admin cannot change own role
// ✅ Independent validation in updateRole (no trust of upstream)
// ✅ ILIKE wildcard escaping for globalSearch
// ✅ All dependencies imported at module load (no runtime require)
// ✅ Integer type enforcement on all ID parameters
// ═══════════════════════════════════════════════
const { AppError } = require('../middlewares/errorHandler');
const adminRepo = require('../repositories/admin.repository');
const orderRepo = require('../repositories/order.repository');
const loginLogRepo = require('../repositories/login-log.repository');

// ── Closed whitelist of updatable user columns ──
// SECURITY: Only these keys are ever allowed into a SET clause.
// Any unknown key from req.body is silently dropped here (defense-in-depth).
const USER_UPDATABLE_FIELDS = new Set([
    'role_id', 'is_active', 'is_verified', 'ban_type', 'ban_expires_at',
]);

/**
 * Escape ILIKE wildcard characters (% and _) in user search input.
 * Without this, searching for "%" matches every row.
 */
function escapeILike(str) {
    return str.replace(/[%_\\]/g, '\\$&');
}

/**
 * Safely coerce a value to boolean.
 * Handles string "true"/"false" from FormData and real booleans from JSON.
 */
function toBool(val) {
    if (typeof val === 'boolean') return val;
    if (val === 'true' || val === '1') return true;
    if (val === 'false' || val === '0') return false;
    return !!val;
}

/**
 * Get dashboard stats
 * FIX (A2): Parallelize independent queries for faster dashboard load
 */
const getDashboardStats = async () => {
    const [stats, recentOrders] = await Promise.all([
        adminRepo.getStats(),
        orderRepo.getRecentOrders(5),
    ]);

    const conversionRate = stats.totalUsers > 0
        ? Math.round((stats.totalUsersWithOrders / stats.totalUsers) * 100)
        : 0;

    return {
        stats: {
            ...stats,
            conversionRate,
        },
        recentOrders,
    };
};

/**
 * Get paginated users
 */
const getUsersPaginated = async ({ page, limit, search }) => {
    // SECURITY: Escape ILIKE wildcards in search term
    const safeSearch = search ? escapeILike(search) : '';
    return adminRepo.getUsers({ page, limit, search: safeSearch });
};

/**
 * Update user (role, ban/unban, status)
 *
 * SECURITY ARCHITECTURE:
 * - Closed column whitelist: only fields in USER_UPDATABLE_FIELDS are processed
 * - Explicit type coercion: booleans and integers are cast before reaching SQL
 * - Self-demotion guard: a user cannot change their own role
 * - Every column name is a hardcoded string, never user input
 *
 * @param {number|string} id - Target user ID
 * @param {Object} body - Whitelisted fields from controller
 * @param {Object} [requestingUser] - The admin performing the action (for self-demotion guard)
 */
const updateUser = async (id, body, requestingUser) => {
    const targetId = parseInt(id, 10);
    if (Number.isNaN(targetId)) {
        throw new AppError('Invalid user ID.', 400, 'INVALID_PARAM');
    }

    const { role_id, role_name, is_active, is_verified, ban_type, ban_expires_at } = body;
    const updates = [];
    const values = [];
    let paramIndex = 1;

    // ── Self-demotion guard ──
    // SECURITY: Prevent a super_admin from accidentally demoting themselves
    if (requestingUser && requestingUser.id === targetId && (role_id !== undefined || role_name)) {
        throw new AppError(
            'You cannot change your own role. Ask another super_admin.',
            403, 'SELF_DEMOTION_BLOCKED'
        );
    }

    // ── Support setting role by name (resolve to role_id) ──
    if (role_name && !role_id) {
        const role = await adminRepo.getRoleByName(role_name);
        if (!role) {
            throw new AppError(`Role "${role_name}" not found.`, 404, 'ROLE_NOT_FOUND');
        }
        updates.push(`role_id = $${paramIndex++}`);
        values.push(role.id);
    }

    // ── Process whitelisted fields with type coercion ──
    if (role_id !== undefined) {
        const safeRoleId = parseInt(role_id, 10);
        if (Number.isNaN(safeRoleId)) {
            throw new AppError('role_id must be an integer.', 400, 'INVALID_PARAM');
        }
        updates.push(`role_id = $${paramIndex++}`);
        values.push(safeRoleId);
    }

    if (is_active !== undefined) {
        updates.push(`is_active = $${paramIndex++}`);
        values.push(toBool(is_active));
    }

    if (is_verified !== undefined) {
        updates.push(`is_verified = $${paramIndex++}`);
        values.push(toBool(is_verified));
    }

    if (ban_type !== undefined) {
        // Allow null to clear ban, or validate against allowed values
        const safeBanType = ban_type || null;
        if (safeBanType && !['temporary', 'permanent'].includes(safeBanType)) {
            throw new AppError('ban_type must be "temporary", "permanent", or null.', 400, 'INVALID_PARAM');
        }
        updates.push(`ban_type = $${paramIndex++}`);
        values.push(safeBanType);
    }

    if (ban_expires_at !== undefined) {
        updates.push(`ban_expires_at = $${paramIndex++}`);
        values.push(ban_expires_at || null);
    }

    if (updates.length === 0) {
        throw new AppError('No valid fields to update.', 400, 'NO_FIELDS');
    }

    const user = await adminRepo.updateUser(targetId, updates, values);
    if (!user) {
        throw new AppError('User not found.', 404, 'USER_NOT_FOUND');
    }
    return user;
};

/**
 * Get all roles
 */
const getRoles = async () => {
    return adminRepo.getRoles();
};

/**
 * Update role permissions
 *
 * SECURITY: Independent validation — does NOT trust upstream layers.
 * Even if called from an internal script that bypasses HTTP validation,
 * this function guarantees type safety before writing to the DB.
 */
const updateRole = async (id, permissionsJson) => {
    const safeId = parseInt(id, 10);
    if (Number.isNaN(safeId)) {
        throw new AppError('Invalid role ID.', 400, 'INVALID_PARAM');
    }

    // SECURITY: Guard against undefined → "undefined" corruption
    if (!Array.isArray(permissionsJson)) {
        throw new AppError(
            'permissions_json must be an array of permission strings.',
            400, 'INVALID_PERMISSIONS'
        );
    }

    // Ensure every element is a non-empty string
    const sanitized = permissionsJson
        .filter(p => typeof p === 'string' && p.trim().length > 0)
        .map(p => p.trim());

    if (sanitized.length === 0) {
        throw new AppError('permissions_json must contain at least one valid permission.', 400, 'EMPTY_PERMISSIONS');
    }

    const role = await adminRepo.updateRole(safeId, sanitized);
    if (!role) {
        throw new AppError('Role not found.', 404, 'ROLE_NOT_FOUND');
    }
    return role;
};

/**
 * Get login logs (paginated)
 */
const getLogs = async ({ page, limit }) => {
    const offset = (page - 1) * limit;
    const { rows, total } = await loginLogRepo.findAll(limit, offset);
    return {
        logs: rows,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
};

/**
 * Clear all login logs
 */
const clearLogs = async () => {
    await loginLogRepo.clearAll();
};

/**
 * Global search across entities
 *
 * SECURITY: Escapes ILIKE wildcards (% and _) to prevent
 * unintended pattern matching on user-controlled input.
 */
const globalSearch = async (q) => {
    if (!q || q.trim().length < 2) return [];

    // Escape ILIKE wildcards, then wrap with % for partial matching
    const escaped = escapeILike(q.trim());
    return adminRepo.globalSearch(`%${escaped}%`);
};

/**
 * Get admin messages (paginated)
 */
const getMessages = async ({ page, limit, status }) => {
    return adminRepo.getMessages({ page, limit, status });
};

/**
 * Delete a message
 */
const deleteMessage = async (id) => {
    const safeId = parseInt(id, 10);
    if (Number.isNaN(safeId)) {
        throw new AppError('Invalid message ID.', 400, 'INVALID_PARAM');
    }

    const result = await adminRepo.deleteMessage(safeId);
    if (!result) {
        throw new AppError('Message not found.', 404, 'NOT_FOUND');
    }
};

module.exports = {
    getDashboardStats,
    getUsersPaginated,
    updateUser,
    getRoles,
    updateRole,
    getLogs,
    clearLogs,
    globalSearch,
    getMessages,
    deleteMessage,
};
