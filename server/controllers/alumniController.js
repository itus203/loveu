exports.getAlumni = async (req, res) => {
    try {
        const alumni = await global.db.all(
            `SELECT id as _id, fullName, profilePicture, department, graduationYear,
             jobTitle, company, linkedin, country, bio
             FROM users WHERE role='Alumni' ORDER BY graduationYear DESC`
        );
        res.json(alumni);
    } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.updateAlumniProfile = async (req, res) => {
    try {
        const { graduationYear, department, jobTitle, company, linkedin, country, bio } = req.body;
        // Ensure alumni_profiles table columns exist
        await global.db.run(`UPDATE users SET
            role='Alumni',
            department=COALESCE(?,department),
            graduationYear=COALESCE(?,graduationYear),
            jobTitle=COALESCE(?,jobTitle),
            company=COALESCE(?,company),
            linkedin=COALESCE(?,linkedin),
            country=COALESCE(?,country),
            bio=COALESCE(?,bio)
            WHERE id=?`,
            [department||null, graduationYear||null, jobTitle||null, company||null,
             linkedin||null, country||null, bio||null, req.user.id]
        );
        const user = await global.db.get('SELECT * FROM users WHERE id=?', [req.user.id]);
        res.json({ message: 'Alumni profile updated', user });
    } catch(e) { res.status(500).json({ message: e.message }); }
};
