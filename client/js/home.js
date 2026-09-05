/* =============================================
 DIU NEXUS — HOME PAGE MAIN SCRIPT
 Handles: auth check, socket, feed, stories,
 posts, reactions, comments, friends, search,
 notifications, dark mode
============================================= */

const API = (typeof window.API !== 'undefined' ? window.API : (function(){ var p=window.location.protocol,h=window.location.hostname,po=window.location.port; if(p==='file:') return 'http://localhost:5000/api'; if(h==='localhost'||h==='127.0.0.1'||h===''){ if(po==='5000') return window.location.origin+'/api'; if(!po) return window.location.origin.indexOf('5000')!==-1?window.location.origin+'/api':'http://localhost:5000/api'; return 'http://localhost:5000/api'; } return window.location.origin+'/api'; })());
const token = localStorage.getItem('token');
let currentUser = JSON.parse(localStorage.getItem('user') || 'null');
let feedPage = 1;
let isLoadingFeed = false;
let socket = null;

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
 if (!token) return window.location.href = '/index.html';
 await initUser();
 initSocket();
 loadFeed();
 loadStories();
 loadSuggestions();
 loadFriendRequests();
 loadNotificationCount();
 applyDarkMode();
 document.addEventListener('click', handleOutsideClick);
 // Ensure nav search works even if inline oninput fails (cache/CSP)
 try{
   const navInp=document.getElementById('navSearch');
   if(navInp && !navInp.dataset.bound){
     navInp.dataset.bound='1';
     navInp.addEventListener('input', e=> debounceSearch(e.target.value));
     navInp.addEventListener('focus', ()=> { if(navInp.value) showSearchDrop(); });
   }
 }catch{}
});

async function initUser() {
 try {
 const res = await apiFetch('/users/profile');
 if (!res.ok) { logout(); return; }
 currentUser = await res.json();
 localStorage.setItem('user', JSON.stringify(currentUser));
 renderUserUI();
 } catch { logout(); }
}

function renderUserUI() {
 const initials = getInitials(currentUser.fullName);
 // Sidebar
 setAvatarEl('sidebarAvatar', currentUser.profilePicture, initials);
 document.getElementById('sidebarName').textContent = currentUser.fullName || 'User';
 document.getElementById('sidebarDept').textContent = [currentUser.department, currentUser.batch].filter(Boolean).join(' · ');
 document.getElementById('statPosts').textContent = currentUser.postCount || 0;
 document.getElementById('statFriends').textContent = currentUser.friendCount || 0;
 const sharedEl = document.getElementById('statShared');
 if(sharedEl) sharedEl.textContent = currentUser.resourceCount ?? currentUser.sharedCount ?? 0;
 // Async refresh Shared count from API (ensures 1-2-3 auto update after resource share)
 (async()=>{
 try{
 const r = await apiFetch(`/resources?user_id=${currentUser._id||currentUser.id}`);
 if(r.ok){
 const arr = await r.json();
 const c = Array.isArray(arr) ? arr.length : 0;
 if(sharedEl){
 sharedEl.textContent = c;
 // Animate 1-2-3 bump like FB
 sharedEl.style.transform='scale(1.2)'; sharedEl.style.transition='transform 0.2s cubic-bezier(0.34,1.56,0.64,1)'; setTimeout(()=>sharedEl.style.transform='',220);
 }
 currentUser.resourceCount = c; currentUser.sharedCount = c;
 try{ localStorage.setItem('user', JSON.stringify(currentUser)); }catch{}
 }
 }catch{}
 })();
 // Listen for Shared updates from resources.html (same tab / other tab) → auto bump 1-2-3
 if(!window._sharedCountListenerAdded){
 window._sharedCountListenerAdded=true;
 window.addEventListener('storage', (ev)=>{
 if(ev.key==='resourceUpdateTs' || ev.key==='user'){
 try{
 const u=JSON.parse(localStorage.getItem('user')||'{}');
 const c=u.resourceCount??u.sharedCount;
 const el=document.getElementById('statShared');
 if(el && c!=null){ el.textContent=c; el.style.transform='scale(1.2)'; setTimeout(()=>el.style.transform='',220); }
 }catch{}
 }
 });
 window.addEventListener('focus', async()=>{
 try{
 const r=await apiFetch(`/resources?user_id=${currentUser._id||currentUser.id}`);
 if(r.ok){ const arr=await r.json(); const c=Array.isArray(arr)?arr.length:0; const el=document.getElementById('statShared'); if(el) el.textContent=c; currentUser.resourceCount=c; currentUser.sharedCount=c; try{localStorage.setItem('user',JSON.stringify(currentUser));}catch{} }
 }catch{}
 });
 }
 if (currentUser.coverPicture) {
 const cv = window.mediaUrl ? window.mediaUrl(currentUser.coverPicture) : (currentUser.coverPicture.startsWith('http') ? currentUser.coverPicture : ((window.API_BASE || (function(){var p=window.location.protocol,h=window.location.hostname,po=window.location.port; if(p==='file:') return 'http://localhost:5000'; if(h==='localhost'||h==='127.0.0.1'||h===''){ if(po==='5000') return window.location.origin; if(!po) return window.location.origin.indexOf('5000')!==-1?window.location.origin:'http://localhost:5000'; return 'http://localhost:5000'; } return window.location.origin; })())+currentUser.coverPicture));
 document.getElementById('sidebarCover').style.backgroundImage = `url(${cv})`;
 document.getElementById('sidebarCover').style.backgroundSize = 'cover';
 document.getElementById('sidebarCover').style.backgroundPosition = 'center';
 }
 // Navbar
 setAvatarEl('navAvatar', currentUser.profilePicture, initials);
 // Profile menu
 setAvatarEl('profileMenuAvatar', currentUser.profilePicture, initials);
 document.getElementById('profileMenuName').textContent = currentUser.fullName;
 document.getElementById('profileMenuDept').textContent = currentUser.department || '';
 // Create post
 setAvatarEl('createPostAvatar', currentUser.profilePicture, initials);
 setAvatarEl('modalAvatar', currentUser.profilePicture, initials);
 document.getElementById('modalPosterName').textContent = currentUser.fullName;
 // Admin — professional, no GOD/bar, no cut
 if (currentUser.role === 'Admin') {
 document.body.classList.add('is-admin');
 const navLogo = document.querySelector('.nav-logo');
 if (navLogo && !document.getElementById('adminGodBadge')) {
 const badge = document.createElement('span');
 badge.id = 'adminGodBadge';
 badge.style.cssText = 'background:#0A6CFF;color:white;font-size:0.6rem;font-weight:700;padding:3px 8px;border-radius:6px;margin-left:8px;letter-spacing:0.3px;white-space:nowrap;flex-shrink:0;position:relative;z-index:2;';
 badge.textContent = 'Admin';
 navLogo.appendChild(badge);
 }
 // Remove old GOD bar if exists (from previous version)
 const oldBar=document.getElementById('adminGodBar'); if(oldBar) oldBar.remove();
 const nav=document.querySelector('.navbar'); if(nav){ nav.style.top=''; }
 document.body.style.paddingTop='';
 }
}

function setAvatarEl(elId, picUrl, initials) {
 const el = document.getElementById(elId);
 if (!el) return;
 const isSidebar = elId === 'sidebarAvatar';
 const w = isSidebar ? '68px' : (el.style.width || el.getAttribute('data-w') || '40px');
 const h = isSidebar ? '68px' : (el.style.height || el.getAttribute('data-h') || '40px');
 const extraClass = isSidebar ? ' sidebar-avatar-pic' : '';
 
 if (picUrl) {
 const fullUrl = picUrl.startsWith('http') ? picUrl : `${(window.API_BASE || (function(){var p=window.location.protocol,h=window.location.hostname,po=window.location.port; if(p==='file:') return 'http://localhost:5000'; if(h==='localhost'||h==='127.0.0.1'||h===''){ if(po==='5000') return window.location.origin; if(!po) return window.location.origin.indexOf('5000')!==-1?window.location.origin:'http://localhost:5000'; return 'http://localhost:5000'; } return window.location.origin; })())}${picUrl}`;
 el.outerHTML = `<img id="${elId}" class="avatar${extraClass}" src="${fullUrl}" style="width:${w};height:${h};border-radius:50%;object-fit:cover;" onerror="this.outerHTML='<div id=\\'${elId}\\' class=\\'avatar-placeholder${extraClass}\\' style=\\'width:${w};height:${h};font-size:${isSidebar ? '1.35rem' : '0.85rem'};\\'>${initials}</div>'">`;
 } else {
 el.className = 'avatar-placeholder' + extraClass;
 el.style.width = w;
 el.style.height = h;
 el.style.fontSize = isSidebar ? '1.35rem' : '0.85rem';
 el.textContent = initials;
 }
}

function getInitials(name) {
 if (!name) return '?';
 return name.trim().split(' ').slice(0, 2).map(n => n[0]?.toUpperCase()).join('');
}

// ===== FB-LIKE DEVICE POP NOTIFICATION =====
function requestNotifPermission() {
 try {
 if ('Notification' in window && Notification.permission === 'default') {
 Notification.requestPermission().then(p => console.log('Notif permission:', p));
 }
 } catch {}
}
function playNotifSound() {
 try {
 const ctx = new (window.AudioContext || window.webkitAudioContext)();
 const o = ctx.createOscillator();
 const g = ctx.createGain();
 o.type = 'sine'; o.frequency.value = 880;
 g.gain.value = 0.15;
 o.connect(g); g.connect(ctx.destination);
 o.start(); g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
 setTimeout(() => { try{ o.stop(); ctx.close(); }catch{} }, 400);
 } catch {}
}
function showFBDeviceNotif(data) {
 const title = 'DIU Nexus';
 const body = data.message || data.body || 'New notification';
 const icon = ((window.API_BASE || (function(){var p=window.location.protocol,h=window.location.hostname,po=window.location.port; if(p==='file:') return 'http://localhost:5000'; if(h==='localhost'||h==='127.0.0.1'||h===''){ if(po==='5000') return window.location.origin; if(!po) return window.location.origin.indexOf('5000')!==-1?window.location.origin:'http://localhost:5000'; return 'http://localhost:5000'; } return window.location.origin; })())) + '/client/assets/icon.png';
 // Try browser/device notification like FB
 try {
 if ('Notification' in window && Notification.permission === 'granted') {
 const n = new Notification(title, { body: body, icon: icon, badge: icon, tag: 'diu-nexus-notif', requireInteraction: false, silent: false });
 n.onclick = () => { window.focus(); if (data.link) window.location.href = data.link; else toggleNotifPanel(); n.close(); };
 setTimeout(() => n.close(), 6000);
 } else if ('Notification' in window && Notification.permission !== 'denied') {
 Notification.requestPermission().then(p => { if (p === 'granted') showFBDeviceNotif(data); });
 }
 } catch(e) { console.warn('Device notif failed', e); }
 // Always animate badge FB-like
 const badge = document.getElementById('notifBadge');
 if (badge) { badge.classList.remove('hidden'); badge.style.animation = 'pulse 0.6s 2'; setTimeout(()=> badge.style.animation='', 1200); }
 // Vibrate on mobile like FB
 try { if (navigator.vibrate) navigator.vibrate([120, 80, 120]); } catch {}
}

// ===== SOCKET =====
function initSocket() {
 requestNotifPermission();
 try {
 socket = io(((window.API_BASE || (function(){var p=window.location.protocol,h=window.location.hostname,po=window.location.port; if(p==='file:') return 'http://localhost:5000'; if(h==='localhost'||h==='127.0.0.1'||h===''){ if(po==='5000') return window.location.origin; if(!po) return window.location.origin.indexOf('5000')!==-1?window.location.origin:'http://localhost:5000'; return 'http://localhost:5000'; } return window.location.origin; })())));
 socket.on('connect', () => {
 if (currentUser) socket.emit('user_online', currentUser._id || currentUser.id);
 });
 socket.on('online_users', (userIds) => renderOnlineFriends(userIds));
 socket.on('new_notification', (data) => {
 showToast(data.message, 'info');
 loadNotificationCount();
 playNotifSound();
 showFBDeviceNotif(data);
 });
 socket.on('new_post', (post) => {
 // Prepend new post if from someone else
 const myId = currentUser._id || currentUser.id;
 if (String(post.user?._id) !== String(myId)) {
 prependPost(post);
 }
 });
 socket.on('reaction_update', ({ postId, counts }) => {
 const el = document.getElementById(`reaction-count-${postId}`);
 if (el) {
 const total = counts.reduce((s, c) => s + c.count, 0);
 el.textContent = total > 0 ? total : '';
 }
 });
 } catch (e) { console.warn('Socket not available', e); }
}

// ===== API HELPER — with 503 warming retry (fixes exe button jam after reopen) =====
async function apiFetch(path, options = {}) {
 const headers = { 'Content-Type': 'application/json', ...options.headers };
 if (token) headers['Authorization'] = `Bearer ${token}`;
 if (options.body instanceof FormData) delete headers['Content-Type'];
 const method = (options.method || 'GET').toUpperCase();
 const isSafeRetry = method === 'GET' || method === 'HEAD';
 let attempt=0;
 while(attempt<2){
 try {
 const res = await fetch(`${API}${path}`, { ...options, headers });
 // If server warming up (503 retry:true) → wait 900ms and retry once (perfect for exe) — ONLY for safe GET
 if(res.status===503 && isSafeRetry){
 const j=await res.clone().json().catch(()=>({}));
 if(j.retry && attempt===0){
 await new Promise(r=>setTimeout(r, 900));
 attempt++; continue;
 }
 }
 return res;
 } catch (err) {
 if (err.message && err.message.includes('Failed to fetch')) {
 console.error('[DIU Nexus] Failed to fetch', `${API}${path}`, err);
 if (attempt===0 && isSafeRetry && !path.includes('/health')){
 await new Promise(r=>setTimeout(r, 800));
 attempt++; continue;
 }
 if (typeof showToast === 'function') showToast('⚠️ Server not reachable. Please wait — trying to reconnect...', 'error');
 throw new Error('Server connection failed. Please ensure server is running (npm run server) at ' + API);
 }
 throw err;
 }
 }
}

// ===== FEED =====
let allLoadedPosts = [];
let currentFeedFilter = 'all';

async function loadFeed(append = false) {
 if (isLoadingFeed) return;
 isLoadingFeed = true;
 if (!append) {
 feedPage = 1;
 allLoadedPosts = [];
 document.getElementById('feedLoader').style.display = 'flex';
 }
 try {
 const res = await apiFetch(`/posts/feed?page=${feedPage}&limit=15`);
 const posts = await res.json();
 document.getElementById('feedLoader').style.display = 'none';
 if (!append) document.getElementById('feedContainer').innerHTML = '';
 
 if (append) {
 allLoadedPosts = [...allLoadedPosts, ...posts];
 } else {
 allLoadedPosts = posts;
 }

 renderFilteredFeed();

 if (posts.length >= 15) {
 document.getElementById('loadMoreBtn').classList.remove('hidden');
 feedPage++;
 } else {
 document.getElementById('loadMoreBtn').classList.add('hidden');
 }
 } catch (e) {
 document.getElementById('feedLoader').style.display = 'none';
 const msg = e.message && e.message.includes('Server connection failed') ? e.message : 'Failed to load feed - ' + (e.message || 'Server not reachable');
 showToast(msg, 'error');
 // Show retry button
 const container = document.getElementById('feedContainer');
 if (container && !container.innerHTML.trim()) {
 container.innerHTML = `<div style="text-align:center;padding:30px;background:var(--surface);border-radius:12px;margin:10px;">
 <div style="font-size:2rem;margin-bottom:10px;">😔</div>
 <div style="font-weight:700;margin-bottom:6px;">Failed to load feed</div>
 <div style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:14px;">${msg}<br>Check if server is running on ${API}</div>
 <button onclick="loadFeed()" style="background:#0866ff;color:white;border:none;padding:8px 16px;border-radius:8px;font-weight:700;cursor:pointer;">🔄 Retry</button>
 </div>`;
 }
 }
 isLoadingFeed = false;
}

function filterFeedMode(mode, btn) {
 currentFeedFilter = mode;
 document.querySelectorAll('.feed-filter-pill').forEach(b => b.classList.remove('active'));
 if (btn) btn.classList.add('active');
 renderFilteredFeed();
}

function renderFilteredFeed() {
 const container = document.getElementById('feedContainer');
 container.innerHTML = '';
 let filtered = [...allLoadedPosts];

 if (currentFeedFilter === 'trending') {
 filtered.sort((a, b) => ((b.reactionCount || 0) + (b.commentCount || 0)) - ((a.reactionCount || 0) + (a.commentCount || 0)));
 } else if (currentFeedFilter === 'friends') {
 filtered = filtered.filter(p => p.visibility === 'Friends' || p.visibility === 'Public');
 } else if (currentFeedFilter === 'photos') {
 filtered = filtered.filter(p => p.mediaUrl);
 }

 if (filtered.length === 0) {
 container.innerHTML = `
 <div class="empty-state">
 <i class="fas fa-newspaper"></i>
 <h3>No posts match this filter</h3>
 <p>Try switching to "All Posts" to see the full campus activity!</p>
 </div>`;
 return;
 }

 filtered.forEach(p => appendPostCard(p));
}

function prependPost(post) {
 const container = document.getElementById('feedContainer');
 const div = document.createElement('div');
 div.innerHTML = buildPostCard(post);
 container.insertBefore(div.firstElementChild, container.firstChild);
}

function appendPostCard(post) {
 const container = document.getElementById('feedContainer');
 const div = document.createElement('div');
 div.innerHTML = buildPostCard(post);
 container.appendChild(div.firstElementChild);
}

function buildPostCard(post) {
 const myId = currentUser?._id || currentUser?.id;
 const isOwner = String(post.user?._id || post.user_id) === String(myId);
 const isAdmin = currentUser?.role === 'Admin';
 const initials = getInitials(post.user?.fullName || post.fullName);
 const _pp = post.user?.profilePicture;
 const _avatarUrl = _pp ? (window.mediaUrl ? window.mediaUrl(_pp) : (_pp.startsWith('http') ? _pp : `${(window.API_BASE || window.getBaseUrl())}${_pp}`)) : '';
 const avatarHtml = _pp
 ? `<img class="avatar" src="${_avatarUrl}" style="width:40px;height:40px;" onclick="window.location.href='views/profile.html?id=${post.user?._id || post.user_id}'" onerror="this.onerror=null;this.outerHTML='<div class=\\'avatar-placeholder\\' style=\\'width:40px;height:40px;font-size:1rem;cursor:pointer;\\'>${initials}</div>'">`
 : `<div class="avatar-placeholder" style="width:40px;height:40px;font-size:1rem;cursor:pointer;" onclick="window.location.href='views/profile.html?id=${post.user?._id || post.user_id}'">${initials}</div>`;

 const _mediaUrl = post.mediaUrl ? (window.mediaUrl ? window.mediaUrl(post.mediaUrl) : (post.mediaUrl.startsWith('http') ? post.mediaUrl : `${(window.API_BASE||window.getBaseUrl())}${post.mediaUrl}`)) : '';
 const mediaHtml = post.mediaUrl ? (post.mediaType === 'video'
 ? `<div class="post-media"><video src="${_mediaUrl}" controls style="width:100%;max-height:400px;"></video></div>`
 : `<div class="post-media"><img src="${_mediaUrl}" alt="Post media" loading="lazy" onclick="openLightbox(this.src)"></div>`
 ) : '';

 const reactedClass = post.myReaction ? `reacted ${post.myReaction}` : '';
 const reactedIcon = post.myReaction ? getReactionIcon(post.myReaction) : '👍';
 const savedIcon = post.isSaved ? 'fas fa-bookmark text-blue' : 'far fa-bookmark';
 const reactionCount = (post.reactionCount || 0);
 const commentCount = (post.commentCount || 0);

 return `
 <div class="post-card" id="post-${post._id || post.id}">
 <div class="post-header">
 <div class="post-author">
 ${avatarHtml}
 <div>
 <div class="post-author-name" onclick="window.location.href='views/profile.html?id=${post.user?._id || post.user_id}'" style="cursor:pointer; display:flex; align-items:center;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">
 ${post.user?.fullName || post.fullName || 'Unknown'}
 <span class="diu-verified" title="Verified DIU Member"><i class="fas fa-check"></i></span>
 </div>
 <div class="post-author-meta">
 <span>${post.user?.department || 'DIU'}</span>
 <span>·</span>
 <span>${timeAgo(post.created_at)}</span>
 <span>·</span>
 <i class="fas ${post.visibility === 'Public' ? 'fa-globe-americas' : post.visibility === 'Friends' ? 'fa-user-friends' : 'fa-lock'}" title="${post.visibility || 'Public'}"></i>
 </div>
 </div>
 </div>
 <div style="position:relative;">
 <button class="post-menu-btn" onclick="togglePostMenu('${post._id || post.id}')"><i class="fas fa-ellipsis-h"></i></button>
 <div class="dropdown-menu" id="post-menu-${post._id || post.id}" style="right:0;top:40px;min-width:200px;">
 <button class="dropdown-item" onclick="toggleSavePost('${post._id || post.id}', this)"><i class="${savedIcon}"></i> ${post.isSaved ? 'Unsave post' : 'Save post'}</button>
 ${isOwner ? `<button class="dropdown-item" onclick="editPost('${post._id || post.id}', \`${(post.content||'').replace(/`/g,'\\`').replace(/\$/g,'\\$')}\`)"><i class="fas fa-pen"></i> Edit post</button><button class="dropdown-item danger" onclick="deletePost('${post._id || post.id}')"><i class="fas fa-trash"></i> Delete post</button>` : ''}
 ${isAdmin ? `<button class="dropdown-item danger" onclick="adminDeletePost('${post._id || post.id}')"><i class="fas fa-shield-alt"></i> Admin Delete</button>` : ''}
 ${!isOwner && !isAdmin ? `<button class="dropdown-item" onclick="reportPost('${post._id || post.id}', event)"><i class="fas fa-flag"></i> Report post</button>` : ''}
 </div>
 </div>
 </div>
 ${post.content ? `<div class="post-content ${!post.mediaUrl && post.content.length < 80 ? 'large' : ''}">${(() => { let c=escapeHtml(post.content); if(post.mentions && post.mentions.length){ post.mentions.forEach(m=>{ const escName=escapeHtml(m.name); c=c.replace(new RegExp('@'+escName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), 'g'), `<a href="views/profile.html?id=${m.id}" style="color:#0866ff;font-weight:700;text-decoration:none;background:#e7f0ff;padding:1px 6px;border-radius:8px;">@${escName}</a>`); c=c.replace(new RegExp('@'+m.name.split(' ')[0], 'g'), `<a href="views/profile.html?id=${m.id}" style="color:#0866ff;font-weight:700;">@${esc(m.name.split(' ')[0])}</a>`); }); } else { c=c.replace(/@([A-Za-z\u0980-\u09FF]+(?: [A-Za-z\u0980-\u09FF]+)?)/g, '<span style="color:#0866ff;font-weight:700;">@$1</span>'); } return c; })()}</div>` : ''}
 ${post.mentions && post.mentions.length ? `<div style="margin:8px 0 2px; display:flex; flex-wrap:wrap; gap:6px; align-items:center; font-size:0.82rem; color:var(--text-secondary);"><i class="fas fa-user-tag" style="color:#0866ff;"></i> with ${post.mentions.map(m=>`<a href="views/profile.html?id=${m.id}" style="color:#0866ff; font-weight:700; text-decoration:none; background:#e7f0ff; padding:3px 8px; border-radius:12px; border:1px solid #bfdbfe; display:inline-flex; align-items:center; gap:5px;" onclick="event.stopPropagation()">${m.profilePicture?`<img src="${window.location.origin}${m.profilePicture}" style="width:16px;height:16px;border-radius:50%;object-fit:cover;">`:''}${esc(m.name)}</a>`).join('')}</div>` : ''}
 ${mediaHtml}
 <div class="post-stats">
 <div class="post-reaction-count" onclick="openReactionsModal('${post._id || post.id}')" title="See who reacted">
 ${reactionCount > 0 ? `<span class="reaction-emojis"><span>👍</span><span>❤️</span><span>😂</span></span>&nbsp;<span id="reaction-count-${post._id || post.id}">${reactionCount}</span>` : `<span id="reaction-count-${post._id || post.id}"></span>`}
 </div>
 <div style="cursor:pointer" onclick="toggleComments('${post._id || post.id}')">${commentCount > 0 ? `${commentCount} comment${commentCount > 1 ? 's' : ''}` : ''}</div>
 </div>
 <div class="post-actions">
 <div class="post-action-wrap">
 <div class="reaction-picker">
 <span class="reaction-btn" onclick="doReact(event,'${post._id || post.id}','like')">👍</span>
 <span class="reaction-btn" onclick="doReact(event,'${post._id || post.id}','love')">❤️</span>
 <span class="reaction-btn" onclick="doReact(event,'${post._id || post.id}','haha')">😂</span>
 <span class="reaction-btn" onclick="doReact(event,'${post._id || post.id}','wow')">😮</span>
 <span class="reaction-btn" onclick="doReact(event,'${post._id || post.id}','sad')">😢</span>
 <span class="reaction-btn" onclick="doReact(event,'${post._id || post.id}','angry')">😡</span>
 </div>
 <button class="post-action ${reactedClass}" id="react-btn-${post._id || post.id}" data-postid="${post._id || post.id}" data-reaction="${post.myReaction || ''}" onclick="doReact(event,'${post._id || post.id}','${post.myReaction || 'like'}')">
 <span>${reactedIcon}</span> <span>${post.myReaction ? capitalize(post.myReaction) : 'Like'}</span>
 </button>
 </div>
 <button class="post-action" onclick="toggleComments('${post._id || post.id}')">
 <i class="far fa-comment-alt"></i> <span>Comment</span>
 </button>
 <button class="post-action" onclick="sharePost('${post._id || post.id}')">
 <i class="fas fa-share"></i> <span>Share</span>
 </button>
 </div>
 <div class="post-comments" id="comments-${post._id || post.id}">
 <div class="comments-list" id="comments-list-${post._id || post.id}"></div>
 <div class="comment-input-row">
 ${(() => { const _cp = currentUser?.profilePicture; const _curl = _cp ? (window.mediaUrl ? window.mediaUrl(_cp) : (_cp.startsWith('http') ? _cp : `${(window.API_BASE||window.getBaseUrl())}${_cp}`)) : ''; return _cp ? `<img src="${_curl}" class="avatar" style="width:34px;height:34px;border-radius:50%;object-fit:cover;flex-shrink:0;" onerror="this.onerror=null;this.outerHTML='<div class=\\'avatar-placeholder\\' style=\\'width:34px;height:34px;font-size:0.8rem;flex-shrink:0;\\'>${getInitials(currentUser?.fullName)}</div>'">` : `<div class="avatar-placeholder" style="width:34px;height:34px;font-size:0.8rem;flex-shrink:0;">${getInitials(currentUser?.fullName)}</div>`; })()}
 <div class="comment-input-wrap" style="position:relative; flex:1;">
 <input class="comment-input" id="cinput-${post._id || post.id}" placeholder="Write a comment... use @ to mention"
 onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();submitComment('${post._id || post.id}',this);}"
 oninput="handleCommentMentionInput(this, '${post._id || post.id}')" autocomplete="off">
 <div id="cmention-${post._id || post.id}" style="display:none; position:absolute; bottom:44px; left:0; right:0; background:var(--surface); border:1px solid var(--border); border-radius:10px; box-shadow:0 4px 12px rgba(0,0,0,0.12); max-height:150px; overflow-y:auto; z-index:10;"></div>
 <button class="comment-emoji-btn" onclick="toggleCommentEmoji('${post._id || post.id}')" title="Emoji"></button>
 </div>
 <button class="comment-send" onclick="submitComment('${post._id || post.id}',document.getElementById('cinput-${post._id || post.id}'))"><i class="fas fa-paper-plane"></i></button>
 </div>
 <div class="comment-emoji-box" id="cemoji-${post._id || post.id}" style="display:none;"></div>
 </div>
 </div>`;
}

function getReactionIcon(type) {
 const icons = { like: '👍', love: '❤️', haha: '😂', wow: '😮', sad: '😢', angry: '😡' };
 return icons[type] || '👍';
}

function capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : ''; }

// ===== REACTIONS =====
async function doReact(event, postId, type) {
 event.stopPropagation();
 try {
 const res = await apiFetch(`/reactions/${postId}`, {
 method: 'POST',
 body: JSON.stringify({ type })
 });
 const data = await res.json();
 const btn = document.getElementById(`react-btn-${postId}`);
 const countWrap = document.getElementById(`reaction-count-${postId}`)?.parentElement;
 const countEl = document.getElementById(`reaction-count-${postId}`);
 
 if (data.action === 'removed') {
 btn.className = 'post-action';
 btn.dataset.reaction = '';
 btn.querySelector('span:last-child').textContent = 'Like';
 btn.querySelectorAll('span')[0].textContent = '👍';
 if (countEl) {
 const total = data.total !== undefined ? data.total : Math.max(0, (parseInt(countEl.textContent)||0) - 1);
 countEl.textContent = total > 0 ? total : '';
 if (total === 0 && countWrap) countWrap.innerHTML = `<span id="reaction-count-${postId}"></span>`;
 }
 } else {
 btn.className = `post-action reacted ${type}`;
 btn.dataset.reaction = type;
 btn.querySelectorAll('span')[0].textContent = getReactionIcon(type);
 btn.querySelector('span:last-child').textContent = capitalize(type);
 const total = data.total !== undefined ? data.total : (parseInt(countEl?.textContent)||0) + 1;
 if (countWrap) {
 countWrap.innerHTML = `<span class="reaction-emojis"><span>👍</span><span>❤️</span><span>😂</span></span>&nbsp;<span id="reaction-count-${postId}">${total}</span>`;
 }
 }
 } catch (e) {
 console.error('doReact error:', e);
 showToast('Failed to react', 'error');
 }
}

// ===== WHO REACTED MODAL (Facebook-Style) =====
let currentPostReactions = [];
let activeReactionTab = 'all';

async function openReactionsModal(postId) {
 const modal = document.getElementById('reactionsModal');
 const listEl = document.getElementById('reactionsList');
 if (!modal || !listEl) return;
 window._currentReactionsPostId = postId;

 modal.classList.add('show');
 listEl.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-secondary);"><i class="fas fa-spinner fa-spin"></i> Loading reactions...</div>';
 
 // Reset tabs
 activeReactionTab = 'all';
 document.querySelectorAll('.rtab-btn').forEach(b => b.classList.remove('active'));
 document.getElementById('rtab-btn-all')?.classList.add('active');

 try {
 const res = await apiFetch(`/reactions/${postId}`);
 const data = await res.json();
 currentPostReactions = data.reactions || [];

 // Update Tab Counts
 const summary = data.summary || {};
 document.getElementById('rtab-count-all').textContent = data.total || currentPostReactions.length;
 document.getElementById('rtab-count-like').textContent = summary.like || 0;
 document.getElementById('rtab-count-love').textContent = summary.love || 0;
 document.getElementById('rtab-count-haha').textContent = summary.haha || 0;
 document.getElementById('rtab-count-wow').textContent = summary.wow || 0;
 document.getElementById('rtab-count-sad').textContent = summary.sad || 0;
 document.getElementById('rtab-count-angry').textContent = summary.angry || 0;

 renderReactionsList();
 } catch (err) {
 console.error('openReactionsModal error:', err);
 listEl.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-secondary);">Failed to load reactions</div>';
 }
}

function filterReactionsTab(type, btn) {
 activeReactionTab = type;
 document.querySelectorAll('.rtab-btn').forEach(b => b.classList.remove('active'));
 btn.classList.add('active');
 renderReactionsList();
}

function renderReactionsList() {
 const listEl = document.getElementById('reactionsList');
 if (!listEl) return;

 const filtered = activeReactionTab === 'all'
 ? currentPostReactions
 : currentPostReactions.filter(r => r.type === activeReactionTab);

 if (!filtered.length) {
 listEl.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-secondary);font-size:0.9rem;">No reactions in this category</div>';
 return;
 }

 listEl.innerHTML = filtered.map(r => {
 const _name = r.fullName || r.fullname || 'DIU Student';
 const icon = getReactionIcon(r.type);
 const name = escapeHtml(_name);
 const dept = (r.department||r.Department) ? `${escapeHtml(r.department||r.Department)} · ${escapeHtml(r.batch||r.Batch || '')}` : 'DIU Member';
 const initials = getInitials(_name);
 const _pp = r.profilePicture || r.profilepicture;
 const _ppUrl = _pp ? (window.mediaUrl ? window.mediaUrl(_pp) : (_pp.startsWith('http') ? _pp : `${(window.API_BASE||window.getBaseUrl())}${_pp}`)) : '';
 const avatarHtml = _pp
 ? `<img src="${_ppUrl}" class="reactor-av" alt="${name}" onerror="this.onerror=null;this.outerHTML='<div class=\\'avatar-placeholder reactor-av\\' style=\\'font-size:1rem;\\'>${initials}</div>'">`
 : `<div class="avatar-placeholder reactor-av" style="font-size:1rem;">${initials}</div>`;

 return `
 <div class="reactor-row">
 <div class="reactor-av-wrap" onclick="window.location.href='views/profile.html?id=${r._id || r.userId}'" style="cursor:pointer;">
 ${avatarHtml}
 <div class="reactor-badge">${icon}</div>
 </div>
 <div class="reactor-info" onclick="window.location.href='views/profile.html?id=${r._id || r.userId}'" style="cursor:pointer;">
 <div class="reactor-name">${name}</div>
 <div class="reactor-dept">${dept}</div>
 </div>
 <a href="views/messenger.html?userId=${r._id || r.userId}" class="reactor-btn">
 <i class="fas fa-comment"></i> Message
 </a>
 </div>`;
 }).join('');
}

function closeReactionsModal() {
 document.getElementById('reactionsModal')?.classList.remove('show');
}

// ===== COMMENTS =====
async function toggleComments(postId) {
 const el = document.getElementById(`comments-${postId}`);
 if (!el) return;
 el.classList.toggle('show');
 if (el.classList.contains('show')) {
 const listEl = document.getElementById(`comments-list-${postId}`);
 if (listEl && listEl.children.length === 0) await loadComments(postId);
 }
}

async function loadComments(postId) {
 const listEl = document.getElementById(`comments-list-${postId}`);
 if (!listEl) return;
 try {
 const res = await apiFetch(`/posts/${postId}`);
 const post = await res.json();
 listEl.innerHTML = '';
 (post.comments || []).forEach(c => listEl.insertAdjacentHTML('beforeend', buildComment(c)));
 } catch { listEl.innerHTML = '<div style="padding:8px;color:var(--text-secondary);font-size:0.82rem">Failed to load comments</div>'; }
}

function buildComment(c) {
 const initials = getInitials(c.fullName || c.fullname || c.user?.fullName || c.user?.fullname);
 const pic = c.profilePicture || c.profilepicture || c.user?.profilePicture || c.user?.profilepicture;
 const name = c.fullName || c.fullname || c.user?.fullName || c.user?.fullname || 'DIU Member';
 const picUrl = pic ? (window.mediaUrl ? window.mediaUrl(pic) : (pic.startsWith('http') ? pic : `${(window.API_BASE||window.getBaseUrl())}${pic}`)) : '';
 const avatarHtml = pic
 ? `<img class="avatar" src="${picUrl}" style="width:34px;height:34px;border-radius:50%;object-fit:cover;cursor:pointer;" onclick="window.location.href='views/profile.html?id=${c.user_id||c.userId||''}'" onerror="this.onerror=null;this.outerHTML='<div class=\\'avatar-placeholder\\' style=\\'width:34px;height:34px;font-size:0.8rem;cursor:pointer;flex-shrink:0;\\'>${initials}</div>'">`
 : `<div class="avatar-placeholder" style="width:34px;height:34px;font-size:0.8rem;cursor:pointer;flex-shrink:0;" onclick="window.location.href='views/profile.html?id=${c.user_id||c.userId||''}'">${initials}</div>`;
 const ago = c.created_at ? timeAgo(c.created_at) : 'Just now';
 const myId = String(currentUser?._id || currentUser?.id || '');
 const isOwner = String(c.user_id || c.userId) === myId;
 const isAdmin = currentUser?.role === 'Admin';
 const postId = c.post_id || c.postId || '';
 let contentHtml = escapeHtml(c.content);
 // Highlight mentions: if c.mentions array exists use it, else fallback to @ regex and make clickable
 if (c.mentions && Array.isArray(c.mentions) && c.mentions.length) {
 c.mentions.forEach(m=>{
 const escName=escapeHtml(m.name);
 const re=new RegExp('@'+escName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), 'g');
 contentHtml=contentHtml.replace(re, `<a href="views/profile.html?id=${m.id}" style="color:#0866ff;font-weight:700;text-decoration:none;">@${escName}</a>`);
 });
 } else {
 contentHtml=contentHtml.replace(/@([A-Za-z\u0980-\u09FF]+(?: [A-Za-z\u0980-\u09FF]+)?)/g, '<span style="color:#0866ff;font-weight:700;">@$1</span>');
 // also linkify any @Name that matches a friend cache
 if (tagFriendsCache.length) {
 tagFriendsCache.forEach(f=>{
 const re=new RegExp('@'+f.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), 'g');
 if (contentHtml.includes('@'+f.name)) contentHtml=contentHtml.replace(re, `<a href="views/profile.html?id=${f.id}" style="color:#0866ff;font-weight:700;text-decoration:none;">@${esc(f.name)}</a>`);
 });
 }
 }
 return `<div class="comment-item" style="margin-bottom:10px;display:flex;gap:8px;align-items:flex-start;">
 ${avatarHtml}
 <div style="flex:1;min-width:0;">
 <div class="comment-bubble" style="background:var(--surface-alt,#f0f2f5);border-radius:18px;padding:8px 14px;display:inline-block;max-width:100%;">
 <div class="name" style="cursor:pointer;font-weight:700;font-size:0.82rem;color:var(--text);margin-bottom:2px;" onclick="window.location.href='views/profile.html?id=${c.user_id||c.userId||''}'">${escapeHtml(name)}</div>
 <div class="text" style="font-size:0.88rem;line-height:1.4;word-break:break-word;">${contentHtml}</div>
 </div>
 <div style="display:flex;gap:12px;padding:2px 6px;font-size:0.75rem;color:var(--text-secondary);align-items:center;flex-wrap:wrap;">
 <span>${ago}</span>
 <button style="background:none;border:none;font-size:0.75rem;font-weight:700;color:var(--text-secondary);cursor:pointer;padding:0;" onmouseover="this.style.color='#0866ff'" onmouseout="this.style.color='var(--text-secondary)'" onclick="this.style.color='#0866ff';this.textContent=this.textContent==='Like'?'Liked':'Like';">Like</button>
 <button style="background:none;border:none;font-size:0.75rem;font-weight:700;color:var(--text-secondary);cursor:pointer;padding:0;" onmouseover="this.style.color='#0866ff'" onmouseout="this.style.color='var(--text-secondary)'">Reply</button>
 ${isOwner ? `<button onclick="editComment('${c.id}', \`${(c.content||'').replace(/`/g,'\\`')}\`, '${postId}')" style="background:none;border:none;font-size:0.75rem;font-weight:700;color:#0A6CFF;cursor:pointer;padding:0;">Edit</button>` : ''}
 ${isOwner || isAdmin ? `<button onclick="deleteComment('${c.id}', '${postId}', this)" style="background:none;border:none;font-size:0.75rem;font-weight:700;color:#e41e3f;cursor:pointer;padding:0;">${isAdmin && !isOwner ? 'Admin Delete' : 'Delete'}</button>` : ''}
 </div>
 </div>
 </div>`;
}

function extractMentionIdsFromContent(content){
 if(!content || !content.includes('@') || !tagFriendsCache.length) return [];
 const names=[...content.matchAll(/@([A-Za-z\u0980-\u09FF ]{2,30})/g)].map(m=>m[1].trim().toLowerCase()).filter(Boolean);
 const ids=[];
 for(const n of names){
 const f=tagFriendsCache.find(x=>x.name.toLowerCase().includes(n) || n.includes(x.name.toLowerCase().split(' ')[0]));
 if(f && !ids.includes(String(f.id))) ids.push(String(f.id));
 }
 return ids;
}
async function submitComment(postId, inputEl) {
 const content = inputEl.value.trim();
 if (!content) return;
 // collect mentions from @ in content
 const mentionIds=extractMentionIdsFromContent(content);
 try {
 const body={content};
 if(mentionIds.length) body.mentions=mentionIds;
 const res = await apiFetch(`/posts/${postId}/comment`, {
 method: 'POST',
 body: JSON.stringify(body)
 });
 const comment = await res.json();
 const listEl = document.getElementById(`comments-list-${postId}`);
 if (listEl) {
 listEl.insertAdjacentHTML('beforeend', buildComment({ ...comment, fullName: comment.fullName || currentUser.fullName, profilePicture: comment.profilePicture || currentUser.profilePicture }));
 }
 inputEl.value = '';
 } catch { showToast('Failed to post comment', 'error'); }
}

async function handleCommentMentionInput(input, postId){
 const val=input.value;
 const atPos=val.lastIndexOf('@');
 const box=document.getElementById('cmention-'+postId);
 if(!box) return;
 if(atPos<0){ box.style.display='none'; return; }
 const after=val.slice(atPos+1);
 const query=after.split(/\s/)[0].toLowerCase().trim();
 if(!query){ box.style.display='none'; return; }
 if(!tagFriendsCache.length){
 // lazy load friends
 try{
 const res=await apiFetch('/friends');
 const friends=await res.json();
 if(Array.isArray(friends)) tagFriendsCache=friends.map(f=>({id:String(f._id||f.id), name:f.fullName, pic:f.profilePicture}));
 }catch{}
 }
 const matches=tagFriendsCache.filter(f=>f.name.toLowerCase().includes(query)).slice(0,5);
 if(!matches.length){ box.style.display='none'; return; }
 box.style.display='block';
 box.innerHTML=matches.map(f=>`<div onclick="insertCommentMention('${postId}','${f.name.replace(/'/g,"\\'")}','${f.id}')" style="padding:8px 12px;cursor:pointer;display:flex;align-items:center;gap:8px;" onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background='transparent'">${f.pic?`<img src="${window.location.origin}${f.pic}" style="width:26px;height:26px;border-radius:50%;">`:`<div style="width:26px;height:26px;border-radius:50%;background:#0866ff;color:white;display:flex;align-items:center;justify-content:center;font-size:0.7rem;">${getInitials(f.name)}</div>`}<span style="font-weight:600;font-size:0.85rem;">${esc(f.name)}</span></div>`).join('');
}
function insertCommentMention(postId, name, id){
 const input=document.getElementById('cinput-'+postId);
 if(!input) return;
 const val=input.value;
 const atPos=val.lastIndexOf('@');
 if(atPos>=0){
 const afterSpace=val.slice(atPos).indexOf(' ');
 const before=val.slice(0,atPos);
 const after=afterSpace>0?val.slice(atPos+afterSpace):'';
 input.value=before+'@'+name+' '+(after?after.trim()+' ':'');
 } else {
 input.value+='@'+name+' ';
 }
 const box=document.getElementById('cmention-'+postId);
 if(box) box.style.display='none';
 input.focus();
 // also track mention for submit? extractMentionIds will handle via name
 if(!tagFriendsCache.some(f=>String(f.id)===String(id))){
 tagFriendsCache.push({id:String(id), name:name});
 }
}

// ===== SAVE POST =====
async function toggleSavePost(postId, btn) {
 try {
 const res = await apiFetch(`/saved/${postId}`, { method: 'POST' });
 const data = await res.json();
 showToast(data.action === 'saved' ? 'Post saved!' : 'Post unsaved', 'success');
 const icon = btn.querySelector('i');
 icon.className = data.action === 'saved' ? 'fas fa-bookmark text-blue' : 'far fa-bookmark';
 btn.innerHTML = `<i class="${icon.className}"></i> ${data.action === 'saved' ? 'Unsave post' : 'Save post'}`;
 } catch { showToast('Failed', 'error'); }
}

// ===== DELETE POST =====
async function deletePost(postId) {
 if (!confirm('Delete this post?')) return;
 try {
 await apiFetch(`/posts/${postId}`, { method: 'DELETE' });
 document.getElementById(`post-${postId}`)?.remove();
 showToast('Post deleted', 'success');
 } catch { showToast('Failed to delete', 'error'); }
}
async function editPost(postId, oldContent){
 const newContent = prompt('Edit your post:', (oldContent||'').replace(/`/g,'`'));
 if(newContent===null) return;
 if(!newContent.trim()){ showToast('Content cannot be empty','error'); return; }
 try{
 const res = await apiFetch(`/posts/${postId}`, {method:'PUT', body: JSON.stringify({content: newContent})});
 const data = await res.json();
 if(!res.ok) throw new Error(data.message||'Failed');
 const el = document.getElementById(`post-${postId}`);
 if(el){
 const cEl = el.querySelector('.post-content');
 if(cEl) { cEl.textContent = newContent; cEl.style.background='#e7f0ff'; setTimeout(()=>cEl.style.background='',800); }
 else {
   // Super fast fallback: try updating any text container without reload
   const anyText=el.querySelector('div');
   if(anyText) { anyText.textContent=newContent; }
   el.style.outline='2px solid #0866ff'; setTimeout(()=>el.style.outline='',1000);
 }
 }
 showToast('Post updated ✓','success');
 }catch(e){ showToast(e.message||'Failed to edit','error'); }
}
async function adminDeletePost(postId){
 if(!confirm('Admin delete this post? This will permanently remove it from system.')) return;
 try{
 const res = await apiFetch(`/posts/${postId}`, {method:'DELETE'});
 const data = await res.json().catch(()=>({}));
 if(!res.ok) throw new Error(data.message||'Failed');
 document.getElementById(`post-${postId}`)?.remove();
 showToast('Post deleted by Admin ✓','success');
 }catch(e){ showToast(e.message||'Failed','error'); }
}

// ===== REPORT POST — goes to admin (FB-like) =====
let _reportPostId = null;
function reportPost(postId, e){
 if(e){ e.preventDefault(); e.stopPropagation(); }
 _reportPostId = postId;
 // Close any post menu
 document.querySelectorAll('.dropdown-menu').forEach(m=>m.classList.remove('show'));
 // Create modal if not exists
 let modal = document.getElementById('reportModal');
 if(modal) modal.remove();
 modal = document.createElement('div');
 modal.id = 'reportModal';
 modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:4000;display:flex;align-items:center;justify-content:center;padding:16px;';
 modal.innerHTML = `
 <div style="background:var(--surface,#fff);border-radius:16px;width:100%;max-width:480px;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,0.2);">
 <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--border,#e4e6eb);">
 <h3 style="font-weight:800;font-size:1.05rem;display:flex;gap:8px;align-items:center;"><i class="fas fa-flag" style="color:#e41e3f"></i> Report Post</h3>
 <button onclick="closeReportModal()" style="background:none;border:none;font-size:1.4rem;cursor:pointer;color:#65676b;">&times;</button>
 </div>
 <div style="padding:16px 20px;">
 <p style="font-size:0.85rem;color:#65676b;margin-bottom:12px;">Why are you reporting this post? Your report will be sent to Admin for review.</p>
 <div style="display:flex;flex-direction:column;gap:8px;">
 ${['Spam','Harassment / Bullying','Hate Speech','False Information','Violence / Dangerous','Nudity / Sexual','Other'].map(r=>`
 <label style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1.5px solid var(--border,#e4e6eb);border-radius:10px;cursor:pointer;font-size:0.88rem;">
 <input type="radio" name="reportReason" value="${r}" style="width:16px;height:16px;">
 <span>${r}</span>
 </label>`).join('')}
 </div>
 <textarea id="reportDetails" placeholder="Additional details (optional)..." style="width:100%;margin-top:12px;padding:10px 12px;border:1.5px solid var(--border,#e4e6eb);border-radius:8px;font-family:inherit;font-size:0.85rem;resize:vertical;min-height:70px;"></textarea>
 <div style="display:flex;gap:8px;margin-top:14px;">
 <button onclick="closeReportModal()" style="flex:1;padding:11px;background:var(--bg,#f0f2f5);border:none;border-radius:10px;font-weight:700;cursor:pointer;">Cancel</button>
 <button onclick="submitReport()" style="flex:1;padding:11px;background:#e41e3f;color:white;border:none;border-radius:10px;font-weight:700;cursor:pointer;">Submit Report</button>
 </div>
 </div>
 </div>`;
 modal.addEventListener('click', e=>{ if(e.target===modal) closeReportModal(); });
 document.body.appendChild(modal);
}
function closeReportModal(){ document.getElementById('reportModal')?.remove(); _reportPostId=null; }
async function submitReport(){
 const reason = document.querySelector('input[name=\"reportReason\"]:checked')?.value;
 if(!reason){ showToast('Please select a reason', 'error'); return; }
 const details = document.getElementById('reportDetails')?.value.trim() || '';
 try{
 const res = await apiFetch(`/posts/${_reportPostId}/report`, { method:'POST', body: JSON.stringify({ reason, details }) });
 const data = await res.json();
 if(!res.ok) throw new Error(data.message||'Failed');
 showToast(' Reported to Admin — thank you for keeping Nexus safe!', 'success');
 closeReportModal();
 }catch(err){ showToast(err.message||'Failed to report', 'error'); }
}

// ===== POST MODAL =====
function openPostModal(type) {
 document.getElementById('postModal').classList.add('show');
 document.getElementById('postContent').focus();
 if (type === 'photo') document.getElementById('postMediaInput').click();
}
function closePostModal() {
 document.getElementById('postModal').classList.remove('show');
 document.getElementById('postContent').value = '';
 removePostMedia();
 taggedFriends = [];
 const disp = document.getElementById('taggedFriendsDisplay');
 if(disp){ disp.style.display='none'; disp.innerHTML=''; }
 const cnt=document.getElementById('tagCount');
 if(cnt){ cnt.style.display='none'; cnt.textContent='0'; }
 const sel=document.getElementById('tagSelector');
 if(sel) sel.style.display='none';
 const sug=document.getElementById('postMentionSuggestions');
 if(sug) sug.style.display='none';
}
// ── Tag Friends (Post) ──
let tagFriendsCache = [];
async function toggleTagSelector(){
 const sel=document.getElementById('tagSelector');
 if(!sel) return;
 const isShow=sel.style.display!=='none' && sel.style.display!=='';
 if(isShow){ sel.style.display='none'; return; }
 sel.style.display='block';
 if(!tagFriendsCache.length){
 try{
 const res=await apiFetch('/friends');
 const friends=await res.json();
 // /friends returns pending? fallback to user suggestions
 if(Array.isArray(friends) && friends.length){
 tagFriendsCache=friends.map(f=>({id:String(f._id||f.id), name:f.fullName, pic:f.profilePicture}));
 } else {
 const sres=await apiFetch('/friends/suggestions');
 const sdata=await sres.json().catch(()=>[]);
 if(Array.isArray(sdata)) tagFriendsCache=sdata.map(f=>({id:String(f._id||f.id), name:f.fullName, pic:f.profilePicture}));
 }
 }catch{}
 // fallback: search users
 if(!tagFriendsCache.length){
 try{
 const r=await apiFetch('/users/profile'); // at least self
 }catch{}
 }
 }
 renderTagFriendsList(tagFriendsCache);
}
function renderTagFriendsList(list){
 const el=document.getElementById('tagFriendsList');
 if(!el) return;
 if(!list.length){ el.innerHTML='<div style="padding:8px;color:var(--text-secondary);font-size:0.82rem;">No friends to tag — add friends first</div>'; return; }
 el.innerHTML=list.map(f=>{
 const isTagged=taggedFriends.some(t=>String(t.id)===String(f.id));
 return `<div onclick="toggleTagFriend('${f.id}','${(f.name||'').replace(/'/g,"\\'")}')" style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;cursor:pointer;background:${isTagged?'#e7f0ff':'transparent'};border:1px solid ${isTagged?'#bfdbfe':'transparent'};">
 ${f.pic?`<img src="${window.location.origin}${f.pic}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;">`:`<div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#0a66ff,#0540a0);color:white;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.8rem;">${getInitials(f.name)}</div>`}
 <div style="flex:1;"><div style="font-weight:600;font-size:0.88rem;">${esc(f.name)}</div><div style="font-size:0.72rem;color:var(--text-secondary);">${isTagged?'Tagged ✓':'Tap to tag'}</div></div>
 <i class="fas ${isTagged?'fa-check-circle':'fa-plus-circle'}" style="color:${isTagged?'#0866ff':'var(--text-secondary)'};"></i>
 </div>`;
 }).join('');
}
function filterTagFriends(q){
 const lower=q.toLowerCase();
 const filtered=tagFriendsCache.filter(f=>f.name.toLowerCase().includes(lower));
 renderTagFriendsList(filtered);
}
function toggleTagFriend(id, name){
 const idx=taggedFriends.findIndex(t=>String(t.id)===String(id));
 if(idx>=0){ taggedFriends.splice(idx,1); } else {
 // find pic
 const f=tagFriendsCache.find(x=>String(x.id)===String(id));
 taggedFriends.push({id:String(id), name:name, pic:f?.pic||null});
 }
 updateTaggedDisplay();
 renderTagFriendsList(tagFriendsCache);
 // also insert @ mention into content for visual
 const ta=document.getElementById('postContent');
 if(ta && idx<0){
 const cur=ta.value;
 const mention=`@${name} `;
 if(!cur.includes(mention)) ta.value = cur + (cur && !cur.endsWith(' ') ? ' ' : '') + mention;
 }
}
function updateTaggedDisplay(){
 const disp=document.getElementById('taggedFriendsDisplay');
 const cnt=document.getElementById('tagCount');
 if(!disp || !cnt) return;
 if(!taggedFriends.length){ disp.style.display='none'; cnt.style.display='none'; return; }
 disp.style.display='flex';
 cnt.style.display='inline-block';
 cnt.textContent=taggedFriends.length;
 disp.innerHTML=taggedFriends.map(f=>`<span style="background:#e7f0ff;color:#0866ff;padding:4px 10px;border-radius:20px;font-size:0.78rem;font-weight:600;display:inline-flex;align-items:center;gap:6px;border:1px solid #bfdbfe;">${esc(f.name)} <i class="fas fa-times" style="cursor:pointer;font-size:0.7rem;" onclick="toggleTagFriend('${f.id}','${f.name.replace(/'/g,"\\'")}')"></i></span>`).join('');
}
function handlePostMentionInput(el){
 const val=el.value;
 const atPos=val.lastIndexOf('@');
 const sug=document.getElementById('postMentionSuggestions');
 if(atPos<0 || !sug){ if(sug) sug.style.display='none'; return; }
 const after=val.slice(atPos+1);
 const query=after.split(/\s/)[0].toLowerCase().trim();
 if(!query){ sug.style.display='none'; return; }
 const matches=tagFriendsCache.filter(f=>f.name.toLowerCase().includes(query)).slice(0,5);
 if(!matches.length){ sug.style.display='none'; return; }
 sug.style.display='block';
 sug.innerHTML=matches.map(f=>`<div onclick="insertPostMention('${f.name.replace(/'/g,"\\'")}','${f.id}')" style="padding:8px 12px;cursor:pointer;display:flex;align-items:center;gap:8px;border-radius:8px;" onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background='transparent'">${f.pic?`<img src="${window.location.origin}${f.pic}" style="width:28px;height:28px;border-radius:50%;">`:`<div style="width:28px;height:28px;border-radius:50%;background:#0866ff;color:white;display:flex;align-items:center;justify-content:center;font-size:0.7rem;">${getInitials(f.name)}</div>`}<span style="font-weight:600;font-size:0.85rem;">${esc(f.name)}</span></div>`).join('');
}
function insertPostMention(name, id){
 const ta=document.getElementById('postContent');
 const val=ta.value;
 const atPos=val.lastIndexOf('@');
 if(atPos>=0){
 const before=val.slice(0,atPos);
 const afterSpace=val.slice(atPos).indexOf(' ');
 const after=afterSpace>0?val.slice(atPos+afterSpace):'';
 ta.value=before+'@'+name+' '+ (after?after.trim()+' ':'');
 }
 document.getElementById('postMentionSuggestions').style.display='none';
 // also tag
 if(!taggedFriends.some(t=>String(t.id)===String(id))){
 const f=tagFriendsCache.find(x=>String(x.id)===String(id));
 taggedFriends.push({id:String(id), name:name, pic:f?.pic||null});
 updateTaggedDisplay();
 }
 ta.focus();
}
function previewMedia(input) {
 const file = input.files[0];
 if (!file) return;
 const url = URL.createObjectURL(file);
 const preview = document.getElementById('postMediaPreview');
 const img = document.getElementById('postImagePreview');
 const vid = document.getElementById('postVideoPreview');
 preview.classList.remove('hidden');
 if (file.type.startsWith('video')) {
 img.style.display = 'none'; vid.style.display = 'block'; vid.src = url;
 } else {
 vid.style.display = 'none'; img.style.display = 'block'; img.src = url;
 }
}
function removePostMedia() {
 document.getElementById('postMediaPreview').classList.add('hidden');
 document.getElementById('postImagePreview').src = '';
 document.getElementById('postVideoPreview').src = '';
 document.getElementById('postMediaInput').value = '';
}
function autoResizeTextarea(el) {
 el.style.height = 'auto';
 el.style.height = Math.min(el.scrollHeight, 300) + 'px';
}

let taggedFriends = [];
async function submitPost() {
 const content = document.getElementById('postContent').value.trim();
 const mediaInput = document.getElementById('postMediaInput');
 const visibility = document.getElementById('postVisibility').value;
 if (!content && !mediaInput.files[0]) return showToast('Write something or add a photo/video', 'error');
 const btn = document.getElementById('submitPostBtn');
 btn.disabled = true; btn.textContent = 'Posting...';
 try {
 const formData = new FormData();
 if (content) formData.append('content', content);
 formData.append('visibility', visibility);
 if (taggedFriends.length) formData.append('mentions', JSON.stringify(taggedFriends.map(f=>f.id)));
 if (mediaInput.files[0]) formData.append('media', mediaInput.files[0]);
 const res = await fetch(`${API}/posts`, {
 method: 'POST',
 headers: { 'Authorization': `Bearer ${token}` },
 body: formData
 });
 const data = await res.json();
 if (!res.ok) throw new Error(data.message);
 closePostModal();
 prependPost(data.post);
 showToast('Post shared!', 'success');
 } catch (e) { showToast(e.message || 'Failed to post', 'error'); }
 btn.disabled = false; btn.textContent = 'Post';
}

// ===== POST MENUS =====
function togglePostMenu(postId) {
 const menu = document.getElementById(`post-menu-${postId}`);
 const allMenus = document.querySelectorAll('.dropdown-menu');
 allMenus.forEach(m => { if (m !== menu) m.classList.remove('show'); });
 menu.classList.toggle('show');
}

// ===== STORIES =====
let currentStoriesData = [];
let viewingUserIndex = 0;
let viewingStoryIndex = 0;
let storyTimeout = null;
// ── Fix glitch: sync let vars with window (hotfixes used window.*) ──
try {
 Object.defineProperty(window, 'currentStoriesData', { get(){ return currentStoriesData; }, set(v){ currentStoriesData = v; }, configurable:true });
 Object.defineProperty(window, 'viewingUserIndex', { get(){ return viewingUserIndex; }, set(v){ viewingUserIndex = v; }, configurable:true });
 Object.defineProperty(window, 'viewingStoryIndex', { get(){ return viewingStoryIndex; }, set(v){ viewingStoryIndex = v; }, configurable:true });
 Object.defineProperty(window, 'storyTimeout', { get(){ return storyTimeout; }, set(v){ storyTimeout = v; }, configurable:true });
 window.currentStoriesData = currentStoriesData;
 window.viewingUserIndex = viewingUserIndex;
 window.viewingStoryIndex = viewingStoryIndex;
 window.storyTimeout = storyTimeout;
} catch(e) { console.warn('story sync failed', e); }

async function loadStories() {
 try {
 const stories = await apiFetch('/stories/feed');
 currentStoriesData = await stories.json();
 renderStoriesRing(currentStoriesData);
 } catch(e) { console.error('Failed to load stories'); }
}

function renderStoriesRing(users) {
 const list = document.getElementById('friendsStoriesList');
 if (!list) return;
 let html = '';
 const myId = String(currentUser._id || currentUser.id || currentUser._id);
 // FB Original: Create Story card always for creation — set its top image to user's avatar
 const myStory = users.find(u => String(u.user_id) === myId);
 const myCardImg = document.getElementById('myStoryAvCard');
 const myAvEl = document.getElementById('myStoryAv');
 // Update new FB card image and old hidden circle for compat
 // Fix: use mediaUrl for cloudinary double prefix + show story media as cover for Your story (like FB)
 const getMedia = (p)=> window.mediaUrl ? window.mediaUrl(p) : (p && p.startsWith('http') ? p : ((window.API_BASE || (function(){var pp=window.location.protocol,hh=window.location.hostname,po=window.location.port; if(pp==='file:') return 'http://localhost:5000'; if(hh==='localhost'||hh==='127.0.0.1'||hh===''){ if(po==='5000') return window.location.origin; if(!po) return window.location.origin.indexOf('5000')!==-1?window.location.origin:'http://localhost:5000'; return 'http://localhost:5000'; } return window.location.origin; })())+p));
 if(myCardImg){
   // If has own story, show latest story media as cover (FB-like), else profile pic
   let coverSrc = null;
   if(myStory){
     const lst = myStory.stories[myStory.stories.length-1];
     const mp = lst ? (lst.media_url || lst.content || '') : '';
     if(mp && (mp.startsWith('/uploads') || mp.startsWith('http') || mp.startsWith('blob:') || mp.startsWith('data:'))) coverSrc = getMedia(mp);
   }
   if(coverSrc){
     myCardImg.src = coverSrc;
     myCardImg.style.display='block';
     myCardImg.style.objectFit='cover';
     if(myCardImg.nextElementSibling) myCardImg.nextElementSibling.style.display='none';
   } else if(currentUser.profilePicture){
     myCardImg.src = getMedia(currentUser.profilePicture);
     myCardImg.style.display='block';
     myCardImg.style.objectFit='cover';
     if(myCardImg.nextElementSibling) myCardImg.nextElementSibling.style.display='none';
   } else {
     myCardImg.style.display='none';
     if(myCardImg.nextElementSibling) myCardImg.nextElementSibling.style.display='flex';
   }
 }
 if(myAvEl){
   if(currentUser.profilePicture) myAvEl.src = getMedia(currentUser.profilePicture);
 }
 
  // FB-like: Don't duplicate own story — show only in Create Story card (fixes double)
  // Deduplicate users by user_id (backend may send dupes, or placeholder "User")
  const seenIds = new Set();
  const uniqueUsers = [];
  users.forEach(u=>{ const k=String(u.user_id); if(!seenIds.has(k) && u.fullName && u.fullName!=='User'){ seenIds.add(k); uniqueUsers.push(u); } else if(!seenIds.has(k) && (!u.fullName || u.fullName==='User')){ // allow but mark as deduped if real name missing
    if(!seenIds.has(k)) { seenIds.add(k); uniqueUsers.push(u); }
  }});
  // If still dup due to "User" placeholder, filter again strictly
  const filteredForRender = uniqueUsers.filter(u=> String(u.user_id)!==myId || !myStory); // will handle myStory via Create card below
  // Enhance Create Story card to FB "Your story" when you have a story
  const getCreateCard = ()=> document.querySelector('#storiesContainer > div:first-child');
  if(myStory){
    const createCard = getCreateCard();
    if(createCard){
      const myIdx = users.findIndex(u=> String(u.user_id)===myId);
      const hasUnviewed = myStory.stories.some(s=>!s.viewed);
      createCard.style.border = `1.5px solid ${hasUnviewed?'#0866ff':'#dbdbdb'}`;
      createCard.style.boxShadow = hasUnviewed ? '0 0 0 2px #0866ff' : '0 1px 3px rgba(0,0,0,0.06)';
      const label = createCard.lastElementChild ? createCard.lastElementChild.querySelector('div') || createCard.lastElementChild : null;
      if(label) label.textContent = `Your story`;
      // Also show count as small badge below? keep single line
      const subLabel = createCard.querySelector('.create-sub');
      if(subLabel) subLabel.textContent = `${myStory.stories.length} story${myStory.stories.length>1?'s':''} • ${hasUnviewed?'New':'Seen'}`;
      else {
        const last = createCard.lastElementChild;
        if(last && !last.querySelector('.create-sub')){
          const s=document.createElement('div'); s.className='create-sub'; s.style.cssText='font-size:0.70rem;opacity:0.7;margin-top:2px;'; s.textContent=`${myStory.stories.length} story${myStory.stories.length>1?'s':''} • ${hasUnviewed?'New':'Seen'}`; last.appendChild(s);
        }
      }
      createCard.setAttribute('onclick', `openStoryViewer(${myIdx})`);
      createCard.title = 'View your story — tap + to add';
      let dot = createCard.querySelector('.own-story-dot');
      if(!dot){ dot=document.createElement('div'); dot.className='own-story-dot'; dot.style.cssText='position:absolute;top:8px;right:8px;background:#0866ff;color:white;font-size:0.55rem;font-weight:800;padding:2px 6px;border-radius:10px;z-index:3;'; createCard.querySelector('div[style*="flex:1"]')?.appendChild(dot); }
      dot.textContent = hasUnviewed ? 'New' : 'Seen';
      dot.style.background = hasUnviewed ? '#0866ff' : '#65676b';
      // Hide plus when has story? keep plus small
      const plus = createCard.querySelector('div[style*="flex:1"] div[style*="background:#0095f6"]');
      if(plus) plus.style.display='flex';
    }
  } else {
    const createCard = getCreateCard();
    if(createCard){
      createCard.setAttribute('onclick','openStoryCreator()');
      const label = createCard.lastElementChild ? createCard.lastElementChild.querySelector('div') : null;
      if(label) label.textContent = 'Create story';
      const sub = createCard.querySelector('.create-sub'); if(sub) sub.remove();
      createCard.style.border = '1px solid var(--border)';
      createCard.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)';
      const dot = createCard.querySelector('.own-story-dot'); if(dot) dot.remove();
    }
  }
  // Render friends only (exclude own to prevent double) — FB original
  const renderList = users.filter(u=> String(u.user_id)!==myId);
  // Also deduplicate renderList by user_id and by generic name "User"
  const seenRender = new Set();
  const seenNames = new Set();
  const dedupedRender = renderList.filter(u=>{ 
    const k=String(u.user_id); 
    if(seenRender.has(k)) return false; 
    seenRender.add(k); 
    // collapse multiple "User" placeholders into one card (FB-like)
    const name=(u.fullName||'').trim();
    if(name==='User' || name==='Unknown' || !name){
      if(seenNames.has('__placeholder_User')) return false;
      seenNames.add('__placeholder_User');
    } else {
      if(seenNames.has(name)) return false; // also dedup exact same display name from different ids (rare)
      // don't block legit same names, only placeholder
    }
    return true; 
  });
  dedupedRender.forEach((user) => {
  const uIndex = users.findIndex(u=> String(u.user_id)===String(user.user_id));
  const isOwn = false; // own already handled
 const latest = user.stories[user.stories.length-1];
 const mediaPath = latest ? (latest.media_url || latest.content || '') : '';
 const isMedia = typeof mediaPath==='string' && (mediaPath.startsWith('/uploads') || mediaPath.startsWith('http') || mediaPath.startsWith('blob:') || mediaPath.startsWith('data:'));
 const bg = latest ? (latest.bg_color || '#1a1a2e') : '#1a1a2e';
 // Cover: if latest is text, use bg color card with text preview; if media, use image
 let coverHtml = '';
 if(latest && latest.type==='text' || !isMedia){
 const txt = latest ? (latest.caption || latest.content || '').slice(0,42) : '';
 coverHtml = `<div style="width:100%;height:100%;background:${bg};display:flex;align-items:center;justify-content:center;color:white;font-weight:800;font-size:0.85rem;padding:10px;text-align:center;line-height:1.3;">${escapeHtml(txt)}</div>`;
 } else if(isMedia){
 const src = (window.mediaUrl ? window.mediaUrl(mediaPath) : (mediaPath.startsWith('http') ? mediaPath : `${(window.API_BASE || (function(){var p=window.location.protocol,h=window.location.hostname,po=window.location.port; if(p==='file:') return 'http://localhost:5000'; if(h==='localhost'||h==='127.0.0.1'||h===''){ if(po==='5000') return window.location.origin; if(!po) return window.location.origin.indexOf('5000')!==-1?window.location.origin:'http://localhost:5000'; return 'http://localhost:5000'; } return window.location.origin; })())}${mediaPath}`));
 coverHtml = `<img src="${src}" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"><div style="display:none;width:100%;height:100%;background:${bg};align-items:center;justify-content:center;color:white;padding:8px;text-align:center;">${escapeHtml((latest.caption||latest.content||'Story').slice(0,30))}</div>`;
 } else {
 coverHtml = `<div style="width:100%;height:100%;background:${bg};"></div>`;
 }
 const avatarHtml = user.profilePicture ? `<img src="${(window.API_BASE || (function(){var p=window.location.protocol,h=window.location.hostname,po=window.location.port; if(p==='file:') return 'http://localhost:5000'; if(h==='localhost'||h==='127.0.0.1'||h===''){ if(po==='5000') return window.location.origin; if(!po) return window.location.origin.indexOf('5000')!==-1?window.location.origin:'http://localhost:5000'; return 'http://localhost:5000'; } return window.location.origin; })())}${user.profilePicture}" onerror="this.src='https://via.placeholder.com/60'" style="width:100%;height:100%;object-fit:cover;">` : `<div style="width:100%;height:100%;background:linear-gradient(135deg,#667eea,#764ba2);display:flex;align-items:center;justify-content:center;color:white;font-weight:800;">${escapeHtml((user.fullName||'U')[0])}</div>`;
 // Same size as explore cards (132x188) — FB rectangular style
 const hasUnviewed = user.stories.some(s=>!s.viewed);
 const borderColor = hasUnviewed ? '#0866ff' : '#dbdbdb';
 html += `
 <div onclick="openStoryViewer(${uIndex})" style="flex:0 0 132px; width:132px; height:188px; border-radius:16px; overflow:hidden; position:relative; cursor:pointer; flex-shrink:0; background:var(--surface); border:1.5px solid ${borderColor}; box-shadow:0 1px 3px rgba(0,0,0,0.06);">
 <div style="width:100%;height:100%;position:relative;">${coverHtml}
 <div style="position:absolute; inset:0; background:linear-gradient(180deg, rgba(0,0,0,0) 30%, rgba(0,0,0,0.15) 55%, rgba(0,0,0,0.82) 100%);"></div>
 <div style="position:absolute; top:10px; left:10px; width:38px; height:38px; border-radius:50%; border:2.5px solid white; overflow:hidden; background:var(--surface); box-shadow:0 2px 8px rgba(0,0,0,0.22), 0 0 0 2px ${borderColor}; display:flex; align-items:center; justify-content:center;">${avatarHtml}</div>
 <div style="position:absolute; bottom:0; left:0; right:0; padding:32px 10px 10px; color:white;">
 <div style="font-weight:800; font-size:0.84rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; text-shadow:0 1px 4px rgba(0,0,0,0.85);">${escapeHtml(user.fullName)}</div>
 <div style="font-size:0.70rem; opacity:0.92; display:flex; gap:5px; align-items:center; text-shadow:0 1px 3px rgba(0,0,0,0.9);">${hasUnviewed ? '<span style="background:#0866ff;color:white;padding:1px 6px;border-radius:10px;font-size:0.6rem;font-weight:700;">New</span>' : 'Seen'} • ${user.stories.length} story</div>
 </div>
 </div>
 </div>`;
 });
 // Add Create Story card as first card (FB style) if not already handled? Keep circle "Create Story" as is, but also add card style alternative for empty state
 list.innerHTML = html;
 // Update Create Story circle to FB card if no story? Keep existing circle for now
}

function openStoryCreator() {
 document.getElementById('storyCreatorModal').style.display = 'flex';
 // Reset previews and show initial chooser
 document.getElementById('storyImgPreview').style.display = 'none';
 document.getElementById('storyImgPreview').src = '';
 document.getElementById('storyVideoPreview').style.display = 'none';
 document.getElementById('storyVideoPreview').src = '';
 document.getElementById('storyVoicePreview').style.display = 'none';
 document.getElementById('storyTextOnlyInput').style.display = 'none';
 document.getElementById('storyTextOnlyInput').value = '';
 document.getElementById('storyTextInput').style.display = 'none';
 document.getElementById('storyTextInput').value = '';
 document.getElementById('storyBtnGroup').style.display = 'flex';
 document.getElementById('storyPreviewBox').style.background = 'var(--bg)';
 document.getElementById('storyPreviewBox').style.filter = '';
 document.getElementById('uploadStoryBtn').style.display = 'none';
 document.getElementById('uploadStoryBtn').disabled = false;
 document.getElementById('uploadStoryBtn').innerText = ' Share to Story';
 // Reset file inputs so same file can be re-selected
 const mediaIn = document.getElementById('storyMediaInput');
 if(mediaIn) mediaIn.value = '';
 const voiceIn = document.getElementById('storyVoiceInput');
 if(voiceIn) voiceIn.value = '';
 currentStoryMode = 'image';
 // Reset tabs
 document.querySelectorAll('.story-type-tab').forEach((b,i)=>{ 
 if(i===0){ b.style.background='var(--blue)';b.style.color='white';b.style.borderColor='var(--blue)'; b.classList.add('active'); } 
 else { b.style.background='var(--bg)';b.style.color='var(--text)';b.style.borderColor='var(--border)'; b.classList.remove('active'); }
 });
 document.getElementById('storyColorPicker').style.display='none';
}

function closeStoryCreator() {
 document.getElementById('storyCreatorModal').style.display = 'none';
 // Reset file inputs to allow re-selecting same file next time
 const mediaIn = document.getElementById('storyMediaInput');
 if(mediaIn) mediaIn.value = '';
 const voiceIn = document.getElementById('storyVoiceInput');
 if(voiceIn) voiceIn.value = '';
 document.getElementById('storyBtnGroup').style.display = 'flex';
}

function previewStoryMedia(input) {
 if(input.files[0]) {
 const file=input.files[0];
 const isVideo=file.type.startsWith('video/');
 currentStoryMode = isVideo ? 'video' : 'image';
 const url = URL.createObjectURL(file);
 document.getElementById('storyBtnGroup').style.display = 'none';
 document.getElementById('storyImgPreview').style.display='none';
 document.getElementById('storyVideoPreview').style.display='none';
 document.getElementById('storyVoicePreview').style.display='none';
 document.getElementById('storyTextOnlyInput').style.display='none';
 if(isVideo){
 const v=document.getElementById('storyVideoPreview');
 v.src=url;
 v.style.display='block';
 } else {
 document.getElementById('storyImgPreview').src = url;
 document.getElementById('storyImgPreview').style.display = 'block';
 }
 document.getElementById('storyTextInput').style.display = 'block';
 document.getElementById('uploadStoryBtn').style.display = 'block';
 document.getElementById('storyColorPicker').style.display='none';
 // Ensure type tabs reflect
 document.querySelectorAll('.story-type-tab').forEach(b=>{
 const isActive=b.dataset.type===currentStoryMode;
 b.style.background=isActive?'var(--blue)':'var(--bg)';
 b.style.color=isActive?'white':'var(--text)';
 b.style.borderColor=isActive?'var(--blue)':'var(--border)';
 });
 }
}

let currentStoryMode = 'image';
let currentStoryBg = '#232526';

function enableTextStory() {
 currentStoryMode = 'text';
 document.getElementById('storyBtnGroup').style.display = 'none';
 document.getElementById('storyTextOnlyInput').style.display = 'block';
 document.getElementById('storyColorPicker').style.display = 'flex';
 document.getElementById('uploadStoryBtn').style.display = 'block';
 setStoryBg('#ff512f');
}

function setStoryBg(color) {
 currentStoryBg = color;
 document.getElementById('storyPreviewBox').style.background = color;
}

async function submitStory() {
 const formData = new FormData();
 formData.append('type', currentStoryMode);
 formData.append('privacy', document.getElementById('storyPrivacy').value);
 
 if (currentStoryMode === 'image') {
 const file = document.getElementById('storyMediaInput').files[0];
 if(!file) return;
 formData.append('media', file);
 formData.append('content', document.getElementById('storyTextInput').value);
 } else {
 const text = document.getElementById('storyTextOnlyInput').value;
 if(!text) return showToast('Enter text');
 formData.append('content', text);
 formData.append('bg_color', currentStoryBg);
 }
 
 document.getElementById('uploadStoryBtn').innerText = 'Uploading...';
 try {
 await fetch(API + '/stories', { method: 'POST', headers: {'Authorization': 'Bearer ' + token}, body: formData });
 showToast('Story published!');
 closeStoryCreator();
 loadStories();
 } catch(e) { showToast('Upload failed', 'error'); }
}

function openStoryViewer(uIndex) {
 viewingUserIndex = uIndex;
 viewingStoryIndex = 0;
 document.getElementById('storyViewerModal').style.display = 'flex';
 renderCurrentStory();
}

function closeStoryViewer() {
 document.getElementById('storyViewerModal').style.display = 'none';
 clearTimeout(storyTimeout);
}

function renderCurrentStory() {
 clearTimeout(storyTimeout);
 if(viewingUserIndex >= currentStoriesData.length) {
 return closeStoryViewer();
 }
 
 const user = currentStoriesData[viewingUserIndex];
 if(viewingStoryIndex >= user.stories.length) {
 viewingUserIndex++;
 viewingStoryIndex = 0;
 return renderCurrentStory();
 }
 
 const story = user.stories[viewingStoryIndex];
 
 document.getElementById('svAvatar').src = ((window.API_BASE || (function(){var p=window.location.protocol,h=window.location.hostname,po=window.location.port; if(p==='file:') return 'http://localhost:5000'; if(h==='localhost'||h==='127.0.0.1'||h===''){ if(po==='5000') return window.location.origin; if(!po) return window.location.origin.indexOf('5000')!==-1?window.location.origin:'http://localhost:5000'; return 'http://localhost:5000'; } return window.location.origin; })())) + user.profilePicture;
 document.getElementById('svTime').innerText = formatTime(story.created_at);
 
 const img = document.getElementById('svMedia');
 const txt = document.getElementById('svText');
 const pvBox = img.parentElement;
 
 if (story.privacy === 'close_friends') {
 document.getElementById('svName').innerHTML = user.fullName + ' <span style="background:#00b09b; padding:2px 6px; border-radius:10px; font-size:0.6rem; color:white; vertical-align:middle; margin-left:5px;">⭐ Close Friends</span>';
 } else {
 document.getElementById('svName').innerText = user.fullName;
 }
 
 if (story.type === 'text') {
 img.style.display = 'none';
 txt.style.display = 'block';
 txt.innerText = story.content;
 pvBox.style.background = story.bg_color || '#232526';
 } else {
 txt.style.display = 'none';
 img.style.display = 'block';
 img.src = ((window.API_BASE || (function(){var p=window.location.protocol,h=window.location.hostname,po=window.location.port; if(p==='file:') return 'http://localhost:5000'; if(h==='localhost'||h==='127.0.0.1'||h===''){ if(po==='5000') return window.location.origin; if(!po) return window.location.origin.indexOf('5000')!==-1?window.location.origin:'http://localhost:5000'; return 'http://localhost:5000'; } return window.location.origin; })())) + story.content;
 pvBox.style.background = 'black';
 }
 
 const barsContainer = document.getElementById('storyProgressBars');
 let barsHtml = '';
 for(let i=0; i<user.stories.length; i++) {
 let bg = 'rgba(255,255,255,0.3)';
 if(i < viewingStoryIndex) bg = 'white';
 barsHtml += `<div style="flex:1; height:3px; background:${bg}; border-radius:3px; overflow:hidden;">
 <div id="spBar-${i}" style="width:0%; height:100%; background:white; transition:width 5s linear;"></div>
 </div>`;
 }
 barsContainer.innerHTML = barsHtml;
 
 apiFetch(`/stories/${story.id}/view`, { method: 'POST' }).then(()=>{ 
 try{ story.viewed=true; story.view_count=(story.view_count||0)+1; 
 // update ring UI in background
 const userStories=currentStoriesData[viewingUserIndex]; 
 if(userStories) userStories.stories[viewingStoryIndex].viewed=true; 
 }catch{}
 }).catch(e=>console.log);
 
 setTimeout(() => {
 const curBar = document.getElementById(`spBar-${viewingStoryIndex}`);
 if(curBar) curBar.style.width = '100%';
 }, 50);
 
 storyTimeout = setTimeout(() => {
 nextStory();
 }, 5000);
}

function nextStory() {
 viewingStoryIndex++;
 renderCurrentStory();
}

function prevStory() {
 if(viewingStoryIndex > 0) {
 viewingStoryIndex--;
 renderCurrentStory();
 } else if (viewingUserIndex > 0) {
 viewingUserIndex--;
 viewingStoryIndex = currentStoriesData[viewingUserIndex].stories.length - 1;
 renderCurrentStory();
 }
}

async function sendStoryReply() {
 const input = document.getElementById('storyReplyInput');
 const text = input.value.trim();
 if(!text) return;
 
 const user = currentStoriesData[viewingUserIndex];
 if(user.user_id === currentUser.id) return showToast("Can't reply to your own story");
 
 try {
 await apiFetch('/messages', {
 method: 'POST',
 body: JSON.stringify({
 receiverId: user.user_id,
 content: `[STORY REPLY]: ${text}`,
 isGroup: false
 })
 });
 showToast('Reply sent to messenger!');
 input.value = '';
 nextStory();
 } catch(e) { showToast('Failed to reply', 'error'); }
}

// ===== FRIEND SUGGESTIONS =====
async function loadSuggestions() {
 try {
 const res = await apiFetch('/users/suggestions');
 const users = await res.json();
 const el = document.getElementById('suggestionsList');
 if (users.length === 0) { el.innerHTML = '<div style="padding:10px 16px;font-size:0.82rem;color:var(--text-secondary)">No suggestions</div>'; return; }
 el.innerHTML = users.slice(0, 5).map(u => {
 const initials = getInitials(u.fullName);
 const avatarHtml = u.profilePicture
 ? `<img class="avatar" src="${(window.API_BASE || (function(){var p=window.location.protocol,h=window.location.hostname,po=window.location.port; if(p==='file:') return 'http://localhost:5000'; if(h==='localhost'||h==='127.0.0.1'||h===''){ if(po==='5000') return window.location.origin; if(!po) return window.location.origin.indexOf('5000')!==-1?window.location.origin:'http://localhost:5000'; return 'http://localhost:5000'; } return window.location.origin; })())}${u.profilePicture}" style="width:36px;height:36px;">`
 : `<div class="avatar-placeholder" style="width:36px;height:36px;font-size:0.85rem;">${initials}</div>`;
 return `<div class="friend-suggestion"><div style="display:flex;align-items:center;gap:10px;cursor:pointer;flex:1" onclick="window.location.href='views/profile.html?id=${u._id || u.id}'">${avatarHtml}<div class="info"><div class="name">${escapeHtml(u.fullName)}</div><div class="meta">${u.department || ''} ${u.batch || ''}</div></div></div><button class="add-btn" onclick="sendFriendReq('${u._id}',this)"><i class="fas fa-user-plus"></i></button></div>`;
 }).join('');
 } catch { /* optional */ }
}

async function sendFriendReq(userId, btn) {
 btn.disabled = true; btn.innerHTML = '<i class="fas fa-check"></i>';
 try {
 const res = await apiFetch(`/friends/request/${userId}`, { method: 'POST' });
 const data = await res.json();
 showToast(data.message || 'Request sent!', 'success');
 } catch { btn.disabled = false; btn.innerHTML = '<i class="fas fa-user-plus"></i>'; }
}

// ===== FRIEND REQUESTS =====
async function loadFriendRequests() {
 try {
 const res = await apiFetch('/friends/pending');
 const requests = await res.json();
 const widget = document.getElementById('friendRequestsWidget');
 const list = document.getElementById('friendRequestsList');
 if (requests.length === 0) { widget.style.display = 'none'; return; }
 widget.style.display = 'block';
 list.innerHTML = requests.slice(0, 3).map(r => {
 const initials = getInitials(r.fullName);
 const avatarHtml = r.profilePicture
 ? `<img class="avatar" src="${(window.API_BASE || (function(){var p=window.location.protocol,h=window.location.hostname,po=window.location.port; if(p==='file:') return 'http://localhost:5000'; if(h==='localhost'||h==='127.0.0.1'||h===''){ if(po==='5000') return window.location.origin; if(!po) return window.location.origin.indexOf('5000')!==-1?window.location.origin:'http://localhost:5000'; return 'http://localhost:5000'; } return window.location.origin; })())}${r.profilePicture}" style="width:36px;height:36px;">`
 : `<div class="avatar-placeholder" style="width:36px;height:36px;font-size:0.85rem;">${initials}</div>`;
 return `<div class="friend-suggestion" style="flex-wrap:wrap;gap:6px;">
 <div style="display:flex;align-items:center;gap:10px;cursor:pointer;width:100%;" onclick="window.location.href='views/profile.html?id=${r._id || r.id}'">
 ${avatarHtml}
 <div class="info"><div class="name">${escapeHtml(r.fullName)}</div><div class="meta">${r.department || ''}</div></div>
 </div>
 <div style="display:flex;gap:6px;width:100%;padding-left:46px;">
 <button class="add-btn" style="background:var(--blue);color:white;flex:1;" onclick="acceptReq('${r.id}',this)">Confirm</button>
 <button class="add-btn" style="background:var(--surface-alt);color:var(--text);flex:1;" onclick="declineReq('${r.id}',this)">Delete</button>
 </div></div>`;
 }).join('');
 } catch { /* optional */ }
}

async function acceptReq(id, btn) {
 const parent = btn.closest('.friend-suggestion');
 try {
 await apiFetch(`/friends/accept/${id}`, { method: 'PUT' });
 parent.remove(); showToast('Friend request accepted!', 'success');
 } catch { showToast('Failed', 'error'); }
}
async function declineReq(id, btn) {
 const parent = btn.closest('.friend-suggestion');
 try {
 await apiFetch(`/friends/decline/${id}`, { method: 'PUT' });
 parent.remove();
 } catch { /* optional */ }
}

// ===== ONLINE FRIENDS =====
async function renderOnlineFriends(onlineIds) {
 try {
 const res = await apiFetch('/friends');
 const friends = await res.json();
 const myId = String(currentUser._id || currentUser.id);
 const onlineSet = new Set(onlineIds.map(String));
 const onlineFriends = friends.filter(f => onlineSet.has(String(f._id)) && String(f._id) !== myId);
 const el = document.getElementById('onlineFriendsList');
 if (onlineFriends.length === 0) {
 el.innerHTML = '<div style="padding:10px 16px;font-size:0.82rem;color:var(--text-secondary)">No friends online</div>';
 return;
 }
 el.innerHTML = onlineFriends.map(f => {
 const initials = getInitials(f.fullName);
 const avatarHtml = f.profilePicture
 ? `<div class="online-indicator"><img class="avatar" src="${(window.API_BASE || (function(){var p=window.location.protocol,h=window.location.hostname,po=window.location.port; if(p==='file:') return 'http://localhost:5000'; if(h==='localhost'||h==='127.0.0.1'||h===''){ if(po==='5000') return window.location.origin; if(!po) return window.location.origin.indexOf('5000')!==-1?window.location.origin:'http://localhost:5000'; return 'http://localhost:5000'; } return window.location.origin; })())}${f.profilePicture}" style="width:36px;height:36px;"></div>`
 : `<div class="online-indicator"><div class="avatar-placeholder" style="width:36px;height:36px;font-size:0.85rem;">${initials}</div></div>`;
 return `<div class="online-friend" onclick="window.location.href='views/messenger.html?userId=${f._id}'">${avatarHtml}<span class="name">${escapeHtml(f.fullName)}</span></div>`;
 }).join('');
 } catch { /* optional */ }
}

// ===== NOTIFICATIONS =====
async function loadNotificationCount() {
 try {
 const res = await apiFetch('/notifications/unread-count');
 const data = await res.json();
 const badge = document.getElementById('notifBadge');
 if (data.count > 0) {
 badge.textContent = data.count > 99 ? '99+' : data.count;
 badge.classList.remove('hidden');
 } else {
 badge.classList.add('hidden');
 }
 } catch { /* optional */ }
}

async function toggleNotifPanel(e) {
 if (e) { e.preventDefault(); e.stopPropagation(); }
 const panel = document.getElementById('notifPanel');
 const profileMenu = document.getElementById('profileMenu');
 if (!panel) return;
 if (profileMenu) profileMenu.classList.remove('show');
 // FB-like: always toggle reliably, ensure high z-index and pointer-events
 panel.style.pointerEvents = 'auto';
 panel.style.zIndex = '5000';
 const willShow = !panel.classList.contains('show');
 // Close other dropdowns first
 document.querySelectorAll('.dropdown-menu.show').forEach(m => { if (m !== panel) m.classList.remove('show'); });
 if (willShow) {
 panel.classList.add('show');
 panel.style.display = 'block';
 // Force reflow to ensure display:block before load
 void panel.offsetWidth;
 try { await loadNotifications(); } catch(e){ console.warn('notif load',e); }
 // Ensure still visible even if load fails
 panel.style.display = 'block';
 panel.style.opacity = '1';
 } else {
 panel.classList.remove('show');
 panel.style.display = 'none';
 }
}

async function loadNotifications() {
 try {
 const res = await apiFetch('/notifications');
 const notifs = await res.json();
 const el = document.getElementById('notifList');
 if (notifs.length === 0) { el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-secondary);font-size:0.88rem">No notifications yet</div>'; return; }
 el.innerHTML = notifs.map(n => {
 const initials = getInitials(n.senderName || 'N');
 const avatarHtml = n.senderPic
 ? `<img class="avatar" src="${(window.API_BASE || (function(){var p=window.location.protocol,h=window.location.hostname,po=window.location.port; if(p==='file:') return 'http://localhost:5000'; if(h==='localhost'||h==='127.0.0.1'||h===''){ if(po==='5000') return window.location.origin; if(!po) return window.location.origin.indexOf('5000')!==-1?window.location.origin:'http://localhost:5000'; return 'http://localhost:5000'; } return window.location.origin; })())}${n.senderPic}" style="width:44px;height:44px;">`
 : `<div class="avatar-placeholder" style="width:44px;height:44px;font-size:1rem;">${initials}</div>`;
 const safeLink = (n.link||'').replace(/'/g,"\\'");
 const safeType = (n.type||'').replace(/'/g,"\\'");
 return `<div class="notif-item ${n.isRead ? '' : 'unread'}" onclick="handleNotifClick('${n.id}', '${safeLink}', '${safeType}', '${n.sender_id||''}', this)" style="cursor:pointer;">
 ${avatarHtml}
 <div style="flex:1;min-width:0;">
 <div class="notif-text">${escapeHtml(n.message)}</div>
 <div class="notif-time">${timeAgo(n.created_at)}</div>
 </div>
 ${n.isRead ? '' : '<div class="notif-dot"></div>'}
 </div>`;
 }).join('');
 } catch { /* optional */ }
}
async function fetchPostAndHighlight(postId, type){
 try{
 const res = await apiFetch(`/posts/${postId}`);
 if(!res.ok) throw new Error('not found');
 const post = await res.json();
 const container = document.getElementById('feedContainer');
 if(container && post && post.id){
 // If already exists, just scroll
 let existing = document.getElementById(`post-${postId}`);
 if(existing){
 existing.scrollIntoView({behavior:'smooth', block:'center'});
 existing.style.outline='2px solid var(--blue)';
 existing.style.borderRadius='12px';
 setTimeout(()=>existing.style.outline='',2500);
 if(type==='comment'){ const cc=document.getElementById(`comments-${postId}`); if(cc && !cc.classList.contains('show')) toggleComments(postId); }
 document.getElementById('notifPanel')?.classList.remove('show');
 return true;
 }
 const div=document.createElement('div');
 div.innerHTML=buildPostCard(post);
 const card=div.firstElementChild;
 if(card){
 card.style.outline='2px solid var(--blue)';
 card.style.boxShadow='0 0 0 3px rgba(8,102,255,0.15)';
 card.style.borderRadius='12px';
 container.insertBefore(card, container.firstChild);
 setTimeout(()=>card.scrollIntoView({behavior:'smooth', block:'center'}),120);
 if(type==='comment') setTimeout(()=>toggleComments(postId),650);
 document.getElementById('notifPanel')?.classList.remove('show');
 return true;
 }
 }
 }catch{}
 return false;
}
function handleNotifClick(id, link, type, senderId, el){
 markNotifRead(id, el);
 // Admin/report/ban with no post link — don't navigate like FB (just mark read)
 if(!link && ['admin_delete','report','ban','info','suspension','warn','admin'].includes(type)){
 document.getElementById('notifPanel')?.classList.remove('show');
 document.getElementById('notifPanel').style.display='none';
 return;
 }
 // FB-like: link first, then type fallback — ensures post click goes to exact post
 let target = link || null;
 if(!target){
 if(['comment','reaction','like','tag','mention'].includes(type)){
 target='home.html';
 } else if(senderId){
 target=`views/profile.html?id=${senderId}`;
 } else {
 target='home.html';
 }
 }
 // If target is post hash and we are on home, use FB-like fetch-or-scroll
 if(target.includes('#post-')){
 const postId=target.split('#post-')[1].split(/[&?]/)[0];
 if(window.location.pathname.includes('home.html') || window.location.pathname==='/' || window.location.pathname.endsWith('/home.html')){
 // Try FB fetch-or-scroll
 fetchPostAndHighlight(postId, type).then(found=>{
 if(!found) window.location.href=target;
 });
 return;
 }
 // Normalize for views/* → ../home.html#post-*
 if(window.location.pathname.includes('/views/') && target.startsWith('home.html')) target='../'+target;
 else if(window.location.pathname.includes('/views/') && target.startsWith('views/')) target=target.replace('views/','');
 setTimeout(()=>{ window.location.href=target; }, 120);
 return;
 }
 if(target){
 if(target.startsWith('views/') && window.location.pathname.includes('/views/')) target=target.replace('views/','');
 else if(target.startsWith('home.html') && window.location.pathname.includes('/views/')) target='../'+target;
 else if(target.startsWith('views/') && window.location.pathname.includes('home.html')){
 // keep as is
 }
 setTimeout(()=>{ window.location.href=target; }, 150);
 }
}
async function markNotifRead(id, el) {
 if(el) el.classList.remove('unread');
 el.querySelector('.notif-dot')?.remove();
 await apiFetch(`/notifications/${id}/read`, { method: 'PUT' }).catch(() => {});
 loadNotificationCount();
}

async function markAllNotificationsRead() {
 await apiFetch('/notifications/mark-all-read', { method: 'PUT' }).catch(() => {});
 document.querySelectorAll('.notif-item.unread').forEach(el => el.classList.remove('unread'));
 document.querySelectorAll('.notif-dot').forEach(el => el.remove());
 document.getElementById('notifBadge').classList.add('hidden');
}

// ===== PROFILE MENU =====
function toggleProfileMenu() {
 const menu = document.getElementById('profileMenu');
 const notifPanel = document.getElementById('notifPanel');
 notifPanel.classList.remove('show');
 menu.classList.toggle('show');
}

// ===== SEARCH =====
let searchTimeout = null;
function debounceSearch(query) {
 clearTimeout(searchTimeout);
 searchTimeout = setTimeout(() => performSearch(query), 300);
}

async function performSearch(query) {
 console.log('[Search] query', query);
 if (!query || query.trim().length < 2) { hideSearchDrop(); return; }
 try {
 const res = await apiFetch(`/search?q=${encodeURIComponent(query)}`);
 console.log('[Search] status', res.status);
 const data = await res.json();
 console.log('[Search] data', data);
 const drop = document.getElementById('searchDropdown');
 if(!drop){ console.warn('[Search] dropdown not found'); return; }
 const all = [
   ...(data.users || []).map(u => ({ ...u, type: 'user' })),
   ...(data.posts || []).map(p => ({ ...p, type: 'post' })),
   ...(data.resources || []).map(r => ({ ...r, type: 'resource' })),
   ...(data.blood || []).map(b => ({ ...b, type: 'blood' })),
   ...(data.housing || []).map(h => ({ ...h, type: 'housing' })),
   ...(data.marketplace || []).map(m => ({ ...m, type: 'marketplace' })),
   ...(data.events || []).map(e => ({ ...e, type: 'event' })),
   ...(data.lostfound || []).map(l => ({ ...l, type: 'lostfound' }))
 ];
 if (all.length === 0) { drop.innerHTML = '<div style="padding:12px 16px;color:var(--text-secondary);font-size:0.85rem">No results found — try name, resource, blood group, housing, product, event</div>'; drop.classList.add('show'); return; }
 drop.innerHTML = all.slice(0, 10).map(item => {
 if (item.type === 'user') {
 const initials = getInitials(item.fullName);
 const avatarHtml = item.profilePicture
 ? `<img class="avatar" src="${(window.API_BASE || (function(){var p=window.location.protocol,h=window.location.hostname,po=window.location.port; if(p==='file:') return 'http://localhost:5000'; if(h==='localhost'||h==='127.0.0.1'||h===''){ if(po==='5000') return window.location.origin; if(!po) return window.location.origin.indexOf('5000')!==-1?window.location.origin:'http://localhost:5000'; return 'http://localhost:5000'; } return window.location.origin; })())}${item.profilePicture}" style="width:36px;height:36px;">`
 : `<div class="avatar-placeholder" style="width:36px;height:36px;font-size:0.85rem;">${initials}</div>`;
 return `<div class="search-result-item" onmousedown="event.preventDefault(); window.location.href='views/profile.html?id=${item._id}'" style="cursor:pointer;">${avatarHtml}<div class="info"><div class="name">${escapeHtml(item.fullName)}</div><div class="meta">${item.department || ''} ${item.role || ''} • User</div></div><i class="fas fa-user" style="color:#0866ff"></i></div>`;
 } else if (item.type === 'post') {
 return `<div class="search-result-item" onmousedown="event.preventDefault(); goToPost('${item._id}')" style="cursor:pointer;"><i class="fas fa-file-alt" style="font-size:1.5rem;color:var(--text-secondary)"></i><div class="info"><div class="name">${escapeHtml((item.content || '').slice(0, 60))}...</div><div class="meta">Post • ${item.fullName || ''}</div></div><i class="fas fa-chevron-right" style="color:#b0b3b8"></i></div>`;
 } else if (item.type === 'resource') {
 return `<div class="search-result-item" onmousedown="event.preventDefault(); window.location.href='views/resources.html?search=${encodeURIComponent(item.title)}'" style="cursor:pointer;"><i class="fas fa-book-open" style="font-size:1.5rem;color:#0ea5e9"></i><div class="info"><div class="name">${escapeHtml(item.title)}</div><div class="meta">Resource • ${esc(item.department||'')}</div></div><i class="fas fa-chevron-right" style="color:#b0b3b8"></i></div>`;
 } else if (item.type === 'blood') {
 return `<div class="search-result-item" onmousedown="event.preventDefault(); window.location.href='views/blood-donation.html'" style="cursor:pointer;"><i class="fas fa-heartbeat" style="font-size:1.5rem;color:#e41e3f"></i><div class="info"><div class="name">${esc(item.bloodGroup)} • ${esc(item.patientName)}</div><div class="meta">Blood • ${esc(item.hospital||'')} • ${esc(item.urgency||'')}</div></div><i class="fas fa-chevron-right" style="color:#b0b3b8"></i></div>`;
 } else if (item.type === 'housing') {
 return `<div class="search-result-item" onmousedown="event.preventDefault(); window.location.href='views/home-portal.html'" style="cursor:pointer;"><i class="fas fa-home" style="font-size:1.5rem;color:#10b981"></i><div class="info"><div class="name">${escapeHtml(item.title)}</div><div class="meta">Housing • ${esc(item.location)} • ${esc(item.price)}</div></div><i class="fas fa-chevron-right" style="color:#b0b3b8"></i></div>`;
 } else if (item.type === 'marketplace') {
 return `<div class="search-result-item" onmousedown="event.preventDefault(); window.location.href='views/marketplace.html'" style="cursor:pointer;"><i class="fas fa-store" style="font-size:1.5rem;color:#ec4899"></i><div class="info"><div class="name">${escapeHtml(item.title)}</div><div class="meta">Marketplace • ${esc(item.category||'')} • ৳${esc(item.price||'')}</div></div><i class="fas fa-chevron-right" style="color:#b0b3b8"></i></div>`;
 } else if (item.type === 'event') {
 return `<div class="search-result-item" onmousedown="event.preventDefault(); window.location.href='views/events.html'" style="cursor:pointer;"><i class="fas fa-calendar-alt" style="font-size:1.5rem;color:#f59e0b"></i><div class="info"><div class="name">${escapeHtml(item.title)}</div><div class="meta">Event • ${esc(item.venue||'')} • ${esc(item.department||'')}</div></div><i class="fas fa-chevron-right" style="color:#b0b3b8"></i></div>`;
 } else if (item.type === 'lostfound') {
 return `<div class="search-result-item" onmousedown="event.preventDefault(); window.location.href='views/lostfound.html'" style="cursor:pointer;"><i class="fas fa-search-location" style="font-size:1.5rem;color:#f97316"></i><div class="info"><div class="name">${escapeHtml(item.title)}</div><div class="meta">${esc(item.type)} • ${esc(item.location)}</div></div><i class="fas fa-chevron-right" style="color:#b0b3b8"></i></div>`;
 } else { return ''; }
 }).join('') + `<div style="padding:8px 12px;text-align:center;border-top:1px solid var(--border);margin-top:6px;"><a href="views/search.html?q=${encodeURIComponent(query)}" style="font-size:0.82rem;color:#0866ff;font-weight:700;text-decoration:none;">See all results for "${escapeHtml(query)}" →</a></div>`;
 drop.classList.add('show');
 } catch { hideSearchDrop(); }
}
function goToPost(postId){
 hideSearchDrop();
 const el = document.getElementById(`post-${postId}`);
 if(el){
 el.scrollIntoView({behavior:'smooth', block:'center'});
 el.style.outline='2px solid var(--blue)';
 el.style.borderRadius='12px';
 setTimeout(()=> el.style.outline='', 2000);
 } else {
 // If not on feed, go to home with hash and highlight after load
 window.location.href = `home.html#post-${postId}`;
 }
}
// Auto-scroll to post if hash present (e.g., home.html#post-123) — FB-like, fetch if not in feed (deep link from notification)
(function(){
 const hash = window.location.hash;
 if(hash && hash.startsWith('#post-')){
 const postId=hash.replace('#post-','').split(/[&?]/)[0];
 setTimeout(async()=>{
 let el=document.getElementById('post-'+postId);
 if(el){ el.scrollIntoView({behavior:'smooth', block:'center'}); el.style.outline='2px solid var(--blue)'; el.style.borderRadius='12px'; setTimeout(()=>el.style.outline='', 2500); return; }
 // Not in current feed (paginated) — fetch and show on top like FB deep link
 try{
 const res=await apiFetch(`/posts/${postId}`);
 if(res.ok){
 const post=await res.json();
 const container=document.getElementById('feedContainer');
 if(container && post && post.id){
 const div=document.createElement('div');
 div.innerHTML=buildPostCard(post);
 const card=div.firstElementChild;
 if(card){
 card.style.outline='2px solid var(--blue)';
 card.style.boxShadow='0 0 0 3px rgba(8,102,255,0.15)';
 card.style.borderRadius='12px';
 container.insertBefore(card, container.firstChild);
 setTimeout(()=>card.scrollIntoView({behavior:'smooth', block:'center'}),100);
 }
 }
 }
 }catch{}
 }, 900);
 }
})();
function showSearchDrop() { if (document.getElementById('navSearch').value) document.getElementById('searchDropdown').classList.add('show'); }
function hideSearchDrop() { document.getElementById('searchDropdown').classList.remove('show'); }
// Prevent search dropdown from closing when clicking inside it (FB-like)
document.addEventListener('DOMContentLoaded', ()=>{
 const drop=document.getElementById('searchDropdown');
 const input=document.getElementById('navSearch');
 if(drop) drop.addEventListener('mousedown', e=> e.preventDefault());
 if(input) input.addEventListener('blur', ()=> setTimeout(hideSearchDrop, 300));
});

// ===== LIGHTBOX =====
function openLightbox(src) {
 document.getElementById('lightbox').classList.add('show');
 document.getElementById('lightboxImg').src = src;
}
function closeLightbox() { document.getElementById('lightbox').classList.remove('show'); }

// ===== SHARE =====
function sharePost(postId) {
 // Remove any existing share modal
 document.getElementById('shareModal')?.remove();
 const baseForShare = (window.API_BASE || (function(){var p=window.location.protocol,h=window.location.hostname,po=window.location.port; if(p==='file:') return 'http://localhost:5000'; if(h==='localhost'||h==='127.0.0.1'||h===''){ if(po==='5000') return window.location.origin; if(!po) return window.location.origin.indexOf('5000')!==-1?window.location.origin:'http://localhost:5000'; return 'http://localhost:5000'; } return window.location.origin; })());
 const shareUrl = `${baseForShare}${window.location.pathname.includes('/views/') ? '' : ''}?post=${postId}`;
 const modal = document.createElement('div');
 modal.id = 'shareModal';
 modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;';
 modal.innerHTML = `
 <div style="background:var(--surface);border-radius:16px;width:100%;max-width:460px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.2);">
 <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--border);">
 <h3 style="font-weight:800;font-size:1.05rem;">Share Post</h3>
 <button onclick="document.getElementById('shareModal').remove()" style="background:none;border:none;font-size:1.3rem;cursor:pointer;color:var(--text-secondary);line-height:1;">&times;</button>
 </div>
 <div style="padding:16px 20px;">
 <!-- Write something -->
 <div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:14px;">
 <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#0866ff,#0550c1);color:white;display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0;">${getInitials(currentUser?.fullName)}</div>
 <textarea id="shareCaption" placeholder="Say something about this..." style="flex:1;border:1.5px solid var(--border);border-radius:10px;padding:10px 12px;font-family:Inter,sans-serif;font-size:0.9rem;background:var(--surface);color:var(--text);outline:none;resize:none;min-height:70px;"></textarea>
 </div>
 <!-- Share options -->
 <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">
 <button onclick="shareToTimeline('${postId}')" style="display:flex;align-items:center;justify-content:center;gap:8px;padding:11px;background:#e7f0ff;color:#0866ff;border:none;border-radius:10px;font-family:Inter,sans-serif;font-size:0.88rem;font-weight:700;cursor:pointer;">
 <i class="fas fa-user"></i> Your Timeline
 </button>
 <button onclick="copyShareLink('${shareUrl}')" style="display:flex;align-items:center;justify-content:center;gap:8px;padding:11px;background:var(--bg);color:var(--text);border:1.5px solid var(--border);border-radius:10px;font-family:Inter,sans-serif;font-size:0.88rem;font-weight:700;cursor:pointer;">
 <i class="fas fa-link"></i> Copy Link
 </button>
 <button onclick="window.open('https://wa.me/?text='+encodeURIComponent('${shareUrl}'),'_blank')" style="display:flex;align-items:center;justify-content:center;gap:8px;padding:11px;background:#d1fae5;color:#059669;border:none;border-radius:10px;font-family:Inter,sans-serif;font-size:0.88rem;font-weight:700;cursor:pointer;">
 <i class="fab fa-whatsapp"></i> WhatsApp
 </button>
 <button onclick="window.open('https://www.facebook.com/sharer/sharer.php?u='+encodeURIComponent('${shareUrl}'),'_blank')" style="display:flex;align-items:center;justify-content:center;gap:8px;padding:11px;background:#e7f0ff;color:#0866ff;border:none;border-radius:10px;font-family:Inter,sans-serif;font-size:0.88rem;font-weight:700;cursor:pointer;">
 <i class="fab fa-facebook"></i> Facebook
 </button>
 </div>
 <!-- Link box -->
 <div style="display:flex;gap:8px;align-items:center;background:var(--bg);border:1.5px solid var(--border);border-radius:10px;padding:10px 12px;">
 <i class="fas fa-link" style="color:#65676b;font-size:0.85rem;"></i>
 <span style="flex:1;font-size:0.8rem;color:#65676b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${shareUrl}</span>
 <button onclick="copyShareLink('${shareUrl}')" id="copyBtn-${postId}" style="background:#0866ff;color:white;border:none;border-radius:6px;padding:5px 12px;font-family:Inter,sans-serif;font-size:0.78rem;font-weight:700;cursor:pointer;">Copy</button>
 </div>
 </div>
 </div>`;
 modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
 document.body.appendChild(modal);
}

async function shareToTimeline(postId) {
 const caption = document.getElementById('shareCaption')?.value?.trim() || '';
 try {
 const res = await apiFetch('/posts', { method: 'POST', body: JSON.stringify({ content: caption ? `${caption}\n\n[Shared post]` : '[Shared post]', sharedPostId: postId }) });
 document.getElementById('shareModal')?.remove();
 showToast(' Shared to your timeline!', 'success');
 } catch { showToast('Failed to share', 'error'); }
}

function copyShareLink(url) {
 if (navigator.clipboard) {
 navigator.clipboard.writeText(url).then(() => showToast(' Link copied to clipboard!', 'success'));
 } else {
 const ta = document.createElement('textarea');
 ta.value = url; document.body.appendChild(ta); ta.select();
 document.execCommand('copy'); document.body.removeChild(ta);
 showToast(' Link copied!', 'success');
 }
}

// ===== DARK MODE =====
function toggleDarkMode() {
 const isDark = document.body.getAttribute('data-theme') === 'dark';
 document.body.setAttribute('data-theme', isDark ? '' : 'dark');
 localStorage.setItem('darkMode', isDark ? '0' : '1');
 document.getElementById('darkModeIcon').className = isDark ? 'fas fa-moon' : 'fas fa-sun';
}
function applyDarkMode() {
 if (localStorage.getItem('darkMode') === '1') {
 document.body.setAttribute('data-theme', 'dark');
 document.getElementById('darkModeIcon').className = 'fas fa-sun';
 }
}

// ===== OUTSIDE CLICK — FB-like reliable =====
function handleOutsideClick(e) {
 // Notification panel — robust check with stopPropagation fix
 const notifBtn = document.getElementById('notifBtn');
 const notifPanel = document.getElementById('notifPanel');
 if (notifPanel && notifPanel.classList.contains('show')) {
 if (!e.target.closest('#notifBtn') && !e.target.closest('#notifPanel') && !notifPanel.contains(e.target)) {
 notifPanel.classList.remove('show');
 }
 }
 if (!e.target.closest('#profileMenuBtn') && !e.target.closest('#profileMenu')) document.getElementById('profileMenu')?.classList.remove('show');
 // Only close post menus if not clicking inside any dropdown or its trigger
 if (!e.target.closest('.post-menu-btn') && !e.target.closest('.dropdown-menu')) {
 document.querySelectorAll('.dropdown-menu').forEach(m => {
 // Don't close notifPanel here — handled above
 if (m.id !== 'notifPanel' && m.id !== 'profileMenu') m.classList.remove('show');
 });
 }
 if (!e.target.closest('.nav-search')) hideSearchDrop();
}
// Ensure notif button always works even if inline fails — attach directly like FB (immediate + DOMContentLoaded)
function bindNotifButton(){
 const btn = document.getElementById('notifBtn');
 if (btn && !btn.dataset.bound) {
 btn.dataset.bound = '1';
 btn.addEventListener('click', toggleNotifPanel, { capture: false });
 const icon = btn.querySelector('i');
 if (icon) icon.style.pointerEvents = 'none';
 const badge = document.getElementById('notifBadge');
 if (badge) badge.style.pointerEvents = 'none';
 }
 requestNotifPermission();
}
if(document.readyState === 'loading'){
 document.addEventListener('DOMContentLoaded', bindNotifButton);
} else {
 bindNotifButton();
}
// Also bind after 500ms as fallback for slow render
setTimeout(bindNotifButton, 500);
setTimeout(bindNotifButton, 1500);

// ===== AUTH =====
function logout() {
 localStorage.removeItem('token');
 localStorage.removeItem('user');
 // Works for both Electron and browser
 const isViews = window.location.pathname.includes('/views/');
 window.location.href = isViews ? '../index.html' : 'index.html';
}

function parseUtcDate(dateStr) {
 if (!dateStr) return new Date();
 if (typeof dateStr === 'string' && !dateStr.endsWith('Z') && !dateStr.includes('T')) {
 return new Date(dateStr.replace(' ', 'T') + 'Z');
 }
 return new Date(dateStr);
}

function timeAgo(dateStr) {
 if (!dateStr) return '';
 const past = parseUtcDate(dateStr).getTime();
 const diff = Math.max(0, (Date.now() - past) / 1000);
 if (diff < 60) return 'Just now';
 if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
 if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
 if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
 return parseUtcDate(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function formatTime(d){
 if(!d) return '';
 try{
 const dt = parseUtcDate(d);
 return dt.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
 }catch{ return timeAgo(d); }
}
function formatDate(d){
 if(!d) return '';
 try{
 const dt = parseUtcDate(d);
 const now=new Date();
 const diff=Math.floor((now-dt)/86400000);
 if(diff===0) return 'Today';
 if(diff===1) return 'Yesterday';
 return dt.toLocaleDateString('en-US',{month:'short',day:'numeric', year: dt.getFullYear()!==now.getFullYear()?'numeric':undefined});
 }catch{ return timeAgo(d); }
}

function escapeHtml(s) {
 return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showToast(msg, type = 'info') {
 const container = document.getElementById('toast-container');
 const toast = document.createElement('div');
 toast.className = `toast ${type}`;
 const icon = type === 'success' ? '' : type === 'error' ? '❌' : 'ℹ️';
 toast.innerHTML = `${icon} ${escapeHtml(msg)}`;
 container.appendChild(toast);
 setTimeout(() => toast.remove(), 3100);
}

// ===== STORY A-Z NEXUS EXTENSIONS (Messenger + Instagram + Nexus Signature) =====
let storyViewerPaused=false;
let storyVoiceFile=null;
async function loadStoryDependencies(){
 try{
 const [evRes, grpRes, chRes] = await Promise.all([
 apiFetch('/events').then(r=>r.json()).catch(()=>[]),
 apiFetch('/groups').then(r=>r.json()).catch(()=>[]),
 apiFetch('/channels').then(r=>r.json()).catch(()=>[])
 ]);
 // Helper to populate datalist — user-editable, shows name not just ID (fix "1" + black dropdown)
 function populateDatalist(inputId, datalistId, items, getValue, getLabel){
 const input=document.getElementById(inputId);
 const dl=document.getElementById(datalistId);
 if(!input || !dl) return;
 dl.innerHTML='';
 // Ensure input is editable and placeholder is clean
 if(!input.dataset.editableInit){
 input.dataset.editableInit='1';
 // keep light style for datalist dropdown
 input.style.background='var(--bg)';
 input.style.color='var(--text)';
 }
 if(Array.isArray(items)){
 const arr = Array.isArray(items) ? items : (items.groups||items.channels||[]);
 const seen=new Set();
 arr.slice(0,20).forEach(it=>{
 const val=getValue(it);
 const label=getLabel(it);
 // Use display name as value so dropdown shows "DIU Tech Fest 2026" not "1"
 const displayName = (it.title||it.name||String(val)).trim();
 if(!displayName || seen.has(displayName)) return;
 seen.add(displayName);
 const o=document.createElement('option');
 o.value=displayName;
 // Keep ID in data attribute for mapping back if needed
 o.dataset.id=String(val);
 o.textContent=label;
 // For datalist, browser shows value; label is hint. Use value as name, not ID.
 dl.appendChild(o);
 });
 // Add custom hint option
 if(arr.length===0){
 const o=document.createElement('option');
 o.value='';
 o.textContent='— No items, type custom —';
 o.disabled=true;
 dl.appendChild(o);
 }
 }
 }
 // Events → datalist (show title, not ID)
 populateDatalist('storyEventSelect','eventDatalist', evRes, ev=>ev.id||ev._id, ev=>` ${ev.title||ev.name}`);
 // Groups → datalist
 const grpArr = Array.isArray(grpRes) ? grpRes : (grpRes.groups||[]);
 populateDatalist('storyGroupSelect','groupDatalist', grpArr, g=>g.id||g._id, g=>`📢 ${g.name}`);
 // Channels → datalist
 const chArr = Array.isArray(chRes) ? chRes : (chRes.channels||[]);
 populateDatalist('storyChannelSelect','channelDatalist', chArr, ch=>ch.id, ch=>`📣 ${ch.name}`);
 // Collaborative — fix duplicate and show title
 try{
 const r=await apiFetch('/stories/collab/1').then(r=>r.json()).catch(()=>null);
 const collabItems = r && r.collab ? [r.collab] : (r && Array.isArray(r) ? r : []);
 populateDatalist('storyCollabSelect','collabDatalist', collabItems, c=>c.id||c._id, c=>`👥 ${c.title||c.name}`);
 }catch{}
 console.log('[Story] dependencies loaded — all fields user-editable');
 }catch(e){ console.warn('loadStoryDependencies',e); }
}
function setStoryType(type, btn){
 currentStoryMode=type;
 document.querySelectorAll('.story-type-tab').forEach(b=>{b.style.background='var(--bg)';b.style.color='var(--text)';b.style.borderColor='var(--border)';});
 if(btn){btn.style.background='var(--blue)';btn.style.color='white';btn.style.borderColor='var(--blue)';}
 document.getElementById('storyBtnGroup').style.display='none';
 document.getElementById('storyImgPreview').style.display='none';
 document.getElementById('storyVideoPreview').style.display='none';
 document.getElementById('storyTextOnlyInput').style.display='none';
 document.getElementById('storyColorPicker').style.display='none';
 document.getElementById('storyVoicePreview').style.display='none';
 document.getElementById('storyTextInput').style.display='none';
 document.getElementById('uploadStoryBtn').style.display='block';
 if(type==='text'){
 document.getElementById('storyTextOnlyInput').style.display='block';
 document.getElementById('storyColorPicker').style.display='flex';
 document.getElementById('storyPreviewBox').style.background=currentStoryBg;
 } else if(type==='voice'){
 document.getElementById('storyVoicePreview').style.display='flex';
 document.getElementById('storyPreviewBox').style.background='linear-gradient(135deg,#1e293b,#0f172a)';
 } else {
 // image/video
 document.getElementById('storyTextInput').style.display='block';
 if(type==='image') document.getElementById('storyImgPreview').style.display='block';
 else document.getElementById('storyVideoPreview').style.display='block';
 // If file already selected, show
 const file=document.getElementById('storyMediaInput').files[0];
 if(file){
 const url=URL.createObjectURL(file);
 if(file.type.startsWith('video/')){
 const v=document.getElementById('storyVideoPreview');
 v.src=url; v.style.display='block';
 document.getElementById('storyImgPreview').style.display='none';
 } else {
 const img=document.getElementById('storyImgPreview');
 img.src=url; img.style.display='block';
 document.getElementById('storyVideoPreview').style.display='none';
 }
 } else {
 // prompt file picker
 if(type==='image' || type==='video') document.getElementById('storyMediaInput').click();
 }
 }
}
function applyStoryFilter(val){
 const img=document.getElementById('storyImgPreview');
 const vid=document.getElementById('storyVideoPreview');
 if(img) img.style.filter=val;
 if(vid) vid.style.filter=val;
}
function previewStoryVoice(input){
 if(input.files[0]){
 storyVoiceFile=input.files[0];
 currentStoryMode='voice';
 document.getElementById('voiceFileName').textContent=input.files[0].name;
 const url=URL.createObjectURL(input.files[0]);
 document.getElementById('storyVoiceAudio').src=url;
 document.getElementById('storyVoicePreview').style.display='flex';
 document.getElementById('storyBtnGroup').style.display='none';
 document.getElementById('storyTextInput').style.display='block';
 document.getElementById('uploadStoryBtn').style.display='block';
 setStoryType('voice', document.querySelector('[data-type="voice"]'));
 }
}
function toggleQuizBuilder(){
 const el=document.getElementById('quizBuilder');
 el.style.display = el.style.display==='none' || !el.style.display ? 'flex' : 'none';
 if(el.style.display==='flex') document.getElementById('pollBuilder').style.display='none';
}
function togglePollBuilder(){
 const el=document.getElementById('pollBuilder');
 el.style.display = el.style.display==='none' || !el.style.display ? 'flex' : 'none';
 if(el.style.display==='flex') document.getElementById('quizBuilder').style.display='none';
}
async function aiSuggestStory(){
 const style=document.getElementById('aiStyleSelect').value;
 let content='';
 if(currentStoryMode==='text') content=document.getElementById('storyTextOnlyInput').value;
 else content=document.getElementById('storyTextInput').value || document.getElementById('storyTextOnlyInput').value || 'Campus moment';
 if(!content) return showToast('Enter caption first','error');
 const box=document.getElementById('aiSuggestBox');
 box.style.display='block';
 box.innerHTML='<i class="fas fa-spinner fa-spin"></i> AI thinking...';
 try{
 const res=await apiFetch('/stories/ai/suggest',{method:'POST', body:JSON.stringify({content, style})});
 const data=await res.json();
 const s=data.suggestions;
 box.innerHTML=`<div style="font-weight:800; color:#0369a1; margin-bottom:4px;">${s.emoji||''} ${style||'AI'} suggestion</div>
 <div style="background:var(--bg); padding:8px; border-radius:8px; margin-bottom:6px; font-weight:600;">${escapeHtml(s.caption)}</div>
 <div style="font-size:0.72rem; opacity:0.7;">${s.hashtags.join(' ')}</div>
 <button onclick="applyAiSuggest('${escapeHtml(s.caption).replace(/'/g,"\\'")}','${s.bg}')" style="margin-top:6px; background:#0369a1;color:white;border:none;padding:5px 10px;border-radius:6px;font-size:0.72rem;cursor:pointer;">Apply</button>`;
 // store for apply
 box.dataset.caption=s.caption;
 box.dataset.bg=s.bg;
 }catch{ box.innerHTML='AI failed'; }
}
function applyAiSuggest(caption, bg){
 const box=document.getElementById('aiSuggestBox');
 const cap=box.dataset.caption || caption;
 const background=box.dataset.bg || bg;
 if(currentStoryMode==='text'){
 document.getElementById('storyTextOnlyInput').value=cap;
 if(background){ currentStoryBg=background; document.getElementById('storyPreviewBox').style.background=background; }
 } else {
 document.getElementById('storyTextInput').value=cap;
 }
 showToast('AI applied');
}
const __originalOpenStoryCreator = openStoryCreator;
openStoryCreator = function(){
 __originalOpenStoryCreator();
 // load dependencies
 loadStoryDependencies();
 // reset
 currentStoryBg='#232526';
 document.getElementById('storyPreviewBox').style.background='var(--bg)';
 document.getElementById('storyFilter').value='';
 document.getElementById('storyCampusTag').value='';
 document.getElementById('storyCourseCode').value='';
 document.getElementById('storyChallengeTag').value='';
 document.getElementById('storyLocation').value='';
 document.getElementById('storyEventSelect').value='';
 document.getElementById('storyCollabSelect').value='';
 document.getElementById('storyGroupSelect').value='';
 document.getElementById('storyChannelSelect').value='';
 document.getElementById('stickerMention').value='';
 document.getElementById('stickerHashtag').value='';
 document.getElementById('stickerMusic').value='';
 document.getElementById('stickerLink').value='';
 document.getElementById('quizBuilder').style.display='none';
 document.getElementById('pollBuilder').style.display='none';
 document.getElementById('aiSuggestBox').style.display='none';
 document.getElementById('allowReplies').checked=true;
 document.getElementById('allowReactions').checked=true;
 document.getElementById('allowSharing').checked=true;
 document.getElementById('isExclusive').checked=false;
 storyVoiceFile=null;
 document.getElementById('storyVoicePreview').style.display='none';
 // reset type tabs
 document.querySelectorAll('.story-type-tab').forEach((b,i)=>{ if(i===0){b.style.background='var(--blue)';b.style.color='white';b.style.borderColor='var(--blue)';} else {b.style.background='var(--bg)';b.style.color='var(--text)';b.style.borderColor='var(--border)';}});
};
const __originalSubmitStory = submitStory;
submitStory = async function(){
 const formData=new FormData();
 formData.append('type', currentStoryMode);
 formData.append('privacy', document.getElementById('storyPrivacy').value);
 formData.append('audience', document.getElementById('storyPrivacy').value);
 formData.append('bg_color', currentStoryBg);
 formData.append('filter', document.getElementById('storyFilter').value||'');
 // Nexus fields
 const campus=document.getElementById('storyCampusTag').value;
 if(campus) formData.append('campus_tag', campus);
 const course=document.getElementById('storyCourseCode').value.trim();
 if(course) formData.append('course_code', course);
 const challenge=document.getElementById('storyChallengeTag').value.trim();
 if(challenge) formData.append('challenge_tag', challenge);
 const location=document.getElementById('storyLocation').value.trim();
 if(location) formData.append('location', location);
 const eventId=document.getElementById('storyEventSelect').value;
 if(eventId) formData.append('event_id', eventId);
 const collabId=document.getElementById('storyCollabSelect').value;
 if(collabId) formData.append('collaborative_id', collabId);
 const groupId=document.getElementById('storyGroupSelect').value;
 if(groupId) formData.append('group_id', groupId);
 const channelId=document.getElementById('storyChannelSelect').value;
 if(channelId) formData.append('channel_id', channelId);
 // Stickers
 const stickers={};
 const mention=document.getElementById('stickerMention').value.trim();
 if(mention) stickers.mention=mention;
 const hashtag=document.getElementById('stickerHashtag').value.trim();
 if(hashtag) stickers.hashtag=hashtag;
 const music=document.getElementById('stickerMusic').value.trim();
 if(music) stickers.music=music;
 const link=document.getElementById('stickerLink').value.trim();
 if(link) stickers.link=link;
 if(Object.keys(stickers).length) formData.append('stickers', JSON.stringify(stickers));
 if(music) formData.append('music_title', music);
 if(location) formData.append('location', location);
 // AI style
 const aiStyle=document.getElementById('aiStyleSelect').value;
 if(aiStyle) formData.append('ai_style', aiStyle);
 // Quiz
 if(document.getElementById('quizBuilder').style.display==='flex'){
 const q=document.getElementById('quizQuestion').value.trim();
 const o0=document.getElementById('quizOpt0').value.trim();
 const o1=document.getElementById('quizOpt1').value.trim();
 const o2=document.getElementById('quizOpt2').value.trim();
 const o3=document.getElementById('quizOpt3').value.trim();
 const correct=document.getElementById('quizCorrect').value;
 if(q && o0 && o1){
 const quiz={question:q, options:[o0,o1,o2,o3].filter(Boolean), correct, explanation:''};
 formData.append('quiz_data', JSON.stringify(quiz));
 }
 }
 // Poll
 if(document.getElementById('pollBuilder').style.display==='flex'){
 const q=document.getElementById('pollQuestion').value.trim();
 const o0=document.getElementById('pollOpt0').value.trim();
 const o1=document.getElementById('pollOpt1').value.trim();
 const o2=document.getElementById('pollOpt2').value.trim();
 if(q && o0 && o1){
 const poll={question:q, options:[o0,o1,o2].filter(Boolean), votes: Array([o0,o1,o2].filter(Boolean).length).fill(0), voters:{}};
 formData.append('poll_data', JSON.stringify(poll));
 }
 }
 formData.append('allow_replies', document.getElementById('allowReplies').checked?'1':'0');
 formData.append('allow_reactions', document.getElementById('allowReactions').checked?'1':'0');
 formData.append('allow_sharing', document.getElementById('allowSharing').checked?'1':'0');
 formData.append('is_exclusive', document.getElementById('isExclusive').checked?'1':'0');

 // Content / media — allow Quiz/Poll without image (fix "image char a share er kono option ase na")
 const hasQuizNow = document.getElementById('quizBuilder').style.display==='flex' && document.getElementById('quizQuestion').value.trim() && document.getElementById('quizOpt0').value.trim() && document.getElementById('quizOpt1').value.trim();
 const hasPollNow = document.getElementById('pollBuilder').style.display==='flex' && document.getElementById('pollQuestion').value.trim() && document.getElementById('pollOpt0').value.trim() && document.getElementById('pollOpt1').value.trim();
 if(currentStoryMode==='image' || currentStoryMode==='video'){
 const file=document.getElementById('storyMediaInput').files[0];
 if(!file && !hasQuizNow && !hasPollNow){ showToast('Select photo/video — or keep Quiz/Poll for text share','error'); return; }
 if(file) formData.append('media', file);
 const cap=document.getElementById('storyTextInput').value.trim();
 if(cap) formData.append('caption', cap);
 // If no file but quiz/poll, treat as text story with quiz/poll (so no image required)
 if(!file && (hasQuizNow||hasPollNow)){
 formData.set('type','text');
 formData.append('content', cap||'Quiz/Poll Story');
 } else {
 formData.append('content', cap||'Image Story');
 }
 } else if(currentStoryMode==='voice'){
 const file=document.getElementById('storyVoiceInput').files[0] || storyVoiceFile;
 if(!file){ showToast('Select voice file','error'); return; }
 formData.append('media', file);
 const cap=document.getElementById('storyTextInput').value.trim();
 if(cap) formData.append('caption', cap);
 formData.append('content', cap||'Voice Story');
 formData.append('type','voice');
 } else {
 const text=document.getElementById('storyTextOnlyInput').value.trim();
 // Allow text quiz/poll without extra text
 if(!text && !hasQuizNow && !hasPollNow){ showToast('Enter text or add Quiz/Poll','error'); return; }
 formData.append('content', text|| (hasQuizNow||hasPollNow ? 'Quiz/Poll Story' : 'Text Story'));
 formData.append('caption', text||'Quiz/Poll Story');
 }

 const isExcl = document.getElementById('isExclusive').checked;
 document.getElementById('uploadStoryBtn').innerText='Uploading...';
 document.getElementById('uploadStoryBtn').disabled=true;
 try{
 const res=await fetch(API + '/stories', {method:'POST', headers:{'Authorization':'Bearer '+token}, body:formData});
 const data=await res.json().catch(()=>({}));
 if(!res.ok) throw new Error(data.message||`Server error ${res.status}`);
 if(isExcl) showToast(' Exclusive story saved! Check My Highlights', 'success');
 else showToast('Story published! ', 'success');
  closeStoryCreator();
  // Super fast: instant reload (no 300ms wait) + optimistic
  loadStories(); loadExplore('trending'); loadNexusNow();
  setTimeout(()=>{ loadStories(); }, 400); // second refresh to ensure DB commit
 }catch(e){
 console.error('Story publish failed', e);
 const msg = e.message && e.message.includes('Failed to fetch') ? 'Server not reachable. Is server running? (npm run server)' : e.message;
 showToast(msg||'Upload failed - check console','error');
 }
 document.getElementById('uploadStoryBtn').innerText=' Share to Story';
 document.getElementById('uploadStoryBtn').disabled=false;
};

// ── Enhanced Viewer ───────────────────────────────────────────────────
const __origRenderCurrentStory = renderCurrentStory;
renderCurrentStory = function(){
 clearTimeout(storyTimeout);
 if(viewingUserIndex >= currentStoriesData.length) return closeStoryViewer();
 const user=currentStoriesData[viewingUserIndex];
 if(!user || viewingStoryIndex >= user.stories.length){
 viewingUserIndex++; viewingStoryIndex=0;
 return renderCurrentStory();
 }
 const story=user.stories[viewingStoryIndex];
 // Update header
 document.getElementById('svAvatar').src=((window.API_BASE || (function(){var p=window.location.protocol,h=window.location.hostname,po=window.location.port; if(p==='file:') return 'http://localhost:5000'; if(h==='localhost'||h==='127.0.0.1'||h===''){ if(po==='5000') return window.location.origin; if(!po) return window.location.origin.indexOf('5000')!==-1?window.location.origin:'http://localhost:5000'; return 'http://localhost:5000'; } return window.location.origin; })())) + (user.profilePicture||'');
 document.getElementById('svAvatar').onerror=function(){this.style.display='none';};
 document.getElementById('svName').textContent=user.fullName;
 document.getElementById('svTimeText').textContent=formatTime(story.created_at);
 const campTag=document.getElementById('svCampusTag');
 if(story.campus_tag){ campTag.textContent=' '+story.campus_tag; campTag.style.display='inline-block'; } else campTag.style.display='none';
 const courseTag=document.getElementById('svCourseTag');
 if(story.course_code){ courseTag.textContent=' '+story.course_code; courseTag.style.display='inline-block'; } else courseTag.style.display='none';
 // Own story handling (hide reply for self, show viewers)
 const myId2=String(currentUser._id||currentUser.id);
 const isOwnViewer=String(user.user_id)===myId2;
 const replyInput=document.getElementById('storyReplyInput');
 const sendBtn=document.querySelector('#storyViewerModal button[onclick="sendStoryReply()"]');
 const viewersBtn2=document.getElementById('viewersBtn');
 if(replyInput) replyInput.style.display=isOwnViewer?'none':'block';
 if(sendBtn) sendBtn.style.display=isOwnViewer?'none':'block';
 if(viewersBtn2) { viewersBtn2.style.display='block'; viewersBtn2.style.background=isOwnViewer?'var(--blue)':'rgba(255,255,255,0.15)'; viewersBtn2.title=isOwnViewer?'Viewers (you own this)':'Viewers'; }
 if(isOwnViewer){
 document.getElementById('svViewsCount').style.display='block';
 document.getElementById('svReplyInfo').textContent='Your story • swipe to view viewers';
 } else {
 document.getElementById('svViewsCount').style.display='block';
 document.getElementById('svReplyInfo').textContent='';
 }
 // Media
 const img=document.getElementById('svMedia');
 const vid=document.getElementById('svVideo');
 const txt=document.getElementById('svText');
 const voiceBox=document.getElementById('svVoiceBox');
 const caption=document.getElementById('svCaption');
 const quizBox=document.getElementById('svQuizBox');
 const pollBox=document.getElementById('svPollBox');
 const stickersEl=document.getElementById('svStickers');
 img.style.display='none'; vid.style.display='none'; txt.style.display='none'; voiceBox.style.display='none'; caption.style.display='none'; quizBox.style.display='none'; pollBox.style.display='none'; stickersEl.innerHTML='';
 // Stickers
 if(story.stickers){
 try{
 const st=JSON.parse(story.stickers);
 let html='';
 if(st.mention) html+=`<span style="background:rgba(8,102,255,0.9);color:white;padding:4px 8px;border-radius:12px;font-size:0.75rem;backdrop-filter:blur(4px);">@${escapeHtml(st.mention)}</span>`;
 if(st.hashtag) html+=`<span style="background:rgba(0,0,0,0.6);color:white;padding:4px 8px;border-radius:12px;font-size:0.75rem;backdrop-filter:blur(4px);">${escapeHtml(st.hashtag)}</span>`;
 if(st.music) html+=`<span style="background:rgba(255,255,255,0.9);color:#1c1e21;padding:4px 8px;border-radius:12px;font-size:0.72rem;display:flex;gap:4px;align-items:center;"><i class="fas fa-music" style="color:var(--blue);"></i>${escapeHtml(st.music)}</span>`;
 if(st.link) html+=`<a href="${st.link}" target="_blank" style="background:rgba(255,255,255,0.9);color:var(--blue);padding:4px 8px;border-radius:12px;font-size:0.72rem;text-decoration:none;">🔗 ${escapeHtml(st.link.slice(0,25))}</a>`;
 stickersEl.innerHTML=html;
 }catch{}
 }
 if(story.location) stickersEl.innerHTML+=`<span style="background:rgba(0,0,0,0.6);color:white;padding:4px 8px;border-radius:12px;font-size:0.72rem;"> ${escapeHtml(story.location)}</span>`;
 if(story.challenge_tag) stickersEl.innerHTML+=`<span style="background:linear-gradient(45deg,#FF007A,#7A00FF);color:white;padding:4px 8px;border-radius:12px;font-size:0.72rem;font-weight:700;">${escapeHtml(story.challenge_tag)}</span>`;

 // ── Type rendering (robust: handle text vs media path) ──
 const pvBox=document.getElementById('svStage');
 const mediaPath = story.media_url || story.content || '';
 const isMediaPath = typeof mediaPath === 'string' && (mediaPath.startsWith('/uploads') || mediaPath.startsWith('http') || mediaPath.startsWith('blob:') || mediaPath.startsWith('data:'));
 const isVideoFile = isMediaPath && /\.(mp4|mov|webm|avi|mkv)$/i.test(mediaPath);
 const isVoiceType = story.type==='voice' || !!story.voice_url;
 pvBox.style.background = story.bg_color || (story.type==='text' || !isMediaPath ? (story.bg_color||'#1a1a2e') : 'black');
 // Reset filters
 img.style.filter = story.filter||'';
 vid.style.filter = story.filter||'';
 // Music pill (if any)
 const prevMusic=document.getElementById('svMusicPill');
 if(prevMusic) prevMusic.remove();
 if(story.music_url || story.music_title){
 const pill=document.createElement('div');
 pill.id='svMusicPill';
 pill.className='story-music-pill';
 const musSrc = story.music_url ? `${(window.API_BASE || (function(){var p=window.location.protocol,h=window.location.hostname,po=window.location.port; if(p==='file:') return 'http://localhost:5000'; if(h==='localhost'||h==='127.0.0.1'||h===''){ if(po==='5000') return window.location.origin; if(!po) return window.location.origin.indexOf('5000')!==-1?window.location.origin:'http://localhost:5000'; return 'http://localhost:5000'; } return window.location.origin; })())}${story.music_url}` : null;
 pill.innerHTML = `<i class="fas fa-music" style="color:#1DB954;"></i>
 <div style="flex:1;min-width:0;"><div style="font-weight:700;font-size:0.78rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(story.music_title||'Music')}</div><div style="font-size:0.65rem;opacity:0.7;">${story.music_url ? 'Tap to play' : ''}</div></div>
 ${musSrc ? `<audio controls src="${musSrc}" style="height:28px;flex:0 0 140px;"></audio>` : '<span style="font-size:0.7rem;opacity:0.6;"><i class="fas fa-volume-up"></i></span>'}`;
 pvBox.appendChild(pill);
 }
 // Decide rendering
 const displayText = story.caption || story.content || '';
 const isTextContent = !isMediaPath && !isVoiceType;
 if(story.type==='text' || isTextContent){
 txt.textContent = displayText;
 txt.style.display='block';
 txt.style.background = 'transparent';
 // Ensure text visible on bg
 pvBox.style.background = story.bg_color || '#232526';
 img.style.display='none'; vid.style.display='none'; voiceBox.style.display='none';
 } else if(isVoiceType){
 voiceBox.style.display='flex';
 const vAud=document.getElementById('svVoiceAudio');
 const vSrc = story.voice_url || mediaPath;
 vAud.src = (vSrc && !vSrc.startsWith('http') && !vSrc.startsWith('blob:') && !vSrc.startsWith('data:')) ? `${(window.API_BASE || (function(){var p=window.location.protocol,h=window.location.hostname,po=window.location.port; if(p==='file:') return 'http://localhost:5000'; if(h==='localhost'||h==='127.0.0.1'||h===''){ if(po==='5000') return window.location.origin; if(!po) return window.location.origin.indexOf('5000')!==-1?window.location.origin:'http://localhost:5000'; return 'http://localhost:5000'; } return window.location.origin; })())}${vSrc}` : vSrc;
 document.getElementById('svVoiceCaption').textContent = displayText;
 // also show caption if exists separately
 if(story.caption){
 caption.textContent=story.caption;
 caption.style.display='block';
 }
 } else if(isVideoFile || story.type==='video'){
 const vSrc = (isMediaPath && !mediaPath.startsWith('http')) ? `${(window.API_BASE || (function(){var p=window.location.protocol,h=window.location.hostname,po=window.location.port; if(p==='file:') return 'http://localhost:5000'; if(h==='localhost'||h==='127.0.0.1'||h===''){ if(po==='5000') return window.location.origin; if(!po) return window.location.origin.indexOf('5000')!==-1?window.location.origin:'http://localhost:5000'; return 'http://localhost:5000'; } return window.location.origin; })())}${mediaPath}` : mediaPath;
 vid.src = window.mediaUrl ? window.mediaUrl(vSrc) : vSrc;
 vid.style.display='block';
 vid.play().catch(()=>{});
 txt.style.display='none'; voiceBox.style.display='none';
 } else if(isMediaPath){
 const iSrc = mediaPath.startsWith('http') ? mediaPath : `${(window.API_BASE || (function(){var p=window.location.protocol,h=window.location.hostname,po=window.location.port; if(p==='file:') return 'http://localhost:5000'; if(h==='localhost'||h==='127.0.0.1'||h===''){ if(po==='5000') return window.location.origin; if(!po) return window.location.origin.indexOf('5000')!==-1?window.location.origin:'http://localhost:5000'; return 'http://localhost:5000'; } return window.location.origin; })())}${mediaPath}`;
 img.src = iSrc;
 img.style.display='block';
 img.onerror = function(){
 // fallback to text if image fails (e.g., content was text but mis-typed as image)
 this.style.display='none';
 txt.textContent = displayText;
 txt.style.display='block';
 pvBox.style.background = story.bg_color||'#232526';
 };
 } else {
 // fallback text
 txt.textContent = displayText;
 txt.style.display='block';
 }
 // Caption for media stories
 if(isMediaPath && story.caption && story.type!=='text' && !isVoiceType){
 caption.textContent=story.caption;
 caption.style.display='block';
 } else if(isMediaPath && !story.caption && !isTextContent){
 // Show content as caption if content is text but media is image? Already handled
 }
 // Quiz
 if(story.quiz_data){
 try{
 const q=JSON.parse(story.quiz_data);
 document.getElementById('svQuizQuestion').textContent=q.question;
 const optsEl=document.getElementById('svQuizOptions');
 optsEl.innerHTML=q.options.map((opt,i)=>`<button onclick="submitQuizAnswer(${story.id},${i})" style="padding:8px;border-radius:8px;border:1px solid var(--border);background:var(--bg);text-align:left;font-size:0.82rem;cursor:pointer;">${String.fromCharCode(65+i)}. ${escapeHtml(opt)}</button>`).join('');
 quizBox.style.display='block';
 document.getElementById('svQuizResult').style.display='none';
 }catch{}
 }
 // Poll
 if(story.poll_data){
 try{
 const p=JSON.parse(story.poll_data);
 document.getElementById('svPollQuestion').textContent=p.question||p.pollQuestion||'Poll';
 const optsEl=document.getElementById('svPollOptions');
 // Fetch live results first? For now show options with vote buttons
 optsEl.innerHTML=p.options.map((opt,i)=>`<button onclick="votePoll(${story.id},${i})" style="padding:8px;border-radius:8px;border:1px solid var(--border);background:var(--bg);text-align:left;font-size:0.82rem;cursor:pointer;display:flex;justify-content:space-between;align-items:center;"><span>${escapeHtml(opt)}</span><span id="poll-ct-${i}" style="font-size:0.7rem;opacity:0.6;"></span></button>`).join('');
 pollBox.style.display='block';
 // Load current results
 fetchPollResults(story.id);
 }catch{}
 }

 // Progress bars
 const barsContainer=document.getElementById('storyProgressBars');
 let barsHtml='';
 for(let i=0;i<user.stories.length;i++){
 let bg='rgba(255,255,255,0.3)';
 if(i < viewingStoryIndex) bg='white';
 barsHtml+=`<div style="flex:1; height:3px; background:${bg}; border-radius:3px; overflow:hidden;"><div id="spBar-${i}" style="width:0%; height:100%; background:white; transition:width 5s linear;"></div></div>`;
 }
 barsContainer.innerHTML=barsHtml;
 apiFetch(`/stories/${story.id}/view`,{method:'POST'}).catch(()=>{});
 // Update views count
 fetchStoryViews(story.id);
 setTimeout(()=>{ const cur=document.getElementById(`spBar-${viewingStoryIndex}`); if(cur) cur.style.width='100%'; },50);
 storyTimeout=setTimeout(()=>{ if(!storyViewerPaused) nextStory(); },5000);
};
function pauseStory(){ storyViewerPaused=true; clearTimeout(storyTimeout); const vid=document.getElementById('svVideo'); if(vid) vid.pause(); }
function resumeStory(){ if(storyViewerPaused){ storyViewerPaused=false; storyTimeout=setTimeout(nextStory,3000); const vid=document.getElementById('svVideo'); if(vid) vid.play().catch(()=>{}); } }
async function fetchStoryViews(storyId){
 try{
 const res=await apiFetch(`/stories/${storyId}/viewers`);
 const data=await res.json();
 document.getElementById('svViewsNum').textContent=Array.isArray(data)? data.length : 0;
 }catch{ document.getElementById('svViewsNum').textContent='—'; }
}
let _storyPickerTimer=null; window._pickerOpen=false;
function showStoryReactionPicker(){ clearTimeout(_storyPickerTimer); const p=document.getElementById('storyReactionPicker'); if(p){ p.style.display='flex'; window._pickerOpen=true; } }
function hideStoryReactionPicker(){ const p=document.getElementById('storyReactionPicker'); if(p){ p.style.display='none'; window._pickerOpen=false; } }
function scheduleHideStoryPicker(){ clearTimeout(_storyPickerTimer); _storyPickerTimer=setTimeout(()=>hideStoryReactionPicker(), 700); }
async function reactCurrentStory(emoji){
 const user=currentStoriesData[viewingUserIndex];
 if(!user) return showToast('Story not found','error');
 const story=user.stories[viewingStoryIndex];
 if(!story) return;
 const btn=document.getElementById('storyLikeMainBtn');
 try{
 // FB-like flying emoji animation
 const stage=document.getElementById('svStage');
 if(stage){
 const fly=document.createElement('div');
 fly.textContent=emoji;
 fly.style.cssText='position:absolute; left:50%; top:50%; font-size:3rem; transform:translate(-50%,-50%) scale(0.5); animation:storyReactFly 0.9s cubic-bezier(0.16,1,0.3,1) forwards; pointer-events:none; z-index:30; text-shadow:0 4px 12px rgba(0,0,0,0.4);';
 stage.appendChild(fly);
 setTimeout(()=>fly.remove(),900);
 if(!document.getElementById('storyReactAnimStyle')){
 const st=document.createElement('style'); st.id='storyReactAnimStyle';
 st.textContent='@keyframes storyReactFly{0%{transform:translate(-50%,-50%) scale(0.5); opacity:0} 20%{opacity:1; transform:translate(-50%,-60%) scale(1.15)} 100%{transform:translate(-50%,-120%) scale(0.9); opacity:0}}';
 document.head.appendChild(st);
 }
 }
 if(btn){ btn.innerHTML=`<span>${emoji}</span> Reacted`; btn.style.background='linear-gradient(135deg,#0866ff,#7c3aed)'; btn.style.borderColor='#0866ff'; setTimeout(()=>{ btn.innerHTML='<span>👍</span> Like'; btn.style.background='rgba(0,0,0,0.55)'; },1500); }
 hideStoryReactionPicker();
 const res=await apiFetch(`/stories/${story.id}/react`,{method:'POST', body:JSON.stringify({emoji})});
 const data=await res.json().catch(()=>({}));
 if(!res.ok) throw new Error(data.message||'Failed');
 showToast(`${emoji} reacted — FB style`);
 }catch(e){ showToast(e.message||'Reaction failed','error'); if(btn){ btn.innerHTML='<span>👍</span> Like'; btn.style.background='rgba(0,0,0,0.55)'; } }
}
async function fetchPollResults(storyId){
 try{
 const res=await apiFetch(`/stories/${storyId}/poll`);
 const data=await res.json();
 if(data.results){
 data.results.forEach((r,i)=>{
 const el=document.getElementById(`poll-ct-${i}`);
 if(el) el.textContent=`${r.votes} (${r.percent}%)`;
 });
 }
 }catch{}
}
async function votePoll(storyId, option){
 try{
 const res=await apiFetch(`/stories/${storyId}/poll`,{method:'POST', body:JSON.stringify({option})});
 const data=await res.json();
 showToast('Voted!');
 // update UI with results
 fetchPollResults(storyId);
 }catch{ showToast('Vote failed','error'); }
}
async function submitQuizAnswer(storyId, answer){
 try{
 const res=await apiFetch(`/stories/${storyId}/quiz`,{method:'POST', body:JSON.stringify({answer: String(answer)})});
 const data=await res.json();
 const rEl=document.getElementById('svQuizResult');
 rEl.style.display='block';
 rEl.textContent= data.correct ? ` Correct! ${data.explanation||''}` : `❌ Wrong. Correct: ${String.fromCharCode(65+parseInt(data.correctAnswer))} ${data.explanation||''}`;
 rEl.style.color= data.correct ? '#10b981' : '#ef4444';
 }catch{ showToast('Quiz failed','error'); }
}
function toggleStoryViewers(){
 const sheet=document.getElementById('storyViewersSheet');
 const isShown=sheet.style.display==='flex';
 if(isShown){ sheet.style.display='none'; resumeStory(); return; }
 pauseStory();
 sheet.style.display='flex';
 loadStoryViewers();
}
async function loadStoryViewers(){
 const user=currentStoriesData[viewingUserIndex];
 const story=user.stories[viewingStoryIndex];
 const list=document.getElementById('storyViewersList');
 list.innerHTML='<div style="padding:20px;text-align:center;"><i class="fas fa-spinner fa-spin"></i></div>';
 try{
 const res=await apiFetch(`/stories/${story.id}/viewers`);
 const data=await res.json();
 if(!data.length){ list.innerHTML='<div style="padding:20px;text-align:center;color:#65676b;font-size:0.82rem;">No views yet</div>'; return; }
 list.innerHTML=data.map(v=>`<div style="display:flex;align-items:center;gap:10px;padding:8px 16px;">
 <img src="${(window.API_BASE || (function(){var p=window.location.protocol,h=window.location.hostname,po=window.location.port; if(p==='file:') return 'http://localhost:5000'; if(h==='localhost'||h==='127.0.0.1'||h===''){ if(po==='5000') return window.location.origin; if(!po) return window.location.origin.indexOf('5000')!==-1?window.location.origin:'http://localhost:5000'; return 'http://localhost:5000'; } return window.location.origin; })())}${v.profilePicture||''}" onerror="this.style.display='none'" style="width:36px;height:36px;border-radius:50%;object-fit:cover;">
 <div style="flex:1;"><div style="font-weight:700;font-size:0.85rem;">${escapeHtml(v.fullName)}</div><div style="font-size:0.7rem;opacity:0.6;">${formatTime(v.created_at)}</div></div>
 </div>`).join('');
 }catch{ list.innerHTML='<div style="padding:20px;color:red;text-align:center;">Failed</div>'; }
}
function toggleStoryMenu(){
 const m=document.getElementById('storyMenu');
 m.style.display= m.style.display==='block' ? 'none' : 'block';
}
document.addEventListener('click',e=>{
 if(!e.target.closest('#storyMenu') && !e.target.closest('[onclick="toggleStoryMenu"]')) document.getElementById('storyMenu').style.display='none';
});
async function translateCurrentStory(){
 const user=currentStoriesData[viewingUserIndex];
 const story=user.stories[viewingStoryIndex];
 const target=/[ঀ-৿]/.test(story.content) ? 'en' : 'bn';
 try{
 const res=await apiFetch(`/stories/${story.id}/translate`,{method:'POST', body:JSON.stringify({targetLang: target})});
 const data=await res.json();
 // show translated in caption area
 const cap=document.getElementById('svCaption');
 cap.textContent=(data.translated||story.content) + ' (translated)';
 cap.style.display='block';
 showToast(`Translated to ${target}`);
 }catch{ showToast('Translate failed','error'); }
 document.getElementById('storyMenu').style.display='none';
}
async function shareCurrentStory(){
 const user=currentStoriesData[viewingUserIndex];
 const story=user.stories[viewingStoryIndex];
 // Reuse forward modal? For now prompt
 const target=prompt('Enter user ID to share to (e.g. 2 for Rahim):');
 if(!target) return;
 try{
 await apiFetch(`/stories/${story.id}/share`,{method:'POST', body:JSON.stringify({targets:[{id:target, type:'user'}]})});
 showToast('Shared to chat');
 }catch{ showToast('Share failed','error'); }
 document.getElementById('storyMenu').style.display='none';
}
async function showStoryAnalytics(){
 const user=currentStoriesData[viewingUserIndex];
 const story=user.stories[viewingStoryIndex];
 try{
 const res=await apiFetch(`/stories/${story.id}/analytics`);
 const data=await res.json();
 alert(`📊 Analytics\nViews: ${data.views}\nReactions: ${data.reactions}\nReplies: ${data.replies}\nShares: ${data.shares}\nCompletion: ${data.completion_rate}%`);
 }catch{ showToast('No analytics','error'); }
 document.getElementById('storyMenu').style.display='none';
}
async function archiveCurrentStory(){
 const user=currentStoriesData[viewingUserIndex];
 const story=user.stories[viewingStoryIndex];
 try{
 await apiFetch(`/stories/archive/${story.id}`,{method:'POST'});
 showToast('Archived');
 loadStories();
 }catch{ showToast('Archive failed','error'); }
 document.getElementById('storyMenu').style.display='none';
}
async function deleteCurrentStory(){
 if(!confirm('Delete this story?')) return;
 const user=currentStoriesData[viewingUserIndex];
 const story=user.stories[viewingStoryIndex];
 try{
 await apiFetch(`/stories/${story.id}`,{method:'DELETE'});
 showToast('Deleted');
 closeStoryViewer();
 loadStories();
 }catch{ showToast('Delete failed','error'); }
 document.getElementById('storyMenu').style.display='none';
}

// ── Explore / Nexus Now / Memories / Highlights / Map ───────────────────
async function loadExplore(filter, btn){
 if(btn){
 document.querySelectorAll('.explore-pill').forEach(b=>{
 b.classList.remove('active');
 b.style.background='var(--bg)'; b.style.color='var(--text)'; b.style.borderColor='var(--border)';
 });
 btn.classList.add('active');
 btn.style.background='#e7f3ff'; btn.style.color='#0064d1'; btn.style.borderColor='#0064d1';
 }
 const grid=document.getElementById('exploreGrid');
 grid.innerHTML='<div style="grid-column:1/-1;text-align:center;padding:24px;color:var(--text-secondary);"><i class="fas fa-spinner fa-spin"></i> Loading '+filter+'...</div>';
 grid.style.display='grid';
 grid.style.gridTemplateColumns='repeat(auto-fill,minmax(110px,1fr))';
 try{
 const res=await apiFetch(`/stories/explore?filter=${filter}`);
  const data=await res.json();
  let arr=Array.isArray(data)?data:[];
  // FB-like: deduplicate explore by user_id and collapse generic "User" placeholders (fixes double User cards)
  // Also filter out own stories already shown in friends tray (prevent same story in both rows)
  try{
    const myIdStr = String(currentUser?._id || currentUser?.id || '');
    const friendIds = new Set((window.currentStoriesData||[]).map(g=>String(g.user_id)));
    const seenExp = new Set();
    const seenPlaceholder = new Set();
    arr = arr.filter(s=>{
      const uid = String(s.user_id || s.userId || s.user_id);
      if(myIdStr && uid===myIdStr) return false; // own already in Create card
      if(friendIds.has(uid)) return false; // already in friends tray
      if(seenExp.has(uid)) return false;
      const name=(s.fullName||s.fullname||'').trim();
      if(name==='User' || !name){
        if(seenPlaceholder.has('__User')) return false;
        seenPlaceholder.add('__User');
      }
      seenExp.add(uid);
      return true;
    });
  }catch{}
  if(!arr.length){
 grid.innerHTML=`<div style="grid-column:1/-1;text-align:center;padding:28px;color:var(--text-secondary);">
 <div style="font-size:2rem;margin-bottom:8px;opacity:0.5;"><i class="fas fa-images"></i></div>
 <div style="font-weight:700;">No stories in ${filter}</div>
 <div style="font-size:0.78rem;opacity:0.7;margin-top:4px;">Be the first to post a ${filter} story </div>
 </div>`;
 return;
 }
 grid.innerHTML=arr.slice(0,12).map(s=>{
 const bg=s.bg_color || '#232526';
 const mediaPath=s.media_url || s.content || '';
 const isMedia=typeof mediaPath==='string' && (mediaPath.startsWith('/uploads') || mediaPath.startsWith('http') || mediaPath.startsWith('blob:'));
 const isVideo=s.type==='video' || (isMedia && mediaPath.match(/\.(mp4|mov|webm)$/i));
 const isText=!isMedia || s.type==='text';
 const avatar=(s.profilePicture||s.profilepicture) ? `<img src="${window.mediaUrl ? window.mediaUrl(s.profilePicture||s.profilepicture) : ((s.profilePicture||s.profilepicture).startsWith('http') ? (s.profilePicture||s.profilepicture) : `${(window.API_BASE || (function(){var p=window.location.protocol,h=window.location.hostname,po=window.location.port; if(p==='file:') return 'http://localhost:5000'; if(h==='localhost'||h==='127.0.0.1'||h===''){ if(po==='5000') return window.location.origin; if(!po) return window.location.origin.indexOf('5000')!==-1?window.location.origin:'http://localhost:5000'; return 'http://localhost:5000'; } return window.location.origin; })())}${s.profilePicture||s.profilepicture}`)}" style="width:100%;height:100%;object-fit:cover;">` : `<div style="width:100%;height:100%;background:linear-gradient(135deg,#667eea,#764ba2);display:flex;align-items:center;justify-content:center;color:white;font-weight:800;">${escapeHtml((s.fullName||s.fullname||'U')[0])}</div>`;
 let thumb='';
 if(isText){
 thumb=`<div class="text-card" style="background:${bg};">${escapeHtml((s.caption||s.content||'').slice(0,48))}</div>`;
 } else {
 const src= window.mediaUrl ? window.mediaUrl(mediaPath) : (mediaPath.startsWith('http') ? mediaPath : `${(window.API_BASE || (function(){var p=window.location.protocol,h=window.location.hostname,po=window.location.port; if(p==='file:') return 'http://localhost:5000'; if(h==='localhost'||h==='127.0.0.1'||h===''){ if(po==='5000') return window.location.origin; if(!po) return window.location.origin.indexOf('5000')!==-1?window.location.origin:'http://localhost:5000'; return 'http://localhost:5000'; } return window.location.origin; })())}${mediaPath}`);
 thumb=`<img src="${src}" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.innerHTML='<div class=text-card style=background:${bg}>'+escapeHtml((s.caption||s.content||'Story').slice(0,40))+'</div>'">`;
 }
 const tagIcon= s.campus_tag ? '' : s.course_code ? '' : s.challenge_tag ? '' : isVideo ? '' : s.type==='voice' ? '' : '';
 return `<div class="explore-card" onclick="openStoryById(${s.id})">
 ${thumb}
 <div class="explore-gradient"></div>
 <div class="explore-avatar">${avatar}</div>
 <div class="explore-info">
 <div class="explore-name">${escapeHtml(s.fullName||'User')}</div>
 <div class="explore-meta">${tagIcon} ${escapeHtml(s.campus_tag||s.course_code||s.challenge_tag||'View story')} • ${formatTime(s.created_at)}</div>
 </div>
 ${s.is_featured ? '<div style="position:absolute;top:6px;right:6px;background:gold;color:#000;padding:2px 6px;border-radius:10px;font-size:0.6rem;font-weight:800;">⭐</div>' : ''}
 </div>`;
 }).join('');
 }catch(e){
 console.error('explore',e);
 grid.innerHTML='<div style="grid-column:1/-1;text-align:center;padding:20px;color:#ef4444;"><i class="fas fa-exclamation-circle"></i> Failed to load. Tap to retry.</div>';
 grid.onclick=()=>loadExplore(filter, btn);
 }
}
async function openStoryById(storyId){
 // Find user containing this story, or fetch feed and locate
 try{
 // fetch feed to find
 const res=await apiFetch('/stories/feed');
 const groups=await res.json();
 for(let gi=0;gi<groups.length;gi++){
 const idx=groups[gi].stories.findIndex(s=>String(s.id)===String(storyId));
 if(idx!==-1){
 currentStoriesData=groups;
 openStoryViewer(gi);
 // set index
 viewingStoryIndex=idx;
 renderCurrentStory();
 return;
 }
 }
 showToast('Story not found (expired?)','error');
 }catch{}
}
async function loadFeaturedStories(){
 document.querySelectorAll('.explore-pill').forEach(b=>{b.style.background='var(--bg)';b.style.color='var(--text)';b.style.borderColor='var(--border)';});
 event?.target && (event.target.style.background='var(--blue)');
 const grid=document.getElementById('exploreGrid');
 grid.innerHTML='<div style="grid-column:1/-1;text-align:center;padding:20px;"><i class="fas fa-spinner fa-spin"></i> Loading featured...</div>';
 try{
 const res=await apiFetch('/stories/featured');
 const data=await res.json();
 const arr=Array.isArray(data)?data:[];
 if(!arr.length){ grid.innerHTML='<div style="grid-column:1/-1;text-align:center;color:#65676b;padding:20px;">No featured ⭐</div>'; return; }
 grid.innerHTML=arr.map(s=>`<div onclick="openStoryById(${s.id})" style="height:140px;border-radius:10px;overflow:hidden;position:relative;cursor:pointer;border:1px solid gold;"><img src="${(window.API_BASE || (function(){var p=window.location.protocol,h=window.location.hostname,po=window.location.port; if(p==='file:') return 'http://localhost:5000'; if(h==='localhost'||h==='127.0.0.1'||h===''){ if(po==='5000') return window.location.origin; if(!po) return window.location.origin.indexOf('5000')!==-1?window.location.origin:'http://localhost:5000'; return 'http://localhost:5000'; } return window.location.origin; })())}${s.content}" onerror="this.parentElement.innerHTML='<div style=\\'background:${s.bg_color||'#232526'};width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:white;padding:8px;text-align:center;\\'>'+escapeHtml(s.content.slice(0,40))+'</div>'" style="width:100%;height:100%;object-fit:cover;"><div style="position:absolute;top:4px;left:4px;background:gold;color:black;padding:2px 6px;border-radius:10px;font-size:0.6rem;font-weight:800;">⭐ Featured</div></div>`).join('');
 }catch{ grid.innerHTML='<div style="color:red;">Failed</div>'; }
}
async function loadNexusNow(){
 // Removed per user request — NEXUS NOW bar deleted
 const bar=document.getElementById('nexusNowBar');
 if(bar) bar.style.display='none';
 return;
}
async function loadMemories(){
 try{
 const res=await apiFetch('/stories/memories');
 const data=await res.json();
 if(Array.isArray(data) && data.length){
 document.getElementById('memoriesBanner').style.display='block';
 document.getElementById('memoriesText').textContent=`You have ${data.length} memories from 1 year ago`;
 window._memoriesData=data;
 }
 }catch{}
}
function openMemories(){
 if(!window._memoriesData || !window._memoriesData.length) return showToast('No memories','error');
 // Reuse story viewer to show memories
 const memGroup={user_id: currentUser.id, fullName: currentUser.fullName, profilePicture: currentUser.profilePicture, stories: window._memoriesData};
 const idx=currentStoriesData.length;
 currentStoriesData.push(memGroup);
 openStoryViewer(idx);
}
async function loadHighlightsRow(){
 try{
 const res=await apiFetch(`/stories/highlights/${currentUser.id}`);
 const data=await res.json();
 const row=document.getElementById('highlightsRow');
 if(!Array.isArray(data) || !data.length){ row.style.display='none'; return; }
 row.style.display='flex';
 row.innerHTML=data.map(h=>`<div onclick="openHighlight(${h.id})" style="display:flex;flex-direction:column;align-items:center;cursor:pointer;flex-shrink:0;width:70px;">
 <div style="width:60px;height:60px;border-radius:50%;border:2px solid gold;padding:2px;background:var(--surface);">
 <div style="width:100%;height:100%;border-radius:50%;background:linear-gradient(135deg,#f09433,#bc1888);display:flex;align-items:center;justify-content:center;color:white;font-weight:800;">⭐</div>
 </div>
 <span style="font-size:0.7rem;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;">${escapeHtml(h.title)}</span>
 </div>`).join('') + `<div onclick="createHighlightPrompt()" style="display:flex;flex-direction:column;align-items:center;cursor:pointer;flex-shrink:0;width:70px;opacity:0.6;">
 <div style="width:60px;height:60px;border-radius:50%;border:2px dashed var(--border);display:flex;align-items:center;justify-content:center;"><i class="fas fa-plus" style="color:var(--blue);"></i></div>
 <span style="font-size:0.7rem;margin-top:4px;">New</span>
 </div>`;
 }catch{}
}
function openHighlight(id){ showToast('Highlight viewer — use story viewer for highlights (coming soon)'); }
function createHighlightPrompt(){
 const title=prompt('Highlight title:');
 if(!title) return;
 // Use last story as cover? For now create empty
 apiFetch('/stories/highlights',{method:'POST', body:JSON.stringify({title, story_ids:[]})}).then(()=>{ showToast('Highlight created'); loadHighlightsRow(); }).catch(()=>showToast('Failed','error'));
}
function openStoryMap(){
 alert('🗺️ Story Map — Public stories with location tags will appear on map. This feature shows location-based stories. Implement with Leaflet/Mapbox in production. For now, fetch via /api/stories/map');
 apiFetch('/stories/map').then(r=>r.json()).then(data=>{ console.log('Map data', data); if(!data.length) showToast('No location stories yet'); else showToast(`${data.length} location stories found — check console`); });
}
// Override loadStories to also load extras
const __origLoadStories = loadStories;
loadStories = async function(){
 await __origLoadStories();
 loadExplore('trending');
 loadNexusNow();
 loadMemories();
 loadHighlightsRow();
};
// Ensure init loads dependencies after DOM
document.addEventListener('DOMContentLoaded', ()=>{
 setTimeout(()=>{ loadStoryDependencies(); },800);
});

// ===== COMMENT EMOJI =====
const COMMENT_EMOJIS = ['😀','😂','','','','','','👍','❤️','','','','','','','','','','','','','','','','','','👋','','',''];
function toggleCommentEmoji(postId) {
 const box = document.getElementById(`cemoji-${postId}`);
 if (!box) return;
 if (box.style.display !== 'none') { box.style.display = 'none'; return; }
 if (!box.children.length) {
 box.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;padding:8px;background:var(--surface);border:1px solid var(--border);border-radius:10px;margin-top:4px;';
 COMMENT_EMOJIS.forEach(em => {
 const b = document.createElement('button');
 b.textContent = em;
 b.style.cssText = 'background:none;border:none;font-size:1.2rem;cursor:pointer;padding:3px;border-radius:4px;';
 b.onmouseover = () => b.style.background = 'var(--bg)';
 b.onmouseout = () => b.style.background = 'none';
 b.onclick = () => {
 const inp = document.getElementById(`cinput-${postId}`);
 if (inp) { inp.value += em; inp.focus(); }
 box.style.display = 'none';
 };
 box.appendChild(b);
 });
 } else { box.style.display = 'flex'; }
}

// ── STORY VIEWER HOTFIX — 2026-08-27: Fix black screen, button clicks, own story ──
(function(){
 // Ensure viewer functions are globally accessible and robust
 window.closeStoryViewer = function(){
 const m=document.getElementById('storyViewerModal');
 if(m) m.style.display='none';
 clearTimeout(window.storyTimeout);
 const vid=document.getElementById('svVideo');
 if(vid) { vid.pause(); vid.src=''; }
 const img=document.getElementById('svMedia');
 if(img) img.src='';
 const sheets=document.getElementById('storyViewersSheet');
 if(sheets) sheets.style.display='none';
 const menu=document.getElementById('storyMenu');
 if(menu) menu.style.display='none';
 window.storyViewerPaused=false;
 console.log('[Story] closed');
 };
 window.pauseStory = function(){ window.storyViewerPaused=true; clearTimeout(window.storyTimeout); const v=document.getElementById('svVideo'); if(v) v.pause(); };
 window.resumeStory = function(){ if(window.storyViewerPaused){ window.storyViewerPaused=false; window.storyTimeout=setTimeout(window.nextStory,3000); const v=document.getElementById('svVideo'); if(v) v.play().catch(()=>{}); } };
 // Fix top buttons to ensure they are clickable (raise z-index)
 const fixTopBtns=()=>{
 const topBar=document.querySelector('#storyViewerModal [style*="top:28px"]');
 if(topBar) topBar.style.zIndex='30';
 ['viewersBtn','storyMenu'].forEach(id=>{
 const el=document.getElementById(id);
 if(el) el.style.pointerEvents='auto';
 });
 };
 // Override openStoryViewer to ensure it handles own story and black screen
 const _origOpen = window.openStoryViewer;
 window.openStoryViewer = function(uIndex){
 console.log('[Story] open viewer index',uIndex, 'data len',window.currentStoriesData?.length);
 if(typeof uIndex!=='number' || isNaN(uIndex)) uIndex=0;
 if(!window.currentStoriesData || !window.currentStoriesData.length){
 console.warn('[Story] No data, fetching feed...');
 // Try to fetch and then open
 if(window.loadStories) window.loadStories().then(()=>{ setTimeout(()=>window.openStoryViewer(0),500); });
 return;
 }
 if(uIndex<0) uIndex=0;
 if(uIndex>=window.currentStoriesData.length) uIndex=window.currentStoriesData.length-1;
 window.viewingUserIndex=uIndex;
 window.viewingStoryIndex=0;
 const modal=document.getElementById('storyViewerModal');
 if(modal){ modal.style.display='flex'; modal.style.pointerEvents='auto'; }
 fixTopBtns();
 // Call the enhanced render (which is window.renderCurrentStory)
 if(window.renderCurrentStory) window.renderCurrentStory();
 else if(_origOpen) _origOpen(uIndex);
 };
 // Ensure reaction / reply globals
 window.reactCurrentStory = window.reactCurrentStory || async function(emoji){
 const user=window.currentStoriesData[window.viewingUserIndex];
 if(!user) return;
 const story=user.stories[window.viewingStoryIndex];
 if(!story) return;
 console.log('[Story] react',emoji,story.id);
 try{
 const res=await window.apiFetch(`/stories/${story.id}/react`,{method:'POST', body:JSON.stringify({emoji})});
 const data=await res.json();
 console.log('[Story] react ok',data);
 if(window.showToast) window.showToast(`${emoji} reacted`);
 }catch(e){ console.error(e); if(window.showToast) window.showToast('Reaction failed','error'); }
 };
 window.sendStoryReply = window.sendStoryReply || async function(){
 const input=document.getElementById('storyReplyInput');
 const text=input?.value?.trim();
 if(!text) return;
 const user=window.currentStoriesData[window.viewingUserIndex];
 const story=user.stories[window.viewingStoryIndex];
 if(String(user.user_id)===String(window.currentUser?._id||window.currentUser?.id)) { if(window.showToast) window.showToast("Can't reply to your own story"); return; }
 try{
 await window.apiFetch(`/stories/${story.id}/reply`,{method:'POST', body:JSON.stringify({content:text})});
 if(window.showToast) window.showToast('Reply sent to messenger!');
 input.value='';
 window.nextStory();
 }catch(e){ if(window.showToast) window.showToast('Failed to reply','error'); }
 };
 window.shareCurrentStory = window.shareCurrentStory || async function(){
 const user=window.currentStoriesData[window.viewingUserIndex];
 const story=user.stories[window.viewingStoryIndex];
 const target=prompt('Enter user ID to share to (e.g. 2 for Rahim):');
 if(!target) return;
 try{
 await window.apiFetch(`/stories/${story.id}/share`,{method:'POST', body:JSON.stringify({targets:[{id:target, type:'user'}]})});
 if(window.showToast) window.showToast('Shared to chat');
 }catch(e){ if(window.showToast) window.showToast('Share failed','error'); }
 };
 // Fix next/prev to be global
 window.nextStory = window.nextStory || function(){ window.viewingStoryIndex++; window.renderCurrentStory(); };
 window.prevStory = window.prevStory || function(){
 if(window.viewingStoryIndex>0){ window.viewingStoryIndex--; window.renderCurrentStory(); }
 else if(window.viewingUserIndex>0){ window.viewingUserIndex--; window.viewingStoryIndex=window.currentStoriesData[window.viewingUserIndex].stories.length-1; window.renderCurrentStory(); }
 };
 // Ensure progress bars are visible
 const styleFix=document.createElement('style');
 styleFix.textContent=`#storyViewerModal #storyProgressBars{ display:flex !important; opacity:1 !important; } #storyViewerModal #svStage{ min-height: 60vh; }`;
 document.head.appendChild(styleFix);
 console.log('[Story] hotfix loaded');
})();
// ── STORY VIEWER FINAL FIX — 2026-08-27: Ensure black screen never, buttons always work ──
(function(){
 console.log('[Story] final fix loading');
 // Force viewer background and ensure text always visible
 const ensureViewerStyles=()=>{
 const modal=document.getElementById('storyViewerModal');
 if(!modal) return;
 modal.style.background='black';
 const stage=document.getElementById('svStage');
 if(stage){
 stage.style.background='radial-gradient(ellipse at center, #1e1e2e 0%, #000 100%)';
 stage.style.display='flex';
 stage.style.alignItems='center';
 stage.style.justifyContent='center';
 }
 };
 // Patch renderCurrentStory to be extra robust and always show something
 const _origRender = window.renderCurrentStory;
 window.renderCurrentStory = function(){
 try{
 ensureViewerStyles();
 if(!window.currentStoriesData || !window.currentStoriesData.length){
 console.warn('[Story] No data');
 document.getElementById('svText').textContent='No stories';
 document.getElementById('svText').style.display='block';
 return;
 }
 if(window.viewingUserIndex>=window.currentStoriesData.length) window.viewingUserIndex=0;
 const user=window.currentStoriesData[window.viewingUserIndex];
 if(!user || !user.stories || !user.stories.length){
 console.warn('[Story] User has no stories',user);
 // Try next user
 window.viewingUserIndex++;
 if(window.viewingUserIndex>=window.currentStoriesData.length) return window.closeStoryViewer();
 return window.renderCurrentStory();
 }
 if(window.viewingStoryIndex>=user.stories.length){
 window.viewingUserIndex++;
 window.viewingStoryIndex=0;
 return window.renderCurrentStory();
 }
 // Call original with extra error handling
 return _origRender();
 }catch(e){
 console.error('[Story] render error',e);
 const txt=document.getElementById('svText');
 if(txt){ txt.textContent='Error loading story: '+(e.message||''); txt.style.display='block'; txt.style.color='white'; }
 // Ensure progress bars still show
 const bars=document.getElementById('storyProgressBars');
 if(bars && !bars.children.length){
 bars.innerHTML='<div style="flex:1;height:3px;background:rgba(255,255,255,0.3);border-radius:3px;"><div style="width:100%;height:100%;background:white;"></div></div>';
 }
 }
 };
 // Fix top header avatar fallback
 const _origRender2 = window.renderCurrentStory;
 // Ensure avatar always shows initials if no picture
 const fixAvatar=()=>{
 const user=window.currentStoriesData?.[window.viewingUserIndex];
 if(!user) return;
 const av=document.getElementById('svAvatar');
 if(!av) return;
 if(!user.profilePicture){
 av.style.display='none';
 let initialsEl=document.getElementById('svAvatarInitials');
 if(!initialsEl){
 initialsEl=document.createElement('div');
 initialsEl.id='svAvatarInitials';
 initialsEl.style.cssText='width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#667eea,#764ba2);display:flex;align-items:center;justify-content:center;color:white;font-weight:800;border:2px solid white;flex-shrink:0;';
 av.parentElement.insertBefore(initialsEl, av);
 }
 initialsEl.textContent=(user.fullName||'U')[0].toUpperCase();
 initialsEl.style.display='flex';
 } else {
 av.style.display='block';
 const ini=document.getElementById('svAvatarInitials');
 if(ini) ini.style.display='none';
 av.src=((window.API_BASE || (function(){var p=window.location.protocol,h=window.location.hostname,po=window.location.port; if(p==='file:') return 'http://localhost:5000'; if(h==='localhost'||h==='127.0.0.1'||h===''){ if(po==='5000') return window.location.origin; if(!po) return window.location.origin.indexOf('5000')!==-1?window.location.origin:'http://localhost:5000'; return 'http://localhost:5000'; } return window.location.origin; })()))+user.profilePicture;
 av.onerror=function(){ this.style.display='none'; const ini2=document.getElementById('svAvatarInitials'); if(ini2) ini2.style.display='flex'; };
 }
 };
 const _wrapRender = window.renderCurrentStory;
 window.renderCurrentStory = function(){
 const res=_wrapRender();
 // After render, fix avatar and ensure progress bars visible
 try{ fixAvatar(); }catch(e){}
 const bars=document.getElementById('storyProgressBars');
 if(bars && bars.children.length===0){
 const user=window.currentStoriesData?.[window.viewingUserIndex];
 if(user && user.stories){
 let html='';
 for(let i=0;i<user.stories.length;i++){
 const w=i < window.viewingStoryIndex ? '100%' : i===window.viewingStoryIndex ? '0%' : '0%';
 const bg=i < window.viewingStoryIndex ? 'white' : 'rgba(255,255,255,0.3)';
 html+=`<div style="flex:1;height:3px;background:${bg};border-radius:3px;overflow:hidden;"><div id="spBar-${i}" style="width:${w};height:100%;background:white;transition:width 5s linear;"></div></div>`;
 }
 bars.innerHTML=html;
 setTimeout(()=>{ const cur=document.getElementById(`spBar-${window.viewingStoryIndex}`); if(cur) cur.style.width='100%'; },50);
 }
 }
 // Ensure bottom buttons are clickable
 document.querySelectorAll('#storyViewerModal button').forEach(b=>{ b.style.pointerEvents='auto'; b.style.zIndex='20'; });
 return res;
 };
 // Ensure buttons have global handlers even if inline onclick fails (add listeners)
 document.addEventListener('click', (e)=>{
 const t=e.target.closest('button');
 if(!t) return;
 // Reaction buttons in viewer have no id, but we can detect via parent
 if(t.closest('#storyViewerModal') && t.textContent.trim().length<=2 && /[❤️😂😮👍]/.test(t.textContent)){
 const emoji=t.textContent.trim();
 if(window.reactCurrentStory) { e.preventDefault(); window.reactCurrentStory(emoji); }
 }
 });
 console.log('[Story] final fix applied');
})();



