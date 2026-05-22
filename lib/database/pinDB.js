const path = require('path');
const { Database } = require('./sqlite');

const HISTORY_DEDUPE_WINDOW_MS = 15000;

class PinDB {
    constructor() {
        const dbPath = path.resolve(__dirname, '../../data/DB/pins.db');
        this.db = new Database(dbPath);
        this.initTables();
        this.runMigrations();
    }

    initTables() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS pin_state (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                group_jid TEXT NOT NULL,
                message_id TEXT NOT NULL,
                message_remote_jid TEXT,
                message_participant TEXT,
                message_sender_lid TEXT,
                message_sender_jid TEXT,
                actor_lid TEXT,
                actor_jid TEXT,
                actor_name TEXT,
                duration_seconds INTEGER,
                requested_token TEXT,
                pinned_at INTEGER,
                unpinned_at INTEGER,
                last_action_at INTEGER NOT NULL,
                is_active INTEGER NOT NULL DEFAULT 1,
                UNIQUE(group_jid, message_id)
            );

            CREATE TABLE IF NOT EXISTS pin_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                group_jid TEXT NOT NULL,
                message_id TEXT NOT NULL,
                action TEXT NOT NULL,
                message_remote_jid TEXT,
                message_participant TEXT,
                message_sender_lid TEXT,
                message_sender_jid TEXT,
                actor_lid TEXT,
                actor_jid TEXT,
                actor_name TEXT,
                duration_seconds INTEGER,
                requested_token TEXT,
                event_at INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_pin_state_group_active
            ON pin_state(group_jid, is_active, last_action_at DESC);

            CREATE INDEX IF NOT EXISTS idx_pin_history_group_time
            ON pin_history(group_jid, event_at DESC);
        `);
    }

    runMigrations() {
        this.ensureColumn('pin_state', 'message_remote_jid', 'TEXT');
        this.ensureColumn('pin_state', 'message_participant', 'TEXT');
        this.ensureColumn('pin_state', 'message_sender_lid', 'TEXT');
        this.ensureColumn('pin_state', 'message_sender_jid', 'TEXT');
        this.ensureColumn('pin_state', 'actor_lid', 'TEXT');
        this.ensureColumn('pin_state', 'actor_jid', 'TEXT');
        this.ensureColumn('pin_state', 'actor_name', 'TEXT');
        this.ensureColumn('pin_state', 'duration_seconds', 'INTEGER');
        this.ensureColumn('pin_state', 'requested_token', 'TEXT');
        this.ensureColumn('pin_state', 'pinned_at', 'INTEGER');
        this.ensureColumn('pin_state', 'unpinned_at', 'INTEGER');
        this.ensureColumn('pin_state', 'last_action_at', 'INTEGER');
        this.ensureColumn('pin_state', 'is_active', 'INTEGER NOT NULL DEFAULT 1');

        this.ensureColumn('pin_history', 'message_remote_jid', 'TEXT');
        this.ensureColumn('pin_history', 'message_participant', 'TEXT');
        this.ensureColumn('pin_history', 'message_sender_lid', 'TEXT');
        this.ensureColumn('pin_history', 'message_sender_jid', 'TEXT');
        this.ensureColumn('pin_history', 'actor_lid', 'TEXT');
        this.ensureColumn('pin_history', 'actor_jid', 'TEXT');
        this.ensureColumn('pin_history', 'actor_name', 'TEXT');
        this.ensureColumn('pin_history', 'duration_seconds', 'INTEGER');
        this.ensureColumn('pin_history', 'requested_token', 'TEXT');
        this.ensureColumn('pin_history', 'event_at', 'INTEGER');
    }

    ensureColumn(tableName, columnName, definition) {
        const columns = this.db.prepare(`PRAGMA table_info(${tableName})`).all();
        if (columns.some((column) => column.name === columnName)) return;
        this.db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
    }

    savePin(entry = {}) {
        const now = Number(entry.eventAt) || Date.now();
        const payload = this.normalizeEntry(entry, now);

        this.db.prepare(`
            INSERT INTO pin_state (
                group_jid,
                message_id,
                message_remote_jid,
                message_participant,
                message_sender_lid,
                message_sender_jid,
                actor_lid,
                actor_jid,
                actor_name,
                duration_seconds,
                requested_token,
                pinned_at,
                unpinned_at,
                last_action_at,
                is_active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 1)
            ON CONFLICT(group_jid, message_id) DO UPDATE SET
                message_remote_jid = COALESCE(excluded.message_remote_jid, pin_state.message_remote_jid),
                message_participant = COALESCE(excluded.message_participant, pin_state.message_participant),
                message_sender_lid = COALESCE(excluded.message_sender_lid, pin_state.message_sender_lid),
                message_sender_jid = COALESCE(excluded.message_sender_jid, pin_state.message_sender_jid),
                actor_lid = excluded.actor_lid,
                actor_jid = excluded.actor_jid,
                actor_name = excluded.actor_name,
                duration_seconds = COALESCE(excluded.duration_seconds, pin_state.duration_seconds),
                requested_token = excluded.requested_token,
                pinned_at = COALESCE(excluded.pinned_at, pin_state.pinned_at, excluded.last_action_at),
                unpinned_at = NULL,
                last_action_at = excluded.last_action_at,
                is_active = 1
        `).run(
            payload.groupJid,
            payload.messageId,
            payload.messageRemoteJid,
            payload.messageParticipant,
            payload.messageSenderLid,
            payload.messageSenderJid,
            payload.actorLid,
            payload.actorJid,
            payload.actorName,
            payload.durationSeconds,
            payload.requestedToken,
            payload.pinnedAt || now,
            now
        );

        this.upsertHistory({
            ...payload,
            action: 'pin',
            eventAt: now
        });
    }

    saveUnpin(entry = {}) {
        const now = Number(entry.eventAt) || Date.now();
        const payload = this.normalizeEntry(entry, now);

        this.db.prepare(`
            INSERT INTO pin_state (
                group_jid,
                message_id,
                message_remote_jid,
                message_participant,
                message_sender_lid,
                message_sender_jid,
                actor_lid,
                actor_jid,
                actor_name,
                duration_seconds,
                requested_token,
                pinned_at,
                unpinned_at,
                last_action_at,
                is_active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 0)
            ON CONFLICT(group_jid, message_id) DO UPDATE SET
                message_remote_jid = COALESCE(excluded.message_remote_jid, pin_state.message_remote_jid),
                message_participant = COALESCE(excluded.message_participant, pin_state.message_participant),
                message_sender_lid = COALESCE(excluded.message_sender_lid, pin_state.message_sender_lid),
                message_sender_jid = COALESCE(excluded.message_sender_jid, pin_state.message_sender_jid),
                actor_lid = excluded.actor_lid,
                actor_jid = excluded.actor_jid,
                actor_name = excluded.actor_name,
                duration_seconds = COALESCE(pin_state.duration_seconds, excluded.duration_seconds),
                requested_token = excluded.requested_token,
                unpinned_at = excluded.unpinned_at,
                last_action_at = excluded.last_action_at,
                is_active = 0
        `).run(
            payload.groupJid,
            payload.messageId,
            payload.messageRemoteJid,
            payload.messageParticipant,
            payload.messageSenderLid,
            payload.messageSenderJid,
            payload.actorLid,
            payload.actorJid,
            payload.actorName,
            payload.durationSeconds,
            payload.requestedToken,
            now,
            now
        );

        this.upsertHistory({
            ...payload,
            action: 'unpin',
            eventAt: now
        });
    }

    upsertHistory(entry = {}) {
        const existing = this.db.prepare(`
            SELECT id, event_at
            FROM pin_history
            WHERE group_jid = ?
              AND message_id = ?
              AND action = ?
            ORDER BY event_at DESC
            LIMIT 1
        `).get(entry.groupJid, entry.messageId, entry.action);

        if (existing && Math.abs((Number(entry.eventAt) || 0) - (Number(existing.event_at) || 0)) <= HISTORY_DEDUPE_WINDOW_MS) {
            this.db.prepare(`
                UPDATE pin_history
                SET message_remote_jid = COALESCE(?, message_remote_jid),
                    message_participant = COALESCE(?, message_participant),
                    message_sender_lid = COALESCE(?, message_sender_lid),
                    message_sender_jid = COALESCE(?, message_sender_jid),
                    actor_lid = ?,
                    actor_jid = ?,
                    actor_name = ?,
                    duration_seconds = COALESCE(?, duration_seconds),
                    requested_token = ?,
                    event_at = ?
                WHERE id = ?
            `).run(
                entry.messageRemoteJid,
                entry.messageParticipant,
                entry.messageSenderLid,
                entry.messageSenderJid,
                entry.actorLid,
                entry.actorJid,
                entry.actorName,
                entry.durationSeconds,
                entry.requestedToken,
                entry.eventAt,
                existing.id
            );
            return existing.id;
        }

        const result = this.db.prepare(`
            INSERT INTO pin_history (
                group_jid,
                message_id,
                action,
                message_remote_jid,
                message_participant,
                message_sender_lid,
                message_sender_jid,
                actor_lid,
                actor_jid,
                actor_name,
                duration_seconds,
                requested_token,
                event_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            entry.groupJid,
            entry.messageId,
            entry.action,
            entry.messageRemoteJid,
            entry.messageParticipant,
            entry.messageSenderLid,
            entry.messageSenderJid,
            entry.actorLid,
            entry.actorJid,
            entry.actorName,
            entry.durationSeconds,
            entry.requestedToken,
            entry.eventAt
        );

        return result.lastInsertRowid || null;
    }

    cleanupExpiredPins(groupJid = null, now = Date.now()) {
        if (groupJid) {
            return this.db.prepare(`
                UPDATE pin_state
                SET is_active = 0,
                    last_action_at = CASE WHEN last_action_at < ? THEN ? ELSE last_action_at END
                WHERE group_jid = ?
                  AND is_active = 1
                  AND unpinned_at IS NULL
                  AND pinned_at IS NOT NULL
                  AND duration_seconds IS NOT NULL
                  AND duration_seconds > 0
                  AND (pinned_at + (duration_seconds * 1000)) <= ?
            `).run(now, now, groupJid, now).changes || 0;
        }

        return this.db.prepare(`
            UPDATE pin_state
            SET is_active = 0,
                last_action_at = CASE WHEN last_action_at < ? THEN ? ELSE last_action_at END
            WHERE is_active = 1
              AND unpinned_at IS NULL
              AND pinned_at IS NOT NULL
              AND duration_seconds IS NOT NULL
              AND duration_seconds > 0
              AND (pinned_at + (duration_seconds * 1000)) <= ?
        `).run(now, now, now).changes || 0;
    }

    getHistoryByGroup(groupJid, limit = 10) {
        this.cleanupExpiredPins(groupJid);
        return this.db.prepare(`
            SELECT *
            FROM pin_history
            WHERE group_jid = ?
            ORDER BY event_at DESC
            LIMIT ?
        `).all(groupJid, Number(limit) || 10);
    }

    getActivePins(groupJid, limit = 10) {
        this.cleanupExpiredPins(groupJid);
        return this.db.prepare(`
            SELECT *
            FROM pin_state
            WHERE group_jid = ? AND is_active = 1
            ORDER BY last_action_at DESC
            LIMIT ?
        `).all(groupJid, Number(limit) || 10);
    }

    getRecentPins(groupJid, limit = 10) {
        this.cleanupExpiredPins(groupJid);
        return this.db.prepare(`
            SELECT *
            FROM pin_state
            WHERE group_jid = ?
            ORDER BY last_action_at DESC
            LIMIT ?
        `).all(groupJid, Number(limit) || 10);
    }

    getPinStateById(groupJid, stateId) {
        this.cleanupExpiredPins(groupJid);
        return this.db.prepare(`
            SELECT *
            FROM pin_state
            WHERE group_jid = ? AND id = ?
            LIMIT 1
        `).get(groupJid, Number(stateId) || 0);
    }

    getPinStateByMessageId(groupJid, messageId) {
        this.cleanupExpiredPins(groupJid);
        return this.db.prepare(`
            SELECT *
            FROM pin_state
            WHERE group_jid = ? AND message_id = ?
            LIMIT 1
        `).get(groupJid, messageId);
    }

    normalizeEntry(entry, fallbackNow) {
        return {
            groupJid: this.clean(entry.groupJid),
            messageId: this.clean(entry.messageId),
            messageRemoteJid: this.clean(entry.messageRemoteJid),
            messageParticipant: this.clean(entry.messageParticipant),
            messageSenderLid: this.clean(entry.messageSenderLid),
            messageSenderJid: this.clean(entry.messageSenderJid),
            actorLid: this.clean(entry.actorLid),
            actorJid: this.clean(entry.actorJid),
            actorName: this.clean(entry.actorName) || 'Desconhecido',
            durationSeconds: this.toNullableInt(entry.durationSeconds),
            requestedToken: this.clean(entry.requestedToken),
            pinnedAt: this.toNullableInt(entry.pinnedAt),
            eventAt: Number(entry.eventAt) || fallbackNow || Date.now()
        };
    }

    clean(value) {
        if (value === undefined || value === null) return null;
        const text = String(value).trim();
        return text || null;
    }

    toNullableInt(value) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
}

module.exports = new PinDB();
