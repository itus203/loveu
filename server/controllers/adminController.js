exports.getStats = async (req, res) => {
    try {
        const totalUsers    = await global.db.get('SELECT COUNT(*) as count FROM users');
        const totalPosts    = await global.db.get('SELECT COUNT(*) as count FROM posts');
        const totalStudents = await global.db.get('SELECT COUNT(*) as count FROM users WHERE role="Student"');
        const totalAlumni   = await global.db.get('SELECT COUNT(*) as count FROM users WHERE role="Alumni"');
        const totalFaculty  = await global.db.get('SELECT COUNT(*) as count FROM users WHERE role="Faculty"');
        const totalAdmins   = await global.db.get('SELECT COUNT(*) as count FROM users WHERE role="Admin"');
        const totalReports  = await global.db.get('SELECT COUNT(*) as count FROM content_reports WHERE status="pending"');
        const totalBanned   = await global.db.get('SELECT COUNT(*) as count FROM banned_users');
        res.json({
            totalUsers: totalUsers.count,
            totalPosts: totalPosts.count,
            totalStudents: totalStudents.count,
            totalAlumni: totalAlumni.count,
            totalFaculty: totalFaculty.count,
            totalAdmins: totalAdmins.count,
            pendingReports: totalReports.count,
            totalBanned: totalBanned.count
        });
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.getRecentPosts = async (req, res) => {
    try {
        const posts = await global.db.all(
            'SELECT p.id, p.content, p.created_at, u.fullName, u.email, u.department, u.batch FROM posts p JOIN users u ON p.user_id=u.id ORDER BY p.created_at DESC LIMIT 20'
        );
        res.json(posts);
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.getAllUsers = async (req, res) => {
    try {
        const users = await global.db.all(`
            SELECT u.id as _id, u.fullName, u.email, u.role, u.department, u.batch, u.isVerified, u.createdAt,
                (SELECT COUNT(*) FROM posts WHERE user_id = u.id) as postCount,
                (SELECT COUNT(*) FROM user_warnings WHERE user_id = u.id) as warningCount,
                (SELECT COUNT(*) FROM content_reports cr
                    JOIN posts p ON cr.target_id = p.id
                    WHERE cr.target_type='post' AND p.user_id = u.id) as reportedCount,
                (SELECT 1 FROM banned_users WHERE user_id = u.id LIMIT 1) as isBanned
            FROM users u ORDER BY u.createdAt DESC
        `);
        res.json(users);
    } catch(e) { res.status(500).json({ message: e.message }); }
};

const NEXUS_WHITELIST = ['codingwithsalman11@gmail.com','mehedirohan2002@gmail.com','mehedihasanrohan2002@gmail.com','codingwithsifat@gmail.com'];
exports.updateUserRole = async (req, res) => {
    try {
        const { role } = req.body;
        const validRoles = ['Student', 'Alumni', 'Faculty', 'Admin'];
        if (!validRoles.includes(role)) return res.status(400).json({ message: 'Invalid role' });
        if (role === 'Admin') {
            const target = await global.db.get('SELECT email FROM users WHERE id=?', [req.params.id]);
            if (!target || !NEXUS_WHITELIST.includes(target.email.toLowerCase().trim())) {
                try{ await global.db.run(`INSERT INTO audit_logs (user_id, user_email, user_role, action, target_type, details, severity) VALUES (?,?,?,?,?,?,?)`, [req.user.id, req.user.email, req.user.role, 'UNAUTHORIZED_ROLE_ASSIGN', 'user', `Blocked admin assign to ${target?.email}`, 'critical']); }catch{}
                return res.status(403).json({ message: 'Only Nexus Team emails can be Admin. Whitelisted: '+NEXUS_WHITELIST.join(', ') });
            }
        }
        if (String(req.params.id) === String(req.user.id) && role !== 'Admin') {
            return res.status(400).json({ message: 'You cannot remove your own Admin role' });
        }
        await global.db.run('UPDATE users SET role=? WHERE id=?', [role, req.params.id]);
        const user = await global.db.get('SELECT fullName, email FROM users WHERE id=?', [req.params.id]);
        // Audit log
        await global.db.run(
            `INSERT INTO audit_logs (user_id, user_email, user_role, action, target_type, target_id, details, severity)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [req.user.id, req.user.email, req.user.role, 'UPDATE_USER_ROLE', 'user', req.params.id, `Role changed to ${role} for ${user?.email}`, 'warning']
        );
        res.json({ message: `Role for ${user?.fullName || 'User'} updated to ${role}` });
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.assignAdminByEmail = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ message: 'Email is required' });
        const lower = email.toLowerCase().trim();
        if (!NEXUS_WHITELIST.includes(lower)) {
            try{ await global.db.run(`INSERT INTO audit_logs (user_id, user_email, user_role, action, target_type, details, severity) VALUES (?,?,?,?,?,?,?)`, [req.user.id, req.user.email, req.user.role, 'UNAUTHORIZED_ADMIN_ASSIGN', 'user', `Blocked assign ${lower}`, 'critical']); }catch{}
            return res.status(403).json({ message: 'Only Nexus Team emails can be Admin. Allowed: '+NEXUS_WHITELIST.join(', ') });
        }
        const user = await global.db.get('SELECT id, fullName, email, role FROM users WHERE email=?', [lower]);
        if (!user) return res.status(404).json({ message: `No account found with email "${email}"` });
        if (user.role === 'Admin') return res.status(400).json({ message: `${user.fullName} is already an Admin` });
        await global.db.run('UPDATE users SET role="Admin" WHERE id=?', [user.id]);
        res.json({ message: `${user.fullName} (${user.email}) has been assigned as Admin!`, user: { ...user, role: 'Admin' } });
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.removeAdmin = async (req, res) => {
    try {
        if (String(req.params.id) === String(req.user.id)) {
            return res.status(400).json({ message: 'You cannot remove your own Admin role' });
        }
        const user = await global.db.get('SELECT fullName FROM users WHERE id=?', [req.params.id]);
        await global.db.run('UPDATE users SET role="Student" WHERE id=?', [req.params.id]);
        res.json({ message: `Admin privileges removed for ${user?.fullName || 'User'}` });
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.deleteUser = async (req, res) => {
    try {
        if (String(req.params.id) === String(req.user.id)) {
            return res.status(400).json({ message: 'You cannot delete your own account' });
        }
        const user = await global.db.get('SELECT fullName, email FROM users WHERE id=?', [req.params.id]);
        if (!user) return res.status(404).json({ message: 'User not found' });
        const targetId = req.params.id;
        // Cascade cleanup — remove all user content so foreign-key / orphan issues don't block delete
        const cleanQueries = [
            'DELETE FROM posts WHERE user_id=?',
            'DELETE FROM comments WHERE user_id=?',
            'DELETE FROM reactions WHERE user_id=?',
            'DELETE FROM saved_posts WHERE user_id=?',
            'DELETE FROM stories WHERE user_id=?',
            'DELETE FROM reels WHERE user_id=?',
            'DELETE FROM housing_posts WHERE user_id=?',
            'DELETE FROM marketplace WHERE user_id=?',
            'DELETE FROM lost_found WHERE user_id=?',
            'DELETE FROM blood_requests WHERE user_id=?',
            'DELETE FROM tutoring_posts WHERE user_id=?',
            'DELETE FROM rideshare_posts WHERE user_id=?',
            'DELETE FROM internships WHERE posted_by=?',
            'DELETE FROM resources WHERE user_id=?',
            'DELETE FROM question_bank WHERE uploaded_by=?',
            'DELETE FROM showcase_projects WHERE user_id=?',
            'DELETE FROM polls WHERE user_id=?',
            'DELETE FROM events WHERE creator_id=?',
            'DELETE FROM group_posts WHERE user_id=?',
            'DELETE FROM group_members WHERE user_id=?',
            'DELETE FROM friends WHERE user1_id=? OR user2_id=?',
            'DELETE FROM friend_requests WHERE sender_id=? OR receiver_id=?',
            'DELETE FROM notifications WHERE recipient_id=? OR sender_id=?',
            'DELETE FROM messages WHERE sender_id=? OR receiver_id=?',
            'DELETE FROM banned_users WHERE user_id=?',
            'DELETE FROM user_warnings WHERE user_id=?',
            'DELETE FROM content_reports WHERE reporter_id=?',
            'DELETE FROM audit_logs WHERE user_id=?',
        ];
        for (const q of cleanQueries) {
            try {
                const placeholders = (q.match(/\?/g) || []).length;
                const params = Array(placeholders).fill(targetId);
                await global.db.run(q, params);
            } catch(_) {}
        }
        await global.db.run('DELETE FROM users WHERE id=?', [targetId]);
        await global.db.run(
            `INSERT INTO audit_logs (user_id, user_email, user_role, action, target_type, target_id, details, severity)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [req.user.id, req.user.email, req.user.role, 'DELETE_USER', 'user', targetId, `Deleted: ${user?.email}`, 'critical']
        );
        res.json({ message: `User ${user?.fullName || 'User'} has been deleted successfully` });
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.sendAnnouncement = async (req, res) => {
    try {
        const { title, message, targetRole } = req.body;
        if (!message) return res.status(400).json({ message: 'Announcement message is required' });
        let users;
        if (targetRole === 'all' || !targetRole) {
            users = await global.db.all('SELECT id FROM users WHERE id != ?', [req.user.id]);
        } else {
            users = await global.db.all('SELECT id FROM users WHERE role=? AND id != ?', [targetRole, req.user.id]);
        }
        const fullMsg = title ? `${title}: ${message}` : message;
        for (const u of users) {
            await global.db.run(
                'INSERT INTO notifications (recipient_id, sender_id, type, message) VALUES (?,?,?,?)',
                [u.id, req.user.id, 'announcement', fullMsg]
            );
        }
        const io = req.app.get('io');
        if (io) io.emit('new_notification', { message: fullMsg, type: 'announcement' });
        res.json({ message: `Announcement broadcasted to ${users.length} active users` });
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.getAllAdmins = async (req, res) => {
    try {
        const admins = await global.db.all(
            'SELECT id as _id, fullName, email, department, createdAt FROM users WHERE role="Admin" ORDER BY createdAt ASC'
        );
        res.json(admins);
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.verifyUser = async (req, res) => {
    try {
        await global.db.run('UPDATE users SET isVerified=1 WHERE id=?', [req.params.id]);
        res.json({ message: 'User verified successfully' });
    } catch(e) { res.status(500).json({ message: e.message }); }
};

// ═══════════════════════════════════════════════════════════════════════════
//  NEW — SECURITY & ACCOUNTABILITY ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

// GET Audit Logs (paginated)
exports.getAuditLogs = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const offset = (page - 1) * limit;
        const severity = req.query.severity || null;
        const userId = req.query.userId || null;

        let where = '1=1';
        const params = [];
        if (severity) { where += ' AND severity = ?'; params.push(severity); }
        if (userId)   { where += ' AND user_id = ?'; params.push(userId); }

        const logs = await global.db.all(
            `SELECT al.*, u.fullName, u.department, u.batch
             FROM audit_logs al
             LEFT JOIN users u ON al.user_id = u.id
             WHERE ${where}
             ORDER BY al.created_at DESC LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );
        const total = await global.db.get(`SELECT COUNT(*) as count FROM audit_logs WHERE ${where}`, params);
        res.json({ logs, total: total.count, page, limit });
    } catch(e) { res.status(500).json({ message: e.message }); }
};

// GET Content Reports (pending) — A-Z generic for all target types
exports.getContentReports = async (req, res) => {
    try {
        const status = req.query.status || 'pending';
        const reports = await global.db.all(`
            SELECT cr.*,
                r.fullName as reporter_full_name, r.email as reporter_email, r.role as reporter_role
            FROM content_reports cr
            LEFT JOIN users r ON cr.reporter_id = r.id
            WHERE cr.status = ?
            ORDER BY cr.created_at DESC LIMIT 100
        `, [status]);

        // Enrich each report with content preview + author info based on target_type
        const TABLE_MAP = {
            post: { table: 'posts', contentCol: 'content', userCol: 'user_id' },
            housing: { table: 'housing_posts', contentCol: 'title', userCol: 'user_id' },
            marketplace: { table: 'marketplace', contentCol: 'title', userCol: 'user_id' },
            lost_found: { table: 'lost_found', contentCol: 'title', userCol: 'user_id' },
            blood_request: { table: 'blood_requests', contentCol: 'patientName', userCol: 'user_id' },
            blood_donation: { table: 'blood_donations', contentCol: 'blood_group', userCol: 'user_id' },
            reels: { table: 'reels', contentCol: 'caption', userCol: 'user_id' },
            story: { table: 'stories', contentCol: 'caption', userCol: 'user_id' },
            rideshare: { table: 'rideshare_posts', contentCol: 'from_location', userCol: 'user_id' },
            tutoring: { table: 'tutoring_posts', contentCol: 'subject', userCol: 'user_id' },
            internship: { table: 'internships', contentCol: 'title', userCol: 'posted_by' },
            resource: { table: 'resources', contentCol: 'title', userCol: 'user_id' },
            question_bank: { table: 'question_bank', contentCol: 'course_code', userCol: 'uploaded_by' },
            club: { table: 'clubs', contentCol: 'name', userCol: 'president_id' },
            showcase: { table: 'showcase_projects', contentCol: 'title', userCol: 'user_id' },
            event: { table: 'events', contentCol: 'title', userCol: 'creator_id' },
            group: { table: 'groups_table', contentCol: 'name', userCol: 'creator_id' },
            group_post: { table: 'group_posts', contentCol: 'content', userCol: 'user_id' },
            comment: { table: 'comments', contentCol: 'content', userCol: 'user_id' },
            user: { table: 'users', contentCol: 'fullName', userCol: 'id' },
        };

        for (const r of reports) {
            const map = TABLE_MAP[r.target_type];
            if (map) {
                try {
                    const row = await global.db.get(`SELECT ${map.contentCol} as content, ${map.userCol} as owner_id FROM ${map.table} WHERE ${map.table === 'users' ? 'id' : 'id'}=?`, [r.target_id]);
                    if (row) {
                        r.post_content = row.content || `[${r.target_type} #${r.target_id}]`;
                        r.post_author_id = row.owner_id;
                        const author = await global.db.get('SELECT fullName as author_name, email as author_email, department as author_department, batch as author_batch, role as author_role FROM users WHERE id=?', [row.owner_id]);
                        if (author) Object.assign(r, author);
                    } else {
                        r.post_content = `[${r.target_type} #${r.target_id} — deleted or not found]`;
                    }
                } catch {}
            }
            // Fallbacks for frontend compat
            r.author_name = r.author_name || 'Unknown';
            r.reporter_full_name = r.reporter_full_name || 'Unknown';
        }
        res.json(reports);
    } catch(e) { res.status(500).json({ message: e.message }); }
};

// GET Full User Identity Dossier (admin only)
exports.getUserIdentity = async (req, res) => {
    try {
        const uid = req.params.id;
        const user = await global.db.get(`
            SELECT id as _id, fullName, email, role, department, batch, gender,
                   bio, profilePicture, isVerified, createdAt
            FROM users WHERE id = ?
        `, [uid]);
        if (!user) return res.status(404).json({ message: 'User not found' });

        // Activity stats
        const postCount   = await global.db.get('SELECT COUNT(*) as c FROM posts WHERE user_id=?', [uid]);
        const friendCount = await global.db.get('SELECT COUNT(*) as c FROM friends WHERE user1_id=? OR user2_id=?', [uid, uid]);
        const warnings    = await global.db.all('SELECT * FROM user_warnings WHERE user_id=? ORDER BY created_at DESC', [uid]);
        const reports     = await global.db.all(`
            SELECT cr.*, p.content as post_content
            FROM content_reports cr
            LEFT JOIN posts p ON cr.target_id = p.id
            WHERE cr.target_type='post' AND p.user_id=?
            ORDER BY cr.created_at DESC LIMIT 20
        `, [uid]);
        const recentPosts = await global.db.all(
            'SELECT id, content, visibility, created_at FROM posts WHERE user_id=? ORDER BY created_at DESC LIMIT 10', [uid]
        );
        const recentActivity = await global.db.all(
            'SELECT action, ip_address, severity, created_at FROM audit_logs WHERE user_id=? ORDER BY created_at DESC LIMIT 20', [uid]
        );
        const ban = await global.db.get('SELECT * FROM banned_users WHERE user_id=?', [uid]);
        const loginIPs = await global.db.all(
            `SELECT DISTINCT ip_address, MAX(created_at) as last_seen
             FROM audit_logs WHERE user_id=? AND ip_address IS NOT NULL
             GROUP BY ip_address ORDER BY last_seen DESC LIMIT 10`, [uid]
        );

        res.json({
            user,
            stats: {
                postCount: postCount.c,
                friendCount: friendCount.c,
                warningCount: warnings.length,
                reportedCount: reports.length
            },
            warnings,
            reports,
            recentPosts,
            recentActivity,
            loginIPs,
            ban: ban || null
        });
    } catch(e) { res.status(500).json({ message: e.message }); }
};

// POST Warn a user
exports.warnUser = async (req, res) => {
    try {
        const { userId, reason, severity, postId } = req.body;
        if (!userId || !reason) return res.status(400).json({ message: 'userId and reason are required' });
        const validSeverity = ['notice', 'warning', 'final_warning'];
        const sev = validSeverity.includes(severity) ? severity : 'warning';

        await global.db.run(
            'INSERT INTO user_warnings (user_id, admin_id, reason, severity, post_id) VALUES (?,?,?,?,?)',
            [userId, req.user.id, reason, sev, postId || null]
        );

        // Send notification to the user
        const sevLabel = { notice: 'Notice', warning: 'Warning', final_warning: 'Final Warning' }[sev];
        await global.db.run(
            `INSERT INTO notifications (recipient_id, sender_id, type, message)
             VALUES (?, ?, ?, ?)`,
            [userId, req.user.id, 'warning',
             `[OFFICIAL ${sevLabel.toUpperCase()}] From DIU Nexus Administration: ${reason}. Repeated violations may result in account suspension.`]
        );

        // Audit log
        await global.db.run(
            `INSERT INTO audit_logs (user_id, user_email, user_role, action, target_type, target_id, details, severity)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [req.user.id, req.user.email, req.user.role, 'WARN_USER', 'user', userId, `${sev}: ${reason}`, 'warning']
        );

        const io = req.app.get('io');
        if (io) io.to(String(userId)).emit('account_warning', { severity: sev, reason });

        res.json({ message: `${sevLabel} issued to user successfully` });
    } catch(e) { res.status(500).json({ message: e.message }); }
};

// POST Ban/Suspend a user
exports.banUser = async (req, res) => {
    try {
        const { userId, reason, durationDays, isPermanent } = req.body;
        if (!userId || !reason) return res.status(400).json({ message: 'userId and reason are required' });
        if (String(userId) === String(req.user.id)) return res.status(400).json({ message: 'You cannot ban your own account' });

        let expiresAt = null;
        if (!isPermanent && durationDays) {
            expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();
        }

        await global.db.run(
            `INSERT INTO banned_users (user_id, banned_by, reason, expires_at, is_permanent)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(user_id) DO UPDATE SET
               reason=excluded.reason, expires_at=excluded.expires_at,
               is_permanent=excluded.is_permanent, banned_by=excluded.banned_by,
               created_at=CURRENT_TIMESTAMP`,
            [userId, req.user.id, reason, expiresAt, isPermanent ? 1 : 0]
        );

        // Notify user
        const banLabel = isPermanent ? 'permanently banned' : `suspended for ${durationDays} day(s)`;
        await global.db.run(
            `INSERT INTO notifications (recipient_id, sender_id, type, message)
             VALUES (?, ?, ?, ?)`,
            [userId, req.user.id, 'ban',
             `Your DIU Nexus account has been ${banLabel}. Reason: ${reason}. Contact admin@diu.edu.bd for appeals.`]
        );

        // Audit log
        await global.db.run(
            `INSERT INTO audit_logs (user_id, user_email, user_role, action, target_type, target_id, details, severity)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [req.user.id, req.user.email, req.user.role, isPermanent ? 'PERMANENT_BAN' : 'TEMPORARY_BAN',
             'user', userId, `${banLabel}: ${reason}`, 'critical']
        );

        res.json({ message: `User account has been ${banLabel} successfully` });
    } catch(e) { res.status(500).json({ message: e.message }); }
};

// DELETE Unban/Unsuspend a user
exports.unbanUser = async (req, res) => {
    try {
        const user = await global.db.get('SELECT fullName, email FROM users WHERE id=?', [req.params.id]);
        await global.db.run('DELETE FROM banned_users WHERE user_id=?', [req.params.id]);
        await global.db.run(
            `INSERT INTO notifications (recipient_id, sender_id, type, message) VALUES (?,?,?,?)`,
            [req.params.id, req.user.id, 'info',
             'Your DIU Nexus account suspension has been lifted. You can now log in again. Please abide by community guidelines.']
        );
        await global.db.run(
            `INSERT INTO audit_logs (user_id, user_email, user_role, action, target_type, target_id, details, severity)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [req.user.id, req.user.email, req.user.role, 'UNBAN_USER', 'user', req.params.id,
             `Unbanned: ${user?.email}`, 'info']
        );
        res.json({ message: `Account for ${user?.fullName || 'User'} has been unsuspended` });
    } catch(e) { res.status(500).json({ message: e.message }); }
};

// GET All Banned Users
exports.getBannedUsers = async (req, res) => {
    try {
        const banned = await global.db.all(`
            SELECT b.*, u.fullName, u.email, u.role, u.department, u.batch,
                   admin.fullName as banned_by_name
            FROM banned_users b
            JOIN users u ON b.user_id = u.id
            LEFT JOIN users admin ON b.banned_by = admin.id
            ORDER BY b.created_at DESC
        `);
        res.json(banned);
    } catch(e) { res.status(500).json({ message: e.message }); }
};

// POST Resolve/dismiss a content report
exports.resolveReport = async (req, res) => {
    try {
        const { action } = req.body; // 'dismissed' | 'resolved'
        await global.db.run(
            'UPDATE content_reports SET status=?, reviewed_by=?, reviewed_at=CURRENT_TIMESTAMP WHERE id=?',
            [action || 'resolved', req.user.id, req.params.id]
        );
        res.json({ message: `Report marked as ${action || 'resolved'}` });
    } catch(e) { res.status(500).json({ message: e.message }); }
};

// DELETE reported content (A-Z) — Admin can delete any reported type and auto-resolve
exports.deleteReportedContent = async (req, res) => {
    try {
        const reportId = req.params.id;
        const report = await global.db.get('SELECT * FROM content_reports WHERE id=?', [reportId]);
        if (!report) return res.status(404).json({ message: 'Report not found' });
        const type = report.target_type;
        const targetId = report.target_id;
        const TABLE_MAP = {
            post: { table: 'posts', idCol: 'id', userCol: 'user_id' },
            housing: { table: 'housing_posts', idCol: 'id', userCol: 'user_id' },
            marketplace: { table: 'marketplace', idCol: 'id', userCol: 'user_id' },
            lost_found: { table: 'lost_found', idCol: 'id', userCol: 'user_id' },
            blood_request: { table: 'blood_requests', idCol: 'id', userCol: 'user_id' },
            blood_donation: { table: 'blood_donations', idCol: 'id', userCol: 'user_id' },
            reels: { table: 'reels', idCol: 'id', userCol: 'user_id' },
            story: { table: 'stories', idCol: 'id', userCol: 'user_id' },
            rideshare: { table: 'rideshare_posts', idCol: 'id', userCol: 'user_id' },
            tutoring: { table: 'tutoring_posts', idCol: 'id', userCol: 'user_id' },
            internship: { table: 'internships', idCol: 'id', userCol: 'posted_by' },
            resource: { table: 'resources', idCol: 'id', userCol: 'user_id' },
            question_bank: { table: 'question_bank', idCol: 'id', userCol: 'uploaded_by' },
            club: { table: 'clubs', idCol: 'id', userCol: 'president_id' },
            showcase: { table: 'showcase_projects', idCol: 'id', userCol: 'user_id' },
            event: { table: 'events', idCol: 'id', userCol: 'creator_id' },
            group: { table: 'groups_table', idCol: 'id', userCol: 'creator_id' },
            group_post: { table: 'group_posts', idCol: 'id', userCol: 'user_id' },
            comment: { table: 'comments', idCol: 'id', userCol: 'user_id' },
            poll: { table: 'polls', idCol: 'id', userCol: 'user_id' },
            confession: { table: 'confessions', idCol: 'id', userCol: 'id' },
            user: { table: 'users', idCol: 'id', userCol: 'id' },
        };
        const map = TABLE_MAP[type];
        if (!map) return res.status(400).json({ message: 'Unsupported type: ' + type });
        // Get owner for notification (confessions are anonymous — no owner)
        let content = null;
        if (type !== 'confession') {
            content = await global.db.get(`SELECT ${map.userCol} as owner_id FROM ${map.table} WHERE ${map.idCol}=?`, [targetId]);
        }
        // Delete content
        await global.db.run(`DELETE FROM ${map.table} WHERE ${map.idCol}=?`, [targetId]);
        // Clean related
        if (type === 'post') {
            await global.db.run('DELETE FROM comments WHERE post_id=?', [targetId]);
            await global.db.run('DELETE FROM reactions WHERE post_id=?', [targetId]);
            await global.db.run('DELETE FROM saved_posts WHERE post_id=?', [targetId]);
        }
        if (type === 'housing') await global.db.run('DELETE FROM housing_reviews WHERE house_id=?', [targetId]);
        if (type === 'reels') { try{ await global.db.run('DELETE FROM reel_likes WHERE reel_id=?', [targetId]); }catch{} try{ await global.db.run('DELETE FROM reel_comments WHERE reel_id=?', [targetId]); }catch{} }
        if (type === 'story') { try{ await global.db.run('DELETE FROM story_views WHERE story_id=?', [targetId]); }catch{} try{ await global.db.run('DELETE FROM story_reactions WHERE story_id=?', [targetId]); }catch{} try{ await global.db.run('DELETE FROM story_replies WHERE story_id=?', [targetId]); }catch{} }
        if (type === 'poll') { try{ await global.db.run('DELETE FROM poll_options WHERE poll_id=?', [targetId]); }catch{} try{ await global.db.run('DELETE FROM poll_votes WHERE poll_id=?', [targetId]); }catch{} }
        if (type === 'question_bank') { try{ await global.db.run('DELETE FROM question_bank_likes WHERE question_id=?', [targetId]); }catch{} }
        if (type === 'showcase') { try{ await global.db.run('DELETE FROM showcase_likes WHERE project_id=?', [targetId]); }catch{} }
        if (type === 'group_post') { try{ await global.db.run('DELETE FROM group_post_reactions WHERE post_id=?', [targetId]); }catch{} try{ await global.db.run('DELETE FROM group_post_comments WHERE post_id=?', [targetId]); }catch{} }
        if (type === 'event') { try{ await global.db.run('DELETE FROM event_rsvps WHERE event_id=?', [targetId]); }catch{} }
        if (type === 'group') { try{ await global.db.run('DELETE FROM group_members WHERE group_id=?', [targetId]); }catch{} try{ await global.db.run('DELETE FROM group_posts WHERE group_id=?', [targetId]); }catch{} }
        if (type === 'marketplace' || type === 'lost_found') {
            // no extra
        }
        // Mark all pending reports for same content as resolved
        await global.db.run('UPDATE content_reports SET status="resolved", reviewed_by=?, reviewed_at=CURRENT_TIMESTAMP WHERE target_type=? AND target_id=? AND status="pending"', [req.user.id, type, targetId]);
        // Also mark this report resolved
        await global.db.run('UPDATE content_reports SET status="resolved", reviewed_by=?, reviewed_at=CURRENT_TIMESTAMP WHERE id=?', [req.user.id, reportId]);
        // Audit
        await global.db.run(`INSERT INTO audit_logs (user_id, user_email, user_role, action, target_type, target_id, details, severity) VALUES (?,?,?,?,?,?,?,?)`,
            [req.user.id, req.user.email, req.user.role, 'DELETE_REPORTED_CONTENT', type, targetId, `Deleted ${type} #${targetId} via report #${reportId}`, 'critical']);
        // Notify owner — "is deleted by admin name 01/02/03"
        if (content && content.owner_id) {
            try {
                const adminUser = await global.db.get('SELECT fullName FROM users WHERE id=?', [req.user.id]);
                const adminName = adminUser?.fullName || req.user.email || 'Admin';
                const dateStr = new Date().toLocaleDateString('en-GB');
                const msg = `Your ${type} #${targetId} was deleted by Admin ${adminName} on ${dateStr}`;
                await global.db.run('INSERT INTO notifications (recipient_id, sender_id, type, message) VALUES (?,?,?,?)',
                    [content.owner_id, req.user.id, 'admin_delete', msg]);
                const io = req.app.get('io'); const onlineUsers = req.app.get('onlineUsers');
                if (io && onlineUsers) { const sock = onlineUsers.get(String(content.owner_id)); if (sock) io.to(sock).emit('new_notification', { message: msg, type: 'admin_delete' }); }
            } catch {}
        }
        res.json({ message: `${type} #${targetId} deleted and report resolved` });
    } catch (e) { res.status(500).json({ message: e.message }); }
};

// DELETE any content directly (A-Z) — Admin direct moderation without report
exports.deleteAnyContent = async (req, res) => {
    try {
        const { type, id } = req.params;
        const TABLE_MAP = {
            post: { table: 'posts', idCol: 'id', userCol: 'user_id' },
            housing: { table: 'housing_posts', idCol: 'id', userCol: 'user_id' },
            marketplace: { table: 'marketplace', idCol: 'id', userCol: 'user_id' },
            lost_found: { table: 'lost_found', idCol: 'id', userCol: 'user_id' },
            blood_request: { table: 'blood_requests', idCol: 'id', userCol: 'user_id' },
            blood_donation: { table: 'blood_donations', idCol: 'id', userCol: 'user_id' },
            reels: { table: 'reels', idCol: 'id', userCol: 'user_id' },
            story: { table: 'stories', idCol: 'id', userCol: 'user_id' },
            comment: { table: 'comments', idCol: 'id', userCol: 'user_id' },
            event: { table: 'events', idCol: 'id', userCol: 'creator_id' },
            group: { table: 'groups_table', idCol: 'id', userCol: 'creator_id' },
            group_post: { table: 'group_posts', idCol: 'id', userCol: 'user_id' },
            tutoring: { table: 'tutoring_posts', idCol: 'id', userCol: 'user_id' },
            rideshare: { table: 'rideshare_posts', idCol: 'id', userCol: 'user_id' },
            internship: { table: 'internships', idCol: 'id', userCol: 'posted_by' },
            resource: { table: 'resources', idCol: 'id', userCol: 'user_id' },
            question_bank: { table: 'question_bank', idCol: 'id', userCol: 'uploaded_by' },
            showcase: { table: 'showcase_projects', idCol: 'id', userCol: 'user_id' },
            poll: { table: 'polls', idCol: 'id', userCol: 'user_id' },
            club: { table: 'clubs', idCol: 'id', userCol: 'president_id' },
            confession: { table: 'confessions', idCol: 'id', userCol: null },
        };
        const map = TABLE_MAP[type];
        if (!map) return res.status(400).json({ message: 'Unsupported type: ' + type + '. Supported: ' + Object.keys(TABLE_MAP).join(', ') });
        const content = await global.db.get(`SELECT * FROM ${map.table} WHERE ${map.idCol}=?`, [id]);
        if (!content) return res.status(404).json({ message: `${type} #${id} not found` });
        const ownerId = map.userCol ? (content[map.userCol] || content.user_id || content.uploaded_by || content.posted_by || content.creator_id) : null;
        await global.db.run(`DELETE FROM ${map.table} WHERE ${map.idCol}=?`, [id]);
        // Clean related — same as deleteReportedContent
        if (type === 'post') {
            await global.db.run('DELETE FROM comments WHERE post_id=?', [id]);
            await global.db.run('DELETE FROM reactions WHERE post_id=?', [id]);
            try{ await global.db.run('DELETE FROM saved_posts WHERE post_id=?', [id]); }catch{}
        }
        if (type === 'housing') try{ await global.db.run('DELETE FROM housing_reviews WHERE house_id=?', [id]); }catch{}
        if (type === 'reels') { try{ await global.db.run('DELETE FROM reel_likes WHERE reel_id=?', [id]); }catch{} try{ await global.db.run('DELETE FROM reel_comments WHERE reel_id=?', [id]); }catch{} }
        if (type === 'story') { try{ await global.db.run('DELETE FROM story_views WHERE story_id=?', [id]); }catch{} try{ await global.db.run('DELETE FROM story_reactions WHERE story_id=?', [id]); }catch{} try{ await global.db.run('DELETE FROM story_replies WHERE story_id=?', [id]); }catch{} }
        if (type === 'poll') { try{ await global.db.run('DELETE FROM poll_options WHERE poll_id=?', [id]); }catch{} try{ await global.db.run('DELETE FROM poll_votes WHERE poll_id=?', [id]); }catch{} }
        if (type === 'question_bank') { try{ await global.db.run('DELETE FROM question_bank_likes WHERE question_id=?', [id]); }catch{} }
        if (type === 'showcase') { try{ await global.db.run('DELETE FROM showcase_likes WHERE project_id=?', [id]); }catch{} }
        if (type === 'group_post') { try{ await global.db.run('DELETE FROM group_post_reactions WHERE post_id=?', [id]); }catch{} try{ await global.db.run('DELETE FROM group_post_comments WHERE post_id=?', [id]); }catch{} }
        if (type === 'group') { try{ await global.db.run('DELETE FROM group_members WHERE group_id=?', [id]); }catch{} try{ await global.db.run('DELETE FROM group_posts WHERE group_id=?', [id]); }catch{} }
        if (type === 'event') { try{ await global.db.run('DELETE FROM event_rsvps WHERE event_id=?', [id]); }catch{} }
        await global.db.run(`INSERT INTO audit_logs (user_id, user_email, user_role, action, target_type, target_id, details, severity) VALUES (?,?,?,?,?,?,?,?)`,
            [req.user.id, req.user.email, req.user.role, 'ADMIN_DELETE_CONTENT', type, id, `Direct delete ${type} #${id}`, 'critical']);
        // Notify owner — "is deleted by admin name 01/02/03"
        if (ownerId && String(ownerId) !== String(req.user.id)) {
            try {
                const adminUser = await global.db.get('SELECT fullName FROM users WHERE id=?', [req.user.id]);
                const adminName = adminUser?.fullName || req.user.email || 'Admin';
                const dateStr = new Date().toLocaleDateString('en-GB');
                const msg = `Your ${type} #${id} was deleted by Admin ${adminName} on ${dateStr}`;
                await global.db.run('INSERT INTO notifications (recipient_id, sender_id, type, message) VALUES (?,?,?,?)', [ownerId, req.user.id, 'admin_delete', msg]);
                const io = req.app.get('io'); const onlineUsers = req.app.get('onlineUsers');
                if (io && onlineUsers) { const sock = onlineUsers.get(String(ownerId)); if (sock) io.to(sock).emit('new_notification', { message: msg, type: 'admin_delete' }); }
            } catch {}
        }
        res.json({ message: `${type} #${id} deleted` });
    } catch (e) { res.status(500).json({ message: e.message }); }
};

// GET App Version & Changelog
exports.getVersion = async (req, res) => {
    try {
        res.json({
            version: "2.0.0",
            name: "DIU Nexus",
            changelog: "Initial release - DIU Social Platform v2.0",
            updatedAt: new Date().toISOString()
        });
    } catch(e) { res.status(500).json({ message: e.message }); }
};
