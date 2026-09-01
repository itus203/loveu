exports.getReels = async (req, res) => {
    try {
        const reels = await global.db.all(`
            SELECT r.*, u.fullName, u.profilePicture,
                (SELECT COUNT(*) FROM reel_likes rl WHERE rl.reel_id = r.id) as likeCount,
                (SELECT COUNT(*) FROM reel_comments rc WHERE rc.reel_id = r.id) as commentCount,
                (SELECT COUNT(*) FROM reel_likes rl WHERE rl.reel_id = r.id AND rl.user_id = ?) as isLiked
            FROM reels r
            JOIN users u ON r.user_id = u.id
            ORDER BY r.created_at DESC
            LIMIT 50
        `, [req.user.id]);
        res.json(reels);
    } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.createReel = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: 'Video file required' });
        const { caption } = req.body;
        const videoUrl = `/uploads/${req.file.filename}`;
        const result = await global.db.run(
            'INSERT INTO reels (user_id, videoUrl, caption) VALUES (?,?,?)',
            [req.user.id, videoUrl, caption || '']
        );
        const reel = await global.db.get(
            'SELECT r.*, u.fullName, u.profilePicture FROM reels r JOIN users u ON r.user_id=u.id WHERE r.id=?',
            [result.lastID]
        );
        res.status(201).json(reel);
    } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.likeReel = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const existing = await global.db.get('SELECT id FROM reel_likes WHERE reel_id=? AND user_id=?', [id, userId]);
        if (existing) {
            await global.db.run('DELETE FROM reel_likes WHERE reel_id=? AND user_id=?', [id, userId]);
            res.json({ action: 'unliked' });
        } else {
            await global.db.run('INSERT INTO reel_likes (reel_id, user_id) VALUES (?,?)', [id, userId]);
            res.json({ action: 'liked' });
        }
    } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.getReelComments = async (req, res) => {
    try {
        const comments = await global.db.all(
            'SELECT rc.*, u.fullName, u.profilePicture FROM reel_comments rc JOIN users u ON rc.user_id=u.id WHERE rc.reel_id=? ORDER BY rc.created_at ASC',
            [req.params.id]
        );
        res.json(comments);
    } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.addReelComment = async (req, res) => {
    try {
        const { content } = req.body;
        if (!content) return res.status(400).json({ message: 'Comment required' });
        const result = await global.db.run(
            'INSERT INTO reel_comments (reel_id, user_id, content) VALUES (?,?,?)',
            [req.params.id, req.user.id, content]
        );
        const comment = await global.db.get(
            'SELECT rc.*, u.fullName FROM reel_comments rc JOIN users u ON rc.user_id=u.id WHERE rc.id=?',
            [result.lastID]
        );
        res.status(201).json(comment);
    } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.deleteReel = async (req, res) => {
    try {
        const reel = await global.db.get('SELECT user_id, caption FROM reels WHERE id=?', [req.params.id]);
        if (!reel) return res.status(404).json({ message: 'Reel not found' });
        if (String(reel.user_id) !== String(req.user.id) && req.user.role !== 'Admin') return res.status(403).json({ message: 'Not authorized' });
        await global.db.run('DELETE FROM reels WHERE id=?', [req.params.id]);
        try { await global.db.run('DELETE FROM reel_likes WHERE reel_id=?', [req.params.id]); } catch {}
        try { await global.db.run('DELETE FROM reel_comments WHERE reel_id=?', [req.params.id]); } catch {}
        if (req.user.role === 'Admin' && String(reel.user_id) !== String(req.user.id)) {
            try {
                const adminUser = await global.db.get('SELECT fullName FROM users WHERE id=?', [req.user.id]);
                const adminName = adminUser?.fullName || 'Admin';
                const dateStr = new Date().toLocaleDateString('en-GB');
                const msg = `Your reel "${(reel.caption||'').slice(0,40)}" was deleted by Admin ${adminName} on ${dateStr}`;
                await global.db.run('INSERT INTO notifications (recipient_id, sender_id, type, message) VALUES (?,?,?,?)', [reel.user_id, req.user.id, 'admin_delete', msg]);
                const io = req.app.get('io'); const onlineUsers = req.app.get('onlineUsers');
                if (io && onlineUsers) { const sock = onlineUsers.get(String(reel.user_id)); if (sock) io.to(sock).emit('new_notification', { message: msg, type: 'admin_delete' }); }
            } catch {}
        }
        res.json({ message: 'Reel deleted' });
    } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.updateReel = async (req, res) => {
    try {
        const reel = await global.db.get('SELECT user_id FROM reels WHERE id=?', [req.params.id]);
        if (!reel) return res.status(404).json({ message: 'Reel not found' });
        if (String(reel.user_id) !== String(req.user.id) && req.user.role !== 'Admin') return res.status(403).json({ message: 'Not authorized' });
        const { caption } = req.body;
        if (caption === undefined) return res.status(400).json({ message: 'Caption required' });
        await global.db.run('UPDATE reels SET caption=? WHERE id=?', [caption, req.params.id]);
        const updated = await global.db.get('SELECT r.*, u.fullName, u.profilePicture FROM reels r JOIN users u ON r.user_id=u.id WHERE r.id=?', [req.params.id]);
        res.json({ message: 'Reel updated', reel: updated });
    } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.deleteReelComment = async (req, res) => {
    try {
        const comment = await global.db.get('SELECT * FROM reel_comments WHERE id=?', [req.params.cid]);
        if (!comment) return res.status(404).json({ message: 'Comment not found' });
        const reel = await global.db.get('SELECT user_id FROM reels WHERE id=?', [comment.reel_id]);
        const isOwner = String(comment.user_id) === String(req.user.id);
        const isReelOwner = reel && String(reel.user_id) === String(req.user.id);
        const isAdmin = req.user.role === 'Admin';
        if (!isOwner && !isReelOwner && !isAdmin) return res.status(403).json({ message: 'Not authorized' });
        await global.db.run('DELETE FROM reel_comments WHERE id=?', [req.params.cid]);
        if (isAdmin && String(comment.user_id) !== String(req.user.id)) {
            try {
                const adminUser = await global.db.get('SELECT fullName FROM users WHERE id=?', [req.user.id]);
                const adminName = adminUser?.fullName || 'Admin';
                const dateStr = new Date().toLocaleDateString('en-GB');
                const msg = `Your reel comment "${(comment.content||'').slice(0,40)}" was deleted by Admin ${adminName} on ${dateStr}`;
                await global.db.run('INSERT INTO notifications (recipient_id, sender_id, type, message) VALUES (?,?,?,?)', [comment.user_id, req.user.id, 'admin_delete', msg]);
                const io = req.app.get('io'); const onlineUsers = req.app.get('onlineUsers');
                if (io && onlineUsers) { const sock = onlineUsers.get(String(comment.user_id)); if (sock) io.to(sock).emit('new_notification', { message: msg, type: 'admin_delete' }); }
            } catch {}
        }
        res.json({ message: 'Reel comment deleted' });
    } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.updateReelComment = async (req, res) => {
    try {
        const comment = await global.db.get('SELECT * FROM reel_comments WHERE id=?', [req.params.cid]);
        if (!comment) return res.status(404).json({ message: 'Comment not found' });
        if (String(comment.user_id) !== String(req.user.id) && req.user.role !== 'Admin') return res.status(403).json({ message: 'Not authorized' });
        const { content } = req.body;
        if (!content || !content.trim()) return res.status(400).json({ message: 'Content required' });
        await global.db.run('UPDATE reel_comments SET content=? WHERE id=?', [content.trim(), req.params.cid]);
        const updated = await global.db.get('SELECT rc.*, u.fullName FROM reel_comments rc JOIN users u ON rc.user_id=u.id WHERE rc.id=?', [req.params.cid]);
        res.json({ message: 'Comment updated', comment: updated });
    } catch (e) { res.status(500).json({ message: e.message }); }
};
