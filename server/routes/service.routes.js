// ═══════════════════════════════════════════════
// Service Routes
// ═══════════════════════════════════════════════
const router = require('express').Router();
const serviceController = require('../controllers/service.controller');
const { authenticate, authorize } = require('../middlewares/auth');
const { serviceValidation, idParamValidation } = require('../middlewares/validators');
const { upload } = require('../services/upload.service');
const { uploadLimiter } = require('../middlewares/rateLimiter');

// Cache-Control for public GET endpoints (5 min cache)
const cachePublic = (req, res, next) => {
    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
    next();
};

// Public
router.get('/', cachePublic, serviceController.getAll);
router.get('/:id', cachePublic, idParamValidation, serviceController.getById);

// Admin only
router.post('/', authenticate, authorize('super_admin', 'admin'), uploadLimiter, upload.array('images', 5), serviceValidation, serviceController.create);
router.put('/:id', authenticate, authorize('super_admin', 'admin'), uploadLimiter, upload.array('images', 5), idParamValidation, serviceController.update);
router.delete('/:id', authenticate, authorize('super_admin', 'admin'), idParamValidation, serviceController.remove);

module.exports = router;
