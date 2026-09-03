const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { MongoCloudAdapter } = require('./mongoAdapter');

let dbInstance = null;

async function initDatabase() {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 
                     (process.env.DATABASE_URL && (process.env.DATABASE_URL.startsWith('mongodb://') || process.env.DATABASE_URL.startsWith('mongodb+srv://')) ? process.env.DATABASE_URL : null);

    const pgUrl = process.env.DATABASE_URL && (process.env.DATABASE_URL.startsWith('postgres://') || process.env.DATABASE_URL.startsWith('postgresql://')) ? process.env.DATABASE_URL : null;

    // 🍃 1. MONGODB CLOUD (MongoDB Atlas / Cloud Database)
    if (mongoUri) {
        try {
            console.log('🍃 Connecting to MongoDB Cloud (Atlas)...');
            const { MongoClient } = require('mongodb');
            const client = new MongoClient(mongoUri, {
                serverSelectionTimeoutMS: 8000
            });
            await client.connect();
            const db = client.db(process.env.MONGO_DB_NAME || 'diunexus');
            console.log('✅ Connected successfully to MongoDB Cloud (Atlas Database: ' + db.databaseName + ')!');
            const mongoAdapter = new MongoCloudAdapter(client, db);
            dbInstance = mongoAdapter;
            return mongoAdapter;
        } catch (err) {
            console.error('❌ MongoDB Cloud connection error:', err.message);
            console.log('🔄 Falling back to local database...');
        }
    }

    // 🐘 2. POSTGRESQL CLOUD (Supabase / Neon / Render / Railway)
    if (pgUrl) {
        try {
            console.log('🐘 Connecting to Cloud Database (PostgreSQL / Supabase / Neon)...');
            const { Pool } = require('pg');
            const pool = new Pool({
                connectionString: pgUrl,
                ssl: process.env.NODE_ENV === 'production' || pgUrl.includes('supabase') || pgUrl.includes('neon.tech')
                    ? { rejectUnauthorized: false }
                    : false,
                connectionTimeoutMillis: 15000,
                idleTimeoutMillis: 30000,
                max: 1,
                keepAlive: true
            });

            const pgAdapter = {
                isPostgres: true,
                pool,
                async get(sql, params = []) {
                    const pgSql = convertSqlToPg(sql);
                    const res = await pool.query(pgSql, params);
                    return res.rows[0] || null;
                },
                async all(sql, params = []) {
                    const pgSql = convertSqlToPg(sql);
                    const res = await pool.query(pgSql, params);
                    return res.rows;
                },
                async run(sql, params = []) {
                    let pgSql = convertSqlToPg(sql);
                    if (/^INSERT\s+INTO/i.test(pgSql) && !/RETURNING/i.test(pgSql)) {
                        pgSql += ' RETURNING id';
                    }
                    const res = await pool.query(pgSql, params);
                    return {
                        lastID: res.rows && res.rows[0] ? res.rows[0].id : null,
                        changes: res.rowCount
                    };
                },
                async exec(sql) {
                    const converted = convertSchemaToPg(sql);
                    return pool.query(converted);
                }
            };

            await createTables(pgAdapter);
            // Migration: ensure email_otps has 'used' column (old deployments missing it)
            try { await pool.query('ALTER TABLE email_otps ADD COLUMN IF NOT EXISTS used INTEGER DEFAULT 0'); } catch {}
            console.log('✅ Cloud PostgreSQL Database initialized and connected successfully!');
            dbInstance = pgAdapter;
            return pgAdapter;
        } catch (err) {
            console.error('❌ PostgreSQL Cloud connection error:', err.message);
            console.log('🔄 Falling back to local database...');
        }
    }

    // 💾 3. LOCAL FILE DATABASE (SQLite with WAL mode)
    console.log('💾 Initializing SQLite Local Database...');
    const localDb = await open({
        filename: path.join(__dirname, '../../database.sqlite'),
        driver: sqlite3.Database
    });

    await localDb.exec('PRAGMA journal_mode=WAL;');
    await localDb.exec('PRAGMA foreign_keys=ON;');

    await createTables(localDb);
    // Migration for existing SQLite DBs
    try { await localDb.exec('ALTER TABLE email_otps ADD COLUMN used INTEGER DEFAULT 0'); } catch {}
    console.log('✅ Local SQLite Database initialized successfully!');
    dbInstance = localDb;
    return localDb;
}

function convertSqlToPg(sql) {
    let index = 1;
    const hasOrIgnore = /INSERT OR IGNORE/i.test(sql);
    const hasOrReplace = /INSERT OR REPLACE/i.test(sql);
    let converted = sql.replace(/\?/g, () => `$${index++}`);
    // ── SQLite → Postgres runtime compatibility ──────────────────────────
    // datetime('now') and variants → NOW() / NOW() + INTERVAL
    // Must handle interval first, then plain
    converted = converted.replace(/datetime\s*\(\s*'now'\s*,\s*'([^']+)'\s*\)/gi, (m, interval) => `NOW() + INTERVAL '${interval}'`);
    converted = converted.replace(/datetime\s*\(\s*'now'\s*\)/gi, 'NOW()');
    // datetime(col) > datetime('now',...) patterns already covered via above, but keep generic
    converted = converted.replace(/datetime\s*\(\s*created_at\s*\)/gi, 'created_at');
    // date('now') variants → CURRENT_DATE / CURRENT_DATE + INTERVAL
    converted = converted.replace(/date\s*\(\s*'now'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/gi, (m, a, b) => `CURRENT_DATE + INTERVAL '${a}' + INTERVAL '${b}'`);
    converted = converted.replace(/date\s*\(\s*'now'\s*,\s*'([^']+)'\s*\)/gi, (m, interval) => `CURRENT_DATE + INTERVAL '${interval}'`);
    converted = converted.replace(/date\s*\(\s*'now'\s*\)/gi, 'CURRENT_DATE');
    // date(col) → DATE(col) for PG
    converted = converted.replace(/date\s*\(\s*created_at\s*\)/gi, 'DATE(created_at)');
    // expires_at / joined_at / etc. already handled via datetime('now') → NOW()
    converted = converted.replace(/ORDER BY RANDOM\(\)/gi, 'ORDER BY RANDOM()');
    // INSERT OR IGNORE / OR REPLACE → strip OR (central fallback; controllers ideally use ON CONFLICT)
    converted = converted.replace(/INSERT OR IGNORE INTO/gi, 'INSERT INTO');
    converted = converted.replace(/INSERT OR REPLACE INTO/gi, 'INSERT INTO');
    // Double-quoted string literals → single quotes (PG treats " as identifier)
    converted = converted.replace(/"pending"/g, "'pending'").replace(/"accepted"/g,"'accepted'").replace(/"declined"/g,"'declined'").replace(/"active"/g,"'active'").replace(/"available"/g,"'available'").replace(/"Student"/g,"'Student'").replace(/"Alumni"/g,"'Alumni'").replace(/"Faculty"/g,"'Faculty'").replace(/"Admin"/g,"'Admin'").replace(/"seen"/g,"'seen'").replace(/"ended"/g,"'ended'").replace(/"closed"/g,"'closed'").replace(/"resolved"/g,"'resolved'").replace(/"sent"/g,"'sent'").replace(/"going"/g,"'going'");
    // Scalar MAX(0, …) → GREATEST(0, …) — MAX is aggregate only in PG
    converted = converted.replace(/MAX\s*\(\s*0\s*,/gi, 'GREATEST(0,');
    // PRAGMA table_info(table) → information_schema for PG (fallback)
    converted = converted.replace(/PRAGMA\s+table_info\s*\(\s*(\w+)\s*\)/gi, "SELECT column_name as name FROM information_schema.columns WHERE table_name='$1'");
    // Generic fallback for INSERT OR IGNORE/REPLACE → ON CONFLICT DO NOTHING (prevents 42601, keeps idempotent)
    // Specific controllers should use proper ON CONFLICT (col) DO UPDATE where needed
    if ((hasOrIgnore || hasOrReplace) && !/ON CONFLICT/i.test(converted)) {
        // Insert before trailing semicolon / whitespace
        converted = converted.replace(/;?\s*$/, ' ON CONFLICT DO NOTHING');
    }
    return converted;
}

function convertSchemaToPg(sql) {
    return sql
        .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY')
        .replace(/DATETIME DEFAULT CURRENT_TIMESTAMP/gi, 'TIMESTAMPTZ DEFAULT NOW()')
        .replace(/DATETIME/gi, 'TIMESTAMPTZ');
}

async function createTables(db) {
    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fullName TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            studentId TEXT UNIQUE,
            password TEXT NOT NULL,
            role TEXT DEFAULT 'Student',
            isVerified INTEGER DEFAULT 1,
            bio TEXT,
            department TEXT,
            batch TEXT,
            gender TEXT,
            profilePicture TEXT,
            coverPicture TEXT,
            website TEXT,
            github TEXT,
            company TEXT,
            linkedin TEXT,
            country TEXT,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            content TEXT,
            mediaUrl TEXT,
            mediaType TEXT,
            visibility TEXT DEFAULT 'Public',
            mentions TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            content TEXT NOT NULL,
            mentions TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS reactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            type TEXT DEFAULT 'like',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS friend_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender_id INTEGER NOT NULL,
            receiver_id INTEGER NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS friends (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user1_id INTEGER NOT NULL,
            user2_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            recipient_id INTEGER NOT NULL,
            sender_id INTEGER,
            type TEXT NOT NULL,
            message TEXT NOT NULL,
            isRead INTEGER DEFAULT 0,
            link TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender_id INTEGER NOT NULL,
            receiver_id INTEGER NOT NULL,
            content TEXT NOT NULL,
            message_type TEXT DEFAULT 'text',
            isRead INTEGER DEFAULT 0,
            status TEXT DEFAULT 'sent',
            reply_to_id INTEGER,
            is_edited INTEGER DEFAULT 0,
            edited_at DATETIME,
            is_deleted INTEGER DEFAULT 0,
            deleted_for TEXT,
            is_forwarded INTEGER DEFAULT 0,
            file_name TEXT,
            file_size TEXT,
            file_url TEXT,
            delivered_at DATETIME,
            read_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS group_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id INTEGER NOT NULL,
            sender_id INTEGER NOT NULL,
            content TEXT,
            mediaUrl TEXT,
            message_type TEXT DEFAULT 'text',
            status TEXT DEFAULT 'sent',
            reply_to_id INTEGER,
            is_edited INTEGER DEFAULT 0,
            edited_at DATETIME,
            is_deleted INTEGER DEFAULT 0,
            deleted_for TEXT,
            is_forwarded INTEGER DEFAULT 0,
            file_name TEXT,
            file_size TEXT,
            file_url TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS stories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            type TEXT DEFAULT 'image',
            content TEXT NOT NULL,
            caption TEXT,
            media_url TEXT,
            bg_color TEXT,
            privacy TEXT DEFAULT 'public',
            audience TEXT DEFAULT 'public',
            expires_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            -- Instagram stickers & creation
            stickers TEXT,
            filter TEXT,
            music_url TEXT,
            music_title TEXT,
            location TEXT,
            -- Nexus signature fields
            campus_tag TEXT,
            course_code TEXT,
            batch TEXT,
            department TEXT,
            event_id INTEGER,
            group_id INTEGER,
            channel_id INTEGER,
            collaborative_id INTEGER,
            is_collaborative INTEGER DEFAULT 0,
            is_exclusive INTEGER DEFAULT 0,
            is_featured INTEGER DEFAULT 0,
            is_archived INTEGER DEFAULT 0,
            view_count INTEGER DEFAULT 0,
            reaction_count INTEGER DEFAULT 0,
            reply_count INTEGER DEFAULT 0,
            share_count INTEGER DEFAULT 0,
            challenge_tag TEXT,
            ai_style TEXT,
            quiz_data TEXT,
            poll_data TEXT,
            voice_url TEXT,
            translation TEXT,
            allow_replies INTEGER DEFAULT 1,
            allow_reactions INTEGER DEFAULT 1,
            allow_sharing INTEGER DEFAULT 1
        );

        -- ── Story Extended Tables (Instagram + Nexus) ───────────────────────
        CREATE TABLE IF NOT EXISTS story_views (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            story_id INTEGER NOT NULL,
            viewer_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(story_id, viewer_id)
        );
        CREATE TABLE IF NOT EXISTS story_reactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            story_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            emoji TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(story_id, user_id)
        );
        CREATE TABLE IF NOT EXISTS story_replies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            story_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            content TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS story_highlights (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            cover_url TEXT,
            story_ids TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS story_archive (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            story_id INTEGER NOT NULL UNIQUE,
            user_id INTEGER NOT NULL,
            archived_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS collaborative_stories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            creator_id INTEGER NOT NULL,
            description TEXT,
            cover_url TEXT,
            type TEXT DEFAULT 'event',
            event_id INTEGER,
            group_id INTEGER,
            is_open INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS collaborative_story_members (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            collab_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            role TEXT DEFAULT 'member',
            joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(collab_id, user_id)
        );
        CREATE TABLE IF NOT EXISTS close_friends (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            friend_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, friend_id)
        );
        CREATE TABLE IF NOT EXISTS story_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            story_id INTEGER NOT NULL,
            reporter_id INTEGER NOT NULL,
            reason TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS groups_table (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            cover_image TEXT,
            avatar_image TEXT,
            creator_id INTEGER NOT NULL,
            category TEXT DEFAULT 'general',
            group_type TEXT DEFAULT 'general',
            department TEXT,
            batch TEXT,
            course_code TEXT,
            faculty TEXT,
            rules TEXT,
            privacy TEXT DEFAULT 'Public',
            approval_required INTEGER DEFAULT 0,
            invite_link TEXT UNIQUE,
            member_count INTEGER DEFAULT 0,
            post_count INTEGER DEFAULT 0,
            is_verified INTEGER DEFAULT 0,
            is_official INTEGER DEFAULT 0,
            allow_anonymous INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS group_members (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            role TEXT DEFAULT 'member',
            status TEXT DEFAULT 'active',
            invited_by INTEGER,
            badge TEXT,
            is_muted INTEGER DEFAULT 0,
            muted_until DATETIME,
            joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(group_id, user_id)
        );
        CREATE TABLE IF NOT EXISTS group_invites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id INTEGER NOT NULL,
            code TEXT UNIQUE NOT NULL,
            created_by INTEGER NOT NULL,
            max_uses INTEGER DEFAULT 0,
            uses INTEGER DEFAULT 0,
            expires_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS group_questions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id INTEGER NOT NULL,
            question TEXT NOT NULL,
            type TEXT DEFAULT 'text',
            required INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS group_join_answers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            question_id INTEGER NOT NULL,
            answer TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS group_posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            content TEXT,
            media_url TEXT,
            media_type TEXT,
            is_anonymous INTEGER DEFAULT 0,
            feeling TEXT,
            location TEXT,
            is_pinned INTEGER DEFAULT 0,
            is_featured INTEGER DEFAULT 0,
            is_announcement INTEGER DEFAULT 0,
            is_draft INTEGER DEFAULT 0,
            is_scheduled INTEGER DEFAULT 0,
            scheduled_at DATETIME,
            topic TEXT,
            hashtags TEXT,
            mentions TEXT,
            like_count INTEGER DEFAULT 0,
            comment_count INTEGER DEFAULT 0,
            share_count INTEGER DEFAULT 0,
            view_count INTEGER DEFAULT 0,
            status TEXT DEFAULT 'published',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS group_post_reactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            type TEXT DEFAULT 'like',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(post_id, user_id)
        );
        CREATE TABLE IF NOT EXISTS group_post_comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            content TEXT NOT NULL,
            parent_id INTEGER,
            is_anonymous INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS group_post_saves (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(post_id, user_id)
        );
        CREATE TABLE IF NOT EXISTS group_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id INTEGER NOT NULL,
            creator_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            venue TEXT,
            is_online INTEGER DEFAULT 0,
            event_date DATETIME NOT NULL,
            end_date DATETIME,
            cover_image TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS group_event_rsvps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            status TEXT DEFAULT 'going',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(event_id, user_id)
        );
        CREATE TABLE IF NOT EXISTS group_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            file_name TEXT NOT NULL,
            file_url TEXT NOT NULL,
            file_type TEXT,
            category TEXT DEFAULT 'general',
            description TEXT,
            downloads INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS group_polls (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id INTEGER NOT NULL,
            post_id INTEGER,
            question TEXT NOT NULL,
            options TEXT NOT NULL,
            allow_multiple INTEGER DEFAULT 0,
            is_anonymous INTEGER DEFAULT 0,
            deadline DATETIME,
            created_by INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS group_poll_votes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            poll_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            option_index INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(poll_id, user_id, option_index)
        );
        CREATE TABLE IF NOT EXISTS group_bans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            banned_by INTEGER NOT NULL,
            reason TEXT,
            expires_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(group_id, user_id)
        );
        CREATE TABLE IF NOT EXISTS group_mutes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            muted_by INTEGER NOT NULL,
            reason TEXT,
            expires_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS group_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id INTEGER NOT NULL,
            reporter_id INTEGER NOT NULL,
            target_type TEXT NOT NULL,
            target_id INTEGER NOT NULL,
            reason TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS group_activity_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id INTEGER NOT NULL,
            user_id INTEGER,
            action TEXT NOT NULL,
            target_type TEXT,
            target_id INTEGER,
            details TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS saved_posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            post_id INTEGER NOT NULL,
            saved_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS resources (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            fileUrl TEXT NOT NULL,
            fileType TEXT,
            department TEXT,
            batch TEXT,
            subject TEXT,
            downloads INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS reels (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            videoUrl TEXT NOT NULL,
            caption TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS reel_likes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reel_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(reel_id, user_id)
        );
        CREATE TABLE IF NOT EXISTS reel_comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reel_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            content TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            creator_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            venue TEXT,
            event_date DATETIME NOT NULL,
            cover_image TEXT,
            department TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS event_rsvps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            status TEXT DEFAULT 'going',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS lost_found (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            location TEXT,
            contact TEXT,
            image_url TEXT,
            status TEXT DEFAULT 'open',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS marketplace (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            price REAL NOT NULL,
            category TEXT,
            condition TEXT,
            image_url TEXT,
            contact TEXT,
            phone TEXT,
            address TEXT,
            studentId TEXT,
            status TEXT DEFAULT 'available',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS blood_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            bloodGroup TEXT NOT NULL,
            patientName TEXT NOT NULL,
            hospital TEXT NOT NULL,
            dateNeeded TEXT NOT NULL,
            urgency TEXT DEFAULT 'critical',
            contactNum TEXT NOT NULL,
            details TEXT,
            status TEXT DEFAULT 'active',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS housing_posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            category TEXT DEFAULT 'Mess Seat',
            price TEXT NOT NULL,
            location TEXT NOT NULL,
            contact TEXT NOT NULL,
            facilities TEXT,
            description TEXT,
            image TEXT,
            status TEXT DEFAULT 'active',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS housing_reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            house_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            rating INTEGER DEFAULT 5,
            text TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS confessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content TEXT NOT NULL,
            tag TEXT,
            react_count INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS email_otps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL,
            otp TEXT NOT NULL,
            expires_at DATETIME NOT NULL,
            used INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS bus_routes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            routeName TEXT NOT NULL,
            routeNumber TEXT,
            pickupPoint TEXT NOT NULL,
            dropPoint TEXT NOT NULL,
            departureTime TEXT NOT NULL,
            returnTime TEXT NOT NULL,
            stops TEXT,
            busNumber TEXT,
            driverName TEXT,
            driverPhone TEXT,
            status TEXT DEFAULT 'On Time',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            user_email TEXT,
            user_role TEXT,
            action TEXT NOT NULL,
            target_type TEXT,
            target_id INTEGER,
            ip_address TEXT,
            user_agent TEXT,
            details TEXT,
            severity TEXT DEFAULT 'info',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS content_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reporter_id INTEGER NOT NULL,
            reporter_name TEXT,
            target_type TEXT NOT NULL,
            target_id INTEGER NOT NULL,
            reason TEXT NOT NULL,
            details TEXT,
            status TEXT DEFAULT 'pending',
            reviewed_by INTEGER,
            reviewed_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS user_warnings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            admin_id INTEGER NOT NULL,
            reason TEXT NOT NULL,
            severity TEXT DEFAULT 'warning',
            post_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS banned_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL UNIQUE,
            banned_by INTEGER NOT NULL,
            reason TEXT NOT NULL,
            expires_at DATETIME,
            is_permanent INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS posts_flagged (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id INTEGER NOT NULL UNIQUE,
            flagged_by INTEGER NOT NULL,
            reason TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- ══════════════════════════════════════════════════════
        --  BLOOD DONATION
        -- ══════════════════════════════════════════════════════
        CREATE TABLE IF NOT EXISTS blood_donations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            blood_group TEXT NOT NULL,
            name TEXT NOT NULL,
            phone TEXT NOT NULL,
            department TEXT,
            batch TEXT,
            last_donated DATETIME,
            location TEXT,
            is_available INTEGER DEFAULT 1,
            emergency_contact INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- ══════════════════════════════════════════════════════
        --  POLLS
        -- ══════════════════════════════════════════════════════
        CREATE TABLE IF NOT EXISTS polls (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            question TEXT NOT NULL,
            allow_multiple INTEGER DEFAULT 0,
            is_anonymous INTEGER DEFAULT 0,
            expires_at DATETIME,
            status TEXT DEFAULT 'active',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS poll_options (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            poll_id INTEGER NOT NULL,
            option_text TEXT NOT NULL,
            vote_count INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS poll_votes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            poll_id INTEGER NOT NULL,
            option_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(poll_id, option_id, user_id)
        );

        -- ══════════════════════════════════════════════════════
        --  RIDESHARE
        -- ══════════════════════════════════════════════════════
        CREATE TABLE IF NOT EXISTS rideshare_posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            type TEXT NOT NULL,
            from_location TEXT NOT NULL,
            to_location TEXT NOT NULL,
            ride_date TEXT NOT NULL,
            ride_time TEXT NOT NULL,
            seats INTEGER DEFAULT 1,
            fare REAL,
            vehicle_type TEXT,
            contact TEXT,
            notes TEXT,
            status TEXT DEFAULT 'open',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- ══════════════════════════════════════════════════════
        --  TUTORING
        -- ══════════════════════════════════════════════════════
        CREATE TABLE IF NOT EXISTS tutoring_posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            type TEXT NOT NULL,
            subject TEXT NOT NULL,
            description TEXT,
            department TEXT,
            batch TEXT,
            fee_per_hour REAL,
            mode TEXT DEFAULT 'online',
            contact TEXT,
            availability TEXT,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- ══════════════════════════════════════════════════════
        --  INTERNSHIPS
        -- ══════════════════════════════════════════════════════
        CREATE TABLE IF NOT EXISTS internships (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            posted_by INTEGER NOT NULL,
            company_name TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            requirements TEXT,
            location TEXT,
            type TEXT DEFAULT 'onsite',
            stipend TEXT,
            duration TEXT,
            deadline TEXT,
            apply_link TEXT,
            is_verified INTEGER DEFAULT 0,
            status TEXT DEFAULT 'open',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- ══════════════════════════════════════════════════════
        --  CLUBS
        -- ══════════════════════════════════════════════════════
        CREATE TABLE IF NOT EXISTS clubs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            description TEXT,
            category TEXT,
            logo_url TEXT,
            cover_url TEXT,
            founded_year INTEGER,
            email TEXT,
            facebook_url TEXT,
            president_id INTEGER,
            member_count INTEGER DEFAULT 0,
            is_verified INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS club_members (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            club_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            role TEXT DEFAULT 'member',
            joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(club_id, user_id)
        );

        -- ══════════════════════════════════════════════════════
        --  SHOWCASE (Student Projects)
        -- ══════════════════════════════════════════════════════
        CREATE TABLE IF NOT EXISTS showcase_projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            tech_stack TEXT,
            category TEXT,
            image_url TEXT,
            demo_url TEXT,
            github_url TEXT,
            play_store_url TEXT,
            like_count INTEGER DEFAULT 0,
            view_count INTEGER DEFAULT 0,
            is_featured INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS showcase_likes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(project_id, user_id)
        );

        -- ══════════════════════════════════════════════════════
        --  STUDY ROOMS
        -- ══════════════════════════════════════════════════════
        CREATE TABLE IF NOT EXISTS study_rooms (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_by INTEGER NOT NULL,
            name TEXT NOT NULL,
            subject TEXT,
            description TEXT,
            max_members INTEGER DEFAULT 10,
            is_private INTEGER DEFAULT 0,
            invite_code TEXT UNIQUE,
            status TEXT DEFAULT 'active',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS study_room_members (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            room_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            role TEXT DEFAULT 'member',
            joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(room_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS study_room_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            room_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            content TEXT,
            file_url TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- ══════════════════════════════════════════════════════
        --  QUESTION BANK
        -- ══════════════════════════════════════════════════════
        CREATE TABLE IF NOT EXISTS question_bank (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uploaded_by INTEGER NOT NULL,
            course_code TEXT NOT NULL,
            course_name TEXT,
            department TEXT,
            semester TEXT,
            year INTEGER,
            exam_type TEXT,
            file_url TEXT NOT NULL,
            file_name TEXT,
            download_count INTEGER DEFAULT 0,
            like_count INTEGER DEFAULT 0,
            is_verified INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS question_bank_likes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            question_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(question_id, user_id)
        );

        -- ══════════════════════════════════════════════════════
        --  LIVE STREAMS
        -- ══════════════════════════════════════════════════════
        CREATE TABLE IF NOT EXISTS live_streams (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            stream_key TEXT UNIQUE,
            thumbnail_url TEXT,
            viewer_count INTEGER DEFAULT 0,
            peak_viewers INTEGER DEFAULT 0,
            status TEXT DEFAULT 'offline',
            started_at DATETIME,
            ended_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- ══════════════════════════════════════════════════════
        --  PAGES (Official DIU Pages)
        -- ══════════════════════════════════════════════════════
        CREATE TABLE IF NOT EXISTS pages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_by INTEGER NOT NULL,
            name TEXT NOT NULL,
            username TEXT UNIQUE,
            description TEXT,
            category TEXT,
            logo_url TEXT,
            cover_url TEXT,
            website TEXT,
            email TEXT,
            follower_count INTEGER DEFAULT 0,
            is_verified INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS page_followers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            page_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            followed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(page_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS page_posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            page_id INTEGER NOT NULL,
            posted_by INTEGER NOT NULL,
            content TEXT,
            media_url TEXT,
            like_count INTEGER DEFAULT 0,
            share_count INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- ══════════════════════════════════════════════════════
        --  FOOD PORTAL
        -- ══════════════════════════════════════════════════════
        CREATE TABLE IF NOT EXISTS food_vendors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            location TEXT,
            category TEXT,
            description TEXT,
            opening_time TEXT,
            closing_time TEXT,
            image_url TEXT,
            rating REAL DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS food_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            vendor_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            price REAL NOT NULL,
            category TEXT,
            image_url TEXT,
            is_available INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS food_reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            vendor_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            rating INTEGER NOT NULL,
            review_text TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(vendor_id, user_id)
        );

        -- ══════════════════════════════════════════════════════
        --  💬 MESSENGER A-Z EXTENSIONS (Facebook Messenger Level)
        -- ══════════════════════════════════════════════════════
        CREATE TABLE IF NOT EXISTS message_reactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id INTEGER NOT NULL,
            is_group INTEGER DEFAULT 0,
            user_id INTEGER NOT NULL,
            emoji TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(message_id, is_group, user_id, emoji)
        );

        CREATE TABLE IF NOT EXISTS pinned_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id INTEGER NOT NULL,
            is_group INTEGER DEFAULT 0,
            conversation_id TEXT NOT NULL,
            pinned_by INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(message_id, is_group)
        );

        CREATE TABLE IF NOT EXISTS archived_chats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            peer_id TEXT NOT NULL,
            peer_type TEXT DEFAULT 'user',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, peer_id, peer_type)
        );

        CREATE TABLE IF NOT EXISTS muted_chats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            peer_id TEXT NOT NULL,
            peer_type TEXT DEFAULT 'user',
            muted_until DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, peer_id, peer_type)
        );

        CREATE TABLE IF NOT EXISTS blocked_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            blocker_id INTEGER NOT NULL,
            blocked_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(blocker_id, blocked_id)
        );

        CREATE TABLE IF NOT EXISTS message_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender_id INTEGER NOT NULL,
            receiver_id INTEGER NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(sender_id, receiver_id)
        );

        CREATE TABLE IF NOT EXISTS typing_indicators (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            peer_id TEXT NOT NULL,
            is_typing INTEGER DEFAULT 1,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- ══════════════════════════════════════════════════════
        --  DB PERFORMANCE INDEXES
        -- ══════════════════════════════════════════════════════
        CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id);
        CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at);
        
        CREATE TABLE IF NOT EXISTS group_topics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            created_by INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS channels (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            cover_image TEXT,
            creator_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS channel_members (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            channel_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            role TEXT DEFAULT 'follower',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS channel_posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            channel_id INTEGER NOT NULL,
            admin_id INTEGER NOT NULL,
            content TEXT,
            mediaUrl TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS cloud_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            file_name TEXT NOT NULL,
            file_url TEXT NOT NULL,
            file_size TEXT,
            file_type TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            subscriber_id INTEGER NOT NULL,
            creator_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS study_rooms (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            department TEXT NOT NULL,
            course_code TEXT NOT NULL,
            name TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE INDEX IF NOT EXISTS idx_messages_users ON messages(sender_id, receiver_id);
        CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_id, isRead);
        CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_blood_group ON blood_donations(blood_group, is_available);
        CREATE INDEX IF NOT EXISTS idx_rideshare_date ON rideshare_posts(ride_date, status);
        CREATE INDEX IF NOT EXISTS idx_showcase_feat ON showcase_projects(is_featured, created_at);
        CREATE INDEX IF NOT EXISTS idx_qbank_course ON question_bank(course_code, department);
        CREATE INDEX IF NOT EXISTS idx_polls_status ON polls(status, created_at);
    `);

    // ─── FAST MIGRATIONS (1sec) — only add missing columns via PRAGMA check ─────────
    async function addColIfMissing(table, colDef){
        const colName = colDef.split(' ')[0];
        try{
            let info;
            if (db.isPostgres) {
                // Postgres: use information_schema
                info = await db.all(`SELECT column_name as name FROM information_schema.columns WHERE table_name=$1`, [table]);
            } else {
                info = await db.all(`PRAGMA table_info(${table})`);
            }
            if(!info.some(c=>c.name===colName)){
                if (db.isPostgres) {
                    await db.exec(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${colDef}`);
                } else {
                    await db.exec(`ALTER TABLE ${table} ADD COLUMN ${colDef}`);
                }
            }
        }catch(e){
            // Fallback: try adding with IF NOT EXISTS for Postgres directly
            try { if (db.isPostgres) await db.exec(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${colDef}`); } catch {}
        }
    }
    const msgCols = [
        "message_type TEXT DEFAULT 'text'", "status TEXT DEFAULT 'sent'", "reply_to_id INTEGER",
        "is_edited INTEGER DEFAULT 0", "edited_at DATETIME", "is_deleted INTEGER DEFAULT 0",
        "deleted_for TEXT", "is_forwarded INTEGER DEFAULT 0", "file_name TEXT", "file_size TEXT",
        "file_url TEXT", "delivered_at DATETIME", "read_at DATETIME", "updated_at DATETIME", "is_pinned INTEGER DEFAULT 0"
    ];
    for(const c of msgCols) await addColIfMissing('messages', c);
    const gmsgCols = [
        "message_type TEXT DEFAULT 'text'", "status TEXT DEFAULT 'sent'", "reply_to_id INTEGER",
        "is_edited INTEGER DEFAULT 0", "edited_at DATETIME", "is_deleted INTEGER DEFAULT 0",
        "deleted_for TEXT", "is_forwarded INTEGER DEFAULT 0", "file_name TEXT", "file_size TEXT",
        "file_url TEXT", "updated_at DATETIME", "is_pinned INTEGER DEFAULT 0"
    ];
    for(const c of gmsgCols) await addColIfMissing('group_messages', c);
    for(const c of ["last_seen DATETIME","is_online INTEGER DEFAULT 0","show_online INTEGER DEFAULT 1","show_read_receipt INTEGER DEFAULT 1"]) await addColIfMissing('users', c);
    // ─── STORY A-Z MIGRATIONS ───────────────────────────────────────────────
    const storyCols = [
        "caption TEXT", "media_url TEXT", "audience TEXT DEFAULT 'public'", "updated_at DATETIME",
        "stickers TEXT", "filter TEXT", "music_url TEXT", "music_title TEXT", "location TEXT",
        "campus_tag TEXT", "course_code TEXT", "batch TEXT", "department TEXT",
        "event_id INTEGER", "group_id INTEGER", "channel_id INTEGER", "collaborative_id INTEGER",
        "is_collaborative INTEGER DEFAULT 0", "is_exclusive INTEGER DEFAULT 0", "is_featured INTEGER DEFAULT 0",
        "is_archived INTEGER DEFAULT 0", "view_count INTEGER DEFAULT 0", "reaction_count INTEGER DEFAULT 0",
        "reply_count INTEGER DEFAULT 0", "share_count INTEGER DEFAULT 0", "challenge_tag TEXT", "ai_style TEXT",
        "quiz_data TEXT", "poll_data TEXT", "voice_url TEXT", "translation TEXT",
        "allow_replies INTEGER DEFAULT 1", "allow_reactions INTEGER DEFAULT 1", "allow_sharing INTEGER DEFAULT 1"
    ];
    for (const col of storyCols) await addColIfMissing('stories', col);
    try { await db.exec(`ALTER TABLE stories ADD COLUMN expires_at DATETIME`); } catch(e) {}
    // Migrate highlights table (old schema had cover_image, no story_ids/updated_at)
    try { await db.exec(`ALTER TABLE story_highlights ADD COLUMN cover_url TEXT`); } catch(e) {}
    try { await db.exec(`ALTER TABLE story_highlights ADD COLUMN story_ids TEXT`); } catch(e) {}
    try { await db.exec(`ALTER TABLE story_highlights ADD COLUMN updated_at DATETIME`); } catch(e) {}
    // Ensure cover_image fallback if cover_url missing
    try { await db.exec(`ALTER TABLE story_highlights ADD COLUMN cover_image TEXT`); } catch(e) {}
    // Create story indexes
    try { await db.exec(`CREATE INDEX IF NOT EXISTS idx_stories_user ON stories(user_id)`); } catch(e) {}
    try { await db.exec(`CREATE INDEX IF NOT EXISTS idx_stories_expires ON stories(expires_at)`); } catch(e) {}
    try { await db.exec(`CREATE INDEX IF NOT EXISTS idx_stories_campus ON stories(campus_tag)`); } catch(e) {}
    try { await db.exec(`CREATE INDEX IF NOT EXISTS idx_stories_course ON stories(course_code)`); } catch(e) {}
    try { await db.exec(`CREATE INDEX IF NOT EXISTS idx_stories_event ON stories(event_id)`); } catch(e) {}
    try { await db.exec(`CREATE INDEX IF NOT EXISTS idx_stories_group ON stories(group_id)`); } catch(e) {}
    try { await db.exec(`CREATE INDEX IF NOT EXISTS idx_stories_featured ON stories(is_featured)`); } catch(e) {}
    try { await db.exec(`CREATE INDEX IF NOT EXISTS idx_story_views_story ON story_views(story_id)`); } catch(e) {}
    try { await db.exec(`CREATE INDEX IF NOT EXISTS idx_story_reactions_story ON story_reactions(story_id)`); } catch(e) {}
    // ─── GROUP A-Z MIGRATIONS ───────────────────────────────────────────────
    const groupCols = [
        "avatar_image TEXT", "category TEXT DEFAULT 'general'", "group_type TEXT DEFAULT 'general'",
        "department TEXT", "batch TEXT", "course_code TEXT", "faculty TEXT", "rules TEXT",
        "approval_required INTEGER DEFAULT 0", "invite_link TEXT", "member_count INTEGER DEFAULT 0",
        "post_count INTEGER DEFAULT 0", "is_verified INTEGER DEFAULT 0", "is_official INTEGER DEFAULT 0",
        "allow_anonymous INTEGER DEFAULT 0", "updated_at DATETIME"
    ];
    for(const col of groupCols) await addColIfMissing('groups_table', col);
    const memberCols = ["status TEXT DEFAULT 'active'", "invited_by INTEGER", "badge TEXT", "is_muted INTEGER DEFAULT 0", "muted_until DATETIME"];
    for(const col of memberCols) await addColIfMissing('group_members', col);
    try { await db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_group_members_unique ON group_members(group_id, user_id)`); } catch(e){}
    try { await db.exec(`CREATE INDEX IF NOT EXISTS idx_group_posts_group ON group_posts(group_id)`); } catch(e){}
    try { await db.exec(`CREATE INDEX IF NOT EXISTS idx_group_posts_pinned ON group_posts(is_pinned)`); } catch(e){}
    try { await db.exec(`CREATE INDEX IF NOT EXISTS idx_group_files_group ON group_files(group_id)`); } catch(e){}
    try { await db.exec(`CREATE INDEX IF NOT EXISTS idx_group_events_group ON group_events(group_id)`); } catch(e){}
    // ─── USER STUDENTID MIGRATION ───────────────────────────────────────
    try { await db.exec(`ALTER TABLE users ADD COLUMN studentId TEXT`); } catch(e){}
    try { await db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_studentId ON users(studentId)`); } catch(e){}
    try { await db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)`); } catch(e){}
    // Create messenger indexes after migrations (safe now)
    try { await db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status)`); } catch(e) {}
    try { await db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_reply ON messages(reply_to_id)`); } catch(e) {}
    try { await db.exec(`CREATE INDEX IF NOT EXISTS idx_msg_reactions ON message_reactions(message_id, is_group)`); } catch(e) {}
    try { await db.exec(`CREATE INDEX IF NOT EXISTS idx_pinned_conv ON pinned_messages(conversation_id)`); } catch(e) {}
    try { await db.exec(`CREATE INDEX IF NOT EXISTS idx_archived_user ON archived_chats(user_id)`); } catch(e) {}
    try { await db.exec(`CREATE INDEX IF NOT EXISTS idx_muted_user ON muted_chats(user_id)`); } catch(e) {}
    try { await db.exec(`CREATE INDEX IF NOT EXISTS idx_blocked ON blocked_users(blocker_id, blocked_id)`); } catch(e) {}
    try { await db.exec(`CREATE INDEX IF NOT EXISTS idx_msg_requests ON message_requests(sender_id, receiver_id)`); } catch(e) {}
    try { await db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_delivered ON messages(delivered_at)`); } catch(e) {}
    // ─── MARKETPLACE & BLOOD GLOBAL MIGRATIONS ──────────────────────────────
    try { await db.exec(`ALTER TABLE marketplace ADD COLUMN phone TEXT`); } catch(e) {}
    try { await db.exec(`ALTER TABLE marketplace ADD COLUMN address TEXT`); } catch(e) {}
    try { await db.exec(`ALTER TABLE marketplace ADD COLUMN studentId TEXT`); } catch(e) {}
    try { await db.exec(`CREATE INDEX IF NOT EXISTS idx_marketplace_user ON marketplace(user_id)`); } catch(e) {}
    try { await db.exec(`CREATE INDEX IF NOT EXISTS idx_blood_requests_group ON blood_requests(bloodGroup)`); } catch(e) {}
    try { await db.exec(`CREATE INDEX IF NOT EXISTS idx_blood_requests_user ON blood_requests(user_id)`); } catch(e) {}
    // ─── POST/COMMENT MENTIONS (Tag friends) ───────────────────────────────
    try { await db.exec(`ALTER TABLE posts ADD COLUMN mentions TEXT`); } catch(e) {}
    try { await db.exec(`ALTER TABLE comments ADD COLUMN mentions TEXT`); } catch(e) {}
    try { await db.exec(`ALTER TABLE group_posts ADD COLUMN mentions TEXT`); } catch(e) {}
    try { await db.exec(`ALTER TABLE group_post_comments ADD COLUMN mentions TEXT`); } catch(e) {}
    // ─── FOOD REVIEWS UPVOTE/DOWNVOTE ─────────────────────────────────
    try { await db.exec(`ALTER TABLE food_reviews ADD COLUMN upvotes INTEGER DEFAULT 0`); } catch(e) {}
    try { await db.exec(`ALTER TABLE food_reviews ADD COLUMN downvotes INTEGER DEFAULT 0`); } catch(e) {}
    try { await db.exec(`CREATE TABLE IF NOT EXISTS food_review_votes (id INTEGER PRIMARY KEY AUTOINCREMENT, review_id INTEGER NOT NULL, vendor_id INTEGER NOT NULL, user_id INTEGER NOT NULL, vote_type TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(review_id, user_id))`); } catch(e) {}
}

module.exports = { initDatabase };

