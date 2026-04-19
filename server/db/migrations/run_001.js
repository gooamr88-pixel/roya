// Run index migration via Node.js — handles missing tables gracefully
// Usage: node server/db/migrations/run_001.js
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
});

// Each index as a separate statement — if a table doesn't exist, skip it
const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)',
    'CREATE INDEX IF NOT EXISTS idx_orders_user_status ON orders(user_id, status)',
    'CREATE INDEX IF NOT EXISTS idx_orders_created_at_desc ON orders(created_at DESC)',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users(email)',
    'CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number ON invoices(invoice_number)',
    'CREATE INDEX IF NOT EXISTS idx_invoices_order_id ON invoices(order_id)',
    'CREATE INDEX IF NOT EXISTS idx_contact_messages_status ON contact_messages(status)',
    'CREATE INDEX IF NOT EXISTS idx_contact_messages_created_at_desc ON contact_messages(created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id)',
    "CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read) WHERE is_read = FALSE",
    'CREATE INDEX IF NOT EXISTS idx_login_logs_created_at_desc ON login_logs(created_at DESC)',
    "CREATE INDEX IF NOT EXISTS idx_services_is_active ON services(is_active) WHERE is_active = TRUE",
];

(async () => {
    let success = 0;
    let skipped = 0;

    console.log('Running index migration...\n');

    for (const sql of indexes) {
        // Extract index and table name for logging
        const match = sql.match(/ON\s+(\w+)/i);
        const table = match ? match[1] : 'unknown';
        const idxMatch = sql.match(/idx_\w+/i);
        const idx = idxMatch ? idxMatch[0] : 'unknown';

        try {
            await pool.query(sql);
            console.log(`  ✅ ${idx} (${table})`);
            success++;
        } catch (err) {
            if (err.message.includes('does not exist')) {
                console.log(`  ⏭️  ${idx} — skipped (table "${table}" not found)`);
                skipped++;
            } else {
                console.error(`  ❌ ${idx} — ${err.message}`);
            }
        }
    }

    console.log(`\nDone: ${success} created, ${skipped} skipped.`);
    await pool.end();
})();
