// ═══════════════════════════════════════════════
// Admin Controller — Executive Command Center
// ═══════════════════════════════════════════════
const { query } = require('../config/database');
const { AppError } = require('../middlewares/errorHandler');

/**
 * GET /api/admin/stats — Executive Insights
 */
const getStats = async (req, res, next) => {
    try {
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

        const totalUsers = parseInt(users.rows[0].count);
        const totalOrders = parseInt(orders.rows[0].count);
        const totalUsersWithOrders = parseInt(usersWithOrders.rows[0].count);
        const conversionRate = totalUsers > 0 ? Math.round((totalUsersWithOrders / totalUsers) * 100) : 0;

        // Recent orders
        const recentOrders = await query(
            `SELECT o.id, o.invoice_number, o.service_title, o.price, o.status, o.created_at,
              u.name as client_name
       FROM orders o LEFT JOIN users u ON o.user_id = u.id
       ORDER BY o.created_at DESC LIMIT 5`
        );

        res.json({
            success: true,
            data: {
                stats: {
                    totalUsers,
                    totalOrders,
                    totalServices: parseInt(services.rows[0].count),
                    totalRevenue: parseFloat(revenue.rows[0].total),
                    pendingOrders: parseInt(pending.rows[0].count),
                    totalExhibitions: parseInt(exhibitions.rows[0].count),
                    totalProperties: parseInt(properties.rows[0].count),
                    totalJobs: parseInt(jobs.rows[0].count),
                    totalPortfolio: parseInt(portfolio.rows[0].count),
                    unansweredMessages: parseInt(unanswered.rows[0].count),
                    conversionRate,
                },
                recentOrders: recentOrders.rows,
            },
        });
    } catch (err) { next(err); }
};

/**
 * GET /api/admin/users
 */
const getUsers = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const search = req.query.search;

        // BUG FIX #6: Build independent param arrays for main and count queries.
        // Previously, the count query received params.slice(2) which contained the
        // search term but the WHERE clause referenced $3 — a guaranteed Postgres error.
        let where = '';
        let countWhere = '';
        const mainParams = [limit, offset];   // $1=limit, $2=offset
        const countParams = [];               // independently positioned

        if (search) {
            // main query: search term is $3 (after limit and offset)
            where = `WHERE u.name ILIKE $3 OR u.email ILIKE $3`;
            mainParams.push(`%${search}%`);
            // count query: search term is $1 (no limit/offset needed)
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

        res.json({
            success: true,
            data: {
                users: users.rows,
                pagination: { page, limit, total: parseInt(countResult.rows[0].count), totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit) },
            },
        });
    } catch (err) { next(err); }
};


/**
 * PUT /api/admin/users/:id — Update user (role, ban/unban)
 */
const updateUser = async (req, res, next) => {
    try {
        const { role_id, is_active, is_verified, role_name, ban_type, ban_expires_at } = req.body;
        const updates = []; const values = []; let i = 1;

        // Support setting role by name
        if (role_name && !role_id) {
            const roleResult = await query('SELECT id FROM roles WHERE name = $1', [role_name]);
            if (roleResult.rows.length > 0) {
                updates.push(`role_id = $${i++}`);
                values.push(roleResult.rows[0].id);
            }
        }
        if (role_id !== undefined) { updates.push(`role_id = $${i++}`); values.push(role_id); }
        if (is_active !== undefined) { updates.push(`is_active = $${i++}`); values.push(is_active); }
        if (is_verified !== undefined) { updates.push(`is_verified = $${i++}`); values.push(is_verified); }
        // Ban fields
        if (ban_type !== undefined) { updates.push(`ban_type = $${i++}`); values.push(ban_type || null); }
        if (ban_expires_at !== undefined) { updates.push(`ban_expires_at = $${i++}`); values.push(ban_expires_at || null); }

        if (updates.length === 0) throw new AppError('No fields to update.', 400);
        updates.push('updated_at = CURRENT_TIMESTAMP');
        values.push(req.params.id);
        const result = await query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${i} RETURNING id, name, email, is_active, ban_type`, values);
        if (result.rows.length === 0) throw new AppError('User not found.', 404);
        res.json({ success: true, data: { user: result.rows[0] } });
    } catch (err) { next(err); }
};

/**
 * GET /api/admin/roles
 */
const getRoles = async (req, res, next) => {
    try {
        const result = await query('SELECT * FROM roles ORDER BY id');
        res.json({ success: true, data: { roles: result.rows } });
    } catch (err) { next(err); }
};

/**
 * PUT /api/admin/roles/:id
 */
const updateRole = async (req, res, next) => {
    try {
        const { permissions_json } = req.body;
        const result = await query(
            'UPDATE roles SET permissions_json = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
            [JSON.stringify(permissions_json), req.params.id]
        );
        if (result.rows.length === 0) throw new AppError('Role not found.', 404);
        res.json({ success: true, data: { role: result.rows[0] } });
    } catch (err) { next(err); }
};

/**
 * GET /api/admin/logs
 */
const getLogs = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const offset = (page - 1) * limit;

        const [logs, countResult] = await Promise.all([
            query(
                `SELECT l.*, u.name as user_name, u.email as user_email
         FROM login_logs l LEFT JOIN users u ON l.user_id = u.id
         ORDER BY l.login_time DESC LIMIT $1 OFFSET $2`,
                [limit, offset]
            ),
            query('SELECT COUNT(*) FROM login_logs'),
        ]);

        res.json({
            success: true,
            data: {
                logs: logs.rows,
                pagination: { page, limit, total: parseInt(countResult.rows[0].count), totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit) },
            },
        });
    } catch (err) { next(err); }
};

/**
 * GET /api/admin/search — Global search across users, orders, properties
 */
const globalSearch = async (req, res, next) => {
    try {
        const { q } = req.query;
        if (!q || q.length < 2) return res.json({ success: true, data: { results: [] } });

        const searchTerm = `%${q}%`;
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

        res.json({
            success: true,
            data: {
                results: [
                    ...users.rows,
                    ...orders.rows,
                    ...properties.rows,
                    ...services.rows,
                    ...jobs.rows,
                ],
            },
        });
    } catch (err) { next(err); }
};
// ═══════════════════════════════════════════════
// MESSAGES (Wrappers for Contact System)
// ═══════════════════════════════════════════════

const getMessages = async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(50, parseInt(req.query.limit) || 15);
        const offset = (page - 1) * limit;
        const status = req.query.status || '';

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

        const total = parseInt(countResult.rows[0].count);

        // The frontend admin.messages.js expects data.messages array
        res.json({
            success: true,
            data: {
                messages: messages.rows,
                pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
            },
        });
    } catch (err) { next(err); }
};

const replyMessage = async (req, res, next) => {
    try {
        const contactCtrl = require('./contact.controller');
        // Re-use the reply logic from contact controller
        await contactCtrl.reply(req, res, next);
    } catch (err) { next(err); }
};

const updateMessageNote = async (req, res, next) => {
    try {
        const contactCtrl = require('./contact.controller');
        // Re-use updateNote from contact controller
        await contactCtrl.updateNote(req, res, next);
    } catch (err) { next(err); }
};

/**
 * DELETE /api/admin/messages/:id — Delete a message
 */
const deleteMessage = async (req, res, next) => {
    try {
        const result = await query('DELETE FROM contacts WHERE id = $1 RETURNING id', [req.params.id]);
        if (result.rows.length === 0) {
            throw new AppError('Message not found.', 404);
        }
        res.json({ success: true, message: 'Message deleted successfully.' });
    } catch (err) { next(err); }
};

/**
 * DELETE /api/admin/logs — Clear all login logs
 */
const clearLogs = async (req, res, next) => {
    try {
        await query('DELETE FROM login_logs');
        res.json({ success: true, message: 'All login logs cleared successfully.' });
    } catch (err) { next(err); }
};

module.exports = { getStats, getUsers, updateUser, getRoles, updateRole, getLogs, clearLogs, globalSearch, getMessages, replyMessage, updateMessageNote, deleteMessage };
