// Generic Report Controller — A-Z: handles reports for ANY content type
const VALID_TYPES = ['post','housing','marketplace','lost_found','blood_request','blood_donation','reels','story','rideshare','tutoring','internship','resource','question_bank','club','showcase','event','group','group_post','comment','user','food_vendor','food_item','food_review','housing_review'];

const TABLE_MAP = {
  post: { table: 'posts', idCol: 'id', userCol: 'user_id' },
  housing: { table: 'housing_posts', idCol: 'id', userCol: 'user_id' },
  marketplace: { table: 'marketplace', idCol: 'id', userCol: 'user_id' },
  lost_found: { table: 'lost_found', idCol: 'id', userCol: 'user_id' },
  blood_request: { table: 'blood_requests', idCol: 'id', userCol: 'user_id' },
  blood_donation: { table: 'blood_donations', idCol: 'id', userCol: 'user_id' },
  reels: { table: 'reels', idCol: 'id', userCol: 'user_id' },
  story: { table: 'stories', idCol: 'id', userCol: 'user_id' },
  rideshare: { table: 'rideshare_posts', idCol: 'id', userCol: 'user_id' },
  tutoring: { table: 'tutoring_posts', idCol: 'id', userCol: 'user_id' },
  internship: { table: 'internships', idCol: 'id', userCol: 'posted_by' },
  resource: { table: 'resources', idCol: 'id', userCol: 'user_id' },
  question_bank: { table: 'question_bank', idCol: 'id', userCol: 'uploaded_by' },
  club: { table: 'clubs', idCol: 'id', userCol: 'president_id' },
  showcase: { table: 'showcase_projects', idCol: 'id', userCol: 'user_id' },
  event: { table: 'events', idCol: 'id', userCol: 'creator_id' },
  group: { table: 'groups_table', idCol: 'id', userCol: 'creator_id' },
  group_post: { table: 'group_posts', idCol: 'id', userCol: 'user_id' },
  comment: { table: 'comments', idCol: 'id', userCol: 'user_id' },
  user: { table: 'users', idCol: 'id', userCol: 'id' },
  food_vendor: { table: 'food_vendors', idCol: 'id', userCol: 'id' },
  food_item: { table: 'food_items', idCol: 'id', userCol: 'vendor_id' },
  food_review: { table: 'food_reviews', idCol: 'vendor_id', userCol: 'user_id' },
  housing_review: { table: 'housing_reviews', idCol: 'id', userCol: 'user_id' },
};

exports.reportContent = async (req, res) => {
  try {
    const { target_type, target_id, reason, details } = req.body;
    const type = (target_type || req.params.type || '').toLowerCase();
    const id = target_id || req.params.id;
    if (!type || !id) return res.status(400).json({ message: 'target_type and target_id required' });
    if (!VALID_TYPES.includes(type)) return res.status(400).json({ message: 'Invalid target_type. Allowed: ' + VALID_TYPES.join(', ') });
    if (!reason) return res.status(400).json({ message: 'Reason is required' });

    const mapping = TABLE_MAP[type];
    if (!mapping) return res.status(400).json({ message: 'Unsupported type' });

    // Check content exists and get owner (skip for vendor/item which have no single owner)
    const content = await global.db.get(`SELECT ${mapping.idCol} as id, ${mapping.userCol} as owner_id FROM ${mapping.table} WHERE ${mapping.idCol}=?`, [id]);
    if (!content) return res.status(404).json({ message: `${type} not found` });
    if (!['food_vendor','food_item'].includes(type) && String(content.owner_id) === String(req.user.id)) return res.status(400).json({ message: 'You cannot report your own content' });

    const reporter = await global.db.get('SELECT fullName FROM users WHERE id=?', [req.user.id]);
    await global.db.run(
      `INSERT INTO content_reports (reporter_id, reporter_name, target_type, target_id, reason, details) VALUES (?,?,?,?,?,?)`,
      [req.user.id, reporter?.fullName || '', type, id, reason, details || null]
    );

    // Notify all admins - with link to auto-navigate to portal
    const linkMap = {
        post: `home.html#post-${id}`,
        housing: `views/home-portal.html#house-${id}`,
        marketplace: `views/marketplace.html#item-${id}`,
        lost_found: `views/lostfound.html#item-${id}`,
        blood_request: `views/blood-donation.html#request-${id}`,
        blood_donation: `views/blood-donation.html#donor-${id}`,
        reels: `views/reels.html#reel-${id}`,
        story: `home.html#story-${id}`,
        rideshare: `views/rideshare.html#ride-${id}`,
        tutoring: `views/tutoring.html#tutor-${id}`,
        internship: `views/internships.html#intern-${id}`,
        resource: `views/resources.html#resource-${id}`,
        question_bank: `views/question-bank.html#qb-${id}`,
        club: `views/clubs.html#club-${id}`,
        showcase: `views/showcase.html#showcase-${id}`,
        event: `views/events.html#event-${id}`,
        group: `views/group.html?id=${id}`,
        group_post: `views/group.html#post-${id}`,
        comment: `home.html#post-${id}`,
        food_vendor: `views/food-portal.html#vendor-${id}`,
        food_item: `views/food-portal.html#item-${id}`,
        food_review: `views/food-portal.html#review-${id}`,
        user: `views/profile.html?id=${id}`
    };
    const link = linkMap[type] || `views/admin.html#reports`;
    const admins = await global.db.all('SELECT id FROM users WHERE role="Admin"');
    for (const admin of admins) {
      await global.db.run('INSERT INTO notifications (recipient_id, sender_id, type, message, link) VALUES (?,?,?,?,?)',
        [admin.id, req.user.id, 'report', `New ${type} report: #${id} for "${reason}" by ${reporter?.fullName || 'user'}`, link]);
      // Socket notify if online
      try {
        const io = req.app.get('io');
        const onlineUsers = req.app.get('onlineUsers');
        if (io && onlineUsers) {
          const sock = onlineUsers.get(String(admin.id));
          if (sock) io.to(sock).emit('new_notification', { message: `New ${type} report #${id}: ${reason}`, type: 'report', link });
        }
      } catch {}
    }
    // Audit log
    try {
      await global.db.run(`INSERT INTO audit_logs (user_id, user_email, user_role, action, target_type, target_id, details, severity) VALUES (?,?,?,?,?,?,?,?)`,
        [req.user.id, req.user.email, req.user.role, 'REPORT_CONTENT', type, id, reason, 'warning']);
    } catch {}
    res.status(201).json({ message: `${type} reported to Admin. Our team will review.` });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// For backwards compat: report post via /posts/:id/report calls this with type=post
exports.reportPostWrapper = async (req, res) => {
  req.body.target_type = 'post';
  req.body.target_id = req.params.id;
  return exports.reportContent(req, res);
};
