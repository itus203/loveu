const router = require('express').Router();
const auth = require('../middleware/authMiddleware');
const { sendRequest, acceptRequest, declineRequest, unfriend, getFriends, getPendingRequests, getFriendshipStatus } = require('../controllers/friendController');
router.post('/request/:id', auth, sendRequest);
router.put('/accept/:id', auth, acceptRequest);
router.put('/decline/:id', auth, declineRequest);
router.delete('/decline/:id', auth, declineRequest);
router.delete('/unfriend/:id', auth, unfriend);
router.get('/', auth, getFriends);
router.get('/user/:userId', auth, getFriends);
router.get('/pending', auth, getPendingRequests);
router.get('/requests', auth, getPendingRequests);   // alias
router.get('/status/:id', auth, getFriendshipStatus);
module.exports = router;
