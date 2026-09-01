const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'client/views/messenger.html');
let html = fs.readFileSync(file, 'utf8');

// 1. Voice Record Button in UI
const voiceUI = 
<button class="input-action-btn" title="Record Voice" id="micBtn" onmousedown="startRecording()" onmouseup="stopRecording()" onmouseleave="stopRecording()">
    <i class="fas fa-microphone"></i>
</button>
;
html = html.replace(/<button class="input-action-btn" title="Emoji" onclick="toggleEmojiPicker\(\)">/, voiceUI + '\n                    <button class="input-action-btn" title="Emoji" onclick="toggleEmojiPicker()">');

// 2. Unsend / Delete logic
const appendMsgOriginal = div.innerHTML = \
        <div class="msg-group-row">
            \
            <div class="msg-bubble \\">\</div>
            \
        </div>
        <div class="msg-meta">\</div>
    \;;

const appendMsgNew = 
      // Inject unsend button for own messages
      const unsendBtn = isOwn && !msg.tempId ? \<button onclick="unsendMessage(\)" style="background:none;border:none;color:var(--text-secondary);cursor:pointer;opacity:0.5;margin-left:6px;" title="Unsend"><i class="fas fa-trash-alt"></i></button>\ : '';
      
      div.id = 'msg_' + (msg.id || msg._id);
      
      div.innerHTML = \
        <div class="msg-group-row">
            \
            <div class="msg-bubble \\">\</div>
            \
        </div>
        <div class="msg-meta">\</div>
    \;;
html = html.replace(appendMsgOriginal, appendMsgNew);

// 3. Audio bubble handling in appendMessage
const appendAudioLogic = 
    } else if (isFile) {;
const newAudioLogic = 
    } else if (msg.content && msg.content.startsWith('[VOICE]:')) {
        const rawSrc = msg.content.replace('[VOICE]:', '').trim();
        const audioUrl = rawSrc.startsWith('data:') ? rawSrc : \http://localhost:5000\\;
        bubbleContent = \<audio controls style="height:36px;outline:none;" src="\"></audio>\;
    } else if (msg.content && msg.content.startsWith('[GIF]:')) {
        const gifUrl = msg.content.replace('[GIF]:', '').trim();
        bubbleContent = \<img src="\" style="max-width:200px;border-radius:10px;">\;
        extraClass = ' img-msg';
    } else if (isFile) {;
html = html.replace(appendAudioLogic, newAudioLogic);

// 4. Voice Recording JS Logic + Unsend API + GIF Search
const newScripts = 
// Voice Recorder
let mediaRecorder;
let audioChunks = [];
let isRecording = false;

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.start();
        isRecording = true;
        document.getElementById('micBtn').style.color = '#e41e3f';
        document.getElementById('micBtn').style.animation = 'pulse 1s infinite';
        
        mediaRecorder.addEventListener('dataavailable', event => {
            audioChunks.push(event.data);
        });
        
        mediaRecorder.addEventListener('stop', () => {
            document.getElementById('micBtn').style.color = '';
            document.getElementById('micBtn').style.animation = '';
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            audioChunks = [];
            sendAudioAttachment(audioBlob);
        });
    } catch (e) {
        showToast('Microphone access denied', 'error');
    }
}

function stopRecording() {
    if (isRecording && mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        isRecording = false;
        mediaRecorder.stream.getTracks().forEach(t => t.stop());
    }
}

async function sendAudioAttachment(blob) {
    if (!activeUserId) return;
    const formData = new FormData();
    formData.append('audio', blob, 'voice.webm');
    formData.append('receiverId', activeUserId);
    formData.append('isGroup', window.isCurrentGroup ? 'true' : 'false');
    try {
        await fetch(API + '/messages/audio', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token },
            body: formData
        });
        // Socket should emit back
    } catch(e) {
        showToast('Failed to send voice', 'error');
    }
}

async function unsendMessage(id) {
    if(!confirm('Unsend this message for everyone?')) return;
    try {
        await apiFetch('/messages/' + id + '?isGroup=' + (window.isCurrentGroup?'true':'false'), { method: 'DELETE' });
    } catch(e) { showToast('Failed to unsend', 'error'); }
}

socket.on('message_unsent', (data) => {
    const el = document.getElementById('msg_' + data.messageId);
    if(el) {
        el.innerHTML = '<div class="msg-group-row"><div class="msg-bubble" style="opacity:0.6;font-style:italic;background:var(--surface);border:1px solid var(--border);">Message unsent</div></div>';
    }
});

// Group Support Variables
window.isCurrentGroup = false;
;
html = html.replace(/<script>/, <script>\n);

// Fix loadConversations to parse isGroup properly
html = html.replace(/const isGroup = false; \/\/ TO-DO: integrate groups/, 'const isGroup = conv.type === "group";');

// In build chat list:
const chatListOriginal = const isActive = conv._id === activeUserId;;
const chatListNew = const isActive = conv._id === activeUserId;
            const isGroup = conv.type === 'group';;
html = html.replace(chatListOriginal, chatListNew);

const avatarLoad = const avatarHtml = conv.profilePicture
                ? \<img src="http://localhost:5000\" class="cl-av">\
                : \<div class="cl-ap">\</div>\;;
const avatarLoadNew = const avatarHtml = conv.profilePicture
                ? \<img src="http://localhost:5000\" class="cl-av">\
                : \<div class="cl-ap">\</div>\;;
html = html.replace(avatarLoad, avatarLoadNew);

const openChatHTML = onclick="openChat('\', '\', '\')";
const openChatNew = onclick="openChat('\', '\', '\', \)";
html = html.replace(openChatHTML, openChatNew);

html = html.replace(/function openChat\(id, name, pic\) \{/, unction openChat(id, name, pic, isGrp=false) {\nwindow.isCurrentGroup = isGrp;);
html = html.replace(/await apiFetch\(\\/messages\/\$\{id\}\\);/, wait apiFetch(\/messages/\?type=\\););

// Fix text message send logic
html = html.replace(
    /await apiFetch\('\/messages', \{ method: 'POST', body: JSON\.stringify\(\{ receiverId: activeUserId, content \}\) \}\);/,
    "await apiFetch('/messages', { method: 'POST', body: JSON.stringify({ receiverId: activeUserId, content, isGroup: window.isCurrentGroup }) });"
);

// Fix image message send logic
html = html.replace(
    /formData\.append\('receiverId', activeUserId\);/,
    "formData.append('receiverId', activeUserId);\nformData.append('isGroup', window.isCurrentGroup ? 'true' : 'false');"
);

// CSS for pulse
const pulseCSS = 
@keyframes pulse {
    0% { transform: scale(1); }
    50% { transform: scale(1.2); }
    100% { transform: scale(1); }
};
html = html.replace(/<\/style>/, pulseCSS + '\n</style>');

fs.writeFileSync(file, html);
console.log('messenger.html patched!');
