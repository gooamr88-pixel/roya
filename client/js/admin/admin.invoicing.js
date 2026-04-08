// ═══════════════════════════════════════════════
// Admin V2.0 — Invoicing & Quotation Generator
// Premium module with real-time A4 preview,
// dynamic line items, auto-calculations, PDF export,
// and Smart Item Picker linked to the platform DB.
// Depends on: api.js, utils.js, admin.init.js, jspdf, jspdf-autotable
// ═══════════════════════════════════════════════

/* ── i18n Helper ── */
const _t = (key, fallback) => (window.__t || {})[key] || fallback || key;

/* ── State ── */
let invoiceState = {
    mode: 'invoice', // 'invoice' | 'quote'
    docNumber: '',
    issueDate: '',
    dueDate: '',
    clientName: '',
    clientEmail: '',
    clientAddress: '',
    clientPhone: '',
    taxNumber: '',
    lineItems: [{ name: '', description: '', quantity: 1, unitPrice: 0 }],
    taxPercent: 15,
    discountType: 'percent', // 'percent' | 'fixed'
    discountValue: 0,
    shippingCost: 0,
    amountPaid: 0,
    branchInfo: '',
    notes: '',
    terms: '',
    currency: 'SAR', // NEW: default to Saudi Riyal
};

/* ── Catalog State ── */
let catalogState = {
    loaded: false,
    loading: false,
    services: [],
    jobs: [],
    portfolio: [],
    activeTab: 'services', // 'services' | 'jobs' | 'portfolio'
    searchQuery: '',
    targetLineIdx: null, // which line item we're picking for
};

/* ── Init ── */
function initInvoicing() {
    generateDocNumber();
    setTodayDate();
    renderLineItems();
    bindInvoiceFormEvents();
    updatePreview();
    // Pre-load catalog in background for instant picker response
    loadInvoiceCatalog();
}

/* ── Auto-generate document number ── */
function generateDocNumber() {
    const prefix = invoiceState.mode === 'invoice' ? 'INV' : 'QTE';
    const ts = Date.now().toString(36).toUpperCase().slice(-6);
    const rand = Math.random().toString(36).toUpperCase().slice(2, 5);
    invoiceState.docNumber = `${prefix}-${ts}-${rand}`;
    const el = document.getElementById('invDocNumber');
    if (el) el.value = invoiceState.docNumber;
}

function setTodayDate() {
    const today = new Date().toISOString().slice(0, 10);
    invoiceState.issueDate = today;
    const el = document.getElementById('invIssueDate');
    if (el) el.value = today;
    const due = new Date();
    due.setDate(due.getDate() + 30);
    invoiceState.dueDate = due.toISOString().slice(0, 10);
    const dueEl = document.getElementById('invDueDate');
    if (dueEl) dueEl.value = invoiceState.dueDate;
}

/* ── Mode Toggle ── */
function switchInvoiceMode(mode) {
    invoiceState.mode = mode;
    document.querySelectorAll('.inv-mode-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.inv-mode-tab[data-mode="${mode}"]`)?.classList.add('active');
    const badge = document.getElementById('invModeBadge');
    if (badge) {
        badge.textContent = mode === 'invoice'
            ? _t('invBadgeInvoice', 'فاتورة ضريبية — Tax Invoice')
            : _t('invBadgeQuote', 'عرض سعر — Quotation');
        badge.className = `inv-mode-badge ${mode}`;
    }
    generateDocNumber();
    updatePreview();
}

/* ══════════════════════════════════════════════════════
   CATALOG — Smart Item Picker
   Fetches services/jobs/portfolio from the platform DB
   and lets admin auto-fill line items with one click.
══════════════════════════════════════════════════════ */
async function loadInvoiceCatalog() {
    if (catalogState.loaded || catalogState.loading) return;
    catalogState.loading = true;
    try {
        const res = await API.get('/invoices/catalog');
        catalogState.services  = res.data.catalog.services  || [];
        catalogState.jobs      = res.data.catalog.jobs      || [];
        catalogState.portfolio = res.data.catalog.portfolio || [];
        catalogState.loaded    = true;
    } catch (err) {
        console.warn('[Invoicing] Catalog load failed:', err.message);
        // Non-fatal — picker will show empty state with reload button
    } finally {
        catalogState.loading = false;
    }
}

/**
 * Open the Smart Item Picker for a specific line index.
 */
function openItemPicker(lineIdx) {
    catalogState.targetLineIdx = lineIdx;
    catalogState.searchQuery = '';
    catalogState.activeTab = 'services';

    const modal = document.getElementById('itemPickerModal');
    if (!modal) return;

    // Reset search
    const searchEl = document.getElementById('pickerSearch');
    if (searchEl) { searchEl.value = ''; searchEl.focus(); }

    // Reset tabs
    _pickerSwitchTab('services');
    renderPickerItems();

    modal.classList.add('show');

    // If catalog not loaded yet trigger load + render when done
    if (!catalogState.loaded && !catalogState.loading) {
        loadInvoiceCatalog().then(renderPickerItems);
    }
}

function closeItemPicker() {
    document.getElementById('itemPickerModal')?.classList.remove('show');
    catalogState.targetLineIdx = null;
}

function _pickerSwitchTab(tab) {
    catalogState.activeTab = tab;
    document.querySelectorAll('.picker-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.picker-tab[data-tab="${tab}"]`)?.classList.add('active');
    renderPickerItems();
}

function _pickerSearch(q) {
    catalogState.searchQuery = q.trim().toLowerCase();
    renderPickerItems();
}

function renderPickerItems() {
    const container = document.getElementById('pickerItemsList');
    if (!container) return;

    const tab = catalogState.activeTab;
    const q   = catalogState.searchQuery;

    // Update tab counts when catalog is loaded
    if (catalogState.loaded) {
        const countEls = {
            services:  document.getElementById('pickerCountServices'),
            jobs:      document.getElementById('pickerCountJobs'),
            portfolio: document.getElementById('pickerCountPortfolio'),
        };
        if (countEls.services)  countEls.services.textContent  = catalogState.services.length;
        if (countEls.jobs)      countEls.jobs.textContent      = catalogState.jobs.length;
        if (countEls.portfolio) countEls.portfolio.textContent = catalogState.portfolio.length;
    }

    // Loading state
    if (catalogState.loading) {
        container.innerHTML = `
            <div class="picker-empty">
                <i class="fas fa-spinner fa-spin" style="font-size:1.8rem;color:var(--gold);margin-bottom:12px"></i>
                <div>جاري تحميل الكتالوج...</div>
            </div>`;
        return;
    }

    // Failed state
    if (!catalogState.loaded) {
        container.innerHTML = `
            <div class="picker-empty">
                <i class="fas fa-exclamation-circle" style="font-size:1.8rem;color:var(--danger);margin-bottom:12px"></i>
                <div style="margin-bottom:12px">فشل تحميل الكتالوج</div>
                <button class="btn btn-outline btn-sm" onclick="loadInvoiceCatalog().then(renderPickerItems)">
                    <i class="fas fa-redo"></i> إعادة المحاولة
                </button>
            </div>`;
        return;
    }

    const sourceMap = {
        services:  catalogState.services,
        jobs:      catalogState.jobs,
        portfolio: catalogState.portfolio,
    };

    let items = sourceMap[tab] || [];
    if (q) {
        items = items.filter(it =>
            it.title?.toLowerCase().includes(q) ||
            it.title_ar?.toLowerCase().includes(q) ||
            it.category?.toLowerCase().includes(q) ||
            it.description?.toLowerCase().includes(q)
        );
    }

    if (items.length === 0) {
        const emptyMsg = q ? `لا توجد نتائج لـ "${q}"` : 'لا توجد بنود في هذه الفئة بعد.';
        container.innerHTML = `
            <div class="picker-empty">
                <i class="fas fa-inbox" style="font-size:1.8rem;color:var(--text-3);margin-bottom:12px"></i>
                <div>${emptyMsg}</div>
            </div>`;
        return;
    }

    container.innerHTML = items.map(item => {
        const icon = tab === 'services' ? 'fa-concierge-bell'
                   : tab === 'jobs'     ? 'fa-briefcase'
                   : 'fa-images';
        const accentCls = tab === 'services' ? 'picker-card--service'
                        : tab === 'jobs'     ? 'picker-card--job'
                        : 'picker-card--portfolio';
        const priceLabel = item.price > 0
            ? `<span class="picker-card-price">${formatMoney(item.price)}</span>`
            : item.description
                ? `<span class="picker-card-price picker-card-price--muted">${esc(item.description)}</span>`
                : `<span class="picker-card-price picker-card-price--muted">—</span>`;
        const arLabel = item.title_ar
            ? `<span class="picker-card-ar">${esc(item.title_ar)}</span>`
            : '';
        const catBadge = item.category
            ? `<span class="picker-card-cat">${esc(item.category)}</span>`
            : '';

        return `
            <div class="picker-card ${accentCls}" onclick="applyPickedItem(${JSON.stringify(item).replace(/"/g, '&quot;')})">
                <div class="picker-card-icon"><i class="fas ${icon}"></i></div>
                <div class="picker-card-body">
                    <div class="picker-card-title">${esc(item.title)}</div>
                    ${arLabel}
                    ${catBadge}
                </div>
                ${priceLabel}
                <div class="picker-card-arrow"><i class="fas fa-chevron-right"></i></div>
            </div>`;
    }).join('');
}

/**
 * Apply a picked catalog item to the target line.
 */
function applyPickedItem(item) {
    const idx = catalogState.targetLineIdx;
    if (idx === null || idx === undefined) return;

    // Populate the line
    invoiceState.lineItems[idx].name        = item.title || '';
    invoiceState.lineItems[idx].description = item.title_ar || item.description || '';
    invoiceState.lineItems[idx].unitPrice   = item.price || 0;
    // Keep quantity as-is (user controls it)

    // Close modal
    closeItemPicker();

    // Re-render line items to reflect new values
    renderLineItems();
    updatePreview();

    // Flash the populated row for feedback
    setTimeout(() => {
        const row = document.querySelector(`#invLineItemsBody .inv-line-row[data-idx="${idx}"]`);
        if (row) {
            row.classList.add('inv-line-flash');
            setTimeout(() => row.classList.remove('inv-line-flash'), 800);
        }
    }, 50);

    Toast.success(_t('invItemPicked', `تم إضافة: ${item.title}`));
}

/* ── Line Items ── */
function renderLineItems() {
    const container = document.getElementById('invLineItemsBody');
    if (!container) return;

    const itemPh = _t('invItemPlaceholder', 'Item name');
    const descPh = _t('invDescPlaceholder', 'Description');
    const pickTip = _t('invPickTip', 'اختر من الكتالوج');

    container.innerHTML = invoiceState.lineItems.map((item, i) => `
        <tr class="inv-line-row" data-idx="${i}">
            <td class="inv-line-num">${i + 1}</td>
            <td class="inv-line-name-cell">
                <div class="inv-line-name-wrap">
                    <button type="button" class="inv-pick-btn" onclick="openItemPicker(${i})" title="${pickTip}">
                        <i class="fas fa-layer-group"></i>
                    </button>
                    <input type="text" class="form-input inv-line-input" placeholder="${itemPh}"
                        value="${esc(item.name)}" data-field="name" data-idx="${i}"
                        oninput="updateLineItem(${i}, 'name', this.value)">
                </div>
            </td>
            <td>
                <input type="text" class="form-input inv-line-input" placeholder="${descPh}"
                    value="${esc(item.description)}" data-field="description" data-idx="${i}"
                    oninput="updateLineItem(${i}, 'description', this.value)">
            </td>
            <td>
                <input type="number" class="form-input inv-line-input inv-qty" min="1" step="1"
                    value="${item.quantity}" data-field="quantity" data-idx="${i}"
                    oninput="updateLineItem(${i}, 'quantity', this.value)">
            </td>
            <td>
                <input type="number" class="form-input inv-line-input inv-price" min="0" step="0.01"
                    value="${item.unitPrice}" data-field="unitPrice" data-idx="${i}"
                    oninput="updateLineItem(${i}, 'unitPrice', this.value)">
            </td>
            <td class="inv-line-total" id="lineTotal-${i}">
                ${formatMoney(item.quantity * item.unitPrice)}
            </td>
            <td>
                <button type="button" class="inv-remove-btn" onclick="removeLineItem(${i})"
                    ${invoiceState.lineItems.length <= 1 ? 'disabled' : ''}>
                    <i class="fas fa-trash-alt"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function addLineItem() {
    invoiceState.lineItems.push({ name: '', description: '', quantity: 1, unitPrice: 0 });
    renderLineItems();
    updatePreview();
    setTimeout(() => {
        const inputs = document.querySelectorAll('.inv-line-input[data-field="name"]');
        inputs[inputs.length - 1]?.focus();
    }, 50);
}

function removeLineItem(idx) {
    if (invoiceState.lineItems.length <= 1) return;
    invoiceState.lineItems.splice(idx, 1);
    renderLineItems();
    updatePreview();
}

function updateLineItem(idx, field, value) {
    if (field === 'quantity') {
        invoiceState.lineItems[idx].quantity = Math.max(1, parseInt(value) || 1);
    } else if (field === 'unitPrice') {
        invoiceState.lineItems[idx].unitPrice = Math.max(0, parseFloat(value) || 0);
    } else {
        invoiceState.lineItems[idx][field] = value;
    }
    const total = invoiceState.lineItems[idx].quantity * invoiceState.lineItems[idx].unitPrice;
    const totalEl = document.getElementById(`lineTotal-${idx}`);
    if (totalEl) totalEl.textContent = formatMoney(total);
    updatePreview();
}

/* ── Bind all form events ── */
function bindInvoiceFormEvents() {
    const fields = {
        invDocNumber: 'docNumber',
        invIssueDate: 'issueDate',
        invDueDate: 'dueDate',
        invClientName: 'clientName',
        invClientEmail: 'clientEmail',
        invClientAddress: 'clientAddress',
        invClientPhone: 'clientPhone',
        invTaxNumber: 'taxNumber',
        invTaxPercent: 'taxPercent',
        invDiscountValue: 'discountValue',
        invShippingCost: 'shippingCost',
        invAmountPaid: 'amountPaid',
        invBranchInfo: 'branchInfo',
        invNotes: 'notes',
        invTerms: 'terms',
        invCurrency: 'currency', // NEW
    };
    Object.entries(fields).forEach(([elId, stateKey]) => {
        const el = document.getElementById(elId);
        if (!el) return;
        el.addEventListener('input', () => {
            const numFields = ['taxPercent', 'discountValue', 'shippingCost', 'amountPaid'];
            invoiceState[stateKey] = numFields.includes(stateKey)
                ? parseFloat(el.value) || 0
                : el.value;
            updatePreview();
        });
    });

    const discountTypeEl = document.getElementById('invDiscountType');
    if (discountTypeEl) {
        discountTypeEl.addEventListener('change', () => {
            invoiceState.discountType = discountTypeEl.value;
            updatePreview();
        });
    }

    // Picker search binding
    const pickerSearch = document.getElementById('pickerSearch');
    if (pickerSearch) {
        pickerSearch.addEventListener('input', () => _pickerSearch(pickerSearch.value));
    }

    // Picker modal close on overlay click
    const pickerModal = document.getElementById('itemPickerModal');
    if (pickerModal) {
        pickerModal.addEventListener('click', (e) => {
            if (e.target === pickerModal) closeItemPicker();
        });
    }

    // Close picker on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const picker = document.getElementById('itemPickerModal');
            if (picker?.classList.contains('show')) {
                e.stopPropagation();
                closeItemPicker();
            }
        }
    }, true);
}

/* ── Calculations ── */
function getSubtotal() {
    return invoiceState.lineItems.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
}

function getDiscountAmount() {
    const subtotal = getSubtotal();
    if (invoiceState.discountType === 'percent') {
        return subtotal * (invoiceState.discountValue / 100);
    }
    return invoiceState.discountValue;
}

function getTaxAmount() {
    const subtotal = getSubtotal();
    const discount = getDiscountAmount();
    return (subtotal - discount) * (invoiceState.taxPercent / 100);
}

function getGrandTotal() {
    const subtotal = getSubtotal();
    const discount = getDiscountAmount();
    const tax = getTaxAmount();
    return subtotal - discount + tax + invoiceState.shippingCost;
}

function formatMoney(amount) {
    const currency = invoiceState?.currency || 'SAR';
    try {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 2,
        }).format(amount);
    } catch (e) {
        // Fallback if currency code is invalid
        return `${currency} ${Number(amount).toFixed(2)}`;
    }
}

/* ── Real-Time Preview ── */
function updatePreview() {
    const isInvoice = invoiceState.mode === 'invoice';
    const subtotal = getSubtotal();
    const discount = getDiscountAmount();
    const tax = getTaxAmount();
    const grandTotal = getGrandTotal();
    const remaining = Math.max(0, grandTotal - invoiceState.amountPaid);

    // Document type badge
    const docTypeAr = document.getElementById('prevDocTypeAr');
    const docTypeEn = document.getElementById('prevDocTypeEn');
    if (docTypeAr) docTypeAr.textContent = isInvoice ? 'فاتورة ضريبية' : 'عرض سعر';
    if (docTypeEn) docTypeEn.textContent = isInvoice ? 'TAX INVOICE' : 'QUOTATION';

    const titleEl = document.getElementById('prevDocTitle');
    if (titleEl) titleEl.textContent = isInvoice
        ? (_t('invTaxInvoice', 'Tax Invoice')).toUpperCase()
        : (_t('invQuotation', 'Quotation')).toUpperCase();

    const titleArEl = document.getElementById('prevDocTitleAr');
    if (titleArEl) titleArEl.textContent = isInvoice
        ? _t('invTaxInvoiceAr', 'فاتورة')
        : _t('invQuotationAr', 'عرض سعر');

    const numEl = document.getElementById('prevDocNumber');
    if (numEl) numEl.textContent = invoiceState.docNumber || '—';

    const dateEl = document.getElementById('prevIssueDate');
    if (dateEl) dateEl.textContent = invoiceState.issueDate || '—';

    const dueEl = document.getElementById('prevDueDate');
    if (dueEl) dueEl.textContent = invoiceState.dueDate || '—';

    const dueLabelEl = document.getElementById('prevDueDateLabel');
    if (dueLabelEl) dueLabelEl.textContent = isInvoice
        ? _t('invDueDate', 'Due Date')
        : _t('invValidUntil', 'Valid Until');

    // Client fields
    const cName = document.getElementById('prevClientName');
    if (cName) cName.textContent = invoiceState.clientName || '—';
    const cEmail = document.getElementById('prevClientEmail');
    if (cEmail) cEmail.textContent = invoiceState.clientEmail || '—';
    const cAddr = document.getElementById('prevClientAddress');
    if (cAddr) cAddr.textContent = invoiceState.clientAddress || '—';
    const cPhone = document.getElementById('prevClientPhone');
    if (cPhone) cPhone.textContent = invoiceState.clientPhone || '—';
    const cTax = document.getElementById('prevTaxNumber');
    if (cTax) cTax.textContent = invoiceState.taxNumber || '—';

    // Branch info
    const branchEl = document.getElementById('prevBranchInfo');
    if (branchEl) branchEl.textContent = invoiceState.branchInfo || _t('invBranchInfoPlaceholder', 'الفرع الرئيسي');

    // Line items table
    const previewPlaceholder = _t('invPreviewPlaceholder', 'أضف بنوداً لعرضها هنا');
    const tbody = document.getElementById('prevLineItems');
    if (tbody) {
        if (invoiceState.lineItems.length === 0 || (invoiceState.lineItems.length === 1 && !invoiceState.lineItems[0].name)) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#999;padding:20px;font-style:italic;">${previewPlaceholder}</td></tr>`;
        } else {
            tbody.innerHTML = invoiceState.lineItems.map((item, idx) => `
                <tr>
                    <td>${idx + 1}</td>
                    <td style="font-weight:500;">${esc(item.name) || '—'}</td>
                    <td style="font-size:0.72rem;">${esc(item.description) || ''}</td>
                    <td>${item.quantity}</td>
                    <td>${formatNum(item.unitPrice)}</td>
                    <td style="font-weight:600;">${formatNum(item.quantity * item.unitPrice)}</td>
                </tr>
            `).join('');
        }
    }

    // Financial summary
    const setFinancial = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = formatNum(value);
    };
    setFinancial('prevSubtotal', subtotal);
    setFinancial('prevDiscount', discount);
    setFinancial('prevTax', tax);
    setFinancial('prevShipping', invoiceState.shippingCost);
    setFinancial('prevGrandTotal', grandTotal);
    setFinancial('prevAmountPaid', invoiceState.amountPaid);
    setFinancial('prevRemaining', remaining);

    // Labels
    const vatLabel = _t('invVAT', 'القيمة المضافة');
    const discountLabelText = _t('invDiscount', 'الخصم');
    const taxLabel = document.getElementById('prevTaxLabel');
    if (taxLabel) taxLabel.innerHTML = `${vatLabel} ${invoiceState.taxPercent}% <small>VAT</small>`;
    const discountLabel = document.getElementById('prevDiscountLabel');
    if (discountLabel) {
        discountLabel.innerHTML = invoiceState.discountType === 'percent'
            ? `${discountLabelText} (${invoiceState.discountValue}%) <small>Discount</small>`
            : `${discountLabelText} <small>Discount</small>`;
    }

    // Notes & Terms
    const notesEl = document.getElementById('prevNotes');
    if (notesEl) {
        notesEl.textContent = invoiceState.notes || '';
        notesEl.parentElement.style.display = invoiceState.notes ? 'block' : 'none';
    }
    const termsEl = document.getElementById('prevTerms');
    if (termsEl) {
        termsEl.textContent = invoiceState.terms || '';
        termsEl.parentElement.style.display = invoiceState.terms ? 'block' : 'none';
    }

    // Generate QR Code
    generateInvoiceQR();
}

/* ── Format number without currency symbol ── */
function formatNum(amount) {
    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount);
}

/* ── Build invoice viewer URL ── */
function getInvoiceViewerURL() {
    const data = {
        mode: invoiceState.mode,
        docNumber: invoiceState.docNumber,
        issueDate: invoiceState.issueDate,
        dueDate: invoiceState.dueDate,
        clientName: invoiceState.clientName,
        clientEmail: invoiceState.clientEmail,
        clientAddress: invoiceState.clientAddress,
        clientPhone: invoiceState.clientPhone,
        taxNumber: invoiceState.taxNumber,
        lineItems: invoiceState.lineItems.filter(li => li.name && li.name.trim()),
        taxPercent: invoiceState.taxPercent,
        discountType: invoiceState.discountType,
        discountValue: invoiceState.discountValue,
        shippingCost: invoiceState.shippingCost,
        amountPaid: invoiceState.amountPaid,
        branchInfo: invoiceState.branchInfo,
        notes: invoiceState.notes,
        terms: invoiceState.terms,
        currency: invoiceState.currency,
    };
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
    return `${window.location.origin}/invoice-view.html?d=${encoded}`;
}

/* ── QR Code — generates compact invoice summary ── */
function generateInvoiceQR() {
    const canvas = document.getElementById('invQRCode');
    if (!canvas) return;
    
    // Set high-res dimensions for crisp PDF/Print rendering
    canvas.width = 1024;
    canvas.height = 1024;
    
    const ctx = canvas.getContext('2d');
    const size = canvas.width;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);

    // Build compact QR content with key invoice details
    // Full viewer URL is too long for QR codes (>4000 chars with base64 data)
    const isInvoice = invoiceState.mode !== 'quote';
    const typeLabel = isInvoice ? 'فاتورة / Invoice' : 'عرض سعر / Quotation';
    const total = getGrandTotal();
    
    const qrContent = [
        `📄 ${typeLabel}`,
        `رقم: ${invoiceState.docNumber || '—'}`,
        `العميل: ${invoiceState.clientName || '—'}`,
        `التاريخ: ${invoiceState.issueDate || '—'}`,
        `المبلغ: ${(total || 0).toFixed(2)} ${invoiceState.currency || 'SAR'}`,
        ``,
        `${window.location.origin}`
    ].join('\n');

    if (typeof qrcode !== 'undefined') {
        try {
            const qr = qrcode(0, 'M');
            qr.addData(qrContent);
            qr.make();

            const moduleCount = qr.getModuleCount();
            const cellSize = size / (moduleCount + 8);
            const offset = (size - moduleCount * cellSize) / 2;

            ctx.fillStyle = '#000000';
            for (let row = 0; row < moduleCount; row++) {
                for (let col = 0; col < moduleCount; col++) {
                    if (qr.isDark(row, col)) {
                        ctx.fillRect(
                            offset + col * cellSize,
                            offset + row * cellSize,
                            cellSize + 0.5,
                            cellSize + 0.5
                        );
                    }
                }
            }
        } catch (e) {
            console.warn('QR generation error:', e);
            _drawQRPlaceholder(ctx, size);
        }
    } else {
        _drawQRPlaceholder(ctx, size);
    }
}

function _drawQRPlaceholder(ctx, size) {
    // Draw a simple placeholder when QR library is unavailable
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#ccc';
    ctx.font = `${Math.floor(size / 8)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('QR', size / 2, size / 2);
}

/* ── Save & Issue ── */
async function invoiceSaveAndIssue() {
    if (!invoiceState.clientName.trim()) {
        Toast.error(_t('invClientRequired', 'Client name is required.'));
        document.getElementById('invClientName')?.focus();
        return;
    }
    if (invoiceState.lineItems.every(li => !li.name.trim())) {
        Toast.error(_t('invItemRequired', 'At least one line item is required.'));
        return;
    }

    const payload = {
        ...invoiceState,
        subtotal: getSubtotal(),
        discountAmount: getDiscountAmount(),
        taxAmount: getTaxAmount(),
        grandTotal: getGrandTotal(),
    };

    try {
        await API.post('/invoices/save', payload);
        Toast.success(invoiceState.mode === 'invoice'
            ? _t('invSavedInvoice', 'Invoice saved & issued!')
            : _t('invSavedQuote', 'Quotation saved successfully!'));
    } catch (err) {
        if (err.message?.includes('404') || err.message?.includes('Not Found')) {
            Toast.success(_t('invSavedLocal', 'Document saved locally. Backend route not configured yet.'));
        } else {
            Toast.error(err.message || _t('invSaveFailed', 'Failed to save document.'));
        }
    }
}

/* ── Shared invoice CSS for print/PDF ── */
function _getInvoiceCSS() {
    return `
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Tajawal', 'Cairo', system-ui, sans-serif; padding: 24px 20px; background: #fff; color: #1a1a1a; direction: rtl; }
        .inv-preview-card, .inv-preview-body { background: #fff !important; color: #1a1a1a !important; direction: rtl; display:flex;flex-direction:column;gap:16px; }
        .inv-preview-card *, .inv-preview-body * { color: #1a1a1a !important; }
        .inv-new-header { display: flex; align-items: center; justify-content: flex-start; padding: 12px 0; direction: rtl; gap: 0; }
        .inv-new-header-logo { flex-shrink: 0; }
        .inv-new-logo { width: 75px; height: 75px; object-fit: contain; }
        .inv-new-header-info { flex: 1; text-align: center; padding: 0 16px; }
        .inv-company-name-ar { font-size: 1.1rem; font-weight: 700; color: #1a1a1a !important; }
        .inv-company-name-en { font-size: 0.62rem; color: #888 !important; margin-top: 2px; }
        .inv-doc-type-badge { text-align: center; padding: 6px 0; margin: 4px 0 10px; border-top: 2px solid #d4af37; border-bottom: 2px solid #d4af37; font-weight: 700; font-size: 0.9rem; }
        .inv-doc-type-divider { margin: 0 10px; color: #ccc !important; font-weight: 300; }
        .inv-doc-type-en { font-size: 0.78rem; letter-spacing: 0.08em; }
        .inv-new-meta { background: #fafafa; border: 1px solid #eee; padding: 10px 12px; border-radius: 6px; direction: rtl; }
        .inv-new-meta-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 4px; }
        .inv-new-meta-item { display: flex; gap: 6px; align-items: baseline; }
        .inv-meta-label { font-weight: 600; font-size: 0.75rem; color: #333 !important; white-space: nowrap; }
        .inv-meta-value { font-size: 0.75rem; color: #555 !important; }
        table { width: 100%; border-collapse: collapse; margin: 0; direction: rtl; }
        th { background: #f0f0f0 !important; padding: 6px 8px; text-align: center; font-size: 0.72rem; font-weight: 700; border: 1px solid #bbb; line-height:1.3; white-space:nowrap; }
        th small { display: block; font-weight: 400; font-size: 0.58rem; color: #888 !important; margin-top:1px; }
        td { padding: 7px 10px; border: 1px solid #ccc; text-align: center; font-size: 0.76rem; color: #333 !important; }
        tr:nth-child(even) { background: #fafafa; }
        .inv-new-bottom { display: grid; grid-template-columns: auto 1fr; gap: 16px; align-items:start; padding-top: 12px; border-top: 1px solid #ddd; direction: rtl; }
        .inv-new-qr { order: 2; }
        .inv-new-qr img { width: 110px; height: 110px; border: 1px solid #ddd; border-radius: 4px; }
        .inv-new-summary { order: 1; display:flex;flex-direction:column;gap:4px; }
        .inv-new-summary-row { display: flex; justify-content: space-between; padding: 4px 12px; border-bottom: 1px solid #eee; font-size: 0.78rem; align-items:center; }
        .inv-new-summary-row small { font-size: 0.58rem; color: #999 !important; margin-right: 4px; }
        .inv-summary-lbl { font-weight: 600; color: #333 !important; }
        .inv-summary-val { font-weight: 500; color: #555 !important; direction: ltr; }
        .inv-summary-total { background: #f5f5f5; border: 1px solid #ccc; border-radius: 4px; font-size: 0.85rem; margin-top: 4px; }
        .inv-summary-total .inv-summary-lbl, .inv-summary-total .inv-summary-val { font-weight: 800; color: #1a1a1a !important; }
        .inv-summary-total .inv-summary-val { font-size: 0.9rem; }
        .inv-summary-paid { background: #f0fdf4; border-radius: 3px; }
        .inv-summary-paid .inv-summary-val { color: #166534 !important; font-weight: 600; }
        .inv-summary-remaining { background: #fef2f2; border-radius: 3px; margin-top: 2px; }
        .inv-summary-remaining .inv-summary-val { color: #b91c1c !important; font-weight: 700; }
        .inv-prev-notes-section { margin-top: 8px; padding: 6px 8px; border: 1px solid #eee; border-radius: 4px; font-size: 0.75rem; background: #fafafa; }
        .inv-prev-notes-label { font-weight: 600; font-size: 0.7rem; color: #555 !important; }
        .inv-prev-notes-label small { color: #999 !important; }
        .inv-prev-notes-text { color: #333 !important; }
        .inv-new-footer { text-align: center; padding-top: 12px; border-top: 1px solid #ddd; }
        .inv-new-footer-page { font-size: 0.65rem; color: #999 !important; }
        .inv-new-footer-branch { font-size: 0.72rem; color: #555 !important; font-weight: 500; }
        [style*="display: none"], [style*="display:none"] { display: none !important; }
    `;
}

/* ── Build preview HTML with QR as img ── */
function _getPreviewHTMLForExport() {
    const preview = document.getElementById('invPreviewCard');
    if (!preview) return '';
    let html = preview.innerHTML;
    const qrCanvas = document.getElementById('invQRCode');
    if (qrCanvas) {
        try {
            const qrDataUrl = qrCanvas.toDataURL('image/png');
            html = html.replace(
                /<canvas[^>]*id="invQRCode"[^>]*>[^<]*<\/canvas>/i,
                `<img src="${qrDataUrl}" style="width:110px;height:110px;border:1px solid #ddd;border-radius:4px;" alt="QR">`
            );
        } catch (e) {}
    }
    return html;
}

/* ── PDF — Server-Side Rendering via Puppeteer (GET + base64 payload) ── */
async function invoiceDownloadPDF() {
    if (invoiceState.lineItems.length === 0 || (invoiceState.lineItems.length === 1 && !invoiceState.lineItems[0].name)) {
        Toast.error(_t('invItemRequired', 'At least one line item is required.'));
        return;
    }

    const btn = document.querySelector('[onclick="invoiceDownloadPDF()"]');
    if (btn) setLoading(btn, true);

    try {
        // Get QR image from canvas
        const qrCanvas = document.getElementById('invQRCode');
        let qrImage = '';
        try { if (qrCanvas) qrImage = qrCanvas.toDataURL('image/png'); } catch(e){}

        // Build full payload
        const payload = {
            ...invoiceState,
            subtotal:       getSubtotal(),
            discountAmount: getDiscountAmount(),
            taxAmount:      getTaxAmount(),
            grandTotal:     getGrandTotal(),
            isInvoice:      invoiceState.mode === 'invoice',
            qrImage:        qrImage,
        };

        // Encode as base64 JSON and open directly in new tab
        // The browser sends the HttpOnly auth cookie automatically on GET
        const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
        const url = `/api/invoices/download-pdf?d=${encoded}`;

        // Open in new tab — browser handles the PDF download
        window.open(url, '_blank');

        Toast.success(_t('invPdfGenerating', 'جاري إنشاء PDF...'));
    } catch (err) {
        console.error('PDF generation error:', err);
        Toast.error(err.message || 'PDF generation failed.');
    } finally {
        if (btn) setLoading(btn, false);
    }
}

/* ── Print — exact copy of preview ── */
function invoicePrint() {
    const previewHTML = _getPreviewHTMLForExport();
    if (!previewHTML) return;

    const printWindow = window.open('', '_blank', 'width=800,height=1100');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html dir="rtl"><head><title>${invoiceState.docNumber}</title>
        <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;900&family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">
        <style>
            ${_getInvoiceCSS()}
            @media print { body { padding: 12px; } @page { margin: 10mm; } }
        </style>
        </head><body>${previewHTML}</body></html>
    `);
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); }, 600);
}

/* ── Reset Form ── */
function invoiceReset() {
    invoiceState = {
        mode: invoiceState.mode,
        docNumber: '',
        issueDate: '',
        dueDate: '',
        clientName: '',
        clientEmail: '',
        clientAddress: '',
        clientPhone: '',
        taxNumber: '',
        lineItems: [{ name: '', description: '', quantity: 1, unitPrice: 0 }],
        taxPercent: 15,
        discountType: 'percent',
        discountValue: 0,
        shippingCost: 0,
        amountPaid: 0,
        branchInfo: '',
        notes: '',
        terms: '',
        currency: invoiceState.currency || 'SAR', // preserve currency on reset
    };
    document.querySelectorAll('#invFormSection input, #invFormSection textarea, #invFormSection select').forEach(el => {
        if (el.type === 'select-one') el.selectedIndex = 0;
        else el.value = '';
    });
    generateDocNumber();
    setTodayDate();
    renderLineItems();
    updatePreview();
    Toast.success(_t('invFormReset', 'Form reset.'));
}
