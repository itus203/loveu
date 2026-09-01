// Study Room Controller
const crypto = require('crypto');

exports.createRoom = async (req, res) => {
    try {
        const { name, subject, description, max_members, is_private } = req.body;
        if (!name) return res.status(400).json({ message: 'Room name is required' });
        const invite_code = crypto.randomBytes(4).toString('hex').toUpperCase();
        const result = await global.db.run(
            'INSERT INTO study_rooms (created_by,name,subject,description,max_members,is_private,invite_code) VALUES (?,?,?,?,?,?,?)',
            [req.user.id, name.trim(), subject||null, description||null, max_members||10, is_private?1:0, invite_code]
        );
        await global.db.run('INSERT INTO study_room_members (room_id,user_id,role) VALUES (?,?,?)', [result.lastID, req.user.id, 'admin']);
        res.status(201).json({ message: 'Study room created', roomId: result.lastID, invite_code });
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.getRooms = async (req, res) => {
    try {
        const rooms = await global.db.all(`
            SELECT sr.*, u.fullName as creator_name,
                (SELECT COUNT(*) FROM study_room_members WHERE room_id=sr.id) as member_count
            FROM study_rooms sr
            JOIN users u ON sr.created_by=u.id
            WHERE sr.status='active' AND (sr.is_private=0 OR sr.id IN
                (SELECT room_id FROM study_room_members WHERE user_id=?))
            ORDER BY sr.created_at DESC LIMIT 50
        `, [req.user.id]);
        for (const r of rooms) {
            const membership = await global.db.get('SELECT role FROM study_room_members WHERE room_id=? AND user_id=?', [r.id, req.user.id]);
            r.my_role = membership ? membership.role : null;
        }
        res.json(rooms);
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.joinRoom = async (req, res) => {
    try {
        const { invite_code } = req.body;
        const room = await global.db.get('SELECT * FROM study_rooms WHERE id=?', [req.params.id]);
        if (!room) return res.status(404).json({ message: 'Room not found' });
        if (room.is_private && room.invite_code !== invite_code) return res.status(403).json({ message: 'Invalid invite code' });
        const memberCount = await global.db.get('SELECT COUNT(*) as c FROM study_room_members WHERE room_id=?', [room.id]);
        if (memberCount.c >= room.max_members) return res.status(400).json({ message: 'Room is full' });
        const existing = await global.db.get('SELECT id FROM study_room_members WHERE room_id=? AND user_id=?', [room.id, req.user.id]);
        if (existing) return res.status(400).json({ message: 'Already in this room' });
        await global.db.run('INSERT INTO study_room_members (room_id,user_id) VALUES (?,?)', [room.id, req.user.id]);
        res.json({ message: 'Joined study room' });
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.getRoomMessages = async (req, res) => {
    try {
        const membership = await global.db.get('SELECT id FROM study_room_members WHERE room_id=? AND user_id=?', [req.params.id, req.user.id]);
        if (!membership) return res.status(403).json({ message: 'You are not a member of this room' });
        const messages = await global.db.all(
            'SELECT srm.*,u.fullName,u.profilePicture FROM study_room_messages srm JOIN users u ON srm.user_id=u.id WHERE srm.room_id=? ORDER BY srm.created_at DESC LIMIT 100',
            [req.params.id]
        );
        res.json(messages.reverse());
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.sendMessage = async (req, res) => {
    try {
        const { content, file_url } = req.body;
        if (!content && !file_url) return res.status(400).json({ message: 'Content or file required' });
        const membership = await global.db.get('SELECT id FROM study_room_members WHERE room_id=? AND user_id=?', [req.params.id, req.user.id]);
        if (!membership) return res.status(403).json({ message: 'You are not a member of this room' });
        const result = await global.db.run(
            'INSERT INTO study_room_messages (room_id,user_id,content,file_url) VALUES (?,?,?,?)',
            [req.params.id, req.user.id, content||null, file_url||null]
        );
        const message = await global.db.get(
            'SELECT srm.*,u.fullName,u.profilePicture FROM study_room_messages srm JOIN users u ON srm.user_id=u.id WHERE srm.id=?',
            [result.lastID]
        );
        const io = req.app.get('io');
        if (io) io.to('study_room_' + req.params.id).emit('study_room_message', message);
        res.status(201).json(message);
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.leaveRoom = async (req, res) => {
    try {
        await global.db.run('DELETE FROM study_room_members WHERE room_id=? AND user_id=?', [req.params.id, req.user.id]);
        res.json({ message: 'Left study room' });
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.updateRoom = async (req, res) => {
    try {
        const room = await global.db.get('SELECT created_by, name FROM study_rooms WHERE id=?', [req.params.id]);
        if (!room) return res.status(404).json({ message: 'Room not found' });
        if (String(room.created_by) !== String(req.user.id) && req.user.role !== 'Admin') return res.status(403).json({ message: 'Not authorized' });
        const { name, subject, description, max_members } = req.body;
        const fields=[], params=[];
        if(name!==undefined){ fields.push('name=?'); params.push(name); }
        if(subject!==undefined){ fields.push('subject=?'); params.push(subject); }
        if(description!==undefined){ fields.push('description=?'); params.push(description); }
        if(max_members!==undefined){ fields.push('max_members=?'); params.push(max_members); }
        if(!fields.length) return res.status(400).json({ message: 'No updates' });
        params.push(req.params.id);
        await global.db.run(`UPDATE study_rooms SET ${fields.join(', ')} WHERE id=?`, params);
        res.json({ message: 'Room updated' });
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.deleteRoom = async (req, res) => {
    try {
        const room = await global.db.get('SELECT created_by, name FROM study_rooms WHERE id=?', [req.params.id]);
        if (!room) return res.status(404).json({ message: 'Room not found' });
        if (String(room.created_by) !== String(req.user.id) && req.user.role !== 'Admin') return res.status(403).json({ message: 'Not authorized' });
        await global.db.run('DELETE FROM study_rooms WHERE id=?', [req.params.id]);
        await global.db.run('DELETE FROM study_room_members WHERE room_id=?', [req.params.id]);
        await global.db.run('DELETE FROM study_room_messages WHERE room_id=?', [req.params.id]);
        if (req.user.role === 'Admin' && String(room.created_by) !== String(req.user.id)) {
            try {
                const adminUser = await global.db.get('SELECT fullName FROM users WHERE id=?', [req.user.id]);
                const adminName = adminUser?.fullName || 'Admin';
                const dateStr = new Date().toLocaleDateString('en-GB');
                const msg = `Your study room "${(room.name||'').slice(0,40)}" was deleted by Admin ${adminName} on ${dateStr}`;
                await global.db.run('INSERT INTO notifications (recipient_id, sender_id, type, message) VALUES (?,?,?,?)', [room.created_by, req.user.id, 'admin_delete', msg]);
                const io = req.app.get('io'); const onlineUsers = req.app.get('onlineUsers');
                if (io && onlineUsers) { const sock = onlineUsers.get(String(room.created_by)); if (sock) io.to(sock).emit('new_notification', { message: msg, type: 'admin_delete' }); }
            } catch {}
        }
        res.json({ message: 'Room deleted' });
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.deleteMessage = async (req, res) => {
    try {
        const msg = await global.db.get('SELECT * FROM study_room_messages WHERE id=?', [req.params.mid]);
        if (!msg) return res.status(404).json({ message: 'Message not found' });
        if (String(msg.user_id) !== String(req.user.id) && req.user.role !== 'Admin') return res.status(403).json({ message: 'Not authorized' });
        await global.db.run('DELETE FROM study_room_messages WHERE id=?', [req.params.mid]);
        if (req.user.role === 'Admin' && String(msg.user_id) !== String(req.user.id)) {
            try {
                const adminUser = await global.db.get('SELECT fullName FROM users WHERE id=?', [req.user.id]);
                const adminName = adminUser?.fullName || 'Admin';
                const dateStr = new Date().toLocaleDateString('en-GB');
                const m = `Your study room message "${(msg.content||'').slice(0,40)}" was deleted by Admin ${adminName} on ${dateStr}`;
                await global.db.run('INSERT INTO notifications (recipient_id, sender_id, type, message) VALUES (?,?,?,?)', [msg.user_id, req.user.id, 'admin_delete', m]);
                const io = req.app.get('io'); const onlineUsers = req.app.get('onlineUsers');
                if (io && onlineUsers) { const sock = onlineUsers.get(String(msg.user_id)); if (sock) io.to(sock).emit('new_notification', { message: m, type: 'admin_delete' }); }
            } catch {}
        }
        res.json({ message: 'Message deleted' });
    } catch(e) { res.status(500).json({ message: e.message }); }
};
