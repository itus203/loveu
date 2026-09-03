async function ensureResourceLikes(){
    try{ await global.db.exec(`CREATE TABLE IF NOT EXISTS resource_likes (id INTEGER PRIMARY KEY AUTOINCREMENT, resource_id INTEGER NOT NULL, user_id INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(resource_id, user_id))`); }catch{}
    try{ const cols=await global.db.all(`PRAGMA table_info(resources)`); if(!cols.some(c=>c.name==='like_count')) await global.db.exec(`ALTER TABLE resources ADD COLUMN like_count INTEGER DEFAULT 0`); }catch{}
}
exports.getResources = async (req, res) => {
    try {
        await ensureResourceLikes();
        const { department, batch, subject, user_id } = req.query;
        let query = 'SELECT r.*, u.fullName, u.profilePicture, COALESCE(r.like_count,0) as like_count, (SELECT 1 FROM resource_likes rl WHERE rl.resource_id=r.id AND rl.user_id=? LIMIT 1) as isLiked FROM resources r JOIN users u ON r.user_id=u.id WHERE 1=1';
        const params = [req.user?.id || 0];
        if (department) { query += ' AND r.department=?'; params.push(department); }
        if (batch) { query += ' AND r.batch=?'; params.push(batch); }
        if (subject) { query += ' AND r.subject LIKE ?'; params.push(`%${subject}%`); }
        if (user_id) { query += ' AND r.user_id=?'; params.push(user_id); }
        query += ' ORDER BY COALESCE(r.like_count,0) DESC, r.created_at DESC';
        let resources = await global.db.all(query, params);
        resources = resources.map(r => ({
            ...r,
            fullName: r.fullName||r.fullname,
            profilePicture: r.profilePicture||r.profilepicture,
            fileUrl: r.fileUrl||r.fileurl,
            isLiked: !!(r.isLiked??r.isliked),
            like_count: r.like_count??r.likeCount,
        }));
        res.json(resources);
    } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.uploadResource = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: 'File required' });
        const { title, description, department, batch, subject } = req.body;
        if (!title) return res.status(400).json({ message: 'Title required' });
        const result = await global.db.run(
            'INSERT INTO resources (user_id, title, description, fileUrl, fileType, department, batch, subject) VALUES (?,?,?,?,?,?,?,?)',
            [req.user.id, title, description || null, req.file.path || req.file.secure_url || req.file.url || `/uploads/${req.file.filename}`, req.file.mimetype, department || null, batch || null, subject || null]
        );
        res.status(201).json({ message: 'Resource uploaded', id: result.lastID });
    } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.downloadResource = async (req, res) => {
    try {
        await global.db.run('UPDATE resources SET downloads=downloads+1 WHERE id=?', [req.params.id]);
        const resource = await global.db.get('SELECT fileUrl FROM resources WHERE id=?', [req.params.id]);
        if (!resource) return res.status(404).json({ message: 'Resource not found' });
        res.json({ fileUrl: resource.fileUrl });
    } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.toggleLike = async (req, res) => {
    try{
        await ensureResourceLikes();
        const rid=req.params.id; const uid=req.user.id;
        const exists=await global.db.get('SELECT id FROM resource_likes WHERE resource_id=? AND user_id=?', [rid, uid]);
        if(exists){
            await global.db.run('DELETE FROM resource_likes WHERE resource_id=? AND user_id=?', [rid, uid]);
            await global.db.run('UPDATE resources SET like_count = MAX(0, COALESCE(like_count,0)-1) WHERE id=?', [rid]);
        } else {
            await global.db.run('INSERT INTO resource_likes (resource_id, user_id) VALUES (?,?)', [rid, uid]);
            await global.db.run('UPDATE resources SET like_count = COALESCE(like_count,0)+1 WHERE id=?', [rid]);
        }
        const row=await global.db.get('SELECT like_count, (SELECT 1 FROM resource_likes WHERE resource_id=? AND user_id=? LIMIT 1) as isLiked FROM resources WHERE id=?', [rid, uid, rid]);
        res.json({ like_count: row?.like_count||0, isLiked: !!row?.isLiked });
    }catch(e){ res.status(500).json({message:e.message}); }
};
exports.deleteResource = async (req, res) => {
    try {
        const resource = await global.db.get('SELECT user_id, title FROM resources WHERE id=?', [req.params.id]);
        if (!resource) return res.status(404).json({ message: 'Resource not found' });
        if (String(resource.user_id) !== String(req.user.id) && req.user.role !== 'Admin') return res.status(403).json({ message: 'Not authorized' });
        await global.db.run('DELETE FROM resources WHERE id=?', [req.params.id]); try{ await global.db.run('DELETE FROM resource_likes WHERE resource_id=?', [req.params.id]); }catch{}
        if (req.user.role === 'Admin' && String(resource.user_id) !== String(req.user.id)) {
            try {
                const adminUser = await global.db.get('SELECT fullName FROM users WHERE id=?', [req.user.id]);
                const adminName = adminUser?.fullName || 'Admin';
                const dateStr = new Date().toLocaleDateString('en-GB');
                const msg = `Your resource "${(resource.title||'').slice(0,40)}" was deleted by Admin ${adminName} on ${dateStr}`;
                await global.db.run('INSERT INTO notifications (recipient_id, sender_id, type, message) VALUES (?,?,?,?)', [resource.user_id, req.user.id, 'admin_delete', msg]);
                const io = req.app.get('io'); const onlineUsers = req.app.get('onlineUsers');
                if (io && onlineUsers) { const sock = onlineUsers.get(String(resource.user_id)); if (sock) io.to(sock).emit('new_notification', { message: msg, type: 'admin_delete' }); }
            } catch {}
        }
        res.json({ message: 'Resource deleted' });
    } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.updateResource = async (req, res) => {
    try {
        const resource = await global.db.get('SELECT user_id FROM resources WHERE id=?', [req.params.id]);
        if (!resource) return res.status(404).json({ message: 'Resource not found' });
        if (String(resource.user_id) !== String(req.user.id) && req.user.role !== 'Admin') return res.status(403).json({ message: 'Not authorized' });
        const { title, description, department, batch, subject } = req.body;
        const fields = [], params = [];
        if (title !== undefined) { fields.push('title=?'); params.push(title); }
        if (description !== undefined) { fields.push('description=?'); params.push(description); }
        if (department !== undefined) { fields.push('department=?'); params.push(department); }
        if (batch !== undefined) { fields.push('batch=?'); params.push(batch); }
        if (subject !== undefined) { fields.push('subject=?'); params.push(subject); }
        if (req.file) { fields.push('fileUrl=?'); params.push(req.file.path || req.file.secure_url || req.file.url || `/uploads/${req.file.filename}`); fields.push('fileType=?'); params.push(req.file.mimetype); }
        if (!fields.length) return res.status(400).json({ message: 'No updates provided' });
        params.push(req.params.id);
        await global.db.run(`UPDATE resources SET ${fields.join(', ')} WHERE id=?`, params);
        const updated = await global.db.get('SELECT r.*, u.fullName FROM resources r JOIN users u ON r.user_id=u.id WHERE r.id=?', [req.params.id]);
        res.json({ message: 'Resource updated', resource: updated });
    } catch (e) { res.status(500).json({ message: e.message }); }
};
