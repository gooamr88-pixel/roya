// ═══════════════════════════════════════════════
// Property Repository
// ═══════════════════════════════════════════════
const { query } = require('../config/database');

const findAll = async ({ page, limit, type }) => {
    const offset = (page - 1) * limit;
    let where = 'WHERE is_active = TRUE';
    const params = [limit, offset];
    let countWhere = 'WHERE is_active = TRUE';
    const countParams = [];

    if (type) {
        where += ` AND property_type = $3`;
        params.push(type);
        countWhere += ` AND property_type = $1`;
        countParams.push(type);
    }

    const [properties, countResult] = await Promise.all([
        query(`SELECT * FROM properties ${where} ORDER BY created_at DESC LIMIT $1 OFFSET $2`, params),
        query(`SELECT COUNT(*) FROM properties ${countWhere}`, countParams),
    ]);

    const total = parseInt(countResult.rows[0].count, 10);
    return {
        rows: properties.rows,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
};

const findById = async (id) => {
    const result = await query('SELECT * FROM properties WHERE id = $1', [id]);
    return result.rows[0] || null;
};

const create = async ({ title, description, price, location, areaSqm, bedrooms, bathrooms, propertyType, images }) => {
    const result = await query(
        `INSERT INTO properties (title, description, price, location, area_sqm, bedrooms, bathrooms, property_type, images)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [title, description || '', parseFloat(price) || 0, location || null, parseFloat(areaSqm) || null, parseInt(bedrooms) || null, parseInt(bathrooms) || null, propertyType || 'residential', JSON.stringify(images)]
    );
    return result.rows[0];
};

const update = async (id, updates, values) => {
    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    const paramIndex = values.length;
    const result = await query(
        `UPDATE properties SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
        values
    );
    return result.rows[0] || null;
};

const softDelete = async (id) => {
    const result = await query(
        'UPDATE properties SET is_active = FALSE WHERE id = $1 RETURNING id',
        [id]
    );
    return result.rows[0] || null;
};

module.exports = { findAll, findById, create, update, softDelete };
