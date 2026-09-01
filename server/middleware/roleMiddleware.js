module.exports = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const userRole = req.user.role;
    // Normalize roles
    const normalizedAllowed = allowedRoles.map(r=>r.toLowerCase());
    if (!normalizedAllowed.includes(userRole.toLowerCase())) {
      return res.status(403).json({ message: `Forbidden: ${userRole} cannot access. Required: ${allowedRoles.join(', ')}` });
    }
    next();
  };
};
