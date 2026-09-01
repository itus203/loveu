const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.sqlite');

db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
    if (err) {
        console.error('DB Error:', err);
        return;
    }
    const names = tables.map(t => t.name);
    console.log('Tables in SQLite DB:', names.join(', '));

    const required = [
        'users', 'posts', 'comments', 'reactions', 'saved_posts', 
        'friends', 'friend_requests', 'messages', 'group_messages', 
        'groups_table', 'group_members', 'events', 'event_rsvps', 
        'stories', 'reels', 'resources', 'email_otps', 'bus_routes', 'lost_found'
    ];
    
    let missing = [];
    for (const r of required) {
        if (!names.includes(r)) missing.push(r);
    }

    if (missing.length === 0) {
        console.log('✅ 100% SUCCESS: All 19 Database Tables exist and are verified!');
    } else {
        console.log('Missing tables:', missing);
    }
    db.close();
});
