exports.uploadFile = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: 'File is required' });
        
        // Cloudinary gives secure_url/path, local gives filename
        const file_url = req.file.path || req.file.secure_url || req.file.url || (req.file.filename ? `/uploads/${req.file.filename}` : null);
        if (!file_url) return res.status(500).json({ message: 'Upload failed - no file URL' });
        const file_name = req.file.originalname;
        const file_size = (req.file.size / 1024).toFixed(2) + ' KB';
        const file_type = req.file.mimetype;
        
        const result = await global.db.run(
            'INSERT INTO cloud_files (user_id, file_name, file_url, file_size, file_type) VALUES (?,?,?,?,?)',
            [req.user.id, file_name, file_url, file_size, file_type]
        );
        
        const file = await global.db.get('SELECT * FROM cloud_files WHERE id=?', [result.lastID]);
        res.status(201).json(file);
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.getMyFiles = async (req, res) => {
    try {
        const files = await global.db.all('SELECT * FROM cloud_files WHERE user_id=? ORDER BY created_at DESC', [req.user.id]);
        res.json(files);
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.deleteFile = async (req, res) => {
    try {
        const file = await global.db.get('SELECT * FROM cloud_files WHERE id=?', [req.params.id]);
        if (!file) return res.status(404).json({ message: 'File not found' });
        if (String(file.user_id) !== String(req.user.id) && req.user.role !== 'Admin') return res.status(403).json({ message: 'Unauthorized' });
        await global.db.run('DELETE FROM cloud_files WHERE id=?', [req.params.id]);
        if (req.user.role === 'Admin' && String(file.user_id) !== String(req.user.id)) {
            try {
                const adminUser = await global.db.get('SELECT fullName FROM users WHERE id=?', [req.user.id]);
                const adminName = adminUser?.fullName || 'Admin';
                const dateStr = new Date().toLocaleDateString('en-GB');
                const msg = `Your file "${(file.file_name||'').slice(0,40)}" was deleted by Admin ${adminName} on ${dateStr}`;
                await global.db.run('INSERT INTO notifications (recipient_id, sender_id, type, message) VALUES (?,?,?,?)', [file.user_id, req.user.id, 'admin_delete', msg]);
                const io = req.app.get('io'); const onlineUsers = req.app.get('onlineUsers');
                if (io && onlineUsers) { const sock = onlineUsers.get(String(file.user_id)); if (sock) io.to(sock).emit('new_notification', { message: msg, type: 'admin_delete' }); }
            } catch {}
        }
        res.json({ message: 'File deleted' });
    } catch(e) { res.status(500).json({ message: e.message }); }
};
