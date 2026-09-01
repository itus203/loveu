
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js').catch(() => {});
        });
    }
    
// ==================== STORIES LOGIC ====================
let currentStoriesData = [];
let viewingUserIndex = 0;
let viewingStoryIndex = 0;
let storyTimeout = null;

async function loadStories() {
    try {
        const stories = await apiFetch('/stories/feed');
        currentStoriesData = stories;
        renderStoriesRing(stories);
    } catch(e) { console.error('Failed to load stories'); }
}

function renderStoriesRing(users) {
    const list = document.getElementById('friendsStoriesList');
    let html = '';
    users.forEach((user, uIndex) => {
        // Gradient ring for active stories
        html += `
        <div onclick="openStoryViewer(${uIndex})" style="display:flex; flex-direction:column; align-items:center; cursor:pointer; flex-shrink:0; width:70px;">
            <div style="width:60px; height:60px; border-radius:50%; background:linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888); padding:3px; display:flex; align-items:center; justify-content:center;">
                <img src="http://localhost:5000${user.profilePicture}" onerror="this.src='https://via.placeholder.com/60'" style="width:100%; height:100%; border-radius:50%; border:2px solid var(--bg-color); object-fit:cover;">
            </div>
            <span style="font-size:0.75rem; margin-top:5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%;">${escHtml(user.fullName.split(' ')[0])}</span>
        </div>`;
    });
    list.innerHTML = html;
}

function openStoryCreator() {
    document.getElementById('storyCreatorModal').style.display = 'flex';
    document.getElementById('storyImgPreview').style.display = 'none';
    document.getElementById('storyImgPreview').src = '';
    document.getElementById('storyTextInput').style.display = 'none';
    document.getElementById('storyTextInput').value = '';
    document.getElementById('uploadStoryBtn').style.display = 'none';
}

function previewStoryMedia(input) {
    if(input.files[0]) {
        const url = URL.createObjectURL(input.files[0]);
        document.getElementById('storyImgPreview').src = url;
        document.getElementById('storyImgPreview').style.display = 'block';
        document.getElementById('storyTextInput').style.display = 'block';
        document.getElementById('uploadStoryBtn').style.display = 'block';
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

function previewStoryMedia(input) {
    if(input.files[0]) {
        currentStoryMode = 'image';
        const url = URL.createObjectURL(input.files[0]);
        document.getElementById('storyBtnGroup').style.display = 'none';
        document.getElementById('storyImgPreview').src = url;
        document.getElementById('storyImgPreview').style.display = 'block';
        document.getElementById('storyTextInput').style.display = 'block';
        document.getElementById('uploadStoryBtn').style.display = 'block';
    }
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
        document.getElementById('storyCreatorModal').style.display = 'none';
        loadStories();
    } catch(e) { showToast('Upload failed', 'error'); }
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
    
    document.getElementById('svAvatar').src = 'http://localhost:5000' + user.profilePicture;
    document.getElementById('svName').innerText = user.fullName;
    document.getElementById('svTime').innerText = formatTime(story.created_at);
    
    const img = document.getElementById('svMedia');
    const txt = document.getElementById('svText');
    const pvBox = img.parentElement;
    
    // Privacy Indicator
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
        img.src = 'http://localhost:5000' + story.content;
        pvBox.style.background = 'black';
        // If there's a caption, show it
        if(story.bg_color) { // repurposing bg_color field or just append if needed
             // could add caption overlay here
        }
    }

    
    // Setup progress bars
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
    
    // Mark view
    apiFetch(`/stories/${story.id}/view`, { method: 'POST' }).catch(e=>console.log);
    
    // Animate current bar
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

