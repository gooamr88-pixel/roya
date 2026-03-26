// ═══════════════════════════════════════════════
// NABDA ONBOARDING TOUR — Lightweight, Custom
// Uses localStorage to track completion.
// Auto-starts on first dashboard visit.
// ═══════════════════════════════════════════════

(function () {
    'use strict';

    const STORAGE_KEY = 'nabda_onboarded';

    // Don't run if already completed or no dashboard context
    if (localStorage.getItem(STORAGE_KEY)) return;
    if (!document.getElementById('view-overview')) return;

    const dt = window.__dt || {};

    const STEPS = [
        {
            selector: '#statsGrid',
            icon: 'fa-chart-line',
            title: dt.tourStatsTitle || 'Your Overview',
            desc: dt.tourStatsDesc || 'See your active orders, completed projects, and spending at a glance.',
            position: 'bottom',
        },
        {
            selector: '.sidebar-nav',
            icon: 'fa-compass',
            title: dt.tourSidebarTitle || 'Navigation',
            desc: dt.tourSidebarDesc || 'Use the sidebar to switch between orders, services, and more.',
            position: 'right',
        },
        {
            selector: '[data-view="services"]',
            icon: 'fa-concierge-bell',
            title: dt.tourServicesTitle || 'Browse Services',
            desc: dt.tourServicesDesc || 'Explore our services and place orders with a single click.',
            position: 'right',
        },
        {
            selector: '[data-view="notifications"]',
            icon: 'fa-bell',
            title: dt.tourNotifTitle || 'Notifications',
            desc: dt.tourNotifDesc || 'Stay updated on order status changes and important announcements.',
            position: 'bottom',
        },
        {
            selector: '[data-view="profile"]',
            icon: 'fa-user-cog',
            title: dt.tourProfileTitle || 'Your Profile',
            desc: dt.tourProfileDesc || 'Manage your personal information and security settings here.',
            position: 'right',
        },
    ];

    let currentStep = -1; // -1 = welcome screen
    let overlayEl, spotlightEl, tooltipEl, welcomeEl;

    function init() {
        // Wait a bit for the dashboard to fully load
        setTimeout(start, 1500);
    }

    function start() {
        createOverlay();
        showWelcome();
    }

    function createOverlay() {
        // Overlay container
        overlayEl = document.createElement('div');
        overlayEl.className = 'tour-overlay';
        overlayEl.innerHTML = '<div class="tour-overlay-bg"></div>';

        // Spotlight
        spotlightEl = document.createElement('div');
        spotlightEl.className = 'tour-spotlight';

        // Tooltip
        tooltipEl = document.createElement('div');
        tooltipEl.className = 'tour-tooltip';

        overlayEl.appendChild(spotlightEl);
        overlayEl.appendChild(tooltipEl);
        document.body.appendChild(overlayEl);
    }

    function showWelcome() {
        welcomeEl = document.createElement('div');
        welcomeEl.className = 'tour-welcome';
        welcomeEl.innerHTML = `
            <div class="tour-welcome-card">
                <span class="tour-welcome-emoji">👋</span>
                <div class="tour-welcome-title">${esc(dt.tourWelcomeTitle || 'Welcome to Nabda!')}</div>
                <div class="tour-welcome-desc">${esc(dt.tourWelcomeDesc || 'Let us give you a quick tour of your dashboard.')}</div>
                <div class="tour-welcome-actions">
                    <button class="tour-btn-next" id="tourStartBtn">
                        ${esc(dt.tourNext || 'Next')} <i class="fas fa-arrow-right"></i>
                    </button>
                    <button class="tour-btn-skip" id="tourSkipWelcome">
                        ${esc(dt.tourSkip || 'Skip Tour')}
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(welcomeEl);

        requestAnimationFrame(() => welcomeEl.classList.add('visible'));

        document.getElementById('tourStartBtn').addEventListener('click', () => {
            welcomeEl.classList.remove('visible');
            setTimeout(() => {
                welcomeEl.remove();
                overlayEl.classList.add('active');
                goToStep(0);
            }, 300);
        });

        document.getElementById('tourSkipWelcome').addEventListener('click', () => {
            completeTour();
        });
    }

    function goToStep(idx) {
        if (idx >= STEPS.length) { completeTour(); return; }
        currentStep = idx;
        const step = STEPS[idx];
        const target = document.querySelector(step.selector);

        if (!target) {
            // Skip this step if element not found
            goToStep(idx + 1);
            return;
        }

        // Position spotlight
        const rect = target.getBoundingClientRect();
        const pad = 8;
        spotlightEl.style.top = (rect.top - pad) + 'px';
        spotlightEl.style.left = (rect.left - pad) + 'px';
        spotlightEl.style.width = (rect.width + pad * 2) + 'px';
        spotlightEl.style.height = (rect.height + pad * 2) + 'px';

        // Build tooltip
        const isLast = idx === STEPS.length - 1;
        tooltipEl.classList.remove('visible');
        tooltipEl.innerHTML = `
            <div class="tour-tooltip-header">
                <div class="tour-tooltip-icon"><i class="fas ${step.icon}"></i></div>
                <div class="tour-tooltip-title">${esc(step.title)}</div>
            </div>
            <div class="tour-tooltip-desc">${esc(step.desc)}</div>
            <div class="tour-tooltip-footer">
                <div class="tour-progress">
                    ${STEPS.map((_, i) => `<div class="tour-progress-dot ${i === idx ? 'active' : ''}"></div>`).join('')}
                </div>
                <div class="tour-actions">
                    <button class="tour-btn-skip" id="tourSkipBtn">${esc(dt.tourSkip || 'Skip')}</button>
                    <button class="tour-btn-next" id="tourNextBtn">${esc(isLast ? (dt.tourFinish || 'Get Started!') : (dt.tourNext || 'Next'))} ${isLast ? '<i class="fas fa-check"></i>' : '<i class="fas fa-arrow-right"></i>'}</button>
                </div>
            </div>
        `;

        // Position tooltip
        positionTooltip(rect, step.position);

        requestAnimationFrame(() => tooltipEl.classList.add('visible'));

        // Event listeners
        document.getElementById('tourNextBtn').addEventListener('click', () => goToStep(idx + 1));
        document.getElementById('tourSkipBtn').addEventListener('click', () => completeTour());
    }

    function positionTooltip(targetRect, preferredPos) {
        const tooltipWidth = 340;
        const gap = 16;
        let top, left;

        if (preferredPos === 'bottom') {
            top = targetRect.bottom + gap;
            left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
        } else if (preferredPos === 'right') {
            top = targetRect.top;
            left = targetRect.right + gap;
        } else if (preferredPos === 'left') {
            top = targetRect.top;
            left = targetRect.left - tooltipWidth - gap;
        } else {
            top = targetRect.top - gap;
            left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
        }

        // Keep within viewport
        left = Math.max(16, Math.min(left, window.innerWidth - tooltipWidth - 16));
        top = Math.max(16, top);

        tooltipEl.style.top = top + 'px';
        tooltipEl.style.left = left + 'px';
    }

    function completeTour() {
        localStorage.setItem(STORAGE_KEY, 'true');
        if (welcomeEl) { welcomeEl.classList.remove('visible'); setTimeout(() => welcomeEl.remove(), 300); }
        if (overlayEl) {
            overlayEl.classList.remove('active');
            tooltipEl.classList.remove('visible');
            setTimeout(() => overlayEl.remove(), 400);
        }
    }

    // ── Kick off on DOMContentLoaded ──
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
