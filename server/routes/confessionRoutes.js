const router = require('express').Router();
const auth = require('../middleware/authMiddleware');
const ctrl = require('../controllers/confessionController');
router.get('/', auth, ctrl.getConfessions);
router.post('/', auth, ctrl.postConfession);
router.post('/:id/like', auth, ctrl.likeConfession);
router.delete('/:id', auth, ctrl.deleteConfession);
module.exports = router;
