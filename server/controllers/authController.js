const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

// Gmail SMTP helper - robust with fallback port
async function sendOtpEmail(toEmail, otp, fullName) {
    const gmailUser = process.env.GMAIL_USER;
    let gmailPass = process.env.GMAIL_APP_PASSWORD;
    if (gmailPass) gmailPass = gmailPass.replace(/\s+/g, '');
    if (!gmailUser || !gmailPass) {
        console.warn('⚠️  GMAIL_USER or GMAIL_APP_PASSWORD missing in .env — email skipped (to:'+toEmail+' otp:'+otp+')');
        console.log(`[OTP FALLBACK] ${toEmail} -> ${otp} (no SMTP config)`);
        return false;
    }
    const html = `
            <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
                <div style="background:linear-gradient(135deg,#0866ff,#0550c1);padding:32px 28px;text-align:center;">
                    <h1 style="color:white;font-size:1.6rem;margin:0;">DIU Nexus</h1>
                    <p style="color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:0.9rem;">Daffodil International University</p>
                </div>
                <div style="padding:32px 28px;">
                    <h2 style="font-size:1.1rem;margin:0 0 8px;">Hello, ${fullName}! 👋</h2>
                    <p style="color:#65676b;font-size:0.92rem;line-height:1.5;margin:0 0 24px;">
                        Your official DIU Nexus verification code is:
                    </p>
                    <div style="background:#f0f4ff;border:2px dashed #0866ff;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
                        <span style="font-size:2.8rem;font-weight:800;letter-spacing:12px;color:#0866ff;">${otp}</span>
                    </div>
                    <p style="color:#65676b;font-size:0.85rem;margin:0;line-height:1.5;">
                        ⏱ This code will expire in <strong>10 minutes</strong>.<br>
                        If you did not register for this account, please ignore this email.
                    </p>
                </div>
                <div style="background:#f0f2f5;padding:16px 28px;text-align:center;">
                    <p style="color:#65676b;font-size:0.78rem;margin:0;">© 2025 DIU Nexus · Daffodil International University</p>
                </div>
            </div>`;
    // Try Gmail service first
    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: gmailUser, pass: gmailPass },
            connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 10000
        });
        await transporter.sendMail({ from: `"DIU Nexus" <${gmailUser}>`, to: toEmail, subject: '🎓 DIU Nexus — Official Email Verification Code', html });
        console.log(`✅ OTP email sent to ${toEmail} via gmail service`);
        return true;
    } catch(e1) {
        console.error('❌ Email gmail service fail:', e1.message, e1.code || '');
        // Fallback: direct SMTP host
        try {
            const transporter2 = nodemailer.createTransport({
                host: 'smtp.gmail.com', port: 587, secure: false, requireTLS: true,
                auth: { user: gmailUser, pass: gmailPass },
                connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 10000
            });
            await transporter2.sendMail({ from: `"DIU Nexus" <${gmailUser}>`, to: toEmail, subject: '🎓 DIU Nexus — Official Email Verification Code', html });
            console.log(`✅ OTP email sent to ${toEmail} via smtp.gmail.com:587`);
            return true;
        } catch(e2) {
            console.error('❌ Email smtp fallback fail:', e2.message, e2.code || '');
            console.log(`[OTP FALLBACK] ${toEmail} -> ${otp} (email failed, use DB manual verify)`);
            return false;
        }
    }
}

exports.register = async (req, res) => {
    try {
        const { fullName, email, password, role, department, batch, gender } = req.body;
        let studentId = req.body.studentId;
        if (!fullName || !email || !password)
            return res.status(400).json({ message: 'Full name, email and password are required' });
        if (password.length < 6)
            return res.status(400).json({ message: 'Password must be at least 6 characters' });
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email))
            return res.status(400).json({ message: 'Invalid email address' });

        const NEXUS_ADMINS = ['codingwithsalman11@gmail.com','mehedirohan2002@gmail.com','mehedihasanrohan2002@gmail.com','codingwithsifat@gmail.com','testadmin@diu.edu.bd','jannatulnaima221116@gmail.com','nsumaiya205398@gmail.com','www.rudul@gmail.com'];
        const lowerEmail = email.toLowerCase().trim();
        const isNexusAdmin = NEXUS_ADMINS.includes(lowerEmail);
        if (!isNexusAdmin && !lowerEmail.endsWith('@diu.edu.bd')) {
            return res.status(400).json({
                message: 'Only official DIU institutional emails (@diu.edu.bd) are authorized for registration.'
            });
        }

        let extractedId = null;
        const roleForEmailCheck = (role||'Student').toLowerCase();
        if (!isNexusAdmin && lowerEmail.endsWith('@diu.edu.bd')) {
            const local = lowerEmail.split('@')[0];
            if (roleForEmailCheck === 'faculty' || roleForEmailCheck === 'teacher') {
                const facultyIdMatch = local.match(/(\d{3}-\d{2}-\d{3,4})$/);
                if (facultyIdMatch) {
                    return res.status(400).json({ message: 'Faculty email must be name@diu.edu.bd without ID numbers. Use e.g. ratin@diu.edu.bd — Student/Alumni must use name+ID pattern like niloy242-35-203@diu.edu.bd' });
                }
                if (!/^[a-zA-Z][a-zA-Z0-9._-]+$/.test(local)) {
                    return res.status(400).json({ message: 'Invalid faculty email format. Use your name@diu.edu.bd (e.g. ratin@diu.edu.bd)' });
                }
                if (local.length < 2) {
                    return res.status(400).json({ message: 'Faculty email name too short. Use at least 2 letters before @diu.edu.bd' });
                }
            } else {
                const emailIdMatch = local.match(/(\d{3}-\d{2}-\d{3,4})$/);
                if (!emailIdMatch) {
                    return res.status(400).json({ message: 'Invalid DIU Student/Alumni email. Must be: name + ID + @diu.edu.bd  e.g. niloy242-35-203@diu.edu.bd (ID: XXX-XX-XXX/XXXX). Faculty use name@diu.edu.bd without ID' });
                }
                extractedId = emailIdMatch[1];
                const namePart = local.slice(0, -extractedId.length);
                if (!/^[a-z]{2,}$/.test(namePart)) {
                    return res.status(400).json({ message: 'Email must start with your name (at least 2 letters) followed by ID, e.g. niloy242-35-203@diu.edu.bd' });
                }
                if (studentId && studentId.trim() !== extractedId) {
                    return res.status(400).json({ message: `Email ID (${extractedId}) and studentId (${studentId.trim()}) must match. Use name***-**-***@diu.edu.bd pattern.` });
                }
                if (!studentId) studentId = extractedId;
            }
        }

        const idToValidate = studentId ? studentId.trim() : extractedId;
        if (idToValidate) {
            const diuIdRegex = /^\d{3}-\d{2}-\d{3,4}$/;
            if (!diuIdRegex.test(idToValidate)) {
                return res.status(400).json({ message: 'Invalid DIU ID format. Correct: XXX-XX-XXX or XXX-XX-XXXX e.g. 242-35-203 or 221-35-1001' });
            }
            const [batchPart, deptPart, serialPart] = idToValidate.split('-');
            const validDepts = ['15','16','17','18','22','35','36','38','41','42','43','51'];
            if (!validDepts.includes(deptPart)) {
                return res.status(400).json({ message: `Invalid department code ${deptPart}. Valid: ${validDepts.join(', ')}` });
            }
            const batchNum = parseInt(batchPart, 10);
            if (batchNum < 200 || batchNum > 265) {
                return res.status(400).json({ message: 'Invalid batch. Must be 200-265' });
            }
            const serialNum = parseInt(serialPart, 10);
            if (serialNum < 100 || serialNum > 9999) {
                return res.status(400).json({ message: 'Invalid serial. Must be 100-9999' });
            }
            const blockedFake = ['232-15-125'];
            if (blockedFake.includes(idToValidate)) {
                const isExistingBlocked = await global.db.get('SELECT id FROM users WHERE studentId=?', [idToValidate]);
                if (!isExistingBlocked) {
                    return res.status(400).json({ message: 'This ID appears fabricated. Please use your official DIU ID from your ID card. If you believe this is your real ID, contact admin@diu.edu.bd' });
                }
            }
        }

        // Check if already a verified user
        let existingVerified = null;
        try { existingVerified = await global.db.get('SELECT * FROM users WHERE email=?', [lowerEmail]); } catch {}
        if (existingVerified) {
            const v = existingVerified.isVerified ?? existingVerified.isverified ?? existingVerified.is_verified;
            const isVerifiedEmail = v && Number(v) !== 0;
            if (isVerifiedEmail) {
                return res.status(400).json({ message: 'Email address is already registered. Please Sign In instead.' });
            } else {
                // Legacy ghost: clean it now — will be replaced by pending flow
                console.log(`[Auth] Cleaning legacy unverified ghost ${lowerEmail}`);
                await global.db.run('DELETE FROM users WHERE email=?', [lowerEmail]);
                try { await global.db.run('DELETE FROM email_otps WHERE email=?', [lowerEmail]); } catch {}
            }
        }

        // StudentId uniqueness: check verified users and pending
        if (idToValidate) {
            let ghostIdUser = null;
            try { ghostIdUser = await global.db.get('SELECT * FROM users WHERE studentId=?', [idToValidate]); } catch {}
            if (ghostIdUser) {
                const v = ghostIdUser.isVerified ?? ghostIdUser.isverified ?? ghostIdUser.is_verified;
                const isVerifiedId = v && Number(v) !== 0;
                const sameEmail = ghostIdUser.email && ghostIdUser.email.toLowerCase().trim() === lowerEmail;
                if (isVerifiedId && !sameEmail) {
                    return res.status(400).json({ message: 'This DIU ID is already registered. Please Sign In instead.' });
                }
                if (!isVerifiedId && !sameEmail) {
                    console.log(`[Auth] Cleaning legacy ghost ID ${idToValidate}`);
                    await global.db.run('DELETE FROM users WHERE studentId=?', [idToValidate]);
                }
            }
            // Check pending for same ID but different email
            try {
                const pendingSameId = await global.db.get('SELECT email FROM pending_registrations WHERE studentId=?', [idToValidate]);
                if (pendingSameId && pendingSameId.email.toLowerCase().trim() !== lowerEmail) {
                    // Allow overwrite if pending is expired (>10min)
                    const pendingRow = await global.db.get('SELECT expires_at FROM pending_registrations WHERE studentId=?', [idToValidate]);
                    if (pendingRow && new Date(pendingRow.expires_at) > new Date()) {
                        return res.status(400).json({ message: 'This DIU ID is already pending verification with another email. Please use your own ID or wait 10 minutes.' });
                    } else {
                        await global.db.run('DELETE FROM pending_registrations WHERE studentId=?', [idToValidate]);
                    }
                }
            } catch {}
        }

        // Also check pending for same email — allow re-register (overwrite)
        // No block, just overwrite below

        const hashedPassword = await bcrypt.hash(password, 12);
        const hasGmail = !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
        const isVerifiedFlag = hasGmail ? 0 : 1;

        const NEXUS_ADMIN_SET = ['codingwithsalman11@gmail.com','mehedirohan2002@gmail.com','mehedihasanrohan2002@gmail.com','codingwithsifat@gmail.com','testadmin@diu.edu.bd','jannatulnaima221116@gmail.com','nsumaiya205398@gmail.com','www.rudul@gmail.com'];
        let finalRole = role || 'Student';
        const wantsAdmin = finalRole === 'Admin';
        const isWhitelisted = NEXUS_ADMIN_SET.includes(lowerEmail);
        if (wantsAdmin) {
            if (!isWhitelisted) {
                try{ await global.db.run(`INSERT INTO audit_logs (user_id, user_email, user_role, action, target_type, details, severity) VALUES (NULL, ?, ?, ?, ?, ?, ?)`, [lowerEmail, 'Student', 'UNAUTHORIZED_ADMIN_ATTEMPT', 'auth', null, `Blocked admin registration attempt for ${lowerEmail}`, 'warning']); }catch{}
                return res.status(403).json({ message: 'Admin registration restricted to Nexus Team only. Your attempt has been logged.' });
            }
            finalRole = 'Admin';
        } else {
            if (finalRole === 'Admin' && !isWhitelisted) finalRole = 'Student';
        }

        // If Gmail not configured, directly create verified user (legacy dev mode)
        if (!hasGmail) {
            const result = await global.db.run(
                'INSERT INTO users (fullName, email, studentId, password, role, department, batch, gender, isVerified) VALUES (?,?,?,?,?,?,?,?,?)',
                [fullName.trim(), lowerEmail, studentId ? studentId.trim() : null, hashedPassword, finalRole, department || null, batch || null, gender || null, 1]
            );
            const token = jwt.sign({ id: result.lastID, role: finalRole }, process.env.JWT_SECRET, { expiresIn: '7d' });
            let user = await global.db.get('SELECT id as _id, fullName, email, role, department, batch, profilePicture FROM users WHERE id=?', [result.lastID]);
            if (user) {
                user.fullName = user.fullName || user.fullname;
                user.profilePicture = user.profilePicture || user.profilepicture;
                user._id = user._id || user.id;
            }
            return res.status(201).json({ message: 'Registration successful', token, user, requiresOtp: false });
        }

        // === OTP pending flow: DO NOT insert into users yet ===
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

        // Ensure pending table exists (for hot-reload without restart)
        try { await global.db.exec(`CREATE TABLE IF NOT EXISTS pending_registrations (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, fullName TEXT NOT NULL, studentId TEXT, password TEXT NOT NULL, role TEXT DEFAULT 'Student', department TEXT, batch TEXT, gender TEXT, otp TEXT NOT NULL, expires_at DATETIME NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`); } catch {}

        // Upsert pending: delete then insert (works for SQLite & Postgres)
        try { await global.db.run('DELETE FROM pending_registrations WHERE email=?', [lowerEmail]); } catch {}
        await global.db.run(
            'INSERT INTO pending_registrations (email, fullName, studentId, password, role, department, batch, gender, otp, expires_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
            [lowerEmail, fullName.trim(), studentId ? studentId.trim() : null, hashedPassword, finalRole, department || null, batch || null, gender || null, otp, expiresAt]
        );
        // Also insert into email_otps for compatibility / resend lookup
        try {
            await global.db.run('INSERT INTO email_otps (email, otp, expires_at, used) VALUES (?,?,?,0)', [lowerEmail, otp, expiresAt]);
        } catch {}

        console.log(`[OTP pending] ${lowerEmail} -> ${otp} (expires ${expiresAt})`);

        // Send email in background but log result; if fails, we still keep pending so user can resend
        sendOtpEmail(lowerEmail, otp, fullName.trim()).then(sent=>{
            if(!sent) console.error(`[OTP] Failed to send to ${lowerEmail} — pending kept for resend`);
        }).catch(e=> console.error('[OTP email background fail]', e.message));

        return res.status(201).json({
            message: 'Registration successful! An OTP has been sent to your institutional email. Please verify to create your account.',
            requiresOtp: true,
            email: lowerEmail
        });

    } catch (e) {
        console.error('Register error:', e);
        res.status(500).json({ message: e.message });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });

        const lowerEmail = email.toLowerCase().trim();

        // Check pending first: if account not yet verified, tell to verify
        let pending = null;
        try { pending = await global.db.get('SELECT * FROM pending_registrations WHERE email=?', [lowerEmail]); } catch {}
        if (pending) {
            // Pending exists but not yet verified — check password against pending
            const isMatchPending = await bcrypt.compare(password, pending.password);
            if (!isMatchPending) return res.status(401).json({ message: 'Invalid email or password' });
            // Check expiry — if expired, delete pending and allow re-register
            if (new Date(pending.expires_at) < new Date()) {
                try { await global.db.run('DELETE FROM pending_registrations WHERE email=?', [lowerEmail]); } catch {}
                return res.status(401).json({ message: 'Your OTP has expired. Please create account again to get a new code.', requiresOtp: false });
            }
            // Auto-resend fresh OTP if pending is valid
            try {
                const newOtp = Math.floor(100000 + Math.random() * 900000).toString();
                const newExpires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
                await global.db.run('UPDATE pending_registrations SET otp=?, expires_at=? WHERE email=?', [newOtp, newExpires, lowerEmail]);
                try { await global.db.run('INSERT INTO email_otps (email, otp, expires_at, used) VALUES (?,?,?,0)', [lowerEmail, newOtp, newExpires]); } catch {}
                console.log(`[OTP pending login-resend] ${lowerEmail} -> ${newOtp}`);
                sendOtpEmail(lowerEmail, newOtp, pending.fullName || pending.fullname || 'User').catch(e=> console.error('[OTP pending resend fail]', e.message));
            } catch (otpErr) { console.error('[OTP pending resend error]', otpErr.message); }
            return res.status(401).json({
                message: 'Please verify your email first. A new OTP has been sent to your email. Enter it to complete registration.',
                requiresOtp: true,
                email: lowerEmail
            });
        }

        const user = await global.db.get('SELECT * FROM users WHERE email=?', [lowerEmail]);
        if (!user) return res.status(401).json({ message: 'Invalid email or password' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ message: 'Invalid email or password' });

        const isVerifiedVal = user.isVerified ?? user.isverified ?? user.is_verified ?? user.isVerified;
        if (!isVerifiedVal || Number(isVerifiedVal) === 0) {
            // Legacy ghost: auto-send OTP
            try {
                const otp = Math.floor(100000 + Math.random() * 900000).toString();
                const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
                await global.db.run('INSERT INTO email_otps (email, otp, expires_at, used) VALUES (?,?,?,0)', [user.email.toLowerCase().trim(), otp, expiresAt]);
                console.log(`[OTP legacy login-resend] ${user.email.toLowerCase().trim()} -> ${otp}`);
                sendOtpEmail(user.email.toLowerCase().trim(), otp, user.fullName || user.fullname || 'User').catch(e=> console.error('[OTP legacy resend fail]', e.message));
            } catch (otpErr) { console.error('[OTP legacy resend error]', otpErr.message); }
            return res.status(401).json({
                message: 'Please verify your institutional email first. A new OTP has been sent to your email.',
                requiresOtp: true,
                email: user.email
            });
        }

        const NEXUS_ADMINS_LOGIN = ['codingwithsalman11@gmail.com','mehedirohan2002@gmail.com','mehedihasanrohan2002@gmail.com','codingwithsifat@gmail.com','testadmin@diu.edu.bd','jannatulnaima221116@gmail.com','nsumaiya205398@gmail.com','www.rudul@gmail.com'];
        if (user.role === 'Admin' && !NEXUS_ADMINS_LOGIN.includes(user.email.toLowerCase().trim())) {
            try{ await global.db.run(`INSERT INTO audit_logs (user_id, user_email, user_role, action, target_type, details, severity) VALUES (?,?,?,?,?,?,?)`, [user.id, user.email, user.role, 'UNAUTHORIZED_ADMIN_LOGIN', 'auth', `Blocked admin login for non-whitelisted ${user.email}`, 'critical']); }catch{}
            return res.status(403).json({ message: 'Admin access restricted to Nexus Team only.' });
        }

        const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
        const { password: _, ...userWithoutPassword } = user;
        userWithoutPassword._id = user.id;
        userWithoutPassword.fullName = userWithoutPassword.fullName || userWithoutPassword.fullname;
        userWithoutPassword.profilePicture = userWithoutPassword.profilePicture || userWithoutPassword.profilepicture;
        userWithoutPassword.coverPicture = userWithoutPassword.coverPicture || userWithoutPassword.coverpicture;
        userWithoutPassword.createdAt = userWithoutPassword.createdAt || userWithoutPassword.createdat;
        userWithoutPassword.studentId = userWithoutPassword.studentId || userWithoutPassword.studentid;
        if (!userWithoutPassword.fullName) userWithoutPassword.fullName = 'DIU Member';
        res.status(200).json({ message: 'Login successful', token, user: userWithoutPassword });
    } catch (e) {
        console.error('Login error:', e);
        res.status(500).json({ message: e.message });
    }
};

// POST /api/auth/verify-otp
exports.verifyOtp = async (req, res) => {
    try {
        const { email, otp } = req.body;
        if (!email || !otp) return res.status(400).json({ message: 'Email and OTP code are required' });
        const lowerEmail = email.toLowerCase().trim();
        const otpStr = otp.toString().trim();

        // Try pending flow first
        let pending = null;
        try { pending = await global.db.get('SELECT * FROM pending_registrations WHERE email=?', [lowerEmail]); } catch {}
        if (pending) {
            if (pending.otp !== otpStr) {
                // Also check email_otps for resend cases where pending otp was updated but old otp in email_otps
                const alt = await global.db.get('SELECT * FROM email_otps WHERE email=? AND otp=? AND used=0 ORDER BY created_at DESC LIMIT 1', [lowerEmail, otpStr]);
                if (!alt) return res.status(400).json({ message: 'Invalid OTP code' });
                // Use pending's data but accept alt
            }
            if (new Date(pending.expires_at) < new Date())
                return res.status(400).json({ message: 'OTP code has expired. Please request a new code.' });

            // Create verified user from pending
            const existingCheck = await global.db.get('SELECT id FROM users WHERE email=?', [lowerEmail]);
            if (existingCheck) {
                // Should not happen, but clean pending and treat as verified
                await global.db.run('DELETE FROM pending_registrations WHERE email=?', [lowerEmail]);
                await global.db.run('UPDATE users SET isVerified=1 WHERE email=?', [lowerEmail]);
                const user = await global.db.get('SELECT * FROM users WHERE email=?', [lowerEmail]);
                const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
                const { password: _, ...uw } = user;
                uw._id = user.id;
                uw.fullName = uw.fullName || uw.fullname;
                uw.profilePicture = uw.profilePicture || uw.profilepicture;
                uw.coverPicture = uw.coverPicture || uw.coverpicture;
                return res.json({ message: '✅ Email verified! Welcome to DIU Nexus.', token, user: uw });
            }

            const result = await global.db.run(
                'INSERT INTO users (fullName, email, studentId, password, role, department, batch, gender, isVerified) VALUES (?,?,?,?,?,?,?,?,?)',
                [pending.fullName || pending.fullname, lowerEmail, pending.studentId || pending.studentid || null, pending.password, pending.role, pending.department, pending.batch, pending.gender, 1]
            );
            // Mark OTP used and clean pending
            try { await global.db.run('UPDATE email_otps SET used=1 WHERE email=? AND otp=?', [lowerEmail, otpStr]); } catch {}
            try { await global.db.run('DELETE FROM pending_registrations WHERE email=?', [lowerEmail]); } catch {}

            const user = await global.db.get('SELECT * FROM users WHERE email=?', [lowerEmail]);
            const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
            const { password: _, ...userWithoutPassword } = user;
            userWithoutPassword._id = user.id;
            userWithoutPassword.fullName = userWithoutPassword.fullName || userWithoutPassword.fullname;
            userWithoutPassword.profilePicture = userWithoutPassword.profilePicture || userWithoutPassword.profilepicture;
            userWithoutPassword.coverPicture = userWithoutPassword.coverPicture || userWithoutPassword.coverpicture;
            return res.json({ message: '✅ Email verified successfully! Welcome to DIU Nexus.', token, user: userWithoutPassword });
        }

        // Legacy flow: check email_otps for ghosts
        const record = await global.db.get(
            'SELECT * FROM email_otps WHERE email=? AND otp=? AND used=0 ORDER BY created_at DESC LIMIT 1',
            [lowerEmail, otpStr]
        );
        if (!record) return res.status(400).json({ message: 'Invalid or expired OTP code' });
        if (new Date(record.expires_at) < new Date())
            return res.status(400).json({ message: 'OTP code has expired. Please request a new code.' });

        await global.db.run('UPDATE email_otps SET used=1 WHERE id=?', [record.id]);
        await global.db.run('UPDATE users SET isVerified=1 WHERE email=?', [lowerEmail]);

        const user = await global.db.get('SELECT * FROM users WHERE email=?', [lowerEmail]);
        if (!user) return res.status(404).json({ message: 'User not found. Please register again.' });
        const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
        const { password: _, ...userWithoutPassword } = user;
        userWithoutPassword._id = user.id;
        userWithoutPassword.fullName = userWithoutPassword.fullName || userWithoutPassword.fullname;
        userWithoutPassword.profilePicture = userWithoutPassword.profilePicture || userWithoutPassword.profilepicture;
        userWithoutPassword.coverPicture = userWithoutPassword.coverPicture || userWithoutPassword.coverpicture;

        res.json({ message: '✅ Email verified successfully! Welcome to DIU Nexus.', token, user: userWithoutPassword });
    } catch (e) {
        console.error('OTP verify error:', e);
        res.status(500).json({ message: e.message });
    }
};

// POST /api/auth/resend-otp
exports.resendOtp = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ message: 'Email is required' });
        const lowerEmail = email.toLowerCase().trim();

        // Pending flow
        let pending = null;
        try { pending = await global.db.get('SELECT * FROM pending_registrations WHERE email=?', [lowerEmail]); } catch {}
        if (pending) {
            const otp = Math.floor(100000 + Math.random() * 900000).toString();
            const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
            await global.db.run('UPDATE pending_registrations SET otp=?, expires_at=? WHERE email=?', [otp, expiresAt, lowerEmail]);
            try { await global.db.run('INSERT INTO email_otps (email, otp, expires_at, used) VALUES (?,?,?,0)', [lowerEmail, otp, expiresAt]); } catch {}
            console.log(`[OTP pending resend] ${lowerEmail} -> ${otp}`);
            sendOtpEmail(lowerEmail, otp, pending.fullName || pending.fullname || 'User').catch(e=> console.error('[OTP pending resend fail]', e.message));
            return res.json({ message: 'A new OTP code has been sent to your email.' });
        }

        const user = await global.db.get('SELECT * FROM users WHERE email=?', [lowerEmail]);
        if (!user) return res.status(404).json({ message: 'User not found. Please register again.' });
        const alreadyVerified = user.isVerified ?? user.isverified ?? user.is_verified;
        if (alreadyVerified && Number(alreadyVerified) !== 0) return res.status(400).json({ message: 'Email is already verified' });

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
        await global.db.run('INSERT INTO email_otps (email, otp, expires_at, used) VALUES (?,?,?,0)', [lowerEmail, otp, expiresAt]);
        console.log(`[OTP resend] ${lowerEmail} -> ${otp}`);
        sendOtpEmail(lowerEmail, otp, user.fullName || user.fullname).catch(e=> console.error('[OTP resend fail]', e.message));
        res.json({ message: 'A new OTP code has been sent to your email.' });
    } catch (e) {
        console.error('Resend error', e);
        res.status(500).json({ message: e.message });
    }
};
