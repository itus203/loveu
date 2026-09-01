const router = require('express').Router();
const auth = require('../middleware/authMiddleware');
const { createPost, getPosts, deletePost, updatePost } = require('../controllers/tutoringController');
// 🌍 GLOBAL: Tutoring visible to all DIU students — no auth for browse
router.get('/', getPosts);
router.post('/', auth, createPost);
router.put('/:id', auth, updatePost);
router.delete('/:id', auth, deletePost);
module.exports = router;
