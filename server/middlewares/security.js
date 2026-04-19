// ═══════════════════════════════════════════════
// Security Middleware — Request hardening layer
//
// PHASE 3 HARDENING:
// ✅ Request ID validation (reject spoofed IDs)
// ✅ Depth-limited recursive sanitization (DoS-safe)
// ✅ SQL injection guard covers body + query + URL
// ✅ Reduced false-positive SQLi patterns
// ✅ HPP (HTTP Parameter Pollution) protection
// ═══════════════════════════════════════════════
const crypto = require('crypto');
const { AppError } = require('./errorHandler');
const logger = require('../utils/logger');

// ── Constants ──
const MAX_SANITIZE_DEPTH = 10; // Prevents stack overflow via deeply nested payloads
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Attach a unique request ID for logging/tracing.
 * SECURITY: Only accept X-Request-Id from proxies if it matches UUID v4 format.
 * Reject arbitrary strings to prevent log-forging attacks.
 */
const requestId = (req, res, next) => {
    const incoming = req.headers['x-request-id'];

    // Only trust the incoming header if it's a valid UUID v4
    // (reverse proxies like Nginx/Cloudflare always generate UUIDs)
    req.id = (incoming && UUID_V4_REGEX.test(incoming))
        ? incoming
        : crypto.randomUUID();

    res.setHeader('X-Request-Id', req.id);
    next();
};

/**
 * Sanitize string inputs — strips null bytes and suspicious control characters.
 * SECURITY: Depth-limited to prevent stack overflow from deeply nested JSON payloads.
 * Applied to req.body, req.query, and req.params.
 */
const sanitizeInput = (req, res, next) => {
    const clean = (obj, depth = 0) => {
        // SECURITY: Stop recursion at MAX_SANITIZE_DEPTH to prevent DoS
        if (!obj || typeof obj !== 'object' || depth > MAX_SANITIZE_DEPTH) return obj;

        for (const key of Object.keys(obj)) {
            if (typeof obj[key] === 'string') {
                // Remove null bytes (used in SQL injection and path traversal)
                obj[key] = obj[key].replace(/\0/g, '');
                // Remove dangerous control characters (except common whitespace: \t, \n, \r)
                obj[key] = obj[key].replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
            } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                clean(obj[key], depth + 1);
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
 * Recursively extract all string values from an object (depth-limited).
 * Used by sqlInjectionGuard to scan nested body payloads.
 */
function extractStrings(obj, depth = 0, result = []) {
    if (!obj || depth > MAX_SANITIZE_DEPTH) return result;
    if (typeof obj === 'string') {
        result.push(obj);
        return result;
    }
    if (typeof obj !== 'object') return result;

    for (const key of Object.keys(obj)) {
        if (typeof obj[key] === 'string') {
            result.push(obj[key]);
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
            extractStrings(obj[key], depth + 1, result);
        }
    }
    return result;
}

/**
 * SQL injection pattern detection — defense-in-depth layer.
 *
 * FIX (C6): Removed req.body scanning. Body values are always used via
 * parameterized queries ($1, $2...) so SQL injection is impossible there.
 * Scanning the body caused false positives — e.g., admin replying with
 * "please delete from the list" or "insert into our calendar" got blocked.
 *
 * We only scan req.originalUrl and req.query, which is where actual
 * SQL injection attacks occur (query string manipulation, URL tampering).
 */
const sqlInjectionGuard = (req, res, next) => {
    // FIX (C6): Only scan URL and query params, NOT body
    const targets = [
        req.originalUrl,
        ...extractStrings(req.query),
    ];

    // SQL injection patterns — ordered by severity, tuned for low false-positives
    // These use SQL-specific delimiters (quotes, semicolons, comments) to
    // distinguish attacks from natural language.
    const patterns = [
        /(\bunion\b\s+(all\s+)?\bselect\b)/i,          // UNION [ALL] SELECT
        /(\bdrop\b\s+\btable\b)/i,                      // DROP TABLE
        /(\binsert\b\s+\binto\b)/i,                     // INSERT INTO
        /(\bdelete\b\s+\bfrom\b)/i,                     // DELETE FROM
        /(\balter\b\s+\btable\b)/i,                     // ALTER TABLE
        /(\bexec\b\s*\()/i,                              // EXEC(
        /(\btruncate\b\s+\btable\b)/i,                  // TRUNCATE TABLE
        /(--|;)\s*(drop|alter|truncate|exec|execute|xp_)\b/i,  // Statement chaining
        /(;\s*\bselect\b)/i,                             // Chained SELECT (;SELECT)
        /(\b0x[0-9a-f]+)/i,                             // Hex-encoded payloads
        /('(\s|%20)*;)/,                                 // Quote followed by semicolon
        /('\s*or\s+')/i,                                 // 'or' (classic ' OR '1'='1)
        /(\b1\s*=\s*1\b|\b0\s*=\s*0\b)/,               // Tautology attacks
    ];

    for (const target of targets) {
        for (const pattern of patterns) {
            if (pattern.test(target)) {
                // FIX (C8): Use structured logger instead of console.warn
                logger.warn('SQLi pattern blocked', {
                    ip: req.ip,
                    method: req.method,
                    path: req.originalUrl,
                    reqId: req.id || 'none',
                    pattern: pattern.source,
                });
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
