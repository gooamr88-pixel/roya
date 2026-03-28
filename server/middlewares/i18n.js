// ═══════════════════════════════════════════════
// i18n Middleware — Language Detection & Injection
// ═══════════════════════════════════════════════
const path = require('path');

// Pre-load language files at startup (not on every request)
const languages = {
    en: require('../i18n/en.json'),
    ar: require('../i18n/ar.json'),
};

const SUPPORTED_LANGS = Object.keys(languages);
const DEFAULT_LANG = 'en';

/**
 * Middleware: Detect language from cookie and inject `t` (translations)
 * into res.locals so every Nunjucks template can use {{ t.nav.home }} etc.
 */
const i18nMiddleware = (req, res, next) => {
    // 1. Detect language from cookie (set by /api/set-lang)
    const cookieLang = req.cookies?.nabda_lang;
    const lang = SUPPORTED_LANGS.includes(cookieLang) ? cookieLang : DEFAULT_LANG;

    // 2. Set direction and language metadata
    const isRTL = lang === 'ar';

    // 3. Inject into res.locals (available in all templates automatically)
    res.locals.lang = lang;
    res.locals.dir = isRTL ? 'rtl' : 'ltr';
    res.locals.isRTL = isRTL;
    res.locals.t = languages[lang];

    // 4. Logo — unified transparent SVG (contains both Arabic & English)
    res.locals.logoSrc = '/images/nabda-logo-transparent.svg';
    res.locals.logoAlt = isRTL ? 'نَبضَة' : 'Nabda';

    // brandTextSrc kept for backward compatibility
    res.locals.brandTextSrc = '/images/nabda-logo-transparent.svg';

    // Brand name: Arabic uses calligraphic SVG from logo, English uses text
    res.locals.brandNameIsImage = isRTL;
    res.locals.brandNameSrc = '/images/nabda-text-ar.svg';

    // 5. Language toggle data (switch to the OTHER language)
    res.locals.langToggle = languages[lang].langToggle;

    // 6. SEO: Base URL for canonical, OG, hreflang tags
    const proto = req.protocol;
    const host = req.get('host');
    res.locals.baseUrl = host.includes('localhost') || host.includes('127.0.0.1')
        ? `${proto}://${host}`
        : 'https://roya-advertising.com';

    next();
};

module.exports = { i18nMiddleware, languages, SUPPORTED_LANGS };
