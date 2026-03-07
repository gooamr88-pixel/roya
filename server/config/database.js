// ═══════════════════════════════════════════════
// Database — PostgreSQL Connection Pool
// ═══════════════════════════════════════════════
const { Pool } = require('pg');
const config = require('./index');

const pool = new Pool({
    host: config.db.host,
    port: config.db.port,
    database: config.db.name,
    user: config.db.user,
    password: config.db.password,
    max: 2, // Serverless Best Practice: Restrict max connections to prevent exhaustion (1 or 2 max per lambda/Vercel instance)
    idleTimeoutMillis: 1000, // Serverless Best Practice: close idle clients quickly (1 second) to free up connections
    connectionTimeoutMillis: 5000, // Fail fast if unable to connect
    allowExitOnIdle: true, // Prevents Node event loop from hanging in serverless environments
    ssl: config.db.host !== 'localhost' ? { rejectUnauthorized: false } : false,
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
