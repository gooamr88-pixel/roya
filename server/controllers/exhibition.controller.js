// ═══════════════════════════════════════════════
// Exhibition Controller — Thin HTTP layer
// ═══════════════════════════════════════════════
const { AppError } = require('../middlewares/errorHandler');
const { asyncHandler, parseBool } = require('../utils/helpers');
const exhibitionRepo = require('../repositories/exhibition.repository');

/**
 * GET /api/exhibitions
 */
const getAll = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const showAll = req.query.showAll === 'true';

    const { rows, pagination } = await exhibitionRepo.findAll({ page, limit, showAll });
    res.json({ success: true, data: { exhibitions: rows, pagination } });
});

/**
 * GET /api/exhibitions/:id
 */
const getById = asyncHandler(async (req, res) => {
    const exhibition = await exhibitionRepo.findById(req.params.id);
    if (!exhibition) throw new AppError('Exhibition not found.', 404);
    res.json({ success: true, data: { exhibition } });
});

/**
 * POST /api/exhibitions
 */
const create = asyncHandler(async (req, res) => {
    const { title, description, location, start_date, end_date } = req.body;
    let images = [];
    if (req.files && req.files.length > 0) {
        const { processAndUploadMultiple } = require('../services/upload.service');
        const uploaded = await processAndUploadMultiple(req.files, 'exhibitions');
        images = uploaded.map(u => u.url);
    }
    const exhibition = await exhibitionRepo.create({
        title, description, location, startDate: start_date, endDate: end_date, images,
    });
    res.status(201).json({ success: true, data: { exhibition } });
});

/**
 * PUT /api/exhibitions/:id
 */
const update = asyncHandler(async (req, res) => {
    const { title, description, location, start_date, end_date, is_active } = req.body;
    const updates = []; const values = []; let i = 1;

    if (title       !== undefined) { updates.push(`title = $${i++}`);       values.push(title); }
    if (description !== undefined) { updates.push(`description = $${i++}`); values.push(description); }
    if (location    !== undefined) { updates.push(`location = $${i++}`);    values.push(location); }
    if (start_date  !== undefined) { updates.push(`start_date = $${i++}`);  values.push(start_date || null); }
    if (end_date    !== undefined) { updates.push(`end_date = $${i++}`);    values.push(end_date || null); }
    if (is_active   !== undefined) { updates.push(`is_active = $${i++}`);   values.push(parseBool(is_active)); }

    if (req.files && req.files.length > 0) {
        const { processAndUploadMultiple } = require('../services/upload.service');
        const uploaded = await processAndUploadMultiple(req.files, 'exhibitions');
        updates.push(`images = $${i++}`);
        values.push(JSON.stringify(uploaded.map(u => u.url)));
    }

    if (updates.length === 0) throw new AppError('No fields to update.', 400);

    const exhibition = await exhibitionRepo.update(req.params.id, updates, values);
    if (!exhibition) throw new AppError('Exhibition not found.', 404);
    res.json({ success: true, data: { exhibition } });
});

/**
 * DELETE /api/exhibitions/:id
 */
const remove = asyncHandler(async (req, res) => {
    const result = await exhibitionRepo.hardDelete(req.params.id);
    if (!result) throw new AppError('Exhibition not found.', 404);
    res.json({ success: true, message: 'Exhibition deleted.' });
});

module.exports = { getAll, getById, create, update, remove };
