// ═══════════════════════════════════════════════
// Express Server — Main Entry Point
//
// PHASE 2 HARDENING:
// ✅ CORS origins from config (env-driven, no hardcoding)
// ✅ Global API rate limiting (DDoS layer-1)
// ✅ Request ID middleware (X-Request-Id)
// ✅ Input sanitization middleware
// ✅ SQL injection guard middleware
// ✅ HPP protection middleware
// ✅ Helmet CSP tightened
// ✅ Additional security headers (HSTS, X-Content-Type-Options, etc.)
// ═══════════════════════════════════════════════
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const path = require('path');
const nunjucks = require('nunjucks');
const config = require('./config');
const { pool } = require('./config/database');
const errorHandler = require('./middlewares/errorHandler');
const logger = require('./middlewares/logger');
const { i18nMiddleware } = require('./middlewares/i18n');
const { apiLimiter } = require('./middlewares/rateLimiter');
const { requestId, sanitizeInput, sqlInjectionGuard, hppProtection } = require('./middlewares/security');

const app = express();

// ── Trust first proxy (Vercel, Nginx, Cloudflare) ──
// Required for rate limiting to use correct client IP
app.set('trust proxy', 1);

// ── Disable X-Powered-By ──
app.disable('x-powered-by');

// ── Request ID — must be first for correlation ──
app.use(requestId);

// ═══════════════════════════════════════════════
// Security Headers (Helmet)
// ═══════════════════════════════════════════════
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: [
                "'self'",
                "'unsafe-inline'",
                "https://cdn.jsdelivr.net",
                "https://cdnjs.cloudflare.com",
            ],
            styleSrc: [
                "'self'",
                "'unsafe-inline'",
                "https://fonts.googleapis.com",
                "https://cdnjs.cloudflare.com",
                "https://cdn.jsdelivr.net",
            ],
            imgSrc: [
                "'self'",
                "data:",
                "https://images.unsplash.com",
                "https://res.cloudinary.com",
                "https://flagcdn.com",
                "https://cdnjs.cloudflare.com",
            ],
            fontSrc: [
                "'self'",
                "https://fonts.gstatic.com",
                "https://cdnjs.cloudflare.com",
            ],
            connectSrc: ["'self'"],
            scriptSrcAttr: ["'unsafe-inline'"],
            frameSrc: ["'none'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            upgradeInsecureRequests: config.isDev ? [] : undefined,
        },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    // HSTS — 1 year with subdomains (production only)
    hsts: config.isDev
        ? false
        : { maxAge: 31536000, includeSubDomains: true, preload: true },
    // X-Content-Type-Options: nosniff
    noSniff: true,
    // X-Frame-Options: DENY (already covered by frameSrc but belt-and-suspenders)
    frameguard: { action: 'deny' },
    permissionsPolicy: {
        features: {
            camera: ["'none'"],
            microphone: ["'none'"],
            geolocation: ["'self'"],
            payment: ["'none'"],
            usb: ["'none'"],
        },
    },
}));

// ═══════════════════════════════════════════════
// CORS — Config-driven (reads from ALLOWED_ORIGINS env)
// ═══════════════════════════════════════════════
const allowedOrigins = config.isDev
    ? [
        'http://localhost:3000',
        'http://localhost:5000',
        ...config.security.allowedOrigins,
    ]
    : config.security.allowedOrigins;

// Deduplicate
const uniqueOrigins = [...new Set(allowedOrigins.map(o => o.trim()).filter(Boolean))];

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (server-to-server, curl, mobile apps)
        if (!origin) return callback(null, true);
        if (uniqueOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.warn(`🔒 [CORS BLOCKED] Origin: ${origin} | Allowed: ${uniqueOrigins.join(', ')}`);
            callback(new Error('CORS Error: Origin not allowed'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
    maxAge: 86400,  // Preflight cache: 24 hours
}));

// ═══════════════════════════════════════════════
// Body Parsing
// ═══════════════════════════════════════════════
app.use(express.json({ limit: '2mb' }));              // Tightened from 10mb
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());

// ═══════════════════════════════════════════════
// Security Middleware Chain
// ═══════════════════════════════════════════════
app.use(sanitizeInput);       // Strip null bytes, control chars
app.use(hppProtection);       // HTTP Parameter Pollution guard

// ── Request Logger ──
app.use(logger);

// ── Gzip Compression ──
app.use(compression({
    level: 6,
    threshold: 1024,
    filter: (req, res) => {
        if (req.headers['x-no-compression']) return false;
        return compression.filter(req, res);
    },
}));

// ── Static Files ──
app.use(express.static(path.join(__dirname, '..', 'client'), {
    maxAge: config.isDev ? 0 : '31536000000',
    etag: true,
    immutable: !config.isDev,
    lastModified: true,
}));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// ── Template Engine (Nunjucks) ──
const viewsPath = path.join(__dirname, '..', 'client', 'views');
nunjucks.configure(viewsPath, {
    autoescape: true,
    express: app,
    watch: config.isDev,
    noCache: config.isDev,
});
app.set('view engine', 'njk');

// ── i18n Middleware ──
app.use(i18nMiddleware);

// ═══════════════════════════════════════════════
// API Routes — with global rate limit + SQL injection guard
// ═══════════════════════════════════════════════
app.use('/api', apiLimiter);           // Global DDoS layer-1
app.use('/api', sqlInjectionGuard);    // SQL injection detection

app.use('/api/auth',          require('./routes/auth.routes'));
app.use('/api/users',         require('./routes/user.routes'));
app.use('/api/services',      require('./routes/service.routes'));
app.use('/api/exhibitions',   require('./routes/exhibition.routes'));
app.use('/api/properties',    require('./routes/property.routes'));
app.use('/api/orders',        require('./routes/order.routes'));
app.use('/api/invoices',      require('./routes/invoice.routes'));
app.use('/api/notifications', require('./routes/notification.routes'));
app.use('/api/admin',         require('./routes/admin.routes'));
app.use('/api/contact',       require('./routes/contact.routes'));
app.use('/api/jobs',          require('./routes/job.routes'));
app.use('/api/portfolio',     require('./routes/portfolio.routes'));

// ── Health Check (no rate limit) ──
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Language Switch ──
app.get('/api/set-lang', (req, res) => {
    const lang = req.query.lang === 'ar' ? 'ar' : 'en';
    const redirect = req.query.redirect || '/';
    // Prevent open redirect — only allow relative paths
    const safePath = redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/';
    res.cookie('roya_lang', lang, {
        maxAge: 365 * 24 * 60 * 60 * 1000,
        httpOnly: false,
        secure: !config.isDev,
        sameSite: 'lax',
        path: '/',
    });
    res.redirect(safePath);
});

// ── Locales JSON ──
app.get('/api/locales/:lang', (req, res) => {
    const lang = req.params.lang === 'ar' ? 'ar' : 'en';
    const { languages } = require('./middlewares/i18n');
    res.json(languages[lang] || languages['en']);
});

// ═══════════════════════════════════════════════
// SEO & Frontend Page Routes
// ═══════════════════════════════════════════════
app.use(require('./routes/seo.routes'));
app.use(require('./routes/page.routes'));

// ── 404 Handler ──
app.use((req, res) => {
    if (req.path.startsWith('/api')) {
        return res.status(404).json({
            success: false,
            error: { code: 'NOT_FOUND', message: 'API endpoint not found.' },
        });
    }
    res.status(404).render('pages/404', {
        currentPath: req.path,
        pageDescription: 'Page not found',
    });
});

// ── Global Error Handler ──
app.use(errorHandler);

// ═══════════════════════════════════════════════
// Start Server & Graceful Shutdown
// ═══════════════════════════════════════════════
const PORT = config.port;

const server = app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════╗
║                 ROYA Platform                 ║
║   Server running on port ${PORT}                 ║
║   Environment: ${config.nodeEnv.padEnd(20)}       ║
╚═══════════════════════════════════════════════╝
  `);
});

const gracefulShutdown = async (signal) => {
    console.log(`\n⚠️  ${signal} received. Shutting down gracefully...`);
    server.close(async () => {
        try {
            await pool.end();
            console.log('📦 Database pool closed.');
        } catch (err) {
            console.error('Error closing pool:', err.message);
        }
        console.log('✅ Server shut down cleanly.');
        process.exit(0);
    });

    setTimeout(() => {
        console.error('⚠️  Forcing shutdown...');
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('uncaughtException', (err) => {
    console.error('💥 Uncaught Exception:', err);
    gracefulShutdown('uncaughtException');
});
process.on('unhandledRejection', (reason) => {
    console.error('💥 Unhandled Rejection:', reason);
    gracefulShutdown('unhandledRejection');
});

module.exports = app;
