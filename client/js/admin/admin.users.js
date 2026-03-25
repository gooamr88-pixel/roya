// ═══════════════════════════════════════════════
// Admin V2.0 — Users, Roles, Login Logs
// Depends on: api.js, utils.js, admin.init.js
// ═══════════════════════════════════════════════
// FIX (F2): Removed dead loadAdminExhibitions() stub that was
// shadowing the real implementation in admin.exhibitions.js.

// ══════════════════════════════════════════
//  USERS — Role Change + Ban/Unban
// ══════════════════════════════════════════
let userSearchTimeout;
async function loadAdminUsers(page = 1) {
    clearTimeout(userSearchTimeout);
    userSearchTimeout = setTimeout(async () => {
        try {
            const search = document.getElementById('userSearch')?.value || '';
            const url = `/admin/users?page=${page}&limit=20${search ? `&search=${encodeURIComponent(search)}` : ''}`;
            const data = await API.get(url);
            const users = data.data.users;
            const tbody = document.getElementById('adminUsersTable');

            let roles = [];
            try { const rolesData = await API.get('/admin/roles'); roles = rolesData.data.roles; } catch { }

            if (users.length === 0) {
                tbody.innerHTML = `<tr><td colspan="8" class="text-center" style="padding:40px;color:var(--text-muted)">${__t?.noResultsFound || 'No users found'}</td></tr>`;
            } else {
                tbody.innerHTML = users.map(u => buildUserRow(u, roles)).join('');
            }
            renderPagination(data.data.pagination, 'adminUsersPagination', loadAdminUsers);
        } catch (err) { Toast.error(__t?.failedLoad || 'Failed to load users.'); }
    }, 300);
}

/**
 * highlightText(text, query)
 * XSS-safe: escapes text first, then wraps matched substring.
 * Returns raw HTML string — only inject with innerHTML.
 */
function highlightText(text, query) {
    const escaped = esc(String(text ?? ''));
    if (!query || !query.trim()) return escaped;
    const safeQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return escaped.replace(
        new RegExp(`(${safeQuery})`, 'gi'),
        '<mark class="search-highlight">$1</mark>'
    );
}

function buildUserRow(u, roles) {
    const initials = (u.name || 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const canEdit = adminUser.role === 'super_admin' || adminUser.role === 'admin';
    const searchQuery = (document.getElementById('userSearch')?.value || '').trim();
    return `<tr>
        <td data-label="User">
            <div style="display:flex;align-items:center;gap:10px">
                <div style="width:32px;height:32px;border-radius:50%;background:var(--bg-secondary);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.75rem;color:var(--accent-primary);border:1px solid var(--border-color)">${initials}</div>
                <div><div style="font-weight:600">${highlightText(u.name, searchQuery)}</div><div style="font-size:0.7rem;color:var(--text-muted)">ID: ${u.id}</div></div>
            </div>
        </td>
        <td data-label="Email" style="font-size:0.85rem">${highlightText(u.email, searchQuery)}</td>
        <td data-label="Phone" style="font-size:0.85rem">${esc(u.phone || '—')}</td>
        <td data-label="Role">
            <select class="role-select" onchange="changeUserRole(${u.id}, this.value)" ${!canEdit ? 'disabled' : ''}>
                ${roles.map(r => `<option value="${r.name}" ${(u.role || 'client') === r.name ? 'selected' : ''}>${__t?.roleNames?.[r.name] || r.name.replace(/_/g, ' ')}</option>`).join('')}
            </select>
        </td>
        <td data-label="Status">
            <span class="badge badge-${u.is_active ? 'success' : 'danger'}" style="cursor:pointer" onclick="toggleUserBan(${u.id}, ${u.is_active})" title="Click to ${u.is_active ? 'ban' : 'unban'}">
                <i class="fas fa-${u.is_active ? 'check-circle' : 'ban'}"></i> ${u.is_active ? 'Active' : 'Banned'}
            </span>
        </td>
        <td data-label="Verified"><i class="fas fa-${u.is_verified ? 'check' : 'times'}" style="color:${u.is_verified ? 'var(--success)' : 'var(--danger)'}"></i></td>
        <td data-label="Last Login" style="font-size:0.8rem">${u.last_login ? Utils.formatDate(u.last_login) : '<span style="color:var(--text-muted)">Never</span>'}</td>
        <td data-label="Actions">
            <button class="btn btn-ghost btn-sm" onclick="toggleUserBan(${u.id}, ${u.is_active})" data-tooltip="${u.is_active ? 'Ban' : 'Unban'}" style="color:${u.is_active ? 'var(--danger)' : 'var(--success)'}">
                <i class="fas fa-${u.is_active ? 'user-slash' : 'user-check'}"></i>
            </button>
        </td>
    </tr>`;
}

async function changeUserRole(userId, roleName) {
    try {
        await API.put(`/admin/users/${userId}`, { role_name: roleName });
        Toast.success(`${__t?.roleChanged || 'Role changed to'} ${__t?.roleNames?.[roleName] || roleName.replace(/_/g, ' ')}`);
    } catch (err) { Toast.error(err.message); loadAdminUsers(); }
}

async function toggleUserBan(userId, isCurrentlyActive) {
    const action = isCurrentlyActive ? 'ban' : 'unban';
    const confirmed = await confirmAction(
        `${action === 'ban' ? (__t?.banUser || 'Ban User') : (__t?.unbanUser || 'Unban User')}`,
        action === 'ban' ? (__t?.banConfirm || `Are you sure you want to ban this user?`) : (__t?.unbanConfirm || `Are you sure you want to unban this user?`),
        isCurrentlyActive ? 'danger' : 'warning'
    );
    if (!confirmed) return;
    try {
        // BUG FIX #9: Also send ban_type so auth middleware can distinguish ban reason.
        // When banning: set ban_type='permanent', is_active=false
        // When unbanning: clear ban_type=null, is_active=true
        const payload = isCurrentlyActive
            ? { is_active: false, ban_type: 'permanent' }
            : { is_active: true, ban_type: null };
        await API.put(`/admin/users/${userId}`, payload);
        Toast.success(isCurrentlyActive ? (__t?.userBanned || 'User banned successfully.') : (__t?.userUnbanned || 'User unbanned successfully.'));
        loadAdminUsers();
    } catch (err) { Toast.error(err.message); }
}

// ══════════════════════════════════════════
//  ROLES
// ══════════════════════════════════════════
async function loadAdminRoles() {
    try {
        const data = await API.get('/admin/roles');
        const roles = data.data.roles;
        const tbody = document.getElementById('adminRolesTable');
        tbody.innerHTML = roles.map(r => {
            const perms = Array.isArray(r.permissions_json) ? r.permissions_json : JSON.parse(r.permissions_json || '[]');
            const roleName = __t?.roleNames?.[r.name] || r.name.replace(/_/g, ' ');
            const roleDesc = __t?.roleDescs?.[r.name] || r.description || 'System role';
            return `<tr>
                <td data-label="Role" style="font-weight:600;text-transform:capitalize">${esc(roleName)}</td>
                <td data-label="Description" style="color:var(--text-muted)">${esc(roleDesc)}</td>
                <td data-label="Permissions"><div style="display:flex;flex-wrap:wrap;gap:4px">${perms.map(p => `<span class="badge badge-info" style="font-size:0.7rem">${esc(__t?.permNames?.[p] || p.replace(/_/g, ' '))}</span>`).join('')}</div></td>
            </tr>`;
        }).join('');
    } catch (err) { Toast.error(__t?.failedLoad || 'Failed to load roles.'); }
}

// ══════════════════════════════════════════
//  LOGIN LOGS
// ══════════════════════════════════════════
async function loadAdminLogs(page = 1) {
    try {
        const data = await API.get(`/admin/logs?page=${page}&limit=30`);
        const logs = data.data.logs;
        const tbody = document.getElementById('adminLogsTable');
        const clearBtn = document.getElementById('clearLogsBtn');

        if (clearBtn) {
            clearBtn.style.display = adminUser?.role === 'super_admin' && logs.length > 0 ? 'inline-flex' : 'none';
        }

        if (logs.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding:40px;color:var(--text-muted)">${__t?.noResultsFound || 'No logs yet'}</td></tr>`;
        } else {
            tbody.innerHTML = logs.map(l => `
                <tr>
                    <td data-label="User">${esc(l.user_name || '—')}</td>
                    <td data-label="Email" style="font-size:0.85rem">${esc(l.user_email || '—')}</td>
                    <td data-label="IP" style="font-family:monospace;font-size:0.8rem">${esc(l.ip_address || '—')}</td>
                    <td data-label="Browser" style="font-size:0.78rem;color:var(--text-muted);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(l.user_agent || '')}">${parseBrowser(l.user_agent)}</td>
                    <td data-label="Status"><span class="badge badge-${l.success ? 'success' : 'danger'}">${l.success ? 'Success' : 'Failed'}</span></td>
                    <td data-label="Time" style="font-size:0.85rem">${Utils.formatDate(l.login_time)}</td>
                </tr>
            `).join('');
        }
        renderPagination(data.data.pagination, 'adminLogsPagination', loadAdminLogs);
    } catch (err) { Toast.error(__t?.failedLoad || 'Failed to load logs.'); }
}

function parseBrowser(ua) {
    if (!ua) return '—';
    if (ua.includes('Chrome') && !ua.includes('Edg')) return 'Chrome';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
    if (ua.includes('Edg')) return 'Edge';
    if (ua.includes('Opera') || ua.includes('OPR')) return 'Opera';
    return ua.substring(0, 20) + '...';
}

async function clearAdminLogs() {
    const confirmed = await glassConfirm(
        __t?.clearAllLogs || 'Clear All Logs',
        __t?.clearLogsMessage || 'Are you sure you want to permanently delete all login logs? This action cannot be undone.',
        'danger'
    );
    if (!confirmed) return;
    try {
        await API.delete('/admin/logs');
        Toast.success(__t?.logsCleared || 'All login logs have been cleared.');
        loadAdminLogs();
    } catch (err) { Toast.error(err.message || (__t?.failedSave || 'Failed to clear logs.')); }
}
