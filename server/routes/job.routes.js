// ═══════════════════════════════════════════════
// Job Routes
// ═══════════════════════════════════════════════
const router = require('express').Router();
const jobController = require('../controllers/job.controller');
const { authenticate, authorize } = require('../middlewares/auth');

// Public
router.get('/', jobController.getAll);
router.get('/:id', jobController.getById);

// Admin only
router.post('/', authenticate, authorize('super_admin', 'admin'), jobController.create);
router.put('/:id', authenticate, authorize('super_admin', 'admin'), jobController.update);
router.delete('/:id', authenticate, authorize('super_admin', 'admin'), jobController.remove);

module.exports = router;
