// ═══════════════════════════════════════════════
// Server Entry Point — Listen & Graceful Shutdown
//
// Imports the configured Express app from app.js
// and starts the HTTP server with graceful shutdown handlers.
// ═══════════════════════════════════════════════
const app = require('./app');
const config = require('./config');
const { pool } = require('./config/database');

const PORT = config.port;

const server = app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════╗
║                 ROYA Platform                 ║
║   Server running on port ${PORT}                 ║
║   Environment: ${config.nodeEnv.padEnd(20)}       ║
╚═══════════════════════════════════════════════╝
  `);
});

const gracefulShutdown = async (signal) => {
    console.log(`\n⚠️  ${signal} received. Shutting down gracefully...`);
    server.close(async () => {
        try {
            await pool.end();
            console.log('📦 Database pool closed.');
        } catch (err) {
            console.error('Error closing pool:', err.message);
        }
        console.log('✅ Server shut down cleanly.');
        process.exit(0);
    });

    setTimeout(() => {
        console.error('⚠️  Forcing shutdown...');
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('uncaughtException', (err) => {
    console.error('💥 Uncaught Exception:', err);
    gracefulShutdown('uncaughtException');
});
process.on('unhandledRejection', (reason) => {
    console.error('💥 Unhandled Rejection:', reason);
    gracefulShutdown('unhandledRejection');
});

module.exports = app;
