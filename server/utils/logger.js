// ═══════════════════════════════════════════════
// Logger — Centralized Winston Logger
//
// Replaces raw console.warn / console.error / console.log
// with structured, level-aware logging.
//
// - Development: colorized console output
// - Production:  JSON format + file transports
//   └── logs/error.log   — error level only
//   └── logs/combined.log — all levels
// ═══════════════════════════════════════════════
const { createLogger, format, transports } = require('winston');
const path = require('path');

const isDev = (process.env.NODE_ENV || 'development') === 'development';

// ── Format ──
const devFormat = format.combine(
    format.colorize(),
    format.timestamp({ format: 'HH:mm:ss' }),
    format.printf(({ timestamp, level, message, ...meta }) => {
        const extra = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
        return `${timestamp} ${level}: ${message}${extra}`;
    })
);

const prodFormat = format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.json()
);

// ── Transports ──
const logTransports = [
    new transports.Console({
        format: isDev ? devFormat : prodFormat,
    }),
];

if (!isDev) {
    const logsDir = path.join(__dirname, '..', '..', 'logs');

    logTransports.push(
        new transports.File({
            filename: path.join(logsDir, 'error.log'),
            level: 'error',
            maxsize: 5 * 1024 * 1024,  // 5 MB
            maxFiles: 5,
        }),
        new transports.File({
            filename: path.join(logsDir, 'combined.log'),
            maxsize: 10 * 1024 * 1024, // 10 MB
            maxFiles: 5,
        })
    );
}

const logger = createLogger({
    level: isDev ? 'debug' : 'info',
    format: prodFormat,
    transports: logTransports,
    exitOnError: false,
});

module.exports = logger;
