// Showcase Controller
exports.createProject = async (req, res) => {
    try {
        const { title, description, tech_stack, category, image_url, demo_url, github_url, play_store_url } = req.body;
        if (!title) return res.status(400).json({ message: 'Project title is required' });
        if (title.length > 100) return res.status(400).json({ message: 'Title must be under 100 characters' });
        const result = await global.db.run(
            'INSERT INTO showcase_projects (user_id,title,description,tech_stack,category,image_url,demo_url,github_url,play_store_url) VALUES (?,?,?,?,?,?,?,?,?)',
            [req.user.id, title.trim(), description||null, tech_stack||null, category||null, image_url||null, demo_url||null, github_url||null, play_store_url||null]
        );
        res.status(201).json({ message: 'Project submitted to showcase!', id: result.lastID });
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.getProjects = async (req, res) => {
    try {
        const { category, featured } = req.query;
        let sql = `SELECT sp.*, u.fullName, u.profilePicture, u.department, u.batch FROM showcase_projects sp JOIN users u ON sp.user_id=u.id WHERE 1=1`;
        const params = [];
        if (category) { sql += ' AND sp.category=?'; params.push(category); }
        if (featured === 'true') { sql += ' AND sp.is_featured=1'; }
        sql += ' ORDER BY sp.is_featured DESC, sp.like_count DESC, sp.created_at DESC LIMIT 100';
        const projects = await global.db.all(sql, params);
        for (const p of projects) {
            const liked = await global.db.get('SELECT id FROM showcase_likes WHERE project_id=? AND user_id=?', [p.id, req.user.id]);
            p.liked_by_me = !!liked;
        }
        res.json(projects);
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.likeProject = async (req, res) => {
    try {
        const existing = await global.db.get('SELECT id FROM showcase_likes WHERE project_id=? AND user_id=?', [req.params.id, req.user.id]);
        if (existing) {
            await global.db.run('DELETE FROM showcase_likes WHERE project_id=? AND user_id=?', [req.params.id, req.user.id]);
            await global.db.run('UPDATE showcase_projects SET like_count=MAX(0,like_count-1) WHERE id=?', [req.params.id]);
            return res.json({ liked: false });
        }
        await global.db.run('INSERT INTO showcase_likes (project_id,user_id) VALUES (?,?)', [req.params.id, req.user.id]);
        await global.db.run('UPDATE showcase_projects SET like_count=like_count+1 WHERE id=?', [req.params.id]);
        res.json({ liked: true });
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.deleteProject = async (req, res) => {
    try {
        const project = await global.db.get('SELECT user_id, title FROM showcase_projects WHERE id=?', [req.params.id]);
        if (!project) return res.status(404).json({ message: 'Project not found' });
        if (String(project.user_id) !== String(req.user.id) && req.user.role !== 'Admin') return res.status(403).json({ message: 'Not authorized' });
        await global.db.run('DELETE FROM showcase_likes WHERE project_id=?', [req.params.id]);
        await global.db.run('DELETE FROM showcase_projects WHERE id=?', [req.params.id]);
        if (req.user.role === 'Admin' && String(project.user_id) !== String(req.user.id)) {
            try {
                const adminUser = await global.db.get('SELECT fullName FROM users WHERE id=?', [req.user.id]);
                const adminName = adminUser?.fullName || 'Admin';
                const dateStr = new Date().toLocaleDateString('en-GB');
                const msg = `Your showcase project "${(project.title||'').slice(0,40)}" was deleted by Admin ${adminName} on ${dateStr}`;
                await global.db.run('INSERT INTO notifications (recipient_id, sender_id, type, message) VALUES (?,?,?,?)', [project.user_id, req.user.id, 'admin_delete', msg]);
                const io = req.app.get('io'); const onlineUsers = req.app.get('onlineUsers');
                if (io && onlineUsers) { const sock = onlineUsers.get(String(project.user_id)); if (sock) io.to(sock).emit('new_notification', { message: msg, type: 'admin_delete' }); }
            } catch {}
        }
        res.json({ message: 'Project removed' });
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.updateProject = async (req, res) => {
    try {
        const project = await global.db.get('SELECT user_id FROM showcase_projects WHERE id=?', [req.params.id]);
        if (!project) return res.status(404).json({ message: 'Project not found' });
        if (String(project.user_id) !== String(req.user.id) && req.user.role !== 'Admin') return res.status(403).json({ message: 'Not authorized' });
        const { title, description, tech_stack, category, image_url, demo_url, github_url, play_store_url } = req.body;
        const fields=[], params=[];
        if(title!==undefined){ fields.push('title=?'); params.push(title); }
        if(description!==undefined){ fields.push('description=?'); params.push(description); }
        if(tech_stack!==undefined){ fields.push('tech_stack=?'); params.push(tech_stack); }
        if(category!==undefined){ fields.push('category=?'); params.push(category); }
        if(image_url!==undefined){ fields.push('image_url=?'); params.push(image_url); }
        if(demo_url!==undefined){ fields.push('demo_url=?'); params.push(demo_url); }
        if(github_url!==undefined){ fields.push('github_url=?'); params.push(github_url); }
        if(play_store_url!==undefined){ fields.push('play_store_url=?'); params.push(play_store_url); }
        if(!fields.length) return res.status(400).json({ message: 'No updates provided' });
        params.push(req.params.id);
        await global.db.run(`UPDATE showcase_projects SET ${fields.join(', ')} WHERE id=?`, params);
        const updated = await global.db.get('SELECT sp.*, u.fullName FROM showcase_projects sp JOIN users u ON sp.user_id=u.id WHERE sp.id=?', [req.params.id]);
        res.json({ message: 'Project updated', project: updated });
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.featureProject = async (req, res) => {
    try {
        if (req.user.role !== 'Admin') return res.status(403).json({ message: 'Admin only' });
        await global.db.run('UPDATE showcase_projects SET is_featured=1 WHERE id=?', [req.params.id]);
        res.json({ message: 'Project featured' });
    } catch(e) { res.status(500).json({ message: e.message }); }
};
