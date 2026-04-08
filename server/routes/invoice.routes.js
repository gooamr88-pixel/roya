// ═══════════════════════════════════════════════
// Invoice Routes
// ═══════════════════════════════════════════════
const router = require('express').Router();
const ctrl = require('../controllers/invoice.controller');
const { csrfProtection } = require('../middlewares/csrf');
const { authenticate, authorize } = require('../middlewares/auth');
const { idParamValidation } = require('../middlewares/validators');

router.use(authenticate);

// ── Catalog — unified item list from services + jobs + portfolio ──
router.get('/catalog', authorize('super_admin', 'admin', 'supervisor'), ctrl.getCatalog);

// ── Manual Invoice / Quotation Save (from Admin Dashboard builder) ──
router.post('/save', authorize('super_admin', 'admin'), ctrl.save);

// ── Legacy routes ──
router.get('/', authorize('super_admin'), ctrl.getAll);
router.post('/:orderId/generate', authorize('super_admin'), ctrl.generate);
router.get('/:id/download', idParamValidation, ctrl.download);

// ── NEW: Puppeteer PDF Generation Route ──
router.post('/download-pdf', authorize('super_admin', 'admin', 'supervisor'), csrfProtection, ctrl.downloadInvoicePDF);
router.post('/:id/download-pdf', authorize('super_admin', 'admin', 'supervisor'), idParamValidation, csrfProtection, ctrl.downloadInvoicePDF);

module.exports = router;
