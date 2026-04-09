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

    let listQuery, countQuery, listParams, countParams;

    if (isAdmin) {
        // ── Admin: fetch ALL invoices, no filter ──
        listQuery = `
            SELECT i.id, i.invoice_number, i.total_amount, i.tax_amount,
                   i.status, i.created_at, i.payload_json,
                   o.service_title, u.name as client_name
            FROM invoices i
            LEFT JOIN orders o ON i.order_id = o.id
            LEFT JOIN users u ON o.user_id = u.id
            ORDER BY i.created_at DESC
            LIMIT $1 OFFSET $2`;
        listParams = [limit, offset];

        countQuery = `SELECT COUNT(*) FROM invoices`;
        countParams = [];
    } else {
        // ── Non-admin: only their own invoices ──
        // Match via order owner OR via savedBy in payload_json (manual invoices)
        listQuery = `
            SELECT i.id, i.invoice_number, i.total_amount, i.tax_amount,
                   i.status, i.created_at, i.payload_json,
                   o.service_title, u.name as client_name
            FROM invoices i
            LEFT JOIN orders o ON i.order_id = o.id
            LEFT JOIN users u ON o.user_id = u.id
            WHERE o.user_id = $3
               OR (i.order_id IS NULL AND i.payload_json->>'savedBy' = $3::text)
            ORDER BY i.created_at DESC
            LIMIT $1 OFFSET $2`;
        listParams = [limit, offset, userId];

        countQuery = `
            SELECT COUNT(*) FROM invoices i
            LEFT JOIN orders o ON i.order_id = o.id
            WHERE o.user_id = $1
               OR (i.order_id IS NULL AND i.payload_json->>'savedBy' = $1::text)`;
        countParams = [userId];
    }

    const [invoices, countResult] = await Promise.all([
        query(listQuery, listParams),
        query(countQuery, countParams),
    ]);

    const total = parseInt(countResult.rows[0].count, 10);

    console.log(`[InvoiceRepo] findAll: isAdmin=${isAdmin} total=${total} returned=${invoices.rows.length} page=${page} offset=${offset}`);

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

const remove = async (id) => {
    const result = await query('DELETE FROM invoices WHERE id = $1 RETURNING id', [id]);
    return result.rows[0] || null;
};

module.exports = { findByOrderId, create, update, findByIdWithOwner, findAll, getOrderWithClient, remove };
