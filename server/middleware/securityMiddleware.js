const rateLimit = require('express-rate-limit');

// ─── General API Rate Limiter ───────────────────────────────────────────────
// Increased for campus demo (stories polling + messenger) — 500 req/min
const rateLimiter = rateLimit({
    windowMs: 60 * 1000,          // 1 minute
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
        // Skip rate-limit for polling endpoints in demo to prevent 429 on refresh
        if (req.path.includes('/stories/feed') || req.path.includes('/stories/explore') || req.path.includes('/stories/nexus-now') || req.path.includes('/stories/campus')) return true;
        return false;
    },
    message: { message: 'Too many requests from this IP. Please try again in a minute.' }
});

// ─── Auth Route Strict Rate Limiter ─────────────────────────────────────────
// Protects against brute-force login attacks — max 5 attempts per 15 minutes per IP
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,     // 15 minutes
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,  // Only count failed attempts
    message: { message: 'Too many failed login attempts. Please wait 15 minutes before trying again.' }
});

// ─── Upload Route Limiter ───────────────────────────────────────────────────
// Prevents upload spam — max 20 uploads per 10 minutes per IP
const uploadLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 20,
    message: { message: 'Upload limit reached. Please wait before uploading more files.' }
});

// ─── Input Sanitizer ────────────────────────────────────────────────────────
// Strips $, . prefixes from all body/query keys to block NoSQL injection
const sanitizeInput = (req, res, next) => {
    const sanitize = (obj) => {
        if (!obj || typeof obj !== 'object') return obj;
        for (const key of Object.keys(obj)) {
            if (key.startsWith('$') || key.includes('.')) {
                delete obj[key];
            } else if (obj[key] !== null && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
                // Flatten nested objects in expected string fields to prevent NoSQL injection
                // e.g. { email: { $gt: '' } } → { email: '' }
                obj[key] = sanitize(obj[key]);
                // If it's still an object after sanitize (no $ keys removed), flatten to empty string
                if (typeof obj[key] === 'object') obj[key] = '';
            } else if (typeof obj[key] === 'string') {
                // Trim excessively long strings to prevent memory attacks
                if (obj[key].length > 100000) obj[key] = obj[key].substring(0, 100000);
            }
        }
        return obj;
    };
    sanitize(req.body);
    sanitize(req.query);
    sanitize(req.params);
    next();
};

// ─── Request Logger ──────────────────────────────────────────────────────────
// Logs every significant authenticated API action to the audit_logs DB table
const requestLogger = (req, res, next) => {
    const skipPaths = ['/api/auth/me', '/api/notifications', '/api/posts/feed', '/api/users/suggestions'];
    if (req.user && !skipPaths.some(p => req.path.startsWith(p.replace('/api', '')))) {
        const action = `${req.method} ${req.path}`;
        const ip = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        const ua = (req.headers['user-agent'] || '').substring(0, 200);

        setImmediate(async () => {
            try {
                if (global.db) {
                    await global.db.run(
                        `INSERT INTO audit_logs (user_id, user_email, user_role, action, ip_address, user_agent, severity)
                         VALUES (?, ?, ?, ?, ?, ?, 'info')`,
                        [req.user.id, req.user.email || '', req.user.role || '', action, ip, ua]
                    );
                }
            } catch (_) { /* silent — never crash the server for logging */ }
        });
    }
    next();
};

module.exports = { rateLimiter, authLimiter, uploadLimiter, sanitizeInput, requestLogger };
