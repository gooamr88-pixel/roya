// ═══════════════════════════════════════════════
// Order Routes — RBAC-aware
// ═══════════════════════════════════════════════
const router = require('express').Router();
const ctrl = require('../controllers/order.controller');
const { authenticate, authorize, authorizeRole } = require('../middlewares/auth');
const { orderLimiter } = require('../middlewares/rateLimiter');
const { orderValidation, orderStatusValidation, idParamValidation } = require('../middlewares/validators');

router.use(authenticate);

router.post('/', orderLimiter, orderValidation, ctrl.create);
router.get('/', ctrl.getAll);
router.get('/:id', idParamValidation, ctrl.getById);
router.put('/:id/status', authorize('super_admin', 'admin', 'supervisor'), idParamValidation, orderStatusValidation, ctrl.updateStatus);
router.put('/:id/cancel', idParamValidation, ctrl.cancelOrder);
router.delete('/:id', authorizeRole('admin'), idParamValidation, ctrl.deleteOrder);

module.exports = router;
