// ═══════════════════════════════════════════════
// AI Controller — Thin HTTP layer
// ═══════════════════════════════════════════════
const { AppError } = require('../middlewares/errorHandler');
const { asyncHandler } = require('../utils/helpers');
const aiService = require('../services/ai.service');

/**
 * POST /api/ai/generate
 * Body: { prompt: string, context?: string }
 */
const generate = asyncHandler(async (req, res) => {
    const { prompt, context } = req.body;

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        throw new AppError('Prompt is required.', 400, 'MISSING_PROMPT');
    }

    if (prompt.length > 500) {
        throw new AppError('Prompt must be 500 characters or fewer.', 400, 'PROMPT_TOO_LONG');
    }

    const result = await aiService.generateContent(prompt.trim(), context || '');
    res.json({ success: true, data: result });
});

/**
 * POST /api/ai/chat  (PUBLIC — no auth)
 * Body: { prompt: string }
 * Always uses 'website_chatbot' context for security.
 */
const chat = asyncHandler(async (req, res) => {
    const { prompt } = req.body;

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        throw new AppError('Message is required.', 400, 'MISSING_PROMPT');
    }

    if (prompt.length > 300) {
        throw new AppError('Message must be 300 characters or fewer.', 400, 'PROMPT_TOO_LONG');
    }

    const result = await aiService.generateContent(prompt.trim(), 'website_chatbot');
    res.json({ success: true, data: result });
});

module.exports = { generate, chat };
