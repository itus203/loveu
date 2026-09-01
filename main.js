const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

// Start the Express server
require('./server/server.js');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 360,
        minHeight: 600,
        title: 'DIU Nexus',
        icon: path.join(__dirname, 'client', 'assets', 'icon.png'),
        autoHideMenuBar: true,
        // Perfect fit: resizable + maximizable for any display
        resizable: true,
        maximizable: true,
        fullscreenable: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: true,
            preload: path.join(__dirname, 'preload.js'),
            // Ensure no cache issues that make buttons jam after reopen
            backgroundThrottling: false
        },
        backgroundColor: '#f0f2f5',
        show: false
    });

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        // Auto maximize on large displays for perfect fit
        if (mainWindow && !mainWindow.isMaximized()) {
            const { width } = require('electron').screen.getPrimaryDisplay().workAreaSize;
            if (width >= 1600) mainWindow.maximize();
        }
    });

    // Clear cache on every launch — fixes button jam after close/reopen
    mainWindow.webContents.session.clearCache().catch(()=>{});
    // Disable HTTP cache for perfect button reliability in exe
    mainWindow.webContents.session.clearStorageData({storages: ['cachestorage']}).catch(()=>{});

    // Open external links in the default browser, not in the Electron window
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    // Fix: reload app automatically when window regains focus if API was 503 before
    mainWindow.on('focus', () => {
        if (mainWindow.webContents.getURL().includes('localhost:5000')) {
            // no-op, renderer will handle retry via apiFetch
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// Wait for server + DB to be ready before opening window — fixes button jam (503 warming-up)
function tryLoadApp(retries = 40) {
    const http = require('http');
    const checkUrl = 'http://localhost:5000/api/health';
    const req = http.get(checkUrl, (res) => {
        let data='';
        res.on('data', c=>data+=c);
        res.on('end', ()=>{
            try{
                const j=JSON.parse(data);
                // Must have dbReady:true — otherwise buttons (like resource share) hit 503 and appear jammed
                if (res.statusCode === 200 && j.dbReady) {
                    console.log('[Electron] Server ready (dbReady), loading app');
                    mainWindow.webContents.session.clearCache().then(()=>{
                        mainWindow.loadURL('http://localhost:5000', { extraHeaders: 'Cache-Control: no-cache\nPragma: no-cache\n' });
                    }).catch(()=> mainWindow.loadURL('http://localhost:5000'));
                } else {
                    console.log(`[Electron] Server warming up dbReady=${j.dbReady}, retries ${retries}`);
                    if (retries > 0) setTimeout(() => tryLoadApp(retries - 1), 500);
                    else mainWindow.loadURL('http://localhost:5000');
                }
            }catch{
                if (res.statusCode === 200) {
                    console.log('[Electron] Server ready (no json), loading app');
                    mainWindow.loadURL('http://localhost:5000');
                } else {
                    if (retries > 0) setTimeout(() => tryLoadApp(retries - 1), 500);
                    else mainWindow.loadURL('http://localhost:5000');
                }
            }
        });
    });
    req.on('error', (err) => {
        console.log(`[Electron] Waiting for server... retries left ${retries}, err: ${err.message}`);
        if (retries > 0) {
            setTimeout(() => tryLoadApp(retries - 1), 500);
        } else {
            console.error('[Electron] Could not connect to server after retries');
            mainWindow.loadURL(`data:text/html,<div style="font-family:Inter,sans-serif;text-align:center;margin-top:35vh;padding:20px;"><h2 style="color:#e41e3f;margin-bottom:12px;">⚠️ Could not connect to DIU Nexus server</h2><p style="color:#65676b;">Server not responding on http://localhost:5000<br>Please run <code>npm run server</code> or restart the app.</p><button onclick="location.reload()" style="margin-top:16px;padding:10px 20px;background:#0866ff;color:white;border:none;border-radius:8px;font-weight:700;cursor:pointer;">Retry</button></div>`);
        }
    });
    req.setTimeout(2000, () => { req.destroy(); });
    req.end();
}

app.whenReady().then(() => {
    createWindow();
    setTimeout(() => tryLoadApp(), 1500);

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
