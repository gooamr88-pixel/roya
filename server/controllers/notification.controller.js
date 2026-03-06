// ═══════════════════════════════════════════════
// Notification Controller
// ═══════════════════════════════════════════════
const notificationService = require('../services/notification.service');

const getAll = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const result = await notificationService.getUserNotifications(req.user.id, page, limit);
        const unreadCount = await notificationService.getUnreadCount(req.user.id);
        res.json({ success: true, data: { ...result, unreadCount } });
    } catch (err) { next(err); }
};

const markRead = async (req, res, next) => {
    try {
        await notificationService.markAsRead(req.params.id, req.user.id);
        res.json({ success: true, message: 'Notification marked as read.' });
    } catch (err) { next(err); }
};

const markAllRead = async (req, res, next) => {
    try {
        await notificationService.markAllAsRead(req.user.id);
        res.json({ success: true, message: 'All notifications marked as read.' });
    } catch (err) { next(err); }
};

module.exports = { getAll, markRead, markAllRead };
