// ═══════════════════════════════════════════════
// Property Controller
// ═══════════════════════════════════════════════
const { query } = require('../config/database');
const { AppError } = require('../middlewares/errorHandler');

const getAll = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 12;
        const offset = (page - 1) * limit;
        const type = req.query.type;
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

        res.json({
            success: true,
            data: {
                properties: properties.rows,
                pagination: { page, limit, total: parseInt(countResult.rows[0].count), totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit) },
            },
        });
    } catch (err) { next(err); }
};

const getById = async (req, res, next) => {
    try {
        const result = await query('SELECT * FROM properties WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) throw new AppError('Property not found.', 404);
        res.json({ success: true, data: { property: result.rows[0] } });
    } catch (err) { next(err); }
};

const create = async (req, res, next) => {
    try {
        const { title, description, price, location, area_sqm, bedrooms, bathrooms, property_type } = req.body;
        let images = [];
        if (req.files && req.files.length > 0) {
            const { processAndUploadMultiple } = require('../services/upload.service');
            const uploaded = await processAndUploadMultiple(req.files, 'properties');
            images = uploaded.map(u => u.url);
        }
        const result = await query(
            `INSERT INTO properties (title, description, price, location, area_sqm, bedrooms, bathrooms, property_type, images)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
            [title, description || '', parseFloat(price) || 0, location || null, parseFloat(area_sqm) || null, parseInt(bedrooms) || null, parseInt(bathrooms) || null, property_type || 'residential', JSON.stringify(images)]
        );
        res.status(201).json({ success: true, data: { property: result.rows[0] } });
    } catch (err) { next(err); }
};

const update = async (req, res, next) => {
    try {
        const fields = ['title', 'description', 'price', 'location', 'area_sqm', 'bedrooms', 'bathrooms', 'property_type', 'is_active'];
        const updates = []; const values = []; let i = 1;
        for (const f of fields) {
            if (req.body[f] !== undefined) { updates.push(`${f} = $${i++}`); values.push(req.body[f]); }
        }
        if (req.files && req.files.length > 0) {
            const { processAndUploadMultiple } = require('../services/upload.service');
            const uploaded = await processAndUploadMultiple(req.files, 'properties');
            updates.push(`images = $${i++}`); values.push(JSON.stringify(uploaded.map(u => u.url)));
        }
        if (updates.length === 0) throw new AppError('No fields to update.', 400);
        updates.push('updated_at = CURRENT_TIMESTAMP');
        values.push(req.params.id);
        const result = await query(`UPDATE properties SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`, values);
        if (result.rows.length === 0) throw new AppError('Property not found.', 404);
        res.json({ success: true, data: { property: result.rows[0] } });
    } catch (err) { next(err); }
};

const remove = async (req, res, next) => {
    try {
        const result = await query('UPDATE properties SET is_active = FALSE WHERE id = $1 RETURNING id', [req.params.id]);
        if (result.rows.length === 0) throw new AppError('Property not found.', 404);
        res.json({ success: true, message: 'Property deactivated.' });
    } catch (err) { next(err); }
};

module.exports = { getAll, getById, create, update, remove };
