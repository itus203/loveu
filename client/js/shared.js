// =============================================
// DIU NEXUS — SHARED NAVBAR & AI ASSISTANT
// =============================================
(function () {
 const API = (typeof window.API !== 'undefined' ? window.API : (function(){ var p=window.location.protocol,h=window.location.hostname,po=window.location.port; if(p==='file:') return 'http://localhost:5000/api'; if(h==='localhost'||h==='127.0.0.1'||h===''){ if(po==='5000') return window.location.origin+'/api'; if(!po) return window.location.origin.indexOf('5000')!==-1?window.location.origin+'/api':'http://localhost:5000/api'; return 'http://localhost:5000/api'; } return window.location.origin+'/api'; })());
 const token = localStorage.getItem('token');
 const user = JSON.parse(localStorage.getItem('user') || 'null');
 // Fix exe button jam: retry once on 503 warming or Failed to fetch (Electron reopen race) — ONLY for GET, never POST (prevents 1 upload -> 2 stories)
 (function(){
 const _f=window.fetch.bind(window);
 window.fetch=async(url,opts)=>{
 const method = (opts && opts.method) ? opts.method.toUpperCase() : 'GET';
 const isSafeRetry = method === 'GET' || method === 'HEAD';
 for(let a=0;a<2;a++){
 try{
 const r=await _f(url,opts);
 if(r.status===503 && a===0 && isSafeRetry){
 const j=await r.clone().json().catch(()=>({}));
 if(j.retry){ await new Promise(res=>setTimeout(res,850)); continue; }
 }
 return r;
 }catch(e){
 if(a===0 && isSafeRetry && String(e.message||'').includes('Failed to fetch')){
 await new Promise(res=>setTimeout(res,800)); continue;
 }
 throw e;
 }
 }
 };
 })();
// Fix double prefix for any img src that was built as https://diunexus.onrender.comhttps://res.cloudinary...
  (function(){
    const fix = () => {
      document.querySelectorAll('img[src*="https://diunexus"], img[src*="httphttp"]').forEach(img=>{
        let src = img.getAttribute('src') || img.src;
        if(src && src.includes('https://res.cloudinary')){
          const idx = src.indexOf('https://res.cloudinary');
          if(idx>0) {
            const fixed = src.slice(idx);
            if(img.src !== fixed) img.src = fixed;
            if(img.getAttribute('src') !== fixed) img.setAttribute('src', fixed);
          }
        }
      });
    };
    // Run on load and on DOM changes
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ()=>setTimeout(fix, 500));
    else setTimeout(fix, 500);
    // Also observe future img adds
    try {
      const obs = new MutationObserver(()=>fix());
      obs.observe(document.documentElement, {childList:true, subtree:true});
    } catch {}
  })();


 // Build shared navbar automatically — skip on home.html where native navbar exists (fixes double-navbar blocking notif button)
 function buildNavbar() {
 if (document.getElementById('diu-shared-navbar')) return;
 // FB-like: home.html has its own premium navbar with #notifBtn, don't overlay shared navbar there
 if (document.getElementById('notifBtn') || (document.querySelector('nav.navbar') && window.location.pathname.includes('home.html'))) return;

 const isViewsDir = window.location.pathname.includes('/views/');
 const BASE = isViewsDir ? '..' : '.';

 const navLinks = [
 { href: `${BASE}/home.html`, icon: 'fa-home', label: 'Home' },
 { href: `${BASE}/views/messenger.html`, icon: 'fa-comment', label: 'Chat' },
 { href: `${BASE}/views/groups.html`, icon: 'fa-users', label: 'Groups' },
 { href: `${BASE}/views/reels.html`, icon: 'fa-film', label: 'Reels' },
 { href: `${BASE}/views/events.html`, icon: 'fa-calendar-alt', label: 'Events' },
 ];

 const linksHtml = navLinks.map(l => {
 const isActive = window.location.pathname.endsWith(l.href.replace(/^\.\.?\//, ''));
 return `
 <a href="${l.href}" class="nav-link ${isActive ? 'active' : ''}" title="${l.label}">
 <i class="fas ${l.icon}"></i>
 </a>`;
 }).join('');

 // EXTRA MENU ITEMS
 const menuItems = [
 { href: `${BASE}/views/profile.html`, icon: 'fa-user-circle', label: 'My Profile', color: '#0866ff' },
 { href: `${BASE}/views/live.html`, icon: 'fa-broadcast-tower', label: 'Campus Live Studio', color: '#e41e3f' },
 { href: `${BASE}/views/alumni.html`, icon: 'fa-graduation-cap', label: 'Alumni Network', color: '#7c3aed' },
 { href: `${BASE}/views/pages.html`, icon: 'fa-flag', label: 'Official Pages', color: '#0866ff' },
 { href: `${BASE}/views/class-routine.html`, icon: 'fa-calendar-week', label: 'Class Routine', color: '#059669' },
 { href: `${BASE}/views/campus-map.html`, icon: 'fa-map-marked-alt', label: 'Campus Map & Rooms', color: '#0284c7' },
 { href: `${BASE}/views/blood-donation.html`, icon: 'fa-heartbeat', label: 'Blood Donation', color: '#e41e3f' },
 { href: `${BASE}/views/home-portal.html`, icon: 'fa-home', label: 'Housing & Accommodation', color: '#10b981' },
 { href: `${BASE}/views/food-portal.html`, icon: 'fa-utensils', label: 'Campus Dining', color: '#f97316' },
 { href: `${BASE}/views/rideshare.html`, icon: 'fa-car-side', label: 'RideShare & Carpool', color: '#059669' },
 { href: `${BASE}/views/question-bank.html`, icon: 'fa-file-invoice', label: 'Question Bank', color: '#3b82f6' },
 { href: `${BASE}/views/clubs.html`, icon: 'fa-users-cog', label: 'Clubs & Hackathons', color: '#ec4899' },
 { href: `${BASE}/views/polls.html`, icon: 'fa-poll-h', label: 'Campus Polls', color: '#6366f1' },
 { href: `${BASE}/views/study-room.html`, icon: 'fa-brain', label: 'Focus Study Room', color: '#8b5cf6' },
 { href: `${BASE}/views/internships.html`, icon: 'fa-briefcase', label: 'Internships & Jobs', color: '#2563eb' },
 { href: `${BASE}/views/tuition-calc.html`, icon: 'fa-calculator', label: 'Tuition & Waiver Calculator', color: '#14b8a6' },
 { href: `${BASE}/views/tutoring.html`, icon: 'fa-chalkboard-teacher', label: 'Peer Tutoring', color: '#f59e0b' },
 { href: `${BASE}/views/cgpa.html`, icon: 'fa-calculator', label: 'GPA Calculator', color: '#0866ff' },
 { href: `${BASE}/views/resources.html`, icon: 'fa-book-open', label: 'Academic Resources', color: '#0866ff' },
 { href: `${BASE}/views/diu-portal.html`, icon: 'fa-university', label: 'Academic Portal', color: '#0866ff' },
 { href: `${BASE}/views/lostfound.html`, icon: 'fa-search-location', label: 'Lost & Found', color: '#f97316' },
 { href: `${BASE}/views/marketplace.html`, icon: 'fa-store', label: 'Student Marketplace', color: '#0866ff' },
 { href: `${BASE}/views/confession.html`, icon: 'fa-mask', label: 'Campus Confessions', color: '#0866ff' },
 { href: `${BASE}/views/busschedule.html`, icon: 'fa-bus', label: 'Bus Schedule', color: '#059669' },
 ...(user?.role === 'Admin' ? [{ href: `${BASE}/views/admin.html`, icon: 'fa-shield-alt', label: 'Admin Dashboard', color: '#e41e3f' }] : []),
 { href: `${BASE}/views/settings.html`, icon: 'fa-cog', label: 'Settings', color: '#65676b' },
 ];

 const menuHtml = menuItems.map(m =>
 `<a href="${m.href}" style="display:flex;align-items:center;gap:12px;padding:9px 16px;color:var(--text,#1c1e21);text-decoration:none;font-size:0.86rem;font-weight:600;transition:background 0.1s;" onmouseover="this.style.background='rgba(0,0,0,0.05)'" onmouseout="this.style.background='none'">
 <div style="width:32px;height:32px;border-radius:50%;background:#e7f0ff;color:${m.color};display:flex;align-items:center;justify-content:center;font-size:0.9rem;flex-shrink:0;"><i class="fas ${m.icon}"></i></div>
 ${m.label}
 </a>`
 ).join('');

 const navbarHtml = `
 <style>
 #diu-shared-navbar *{box-sizing:border-box;margin:0;padding:0;}
 #diu-shared-navbar{position:fixed;top:0;left:0;right:0;height:56px;background:var(--surface,#fff);border-bottom:1px solid var(--border,#e4e6eb);display:flex;align-items:center;padding:0 16px;z-index:2000;box-shadow:0 1px 4px rgba(0,0,0,0.06);justify-content:space-between;}
 [data-theme=dark] #diu-shared-navbar{background:#242526;border-color:#3a3b3c;}
 #diu-shared-navbar .brand{font-size:1.35rem;font-weight:800;color:#0866ff;text-decoration:none;letter-spacing:-0.5px;white-space:nowrap;margin-right:12px;display:flex;align-items:center;gap:6px;flex-shrink:0;overflow:visible;}
 #diu-shared-navbar .nav-left{display:flex;align-items:center;gap:10px;}
 #diu-shared-navbar .search-wrap{position:relative;flex:1 1 180px;min-width:160px;max-width:320px;margin-right:12px;}
 @media(max-width:900px){#diu-shared-navbar .search-wrap{max-width:220px;min-width:140px;}}
 @media(max-width:700px){#diu-shared-navbar .search-wrap{max-width:180px;min-width:120px;}}
 #diu-shared-navbar .search-input{width:100%;padding:8px 12px 8px 34px;border-radius:20px;border:none;background:var(--bg,#f0f2f5);color:var(--text,#1c1e21);font-size:0.85rem;outline:none;font-family:inherit;}
 #diu-shared-navbar .search-icon{position:absolute;left:11px;top:50%;transform:translateY(-50%);color:#65676b;font-size:0.85rem;}
 #diu-shared-navbar .nav-center{display:flex;flex:1;max-width:540px;height:100%;justify-content:space-around;align-items:center;margin:0 auto;}
 #diu-shared-navbar .nav-link{flex:1;height:48px;display:flex;align-items:center;justify-content:center;color:var(--text-secondary,#65676b);font-size:1.25rem;text-decoration:none;border-radius:10px;position:relative;transition:all 0.15s ease;margin:0 2px;}
 #diu-shared-navbar .nav-link:hover{background:var(--bg,#f0f2f5);color:#0866ff;}
 #diu-shared-navbar .nav-link.active{color:#0866ff;}
 #diu-shared-navbar .nav-link.active::after{content:'';position:absolute;bottom:0;left:10%;right:10%;height:3px;background:#0866ff;border-radius:4px 4px 0 0;}
 #diu-shared-navbar .nav-right{display:flex;align-items:center;gap:8px;}
 #diu-shared-navbar .icon-btn{width:40px;height:40px;border-radius:50%;border:none;background:var(--bg,#e4e6eb);color:var(--text,#1c1e21);font-size:1rem;display:flex;align-items:center;justify-content:center;cursor:pointer;position:relative;transition:background 0.15s;text-decoration:none;}
 #diu-shared-navbar .icon-btn:hover{background:#d8dadf;}
 [data-theme=dark] #diu-shared-navbar .icon-btn{background:#3a3b3c;color:#e4e6eb;}
 #diu-shared-navbar .badge{position:absolute;top:2px;right:2px;background:#e41e3f;color:white;font-size:0.65rem;font-weight:700;min-width:18px;height:18px;border-radius:999px;display:flex;align-items:center;justify-content:center;padding:0 4px;border:2px solid var(--surface,#fff);display:none;}
 #diu-shared-navbar .avatar-btn{width:40px;height:40px;border-radius:50%;border:2px solid #0866ff;background:linear-gradient(135deg,#0866ff,#0550c1);color:white;font-size:0.85rem;font-weight:800;display:flex;align-items:center;justify-content:center;cursor:pointer;overflow:hidden;font-family:inherit;}
 #shared-user-menu{display:none;position:fixed;top:62px;right:12px;background:var(--surface,#fff);border:1px solid var(--border,#e4e6eb);border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.15);min-width:280px;max-height:85vh;overflow-y:auto;z-index:3000;}
 [data-theme=dark] #shared-user-menu{background:#242526;border-color:#3a3b3c;}
 #shared-user-menu hr{border:none;border-top:1px solid var(--border,#e4e6eb);margin:4px 0;}
 @media(max-width:768px){#diu-shared-navbar .search-wrap{display:none;}#diu-shared-navbar .nav-center{max-width:320px;}}
 @media(max-width:500px){#diu-shared-navbar .nav-center{display:none;}}
 /* FB-like Notification Panel — always on top, clickable */
 #shared-notif-panel{ display:none; position:fixed; top:62px; right:12px; width:380px; max-width:calc(100vw - 24px); max-height:70vh; background:var(--surface,#fff); border:1px solid var(--border,#e4e6eb); border-radius:12px; box-shadow:0 8px 32px rgba(0,0,0,0.15); z-index:3002; overflow:hidden; flex-direction:column; }
 #shared-notif-panel.show{ display:flex; }
 #shared-notif-panel .notif-hdr{ display:flex; align-items:center; justify-content:space-between; padding:12px 16px; border-bottom:1px solid var(--border,#e4e6eb); font-weight:700; }
 #shared-notif-panel .notif-list{ flex:1; overflow-y:auto; max-height:60vh; }
 #shared-notif-panel .notif-item{ display:flex; gap:10px; padding:12px 16px; border-bottom:1px solid var(--border,#f0f2f5); cursor:pointer; }
 #shared-notif-panel .notif-item:hover{ background:var(--bg,#f0f2f5); }
 #shared-notif-panel .notif-item.unread{ background:#e7f0ff; }
 
 /* Nexus AI — Full Nexus Local, powered by Nexus Local */
 #nexus-ai-btn {
 position: fixed; bottom: 84px; right: 20px;
 width: 56px; height: 56px; border-radius: 50%;
 background: linear-gradient(135deg,#070D1E,#0a162e); border:1.5px solid #22D3FF;
 display: flex; align-items: center; justify-content: center;
 cursor: pointer; box-shadow: 0 8px 32px rgba(34,211,255,0.45), 0 4px 12px rgba(0,0,0,0.2);
 z-index: 2500; transition: transform 0.2s cubic-bezier(0.34,1.56,0.64,1);
 overflow: hidden; padding: 0;
 }
 #nexus-ai-btn:hover { transform: scale(1.08) rotate(3deg); }
 #nexus-ai-btn img { width:100%; height:100%; object-fit:cover; }
 #nexus-ai-modal {
 display: none; position: fixed; bottom: 90px; right: 20px;
 width: 420px; max-width: calc(100vw - 16px); height: 620px; max-height: calc(100vh - 100px);
 background: var(--surface, #fff); border: 1px solid var(--border, #e4e6eb);
 border-radius: 16px; box-shadow: 0 16px 48px rgba(0,0,0,0.22), 0 2px 8px rgba(0,0,0,0.12);
 z-index: 2501; flex-direction: column; overflow: hidden;
 }
 @media(max-width:480px){ #nexus-ai-modal{ right:8px; left:8px; width:auto; bottom:70px; height: calc(100vh - 80px); } }
 [data-theme=dark] #nexus-ai-modal { background: #1e1f22; border-color: #3a3b3c; }
 .ai-hdr {
 background: linear-gradient(135deg, #070D1E 0%, #0a162e 50%, #0f2450 100%); padding: 12px 14px;
 color: white; display: flex; align-items: center; justify-content: space-between; flex-shrink:0;
 border-bottom: 1px solid rgba(255,255,255,0.08);
 }
 .ai-hdr-left { display:flex; align-items:center; gap:10px; }
 .ai-hdr-logo { width:32px; height:32px; border-radius:8px; background:#070D1E; padding:2px; border:1px solid rgba(34,211,255,0.3); }
 .ai-hdr-title { font-weight:800; font-size:0.92rem; display:flex; align-items:center; gap:6px; }
 .ai-hdr-sub { font-size:0.68rem; opacity:0.8; margin-top:1px; }
 .ai-hdr-badge { background:#22D3FF; color:#070D1E; padding:1px 6px; border-radius:10px; font-size:0.58rem; font-weight:800; }
 .ai-hdr-actions { display:flex; gap:6px; align-items:center; }
 .ai-hdr-btn { background:rgba(255,255,255,0.12); border:none; color:white; width:30px; height:30px; border-radius:50%; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:0.85rem; }
 .ai-hdr-btn:hover{ background:rgba(255,255,255,0.2); }
 .ai-body { flex: 1; padding: 14px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; font-size: 0.88rem; background: #f8f9fa; scrollbar-width: thin; }
 [data-theme=dark] .ai-body { background: #141516; }
 .ai-body::-webkit-scrollbar{ width:5px; } .ai-body::-webkit-scrollbar-thumb{ background:#ccc; border-radius:4px; }
 .ai-msg-wrap { display:flex; gap:8px; max-width: 92%; }
 .ai-msg-wrap.user { align-self: flex-end; flex-direction: row-reverse; }
 .ai-msg-wrap.bot { align-self: flex-start; }
 .ai-avatar { width:28px; height:28px; border-radius:50%; flex-shrink:0; display:flex; align-items:center; justify-content:center; font-size:0.75rem; font-weight:700; }
 .ai-avatar.user { background: #0866ff; color:white; }
 .ai-avatar.bot { background: linear-gradient(135deg,#070D1E,#0a162e); color:#22D3FF; border:1px solid #22D3FF; padding:2px; }
 .ai-msg { padding:10px 13px; border-radius:14px; line-height:1.5; word-break:break-word; font-size:0.86rem; position:relative; }
 .ai-msg.user { background: #0866ff; color: white; border-bottom-right-radius:4px; }
 .ai-msg.bot { background: var(--surface,#fff); color: var(--text,#1c1e21); border:1px solid var(--border,#e4e6eb); border-bottom-left-radius:4px; box-shadow:0 1px 3px rgba(0,0,0,0.06); }
 [data-theme=dark] .ai-msg.bot { background:#242526; border-color:#3a3b3c; }
 .ai-msg.bot pre { background:#0a0e1a; color:#e6e8eb; padding:10px; border-radius:8px; overflow-x:auto; font-size:0.82rem; margin:8px 0; position:relative; border:1px solid #1e293b; }
 .ai-msg.bot code:not(pre code){ background:#e7f0ff; color:#0a66ff; padding:1px 5px; border-radius:4px; font-size:0.82rem; font-family:ui-monospace, monospace; }
 [data-theme=dark] .ai-msg.bot code:not(pre code){ background:#2a3441; color:#7fb3ff; }
 .ai-code-copy { position:absolute; top:6px; right:6px; background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.15); color:#cbd5e1; padding:3px 7px; border-radius:6px; font-size:0.68rem; cursor:pointer; }
 .ai-code-copy:hover{ background:rgba(255,255,255,0.2); color:white; }
 .ai-msg.bot ul, .ai-msg.bot ol { margin:6px 0 6px 18px; }
 .ai-msg.bot strong{ font-weight:800; }
 .ai-msg.bot a{ color:#0866ff; text-decoration:none; }
 .ai-msg.bot a:hover{ text-decoration:underline; }
 .ai-thinking { display:flex; align-items:center; gap:8px; padding:8px 12px; font-size:0.82rem; color:var(--text-secondary,#65676b); }
 .ai-thinking span{ width:6px; height:6px; background:#0866ff; border-radius:50%; animation: aiPulse 1.4s infinite; }
 .ai-thinking span:nth-child(2){ animation-delay:0.2s; } .ai-thinking span:nth-child(3){ animation-delay:0.4s; }
 @keyframes aiPulse { 0%,80%,100%{ opacity:0.3; transform:scale(0.8);} 40%{ opacity:1; transform:scale(1);} }
 .ai-chip-row { display:flex; gap:6px; overflow-x:auto; padding:8px 10px; background: var(--surface,#fff); border-top:1px solid var(--border,#e4e6eb); scrollbar-width:none; flex-shrink:0; }
 .ai-chip-row::-webkit-scrollbar{display:none;}
 .ai-chip { padding:6px 12px; border-radius:20px; border:1px solid var(--border,#e4e6eb); background:var(--bg,#f0f2f5); color:var(--text,#1c1e21); font-size:0.75rem; font-weight:600; cursor:pointer; white-space:nowrap; display:flex; align-items:center; gap:5px; flex-shrink:0; }
 .ai-chip:hover{ background:#e7f0ff; border-color:#0866ff; color:#0866ff; }
 .ai-ftr { padding:10px; border-top:1px solid var(--border,#e4e6eb); display:flex; gap:8px; align-items:flex-end; background:var(--surface,#fff); flex-shrink:0; }
 .ai-inp { flex:1; min-height:42px; max-height:110px; padding:10px 14px; border:1.5px solid var(--border,#e4e6eb); border-radius:18px; font-family:inherit; font-size:0.88rem; outline:none; background:var(--bg,#f0f2f5); color:var(--text,#1c1e21); resize:none; line-height:1.4; }
 .ai-inp:focus{ border-color:#0866ff; background:var(--surface,#fff); }
 .ai-send { background:#0866ff; color:white; border:none; border-radius:50%; width:42px; height:42px; cursor:pointer; flex-shrink:0; display:flex; align-items:center; justify-content:center; font-size:1rem; transition:transform 0.15s; }
 .ai-send:hover{ background:#0550c1; transform:scale(1.05); }
 .ai-send:disabled{ opacity:0.5; cursor:not-allowed; transform:none; }
 .ai-footer-hint { font-size:0.62rem; color:var(--text-secondary,#65676b); text-align:center; padding:4px 10px 6px; background:var(--bg,#f8f9fa); border-top:1px solid var(--border,#e4e6eb); }
 </style>

 <header id="diu-shared-navbar">
 <a href="${BASE}/home.html" class="brand" style="display:flex;align-items:center;gap:8px;">
 <img src="${BASE}/assets/icon.svg" alt="NEXUS" style="width:30px;height:30px;filter:drop-shadow(0 2px 6px rgba(10,108,255,0.35));" onerror="this.src='${BASE}/assets/icon.png'">
 <span style="font-weight:800;letter-spacing:1px;background:linear-gradient(90deg,#22D3FF,#0A6CFF);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">NEXUS</span>
 </a>
 <div class="search-wrap">
 <i class="fas fa-search search-icon"></i>
 <input class="search-input" placeholder="Search DIU..." onkeydown="if(event.key==='Enter')window.location.href='${BASE}/views/search.html?q='+encodeURIComponent(this.value)">
 </div>
 <nav class="nav-center">${linksHtml}</nav>
 <div class="nav-right">
 <button class="icon-btn" id="shared-notif-btn" onclick="toggleSharedNotifPanel(event)" title="Notifications" style="position:relative;z-index:3001;">
 <i class="fas fa-bell" style="pointer-events:none;"></i>
 <span class="badge" id="shared-notif-badge">0</span>
 </button>
 <button class="avatar-btn" id="shared-avatar-btn" onclick="toggleUserMenu()">
 ${user?.profilePicture ? `<img src="${(window.API_BASE || (function(){var p=window.location.protocol,h=window.location.hostname,po=window.location.port; if(p==='file:') return 'http://localhost:5000'; if(h==='localhost'||h==='127.0.0.1'||h===''){ if(po==='5000') return window.location.origin; if(!po) return window.location.origin.indexOf('5000')!==-1?window.location.origin:'http://localhost:5000'; return 'http://localhost:5000'; } return window.location.origin; })())}${user.profilePicture}" style="width:100%;height:100%;object-fit:cover;">` : (user?.fullName || '?')[0].toUpperCase()}
 </button>
 </div>
 </header>

 <div id="shared-user-menu">
 <div style="padding:14px 16px;border-bottom:1px solid var(--border,#e4e6eb);cursor:pointer;" onclick="window.location.href='${BASE}/views/profile.html'">
 <div style="font-weight:700;font-size:0.95rem;color:var(--text,#1c1e21);">${user?.fullName || 'User'}</div>
 <div style="font-size:0.78rem;color:var(--text-secondary,#65676b);">${user?.department || 'Daffodil International University'}</div>
 </div>
 <div style="padding:4px 0;">${menuHtml}</div>
 <div style="border-top:1px solid var(--border,#e4e6eb);padding:6px 8px;">
 <button onclick="localStorage.clear();window.location.href='${BASE}/index.html'" style="width:100%;padding:8px 12px;background:#fee2e2;border:none;border-radius:8px;color:#e41e3f;font-family:inherit;font-size:0.85rem;font-weight:700;cursor:pointer;">
 <i class="fas fa-sign-out-alt"></i> Log Out
 </button>
 </div>
 </div>

 <!-- FB-like Notification Dropdown Panel (shared, works on every view) -->
 <div id="shared-notif-panel">
 <div class="notif-hdr">
 <span>Notifications</span>
 <button onclick="markAllSharedRead()" style="background:none;border:none;color:#0866ff;font-size:0.78rem;font-weight:700;cursor:pointer;font-family:inherit;">Mark all as read</button>
 </div>
 <div class="notif-list" id="shared-notif-list"><div style="padding:24px;text-align:center;color:#65676b;font-size:0.85rem;"><i class="fas fa-spinner fa-spin"></i> Loading...</div></div>
 <a href="${BASE}/views/notifications.html" style="display:block;text-align:center;padding:10px;color:#0866ff;font-size:0.82rem;font-weight:700;text-decoration:none;border-top:1px solid var(--border,#e4e6eb);">See all notifications</a>
 </div>

 <!-- Nexus AI — Full Nexus Local, powered by Nexus Local (display: Nexus AI, engine: Nexus Local) -->
 <button id="nexus-ai-btn" onclick="toggleAIChat()" title="Nexus AI — powered by Nexus Local, ">
 <img src="${BASE}/assets/icon.svg" alt="NEXUS" onerror="this.outerHTML='🤖'">
 </button>
 <div id="nexus-ai-modal">
 <div class="ai-hdr">
 <div class="ai-hdr-left">
 <img src="${BASE}/assets/icon.svg" alt="NEXUS" class="ai-hdr-logo" onerror="this.style.display='none'">
 <div>
 <div class="ai-hdr-title">Nexus AI <span class="ai-hdr-badge">FREE</span> <span style="background:rgba(34,211,255,0.2);border:1px solid #22D3FF;color:#22D3FF;padding:1px 6px;border-radius:10px;font-size:0.58rem;font-weight:700;">Nexus Local</span></div>
 <div class="ai-hdr-sub">Nexus Local • answers anything — Nexus Local inside</div>
 </div>
 </div>
 <div class="ai-hdr-actions">
 <button class="ai-hdr-btn" onclick="clearAIChat()" title="New chat"><i class="fas fa-plus"></i></button>
 <button class="ai-hdr-btn" onclick="toggleAIChat()" title="Close">&times;</button>
 </div>
 </div>
 <div class="ai-body" id="aiMsgContainer">
 <div class="ai-msg-wrap bot"><div class="ai-avatar bot"><img src="${BASE}/assets/icon.svg" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.textContent='N'"></div><div class="ai-msg bot">👋 Hello ${user?.fullName ? user.fullName.split(' ')[0] : 'Student'}! I'm <b>Nexus AI</b> — display <b>Nexus AI</b>, engine <b>Nexus Local</b> (1M context). I answer anything — studies, code, campus, Bangla/English. Try "ccode", "Explain recursion", "Bus time?"</div></div>
 </div>
 <div class="ai-chip-row">
 <button class="ai-chip" onclick="askAIChip('ccode')"> C code</button>
 <button class="ai-chip" onclick="askAIChip('Explain recursion in Bangla')">🧬 Bangla explain</button>
 <button class="ai-chip" onclick="askAIChip('Write Python code for prime check')">🐍 Python</button>
 <button class="ai-chip" onclick="askAIChip('Bus schedule Uttara to DSC')">🚌 Bus</button>
 <button class="ai-chip" onclick="askAIChip('Translate this to English')">🌐 Translate</button>
 </div>
 <div class="ai-ftr">
 <textarea class="ai-inp" id="aiInput" placeholder="Ask Nexus AI anything..." rows="1" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendAIMessage();}" oninput="this.style.height='auto';this.style.height=Math.min(this.scrollHeight,110)+'px'"></textarea>
 <button class="ai-send" id="aiSendBtn" onclick="sendAIMessage()" title="Send (Enter)"><i class="fas fa-paper-plane" style="font-size:0.85rem;"></i></button>
 </div>
 <div class="ai-footer-hint">Nexus AI • display: Nexus AI • engine: Nexus Local • • may make mistakes — verify important info</div>
 </div>`;

 document.body.insertAdjacentHTML('afterbegin', navbarHtml);
 // Admin — professional, no GOD/bar
 try{
 if(user && user.role==='Admin'){
 document.body.classList.add('is-admin');
 setTimeout(()=>{
 const brand=document.querySelector('#diu-shared-navbar .brand');
 if(brand && !document.getElementById('sharedAdminBadge')){
 const b=document.createElement('span');
 b.id='sharedAdminBadge';
 b.style.cssText='background:#0A6CFF;color:white;font-size:0.6rem;font-weight:700;padding:3px 8px;border-radius:6px;margin-left:8px;white-space:nowrap;flex-shrink:0;z-index:2;position:relative;';
 b.textContent='Admin';
 brand.appendChild(b);
 }
 const oldBar=document.getElementById('sharedAdminBar'); if(oldBar) oldBar.remove();
 const nav=document.getElementById('diu-shared-navbar'); if(nav) nav.style.top='';
 document.body.style.paddingTop='';
 }, 100);
 }
 }catch{}
 loadNotifCount();
 initSharedSocket();
 requestSharedNotifPermission();

 // Close menus on outside click — FB-like always-close
 document.addEventListener('click', e => {
 const menu = document.getElementById('shared-user-menu');
 const btn = document.getElementById('shared-avatar-btn');
 if (menu && !menu.contains(e.target) && e.target !== btn && !btn?.contains(e.target)) {
 menu.style.display = 'none';
 }
 const np = document.getElementById('shared-notif-panel');
 const nb = document.getElementById('shared-notif-btn');
 if (np && np.classList.contains('show') && !np.contains(e.target) && e.target !== nb && !nb?.contains(e.target)) {
 np.classList.remove('show');
 }
 });
 // Also handle home's panel if exists (for shared pages that also load home.js)
 document.addEventListener('click', e => {
 const hp = document.getElementById('notifPanel');
 const hb = document.getElementById('notifBtn');
 if (hp && hp.classList.contains('show') && !hp.contains(e.target) && e.target !== hb && !hb?.contains(e.target)) {
 hp.classList.remove('show');
 }
 });
 }

 window.toggleUserMenu = function () {
 const m = document.getElementById('shared-user-menu');
 if (m) m.style.display = m.style.display === 'block' ? 'none' : 'block';
 };

 // ——— Nexus AI Full Nexus Local — powered by Nexus Local ———
 window.nexusAIHistory = JSON.parse(localStorage.getItem('nexus_ai_history')||'[]');
 function saveAIHistory(){ try{ localStorage.setItem('nexus_ai_history', JSON.stringify(window.nexusAIHistory.slice(-20))); }catch{} }
 window.toggleAIChat = function() {
 const m = document.getElementById('nexus-ai-modal');
 if (!m) return;
 const isOpen = m.style.display === 'flex';
 m.style.display = isOpen ? 'none' : 'flex';
 if(!isOpen){
 setTimeout(()=>{ const inp=document.getElementById('aiInput'); if(inp) inp.focus(); const box=document.getElementById('aiMsgContainer'); if(box) box.scrollTop=box.scrollHeight; },80);
 // Load history if exists
 if(window.nexusAIHistory.length>0){
 const box=document.getElementById('aiMsgContainer');
 if(box && box.children.length<=1){
 box.innerHTML='';
 window.nexusAIHistory.forEach(h=>{
 if(h.role==='user') box.innerHTML+=`<div class="ai-msg-wrap user"><div class="ai-avatar user">${(user?.fullName||'U')[0].toUpperCase()}</div><div class="ai-msg user">${escHtml(h.content)}</div></div>`;
 else box.innerHTML+=`<div class="ai-msg-wrap bot"><div class="ai-avatar bot"><img src="${(window.API_BASE||window.location.origin)}/assets/icon.svg" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.textContent='N'"></div><div class="ai-msg bot">${renderAIMarkdown(h.content)}<div style="margin-top:6px;font-size:0.62rem;opacity:0.5;">Nexus AI • Nexus Local • Nexus Local</div></div></div>`;
 });
 }
 }
 }
 };
 window.clearAIChat = function(){
 window.nexusAIHistory=[];
 saveAIHistory();
 const box=document.getElementById('aiMsgContainer');
 if(box) box.innerHTML=`<div class="ai-msg-wrap bot"><div class="ai-avatar bot"><img src="${(window.API_BASE||window.location.origin)}/assets/icon.svg" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.textContent='N'"></div><div class="ai-msg bot">🧹 New chat started! I'm <b>Nexus AI</b> — powered by <b>Nexus Local</b>. Ask me anything </div></div>`;
 };
 window.askAIChip = function(q) {
 const inp=document.getElementById('aiInput');
 if(inp){ inp.value=q; inp.style.height='auto'; inp.focus(); }
 window.sendAIMessage();
 };
 function escHtml(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
 function renderAIMarkdown(md){
 let html=escHtml(String(md||''));
 // Code blocks ```lang\n code ```
 html=html.replace(/```(\w+)?\n?([\s\S]*?)```/g, (m,lang,code)=>{
 const id='code-'+Math.random().toString(36).slice(2,7);
 const safeLang=(lang||'').trim();
 return `<pre><button class="ai-code-copy" onclick="copyAICode('${id}')"><i class='fas fa-copy'></i> Copy</button><code id="${id}" class="language-${safeLang}">${code.replace(/</g,'&lt;')}</code></pre>`;
 });
 // Inline code `code`
 html=html.replace(/`([^`]+)`/g, '<code>$1</code>');
 // Bold **text**
 html=html.replace(/\*\*([^\*]+)\*\*/g, '<strong>$1</strong>');
 // Italic *text* (avoid **)
 html=html.replace(/(?<!\*)\*([^\*\n]+)\*(?!\*)/g, '<em>$1</em>');
 // Links
 html=html.replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
 // Line breaks
 html=html.replace(/\n/g,'<br>');
 // Simple lists
 html=html.replace(/•/g,'•');
 return html;
 }
 window.copyAICode=function(id){
 const el=document.getElementById(id);
 if(!el) return;
 const txt=el.textContent;
 navigator.clipboard.writeText(txt).then(()=>{
 const btn=el.parentElement.querySelector('.ai-code-copy');
 if(btn){ const o=btn.innerHTML; btn.innerHTML="<i class='fas fa-check'></i> Copied"; setTimeout(()=>btn.innerHTML=o,1200); }
 });
 };
 window.sendAIMessage = async function() {
 const inp = document.getElementById('aiInput');
 const text = inp.value.trim();
 if (!text) return;
 const box = document.getElementById('aiMsgContainer');
 // User bubble
 box.innerHTML += `<div class="ai-msg-wrap user"><div class="ai-avatar user">${(user?.fullName||'U')[0].toUpperCase()}</div><div class="ai-msg user">${escHtml(text)}</div></div>`;
 window.nexusAIHistory.push({role:'user', content:text});
 saveAIHistory();
 inp.value = ''; inp.style.height='auto';
 box.scrollTop = box.scrollHeight;
 const typingId='ai-typing-'+Date.now();
 box.innerHTML += `<div id="${typingId}" class="ai-msg-wrap bot"><div class="ai-avatar bot"><img src="${(window.API_BASE||window.location.origin)}/assets/icon.svg" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.textContent='N'"></div><div class="ai-msg bot"><div class="ai-thinking"><span></span><span></span><span></span> Nexus AI • Nexus Local thinking...</div></div></div>`;
 box.scrollTop = box.scrollHeight;
 const sendBtn=document.getElementById('aiSendBtn');
 if(sendBtn) sendBtn.disabled=true;
 try{
 const token=localStorage.getItem('token');
 const base=(window.API|| (window.API_BASE? window.API_BASE+'/api' : (window.location.protocol==='file:'?'http://localhost:5000/api':window.location.origin+'/api')));
 // Send history for context (last 8)
 const history=window.nexusAIHistory.slice(-10,-1);
 const r=await fetch(base+'/ai/process', {method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`}, body:JSON.stringify({text, action:'chat', history})});
 const data=await r.json().catch(()=>({}));
 let reply=data.result || "🤖 Nexus AI — ask me anything! Powered by Nexus Local";
 const modelInfo = data.model ? `<div style="margin-top:6px;font-size:0.62rem;opacity:0.5;">Nexus AI • ${escHtml(data.engine||'Nexus Local')} • ${escHtml(data.model)} • Nexus Local</div>` : `<div style="margin-top:6px;font-size:0.62rem;opacity:0.5;">Nexus AI • Nexus Local • Nexus Local</div>`;
 document.getElementById(typingId)?.remove();
 // Render markdown
 const html=renderAIMarkdown(reply);
 box.innerHTML += `<div class="ai-msg-wrap bot"><div class="ai-avatar bot"><img src="${(window.API_BASE||window.location.origin)}/assets/icon.svg" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.textContent='N'"></div><div class="ai-msg bot">${html}${modelInfo}</div></div>`;
 window.nexusAIHistory.push({role:'assistant', content:reply});
 saveAIHistory();
 }catch(e){
 document.getElementById(typingId)?.remove();
 const fallback = `⚠️ Nexus AI is offline (Nexus Local check your API key). But I can still help locally!\n\n**You said:** "${text}"\n\nTry: "ccode", "Explain recursion in Bangla", "Write Python prime check"`;
 box.innerHTML += `<div class="ai-msg-wrap bot"><div class="ai-avatar bot">N</div><div class="ai-msg bot">${renderAIMarkdown(fallback)}</div></div>`;
 window.nexusAIHistory.push({role:'assistant', content:fallback});
 saveAIHistory();
 }
 if(sendBtn) sendBtn.disabled=false;
 box.scrollTop=box.scrollHeight;
 };

 async function loadNotifCount() {
 try {
 const res = await fetch(`${API}/notifications/unread-count`, {
 headers: { Authorization: `Bearer ${token}` }
 });
 const data = await res.json();
 const badge = document.getElementById('shared-notif-badge');
 const badge2 = document.getElementById('notifBadge');
 [badge, badge2].forEach(b=>{
 if (!b) return;
 if (data.count > 0) { b.textContent = data.count > 99 ? '99+' : data.count; b.style.display='flex'; b.classList.remove('hidden'); }
 else { b.style.display='none'; b.classList.add('hidden'); }
 });
 } catch { }
 }
 // FB-like shared notification panel — always works
 window.toggleSharedNotifPanel = async function(e){
 if(e){ e.preventDefault(); e.stopPropagation(); }
 const panel = document.getElementById('shared-notif-panel');
 const menu = document.getElementById('shared-user-menu');
 if(menu) menu.style.display='none';
 if(!panel) return;
 const willShow = !panel.classList.contains('show');
 document.querySelectorAll('#shared-notif-panel.show').forEach(p=>{ if(p!==panel) p.classList.remove('show'); });
 if(willShow){
 panel.classList.add('show');
 void panel.offsetWidth;
 await loadSharedNotifications();
 } else panel.classList.remove('show');
 };
 async function loadSharedNotifications(){
 const el = document.getElementById('shared-notif-list');
 if(!el) return;
 el.innerHTML = '<div style="padding:24px;text-align:center;color:#65676b;"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';
 try{
 const res = await fetch(`${API}/notifications`, { headers:{Authorization:`Bearer ${token}`} });
 const notifs = await res.json();
 if(!notifs.length){ el.innerHTML='<div style="padding:32px;text-align:center;color:#65676b;"><i class="fas fa-bell" style="font-size:2rem;opacity:0.2;display:block;margin-bottom:8px;"></i>No notifications yet</div>'; return; }
 el.innerHTML = notifs.slice(0,20).map(n=>{
 const safeLink=(n.link||'').replace(/'/g,"\\'");
 const safeType=(n.type||'').replace(/'/g,"\\'");
 return `
 <div class="notif-item ${n.isRead?'':'unread'}" onclick="handleSharedNotifClick('${n.id}', '${safeLink}', '${safeType}', '${n.sender_id||''}', this)" style="cursor:pointer;">
 <div style="width:36px;height:36px;border-radius:50%;background:#e7f0ff;color:#0866ff;display:flex;align-items:center;justify-content:center;font-size:0.9rem;flex-shrink:0;"><i class="fas fa-bell"></i></div>
 <div style="flex:1;min-width:0;">
 <div style="font-size:0.85rem;line-height:1.4;word-break:break-word;">${(n.message||'').replace(/&/g,'&amp;').replace(/</g,'&lt;')}</div>
 <div style="font-size:0.72rem;color:#65676b;margin-top:3px;">${n.created_at? new Date(n.created_at).toLocaleString():''}</div>
 </div>
 ${n.isRead?'':'<div style="width:8px;height:8px;background:#0866ff;border-radius:50%;flex-shrink:0;margin-top:8px;"></div>'}
 </div>`;
 }).join('');
 }catch{ el.innerHTML='<div style="padding:24px;text-align:center;color:#e41e3f;">Failed to load</div>'; }
 }
 window.markSharedNotifRead = async function(id, el){
 if(el) el.classList.remove('unread');
 try{ await fetch(`${API}/notifications/${id}/read`, {method:'PUT', headers:{Authorization:`Bearer ${token}`}});}catch{}
 loadNotifCount();
 };
 window.markAllSharedRead = async function(){
 try{ await fetch(`${API}/notifications/mark-all-read`, {method:'PUT', headers:{Authorization:`Bearer ${token}`}});}catch{}
 document.querySelectorAll('#shared-notif-panel .notif-item.unread').forEach(e=>e.classList.remove('unread'));
 loadNotifCount();
 };
 window.handleSharedNotifClick = function(id, link, type, senderId, el){
 markSharedNotifRead(id, el);
 // FB-like: admin_delete/report/ban have no post — don't navigate like FB
 if(!link && ['admin_delete','report','ban','info','suspension','warn','admin'].includes(type)){
 document.getElementById('shared-notif-panel')?.classList.remove('show');
 return;
 }
 // FB-like: link first (post/blood/housing) → exact post/day, then type fallback
 let target = link || null;
 if(!target){
 if(['comment','reaction','like','tag','mention'].includes(type)){
 target='home.html';
 } else if(senderId){
 target=`views/profile.html?id=${senderId}`;
 } else {
 document.getElementById('shared-notif-panel')?.classList.remove('show');
 return;
 }
 }
 // Normalize for views/ vs home
 if(target.startsWith('views/') && window.location.pathname.includes('/views/')) target=target.replace('views/','');
 else if(target.startsWith('home.html') && window.location.pathname.includes('/views/')) target='../'+target;
 else if(target.startsWith('../home.html') && window.location.pathname.includes('home.html')) target=target.replace('../','');
 // If already on home and target is post hash, FB-like scroll + highlight + open comments
 if(target.includes('#post-') && (window.location.pathname.includes('home.html') || window.location.pathname==='/' )){
 const hash=target.split('#')[1];
 const postId=hash.replace('post-','').split(/[&?]/)[0];
 const pe=document.getElementById(hash);
 if(pe){
 pe.scrollIntoView({behavior:'smooth', block:'center'});
 pe.style.outline='2px solid var(--blue)';
 pe.style.borderRadius='12px';
 setTimeout(()=>pe.style.outline='',2500);
 if(type==='comment'){
 const cc=document.getElementById(`comments-${postId}`);
 if(cc && !cc.classList.contains('show') && typeof toggleComments==='function') toggleComments(postId);
 }
 document.getElementById('shared-notif-panel')?.classList.remove('show');
 return;
 }
 // Not in DOM yet — let home's auto-fetch handle after navigation
 }
 document.getElementById('shared-notif-panel')?.classList.remove('show');
 setTimeout(()=> window.location.href=target, 140);
 };
 function requestSharedNotifPermission(){
 try{ if('Notification' in window && Notification.permission==='default') Notification.requestPermission(); }catch{}
 }
 function showSharedDeviceNotif(data){
 try{
 const title='DIU Nexus';
 const body=data.message||'New notification';
 const icon = ((window.API_BASE || (function(){var p=window.location.protocol,h=window.location.hostname,po=window.location.port; if(p==='file:') return 'http://localhost:5000'; if(h==='localhost'||h==='127.0.0.1'||h===''){ if(po==='5000') return window.location.origin; if(!po) return window.location.origin.indexOf('5000')!==-1?window.location.origin:'http://localhost:5000'; return 'http://localhost:5000'; } return window.location.origin; })()))+'/assets/icon.png';
 if('Notification' in window && Notification.permission==='granted'){
 const n=new Notification(title,{body, icon, badge:icon, tag:'diu-nexus'});
 n.onclick=()=>{ window.focus(); n.close(); const p=document.getElementById('shared-notif-panel'); if(p) p.classList.add('show'); loadSharedNotifications(); };
 setTimeout(()=>n.close(),6000);
 }
 try{ if(navigator.vibrate) navigator.vibrate([120,80,120]); }catch{}
 const b=document.getElementById('shared-notif-badge'); if(b){ b.style.display='flex'; b.style.animation='pulse 0.6s 2'; setTimeout(()=>b.style.animation='',1200); }
 // sound
 try{ const ctx=new (window.AudioContext||window.webkitAudioContext)(); const o=ctx.createOscillator(); const g=ctx.createGain(); o.type='sine'; o.frequency.value=880; g.gain.value=0.15; o.connect(g); g.connect(ctx.destination); o.start(); g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime+0.35); setTimeout(()=>{try{o.stop();ctx.close()}catch{}},400);}catch{}
 }catch{}
 }
 let sharedSocket=null;
 function initSharedSocket(){
 try{
 if(typeof io==='undefined') return;
 if(sharedSocket) return;
 sharedSocket=io(((window.API_BASE || (function(){var p=window.location.protocol,h=window.location.hostname,po=window.location.port; if(p==='file:') return 'http://localhost:5000'; if(h==='localhost'||h==='127.0.0.1'||h===''){ if(po==='5000') return window.location.origin; if(!po) return window.location.origin.indexOf('5000')!==-1?window.location.origin:'http://localhost:5000'; return 'http://localhost:5000'; } return window.location.origin; })())));
 sharedSocket.on('connect', ()=>{
 try{ const u=JSON.parse(localStorage.getItem('user')||'null'); if(u) sharedSocket.emit('user_online', u._id||u.id); }catch{}
 });
 sharedSocket.on('new_notification', (data)=>{
 loadNotifCount();
 showSharedDeviceNotif(data);
 // Also toast if available
 try{ if(typeof showToast==='function') showToast(data.message,'info'); else { const c=document.getElementById('toast-container')||document.body; const t=document.createElement('div'); t.style.cssText='position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1c1e21;color:white;padding:10px 16px;border-radius:8px;z-index:9999;'; t.textContent=data.message; document.body.appendChild(t); setTimeout(()=>t.remove(),3000);} }catch{}
 });
 }catch(e){ console.warn('shared socket',e); }
 }

 // ─── Generic A-Z Report — any content type → Admin ─────────────────────
 window.reportContent = function(type, id){
 if(!token){ alert('Please login to report'); location.href=(window.location.pathname.includes('/views/')?'../index.html':'index.html'); return; }
 let modal=document.getElementById('sharedReportModal');
 if(modal) modal.remove();
 modal=document.createElement('div');
 modal.id='sharedReportModal';
 modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:5000;display:flex;align-items:center;justify-content:center;padding:16px;';
 modal.innerHTML=`
 <div style="background:white;border-radius:16px;width:100%;max-width:440px;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,0.2);">
 <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #e4e6eb;">
 <h3 style="font-weight:800;display:flex;gap:8px;align-items:center;"><i class="fas fa-flag" style="color:#e41e3f"></i> Report ${type}</h3>
 <button onclick="document.getElementById('sharedReportModal').remove()" style="background:none;border:none;font-size:1.4rem;cursor:pointer;color:#65676b;">&times;</button>
 </div>
 <div style="padding:16px 20px;">
 <p style="font-size:0.85rem;color:#65676b;margin-bottom:10px;">Why are you reporting this ${type}? Report goes to Admin for review.</p>
 <div style="display:flex;flex-direction:column;gap:8px;">
 ${['Spam','Harassment','Hate Speech','False Information','Violence','Nudity','Other'].map(r=>`<label style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1.5px solid #e4e6eb;border-radius:10px;cursor:pointer;font-size:0.88rem;"><input type="radio" name="sharedReportReason" value="${r}"> ${r}</label>`).join('')}
 </div>
 <textarea id="sharedReportDetails" placeholder="Additional details (optional)" style="width:100%;margin-top:12px;padding:10px 12px;border:1.5px solid #e4e6eb;border-radius:8px;font-family:inherit;font-size:0.85rem;min-height:70px;resize:vertical;"></textarea>
 <div style="display:flex;gap:8px;margin-top:14px;">
 <button onclick="document.getElementById('sharedReportModal').remove()" style="flex:1;padding:11px;background:#f0f2f5;border:none;border-radius:10px;font-weight:700;cursor:pointer;">Cancel</button>
 <button id="sharedReportSubmit" style="flex:1;padding:11px;background:#e41e3f;color:white;border:none;border-radius:10px;font-weight:700;cursor:pointer;">Submit Report</button>
 </div>
 </div>
 </div>`;
 document.body.appendChild(modal);
 modal.addEventListener('click', e=>{ if(e.target===modal) modal.remove(); });
 document.getElementById('sharedReportSubmit').onclick=async()=>{
 const reason=document.querySelector('input[name="sharedReportReason"]:checked')?.value;
 if(!reason){ alert('Select a reason'); return; }
 const details=document.getElementById('sharedReportDetails').value.trim();
 try{
 const res=await fetch(`${API}/reports`, {method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+token}, body:JSON.stringify({target_type:type, target_id:id, reason, details})});
 const data=await res.json();
 if(!res.ok) throw new Error(data.message);
 modal.remove();
 // toast
 const t=document.createElement('div'); t.style.cssText='position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1c1e21;color:white;padding:10px 16px;border-radius:8px;z-index:9999;'; t.textContent=' Reported to Admin'; document.body.appendChild(t); setTimeout(()=>t.remove(),3000);
 }catch(err){ alert(err.message||'Failed'); }
 };
 };

 // ─── Admin & User Edit/Delete Helpers — A-Z for every content ─────────────
 window.isAdmin = function(){ try{ return (JSON.parse(localStorage.getItem('user')||'{}').role === 'Admin'); }catch{ return false; } };
 window.isOwner = function(ownerId){ try{ const u=JSON.parse(localStorage.getItem('user')||'{}'); const myId=String(u._id||u.id||''); return String(ownerId)===myId; }catch{ return false; } };
 // Admin can delete any content (varsity safety) — shows delete button everywhere for Admin
 window.adminDeleteContent = async function(type, id, el){
 if(!isAdmin()){ alert('Admin only'); return; }
 if(!confirm(`Delete this ${type} #${id}? This will permanently remove it from system.`)) return;
 try{
 // Try generic admin delete first, fallback to specific endpoints
 let res = await fetch(`${API}/admin/content/${type}/${id}`, {method:'DELETE', headers:{'Authorization':'Bearer '+token}});
 if(!res.ok){
 // Fallback to specific content delete (e.g., posts, housing, etc.)
 const fallbackMap = {post:`/posts/${id}`, housing:`/housing/${id}`, marketplace:`/marketplace/${id}`, blood_request:`/blood/requests/${id}`, reels:`/reels/${id}`, story:`/stories/${id}`, rideshare:`/rideshare/${id}`, tutoring:`/tutoring/${id}`, event:`/events/${id}`};
 const path = fallbackMap[type];
 if(path) res = await fetch(`${API}${path}`, {method:'DELETE', headers:{'Authorization':'Bearer '+token}});
 }
 const data=await res.json().catch(()=>({}));
 if(!res.ok) throw new Error(data.message||'Failed');
 // Remove element from UI
 if(el && el.closest){ const card=el.closest('.post-card, .item-card, .house-card, .req-card, .reel-item, .group-card, .event-card, .friend-card-item'); if(card) card.remove(); else if(el.parentElement) el.remove(); }
 else if(el && el.remove) el.remove();
 const t=document.createElement('div'); t.style.cssText='position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1c1e21;color:white;padding:10px 16px;border-radius:8px;z-index:9999;'; t.textContent=` ${type} deleted by Admin`; document.body.appendChild(t); setTimeout(()=>t.remove(),3000);
 }catch(e){ alert(e.message||'Failed to delete'); }
 };
 // User can delete own content — same endpoint but owner check
 window.userDeleteContent = async function(type, id, el){
 if(!confirm(`Delete your ${type}?`)) return;
 try{
 const map = {post:`/posts/${id}`, housing:`/housing/${id}`, marketplace:`/marketplace/${id}`, blood_request:`/blood/requests/${id}`, reels:`/reels/${id}`, story:`/stories/${id}`, rideshare:`/rideshare/${id}`, tutoring:`/tutoring/${id}`};
 const path = map[type] || `/posts/${id}`;
 const res = await fetch(`${API}${path}`, {method:'DELETE', headers:{'Authorization':'Bearer '+token}});
 const data=await res.json().catch(()=>({}));
 if(!res.ok) throw new Error(data.message||'Failed');
 if(el && el.closest){ const card=el.closest('.post-card, .item-card, .house-card, .req-card, .reel-item'); if(card) card.remove(); }
 const t=document.createElement('div'); t.style.cssText='position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1c1e21;color:white;padding:10px 16px;border-radius:8px;z-index:9999;'; t.textContent=' Deleted'; document.body.appendChild(t); setTimeout(()=>t.remove(),3000);
 }catch(e){ alert(e.message||'Failed'); }
 };
 // User can edit own content — simple prompt for now, can be extended to modal
 window.userEditContent = async function(type, id, oldContent){
 const newContent = prompt(`Edit your ${type}:`, oldContent||'');
 if(newContent===null) return;
 if(!newContent.trim()){ alert('Content cannot be empty'); return; }
 try{
 // For posts, use PUT /posts/:id, for others use generic
 let res;
 if(type==='post'){
 res = await fetch(`${API}/posts/${id}`, {method:'PUT', headers:{'Content-Type':'application/json','Authorization':'Bearer '+token}, body: JSON.stringify({content: newContent})});
 } else {
 // Generic: try PUT /api/<type>/:id/edit or fallback to POST
 res = await fetch(`${API}/${type}/${id}`, {method:'PUT', headers:{'Content-Type':'application/json','Authorization':'Bearer '+token}, body: JSON.stringify({content: newContent, title: newContent, description: newContent})});
 if(!res.ok){
 // Fallback for housing/marketplace/blood which may not have PUT — use PATCH via admin generic
 res = await fetch(`${API}/admin/content/${type}/${id}`, {method:'PUT', headers:{'Content-Type':'application/json','Authorization':'Bearer '+token}, body: JSON.stringify({content: newContent})});
 }
 }
 const data=await res.json().catch(()=>({}));
 if(!res.ok) throw new Error(data.message||'Failed to edit');
 alert(' Updated — refresh to see changes');
 location.reload();
 }catch(e){ alert(e.message||'Edit failed — backend edit endpoint may not exist for this type yet'); }
 };

 if (document.readyState === 'loading') {
 document.addEventListener('DOMContentLoaded', buildNavbar);
 } else {
 buildNavbar();
 }
})();
