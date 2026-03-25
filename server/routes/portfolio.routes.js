// ═══════════════════════════════════════════════
// Portfolio Routes
// ═══════════════════════════════════════════════
const router = require('express').Router();
const portfolioController = require('../controllers/portfolio.controller');
const { authenticate, authorize, optionalAuth } = require('../middlewares/auth');
const { upload } = require('../services/upload.service');
const { uploadLimiter } = require('../middlewares/rateLimiter');

// Cache-Control for public GET endpoints (5 min cache)
const cachePublic = (req, res, next) => {
    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
    next();
};

// Public (optionalAuth populates req.user for admin if cookie exists)
router.get('/', cachePublic, optionalAuth, portfolioController.getAll);
router.get('/:id', cachePublic, portfolioController.getById);

// Admin only
router.post('/', authenticate, authorize('super_admin', 'admin'), uploadLimiter, upload.array('images', 5), portfolioController.create);
router.put('/:id', authenticate, authorize('super_admin', 'admin'), uploadLimiter, upload.array('images', 5), portfolioController.update);
router.delete('/:id', authenticate, authorize('super_admin', 'admin'), portfolioController.remove);
router.delete('/:id/permanent', authenticate, authorize('super_admin'), portfolioController.permanentRemove);

module.exports = router;
