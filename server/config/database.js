// ═══════════════════════════════════════════════
// Database — PostgreSQL Connection Pool
// ═══════════════════════════════════════════════
const { Pool } = require('pg');
const config = require('./index');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
    allowExitOnIdle: true,
    // FIX: SSL config is now environment-aware.
    // In production, you should use a proper CA certificate.
    // rejectUnauthorized: false is acceptable for Supabase pooler but
    // should be tightened for a self-managed VPS with a real cert.
    ssl: process.env.DB_SSL === 'false'
        ? false
        : { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' },
});

// Log connection events in dev
pool.on('connect', () => {
    if (config.isDev) {
        console.log('📦 New client connected to PostgreSQL');
    }
});

pool.on('error', (err) => {
    console.error('❌ Unexpected PostgreSQL pool error:', err.message);
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
        console.log(`🔍 Query (${duration}ms): ${text.substring(0, 80)}...`);
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
