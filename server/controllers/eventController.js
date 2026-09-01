exports.getEvents = async (req, res) => {
    try {
        const events = await global.db.all(`
            SELECT e.*, u.fullName as creatorName, u.profilePicture as creatorPic,
                (SELECT COUNT(*) FROM event_rsvps WHERE event_id=e.id AND status='going') as goingCount,
                (SELECT COUNT(*) FROM event_rsvps WHERE event_id=e.id AND status='interested') as interestedCount,
                (SELECT status FROM event_rsvps WHERE event_id=e.id AND user_id=?) as myRsvp
            FROM events e
            JOIN users u ON e.creator_id=u.id
            ORDER BY e.event_date ASC
        `, [req.user.id]);
        res.json(events);
    } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.createEvent = async (req, res) => {
    try {
        const { title, description, venue, event_date, department } = req.body;
        if (!title || !event_date) return res.status(400).json({ message: 'Title and date are required' });
        let cover_image = req.file ? `/uploads/${req.file.filename}` : null;
        const result = await global.db.run(
            'INSERT INTO events (creator_id, title, description, venue, event_date, cover_image, department) VALUES (?,?,?,?,?,?,?)',
            [req.user.id, title, description || null, venue || null, event_date, cover_image, department || null]
        );
        res.status(201).json({ message: 'Event created', id: result.lastID });
    } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.rsvpEvent = async (req, res) => {
    try {
        const { status } = req.body; // 'going', 'interested', 'not_going'
        const existing = await global.db.get('SELECT id FROM event_rsvps WHERE event_id=? AND user_id=?', [req.params.id, req.user.id]);
        if (existing) {
            await global.db.run('UPDATE event_rsvps SET status=? WHERE id=?', [status, existing.id]);
        } else {
            await global.db.run('INSERT INTO event_rsvps (event_id, user_id, status) VALUES (?,?,?)', [req.params.id, req.user.id, status]);
        }
        res.json({ message: 'RSVP updated', status });
    } catch (e) { res.status(500).json({ message: e.message }); }
};
