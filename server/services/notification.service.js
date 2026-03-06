// ═══════════════════════════════════════════════
// Notification Service
// ═══════════════════════════════════════════════
const { query } = require('../config/database');

/**
 * Create a notification for a user
 */
const createNotification = async (userId, title, message, type = 'info', link = null) => {
    const result = await query(
        `INSERT INTO notifications (user_id, title, message, type, link)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [userId, title, message, type, link]
    );
    return result.rows[0];
};

/**
 * Get notifications for a user (paginated)
 */
const getUserNotifications = async (userId, page = 1, limit = 20) => {
    const offset = (page - 1) * limit;

    const [notifications, countResult] = await Promise.all([
        query(
            `SELECT * FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
            [userId, limit, offset]
        ),
        query(
            `SELECT COUNT(*) FROM notifications WHERE user_id = $1`,
            [userId]
        ),
    ]);

    return {
        notifications: notifications.rows,
        total: parseInt(countResult.rows[0].count),
        page,
        totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit),
    };
};

/**
 * Get unread notification count
 */
const getUnreadCount = async (userId) => {
    const result = await query(
        `SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = FALSE`,
        [userId]
    );
    return parseInt(result.rows[0].count);
};

/**
 * Mark notification as read
 */
const markAsRead = async (notificationId, userId) => {
    await query(
        `UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2`,
        [notificationId, userId]
    );
};

/**
 * Mark all as read for a user
 */
const markAllAsRead = async (userId) => {
    await query(
        `UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE`,
        [userId]
    );
};

module.exports = {
    createNotification,
    getUserNotifications,
    getUnreadCount,
    markAsRead,
    markAllAsRead,
};
