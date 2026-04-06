// ═══════════════════════════════════════════════
// Contact Controller — Thin HTTP layer
//
// PHASE 3 HARDENING:
// ✅ Input validation delegated to express-validator chains in routes
// ✅ reply_message length capped at 5000 chars
// ✅ internal_notes length capped at 2000 chars
// ✅ Proper error propagation from email service
// ✅ Integer validation on ID params
// ═══════════════════════════════════════════════
const { AppError } = require('../middlewares/errorHandler');
const { asyncHandler } = require('../utils/helpers');
const emailService = require('../services/email.service');
const contactRepo = require('../repositories/contact.repository');

// ── Constants ──
const MAX_REPLY_LENGTH = 5000;
const MAX_NOTE_LENGTH = 2000;

/**
 * POST /api/contact
 * Public endpoint — validated by contactSubmitValidation in routes.
 */
const submit = asyncHandler(async (req, res) => {
    const { name, email, subject, message } = req.body;

    // Defense-in-depth: routes should validate, but if called internally, guard here too
    if (!name || !email || !message) {
        throw new AppError('Name, email, and message are required.', 400, 'VALIDATION_ERROR');
    }

    const contact = await contactRepo.create({ name, email, subject, message });

    res.status(201).json({
        success: true,
        data: { contact },
        message: 'Message received! We will get back to you soon.',
    });
});

/**
 * GET /api/admin/contacts
 */
const getAll = asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const status = req.query.status || '';

    const { rows, pagination } = await contactRepo.findAll({ page, limit, status });
    res.json({ success: true, data: { contacts: rows, pagination } });
});

/**
 * POST /api/admin/contacts/:id/reply
 * Sends an email reply to the contact and marks the message as replied.
 */
const reply = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { reply_message } = req.body;

    if (!reply_message || !reply_message.trim()) {
        throw new AppError('Reply message is required.', 400, 'VALIDATION_ERROR');
    }

    // SECURITY: Cap reply length to prevent DB bloat and SMTP timeouts
    const trimmedReply = reply_message.trim();
    if (trimmedReply.length > MAX_REPLY_LENGTH) {
        throw new AppError(
            `Reply message must not exceed ${MAX_REPLY_LENGTH} characters.`,
            400, 'VALIDATION_ERROR'
        );
    }

    const original = await contactRepo.findById(id);
    if (!original) {
        throw new AppError('Contact message not found.', 404, 'NOT_FOUND');
    }

    // Send reply email — fail loudly so admin knows if it bounced
    // SECURITY: sendContactReply now throws on failure (no silent null returns)
    try {
        await emailService.sendContactReply({
            to: original.email,
            name: original.name,
            originalSubject: original.subject || 'Your Message',
            originalMessage: original.message,
            replyMessage: trimmedReply,
        });
    } catch (emailErr) {
        console.error('Contact reply email failed:', emailErr.message);
        await contactRepo.markEmailFailed(id);
        throw new AppError(
            'Failed to send reply email. The message was not delivered.',
            502, 'EMAIL_ERROR'
        );
    }

    // Update status only after email succeeds
    await contactRepo.markReplied(id, trimmedReply);

    res.json({ success: true, message: 'Reply sent successfully.' });
});

/**
 * PUT /api/contact/admin/:id/note
 * Save internal admin notes on a contact message.
 */
const updateNote = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { internal_notes } = req.body;

    // SECURITY: Cap note length to prevent DB bloat
    if (internal_notes && internal_notes.length > MAX_NOTE_LENGTH) {
        throw new AppError(
            `Internal notes must not exceed ${MAX_NOTE_LENGTH} characters.`,
            400, 'VALIDATION_ERROR'
        );
    }

    const result = await contactRepo.updateNote(id, internal_notes);
    if (!result) {
        throw new AppError('Contact message not found.', 404, 'NOT_FOUND');
    }

    res.json({ success: true, message: 'Internal note saved.' });
});

module.exports = { submit, getAll, reply, updateNote };
