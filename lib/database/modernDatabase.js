// lib/database/modernDatabase.js

const { Database } = require('./sqlite');
const chalk = require('chalk');

function normalizeSqlValue(value) {
    if (value === undefined || value === null) return null;
    const type = typeof value;
    if (type === 'string' || type === 'boolean' || type === 'bigint') return value;
    if (type === 'number') return Number.isFinite(value) ? value : null;
    if (value instanceof Date) return value.toISOString();
    if (value instanceof ArrayBuffer) return value;
    if (ArrayBuffer.isView(value)) return value;
    if (type === 'object') {
        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }
    return String(value);
}

function normalizeSqlParams(params) {
    if (!params) return [];
    if (!Array.isArray(params)) return [normalizeSqlValue(params)];
    return params.map(normalizeSqlValue);
}

class ModernDatabase {
    constructor() {
        this.db = null;
        this.dbPath = process.env.DB_PATH || './data/bot_database.sqlite';
        this.isConnected = false;
        this.transactionLock = false;
        this.connect();
    }

    async connect() {
        return new Promise((resolve, reject) => {
            try {
                const bunDb = new Database(this.dbPath);
                const adapter = {
                    exec: (sql) => bunDb.exec(sql),
                    serialize: (cb) => { try { cb(); } catch (e) { console.log(e); } },
                    run: (sql, paramsOrCb, cb) => {
                        let params = [];
                        let callback = cb;
                        if (typeof paramsOrCb === 'function') {
                            callback = paramsOrCb;
                        } else if (Array.isArray(paramsOrCb)) {
                            params = paramsOrCb;
                        }
                        try {
                            const safeParams = normalizeSqlParams(params);
                            const res = bunDb.prepare(sql).run(...safeParams);
                            const info = { changes: res.changes, lastID: res.lastInsertRowid, lastInsertRowid: res.lastInsertRowid };
                            if (typeof callback === 'function') {
                                callback.call(info, null);
                            }
                            return info;
                        } catch (e) {
                            if (typeof callback === 'function') callback(e);
                            else throw e;
                        }
                    },
                    get: (sql, paramsOrCb, cb) => {
                        let params = [];
                        let callback = cb;
                        if (typeof paramsOrCb === 'function') {
                            callback = paramsOrCb;
                        } else if (Array.isArray(paramsOrCb)) {
                            params = paramsOrCb;
                        }
                        try {
                            const safeParams = normalizeSqlParams(params);
                            const row = bunDb.prepare(sql).get(...safeParams);
                            if (typeof callback === 'function') callback(null, row);
                            else return row;
                        } catch (e) {
                            if (typeof callback === 'function') callback(e);
                            else throw e;
                        }
                    },
                    all: (sql, paramsOrCb, cb) => {
                        let params = [];
                        let callback = cb;
                        if (typeof paramsOrCb === 'function') {
                            callback = paramsOrCb;
                        } else if (Array.isArray(paramsOrCb)) {
                            params = paramsOrCb;
                        }
                        try {
                            const safeParams = normalizeSqlParams(params);
                            const rows = bunDb.prepare(sql).all(...safeParams);
                            if (typeof callback === 'function') callback(null, rows);
                            else return rows;
                        } catch (e) {
                            if (typeof callback === 'function') callback(e);
                            else throw e;
                        }
                    },
                    close: (cb) => {
                        try {
                            bunDb.close();
                            if (typeof cb === 'function') cb(null);
                        } catch (e) {
                            if (typeof cb === 'function') cb(e);
                        }
                    }
                };
                this.db = adapter;
                this.isConnected = true;
                (async () => {
                    await this.setupPragmas();
                    await this.createTablesSequentially();
                    resolve();
                })();
            } catch (err) {
                console.error(chalk.red('❌ Erro ao conectar:'), err);
                reject(err);
            }
        });
    }

    async setupPragmas() {
        return new Promise((resolve) => {
            const pragmas = [
                'PRAGMA journal_mode = WAL',
                'PRAGMA synchronous = NORMAL',
                'PRAGMA cache_size = 1000',
                'PRAGMA temp_store = memory',
                'PRAGMA mmap_size = 268435456' // 256MB
            ];
            let completed = 0;
            pragmas.forEach(pragma => {
                this.db.run(pragma, () => {
                    completed++;
                    if (completed === pragmas.length) {
                        resolve();
                    }
                });
            });
        });
    }

    async createTablesSequentially() {
        return new Promise((resolve, reject) => {
            const tables = [
                // ✅ TABELA DE USUÁRIOS (SOMENTE LID)
                {
                    name: 'users',
                    sql: `CREATE TABLE IF NOT EXISTS users (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        whatsapp_lid TEXT UNIQUE NOT NULL,
                        username TEXT,
                        display_name TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
                        is_blocked INTEGER DEFAULT 0,
                        is_premium INTEGER DEFAULT 0
                    )`
                },
                // ✅ TABELA DE GRUPOS/CHATS
                {
                    name: 'chats',
                    sql: `CREATE TABLE IF NOT EXISTS chats (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        chat_jid TEXT UNIQUE NOT NULL,
                        chat_type TEXT DEFAULT 'group',
                        name TEXT NOT NULL,
                        description TEXT,
                        participant_count INTEGER DEFAULT 0,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        is_active INTEGER DEFAULT 1,
                        settings_json TEXT DEFAULT '{}'
                    )`
                },
                // ✅ TABELA DE CONFIGURAÇÕES DE GRUPO
                {
                    name: 'group_settings',
                    sql: `CREATE TABLE IF NOT EXISTS group_settings (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        chat_jid TEXT UNIQUE NOT NULL,
                        welcome_enabled INTEGER DEFAULT 0,
                        welcome_message TEXT DEFAULT NULL,
                        leave_enabled INTEGER DEFAULT 0,
                        leave_message TEXT DEFAULT NULL,
                        welcome_card_enabled INTEGER DEFAULT 1,
                        welcome_card_font_enabled INTEGER DEFAULT 1,
                        welcome_card_avatar_enabled INTEGER DEFAULT 1,
                        welcome_card_desc_enabled INTEGER DEFAULT 1,
                        welcome_card_border_color TEXT DEFAULT '#FF6B6B',
                        welcome_card_avatar_border_color TEXT DEFAULT '#FF6B6B',
                        welcome_card_overlay_opacity REAL DEFAULT 0.3,
                        leave_card_enabled INTEGER DEFAULT 1,
                        leave_card_font_enabled INTEGER DEFAULT 1,
                        leave_card_avatar_enabled INTEGER DEFAULT 1,
                        leave_card_desc_enabled INTEGER DEFAULT 1,
                        leave_card_border_color TEXT DEFAULT '#FF4757',
                        leave_card_avatar_border_color TEXT DEFAULT '#FF4757',
                        leave_card_overlay_opacity REAL DEFAULT 0.3,
                        antilink_enabled INTEGER DEFAULT 0,
                        antilink_level INTEGER DEFAULT 1,
                        antilink_action INTEGER DEFAULT 1,
                        antitrava_enabled INTEGER DEFAULT 0,
                        antitrava_action INTEGER DEFAULT 4,
                        custom_antilinks TEXT DEFAULT '[]',
                        antispam_enabled INTEGER DEFAULT 0,
                        rules TEXT DEFAULT NULL,
                        custom_background TEXT DEFAULT NULL,
                        leave_custom_background TEXT DEFAULT NULL,
                        custom_prefixes TEXT DEFAULT '[]',
                        custom_prefixes_enabled INTEGER DEFAULT 0,
                        no_prefix_enabled INTEGER DEFAULT 0,
                        only_prefix_mode INTEGER DEFAULT 0,
                        only_prefix_value TEXT DEFAULT NULL,
                        ranking_mode TEXT DEFAULT NULL,
                        blacklist_enabled INTEGER DEFAULT 0,
                        blacklist_numbers TEXT DEFAULT '[]',
                        antifake_enabled INTEGER DEFAULT 0,
                        fake_ddds TEXT DEFAULT '[]',
                        whitelist_enabled INTEGER DEFAULT 0,
                        whitelist_numbers TEXT DEFAULT '[]',
                        spy_enabled INTEGER DEFAULT 0,
                        spy_admin_changes INTEGER DEFAULT 1,
                        spyenabled INTEGER DEFAULT 0,
                        spy_join_approvals INTEGER DEFAULT 1,
                        evento_enabled INTEGER DEFAULT 0,
                        replay_enabled INTEGER DEFAULT 0,
                        replay_configured INTEGER DEFAULT 0,
                        parceria_members TEXT DEFAULT '[]',
                        autosticker_enabled INTEGER DEFAULT 0,
                        autosticker_threshold INTEGER DEFAULT 5,
                        autosticker_mode INTEGER DEFAULT 1,
                        command_filter_ignore_empty INTEGER DEFAULT 0,
                        antiproibir_mode TEXT DEFAULT 'off',
                        antiproibir_list TEXT DEFAULT '[]',
                        antiproibir_autoban INTEGER DEFAULT 0,
                        locked_commands TEXT DEFAULT '[]',
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )`
                },
                // ✅ TABELA DE HISTÓRICO (SOMENTE LID)
                {
                    name: 'group_activity_log',
                    sql: `CREATE TABLE IF NOT EXISTS group_activity_log (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_lid TEXT NOT NULL,
                        chat_jid TEXT NOT NULL,
                        action TEXT NOT NULL,
                        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                        user_name TEXT,
                        consecutive_count INTEGER DEFAULT 1
                    )`
                },
                // ✅ TABELA DE LOGS DO ANTI-LINK (SOMENTE LID)
                {
                    name: 'antilink_logs',
                    sql: `CREATE TABLE IF NOT EXISTS antilink_logs (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_lid TEXT NOT NULL,
                        chat_jid TEXT NOT NULL,
                        message_content TEXT,
                        detections TEXT,
                        level INTEGER DEFAULT 1,
                        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                    )`
                },
                // ✅ TABELA DE LOGS DO SPY SYSTEM
                {
                    name: 'spy_logs',
                    sql: `CREATE TABLE IF NOT EXISTS spy_logs (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        chat_jid TEXT NOT NULL,
                        event_type TEXT NOT NULL,
                        event_description TEXT NOT NULL,
                        target_user TEXT,
                        actor_user TEXT,
                        additional_data TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )`
                },
                // ✅ TABELA DE LOGS DE PROTEÇÃO (SOMENTE LID)
                {
                    name: 'protection_logs',
                    sql: `CREATE TABLE IF NOT EXISTS protection_logs (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_lid TEXT NOT NULL,
                        chat_jid TEXT NOT NULL,
                        protection_type TEXT NOT NULL,
                        action TEXT NOT NULL,
                        reason TEXT,
                        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                    )`
                }
            ];

            let tableIndex = 0;
            const createNextTable = () => {
                if (tableIndex >= tables.length) {
                    this.runMigrations().then(() => this.createIndexesSequentially()).then(resolve).catch(reject);
                    return;
                }
                const table = tables[tableIndex];
                this.db.run(table.sql, (err) => {
                    if (err) {
                        console.error(chalk.red(`❌ Erro ao criar tabela ${table.name}:`), err);
                        reject(err);
                    } else {
                        tableIndex++;
                        createNextTable();
                    }
                });
            };
            createNextTable();
        });
    }

    async runMigrations() {
        await this.ensureMigrationsTable();
        const migrations = [
            {
                name: 'add_welcome_card_font_enabled_column',
                sql: 'ALTER TABLE group_settings ADD COLUMN welcome_card_font_enabled INTEGER DEFAULT 1',
                description: 'Adicionar controle para mostrar ou esconder o titulo do card de boas-vindas'
            },
            {
                name: 'add_welcome_card_avatar_enabled_column',
                sql: 'ALTER TABLE group_settings ADD COLUMN welcome_card_avatar_enabled INTEGER DEFAULT 1',
                description: 'Adicionar controle para mostrar ou esconder o avatar do card de boas-vindas'
            },
            {
                name: 'add_welcome_card_desc_enabled_column',
                sql: 'ALTER TABLE group_settings ADD COLUMN welcome_card_desc_enabled INTEGER DEFAULT 1',
                description: 'Adicionar controle para mostrar ou esconder a descricao do card de boas-vindas'
            },
            {
                name: 'add_welcome_card_border_color_column',
                sql: 'ALTER TABLE group_settings ADD COLUMN welcome_card_border_color TEXT DEFAULT \'#FF6B6B\'',
                description: 'Adicionar cor da borda do card de boas-vindas'
            },
            {
                name: 'add_welcome_card_avatar_border_color_column',
                sql: 'ALTER TABLE group_settings ADD COLUMN welcome_card_avatar_border_color TEXT DEFAULT \'#FF6B6B\'',
                description: 'Adicionar cor da borda do avatar do card de boas-vindas'
            },
            {
                name: 'add_welcome_card_overlay_opacity_column',
                sql: 'ALTER TABLE group_settings ADD COLUMN welcome_card_overlay_opacity REAL DEFAULT 0.3',
                description: 'Adicionar opacidade da sobreposicao do card de boas-vindas'
            },
            {
                name: 'add_leave_card_enabled_column',
                sql: 'ALTER TABLE group_settings ADD COLUMN leave_card_enabled INTEGER DEFAULT 1',
                description: 'Adicionar controle de card para despedidas'
            },
            {
                name: 'add_leave_card_font_enabled_column',
                sql: 'ALTER TABLE group_settings ADD COLUMN leave_card_font_enabled INTEGER DEFAULT 1',
                description: 'Adicionar controle para mostrar ou esconder o titulo do card de despedida'
            },
            {
                name: 'add_leave_card_avatar_enabled_column',
                sql: 'ALTER TABLE group_settings ADD COLUMN leave_card_avatar_enabled INTEGER DEFAULT 1',
                description: 'Adicionar controle para mostrar ou esconder o avatar do card de despedida'
            },
            {
                name: 'add_leave_card_desc_enabled_column',
                sql: 'ALTER TABLE group_settings ADD COLUMN leave_card_desc_enabled INTEGER DEFAULT 1',
                description: 'Adicionar controle para mostrar ou esconder a descricao do card de despedida'
            },
            {
                name: 'add_leave_card_border_color_column',
                sql: 'ALTER TABLE group_settings ADD COLUMN leave_card_border_color TEXT DEFAULT \'#FF4757\'',
                description: 'Adicionar cor da borda do card de despedida'
            },
            {
                name: 'add_leave_card_avatar_border_color_column',
                sql: 'ALTER TABLE group_settings ADD COLUMN leave_card_avatar_border_color TEXT DEFAULT \'#FF4757\'',
                description: 'Adicionar cor da borda do avatar do card de despedida'
            },
            {
                name: 'add_leave_card_overlay_opacity_column',
                sql: 'ALTER TABLE group_settings ADD COLUMN leave_card_overlay_opacity REAL DEFAULT 0.3',
                description: 'Adicionar opacidade da sobreposicao do card de despedida'
            },
            {
                name: 'add_leave_custom_background_column',
                sql: 'ALTER TABLE group_settings ADD COLUMN leave_custom_background TEXT DEFAULT NULL',
                description: 'Adicionar fundo personalizado para despedidas'
            },
            {
                name: 'add_badwords_enabled_column',
                sql: 'ALTER TABLE group_settings ADD COLUMN badwords_enabled INTEGER DEFAULT 0',
                description: 'Adicionar coluna para ativar/desativar filtro de palavras proibidas'
            },
            {
                name: 'create_bans_table',
                sql: `
                    CREATE TABLE IF NOT EXISTS bans (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        group_jid TEXT NOT NULL,
                        target TEXT NOT NULL,
                        type TEXT NOT NULL, /* temp | perm | blacklist */
                        until INTEGER,      /* unix seconds, null for perm/blacklist */
                        reason TEXT,
                        created_by TEXT,
                        created_at INTEGER DEFAULT (strftime('%s','now'))
                    );
                    CREATE INDEX IF NOT EXISTS idx_bans_group ON bans(group_jid);
                    CREATE INDEX IF NOT EXISTS idx_bans_target ON bans(target);
                `,
                description: 'Tabela para gerenciamento de banimentos'
            },
            {
                name: 'add_custom_background_column',
                sql: 'ALTER TABLE group_settings ADD COLUMN custom_background TEXT DEFAULT NULL',
                description: 'Adicionar coluna para fundos personalizados'
            },
            {
                name: 'add_custom_prefixes_columns',
                sql: 'ALTER TABLE group_settings ADD COLUMN custom_prefixes TEXT DEFAULT "[]"',
                description: 'Adicionar coluna para prefixos personalizados'
            },
            {
                name: 'add_custom_prefixes_enabled_column',
                sql: 'ALTER TABLE group_settings ADD COLUMN custom_prefixes_enabled INTEGER DEFAULT 0',
                description: 'Adicionar coluna para ativar/desativar prefixos personalizados'
            },
            {
                name: 'add_no_prefix_enabled_column',
                sql: 'ALTER TABLE group_settings ADD COLUMN no_prefix_enabled INTEGER DEFAULT 0',
                description: 'Adicionar coluna para modo sem prefixo no grupo'
            },
            {
                name: 'add_only_prefix_columns',
                sql: 'ALTER TABLE group_settings ADD COLUMN only_prefix_mode INTEGER DEFAULT 0',
                description: 'Adicionar coluna para modo de prefixo único'
            },
            {
                name: 'add_only_prefix_value_column',
                sql: 'ALTER TABLE group_settings ADD COLUMN only_prefix_value TEXT DEFAULT NULL',
                description: 'Adicionar coluna para valor do prefixo único'
            },
            {
                name: 'add_antilink_level_column',
                sql: 'ALTER TABLE group_settings ADD COLUMN antilink_level INTEGER DEFAULT 1',
                description: 'Adicionar coluna para nível do anti-link'
            },
            {
                name: 'add_antilink_action_column',
                sql: 'ALTER TABLE group_settings ADD COLUMN antilink_action INTEGER DEFAULT 1',
                description: 'Adicionar coluna para acao do anti-link'
            },
            {
                name: 'add_custom_antilinks_column',
                sql: 'ALTER TABLE group_settings ADD COLUMN custom_antilinks TEXT DEFAULT \'[]\'',
                description: 'Adicionar coluna para links personalizados do anti-link'
            },
            {
                name: 'add_antitrava_enabled_column',
                sql: 'ALTER TABLE group_settings ADD COLUMN antitrava_enabled INTEGER DEFAULT 0',
                description: 'Adicionar coluna para ativar/desativar o anti-trava'
            },
            {
                name: 'add_antitrava_action_column',
                sql: 'ALTER TABLE group_settings ADD COLUMN antitrava_action INTEGER DEFAULT 4',
                description: 'Adicionar coluna para acao do anti-trava'
            },
            {
                name: 'add_blacklist_enabled_column',
                sql: 'ALTER TABLE group_settings ADD COLUMN blacklist_enabled INTEGER DEFAULT 0',
                description: 'Adicionar coluna blacklist_enabled'
            },
            {
                name: 'add_blacklist_numbers_column',
                sql: 'ALTER TABLE group_settings ADD COLUMN blacklist_numbers TEXT DEFAULT \'[]\'',
                description: 'Adicionar coluna blacklist_numbers'
            },
            {
                name: 'add_antifake_enabled_column',
                sql: 'ALTER TABLE group_settings ADD COLUMN antifake_enabled INTEGER DEFAULT 0',
                description: 'Adicionar coluna antifake_enabled'
            },
            {
                name: 'add_fake_ddds_column',
                sql: 'ALTER TABLE group_settings ADD COLUMN fake_ddds TEXT DEFAULT \'[]\'',
                description: 'Adicionar coluna fake_ddds'
            },
            {
                name: 'add_whitelist_enabled_column',
                sql: 'ALTER TABLE group_settings ADD COLUMN whitelist_enabled INTEGER DEFAULT 0',
                description: 'Adicionar coluna whitelist_enabled'
            },
            {
                name: 'add_whitelist_numbers_column',
                sql: 'ALTER TABLE group_settings ADD COLUMN whitelist_numbers TEXT DEFAULT \'[]\'',
                description: 'Adicionar coluna whitelist_numbers'
            },
            {
                name: 'add_spy_enabled_column',
                sql: 'ALTER TABLE group_settings ADD COLUMN spy_enabled INTEGER DEFAULT 0',
                description: 'Adicionar coluna para ativar/desativar spy'
            },
            {
                name: 'add_spy_admin_changes_column',
                sql: 'ALTER TABLE group_settings ADD COLUMN spy_admin_changes INTEGER DEFAULT 1',
                description: 'Adicionar coluna para monitorar mudanças de admin'
            },
            {
                name: 'add_spyenabled_column',
                sql: 'ALTER TABLE group_settings ADD COLUMN spyenabled INTEGER DEFAULT 0',
                description: 'Adicionar coluna spyenabled'
            },
            {
                name: 'add_spy_join_approvals_column',
                sql: 'ALTER TABLE group_settings ADD COLUMN spy_join_approvals INTEGER DEFAULT 1',
                description: 'Adicionar coluna para monitorar aprovações de entrada'
            },
            {
                name: 'add_leveling_enabled_column',
                sql: 'ALTER TABLE group_settings ADD COLUMN leveling_enabled INTEGER DEFAULT 0',
                description: 'Adicionar coluna para ativar ou desativar sistema de leveling'
            },
            {
                name: 'add_evento_enabled_column',
                sql: 'ALTER TABLE group_settings ADD COLUMN evento_enabled INTEGER DEFAULT 0',
                description: 'Adicionar coluna para ativar avisos de bonus de evento nos jogos'
            },
            {
                name: 'add_command_filter_ignore_empty_column',
                sql: 'ALTER TABLE group_settings ADD COLUMN command_filter_ignore_empty INTEGER DEFAULT 0',
                description: 'Adicionar coluna para ignorar bloqueio quando filtro estiver vazio'
            },
            {
                name: 'add_command_filter_enabled_column',
                sql: 'ALTER TABLE group_settings ADD COLUMN command_filter_enabled INTEGER DEFAULT 0',
                description: 'Adicionar coluna para ativar/desativar filtro de comandos'
            },
            {
                name: 'add_filtered_commands_column',
                sql: 'ALTER TABLE group_settings ADD COLUMN filtered_commands TEXT DEFAULT \'[]\'',
                description: 'Adicionar coluna para armazenar comandos filtrados em JSON'
            },
            {
                name: 'add_locked_commands_column',
                sql: 'ALTER TABLE group_settings ADD COLUMN locked_commands TEXT DEFAULT \'[]\'',
                description: 'Adicionar coluna para comandos bloqueados para usuarios comuns'
            },
            {
                name: 'add_antiproibir_mode_column',
                sql: 'ALTER TABLE group_settings ADD COLUMN antiproibir_mode TEXT DEFAULT \'off\'',
                description: 'Adicionar coluna para modo do anti-proibir (off|all|custom)'
            },
            {
                name: 'add_antiproibir_list_column',
                sql: 'ALTER TABLE group_settings ADD COLUMN antiproibir_list TEXT DEFAULT \'[]\'',
                description: 'Adicionar coluna para lista do anti-proibir (JSON)'
            },
            {
                name: 'add_antiproibir_autoban_column',
                sql: 'ALTER TABLE group_settings ADD COLUMN antiproibir_autoban INTEGER DEFAULT 0',
                description: 'Adicionar coluna para auto-ban (remover do grupo) no anti-proibir'
            },
            {
                name: 'add_ranking_mode_column',
                sql: 'ALTER TABLE group_settings ADD COLUMN ranking_mode TEXT DEFAULT NULL',
                description: 'Adicionar coluna para modo de exibicao do ranking por grupo'
            },
            {
                name: 'add_command_hours_restrictions_column',
                sql: 'ALTER TABLE group_settings ADD COLUMN command_hours_restrictions TEXT DEFAULT \'{}\'',
                description: 'Adicionar coluna para armazenar horarios de restricao de comandos (JSON)'
            },
            {
                name: 'add_replay_enabled_column',
                sql: 'ALTER TABLE group_settings ADD COLUMN replay_enabled INTEGER DEFAULT 0',
                description: 'Adicionar coluna para ativar ou desativar o replay sem prefixo'
            },
            {
                name: 'add_replay_configured_column',
                sql: 'ALTER TABLE group_settings ADD COLUMN replay_configured INTEGER DEFAULT 0',
                description: 'Adicionar coluna para marcar grupos que configuraram o replay'
            },
            {
                name: 'add_parceria_members_column',
                sql: 'ALTER TABLE group_settings ADD COLUMN parceria_members TEXT DEFAULT \'[]\'',
                description: 'Adicionar coluna para membros com bypass de parceria'
            },
            {
                name: 'add_autosticker_enabled_column',
                sql: 'ALTER TABLE group_settings ADD COLUMN autosticker_enabled INTEGER DEFAULT 0',
                description: 'Adicionar coluna para ativar o auto sticker por grupo'
            },
            {
                name: 'add_autosticker_threshold_column',
                sql: 'ALTER TABLE group_settings ADD COLUMN autosticker_threshold INTEGER DEFAULT 5',
                description: 'Adicionar coluna para definir o minimo do auto sticker'
            },
            {
                name: 'add_autosticker_mode_column',
                sql: 'ALTER TABLE group_settings ADD COLUMN autosticker_mode INTEGER DEFAULT 1',
                description: 'Adicionar coluna para definir o modo do auto sticker'
            },
        ];

        for (const migration of migrations) {
            try {
                const isApplied = await this.isMigrationApplied(migration.name);
                if (isApplied) {
                    continue;
                }
                const statements = String(migration.sql || '')
                    .split(';')
                    .map(s => s.trim())
                    .filter(Boolean);
                if (statements.length > 1) {
                    await this.exec(migration.sql);
                } else {
                    await this.run(migration.sql);
                }
                await this.markMigrationAsApplied(migration.name, migration.description);
            } catch (error) {
                if (error.message.includes('duplicate column name') || error.message.includes('already exists')) {
                    await this.markMigrationAsApplied(migration.name, migration.description);
                } else {
                    console.error(chalk.red(`❌ Erro na migração ${migration.name}:`), error.message);
                }
            }
        }
    }

    async ensureMigrationsTable() {
        const sql = `CREATE TABLE IF NOT EXISTS migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, description TEXT, applied_at DATETIME DEFAULT CURRENT_TIMESTAMP)`;
        await this.run(sql);
    }

    async isMigrationApplied(migrationName) {
        try {
            const result = await this.get('SELECT name FROM migrations WHERE name = ?', [migrationName]);
            return !!result;
        } catch (error) {
            console.error('❌ Erro ao verificar migração:', error);
            return false;
        }
    }

    async markMigrationAsApplied(migrationName, description) {
        try {
            await this.run('INSERT OR IGNORE INTO migrations (name, description) VALUES (?, ?)', [migrationName, description]);
        } catch (error) {
            console.error('❌ Erro ao registrar migração:', error);
        }
    }

    async logProtectionAction(userLid, chatJid, protectionType, action, reason) {
        try {
            const sql = 'INSERT INTO protection_logs (user_lid, chat_jid, protection_type, action, reason, timestamp) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)';
            await this.run(sql, [userLid, chatJid, protectionType, action, reason]);
        } catch (error) {
            console.error('❌ Erro ao registrar log de proteção:', error);
        }
    }

    async logAntilinkAction(messageData, detections, level) {
        try {
            const sql = 'INSERT INTO antilink_logs (user_lid, chat_jid, message_content, detections, level, timestamp) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)';
            const messageContent = String(messageData.antilinkText || messageData.body || '').substring(0, 200);
            await this.run(sql, [messageData.participantLid, messageData.from, messageContent, JSON.stringify(detections), level]);
        } catch (error) {
            console.error('❌ Erro ao registrar log anti-link:', error);
        }
    }

    async enableLeveling(chatJid) {
        return this.updateGroupSetting(chatJid, 'leveling_enabled', 1);
    }

    async disableLeveling(chatJid) {
        return this.updateGroupSetting(chatJid, 'leveling_enabled', 0);
    }

    async isLevelingEnabled(chatJid) {
        const settings = await this.get('SELECT leveling_enabled FROM group_settings WHERE chat_jid = ?', [chatJid]);
        return settings ? Boolean(settings.leveling_enabled) : false;
    }

    async enableEvento(chatJid) {
        return this.updateGroupSetting(chatJid, 'evento_enabled', 1);
    }

    async disableEvento(chatJid) {
        return this.updateGroupSetting(chatJid, 'evento_enabled', 0);
    }

    async isEventoEnabled(chatJid) {
        const settings = await this.get('SELECT evento_enabled FROM group_settings WHERE chat_jid = ?', [chatJid]);
        return settings ? Boolean(settings.evento_enabled) : false;
    }

    async listEventoEnabledGroups() {
        try {
            return await this.all(`
                SELECT chat_jid
                FROM group_settings
                WHERE evento_enabled = 1
                  AND chat_jid LIKE '%@g.us'
                ORDER BY chat_jid ASC
            `);
        } catch (error) {
            console.error('❌ Erro ao listar grupos com evento ativo:', error);
            return [];
        }
    }

    // ✅ REGISTRAR ENTRADA/SAÍDA NO GRUPO (SOMENTE LID)
    async logGroupActivity(userLid, chatJid, action, userName) {
        try {
            const consecutiveCount = await this.getConsecutiveCount(userLid, chatJid, action);
            await this.run('INSERT INTO group_activity_log (user_lid, chat_jid, action, user_name, consecutive_count) VALUES (?, ?, ?, ?, ?)', [userLid, chatJid, action, userName, consecutiveCount]);
            return consecutiveCount;
        } catch (error) {
            console.error('❌ Erro ao registrar atividade:', error);
            return 1;
        }
    }

    async getConsecutiveCount(userLid, chatJid, currentAction) {
        try {
            const lastDifferentAction = await this.get('SELECT action, consecutive_count FROM group_activity_log WHERE user_lid = ? AND chat_jid = ? AND action != ? ORDER BY timestamp DESC LIMIT 1', [userLid, chatJid, currentAction]);
            if (!lastDifferentAction) {
                return 1;
            }
            return lastDifferentAction.consecutive_count + 1;
        } catch (error) {
            console.error('❌ Erro ao calcular contador:', error);
            return 1;
        }
    }

    async getUserGroupStats(userLid, chatJid) {
        try {
            const stats = await this.all(`
                SELECT
                    action,
                    COUNT(*) as total_count,
                    MAX(consecutive_count) as max_consecutive,
                    MIN(timestamp) as first_time,
                    MAX(timestamp) as last_time
                FROM group_activity_log
                WHERE user_lid = ? AND chat_jid = ?
                GROUP BY action
                ORDER BY action
            `, [userLid, chatJid]);

            const result = {
                joins: 0,
                leaves: 0,
                currentStreak: 1,
                lastAction: null,
                firstJoin: null,
                lastActivity: null
            };

            stats.forEach(stat => {
                if (stat.action === 'join') {
                    result.joins = stat.total_count;
                    result.firstJoin = stat.first_time;
                } else if (stat.action === 'leave') {
                    result.leaves = stat.total_count;
                }
                result.lastActivity = stat.last_time;
            });

            const lastActivity = await this.get('SELECT action, consecutive_count FROM group_activity_log WHERE user_lid = ? AND chat_jid = ? ORDER BY timestamp DESC LIMIT 1', [userLid, chatJid]);

            if (lastActivity) {
                result.currentStreak = lastActivity.consecutive_count;
                result.lastAction = lastActivity.action;
            }

            return result;
        } catch (error) {
            console.error('❌ Erro ao obter estatísticas:', error);
            return { joins: 0, leaves: 0, currentStreak: 1, lastAction: null };
        }
    }

    async ensureGroupRegistration(chatJid, options = {}) {
        try {
            if (!chatJid || !chatJid.endsWith('@g.us')) {
                return null;
            }

            const groupMetadata = options.groupMetadata || null;
            const subject = String(options.name || groupMetadata?.subject || groupMetadata?.name || 'Grupo').trim() || 'Grupo';
            const description = groupMetadata?.desc || groupMetadata?.description || null;
            const participantCount = Number(options.participantCount ?? groupMetadata?.participants?.length ?? groupMetadata?.size ?? 0) || 0;

            await this.run(
                `INSERT INTO chats (chat_jid, chat_type, name, description, participant_count, is_active)
                 VALUES (?, ?, ?, ?, ?, 1)
                 ON CONFLICT(chat_jid) DO UPDATE SET
                    chat_type = 'group',
                    name = CASE
                        WHEN excluded.name IS NOT NULL AND excluded.name != '' AND excluded.name != 'Grupo'
                        THEN excluded.name
                        ELSE chats.name
                    END,
                    description = COALESCE(excluded.description, chats.description),
                    participant_count = CASE
                        WHEN excluded.participant_count > 0 THEN excluded.participant_count
                        ELSE chats.participant_count
                    END,
                    updated_at = CURRENT_TIMESTAMP,
                    is_active = 1`,
                [chatJid, 'group', subject, description, participantCount]
            );

            let settings = await this.get('SELECT * FROM group_settings WHERE chat_jid = ?', [chatJid]);
            if (!settings) {
                await this.run('INSERT OR IGNORE INTO group_settings (chat_jid, welcome_enabled, leave_enabled, welcome_card_enabled) VALUES (?, 0, 0, 1)', [chatJid]);
                settings = await this.get('SELECT * FROM group_settings WHERE chat_jid = ?', [chatJid]);
            }

            return settings;
        } catch (error) {
            console.error('❌ Erro ao registrar grupo:', error);
            return null;
        }
    }

    async getGroupSettings(chatJid) {
        try {
            if (!chatJid || !chatJid.endsWith('@g.us')) {
                return null;
            }
            return await this.ensureGroupRegistration(chatJid);
        } catch (error) {
            console.error('❌ Erro ao obter configurações do grupo:', error);
            return null;
        }
    }

    isSupportedChatSettingsJid(chatJid) {
        if (!chatJid) return false;
        const value = String(chatJid).trim().toLowerCase();
        return value.endsWith('@g.us')
            || value.endsWith('@s.whatsapp.net')
            || value.endsWith('@lid')
            || value.endsWith('@bot');
    }

    async ensureChatSettingsRegistration(chatJid, options = {}) {
        try {
            if (!this.isSupportedChatSettingsJid(chatJid)) {
                return null;
            }

            if (String(chatJid).endsWith('@g.us')) {
                return await this.ensureGroupRegistration(chatJid, options);
            }

            const subject = String(options.name || options.subject || 'Chat Privado').trim() || 'Chat Privado';

            await this.run(
                `INSERT INTO chats (chat_jid, chat_type, name, description, participant_count, is_active)
                 VALUES (?, ?, ?, ?, ?, 1)
                 ON CONFLICT(chat_jid) DO UPDATE SET
                    chat_type = 'private',
                    name = CASE
                        WHEN excluded.name IS NOT NULL AND excluded.name != '' THEN excluded.name
                        ELSE chats.name
                    END,
                    updated_at = CURRENT_TIMESTAMP,
                    is_active = 1`,
                [chatJid, 'private', subject, null, 2]
            );

            let settings = await this.get('SELECT * FROM group_settings WHERE chat_jid = ?', [chatJid]);
            if (!settings) {
                await this.run('INSERT OR IGNORE INTO group_settings (chat_jid, welcome_enabled, leave_enabled, welcome_card_enabled) VALUES (?, 0, 0, 1)', [chatJid]);
                settings = await this.get('SELECT * FROM group_settings WHERE chat_jid = ?', [chatJid]);
            }

            return settings;
        } catch (error) {
            console.error('❌ Erro ao registrar configurações do chat:', error);
            return null;
        }
    }

    async getChatSettings(chatJid, options = {}) {
        try {
            if (!this.isSupportedChatSettingsJid(chatJid)) {
                return null;
            }
            return await this.ensureChatSettingsRegistration(chatJid, options);
        } catch (error) {
            console.error('❌ Erro ao obter configurações do chat:', error);
            return null;
        }
    }

    async updateGroupSetting(chatJid, setting, value) {
        try {
            if (!chatJid || !chatJid.endsWith('@g.us')) {
                return null;
            }
            const allowedSettings = [
                'welcome_enabled', 'leave_enabled', 'welcome_message', 'leave_message',
                'welcome_card_enabled', 'welcome_card_font_enabled', 'welcome_card_avatar_enabled', 'welcome_card_desc_enabled',
                'welcome_card_border_color', 'welcome_card_avatar_border_color', 'welcome_card_overlay_opacity',
                'leave_card_enabled', 'leave_card_font_enabled', 'leave_card_avatar_enabled', 'leave_card_desc_enabled',
                'leave_card_border_color', 'leave_card_avatar_border_color', 'leave_card_overlay_opacity',
                'antilink_enabled', 'antispam_enabled', 'rules',
                'custom_background', 'leave_custom_background', 'custom_prefixes', 'custom_prefixes_enabled', 'no_prefix_enabled',
                'only_prefix_mode', 'only_prefix_value', 'ranking_mode', 'antilink_level', 'antilink_action', 'custom_antilinks',
                'antitrava_enabled', 'antitrava_action',
                'blacklist_enabled', 'blacklist_numbers', 'antifake_enabled', 'fake_ddds',
                'whitelist_enabled', 'whitelist_numbers', 'spy_enabled', 'spy_admin_changes', 'spyenabled',
                'spy_join_approvals', 'leveling_enabled', 'evento_enabled', 'replay_enabled', 'replay_configured', 'command_filter_enabled', 'filtered_commands', 'locked_commands',
                'badwords_enabled', 'antiproibir_mode', 'antiproibir_list', 'antiproibir_autoban', 'command_hours_restrictions', 'parceria_members',
                'autosticker_enabled', 'autosticker_threshold', 'autosticker_mode', 'command_filter_ignore_empty'
            ];
            if (!allowedSettings.includes(setting)) throw new Error(`Configuração '${setting}' não é permitida`);
            await this.ensureGroupRegistration(chatJid);
            const query = `UPDATE group_settings SET ${setting} = ?, updated_at = CURRENT_TIMESTAMP WHERE chat_jid = ?`;
            return await this.run(query, [value, chatJid]);
        } catch (error) {
            console.error('❌ Erro ao atualizar configuração:', error);
            return null;
        }
    }

    async updateChatSetting(chatJid, setting, value, options = {}) {
        try {
            if (!this.isSupportedChatSettingsJid(chatJid)) {
                return null;
            }
            const allowedSettings = [
                'welcome_enabled', 'leave_enabled', 'welcome_message', 'leave_message',
                'welcome_card_enabled', 'welcome_card_font_enabled', 'welcome_card_avatar_enabled', 'welcome_card_desc_enabled',
                'welcome_card_border_color', 'welcome_card_avatar_border_color', 'welcome_card_overlay_opacity',
                'leave_card_enabled', 'leave_card_font_enabled', 'leave_card_avatar_enabled', 'leave_card_desc_enabled',
                'leave_card_border_color', 'leave_card_avatar_border_color', 'leave_card_overlay_opacity',
                'antilink_enabled', 'antispam_enabled', 'rules',
                'custom_background', 'leave_custom_background', 'custom_prefixes', 'custom_prefixes_enabled', 'no_prefix_enabled',
                'only_prefix_mode', 'only_prefix_value', 'ranking_mode', 'antilink_level', 'antilink_action', 'custom_antilinks',
                'antitrava_enabled', 'antitrava_action',
                'blacklist_enabled', 'blacklist_numbers', 'antifake_enabled', 'fake_ddds',
                'whitelist_enabled', 'whitelist_numbers', 'spy_enabled', 'spy_admin_changes', 'spyenabled',
                'spy_join_approvals', 'leveling_enabled', 'evento_enabled', 'replay_enabled', 'replay_configured', 'command_filter_enabled', 'filtered_commands', 'locked_commands',
                'badwords_enabled', 'antiproibir_mode', 'antiproibir_list', 'antiproibir_autoban', 'command_hours_restrictions', 'parceria_members',
                'autosticker_enabled', 'autosticker_threshold', 'autosticker_mode', 'command_filter_ignore_empty'
            ];
            if (!allowedSettings.includes(setting)) throw new Error(`Configuração '${setting}' não é permitida`);
            await this.ensureChatSettingsRegistration(chatJid, options);
            const query = `UPDATE group_settings SET ${setting} = ?, updated_at = CURRENT_TIMESTAMP WHERE chat_jid = ?`;
            return await this.run(query, [value, chatJid]);
        } catch (error) {
            console.error('❌ Erro ao atualizar configuração do chat:', error);
            return null;
        }
    }

    async createIndexesSequentially() {
        return new Promise((resolve) => {
            const indexes = [
                {
                    name: 'idx_users_lid',
                    table: 'users',
                    sql: 'CREATE INDEX IF NOT EXISTS idx_users_lid ON users(whatsapp_lid)'
                },
                {
                    name: 'idx_group_activity',
                    table: 'group_activity_log',
                    sql: 'CREATE INDEX IF NOT EXISTS idx_group_activity ON group_activity_log(user_lid, chat_jid, action, timestamp)'
                }
            ];

            let indexCount = 0;
            const createNextIndex = () => {
                if (indexCount >= indexes.length) {
                    resolve();
                    return;
                }
                const index = indexes[indexCount];
                this.db.get('SELECT name FROM sqlite_master WHERE type=\'table\' AND name=?', [index.table], (err, row) => {
                    if (err) {
                        console.error(chalk.red(`❌ Erro ao verificar tabela ${index.table}:`), err);
                        indexCount++;
                        createNextIndex();
                        return;
                    }
                    if (!row) {
                        console.warn(chalk.yellow(`⚠️ Tabela ${index.table} não existe, pulando índice ${index.name}`));
                        indexCount++;
                        createNextIndex();
                        return;
                    }
                    this.db.run(index.sql, (indexErr) => {
                        if (indexErr) {
                            console.error(chalk.red(`❌ Erro ao criar índice ${index.name}:`), indexErr);
                        }
                        indexCount++;
                        createNextIndex();
                    });
                });
            };
            createNextIndex();
        });
    }

    async runTransaction(queries) {
        while (this.transactionLock) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        return new Promise((resolve, reject) => {
            this.transactionLock = true;
            this.db.serialize(() => {
                this.db.run('BEGIN TRANSACTION');
                const results = [];
                let hasError = false;
                const executeNext = (index) => {
                    if (index >= queries.length) {
                        if (hasError) {
                            this.db.run('ROLLBACK', () => {
                                this.transactionLock = false;
                                reject(new Error('Transaction rolled back'));
                            });
                        } else {
                            this.db.run('COMMIT', (err) => {
                                this.transactionLock = false;
                                if (err) reject(err);
                                else resolve(results);
                            });
                        }
                        return;
                    }
                    const { sql, params } = queries[index];
                    this.db.run(sql, params, function (err) {
                        if (err) {
                            hasError = true;
                            console.error(chalk.red('❌ Erro na transação:'), err);
                        } else {
                            results.push({ changes: this.changes, lastID: this.lastID });
                        }
                        executeNext(index + 1);
                    });
                };
                executeNext(0);
            });
        });
    }

    // ✅ GERENCIAR USUÁRIO (SOMENTE LID)
    async manageUser(messageData) {
        const { isNewsletter, participantLid, pushName, isGroup, from, groupMetadata, nameGP } = messageData;
        if (isNewsletter) return;

        const username = pushName || 'Usuário';
        const whatsappLid = participantLid;

        if (!whatsappLid) {
            // console.warn(chalk.yellow('[WARN] participantLid é null, ignorando manageUser'));
            return null;
        }

        try {
            if (isGroup && from?.endsWith('@g.us')) {
                await this.ensureGroupRegistration(from, {
                    name: nameGP || groupMetadata?.subject || null,
                    groupMetadata
                });
            }

            const existingUser = await this.get('SELECT * FROM users WHERE whatsapp_lid = ?', [whatsappLid]);
            if (existingUser) {
                await this.run(`UPDATE users SET username = ?, display_name = ?, updated_at = CURRENT_TIMESTAMP, last_activity = CURRENT_TIMESTAMP WHERE id = ?`, [username, username, existingUser.id]);
            } else {
                await this.run('INSERT INTO users (whatsapp_lid, username, display_name) VALUES (?, ?, ?)', [whatsappLid, username, username]);
            }
            return await this.getUser(whatsappLid);
        } catch (error) {
            console.error(chalk.red('❌ Erro ao gerenciar usuário:'), error);
            return null;
        }
    }

    async getUser(whatsappLid) {
        return new Promise((resolve, reject) => {
            this.db.get('SELECT * FROM users WHERE whatsapp_lid = ?', [whatsappLid], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    async getFullStats() {
        try {
            const stats = {};
            const userCount = await this.get('SELECT COUNT(*) as count FROM users');
            const chatCount = await this.get('SELECT COUNT(*) as count FROM chats');
            const groupActivityCount = await this.get('SELECT COUNT(*) as count FROM group_activity_log');
            stats.users = userCount?.count || 0;
            stats.chats = chatCount?.count || 0;
            stats.activities = groupActivityCount?.count || 0;
            const groupSettings = await this.get('SELECT COUNT(*) as count FROM group_settings');
            stats.configuredGroups = groupSettings?.count || 0;
            return stats;
        } catch (error) {
            console.error('❌ Erro ao obter estatísticas:', error);
            return { users: 0, chats: 0, activities: 0, configuredGroups: 0 };
        }
    }

    async checkIntegrity() {
        return new Promise((resolve) => {
            this.db.get('PRAGMA integrity_check', (err, result) => {
                if (err) {
                    console.error(chalk.red('❌ Erro ao verificar integridade:'), err);
                    resolve(false);
                } else {
                    const isOk = result && result.integrity_check === 'ok';
                    if (!isOk) {
                        console.error(chalk.red('❌ Banco de dados corrompido!'));
                    }
                    resolve(isOk);
                }
            });
        });
    }

    async exec(sql) {
        return new Promise((resolve, reject) => {
            try {
                this.db.exec(sql);
                resolve();
            } catch (err) {
                reject(err);
            }
        });
    }

    async run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function (err) {
                if (err) reject(err);
                else resolve({ changes: this.changes, lastID: this.lastID });
            });
        });
    }

    async get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    async all(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    async close() {
        return new Promise((resolve) => {
            if (this.db) {
                this.db.close((err) => {
                    if (err) console.error(err);
                    else console.log(chalk.blue('📴 Banco fechado com segurança'));
                    this.isConnected = false;
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }

    async resetGroupActivityLog(chatJid) {
        try {
            const res = await this.run('DELETE FROM group_activity_log WHERE chat_jid = ?', [chatJid]);
            return res.changes;
        } catch (error) {
            console.error('❌ Erro ao resetar log de atividade:', error);
            return 0;
        }
    }

    async getGroupActivityLogSnapshot(chatJid) {
        try {
            return await this.all(`
                SELECT user_lid, chat_jid, action, timestamp, user_name, consecutive_count
                FROM group_activity_log
                WHERE chat_jid = ?
                ORDER BY id ASC
            `, [chatJid]);
        } catch (error) {
            console.error('❌ Erro ao gerar snapshot do log de atividade:', error);
            return [];
        }
    }

    async restoreGroupActivityLog(chatJid, rows = []) {
        const safeRows = Array.isArray(rows) ? rows.filter((row) => row?.user_lid) : [];

        try {
            await this.exec('BEGIN TRANSACTION');
            await this.run('DELETE FROM group_activity_log WHERE chat_jid = ?', [chatJid]);

            for (const row of safeRows) {
                await this.run(`
                    INSERT INTO group_activity_log (user_lid, chat_jid, action, timestamp, user_name, consecutive_count)
                    VALUES (?, ?, ?, ?, ?, ?)
                `, [
                    row.user_lid,
                    chatJid,
                    row.action || 'unknown',
                    row.timestamp || null,
                    row.user_name || null,
                    Math.max(1, Number(row.consecutive_count) || 1)
                ]);
            }

            await this.exec('COMMIT');
            return safeRows.length;
        } catch (error) {
            try {
                await this.exec('ROLLBACK');
            } catch {}
            console.error('❌ Erro ao restaurar log de atividade:', error);
            throw error;
        }
    }
}

module.exports = new ModernDatabase();
