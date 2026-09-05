exports.toggleReaction = async (req, res) => {
    try {
        const { type } = req.body;
        const postId = req.params.postId;
        const userId = req.user.id;
        const validReaction = type || 'like';

        const existing = await global.db.get('SELECT * FROM reactions WHERE post_id=? AND user_id=?', [postId, userId]);
        if (existing) {
            if (existing.type === validReaction) {
                await global.db.run('DELETE FROM reactions WHERE id=?', [existing.id]);
                const counts = await global.db.all('SELECT type, COUNT(*) as count FROM reactions WHERE post_id=? GROUP BY type', [postId]);
                const total = counts.reduce((s, c) => s + c.count, 0);
                const io = req.app.get('io');
                if (io) io.emit('reaction_update', { postId, counts, total });
                return res.json({ action: 'removed', type: validReaction, total, counts });
            } else {
                await global.db.run('UPDATE reactions SET type=? WHERE id=?', [validReaction, existing.id]);
                const counts = await global.db.all('SELECT type, COUNT(*) as count FROM reactions WHERE post_id=? GROUP BY type', [postId]);
                const total = counts.reduce((s, c) => s + c.count, 0);
                const io = req.app.get('io');
                if (io) io.emit('reaction_update', { postId, counts, total });
                return res.json({ action: 'changed', type: validReaction, total, counts });
            }
        }

        await global.db.run('INSERT INTO reactions (post_id, user_id, type) VALUES (?,?,?)', [postId, userId, validReaction]);
        
        // Notify post owner if someone else reacted — with link to post
        const post = await global.db.get('SELECT user_id FROM posts WHERE id=?', [postId]);
        if (post && post.user_id !== userId) {
            const reactor = await global.db.get('SELECT * FROM users WHERE id=?', [userId]);
            const reactorName = reactor?.fullName || reactor?.fullname || 'Someone';
            const emojiMap = { like: '👍', love: '❤️', haha: '😂', wow: '😮', sad: '😢', angry: '😡' };
            const emoji = emojiMap[validReaction] || '👍';
            await global.db.run(
                'INSERT INTO notifications (recipient_id, sender_id, type, message, link) VALUES (?,?,?,?,?)',
                [post.user_id, userId, 'reaction', `${reactorName} reacted ${emoji} to your post`, `home.html#post-${postId}`]
            );
            const io = req.app.get('io');
            const onlineUsers = req.app.get('onlineUsers');
            if (io && onlineUsers) {
                const recipientSocket = onlineUsers.get(String(post.user_id));
                if (recipientSocket) io.to(recipientSocket).emit('new_notification', { message: `${reactorName} reacted ${emoji} to your post`, type: 'reaction', link: `home.html#post-${postId}`, postId });
            }
        }

        const counts = await global.db.all('SELECT type, COUNT(*) as count FROM reactions WHERE post_id=? GROUP BY type', [postId]);
        const total = counts.reduce((s, c) => s + c.count, 0);
        const io = req.app.get('io');
        if (io) io.emit('reaction_update', { postId, counts, total });

        res.json({ action: 'added', type: validReaction, total, counts });
    } catch (e) { 
        console.error('toggleReaction error:', e);
        res.status(500).json({ message: e.message }); 
    }
};

// ✅ GET all people who reacted to a post with rich user details
exports.getReactions = async (req, res) => {
    try {
        const reactions = await global.db.all(`
            SELECT r.id as reactionId, r.type, r.created_at as reacted_at,
                   u.id as _id, u.id as userId, u.fullName, u.profilePicture, u.department, u.batch, u.role
            FROM reactions r 
            JOIN users u ON r.user_id = u.id 
            WHERE r.post_id = ?
            ORDER BY r.created_at DESC
        `, [req.params.postId]);
        
        // Normalize PG lower-case columns for frontend
        reactions.forEach(r => {
            r.fullName = r.fullName || r.fullname || r.FullName || 'DIU Student';
            r.profilePicture = r.profilePicture || r.profilepicture;
            r.department = r.department || r.Department;
            r.batch = r.batch || r.Batch;
        });
        // Also compute summary counts
        const summary = {};
        reactions.forEach(r => {
            summary[r.type] = (summary[r.type] || 0) + 1;
        });

        res.json({
            total: reactions.length,
            summary,
            reactions
        });
    } catch (e) { 
        console.error('getReactions error:', e);
        res.status(500).json({ message: e.message }); 
    }
};
