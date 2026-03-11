// ═══════════════════════════════════════════════
// Exhibition Controller
// ═══════════════════════════════════════════════
const { query } = require('../config/database');
const { AppError } = require('../middlewares/errorHandler');

/**
 * parseBool — safely coerce FormData / JSON boolean values.
 * FormData sends booleans as strings ('true', 'false', '1', '0').
 * JSON PUT sends real booleans. This handles both.
 */
function parseBool(val) {
    if (typeof val === 'boolean') return val;
    return val === '1' || val === 'true';
}


const getAll = async (req, res, next) => {
    try {
        const page   = parseInt(req.query.page)  || 1;
        const limit  = parseInt(req.query.limit) || 12;
        const offset = (page - 1) * limit;
        // B4 Fix: if showAll=true (admin panel requests), return all records
        // regardless of is_active status so admins can manage inactive items.
        const showAll  = req.query.showAll === 'true';
        const whereClause     = showAll ? '' : 'WHERE is_active = TRUE';
        const countWhere      = showAll ? '' : 'WHERE is_active = TRUE';

        const [exhibitions, countResult] = await Promise.all([
            query(
                `SELECT * FROM exhibitions ${whereClause} ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
                [limit, offset]
            ),
            query(`SELECT COUNT(*) FROM exhibitions ${countWhere}`),
        ]);

        res.json({
            success: true,
            data: {
                exhibitions: exhibitions.rows,
                pagination: { page, limit, total: parseInt(countResult.rows[0].count), totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit) },
            },
        });
    } catch (err) { next(err); }
};

const getById = async (req, res, next) => {
    try {
        const result = await query('SELECT * FROM exhibitions WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) throw new AppError('Exhibition not found.', 404);
        res.json({ success: true, data: { exhibition: result.rows[0] } });
    } catch (err) { next(err); }
};

const create = async (req, res, next) => {
    try {
        const { title, description, location, start_date, end_date } = req.body;
        let images = [];
        if (req.files && req.files.length > 0) {
            const { processAndUploadMultiple } = require('../services/upload.service');
            const uploaded = await processAndUploadMultiple(req.files, 'exhibitions');
            images = uploaded.map(u => u.url);
        }
        const result = await query(
            `INSERT INTO exhibitions (title, description, location, start_date, end_date, images)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [title, description || '', location || null, start_date || null, end_date || null, JSON.stringify(images)]
        );
        res.status(201).json({ success: true, data: { exhibition: result.rows[0] } });
    } catch (err) { next(err); }
};

const update = async (req, res, next) => {
    try {
        const { title, description, location, start_date, end_date, is_active } = req.body;
        const updates = []; const values = []; let i = 1;
        if (title       !== undefined) { updates.push(`title = $${i++}`);       values.push(title); }
        if (description !== undefined) { updates.push(`description = $${i++}`); values.push(description); }
        if (location    !== undefined) { updates.push(`location = $${i++}`);    values.push(location); }
        if (start_date  !== undefined) { updates.push(`start_date = $${i++}`);  values.push(start_date || null); }
        if (end_date    !== undefined) { updates.push(`end_date = $${i++}`);    values.push(end_date || null); }
        // B2/B7 Fix: coerce string '1'/'0'/'true'/'false' or real boolean
        if (is_active   !== undefined) { updates.push(`is_active = $${i++}`);   values.push(parseBool(is_active)); }
        if (req.files && req.files.length > 0) {
            const { processAndUploadMultiple } = require('../services/upload.service');
            const uploaded = await processAndUploadMultiple(req.files, 'exhibitions');
            updates.push(`images = $${i++}`); values.push(JSON.stringify(uploaded.map(u => u.url)));
        }
        if (updates.length === 0) throw new AppError('No fields to update.', 400);
        updates.push('updated_at = CURRENT_TIMESTAMP');
        values.push(req.params.id);
        const result = await query(`UPDATE exhibitions SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`, values);
        if (result.rows.length === 0) throw new AppError('Exhibition not found.', 404);
        res.json({ success: true, data: { exhibition: result.rows[0] } });
    } catch (err) { next(err); }
};

const remove = async (req, res, next) => {
    try {
        const result = await query('UPDATE exhibitions SET is_active = FALSE WHERE id = $1 RETURNING id', [req.params.id]);
        if (result.rows.length === 0) throw new AppError('Exhibition not found.', 404);
        res.json({ success: true, message: 'Exhibition deactivated.' });
    } catch (err) { next(err); }
};

module.exports = { getAll, getById, create, update, remove };
