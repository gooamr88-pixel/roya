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
    loadLandingProperties();
    loadLandingExhibitions();
});

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

// ── Contact Form ──
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
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...'; btn.disabled = true;
        try {
            await API.post('/contact', { name, email, subject, message });
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
                <img src="${esc(img)}" alt="${esc(service.title)}">
                <span class="glass-modal-category"><i class="fas fa-tag"></i> ${esc(service.category || i18n.t('General', 'عام'))}</span>
            </div>
            <div class="glass-modal-body">
                <h2>${esc(service.title)}</h2>
                ${historyBadge}
                <p class="glass-modal-desc">${esc(service.description || i18n.t('Professional service tailored to your specific business needs. Our team delivers high-quality results with attention to detail.', 'خدمة احترافية مصممة خصيصاً لاحتياجات عملك. فريقنا يقدم نتائج عالية الجودة مع الاهتمام بالتفاصيل.'))}</p>
                <div class="glass-modal-price">
                    <span class="label">${i18n.t('Service Price', 'سعر الخدمة')}</span>
                    <span class="value">${fmtPrice(service.price)}</span>
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
        const response = await fetch('/api/services?limit=6');
        const data = await response.json();
        if (!response.ok || !data.data?.services?.length) {
            grid.innerHTML = `<div class="empty-state-wrapper">
            <i class="fas fa-briefcase" style="margin-bottom:1rem;color:var(--text-muted);font-size:2rem;"></i><br>
            ${typeof i18n !== 'undefined' ? i18n.t('No services available at the moment.', 'لا توجد خدمات متاحة في الوقت الحالي') : 'No services available.'}
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
            <img src="${esc(img)}" alt="${esc(s.title)}" loading="lazy">
            <div class="pro-card-overlay">
              <span class="btn btn-primary btn-sm"><i class="fas fa-eye"></i> View Details</span>
            </div>
            <span class="pro-price-badge">${fmtPrice(s.price)}</span>
          </div>
          <div class="pro-card-body">
            <h3>${esc(s.title)}</h3>
            <p>${esc(s.description || 'Professional service tailored to your needs.')}</p>
            <div class="pro-card-footer">
              <span class="pro-category"><i class="fas fa-tag"></i> ${esc(s.category || 'General')}</span>
              <span class="btn btn-outline btn-sm" style="pointer-events:none;">Request Service</span>
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
//  DYNAMIC PROPERTIES
// ══════════════════════════════════════════
async function loadLandingProperties() {
    const grid = document.getElementById('propertiesGrid');
    if (!grid) return;

    // Inject loading state
    grid.innerHTML = `<div class="empty-state-wrapper"><i class="fas fa-spinner fa-spin"></i> <span>${typeof i18n !== 'undefined' ? i18n.t('Loading properties...', 'جاري تحميل العقارات...') : 'Loading properties...'}</span></div>`;

    try {
        const response = await fetch('/api/properties?limit=6');
        const data = await response.json();
        if (!response.ok || !data.data?.properties?.length) {
            grid.innerHTML = `<div class="empty-state-wrapper">
            <i class="fas fa-home" style="margin-bottom:1rem;color:var(--text-muted);font-size:2rem;"></i><br>
            ${typeof i18n !== 'undefined' ? i18n.t('No properties available at the moment.', 'لا توجد عقارات متاحة في الوقت الحالي') : 'No properties available.'}
        </div>`;
            return;
        }

        const typeColors = { residential: 'primary', commercial: 'info', land: 'success', industrial: 'warning' };

        grid.innerHTML = data.data.properties.map(p => {
            const img = getImageUrl(p.images, 'https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=800&q=80');
            const badge = typeColors[p.property_type] || 'primary';
            return `
        <div class="property-card fade-in visible">
          <div class="property-card-image">
            <span class="badge badge-${badge}">${esc(p.property_type || 'Residential')}</span>
            <img src="${esc(img)}" alt="${esc(p.title)}" loading="lazy" style="width:100%;height:100%;object-fit:cover;">
          </div>
          <div class="property-card-body">
            <h3>${esc(p.title)}</h3>
            <div class="location"><i class="fas fa-map-marker-alt"></i> ${esc(p.location || 'Location N/A')}</div>
            <div class="property-specs">
              ${p.bedrooms ? `<div class="property-spec"><i class="fas fa-bed"></i> <strong>${p.bedrooms}</strong> Beds</div>` : ''}
              ${p.bathrooms ? `<div class="property-spec"><i class="fas fa-bath"></i> <strong>${p.bathrooms}</strong> Baths</div>` : ''}
              ${p.area_sqm ? `<div class="property-spec"><i class="fas fa-ruler-combined"></i> <strong>${Number(p.area_sqm).toLocaleString()}</strong> m²</div>` : ''}
            </div>
            <div class="price-row">
              <span class="price">${fmtPrice(p.price)}</span>
              <button class="btn btn-outline btn-sm" data-prop-title="${esc(p.title)}">Inquire</button>
            </div>
          </div>
        </div>`;
        }).join('');

        // Event delegation for Inquire buttons — auth-aware, CSP-safe
        grid.querySelectorAll('[data-prop-title]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (landingUser) {
                    // Logged in: open the contact form pre-filled as an inquiry
                    const subject = `Property Inquiry: ${btn.dataset.propTitle}`;
                    const contactSection = document.getElementById('contact');
                    const subjectInput = document.getElementById('contactSubject');
                    if (contactSection && subjectInput) {
                        subjectInput.value = subject;
                        contactSection.scrollIntoView({ behavior: 'smooth' });
                        document.getElementById('contactName')?.focus();
                    } else {
                        // Fallback to dashboard
                        window.location.href = '/dashboard';
                    }
                } else {
                    // Not logged in: redirect with session message
                    sessionStorage.setItem('loginMessage', i18n.t('Please login to inquire about this property.', 'يرجى تسجيل الدخول للاستفسار عن هذا العقار.'));
                    window.location.href = '/login';
                }
            });
        });

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

    } catch (err) { console.error('Properties load error:', err); }
}

// ══════════════════════════════════════════
//  DYNAMIC EXHIBITIONS
// ══════════════════════════════════════════
async function loadLandingExhibitions() {
    const grid = document.getElementById('exhibitionsGrid');
    if (!grid) return;

    // Inject loading state
    grid.innerHTML = `<div class="empty-state-wrapper"><i class="fas fa-spinner fa-spin"></i> <span>${typeof i18n !== 'undefined' ? i18n.t('Loading exhibitions...', 'جاري تحميل المعارض...') : 'Loading exhibitions...'}</span></div>`;

    try {
        const response = await fetch('/api/exhibitions?limit=6');
        const data = await response.json();
        if (!response.ok || !data.data?.exhibitions?.length) {
            grid.innerHTML = `<div class="empty-state-wrapper">
            <i class="fas fa-calendar-alt" style="margin-bottom:1rem;color:var(--text-muted);font-size:2rem;"></i><br>
            ${typeof i18n !== 'undefined' ? i18n.t('No exhibitions available at the moment.', 'لا توجد معارض متاحة في الوقت الحالي') : 'No exhibitions available.'}
        </div>`;
            return;
        }

        grid.innerHTML = data.data.exhibitions.map(ex => {
            // Pick a default emoji if none is provided
            const fallbackEmoji = '📅';
            return `
        <div class="exhibition-card fade-in">
          <div class="emoji">${esc(ex.icon || fallbackEmoji)}</div>
          <h3>${esc(ex.title)}</h3>
          <p>${esc(ex.description || '')}</p>
          <div class="meta">
            <span><i class="fas fa-map-marker-alt"></i> ${esc(ex.location || 'TBA')}</span>
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
