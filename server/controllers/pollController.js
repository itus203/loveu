// Polls Controller
exports.createPoll = async (req, res) => {
    try {
        const { question, options, allow_multiple, is_anonymous, expires_in_hours } = req.body;
        if (!question || !options || !Array.isArray(options) || options.length < 2)
            return res.status(400).json({ message: 'Question and at least 2 options are required' });
        if (options.length > 6) return res.status(400).json({ message: 'Maximum 6 options allowed' });
        if (question.length > 300) return res.status(400).json({ message: 'Question must be under 300 characters' });

        let expires_at = null;
        if (expires_in_hours) expires_at = new Date(Date.now() + expires_in_hours * 3600000).toISOString();

        const result = await global.db.run(
            'INSERT INTO polls (user_id,question,allow_multiple,is_anonymous,expires_at) VALUES (?,?,?,?,?)',
            [req.user.id, question.trim(), allow_multiple?1:0, is_anonymous?1:0, expires_at]
        );
        const pollId = result.lastID;
        for (const opt of options) {
            await global.db.run('INSERT INTO poll_options (poll_id,option_text) VALUES (?,?)', [pollId, opt.trim()]);
        }
        res.status(201).json({ message: 'Poll created', pollId });
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.getPolls = async (req, res) => {
    try {
        const polls = await global.db.all(
            `SELECT p.*, u.fullName, u.profilePicture,
             (SELECT COUNT(DISTINCT user_id) FROM poll_votes WHERE poll_id=p.id) as total_votes
             FROM polls p JOIN users u ON p.user_id=u.id
             WHERE p.status='active' ORDER BY p.created_at DESC LIMIT 50`
        );
        for (const poll of polls) {
            poll.options = await global.db.all('SELECT * FROM poll_options WHERE poll_id=?', [poll.id]);
            const userVote = await global.db.get('SELECT option_id FROM poll_votes WHERE poll_id=? AND user_id=?', [poll.id, req.user.id]);
            poll.my_vote = userVote ? userVote.option_id : null;
            if (poll.is_anonymous) { delete poll.fullName; delete poll.profilePicture; delete poll.user_id; }
        }
        res.json(polls);
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.votePoll = async (req, res) => {
    try {
        const { option_id } = req.body;
        const poll = await global.db.get('SELECT * FROM polls WHERE id=?', [req.params.id]);
        if (!poll) return res.status(404).json({ message: 'Poll not found' });
        if (poll.status !== 'active') return res.status(400).json({ message: 'This poll has ended' });
        if (poll.expires_at && new Date(poll.expires_at) < new Date()) {
            await global.db.run('UPDATE polls SET status="ended" WHERE id=?', [poll.id]);
            return res.status(400).json({ message: 'This poll has expired' });
        }

        const option = await global.db.get('SELECT id FROM poll_options WHERE id=? AND poll_id=?', [option_id, poll.id]);
        if (!option) return res.status(400).json({ message: 'Invalid option' });

        const alreadyVoted = await global.db.get('SELECT id FROM poll_votes WHERE poll_id=? AND user_id=?', [poll.id, req.user.id]);
        if (alreadyVoted && !poll.allow_multiple) return res.status(400).json({ message: 'You already voted on this poll' });

        await global.db.run('INSERT OR IGNORE INTO poll_votes (poll_id,option_id,user_id) VALUES (?,?,?)', [poll.id, option_id, req.user.id]);
        await global.db.run('UPDATE poll_options SET vote_count=vote_count+1 WHERE id=?', [option_id]);
        res.json({ message: 'Vote recorded' });
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.deletePoll = async (req, res) => {
    try {
        const poll = await global.db.get('SELECT user_id, question FROM polls WHERE id=?', [req.params.id]);
        if (!poll) return res.status(404).json({ message: 'Poll not found' });
        if (String(poll.user_id) !== String(req.user.id) && req.user.role !== 'Admin') return res.status(403).json({ message: 'Not authorized' });
        await global.db.run('DELETE FROM poll_votes WHERE poll_id=?', [req.params.id]);
        await global.db.run('DELETE FROM poll_options WHERE poll_id=?', [req.params.id]);
        await global.db.run('DELETE FROM polls WHERE id=?', [req.params.id]);
        if (req.user.role === 'Admin' && String(poll.user_id) !== String(req.user.id)) {
            try {
                const adminUser = await global.db.get('SELECT fullName FROM users WHERE id=?', [req.user.id]);
                const adminName = adminUser?.fullName || 'Admin';
                const dateStr = new Date().toLocaleDateString('en-GB');
                const msg = `Your poll "${(poll.question||'').slice(0,40)}" was deleted by Admin ${adminName} on ${dateStr}`;
                await global.db.run('INSERT INTO notifications (recipient_id, sender_id, type, message) VALUES (?,?,?,?)', [poll.user_id, req.user.id, 'admin_delete', msg]);
                const io = req.app.get('io'); const onlineUsers = req.app.get('onlineUsers');
                if (io && onlineUsers) { const sock = onlineUsers.get(String(poll.user_id)); if (sock) io.to(sock).emit('new_notification', { message: msg, type: 'admin_delete' }); }
            } catch {}
        }
        res.json({ message: 'Poll deleted' });
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.updatePoll = async (req, res) => {
    try {
        const poll = await global.db.get('SELECT user_id FROM polls WHERE id=?', [req.params.id]);
        if (!poll) return res.status(404).json({ message: 'Poll not found' });
        if (String(poll.user_id) !== String(req.user.id) && req.user.role !== 'Admin') return res.status(403).json({ message: 'Not authorized' });
        const { question } = req.body;
        if (!question || !question.trim()) return res.status(400).json({ message: 'Question required' });
        if (question.length > 300) return res.status(400).json({ message: 'Question too long' });
        await global.db.run('UPDATE polls SET question=? WHERE id=?', [question.trim(), req.params.id]);
        const updated = await global.db.get('SELECT p.*, u.fullName FROM polls p JOIN users u ON p.user_id=u.id WHERE p.id=?', [req.params.id]);
        res.json({ message: 'Poll updated', poll: updated });
    } catch(e) { res.status(500).json({ message: e.message }); }
};
