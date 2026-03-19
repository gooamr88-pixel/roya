// ═══════════════════════════════════════════════
// Admin V2.0 — Init, Auth, Navigation, Sidebar,
// Search, Command Palette, Live Clock, Confirm Dialog,
// Shared Utilities (Form Tabs, Featured, Bulk Actions)
// Depends on: api.js, utils.js
// ═══════════════════════════════════════════════

// ── Global `esc()` is now provided by utils.js (loaded first). ──
// We do NOT re-declare it here. If you see a ReferenceError for esc(),
// it means utils.js failed to load — check the network tab.

let adminUser = null;
let selectedSvc = new Set();
let selectedProp = new Set();

const ADMIN_VIEW_KEYS = ['stats', 'orders', 'services', 'exhibitions', 'jobs', 'portfolio', 'messages', 'users', 'roles', 'logs'];

document.addEventListener('DOMContentLoaded', () => {
    initAdminAuth();
    initAdminNav();
    initAdminSidebar();
    initAdminLogout();
    initGlobalSearch();
    initCommandPalette();
    initKeyboardShortcuts();
    initLiveClock();
});

// ══════════════════════════════════════════
//  AUTH CHECK
// ══════════════════════════════════════════
async function initAdminAuth() {
    try {
        const data = await API.get('/auth/me');
        adminUser = data.data.user;
        if (!['super_admin', 'admin', 'supervisor'].includes(adminUser.role)) {
            window.location.href = '/dashboard';
            return;
        }
        updateAdminUI();
        loadStats();
    } catch {
        window.location.href = '/login';
    }
}

function updateAdminUI() {
    const initials = (adminUser.name || 'A').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const el = (id) => document.getElementById(id);
    if (el('adminAvatar')) el('adminAvatar').textContent = initials;
    if (el('adminName'))  el('adminName').textContent  = adminUser.name || 'Admin';
    if (el('adminRole'))  el('adminRole').textContent  = (adminUser.role || '').replace(/_/g, ' ');

    // Show "Clear All Logs" button only for super_admin
    const clearLogsBtn = document.getElementById('clearLogsBtn');
    if (clearLogsBtn && adminUser.role === 'super_admin') {
        clearLogsBtn.style.removeProperty('display');
    }
}

// ══════════════════════════════════════════
//  NAVIGATION
// ══════════════════════════════════════════
const adminViewTitles = {
    stats: document.querySelector('[data-view="stats"]')?.textContent?.trim() || 'Executive Insights',
    orders: document.querySelector('[data-view="orders"]')?.textContent?.trim() || 'Orders',
    services: document.querySelector('[data-view="services"]')?.textContent?.trim() || 'Services',
    exhibitions: document.querySelector('[data-view="exhibitions"]')?.textContent?.trim() || 'Exhibitions',
    jobs: document.querySelector('[data-view="jobs"]')?.textContent?.trim() || 'Jobs',
    portfolio: document.querySelector('[data-view="portfolio"]')?.textContent?.trim() || 'Portfolio',
    messages: document.querySelector('[data-view="messages"]')?.textContent?.trim() || 'Ticket Center',
    users: document.querySelector('[data-view="users"]')?.textContent?.trim() || 'User Management',
    roles: document.querySelector('[data-view="roles"]')?.textContent?.trim() || 'Roles',
    logs: document.querySelector('[data-view="logs"]')?.textContent?.trim() || 'Login Logs',
};

function initAdminNav() {
    document.querySelectorAll('[data-view]').forEach(link => {
        link.addEventListener('click', () => switchAdminView(link.dataset.view));
    });
}

function switchAdminView(viewName) {
    document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
    const target = document.getElementById(`view-${viewName}`);
    if (target) target.classList.add('active');
    document.querySelector(`.sidebar-link[data-view="${viewName}"]`)?.classList.add('active');
    document.getElementById('viewTitle').textContent = adminViewTitles[viewName] || viewName;

    // Update breadcrumb
    const bc = document.getElementById('adminBreadcrumbCurrent');
    if (bc) bc.textContent = adminViewTitles[viewName] || viewName;

    const loaders = {
        stats: loadStats, orders: loadAdminOrders, services: loadAdminServices,
        exhibitions: loadAdminExhibitions, jobs: loadAdminJobs,
        portfolio: loadAdminPortfolio,
        messages: loadAdminMessages, users: loadAdminUsers,
        roles: loadAdminRoles, logs: loadAdminLogs,
    };
    if (loaders[viewName]) loaders[viewName]();
    document.getElementById('sidebar')?.classList.remove('open');
}

function initAdminSidebar() {
    document.getElementById('sidebarToggle')?.addEventListener('click', () => document.getElementById('sidebar').classList.add('open'));
    document.getElementById('sidebarClose')?.addEventListener('click', () => document.getElementById('sidebar').classList.remove('open'));
}

function initAdminLogout() {
    document.getElementById('logoutBtn')?.addEventListener('click', async () => {
        const ok = await glassConfirm(__t?.logOut || 'Log Out', __t?.logOutMessage || 'Are you sure you want to log out of the admin panel?', 'warning');
        if (!ok) return;
        try { await API.post('/auth/logout'); } catch { }
        window.location.href = '/login';
    });
}

// ══════════════════════════════════════════
//  KEYBOARD SHORTCUTS
// ══════════════════════════════════════════
function initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        if (e.target.matches('input, textarea, select')) return;

        // Cmd/Ctrl+K for command palette
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            toggleCommandPalette();
            return;
        }

        // Number keys 1-9 for views
        const num = parseInt(e.key);
        if (num >= 1 && num <= 9 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            if (ADMIN_VIEW_KEYS[num - 1]) switchAdminView(ADMIN_VIEW_KEYS[num - 1]);
        }
        if (e.key === 'Escape') {
            document.getElementById('sidebar')?.classList.remove('open');
            closeCommandPalette();
        }
    });
}

// ══════════════════════════════════════════
//  LIVE CLOCK
// ══════════════════════════════════════════
function initLiveClock() {
    const clockEl = document.getElementById('liveClock');
    if (!clockEl) return;
    function tick() {
        const now = new Date();
        clockEl.textContent = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
    tick();
    setInterval(tick, 1000);
}

// ══════════════════════════════════════════
//  FROSTED GLASS CONFIRMATION DIALOG (V2.0)
//  Replaces native confirm() and all old modal confirmations
// ══════════════════════════════════════════
let _glassResolve = null;

function glassConfirm(title, message, type = 'warning') {
    return new Promise((resolve) => {
        const overlay = document.getElementById('glassConfirmOverlay');
        const iconWrap = document.getElementById('glassConfirmIcon');
        const iconEl = document.getElementById('glassConfirmIconInner');
        const titleEl = document.getElementById('glassConfirmTitle');
        const msgEl = document.getElementById('glassConfirmMessage');
        const okBtn = document.getElementById('glassConfirmOk');
        const cancelBtn = document.getElementById('glassConfirmCancel');
        if (!overlay) { resolve(true); return; }

        titleEl.textContent = title;
        msgEl.textContent = message;
        iconWrap.className = `glass-modal-icon ${type}`;
        iconEl.className = type === 'danger' ? 'fas fa-trash' : type === 'success' ? 'fas fa-check-circle' : 'fas fa-exclamation-triangle';
        okBtn.className = type === 'danger' ? 'btn btn-danger' : 'btn btn-primary';
        okBtn.textContent = 'Confirm';

        _glassResolve = resolve;
        overlay.classList.add('show');

        okBtn.onclick = () => { overlay.classList.remove('show'); resolve(true); _glassResolve = null; };
        cancelBtn.onclick = () => { overlay.classList.remove('show'); resolve(false); _glassResolve = null; };
        overlay.onclick = (e) => { if (e.target === overlay) { overlay.classList.remove('show'); resolve(false); _glassResolve = null; } };
    });
}

// Alias for backwards compat with older code
const confirmAction = (title, msg, type) => glassConfirm(title, msg, type);
function closeConfirmModal() {
    document.getElementById('glassConfirmOverlay')?.classList.remove('show');
    if (_glassResolve) { _glassResolve(false); _glassResolve = null; }
}

// ══════════════════════════════════════════
//  FORM TAB SWITCHING (Shared by all modals)
//  FIX (F1): This function was called in every tabbed modal
//  (Services, Properties, Exhibitions) but NEVER DEFINED,
//  causing a ReferenceError and breaking all modal tab navigation.
// ══════════════════════════════════════════
/**
 * switchFormTab(activeTabBtnId, formId)
 *
 * Activates a tab button and shows its associated pane inside a form.
 * Each tab button has a data-tab attribute pointing to the pane's ID.
 *
 * @param {string} activeTabBtnId - The ID of the tab button to activate
 * @param {string} formId - The ID of the parent form (used to scope the query)
 */
function switchFormTab(activeTabBtnId, formId) {
    const form = document.getElementById(formId);
    if (!form) return;

    // Find the closest modal-content ancestor (tabs live outside the <form> in some modals)
    const container = form.closest('.modal-content') || form;

    // Deactivate all tab buttons within this container
    container.querySelectorAll('.form-tab-btn').forEach(btn => btn.classList.remove('active'));

    // Hide all panes within this container
    container.querySelectorAll('.form-tab-pane').forEach(pane => pane.classList.remove('active'));

    // Activate the clicked tab button
    const activeBtn = document.getElementById(activeTabBtnId);
    if (activeBtn) {
        activeBtn.classList.add('active');
        // Show the target pane
        const paneId = activeBtn.dataset.tab;
        const pane = document.getElementById(paneId);
        if (pane) pane.classList.add('active');
    }
}

// ══════════════════════════════════════════
//  WIZARD MULTI-STEP NAVIGATION
//  Used by Job and Portfolio modals
// ══════════════════════════════════════════
function wizardNext(formId) {
    const form = document.getElementById(formId);
    if (!form) return;
    const panes = form.querySelectorAll('.wizard-pane');
    const stepsContainer = form.querySelector('.wizard-steps');
    let currentIdx = -1;
    panes.forEach((p, i) => { if (p.classList.contains('active')) currentIdx = i; });
    if (currentIdx < 0 || currentIdx >= panes.length - 1) return;

    // Validate required fields in current pane before advancing
    const currentPane = panes[currentIdx];
    const requiredFields = currentPane.querySelectorAll('[required]');
    let valid = true;
    requiredFields.forEach(f => { if (!f.value.trim()) { f.focus(); valid = false; } });
    if (!valid) return;

    panes[currentIdx].classList.remove('active');
    panes[currentIdx + 1].classList.add('active');
    updateWizardSteps(stepsContainer, currentIdx + 1);
}

function wizardPrev(formId) {
    const form = document.getElementById(formId);
    if (!form) return;
    const panes = form.querySelectorAll('.wizard-pane');
    const stepsContainer = form.querySelector('.wizard-steps');
    let currentIdx = -1;
    panes.forEach((p, i) => { if (p.classList.contains('active')) currentIdx = i; });
    if (currentIdx <= 0) return;

    panes[currentIdx].classList.remove('active');
    panes[currentIdx - 1].classList.add('active');
    updateWizardSteps(stepsContainer, currentIdx - 1);
}

function updateWizardSteps(container, activeIdx) {
    if (!container) return;
    const steps = container.querySelectorAll('.wizard-step');
    const lines = container.querySelectorAll('.wizard-step-line');
    steps.forEach((step, i) => {
        step.classList.remove('active', 'completed');
        if (i < activeIdx) step.classList.add('completed');
        else if (i === activeIdx) step.classList.add('active');
    });
    lines.forEach((line, i) => {
        line.classList.toggle('done', i < activeIdx);
    });
}

function resetWizard(formId) {
    const form = document.getElementById(formId);
    if (!form) return;
    const panes = form.querySelectorAll('.wizard-pane');
    const stepsContainer = form.querySelector('.wizard-steps');
    panes.forEach((p, i) => p.classList.toggle('active', i === 0));
    updateWizardSteps(stepsContainer, 0);
}

// ══════════════════════════════════════════
//  FEATURED TOGGLE (Shared by Services + Properties)
//  FIX (F4): Moved here from admin.properties.js so all
//  modules can use it without depending on properties loading first.
// ══════════════════════════════════════════
async function toggleFeatured(type, id, featured) {
    try {
        // API.put() sends JSON body — no FormData, no Multer interference
        await API.put(`/${type}/${id}`, { is_featured: featured });
        Toast.success(featured ? (__t?.markedFeatured || 'Marked as featured!') : (__t?.removedFeatured || 'Removed from featured.'));
        if (type === 'services') loadAdminServices();
        else loadAdminProperties();
    } catch (err) {
        Toast.error(err.message || (__t?.failedSave || 'Failed to update featured status.'));
    }
}

// ══════════════════════════════════════════
//  BULK SELECT & DELETE (Shared by Services + Properties)
//  FIX (F4): Moved here from admin.properties.js
// ══════════════════════════════════════════
function toggleBulkSelect(prefix, id, checked) {
    const set = prefix === 'svc' ? selectedSvc : selectedProp;
    if (checked) set.add(id); else set.delete(id);
    updateBulkInfo(prefix);
}

function toggleAllCheckboxes(prefix) {
    const selectAll = document.getElementById(`${prefix}SelectAll`);
    const checkboxes = document.querySelectorAll(`.${prefix}-checkbox`);
    const set = prefix === 'svc' ? selectedSvc : selectedProp;
    set.clear();
    checkboxes.forEach(cb => {
        cb.checked = selectAll.checked;
        if (selectAll.checked) set.add(cb.value);
    });
    updateBulkInfo(prefix);
}

function updateBulkInfo(prefix) {
    const set = prefix === 'svc' ? selectedSvc : selectedProp;
    const el = document.getElementById(`${prefix}BulkInfo`);
    if (!el) return;
    if (set.size === 0) {
        el.innerHTML = '';
    } else {
        const type = prefix === 'svc' ? 'services' : 'properties';
        el.innerHTML = `
            <strong>${set.size} ${__t?.selected || 'selected'}</strong> —
            <button class="btn btn-ghost btn-sm" onclick="bulkDelete('${type}', '${prefix}')" style="color:var(--danger)"><i class="fas fa-trash"></i> ${__t?.deleteSelected || 'Delete Selected'}</button>
        `;
    }
}

async function bulkDelete(type, prefix) {
    const set = prefix === 'svc' ? selectedSvc : selectedProp;
    if (set.size === 0) return;
    const confirmed = await glassConfirm(__t?.bulkDeactivate || 'Bulk Deactivate', `${__t?.confirmDeactivate || 'Deactivate'} ${set.size} ${type}?`, 'danger');
    if (!confirmed) return;

    let success = 0;
    for (const id of set) {
        try { await API.delete(`/${type}/${id}`); success++; } catch { }
    }
    Toast.success(`${success} ${type} ${__t?.deactivated || 'deactivated.'}`);
    set.clear();
    if (type === 'services') loadAdminServices();
    else loadAdminProperties();
}

// ══════════════════════════════════════════
//  COMMAND PALETTE
// ══════════════════════════════════════════
function initCommandPalette() {
    const overlay = document.getElementById('commandPalette');
    const input = document.getElementById('cmdInput');
    const results = document.getElementById('cmdResults');
    if (!overlay || !input) return;

    const commands = ADMIN_VIEW_KEYS.map((key, i) => ({
        label: adminViewTitles[key] || key,
        icon: ['fa-chart-line', 'fa-shopping-bag', 'fa-concierge-bell', 'fa-calendar', 'fa-briefcase', 'fa-images', 'fa-headset', 'fa-users-cog', 'fa-shield-halved', 'fa-file-lines'][i],
        action: () => switchAdminView(key),
        shortcut: i < 9 ? String(i + 1) : '0',
    }));
    commands.push(
        { label: 'Switch to Client View', icon: 'fa-exchange-alt', action: () => window.location.href = '/dashboard' },
        { label: 'Logout', icon: 'fa-sign-out-alt', action: () => document.getElementById('logoutBtn')?.click() },
    );

    function render(filter = '') {
        const filtered = filter
            ? commands.filter(c => c.label.toLowerCase().includes(filter.toLowerCase()))
            : commands;
        results.innerHTML = filtered.map((c, i) => `
            <div class="command-palette-item ${i === 0 ? 'active' : ''}" data-idx="${i}">
                <div class="cmd-icon"><i class="fas ${c.icon}"></i></div>
                <span>${c.label}</span>
                ${c.shortcut ? `<span class="cmd-shortcut">${c.shortcut}</span>` : ''}
            </div>
        `).join('') || '<div style="padding:20px;text-align:center;color:var(--text-3);font-size:0.85rem">No matching commands</div>';

        results.querySelectorAll('.command-palette-item').forEach(item => {
            item.addEventListener('click', () => {
                const idx = parseInt(item.dataset.idx);
                if (filtered[idx]) { closeCommandPalette(); filtered[idx].action(); }
            });
        });
    }

    input.addEventListener('input', () => render(input.value.trim()));
    input.addEventListener('keydown', (e) => {
        const items = results.querySelectorAll('.command-palette-item');
        let activeIdx = [...items].findIndex(el => el.classList.contains('active'));
        if (e.key === 'ArrowDown') { e.preventDefault(); items[activeIdx]?.classList.remove('active'); activeIdx = (activeIdx + 1) % items.length; items[activeIdx]?.classList.add('active'); items[activeIdx]?.scrollIntoView({ block: 'nearest' }); }
        if (e.key === 'ArrowUp') { e.preventDefault(); items[activeIdx]?.classList.remove('active'); activeIdx = (activeIdx - 1 + items.length) % items.length; items[activeIdx]?.classList.add('active'); items[activeIdx]?.scrollIntoView({ block: 'nearest' }); }
        if (e.key === 'Enter') { e.preventDefault(); items[activeIdx]?.click(); }
        if (e.key === 'Escape') { closeCommandPalette(); }
    });

    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeCommandPalette(); });
    render();
}

function toggleCommandPalette() {
    const overlay = document.getElementById('commandPalette');
    if (overlay.classList.contains('show')) { closeCommandPalette(); }
    else { overlay.classList.add('show'); document.getElementById('cmdInput').value = ''; document.getElementById('cmdInput').focus(); }
}

function closeCommandPalette() {
    document.getElementById('commandPalette')?.classList.remove('show');
}

// ══════════════════════════════════════════
//  CSV EXPORT
// ══════════════════════════════════════════
function exportTableCSV(tableId, filename) {
    const table = document.getElementById(tableId);
    if (!table) return;
    const rows = table.querySelectorAll('tr');
    const csv = [];
    rows.forEach(row => {
        const cols = row.querySelectorAll('td, th');
        const rowData = [];
        cols.forEach(col => rowData.push('"' + col.textContent.trim().replace(/"/g, '""') + '"'));
        if (rowData.length > 0) csv.push(rowData.join(','));
    });
    const blob = new Blob([csv.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    Toast.success(`${filename} exported!`);
}

// ══════════════════════════════════════════
//  GLOBAL SEARCH
// ══════════════════════════════════════════
function initGlobalSearch() {
    const input = document.getElementById('globalSearchInput');
    const results = document.getElementById('searchResults');
    if (!input || !results) return;

    let searchTimeout;
    input.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        const q = input.value.trim();
        if (q.length < 2) { results.classList.remove('show'); return; }
        searchTimeout = setTimeout(async () => {
            try {
                const data = await API.get(`/admin/search?q=${encodeURIComponent(q)}`);
                const items = data.data.results;
                if (items.length === 0) {
                    results.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-3);font-size:0.85rem">No results found</div>';
                } else {
                    const typeIcons = { user: 'fa-user', order: 'fa-shopping-bag', property: 'fa-building', service: 'fa-concierge-bell' };
                    const typeColors = { user: '#a855f7', order: '#3b82f6', property: '#10b981', service: '#f59e0b' };
                    results.innerHTML = items.map(item => `
                        <div class="search-result-item" onclick="navigateSearchResult('${item.type}', '${item.id}')">
                            <i class="fas ${typeIcons[item.type] || 'fa-circle'}" style="color:${typeColors[item.type]};width:20px;text-align:center"></i>
                            <div style="flex:1">
                                <div style="font-weight:600">${esc(item.name || item.title || item.invoice_number || '—')}</div>
                                ${item.email ? `<div style="font-size:0.75rem;color:var(--text-3)">${esc(item.email)}</div>` : ''}
                                ${item.location ? `<div style="font-size:0.75rem;color:var(--text-3)">${esc(item.location)}</div>` : ''}
                            </div>
                            <span class="search-type-badge" style="background:${typeColors[item.type]}20;color:${typeColors[item.type]}">${item.type}</span>
                        </div>
                    `).join('');
                }
                results.classList.add('show');
            } catch { results.classList.remove('show'); }
        }, 300);
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.global-search')) results.classList.remove('show');
    });
}

function navigateSearchResult(type, id) {
    document.getElementById('searchResults').classList.remove('show');
    document.getElementById('globalSearchInput').value = '';
    const viewMap = { user: 'users', order: 'orders', property: 'properties', service: 'services' };
    switchAdminView(viewMap[type] || 'stats');
}

// ══════════════════════════════════════════
//  ANIMATED COUNTER (shared for admin)
// ══════════════════════════════════════════
function animateAdminCounter(el, target, prefix = '', suffix = '', duration = 800) {
    if (!el) return;
    const startTime = performance.now();
    const isFloat = String(target).includes('.');
    function tick(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = target * eased;
        el.textContent = prefix + (isFloat ? current.toFixed(2) : Math.round(current)) + suffix;
        if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
}
