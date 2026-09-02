exports.getHouses = async (req, res) => {
    try {
        const { category, search } = req.query;
        let sql = 'SELECT h.*, u.fullName, u.profilePicture FROM housing_posts h LEFT JOIN users u ON h.user_id=u.id WHERE h.status=\'active\'';
        const params=[];
        if(category && category!=='all'){ sql+=' AND h.category=?'; params.push(category); }
        if(search){ sql+=' AND (h.title LIKE ? OR h.location LIKE ? OR h.category LIKE ?)'; const q=`%${search}%`; params.push(q,q,q); }
        sql+=' ORDER BY h.created_at DESC';
        const rows=await global.db.all(sql, params);
        res.json(rows);
    } catch(e){ res.status(500).json({message:e.message}); }
};
exports.postHouse = async (req, res) => {
    try{
        const { title, category, price, location, contact, facilities, description } = req.body;
        if(!title||!price||!location||!contact) return res.status(400).json({message:'Title, price, location and contact are required'});
        let imageUrl=null;
        if(req.file) imageUrl=req.file.path || req.file.secure_url || req.file.url || `/uploads/${req.file.filename}`;
        else if(req.body.image) imageUrl=req.body.image;
        // Try to handle base64 image from client (data URL)
        if(!imageUrl && req.body.imageData){
            // For now, if client sends base64, we can't handle without file, just store as is (not ideal)
            imageUrl=req.body.imageData;
        }
        const result=await global.db.run(
            'INSERT INTO housing_posts (user_id, title, category, price, location, contact, facilities, description, image) VALUES (?,?,?,?,?,?,?,?,?)',
            [req.user.id, title, category||'Mess Seat', price, location, contact, facilities||'', description||'', imageUrl]
        );
        const created=await global.db.get('SELECT h.*, u.fullName FROM housing_posts h LEFT JOIN users u ON h.user_id=u.id WHERE h.id=?',[result.lastID]);
        // Broadcast via socket for global visibility
        try{ const io=req.app.get('io'); if(io) io.emit('housing_new', created); }catch{}
        res.status(201).json(created);
    }catch(e){ console.error('postHouse',e); res.status(500).json({message:e.message}); }
};
exports.deleteHouse = async (req, res) => {
    try{
        const house=await global.db.get('SELECT user_id, title FROM housing_posts WHERE id=?',[req.params.id]);
        if(!house) return res.status(404).json({message:'Not found'});
        if(String(house.user_id)!==String(req.user.id) && req.user.role!=='Admin') return res.status(403).json({message:'Not authorized'});
        await global.db.run("UPDATE housing_posts SET status='deleted' WHERE id=?",[req.params.id]);
        if (req.user.role === 'Admin' && String(house.user_id) !== String(req.user.id)) {
            try {
                const adminUser = await global.db.get('SELECT fullName FROM users WHERE id=?', [req.user.id]);
                const adminName = adminUser?.fullName || 'Admin';
                const dateStr = new Date().toLocaleDateString('en-GB');
                const msg = `Your housing post "${(house.title||'').slice(0,40)}" was deleted by Admin ${adminName} on ${dateStr}`;
                await global.db.run('INSERT INTO notifications (recipient_id, sender_id, type, message) VALUES (?,?,?,?)', [house.user_id, req.user.id, 'admin_delete', msg]);
                const io = req.app.get('io'); const onlineUsers = req.app.get('onlineUsers');
                if (io && onlineUsers) { const sock = onlineUsers.get(String(house.user_id)); if (sock) io.to(sock).emit('new_notification', { message: msg, type: 'admin_delete' }); }
            } catch {}
        }
        res.json({message:'Deleted'});
    }catch(e){ res.status(500).json({message:e.message}); }
};
exports.updateHouse = async (req, res) => {
    try{
        const house=await global.db.get('SELECT * FROM housing_posts WHERE id=?',[req.params.id]);
        if(!house) return res.status(404).json({message:'Not found'});
        if(String(house.user_id)!==String(req.user.id) && req.user.role!=='Admin') return res.status(403).json({message:'Not authorized'});
        const { title, category, price, location, contact, facilities, description } = req.body;
        const fields=[], params=[];
        if(title!==undefined){ fields.push('title=?'); params.push(title); }
        if(category!==undefined){ fields.push('category=?'); params.push(category); }
        if(price!==undefined){ fields.push('price=?'); params.push(price); }
        if(location!==undefined){ fields.push('location=?'); params.push(location); }
        if(contact!==undefined){ fields.push('contact=?'); params.push(contact); }
        if(facilities!==undefined){ fields.push('facilities=?'); params.push(facilities); }
        if(description!==undefined){ fields.push('description=?'); params.push(description); }
        if(req.file){ fields.push('image=?'); params.push(req.file.path || req.file.secure_url || req.file.url || `/uploads/${req.file.filename}`); }
        if(!fields.length) return res.status(400).json({message:'No updates provided'});
        params.push(req.params.id);
        await global.db.run(`UPDATE housing_posts SET ${fields.join(', ')} WHERE id=?`, params);
        const updated=await global.db.get('SELECT h.*, u.fullName FROM housing_posts h LEFT JOIN users u ON h.user_id=u.id WHERE h.id=?',[req.params.id]);
        res.json({message:'Updated', house: updated});
    }catch(e){ res.status(500).json({message:e.message}); }
};
exports.addReview = async (req, res) => {
    try{
        const { rating, text } = req.body;
        const houseId=req.params.id;
        if(!text) return res.status(400).json({message:'Review text required'});
        // For simplicity, store reviews in a separate table or as JSON? We'll create housing_reviews table if not exists is handled in db.js, but for now store in memory via housing_posts reviews JSON?
        // Since we don't have a dedicated reviews table for housing, we'll use a simple housing_reviews table.
        await global.db.run('INSERT INTO housing_reviews (house_id, user_id, rating, text) VALUES (?,?,?,?)',[houseId, req.user.id, rating||5, text]);
        res.status(201).json({message:'Review added'});
    }catch(e){ res.status(500).json({message:e.message}); }
};
exports.getReviews = async (req, res) => {
    try{
        const rows=await global.db.all('SELECT hr.*, u.fullName FROM housing_reviews hr LEFT JOIN users u ON hr.user_id=u.id WHERE hr.house_id=? ORDER BY hr.created_at DESC',[req.params.id]);
        res.json(rows);
    }catch(e){ res.status(500).json({message:e.message}); }
};
exports.deleteReview = async (req, res) => {
    try{
        const review=await global.db.get('SELECT * FROM housing_reviews WHERE id=?',[req.params.rid]);
        if(!review) return res.status(404).json({message:'Review not found'});
        if(String(review.user_id)!==String(req.user.id) && req.user.role!=='Admin') return res.status(403).json({message:'Not authorized'});
        await global.db.run('DELETE FROM housing_reviews WHERE id=?',[req.params.rid]);
        if(req.user.role==='Admin' && String(review.user_id)!==String(req.user.id)){
            try{
                const adminUser=await global.db.get('SELECT fullName FROM users WHERE id=?',[req.user.id]);
                const adminName=adminUser?.fullName||'Admin';
                const dateStr=new Date().toLocaleDateString('en-GB');
                const msg=`Your housing review "${(review.text||'').slice(0,40)}" was deleted by Admin ${adminName} on ${dateStr}`;
                await global.db.run('INSERT INTO notifications (recipient_id, sender_id, type, message) VALUES (?,?,?,?)',[review.user_id, req.user.id, 'admin_delete', msg]);
                const io=req.app.get('io'); const onlineUsers=req.app.get('onlineUsers');
                if(io&&onlineUsers){const s=onlineUsers.get(String(review.user_id)); if(s) io.to(s).emit('new_notification',{message:msg,type:'admin_delete'});}
            }catch{}
        }
        res.json({message:'Review deleted'});
    }catch(e){ res.status(500).json({message:e.message}); }
};
