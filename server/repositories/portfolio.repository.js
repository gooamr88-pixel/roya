// ═══════════════════════════════════════════════
// Portfolio Repository
// ═══════════════════════════════════════════════
const { query } = require('../config/database');

const findAll = async ({ page, limit, isAdmin = false }) => {
    const offset = (page - 1) * limit;
    const whereClause = isAdmin ? '' : 'WHERE is_active = TRUE';

    const [items, countResult] = await Promise.all([
        query(
            `SELECT id, title, title_ar, description, description_ar, images, category, category_ar, is_active, created_at
             FROM portfolio_items
             ${whereClause}
             ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
            [limit, offset]
        ),
        query(`SELECT COUNT(*) FROM portfolio_items ${whereClause}`),
    ]);

    const total = parseInt(countResult.rows[0].count, 10);
    return {
        rows: items.rows,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
};

const findById = async (id) => {
    const result = await query('SELECT * FROM portfolio_items WHERE id = $1', [id]);
    return result.rows[0] || null;
};

const create = async ({ title, description, images, category, category_ar, title_ar, description_ar }) => {
    const result = await query(
        `INSERT INTO portfolio_items (title, description, images, category, category_ar, title_ar, description_ar)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [title, description || '', JSON.stringify(images), category || 'general', category_ar || null, title_ar || null, description_ar || null]
    );
    return result.rows[0];
};

const update = async (id, updates, values) => {
    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    const paramIndex = values.length;
    const result = await query(
        `UPDATE portfolio_items SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
        values
    );
    return result.rows[0] || null;
};

const softDelete = async (id) => {
    const result = await query(
        'UPDATE portfolio_items SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING id',
        [id]
    );
    return result.rows[0] || null;
};

const hardDelete = async (id) => {
    const result = await query(
        'DELETE FROM portfolio_items WHERE id = $1 RETURNING id',
        [id]
    );
    return result.rows[0] || null;
};

module.exports = { findAll, findById, create, update, softDelete, hardDelete };
