// ═══════════════════════════════════════════════
// User Routes
// ═══════════════════════════════════════════════
const router = require('express').Router();
const userController = require('../controllers/user.controller');
const { authenticate } = require('../middlewares/auth');
const { profileUpdateValidation, changePasswordValidation } = require('../middlewares/validators');
const { upload } = require('../services/upload.service');

router.use(authenticate);

router.get('/profile', userController.getProfile);
router.put('/profile', profileUpdateValidation, userController.updateProfile);
router.put('/password', changePasswordValidation, userController.changePassword);
router.put('/avatar', upload.single('avatar'), userController.updateAvatar);

module.exports = router;
