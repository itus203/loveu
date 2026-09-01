const router = require('express').Router();
const auth = require('../middleware/authMiddleware');
const { getNotifications, markAllRead, markRead, getUnreadCount } = require('../controllers/notificationController');
router.get('/', auth, getNotifications);
router.get('/unread-count', auth, getUnreadCount);
router.put('/mark-all-read', auth, markAllRead);
router.put('/:id/read', auth, markRead);
module.exports = router;
