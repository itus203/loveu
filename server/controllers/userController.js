exports.getUsers = async (req, res) => {
    try {
        const users = await global.db.all(
            'SELECT id as _id, fullName, profilePicture, department, batch, role FROM users WHERE id != ?',
            [req.user.id]
        );
        res.status(200).json(users);
    } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.getProfile = async (req, res) => {
    try {
        const userId = req.params.id || req.user.id;
        const user = await global.db.get(
            'SELECT id as _id, fullName, email, role, bio, department, batch, gender, profilePicture, coverPicture, createdAt FROM users WHERE id = ?',
            [userId]
        );
        if (!user) return res.status(404).json({ message: 'User not found' });
        const postCount = await global.db.get('SELECT COUNT(*) as count FROM posts WHERE user_id=?', [userId]);
        const friendCount = await global.db.get('SELECT COUNT(*) as count FROM friends WHERE user1_id=? OR user2_id=?', [userId, userId]);
        const resourceCount = await global.db.get('SELECT COUNT(*) as count FROM resources WHERE user_id=?', [userId]);
        user.postCount = postCount.count;
        user.friendCount = friendCount.count;
        user.resourceCount = resourceCount.count;
        user.sharedCount = resourceCount.count; // alias for frontend Shared badge
        res.status(200).json(user);
    } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.updateProfile = async (req, res) => {
    try {
        const { fullName, bio, department, batch, gender } = req.body;
        let profilePicture = req.files && req.files.profilePicture ? `/uploads/${req.files.profilePicture[0].filename}` : undefined;
        let coverPicture = req.files && req.files.coverPicture ? `/uploads/${req.files.coverPicture[0].filename}` : undefined;

        const current = await global.db.get('SELECT profilePicture, coverPicture FROM users WHERE id=?', [req.user.id]);

        await global.db.run(
            'UPDATE users SET fullName=COALESCE(?,fullName), bio=COALESCE(?,bio), department=COALESCE(?,department), batch=COALESCE(?,batch), gender=COALESCE(?,gender), profilePicture=COALESCE(?,profilePicture), coverPicture=COALESCE(?,coverPicture) WHERE id=?',
            [fullName || null, bio || null, department || null, batch || null, gender || null, profilePicture || null, coverPicture || null, req.user.id]
        );
        const updated = await global.db.get('SELECT id as _id, fullName, email, role, bio, department, batch, gender, profilePicture, coverPicture FROM users WHERE id=?', [req.user.id]);
        res.status(200).json({ message: 'Profile updated', user: updated });
    } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.getUserSuggestions = async (req, res) => {
    try {
        const users = await global.db.all(`
            SELECT id as _id, fullName, profilePicture, department, batch FROM users
            WHERE id != ?
            AND id NOT IN (
                SELECT CASE WHEN user1_id=? THEN user2_id ELSE user1_id END FROM friends WHERE user1_id=? OR user2_id=?
            )
            AND id NOT IN (
                SELECT receiver_id FROM friend_requests WHERE sender_id=? AND status='pending'
            )
            ORDER BY RANDOM() LIMIT 8
        `, [req.user.id, req.user.id, req.user.id, req.user.id, req.user.id]);
        res.json(users);
    } catch (e) { res.status(500).json({ message: e.message }); }
};
