// ═══════════════════════════════════════════════
// Order Repository — All order-related SQL queries
// ═══════════════════════════════════════════════
const { query } = require('../config/database');

const create = async ({ userId, serviceId, serviceTitle, price, notes, invoiceNumber }) => {
    const result = await query(
        `INSERT INTO orders (user_id, service_id, service_title, price, status, notes, invoice_number)
         VALUES ($1, $2, $3, $4, 'pending', $5, $6) RETURNING *`,
        [userId, serviceId, serviceTitle, price, notes || null, invoiceNumber]
    );
    return result.rows[0];
};

const findById = async (id, { userId, isAdmin } = {}) => {
    let sql = `SELECT o.*, u.name as client_name, u.email as client_email, u.phone as client_phone
               FROM orders o LEFT JOIN users u ON o.user_id = u.id WHERE o.id = $1`;
    const params = [id];

    if (!isAdmin) {
        sql += ' AND o.user_id = $2';
        params.push(userId);
    }

    const result = await query(sql, params);
    return result.rows[0] || null;
};

const findAll = async ({ page, limit, status, userId, isAdmin }) => {
    const offset = (page - 1) * limit;
    let where = isAdmin ? 'WHERE 1=1' : 'WHERE o.user_id = $3';
    const params = [limit, offset];
    let countWhere = isAdmin ? 'WHERE 1=1' : 'WHERE o.user_id = $1';
    const countParams = [];

    if (!isAdmin) {
        params.push(userId);
        countParams.push(userId);
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
             FROM orders o LEFT JOIN users u ON o.user_id = u.id
             ${where} ORDER BY o.created_at DESC LIMIT $1 OFFSET $2`,
            params
        ),
        query(`SELECT COUNT(*) FROM orders o ${countWhere}`, countParams),
    ]);

    const total = parseInt(countResult.rows[0].count, 10);
    return {
        rows: orders.rows,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
};

const updateStatus = async (id, status) => {
    const result = await query(
        `UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
        [status, id]
    );
    return result.rows[0] || null;
};

const cancelOrder = async (id, userId) => {
    const result = await query(
        `UPDATE orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND user_id = $2 AND status = 'pending' RETURNING *`,
        [id, userId]
    );
    return result.rows[0] || null;
};

const findByIdWithClient = async (id) => {
    const result = await query(
        `SELECT o.*, u.name as client_name, u.email as client_email
         FROM orders o LEFT JOIN users u ON o.user_id = u.id
         WHERE o.id = $1`,
        [id]
    );
    return result.rows[0] || null;
};

const deleteById = async (id) => {
    await query('DELETE FROM orders WHERE id = $1', [id]);
};

const getRecentOrders = async (limit = 5) => {
    const result = await query(
        `SELECT o.id, o.invoice_number, o.service_title, o.price, o.status, o.created_at,
                u.name as client_name
         FROM orders o LEFT JOIN users u ON o.user_id = u.id
         ORDER BY o.created_at DESC LIMIT $1`,
        [limit]
    );
    return result.rows;
};

const getUserPhone = async (userId) => {
    const result = await query('SELECT phone FROM users WHERE id = $1', [userId]);
    return result.rows[0]?.phone || null;
};

module.exports = {
    create,
    findById,
    findAll,
    updateStatus,
    cancelOrder,
    findByIdWithClient,
    deleteById,
    getRecentOrders,
    getUserPhone,
};
