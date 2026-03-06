// ═══════════════════════════════════════════════
// User Controller
// ═══════════════════════════════════════════════
const bcrypt = require('bcryptjs');
const { query } = require('../config/database');
const { AppError } = require('../middlewares/errorHandler');

/**
 * GET /api/users/profile
 */
const getProfile = async (req, res, next) => {
    try {
        const result = await query(
            `SELECT u.id, u.name, u.email, u.phone, u.avatar_url, u.is_verified,
              u.last_login, u.created_at, r.name as role
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       WHERE u.id = $1`,
            [req.user.id]
        );

        if (result.rows.length === 0) {
            throw new AppError('User not found.', 404);
        }

        res.json({ success: true, data: { user: result.rows[0] } });
    } catch (err) {
        next(err);
    }
};

/**
 * PUT /api/users/profile
 */
const updateProfile = async (req, res, next) => {
    try {
        const { name, phone } = req.body;
        const updates = [];
        const values = [];
        let paramIndex = 1;

        if (name) {
            updates.push(`name = $${paramIndex++}`);
            values.push(name);
        }
        if (phone) {
            updates.push(`phone = $${paramIndex++}`);
            values.push(phone);
        }

        if (updates.length === 0) {
            throw new AppError('No fields to update.', 400);
        }

        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        values.push(req.user.id);

        const result = await query(
            `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING id, name, email, phone, avatar_url`,
            values
        );

        res.json({ success: true, data: { user: result.rows[0] } });
    } catch (err) {
        next(err);
    }
};

/**
 * PUT /api/users/password — Change password (requires current password)
 */
const changePassword = async (req, res, next) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            throw new AppError('Both current and new passwords are required.', 400, 'VALIDATION_ERROR');
        }
        if (newPassword.length < 8) {
            throw new AppError('New password must be at least 8 characters.', 400, 'VALIDATION_ERROR');
        }

        const result = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
        if (result.rows.length === 0) throw new AppError('User not found.', 404);

        const isMatch = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
        if (!isMatch) {
            throw new AppError('Current password is incorrect.', 401, 'INVALID_CREDENTIALS');
        }

        const newHash = await bcrypt.hash(newPassword, 12);
        await query(
            'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [newHash, req.user.id]
        );

        res.json({ success: true, message: 'Password changed successfully.' });
    } catch (err) {
        next(err);
    }
};

/**
 * PUT /api/users/avatar
 */
const updateAvatar = async (req, res, next) => {
    try {
        if (!req.file) {
            throw new AppError('No file uploaded.', 400);
        }

        const { processAndUpload } = require('../services/upload.service');
        const result = await processAndUpload(req.file, 'avatars');

        await query(
            'UPDATE users SET avatar_url = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [result.url, req.user.id]
        );

        res.json({ success: true, data: { avatar_url: result.url } });
    } catch (err) {
        next(err);
    }
};

module.exports = { getProfile, updateProfile, changePassword, updateAvatar };
