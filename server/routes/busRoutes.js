const router = require('express').Router();
const auth = require('../middleware/authMiddleware');

const adminOnly = (req, res, next) => {
    if (req.user?.role !== 'Admin') return res.status(403).json({ message: 'Admin only' });
    next();
};

// 🌍 GLOBAL: Bus schedule visible to all — no auth for read
router.get('/settings', async (req, res) => {
    try{
        await global.db.exec(`CREATE TABLE IF NOT EXISTS bus_settings (id INTEGER PRIMARY KEY, last_update TEXT)`);
        const row=await global.db.get(`SELECT last_update FROM bus_settings WHERE id=1`);
        res.json({ last_update: row?.last_update || 'Spring 2026 semester' });
    }catch(e){ res.status(500).json({message:e.message}); }
});
router.put('/settings', auth, adminOnly, async (req, res) => {
    try{
        await global.db.exec(`CREATE TABLE IF NOT EXISTS bus_settings (id INTEGER PRIMARY KEY, last_update TEXT)`);
        const { last_update } = req.body;
        if(!last_update || !last_update.trim()) return res.status(400).json({message:'last_update required'});
        await global.db.run(`INSERT OR REPLACE INTO bus_settings (id, last_update) VALUES (1, ?)`, [last_update.trim()]);
        res.json({ last_update: last_update.trim() });
    }catch(e){ res.status(500).json({message:e.message}); }
});
router.get('/routes', async (req, res) => {
    try {
        const routes = await global.db.all('SELECT * FROM bus_routes ORDER BY departureTime ASC');
        // Normalize for frontend: map DB columns to friendly names but keep originals
        const normalized = routes.map(r => ({
            id: r.id,
            routeName: r.routeName || r.route || 'DIU Route',
            routeNumber: r.routeNumber || r.busNumber || '',
            busNumber: r.busNumber || r.routeNumber || '',
            pickupPoint: r.pickupPoint || r.from || '',
            dropPoint: r.dropPoint || r.to || '',
            departureTime: r.departureTime || r.time || '',
            returnTime: r.returnTime || r.arrivalTime || '',
            arrivalTime: r.arrivalTime || r.returnTime || '',
            departure: r.departureTime || r.time || '',
            route: r.route || r.routeName || '',
            days: r.days || '',
            stops: r.stops || '',
            driverName: r.driverName || '',
            driverPhone: r.driverPhone || '',
            status: r.status || 'On Time',
            from: r.pickupPoint || r.from || '',
            to: r.dropPoint || r.to || '',
            time: r.departureTime || r.time || ''
        }));
        res.json(normalized);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// POST create route (admin only) — dynamic columns for both old and new schemas
router.post('/routes', auth, adminOnly, async (req, res) => {
    try {
        const { routeName, route, routeNumber, busNumber, pickupPoint, from, dropPoint, to, departureTime, time, returnTime, arrivalTime, stops, driverName, driverPhone, status, days } = req.body;
        const finalRouteName = routeName || route || pickupPoint || from || 'DIU Route';
        const finalDeparture = departureTime || time || route || '';
        if (!finalRouteName || !finalDeparture) return res.status(400).json({ message: 'Bus name/route and time required' });
        // Ensure all possible columns exist
        try{
            const cols=await global.db.all(`PRAGMA table_info(bus_routes)`); const names=cols.map(c=>c.name);
            const needed=[['routeName','TEXT'],['route','TEXT'],['pickupPoint','TEXT'],['dropPoint','TEXT'],['returnTime','TEXT'],['arrivalTime','TEXT'],['driverName','TEXT'],['driverPhone','TEXT'],['status','TEXT'],['routeNumber','TEXT'],['days','TEXT']];
            for(const [col,type] of needed){ if(!names.includes(col)) await global.db.exec(`ALTER TABLE bus_routes ADD COLUMN ${col} ${type}`); }
        }catch{}
        const cols=await global.db.all(`PRAGMA table_info(bus_routes)`).then(r=>r.map(c=>c.name));
        const map={ routeName: finalRouteName, route: finalRouteName, routeNumber: routeNumber || busNumber || '', busNumber: busNumber || routeNumber || '', pickupPoint: pickupPoint || from || '', dropPoint: dropPoint || to || '', departureTime: departureTime || time || '', returnTime: returnTime || arrivalTime || '', arrivalTime: returnTime || arrivalTime || '', stops: stops || '', driverName: driverName || '', driverPhone: driverPhone || '', status: status || 'On Time', days: days || 'Sun-Thu' };
        const insertCols=[]; const insertVals=[];
        for(const [col,val] of Object.entries(map)){ if(cols.includes(col)){ insertCols.push(col); insertVals.push(val); } }
        // Ensure NOT NULL cols for old schema
        if(!insertCols.includes('route') && cols.includes('route')){ insertCols.push('route'); insertVals.push(finalRouteName); }
        if(!insertCols.includes('departureTime') && cols.includes('departureTime')){ insertCols.push('departureTime'); insertVals.push(finalDeparture); }
        const placeholders=insertCols.map(()=>'?').join(',');
        const result=await global.db.run(`INSERT INTO bus_routes (${insertCols.join(',')}) VALUES (${placeholders})`, insertVals);
        const row = await global.db.get('SELECT * FROM bus_routes WHERE id=?', [result.lastID]);
        res.status(201).json(row);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// PUT update route (admin only) — handles both schemas, updates reliably
router.put('/routes/:id', auth, adminOnly, async (req, res) => {
    try {
        const existing = await global.db.get('SELECT * FROM bus_routes WHERE id=?', [req.params.id]);
        if (!existing) return res.status(404).json({ message: 'Route not found' });
        // Ensure new columns exist
        try{ const cols=await global.db.all(`PRAGMA table_info(bus_routes)`); const n=cols.map(c=>c.name); if(!n.includes('routeName')) await global.db.exec(`ALTER TABLE bus_routes ADD COLUMN routeName TEXT`); if(!n.includes('pickupPoint')) await global.db.exec(`ALTER TABLE bus_routes ADD COLUMN pickupPoint TEXT`); if(!n.includes('dropPoint')) await global.db.exec(`ALTER TABLE bus_routes ADD COLUMN dropPoint TEXT`); if(!n.includes('returnTime')) await global.db.exec(`ALTER TABLE bus_routes ADD COLUMN returnTime TEXT`); if(!n.includes('driverName')) await global.db.exec(`ALTER TABLE bus_routes ADD COLUMN driverName TEXT`); if(!n.includes('driverPhone')) await global.db.exec(`ALTER TABLE bus_routes ADD COLUMN driverPhone TEXT`); if(!n.includes('status')) await global.db.exec(`ALTER TABLE bus_routes ADD COLUMN status TEXT DEFAULT 'On Time'`); if(!n.includes('routeNumber')) await global.db.exec(`ALTER TABLE bus_routes ADD COLUMN routeNumber TEXT`); }catch{}
        const { routeName, route, routeNumber, busNumber, pickupPoint, from, dropPoint, to, departureTime, time, returnTime, arrivalTime, stops, driverName, driverPhone, status, days } = req.body;
        const updates=[];
        // Always update both old and new column names for compatibility
        const setBoth = async (newCol, oldCol, val) => {
            if(val===undefined) return;
            try{ await global.db.run(`UPDATE bus_routes SET ${newCol}=? WHERE id=?`, [val, req.params.id]); }catch{}
            try{ await global.db.run(`UPDATE bus_routes SET ${oldCol}=? WHERE id=?`, [val, req.params.id]); }catch{}
            updates.push(`${newCol}=${val}`);
        };
        if(routeName!==undefined || route!==undefined) await setBoth('routeName','route', routeName||route);
        if(routeNumber!==undefined || busNumber!==undefined){ await setBoth('routeNumber','busNumber', routeNumber||busNumber); await setBoth('busNumber','routeNumber', busNumber||routeNumber); }
        if(pickupPoint!==undefined || from!==undefined) await setBoth('pickupPoint','pickupPoint', pickupPoint||from);
        if(dropPoint!==undefined || to!==undefined) await setBoth('dropPoint','dropPoint', dropPoint||to);
        if(departureTime!==undefined || time!==undefined) await setBoth('departureTime','departureTime', departureTime||time);
        if(returnTime!==undefined || arrivalTime!==undefined){ await setBoth('returnTime','arrivalTime', returnTime||arrivalTime); await setBoth('arrivalTime','returnTime', returnTime||arrivalTime); }
        if(stops!==undefined) await setBoth('stops','stops', stops);
        if(driverName!==undefined) await setBoth('driverName','driverName', driverName);
        if(driverPhone!==undefined) await setBoth('driverPhone','driverPhone', driverPhone);
        if(status!==undefined) await setBoth('status','status', status);
        if(days!==undefined) await setBoth('days','days', days);
        if(!updates.length) return res.status(400).json({ message: 'No updates' });
        const updated = await global.db.get('SELECT * FROM bus_routes WHERE id=?', [req.params.id]);
        res.json(updated);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// DELETE route (admin only)
router.delete('/routes/:id', auth, adminOnly, async (req, res) => {
    try {
        await global.db.run('DELETE FROM bus_routes WHERE id=?', [req.params.id]);
        res.json({ message: 'Route deleted' });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
