require('dotenv').config();
process.env.TZ = 'Asia/Dhaka';
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const hpp = require('hpp');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const { rateLimiter, authLimiter, uploadLimiter, sanitizeInput, requestLogger } = require('./middleware/securityMiddleware');

const app = express();
app.set('trust proxy', 1); // Vercel: fix express-rate-limit ValidationError: The 'Forwarded' header
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: process.env.NODE_ENV === 'production'
            ? (process.env.ALLOWED_ORIGIN || '*')
            : '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE']
    }
});

// Attach io to app so controllers can access it
app.set('io', io);

// ─── Security Headers (Helmet) ───────────────────────────────────────────────
app.use(helmet({
    contentSecurityPolicy: false, // Allows inline scripts for the SPA; tighten later with nonces
    crossOriginEmbedderPolicy: false
}));

// ─── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = process.env.NODE_ENV === 'production'
    ? (process.env.ALLOWED_ORIGIN ? [process.env.ALLOWED_ORIGIN] : ['*'])
    : ['*'];
app.use(cors({
    origin: (origin, cb) => cb(null, true), // Tighten in production via ALLOWED_ORIGIN env var
    credentials: true
}));

// ─── HTTP Parameter Pollution Prevention ────────────────────────────────────
app.use(hpp());

// ─── Body Parsers ──────────────────────────────────────────────────────────
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ─── Input Sanitization (NoSQL / SQL Injection Prevention) ──────────────────
app.use(sanitizeInput);

// ─── Block sensitive files (database, env) ───────────────────────────────────
app.use((req, res, next) => {
    const blocked = ['.sqlite', '.sqlite-shm', '.sqlite-wal', '.db', '.env', 'database.'];
    if (blocked.some(ext => req.path.toLowerCase().includes(ext))) {
        return res.status(403).json({ message: 'Forbidden' });
    }
    next();
});

// ─── JWT Secret check ─────────────────────────────────────────────────────────
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.includes('super_secret')) {
    console.warn('⚠️  JWT_SECRET using default - change JWT_SECRET in .env for production! (not exiting)');
}

// ─── General API Rate Limiter ────────────────────────────────────────────────
app.use('/api', rateLimiter);

// Static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, '../client')));


// Socket.io — track online users
const onlineUsers = new Map(); // userId -> socketId
app.set('onlineUsers', onlineUsers);

io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id);

    socket.on('user_online', async (userId) => {
        onlineUsers.set(String(userId), socket.id);
        socket.userId = String(userId);
        try { if (global.db) await global.db.run(`UPDATE users SET is_online=1, last_seen=CURRENT_TIMESTAMP WHERE id=?`, [userId]); } catch {}
        io.emit('online_users', Array.from(onlineUsers.keys()));
        io.emit('user_came_online', String(userId));
        // Auto mark pending messages as delivered
        try {
            if (global.db) {
                await global.db.run(`UPDATE messages SET status='delivered', delivered_at=CURRENT_TIMESTAMP WHERE receiver_id=? AND status='sent'`, [userId]);
                const pending = await global.db.all(`SELECT sender_id FROM messages WHERE receiver_id=? AND status='delivered' GROUP BY sender_id`, [userId]);
                for (const p of pending) {
                    const senderSid = onlineUsers.get(String(p.sender_id));
                    if (senderSid) io.to(senderSid).emit('messages_delivered', { receiverId: userId, senderId: p.sender_id });
                }
            }
        } catch {}
    });

    socket.on('join_chat', (roomId) => {
        socket.join(roomId);
    });

    socket.on('send_message', (data) => {
        const roomId = [data.senderId, data.receiverId].sort().join('_');
        io.to(roomId).emit('receive_message', data);
    });

    socket.on('typing', (data) => {
        // Direct typing via onlineUsers for reliability + room
        const targetSid = onlineUsers.get(String(data.receiverId));
        if (targetSid) io.to(targetSid).emit('user_typing', data);
        const roomId = [data.senderId, data.receiverId].sort().join('_');
        socket.to(roomId).emit('user_typing', data);
    });
    socket.on('stop_typing', (data) => {
        const targetSid = onlineUsers.get(String(data.receiverId));
        if (targetSid) io.to(targetSid).emit('user_stop_typing', data);
        const roomId = [data.senderId, data.receiverId].sort().join('_');
        socket.to(roomId).emit('user_stop_typing', data);
    });
    socket.on('message_delivered', async (data) => {
        try {
            if (global.db) await global.db.run(`UPDATE messages SET status='delivered', delivered_at=CURRENT_TIMESTAMP WHERE id=?`, [data.messageId]);
        } catch {}
        const senderSid = onlineUsers.get(String(data.senderId));
        if (senderSid) io.to(senderSid).emit('message_delivered', data);
    });
    socket.on('message_seen', async (data) => {
        try {
            if (global.db) await global.db.run(`UPDATE messages SET status='seen', isRead=1, read_at=CURRENT_TIMESTAMP WHERE id=?`, [data.messageId]);
        } catch {}
        const senderSid = onlineUsers.get(String(data.senderId));
        if (senderSid) io.to(senderSid).emit('message_seen', data);
        // also broadcast seen avatar update
        const targetSid = onlineUsers.get(String(data.receiverId));
        if (targetSid) io.to(targetSid).emit('messages_seen', { readerId: data.receiverId, peerId: data.senderId });
    });
    socket.on('join_group', (groupId) => {
        socket.join('group_' + groupId);
    });
    socket.on('leave_group', (groupId) => {
        socket.leave('group_' + groupId);
    });

    // WebRTC Audio & Video Calling Signaling
    socket.on('call:start', (data) => {
        const targetSid = onlineUsers.get(String(data.toUserId));
        if (targetSid) {
            io.to(targetSid).emit('call:incoming', {
                fromUser: data.fromUser,
                isVideo: data.isVideo,
                callId: data.callId,
                fromSocketId: socket.id
            });
        } else {
            socket.emit('call:user_offline', { toUserId: data.toUserId });
        }
    });

    socket.on('call:accept', (data) => {
        const targetSid = onlineUsers.get(String(data.toUserId));
        if (targetSid) {
            io.to(targetSid).emit('call:accepted', { callId: data.callId, isVideo: data.isVideo });
        }
    });

    socket.on('call:reject', (data) => {
        const targetSid = onlineUsers.get(String(data.toUserId));
        if (targetSid) {
            io.to(targetSid).emit('call:rejected', { callId: data.callId, reason: data.reason || 'declined' });
        }
    });

    socket.on('call:end', (data) => {
        const targetSid = onlineUsers.get(String(data.toUserId));
        if (targetSid) {
            io.to(targetSid).emit('call:ended', { callId: data.callId });
        }
    });

    socket.on('call:signal', (data) => {
        const targetSid = onlineUsers.get(String(data.toUserId));
        if (targetSid) {
            io.to(targetSid).emit('call:signal', { signal: data.signal, fromUserId: data.fromUserId });
        }
    });

    // Campus Live Streaming Events
    socket.on('live:start', (data) => {
        socket.join(`live_${data.streamId}`);
        io.emit('live:started', data);
    });

    socket.on('live:join', (data) => {
        socket.join(`live_${data.streamId}`);
        const room = io.sockets.adapter.rooms.get(`live_${data.streamId}`);
        const viewerCount = room ? room.size : 1;
        io.to(`live_${data.streamId}`).emit('live:viewer_update', { streamId: data.streamId, viewerCount });
    });

    socket.on('live:leave', (data) => {
        socket.leave(`live_${data.streamId}`);
        const room = io.sockets.adapter.rooms.get(`live_${data.streamId}`);
        const viewerCount = room ? room.size : 0;
        io.to(`live_${data.streamId}`).emit('live:viewer_update', { streamId: data.streamId, viewerCount });
    });

    socket.on('live:comment', (data) => {
        io.to(`live_${data.streamId}`).emit('live:new_comment', data);
    });

    socket.on('live:react', (data) => {
        io.to(`live_${data.streamId}`).emit('live:new_react', data);
    });

    socket.on('live:end', (data) => {
        io.to(`live_${data.streamId}`).emit('live:ended', data);
        io.emit('live:stream_closed', data);
    });

    socket.on('disconnect', async () => {
        let discUserId=null;
        for (const [userId, sid] of onlineUsers.entries()) {
            if (sid === socket.id) {
                discUserId=userId;
                onlineUsers.delete(userId);
                break;
            }
        }
        if (discUserId) {
            try { if (global.db) await global.db.run(`UPDATE users SET is_online=0, last_seen=CURRENT_TIMESTAMP WHERE id=?`, [discUserId]); } catch {}
            io.emit('user_went_offline', String(discUserId));
            // last seen broadcast
            io.emit('user_last_seen', { userId: String(discUserId), lastSeen: new Date().toISOString() });
        }
        io.emit('online_users', Array.from(onlineUsers.keys()));
        console.log('Socket disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 5000;

// Health check — must be BEFORE DB init, returns in <100ms so frontend 1sec ready
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString(), port: PORT, dbReady: !!global.db }));
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString(), port: PORT, dbReady: !!global.db }));

// DB warming middleware — returns 503 until DB ready (so 1sec load shows retry, not Failed)
app.use('/api', (req, res, next) => {
    if (req.path === '/health' || req.path === '/health/' || req.url.includes('/health')) return next();
    if (!global.db) return res.status(503).json({ message: 'Server warming up, please retry in 1 second...', retry: true, dbReady: false });
    next();
});

// Start listening immediately — 1sec load (DB init runs in background)
server.listen(PORT, () => {
    console.log(`🚀 DIU Nexus server running on http://localhost:${PORT}`);
});
server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} already in use — server already running?`);
        console.log(`✅ Using existing server at http://localhost:${PORT}`);
    } else {
        console.error('❌ Server error:', err);
    }
});

(async () => {
    try {
        // ✅ Dual Engine: Cloud PostgreSQL / Supabase / Neon / Render OR Local SQLite fallback
        const t0 = Date.now();
        const { initDatabase } = require('./config/db');
        global.db = await initDatabase();
        
        console.log(`✅ Database initialized successfully in ${Date.now()-t0}ms`);

        // Register routes
        const authRoutes = require('./routes/authRoutes');
        const userRoutes = require('./routes/userRoutes');
        const postRoutes = require('./routes/postRoutes');
        const friendRoutes = require('./routes/friendRoutes');
        const messageRoutes = require('./routes/messageRoutes');
        const notificationRoutes = require('./routes/notificationRoutes');
        const groupRoutes = require('./routes/groupRoutes');
        const reactionRoutes = require('./routes/reactionRoutes');
        const savedRoutes = require('./routes/savedRoutes');
        const searchRoutes = require('./routes/searchRoutes');
        const storyRoutes = require('./routes/storyRoutes');
        const resourceRoutes = require('./routes/resourceRoutes');
        const reelRoutes = require('./routes/reelRoutes');
        const departmentRoutes = require('./routes/departmentRoutes');
        const adminRoutes = require('./routes/adminRoutes');
        const eventRoutes = require('./routes/eventRoutes');
        const lostfoundRoutes = require('./routes/lostfoundRoutes');
        const marketplaceRoutes = require('./routes/marketplaceRoutes');
        const confessionRoutes = require('./routes/confessionRoutes');
        const diuRoutes = require('./routes/diuRoutes');
        const alumniRoutes = require('./routes/alumniRoutes');
        const busRoutes = require('./routes/busRoutes');

        app.use('/api/auth', authLimiter, authRoutes);
        app.use('/api/users', requestLogger, userRoutes);
        app.use('/api/posts', requestLogger, postRoutes);
        app.use('/api/friends', requestLogger, friendRoutes);
        app.use('/api/messages', messageRoutes);
        app.use('/api/notifications', notificationRoutes);
        app.use('/api/groups', requestLogger, groupRoutes);
        app.use('/api/reactions', reactionRoutes);
        app.use('/api/saved', savedRoutes);
        app.use('/api/search', searchRoutes);
        app.use('/api/stories', requestLogger, storyRoutes);
        app.use('/api/resources', requestLogger, resourceRoutes);
        app.use('/api/reels', requestLogger, reelRoutes);
        app.use('/api/departments', departmentRoutes);
        app.use('/api/admin', requestLogger, adminRoutes);
        app.use('/api/events', requestLogger, eventRoutes);
        app.use('/api/lostfound', requestLogger, lostfoundRoutes);
        app.use('/api/marketplace', requestLogger, marketplaceRoutes);
        app.use('/api/confessions', requestLogger, confessionRoutes);
        app.use('/api/diu', diuRoutes);
        app.use('/api/alumni', alumniRoutes);
        app.use('/api/bus', busRoutes);

        // ── NEW FEATURE ROUTES ────────────────────────────────────────────────
        app.use('/api/housing',      requestLogger, require('./routes/housingRoutes'));
        app.use('/api/blood',        requestLogger, require('./routes/bloodRoutes'));
        app.use('/api/polls',        requestLogger, require('./routes/pollRoutes'));
        app.use('/api/rideshare',    requestLogger, require('./routes/rideshareRoutes'));
        app.use('/api/tutoring',     requestLogger, require('./routes/tutoringRoutes'));
        app.use('/api/internships',  requestLogger, require('./routes/internshipRoutes'));
        app.use('/api/clubs',        requestLogger, require('./routes/clubRoutes'));
        app.use('/api/showcase',     requestLogger, require('./routes/showcaseRoutes'));
        app.use('/api/study-rooms',  requestLogger, require('./routes/studyRoomRoutes'));
        app.use('/api/question-bank',requestLogger, require('./routes/questionBankRoutes'));
        app.use('/api/food',         requestLogger, require('./routes/foodRoutes'));
        app.use('/api/reports',      requestLogger, require('./routes/reportRoutes')); // Generic A-Z reports: housing, marketplace, blood, reels, story, etc.

        // Global error handler
        
        app.use('/api/channels', requestLogger, require('./routes/channelRoutes'));
        app.use('/api/cloud-files', requestLogger, require('./routes/cloudFileRoutes'));
        app.use('/api/ai', requestLogger, require('./routes/aiRoutes'));
        app.use('/api/creator', requestLogger, require('./routes/creatorRoutes'));
        app.use((err, req, res, next) => {
            console.error(err.stack);
            res.status(500).json({ message: 'Internal server error', error: err.message });
        });

    } catch (err) {
        console.error('❌ Failed to start server:', err);
        if (err.code === 'EADDRINUSE') {
            console.log(`⚠️  Server already running on port ${process.env.PORT || 5000}, continuing...`);
        } else {
            console.log('⚠️  DB init failed, server stays up (health will show dbReady:false) — will retry');
        }
    }
})();
