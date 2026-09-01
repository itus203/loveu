// Tutoring Controller
exports.createPost = async (req, res) => {
    try {
        const { type, subject, description, department, batch, fee_per_hour, mode, contact, availability } = req.body;
        if (!type || !subject) return res.status(400).json({ message: 'Type and subject are required' });
        if (!['tutor','student'].includes(type)) return res.status(400).json({ message: 'Type must be tutor or student' });
        const result = await global.db.run(
            'INSERT INTO tutoring_posts (user_id,type,subject,description,department,batch,fee_per_hour,mode,contact,availability) VALUES (?,?,?,?,?,?,?,?,?,?)',
            [req.user.id, type, subject.trim(), description||null, department||null, batch||null, fee_per_hour||null, mode||'online', contact||null, availability||null]
        );
        res.status(201).json({ message: 'Post created', id: result.lastID });
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.getPosts = async (req, res) => {
    try {
        const { type, subject, department } = req.query;
        let sql = `SELECT t.*, u.fullName, u.profilePicture FROM tutoring_posts t JOIN users u ON t.user_id=u.id WHERE t.is_active=1`;
        const params = [];
        if (type) { sql += ' AND t.type=?'; params.push(type); }
        if (subject) { sql += ' AND t.subject LIKE ?'; params.push('%'+subject+'%'); }
        if (department) { sql += ' AND t.department=?'; params.push(department); }
        sql += ' ORDER BY t.created_at DESC LIMIT 100';
        const posts = await global.db.all(sql, params);
        res.json(posts);
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.deletePost = async (req, res) => {
    try {
        const post = await global.db.get('SELECT user_id, subject FROM tutoring_posts WHERE id=?', [req.params.id]);
        if (!post) return res.status(404).json({ message: 'Post not found' });
        if (String(post.user_id) !== String(req.user.id) && req.user.role !== 'Admin') return res.status(403).json({ message: 'Not authorized' });
        await global.db.run('DELETE FROM tutoring_posts WHERE id=?', [req.params.id]);
        if (req.user.role === 'Admin' && String(post.user_id) !== String(req.user.id)) {
            try {
                const adminUser = await global.db.get('SELECT fullName FROM users WHERE id=?', [req.user.id]);
                const adminName = adminUser?.fullName || 'Admin';
                const dateStr = new Date().toLocaleDateString('en-GB');
                const msg = `Your tutoring post "${(post.subject||'').slice(0,40)}" was deleted by Admin ${adminName} on ${dateStr}`;
                await global.db.run('INSERT INTO notifications (recipient_id, sender_id, type, message) VALUES (?,?,?,?)', [post.user_id, req.user.id, 'admin_delete', msg]);
                const io = req.app.get('io'); const onlineUsers = req.app.get('onlineUsers');
                if (io && onlineUsers) { const sock = onlineUsers.get(String(post.user_id)); if (sock) io.to(sock).emit('new_notification', { message: msg, type: 'admin_delete' }); }
            } catch {}
        }
        res.json({ message: 'Post deleted' });
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.updatePost = async (req, res) => {
    try {
        const post = await global.db.get('SELECT user_id FROM tutoring_posts WHERE id=?', [req.params.id]);
        if (!post) return res.status(404).json({ message: 'Post not found' });
        if (String(post.user_id) !== String(req.user.id) && req.user.role !== 'Admin') return res.status(403).json({ message: 'Not authorized' });
        const { type, subject, description, department, batch, fee_per_hour, mode, contact, availability } = req.body;
        const fields=[], params=[];
        if(type!==undefined){ fields.push('type=?'); params.push(type); }
        if(subject!==undefined){ fields.push('subject=?'); params.push(subject); }
        if(description!==undefined){ fields.push('description=?'); params.push(description); }
        if(department!==undefined){ fields.push('department=?'); params.push(department); }
        if(batch!==undefined){ fields.push('batch=?'); params.push(batch); }
        if(fee_per_hour!==undefined){ fields.push('fee_per_hour=?'); params.push(fee_per_hour); }
        if(mode!==undefined){ fields.push('mode=?'); params.push(mode); }
        if(contact!==undefined){ fields.push('contact=?'); params.push(contact); }
        if(availability!==undefined){ fields.push('availability=?'); params.push(availability); }
        if(!fields.length) return res.status(400).json({ message: 'No updates provided' });
        params.push(req.params.id);
        await global.db.run(`UPDATE tutoring_posts SET ${fields.join(', ')} WHERE id=?`, params);
        const updated = await global.db.get('SELECT t.*, u.fullName, u.profilePicture FROM tutoring_posts t JOIN users u ON t.user_id=u.id WHERE t.id=?', [req.params.id]);
        res.json({ message: 'Post updated', post: updated });
    } catch(e) { res.status(500).json({ message: e.message }); }
};
