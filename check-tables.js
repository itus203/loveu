const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');
(async () => {
    const db = await open({ filename: path.join(__dirname, 'database.sqlite'), driver: sqlite3.Database });
    const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    console.log('EXISTING TABLES:');
    tables.forEach(t => console.log(' -', t.name));
    await db.close();
})();
