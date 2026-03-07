// ═══════════════════════════════════════════════
// Database — PostgreSQL Connection Pool
// ═══════════════════════════════════════════════
const { Pool } = require('pg');
const config = require('./index');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
    idleTimeoutMillis: 1000,
    connectionTimeoutMillis: 5000,
    allowExitOnIdle: true,
    ssl: { rejectUnauthorized: false },
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

module.exports = { pool, query, getClient };
