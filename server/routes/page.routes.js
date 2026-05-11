// ═══════════════════════════════════════════════
// Page Routes — Nunjucks frontend page rendering
// ═══════════════════════════════════════════════
const router = require('express').Router();
const config = require('../config');
const jwt = require('jsonwebtoken');

/**
 * SEO helper — renders a Nunjucks page with proper meta tags
 */
const seo = (pagePath, descKey) => (req, res) => {
    const t = res.locals.t;
    const lang = res.locals.lang;

    // Resolve description from translation files or fallback to default
    const desc = descKey.split('.').reduce((o, k) => o?.[k], t) || t.meta.description;

    // Dynamic SEO matching user request
    const pageTitle = lang === 'ar'
        ? 'منصة نبضة كابيتال جروب | للحلول الرقمية والعقارات'
        : 'Nabda Capital Group Platform | Digital & Real Estate Solutions';

    // Vercel sits behind a reverse proxy, so req.protocol is 'http' by default.
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const baseUrl = `${protocol}://${host}`;
    const pageImage = `${baseUrl}/opengraph-image.png`;

    res.render(`pages/${pagePath}`, {
        currentPath: `/${pagePath === 'index' ? '' : pagePath}`,
        pageDescription: desc,
        pageTitle,
        pageImage,
        isHomePage: pagePath === 'index',
    });
};

/**
 * FIX (C10): Server-side auth guard for protected page routes.
 * Prevents serving the full admin/dashboard HTML to unauthenticated visitors.
 * Uses lightweight JWT cookie check (no DB hit) — the full auth check still
 * happens client-side via API.get('/auth/me') for role verification.
 */
const requireAuthPage = (req, res, next) => {
    const token = req.cookies?.access_token;
    if (!token) {
        return res.redirect('/login');
    }
    try {
        jwt.verify(token, config.jwt.accessSecret, {
            algorithms: ['HS256'],
            issuer: 'roya-platform',
            audience: 'roya-api',
        });
        next();
    } catch {
        // Token expired or invalid — redirect to login
        return res.redirect('/login');
    }
};

// ── Frontend Pages ──
router.get('/',               seo('index',          'meta.description'));
router.get('/login',          seo('login',          'login.welcomeDesc'));
router.get('/register',       seo('register',       'register.welcomeDesc'));
router.get('/reset-password', seo('reset-password', 'resetPassword.welcomeDesc'));
router.get('/dashboard',      requireAuthPage, seo('dashboard', 'meta.description'));
router.get('/admin',          requireAuthPage, seo('admin',     'meta.description'));
router.get('/services',       seo('services',       'servicesPage.desc'));
router.get('/jobs',           seo('jobs',           'jobsPage.desc'));
router.get('/properties',     seo('properties',     'propertiesPage.desc'));
router.get('/exhibitions',    seo('exhibitions',    'exhibitionsPage.desc'));
router.get('/portfolio',      seo('portfolio',      'portfolio.desc'));
router.get('/banned',         seo('banned',         'meta.description'));

// ── Arabic shortcut ──
router.get('/ar', (req, res) => {
    res.cookie('nabda_lang', 'ar', {
        maxAge: 365 * 24 * 60 * 60 * 1000,
        httpOnly: false,
        secure: !config.isDev,
        sameSite: 'lax',
        path: '/',
    });
    res.redirect('/');
});

module.exports = router;
