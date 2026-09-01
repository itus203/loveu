const router = require('express').Router();
const auth = require('../middleware/authMiddleware');
const { createPoll, getPolls, votePoll, deletePoll, updatePoll } = require('../controllers/pollController');
router.get('/', auth, getPolls);
router.post('/', auth, createPoll);
router.post('/:id/vote', auth, votePoll);
router.put('/:id', auth, updatePoll);
router.delete('/:id', auth, deletePoll);
module.exports = router;
