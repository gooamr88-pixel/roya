// ═══════════════════════════════════════════════
// Contact Controller
// ═══════════════════════════════════════════════
const { query } = require('../config/database');
const { AppError } = require('../middlewares/errorHandler');
const emailService = require('../services/email.service');

/**
 * POST /api/contact — Public: save a contact message
 */
const submit = async (req, res, next) => {
    try {
        const { name, email, subject, message } = req.body;

        if (!name || !email || !message) {
            throw new AppError('Name, email, and message are required.', 400, 'VALIDATION_ERROR');
        }

        const result = await query(
            `INSERT INTO contacts (name, email, subject, message)
       VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
            [name.trim(), email.trim(), subject?.trim() || null, message.trim()]
        );

        res.status(201).json({
            success: true,
            data: { contact: result.rows[0] },
            message: 'Message received! We will get back to you soon.',
        });
    } catch (err) { next(err); }
};

/**
 * GET /api/admin/contacts — Admin: list all contact messages
 */
const getAll = async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(50, parseInt(req.query.limit) || 20);
        const offset = (page - 1) * limit;
        const status = req.query.status || '';

        let where = 'WHERE 1=1';
        const params = [limit, offset];
        let countWhere = 'WHERE 1=1';
        const countParams = [];

        if (status) {
            where += ` AND status = $${params.length + 1}`;
            params.push(status);
            countWhere += ` AND status = $${countParams.length + 1}`;
            countParams.push(status);
        }

        const [contacts, countResult] = await Promise.all([
            query(`SELECT * FROM contacts ${where} ORDER BY created_at DESC LIMIT $1 OFFSET $2`, params),
            query(`SELECT COUNT(*) FROM contacts ${countWhere}`, countParams),
        ]);

        const total = parseInt(countResult.rows[0].count);

        res.json({
            success: true,
            data: {
                contacts: contacts.rows,
                pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
            },
        });
    } catch (err) { next(err); }
};

/**
 * POST /api/admin/contacts/:id/reply — Admin: reply to a contact message via email
 */
const reply = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { reply_message } = req.body;

        if (!reply_message || !reply_message.trim()) {
            throw new AppError('Reply message is required.', 400, 'VALIDATION_ERROR');
        }

        // Get original contact
        const contact = await query('SELECT * FROM contacts WHERE id = $1', [id]);
        if (contact.rows.length === 0) {
            throw new AppError('Contact message not found.', 404, 'NOT_FOUND');
        }

        const original = contact.rows[0];

        // Send reply email — fail loudly so admin knows if it bounced
        try {
            await emailService.sendContactReply({
                to: original.email,
                name: original.name,
                originalSubject: original.subject || 'Your Message',
                originalMessage: original.message,
                replyMessage: reply_message.trim(),
            });
        } catch (emailErr) {
            console.error('Contact reply email failed:', emailErr.message);
            await query(`UPDATE contacts SET email_status = 'failed' WHERE id = $1`, [id]).catch(() => { });
            throw new AppError('Failed to send reply email. The message was not delivered.', 502, 'EMAIL_ERROR');
        }

        // Update status only after email succeeds
        await query(
            `UPDATE contacts SET status = 'replied', admin_reply = $1, email_status = 'sent', replied_at = CURRENT_TIMESTAMP WHERE id = $2`,
            [reply_message.trim(), id]
        );

        res.json({
            success: true,
            message: 'Reply sent successfully.',
        });
    } catch (err) {
        next(err);
    }
};

/**
 * PUT /api/contact/admin/:id/note — Admin: save internal note
 */
const updateNote = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { internal_notes } = req.body;

        const result = await query(
            'UPDATE contacts SET internal_notes = $1 WHERE id = $2 RETURNING id',
            [internal_notes || null, id]
        );

        if (result.rows.length === 0) {
            throw new AppError('Contact message not found.', 404, 'NOT_FOUND');
        }

        res.json({ success: true, message: 'Internal note saved.' });
    } catch (err) { next(err); }
};

module.exports = { submit, getAll, reply, updateNote };
