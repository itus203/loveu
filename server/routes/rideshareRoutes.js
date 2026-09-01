const router = require('express').Router();
const auth = require('../middleware/authMiddleware');
const { createPost, getPosts, closePost, deletePost, updatePost } = require('../controllers/rideshareController');
// 🌍 GLOBAL: Rideshare visible to all DIU students — no auth for browse
router.get('/', getPosts);
router.post('/', auth, createPost);
router.put('/:id', auth, updatePost);
router.put('/:id/close', auth, closePost);
router.delete('/:id', auth, deletePost);
module.exports = router;
