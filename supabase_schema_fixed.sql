-- DIU Nexus - Supabase (PostgreSQL) Schema
-- Generated from server/config/db.js + live database.sqlite
-- Paste into Supabase SQL Editor and Run

BEGIN;

CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                fullName TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                role TEXT DEFAULT 'Student',
                isVerified INTEGER DEFAULT 1,
                bio TEXT,
                department TEXT,
                batch TEXT,
                gender TEXT,
                profilePicture TEXT,
                coverPicture TEXT,
                createdAt TIMESTAMPTZ DEFAULT NOW()
            , graduationYear TEXT, jobTitle TEXT, company TEXT, linkedin TEXT, country TEXT, last_seen TIMESTAMPTZ, is_online INTEGER DEFAULT 0, show_online INTEGER DEFAULT 1, show_read_receipt INTEGER DEFAULT 1, studentId TEXT);

CREATE TABLE IF NOT EXISTS posts (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                content TEXT,
                mediaUrl TEXT,
                mediaType TEXT,
                visibility TEXT DEFAULT 'Public',
                created_at TIMESTAMPTZ DEFAULT NOW(), is_exclusive INTEGER DEFAULT 0, mentions TEXT
            );

CREATE TABLE IF NOT EXISTS events (
                id SERIAL PRIMARY KEY,
                creator_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                description TEXT,
                venue TEXT,
                event_date TIMESTAMPTZ NOT NULL,
                cover_image TEXT,
                department TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );

CREATE TABLE IF NOT EXISTS reels (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                videoUrl TEXT NOT NULL,
                caption TEXT,
                views INTEGER DEFAULT 0,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );

CREATE TABLE IF NOT EXISTS channels (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            cover_image TEXT,
            creator_id INTEGER NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

CREATE TABLE IF NOT EXISTS clubs (
            id SERIAL PRIMARY KEY,
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
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

CREATE TABLE IF NOT EXISTS groups_table (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                cover_image TEXT,
                creator_id INTEGER NOT NULL,
                privacy TEXT DEFAULT 'Public',
                created_at TIMESTAMPTZ DEFAULT NOW(), avatar_image TEXT, category TEXT DEFAULT 'general', group_type TEXT DEFAULT 'general', department TEXT, batch TEXT, course_code TEXT, faculty TEXT, rules TEXT, approval_required INTEGER DEFAULT 0, invite_link TEXT, member_count INTEGER DEFAULT 0, post_count INTEGER DEFAULT 0, is_verified INTEGER DEFAULT 0, is_official INTEGER DEFAULT 0, allow_anonymous INTEGER DEFAULT 0, updated_at TIMESTAMPTZ
            );

CREATE TABLE IF NOT EXISTS stories (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            type TEXT DEFAULT 'image',
            content TEXT NOT NULL,
            bg_color TEXT,
            privacy TEXT DEFAULT 'public',
            expires_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW()
        , caption TEXT, media_url TEXT, audience TEXT DEFAULT 'public', updated_at TIMESTAMPTZ, stickers TEXT, filter TEXT, music_url TEXT, music_title TEXT, location TEXT, campus_tag TEXT, course_code TEXT, batch TEXT, department TEXT, event_id INTEGER, group_id INTEGER, channel_id INTEGER, collaborative_id INTEGER, is_collaborative INTEGER DEFAULT 0, is_exclusive INTEGER DEFAULT 0, is_featured INTEGER DEFAULT 0, is_archived INTEGER DEFAULT 0, view_count INTEGER DEFAULT 0, reaction_count INTEGER DEFAULT 0, reply_count INTEGER DEFAULT 0, share_count INTEGER DEFAULT 0, challenge_tag TEXT, ai_style TEXT, quiz_data TEXT, poll_data TEXT, voice_url TEXT, translation TEXT, allow_replies INTEGER DEFAULT 1, allow_reactions INTEGER DEFAULT 1, allow_sharing INTEGER DEFAULT 1);

CREATE TABLE IF NOT EXISTS resources (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                description TEXT,
                fileUrl TEXT NOT NULL,
                fileType TEXT,
                department TEXT,
                batch TEXT,
                subject TEXT,
                downloads INTEGER DEFAULT 0,
                created_at TIMESTAMPTZ DEFAULT NOW(), like_count INTEGER DEFAULT 0
            );

CREATE TABLE IF NOT EXISTS pages (
            id SERIAL PRIMARY KEY,
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
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

CREATE TABLE IF NOT EXISTS polls (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            question TEXT NOT NULL,
            allow_multiple INTEGER DEFAULT 0,
            is_anonymous INTEGER DEFAULT 0,
            expires_at TIMESTAMPTZ,
            status TEXT DEFAULT 'active',
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

CREATE TABLE IF NOT EXISTS marketplace (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                description TEXT,
                price REAL,
                category TEXT DEFAULT 'Other',
                imageUrl TEXT,
                status TEXT DEFAULT 'available',
                created_at TIMESTAMPTZ DEFAULT NOW(), phone TEXT, address TEXT, studentId TEXT
            );

CREATE TABLE IF NOT EXISTS lost_found (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                type TEXT DEFAULT 'lost',
                title TEXT NOT NULL,
                description TEXT,
                location TEXT,
                contact TEXT,
                imageUrl TEXT,
                status TEXT DEFAULT 'open',
                created_at TIMESTAMPTZ DEFAULT NOW()
            );

CREATE TABLE IF NOT EXISTS housing_posts (
            id SERIAL PRIMARY KEY,
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
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

CREATE TABLE IF NOT EXISTS food_vendors (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            location TEXT,
            category TEXT,
            description TEXT,
            opening_time TEXT,
            closing_time TEXT,
            image_url TEXT,
            rating REAL DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            created_at TIMESTAMPTZ DEFAULT NOW()
        , user_id INTEGER, created_by INTEGER);

CREATE TABLE IF NOT EXISTS question_bank (
            id SERIAL PRIMARY KEY,
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
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

CREATE TABLE IF NOT EXISTS showcase_projects (
            id SERIAL PRIMARY KEY,
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
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

CREATE TABLE IF NOT EXISTS study_rooms (
            id SERIAL PRIMARY KEY,
            created_by INTEGER NOT NULL,
            name TEXT NOT NULL,
            subject TEXT,
            description TEXT,
            max_members INTEGER DEFAULT 10,
            is_private INTEGER DEFAULT 0,
            invite_code TEXT UNIQUE,
            status TEXT DEFAULT 'active',
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

CREATE TABLE IF NOT EXISTS archived_chats (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            peer_id TEXT NOT NULL,
            peer_type TEXT DEFAULT 'user',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(user_id, peer_id, peer_type)
        );

CREATE TABLE IF NOT EXISTS audit_logs (
            id SERIAL PRIMARY KEY,
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
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

CREATE TABLE IF NOT EXISTS banned_users (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL UNIQUE,
            banned_by INTEGER NOT NULL,
            reason TEXT NOT NULL,
            expires_at TIMESTAMPTZ,
            is_permanent INTEGER DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

CREATE TABLE IF NOT EXISTS blocked_users (
            id SERIAL PRIMARY KEY,
            blocker_id INTEGER NOT NULL,
            blocked_id INTEGER NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(blocker_id, blocked_id)
        );

CREATE TABLE IF NOT EXISTS blood_donations (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            blood_group TEXT NOT NULL,
            name TEXT NOT NULL,
            phone TEXT NOT NULL,
            department TEXT,
            batch TEXT,
            last_donated TIMESTAMPTZ,
            location TEXT,
            is_available INTEGER DEFAULT 1,
            emergency_contact INTEGER DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );

CREATE TABLE IF NOT EXISTS blood_requests (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            bloodGroup TEXT NOT NULL,
            patientName TEXT NOT NULL,
            hospital TEXT NOT NULL,
            dateNeeded TEXT NOT NULL,
            urgency TEXT DEFAULT 'critical',
            contactNum TEXT NOT NULL,
            details TEXT,
            status TEXT DEFAULT 'active',
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

CREATE TABLE IF NOT EXISTS bus_routes (
                id SERIAL PRIMARY KEY,
                route TEXT NOT NULL,
                busNumber TEXT,
                departureTime TEXT NOT NULL,
                arrivalTime TEXT,
                days TEXT DEFAULT 'Sun-Thu',
                stops TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW()
            , routeName TEXT, pickupPoint TEXT, dropPoint TEXT, returnTime TEXT, driverName TEXT, driverPhone TEXT, status TEXT DEFAULT 'On Time', routeNumber TEXT);

CREATE TABLE IF NOT EXISTS bus_settings (id INTEGER PRIMARY KEY, last_update TEXT);

CREATE TABLE IF NOT EXISTS channel_members (
            id SERIAL PRIMARY KEY,
            channel_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            role TEXT DEFAULT 'follower',
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

CREATE TABLE IF NOT EXISTS channel_posts (
            id SERIAL PRIMARY KEY,
            channel_id INTEGER NOT NULL,
            admin_id INTEGER NOT NULL,
            content TEXT,
            mediaUrl TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

CREATE TABLE IF NOT EXISTS close_friends (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            friend_id INTEGER NOT NULL,
            UNIQUE(user_id, friend_id)
        );

CREATE TABLE IF NOT EXISTS cloud_files (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            file_name TEXT NOT NULL,
            file_url TEXT NOT NULL,
            file_size TEXT,
            file_type TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

CREATE TABLE IF NOT EXISTS club_members (
            id SERIAL PRIMARY KEY,
            club_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            role TEXT DEFAULT 'member',
            joined_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(club_id, user_id)
        );

CREATE TABLE IF NOT EXISTS collaborative_stories (
            id SERIAL PRIMARY KEY,
            title TEXT NOT NULL,
            creator_id INTEGER NOT NULL,
            description TEXT,
            cover_url TEXT,
            type TEXT DEFAULT 'event',
            event_id INTEGER,
            group_id INTEGER,
            is_open INTEGER DEFAULT 1,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

CREATE TABLE IF NOT EXISTS collaborative_story_members (
            id SERIAL PRIMARY KEY,
            collab_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            role TEXT DEFAULT 'member',
            joined_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(collab_id, user_id)
        );

CREATE TABLE IF NOT EXISTS comments (
                id SERIAL PRIMARY KEY,
                post_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                content TEXT NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW(), mentions TEXT
            );

CREATE TABLE IF NOT EXISTS confessions (
                id SERIAL PRIMARY KEY,
                content TEXT NOT NULL,
                likes INTEGER DEFAULT 0,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );

CREATE TABLE IF NOT EXISTS content_reports (
            id SERIAL PRIMARY KEY,
            reporter_id INTEGER NOT NULL,
            reporter_name TEXT,
            target_type TEXT NOT NULL,
            target_id INTEGER NOT NULL,
            reason TEXT NOT NULL,
            details TEXT,
            status TEXT DEFAULT 'pending',
            reviewed_by INTEGER,
            reviewed_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

CREATE TABLE IF NOT EXISTS email_otps (
                id SERIAL PRIMARY KEY,
                email TEXT NOT NULL,
                otp TEXT NOT NULL,
                expires_at TIMESTAMPTZ NOT NULL,
                used INTEGER DEFAULT 0,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );

CREATE TABLE IF NOT EXISTS event_rsvps (
                id SERIAL PRIMARY KEY,
                event_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                status TEXT DEFAULT 'going',
                UNIQUE(event_id, user_id)
            );

CREATE TABLE IF NOT EXISTS food_items (
            id SERIAL PRIMARY KEY,
            vendor_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            price REAL NOT NULL,
            category TEXT,
            image_url TEXT,
            is_available INTEGER DEFAULT 1,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

CREATE TABLE IF NOT EXISTS food_review_votes (id SERIAL PRIMARY KEY, review_id INTEGER NOT NULL, vendor_id INTEGER NOT NULL, user_id INTEGER NOT NULL, vote_type TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(review_id, user_id));

CREATE TABLE IF NOT EXISTS food_reviews (
            id SERIAL PRIMARY KEY,
            vendor_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            rating INTEGER NOT NULL,
            review_text TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(), upvotes INTEGER DEFAULT 0, downvotes INTEGER DEFAULT 0,
            UNIQUE(vendor_id, user_id)
        );

CREATE TABLE IF NOT EXISTS friend_requests (
                id SERIAL PRIMARY KEY,
                sender_id INTEGER NOT NULL,
                receiver_id INTEGER NOT NULL,
                status TEXT DEFAULT 'pending',
                created_at TIMESTAMPTZ DEFAULT NOW()
            );

CREATE TABLE IF NOT EXISTS friends (
                id SERIAL PRIMARY KEY,
                user1_id INTEGER NOT NULL,
                user2_id INTEGER NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );

CREATE TABLE IF NOT EXISTS group_activity_log (
            id SERIAL PRIMARY KEY,
            group_id INTEGER NOT NULL,
            user_id INTEGER,
            action TEXT NOT NULL,
            target_type TEXT,
            target_id INTEGER,
            details TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

CREATE TABLE IF NOT EXISTS group_bans (
            id SERIAL PRIMARY KEY,
            group_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            banned_by INTEGER NOT NULL,
            reason TEXT,
            expires_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(group_id, user_id)
        );

CREATE TABLE IF NOT EXISTS group_event_rsvps (
            id SERIAL PRIMARY KEY,
            event_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            status TEXT DEFAULT 'going',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(event_id, user_id)
        );

CREATE TABLE IF NOT EXISTS group_events (
            id SERIAL PRIMARY KEY,
            group_id INTEGER NOT NULL,
            creator_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            venue TEXT,
            is_online INTEGER DEFAULT 0,
            event_date TIMESTAMPTZ NOT NULL,
            end_date TIMESTAMPTZ,
            cover_image TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

CREATE TABLE IF NOT EXISTS group_files (
            id SERIAL PRIMARY KEY,
            group_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            file_name TEXT NOT NULL,
            file_url TEXT NOT NULL,
            file_type TEXT,
            category TEXT DEFAULT 'general',
            description TEXT,
            downloads INTEGER DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

CREATE TABLE IF NOT EXISTS group_invites (
            id SERIAL PRIMARY KEY,
            group_id INTEGER NOT NULL,
            code TEXT UNIQUE NOT NULL,
            created_by INTEGER NOT NULL,
            max_uses INTEGER DEFAULT 0,
            uses INTEGER DEFAULT 0,
            expires_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

CREATE TABLE IF NOT EXISTS group_join_answers (
            id SERIAL PRIMARY KEY,
            group_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            question_id INTEGER NOT NULL,
            answer TEXT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

CREATE TABLE IF NOT EXISTS group_members (
                id SERIAL PRIMARY KEY,
                group_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                role TEXT DEFAULT 'member',
                joined_at TIMESTAMPTZ DEFAULT NOW(), status TEXT DEFAULT 'active', invited_by INTEGER, badge TEXT, is_muted INTEGER DEFAULT 0, muted_until TIMESTAMPTZ
            );

CREATE TABLE IF NOT EXISTS group_messages (
            id SERIAL PRIMARY KEY,
            group_id INTEGER NOT NULL,
            sender_id INTEGER NOT NULL,
            content TEXT,
            mediaUrl TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(), topic_id INTEGER, message_type TEXT DEFAULT 'text', status TEXT DEFAULT 'sent', reply_to_id INTEGER, is_edited INTEGER DEFAULT 0, edited_at TIMESTAMPTZ, is_deleted INTEGER DEFAULT 0, deleted_for TEXT, is_forwarded INTEGER DEFAULT 0, file_name TEXT, file_size TEXT, file_url TEXT, updated_at TIMESTAMPTZ DEFAULT NOW(), is_pinned INTEGER DEFAULT 0
        );

CREATE TABLE IF NOT EXISTS group_mutes (
            id SERIAL PRIMARY KEY,
            group_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            muted_by INTEGER NOT NULL,
            reason TEXT,
            expires_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

CREATE TABLE IF NOT EXISTS group_poll_votes (
            id SERIAL PRIMARY KEY,
            poll_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            option_index INTEGER NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(poll_id, user_id, option_index)
        );

CREATE TABLE IF NOT EXISTS group_polls (
            id SERIAL PRIMARY KEY,
            group_id INTEGER NOT NULL,
            post_id INTEGER,
            question TEXT NOT NULL,
            options TEXT NOT NULL,
            allow_multiple INTEGER DEFAULT 0,
            is_anonymous INTEGER DEFAULT 0,
            deadline TIMESTAMPTZ,
            created_by INTEGER NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

CREATE TABLE IF NOT EXISTS group_post_comments (
            id SERIAL PRIMARY KEY,
            post_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            content TEXT NOT NULL,
            parent_id INTEGER,
            is_anonymous INTEGER DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW()
        , mentions TEXT);

CREATE TABLE IF NOT EXISTS group_post_reactions (
            id SERIAL PRIMARY KEY,
            post_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            type TEXT DEFAULT 'like',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(post_id, user_id)
        );

CREATE TABLE IF NOT EXISTS group_post_saves (
            id SERIAL PRIMARY KEY,
            post_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(post_id, user_id)
        );

CREATE TABLE IF NOT EXISTS group_posts (
            id SERIAL PRIMARY KEY,
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
            scheduled_at TIMESTAMPTZ,
            topic TEXT,
            hashtags TEXT,
            mentions TEXT,
            like_count INTEGER DEFAULT 0,
            comment_count INTEGER DEFAULT 0,
            share_count INTEGER DEFAULT 0,
            view_count INTEGER DEFAULT 0,
            status TEXT DEFAULT 'published',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );

CREATE TABLE IF NOT EXISTS group_questions (
            id SERIAL PRIMARY KEY,
            group_id INTEGER NOT NULL,
            question TEXT NOT NULL,
            type TEXT DEFAULT 'text',
            required INTEGER DEFAULT 1,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

CREATE TABLE IF NOT EXISTS group_reports (
            id SERIAL PRIMARY KEY,
            group_id INTEGER NOT NULL,
            reporter_id INTEGER NOT NULL,
            target_type TEXT NOT NULL,
            target_id INTEGER NOT NULL,
            reason TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

CREATE TABLE IF NOT EXISTS group_topics (
            id SERIAL PRIMARY KEY,
            group_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            created_by INTEGER NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

CREATE TABLE IF NOT EXISTS housing_reviews (
            id SERIAL PRIMARY KEY,
            house_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            rating INTEGER DEFAULT 5,
            text TEXT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

CREATE TABLE IF NOT EXISTS internships (
            id SERIAL PRIMARY KEY,
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
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

CREATE TABLE IF NOT EXISTS live_streams (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            stream_key TEXT UNIQUE,
            thumbnail_url TEXT,
            viewer_count INTEGER DEFAULT 0,
            peak_viewers INTEGER DEFAULT 0,
            status TEXT DEFAULT 'offline',
            started_at TIMESTAMPTZ,
            ended_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

CREATE TABLE IF NOT EXISTS message_reactions (
            id SERIAL PRIMARY KEY,
            message_id INTEGER NOT NULL,
            is_group INTEGER DEFAULT 0,
            user_id INTEGER NOT NULL,
            emoji TEXT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(message_id, is_group, user_id, emoji)
        );

CREATE TABLE IF NOT EXISTS message_requests (
            id SERIAL PRIMARY KEY,
            sender_id INTEGER NOT NULL,
            receiver_id INTEGER NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(sender_id, receiver_id)
        );

CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                sender_id INTEGER NOT NULL,
                receiver_id INTEGER NOT NULL,
                content TEXT,
                mediaUrl TEXT,
                isRead INTEGER DEFAULT 0,
                created_at TIMESTAMPTZ DEFAULT NOW(), message_type TEXT DEFAULT 'text', status TEXT DEFAULT 'sent', reply_to_id INTEGER, is_edited INTEGER DEFAULT 0, edited_at TIMESTAMPTZ, is_deleted INTEGER DEFAULT 0, deleted_for TEXT, is_forwarded INTEGER DEFAULT 0, file_name TEXT, file_size TEXT, file_url TEXT, delivered_at TIMESTAMPTZ, read_at TIMESTAMPTZ, is_pinned INTEGER DEFAULT 0, updated_at TIMESTAMPTZ
            );

CREATE TABLE IF NOT EXISTS muted_chats (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            peer_id TEXT NOT NULL,
            peer_type TEXT DEFAULT 'user',
            muted_until TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(user_id, peer_id, peer_type)
        );

CREATE TABLE IF NOT EXISTS notifications (
                id SERIAL PRIMARY KEY,
                recipient_id INTEGER NOT NULL,
                sender_id INTEGER,
                type TEXT NOT NULL,
                message TEXT NOT NULL,
                isRead INTEGER DEFAULT 0,
                link TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );

CREATE TABLE IF NOT EXISTS page_followers (
            id SERIAL PRIMARY KEY,
            page_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            followed_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(page_id, user_id)
        );

CREATE TABLE IF NOT EXISTS page_posts (
            id SERIAL PRIMARY KEY,
            page_id INTEGER NOT NULL,
            posted_by INTEGER NOT NULL,
            content TEXT,
            media_url TEXT,
            like_count INTEGER DEFAULT 0,
            share_count INTEGER DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

CREATE TABLE IF NOT EXISTS pinned_messages (
            id SERIAL PRIMARY KEY,
            message_id INTEGER NOT NULL,
            is_group INTEGER DEFAULT 0,
            conversation_id TEXT NOT NULL,
            pinned_by INTEGER NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(message_id, is_group)
        );

CREATE TABLE IF NOT EXISTS poll_options (
            id SERIAL PRIMARY KEY,
            poll_id INTEGER NOT NULL,
            option_text TEXT NOT NULL,
            vote_count INTEGER DEFAULT 0
        );

CREATE TABLE IF NOT EXISTS poll_votes (
            id SERIAL PRIMARY KEY,
            poll_id INTEGER NOT NULL,
            option_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(poll_id, option_id, user_id)
        );

CREATE TABLE IF NOT EXISTS posts_flagged (
            id SERIAL PRIMARY KEY,
            post_id INTEGER NOT NULL UNIQUE,
            flagged_by INTEGER NOT NULL,
            reason TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

CREATE TABLE IF NOT EXISTS question_bank_likes (
            id SERIAL PRIMARY KEY,
            question_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(question_id, user_id)
        );

CREATE TABLE IF NOT EXISTS reactions (
                id SERIAL PRIMARY KEY,
                post_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                type TEXT DEFAULT 'like',
                created_at TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE(post_id, user_id)
            );

CREATE TABLE IF NOT EXISTS reel_comments (
                id SERIAL PRIMARY KEY,
                reel_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                content TEXT NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );

CREATE TABLE IF NOT EXISTS reel_likes (
                id SERIAL PRIMARY KEY,
                reel_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE(reel_id, user_id)
            );

CREATE TABLE IF NOT EXISTS resource_likes (id SERIAL PRIMARY KEY, resource_id INTEGER NOT NULL, user_id INTEGER NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(resource_id, user_id));

CREATE TABLE IF NOT EXISTS rideshare_posts (
            id SERIAL PRIMARY KEY,
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
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

CREATE TABLE IF NOT EXISTS saved_posts (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                post_id INTEGER NOT NULL,
                saved_at TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE(user_id, post_id)
            );

CREATE TABLE IF NOT EXISTS showcase_likes (
            id SERIAL PRIMARY KEY,
            project_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(project_id, user_id)
        );

CREATE TABLE IF NOT EXISTS story_archive (
            id SERIAL PRIMARY KEY,
            story_id INTEGER NOT NULL UNIQUE,
            user_id INTEGER NOT NULL,
            archived_at TIMESTAMPTZ DEFAULT NOW()
        );

CREATE TABLE IF NOT EXISTS story_highlights (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            cover_image TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        , cover_url TEXT, story_ids TEXT, updated_at TIMESTAMPTZ);

CREATE TABLE IF NOT EXISTS story_reactions (
            id SERIAL PRIMARY KEY,
            story_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            emoji TEXT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(story_id, user_id)
        );

CREATE TABLE IF NOT EXISTS story_replies (
            id SERIAL PRIMARY KEY,
            story_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            content TEXT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

CREATE TABLE IF NOT EXISTS story_reports (
            id SERIAL PRIMARY KEY,
            story_id INTEGER NOT NULL,
            reporter_id INTEGER NOT NULL,
            reason TEXT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

CREATE TABLE IF NOT EXISTS story_views (
            id SERIAL PRIMARY KEY,
            story_id INTEGER NOT NULL,
            viewer_id INTEGER NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(story_id, viewer_id)
        );

CREATE TABLE IF NOT EXISTS study_room_members (
            id SERIAL PRIMARY KEY,
            room_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            role TEXT DEFAULT 'member',
            joined_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(room_id, user_id)
        );

CREATE TABLE IF NOT EXISTS study_room_messages (
            id SERIAL PRIMARY KEY,
            room_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            content TEXT,
            file_url TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

CREATE TABLE IF NOT EXISTS subscriptions (
            id SERIAL PRIMARY KEY,
            subscriber_id INTEGER NOT NULL,
            creator_id INTEGER NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

CREATE TABLE IF NOT EXISTS tutoring_posts (
            id SERIAL PRIMARY KEY,
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
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

CREATE TABLE IF NOT EXISTS typing_indicators (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            peer_id TEXT NOT NULL,
            is_typing INTEGER DEFAULT 1,
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );

CREATE TABLE IF NOT EXISTS user_warnings (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            admin_id INTEGER NOT NULL,
            reason TEXT NOT NULL,
            severity TEXT DEFAULT 'warning',
            post_id INTEGER,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );




-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_users ON messages(sender_id, receiver_id);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_id, isRead);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_blood_group ON blood_donations(blood_group, is_available);
CREATE INDEX IF NOT EXISTS idx_rideshare_date ON rideshare_posts(ride_date, status);
CREATE INDEX IF NOT EXISTS idx_showcase_feat ON showcase_projects(is_featured, created_at);
CREATE INDEX IF NOT EXISTS idx_qbank_course ON question_bank(course_code, department);
CREATE INDEX IF NOT EXISTS idx_polls_status ON polls(status, created_at);

COMMIT;
