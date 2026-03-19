// ═══════════════════════════════════════════════
// ROYA AI CHATBOT — Landing Page Virtual Assistant
// Uses /api/ai/generate with context 'website_chatbot'
// Works for both authenticated and guest users
// ═══════════════════════════════════════════════

(function () {
    const chatFab = document.getElementById('chatbotFab');
    const chatWindow = document.getElementById('chatbotWindow');
    const chatMessages = document.getElementById('chatbotMessages');
    const chatInput = document.getElementById('chatbotInput');
    const chatSend = document.getElementById('chatbotSend');
    if (!chatFab || !chatWindow) return;

    let isOpen = false;
    let isLoading = false;

    // ── i18n helpers ──
    const lang = document.documentElement.lang || 'en';
    const i18n = {
        greeting: lang === 'ar'
            ? 'مرحباً! 👋 أنا المساعد الذكي لمنصة رؤيا. كيف يمكنني مساعدتك اليوم؟'
            : 'Hello! 👋 I\'m Roya\'s AI assistant. How can I help you today?',
        placeholder: lang === 'ar' ? 'اكتب رسالتك...' : 'Type your message...',
        error: lang === 'ar'
            ? 'عذراً، لم أتمكن من الرد الآن. حاول مرة أخرى.'
            : 'Sorry, I couldn\'t respond right now. Please try again.',
        online: lang === 'ar' ? 'متصل الآن' : 'Online now',
    };

    // Set dynamic placeholder
    if (chatInput) chatInput.placeholder = i18n.placeholder;

    // Set online text
    const onlineEl = document.getElementById('chatbotOnline');
    if (onlineEl) onlineEl.textContent = i18n.online;

    // ── Toggle chat ──
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

    // ── Send message ──
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
            chatSend.disabled = false;
        }
    }

    // ── Message Helpers ──
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
