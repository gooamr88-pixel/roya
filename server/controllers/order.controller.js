// ═══════════════════════════════════════════════
// Order Controller — Thin HTTP layer
// ═══════════════════════════════════════════════
const { AppError } = require('../middlewares/errorHandler');
const { asyncHandler } = require('../utils/helpers');
const notificationService = require('../services/notification.service');
const whatsappService = require('../services/whatsapp.service');
const emailService = require('../services/email.service');
const orderRepo = require('../repositories/order.repository');
const serviceRepo = require('../repositories/service.repository');
const { randomBytes } = require('crypto');

/**
 * POST /api/orders
 */
const create = asyncHandler(async (req, res) => {
    const { service_id, notes } = req.body;

    const service = await serviceRepo.findActiveById(service_id);
    if (!service) throw new AppError('Service not found or inactive.', 404);

    const invoiceNumber = `INV-${Date.now()}-${randomBytes(3).toString('hex').toUpperCase()}`;

    const order = await orderRepo.create({
        userId: req.user.id,
        serviceId: service.id,
        serviceTitle: service.title,
        price: service.price,
        notes,
        invoiceNumber,
    });

    await notificationService.createNotification(
        req.user.id, 'Order Created',
        `Your order #${invoiceNumber} for "${service.title}" has been placed.`,
        'info'
    );

    if (req.user.phone) {
        whatsappService.sendOrderConfirmation(req.user.phone, order).catch(() => {});
    }

    res.status(201).json({ success: true, data: { order } });
});

/**
 * GET /api/orders
 */
const getAll = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const status = req.query.status;
    const isAdmin = ['super_admin', 'admin', 'supervisor'].includes(req.user.role);

    const { rows, pagination } = await orderRepo.findAll({
        page, limit, status,
        userId: req.user.id,
        isAdmin,
    });

    res.json({ success: true, data: { orders: rows, pagination } });
});

/**
 * GET /api/orders/:id
 */
const getById = asyncHandler(async (req, res) => {
    const isAdmin = ['super_admin', 'admin', 'supervisor'].includes(req.user.role);
    const order = await orderRepo.findById(req.params.id, { userId: req.user.id, isAdmin });
    if (!order) throw new AppError('Order not found.', 404);
    res.json({ success: true, data: { order } });
});

/**
 * PUT /api/orders/:id/status
 */
const updateStatus = asyncHandler(async (req, res) => {
    const { status } = req.body;
    const order = await orderRepo.updateStatus(req.params.id, status);
    if (!order) throw new AppError('Order not found.', 404);

    await notificationService.createNotification(
        order.user_id,
        'Order Status Updated',
        `Your order #${order.invoice_number} status: ${status.replace(/_/g, ' ').toUpperCase()}`,
        status === 'completed' ? 'success' : 'info'
    );

    const phone = await orderRepo.getUserPhone(order.user_id);
    if (phone) {
        whatsappService.sendStatusUpdate(phone, order).catch(() => {});
    }

    res.json({ success: true, data: { order } });
});

/**
 * PUT /api/orders/:id/cancel
 */
const cancelOrder = asyncHandler(async (req, res) => {
    const order = await orderRepo.cancelOrder(req.params.id, req.user.id);
    if (!order) {
        throw new AppError('Order not found, not yours, or cannot be cancelled (only pending orders).', 400, 'CANCEL_FAILED');
    }

    await notificationService.createNotification(
        req.user.id, 'Order Cancelled',
        `Your order #${order.invoice_number} for "${order.service_title}" has been cancelled.`,
        'warning'
    );

    res.json({ success: true, message: 'Order cancelled successfully.', data: { order } });
});

/**
 * DELETE /api/orders/:id
 */
const deleteOrder = asyncHandler(async (req, res) => {
    const order = await orderRepo.findByIdWithClient(req.params.id);
    if (!order) throw new AppError('Order not found.', 404);
    if (order.status !== 'completed') {
        throw new AppError('Only completed orders can be deleted.', 400, 'DELETE_NOT_ALLOWED');
    }

    await orderRepo.deleteById(req.params.id);

    if (order.client_email) {
        emailService.sendOrderCancellation(
            order.client_email, order.client_name, order.invoice_number,
            order.service_title, 'This order record has been removed by an administrator.'
        ).catch(() => {});
    }

    await notificationService.createNotification(
        order.user_id, 'Order Deleted',
        `Your completed order #${order.invoice_number} has been removed by an administrator.`,
        'warning'
    );

    res.json({ success: true, message: 'Order deleted successfully.' });
});

module.exports = { create, getAll, getById, updateStatus, cancelOrder, deleteOrder };
