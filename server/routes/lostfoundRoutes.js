const router = require('express').Router();
const auth = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');
const ctrl = require('../controllers/lostfoundController');
// 🌍 GLOBAL: Lost & Found visible to all DIU students — no auth for browse
router.get('/', ctrl.getItems);
router.post('/', auth, upload.single('image'), ctrl.postItem);
router.put('/:id/status', auth, ctrl.updateStatus);
router.put('/:id', auth, upload.single('image'), ctrl.updateItem);
router.delete('/:id', auth, ctrl.deleteItem);
module.exports = router;
