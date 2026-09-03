const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');
require('dotenv').config();
const { initDatabase } = require('./server/config/db');

(async () => {
 console.log('Running full DB migration with all new tables...');
 await initDatabase();
 const db = await open({ filename: path.join(__dirname, 'database.sqlite'), driver: sqlite3.Database });
 const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
 console.log(`\n Total tables: ${tables.length}`);
 tables.forEach(t => console.log(' -', t.name));
 await db.close();
 process.exit(0);
})();
