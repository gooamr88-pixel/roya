// ═══════════════════════════════════════════════
// Invoice Controller
// ═══════════════════════════════════════════════
const { query } = require('../config/database');
const { AppError } = require('../middlewares/errorHandler');
const pdfService = require('../services/pdf.service');
const emailService = require('../services/email.service');

/**
 * POST /api/invoices/:orderId/generate
 */
const generate = async (req, res, next) => {
    try {
        // Get order with client info
        const orderResult = await query(
            `SELECT o.*, u.name as client_name, u.email as client_email, u.phone as client_phone
       FROM orders o LEFT JOIN users u ON o.user_id = u.id WHERE o.id = $1`,
            [req.params.orderId]
        );
        if (orderResult.rows.length === 0) throw new AppError('Order not found.', 404);

        const order = orderResult.rows[0];
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

        // Check if invoice already exists
        const existing = await query('SELECT id FROM invoices WHERE order_id = $1', [order.id]);
        let invoice;

        if (existing.rows.length > 0) {
            const result = await query(
                `UPDATE invoices SET total_amount = $1, tax_amount = $2, pdf_data = $3, status = 'generated'
         WHERE order_id = $4 RETURNING *`,
                [total, tax, pdfBuffer, order.id]
            );
            invoice = result.rows[0];
        } else {
            const result = await query(
                `INSERT INTO invoices (order_id, invoice_number, total_amount, tax_amount, pdf_data, status)
         VALUES ($1, $2, $3, $4, $5, 'generated') RETURNING *`,
                [order.id, invoiceNumber, total, tax, pdfBuffer]
            );
            invoice = result.rows[0];
        }

        // Send via email (non-blocking) — corrected arg order: (to, name, invoiceNumber, pdfBuffer)
        emailService.sendInvoice(order.client_email, order.client_name, invoiceNumber, pdfBuffer).catch(() => { });

        // Don't send pdf_data in response
        const { pdf_data, ...invoiceData } = invoice;
        res.status(201).json({ success: true, data: { invoice: invoiceData } });
    } catch (err) { next(err); }
};

/**
 * GET /api/invoices/:id/download
 */
const download = async (req, res, next) => {
    try {
        const result = await query(
            `SELECT i.*, o.user_id FROM invoices i
       LEFT JOIN orders o ON i.order_id = o.id
       WHERE i.id = $1`,
            [req.params.id]
        );
        if (result.rows.length === 0) throw new AppError('Invoice not found.', 404);

        const invoice = result.rows[0];
        const isAdmin = ['super_admin', 'admin'].includes(req.user.role);
        if (!isAdmin && invoice.user_id !== req.user.id) {
            throw new AppError('Access denied.', 403);
        }

        if (!invoice.pdf_data) {
            throw new AppError('PDF not available. Please regenerate the invoice.', 404);
        }

        // Explicitly convert to Buffer and set Content-Length to avoid encoding issues
        const pdfBuffer = Buffer.isBuffer(invoice.pdf_data)
            ? invoice.pdf_data
            : Buffer.from(invoice.pdf_data);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="invoice-${invoice.invoice_number}.pdf"`);
        res.setHeader('Content-Length', pdfBuffer.length);
        res.end(pdfBuffer);
    } catch (err) { next(err); }
};

/**
 * GET /api/invoices — List invoices
 */
const getAll = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const isAdmin = ['super_admin', 'admin'].includes(req.user.role);

        // Use separate, correctly indexed params for each query
        const listParams = isAdmin ? [limit, offset] : [limit, offset, req.user.id];
        const countParams = isAdmin ? [] : [req.user.id];
        const listWhere = isAdmin ? '' : 'WHERE o.user_id = $3';
        const countWhere = isAdmin ? '' : 'WHERE o.user_id = $1';

        const [invoices, countResult] = await Promise.all([
            query(
                `SELECT i.id, i.invoice_number, i.total_amount, i.tax_amount, i.status, i.created_at,
                o.service_title, u.name as client_name
         FROM invoices i
         LEFT JOIN orders o ON i.order_id = o.id
         LEFT JOIN users u ON o.user_id = u.id
         ${listWhere}
         ORDER BY i.created_at DESC LIMIT $1 OFFSET $2`,
                listParams
            ),
            query(`SELECT COUNT(*) FROM invoices i LEFT JOIN orders o ON i.order_id = o.id ${countWhere}`, countParams),
        ]);

        res.json({
            success: true,
            data: {
                invoices: invoices.rows,
                pagination: { page, limit, total: parseInt(countResult.rows[0].count), totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit) },
            },
        });
    } catch (err) { next(err); }
};

module.exports = { generate, download, getAll };
