// ═══════════════════════════════════════════════
// Contact Repository
// ═══════════════════════════════════════════════
const { query } = require('../config/database');

const create = async ({ name, email, subject, message }) => {
    const result = await query(
        `INSERT INTO contacts (name, email, subject, message)
         VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
        [name.trim(), email.trim(), subject?.trim() || null, message.trim()]
    );
    return result.rows[0];
};

const findAll = async ({ page, limit, status }) => {
    const offset = (page - 1) * limit;
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

    const total = parseInt(countResult.rows[0].count, 10);
    return {
        rows: contacts.rows,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
};

const findById = async (id) => {
    const result = await query('SELECT * FROM contacts WHERE id = $1', [id]);
    return result.rows[0] || null;
};

const markReplied = async (id, replyMessage) => {
    await query(
        `UPDATE contacts SET status = 'replied', admin_reply = $1, email_status = 'sent', replied_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [replyMessage.trim(), id]
    );
};

const markEmailFailed = async (id) => {
    await query(`UPDATE contacts SET email_status = 'failed' WHERE id = $1`, [id]).catch(() => {});
};

const updateNote = async (id, internalNotes) => {
    const result = await query(
        'UPDATE contacts SET internal_notes = $1 WHERE id = $2 RETURNING id',
        [internalNotes || null, id]
    );
    return result.rows[0] || null;
};

const deleteById = async (id) => {
    const result = await query('DELETE FROM contacts WHERE id = $1 RETURNING id', [id]);
    return result.rows[0] || null;
};

module.exports = { create, findAll, findById, markReplied, markEmailFailed, updateNote, deleteById };
