// Rideshare Controller
exports.createPost = async (req, res) => {
    try {
        const { type, from_location, to_location, ride_date, ride_time, seats, fare, vehicle_type, contact, notes } = req.body;
        if (!type || !from_location || !to_location || !ride_date || !ride_time)
            return res.status(400).json({ message: 'Type, locations, date and time are required' });
        if (!['offer','request'].includes(type)) return res.status(400).json({ message: 'Type must be offer or request' });
        const result = await global.db.run(
            'INSERT INTO rideshare_posts (user_id,type,from_location,to_location,ride_date,ride_time,seats,fare,vehicle_type,contact,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
            [req.user.id, type, from_location.trim(), to_location.trim(), ride_date, ride_time, seats||1, fare||null, vehicle_type||null, contact||null, notes||null]
        );
        res.status(201).json({ message: 'Rideshare post created', id: result.lastID });
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.getPosts = async (req, res) => {
    try {
        const { type, date } = req.query;
        let sql = `SELECT r.*, u.fullName, u.profilePicture, u.department, u.batch FROM rideshare_posts r JOIN users u ON r.user_id=u.id WHERE r.status='open'`;
        const params = [];
        if (type) { sql += ' AND r.type=?'; params.push(type); }
        if (date) { sql += ' AND r.ride_date=?'; params.push(date); }
        sql += ' ORDER BY r.ride_date ASC, r.ride_time ASC LIMIT 100';
        const posts = await global.db.all(sql, params);
        res.json(posts);
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.closePost = async (req, res) => {
    try {
        const post = await global.db.get('SELECT user_id FROM rideshare_posts WHERE id=?', [req.params.id]);
        if (!post) return res.status(404).json({ message: 'Post not found' });
        if (String(post.user_id) !== String(req.user.id) && req.user.role !== 'Admin') return res.status(403).json({ message: 'Not authorized' });
        await global.db.run('UPDATE rideshare_posts SET status="closed" WHERE id=?', [req.params.id]);
        res.json({ message: 'Post closed' });
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.deletePost = async (req, res) => {
    try {
        const post = await global.db.get('SELECT user_id, from_location, to_location FROM rideshare_posts WHERE id=?', [req.params.id]);
        if (!post) return res.status(404).json({ message: 'Post not found' });
        if (String(post.user_id) !== String(req.user.id) && req.user.role !== 'Admin') return res.status(403).json({ message: 'Not authorized' });
        await global.db.run('DELETE FROM rideshare_posts WHERE id=?', [req.params.id]);
        if (req.user.role === 'Admin' && String(post.user_id) !== String(req.user.id)) {
            try {
                const adminUser = await global.db.get('SELECT fullName FROM users WHERE id=?', [req.user.id]);
                const adminName = adminUser?.fullName || 'Admin';
                const dateStr = new Date().toLocaleDateString('en-GB');
                const msg = `Your rideshare post "${(post.from_location||'').slice(0,20)} -> ${(post.to_location||'').slice(0,20)}" was deleted by Admin ${adminName} on ${dateStr}`;
                await global.db.run('INSERT INTO notifications (recipient_id, sender_id, type, message) VALUES (?,?,?,?)', [post.user_id, req.user.id, 'admin_delete', msg]);
                const io = req.app.get('io'); const onlineUsers = req.app.get('onlineUsers');
                if (io && onlineUsers) { const sock = onlineUsers.get(String(post.user_id)); if (sock) io.to(sock).emit('new_notification', { message: msg, type: 'admin_delete' }); }
            } catch {}
        }
        res.json({ message: 'Post deleted' });
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.updatePost = async (req, res) => {
    try {
        const post = await global.db.get('SELECT user_id FROM rideshare_posts WHERE id=?', [req.params.id]);
        if (!post) return res.status(404).json({ message: 'Post not found' });
        if (String(post.user_id) !== String(req.user.id) && req.user.role !== 'Admin') return res.status(403).json({ message: 'Not authorized' });
        const { type, from_location, to_location, ride_date, ride_time, seats, fare, vehicle_type, contact, notes } = req.body;
        const fields=[], params=[];
        if(type!==undefined){ fields.push('type=?'); params.push(type); }
        if(from_location!==undefined){ fields.push('from_location=?'); params.push(from_location); }
        if(to_location!==undefined){ fields.push('to_location=?'); params.push(to_location); }
        if(ride_date!==undefined){ fields.push('ride_date=?'); params.push(ride_date); }
        if(ride_time!==undefined){ fields.push('ride_time=?'); params.push(ride_time); }
        if(seats!==undefined){ fields.push('seats=?'); params.push(seats); }
        if(fare!==undefined){ fields.push('fare=?'); params.push(fare); }
        if(vehicle_type!==undefined){ fields.push('vehicle_type=?'); params.push(vehicle_type); }
        if(contact!==undefined){ fields.push('contact=?'); params.push(contact); }
        if(notes!==undefined){ fields.push('notes=?'); params.push(notes); }
        if(!fields.length) return res.status(400).json({ message: 'No updates provided' });
        params.push(req.params.id);
        await global.db.run(`UPDATE rideshare_posts SET ${fields.join(', ')} WHERE id=?`, params);
        const updated = await global.db.get('SELECT r.*, u.fullName FROM rideshare_posts r JOIN users u ON r.user_id=u.id WHERE r.id=?', [req.params.id]);
        res.json({ message: 'Post updated', post: updated });
    } catch(e) { res.status(500).json({ message: e.message }); }
};
