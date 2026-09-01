const router = require('express').Router();
const auth = require('../middleware/authMiddleware');
const { getSaved, toggleSave } = require('../controllers/savedController');
router.get('/', auth, getSaved);
router.post('/:postId', auth, toggleSave);
module.exports = router;
