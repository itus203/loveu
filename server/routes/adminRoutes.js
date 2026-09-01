const router = require('express').Router();
const auth = require('../middleware/authMiddleware');
const nexusAdmin = require('../middleware/nexusAdminMiddleware');
const {
    getStats, getRecentPosts, getAllUsers,
    updateUserRole, deleteUser, sendAnnouncement,
    assignAdminByEmail, removeAdmin, getAllAdmins, verifyUser,
    // New: Security & Accountability
    getAuditLogs, getContentReports, getUserIdentity,
    warnUser, banUser, unbanUser, getBannedUsers,
    resolveReport, deleteReportedContent, deleteAnyContent, getVersion
} = require('../controllers/adminController');

// Admin-only — any user with role Admin can access moderation endpoints
const adminOnly = (req, res, next) => {
    if (req.user?.role !== 'Admin') {
        return res.status(403).json({ message: 'Admin access required' });
    }
    next();
};
// Nexus super-admin whitelist — only for assigning new admins
const nexusOnly = (req, res, next) => {
    if (req.user?.role !== 'Admin') {
        return res.status(403).json({ message: 'Admin access required' });
    }
    const whitelist = ['codingwithsalman11@gmail.com','mehedirohan2002@gmail.com','mehedihasanrohan2002@gmail.com','codingwithsifat@gmail.com'];
    if (!whitelist.includes(req.user.email?.toLowerCase())) {
        return res.status(403).json({ message: 'Nexus Team Admin only' });
    }
    next();
};

// ─── Existing endpoints ──────────────────────────────────────────────────────
router.get('/stats',             auth, adminOnly, getStats);
router.get('/recent-posts',      auth, adminOnly, getRecentPosts);
router.get('/users',             auth, adminOnly, getAllUsers);
router.get('/admins',            auth, adminOnly, getAllAdmins);
router.put('/users/:id/role',    auth, adminOnly, updateUserRole);
router.put('/users/:id/verify',  auth, adminOnly, verifyUser);
router.delete('/users/:id',      auth, adminOnly, deleteUser);
router.post('/announce',         auth, adminOnly, sendAnnouncement);
router.post('/assign-admin',     auth, nexusOnly, assignAdminByEmail);
router.delete('/admins/:id',     auth, nexusOnly, removeAdmin);

// ─── Security & Accountability (NEW) ─────────────────────────────────────────
router.get('/audit-logs',            auth, adminOnly, getAuditLogs);       // Full audit log with IP
router.get('/reports',               auth, adminOnly, getContentReports);  // Reported content — A-Z all types
router.put('/reports/:id/resolve',   auth, adminOnly, resolveReport);      // Mark report resolved/dismissed
router.delete('/reports/:id/content',auth, adminOnly, deleteReportedContent); // Delete reported content + resolve (A-Z)
router.delete('/content/:type/:id', auth, adminOnly, deleteAnyContent);   // Direct delete any content A-Z (no report needed)
router.get('/user-identity/:id',     auth, adminOnly, getUserIdentity);    // Full identity dossier
router.post('/warn-user',            auth, adminOnly, warnUser);           // Issue official warning
router.post('/ban-user',             auth, adminOnly, banUser);            // Suspend/ban account
router.delete('/ban-user/:id',       auth, adminOnly, unbanUser);          // Lift suspension
router.get('/banned-users',          auth, adminOnly, getBannedUsers);     // All banned users
router.get('/version',               auth, adminOnly, getVersion);         // App version & changelog

module.exports = router;
