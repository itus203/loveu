function normPost(p){ if(!p) return p; p._id=p._id||p.id; p.id=p.id||p._id; p.fullName=p.fullName||p.fullname; p.profilePicture=p.profilePicture||p.profilepicture; p.mediaUrl=p.mediaUrl||p.mediaurl; p.mediaType=p.mediaType||p.mediatype; p.created_at=p.created_at||p.createdAt||p.createdat; p.createdAt=p.createdAt||p.created_at; p.reactionCount=p.reactionCount??p.reactioncount; p.commentCount=p.commentCount??p.commentcount; p.myReaction=p.myReaction??p.myreaction; return p; }
function normUser(u){ if(!u) return u; u._id=u._id||u.id; u.fullName=u.fullName||u.fullname; u.profilePicture=u.profilePicture||u.profilepicture; return u; }
exports.createPost = async (req, res) => {
    try {
        const { content, visibility } = req.body;
        if (!content && !req.file) return res.status(400).json({ message: 'Post content or media is required' });
        let mediaUrl = null, mediaType = null;
        if (req.file) {
            mediaUrl = req.file.path || req.file.secure_url || req.file.url || `/uploads/${req.file.filename}`;
            mediaType = req.file.mimetype.startsWith('video') ? 'video' : 'image';
        }
        let mentionsJson = null;
        try {
            let m = req.body.mentions || req.body.taggedFriends || req.body.tags;
            if (m) {
                if (typeof m === 'string') { try{ m = JSON.parse(m); }catch{ m=[m]; } }
                if (!Array.isArray(m)) m=[m];
                if (m.length && typeof m[0] === 'object') mentionsJson = JSON.stringify(m);
                else if (m.length) {
                    // fetch names for ids
                    const objs = [];
                    for (const id of m) {
                        const u = await global.db.get('SELECT id as _id, fullName, profilePicture FROM users WHERE id=?', [id]);
                        if (u) objs.push({ id: String(u._id), name: u.fullName, profilePicture: u.profilePicture });
                        else objs.push({ id: String(id), name: String(id) });
                    }
                    mentionsJson = JSON.stringify(objs);
                }
            }
        } catch {}
        const result = await global.db.run(
            'INSERT INTO posts (user_id, content, mediaUrl, mediaType, visibility, mentions) VALUES (?, ?, ?, ?, ?, ?)',
            [req.user.id, content || '', mediaUrl, mediaType, visibility || 'Public', mentionsJson]
        );
        let post = await global.db.get(
            'SELECT p.*, u.fullName, u.profilePicture, p.is_exclusive FROM posts p JOIN users u ON p.user_id=u.id WHERE p.id=?',
            [result.lastID]
        );
        post = normPost(post);
        post.user = { fullName: post.fullName, profilePicture: post.profilePicture, _id: post.user_id };
        
        // Notify friends via socket
        const io = req.app.get('io');
        if (io) io.emit('new_post', post);

        // ── Tag / Mention notifications ──
        try {
            let mentions = req.body.mentions || req.body.taggedFriends || req.body.tags;
            if (mentions) {
                if (typeof mentions === 'string') { try{ mentions = JSON.parse(mentions); }catch{ mentions = [mentions]; } }
                if (!Array.isArray(mentions)) mentions = [mentions];
                const uniqueIds = [...new Set(mentions.map(id=> String(id)).filter(id=> id && String(id)!==String(req.user.id)))];
                const sender = await global.db.get('SELECT fullName FROM users WHERE id=?', [req.user.id]);
                const senderName = sender?.fullName || 'Someone';
                for (const mid of uniqueIds) {
                    const target = await global.db.get('SELECT id FROM users WHERE id=?', [mid]);
                    if (!target) continue;
                    const msg = `${senderName} tagged you in a post`;
                    await global.db.run('INSERT INTO notifications (recipient_id, sender_id, type, message, link) VALUES (?,?,?,?,?)', [mid, req.user.id, 'tag', msg, `home.html#post-${post.id}`]);
                    const onlineUsers = req.app.get('onlineUsers');
                    if (onlineUsers) {
                        const sock = onlineUsers.get(String(mid));
                        if (sock && io) io.to(sock).emit('new_notification', { message: msg, type: 'tag', postId: post.id, senderId: req.user.id });
                    }
                }
                // Also parse @mentions in content as fallback (e.g., "@Salman Farsi")
                if (content && content.includes('@')) {
                    const atNames = [...content.matchAll(/@([A-Za-z\u0980-\u09FF]+(?: [A-Za-z\u0980-\u09FF]+)?)/g)].map(m=>m[1].trim()).filter(Boolean);
                    for (const name of atNames) {
                        const users = await global.db.all('SELECT id, fullName FROM users WHERE fullName LIKE ? LIMIT 3', [`%${name}%`]);
                        for (const u of users) {
                            if (String(u.id)===String(req.user.id) || uniqueIds.includes(String(u.id))) continue;
                            const msg2 = `${senderName} mentioned you in a post: "${(content||'').slice(0,40)}"`;
                            await global.db.run('INSERT INTO notifications (recipient_id, sender_id, type, message, link) VALUES (?,?,?,?,?)', [u.id, req.user.id, 'mention', msg2, `home.html#post-${post.id}`]);
                            const onlineUsers2 = req.app.get('onlineUsers');
                            if (onlineUsers2) {
                                const sock2 = onlineUsers2.get(String(u.id));
                                if (sock2 && io) io.to(sock2).emit('new_notification', { message: msg2, type: 'mention', postId: post.id });
                            }
                        }
                    }
                }
            } else if (content && content.includes('@')) {
                // Fallback if no explicit mentions array but content has @
                const sender = await global.db.get('SELECT fullName FROM users WHERE id=?', [req.user.id]);
                const senderName = sender?.fullName || 'Someone';
                const atNames = [...content.matchAll(/@([A-Za-z\u0980-\u09FF]+(?: [A-Za-z\u0980-\u09FF]+)?)/g)].map(m=>m[1].trim()).filter(Boolean);
                for (const name of atNames) {
                    const users = await global.db.all('SELECT id FROM users WHERE fullName LIKE ? LIMIT 3', [`%${name}%`]);
                    for (const u of users) {
                        if (String(u.id)===String(req.user.id)) continue;
                        const msg2 = `${senderName} mentioned you in a post`;
                        await global.db.run('INSERT INTO notifications (recipient_id, sender_id, type, message, link) VALUES (?,?,?,?,?)', [u.id, req.user.id, 'mention', msg2, `home.html#post-${post.id}`]);
                        const onlineUsers2 = req.app.get('onlineUsers');
                        if (onlineUsers2) {
                            const sock2 = onlineUsers2.get(String(u.id));
                            if (sock2 && io) io.to(sock2).emit('new_notification', { message: msg2, type: 'mention', postId: post.id });
                        }
                    }
                }
            }
        } catch {}
        
        res.status(201).json({ message: 'Post created', post });
    } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.getFeed = async (req, res) => {
    try {
        const userId = req.user.id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 15;
        const offset = (page - 1) * limit;

        // Visibility-aware feed: public posts + own posts + friends' posts if visibility=Friends
        const posts = await global.db.all(`
            SELECT p.*, u.fullName, u.profilePicture, p.is_exclusive,
                (SELECT COUNT(*) FROM reactions r WHERE r.post_id = p.id) as reactionCount,
                (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) as commentCount,
                (SELECT type FROM reactions r WHERE r.post_id=p.id AND r.user_id=?) as myReaction,
                (SELECT COUNT(*) FROM saved_posts sp WHERE sp.post_id=p.id AND sp.user_id=?) as isSaved
            FROM posts p
            JOIN users u ON p.user_id = u.id
            WHERE
                p.visibility = 'Public'
                OR p.user_id = ?
                OR (
                    p.visibility = 'Friends'
                    AND EXISTS (
                        SELECT 1 FROM friends f
                        WHERE (f.user1_id=? AND f.user2_id=p.user_id)
                           OR (f.user2_id=? AND f.user1_id=p.user_id)
                    )
                )
            ORDER BY p.created_at DESC
            LIMIT ? OFFSET ?
        `, [userId, userId, userId, userId, userId, limit, offset]);

        for (let p of posts) {
            normPost(p);
            p.user = { fullName: p.fullName, profilePicture: p.profilePicture, _id: p.user_id };
            try { p.mentions = p.mentions ? JSON.parse(p.mentions) : []; if(!Array.isArray(p.mentions)) p.mentions=[]; } catch { p.mentions=[]; }
            // parse comment mentions if needed later
        }
        res.status(200).json(posts);
    } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.getPost = async (req, res) => {
    try {
        let post = await global.db.get(
            'SELECT p.*, u.fullName, u.profilePicture, p.is_exclusive FROM posts p JOIN users u ON p.user_id=u.id WHERE p.id=?',
            [req.params.id]
        );
        if (!post) return res.status(404).json({ message: 'Post not found' });
        post = normPost(post);
        post.user = { fullName: post.fullName, profilePicture: post.profilePicture, _id: post.user_id };
        try { post.mentions = post.mentions ? JSON.parse(post.mentions) : []; if(!Array.isArray(post.mentions)) post.mentions=[]; } catch { post.mentions=[]; }
        post.comments = await global.db.all(
            'SELECT c.*, u.fullName, u.profilePicture FROM comments c JOIN users u ON c.user_id=u.id WHERE c.post_id=? ORDER BY c.created_at ASC',
            [post.id]
        );
        for (let c of post.comments) { try{ c.mentions = c.mentions ? JSON.parse(c.mentions) : []; if(!Array.isArray(c.mentions)) c.mentions=[]; }catch{ c.mentions=[]; } }
        post.reactions = await global.db.all(
            'SELECT r.type, u.fullName, u.profilePicture FROM reactions r JOIN users u ON r.user_id=u.id WHERE r.post_id=?',
            [post.id]
        );
        res.status(200).json(post);
    } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.deletePost = async (req, res) => {
    try {
        const post = await global.db.get('SELECT * FROM posts WHERE id=?', [req.params.id]);
        if (!post) return res.status(404).json({ message: 'Post not found' });
        if (String(post.user_id) !== String(req.user.id) && req.user.role !== 'Admin') {
            return res.status(403).json({ message: 'Not authorized' });
        }
        await global.db.run('DELETE FROM posts WHERE id=?', [req.params.id]);
        if (req.user.role === 'Admin' && String(post.user_id) !== String(req.user.id)) {
            try {
                const adminUser = await global.db.get('SELECT fullName FROM users WHERE id=?', [req.user.id]);
                const adminName = adminUser?.fullName || 'Admin';
                const dateStr = new Date().toLocaleDateString('en-GB');
                const msg = `Your post "${(post.content||'').slice(0,40)}" was deleted by Admin ${adminName} on ${dateStr}`;
                await global.db.run('INSERT INTO notifications (recipient_id, sender_id, type, message) VALUES (?,?,?,?)', [post.user_id, req.user.id, 'admin_delete', msg]);
                const io = req.app.get('io'); const onlineUsers = req.app.get('onlineUsers');
                if (io && onlineUsers) { const sock = onlineUsers.get(String(post.user_id)); if (sock) io.to(sock).emit('new_notification', { message: msg, type: 'admin_delete' }); }
            } catch {}
        }
        res.status(200).json({ message: 'Post deleted' });
    } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.updatePost = async (req, res) => {
    try {
        const post = await global.db.get('SELECT * FROM posts WHERE id=?', [req.params.id]);
        if (!post) return res.status(404).json({ message: 'Post not found' });
        if (String(post.user_id) !== String(req.user.id) && req.user.role !== 'Admin') {
            return res.status(403).json({ message: 'Not authorized to edit' });
        }
        const { content } = req.body;
        if (!content || !content.trim()) return res.status(400).json({ message: 'Content cannot be empty' });
        await global.db.run('UPDATE posts SET content=? WHERE id=?', [content.trim(), req.params.id]);
        let updated = await global.db.get('SELECT p.*, u.fullName, u.profilePicture FROM posts p JOIN users u ON p.user_id=u.id WHERE p.id=?', [req.params.id]);
        updated = normPost(updated);
        updated.user = { fullName: updated.fullName, profilePicture: updated.profilePicture, _id: updated.user_id };
        res.json({ message: 'Post updated', post: updated });
    } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.deleteComment = async (req, res) => {
    try {
        const comment = await global.db.get('SELECT * FROM comments WHERE id=?', [req.params.cid]);
        if (!comment) return res.status(404).json({ message: 'Comment not found' });
        const post = await global.db.get('SELECT user_id FROM posts WHERE id=?', [comment.post_id]);
        const isOwner = String(comment.user_id) === String(req.user.id);
        const isPostOwner = post && String(post.user_id) === String(req.user.id);
        const isAdmin = req.user.role === 'Admin';
        if (!isOwner && !isPostOwner && !isAdmin) return res.status(403).json({ message: 'Not authorized' });
        await global.db.run('DELETE FROM comments WHERE id=?', [req.params.cid]);
        if (isAdmin && String(comment.user_id) !== String(req.user.id)) {
            try {
                const adminUser = await global.db.get('SELECT fullName FROM users WHERE id=?', [req.user.id]);
                const adminName = adminUser?.fullName || 'Admin';
                const dateStr = new Date().toLocaleDateString('en-GB');
                const msg = `Your comment "${(comment.content||'').slice(0,40)}" was deleted by Admin ${adminName} on ${dateStr}`;
                await global.db.run('INSERT INTO notifications (recipient_id, sender_id, type, message) VALUES (?,?,?,?)', [comment.user_id, req.user.id, 'admin_delete', msg]);
                const io = req.app.get('io'); const onlineUsers = req.app.get('onlineUsers');
                if (io && onlineUsers) { const sock = onlineUsers.get(String(comment.user_id)); if (sock) io.to(sock).emit('new_notification', { message: msg, type: 'admin_delete' }); }
            } catch {}
        }
        res.json({ message: 'Comment deleted' });
    } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.updateComment = async (req, res) => {
    try {
        const comment = await global.db.get('SELECT * FROM comments WHERE id=?', [req.params.cid]);
        if (!comment) return res.status(404).json({ message: 'Comment not found' });
        if (String(comment.user_id) !== String(req.user.id) && req.user.role !== 'Admin') return res.status(403).json({ message: 'Not authorized' });
        const { content } = req.body;
        if (!content || !content.trim()) return res.status(400).json({ message: 'Content required' });
        await global.db.run('UPDATE comments SET content=? WHERE id=?', [content.trim(), req.params.cid]);
        const updated = await global.db.get('SELECT c.*, u.fullName, u.profilePicture FROM comments c JOIN users u ON c.user_id=u.id WHERE c.id=?', [req.params.cid]);
        res.json({ message: 'Comment updated', comment: updated });
    } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.getUserPosts = async (req, res) => {
    try {
        const targetUserId = req.params.userId || req.user.id;
        const posts = await global.db.all(
            'SELECT p.*, u.fullName, u.profilePicture, p.is_exclusive FROM posts p JOIN users u ON p.user_id=u.id WHERE p.user_id=? ORDER BY p.created_at DESC',
            [targetUserId]
        );
        for (let p of posts) {
            normPost(p);
            p.user = { fullName: p.fullName, profilePicture: p.profilePicture, _id: p.user_id };
            try { p.mentions = p.mentions ? JSON.parse(p.mentions) : []; if(!Array.isArray(p.mentions)) p.mentions=[]; } catch { p.mentions=[]; }
        }
        res.status(200).json(posts);
    } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.addComment = async (req, res) => {
    try {
        const { content, is_exclusive } = req.body;
        if (!content) return res.status(400).json({ message: 'Comment content required' });
        let mentionsJson = null;
        try {
            let m = req.body.mentions;
            if (m) {
                if (typeof m === 'string') { try{ m = JSON.parse(m); }catch{ m=[m]; } }
                if (!Array.isArray(m)) m=[m];
                if (m.length && typeof m[0] === 'object') mentionsJson = JSON.stringify(m);
                else if (m.length) {
                    const objs=[];
                    for(const id of m){ const u=await global.db.get('SELECT id as _id, fullName FROM users WHERE id=?',[id]); if(u) objs.push({id:String(u._id), name:u.fullName}); else objs.push({id:String(id), name:String(id)}); }
                    mentionsJson = JSON.stringify(objs);
                }
            }
        } catch {}
        const result = await global.db.run(
            'INSERT INTO comments (post_id, user_id, content, mentions) VALUES (?,?,?,?)',
            [req.params.id, req.user.id, content, mentionsJson]
        );
        let comment = await global.db.get(
            'SELECT c.*, u.fullName, u.profilePicture FROM comments c JOIN users u ON c.user_id=u.id WHERE c.id=?',
            [result.lastID]
        );
        comment = normPost(comment); // re-use norm for comment user fields
        // Notify post owner — with link to post
        const post = await global.db.get('SELECT user_id FROM posts WHERE id=?', [req.params.id]);
        if (post && String(post.user_id) !== String(req.user.id)) {
            const commenter = await global.db.get('SELECT fullName FROM users WHERE id=?', [req.user.id]);
            await global.db.run(
                'INSERT INTO notifications (recipient_id, sender_id, type, message, link) VALUES (?,?,?,?,?)',
                [post.user_id, req.user.id, 'comment', `${commenter.fullName} commented on your post`, `home.html#post-${req.params.id}`]
            );
            const io = req.app.get('io');
            const onlineUsers = req.app.get('onlineUsers');
            if (io && onlineUsers) {
                const recipientSocket = onlineUsers.get(String(post.user_id));
                if (recipientSocket) io.to(recipientSocket).emit('new_notification', { message: `${commenter.fullName} commented on your post`, type: 'comment', link: `home.html#post-${req.params.id}`, postId: req.params.id });
            }
        }
        // ── Mention notifications in comment (FB-like) ──
        try {
            let mentions = req.body.mentions;
            const io = req.app.get('io');
            const onlineUsers = req.app.get('onlineUsers');
            const sender = await global.db.get('SELECT fullName FROM users WHERE id=?', [req.user.id]);
            const senderName = sender?.fullName || 'Someone';
            let mentionIds = [];
            if (mentions) {
                if (typeof mentions === 'string') { try{ mentions = JSON.parse(mentions); }catch{ mentions=[mentions]; } }
                if (!Array.isArray(mentions)) mentions=[mentions];
                mentionIds = [...new Set(mentions.map(id=>String(id)).filter(id=> id && String(id)!==String(req.user.id) && String(id)!==String(post?.user_id)))];
                for (const mid of mentionIds) {
                    const msg = `${senderName} mentioned you in a comment: "${content.slice(0,40)}"`;
                    await global.db.run('INSERT INTO notifications (recipient_id, sender_id, type, message, link) VALUES (?,?,?,?,?)', [mid, req.user.id, 'mention', msg, `home.html#post-${req.params.id}`]);
                    if (onlineUsers) {
                        const sock = onlineUsers.get(String(mid));
                        if (sock && io) io.to(sock).emit('new_notification', { message: msg, type: 'mention', postId: req.params.id });
                    }
                }
            }
            // Fallback parse @ in content
            if (content && content.includes('@')) {
                const atNames = [...content.matchAll(/@([A-Za-z\u0980-\u09FF]+(?: [A-Za-z\u0980-\u09FF]+)?)/g)].map(m=>m[1].trim()).filter(Boolean);
                for (const name of atNames) {
                    const users = await global.db.all('SELECT id FROM users WHERE fullName LIKE ? LIMIT 3', [`%${name}%`]);
                    for (const u of users) {
                        if (String(u.id)===String(req.user.id) || String(u.id)===String(post?.user_id) || mentionIds.includes(String(u.id))) continue;
                        const msg2 = `${senderName} mentioned you in a comment`;
                        await global.db.run('INSERT INTO notifications (recipient_id, sender_id, type, message, link) VALUES (?,?,?,?,?)', [u.id, req.user.id, 'mention', msg2, `home.html#post-${req.params.id}`]);
                        if (onlineUsers) {
                            const sock2 = onlineUsers.get(String(u.id));
                            if (sock2 && io) io.to(sock2).emit('new_notification', { message: msg2, type: 'mention', postId: req.params.id });
                        }
                    }
                }
            }
        } catch {}
        const io2 = req.app.get('io');
        if (io2) io2.emit('new_comment', { postId: req.params.id, comment });
        res.status(201).json(comment);
    } catch (e) { res.status(500).json({ message: e.message }); }
};

// ─── Any user can report a post ──────────────────────────────────────────────
exports.reportPost = async (req, res) => {
    try {
        const { reason, details } = req.body;
        if (!reason) return res.status(400).json({ message: 'A reason is required to report this post' });

        const post = await global.db.get('SELECT id, user_id FROM posts WHERE id=?', [req.params.id]);
        if (!post) return res.status(404).json({ message: 'Post not found' });

        // Prevent self-reporting
        if (post.user_id === req.user.id) {
            return res.status(400).json({ message: 'You cannot report your own post' });
        }

        const reporter = await global.db.get('SELECT fullName FROM users WHERE id=?', [req.user.id]);

        await global.db.run(
            `INSERT INTO content_reports (reporter_id, reporter_name, target_type, target_id, reason, details)
             VALUES (?, ?, 'post', ?, ?, ?)`,
            [req.user.id, reporter?.fullName || '', req.params.id, reason, details || null]
        );

        // Notify all admins
        const admins = await global.db.all('SELECT id FROM users WHERE role="Admin"');
        for (const admin of admins) {
            await global.db.run(
                'INSERT INTO notifications (recipient_id, sender_id, type, message) VALUES (?,?,?,?)',
                [admin.id, req.user.id, 'report',
                 `New content report: Post #${req.params.id} reported for "${reason}" by ${reporter?.fullName || 'a user'}`]
            );
        }

        res.status(201).json({ message: 'Post reported to Admin. Our moderation team will review it shortly.' });
    } catch (e) { res.status(500).json({ message: e.message }); }
};

// ─── Admin-only: Flag a post for review ──────────────────────────────────────
exports.flagPost = async (req, res) => {
    try {
        if (req.user?.role !== 'Admin') {
            return res.status(403).json({ message: 'Admin access required' });
        }
        const { reason } = req.body;
        await global.db.run(
            `INSERT INTO posts_flagged (post_id, flagged_by, reason)
             VALUES (?, ?, ?)
             ON CONFLICT(post_id) DO UPDATE SET reason=excluded.reason, flagged_by=excluded.flagged_by`,
            [req.params.id, req.user.id, reason || 'Under admin review']
        );
        // Audit log
        await global.db.run(
            `INSERT INTO audit_logs (user_id, user_email, user_role, action, target_type, target_id, details, severity)
             VALUES (?, ?, ?, 'FLAG_POST', 'post', ?, ?, 'warning')`,
            [req.user.id, req.user.email, req.user.role, req.params.id, reason || 'Flagged by admin']
        );
        res.json({ message: `Post #${req.params.id} has been flagged for review` });
    } catch (e) { res.status(500).json({ message: e.message }); }
};

