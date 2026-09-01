exports.search = async (req, res) => {
    try {
        const { q } = req.query;
        if (!q || q.trim().length < 2) return res.json({ users: [], posts: [] });
        const query = `%${q.trim()}%`;
        const users = await global.db.all(
            'SELECT id as _id, fullName, profilePicture, department, batch, role FROM users WHERE fullName LIKE ? OR department LIKE ? LIMIT 10',
            [query, query]
        );
        const posts = await global.db.all(
            "SELECT p.id as _id, p.content, p.created_at, u.fullName, u.profilePicture FROM posts p JOIN users u ON p.user_id=u.id WHERE p.content LIKE ? AND p.visibility='Public' ORDER BY p.created_at DESC LIMIT 10",
            [query]
        );
        res.json({ users, posts });
    } catch (e) { res.status(500).json({ message: e.message }); }
};
