const DIU_DEPARTMENTS = [
    'CSE', 'SWE', 'ITM', 'CIS', 'EEE', 'ETE', 'Civil Engineering',
    'Textile Engineering', 'Architecture', 'BBA', 'Innovation & Entrepreneurship',
    'Real Estate', 'Tourism & Hospitality', 'Pharmacy', 'Public Health',
    'Nutrition & Food Engineering', 'Genetic Engineering & Biotech', 'English',
    'Law (LLB)', 'Journalism & Media', 'Development Studies'
];

exports.getDepartments = async (req, res) => {
    try {
        const stats = await Promise.all(DIU_DEPARTMENTS.map(async (dept) => {
            const memberCount = await global.db.get('SELECT COUNT(*) as count FROM users WHERE department=?', [dept]);
            return { name: dept, memberCount: memberCount.count };
        }));
        res.json(stats);
    } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.getDepartmentFeed = async (req, res) => {
    try {
        const dept = req.params.department;
        const posts = await global.db.all(`
            SELECT p.*, u.fullName, u.profilePicture FROM posts p
            JOIN users u ON p.user_id=u.id
            WHERE u.department=? AND p.visibility='Public'
            ORDER BY p.created_at DESC LIMIT 30
        `, [dept]);
        for (const p of posts) { p._id = p.id; p.user = { fullName: p.fullName, profilePicture: p.profilePicture }; }
        res.json(posts);
    } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.getDepartmentMembers = async (req, res) => {
    try {
        const dept = req.params.department;
        const members = await global.db.all(
            `SELECT id as _id, fullName, email, profilePicture, role, batch, department FROM users WHERE department=? ORDER BY fullName ASC LIMIT 100`,
            [dept]
        );
        res.json(members);
    } catch (e) { res.status(500).json({ message: e.message }); }
};
