const router = require('express').Router();
const auth = require('../middleware/authMiddleware');
const { toggleSubscription, checkSubscription } = require('../controllers/creatorController');

router.post('/:creatorId/subscribe', auth, toggleSubscription);
router.get('/:creatorId/status', auth, checkSubscription);

module.exports = router;
