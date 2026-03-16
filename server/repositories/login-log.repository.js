// ═══════════════════════════════════════════════
// Login Log Repository
// ═══════════════════════════════════════════════
const { query } = require('../config/database');

const logSuccess = async (userId, ip, userAgent) => {
    await query(
        'INSERT INTO login_logs (user_id, ip_address, user_agent, success) VALUES ($1, $2, $3, TRUE)',
        [userId, ip, userAgent]
    );
};

const logFailure = async (userId, ip, userAgent) => {
    await query(
        'INSERT INTO login_logs (user_id, ip_address, user_agent, success) VALUES ($1, $2, $3, FALSE)',
        [userId, ip, userAgent]
    );
};

const logLogout = async (userId) => {
    await query(
        `UPDATE login_logs SET logout_time = CURRENT_TIMESTAMP
         WHERE id = (
           SELECT id FROM login_logs
           WHERE user_id = $1 AND logout_time IS NULL
           ORDER BY login_time DESC LIMIT 1
         )`,
        [userId]
    );
};

const findAll = async (limit, offset) => {
    const [logs, countResult] = await Promise.all([
        query(
            `SELECT l.*, u.name as user_name, u.email as user_email
             FROM login_logs l LEFT JOIN users u ON l.user_id = u.id
             ORDER BY l.login_time DESC LIMIT $1 OFFSET $2`,
            [limit, offset]
        ),
        query('SELECT COUNT(*) FROM login_logs'),
    ]);
    return { rows: logs.rows, total: parseInt(countResult.rows[0].count, 10) };
};

const clearAll = async () => {
    await query('DELETE FROM login_logs');
};

module.exports = { logSuccess, logFailure, logLogout, findAll, clearAll };
