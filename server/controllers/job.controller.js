// ═══════════════════════════════════════════════
// Job Controller — Jobs Board CRUD
// ═══════════════════════════════════════════════
const { query } = require('../config/database');
const { AppError } = require('../middlewares/errorHandler');

function parseBool(val) {
    if (typeof val === 'boolean') return val;
    return val === '1' || val === 'true';
}

/**
 * GET /api/jobs — Public listing (paginated)
 */
const getAll = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 12;
        const offset = (page - 1) * limit;
        const type = req.query.type;

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

        res.json({
            success: true,
            data: {
                jobs: jobs.rows,
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
 * GET /api/jobs/:id
 */
const getById = async (req, res, next) => {
    try {
        const result = await query('SELECT * FROM jobs WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) throw new AppError('Job not found.', 404);
        res.json({ success: true, data: { job: result.rows[0] } });
    } catch (err) { next(err); }
};

/**
 * POST /api/jobs (Admin)
 */
const create = async (req, res, next) => {
    try {
        const { title, description, company, location, type, salary_range } = req.body;
        if (!title) throw new AppError('Title is required.', 400);

        const result = await query(
            `INSERT INTO jobs (title, description, company, location, type, salary_range)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [title, description || '', company || '', location || '', type || 'full_time', salary_range || '']
        );

        res.status(201).json({ success: true, data: { job: result.rows[0] } });
    } catch (err) { next(err); }
};

/**
 * PUT /api/jobs/:id (Admin)
 */
const update = async (req, res, next) => {
    try {
        const { title, description, company, location, type, salary_range, is_active } = req.body;
        const updates = [];
        const values = [];
        let i = 1;

        if (title !== undefined)        { updates.push(`title = $${i++}`);        values.push(title); }
        if (description !== undefined)  { updates.push(`description = $${i++}`);  values.push(description); }
        if (company !== undefined)      { updates.push(`company = $${i++}`);      values.push(company); }
        if (location !== undefined)     { updates.push(`location = $${i++}`);     values.push(location); }
        if (type !== undefined)         { updates.push(`type = $${i++}`);         values.push(type); }
        if (salary_range !== undefined) { updates.push(`salary_range = $${i++}`); values.push(salary_range); }
        if (is_active !== undefined)    { updates.push(`is_active = $${i++}`);    values.push(parseBool(is_active)); }

        if (updates.length === 0) throw new AppError('No fields to update.', 400);

        updates.push('updated_at = CURRENT_TIMESTAMP');
        values.push(req.params.id);

        const result = await query(
            `UPDATE jobs SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`,
            values
        );
        if (result.rows.length === 0) throw new AppError('Job not found.', 404);
        res.json({ success: true, data: { job: result.rows[0] } });
    } catch (err) { next(err); }
};

/**
 * DELETE /api/jobs/:id — Soft delete
 */
const remove = async (req, res, next) => {
    try {
        const result = await query(
            'UPDATE jobs SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING id',
            [req.params.id]
        );
        if (result.rows.length === 0) throw new AppError('Job not found.', 404);
        res.json({ success: true, message: 'Job deactivated.' });
    } catch (err) { next(err); }
};

module.exports = { getAll, getById, create, update, remove };
