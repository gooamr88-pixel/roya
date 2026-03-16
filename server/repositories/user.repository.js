// ═══════════════════════════════════════════════
// User Repository — All user-related SQL queries
// ═══════════════════════════════════════════════
const { query } = require('../config/database');

const findByEmail = async (email) => {
    const result = await query('SELECT * FROM users WHERE email = $1', [email]);
    return result.rows[0] || null;
};

const findById = async (id) => {
    const result = await query(
        `SELECT u.id, u.name, u.email, u.phone, u.avatar_url, u.is_verified,
                u.is_active, u.password_hash, u.failed_login_attempts, u.locked_until,
                u.ban_type, u.ban_expires_at, u.last_login, u.created_at,
                u.refresh_token_hash, u.otp_code, u.otp_expires_at,
                r.name as role, r.id as role_id, r.permissions_json
         FROM users u
         LEFT JOIN roles r ON u.role_id = r.id
         WHERE u.id = $1`,
        [id]
    );
    return result.rows[0] || null;
};

const findByEmailWithRole = async (email) => {
    const result = await query(
        `SELECT u.id, u.name, u.email, u.password_hash, u.is_verified, u.is_active,
                u.failed_login_attempts, u.locked_until, u.ban_type, u.ban_expires_at,
                u.phone, r.name as role
         FROM users u
         LEFT JOIN roles r ON u.role_id = r.id
         WHERE u.email = $1`,
        [email]
    );
    return result.rows[0] || null;
};

const create = async ({ name, email, phone, passwordHash, roleId, otp, otpExpires }) => {
    const result = await query(
        `INSERT INTO users (name, email, phone, password_hash, role_id, otp_code, otp_expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, name, email`,
        [name, email, phone || null, passwordHash, roleId, otp, otpExpires]
    );
    return result.rows[0];
};

const getDefaultRoleId = async () => {
    const result = await query("SELECT id FROM roles WHERE name = 'client'");
    return result.rows[0]?.id || null;
};

const updateOtp = async (id, otp, otpExpires) => {
    await query(
        'UPDATE users SET otp_code = $1, otp_expires_at = $2 WHERE id = $3',
        [otp, otpExpires, id]
    );
};

const markVerified = async (id) => {
    await query(
        `UPDATE users SET is_verified = TRUE, otp_code = NULL, otp_expires_at = NULL WHERE id = $1`,
        [id]
    );
};

const updateFailedAttempts = async (id, attempts, lockedUntil) => {
    await query(
        `UPDATE users SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3`,
        [attempts, lockedUntil || null, id]
    );
};

const resetLoginState = async (id) => {
    await query(
        `UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login = CURRENT_TIMESTAMP WHERE id = $1`,
        [id]
    );
};

const clearBan = async (id) => {
    await query(
        `UPDATE users SET is_active = TRUE, ban_type = NULL, ban_expires_at = NULL WHERE id = $1`,
        [id]
    );
};

const updateResetToken = async (id, resetOTP, resetExpires) => {
    await query(
        'UPDATE users SET reset_token = $1, reset_token_expires_at = $2 WHERE id = $3',
        [resetOTP, resetExpires, id]
    );
};

const findByResetToken = async (email, otp) => {
    const result = await query(
        'SELECT id FROM users WHERE email = $1 AND reset_token = $2 AND reset_token_expires_at > CURRENT_TIMESTAMP',
        [email, otp]
    );
    return result.rows[0] || null;
};

const updatePassword = async (id, passwordHash) => {
    await query(
        `UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expires_at = NULL WHERE id = $2`,
        [passwordHash, id]
    );
};

const updateProfile = async (id, updates, values) => {
    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    const paramIndex = values.length;
    const result = await query(
        `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING id, name, email, phone, avatar_url`,
        values
    );
    return result.rows[0];
};

const updateAvatar = async (id, avatarUrl) => {
    await query(
        'UPDATE users SET avatar_url = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [avatarUrl, id]
    );
};

const getPasswordHash = async (id) => {
    const result = await query('SELECT password_hash FROM users WHERE id = $1', [id]);
    return result.rows[0]?.password_hash || null;
};

const updatePasswordHash = async (id, hash) => {
    await query(
        'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [hash, id]
    );
};

const getProfile = async (id) => {
    const result = await query(
        `SELECT u.id, u.name, u.email, u.phone, u.avatar_url, u.is_verified,
                u.last_login, u.created_at, r.name as role
         FROM users u
         LEFT JOIN roles r ON u.role_id = r.id
         WHERE u.id = $1`,
        [id]
    );
    return result.rows[0] || null;
};

const getRefreshTokenHash = async (id) => {
    const result = await query(
        'SELECT refresh_token_hash FROM users WHERE id = $1',
        [id]
    );
    return result.rows[0]?.refresh_token_hash || null;
};

const getUserWithRole = async (id) => {
    const result = await query(
        `SELECT u.id, r.name as role FROM users u
         LEFT JOIN roles r ON u.role_id = r.id
         WHERE u.id = $1 AND u.is_active = TRUE`,
        [id]
    );
    return result.rows[0] || null;
};

module.exports = {
    findByEmail,
    findById,
    findByEmailWithRole,
    create,
    getDefaultRoleId,
    updateOtp,
    markVerified,
    updateFailedAttempts,
    resetLoginState,
    clearBan,
    updateResetToken,
    findByResetToken,
    updatePassword,
    updateProfile,
    updateAvatar,
    getPasswordHash,
    updatePasswordHash,
    getProfile,
    getRefreshTokenHash,
    getUserWithRole,
};
