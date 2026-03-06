// ═══════════════════════════════════════════════
// Database Seed — Default Roles + Super Admin
// ═══════════════════════════════════════════════
const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');
const config = require('../config');

const ROLES = [
    {
        name: 'super_admin',
        permissions: [
            'all', 'manage_roles', 'view_logs', 'manage_users',
            'manage_services', 'manage_orders', 'manage_exhibitions',
            'manage_properties', 'manage_invoices', 'manage_notifications',
        ],
    },
    {
        name: 'admin',
        permissions: [
            'manage_services', 'manage_orders', 'manage_exhibitions',
            'manage_properties', 'manage_invoices', 'modify_prices',
        ],
    },
    {
        name: 'supervisor',
        permissions: ['view_orders', 'update_order_status'],
    },
    {
        name: 'viewer',
        permissions: ['read_only'],
    },
    {
        name: 'client',
        permissions: ['create_orders', 'view_own_orders', 'view_profile'],
    },
];

const seed = async () => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        console.log('🌱 Running database seed...\n');

        // ── Seed Roles ──
        for (const role of ROLES) {
            await client.query(
                `INSERT INTO roles (name, permissions_json)
         VALUES ($1, $2)
         ON CONFLICT (name) DO UPDATE SET permissions_json = $2`,
                [role.name, JSON.stringify(role.permissions)]
            );
            console.log(`  ✅ Role: ${role.name}`);
        }

        // ── Get super_admin role ID ──
        const roleResult = await client.query(
            `SELECT id FROM roles WHERE name = 'super_admin'`
        );
        const superAdminRoleId = roleResult.rows[0].id;

        // ── Seed Super Admin User ──
        const hashedPassword = await bcrypt.hash(config.superAdmin.password, 12);

        await client.query(
            `INSERT INTO users (name, email, phone, password_hash, role_id, is_verified, is_active)
       VALUES ($1, $2, $3, $4, $5, TRUE, TRUE)
       ON CONFLICT (email) DO UPDATE SET
         name = $1,
         password_hash = $4,
         role_id = $5,
         is_verified = TRUE,
         is_active = TRUE`,
            [
                config.superAdmin.name,
                config.superAdmin.email,
                config.superAdmin.phone,
                hashedPassword,
                superAdminRoleId,
            ]
        );
        console.log(`  ✅ Super Admin: ${config.superAdmin.email}`);

        // ── Seed Sample Services ──
        const sampleServices = [
            { title: 'Digital Advertising', description: 'Full digital advertising campaigns across social media and search engines.', price: 5000, category: 'advertising' },
            { title: 'Brand Marketing', description: 'Complete brand identity and marketing strategy development.', price: 8000, category: 'marketing' },
            { title: 'Exhibition Design', description: 'Custom exhibition booth design and setup for trade shows.', price: 15000, category: 'exhibitions' },
            { title: 'Social Media Management', description: 'Monthly social media content creation and community management.', price: 3000, category: 'marketing' },
            { title: 'Property Photography', description: 'Professional real estate photography and virtual tours.', price: 2000, category: 'real_estate' },
            { title: 'Event Planning', description: 'Full-service event planning and management for corporate events.', price: 20000, category: 'exhibitions' },
        ];

        for (const svc of sampleServices) {
            await client.query(
                `INSERT INTO services (title, description, price, category, is_active)
         VALUES ($1, $2, $3, $4, TRUE)
         ON CONFLICT DO NOTHING`,
                [svc.title, svc.description, svc.price, svc.category]
            );
        }
        console.log('  ✅ Sample services seeded');

        await client.query('COMMIT');
        console.log('\n✅ Seed completed successfully!\n');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('\n❌ Seed failed:', err.message);
        throw err;
    } finally {
        client.release();
        await pool.end();
    }
};

if (require.main === module) {
    seed()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}

module.exports = seed;
