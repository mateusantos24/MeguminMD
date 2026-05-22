const path = require('path');
const { Database } = require('./sqlite');

const dbPath = path.resolve(__dirname, '../../data/DB/whatsapp_restriction.db');

class WhatsAppRestrictionDB {
    constructor() {
        this.db = new Database(dbPath);
        this.initTables();
    }

    initTables() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS whatsapp_restriction_state (
                singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
                state_json TEXT NOT NULL,
                maintenance_active INTEGER DEFAULT 0,
                maintenance_reason TEXT,
                first_detected_at INTEGER,
                active_since INTEGER,
                resolved_at INTEGER,
                last_changed_at INTEGER,
                last_updated_at INTEGER,
                last_alert_at INTEGER,
                blocked_attempts_total INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS whatsapp_restriction_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type TEXT NOT NULL,
                summary TEXT,
                payload_json TEXT,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS whatsapp_restriction_blocked_attempts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                command_name TEXT NOT NULL,
                chat_id TEXT,
                user_lid TEXT,
                user_jid TEXT,
                push_name TEXT,
                blocked_reason TEXT,
                created_at INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_wa_restriction_events_created_at
                ON whatsapp_restriction_events(created_at DESC);

            CREATE INDEX IF NOT EXISTS idx_wa_restriction_blocked_created_at
                ON whatsapp_restriction_blocked_attempts(created_at DESC);
        `);
    }

    parseJson(text, fallback = null) {
        if (!text) return fallback;
        try {
            return JSON.parse(text);
        } catch {
            return fallback;
        }
    }

    getCurrentState() {
        const row = this.db.prepare(`
            SELECT *
            FROM whatsapp_restriction_state
            WHERE singleton_id = 1
        `).get();

        if (!row) return null;

        return {
            state: this.parseJson(row.state_json, null),
            maintenanceActive: Number(row.maintenance_active || 0) === 1,
            maintenanceReason: row.maintenance_reason || '',
            firstDetectedAt: Number(row.first_detected_at || 0) || null,
            activeSince: Number(row.active_since || 0) || null,
            resolvedAt: Number(row.resolved_at || 0) || null,
            lastChangedAt: Number(row.last_changed_at || 0) || null,
            lastUpdatedAt: Number(row.last_updated_at || 0) || null,
            lastAlertAt: Number(row.last_alert_at || 0) || null,
            blockedAttemptsTotal: Number(row.blocked_attempts_total || 0) || 0
        };
    }

    upsertCurrentState({
        state,
        maintenanceActive = false,
        maintenanceReason = '',
        firstDetectedAt = null,
        activeSince = null,
        resolvedAt = null,
        lastChangedAt = null,
        lastUpdatedAt = Date.now(),
        lastAlertAt = null,
        blockedAttemptsTotal = 0
    }) {
        this.db.prepare(`
            INSERT INTO whatsapp_restriction_state (
                singleton_id,
                state_json,
                maintenance_active,
                maintenance_reason,
                first_detected_at,
                active_since,
                resolved_at,
                last_changed_at,
                last_updated_at,
                last_alert_at,
                blocked_attempts_total
            )
            VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(singleton_id) DO UPDATE SET
                state_json = excluded.state_json,
                maintenance_active = excluded.maintenance_active,
                maintenance_reason = excluded.maintenance_reason,
                first_detected_at = excluded.first_detected_at,
                active_since = excluded.active_since,
                resolved_at = excluded.resolved_at,
                last_changed_at = excluded.last_changed_at,
                last_updated_at = excluded.last_updated_at,
                last_alert_at = COALESCE(excluded.last_alert_at, whatsapp_restriction_state.last_alert_at),
                blocked_attempts_total = excluded.blocked_attempts_total
        `).run(
            JSON.stringify(state || {}),
            maintenanceActive ? 1 : 0,
            maintenanceReason || '',
            firstDetectedAt || null,
            activeSince || null,
            resolvedAt || null,
            lastChangedAt || null,
            lastUpdatedAt || Date.now(),
            lastAlertAt || null,
            Number(blockedAttemptsTotal || 0)
        );

        return this.getCurrentState();
    }

    updateLastAlertAt(lastAlertAt = Date.now()) {
        this.db.prepare(`
            INSERT INTO whatsapp_restriction_state (singleton_id, state_json, last_updated_at, last_alert_at)
            VALUES (1, '{}', ?, ?)
            ON CONFLICT(singleton_id) DO UPDATE SET
                last_alert_at = excluded.last_alert_at,
                last_updated_at = CASE
                    WHEN excluded.last_updated_at > whatsapp_restriction_state.last_updated_at
                    THEN excluded.last_updated_at
                    ELSE whatsapp_restriction_state.last_updated_at
                END
        `).run(lastAlertAt, lastAlertAt);

        return this.getCurrentState();
    }

    addEvent(eventType, summary = '', payload = null, createdAt = Date.now()) {
        this.db.prepare(`
            INSERT INTO whatsapp_restriction_events (
                event_type,
                summary,
                payload_json,
                created_at
            )
            VALUES (?, ?, ?, ?)
        `).run(
            String(eventType || '').trim() || 'unknown',
            summary ? String(summary) : null,
            payload == null ? null : JSON.stringify(payload),
            Number(createdAt || Date.now())
        );
    }

    listEvents(limit = 10) {
        return this.db.prepare(`
            SELECT *
            FROM whatsapp_restriction_events
            ORDER BY created_at DESC, id DESC
            LIMIT ?
        `).all(Math.max(1, Number(limit || 10))).map((row) => ({
            id: row.id,
            eventType: row.event_type,
            summary: row.summary || '',
            payload: this.parseJson(row.payload_json, null),
            createdAt: Number(row.created_at || 0) || null
        }));
    }

    addBlockedAttempt({
        commandName,
        chatId = null,
        userLid = null,
        userJid = null,
        pushName = null,
        blockedReason = ''
    }) {
        const now = Date.now();
        this.db.prepare(`
            INSERT INTO whatsapp_restriction_blocked_attempts (
                command_name,
                chat_id,
                user_lid,
                user_jid,
                push_name,
                blocked_reason,
                created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
            String(commandName || '').trim(),
            chatId ? String(chatId) : null,
            userLid ? String(userLid) : null,
            userJid ? String(userJid) : null,
            pushName ? String(pushName) : null,
            blockedReason ? String(blockedReason) : null,
            now
        );

        this.db.prepare(`
            INSERT INTO whatsapp_restriction_state (singleton_id, state_json, last_updated_at, blocked_attempts_total)
            VALUES (1, '{}', ?, 1)
            ON CONFLICT(singleton_id) DO UPDATE SET
                blocked_attempts_total = whatsapp_restriction_state.blocked_attempts_total + 1,
                last_updated_at = CASE
                    WHEN excluded.last_updated_at > whatsapp_restriction_state.last_updated_at
                    THEN excluded.last_updated_at
                    ELSE whatsapp_restriction_state.last_updated_at
                END
        `).run(now);
    }

    listBlockedAttempts(limit = 10) {
        return this.db.prepare(`
            SELECT *
            FROM whatsapp_restriction_blocked_attempts
            ORDER BY created_at DESC, id DESC
            LIMIT ?
        `).all(Math.max(1, Number(limit || 10))).map((row) => ({
            id: row.id,
            commandName: row.command_name,
            chatId: row.chat_id || null,
            userLid: row.user_lid || null,
            userJid: row.user_jid || null,
            pushName: row.push_name || null,
            blockedReason: row.blocked_reason || '',
            createdAt: Number(row.created_at || 0) || null
        }));
    }
}

module.exports = new WhatsAppRestrictionDB();
