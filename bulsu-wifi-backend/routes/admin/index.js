const router = require('express').Router();
const { verifyToken, requireAdmin } = require('../../middleware/auth');

router.use(verifyToken, requireAdmin);

router.use('/overview',      require('./overview'));
router.use('/users',         require('./users'));
router.use('/sessions',      require('./sessions'));
router.use('/guests',        require('./guests'));
router.use('/emergency',     require('./emergency'));
router.use('/feedback',      require('./feedback'));
router.use('/notifications', require('./notifications'));
router.use('/settings',      require('./settings'));

module.exports = router;
