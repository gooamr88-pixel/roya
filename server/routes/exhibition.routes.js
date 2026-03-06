// ═══════════════════════════════════════════════
// Exhibition Routes
// ═══════════════════════════════════════════════
const router = require('express').Router();
const ctrl = require('../controllers/exhibition.controller');
const { authenticate, authorize } = require('../middlewares/auth');
const { idParamValidation } = require('../middlewares/validators');
const { upload } = require('../services/upload.service');

router.get('/', ctrl.getAll);
router.get('/:id', idParamValidation, ctrl.getById);
router.post('/', authenticate, authorize('super_admin', 'admin'), upload.array('images', 5), ctrl.create);
router.put('/:id', authenticate, authorize('super_admin', 'admin'), upload.array('images', 5), idParamValidation, ctrl.update);
router.delete('/:id', authenticate, authorize('super_admin', 'admin'), idParamValidation, ctrl.remove);

module.exports = router;
