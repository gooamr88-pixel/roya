// ═══════════════════════════════════════════════
// Page Routes — Nunjucks frontend page rendering
// ═══════════════════════════════════════════════
const router = require('express').Router();
const config = require('../config');

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
        ? 'منصة رؤيا | للحلول الرقمية والعقارات'
        : 'Roya Platform | Digital & Real Estate Solutions';

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
    });
};

// ── Frontend Pages ──
router.get('/',               seo('index',          'meta.description'));
router.get('/login',          seo('login',          'login.welcomeDesc'));
router.get('/register',       seo('register',       'register.welcomeDesc'));
router.get('/reset-password', seo('reset-password', 'resetPassword.welcomeDesc'));
router.get('/dashboard',      seo('dashboard',      'meta.description'));
router.get('/admin',          seo('admin',          'meta.description'));
router.get('/services',       seo('services',       'servicesPage.desc'));
router.get('/jobs',           seo('jobs',           'jobsPage.desc'));
router.get('/properties',     seo('properties',     'propertiesPage.desc'));
router.get('/exhibitions',    seo('exhibitions',    'exhibitionsPage.desc'));
router.get('/portfolio',      seo('portfolio',      'portfolio.desc'));
router.get('/banned',         seo('banned',         'meta.description'));

// ── Arabic shortcut ──
router.get('/ar', (req, res) => {
    res.cookie('roya_lang', 'ar', {
        maxAge: 365 * 24 * 60 * 60 * 1000,
        httpOnly: false,
        secure: !config.isDev,
        sameSite: 'lax',
        path: '/',
    });
    res.redirect('/');
});

module.exports = router;
