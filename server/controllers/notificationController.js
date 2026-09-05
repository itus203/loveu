exports.getNotifications = async (req, res) => {
    try {
        const notifications = await global.db.all(`
            SELECT n.*, u.fullName as senderName, u.profilePicture as senderPic
            FROM notifications n
            LEFT JOIN users u ON n.sender_id = u.id
            WHERE n.recipient_id = ?
            ORDER BY n.created_at DESC
            LIMIT 50
        `, [req.user.id]);
        // Normalize PG lower-case aliases
        notifications.forEach(n=>{
            n.senderName = n.senderName || n.sendername || n.fullname || n.fullName || null;
            n.senderPic = n.senderPic || n.senderpic || n.profilepicture || n.profilePicture || null;
            n.sender_id = n.sender_id || n.senderid || n.senderId;
        });
        res.json(notifications);
    } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.markAllRead = async (req, res) => {
    try {
        await global.db.run('UPDATE notifications SET isRead=1 WHERE recipient_id=?', [req.user.id]);
        res.json({ message: 'All notifications marked as read' });
    } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.markRead = async (req, res) => {
    try {
        await global.db.run('UPDATE notifications SET isRead=1 WHERE id=? AND recipient_id=?', [req.params.id, req.user.id]);
        res.json({ message: 'Notification marked as read' });
    } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.getUnreadCount = async (req, res) => {
    try {
        const result = await global.db.get('SELECT COUNT(*) as count FROM notifications WHERE recipient_id=? AND isRead=0', [req.user.id]);
        res.json({ count: result.count });
    } catch (e) { res.status(500).json({ message: e.message }); }
};
