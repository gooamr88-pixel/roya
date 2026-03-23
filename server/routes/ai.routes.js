// ═══════════════════════════════════════════════
// AI Routes — Generate content via AI proxy
// ═══════════════════════════════════════════════
const router = require('express').Router();
const aiController = require('../controllers/ai.controller');
const { authenticate } = require('../middlewares/auth');
const { aiLimiter, aiChatLimiter } = require('../middlewares/rateLimiter');

// Authenticated users only — 10 requests per 15 min
router.post('/generate', authenticate, aiLimiter, aiController.generate);

// Public chatbot — no auth, 6 requests per 5 min, restricted to website_chatbot context
router.post('/chat', aiChatLimiter, aiController.chat);

module.exports = router;
