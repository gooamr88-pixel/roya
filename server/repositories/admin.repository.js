// ═══════════════════════════════════════════════
// Admin Repository — Admin-specific SQL queries
// ═══════════════════════════════════════════════
const { query } = require('../config/database');

const getStats = async () => {
    const [users, orders, services, revenue, pending, exhibitions, properties, unanswered, usersWithOrders, jobs, portfolio] = await Promise.all([
        query('SELECT COUNT(*) FROM users'),
        query('SELECT COUNT(*) FROM orders'),
        query('SELECT COUNT(*) FROM services WHERE is_active = TRUE'),
        query("SELECT COALESCE(SUM(price), 0) as total FROM orders WHERE status = 'completed'"),
        query("SELECT COUNT(*) FROM orders WHERE status = 'pending'"),
        query('SELECT COUNT(*) FROM exhibitions WHERE is_active = TRUE'),
        query('SELECT COUNT(*) FROM properties WHERE is_active = TRUE'),
        query("SELECT COUNT(*) FROM contacts WHERE status = 'new'"),
        query('SELECT COUNT(DISTINCT user_id) FROM orders'),
        query('SELECT COUNT(*) FROM jobs WHERE is_active = TRUE'),
        query('SELECT COUNT(*) FROM portfolio_items WHERE is_active = TRUE'),
    ]);

    return {
        totalUsers: parseInt(users.rows[0].count, 10),
        totalOrders: parseInt(orders.rows[0].count, 10),
        totalServices: parseInt(services.rows[0].count, 10),
        totalRevenue: parseFloat(revenue.rows[0].total),
        pendingOrders: parseInt(pending.rows[0].count, 10),
        totalExhibitions: parseInt(exhibitions.rows[0].count, 10),
        totalProperties: parseInt(properties.rows[0].count, 10),
        totalJobs: parseInt(jobs.rows[0].count, 10),
        totalPortfolio: parseInt(portfolio.rows[0].count, 10),
        unansweredMessages: parseInt(unanswered.rows[0].count, 10),
        totalUsersWithOrders: parseInt(usersWithOrders.rows[0].count, 10),
    };
};

const getUsers = async ({ page, limit, search }) => {
    const offset = (page - 1) * limit;
    let where = '';
    let countWhere = '';
    const mainParams = [limit, offset];
    const countParams = [];

    if (search) {
        where = `WHERE u.name ILIKE $3 OR u.email ILIKE $3`;
        mainParams.push(`%${search}%`);
        countWhere = `WHERE u.name ILIKE $1 OR u.email ILIKE $1`;
        countParams.push(`%${search}%`);
    }

    const [users, countResult] = await Promise.all([
        query(
            `SELECT u.id, u.name, u.email, u.phone, u.is_active, u.is_verified,
                    u.last_login, u.created_at, r.name as role, r.id as role_id
             FROM users u LEFT JOIN roles r ON u.role_id = r.id
             ${where} ORDER BY u.created_at DESC LIMIT $1 OFFSET $2`,
            mainParams
        ),
        query(`SELECT COUNT(*) FROM users u ${countWhere}`, countParams),
    ]);

    const total = parseInt(countResult.rows[0].count, 10);
    return {
        rows: users.rows,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
};

const updateUser = async (id, updates, values) => {
    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    const paramIndex = values.length;
    const result = await query(
        `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING id, name, email, is_active, ban_type`,
        values
    );
    return result.rows[0] || null;
};

const getRoleByName = async (name) => {
    const result = await query('SELECT id FROM roles WHERE name = $1', [name]);
    return result.rows[0] || null;
};

const getRoles = async () => {
    const result = await query('SELECT * FROM roles ORDER BY id');
    return result.rows;
};

const updateRole = async (id, permissionsJson) => {
    const result = await query(
        'UPDATE roles SET permissions_json = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
        [JSON.stringify(permissionsJson), id]
    );
    return result.rows[0] || null;
};

const globalSearch = async (searchTerm) => {
    const [users, orders, properties, services, jobs] = await Promise.all([
        query(
            `SELECT id, name, email, 'user' as type FROM users WHERE name ILIKE $1 OR email ILIKE $1 LIMIT 5`,
            [searchTerm]
        ),
        query(
            `SELECT id, invoice_number, service_title as title, 'order' as type FROM orders WHERE invoice_number ILIKE $1 OR service_title ILIKE $1 LIMIT 5`,
            [searchTerm]
        ),
        query(
            `SELECT id, title, location, 'property' as type FROM properties WHERE title ILIKE $1 OR location ILIKE $1 LIMIT 5`,
            [searchTerm]
        ),
        query(
            `SELECT id, title, category, 'service' as type FROM services WHERE title ILIKE $1 LIMIT 5`,
            [searchTerm]
        ),
        query(
            `SELECT id, title, company as location, 'job' as type FROM jobs WHERE title ILIKE $1 OR company ILIKE $1 LIMIT 5`,
            [searchTerm]
        ),
    ]);

    return [
        ...users.rows,
        ...orders.rows,
        ...properties.rows,
        ...services.rows,
        ...jobs.rows,
    ];
};

const getMessages = async ({ page, limit, status }) => {
    const offset = (page - 1) * limit;
    let where = 'WHERE 1=1';
    const params = [limit, offset];
    let countWhere = 'WHERE 1=1';
    const countParams = [];

    if (status) {
        where += ` AND status = $${params.length + 1}`;
        params.push(status);
        countWhere += ` AND status = $${countParams.length + 1}`;
        countParams.push(status);
    }

    const [messages, countResult] = await Promise.all([
        query(`SELECT * FROM contacts ${where} ORDER BY created_at DESC LIMIT $1 OFFSET $2`, params),
        query(`SELECT COUNT(*) FROM contacts ${countWhere}`, countParams),
    ]);

    const total = parseInt(countResult.rows[0].count, 10);
    return {
        rows: messages.rows,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
};

const deleteMessage = async (id) => {
    const result = await query('DELETE FROM contacts WHERE id = $1 RETURNING id', [id]);
    return result.rows[0] || null;
};

module.exports = {
    getStats,
    getUsers,
    updateUser,
    getRoleByName,
    getRoles,
    updateRole,
    globalSearch,
    getMessages,
    deleteMessage,
};
