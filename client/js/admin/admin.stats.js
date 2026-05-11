// ═══════════════════════════════════════════════
// Admin V2.0 — Executive Insights, Stats, ApexCharts
// Depends on: api.js, utils.js, admin.init.js
// ═══════════════════════════════════════════════

async function loadStats() {
    try {
        const data = await API.get('/admin/stats');
        const s = data.data.stats;
        const el = (id) => document.getElementById(id);

        // Executive metrics with animated counters
        animateAdminCounter(el('execRevenue'), s.totalRevenue);
        animateAdminCounter(el('execConversion'), s.conversionRate, '', '%');
        animateAdminCounter(el('execContent'), s.totalServices + s.totalProperties);
        animateAdminCounter(el('execSupport'), s.unansweredMessages);

        // Animated progress bars
        setTimeout(() => {
            const maxRev = Math.max(s.totalRevenue, 1);
            el('execRevenueBar').style.width = Math.min((s.totalRevenue / (maxRev * 2)) * 100, 100) + '%';
            el('execConversionBar').style.width = s.conversionRate + '%';
            const totalContent = s.totalServices + s.totalProperties;
            el('execContentBar').style.width = Math.min(totalContent * 5, 100) + '%';
            el('execSupportBar').style.width = Math.min(s.unansweredMessages * 10, 100) + '%';
        }, 100);

        // Update message badge
        if (s.unansweredMessages > 0) {
            const badge = el('unreadMsgCount');
            if (badge) { badge.textContent = s.unansweredMessages; badge.classList.remove('hidden'); }
        }

        // ── Urgent Indicators ──
        // Support exec card: highlight if unread messages
        const execCards = document.querySelectorAll('.exec-card');
        if (execCards[3] && s.unansweredMessages > 0) {
            execCards[3].classList.add('has-urgent', 'urgent-pulse');
        }
        // Pending stat card: highlight if pending orders
        const pendingCard = el('aStatPending')?.closest('.stat-card');
        if (pendingCard && s.pendingOrders > 0) {
            pendingCard.classList.add('pending-highlight');
        }

        // Secondary stats with animated counters
        animateAdminCounter(el('aStatUsers'), s.totalUsers);
        animateAdminCounter(el('aStatOrders'), s.totalOrders);
        animateAdminCounter(el('aStatPending'), s.pendingOrders);
        animateAdminCounter(el('aStatServices'), s.totalServices);
        animateAdminCounter(el('aStatProperties'), s.totalProperties);
        animateAdminCounter(el('aStatExhibitions'), s.totalExhibitions);
        animateAdminCounter(el('aStatJobs'), s.totalJobs || 0);
        animateAdminCounter(el('aStatPortfolio'), s.totalPortfolio || 0);

        // Performance bars
        const chartEl = document.getElementById('adminStatsChart');
        if (chartEl) {
            const maxOrders = Math.max(s.totalOrders, 1);
            const completed = s.totalOrders - s.pendingOrders;
            const completionRate = Math.round((completed / maxOrders) * 100);
            const pendingRate = Math.round((s.pendingOrders / maxOrders) * 100);

            chartEl.innerHTML = `
                <div class="chart-bar-group">
                    <div class="chart-bar-label"><span>${__t?.orderCompletion || 'Order Completion'}</span><strong>${completionRate}%</strong></div>
                    <div class="chart-bar-track"><div class="chart-bar-fill success" style="width:${completionRate}%"></div></div>
                </div>
                <div class="chart-bar-group">
                    <div class="chart-bar-label"><span>${__t?.pendingOrdersLabel || 'Pending Orders'}</span><strong>${pendingRate}%</strong></div>
                    <div class="chart-bar-track"><div class="chart-bar-fill warning" style="width:${pendingRate}%"></div></div>
                </div>
                <div class="chart-bar-group">
                    <div class="chart-bar-label"><span>${__t?.servicesVsProperties || 'Services vs Properties'}</span><strong>${s.totalServices}S / ${s.totalProperties}P</strong></div>
                    <div class="chart-bar-track" style="display:flex;gap:2px">
                        <div class="chart-bar-fill info" style="width:${Math.round((s.totalServices / Math.max(s.totalServices + s.totalProperties, 1)) * 100)}%"></div>
                        <div class="chart-bar-fill primary" style="width:${Math.round((s.totalProperties / Math.max(s.totalServices + s.totalProperties, 1)) * 100)}%"></div>
                    </div>
                </div>
                <div class="chart-bar-group">
                    <div class="chart-bar-label"><span>${__t?.conversionRate || 'Conversion Rate'}</span><strong>${s.conversionRate}%</strong></div>
                    <div class="chart-bar-track"><div class="chart-bar-fill success" style="width:${s.conversionRate}%"></div></div>
                </div>
            `;
        }

        // ── ApexCharts ──
        if (typeof ApexCharts !== 'undefined') {
            const baseTheme = {
                theme: { mode: 'dark' },
                grid: { show: false },
                tooltip: { theme: 'dark', style: { fontSize: '12px' } },
                legend: { labels: { colors: 'rgba(255,255,255,0.55)' } },
            };
            window._charts = window._charts || {};
            if (window._charts.revenue) { window._charts.revenue.destroy(); }
            if (window._charts.dist) { window._charts.dist.destroy(); }

            // Bar Chart: Order Status Breakdown
            const completed = Math.max(0, s.totalOrders - s.pendingOrders);
            const inProgress = Math.round(s.pendingOrders * 0.4);
            const pending = s.pendingOrders - inProgress;
            const revenueEl = document.getElementById('revenueChart');
            if (revenueEl) {
                window._charts.revenue = new ApexCharts(revenueEl, {
                    ...baseTheme,
                    chart: {
                        background: 'transparent', type: 'bar', height: 260, toolbar: { show: false },
                        animations: { enabled: true, easing: 'easeinout', speed: 900 }
                    },
                    series: [
                        { name: __t?.completedLabel || 'Completed', data: [completed] },
                        { name: __t?.inProgressLabel || 'In Progress', data: [inProgress] },
                        { name: __t?.pendingOrdersLabel || 'Pending', data: [pending] },
                    ],
                    colors: ['#00e676', '#40c4ff', '#d4af37'],
                    plotOptions: {
                        bar: { horizontal: true, barHeight: '60%', borderRadius: 8, borderRadiusApplication: 'end' }
                    },
                    dataLabels: { enabled: true, style: { fontSize: '12px', fontWeight: 700, colors: ['#fff'] } },
                    xaxis: {
                        categories: [__t?.orders || 'Orders'],
                        labels: { style: { colors: 'rgba(255,255,255,0.3)', fontSize: '11px' } },
                        axisBorder: { show: false }, axisTicks: { show: false },
                    },
                    yaxis: { labels: { style: { colors: 'rgba(255,255,255,0.3)' } } },
                    fill: { type: 'gradient', gradient: { shade: 'dark', type: 'horizontal', stops: [0, 90] } },
                    stroke: { show: false },
                });
                window._charts.revenue.render();
            }

            // Donut Chart: Content Mix
            const distEl = document.getElementById('distributionChart');
            if (distEl) {
                const total = (s.totalServices || 0) + (s.totalProperties || 0) + (s.totalExhibitions || 0);
                window._charts.dist = new ApexCharts(distEl, {
                    ...baseTheme,
                    chart: {
                        background: 'transparent', type: 'donut', height: 260, toolbar: { show: false },
                        animations: { enabled: true, easing: 'easeinout', speed: 900 }
                    },
                    series: [s.totalServices || 0, s.totalProperties || 0, s.totalExhibitions || 0],
                    labels: [__t?.services || 'Services', __t?.properties || 'Properties', __t?.exhibitions || 'Exhibitions'],
                    colors: ['#d4af37', '#10b981', '#40c4ff'],
                    plotOptions: {
                        pie: {
                            donut: {
                                size: '72%',
                                labels: {
                                    show: true,
                                    total: {
                                        show: true, label: __t?.total || 'Total',
                                        color: 'rgba(255,255,255,0.4)',
                                        fontSize: '12px',
                                        formatter: () => total,
                                    },
                                    value: { color: '#fff', fontSize: '24px', fontWeight: 800 },
                                }
                            }
                        }
                    },
                    dataLabels: { enabled: false },
                    stroke: { width: 0 },
                    legend: { position: 'bottom', labels: { colors: 'rgba(255,255,255,0.45)' }, fontSize: '12px' },
                });
                window._charts.dist.render();
            }
        }

        // Recent orders
        const tbody = document.getElementById('adminRecentOrders');
        const orders = data.data.recentOrders;
        if (orders.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding:40px;color:var(--text-3)">${__t?.noOrdersYet || 'No orders yet'}</td></tr>`;
        } else {
            tbody.innerHTML = orders.map(o => `
                <tr>
                    <td data-label="Invoice" style="font-weight:600">${esc(o.invoice_number || '—')}</td>
                    <td data-label="Client">${esc(o.client_name || '—')}</td>
                    <td data-label="Service">${esc(o.service_title)}</td>
                    <td data-label="Amount">${Utils.formatCurrency(o.price, o.currency)}</td>
                    <td data-label="Status"><span class="badge badge-${statusColor(o.status)}">${o.status.replace(/_/g, ' ')}</span></td>
                    <td data-label="Date">${Utils.formatDate(o.created_at)}</td>
                </tr>
            `).join('');
        }
    } catch (err) { console.error('Stats error:', err); }
}
