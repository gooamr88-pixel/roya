// ═══════════════════════════════════════════════
// Database — PostgreSQL Connection Pool
// ═══════════════════════════════════════════════
const { Pool } = require('pg');
const config = require('./index');
const logger = require('../utils/logger');

// Build SSL configuration:
// - DB_SSL=false              → SSL disabled entirely (local dev)
// - DB_SSL_REJECT_UNAUTHORIZED=true → strict cert validation (self-managed VPS with real CA cert)
// - Default (production)      → SSL enabled, rejectUnauthorized: false (required for managed DBs
//   like Supabase, Neon, Railway, etc. that use self-signed or pooler certs)
const buildSslConfig = () => {
    if (process.env.DB_SSL === 'false') return false;
    if (process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true') return { rejectUnauthorized: true };
    // Safe default for managed PostgreSQL providers on Vercel / serverless
    return { rejectUnauthorized: false };
};

// FIX (A4): Pool sizing — configurable via POOL_MAX env var.
// Previous code assumed production = serverless (max 2), but the platform
// runs on a VPS where max:2 causes severe bottlenecks under load.
// POOL_MAX=2 for Vercel serverless, POOL_MAX=10+ for VPS, auto-detect otherwise.
const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
const poolMax = parseInt(process.env.POOL_MAX, 10)
    || (isServerless ? 2 : (config.isDev ? 20 : 10));

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: poolMax,
    idleTimeoutMillis: isServerless ? 1000 : 10000,
    connectionTimeoutMillis: 10000,
    allowExitOnIdle: true,
    ssl: buildSslConfig(),
});

// Log connection events in dev
pool.on('connect', () => {
    if (config.isDev) {
        logger.info('New client connected to PostgreSQL');
    }
});

pool.on('error', (err) => {
    logger.error('Unexpected PostgreSQL pool error', { error: err.message });
});

/**
 * Execute a query with parameters
 * @param {string} text - SQL query string
 * @param {Array} params - Query parameters
 * @returns {Promise<import('pg').QueryResult>}
 */
const query = async (text, params) => {
    const start = Date.now();
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (config.isDev) {
        logger.debug(`Query (${duration}ms): ${text.substring(0, 80)}...`);
    }
    return result;
};

/**
 * Get a client from the pool for transactions
 * @returns {Promise<import('pg').PoolClient>}
 */
const getClient = async () => {
    return pool.connect();
};

/**
 * Execute a function within a database transaction.
 * Automatically handles BEGIN, COMMIT, ROLLBACK, and client.release().
 *
 * FIX (BUG-4): Ensures the pool client is ALWAYS released back to the pool,
 * even if the transaction throws. Prevents connection pool exhaustion.
 *
 * Usage:
 *   const result = await withTransaction(async (client) => {
 *       await client.query('INSERT INTO ...', [...]);
 *       await client.query('UPDATE ...', [...]);
 *       return someValue;
 *   });
 *
 * @param {Function} fn - Async function receiving a PoolClient
 * @returns {Promise<*>} - Whatever fn() returns
 */
const withTransaction = async (fn) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

module.exports = { pool, query, getClient, withTransaction };
