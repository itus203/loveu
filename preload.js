// preload.js — Electron context bridge
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    platform: process.platform,
    isElectron: true,
    reload: () => ipcRenderer.send('reload-app')
});
// Also expose isElectron flag for renderer button reliability
contextBridge.exposeInMainWorld('isElectron', true);
