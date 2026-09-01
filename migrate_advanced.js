const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs');

async function migrate() {
    const projectRoot = 'C:/Users/DELL/.gemini/antigravity/scratch/diu-nexus';
    const db = await open({ filename: path.join(projectRoot, 'database.sqlite'), driver: sqlite3.Database });

    await db.exec(`
        CREATE TABLE IF NOT EXISTS close_friends (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            friend_id INTEGER NOT NULL,
            UNIQUE(user_id, friend_id)
        );
    `);

    // Patch storyController.js to handle close friends filtering
    const scPath = path.join(projectRoot, 'server/controllers/storyController.js');
    let scCode = fs.readFileSync(scPath, 'utf8');
    
    // Replace getFeedStories query
    scCode = scCode.replace(
        "WHERE s.expires_at > datetime('now')",
        "WHERE s.expires_at > datetime('now')\n            AND (s.privacy = 'public' \n                OR (s.privacy = 'close_friends' AND EXISTS (SELECT 1 FROM close_friends WHERE user_id = s.user_id AND friend_id = ?))\n                OR s.user_id = ?)"
    );
    // Replace the query arguments in getFeedStories
    scCode = scCode.replace(
        /global\.db\.all\(\`([\s\S]*?)ORDER BY s\.created_at ASC\n        \`\)/,
        "global.db.all(`$1ORDER BY s.created_at ASC\n        `, [req.user.id, req.user.id])"
    );

    fs.writeFileSync(scPath, scCode);
    console.log('Story backend advanced features patched');
}
migrate();
