// ═══════════════════════════════════════════════
// i18n Seamless SPA Switcher — FIXED v2.1
// Root-cause fixes:
//   1. isRTL → isRtl (was throwing ReferenceError)
//   2. Removed fire-and-forget fetch race (cookie already set)
// ═══════════════════════════════════════════════

async function switchLanguageSeamlessly(targetLang) {
    try {
        // As per user request, always force a hard reload when switching languages
        const currentPath = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = `/api/set-lang?lang=${targetLang}&redirect=${currentPath}`;
    } catch (err) {
        console.error('Failed to switch language:', err);
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
