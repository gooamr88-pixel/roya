// ═══════════════════════════════════════════════
// i18n Seamless SPA Switcher
// ═══════════════════════════════════════════════

async function switchLanguageSeamlessly(targetLang) {
    try {
        // 1. Fetch locale JSON
        const res = await fetch(`/api/locales/${targetLang}`);
        if (!res.ok) throw new Error('Failed to load translations');
        const translations = await res.json();

        // 2. Set Cookie (persists choice for future SSR loads)
        document.cookie = `roya_lang=${targetLang}; path=/; max-age=31536000; samesite=lax`;

        // Ping backend to set session / httpOnly cookies if needed
        fetch(`/api/set-lang?lang=${targetLang}`);

        // 3. Update DOM DIR and Lang attributes
        const isRtl = targetLang === 'ar';
        document.documentElement.lang = targetLang;
        document.documentElement.dir = isRtl ? 'rtl' : 'ltr';

        // 4. Update texts dynamically based on [data-i18n]
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const keys = el.getAttribute('data-i18n').split('.');
            let val = translations;
            keys.forEach(k => { val = val?.[k] });

            if (val && typeof val === 'string') {
                if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                    if (el.placeholder) el.placeholder = val;
                    else el.value = val;
                } else {
                    if (el.hasAttribute('data-i18n-html')) {
                        el.innerHTML = val;
                    } else if (el.hasAttribute('data-i18n-prefix')) {
                        const prefix = el.getAttribute('data-i18n-prefix');
                        el.innerHTML = prefix + val;
                    } else {
                        el.innerHTML = val; // allows safe innerHTML like <span> or <i> replacing
                    }
                }
            }
        });

        // 5. Update Logos
        const logos = document.querySelectorAll('img[src*="/images/logo"]');
        logos.forEach(logo => {
            logo.src = isRtl ? '/images/logo-ar.svg' : '/images/logo.svg';
            logo.alt = isRtl ? 'رؤيا' : 'ROYA';
        });

        // 6. Inject RTL CSS or disable it
        if (isRtl) {
            if (!document.querySelector('link[href="/css/rtl.css"]')) {
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = '/css/rtl.css';
                // Insert right after main.css to override safely
                const mainCss = document.querySelector('link[href="/css/main.css"]');
                if (mainCss) {
                    mainCss.parentNode.insertBefore(link, mainCss.nextSibling);
                } else {
                    document.head.appendChild(link);
                }
            }
        } else {
            const rtlLink = document.querySelector('link[href="/css/rtl.css"]');
            if (rtlLink) rtlLink.remove();
        }

        // 7. Swap the toggle button attributes for the NEXT switch
        const toggles = document.querySelectorAll('.lang-toggle');
        toggles.forEach(toggle => {
            const nextLang = targetLang === 'ar' ? 'en' : 'ar';
            toggle.setAttribute('data-target-lang', nextLang);
            const img = toggle.querySelector('img');
            if (img) {
                img.src = targetLang === 'ar' ? 'https://flagcdn.com/w40/us.png' : 'https://flagcdn.com/w40/sa.png';
                img.alt = targetLang === 'ar' ? 'English' : 'العربية';
            }
            toggle.title = targetLang === 'ar' ? 'English' : 'العربية';

            // Re-write the native href as fallback
            const oldHref = new URL(toggle.href, window.location.origin);
            oldHref.searchParams.set('lang', nextLang);
            toggle.href = oldHref.toString();
        });

    } catch (err) {
        console.error('Failed to switch language seamlessly:', err);
        // Silently fallback to classic hard reload if the fetch failed
        window.location.href = `/api/set-lang?lang=${targetLang}&redirect=${window.location.pathname}`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.body.addEventListener('click', (e) => {
        const toggle = e.target.closest('.lang-toggle');
        if (toggle) {
            e.preventDefault();
            const href = toggle.getAttribute('href') || '';
            // Determine target language:
            // 1. From our runtime data attribute, OR 2. from the native query param
            let targetLang = toggle.getAttribute('data-target-lang');
            if (!targetLang) {
                targetLang = href.includes('lang=ar') ? 'ar' : 'en';
            }
            switchLanguageSeamlessly(targetLang);
        }
    });
});
