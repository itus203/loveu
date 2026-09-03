exports.getUsers = async (req, res) => {
    try {
        let users = await global.db.all(
            'SELECT id as _id, fullName, profilePicture, department, batch, role FROM users WHERE id != ?',
            [req.user.id]
        );
        // Normalize for Postgres lowercase
        users = users.map(u => ({
            ...u,
            fullName: u.fullName || u.fullname,
            profilePicture: u.profilePicture || u.profilepicture,
            _id: u._id || u.id,
        }));
        res.status(200).json(users);
    } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.getProfile = async (req, res) => {
    try {
        const userId = req.params.id || req.user.id;
        let user = await global.db.get(
            'SELECT id as _id, fullName, email, role, bio, department, batch, gender, profilePicture, coverPicture, createdAt FROM users WHERE id = ?',
            [userId]
        );
        if (!user) return res.status(404).json({ message: 'User not found' });
        // Postgres lowercases unquoted columns -> normalize to camelCase for frontend
        user.fullName = user.fullName || user.fullname;
        user.profilePicture = user.profilePicture || user.profilepicture;
        user.coverPicture = user.coverPicture || user.coverpicture;
        user.createdAt = user.createdAt || user.createdat;
        user.studentId = user.studentId || user.studentid;
        user._id = user._id || user.id;
        user.id = user.id || user._id;
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
        let profilePicture = req.files?.profilePicture ? (req.files.profilePicture[0].path || req.files.profilePicture[0].secure_url || req.files.profilePicture[0].url || `/uploads/${req.files.profilePicture[0].filename}`) : undefined;
        let coverPicture = req.files?.coverPicture ? (req.files.coverPicture[0].path || req.files.coverPicture[0].secure_url || req.files.coverPicture[0].url || `/uploads/${req.files.coverPicture[0].filename}`) : undefined;

        const current = await global.db.get('SELECT profilePicture, coverPicture FROM users WHERE id=?', [req.user.id]);

        await global.db.run(
            'UPDATE users SET fullName=COALESCE(?,fullName), bio=COALESCE(?,bio), department=COALESCE(?,department), batch=COALESCE(?,batch), gender=COALESCE(?,gender), profilePicture=COALESCE(?,profilePicture), coverPicture=COALESCE(?,coverPicture) WHERE id=?',
            [fullName || null, bio || null, department || null, batch || null, gender || null, profilePicture || null, coverPicture || null, req.user.id]
        );
        let updated = await global.db.get('SELECT id as _id, fullName, email, role, bio, department, batch, gender, profilePicture, coverPicture FROM users WHERE id=?', [req.user.id]);
        if (updated) {
            updated.fullName = updated.fullName || updated.fullname;
            updated.profilePicture = updated.profilePicture || updated.profilepicture;
            updated.coverPicture = updated.coverPicture || updated.coverpicture;
            updated._id = updated._id || updated.id;
        }
        res.status(200).json({ message: 'Profile updated', user: updated });
    } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.getUserSuggestions = async (req, res) => {
    try {
        let users = await global.db.all(`
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
        users = users.map(u => ({
            ...u,
            fullName: u.fullName || u.fullname,
            profilePicture: u.profilePicture || u.profilepicture,
            _id: u._id || u.id,
        }));
        res.json(users);
    } catch (e) { res.status(500).json({ message: e.message }); }
};
