// ═══════════════════════════════════════════════
// Auth Controller
// ═══════════════════════════════════════════════
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../config/database');
const config = require('../config');
const { AppError } = require('../middlewares/errorHandler');
const tokenService = require('../services/token.service');
const emailService = require('../services/email.service');
const notificationService = require('../services/notification.service');

/**
 * POST /api/auth/register
 */
const register = async (req, res, next) => {
    try {
        const { name, email, phone, password } = req.body;

        // Check if user exists
        const existing = await query(
            'SELECT id FROM users WHERE email = $1',
            [email]
        );
        if (existing.rows.length > 0) {
            throw new AppError('Email is already registered.', 409, 'EMAIL_EXISTS');
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 12);

        // Generate OTP
        const otp = tokenService.generateOTP();
        const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 min

        // Get client role (fail loudly if missing — misconfigured DB)
        const roleResult = await query("SELECT id FROM roles WHERE name = 'client'");
        if (roleResult.rows.length === 0) {
            throw new AppError('System configuration error: default role not found.', 500, 'CONFIG_ERROR');
        }
        const roleId = roleResult.rows[0].id;

        // Insert user
        const result = await query(
            `INSERT INTO users (name, email, phone, password_hash, role_id, otp_code, otp_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, name, email`,
            [name, email, phone || null, passwordHash, roleId, otp, otpExpires]
        );

        const user = result.rows[0];

        // Send OTP email (pass name so the template can greet the user)
        await emailService.sendOTP(user.email, user.name, otp);

        res.status(201).json({
            success: true,
            message: 'Registration successful. Please verify your email with the OTP sent.',
            data: { userId: user.id, email: user.email },
        });
    } catch (err) {
        next(err);
    }
};

/**
 * POST /api/auth/verify-otp
 */
const verifyOTP = async (req, res, next) => {
    try {
        const { email, otp } = req.body;

        const result = await query(
            'SELECT id, otp_code, otp_expires_at FROM users WHERE email = $1',
            [email]
        );

        if (result.rows.length === 0) {
            throw new AppError('User not found.', 404, 'USER_NOT_FOUND');
        }

        const user = result.rows[0];

        if (!user.otp_code || user.otp_code !== otp) {
            throw new AppError('Invalid OTP code.', 400, 'INVALID_OTP');
        }

        if (new Date() > new Date(user.otp_expires_at)) {
            throw new AppError('OTP has expired. Please request a new one.', 400, 'OTP_EXPIRED');
        }

        // Mark verified
        await query(
            `UPDATE users SET is_verified = TRUE, otp_code = NULL, otp_expires_at = NULL WHERE id = $1`,
            [user.id]
        );

        // Create welcome notification
        await notificationService.createNotification(
            user.id,
            'Welcome!',
            'Your email has been verified. Welcome to ROYA Platform!',
            'success'
        );

        res.json({
            success: true,
            message: 'Email verified successfully. You can now log in.',
        });
    } catch (err) {
        next(err);
    }
};

/**
 * POST /api/auth/resend-otp
 */
const resendOTP = async (req, res, next) => {
    try {
        const { email } = req.body;

        const result = await query(
            'SELECT id, name, is_verified FROM users WHERE email = $1',
            [email]
        );

        if (result.rows.length === 0) {
            throw new AppError('User not found.', 404, 'USER_NOT_FOUND');
        }

        if (result.rows[0].is_verified) {
            throw new AppError('Email is already verified.', 400, 'ALREADY_VERIFIED');
        }

        const otp = tokenService.generateOTP();
        const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

        await query(
            'UPDATE users SET otp_code = $1, otp_expires_at = $2 WHERE id = $3',
            [otp, otpExpires, result.rows[0].id]
        );

        await emailService.sendOTP(email, result.rows[0].name, otp);

        res.json({ success: true, message: 'New OTP sent to your email.' });
    } catch (err) {
        next(err);
    }
};

/**
 * POST /api/auth/login
 */
const login = async (req, res, next) => {
    try {
        const { email, password, rememberMe } = req.body;
        const ip = req.ip || req.connection.remoteAddress;
        const userAgent = req.headers['user-agent'] || '';

        const result = await query(
            `SELECT u.id, u.name, u.email, u.password_hash, u.is_verified, u.is_active,
              u.failed_login_attempts, u.locked_until, u.ban_type, u.ban_expires_at,
              r.name as role
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       WHERE u.email = $1`,
            [email]
        );

        if (result.rows.length === 0) {
            // Cannot log — no valid user_id for FK constraint
            throw new AppError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
        }

        const user = result.rows[0];

        // Check account lock
        if (user.locked_until && new Date() < new Date(user.locked_until)) {
            const minutesLeft = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
            throw new AppError(`Account locked. Try again in ${minutesLeft} minutes.`, 423, 'ACCOUNT_LOCKED');
        }

        // Check password
        const isMatch = await bcrypt.compare(password, user.password_hash);

        if (!isMatch) {
            const attempts = (user.failed_login_attempts || 0) + 1;
            const updates = { failed_login_attempts: attempts };

            // Lock after 5 failed attempts (30 min)
            if (attempts >= 5) {
                updates.locked_until = new Date(Date.now() + 30 * 60 * 1000);
            }

            await query(
                `UPDATE users SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3`,
                [updates.failed_login_attempts, updates.locked_until || null, user.id]
            );

            // Log failed login
            await query(
                'INSERT INTO login_logs (user_id, ip_address, user_agent, success) VALUES ($1, $2, $3, FALSE)',
                [user.id, ip, userAgent]
            );

            throw new AppError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
        }

        // ── Ban Check ──
        if (!user.is_active) {
            if (user.ban_type === 'permanent') {
                throw new AppError('Your account has been permanently banned. Contact support.', 403, 'ACCOUNT_BANNED');
            }
            if (user.ban_type === 'temporary' && user.ban_expires_at) {
                if (new Date() < new Date(user.ban_expires_at)) {
                    const expiresAt = new Date(user.ban_expires_at).toLocaleDateString();
                    throw new AppError(`Your account is temporarily suspended until ${expiresAt}.`, 403, 'ACCOUNT_BANNED_TEMP');
                } else {
                    // Temp ban expired — auto-unban
                    await query(`UPDATE users SET is_active = TRUE, ban_type = NULL, ban_expires_at = NULL WHERE id = $1`, [user.id]);
                }
            } else {
                throw new AppError('Account has been deactivated. Contact support.', 403, 'ACCOUNT_DEACTIVATED');
            }
        }

        if (!user.is_verified) {
            throw new AppError('Please verify your email before logging in.', 403, 'EMAIL_NOT_VERIFIED');
        }

        // Reset failed attempts
        await query(
            `UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login = CURRENT_TIMESTAMP WHERE id = $1`,
            [user.id]
        );

        // Generate tokens
        const accessToken = tokenService.generateAccessToken(user.id, user.role);
        const refreshToken = tokenService.generateRefreshToken(user.id);

        // Store refresh token hash
        await tokenService.storeRefreshToken(user.id, refreshToken);

        // Set cookies
        tokenService.setAuthCookies(res, accessToken, refreshToken, rememberMe);

        // Log successful login
        await query(
            'INSERT INTO login_logs (user_id, ip_address, user_agent, success) VALUES ($1, $2, $3, TRUE)',
            [user.id, ip, userAgent]
        );

        res.json({
            success: true,
            message: 'Login successful.',
            data: {
                user: { id: user.id, name: user.name, email: user.email, role: user.role },
            },
        });
    } catch (err) {
        next(err);
    }
};

/**
 * POST /api/auth/logout
 */
const logout = async (req, res, next) => {
    try {
        const token = req.cookies?.access_token;
        if (token) {
            try {
                const decoded = jwt.verify(token, config.jwt.accessSecret);
                await tokenService.invalidateRefreshToken(decoded.userId);

                // Log logout — use subquery since PostgreSQL doesn't support UPDATE...ORDER BY LIMIT
                await query(
                    `UPDATE login_logs SET logout_time = CURRENT_TIMESTAMP
           WHERE id = (
             SELECT id FROM login_logs
             WHERE user_id = $1 AND logout_time IS NULL
             ORDER BY login_time DESC LIMIT 1
           )`,
                    [decoded.userId]
                );
            } catch (e) {
                // Token might be expired, that's OK
            }
        }

        tokenService.clearAuthCookies(res);
        res.json({ success: true, message: 'Logged out successfully.' });
    } catch (err) {
        next(err);
    }
};

/**
 * POST /api/auth/refresh
 */
const refresh = async (req, res, next) => {
    try {
        const refreshTokenCookie = req.cookies?.refresh_token;

        if (!refreshTokenCookie) {
            throw new AppError('Refresh token required.', 401, 'NO_REFRESH_TOKEN');
        }

        // Verify refresh token
        const decoded = tokenService.verifyRefreshToken(refreshTokenCookie);

        // Validate stored token
        const isValid = await tokenService.validateStoredRefreshToken(decoded.userId, refreshTokenCookie);
        if (!isValid) {
            // Possible token theft — invalidate all tokens
            await tokenService.invalidateRefreshToken(decoded.userId);
            throw new AppError('Invalid refresh token. Please log in again.', 401, 'INVALID_REFRESH');
        }

        // Get user role
        const result = await query(
            `SELECT u.id, r.name as role FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       WHERE u.id = $1 AND u.is_active = TRUE`,
            [decoded.userId]
        );

        if (result.rows.length === 0) {
            throw new AppError('User not found.', 401, 'USER_NOT_FOUND');
        }

        const user = result.rows[0];

        // Rotate tokens
        const newAccessToken = tokenService.generateAccessToken(user.id, user.role);
        const newRefreshToken = tokenService.generateRefreshToken(user.id);

        await tokenService.storeRefreshToken(user.id, newRefreshToken);
        // During refresh, we can safely just issue a session cookie, or check DB. 
        // For simplicity, issue a standard long cookie or keep existing behavior by treating it as a new session.
        tokenService.setAuthCookies(res, newAccessToken, newRefreshToken, true);

        res.json({
            success: true,
            message: 'Tokens refreshed.',
            data: { user: { id: user.id, role: user.role } },
        });
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return next(new AppError('Refresh token expired. Please log in again.', 401, 'REFRESH_EXPIRED'));
        }
        next(err);
    }
};

/**
 * POST /api/auth/forgot-password
 */
const forgotPassword = async (req, res, next) => {
    try {
        const { email } = req.body;

        const result = await query('SELECT id FROM users WHERE email = $1', [email]);

        // Always return success (prevent email enumeration)
        if (result.rows.length === 0) {
            return res.json({ success: true, message: 'If an account exists, a reset code has been sent.' });
        }

        const resetOTP = tokenService.generateOTP();
        const resetExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        // Fetch name for personalized email
        const userRow = await query('SELECT name FROM users WHERE id = $1', [result.rows[0].id]);
        const userName = userRow.rows[0]?.name || '';

        await query(
            'UPDATE users SET reset_token = $1, reset_token_expires_at = $2 WHERE id = $3',
            [resetOTP, resetExpires, result.rows[0].id]
        );

        await emailService.sendPasswordReset(email, userName, resetOTP);

        res.json({ success: true, message: 'If an account exists, a reset code has been sent.' });
    } catch (err) {
        next(err);
    }
};

/**
 * POST /api/auth/reset-password
 */
const resetPassword = async (req, res, next) => {
    try {
        const { email, otp, password } = req.body;

        const result = await query(
            'SELECT id FROM users WHERE email = $1 AND reset_token = $2 AND reset_token_expires_at > CURRENT_TIMESTAMP',
            [email, otp]
        );

        if (result.rows.length === 0) {
            throw new AppError('Invalid or expired reset code.', 400, 'INVALID_RESET_TOKEN');
        }

        const passwordHash = await bcrypt.hash(password, 12);

        await query(
            `UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expires_at = NULL WHERE id = $2`,
            [passwordHash, result.rows[0].id]
        );

        res.json({ success: true, message: 'Password reset successfully. You can now log in.' });
    } catch (err) {
        next(err);
    }
};

/**
 * GET /api/auth/me — Get current user
 */
const me = async (req, res) => {
    res.json({
        success: true,
        data: { user: req.user },
    });
};

module.exports = {
    register,
    verifyOTP,
    resendOTP,
    login,
    logout,
    refresh,
    forgotPassword,
    resetPassword,
    me,
};
