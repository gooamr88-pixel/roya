// ═══════════════════════════════════════════════
// Job Controller — Thin HTTP layer
// ═══════════════════════════════════════════════
const { AppError } = require('../middlewares/errorHandler');
const { asyncHandler, parseBool } = require('../utils/helpers');
const jobRepo = require('../repositories/job.repository');

/**
 * GET /api/jobs
 */
const getAll = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const type = req.query.type;

    const { rows, pagination } = await jobRepo.findAll({ page, limit, type });
    res.json({ success: true, data: { jobs: rows, pagination } });
});

/**
 * GET /api/jobs/:id
 */
const getById = asyncHandler(async (req, res) => {
    const job = await jobRepo.findById(req.params.id);
    if (!job) throw new AppError('Job not found.', 404);
    res.json({ success: true, data: { job } });
});

/**
 * POST /api/jobs
 */
const create = asyncHandler(async (req, res) => {
    const { title, description, company, location, type, salary_range, currency } = req.body;
    if (!title) throw new AppError('Title is required.', 400);

    const job = await jobRepo.create({
        title, description, company, location, type, salaryRange: salary_range, currency,
    });
    res.status(201).json({ success: true, data: { job } });
});

/**
 * PUT /api/jobs/:id
 */
const update = asyncHandler(async (req, res) => {
    const { title, description, company, location, type, salary_range, currency, is_active } = req.body;
    const updates = []; const values = []; let i = 1;

    if (title !== undefined)        { updates.push(`title = $${i++}`);        values.push(title); }
    if (description !== undefined)  { updates.push(`description = $${i++}`);  values.push(description); }
    if (company !== undefined)      { updates.push(`company = $${i++}`);      values.push(company); }
    if (location !== undefined)     { updates.push(`location = $${i++}`);     values.push(location); }
    if (type !== undefined)         { updates.push(`type = $${i++}`);         values.push(type); }
    if (salary_range !== undefined) { updates.push(`salary_range = $${i++}`); values.push(salary_range); }
    if (currency !== undefined)     { updates.push(`currency = $${i++}`);     values.push(currency); }
    if (is_active !== undefined)    { updates.push(`is_active = $${i++}`);    values.push(parseBool(is_active)); }

    if (updates.length === 0) throw new AppError('No fields to update.', 400);

    const job = await jobRepo.update(req.params.id, updates, values);
    if (!job) throw new AppError('Job not found.', 404);
    res.json({ success: true, data: { job } });
});

/**
 * DELETE /api/jobs/:id
 */
const remove = asyncHandler(async (req, res) => {
    const result = await jobRepo.softDelete(req.params.id);
    if (!result) throw new AppError('Job not found.', 404);
    res.json({ success: true, message: 'Job deactivated.' });
});

module.exports = { getAll, getById, create, update, remove };
