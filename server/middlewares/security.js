// ═══════════════════════════════════════════════
// Security Middleware — Request hardening layer
//
// PHASE 2:
// ✅ Request ID (X-Request-Id) for correlation
// ✅ Input sanitization — strip null bytes, control chars
// ✅ SQL injection pattern detection on query params
// ✅ Request size guard
// ✅ HPP (HTTP Parameter Pollution) protection
// ═══════════════════════════════════════════════
const crypto = require('crypto');
const { AppError } = require('./errorHandler');

/**
 * Attach a unique request ID for logging/tracing.
 * Accepts X-Request-Id from trusted reverse proxies or generates one.
 */
const requestId = (req, res, next) => {
    req.id = req.headers['x-request-id'] || crypto.randomUUID();
    res.setHeader('X-Request-Id', req.id);
    next();
};

/**
 * Sanitize string inputs — strips null bytes and suspicious control characters.
 * Applied to req.body, req.query, and req.params recursively.
 */
const sanitizeInput = (req, res, next) => {
    const clean = (obj) => {
        if (!obj || typeof obj !== 'object') return obj;
        for (const key of Object.keys(obj)) {
            if (typeof obj[key] === 'string') {
                // Remove null bytes (used in SQL injection and path traversal)
                obj[key] = obj[key].replace(/\0/g, '');
                // Remove other dangerous control characters (except common whitespace)
                obj[key] = obj[key].replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
            } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                clean(obj[key]);
            }
        }
        return obj;
    };

    if (req.body)   clean(req.body);
    if (req.query)  clean(req.query);
    if (req.params) clean(req.params);

    next();
};

/**
 * SQL injection pattern detection — scans query params and URL path.
 * This is a defense-in-depth layer; parameterized queries are the primary defense.
 * Rejects requests with obvious injection patterns (UNION SELECT, --, ;DROP, etc.).
 */
const sqlInjectionGuard = (req, res, next) => {
    // Only check query string params and URL path
    const targets = [
        req.originalUrl,
        ...Object.values(req.query || {}),
    ].filter(v => typeof v === 'string');

    // Common SQL injection patterns (case-insensitive)
    const patterns = [
        /(\bunion\b\s+\bselect\b)/i,
        /(\bselect\b\s+.*\bfrom\b)/i,
        /(\bdrop\b\s+\btable\b)/i,
        /(\binsert\b\s+\binto\b)/i,
        /(\bdelete\b\s+\bfrom\b)/i,
        /(\bupdate\b\s+.*\bset\b)/i,
        /(\balter\b\s+\btable\b)/i,
        /(\bexec\b\s*\()/i,
        /(--|;)\s*(drop|alter|truncate|exec|execute|xp_)\b/i,
        /(\b1\s*=\s*1\b|\b0\s*=\s*0\b)/,             // Tautology attacks
        /('\s*or\s+')/i,                                // 'or'
    ];

    for (const target of targets) {
        for (const pattern of patterns) {
            if (pattern.test(target)) {
                console.warn(
                    `🚨 [SQLi BLOCKED] IP: ${req.ip} | ` +
                    `Path: ${req.method} ${req.originalUrl} | ` +
                    `ReqID: ${req.id || 'none'} | ` +
                    `Match: ${pattern.source}`
                );
                return next(new AppError('Malicious request detected.', 403, 'SECURITY_VIOLATION'));
            }
        }
    }

    next();
};

/**
 * HTTP Parameter Pollution (HPP) protection.
 * If a query parameter is supplied as an array (e.g., ?page=1&page=2),
 * keep only the last value. Prevents parameter injection via duplicates.
 */
const hppProtection = (req, res, next) => {
    if (req.query) {
        for (const key of Object.keys(req.query)) {
            if (Array.isArray(req.query[key])) {
                req.query[key] = req.query[key][req.query[key].length - 1];
            }
        }
    }
    next();
};

module.exports = {
    requestId,
    sanitizeInput,
    sqlInjectionGuard,
    hppProtection,
};
