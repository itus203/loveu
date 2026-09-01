const { open } = require('sqlite');
const sqlite3=require('sqlite3').verbose();
const path=require('path');
const bcrypt=require('bcryptjs');
(async()=>{
  const db=await open({filename:path.join(process.cwd(), 'database.sqlite'), driver:sqlite3.Database});
  const admins=[
    {email:'codingwithsalman11@gmail.com', pass:'admin01', fullName:'Salman - Nexus Admin 01', role:'Admin'},
    {email:'mehedirohan2002@gmail.com', pass:'admin02', fullName:'Mehedi Rohan - Nexus Admin 02', role:'Admin'},
    {email:'mehedihasanrohan2002@gmail.com', pass:'admin03', fullName:'Mehedi Hasan Rohan - Nexus Admin 03', role:'Admin'},
    {email:'codingwithsifat@gmail.com', pass:'admin04', fullName:'Sifat - Nexus Admin 04', role:'Admin'},
  ];
  for(const a of admins){
    const existing=await db.get('SELECT id FROM users WHERE email=?', [a.email.toLowerCase()]);
    const hash=await bcrypt.hash(a.pass, 12);
    if(existing){
      await db.run('UPDATE users SET password=?, role=?, isVerified=1, fullName=? WHERE id=?', [hash, a.role, a.fullName, existing.id]);
      console.log(`Updated ${a.email} -> ${a.pass} (hashed)`);
    } else {
      await db.run('INSERT INTO users (fullName, email, password, role, isVerified) VALUES (?,?,?,?,?)', [a.fullName, a.email.toLowerCase(), hash, a.role, 1]);
      console.log(`Created ${a.email} -> ${a.pass}`);
    }
  }
  // Ensure no other user is Admin unless whitelisted
  const allAdmins=await db.all(`SELECT id, email FROM users WHERE role='Admin'`);
  const whitelist=admins.map(a=>a.email.toLowerCase());
  for(const u of allAdmins){
    if(!whitelist.includes(u.email.toLowerCase())){
      // Keep System Admin? The spec says only 4 should be admin, so demote others
      // But we keep System Admin as is for demo? The spec says only 4, so we demote admin@diu.edu.bd
      // Let's demote all non-whitelisted to Student
      await db.run(`UPDATE users SET role='Student' WHERE id=?`, [u.id]);
      console.log(`Demoted ${u.email} from Admin to Student (not whitelisted)`);
    }
  }
  const final=await db.all(`SELECT id, fullName, email, role FROM users WHERE role='Admin'`);
  console.log('Final Admins:', JSON.stringify(final,null,2));
  process.exit(0);
})();
