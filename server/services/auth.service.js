// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Auth Service â€” Business logic for authentication
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
const bcrypt = require('bcryptjs');
const config = require('../config');
const { AppError } = require('../middlewares/errorHandler');
const tokenService = require('./token.service');
const emailService = require('./email.service');
const notificationService = require('./notification.service');
const userRepo = require('../repositories/user.repository');
const loginLogRepo = require('../repositories/login-log.repository');
const logger = require('../utils/logger');

/**
 * Register a new user
 */
const registerUser = async ({ name, email, phone, password }) => {
    // Check if user exists
    const existing = await userRepo.findByEmail(email);
    if (existing) {
        throw new AppError('Email is already registered.', 409, 'EMAIL_EXISTS');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Generate OTP
    const otp = tokenService.generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    // Get client role
    const roleId = await userRepo.getDefaultRoleId();
    if (!roleId) {
        throw new AppError('System configuration error: default role not found.', 500, 'CONFIG_ERROR');
    }

    // Insert user
    const user = await userRepo.create({ name, email, phone, passwordHash, roleId, otp, otpExpires });

    // Send OTP email
    try {
        await emailService.sendOTP(user.email, user.name, otp);
    } catch (emailErr) {
        logger.error('OTP email delivery failed', { error: emailErr.message });
        throw new AppError(
            'Account created but we could not send the verification email. Please try resending the OTP.',
            502,
            'EMAIL_SEND_FAILED'
        );
    }

    return { userId: user.id, email: user.email };
};

/**
 * Verify OTP
 */
const verifyOTP = async (email, otp) => {
    const user = await userRepo.findByEmail(email);
    if (!user) {
        throw new AppError('User not found.', 404, 'USER_NOT_FOUND');
    }

    if (!user.otp_code || user.otp_code !== otp) {
        throw new AppError('Invalid OTP code.', 400, 'INVALID_OTP');
    }

    if (new Date() > new Date(user.otp_expires_at)) {
        throw new AppError('OTP has expired. Please request a new one.', 400, 'OTP_EXPIRED');
    }

    // Mark verified
    await userRepo.markVerified(user.id);

    // Create welcome notification
    await notificationService.createNotification(
        user.id,
        'Welcome!',
        'Your email has been verified. Welcome to Nabda Capital Group Platform!',
        'success'
    );
};

/**
 * Resend OTP
 */
const resendOTP = async (email) => {
    const user = await userRepo.findByEmail(email);
    if (!user) {
        throw new AppError('User not found.', 404, 'USER_NOT_FOUND');
    }

    if (user.is_verified) {
        throw new AppError('Email is already verified.', 400, 'ALREADY_VERIFIED');
    }

    const otp = tokenService.generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

    await userRepo.updateOtp(user.id, otp, otpExpires);

    try {
        await emailService.sendOTP(email, user.name, otp);
    } catch (emailErr) {
        logger.error('OTP resend email delivery failed', { error: emailErr.message });
        throw new AppError(
            'Could not send the verification email. Please check your email address or try again later.',
            502,
            'EMAIL_SEND_FAILED'
        );
    }
};

/**
 * Login user â€” returns tokens and user data
 */
const loginUser = async ({ email, password, rememberMe, ip, userAgent }) => {
    const user = await userRepo.findByEmailWithRole(email);

    if (!user) {
        throw new AppError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
    }

    // Check account lock
    if (user.locked_until && new Date() < new Date(user.locked_until)) {
        const minutesLeft = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
        throw new AppError(`Account locked. Try again in ${minutesLeft} minutes.`, 423, 'ACCOUNT_LOCKED');
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
        const attempts = (user.failed_login_attempts || 0) + 1;
        const lockedUntil = attempts >= 5 ? new Date(Date.now() + 30 * 60 * 1000) : null;

        await userRepo.updateFailedAttempts(user.id, attempts, lockedUntil);
        await loginLogRepo.logFailure(user.id, ip, userAgent);

        throw new AppError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
    }

    // Ban check
    if (!user.is_active) {
        if (user.ban_type === 'permanent') {
            throw new AppError('Your account has been permanently banned. Contact support.', 403, 'ACCOUNT_BANNED');
        }
        if (user.ban_type === 'temporary' && user.ban_expires_at) {
            if (new Date() < new Date(user.ban_expires_at)) {
                const expiresAt = new Date(user.ban_expires_at).toLocaleDateString();
                throw new AppError(`Your account is temporarily suspended until ${expiresAt}.`, 403, 'ACCOUNT_BANNED_TEMP');
            } else {
                // Temp ban expired â€” auto-unban
                await userRepo.clearBan(user.id);
            }
        } else {
            throw new AppError('Account has been deactivated. Contact support.', 403, 'ACCOUNT_DEACTIVATED');
        }
    }

    if (!user.is_verified) {
        throw new AppError('Please verify your email before logging in.', 403, 'EMAIL_NOT_VERIFIED');
    }

    // Reset failed attempts
    await userRepo.resetLoginState(user.id);

    // Generate tokens
    const accessToken = tokenService.generateAccessToken(user.id, user.role);
    const refreshToken = tokenService.generateRefreshToken(user.id);

    // Store refresh token hash
    await tokenService.storeRefreshToken(user.id, refreshToken);

    // Log successful login
    await loginLogRepo.logSuccess(user.id, ip, userAgent);

    return {
        accessToken,
        refreshToken,
        rememberMe,
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
    };
};

/**
 * Logout user
 * FIX (C5): Uses proper JWT verify options (algorithm, issuer, audience)
 * instead of raw jwt.verify with no options. Also handles expired tokens
 * gracefully â€” a user logging out with an expired access token is normal.
 */
const logoutUser = async (token) => {
    if (token) {
        try {
            const jwt = require('jsonwebtoken');
            // Try strict verification first
            let decoded;
            try {
                decoded = jwt.verify(token, config.jwt.accessSecret, {
                    algorithms: ['HS256'],
                    issuer: 'roya-platform',
                    audience: 'roya-api',
                });
            } catch (verifyErr) {
                // If expired, still decode to get userId for cleanup
                if (verifyErr.name === 'TokenExpiredError') {
                    decoded = jwt.decode(token);
                } else {
                    // Invalid/tampered token â€” nothing to clean up
                    return;
                }
            }
            if (decoded?.userId) {
                await tokenService.invalidateRefreshToken(decoded.userId);
                await loginLogRepo.logLogout(decoded.userId);
            }
        } catch (e) {
            // Swallow â€” logout should never fail
            logger.warn('Logout cleanup failed', { error: e.message });
        }
    }
};

/**
 * Refresh tokens
 */
const refreshTokens = async (refreshTokenCookie) => {
    if (!refreshTokenCookie) {
        throw new AppError('Refresh token required.', 401, 'NO_REFRESH_TOKEN');
    }

    // Verify refresh token
    const decoded = tokenService.verifyRefreshToken(refreshTokenCookie);

    // Validate stored token
    const isValid = await tokenService.validateStoredRefreshToken(decoded.userId, refreshTokenCookie);
    if (!isValid) {
        await tokenService.invalidateRefreshToken(decoded.userId);
        throw new AppError('Invalid refresh token. Please log in again.', 401, 'INVALID_REFRESH');
    }

    // Get user role
    const user = await userRepo.getUserWithRole(decoded.userId);
    if (!user) {
        throw new AppError('User not found.', 401, 'USER_NOT_FOUND');
    }

    // Rotate tokens
    const newAccessToken = tokenService.generateAccessToken(user.id, user.role);
    const newRefreshToken = tokenService.generateRefreshToken(user.id);

    await tokenService.storeRefreshToken(user.id, newRefreshToken);

    return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        user: { id: user.id, role: user.role },
    };
};

/**
 * Forgot password â€” send reset OTP
 */
const forgotPassword = async (email) => {
    const user = await userRepo.findByEmail(email);

    // Always return success â€” prevent email enumeration
    if (!user) return;

    const resetOTP = tokenService.generateOTP();
    const resetExpires = new Date(Date.now() + 10 * 60 * 1000);

    await userRepo.updateResetToken(user.id, resetOTP, resetExpires);
    await emailService.sendPasswordReset(email, user.name || '', resetOTP);
};

/**
 * Reset password
 */
const resetPassword = async (email, otp, password) => {
    const user = await userRepo.findByResetToken(email, otp);
    if (!user) {
        throw new AppError('Invalid or expired reset code.', 400, 'INVALID_RESET_TOKEN');
    }

    // Check if new password is the same as old
    const isSamePassword = await bcrypt.compare(password, user.password_hash);
    if (isSamePassword) {
        throw new AppError('New password cannot be the same as your current password.', 400, 'SAME_PASSWORD');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await userRepo.updatePassword(user.id, passwordHash);
};

module.exports = {
    registerUser,
    verifyOTP,
    resendOTP,
    loginUser,
    logoutUser,
    refreshTokens,
    forgotPassword,
    resetPassword,
};

