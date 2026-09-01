// Question Bank Controller
exports.uploadQuestion = async (req, res) => {
    try {
        const { course_code, course_name, department, semester, year, exam_type, file_url, file_name } = req.body;
        if (!course_code || !file_url) return res.status(400).json({ message: 'Course code and file URL are required' });
        const result = await global.db.run(
            'INSERT INTO question_bank (uploaded_by,course_code,course_name,department,semester,year,exam_type,file_url,file_name) VALUES (?,?,?,?,?,?,?,?,?)',
            [req.user.id, course_code.toUpperCase().trim(), course_name||null, department||null, semester||null, year||null, exam_type||null, file_url, file_name||null]
        );
        res.status(201).json({ message: 'Question paper uploaded successfully', id: result.lastID });
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.getQuestions = async (req, res) => {
    try {
        const { course_code, department, semester, year } = req.query;
        let sql = `SELECT qb.*, u.fullName, u.department as uploader_dept FROM question_bank qb JOIN users u ON qb.uploaded_by=u.id WHERE 1=1`;
        const params = [];
        if (course_code) { sql += ' AND qb.course_code LIKE ?'; params.push('%'+course_code.toUpperCase()+'%'); }
        if (department) { sql += ' AND qb.department=?'; params.push(department); }
        if (semester) { sql += ' AND qb.semester=?'; params.push(semester); }
        if (year) { sql += ' AND qb.year=?'; params.push(year); }
        sql += ' ORDER BY qb.created_at DESC LIMIT 100';
        const questions = await global.db.all(sql, params);
        for (const q of questions) {
            const liked = await global.db.get('SELECT id FROM question_bank_likes WHERE question_id=? AND user_id=?', [q.id, req.user.id]);
            q.liked_by_me = !!liked;
        }
        res.json(questions);
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.downloadQuestion = async (req, res) => {
    try {
        await global.db.run('UPDATE question_bank SET download_count=download_count+1 WHERE id=?', [req.params.id]);
        const q = await global.db.get('SELECT file_url FROM question_bank WHERE id=?', [req.params.id]);
        if (!q) return res.status(404).json({ message: 'Not found' });
        res.json({ file_url: q.file_url });
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.likeQuestion = async (req, res) => {
    try {
        const existing = await global.db.get('SELECT id FROM question_bank_likes WHERE question_id=? AND user_id=?', [req.params.id, req.user.id]);
        if (existing) {
            await global.db.run('DELETE FROM question_bank_likes WHERE question_id=? AND user_id=?', [req.params.id, req.user.id]);
            await global.db.run('UPDATE question_bank SET like_count=MAX(0,like_count-1) WHERE id=?', [req.params.id]);
            return res.json({ liked: false });
        }
        await global.db.run('INSERT INTO question_bank_likes (question_id,user_id) VALUES (?,?)', [req.params.id, req.user.id]);
        await global.db.run('UPDATE question_bank SET like_count=like_count+1 WHERE id=?', [req.params.id]);
        res.json({ liked: true });
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.deleteQuestion = async (req, res) => {
    try {
        const q = await global.db.get('SELECT uploaded_by, course_code FROM question_bank WHERE id=?', [req.params.id]);
        if (!q) return res.status(404).json({ message: 'Not found' });
        if (String(q.uploaded_by) !== String(req.user.id) && req.user.role !== 'Admin') return res.status(403).json({ message: 'Not authorized' });
        await global.db.run('DELETE FROM question_bank_likes WHERE question_id=?', [req.params.id]);
        await global.db.run('DELETE FROM question_bank WHERE id=?', [req.params.id]);
        if (req.user.role === 'Admin' && String(q.uploaded_by) !== String(req.user.id)) {
            try {
                const adminUser = await global.db.get('SELECT fullName FROM users WHERE id=?', [req.user.id]);
                const adminName = adminUser?.fullName || 'Admin';
                const dateStr = new Date().toLocaleDateString('en-GB');
                const msg = `Your question bank "${(q.course_code||'').slice(0,40)}" was deleted by Admin ${adminName} on ${dateStr}`;
                await global.db.run('INSERT INTO notifications (recipient_id, sender_id, type, message) VALUES (?,?,?,?)', [q.uploaded_by, req.user.id, 'admin_delete', msg]);
                const io = req.app.get('io'); const onlineUsers = req.app.get('onlineUsers');
                if (io && onlineUsers) { const sock = onlineUsers.get(String(q.uploaded_by)); if (sock) io.to(sock).emit('new_notification', { message: msg, type: 'admin_delete' }); }
            } catch {}
        }
        res.json({ message: 'Question paper removed' });
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.updateQuestion = async (req, res) => {
    try {
        const q = await global.db.get('SELECT uploaded_by FROM question_bank WHERE id=?', [req.params.id]);
        if (!q) return res.status(404).json({ message: 'Not found' });
        if (String(q.uploaded_by) !== String(req.user.id) && req.user.role !== 'Admin') return res.status(403).json({ message: 'Not authorized' });
        const { course_code, course_name, department, semester, year, exam_type } = req.body;
        const fields=[], params=[];
        if(course_code!==undefined){ fields.push('course_code=?'); params.push(course_code.toUpperCase().trim()); }
        if(course_name!==undefined){ fields.push('course_name=?'); params.push(course_name); }
        if(department!==undefined){ fields.push('department=?'); params.push(department); }
        if(semester!==undefined){ fields.push('semester=?'); params.push(semester); }
        if(year!==undefined){ fields.push('year=?'); params.push(year); }
        if(exam_type!==undefined){ fields.push('exam_type=?'); params.push(exam_type); }
        if(!fields.length) return res.status(400).json({ message: 'No updates provided' });
        params.push(req.params.id);
        await global.db.run(`UPDATE question_bank SET ${fields.join(', ')} WHERE id=?`, params);
        const updated = await global.db.get('SELECT qb.*, u.fullName FROM question_bank qb JOIN users u ON qb.uploaded_by=u.id WHERE qb.id=?', [req.params.id]);
        res.json({ message: 'Updated', question: updated });
    } catch(e) { res.status(500).json({ message: e.message }); }
};
