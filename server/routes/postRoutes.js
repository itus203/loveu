const router = require('express').Router();
const auth = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');
const {
    createPost, getFeed, getPost, deletePost, updatePost, getUserPosts, addComment,
    deleteComment, updateComment, reportPost, flagPost
} = require('../controllers/postController');

router.get('/feed',             auth, getFeed);
router.post('/',                auth, upload.single('media'), createPost);
router.get('/user/:userId',     auth, getUserPosts);
router.get('/my',               auth, getUserPosts);
router.get('/:id',              auth, getPost);
router.delete('/:id',           auth, deletePost);
router.put('/:id',              auth, updatePost);
router.post('/:id/comment',     auth, addComment);
router.delete('/:id/comments/:cid', auth, deleteComment);
router.put('/:id/comments/:cid',    auth, updateComment);

// ─── Moderation (NEW) ──────────────────────────────────────────────────────
router.post('/:id/report',      auth, reportPost);   // Any user reports a post
router.post('/:id/flag',        auth, flagPost);     // Admin flags a post

module.exports = router;
