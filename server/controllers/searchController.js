exports.search = async (req, res) => {
    try {
        const { q } = req.query;
        if (!q || q.trim().length < 2) return res.json({ users: [], posts: [] });
        const query = `%${q.trim()}%`;
        const isPg = !!(global.db && global.db.isPostgres);
        const likeOp = isPg ? 'ILIKE' : 'LIKE';
        let users = await global.db.all(
            `SELECT id as _id, fullName, profilePicture, department, batch, role FROM users WHERE fullName ${likeOp} ? OR department ${likeOp} ? LIMIT 10`,
            [query, query]
        );
        let posts = await global.db.all(
            `SELECT p.id as _id, p.content, p.created_at, u.fullName, u.profilePicture FROM posts p JOIN users u ON p.user_id=u.id WHERE p.content ${likeOp} ? AND p.visibility='Public' ORDER BY p.created_at DESC LIMIT 10`,
            [query]
        );
        // Postgres lowercase normalize
        users = users.map(u => ({ ...u, fullName: u.fullName||u.fullname, profilePicture: u.profilePicture||u.profilepicture, _id: u._id||u.id }));
        posts = posts.map(p => ({ ...p, fullName: p.fullName||p.fullname, profilePicture: p.profilePicture||p.profilepicture, content: p.content, created_at: p.created_at||p.createdat }));
        res.json({ users, posts });
    } catch (e) { res.status(500).json({ message: e.message }); }
};
