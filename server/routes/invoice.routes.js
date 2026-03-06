// ═══════════════════════════════════════════════
// Invoice Routes
// ═══════════════════════════════════════════════
const router = require('express').Router();
const ctrl = require('../controllers/invoice.controller');
const { authenticate, authorize } = require('../middlewares/auth');
const { idParamValidation } = require('../middlewares/validators');

router.use(authenticate);

router.get('/', ctrl.getAll);
router.post('/:orderId/generate', authorize('super_admin', 'admin'), ctrl.generate);
router.get('/:id/download', idParamValidation, ctrl.download);

module.exports = router;
