// DIU Nexus - Dynamic API Base (fixes Failed to Fetch)
// Robust: file:// -> localhost:5000, localhost:* (any port like 5500 Live Server) -> localhost:5000, prod -> origin
(function(){
  window.getBaseUrl = function(){
    var proto = window.location.protocol;
    var host = window.location.hostname;
    var port = window.location.port;
    // Capacitor / Ionic (mobile app) => API is 10.0.2.2 for emulator, or LAN IP for device
    if (proto === 'capacitor:' || proto === 'ionic:' || window.location.href.indexOf('capacitor://')===0) {
        // Android emulator: 10.0.2.2, for real device set your LAN IP (e.g., http://192.168.1.5:5000)
        return 'http://10.0.2.2:5000';
    }
    // File protocol (double-click index.html) => API is localhost:5000
    if (proto === 'file:') return 'http://localhost:5000';
    // Local dev on any port (5500 Live Server, 3000, 8000, etc.) => force 5000
    // Electron loads http://localhost:5000 => keep origin
    if (host === 'localhost' || host === '127.0.0.1' || host === '') {
      if (port === '5000') return window.location.origin;
      if (!port) {
        // http://localhost without port -> if origin already 5000 keep, else 5000
        return window.location.origin.indexOf('5000') !== -1 ? window.location.origin : 'http://localhost:5000';
      }
      // Any other dev port => API is 5000
      return 'http://localhost:5000';
    }
    // Production (vercel, render etc.) => use origin
    return window.location.origin;
  };
  window.API_BASE = window.getBaseUrl();
  window.API = window.API_BASE + '/api';
  window.SOCKET_URL = window.API_BASE;
  window._fixDoubleUrl = function(url){
  if(!url) return url;
  if(url.includes('https://res.cloudinary')) {
    const idx = url.indexOf('https://res.cloudinary');
    if(idx>0) url = url.slice(idx);
  }
  if(url.includes('httphttp')) {
    url = url.replace('httphttp','http');
  }
  return url;
};
window.mediaUrl = function(p){
  p = window._fixDoubleUrl(p);

    if(!p) return '';
    if(p.startsWith('http') || p.startsWith('data:') || p.startsWith('blob:')) return p;
    return window.API_BASE + p;
  };
  // Patch fetch helper to show friendly error on Failed to fetch
  const origFetch = window.fetch;
  window.safeFetch = async function(url, opts){
    try {
      // Auto prefix API if url starts with /api and not full url
      if(url.startsWith('/api')) url = window.API_BASE + url;
      return await origFetch(url, opts);
    } catch(err){
      if(err.message && err.message.includes('Failed to fetch')){
        console.error('[DIU Nexus] Failed to fetch - is server running? Base:', window.API_BASE, err);
        // Show toast if available
        if(window.showToast) window.showToast('⚠️ Server connection failed. Starting server... Please wait.', 'error');
      }
      throw err;
    }
  };
  console.log('[DIU Nexus] API Base:', window.API_BASE);
})();
