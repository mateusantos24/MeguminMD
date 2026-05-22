// lib/database/conta.js
const { Database } = require('./sqlite');
const path = require('path');
const config = require('../../config/config');
const jidNormalizer = require('../utils/jidNormalizer');

const dbPath = path.resolve(__dirname, '../../data/DB/conta.db');
const db = new Database(dbPath);

// ✅ Estrutura simplificada apenas com userLid
db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS conta (
        userLid TEXT NOT NULL,
        pushname TEXT,
        pushnamedisplay TEXT,
        fromChat TEXT NOT NULL,
        message INTEGER DEFAULT 0,
        command INTEGER DEFAULT 0,
        streak INTEGER DEFAULT 0,
        tipos TEXT,
        lastInteraction INTEGER,
        PRIMARY KEY (userLid, fromChat)
    );
`);

function normalizeUserId(x) {
    const rules = config?.jidRules || {};
    return jidNormalizer.normalizeByRules(x, rules);
}

function buildUserCandidates(userId) {
    const rules = config?.jidRules || {};
    const normalized = normalizeUserId(userId);
    return [normalized, ...jidNormalizer.buildCandidates(userId, rules)]
        .map(v => String(v || '').toLowerCase().trim())
        .filter(Boolean)
        .filter((value, index, arr) => arr.indexOf(value) === index);
}

/**
 * Adiciona ou atualiza um usuário com base no LID
 */
function addOrUpdateUser(userLid, pushname, pushnamedisplay, fromChat, isCommand) {
    return new Promise((resolve, reject) => {
        const now = Date.now();

        // Normaliza origem
        let normalizedFrom = fromChat || '';
        const isGroup = normalizedFrom.endsWith('@g.us');
        if (!isGroup) normalizedFrom = 'PV';

        const candidates = buildUserCandidates(userLid);
        const candidateLid = candidates[0] || null;
        if (!candidateLid) return resolve({ ignored: true, reason: 'invalid-userid', fromChat: normalizedFrom });

        // Tenta localizar linha existente
        try {
            let row = null;
            for (const cand of candidates) {
                row = db.prepare(`SELECT * FROM conta WHERE LOWER(userLid) = ? AND fromChat = ? LIMIT 1`).get(cand, normalizedFrom);
                if (row) break;
            }
            const exists = !!row;
            const storageUserId = row?.userLid || candidateLid;
            const nextMessage = (row?.message || 0) + 1;
            const nextCommand = (row?.command || 0) + (isCommand ? 1 : 0);
            const nextStreak = row?.streak || 1;
            const tipos = isGroup ? 'Grupos' : 'PV';

            if (exists) {
                db.prepare(`UPDATE conta SET pushname = COALESCE(?, pushname), pushnamedisplay = COALESCE(?, pushnamedisplay), message = ?, command = ?, streak = ?, tipos = ?, lastInteraction = ? WHERE userLid = ? AND fromChat = ?`)
                    .run(
                        pushname || null,
                        pushnamedisplay || null,
                        nextMessage,
                        nextCommand,
                        nextStreak,
                        tipos,
                        now,
                        storageUserId,
                        normalizedFrom
                    );
                resolve({
                    status: 'updated',
                    userLid: storageUserId,
                    fromChat: normalizedFrom,
                    message: nextMessage,
                    command: nextCommand,
                    streak: nextStreak
                });
            } else {
                db.prepare(`INSERT INTO conta (userLid, pushname, pushnamedisplay, fromChat, message, command, streak, tipos, lastInteraction) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
                    .run(
                        storageUserId,
                        pushname || null,
                        pushnamedisplay || null,
                        normalizedFrom,
                        1,
                        isCommand ? 1 : 0,
                        1,
                        tipos,
                        now
                    );
                resolve({
                    status: 'created',
                    userLid: storageUserId,
                    fromChat: normalizedFrom,
                    message: 1,
                    command: isCommand ? 1 : 0,
                    streak: 1
                });
            }
        } catch (e2) {
            reject(e2);
        }
    });
}

/**
 * Busca flexível (LID apenas)
 */
function getUserFlexible(userIdentifier, from) {
    return new Promise((resolve, reject) => {
        // Tenta parsear caso seja JSON
        let lid = userIdentifier;
        if (typeof userIdentifier === 'string') {
            try {
                const parsed = JSON.parse(userIdentifier);
                lid = parsed.lid || parsed.id || userIdentifier;
            } catch {
                // não é JSON, mantém como string normal
                lid = userIdentifier;
            }
        } else if (typeof userIdentifier === 'object') {
            lid = userIdentifier.lid || userIdentifier.id || null;
        }

        if (!lid || typeof lid !== 'string') return resolve(null);
        const normalizedIdentifier = lid.toLowerCase().trim();
        const chatFrom = from?.endsWith('@g.us') ? from : 'PV';

        try {
            const cands = [normalizedIdentifier, ...jidNormalizer.buildCandidates(normalizedIdentifier, { allowLidPn: true })]
                .map(v => String(v).toLowerCase())
                .filter(Boolean);
            const a = cands[0] || normalizedIdentifier;
            const b = cands[1] || a;
            const row = db.prepare(`SELECT * FROM conta WHERE (LOWER(userLid) = ? OR LOWER(userLid) = ?) AND fromChat = ? LIMIT 1`)
                .get(a, b, chatFrom);
            resolve(row || null);
        } catch (err) {
            reject(err);
        }
    });
}

/**
 * Busca participante por LID em array de participantes
 */
function getUserFlexibleParticipant(participants, from) {
    return new Promise((resolve, reject) => {
        if (!Array.isArray(participants) || participants.length === 0) return reject('participants inválido ou vazio.');

        let userIdentifier = participants[0];

        // 🔹 Se for string JSON, tenta parsear
        if (typeof userIdentifier === 'string') {
            try {
                const parsed = JSON.parse(userIdentifier);
                userIdentifier = parsed.lid || parsed.id || userIdentifier;
            } catch {
                // não é JSON, mantém a string
            }
        } else if (typeof userIdentifier === 'object') {
            userIdentifier = userIdentifier.lid || userIdentifier.id || null;
        }

        if (!userIdentifier || typeof userIdentifier !== 'string') return reject('participants sem id/lid');

        const normalizedIdentifier = userIdentifier.toLowerCase().trim();
        const chatFrom = from?.endsWith('@g.us') ? from : 'PV';

        try {
            const cands = [normalizedIdentifier, ...jidNormalizer.buildCandidates(normalizedIdentifier, { allowLidPn: true })]
                .map(v => String(v).toLowerCase())
                .filter(Boolean);
            const a = cands[0] || normalizedIdentifier;
            const b = cands[1] || a;
            const row = db.prepare(`SELECT * FROM conta WHERE (LOWER(userLid) = ? OR LOWER(userLid) = ?) AND fromChat = ? LIMIT 1`)
                .get(a, b, chatFrom);
            resolve(row || null);
        } catch (err) {
            console.error('[DEBUG] Erro DB getUserFlexibleParticipant:', err);
            reject(err);
        }
    });
}

/**
 * Ranking dos usuários de um chat
 */
function getRanking(from, limit = 10) {
    return new Promise((resolve, reject) => {
        const normalizedFrom = from?.toLowerCase().trim() || 'PV';
        try {
            const rows = db.prepare(`SELECT userLid, pushname, message, streak, command FROM conta WHERE LOWER(fromChat) = ? ORDER BY message DESC LIMIT ?`)
                .all(normalizedFrom, limit);
            resolve(rows);
        } catch (err) {
            reject(err);
        }
    });
}

function getRankingCommands(from, limit = 10) {
    return new Promise((resolve, reject) => {
        const normalizedFrom = from?.toLowerCase().trim() || 'PV';
        try {
            const rows = db.prepare(`SELECT userLid, pushname, message, streak, command FROM conta WHERE LOWER(fromChat) = ? ORDER BY command DESC LIMIT ?`)
                .all(normalizedFrom, limit);
            resolve(rows);
        } catch (err) {
            reject(err);
        }
    });
}

/**
 * Lista todos os registros
 */
function getAllEntries() {
    return new Promise((resolve, reject) => {
        try {
            const rows = db.prepare(`SELECT userLid, pushname, message, command, streak, tipos, fromChat FROM conta ORDER BY message DESC`).all();
            resolve(rows || []);
        } catch (err) {
            reject(err);
        }
    });
}

/**
 * Adiciona contagem específica para um usuário (cheat)
 */
function addCheatConta(userLid, pushname, pushnamedisplay, fromChat, tipo, value) {
    return new Promise((resolve, reject) => {
        const now = Date.now();

        // Normaliza origem
        let normalizedFrom = fromChat || '';
        if (!normalizedFrom.endsWith('@g.us')) normalizedFrom = 'PV';

        const candidateLid = normalizeUserId(userLid);
        if (!candidateLid) return resolve({ ignored: true, reason: 'invalid-userid' });

        // Define valores baseado no tipo
        let updateQuery;
        let params;

        if (tipo === 'message') {
            updateQuery = `INSERT OR REPLACE INTO conta
                (userLid, pushname, pushnamedisplay, fromChat, message, command, streak, tipos, lastInteraction)
                VALUES (?, ?, ?, ?, ?, COALESCE((SELECT command FROM conta WHERE userLid = ? AND fromChat = ?), 0), 1, ?, ?)`;
            params = [candidateLid, pushname, pushnamedisplay, normalizedFrom, value, candidateLid, normalizedFrom, 'Grupos', now];
        } else if (tipo === 'command') {
            updateQuery = `INSERT OR REPLACE INTO conta
                (userLid, pushname, pushnamedisplay, fromChat, message, command, streak, tipos, lastInteraction)
                VALUES (?, ?, ?, ?, COALESCE((SELECT message FROM conta WHERE userLid = ? AND fromChat = ?), 0), ?, 1, ?, ?)`;
            params = [candidateLid, pushname, pushnamedisplay, normalizedFrom, candidateLid, normalizedFrom, value, 'Grupos', now];
        } else {
            return reject(new Error('Tipo inválido. Use "message" ou "command"'));
        }

        try {
            db.prepare(updateQuery).run(...params);
            resolve({
                status: 'updated',
                userLid: candidateLid,
                fromChat: normalizedFrom,
                tipo,
                value
            });
        } catch (err) {
            reject(err);
        }
    });
}

function resetGroupConta(fromChat) {
    const normalizedFrom = fromChat?.toLowerCase().trim() || 'PV';
    const res = db.prepare('DELETE FROM conta WHERE LOWER(fromChat) = ?').run(normalizedFrom);
    return res.changes;
}

function getGroupContaSnapshot(fromChat) {
    const normalizedFrom = fromChat?.toLowerCase().trim() || 'PV';
    return db.prepare(`
        SELECT userLid, pushname, pushnamedisplay, fromChat, message, command, streak, tipos, lastInteraction
        FROM conta
        WHERE LOWER(fromChat) = ?
        ORDER BY message DESC, command DESC, lastInteraction DESC
    `).all(normalizedFrom);
}

function restoreGroupConta(fromChat, rows = []) {
    const normalizedFrom = fromChat?.toLowerCase().trim() || 'PV';
    const safeRows = Array.isArray(rows) ? rows.filter((row) => row?.userLid) : [];
    const restore = db.transaction((snapshotRows) => {
        db.prepare('DELETE FROM conta WHERE LOWER(fromChat) = ?').run(normalizedFrom);
        if (snapshotRows.length === 0) return;

        const insertStmt = db.prepare(`
            INSERT INTO conta (userLid, pushname, pushnamedisplay, fromChat, message, command, streak, tipos, lastInteraction)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const row of snapshotRows) {
            insertStmt.run(
                row.userLid,
                row.pushname || null,
                row.pushnamedisplay || null,
                normalizedFrom,
                Number(row.message) || 0,
                Number(row.command) || 0,
                Math.max(0, Number(row.streak) || 0),
                row.tipos || 'Grupos',
                row.lastInteraction || null
            );
        }
    });

    restore(safeRows);
    return safeRows.length;
}

module.exports = {
    addOrUpdateUser,
    getRanking,
    getRankingCommands,
    getUserFlexible,
    getAllEntries,
    getUserFlexibleParticipant,
    addCheatConta,
    getGroupContaSnapshot,
    restoreGroupConta,
    resetGroupConta,
    db
};
