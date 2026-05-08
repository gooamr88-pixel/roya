// ═══════════════════════════════════════════════
// Client Dashboard JS V2.0 — Control Center
// Features: Animated counters, data caching, keyboard
// shortcuts, skeleton loading, exhibitions, time greeting
// ═══════════════════════════════════════════════

let currentUser = null;

// FIX (F3): TTL-based cache — entries expire after 60s to prevent stale data
const _cache = {
    _store: {},
    set(key, data, ttlMs = 60000) {
        this._store[key] = { data, expires: Date.now() + ttlMs };
    },
    get(key) {
        const entry = this._store[key];
        if (!entry) return null;
        if (Date.now() > entry.expires) {
            delete this._store[key];
            return null;
        }
        return entry.data;
    },
    invalidate(key) {
        delete this._store[key];
    },
};

const VIEW_KEYS = ['overview', 'orders', 'services', 'exhibitions', 'notifications', 'invoices', 'profile'];

document.addEventListener('DOMContentLoaded', () => {
    showLoginMessage();
    initAuth();
    initNavigation();
    initSidebar();
    initLogout();
    initKeyboardShortcuts();
});

// ── Show login redirect message if any ──
function showLoginMessage() {
    const msg = sessionStorage.getItem('loginMessage');
    if (msg) {
        sessionStorage.removeItem('loginMessage');
        setTimeout(() => Toast.info(msg), 500);
    }
}

// ── Time-based greeting ──
function getGreeting(name) {
    const h = new Date().getHours();
    const first = (name || 'User').split(' ')[0];
    const dt = window.__dt || {};
    if (h < 12) return `${dt.greetingMorning || 'Good morning'}, ${first}!`;
    if (h < 17) return `${dt.greetingAfternoon || 'Good afternoon'}, ${first}!`;
    return `${dt.greetingEvening || 'Good evening'}, ${first}!`;
}

// ── Auth Check ──
// FIX (F2): Differentiate between auth errors and network errors.
// Previously, any error (including server outage) hard-redirected to /login.
async function initAuth() {
    try {
        const data = await API.get('/auth/me');
        currentUser = data.data.user;
        updateUserUI();
        loadOverview();
    } catch (err) {
        // Only redirect to login for actual auth failures, not network errors
        if (err.message && (
            err.message.includes('Session expired') ||
            err.message.includes('No token') ||
            err.message.includes('Invalid token')
        )) {
            window.location.href = '/login';
        } else if (err.message && err.message.includes('Network error')) {
            Toast.error(err.message);
        } else {
            // Default: redirect to login for unknown auth issues
            window.location.href = '/login';
        }
    }
}

function updateUserUI() {
    const initials = (currentUser.name || 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const el = (id) => document.getElementById(id);
    if (el('userAvatar')) el('userAvatar').textContent = initials;
    if (el('profileAvatar')) el('profileAvatar').textContent = initials;
    if (el('userName')) el('userName').textContent = currentUser.name;
    if (el('userRole')) el('userRole').textContent = currentUser.role || (window.__dt || {}).roleDefault || 'Client';
    if (el('profileName')) el('profileName').textContent = currentUser.name;
    if (el('profileEmail')) el('profileEmail').textContent = currentUser.email;
    if (el('profileNameInput')) el('profileNameInput').value = currentUser.name;
    if (el('profilePhoneInput')) el('profilePhoneInput').value = currentUser.phone || '';
    if (el('viewSubtitle')) el('viewSubtitle').textContent = getGreeting(currentUser.name);

    // Show admin link for admin/supervisor
    if (['super_admin', 'admin', 'supervisor'].includes(currentUser.role)) {
        if (el('adminLink')) el('adminLink').style.display = '';
    }
}

// ── Animated Counter ──
function animateCounter(el, target, prefix = '', suffix = '', duration = 800) {
    if (!el) return;
    const startTime = performance.now();
    const startVal = 0;
    const isFloat = String(target).includes('.');

    function tick(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
        const current = startVal + (target - startVal) * eased;
        el.textContent = prefix + (isFloat ? current.toFixed(2) : Math.round(current)) + suffix;
        if (progress < 1) requestAnimationFrame(tick);
        else el.classList.add('counting');
    }
    requestAnimationFrame(tick);
}

// ── Relative Time ──
function relativeTime(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    const dt = window.__dt || {};
    if (mins < 1) return dt.justNow || 'Just now';
    if (mins < 60) return `${mins}${dt.minutesAgo || 'm ago'}`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}${dt.hoursAgo || 'h ago'}`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}${dt.daysAgo || 'd ago'}`;
    return Utils.formatDate(dateStr);
}

// ── Reusable Empty State ──
function renderEmptyState(icon, title, desc, ctaText, ctaAction) {
    const ctaHtml = ctaText ? `<button class="empty-cta" onclick="${esc(ctaAction)}"><i class="fas fa-plus"></i> ${esc(ctaText)}</button>` : '';
    return `<div class="empty-state-card">
        <div class="empty-icon"><i class="fas ${esc(icon)}"></i></div>
        <div class="empty-title">${esc(title)}</div>
        <div class="empty-desc">${esc(desc)}</div>
        ${ctaHtml}
    </div>`;
}

// ── Navigation ──
function initNavigation() {
    document.querySelectorAll('[data-view]').forEach(link => {
        link.addEventListener('click', () => switchView(link.dataset.view));
    });

    // Profile form
    document.getElementById('profileForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        setLoading(btn, true, (window.__dt || {}).saving || 'Saving...');
        try {
            const data = await API.put('/users/profile', {
                name: document.getElementById('profileNameInput').value,
                phone: document.getElementById('profilePhoneInput').value,
            });
            currentUser = { ...currentUser, ...data.data.user };
            updateUserUI();
            Toast.success((window.__dt || {}).profileUpdated || 'Profile updated!');
        } catch (err) { Toast.error(err.message); }
        finally { setLoading(btn, false); }
    });

    // Change password form
    document.getElementById('changePasswordForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const currentPass = document.getElementById('currentPass').value;
        const newPass = document.getElementById('newPass').value;
        const confirmNewPass = document.getElementById('confirmNewPass').value;

        if (!currentPass || !newPass) { Toast.warning((window.__dt || {}).fillPasswordFields || 'Please fill in all password fields.'); return; }
        if (newPass !== confirmNewPass) { Toast.error((window.__dt || {}).passwordsNotMatch || 'New passwords do not match.'); return; }
        if (newPass.length < 8) { Toast.error((window.__dt || {}).passwordMinLength || 'Password must be at least 8 characters.'); return; }

        const btn = e.target.querySelector('button[type="submit"]');
        setLoading(btn, true, (window.__dt || {}).updating || 'Updating...');
        try {
            await API.put('/users/password', { currentPassword: currentPass, newPassword: newPass });
            Toast.success((window.__dt || {}).passwordChanged || 'Password changed successfully!');
            document.getElementById('changePasswordForm').reset();
        } catch (err) { Toast.error(err.message); }
        finally { setLoading(btn, false); }
    });

    // Orders filter
    document.getElementById('orderStatusFilter')?.addEventListener('change', () => loadOrders());

    // Mark all read
    document.getElementById('markAllReadBtn')?.addEventListener('click', async () => {
        try {
            await API.put('/notifications/read-all');
            Toast.success((window.__dt || {}).allNotificationsRead || 'All notifications marked as read.');
            loadNotifications();
            updateNotifCount(0);
        } catch (err) { Toast.error(err.message); }
    });
}

const viewTitles = {
    overview: (window.__dt || {}).controlCenter || 'Control Center',
    orders: (window.__dt || {}).myOrders || 'My Orders',
    services: (window.__dt || {}).browseServices || 'Browse Services',
    exhibitions: (window.__dt || {}).exhibitions || 'Exhibitions',
    notifications: (window.__dt || {}).notifications || 'Notifications',
    invoices: (window.__dt || {}).myInvoices || 'My Invoices',
    profile: (window.__dt || {}).profileSettings || 'Profile Settings',
};

function switchView(viewName) {
    document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
    const target = document.getElementById(`view-${viewName}`);
    if (target) target.classList.add('active');
    document.querySelector(`.sidebar-link[data-view="${viewName}"]`)?.classList.add('active');
    document.getElementById('viewTitle').textContent = viewTitles[viewName] || viewName;

    // Update breadcrumb
    const bc = document.getElementById('breadcrumbCurrent');
    if (bc) bc.textContent = viewTitles[viewName] || viewName;

    const loaders = {
        overview: loadOverview, orders: loadOrders, services: loadServices,
        exhibitions: loadExhibitions, notifications: loadNotifications, invoices: loadInvoices,
    };
    if (loaders[viewName]) loaders[viewName]();
    document.getElementById('sidebar')?.classList.remove('open');
}

// ── Keyboard Shortcuts ──
function initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Don't trigger when typing in inputs
        if (e.target.matches('input, textarea, select')) return;

        // Number keys 1-7 for view switching
        const num = parseInt(e.key);
        if (num >= 1 && num <= 7 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            switchView(VIEW_KEYS[num - 1]);
        }
        // Escape to close sidebar
        if (e.key === 'Escape') {
            document.getElementById('sidebar')?.classList.remove('open');
        }
    });
}

// ── Sidebar ──
function initSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const openSidebar = () => { sidebar?.classList.add('open'); overlay?.classList.add('active'); };
    const closeSidebar = () => { sidebar?.classList.remove('open'); overlay?.classList.remove('active'); };
    document.getElementById('sidebarToggle')?.addEventListener('click', openSidebar);
    document.getElementById('sidebarClose')?.addEventListener('click', closeSidebar);
    overlay?.addEventListener('click', closeSidebar);
}

// ── Logout with glass confirm ──
function initLogout() {
    document.getElementById('logoutBtn')?.addEventListener('click', async () => {
        const dt = window.__dt || {};
        const ok = await glassConfirm(dt.logOut || 'Log Out', dt.logOutConfirm || 'Are you sure you want to log out?', 'warning');
        if (!ok) return;
        try { 
            await API.post('/auth/logout'); 
        } catch (err) { 
            console.error('Logout error:', err); 
        }
        window.location.href = '/login';
    });
}

// ══════════════════════════════════════════
//  OVERVIEW — Stats + Timeline + Recent Orders
// ══════════════════════════════════════════
async function loadOverview() {
    try {
        const [ordersData, notifData] = await Promise.all([
            _cache.get('orders50') || API.get('/orders?limit=50'),
            API.get('/notifications?limit=1'),
        ]);
        _cache.set('orders50', ordersData);

        const orders = ordersData.data.orders;
        const activeOrders = orders.filter(o => ['pending', 'in_progress', 'confirmed'].includes(o.status));
        const completed = orders.filter(o => o.status === 'completed').length;
        const totalSpent = orders.reduce((sum, o) => sum + (parseFloat(o.price) || 0), 0);
        const unread = notifData.data.unreadCount || 0;

        // Animated counters
        animateCounter(document.getElementById('statOrders'), activeOrders.length);
        animateCounter(document.getElementById('statCompleted'), completed);
        animateCounter(document.getElementById('statSpent'), totalSpent, '﷼');
        animateCounter(document.getElementById('statNotifications'), unread);
        updateNotifCount(unread);

        // ── Order Timeline (most recent active order) ──
        renderOrderTimeline(activeOrders[0] || orders[0]);

        // ── Smart Recommendations ──
        loadRecommendations(orders);

        // ── Recent orders table ──
        const tbody = document.getElementById('recentOrdersTable');
        if (orders.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5">' + renderEmptyState('fa-shopping-bag', (window.__dt||{}).noOrdersYet||'No orders yet', (window.__dt||{}).emptyOrdersDesc||'Place your first order to get started with our services.', (window.__dt||{}).emptyOrdersCta||'Browse Services', "switchView('services')") + '</td></tr>';
        } else {
            tbody.innerHTML = orders.slice(0, 5).map(o => `
                <tr>
                    <td data-label="Invoice" style="font-weight:600">${esc(o.invoice_number || '—')}</td>
                    <td data-label="Service">${esc(o.service_title)}</td>
                    <td data-label="Amount">${Utils.formatCurrency(o.price, o.currency)}</td>
                    <td data-label="Status"><span class="badge badge-${statusColor(o.status)}">${o.status.replace(/_/g, ' ')}</span></td>
                    <td data-label="Date">${relativeTime(o.created_at)}</td>
                </tr>
            `).join('');
        }
    } catch (err) { 
        console.error('Overview error:', err); 
        Toast.error((window.__dt||{}).failedLoadOrders||'Failed to load overview data.');
    }
}

// ══════════════════════════════════════════
//  INTERACTIVE ORDER TIMELINE
// ══════════════════════════════════════════
function renderOrderTimeline(order) {
    const container = document.getElementById('orderTimeline');
    if (!order) {
        container.innerHTML = '<div style="padding:32px;text-align:center;color:var(--text-muted)"><i class="fas fa-clock" style="font-size:2rem;display:block;margin-bottom:10px"></i>' + ((window.__dt || {}).noActiveOrders || 'No active orders') + '</div>';
        return;
    }

    const steps = ['pending', 'confirmed', 'in_progress', 'completed'];
    const stepLabels = { pending: (window.__dt||{}).statusPending||'Pending', confirmed: (window.__dt||{}).statusConfirmed||'Confirmed', in_progress: (window.__dt||{}).statusInProgress||'In Progress', completed: (window.__dt||{}).statusCompleted||'Completed' };
    const stepIcons = { pending: 'fa-clock', confirmed: 'fa-check', in_progress: 'fa-cog fa-spin', completed: 'fa-trophy' };
    const currentIdx = steps.indexOf(order.status);
    const isCancelled = order.status === 'cancelled';

    container.innerHTML = `
        <div style="padding:16px 20px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
                <div>
                    <strong style="font-size:0.95rem">${esc(order.service_title)}</strong>
                    <span style="font-size:0.8rem;color:var(--text-muted);display:block;margin-top:2px">${esc(order.invoice_number)}</span>
                </div>
                <span class="badge badge-${isCancelled ? 'danger' : statusColor(order.status)}">
                    ${isCancelled ? ((window.__dt||{}).statusCancelled||'Cancelled') : order.status.replace(/_/g, ' ')}
                </span>
            </div>
            ${isCancelled ? `
                <div style="text-align:center;padding:20px;color:var(--danger)">
                    <i class="fas fa-ban" style="font-size:2rem;margin-bottom:8px;display:block"></i>
                    ${(window.__dt||{}).thisOrderCancelled||'This order has been cancelled.'}
                </div>
            ` : `
                <div class="order-timeline-track">
                    ${steps.map((step, i) => {
        const done = i <= currentIdx;
        const active = i === currentIdx;
        return `
                        <div class="timeline-step ${done ? 'done' : ''} ${active ? 'active' : ''}">
                            <div class="timeline-dot">
                                <i class="fas ${done ? (active ? stepIcons[step] : 'fa-check') : 'fa-circle'}" style="font-size:${done ? '0.7rem' : '0.4rem'}"></i>
                            </div>
                            <span class="timeline-label">${stepLabels[step]}</span>
                        </div>
                        ${i < steps.length - 1 ? `<div class="timeline-line ${i < currentIdx ? 'done' : ''}"></div>` : ''}
                    `;
    }).join('')}
                </div>
            `}
        </div>
    `;
}

// ══════════════════════════════════════════
//  FROSTED GLASS CONFIRMATION MODAL
// ══════════════════════════════════════════
let _glassResolve = null;

function glassConfirm(title, message, type = 'warning') {
    return new Promise((resolve) => {
        const overlay   = document.getElementById('glassConfirmOverlay');
        const iconWrap  = document.getElementById('glassConfirmIcon');
        const iconEl    = document.getElementById('glassConfirmIconInner');
        const titleEl   = document.getElementById('glassConfirmTitle');
        const msgEl     = document.getElementById('glassConfirmMessage');
        const okBtn     = document.getElementById('glassConfirmOk');
        const cancelBtn = document.getElementById('glassConfirmCancel');
        if (!overlay) { resolve(true); return; }

        titleEl.textContent = title;
        msgEl.textContent   = message;
        iconWrap.className  = `glass-modal-icon ${type}`;
        iconEl.className    = type === 'danger' ? 'fas fa-trash' : type === 'success' ? 'fas fa-check' : 'fas fa-exclamation-triangle';
        okBtn.className     = type === 'danger' ? 'btn btn-danger' : 'btn btn-primary';
        okBtn.textContent   = (window.__dt||{}).confirm||'Confirm';

        _glassResolve = resolve;
        overlay.classList.add('show');

        okBtn.onclick = () => { overlay.classList.remove('show'); resolve(true);  _glassResolve = null; };
        cancelBtn.onclick = () => { overlay.classList.remove('show'); resolve(false); _glassResolve = null; };
        overlay.onclick = (e) => { if (e.target === overlay) { overlay.classList.remove('show'); resolve(false); _glassResolve = null; } };
    });
}

// ══════════════════════════════════════════
//  ORDERS — Premium Cards + Cancel
// ══════════════════════════════════════════
async function loadOrders(page = 1) {
    try {
        const status = document.getElementById('orderStatusFilter')?.value || '';
        const data = await API.get(`/orders?page=${page}&limit=10${status ? `&status=${status}` : ''}`);
        const orders = data.data.orders;
        const container = document.getElementById('ordersTable');

        if (orders.length === 0) {
            container.innerHTML = renderEmptyState('fa-shopping-bag', (window.__dt||{}).noOrdersFound||'No orders found', (window.__dt||{}).emptyOrdersFilterDesc||'Try adjusting your filters or place a new order.', (window.__dt||{}).emptyOrdersCta||'Browse Services', "switchView('services')");
        } else {
            container.innerHTML = orders.map(o => {
                const canCancel = o.status === 'pending';
                return `
                <div class="order-card status-${o.status}">
                    <div class="order-card-header">
                        <div>
                            <div class="order-card-invoice">${esc(o.invoice_number || '—')}</div>
                            <div class="order-card-title">${esc(o.service_title)}</div>
                        </div>
                        <span class="badge badge-${statusColor(o.status)}">${o.status.replace(/_/g,' ')}</span>
                    </div>
                    <div class="order-card-meta">
                        <span class="order-card-price">${Utils.formatCurrency(o.price, o.currency)}</span>
                        <span class="order-card-date"><i class="fas fa-clock" style="margin-right:4px"></i>${relativeTime(o.created_at)}</span>
                    </div>
                    <div class="order-card-actions">
                        <button class="btn btn-ghost btn-sm" onclick="viewOrderTimeline(${o.id},'${esc(o.service_title)}','${esc(o.invoice_number || '')}','${o.status}')" data-tooltip="${(window.__dt||{}).viewTimeline||'View Timeline'}">
                            <i class="fas fa-route"></i> ${(window.__dt||{}).timeline||'Timeline'}
                        </button>
                        ${canCancel ? `<button class="btn btn-danger btn-sm" onclick="cancelOrder(${o.id},'${esc(o.invoice_number || '')}', this)">
                            <i class="fas fa-times-circle"></i> ${(window.__dt||{}).cancel||'Cancel'}
                        </button>` : ''}
                    </div>
                </div>`;
            }).join('');
        }
        renderPagination(data.data.pagination, 'ordersPagination', (p) => loadOrders(p));
    } catch (err) { Toast.error((window.__dt||{}).failedLoadOrders||'Failed to load orders.'); }
}

async function cancelOrder(orderId, invoiceNumber, btn) {
    const dt = window.__dt||{};
    const ok = await glassConfirm(
        dt.cancelOrder||'Cancel Order',
        (dt.cancelOrderConfirm||'Cancel order #%s? This cannot be undone.').replace('%s', invoiceNumber),
        'danger'
    );
    if (!ok) return;
    if (btn) setLoading(btn, true, dt.updating || 'Updating...');
    try {
        await API.put(`/orders/${orderId}/cancel`);
        Toast.success((window.__dt||{}).orderCancelled||'Order cancelled successfully.');
        _cache.invalidate('orders50');
        loadOrders();
    } catch (err) { Toast.error(err.message || (window.__dt||{}).failedCancelOrder||'Failed to cancel order.'); }
    finally { if (btn) setLoading(btn, false); }
}

function viewOrderTimeline(id, title, invoice, status) {
    renderOrderTimeline({ id, service_title: title, invoice_number: invoice, status });
    switchView('overview');
    document.getElementById('orderTimeline')?.scrollIntoView({ behavior: 'smooth' });
}

// ══════════════════════════════════════════
//  SERVICES
// ══════════════════════════════════════════
async function loadServices() {
    try {
        const data = await API.get('/services?limit=12');
        const grid = document.getElementById('dashServicesGrid');
        grid.innerHTML = data.data.services.map(s => {
            const images = Array.isArray(s.images) ? s.images : (typeof s.images === 'string' ? (() => { try { return JSON.parse(s.images); } catch { return []; } })() : []);
            const img = images[0] || '';
            return `
                <div class="service-card">
                    <div class="service-card-image">
                        ${img ? `<img src="${esc(img)}" alt="${esc(s.title)}" loading="lazy">` : '<div class="placeholder-icon"><i class="fas fa-concierge-bell"></i></div>'}
                    </div>
                    <div class="service-card-body">
                        <h3>${esc(s.title)}</h3>
                        <p>${esc(s.description || '')}</p>
                        <div class="service-card-footer">
                            <span class="service-price">${s.price_type === 'range' && s.price_max ? Utils.formatCurrency(s.price, s.currency) + ' – ' + Utils.formatCurrency(s.price_max, s.currency) : Utils.formatCurrency(s.price, s.currency)}</span>
                            <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
                                <button class="ai-sparkle-btn" onclick="showAiPrompt('${s.id}', '${esc(s.title)}')" title="${(window.__dt||{}).aiTooltip||'Let AI write a professional description for you'}">
                                    <i class="fas fa-wand-magic-sparkles sparkle-icon"></i> ${(window.__dt||{}).aiGenerate||'✨ AI'}
                                </button>
                                <button class="btn btn-primary btn-sm" onclick="requestService('${s.id}', this)"><i class="fas fa-plus"></i> ${(window.__dt||{}).request||'Request'}</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    } catch (err) { Toast.error((window.__dt||{}).failedLoadServices||'Failed to load services.'); }
}

// ══════════════════════════════════════════
//  EXHIBITIONS
// ══════════════════════════════════════════
async function loadExhibitions() {
    try {
        const data = await API.get('/exhibitions?limit=20');
        const grid = document.getElementById('dashExhibitionsGrid');
        const exhibitions = data.data.exhibitions;

        if (exhibitions.length === 0) {
            grid.innerHTML = renderEmptyState('fa-calendar-alt', (window.__dt||{}).noExhibitions||'No exhibitions', (window.__dt||{}).checkBackExhibitions||'Check back soon for upcoming events and exhibitions.', '', '');
        } else {
            grid.innerHTML = exhibitions.map(e => `
                <div class="exhibition-card">
                    <h3>${esc(e.title)}</h3>
                    <div class="exhibition-meta">
                        ${e.location ? `<span><i class="fas fa-map-marker-alt"></i>${esc(e.location)}</span>` : ''}
                        ${e.start_date ? `<span><i class="fas fa-calendar"></i>${Utils.formatDate(e.start_date)}${e.end_date ? ' — ' + Utils.formatDate(e.end_date) : ''}</span>` : ''}
                        <span><i class="fas fa-circle" style="color:${e.is_active ? '#10b981' : '#ef4444'};font-size:0.5rem"></i> ${e.is_active ? ((window.__dt||{}).active||'Active') : ((window.__dt||{}).past||'Past')}</span>
                    </div>
                </div>
            `).join('');
        }
    } catch (err) { Toast.error((window.__dt||{}).failedLoadExhibitions||'Failed to load exhibitions.'); }
}

// ══════════════════════════════════════════
//  NOTIFICATIONS
// ══════════════════════════════════════════
async function loadNotifications(page = 1) {
    try {
        const data = await API.get(`/notifications?page=${page}&limit=15`);
        const notifs = data.data.notifications;
        const container = document.getElementById('notificationsList');

        if (notifs.length === 0) {
            container.innerHTML = renderEmptyState('fa-bell-slash', (window.__dt||{}).noNotifications||'No notifications', (window.__dt||{}).allCaughtUp||'You\'re all caught up! We\'ll notify you when something needs your attention.', '', '');
        } else {
            container.innerHTML = notifs.map(n => `
                <div class="card" style="margin-bottom:10px;opacity:${n.is_read ? '0.6' : '1'}">
                    <div style="display:flex;align-items:center;gap:12px">
                        <div style="width:10px;height:10px;border-radius:50%;background:${n.is_read ? 'var(--border-color)' : 'var(--gold)'};flex-shrink:0"></div>
                        <div style="flex:1">
                            <strong style="font-size:0.9rem">${esc(n.title)}</strong>
                            <p style="font-size:0.85rem;margin-top:2px">${esc(n.message)}</p>
                            <span style="font-size:0.75rem;color:var(--text-muted)">${relativeTime(n.created_at)}</span>
                        </div>
                        ${!n.is_read ? `<button class="btn btn-ghost btn-sm" onclick="markNotifRead('${n.id}')"><i class="fas fa-check"></i></button>` : ''}
                    </div>
                </div>
            `).join('');
        }
        renderPagination(data.data.pagination, 'notifPagination', (p) => loadNotifications(p));
    } catch (err) { Toast.error((window.__dt||{}).failedLoadNotifications||'Failed to load notifications.'); }
}

// ══════════════════════════════════════════
//  INVOICES
// ══════════════════════════════════════════
async function loadInvoices(page = 1) {
    try {
        const data = await API.get(`/invoices?page=${page}&limit=10`);
        const invoices = data.data.invoices;
        const tbody = document.getElementById('invoicesTable');

        if (invoices.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6">' + renderEmptyState('fa-file-invoice-dollar', (window.__dt||{}).noInvoicesYet||'No invoices yet', (window.__dt||{}).emptyInvoicesDesc||'Invoices will appear here once you place your first order.', (window.__dt||{}).emptyOrdersCta||'Browse Services', "switchView('services')") + '</td></tr>';
        } else {
            tbody.innerHTML = invoices.map(i => `
                <tr>
                    <td data-label="Invoice" style="font-weight:600">${esc(i.invoice_number)}</td>
                    <td data-label="Service">${esc(i.service_title || '—')}</td>
                    <td data-label="Total">${Utils.formatCurrency(i.total_amount, i.currency)}</td>
                    <td data-label="Status"><span class="badge badge-${i.status === 'generated' ? 'success' : 'info'}">${i.status}</span></td>
                    <td data-label="Date">${relativeTime(i.created_at)}</td>
                    <td data-label="Actions"><a href="/api/invoices/${i.id}/download" class="btn btn-ghost btn-sm" target="_blank"><i class="fas fa-download"></i></a></td>
                </tr>
            `).join('');
        }
        renderPagination(data.data.pagination, 'invoicesPagination', (p) => loadInvoices(p));
    } catch (err) { Toast.error((window.__dt||{}).failedLoadInvoices||'Failed to load invoices.'); }
}

// ══════════════════════════════════════════
//  DASHBOARD-SPECIFIC HELPERS
// ══════════════════════════════════════════
function updateNotifCount(count) {
    const dot = document.getElementById('notifDot');
    const badge = document.getElementById('notifCount');
    if (count > 0) {
        dot?.classList.remove('hidden');
        if (badge) { badge.textContent = count; badge.classList.remove('hidden'); }
    } else {
        dot?.classList.add('hidden');
        badge?.classList.add('hidden');
    }
}

async function requestService(serviceId, btn) {
    if (btn) setLoading(btn, true, (window.__dt||{}).saving || 'Saving...');
    try {
        await API.post('/orders', { service_id: serviceId });
        Toast.success((window.__dt||{}).orderPlaced||'Order placed successfully!');
        _cache.invalidate('orders50'); // Invalidate cache
        switchView('orders');
    } catch (err) { Toast.error(err.message); }
    finally { if (btn) setLoading(btn, false); }
}

async function markNotifRead(id) {
    try {
        await API.put(`/notifications/${id}/read`);
        loadNotifications();
        const data = await API.get('/notifications?limit=1');
        updateNotifCount(data.data.unreadCount || 0);
    } catch (err) { Toast.error(err.message); }
}

// ══════════════════════════════════════════
//  AI CONTENT ASSISTANT
// ══════════════════════════════════════════
let _aiTargetServiceId = null;
let _aiTargetServiceTitle = '';

function showAiPrompt(serviceId, serviceTitle) {
    _aiTargetServiceId = serviceId;
    _aiTargetServiceTitle = serviceTitle;
    const dt = window.__dt || {};
    const overlay = document.getElementById('aiModalOverlay');
    const titleEl = document.getElementById('aiModalTitle');
    const input = document.getElementById('aiPromptInput');
    const hint = document.getElementById('aiModalHint');
    if (titleEl) titleEl.textContent = dt.aiPromptTitle || 'AI Content Assistant';
    if (input) {
        input.value = '';
        input.placeholder = dt.aiPromptPlaceholder || 'Describe your idea briefly...';
    }
    if (hint) hint.textContent = dt.aiPromptHint || 'AI will generate a professional description based on your idea.';
    overlay?.classList.add('show');
    setTimeout(() => input?.focus(), 200);
}

function closeAiModal() {
    document.getElementById('aiModalOverlay')?.classList.remove('show');
    _aiTargetServiceId = null;
}

async function aiGenerate() {
    const dt = window.__dt || {};
    const input = document.getElementById('aiPromptInput');
    const btn = document.getElementById('aiGenerateBtn');
    const prompt = (input?.value || '').trim();

    if (!prompt) {
        Toast.warning(dt.aiPromptPlaceholder || 'Please describe your idea first.');
        input?.focus();
        return;
    }

    btn?.classList.add('loading');
    btn && (btn.disabled = true);

    try {
        const result = await API.post('/ai/generate', {
            prompt,
            context: _aiTargetServiceTitle || 'general',
        });
        const text = result.data?.text || '';
        if (text) {
            Toast.success(dt.aiGenerate || '✨ Content generated!');
            // Close modal and show result in a toast or alert
            closeAiModal();
            // Copy to clipboard for easy pasting
            if (navigator.clipboard) {
                await navigator.clipboard.writeText(text);
                Toast.info(dt.aiCopiedToast || '📋 Generated text copied to clipboard!');
            }
            // Also show in a temporary overlay
            showAiResult(text);
        } else {
            Toast.warning(dt.aiEmptyToast || 'AI returned empty content. Please try a different idea.');
        }
    } catch (err) {
        const msg = err.message || dt.aiError || 'AI is currently resting. Please type manually.';
        if (msg.includes('429') || msg.toLowerCase().includes('rate limit')) {
            Toast.error(dt.aiRateLimited || '⏳ AI rate limit reached. Please wait a few minutes.');
            // Extended cooldown on rate-limit — disable button for 15s
            setTimeout(() => { btn?.classList.remove('loading'); btn && (btn.disabled = false); }, 15000);
            return;
        }
        Toast.error(msg);
    } finally {
        btn?.classList.remove('loading');
        btn && (btn.disabled = false);
    }
}

function showAiResult(text) {
    const dt = window.__dt || {};
    // Create a temporary result overlay
    const existing = document.getElementById('aiResultOverlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'aiResultOverlay';
    overlay.className = 'ai-modal-overlay show';
    overlay.innerHTML = `
        <div class="ai-modal">
            <div class="ai-modal-header">
                <h3><i class="fas fa-wand-magic-sparkles"></i> ${dt.aiGeneratedContent || 'Generated Content'}</h3>
                <button class="ai-modal-close" onclick="document.getElementById('aiResultOverlay')?.remove()">&times;</button>
            </div>
            <div class="ai-modal-body">
                <textarea id="aiResultText" rows="6" style="width:100%;padding:12px;border:1px solid var(--border-color);border-radius:8px;background:var(--surface-2);color:var(--text-1);font-size:0.88rem;font-family:inherit;resize:vertical">${esc(text)}</textarea>
                <div class="ai-modal-actions" style="margin-top:12px">
                    <button class="btn btn-outline btn-sm" onclick="document.getElementById('aiResultOverlay')?.remove()">${dt.close || 'Close'}</button>
                    <button class="btn-ai-generate" onclick="navigator.clipboard?.writeText(document.getElementById('aiResultText')?.value||'');Toast.success('${dt.copied || 'Copied!'}');document.getElementById('aiResultOverlay')?.remove()">
                        <span class="btn-text"><i class="fas fa-copy"></i> ${dt.copyAndClose || 'Copy & Close'}</span>
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

// ══════════════════════════════════════════
//  SMART RECOMMENDATIONS
// ══════════════════════════════════════════
function getServiceRecommendations() {
    const dt = window.__dt || {};
    return {
        advertising: [
            { icon: 'fa-hashtag', title: dt.recSocialTitle || 'Social Media Management', desc: dt.recSocialDesc || 'Amplify your ad campaigns with consistent social media content and community management.' },
            { icon: 'fa-bullhorn', title: dt.recBrandTitle || 'Brand Strategy', desc: dt.recBrandDesc || 'Build a cohesive brand identity that makes your advertising campaigns more effective.' },
        ],
        marketing: [
            { icon: 'fa-chart-line', title: dt.recAnalyticsTitle || 'Digital Analytics', desc: dt.recAnalyticsDesc || 'Track your marketing ROI with comprehensive analytics and data-driven insights.' },
            { icon: 'fa-envelope', title: dt.recEmailTitle || 'Email Marketing', desc: dt.recEmailDesc || 'Convert leads into customers with targeted email campaigns and automation.' },
        ],
        exhibitions: [
            { icon: 'fa-camera', title: dt.recPhotoTitle || 'Event Photography', desc: dt.recPhotoDesc || 'Capture every moment of your exhibition with professional photography services.' },
            { icon: 'fa-video', title: dt.recVideoTitle || 'Video Production', desc: dt.recVideoDesc || 'Create compelling event highlight reels and promotional videos.' },
        ],
        real_estate: [
            { icon: 'fa-vr-cardboard', title: dt.recVirtualTitle || 'Virtual Tours', desc: dt.recVirtualDesc || 'Offer immersive 360° virtual tours of your properties to remote buyers.' },
            { icon: 'fa-drafting-compass', title: dt.recInteriorTitle || 'Interior Design', desc: dt.recInteriorDesc || 'Stage your properties with professional interior design for maximum appeal.' },
        ],
        general: [
            { icon: 'fa-bullhorn', title: dt.recAdsTitle || 'Digital Advertising', desc: dt.recAdsDesc || 'Reach your target audience with data-driven digital advertising campaigns.' },
            { icon: 'fa-palette', title: dt.recBrandIdTitle || 'Brand Identity', desc: dt.recBrandIdDesc || 'Create a memorable brand that stands out from the competition.' },
        ],
    };
}

function loadRecommendations(orders) {
    const dt = window.__dt || {};
    const container = document.getElementById('aiRecommendations');
    if (!container) return;

    const recsData = getServiceRecommendations();
    let category = 'general';
    if (orders && orders.length > 0) {
        const latestCategory = (orders[0].service_category || orders[0].category || '').toLowerCase();
        if (recsData[latestCategory]) {
            category = latestCategory;
        }
    }

    const recs = recsData[category] || recsData.general;

    container.style.display = 'block';
    container.innerHTML = `
        <div class="section-header">
            <h3>
                <i class="fas fa-lightbulb" style="color:var(--gold)"></i>
                ${esc(dt.recommendedForYou || 'Recommended For You')}
                <span class="ai-badge"><i class="fas fa-wand-magic-sparkles"></i> ${esc(dt.smart || 'Smart')}</span>
            </h3>
        </div>
        <div class="recommendations-grid">
            ${recs.map(r => `
                <div class="recommendation-card">
                    <div class="recommendation-card-icon"><i class="fas ${r.icon}"></i></div>
                    <h4>${esc(r.title)}</h4>
                    <p>${esc(r.desc)}</p>
                    <button class="btn-recommend" onclick="switchView('services')">
                        <i class="fas fa-arrow-right"></i> ${esc(dt.request || 'Explore')}
                    </button>
                </div>
            `).join('')}
        </div>
    `;
}

// ══════════════════════════════════════════
//  AI MODAL ONBOARDING TOUR (3-step, first-time only)
// ══════════════════════════════════════════
const AI_TOUR_KEY = 'nabda_ai_tour_done';
let _aiTourActive = false;
let _aiTourStep = 0;

const AI_TOUR_STEPS = [
    {
        target: '#aiPromptInput',
        title: () => (window.__dt || {}).aiTourStep1Title || '✍️ Describe Your Idea',
        desc: () => (window.__dt || {}).aiTourStep1Desc || 'Type a brief description of what you need. The more details, the better the AI output!',
        position: 'bottom',
    },
    {
        target: '#aiGenerateBtn',
        title: () => (window.__dt || {}).aiTourStep2Title || '✨ Generate with AI',
        desc: () => (window.__dt || {}).aiTourStep2Desc || 'Click the sparkle button and the AI will craft a professional description for you instantly.',
        position: 'top',
    },
    {
        target: '.ai-modal-body',
        title: () => (window.__dt || {}).aiTourStep3Title || '📋 Review & Use',
        desc: () => (window.__dt || {}).aiTourStep3Desc || 'Review the generated text, make any edits, then it auto-fills your service request form.',
        position: 'top',
    },
];

function maybeShowAiTour() {
    if (localStorage.getItem(AI_TOUR_KEY)) return;
    if (_aiTourActive) return;
    // Wait a beat so the modal is fully painted
    setTimeout(() => startAiTour(), 400);
}

function startAiTour() {
    _aiTourActive = true;
    _aiTourStep = 0;
    renderAiTourStep();
}

function renderAiTourStep() {
    // Clean previous
    document.querySelectorAll('.ai-tour-overlay, .ai-tour-spotlight, .ai-tour-tooltip').forEach(el => el.remove());

    if (_aiTourStep >= AI_TOUR_STEPS.length) {
        endAiTour();
        return;
    }

    const step = AI_TOUR_STEPS[_aiTourStep];
    const target = document.querySelector(step.target);
    if (!target) { endAiTour(); return; }

    const rect = target.getBoundingClientRect();

    // Overlay
    const overlay = document.createElement('div');
    overlay.className = 'ai-tour-overlay';
    overlay.addEventListener('click', (e) => { if (e.target === overlay) endAiTour(); });

    // Spotlight cutout
    const spotlight = document.createElement('div');
    spotlight.className = 'ai-tour-spotlight';
    const pad = 6;
    spotlight.style.cssText = `top:${rect.top - pad}px;left:${rect.left - pad}px;width:${rect.width + pad * 2}px;height:${rect.height + pad * 2}px;`;

    // Tooltip
    const tooltip = document.createElement('div');
    tooltip.className = 'ai-tour-tooltip';
    const dt = window.__dt || {};

    tooltip.innerHTML = `
        <h4><i class="fas fa-wand-magic-sparkles"></i> ${step.title()}</h4>
        <p>${step.desc()}</p>
        <div class="ai-tour-actions">
            <div class="ai-tour-dots">
                ${AI_TOUR_STEPS.map((_, i) => `<div class="dot${i === _aiTourStep ? ' active' : ''}"></div>`).join('')}
            </div>
            <button class="ai-tour-next" id="aiTourNextBtn">
                ${_aiTourStep < AI_TOUR_STEPS.length - 1 ? (dt.tourNext || 'Next') : (dt.tourFinish || 'Got it!')}
            </button>
        </div>
    `;

    // Position tooltip relative to target
    if (step.position === 'bottom') {
        tooltip.style.top = `${rect.bottom + 12}px`;
        tooltip.style.left = `${rect.left + rect.width / 2 - 140}px`;
    } else {
        tooltip.style.top = `${rect.top - 12}px`;
        tooltip.style.left = `${rect.left + rect.width / 2 - 140}px`;
        tooltip.style.transform = 'translateY(-100%)';
    }

    document.body.appendChild(overlay);
    document.body.appendChild(spotlight);
    document.body.appendChild(tooltip);

    document.getElementById('aiTourNextBtn')?.addEventListener('click', () => {
        _aiTourStep++;
        renderAiTourStep();
    });
}

function endAiTour() {
    _aiTourActive = false;
    localStorage.setItem(AI_TOUR_KEY, '1');
    document.querySelectorAll('.ai-tour-overlay, .ai-tour-spotlight, .ai-tour-tooltip').forEach(el => el.remove());
}

// Patch showAiPrompt to trigger the tour on first open
const _origShowAiPrompt = showAiPrompt;
showAiPrompt = function (serviceId, serviceTitle) {
    _origShowAiPrompt(serviceId, serviceTitle);
    maybeShowAiTour();
};

