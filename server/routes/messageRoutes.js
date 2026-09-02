const router = require('express').Router();
const auth = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

const c = require('../controllers/messageController');

// ─── Conversations & Messages ───────────────────────────────────────────
router.get('/conversations', auth, c.getConversations);
router.get('/search', auth, c.searchMessages);
router.get('/media/:userId', auth, c.getMedia);
router.get('/pinned/:conversationId', auth, c.getPinnedMessages);
router.get('/reactions/:id', auth, c.getReactions);
router.get('/link-preview', auth, c.linkPreview);
router.get('/requests', auth, c.getMessageRequests);
router.post('/requests/handle', auth, c.handleMessageRequest);
router.get('/blocked', auth, c.getBlockedUsers);
router.post('/block/:userId', auth, c.blockUser);
router.delete('/block/:userId', auth, c.unblockUser);
router.post('/archive', auth, c.toggleArchive);
router.post('/mute', auth, c.toggleMute);
router.post('/forward', auth, c.forwardMessage);
router.put('/delivered/:userId', auth, c.markDelivered);
router.put('/read/:userId', auth, c.markMessagesRead);
router.get('/:userId', auth, c.getMessages);
router.post('/', auth, c.sendMessage);
router.put('/:id', auth, c.editMessage);
router.delete('/:id', auth, c.deleteMessage);
router.post('/:id/react', auth, c.reactMessage);
router.post('/:id/pin', auth, c.pinMessage);
router.delete('/:id/pin', auth, c.unpinMessage);

// ─── Groups ─────────────────────────────────────────────────────────────
router.post('/group', auth, c.createGroup);
router.get('/group/:groupId', auth, c.getGroupInfo);
router.put('/group/:groupId', auth, c.updateGroup);
router.post('/group/:groupId/member', auth, c.manageGroupMember);
router.post('/group/:groupId/leave', auth, c.leaveGroup);

// ─── Uploads ────────────────────────────────────────────────────────────
router.post('/image', auth, upload.single('image'), c.sendImageMessage);
router.post('/audio', auth, upload.single('audio'), c.sendImageMessage);
router.post('/video', auth, upload.single('video'), c.sendImageMessage);

router.post('/file', auth, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
        const { receiverId, isGroup } = req.body;
        if (!receiverId) return res.status(400).json({ message: 'receiverId required' });
        const mediaUrl = req.file.path || req.file.secure_url || req.file.url || `/uploads/${req.file.filename}`;
        const fileName = req.file.originalname;
        const fileSize = req.file.size > 1024*1024 ? (req.file.size/1024/1024).toFixed(1)+'MB' : Math.round(req.file.size/1024)+'KB';
        const content = `[FILE]:${mediaUrl}|${fileName}|${fileSize}`;

        if (isGroup === 'true') {
            const result = await global.db.run('INSERT INTO group_messages (group_id, sender_id, content, message_type, file_name, file_size, file_url) VALUES (?,?,?,?,?,?,?)', [receiverId, req.user.id, content, 'file', fileName, fileSize, mediaUrl]);
            const msg = await global.db.get('SELECT * FROM group_messages WHERE id=?', [result.lastID]);
            msg.isGroup = true;
            const io = req.app.get('io');
            if (io) io.to('group_' + receiverId).emit('receive_message', msg);
            return res.status(201).json({ message: msg });
        } else {
            // block check
            const blocked = await global.db.get(`SELECT 1 FROM blocked_users WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?)`, [req.user.id, receiverId, receiverId, req.user.id]);
            if (blocked) return res.status(403).json({message:'Blocked'});
            const result = await global.db.run('INSERT INTO messages (sender_id, receiver_id, content, message_type, status, file_name, file_size, file_url) VALUES (?,?,?,?,?,?,?,?)', [req.user.id, receiverId, content, 'file', 'sent', fileName, fileSize, mediaUrl]);
            const msg = await global.db.get('SELECT * FROM messages WHERE id=?', [result.lastID]);
            const io = req.app.get('io');
            const onlineUsers = req.app.get('onlineUsers');
            if (io && onlineUsers) {
                const sock = onlineUsers.get(String(receiverId));
                if (sock) {
                    await global.db.run(`UPDATE messages SET status='delivered', delivered_at=CURRENT_TIMESTAMP WHERE id=?`, [msg.id]);
                    msg.status='delivered';
                    io.to(sock).emit('receive_message', msg);
                }
            }
            return res.status(201).json({ message: msg });
        }
    } catch (e) { console.error('file upload',e); res.status(500).json({ message: e.message }); }
});

module.exports = router;
