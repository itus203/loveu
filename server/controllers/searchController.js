exports.search = async (req, res) => {
    try {
        const { q } = req.query;
        if (!q || q.trim().length < 2) return res.json({ users: [], posts: [], resources: [], blood: [], housing: [], marketplace: [], events: [], lostfound: [] });
        const query = `%${q.trim()}%`;
        const isPg = !!(global.db && global.db.isPostgres);
        const likeOp = isPg ? 'ILIKE' : 'LIKE';
        // Helper to safe query (table may not exist on old DB)
        const safeAll = async (sql, params) => { try { return await global.db.all(sql, params); } catch { return []; } };
        let [users, posts, resources, blood, housing, marketplace, events, lostfound] = await Promise.all([
            safeAll(`SELECT id as _id, fullName, profilePicture, department, batch, role FROM users WHERE fullName ${likeOp} ? OR department ${likeOp} ? OR batch ${likeOp} ? LIMIT 10`, [query, query, query]),
            safeAll(`SELECT p.id as _id, p.content, p.created_at, u.fullName, u.profilePicture FROM posts p JOIN users u ON p.user_id=u.id WHERE p.content ${likeOp} ? AND p.visibility='Public' ORDER BY p.created_at DESC LIMIT 10`, [query]),
            safeAll(`SELECT id as _id, title, description, department, subject, fileUrl FROM resources WHERE title ${likeOp} ? OR description ${likeOp} ? OR department ${likeOp} ? OR subject ${likeOp} ? LIMIT 10`, [query, query, query, query]),
            safeAll(`SELECT id as _id, bloodGroup, patientName, hospital, urgency, contactNum FROM blood_requests WHERE bloodGroup ${likeOp} ? OR patientName ${likeOp} ? OR hospital ${likeOp} ? LIMIT 10`, [query, query, query]),
            safeAll(`SELECT id as _id, title, location, price, category FROM housing_posts WHERE title ${likeOp} ? OR location ${likeOp} ? OR category ${likeOp} ? LIMIT 10`, [query, query, query]),
            safeAll(`SELECT id as _id, title, description, price, category FROM marketplace WHERE title ${likeOp} ? OR description ${likeOp} ? OR category ${likeOp} ? LIMIT 10`, [query, query, query]),
            safeAll(`SELECT id as _id, title, venue, department, event_date FROM events WHERE title ${likeOp} ? OR venue ${likeOp} ? OR department ${likeOp} ? LIMIT 10`, [query, query, query]),
            safeAll(`SELECT id as _id, title, description, location, type FROM lost_found WHERE title ${likeOp} ? OR description ${likeOp} ? OR location ${likeOp} ? LIMIT 10`, [query, query, query])
        ]);
        users = users.map(u => ({ ...u, fullName: u.fullName||u.fullname, profilePicture: u.profilePicture||u.profilepicture, _id: u._id||u.id }));
        posts = posts.map(p => ({ ...p, fullName: p.fullName||p.fullname, profilePicture: p.profilePicture||p.profilepicture, content: p.content, created_at: p.created_at||p.createdat }));
        resources = resources.map(r => ({ ...r, title: r.title, description: r.description, department: r.department||r.subject, _id: r._id||r.id }));
        blood = blood.map(b => ({ ...b, bloodGroup: b.bloodGroup||b.bloodgroup, patientName: b.patientName||b.patientname, hospital: b.hospital, _id: b._id||b.id }));
        housing = housing.map(h => ({ ...h, title: h.title, location: h.location, _id: h._id||h.id }));
        marketplace = marketplace.map(m => ({ ...m, title: m.title, _id: m._id||m.id }));
        events = events.map(e => ({ ...e, title: e.title, _id: e._id||e.id }));
        lostfound = lostfound.map(l => ({ ...l, title: l.title, _id: l._id||l.id }));
        res.json({ users, posts, resources, blood, housing, marketplace, events, lostfound });
    } catch (e) { res.status(500).json({ message: e.message }); }
};
