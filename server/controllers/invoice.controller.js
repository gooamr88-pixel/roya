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
        shippingCost, notes, terms,
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
                shippingCost, notes, terms,
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
        const invoiceData = req.body;

        // Read logo and convert to base64 data URI so Puppeteer can render it
        // without needing to serve it over HTTP
        let logoDataUri = '';
        try {
            const logoPath = path.join(__dirname, '../../client/images/nabda-invoice-logo.svg');
            const logoRaw = fs.readFileSync(logoPath);
            logoDataUri = `data:image/svg+xml;base64,${logoRaw.toString('base64')}`;
        } catch (e) {
            console.warn('Could not read logo image:', e);
        }

        const isInvoice = invoiceData.isInvoice !== false;
        const docTypeAr = isInvoice ? 'فاتورة ضريبية' : 'عرض سعر';
        const docTypeEn = isInvoice ? 'TAX INVOICE' : 'QUOTATION';

        const fmt = (n) => (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        const lineItemsHTML = (invoiceData.lineItems || []).filter(i => i.name).map((item, idx) => `
            <tr>
                <td>${idx + 1}</td>
                <td style="font-weight:600;text-align:right">${item.name || '—'}</td>
                <td style="font-size:11px;color:#555;text-align:right">${item.description || ''}</td>
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
            <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">
            <style>
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body {
                    font-family: 'Tajawal', 'Cairo', sans-serif;
                    background: #fff;
                    color: #1a1a1a;
                    direction: rtl;
                    font-size: 13px;
                    line-height: 1.5;
                }

                /* ── Table ── */
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin: 14px 0;
                    font-size: 12px;
                }
                thead th {
                    background: #1a1a2e;
                    color: #d4af37;
                    padding: 10px 10px;
                    text-align: center;
                    font-weight: 700;
                    border: 1px solid #1a1a2e;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                    font-size: 11px;
                    letter-spacing: 0.03em;
                }
                tbody td {
                    padding: 8px 10px;
                    border: 1px solid #e0e0e0;
                    text-align: center;
                    color: #333;
                }
                tbody tr:nth-child(even) td {
                    background: #f8f8f8;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }
                tbody tr:last-child td { border-bottom: 2px solid #d4af37; }

                /* ── Totals Box ── */
                .inv-totals-box {
                    min-width: 280px;
                    border: 1px solid #e0e0e0;
                    border-radius: 6px;
                    overflow: hidden;
                    flex-shrink: 0;
                }
                .inv-totals-box-title {
                    background: #1a1a2e;
                    color: #d4af37;
                    font-weight: 800;
                    font-size: 11px;
                    padding: 8px 14px;
                    letter-spacing: 0.05em;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }
                .inv-total-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 7px 14px;
                    border-bottom: 1px solid #f0f0f0;
                    font-size: 12px;
                }
                .inv-total-row:last-child { border-bottom: none; }
                .inv-total-row .lbl { color: #666; font-weight: 600; }
                .inv-total-row .val { color: #333; direction: ltr; font-weight: 600; }
                .inv-total-row.grand {
                    background: #1a1a2e;
                    padding: 11px 14px;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }
                .inv-total-row.grand .lbl { color: #d4af37; font-weight: 700; font-size: 13px; }
                .inv-total-row.grand .val { color: #fff; font-weight: 900; font-size: 15px; direction: ltr; }
                .inv-total-row.paid-row { background: #f0fdf4; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
                .inv-total-row.paid-row .lbl { color: #166534; }
                .inv-total-row.paid-row .val { color: #166534; }
                .inv-total-row.remaining-row { background: #fef2f2; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
                .inv-total-row.remaining-row .lbl { color: #991b1b; }
                .inv-total-row.remaining-row .val { color: #991b1b; }

                /* ── Notes ── */
                .inv-notes {
                    padding: 10px 14px;
                    border-right: 3px solid #d4af37;
                    background: #fffdf5;
                    font-size: 12px;
                    margin-bottom: 8px;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }
                .inv-notes .lbl { font-weight: 700; font-size: 10px; color: #8a6d00; margin-bottom: 4px; letter-spacing:0.05em; }
                .inv-notes .txt { color: #444; }

                /* ── Gold Bar ── */
                .gold-bar {
                    height: 5px;
                    background: linear-gradient(90deg,#7c461d,#a57029,#f2d379,#e9ae39,#e3a430,#dc9927,#c7832a,#82481e);
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }

                @media print {
                    body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                    tr { page-break-inside: avoid; }
                }
            </style>
        </head>
        <body style="padding:0;">

            <!-- TOP GOLD BAR -->
            <div class="gold-bar"></div>

            <!-- ═══════════════════════════════════════ -->
            <!-- CORPORATE HEADER                        -->
            <!-- ═══════════════════════════════════════ -->
            <div style="
                display:flex;
                justify-content:space-between;
                align-items:flex-start;
                padding:18px 22px 16px;
                background:#fff;
                border-bottom:1px solid #ebebeb;
            ">
                <!-- RIGHT SIDE: Logo + Company Identity -->
                <div style="display:flex;align-items:center;gap:14px;flex-direction:row-reverse;flex:1;">
                    <div style="flex-shrink:0;">
                        ${logoDataUri
                            ? `<img src="${logoDataUri}" alt="Company Logo" style="width:80px;height:80px;object-fit:contain;display:block;">`
                            : `<div style="width:80px;height:80px;background:#1a1a2e;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#d4af37;font-weight:900;font-size:13px;letter-spacing:1px;-webkit-print-color-adjust:exact;print-color-adjust:exact;">NABDA</div>`
                        }
                    </div>
                    <div style="text-align:right;">
                        <div style="font-size:20px;font-weight:900;color:#1a1a2e;line-height:1.2;">
                            ${invoiceData.companyNameAr || 'نبضة للدعاية والإعلان والتسويق'}
                        </div>
                        <div style="font-size:10px;color:#b8860b;font-weight:700;letter-spacing:0.07em;margin-top:3px;text-transform:uppercase;">
                            ${invoiceData.companyNameEn || 'Nabda for Advertising, Publicity &amp; Marketing'}
                        </div>
                        <div style="margin-top:9px;font-size:11px;color:#666;line-height:1.9;">
                            <div>الرياض، المملكة العربية السعودية &nbsp;|&nbsp; Riyadh, Saudi Arabia</div>
                            <div>www.nabdaads.com &nbsp;|&nbsp; +966 5X XXX XXXX</div>
                            <div style="margin-top:4px;">
                                <span style="background:#1a1a2e;color:#d4af37;padding:2px 10px;border-radius:3px;font-size:10px;font-weight:700;-webkit-print-color-adjust:exact;print-color-adjust:exact;">
                                    الرقم الضريبي: 310XXXXXXXXX
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- LEFT SIDE: Document Badge + Info + QR -->
                <div style="display:flex;flex-direction:column;align-items:flex-start;gap:10px;min-width:170px;">
                    <div style="
                        background:#1a1a2e;color:#d4af37;
                        padding:7px 18px;border-radius:4px;
                        font-weight:900;font-size:12px;
                        letter-spacing:0.07em;text-align:center;
                        -webkit-print-color-adjust:exact;print-color-adjust:exact;
                    ">
                        ${docTypeAr}<br>
                        <span style="font-size:9px;letter-spacing:0.14em;color:#f0d060;">${docTypeEn}</span>
                    </div>
                    <div style="font-size:11.5px;color:#555;line-height:2.1;">
                        <div><span style="font-weight:700;color:#222;">رقم المستند:</span> ${invoiceData.docNumber || '—'}</div>
                        <div><span style="font-weight:700;color:#222;">تاريخ الإصدار:</span> ${invoiceData.issueDate || '—'}</div>
                        <div><span style="font-weight:700;color:#222;">تاريخ الاستحقاق:</span> ${invoiceData.dueDate || '—'}</div>
                    </div>
                    ${invoiceData.qrImage ? `<img src="${invoiceData.qrImage}" alt="QR" style="width:80px;height:80px;object-fit:contain;border:1px solid #ddd;border-radius:4px;padding:3px;">` : ''}
                </div>
            </div>

            <!-- ═══════════════════════════════════════ -->
            <!-- BODY                                    -->
            <!-- ═══════════════════════════════════════ -->
            <div style="padding:16px 22px 22px;">

                <!-- ── Bill To ── -->
                <div style="
                    background:#f8f9ff;
                    border:1px solid #e0e4f0;
                    border-right:4px solid #1a1a2e;
                    border-radius:0 6px 6px 0;
                    padding:11px 16px;
                    margin-bottom:4px;
                    -webkit-print-color-adjust:exact;
                    print-color-adjust:exact;
                ">
                    <div style="font-size:9px;font-weight:900;color:#1a1a2e;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:8px;">
                        فاتورة إلى &nbsp;·&nbsp; BILL TO
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 20px;font-size:12px;">
                        <div><span style="font-weight:700;color:#333;">الاسم:</span> <span style="color:#555;">${invoiceData.clientName || '—'}</span></div>
                        <div><span style="font-weight:700;color:#333;">الرقم الضريبي:</span> <span style="color:#555;">${invoiceData.taxNumber || '—'}</span></div>
                        <div><span style="font-weight:700;color:#333;">الهاتف:</span> <span style="color:#555;direction:ltr;display:inline-block;">${invoiceData.clientPhone || '—'}</span></div>
                        <div><span style="font-weight:700;color:#333;">البريد:</span> <span style="color:#555;">${invoiceData.clientEmail || '—'}</span></div>
                        <div style="grid-column:1/-1;"><span style="font-weight:700;color:#333;">العنوان:</span> <span style="color:#555;">${invoiceData.clientAddress || '—'}</span></div>
                    </div>
                </div>

                <!-- ── Line Items Table ── -->
                <table>
                    <thead>
                        <tr>
                            <th style="width:30px;">م<br><small style="font-weight:400;font-size:9px;opacity:0.6;">No.</small></th>
                            <th>الصنف / البند<br><small style="font-weight:400;font-size:9px;opacity:0.6;">Item</small></th>
                            <th>الوصف<br><small style="font-weight:400;font-size:9px;opacity:0.6;">Description</small></th>
                            <th style="width:48px;">الكمية<br><small style="font-weight:400;font-size:9px;opacity:0.6;">Qty</small></th>
                            <th style="width:78px;">السعر<br><small style="font-weight:400;font-size:9px;opacity:0.6;">Unit Price</small></th>
                            <th style="width:88px;">المبلغ<br><small style="font-weight:400;font-size:9px;opacity:0.6;">Amount</small></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${lineItemsHTML || '<tr><td colspan="6" style="text-align:center;color:#bbb;padding:24px;font-size:12px;">لا توجد بنود مضافة</td></tr>'}
                    </tbody>
                </table>

                <!-- ── Bottom: Notes + Totals ── -->
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:20px;margin-top:8px;">

                    <!-- Notes / Terms -->
                    <div style="flex:1;">
                        ${invoiceData.notes ? `
                        <div class="inv-notes">
                            <div class="lbl">ملاحظات &nbsp;&#x2022;&nbsp; NOTES</div>
                            <div class="txt">${invoiceData.notes.replace(/\n/g, '<br/>')}</div>
                        </div>` : ''}
                        ${invoiceData.terms ? `
                        <div class="inv-notes">
                            <div class="lbl">الشروط والأحكام &nbsp;&#x2022;&nbsp; TERMS &amp; CONDITIONS</div>
                            <div class="txt">${invoiceData.terms.replace(/\n/g, '<br/>')}</div>
                        </div>` : ''}
                        ${!invoiceData.notes && !invoiceData.terms
                            ? `<div style="color:#ccc;font-size:11px;padding-top:8px;">— لا توجد ملاحظات إضافية —</div>`
                            : ''}
                    </div>

                    <!-- Totals Box -->
                    <div class="inv-totals-box">
                        <div class="inv-totals-box-title">ملخص المبالغ &nbsp;·&nbsp; SUMMARY</div>
                        <div class="inv-total-row">
                            <span class="lbl">الإجمالي الفرعي <small style="color:#aaa;">Subtotal</small></span>
                            <span class="val">${fmt(invoiceData.subtotal)}</span>
                        </div>
                        <div class="inv-total-row">
                            <span class="lbl">الخصم <small style="color:#aaa;">Discount</small></span>
                            <span class="val">${fmt(invoiceData.discountAmount)}</span>
                        </div>
                        <div class="inv-total-row">
                            <span class="lbl">ض.ق.م ${invoiceData.taxPercent || 0}% <small style="color:#aaa;">VAT</small></span>
                            <span class="val">${fmt(invoiceData.taxAmount)}</span>
                        </div>
                        ${(invoiceData.shippingCost && Number(invoiceData.shippingCost) > 0) ? `
                        <div class="inv-total-row">
                            <span class="lbl">الشحن <small style="color:#aaa;">Shipping</small></span>
                            <span class="val">${fmt(invoiceData.shippingCost)}</span>
                        </div>` : ''}
                        <div class="inv-total-row grand">
                            <span class="lbl">الإجمالي المستحق &nbsp;<small>Total Due</small></span>
                            <span class="val">${fmt(invoiceData.grandTotal)}</span>
                        </div>
                        ${(invoiceData.amountPaid !== undefined && invoiceData.amountPaid !== null) ? `
                        <div class="inv-total-row paid-row">
                            <span class="lbl">المدفوع <small>Paid</small></span>
                            <span class="val">${fmt(invoiceData.amountPaid)}</span>
                        </div>
                        <div class="inv-total-row remaining-row">
                            <span class="lbl">المتبقي <small>Remaining</small></span>
                            <span class="val">${fmt(Math.max(0, (Number(invoiceData.grandTotal)||0) - (Number(invoiceData.amountPaid)||0)))}</span>
                        </div>` : ''}
                    </div>
                </div>

                <!-- ── Footer ── -->
                <div style="
                    margin-top:26px;
                    padding-top:12px;
                    border-top:1px solid #e5e5e5;
                    display:flex;
                    justify-content:space-between;
                    align-items:center;
                    font-size:10px;
                    color:#aaa;
                ">
                    <div>الصفحة 1 من 1 &nbsp;|&nbsp; Page 1 of 1</div>
                    <div style="font-weight:700;color:#444;">
                        ${invoiceData.companyNameAr || 'نبضة للدعاية والإعلان والتسويق'}
                        &nbsp;·&nbsp;
                        <span style="direction:ltr;display:inline-block;">${invoiceData.companyNameEn || 'Nabda for Advertising &amp; Marketing'}</span>
                    </div>
                    <div>تم الإنشاء بواسطة المنصة &nbsp;|&nbsp; System Generated</div>
                </div>

            </div>

            <!-- BOTTOM GOLD BAR -->
            <div class="gold-bar"></div>

        </body>
        </html>
        `;

        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-zygote']
        });

        const page = await browser.newPage();
        // Set content and wait for fonts to load
        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
        // Extra wait for Google Fonts
        await page.evaluateHandle('document.fonts.ready');

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
