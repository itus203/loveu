const crypto = require('crypto');

// Helpers
function isAdminRole(role){ return role==='admin' || role==='super_admin' || role==='creator'; }
function isModeratorRole(role){ return isAdminRole(role) || role==='moderator'; }
async function getUserRole(groupId, userId){
  const row=await global.db.get(`SELECT role FROM group_members WHERE group_id=? AND user_id=? AND status='active'`,[groupId,userId]);
  return row?.role || null;
}
async function canManageGroup(groupId, userId){
  const role=await getUserRole(groupId,userId);
  return isAdminRole(role);
}
async function canModerate(groupId, userId){
  const role=await getUserRole(groupId,userId);
  return isModeratorRole(role);
}
async function logActivity(groupId, userId, action, target_type, target_id, details){
  try{ await global.db.run(`INSERT INTO group_activity_log (group_id, user_id, action, target_type, target_id, details) VALUES (?,?,?,?,?,?)`,[groupId,userId,action,target_type||null,target_id||null,details||null]); }catch{}
}

// 1. Get Groups (discover, filter by category, search)
exports.getGroups = async (req,res)=>{
  try{
    const me=req.user.id;
    const { q, category, group_type, department, batch, privacy } = req.query;
    let sql=`SELECT g.*, u.fullName as creatorName,
        (SELECT COUNT(*) FROM group_members WHERE group_id=g.id AND status='active') as memberCount,
        (SELECT role FROM group_members WHERE group_id=g.id AND user_id=?) as myRole,
        (SELECT status FROM group_members WHERE group_id=g.id AND user_id=?) as myStatus
      FROM groups_table g JOIN users u ON g.creator_id=u.id WHERE 1=1`;
    const params=[me,me];
    if(q){ sql+=` AND (g.name LIKE ? OR g.description LIKE ?)`; params.push(`%${q}%`,`%${q}%`); }
    if(category && category!=='all'){ sql+=` AND g.category=?`; params.push(category); }
    if(group_type){ sql+=` AND g.group_type=?`; params.push(group_type); }
    if(department){ sql+=` AND g.department=?`; params.push(department); }
    if(batch){ sql+=` AND g.batch=?`; params.push(batch); }
    if(privacy){ sql+=` AND g.privacy=?`; params.push(privacy); }
    // Hidden groups only visible to members
    sql+=` AND (g.privacy!='Hidden' OR EXISTS (SELECT 1 FROM group_members WHERE group_id=g.id AND user_id=? AND status='active'))`;
    params.push(me);
    sql+=` ORDER BY g.is_official DESC, g.is_verified DESC, g.created_at DESC LIMIT 100`;
    const groups=await global.db.all(sql, params);
    res.json(groups);
  }catch(e){ console.error('getGroups',e); res.status(500).json({message:e.message}); }
};

exports.getMyGroups = async (req,res)=>{
  try{
    const me=req.user.id;
    const groups=await global.db.all(`
      SELECT g.*, u.fullName as creatorName, gm.role as myRole,
        (SELECT COUNT(*) FROM group_members WHERE group_id=g.id AND status='active') as memberCount
      FROM groups_table g JOIN group_members gm ON gm.group_id=g.id
      JOIN users u ON g.creator_id=u.id
      WHERE gm.user_id=? AND gm.status='active' ORDER BY g.created_at DESC
    `,[me]);
    res.json(groups);
  }catch(e){ res.status(500).json({message:e.message}); }
};

exports.getGroupById = async (req,res)=>{
  try{
    const group=await global.db.get(`SELECT g.*, u.fullName as creatorName FROM groups_table g JOIN users u ON g.creator_id=u.id WHERE g.id=?`,[req.params.id]);
    if(!group) return res.status(404).json({message:'Group not found'});
    const me=req.user.id;
    const isMember=await global.db.get(`SELECT role, status FROM group_members WHERE group_id=? AND user_id=?`,[req.params.id, me]);
    if(group.privacy==='Hidden' && !isMember) return res.status(403).json({message:'Hidden group'});
    if(group.privacy==='Private' && !isMember) {
      // still show limited info but not posts
    }
    const memberCount=await global.db.get(`SELECT COUNT(*) as c FROM group_members WHERE group_id=? AND status='active'`,[req.params.id]);
    group.memberCount=memberCount.c;
    group.myRole=isMember?.role||null;
    group.myStatus=isMember?.status||null;
    const topics=await global.db.all(`SELECT * FROM group_topics WHERE group_id=?`,[req.params.id]).catch(()=>[]);
    group.topics=topics;
    res.json(group);
  }catch(e){ res.status(500).json({message:e.message}); }
};

exports.createGroup = async (req,res)=>{
  try{
    const { name, description, category, group_type, department, batch, course_code, faculty, rules, privacy, approval_required, allow_anonymous } = req.body;
    if(!name) return res.status(400).json({message:'Group name required'});
    // University verification: auto-verify if creator is teacher or official email?
    const creator=await global.db.get(`SELECT role, email, department FROM users WHERE id=?`,[req.user.id]);
    let is_verified=0, is_official=0;
    if(creator?.role==='Faculty' || creator?.role==='Teacher') is_verified=1;
    // Auto-generate invite link
    const invite_link=crypto.randomBytes(8).toString('hex');
    let cover_image=null, avatar_image=null;
    if(req.files){
      if(req.files['cover_image']) cover_image=`/uploads/${req.files['cover_image'][0].filename}`;
      if(req.files['avatar_image']) avatar_image=`/uploads/${req.files['avatar_image'][0].filename}`;
    } else if(req.file){
      cover_image=`/uploads/${req.file.filename}`;
    }
    const result=await global.db.run(`
      INSERT INTO groups_table (name, description, cover_image, avatar_image, creator_id, category, group_type, department, batch, course_code, faculty, rules, privacy, approval_required, invite_link, allow_anonymous, is_verified, is_official)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `,[name, description||null, cover_image, avatar_image, req.user.id, category||'general', group_type||category||'general', department||null, batch||null, course_code||null, faculty||null, rules||null, privacy||'Public', approval_required?1:0, invite_link, allow_anonymous?1:0, is_verified, is_official]);
    const groupId=result.lastID;
    await global.db.run(`INSERT INTO group_members (group_id, user_id, role, status) VALUES (?,?,?,?)`,[groupId, req.user.id, 'super_admin', 'active']);
    await logActivity(groupId, req.user.id, 'create_group', 'group', groupId, `Created ${name}`);
    const io=req.app.get('io');
    const onlineUsers=req.app.get('onlineUsers');
    if(io && onlineUsers){
      const sock=onlineUsers.get(String(req.user.id));
      if(sock) io.to(sock).emit('group_created',{groupId, name});
    }
    const group=await global.db.get(`SELECT * FROM groups_table WHERE id=?`,[groupId]);
    res.status(201).json({message:'Group created', id:groupId, group});
  }catch(e){ console.error('createGroup',e); res.status(500).json({message:e.message}); }
};

exports.updateGroup = async (req,res)=>{
  try{
    const groupId=req.params.id;
    if(req.user.role !== 'Admin' && !await canManageGroup(groupId, req.user.id)) return res.status(403).json({message:'Admin only'});
    const { name, description, category, group_type, department, batch, course_code, faculty, rules, privacy, approval_required, allow_anonymous } = req.body;
    let cover_image, avatar_image;
    if(req.files){
      if(req.files['cover_image']) cover_image=`/uploads/${req.files['cover_image'][0].filename}`;
      if(req.files['avatar_image']) avatar_image=`/uploads/${req.files['avatar_image'][0].filename}`;
    } else if(req.file){
      cover_image=`/uploads/${req.file.filename}`;
    }
    const updates=[], params=[];
    if(name!==undefined){ updates.push('name=?'); params.push(name); }
    if(description!==undefined){ updates.push('description=?'); params.push(description); }
    if(category!==undefined){ updates.push('category=?'); params.push(category); }
    if(group_type!==undefined){ updates.push('group_type=?'); params.push(group_type); }
    if(department!==undefined){ updates.push('department=?'); params.push(department); }
    if(batch!==undefined){ updates.push('batch=?'); params.push(batch); }
    if(course_code!==undefined){ updates.push('course_code=?'); params.push(course_code); }
    if(faculty!==undefined){ updates.push('faculty=?'); params.push(faculty); }
    if(rules!==undefined){ updates.push('rules=?'); params.push(rules); }
    if(privacy!==undefined){ updates.push('privacy=?'); params.push(privacy); }
    if(approval_required!==undefined){ updates.push('approval_required=?'); params.push(approval_required?1:0); }
    if(allow_anonymous!==undefined){ updates.push('allow_anonymous=?'); params.push(allow_anonymous?1:0); }
    if(cover_image) { updates.push('cover_image=?'); params.push(cover_image); }
    if(avatar_image) { updates.push('avatar_image=?'); params.push(avatar_image); }
    if(!updates.length) return res.status(400).json({message:'No updates'});
    updates.push('updated_at=CURRENT_TIMESTAMP');
    params.push(groupId);
    await global.db.run(`UPDATE groups_table SET ${updates.join(', ')} WHERE id=?`, params);
    await logActivity(groupId, req.user.id, 'update_group', 'group', groupId, 'Updated');
    res.json({message:'Updated'});
  }catch(e){ res.status(500).json({message:e.message}); }
};

exports.deleteGroup = async (req,res)=>{
  try{
    const g=await global.db.get(`SELECT creator_id FROM groups_table WHERE id=?`,[req.params.id]);
    if(!g) return res.status(404).json({message:'Not found'});
    const role=await getUserRole(req.params.id, req.user.id);
    if(String(g.creator_id)!==String(req.user.id) && role!=='super_admin' && req.user.role!=='Admin') return res.status(403).json({message:'Creator only'});
    await global.db.run(`DELETE FROM groups_table WHERE id=?`,[req.params.id]);
    await global.db.run(`DELETE FROM group_members WHERE group_id=?`,[req.params.id]);
    await global.db.run(`DELETE FROM group_posts WHERE group_id=?`,[req.params.id]);
    res.json({message:'Deleted'});
  }catch(e){ res.status(500).json({message:e.message}); }
};

// Members
exports.getGroupMembers = async (req,res)=>{
  try{
    const { q, role } = req.query;
    let sql=`SELECT u.id as _id, u.fullName, u.profilePicture, u.department, u.batch, u.role as userRole, gm.role, gm.badge, gm.status, gm.joined_at,
        (SELECT COUNT(*) FROM group_posts WHERE group_id=? AND user_id=u.id) as postCount
      FROM group_members gm JOIN users u ON gm.user_id=u.id WHERE gm.group_id=? AND gm.status='active'`;
    const params=[req.params.id, req.params.id];
    if(q){ sql+=` AND u.fullName LIKE ?`; params.push(`%${q}%`); }
    if(role){ sql+=` AND gm.role=?`; params.push(role); }
    sql+=` ORDER BY CASE gm.role WHEN 'super_admin' THEN 0 WHEN 'admin' THEN 1 WHEN 'moderator' THEN 2 ELSE 3 END, gm.joined_at ASC`;
    const members=await global.db.all(sql, params);
    // Add badges
    const enriched=members.map(m=>{
      if(m.role==='super_admin') m.badge='👑 Super Admin';
      else if(m.role==='admin') m.badge='⭐ Admin';
      else if(m.role==='moderator') m.badge='🛡️ Moderator';
      // Top contributor: if postCount >5
      if(m.postCount>5) m.badge2='🔥 Top Contributor';
      // New member: joined within 7 days
      const days=(Date.now()-new Date(m.joined_at).getTime())/86400000;
      if(days<7) m.isNew=true;
      return m;
    });
    res.json(enriched);
  }catch(e){ res.status(500).json({message:e.message}); }
};

exports.joinGroup = async (req,res)=>{
  try{
    const groupId=req.params.id;
    const group=await global.db.get(`SELECT * FROM groups_table WHERE id=?`,[groupId]);
    if(!group) return res.status(404).json({message:'Group not found'});
    const existing=await global.db.get(`SELECT * FROM group_members WHERE group_id=? AND user_id=?`,[groupId, req.user.id]);
    if(existing){
      if(existing.status==='active') return res.status(400).json({message:'Already member'});
      if(existing.status==='pending') return res.status(400).json({message:'Pending approval'});
      if(existing.status==='banned') return res.status(403).json({message:'Banned'});
    }
    // Check invite code if private/hidden requires invite?
    // Membership questions
    const { invite_code, answers } = req.body;
    if(group.privacy==='Hidden' || group.privacy==='Private'){
      if(group.invite_link && invite_code && invite_code!==group.invite_link){
        // also check group_invites table
        const inv=await global.db.get(`SELECT * FROM group_invites WHERE group_id=? AND code=?`,[groupId, invite_code]);
        if(!inv) return res.status(403).json({message:'Invite required'});
        if(inv.expires_at && new Date(inv.expires_at)<new Date()) return res.status(403).json({message:'Invite expired'});
        if(inv.max_uses>0 && inv.uses>=inv.max_uses) return res.status(403).json({message:'Invite max uses reached'});
        await global.db.run(`UPDATE group_invites SET uses=uses+1 WHERE id=?`,[inv.id]);
      } else if(group.privacy==='Hidden' && !invite_code){
        return res.status(403).json({message:'Invite required for hidden group'});
      }
    }
    // If approval required, set pending
    const status=group.approval_required ? 'pending' : 'active';
    if(existing){
      await global.db.run(`UPDATE group_members SET status=?, role='member' WHERE id=?`,[status, existing.id]);
    } else {
      await global.db.run(`INSERT INTO group_members (group_id, user_id, role, status, invited_by) VALUES (?,?,?,?,?)`,[groupId, req.user.id, 'member', status, req.body.invited_by||null]);
    }
    // Save answers if provided
    if(answers && Array.isArray(answers)){
      for(const a of answers){
        await global.db.run(`INSERT INTO group_join_answers (group_id, user_id, question_id, answer) VALUES (?,?,?,?)`,[groupId, req.user.id, a.question_id, a.answer]);
      }
    }
    if(status==='pending'){
      await logActivity(groupId, req.user.id, 'request_join', 'user', req.user.id, 'Pending approval');
      return res.json({message:'Request sent, awaiting approval', status:'pending', group});
    }
    await global.db.run(`UPDATE groups_table SET member_count = (SELECT COUNT(*) FROM group_members WHERE group_id=? AND status='active') WHERE id=?`,[groupId, groupId]);
    await logActivity(groupId, req.user.id, 'join_group', 'user', req.user.id, 'Joined');
    const members=await global.db.all(`SELECT user_id FROM group_members WHERE group_id=? AND status='active'`,[groupId]);
    const io=req.app.get('io'), onlineUsers=req.app.get('onlineUsers');
    if(io && onlineUsers){
      members.forEach(m=>{
        const sock=onlineUsers.get(String(m.user_id));
        if(sock) io.to(sock).emit('group_member_joined',{groupId, userId:req.user.id});
      });
    }
    res.json({message:'Joined', status:'active', group});
  }catch(e){ console.error('join',e); res.status(500).json({message:e.message}); }
};

exports.leaveGroup = async (req,res)=>{
  try{
    await global.db.run(`DELETE FROM group_members WHERE group_id=? AND user_id=?`,[req.params.id, req.user.id]);
    await global.db.run(`UPDATE groups_table SET member_count = (SELECT COUNT(*) FROM group_members WHERE group_id=? AND status='active') WHERE id=?`,[req.params.id, req.params.id]);
    await logActivity(req.params.id, req.user.id, 'leave_group', 'user', req.user.id, 'Left');
    res.json({message:'Left'});
  }catch(e){ res.status(500).json({message:e.message}); }
};

exports.updateMemberRole = async (req,res)=>{
  try{
    const groupId=req.params.id;
    const { userId, role, action } = req.body; // role or action: promote, demote, ban, mute, remove
    if(!await canManageGroup(groupId, req.user.id)) return res.status(403).json({message:'Admin only'});
    const targetRole=await getUserRole(groupId, userId);
    if(!targetRole) return res.status(404).json({message:'Member not found'});
    if(action==='remove'){
      await global.db.run(`DELETE FROM group_members WHERE group_id=? AND user_id=?`,[groupId, userId]);
      await logActivity(groupId, req.user.id, 'remove_member', 'user', userId, 'Removed');
    } else if(action==='ban'){
      const { reason, expires_at } = req.body;
      await global.db.run(`DELETE FROM group_members WHERE group_id=? AND user_id=?`,[groupId, userId]);
      await global.db.run(`INSERT OR REPLACE INTO group_bans (group_id, user_id, banned_by, reason, expires_at) VALUES (?,?,?,?,?)`,[groupId, userId, req.user.id, reason||'Violation', expires_at||null]);
      await logActivity(groupId, req.user.id, 'ban_member', 'user', userId, reason||'Banned');
    } else if(action==='mute'){
      const { durationHours=24, reason } = req.body;
      const until=new Date(Date.now()+durationHours*3600*1000).toISOString();
      await global.db.run(`INSERT OR REPLACE INTO group_mutes (group_id, user_id, muted_by, reason, expires_at) VALUES (?,?,?,?,?)`,[groupId, userId, req.user.id, reason||'Muted', until]);
      await global.db.run(`UPDATE group_members SET is_muted=1, muted_until=? WHERE group_id=? AND user_id=?`,[until, groupId, userId]);
      await logActivity(groupId, req.user.id, 'mute_member', 'user', userId, `Muted ${durationHours}h`);
    } else if(action==='unmute'){
      await global.db.run(`DELETE FROM group_mutes WHERE group_id=? AND user_id=?`,[groupId, userId]);
      await global.db.run(`UPDATE group_members SET is_muted=0, muted_until=NULL WHERE group_id=? AND user_id=?`,[groupId, userId]);
    } else if(role){
      if(!['admin','moderator','member'].includes(role)) return res.status(400).json({message:'Invalid role'});
      // Only super_admin can promote to admin
      const myRole=await getUserRole(groupId, req.user.id);
      if(role==='admin' && myRole!=='super_admin' && req.user.role!=='Admin') return res.status(403).json({message:'Only super admin can promote to admin'});
      await global.db.run(`UPDATE group_members SET role=? WHERE group_id=? AND user_id=?`,[role, groupId, userId]);
      await logActivity(groupId, req.user.id, 'update_role', 'user', userId, `Set to ${role}`);
    }
    res.json({message:'Updated'});
  }catch(e){ res.status(500).json({message:e.message}); }
};

exports.getPendingMembers = async (req,res)=>{
  try{
    if(!await canModerate(req.params.id, req.user.id)) return res.status(403).json({message:'Moderator only'});
    const pending=await global.db.all(`SELECT gm.*, u.fullName, u.profilePicture, u.department, u.batch FROM group_members gm JOIN users u ON gm.user_id=u.id WHERE gm.group_id=? AND gm.status='pending'`,[req.params.id]);
    res.json(pending);
  }catch(e){ res.status(500).json({message:e.message}); }
};

exports.approveMember = async (req,res)=>{
  try{
    const groupId=req.params.id;
    const { userId, action } = req.body; // approve / reject
    if(!await canModerate(groupId, req.user.id)) return res.status(403).json({message:'Moderator only'});
    if(action==='approve'){
      await global.db.run(`UPDATE group_members SET status='active' WHERE group_id=? AND user_id=? AND status='pending'`,[groupId, userId]);
      await global.db.run(`UPDATE groups_table SET member_count=(SELECT COUNT(*) FROM group_members WHERE group_id=? AND status='active') WHERE id=?`,[groupId, groupId]);
      await logActivity(groupId, req.user.id, 'approve_member', 'user', userId, 'Approved');
      res.json({message:'Approved'});
    } else {
      await global.db.run(`DELETE FROM group_members WHERE group_id=? AND user_id=? AND status='pending'`,[groupId, userId]);
      res.json({message:'Rejected'});
    }
  }catch(e){ res.status(500).json({message:e.message}); }
};

// Group Posts
exports.getGroupPosts = async (req,res)=>{
  try{
    const groupId=req.params.id;
    const me=req.user.id;
    const isMember=await global.db.get(`SELECT 1 FROM group_members WHERE group_id=? AND user_id=? AND status='active'`,[groupId, me]);
    const group=await global.db.get(`SELECT privacy FROM groups_table WHERE id=?`,[groupId]);
    if(group?.privacy==='Private' && !isMember) return res.status(403).json({message:'Private group'});
    const { topic, pinned, limit=20, offset=0, q } = req.query;
    let sql=`SELECT gp.*, u.fullName, u.profilePicture, u.role as userRole,
        (SELECT COUNT(*) FROM group_post_reactions WHERE post_id=gp.id) as likeCount,
        (SELECT COUNT(*) FROM group_post_comments WHERE post_id=gp.id) as commentCount,
        (SELECT type FROM group_post_reactions WHERE post_id=gp.id AND user_id=?) as myReaction,
        (SELECT 1 FROM group_post_saves WHERE post_id=gp.id AND user_id=?) as isSaved
      FROM group_posts gp JOIN users u ON gp.user_id=u.id
      WHERE gp.group_id=? AND gp.status='published' AND gp.is_draft=0`;
    const params=[me, me, groupId];
    if(topic){ sql+=` AND gp.topic=?`; params.push(topic); }
    if(pinned==='true'){ sql+=` AND gp.is_pinned=1`; }
    if(q){ sql+=` AND gp.content LIKE ?`; params.push(`%${q}%`); }
    sql+=` ORDER BY gp.is_pinned DESC, gp.is_announcement DESC, gp.created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));
    const posts=await global.db.all(sql, params);
    // Check scheduled: move to published if time reached
    res.json(posts);
  }catch(e){ console.error('getPosts',e); res.status(500).json({message:e.message}); }
};

exports.createGroupPost = async (req,res)=>{
  try{
    const groupId=req.params.id;
    const me=req.user.id;
    const member=await global.db.get(`SELECT role, is_muted, muted_until FROM group_members WHERE group_id=? AND user_id=? AND status='active'`,[groupId, me]);
    if(!member) return res.status(403).json({message:'Not a member'});
    if(member.is_muted && member.muted_until && new Date(member.muted_until)>new Date()) return res.status(403).json({message:`Muted till ${member.muted_until}`});
    // Check slow mode / restrict? skip
    const { content, topic, hashtags, mentions, feeling, location, is_anonymous, is_draft, is_scheduled, scheduled_at } = req.body;
    if(!content && !req.file) return res.status(400).json({message:'Content required'});
    const group=await global.db.get(`SELECT approval_required, allow_anonymous FROM groups_table WHERE id=?`,[groupId]);
    if(is_anonymous && !group.allow_anonymous && !isAdminRole(member.role)) return res.status(403).json({message:'Anonymous not allowed'});
    let media_url=null, media_type=null;
    if(req.file){
      media_url=`/uploads/${req.file.filename}`;
      if(req.file.mimetype.startsWith('image/')) media_type='image';
      else if(req.file.mimetype.startsWith('video/')) media_type='video';
      else media_type='file';
    }
    // Auto-moderation: keyword filter
    const blockedWords=['spam','abuse'];
    const lower=(content||'').toLowerCase();
    const hasBlocked=blockedWords.some(w=> lower.includes(w));
    let status='published';
    if(group.approval_required && !isAdminRole(member.role)) status='pending';
    else if(hasBlocked) status='pending';
    const result=await global.db.run(`
      INSERT INTO group_posts (group_id, user_id, content, media_url, media_type, is_anonymous, feeling, location, topic, hashtags, mentions, is_draft, is_scheduled, scheduled_at, status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `,[groupId, me, content||'', media_url, media_type, is_anonymous?1:0, feeling||null, location||null, topic||null, hashtags||null, mentions||null, is_draft?1:0, is_scheduled?1:0, scheduled_at||null, status]);
    const postId=result.lastID;
    await global.db.run(`UPDATE groups_table SET post_count = (SELECT COUNT(*) FROM group_posts WHERE group_id=? AND status='published') WHERE id=?`,[groupId, groupId]);
    await logActivity(groupId, me, 'create_post', 'post', postId, content?.slice(0,100));
    // Notify members (create notification)
    if(status==='published'){
      const members=await global.db.all(`SELECT user_id FROM group_members WHERE group_id=? AND status='active' AND user_id!=? LIMIT 50`,[groupId, me]);
      for(const m of members){
        try{ await global.db.run(`INSERT INTO notifications (recipient_id, sender_id, type, message, link) VALUES (?,?,?,?,?)`,[m.user_id, me, 'group_post', `New post in group`, `/views/group.html?id=${groupId}`]); }catch{}
      }
    }
    const post=await global.db.get(`SELECT gp.*, u.fullName, u.profilePicture FROM group_posts gp JOIN users u ON gp.user_id=u.id WHERE gp.id=?`,[postId]);
    res.status(201).json({message: status==='pending'?'Pending approval':'Posted', post, status});
  }catch(e){ console.error('createPost',e); res.status(500).json({message:e.message}); }
};

exports.updateGroupPost = async (req,res)=>{
  try{
    const post=await global.db.get(`SELECT * FROM group_posts WHERE id=?`,[req.params.postId]);
    if(!post) return res.status(404).json({message:'Not found'});
    if(String(post.user_id)!==String(req.user.id) && req.user.role !== 'Admin' && !await canModerate(post.group_id, req.user.id)) return res.status(403).json({message:'Not authorized'});
    const { content, topic } = req.body;
    await global.db.run(`UPDATE group_posts SET content=?, topic=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,[content||post.content, topic||post.topic, req.params.postId]);
    res.json({message:'Updated'});
  }catch(e){ res.status(500).json({message:e.message}); }
};

exports.deleteGroupPost = async (req,res)=>{
  try{
    const post=await global.db.get(`SELECT * FROM group_posts WHERE id=?`,[req.params.postId]);
    if(!post) return res.status(404).json({message:'Not found'});
    if(String(post.user_id)!==String(req.user.id) && req.user.role !== 'Admin' && !await canModerate(post.group_id, req.user.id)) return res.status(403).json({message:'Not authorized'});
    await global.db.run(`DELETE FROM group_posts WHERE id=?`,[req.params.postId]);
    await global.db.run(`DELETE FROM group_post_reactions WHERE post_id=?`,[req.params.postId]);
    await global.db.run(`DELETE FROM group_post_comments WHERE post_id=?`,[req.params.postId]);
    await logActivity(post.group_id, req.user.id, 'delete_post', 'post', post.id, 'Deleted');
    if (req.user.role === 'Admin' && String(post.user_id) !== String(req.user.id)) {
        try {
            const adminUser = await global.db.get('SELECT fullName FROM users WHERE id=?', [req.user.id]);
            const adminName = adminUser?.fullName || 'Admin';
            const dateStr = new Date().toLocaleDateString('en-GB');
            const msg = `Your group post "${(post.content||'').slice(0,40)}" was deleted by Admin ${adminName} on ${dateStr}`;
            await global.db.run('INSERT INTO notifications (recipient_id, sender_id, type, message) VALUES (?,?,?,?)', [post.user_id, req.user.id, 'admin_delete', msg]);
            const io = req.app.get('io'); const onlineUsers = req.app.get('onlineUsers');
            if (io && onlineUsers) { const sock = onlineUsers.get(String(post.user_id)); if (sock) io.to(sock).emit('new_notification', { message: msg, type: 'admin_delete' }); }
        } catch {}
    }
    res.json({message:'Deleted'});
  }catch(e){ res.status(500).json({message:e.message}); }
};

exports.pinPost = async (req,res)=>{
  try{
    const post=await global.db.get(`SELECT group_id FROM group_posts WHERE id=?`,[req.params.postId]);
    if(!post) return res.status(404).json({message:'Not found'});
    if(req.user.role !== 'Admin' && !await canModerate(post.group_id, req.user.id)) return res.status(403).json({message:'Moderator only'});
    const { pin } = req.body;
    await global.db.run(`UPDATE group_posts SET is_pinned=? WHERE id=?`,[pin?1:0, req.params.postId]);
    await logActivity(post.group_id, req.user.id, pin?'pin_post':'unpin_post', 'post', req.params.postId, '');
    res.json({message: pin?'Pinned':'Unpinned'});
  }catch(e){ res.status(500).json({message:e.message}); }
};

exports.reactPost = async (req,res)=>{
  try{
    const { type='like' } = req.body;
    const postId=req.params.postId;
    const existing=await global.db.get(`SELECT * FROM group_post_reactions WHERE post_id=? AND user_id=?`,[postId, req.user.id]);
    if(existing){
      if(existing.type===type){
        await global.db.run(`DELETE FROM group_post_reactions WHERE id=?`,[existing.id]);
        await global.db.run(`UPDATE group_posts SET like_count = (SELECT COUNT(*) FROM group_post_reactions WHERE post_id=?) WHERE id=?`,[postId, postId]);
        return res.json({message:'Unliked', liked:false});
      } else {
        await global.db.run(`UPDATE group_post_reactions SET type=? WHERE id=?`,[type, existing.id]);
      }
    } else {
      await global.db.run(`INSERT INTO group_post_reactions (post_id, user_id, type) VALUES (?,?,?)`,[postId, req.user.id, type]);
    }
    await global.db.run(`UPDATE group_posts SET like_count = (SELECT COUNT(*) FROM group_post_reactions WHERE post_id=?) WHERE id=?`,[postId, postId]);
    const post=await global.db.get(`SELECT group_id FROM group_posts WHERE id=?`,[postId]);
    await logActivity(post.group_id, req.user.id, 'react_post', 'post', postId, type);
    res.json({message:'Reacted', liked:true});
  }catch(e){ res.status(500).json({message:e.message}); }
};

exports.commentPost = async (req,res)=>{
  try{
    const { content, parent_id, is_anonymous } = req.body;
    if(!content) return res.status(400).json({message:'Content required'});
    const post=await global.db.get(`SELECT group_id FROM group_posts WHERE id=?`,[req.params.postId]);
    if(!post) return res.status(404).json({message:'Post not found'});
    const isMember=await global.db.get(`SELECT 1 FROM group_members WHERE group_id=? AND user_id=? AND status='active'`,[post.group_id, req.user.id]);
    if(!isMember) return res.status(403).json({message:'Not member'});
    const r=await global.db.run(`INSERT INTO group_post_comments (post_id, user_id, content, parent_id, is_anonymous) VALUES (?,?,?,?,?)`,[req.params.postId, req.user.id, content, parent_id||null, is_anonymous?1:0]);
    await global.db.run(`UPDATE group_posts SET comment_count = (SELECT COUNT(*) FROM group_post_comments WHERE post_id=?) WHERE id=?`,[req.params.postId, req.params.postId]);
    const comment=await global.db.get(`SELECT c.*, u.fullName, u.profilePicture FROM group_post_comments c JOIN users u ON c.user_id=u.id WHERE c.id=?`,[r.lastID]);
    res.status(201).json(comment);
  }catch(e){ res.status(500).json({message:e.message}); }
};

exports.getPostComments = async (req,res)=>{
  try{
    const comments=await global.db.all(`SELECT c.*, u.fullName, u.profilePicture FROM group_post_comments c JOIN users u ON c.user_id=u.id WHERE c.post_id=? ORDER BY c.created_at ASC`,[req.params.postId]);
    // Build nested structure
    const map={}; const roots=[];
    comments.forEach(c=>{ c.replies=[]; map[c.id]=c; });
    comments.forEach(c=>{ if(c.parent_id && map[c.parent_id]) map[c.parent_id].replies.push(c); else roots.push(c); });
    res.json(roots);
  }catch(e){ res.status(500).json({message:e.message}); }
};

// Group Messages (reuse group_messages)
exports.getGroupMessages = async (req,res)=>{
  try{
    const me=req.user.id;
    const isMember=await global.db.get(`SELECT 1 FROM group_members WHERE group_id=? AND user_id=? AND status='active'`,[req.params.id, me]);
    if(!isMember) return res.status(403).json({message:'Not member'});
    const msgs=await global.db.all(`SELECT gm.*, u.fullName, u.profilePicture FROM group_messages gm JOIN users u ON gm.sender_id=u.id WHERE gm.group_id=? ORDER BY gm.created_at ASC LIMIT 100`,[req.params.id]);
    res.json(msgs);
  }catch(e){ res.status(500).json({message:e.message}); }
};
exports.sendGroupMessage = async (req,res)=>{
  try{
    const groupId=req.params.id;
    const me=req.user.id;
    const isMember=await global.db.get(`SELECT 1 FROM group_members WHERE group_id=? AND user_id=? AND status='active'`,[groupId, me]);
    if(!isMember) return res.status(403).json({message:'Not member'});
    const { content } = req.body;
    if(!content && !req.file) return res.status(400).json({message:'Content required'});
    let mediaUrl=null;
    if(req.file) mediaUrl=`/uploads/${req.file.filename}`;
    const r=await global.db.run(`INSERT INTO group_messages (group_id, sender_id, content, mediaUrl) VALUES (?,?,?,?)`,[groupId, me, content||'', mediaUrl]);
    const msg=await global.db.get(`SELECT gm.*, u.fullName, u.profilePicture FROM group_messages gm JOIN users u ON gm.sender_id=u.id WHERE gm.id=?`,[r.lastID]);
    const members=await global.db.all(`SELECT user_id FROM group_members WHERE group_id=? AND status='active'`,[groupId]);
    const io=req.app.get('io'), onlineUsers=req.app.get('onlineUsers');
    if(io && onlineUsers){
      members.forEach(m=>{ if(String(m.user_id)!==String(me)){ const s=onlineUsers.get(String(m.user_id)); if(s) io.to(s).emit('group_message',{groupId, message:msg}); } });
      io.to('group_'+groupId).emit('group_message',{groupId, message:msg});
    }
    res.status(201).json(msg);
  }catch(e){ res.status(500).json({message:e.message}); }
};

// Events
exports.getGroupEvents = async (req,res)=>{
  try{
    const events=await global.db.all(`SELECT e.*, u.fullName as creatorName, (SELECT COUNT(*) FROM group_event_rsvps WHERE event_id=e.id AND status='going') as goingCount FROM group_events e JOIN users u ON e.creator_id=u.id WHERE e.group_id=? ORDER BY e.event_date ASC`,[req.params.id]);
    res.json(events);
  }catch(e){ res.status(500).json({message:e.message}); }
};
exports.createGroupEvent = async (req,res)=>{
  try{
    const groupId=req.params.id;
    if(!await canModerate(groupId, req.user.id) && !await global.db.get(`SELECT 1 FROM group_members WHERE group_id=? AND user_id=? AND status='active'`,[groupId, req.user.id])) return res.status(403).json({message:'Member only'});
    const { title, description, venue, event_date, end_date, is_online } = req.body;
    if(!title || !event_date) return res.status(400).json({message:'Title and date required'});
    let cover_image=null;
    if(req.file) cover_image=`/uploads/${req.file.filename}`;
    const r=await global.db.run(`INSERT INTO group_events (group_id, creator_id, title, description, venue, is_online, event_date, end_date, cover_image) VALUES (?,?,?,?,?,?,?,?,?)`,[groupId, req.user.id, title, description||null, venue||null, is_online?1:0, event_date, end_date||null, cover_image]);
    await logActivity(groupId, req.user.id, 'create_event', 'event', r.lastID, title);
    res.status(201).json({id:r.lastID, message:'Event created'});
  }catch(e){ res.status(500).json({message:e.message}); }
};
exports.rsvpEvent = async (req,res)=>{
  try{
    const { status='going' } = req.body;
    await global.db.run(`INSERT OR REPLACE INTO group_event_rsvps (event_id, user_id, status) VALUES (?,?,?)`,[req.params.eventId, req.user.id, status]);
    res.json({message: status});
  }catch(e){ res.status(500).json({message:e.message}); }
};

// Files
exports.getGroupFiles = async (req,res)=>{
  try{
    const { category, q } = req.query;
    let sql=`SELECT f.*, u.fullName FROM group_files f JOIN users u ON f.user_id=u.id WHERE f.group_id=?`;
    const params=[req.params.id];
    if(category){ sql+=` AND f.category=?`; params.push(category); }
    if(q){ sql+=` AND f.file_name LIKE ?`; params.push(`%${q}%`); }
    sql+=` ORDER BY f.created_at DESC LIMIT 100`;
    const files=await global.db.all(sql, params);
    res.json(files);
  }catch(e){ res.status(500).json({message:e.message}); }
};
exports.uploadGroupFile = async (req,res)=>{
  try{
    const groupId=req.params.id;
    const isMember=await global.db.get(`SELECT 1 FROM group_members WHERE group_id=? AND user_id=? AND status='active'`,[groupId, req.user.id]);
    if(!isMember) return res.status(403).json({message:'Not member'});
    if(!req.file) return res.status(400).json({message:'File required'});
    const { category='general', description } = req.body;
    const file_url=`/uploads/${req.file.filename}`;
    const r=await global.db.run(`INSERT INTO group_files (group_id, user_id, file_name, file_url, file_type, category, description) VALUES (?,?,?,?,?,?,?)`,[groupId, req.user.id, req.file.originalname, file_url, req.file.mimetype, category, description||null]);
    await logActivity(groupId, req.user.id, 'upload_file', 'file', r.lastID, req.file.originalname);
    res.status(201).json({id:r.lastID, file_url});
  }catch(e){ res.status(500).json({message:e.message}); }
};

// Polls
exports.createGroupPoll = async (req,res)=>{
  try{
    const groupId=req.params.id;
    const { question, options, allow_multiple, is_anonymous, deadline } = req.body;
    if(!question || !options || !Array.isArray(options) || options.length<2) return res.status(400).json({message:'Question and options required'});
    // Also create a post for poll
    const postRes=await global.db.run(`INSERT INTO group_posts (group_id, user_id, content, topic, status) VALUES (?,?,?,?,?)`,[groupId, req.user.id, question, 'poll', 'published']);
    const postId=postRes.lastID;
    const r=await global.db.run(`INSERT INTO group_polls (group_id, post_id, question, options, allow_multiple, is_anonymous, deadline, created_by) VALUES (?,?,?,?,?,?,?,?)`,[groupId, postId, question, JSON.stringify(options), allow_multiple?1:0, is_anonymous?1:0, deadline||null, req.user.id]);
    res.status(201).json({pollId:r.lastID, postId});
  }catch(e){ res.status(500).json({message:e.message}); }
};
exports.voteGroupPoll = async (req,res)=>{
  try{
    const { option_index } = req.body;
    const poll=await global.db.get(`SELECT * FROM group_polls WHERE id=?`,[req.params.pollId]);
    if(!poll) return res.status(404).json({message:'Poll not found'});
    if(poll.deadline && new Date(poll.deadline)<new Date()) return res.status(400).json({message:'Poll ended'});
    const options=JSON.parse(poll.options);
    if(option_index<0 || option_index>=options.length) return res.status(400).json({message:'Invalid option'});
    if(!poll.allow_multiple){
      const existing=await global.db.get(`SELECT * FROM group_poll_votes WHERE poll_id=? AND user_id=?`,[poll.id, req.user.id]);
      if(existing){
        await global.db.run(`UPDATE group_poll_votes SET option_index=? WHERE id=?`,[option_index, existing.id]);
        return res.json({message:'Vote updated'});
      }
    }
    await global.db.run(`INSERT OR IGNORE INTO group_poll_votes (poll_id, user_id, option_index) VALUES (?,?,?)`,[poll.id, req.user.id, option_index]);
    res.json({message:'Voted'});
  }catch(e){ res.status(500).json({message:e.message}); }
};
exports.getGroupPolls = async (req,res)=>{
  try{
    const polls=await global.db.all(`SELECT p.*, u.fullName as creatorName FROM group_polls p JOIN users u ON p.created_by=u.id WHERE p.group_id=? ORDER BY p.created_at DESC`,[req.params.id]);
    for(const p of polls){
      const votes=await global.db.all(`SELECT option_index, COUNT(*) as count FROM group_poll_votes WHERE poll_id=? GROUP BY option_index`,[p.id]);
      const total=await global.db.get(`SELECT COUNT(*) as c FROM group_poll_votes WHERE poll_id=?`,[p.id]);
      p.options=JSON.parse(p.options);
      p.votes=votes;
      p.totalVotes=total.c;
      // live result
      p.results=p.options.map((opt,i)=>{
        const v=votes.find(x=>x.option_index===i);
        return { option:opt, count: v? v.count:0, percent: total.c? Math.round((v? v.count:0)/total.c*100):0 };
      });
    }
    res.json(polls);
  }catch(e){ res.status(500).json({message:e.message}); }
};

// Invites
exports.createInvite = async (req,res)=>{
  try{
    const groupId=req.params.id;
    if(!await canModerate(groupId, req.user.id)) return res.status(403).json({message:'Moderator only'});
    const { max_uses=0, expires_in_hours=168 } = req.body;
    const code=crypto.randomBytes(8).toString('hex');
    const expires_at=expires_in_hours? new Date(Date.now()+expires_in_hours*3600*1000).toISOString(): null;
    await global.db.run(`INSERT INTO group_invites (group_id, code, created_by, max_uses, expires_at) VALUES (?,?,?,?,?)`,[groupId, code, req.user.id, max_uses, expires_at]);
    const inviteLink=`http://localhost:5000/views/group.html?id=${groupId}&invite=${code}`;
    // also update groups_table invite_link for simple case
    res.json({code, inviteLink});
  }catch(e){ res.status(500).json({message:e.message}); }
};
exports.getInvites = async (req,res)=>{
  try{
    const invites=await global.db.all(`SELECT * FROM group_invites WHERE group_id=? ORDER BY created_at DESC`,[req.params.id]);
    res.json(invites);
  }catch(e){ res.status(500).json({message:e.message}); }
};

// Reports & Moderation
exports.reportPost = async (req,res)=>{
  try{
    const { reason } = req.body;
    await global.db.run(`INSERT INTO group_reports (group_id, reporter_id, target_type, target_id, reason) VALUES (?,?,?,?,?)`,[req.params.id, req.user.id, 'post', req.params.postId, reason||'Reported']);
    res.json({message:'Reported'});
  }catch(e){ res.status(500).json({message:e.message}); }
};
exports.getReports = async (req,res)=>{
  try{
    if(!await canModerate(req.params.id, req.user.id)) return res.status(403).json({message:'Moderator only'});
    const reports=await global.db.all(`SELECT r.*, u.fullName as reporterName FROM group_reports r JOIN users u ON r.reporter_id=u.id WHERE r.group_id=? AND r.status='pending' ORDER BY r.created_at DESC`,[req.params.id]);
    res.json(reports);
  }catch(e){ res.status(500).json({message:e.message}); }
};

// Activity & Analytics
exports.getActivityLog = async (req,res)=>{
  try{
    if(!await canModerate(req.params.id, req.user.id)) return res.status(403).json({message:'Moderator only'});
    const logs=await global.db.all(`SELECT l.*, u.fullName FROM group_activity_log l LEFT JOIN users u ON l.user_id=u.id WHERE l.group_id=? ORDER BY l.created_at DESC LIMIT 100`,[req.params.id]);
    res.json(logs);
  }catch(e){ res.status(500).json({message:e.message}); }
};
exports.getGroupAnalytics = async (req,res)=>{
  try{
    const groupId=req.params.id;
    if(!await canModerate(groupId, req.user.id)) return res.status(403).json({message:'Moderator only'});
    const memberCount=await global.db.get(`SELECT COUNT(*) as c FROM group_members WHERE group_id=? AND status='active'`,[groupId]);
    const newMembers=await global.db.get(`SELECT COUNT(*) as c FROM group_members WHERE group_id=? AND joined_at > datetime('now','-7 days')`,[groupId]);
    const postCount=await global.db.get(`SELECT COUNT(*) as c FROM group_posts WHERE group_id=?`,[groupId]);
    const postsToday=await global.db.get(`SELECT COUNT(*) as c FROM group_posts WHERE group_id=? AND date(created_at)=date('now')`,[groupId]);
    const pendingPosts=await global.db.get(`SELECT COUNT(*) as c FROM group_posts WHERE group_id=? AND status='pending'`,[groupId]);
    const pendingMembers=await global.db.get(`SELECT COUNT(*) as c FROM group_members WHERE group_id=? AND status='pending'`,[groupId]);
    const reports=await global.db.get(`SELECT COUNT(*) as c FROM group_reports WHERE group_id=? AND status='pending'`,[groupId]);
    res.json({ memberCount:memberCount.c, newMembers:newMembers.c, postCount:postCount.c, postsToday:postsToday.c, pendingPosts:pendingPosts.c, pendingMembers:pendingMembers.c, reports:reports.c });
  }catch(e){ res.status(500).json({message:e.message}); }
};
exports.getGroupTopics = async (req,res)=>{
  try{
    const topics=await global.db.all(`SELECT topic, COUNT(*) as count FROM group_posts WHERE group_id=? AND topic IS NOT NULL GROUP BY topic`,[req.params.id]);
    res.json(topics);
  }catch(e){ res.status(500).json({message:e.message}); }
};

// ─── Additional Moderation: Messages / Files / Events / Polls / Comments ───
exports.deleteGroupMessage = async (req,res)=>{
  try{
    const msg=await global.db.get(`SELECT * FROM group_messages WHERE id=?`,[req.params.mid]);
    if(!msg) return res.status(404).json({message:'Message not found'});
    if(String(msg.sender_id)!==String(req.user.id) && req.user.role!=='Admin' && !await canModerate(msg.group_id, req.user.id)) return res.status(403).json({message:'Not authorized'});
    await global.db.run(`DELETE FROM group_messages WHERE id=?`,[req.params.mid]);
    if(req.user.role==='Admin' && String(msg.sender_id)!==String(req.user.id)){
        try{
            const adminUser=await global.db.get('SELECT fullName FROM users WHERE id=?',[req.user.id]);
            const adminName=adminUser?.fullName||'Admin';
            const dateStr=new Date().toLocaleDateString('en-GB');
            const m=`Your group message "${(msg.content||'').slice(0,40)}" was deleted by Admin ${adminName} on ${dateStr}`;
            await global.db.run('INSERT INTO notifications (recipient_id, sender_id, type, message) VALUES (?,?,?,?)',[msg.sender_id, req.user.id, 'admin_delete', m]);
            const io=req.app.get('io'); const onlineUsers=req.app.get('onlineUsers');
            if(io&&onlineUsers){const s=onlineUsers.get(String(msg.sender_id)); if(s) io.to(s).emit('new_notification',{message:m,type:'admin_delete'});}
        }catch{}
    }
    res.json({message:'Message deleted'});
  }catch(e){ res.status(500).json({message:e.message}); }
};

exports.deleteGroupFile = async (req,res)=>{
  try{
    const file=await global.db.get(`SELECT * FROM group_files WHERE id=?`,[req.params.fid]);
    if(!file) return res.status(404).json({message:'File not found'});
    if(String(file.user_id)!==String(req.user.id) && req.user.role!=='Admin' && !await canModerate(file.group_id, req.user.id)) return res.status(403).json({message:'Not authorized'});
    await global.db.run(`DELETE FROM group_files WHERE id=?`,[req.params.fid]);
    if(req.user.role==='Admin' && String(file.user_id)!==String(req.user.id)){
        try{
            const adminUser=await global.db.get('SELECT fullName FROM users WHERE id=?',[req.user.id]);
            const adminName=adminUser?.fullName||'Admin';
            const dateStr=new Date().toLocaleDateString('en-GB');
            const m=`Your group file "${(file.file_name||'').slice(0,40)}" was deleted by Admin ${adminName} on ${dateStr}`;
            await global.db.run('INSERT INTO notifications (recipient_id, sender_id, type, message) VALUES (?,?,?,?)',[file.user_id, req.user.id, 'admin_delete', m]);
            const io=req.app.get('io'); const onlineUsers=req.app.get('onlineUsers');
            if(io&&onlineUsers){const s=onlineUsers.get(String(file.user_id)); if(s) io.to(s).emit('new_notification',{message:m,type:'admin_delete'});}
        }catch{}
    }
    res.json({message:'File deleted'});
  }catch(e){ res.status(500).json({message:e.message}); }
};

exports.deleteGroupEvent = async (req,res)=>{
  try{
    const ev=await global.db.get(`SELECT * FROM group_events WHERE id=?`,[req.params.eid]);
    if(!ev) return res.status(404).json({message:'Event not found'});
    if(String(ev.creator_id)!==String(req.user.id) && req.user.role!=='Admin' && !await canModerate(ev.group_id, req.user.id)) return res.status(403).json({message:'Not authorized'});
    await global.db.run(`DELETE FROM group_events WHERE id=?`,[req.params.eid]);
    if(req.user.role==='Admin' && String(ev.creator_id)!==String(req.user.id)){
        try{
            const adminUser=await global.db.get('SELECT fullName FROM users WHERE id=?',[req.user.id]);
            const adminName=adminUser?.fullName||'Admin';
            const dateStr=new Date().toLocaleDateString('en-GB');
            const m=`Your group event "${(ev.title||'').slice(0,40)}" was deleted by Admin ${adminName} on ${dateStr}`;
            await global.db.run('INSERT INTO notifications (recipient_id, sender_id, type, message) VALUES (?,?,?,?)',[ev.creator_id, req.user.id, 'admin_delete', m]);
            const io=req.app.get('io'); const onlineUsers=req.app.get('onlineUsers');
            if(io&&onlineUsers){const s=onlineUsers.get(String(ev.creator_id)); if(s) io.to(s).emit('new_notification',{message:m,type:'admin_delete'});}
        }catch{}
    }
    res.json({message:'Event deleted'});
  }catch(e){ res.status(500).json({message:e.message}); }
};

exports.deleteGroupPoll = async (req,res)=>{
  try{
    const poll=await global.db.get(`SELECT * FROM group_polls WHERE id=?`,[req.params.pid]);
    if(!poll) return res.status(404).json({message:'Poll not found'});
    if(String(poll.created_by)!==String(req.user.id) && req.user.role!=='Admin' && !await canModerate(poll.group_id, req.user.id)) return res.status(403).json({message:'Not authorized'});
    await global.db.run(`DELETE FROM group_poll_votes WHERE poll_id=?`,[req.params.pid]);
    await global.db.run(`DELETE FROM group_polls WHERE id=?`,[req.params.pid]);
    if(req.user.role==='Admin' && String(poll.created_by)!==String(req.user.id)){
        try{
            const adminUser=await global.db.get('SELECT fullName FROM users WHERE id=?',[req.user.id]);
            const adminName=adminUser?.fullName||'Admin';
            const dateStr=new Date().toLocaleDateString('en-GB');
            const m=`Your group poll "${(poll.question||'').slice(0,40)}" was deleted by Admin ${adminName} on ${dateStr}`;
            await global.db.run('INSERT INTO notifications (recipient_id, sender_id, type, message) VALUES (?,?,?,?)',[poll.created_by, req.user.id, 'admin_delete', m]);
            const io=req.app.get('io'); const onlineUsers=req.app.get('onlineUsers');
            if(io&&onlineUsers){const s=onlineUsers.get(String(poll.created_by)); if(s) io.to(s).emit('new_notification',{message:m,type:'admin_delete'});}
        }catch{}
    }
    res.json({message:'Poll deleted'});
  }catch(e){ res.status(500).json({message:e.message}); }
};

exports.deleteGroupPostComment = async (req,res)=>{
  try{
    const c=await global.db.get(`SELECT * FROM group_post_comments WHERE id=?`,[req.params.cid]);
    if(!c) return res.status(404).json({message:'Comment not found'});
    const post=await global.db.get(`SELECT group_id FROM group_posts WHERE id=?`,[c.post_id]);
    const isOwner=String(c.user_id)===String(req.user.id);
    const isModerator=post && await canModerate(post.group_id, req.user.id);
    if(!isOwner && req.user.role!=='Admin' && !isModerator) return res.status(403).json({message:'Not authorized'});
    await global.db.run(`DELETE FROM group_post_comments WHERE id=?`,[req.params.cid]);
    if(req.user.role==='Admin' && String(c.user_id)!==String(req.user.id)){
        try{
            const adminUser=await global.db.get('SELECT fullName FROM users WHERE id=?',[req.user.id]);
            const adminName=adminUser?.fullName||'Admin';
            const dateStr=new Date().toLocaleDateString('en-GB');
            const m=`Your group comment "${(c.content||'').slice(0,40)}" was deleted by Admin ${adminName} on ${dateStr}`;
            await global.db.run('INSERT INTO notifications (recipient_id, sender_id, type, message) VALUES (?,?,?,?)',[c.user_id, req.user.id, 'admin_delete', m]);
            const io=req.app.get('io'); const onlineUsers=req.app.get('onlineUsers');
            if(io&&onlineUsers){const s=onlineUsers.get(String(c.user_id)); if(s) io.to(s).emit('new_notification',{message:m,type:'admin_delete'});}
        }catch{}
    }
    res.json({message:'Comment deleted'});
  }catch(e){ res.status(500).json({message:e.message}); }
};
