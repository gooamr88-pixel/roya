// Invoice Controller — Thin HTTP layer
// ═══════════════════════════════════════════════
const { AppError } = require('../middlewares/errorHandler');
const { asyncHandler } = require('../utils/helpers');
const pdfService = require('../services/pdf.service');
const emailService = require('../services/email.service');
const invoiceRepo = require('../repositories/invoice.repository');
const { query } = require('../config/database');
const fs = require('fs');
const path = require('path');

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


// ── Puppeteer Server-Side PDF Rendering HTML Generator ──
const generateInvoiceHTML = (invoiceData) => {
    let logo1Uri = '';
    let logo2Uri = '';
    try {
        const logo1Path = path.join(__dirname, '../../client/images/nabda-logo-dark.svg');
        if (fs.existsSync(logo1Path)) {
            logo1Uri = `data:image/svg+xml;base64,${fs.readFileSync(logo1Path).toString('base64')}`;
        }
    } catch (e) { console.warn('Could not read nabda-logo-dark.svg:', e.message); }
    
    try {
        const logo2Path = path.join(__dirname, '../../client/images/nabda-text-ar.svg');
        if (fs.existsSync(logo2Path)) {
            logo2Uri = `data:image/svg+xml;base64,${fs.readFileSync(logo2Path).toString('base64')}`;
        }
    } catch (e) { console.warn('Could not read nabda-text-ar.svg:', e.message); }

    const isInvoice = invoiceData.isInvoice !== false;
    const docTypeAr = isInvoice ? 'فاتورة ضريبية' : 'عرض سعر';
    const docTypeEn = isInvoice ? 'TAX INVOICE' : 'QUOTATION';
    const currency = invoiceData.currency || 'SAR';

    const fmt = (n) => `${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

    const discLabel = invoiceData.discountType === 'percent'
        ? `الخصم (${invoiceData.discountValue || 0}%) <small>Discount</small>`
        : `الخصم <small>Discount</small>`;

    const baseUrl = process.env.BASE_URL || 'https://roya-advertising.com';
    const qrText = `${baseUrl}/invoice/${invoiceData._id || invoiceData.id || invoiceData.docNumber}`;

    return `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
        <meta charset="UTF-8">
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap');
            
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body {
                font-family: 'Cairo', sans-serif !important;
                background: #fff;
                color: #1a1a1a;
                direction: rtl;
                text-align: right;
                font-size: 14px;
                line-height: 1.7;
                padding: 0;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            .page {
                padding: 28px 24px;
                display: flex;
                flex-direction: column;
                gap: 14px;
            }

            /* ── Header ── */
            .header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding-bottom: 10px;
            }
            .header-logos {
                display: flex;
                align-items: center;
                gap: 15px; /* Matches navbar */
                flex-shrink: 0;
            }
            .header-logos .logo-1 { height: 42px; object-fit: contain; }
            .header-logos .logo-2 { height: 50px; object-fit: contain; }
            .header-info {
                text-align: left; /* Align opposite to RTL -> left */
            }
            .company-ar {
                font-size: 16px;
                font-weight: 800;
                color: #1a1a1a;
                line-height: 1.6;
                letter-spacing: 0.02em;
            }
            .company-en {
                font-size: 9px;
                color: #999;
                letter-spacing: 0.06em;
                margin-top: 3px;
                font-weight: 600;
            }

            /* ── Type Badge ── */
            .type-badge {
                text-align: center;
                padding: 7px 0;
                border-top: 2.5px solid #d4af37;
                border-bottom: 2.5px solid #d4af37;
                font-size: 14px;
                font-weight: 800;
                color: #1a1a1a;
                letter-spacing: 0.04em;
            }
            .type-badge .divider { margin: 0 12px; color: #ccc; font-weight: 300; }
            .type-badge .en { font-size: 11px; letter-spacing: 0.1em; font-weight: 700; }

            /* ── Meta Box ── */
            .meta-box {
                background: #fafafa;
                border: 1px solid #eee;
                border-radius: 6px;
                padding: 12px 14px;
            }
            .meta-row {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 6px 16px;
                margin-bottom: 4px;
            }
            .meta-row:last-child { margin-bottom: 0; }
            .meta-item { display: flex; gap: 6px; align-items: baseline; }
            .meta-lbl {
                font-weight: 700;
                color: #333;
                white-space: nowrap;
                font-size: 12px;
            }
            .meta-val {
                color: #555;
                font-size: 12px;
                font-weight: 600;
            }

            /* ── Table ── */
            .items-table {
                width: 100%;
                border-collapse: collapse;
                border: 1px solid #bbb;
                font-size: 12px;
            }
            .items-table thead th {
                background: #f0f0f0;
                color: #1a1a1a;
                padding: 8px 10px;
                text-align: center;
                font-size: 12px;
                font-weight: 800;
                border: 1px solid #bbb;
                white-space: nowrap;
                line-height: 1.4;
            }
            .items-table thead th small {
                display: block;
                font-weight: 600;
                font-size: 10px;
                color: #777;
                margin-top: 2px;
            }
            .items-table tbody td {
                padding: 8px 10px;
                border: 1px solid #ccc;
                text-align: center;
                color: #333;
                font-size: 13px;
                font-weight: 600;
                line-height: 1.5;
            }
            .items-table tbody tr:nth-child(even) { background: #fafafa; }
            .col-num  { width: 35px; }
            .col-qty  { width: 55px; }
            .col-price { width: 85px; }
            .col-total { width: 95px; }
            
            /* Keep LTR formatting for prices inside table */
            .ltr-td { direction: ltr; unicode-bidi: isolate; }

            /* ── Bottom Section ── */
            .bottom {
                display: grid;
                grid-template-columns: auto 1fr;
                gap: 20px;
                align-items: start;
                padding-top: 14px;
                border-top: 1px solid #ddd;
            }
            .qr-box {
                order: 2; /* Put QR on the left for RTL */
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 8px;
            }
            .qr-box canvas {
                width: 130px; height: 130px;
                border: 1px solid #ddd;
                border-radius: 6px;
            }
            .qr-hint { font-size: 10px; color: #999; font-weight: 600; text-align: center; }
            
            /* RTL/LTR Totals Overhaul */
            .summary { order: 1; display: flex; flex-direction: column; gap: 5px; }
            .sum-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 6px 14px;
                border-bottom: 1px solid #eee;
                font-size: 13px;
            }
            .sum-lbl { 
                font-weight: 700; color: #333; 
                display: flex; align-items: baseline; gap: 6px; 
            }
            .sum-lbl small { font-size: 10px; color: #999; }
            
            /* Safe LTR value cell */
            .sum-val { 
                direction: ltr !important; 
                unicode-bidi: isolate;
                text-align: left;
                font-weight: 800; 
                color: #1a1a1a; 
                min-width: 120px;
            }

            .sum-row.total {
                background: #f5f5f5; border: 1px solid #ccc;
                border-radius: 4px; font-size: 15px; margin-top: 5px;
            }
            .sum-row.total .sum-val { font-size: 15px; color: #000; }
            
            .sum-row.paid { background: #f0fdf4; border-radius: 3px; }
            .sum-row.paid .sum-val { color: #166534; }
            
            .sum-row.remaining { background: #fef2f2; border-radius: 3px; margin-top: 3px; }
            .sum-row.remaining .sum-val { color: #b91c1c; }

            /* ── Notes ── */
            .notes-box {
                background: #fafafa;
                border: 1px solid #eee;
                border-radius: 4px;
                padding: 8px 10px;
                font-size: 12px;
                line-height: 1.6;
            }
            .notes-title { font-weight: 800; font-size: 12px; color: #555; margin-bottom: 4px; }
            .notes-title small { color: #aaa; font-weight: 600; margin-right: 4px; }
            .notes-text { color: #333; font-weight: 600; }

            /* ── Footer ── */
            .footer {
                text-align: center;
                padding-top: 12px;
                border-top: 1px solid #ddd;
                display: flex;
                flex-direction: column;
                gap: 4px;
            }
            .footer-page { font-size: 10px; color: #bbb; font-weight: 600; }
            .footer-branch { font-size: 12px; color: #555; font-weight: 700; }

            @media print {
                body { font-family: 'Cairo', sans-serif !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                tr { page-break-inside: avoid; }
            }
        </style>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js"></script>
    </head>
    <body>
        <div class="page">
            <!-- ── Header: Logos + Company ── -->
            <div class="header">
                <div class="header-logos">
                    ${logo1Uri ? `<img src="${logo1Uri}" class="logo-1" alt="Logo">` : ''}
                    ${logo2Uri ? `<img src="${logo2Uri}" class="logo-2" alt="Brand">` : ''}
                </div>
                <div class="header-info">
                    <div class="company-ar">${invoiceData.companyNameAr || 'نبضة للدعاية والإعلان والتسويق'}</div>
                    <div class="company-en">${invoiceData.companyNameEn || 'Nabda for Advertising, Publicity &amp; Marketing'}</div>
                </div>
            </div>

            <!-- ── Type Badge ── -->
            <div class="type-badge">
                <span>${docTypeAr}</span>
                <span class="divider">|</span>
                <span class="en">${docTypeEn}</span>
            </div>

            <!-- ── Meta ── -->
            <div class="meta-box">
                <div class="meta-row">
                    <div class="meta-item"><span class="meta-lbl">التاريخ:</span><span class="meta-val">${invoiceData.issueDate || '—'}</span></div>
                    <div class="meta-item"><span class="meta-lbl">رقم الفاتورة:</span><span class="meta-val" dir="ltr">${invoiceData.docNumber || '—'}</span></div>
                </div>
                <div class="meta-row">
                    <div class="meta-item"><span class="meta-lbl">اسم العميل:</span><span class="meta-val">${invoiceData.clientName || '—'}</span></div>
                    <div class="meta-item"><span class="meta-lbl">الهاتف:</span><span class="meta-val" dir="ltr">${invoiceData.clientPhone || '—'}</span></div>
                </div>
                <div class="meta-row">
                    <div class="meta-item"><span class="meta-lbl">العنوان:</span><span class="meta-val">${invoiceData.clientAddress || '—'}</span></div>
                    <div class="meta-item"><span class="meta-lbl">البريد:</span><span class="meta-val" dir="ltr">${invoiceData.clientEmail || '—'}</span></div>
                </div>
                <div class="meta-row">
                    <div class="meta-item"><span class="meta-lbl">الرقم الضريبي:</span><span class="meta-val" dir="ltr">${invoiceData.taxNumber || '—'}</span></div>
                    <div class="meta-item"><span class="meta-lbl">تاريخ الاستحقاق:</span><span class="meta-val">${invoiceData.dueDate || '—'}</span></div>
                </div>
            </div>

            <!-- ── Items Table ── -->
            <table class="items-table">
                <thead>
                    <tr>
                        <th class="col-num">م<br><small>No</small></th>
                        <th>الصنف<br><small>Item</small></th>
                        <th>الوصف<br><small>Description</small></th>
                        <th class="col-qty">الكمية<br><small>Qty</small></th>
                        <th class="col-price">السعر<br><small>Price</small></th>
                        <th class="col-total">المبلغ<br><small>Amount</small></th>
                    </tr>
                </thead>
                <tbody>
                    ${(invoiceData.lineItems || []).filter(i => i.name).map((item, idx) => `
                        <tr>
                            <td>${idx + 1}</td>
                            <td style="text-align:right">${item.name || '—'}</td>
                            <td style="text-align:right;font-size:11px;color:#666">${item.description || ''}</td>
                            <td>${item.quantity || 0}</td>
                            <td class="ltr-td">${fmt(item.unitPrice)}</td>
                            <td class="ltr-td">${fmt((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0))}</td>
                        </tr>
                    `).join('') || '<tr><td colspan="6" style="text-align:center;color:#999;padding:20px;">لا توجد بنود</td></tr>'}
                </tbody>
            </table>

            <!-- ── Bottom: QR + Summary ── -->
            <div class="bottom">
                <div class="qr-box">
                    <canvas id="qr" width="300" height="300"></canvas>
                    <div class="qr-hint">امسح لفتح الفاتورة<br>Scan to View</div>
                </div>
                <div class="summary">
                    <div class="sum-row">
                        <div class="sum-lbl">الاجمالي <small>Subtotal</small></div>
                        <div class="sum-val">${fmt(invoiceData.subtotal)}</div>
                    </div>
                    <div class="sum-row">
                        <div class="sum-lbl">${discLabel}</div>
                        <div class="sum-val">${fmt(invoiceData.discountAmount)}</div>
                    </div>
                    <div class="sum-row">
                        <div class="sum-lbl">القيمة المضافة ${invoiceData.taxPercent || 0}% <small>VAT</small></div>
                        <div class="sum-val">${fmt(invoiceData.taxAmount)}</div>
                    </div>
                    <div class="sum-row">
                        <div class="sum-lbl">الشحن <small>Shipping</small></div>
                        <div class="sum-val">${fmt(invoiceData.shippingCost || 0)}</div>
                    </div>
                    <div class="sum-row total">
                        <div class="sum-lbl">المستحق <small>Total Due</small></div>
                        <div class="sum-val">${fmt(invoiceData.grandTotal)}</div>
                    </div>
                    <div class="sum-row paid">
                        <div class="sum-lbl">المدفوع <small>Paid</small></div>
                        <div class="sum-val">${fmt(invoiceData.amountPaid || 0)}</div>
                    </div>
                    <div class="sum-row remaining">
                        <div class="sum-lbl">المتبقي <small>Remaining</small></div>
                        <div class="sum-val">${fmt(Math.max(0, (Number(invoiceData.grandTotal)||0) - (Number(invoiceData.amountPaid)||0)))}</div>
                    </div>
                </div>
            </div>

            <!-- ── Notes ── -->
            ${invoiceData.notes ? `<div class="notes-box"><div class="notes-title">ملاحظات <small>Notes</small></div><div class="notes-text">${invoiceData.notes.replace(/\\n/g, '<br/>')}</div></div>` : ''}
            ${invoiceData.terms ? `<div class="notes-box"><div class="notes-title">الشروط <small>Terms</small></div><div class="notes-text">${invoiceData.terms.replace(/\\n/g, '<br/>')}</div></div>` : ''}

            <!-- ── Footer ── -->
            <div class="footer">
                <div class="footer-page">الصفحة 1 من 1 | Page 1 of 1</div>
                <div class="footer-branch">${invoiceData.branchInfo || 'الفرع الرئيسي'}</div>
            </div>
        </div>

        <!-- QR Code Generation -->
        <script>
        (function() {
            try {
                var c = document.getElementById('qr');
                if (!c || typeof qrcode === 'undefined') return;
                var ctx = c.getContext('2d');
                ctx.fillStyle = '#fff';
                ctx.fillRect(0, 0, 300, 300);
                var q = qrcode(0, 'Q');
                q.addData('${qrText.replace(/'/g, "\\\\'")}');
                q.make();
                var mc = q.getModuleCount();
                var cs = 300 / (mc + 4);
                var off = (300 - mc * cs) / 2;
                ctx.fillStyle = '#000';
                for (var r = 0; r < mc; r++)
                    for (var co = 0; co < mc; co++)
                        if (q.isDark(r, co))
                            ctx.fillRect(off + co * cs, off + r * cs, cs + 0.5, cs + 0.5);
            } catch(e) { console.warn('QR error:', e); }
        })();
        </script>
    </body>
    </html>
    `;
};

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
        let invoiceData;
        try {
            const raw = req.query.d;
            if (!raw) throw new Error('Missing invoice data');
            const decoded = Buffer.from(raw, 'base64').toString('utf8');
            invoiceData = JSON.parse(decoded);
        } catch (e) {
            return next(new AppError('Invalid or missing invoice payload. Please regenerate.', 400));
        }

        const htmlContent = generateInvoiceHTML(invoiceData);

        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-zygote']
        });

        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'networkidle0', timeout: 30000 });
        await page.evaluateHandle('document.fonts.ready');
        await new Promise(r => setTimeout(r, 800));

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

const viewInvoicePublic = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const db = require('../config/database');
    const result = await db.query(
        'SELECT payload_json FROM invoices WHERE invoice_number = $1 OR id::text = $1',
        [id]
    );

    if (result.rows.length === 0) {
        return res.status(404).send('<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"/><title>Not Found</title></head><body style="text-align:center;padding:50px;font-family:Arial;"><h1>Invoice Not Found</h1></body></html>');
    }

    const initData = result.rows[0].payload_json;
    const invoiceData = { ...initData, _id: id, docNumber: initData.docNumber || id };
    
    const htmlContent = generateInvoiceHTML(invoiceData);
    
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(htmlContent);
});

module.exports = { generate, download, getAll, getCatalog, save, downloadInvoicePDF, viewInvoicePublic };
