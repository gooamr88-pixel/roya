// ═══════════════════════════════════════════════
// Admin V2.0 — Ticket Center (Messages) + AI Draft Reply
// Depends on: api.js, utils.js, admin.init.js
// ═══════════════════════════════════════════════

async function loadAdminMessages(page = 1) {
    try {
        const status = document.getElementById('msgStatusFilter')?.value || '';
        const data = await API.get(`/admin/messages?page=${page}&limit=15${status ? `&status=${status}` : ''}`);
        const messages = data.data.messages;
        const container = document.getElementById('adminMessagesContainer');

        if (messages.length === 0) {
            container.innerHTML = `<div style="text-align:center;padding:60px 20px;color:var(--text-3)"><i class="fas fa-inbox" style="font-size:3rem;display:block;margin-bottom:16px;opacity:0.3"></i><h3 style="font-weight:500;margin-bottom:4px">${(window.__t||{}).noResultsFound || 'No messages'}</h3><p style="font-size:0.85rem">${(window.__t||{}).noMessagesDesc || 'When clients reach out, their tickets will appear here.'}</p></div>`;
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
                            <p style="font-size:0.88rem;color:var(--text-2);margin:6px 0;line-height:1.5" id="msg-text-${m.id}">${esc(m.message)}</p>
                            <span style="font-size:0.75rem;color:var(--text-3)">${Utils.formatDate(m.created_at)}</span>

                            ${m.admin_reply ? `
                                <div style="margin-top:10px;padding:10px 14px;background:rgba(16,185,129,0.05);border:1px solid rgba(16,185,129,0.12);border-radius:8px">
                                    <div style="font-size:0.7rem;font-weight:700;text-transform:uppercase;color:#10b981;margin-bottom:4px"><i class="fas fa-reply"></i> ${(window.__t||{}).adminReply || 'Admin Reply'}</div>
                                    <p style="font-size:0.85rem;color:var(--text-2)">${esc(m.admin_reply)}</p>
                                </div>
                            ` : ''}

                            ${m.internal_notes ? `
                                <div class="internal-note">
                                    <div class="internal-note-label"><i class="fas fa-sticky-note"></i> ${(window.__t||{}).internalNote || 'Internal Note'}</div>
                                    ${esc(m.internal_notes)}
                                </div>
                            ` : ''}

                            <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;align-items:center">
                                <input type="text" class="form-input" id="reply-${m.id}" placeholder="Type your reply..." style="flex:1;min-width:200px;font-size:0.85rem;padding:8px 12px">
                                <button class="ai-sparkle-btn" onclick="aiDraftReply(${m.id})" data-tooltip="${(window.__t||{}).aiDraftReply||'✨ AI Draft Reply'}">
                                    <i class="fas fa-wand-magic-sparkles sparkle-icon"></i> ${(window.__t||{}).aiDraft||'Draft'}
                                </button>
                                <button class="btn btn-primary btn-sm" onclick="sendAdminReply(${m.id})"><i class="fas fa-paper-plane"></i> ${(window.__t||{}).replyBtn || 'Reply'}</button>
                                <button class="btn btn-outline btn-sm" onclick="saveInternalNote(${m.id})"><i class="fas fa-sticky-note"></i> ${(window.__t||{}).noteBtn || 'Note'}</button>
                                ${hasMinRole('admin') ? `<button class="btn btn-danger btn-sm" onclick="deleteAdminMessage(${m.id})" style="margin-left:auto"><i class="fas fa-trash"></i></button>` : ''}
                            </div>
                            <div id="ai-draft-status-${m.id}"></div>
                        </div>
                    </div>
                </div>
            `).join('');
        }
        renderPagination(data.data.pagination, 'adminMsgPagination', loadAdminMessages);
    } catch (err) { Toast.error((window.__t||{}).failedLoad || 'Failed to load messages.'); }
}

async function sendAdminReply(messageId) {
    const input = document.getElementById(`reply-${messageId}`);
    const reply = input?.value?.trim();
    if (!reply) { Toast.warning((window.__t||{}).enterReply || 'Please enter a reply.'); return; }
    try {
        // SECURITY FIX: Use POST /contact/admin/:id/reply instead of PUT /admin/messages/:id/reply
        // This hits the replyEmailLimiter (10/15min) added in Phase 4 to prevent spam relay abuse
        await API.post(`/contact/admin/${messageId}/reply`, { reply_message: reply });
        Toast.success((window.__t||{}).replySent || 'Reply sent successfully!');
        loadAdminMessages();
    } catch (err) { Toast.error(err.message); }
}

async function saveInternalNote(messageId) {
    const input = document.getElementById(`reply-${messageId}`);
    const note = input?.value?.trim();
    if (!note) { Toast.warning((window.__t||{}).enterNote || 'Please enter a note.'); return; }
    try {
        await API.put(`/admin/messages/${messageId}/note`, { internal_notes: note });
        Toast.success((window.__t||{}).noteSaved || 'Internal note saved!');
        loadAdminMessages();
    } catch (err) { Toast.error(err.message); }
}

async function deleteAdminMessage(messageId) {
    const confirmed = await glassConfirm(
        (window.__t||{}).deleteMessage || 'Delete Message',
        (window.__t||{}).deleteMessageConfirm || 'Are you sure you want to permanently delete this contact message?',
        'danger'
    );
    if (!confirmed) return;
    try {
        await API.delete(`/admin/messages/${messageId}`);
        Toast.success((window.__t||{}).messageDeleted || 'Message deleted successfully.');
        // Update sidebar badge count
        const badge = document.querySelector('[data-view="messages"] .sidebar-badge, .sidebar-menu a[href*="messages"] .badge');
        if (badge) {
            const count = parseInt(badge.textContent) || 0;
            if (count > 1) badge.textContent = count - 1;
            else badge.remove();
        }
        loadAdminMessages();
    } catch (err) { Toast.error(err.message || (window.__t||{}).failedSave || 'Failed to delete message.'); }
}

// ══════════════════════════════════════════
//  AI DRAFT REPLY
// ══════════════════════════════════════════
let _aiDraftBusy = false;

async function aiDraftReply(messageId) {
    const msgEl = document.getElementById(`msg-text-${messageId}`);
    const replyInput = document.getElementById(`reply-${messageId}`);
    const statusEl = document.getElementById(`ai-draft-status-${messageId}`);
    if (!msgEl || !replyInput) return;

    // Prevent concurrent/spam requests
    if (_aiDraftBusy) {
        Toast.warning((window.__t||{}).aiPleaseWait || 'Please wait for the current AI request to finish.');
        return;
    }

    const customerMessage = msgEl.textContent || '';
    if (!customerMessage.trim()) {
        Toast.warning('No message content to draft a reply for.');
        return;
    }

    // Show drafting indicator
    if (statusEl) statusEl.innerHTML = '<div class="ai-drafting-indicator"><span class="ai-spinner"></span> ' + ((window.__t||{}).aiDrafting||'AI is drafting a reply...') + '</div>';
    _aiDraftBusy = true;

    try {
        const result = await API.post('/ai/generate', {
            prompt: `Write a professional, polite, and helpful customer service reply to this message: "${customerMessage}"`,
            context: 'admin_draft_reply',
        });
        const text = result.data?.text || '';
        if (text) {
            replyInput.value = text;
            replyInput.focus();
            replyInput.style.borderColor = 'var(--gold)';
            setTimeout(() => { replyInput.style.borderColor = ''; }, 2000);
            Toast.success((window.__t||{}).aiDraftSuccess || '✨ Draft ready — review and send!');
        } else {
            Toast.warning('AI returned empty draft. Please write manually.');
        }
    } catch (err) {
        const msg = err.message || '';
        if (msg.includes('429') || msg.toLowerCase().includes('rate limit')) {
            Toast.error((window.__t||{}).aiRateLimited || '⏳ AI rate limit reached. Please wait a few minutes.');
        } else {
            Toast.error(msg || (window.__t||{}).aiError || 'AI is currently resting. Please type manually.');
        }
    } finally {
        _aiDraftBusy = false;
        if (statusEl) statusEl.innerHTML = '';
    }
}
