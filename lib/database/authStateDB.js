const path = require('path');
const { Database } = require('./sqlite');

function createAuthStateConfig(config = {}) {
    const authConfig = config?.authSession;
    if (typeof authConfig === 'boolean') {
        return {
            useDatabase: authConfig,
            sessionDir: 'data/sessions',
            dbPath: 'data/DB/auth_state.db'
        };
    }

    return {
        useDatabase: authConfig?.useDatabase === true,
        sessionDir: authConfig?.sessionDir || 'data/sessions',
        dbPath: authConfig?.dbPath || 'data/DB/auth_state.db'
    };
}

async function useSQLiteAuthState(dbPath, baileys, logger) {
    const resolvedDbPath = path.resolve(dbPath);
    const db = new Database(resolvedDbPath);
    const { initAuthCreds, makeCacheableSignalKeyStore, BufferJSON, proto } = baileys;

    db.exec(`
        CREATE TABLE IF NOT EXISTS auth_state_creds (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            data TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS auth_state_keys (
            category TEXT NOT NULL,
            id TEXT NOT NULL,
            data TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (category, id)
        );
    `);

    const credsRow = db.prepare('SELECT data FROM auth_state_creds WHERE id = 1').get();
    const creds = credsRow?.data
        ? JSON.parse(credsRow.data, BufferJSON.reviver)
        : initAuthCreds();

    const baseStore = {
        get: async (type, ids) => {
            const result = {};
            if (!Array.isArray(ids) || ids.length === 0) return result;

            const stmt = db.prepare('SELECT id, data FROM auth_state_keys WHERE category = ? AND id = ?');
            for (const id of ids) {
                const row = stmt.get(type, id);
                if (!row?.data) continue;

                let value = JSON.parse(row.data, BufferJSON.reviver);
                if (type === 'app-state-sync-key' && value) {
                    value = proto.Message.AppStateSyncKeyData.fromObject(value);
                }
                result[id] = value;
            }

            return result;
        },
        set: async (data) => {
            const upsertStmt = db.prepare(`
                INSERT INTO auth_state_keys (category, id, data, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(category, id) DO UPDATE SET
                    data = excluded.data,
                    updated_at = CURRENT_TIMESTAMP
            `);
            const deleteStmt = db.prepare('DELETE FROM auth_state_keys WHERE category = ? AND id = ?');

            const trx = db.transaction((payload) => {
                for (const category in payload) {
                    for (const id in payload[category]) {
                        const value = payload[category][id];
                        if (value === null || value === undefined) {
                            deleteStmt.run(category, id);
                            continue;
                        }
                        upsertStmt.run(category, id, JSON.stringify(value, BufferJSON.replacer));
                    }
                }
            });

            trx(data);
        },
        clear: async () => {
            db.exec('DELETE FROM auth_state_keys');
        }
    };

    const keyStore = makeCacheableSignalKeyStore(baseStore, logger);

    return {
        state: {
            creds,
            keys: keyStore
        },
        saveCreds: async () => {
            const data = JSON.stringify(creds, BufferJSON.replacer);
            db.prepare(`
                INSERT INTO auth_state_creds (id, data, updated_at)
                VALUES (1, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(id) DO UPDATE SET
                    data = excluded.data,
                    updated_at = CURRENT_TIMESTAMP
            `).run(data);
        },
        close: async () => {
            try {
                db.close();
            } catch (error) {
                if (error?.code !== 'SQLITE_MISUSE') {
                    throw error;
                }
            }
        }
    };
}

module.exports = {
    createAuthStateConfig,
    useSQLiteAuthState
};
