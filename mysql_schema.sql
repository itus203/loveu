-- DIU Nexus - MySQL Schema
-- For MySQL / MariaDB
-- Import via phpMyAdmin or mysql CLI

SET FOREIGN_KEY_CHECKS=0;

CREATE TABLE archived_chats (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            peer_id TEXT NOT NULL,
            peer_type TEXT DEFAULT 'user',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, peer_id, peer_type)
        );

CREATE TABLE audit_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT,
            user_email TEXT,
            user_role TEXT,
            action TEXT NOT NULL,
            target_type TEXT,
            target_id INT,
            ip_address TEXT,
            user_agent TEXT,
            details TEXT,
            severity TEXT DEFAULT 'info',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

CREATE TABLE banned_users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL UNIQUE,
            banned_by INT NOT NULL,
            reason TEXT NOT NULL,
            expires_at DATETIME,
            is_permanent INT DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

CREATE TABLE blocked_users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            blocker_id INT NOT NULL,
            blocked_id INT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(blocker_id, blocked_id)
        );

CREATE TABLE blood_donations (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            blood_group TEXT NOT NULL,
            name TEXT NOT NULL,
            phone TEXT NOT NULL,
            department TEXT,
            batch TEXT,
            last_donated DATETIME,
            location TEXT,
            is_available INT DEFAULT 1,
            emergency_contact INT DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

CREATE TABLE blood_requests (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            bloodGroup TEXT NOT NULL,
            patientName TEXT NOT NULL,
            hospital TEXT NOT NULL,
            dateNeeded TEXT NOT NULL,
            urgency TEXT DEFAULT 'critical',
            contactNum TEXT NOT NULL,
            details TEXT,
            status TEXT DEFAULT 'active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

CREATE TABLE bus_routes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                route TEXT NOT NULL,
                busNumber TEXT,
                departureTime TEXT NOT NULL,
                arrivalTime TEXT,
                days TEXT DEFAULT 'Sun-Thu',
                stops TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            , routeName TEXT, pickupPoint TEXT, dropPoint TEXT, returnTime TEXT, driverName TEXT, driverPhone TEXT, status TEXT DEFAULT 'On Time', routeNumber TEXT);

CREATE TABLE bus_settings (id INT PRIMARY KEY, last_update TEXT);

CREATE TABLE channel_members (
            id INT AUTO_INCREMENT PRIMARY KEY,
            channel_id INT NOT NULL,
            user_id INT NOT NULL,
            role TEXT DEFAULT 'follower',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

CREATE TABLE channel_posts (
            id INT AUTO_INCREMENT PRIMARY KEY,
            channel_id INT NOT NULL,
            admin_id INT NOT NULL,
            content TEXT,
            mediaUrl TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

CREATE TABLE channels (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            cover_image TEXT,
            creator_id INT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

CREATE TABLE close_friends (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            friend_id INT NOT NULL,
            UNIQUE(user_id, friend_id)
        );

CREATE TABLE cloud_files (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            file_name TEXT NOT NULL,
            file_url TEXT NOT NULL,
            file_size TEXT,
            file_type TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

CREATE TABLE club_members (
            id INT AUTO_INCREMENT PRIMARY KEY,
            club_id INT NOT NULL,
            user_id INT NOT NULL,
            role TEXT DEFAULT 'member',
            joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(club_id, user_id)
        );

CREATE TABLE clubs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            description TEXT,
            category TEXT,
            logo_url TEXT,
            cover_url TEXT,
            founded_year INT,
            email TEXT,
            facebook_url TEXT,
            president_id INT,
            member_count INT DEFAULT 0,
            is_verified INT DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

CREATE TABLE collaborative_stories (
            id INT AUTO_INCREMENT PRIMARY KEY,
            title TEXT NOT NULL,
            creator_id INT NOT NULL,
            description TEXT,
            cover_url TEXT,
            type TEXT DEFAULT 'event',
            event_id INT,
            group_id INT,
            is_open INT DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

CREATE TABLE collaborative_story_members (
            id INT AUTO_INCREMENT PRIMARY KEY,
            collab_id INT NOT NULL,
            user_id INT NOT NULL,
            role TEXT DEFAULT 'member',
            joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(collab_id, user_id)
        );

CREATE TABLE comments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                post_id INT NOT NULL,
                user_id INT NOT NULL,
                content TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, mentions TEXT,
                FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

CREATE TABLE confessions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                content TEXT NOT NULL,
                likes INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

CREATE TABLE content_reports (
            id INT AUTO_INCREMENT PRIMARY KEY,
            reporter_id INT NOT NULL,
            reporter_name TEXT,
            target_type TEXT NOT NULL,
            target_id INT NOT NULL,
            reason TEXT NOT NULL,
            details TEXT,
            status TEXT DEFAULT 'pending',
            reviewed_by INT,
            reviewed_at DATETIME,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

CREATE TABLE email_otps (
                id INT AUTO_INCREMENT PRIMARY KEY,
                email TEXT NOT NULL,
                otp TEXT NOT NULL,
                expires_at DATETIME NOT NULL,
                used INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

CREATE TABLE event_rsvps (
                id INT AUTO_INCREMENT PRIMARY KEY,
                event_id INT NOT NULL,
                user_id INT NOT NULL,
                status TEXT DEFAULT 'going',
                UNIQUE(event_id, user_id),
                FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

CREATE TABLE events (
                id INT AUTO_INCREMENT PRIMARY KEY,
                creator_id INT NOT NULL,
                title TEXT NOT NULL,
                description TEXT,
                venue TEXT,
                event_date DATETIME NOT NULL,
                cover_image TEXT,
                department TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE
            );

CREATE TABLE food_items (
            id INT AUTO_INCREMENT PRIMARY KEY,
            vendor_id INT NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            price DOUBLE NOT NULL,
            category TEXT,
            image_url TEXT,
            is_available INT DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

CREATE TABLE food_review_votes (id INT AUTO_INCREMENT PRIMARY KEY, review_id INT NOT NULL, vendor_id INT NOT NULL, user_id INT NOT NULL, vote_type TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE(review_id, user_id));

CREATE TABLE food_reviews (
            id INT AUTO_INCREMENT PRIMARY KEY,
            vendor_id INT NOT NULL,
            user_id INT NOT NULL,
            rating INT NOT NULL,
            review_text TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, upvotes INT DEFAULT 0, downvotes INT DEFAULT 0,
            UNIQUE(vendor_id, user_id)
        );

CREATE TABLE food_vendors (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name TEXT NOT NULL,
            location TEXT,
            category TEXT,
            description TEXT,
            opening_time TEXT,
            closing_time TEXT,
            image_url TEXT,
            rating DOUBLE DEFAULT 0,
            is_active INT DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        , user_id INT, created_by INT);

CREATE TABLE friend_requests (
                id INT AUTO_INCREMENT PRIMARY KEY,
                sender_id INT NOT NULL,
                receiver_id INT NOT NULL,
                status TEXT DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
            );

CREATE TABLE friends (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user1_id INT NOT NULL,
                user2_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user1_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (user2_id) REFERENCES users(id) ON DELETE CASCADE
            );

CREATE TABLE group_activity_log (
            id INT AUTO_INCREMENT PRIMARY KEY,
            group_id INT NOT NULL,
            user_id INT,
            action TEXT NOT NULL,
            target_type TEXT,
            target_id INT,
            details TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

CREATE TABLE group_bans (
            id INT AUTO_INCREMENT PRIMARY KEY,
            group_id INT NOT NULL,
            user_id INT NOT NULL,
            banned_by INT NOT NULL,
            reason TEXT,
            expires_at DATETIME,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(group_id, user_id)
        );

CREATE TABLE group_event_rsvps (
            id INT AUTO_INCREMENT PRIMARY KEY,
            event_id INT NOT NULL,
            user_id INT NOT NULL,
            status TEXT DEFAULT 'going',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(event_id, user_id)
        );

CREATE TABLE group_events (
            id INT AUTO_INCREMENT PRIMARY KEY,
            group_id INT NOT NULL,
            creator_id INT NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            venue TEXT,
            is_online INT DEFAULT 0,
            event_date DATETIME NOT NULL,
            end_date DATETIME,
            cover_image TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

CREATE TABLE group_files (
            id INT AUTO_INCREMENT PRIMARY KEY,
            group_id INT NOT NULL,
            user_id INT NOT NULL,
            file_name TEXT NOT NULL,
            file_url TEXT NOT NULL,
            file_type TEXT,
            category TEXT DEFAULT 'general',
            description TEXT,
            downloads INT DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

CREATE TABLE group_invites (
            id INT AUTO_INCREMENT PRIMARY KEY,
            group_id INT NOT NULL,
            code TEXT UNIQUE NOT NULL,
            created_by INT NOT NULL,
            max_uses INT DEFAULT 0,
            uses INT DEFAULT 0,
            expires_at DATETIME,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

CREATE TABLE group_join_answers (
            id INT AUTO_INCREMENT PRIMARY KEY,
            group_id INT NOT NULL,
            user_id INT NOT NULL,
            question_id INT NOT NULL,
            answer TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

CREATE TABLE group_members (
                id INT AUTO_INCREMENT PRIMARY KEY,
                group_id INT NOT NULL,
                user_id INT NOT NULL,
                role TEXT DEFAULT 'member',
                joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, status TEXT DEFAULT 'active', invited_by INT, badge TEXT, is_muted INT DEFAULT 0, muted_until DATETIME,
                FOREIGN KEY (group_id) REFERENCES groups_table(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

CREATE TABLE group_messages (
            id INT AUTO_INCREMENT PRIMARY KEY,
            group_id INT NOT NULL,
            sender_id INT NOT NULL,
            content TEXT,
            mediaUrl TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, topic_id INT, message_type TEXT DEFAULT 'text', status TEXT DEFAULT 'sent', reply_to_id INT, is_edited INT DEFAULT 0, edited_at DATETIME, is_deleted INT DEFAULT 0, deleted_for TEXT, is_forwarded INT DEFAULT 0, file_name TEXT, file_size TEXT, file_url TEXT, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, is_pinned INT DEFAULT 0,
            FOREIGN KEY (group_id) REFERENCES groups_table(id) ON DELETE CASCADE,
            FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
        );

CREATE TABLE group_mutes (
            id INT AUTO_INCREMENT PRIMARY KEY,
            group_id INT NOT NULL,
            user_id INT NOT NULL,
            muted_by INT NOT NULL,
            reason TEXT,
            expires_at DATETIME,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

CREATE TABLE group_poll_votes (
            id INT AUTO_INCREMENT PRIMARY KEY,
            poll_id INT NOT NULL,
            user_id INT NOT NULL,
            option_index INT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(poll_id, user_id, option_index)
        );

CREATE TABLE group_polls (
            id INT AUTO_INCREMENT PRIMARY KEY,
            group_id INT NOT NULL,
            post_id INT,
            question TEXT NOT NULL,
            options TEXT NOT NULL,
            allow_multiple INT DEFAULT 0,
            is_anonymous INT DEFAULT 0,
            deadline DATETIME,
            created_by INT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

CREATE TABLE group_post_comments (
            id INT AUTO_INCREMENT PRIMARY KEY,
            post_id INT NOT NULL,
            user_id INT NOT NULL,
            content TEXT NOT NULL,
            parent_id INT,
            is_anonymous INT DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        , mentions TEXT);

CREATE TABLE group_post_reactions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            post_id INT NOT NULL,
            user_id INT NOT NULL,
            type TEXT DEFAULT 'like',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(post_id, user_id)
        );

CREATE TABLE group_post_saves (
            id INT AUTO_INCREMENT PRIMARY KEY,
            post_id INT NOT NULL,
            user_id INT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(post_id, user_id)
        );

CREATE TABLE group_posts (
            id INT AUTO_INCREMENT PRIMARY KEY,
            group_id INT NOT NULL,
            user_id INT NOT NULL,
            content TEXT,
            media_url TEXT,
            media_type TEXT,
            is_anonymous INT DEFAULT 0,
            feeling TEXT,
            location TEXT,
            is_pinned INT DEFAULT 0,
            is_featured INT DEFAULT 0,
            is_announcement INT DEFAULT 0,
            is_draft INT DEFAULT 0,
            is_scheduled INT DEFAULT 0,
            scheduled_at DATETIME,
            topic TEXT,
            hashtags TEXT,
            mentions TEXT,
            like_count INT DEFAULT 0,
            comment_count INT DEFAULT 0,
            share_count INT DEFAULT 0,
            view_count INT DEFAULT 0,
            status TEXT DEFAULT 'published',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

CREATE TABLE group_questions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            group_id INT NOT NULL,
            question TEXT NOT NULL,
            type TEXT DEFAULT 'text',
            required INT DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

CREATE TABLE group_reports (
            id INT AUTO_INCREMENT PRIMARY KEY,
            group_id INT NOT NULL,
            reporter_id INT NOT NULL,
            target_type TEXT NOT NULL,
            target_id INT NOT NULL,
            reason TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

CREATE TABLE group_topics (
            id INT AUTO_INCREMENT PRIMARY KEY,
            group_id INT NOT NULL,
            name TEXT NOT NULL,
            created_by INT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

CREATE TABLE groups_table (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                cover_image TEXT,
                creator_id INT NOT NULL,
                privacy TEXT DEFAULT 'Public',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, avatar_image TEXT, category TEXT DEFAULT 'general', group_type TEXT DEFAULT 'general', department TEXT, batch TEXT, course_code TEXT, faculty TEXT, rules TEXT, approval_required INT DEFAULT 0, invite_link TEXT, member_count INT DEFAULT 0, post_count INT DEFAULT 0, is_verified INT DEFAULT 0, is_official INT DEFAULT 0, allow_anonymous INT DEFAULT 0, updated_at DATETIME,
                FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE
            );

CREATE TABLE housing_posts (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            title TEXT NOT NULL,
            category TEXT DEFAULT 'Mess Seat',
            price TEXT NOT NULL,
            location TEXT NOT NULL,
            contact TEXT NOT NULL,
            facilities TEXT,
            description TEXT,
            image TEXT,
            status TEXT DEFAULT 'active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

CREATE TABLE housing_reviews (
            id INT AUTO_INCREMENT PRIMARY KEY,
            house_id INT NOT NULL,
            user_id INT NOT NULL,
            rating INT DEFAULT 5,
            text TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

CREATE TABLE internships (
            id INT AUTO_INCREMENT PRIMARY KEY,
            posted_by INT NOT NULL,
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
            is_verified INT DEFAULT 0,
            status TEXT DEFAULT 'open',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

CREATE TABLE live_streams (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            stream_key TEXT UNIQUE,
            thumbnail_url TEXT,
            viewer_count INT DEFAULT 0,
            peak_viewers INT DEFAULT 0,
            status TEXT DEFAULT 'offline',
            started_at DATETIME,
            ended_at DATETIME,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

CREATE TABLE lost_found (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                type TEXT DEFAULT 'lost',
                title TEXT NOT NULL,
                description TEXT,
                location TEXT,
                contact TEXT,
                imageUrl TEXT,
                status TEXT DEFAULT 'open',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

CREATE TABLE marketplace (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                title TEXT NOT NULL,
                description TEXT,
                price DOUBLE,
                category TEXT DEFAULT 'Other',
                imageUrl TEXT,
                status TEXT DEFAULT 'available',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, phone TEXT, address TEXT, studentId TEXT,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

CREATE TABLE message_reactions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            message_id INT NOT NULL,
            is_group INT DEFAULT 0,
            user_id INT NOT NULL,
            emoji TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(message_id, is_group, user_id, emoji)
        );

CREATE TABLE message_requests (
            id INT AUTO_INCREMENT PRIMARY KEY,
            sender_id INT NOT NULL,
            receiver_id INT NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(sender_id, receiver_id)
        );

CREATE TABLE messages (
                id INT AUTO_INCREMENT PRIMARY KEY,
                sender_id INT NOT NULL,
                receiver_id INT NOT NULL,
                content TEXT,
                mediaUrl TEXT,
                isRead INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, message_type TEXT DEFAULT 'text', status TEXT DEFAULT 'sent', reply_to_id INT, is_edited INT DEFAULT 0, edited_at DATETIME, is_deleted INT DEFAULT 0, deleted_for TEXT, is_forwarded INT DEFAULT 0, file_name TEXT, file_size TEXT, file_url TEXT, delivered_at DATETIME, read_at DATETIME, is_pinned INT DEFAULT 0, updated_at DATETIME,
                FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
            );

CREATE TABLE muted_chats (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            peer_id TEXT NOT NULL,
            peer_type TEXT DEFAULT 'user',
            muted_until DATETIME,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, peer_id, peer_type)
        );

CREATE TABLE notifications (
                id INT AUTO_INCREMENT PRIMARY KEY,
                recipient_id INT NOT NULL,
                sender_id INT,
                type TEXT NOT NULL,
                message TEXT NOT NULL,
                isRead INT DEFAULT 0,
                link TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE
            );

CREATE TABLE page_followers (
            id INT AUTO_INCREMENT PRIMARY KEY,
            page_id INT NOT NULL,
            user_id INT NOT NULL,
            followed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(page_id, user_id)
        );

CREATE TABLE page_posts (
            id INT AUTO_INCREMENT PRIMARY KEY,
            page_id INT NOT NULL,
            posted_by INT NOT NULL,
            content TEXT,
            media_url TEXT,
            like_count INT DEFAULT 0,
            share_count INT DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

CREATE TABLE pages (
            id INT AUTO_INCREMENT PRIMARY KEY,
            created_by INT NOT NULL,
            name TEXT NOT NULL,
            username TEXT UNIQUE,
            description TEXT,
            category TEXT,
            logo_url TEXT,
            cover_url TEXT,
            website TEXT,
            email TEXT,
            follower_count INT DEFAULT 0,
            is_verified INT DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

CREATE TABLE pinned_messages (
            id INT AUTO_INCREMENT PRIMARY KEY,
            message_id INT NOT NULL,
            is_group INT DEFAULT 0,
            conversation_id TEXT NOT NULL,
            pinned_by INT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(message_id, is_group)
        );

CREATE TABLE poll_options (
            id INT AUTO_INCREMENT PRIMARY KEY,
            poll_id INT NOT NULL,
            option_text TEXT NOT NULL,
            vote_count INT DEFAULT 0
        );

CREATE TABLE poll_votes (
            id INT AUTO_INCREMENT PRIMARY KEY,
            poll_id INT NOT NULL,
            option_id INT NOT NULL,
            user_id INT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(poll_id, option_id, user_id)
        );

CREATE TABLE polls (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            question TEXT NOT NULL,
            allow_multiple INT DEFAULT 0,
            is_anonymous INT DEFAULT 0,
            expires_at DATETIME,
            status TEXT DEFAULT 'active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

CREATE TABLE posts (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                content TEXT,
                mediaUrl TEXT,
                mediaType TEXT,
                visibility TEXT DEFAULT 'Public',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, is_exclusive INT DEFAULT 0, mentions TEXT,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

CREATE TABLE posts_flagged (
            id INT AUTO_INCREMENT PRIMARY KEY,
            post_id INT NOT NULL UNIQUE,
            flagged_by INT NOT NULL,
            reason TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

CREATE TABLE question_bank (
            id INT AUTO_INCREMENT PRIMARY KEY,
            uploaded_by INT NOT NULL,
            course_code TEXT NOT NULL,
            course_name TEXT,
            department TEXT,
            semester TEXT,
            year INT,
            exam_type TEXT,
            file_url TEXT NOT NULL,
            file_name TEXT,
            download_count INT DEFAULT 0,
            like_count INT DEFAULT 0,
            is_verified INT DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

CREATE TABLE question_bank_likes (
            id INT AUTO_INCREMENT PRIMARY KEY,
            question_id INT NOT NULL,
            user_id INT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(question_id, user_id)
        );

CREATE TABLE reactions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                post_id INT NOT NULL,
                user_id INT NOT NULL,
                type TEXT DEFAULT 'like',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(post_id, user_id),
                FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

CREATE TABLE reel_comments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                reel_id INT NOT NULL,
                user_id INT NOT NULL,
                content TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (reel_id) REFERENCES reels(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

CREATE TABLE reel_likes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                reel_id INT NOT NULL,
                user_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(reel_id, user_id),
                FOREIGN KEY (reel_id) REFERENCES reels(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

CREATE TABLE reels (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                videoUrl TEXT NOT NULL,
                caption TEXT,
                views INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

CREATE TABLE resource_likes (id INT AUTO_INCREMENT PRIMARY KEY, resource_id INT NOT NULL, user_id INT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE(resource_id, user_id));

CREATE TABLE resources (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                title TEXT NOT NULL,
                description TEXT,
                fileUrl TEXT NOT NULL,
                fileType TEXT,
                department TEXT,
                batch TEXT,
                subject TEXT,
                downloads INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, like_count INT DEFAULT 0,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

CREATE TABLE rideshare_posts (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            type TEXT NOT NULL,
            from_location TEXT NOT NULL,
            to_location TEXT NOT NULL,
            ride_date TEXT NOT NULL,
            ride_time TEXT NOT NULL,
            seats INT DEFAULT 1,
            fare DOUBLE,
            vehicle_type TEXT,
            contact TEXT,
            notes TEXT,
            status TEXT DEFAULT 'open',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

CREATE TABLE saved_posts (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                post_id INT NOT NULL,
                saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, post_id),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
            );

CREATE TABLE showcase_likes (
            id INT AUTO_INCREMENT PRIMARY KEY,
            project_id INT NOT NULL,
            user_id INT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(project_id, user_id)
        );

CREATE TABLE showcase_projects (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            tech_stack TEXT,
            category TEXT,
            image_url TEXT,
            demo_url TEXT,
            github_url TEXT,
            play_store_url TEXT,
            like_count INT DEFAULT 0,
            view_count INT DEFAULT 0,
            is_featured INT DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

CREATE TABLE stories (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            type TEXT DEFAULT 'image',
            content TEXT NOT NULL,
            bg_color TEXT,
            privacy TEXT DEFAULT 'public',
            expires_at DATETIME,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        , caption TEXT, media_url TEXT, audience TEXT DEFAULT 'public', updated_at DATETIME, stickers TEXT, filter TEXT, music_url TEXT, music_title TEXT, location TEXT, campus_tag TEXT, course_code TEXT, batch TEXT, department TEXT, event_id INT, group_id INT, channel_id INT, collaborative_id INT, is_collaborative INT DEFAULT 0, is_exclusive INT DEFAULT 0, is_featured INT DEFAULT 0, is_archived INT DEFAULT 0, view_count INT DEFAULT 0, reaction_count INT DEFAULT 0, reply_count INT DEFAULT 0, share_count INT DEFAULT 0, challenge_tag TEXT, ai_style TEXT, quiz_data TEXT, poll_data TEXT, voice_url TEXT, translation TEXT, allow_replies INT DEFAULT 1, allow_reactions INT DEFAULT 1, allow_sharing INT DEFAULT 1);

CREATE TABLE story_archive (
            id INT AUTO_INCREMENT PRIMARY KEY,
            story_id INT NOT NULL UNIQUE,
            user_id INT NOT NULL,
            archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

CREATE TABLE story_highlights (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            title TEXT NOT NULL,
            cover_image TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        , cover_url TEXT, story_ids TEXT, updated_at DATETIME);

CREATE TABLE story_reactions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            story_id INT NOT NULL,
            user_id INT NOT NULL,
            emoji TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(story_id, user_id)
        );

CREATE TABLE story_replies (
            id INT AUTO_INCREMENT PRIMARY KEY,
            story_id INT NOT NULL,
            user_id INT NOT NULL,
            content TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

CREATE TABLE story_reports (
            id INT AUTO_INCREMENT PRIMARY KEY,
            story_id INT NOT NULL,
            reporter_id INT NOT NULL,
            reason TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

CREATE TABLE story_views (
            id INT AUTO_INCREMENT PRIMARY KEY,
            story_id INT NOT NULL,
            viewer_id INT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(story_id, viewer_id)
        );

CREATE TABLE study_room_members (
            id INT AUTO_INCREMENT PRIMARY KEY,
            room_id INT NOT NULL,
            user_id INT NOT NULL,
            role TEXT DEFAULT 'member',
            joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(room_id, user_id)
        );

CREATE TABLE study_room_messages (
            id INT AUTO_INCREMENT PRIMARY KEY,
            room_id INT NOT NULL,
            user_id INT NOT NULL,
            content TEXT,
            file_url TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

CREATE TABLE study_rooms (
            id INT AUTO_INCREMENT PRIMARY KEY,
            created_by INT NOT NULL,
            name TEXT NOT NULL,
            subject TEXT,
            description TEXT,
            max_members INT DEFAULT 10,
            is_private INT DEFAULT 0,
            invite_code TEXT UNIQUE,
            status TEXT DEFAULT 'active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

CREATE TABLE subscriptions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            subscriber_id INT NOT NULL,
            creator_id INT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

CREATE TABLE tutoring_posts (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            type TEXT NOT NULL,
            subject TEXT NOT NULL,
            description TEXT,
            department TEXT,
            batch TEXT,
            fee_per_hour DOUBLE,
            mode TEXT DEFAULT 'online',
            contact TEXT,
            availability TEXT,
            is_active INT DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

CREATE TABLE typing_indicators (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            peer_id TEXT NOT NULL,
            is_typing INT DEFAULT 1,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

CREATE TABLE user_warnings (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            admin_id INT NOT NULL,
            reason TEXT NOT NULL,
            severity TEXT DEFAULT 'warning',
            post_id INT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

CREATE TABLE users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                fullName TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                role TEXT DEFAULT 'Student',
                isVerified INT DEFAULT 1,
                bio TEXT,
                department TEXT,
                batch TEXT,
                gender TEXT,
                profilePicture TEXT,
                coverPicture TEXT,
                createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            , graduationYear TEXT, jobTitle TEXT, company TEXT, linkedin TEXT, country TEXT, last_seen DATETIME, is_online INT DEFAULT 0, show_online INT DEFAULT 1, show_read_receipt INT DEFAULT 1, studentId TEXT);

SET FOREIGN_KEY_CHECKS=1;
