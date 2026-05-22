const path = require('path');
const { Database } = require('./sqlite');

const dbPath = path.resolve(__dirname, '../../data/DB/global_command_blocks.db');

class GlobalCommandBlockDB {
    constructor() {
        this.db = new Database(dbPath);
        this.initTables();
    }

    initTables() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS global_command_block_state (
                config_key TEXT PRIMARY KEY,
                config_value TEXT NOT NULL,
                updated_at INTEGER NOT NULL,
                updated_by TEXT
            );
        `);
    }

    readJsonArray(key) {
        const row = this.db.prepare(`
            SELECT config_value
            FROM global_command_block_state
            WHERE config_key = ?
        `).get(String(key || '').trim());

        if (!row?.config_value) return [];

        try {
            const parsed = JSON.parse(row.config_value);
            return Array.isArray(parsed) ? parsed.map((item) => String(item)).filter(Boolean) : [];
        } catch {
            return [];
        }
    }

    writeJsonArray(key, values, updatedBy = null) {
        const normalized = Array.from(new Set((Array.isArray(values) ? values : []).map((item) => String(item)).filter(Boolean)));
        this.db.prepare(`
            INSERT INTO global_command_block_state (config_key, config_value, updated_at, updated_by)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(config_key) DO UPDATE SET
                config_value = excluded.config_value,
                updated_at = excluded.updated_at,
                updated_by = excluded.updated_by
        `).run(
            String(key || '').trim(),
            JSON.stringify(normalized),
            Date.now(),
            updatedBy ? String(updatedBy) : null
        );

        return normalized;
    }

    getBlockedCommands() {
        return this.readJsonArray('blocked_commands');
    }

    getBlockedCategories() {
        return this.readJsonArray('blocked_categories');
    }

    setBlockedCommands(values, updatedBy = null) {
        return this.writeJsonArray('blocked_commands', values, updatedBy);
    }

    setBlockedCategories(values, updatedBy = null) {
        return this.writeJsonArray('blocked_categories', values, updatedBy);
    }
}

module.exports = new GlobalCommandBlockDB();
