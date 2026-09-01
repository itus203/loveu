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

    await db.exec(`
        CREATE TABLE IF NOT EXISTS stories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            type TEXT DEFAULT 'image', 
            content TEXT, 
            bg_color TEXT,
            privacy TEXT DEFAULT 'public',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME
        );

        CREATE TABLE IF NOT EXISTS story_views (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            story_id INTEGER NOT NULL,
            viewer_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(story_id, viewer_id)
        );
        
        CREATE TABLE IF NOT EXISTS story_highlights (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            cover_image TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // Add to db.js for persistence
    const dbJsPath = path.join(projectRoot, 'server/config/db.js');
    let dbCode = fs.readFileSync(dbJsPath, 'utf8');
    
    if (!dbCode.includes('CREATE TABLE IF NOT EXISTS stories')) {
        const newTables = `
        CREATE TABLE IF NOT EXISTS stories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            type TEXT DEFAULT 'image', 
            content TEXT, 
            bg_color TEXT,
            privacy TEXT DEFAULT 'public',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME
        );

        CREATE TABLE IF NOT EXISTS story_views (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            story_id INTEGER NOT NULL,
            viewer_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(story_id, viewer_id)
        );
        `;
        dbCode = dbCode.replace('CREATE INDEX IF NOT EXISTS idx_messages_users', newTables + '\n        CREATE INDEX IF NOT EXISTS idx_messages_users');
        fs.writeFileSync(dbJsPath, dbCode);
    }
    await db.close();
    console.log('Stories DB Migration Complete');
}
migrate();
