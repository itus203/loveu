
const API = 'http://localhost:5000/api';
const token = localStorage.getItem('token');
const currentUser = JSON.parse(localStorage.getItem('user') || 'null');
if (!token || !currentUser) window.location.href = '../index.html';
if (localStorage.getItem('darkMode') === '1') document.body.setAttribute('data-theme', 'dark');

let activeUserId = null;
let activeUserName = null;
let activeUserPic = null;
let socket = null;
let allConversations = [];
let allPeople = [];
let onlineUsers = new Set();

const EMOJIS = ['😀','😂','😍','🥰','😎','😭','😅','🤣','😊','🥺','😢','😤','😡','🤔','😴','🤗','😏','😬','🙄','😱','🤩','🥳','😇','🫡','👍','👎','❤️','🔥','💯','✅','🙏','👏','💪','🎉','🎊','💀','👻','🤦','🤷','💬','📱','💻','🎮','⚽','🏀','🍕','☕','🌹','🌈'];

// === INIT ===
document.addEventListener('DOMContentLoaded', () => {
    initSocket();
    loadConversations();
    populateEmojiPicker();
    const params = new URLSearchParams(window.location.search);
    const uid = params.get('userId');
    if (uid) { setTimeout(() => openChat(uid, params.get('name') || 'User', null), 800); }
});

// === SOCKET ===
function initSocket() {
    socket = io('http://localhost:5000');
    const myId = String(currentUser._id || currentUser.id);
    socket.on('connect', () => socket.emit('user_online', myId));
    socket.on('online_users', (ids) => { onlineUsers = new Set(ids.map(String)); updateOnlineStatus(); });
    socket.on('user_came_online', (id) => { onlineUsers.add(String(id)); updateOnlineStatus(); });
    socket.on('user_went_offline', (id) => { onlineUsers.delete(String(id)); updateOnlineStatus(); });
    socket.on('receive_message', (msg) => {
        if (String(msg.sender_id) === String(activeUserId)) {
            appendMessage(msg, false);
            markMessagesRead(activeUserId);
        } else {
            // Show unread badge
            const item = document.getElementById(`conv-${msg.sender_id}`);
            if (item) {
                let badge = item.querySelector('.unread-badge');
                if (!badge) { badge = document.createElement('span'); badge.className = 'unread-badge'; item.querySelector('.chat-meta').prepend(badge); }
                badge.textContent = parseInt(badge.textContent || 0) + 1;
            }
            loadConversations();
        }
    });
    socket.on('user_typing', ({ senderId }) => {
        if (String(senderId) === String(activeUserId)) {
            const ti = document.getElementById('typingIndicator');
            if (ti) ti.style.display = 'flex';
            clearTimeout(window._typingTimer);
            window._typingTimer = setTimeout(() => { if(ti) ti.style.display = 'none'; }, 2500);
        }
    });
    socket.on('messages_read', ({ readerId }) => {
        if (String(readerId) === String(activeUserId)) {
            document.querySelectorAll('.seen-tick').forEach(el => el.textContent = '✓✓ Seen');
        }
    });

    // === WebRTC Calling Socket Listeners ===
    socket.on('call:incoming', (data) => {
        handleIncomingCall(data);
    });

    socket.on('call:accepted', (data) => {
        handleCallAccepted(data);
    });

    socket.on('call:rejected', (data) => {
        stopRingtone();
        showToast(`Call declined: ${data.reason || 'User busy'}`);
        closeCallModal();
    });

    socket.on('call:ended', () => {
        stopRingtone();
        showToast('Call ended');
        closeCallModal();
    });

    socket.on('call:user_offline', () => {
        stopRingtone();
        showToast('User is currently offline');
        closeCallModal();
    });

    socket.on('call:signal', async ({ signal }) => {
        if (peerConnection && signal) {
            try {
                if (signal.sdp) {
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
                    if (signal.sdp.type === 'offer') {
                        const answer = await peerConnection.createAnswer();
                        await peerConnection.setLocalDescription(answer);
                        socket.emit('call:signal', { toUserId: activeCallTargetId, signal: { sdp: peerConnection.localDescription } });
                    }
                } else if (signal.candidate) {
                    await peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
                }
            } catch (e) { console.error('Signal error:', e); }
        }
    });
}

// ==========================================
// 📞 WebRTC CALLING ENGINE
// ==========================================
let peerConnection = null;
let localStream = null;
let remoteStream = null;
let activeCallTargetId = null;
let activeCallIsVideo = false;
let incomingCallData = null;
let callTimerInterval = null;
let callDurationSeconds = 0;
let audioRingContext = null;
let ringToneNode = null;

const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

function playRingtone() {
    try {
        if (!audioRingContext) {
            audioRingContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioRingContext.state === 'suspended') audioRingContext.resume();
        const osc = audioRingContext.createOscillator();
        const gain = audioRingContext.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, audioRingContext.currentTime);
        gain.gain.setValueAtTime(0.12, audioRingContext.currentTime);
        osc.connect(gain);
        gain.connect(audioRingContext.destination);
        osc.start();
        ringToneNode = osc;
    } catch (e) {}
}

function stopRingtone() {
    try {
        if (ringToneNode) {
            ringToneNode.stop();
            ringToneNode = null;
        }
    } catch (e) {}
}

async function startCall(isVideo) {
    if (!activeUserId) {
        showToast('Please select a conversation first');
        return;
    }

    activeCallTargetId = activeUserId;
    activeCallIsVideo = isVideo;

    document.getElementById('activeCallName').textContent = activeUserName || 'User';
    document.getElementById('activeCallAvatar').textContent = getInitials(activeUserName);
    document.getElementById('callStatusText').innerHTML = '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#f59e0b;"></span> Calling...';
    document.getElementById('activeCallModal').style.display = 'flex';
    document.getElementById('audioCallDisplay').style.display = isVideo ? 'none' : 'flex';
    document.getElementById('localVideoWrap').style.display = isVideo ? 'block' : 'none';

    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: isVideo ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false
        });

        const localVidEl = document.getElementById('localVideo');
        if (localVidEl) localVidEl.srcObject = localStream;
    } catch (err) {
        console.warn('Camera/Mic access warning:', err.message);
        showToast('Running call with audio/virtual media', 'info');
    }

    playRingtone();

    socket.emit('call:start', {
        toUserId: activeCallTargetId,
        fromUser: {
            id: currentUser._id || currentUser.id,
            fullName: currentUser.fullName,
            profilePicture: currentUser.profilePicture
        },
        isVideo,
        callId: 'call_' + Date.now()
    });
}

function handleIncomingCall(data) {
    incomingCallData = data;
    activeCallTargetId = data.fromUser.id;
    activeCallIsVideo = data.isVideo;

    document.getElementById('incCallerName').textContent = data.fromUser.fullName || 'DIU Member';
    document.getElementById('incCallType').textContent = data.isVideo ? '📹 Incoming Video Call...' : '📞 Incoming Audio Call...';
    
    const avEl = document.getElementById('incAvatar');
    if (data.fromUser.profilePicture) {
        avEl.innerHTML = `<img src="http://localhost:5000${data.fromUser.profilePicture}" style="width:100%;height:100%;object-fit:cover;">`;
    } else {
        avEl.textContent = getInitials(data.fromUser.fullName);
    }

    document.getElementById('incomingCallModal').style.display = 'flex';
    playRingtone();
}

async function acceptIncomingCall() {
    stopRingtone();
    document.getElementById('incomingCallModal').style.display = 'none';

    document.getElementById('activeCallName').textContent = incomingCallData?.fromUser?.fullName || 'User';
    document.getElementById('activeCallAvatar').textContent = getInitials(incomingCallData?.fromUser?.fullName);
    document.getElementById('callStatusText').innerHTML = '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#31a24c;"></span> Connected';
    document.getElementById('activeCallModal').style.display = 'flex';
    document.getElementById('audioCallDisplay').style.display = activeCallIsVideo ? 'none' : 'flex';
    document.getElementById('localVideoWrap').style.display = activeCallIsVideo ? 'block' : 'none';

    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: activeCallIsVideo ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false
        });
        const localVidEl = document.getElementById('localVideo');
        if (localVidEl) localVidEl.srcObject = localStream;
    } catch (e) { console.warn(e); }

    setupPeerConnection();

    socket.emit('call:accept', {
        toUserId: activeCallTargetId,
        callId: incomingCallData?.callId,
        isVideo: activeCallIsVideo
    });

    startCallTimer();
}

function rejectIncomingCall() {
    stopRingtone();
    document.getElementById('incomingCallModal').style.display = 'none';
    if (incomingCallData) {
        socket.emit('call:reject', {
            toUserId: incomingCallData.fromUser.id,
            callId: incomingCallData.callId
        });
    }
    incomingCallData = null;
}

async function handleCallAccepted(data) {
    stopRingtone();
    document.getElementById('callStatusText').innerHTML = '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#31a24c;"></span> Connected';
    startCallTimer();
    await setupPeerConnection();

    // Create offer
    try {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit('call:signal', {
            toUserId: activeCallTargetId,
            signal: { sdp: peerConnection.localDescription }
        });
    } catch (err) { console.error('Offer error:', err); }
}

async function setupPeerConnection() {
    peerConnection = new RTCPeerConnection(rtcConfig);

    if (localStream) {
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    }

    peerConnection.ontrack = (event) => {
        remoteStream = event.streams[0];
        const remoteVid = document.getElementById('remoteVideo');
        if (remoteVid) {
            remoteVid.srcObject = remoteStream;
            if (activeCallIsVideo) document.getElementById('audioCallDisplay').style.display = 'none';
        }
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('call:signal', {
                toUserId: activeCallTargetId,
                signal: { candidate: event.candidate }
            });
        }
    };
}

function startCallTimer() {
    callDurationSeconds = 0;
    clearInterval(callTimerInterval);
    callTimerInterval = setInterval(() => {
        callDurationSeconds++;
        const mins = String(Math.floor(callDurationSeconds / 60)).padStart(2, '0');
        const secs = String(callDurationSeconds % 60).padStart(2, '0');
        document.getElementById('callDuration').textContent = `${mins}:${secs}`;
    }, 1000);
}

function endCall() {
    stopRingtone();
    if (activeCallTargetId) {
        socket.emit('call:end', { toUserId: activeCallTargetId });
    }
    closeCallModal();
    showToast('Call ended');
}

function closeCallModal() {
    stopRingtone();
    clearInterval(callTimerInterval);
    document.getElementById('activeCallModal').style.display = 'none';
    document.getElementById('incomingCallModal').style.display = 'none';

    if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
        localStream = null;
    }
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    activeCallTargetId = null;
}

function toggleMuteMic() {
    if (!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        const icon = document.getElementById('micIcon');
        const btn = document.getElementById('toggleMicBtn');
        if (audioTrack.enabled) {
            icon.className = 'fas fa-microphone';
            btn.style.background = 'rgba(255,255,255,0.15)';
        } else {
            icon.className = 'fas fa-microphone-slash';
            btn.style.background = '#e41e3f';
        }
    }
}

function toggleVideoCamera() {
    if (!localStream) return;
    const videoTrack = localStream.getVideoTracks()[0];
    const camIcon = document.getElementById('camIcon');
    const btn = document.getElementById('toggleCamBtn');
    if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        if (videoTrack.enabled) {
            camIcon.className = 'fas fa-video';
            btn.style.background = 'rgba(255,255,255,0.15)';
            document.getElementById('audioCallDisplay').style.display = 'none';
        } else {
            camIcon.className = 'fas fa-video-slash';
            btn.style.background = '#e41e3f';
            document.getElementById('audioCallDisplay').style.display = 'flex';
        }
    }
}

async function toggleScreenShare() {
    try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];
        if (peerConnection) {
            const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');
            if (sender) sender.replaceTrack(screenTrack);
        }
        document.getElementById('localVideo').srcObject = screenStream;
        screenTrack.onended = () => {
            if (localStream) {
                const videoTrack = localStream.getVideoTracks()[0];
                const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');
                if (sender && videoTrack) sender.replaceTrack(videoTrack);
                document.getElementById('localVideo').srcObject = localStream;
            }
        };
    } catch (e) {
        showToast('Screen share canceled');
    }
}

function updateOnlineStatus() {
    // Update chat list online rings
    document.querySelectorAll('.chat-item').forEach(el => {
        const uid = el.dataset.uid;
        const ring = el.querySelector('.online-ring');
        if (ring) ring.style.display = onlineUsers.has(uid) ? 'block' : 'none';
    });
    // Update active chat header
    if (activeUserId) {
        const statusEl = document.getElementById('chatHdrStatus');
        if (statusEl) {
            statusEl.textContent = onlineUsers.has(String(activeUserId)) ? 'Active now' : 'Offline';
            statusEl.className = 'chat-header-status' + (onlineUsers.has(String(activeUserId)) ? '' : ' offline');
        }
    }
}

// === CONVERSATIONS ===
async function loadConversations() {
    try {
        const res = await apiFetch('/messages/conversations');
        allConversations = await res.json();
        renderConversations(allConversations);
    } catch {
        document.getElementById('chatListBody').innerHTML = '<div style="padding:20px;text-align:center;color:#65676b;">Failed to load</div>';
    }
}

function renderConversations(convs) {
    const el = document.getElementById('chatListBody');
    if (!convs.length) {
        el.innerHTML = '<div style="padding:24px;text-align:center;color:#65676b;font-size:0.85rem;">No conversations yet.<br><br>Click ✏️ to start chatting!</div>';
        return;
    }
    el.innerHTML = convs.map(c => {
        const initials = getInitials(c.fullName);
        const avatarHtml = c.profilePicture
            ? `<img class="av" src="http://localhost:5000${c.profilePicture}" onerror="this.style.display='none'">`
            : `<div class="ap">${initials}</div>`;
        const isOnline = onlineUsers.has(String(c._id));
        const hasUnread = c.unreadCount > 0;
        return `<div class="chat-item" id="conv-${c._id}" data-uid="${c._id}"
            onclick="openChat('${c._id}','${escHtml(c.fullName)}',${c.profilePicture ? `'${c.profilePicture}'` : 'null'})">
            <div class="chat-avatar">
                ${avatarHtml}
                <div class="online-ring" style="display:${isOnline ? 'block' : 'none'};"></div>
            </div>
            <div class="chat-info">
                <div class="chat-name">${escHtml(c.fullName)}</div>
                <div class="chat-preview">
                    <div class="chat-last-msg ${hasUnread ? 'unread' : ''}">
                        ${c.lastMessage ? escHtml(c.lastMessage).slice(0,45) + (c.lastMessage.length > 45 ? '…' : '') : 'Say hello! 👋'}
                    </div>
                </div>
            </div>
            <div class="chat-meta">
                ${c.lastMessageTime ? `<div class="chat-time">${timeAgo(c.lastMessageTime)}</div>` : ''}
                ${hasUnread ? `<div class="unread-badge">${c.unreadCount}</div>` : ''}
            </div>
        </div>`;
    }).join('');
}

function filterConversations(q) {
    if (!q) { renderConversations(allConversations); return; }
    renderConversations(allConversations.filter(c => c.fullName.toLowerCase().includes(q.toLowerCase())));
}

// === OPEN CHAT ===
async function openChat(userId, name, picUrl) {
    activeUserId = userId;
    activeUserName = name;
    activeUserPic = picUrl;

    document.getElementById('chatEmpty').style.display = 'none';
    const win = document.getElementById('chatWindow');
    win.style.display = 'flex';

    // Header avatar
    const hdrAvatar = document.getElementById('chatHdrAvatar');
    if (picUrl) {
        hdrAvatar.innerHTML = `<img class="av" style="width:42px;height:42px;" src="http://localhost:5000${picUrl}" onerror="this.innerHTML='<div class=ap>${getInitials(name)}</div>'">`;
    } else {
        hdrAvatar.innerHTML = `<div class="ap" style="width:42px;height:42px;">${getInitials(name)}</div>`;
    }
    document.getElementById('chatHdrName').textContent = name;
    const statusEl = document.getElementById('chatHdrStatus');
    statusEl.textContent = onlineUsers.has(String(userId)) ? 'Active now' : 'Offline';
    statusEl.className = 'chat-header-status' + (onlineUsers.has(String(userId)) ? '' : ' offline');

    // Highlight active
    document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
    document.getElementById(`conv-${userId}`)?.classList.add('active');

    await loadMessages(userId);
    markMessagesRead(userId);
    document.getElementById('chatInput').focus();
    if (window.innerWidth <= 700) document.getElementById('chatList').classList.add('hidden-mobile');
    closeEmojiPicker();
}

function showChatList() { document.getElementById('chatList').classList.remove('hidden-mobile'); }

function goToProfile() {
    if (activeUserId) window.location.href = `profile.html?id=${activeUserId}`;
}

// === MESSAGES ===
async function loadMessages(userId) {
    const area = document.getElementById('messagesArea');
    area.innerHTML = '<div style="padding:20px;text-align:center;color:#65676b;"><i class="fas fa-spinner fa-spin"></i></div>';
    try {
        const res = await apiFetch(`/messages/${userId}`);
        const msgs = await res.json();
        const myId = String(currentUser._id || currentUser.id);
        area.innerHTML = '<div class="typing-indicator" id="typingIndicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>';

        let lastDate = null;
        msgs.forEach(m => {
            const msgDate = new Date(m.created_at).toDateString();
            if (msgDate !== lastDate) {
                const div = document.createElement('div');
                div.className = 'date-divider';
                div.textContent = formatDate(m.created_at);
                area.insertBefore(div, document.getElementById('typingIndicator'));
                lastDate = msgDate;
            }
            appendMessage(m, String(m.sender_id) === myId);
        });
        area.scrollTop = area.scrollHeight;
    } catch {
        area.innerHTML = '<div style="padding:20px;text-align:center;color:#e41e3f;">Failed to load messages</div>';
    }
}

function appendMessage(msg, isOwn) {
    const area = document.getElementById('messagesArea');
    const typing = document.getElementById('typingIndicator');
    const div = document.createElement('div');
    div.className = 'msg-group ' + (isOwn ? 'mine' : 'theirs');
    if (msg.tempId) div.setAttribute('data-temp-id', msg.tempId);

    const time = formatTime(msg.created_at);
    const isImage = msg.content && msg.content.startsWith('[IMAGE]:');
    const isFile  = msg.content && msg.content.startsWith('[FILE]:');

    let bubbleContent = '';
    let extraClass = '';

    if (isImage) {
        const rawSrc = msg.content.replace('[IMAGE]:', '').trim();
        const imgUrl = rawSrc.startsWith('data:') ? rawSrc : `http://localhost:5000${rawSrc}`;
        bubbleContent = `<img src="${imgUrl}" onclick="openLightbox('${imgUrl}')" alt="Image" style="max-width:220px;max-height:220px;border-radius:10px;cursor:zoom-in;display:block;">`;
        extraClass = ' img-msg';
    } else if (msg.content && msg.content.startsWith('[VOICE]:')) {
        const rawSrc = msg.content.replace('[VOICE]:', '').trim();
        const audioUrl = rawSrc.startsWith('data:') ? rawSrc : `http://localhost:5000${rawSrc}`;
        bubbleContent = `<audio controls style="height:40px;outline:none;" src="${audioUrl}"></audio>`;
    } else if (msg.content && msg.content.startsWith('[GIF]:')) {
        const gifUrl = msg.content.replace('[GIF]:', '').trim();
        bubbleContent = `<img src="${gifUrl}" style="max-width:200px;border-radius:10px;">`;
        extraClass = ' img-msg';
    } else if (msg.content && msg.content.startsWith('[VOICE]:')) {
        const rawSrc = msg.content.replace('[VOICE]:', '').trim();
        const audioUrl = rawSrc.startsWith('data:') ? rawSrc : `http://localhost:5000${rawSrc}`;
        bubbleContent = `<audio controls style="height:40px;outline:none;" src="${audioUrl}"></audio>`;
    } else if (msg.content && msg.content.startsWith('[GIF]:')) {
        const gifUrl = msg.content.replace('[GIF]:', '').trim();
        bubbleContent = `<img src="${gifUrl}" style="max-width:200px;border-radius:10px;">`;
        extraClass = ' img-msg';
    } else if (isFile) {
        const parts = msg.content.replace('[FILE]:', '').split('|');
        const fileName = parts[0] || 'file';
        const fileSize = parts[1] || '';
        const fileUrl  = parts[2] && parts[2] !== 'pending' ? `http://localhost:5000${parts[2]}` : null;
        const icon = getFileIcon(fileName);
        const ext = (fileName.split('.').pop() || '').toUpperCase();
        bubbleContent = `
            <div style="display:flex;align-items:center;gap:10px;min-width:180px;max-width:240px;">
                <div style="font-size:2rem;flex-shrink:0;">${icon}</div>
                <div style="flex:1;min-width:0;">
                    <div style="font-weight:700;font-size:0.82rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${escHtml(fileName)}">${escHtml(fileName)}</div>
                    <div style="font-size:0.72rem;opacity:0.7;">${ext}${fileSize ? ' · ' + fileSize : ''}</div>
                </div>
                ${fileUrl ? `<a href="${fileUrl}" download="${escHtml(fileName)}" target="_blank" style="background:rgba(255,255,255,0.2);border:none;border-radius:8px;padding:6px 10px;cursor:pointer;text-decoration:none;color:inherit;font-size:0.75rem;font-weight:700;flex-shrink:0;">⬇ Download</a>` : '<span style="font-size:0.75rem;opacity:0.6;">Uploading…</span>'}
            </div>`;
    } else {
        bubbleContent = escHtml(msg.content);
    }

    const avatarHtml = !isOwn ? (activeUserPic
        ? `<img class="msg-small-av" src="http://localhost:5000${activeUserPic}" onerror="this.style.display='none'">`
        : `<div class="msg-small-ap">${getInitials(activeUserName)}</div>`
    ) : `<div class="msg-tail-space"></div>`;

    div.innerHTML = `
        <div class="msg-group-row">
            ${isOwn ? '' : avatarHtml}
            <div class="msg-bubble ${isOwn ? 'mine' : 'theirs'}${extraClass}">${bubbleContent}</div>
            ${isOwn ? '<div class="msg-tail-space"></div>' : ''}
        </div>
        <div class="msg-meta">${time}</div>
        ${isOwn ? '<div class="seen-tick">✓ Sent</div>' : ''}`;

    area.insertBefore(div, typing);
    area.scrollTop = area.scrollHeight;
    if (typing) typing.style.display = 'none';
}


async function markMessagesRead(userId) {
    try { await apiFetch(`/messages/read/${userId}`, { method: 'PUT' }); } catch {}
}

// === SEND ===
async function sendMessage() {
    const input = document.getElementById('chatInput');
    const content = input.value.trim();
    if (!content || !activeUserId) return;
    input.value = '';
    input.style.height = 'auto';
    const myId = String(currentUser._id || currentUser.id);
    appendMessage({ content, sender_id: myId, created_at: new Date().toISOString() }, true);
    try {
        await apiFetch('/messages', { method: 'POST', body: JSON.stringify({ receiverId: activeUserId, content, isGroup: window.isCurrentGroup }) });
        loadConversations();
    } catch { showToast('Failed to send message'); }
}

// Unified file attachment sender (images + documents)
async function sendFileAttachment(input) {
    const file = input.files[0];
    if (!file || !activeUserId) return;
    const MAX = 25 * 1024 * 1024; // 25MB
    if (file.size > MAX) { showToast('File too large (max 25MB)'); input.value = ''; return; }

    const isImage = file.type.startsWith('image/');
    const formData = new FormData();
    formData.append(isImage ? 'image' : 'file', file);
    formData.append('receiverId', activeUserId);
    formData.append('isGroup', window.isCurrentGroup ? 'true' : 'false');

    // Show optimistic preview
    const tempId = 'temp_' + Date.now();
    const myId = String(currentUser._id || currentUser.id);
    const sizeStr = file.size > 1024*1024 ? (file.size/1024/1024).toFixed(1)+'MB' : Math.round(file.size/1024)+'KB';

    if (isImage) {
        const reader = new FileReader();
        reader.onload = e => {
            const tempMsg = { content: `[IMAGE]:${e.target.result}`, sender_id: myId, created_at: new Date().toISOString(), tempId };
            appendMessage(tempMsg, true);
        };
        reader.readAsDataURL(file);
    } else {
        const tempMsg = { content: `[FILE]:${file.name}|${sizeStr}|pending`, sender_id: myId, created_at: new Date().toISOString(), tempId };
        appendMessage(tempMsg, true);
    }

    try {
        const endpoint = isImage ? `${API}/messages/image` : `${API}/messages/file`;
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        const data = await res.json();
        if (data.message) {
            // Remove temp bubble and append real one
            document.querySelector(`[data-temp-id="${tempId}"]`)?.remove();
            const msgType = isImage ? `[IMAGE]:${data.message.mediaUrl}` : `[FILE]:${file.name}|${sizeStr}|${data.message.mediaUrl}`;
            appendMessage({ content: msgType, sender_id: myId, created_at: new Date().toISOString() }, true);
            loadConversations();
        }
    } catch { showToast('Failed to send file'); }
    input.value = '';
}

// Legacy alias
function sendImage(input) { return sendFileAttachment(input); }

function getFileIcon(filename) {
    const ext = (filename || '').split('.').pop().toLowerCase();
    const icons = { pdf: '📄', pptx: '📊', ppt: '📊', docx: '📝', doc: '📝', xlsx: '📈', xls: '📈', txt: '📃', zip: '🗜️', rar: '🗜️' };
    return icons[ext] || '📎';
}


function handleInputKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
}

function onInputChange() {
    // Auto-resize textarea
    const ta = document.getElementById('chatInput');
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
    // Typing indicator
    if (socket && activeUserId) {
        socket.emit('typing', { senderId: currentUser._id || currentUser.id, receiverId: activeUserId });
    }
}

// === EMOJI ===
function populateEmojiPicker() {
    const picker = document.getElementById('emojiPicker');
    picker.innerHTML = EMOJIS.map(e =>
        `<button class="emoji-btn" onclick="insertEmoji('${e}')">${e}</button>`
    ).join('');
}

function toggleEmojiPicker() {
    document.getElementById('emojiPicker').classList.toggle('open');
}
function closeEmojiPicker() {
    document.getElementById('emojiPicker').classList.remove('open');
}
function insertEmoji(em) {
    const input = document.getElementById('chatInput');
    input.value += em;
    input.focus();
    closeEmojiPicker();
}
document.addEventListener('click', (e) => {
    if (!e.target.closest('#emojiPicker') && !e.target.closest('#emojiTrigger')) closeEmojiPicker();
});

// === NEW CHAT MODAL ===
async function openNewChatModal() {
    document.getElementById('newChatModal').classList.add('open');
    document.getElementById('peopleSearch').value = '';
    const list = document.getElementById('peopleList');
    list.innerHTML = '<div style="padding:20px;text-align:center;color:#65676b;"><i class="fas fa-spinner fa-spin"></i></div>';
    try {
        const res = await apiFetch('/users');
        allPeople = await res.json();
        renderPeople(allPeople);
    } catch { list.innerHTML = '<div style="padding:20px;text-align:center;color:#e41e3f;">Failed to load</div>'; }
}
function closeNewChatModal() { document.getElementById('newChatModal').classList.remove('open'); }
function filterPeople(q) {
    renderPeople(!q ? allPeople : allPeople.filter(p => p.fullName.toLowerCase().includes(q.toLowerCase())));
}
function renderPeople(people) {
    const list = document.getElementById('peopleList');
    if (!people.length) { list.innerHTML = '<div style="padding:20px;text-align:center;color:#65676b;">No users found</div>'; return; }
    list.innerHTML = people.map(p => {
        const av = p.profilePicture
            ? `<div class="person-ap"><img src="http://localhost:5000${p.profilePicture}"></div>`
            : `<div class="person-ap">${getInitials(p.fullName)}</div>`;
        return `<div class="person-item" onclick="startNewChat('${p._id}','${escHtml(p.fullName)}',${p.profilePicture ? `'${p.profilePicture}'` : 'null'})">
            ${av}
            <div>
                <div class="person-name">${escHtml(p.fullName)}</div>
                <div class="person-dept">${p.department || p.role || ''}</div>
            </div>
        </div>`;
    }).join('');
}
function startNewChat(userId, name, pic) {
    closeNewChatModal();
    openChat(userId, name, pic);
}

// === LIGHTBOX ===
function openLightbox(src) {
    document.getElementById('lightboxImg').src = src;
    document.getElementById('lightbox').classList.add('open');
}
function closeLightbox() { document.getElementById('lightbox').classList.remove('open'); }

// === HELPERS ===
async function apiFetch(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return fetch(`${API}${path}`, { ...opts, headers });
}
function getInitials(name) { if(!name) return '?'; return name.trim().split(' ').slice(0,2).map(n=>n[0]?.toUpperCase()).join(''); }
function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function timeAgo(d) {
    if(!d) return '';
    let dt = typeof d === 'string' && !d.includes('T') ? d.replace(' ', 'T') + 'Z' : d;
    const s = Math.max(0, (Date.now() - new Date(dt).getTime()) / 1000);
    if(s < 60) return 'Just now';
    if(s < 3600) return Math.floor(s/60) + 'm ago';
    if(s < 86400) return Math.floor(s/3600) + 'h ago';
    return Math.floor(s/86400) + 'd ago';
}
function formatTime(d) { if(!d) return ''; return new Date(d).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}); }
function formatDate(d) { if(!d) return ''; const dt=new Date(d); const now=new Date(); const diff=Math.floor((now-dt)/86400000); if(diff===0) return 'Today'; if(diff===1) return 'Yesterday'; return dt.toLocaleDateString('en-US',{month:'short',day:'numeric'}); }
function showToast(msg) { const t=document.createElement('div'); t.className='toast'; t.textContent=msg; document.getElementById('toast-container').appendChild(t); setTimeout(()=>t.remove(),3100); }

let currentTab = 'chats'; // chats | channels

function switchTab(tab, btnEl) {
    currentTab = tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btnEl.classList.add('active');
    loadConversations();
}

function closeCreationModals() {
    document.getElementById('createGroupModal').style.display = 'none';
    document.getElementById('createChannelModal').style.display = 'none';
    document.getElementById('myFilesModal').style.display = 'none';
}

function openMyFiles() {
    document.getElementById('myFilesModal').style.display = 'flex';
    loadMyFiles();
}

// Intercept newChatModal to add Group/Channel options
const originalOpenNewChatModal = openNewChatModal;
openNewChatModal = function() {
    // We can inject a prompt here, but for simplicity, we'll append buttons to the existing search modal
    const peopleList = document.getElementById('peopleList');
    if (!document.getElementById('createGroupBtnInject')) {
        peopleList.insertAdjacentHTML('beforebegin', `
            <div style="display:flex; gap:10px; padding:0 20px 10px;">
                <button id="createGroupBtnInject" onclick="closeNewChatModal(); document.getElementById('createGroupModal').style.display='flex'" style="flex:1; padding:8px; border-radius:8px; border:1px solid var(--blue); background:transparent; color:var(--blue); font-weight:bold; cursor:pointer;"><i class="fas fa-users"></i> New Group</button>
                <button onclick="closeNewChatModal(); document.getElementById('createChannelModal').style.display='flex'" style="flex:1; padding:8px; border-radius:8px; border:1px solid var(--blue); background:transparent; color:var(--blue); font-weight:bold; cursor:pointer;"><i class="fas fa-bullhorn"></i> New Channel</button>
            </div>
        `);
    }
    originalOpenNewChatModal();
};

async function submitCreateGroup() {
    const name = document.getElementById('groupName').value;
    if(!name) return showToast('Name required', 'error');
    try {
        const res = await apiFetch('/messages/group', { method: 'POST', body: JSON.stringify({ name }) });
        closeCreationModals();
        showToast('Group created!');
        loadConversations();
    } catch(e) { showToast('Error creating group', 'error'); }
}

async function submitCreateChannel() {
    const name = document.getElementById('channelName').value;
    const desc = document.getElementById('channelDesc').value;
    if(!name) return showToast('Name required', 'error');
    try {
        const formData = new FormData();
        formData.append('name', name);
        formData.append('description', desc);
        await fetch(API + '/channels', { method: 'POST', headers: {'Authorization': 'Bearer ' + token}, body: formData });
        closeCreationModals();
        showToast('Channel created!');
        loadConversations();
    } catch(e) { showToast('Error creating channel', 'error'); }
}

async function loadMyFiles() {
    const list = document.getElementById('myFilesList');
    list.innerHTML = '<div style="text-align:center;padding:20px;"><i class="fas fa-spinner fa-spin"></i></div>';
    try {
        const files = await apiFetch('/cloud-files');
        if(files.length === 0) { list.innerHTML = '<p style="text-align:center;opacity:0.6;">No files uploaded yet.</p>'; return; }
        list.innerHTML = files.map(f => `
            <div style="display:flex;align-items:center;background:var(--surface);padding:10px;border-radius:8px;gap:10px;border:1px solid var(--border);">
                <i class="fas fa-file-alt" style="font-size:1.5rem;color:var(--blue);"></i>
                <div style="flex:1;overflow:hidden;">
                    <div style="font-weight:bold;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;">${escHtml(f.file_name)}</div>
                    <div style="font-size:0.75rem;opacity:0.7;">${f.file_size} • ${new Date(f.created_at).toLocaleDateString()}</div>
                </div>
                <button onclick="forwardCloudFile('${f.file_url}', '${escHtml(f.file_name)}')" style="background:var(--blue);color:white;border:none;border-radius:6px;padding:6px 12px;cursor:pointer;"><i class="fas fa-share"></i> Send</button>
                <a href="http://localhost:5000${f.file_url}" download target="_blank" style="color:var(--text);opacity:0.6;"><i class="fas fa-download"></i></a>
            </div>
        `).join('');
    } catch(e) { list.innerHTML = '<p style="color:red;">Failed to load files</p>'; }
}

async function uploadToCloud(input) {
    if(!input.files[0]) return;
    const formData = new FormData();
    formData.append('file', input.files[0]);
    try {
        showToast('Uploading...');
        await fetch(API + '/cloud-files', { method: 'POST', headers: {'Authorization': 'Bearer ' + token}, body: formData });
        showToast('File uploaded!');
        loadMyFiles();
    } catch(e) { showToast('Upload failed', 'error'); }
}

async function forwardCloudFile(url, name) {
    if(!activeUserId) return showToast('Open a chat first', 'error');
    try {
        await apiFetch('/messages', { 
            method: 'POST', 
            body: JSON.stringify({ 
                receiverId: activeUserId, 
                isGroup: window.isCurrentGroup, 
                content: `[FILE]:${name}||${url}` 
            }) 
        });
        showToast('File sent!');
        closeCreationModals();
    } catch(e) { showToast('Failed to send file', 'error'); }
}

// Patch loadConversations to fetch channels if tab is 'channels'
const originalLoadConversations = loadConversations;
loadConversations = async function() {
    if(currentTab === 'chats') {
        return originalLoadConversations();
    }
    
    // Load channels
    const list = document.getElementById('chatListBody');
    list.innerHTML = '<div style="padding:24px;text-align:center;"><i class="fas fa-spinner fa-spin"></i> Loading Channels...</div>';
    try {
        const channels = await apiFetch('/channels');
        window.conversationsData = channels; 
        renderChannels(channels);
    } catch(e) {
        list.innerHTML = '<div style="padding:24px;text-align:center;color:red;">Failed to load channels</div>';
    }
};

function renderChannels(channels) {
    const list = document.getElementById('chatListBody');
    if(!channels || channels.length === 0) {
        list.innerHTML = '<div style="padding:24px;text-align:center;color:#65676b;">No channels found.</div>';
        return;
    }
    let html = '';
    channels.forEach(ch => {
        const avatar = ch.cover_image ? `<img src="http://localhost:5000${ch.cover_image}" class="cl-av">` : `<div class="cl-ap">📢</div>`;
        html += `
        <div class="chat-list-item" onclick="openChannel('${ch.id}', '${escHtml(ch.name)}')">
            <div class="cl-av-wrap">${avatar}</div>
            <div class="cl-info">
                <div class="cl-name">${escHtml(ch.name)}</div>
                <div class="cl-last-msg">${ch.subscriberCount} subscribers</div>
            </div>
        </div>`;
    });
    list.innerHTML = html;
}

window.isCurrentChannel = false;

async function openChannel(id, name) {
    activeUserId = id;
    activeUserName = name;
    window.isCurrentGroup = false;
    window.isCurrentChannel = true;
    
    document.getElementById('chatHdrName').textContent = name;
    document.getElementById('chatHdrStatus').textContent = 'Channel';
    document.getElementById('chatHdrAvatar').innerHTML = '<div class="ap" style="background:var(--blue);">📢</div>';
    
    if (window.innerWidth <= 700) {
        document.getElementById('chatList').classList.add('hidden-mobile');
    }
    
    document.getElementById('chatEmpty').style.display = 'none';
    document.getElementById('chatWindow').style.display = 'flex';
    
    // For channels, hide input unless admin
    document.querySelector('.chat-input-area').style.display = 'none'; // We'll reveal if admin
    
    const area = document.getElementById('messagesArea');
    area.innerHTML = '<div style="text-align:center;padding:20px;"><i class="fas fa-spinner fa-spin"></i></div>';
    
    try {
        const posts = await apiFetch(`/channels/${id}/posts`);
        area.innerHTML = '';
        if(posts.length === 0) area.innerHTML = '<p style="text-align:center;opacity:0.6;margin-top:20px;">No posts yet.</p>';
        posts.reverse().forEach(p => appendChannelPost(p));
        area.scrollTop = area.scrollHeight;
        
        // Fetch channels again to check admin status
        const channels = await apiFetch('/channels');
        const myChannel = channels.find(c => c.id == id);
        if(myChannel && (myChannel.myRole === 'owner' || myChannel.myRole === 'admin')) {
            document.querySelector('.chat-input-area').style.display = 'flex';
        } else if (!myChannel || !myChannel.myRole) {
            // Provide a join button
            area.insertAdjacentHTML('beforeend', `
                <div style="text-align:center; margin:20px;">
                    <button onclick="joinCurrentChannel()" style="padding:10px 20px;background:var(--blue);color:white;border:none;border-radius:20px;font-weight:bold;cursor:pointer;">Join Channel</button>
                </div>
            `);
        }
    } catch(e) { area.innerHTML = '<p style="color:red;text-align:center;">Error loading channel</p>'; }
}

async function joinCurrentChannel() {
    if(!activeUserId || !window.isCurrentChannel) return;
    try {
        await apiFetch(`/channels/${activeUserId}/join`, { method: 'POST' });
        showToast('Joined channel!');
        openChannel(activeUserId, activeUserName); // reload
    } catch(e) { showToast('Error joining', 'error'); }
}

function appendChannelPost(post) {
    const area = document.getElementById('messagesArea');
    const div = document.createElement('div');
    div.style.marginBottom = '15px';
    div.style.display = 'flex';
    div.style.flexDirection = 'column';
    div.style.alignItems = 'center';
    
    let mediaHtml = '';
    if (post.mediaUrl) {
        if(post.mediaUrl.match(/\.(jpeg|jpg|png|gif|webp)$/i)) {
            mediaHtml = `<img src="http://localhost:5000${post.mediaUrl}" style="max-width:100%; border-radius:10px; margin-top:8px;">`;
        } else {
            mediaHtml = `<a href="http://localhost:5000${post.mediaUrl}" target="_blank" style="display:block;margin-top:8px;background:rgba(255,255,255,0.1);padding:10px;border-radius:8px;color:var(--blue);text-decoration:none;"><i class="fas fa-file"></i> View Attachment</a>`;
        }
    }
    
    div.innerHTML = `
        <div style="background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:15px; max-width:80%; width:100%;">
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
                <img src="http://localhost:5000${post.adminPic}" onerror="this.style.display='none'" style="width:30px;height:30px;border-radius:50%;">
                <div style="font-weight:bold;">${escHtml(post.adminName)} <i class="fas fa-check-circle" style="color:var(--blue);font-size:0.8rem;"></i></div>
                <div style="font-size:0.7rem;opacity:0.6;margin-left:auto;">${formatTime(post.created_at)}</div>
            </div>
            <div style="font-size:1rem; line-height:1.5;">${escHtml(post.content || '')}</div>
            ${mediaHtml}
        </div>
    `;
    area.appendChild(div);
}

// Override sendMessage to handle channels
const originalSendMessage = sendMessage;
sendMessage = async function() {
    if(window.isCurrentChannel) {
        const input = document.getElementById('chatInput');
        const text = input.value.trim();
        if(!text) return;
        
        const area = document.getElementById('messagesArea');
        
        try {
            const formData = new FormData();
            formData.append('channel_id', activeUserId);
            formData.append('content', text);
            input.value = '';
            
            const post = await fetch(API + '/channels/post', { method: 'POST', headers: {'Authorization': 'Bearer ' + token}, body: formData }).then(r=>r.json());
            if(post.message) throw new Error(post.message);
            appendChannelPost(post);
            area.scrollTop = area.scrollHeight;
        } catch(e) { showToast(e.message || 'Error posting', 'error'); }
    } else {
        originalSendMessage();
    }
};


function openAiModal() {
    document.getElementById('aiModal').style.display = 'flex';
    document.getElementById('aiInputText').value = document.getElementById('chatInput').value;
    document.getElementById('aiOutput').style.display = 'none';
    document.getElementById('aiApplyBtn').style.display = 'none';
}

async function processAi(action) {
    const text = document.getElementById('aiInputText').value;
    if(!text) return showToast('Enter text first', 'error');
    const out = document.getElementById('aiOutput');
    out.style.display = 'block';
    out.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
    try {
        const res = await apiFetch('/ai/process', { method: 'POST', body: JSON.stringify({ text, action }) });
        out.innerText = res.result;
        document.getElementById('aiApplyBtn').style.display = 'block';
    } catch(e) { out.innerText = 'AI failed to process.'; }
}

function applyAiResult() {
    document.getElementById('chatInput').value = document.getElementById('aiOutput').innerText;
    document.getElementById('aiModal').style.display = 'none';
}

