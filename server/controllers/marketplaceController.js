exports.getItems = async (req, res) => {
    try {
        const { category } = req.query;
        let query = 'SELECT m.*, u.fullName FROM marketplace m JOIN users u ON m.user_id=u.id WHERE m.status=\'available\'';
        const params = [];
        if (category) { query += ' AND m.category=?'; params.push(category); }
        query += ' ORDER BY m.created_at DESC';
        res.json(await global.db.all(query, params));
    } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.postItem = async (req, res) => {
    try {
        const { title, category, price, description, phone, address, studentId } = req.body;
        if (!title || price === undefined) return res.status(400).json({ message: 'Title and price required' });
        // phone/address/studentId are now required for global visibility — but allow legacy
        const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
        // Get user studentId as fallback
        const user = await global.db.get('SELECT studentId, email FROM users WHERE id=?', [req.user.id]);
        const finalPhone = phone || user?.phone || '';
        const finalAddress = address || '';
        const finalStudentId = studentId || user?.studentId || user?.email || '';
        const result = await global.db.run(
            'INSERT INTO marketplace (user_id, title, category, price, description, imageUrl, phone, address, studentId) VALUES (?,?,?,?,?,?,?,?,?)',
            [req.user.id, title, category || 'Other', parseFloat(price), description || '', imageUrl, finalPhone, finalAddress, finalStudentId]
        );
        res.status(201).json({ id: result.lastID, message: 'Listed globally — visible to all DIU students' });
    } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.deleteItem = async (req, res) => {
    try {
        const item = await global.db.get('SELECT user_id, title FROM marketplace WHERE id=?', [req.params.id]);
        if (!item) return res.status(404).json({ message: 'Item not found' });
        if (String(item.user_id) !== String(req.user.id) && req.user.role !== 'Admin') return res.status(403).json({ message: 'Not authorized' });
        await global.db.run('DELETE FROM marketplace WHERE id=?', [req.params.id]);
        // Notify owner if deleted by Admin
        if (req.user.role === 'Admin' && String(item.user_id) !== String(req.user.id)) {
            try {
                const adminUser = await global.db.get('SELECT fullName FROM users WHERE id=?', [req.user.id]);
                const adminName = adminUser?.fullName || 'Admin';
                const dateStr = new Date().toLocaleDateString('en-GB');
                const msg = `Your marketplace item "${(item.title||'').slice(0,40)}" was deleted by Admin ${adminName} on ${dateStr}`;
                await global.db.run('INSERT INTO notifications (recipient_id, sender_id, type, message) VALUES (?,?,?,?)', [item.user_id, req.user.id, 'admin_delete', msg]);
                const io = req.app.get('io'); const onlineUsers = req.app.get('onlineUsers');
                if (io && onlineUsers) {
                    const sock = onlineUsers.get(String(item.user_id));
                    if (sock) io.to(sock).emit('new_notification', { message: msg, type: 'admin_delete' });
                }
            } catch {}
        }
        res.json({ message: 'Item removed' });
    } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.updateItem = async (req, res) => {
    try {
        const item = await global.db.get('SELECT user_id FROM marketplace WHERE id=?', [req.params.id]);
        if (!item) return res.status(404).json({ message: 'Item not found' });
        if (String(item.user_id) !== String(req.user.id) && req.user.role !== 'Admin') return res.status(403).json({ message: 'Not authorized' });
        const { title, category, price, description, phone, address } = req.body;
        const fields = [], params = [];
        if (title !== undefined) { fields.push('title=?'); params.push(title); }
        if (category !== undefined) { fields.push('category=?'); params.push(category); }
        if (price !== undefined) { fields.push('price=?'); params.push(parseFloat(price)); }
        if (description !== undefined) { fields.push('description=?'); params.push(description); }
        if (phone !== undefined) { fields.push('phone=?'); params.push(phone); }
        if (address !== undefined) { fields.push('address=?'); params.push(address); }
        if (req.file) { fields.push('image_url=?'); params.push(`/uploads/${req.file.filename}`); }
        if (!fields.length) return res.status(400).json({ message: 'No updates provided' });
        params.push(req.params.id);
        await global.db.run(`UPDATE marketplace SET ${fields.join(', ')} WHERE id=?`, params);
        const updated = await global.db.get('SELECT m.*, u.fullName FROM marketplace m JOIN users u ON m.user_id=u.id WHERE m.id=?', [req.params.id]);
        res.json({ message: 'Item updated', item: updated });
    } catch (e) { res.status(500).json({ message: e.message }); }
};
