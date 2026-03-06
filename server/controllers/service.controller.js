// ═══════════════════════════════════════════════
// Service Controller (Business Services CRUD)
// ═══════════════════════════════════════════════
const { query } = require('../config/database');
const { AppError } = require('../middlewares/errorHandler');

/**
 * GET /api/services — Public listing (paginated)
 */
const getAll = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 12;
        const offset = (page - 1) * limit;
        const category = req.query.category;

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
                `SELECT id, title, description, price, images, category, created_at
         FROM services ${whereClause}
         ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
                params
            ),
            query(`SELECT COUNT(*) FROM services ${countWhere}`, countParams),
        ]);

        res.json({
            success: true,
            data: {
                services: services.rows,
                pagination: {
                    page,
                    limit,
                    total: parseInt(countResult.rows[0].count),
                    totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit),
                },
            },
        });
    } catch (err) {
        next(err);
    }
};

/**
 * GET /api/services/:id
 */
const getById = async (req, res, next) => {
    try {
        const result = await query('SELECT * FROM services WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            throw new AppError('Service not found.', 404);
        }
        res.json({ success: true, data: { service: result.rows[0] } });
    } catch (err) {
        next(err);
    }
};

/**
 * POST /api/services (Admin)
 */
const create = async (req, res, next) => {
    try {
        const { title, description, price, category } = req.body;
        let images = [];

        if (req.files && req.files.length > 0) {
            const { processAndUploadMultiple } = require('../services/upload.service');
            const uploaded = await processAndUploadMultiple(req.files, 'services');
            images = uploaded.map(u => u.url);
        }

        const result = await query(
            `INSERT INTO services (title, description, price, images, category)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [title, description || '', parseFloat(price) || 0, JSON.stringify(images), category || 'general']
        );

        res.status(201).json({ success: true, data: { service: result.rows[0] } });
    } catch (err) {
        next(err);
    }
};

/**
 * PUT /api/services/:id (Admin)
 */
const update = async (req, res, next) => {
    try {
        const { title, description, price, category, is_active } = req.body;
        const updates = [];
        const values = [];
        let i = 1;

        if (title !== undefined) { updates.push(`title = $${i++}`); values.push(title); }
        if (description !== undefined) { updates.push(`description = $${i++}`); values.push(description); }
        if (price !== undefined) { updates.push(`price = $${i++}`); values.push(parseFloat(price)); }
        if (category !== undefined) { updates.push(`category = $${i++}`); values.push(category); }
        if (is_active !== undefined) { updates.push(`is_active = $${i++}`); values.push(is_active); }

        // Handle new images
        if (req.files && req.files.length > 0) {
            const { processAndUploadMultiple } = require('../services/upload.service');
            const uploaded = await processAndUploadMultiple(req.files, 'services');
            const urls = uploaded.map(u => u.url);
            updates.push(`images = $${i++}`);
            values.push(JSON.stringify(urls));
        }

        if (updates.length === 0) {
            throw new AppError('No fields to update.', 400);
        }

        updates.push('updated_at = CURRENT_TIMESTAMP');
        values.push(req.params.id);

        const result = await query(
            `UPDATE services SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`,
            values
        );

        if (result.rows.length === 0) {
            throw new AppError('Service not found.', 404);
        }

        res.json({ success: true, data: { service: result.rows[0] } });
    } catch (err) {
        next(err);
    }
};

/**
 * DELETE /api/services/:id (Soft delete)
 */
const remove = async (req, res, next) => {
    try {
        const result = await query(
            'UPDATE services SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING id',
            [req.params.id]
        );
        if (result.rows.length === 0) {
            throw new AppError('Service not found.', 404);
        }
        res.json({ success: true, message: 'Service deactivated.' });
    } catch (err) {
        next(err);
    }
};

module.exports = { getAll, getById, create, update, remove };
