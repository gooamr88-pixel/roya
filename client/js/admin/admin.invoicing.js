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
    lineItems: [{ name: '', description: '', quantity: 1, unitPrice: 0 }],
    taxPercent: 15,
    discountType: 'percent', // 'percent' | 'fixed'
    discountValue: 0,
    shippingCost: 0,
    notes: '',
    terms: '',
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
        invTaxPercent: 'taxPercent',
        invDiscountValue: 'discountValue',
        invShippingCost: 'shippingCost',
        invNotes: 'notes',
        invTerms: 'terms',
    };
    Object.entries(fields).forEach(([elId, stateKey]) => {
        const el = document.getElementById(elId);
        if (!el) return;
        el.addEventListener('input', () => {
            const numFields = ['taxPercent', 'discountValue', 'shippingCost'];
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
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
    }).format(amount);
}

/* ── Real-Time Preview ── */
function updatePreview() {
    const isInvoice = invoiceState.mode === 'invoice';
    const subtotal = getSubtotal();
    const discount = getDiscountAmount();
    const tax = getTaxAmount();
    const grandTotal = getGrandTotal();

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

    const cName = document.getElementById('prevClientName');
    if (cName) cName.textContent = invoiceState.clientName || _t('invClientName', 'Client Name');
    const cEmail = document.getElementById('prevClientEmail');
    if (cEmail) cEmail.textContent = invoiceState.clientEmail || '—';
    const cAddr = document.getElementById('prevClientAddress');
    if (cAddr) cAddr.textContent = invoiceState.clientAddress || '—';
    const cPhone = document.getElementById('prevClientPhone');
    if (cPhone) cPhone.textContent = invoiceState.clientPhone || '—';

    const previewPlaceholder = _t('invPreviewPlaceholder', 'Add line items to see them here');
    const tbody = document.getElementById('prevLineItems');
    if (tbody) {
        if (invoiceState.lineItems.length === 0 || (invoiceState.lineItems.length === 1 && !invoiceState.lineItems[0].name)) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-3);padding:20px;font-style:italic;">${previewPlaceholder}</td></tr>`;
        } else {
            tbody.innerHTML = invoiceState.lineItems.map((item) => `
                <tr>
                    <td style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.04);color:var(--text-1);font-weight:500;">${esc(item.name) || '—'}</td>
                    <td style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.04);color:var(--text-2);font-size:0.8rem;">${esc(item.description) || ''}</td>
                    <td style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.04);text-align:center;color:var(--text-2);">${item.quantity}</td>
                    <td style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.04);text-align:right;color:var(--text-2);">${formatMoney(item.unitPrice)}</td>
                    <td style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.04);text-align:right;color:var(--text-1);font-weight:600;">${formatMoney(item.quantity * item.unitPrice)}</td>
                </tr>
            `).join('');
        }
    }

    const setFinancial = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = formatMoney(value);
    };
    setFinancial('prevSubtotal', subtotal);
    setFinancial('prevDiscount', discount);
    setFinancial('prevTax', tax);
    setFinancial('prevShipping', invoiceState.shippingCost);
    setFinancial('prevGrandTotal', grandTotal);

    const vatLabel = _t('invVAT', 'VAT');
    const discountLabelText = _t('invDiscount', 'Discount');
    const taxLabel = document.getElementById('prevTaxLabel');
    if (taxLabel) taxLabel.textContent = `${vatLabel} (${invoiceState.taxPercent}%)`;
    const discountLabel = document.getElementById('prevDiscountLabel');
    if (discountLabel) {
        discountLabel.textContent = invoiceState.discountType === 'percent'
            ? `${discountLabelText} (${invoiceState.discountValue}%)`
            : `${discountLabelText} (${_t('invDiscountFixed', 'Fixed')})`;
    }

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

    const stripe = document.getElementById('prevAccentStripe');
    if (stripe) {
        stripe.style.background = isInvoice
            ? 'linear-gradient(135deg, #d4af37, #f0d878, #d4af37)'
            : 'linear-gradient(135deg, #10b981, #34d399, #10b981)';
    }
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

/* ── PDF / Print ── */
function invoiceDownloadPDF() {
    if (!window.jspdf) {
        Toast.error(_t('invPdfNotLoaded', 'PDF library not loaded.'));
        return;
    }

    const { jsPDF } = window.jspdf;
    const isInvoice = invoiceState.mode === 'invoice';
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const accentColor = isInvoice ? [212, 175, 55] : [16, 185, 129];
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFillColor(...accentColor);
    doc.rect(0, 0, pageWidth, 6, 'F');

    doc.setFontSize(22);
    doc.setTextColor(40, 40, 40);
    doc.text('NABDA', 14, 22);
    doc.setFontSize(9);
    doc.setTextColor(140, 140, 140);
    doc.text('Nabda Platform — Advertising & Marketing', 14, 28);

    doc.setFontSize(28);
    doc.setTextColor(...accentColor);
    const pdfTitle = isInvoice
        ? (_t('invTaxInvoice', 'Tax Invoice')).toUpperCase()
        : (_t('invQuotation', 'Quotation')).toUpperCase();
    doc.text(pdfTitle, pageWidth - 14, 22, { align: 'right' });
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    const pdfTitleAr = isInvoice
        ? _t('invTaxInvoiceAr', '\u0641\u0627\u062a\u0648\u0631\u0629')
        : _t('invQuotationAr', '\u0639\u0631\u0636 \u0633\u0639\u0631');
    doc.text(pdfTitleAr, pageWidth - 14, 28, { align: 'right' });

    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.text(`# ${invoiceState.docNumber}`, pageWidth - 14, 36, { align: 'right' });
    doc.text(`${_t('invIssueDate', 'Issue')}: ${invoiceState.issueDate}`, pageWidth - 14, 41, { align: 'right' });
    const dueLabel = isInvoice ? _t('invDueDate', 'Due') : _t('invValidUntil', 'Valid Until');
    doc.text(`${dueLabel}: ${invoiceState.dueDate}`, pageWidth - 14, 46, { align: 'right' });

    doc.setDrawColor(220, 220, 220);
    doc.line(14, 52, pageWidth - 14, 52);

    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(_t('invBillTo', 'BILL TO').toUpperCase(), 14, 60);
    doc.setFontSize(12);
    doc.setTextColor(40);
    doc.text(invoiceState.clientName || _t('invClientName', 'Client Name'), 14, 67);
    doc.setFontSize(9);
    doc.setTextColor(100);
    let clientY = 73;
    if (invoiceState.clientEmail) { doc.text(invoiceState.clientEmail, 14, clientY); clientY += 5; }
    if (invoiceState.clientAddress) { doc.text(invoiceState.clientAddress, 14, clientY); clientY += 5; }
    if (invoiceState.clientPhone) { doc.text(invoiceState.clientPhone, 14, clientY); clientY += 5; }

    const tableData = invoiceState.lineItems
        .filter(li => li.name.trim())
        .map(li => [
            li.name,
            li.description,
            li.quantity.toString(),
            formatMoney(li.unitPrice),
            formatMoney(li.quantity * li.unitPrice)
        ]);

    doc.autoTable({
        startY: clientY + 5,
        head: [[
            _t('invItem', 'Item'),
            _t('invDescription', 'Description'),
            _t('invQty', 'Qty'),
            _t('invUnitPrice', 'Unit Price'),
            _t('invTotal', 'Total')
        ]],
        body: tableData,
        styles: { fontSize: 9, cellPadding: 4, textColor: [60, 60, 60] },
        headStyles: {
            fillColor: accentColor,
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 8,
        },
        alternateRowStyles: { fillColor: [248, 248, 248] },
        columnStyles: {
            0: { cellWidth: 45 },
            2: { halign: 'center', cellWidth: 18 },
            3: { halign: 'right', cellWidth: 30 },
            4: { halign: 'right', cellWidth: 30, fontStyle: 'bold' },
        },
        margin: { left: 14, right: 14 },
    });

    let finalY = doc.lastAutoTable.finalY + 10;
    const summaryX = pageWidth - 80;

    const summaryLines = [
        [_t('invSubtotal', 'Subtotal'), formatMoney(getSubtotal())],
        [_t('invDiscount', 'Discount'), `- ${formatMoney(getDiscountAmount())}`],
        [`${_t('invVAT', 'VAT')} (${invoiceState.taxPercent}%)`, formatMoney(getTaxAmount())],
    ];
    if (invoiceState.shippingCost > 0) {
        summaryLines.push([_t('invShipping', 'Shipping'), formatMoney(invoiceState.shippingCost)]);
    }

    doc.setFontSize(9);
    summaryLines.forEach(([label, value]) => {
        doc.setTextColor(120);
        doc.text(label, summaryX, finalY);
        doc.setTextColor(60);
        doc.text(value, pageWidth - 14, finalY, { align: 'right' });
        finalY += 6;
    });

    doc.setDrawColor(...accentColor);
    doc.setLineWidth(0.5);
    doc.line(summaryX, finalY, pageWidth - 14, finalY);
    finalY += 6;
    doc.setFontSize(12);
    doc.setTextColor(...accentColor);
    doc.text(_t('invGrandTotal', 'GRAND TOTAL').toUpperCase(), summaryX, finalY);
    doc.setFontSize(14);
    doc.setTextColor(40);
    doc.text(formatMoney(getGrandTotal()), pageWidth - 14, finalY, { align: 'right' });

    finalY += 14;
    if (invoiceState.notes) {
        doc.setFontSize(8);
        doc.setTextColor(140);
        doc.text(_t('invNotes', 'NOTES').toUpperCase(), 14, finalY);
        doc.setFontSize(9);
        doc.setTextColor(100);
        doc.text(invoiceState.notes, 14, finalY + 5, { maxWidth: pageWidth - 28 });
        finalY += 15;
    }
    if (invoiceState.terms) {
        doc.setFontSize(8);
        doc.setTextColor(140);
        doc.text(_t('invTerms', 'TERMS & CONDITIONS').toUpperCase(), 14, finalY);
        doc.setFontSize(9);
        doc.setTextColor(100);
        doc.text(invoiceState.terms, 14, finalY + 5, { maxWidth: pageWidth - 28 });
    }

    const pageH = doc.internal.pageSize.getHeight();
    doc.setFillColor(...accentColor);
    doc.rect(0, pageH - 4, pageWidth, 4, 'F');

    const filename = `${invoiceState.docNumber || 'document'}_${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(filename);
    Toast.success(`${_t('invPdfDownloaded', 'PDF downloaded')}: ${filename}`);
}

function invoicePrint() {
    const preview = document.getElementById('invPreviewCard');
    if (!preview) return;

    const printWindow = window.open('', '_blank', 'width=800,height=1100');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html><head><title>${invoiceState.docNumber}</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Inter', 'Cairo', system-ui, sans-serif; padding: 40px; background: #fff; color: #1a1a1a; }
            .inv-preview-card { background: #fff !important; color: #1a1a1a !important; }
            .inv-preview-card * { color: #1a1a1a !important; }
            table { width: 100%; border-collapse: collapse; }
            th { background: #f5f5f5 !important; padding: 8px 12px; text-align: left; font-size: 0.8rem; border-bottom: 2px solid #e0e0e0; }
            td { padding: 8px 12px; border-bottom: 1px solid #f0f0f0; }
            @media print { body { padding: 0; } @page { margin: 20mm; } }
        </style>
        </head><body>${preview.innerHTML}</body></html>
    `);
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); }, 500);
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
        lineItems: [{ name: '', description: '', quantity: 1, unitPrice: 0 }],
        taxPercent: 15,
        discountType: 'percent',
        discountValue: 0,
        shippingCost: 0,
        notes: '',
        terms: '',
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
