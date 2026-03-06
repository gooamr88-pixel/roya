// ═══════════════════════════════════════════════
// Order Controller — RBAC-aware CRUD + Cancel + Delete
// ═══════════════════════════════════════════════
const { query, getClient } = require('../config/database');
const { AppError } = require('../middlewares/errorHandler');
const notificationService = require('../services/notification.service');
const whatsappService = require('../services/whatsapp.service');
const emailService = require('../services/email.service');
const { randomBytes } = require('crypto');
const { v4: uuidv4 } = require('uuid');

/**
 * POST /api/orders — Create order
 */
const create = async (req, res, next) => {
    try {
        const { service_id, notes } = req.body;

        const svcResult = await query('SELECT id, title, price FROM services WHERE id = $1 AND is_active = TRUE', [service_id]);
        if (svcResult.rows.length === 0) throw new AppError('Service not found or inactive.', 404);

        const service = svcResult.rows[0];
        const invoiceNumber = `INV-${Date.now()}-${randomBytes(3).toString('hex').toUpperCase()}`;

        const result = await query(
            `INSERT INTO orders (user_id, service_id, service_title, price, status, notes, invoice_number)
       VALUES ($1, $2, $3, $4, 'pending', $5, $6) RETURNING *`,
            [req.user.id, service.id, service.title, service.price, notes || null, invoiceNumber]
        );

        const order = result.rows[0];

        await notificationService.createNotification(
            req.user.id, 'Order Created',
            `Your order #${invoiceNumber} for "${service.title}" has been placed.`,
            'info'
        );

        if (req.user.phone) {
            whatsappService.sendOrderConfirmation(req.user.phone, order).catch(() => { });
        }

        res.status(201).json({ success: true, data: { order } });
    } catch (err) { next(err); }
};

/**
 * GET /api/orders — List orders
 */
const getAll = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const status = req.query.status;

        const isAdmin = ['super_admin', 'admin', 'supervisor'].includes(req.user.role);
        let where = isAdmin ? 'WHERE 1=1' : 'WHERE o.user_id = $3';
        const params = [limit, offset];
        let countWhere = isAdmin ? 'WHERE 1=1' : 'WHERE o.user_id = $1';
        const countParams = [];
        if (!isAdmin) {
            params.push(req.user.id);
            countParams.push(req.user.id);
        }

        if (status) {
            where += ` AND o.status = $${params.length + 1}`;
            params.push(status);
            countWhere += ` AND o.status = $${countParams.length + 1}`;
            countParams.push(status);
        }

        const [orders, countResult] = await Promise.all([
            query(
                `SELECT o.*, u.name as client_name, u.email as client_email
         FROM orders o
         LEFT JOIN users u ON o.user_id = u.id
         ${where}
         ORDER BY o.created_at DESC LIMIT $1 OFFSET $2`, params
            ),
            query(`SELECT COUNT(*) FROM orders o ${countWhere}`, countParams),
        ]);

        res.json({
            success: true,
            data: {
                orders: orders.rows,
                pagination: { page, limit, total: parseInt(countResult.rows[0].count), totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit) },
            },
        });
    } catch (err) { next(err); }
};

/**
 * GET /api/orders/:id
 */
const getById = async (req, res, next) => {
    try {
        const isAdmin = ['super_admin', 'admin', 'supervisor'].includes(req.user.role);
        let queryStr = `SELECT o.*, u.name as client_name, u.email as client_email, u.phone as client_phone
                     FROM orders o LEFT JOIN users u ON o.user_id = u.id WHERE o.id = $1`;
        const params = [req.params.id];

        if (!isAdmin) {
            queryStr += ' AND o.user_id = $2';
            params.push(req.user.id);
        }

        const result = await query(queryStr, params);
        if (result.rows.length === 0) throw new AppError('Order not found.', 404);
        res.json({ success: true, data: { order: result.rows[0] } });
    } catch (err) { next(err); }
};

/**
 * PUT /api/orders/:id/status — Admin update status
 */
const updateStatus = async (req, res, next) => {
    try {
        const { status } = req.body;

        const result = await query(
            `UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
            [status, req.params.id]
        );
        if (result.rows.length === 0) throw new AppError('Order not found.', 404);

        const order = result.rows[0];

        await notificationService.createNotification(
            order.user_id,
            'Order Status Updated',
            `Your order #${order.invoice_number} status: ${status.replace(/_/g, ' ').toUpperCase()}`,
            status === 'completed' ? 'success' : 'info'
        );

        const userResult = await query('SELECT phone FROM users WHERE id = $1', [order.user_id]);
        if (userResult.rows[0]?.phone) {
            whatsappService.sendStatusUpdate(userResult.rows[0].phone, order).catch(() => { });
        }

        res.json({ success: true, data: { order } });
    } catch (err) { next(err); }
};

/**
 * PUT /api/orders/:id/cancel — User self-cancellation (pending only)
 */
const cancelOrder = async (req, res, next) => {
    try {
        // Only allow cancelling own pending orders
        const result = await query(
            `UPDATE orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
             WHERE id = $1 AND user_id = $2 AND status = 'pending' RETURNING *`,
            [req.params.id, req.user.id]
        );

        if (result.rows.length === 0) {
            throw new AppError('Order not found, not yours, or cannot be cancelled (only pending orders).', 400, 'CANCEL_FAILED');
        }

        const order = result.rows[0];

        await notificationService.createNotification(
            req.user.id, 'Order Cancelled',
            `Your order #${order.invoice_number} for "${order.service_title}" has been cancelled.`,
            'warning'
        );

        res.json({ success: true, message: 'Order cancelled successfully.', data: { order } });
    } catch (err) { next(err); }
};

/**
 * DELETE /api/orders/:id — Super Admin delete completed orders + email notification
 */
const deleteOrder = async (req, res, next) => {
    try {
        // Only super_admin can delete, and only completed orders
        const orderResult = await query(
            `SELECT o.*, u.name as client_name, u.email as client_email
             FROM orders o LEFT JOIN users u ON o.user_id = u.id
             WHERE o.id = $1`,
            [req.params.id]
        );

        if (orderResult.rows.length === 0) {
            throw new AppError('Order not found.', 404);
        }

        const order = orderResult.rows[0];

        if (order.status !== 'completed') {
            throw new AppError('Only completed orders can be deleted.', 400, 'DELETE_NOT_ALLOWED');
        }

        await query('DELETE FROM orders WHERE id = $1', [req.params.id]);

        // Send branded cancellation email to the user
        if (order.client_email) {
            emailService.sendOrderCancellation(
                order.client_email,
                order.client_name,
                order.invoice_number,
                order.service_title,
                'This order record has been removed by an administrator.'
            ).catch(() => { });
        }

        await notificationService.createNotification(
            order.user_id, 'Order Deleted',
            `Your completed order #${order.invoice_number} has been removed by an administrator.`,
            'warning'
        );

        res.json({ success: true, message: 'Order deleted successfully.' });
    } catch (err) { next(err); }
};

module.exports = { create, getAll, getById, updateStatus, cancelOrder, deleteOrder };
