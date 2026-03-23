// ═══════════════════════════════════════════════
// Configuration — Centralized from Environment
// ═══════════════════════════════════════════════
require('dotenv').config();

module.exports = {
  // Server
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: (process.env.NODE_ENV || 'development') === 'development',
  baseUrl: process.env.BASE_URL || process.env.APP_URL || '',

  // Database
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    name: process.env.DB_NAME || 'ROYA_platform',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  },

  // JWT
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'dev_access_secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret',
    accessExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
  },

  // Email
  email: {
    host: process.env.SMTP_HOST || 'smtp.ethereal.email',
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.EMAIL_FROM || 'ROYA Platform <noreply@ROYA.com>',
  },

  // Cloudinary
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
  },

  // WhatsApp
  whatsapp: {
    provider: process.env.WHATSAPP_PROVIDER || 'stub',
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID || '',
      authToken: process.env.TWILIO_AUTH_TOKEN || '',
      from: process.env.TWILIO_WHATSAPP_FROM || '',
    },
  },

  // AI — Google Gemini
  ai: {
    geminiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    timeout: parseInt(process.env.AI_TIMEOUT, 10) || 15000,
  },

  // Security
  security: {
    csrfSecret: process.env.CSRF_SECRET || 'dev_csrf_secret',
    cookieDomain: process.env.COOKIE_DOMAIN || '',
    allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,https://roya-advertising.com').split(','),
  },

  // Super Admin Seed
  superAdmin: {
    name: process.env.SUPER_ADMIN_NAME || 'Super Admin',
    email: process.env.SUPER_ADMIN_EMAIL || 'admin@ROYA.com',
    phone: process.env.SUPER_ADMIN_PHONE || '+966500000000',
    password: process.env.SUPER_ADMIN_PASSWORD || 'Admin@123456',
  },
};

// ═══════════════════════════════════════════════
// Production Environment Validation
// ═══════════════════════════════════════════════
if (module.exports.nodeEnv === 'production') {
  const required = [
    { key: 'JWT_ACCESS_SECRET',   val: process.env.JWT_ACCESS_SECRET },
    { key: 'JWT_REFRESH_SECRET',  val: process.env.JWT_REFRESH_SECRET },
    { key: 'DB_PASSWORD',         val: process.env.DB_PASSWORD },
    { key: 'SMTP_PASS',           val: process.env.SMTP_PASS },
    { key: 'CSRF_SECRET',         val: process.env.CSRF_SECRET },
    { key: 'ALLOWED_ORIGINS',     val: process.env.ALLOWED_ORIGINS },
    { key: 'CLOUDINARY_CLOUD_NAME', val: process.env.CLOUDINARY_CLOUD_NAME },
    { key: 'BASE_URL',            val: process.env.BASE_URL },
  ];

  const insecureDefaults = [
    'dev_access_secret',
    'dev_refresh_secret',
    'dev_csrf_secret',
    'your_db_password',
    'your_app_password',
    'Admin@123456',
    'postgres',
  ];

  const errors = [];

  for (const { key, val } of required) {
    if (!val || val.trim() === '') {
      errors.push(`  ✖  ${key} is missing or empty`);
    } else if (insecureDefaults.includes(val)) {
      errors.push(`  ✖  ${key} is set to an insecure default value ("${val}")`);
    }
  }

  // Ensure ALLOWED_ORIGINS doesn't still point to localhost
  if (process.env.ALLOWED_ORIGINS && process.env.ALLOWED_ORIGINS.includes('localhost')) {
    errors.push('  ✖  ALLOWED_ORIGINS still contains "localhost" — set to your production domain');
  }

  if (errors.length > 0) {
    console.error('\n╔═══════════════════════════════════════════════╗');
    console.error('║   🚨 PRODUCTION ENVIRONMENT VALIDATION FAILED  ║');
    console.error('╚═══════════════════════════════════════════════╝\n');
    errors.forEach(e => console.error(e));
    console.error('\nFix the above issues in your .env file before deploying.\n');
    process.exit(1);
  }

  console.log('✅ Production environment validation passed.');
}
