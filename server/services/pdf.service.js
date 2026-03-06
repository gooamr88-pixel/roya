// ═══════════════════════════════════════════════
// PDF Service — Invoice Generation (PDFKit Streams)
// ═══════════════════════════════════════════════
const PDFDocument = require('pdfkit');

/**
 * Generate an invoice PDF as a Buffer
 * @param {Object} data - Invoice data
 * @returns {Promise<Buffer>}
 */
const generateInvoicePDF = (data) => {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({
                size: 'A4',
                margin: 50,
                bufferPages: true,
            });

            const chunks = [];
            doc.on('data', (chunk) => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            // ── Header ──
            doc
                .fontSize(28)
                .fillColor('#6c63ff')
                .text('INVOICE', { align: 'right' })
                .moveDown(0.5);

            doc
                .fontSize(10)
                .fillColor('#666')
                .text('ROYA Platform', { align: 'right' })
                .text('Professional Business Solutions', { align: 'right' })
                .moveDown(1);

            // ── Invoice Details ──
            doc
                .fontSize(10)
                .fillColor('#333')
                .text(`Invoice Number: ${data.invoiceNumber}`, 50)
                .text(`Date: ${new Date(data.createdAt || Date.now()).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`)
                .text(`Status: ${(data.status || 'Generated').toUpperCase()}`)
                .moveDown(1);

            // ── Divider ──
            doc
                .moveTo(50, doc.y)
                .lineTo(545, doc.y)
                .strokeColor('#6c63ff')
                .lineWidth(2)
                .stroke()
                .moveDown(1);

            // ── Client Info ──
            doc
                .fontSize(12)
                .fillColor('#6c63ff')
                .text('Bill To:', 50)
                .fontSize(10)
                .fillColor('#333')
                .text(data.clientName || 'Client')
                .text(data.clientEmail || '')
                .text(data.clientPhone || '')
                .moveDown(1.5);

            // ── Table Header ──
            const tableTop = doc.y;
            const colX = { desc: 50, qty: 300, price: 380, total: 470 };

            doc
                .fontSize(10)
                .fillColor('#fff');

            // Header background
            doc
                .rect(50, tableTop - 5, 495, 25)
                .fill('#6c63ff');

            doc
                .fillColor('#fff')
                .text('Description', colX.desc, tableTop, { width: 240 })
                .text('Qty', colX.qty, tableTop, { width: 70, align: 'center' })
                .text('Price', colX.price, tableTop, { width: 80, align: 'right' })
                .text('Total', colX.total, tableTop, { width: 75, align: 'right' });

            // ── Table Row ──
            const rowY = tableTop + 30;
            doc
                .fillColor('#333')
                .text(data.serviceTitle || 'Service', colX.desc, rowY, { width: 240 })
                .text('1', colX.qty, rowY, { width: 70, align: 'center' })
                .text(`$${parseFloat(data.price || 0).toFixed(2)}`, colX.price, rowY, { width: 80, align: 'right' })
                .text(`$${parseFloat(data.price || 0).toFixed(2)}`, colX.total, rowY, { width: 75, align: 'right' });

            // ── Row divider ──
            doc
                .moveTo(50, rowY + 20)
                .lineTo(545, rowY + 20)
                .strokeColor('#eee')
                .lineWidth(1)
                .stroke();

            // ── Totals ──
            const totalsY = rowY + 40;
            const subtotal = parseFloat(data.price || 0);
            const tax = parseFloat(data.taxAmount || subtotal * 0.15);
            const total = subtotal + tax;

            doc
                .fontSize(10)
                .fillColor('#666')
                .text('Subtotal:', 380, totalsY, { width: 80, align: 'right' })
                .fillColor('#333')
                .text(`$${subtotal.toFixed(2)}`, 470, totalsY, { width: 75, align: 'right' });

            doc
                .fillColor('#666')
                .text('Tax (15%):', 380, totalsY + 20, { width: 80, align: 'right' })
                .fillColor('#333')
                .text(`$${tax.toFixed(2)}`, 470, totalsY + 20, { width: 75, align: 'right' });

            // Total line
            doc
                .moveTo(380, totalsY + 42)
                .lineTo(545, totalsY + 42)
                .strokeColor('#6c63ff')
                .lineWidth(2)
                .stroke();

            doc
                .fontSize(14)
                .fillColor('#6c63ff')
                .text('Total:', 380, totalsY + 50, { width: 80, align: 'right' })
                .text(`$${total.toFixed(2)}`, 470, totalsY + 50, { width: 75, align: 'right' });

            // ── Footer ──
            doc
                .fontSize(9)
                .fillColor('#999')
                .text(
                    'Thank you for your business! Payment is due within 30 days.',
                    50,
                    doc.page.height - 80,
                    { align: 'center', width: 495 }
                )
                
            .text(
                    'ROYA Platform — Professional Business Solutions',
                    50,
                    doc.page.height - 60,
                    { align: 'center', width: 495 }
                );

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
};

module.exports = { generateInvoicePDF };
