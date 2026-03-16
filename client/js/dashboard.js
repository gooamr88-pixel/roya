// ═══════════════════════════════════════════════
// Client Dashboard JS V2.0 — Control Center
// Features: Animated counters, data caching, keyboard
// shortcuts, skeleton loading, exhibitions, time greeting
// ═══════════════════════════════════════════════

let currentUser = null;
const _cache = {};
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
async function initAuth() {
    try {
        const data = await API.get('/auth/me');
        currentUser = data.data.user;
        updateUserUI();
        loadOverview();
    } catch {
        window.location.href = '/login';
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
    document.getElementById('sidebarToggle')?.addEventListener('click', () => document.getElementById('sidebar').classList.add('open'));
    document.getElementById('sidebarClose')?.addEventListener('click', () => document.getElementById('sidebar').classList.remove('open'));
}

// ── Logout with glass confirm ──
function initLogout() {
    document.getElementById('logoutBtn')?.addEventListener('click', async () => {
        const dt = window.__dt || {};
        const ok = await glassConfirm(dt.logOut || 'Log Out', dt.logOutConfirm || 'Are you sure you want to log out?', 'warning');
        if (!ok) return;
        try { await API.post('/auth/logout'); } catch { }
        window.location.href = '/login';
    });
}

// ══════════════════════════════════════════
//  OVERVIEW — Stats + Timeline + Recent Orders
// ══════════════════════════════════════════
async function loadOverview() {
    try {
        const [ordersData, notifData] = await Promise.all([
            _cache.orders50 || API.get('/orders?limit=50'),
            API.get('/notifications?limit=1'),
        ]);
        _cache.orders50 = ordersData;

        const orders = ordersData.data.orders;
        const activeOrders = orders.filter(o => ['pending', 'in_progress', 'confirmed'].includes(o.status));
        const completed = orders.filter(o => o.status === 'completed').length;
        const totalSpent = orders.reduce((sum, o) => sum + (parseFloat(o.price) || 0), 0);
        const unread = notifData.data.unreadCount || 0;

        // Animated counters
        animateCounter(document.getElementById('statOrders'), activeOrders.length);
        animateCounter(document.getElementById('statCompleted'), completed);
        animateCounter(document.getElementById('statSpent'), totalSpent, '$');
        animateCounter(document.getElementById('statNotifications'), unread);
        updateNotifCount(unread);

        // ── Order Timeline (most recent active order) ──
        renderOrderTimeline(activeOrders[0] || orders[0]);

        // ── Recent orders table ──
        const tbody = document.getElementById('recentOrdersTable');
        if (orders.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center" style="padding:40px;color:var(--text-muted)"><i class="fas fa-inbox" style="font-size:2rem;display:block;margin-bottom:10px"></i>' + ((window.__dt || {}).noOrdersYet || 'No orders yet') + '</td></tr>';
        } else {
            tbody.innerHTML = orders.slice(0, 5).map(o => `
                <tr>
                    <td data-label="Invoice" style="font-weight:600">${esc(o.invoice_number || '—')}</td>
                    <td data-label="Service">${esc(o.service_title)}</td>
                    <td data-label="Amount">${Utils.formatCurrency(o.price)}</td>
                    <td data-label="Status"><span class="badge badge-${statusColor(o.status)}">${o.status.replace(/_/g, ' ')}</span></td>
                    <td data-label="Date">${relativeTime(o.created_at)}</td>
                </tr>
            `).join('');
        }
    } catch (err) { console.error('Overview error:', err); }
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
            container.innerHTML = `<div style="grid-column:1/-1;padding:60px;text-align:center;color:var(--text-3)">
                <i class="fas fa-inbox" style="font-size:2.5rem;display:block;margin-bottom:12px;opacity:0.4"></i>
                No orders found
            </div>`;
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
                        <span class="order-card-price">${Utils.formatCurrency(o.price)}</span>
                        <span class="order-card-date"><i class="fas fa-clock" style="margin-right:4px"></i>${relativeTime(o.created_at)}</span>
                    </div>
                    <div class="order-card-actions">
                        <button class="btn btn-ghost btn-sm" onclick="viewOrderTimeline(${o.id},'${esc(o.service_title)}','${esc(o.invoice_number || '')}','${o.status}')" data-tooltip="${(window.__dt||{}).viewTimeline||'View Timeline'}">
                            <i class="fas fa-route"></i> ${(window.__dt||{}).timeline||'Timeline'}
                        </button>
                        ${canCancel ? `<button class="btn btn-danger btn-sm" onclick="cancelOrder(${o.id},'${esc(o.invoice_number || '')}')">
                            <i class="fas fa-times-circle"></i> ${(window.__dt||{}).cancel||'Cancel'}
                        </button>` : ''}
                    </div>
                </div>`;
            }).join('');
        }
        renderPagination(data.data.pagination, 'ordersPagination', (p) => loadOrders(p));
    } catch (err) { Toast.error((window.__dt||{}).failedLoadOrders||'Failed to load orders.'); }
}

async function cancelOrder(orderId, invoiceNumber) {
    const dt = window.__dt||{};
    const ok = await glassConfirm(
        dt.cancelOrder||'Cancel Order',
        (dt.cancelOrderConfirm||'Cancel order #%s? This cannot be undone.').replace('%s', invoiceNumber),
        'danger'
    );
    if (!ok) return;
    try {
        await API.put(`/orders/${orderId}/cancel`);
        Toast.success((window.__dt||{}).orderCancelled||'Order cancelled successfully.');
        _cache.orders50 = null;
        loadOrders();
    } catch (err) { Toast.error(err.message || (window.__dt||{}).failedCancelOrder||'Failed to cancel order.'); }
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
                            <span class="service-price">${Utils.formatCurrency(s.price)}</span>
                            <button class="btn btn-primary btn-sm" onclick="requestService('${s.id}')"><i class="fas fa-plus"></i> ${(window.__dt||{}).request||'Request'}</button>
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
            grid.innerHTML = '<div class="empty-state"><div class="icon"><i class="fas fa-calendar-alt"></i></div><h3>' + ((window.__dt||{}).noExhibitions||'No exhibitions') + '</h3><p>' + ((window.__dt||{}).checkBackExhibitions||'Check back soon for upcoming events.') + '</p></div>';
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
            container.innerHTML = '<div class="empty-state"><div class="icon"><i class="fas fa-bell-slash"></i></div><h3>' + ((window.__dt||{}).noNotifications||'No notifications') + '</h3><p>' + ((window.__dt||{}).allCaughtUp||'You\'re all caught up!') + '</p></div>';
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
            tbody.innerHTML = '<tr><td colspan="6" class="text-center" style="padding:40px;color:var(--text-muted)">' + ((window.__dt||{}).noInvoicesYet||'No invoices yet') + '</td></tr>';
        } else {
            tbody.innerHTML = invoices.map(i => `
                <tr>
                    <td data-label="Invoice" style="font-weight:600">${esc(i.invoice_number)}</td>
                    <td data-label="Service">${esc(i.service_title || '—')}</td>
                    <td data-label="Total">${Utils.formatCurrency(i.total_amount)}</td>
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

async function requestService(serviceId) {
    try {
        await API.post('/orders', { service_id: serviceId });
        Toast.success((window.__dt||{}).orderPlaced||'Order placed successfully!');
        _cache.orders50 = null; // Invalidate cache
        switchView('orders');
    } catch (err) { Toast.error(err.message); }
}

async function markNotifRead(id) {
    try {
        await API.put(`/notifications/${id}/read`);
        loadNotifications();
        const data = await API.get('/notifications?limit=1');
        updateNotifCount(data.data.unreadCount || 0);
    } catch (err) { Toast.error(err.message); }
}
