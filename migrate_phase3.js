const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs');

async function migrate() {
    const projectRoot = 'C:/Users/DELL/.gemini/antigravity/scratch/diu-nexus';
    const db = await open({
        filename: path.join(projectRoot, 'database.sqlite'),
        driver: sqlite3.Database
    });

    try {
        await db.run("ALTER TABLE posts ADD COLUMN is_exclusive INTEGER DEFAULT 0");
        console.log('Added is_exclusive to posts');
    } catch(e) { }

    await db.exec(`
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
    `);

    // Add to db.js for persistence
    const dbJsPath = path.join(projectRoot, 'server/config/db.js');
    let dbCode = fs.readFileSync(dbJsPath, 'utf8');
    
    if (!dbCode.includes('CREATE TABLE IF NOT EXISTS subscriptions')) {
        const newTables = `
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
        `;
        
        dbCode = dbCode.replace('CREATE INDEX IF NOT EXISTS idx_messages_users', newTables + '\n        CREATE INDEX IF NOT EXISTS idx_messages_users');
        dbCode = dbCode.replace(
            /CREATE TABLE IF NOT EXISTS posts \(\s*id INTEGER PRIMARY KEY AUTOINCREMENT,\s*user_id INTEGER NOT NULL,\s*content TEXT,\s*mediaUrl TEXT,\s*created_at DATETIME DEFAULT CURRENT_TIMESTAMP\s*\);/g,
            "CREATE TABLE IF NOT EXISTS posts (\n            id INTEGER PRIMARY KEY AUTOINCREMENT,\n            user_id INTEGER NOT NULL,\n            content TEXT,\n            mediaUrl TEXT,\n            is_exclusive INTEGER DEFAULT 0,\n            created_at DATETIME DEFAULT CURRENT_TIMESTAMP\n        );"
        );
        fs.writeFileSync(dbJsPath, dbCode);
    }
    await db.close();
    console.log('Phase 3 DB Migration Complete');
}
migrate();
