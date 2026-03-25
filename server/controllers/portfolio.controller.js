// ═══════════════════════════════════════════════
// Portfolio Controller — Thin HTTP layer
// ═══════════════════════════════════════════════
const { AppError } = require('../middlewares/errorHandler');
const { asyncHandler, parseBool } = require('../utils/helpers');
const portfolioRepo = require('../repositories/portfolio.repository');

/**
 * GET /api/portfolio
 */
const getAll = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const isAdmin = req.user && ['super_admin', 'admin'].includes(req.user.role);

    const { rows, pagination } = await portfolioRepo.findAll({ page, limit, isAdmin });
    res.json({ success: true, data: { portfolio: rows, pagination } });
});

/**
 * GET /api/portfolio/:id
 */
const getById = asyncHandler(async (req, res) => {
    const item = await portfolioRepo.findById(req.params.id);
    if (!item) throw new AppError('Portfolio item not found.', 404);
    res.json({ success: true, data: { item } });
});

/**
 * POST /api/portfolio
 */
const create = asyncHandler(async (req, res) => {
    const { title, description, category, category_ar, title_ar, description_ar } = req.body;
    if (!title) throw new AppError('Title is required.', 400);

    let images = [];
    if (req.files && req.files.length > 0) {
        const { processAndUploadMultiple } = require('../services/upload.service');
        const uploaded = await processAndUploadMultiple(req.files, 'portfolio');
        images = uploaded.map(u => u.url);
    }

    const item = await portfolioRepo.create({ title, description, images, category, category_ar, title_ar, description_ar });
    res.status(201).json({ success: true, data: { item } });
});

/**
 * PUT /api/portfolio/:id
 */
const update = asyncHandler(async (req, res) => {
    const { title, description, category, category_ar, is_active, title_ar, description_ar } = req.body;
    const updates = []; const values = []; let i = 1;

    if (title !== undefined)          { updates.push(`title = $${i++}`);          values.push(title); }
    if (description !== undefined)    { updates.push(`description = $${i++}`);    values.push(description); }
    if (category !== undefined)       { updates.push(`category = $${i++}`);       values.push(category); }
    if (category_ar !== undefined)    { updates.push(`category_ar = $${i++}`);    values.push(category_ar); }
    if (is_active !== undefined)      { updates.push(`is_active = $${i++}`);      values.push(parseBool(is_active)); }
    if (title_ar !== undefined)       { updates.push(`title_ar = $${i++}`);       values.push(title_ar); }
    if (description_ar !== undefined) { updates.push(`description_ar = $${i++}`); values.push(description_ar); }

    if (req.files && req.files.length > 0) {
        const { processAndUploadMultiple } = require('../services/upload.service');
        const uploaded = await processAndUploadMultiple(req.files, 'portfolio');
        updates.push(`images = $${i++}`);
        values.push(JSON.stringify(uploaded.map(u => u.url)));
    }

    if (updates.length === 0) throw new AppError('No fields to update.', 400);

    const item = await portfolioRepo.update(req.params.id, updates, values);
    if (!item) throw new AppError('Portfolio item not found.', 404);
    res.json({ success: true, data: { item } });
});

/**
 * DELETE /api/portfolio/:id  (soft delete — deactivate)
 */
const remove = asyncHandler(async (req, res) => {
    const result = await portfolioRepo.softDelete(req.params.id);
    if (!result) throw new AppError('Portfolio item not found.', 404);
    res.json({ success: true, message: 'Portfolio item deactivated.' });
});

/**
 * DELETE /api/portfolio/:id/permanent  (hard delete — remove from DB)
 */
const permanentRemove = asyncHandler(async (req, res) => {
    const result = await portfolioRepo.hardDelete(req.params.id);
    if (!result) throw new AppError('Portfolio item not found.', 404);
    res.json({ success: true, message: 'Portfolio item permanently deleted.' });
});

module.exports = { getAll, getById, create, update, remove, permanentRemove };
