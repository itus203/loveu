const router = require('express').Router();
const auth = require('../middleware/authMiddleware');
const { toggleReaction, getReactions } = require('../controllers/reactionController');
router.post('/:postId', auth, toggleReaction);
router.get('/:postId', auth, getReactions);
module.exports = router;
