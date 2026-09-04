/* DIU Nexus — FB Desktop Floating Chat Dock */
(function(){
  const API_BASE = window.API_BASE || (function(){var p=window.location.protocol,h=window.location.hostname,po=window.location.port; if(p==='file:') return 'http://localhost:5000'; if(h==='localhost'||h==='127.0.0.1'||h===''){ if(po==='5000') return window.location.origin; if(!po) return window.location.origin.indexOf('5000')!==-1?window.location.origin:'http://localhost:5000'; return 'http://localhost:5000'; } return window.location.origin; })();
  const API = window.API || API_BASE + '/api';
  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user')||'null');
  if(!token || !user) return;
  const myId = String(user._id||user.id||'');
  if(window.__fbDockLoaded) return; window.__fbDockLoaded=true;

  // --- Styles ---
  const style=document.createElement('style');
  style.textContent=`
  #fbDock{position:fixed;bottom:0;right:12px;display:flex;gap:8px;align-items:flex-end;z-index:4000;pointer-events:none;}
  .fbChatWin{width:320px;height:380px;background:var(--surface,#fff);border:1px solid var(--border,#e4e6eb);border-radius:12px 12px 0 0;box-shadow:0 8px 24px rgba(0,0,0,0.18);display:flex;flex-direction:column;pointer-events:auto;overflow:hidden;}
  .fbChatWin.minimized{height:48px;}
  .fbChatHead{height:48px;background:linear-gradient(135deg,#0866ff,#0550c1);color:white;display:flex;align-items:center;gap:8px;padding:0 10px;cursor:pointer;flex-shrink:0;}
  .fbChatHead img{width:32px;height:32px;border-radius:50%;object-fit:cover;}
  .fbChatHead .name{flex:1;font-weight:700;font-size:0.88rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .fbChatHead .btn{width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,0.15);border:none;color:white;cursor:pointer;display:flex;align-items:center;justify-content:center;}
  .fbChatBody{flex:1;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:8px;background:var(--bg,#f0f2f5);}
  .fbBubble{max-width:72%;padding:8px 10px;border-radius:16px;font-size:0.85rem;line-height:1.4;word-break:break-word;}
  .fbBubble.mine{background:#0866ff;color:white;align-self:flex-end;border-bottom-right-radius:4px;}
  .fbBubble.theirs{background:var(--surface,#fff);border:1px solid var(--border,#e4e6eb);align-self:flex-start;border-bottom-left-radius:4px;}
  .fbInputBar{display:flex;gap:6px;padding:8px;border-top:1px solid var(--border,#e4e6eb);background:var(--surface,#fff);}
  .fbInputBar input{flex:1;padding:8px 12px;border-radius:20px;border:1px solid var(--border,#e4e6eb);outline:none;font-family:inherit;background:var(--bg,#f0f2f5);}
  .fbHeadsBar{position:fixed;bottom:0;right:12px;display:flex;gap:8px;align-items:center;z-index:3999;pointer-events:auto;}
  .fbHead{width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#0866ff,#0550c1);color:white;display:flex;align-items:center;justify-content:center;font-weight:800;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.15);border:2px solid white;position:relative;}
  .fbHead img{width:100%;height:100%;border-radius:50%;object-fit:cover;}
  .fbHead .badge{position:absolute;top:-4px;right:-4px;background:#e41e3f;color:white;font-size:0.6rem;min-width:18px;height:18px;border-radius:999px;display:flex;align-items:center;justify-content:center;border:2px solid white;}
  @media(max-width:768px){#fbDock{display:none;} .fbHeadsBar{display:none;}}
  `;
  document.head.appendChild(style);

  const dock=document.createElement('div');
  dock.id='fbDock';
  document.body.appendChild(dock);

  let openWins = new Map(); // userId -> winEl
  let conversations=[];

  function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  function getInit(n){return (n||'?').trim().split(' ').slice(0,2).map(x=>x[0]).join('').toUpperCase();}
  async function apiFetch(path, opts={}){
    const h={'Content-Type':'application/json','Authorization':'Bearer '+token, ...(opts.headers||{})};
    if(opts.body instanceof FormData) delete h['Content-Type'];
    const r=await fetch(API+path,{...opts,headers:h});
    if(!r.ok) throw new Error('fetch fail');
    return r;
  }

  async function loadRecent(){
    try{
      const r=await apiFetch('/messages/conversations?filter=all');
      const data=await r.json();
      conversations=Array.isArray(data)?data:[];
    }catch{}
  }

  function createWin(uid, name, pic){
    if(openWins.has(String(uid))) { const w=openWins.get(String(uid)); w.style.display='flex'; return w; }
    if(openWins.size>=2){ // FB allows 2-3, close oldest
      const first=[...openWins.keys()][0]; closeWin(first);
    }
    const win=document.createElement('div');
    win.className='fbChatWin';
    win.dataset.uid=String(uid);
    const avatar = pic? `<img src="${(window.API_BASE||API_BASE)+pic}" onerror="this.style.display='none'">` : `<div style="width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;font-weight:800;">${getInit(name)}</div>`;
    win.innerHTML=`
      <div class="fbChatHead" onclick="this.parentElement.classList.toggle('minimized')">
        ${avatar}<div class="name">${esc(name)}</div>
        <button class="btn" onclick="event.stopPropagation(); this.closest('.fbChatWin').classList.toggle('minimized')"><i class="fas fa-minus"></i></button>
        <button class="btn" onclick="event.stopPropagation(); window.__fbCloseWin('${uid}')"><i class="fas fa-times"></i></button>
      </div>
      <div class="fbChatBody" id="fbBody-${uid}"><div style="text-align:center;color:#65676b;font-size:0.82rem;padding:20px;"><i class="fas fa-spinner fa-spin"></i> Loading...</div></div>
      <div class="fbInputBar">
        <input type="text" placeholder="Aa" id="fbInput-${uid}" onkeydown="if(event.key==='Enter') window.__fbSend('${uid}')">
        <button onclick="window.__fbSend('${uid}')" style="background:#0866ff;color:white;border:none;width:36px;height:36px;border-radius:50%;cursor:pointer;"><i class="fas fa-paper-plane" style="font-size:0.85rem;"></i></button>
      </div>
    `;
    dock.appendChild(win);
    openWins.set(String(uid), win);
    loadMessages(uid);
    // mark read on open
    try{ apiFetch('/messages/mark-read',{method:'POST', body:JSON.stringify({userId:uid})}).catch(()=>{}); }catch{}
    return win;
  }
  window.__fbCloseWin=(uid)=>{
    const w=openWins.get(String(uid));
    if(w) w.remove();
    openWins.delete(String(uid));
  };
  window.__fbOpen = (uid, name, pic)=>{
    createWin(uid, name, pic);
  };
  window.__fbSend=async(uid)=>{
    const inp=document.getElementById('fbInput-'+uid);
    const txt=inp.value.trim(); if(!txt) return;
    const body=document.getElementById('fbBody-'+uid);
    // optimistic
    const div=document.createElement('div'); div.innerHTML=`<div class="fbBubble mine">${esc(txt)}</div>`; body.appendChild(div); body.scrollTop=body.scrollHeight;
    inp.value='';
    try{
      await apiFetch('/messages',{method:'POST', body:JSON.stringify({receiverId:uid, content:txt, isGroup:false})});
      // will come via socket too, but we already showed
    }catch{ showToast('Failed','error'); }
  };
  async function loadMessages(uid){
    const body=document.getElementById('fbBody-'+uid);
    if(!body) return;
    try{
      const r=await apiFetch('/messages/'+uid+'?limit=20');
      const msgs=await r.json();
      const myIdStr=String(myId);
      body.innerHTML='';
      if(!msgs.length) body.innerHTML='<div style="text-align:center;color:#65676b;font-size:0.82rem;padding:20px;">Say hello 👋</div>';
      else msgs.slice(-20).forEach(m=>{
        const isOwn=String(m.sender_id)===myIdStr;
        let content=esc(m.content);
        // handle image via file_url or [IMAGE]: or [FILE]: image
        const fUrl=m.file_url||m.fileUrl||'';
        const isImgUrl = fUrl && (m.message_type==='image' || /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(fUrl) || fUrl.includes('res.cloudinary.com') || fUrl.includes('/uploads/'));
        if(isImgUrl){
          const url=(fUrl.startsWith('http')||fUrl.startsWith('data:')||fUrl.startsWith('blob:'))? fUrl : (window.mediaUrl?window.mediaUrl(fUrl): API_BASE+fUrl);
          content=`<img src="${esc(url)}" style="max-width:160px;max-height:160px;border-radius:8px;cursor:zoom-in;" onclick="window.open('${esc(url)}','_blank')">`;
        } else if(m.content && m.content.startsWith('[IMAGE]:')){
          const raw=m.content.replace('[IMAGE]:','').trim().split('|')[0].trim();
          const url=(raw.startsWith('http')||raw.startsWith('data:')||raw.startsWith('blob:'))? raw : (window.mediaUrl?window.mediaUrl(raw): API_BASE+raw);
          content=`<img src="${esc(url)}" style="max-width:160px;border-radius:8px;cursor:zoom-in;" onclick="window.open('${esc(url)}','_blank')">`;
        } else if(m.content && m.content.startsWith('[FILE]:')){
          const parts=m.content.replace('[FILE]:','').split('|');
          const urlPart=parts[0]||fUrl;
          const isImg=/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(urlPart) || (fUrl && /\.(jpg|jpeg|png|gif|webp)$/i.test(fUrl));
          if(isImg){
            const url=(urlPart.startsWith('http')||urlPart.startsWith('data:'))? urlPart : (window.mediaUrl?window.mediaUrl(urlPart): API_BASE+urlPart);
            content=`<img src="${esc(url)}" style="max-width:160px;border-radius:8px;cursor:zoom-in;" onclick="window.open('${esc(url)}','_blank')">`;
          }
        }
        const d=document.createElement('div');
        d.innerHTML=`<div class="fbBubble ${isOwn?'mine':'theirs'}">${content}</div>`;
        body.appendChild(d);
      });
      body.scrollTop=body.scrollHeight;
    }catch{ body.innerHTML='<div style="text-align:center;color:#e41e3f;font-size:0.82rem;">Failed</div>'; }
  }
  function showToast(msg){
    const t=document.createElement('div'); t.style.cssText='position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#1c1e21;color:white;padding:10px 16px;border-radius:8px;z-index:9999;'; t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(),2000);
  }

  // Socket for floating
  try{
    if(typeof io!=='undefined'){
      const sock=io(API_BASE);
      sock.on('connect',()=> sock.emit('user_online', myId));
      sock.on('receive_message', msg=>{
        const other = String(msg.sender_id)===myId ? String(msg.receiver_id) : String(msg.sender_id);
        const win=openWins.get(other);
        if(win){
          const body=document.getElementById('fbBody-'+other);
          if(body){
            const isOwn=String(msg.sender_id)===myId;
            const fUrl=msg.file_url||msg.fileUrl||'';
            let content=esc(msg.content);
            const isImgUrl = fUrl && (msg.message_type==='image' || /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(fUrl) || fUrl.includes('res.cloudinary.com'));
            if(isImgUrl){
              const url=(fUrl.startsWith('http')||fUrl.startsWith('data:'))? fUrl : (window.mediaUrl?window.mediaUrl(fUrl): API_BASE+fUrl);
              content=`<img src="${esc(url)}" style="max-width:160px;max-height:160px;border-radius:8px;cursor:zoom-in;" onclick="window.open('${esc(url)}','_blank')">`;
            } else if(msg.content && msg.content.startsWith('[IMAGE]:')){
              const raw=msg.content.replace('[IMAGE]:','').trim().split('|')[0].trim();
              const url=(raw.startsWith('http')||raw.startsWith('data:'))? raw : (window.mediaUrl?window.mediaUrl(raw): API_BASE+raw);
              content=`<img src="${esc(url)}" style="max-width:160px;border-radius:8px;cursor:zoom-in;" onclick="window.open('${esc(url)}','_blank')">`;
            } else if(msg.content && msg.content.startsWith('[FILE]:')){
              const parts=msg.content.replace('[FILE]:','').split('|');
              const urlPart=parts[0]||fUrl;
              if(/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(urlPart)) {
                const url=(urlPart.startsWith('http')||urlPart.startsWith('data:'))? urlPart : (window.mediaUrl?window.mediaUrl(urlPart): API_BASE+urlPart);
                content=`<img src="${esc(url)}" style="max-width:160px;border-radius:8px;cursor:zoom-in;" onclick="window.open('${esc(url)}','_blank')">`;
              }
            }
            const d=document.createElement('div'); d.innerHTML=`<div class="fbBubble ${isOwn?'mine':'theirs'}">${content}</div>`; body.appendChild(d); body.scrollTop=body.scrollHeight;
            // if minimized, show badge
            if(win.classList.contains('minimized')){
              let badge=win.querySelector('.fbBadge');
              if(!badge){ badge=document.createElement('div'); badge.className='fbBadge'; badge.style.cssText='position:absolute;top:6px;right:30px;background:#e41e3f;color:white;font-size:0.65rem;min-width:18px;height:18px;border-radius:999px;display:flex;align-items:center;justify-content:center;'; win.querySelector('.fbChatHead').appendChild(badge); }
              badge.textContent=parseInt(badge.textContent||0)+1;
              badge.style.display='flex';
            }
          }
        } else {
          // show head notification if not already open
          // find name from conversations or fallback
          const c=conversations.find(x=> String(x._id)===other);
          if(c) showHead(c);
        }
      });
    }
  }catch{}

  function showHead(c){
    // optional: show floating head for new message
    let bar=document.getElementById('fbHeadsBar');
    if(!bar){ bar=document.createElement('div'); bar.id='fbHeadsBar'; bar.className='fbHeadsBar'; document.body.appendChild(bar); }
    if(bar.querySelector(`[data-uid="${c._id}"]`)) return;
    const h=document.createElement('div'); h.className='fbHead'; h.dataset.uid=String(c._id);
    const init=getInit(c.fullName);
    h.innerHTML= c.profilePicture? `<img src="${(window.API_BASE||API_BASE)+c.profilePicture}">` : init;
    const badge=document.createElement('div'); badge.className='badge'; badge.textContent='1'; h.appendChild(badge);
    h.onclick=()=>{ h.remove(); createWin(c._id, c.fullName, c.profilePicture); };
    bar.appendChild(h);
    setTimeout(()=>{ if(h.parentElement) h.remove(); },8000);
  }

  // Expose global to open from profile/message buttons
  window.openFloatingChat = window.__fbOpen;

  // Patch existing Message buttons to use floating on desktop
  document.addEventListener('click', e=>{
    const btn=e.target.closest('button.btn-message');
    if(btn && window.innerWidth>768){
      const href=btn.getAttribute('onclick')||'';
      const m=href.match(/userId=([^'"]+)/);
      if(m){
        e.preventDefault(); e.stopPropagation();
        const uid=m[1];
        // try find name near button
        const card=btn.closest('.friend-card-item, .post-card');
        const nameEl=card?card.querySelector('.name, h1')?.textContent?.trim():null;
        const name=nameEl||'User';
        window.__fbOpen(uid, name, null);
        return;
      }
    }
  });

  // Load recent for heads
  loadRecent();

  console.log('[FB Floating Chat] loaded');
})();
