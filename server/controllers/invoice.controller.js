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
const puppeteer = require('puppeteer');
const downloadInvoicePDF = asyncHandler(async (req, res, next) => {
    let browser = null;
    try {
        const invoiceData = req.body;
        // In reality, you'd fetch the DB record based on req.params.id instead of just taking req.body entirely
        // But for backward compatibility with the frontend state-based save, we merge both or prefer req.body.
        
        let htmlContent = `
        <!DOCTYPE html>
        <html dir="rtl">
        <head>
            <meta charset="UTF-8">
            <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">
            <style>
                * { box-sizing: border-box; }
                body { 
                    font-family: 'Tajawal', 'Cairo', sans-serif; 
                    background: #fff; 
                    color: #1a1a1a; 
                    direction: rtl; 
                    padding: 0;
                    margin: 0;
                }
                @media print {
                    body {
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                        margin: 0 !important;
                    }
                    table {
                        width: 100%;
                        border-collapse: collapse;
                        page-break-after: auto;
                    }
                    tr {
                        page-break-inside: avoid;
                        page-break-after: auto;
                    }
                    td, th {
                        page-break-inside: avoid;
                        padding: 10px;
                        border: 1px solid #ddd;
                        text-align: center;
                    }
                    th {
                        background-color: #f3f4f6 !important;
                        font-weight: bold;
                    }
                    .no-print {
                        display: none !important;
                    }
                    .invoice-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
                    .invoice-totals { width: 40%; margin-right: auto; margin-top: 20px; }
                    .total-row { display: flex; justify-content: space-between; padding: 5px 0; }
                    .grand-total { font-weight: bold; background: #f9fafb !important; padding: 10px; }
                }
            </style>
        </head>
        <body>
            <div class="invoice-header">
                <div>
                    <h1>${invoiceData.isInvoice ? 'فاتورة ضريبية' : 'عرض سعر'}</h1>
                    <p>رقم المستند: ${invoiceData.docNumber || '—'}</p>
                    <p>التاريخ: ${invoiceData.issueDate || '—'}</p>
                </div>
                ${invoiceData.qrImage ? `<img src="${invoiceData.qrImage}" width="90" height="90" style="object-fit:contain"/>` : ''}
            </div>

            <div style="margin-bottom: 30px;">
                <h3>بيانات العميل:</h3>
                <p>الاسم: ${invoiceData.clientName || '—'}</p>
                <p>البريد الإلكتروني: ${invoiceData.clientEmail || '—'}</p>
                <p>الهاتف: ${invoiceData.clientPhone || '—'}</p>
                <p>العنوان: ${invoiceData.clientAddress || '—'}</p>
                <p>الرقم الضريبي: ${invoiceData.taxNumber || '—'}</p>
            </div>

            <table>
                <thead>
                    <tr>
                        <th>م</th>
                        <th>البند</th>
                        <th>الوصف</th>
                        <th>الكمية</th>
                        <th>سعر الوحدة</th>
                        <th>الإجمالي</th>
                    </tr>
                </thead>
                <tbody>
                    ${(invoiceData.lineItems || []).map((item, idx) => `
                    <tr>
                        <td>${idx + 1}</td>
                        <td>${item.name || '—'}</td>
                        <td style="font-size: 12px;">${item.description || ''}</td>
                        <td>${item.quantity || 0}</td>
                        <td>$${(Number(item.unitPrice) || 0).toFixed(2)}</td>
                        <td>$${((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0)).toFixed(2)}</td>
                    </tr>
                    `).join('')}
                </tbody>
            </table>

            <div class="invoice-totals">
                <div class="total-row"><span>المجموع الفرعي:</span> <span>$${(invoiceData.subtotal || 0).toFixed(2)}</span></div>
                <div class="total-row"><span>الخصم:</span> <span>$${(invoiceData.discountAmount || 0).toFixed(2)}</span></div>
                <div class="total-row"><span>الضريبة (${invoiceData.taxPercent || 0}%):</span> <span>$${(invoiceData.taxAmount || 0).toFixed(2)}</span></div>
                <div class="total-row grand-total"><span>الإجمالي:</span> <span>$${(invoiceData.grandTotal || 0).toFixed(2)}</span></div>
            </div>
            
            ${invoiceData.notes || invoiceData.terms ? `
            <div style="margin-top: 30px; font-size: 12px; color: #555; background: #f9fafb; padding: 15px; border-radius: 6px;">
                ${invoiceData.notes ? `<p><strong>ملاحظات:</strong><br/>${invoiceData.notes.replace(/\\n/g, '<br/>')}</p>` : ''}
                ${invoiceData.terms ? `<p style="margin-top: 10px;"><strong>الشروط والأحكام:</strong><br/>${invoiceData.terms.replace(/\\n/g, '<br/>')}</p>` : ''}
            </div>` : ''}
        </body>
        </html>
        `;

        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-zygote']
        });

        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' },
            displayHeaderFooter: false
        });

        await browser.close();

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${invoiceData.docNumber || 'document'}.pdf"`);
        res.setHeader('Content-Length', pdfBuffer.length);
        
        return res.end(pdfBuffer);
    } catch (err) {
        if (browser) await browser.close();
        console.error('[PDF Generator Error]:', err);
        return next(new AppError('Failed to generate PDF. Please try again.', 500));
    }
});

module.exports = { generate, download, getAll, getCatalog, save, downloadInvoicePDF };
