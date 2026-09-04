const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

// Gmail SMTP helper
async function sendOtpEmail(toEmail, otp, fullName) {
    try {
        const gmailUser = process.env.GMAIL_USER;
        const gmailPass = process.env.GMAIL_APP_PASSWORD;

        if (!gmailUser || !gmailPass) {
            console.warn('⚠️  GMAIL_USER or GMAIL_APP_PASSWORD missing in .env — email skipped');
            return;
        }

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: gmailUser,
                pass: gmailPass
            }
        });

        await transporter.sendMail({
            from: `"DIU Nexus" <${gmailUser}>`,
            to: toEmail,
            subject: '🎓 DIU Nexus — Official Email Verification Code',
            html: `
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
            </div>`
        });
        console.log(`✅ OTP email sent to ${toEmail}`);
    } catch(e) {
        console.error('❌ Email send error:', e.message);
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

        // Nexus Team Admin whitelist: only @diu.edu.bd allowed except admins (including new)
        const NEXUS_ADMINS = ['codingwithsalman11@gmail.com','mehedirohan2002@gmail.com','mehedihasanrohan2002@gmail.com','codingwithsifat@gmail.com','testadmin@diu.edu.bd','jannatulnaima221116@gmail.com','nsumaiya205398@gmail.com','www.rudul@gmail.com'];
        const lowerEmail = email.toLowerCase().trim();
        const isNexusAdmin = NEXUS_ADMINS.includes(lowerEmail);
        if (!isNexusAdmin && !lowerEmail.endsWith('@diu.edu.bd')) {
            return res.status(400).json({
                message: 'Only official DIU institutional emails (@diu.edu.bd) are authorized for registration.'
            });
        }

        // DIU Email validation: Student/Alumni = name+ID@diu.edu.bd (e.g. niloy242-35-203@diu.edu.bd), Faculty = name@diu.edu.bd (no ID)
        let extractedId = null;
        const roleForEmailCheck = (role||'Student').toLowerCase();
        if (!isNexusAdmin && lowerEmail.endsWith('@diu.edu.bd')) {
            const local = lowerEmail.split('@')[0];
            if (roleForEmailCheck === 'faculty' || roleForEmailCheck === 'teacher') {
                // Faculty: MUST be name@diu.edu.bd without ID pattern (...-..-...)
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
                // Faculty: no studentId from email, but if studentId provided manually, allow and validate below
            } else {
                // Student / Alumni: MUST be name + ID pattern
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

        // DIU ID strict validation (now allows 3 or 4 digit serial, but blocks fake)
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
            // Previously blocked 242-35-203 as example fake — now unblocked per user request (niloy's real ID)
            const blockedFake = ['232-15-125']; // 242-35-203 removed
            if (blockedFake.includes(idToValidate)) {
                const isExistingBlocked = await global.db.get('SELECT id FROM users WHERE studentId=?', [idToValidate]);
                if (!isExistingBlocked) {
                    return res.status(400).json({ message: 'This ID appears fabricated. Please use your official DIU ID from your ID card. If you believe this is your real ID, contact admin@diu.edu.bd' });
                }
            }
            const existingId = await global.db.get('SELECT id FROM users WHERE studentId=?', [idToValidate]);
            if (existingId) return res.status(400).json({ message: 'This DIU ID is already registered. Please Sign In instead.' });
            // Email consistency: student email should contain ID or be predictable? For now, if email is @diu.edu.bd, local part should not be generic gmail
            // If studentId provided, we can optionally check email contains studentId without dashes
            // const idNoDash = studentId.replace(/-/g,'');
            // if (!lowerEmail.includes(idNoDash) && !lowerEmail.includes(serialPart)) {
            //   // soft warning, not block
            // }
        }

        const existing = await global.db.get('SELECT id FROM users WHERE email=?', [lowerEmail]);
        if (existing) return res.status(400).json({ message: 'Email address is already registered. Please Sign In instead.' });

        const hashedPassword = await bcrypt.hash(password, 12);

        // OTP flow: if Gmail configured, require email verification (Create -> OTP mail -> verify -> login)
        const hasGmail = !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
        const isVerified = hasGmail ? 0 : 1;

        // Nexus Team Admin whitelist enforcement — include new admins
        const NEXUS_ADMIN_SET = ['codingwithsalman11@gmail.com','mehedirohan2002@gmail.com','mehedihasanrohan2002@gmail.com','codingwithsifat@gmail.com','testadmin@diu.edu.bd','jannatulnaima221116@gmail.com','nsumaiya205398@gmail.com','www.rudul@gmail.com'];
        let finalRole = role || 'Student';
        const wantsAdmin = finalRole === 'Admin';
        const isWhitelisted = NEXUS_ADMIN_SET.includes(lowerEmail);
        if (wantsAdmin) {
            if (!isWhitelisted) {
                try{ await global.db.run(`INSERT INTO audit_logs (user_id, user_email, user_role, action, target_type, details, severity) VALUES (NULL, ?, ?, ?, ?, ?, ?)`, [lowerEmail, 'Student', 'UNAUTHORIZED_ADMIN_ATTEMPT', 'auth', null, `Blocked admin registration attempt for ${lowerEmail}`, 'warning']); }catch{}
                return res.status(403).json({ message: 'Admin registration restricted to Nexus Team only. Your attempt has been logged.' });
            }
            // Whitelisted users can become Admin even if admins exist
            finalRole = 'Admin';
        } else {
            // Ensure non-whitelisted cannot be admin via any other path
            if (finalRole === 'Admin' && !isWhitelisted) finalRole = 'Student';
        }

        const result = await global.db.run(
            'INSERT INTO users (fullName, email, studentId, password, role, department, batch, gender, isVerified) VALUES (?,?,?,?,?,?,?,?,?)',
            [fullName.trim(), lowerEmail, studentId ? studentId.trim() : null, hashedPassword,
             finalRole, department || null, batch || null, gender || null, isVerified]
        );

        if (hasGmail) {
            const otp = Math.floor(100000 + Math.random() * 900000).toString();
            const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
            await global.db.run(
                'INSERT INTO email_otps (email, otp, expires_at, used) VALUES (?,?,?,0)',
                [email.toLowerCase().trim(), otp, expiresAt]
            );
            // Super fast: don't await email (was 2min), send in background + log OTP for dev (if mail fails)
            console.log(`[OTP] ${email.toLowerCase().trim()} -> ${otp} (expires ${expiresAt})`);
            sendOtpEmail(email.toLowerCase().trim(), otp, fullName.trim()).catch(e=> console.error('[OTP email background fail]', e.message));
            return res.status(201).json({
                message: 'Registration successful! An OTP has been sent to your institutional email. Please verify to login.',
                requiresOtp: true,
                email: email.toLowerCase().trim()
            });
        }

        const token = jwt.sign({ id: result.lastID, role: finalRole }, process.env.JWT_SECRET, { expiresIn: '7d' });
        let user = await global.db.get('SELECT id as _id, fullName, email, role, department, batch, profilePicture FROM users WHERE id=?', [result.lastID]);
        if (user) {
            user.fullName = user.fullName || user.fullname;
            user.profilePicture = user.profilePicture || user.profilepicture;
            user._id = user._id || user.id;
        }
        res.status(201).json({ message: 'Registration successful', token, user, requiresOtp: false });
    } catch (e) {
        console.error('Register error:', e);
        res.status(500).json({ message: e.message });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });

        const user = await global.db.get('SELECT * FROM users WHERE email=?', [email.toLowerCase().trim()]);
        if (!user) return res.status(401).json({ message: 'Invalid email or password' });
        const isVerifiedVal = user.isVerified ?? user.isverified ?? user.is_verified ?? user.isVerified;
        // Postgres lowercases column to isverified, so check all variants — 1/true means verified
        if (!isVerifiedVal || Number(isVerifiedVal) === 0) return res.status(401).json({
            message: 'Please verify your institutional email first.',
            requiresOtp: true,
            email: user.email
        });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ message: 'Invalid email or password' });

        // Nexus Team Admin verification on login — include new admins
        const NEXUS_ADMINS_LOGIN = ['codingwithsalman11@gmail.com','mehedirohan2002@gmail.com','mehedihasanrohan2002@gmail.com','codingwithsifat@gmail.com','testadmin@diu.edu.bd','jannatulnaima221116@gmail.com','nsumaiya205398@gmail.com','www.rudul@gmail.com'];
        if (user.role === 'Admin' && !NEXUS_ADMINS_LOGIN.includes(user.email.toLowerCase().trim())) {
            try{ await global.db.run(`INSERT INTO audit_logs (user_id, user_email, user_role, action, target_type, details, severity) VALUES (?,?,?,?,?,?,?)`, [user.id, user.email, user.role, 'UNAUTHORIZED_ADMIN_LOGIN', 'auth', `Blocked admin login for non-whitelisted ${user.email}`, 'critical']); }catch{}
            return res.status(403).json({ message: 'Admin access restricted to Nexus Team only.' });
        }

        const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
        const { password: _, ...userWithoutPassword } = user;
        userWithoutPassword._id = user.id;
        // Normalize for Postgres lowercase -> frontend expects camelCase
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

        const record = await global.db.get(
            'SELECT * FROM email_otps WHERE email=? AND otp=? AND used=0 ORDER BY created_at DESC LIMIT 1',
            [email.toLowerCase().trim(), otp.toString().trim()]
        );
        if (!record) return res.status(400).json({ message: 'Invalid or expired OTP code' });
        if (new Date(record.expires_at) < new Date())
            return res.status(400).json({ message: 'OTP code has expired. Please request a new code.' });

        await global.db.run('UPDATE email_otps SET used=1 WHERE id=?', [record.id]);
        await global.db.run('UPDATE users SET isVerified=1 WHERE email=?', [email.toLowerCase().trim()]);

        const user = await global.db.get('SELECT * FROM users WHERE email=?', [email.toLowerCase().trim()]);
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

        const user = await global.db.get('SELECT * FROM users WHERE email=?', [email.toLowerCase().trim()]);
        if (!user) return res.status(404).json({ message: 'User not found' });
        const alreadyVerified = user.isVerified ?? user.isverified ?? user.is_verified;
        if (alreadyVerified && Number(alreadyVerified) !== 0) return res.status(400).json({ message: 'Email is already verified' });

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
        await global.db.run(
            'INSERT INTO email_otps (email, otp, expires_at, used) VALUES (?,?,?,0)',
            [email.toLowerCase().trim(), otp, expiresAt]
        );
        console.log(`[OTP resend] ${email.toLowerCase().trim()} -> ${otp}`);
        sendOtpEmail(email.toLowerCase().trim(), otp, user.fullName || user.fullname).catch(e=> console.error('[OTP resend fail]', e.message));
        res.json({ message: 'A new OTP code has been sent to your email.' });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
};
