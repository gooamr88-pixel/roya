// ═══════════════════════════════════════════════
// Express Server — Main Entry Point
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

const app = express();

// ── Disable X-Powered-By (belt-and-suspenders with Helmet) ──
app.disable('x-powered-by');

// ── Security Middleware ──
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: [
                "'self'",
                "'unsafe-inline'",                                          // Required: inline onclick handlers in generated HTML
                "https://cdn.jsdelivr.net",                                 // intl-tel-input utils
                "https://cdnjs.cloudflare.com",                             // Font Awesome (if loaded as JS)
                "https://cdn.jsdelivr.net/npm/apexcharts",                  // ApexCharts (admin dashboard)
            ],
            styleSrc: [
                "'self'",
                "'unsafe-inline'",                                          // Required: inline styles in JS-generated HTML
                "https://fonts.googleapis.com",                             // Google Fonts
                "https://cdnjs.cloudflare.com",                             // Font Awesome CSS
                "https://cdn.jsdelivr.net",                                 // intl-tel-input CSS
            ],
            imgSrc: [
                "'self'",
                "data:",                                                    // Base64 image previews
                "https://images.unsplash.com",                              // Hero & placeholder images
                "https://res.cloudinary.com",                               // Uploaded images (Cloudinary)
                "https://flagcdn.com",                                      // Language toggle flags
                "https://cdnjs.cloudflare.com",                             // intl-tel-input flag sprites
            ],
            fontSrc: [
                "'self'",
                "https://fonts.gstatic.com",                                // Google Fonts files
                "https://cdnjs.cloudflare.com",                             // Font Awesome font files
            ],
            connectSrc: [
                "'self'",                                                   // API calls (same-origin)
            ],
            scriptSrcAttr: ["'unsafe-inline'"],                             // Required: inline onclick= handlers in JS-generated card HTML
            frameSrc: ["'none'"],                                            // No iframes allowed
            objectSrc: ["'none'"],                                           // No plugins (Flash, Java)
            baseUri: ["'self'"],                                             // Prevent base tag hijacking
            formAction: ["'self'"],                                          // Forms only submit to self
        },
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    permissionsPolicy: {
        features: {
            camera: ["'none'"],
            microphone: ["'none'"],
            geolocation: ["'self'"],
        },
    },
}));






// قائمة الروابط المسموح ليها تكلم السيرفر
const allowedOrigins = [
    'http://localhost:3000', // عشان لو بتجرب على جهازك
    'http://localhost:5000',
    'https://roya-two.vercel.app' // اللينك بتاع الإنتاج (Production)
];

// لو عندك لينك تاني في الـ env ضيفه برضه
if (process.env.CLIENT_URL) {
    allowedOrigins.push(process.env.CLIENT_URL);
}

const corsOptions = {
    origin: function (origin, callback) {
        // بنسمح للروابط اللي في القائمة، أو الطلبات اللي من غير Origin (زي البوستمان)
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('CORS Error: Origin not allowed'));
        }
    },
    credentials: true, // مهمة جداً عشان الـ Cookies والـ Login يشتغلوا
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));




// ── Body Parsing ──
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// ── Request Logger ──
app.use(logger);

// ── Gzip Compression ──
app.use(compression({
    level: 6,                    // balanced speed vs compression ratio
    threshold: 1024,             // skip responses smaller than 1 KB
    filter: (req, res) => {      // compress text-based responses
        if (req.headers['x-no-compression']) return false;
        return compression.filter(req, res);
    },
}));

// ── Static Files ──
app.use(express.static(path.join(__dirname, '..', 'client'), {
    maxAge: config.isDev ? 0 : '31536000000',   // 1 year in ms for production
    etag: true,
    immutable: !config.isDev,                     // browser won't revalidate
    lastModified: true,
}));

// Serve uploaded files (local dev fallback)
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// ── Template Engine (Nunjucks) ──
const viewsPath = path.join(__dirname, '..', 'client', 'views');
nunjucks.configure(viewsPath, {
    autoescape: true,
    express: app,
    watch: config.isDev,      // Auto-reload templates in dev
    noCache: config.isDev,    // No cache in dev
});
app.set('view engine', 'njk');

// ── i18n Middleware (injects lang, dir, t into all templates) ──
app.use(i18nMiddleware);

// ── API Routes ──
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const serviceRoutes = require('./routes/service.routes');
const exhibitionRoutes = require('./routes/exhibition.routes');
const propertyRoutes = require('./routes/property.routes');
const orderRoutes = require('./routes/order.routes');
const invoiceRoutes = require('./routes/invoice.routes');
const notificationRoutes = require('./routes/notification.routes');
const adminRoutes = require('./routes/admin.routes');
const contactRoutes = require('./routes/contact.routes');

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/exhibitions', exhibitionRoutes);
app.use('/api/properties', propertyRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/contact', contactRoutes);

// ── Health Check ──
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Language Switch Endpoint ──
app.get('/api/set-lang', (req, res) => {
    const lang = req.query.lang === 'ar' ? 'ar' : 'en';
    const redirect = req.query.redirect || '/';
    // Validate redirect is a relative path (prevent open redirect)
    const safePath = redirect.startsWith('/') ? redirect : '/';
    res.cookie('roya_lang', lang, {
        maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
        httpOnly: false, // Allow client JS to read if needed
        secure: !config.isDev, // Require HTTPS in production
        sameSite: 'lax',
        path: '/'
    });
    res.redirect(safePath);
});

// ── Locales JSON Endpoint (For SPA Seamless Switch) ──
app.get('/api/locales/:lang', (req, res) => {
    const lang = req.params.lang === 'ar' ? 'ar' : 'en';
    const { languages } = require('./middlewares/i18n');
    res.json(languages[lang] || languages['en']);
});

// ═══════════════════════════════════════════════
// SEO Routes — robots.txt & sitemap.xml
// ═══════════════════════════════════════════════
app.get('/robots.txt', (req, res) => {
    res.type('text/plain').send(
        `User-agent: *
Allow: /

Disallow: /api/
Disallow: /dashboard
Disallow: /admin

Sitemap: https://roya-advertising.com/sitemap.xml`
    );
});

app.get('/sitemap.xml', (req, res) => {
    const base = 'https://roya-advertising.com';
    const pages = [
        { path: '/', priority: '1.0', freq: 'weekly' },
        { path: '/services', priority: '0.9', freq: 'weekly' },
        { path: '/properties', priority: '0.9', freq: 'weekly' },
        { path: '/exhibitions', priority: '0.8', freq: 'weekly' },
        { path: '/login', priority: '0.5', freq: 'monthly' },
        { path: '/register', priority: '0.5', freq: 'monthly' },
    ];
    const today = new Date().toISOString().split('T')[0];

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n`;
    xml += `        xmlns:xhtml="http://www.w3.org/1999/xhtml">\n`;
    for (const p of pages) {
        xml += `  <url>\n`;
        xml += `    <loc>${base}${p.path}</loc>\n`;
        xml += `    <lastmod>${today}</lastmod>\n`;
        xml += `    <changefreq>${p.freq}</changefreq>\n`;
        xml += `    <priority>${p.priority}</priority>\n`;
        xml += `    <xhtml:link rel="alternate" hreflang="en" href="${base}${p.path}" />\n`;
        xml += `    <xhtml:link rel="alternate" hreflang="ar" href="${base}${p.path}" />\n`;
        xml += `  </url>\n`;
    }
    xml += `</urlset>`;
    res.type('application/xml').send(xml);
});

// ═══════════════════════════════════════════════
// Frontend Page Routes — ALL Nunjucks (i18n auto)
// Each route passes: currentPath (for canonical/hreflang)
//                     pageDescription (for per-page meta)
// ═══════════════════════════════════════════════
const seo = (path, descKey) => (req, res) => {
    const t = res.locals.t;
    const lang = res.locals.lang;

    // Resolve description from translation files or fallback to default
    const desc = descKey.split('.').reduce((o, k) => o?.[k], t) || t.meta.description;

    // Dynamic SEO matching user request
    const pageTitle = lang === 'ar'
        ? 'منصة رؤيا | للحلول الرقمية والعقارات'
        : 'Roya Platform | Digital & Real Estate Solutions';

    // Vercel sits behind a reverse proxy, so req.protocol is 'http' by default.
    // We must read the x-forwarded proto/host headers to generate a valid https:// absolute URL.
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const baseUrl = `${protocol}://${host}`;

    const pageImage = `${baseUrl}/opengraph-image.png`;

    res.render(`pages/${path}`, {
        currentPath: `/${path === 'index' ? '' : path}`,
        pageDescription: desc,
        pageTitle,
        pageImage
    });
};

app.get('/', seo('index', 'meta.description'));
app.get('/login', seo('login', 'login.welcomeDesc'));
app.get('/register', seo('register', 'register.welcomeDesc'));
app.get('/reset-password', seo('reset-password', 'resetPassword.welcomeDesc'));
app.get('/dashboard', seo('dashboard', 'meta.description'));
app.get('/admin', seo('admin', 'meta.description'));
app.get('/services', seo('services', 'servicesPage.desc'));
app.get('/properties', seo('properties', 'propertiesPage.desc'));
app.get('/exhibitions', seo('exhibitions', 'exhibitionsPage.desc'));
app.get('/banned', seo('banned', 'meta.description'));

app.get('/ar', (req, res) => {
    res.cookie('roya_lang', 'ar', {
        maxAge: 365 * 24 * 60 * 60 * 1000,
        httpOnly: false,
        secure: !config.isDev, // Require HTTPS in production
        sameSite: 'lax',
        path: '/'
    });
    res.redirect('/');
});

// ── 404 Handler ──
app.use((req, res) => {
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: 'API endpoint not found' });
    }
    // Render a dedicated 404 page — NOT the homepage
    res.status(404).render('pages/404', {
        currentPath: req.path,
        pageDescription: 'Page not found',
    });
});

// ── Global Error Handler ──
app.use(errorHandler);

// ── Start Server ──
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

// ── Graceful Shutdown ──
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

    // Force close after 10 seconds
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
});

module.exports = app;
