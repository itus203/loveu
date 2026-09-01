exports.toggleSubscription = async (req, res) => {
    try {
        const creatorId = req.params.creatorId;
        if (creatorId == req.user.id) return res.status(400).json({message: 'Cannot subscribe to yourself'});
        
        const existing = await global.db.get('SELECT * FROM subscriptions WHERE subscriber_id=? AND creator_id=?', [req.user.id, creatorId]);
        if (existing) {
            await global.db.run('DELETE FROM subscriptions WHERE subscriber_id=? AND creator_id=?', [req.user.id, creatorId]);
            return res.json({ message: 'Unsubscribed successfully', isSubscribed: false });
        } else {
            await global.db.run('INSERT INTO subscriptions (subscriber_id, creator_id) VALUES (?,?)', [req.user.id, creatorId]);
            return res.json({ message: 'Subscribed successfully', isSubscribed: true });
        }
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.checkSubscription = async (req, res) => {
    try {
        const creatorId = req.params.creatorId;
        const existing = await global.db.get('SELECT * FROM subscriptions WHERE subscriber_id=? AND creator_id=?', [req.user.id, creatorId]);
        res.json({ isSubscribed: !!existing });
    } catch(e) { res.status(500).json({ message: e.message }); }
};
