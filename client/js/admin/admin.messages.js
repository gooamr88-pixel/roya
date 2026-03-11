// ═══════════════════════════════════════════════
// Admin V2.0 — Ticket Center (Messages)
// Depends on: api.js, utils.js, admin.init.js
// ═══════════════════════════════════════════════

async function loadAdminMessages(page = 1) {
    try {
        const status = document.getElementById('msgStatusFilter')?.value || '';
        const data = await API.get(`/admin/messages?page=${page}&limit=15${status ? `&status=${status}` : ''}`);
        const messages = data.data.messages;
        const container = document.getElementById('adminMessagesContainer');

        if (messages.length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:60px 20px;color:var(--text-3)"><i class="fas fa-inbox" style="font-size:3rem;display:block;margin-bottom:16px;opacity:0.3"></i><h3 style="font-weight:500;margin-bottom:4px">No messages</h3><p style="font-size:0.85rem">When clients reach out, their tickets will appear here.</p></div>';
        } else {
            container.innerHTML = messages.map(m => `
                <div class="card" style="margin-bottom:12px;border-left:3px solid ${m.status === 'replied' ? '#10b981' : 'var(--gold)'}">
                    <div style="display:flex;align-items:flex-start;gap:14px">
                        <div style="width:38px;height:38px;border-radius:50%;background:var(--body-bg);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.8rem;color:var(--gold);border:1px solid var(--border);flex-shrink:0">
                            ${(m.name || 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                        </div>
                        <div style="flex:1;min-width:0">
                            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap">
                                <strong style="font-size:0.9rem">${esc(m.name)}</strong>
                                <span style="font-size:0.75rem;color:var(--text-3)">${esc(m.email)}</span>
                                <span class="badge badge-${m.status === 'replied' ? 'success' : 'warning'}" style="font-size:0.7rem">${m.status || 'new'}</span>
                                ${m.phone ? `<span style="font-size:0.75rem;color:var(--text-3)"><i class="fas fa-phone" style="font-size:0.65rem"></i> ${esc(m.phone)}</span>` : ''}
                            </div>
                            <p style="font-size:0.88rem;color:var(--text-2);margin:6px 0;line-height:1.5">${esc(m.message)}</p>
                            <span style="font-size:0.75rem;color:var(--text-3)">${Utils.formatDate(m.created_at)}</span>

                            ${m.admin_reply ? `
                                <div style="margin-top:10px;padding:10px 14px;background:rgba(16,185,129,0.05);border:1px solid rgba(16,185,129,0.12);border-radius:8px">
                                    <div style="font-size:0.7rem;font-weight:700;text-transform:uppercase;color:#10b981;margin-bottom:4px"><i class="fas fa-reply"></i> Admin Reply</div>
                                    <p style="font-size:0.85rem;color:var(--text-2)">${esc(m.admin_reply)}</p>
                                </div>
                            ` : ''}

                            ${/* BUG FIX #5: was m.internal_note (wrong), DB column is internal_notes (plural) */ m.internal_notes ? `
                                <div class="internal-note">
                                    <div class="internal-note-label"><i class="fas fa-sticky-note"></i> Internal Note</div>
                                    ${esc(m.internal_notes)}
                                </div>
                            ` : ''}

                            <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
                                <input type="text" class="form-input" id="reply-${m.id}" placeholder="Type your reply..." style="flex:1;min-width:200px;font-size:0.85rem;padding:8px 12px">
                                <button class="btn btn-outline btn-sm" onclick="saveInternalNote(${m.id})"><i class="fas fa-sticky-note"></i> Note</button>
                                ${adminUser?.role === 'super_admin' ? `<button class="btn btn-danger btn-sm" onclick="deleteAdminMessage(${m.id})" style="margin-left:auto"><i class="fas fa-trash"></i> Delete</button>` : ''}
                            </div>
                        </div>
                    </div>
                </div>
            `).join('');
        }
        renderPagination(data.data.pagination, 'adminMsgPagination', loadAdminMessages);
    } catch (err) { Toast.error('Failed to load messages.'); }
}

async function sendAdminReply(messageId) {
    const input = document.getElementById(`reply-${messageId}`);
    const reply = input?.value?.trim();
    if (!reply) { Toast.warning('Please enter a reply.'); return; }
    try {
        // BUG FIX #2: API expects { reply_message }, was incorrectly sending { reply }
        await API.put(`/admin/messages/${messageId}/reply`, { reply_message: reply });
        Toast.success('Reply sent successfully!');
        loadAdminMessages();
    } catch (err) { Toast.error(err.message); }
}

async function saveInternalNote(messageId) {
    const input = document.getElementById(`reply-${messageId}`);
    const note = input?.value?.trim();
    if (!note) { Toast.warning('Please enter a note.'); return; }
    try {
        // BUG FIX #4: API expects { internal_notes }, was incorrectly sending { note }
        await API.put(`/admin/messages/${messageId}/note`, { internal_notes: note });
        Toast.success('Internal note saved!');
        loadAdminMessages();
    } catch (err) { Toast.error(err.message); }
}

async function deleteAdminMessage(messageId) {
    const confirmed = await glassConfirm(
        'Delete Message',
        'Are you sure you want to permanently delete this contact message?',
        'danger'
    );
    if (!confirmed) return;
    try {
        await API.delete(`/admin/messages/${messageId}`);
        Toast.success('Message deleted successfully.');
        loadAdminMessages();
    } catch (err) { Toast.error(err.message || 'Failed to delete message.'); }
}
