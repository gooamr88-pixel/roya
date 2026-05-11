// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// NABDA CAPITAL GROUP AI CHATBOT â€” Landing Page Virtual Assistant
// Uses /api/ai/generate with context 'website_chatbot'
// Works for both authenticated and guest users
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

(function () {
    const chatFab = document.getElementById('chatbotFab');
    const chatWindow = document.getElementById('chatbotWindow');
    const chatMessages = document.getElementById('chatbotMessages');
    const chatInput = document.getElementById('chatbotInput');
    const chatSend = document.getElementById('chatbotSend');
    if (!chatFab || !chatWindow) return;

    let isOpen = false;
    let isLoading = false;

    // â”€â”€ i18n helpers â”€â”€
    const lang = document.documentElement.lang || 'en';
    const i18n = {
        greeting: lang === 'ar'
            ? 'Ù…Ø±Ø­Ø¨Ø§Ù‹! ðŸ‘‹ Ø£Ù†Ø§ Ø§Ù„Ù…Ø³Ø§Ø¹Ø¯ Ø§Ù„Ø°ÙƒÙŠ Ù„Ù…Ù†ØµØ© Ù†ÙŽØ¨Ø¶ÙŽØ©. ÙƒÙŠÙ ÙŠÙ…ÙƒÙ†Ù†ÙŠ Ù…Ø³Ø§Ø¹Ø¯ØªÙƒ Ø§Ù„ÙŠÙˆÙ…ØŸ'
            : 'Hello! ðŸ‘‹ I\'m Nabda Capital Group\'s AI assistant. How can I help you today?',
        placeholder: lang === 'ar' ? 'Ø§ÙƒØªØ¨ Ø±Ø³Ø§Ù„ØªÙƒ...' : 'Type your message...',
        error: lang === 'ar'
            ? 'Ø¹Ø°Ø±Ø§Ù‹ØŒ Ù„Ù… Ø£ØªÙ…ÙƒÙ† Ù…Ù† Ø§Ù„Ø±Ø¯ Ø§Ù„Ø¢Ù†. Ø­Ø§ÙˆÙ„ Ù…Ø±Ø© Ø£Ø®Ø±Ù‰.'
            : 'Sorry, I couldn\'t respond right now. Please try again.',
        online: lang === 'ar' ? 'Ù…ØªØµÙ„ Ø§Ù„Ø¢Ù†' : 'Online now',
    };

    // Set dynamic placeholder
    if (chatInput) chatInput.placeholder = i18n.placeholder;

    // Set online text
    const onlineEl = document.getElementById('chatbotOnline');
    if (onlineEl) onlineEl.textContent = i18n.online;

    // â”€â”€ Toggle chat â”€â”€
    chatFab.addEventListener('click', () => {
        isOpen = !isOpen;
        chatWindow.classList.toggle('open', isOpen);
        chatFab.classList.toggle('open', isOpen);
        if (isOpen) {
            // First-time greeting
            if (chatMessages.children.length === 0) {
                addBotMessage(i18n.greeting);
            }
            setTimeout(() => chatInput?.focus(), 300);
        }
    });

    // â”€â”€ Send message â”€â”€
    chatSend?.addEventListener('click', sendMessage);
    chatInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });

    async function sendMessage() {
        const text = chatInput?.value?.trim();
        if (!text || isLoading) return;

        // Add user message
        addUserMessage(text);
        chatInput.value = '';
        isLoading = true;
        chatSend.disabled = true;

        // Show typing indicator
        const typingEl = showTyping();

        try {
            const res = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: text }),
                credentials: 'include',
            });

            removeTyping(typingEl);

            if (res.status === 429) {
                const retryMsg = lang === 'ar'
                    ? 'Ø£Ù†Øª ØªØ±Ø³Ù„ Ø±Ø³Ø§Ø¦Ù„ Ø¨Ø³Ø±Ø¹Ø© ÙƒØ¨ÙŠØ±Ø©. ÙŠØ±Ø¬Ù‰ Ø§Ù„Ø§Ù†ØªØ¸Ø§Ø± Ù„Ø­Ø¸Ø© ÙˆØ§Ù„Ù…Ø­Ø§ÙˆÙ„Ø© Ù…Ø±Ø© Ø£Ø®Ø±Ù‰.'
                    : 'You\'re sending messages too fast. Please wait a moment and try again.';
                addBotMessage('â³ ' + retryMsg);
                // Cooldown: disable input for 30 seconds on rate-limit
                chatInput.disabled = true;
                chatInput.classList.add('chatbot-cooldown');
                setTimeout(() => {
                    chatInput.disabled = false;
                    chatInput.classList.remove('chatbot-cooldown');
                    chatInput.focus();
                }, 30000);
                return;
            }

            if (!res.ok) {
                addBotMessage(i18n.error);
                return;
            }

            const data = await res.json();
            const reply = data?.data?.text || i18n.error;
            addBotMessage(reply);
        } catch {
            removeTyping(typingEl);
            addBotMessage(i18n.error);
        } finally {
            isLoading = false;
            // 3-second cooldown between messages to prevent spam
            setTimeout(() => { chatSend.disabled = false; }, 3000);
        }
    }

    // â”€â”€ Message Helpers â”€â”€
    function addUserMessage(text) {
        const div = document.createElement('div');
        div.className = 'chatbot-msg user';
        div.textContent = text;
        chatMessages.appendChild(div);
        scrollToBottom();
    }

    function addBotMessage(text) {
        const div = document.createElement('div');
        div.className = 'chatbot-msg bot';
        div.textContent = text;
        chatMessages.appendChild(div);
        scrollToBottom();
    }

    function showTyping() {
        const div = document.createElement('div');
        div.className = 'chatbot-typing';
        div.id = 'chatbotTyping';
        div.innerHTML = '<span></span><span></span><span></span>';
        chatMessages.appendChild(div);
        scrollToBottom();
        return div;
    }

    function removeTyping(el) {
        el?.remove();
    }

    function scrollToBottom() {
        requestAnimationFrame(() => {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        });
    }
})();

