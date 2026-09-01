const https = require('https');
const http = require('http');
const { URL } = require('url');

// Helper: HTTP fetch (Node built-in, no axios needed)
function httpGet(urlStr, options = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(urlStr);
        const lib = url.protocol === 'https:' ? https : http;
        const reqOptions = {
            hostname: url.hostname,
            path: url.pathname + url.search,
            method: options.method || 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'identity',
                ...(options.headers || {})
            },
            timeout: 15000
        };
        const req = lib.request(reqOptions, (res) => {
            let data = '';
            // Handle redirect
            if (res.statusCode === 301 || res.statusCode === 302) {
                return resolve(httpGet(res.headers.location, options));
            }
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
        });
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
        req.on('error', reject);
        if (options.body) req.write(options.body);
        req.end();
    });
}

function httpPost(urlStr, body, headers = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(urlStr);
        const lib = url.protocol === 'https:' ? https : http;
        const bodyStr = typeof body === 'string' ? body : new URLSearchParams(body).toString();
        const reqOptions = {
            hostname: url.hostname,
            path: url.pathname + url.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(bodyStr),
                'User-Agent': 'Moodle Mobile 4.0',
                ...headers
            },
            timeout: 15000
        };
        const req = lib.request(reqOptions, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, body: data }));
        });
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
        req.on('error', reject);
        req.write(bodyStr);
        req.end();
    });
}

// ============================================================
// 1. DIU ROUTINE PROXY
// Tries to fetch and parse class routine from diuroutine.com
// ============================================================
exports.getRoutine = async (req, res) => {
    try {
        const { type, batch, section, teacher, room } = req.query;
        let url = 'https://www.diuroutine.com/';

        if (type === 'section' && batch && section) {
            url = `https://www.diuroutine.com/?batch=${encodeURIComponent(batch)}&section=${encodeURIComponent(section)}`;
        } else if (type === 'teacher' && teacher) {
            url = `https://www.diuroutine.com/?teacher=${encodeURIComponent(teacher)}`;
        } else if (type === 'room' && room) {
            url = `https://www.diuroutine.com/?room=${encodeURIComponent(room)}`;
        }

        const response = await httpGet(url);

        if (response.status !== 200) {
            return res.json({ error: 'Could not fetch routine', url });
        }

        const html = response.body;

        // Try to extract table data from the HTML
        const tableMatch = html.match(/<table[^>]*class="[^"]*routine[^"]*"[^>]*>(.*?)<\/table>/is);
        const anyTableMatch = html.match(/<table[^>]*>(.*?)<\/table>/is);
        const targetHtml = tableMatch ? tableMatch[0] : (anyTableMatch ? anyTableMatch[0] : null);

        if (targetHtml) {
            // Parse rows
            const rows = [];
            const headers = [];
            const thMatches = targetHtml.match(/<th[^>]*>(.*?)<\/th>/gis) || [];
            thMatches.forEach(th => {
                headers.push(th.replace(/<[^>]+>/g, '').trim());
            });
            const trMatches = targetHtml.match(/<tr[^>]*>(.*?)<\/tr>/gis) || [];
            trMatches.forEach(tr => {
                const tds = tr.match(/<td[^>]*>(.*?)<\/td>/gis) || [];
                if (tds.length) {
                    rows.push(tds.map(td => td.replace(/<[^>]+>/g, '').trim()));
                }
            });
            return res.json({ type: 'table', headers, rows, url });
        }

        // If no table found, return raw sanitized HTML snippet
        const bodyMatch = html.match(/<body[^>]*>(.*?)<\/body>/is);
        const snippet = (bodyMatch ? bodyMatch[1] : html).slice(0, 5000).replace(/<script[^>]*>.*?<\/script>/gis, '').replace(/<style[^>]*>.*?<\/style>/gis, '');
        return res.json({ type: 'raw', html: snippet.replace(/<[^>]+>/g, '\n').replace(/\n{3,}/g, '\n\n').trim(), url });
    } catch (e) {
        console.error('Routine proxy error:', e.message);
        res.json({ error: e.message });
    }
};

// ============================================================
// 2. BLC / MOODLE — Get Token (Mobile API)
// POST to Moodle's token endpoint with username/password
// ============================================================
exports.getBLCToken = async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }

        const response = await httpPost(
            'https://elearn.daffodilvarsity.edu.bd/login/token.php',
            {
                username,
                password,
                service: 'moodle_mobile_app'
            }
        );

        const data = JSON.parse(response.body);

        if (data.token) {
            // Get user info too
            let userid = null;
            try {
                const siteInfoRes = await httpPost(
                    'https://elearn.daffodilvarsity.edu.bd/webservice/rest/server.php',
                    {
                        wstoken: data.token,
                        wsfunction: 'core_webservice_get_site_info',
                        moodlewsrestformat: 'json'
                    }
                );
                const siteInfo = JSON.parse(siteInfoRes.body);
                userid = siteInfo.userid || null;
            } catch { }
            res.json({ token: data.token, userid });
        } else {
            const errorMsg = data.error || data.message || 'Invalid credentials';
            res.status(401).json({ error: errorMsg });
        }
    } catch (e) {
        console.error('BLC token error:', e.message);
        res.status(500).json({ error: 'Connection to BLC failed: ' + e.message });
    }
};

// ============================================================
// 3. BLC / MOODLE — Get Enrolled Courses
// ============================================================
exports.getBLCCourses = async (req, res) => {
    try {
        const { token: blcToken, userid } = req.query;
        if (!blcToken) return res.status(400).json({ error: 'BLC token required' });

        const response = await httpPost(
            'https://elearn.daffodilvarsity.edu.bd/webservice/rest/server.php',
            {
                wstoken: blcToken,
                wsfunction: 'core_enrol_get_users_courses',
                moodlewsrestformat: 'json',
                userid: userid || ''
            }
        );

        const courses = JSON.parse(response.body);

        if (Array.isArray(courses)) {
            const filtered = courses
                .filter(c => c.enrolledusercount !== 0)
                .map(c => ({
                    id: c.id,
                    fullname: c.fullname,
                    shortname: c.shortname,
                    progress: c.progress || 0,
                    lastaccess: c.lastaccess
                }));
            res.json(filtered);
        } else {
            // Token expired or invalid
            res.status(401).json({ error: 'Session expired', detail: courses });
        }
    } catch (e) {
        console.error('BLC courses error:', e.message);
        res.status(500).json({ error: e.message });
    }
};

// ============================================================
// 4. Student & Teacher Portal Proxy (generic page proxy)
// ============================================================
exports.portalProxy = async (req, res) => {
    try {
        const { url } = req.query;
        if (!url || (!url.startsWith('https://studentportal.diu.edu.bd') && !url.startsWith('https://teacherportal.diu.edu.bd'))) {
            return res.status(400).json({ error: 'Invalid URL' });
        }
        const base = url.startsWith('https://studentportal.diu.edu.bd') ? 'https://studentportal.diu.edu.bd' : 'https://teacherportal.diu.edu.bd';
        const response = await httpGet(url);
        if (response.status !== 200) {
            return res.status(response.status).send(`<html><body style="font-family:sans-serif;text-align:center;padding:40px;"><h2>Portal unavailable (${response.status})</h2><p>Could not load ${base} from server.</p><a href="${url}" target="_blank">Open externally</a></body></html>`);
        }
        let html = response.body;
        html = html.replace(/(href|src)=\"\//g, '$1="' + base + '/');
        html = html.replace(/(href|src)=\'\//g, "$1='" + base + "/");
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};
