// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Maintenance Mode Middleware â€” Admin Bypass via Cookie
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Activates when MAINTENANCE_MODE=true in .env
// Bypass: visit /?dev_bypass=YOUR_SECRET_KEY to set cookie
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

const BYPASS_COOKIE = 'nabda_dev_bypass';
const BYPASS_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

// Routes that should NEVER be blocked (static assets, health check)
const PASSTHROUGH_PREFIXES = [
    '/css/',
    '/js/',
    '/images/',
    '/fonts/',
    '/uploads/',
    '/api/health',
    '/maintenance',
];

/**
 * Express middleware that blocks all traffic when maintenance mode is on,
 * UNLESS the request carries a valid bypass cookie.
 *
 * To activate:   Set MAINTENANCE_MODE=true in .env
 * To bypass:     Visit any page with ?dev_bypass=<MAINTENANCE_BYPASS_KEY value>
 * To deactivate: Set MAINTENANCE_MODE=false (or remove it)
 */
const maintenanceMiddleware = (req, res, next) => {
    // â”€â”€ 1. Check if maintenance mode is enabled â”€â”€
    const isMaintenanceOn = process.env.MAINTENANCE_MODE === 'true';
    if (!isMaintenanceOn) return next();

    // â”€â”€ 2. Allow static assets & health check through â”€â”€
    const isPassthrough = PASSTHROUGH_PREFIXES.some(prefix =>
        req.path.startsWith(prefix) || req.path === '/favicon.ico'
    );
    if (isPassthrough) return next();

    // â”€â”€ 3. Handle bypass activation via query parameter â”€â”€
    const bypassSecret = process.env.MAINTENANCE_BYPASS_KEY;
    if (bypassSecret && req.query.dev_bypass === bypassSecret) {
        res.cookie(BYPASS_COOKIE, bypassSecret, {
            maxAge: BYPASS_MAX_AGE,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
        });
        // Redirect to the same path without the query param (clean URL)
        const cleanUrl = req.path || '/';
        return res.redirect(cleanUrl);
    }

    // â”€â”€ 4. Check if bypass cookie is present & valid â”€â”€
    if (bypassSecret && req.cookies?.[BYPASS_COOKIE] === bypassSecret) {
        return next(); // Developer bypass â€” let through
    }

    // â”€â”€ 5. Block all other traffic â”€â”€
    if (req.path.startsWith('/api')) {
        return res.status(503).json({
            success: false,
            error: {
                code: 'SERVICE_UNAVAILABLE',
                message: 'Nabda Capital Group Platform is currently undergoing scheduled maintenance. Please try again later.',
            },
        });
    }

    // Render the maintenance page
    return res.status(503).render('pages/maintenance', {
        pageTitle: 'Maintenance | Nabda Capital Group Platform',
        pageDescription: 'We are currently performing scheduled maintenance.',
    });
};

module.exports = { maintenanceMiddleware, BYPASS_COOKIE };

