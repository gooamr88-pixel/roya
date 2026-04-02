// ═══════════════════════════════════════════════
// Express App — Configuration & Middleware
//
// Exports the configured Express app WITHOUT calling listen().
// This is the standard pattern for Supertest integration testing.
// The actual server startup is in server.js.
// ═══════════════════════════════════════════════
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const path = require('path');
const nunjucks = require('nunjucks');
const config = require('./config');
const errorHandler = require('./middlewares/errorHandler');
const requestLogger = require('./middlewares/logger');
const { i18nMiddleware } = require('./middlewares/i18n');
const { apiLimiter } = require('./middlewares/rateLimiter');
const { requestId, sanitizeInput, sqlInjectionGuard, hppProtection } = require('./middlewares/security');
const { maintenanceMiddleware } = require('./middlewares/maintenance');
const winstonLogger = require('./utils/logger');

const app = express();

// ── Trust first proxy (Vercel, Nginx, Cloudflare) ──
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
                "https://connect.facebook.net",
                "https://sc-static.net",
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
                "https://www.facebook.com",
                "https://tr.snapchat.com",
                "https://ct.snap.com",
            ],
            fontSrc: [
                "'self'",
                "https://fonts.gstatic.com",
                "https://cdnjs.cloudflare.com",
            ],
            connectSrc: [
                "'self'",
                "https://www.facebook.com",
                "https://tr.snapchat.com",
                "https://ct.snap.com",
            ],
            scriptSrcAttr: ["'unsafe-inline'"],
            frameSrc: ["'none'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
        },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hsts: config.isDev
        ? false
        : { maxAge: 31536000, includeSubDomains: true, preload: true },
    noSniff: true,
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
// CORS — Config-driven
// ═══════════════════════════════════════════════
const allowedOrigins = config.isDev
    ? ['http://localhost:3000', 'http://localhost:5000', ...config.security.allowedOrigins]
    : config.security.allowedOrigins;

const uniqueOrigins = [...new Set(allowedOrigins.map(o => o.trim()).filter(Boolean))];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (uniqueOrigins.includes(origin)) {
            callback(null, true);
        } else {
            winstonLogger.warn('CORS blocked origin', { origin });
            callback(new Error('CORS Error: Origin not allowed'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
    maxAge: 86400,
}));

// ═══════════════════════════════════════════════
// Body Parsing
// ═══════════════════════════════════════════════
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());

// ═══════════════════════════════════════════════
// Security Middleware Chain
// ═══════════════════════════════════════════════
app.use(sanitizeInput);
app.use(hppProtection);

// ── Maintenance Mode Gate (must be after cookie-parser) ──
app.use(maintenanceMiddleware);

// ── Request Logger ──
app.use(requestLogger);

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
app.use('/api', apiLimiter);
app.use('/api', sqlInjectionGuard);

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
app.use('/api/ai',            require('./routes/ai.routes'));

// ── Health Check with DB Connectivity ──
app.get('/api/health', async (req, res) => {
    const { pool } = require('./config/database');
    const maxRetries = 2;
    let dbStatus = 'disconnected';
    let dbError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            await pool.query('SELECT 1');
            dbStatus = 'connected';
            break;
        } catch (err) {
            dbError = err.message;
            if (attempt < maxRetries) {
                await new Promise(r => setTimeout(r, 1000));
            }
        }
    }

    const status = dbStatus === 'connected' ? 'ok' : 'degraded';
    const statusCode = dbStatus === 'connected' ? 200 : 503;

    res.status(statusCode).json({
        status,
        timestamp: new Date().toISOString(),
        db: dbStatus,
        ...(dbError && { dbError }),
    });
});

// ── Language Switch ──
app.get('/api/set-lang', (req, res) => {
    const lang = req.query.lang === 'ar' ? 'ar' : 'en';
    const redirect = req.query.redirect || '/';
    const safePath = redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/';
    res.cookie('nabda_lang', lang, {
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

module.exports = app;
