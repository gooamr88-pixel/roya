// ═══════════════════════════════════════════════
// Exhibition Repository
// ═══════════════════════════════════════════════
const { query } = require('../config/database');

const findAll = async ({ page, limit, showAll }) => {
    const offset = (page - 1) * limit;
    const whereClause = showAll ? '' : 'WHERE is_active = TRUE';
    const countWhere = showAll ? '' : 'WHERE is_active = TRUE';

    const [exhibitions, countResult] = await Promise.all([
        query(
            `SELECT * FROM exhibitions ${whereClause} ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
            [limit, offset]
        ),
        query(`SELECT COUNT(*) FROM exhibitions ${countWhere}`),
    ]);

    const total = parseInt(countResult.rows[0].count, 10);
    return {
        rows: exhibitions.rows,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
};

const findById = async (id) => {
    const result = await query('SELECT * FROM exhibitions WHERE id = $1', [id]);
    return result.rows[0] || null;
};

const create = async ({ title, description, location, startDate, endDate, images }) => {
    const result = await query(
        `INSERT INTO exhibitions (title, description, location, start_date, end_date, images)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [title, description || '', location || null, startDate || null, endDate || null, JSON.stringify(images)]
    );
    return result.rows[0];
};

const update = async (id, updates, values) => {
    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    const paramIndex = values.length;
    const result = await query(
        `UPDATE exhibitions SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
        values
    );
    return result.rows[0] || null;
};

const softDelete = async (id) => {
    const result = await query(
        'UPDATE exhibitions SET is_active = FALSE WHERE id = $1 RETURNING id',
        [id]
    );
    return result.rows[0] || null;
};

module.exports = { findAll, findById, create, update, softDelete };
