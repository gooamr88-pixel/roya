#!/usr/bin/env node
// ═══════════════════════════════════════════════
// Seed Super Admin — Creates or updates the super_admin account
// Usage: node server/seed-admin.js
// ═══════════════════════════════════════════════
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

// ── Config ──
const config = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    database: process.env.DB_NAME || 'postgres',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    ssl: process.env.DB_HOST !== 'localhost' ? { rejectUnauthorized: false } : false,
};

const admin = {
    name: (process.env.SUPER_ADMIN_NAME || 'Super Admin').trim(),
    email: (process.env.SUPER_ADMIN_EMAIL || 'admin@roya.com').trim(),
    phone: (process.env.SUPER_ADMIN_PHONE || '+966500000000').trim(),
    password: (process.env.SUPER_ADMIN_PASSWORD || 'Admin@123456').trim(),
};

async function seed() {
    const pool = new Pool(config);
    console.log('\n🔌 Connecting to PostgreSQL...');
    console.log(`   Host: ${config.host}`);
    console.log(`   Database: ${config.database}\n`);

    try {
        // Test connection
        await pool.query('SELECT 1');
        console.log('✅ Database connected successfully.\n');

        // ── Step 1: Ensure 'super_admin' role exists ──
        let roleResult = await pool.query("SELECT id FROM roles WHERE name = 'super_admin'");
        let roleId;

        if (roleResult.rows.length === 0) {
            console.log('⚠️  Role "super_admin" not found. Creating it...');
            const insertRole = await pool.query(
                "INSERT INTO roles (name, description) VALUES ('super_admin', 'Full platform access') RETURNING id"
            );
            roleId = insertRole.rows[0].id;
            console.log(`✅ Role "super_admin" created (ID: ${roleId})`);
        } else {
            roleId = roleResult.rows[0].id;
            console.log(`✅ Role "super_admin" exists (ID: ${roleId})`);
        }

        // ── Step 2: Check if the admin user exists ──
        const userResult = await pool.query('SELECT id, email, is_verified, is_active FROM users WHERE email = $1', [admin.email]);

        if (userResult.rows.length > 0) {
            const existing = userResult.rows[0];
            console.log(`\n📋 Admin user FOUND (ID: ${existing.id}, Email: ${existing.email})`);
            console.log(`   is_verified: ${existing.is_verified}`);
            console.log(`   is_active:   ${existing.is_active}`);

            // Update password, role, and ensure verified + active
            const newHash = await bcrypt.hash(admin.password, 12);
            await pool.query(
                `UPDATE users 
                 SET password_hash = $1, role_id = $2, is_verified = TRUE, is_active = TRUE,
                     failed_login_attempts = 0, locked_until = NULL, name = $3, phone = $4
                 WHERE id = $5`,
                [newHash, roleId, admin.name, admin.phone, existing.id]
            );
            console.log('✅ Admin password re-hashed and account ensured active + verified.');

        } else {
            // ── Step 3: Create new admin user ──
            console.log(`\n⚠️  Admin user NOT found (${admin.email}). Creating...`);

            const passwordHash = await bcrypt.hash(admin.password, 12);
            const insertResult = await pool.query(
                `INSERT INTO users (name, email, phone, password_hash, role_id, is_verified, is_active)
                 VALUES ($1, $2, $3, $4, $5, TRUE, TRUE)
                 RETURNING id, email`,
                [admin.name, admin.email, admin.phone, passwordHash, roleId]
            );
            const newUser = insertResult.rows[0];
            console.log(`✅ Admin user CREATED (ID: ${newUser.id}, Email: ${newUser.email})`);
        }

        // ── Summary ──
        console.log('\n══════════════════════════════════════');
        console.log('  ✅ SUPER ADMIN SEED COMPLETE');
        console.log('══════════════════════════════════════');
        console.log(`  Email:    ${admin.email}`);
        console.log(`  Password: ${admin.password.substring(0, 3)}${'*'.repeat(admin.password.length - 3)}`);
        console.log(`  Role:     super_admin`);
        console.log('══════════════════════════════════════\n');

    } catch (err) {
        console.error('\n❌ Seed failed:', err.message);
        if (err.message.includes('relation "users" does not exist')) {
            console.error('   → The "users" table does not exist. Run your database migrations first.');
        }
        if (err.message.includes('relation "roles" does not exist')) {
            console.error('   → The "roles" table does not exist. Run your database migrations first.');
        }
        process.exit(1);
    } finally {
        await pool.end();
    }
}

seed();
