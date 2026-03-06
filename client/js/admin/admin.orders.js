// ═══════════════════════════════════════════════
// Admin V2.0 — Orders Management + Super Admin Delete
// Depends on: api.js, utils.js, admin.init.js
// ═══════════════════════════════════════════════

async function loadAdminOrders(page = 1) {
    try {
        const status = document.getElementById('adminOrderStatus')?.value || '';
        const data = await API.get(`/orders?page=${page}&limit=20${status ? `&status=${status}` : ''}`);
        const orders = data.data.orders;
        const tbody = document.getElementById('adminOrdersTable');
        const isSuperAdmin = adminUser?.role === 'super_admin';

        if (orders.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center" style="padding:40px;color:var(--text-muted)">No orders found</td></tr>';
        } else {
            tbody.innerHTML = orders.map(o => `
                <tr>
                    <td data-label="Invoice" style="font-weight:600">${esc(o.invoice_number || '—')}</td>
                    <td data-label="Client">${esc(o.client_name || '—')}</td>
                    <td data-label="Service">${esc(o.service_title)}</td>
                    <td data-label="Amount">${Utils.formatCurrency(o.price)}</td>
                    <td data-label="Status">
                        <select class="role-select" onchange="updateOrderStatus(${o.id}, this.value)">
                            ${['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'].map(s =>
                `<option value="${s}" ${o.status === s ? 'selected' : ''}>${s.replace(/_/g, ' ')}</option>`
            ).join('')}
                        </select>
                    </td>
                    <td data-label="Date">${Utils.formatDate(o.created_at)}</td>
                    <td data-label="Actions" style="display:flex;gap:6px;flex-wrap:wrap">
                        <button class="btn btn-ghost btn-sm" data-tooltip="Generate Invoice" onclick="generateInvoice(${o.id})"><i class="fas fa-file-invoice"></i></button>
                        ${isSuperAdmin && o.status === 'completed' ? `
                        <button class="btn btn-danger btn-sm" data-tooltip="Delete Completed Order" onclick="deleteAdminOrder(${o.id}, '${esc(o.invoice_number || '')}')">
                            <i class="fas fa-trash"></i>
                        </button>` : ''}
                    </td>
                </tr>
            `).join('');
        }
        renderPagination(data.data.pagination, 'adminOrdersPagination', loadAdminOrders);
    } catch (err) { Toast.error('Failed to load orders.'); }
}

async function updateOrderStatus(orderId, status) {
    const confirmed = await glassConfirm(
        'Update Order Status',
        `Change this order's status to "${status.replace(/_/g, ' ')}"?`,
        status === 'cancelled' ? 'danger' : 'warning'
    );
    if (!confirmed) { loadAdminOrders(); return; }
    try {
        await API.put(`/orders/${orderId}/status`, { status });
        Toast.success(`Order status updated to ${status.replace(/_/g, ' ')}`);
    } catch (err) { Toast.error(err.message); loadAdminOrders(); }
}

async function deleteAdminOrder(orderId, invoiceNumber) {
    const confirmed = await glassConfirm(
        'Delete Completed Order',
        `Permanently delete order #${invoiceNumber}? The client will be notified by email.`,
        'danger'
    );
    if (!confirmed) return;
    try {
        await API.delete(`/orders/${orderId}`);
        Toast.success('Order deleted and client notified.');
        loadAdminOrders();
    } catch (err) { Toast.error(err.message || 'Failed to delete order.'); }
}

async function generateInvoice(orderId) {
    try {
        await API.post(`/invoices/${orderId}/generate`);
        Toast.success('Invoice generated!');
    } catch (err) { Toast.error(err.message); }
}
