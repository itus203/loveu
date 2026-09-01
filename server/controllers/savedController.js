exports.getSaved = async (req, res) => {
    try {
        const posts = await global.db.all(`
            SELECT p.*, u.fullName, u.profilePicture, sp.saved_at
            FROM saved_posts sp
            JOIN posts p ON sp.post_id = p.id
            JOIN users u ON p.user_id = u.id
            WHERE sp.user_id = ?
            ORDER BY sp.saved_at DESC
        `, [req.user.id]);
        for (let p of posts) { p._id = p.id; }
        res.json(posts);
    } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.toggleSave = async (req, res) => {
    try {
        const postId = req.params.postId;
        const userId = req.user.id;
        const existing = await global.db.get('SELECT id FROM saved_posts WHERE user_id=? AND post_id=?', [userId, postId]);
        if (existing) {
            await global.db.run('DELETE FROM saved_posts WHERE user_id=? AND post_id=?', [userId, postId]);
            res.json({ action: 'unsaved' });
        } else {
            await global.db.run('INSERT INTO saved_posts (user_id, post_id) VALUES (?,?)', [userId, postId]);
            res.json({ action: 'saved' });
        }
    } catch (e) { res.status(500).json({ message: e.message }); }
};
