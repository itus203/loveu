exports.getItems = async (req, res) => {
    try {
        const { type } = req.query;
        let query = 'SELECT lf.*, u.fullName FROM lost_found lf JOIN users u ON lf.user_id=u.id WHERE lf.status=\'open\'';
        const params = [];
        if (type && (type === 'lost' || type === 'found')) {
            query += ' AND lf.type=?';
            params.push(type);
        }
        query += ' ORDER BY lf.created_at DESC';
        const items = await global.db.all(query, params);
        res.json(items);
    } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.postItem = async (req, res) => {
    try {
        const { type, title, description, location, contact } = req.body;
        if (!title) return res.status(400).json({ message: 'Title required' });
        const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
        // DB uses imageUrl (camel) in existing sqlite, but also support image_url for new installs
        const cols = await global.db.all(`PRAGMA table_info(lost_found)`).then(r=>r.map(c=>c.name)).catch(()=>[]);
        const imgCol = cols.includes('imageUrl') ? 'imageUrl' : (cols.includes('image_url') ? 'image_url' : 'imageUrl');
        const result = await global.db.run(
            `INSERT INTO lost_found (user_id, type, title, description, location, contact, ${imgCol}) VALUES (?,?,?,?,?,?,?)`,
            [req.user.id, type || 'lost', title, description || '', location || '', contact || '', imageUrl]
        );
        const item = await global.db.get('SELECT * FROM lost_found WHERE id=?', [result.lastID]);
        res.status(201).json(item);
    } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.updateStatus = async (req, res) => {
    try {
        const item = await global.db.get('SELECT user_id FROM lost_found WHERE id=?', [req.params.id]);
        if (!item) return res.status(404).json({ message: 'Not found' });
        if (String(item.user_id) !== String(req.user.id) && req.user.role !== 'Admin') return res.status(403).json({ message: 'Not authorized' });
        await global.db.run('UPDATE lost_found SET status=? WHERE id=?', [req.body.status || 'closed', req.params.id]);
        res.json({ message: 'Updated' });
    } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.deleteItem = async (req, res) => {
    try {
        const item = await global.db.get('SELECT user_id, title FROM lost_found WHERE id=?', [req.params.id]);
        if (!item) return res.status(404).json({ message: 'Not found' });
        if (String(item.user_id) !== String(req.user.id) && req.user.role !== 'Admin') return res.status(403).json({ message: 'Not authorized' });
        await global.db.run('DELETE FROM lost_found WHERE id=?', [req.params.id]);
        if (req.user.role === 'Admin' && String(item.user_id) !== String(req.user.id)) {
            try {
                const adminUser = await global.db.get('SELECT fullName FROM users WHERE id=?', [req.user.id]);
                const adminName = adminUser?.fullName || 'Admin';
                const dateStr = new Date().toLocaleDateString('en-GB');
                const msg = `Your Lost & Found post "${(item.title||'').slice(0,40)}" was deleted by Admin ${adminName} on ${dateStr}`;
                await global.db.run('INSERT INTO notifications (recipient_id, sender_id, type, message) VALUES (?,?,?,?)', [item.user_id, req.user.id, 'admin_delete', msg]);
                const io = req.app.get('io'); const onlineUsers = req.app.get('onlineUsers');
                if (io && onlineUsers) { const sock = onlineUsers.get(String(item.user_id)); if (sock) io.to(sock).emit('new_notification', { message: msg, type: 'admin_delete' }); }
            } catch {}
        }
        res.json({ message: 'Item deleted' });
    } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.updateItem = async (req, res) => {
    try {
        const item = await global.db.get('SELECT user_id FROM lost_found WHERE id=?', [req.params.id]);
        if (!item) return res.status(404).json({ message: 'Not found' });
        if (String(item.user_id) !== String(req.user.id) && req.user.role !== 'Admin') return res.status(403).json({ message: 'Not authorized' });
        const { type, title, description, location, contact } = req.body;
        const fields = [], params = [];
        if (type !== undefined) { fields.push('type=?'); params.push(type); }
        if (title !== undefined) { fields.push('title=?'); params.push(title); }
        if (description !== undefined) { fields.push('description=?'); params.push(description); }
        if (location !== undefined) { fields.push('location=?'); params.push(location); }
        if (contact !== undefined) { fields.push('contact=?'); params.push(contact); }
        if (req.file) {
            const cols = await global.db.all(`PRAGMA table_info(lost_found)`).then(r=>r.map(c=>c.name)).catch(()=>[]);
            const imgCol = cols.includes('imageUrl') ? 'imageUrl' : 'image_url';
            fields.push(`${imgCol}=?`); params.push(`/uploads/${req.file.filename}`);
        }
        if (!fields.length) return res.status(400).json({ message: 'No updates provided' });
        params.push(req.params.id);
        await global.db.run(`UPDATE lost_found SET ${fields.join(', ')} WHERE id=?`, params);
        const updated = await global.db.get('SELECT lf.*, u.fullName FROM lost_found lf JOIN users u ON lf.user_id=u.id WHERE lf.id=?', [req.params.id]);
        res.json({ message: 'Updated', item: updated });
    } catch (e) { res.status(500).json({ message: e.message }); }
};
