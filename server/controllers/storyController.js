const path = require('path');

// Helpers
function parseJSONSafe(val, fallback=null){ try{ return val ? JSON.parse(val) : fallback; }catch{ return fallback; } }
async function isFriend(a,b){
  const r=await global.db.get(`SELECT 1 FROM friends WHERE (user1_id=? AND user2_id=?) OR (user1_id=? AND user2_id=?)`,[a,b,b,a]);
  return !!r;
}
async function isCloseFriend(owner, viewer){
  const r=await global.db.get(`SELECT 1 FROM close_friends WHERE user_id=? AND friend_id=?`,[owner, viewer]);
  return !!r;
}
async function canViewStory(story, viewerId){
  if(String(story.user_id)===String(viewerId)) return true;
  if(story.expires_at && new Date(story.expires_at) < new Date()) return false;
  if(story.is_archived) return false;
  const audience=story.audience || story.privacy || 'public';
  if(audience==='public') return true;
  if(audience==='friends') return await isFriend(story.user_id, viewerId);
  if(audience==='close_friends') return await isCloseFriend(story.user_id, viewerId);
  if(audience==='private' || audience==='only_me') return false;
  if(audience==='custom'){
    const list=parseJSONSafe(story.stickers, {})?.customAudience || parseJSONSafe(story.audience, []) || [];
    // Actually custom audience stored in separate? fallback
    // For now check if viewer in allowed list stored in translation? simplified: deny
    return false;
  }
  // campus/course/batch etc are public filters but privacy still respected
  return true;
}

// ─── Create Story (Instagram + Nexus) ───────────────────────────────────
exports.createStory = async (req, res) => {
  try{
    const {
      type, content, caption, bg_color, privacy, audience,
      stickers, filter, music_url, music_title, location,
      campus_tag, course_code, batch, department, event_id, group_id, channel_id, collaborative_id,
      is_collaborative, is_exclusive, challenge_tag, ai_style, quiz_data, poll_data, voice_url,
      allow_replies, allow_reactions, allow_sharing
    } = req.body;

    const expiresAt = new Date(Date.now() + 24*60*60*1000).toISOString();
    let finalType = type || (req.file ? (req.file.mimetype.startsWith('video/') ? 'video' : 'image') : 'text');
    let finalContent = content;
    let finalMediaUrl = null;
    if(req.file){
      finalMediaUrl = req.file.path || req.file.secure_url || req.file.url || `/uploads/${req.file.filename}`;
      finalContent = finalMediaUrl; // store path as content for image/video
      if(finalType==='image' && req.file.mimetype.startsWith('video/')) finalType='video';
      if(req.file.mimetype.startsWith('audio/')) finalType='voice';
    } else if(!finalContent && caption){
      finalContent = caption;
    }
    if(!finalContent) return res.status(400).json({message:'Content or media required'});

    // Validate nexus signature fields
    // quiz_data / poll_data should be JSON strings if provided
    let qData = quiz_data;
    if(qData && typeof qData !== 'string') qData = JSON.stringify(qData);
    let pData = poll_data;
    if(pData && typeof pData !== 'string') pData = JSON.stringify(pData);
    let stk = stickers;
    if(stk && typeof stk !== 'string') stk = JSON.stringify(stk);

    const result = await global.db.run(`
      INSERT INTO stories (
        user_id, type, content, caption, media_url, bg_color, privacy, audience,
        expires_at, stickers, filter, music_url, music_title, location,
        campus_tag, course_code, batch, department, event_id, group_id, channel_id, collaborative_id,
        is_collaborative, is_exclusive, challenge_tag, ai_style, quiz_data, poll_data, voice_url,
        allow_replies, allow_reactions, allow_sharing
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `, [
      req.user.id, finalType, finalContent, caption||null, finalMediaUrl, bg_color||null, privacy||'public', audience||privacy||'public',
      expiresAt, stk||null, filter||null, music_url||null, music_title||null, location||null,
      campus_tag||null, course_code||null, batch||null, department||null, event_id||null, group_id||null, channel_id||null, collaborative_id||null,
      (is_collaborative==='1'||is_collaborative===1||is_collaborative===true||is_collaborative==='true'?1:0), (is_exclusive==='1'||is_exclusive===1||is_exclusive===true||is_exclusive==='true'?1:0), challenge_tag||null, ai_style||null, qData||null, pData||null, voice_url||null,
      (allow_replies==='1'||allow_replies===1||allow_replies===true||allow_replies==='true'||allow_replies===undefined?1:(allow_replies==='0'||allow_replies===0||allow_replies===false?0:1)), (allow_reactions==='1'||allow_reactions===1||allow_reactions===true||allow_reactions==='true'||allow_reactions===undefined?1:(allow_reactions==='0'||allow_reactions===0||allow_reactions===false?0:1)), (allow_sharing==='1'||allow_sharing===1||allow_sharing===true||allow_sharing==='true'||allow_sharing===undefined?1:(allow_sharing==='0'||allow_sharing===0||allow_sharing===false?0:1))
    ]);

    // If collaborative, add to collab table
    if(collaborative_id){
      try{ await global.db.run(`INSERT OR IGNORE INTO collaborative_story_members (collab_id, user_id) VALUES (?,?)`,[collaborative_id, req.user.id]); }catch{}
    }

    // If event story, ensure event exists? just store
    // Increment challenge tag tracking? not needed

    const story = await global.db.get(`SELECT * FROM stories WHERE id=?`,[result.lastID]);
    res.status(201).json({message:'Story created', storyId: result.lastID, story});
  }catch(e){ console.error('createStory',e); res.status(500).json({message:e.message}); }
};

// ─── Feed Stories (grouped by user, privacy respected) ──────────────────
exports.getFeedStories = async (req, res) => {
  try{
    const me=req.user.id;
    const filter = req.query.filter; // optional: campus, course, etc handled via other endpoints
    let sql = `
      SELECT s.*, u.fullName, u.profilePicture, u.department as userDepartment, u.batch as userBatch
      FROM stories s JOIN users u ON s.user_id=u.id
      WHERE s.expires_at > datetime('now') AND s.is_archived=0 AND s.is_exclusive=0
    `;
    const params=[];
    // privacy handled in JS after fetch for simplicity (need friend checks)
    sql += ` ORDER BY s.created_at DESC`;
    const stories = await global.db.all(sql, params);

    // Filter by visibility
    const visible=[];
    for(const s of stories){
      if(await canViewStory(s, me)) visible.push(s);
    }

    // Apply additional query filters if provided
    let filtered=visible;
    if(req.query.campus_tag) filtered=filtered.filter(s=>s.campus_tag===req.query.campus_tag);
    if(req.query.course_code) filtered=filtered.filter(s=>s.course_code===req.query.course_code);
    if(req.query.event_id) filtered=filtered.filter(s=>String(s.event_id)===String(req.query.event_id));
    if(req.query.group_id) filtered=filtered.filter(s=>String(s.group_id)===String(req.query.group_id));
    if(req.query.challenge_tag) filtered=filtered.filter(s=>s.challenge_tag===req.query.challenge_tag);

    // Add viewer check & reaction counts
    for(const s of filtered){
      const v=await global.db.get(`SELECT 1 FROM story_views WHERE story_id=? AND viewer_id=?`,[s.id, me]);
      s.viewed = !!v;
      const cnt=await global.db.get(`SELECT COUNT(*) as c FROM story_views WHERE story_id=?`,[s.id]);
      s.view_count = cnt?.c || 0;
      const reacts=await global.db.all(`SELECT emoji, COUNT(*) as cnt FROM story_reactions WHERE story_id=? GROUP BY emoji`,[s.id]);
      s.reactions = reacts;
    }

    // Group by user
    const grouped={};
    filtered.forEach(s=>{
      if(!grouped[s.user_id]){
        grouped[s.user_id]={
          user_id: s.user_id,
          fullName: s.fullName,
          profilePicture: s.profilePicture,
          department: s.userDepartment,
          batch: s.userBatch,
          stories: []
        };
      }
      grouped[s.user_id].stories.push(s);
    });

    // Sort groups by latest story time desc, but keep stories within group asc (for viewer progress)
    const groups=Object.values(grouped).map(g=>{
      g.stories.sort((a,b)=> new Date(a.created_at)-new Date(b.created_at));
      g.latest = g.stories[g.stories.length-1].created_at;
      return g;
    }).sort((a,b)=> new Date(b.latest)-new Date(a.latest));

    // Also include my stories first if I have any
    res.json(groups);
  }catch(e){ console.error('getFeed',e); res.status(500).json({message:e.message}); }
};

// ─── View Story (mark viewed) ───────────────────────────────────────────
exports.viewStory = async (req,res)=>{
  try{
    const storyId=req.params.id;
    const story=await global.db.get(`SELECT * FROM stories WHERE id=?`,[storyId]);
    if(!story) return res.status(404).json({message:'Story not found'});
    if(!(await canViewStory(story, req.user.id))) return res.status(403).json({message:'Not allowed'});
    await global.db.run(`INSERT OR IGNORE INTO story_views (story_id, viewer_id) VALUES (?,?)`,[storyId, req.user.id]);
    await global.db.run(`UPDATE stories SET view_count = view_count + 1 WHERE id=?`,[storyId]);
    // Also update story_views count? view_count is denormalized
    res.json({success:true});
  }catch(e){ res.status(500).json({message:e.message}); }
};

exports.getViewers = async (req,res)=>{
  try{
    const storyId=req.params.id;
    const story=await global.db.get(`SELECT user_id FROM stories WHERE id=?`,[storyId]);
    if(!story) return res.status(404).json({message:'Story not found'});
    if(String(story.user_id)!==String(req.user.id)) return res.status(403).json({message:'Only owner can see viewers'});
    const viewers=await global.db.all(`SELECT sv.viewer_id, u.fullName, u.profilePicture, sv.created_at FROM story_views sv JOIN users u ON u.id=sv.viewer_id WHERE sv.story_id=? ORDER BY sv.created_at DESC`,[storyId]);
    res.json(viewers);
  }catch(e){ res.status(500).json({message:e.message}); }
};

// ─── Reactions ──────────────────────────────────────────────────────────
exports.reactStory = async (req,res)=>{
  try{
    const storyId=req.params.id;
    const {emoji} = req.body;
    if(!emoji) return res.status(400).json({message:'emoji required'});
    const story=await global.db.get(`SELECT * FROM stories WHERE id=?`,[storyId]);
    if(!story) return res.status(404).json({message:'Story not found'});
    if(!story.allow_reactions) return res.status(403).json({message:'Reactions disabled'});
    if(!(await canViewStory(story, req.user.id))) return res.status(403).json({message:'Not allowed'});
    const existing=await global.db.get(`SELECT * FROM story_reactions WHERE story_id=? AND user_id=?`,[storyId, req.user.id]);
    if(existing){
      if(existing.emoji===emoji){
        await global.db.run(`DELETE FROM story_reactions WHERE id=?`,[existing.id]);
      } else {
        await global.db.run(`UPDATE story_reactions SET emoji=? WHERE id=?`,[emoji, existing.id]);
      }
    } else {
      await global.db.run(`INSERT INTO story_reactions (story_id, user_id, emoji) VALUES (?,?,?)`,[storyId, req.user.id, emoji]);
    }
    await global.db.run(`UPDATE stories SET reaction_count = (SELECT COUNT(*) FROM story_reactions WHERE story_id=?) WHERE id=?`,[storyId, storyId]);
    const all=await global.db.all(`SELECT emoji, COUNT(*) as count FROM story_reactions WHERE story_id=? GROUP BY emoji`,[storyId]);
    res.json({reactions: all});
  }catch(e){ res.status(500).json({message:e.message}); }
};

exports.getReactions = async (req,res)=>{
  try{
    const rows=await global.db.all(`SELECT r.*, u.fullName, u.profilePicture FROM story_reactions r JOIN users u ON u.id=r.user_id WHERE r.story_id=?`,[req.params.id]);
    res.json(rows);
  }catch(e){ res.status(500).json({message:e.message}); }
};

// ─── Replies (Story → Messenger) ────────────────────────────────────────
exports.replyStory = async (req,res)=>{
  try{
    const storyId=req.params.id;
    const {content} = req.body;
    if(!content || !content.trim()) return res.status(400).json({message:'Content required'});
    const story=await global.db.get(`SELECT * FROM stories WHERE id=?`,[storyId]);
    if(!story) return res.status(404).json({message:'Not found'});
    if(!story.allow_replies) return res.status(403).json({message:'Replies disabled'});
    // Save reply
    await global.db.run(`INSERT INTO story_replies (story_id, user_id, content) VALUES (?,?,?)`,[storyId, req.user.id, content]);
    await global.db.run(`UPDATE stories SET reply_count = reply_count + 1 WHERE id=?`,[storyId]);
    // Also send as messenger message to story owner
    if(String(story.user_id)!==String(req.user.id)){
      await global.db.run(`INSERT INTO messages (sender_id, receiver_id, content, message_type) VALUES (?,?,?,?)`,[req.user.id, story.user_id, `[STORY REPLY]: ${content} (story #${storyId})`, 'text']);
      // Optionally emit via socket
      try{
        const io=req.app.get('io');
        const onlineUsers=req.app.get('onlineUsers');
        if(io && onlineUsers){
          const sock=onlineUsers.get(String(story.user_id));
          if(sock) io.to(sock).emit('receive_message', { sender_id: req.user.id, receiver_id: story.user_id, content: `[STORY REPLY]: ${content}`, story_id: storyId, isStoryReply: true });
        }
      }catch{}
    }
    res.json({message:'Replied'});
  }catch(e){ res.status(500).json({message:e.message}); }
};

exports.getReplies = async (req,res)=>{
  try{
    const story=await global.db.get(`SELECT user_id FROM stories WHERE id=?`,[req.params.id]);
    if(!story) return res.status(404).json({message:'Not found'});
    if(String(story.user_id)!==String(req.user.id) && String(req.user.role).toLowerCase()!=='admin') return res.status(403).json({message:'Owner only'});
    const rows=await global.db.all(`SELECT r.*, u.fullName, u.profilePicture FROM story_replies r JOIN users u ON u.id=r.user_id WHERE r.story_id=? ORDER BY r.created_at ASC`,[req.params.id]);
    res.json(rows);
  }catch(e){ res.status(500).json({message:e.message}); }
};

exports.deleteReply = async (req,res)=>{
  try{
    const reply=await global.db.get(`SELECT * FROM story_replies WHERE id=?`,[req.params.rid]);
    if(!reply) return res.status(404).json({message:'Reply not found'});
    const story=await global.db.get(`SELECT user_id FROM stories WHERE id=?`,[reply.story_id]);
    const isOwner = String(reply.user_id)===String(req.user.id);
    const isStoryOwner = story && String(story.user_id)===String(req.user.id);
    const isAdmin = String(req.user.role).toLowerCase()==='admin';
    if(!isOwner && !isStoryOwner && !isAdmin) return res.status(403).json({message:'Not authorized'});
    await global.db.run(`DELETE FROM story_replies WHERE id=?`,[req.params.rid]);
    if (isAdmin && String(reply.user_id)!==String(req.user.id)) {
        try {
            const adminUser = await global.db.get('SELECT fullName FROM users WHERE id=?', [req.user.id]);
            const adminName = adminUser?.fullName || 'Admin';
            const dateStr = new Date().toLocaleDateString('en-GB');
            const msg = `Your story reply "${(reply.content||'').slice(0,40)}" was deleted by Admin ${adminName} on ${dateStr}`;
            await global.db.run('INSERT INTO notifications (recipient_id, sender_id, type, message) VALUES (?,?,?,?)', [reply.user_id, req.user.id, 'admin_delete', msg]);
            const io = req.app.get('io'); const onlineUsers = req.app.get('onlineUsers');
            if (io && onlineUsers) { const sock = onlineUsers.get(String(reply.user_id)); if (sock) io.to(sock).emit('new_notification', { message: msg, type: 'admin_delete' }); }
        } catch {}
    }
    res.json({message:'Reply deleted'});
  }catch(e){ res.status(500).json({message:e.message}); }
};

// ─── Share Story to Chat ────────────────────────────────────────────────
exports.shareStory = async (req,res)=>{
  try{
    const storyId=req.params.id;
    const {targets} = req.body; // [{id, type:'user'|'group'}]
    const story=await global.db.get(`SELECT * FROM stories WHERE id=?`,[storyId]);
    if(!story) return res.status(404).json({message:'Not found'});
    if(!story.allow_sharing) return res.status(403).json({message:'Sharing disabled'});
    if(!targets || !Array.isArray(targets) || !targets.length) return res.status(400).json({message:'targets required'});
    const io=req.app.get('io');
    const onlineUsers=req.app.get('onlineUsers');
    let forwarded=0;
    for(const t of targets.slice(0,5)){
      const shareContent = `[STORY SHARE]: story #${storyId} by user ${story.user_id} - ${story.caption || story.content}`;
      if(t.type==='group'){
        const mem=await global.db.get(`SELECT 1 FROM group_members WHERE group_id=? AND user_id=?`,[t.id, req.user.id]);
        if(!mem) continue;
        const r=await global.db.run(`INSERT INTO group_messages (group_id, sender_id, content, message_type) VALUES (?,?,?,?)`,[t.id, req.user.id, shareContent, 'text']);
        forwarded++;
        if(io) io.to('group_'+t.id).emit('receive_message', { id:r.lastID, group_id:t.id, sender_id:req.user.id, content: shareContent });
      } else {
        await global.db.run(`INSERT INTO messages (sender_id, receiver_id, content, message_type) VALUES (?,?,?,?)`,[req.user.id, t.id, shareContent, 'text']);
        forwarded++;
        const sock=onlineUsers?.get(String(t.id));
        if(sock && io) io.to(sock).emit('receive_message', { sender_id:req.user.id, receiver_id:t.id, content: shareContent });
      }
    }
    await global.db.run(`UPDATE stories SET share_count = share_count + ? WHERE id=?`,[forwarded, storyId]);
    res.json({forwarded});
  }catch(e){ console.error('shareStory',e); res.status(500).json({message:e.message}); }
};

// ─── Delete Story ───────────────────────────────────────────────────────
exports.deleteStory = async (req,res)=>{
  try{
    const story=await global.db.get(`SELECT * FROM stories WHERE id=?`,[req.params.id]);
    if(!story) return res.status(404).json({message:'Not found'});
    if(String(story.user_id)!==String(req.user.id) && String(req.user.role).toLowerCase()!=='admin') return res.status(403).json({message:'Not authorized'});
    await global.db.run(`DELETE FROM stories WHERE id=?`,[req.params.id]);
    await global.db.run(`DELETE FROM story_views WHERE story_id=?`,[req.params.id]);
    await global.db.run(`DELETE FROM story_reactions WHERE story_id=?`,[req.params.id]);
    if (String(req.user.role).toLowerCase()==='admin' && String(story.user_id)!==String(req.user.id)) {
        try {
            const adminUser = await global.db.get('SELECT fullName FROM users WHERE id=?', [req.user.id]);
            const adminName = adminUser?.fullName || 'Admin';
            const dateStr = new Date().toLocaleDateString('en-GB');
            const msg = `Your story "${(story.caption||story.content||'').slice(0,40)}" was deleted by Admin ${adminName} on ${dateStr}`;
            await global.db.run('INSERT INTO notifications (recipient_id, sender_id, type, message) VALUES (?,?,?,?)', [story.user_id, req.user.id, 'admin_delete', msg]);
            const io = req.app.get('io'); const onlineUsers = req.app.get('onlineUsers');
            if (io && onlineUsers) { const sock = onlineUsers.get(String(story.user_id)); if (sock) io.to(sock).emit('new_notification', { message: msg, type: 'admin_delete' }); }
        } catch {}
    }
    res.json({message:'Deleted'});
  }catch(e){ res.status(500).json({message:e.message}); }
};

// ─── Archive / Highlights ───────────────────────────────────────────────
exports.getArchive = async (req,res)=>{
  try{
    const rows=await global.db.all(`SELECT s.*, u.fullName, u.profilePicture FROM stories s JOIN users u ON u.id=s.user_id WHERE s.user_id=? AND (s.is_archived=1 OR s.expires_at <= datetime('now')) ORDER BY s.created_at DESC`,[req.user.id]);
    res.json(rows);
  }catch(e){ res.status(500).json({message:e.message}); }
};
exports.archiveStory = async (req,res)=>{
  try{
    const story=await global.db.get(`SELECT * FROM stories WHERE id=?`,[req.params.id]);
    if(!story) return res.status(404).json({message:'Not found'});
    if(String(story.user_id)!==String(req.user.id)) return res.status(403).json({message:'Not authorized'});
    await global.db.run(`UPDATE stories SET is_archived=1 WHERE id=?`,[req.params.id]);
    await global.db.run(`INSERT OR IGNORE INTO story_archive (story_id, user_id) VALUES (?,?)`,[req.params.id, req.user.id]);
    res.json({message:'Archived'});
  }catch(e){ res.status(500).json({message:e.message}); }
};
exports.createHighlight = async (req,res)=>{
  try{
    const {title, cover_url, story_ids} = req.body;
    if(!title) return res.status(400).json({message:'Title required'});
    const ids = Array.isArray(story_ids) ? JSON.stringify(story_ids) : story_ids;
    const r=await global.db.run(`INSERT INTO story_highlights (user_id, title, cover_url, story_ids) VALUES (?,?,?,?)`,[req.user.id, title, cover_url||null, ids||null]);
    res.status(201).json({id:r.lastID, message:'Highlight created'});
  }catch(e){ res.status(500).json({message:e.message}); }
};
exports.getHighlights = async (req,res)=>{
  try{
    const userId=req.params.userId || req.query.userId || req.user.id;
    const rows=await global.db.all(`SELECT * FROM story_highlights WHERE user_id=? ORDER BY created_at DESC`,[userId]);
    // Parse story_ids and fetch stories
    for(const h of rows){
      const ids=parseJSONSafe(h.story_ids, []);
      if(ids && ids.length){
        const placeholders=ids.map(()=>'?').join(',');
        const stories=await global.db.all(`SELECT * FROM stories WHERE id IN (${placeholders})`, ids).catch(()=>[]);
        h.stories=stories;
      } else h.stories=[];
    }
    res.json(rows);
  }catch(e){ res.status(500).json({message:e.message}); }
};
exports.updateHighlight = async (req,res)=>{
  try{
    const hl=await global.db.get(`SELECT * FROM story_highlights WHERE id=?`,[req.params.id]);
    if(!hl) return res.status(404).json({message:'Not found'});
    if(String(hl.user_id)!==String(req.user.id) && String(req.user.role).toLowerCase()!=='admin') return res.status(403).json({message:'Not authorized'});
    const {title, cover_url, story_ids} = req.body;
    const ids = story_ids ? (Array.isArray(story_ids)? JSON.stringify(story_ids): story_ids) : hl.story_ids;
    await global.db.run(`UPDATE story_highlights SET title=?, cover_url=?, story_ids=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,[title||hl.title, cover_url||hl.cover_url, ids, req.params.id]);
    res.json({message:'Updated'});
  }catch(e){ res.status(500).json({message:e.message}); }
};
exports.deleteHighlight = async (req,res)=>{
  try{
    const hl=await global.db.get(`SELECT * FROM story_highlights WHERE id=?`,[req.params.id]);
    if(!hl) return res.status(404).json({message:'Not found'});
    if(String(hl.user_id)!==String(req.user.id) && String(req.user.role).toLowerCase()!=='admin') return res.status(403).json({message:'Not authorized'});
    await global.db.run(`DELETE FROM story_highlights WHERE id=?`,[req.params.id]);
    if (String(req.user.role).toLowerCase()==='admin' && String(hl.user_id)!==String(req.user.id)) {
        try {
            const adminUser = await global.db.get('SELECT fullName FROM users WHERE id=?', [req.user.id]);
            const adminName = adminUser?.fullName || 'Admin';
            const dateStr = new Date().toLocaleDateString('en-GB');
            const msg = `Your highlight "${(hl.title||'').slice(0,40)}" was deleted by Admin ${adminName} on ${dateStr}`;
            await global.db.run('INSERT INTO notifications (recipient_id, sender_id, type, message) VALUES (?,?,?,?)', [hl.user_id, req.user.id, 'admin_delete', msg]);
            const io = req.app.get('io'); const onlineUsers = req.app.get('onlineUsers');
            if (io && onlineUsers) { const sock = onlineUsers.get(String(hl.user_id)); if (sock) io.to(sock).emit('new_notification', { message: msg, type: 'admin_delete' }); }
        } catch {}
    }
    res.json({message:'Deleted'});
  }catch(e){ res.status(500).json({message:e.message}); }
};

// ─── Campus / Course / Batch / Department / Event Stories ───────────────
exports.getCampusStories = async (req,res)=>{
  try{
    const tag=req.params.tag || req.query.tag;
    let sql=`SELECT s.*, u.fullName, u.profilePicture FROM stories s JOIN users u ON u.id=s.user_id WHERE s.expires_at > datetime('now') AND s.is_archived=0 AND s.privacy='public'`;
    const params=[];
    if(tag){ sql+=` AND s.campus_tag=?`; params.push(tag); }
    // else return all campus stories where campus_tag not null?
    if(!tag) sql+=` AND s.campus_tag IS NOT NULL`;
    sql+=` ORDER BY s.created_at DESC LIMIT 100`;
    const rows=await global.db.all(sql, params);
    // Group by campus_tag
    const grouped={};
    rows.forEach(s=>{
      const key=s.campus_tag||'General';
      if(!grouped[key]) grouped[key]=[];
      grouped[key].push(s);
    });
    res.json({stories: rows, grouped});
  }catch(e){ res.status(500).json({message:e.message}); }
};
exports.getCourseStories = async (req,res)=>{
  try{
    const code=req.params.code || req.query.course_code;
    if(!code) return res.status(400).json({message:'course_code required'});
    const rows=await global.db.all(`SELECT s.*, u.fullName, u.profilePicture FROM stories s JOIN users u ON u.id=s.user_id WHERE s.course_code=? AND s.expires_at > datetime('now') AND s.is_archived=0 ORDER BY s.created_at DESC LIMIT 100`,[code]);
    res.json(rows);
  }catch(e){ res.status(500).json({message:e.message}); }
};
exports.getBatchStories = async (req,res)=>{
  try{
    const batch=req.params.batch || req.query.batch;
    if(!batch) return res.status(400).json({message:'batch required'});
    const rows=await global.db.all(`SELECT s.*, u.fullName, u.profilePicture FROM stories s JOIN users u ON u.id=s.user_id WHERE s.batch=? AND s.expires_at > datetime('now') AND s.is_archived=0 ORDER BY s.created_at DESC LIMIT 100`,[batch]);
    res.json(rows);
  }catch(e){ res.status(500).json({message:e.message}); }
};
exports.getDepartmentStories = async (req,res)=>{
  try{
    const dept=req.params.dept || req.query.department;
    if(!dept) return res.status(400).json({message:'department required'});
    const rows=await global.db.all(`SELECT s.*, u.fullName, u.profilePicture FROM stories s JOIN users u ON u.id=s.user_id WHERE s.department=? AND s.expires_at > datetime('now') AND s.is_archived=0 ORDER BY s.created_at DESC LIMIT 100`,[dept]);
    res.json(rows);
  }catch(e){ res.status(500).json({message:e.message}); }
};
exports.getEventStories = async (req,res)=>{
  try{
    const eventId=req.params.eventId || req.query.event_id;
    if(!eventId) return res.status(400).json({message:'event_id required'});
    const rows=await global.db.all(`SELECT s.*, u.fullName, u.profilePicture FROM stories s JOIN users u ON u.id=s.user_id WHERE s.event_id=? AND s.expires_at > datetime('now') AND s.is_archived=0 ORDER BY s.created_at DESC`,[eventId]);
    // Also include collaborative stories linked to event
    const collabs=await global.db.all(`SELECT * FROM collaborative_stories WHERE event_id=?`,[eventId]);
    res.json({stories: rows, collaborative: collabs});
  }catch(e){ res.status(500).json({message:e.message}); }
};
exports.addEventStory = async (req,res)=>{
  // Alias to createStory with event_id
  req.body.event_id = req.params.eventId || req.body.event_id;
  return exports.createStory(req,res);
};

// ─── Collaborative / Group / Channel Stories ────────────────────────────
exports.createCollaborativeStory = async (req,res)=>{
  try{
    const {title, description, type, event_id, group_id} = req.body;
    if(!title) return res.status(400).json({message:'Title required'});
    const r=await global.db.run(`INSERT INTO collaborative_stories (title, creator_id, description, type, event_id, group_id) VALUES (?,?,?,?,?,?)`,[title, req.user.id, description||null, type||'event', event_id||null, group_id||null]);
    await global.db.run(`INSERT OR IGNORE INTO collaborative_story_members (collab_id, user_id, role) VALUES (?,?,?)`,[r.lastID, req.user.id, 'creator']);
    res.status(201).json({id:r.lastID, message:'Collaborative story created'});
  }catch(e){ res.status(500).json({message:e.message}); }
};
exports.getCollaborativeStories = async (req,res)=>{
  try{
    const collabId=req.params.id;
    const collab=await global.db.get(`SELECT * FROM collaborative_stories WHERE id=?`,[collabId]);
    if(!collab) return res.status(404).json({message:'Not found'});
    const stories=await global.db.all(`SELECT s.*, u.fullName, u.profilePicture FROM stories s JOIN users u ON u.id=s.user_id WHERE s.collaborative_id=? AND s.expires_at > datetime('now') ORDER BY s.created_at DESC`,[collabId]);
    const members=await global.db.all(`SELECT m.*, u.fullName, u.profilePicture FROM collaborative_story_members m JOIN users u ON u.id=m.user_id WHERE m.collab_id=?`,[collabId]);
    res.json({collab, stories, members});
  }catch(e){ res.status(500).json({message:e.message}); }
};
exports.joinCollaborativeStory = async (req,res)=>{
  try{
    const collabId=req.params.id;
    const collab=await global.db.get(`SELECT * FROM collaborative_stories WHERE id=?`,[collabId]);
    if(!collab) return res.status(404).json({message:'Not found'});
    if(!collab.is_open) return res.status(403).json({message:'Closed'});
    await global.db.run(`INSERT OR IGNORE INTO collaborative_story_members (collab_id, user_id) VALUES (?,?)`,[collabId, req.user.id]);
    res.json({message:'Joined'});
  }catch(e){ res.status(500).json({message:e.message}); }
};
exports.getGroupStories = async (req,res)=>{
  try{
    const groupId=req.params.groupId;
    const mem=await global.db.get(`SELECT 1 FROM group_members WHERE group_id=? AND user_id=?`,[groupId, req.user.id]);
    // Allow public group stories? For now require membership
    if(!mem) return res.status(403).json({message:'Not member'});
    const rows=await global.db.all(`SELECT s.*, u.fullName, u.profilePicture FROM stories s JOIN users u ON u.id=s.user_id WHERE s.group_id=? AND s.expires_at > datetime('now') AND s.is_archived=0 ORDER BY s.created_at DESC`,[groupId]);
    res.json(rows);
  }catch(e){ res.status(500).json({message:e.message}); }
};
exports.getChannelStories = async (req,res)=>{
  try{
    const channelId=req.params.channelId;
    const rows=await global.db.all(`SELECT s.*, u.fullName, u.profilePicture FROM stories s JOIN users u ON u.id=s.user_id WHERE s.channel_id=? AND s.expires_at > datetime('now') AND s.is_archived=0 ORDER BY s.created_at DESC`,[channelId]);
    res.json(rows);
  }catch(e){ res.status(500).json({message:e.message}); }
};

// ─── AI Story ───────────────────────────────────────────────────────────
exports.aiSuggestStory = async (req,res)=>{
  try{
    const {content, style} = req.body; // style: professional, funny, academic, aesthetic, campus
    if(!content) return res.status(400).json({message:'content required'});
    // Simple rule-based suggestions, fallback to AI controller if available
    // Try to use existing ai logic if OpenAI configured, else mock
    const suggestions={
      caption: '',
      hashtags: [],
      emoji: '✨',
      bg: '#1fa2ff'
    };
    const lower=(style||'').toLowerCase();
    if(lower==='professional'){
      suggestions.caption = `🎓 Professional Insight: ${content.slice(0,80)} — Reflecting excellence and dedication at DIU. #DIUExcellence`;
      suggestions.hashtags=['#DIU','#Professional','#CampusLife'];
      suggestions.emoji='💼';
      suggestions.bg='#0f172a';
    } else if(lower==='funny'){
      suggestions.caption = `😂 ${content} — Campus vibes be like 😎🔥 #DIUMemes`;
      suggestions.hashtags=['#Funny','#Campus','#DIU'];
      suggestions.emoji='🤣';
      suggestions.bg='#ff512f';
    } else if(lower==='academic'){
      suggestions.caption = `📚 Academic Focus: ${content} — Keep learning, keep growing! #StudyDIU`;
      suggestions.hashtags=['#Academic','#SE','#DIU'];
      suggestions.emoji='📖';
      suggestions.bg='#00b09b';
    } else if(lower==='aesthetic'){
      suggestions.caption = `✨ ${content} — Aesthetic campus moments ✨ #DIUAesthetic`;
      suggestions.hashtags=['#Aesthetic','#DIU','#Vibes'];
      suggestions.emoji='🌸';
      suggestions.bg='#8e2de2';
    } else if(lower==='campus'){
      suggestions.caption = `🔥 Campus Now: ${content} — Live from DIU! 📍 #DIUCampus`;
      suggestions.hashtags=['#DIUCampus','#Live','#NexusNow'];
      suggestions.emoji='📍';
      suggestions.bg='#f45d22';
    } else {
      suggestions.caption = `✨ ${content} #DIUNexus`;
      suggestions.hashtags=['#DIU','#Nexus'];
    }
    // Also provide translation suggestion (en<->bn)
    res.json({suggestions, style: style||'default'});
  }catch(e){ res.status(500).json({message:e.message}); }
};

// ─── Translation ────────────────────────────────────────────────────────
exports.translateStory = async (req,res)=>{
  try{
    const storyId=req.params.id;
    const {targetLang} = req.body; // bn, en etc
    const story=await global.db.get(`SELECT * FROM stories WHERE id=?`,[storyId]);
    if(!story) return res.status(404).json({message:'Not found'});
    // Mock translation: if contains Bengali, return English version, else vice versa
    // In real, would call AI translation API
    const isBn=/[ঀ-৿]/.test(story.content);
    let translated;
    if(targetLang==='en' && isBn){
      translated = `[Translated EN] ${story.content}`;
    } else if(targetLang==='bn' && !isBn){
      translated = `[অনুবাদ BN] ${story.content}`;
    } else {
      translated = story.content;
    }
    // Save to story translation JSON
    const trans=parseJSONSafe(story.translation,{});
    trans[targetLang]=translated;
    await global.db.run(`UPDATE stories SET translation=? WHERE id=?`,[JSON.stringify(trans), storyId]);
    res.json({translated, targetLang});
  }catch(e){ res.status(500).json({message:e.message}); }
};

// ─── Quiz / Poll ────────────────────────────────────────────────────────
exports.submitQuiz = async (req,res)=>{
  try{
    const storyId=req.params.id;
    const {answer} = req.body;
    const story=await global.db.get(`SELECT * FROM stories WHERE id=?`,[storyId]);
    if(!story || !story.quiz_data) return res.status(404).json({message:'No quiz'});
    const quiz=parseJSONSafe(story.quiz_data);
    if(!quiz) return res.status(400).json({message:'Invalid quiz'});
    const correct=String(quiz.correct)===String(answer);
    res.json({correct, correctAnswer: quiz.correct, explanation: quiz.explanation||''});
  }catch(e){ res.status(500).json({message:e.message}); }
};
exports.votePoll = async (req,res)=>{
  try{
    const storyId=req.params.id;
    const {option} = req.body; // index
    const story=await global.db.get(`SELECT * FROM stories WHERE id=?`,[storyId]);
    if(!story || !story.poll_data) return res.status(404).json({message:'No poll'});
    const poll=parseJSONSafe(story.poll_data);
    if(!poll || !poll.options || option===undefined) return res.status(400).json({message:'Invalid poll'});
    // Initialize votes if not exists
    poll.votes = poll.votes || Array(poll.options.length).fill(0);
    poll.voters = poll.voters || {};
    const userKey=String(req.user.id);
    if(poll.voters[userKey]!==undefined){
      // already voted, allow change?
      poll.votes[poll.voters[userKey]]--;
    }
    poll.votes[option]++;
    poll.voters[userKey]=option;
    await global.db.run(`UPDATE stories SET poll_data=? WHERE id=?`,[JSON.stringify(poll), storyId]);
    // Return live results
    const total=poll.votes.reduce((a,b)=>a+b,0);
    const results=poll.options.map((opt,i)=>({option:opt, votes:poll.votes[i], percent: total? Math.round(poll.votes[i]/total*100):0 }));
    res.json({results, total});
  }catch(e){ res.status(500).json({message:e.message}); }
};
exports.getPollResults = async (req,res)=>{
  try{
    const story=await global.db.get(`SELECT poll_data FROM stories WHERE id=?`,[req.params.id]);
    if(!story || !story.poll_data) return res.status(404).json({message:'No poll'});
    const poll=parseJSONSafe(story.poll_data);
    const total=(poll.votes||[]).reduce((a,b)=>a+b,0);
    const results=(poll.options||[]).map((opt,i)=>({option:opt, votes:(poll.votes||[])[i]||0, percent: total? Math.round(((poll.votes||[])[i]||0)/total*100):0}));
    res.json({results, total});
  }catch(e){ res.status(500).json({message:e.message}); }
};

// ─── Featured / Explore / Memories / Map / Now / Analytics ──────────────
exports.getFeaturedStories = async (req,res)=>{
  try{
    const rows=await global.db.all(`SELECT s.*, u.fullName, u.profilePicture FROM stories s JOIN users u ON u.id=s.user_id WHERE s.is_featured=1 AND s.expires_at > datetime('now') ORDER BY s.created_at DESC LIMIT 20`);
    res.json(rows);
  }catch(e){ res.status(500).json({message:e.message}); }
};
exports.featureStory = async (req,res)=>{
  try{
    if(String(req.user.role).toLowerCase()!=='admin') return res.status(403).json({message:'Admin only'});
    await global.db.run(`UPDATE stories SET is_featured=1 WHERE id=?`,[req.params.id]);
    res.json({message:'Featured'});
  }catch(e){ res.status(500).json({message:e.message}); }
};
exports.unfeatureStory = async (req,res)=>{
  try{
    if(String(req.user.role).toLowerCase()!=='admin') return res.status(403).json({message:'Admin only'});
    await global.db.run(`UPDATE stories SET is_featured=0 WHERE id=?`,[req.params.id]);
    res.json({message:'Unfeatured'});
  }catch(e){ res.status(500).json({message:e.message}); }
};
exports.getExplore = async (req,res)=>{
  try{
    const filter=req.query.filter||'trending';
    let sql=`SELECT s.*, u.fullName, u.profilePicture FROM stories s JOIN users u ON u.id=s.user_id WHERE s.expires_at > datetime('now') AND s.is_archived=0 AND s.privacy='public'`;
    if(filter==='campus') sql+=` AND s.campus_tag IS NOT NULL`;
    else if(filter==='education' || filter==='course') sql+=` AND s.course_code IS NOT NULL`;
    else if(filter==='events') sql+=` AND s.event_id IS NOT NULL`;
    else if(filter==='poll') sql+=` AND s.poll_data IS NOT NULL`;
    else if(filter==='quiz') sql+=` AND s.quiz_data IS NOT NULL`;
    // trending: order by view_count + reaction_count
    if(filter==='trending') sql+=` ORDER BY (s.view_count + s.reaction_count*2 + s.reply_count) DESC LIMIT 50`;
    else sql+=` ORDER BY s.created_at DESC LIMIT 50`;
    const rows=await global.db.all(sql);
    // Group by user for explore? Return flat
    res.json(rows);
  }catch(e){ res.status(500).json({message:e.message}); }
};
exports.getMemories = async (req,res)=>{
  try{
    // Stories from exactly 1 year ago (same day)
    const rows=await global.db.all(`
      SELECT * FROM stories 
      WHERE user_id=? 
      AND date(created_at) = date('now', '-1 year')
      ORDER BY created_at DESC LIMIT 20
    `,[req.user.id]);
    // Also include stories from 1 year ago ±3 days for more results
    let extra=[];
    if(rows.length<5){
      extra=await global.db.all(`
        SELECT * FROM stories WHERE user_id=? AND date(created_at) BETWEEN date('now','-1 year','-3 days') AND date('now','-1 year','+3 days') AND id NOT IN (${rows.map(r=>r.id).join(',')||0}) ORDER BY created_at DESC LIMIT 10
      `,[req.user.id]);
    }
    res.json([...rows, ...extra]);
  }catch(e){ res.status(500).json({message:e.message}); }
};
exports.getStoryMap = async (req,res)=>{
  try{
    const rows=await global.db.all(`SELECT s.id, s.location, s.campus_tag, s.created_at, u.fullName, u.profilePicture FROM stories s JOIN users u ON u.id=s.user_id WHERE s.location IS NOT NULL AND s.privacy='public' AND s.expires_at > datetime('now') ORDER BY s.created_at DESC LIMIT 100`);
    res.json(rows);
  }catch(e){ res.status(500).json({message:e.message}); }
};
exports.getNexusNow = async (req,res)=>{
  try{
    // Live campus pulse: stories from last 2 hours, public, with campus_tag, aggregated
    const rows=await global.db.all(`
      SELECT campus_tag, COUNT(*) as count, MAX(created_at) as latest
      FROM stories WHERE campus_tag IS NOT NULL AND privacy='public' AND datetime(created_at) > datetime('now','-2 hours') AND expires_at > datetime('now')
      GROUP BY campus_tag ORDER BY count DESC
    `);
    const recent=await global.db.all(`SELECT s.*, u.fullName, u.profilePicture FROM stories s JOIN users u ON u.id=s.user_id WHERE s.expires_at > datetime('now') AND s.campus_tag IS NOT NULL AND s.privacy='public' ORDER BY s.created_at DESC LIMIT 20`);
    res.json({pulse: rows, recent});
  }catch(e){ res.status(500).json({message:e.message}); }
};
exports.getAnalytics = async (req,res)=>{
  try{
    const story=await global.db.get(`SELECT user_id FROM stories WHERE id=?`,[req.params.id]);
    if(!story) return res.status(404).json({message:'Not found'});
    if(String(story.user_id)!==String(req.user.id) && String(req.user.role).toLowerCase()!=='admin') return res.status(403).json({message:'Owner only'});
    const views=await global.db.get(`SELECT COUNT(*) as c FROM story_views WHERE story_id=?`,[req.params.id]);
    const reacts=await global.db.get(`SELECT COUNT(*) as c FROM story_reactions WHERE story_id=?`,[req.params.id]);
    const replies=await global.db.get(`SELECT COUNT(*) as c FROM story_replies WHERE story_id=?`,[req.params.id]);
    const storyData=await global.db.get(`SELECT view_count, reaction_count, reply_count, share_count FROM stories WHERE id=?`,[req.params.id]);
    res.json({
      views: views.c,
      reactions: reacts.c,
      replies: replies.c,
      shares: storyData.share_count,
      view_count: storyData.view_count,
      completion_rate: storyData.view_count ? Math.min(100, Math.round(reacts.c / storyData.view_count * 100)) : 0
    });
  }catch(e){ res.status(500).json({message:e.message}); }
};

// ─── Update Story (privacy, caption etc) ────────────────────────────────
exports.updateStory = async (req,res)=>{
  try{
    const story=await global.db.get(`SELECT * FROM stories WHERE id=?`,[req.params.id]);
    if(!story) return res.status(404).json({message:'Not found'});
    if(String(story.user_id)!==String(req.user.id) && String(req.user.role).toLowerCase()!=='admin') return res.status(403).json({message:'Not authorized'});
    const allowed=['privacy','audience','caption','allow_replies','allow_reactions','allow_sharing','is_exclusive','is_featured'];
    const updates=[];
    const params=[];
    for(const k of allowed){
      if(req.body[k]!==undefined){
        updates.push(`${k}=?`);
        params.push(req.body[k]);
      }
    }
    if(!updates.length) return res.status(400).json({message:'Nothing to update'});
    params.push(req.params.id);
    await global.db.run(`UPDATE stories SET ${updates.join(', ')}, updated_at=CURRENT_TIMESTAMP WHERE id=?`, params);
    res.json({message:'Updated'});
  }catch(e){ res.status(500).json({message:e.message}); }
};

// ─── Voice Story (already via createStory with type voice, but separate endpoint) ─
exports.createVoiceStory = async (req,res)=>{
  try{
    if(!req.file) return res.status(400).json({message:'Voice file required'});
    req.body.type='voice';
    req.body.voice_url=req.file.path || req.file.secure_url || req.file.url || `/uploads/${req.file.filename}`;
    req.body.content=req.body.caption || 'Voice Story';
    return exports.createStory(req,res);
  }catch(e){ res.status(500).json({message:e.message}); }
};
