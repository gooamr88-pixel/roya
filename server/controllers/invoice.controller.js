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

                /* ── Header ── */
                .inv-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    flex-direction: row-reverse;
                    margin-bottom: 20px;
                    padding-bottom: 16px;
                    border-bottom: 2px solid #d4af37;
                }
                .inv-brand {
                    display: flex;
                    align-items: center;
                    gap: 14px;
                    flex-direction: row-reverse;
                }
                .inv-brand img {
                    width: 90px;
                    height: 90px;
                    object-fit: contain;
                }
                .inv-brand-text .company-ar {
                    font-size: 18px;
                    font-weight: 800;
                    color: #1a1a1a;
                }
                .inv-brand-text .company-en {
                    font-size: 11px;
                    color: #888;
                    letter-spacing: 0.04em;
                    margin-top: 2px;
                }

                /* ── Doc Type Badge ── */
                .inv-type-badge {
                    text-align: center;
                    padding: 8px 0;
                    margin: 14px 0;
                    border-top: 2px solid #d4af37;
                    border-bottom: 2px solid #d4af37;
                    font-weight: 800;
                    font-size: 14px;
                    letter-spacing: 0.02em;
                }
                .inv-type-en { font-size: 11px; letter-spacing: 0.1em; color: #555; }
                .inv-type-divider { margin: 0 10px; color: #ccc; font-weight: 300; }

                /* ── Meta ── */
                .inv-meta {
                    background: #fafafa;
                    border: 1px solid #e5e5e5;
                    border-radius: 6px;
                    padding: 12px 14px;
                    margin: 12px 0;
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 6px 16px;
                }
                .inv-meta-item { display: flex; gap: 6px; font-size: 12px; }
                .inv-meta-lbl { font-weight: 700; color: #333; white-space: nowrap; }
                .inv-meta-val { color: #555; }

                /* ── Table ── */
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin: 14px 0;
                    font-size: 12px;
                }
                thead th {
                    background: #f0f0f0;
                    color: #1a1a1a;
                    padding: 8px 10px;
                    text-align: center;
                    font-weight: 700;
                    border: 1px solid #ccc;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }
                tbody td {
                    padding: 8px 10px;
                    border: 1px solid #ddd;
                    text-align: center;
                    color: #333;
                }
                tbody tr:nth-child(even) td {
                    background: #fafafa;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }

                /* ── Totals ── */
                .inv-totals {
                    margin-top: 16px;
                    display: flex;
                    justify-content: flex-start;
                }
                .inv-totals-inner { min-width: 260px; }
                .inv-total-row {
                    display: flex;
                    justify-content: space-between;
                    padding: 5px 12px;
                    border-bottom: 1px solid #eee;
                    font-size: 12px;
                }
                .inv-total-row .lbl { color: #555; font-weight: 600; }
                .inv-total-row .val { color: #333; direction: ltr; }
                .inv-total-row.grand {
                    background: #f5f5f5;
                    border: 1px solid #ccc;
                    border-radius: 4px;
                    margin-top: 6px;
                    font-size: 14px;
                    font-weight: 800;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }
                .inv-total-row.grand .lbl,
                .inv-total-row.grand .val { color: #1a1a1a; }

                /* ── Notes ── */
                .inv-notes {
                    margin-top: 14px;
                    padding: 10px 12px;
                    border: 1px solid #eee;
                    border-radius: 4px;
                    background: #fafafa;
                    font-size: 12px;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }
                .inv-notes .lbl { font-weight: 700; font-size: 11px; color: #444; }
                .inv-notes .txt { color: #333; margin-top: 4px; }

                /* ── Footer ── */
                .inv-footer {
                    text-align: center;
                    margin-top: 20px;
                    padding-top: 12px;
                    border-top: 1px solid #ddd;
                    font-size: 11px;
                    color: #999;
                }

                /* ── QR ── */
                .inv-qr-img {
                    width: 90px;
                    height: 90px;
                    object-fit: contain;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                }

                @media print {
                    body {
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    tr { page-break-inside: avoid; }
                }
            </style>
        </head>
        <body>

            <!-- Header -->
            <div class="inv-header">
                <div class="inv-brand">
                    ${logoDataUri
                        ? `<img src="${logoDataUri}" alt="Platform Logo">`
                        : `<div style="width:90px;height:90px;background:#f0f0f0;border-radius:6px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;color:#d4af37;">LOGO</div>`
                    }
                    <div class="inv-brand-text">
                        <div class="company-ar">${invoiceData.companyNameAr || 'نبضة للدعاية والإعلان والتسويق'}</div>
                        <div class="company-en">${invoiceData.companyNameEn || 'Nabda for Advertising, Publicity &amp; Marketing'}</div>
                    </div>
                </div>
                ${invoiceData.qrImage
                    ? `<img class="inv-qr-img" src="${invoiceData.qrImage}" alt="QR"/>`
                    : ''
                }
            </div>

            <!-- Document Type -->
            <div class="inv-type-badge">
                <span>${docTypeAr}</span>
                <span class="inv-type-divider">|</span>
                <span class="inv-type-en">${docTypeEn}</span>
            </div>

            <!-- Meta -->
            <div class="inv-meta">
                <div class="inv-meta-item"><span class="inv-meta-lbl">رقم المستند:</span><span class="inv-meta-val">${invoiceData.docNumber || '—'}</span></div>
                <div class="inv-meta-item"><span class="inv-meta-lbl">التاريخ:</span><span class="inv-meta-val">${invoiceData.issueDate || '—'}</span></div>
                <div class="inv-meta-item"><span class="inv-meta-lbl">اسم العميل:</span><span class="inv-meta-val">${invoiceData.clientName || '—'}</span></div>
                <div class="inv-meta-item"><span class="inv-meta-lbl">تاريخ الاستحقاق:</span><span class="inv-meta-val">${invoiceData.dueDate || '—'}</span></div>
                <div class="inv-meta-item"><span class="inv-meta-lbl">الهاتف:</span><span class="inv-meta-val">${invoiceData.clientPhone || '—'}</span></div>
                <div class="inv-meta-item"><span class="inv-meta-lbl">البريد:</span><span class="inv-meta-val">${invoiceData.clientEmail || '—'}</span></div>
                <div class="inv-meta-item"><span class="inv-meta-lbl">العنوان:</span><span class="inv-meta-val">${invoiceData.clientAddress || '—'}</span></div>
                <div class="inv-meta-item"><span class="inv-meta-lbl">الرقم الضريبي:</span><span class="inv-meta-val">${invoiceData.taxNumber || '—'}</span></div>
            </div>

            <!-- Line Items Table -->
            <table>
                <thead>
                    <tr>
                        <th style="width:35px">م</th>
                        <th>الصنف</th>
                        <th>الوصف</th>
                        <th style="width:55px">الكمية</th>
                        <th style="width:80px">السعر</th>
                        <th style="width:90px">المبلغ</th>
                    </tr>
                </thead>
                <tbody>
                    ${lineItemsHTML || '<tr><td colspan="6" style="text-align:center;color:#999;padding:20px">لا توجد بنود</td></tr>'}
                </tbody>
            </table>

            <!-- Totals -->
            <div class="inv-totals">
                <div class="inv-totals-inner">
                    <div class="inv-total-row"><span class="lbl">الاجمالي الفرعي <small>Subtotal</small></span><span class="val">${fmt(invoiceData.subtotal)}</span></div>
                    <div class="inv-total-row"><span class="lbl">الخصم <small>Discount</small></span><span class="val">${fmt(invoiceData.discountAmount)}</span></div>
                    <div class="inv-total-row"><span class="lbl">القيمة المضافة ${invoiceData.taxPercent || 0}% <small>VAT</small></span><span class="val">${fmt(invoiceData.taxAmount)}</span></div>
                    <div class="inv-total-row grand"><span class="lbl">الإجمالي المستحق <small>Total Due</small></span><span class="val">${fmt(invoiceData.grandTotal)}</span></div>
                </div>
            </div>

            <!-- Notes / Terms -->
            ${invoiceData.notes ? `
            <div class="inv-notes">
                <div class="lbl">ملاحظات <small>Notes</small></div>
                <div class="txt">${invoiceData.notes.replace(/\n/g, '<br/>')}</div>
            </div>` : ''}
            ${invoiceData.terms ? `
            <div class="inv-notes">
                <div class="lbl">الشروط والأحكام <small>Terms</small></div>
                <div class="txt">${invoiceData.terms.replace(/\n/g, '<br/>')}</div>
            </div>` : ''}

            <!-- Footer -->
            <div class="inv-footer">
                <div>${invoiceData.companyNameAr || 'نبضة للدعاية والإعلان والتسويق'} — ${invoiceData.companyNameEn || 'Nabda for Advertising, Publicity &amp; Marketing'}</div>
                <div style="margin-top:4px;">الصفحة 1 من 1 | Page 1 of 1</div>
            </div>

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
