// ═══════════════════════════════════════════════
// Shared Pagination Utility
// ═══════════════════════════════════════════════
const { query } = require('../config/database');

/**
 * Build a paginated query result.
 *
 * @param {string} dataSQL   – SQL that returns the rows (must include $1=limit, $2=offset)
 * @param {string} countSQL  – SQL that returns COUNT(*)
 * @param {object} opts
 * @param {number} opts.page
 * @param {number} opts.limit
 * @param {Array}  opts.params      – params for dataSQL   (limit & offset are prepended automatically)
 * @param {Array}  opts.countParams – params for countSQL
 * @returns {Promise<{rows: Array, pagination: {page,limit,total,totalPages}}>}
 */
async function paginate(dataSQL, countSQL, { page = 1, limit = 20, params = [], countParams = [] } = {}) {
    const offset = (page - 1) * limit;

    const [dataResult, countResult] = await Promise.all([
        query(dataSQL, [limit, offset, ...params]),
        query(countSQL, countParams),
    ]);

    const total = parseInt(countResult.rows[0].count, 10);

    return {
        rows: dataResult.rows,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    };
}

module.exports = { paginate };
