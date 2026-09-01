// Internship Controller
exports.createInternship = async (req, res) => {
    try {
        const { company_name, title, description, requirements, location, type, stipend, duration, deadline, apply_link } = req.body;
        if (!company_name || !title) return res.status(400).json({ message: 'Company name and title are required' });
        const result = await global.db.run(
            'INSERT INTO internships (posted_by,company_name,title,description,requirements,location,type,stipend,duration,deadline,apply_link) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
            [req.user.id, company_name.trim(), title.trim(), description||null, requirements||null, location||null, type||'onsite', stipend||null, duration||null, deadline||null, apply_link||null]
        );
        res.status(201).json({ message: 'Internship posted successfully', id: result.lastID });
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.getInternships = async (req, res) => {
    try {
        const { type } = req.query;
        let sql = `SELECT i.*, u.fullName, u.department as poster_dept FROM internships i JOIN users u ON i.posted_by=u.id WHERE i.status='open'`;
        const params = [];
        if (type) { sql += ' AND i.type=?'; params.push(type); }
        sql += ' ORDER BY i.is_verified DESC, i.created_at DESC LIMIT 100';
        const internships = await global.db.all(sql, params);
        res.json(internships);
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.deleteInternship = async (req, res) => {
    try {
        const item = await global.db.get('SELECT posted_by, title FROM internships WHERE id=?', [req.params.id]);
        if (!item) return res.status(404).json({ message: 'Not found' });
        if (String(item.posted_by) !== String(req.user.id) && req.user.role !== 'Admin') return res.status(403).json({ message: 'Not authorized' });
        await global.db.run('DELETE FROM internships WHERE id=?', [req.params.id]);
        if (req.user.role === 'Admin' && String(item.posted_by) !== String(req.user.id)) {
            try {
                const adminUser = await global.db.get('SELECT fullName FROM users WHERE id=?', [req.user.id]);
                const adminName = adminUser?.fullName || 'Admin';
                const dateStr = new Date().toLocaleDateString('en-GB');
                const msg = `Your internship "${(item.title||'').slice(0,40)}" was deleted by Admin ${adminName} on ${dateStr}`;
                await global.db.run('INSERT INTO notifications (recipient_id, sender_id, type, message) VALUES (?,?,?,?)', [item.posted_by, req.user.id, 'admin_delete', msg]);
                const io = req.app.get('io'); const onlineUsers = req.app.get('onlineUsers');
                if (io && onlineUsers) { const sock = onlineUsers.get(String(item.posted_by)); if (sock) io.to(sock).emit('new_notification', { message: msg, type: 'admin_delete' }); }
            } catch {}
        }
        res.json({ message: 'Internship removed' });
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.updateInternship = async (req, res) => {
    try {
        const item = await global.db.get('SELECT posted_by FROM internships WHERE id=?', [req.params.id]);
        if (!item) return res.status(404).json({ message: 'Not found' });
        if (String(item.posted_by) !== String(req.user.id) && req.user.role !== 'Admin') return res.status(403).json({ message: 'Not authorized' });
        const { company_name, title, description, requirements, location, type, stipend, duration, deadline, apply_link } = req.body;
        const fields=[], params=[];
        if(company_name!==undefined){ fields.push('company_name=?'); params.push(company_name); }
        if(title!==undefined){ fields.push('title=?'); params.push(title); }
        if(description!==undefined){ fields.push('description=?'); params.push(description); }
        if(requirements!==undefined){ fields.push('requirements=?'); params.push(requirements); }
        if(location!==undefined){ fields.push('location=?'); params.push(location); }
        if(type!==undefined){ fields.push('type=?'); params.push(type); }
        if(stipend!==undefined){ fields.push('stipend=?'); params.push(stipend); }
        if(duration!==undefined){ fields.push('duration=?'); params.push(duration); }
        if(deadline!==undefined){ fields.push('deadline=?'); params.push(deadline); }
        if(apply_link!==undefined){ fields.push('apply_link=?'); params.push(apply_link); }
        if(!fields.length) return res.status(400).json({ message: 'No updates provided' });
        params.push(req.params.id);
        await global.db.run(`UPDATE internships SET ${fields.join(', ')} WHERE id=?`, params);
        const updated = await global.db.get('SELECT i.*, u.fullName FROM internships i JOIN users u ON i.posted_by=u.id WHERE i.id=?', [req.params.id]);
        res.json({ message: 'Internship updated', internship: updated });
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.verifyInternship = async (req, res) => {
    try {
        if (req.user.role !== 'Admin') return res.status(403).json({ message: 'Admin only' });
        await global.db.run('UPDATE internships SET is_verified=1 WHERE id=?', [req.params.id]);
        res.json({ message: 'Internship verified' });
    } catch(e) { res.status(500).json({ message: e.message }); }
};
