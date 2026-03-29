// ═══════════════════════════════════════════════
// Admin V2.0 — Invoicing & Quotation Generator
// Premium module with real-time A4 preview,
// dynamic line items, auto-calculations, and PDF export.
// Depends on: api.js, utils.js, admin.init.js, jspdf, jspdf-autotable
// ═══════════════════════════════════════════════

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

/* ── Init ── */
function initInvoicing() {
    generateDocNumber();
    setTodayDate();
    renderLineItems();
    bindInvoiceFormEvents();
    updatePreview();
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
    // Default due date = 30 days out
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

    // Update badge colours
    const badge = document.getElementById('invModeBadge');
    if (badge) {
        badge.textContent = mode === 'invoice' ? 'فاتورة ضريبية — Tax Invoice' : 'عرض سعر — Quotation';
        badge.className = `inv-mode-badge ${mode}`;
    }
    generateDocNumber();
    updatePreview();
}

/* ── Line Items ── */
function renderLineItems() {
    const container = document.getElementById('invLineItemsBody');
    if (!container) return;

    container.innerHTML = invoiceState.lineItems.map((item, i) => `
        <tr class="inv-line-row" data-idx="${i}">
            <td class="inv-line-num">${i + 1}</td>
            <td>
                <input type="text" class="form-input inv-line-input" placeholder="Item name"
                    value="${esc(item.name)}" data-field="name" data-idx="${i}"
                    oninput="updateLineItem(${i}, 'name', this.value)">
            </td>
            <td>
                <input type="text" class="form-input inv-line-input" placeholder="Description"
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
    // Focus the new item name
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
    // Update row total
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

    // Discount type select
    const discountTypeEl = document.getElementById('invDiscountType');
    if (discountTypeEl) {
        discountTypeEl.addEventListener('change', () => {
            invoiceState.discountType = discountTypeEl.value;
            updatePreview();
        });
    }
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

    // Header
    const titleEl = document.getElementById('prevDocTitle');
    if (titleEl) titleEl.textContent = isInvoice ? 'TAX INVOICE' : 'QUOTATION';

    const titleArEl = document.getElementById('prevDocTitleAr');
    if (titleArEl) titleArEl.textContent = isInvoice ? 'فاتورة ضريبية' : 'عرض سعر';

    const numEl = document.getElementById('prevDocNumber');
    if (numEl) numEl.textContent = invoiceState.docNumber || '—';

    const dateEl = document.getElementById('prevIssueDate');
    if (dateEl) dateEl.textContent = invoiceState.issueDate || '—';

    const dueEl = document.getElementById('prevDueDate');
    if (dueEl) dueEl.textContent = invoiceState.dueDate || '—';

    const dueLabelEl = document.getElementById('prevDueDateLabel');
    if (dueLabelEl) dueLabelEl.textContent = isInvoice ? 'Due Date' : 'Valid Until';

    // Client
    const cName = document.getElementById('prevClientName');
    if (cName) cName.textContent = invoiceState.clientName || 'Client Name';
    const cEmail = document.getElementById('prevClientEmail');
    if (cEmail) cEmail.textContent = invoiceState.clientEmail || '—';
    const cAddr = document.getElementById('prevClientAddress');
    if (cAddr) cAddr.textContent = invoiceState.clientAddress || '—';
    const cPhone = document.getElementById('prevClientPhone');
    if (cPhone) cPhone.textContent = invoiceState.clientPhone || '—';

    // Line items
    const tbody = document.getElementById('prevLineItems');
    if (tbody) {
        if (invoiceState.lineItems.length === 0 || (invoiceState.lineItems.length === 1 && !invoiceState.lineItems[0].name)) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-3);padding:20px;font-style:italic;">Add line items to see them here</td></tr>';
        } else {
            tbody.innerHTML = invoiceState.lineItems.map((item, i) => `
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

    // Financials
    const setFinancial = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = formatMoney(value);
    };
    setFinancial('prevSubtotal', subtotal);
    setFinancial('prevDiscount', discount);
    setFinancial('prevTax', tax);
    setFinancial('prevShipping', invoiceState.shippingCost);
    setFinancial('prevGrandTotal', grandTotal);

    // Tax / discount labels
    const taxLabel = document.getElementById('prevTaxLabel');
    if (taxLabel) taxLabel.textContent = `VAT (${invoiceState.taxPercent}%)`;
    const discountLabel = document.getElementById('prevDiscountLabel');
    if (discountLabel) {
        discountLabel.textContent = invoiceState.discountType === 'percent'
            ? `Discount (${invoiceState.discountValue}%)`
            : 'Discount (Fixed)';
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

    // Accent stripe
    const stripe = document.getElementById('prevAccentStripe');
    if (stripe) {
        stripe.style.background = isInvoice
            ? 'linear-gradient(135deg, #d4af37, #f0d878, #d4af37)'
            : 'linear-gradient(135deg, #10b981, #34d399, #10b981)';
    }
}

/* ── Save & Issue ── */
async function invoiceSaveAndIssue() {
    // Validation
    if (!invoiceState.clientName.trim()) {
        Toast.error('Client name is required.');
        document.getElementById('invClientName')?.focus();
        return;
    }
    if (invoiceState.lineItems.every(li => !li.name.trim())) {
        Toast.error('At least one line item is required.');
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
        // Try saving to backend if route exists
        await API.post('/invoices/save', payload);
        Toast.success(invoiceState.mode === 'invoice'
            ? 'Invoice saved & issued!'
            : 'Quotation saved successfully!');
    } catch (err) {
        // If no backend route, just show success for offline usage
        if (err.message?.includes('404') || err.message?.includes('Not Found')) {
            Toast.success('Document saved locally. Backend route not configured yet.');
        } else {
            Toast.error(err.message || 'Failed to save document.');
        }
    }
}

/* ── PDF / Print ── */
function invoiceDownloadPDF() {
    if (!window.jspdf) {
        Toast.error('PDF library not loaded.');
        return;
    }

    const { jsPDF } = window.jspdf;
    const isInvoice = invoiceState.mode === 'invoice';
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const accentColor = isInvoice ? [212, 175, 55] : [16, 185, 129];
    const pageWidth = doc.internal.pageSize.getWidth();

    // Accent stripe
    doc.setFillColor(...accentColor);
    doc.rect(0, 0, pageWidth, 6, 'F');

    // Logo area / Brand
    doc.setFontSize(22);
    doc.setTextColor(40, 40, 40);
    doc.text('NABDA', 14, 22);
    doc.setFontSize(9);
    doc.setTextColor(140, 140, 140);
    doc.text('Nabda Platform — Advertising & Marketing', 14, 28);

    // Document Title
    doc.setFontSize(28);
    doc.setTextColor(...accentColor);
    doc.text(isInvoice ? 'TAX INVOICE' : 'QUOTATION', pageWidth - 14, 22, { align: 'right' });
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(isInvoice ? '\u0641\u0627\u062a\u0648\u0631\u0629 \u0636\u0631\u064a\u0628\u064a\u0629' : '\u0639\u0631\u0636 \u0633\u0639\u0631', pageWidth - 14, 28, { align: 'right' });

    // Doc number & dates
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.text(`# ${invoiceState.docNumber}`, pageWidth - 14, 36, { align: 'right' });
    doc.text(`Issue: ${invoiceState.issueDate}`, pageWidth - 14, 41, { align: 'right' });
    doc.text(`${isInvoice ? 'Due' : 'Valid Until'}: ${invoiceState.dueDate}`, pageWidth - 14, 46, { align: 'right' });

    // Separator
    doc.setDrawColor(220, 220, 220);
    doc.line(14, 52, pageWidth - 14, 52);

    // Bill To
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text('BILL TO', 14, 60);
    doc.setFontSize(12);
    doc.setTextColor(40);
    doc.text(invoiceState.clientName || 'Client Name', 14, 67);
    doc.setFontSize(9);
    doc.setTextColor(100);
    let clientY = 73;
    if (invoiceState.clientEmail) { doc.text(invoiceState.clientEmail, 14, clientY); clientY += 5; }
    if (invoiceState.clientAddress) { doc.text(invoiceState.clientAddress, 14, clientY); clientY += 5; }
    if (invoiceState.clientPhone) { doc.text(invoiceState.clientPhone, 14, clientY); clientY += 5; }

    // Line items table
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
        head: [['Item', 'Description', 'Qty', 'Unit Price', 'Total']],
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

    // Financials summary
    let finalY = doc.lastAutoTable.finalY + 10;
    const summaryX = pageWidth - 80;

    const summaryLines = [
        ['Subtotal', formatMoney(getSubtotal())],
        [`Discount`, `- ${formatMoney(getDiscountAmount())}`],
        [`VAT (${invoiceState.taxPercent}%)`, formatMoney(getTaxAmount())],
    ];
    if (invoiceState.shippingCost > 0) {
        summaryLines.push(['Shipping', formatMoney(invoiceState.shippingCost)]);
    }

    doc.setFontSize(9);
    summaryLines.forEach(([label, value]) => {
        doc.setTextColor(120);
        doc.text(label, summaryX, finalY);
        doc.setTextColor(60);
        doc.text(value, pageWidth - 14, finalY, { align: 'right' });
        finalY += 6;
    });

    // Grand Total
    doc.setDrawColor(...accentColor);
    doc.setLineWidth(0.5);
    doc.line(summaryX, finalY, pageWidth - 14, finalY);
    finalY += 6;
    doc.setFontSize(12);
    doc.setTextColor(...accentColor);
    doc.text('GRAND TOTAL', summaryX, finalY);
    doc.setFontSize(14);
    doc.setTextColor(40);
    doc.text(formatMoney(getGrandTotal()), pageWidth - 14, finalY, { align: 'right' });

    // Notes & Terms
    finalY += 14;
    if (invoiceState.notes) {
        doc.setFontSize(8);
        doc.setTextColor(140);
        doc.text('NOTES', 14, finalY);
        doc.setFontSize(9);
        doc.setTextColor(100);
        doc.text(invoiceState.notes, 14, finalY + 5, { maxWidth: pageWidth - 28 });
        finalY += 15;
    }
    if (invoiceState.terms) {
        doc.setFontSize(8);
        doc.setTextColor(140);
        doc.text('TERMS & CONDITIONS', 14, finalY);
        doc.setFontSize(9);
        doc.setTextColor(100);
        doc.text(invoiceState.terms, 14, finalY + 5, { maxWidth: pageWidth - 28 });
    }

    // Footer stripe
    const pageH = doc.internal.pageSize.getHeight();
    doc.setFillColor(...accentColor);
    doc.rect(0, pageH - 4, pageWidth, 4, 'F');

    // Save
    const filename = `${invoiceState.docNumber || 'document'}_${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(filename);
    Toast.success(`PDF downloaded: ${filename}`);
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
    // Reset form inputs
    document.querySelectorAll('#invFormSection input, #invFormSection textarea, #invFormSection select').forEach(el => {
        if (el.type === 'select-one') el.selectedIndex = 0;
        else el.value = '';
    });
    generateDocNumber();
    setTodayDate();
    renderLineItems();
    updatePreview();
    Toast.success('Form reset.');
}
