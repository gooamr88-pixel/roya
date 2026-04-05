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
    if (cName) cName.textContent = invoiceState.clientName || '—';
    const cEmail = document.getElementById('prevClientEmail');
    if (cEmail) cEmail.textContent = invoiceState.clientEmail || '—';
    const cAddr = document.getElementById('prevClientAddress');
    if (cAddr) cAddr.textContent = invoiceState.clientAddress || '—';
    const cPhone = document.getElementById('prevClientPhone');
    if (cPhone) cPhone.textContent = invoiceState.clientPhone || '—';

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

    const setFinancial = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = formatNum(value);
    };
    setFinancial('prevSubtotal', subtotal);
    setFinancial('prevDiscount', discount);
    setFinancial('prevTax', tax);
    setFinancial('prevShipping', invoiceState.shippingCost);
    setFinancial('prevGrandTotal', grandTotal);

    // Remaining = 0 for now (can be extended with payment tracking)
    const remainEl = document.getElementById('prevRemaining');
    if (remainEl) remainEl.textContent = '0';

    const vatLabel = _t('invVAT', 'القيمة المضافة');
    const discountLabelText = _t('invDiscount', 'الخصم');
    const taxLabel = document.getElementById('prevTaxLabel');
    if (taxLabel) taxLabel.textContent = `${vatLabel} ${invoiceState.taxPercent}%`;
    const discountLabel = document.getElementById('prevDiscountLabel');
    if (discountLabel) {
        discountLabel.textContent = invoiceState.discountType === 'percent'
            ? `${discountLabelText} (${invoiceState.discountValue}%)`
            : `${discountLabelText}`;
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

/* ── QR Code Generator ── */
function generateInvoiceQR() {
    const canvas = document.getElementById('invQRCode');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const size = canvas.width;

    // Generate a simple QR-like pattern based on invoice data
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);

    const data = `${invoiceState.docNumber}|${invoiceState.clientName}|${getGrandTotal().toFixed(2)}|${invoiceState.issueDate}`;
    const cellSize = Math.floor(size / 25);
    
    // Create pseudo-QR pattern from data hash
    ctx.fillStyle = '#000000';
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
        hash = ((hash << 5) - hash) + data.charCodeAt(i);
        hash |= 0;
    }
    
    // Draw finder patterns (corners)
    const drawFinder = (x, y) => {
        for (let i = 0; i < 7; i++) {
            for (let j = 0; j < 7; j++) {
                if (i === 0 || i === 6 || j === 0 || j === 6 || 
                    (i >= 2 && i <= 4 && j >= 2 && j <= 4)) {
                    ctx.fillRect((x + i) * cellSize, (y + j) * cellSize, cellSize, cellSize);
                }
            }
        }
    };
    drawFinder(1, 1);
    drawFinder(17, 1);
    drawFinder(1, 17);
    
    // Fill data area
    const rng = Math.abs(hash);
    for (let row = 0; row < 25; row++) {
        for (let col = 0; col < 25; col++) {
            // Skip finder areas
            if ((row < 9 && col < 9) || (row < 9 && col > 15) || (row > 15 && col < 9)) continue;
            if (((rng * (row * 25 + col + 1)) % 7) < 3) {
                ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
            }
        }
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

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;

    // ── Logo area (centered top) ──
    doc.setFillColor(17, 17, 17);
    doc.roundedRect(pageWidth / 2 - 35, 8, 70, 22, 3, 3, 'F');
    doc.setFontSize(14);
    doc.setTextColor(212, 175, 55);
    doc.text('NABDA', pageWidth / 2, 20, { align: 'center' });
    doc.setFontSize(6);
    doc.setTextColor(200, 200, 200);
    doc.text('Advertising, Publicity & Marketing', pageWidth / 2, 26, { align: 'center' });

    // ── Document info rows ──
    let yPos = 38;
    doc.setFontSize(8);

    // Draw info box
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.rect(margin, yPos, pageWidth - 2 * margin, 30);

    // Row 1: Date + Invoice Number
    doc.setTextColor(60, 60, 60);
    doc.text(`${_t('invIssueDate', 'Date')}: ${invoiceState.issueDate || '—'}`, pageWidth - margin - 2, yPos + 6, { align: 'right' });
    doc.text(`${_t('invDocNumber', 'Invoice #')}: ${invoiceState.docNumber}`, margin + 2, yPos + 6);

    // Row 2: Client + Phone
    doc.text(`${_t('invClientName', 'Client')}: ${invoiceState.clientName || '—'}`, pageWidth - margin - 2, yPos + 14, { align: 'right' });
    doc.text(`${_t('invPhone', 'Phone')}: ${invoiceState.clientPhone || '—'}`, margin + 2, yPos + 14);

    // Row 3: Address + Email
    doc.text(`${_t('invAddress', 'Address')}: ${invoiceState.clientAddress || '—'}`, pageWidth - margin - 2, yPos + 22, { align: 'right' });
    doc.text(`${_t('invEmail', 'Email')}: ${invoiceState.clientEmail || '—'}`, margin + 2, yPos + 22);

    // ── Line Items Table ──
    const tableData = invoiceState.lineItems
        .filter(li => li.name.trim())
        .map((li, idx) => [
            formatNum(li.quantity * li.unitPrice),
            formatNum(li.unitPrice),
            li.quantity.toString(),
            li.description,
            li.name,
            (idx + 1).toString()
        ]);

    doc.autoTable({
        startY: yPos + 34,
        head: [[
            _t('invTotal', 'المبلغ'),
            _t('invUnitPrice', 'السعر'),
            _t('invQty', 'الكمية'),
            _t('invDescription', 'الوصف'),
            _t('invItem', 'الصنف'),
            'م'
        ]],
        body: tableData,
        styles: {
            fontSize: 8,
            cellPadding: 3,
            textColor: [40, 40, 40],
            lineColor: [180, 180, 180],
            lineWidth: 0.3,
            halign: 'center',
        },
        headStyles: {
            fillColor: [240, 240, 240],
            textColor: [30, 30, 30],
            fontStyle: 'bold',
            fontSize: 7,
            halign: 'center',
        },
        alternateRowStyles: { fillColor: [250, 250, 250] },
        columnStyles: {
            0: { cellWidth: 28, halign: 'center' },
            1: { cellWidth: 25, halign: 'center' },
            2: { cellWidth: 18, halign: 'center' },
            4: { cellWidth: 35 },
            5: { cellWidth: 12, halign: 'center' },
        },
        margin: { left: margin, right: margin },
        tableLineColor: [180, 180, 180],
        tableLineWidth: 0.3,
    });

    let finalY = doc.lastAutoTable.finalY + 8;

    // ── Summary Section ──
    const summaryX = pageWidth - margin;
    const summaryLabelX = summaryX - 45;
    
    const summaryLines = [
        [_t('invSubtotal', 'الاجمالي'), formatNum(getSubtotal())],
        [_t('invDiscount', 'الخصم'), formatNum(getDiscountAmount())],
        [`${_t('invVAT', 'القيمة المضافة')} ${invoiceState.taxPercent}%`, formatNum(getTaxAmount())],
    ];
    if (invoiceState.shippingCost > 0) {
        summaryLines.push([_t('invShipping', 'الشحن'), formatNum(invoiceState.shippingCost)]);
    }

    doc.setFontSize(8);
    summaryLines.forEach(([label, value]) => {
        doc.setTextColor(80, 80, 80);
        doc.text(label, summaryX, finalY, { align: 'right' });
        doc.setTextColor(40, 40, 40);
        doc.text(value, summaryLabelX, finalY, { align: 'right' });
        finalY += 6;
    });

    // Total line
    doc.setDrawColor(150, 150, 150);
    doc.setLineWidth(0.5);
    doc.line(summaryLabelX - 30, finalY - 2, summaryX, finalY - 2);
    finalY += 4;
    
    doc.setFontSize(10);
    doc.setTextColor(30, 30, 30);
    doc.text(_t('invGrandTotal', 'المستحق'), summaryX, finalY, { align: 'right' });
    doc.text(formatNum(getGrandTotal()), summaryLabelX, finalY, { align: 'right' });
    
    finalY += 6;
    doc.setFontSize(8);
    doc.text(_t('invRemaining', 'المتبقي'), summaryX, finalY, { align: 'right' });
    doc.text('0', summaryLabelX, finalY, { align: 'right' });

    // ── Notes ──
    finalY += 12;
    if (invoiceState.notes) {
        doc.setFontSize(7);
        doc.setTextColor(120, 120, 120);
        doc.text(_t('invNotes', 'Notes'), pageWidth - margin, finalY, { align: 'right' });
        doc.setFontSize(8);
        doc.setTextColor(80, 80, 80);
        doc.text(invoiceState.notes, pageWidth - margin, finalY + 5, { maxWidth: pageWidth - 28, align: 'right' });
        finalY += 14;
    }

    // ── Footer ──
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text('الصفحة 1 من 1', pageWidth / 2, pageHeight - 12, { align: 'center' });
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(_t('invBranchInfo', 'الفرع الرئيسي'), pageWidth / 2, pageHeight - 7, { align: 'center' });

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
        <html dir="rtl"><head><title>${invoiceState.docNumber}</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Cairo', 'Inter', system-ui, sans-serif; padding: 30px; background: #fff; color: #1a1a1a; direction: rtl; }
            .inv-preview-card { background: #fff !important; color: #1a1a1a !important; }
            .inv-preview-card * { color: #1a1a1a !important; }
            .inv-new-logo { width: 140px; height: auto; background: #111; border-radius: 8px; padding: 6px 10px; }
            table { width: 100%; border-collapse: collapse; }
            th { background: #f0f0f0 !important; padding: 6px 10px; text-align: center; font-size: 0.75rem; border: 1px solid #bbb; }
            td { padding: 6px 10px; border: 1px solid #ccc; text-align: center; }
            .inv-new-meta { background: #fafafa; border: 1px solid #eee; padding: 8px 12px; border-radius: 4px; margin: 10px 0; }
            .inv-new-meta-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 4px; }
            .inv-meta-label { font-weight: 600; font-size: 0.8rem; }
            .inv-new-bottom { display: grid; grid-template-columns: auto 1fr; gap: 16px; margin-top: 12px; padding-top: 12px; border-top: 1px solid #ddd; }
            .inv-new-summary-row { display: flex; justify-content: space-between; padding: 3px 8px; border-bottom: 1px solid #eee; font-size: 0.85rem; }
            .inv-summary-total { background: #f5f5f5; border: 1px solid #ccc; border-radius: 4px; font-weight: 800; margin-top: 4px; }
            .inv-new-footer { text-align: center; margin-top: 16px; padding-top: 10px; border-top: 1px solid #ddd; }
            canvas { width: 90px; height: 90px; border: 1px solid #ddd; }
            @media print { body { padding: 10px; } @page { margin: 15mm; } }
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
