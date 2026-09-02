exports.createChannel = async (req, res) => {
    try {
        const { name, description } = req.body;
        const cover_image = req.file ? (req.file.path || req.file.secure_url || req.file.url || `/uploads/${req.file.filename}`) : null;
        
        if (!name) return res.status(400).json({ message: 'Channel name required' });
        
        const result = await global.db.run(
            'INSERT INTO channels (name, description, cover_image, creator_id) VALUES (?,?,?,?)',
            [name, description, cover_image, req.user.id]
        );
        const channelId = result.lastID;
        
        // Add creator as owner
        await global.db.run(
            'INSERT INTO channel_members (channel_id, user_id, role) VALUES (?,?,?)',
            [channelId, req.user.id, 'owner']
        );
        
        res.status(201).json({ message: 'Channel created successfully', channelId });
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.getChannels = async (req, res) => {
    try {
        const channels = await global.db.all(`
            SELECT c.*, 
                (SELECT COUNT(*) FROM channel_members WHERE channel_id = c.id) as subscriberCount,
                cm.role as myRole
            FROM channels c
            LEFT JOIN channel_members cm ON c.id = cm.channel_id AND cm.user_id = ?
        `, [req.user.id]);
        res.json(channels);
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.getChannelPosts = async (req, res) => {
    try {
        const posts = await global.db.all(`
            SELECT cp.*, u.fullName as adminName, u.profilePicture as adminPic
            FROM channel_posts cp
            JOIN users u ON cp.admin_id = u.id
            WHERE cp.channel_id = ?
            ORDER BY cp.created_at DESC
        `, [req.params.id]);
        res.json(posts);
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.createPost = async (req, res) => {
    try {
        const { channel_id, content } = req.body;
        const mediaUrl = req.file ? (req.file.path || req.file.secure_url || req.file.url || `/uploads/${req.file.filename}`) : null;
        
        const member = await global.db.get('SELECT role FROM channel_members WHERE channel_id=? AND user_id=?', [channel_id, req.user.id]);
        if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
            return res.status(403).json({ message: 'Only admins can post in this channel' });
        }
        
        const result = await global.db.run(
            'INSERT INTO channel_posts (channel_id, admin_id, content, mediaUrl) VALUES (?,?,?,?)',
            [channel_id, req.user.id, content, mediaUrl]
        );
        
        const post = await global.db.get('SELECT cp.*, u.fullName as adminName, u.profilePicture as adminPic FROM channel_posts cp JOIN users u ON cp.admin_id = u.id WHERE cp.id=?', [result.lastID]);
        
        const io = req.app.get('io');
        if (io) io.to('channel_' + channel_id).emit('channel_post', post);
        
        res.status(201).json(post);
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.joinChannel = async (req, res) => {
    try {
        const channel_id = req.params.id;
        const existing = await global.db.get('SELECT * FROM channel_members WHERE channel_id=? AND user_id=?', [channel_id, req.user.id]);
        if (existing) return res.status(400).json({ message: 'Already joined' });
        
        await global.db.run('INSERT INTO channel_members (channel_id, user_id, role) VALUES (?,?,?)', [channel_id, req.user.id, 'follower']);
        res.json({ message: 'Joined channel successfully' });
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.updateChannel = async (req, res) => {
    try {
        const channel = await global.db.get('SELECT creator_id FROM channels WHERE id=?', [req.params.id]);
        if (!channel) return res.status(404).json({ message: 'Channel not found' });
        if (String(channel.creator_id) !== String(req.user.id) && req.user.role !== 'Admin') return res.status(403).json({ message: 'Not authorized' });
        const { name, description } = req.body;
        const fields=[], params=[];
        if(name!==undefined){ fields.push('name=?'); params.push(name); }
        if(description!==undefined){ fields.push('description=?'); params.push(description); }
        if(req.file){ fields.push('cover_image=?'); params.push(req.file.path || req.file.secure_url || req.file.url || `/uploads/${req.file.filename}`); }
        if(!fields.length) return res.status(400).json({ message: 'No updates' });
        params.push(req.params.id);
        await global.db.run(`UPDATE channels SET ${fields.join(', ')} WHERE id=?`, params);
        res.json({ message: 'Channel updated' });
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.deleteChannel = async (req, res) => {
    try {
        const channel = await global.db.get('SELECT creator_id, name FROM channels WHERE id=?', [req.params.id]);
        if (!channel) return res.status(404).json({ message: 'Channel not found' });
        if (String(channel.creator_id) !== String(req.user.id) && req.user.role !== 'Admin') return res.status(403).json({ message: 'Not authorized' });
        await global.db.run('DELETE FROM channels WHERE id=?', [req.params.id]);
        await global.db.run('DELETE FROM channel_members WHERE channel_id=?', [req.params.id]);
        await global.db.run('DELETE FROM channel_posts WHERE channel_id=?', [req.params.id]);
        if (req.user.role === 'Admin' && String(channel.creator_id) !== String(req.user.id)) {
            try {
                const adminUser = await global.db.get('SELECT fullName FROM users WHERE id=?', [req.user.id]);
                const adminName = adminUser?.fullName || 'Admin';
                const dateStr = new Date().toLocaleDateString('en-GB');
                const msg = `Your channel "${(channel.name||'').slice(0,40)}" was deleted by Admin ${adminName} on ${dateStr}`;
                await global.db.run('INSERT INTO notifications (recipient_id, sender_id, type, message) VALUES (?,?,?,?)', [channel.creator_id, req.user.id, 'admin_delete', msg]);
                const io = req.app.get('io'); const onlineUsers = req.app.get('onlineUsers');
                if (io && onlineUsers) { const sock = onlineUsers.get(String(channel.creator_id)); if (sock) io.to(sock).emit('new_notification', { message: msg, type: 'admin_delete' }); }
            } catch {}
        }
        res.json({ message: 'Channel deleted' });
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.deleteChannelPost = async (req, res) => {
    try {
        const post = await global.db.get('SELECT * FROM channel_posts WHERE id=?', [req.params.pid]);
        if (!post) return res.status(404).json({ message: 'Post not found' });
        const member = await global.db.get('SELECT role FROM channel_members WHERE channel_id=? AND user_id=?', [post.channel_id, req.user.id]);
        const isOwner = String(post.admin_id) === String(req.user.id);
        const isChannelAdmin = member && (member.role === 'owner' || member.role === 'admin');
        if (!isOwner && !isChannelAdmin && req.user.role !== 'Admin') return res.status(403).json({ message: 'Not authorized' });
        await global.db.run('DELETE FROM channel_posts WHERE id=?', [req.params.pid]);
        if (req.user.role === 'Admin' && String(post.admin_id) !== String(req.user.id)) {
            try {
                const adminUser = await global.db.get('SELECT fullName FROM users WHERE id=?', [req.user.id]);
                const adminName = adminUser?.fullName || 'Admin';
                const dateStr = new Date().toLocaleDateString('en-GB');
                const msg = `Your channel post "${(post.content||'').slice(0,40)}" was deleted by Admin ${adminName} on ${dateStr}`;
                await global.db.run('INSERT INTO notifications (recipient_id, sender_id, type, message) VALUES (?,?,?,?)', [post.admin_id, req.user.id, 'admin_delete', msg]);
                const io = req.app.get('io'); const onlineUsers = req.app.get('onlineUsers');
                if (io && onlineUsers) { const sock = onlineUsers.get(String(post.admin_id)); if (sock) io.to(sock).emit('new_notification', { message: msg, type: 'admin_delete' }); }
            } catch {}
        }
        res.json({ message: 'Channel post deleted' });
    } catch(e) { res.status(500).json({ message: e.message }); }
};
