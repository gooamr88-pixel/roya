// ═══════════════════════════════════════════════
// SEO Routes — robots.txt & sitemap.xml
// ═══════════════════════════════════════════════
const router = require('express').Router();
const config = require('../config');

router.get('/robots.txt', (req, res) => {
    const siteUrl = config.baseUrl || 'https://roya-advertising.com';
    res.type('text/plain').send(
        `User-agent: *
Allow: /

Disallow: /api/
Disallow: /dashboard
Disallow: /admin

Sitemap: ${siteUrl}/sitemap.xml`
    );
});

router.get('/sitemap.xml', (req, res) => {
    const base = config.baseUrl || 'https://roya-advertising.com';
    const pages = [
        { path: '/', priority: '1.0', freq: 'weekly' },
        { path: '/services', priority: '0.9', freq: 'weekly' },
        { path: '/properties', priority: '0.9', freq: 'weekly' },
        { path: '/exhibitions', priority: '0.8', freq: 'weekly' },
        { path: '/portfolio', priority: '0.8', freq: 'weekly' },
        { path: '/jobs', priority: '0.7', freq: 'weekly' },
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

module.exports = router;
