const router=require('express').Router();
const auth=require('../middleware/authMiddleware');
const upload=require('../middleware/uploadMiddleware');
const c=require('../controllers/groupController');

// Discover & My
router.get('/', auth, c.getGroups);
router.get('/my', auth, c.getMyGroups);
router.get('/:id', auth, c.getGroupById);
router.post('/', auth, upload.fields([{name:'cover_image', maxCount:1},{name:'avatar_image', maxCount:1}]), c.createGroup);
router.put('/:id', auth, upload.fields([{name:'cover_image', maxCount:1},{name:'avatar_image', maxCount:1}]), c.updateGroup);
router.delete('/:id', auth, c.deleteGroup);

// Members
router.get('/:id/members', auth, c.getGroupMembers);
router.post('/:id/join', auth, c.joinGroup);
router.delete('/:id/leave', auth, c.leaveGroup);
router.put('/:id/members/role', auth, c.updateMemberRole);
router.get('/:id/pending', auth, c.getPendingMembers);
router.post('/:id/approve', auth, c.approveMember);

// Posts
router.get('/:id/posts', auth, c.getGroupPosts);
router.post('/:id/posts', auth, upload.single('media'), c.createGroupPost);
router.put('/:id/posts/:postId', auth, c.updateGroupPost);
router.delete('/:id/posts/:postId', auth, c.deleteGroupPost);
router.post('/:id/posts/:postId/pin', auth, c.pinPost);
router.post('/:id/posts/:postId/react', auth, c.reactPost);
router.post('/:id/posts/:postId/comment', auth, c.commentPost);
router.get('/:id/posts/:postId/comments', auth, c.getPostComments);
router.delete('/:id/posts/:postId/comments/:cid', auth, c.deleteGroupPostComment);
router.post('/:id/posts/:postId/report', auth, c.reportPost);

// Chat
router.get('/:id/messages', auth, c.getGroupMessages);
router.post('/:id/messages', auth, upload.single('file'), c.sendGroupMessage);
router.delete('/:id/messages/:mid', auth, c.deleteGroupMessage);

// Events
router.get('/:id/events', auth, c.getGroupEvents);
router.post('/:id/events', auth, upload.single('cover_image'), c.createGroupEvent);
router.delete('/:id/events/:eid', auth, c.deleteGroupEvent);
router.post('/:id/events/:eventId/rsvp', auth, c.rsvpEvent);

// Files
router.get('/:id/files', auth, c.getGroupFiles);
router.post('/:id/files', auth, upload.single('file'), c.uploadGroupFile);
router.delete('/:id/files/:fid', auth, c.deleteGroupFile);

// Polls
router.post('/:id/polls', auth, c.createGroupPoll);
router.get('/:id/polls', auth, c.getGroupPolls);
router.post('/:id/polls/:pollId/vote', auth, c.voteGroupPoll);
router.delete('/:id/polls/:pid', auth, c.deleteGroupPoll);

// Invites
router.post('/:id/invites', auth, c.createInvite);
router.get('/:id/invites', auth, c.getInvites);

// Moderation & Analytics
router.get('/:id/reports', auth, c.getReports);
router.get('/:id/activity', auth, c.getActivityLog);
router.get('/:id/analytics', auth, c.getGroupAnalytics);
router.get('/:id/topics', auth, c.getGroupTopics);

module.exports=router;
