const path = require('path');

// ─── Helpers ───────────────────────────────────────────────────────────────
async function isBlocked(a, b) {
    if (!a || !b) return false;
    const row = await global.db.get(`SELECT 1 FROM blocked_users WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?)`, [a,b,b,a]);
    return !!row;
}
async function getReactionsForMessages(msgIds, isGroup) {
    if (!msgIds.length) return {};
    const placeholders = msgIds.map(()=>'?').join(',');
    const rows = await global.db.all(`SELECT message_id, emoji, user_id FROM message_reactions WHERE is_group=? AND message_id IN (${placeholders})`, [isGroup?1:0, ...msgIds]);
    const map = {};
    msgIds.forEach(id=> map[id]=[]);
    rows.forEach(r=>{
        if (!map[r.message_id]) map[r.message_id]=[];
        map[r.message_id].push(r);
    });
    return map;
}
function aggregateReactions(list) {
    if (!list || !list.length) return [];
    const agg = {};
    list.forEach(r=>{
        if (!agg[r.emoji]) agg[r.emoji]= { emoji:r.emoji, count:0, users:[] };
        agg[r.emoji].count++;
        agg[r.emoji].users.push(String(r.user_id));
    });
    return Object.values(agg);
}
function parseDeletedFor(val) {
    if (!val) return [];
    try { const arr = JSON.parse(val); return Array.isArray(arr)?arr.map(String):[]; } catch { return []; }
}
function shouldHideForUser(msg, userId) {
    if (!msg.is_deleted) return false;
    // if deleted_for contains userId => hidden for that user (delete for me)
    // if is_deleted=1 and deleted_for is null => deleted for everyone
    if (msg.deleted_for) {
        const arr = parseDeletedFor(msg.deleted_for);
        if (arr.includes(String(userId))) return true;
    }
    // soft delete for everyone: hide for all
    // we use deleted_for = '[]' or null for everyone? we set is_deleted=1 and deleted_for='__all__' for everyone
    if (msg.is_deleted && msg.deleted_for === '__all__') return true;
    return false;
}
function enrichMessage(msg, reactions, replyMap) {
    const rList = reactions[msg.id] || [];
    msg.reactions = aggregateReactions(rList);
    msg.reactionDetails = rList;
    if (msg.reply_to_id && replyMap[msg.reply_to_id]) {
        msg.replyTo = replyMap[msg.reply_to_id];
    }
    return msg;
}

// ─── 1. Conversations (with archive/mute/block/filter) ─────────────────────
exports.getConversations = async (req, res) => {
    try {
        const me = req.user.id;
        const filter = req.query.filter || 'all'; // all | archived | unread | groups
        const searchQ = (req.query.q || '').toLowerCase();

        // Fetch blocked ids to exclude
        const blockedRows = await global.db.all(`SELECT blocked_id FROM blocked_users WHERE blocker_id=? UNION SELECT blocker_id FROM blocked_users WHERE blocked_id=?`, [me, me]);
        const blockedSet = new Set(blockedRows.map(r=>String(r.blocked_id)));

        // Direct conversations
        let conversations = await global.db.all(`
            SELECT u.id as _id, u.fullName, u.profilePicture, u.last_seen, u.is_online,
                (SELECT content FROM messages WHERE ((sender_id=u.id AND receiver_id=?) OR (sender_id=? AND receiver_id=u.id)) AND is_deleted=0 ORDER BY created_at DESC LIMIT 1) as lastMessage,
                (SELECT created_at FROM messages WHERE ((sender_id=u.id AND receiver_id=?) OR (sender_id=? AND receiver_id=u.id)) AND is_deleted=0 ORDER BY created_at DESC LIMIT 1) as lastMessageTime,
                (SELECT message_type FROM messages WHERE ((sender_id=u.id AND receiver_id=?) OR (sender_id=? AND receiver_id=u.id)) AND is_deleted=0 ORDER BY created_at DESC LIMIT 1) as lastMessageType,
                (SELECT status FROM messages WHERE ((sender_id=u.id AND receiver_id=?) OR (sender_id=? AND receiver_id=u.id)) AND is_deleted=0 ORDER BY created_at DESC LIMIT 1) as lastMessageStatus,
                (SELECT COUNT(*) FROM messages WHERE sender_id=u.id AND receiver_id=? AND isRead=0 AND is_deleted=0) as unreadCount,
                'user' as type
            FROM users u
            WHERE u.id IN (
                SELECT DISTINCT CASE WHEN sender_id=? THEN receiver_id ELSE sender_id END
                FROM messages WHERE sender_id=? OR receiver_id=?
            )
        `, Array(12).fill(me));

        // Filter blocked
        conversations = conversations.filter(c=> !blockedSet.has(String(c._id)));

        // Archived / Muted enrichment
        const archivedRows = await global.db.all(`SELECT peer_id FROM archived_chats WHERE user_id=? AND peer_type='user'`, [me]);
        const archivedSet = new Set(archivedRows.map(r=>String(r.peer_id)));
        const mutedRows = await global.db.all(`SELECT peer_id, muted_until FROM muted_chats WHERE user_id=? AND peer_type='user'`, [me]);
        const mutedMap = new Map(mutedRows.map(r=>[String(r.peer_id), r.muted_until]));

        conversations = conversations.map(c=>{
            c.isArchived = archivedSet.has(String(c._id));
            c.isMuted = mutedMap.has(String(c._id));
            c.mutedUntil = mutedMap.get(String(c._id)) || null;
            // Humanize lastMessage if type
            if (c.lastMessage && c.lastMessage.startsWith('[IMAGE]:')) c.lastMessage = '📷 Photo';
            else if (c.lastMessage && c.lastMessage.startsWith('[FILE]:')) c.lastMessage = '📎 File';
            else if (c.lastMessage && c.lastMessage.startsWith('[VOICE]:')) c.lastMessage = '🎤 Voice message';
            else if (c.lastMessage && c.lastMessage.startsWith('[GIF]:')) c.lastMessage = '🎞 GIF';
            if (c.lastMessage && c.lastMessage.length>45) c.lastMessage = c.lastMessage.slice(0,45)+'…';
            return c;
        });

        // Groups
        let groups = await global.db.all(`
            SELECT g.id as _id, g.name as fullName, g.cover_image as profilePicture,
                (SELECT content FROM group_messages WHERE group_id=g.id AND is_deleted=0 ORDER BY created_at DESC LIMIT 1) as lastMessage,
                (SELECT created_at FROM group_messages WHERE group_id=g.id AND is_deleted=0 ORDER BY created_at DESC LIMIT 1) as lastMessageTime,
                0 as unreadCount,
                'group' as type
            FROM groups_table g
            JOIN group_members gm ON g.id = gm.group_id
            WHERE gm.user_id=?
        `, [me]);
        groups = groups.map(g=>{
            if (g.lastMessage && g.lastMessage.startsWith('[IMAGE]:')) g.lastMessage='📷 Photo';
            else if (g.lastMessage && g.lastMessage.startsWith('[FILE]:')) g.lastMessage='📎 File';
            else if (g.lastMessage && g.lastMessage.startsWith('[VOICE]:')) g.lastMessage='🎤 Voice';
            g.isArchived = archivedSet.has(String(g._id));
            g.isMuted = mutedMap.has(String(g._id));
            return g;
        });

        let all = [...conversations, ...groups];

        // Apply filters
        if (filter==='archived') all = all.filter(c=>c.isArchived);
        else if (filter==='unread') all = all.filter(c=>c.unreadCount>0);
        else if (filter==='groups') all = all.filter(c=>c.type==='group');
        else if (filter==='all') all = all.filter(c=>!c.isArchived); // default hide archived
        // archived chats not shown in 'all'

        // Muted chats sorting: still shown but with muted flag

        // Search filter
        if (searchQ) all = all.filter(c=> c.fullName.toLowerCase().includes(searchQ) || (c.lastMessage && c.lastMessage.toLowerCase().includes(searchQ)));

        // Add pinned status
        const pinnedRows = await global.db.all(`SELECT conversation_id FROM pinned_messages WHERE pinned_by=?`, [me]).catch(()=>[]);
        const pinnedSet = new Set(pinnedRows.map(r=>String(r.conversation_id)));
        all = all.map(c=> ({ ...c, isPinned: pinnedSet.has(String(c._id)) }));

        // Sort: pinned first, then by lastMessageTime desc
        all.sort((a,b)=>{
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
            const ta = a.lastMessageTime ? new Date(a.lastMessageTime).getTime():0;
            const tb = b.lastMessageTime ? new Date(b.lastMessageTime).getTime():0;
            return tb - ta;
        });

        res.json(all);
    } catch (e) { console.error('getConversations', e); res.status(500).json({ message: e.message }); }
};

// ─── 2. Get Messages (paginated, with reactions, reply, soft deletes) ──────
exports.getMessages = async (req, res) => {
    try {
        const me = req.user.id;
        const otherId = req.params.userId;
        const type = req.query.type; // group
        const limit = Math.min(parseInt(req.query.limit)||50, 100);
        const before = req.query.before; // message id cursor
        const search = req.query.search; // full-text search

        if (type === 'group') {
            // Check membership
            const mem = await global.db.get(`SELECT 1 FROM group_members WHERE group_id=? AND user_id=?`, [otherId, me]);
            if (!mem) return res.status(403).json({ message: 'Not a group member' });

            let sql = `SELECT m.*, u.fullName, u.profilePicture FROM group_messages m JOIN users u ON m.sender_id=u.id WHERE m.group_id=? AND m.is_deleted=0`;
            const params = [otherId];
            if (before) { sql+=` AND m.id < ?`; params.push(before); }
            if (search) { sql+=` AND m.content LIKE ?`; params.push(`%${search}%`); }
            sql+=` ORDER BY m.created_at DESC LIMIT ?`;
            params.push(limit);
            let msgs = await global.db.all(sql, params);
            msgs = msgs.reverse(); // asc for UI

            // Fetch reactions + reply previews
            const ids = msgs.map(m=>m.id);
            const reacMap = await getReactionsForMessages(ids, true);
            const replyIds = msgs.filter(m=>m.reply_to_id).map(m=>m.reply_to_id);
            let replyMap = {};
            if (replyIds.length) {
                const placeholders = replyIds.map(()=>'?').join(',');
                const replyRows = await global.db.all(`SELECT * FROM group_messages WHERE id IN (${placeholders})`, replyIds);
                replyRows.forEach(r=> replyMap[r.id]=r);
            }
            msgs = msgs.map(m=> enrichMessage(m, reacMap, replyMap));

            // Enrich pinned
            const pins = await global.db.all(`SELECT message_id FROM pinned_messages WHERE conversation_id=? AND is_group=1`, [otherId]);
            const pinSet = new Set(pins.map(p=>String(p.message_id)));
            msgs.forEach(m=> m.isPinned = pinSet.has(String(m.id)));

            return res.json(msgs);
        } else {
            // Check blocked
            if (await isBlocked(me, otherId)) return res.status(403).json({ message: 'Chat unavailable due to block' });

            let sql = `SELECT m.*, u.fullName, u.profilePicture FROM messages m JOIN users u ON m.sender_id=u.id WHERE ((m.sender_id=? AND m.receiver_id=?) OR (m.sender_id=? AND m.receiver_id=?))`;
            const params = [me, otherId, otherId, me];
            sql += ` AND m.is_deleted=0`;
            // Deleted for me filter must be applied in JS because deleted_for is JSON
            // We'll fetch then filter
            if (before) { sql+=` AND m.id < ?`; params.push(before); }
            if (search) { sql+=` AND m.content LIKE ?`; params.push(`%${search}%`); }
            sql+=` ORDER BY m.created_at DESC LIMIT ?`;
            params.push(limit);
            let msgs = await global.db.all(sql, params);
            // Filter deleted_for me
            msgs = msgs.filter(m=> !parseDeletedFor(m.deleted_for).includes(String(me)));
            msgs = msgs.reverse();

            const ids = msgs.map(m=>m.id);
            const reacMap = await getReactionsForMessages(ids, false);
            const replyIds = msgs.filter(m=>m.reply_to_id).map(m=>m.reply_to_id);
            let replyMap = {};
            if (replyIds.length) {
                const placeholders = replyIds.map(()=>'?').join(',');
                const replyRows = await global.db.all(`SELECT * FROM messages WHERE id IN (${placeholders})`, replyIds);
                replyRows.forEach(r=> replyMap[r.id]=r);
            }
            msgs = msgs.map(m=> enrichMessage(m, reacMap, replyMap));
            const pins = await global.db.all(`SELECT message_id FROM pinned_messages WHERE conversation_id=? AND is_group=0 AND pinned_by=?`, [otherId, me]).catch(()=>[]);
            const pinSet = new Set(pins.map(p=>String(p.message_id)));
            msgs.forEach(m=> m.isPinned = pinSet.has(String(m.id)));

            // Mark as delivered + read if we are fetching (receiver is me, sender is other)
            await global.db.run(`UPDATE messages SET status='delivered', delivered_at=CURRENT_TIMESTAMP WHERE sender_id=? AND receiver_id=? AND status='sent'`, [otherId, me]);
            await global.db.run(`UPDATE messages SET isRead=1, status='seen', read_at=CURRENT_TIMESTAMP WHERE sender_id=? AND receiver_id=? AND isRead=0`, [otherId, me]);

            // Emit via socket that we have seen (for sender)
            try {
                const io = req.app.get('io');
                const onlineUsers = req.app.get('onlineUsers');
                if (io && onlineUsers) {
                    const senderSock = onlineUsers.get(String(otherId));
                    if (senderSock) io.to(senderSock).emit('messages_seen', { readerId: me, peerId: otherId });
                    // Also emit delivered
                    if (senderSock) io.to(senderSock).emit('messages_delivered', { receiverId: me, peerId: otherId });
                }
            } catch {}

            return res.json(msgs);
        }
    } catch (e) { console.error('getMessages', e); res.status(500).json({ message: e.message }); }
};

// ─── 3. Send Message (with reply, forwarded, message_type, link preview meta) ─
exports.sendMessage = async (req, res) => {
    try {
        const me = req.user.id;
        const { receiverId, content, isGroup, replyToId, forwarded, messageType } = req.body;
        if (!receiverId || (content===undefined || content===null || String(content).trim()==='')) return res.status(400).json({ message: 'Receiver and content required' });
        if (String(content).length > 5000) return res.status(400).json({ message: 'Message too long (max 5000 chars)' });

        // Spam / rate: 30 messages per minute per user handled via global rateLimiter, but add quick check
        // Block check
        if (!isGroup) {
            if (await isBlocked(me, receiverId)) return res.status(403).json({ message: 'You cannot message this user' });
            // Message request check: if no prior conversation and not friends? For now allow but create request entry if first time
            const existing = await global.db.get(`SELECT 1 FROM messages WHERE (sender_id=? AND receiver_id=?) OR (sender_id=? AND receiver_id=?) LIMIT 1`, [me, receiverId, receiverId, me]);
            const friend = await global.db.get(`SELECT 1 FROM friends WHERE (user1_id=? AND user2_id=?) OR (user1_id=? AND user2_id=?)`, [me, receiverId, receiverId, me]);
            const reqEntry = await global.db.get(`SELECT * FROM message_requests WHERE (sender_id=? AND receiver_id=?) OR (sender_id=? AND receiver_id=?)`, [me, receiverId, receiverId, me]);
            if (!existing && !friend && !reqEntry) {
                // Create pending request
                try { await global.db.run(`INSERT INTO message_requests (sender_id, receiver_id, status) VALUES (?,?, 'pending')`, [me, receiverId]); } catch {}
            }
            if (reqEntry && reqEntry.status==='pending' && String(reqEntry.sender_id)!==String(me)) {
                // If receiver sent request to us and we are replying, auto-accept
                await global.db.run(`UPDATE message_requests SET status='accepted' WHERE id=?`, [reqEntry.id]);
            }
        }

        const io = req.app.get('io');
        const onlineUsers = req.app.get('onlineUsers');

        // Determine message type
        let mType = messageType || 'text';
        let finalContent = content;
        // Detect link preview trigger (store raw content, frontend will render preview)
        // No extra processing needed server side, but we can set type 'link' if contains url
        if (mType==='text' && /https?:\/\//i.test(content)) mType='link';

        if (isGroup) {
            const isMember = await global.db.get(`SELECT 1 FROM group_members WHERE group_id=? AND user_id=?`, [receiverId, me]);
            if (!isMember) return res.status(403).json({ message: 'Not member of group' });
            const result = await global.db.run(
                `INSERT INTO group_messages (group_id, sender_id, content, message_type, reply_to_id, is_forwarded) VALUES (?,?,?,?,?,?)`,
                [receiverId, me, finalContent, mType, replyToId||null, forwarded?1:0]
            );
            const message = await global.db.get(`SELECT m.*, u.fullName, u.profilePicture FROM group_messages m JOIN users u ON m.sender_id=u.id WHERE m.id=?`, [result.lastID]);
            message.isGroup = true;
            message.reactions = [];
            if (replyToId) {
                const r = await global.db.get(`SELECT * FROM group_messages WHERE id=?`, [replyToId]);
                message.replyTo = r || null;
            }
            if (io) io.to('group_' + receiverId).emit('receive_message', message);
            // Also emit to group members via onlineUsers? For simplicity rely on room join
            return res.status(201).json(message);
        } else {
            // For direct, also check recipient exists
            const rec = await global.db.get(`SELECT id FROM users WHERE id=?`, [receiverId]);
            if (!rec) return res.status(404).json({ message: 'Recipient not found' });

            const result = await global.db.run(
                `INSERT INTO messages (sender_id, receiver_id, content, message_type, status, reply_to_id, is_forwarded) VALUES (?,?,?,?,?,?,?)`,
                [me, receiverId, finalContent, mType, 'sent', replyToId||null, forwarded?1:0]
            );
            const message = await global.db.get(`SELECT m.*, u.fullName, u.profilePicture FROM messages m JOIN users u ON m.sender_id=u.id WHERE m.id=?`, [result.lastID]);
            message.reactions = [];
            if (replyToId) {
                const r = await global.db.get(`SELECT * FROM messages WHERE id=?`, [replyToId]);
                message.replyTo = r || null;
            }
            // Determine delivered if receiver online
            const recvSocket = onlineUsers ? onlineUsers.get(String(receiverId)) : null;
            if (recvSocket) {
                await global.db.run(`UPDATE messages SET status='delivered', delivered_at=CURRENT_TIMESTAMP WHERE id=?`, [message.id]);
                message.status='delivered';
                io.to(recvSocket).emit('receive_message', message);
                // emit delivery ack to sender
                const senderSock = onlineUsers.get(String(me));
                if (senderSock) io.to(senderSock).emit('message_delivered', { messageId: message.id, receiverId });
            }
            // Also emit to sender for multi-device sync
            if (onlineUsers) {
                const senderSock = onlineUsers.get(String(me));
                if (senderSock) io.to(senderSock).emit('message_sent', message);
            }
            return res.status(201).json(message);
        }
    } catch (e) { console.error('sendMessage', e); res.status(500).json({ message: e.message }); }
};

// ─── 4. Edit Message ────────────────────────────────────────────────────────
exports.editMessage = async (req, res) => {
    try {
        const me = req.user.id;
        const msgId = req.params.id;
        const { content, isGroup } = req.body;
        if (!content || !String(content).trim()) return res.status(400).json({ message: 'Content required' });
        if (String(content).length>5000) return res.status(400).json({ message: 'Too long' });

        let msg, table;
        if (isGroup) {
            msg = await global.db.get(`SELECT * FROM group_messages WHERE id=?`, [msgId]);
            table = 'group_messages';
        } else {
            msg = await global.db.get(`SELECT * FROM messages WHERE id=?`, [msgId]);
            table = 'messages';
        }
        if (!msg) return res.status(404).json({ message: 'Message not found' });
        if (String(msg.sender_id)!==String(me) && req.user.role !== 'Admin') return res.status(403).json({ message: 'Not authorized' });
        if (msg.is_deleted) return res.status(400).json({ message: 'Cannot edit deleted message' });
        // Allow edit within 15 minutes (optional) – enforce 24h
        // const age = Date.now() - new Date(msg.created_at).getTime();
        // if (age > 15*60*1000) return res.status(400).json({ message: 'Edit window expired' });

        await global.db.run(`UPDATE ${table} SET content=?, is_edited=1, edited_at=CURRENT_TIMESTAMP WHERE id=?`, [content, msgId]);
        const updated = await global.db.get(`SELECT * FROM ${table} WHERE id=?`, [msgId]);

        const io = req.app.get('io');
        const onlineUsers = req.app.get('onlineUsers');
        if (io) {
            if (isGroup) {
                io.to('group_' + msg.group_id).emit('message_edited', { messageId: msgId, content, isGroup: true, groupId: msg.group_id });
            } else {
                const recvSock = onlineUsers ? onlineUsers.get(String(msg.receiver_id)) : null;
                const senderSock = onlineUsers ? onlineUsers.get(String(me)) : null;
                if (recvSock) io.to(recvSock).emit('message_edited', { messageId: msgId, content, isGroup:false });
                if (senderSock) io.to(senderSock).emit('message_edited', { messageId: msgId, content, isGroup:false });
            }
        }
        res.json(updated);
    } catch(e){ console.error('editMessage', e); res.status(500).json({message:e.message}); }
};

// ─── 5. Delete Message (me vs everyone) ───────────────────────────────────
exports.deleteMessage = async (req, res) => {
    try {
        const me = String(req.user.id);
        const msgId = req.params.id;
        const isGroup = req.query.isGroup === 'true';
        const mode = req.query.mode || 'everyone'; // me | everyone
        let msg, table;
        if (isGroup) {
            msg = await global.db.get('SELECT * FROM group_messages WHERE id=?', [msgId]);
            table='group_messages';
        } else {
            msg = await global.db.get('SELECT * FROM messages WHERE id=?', [msgId]);
            table='messages';
        }
        if (!msg) return res.status(404).json({ message: 'Message not found' });

        const io = req.app.get('io');
        const onlineUsers = req.app.get('onlineUsers');

        if (mode==='me') {
            // Delete for me only: add to deleted_for JSON
            const current = parseDeletedFor(msg.deleted_for);
            if (!current.includes(me)) current.push(me);
            await global.db.run(`UPDATE ${table} SET deleted_for=? WHERE id=?`, [JSON.stringify(current), msgId]);
            // notify self
            if (onlineUsers) {
                const sock = onlineUsers.get(me);
                if (sock) io.to(sock).emit('message_deleted_for_me', { messageId: msgId, isGroup });
            }
            return res.json({ message: 'Deleted for you' });
        } else {
            // Delete for everyone: only sender or Admin can
            if (String(msg.sender_id)!==me && req.user.role !== 'Admin') return res.status(403).json({ message: 'Only sender can unsend for everyone' });
            await global.db.run(`UPDATE ${table} SET is_deleted=1, deleted_for='__all__', content='This message was unsent' WHERE id=?`, [msgId]);
            if (req.user.role === 'Admin' && String(msg.sender_id)!==me) {
                try {
                    const adminUser = await global.db.get('SELECT fullName FROM users WHERE id=?', [req.user.id]);
                    const adminName = adminUser?.fullName || 'Admin';
                    const dateStr = new Date().toLocaleDateString('en-GB');
                    const m = `Your message "${(msg.content||'').slice(0,40)}" was deleted by Admin ${adminName} on ${dateStr}`;
                    await global.db.run('INSERT INTO notifications (recipient_id, sender_id, type, message) VALUES (?,?,?,?)', [msg.sender_id, req.user.id, 'admin_delete', m]);
                    const io2 = req.app.get('io'); const onlineUsers2 = req.app.get('onlineUsers');
                    if (io2 && onlineUsers2) { const s = onlineUsers2.get(String(msg.sender_id)); if (s) io2.to(s).emit('new_notification', { message: m, type: 'admin_delete' }); }
                } catch {}
            }
            if (io) {
                if (isGroup) {
                    io.to('group_' + msg.group_id).emit('message_unsent', { messageId: msgId, isGroup: true, groupId: msg.group_id });
                } else {
                    const recvSock = onlineUsers ? onlineUsers.get(String(msg.receiver_id)) : null;
                    const senderSock = onlineUsers ? onlineUsers.get(me) : null;
                    if (recvSock) io.to(recvSock).emit('message_unsent', { messageId: msgId, isGroup: false });
                    if (senderSock) io.to(senderSock).emit('message_unsent', { messageId: msgId, isGroup: false });
                }
            }
            return res.json({ message: 'Message unsent' });
        }
    } catch(e){ console.error('deleteMessage',e); res.status(500).json({message:e.message}); }
};

// ─── 6. Forward Message ─────────────────────────────────────────────────────
exports.forwardMessage = async (req, res) => {
    try {
        const me = req.user.id;
        const { messageId, isGroup, targets } = req.body; // targets: [{id, type:'user'|'group'}]
        if (!messageId || !Array.isArray(targets) || !targets.length) return res.status(400).json({ message: 'messageId and targets required' });
        if (targets.length>5) return res.status(400).json({ message: 'Max 5 forwards at once' });
        const srcTable = isGroup ? 'group_messages' : 'messages';
        const src = await global.db.get(`SELECT * FROM ${srcTable} WHERE id=?`, [messageId]);
        if (!src) return res.status(404).json({ message: 'Source message not found' });
        // Check deleted
        if (src.is_deleted) return res.status(400).json({ message: 'Cannot forward deleted message' });

        const io = req.app.get('io');
        const onlineUsers = req.app.get('onlineUsers');
        const results = [];

        for (const t of targets) {
            if (t.type==='group') {
                const mem = await global.db.get(`SELECT 1 FROM group_members WHERE group_id=? AND user_id=?`, [t.id, me]);
                if (!mem) continue;
                const r = await global.db.run(`INSERT INTO group_messages (group_id, sender_id, content, message_type, is_forwarded) VALUES (?,?,?,?,1)`, [t.id, me, src.content, src.message_type||'text']);
                const msg = await global.db.get(`SELECT * FROM group_messages WHERE id=?`, [r.lastID]);
                msg.isGroup=true;
                if (io) io.to('group_'+t.id).emit('receive_message', msg);
                results.push(msg);
            } else {
                if (await isBlocked(me, t.id)) continue;
                const r = await global.db.run(`INSERT INTO messages (sender_id, receiver_id, content, message_type, status, is_forwarded) VALUES (?,?,?,?,?,1)`, [me, t.id, src.content, src.message_type||'text', 'sent']);
                const msg = await global.db.get(`SELECT * FROM messages WHERE id=?`, [r.lastID]);
                const sock = onlineUsers ? onlineUsers.get(String(t.id)) : null;
                if (sock) {
                    await global.db.run(`UPDATE messages SET status='delivered', delivered_at=CURRENT_TIMESTAMP WHERE id=?`, [msg.id]);
                    msg.status='delivered';
                    io.to(sock).emit('receive_message', msg);
                }
                results.push(msg);
            }
        }
        res.json({ forwarded: results.length, messages: results });
    } catch(e){ console.error('forward',e); res.status(500).json({message:e.message}); }
};

// ─── 7. React / Unreact ─────────────────────────────────────────────────────
exports.reactMessage = async (req, res) => {
    try {
        const me = req.user.id;
        const msgId = req.params.id;
        const { emoji, isGroup } = req.body;
        if (!emoji) return res.status(400).json({ message: 'emoji required' });
        // Validate emoji is single emoji (basic)
        const allowed = ['👍','❤️','😂','😮','😢','😡','🔥','🎉','💯','🙏','😍','🥰','😎','🤣','😊','🥺','👏','💀','🤩','❤','😭','😅'];
        // allow any single char emoji but not enforce strict

        const tableCheck = isGroup ? 'group_messages' : 'messages';
        const exists = await global.db.get(`SELECT id FROM ${tableCheck} WHERE id=?`, [msgId]);
        if (!exists) return res.status(404).json({ message: 'Message not found' });

        const existing = await global.db.get(`SELECT * FROM message_reactions WHERE message_id=? AND is_group=? AND user_id=?`, [msgId, isGroup?1:0, me]);
        if (existing) {
            if (existing.emoji===emoji) {
                // toggle off
                await global.db.run(`DELETE FROM message_reactions WHERE id=?`, [existing.id]);
            } else {
                await global.db.run(`UPDATE message_reactions SET emoji=? WHERE id=?`, [emoji, existing.id]);
            }
        } else {
            await global.db.run(`INSERT INTO message_reactions (message_id, is_group, user_id, emoji) VALUES (?,?,?,?)`, [msgId, isGroup?1:0, me, emoji]);
        }

        const all = await global.db.all(`SELECT * FROM message_reactions WHERE message_id=? AND is_group=?`, [msgId, isGroup?1:0]);
        const agg = aggregateReactions(all);

        const io = req.app.get('io');
        const onlineUsers = req.app.get('onlineUsers');
        const payload = { messageId: msgId, isGroup: !!isGroup, reactions: agg, details: all };
        if (io) {
            if (isGroup) {
                // need group_id to emit to room
                const grp = await global.db.get(`SELECT group_id FROM group_messages WHERE id=?`, [msgId]);
                if (grp) io.to('group_'+grp.group_id).emit('message_reaction', payload);
            } else {
                const msg = await global.db.get(`SELECT sender_id, receiver_id FROM messages WHERE id=?`, [msgId]);
                if (msg) {
                    [msg.sender_id, msg.receiver_id].forEach(uid=>{
                        const sock = onlineUsers? onlineUsers.get(String(uid)):null;
                        if (sock) io.to(sock).emit('message_reaction', payload);
                    });
                }
            }
        }

        res.json({ reactions: agg, details: all });
    } catch(e){ console.error('react',e); res.status(500).json({message:e.message}); }
};

exports.getReactions = async (req,res)=>{
    try{
        const msgId=req.params.id;
        const isGroup = req.query.isGroup==='true';
        const rows = await global.db.all(`SELECT r.*, u.fullName FROM message_reactions r JOIN users u ON r.user_id=u.id WHERE r.message_id=? AND r.is_group=?`, [msgId, isGroup?1:0]);
        res.json(rows);
    }catch(e){ res.status(500).json({message:e.message}); }
};

// ─── 8. Pin / Unpin ────────────────────────────────────────────────────────
exports.pinMessage = async (req,res)=>{
    try{
        const me=req.user.id;
        const msgId=req.params.id;
        const { isGroup, conversationId } = req.body;
        if (!conversationId) return res.status(400).json({message:'conversationId required'});
        // Check message exists
        const tbl = isGroup?'group_messages':'messages';
        const msg = await global.db.get(`SELECT * FROM ${tbl} WHERE id=?`, [msgId]);
        if (!msg) return res.status(404).json({message:'Message not found'});
        // Only one pin per conversation? Allow multiple but upsert
        try{
            await global.db.run(`INSERT INTO pinned_messages (message_id, is_group, conversation_id, pinned_by) VALUES (?,?,?,?)`, [msgId, isGroup?1:0, conversationId, me]);
        }catch(e){
            // if already pinned, ignore
            if (!String(e.message).includes('UNIQUE')) throw e;
        }
        // Mark message is_pinned
        await global.db.run(`UPDATE ${tbl} SET is_pinned=1 WHERE id=?`, [msgId]);
        const io=req.app.get('io');
        if (io){
            if (isGroup) io.to('group_'+conversationId).emit('message_pinned', { messageId:msgId, conversationId, isGroup:true });
            else {
                const onlineUsers=req.app.get('onlineUsers');
                [me, conversationId].forEach(uid=>{
                    const sock=onlineUsers?onlineUsers.get(String(uid)):null;
                    if (sock) io.to(sock).emit('message_pinned', { messageId:msgId, conversationId, isGroup:false });
                });
            }
        }
        res.json({message:'Pinned'});
    }catch(e){ console.error('pin',e); res.status(500).json({message:e.message}); }
};
exports.unpinMessage = async(req,res)=>{
    try{
        const msgId=req.params.id;
        const isGroup = req.query.isGroup==='true';
        const convId = req.query.conversationId;
        await global.db.run(`DELETE FROM pinned_messages WHERE message_id=? AND is_group=?`, [msgId, isGroup?1:0]);
        const tbl = isGroup?'group_messages':'messages';
        await global.db.run(`UPDATE ${tbl} SET is_pinned=0 WHERE id=?`, [msgId]);
        const io=req.app.get('io');
        if (io){
            if (isGroup) io.to('group_'+convId).emit('message_unpinned', { messageId:msgId, conversationId:convId, isGroup:true });
            else {
                const onlineUsers=req.app.get('onlineUsers');
                // emit to both
            }
        }
        res.json({message:'Unpinned'});
    }catch(e){ res.status(500).json({message:e.message}); }
};
exports.getPinnedMessages = async(req,res)=>{
    try{
        const convId=req.params.conversationId;
        const isGroup = req.query.isGroup==='true';
        const rows = await global.db.all(`SELECT pm.*, m.content, m.sender_id, m.created_at, u.fullName FROM pinned_messages pm JOIN ${isGroup?'group_messages':'messages'} m ON m.id=pm.message_id JOIN users u ON u.id=m.sender_id WHERE pm.conversation_id=? AND pm.is_group=? ORDER BY pm.created_at DESC`, [convId, isGroup?1:0]);
        res.json(rows);
    }catch(e){ res.status(500).json({message:e.message}); }
};

// ─── 9. Archive / Mute / Block ─────────────────────────────────────────────
exports.toggleArchive = async(req,res)=>{
    try{
        const me=req.user.id;
        const { peerId, peerType='user' } = req.body;
        if (!peerId) return res.status(400).json({message:'peerId required'});
        const existing = await global.db.get(`SELECT id FROM archived_chats WHERE user_id=? AND peer_id=? AND peer_type=?`, [me, peerId, peerType]);
        if (existing) {
            await global.db.run(`DELETE FROM archived_chats WHERE id=?`, [existing.id]);
            return res.json({ archived:false });
        } else {
            await global.db.run(`INSERT INTO archived_chats (user_id, peer_id, peer_type) VALUES (?,?,?)`, [me, peerId, peerType]);
            return res.json({ archived:true });
        }
    }catch(e){ res.status(500).json({message:e.message}); }
};
exports.toggleMute = async(req,res)=>{
    try{
        const me=req.user.id;
        const { peerId, peerType='user', durationHours=24 } = req.body;
        if (!peerId) return res.status(400).json({message:'peerId required'});
        const existing = await global.db.get(`SELECT id FROM muted_chats WHERE user_id=? AND peer_id=? AND peer_type=?`, [me, peerId, peerType]);
        if (existing) {
            await global.db.run(`DELETE FROM muted_chats WHERE id=?`, [existing.id]);
            return res.json({ muted:false });
        } else {
            const until = new Date(Date.now()+ durationHours*3600*1000).toISOString();
            await global.db.run(`INSERT INTO muted_chats (user_id, peer_id, peer_type, muted_until) VALUES (?,?,?,?)`, [me, peerId, peerType, until]);
            return res.json({ muted:true, until });
        }
    }catch(e){ res.status(500).json({message:e.message}); }
};
exports.blockUser = async(req,res)=>{
    try{
        const me=req.user.id;
        const blockedId = req.params.userId;
        if (String(me)===String(blockedId)) return res.status(400).json({message:'Cannot block yourself'});
        await global.db.run(`INSERT OR IGNORE INTO blocked_users (blocker_id, blocked_id) VALUES (?,?)`, [me, blockedId]);
        // Also clear conversation? Not deleting messages, just hide
        res.json({message:'Blocked'});
    }catch(e){ res.status(500).json({message:e.message}); }
};
exports.unblockUser = async(req,res)=>{
    try{
        const me=req.user.id;
        const blockedId=req.params.userId;
        await global.db.run(`DELETE FROM blocked_users WHERE blocker_id=? AND blocked_id=?`, [me, blockedId]);
        res.json({message:'Unblocked'});
    }catch(e){ res.status(500).json({message:e.message}); }
};
exports.getBlockedUsers = async(req,res)=>{
    try{
        const me=req.user.id;
        const rows = await global.db.all(`SELECT b.blocked_id, u.fullName, u.profilePicture FROM blocked_users b JOIN users u ON u.id=b.blocked_id WHERE b.blocker_id=?`, [me]);
        res.json(rows);
    }catch(e){ res.status(500).json({message:e.message}); }
};

// ─── 10. Message Requests ──────────────────────────────────────────────────
exports.getMessageRequests = async(req,res)=>{
    try{
        const me=req.user.id;
        const rows = await global.db.all(`SELECT mr.*, u.fullName, u.profilePicture FROM message_requests mr JOIN users u ON u.id=mr.sender_id WHERE mr.receiver_id=? AND mr.status='pending'`, [me]);
        res.json(rows);
    }catch(e){ res.status(500).json({message:e.message}); }
};
exports.handleMessageRequest = async(req,res)=>{
    try{
        const me=req.user.id;
        const { requestId, action } = req.body; // action: accept | reject | block
        const r = await global.db.get(`SELECT * FROM message_requests WHERE id=? AND receiver_id=?`, [requestId, me]);
        if (!r) return res.status(404).json({message:'Request not found'});
        if (action==='accept') {
            await global.db.run(`UPDATE message_requests SET status='accepted' WHERE id=?`, [requestId]);
            return res.json({message:'Accepted'});
        } else if (action==='reject') {
            await global.db.run(`UPDATE message_requests SET status='rejected' WHERE id=?`, [requestId]);
            return res.json({message:'Rejected'});
        } else if (action==='block') {
            await global.db.run(`UPDATE message_requests SET status='blocked' WHERE id=?`, [requestId]);
            await global.db.run(`INSERT OR IGNORE INTO blocked_users (blocker_id, blocked_id) VALUES (?,?)`, [me, r.sender_id]);
            return res.json({message:'Blocked'});
        }
        res.status(400).json({message:'Invalid action'});
    }catch(e){ res.status(500).json({message:e.message}); }
};

// ─── 11. Search (messages, media, files, links) ───────────────────────────
exports.searchMessages = async(req,res)=>{
    try{
        const me=req.user.id;
        const { q, peerId, type, global: isGlobal } = req.query;
        if (!q || q.trim().length<2) return res.status(400).json({message:'Query too short'});
        const like = `%${q}%`;
        let results=[];
        if (isGlobal==='true') {
            results = await global.db.all(`SELECT m.*, u.fullName FROM messages m JOIN users u ON m.sender_id=u.id WHERE (m.sender_id=? OR m.receiver_id=?) AND m.content LIKE ? AND m.is_deleted=0 ORDER BY m.created_at DESC LIMIT 50`, [me, me, like]);
        } else if (peerId) {
            if (type==='group') {
                results = await global.db.all(`SELECT m.*, u.fullName FROM group_messages m JOIN users u ON m.sender_id=u.id WHERE m.group_id=? AND m.content LIKE ? AND m.is_deleted=0 ORDER BY m.created_at DESC LIMIT 50`, [peerId, like]);
            } else {
                results = await global.db.all(`SELECT m.*, u.fullName FROM messages m JOIN users u ON m.sender_id=u.id WHERE ((m.sender_id=? AND m.receiver_id=?) OR (m.sender_id=? AND m.receiver_id=?)) AND m.content LIKE ? AND m.is_deleted=0 ORDER BY m.created_at DESC LIMIT 50`, [me, peerId, peerId, me, like]);
            }
        } else {
            results = await global.db.all(`SELECT m.*, u.fullName FROM messages m JOIN users u ON m.sender_id=u.id WHERE (m.sender_id=? OR m.receiver_id=?) AND m.content LIKE ? AND m.is_deleted=0 ORDER BY m.created_at DESC LIMIT 50`, [me, me, like]);
        }
        // Filter deleted_for me
        results = results.filter(m=> !parseDeletedFor(m.deleted_for).includes(String(me)));
        res.json(results);
    }catch(e){ res.status(500).json({message:e.message}); }
};

exports.getMedia = async(req,res)=>{
    try{
        const me=req.user.id;
        const peerId=req.params.userId;
        const type=req.query.type; // group?
        const mediaType=req.query.mediaType; // image | file | voice | link
        let sql, params;
        if (type==='group') {
            if (mediaType==='image') sql=`SELECT * FROM group_messages WHERE group_id=? AND message_type='image' AND is_deleted=0 ORDER BY created_at DESC LIMIT 100`;
            else if (mediaType==='file') sql=`SELECT * FROM group_messages WHERE group_id=? AND message_type='file' AND is_deleted=0 ORDER BY created_at DESC LIMIT 100`;
            else if (mediaType==='voice') sql=`SELECT * FROM group_messages WHERE group_id=? AND message_type='voice' AND is_deleted=0 ORDER BY created_at DESC LIMIT 100`;
            else sql=`SELECT * FROM group_messages WHERE group_id=? AND is_deleted=0 ORDER BY created_at DESC LIMIT 100`;
            params=[peerId];
            const rows = await global.db.all(sql, params);
            return res.json(rows);
        } else {
            if (mediaType==='image') sql=`SELECT * FROM messages WHERE ((sender_id=? AND receiver_id=?) OR (sender_id=? AND receiver_id=?)) AND message_type='image' AND is_deleted=0 ORDER BY created_at DESC LIMIT 100`;
            else if (mediaType==='file') sql=`SELECT * FROM messages WHERE ((sender_id=? AND receiver_id=?) OR (sender_id=? AND receiver_id=?)) AND message_type='file' AND is_deleted=0 ORDER BY created_at DESC LIMIT 100`;
            else if (mediaType==='voice') sql=`SELECT * FROM messages WHERE ((sender_id=? AND receiver_id=?) OR (sender_id=? AND receiver_id=?)) AND message_type='voice' AND is_deleted=0 ORDER BY created_at DESC LIMIT 100`;
            else if (mediaType==='link') sql=`SELECT * FROM messages WHERE ((sender_id=? AND receiver_id=?) OR (sender_id=? AND receiver_id=?)) AND message_type='link' AND is_deleted=0 ORDER BY created_at DESC LIMIT 100`;
            else sql=`SELECT * FROM messages WHERE ((sender_id=? AND receiver_id=?) OR (sender_id=? AND receiver_id=?)) AND is_deleted=0 ORDER BY created_at DESC LIMIT 100`;
            params=[me, peerId, peerId, me];
            const rows = await global.db.all(sql, params);
            const filtered = rows.filter(m=> !parseDeletedFor(m.deleted_for).includes(String(me)));
            return res.json(filtered);
        }
    }catch(e){ res.status(500).json({message:e.message}); }
};

// ─── 12. Mark actions ──────────────────────────────────────────────────────
exports.markMessagesRead = async (req, res) => {
    try {
        const me=req.user.id;
        const senderId = req.params.userId;
        await global.db.run('UPDATE messages SET isRead=1, status="seen", read_at=CURRENT_TIMESTAMP WHERE sender_id=? AND receiver_id=? AND isRead=0', [senderId, me]);
        const io=req.app.get('io');
        const onlineUsers=req.app.get('onlineUsers');
        if (io && onlineUsers) {
            const sock = onlineUsers.get(String(senderId));
            if (sock) io.to(sock).emit('messages_seen', { readerId: me, peerId: senderId });
        }
        res.json({ message: 'Marked as read' });
    } catch (e) { res.status(500).json({ message: e.message }); }
};
exports.markDelivered = async(req,res)=>{
    try{
        const me=req.user.id;
        const senderId=req.params.userId;
        await global.db.run(`UPDATE messages SET status='delivered', delivered_at=CURRENT_TIMESTAMP WHERE sender_id=? AND receiver_id=? AND status='sent'`, [senderId, me]);
        const io=req.app.get('io');
        const onlineUsers=req.app.get('onlineUsers');
        if (io && onlineUsers) {
            const sock = onlineUsers.get(String(senderId));
            if (sock) io.to(sock).emit('messages_delivered', { receiverId: me });
        }
        res.json({message:'Delivered'});
    }catch(e){ res.status(500).json({message:e.message}); }
};

// ─── 13. File / Image send (extended with message_type columns) ──────────
exports.sendImageMessage = async (req, res) => {
    try {
        const me=req.user.id;
        const { receiverId, isGroup } = req.body;
        if (!receiverId || !req.file) return res.status(400).json({ message: 'Receiver and image required' });
        const mediaUrl = `/uploads/${req.file.filename}`;
        let mType='image';
        let prefix='[IMAGE]:';
        if (req.file.mimetype.startsWith('audio/')) { prefix='[VOICE]:'; mType='voice'; }
        else if (req.file.mimetype.startsWith('video/')) { prefix='[IMAGE]:'; mType='video'; }
        const content = `${prefix}${mediaUrl}`;

        const io=req.app.get('io');
        const onlineUsers=req.app.get('onlineUsers');

        if (isGroup === 'true') {
            const result = await global.db.run('INSERT INTO group_messages (group_id, sender_id, content, message_type, file_url) VALUES (?,?,?,?,?)', [receiverId, me, content, mType, mediaUrl]);
            const message = await global.db.get('SELECT m.*, u.fullName, u.profilePicture FROM group_messages m JOIN users u ON m.sender_id=u.id WHERE m.id=?', [result.lastID]);
            message.isGroup=true;
            message.reactions=[];
            if (io) io.to('group_' + receiverId).emit('receive_message', message);
            return res.status(201).json({ message });
        } else {
            if (await isBlocked(me, receiverId)) return res.status(403).json({message:'Blocked'});
            const result = await global.db.run('INSERT INTO messages (sender_id, receiver_id, content, message_type, status, file_url) VALUES (?,?,?,?,?,?)', [me, receiverId, content, mType, 'sent', mediaUrl]);
            const message = await global.db.get('SELECT m.*, u.fullName, u.profilePicture FROM messages m JOIN users u ON m.sender_id=u.id WHERE m.id=?', [result.lastID]);
            message.reactions=[];
            const recvSock = onlineUsers?onlineUsers.get(String(receiverId)):null;
            if (recvSock) {
                await global.db.run(`UPDATE messages SET status='delivered', delivered_at=CURRENT_TIMESTAMP WHERE id=?`, [message.id]);
                message.status='delivered';
                io.to(recvSock).emit('receive_message', message);
            }
            return res.status(201).json({ message });
        }
    } catch (e) { console.error('sendImage',e); res.status(500).json({ message: e.message }); }
};

exports.createGroup = async (req, res) => {
    try {
        const { name, userIds, description } = req.body;
        if (!name) return res.status(400).json({ message: 'Group name required' });
        const result = await global.db.run('INSERT INTO groups_table (name, creator_id, description) VALUES (?,?,?)', [name, req.user.id, description||'']);
        const groupId = result.lastID;
        await global.db.run('INSERT INTO group_members (group_id, user_id, role) VALUES (?,?,?)', [groupId, req.user.id, 'admin']);
        if (userIds && Array.isArray(userIds)) {
            for (let uid of userIds) {
                if (String(uid) !== String(req.user.id)) {
                    try{ await global.db.run('INSERT INTO group_members (group_id, user_id) VALUES (?,?)', [groupId, uid]); }catch{}
                }
            }
        }
        res.status(201).json({ message: 'Group created', groupId });
    } catch(e) { console.error('createGroup',e); res.status(500).json({ message: e.message }); }
};

// Additional: get group info + members + add/remove
exports.getGroupInfo = async(req,res)=>{
    try{
        const groupId=req.params.groupId;
        const g = await global.db.get(`SELECT * FROM groups_table WHERE id=?`, [groupId]);
        if (!g) return res.status(404).json({message:'Group not found'});
        const members = await global.db.all(`SELECT gm.*, u.fullName, u.profilePicture FROM group_members gm JOIN users u ON u.id=gm.user_id WHERE gm.group_id=?`, [groupId]);
        res.json({ group:g, members });
    }catch(e){ res.status(500).json({message:e.message}); }
};
exports.updateGroup = async(req,res)=>{
    try{
        const groupId=req.params.groupId;
        const me=req.user.id;
        const role = await global.db.get(`SELECT role FROM group_members WHERE group_id=? AND user_id=?`, [groupId, me]);
        if (!role || (role.role!=='admin' && role.role!=='creator')) return res.status(403).json({message:'Only admin'});
        const { name, description } = req.body;
        if (name) await global.db.run(`UPDATE groups_table SET name=? WHERE id=?`, [name, groupId]);
        if (description!==undefined) await global.db.run(`UPDATE groups_table SET description=? WHERE id=?`, [description, groupId]);
        res.json({message:'Updated'});
    }catch(e){ res.status(500).json({message:e.message}); }
};
exports.manageGroupMember = async(req,res)=>{
    try{
        const groupId=req.params.groupId;
        const { userId, action } = req.body; // add | remove | promote | demote
        const me=req.user.id;
        const myRole = await global.db.get(`SELECT role FROM group_members WHERE group_id=? AND user_id=?`, [groupId, me]);
        if (!myRole || (myRole.role!=='admin' && myRole.role!=='creator')) return res.status(403).json({message:'Admin only'});
        if (action==='add') {
            await global.db.run(`INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?,?)`, [groupId, userId]);
            return res.json({message:'Added'});
        } else if (action==='remove') {
            await global.db.run(`DELETE FROM group_members WHERE group_id=? AND user_id=?`, [groupId, userId]);
            return res.json({message:'Removed'});
        } else if (action==='promote') {
            await global.db.run(`UPDATE group_members SET role='admin' WHERE group_id=? AND user_id=?`, [groupId, userId]);
            return res.json({message:'Promoted'});
        } else if (action==='demote') {
            await global.db.run(`UPDATE group_members SET role='member' WHERE group_id=? AND user_id=?`, [groupId, userId]);
            return res.json({message:'Demoted'});
        }
        res.status(400).json({message:'Invalid action'});
    }catch(e){ res.status(500).json({message:e.message}); }
};
exports.leaveGroup = async(req,res)=>{
    try{
        const groupId=req.params.groupId;
        await global.db.run(`DELETE FROM group_members WHERE group_id=? AND user_id=?`, [groupId, req.user.id]);
        res.json({message:'Left group'});
    }catch(e){ res.status(500).json({message:e.message}); }
};

// Link preview helper (simple fetch)
exports.linkPreview = async(req,res)=>{
    try{
        const { url } = req.query;
        if (!url || !/^https?:\/\//i.test(url)) return res.status(400).json({message:'Invalid url'});
        // For security, only allow http fetch with timeout; simple implementation using https module
        const https = require('https');
        const http = require('http');
        const lib = url.startsWith('https')? https: http;
        const preview = await new Promise((resolve)=>{
            const req2 = lib.get(url, { timeout: 4000 }, (r)=>{
                let data='';
                r.on('data', c=> { data+=c; if(data.length>100000) r.destroy(); });
                r.on('end', ()=>{
                    const title = (data.match(/<title[^>]*>([^<]+)<\/title>/i)||[])[1] || url;
                    const desc = (data.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)||[])[1] || '';
                    const img = (data.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)||[])[1] || '';
                    resolve({ title: title.trim().slice(0,120), description: desc.trim().slice(0,200), image: img, url });
                });
            });
            req2.on('error', ()=> resolve({ title: url, description:'', image:'', url }));
            req2.on('timeout', ()=> { req2.destroy(); resolve({ title: url, description:'', image:'', url }); });
        });
        res.json(preview);
    }catch(e){ res.status(500).json({message:e.message}); }
};
