// ═══════════════════════════════════════════════
// Server Entry Point — Listen & Graceful Shutdown
//
// Imports the configured Express app from app.js
// and starts the HTTP server with graceful shutdown handlers.
// ═══════════════════════════════════════════════
const app = require('./app');
const config = require('./config');
const { pool } = require('./config/database');
const logger = require('./utils/logger');

const PORT = config.port;

const server = app.listen(PORT, () => {
    logger.info(`ROYA Platform server running on port ${PORT} [${config.nodeEnv}]`);
});

const gracefulShutdown = async (signal) => {
    logger.warn(`${signal} received. Shutting down gracefully...`);
    server.close(async () => {
        try {
            await pool.end();
            logger.info('Database pool closed.');
        } catch (err) {
            logger.error('Error closing pool', { error: err.message });
        }
        logger.info('Server shut down cleanly.');
        process.exit(0);
    });

    setTimeout(() => {
        logger.error('Forcing shutdown after timeout');
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception', { error: err.message, stack: err.stack });
    gracefulShutdown('uncaughtException');
});
process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Rejection', { reason });
    gracefulShutdown('unhandledRejection');
});

module.exports = app;
