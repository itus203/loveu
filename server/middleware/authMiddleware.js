const jwt = require('jsonwebtoken');

module.exports = async (req, res, next) => {
    const authHeader = req.header('Authorization');
    if (!authHeader) return res.status(401).json({ message: 'No token, authorization denied' });
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;

        // ─── Ban Check — 14-day: can VIEW but cannot POST/COMMENT/REACT/UPLOAD ───
        // Admin is god, but banned user (14 days) can still browse, just not create content
        if (global.db) {
            try {
                const ban = await global.db.get(
                    'SELECT * FROM banned_users WHERE user_id = ?',
                    [decoded.id]
                );
                if (ban) {
                    // Check if temporary ban has expired
                    if (!ban.is_permanent && ban.expires_at) {
                        const expiresAt = new Date(ban.expires_at);
                        if (expiresAt <= new Date()) {
                            // Ban expired — auto-lift it
                            await global.db.run('DELETE FROM banned_users WHERE user_id = ?', [decoded.id]);
                        } else {
                            const daysLeft = Math.ceil((expiresAt - new Date()) / (1000 * 60 * 60 * 24));
                            const isWrite = ['POST','PUT','DELETE','PATCH'].includes(req.method);
                            const url = (req.originalUrl || req.path || '') + (req.baseUrl || '');
                            const isCreatePath = url.includes('/posts') || url.includes('/comments') || url.includes('/reels') || url.includes('/housing') || url.includes('/marketplace') || url.includes('/blood') || url.includes('/stories') || url.includes('/groups') || url.includes('/polls') || url.includes('/tutoring') || url.includes('/rideshare') || url.includes('/internships') || url.includes('/resources') || url.includes('/question-bank') || url.includes('/showcase') || url.includes('/clubs') || url.includes('/events');
                            if (isWrite && isCreatePath) {
                                return res.status(403).json({
                                    code: 'ACCOUNT_SUSPENDED',
                                    message: `You are suspended for ${daysLeft} more day(s) and cannot post. Reason: ${ban.reason}. You can still browse. Contact admin@diu.edu.bd.`
                                });
                            }
                            // Allow GET/view for banned users
                        }
                    } else if (ban.is_permanent) {
                        return res.status(403).json({
                            code: 'ACCOUNT_BANNED',
                            message: `Your account has been permanently banned. Reason: ${ban.reason}. Contact admin@diu.edu.bd if you believe this is an error.`
                        });
                    }
                }

                // ─── Enrich req.user with email/role from DB ──────────────────
                const userData = await global.db.get(
                    'SELECT email, role FROM users WHERE id = ?',
                    [decoded.id]
                );
                if (userData) {
                    req.user.email = userData.email;
                    req.user.role  = userData.role;
                }
            } catch (_) { /* silent — never crash on lookup failures */ }
        }

        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') return res.status(401).json({ message: 'Token expired, please login again' });
        res.status(401).json({ message: 'Invalid token' });
    }
};
