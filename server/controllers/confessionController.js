exports.getConfessions = async (req, res) => {
    try {
        const confessions = await global.db.all('SELECT * FROM confessions ORDER BY created_at DESC LIMIT 100');
        res.json(confessions);
    } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.postConfession = async (req, res) => {
    try {
        const { content } = req.body;
        if (!content || content.trim().length < 5) return res.status(400).json({ message: 'Content too short' });
        if (content.length > 500) return res.status(400).json({ message: 'Too long (max 500 chars)' });
        const result = await global.db.run('INSERT INTO confessions (content) VALUES (?)', [content.trim()]);
        res.status(201).json({ id: result.lastID });
    } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.likeConfession = async (req, res) => {
    try {
        await global.db.run('UPDATE confessions SET react_count = react_count + 1 WHERE id=?', [req.params.id]);
        const c = await global.db.get('SELECT react_count FROM confessions WHERE id=?', [req.params.id]);
        res.json({ likes: c?.react_count || 0 });
    } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.deleteConfession = async (req, res) => {
    try {
        if (req.user.role !== 'Admin') return res.status(403).json({ message: 'Admin only' });
        const conf = await global.db.get('SELECT id FROM confessions WHERE id=?', [req.params.id]);
        if (!conf) return res.status(404).json({ message: 'Confession not found' });
        await global.db.run('DELETE FROM confessions WHERE id=?', [req.params.id]);
        await global.db.run(`INSERT INTO audit_logs (user_id, user_email, user_role, action, target_type, target_id, details, severity) VALUES (?,?,?,?,?,?,?,?)`, [req.user.id, req.user.email, req.user.role, 'ADMIN_DELETE_CONFESSION', 'confession', req.params.id, 'Deleted confession', 'info']);
        res.json({ message: 'Confession deleted' });
    } catch (e) { res.status(500).json({ message: e.message }); }
};
