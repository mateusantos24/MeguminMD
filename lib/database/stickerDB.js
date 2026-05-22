// lib/database/stickerDB.js
const { Database } = require('./sqlite');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '../../data/DB/stickers.db');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(dbPath);

// Tabela: userLid | packName | publisher | invisible | updatedAt
db.exec(`
    CREATE TABLE IF NOT EXISTS sticker_configs (
      userLid TEXT PRIMARY KEY,
      packName TEXT,
      publisher TEXT,
      invisible INTEGER DEFAULT 0,
      updatedAt INTEGER DEFAULT (strftime('%s', 'now'))
    )
`);

class StickerDB {
    // Retorna config do usuário ou null se não houver customização
    static getSticker(userLid) {
        return new Promise((resolve, reject) => {
            try {
                const row = db.prepare('SELECT * FROM sticker_configs WHERE userLid = ?').get(userLid);
                resolve(row || null);
            } catch (err) {
                reject(err);
            }
        });
    }

    // Define customização (packName, publisher, invisible)
    static setSticker(userLid, { packName = null, publisher = null, invisible = 0 }) {
        return new Promise((resolve, reject) => {
            const now = Math.floor(Date.now() / 1000);
            try {
                db.prepare(`INSERT INTO sticker_configs (userLid, packName, publisher, invisible, updatedAt)
                 VALUES (?, ?, ?, ?, ?)
                 ON CONFLICT(userLid) DO UPDATE SET
                   packName = excluded.packName,
                   publisher = excluded.publisher,
                   invisible = excluded.invisible,
                   updatedAt = excluded.updatedAt`).run(userLid, packName, publisher, invisible, now);
                resolve(true);
            } catch (err) {
                reject(err);
            }
        });
    }

    // Remove config (volta default do bot)
    static clearSticker(userLid) {
        return new Promise((resolve, reject) => {
            try {
                db.prepare('DELETE FROM sticker_configs WHERE userLid = ?').run(userLid);
                resolve(true);
            } catch (err) {
                reject(err);
            }
        });
    }

    // Lista todos os usuários com config custom
    static listAllSticker() {
        return new Promise((resolve, reject) => {
            try {
                const rows = db.prepare('SELECT * FROM sticker_configs ORDER BY updatedAt DESC').all();
                resolve(rows || []);
            } catch (err) {
                reject(err);
            }
        });
    }
}

module.exports = StickerDB;
