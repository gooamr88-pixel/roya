// ═══════════════════════════════════════════════
// Contact Controller — Thin HTTP layer
// ═══════════════════════════════════════════════
const { AppError } = require('../middlewares/errorHandler');
const { asyncHandler } = require('../utils/helpers');
const emailService = require('../services/email.service');
const contactRepo = require('../repositories/contact.repository');

/**
 * POST /api/contact
 */
const submit = asyncHandler(async (req, res) => {
    const { name, email, subject, message } = req.body;

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
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const status = req.query.status || '';

    const { rows, pagination } = await contactRepo.findAll({ page, limit, status });
    res.json({ success: true, data: { contacts: rows, pagination } });
});

/**
 * POST /api/admin/contacts/:id/reply
 */
const reply = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { reply_message } = req.body;

    if (!reply_message || !reply_message.trim()) {
        throw new AppError('Reply message is required.', 400, 'VALIDATION_ERROR');
    }

    const original = await contactRepo.findById(id);
    if (!original) {
        throw new AppError('Contact message not found.', 404, 'NOT_FOUND');
    }

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
        await contactRepo.markEmailFailed(id);
        throw new AppError('Failed to send reply email. The message was not delivered.', 502, 'EMAIL_ERROR');
    }

    // Update status only after email succeeds
    await contactRepo.markReplied(id, reply_message);

    res.json({ success: true, message: 'Reply sent successfully.' });
});

/**
 * PUT /api/contact/admin/:id/note
 */
const updateNote = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { internal_notes } = req.body;

    const result = await contactRepo.updateNote(id, internal_notes);
    if (!result) {
        throw new AppError('Contact message not found.', 404, 'NOT_FOUND');
    }

    res.json({ success: true, message: 'Internal note saved.' });
});

module.exports = { submit, getAll, reply, updateNote };
