// ═══════════════════════════════════════════════
// Job Repository
// ═══════════════════════════════════════════════
const { query } = require('../config/database');

const findAll = async ({ page, limit, type }) => {
    const offset = (page - 1) * limit;
    let whereClause = 'WHERE is_active = TRUE';
    const params = [limit, offset];
    let countWhere = 'WHERE is_active = TRUE';
    const countParams = [];

    if (type) {
        whereClause += ` AND type = $3`;
        params.push(type);
        countWhere += ` AND type = $1`;
        countParams.push(type);
    }

    const [jobs, countResult] = await Promise.all([
        query(
            `SELECT id, title, description, company, location, type, salary_range, is_active, created_at
             FROM jobs ${whereClause}
             ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
            params
        ),
        query(`SELECT COUNT(*) FROM jobs ${countWhere}`, countParams),
    ]);

    const total = parseInt(countResult.rows[0].count, 10);
    return {
        rows: jobs.rows,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
};

const findById = async (id) => {
    const result = await query('SELECT * FROM jobs WHERE id = $1', [id]);
    return result.rows[0] || null;
};

const create = async ({ title, description, company, location, type, salaryRange }) => {
    const result = await query(
        `INSERT INTO jobs (title, description, company, location, type, salary_range)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [title, description || '', company || '', location || '', type || 'full_time', salaryRange || '']
    );
    return result.rows[0];
};

const update = async (id, updates, values) => {
    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    const paramIndex = values.length;
    const result = await query(
        `UPDATE jobs SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
        values
    );
    return result.rows[0] || null;
};

const softDelete = async (id) => {
    const result = await query(
        'UPDATE jobs SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING id',
        [id]
    );
    return result.rows[0] || null;
};

module.exports = { findAll, findById, create, update, softDelete };
