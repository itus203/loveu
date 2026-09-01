const router = require('express').Router();
const auth = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');
const { createChannel, getChannels, getChannelPosts, createPost, joinChannel, updateChannel, deleteChannel, deleteChannelPost } = require('../controllers/channelController');

router.post('/', auth, upload.single('cover_image'), createChannel);
router.get('/', auth, getChannels);
router.get('/:id/posts', auth, getChannelPosts);
router.put('/:id', auth, upload.single('cover_image'), updateChannel);
router.delete('/:id', auth, deleteChannel);
router.post('/post', auth, upload.single('media'), createPost);
router.delete('/post/:pid', auth, deleteChannelPost);
router.post('/:id/join', auth, joinChannel);

module.exports = router;
