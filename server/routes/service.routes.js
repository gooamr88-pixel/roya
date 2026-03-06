// ═══════════════════════════════════════════════
// Service Routes
// ═══════════════════════════════════════════════
const router = require('express').Router();
const serviceController = require('../controllers/service.controller');
const { authenticate, authorize } = require('../middlewares/auth');
const { serviceValidation, idParamValidation } = require('../middlewares/validators');
const { upload } = require('../services/upload.service');

// Public
router.get('/', serviceController.getAll);
router.get('/:id', idParamValidation, serviceController.getById);

// Admin only
router.post('/', authenticate, authorize('super_admin', 'admin'), upload.array('images', 5), serviceValidation, serviceController.create);
router.put('/:id', authenticate, authorize('super_admin', 'admin'), upload.array('images', 5), idParamValidation, serviceController.update);
router.delete('/:id', authenticate, authorize('super_admin', 'admin'), idParamValidation, serviceController.remove);

module.exports = router;
