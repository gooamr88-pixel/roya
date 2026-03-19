// ═══════════════════════════════════════════════
// AI Routes — Generate content via AI proxy
// ═══════════════════════════════════════════════
const router = require('express').Router();
const aiController = require('../controllers/ai.controller');
const { authenticate } = require('../middlewares/auth');

// Authenticated users only
router.post('/generate', authenticate, aiController.generate);

// Public chatbot — no auth required, restricted to website_chatbot context
router.post('/chat', aiController.chat);

module.exports = router;
