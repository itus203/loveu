// Blood Donation Controller
exports.registerDonor = async (req, res) => {
    try {
        const { blood_group, name, phone, department, batch, location, last_donated, emergency_contact } = req.body;
        if (!blood_group || !name || !phone) return res.status(400).json({ message: 'Blood group, name and phone are required' });
        const valid = ['A+','A-','B+','B-','AB+','AB-','O+','O-'];
        if (!valid.includes(blood_group)) return res.status(400).json({ message: 'Invalid blood group' });

        // Check if user already registered
        const existing = await global.db.get('SELECT id FROM blood_donations WHERE user_id=?', [req.user.id]);
        if (existing) {
            await global.db.run(
                'UPDATE blood_donations SET blood_group=?,name=?,phone=?,department=?,batch=?,location=?,last_donated=?,emergency_contact=?,is_available=1,updated_at=CURRENT_TIMESTAMP WHERE user_id=?',
                [blood_group, name, phone, department||null, batch||null, location||null, last_donated||null, emergency_contact?1:0, req.user.id]
            );
            return res.json({ message: 'Donor profile updated successfully' });
        }
        await global.db.run(
            'INSERT INTO blood_donations (user_id,blood_group,name,phone,department,batch,location,last_donated,emergency_contact) VALUES (?,?,?,?,?,?,?,?,?)',
            [req.user.id, blood_group, name, phone, department||null, batch||null, location||null, last_donated||null, emergency_contact?1:0]
        );
        res.status(201).json({ message: 'Registered as blood donor successfully' });
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.getDonors = async (req, res) => {
    try {
        const { blood_group, emergency } = req.query;
        let sql = 'SELECT bd.*, u.profilePicture FROM blood_donations bd LEFT JOIN users u ON bd.user_id=u.id WHERE bd.is_available=1';
        const params = [];
        if (blood_group) { sql += ' AND bd.blood_group=?'; params.push(blood_group); }
        if (emergency === 'true') { sql += ' AND bd.emergency_contact=1'; }
        sql += ' ORDER BY bd.emergency_contact DESC, bd.updated_at DESC';
        const donors = await global.db.all(sql, params);
        res.json(donors);
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.toggleAvailability = async (req, res) => {
    try {
        const donor = await global.db.get('SELECT id, is_available FROM blood_donations WHERE user_id=?', [req.user.id]);
        if (!donor) return res.status(404).json({ message: 'Donor profile not found' });
        const newStatus = donor.is_available ? 0 : 1;
        await global.db.run('UPDATE blood_donations SET is_available=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?', [newStatus, req.user.id]);
        res.json({ message: newStatus ? 'You are now available for donation' : 'Marked as unavailable', is_available: newStatus });
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.getMyDonorProfile = async (req, res) => {
    try {
        const donor = await global.db.get('SELECT * FROM blood_donations WHERE user_id=?', [req.user.id]);
        res.json(donor || null);
    } catch(e) { res.status(500).json({ message: e.message }); }
};

// ─── Blood Requests — Globally visible (like Marketplace) ─────────────────
exports.getRequests = async (req, res) => {
    try {
        const { bloodGroup, urgency } = req.query;
        let sql = 'SELECT br.*, u.fullName, u.profilePicture, u.department FROM blood_requests br LEFT JOIN users u ON br.user_id=u.id WHERE br.status=\'active\'';
        const params=[];
        if(bloodGroup && bloodGroup!=='all'){ sql+=' AND br.bloodGroup=?'; params.push(bloodGroup); }
        if(urgency && urgency!=='all'){ sql+=' AND br.urgency=?'; params.push(urgency); }
        sql+=' ORDER BY CASE br.urgency WHEN \'critical\' THEN 1 WHEN \'soon\' THEN 2 ELSE 3 END, br.created_at DESC';
        const rows=await global.db.all(sql, params);
        res.json(rows);
    } catch(e){ res.status(500).json({message:e.message}); }
};
exports.postRequest = async (req, res) => {
    try{
        const { bloodGroup, patientName, hospital, dateNeeded, urgency, contactNum, details } = req.body;
        if(!bloodGroup||!patientName||!hospital||!dateNeeded||!contactNum) return res.status(400).json({message:'All required fields are needed'});
        const result=await global.db.run(
            'INSERT INTO blood_requests (user_id, bloodGroup, patientName, hospital, dateNeeded, urgency, contactNum, details) VALUES (?,?,?,?,?,?,?,?)',
            [req.user.id, bloodGroup, patientName, hospital, dateNeeded, urgency||'critical', contactNum, details||'']
        );
        const created=await global.db.get('SELECT br.*, u.fullName FROM blood_requests br LEFT JOIN users u ON br.user_id=u.id WHERE br.id=?',[result.lastID]);
        // Notify via socket if needed
        try{
            const io=req.app.get('io');
            if(io) io.emit('blood_request_new', created);
        }catch{}
        res.status(201).json(created);
    }catch(e){ res.status(500).json({message:e.message}); }
};
exports.deleteRequest = async (req, res) => {
    try{
        const br=await global.db.get('SELECT user_id, patientName FROM blood_requests WHERE id=?',[req.params.id]);
        if(!br) return res.status(404).json({message:'Not found'});
        if(String(br.user_id)!==String(req.user.id) && req.user.role!=='Admin') return res.status(403).json({message:'Not authorized'});
        await global.db.run('UPDATE blood_requests SET status=\'deleted\' WHERE id=?',[req.params.id]);
        if (req.user.role === 'Admin' && String(br.user_id) !== String(req.user.id)) {
            try {
                const adminUser = await global.db.get('SELECT fullName FROM users WHERE id=?', [req.user.id]);
                const adminName = adminUser?.fullName || 'Admin';
                const dateStr = new Date().toLocaleDateString('en-GB');
                const msg = `Your blood request "${(br.patientName||'').slice(0,40)}" was deleted by Admin ${adminName} on ${dateStr}`;
                await global.db.run('INSERT INTO notifications (recipient_id, sender_id, type, message) VALUES (?,?,?,?)', [br.user_id, req.user.id, 'admin_delete', msg]);
                const io = req.app.get('io'); const onlineUsers = req.app.get('onlineUsers');
                if (io && onlineUsers) { const sock = onlineUsers.get(String(br.user_id)); if (sock) io.to(sock).emit('new_notification', { message: msg, type: 'admin_delete' }); }
            } catch {}
        }
        res.json({message:'Deleted'});
    }catch(e){ res.status(500).json({message:e.message}); }
};
exports.updateRequest = async (req, res) => {
    try{
        const br=await global.db.get('SELECT user_id FROM blood_requests WHERE id=?',[req.params.id]);
        if(!br) return res.status(404).json({message:'Not found'});
        if(String(br.user_id)!==String(req.user.id) && req.user.role!=='Admin') return res.status(403).json({message:'Not authorized'});
        const { bloodGroup, patientName, hospital, dateNeeded, urgency, contactNum, details } = req.body;
        const fields=[], params=[];
        if(bloodGroup!==undefined){ fields.push('bloodGroup=?'); params.push(bloodGroup); }
        if(patientName!==undefined){ fields.push('patientName=?'); params.push(patientName); }
        if(hospital!==undefined){ fields.push('hospital=?'); params.push(hospital); }
        if(dateNeeded!==undefined){ fields.push('dateNeeded=?'); params.push(dateNeeded); }
        if(urgency!==undefined){ fields.push('urgency=?'); params.push(urgency); }
        if(contactNum!==undefined){ fields.push('contactNum=?'); params.push(contactNum); }
        if(details!==undefined){ fields.push('details=?'); params.push(details); }
        if(!fields.length) return res.status(400).json({message:'No updates provided'});
        params.push(req.params.id);
        await global.db.run(`UPDATE blood_requests SET ${fields.join(', ')} WHERE id=?`, params);
        const updated=await global.db.get('SELECT br.*, u.fullName FROM blood_requests br LEFT JOIN users u ON br.user_id=u.id WHERE br.id=?', [req.params.id]);
        res.json({message:'Updated', request: updated});
    }catch(e){ res.status(500).json({message:e.message}); }
};
