const router = require('express').Router();
const auth = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');
const { getEvents, createEvent, rsvpEvent } = require('../controllers/eventController');

const adminOnly = (req, res, next) => {
    if (req.user?.role !== 'Admin') return res.status(403).json({ message: 'Admin only' });
    next();
};

router.get('/', auth, getEvents);
router.post('/', auth, upload.single('cover_image'), createEvent);
router.post('/:id/rsvp', auth, rsvpEvent);
// Admin event management
router.put('/:id/feature', auth, adminOnly, async (req, res) => {
    try {
        await global.db.run('UPDATE events SET isFeatured=? WHERE id=?', [req.body.isFeatured ? 1 : 0, req.params.id]);
        res.json({ message: 'Updated' });
    } catch(e) { res.status(500).json({ message: e.message }); }
});
router.delete('/:id', auth, async (req, res) => {
    try {
        const ev = await global.db.get('SELECT creator_id, title FROM events WHERE id=?', [req.params.id]);
        if (!ev) return res.status(404).json({ message: 'Event not found' });
        if (String(ev.creator_id) !== String(req.user.id) && req.user.role !== 'Admin') return res.status(403).json({ message: 'Not authorized' });
        await global.db.run('DELETE FROM events WHERE id=?', [req.params.id]);
        await global.db.run('DELETE FROM event_rsvps WHERE event_id=?', [req.params.id]).catch(()=>{});
        if (req.user.role === 'Admin' && String(ev.creator_id) !== String(req.user.id)) {
            try {
                const adminUser = await global.db.get('SELECT fullName FROM users WHERE id=?', [req.user.id]);
                const adminName = adminUser?.fullName || 'Admin';
                const dateStr = new Date().toLocaleDateString('en-GB');
                const msg = `Your event "${(ev.title||'').slice(0,40)}" was deleted by Admin ${adminName} on ${dateStr}`;
                await global.db.run('INSERT INTO notifications (recipient_id, sender_id, type, message) VALUES (?,?,?,?)', [ev.creator_id, req.user.id, 'admin_delete', msg]);
                const io = req.app.get('io'); const onlineUsers = req.app.get('onlineUsers');
                if (io && onlineUsers) { const sock = onlineUsers.get(String(ev.creator_id)); if (sock) io.to(sock).emit('new_notification', { message: msg, type: 'admin_delete' }); }
            } catch {}
        }
        res.json({ message: 'Event deleted' });
    } catch(e) { res.status(500).json({ message: e.message }); }
});
router.put('/:id', auth, upload.single('cover_image'), async (req, res) => {
    try {
        const ev = await global.db.get('SELECT creator_id FROM events WHERE id=?', [req.params.id]);
        if (!ev) return res.status(404).json({ message: 'Event not found' });
        if (String(ev.creator_id) !== String(req.user.id) && req.user.role !== 'Admin') return res.status(403).json({ message: 'Not authorized' });
        const { title, description, venue, event_date, department } = req.body;
        const fields=[], params=[];
        if(title!==undefined){ fields.push('title=?'); params.push(title); }
        if(description!==undefined){ fields.push('description=?'); params.push(description); }
        if(venue!==undefined){ fields.push('venue=?'); params.push(venue); }
        if(event_date!==undefined){ fields.push('event_date=?'); params.push(event_date); }
        if(department!==undefined){ fields.push('department=?'); params.push(department); }
        if(req.file){ fields.push('cover_image=?'); params.push(`/uploads/${req.file.filename}`); }
        if(!fields.length) return res.status(400).json({ message: 'No updates provided' });
        params.push(req.params.id);
        await global.db.run(`UPDATE events SET ${fields.join(', ')} WHERE id=?`, params);
        const updated = await global.db.get('SELECT e.*, u.fullName as creatorName FROM events e JOIN users u ON e.creator_id=u.id WHERE e.id=?', [req.params.id]);
        res.json({ message: 'Event updated', event: updated });
    } catch(e) { res.status(500).json({ message: e.message }); }
});
module.exports = router;
