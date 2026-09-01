// Club Controller
exports.getClubs = async (req, res) => {
    try {
        const clubs = await global.db.all(`
            SELECT c.*, u.fullName as president_name
            FROM clubs c LEFT JOIN users u ON c.president_id=u.id
            ORDER BY c.is_verified DESC, c.member_count DESC
        `);
        for (const club of clubs) {
            const membership = await global.db.get('SELECT role FROM club_members WHERE club_id=? AND user_id=?', [club.id, req.user.id]);
            club.my_role = membership ? membership.role : null;
        }
        res.json(clubs);
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.getClub = async (req, res) => {
    try {
        const club = await global.db.get('SELECT * FROM clubs WHERE id=?', [req.params.id]);
        if (!club) return res.status(404).json({ message: 'Club not found' });
        club.members = await global.db.all(
            'SELECT cm.role, cm.joined_at, u.fullName, u.profilePicture, u.department FROM club_members cm JOIN users u ON cm.user_id=u.id WHERE cm.club_id=? LIMIT 50',
            [req.params.id]
        );
        res.json(club);
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.joinClub = async (req, res) => {
    try {
        const club = await global.db.get('SELECT id FROM clubs WHERE id=?', [req.params.id]);
        if (!club) return res.status(404).json({ message: 'Club not found' });
        const existing = await global.db.get('SELECT id FROM club_members WHERE club_id=? AND user_id=?', [req.params.id, req.user.id]);
        if (existing) return res.status(400).json({ message: 'Already a member' });
        await global.db.run('INSERT INTO club_members (club_id,user_id) VALUES (?,?)', [req.params.id, req.user.id]);
        await global.db.run('UPDATE clubs SET member_count=member_count+1 WHERE id=?', [req.params.id]);
        res.json({ message: 'Joined club successfully' });
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.leaveClub = async (req, res) => {
    try {
        const member = await global.db.get('SELECT id FROM club_members WHERE club_id=? AND user_id=?', [req.params.id, req.user.id]);
        if (!member) return res.status(400).json({ message: 'Not a member' });
        await global.db.run('DELETE FROM club_members WHERE club_id=? AND user_id=?', [req.params.id, req.user.id]);
        await global.db.run('UPDATE clubs SET member_count=MAX(0,member_count-1) WHERE id=?', [req.params.id]);
        res.json({ message: 'Left club' });
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.createClub = async (req, res) => {
    try {
        const { name, description, category, logo_url, cover_url, founded_year, email, facebook_url } = req.body;
        if (!name) return res.status(400).json({ message: 'Club name is required' });
        const isAdmin = req.user.role === 'Admin';
        const result = await global.db.run(
            'INSERT INTO clubs (name,description,category,logo_url,cover_url,founded_year,email,facebook_url,president_id,is_verified) VALUES (?,?,?,?,?,?,?,?,?,?)',
            [name.trim(), description||null, category||null, logo_url||null, cover_url||null, founded_year||null, email||null, facebook_url||null, req.user.id, isAdmin?1:0]
        );
        res.status(201).json({ message: 'Club created', id: result.lastID });
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.updateClub = async (req, res) => {
    try {
        const club = await global.db.get('SELECT president_id, name FROM clubs WHERE id=?', [req.params.id]);
        if (!club) return res.status(404).json({ message: 'Club not found' });
        if (String(club.president_id) !== String(req.user.id) && req.user.role !== 'Admin') return res.status(403).json({ message: 'Not authorized' });
        const { name, description, category, logo_url, cover_url, email, facebook_url } = req.body;
        const fields=[], params=[];
        if(name!==undefined){ fields.push('name=?'); params.push(name); }
        if(description!==undefined){ fields.push('description=?'); params.push(description); }
        if(category!==undefined){ fields.push('category=?'); params.push(category); }
        if(logo_url!==undefined){ fields.push('logo_url=?'); params.push(logo_url); }
        if(cover_url!==undefined){ fields.push('cover_url=?'); params.push(cover_url); }
        if(email!==undefined){ fields.push('email=?'); params.push(email); }
        if(facebook_url!==undefined){ fields.push('facebook_url=?'); params.push(facebook_url); }
        if(!fields.length) return res.status(400).json({ message: 'No updates' });
        params.push(req.params.id);
        await global.db.run(`UPDATE clubs SET ${fields.join(', ')} WHERE id=?`, params);
        res.json({ message: 'Club updated' });
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.deleteClub = async (req, res) => {
    try {
        const club = await global.db.get('SELECT president_id, name FROM clubs WHERE id=?', [req.params.id]);
        if (!club) return res.status(404).json({ message: 'Club not found' });
        if (String(club.president_id) !== String(req.user.id) && req.user.role !== 'Admin') return res.status(403).json({ message: 'Not authorized' });
        await global.db.run('DELETE FROM clubs WHERE id=?', [req.params.id]);
        await global.db.run('DELETE FROM club_members WHERE club_id=?', [req.params.id]);
        if (req.user.role === 'Admin' && String(club.president_id) !== String(req.user.id)) {
            try {
                const adminUser = await global.db.get('SELECT fullName FROM users WHERE id=?', [req.user.id]);
                const adminName = adminUser?.fullName || 'Admin';
                const dateStr = new Date().toLocaleDateString('en-GB');
                const msg = `Your club "${(club.name||'').slice(0,40)}" was deleted by Admin ${adminName} on ${dateStr}`;
                await global.db.run('INSERT INTO notifications (recipient_id, sender_id, type, message) VALUES (?,?,?,?)', [club.president_id, req.user.id, 'admin_delete', msg]);
                const io = req.app.get('io'); const onlineUsers = req.app.get('onlineUsers');
                if (io && onlineUsers) { const sock = onlineUsers.get(String(club.president_id)); if (sock) io.to(sock).emit('new_notification', { message: msg, type: 'admin_delete' }); }
            } catch {}
        }
        res.json({ message: 'Club deleted' });
    } catch(e) { res.status(500).json({ message: e.message }); }
};
