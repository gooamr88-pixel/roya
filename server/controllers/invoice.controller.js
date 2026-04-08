// ═══════════════════════════════════════════════
// Invoice Controller — Thin HTTP layer
// ═══════════════════════════════════════════════
const { AppError } = require('../middlewares/errorHandler');
const { asyncHandler } = require('../utils/helpers');
const pdfService = require('../services/pdf.service');
const emailService = require('../services/email.service');
const invoiceRepo = require('../repositories/invoice.repository');
const { query } = require('../config/database');

/**
 * POST /api/invoices/:orderId/generate
 */
const generate = asyncHandler(async (req, res) => {
    const order = await invoiceRepo.getOrderWithClient(req.params.orderId);
    if (!order) throw new AppError('Order not found.', 404);

    const invoiceNumber = order.invoice_number || `INV-${Date.now()}`;
    const subtotal = parseFloat(order.price);
    const tax = subtotal * 0.15;
    const total = subtotal + tax;

    // Generate PDF
    const pdfBuffer = await pdfService.generateInvoicePDF({
        invoiceNumber,
        serviceTitle: order.service_title,
        price: order.price,
        taxAmount: tax,
        clientName: order.client_name,
        clientEmail: order.client_email,
        clientPhone: order.client_phone,
        createdAt: order.created_at,
        status: order.status,
    });

    // Upsert invoice
    const existing = await invoiceRepo.findByOrderId(order.id);
    let invoice;

    if (existing) {
        invoice = await invoiceRepo.update({ orderId: order.id, totalAmount: total, taxAmount: tax, pdfBuffer });
    } else {
        invoice = await invoiceRepo.create({ orderId: order.id, invoiceNumber, totalAmount: total, taxAmount: tax, pdfBuffer });
    }

    // Send via email (non-blocking)
    emailService.sendInvoice(order.client_email, order.client_name, invoiceNumber, pdfBuffer).catch(() => {});

    // Don't send pdf_data in response
    const { pdf_data, ...invoiceData } = invoice;
    res.status(201).json({ success: true, data: { invoice: invoiceData } });
});

/**
 * GET /api/invoices/:id/download
 */
const download = asyncHandler(async (req, res) => {
    const invoice = await invoiceRepo.findByIdWithOwner(req.params.id);
    if (!invoice) throw new AppError('Invoice not found.', 404);

    const isAdmin = ['super_admin', 'admin'].includes(req.user.role);
    if (!isAdmin && invoice.user_id !== req.user.id) {
        throw new AppError('Access denied.', 403);
    }

    if (!invoice.pdf_data) {
        throw new AppError('PDF not available. Please regenerate the invoice.', 404);
    }

    const pdfBuffer = Buffer.isBuffer(invoice.pdf_data)
        ? invoice.pdf_data
        : Buffer.from(invoice.pdf_data);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${invoice.invoice_number}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.end(pdfBuffer);
});

/**
 * GET /api/invoices
 */
const getAll = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const isAdmin = ['super_admin', 'admin'].includes(req.user.role);

    const { rows, pagination } = await invoiceRepo.findAll({
        page, limit,
        userId: req.user.id,
        isAdmin,
    });

    res.json({ success: true, data: { invoices: rows, pagination } });
});

/**
 * GET /api/invoices/catalog
 * Returns a unified list of services, jobs, and portfolio items
 * so the invoice builder can auto-fill name + price from the DB.
 */
const getCatalog = asyncHandler(async (req, res) => {
    const [servicesResult, jobsResult, portfolioResult] = await Promise.all([
        query(
            `SELECT id, title, title_ar, price, category
             FROM services
             WHERE is_active = TRUE
             ORDER BY title ASC`,
            []
        ),
        query(
            `SELECT id, title, salary_range
             FROM jobs
             WHERE is_active = TRUE
             ORDER BY title ASC`,
            []
        ),
        query(
            `SELECT id, title, title_ar, category
             FROM portfolio_items
             WHERE is_active IS NOT FALSE
             ORDER BY title ASC`,
            []
        ),
    ]);

    // Normalize each source into a common shape:
    // { id, type, title, title_ar, price, category, description }
    const services = servicesResult.rows.map(s => ({
        id:        s.id,
        type:      'service',
        title:     s.title,
        title_ar:  s.title_ar || '',
        price:     parseFloat(s.price) || 0,
        category:  s.category || 'general',
        description: '',
    }));

    const jobs = jobsResult.rows.map(j => ({
        id:        j.id,
        type:      'job',
        title:     j.title,
        title_ar:  '',
        price:     0,  // Jobs typically don't have a fixed price
        category:  'recruitment',
        description: j.salary_range || '',
    }));

    const portfolio = portfolioResult.rows.map(p => ({
        id:        p.id,
        type:      'portfolio',
        title:     p.title,
        title_ar:  p.title_ar || '',
        price:     0,
        category:  p.category || 'design',
        description: '',
    }));

    res.json({
        success: true,
        data: {
            catalog: { services, jobs, portfolio },
            totals:  { services: services.length, jobs: jobs.length, portfolio: portfolio.length },
        },
    });
});

/**
 * POST /api/invoices/save
 * Persists a manually-built invoice from the Admin Dashboard.
 * Stores JSON payload in a dedicated column; does not require an orderId.
 */
const save = asyncHandler(async (req, res) => {
    const {
        mode, docNumber, issueDate, dueDate,
        clientName, clientEmail, clientAddress, clientPhone,
        lineItems, taxPercent, discountType, discountValue,
        shippingCost, notes, terms, currency,
        subtotal, discountAmount, taxAmount, grandTotal,
    } = req.body;

    if (!clientName?.trim()) throw new AppError('Client name is required.', 400);
    if (!lineItems?.length || lineItems.every(li => !li.name?.trim()))
        throw new AppError('At least one line item is required.', 400);

    const result = await query(
        `INSERT INTO invoices
             (invoice_number, total_amount, tax_amount, status, payload_json)
         VALUES ($1, $2, $3, 'draft', $4)
         RETURNING id, invoice_number, total_amount, tax_amount, status, created_at`,
        [
            docNumber || `${mode === 'invoice' ? 'INV' : 'QTE'}-${Date.now()}`,
            parseFloat(grandTotal) || 0,
            parseFloat(taxAmount)  || 0,
            JSON.stringify({
                mode, docNumber, issueDate, dueDate,
                clientName, clientEmail, clientAddress, clientPhone,
                lineItems, taxPercent, discountType, discountValue,
                shippingCost, notes, terms, currency,
                subtotal, discountAmount, taxAmount, grandTotal,
                savedBy: req.user.id,
                savedAt: new Date().toISOString(),
            }),
        ]
    );

    res.status(201).json({ success: true, data: { invoice: result.rows[0] } });
});

// ── NEW: Puppeteer Server-Side PDF Rendering ──
const fs = require('fs');
const path = require('path');
const downloadInvoicePDF = asyncHandler(async (req, res, next) => {
    let browser = null;
    let puppeteer;
    try {
        puppeteer = require('puppeteer');
    } catch (e) {
        return next(new AppError('Puppeteer is not installed on the server. Run: npm install puppeteer', 500));
    }

    try {
        // Invoice data is passed as base64-encoded JSON in the 'd' query param
        // This allows the browser to open the PDF URL directly (GET, no CSRF needed)
        let invoiceData;
        try {
            const raw = req.query.d;
            if (!raw) throw new Error('Missing invoice data');
            const decoded = Buffer.from(raw, 'base64').toString('utf8');
            invoiceData = JSON.parse(decoded);
        } catch (e) {
            return next(new AppError('Invalid or missing invoice payload. Please regenerate.', 400));
        }

        // Read logo and convert to base64 data URI so Puppeteer can render it
        // without needing to serve it over HTTP.
        // NOTE: Use PNG instead of SVG — complex SVGs with Adobe Illustrator
        // artifacts (Cyrillic gradient IDs, XML processing instructions) can
        // fail to render in Puppeteer's headless Chrome.
        let logoDataUri = '';
        try {
            // Try PNG first (most reliable in Puppeteer)
            const pngPath = path.join(__dirname, '../../client/images/brand-symbol.png');
            if (fs.existsSync(pngPath)) {
                const logoRaw = fs.readFileSync(pngPath);
                logoDataUri = `data:image/png;base64,${logoRaw.toString('base64')}`;
            } else {
                // Fallback to SVG
                const svgPath = path.join(__dirname, '../../client/images/nabda-invoice-logo.svg');
                const logoRaw = fs.readFileSync(svgPath);
                logoDataUri = `data:image/svg+xml;base64,${logoRaw.toString('base64')}`;
            }
        } catch (e) {
            console.warn('Could not read logo image:', e.message);
        }

        const isInvoice = invoiceData.isInvoice !== false;
        const docTypeAr = isInvoice ? 'فاتورة ضريبية' : 'عرض سعر';
        const docTypeEn = isInvoice ? 'TAX INVOICE' : 'QUOTATION';
        const currency = invoiceData.currency || 'SAR';

        const fmt = (n) => `${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

        const discLabel = invoiceData.discountType === 'percent'
            ? `الخصم (${invoiceData.discountValue || 0}%) <small>Discount</small>`
            : `الخصم <small>Discount</small>`;

        const lineItemsHTML = (invoiceData.lineItems || []).filter(i => i.name).map((item, idx) => `
            <tr>
                <td>${idx + 1}</td>
                <td style="font-weight:500;text-align:right">${item.name || '—'}</td>
                <td style="font-size:0.72rem;text-align:right">${item.description || ''}</td>
                <td>${item.quantity || 0}</td>
                <td>${fmt(item.unitPrice)}</td>
                <td style="font-weight:600">${fmt((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0))}</td>
            </tr>
        `).join('');

        let htmlContent = `
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
            <meta charset="UTF-8">
            <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">
            <style>
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body {
                    font-family: 'Tajawal', 'Cairo', sans-serif;
                    background: #fff;
                    color: #1a1a1a;
                    direction: rtl;
                    text-align: right;
                    font-size: 13px;
                    line-height: 1.5;
                    padding: 0;
                }

                .inv-preview-body {
                    padding: 24px 20px;
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                    color: #1a1a1a;
                    background: #fff;
                    direction: rtl;
                }

                /* ── Header: Logo + Company Info ── */
                .inv-new-header {
                    display: flex;
                    justify-content: flex-start;
                    align-items: center;
                    padding: 12px 0;
                    direction: rtl;
                    gap: 0;
                }
                .inv-new-header-logo { flex-shrink: 0; }
                .inv-new-logo {
                    width: 80px; height: 80px;
                    object-fit: contain;
                }
                .inv-new-header-info {
                    flex: 1;
                    text-align: center;
                    padding: 0 16px;
                }
                .inv-company-name-ar {
                    font-size: 1.1rem; font-weight: 700;
                    color: #1a1a1a; line-height: 1.5;
                }
                .inv-company-name-en {
                    font-size: 0.62rem; color: #888;
                    letter-spacing: 0.03em; margin-top: 2px;
                }

                /* ── Document Type Badge ── */
                .inv-doc-type-badge {
                    text-align: center; padding: 6px 0;
                    margin: 4px 0 10px 0;
                    border-top: 2px solid #d4af37;
                    border-bottom: 2px solid #d4af37;
                    font-size: 0.85rem; font-weight: 700;
                    color: #1a1a1a; letter-spacing: 0.03em;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }
                .inv-doc-type-divider { margin: 0 10px; color: #ccc; font-weight: 300; }
                .inv-doc-type-en { font-size: 0.78rem; letter-spacing: 0.08em; }

                /* ── Document Meta ── */
                .inv-new-meta {
                    display: flex; flex-direction: column; gap: 6px;
                    font-size: 0.78rem; padding: 10px 12px;
                    background: #fafafa; border: 1px solid #eee;
                    border-radius: 6px;
                    -webkit-print-color-adjust: exact; print-color-adjust: exact;
                }
                .inv-new-meta-row {
                    display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
                }
                .inv-new-meta-item { display: flex; gap: 6px; align-items: baseline; }
                .inv-meta-label { font-weight: 600; color: #333; white-space: nowrap; font-size: 0.75rem; }
                .inv-meta-value { color: #555; font-size: 0.75rem; }

                /* ── Table ── */
                .inv-new-table {
                    width: 100%; border-collapse: collapse;
                    border: 1px solid #bbb; font-size: 0.78rem;
                }
                .inv-new-table thead th {
                    background: #f0f0f0; color: #1a1a1a;
                    padding: 6px 8px; text-align: center;
                    font-size: 0.72rem; font-weight: 700;
                    border: 1px solid #bbb; white-space: nowrap;
                    line-height: 1.3;
                    -webkit-print-color-adjust: exact; print-color-adjust: exact;
                }
                .inv-new-table thead th small {
                    display: block; font-weight: 400;
                    font-size: 0.58rem; color: #888; margin-top: 1px;
                }
                .inv-th-num { width: 35px; }
                .inv-th-qty { width: 55px; }
                .inv-th-price { width: 70px; }
                .inv-th-total { width: 75px; }
                .inv-new-table tbody td {
                    padding: 7px 10px; border: 1px solid #ccc;
                    text-align: center; color: #333; font-size: 0.76rem;
                }
                .inv-new-table tbody tr:nth-child(even) {
                    background: #fafafa;
                    -webkit-print-color-adjust: exact; print-color-adjust: exact;
                }

                /* ── Bottom: QR + Summary ── */
                .inv-new-bottom {
                    display: grid; grid-template-columns: auto 1fr;
                    gap: 16px; align-items: start;
                    padding-top: 12px; border-top: 1px solid #ddd;
                    direction: rtl;
                }
                .inv-new-qr {
                    display: flex; align-items: flex-start;
                    justify-content: center; order: 2;
                }
                .inv-new-qr canvas, .inv-new-qr img {
                    width: 110px; height: 110px;
                    border: 1px solid #ddd; border-radius: 4px;
                    background: #fff;
                }
                .inv-new-summary {
                    display: flex; flex-direction: column;
                    gap: 4px; order: 1;
                }
                .inv-new-summary-row {
                    display: flex; justify-content: space-between;
                    align-items: center; padding: 4px 12px;
                    border-bottom: 1px solid #eee; font-size: 0.78rem;
                }
                .inv-new-summary-row small { font-size: 0.58rem; color: #999; margin-right: 4px; }
                .inv-summary-lbl { font-weight: 600; color: #333; text-align: right; }
                .inv-summary-val { font-weight: 500; color: #555; direction: ltr; text-align: left; }

                .inv-summary-total {
                    background: #f5f5f5; border: 1px solid #ccc;
                    border-radius: 4px; font-size: 0.85rem; margin-top: 4px;
                    -webkit-print-color-adjust: exact; print-color-adjust: exact;
                }
                .inv-summary-total .inv-summary-lbl { font-weight: 800; color: #1a1a1a; }
                .inv-summary-total .inv-summary-val { font-weight: 800; color: #1a1a1a; font-size: 0.9rem; }

                .inv-summary-paid {
                    background: #f0fdf4; border-radius: 3px;
                    -webkit-print-color-adjust: exact; print-color-adjust: exact;
                }
                .inv-summary-paid .inv-summary-val { color: #166534; font-weight: 600; }

                .inv-summary-remaining {
                    background: #fef2f2; border-radius: 3px; margin-top: 2px;
                    -webkit-print-color-adjust: exact; print-color-adjust: exact;
                }
                .inv-summary-remaining .inv-summary-val { color: #b91c1c; font-weight: 700; }

                /* ── Notes ── */
                .inv-prev-notes-section {
                    background: #fafafa; border: 1px solid #eee;
                    border-radius: 4px; padding: 6px 8px;
                    font-size: 0.75rem;
                    -webkit-print-color-adjust: exact; print-color-adjust: exact;
                }
                .inv-prev-notes-label { font-weight: 600; font-size: 0.7rem; color: #555; }
                .inv-prev-notes-label small { color: #999; margin-right: 4px; }
                .inv-prev-notes-text { color: #333; margin-top: 2px; }

                /* ── Footer ── */
                .inv-new-footer {
                    text-align: center; padding-top: 12px;
                    border-top: 1px solid #ddd;
                    display: flex; flex-direction: column; gap: 4px;
                }
                .inv-new-footer-page { font-size: 0.65rem; color: #999; }
                .inv-new-footer-branch { font-size: 0.72rem; color: #555; font-weight: 500; }

                @media print {
                    body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                    tr { page-break-inside: avoid; }
                }
            </style>
        </head>
        <body>
            <div class="inv-preview-body">

                <!-- ── Header: Logo + Company Info ── -->
                <div class="inv-new-header">
                    <div class="inv-new-header-logo">
                        ${logoDataUri
                            ? `<img src="${logoDataUri}" alt="Nabda" class="inv-new-logo">`
                            : `<div style="width:80px;height:80px;background:#f0f0f0;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#999;font-weight:700;font-size:11px;">LOGO</div>`
                        }
                    </div>
                    <div class="inv-new-header-info">
                        <div class="inv-company-name-ar">${invoiceData.companyNameAr || 'نبضة للدعاية والإعلان والتسويق'}</div>
                        <div class="inv-company-name-en">${invoiceData.companyNameEn || 'Nabda for Advertising, Publicity &amp; Marketing'}</div>
                    </div>
                </div>

                <!-- ── Document Type Badge ── -->
                <div class="inv-doc-type-badge">
                    <span class="inv-doc-type-ar">${docTypeAr}</span>
                    <span class="inv-doc-type-divider">|</span>
                    <span class="inv-doc-type-en">${docTypeEn}</span>
                </div>

                <!-- ── Document Meta ── -->
                <div class="inv-new-meta">
                    <div class="inv-new-meta-row">
                        <div class="inv-new-meta-item">
                            <span class="inv-meta-label">التاريخ:</span>
                            <span class="inv-meta-value">${invoiceData.issueDate || '—'}</span>
                        </div>
                        <div class="inv-new-meta-item">
                            <span class="inv-meta-label">رقم الفاتورة:</span>
                            <span class="inv-meta-value">${invoiceData.docNumber || '—'}</span>
                        </div>
                    </div>
                    <div class="inv-new-meta-row">
                        <div class="inv-new-meta-item">
                            <span class="inv-meta-label">اسم العميل:</span>
                            <span class="inv-meta-value">${invoiceData.clientName || '—'}</span>
                        </div>
                        <div class="inv-new-meta-item">
                            <span class="inv-meta-label">التلفون:</span>
                            <span class="inv-meta-value">${invoiceData.clientPhone || '—'}</span>
                        </div>
                    </div>
                    <div class="inv-new-meta-row">
                        <div class="inv-new-meta-item">
                            <span class="inv-meta-label">العنوان:</span>
                            <span class="inv-meta-value">${invoiceData.clientAddress || '—'}</span>
                        </div>
                        <div class="inv-new-meta-item">
                            <span class="inv-meta-label">البريد:</span>
                            <span class="inv-meta-value">${invoiceData.clientEmail || '—'}</span>
                        </div>
                    </div>
                    <div class="inv-new-meta-row">
                        <div class="inv-new-meta-item">
                            <span class="inv-meta-label">الرقم الضريبي:</span>
                            <span class="inv-meta-value">${invoiceData.taxNumber || '—'}</span>
                        </div>
                        <div class="inv-new-meta-item">
                            <span class="inv-meta-label">تاريخ الاستحقاق:</span>
                            <span class="inv-meta-value">${invoiceData.dueDate || '—'}</span>
                        </div>
                    </div>
                </div>

                <!-- ── Line Items Table ── -->
                <table class="inv-new-table">
                    <thead>
                        <tr>
                            <th class="inv-th-num">م<br><small>No</small></th>
                            <th class="inv-th-item">الصنف<br><small>Item</small></th>
                            <th class="inv-th-desc">الوصف<br><small>Description</small></th>
                            <th class="inv-th-qty">الكمية<br><small>Qty</small></th>
                            <th class="inv-th-price">السعر<br><small>Price</small></th>
                            <th class="inv-th-total">المبلغ<br><small>Amount</small></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${lineItemsHTML || '<tr><td colspan="6" style="text-align:center;color:#999;padding:20px;font-style:italic;">لا توجد بنود</td></tr>'}
                    </tbody>
                </table>

                <!-- ── Bottom: QR + Summary ── -->
                <div class="inv-new-bottom">
                    <div class="inv-new-qr">
                        <div style="width:110px;height:110px;border:1px solid #ddd;border-radius:4px;background:#f9f9f9;display:flex;align-items:center;justify-content:center;color:#ccc;font-size:11px;">QR</div>
                    </div>
                    <div class="inv-new-summary">
                        <div class="inv-new-summary-row">
                            <span class="inv-summary-val">${fmt(invoiceData.subtotal)}</span>
                            <span class="inv-summary-lbl">الاجمالي <small>Subtotal</small></span>
                        </div>
                        <div class="inv-new-summary-row">
                            <span class="inv-summary-val">${fmt(invoiceData.discountAmount)}</span>
                            <span class="inv-summary-lbl">${discLabel}</span>
                        </div>
                        <div class="inv-new-summary-row">
                            <span class="inv-summary-val">${fmt(invoiceData.taxAmount)}</span>
                            <span class="inv-summary-lbl">القيمة المضافة ${invoiceData.taxPercent || 0}% <small>VAT</small></span>
                        </div>
                        <div class="inv-new-summary-row">
                            <span class="inv-summary-val">${fmt(invoiceData.shippingCost || 0)}</span>
                            <span class="inv-summary-lbl">الشحن <small>Shipping</small></span>
                        </div>
                        <div class="inv-new-summary-row inv-summary-total">
                            <span class="inv-summary-val">${fmt(invoiceData.grandTotal)}</span>
                            <span class="inv-summary-lbl">المستحق <small>Total Due</small></span>
                        </div>
                        <div class="inv-new-summary-row inv-summary-paid">
                            <span class="inv-summary-val">${fmt(invoiceData.amountPaid || 0)}</span>
                            <span class="inv-summary-lbl">المدفوع <small>Paid</small></span>
                        </div>
                        <div class="inv-new-summary-row inv-summary-remaining">
                            <span class="inv-summary-val">${fmt(Math.max(0, (Number(invoiceData.grandTotal)||0) - (Number(invoiceData.amountPaid)||0)))}</span>
                            <span class="inv-summary-lbl">المتبقي <small>Remaining</small></span>
                        </div>
                    </div>
                </div>

                <!-- ── Notes & Terms ── -->
                ${invoiceData.notes ? `
                <div class="inv-prev-notes-section">
                    <div class="inv-prev-notes-label">ملاحظات <small>Notes</small></div>
                    <div class="inv-prev-notes-text">${invoiceData.notes.replace(/\n/g, '<br/>')}</div>
                </div>` : ''}
                ${invoiceData.terms ? `
                <div class="inv-prev-notes-section">
                    <div class="inv-prev-notes-label">الشروط <small>Terms</small></div>
                    <div class="inv-prev-notes-text">${invoiceData.terms.replace(/\n/g, '<br/>')}</div>
                </div>` : ''}

                <!-- ── Footer ── -->
                <div class="inv-new-footer">
                    <div class="inv-new-footer-page">الصفحة 1 من 1 | Page 1 of 1</div>
                    <div class="inv-new-footer-branch">${invoiceData.branchInfo || 'الفرع الرئيسي'}</div>
                </div>

            </div>
        </body>
        </html>
        `;

        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-zygote']
        });

        const page = await browser.newPage();
        // Set content and wait for network/fonts to load
        await page.setContent(htmlContent, { waitUntil: 'networkidle0', timeout: 30000 });
        // Wait for Google Fonts + embedded base64 images to fully render
        await page.evaluateHandle('document.fonts.ready');
        // Small extra delay ensures base64 images finish rendering
        await new Promise(r => setTimeout(r, 500));

        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '12mm', right: '14mm', bottom: '12mm', left: '14mm' },
            displayHeaderFooter: false,
        });

        await browser.close();

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${invoiceData.docNumber || 'document'}.pdf"`);
        res.setHeader('Content-Length', pdfBuffer.length);

        return res.end(pdfBuffer);
    } catch (err) {
        if (browser) await browser.close();
        console.error('[PDF Generator Error]:', err);
        return next(new AppError('Failed to generate PDF. Reason: ' + (err.message || 'Unknown'), 500));
    }
});

module.exports = { generate, download, getAll, getCatalog, save, downloadInvoicePDF };
