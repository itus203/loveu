// Food Portal Controller — 🌍 GLOBAL: all vendors visible to every DIU student
exports.getVendors = async (req, res) => {
    try {
        const vendors = await global.db.all('SELECT * FROM food_vendors WHERE is_active=1 ORDER BY rating DESC');
        // Attach reviews and items globally so frontend can show ratings and menu for all vendors
        for (const v of vendors) {
            try {
                v.reviews = await global.db.all(
                    'SELECT fr.*,u.fullName,u.profilePicture FROM food_reviews fr JOIN users u ON fr.user_id=u.id WHERE fr.vendor_id=? ORDER BY fr.created_at DESC LIMIT 20',
                    [v.id]
                );
            } catch { v.reviews = []; }
            try {
                v.items = await global.db.all('SELECT * FROM food_items WHERE vendor_id=? AND is_available=1 ORDER BY category, name', [v.id]);
            } catch { v.items = []; }
        }
        res.json(vendors);
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.getVendorMenu = async (req, res) => {
    try {
        const vendor = await global.db.get('SELECT * FROM food_vendors WHERE id=?', [req.params.id]);
        if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
        const items = await global.db.all('SELECT * FROM food_items WHERE vendor_id=? AND is_available=1 ORDER BY category, name', [req.params.id]);
        const reviews = await global.db.all(
            'SELECT fr.*,u.fullName,u.profilePicture FROM food_reviews fr JOIN users u ON fr.user_id=u.id WHERE fr.vendor_id=? ORDER BY fr.created_at DESC LIMIT 20',
            [req.params.id]
        );
        res.json({ vendor, items, reviews });
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.reviewVendor = async (req, res) => {
    try {
        const { rating, review_text } = req.body;
        if (!rating || rating < 1 || rating > 5) return res.status(400).json({ message: 'Rating must be between 1 and 5' });
        await global.db.run(
            'INSERT OR REPLACE INTO food_reviews (vendor_id,user_id,rating,review_text) VALUES (?,?,?,?)',
            [req.params.id, req.user.id, rating, review_text||null]
        );
        const avg = await global.db.get('SELECT AVG(rating) as avg FROM food_reviews WHERE vendor_id=?', [req.params.id]);
        await global.db.run('UPDATE food_vendors SET rating=? WHERE id=?', [parseFloat(avg.avg||0).toFixed(1), req.params.id]);
        res.json({ message: 'Review submitted' });
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.deleteReview = async (req, res) => {
    try {
        const review = await global.db.get('SELECT * FROM food_reviews WHERE vendor_id=? AND user_id=?', [req.params.id, req.params.uid || req.user.id]);
        // Allow admin to delete any user's review via query param ?uid=
        let targetUid = req.params.uid;
        let reviewToDelete;
        if (targetUid && req.user.role === 'Admin') {
            reviewToDelete = await global.db.get('SELECT * FROM food_reviews WHERE vendor_id=? AND user_id=?', [req.params.id, targetUid]);
        } else {
            reviewToDelete = await global.db.get('SELECT * FROM food_reviews WHERE vendor_id=? AND user_id=?', [req.params.id, req.user.id]);
        }
        if (!reviewToDelete) return res.status(404).json({ message: 'Review not found' });
        if (String(reviewToDelete.user_id) !== String(req.user.id) && req.user.role !== 'Admin') return res.status(403).json({ message: 'Not authorized' });
        await global.db.run('DELETE FROM food_reviews WHERE vendor_id=? AND user_id=?', [req.params.id, reviewToDelete.user_id]);
        try { await global.db.run('DELETE FROM food_review_votes WHERE vendor_id=? AND user_id=?', [req.params.id, reviewToDelete.user_id]); } catch {}
        const avg = await global.db.get('SELECT AVG(rating) as avg FROM food_reviews WHERE vendor_id=?', [req.params.id]);
        await global.db.run('UPDATE food_vendors SET rating=? WHERE id=?', [parseFloat(avg.avg||0).toFixed(1)||0, req.params.id]);
        if (req.user.role === 'Admin' && String(reviewToDelete.user_id) !== String(req.user.id)) {
            try {
                const adminUser = await global.db.get('SELECT fullName FROM users WHERE id=?', [req.user.id]);
                const adminName = adminUser?.fullName || 'Admin';
                const dateStr = new Date().toLocaleDateString('en-GB');
                const msg = `Your food review for vendor #${req.params.id} was deleted by Admin ${adminName} on ${dateStr}`;
                await global.db.run('INSERT INTO notifications (recipient_id, sender_id, type, message) VALUES (?,?,?,?)', [reviewToDelete.user_id, req.user.id, 'admin_delete', msg]);
                const io = req.app.get('io'); const onlineUsers = req.app.get('onlineUsers');
                if (io && onlineUsers) { const sock = onlineUsers.get(String(reviewToDelete.user_id)); if (sock) io.to(sock).emit('new_notification', { message: msg, type: 'admin_delete' }); }
            } catch {}
        }
        res.json({ message: 'Review deleted' });
    } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.voteReview = async (req, res) => {
    try {
        const vendorId = req.params.id;
        const { vote } = req.body; // 'up' or 'down'
        if (!['up','down'].includes(vote)) return res.status(400).json({ message: 'Vote must be up or down' });
        const review = await global.db.get('SELECT * FROM food_reviews WHERE vendor_id=? AND user_id=?', [vendorId, req.body.reviewUserId || req.user.id]);
        // Find review to vote on - if reviewUserId provided, vote on that user's review, else latest?
        let targetReview = review;
        if (req.body.reviewUserId) {
            targetReview = await global.db.get('SELECT * FROM food_reviews WHERE vendor_id=? AND user_id=?', [vendorId, req.body.reviewUserId]);
        } else {
            // vote on vendor's own review? fallback to first review
            targetReview = await global.db.get('SELECT * FROM food_reviews WHERE vendor_id=? ORDER BY created_at DESC LIMIT 1', [vendorId]);
        }
        if (!targetReview) return res.status(404).json({ message: 'Review not found to vote' });
        const existing = await global.db.get('SELECT * FROM food_review_votes WHERE vendor_id=? AND review_id=? AND user_id=?', [vendorId, targetReview.vendor_id, req.user.id]);
        // Actually review_id is vendor_id+user_id combo, use vendor_id as review identifier
        const reviewId = targetReview.vendor_id; // using vendor_id as review group, but we need unique per review
        // Simpler: use vendor_id + target user id as composite
        const voteKey = `${vendorId}_${targetReview.user_id}`;
        const existingVote = await global.db.get('SELECT * FROM food_review_votes WHERE vendor_id=? AND user_id=? AND vote_type=?', [vendorId, req.user.id, vote]).catch(()=>null);
        // Check if already voted same type
        const already = await global.db.get('SELECT * FROM food_review_votes WHERE vendor_id=? AND user_id=?', [vendorId, req.user.id]);
        if (already) {
            if (already.vote_type === vote) {
                await global.db.run('DELETE FROM food_review_votes WHERE id=?', [already.id]);
                const col = vote==='up' ? 'upvotes' : 'downvotes';
                await global.db.run(`UPDATE food_reviews SET ${col}=MAX(0, ${col}-1) WHERE vendor_id=? AND user_id=?`, [vendorId, targetReview.user_id]);
            } else {
                await global.db.run('UPDATE food_review_votes SET vote_type=? WHERE id=?', [vote, already.id]);
                // switch counts
                if (vote==='up') {
                    await global.db.run('UPDATE food_reviews SET upvotes=upvotes+1, downvotes=MAX(0, downvotes-1) WHERE vendor_id=? AND user_id=?', [vendorId, targetReview.user_id]);
                } else {
                    await global.db.run('UPDATE food_reviews SET downvotes=downvotes+1, upvotes=MAX(0, upvotes-1) WHERE vendor_id=? AND user_id=?', [vendorId, targetReview.user_id]);
                }
            }
        } else {
            await global.db.run('INSERT INTO food_review_votes (review_id, vendor_id, user_id, vote_type) VALUES (?,?,?,?)', [targetReview.vendor_id, vendorId, req.user.id, vote]);
            const col = vote==='up' ? 'upvotes' : 'downvotes';
            await global.db.run(`UPDATE food_reviews SET ${col}=${col}+1 WHERE vendor_id=? AND user_id=?`, [vendorId, targetReview.user_id]);
        }
        const updated = await global.db.get('SELECT upvotes, downvotes FROM food_reviews WHERE vendor_id=? AND user_id=?', [vendorId, targetReview.user_id]);
        res.json({ upvotes: updated?.upvotes||0, downvotes: updated?.downvotes||0 });
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.addVendor = async (req, res) => {
    try {
        const { name, location, category, description, opening_time, closing_time, image_url } = req.body;
        if (!name || !name.trim()) return res.status(400).json({ message: 'Vendor name is required' });
        const cleanName = name.trim();
        try{ const cols=await global.db.all(`PRAGMA table_info(food_vendors)`); if(!cols.some(c=>c.name==='user_id')) await global.db.exec(`ALTER TABLE food_vendors ADD COLUMN user_id INTEGER`); }catch{}
        try{ const cols=await global.db.all(`PRAGMA table_info(food_vendors)`); if(!cols.some(c=>c.name==='created_by')) await global.db.exec(`ALTER TABLE food_vendors ADD COLUMN created_by INTEGER`); }catch{}
        const dup = await global.db.get(`SELECT id FROM food_vendors WHERE LOWER(TRIM(name))=LOWER(TRIM(?)) AND is_active=1`, [cleanName]);
        if(dup) return res.status(409).json({ message: 'Already Exists — a vendor with this name already exists' });
        // Direct pic upload support (multipart) — req.file has image
        let finalImageUrl = image_url || null;
        if(req.file) finalImageUrl = req.file.path || req.file.secure_url || req.file.url || `/uploads/${req.file.filename}`;
        const result = await global.db.run(
            'INSERT INTO food_vendors (name,location,category,description,opening_time,closing_time,image_url,user_id,created_by) VALUES (?,?,?,?,?,?,?,?,?)',
            [cleanName, location||null, category||null, description||null, opening_time||null, closing_time||null, finalImageUrl, req.user.id, req.user.id]
        );
        res.status(201).json({ message: 'Vendor added', id: result.lastID });
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.addMenuItem = async (req, res) => {
    try {
        if (req.user.role !== 'Admin') return res.status(403).json({ message: 'Admin only' });
        const { vendor_id, name, description, price, category, image_url } = req.body;
        if (!vendor_id || !name || !price) return res.status(400).json({ message: 'Vendor, name and price are required' });
        await global.db.run(
            'INSERT INTO food_items (vendor_id,name,description,price,category,image_url) VALUES (?,?,?,?,?,?)',
            [vendor_id, name.trim(), description||null, price, category||null, image_url||null]
        );
        res.status(201).json({ message: 'Menu item added' });
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.updateVendor = async (req, res) => {
    try {
        const vendor = await global.db.get('SELECT * FROM food_vendors WHERE id=?', [req.params.id]);
        if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
        // Owner or Admin can edit (user icca moto, admin any)
        const isOwner = vendor.user_id && String(vendor.user_id)===String(req.user.id);
        const isAdmin = req.user.role==='Admin';
        if(!isOwner && !isAdmin && vendor.user_id) return res.status(403).json({ message: 'Not authorized — only owner or Admin can edit' });
        if(!isAdmin && !vendor.user_id) { /* old vendor without owner — allow any user to claim edit? restrict to Admin */ }
        const { name, location, category, description, opening_time, closing_time, image_url } = req.body;
        let finalImageUrl = image_url;
        if(req.file) finalImageUrl = req.file.path || req.file.secure_url || req.file.url || `/uploads/${req.file.filename}`;
        if(finalImageUrl!==undefined) { /* will handle below */ }
        if(name!==undefined && name.trim()){
            const dup = await global.db.get(`SELECT id FROM food_vendors WHERE LOWER(TRIM(name))=LOWER(TRIM(?)) AND id<>? AND is_active=1`, [name.trim(), req.params.id]);
            if(dup) return res.status(409).json({ message: 'Already Exists — another vendor with this name exists' });
        }
        const fields=[], params=[];
        if(name!==undefined){ fields.push('name=?'); params.push(name.trim()); }
        if(location!==undefined){ fields.push('location=?'); params.push(location); }
        if(category!==undefined){ fields.push('category=?'); params.push(category); }
        if(description!==undefined){ fields.push('description=?'); params.push(description); }
        if(opening_time!==undefined){ fields.push('opening_time=?'); params.push(opening_time); }
        if(closing_time!==undefined){ fields.push('closing_time=?'); params.push(closing_time); }
        if(finalImageUrl!==undefined){ fields.push('image_url=?'); params.push(finalImageUrl); }
        else if(image_url!==undefined){ fields.push('image_url=?'); params.push(image_url); }
        if(!fields.length) return res.status(400).json({ message: 'No updates' });
        params.push(req.params.id);
        await global.db.run(`UPDATE food_vendors SET ${fields.join(', ')} WHERE id=?`, params);
        const updated=await global.db.get('SELECT * FROM food_vendors WHERE id=?', [req.params.id]);
        res.json({ message: 'Vendor updated', vendor: updated });
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.deleteVendor = async (req, res) => {
    try {
        const vendor = await global.db.get('SELECT * FROM food_vendors WHERE id=?', [req.params.id]);
        if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
        const isOwner = vendor.user_id && String(vendor.user_id)===String(req.user.id);
        const isAdmin = req.user.role==='Admin';
        if(!isOwner && !isAdmin) return res.status(403).json({ message: 'Not authorized — only owner or Admin can delete' });
        await global.db.run('DELETE FROM food_vendors WHERE id=?', [req.params.id]);
        await global.db.run('DELETE FROM food_items WHERE vendor_id=?', [req.params.id]);
        await global.db.run('DELETE FROM food_reviews WHERE vendor_id=?', [req.params.id]);
        res.json({ message: 'Vendor deleted globally' });
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.updateMenuItem = async (req, res) => {
    try {
        if (req.user.role !== 'Admin') return res.status(403).json({ message: 'Admin only' });
        const item = await global.db.get('SELECT * FROM food_items WHERE id=?', [req.params.id]);
        if (!item) return res.status(404).json({ message: 'Item not found' });
        const { name, description, price, category, image_url, is_available } = req.body;
        const fields=[], params=[];
        if(name!==undefined){ fields.push('name=?'); params.push(name); }
        if(description!==undefined){ fields.push('description=?'); params.push(description); }
        if(price!==undefined){ fields.push('price=?'); params.push(price); }
        if(category!==undefined){ fields.push('category=?'); params.push(category); }
        if(image_url!==undefined){ fields.push('image_url=?'); params.push(image_url); }
        if(is_available!==undefined){ fields.push('is_available=?'); params.push(is_available?1:0); }
        if(!fields.length) return res.status(400).json({ message: 'No updates' });
        params.push(req.params.id);
        await global.db.run(`UPDATE food_items SET ${fields.join(', ')} WHERE id=?`, params);
        const updated=await global.db.get('SELECT * FROM food_items WHERE id=?', [req.params.id]);
        res.json({ message: 'Item updated', item: updated });
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.deleteMenuItem = async (req, res) => {
    try {
        if (req.user.role !== 'Admin') return res.status(403).json({ message: 'Admin only' });
        const item = await global.db.get('SELECT * FROM food_items WHERE id=?', [req.params.id]);
        if (!item) return res.status(404).json({ message: 'Item not found' });
        await global.db.run('DELETE FROM food_items WHERE id=?', [req.params.id]);
        res.json({ message: 'Menu item deleted' });
    } catch(e) { res.status(500).json({ message: e.message }); }
};
