// ═══════════════════════════════════════════════
// Request Logger Middleware
// ═══════════════════════════════════════════════
const config = require('../config');

const logger = (req, res, next) => {
    const start = Date.now();

    // Capture response finish
    res.on('finish', () => {
        const duration = Date.now() - start;
        const status = res.statusCode;
        const color = status >= 500 ? '\x1b[31m' : status >= 400 ? '\x1b[33m' : '\x1b[32m';
        const reset = '\x1b[0m';

        if (config.isDev || status >= 400) {
            console.log(
                `${color}${req.method}${reset} ${req.originalUrl} → ${color}${status}${reset} (${duration}ms)`
            );
        }
    });

    next();
};

module.exports = logger;
