// ═══════════════════════════════════════════════
// Landing Page JS — Dynamic Data + Content Locking + Glassmorphism Modal
// ═══════════════════════════════════════════════

let landingUser = null; // Will be set if logged in

document.addEventListener('DOMContentLoaded', () => {
    initNavbar();
    initMobileMenu();
    initSlideshow();
    initContactMenu();
    initScrollAnimations();
    initCounterAnimation();
    initContactForm();
    checkLandingAuth();
    loadLandingServices();
    loadLandingJobs();
    loadLandingPortfolio();
    loadLandingExhibitions();
    initViewSwitcher();
});

// ── View Switcher (Tabbed Landing Page) ──
function initViewSwitcher() {
    const navLinks = document.querySelectorAll('.nav-links a[href^="#"], .mobile-menu a[href^="#"], .hero-buttons a[href^="#"]');
    const views = document.querySelectorAll('.landing-view');

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            const targetId = link.getAttribute('href').substring(1);
            const targetView = document.getElementById(targetId);

            if (targetView) {
                e.preventDefault();

                // Hide all views
                views.forEach(v => v.classList.remove('active'));

                // Show requested view
                targetView.classList.add('active');

                // Close mobile menu if open
                document.getElementById('mobileMenu')?.classList.remove('active');

                // Update active state on nav links
                document.querySelectorAll('.nav-links a').forEach(nav => nav.classList.remove('active'));
                document.querySelectorAll(`.nav-links a[href="#${targetId}"]`).forEach(nav => nav.classList.add('active'));

                // Reset scroll
                window.scrollTo(0, 0);
            }
        });
    });
}

// ── Check if user is logged in (for content gatekeeping + navbar swap) ──
async function checkLandingAuth() {
    try {
        const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
        if (res.ok) {
            const data = await res.json();
            landingUser = data.data?.user || null;
            if (landingUser) updateNavbarForAuth(landingUser);
        }
    } catch { /* Not logged in — that's fine */ }
}

function updateNavbarForAuth(user) {
    const isAr = document.documentElement.lang === 'ar';
    const isAdmin = ['super_admin', 'admin', 'supervisor'].includes(user.role);
    const dashUrl = isAdmin ? '/admin' : '/dashboard';
    const btnText = isAr ? 'الذهاب للوحة التحكم' : 'Go to Dashboard';

    // Desktop navbar — replace Sign In + Get Started buttons
    const navActions = document.querySelector('.nav-actions');
    if (navActions) {
        // Remove existing auth links (btn-outline "Sign In" and btn-primary "Get Started")
        navActions.querySelectorAll('a[href="/login"], a[href="/register"]').forEach(el => el.remove());
        // Insert dashboard button before the nav-toggle
        const toggle = navActions.querySelector('.nav-toggle');
        const dashBtn = document.createElement('a');
        dashBtn.href = dashUrl;
        dashBtn.className = 'btn btn-primary btn-sm';
        dashBtn.innerHTML = `<i class="fas fa-columns" style="margin-${isAr ? 'left' : 'right'}: 6px;"></i>${btnText}`;
        navActions.insertBefore(dashBtn, toggle);
    }

    // Mobile menu — replace auth links
    const mobileAuth = document.querySelector('.mobile-menu .mobile-auth');
    if (mobileAuth) {
        mobileAuth.innerHTML = `<a href="${dashUrl}" class="btn btn-primary btn-lg" style="width:100%;">
            <i class="fas fa-columns" style="margin-${isAr ? 'left' : 'right'}: 8px;"></i>${btnText}
        </a>`;
    }
}

// ── Navbar ──
function initNavbar() {
    const navbar = document.getElementById('navbar');
    window.addEventListener('scroll', () => {
        navbar.classList.toggle('scrolled', window.scrollY > 50);
    }, { passive: true });
}

// ── Slideshow ──
function initSlideshow() {
    const slides = document.querySelectorAll('.hero-slide');
    if (!slides.length) return;
    let current = 0;
    setInterval(() => {
        slides[current].classList.remove('active');
        current = (current + 1) % slides.length;
        slides[current].classList.add('active');
    }, 6000);
}

// ── Mobile Menu ──
function initMobileMenu() {
    const toggle = document.getElementById('navToggle');
    const menu = document.getElementById('mobileMenu');
    const close = document.getElementById('mobileClose');
    if (toggle && menu) {
        toggle.addEventListener('click', () => menu.classList.toggle('active'));
        close?.addEventListener('click', () => menu.classList.remove('active'));
        menu.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => menu.classList.remove('active'));
        });
    }
}

// ── Contact Menu Toggle (Mobile Friendly) ──
function initContactMenu() {
    const toggle = document.querySelector('.contact-toggle');
    const container = document.querySelector('.floating-contact');
    if (toggle && container) {
        // Toggle menu explicitly on click
        toggle.addEventListener('click', (e) => {
            e.preventDefault();
            container.classList.toggle('active');
        });

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!container.contains(e.target)) {
                container.classList.remove('active');
            }
        });
    }
}


// ── Scroll Animations ──
function initScrollAnimations() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
    document.querySelectorAll('.fade-in, .fade-in-left, .fade-in-right, .scale-in').forEach(el => observer.observe(el));
}

// ── Counter Animation ──
function initCounterAnimation() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const el = entry.target;
                animateCounter(el, parseInt(el.getAttribute('data-count')));
                observer.unobserve(el);
            }
        });
    }, { threshold: 0.5 });
    document.querySelectorAll('[data-count]').forEach(el => observer.observe(el));
}

function animateCounter(el, target) {
    const duration = 2000, startTime = performance.now();
    function update(t) {
        const progress = Math.min((t - startTime) / duration, 1);
        el.textContent = Math.round(target * (1 - Math.pow(1 - progress, 3))).toLocaleString() + '+';
        if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
}

// ── Contact Form (with CSRF Protection) ──
function initContactForm() {
    const form = document.getElementById('contactForm');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('contactName').value.trim();
        const email = document.getElementById('contactEmail').value.trim();
        const subject = document.getElementById('contactSubject').value.trim();
        const message = document.getElementById('contactMessage').value.trim();
        if (!name || !email || !message) { Toast.warning(i18n.t('Please fill in all required fields.', 'يرجى ملء جميع الحقول المطلوبة.')); return; }
        const btn = form.querySelector('button[type="submit"]');
        const original = btn.innerHTML;
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${i18n.t('Sending...', 'جارٍ الإرسال...')}`; btn.disabled = true;
        try {
            // Fetch CSRF token before submitting
            const csrfRes = await fetch('/api/contact/csrf-token', { credentials: 'include' });
            const csrfData = await csrfRes.json();
            const csrfToken = csrfData.csrfToken;

            await API.post('/contact', { name, email, subject, message }, {
                headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }
            });
            Toast.success(i18n.t('Message sent! We\'ll get back to you soon.', 'تم إرسال الرسالة! سنتواصل معك قريباً.'));
            form.reset();
        } catch (err) { Toast.error(err.message || i18n.t('Failed to send message.', 'فشل في إرسال الرسالة.')); }
        finally { btn.innerHTML = original; btn.disabled = false; }
    });
}

// ══════════════════════════════════════════
//  HELPERS (shared esc, fmtPrice, getImageUrl now in utils.js)
// ══════════════════════════════════════════


// ══════════════════════════════════════════
//  CONTENT LOCKING — Auth Gateway
// ══════════════════════════════════════════
function handleServiceClick(serviceData) {
    if (!landingUser) {
        // Not logged in → redirect with message
        sessionStorage.setItem('loginMessage', i18n.t('Please login to view details and request services.', 'يرجى تسجيل الدخول لعرض التفاصيل وطلب الخدمات.'));
        window.location.href = '/login';
        return;
    }
    // Logged in → show glassmorphism detail modal
    openServiceDetailModal(serviceData);
}

// ══════════════════════════════════════════
//  GLASSMORPHISM SERVICE DETAIL MODAL
// ══════════════════════════════════════════
async function openServiceDetailModal(service) {
    // Remove existing modal if any
    document.getElementById('serviceDetailModal')?.remove();

    const img = getImageUrl(service.images, 'https://images.unsplash.com/photo-1557838923-2985c318be48?auto=format&fit=crop&w=800&q=80');

    // Check order history for this service
    let previouslyRequested = false;
    if (landingUser) {
        try {
            const res = await fetch(`/api/orders?limit=100`, { credentials: 'same-origin' });
            if (res.ok) {
                const ordersData = await res.json();
                const orders = ordersData.data?.orders || [];
                previouslyRequested = orders.some(o => String(o.service_id) === String(service.id));
            }
        } catch { /* ignore */ }
    }

    const historyBadge = previouslyRequested
        ? `<div style="background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.3);border-radius:10px;padding:10px 16px;margin-bottom:16px;display:flex;align-items:center;gap:8px;font-size:0.88rem;color:#f59e0b;">
            <i class="fas fa-history"></i>
            ${i18n.t('You have requested this service previously', 'لقد طلبت هذه الخدمة مسبقاً')}
           </div>`
        : '';

    const modal = document.createElement('div');
    modal.id = 'serviceDetailModal';
    modal.className = 'glass-modal-overlay';
    modal.innerHTML = `
        <div class="glass-modal-backdrop"></div>
        <div class="glass-modal-content">
            <button class="glass-modal-close" onclick="closeServiceDetailModal()">
                <i class="fas fa-times"></i>
            </button>
            <div class="glass-modal-image">
                <img src="${esc(img)}" alt="${esc(localize(service, 'title'))}">
                <span class="glass-modal-category"><i class="fas fa-tag"></i> ${esc(localize(service, 'category') || i18n.t('General', 'عام'))}</span>
            </div>
            <div class="glass-modal-body">
                <h2>${esc(localize(service, 'title'))}</h2>
                ${historyBadge}
                <p class="glass-modal-desc">${esc(localize(service, 'description') || i18n.t('Professional service tailored to your specific business needs. Our team delivers high-quality results with attention to detail.', 'خدمة احترافية مصممة خصيصاً لاحتياجات عملك. فريقنا يقدم نتائج عالية الجودة مع الاهتمام بالتفاصيل.'))}</p>
                <div class="glass-modal-price">
                    <span class="label">${i18n.t('Service Price', 'سعر الخدمة')}</span>
                    <span class="value">${fmtServicePrice(service)}</span>
                </div>
                <div class="glass-modal-actions">
                    <button class="btn btn-primary btn-lg" onclick="confirmServiceRequest('${service.id}')">
                        <i class="fas fa-check-circle"></i> ${i18n.t('Confirm Request', 'تأكيد الطلب')}
                    </button>
                    <button class="btn btn-ghost" onclick="closeServiceDetailModal()">${i18n.t('Cancel', 'إلغاء')}</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';

    // Animate in
    requestAnimationFrame(() => modal.classList.add('show'));
}

function closeServiceDetailModal() {
    const modal = document.getElementById('serviceDetailModal');
    if (!modal) return;
    modal.classList.remove('show');
    document.body.style.overflow = '';
    setTimeout(() => modal.remove(), 400);
}

// ── Confirm Request → Create Order → Redirect ──
async function confirmServiceRequest(serviceId) {
    const btn = document.querySelector('.glass-modal-actions .btn-primary');
    if (btn) { btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${i18n.t('Placing Order...', 'جارٍ تقديم الطلب...')}`; btn.disabled = true; }
    try {
        await API.post('/orders', { service_id: serviceId });
        closeServiceDetailModal();
        Toast.success(i18n.t('Order placed! Redirecting to your dashboard...', 'تم تقديم الطلب! جارٍ التحويل إلى لوحة التحكم...'));
        setTimeout(() => { window.location.href = '/dashboard'; }, 1200);
    } catch (err) {
        Toast.error(err.message || i18n.t('Failed to place order.', 'فشل في تقديم الطلب.'));
        if (btn) { btn.innerHTML = `<i class="fas fa-check-circle"></i> ${i18n.t('Confirm Request', 'تأكيد الطلب')}`; btn.disabled = false; }
    }
}

// ══════════════════════════════════════════
//  DYNAMIC SERVICES — Professional Cards with Content Lock
// ══════════════════════════════════════════
async function loadLandingServices() {
    const grid = document.getElementById('servicesGrid');
    if (!grid) return;

    // Inject loading state
    grid.innerHTML = `<div class="empty-state-wrapper"><i class="fas fa-spinner fa-spin"></i> <span>${typeof i18n !== 'undefined' ? i18n.t('Loading services...', 'جاري تحميل الخدمات...') : 'Loading services...'}</span></div>`;

    try {
        const response = await fetch('/api/services?limit=50');
        const data = await response.json();
        if (!response.ok || !data.data?.services?.length) {
            grid.innerHTML = `<div class="empty-state-wrapper">
            <i class="fas fa-briefcase" style="margin-bottom:1rem;color:var(--text-muted);font-size:2rem;"></i><br>
            <span data-i18n="servicesPage.noServices">${i18n.t('No services available at the moment.', 'لا توجد خدمات متاحة في الوقت الحالي')}</span>
        </div>`;
            return;
        }

        // Store services data for modal access
        window.__landingServices = {};

        grid.innerHTML = data.data.services.map(s => {
            window.__landingServices[s.id] = s;
            const img = getImageUrl(s.images, 'https://images.unsplash.com/photo-1557838923-2985c318be48?auto=format&fit=crop&w=800&q=80');
            return `
        <div class="service-card pro-card fade-in visible" data-service-id="${s.id}" style="cursor:pointer;">
          <div class="pro-card-image">
            <img src="${esc(img)}" alt="${esc(localize(s, 'title'))}" loading="lazy">
            <div class="pro-card-overlay">
              <span class="btn btn-primary btn-sm"><i class="fas fa-eye"></i> ${i18n.t('View Details', 'عرض التفاصيل')}</span>
            </div>
            <span class="pro-price-badge">${fmtServicePrice(s)}</span>
          </div>
          <div class="pro-card-body">
            <h3>${esc(localize(s, 'title'))}</h3>
            <p>${esc(localize(s, 'description') || i18n.t('Professional service tailored to your needs.', 'خدمة احترافية مصممة خصيصاً لاحتياجاتك.'))}</p>
            <div class="pro-card-footer">
              <span class="pro-category"><i class="fas fa-tag"></i> ${esc(localize(s, 'category') || i18n.t('General', 'عام'))}</span>
              <span class="btn btn-outline btn-sm" style="pointer-events:none;">${i18n.t('Request Service', 'طلب الخدمة')}</span>
            </div>
          </div>
        </div>`;
        }).join('');

        // Attach click listeners via event delegation — no inline onclick required (CSP-safe)
        grid.querySelectorAll('[data-service-id]').forEach(card => {
            card.addEventListener('click', () => {
                handleServiceClick(window.__landingServices[card.dataset.serviceId]);
            });
        });
    } catch (err) { console.error('Services load error:', err); }
}

// ══════════════════════════════════════════
//  DYNAMIC JOBS
// ══════════════════════════════════════════
async function loadLandingJobs() {
    const grid = document.getElementById('jobsGrid');
    if (!grid) return;

    grid.innerHTML = `<div class="empty-state-wrapper"><i class="fas fa-spinner fa-spin"></i> <span>${i18n.t('Loading jobs...', 'جارٍ تحميل الوظائف...')}</span></div>`;

    try {
        const response = await fetch('/api/jobs?limit=50');
        const data = await response.json();
        if (!response.ok || !data.data?.jobs?.length) {
            grid.innerHTML = `<div class="empty-state-wrapper">
            <i class="fas fa-briefcase" style="margin-bottom:1rem;color:var(--text-muted);font-size:2rem;"></i><br>
            <span>${i18n.t('No jobs available at the moment.', 'لا توجد وظائف متاحة في الوقت الحالي')}</span>
        </div>`;
            return;
        }

        const typeColors = { full_time: 'success', part_time: 'info', remote: 'primary', contract: 'warning' };
        const isRtl = document.documentElement.dir === 'rtl';

        grid.innerHTML = data.data.jobs.map(j => {
            const badge = typeColors[j.type] || 'primary';
            const typeLabel = j.type?.replace('_', ' ') || i18n.t('Full-time', 'دوام كامل');
            return `
        <div class="property-card fade-in visible">
          <div class="property-card-body" style="padding:24px">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:12px">
              <h3 style="margin:0">${esc(localize(j, 'title'))}</h3>
              <span class="badge badge-${badge}" style="white-space:nowrap">${esc(typeLabel)}</span>
            </div>
            ${j.company ? `<div style="color:var(--text-muted);font-size:0.875rem;margin-bottom:6px"><i class="fas fa-building" style="margin-inline-end:6px"></i>${esc(j.company)}</div>` : ''}
            ${j.location ? `<div style="color:var(--text-muted);font-size:0.875rem;margin-bottom:6px"><i class="fas fa-map-marker-alt" style="margin-inline-end:6px"></i>${esc(j.location)}</div>` : ''}
            ${j.salary_range ? `<div style="color:var(--accent-primary);font-size:0.875rem;margin-bottom:12px"><i class="fas fa-coins" style="margin-inline-end:6px"></i>${esc(j.salary_range)}</div>` : ''}
            <a href="/dashboard" class="btn btn-outline btn-sm" style="width:100%;margin-top:8px">
              <i class="fas fa-paper-plane"></i> ${i18n.t('Apply Now', 'تقدّم الآن')}
            </a>
          </div>
        </div>`;
        }).join('');
    } catch (err) { console.error('Jobs load error:', err); }
}

// ══════════════════════════════════════════
//  DYNAMIC PORTFOLIO — Premium Cards + Filters + Lightbox
// ══════════════════════════════════════════
let __portfolioItems = []; // Store for filter/lightbox

async function loadLandingPortfolio() {
    const grid = document.getElementById('portfolioGrid');
    if (!grid) return;

    grid.innerHTML = `<div class="empty-state-wrapper"><i class="fas fa-spinner fa-spin"></i> <span data-i18n="portfolio.loading">${typeof i18n !== 'undefined' ? i18n.t('Loading portfolio...', 'جارٍ تحميل الأعمال...') : 'Loading portfolio...'}</span></div>`;

    try {
        const response = await fetch('/api/portfolio?limit=50');
        const data = await response.json();
        const rawItems = data.data?.portfolio || data.data?.items || [];

        if (!response.ok || !rawItems.length) {
            grid.innerHTML = `<div class="portfolio-empty">
                <i class="fas fa-images"></i>
                <p data-i18n="portfolio.noWorks">${typeof i18n !== 'undefined' ? i18n.t('No works available at the moment', 'لا توجد أعمال لعرضها حالياً') : 'No works available at the moment'}</p>
            </div>`;
            return;
        }

        // Parse images for each item once
        __portfolioItems = rawItems.map(item => {
            let images = [];
            if (Array.isArray(item.images)) {
                images = item.images;
            } else if (typeof item.images === 'string') {
                try { images = JSON.parse(item.images); } catch { images = []; }
            }
            return { ...item, _images: images };
        });

        // Build dynamic filter buttons
        buildPortfolioFilters(__portfolioItems);

        // Render all cards
        renderPortfolioCards(__portfolioItems);

    } catch (err) {
        console.error('Portfolio load error:', err);
        grid.innerHTML = `<div class="portfolio-empty">
            <i class="fas fa-exclamation-triangle"></i>
            <p>${typeof i18n !== 'undefined' ? i18n.t('Failed to load portfolio', 'فشل في تحميل الأعمال') : 'Failed to load portfolio'}</p>
        </div>`;
    }
}

function buildPortfolioFilters(items) {
    const filtersContainer = document.getElementById('portfolioFilters');
    if (!filtersContainer) return;

    // Extract unique categories
    const categories = new Set();
    items.forEach(item => {
        const cat = localize(item, 'category');
        if (cat && cat !== 'general') categories.add(cat);
    });

    const allLabel = typeof i18n !== 'undefined' ? i18n.t('All Works', 'جميع الأعمال') : 'All Works';
    let html = `<button class="filter-btn active" data-filter="all">${esc(allLabel)}</button>`;
    categories.forEach(cat => {
        html += `<button class="filter-btn" data-filter="${esc(cat)}">${esc(cat)}</button>`;
    });

    filtersContainer.innerHTML = html;

    // Attach filter click handlers
    filtersContainer.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            filtersContainer.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const filter = btn.dataset.filter;
            if (filter === 'all') {
                renderPortfolioCards(__portfolioItems);
            } else {
                const filtered = __portfolioItems.filter(item => localize(item, 'category') === filter);
                renderPortfolioCards(filtered);
            }
        });
    });
}

function renderPortfolioCards(items) {
    const grid = document.getElementById('portfolioGrid');
    if (!grid) return;

    const fallbackImg = 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=800&q=80';

    grid.innerHTML = items.map((item, idx) => {
        const img = item._images?.[0] || fallbackImg;
        const imageCount = item._images?.length || 0;
        const title = localize(item, 'title') || item.title || '';
        const desc = localize(item, 'description') || item.description || '';
        const category = localize(item, 'category') || '';
        const dateStr = item.created_at ? new Date(item.created_at).toLocaleDateString() : '';

        return `
        <div class="portfolio-card fade-in" data-portfolio-idx="${idx}" data-category="${esc(category)}">
          <div class="portfolio-card-image">
            <img src="${esc(img)}" alt="${esc(title)}" loading="lazy" decoding="async">
            ${category ? `<span class="portfolio-card-badge">${esc(category)}</span>` : ''}
            <div class="portfolio-card-overlay">
              <i class="fas fa-expand"></i>
            </div>
          </div>
          <div class="portfolio-card-body">
            <h3>${esc(title)}</h3>
            ${desc ? `<p>${esc(desc)}</p>` : ''}
            <div class="portfolio-card-meta">
              ${dateStr ? `<span class="portfolio-date"><i class="fas fa-calendar-alt"></i> ${dateStr}</span>` : '<span></span>'}
              ${imageCount > 1 ? `<span class="portfolio-images-count"><i class="fas fa-images"></i> ${imageCount}</span>` : ''}
            </div>
          </div>
        </div>`;
    }).join('');

    // Attach click listeners for lightbox
    grid.querySelectorAll('.portfolio-card').forEach(card => {
        card.addEventListener('click', () => {
            const idx = parseInt(card.dataset.portfolioIdx);
            openPortfolioLightbox(__portfolioItems[idx]);
        });
    });

    // Re-observe for scroll animations
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -30px 0px' });
    grid.querySelectorAll('.fade-in').forEach(el => observer.observe(el));
}

// ── Portfolio Lightbox ──
function openPortfolioLightbox(item) {
    document.getElementById('portfolioLightbox')?.remove();

    const images = item._images || [];
    const fallbackImg = 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=800&q=80';
    const allImages = images.length ? images : [fallbackImg];
    const title = localize(item, 'title') || item.title || '';
    const desc = localize(item, 'description') || item.description || '';
    const category = localize(item, 'category') || '';
    const dateStr = item.created_at ? new Date(item.created_at).toLocaleDateString() : '';

    const dotsHtml = allImages.length > 1
        ? `<div class="gallery-dots">${allImages.map((_, i) => `<button class="gallery-dot${i === 0 ? ' active' : ''}" data-slide="${i}"></button>`).join('')}</div>`
        : '';

    const navHtml = allImages.length > 1
        ? `<button class="gallery-nav gallery-prev" onclick="navigatePortfolioGallery(-1)"><i class="fas fa-chevron-left"></i></button>
           <button class="gallery-nav gallery-next" onclick="navigatePortfolioGallery(1)"><i class="fas fa-chevron-right"></i></button>`
        : '';

    const overlay = document.createElement('div');
    overlay.id = 'portfolioLightbox';
    overlay.className = 'portfolio-lightbox-overlay';
    overlay.innerHTML = `
        <div class="portfolio-lightbox-backdrop" onclick="closePortfolioLightbox()"></div>
        <div class="portfolio-lightbox-content">
            <button class="portfolio-lightbox-close" onclick="closePortfolioLightbox()">
                <i class="fas fa-times"></i>
            </button>
            <div class="portfolio-lightbox-gallery" data-current="0">
                <img src="${esc(allImages[0])}" alt="${esc(title)}">
                ${navHtml}
                ${dotsHtml}
            </div>
            <div class="portfolio-lightbox-body">
                <h2>${esc(title)}</h2>
                ${desc ? `<p>${esc(desc)}</p>` : ''}
                <div class="lightbox-meta">
                    ${category ? `<span><i class="fas fa-tag"></i> ${esc(category)}</span>` : ''}
                    ${dateStr ? `<span><i class="fas fa-calendar-alt"></i> ${dateStr}</span>` : ''}
                    ${allImages.length > 1 ? `<span><i class="fas fa-images"></i> ${allImages.length} ${typeof i18n !== 'undefined' ? i18n.t('images', 'صور') : 'images'}</span>` : ''}
                </div>
            </div>
        </div>
    `;

    // Store images on the element for gallery navigation
    overlay._images = allImages;
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => overlay.classList.add('show'));
}

function closePortfolioLightbox() {
    const overlay = document.getElementById('portfolioLightbox');
    if (!overlay) return;
    overlay.classList.remove('show');
    document.body.style.overflow = '';
    setTimeout(() => overlay.remove(), 400);
}

function navigatePortfolioGallery(direction) {
    const overlay = document.getElementById('portfolioLightbox');
    if (!overlay) return;
    const gallery = overlay.querySelector('.portfolio-lightbox-gallery');
    const images = overlay._images || [];
    if (images.length <= 1) return;

    let current = parseInt(gallery.dataset.current) || 0;
    current = (current + direction + images.length) % images.length;
    gallery.dataset.current = current;
    gallery.querySelector('img').src = images[current];

    // Update dots
    gallery.querySelectorAll('.gallery-dot').forEach((dot, i) => {
        dot.classList.toggle('active', i === current);
    });
}

// Close lightbox on Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePortfolioLightbox();
});

// ══════════════════════════════════════════
//  DYNAMIC EXHIBITIONS
// ══════════════════════════════════════════
async function loadLandingExhibitions() {
    const grid = document.getElementById('exhibitionsGrid');
    if (!grid) return;

    // Inject loading state
    grid.innerHTML = `<div class="empty-state-wrapper"><i class="fas fa-spinner fa-spin"></i> <span>${typeof i18n !== 'undefined' ? i18n.t('Loading exhibitions...', 'جاري تحميل المعارض...') : 'Loading exhibitions...'}</span></div>`;

    try {
        const response = await fetch('/api/exhibitions?limit=50');
        const data = await response.json();
        if (!response.ok || !data.data?.exhibitions?.length) {
            grid.innerHTML = `<div class="empty-state-wrapper">
            <i class="fas fa-calendar-alt" style="margin-bottom:1rem;color:var(--text-muted);font-size:2rem;"></i><br>
            <span data-i18n="exhibitionsPage.noExhibitions">${i18n.t('No exhibitions available at the moment.', 'لا توجد معارض متاحة في الوقت الحالي')}</span>
        </div>`;
            return;
        }

        grid.innerHTML = data.data.exhibitions.map(ex => {
            // Pick a default emoji if none is provided
            const fallbackEmoji = '📅';
            return `
        <div class="exhibition-card fade-in">
          <div class="emoji">${esc(ex.icon || fallbackEmoji)}</div>
          <h3>${esc(localize(ex, 'title'))}</h3>
          <p>${esc(localize(ex, 'description'))}</p>
          <div class="meta">
            <span><i class="fas fa-map-marker-alt"></i> ${esc(ex.location || i18n.t('TBA', 'سيُعلن لاحقاً'))}</span>
            <span><i class="fas fa-calendar"></i> ${esc(new Date(ex.start_date).toLocaleDateString())}</span>
          </div>
        </div>`;
        }).join('');

        // Re-observe animations for newly added elements
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
        grid.querySelectorAll('.fade-in').forEach(el => observer.observe(el));

    } catch (err) { console.error('Exhibitions load error:', err); }
}

// ── Lazy Loading ──
if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
        entries.forEach(e => {
            if (e.isIntersecting) {
                const img = e.target;
                if (img.dataset.src) { img.src = img.dataset.src; img.removeAttribute('data-src'); }
                io.unobserve(img);
            }
        });
    });
    document.querySelectorAll('img[data-src]').forEach(img => io.observe(img));
}
