// ═══════════════════════════════════════════════
// Portfolio Routes
// ═══════════════════════════════════════════════
const router = require('express').Router();
const portfolioController = require('../controllers/portfolio.controller');
const { authenticate, authorize, optionalAuth } = require('../middlewares/auth');
const { upload } = require('../services/upload.service');

// Public (optionalAuth populates req.user for admin if cookie exists)
router.get('/', optionalAuth, portfolioController.getAll);
router.get('/:id', portfolioController.getById);

// Admin only
router.post('/', authenticate, authorize('super_admin', 'admin'), upload.array('images', 5), portfolioController.create);
router.put('/:id', authenticate, authorize('super_admin', 'admin'), upload.array('images', 5), portfolioController.update);
router.delete('/:id', authenticate, authorize('super_admin', 'admin'), portfolioController.remove);

module.exports = router;
