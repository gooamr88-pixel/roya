// ═══════════════════════════════════════════════
// Service Repository — Business services SQL
// ═══════════════════════════════════════════════
const { query } = require('../config/database');

const findAll = async ({ page, limit, category }) => {
    const offset = (page - 1) * limit;
    let whereClause = 'WHERE is_active = TRUE';
    const params = [limit, offset];
    let countWhere = 'WHERE is_active = TRUE';
    const countParams = [];

    if (category) {
        whereClause += ` AND category = $3`;
        params.push(category);
        countWhere += ` AND category = $1`;
        countParams.push(category);
    }

    const [services, countResult] = await Promise.all([
        query(
            `SELECT id, title, title_ar, description, description_ar, price, price_type, price_max, currency, images, category, category_ar, created_at
             FROM services ${whereClause}
             ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
            params
        ),
        query(`SELECT COUNT(*) FROM services ${countWhere}`, countParams),
    ]);

    const total = parseInt(countResult.rows[0].count, 10);
    return {
        rows: services.rows,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
};

const findById = async (id) => {
    const result = await query('SELECT * FROM services WHERE id = $1', [id]);
    return result.rows[0] || null;
};

const findActiveById = async (id) => {
    const result = await query(
        'SELECT id, title, price, currency FROM services WHERE id = $1 AND is_active = TRUE',
        [id]
    );
    return result.rows[0] || null;
};

const create = async ({ title, description, price, price_type, price_max, currency, images, category, title_ar, description_ar, category_ar }) => {
    const result = await query(
        `INSERT INTO services (title, description, price, price_type, price_max, currency, images, category, title_ar, description_ar, category_ar)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
        [title, description || '', parseFloat(price) || 0, price_type || 'fixed', price_max ? parseFloat(price_max) : null, currency || 'SAR', JSON.stringify(images), category || 'general', title_ar || null, description_ar || null, category_ar || null]
    );
    return result.rows[0];
};

const update = async (id, updates, values) => {
    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    const paramIndex = values.length;
    const result = await query(
        `UPDATE services SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
        values
    );
    return result.rows[0] || null;
};

const softDelete = async (id) => {
    const result = await query(
        'UPDATE services SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING id',
        [id]
    );
    return result.rows[0] || null;
};

module.exports = { findAll, findById, findActiveById, create, update, softDelete };
