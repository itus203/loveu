const { open } = require('sqlite');
const sqlite3=require('sqlite3').verbose();
const path=require('path');
(async()=>{
  const db=await open({filename:path.join(process.cwd(), 'database.sqlite'), driver:sqlite3.Database});
  await db.run(`UPDATE users SET studentId='242-35-203' WHERE email='niloy242-35-203@diu.edu.bd'`);
  console.log('updated niloy');
  // Also ensure other demo users have studentId if their email matches pattern
  const users=await db.all(`SELECT id, email FROM users WHERE email LIKE '%@diu.edu.bd'`);
  for(const u of users){
    const local=u.email.split('@')[0];
    const m=local.match(/(\d{3}-\d{2}-\d{3,4})$/);
    if(m && !u.studentId){
      // check if studentId column exists and update
      try{ await db.run(`UPDATE users SET studentId=? WHERE id=?`, [m[1], u.id]); console.log(`set ${u.email} -> ${m[1]}`); }catch(e){ console.log('err',e.message); }
    }
  }
  const all=await db.all(`SELECT id, fullName, email, studentId FROM users`);
  console.log(JSON.stringify(all,null,2));
  process.exit(0);
})();
