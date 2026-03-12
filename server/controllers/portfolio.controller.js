// ═══════════════════════════════════════════════
// Portfolio Controller — Previous Works CRUD
// ═══════════════════════════════════════════════
const { query } = require('../config/database');
const { AppError } = require('../middlewares/errorHandler');

function parseBool(val) {
    if (typeof val === 'boolean') return val;
    return val === '1' || val === 'true';
}

/**
 * GET /api/portfolio — Public listing (paginated)
 */
const getAll = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 12;
        const offset = (page - 1) * limit;

        const [items, countResult] = await Promise.all([
            query(
                `SELECT id, title, description, images, category, is_active, created_at
         FROM portfolio_items
         WHERE is_active = TRUE
         ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
                [limit, offset]
            ),
            query(`SELECT COUNT(*) FROM portfolio_items WHERE is_active = TRUE`),
        ]);

        res.json({
            success: true,
            data: {
                items: items.rows,
                pagination: {
                    page,
                    limit,
                    total: parseInt(countResult.rows[0].count),
                    totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit),
                },
            },
        });
    } catch (err) { next(err); }
};

/**
 * GET /api/portfolio/:id
 */
const getById = async (req, res, next) => {
    try {
        const result = await query('SELECT * FROM portfolio_items WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) throw new AppError('Portfolio item not found.', 404);
        res.json({ success: true, data: { item: result.rows[0] } });
    } catch (err) { next(err); }
};

/**
 * POST /api/portfolio (Admin)
 */
const create = async (req, res, next) => {
    try {
        const { title, description, category } = req.body;
        if (!title) throw new AppError('Title is required.', 400);

        let images = [];
        if (req.files && req.files.length > 0) {
            const { processAndUploadMultiple } = require('../services/upload.service');
            const uploaded = await processAndUploadMultiple(req.files, 'portfolio');
            images = uploaded.map(u => u.url);
        }

        const result = await query(
            `INSERT INTO portfolio_items (title, description, images, category)
       VALUES ($1, $2, $3, $4) RETURNING *`,
            [title, description || '', JSON.stringify(images), category || 'general']
        );

        res.status(201).json({ success: true, data: { item: result.rows[0] } });
    } catch (err) { next(err); }
};

/**
 * PUT /api/portfolio/:id (Admin)
 */
const update = async (req, res, next) => {
    try {
        const { title, description, category, is_active } = req.body;
        const updates = [];
        const values = [];
        let i = 1;

        if (title !== undefined)       { updates.push(`title = $${i++}`);       values.push(title); }
        if (description !== undefined) { updates.push(`description = $${i++}`); values.push(description); }
        if (category !== undefined)    { updates.push(`category = $${i++}`);    values.push(category); }
        if (is_active !== undefined)   { updates.push(`is_active = $${i++}`);   values.push(parseBool(is_active)); }

        if (req.files && req.files.length > 0) {
            const { processAndUploadMultiple } = require('../services/upload.service');
            const uploaded = await processAndUploadMultiple(req.files, 'portfolio');
            const urls = uploaded.map(u => u.url);
            updates.push(`images = $${i++}`);
            values.push(JSON.stringify(urls));
        }

        if (updates.length === 0) throw new AppError('No fields to update.', 400);

        updates.push('updated_at = CURRENT_TIMESTAMP');
        values.push(req.params.id);

        const result = await query(
            `UPDATE portfolio_items SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`,
            values
        );
        if (result.rows.length === 0) throw new AppError('Portfolio item not found.', 404);
        res.json({ success: true, data: { item: result.rows[0] } });
    } catch (err) { next(err); }
};

/**
 * DELETE /api/portfolio/:id — Soft delete
 */
const remove = async (req, res, next) => {
    try {
        const result = await query(
            'UPDATE portfolio_items SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING id',
            [req.params.id]
        );
        if (result.rows.length === 0) throw new AppError('Portfolio item not found.', 404);
        res.json({ success: true, message: 'Portfolio item deactivated.' });
    } catch (err) { next(err); }
};

module.exports = { getAll, getById, create, update, remove };
