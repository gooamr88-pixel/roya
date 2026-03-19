// ═══════════════════════════════════════════════
// AI Routes — Generate content via AI proxy
// ═══════════════════════════════════════════════
const router = require('express').Router();
const aiController = require('../controllers/ai.controller');
const { authenticate } = require('../middlewares/auth');

// Authenticated users only
router.post('/generate', authenticate, aiController.generate);

module.exports = router;
