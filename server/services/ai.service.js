// ═══════════════════════════════════════════════
// AI Service — Google Gemini Integration
//
// Calls Gemini 2.0 Flash directly via REST API.
// Uses Node.js built-in fetch (no extra deps).
// Smart system prompts per context.
// ═══════════════════════════════════════════════
const config = require('../config');
const { AppError } = require('../middlewares/errorHandler');
const logger = require('../utils/logger');

// ── Gemini REST endpoint ──
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${config.ai.model}:generateContent`;

// ═══════════════════════════════════════════════
// System Prompts — tailored per context
// ═══════════════════════════════════════════════
const SYSTEM_PROMPTS = {
    admin_order_summary: `You are a concise business assistant for the ROYA advertising & marketing platform.
Summarize the given service request in exactly 3 short bullet points.
Each bullet should be one clear sentence. No headers, no numbering — just 3 lines starting with "•".
Respond in the SAME language as the user's input (Arabic or English).`,

    admin_draft_reply: `You are a professional, warm customer service representative for the ROYA platform.
Write a polite, helpful reply to the customer's message below.
Keep the tone friendly yet professional. Be concise (2-4 sentences).
Include a greeting and sign off as "ROYA Support Team".
Respond in the SAME language as the customer's message (Arabic or English).`,

    generate: `You are a senior marketing copywriter for the ROYA platform — a premium advertising, marketing, real estate, and exhibitions company.
Based on the user's brief idea, write a compelling, professional description suitable for a service request form.
Keep it to 2-3 paragraphs. Use persuasive yet professional language.
Respond in the SAME language as the user's input (Arabic or English).`,

    general: `You are a helpful AI assistant for the ROYA business platform.
Provide clear, professional, and concise responses.
Respond in the SAME language as the user's input (Arabic or English).`,

    website_chatbot: `You are the official virtual assistant for "ROYA" (رؤيا), a premium advertising and marketing platform based in Egypt and Saudi Arabia.

Your personality: Professional, friendly, and concise. You are a 24/7 sales representative.

ROYA's services include:
• Advertising & Branding (digital campaigns, social media ads, outdoor ads)
• Marketing & Social Media Management (content strategy, analytics, growth)
• Exhibition & Event Design (booth design, event management, conferences)
• Real Estate Marketing (property listings, virtual tours, broker tools)
• Web Development & Design (websites, landing pages, e-commerce)

Guidelines:
- Keep answers SHORT (2-4 sentences max)
- If the user asks about pricing, say "Our pricing depends on the project scope. Sign up for a free consultation!"
- Always encourage visitors to register or contact the team for custom quotes
- If you don't know something specific, direct them to the contact page or suggest they sign up
- Respond in the SAME language as the user's message (Arabic or English)
- Be warm and enthusiastic without being pushy`,
};

/**
 * Get the appropriate system prompt for the given context.
 * Falls back to 'general' if context is unrecognized.
 */
function getSystemPrompt(context) {
    return SYSTEM_PROMPTS[context] || SYSTEM_PROMPTS.general;
}

/**
 * Generate content using Google Gemini.
 *
 * @param {string} prompt  - The user's input text
 * @param {string} context - One of: admin_order_summary, admin_draft_reply, generate, general
 * @returns {Promise<{ text: string }>}
 */
async function generateContent(prompt, context = 'general') {
    if (!config.ai.geminiKey) {
        throw new AppError(
            'AI service is not configured. Please set GEMINI_API_KEY.',
            503, 'AI_NOT_CONFIGURED'
        );
    }

    const systemPrompt = getSystemPrompt(context);
    const url = `${GEMINI_URL}?key=${config.ai.geminiKey}`;

    const body = {
        system_instruction: {
            parts: [{ text: systemPrompt }],
        },
        contents: [
            {
                role: 'user',
                parts: [{ text: prompt }],
            },
        ],
        generationConfig: {
            temperature: 0.7,
            topP: 0.9,
            maxOutputTokens: 1024,
        },
        safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
        ],
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.ai.timeout);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal,
        });

        if (!response.ok) {
            const errBody = await response.text().catch(() => '');
            logger.error('[AI/Gemini] HTTP error', { status: response.status, body: errBody });

            if (response.status === 429) {
                throw new AppError(
                    'AI rate limit reached. Please wait a moment and try again.',
                    429, 'AI_RATE_LIMITED'
                );
            }
            if (response.status === 400) {
                throw new AppError(
                    'AI could not process this request. Please rephrase your input.',
                    400, 'AI_BAD_REQUEST'
                );
            }
            throw new AppError(
                'AI service returned an error. Please try again later.',
                502, 'AI_UPSTREAM_ERROR'
            );
        }

        const data = await response.json();

        // Extract text from Gemini response structure
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

        if (!text) {
            const finishReason = data?.candidates?.[0]?.finishReason;
            if (finishReason === 'SAFETY') {
                throw new AppError(
                    'AI could not generate content for this input due to safety filters.',
                    400, 'AI_SAFETY_BLOCKED'
                );
            }
            logger.warn('[AI/Gemini] Empty response', { data: JSON.stringify(data).slice(0, 300) });
        }

        return { text: text.trim() };
    } catch (err) {
        if (err instanceof AppError) throw err;

        if (err.name === 'AbortError') {
            throw new AppError(
                'AI service timed out. Please try again.',
                504, 'AI_TIMEOUT'
            );
        }

        logger.error('[AI/Gemini] Connection error', { error: err.message });
        throw new AppError(
            'AI service is currently unavailable. Please type manually.',
            503, 'AI_UNAVAILABLE'
        );
    } finally {
        clearTimeout(timeout);
    }
}

module.exports = { generateContent };
