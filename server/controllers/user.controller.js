// ═══════════════════════════════════════════════
// User Controller — Thin HTTP layer
// ═══════════════════════════════════════════════
const bcrypt = require('bcryptjs');
const { AppError } = require('../middlewares/errorHandler');
const { asyncHandler } = require('../utils/helpers');
const userRepo = require('../repositories/user.repository');

/**
 * GET /api/users/profile
 */
const getProfile = asyncHandler(async (req, res) => {
    const user = await userRepo.getProfile(req.user.id);
    if (!user) throw new AppError('User not found.', 404);
    res.json({ success: true, data: { user } });
});

/**
 * PUT /api/users/profile
 */
const updateProfile = asyncHandler(async (req, res) => {
    const { name, phone } = req.body;
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (name)  { updates.push(`name = $${paramIndex++}`);  values.push(name); }
    if (phone) { updates.push(`phone = $${paramIndex++}`); values.push(phone); }

    if (updates.length === 0) throw new AppError('No fields to update.', 400);

    const user = await userRepo.updateProfile(req.user.id, updates, values);
    res.json({ success: true, data: { user } });
});

/**
 * PUT /api/users/password
 */
const changePassword = asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        throw new AppError('Both current and new passwords are required.', 400, 'VALIDATION_ERROR');
    }
    if (newPassword.length < 8) {
        throw new AppError('New password must be at least 8 characters.', 400, 'VALIDATION_ERROR');
    }

    const hash = await userRepo.getPasswordHash(req.user.id);
    if (!hash) throw new AppError('User not found.', 404);

    const isMatch = await bcrypt.compare(currentPassword, hash);
    if (!isMatch) {
        throw new AppError('Current password is incorrect.', 401, 'INVALID_CREDENTIALS');
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    await userRepo.updatePasswordHash(req.user.id, newHash);

    res.json({ success: true, message: 'Password changed successfully.' });
});

/**
 * PUT /api/users/avatar
 */
const updateAvatar = asyncHandler(async (req, res) => {
    if (!req.file) throw new AppError('No file uploaded.', 400);

    const { processAndUpload } = require('../services/upload.service');
    const result = await processAndUpload(req.file, 'avatars');

    await userRepo.updateAvatar(req.user.id, result.url);
    res.json({ success: true, data: { avatar_url: result.url } });
});

module.exports = { getProfile, updateProfile, changePassword, updateAvatar };
