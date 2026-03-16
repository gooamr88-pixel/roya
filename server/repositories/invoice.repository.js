// ═══════════════════════════════════════════════
// Invoice Repository
// ═══════════════════════════════════════════════
const { query } = require('../config/database');

const findByOrderId = async (orderId) => {
    const result = await query('SELECT id FROM invoices WHERE order_id = $1', [orderId]);
    return result.rows[0] || null;
};

const create = async ({ orderId, invoiceNumber, totalAmount, taxAmount, pdfBuffer }) => {
    const result = await query(
        `INSERT INTO invoices (order_id, invoice_number, total_amount, tax_amount, pdf_data, status)
         VALUES ($1, $2, $3, $4, $5, 'generated') RETURNING *`,
        [orderId, invoiceNumber, totalAmount, taxAmount, pdfBuffer]
    );
    return result.rows[0];
};

const update = async ({ orderId, totalAmount, taxAmount, pdfBuffer }) => {
    const result = await query(
        `UPDATE invoices SET total_amount = $1, tax_amount = $2, pdf_data = $3, status = 'generated'
         WHERE order_id = $4 RETURNING *`,
        [totalAmount, taxAmount, pdfBuffer, orderId]
    );
    return result.rows[0];
};

const findByIdWithOwner = async (id) => {
    const result = await query(
        `SELECT i.*, o.user_id FROM invoices i
         LEFT JOIN orders o ON i.order_id = o.id
         WHERE i.id = $1`,
        [id]
    );
    return result.rows[0] || null;
};

const findAll = async ({ page, limit, userId, isAdmin }) => {
    const offset = (page - 1) * limit;
    const listParams = isAdmin ? [limit, offset] : [limit, offset, userId];
    const countParams = isAdmin ? [] : [userId];
    const listWhere = isAdmin ? '' : 'WHERE o.user_id = $3';
    const countWhere = isAdmin ? '' : 'WHERE o.user_id = $1';

    const [invoices, countResult] = await Promise.all([
        query(
            `SELECT i.id, i.invoice_number, i.total_amount, i.tax_amount, i.status, i.created_at,
                    o.service_title, u.name as client_name
             FROM invoices i
             LEFT JOIN orders o ON i.order_id = o.id
             LEFT JOIN users u ON o.user_id = u.id
             ${listWhere}
             ORDER BY i.created_at DESC LIMIT $1 OFFSET $2`,
            listParams
        ),
        query(`SELECT COUNT(*) FROM invoices i LEFT JOIN orders o ON i.order_id = o.id ${countWhere}`, countParams),
    ]);

    const total = parseInt(countResult.rows[0].count, 10);
    return {
        rows: invoices.rows,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
};

const getOrderWithClient = async (orderId) => {
    const result = await query(
        `SELECT o.*, u.name as client_name, u.email as client_email, u.phone as client_phone
         FROM orders o LEFT JOIN users u ON o.user_id = u.id WHERE o.id = $1`,
        [orderId]
    );
    return result.rows[0] || null;
};

module.exports = { findByOrderId, create, update, findByIdWithOwner, findAll, getOrderWithClient };
