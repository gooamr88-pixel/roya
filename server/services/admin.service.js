// ═══════════════════════════════════════════════
// Admin Service — Business logic for admin operations
// ═══════════════════════════════════════════════
const { AppError } = require('../middlewares/errorHandler');
const adminRepo = require('../repositories/admin.repository');
const orderRepo = require('../repositories/order.repository');

/**
 * Get dashboard stats
 */
const getDashboardStats = async () => {
    const stats = await adminRepo.getStats();
    const conversionRate = stats.totalUsers > 0
        ? Math.round((stats.totalUsersWithOrders / stats.totalUsers) * 100)
        : 0;

    const recentOrders = await orderRepo.getRecentOrders(5);

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
    return adminRepo.getUsers({ page, limit, search });
};

/**
 * Update user (role, ban/unban, status)
 */
const updateUser = async (id, body) => {
    const { role_id, is_active, is_verified, role_name, ban_type, ban_expires_at } = body;
    const updates = [];
    const values = [];
    let i = 1;

    // Support setting role by name
    if (role_name && !role_id) {
        const role = await adminRepo.getRoleByName(role_name);
        if (role) {
            updates.push(`role_id = $${i++}`);
            values.push(role.id);
        }
    }
    if (role_id !== undefined) { updates.push(`role_id = $${i++}`); values.push(role_id); }
    if (is_active !== undefined) { updates.push(`is_active = $${i++}`); values.push(is_active); }
    if (is_verified !== undefined) { updates.push(`is_verified = $${i++}`); values.push(is_verified); }
    if (ban_type !== undefined) { updates.push(`ban_type = $${i++}`); values.push(ban_type || null); }
    if (ban_expires_at !== undefined) { updates.push(`ban_expires_at = $${i++}`); values.push(ban_expires_at || null); }

    if (updates.length === 0) {
        throw new AppError('No fields to update.', 400);
    }

    const user = await adminRepo.updateUser(id, updates, values);
    if (!user) {
        throw new AppError('User not found.', 404);
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
 */
const updateRole = async (id, permissionsJson) => {
    const role = await adminRepo.updateRole(id, permissionsJson);
    if (!role) {
        throw new AppError('Role not found.', 404);
    }
    return role;
};

/**
 * Get login logs (paginated)
 */
const getLogs = async ({ page, limit }) => {
    const offset = (page - 1) * limit;
    const { rows, total } = await require('../repositories/login-log.repository').findAll(limit, offset);
    return {
        logs: rows,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
};

/**
 * Clear all login logs
 */
const clearLogs = async () => {
    await require('../repositories/login-log.repository').clearAll();
};

/**
 * Global search across entities
 */
const globalSearch = async (q) => {
    if (!q || q.length < 2) return [];
    return adminRepo.globalSearch(`%${q}%`);
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
    const result = await adminRepo.deleteMessage(id);
    if (!result) {
        throw new AppError('Message not found.', 404);
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
