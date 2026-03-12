// ═══════════════════════════════════════════════
// Database Migration — Create All Tables
// ═══════════════════════════════════════════════
const { pool } = require('../config/database');

const migrate = async () => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('🔄 Running database migration...\n');

    // ── 1. Roles ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS roles (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50) NOT NULL UNIQUE,
        permissions_json JSONB DEFAULT '[]',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('  ✅ roles');

    // ── 2. Users ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        phone VARCHAR(50) UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role_id INTEGER REFERENCES roles(id) DEFAULT NULL,
        is_verified BOOLEAN DEFAULT FALSE,
        is_active BOOLEAN DEFAULT TRUE,
        otp_code VARCHAR(6) DEFAULT NULL,
        otp_expires_at TIMESTAMP DEFAULT NULL,
        reset_token VARCHAR(255) DEFAULT NULL,
        reset_token_expires_at TIMESTAMP DEFAULT NULL,
        refresh_token_hash VARCHAR(255) DEFAULT NULL,
        failed_login_attempts INTEGER DEFAULT 0,
        locked_until TIMESTAMP DEFAULT NULL,
        last_login TIMESTAMP DEFAULT NULL,
        avatar_url VARCHAR(500) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('  ✅ users');

    // ── 3. Services ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS services (
        id SERIAL PRIMARY KEY,
        title VARCHAR(200) NOT NULL,
        description TEXT,
        price DECIMAL(10, 2) DEFAULT 0,
        images JSONB DEFAULT '[]',
        category VARCHAR(100) DEFAULT 'general',
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('  ✅ services');

    // ── 4. Exhibitions ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS exhibitions (
        id SERIAL PRIMARY KEY,
        title VARCHAR(200) NOT NULL,
        description TEXT,
        location VARCHAR(255) DEFAULT NULL,
        start_date DATE DEFAULT NULL,
        end_date DATE DEFAULT NULL,
        images JSONB DEFAULT '[]',
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('  ✅ exhibitions');

    // ── 5. Properties ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS properties (
        id SERIAL PRIMARY KEY,
        title VARCHAR(200) NOT NULL,
        description TEXT,
        price DECIMAL(12, 2) DEFAULT 0,
        location VARCHAR(255) DEFAULT NULL,
        area_sqm DECIMAL(10, 2) DEFAULT NULL,
        bedrooms INTEGER DEFAULT NULL,
        bathrooms INTEGER DEFAULT NULL,
        property_type VARCHAR(50) DEFAULT 'residential',
        images JSONB DEFAULT '[]',
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('  ✅ properties');

    // ── 6. Orders ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        service_id INTEGER REFERENCES services(id) ON DELETE SET NULL,
        service_title VARCHAR(200) DEFAULT NULL,
        price DECIMAL(10, 2) DEFAULT 0,
        status VARCHAR(30) DEFAULT 'pending',
        notes TEXT DEFAULT NULL,
        invoice_number VARCHAR(50) UNIQUE DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('  ✅ orders');

    // ── 7. Invoices ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id SERIAL PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        invoice_number VARCHAR(50) NOT NULL UNIQUE,
        total_amount DECIMAL(10, 2) NOT NULL,
        tax_amount DECIMAL(10, 2) DEFAULT 0,
        pdf_url VARCHAR(500) DEFAULT NULL,
        pdf_data BYTEA DEFAULT NULL,
        status VARCHAR(50) DEFAULT 'generated',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('  ✅ invoices');

    // ── 8. Login Logs ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS login_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        login_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        logout_time TIMESTAMP DEFAULT NULL,
        ip_address VARCHAR(45) DEFAULT NULL,
        user_agent VARCHAR(500) DEFAULT NULL,
        success BOOLEAN DEFAULT TRUE
      );
    `);
    console.log('  ✅ login_logs');

    // ── 9. Notifications ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(200) NOT NULL,
        message TEXT DEFAULT NULL,
        type VARCHAR(30) DEFAULT 'info',
        is_read BOOLEAN DEFAULT FALSE,
        link VARCHAR(500) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('  ✅ notifications');

    // ── 10. Contacts ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS contacts (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(255) NOT NULL,
        subject VARCHAR(300) DEFAULT NULL,
        message TEXT NOT NULL,
        status VARCHAR(20) DEFAULT 'new',
        admin_reply TEXT DEFAULT NULL,
        internal_notes TEXT DEFAULT NULL,
        email_status VARCHAR(20) DEFAULT NULL,
        replied_at TIMESTAMP DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('  ✅ contacts');

    // ── Add is_featured columns (safe ALTER) ──
    try {
      await client.query(`ALTER TABLE services ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT FALSE`);
      await client.query(`ALTER TABLE properties ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT FALSE`);
      await client.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS internal_notes TEXT DEFAULT NULL`);
      await client.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email_status VARCHAR(20) DEFAULT NULL`);
      console.log('  ✅ is_featured & internal_notes columns');
    } catch (e) { console.log('  ⚠️ Column additions skipped (may already exist)'); }

    // ── 11. Jobs ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS jobs (
        id SERIAL PRIMARY KEY,
        title VARCHAR(200) NOT NULL,
        description TEXT,
        company VARCHAR(200) DEFAULT NULL,
        location VARCHAR(255) DEFAULT NULL,
        type VARCHAR(50) DEFAULT 'full_time',
        salary_range VARCHAR(100) DEFAULT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('  ✅ jobs');

    // ── 12. Portfolio Items ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS portfolio_items (
        id SERIAL PRIMARY KEY,
        title VARCHAR(200) NOT NULL,
        description TEXT,
        images JSONB DEFAULT '[]',
        category VARCHAR(100) DEFAULT 'general',
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('  ✅ portfolio_items');

    // ── Indexes ──
    console.log('\n🔄 Creating indexes...');

    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)',
      'CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone)',
      'CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id)',
      'CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active)',
      'CREATE INDEX IF NOT EXISTS idx_services_is_active ON services(is_active)',
      'CREATE INDEX IF NOT EXISTS idx_services_category ON services(category)',
      'CREATE INDEX IF NOT EXISTS idx_properties_price ON properties(price)',
      'CREATE INDEX IF NOT EXISTS idx_properties_type ON properties(property_type)',
      'CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_orders_service_id ON orders(service_id)',
      'CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)',
      'CREATE INDEX IF NOT EXISTS idx_orders_invoice_number ON orders(invoice_number)',
      'CREATE INDEX IF NOT EXISTS idx_invoices_order_id ON invoices(order_id)',
      'CREATE INDEX IF NOT EXISTS idx_login_logs_user_id ON login_logs(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read)',
      'CREATE INDEX IF NOT EXISTS idx_jobs_is_active ON jobs(is_active)',
      'CREATE INDEX IF NOT EXISTS idx_jobs_type ON jobs(type)',
      'CREATE INDEX IF NOT EXISTS idx_portfolio_is_active ON portfolio_items(is_active)',
    ];

    for (const idx of indexes) {
      await client.query(idx);
    }
    console.log('  ✅ All indexes created');

    await client.query('COMMIT');
    console.log('\n✅ Migration completed successfully!\n');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ Migration failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
};

// Run if called directly
if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = migrate;
