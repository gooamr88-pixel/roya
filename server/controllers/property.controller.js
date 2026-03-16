// ═══════════════════════════════════════════════
// Property Controller — Thin HTTP layer
// ═══════════════════════════════════════════════
const { AppError } = require('../middlewares/errorHandler');
const { asyncHandler, parseBool } = require('../utils/helpers');
const propertyRepo = require('../repositories/property.repository');

/**
 * GET /api/properties
 */
const getAll = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const type = req.query.type;

    const { rows, pagination } = await propertyRepo.findAll({ page, limit, type });
    res.json({ success: true, data: { properties: rows, pagination } });
});

/**
 * GET /api/properties/:id
 */
const getById = asyncHandler(async (req, res) => {
    const property = await propertyRepo.findById(req.params.id);
    if (!property) throw new AppError('Property not found.', 404);
    res.json({ success: true, data: { property } });
});

/**
 * POST /api/properties
 */
const create = asyncHandler(async (req, res) => {
    const { title, description, price, location, area_sqm, bedrooms, bathrooms, property_type } = req.body;
    let images = [];
    if (req.files && req.files.length > 0) {
        const { processAndUploadMultiple } = require('../services/upload.service');
        const uploaded = await processAndUploadMultiple(req.files, 'properties');
        images = uploaded.map(u => u.url);
    }
    const property = await propertyRepo.create({
        title, description, price, location,
        areaSqm: area_sqm, bedrooms, bathrooms, propertyType: property_type, images,
    });
    res.status(201).json({ success: true, data: { property } });
});

/**
 * PUT /api/properties/:id
 */
const update = asyncHandler(async (req, res) => {
    const stringFields = ['title', 'description', 'location', 'property_type'];
    const numericFields = ['price', 'area_sqm', 'bedrooms', 'bathrooms'];
    const boolFields = ['is_active', 'is_featured'];

    const updates = []; const values = []; let i = 1;

    for (const f of stringFields) {
        if (req.body[f] !== undefined) { updates.push(`${f} = $${i++}`); values.push(req.body[f]); }
    }
    for (const f of numericFields) {
        if (req.body[f] !== undefined) { updates.push(`${f} = $${i++}`); values.push(parseFloat(req.body[f]) || null); }
    }
    for (const f of boolFields) {
        if (req.body[f] !== undefined) { updates.push(`${f} = $${i++}`); values.push(parseBool(req.body[f])); }
    }

    if (req.files && req.files.length > 0) {
        const { processAndUploadMultiple } = require('../services/upload.service');
        const uploaded = await processAndUploadMultiple(req.files, 'properties');
        updates.push(`images = $${i++}`);
        values.push(JSON.stringify(uploaded.map(u => u.url)));
    }

    if (updates.length === 0) throw new AppError('No fields to update.', 400);

    const property = await propertyRepo.update(req.params.id, updates, values);
    if (!property) throw new AppError('Property not found.', 404);
    res.json({ success: true, data: { property } });
});

/**
 * DELETE /api/properties/:id
 */
const remove = asyncHandler(async (req, res) => {
    const result = await propertyRepo.softDelete(req.params.id);
    if (!result) throw new AppError('Property not found.', 404);
    res.json({ success: true, message: 'Property deactivated.' });
});

module.exports = { getAll, getById, create, update, remove };
