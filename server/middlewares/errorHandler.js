// ═══════════════════════════════════════════════
// Global Error Handler Middleware
// ═══════════════════════════════════════════════
const config = require('../config');

class AppError extends Error {
    constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}

const errorHandler = (err, req, res, _next) => {
    const statusCode = err.statusCode || 500;
    const code = err.code || 'INTERNAL_ERROR';

    // Log error
    if (statusCode >= 500) {
        console.error(`💥 [${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
        console.error(err.stack || err.message);
    }

    // Response
    const response = {
        success: false,
        error: {
            code,
            message: err.isOperational ? err.message : 'Something went wrong',
        },
    };

    // Include stack trace in dev
    if (config.isDev && err.stack) {
        response.error.stack = err.stack;
    }

    res.status(statusCode).json(response);
};

module.exports = errorHandler;
module.exports.AppError = AppError;
