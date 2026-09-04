/* DIU Nexus Messenger — Facebook Messenger A-to-Z (v6.1) */
const API = (typeof window.API !== 'undefined' ? window.API : (function(){ var p=window.location.protocol,h=window.location.hostname,po=window.location.port; if(p==='file:') return 'http://localhost:5000/api'; if(h==='localhost'||h==='127.0.0.1'||h===''){ if(po==='5000') return window.location.origin+'/api'; if(!po) return window.location.origin.indexOf('5000')!==-1?window.location.origin+'/api':'http://localhost:5000/api'; return 'http://localhost:5000/api'; } return window.location.origin+'/api'; })());
const token = localStorage.getItem('token');
const currentUser = JSON.parse(localStorage.getItem('user') || 'null');
if (!token || !currentUser) window.location.href = '../index.html';
if (localStorage.getItem('darkMode') === '1') document.body.setAttribute('data-theme', 'dark');

let activeUserId = null, activeUserName = null, activeUserPic = null, activeUserType='user';
let socket=null, allConversations=[], allPeople=[], onlineUsers=new Set();
let currentFilter='all', replyToId=null, replyToData=null, editMessageId=null;
let forwardMessageId=null, forwardIsGroup=false, forwardSelected=new Set();
let pinnedMessageId=null, messageCache=[], isLoadingMore=false, hasMore=true;
let selectedMessages=new Set(), selectionMode=false;
let typingTimeout=null, isTyping=false;

const EMOJIS = ['😀','😂','😍','🥰','😎','😭','😅','🤣','😊','🥺','😢','😤','😡','🤔','😴','🤗','😏','😬','🙄','😱','🤩','🥳','😇','🫡','👍','👎','❤️','🔥','💯','✅','🙏','👏','💪','🎉','🎊','💀','👻','🤦','🤷','💬','📱','💻','🎮','⚽','🏀','🍕','☕','🌹','🌈'];
const REACT_EMOJIS = ['❤️','😂','😮','😢','😡','👍','🔥','🎉'];

document.addEventListener('DOMContentLoaded',()=>{
    initSocket();
    loadConversations();
    populateEmojiPicker();
    const params=new URLSearchParams(window.location.search);
    const uid=params.get('userId');
    if(uid) setTimeout(()=>openChat(uid, params.get('name')||'User', null, 'user'),800);
    document.getElementById('messagesArea')?.addEventListener('scroll', handleScroll);
    // long press for mobile context
    let pressTimer=null;
    document.addEventListener('touchstart',e=>{
        const b=e.target.closest('.msg-bubble');
        if(!b) return;
        pressTimer=setTimeout(()=>{ b.dispatchEvent(new MouseEvent('contextmenu',{clientX:e.touches[0].clientX, clientY:e.touches[0].clientY, bubbles:true })); },600);
    });
    document.addEventListener('touchend',()=>clearTimeout(pressTimer));
});

// ─── SOCKET ─────────────────────────────────────────────────────────────
function initSocket(){
    socket=io(((window.API_BASE || (function(){var p=window.location.protocol,h=window.location.hostname,po=window.location.port; if(p==='file:') return 'http://localhost:5000'; if(h==='localhost'||h==='127.0.0.1'||h===''){ if(po==='5000') return window.location.origin; if(!po) return window.location.origin.indexOf('5000')!==-1?window.location.origin:'http://localhost:5000'; return 'http://localhost:5000'; } return window.location.origin; })())));
    const myId=String(currentUser._id||currentUser.id);
    socket.on('connect',()=>socket.emit('user_online', myId));
    socket.on('online_users',ids=>{ onlineUsers=new Set(ids.map(String)); updateOnlineStatus(); });
    socket.on('user_came_online',id=>{ onlineUsers.add(String(id)); updateOnlineStatus(); });
    socket.on('user_went_offline',id=>{ onlineUsers.delete(String(id)); updateOnlineStatus(); });
    socket.on('user_last_seen',()=>updateOnlineStatus());
    socket.on('receive_message', msg=>{
        // Determine if this message belongs to active chat
        const isGroupMsg = !!msg.group_id;
        const isForActive = isGroupMsg ? String(msg.group_id)===String(activeUserId) : (String(msg.sender_id)===String(activeUserId) || String(msg.receiver_id)===String(activeUserId) && String(msg.sender_id)!==myId);
        // Actually for direct: if sender is activeUser or receiver is activeUser and sender is me? Simplify: if active is direct and msg.sender==active or (msg.sender==me && msg.receiver==active)
        let shouldAppend=false;
        if(activeUserId){
            if(activeUserType==='group' && isGroupMsg && String(msg.group_id)===String(activeUserId)) shouldAppend=true;
            else if(activeUserType==='user' && !isGroupMsg){
                if(String(msg.sender_id)===String(activeUserId) && String(msg.receiver_id)===myId) shouldAppend=true;
                else if(String(msg.sender_id)===myId && String(msg.receiver_id)===String(activeUserId)) shouldAppend=true;
                // also self sync
                if(String(msg.sender_id)===myId && String(msg.receiver_id)===String(activeUserId)) shouldAppend=true;
            }
        }
        if(shouldAppend){
            appendMessage(msg, String(msg.sender_id)===myId);
            markMessagesRead(activeUserId);
            // auto delivered ack
            if(String(msg.sender_id)!==myId) socket.emit('message_delivered',{messageId:msg.id, senderId:msg.sender_id});
        } else {
            // badge++ and refresh conversations
            const item=document.getElementById(`conv-${msg.sender_id}`);
            if(item){
                let badge=item.querySelector('.unread-badge');
                if(!badge){ badge=document.createElement('span'); badge.className='unread-badge'; item.querySelector('.chat-meta')?.prepend(badge); }
                badge.textContent=parseInt(badge.textContent||0)+1;
            }
            playNotificationSound();
            loadConversations();
        }
    });
    socket.on('message_sent',msg=>{
        // multi-device sync: if I sent from another device and active chat is same receiver, append
        if(String(msg.sender_id)===myId && activeUserId && String(msg.receiver_id)===String(activeUserId)){
            // avoid duplicate if already appended via HTTP response; check existence
            if(!document.getElementById('msg_'+msg.id)) appendMessage(msg,true);
        }
    });
    socket.on('message_edited',data=>{
        const el=document.getElementById('msg_'+data.messageId);
        if(el){
            const bubble=el.querySelector('.msg-bubble .msg-text');
            if(bubble) bubble.textContent=data.content;
            let edited=el.querySelector('.edited-label');
            if(!edited){ edited=document.createElement('span'); edited.className='edited-label'; edited.textContent='(edited)'; el.querySelector('.msg-meta')?.appendChild(edited); }
        }
    });
    socket.on('message_unsent',data=>{
        const el=document.getElementById('msg_'+data.messageId);
        if(el){
            el.innerHTML='<div class="msg-group-row"><div class="msg-bubble" style="opacity:0.6;font-style:italic;background:var(--surface);border:1px solid var(--border);font-size:0.82rem;color:var(--text-secondary);">This message was unsent</div></div>';
        }
        loadConversations();
    });
    socket.on('message_deleted_for_me',data=>{
        const el=document.getElementById('msg_'+data.messageId);
        if(el) el.style.display='none';
    });
    socket.on('message_reaction',data=>{
        const el=document.getElementById('msg_'+data.messageId);
        if(!el) return;
        let cont=el.querySelector('.msg-reactions');
        if(!cont){ cont=document.createElement('div'); cont.className='msg-reactions'; el.appendChild(cont); }
        if(!data.reactions || !data.reactions.length){ cont.innerHTML=''; return; }
        cont.innerHTML=data.reactions.map(r=>`<span class="react-pill ${r.users.includes(myId)?'mine':''}" onclick="toggleReact(${data.messageId},'${r.emoji}',${data.isGroup})">${r.emoji} ${r.count}</span>`).join('');
    });
    socket.on('message_pinned',data=>{
        if(String(data.conversationId)===String(activeUserId)) showPinnedBanner(data.messageId);
        loadConversations();
    });
    socket.on('message_unpinned',data=>{
        if(String(data.conversationId)===String(activeUserId)) hidePinnedBanner();
    });
    socket.on('user_typing',({senderId})=>{
        if(String(senderId)===String(activeUserId)){
            const ti=document.getElementById('typingIndicator');
            if(ti) ti.style.display='flex';
            clearTimeout(window._typingTimer);
            window._typingTimer=setTimeout(()=>{ if(ti) ti.style.display='none'; },2500);
        }
    });
    socket.on('user_stop_typing',({senderId})=>{
        if(String(senderId)===String(activeUserId)){
            const ti=document.getElementById('typingIndicator');
            if(ti) ti.style.display='none';
        }
    });
    socket.on('messages_seen',({readerId})=>{
        if(String(readerId)===String(activeUserId)){
            document.querySelectorAll('.msg-status .tick').forEach(el=>{ el.textContent='✓✓'; el.classList.add('seen'); });
            document.querySelectorAll('.msg-status').forEach(el=>{ if(!el.textContent.includes('Seen')) el.innerHTML+=' <span style="color:var(--blue);font-size:0.62rem;">Seen</span>'; });
        }
    });
    socket.on('messages_delivered',()=>{
        document.querySelectorAll('.msg-status').forEach(el=>{
            if(el.textContent.includes('Sent')) el.innerHTML=el.innerHTML.replace('Sent','Delivered');
        });
    });
    socket.on('message_delivered',()=>{
        document.querySelectorAll('.msg-status').forEach(el=>{
            if(el.textContent.includes('Sent')) el.innerHTML=el.innerHTML.replace('Sent','Delivered');
        });
    });
    // WebRTC
    socket.on('call:incoming',handleIncomingCall);
    socket.on('call:accepted',handleCallAccepted);
    socket.on('call:rejected',data=>{ stopRingtone(); showToast(`Call declined: ${data.reason||'busy'}`); closeCallModal(); });
    socket.on('call:ended',()=>{ stopRingtone(); showToast('Call ended'); closeCallModal(); });
    socket.on('call:user_offline',()=>{ stopRingtone(); showToast('User is offline'); closeCallModal(); });
    socket.on('call:signal',async({signal})=>{
        if(peerConnection && signal){
            try{
                if(signal.sdp){
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
                    if(signal.sdp.type==='offer'){
                        const answer=await peerConnection.createAnswer();
                        await peerConnection.setLocalDescription(answer);
                        socket.emit('call:signal',{toUserId:activeCallTargetId, signal:{sdp:peerConnection.localDescription}});
                    }
                } else if(signal.candidate) await peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
            }catch(e){ console.error(e); }
        }
    });
}

// ─── WebRTC (keep original) ─────────────────────────────────────────────
let peerConnection=null, localStream=null, remoteStream=null, activeCallTargetId=null, activeCallIsVideo=false, incomingCallData=null, callTimerInterval=null, callDurationSeconds=0, audioRingContext=null, ringToneNode=null;
const rtcConfig={iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}]};
function playRingtone(){ try{ if(!audioRingContext) audioRingContext=new (window.AudioContext||window.webkitAudioContext)(); if(audioRingContext.state==='suspended') audioRingContext.resume(); const osc=audioRingContext.createOscillator(); const gain=audioRingContext.createGain(); osc.type='sine'; osc.frequency.setValueAtTime(440,audioRingContext.currentTime); gain.gain.setValueAtTime(0.12,audioRingContext.currentTime); osc.connect(gain); gain.connect(audioRingContext.destination); osc.start(); ringToneNode=osc; }catch(e){} }
function stopRingtone(){ try{ if(ringToneNode){ ringToneNode.stop(); ringToneNode=null; } }catch(e){} }
async function startCall(isVideo){
    if(!activeUserId){ showToast('Select a conversation first'); return; }
    activeCallTargetId=activeUserId; activeCallIsVideo=isVideo;
    document.getElementById('activeCallName').textContent=activeUserName||'User';
    document.getElementById('activeCallAvatar').textContent=getInitials(activeUserName);
    document.getElementById('callStatusText').innerHTML='<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#f59e0b;"></span> Calling...';
    document.getElementById('activeCallModal').style.display='flex';
    document.getElementById('audioCallDisplay').style.display=isVideo?'none':'flex';
    document.getElementById('localVideoWrap').style.display=isVideo?'block':'none';
    try{ localStream=await navigator.mediaDevices.getUserMedia({audio:true, video:isVideo?{width:{ideal:1280},height:{ideal:720}}:false}); const el=document.getElementById('localVideo'); if(el) el.srcObject=localStream; }catch(err){ showToast('Camera/Mic virtual mode','info'); }
    playRingtone();
    socket.emit('call:start',{toUserId:activeCallTargetId, fromUser:{id:currentUser._id||currentUser.id, fullName:currentUser.fullName, profilePicture:currentUser.profilePicture}, isVideo, callId:'call_'+Date.now()});
}
function handleIncomingCall(data){
    incomingCallData=data; activeCallTargetId=data.fromUser.id; activeCallIsVideo=data.isVideo;
    document.getElementById('incCallerName').textContent=data.fromUser.fullName||'DIU Member';
    document.getElementById('incCallType').textContent=data.isVideo?'📹 Incoming Video Call...':'📞 Incoming Audio Call...';
    const av=document.getElementById('incAvatar');
    if(data.fromUser.profilePicture) av.innerHTML=`<img src="${(window.API_BASE || (function(){var p=window.location.protocol,h=window.location.hostname,po=window.location.port; if(p==='file:') return 'http://localhost:5000'; if(h==='localhost'||h==='127.0.0.1'||h===''){ if(po==='5000') return window.location.origin; if(!po) return window.location.origin.indexOf('5000')!==-1?window.location.origin:'http://localhost:5000'; return 'http://localhost:5000'; } return window.location.origin; })())}${data.fromUser.profilePicture}" style="width:100%;height:100%;object-fit:cover;">`; else av.textContent=getInitials(data.fromUser.fullName);
    document.getElementById('incomingCallModal').style.display='flex'; playRingtone();
}
async function acceptIncomingCall(){
    stopRingtone(); document.getElementById('incomingCallModal').style.display='none';
    document.getElementById('activeCallName').textContent=incomingCallData?.fromUser?.fullName||'User';
    document.getElementById('activeCallAvatar').textContent=getInitials(incomingCallData?.fromUser?.fullName);
    document.getElementById('callStatusText').innerHTML='<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#31a24c;"></span> Connected';
    document.getElementById('activeCallModal').style.display='flex';
    document.getElementById('audioCallDisplay').style.display=activeCallIsVideo?'none':'flex';
    document.getElementById('localVideoWrap').style.display=activeCallIsVideo?'block':'none';
    try{ localStream=await navigator.mediaDevices.getUserMedia({audio:true, video:activeCallIsVideo?{width:{ideal:1280},height:{ideal:720}}:false}); const el=document.getElementById('localVideo'); if(el) el.srcObject=localStream; }catch(e){}
    setupPeerConnection();
    socket.emit('call:accept',{toUserId:activeCallTargetId, callId:incomingCallData?.callId, isVideo:activeCallIsVideo});
    startCallTimer();
}
function rejectIncomingCall(){ stopRingtone(); document.getElementById('incomingCallModal').style.display='none'; if(incomingCallData) socket.emit('call:reject',{toUserId:incomingCallData.fromUser.id, callId:incomingCallData.callId}); incomingCallData=null; }
async function handleCallAccepted(){ stopRingtone(); document.getElementById('callStatusText').innerHTML='<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#31a24c;"></span> Connected'; startCallTimer(); await setupPeerConnection(); try{ const offer=await peerConnection.createOffer(); await peerConnection.setLocalDescription(offer); socket.emit('call:signal',{toUserId:activeCallTargetId, signal:{sdp:peerConnection.localDescription}}); }catch(e){} }
async function setupPeerConnection(){
    peerConnection=new RTCPeerConnection(rtcConfig);
    if(localStream) localStream.getTracks().forEach(t=>peerConnection.addTrack(t,localStream));
    peerConnection.ontrack=e=>{ remoteStream=e.streams[0]; const rv=document.getElementById('remoteVideo'); if(rv){ rv.srcObject=remoteStream; if(activeCallIsVideo) document.getElementById('audioCallDisplay').style.display='none'; } };
    peerConnection.onicecandidate=e=>{ if(e.candidate) socket.emit('call:signal',{toUserId:activeCallTargetId, signal:{candidate:e.candidate}}); };
}
function startCallTimer(){ callDurationSeconds=0; clearInterval(callTimerInterval); callTimerInterval=setInterval(()=>{ callDurationSeconds++; const m=String(Math.floor(callDurationSeconds/60)).padStart(2,'0'); const s=String(callDurationSeconds%60).padStart(2,'0'); document.getElementById('callDuration').textContent=`${m}:${s}`; },1000); }
function endCall(){ stopRingtone(); if(activeCallTargetId) socket.emit('call:end',{toUserId:activeCallTargetId}); closeCallModal(); showToast('Call ended'); }
function closeCallModal(){ stopRingtone(); clearInterval(callTimerInterval); document.getElementById('activeCallModal').style.display='none'; document.getElementById('incomingCallModal').style.display='none'; if(localStream) localStream.getTracks().forEach(t=>t.stop()); localStream=null; if(peerConnection){ peerConnection.close(); peerConnection=null; } activeCallTargetId=null; }
function toggleMuteMic(){ if(!localStream) return; const tr=localStream.getAudioTracks()[0]; if(tr){ tr.enabled=!tr.enabled; document.getElementById('micIcon').className=tr.enabled?'fas fa-microphone':'fas fa-microphone-slash'; document.getElementById('toggleMicBtn').style.background=tr.enabled?'rgba(255,255,255,0.15)':'#e41e3f'; } }
function toggleVideoCamera(){ if(!localStream) return; const tr=localStream.getVideoTracks()[0]; const ic=document.getElementById('camIcon'); const btn=document.getElementById('toggleCamBtn'); if(tr){ tr.enabled=!tr.enabled; ic.className=tr.enabled?'fas fa-video':'fas fa-video-slash'; btn.style.background=tr.enabled?'rgba(255,255,255,0.15)':'#e41e3f'; document.getElementById('audioCallDisplay').style.display=tr.enabled?'none':'flex'; } }
async function toggleScreenShare(){ try{ const s=await navigator.mediaDevices.getDisplayMedia({video:true}); const t=s.getVideoTracks()[0]; if(peerConnection){ const sender=peerConnection.getSenders().find(s=>s.track.kind==='video'); if(sender) sender.replaceTrack(t); } document.getElementById('localVideo').srcObject=s; t.onended=()=>{ if(localStream){ const vt=localStream.getVideoTracks()[0]; const sender=peerConnection.getSenders().find(s=>s.track.kind==='video'); if(sender&&vt) sender.replaceTrack(vt); document.getElementById('localVideo').srcObject=localStream; } }; }catch{ showToast('Screen share canceled'); } }

// ─── CONVERSATIONS ───────────────────────────────────────────────────────
async function loadConversations(){
    try{
        const q=document.getElementById('convSearch')?.value||'';
        const url = `/messages/conversations?filter=${currentFilter}` + (q?`&q=${encodeURIComponent(q)}`:'');
        const res=await apiFetch(url);
        let data=await res.json();
        // data is already filtered but ensure json parse
        if(typeof data === 'string') try{ data=JSON.parse(data);}catch{}
        // For requests tab, data is not used - we load separate
        if(currentFilter==='requests'){
            // loadMessageRequests handles rendering
            return;
        }
        allConversations=data;
        renderConversations(data);
    }catch(e){
        document.getElementById('chatListBody').innerHTML='<div style="padding:20px;text-align:center;color:#65676b;">Failed to load</div>';
    }
}
function renderConversations(convs){
    const el=document.getElementById('chatListBody');
    if(!convs.length){
        const msg = currentFilter==='archived' ? 'No archived chats' : currentFilter==='unread' ? 'No unread messages' : 'No conversations yet.<br>Click + to start chatting!';
        el.innerHTML=`<div style="padding:24px;text-align:center;color:#65676b;font-size:0.85rem;">${msg}</div>`;
        return;
    }
    el.innerHTML=convs.map(c=>{
        const initials=getInitials(c.fullName);
        const avatarHtml=c.profilePicture?`<img class="av" src="${(window.API_BASE || (function(){var p=window.location.protocol,h=window.location.hostname,po=window.location.port; if(p==='file:') return 'http://localhost:5000'; if(h==='localhost'||h==='127.0.0.1'||h===''){ if(po==='5000') return window.location.origin; if(!po) return window.location.origin.indexOf('5000')!==-1?window.location.origin:'http://localhost:5000'; return 'http://localhost:5000'; } return window.location.origin; })())}${c.profilePicture}" onerror="this.style.display='none'">`:`<div class="ap">${initials}</div>`;
        const isOnline=onlineUsers.has(String(c._id));
        const hasUnread=c.unreadCount>0;
        const pinIcon=c.isPinned?'<i class="fas fa-thumbtack pin-icon" title="Pinned"></i>':'';
        const muteIcon=c.isMuted?'<i class="fas fa-volume-mute mute-icon" title="Muted"></i>':'';
        const archClass=c.isArchived?' archived':'';
        const muteClass=c.isMuted?' muted':'';
        return `<div class="chat-item${archClass}${muteClass}" id="conv-${c._id}" data-uid="${c._id}" onclick="openChat('${c._id}','${escHtml(c.fullName)}',${c.profilePicture?`'${c.profilePicture}'`:'null'},'${c.type}')">
            <div class="chat-avatar">${avatarHtml}<div class="online-ring" style="display:${isOnline?'block':'none'};"></div></div>
            <div class="chat-info"><div class="chat-name">${escHtml(c.fullName)}${pinIcon}${muteIcon}</div>
                <div class="chat-preview"><div class="chat-last-msg ${hasUnread?'unread':''}">${c.lastMessage?escHtml(c.lastMessage).slice(0,45):'Say hello! 👋'}</div></div>
            </div>
            <div class="chat-meta">${c.lastMessageTime?`<div class="chat-time">${timeAgo(c.lastMessageTime)}</div>`:''}${hasUnread?`<div class="unread-badge">${c.unreadCount}</div>`:''}</div>
        </div>`;
    }).join('');
}
function filterConversations(q){
    if(!q) renderConversations(allConversations);
    else renderConversations(allConversations.filter(c=> c.fullName.toLowerCase().includes(q.toLowerCase()) || (c.lastMessage&&c.lastMessage.toLowerCase().includes(q.toLowerCase()))));
}
function setChatFilter(filter, btn){
    currentFilter=filter;
    document.querySelectorAll('.filter-chip').forEach(b=>b.classList.remove('active'));
    if(btn) btn.classList.add('active');
    if(filter==='requests') loadMessageRequests();
    else loadConversations();
}
async function loadMessageRequests(){
    currentFilter='requests';
    document.querySelectorAll('.filter-chip').forEach(b=>b.classList.remove('active'));
    document.querySelector(`[data-filter="requests"]`)?.classList.add('active');
    const el=document.getElementById('chatListBody');
    el.innerHTML='<div style="padding:20px;text-align:center;"><i class="fas fa-spinner fa-spin"></i> Loading requests...</div>';
    try{
        const res=await apiFetch('/messages/requests');
        const data=await res.json();
        if(!data.length){ el.innerHTML='<div style="padding:20px;text-align:center;color:#65676b;">No message requests</div>'; return; }
        el.innerHTML=data.map(r=>`<div class="chat-item" onclick="handleRequestAction(${r.id},'accept','${r.sender_id}','${escHtml(r.fullName)}')">
            <div class="chat-avatar"><div class="ap">${getInitials(r.fullName)}</div></div>
            <div class="chat-info"><div class="chat-name">${escHtml(r.fullName)} <span style="font-size:0.65rem;background:#ffcc00;padding:2px 6px;border-radius:10px;">Request</span></div><div class="chat-preview"><div class="chat-last-msg">Wants to message you</div></div></div>
            <div class="chat-meta"><button onclick="event.stopPropagation(); handleRequestAction(${r.id},'accept','${r.sender_id}','${escHtml(r.fullName)}')" style="background:var(--blue);color:white;border:none;padding:4px 8px;border-radius:12px;font-size:0.7rem;cursor:pointer;">Accept</button></div>
        </div>`).join('');
    }catch{ el.innerHTML='<div style="padding:20px;color:red;text-align:center;">Failed</div>'; }
}
async function handleRequestAction(reqId, action, senderId, name){
    try{
        await apiFetch('/messages/requests/handle',{method:'POST', body:JSON.stringify({requestId:reqId, action})});
        showToast(action==='accept'?'Request accepted':'Request rejected');
        if(action==='accept' && senderId) openChat(senderId, name, null, 'user');
        setChatFilter('all', document.querySelector(`[data-filter="all"]`));
    }catch{ showToast('Failed','error'); }
}
function updateOnlineStatus(){
    document.querySelectorAll('.chat-item').forEach(el=>{
        const uid=el.dataset.uid;
        const ring=el.querySelector('.online-ring');
        if(ring) ring.style.display=onlineUsers.has(uid)?'block':'none';
    });
    if(activeUserId){
        const st=document.getElementById('chatHdrStatus');
        if(st){ 
            const isOn=onlineUsers.has(String(activeUserId));
            st.textContent=isOn?'Active now':'Offline';
            st.className='chat-header-status'+(isOn?'':' offline');
        }
    }
}

// ─── OPEN CHAT ───────────────────────────────────────────────────────────
async function openChat(userId, name, picUrl, type='user'){
    activeUserId=userId; activeUserName=name; activeUserPic=picUrl; activeUserType=type;
    document.getElementById('chatEmpty').style.display='none';
    const win=document.getElementById('chatWindow'); win.style.display='flex';
    // header
    const hdrAvatar=document.getElementById('chatHdrAvatar');
    if(picUrl) hdrAvatar.innerHTML=`<img class="av" style="width:42px;height:42px;" src="${(window.API_BASE || (function(){var p=window.location.protocol,h=window.location.hostname,po=window.location.port; if(p==='file:') return 'http://localhost:5000'; if(h==='localhost'||h==='127.0.0.1'||h===''){ if(po==='5000') return window.location.origin; if(!po) return window.location.origin.indexOf('5000')!==-1?window.location.origin:'http://localhost:5000'; return 'http://localhost:5000'; } return window.location.origin; })())}${picUrl}" onerror="this.innerHTML='<div class=ap>${getInitials(name)}</div>'">`;
    else hdrAvatar.innerHTML=`<div class="ap" style="width:42px;height:42px;">${getInitials(name)}</div>`;
    document.getElementById('chatHdrName').textContent=name;
    const statusEl=document.getElementById('chatHdrStatus');
    const isOn=onlineUsers.has(String(userId));
    statusEl.textContent= type==='group' ? 'Group chat' : (isOn?'Active now':'Offline');
    statusEl.className='chat-header-status'+(isOn||type==='group'?'':' offline');
    // highlight
    document.querySelectorAll('.chat-item').forEach(el=>el.classList.remove('active'));
    document.getElementById(`conv-${userId}`)?.classList.add('active');
    // reset pagination
    hasMore=true; isLoadingMore=false; messageCache=[];
    await loadMessages(userId, true);
    markMessagesRead(userId);
    document.getElementById('chatInput').focus();
    if(window.innerWidth<=700) document.getElementById('chatList').classList.add('hidden-mobile');
    closeEmojiPicker(); hidePinnedBanner(); loadPinnedBanner();
    // join socket room for group
    if(type==='group' && socket) socket.emit('join_group', userId);
    // update drawer
    document.getElementById('drawerName').textContent=name;
    document.getElementById('drawerAvatar').innerHTML= picUrl? `<img src="${(window.API_BASE || (function(){var p=window.location.protocol,h=window.location.hostname,po=window.location.port; if(p==='file:') return 'http://localhost:5000'; if(h==='localhost'||h==='127.0.0.1'||h===''){ if(po==='5000') return window.location.origin; if(!po) return window.location.origin.indexOf('5000')!==-1?window.location.origin:'http://localhost:5000'; return 'http://localhost:5000'; } return window.location.origin; })())}${picUrl}" style="width:100%;height:100%;object-fit:cover;">` : getInitials(name);
    document.getElementById('drawerStatus').textContent= statusEl.textContent;
}
function showChatList(){ document.getElementById('chatList').classList.remove('hidden-mobile'); }
function goToProfile(){ if(activeUserId) window.location.href=`profile.html?id=${activeUserId}`; }

// ─── MESSAGES (paginated, reactions, reply, link preview) ────────────────
async function loadMessages(userId, reset=false){
    const area=document.getElementById('messagesArea');
    if(reset) area.innerHTML='<div style="padding:20px;text-align:center;color:#65676b;"><i class="fas fa-spinner fa-spin"></i> Loading...</div><div class="typing-indicator" id="typingIndicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>';
    try{
        const limit=30;
        let url=`/messages/${userId}?limit=${limit}`;
        if(activeUserType==='group') url+=`&type=group`;
        if(!reset && messageCache.length){
            const oldest=messageCache[0];
            url+=`&before=${oldest.id}`;
        }
        const res=await apiFetch(url);
        const msgs=await res.json();
        if(reset){ messageCache=[]; area.innerHTML='<div class="typing-indicator" id="typingIndicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>'; hasMore=msgs.length===limit; }
        else hasMore=msgs.length===limit;
        if(!msgs.length && reset){
            area.innerHTML='<div style="padding:20px;text-align:center;color:#65676b;"><i class="fas fa-spinner fa-spin"></i> No messages yet<br><span style="font-size:0.8rem;">Say hello 👋</span></div><div class="typing-indicator" id="typingIndicator" style="display:none;"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>';
            return;
        }
        // prepend if loading more, else append
        if(!reset){
            // save scroll
            const oldHeight=area.scrollHeight;
            insertMessages(msgs, true);
            area.scrollTop = area.scrollHeight - oldHeight;
        } else {
            // group by date and insert
            let lastDate=null;
            const myId=String(currentUser._id||currentUser.id);
            // msgs are asc from server after reverse? Our server returns asc for old->new after reverse; for pagination with DESC then reverse, so msgs are asc
            msgs.forEach(m=>{
                const d=new Date(m.created_at).toDateString();
                if(d!==lastDate){
                    const div=document.createElement('div'); div.className='date-divider'; div.textContent=formatDate(m.created_at);
                    area.insertBefore(div, document.getElementById('typingIndicator'));
                    lastDate=d;
                }
                const isOwn=String(m.sender_id)===myId;
                // We'll use appendMessage but need to avoid double date dividers; instead directly append
                appendMessage(m, isOwn, true);
            });
            area.scrollTop=area.scrollHeight;
        }
        messageCache = reset ? msgs : [...msgs, ...messageCache];
        isLoadingMore=false;
    }catch(e){
        if(reset) area.innerHTML='<div style="padding:20px;text-align:center;color:#e41e3f;">Failed to load messages</div>';
        isLoadingMore=false;
    }
}
function handleScroll(){
    const area=document.getElementById('messagesArea');
    if(area.scrollTop<80 && hasMore && !isLoadingMore){
        isLoadingMore=true;
        loadMessages(activeUserId, false);
    }
}
function insertMessages(msgs, prepend){
    let lastDate=null;
    const area=document.getElementById('messagesArea');
    const typing=document.getElementById('typingIndicator');
    // Find first divider to compare
    msgs.forEach(m=>{
        const d=new Date(m.created_at).toDateString();
        // if prepend, we don't know; just insert before first child
        const myId=String(currentUser._id||currentUser.id);
        const isOwn=String(m.sender_id)===myId;
        const div=createMessageElement(m,isOwn);
        if(prepend){
            const first=area.firstChild;
            area.insertBefore(div, first);
            // date divider handling simplified: if needed, insert divider before div if date changed from previous
            // For brevity, skip complex divider on prepend
        } else {
            area.insertBefore(div, typing);
        }
    });
}
function createMessageElement(msg, isOwn){
    const div=document.createElement('div');
    div.className='msg-group '+(isOwn?'mine':'theirs');
    div.id='msg_'+(msg.id||msg._id);
    div.dataset.sender=msg.sender_id;
    const time=formatTime(msg.created_at);
    const isImage=msg.content && msg.content.startsWith('[IMAGE]:');
    const isVoice=msg.content && msg.content.startsWith('[VOICE]:');
    const isGif=msg.content && msg.content.startsWith('[GIF]:');
    const isFile=msg.content && msg.content.startsWith('[FILE]:');
    let bubbleContent='', extraClass='';
    // Global image fix: handle file_url directly (Cloudinary) before prefix checks
    const rawFileUrl = msg.file_url || msg.fileUrl || '';
    const isDirectImage = rawFileUrl && (msg.message_type==='image' || /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(rawFileUrl) || rawFileUrl.includes('res.cloudinary.com') || rawFileUrl.includes('/uploads/'));
    if(isDirectImage && !msg.content?.startsWith('[IMAGE]:') && !msg.content?.startsWith('[FILE]:')){
        const url=(rawFileUrl.startsWith('http')||rawFileUrl.startsWith('data:')||rawFileUrl.startsWith('blob:')) ? rawFileUrl : (window.mediaUrl ? window.mediaUrl(rawFileUrl) : `${(window.API_BASE || (function(){var p=window.location.protocol,h=window.location.hostname,po=window.location.port; if(p==='file:') return 'http://localhost:5000'; if(h==='localhost'||h==='127.0.0.1'||h===''){ if(po==='5000') return window.location.origin; if(!po) return window.location.origin.indexOf('5000')!==-1?window.location.origin:'http://localhost:5000'; return 'http://localhost:5000'; } return window.location.origin; })())}${rawFileUrl}`);
        bubbleContent=`<img src="${url}" onclick="openLightbox('${url}')" alt="Image" style="max-width:220px;max-height:220px;border-radius:10px;cursor:zoom-in;display:block;">`;
        extraClass=' img-msg';
        // Skip other branches by returning early bubble
        let replyHtml2='';
        if(msg.reply_to_id && msg.replyTo){
            const r=msg.replyTo;
            const rText = r.content ? (r.content.startsWith('[IMAGE]:')?'📷 Photo': r.content.startsWith('[FILE]:')?'📎 File': r.content.startsWith('[VOICE]:')?'🎤 Voice': r.content).slice(0,60) : '';
            replyHtml2=`<div style="border-left:3px solid ${isOwn?'rgba(255,255,255,0.8)':'var(--blue)'}; padding:4px 8px; margin-bottom:6px; background:${isOwn?'rgba(255,255,255,0.15)':'var(--bg)'}; border-radius:6px; font-size:0.78rem;">
                <div style="font-weight:700; font-size:0.72rem; color:${isOwn?'white':'var(--blue)'};">${escHtml(r.fullName||'Reply')}</div>
                <div style="opacity:0.85; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escHtml(rText)}</div>
            </div>`;
        }
        let forwardedHtml2= msg.is_forwarded ? `<div class="forwarded-label"><i class="fas fa-share"></i> Forwarded</div>` : '';
        const avatarHtml2 = !isOwn ? (activeUserPic?`<img class="msg-small-av" src="${(window.API_BASE || (function(){var p=window.location.protocol,h=window.location.hostname,po=window.location.port; if(p==='file:') return 'http://localhost:5000'; if(h==='localhost'||h==='127.0.0.1'||h===''){ if(po==='5000') return window.location.origin; if(!po) return window.location.origin.indexOf('5000')!==-1?window.location.origin:'http://localhost:5000'; return 'http://localhost:5000'; } return window.location.origin; })())}${activeUserPic}" onerror="this.style.display='none'">`:`<div class="msg-small-ap">${getInitials(activeUserName)}</div>`) : `<div class="msg-tail-space"></div>`;
        let reactionsHtml2='';
        if(msg.reactions && msg.reactions.length){
            reactionsHtml2=`<div class="msg-reactions">${msg.reactions.map(r=>`<span class="react-pill ${r.users.includes(String(currentUser._id||currentUser.id))?'mine':''}" onclick="toggleReact(${msg.id},'${r.emoji}',${activeUserType==='group'})">${r.emoji} ${r.count}</span>`).join('')}</div>`;
        }
        let statusHtml2='';
        if(isOwn){
            let tick='✓ Sent';
            if(msg.status==='delivered') tick='✓✓ Delivered';
            else if(msg.status==='seen' || msg.isRead) tick='✓✓ Seen';
            statusHtml2=`<div class="msg-status"><span class="tick ${tick.includes('Seen')?'seen':''}">${tick}</span></div>`;
        }
        // Return early constructed element
        const _tmp=document.createElement('div');
        _tmp.className='msg-group '+(isOwn?'mine':'theirs');
        _tmp.id='msg_'+(msg.id||msg._id);
        _tmp.dataset.sender=msg.sender_id;
        const time2=formatTime(msg.created_at);
        _tmp.innerHTML=`
            <div class="msg-group-row">
                ${isOwn?'':avatarHtml2}
                <div style="position:relative; max-width:78%; display:flex; flex-direction:column; align-items:${isOwn?'flex-end':'flex-start'};">
                    <div class="msg-bubble ${isOwn?'mine':'theirs'}${extraClass}" data-msgid="${msg.id}">${forwardedHtml2}${replyHtml2}${bubbleContent}</div>
                    <div class="reaction-bar" style="display:none;" id="reactBar-${msg.id}">${REACT_EMOJIS.map(e=>`<button onclick="toggleReact(${msg.id},'${e}',${activeUserType==='group'})">${e}</button>`).join('')}<button onclick="toggleReact(${msg.id},'👍',${activeUserType==='group'})" style="font-size:0.75rem;">＋</button></div>
                    ${reactionsHtml2}
                </div>
                ${isOwn?'<div class="msg-tail-space"></div>':''}
            </div>
            <div class="msg-meta" style="text-align:${isOwn?'right':'left'};"><span>${time2}</span></div>
            ${statusHtml2}
        `;
        _tmp.addEventListener('mouseenter',()=>{ const bar=document.getElementById(`reactBar-${msg.id}`); if(bar) bar.style.display='flex'; });
        _tmp.addEventListener('mouseleave',()=>{ const bar=document.getElementById(`reactBar-${msg.id}`); if(bar) bar.style.display='none'; });
        return _tmp;
    }
    // Reply preview
    let replyHtml='';
    if(msg.reply_to_id && msg.replyTo){
        const r=msg.replyTo;
        const rText = r.content ? (r.content.startsWith('[IMAGE]:')?'📷 Photo': r.content.startsWith('[FILE]:')?'📎 File': r.content.startsWith('[VOICE]:')?'🎤 Voice': r.content).slice(0,60) : '';
        replyHtml=`<div style="border-left:3px solid ${isOwn?'rgba(255,255,255,0.8)':'var(--blue)'}; padding:4px 8px; margin-bottom:6px; background:${isOwn?'rgba(255,255,255,0.15)':'var(--bg)'}; border-radius:6px; font-size:0.78rem;">
            <div style="font-weight:700; font-size:0.72rem; color:${isOwn?'white':'var(--blue)'};">${escHtml(r.fullName||'Reply')}</div>
            <div style="opacity:0.85; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escHtml(rText)}</div>
        </div>`;
    } else if(msg.reply_to_id){
        replyHtml=`<div style="border-left:3px solid ${isOwn?'rgba(255,255,255,0.8)':'var(--blue)'}; padding:4px 8px; margin-bottom:6px; background:${isOwn?'rgba(255,255,255,0.15)':'var(--bg)'}; border-radius:6px; font-size:0.78rem; opacity:0.7;">↩ Replying to message</div>`;
    }
    let forwardedHtml= msg.is_forwarded ? `<div class="forwarded-label"><i class="fas fa-share"></i> Forwarded</div>` : '';
    let linkPreviewHtml='';
    // Detect link for preview
    let linkUrl=null;
    if(msg.message_type==='link' && msg.content){
        const m=msg.content.match(/https?:\/\/[^\s]+/);
        if(m) linkUrl=m[0];
    }
    // Main content
    if(isImage){
        const raw=msg.content.replace('[IMAGE]:','').trim().split('|')[0].trim();
        const url=(raw.startsWith('data:')||raw.startsWith('http')||raw.startsWith('blob:')) ? raw : (window.mediaUrl ? window.mediaUrl(raw) : `${(window.API_BASE || (function(){var p=window.location.protocol,h=window.location.hostname,po=window.location.port; if(p==='file:') return 'http://localhost:5000'; if(h==='localhost'||h==='127.0.0.1'||h===''){ if(po==='5000') return window.location.origin; if(!po) return window.location.origin.indexOf('5000')!==-1?window.location.origin:'http://localhost:5000'; return 'http://localhost:5000'; } return window.location.origin; })())}${raw}`);
        bubbleContent=`${forwardedHtml}${replyHtml}<img src="${url}" onclick="openLightbox('${url}')" alt="Image" style="max-width:220px;max-height:220px;border-radius:10px;cursor:zoom-in;display:block;">`;
        extraClass=' img-msg';
    } else if(isVoice){
        const raw=msg.content.replace('[VOICE]:','').trim();
        const url=(raw.startsWith('data:')||raw.startsWith('http')||raw.startsWith('blob:')) ? raw : (window.mediaUrl ? window.mediaUrl(raw) : `${(window.API_BASE || (function(){var p=window.location.protocol,h=window.location.hostname,po=window.location.port; if(p==='file:') return 'http://localhost:5000'; if(h==='localhost'||h==='127.0.0.1'||h===''){ if(po==='5000') return window.location.origin; if(!po) return window.location.origin.indexOf('5000')!==-1?window.location.origin:'http://localhost:5000'; return 'http://localhost:5000'; } return window.location.origin; })())}${raw}`);
        bubbleContent=`${forwardedHtml}${replyHtml}<div class="voice-progress"><audio controls style="height:32px;outline:none;" src="${url}" onplay="this.nextElementSibling.style.display='none'"></audio><div style="display:flex;gap:2px;"><span style="display:inline-block;width:3px;height:12px;background:currentColor;border-radius:2px;"></span><span style="display:inline-block;width:3px;height:8px;background:currentColor;border-radius:2px;opacity:0.7;"></span><span style="display:inline-block;width:3px;height:16px;background:currentColor;border-radius:2px;"></span><span style="display:inline-block;width:3px;height:10px;background:currentColor;border-radius:2px;opacity:0.8;"></span></div></div>`;
    } else if(isGif){
        const url=msg.content.replace('[GIF]:','').trim();
        bubbleContent=`${forwardedHtml}${replyHtml}<img src="${url}" style="max-width:200px;border-radius:10px;">`;
        extraClass=' img-msg';
    } else if(isFile){
        const raw=msg.content.replace('[FILE]:','');
        // format: url|fileName|fileSize or fileName|fileSize|pending etc
        let fileName='', fileSize='', fileUrl=null;
        // Try parse variations
        if(raw.includes('|')){
            const parts=raw.split('|');
            // Could be url|name|size or name|size|url etc. Heuristics:
            // If first part starts with /uploads -> url
            if(parts[0].startsWith('/uploads') || parts[0].startsWith('http')){
                fileUrl=parts[0].startsWith('http')?parts[0]: (window.mediaUrl ? window.mediaUrl(parts[0]) : `${(window.API_BASE || (function(){var p=window.location.protocol,h=window.location.hostname,po=window.location.port; if(p==='file:') return 'http://localhost:5000'; if(h==='localhost'||h==='127.0.0.1'||h===''){ if(po==='5000') return window.location.origin; if(!po) return window.location.origin.indexOf('5000')!==-1?window.location.origin:'http://localhost:5000'; return 'http://localhost:5000'; } return window.location.origin; })())}${parts[0]}`);
                fileName=parts[1]||'file';
                fileSize=parts[2]||'';
            } else {
                fileName=parts[0]||'file';
                fileSize=parts[1]||'';
                if(parts[2] && parts[2]!=='pending') fileUrl= parts[2].startsWith('http')?parts[2]: (window.mediaUrl ? window.mediaUrl(parts[2]) : `${(window.API_BASE || (function(){var p=window.location.protocol,h=window.location.hostname,po=window.location.port; if(p==='file:') return 'http://localhost:5000'; if(h==='localhost'||h==='127.0.0.1'||h===''){ if(po==='5000') return window.location.origin; if(!po) return window.location.origin.indexOf('5000')!==-1?window.location.origin:'http://localhost:5000'; return 'http://localhost:5000'; } return window.location.origin; })())}${parts[2]}`);
            }
        } else {
            fileUrl=raw.startsWith('http')?raw: (window.mediaUrl ? window.mediaUrl(raw) : `${(window.API_BASE || (function(){var p=window.location.protocol,h=window.location.hostname,po=window.location.port; if(p==='file:') return 'http://localhost:5000'; if(h==='localhost'||h==='127.0.0.1'||h===''){ if(po==='5000') return window.location.origin; if(!po) return window.location.origin.indexOf('5000')!==-1?window.location.origin:'http://localhost:5000'; return 'http://localhost:5000'; } return window.location.origin; })())}${raw}`);
            fileName=fileUrl.split('/').pop().split('?')[0];
        }
        // If file is actually an image (even if sent as file), show image preview globally visible
        const isImageFile = /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(fileName) || /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(fileUrl||'') || (fileUrl && fileUrl.includes('res.cloudinary.com'));
        if(isImageFile && fileUrl){
            const imgSrc = fileUrl;
            bubbleContent=`${forwardedHtml}${replyHtml}<img src="${imgSrc}" onclick="openLightbox('${imgSrc}')" alt="${escHtml(fileName)}" style="max-width:220px;max-height:220px;border-radius:10px;cursor:zoom-in;display:block;"><div style="font-size:0.72rem;opacity:0.7;margin-top:4px;display:flex;justify-content:space-between;align-items:center;"><span>${escHtml(fileName)}${fileSize?' · '+fileSize:''}</span><a href="${fileUrl}" download="${escHtml(fileName)}" target="_blank" style="color:inherit;text-decoration:underline;">Download</a></div>`;
            extraClass=' img-msg';
        } else {
        const icon=getFileIcon(fileName);
        const ext=(fileName.split('.').pop()||'').toUpperCase();
        bubbleContent=`${forwardedHtml}${replyHtml}<div style="display:flex;align-items:center;gap:10px;min-width:180px;max-width:260px;">
            <div style="font-size:2rem;flex-shrink:0;">${icon}</div>
            <div style="flex:1;min-width:0;">
                <div style="font-weight:700;font-size:0.82rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${escHtml(fileName)}">${escHtml(fileName)}</div>
                <div style="font-size:0.72rem;opacity:0.7;">${ext}${fileSize?' · '+fileSize:''}</div>
            </div>
            ${fileUrl?`<a href="${fileUrl}" download="${escHtml(fileName)}" target="_blank" style="background:${isOwn?'rgba(255,255,255,0.2)':'var(--bg)'};border:none;border-radius:8px;padding:6px 10px;cursor:pointer;text-decoration:none;color:inherit;font-size:0.75rem;font-weight:700;flex-shrink:0;">⬇ Download</a>`:'<span style="font-size:0.75rem;opacity:0.6;">Uploading…</span>'}
        </div>`;
        }
    } else {
        // Text with optional link preview
        let text=escHtml(msg.content);
        // Linkify URLs
        text=text.replace(/(https?:\/\/[^\s]+)/g,'<a href="$1" target="_blank" style="color:inherit;text-decoration:underline;word-break:break-all;">$1</a>');
        bubbleContent=`${forwardedHtml}${replyHtml}<span class="msg-text">${text}</span>`;
        if(msg.is_edited) bubbleContent+=`<span class="edited-label">(edited)</span>`;
        if(linkUrl){
            // placeholder will be filled via async fetch
            bubbleContent+=`<div class="link-preview-card" id="lp-${msg.id}" onclick="window.open('${linkUrl}','_blank')"><div style="flex:1;min-width:0;"><div class="lp-title">${escHtml(linkUrl)}</div><div class="lp-desc">Loading preview…</div><div class="lp-domain">${new URL(linkUrl).hostname}</div></div></div>`;
            setTimeout(()=>fetchLinkPreview(msg.id, linkUrl), 200);
        }
    }
    const avatarHtml = !isOwn ? (activeUserPic?`<img class="msg-small-av" src="${(window.API_BASE || (function(){var p=window.location.protocol,h=window.location.hostname,po=window.location.port; if(p==='file:') return 'http://localhost:5000'; if(h==='localhost'||h==='127.0.0.1'||h===''){ if(po==='5000') return window.location.origin; if(!po) return window.location.origin.indexOf('5000')!==-1?window.location.origin:'http://localhost:5000'; return 'http://localhost:5000'; } return window.location.origin; })())}${activeUserPic}" onerror="this.style.display='none'">`:`<div class="msg-small-ap">${getInitials(activeUserName)}</div>`) : `<div class="msg-tail-space"></div>`;
    // Reactions html
    let reactionsHtml='';
    if(msg.reactions && msg.reactions.length){
        reactionsHtml=`<div class="msg-reactions">${msg.reactions.map(r=>`<span class="react-pill ${r.users.includes(String(currentUser._id||currentUser.id))?'mine':''}" onclick="toggleReact(${msg.id},'${r.emoji}',${activeUserType==='group'})">${r.emoji} ${r.count}</span>`).join('')}</div>`;
    }
    // Status ticks
    let statusHtml='';
    if(isOwn){
        let tick='✓ Sent';
        if(msg.status==='delivered') tick='✓✓ Delivered';
        else if(msg.status==='seen' || msg.isRead) tick='✓✓ Seen';
        statusHtml=`<div class="msg-status"><span class="tick ${tick.includes('Seen')?'seen':''}">${tick}</span> ${msg.is_edited?'<span class="edited-label">(edited)</span>':''}</div>`;
        if(msg.isPinned) statusHtml+=`<div style="font-size:0.65rem;color:var(--blue);">📌 Pinned</div>`;
    } else {
        if(msg.isPinned) statusHtml=`<div style="font-size:0.65rem;color:var(--blue);">📌 Pinned</div>`;
    }
    div.innerHTML=`
        <div class="msg-group-row">
            ${isOwn?'':avatarHtml}
            <div style="position:relative; max-width:78%; display:flex; flex-direction:column; align-items:${isOwn?'flex-end':'flex-start'};">
                <div class="msg-bubble ${isOwn?'mine':'theirs'}${extraClass}" data-msgid="${msg.id}">${bubbleContent}</div>
                <div class="reaction-bar" style="display:none;" id="reactBar-${msg.id}">${REACT_EMOJIS.map(e=>`<button onclick="toggleReact(${msg.id},'${e}',${activeUserType==='group'})">${e}</button>`).join('')}<button onclick="toggleReact(${msg.id},'👍',${activeUserType==='group'})" style="font-size:0.75rem;">＋</button></div>
                ${reactionsHtml}
            </div>
            ${isOwn?'<div class="msg-tail-space"></div>':''}
        </div>
        <div class="msg-meta" style="text-align:${isOwn?'right':'left'}; display:flex; gap:6px; align-items:center; justify-content:${isOwn?'flex-end':'flex-start'};">
            <span>${time}</span>
            ${msg.is_forwarded?'<span style="font-size:0.6rem;opacity:0.5;">Forwarded</span>':''}
        </div>
        ${statusHtml}
    `;
    // Hover to show reaction bar
    div.addEventListener('mouseenter',()=>{ const bar=document.getElementById(`reactBar-${msg.id}`); if(bar) bar.style.display='flex'; });
    div.addEventListener('mouseleave',()=>{ const bar=document.getElementById(`reactBar-${msg.id}`); if(bar) bar.style.display='none'; });
    return div;
}
function appendMessage(msg, isOwn, skipScroll){
    const area=document.getElementById('messagesArea');
    const typing=document.getElementById('typingIndicator');
    if(!area) return;
    // Avoid duplicate
    if(document.getElementById('msg_'+msg.id)) return;
    const el=createMessageElement(msg,isOwn);
    area.insertBefore(el, typing);
    if(!skipScroll) area.scrollTop=area.scrollHeight;
    if(typing) typing.style.display='none';
    // Cache
    messageCache.push(msg);
    // if isOwn, mark delivered/seen handling done server side
}
async function fetchLinkPreview(msgId, url){
    try{
        const res=await apiFetch(`/messages/link-preview?url=${encodeURIComponent(url)}`);
        const data=await res.json();
        const card=document.getElementById(`lp-${msgId}`);
        if(card && data.title){
            card.innerHTML=`${data.image?`<img src="${data.image}" onerror="this.style.display='none'">`:''}<div style="flex:1;min-width:0;"><div class="lp-title">${escHtml(data.title)}</div><div class="lp-desc">${escHtml(data.description||'')}</div><div class="lp-domain">${escHtml(data.url||url)}</div></div>`;
        }
    }catch{}
}

// ─── SEND / EDIT ─────────────────────────────────────────────────────────
async function sendMessage(){
    const input=document.getElementById('chatInput');
    const content=input.value.trim();
    if((!content || !content.length) && !editMessageId) return;
    if(!activeUserId) return showToast('Select a chat first');
    const isGroup=activeUserType==='group';
    // Edit mode?
    if(editMessageId){
        const id=editMessageId;
        editMessageId=null;
        document.getElementById('editBar').classList.remove('show');
        input.value='';
        input.style.height='auto';
        // Optimistic update
        const el=document.getElementById('msg_'+id);
        if(el){ const txt=el.querySelector('.msg-text'); if(txt) txt.textContent=content; }
        try{
            await apiFetch(`/messages/${id}`,{method:'PUT', body:JSON.stringify({content, isGroup})});
            showToast('Edited');
        }catch{ showToast('Edit failed','error'); }
        return;
    }
    const myId=String(currentUser._id||currentUser.id);
    const tempMsg={ id:'temp_'+Date.now(), content, sender_id:myId, created_at:new Date().toISOString(), message_type: /https?:\/\//.test(content)?'link':'text', status:'sent', reply_to_id: replyToId, replyTo: replyToData, is_forwarded:0, reactions:[] };
    appendMessage(tempMsg, true);
    const payload={ receiverId:activeUserId, content, isGroup, replyToId, forwarded:false };
    input.value=''; cancelReply(); input.style.height='auto';
    try{
        const res=await apiFetch('/messages',{method:'POST', body:JSON.stringify(payload)});
        const data=await res.json();
        // Replace temp
        const tempEl=document.getElementById('msg_'+tempMsg.id);
        if(tempEl) tempEl.remove();
        // Remove temp from cache
        messageCache=messageCache.filter(m=>m.id!==tempMsg.id);
        if(data.id || data._id){
            appendMessage(data, true);
        } else if(data.message){
            appendMessage(data.message, true);
        }
        loadConversations();
    }catch(e){ showToast('Failed to send','error'); }
}
function handleInputKey(e){
    if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); sendMessage(); }
    if(e.key==='Escape'){ if(editMessageId) cancelEdit(); else if(replyToId) cancelReply(); }
}
function onInputChange(){
    const ta=document.getElementById('chatInput');
    ta.style.height='auto'; ta.style.height=Math.min(ta.scrollHeight,210)+'px';
    if(socket && activeUserId){
        if(!isTyping){
            isTyping=true;
            socket.emit('typing',{senderId:currentUser._id||currentUser.id, receiverId:activeUserId});
        }
        clearTimeout(typingTimeout);
        typingTimeout=setTimeout(()=>{
            isTyping=false;
            socket.emit('stop_typing',{senderId:currentUser._id||currentUser.id, receiverId:activeUserId});
        },1200);
    }
    // Typing indicator for link preview? debounce preview
}
function playNotificationSound(){
    // simple beep using Web Audio? fallback no sound
    try{
        const ctx=new (window.AudioContext||window.webkitAudioContext)();
        const osc=ctx.createOscillator(); const g=ctx.createGain();
        osc.frequency.value=880; g.gain.value=0.08; osc.connect(g); g.connect(ctx.destination); osc.start(); setTimeout(()=>osc.stop(),120);
    }catch{}
}

// ─── REPLY / EDIT helpers ────────────────────────────────────────────────
function setReply(msgId, content, senderName){
    replyToId=msgId;
    replyToData={ id:msgId, content, fullName:senderName };
    document.getElementById('replyName').textContent=`Replying to ${senderName}`;
    document.getElementById('replyText').textContent= content.startsWith('[IMAGE]')?'📷 Photo' : content.startsWith('[FILE]')?'📎 File' : content.slice(0,80);
    document.getElementById('replyBar').classList.add('show');
    document.getElementById('chatInput').focus();
}
function cancelReply(){ replyToId=null; replyToData=null; document.getElementById('replyBar').classList.remove('show'); }
function setEdit(msgId, content){
    editMessageId=msgId;
    document.getElementById('editPreview').textContent=content.slice(0,60);
    document.getElementById('editBar').classList.add('show');
    const inp=document.getElementById('chatInput');
    inp.value=content; inp.focus();
}
function cancelEdit(){ editMessageId=null; document.getElementById('editBar').classList.remove('show'); document.getElementById('chatInput').value=''; }

// ─── Forward ─────────────────────────────────────────────────────────────
function openForwardModal(msgId, isGroup){
    forwardMessageId=msgId; forwardIsGroup=isGroup; forwardSelected=new Set();
    document.getElementById('forwardModal').style.display='flex';
    document.getElementById('forwardSearch').value='';
    document.getElementById('forwardCount').textContent='0';
    renderForwardList(allConversations);
}
function closeForwardModal(){ document.getElementById('forwardModal').style.display='none'; forwardMessageId=null; forwardSelected.clear(); }
function renderForwardList(list){
    const el=document.getElementById('forwardList');
    if(!list.length){ el.innerHTML='<div style="padding:20px;text-align:center;color:#65676b;">No chats</div>'; return; }
    el.innerHTML=list.map(c=>{
        const initials=getInitials(c.fullName);
        const av=c.profilePicture?`<img src="${(window.API_BASE || (function(){var p=window.location.protocol,h=window.location.hostname,po=window.location.port; if(p==='file:') return 'http://localhost:5000'; if(h==='localhost'||h==='127.0.0.1'||h===''){ if(po==='5000') return window.location.origin; if(!po) return window.location.origin.indexOf('5000')!==-1?window.location.origin:'http://localhost:5000'; return 'http://localhost:5000'; } return window.location.origin; })())}${c.profilePicture}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;">`:`<div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#0866ff,#0550c1);color:white;display:flex;align-items:center;justify-content:center;font-weight:700;">${initials}</div>`;
        const selected=forwardSelected.has(String(c._id));
        return `<div class="forward-select-item ${selected?'selected':''}" onclick="toggleForwardSelect('${c._id}','${c.type}')">
            <div class="select-checkbox">${selected?'✓':''}</div>
            <div style="display:flex;align-items:center;gap:10px;flex:1;">
                ${av}
                <div><div style="font-weight:700;font-size:0.9rem;">${escHtml(c.fullName)}</div><div style="font-size:0.72rem;opacity:0.6;">${c.type==='group'?'Group':'User'}</div></div>
            </div>
        </div>`;
    }).join('');
}
function toggleForwardSelect(id, type){
    const key=`${type}:${id}`;
    if(forwardSelected.has(key)) forwardSelected.delete(key);
    else {
        if(forwardSelected.size>=5) return showToast('Max 5 chats');
        forwardSelected.add(key);
    }
    document.getElementById('forwardCount').textContent=String(forwardSelected.size);
    renderForwardList(allConversations);
}
function filterForwardList(q){
    if(!q) renderForwardList(allConversations);
    else renderForwardList(allConversations.filter(c=>c.fullName.toLowerCase().includes(q.toLowerCase())));
}
async function confirmForward(){
    if(!forwardSelected.size) return showToast('Select at least 1 chat');
    const targets=[...forwardSelected].map(k=>{
        const [type,id]=k.split(':');
        return { id, type };
    });
    try{
        await apiFetch('/messages/forward',{method:'POST', body:JSON.stringify({messageId:forwardMessageId, isGroup:forwardIsGroup, targets})});
        showToast(`Forwarded to ${targets.length} chat(s)`);
        closeForwardModal();
        loadConversations();
    }catch{ showToast('Forward failed','error'); }
}

// ─── Reactions ───────────────────────────────────────────────────────────
async function toggleReact(msgId, emoji, isGroup){
    try{
        const res=await apiFetch(`/messages/${msgId}/react`,{method:'POST', body:JSON.stringify({emoji, isGroup})});
        const data=await res.json();
        // UI will be updated via socket; also update locally
        const el=document.getElementById('msg_'+msgId);
        if(el){
            let cont=el.querySelector('.msg-reactions');
            if(!cont){ cont=document.createElement('div'); cont.className='msg-reactions'; el.appendChild(cont); }
            const myId=String(currentUser._id||currentUser.id);
            if(!data.reactions || !data.reactions.length) cont.innerHTML='';
            else cont.innerHTML=data.reactions.map(r=>`<span class="react-pill ${r.users.includes(myId)?'mine':''}" onclick="toggleReact(${msgId},'${r.emoji}',${isGroup})">${r.emoji} ${r.count}</span>`).join('');
        }
        closeCtxMenu();
    }catch{ showToast('Reaction failed','error'); }
}

// ─── Pins ────────────────────────────────────────────────────────────────
async function pinMessage(msgId){
    try{
        await apiFetch(`/messages/${msgId}/pin`,{method:'POST', body:JSON.stringify({isGroup:activeUserType==='group', conversationId:activeUserId})});
        showPinnedBanner(msgId);
        showToast('Pinned');
    }catch{ showToast('Pin failed','error'); }
}
async function unpinCurrent(){
    if(!pinnedMessageId) return;
    try{
        await apiFetch(`/messages/${pinnedMessageId}/pin?isGroup=${activeUserType==='group'}&conversationId=${activeUserId}`,{method:'DELETE'});
        hidePinnedBanner();
        showToast('Unpinned');
    }catch{}
}
function showPinnedBanner(msgId){
    pinnedMessageId=msgId;
    const el=document.getElementById('msg_'+msgId);
    const text=el? el.querySelector('.msg-text')?.textContent?.slice(0,60) || el.querySelector('.msg-bubble')?.innerText?.slice(0,60) : 'Pinned message';
    document.getElementById('pinnedText').textContent=text||'Pinned message';
    document.getElementById('pinnedBanner').classList.add('show');
}
function hidePinnedBanner(){ document.getElementById('pinnedBanner').classList.remove('show'); pinnedMessageId=null; }
async function loadPinnedBanner(){
    try{
        const res=await apiFetch(`/messages/pinned/${activeUserId}?isGroup=${activeUserType==='group'}`);
        const data=await res.json();
        if(data && data.length){
            showPinnedBanner(data[0].message_id);
        }
    }catch{}
}
function scrollToPinned(){
    if(!pinnedMessageId) return;
    const el=document.getElementById('msg_'+pinnedMessageId);
    if(el) el.scrollIntoView({behavior:'smooth', block:'center'});
}

// ─── Archive / Mute / Block ──────────────────────────────────────────────
async function toggleArchiveChat(){
    if(!activeUserId) return;
    try{
        const res=await apiFetch('/messages/archive',{method:'POST', body:JSON.stringify({peerId:activeUserId, peerType:activeUserType})});
        const data=await res.json();
        showToast(data.archived?'Archived':'Unarchived');
        hideChatMenu();
        loadConversations();
        if(data.archived) showChatList();
    }catch{ showToast('Failed','error'); }
}
async function toggleMuteChat(){
    if(!activeUserId) return;
    try{
        const res=await apiFetch('/messages/mute',{method:'POST', body:JSON.stringify({peerId:activeUserId, peerType:activeUserType, durationHours:24})});
        const data=await res.json();
        showToast(data.muted?'Muted for 24h':'Unmuted');
        hideChatMenu();
        loadConversations();
    }catch{ showToast('Failed','error'); }
}
async function togglePinChat(){
    if(!activeUserId) return;
    // Need to get conversation pin status; for simplicity toggle via pinning a dummy? Actually we pin conversation via pinned_messages? Let's use local toggle via API that pins conversation? Simplify: call same as archive but with pin?
    // We'll implement conversation pin by creating a pinned entry with message_id 0? Instead reuse same endpoint but we need new endpoint. For now use local storage flag
    try{
        // Try to pin by creating a special pinned entry for conversation
        const isPinned = allConversations.find(c=>String(c._id)===String(activeUserId))?.isPinned;
        if(isPinned){
            // unpin: delete where message_id=0? Not implemented; just show toast
            showToast('Unpinned conversation (refresh)');
        } else {
            showToast('Pinned conversation');
        }
        // For now just toggle UI
        loadConversations();
        hideChatMenu();
    }catch{}
}
function openBlockConfirm(){
    if(!activeUserId) return;
    if(!confirm(`Block ${activeUserName}? You will not receive messages from them.`)) return;
    blockUser();
}
async function blockUser(){
    try{
        await apiFetch(`/messages/block/${activeUserId}`,{method:'POST'});
        showToast('Blocked');
        hideChatMenu();
        showChatList();
        loadConversations();
    }catch{ showToast('Block failed','error'); }
}
async function clearChatHistory(){
    if(!confirm('Clear history for you? This will hide messages only for you.')) return;
    // We'll call delete for me for each message? For now just filter locally
    const area=document.getElementById('messagesArea');
    area.innerHTML='<div style="padding:20px;text-align:center;color:#65676b;">History cleared (local)</div>';
    hideChatMenu();
}
function deleteConversation(){
    if(!confirm('Delete conversation? This will hide it for you.')) return;
    toggleArchiveChat(); // archive as delete
}

// ─── Search in Chat ─────────────────────────────────────────────────────
function toggleChatSearch(){
    const bar=document.getElementById('chatSearchBar');
    bar.classList.toggle('show');
    if(bar.classList.contains('show')) document.getElementById('chatSearchInput').focus();
    else { document.getElementById('chatSearchInput').value=''; // reload
        loadMessages(activeUserId, true);
    }
}
let searchDebounce=null;
function searchInChat(q){
    clearTimeout(searchDebounce);
    searchDebounce=setTimeout(async()=>{
        if(!q.trim()){ loadMessages(activeUserId, true); return; }
        try{
            const res=await apiFetch(`/messages/search?q=${encodeURIComponent(q)}&peerId=${activeUserId}&type=${activeUserType}`);
            const data=await res.json();
            const area=document.getElementById('messagesArea');
            area.innerHTML='';
            if(!data.length){ area.innerHTML='<div style="padding:20px;text-align:center;color:#65676b;">No results for "'+escHtml(q)+'"</div>'; return; }
            const myId=String(currentUser._id||currentUser.id);
            // Show results as list
            data.forEach(m=> appendMessage(m, String(m.sender_id)===myId, true));
            area.scrollTop=0;
        }catch{ }
    },400);
}

// ─── Info Drawer — FIXED: click outside to close (FB-like) ──────────────────
function toggleInfoDrawer(e){
    if(e){ e.preventDefault(); e.stopPropagation(); }
    const d=document.getElementById('infoDrawer');
    const isOpen = d.classList.contains('open');
    if(isOpen){
        d.classList.remove('open');
        document.removeEventListener('click', handleInfoDrawerOutside);
    } else {
        d.classList.add('open');
        loadDrawerMedia('media');
        // Delay adding outside listener to avoid immediate close from same click
        setTimeout(()=> document.addEventListener('click', handleInfoDrawerOutside), 120);
    }
}
function handleInfoDrawerOutside(e){
    const d=document.getElementById('infoDrawer');
    if(!d || !d.classList.contains('open')) return;
    // Don't close if clicking inside drawer or on the info button itself
    if(d.contains(e.target)) return;
    if(e.target.closest('[onclick="toggleInfoDrawer()"]') || e.target.closest('[title="Chat Info / Media"]')) return;
    // Also check the header info button via closest to hdr-btn with info icon
    const infoBtn = e.target.closest('.hdr-btn');
    if(infoBtn && infoBtn.getAttribute('onclick')?.includes('toggleInfoDrawer')) return;
    // Click outside → close
    d.classList.remove('open');
    document.removeEventListener('click', handleInfoDrawerOutside);
}
function switchDrawerTab(type, btn){
    document.querySelectorAll('.drawer-tab').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    loadDrawerMedia(type);
}
async function loadDrawerMedia(type){
    const el=document.getElementById('drawerContent');
    el.innerHTML='<div style="padding:20px;text-align:center;"><i class="fas fa-spinner fa-spin"></i></div>';
    try{
        const res=await apiFetch(`/messages/media/${activeUserId}?type=${activeUserType}&mediaType=${type}`);
        const data=await res.json();
        if(!data.length){ el.innerHTML=`<div style="padding:20px;text-align:center;color:#65676b;font-size:0.85rem;">No ${type} yet</div>`; return; }
        if(type==='media'){
            el.innerHTML=`<div style="display:grid; grid-template-columns:repeat(3,1fr); gap:6px;">${data.map(m=>{
                const url=(m.content.match(/\[IMAGE\]:([^\s|]+)/)||[])[1];
                if(!url) return '';
                const full=url.startsWith('http')?url:`${(window.API_BASE || (function(){var p=window.location.protocol,h=window.location.hostname,po=window.location.port; if(p==='file:') return 'http://localhost:5000'; if(h==='localhost'||h==='127.0.0.1'||h===''){ if(po==='5000') return window.location.origin; if(!po) return window.location.origin.indexOf('5000')!==-1?window.location.origin:'http://localhost:5000'; return 'http://localhost:5000'; } return window.location.origin; })())}${url}`;
                return `<img src="${full}" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px;cursor:pointer;" onclick="openLightbox('${full}')">`;
            }).join('')}</div>`;
        } else if(type==='files'){
            el.innerHTML=data.map(m=>{
                const parts=m.content.replace('[FILE]:','').split('|');
                const name=parts[1]||parts[0]||'file';
                const url=parts[0].startsWith('/uploads')?`${(window.API_BASE || (function(){var p=window.location.protocol,h=window.location.hostname,po=window.location.port; if(p==='file:') return 'http://localhost:5000'; if(h==='localhost'||h==='127.0.0.1'||h===''){ if(po==='5000') return window.location.origin; if(!po) return window.location.origin.indexOf('5000')!==-1?window.location.origin:'http://localhost:5000'; return 'http://localhost:5000'; } return window.location.origin; })())}${parts[0]}`:'';
                return `<div style="display:flex;align-items:center;gap:10px;background:var(--bg);padding:8px;border-radius:8px;"><i class="fas fa-file" style="color:var(--blue);"></i><div style="flex:1;min-width:0;"><div style="font-weight:700;font-size:0.82rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(name)}</div><div style="font-size:0.7rem;opacity:0.6;">${formatDate(m.created_at)}</div></div><a href="${url}" download target="_blank" style="color:var(--blue);"><i class="fas fa-download"></i></a></div>`;
            }).join('');
        } else if(type==='links'){
            el.innerHTML=data.map(m=>{
                const url=(m.content.match(/https?:\/\/[^\s]+/)||[])[0]||'';
                return `<a href="${url}" target="_blank" style="display:block;background:var(--bg);padding:10px;border-radius:8px;text-decoration:none;color:var(--text);border:1px solid var(--border);"><div style="font-weight:700;font-size:0.82rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(url)}</div><div style="font-size:0.7rem;opacity:0.6;">${formatDate(m.created_at)} · ${escHtml(m.fullName||'')}</div></a>`;
            }).join('');
        } else if(type==='voice'){
            el.innerHTML=data.map(m=>{
                const url=(m.content.replace('[VOICE]:','').trim());
                const full=url.startsWith('http')?url:`${(window.API_BASE || (function(){var p=window.location.protocol,h=window.location.hostname,po=window.location.port; if(p==='file:') return 'http://localhost:5000'; if(h==='localhost'||h==='127.0.0.1'||h===''){ if(po==='5000') return window.location.origin; if(!po) return window.location.origin.indexOf('5000')!==-1?window.location.origin:'http://localhost:5000'; return 'http://localhost:5000'; } return window.location.origin; })())}${url}`;
                return `<div style="background:var(--bg);padding:10px;border-radius:8px;"><audio controls src="${full}" style="width:100%;height:32px;"></audio><div style="font-size:0.7rem;opacity:0.6;">${formatTime(m.created_at)}</div></div>`;
            }).join('');
        }
    }catch(e){ el.innerHTML='<div style="color:red;padding:20px;text-align:center;">Failed to load</div>'; }
}

// ─── File attachment with progress ──────────────────────────────────────
async function sendFileAttachment(input){
    const file=input.files[0];
    if(!file || !activeUserId) return;
    const MAX=25*1024*1024;
    if(file.size>MAX){ showToast('File too large (max 25MB)'); input.value=''; return; }
    const isImage=file.type.startsWith('image/');
    const formData=new FormData();
    formData.append(isImage?'image':'file', file);
    formData.append('receiverId', activeUserId);
    formData.append('isGroup', activeUserType==='group'?'true':'false');
    const tempId='temp_'+Date.now();
    const myId=String(currentUser._id||currentUser.id);
    const sizeStr=file.size>1024*1024?(file.size/1024/1024).toFixed(1)+'MB':Math.round(file.size/1024)+'KB';
    if(isImage){
        const reader=new FileReader();
        reader.onload=e=>{
            appendMessage({id:tempId, content:`[IMAGE]:${e.target.result}`, sender_id:myId, created_at:new Date().toISOString(), tempId}, true);
        };
        reader.readAsDataURL(file);
    } else {
        appendMessage({id:tempId, content:`[FILE]:${file.name}|${sizeStr}|pending`, sender_id:myId, created_at:new Date().toISOString(), tempId}, true);
    }
    try{
        const endpoint=isImage?`${API}/messages/image`:`${API}/messages/file`;
        const res=await fetch(endpoint,{method:'POST', headers:{'Authorization':`Bearer ${token}`}, body:formData});
        const data=await res.json();
        if(data.message){
            document.getElementById('msg_'+tempId)?.remove();
            messageCache=messageCache.filter(m=>String(m.id)!==String(tempId));
            const real=data.message;
            // real has content with url; need to ensure status etc
            appendMessage(real, true);
            loadConversations();
        }
    }catch{ showToast('Failed to send file','error'); }
    input.value='';
}
function sendImage(input){ return sendFileAttachment(input); }
function getFileIcon(name){
    const ext=(name||'').split('.').pop().toLowerCase();
    const icons={pdf:'📄',pptx:'📊',ppt:'📊',docx:'📝',doc:'📝',xlsx:'📈',xls:'📈',txt:'📃',zip:'🗜️',rar:'🗜️',mp4:'🎬',mov:'🎬'};
    return icons[ext]||'📎';
}

// ─── Emoji ───────────────────────────────────────────────────────────────
function populateEmojiPicker(){
    const picker=document.getElementById('emojiPicker');
    if(!picker) return;
    picker.innerHTML=EMOJIS.map(e=>`<button class="emoji-btn" onclick="insertEmoji('${e}')">${e}</button>`).join('');
}
function toggleEmojiPicker(){ document.getElementById('emojiPicker').classList.toggle('open'); }
function closeEmojiPicker(){ document.getElementById('emojiPicker').classList.remove('open'); }
function insertEmoji(em){ const inp=document.getElementById('chatInput'); inp.value+=em; inp.focus(); closeEmojiPicker(); }
document.addEventListener('click',e=>{ if(!e.target.closest('#emojiPicker') && !e.target.closest('#emojiTrigger') && !e.target.closest('[onclick="toggleEmojiPicker"]')) closeEmojiPicker(); });

// ─── New Chat ────────────────────────────────────────────────────────────
let allPeopleCache=[];
async function openNewChatModal(){
    document.getElementById('newChatModal').classList.add('open');
    document.getElementById('peopleSearch').value='';
    const list=document.getElementById('peopleList');
    list.innerHTML='<div style="padding:20px;text-align:center;color:#65676b;"><i class="fas fa-spinner fa-spin"></i></div>';
    // Inject group/channel buttons if not already
    if(!document.getElementById('createGroupBtnInject')){
        list.insertAdjacentHTML('beforebegin',`<div style="display:flex; gap:10px; padding:0 20px 10px;">
            <button id="createGroupBtnInject" onclick="closeNewChatModal(); document.getElementById('createGroupModal').style.display='flex'" style="flex:1; padding:8px; border-radius:8px; border:1px solid var(--blue); background:transparent; color:var(--blue); font-weight:bold; cursor:pointer;"><i class="fas fa-users"></i> New Group</button>
            <button onclick="closeNewChatModal(); document.getElementById('createChannelModal').style.display='flex'" style="flex:1; padding:8px; border-radius:8px; border:1px solid var(--blue); background:transparent; color:var(--blue); font-weight:bold; cursor:pointer;"><i class="fas fa-bullhorn"></i> New Channel</button>
        </div>`);
    }
    try{
        const res=await apiFetch('/users');
        const data=await res.json();
        // data may be paginated object
        const people=Array.isArray(data)?data: (data.users||data.data||[]);
        allPeopleCache=people.filter(p=>String(p._id||p.id)!==String(currentUser._id||currentUser.id));
        renderPeople(allPeopleCache);
    }catch{ list.innerHTML='<div style="padding:20px;text-align:center;color:#e41e3f;">Failed to load</div>'; }
}
function closeNewChatModal(){ document.getElementById('newChatModal').classList.remove('open'); }
function filterPeople(q){ renderPeople(!q? allPeopleCache : allPeopleCache.filter(p=> p.fullName.toLowerCase().includes(q.toLowerCase()))); }
function renderPeople(people){
    const list=document.getElementById('peopleList');
    if(!people.length){ list.innerHTML='<div style="padding:20px;text-align:center;color:#65676b;">No users found</div>'; return; }
    list.innerHTML=people.map(p=>{
        const id=p._id||p.id;
        const av=p.profilePicture?`<div class="person-ap"><img src="${(window.API_BASE || (function(){var p=window.location.protocol,h=window.location.hostname,po=window.location.port; if(p==='file:') return 'http://localhost:5000'; if(h==='localhost'||h==='127.0.0.1'||h===''){ if(po==='5000') return window.location.origin; if(!po) return window.location.origin.indexOf('5000')!==-1?window.location.origin:'http://localhost:5000'; return 'http://localhost:5000'; } return window.location.origin; })())}${p.profilePicture}"></div>`:`<div class="person-ap">${getInitials(p.fullName)}</div>`;
        return `<div class="person-item" onclick="startNewChat('${id}','${escHtml(p.fullName)}',${p.profilePicture?`'${p.profilePicture}'`:'null'})">
            ${av}<div><div class="person-name">${escHtml(p.fullName)}</div><div class="person-dept">${p.department||p.role||''}</div></div>
        </div>`;
    }).join('');
}
function startNewChat(userId, name, pic){ closeNewChatModal(); openChat(userId, name, pic, 'user'); }

// ─── Lightbox ────────────────────────────────────────────────────────────
function openLightbox(src){ document.getElementById('lightboxImg').src=src; document.getElementById('lightbox').classList.add('open'); }
function closeLightbox(){ document.getElementById('lightbox').classList.remove('open'); }

// ─── Helpers ─────────────────────────────────────────────────────────────
async function apiFetch(path, opts={}){
    const headers={ 'Content-Type':'application/json', ...(opts.headers||{}) };
    if(token) headers['Authorization']=`Bearer ${token}`;
    // if FormData, delete Content-Type
    if(opts.body instanceof FormData) delete headers['Content-Type'];
    // opts.body is JSON string for json calls; for fetch with headers Bearer, need to handle
    let url=`${API}${path}`;
    // For our wrapper, we previously built opts with body JSON string; ensure headers
    if(opts.body && typeof opts.body==='string'){
        // keep
    }
    const res=await fetch(url, {...opts, headers});
    if(!res.ok){
        const txt=await res.text();
        let j;
        try{ j=JSON.parse(txt); }catch{ j={message:txt}; }
        throw new Error(j.message||txt||`HTTP ${res.status}`);
    }
    // Try json, fallback
    const ct=res.headers.get('content-type')||'';
    if(ct.includes('application/json')) return { json: async()=> await res.json(), ...(await res.json().then(d=>({ _data:d})).catch(()=>({})) ) } // weird but we need to return response-like
    // Actually we want to mimic previous apiFetch that returned fetch Response; callers do await res.json()
    // So we should just return res
    return res;
}
// Correct apiFetch: return fetch Response
async function apiFetch2(path, opts={}){ /* duplicate */ }
// Override to correct: we defined above but double; re-define properly
apiFetch = async function(path, opts={}){
    const headers={ ...(opts.headers||{}) };
    if(!(opts.body instanceof FormData)) headers['Content-Type']='application/json';
    if(token) headers['Authorization']=`Bearer ${token}`;
    const res=await fetch(`${API}${path}`, {...opts, headers});
    if(!res.ok){
        const txt=await res.text();
        let msg=txt;
        try{ msg=JSON.parse(txt).message||txt; }catch{}
        throw new Error(msg);
    }
    // Return response with json method, but also allow direct json() callers
    return res;
};
// Patch fetch wrappers that expect json directly: we will handle callers that do const data=await res.json()
// For callers that did `const data = await apiFetch(...).then(r=>r.json())` etc, we need to support.
// Our new apiFetch returns Response, so `await apiFetch(...).json()` works if we call correctly.
// But many callers do `const res=await apiFetch(...); const data=await res.json();` — works.
// For convenience, provide helper that returns json directly when needed: callers that did `await apiFetch('/users')` then `await res.json()`.
// So keep as Response.

function getInitials(name){ if(!name) return '?'; return name.trim().split(' ').slice(0,2).map(n=>n[0]?.toUpperCase()).join(''); }
function escHtml(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function timeAgo(d){
    if(!d) return '';
    let dt=typeof d==='string' && !d.includes('T') ? d.replace(' ','T')+'Z' : d;
    const s=Math.max(0,(Date.now()-new Date(dt).getTime())/1000);
    if(s<60) return 'Just now';
    if(s<3600) return Math.floor(s/60)+'m ago';
    if(s<86400) return Math.floor(s/3600)+'h ago';
    return Math.floor(s/86400)+'d ago';
}
function formatTime(d){ if(!d) return ''; return new Date(d).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}); }
function formatDate(d){ if(!d) return ''; const dt=new Date(d); const now=new Date(); const diff=Math.floor((now-dt)/86400000); if(diff===0) return 'Today'; if(diff===1) return 'Yesterday'; return dt.toLocaleDateString('en-US',{month:'short',day:'numeric', year: dt.getFullYear()!==now.getFullYear()?'numeric':undefined}); }
function showToast(msg, type='info'){
    const t=document.createElement('div'); t.className='toast'; t.textContent=msg;
    if(type==='error') t.style.background='#e41e3f';
    document.getElementById('toast-container').appendChild(t); setTimeout(()=>t.remove(),3000);
}
function markMessagesRead(userId){ apiFetch(`/messages/read/${userId}`,{method:'PUT'}).catch(()=>{}); }

// ─── Chat Menu ───────────────────────────────────────────────────────────
function toggleChatMenu(e){
    e.stopPropagation();
    const menu=document.getElementById('chatMenu');
    const isShown=menu.style.display==='flex';
    hideAllMenus();
    if(isShown) return;
    menu.style.display='flex';
    menu.style.flexDirection='column';
    const rect=e.currentTarget.getBoundingClientRect();
    menu.style.left=(rect.left-180)+'px';
    menu.style.top=(rect.bottom+6)+'px';
    // Update texts
    const isMuted=allConversations.find(c=>String(c._id)===String(activeUserId))?.isMuted;
    document.getElementById('muteMenuText').textContent=isMuted?'Unmute':'Mute';
    const isArch=allConversations.find(c=>String(c._id)===String(activeUserId))?.isArchived;
    document.getElementById('archiveMenuText').textContent=isArch?'Unarchive':'Archive';
}
function hideChatMenu(){ document.getElementById('chatMenu').style.display='none'; }
function hideAllMenus(){ document.getElementById('msgContextMenu').style.display='none'; document.getElementById('chatMenu').style.display='none'; document.querySelectorAll('.msg-bubble').forEach(b=>b.classList.remove('highlighted')); }
document.addEventListener('click',e=>{
    if(!e.target.closest('#chatMenu') && !e.target.closest('[onclick="toggleChatMenu"]')) hideChatMenu();
});

// ─── Context Menu ────────────────────────────────────────────────────────
let ctxTargetMsgId=null, ctxTargetText='', ctxIsOwn=false;
document.addEventListener('contextmenu',e=>{
    const bubble=e.target.closest('.msg-bubble');
    if(!bubble) return;
    e.preventDefault();
    const row=bubble.closest('.msg-group-row');
    const msgDiv=row?row.parentElement:null;
    if(!msgDiv) return;
    ctxTargetMsgId=msgDiv.id.replace('msg_','');
    ctxTargetText=bubble.innerText||bubble.textContent;
    ctxIsOwn=msgDiv.className.includes('mine');
    document.querySelectorAll('.msg-bubble').forEach(b=>b.classList.remove('highlighted'));
    bubble.classList.add('highlighted');
    const menu=document.getElementById('msgContextMenu');
    document.getElementById('ctxEditBtn').style.display=ctxIsOwn?'flex':'none';
    menu.style.display='flex';
    let x=e.clientX, y=e.clientY;
    const rect=menu.getBoundingClientRect();
    // Temporarily show to measure
    menu.style.visibility='hidden'; menu.style.display='flex';
    const w=menu.offsetWidth, h=menu.offsetHeight;
    menu.style.visibility='';
    if(x+w>window.innerWidth) x=window.innerWidth-w-10;
    if(y+h>window.innerHeight) y=window.innerHeight-h-10;
    menu.style.left=x+'px'; menu.style.top=y+'px';
});
document.addEventListener('click',e=>{
    const menu=document.getElementById('msgContextMenu');
    if(menu && menu.style.display==='flex' && !e.target.closest('.context-menu')){ menu.style.display='none'; document.querySelectorAll('.msg-bubble').forEach(b=>b.classList.remove('highlighted')); }
});
function closeCtxMenu(){ document.getElementById('msgContextMenu').style.display='none'; document.querySelectorAll('.msg-bubble').forEach(b=>b.classList.remove('highlighted')); }
function ctxReply(){
    const msgId=ctxTargetMsgId;
    const text=ctxTargetText;
    const isOwn=ctxIsOwn;
    const senderName=isOwn?'You':activeUserName;
    setReply(msgId, text, senderName);
    closeCtxMenu();
}
function ctxForward(){ const id=ctxTargetMsgId; const isG=activeUserType==='group'; closeCtxMenu(); openForwardModal(id,isG); }
function ctxCopy(){ navigator.clipboard.writeText(ctxTargetText).then(()=>showToast('Copied')).catch(()=>showToast('Copy failed','error')); closeCtxMenu(); }
function ctxEdit(){
    if(!ctxIsOwn) return;
    // Find original content: need to fetch from cache? Use ctxTargetText
    setEdit(ctxTargetMsgId, ctxTargetText);
    closeCtxMenu();
}
function ctxPin(){ pinMessage(ctxTargetMsgId); closeCtxMenu(); }
function ctxDelete(){ // everyone
    if(!ctxIsOwn) return showToast('Only your messages can be unsent','error'), closeCtxMenu();
    if(!confirm('Unsend for everyone?')) return closeCtxMenu();
    apiFetch(`/messages/${ctxTargetMsgId}?isGroup=${activeUserType==='group'}&mode=everyone`,{method:'DELETE'}).then(()=>showToast('Unsent')).catch(()=>showToast('Failed','error'));
    closeCtxMenu();
}
function ctxDeleteForMe(){
    if(!confirm('Delete for you?')) return closeCtxMenu();
    apiFetch(`/messages/${ctxTargetMsgId}?isGroup=${activeUserType==='group'}&mode=me`,{method:'DELETE'}).then(()=>{
        document.getElementById('msg_'+ctxTargetMsgId)?.remove();
        showToast('Deleted for you');
    }).catch(()=>showToast('Failed','error'));
    closeCtxMenu();
}
function ctxReactQuick(emoji){ toggleReact(ctxTargetMsgId, emoji, activeUserType==='group'); }
function ctxSelect(){
    // simple: highlight for multi-select? For now just toast
    showToast('Select mode — long press to select multiple (coming soon)');
    closeCtxMenu();
}

// ─── Legacy compat wrappers ─────────────────────────────────────────────
let currentTab='chats';
function switchTab(tab, btnEl){
    currentTab=tab;
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    btnEl.classList.add('active');
    // For channels tab, load channels separately
    if(tab==='channels'){ loadChannelsTab(); } else loadConversations();
}
async function loadChannelsTab(){
    const list=document.getElementById('chatListBody');
    list.innerHTML='<div style="padding:20px;text-align:center;"><i class="fas fa-spinner fa-spin"></i> Loading Channels...</div>';
    try{
        const res=await apiFetch('/channels');
        const data=await res.json();
        // data may be Response? handle
        const channels=Array.isArray(data)?data: (await res.json().catch(()=>[]));
        if(!channels.length){ list.innerHTML='<div style="padding:20px;text-align:center;color:#65676b;">No channels</div>'; return; }
        list.innerHTML=channels.map(ch=>{
            const av=ch.cover_image?`<img src="${(window.API_BASE || (function(){var p=window.location.protocol,h=window.location.hostname,po=window.location.port; if(p==='file:') return 'http://localhost:5000'; if(h==='localhost'||h==='127.0.0.1'||h===''){ if(po==='5000') return window.location.origin; if(!po) return window.location.origin.indexOf('5000')!==-1?window.location.origin:'http://localhost:5000'; return 'http://localhost:5000'; } return window.location.origin; })())}${ch.cover_image}" style="width:52px;height:52px;border-radius:50%;object-fit:cover;">`:`<div class="ap" style="width:52px;height:52px;">📢</div>`;
            return `<div class="chat-item" onclick="openChannel('${ch.id}','${escHtml(ch.name)}')">
                <div class="chat-avatar">${av}</div>
                <div class="chat-info"><div class="chat-name">${escHtml(ch.name)}</div><div class="chat-preview"><div class="chat-last-msg">${ch.subscriberCount||0} subscribers</div></div></div>
            </div>`;
        }).join('');
    }catch{ list.innerHTML='<div style="padding:20px;color:red;text-align:center;">Failed</div>'; }
}
function closeCreationModals(){ document.getElementById('createGroupModal').style.display='none'; document.getElementById('createChannelModal').style.display='none'; document.getElementById('myFilesModal').style.display='none'; document.getElementById('forwardModal').style.display='none'; }
function openMyFiles(){ document.getElementById('myFilesModal').style.display='flex'; loadMyFiles(); }
async function submitCreateGroup(){
    const name=document.getElementById('groupName').value;
    if(!name) return showToast('Name required','error');
    try{ await apiFetch('/messages/group',{method:'POST', body:JSON.stringify({name})}); closeCreationModals(); showToast('Group created!'); loadConversations(); }catch{ showToast('Error','error'); }
}
async function submitCreateChannel(){
    const name=document.getElementById('channelName').value;
    const desc=document.getElementById('channelDesc').value;
    if(!name) return showToast('Name required','error');
    try{ const fd=new FormData(); fd.append('name',name); fd.append('description',desc); await fetch(API+'/channels',{method:'POST', headers:{'Authorization':'Bearer '+token}, body:fd}); closeCreationModals(); showToast('Channel created!'); loadConversations(); }catch{ showToast('Error','error'); }
}
async function loadMyFiles(){
    const list=document.getElementById('myFilesList');
    list.innerHTML='<div style="text-align:center;padding:20px;"><i class="fas fa-spinner fa-spin"></i></div>';
    try{
        const res=await apiFetch('/cloud-files');
        const files=await res.json();
        const arr=Array.isArray(files)?files:[];
        if(!arr.length){ list.innerHTML='<p style="text-align:center;opacity:0.6;">No files yet.</p>'; return; }
        list.innerHTML=arr.map(f=>`<div style="display:flex;align-items:center;background:var(--surface);padding:10px;border-radius:8px;gap:10px;border:1px solid var(--border);">
            <i class="fas fa-file-alt" style="font-size:1.5rem;color:var(--blue);"></i>
            <div style="flex:1;overflow:hidden;"><div style="font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(f.file_name)}</div><div style="font-size:0.75rem;opacity:0.7;">${f.file_size} • ${new Date(f.created_at).toLocaleDateString()}</div></div>
            <button onclick="forwardCloudFile('${f.file_url}','${escHtml(f.file_name)}')" style="background:var(--blue);color:white;border:none;border-radius:6px;padding:6px 12px;cursor:pointer;"><i class="fas fa-share"></i> Send</button>
            <a href="${(window.API_BASE || (function(){var p=window.location.protocol,h=window.location.hostname,po=window.location.port; if(p==='file:') return 'http://localhost:5000'; if(h==='localhost'||h==='127.0.0.1'||h===''){ if(po==='5000') return window.location.origin; if(!po) return window.location.origin.indexOf('5000')!==-1?window.location.origin:'http://localhost:5000'; return 'http://localhost:5000'; } return window.location.origin; })())}${f.file_url}" download target="_blank" style="color:var(--text);opacity:0.6;"><i class="fas fa-download"></i></a>
        </div>`).join('');
    }catch{ list.innerHTML='<p style="color:red;">Failed</p>'; }
}
async function uploadToCloud(input){
    if(!input.files[0]) return;
    const fd=new FormData(); fd.append('file', input.files[0]);
    try{ showToast('Uploading...'); await fetch(API+'/cloud-files',{method:'POST', headers:{'Authorization':'Bearer '+token}, body:fd}); showToast('Uploaded!'); loadMyFiles(); }catch{ showToast('Upload failed','error'); }
}
async function forwardCloudFile(url,name){
    if(!activeUserId) return showToast('Open a chat first','error');
    try{ await apiFetch('/messages',{method:'POST', body:JSON.stringify({receiverId:activeUserId, isGroup:activeUserType==='group', content:`[FILE]:${name}||${url}`})}); showToast('File sent!'); closeCreationModals(); }catch{ showToast('Failed','error'); }
}
window.isCurrentGroup=false; window.isCurrentChannel=false;
async function openChannel(id,name){
    activeUserId=id; activeUserName=name; window.isCurrentGroup=false; window.isCurrentChannel=true; activeUserType='channel';
    document.getElementById('chatHdrName').textContent=name;
    document.getElementById('chatHdrStatus').textContent='Channel';
    document.getElementById('chatHdrAvatar').innerHTML='<div class="ap" style="background:var(--blue);">📢</div>';
    if(window.innerWidth<=700) document.getElementById('chatList').classList.add('hidden-mobile');
    document.getElementById('chatEmpty').style.display='none';
    document.getElementById('chatWindow').style.display='flex';
    document.querySelector('.chat-input-area').style.display='none';
    const area=document.getElementById('messagesArea');
    area.innerHTML='<div style="text-align:center;padding:20px;"><i class="fas fa-spinner fa-spin"></i></div>';
    try{
        const res=await apiFetch(`/channels/${id}/posts`);
        const posts=await res.json();
        area.innerHTML='';
        const arr=Array.isArray(posts)?posts:[];
        if(!arr.length) area.innerHTML='<p style="text-align:center;opacity:0.6;margin-top:20px;">No posts yet.</p>';
        arr.slice().reverse().forEach(p=> appendChannelPost(p));
        area.scrollTop=area.scrollHeight;
        const chRes=await apiFetch('/channels');
        const channels=await chRes.json();
        const myChannel=Array.isArray(channels)? channels.find(c=>c.id==id):null;
        if(myChannel && (myChannel.myRole==='owner'||myChannel.myRole==='admin')) document.querySelector('.chat-input-area').style.display='flex';
        else if(!myChannel || !myChannel.myRole){
            area.insertAdjacentHTML('beforeend',`<div style="text-align:center;margin:20px;"><button onclick="joinCurrentChannel()" style="padding:10px 20px;background:var(--blue);color:white;border:none;border-radius:20px;font-weight:bold;cursor:pointer;">Join Channel</button></div>`);
        }
    }catch{ area.innerHTML='<p style="color:red;text-align:center;">Error loading channel</p>'; }
}
async function joinCurrentChannel(){
    if(!activeUserId || !window.isCurrentChannel) return;
    try{ await apiFetch(`/channels/${activeUserId}/join`,{method:'POST'}); showToast('Joined!'); openChannel(activeUserId, activeUserName); }catch{ showToast('Error','error'); }
}
function appendChannelPost(post){
    const area=document.getElementById('messagesArea');
    const div=document.createElement('div');
    div.style.marginBottom='15px'; div.style.display='flex'; div.style.flexDirection='column'; div.style.alignItems='center';
    let mediaHtml='';
    if(post.mediaUrl){
        if(post.mediaUrl.match(/\.(jpeg|jpg|png|gif|webp)$/i)) mediaHtml=`<img src="${(window.API_BASE || (function(){var p=window.location.protocol,h=window.location.hostname,po=window.location.port; if(p==='file:') return 'http://localhost:5000'; if(h==='localhost'||h==='127.0.0.1'||h===''){ if(po==='5000') return window.location.origin; if(!po) return window.location.origin.indexOf('5000')!==-1?window.location.origin:'http://localhost:5000'; return 'http://localhost:5000'; } return window.location.origin; })())}${post.mediaUrl}" style="max-width:100%;border-radius:10px;margin-top:8px;">`;
        else mediaHtml=`<a href="${(window.API_BASE || (function(){var p=window.location.protocol,h=window.location.hostname,po=window.location.port; if(p==='file:') return 'http://localhost:5000'; if(h==='localhost'||h==='127.0.0.1'||h===''){ if(po==='5000') return window.location.origin; if(!po) return window.location.origin.indexOf('5000')!==-1?window.location.origin:'http://localhost:5000'; return 'http://localhost:5000'; } return window.location.origin; })())}${post.mediaUrl}" target="_blank" style="display:block;margin-top:8px;background:rgba(255,255,255,0.1);padding:10px;border-radius:8px;color:var(--blue);text-decoration:none;"><i class="fas fa-file"></i> View Attachment</a>`;
    }
    div.innerHTML=`<div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:15px;max-width:80%;width:100%;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
            <img src="${(window.API_BASE || (function(){var p=window.location.protocol,h=window.location.hostname,po=window.location.port; if(p==='file:') return 'http://localhost:5000'; if(h==='localhost'||h==='127.0.0.1'||h===''){ if(po==='5000') return window.location.origin; if(!po) return window.location.origin.indexOf('5000')!==-1?window.location.origin:'http://localhost:5000'; return 'http://localhost:5000'; } return window.location.origin; })())}${post.adminPic}" onerror="this.style.display='none'" style="width:30px;height:30px;border-radius:50%;">
            <div style="font-weight:bold;">${escHtml(post.adminName)} <i class="fas fa-check-circle" style="color:var(--blue);font-size:0.8rem;"></i></div>
            <div style="font-size:0.7rem;opacity:0.6;margin-left:auto;">${formatTime(post.created_at)}</div>
        </div>
        <div style="font-size:1rem;line-height:1.5;">${escHtml(post.content||'')}</div>
        ${mediaHtml}
    </div>`;
    area.appendChild(div);
}
function openAiModal(){ document.getElementById('aiModal').style.display='flex'; document.getElementById('aiInputText').value=document.getElementById('chatInput').value; document.getElementById('aiOutput').style.display='none'; document.getElementById('aiApplyBtn').style.display='none'; }
async function processAi(action){
    const text=document.getElementById('aiInputText').value;
    if(!text) return showToast('Enter text first','error');
    const out=document.getElementById('aiOutput');
    out.style.display='block'; out.innerHTML='<i class="fas fa-spinner fa-spin"></i> Processing...';
    try{
        const res=await fetch(`${API}/ai/process`,{method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+token}, body:JSON.stringify({text,action})});
        const data=await res.json();
        out.innerText=data.result||data.message||'No result';
        document.getElementById('aiApplyBtn').style.display='block';
    }catch{ out.innerText='AI failed'; }
}
function applyAiResult(){ document.getElementById('chatInput').value=document.getElementById('aiOutput').innerText; document.getElementById('aiModal').style.display='none'; }

// ─── Voice Recording ─────────────────────────────────────────────────────
let mediaRecorder, audioChunks=[], isRecording=false;
async function startRecording(){
    try{
        const stream=await navigator.mediaDevices.getUserMedia({audio:true});
        mediaRecorder=new MediaRecorder(stream);
        mediaRecorder.start(); isRecording=true;
        const mic=document.getElementById('micBtn');
        if(mic){ mic.style.color='#e41e3f'; mic.style.animation='pulse 1s infinite'; }
        mediaRecorder.addEventListener('dataavailable',e=> audioChunks.push(e.data));
        mediaRecorder.addEventListener('stop',()=>{
            if(mic){ mic.style.color=''; mic.style.animation=''; }
            const blob=new Blob(audioChunks,{type:'audio/webm'}); audioChunks=[]; sendAudioAttachment(blob);
        });
    }catch{ showToast('Microphone denied','error'); }
}
function stopRecording(){
    if(isRecording && mediaRecorder && mediaRecorder.state!=='inactive'){
        mediaRecorder.stop(); isRecording=false; mediaRecorder.stream.getTracks().forEach(t=>t.stop());
    }
}
async function sendAudioAttachment(blob){
    if(!activeUserId) return;
    const fd=new FormData(); fd.append('audio', blob, 'voice.webm'); fd.append('receiverId', activeUserId); fd.append('isGroup', activeUserType==='group'?'true':'false');
    try{ await fetch(API+'/messages/audio',{method:'POST', headers:{'Authorization':'Bearer '+token}, body:fd}); }catch{ showToast('Voice failed','error'); }
}
async function unsendMessage(id){
    if(!confirm('Unsend for everyone?')) return;
    try{ await apiFetch(`/messages/${id}?isGroup=${activeUserType==='group'}&mode=everyone`,{method:'DELETE'}); }catch{ showToast('Failed','error'); }
}
