// ═══════════════════════════════════════════════
// Service Controller — Thin HTTP layer
// ═══════════════════════════════════════════════
const { AppError } = require('../middlewares/errorHandler');
const { asyncHandler } = require('../utils/helpers');
const { parseBool } = require('../utils/helpers');
const serviceRepo = require('../repositories/service.repository');

/**
 * GET /api/services
 */
const getAll = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const category = req.query.category;

    const { rows, pagination } = await serviceRepo.findAll({ page, limit, category });
    res.json({ success: true, data: { services: rows, pagination } });
});

/**
 * GET /api/services/:id
 */
const getById = asyncHandler(async (req, res) => {
    const service = await serviceRepo.findById(req.params.id);
    if (!service) throw new AppError('Service not found.', 404);
    res.json({ success: true, data: { service } });
});

/**
 * POST /api/services
 */
const create = asyncHandler(async (req, res) => {
    const { title, description, price, category, title_ar, description_ar, category_ar } = req.body;
    let images = [];

    if (req.files && req.files.length > 0) {
        const { processAndUploadMultiple } = require('../services/upload.service');
        const uploaded = await processAndUploadMultiple(req.files, 'services');
        images = uploaded.map(u => u.url);
    }

    const service = await serviceRepo.create({ title, description, price, images, category, title_ar, description_ar, category_ar });
    res.status(201).json({ success: true, data: { service } });
});

/**
 * PUT /api/services/:id
 */
const update = asyncHandler(async (req, res) => {
    const { title, description, price, category, is_active, is_featured, title_ar, description_ar, category_ar } = req.body;
    const updates = [];
    const values = [];
    let i = 1;

    if (title !== undefined)          { updates.push(`title = $${i++}`);          values.push(title); }
    if (description !== undefined)    { updates.push(`description = $${i++}`);    values.push(description); }
    if (price !== undefined)          { updates.push(`price = $${i++}`);          values.push(parseFloat(price)); }
    if (category !== undefined)       { updates.push(`category = $${i++}`);       values.push(category); }
    if (is_active !== undefined)      { updates.push(`is_active = $${i++}`);      values.push(parseBool(is_active)); }
    if (is_featured !== undefined)    { updates.push(`is_featured = $${i++}`);    values.push(parseBool(is_featured)); }
    if (title_ar !== undefined)       { updates.push(`title_ar = $${i++}`);       values.push(title_ar); }
    if (description_ar !== undefined) { updates.push(`description_ar = $${i++}`); values.push(description_ar); }
    if (category_ar !== undefined)    { updates.push(`category_ar = $${i++}`);    values.push(category_ar); }

    if (req.files && req.files.length > 0) {
        const { processAndUploadMultiple } = require('../services/upload.service');
        const uploaded = await processAndUploadMultiple(req.files, 'services');
        updates.push(`images = $${i++}`);
        values.push(JSON.stringify(uploaded.map(u => u.url)));
    }

    if (updates.length === 0) throw new AppError('No fields to update.', 400);

    const service = await serviceRepo.update(req.params.id, updates, values);
    if (!service) throw new AppError('Service not found.', 404);
    res.json({ success: true, data: { service } });
});

/**
 * DELETE /api/services/:id
 */
const remove = asyncHandler(async (req, res) => {
    const result = await serviceRepo.softDelete(req.params.id);
    if (!result) throw new AppError('Service not found.', 404);
    res.json({ success: true, message: 'Service deactivated.' });
});

module.exports = { getAll, getById, create, update, remove };
