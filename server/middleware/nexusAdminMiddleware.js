const NEXUS_ADMINS = ['codingwithsalman11@gmail.com','mehedirohan2002@gmail.com','mehedihasanrohan2002@gmail.com','codingwithsifat@gmail.com'];
module.exports = (req, res, next) => {
  if (!req.user || !req.user.email) return res.status(401).json({ message: 'Unauthorized' });
  const email = req.user.email.toLowerCase().trim();
  const role = (req.user.role||'').toLowerCase();
  if (role !== 'admin') return res.status(403).json({ message: 'Admin only' });
  if (!NEXUS_ADMINS.includes(email)) {
    // Log attempt
    if (global.db) {
      global.db.run(`INSERT INTO audit_logs (user_id, user_email, user_role, action, target_type, details, severity) VALUES (?,?,?,?,?,?,?)`,
        [req.user.id, req.user.email, req.user.role, 'UNAUTHORIZED_NEXUS_ADMIN', 'admin', `Blocked ${email}`, 'critical']).catch(()=>{});
    }
    return res.status(403).json({ message: 'Nexus Team Admin only. Your email is not whitelisted.' });
  }
  next();
};
