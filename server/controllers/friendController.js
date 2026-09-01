exports.sendRequest = async (req, res) => {
    try {
        const receiverId = req.params.id;
        const senderId = req.user.id;
        if (String(receiverId) === String(senderId)) return res.status(400).json({ message: "You can't send a request to yourself" });

        // Check if already friends
        const alreadyFriends = await global.db.get(
            'SELECT id FROM friends WHERE (user1_id=? AND user2_id=?) OR (user1_id=? AND user2_id=?)',
            [senderId, receiverId, receiverId, senderId]
        );
        if (alreadyFriends) return res.status(400).json({ message: 'Already friends' });

        // Check for existing pending request (mine)
        const existing = await global.db.get(
            'SELECT id FROM friend_requests WHERE sender_id=? AND receiver_id=? AND status="pending"',
            [senderId, receiverId]
        );
        if (existing) return res.status(400).json({ message: 'Friend request already sent' });

        // If they already sent you a pending, tell to accept instead of duplicate
        const oppositePending = await global.db.get(
            'SELECT id FROM friend_requests WHERE sender_id=? AND receiver_id=? AND status="pending"',
            [receiverId, senderId]
        );
        if (oppositePending) return res.status(400).json({ message: 'This user already sent you a friend request. Please accept it from notifications.' });

        // Clean up old declined/cancelled so re-send always works (FB-like)
        await global.db.run(
            'DELETE FROM friend_requests WHERE ((sender_id=? AND receiver_id=?) OR (sender_id=? AND receiver_id=?)) AND status!="pending"',
            [senderId, receiverId, receiverId, senderId]
        );

        await global.db.run('INSERT INTO friend_requests (sender_id, receiver_id) VALUES (?,?)', [senderId, receiverId]);

        const sender = await global.db.get('SELECT fullName FROM users WHERE id=?', [senderId]);
        await global.db.run(
            'INSERT INTO notifications (recipient_id, sender_id, type, message, link) VALUES (?,?,?,?,?)',
            [receiverId, senderId, 'friend_request', `${sender.fullName} sent you a friend request`, `views/profile.html?id=${senderId}`]
        );
        const io = req.app.get('io');
        const onlineUsers = req.app.get('onlineUsers');
        if (io && onlineUsers) {
            const recipientSocket = onlineUsers.get(String(receiverId));
            if (recipientSocket) io.to(recipientSocket).emit('new_notification', { message: `${sender.fullName} sent you a friend request`, type: 'friend_request', link: `views/profile.html?id=${senderId}` });
        }
        res.status(201).json({ message: 'Friend request sent' });
    } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.acceptRequest = async (req, res) => {
    try {
        const senderId = req.params.id; // sender's user id
        const receiverId = req.user.id;

        // Find by sender_id + receiver_id
        const request = await global.db.get(
            'SELECT * FROM friend_requests WHERE sender_id=? AND receiver_id=? AND status="pending"',
            [senderId, receiverId]
        );
        if (!request) return res.status(404).json({ message: 'Friend request not found' });

        await global.db.run('UPDATE friend_requests SET status="accepted" WHERE id=?', [request.id]);
        // Avoid duplicate friend entries
        const alreadyFriends = await global.db.get(
            'SELECT id FROM friends WHERE (user1_id=? AND user2_id=?) OR (user1_id=? AND user2_id=?)',
            [senderId, receiverId, receiverId, senderId]
        );
        if (!alreadyFriends) {
            await global.db.run('INSERT INTO friends (user1_id, user2_id) VALUES (?,?)', [senderId, receiverId]);
        }

        const accepter = await global.db.get('SELECT fullName FROM users WHERE id=?', [receiverId]);
        await global.db.run(
            'INSERT INTO notifications (recipient_id, sender_id, type, message, link) VALUES (?,?,?,?,?)',
            [senderId, receiverId, 'friend_accept', `${accepter.fullName} accepted your friend request`, `views/profile.html?id=${receiverId}`]
        );
        const io = req.app.get('io');
        const onlineUsers = req.app.get('onlineUsers');
        if (io && onlineUsers) {
            const senderSocket = onlineUsers.get(String(senderId));
            if (senderSocket) io.to(senderSocket).emit('new_notification', {
                message: `${accepter.fullName} accepted your friend request`, type: 'friend_accept', link: `views/profile.html?id=${receiverId}`
            });
        }
        res.status(200).json({ message: 'Friend request accepted' });
    } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.declineRequest = async (req, res) => {
    try {
        const otherId = req.params.id;
        const myId = req.user.id;
        // Works for both: receiver declining (sender=other, receiver=me) OR sender canceling (sender=me, receiver=other)
        // Delete pending so sender can re-send immediately (FB-like)
        const result = await global.db.run(
            'DELETE FROM friend_requests WHERE ((sender_id=? AND receiver_id=?) OR (sender_id=? AND receiver_id=?)) AND status="pending"',
            [otherId, myId, myId, otherId]
        );
        if (result.changes === 0) {
            // Fallback: also try to mark declined if delete didn't match (for audit)
            await global.db.run(
                'UPDATE friend_requests SET status="declined" WHERE (sender_id=? AND receiver_id=? OR sender_id=? AND receiver_id=?) AND status="pending"',
                [otherId, myId, myId, otherId]
            );
        }
        res.status(200).json({ message: 'Request removed' });
    } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.unfriend = async (req, res) => {
    try {
        const otherId = req.params.id;
        await global.db.run('DELETE FROM friends WHERE (user1_id=? AND user2_id=?) OR (user1_id=? AND user2_id=?)', [req.user.id, otherId, otherId, req.user.id]);
        res.status(200).json({ message: 'Unfriended' });
    } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.getFriends = async (req, res) => {
    try {
        const userId = req.params.userId || req.user.id;
        const friends = await global.db.all(`
            SELECT u.id as _id, u.fullName, u.profilePicture, u.department, u.batch FROM users u
            JOIN friends f ON (f.user1_id=u.id OR f.user2_id=u.id)
            WHERE (f.user1_id=? OR f.user2_id=?) AND u.id != ?
        `, [userId, userId, userId]);
        res.status(200).json(friends);
    } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.getPendingRequests = async (req, res) => {
    try {
        const requests = await global.db.all(`
            SELECT fr.id as requestId, fr.sender_id, fr.created_at,
                   u.id as _id, u.fullName, u.profilePicture, u.department, u.batch
            FROM friend_requests fr
            JOIN users u ON fr.sender_id = u.id
            WHERE fr.receiver_id=? AND fr.status='pending'
            ORDER BY fr.created_at DESC
        `, [req.user.id]);
        res.status(200).json(requests);
    } catch (e) { res.status(500).json({ message: e.message }); }
};

// GET /api/friends/status/:id — check friendship/request status with another user
exports.getFriendshipStatus = async (req, res) => {
    try {
        const otherId = req.params.id;
        const myId = req.user.id;

        const isFriend = await global.db.get(
            'SELECT id FROM friends WHERE (user1_id=? AND user2_id=?) OR (user1_id=? AND user2_id=?)',
            [myId, otherId, otherId, myId]
        );
        if (isFriend) return res.json({ status: 'friends' });

        const sentReq = await global.db.get(
            'SELECT id FROM friend_requests WHERE sender_id=? AND receiver_id=? AND status="pending"',
            [myId, otherId]
        );
        if (sentReq) return res.json({ status: 'sent' });

        const receivedReq = await global.db.get(
            'SELECT id FROM friend_requests WHERE sender_id=? AND receiver_id=? AND status="pending"',
            [otherId, myId]
        );
        if (receivedReq) return res.json({ status: 'received', senderId: otherId });

        res.json({ status: 'none' });
    } catch (e) { res.status(500).json({ message: e.message }); }
};
