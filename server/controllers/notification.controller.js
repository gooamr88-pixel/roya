// ═══════════════════════════════════════════════
// Notification Controller — Thin HTTP layer
// ═══════════════════════════════════════════════
const notificationService = require('../services/notification.service');
const { asyncHandler } = require('../utils/helpers');

const getAll = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const result = await notificationService.getUserNotifications(req.user.id, page, limit);
    const unreadCount = await notificationService.getUnreadCount(req.user.id);
    res.json({ success: true, data: { ...result, unreadCount } });
});

const markRead = asyncHandler(async (req, res) => {
    await notificationService.markAsRead(req.params.id, req.user.id);
    res.json({ success: true, message: 'Notification marked as read.' });
});

const markAllRead = asyncHandler(async (req, res) => {
    await notificationService.markAllAsRead(req.user.id);
    res.json({ success: true, message: 'All notifications marked as read.' });
});

module.exports = { getAll, markRead, markAllRead };
