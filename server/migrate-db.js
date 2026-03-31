#!/usr/bin/env node
// ═══════════════════════════════════════════════
// Database Migration — Creates/updates all tables
// Usage: node server/migrate-db.js
// Safe to re-run: uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS
// ═══════════════════════════════════════════════
require('dotenv').config();
const { Pool } = require('pg');

const config = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    database: process.env.DB_NAME || 'postgres',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    ssl: process.env.DB_HOST !== 'localhost' ? { rejectUnauthorized: false } : false,
};

const migrations = [

    // ══════════════════════════════════════════
    //  1. ROLES TABLE
    // ══════════════════════════════════════════
    {
        name: 'Create roles table',
        sql: `CREATE TABLE IF NOT EXISTS roles (
            id SERIAL PRIMARY KEY,
            name VARCHAR(50) UNIQUE NOT NULL,
            description TEXT,
            permissions_json JSONB DEFAULT '{}',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`
    },
    {
        name: 'Add description column to roles (if missing)',
        sql: `ALTER TABLE roles ADD COLUMN IF NOT EXISTS description TEXT`
    },
    {
        name: 'Seed default roles',
        sql: `
            INSERT INTO roles (name, description) VALUES
                ('super_admin', 'Full platform access'),
                ('admin', 'Administrative access'),
                ('supervisor', 'Supervisory access'),
                ('client', 'Standard client access')
            ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
        `
    },

    // ══════════════════════════════════════════
    //  2. USERS TABLE
    // ══════════════════════════════════════════
    {
        name: 'Create users table',
        sql: `CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            name VARCHAR(200) NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            phone VARCHAR(30),
            password_hash TEXT NOT NULL,
            role_id INTEGER REFERENCES roles(id),
            is_verified BOOLEAN DEFAULT FALSE,
            is_active BOOLEAN DEFAULT TRUE,
            otp_code VARCHAR(10),
            otp_expires_at TIMESTAMP,
            reset_token VARCHAR(255),
            reset_token_expires_at TIMESTAMP,
            refresh_token_hash TEXT DEFAULT NULL,
            failed_login_attempts INTEGER DEFAULT 0,
            locked_until TIMESTAMP,
            last_login TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`
    },
    {
        name: 'Add updated_at to users (if missing)',
        sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
    },
    {
        name: 'Add ban_type to users (if missing)',
        sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_type VARCHAR(20) DEFAULT NULL`
    },
    {
        name: 'Add ban_expires_at to users (if missing)',
        sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_expires_at TIMESTAMP DEFAULT NULL`
    },
    {
        // BUG FIX #1: refresh_token_hash was used in token.service.js but never created in any migration
        name: 'Add refresh_token_hash to users (if missing)',
        sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS refresh_token_hash TEXT DEFAULT NULL`
    },

    // ══════════════════════════════════════════
    //  3. SERVICES TABLE
    // ══════════════════════════════════════════
    {
        name: 'Create services table',
        sql: `CREATE TABLE IF NOT EXISTS services (
            id SERIAL PRIMARY KEY,
            title VARCHAR(200) NOT NULL,
            description TEXT DEFAULT '',
            price DECIMAL(12,2) DEFAULT 0,
            images JSONB DEFAULT '[]',
            category VARCHAR(50) DEFAULT 'general',
            is_featured BOOLEAN DEFAULT FALSE,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`
    },
    {
        name: 'Add is_featured to services (if missing)',
        sql: `ALTER TABLE services ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT FALSE`
    },
    {
        name: 'Add is_active to services (if missing)',
        sql: `ALTER TABLE services ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE`
    },
    {
        name: 'Add updated_at to services (if missing)',
        sql: `ALTER TABLE services ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
    },

    // ══════════════════════════════════════════
    //  4. ORDERS TABLE
    // ══════════════════════════════════════════
    {
        name: 'Create orders table',
        sql: `CREATE TABLE IF NOT EXISTS orders (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id),
            service_id INTEGER REFERENCES services(id),
            service_title VARCHAR(200),
            price DECIMAL(12,2) DEFAULT 0,
            status VARCHAR(30) DEFAULT 'pending',
            notes TEXT,
            invoice_number VARCHAR(100) UNIQUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`
    },
    {
        name: 'Add updated_at to orders (if missing)',
        sql: `ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
    },

    // ══════════════════════════════════════════
    //  5. PROPERTIES TABLE
    // ══════════════════════════════════════════
    {
        name: 'Create properties table',
        sql: `CREATE TABLE IF NOT EXISTS properties (
            id SERIAL PRIMARY KEY,
            title VARCHAR(200) NOT NULL,
            description TEXT DEFAULT '',
            price DECIMAL(14,2) DEFAULT 0,
            location VARCHAR(300),
            area_sqm DECIMAL(10,2),
            bedrooms INTEGER,
            bathrooms INTEGER,
            property_type VARCHAR(50) DEFAULT 'residential',
            images JSONB DEFAULT '[]',
            is_featured BOOLEAN DEFAULT FALSE,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`
    },
    {
        name: 'Add is_featured to properties (if missing)',
        sql: `ALTER TABLE properties ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT FALSE`
    },
    {
        name: 'Add is_active to properties (if missing)',
        sql: `ALTER TABLE properties ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE`
    },
    {
        name: 'Add updated_at to properties (if missing)',
        sql: `ALTER TABLE properties ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
    },

    // ══════════════════════════════════════════
    //  6. EXHIBITIONS TABLE
    // ══════════════════════════════════════════
    {
        name: 'Create exhibitions table',
        sql: `CREATE TABLE IF NOT EXISTS exhibitions (
            id SERIAL PRIMARY KEY,
            title VARCHAR(200) NOT NULL,
            description TEXT DEFAULT '',
            location VARCHAR(300),
            start_date DATE,
            end_date DATE,
            images JSONB DEFAULT '[]',
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`
    },
    {
        name: 'Add is_active to exhibitions (if missing)',
        sql: `ALTER TABLE exhibitions ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE`
    },

    // ══════════════════════════════════════════
    //  7. CONTACTS TABLE  ← THIS WAS MISSING!
    // ══════════════════════════════════════════
    {
        name: 'Create contacts table',
        sql: `CREATE TABLE IF NOT EXISTS contacts (
            id SERIAL PRIMARY KEY,
            name VARCHAR(200) NOT NULL,
            email VARCHAR(255) NOT NULL,
            subject VARCHAR(300),
            message TEXT NOT NULL,
            status VARCHAR(30) DEFAULT 'new',
            admin_reply TEXT,
            internal_notes TEXT,
            email_status VARCHAR(30) DEFAULT 'pending',
            replied_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`
    },
    {
        name: 'Add admin_reply to contacts (if missing)',
        sql: `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS admin_reply TEXT`
    },
    {
        name: 'Add internal_notes to contacts (if missing)',
        sql: `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS internal_notes TEXT`
    },
    {
        name: 'Add email_status to contacts (if missing)',
        sql: `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email_status VARCHAR(30) DEFAULT 'pending'`
    },
    {
        name: 'Add replied_at to contacts (if missing)',
        sql: `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS replied_at TIMESTAMP`
    },

    // ══════════════════════════════════════════
    //  8. NOTIFICATIONS TABLE
    // ══════════════════════════════════════════
    {
        name: 'Create notifications table',
        sql: `CREATE TABLE IF NOT EXISTS notifications (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            title VARCHAR(200) NOT NULL,
            message TEXT,
            type VARCHAR(30) DEFAULT 'info',
            link VARCHAR(500),
            is_read BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`
    },

    // ══════════════════════════════════════════
    //  9. LOGIN LOGS TABLE
    // ══════════════════════════════════════════
    {
        name: 'Create login_logs table',
        sql: `CREATE TABLE IF NOT EXISTS login_logs (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            ip_address VARCHAR(50),
            user_agent TEXT,
            success BOOLEAN DEFAULT TRUE,
            login_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            logout_time TIMESTAMP
        )`
    },

    // ══════════════════════════════════════════
    //  10. REFRESH TOKENS TABLE
    // ══════════════════════════════════════════
    {
        name: 'Create refresh_tokens table',
        sql: `CREATE TABLE IF NOT EXISTS refresh_tokens (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            token_hash VARCHAR(500) NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`
    },

    // ══════════════════════════════════════════
    //  10.1. JOBS TABLE
    // ══════════════════════════════════════════
    {
        name: 'Create jobs table',
        sql: `CREATE TABLE IF NOT EXISTS jobs (
            id SERIAL PRIMARY KEY,
            title VARCHAR(200) NOT NULL,
            description TEXT DEFAULT '',
            company VARCHAR(200),
            location VARCHAR(300),
            type VARCHAR(50) DEFAULT 'full_time',
            salary_range VARCHAR(100),
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`
    },

    // ══════════════════════════════════════════
    //  10.2. PORTFOLIO ITEMS TABLE
    // ══════════════════════════════════════════
    {
        name: 'Create portfolio_items table',
        sql: `CREATE TABLE IF NOT EXISTS portfolio_items (
            id SERIAL PRIMARY KEY,
            title VARCHAR(200) NOT NULL,
            description TEXT DEFAULT '',
            images JSONB DEFAULT '[]',
            category VARCHAR(50) DEFAULT 'general',
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`
    },

    // ══════════════════════════════════════════
    //  10.3. i18n — Arabic columns for dynamic content
    //  Adds title_ar / description_ar to all content tables
    //  Safe: uses ADD COLUMN IF NOT EXISTS
    // ══════════════════════════════════════════
    {
        name: 'Add title_ar to services',
        sql: `ALTER TABLE services ADD COLUMN IF NOT EXISTS title_ar VARCHAR(200) DEFAULT NULL`
    },
    {
        name: 'Add description_ar to services',
        sql: `ALTER TABLE services ADD COLUMN IF NOT EXISTS description_ar TEXT DEFAULT NULL`
    },
    {
        name: 'Add title_ar to portfolio_items',
        sql: `ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS title_ar VARCHAR(200) DEFAULT NULL`
    },
    {
        name: 'Add description_ar to portfolio_items',
        sql: `ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS description_ar TEXT DEFAULT NULL`
    },
    {
        name: 'Add title_ar to exhibitions',
        sql: `ALTER TABLE exhibitions ADD COLUMN IF NOT EXISTS title_ar VARCHAR(200) DEFAULT NULL`
    },
    {
        name: 'Add description_ar to exhibitions',
        sql: `ALTER TABLE exhibitions ADD COLUMN IF NOT EXISTS description_ar TEXT DEFAULT NULL`
    },
    {
        name: 'Add title_ar to jobs',
        sql: `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS title_ar VARCHAR(200) DEFAULT NULL`
    },
    {
        name: 'Add description_ar to jobs',
        sql: `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS description_ar TEXT DEFAULT NULL`
    },
    {
        name: 'Add title_ar to properties',
        sql: `ALTER TABLE properties ADD COLUMN IF NOT EXISTS title_ar VARCHAR(200) DEFAULT NULL`
    },
    {
        name: 'Add description_ar to properties',
        sql: `ALTER TABLE properties ADD COLUMN IF NOT EXISTS description_ar TEXT DEFAULT NULL`
    },

    // ══════════════════════════════════════════
    //  10.4. HIERARCHICAL RBAC — Role weights
    //  Adds a weight column to roles for hierarchy comparison
    //  Higher weight = more privileges
    // ══════════════════════════════════════════
    {
        name: 'Add weight column to roles',
        sql: `ALTER TABLE roles ADD COLUMN IF NOT EXISTS weight INTEGER DEFAULT 0`
    },
    {
        name: 'Seed viewer and editor roles',
        sql: `
            INSERT INTO roles (name, description, weight) VALUES
                ('viewer', 'Read-only access', 1),
                ('editor', 'Content editing access', 2)
            ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description, weight = EXCLUDED.weight
        `
    },
    {
        name: 'Update weights for existing roles',
        sql: `
            UPDATE roles SET weight = CASE name
                WHEN 'client'      THEN 1
                WHEN 'viewer'      THEN 1
                WHEN 'supervisor'  THEN 1
                WHEN 'editor'      THEN 2
                WHEN 'admin'       THEN 3
                WHEN 'super_admin' THEN 4
                ELSE 0
            END
        `
    },

    // ══════════════════════════════════════════
    //  10.5. i18n — Bilingual category columns
    // ══════════════════════════════════════════
    {
        name: 'Add category_ar to services',
        sql: `ALTER TABLE services ADD COLUMN IF NOT EXISTS category_ar VARCHAR(100) DEFAULT NULL`
    },
    {
        name: 'Add category_ar to portfolio_items',
        sql: `ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS category_ar VARCHAR(100) DEFAULT NULL`
    },

    // ══════════════════════════════════════════
    //  11. INDEXES
    // ══════════════════════════════════════════
    {
        name: 'Index: users.email',
        sql: `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`
    },
    {
        name: 'Index: orders.user_id',
        sql: `CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id)`
    },
    {
        name: 'Index: orders.status',
        sql: `CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)`
    },
    {
        name: 'Index: notifications.user_id',
        sql: `CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id)`
    },
    {
        name: 'Index: contacts.status',
        sql: `CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(status)`
    },
    {
        name: 'Index: login_logs.user_id',
        sql: `CREATE INDEX IF NOT EXISTS idx_login_logs_user_id ON login_logs(user_id)`
    },
    {
        name: 'Index: refresh_tokens.user_id',
        sql: `CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id)`
    },

    // ══════════════════════════════════════════
    //  12. INVOICES TABLE (Admin Dashboard builder)
    //  Supports both order-linked and standalone invoices
    // ══════════════════════════════════════════
    {
        name: 'Create invoices table',
        sql: `CREATE TABLE IF NOT EXISTS invoices (
            id SERIAL PRIMARY KEY,
            order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
            invoice_number VARCHAR(100) UNIQUE,
            total_amount DECIMAL(14,2) DEFAULT 0,
            tax_amount DECIMAL(14,2) DEFAULT 0,
            status VARCHAR(30) DEFAULT 'draft',
            pdf_data BYTEA,
            payload_json JSONB DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`
    },
    {
        name: 'Add payload_json to invoices (if missing)',
        sql: `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payload_json JSONB DEFAULT NULL`
    },
    {
        name: 'Index: invoices.order_id',
        sql: `CREATE INDEX IF NOT EXISTS idx_invoices_order_id ON invoices(order_id)`
    },
];

async function migrate() {
    const pool = new Pool(config);
    console.log('\n🔌 Connecting to PostgreSQL...');
    console.log(`   Host: ${config.host}`);
    console.log(`   Database: ${config.database}\n`);

    try {
        await pool.query('SELECT 1');
        console.log('✅ Database connected.\n');
        console.log('═══════════════════════════════════════');
        console.log('  RUNNING MIGRATIONS');
        console.log('═══════════════════════════════════════\n');

        let success = 0;
        let skipped = 0;
        let failed = 0;

        for (const m of migrations) {
            try {
                await pool.query(m.sql);
                console.log(`  ✅ ${m.name}`);
                success++;
            } catch (err) {
                if (err.message.includes('already exists')) {
                    console.log(`  ⏭️  ${m.name} (already exists)`);
                    skipped++;
                } else {
                    console.error(`  ❌ ${m.name}: ${err.message}`);
                    failed++;
                }
            }
        }

        console.log('\n═══════════════════════════════════════');
        console.log(`  DONE: ${success} applied, ${skipped} skipped, ${failed} failed`);
        console.log('═══════════════════════════════════════\n');

        if (failed > 0) {
            process.exit(1);
        }

    } catch (err) {
        console.error('❌ Connection failed:', err.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

migrate();
