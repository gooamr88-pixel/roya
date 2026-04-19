// ═══════════════════════════════════════════════
// Global Error Handler — Enterprise-Grade
//
// PHASE 2 HARDENING:
// ✅ Never leaks stack traces, internal error messages, or DB errors to clients
// ✅ Sanitizes PostgreSQL / Sequelize / Mongoose error messages
// ✅ Detects common DB errors (unique constraint, FK violation) → friendly messages
// ✅ Logs request ID for correlation
// ✅ JSON parsing errors → 400 instead of 500
// ✅ Multer file size errors → 413
// ═══════════════════════════════════════════════
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Custom application error with HTTP status and error code.
 */
class AppError extends Error {
    constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * Sanitize database errors — never leak table names, column names, or SQL.
 */
const sanitizeDatabaseError = (err) => {
    // PostgreSQL unique constraint violation
    if (err.code === '23505') {
        // Extract the constraint name safely, provide generic message
        return new AppError('A record with this information already exists.', 409, 'DUPLICATE_ENTRY');
    }
    // PostgreSQL foreign key violation
    if (err.code === '23503') {
        return new AppError('Referenced resource not found.', 400, 'FK_VIOLATION');
    }
    // PostgreSQL not-null violation
    if (err.code === '23502') {
        return new AppError('A required field is missing.', 400, 'MISSING_FIELD');
    }
    // PostgreSQL check constraint violation
    if (err.code === '23514') {
        return new AppError('Invalid value provided.', 400, 'CHECK_VIOLATION');
    }
    // PostgreSQL connection errors
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
        return new AppError('Service temporarily unavailable.', 503, 'SERVICE_UNAVAILABLE');
    }
    return null;
};

/**
 * Main error handler middleware.
 */
const errorHandler = (err, req, res, _next) => {
    // ── Already sent headers? Nothing we can do. ──
    if (res.headersSent) {
        return;
    }

    // ── JSON parse errors (malformed request body) ──
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({
            success: false,
            error: {
                code: 'INVALID_JSON',
                message: 'Request body contains invalid JSON.',
            },
        });
    }

    // ── Multer file size errors ──
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
            success: false,
            error: {
                code: 'FILE_TOO_LARGE',
                message: 'Uploaded file exceeds the maximum allowed size (10MB).',
            },
        });
    }

    // ── Multer file count errors ──
    if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({
            success: false,
            error: {
                code: 'TOO_MANY_FILES',
                message: 'Too many files. Maximum is 5 files per upload.',
            },
        });
    }

    // ── Multer unexpected field ──
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({
            success: false,
            error: {
                code: 'UNEXPECTED_FILE',
                message: 'Unexpected file field in upload.',
            },
        });
    }

    // ── CORS errors ──
    if (err.message && err.message.includes('CORS')) {
        return res.status(403).json({
            success: false,
            error: {
                code: 'CORS_ERROR',
                message: 'Cross-origin request blocked.',
            },
        });
    }

    // ── Database errors — sanitize first ──
    const dbError = sanitizeDatabaseError(err);
    if (dbError) {
        // Log the real error for debugging but send sanitized version to client
        logger.error('Database error', {
            reqId: req.id || 'none',
            method: req.method,
            path: req.originalUrl,
            code: err.code,
            detail: err.detail || err.message,
        });
        return res.status(dbError.statusCode).json({
            success: false,
            error: {
                code: dbError.code,
                message: dbError.message,
            },
        });
    }

    // ── Operational errors (AppError instances) ──
    const statusCode = err.statusCode || 500;
    const code = err.code || 'INTERNAL_ERROR';

    // Log server errors (5xx) with full details
    if (statusCode >= 500) {
        logger.error('Server error', {
            method: req.method,
            path: req.originalUrl,
            reqId: req.id || 'none',
            status: statusCode,
            code,
            stack: err.stack || err.message,
        });
    }

    // ── Build safe response ──
    const response = {
        success: false,
        error: {
            code,
            // Only show error message for operational errors.
            // For unexpected errors, show generic message to prevent info leakage.
            message: err.isOperational
                ? err.message
                : 'An unexpected error occurred. Please try again.',
        },
    };

    // Include stack trace ONLY in development + only for 5xx errors
    if (config.isDev && statusCode >= 500 && err.stack) {
        response.error.stack = err.stack;
    }

    // Attach request ID for correlation
    if (req.id) {
        response.error.requestId = req.id;
    }

    res.status(statusCode).json(response);
};

module.exports = errorHandler;
module.exports.AppError = AppError;
