const { MongoClient } = require('mongodb');

/**
 * MongoDB Cloud Adapter
 * Translates application DB queries into MongoDB collection operations
 * so that all existing routes/controllers work with MongoDB Atlas without modifications.
 */
class MongoCloudAdapter {
    constructor(client, db) {
        this.client = client;
        this.db = db;
        this.isMongo = true;
        this.counters = db.collection('__counters');
    }

    async getNextSequence(name) {
        const ret = await this.counters.findOneAndUpdate(
            { _id: name },
            { $inc: { seq: 1 } },
            { upsert: true, returnDocument: 'after' }
        );
        return ret.seq || (ret.value ? ret.value.seq : 1);
    }

    async get(sql, params = []) {
        const rows = await this.all(sql, params);
        return rows.length ? rows[0] : null;
    }

    async all(sql, params = []) {
        const trimmed = sql.trim();
        
        // Handle SELECT COUNT(*)
        const countMatch = trimmed.match(/SELECT\s+COUNT\(\*\)\s+as\s+([a-zA-Z0-9_]+)\s+FROM\s+([a-zA-Z0-9_]+)(?:\s+WHERE\s+(.+))?/i);
        if (countMatch) {
            const alias = countMatch[1] || 'count';
            const table = countMatch[2];
            const whereClause = countMatch[3];
            const filter = this._buildFilter(whereClause, [...params]);
            const count = await this.db.collection(table).countDocuments(filter);
            return [{ [alias]: count, count }];
        }

        // Handle SELECT with JOIN - manual population for MongoDB
        // Supports: SELECT p.*, u.fullName FROM posts p JOIN users u ON p.user_id = u.id WHERE ...
        const joinMatch = trimmed.match(/SELECT\s+([\s\S]+?)\s+FROM\s+([a-zA-Z0-9_]+)\s+([a-zA-Z0-9_]+)?\s*JOIN\s+([a-zA-Z0-9_]+)\s+([a-zA-Z0-9_]+)?\s+ON\s+([a-zA-Z0-9_.]+)\s*=\s*([a-zA-Z0-9_.]+)([\s\S]*)/i);
        if (joinMatch) {
            const fieldsStr = joinMatch[1];
            const mainTable = joinMatch[2];
            const mainAlias = joinMatch[3] || mainTable;
            const joinTable = joinMatch[4];
            const joinAlias = joinMatch[5] || joinTable;
            const leftCol = joinMatch[6]; // e.g., p.user_id
            const rightCol = joinMatch[7]; // e.g., u.id
            const rest = joinMatch[8] || '';

            // Build filter from WHERE clause (remove alias prefixes for main table)
            let filter = {};
            const whereMatch = rest.match(/WHERE\s+([\s\S]+?)(?:\s+ORDER\s+BY|\s+LIMIT|\s+GROUP\s+BY|$)/i);
            if (whereMatch) {
                // For JOIN queries, we need to handle WHERE that may reference both tables
                // Simplify: extract main table conditions only
                const whereStr = whereMatch[1];
                // Split and keep only conditions that reference main table or are simple
                const conditions = whereStr.split(/\s+AND\s+/i).filter(c => {
                    // Keep conditions that don't reference joined table alias exclusively
                    // If condition has joinAlias., skip for now (will filter after join)
                    if (new RegExp(`\\b${joinAlias}\\.`, 'i').test(c) && !new RegExp(`\\b${mainAlias}\\.`, 'i').test(c)) return false;
                    return true;
                }).join(' AND ');
                if (conditions.trim()) {
                    filter = this._buildFilter(conditions, [...params]);
                    // Remove alias prefixes for filter building
                    const cleanConditions = conditions.replace(new RegExp(`\\b${mainAlias}\\.`, 'g'), '');
                    filter = this._buildFilter(cleanConditions, [...params]);
                }
            }

            let cursor = this.db.collection(mainTable).find(filter);

            // ORDER BY - handle main table fields
            const orderMatch = rest.match(/ORDER\s+BY\s+([a-zA-Z0-9_.]+)(?:\s+(ASC|DESC))?/i);
            if (orderMatch) {
                const fieldRaw = orderMatch[1];
                // Only sort if it's from main table
                if (fieldRaw.startsWith(mainAlias + '.') || !fieldRaw.includes('.')) {
                    const field = fieldRaw.replace(/^[a-zA-Z0-9_]+\./, '');
                    const dir = (orderMatch[2] || 'ASC').toUpperCase() === 'DESC' ? -1 : 1;
                    cursor = cursor.sort({ [field]: dir });
                }
            }

            // LIMIT/OFFSET
            const limitMatch = rest.match(/LIMIT\s+(\d+|\?)(?:\s+OFFSET\s+(\d+|\?))?/i);
            if (limitMatch) {
                // Clone params to avoid mutation
                const paramsCopy = [...params];
                let limitVal = limitMatch[1] === '?' ? Number(paramsCopy.pop()) : Number(limitMatch[1]);
                let offsetVal = limitMatch[2] ? (limitMatch[2] === '?' ? Number(paramsCopy.pop()) : Number(limitMatch[2])) : 0;
                if (!isNaN(offsetVal) && offsetVal > 0) cursor = cursor.skip(offsetVal);
                if (!isNaN(limitVal) && limitVal > 0) cursor = cursor.limit(limitVal);
            }

            let results = await cursor.toArray();
            results = results.map(doc => {
                if (doc.id === undefined && doc._id !== undefined) doc.id = doc._id;
                return doc;
            });

            // Manual JOIN: populate joined table data
            const leftField = leftCol.split('.').pop(); // e.g., user_id
            const rightField = rightCol.split('.').pop(); // e.g., id
            // Determine which side is main table
            const isLeftMain = leftCol.startsWith(mainAlias + '.');
            const mainField = isLeftMain ? leftField : rightField;
            const joinField = isLeftMain ? rightField : leftField;

            // Batch fetch joined docs
            const joinIds = [...new Set(results.map(r => r[mainField]).filter(v => v != null))];
            let joinMap = new Map();
            if (joinIds.length > 0) {
                // Handle both number and string IDs
                const joinDocs = await this.db.collection(joinTable).find({ 
                    [joinField]: { $in: joinIds } 
                }).toArray();
                // Also try with string/number conversion
                if (joinDocs.length === 0 && joinIds.length > 0) {
                    const altIds = joinIds.map(id => isNaN(id) ? id : Number(id));
                    const altDocs = await this.db.collection(joinTable).find({ 
                        [joinField]: { $in: altIds } 
                    }).toArray();
                    altDocs.forEach(d => joinMap.set(String(d[joinField]), d));
                } else {
                    joinDocs.forEach(d => joinMap.set(String(d[joinField]), d));
                }
            }

            // Merge results
            return results.map(mainDoc => {
                const key = String(mainDoc[mainField]);
                const joinedDoc = joinMap.get(key);
                if (joinedDoc) {
                    // Merge fields - prefix handling
                    const merged = { ...mainDoc };
                    // Add joined table fields with their original names and also with alias
                    for (const [k, v] of Object.entries(joinedDoc)) {
                        if (k === 'id' || k === '_id') continue; // keep main id
                        // Add as plain field if not exists (e.g., fullName, profilePicture)
                        if (merged[k] === undefined) merged[k] = v;
                        // Also add with alias prefix if needed
                        merged[`${joinAlias}_${k}`] = v;
                        merged[`${joinTable}_${k}`] = v;
                    }
                    // Special handling for common fields
                    if (joinedDoc.fullName && !merged.fullName) merged.fullName = joinedDoc.fullName;
                    if (joinedDoc.profilePicture && !merged.profilePicture) merged.profilePicture = joinedDoc.profilePicture;
                    if (joinedDoc.email && !merged.email) merged.email = joinedDoc.email;
                    return merged;
                }
                return mainDoc;
            });
        }

        // Handle SELECT without JOIN
        const selectMatch = trimmed.match(/SELECT\s+([\s\S]+?)\s+FROM\s+([a-zA-Z0-9_]+)([\s\S]*)/i);
        if (!selectMatch) {
            return [];
        }

        const fieldsStr = selectMatch[1];
        const table = selectMatch[2];
        const rest = selectMatch[3] || '';

        // Extract WHERE
        let filter = {};
        const whereMatch = rest.match(/WHERE\s+([\s\S]+?)(?:\s+ORDER\s+BY|\s+LIMIT|\s+GROUP\s+BY|$)/i);
        if (whereMatch) {
            filter = this._buildFilter(whereMatch[1], [...params]);
        }

        let cursor = this.db.collection(table).find(filter);

        // Extract ORDER BY
        const orderMatch = rest.match(/ORDER\s+BY\s+([a-zA-Z0-9_.]+)(?:\s+(ASC|DESC))?/i);
        if (orderMatch) {
            const field = orderMatch[1].replace(/^[a-zA-Z0-9_]+\./, '');
            const dir = (orderMatch[2] || 'ASC').toUpperCase() === 'DESC' ? -1 : 1;
            cursor = cursor.sort({ [field]: dir });
        }

        // Extract LIMIT & OFFSET - use copy of params to avoid mutation
        const limitMatch = rest.match(/LIMIT\s+(\d+|\?)(?:\s+OFFSET\s+(\d+|\?))?/i);
        if (limitMatch) {
            const paramsCopy = [...params];
            let limitVal = limitMatch[1] === '?' ? Number(paramsCopy.pop()) : Number(limitMatch[1]);
            let offsetVal = limitMatch[2] ? (limitMatch[2] === '?' ? Number(paramsCopy.pop()) : Number(limitMatch[2])) : 0;
            if (!isNaN(offsetVal) && offsetVal > 0) cursor = cursor.skip(offsetVal);
            if (!isNaN(limitVal) && limitVal > 0) cursor = cursor.limit(limitVal);
        }

        const results = await cursor.toArray();
        // Normalize _id to id if needed
        return results.map(doc => {
            if (doc.id === undefined && doc._id !== undefined) doc.id = doc._id;
            return doc;
        });
    }

    async run(sql, params = []) {
        const trimmed = sql.trim();

        // INSERT INTO table (cols...) VALUES (?,?...)
        const insertMatch = trimmed.match(/^INSERT\s+INTO\s+([a-zA-Z0-9_]+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
        if (insertMatch) {
            const table = insertMatch[1];
            const cols = insertMatch[2].split(',').map(c => c.trim());
            const doc = {};
            
            // Assign sequential integer ID
            const newId = await this.getNextSequence(table);
            doc.id = newId;
            doc._id = newId;

            cols.forEach((col, idx) => {
                doc[col] = params[idx] !== undefined ? params[idx] : null;
            });

            if (!doc.created_at && !doc.createdAt) {
                doc.created_at = new Date().toISOString();
                doc.createdAt = doc.created_at;
            }

            await this.db.collection(table).insertOne(doc);
            return { lastID: newId, changes: 1 };
        }

        // UPDATE table SET col1=?, col2=? WHERE ...
        const updateMatch = trimmed.match(/^UPDATE\s+([a-zA-Z0-9_]+)\s+SET\s+([\s\S]+?)\s+WHERE\s+([\s\S]+)$/i);
        if (updateMatch) {
            const table = updateMatch[1];
            const setStr = updateMatch[2];
            const whereStr = updateMatch[3];

            const setParts = setStr.split(',').map(s => s.trim());
            const updateDoc = {};
            let paramIdx = 0;

            for (const part of setParts) {
                const colMatch = part.match(/^([a-zA-Z0-9_]+)\s*=\s*(?:COALESCE\(\?,[a-zA-Z0-9_]+\)|\?)/i);
                if (colMatch) {
                    const col = colMatch[1];
                    const val = params[paramIdx++];
                    if (val !== undefined && val !== null) {
                        updateDoc[col] = val;
                    }
                }
            }

            const remainingParams = params.slice(paramIdx);
            const filter = this._buildFilter(whereStr, remainingParams);
            const res = await this.db.collection(table).updateMany(filter, { $set: updateDoc });
            return { changes: res.modifiedCount };
        }

        // DELETE FROM table WHERE ...
        const deleteMatch = trimmed.match(/^DELETE\s+FROM\s+([a-zA-Z0-9_]+)(?:\s+WHERE\s+([\s\S]+))?$/i);
        if (deleteMatch) {
            const table = deleteMatch[1];
            const whereStr = deleteMatch[2];
            const filter = whereStr ? this._buildFilter(whereStr, params) : {};
            const res = await this.db.collection(table).deleteMany(filter);
            return { changes: res.deletedCount };
        }

        return { changes: 0 };
    }

    async exec(sql) {
        // Schema creation placeholder for MongoDB (schema-less)
        return true;
    }

    _buildFilter(whereClause, params) {
        if (!whereClause) return {};
        const filter = {};
        let pIdx = 0;

        // Split by AND
        const conditions = whereClause.split(/\s+AND\s+/i);
        for (const cond of conditions) {
            const clean = cond.trim();
            // col = ?
            const eqMatch = clean.match(/^([a-zA-Z0-9_.]+)\s*=\s*\?/);
            if (eqMatch) {
                const field = eqMatch[1].replace(/^[a-zA-Z0-9_]+\./, '');
                let val = params[pIdx++];
                // if comparing id or _id, check both number and string
                if (field === 'id' || field === '_id' || field.endsWith('_id')) {
                    if (!isNaN(val) && typeof val !== 'boolean') val = Number(val);
                }
                filter[field] = val;
                continue;
            }

            // col != ?
            const neMatch = clean.match(/^([a-zA-Z0-9_.]+)\s*!=\s*\?/);
            if (neMatch) {
                const field = neMatch[1].replace(/^[a-zA-Z0-9_]+\./, '');
                let val = params[pIdx++];
                if (field === 'id' || field === '_id' || field.endsWith('_id')) {
                    if (!isNaN(val)) val = Number(val);
                }
                filter[field] = { $ne: val };
                continue;
            }

            // col LIKE ?
            const likeMatch = clean.match(/^([a-zA-Z0-9_.]+)\s+LIKE\s+\?/i);
            if (likeMatch) {
                const field = likeMatch[1].replace(/^[a-zA-Z0-9_]+\./, '');
                const val = String(params[pIdx++] || '').replace(/%/g, '');
                filter[field] = { $regex: val, $options: 'i' };
                continue;
            }
        }
        return filter;
    }
}

module.exports = { MongoCloudAdapter };
