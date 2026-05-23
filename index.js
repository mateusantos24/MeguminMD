// Megumin - Bot de WhatsApp
// Criado por Rei Ayanami
// Copyright (c) 2021-2026. Todos os direitos reservados.


/* INSTALAÇÃO E CONFIGURAÇÃO
npm install --save-dev patch-package
npm install
*/

require('dotenv').config({ quiet: true });
const events = require('events');
const { applyGlobalTimezone } = require('./lib/utils/timezone');
const activeBotTimezone = applyGlobalTimezone();

const configuredMaxListeners = Number(process.env.NODE_MAX_LISTENERS || 50);
if (Number.isFinite(configuredMaxListeners) && configuredMaxListeners > events.defaultMaxListeners) {
    events.defaultMaxListeners = configuredMaxListeners;
}

const chalk = require('chalk');
const moment = require('moment-timezone');
require('moment/locale/pt-br');
moment.locale('pt-br');
moment.tz.setDefault(activeBotTimezone);

const fs = require('fs');
const path = require('path');
const qrcodeTerminal = require('qrcode-terminal');
const { detectRuntimeEnvironment } = require('./lib/utils/runtimeEnvironment');

const {
    handleMessageCapUpdate,
    handleReachoutTimeLockUpdate,
    refreshRestrictionState
} = require('./lib/utils/whatsappRestrictionMonitor');

function installSignalNoiseFilter() {
    if (console.__signalNoiseFilterInstalled) return;
    console.__signalNoiseFilterInstalled = true;

    const originalError = console.error.bind(console);
    const originalWarn = console.warn.bind(console);
    const state = {
        count: 0,
        lastLogAt: 0
    };

    function stringifyArgs(args) {
        return args.map((arg) => {
            if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
            if (typeof arg === 'string') return arg;
            try {
                return String(arg);
            } catch {
                return '[unstringifiable]';
            }
        }).join(' ');
    }

    function flushSuppressed(now = Date.now()) {
        if (!state.count) return;
        originalWarn(chalk.gray(`[Signal] ${state.count} mensagem(ns) fora de ordem/sessao antiga ignorada(s).`));
        state.count = 0;
        state.lastLogAt = now;
    }

    function isIgnorableSignalNoise(text) {
        return text.includes('Failed to decrypt message with any known session...') ||
            text.includes('Session error:MessageCounterError: Key used already or never filled') ||
            text.includes('MessageCounterError: Key used already or never filled') ||
            text.includes('Decrypted message with closed session.');
    }

    console.error = (...args) => {
        const text = stringifyArgs(args);
        if (isIgnorableSignalNoise(text)) {
            state.count += 1;
            const now = Date.now();
            if (now - state.lastLogAt >= 60000) {
                flushSuppressed(now);
            }
            return;
        }
        flushSuppressed();
        return originalError(...args);
    };

    console.warn = (...args) => {
        const text = stringifyArgs(args);
        if (isIgnorableSignalNoise(text)) {
            state.count += 1;
            const now = Date.now();
            if (now - state.lastLogAt >= 60000) {
                flushSuppressed(now);
            }
            return;
        }
        flushSuppressed();
        return originalWarn(...args);
    };
}

installSignalNoiseFilter();

const startupState = {
    startedAt: Date.now(),
    modules: {},
    database: null,
    runtime: null,
    baileys: {
        module: '',
        version: '',
        source: '',
        connected: false
    },
    services: {},
    hotReload: null,
    web: {}
};

function isRunningWithPM2() {
    return process.env.pm_id !== undefined || process.env.NODE_APP_INSTANCE !== undefined;
}

const pm2Enabled = isRunningWithPM2();

function formatBootValue(label, value, color = chalk.white) {
    return `${chalk.gray(label.padEnd(10))}: ${color(String(value))}`;
}

function formatBootStatus(label, ok, okText = 'OK', failText = 'Desativado') {
    const dots = '.'.repeat(Math.max(2, 20 - label.length));
    const text = ok ? okText : failText;
    const color = ok ? chalk.greenBright : chalk.yellowBright;
    return ` ${chalk.gray('├─')} ${chalk.white(label)} ${chalk.gray(dots)} ${color(text)}`;
}

function formatLastBootStatus(label, ok, okText = 'OK', failText = 'Desativado') {
    const dots = '.'.repeat(Math.max(2, 20 - label.length));
    const text = ok ? okText : failText;
    const color = ok ? chalk.greenBright : chalk.yellowBright;
    return ` ${chalk.gray('└─')} ${chalk.white(label)} ${chalk.gray(dots)} ${color(text)}`;
}

function formatBootCustomStatus(prefix, label, text, color) {
    const dots = '.'.repeat(Math.max(2, 20 - label.length));
    return ` ${chalk.gray(prefix)} ${chalk.white(label)} ${chalk.gray(dots)} ${color(String(text))}`;
}

function getServiceColor(name, status) {
    const normalized = String(status || '').toLowerCase();
    if (name === 'WhatsApp') return ['connected', 'online', 'conectado'].includes(normalized) ? chalk.greenBright : chalk.redBright;
    if (name === 'Telegram') return ['online', 'ativo'].includes(normalized) ? chalk.cyanBright : chalk.blueBright;
    if (name === 'Discord') return ['online', 'ativo'].includes(normalized) ? chalk.magentaBright : chalk.hex('#8b5cf6');
    return ['running', 'online', 'ativo', 'conectado'].includes(normalized) ? chalk.greenBright : chalk.yellowBright;
}

function printBootCompletion() {
    const pkg = require('./package.json');
    const totalBootSeconds = ((Date.now() - startupState.startedAt) / 1000).toFixed(2);
    const db = startupState.database || { successCount: 0, errorCount: 0, totalFiles: 0, elapsedSeconds: '0.00' };
    const hotReloadStats = startupState.hotReload || global.hotReload?.getStats?.() || null;
    const line = '='.repeat(56);

    console.log('');
    console.log(chalk.blueBright('[BANCO]'));
    console.log(formatBootStatus('Sucesso', db.successCount > 0, `${db.successCount} OK`, db.errorCount > 0 ? `${db.errorCount} erro(s)` : 'Pendente'));
    console.log(formatBootStatus('Sessions', true, 'OK'));
    console.log(formatLastBootStatus('SQLite', db.errorCount === 0, `${db.totalFiles} arquivos`, `${db.errorCount} erro(s)`));
    console.log('');
    console.log(chalk.blueBright('[BAILEYS]'));
    console.log(formatBootStatus('Pacote', true, startupState.baileys.module || 'N/D'));
    console.log(formatBootStatus('Versao', true, startupState.baileys.version || 'N/D'));
    console.log(formatBootCustomStatus('└─', 'WhatsApp', startupState.baileys.connected ? 'Conectado' : 'Offline', getServiceColor('WhatsApp', startupState.baileys.connected ? 'Conectado' : 'Offline')));
    console.log('');
    console.log(chalk.blueBright('[SERVICOS]'));
    console.log(formatLastBootStatus('Hot Reload', Boolean(hotReloadStats?.active), hotReloadStats?.active ? 'Ativo' : 'Desativado'));
    console.log('');
    console.log(chalk.blueBright('[HOT RELOAD]'));
    console.log(formatLastBootStatus(
        'Arquivos',
        Boolean(hotReloadStats?.active),
        hotReloadStats?.active ? `${hotReloadStats.totalFiles} monitorados` : 'Desativado',
        'Desativado'
    ));
    console.log('');
    console.log(chalk.cyan(line));
    console.log(chalk.greenBright(` ${String.fromCharCode(0x2714)} Sistema iniciado com sucesso (${pkg.version})`));
    console.log(chalk.cyan(` ${String.fromCharCode(0x23F1)} Boot completo em ${totalBootSeconds}s`));
    console.log(chalk.cyan(line));
}

function printStartupBanner() {
    const pkg = require('./package.json');
    const line = '='.repeat(56);
    const modeLabel = pm2Enabled ? 'PM2' : 'Local';
    const runtime = startupState.runtime || { systemLabel: process.platform === 'win32' ? 'Windows' : process.platform, environmentType: 'Desconhecido', hostname: '', deviceLabel: '', detailsLabel: '' };
    console.log(chalk.cyan(line));
    console.log(chalk.magenta.bold(` ${'MEGUMIN BOT v' + pkg.version}`));
    console.log(chalk.cyan(line));
    console.log(formatBootValue('Node.js', process.version, chalk.white));
    console.log(formatBootValue('Sistema', runtime.systemLabel, chalk.white));
    console.log(formatBootValue('Ambiente', runtime.environmentType || 'Desconhecido', chalk.white));
    console.log(formatBootValue('Host', runtime.hostname || 'N/D', chalk.white));
    if (runtime.deviceLabel) {
        console.log(formatBootValue('Device', runtime.deviceLabel, chalk.white));
    }
    if (runtime.detailsLabel) {
        console.log(formatBootValue('Detalhes', runtime.detailsLabel, chalk.gray));
    }
    console.log(formatBootValue('Timezone', activeBotTimezone, chalk.white));
    console.log(formatBootValue('Banco', 'SQLite', chalk.white));
    console.log(formatBootValue('Modo', modeLabel, chalk.white));
    console.log(formatBootValue('PM2', pm2Enabled ? 'Ativo' : 'Desativado', pm2Enabled ? chalk.greenBright : chalk.yellowBright));
    console.log(chalk.cyan(line));
    console.log(chalk.blueBright('[BOOT] Inicializando sistema...\n'));
}

startupState.runtime = detectRuntimeEnvironment();
printStartupBanner();

let modulesStatus = {};

startupState.modules = { ...modulesStatus };

function ensureDir(p) {
    try {
        fs.mkdirSync(p, { recursive: true });
    } catch { }
}

ensureDir(path.join(__dirname, 'data'));
ensureDir(path.join(__dirname, 'data', 'DB'));
ensureDir(path.join(__dirname, 'data', 'sessions'));
ensureDir(path.join(__dirname, 'databases_repo'));

const {
    getBaileys,
    getBaileysModuleName,
    createBaileysExportMissingError,
    isBaileysStartupConfigError
} = require('./lib/utils/baileysLoader');

let baileys;
let makeWASocket;
let DisconnectReason;
let useMultiFileAuthState;
let fetchLatestBaileysVersion;
let fetchLatestWaWebVersion;
let makeCacheableSignalKeyStore;
let initAuthCreds;
let BufferJSON;
let proto;

async function loadBaileys() {
    if (baileys) return;
    baileys = await getBaileys();
    makeWASocket = baileys?.makeWASocket;
    ({ DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion, fetchLatestWaWebVersion, makeCacheableSignalKeyStore, initAuthCreds, BufferJSON, proto } = baileys || {});
    if (typeof makeWASocket !== 'function') {
        throw createBaileysExportMissingError(getBaileysModuleName());
    }
}

async function resolveWhatsAppVersion(preferLatest = true) {
    // Versão mais recente do WhatsApp Web
    const fixedVersion = [2, 3100, 1015901307];

    if (!preferLatest) {
        return {
            version: fixedVersion,
            isLatest: false,
            source: 'fixed',
            warning: null
        };
    }

    let waWebInfo = null;
    if (typeof fetchLatestWaWebVersion === 'function') {
        try {
            waWebInfo = await fetchLatestWaWebVersion();
            if (Array.isArray(waWebInfo?.version) && waWebInfo.version.length === 3) {
                return {
                    version: waWebInfo.version,
                    isLatest: waWebInfo.isLatest === true,
                    source: 'waweb',
                    warning: waWebInfo.isLatest === true ? null : (waWebInfo?.error?.message || null)
                };
            }
        } catch (error) {
            waWebInfo = { error };
        }
    }

    if (typeof fetchLatestBaileysVersion === 'function') {
        try {
            const baileysInfo = await fetchLatestBaileysVersion();
            if (Array.isArray(baileysInfo?.version) && baileysInfo.version.length === 3) {
                return {
                    version: baileysInfo.version,
                    isLatest: baileysInfo.isLatest === true,
                    source: 'baileys',
                    warning: waWebInfo?.error?.message || baileysInfo?.error?.message || null
                };
            }
        } catch (error) {
            if (!waWebInfo) waWebInfo = { error };
        }
    }

    return {
        version: fixedVersion,
        isLatest: false,
        source: 'fixed-fallback',
        warning: waWebInfo?.error?.message || 'Tentando com versão conhecida. Para versão mais recente, conecte à internet.'
    };
}

// const pkg = require('./package.json');

// ✅ IMPORTS DE CONFIGURAÇÃO
const config = require('./config/config');
const FileWatcher = require('./lib/security/fileWatcher');

// Lib Utils
const SimpleCache = require('./lib/utils/simpleCache');
const HotReload = require('./lib/utils/hotReload');

// Lib Handlers
const {
    MessageHandler,
    setupGroupParticipantsListener
} = require('./lib/handlers/messageHandler');

const { createAuthStateConfig, useSQLiteAuthState } = require('./lib/database/authStateDB');
const jidNormalizer = require('./lib/utils/jidNormalizer');

// ⚙️ CONFIGURAÇÕES
const logger = require('pino')({ level: 'silent' });

// 🔧 VARIÁVEIS GLOBAIS
let sock;
let schedulerInitialized = false;
let socketReady = false;
let reconnectTimer = null;
let authStateCleanup = null;
const callAttempts = new Map();
const processedCallIds = new Set();
let lastPairingRequest = { number: null, at: 0 };
let pairingRetryTimer = null;
let pairingRetryAttempt = 0;

function stripMessageFlags(value) {
    if (Array.isArray(value)) {
        return value.map((item) => stripMessageFlags(item));
    }

    if (!value || typeof value !== 'object') return value;

    for (const key of Object.keys(value)) {
        if (key === 'ai' && value[key] === true) {
            value[key] = false;
            continue;
        }

        if (key === 'secureMetaServiceLabel') {
            delete value[key];
            continue;
        }

        value[key] = stripMessageFlags(value[key]);
    }

    return value;
}

function installSocketMessageSanitizer(socket) {
    if (!socket || socket.__messageSanitizerInstalled) return socket;
    socket.__messageSanitizerInstalled = true;

    if (typeof socket.sendMessage === 'function') {
        const originalSendMessage = socket.sendMessage.bind(socket);

        socket.sendMessage = async (jid, content, ...args) => {
            const sanitizedContent = stripMessageFlags(content);
            return originalSendMessage(jid, sanitizedContent, ...args);
        };
    }

    if (typeof socket.relayMessage === 'function') {
        const originalRelayMessage = socket.relayMessage.bind(socket);

        socket.relayMessage = async (jid, message, ...args) => {
            const sanitizedMessage = stripMessageFlags(message);
            return originalRelayMessage(jid, sanitizedMessage, ...args);
        };
    }

    return socket;
}

global.sock = null;
global.getSock = () => sock || global.sock || null;
global.baileysDebugStore = global.baileysDebugStore || {
    contacts: {},
    chats: {},
    lastContactsUpsert: [],
    lastContactsUpdate: []
};

function upsertDebugContacts(entries = []) {
    const debugStore = global.baileysDebugStore || (global.baileysDebugStore = {
        contacts: {},
        chats: {},
        lastContactsUpsert: [],
        lastContactsUpdate: []
    });

    for (const entry of Array.isArray(entries) ? entries : []) {
        const contactId = String(entry?.id || entry?.jid || entry?.lid || '').trim();
        if (!contactId) continue;

        debugStore.contacts[contactId] = {
            ...(debugStore.contacts[contactId] || {}),
            ...entry
        };
    }
}

function scheduleBotRestart(delayMs = 2000, reason = 'reinicio interno') {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    console.log(chalk.yellow(`Reiniciando bot em ${Math.max(0, Math.round(delayMs / 1000))}s (${reason})...`));
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        startBot();
    }, delayMs);
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// 📝 FUNÇÕES AUXILIARES
function getDisconnectReason(reason) {
    const dr = DisconnectReason || {};
    const reasons = {
        [dr.badSession]: 'Sessão inválida',
        [dr.connectionClosed]: 'Conexão fechada',
        [dr.connectionLost]: 'Conexão perdida',
        [dr.connectionReplaced]: 'Conexão substituída',
        [dr.loggedOut]: 'Deslogado',
        [dr.restartRequired]: 'Reinício necessário',
        [dr.timedOut]: 'Timeout',
        400: 'Falha genérica',
        401: 'Deslogado',
        402: 'Banido temporariamente',
        403: 'Proibido',
        405: 'Cliente desatualizado',
        428: 'Connection Closed',
        440: 'Sessão expirada',
        500: 'Erro do servidor',
        503: 'Serviço indisponível'
    };
    return reasons[reason] || `Desconhecido (${reason})`;
}

// helper para registrar crash (fora do loop!)
function registrarCrash(motivo, data = new Date()) {
    const obj = {
        motivo,
        data: data.toISOString(),
        timestamp: Date.now()
    }
    fs.writeFileSync(path.join(__dirname, 'crash.json'), JSON.stringify(obj, null, 2))
}

function normalizePhoneNumber(input) {
    return String(input || '').replace(/\D/g, '');
}

function unwrapGpstatusMessageNode(node) {
    let current = node;

    for (let depth = 0; depth < 12; depth += 1) {
        if (!current || typeof current !== 'object') break;
        if (current.ephemeralMessage?.message) {
            current = current.ephemeralMessage.message;
            continue;
        }
        if (current.viewOnceMessageV2?.message) {
            current = current.viewOnceMessageV2.message;
            continue;
        }
        if (current.viewOnceMessage?.message) {
            current = current.viewOnceMessage.message;
            continue;
        }
        if (current.documentWithCaptionMessage?.message) {
            current = current.documentWithCaptionMessage.message;
            continue;
        }
        if (current.imageWithCaptionMessage?.message) {
            current = current.imageWithCaptionMessage.message;
            continue;
        }
        if (current.videoWithCaptionMessage?.message) {
            current = current.videoWithCaptionMessage.message;
            continue;
        }
        if (current.groupStatusMessageV2?.message) {
            current = current.groupStatusMessageV2.message;
            continue;
        }
        if (current.groupStatusMessage?.message) {
            current = current.groupStatusMessage.message;
            continue;
        }
        if (current.groupStatusMentionMessage?.message) {
            current = current.groupStatusMentionMessage.message;
            continue;
        }
        break;
    }

    return current || {};
}

function getPairingCodeConfig() {
    const pc = config?.pairingCode;
    if (pc === true) return { enabled: true, phoneNumber: '', customCode: '' };
    if (!pc || typeof pc !== 'object') return { enabled: false, phoneNumber: '', customCode: '' };
    return {
        enabled: !!pc.enabled,
        phoneNumber: pc.phoneNumber || pc.number || pc.phone || '',
        customCode: pc.customCode || pc.custom || pc.code || ''
    };
}

function isConnectionClosedError(err) {
    const status = err?.output?.statusCode ?? err?.data?.statusCode ?? err?.statusCode ?? err?.status ?? null;
    if (status === 428 || status === DisconnectReason.connectionClosed) return true;
    const msg = String(err?.message || err || '');
    return msg.includes('Connection Closed');
}

function schedulePairingRetry(socket) {
    if (pairingRetryTimer) return;
    pairingRetryAttempt = Math.min(pairingRetryAttempt + 1, 5);
    const delay = Math.min(1500 * pairingRetryAttempt, 10000);
    console.log(chalk.yellow(`🔁 Re-tentando Pairing Code em ${Math.round(delay / 1000)}s...`));
    pairingRetryTimer = setTimeout(async () => {
        pairingRetryTimer = null;
        await maybeRequestPairingCode(socket);
    }, delay);
}

async function maybeRequestPairingCode(socket) {
    const pc = getPairingCodeConfig();
    if (!pc.enabled) return;

    if (typeof socket?.requestPairingCode !== 'function') {
        console.log(chalk.red('❌ Este baileys não suporta requestPairingCode()'));
        return;
    }

    const registered = !!socket?.authState?.creds?.registered;
    if (registered) return;

    const number = normalizePhoneNumber(pc.phoneNumber);
    if (!number) {
        console.log(chalk.yellow('⚠️ pairingCode.enabled está ativo, mas pairingCode.phoneNumber está vazio'));
        return;
    }

    const wsOpen = socket?.ws?.isOpen;
    if (wsOpen === false) {
        schedulePairingRetry(socket);
        return;
    }

    const now = Date.now();
    if (lastPairingRequest.number === number && now - lastPairingRequest.at < 5 * 60 * 1000) return;
    lastPairingRequest = { number, at: now };

    try {
        let code;
        if (pc.customCode) {
            try {
                code = await socket.requestPairingCode(number, pc.customCode);
            } catch (e) {
                if (isConnectionClosedError(e)) throw e;
                code = await socket.requestPairingCode(number);
            }
        } else {
            code = await socket.requestPairingCode(number);
        }

        pairingRetryAttempt = 0;
        if (pairingRetryTimer) {
            clearTimeout(pairingRetryTimer);
            pairingRetryTimer = null;
        }
        console.log(chalk.cyan('🔐 Pairing Code:'), chalk.greenBright(String(code)));
        console.log(chalk.gray('WhatsApp → Aparelhos conectados → Conectar com número'));
    } catch (error) {
        if (isConnectionClosedError(error)) {
            schedulePairingRetry(socket);
            return;
        }
        console.error(chalk.red('❌ Falha ao solicitar Pairing Code:'), error);
    }
}

async function initializeDatabases() {
    const startTime = Date.now();
    const dbDirectory = path.join(__dirname, 'lib', 'database');
    const files = fs.readdirSync(dbDirectory).filter(f => f.endsWith('.js'));
    let successCount = 0;
    let errorCount = 0;
    const errorList = [];

    await Promise.all(
        files.map(async (file) => {
            try {
                const dbPath = path.join(dbDirectory, file);
                const content = fs.readFileSync(dbPath, 'utf-8');
                if (content.includes("require('sqlite3'") || content.includes('require("sqlite3"')) {
                    return;
                }
                const dbModule = require(dbPath);
                if (typeof dbModule?.init === 'function') {
                    await dbModule.init();
                }
                successCount++;
            } catch (err) {
                console.log(
                    chalk.yellowBright('⚠️ Erro:'),
                    chalk.white(file.padEnd(35)),
                    chalk.red(err)
                );
                errorList.push(file);
                errorCount++;
            }
        })
    );

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    if (errorList.length) {
        console.log(chalk.redBright('\n🚨 Bancos com erro:'));
        errorList.forEach(f => console.log(chalk.red(' - ' + f)));
    }

    startupState.database = {
        successCount,
        errorCount,
        totalFiles: files.length,
        elapsedSeconds: elapsed,
        errorList: [...errorList]
    };
    return {
        ok: errorCount === 0,
        successCount,
        errorCount,
        totalFiles: files.length,
        elapsedSeconds: elapsed,
        errorList
    };
}

async function setupAuth() {
    try {
        await loadBaileys();
        const authConfig = createAuthStateConfig(config);

        if (authConfig.useDatabase) {
            const authDbPath = path.resolve(__dirname, authConfig.dbPath);
            const { state, saveCreds, close } = await useSQLiteAuthState(authDbPath, {
                initAuthCreds,
                makeCacheableSignalKeyStore,
                BufferJSON,
                proto
            }, logger);
            authStateCleanup = typeof close === 'function' ? close : null;
            console.log(chalk.greenBright('✅ Estado da sessão carregado!'), chalk.gray(`(SQLite: ${authDbPath})`));
            return { state, saveCreds };
        }

        const sessionDir = path.resolve(__dirname, authConfig.sessionDir);
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        authStateCleanup = null;
        console.log(chalk.greenBright('✅ Estado da sessão carregado!'), chalk.gray(`(${sessionDir})`));
        return { state, saveCreds };
    } catch (error) {
        console.error(chalk.red('❌ Erro ao carregar sessão:'), isBaileysStartupConfigError(error) ? error.message : error);
        throw error;
    }
}

function isNonRestartableStartupError(error) {
    return isBaileysStartupConfigError(error);
}

async function shutdownAfterStartupError(exitCode = 1) {
    if (sock) {
        try {
            sock.end();
        } catch {
            // Socket may already be closed during startup failure.
        }
        sock = null;
        global.sock = null;
    }

    await Promise.allSettled([
        discordSystem.stopDiscordSystem(),
        telegramSystem.stopTelegramSystem()
    ]);
    await closeAuthStateResources();
    process.exit(exitCode);
}

async function createSocket(authState, useLatestVersion = true) {
    try {
        await loadBaileys();

        const versionInfo = await resolveWhatsAppVersion(useLatestVersion);
        const version = versionInfo.version;
        const isLatest = versionInfo.isLatest === true;

        const socket = installSocketMessageSanitizer(makeWASocket({
            version,
            logger,
            auth: authState,

            // 🇧🇷 REGIÃO BRASIL
            countryCode: 'BR',
            mcc: '724',

            // ✅ Configurações de exibição
            printQRInTerminal: false,

            // ✅ Economia de recursos
            syncFullHistory: false,
            markOnlineOnConnect: true,
            fireInitQueries: false,

            // ✅ Timeouts otimizados
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 0,
            keepAliveIntervalMs: 15000,

            // ✅ Link preview melhorado
            generateHighQualityLinkPreview: true,
            linkPreviewImageThumbnailWidth: 192,
            defaultMessageAi: false,

            generateMessageID: () => require('crypto').randomBytes(16).toString('hex').toUpperCase(),
            enableRecentMessageCache: false,

            // ✅ Histórico limitado a 7 dias (corrigido para segundos)
            shouldSyncHistoryMessage: (msg) => {
                const sevenDaysAgo = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60);
                return (msg?.messageTimestamp || 0) > sevenDaysAgo;
            },
        }));

        console.log(
            chalk.greenBright('✅ Socket WhatsApp criado - '),
            chalk.cyanBright(`Versão: ${version.join('.')}`),
            chalk.gray(`[${versionInfo.source.toUpperCase()}]`),
            !isLatest ? chalk.yellow(' ⚠️ desatualizado') : '',
            versionInfo.warning ? chalk.gray(`(${versionInfo.warning})`) : ''
        );

        startupState.baileys = {
            module: getBaileysModuleName(),
            version: (() => {
                try {
                    return String(require(`${getBaileysModuleName()}/package.json`).version || 'unknown');
                } catch {
                    return 'unknown';
                }
            })(),
            waVersion: String(version.join('.')),
            source: String(versionInfo.source || '').toUpperCase(),
            connected: false
        };
        
        return socket;
    } catch (error) {
        console.error(chalk.red('❌ Erro ao criar socket:'), error);
        throw error;
    }
}

// Deletar sessão
function deleteSession() {
    return clearSessionStorage();
}

async function closeAuthStateResources() {
    if (typeof authStateCleanup !== 'function') return;

    const cleanup = authStateCleanup;
    authStateCleanup = null;

    try {
        await cleanup();
        console.log(chalk.gray('🔓 Auth SQLite fechado.'));
    } catch (error) {
        console.error(chalk.red('❌ Erro ao fechar auth SQLite:'), error);
    }
}

async function removePathWithRetry(targetPath, options, label) {
    const maxAttempts = 5;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            if (!fs.existsSync(targetPath)) return false;
            fs.rmSync(targetPath, options);
            return true;
        } catch (error) {
            const isRetryable = error?.code === 'EBUSY' || error?.code === 'EPERM';
            if (!isRetryable || attempt === maxAttempts) {
                throw error;
            }

            console.log(chalk.yellow(`⏳ ${label} ocupado, nova tentativa ${attempt + 1}/${maxAttempts}...`));
            await wait(250 * attempt);
        }
    }

    return false;
}

async function clearSessionStorage() {
    try {
        await closeAuthStateResources();

        const authConfig = createAuthStateConfig(config);
        const sessionPath = path.resolve(__dirname, authConfig.sessionDir);
        const authDbPath = path.resolve(__dirname, authConfig.dbPath);

        if (await removePathWithRetry(sessionPath, { recursive: true, force: true }, 'Sessão')) {
            console.log(chalk.yellow('🧹 Sessão removida!'));
        }

        if (await removePathWithRetry(authDbPath, { force: true }, 'Banco de auth')) {
            console.log(chalk.yellow('🧹 Banco de auth removido!'));
        }
    } catch (err) {
        console.error(chalk.red('❌ Erro ao remover sessão:'), err);
    }
}

// 🔧 Atualizar todos os schedulers com o socket
async function initializeAuxiliarySystems(socket, isReconnection = false) {
    try {
        if (isReconnection) console.log(chalk.yellow('🔄 Reconexão detectada - atualizando socket...'));

        // Hot reload
        if (config.development?.hotReload) {
            if (!global.fileWatcher) global.fileWatcher = new FileWatcher(socket, true);
            if (!global.hotReload) {
                global.hotReload = new HotReload(socket);
                global.hotReload.init();
            } else if (global.hotReload.updateSocket) {
                global.hotReload.updateSocket(socket);
            }
        }

        startupState.hotReload = global.hotReload?.getStats ? global.hotReload.getStats() : null;
        socketReady = true;
    } catch (error) {
        console.error(chalk.red('❌ Erro ao inicializar sistemas:'), error);
    }
}

function detachSocketFromRuntime() {
    try { global.sock = null; } catch (e) { void e }
}

function isActiveSocketInstance(socket) {
    return !!socket && socket === sock;
}

// Configurar listeners do socket WhatsApp (✅ OTIMIZADO)
function formatContactDebugEntries(entries = []) {
    return (Array.isArray(entries) ? entries : []).map((entry) => ({
        id: entry?.id || null,
        lid: entry?.lid || null,
        name: entry?.name || null,
        notify: entry?.notify || null,
        verifiedName: entry?.verifiedName || null,
        verifiedLevel: entry?.verifiedLevel || null,
        status: entry?.status || null,
        imgUrl: entry?.imgUrl || null
    }));
}

function setupEventListeners(socket, saveCreds) {
    socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (!isActiveSocketInstance(socket) && connection !== 'connecting') {
            return;
        }

        if (update?.reachoutTimeLock) {
            await handleReachoutTimeLockUpdate(socket, update.reachoutTimeLock, 'connection.update reachoutTimeLock');
        }
        // console.log('lastDisconnect:', lastDisconnect);

        // 🔐 QR CODE
        if (qr) {
            const pc = getPairingCodeConfig();
            const registered = !!socket?.authState?.creds?.registered;

            if (pc.enabled && !registered) {
                await maybeRequestPairingCode(socket);
            } else {
                console.log(chalk.yellow('📱 QR Code gerado! Escaneie com seu WhatsApp'));
                try {
                    qrcodeTerminal.generate(qr, { small: true });
                } catch (e) {
                    console.log(chalk.red('❌ Falha ao imprimir QR no terminal:', e));
                }
            }
        }

        // ⏳ CONECTANDO
        if (connection === 'connecting') {
            console.log(chalk.yellow('🔄 Conectando ao'), chalk.greenBright('WhatsApp...'));
        }

        // 🟢 CONECTADO
        if (connection === 'open') {
            if (!isActiveSocketInstance(socket)) return;
            if (reconnectTimer) {
                clearTimeout(reconnectTimer);
                reconnectTimer = null;
            }
            global.sock = socket;

            // 📥 POPULAR CACHE DE GRUPOS INICIAL
            (async () => {
                try {
                    const groups = await socket.groupFetchAllParticipating();
                    const groupIds = Object.keys(groups);

                    for (const jid of groupIds) {
                        const metadata = groups[jid];
                        if (metadata) {
                            metadata.timestamp = Date.now();
                            if (metadata.isCommunity) {
                                SimpleCache.communityMetadataCache.set(jid, metadata);
                            } else {
                                SimpleCache.groupMetadataCache.set(jid, metadata);
                            }
                        }
                    }
                } catch (err) {
                    console.error(chalk.red('❌ Erro ao baixar grupos iniciais:'), err);
                }
            })();

// Uma restrição ou banimento no WhatsApp ocorre quando o aplicativo limita ou bloqueia o uso de um número por violar os Termos de Serviço da plataforma.
//  Geralmente, isso é causado pelo envio de spam, uso de aplicativos não oficiais (como GB WhatsApp), ou denúncias de múltiplos usuários.
            refreshRestrictionState(socket, {
                notify: true,
                reason: 'checagem ao conectar'
            }).catch(() => null);

            const isReconnection = schedulerInitialized;
            await initializeAuxiliarySystems(socket, isReconnection);

            socketReady = true;
            startupState.baileys.connected = true;
            printBootCompletion();
        }

        // 🔴 DESCONECTADO
        if (connection === 'close') {
            if (!isActiveSocketInstance(socket)) return;

            socketReady = false;
            detachSocketFromRuntime();
            sock = null;
            global.sock = null;

            const reason = lastDisconnect?.error?.output?.statusCode ?? null;
            console.log(chalk.red('🔌 Desconectado. Razão:'), getDisconnectReason(reason));

            if (reason === DisconnectReason.loggedOut) {
                console.log(chalk.red('❌ Sessão inválida'));
                await clearSessionStorage();
                schedulerInitialized = false;
                scheduleBotRestart(2000, 'sessao invalida');
                return;
            }

            const reconnectableReasons = [
                DisconnectReason.connectionClosed,
                DisconnectReason.connectionLost,
                DisconnectReason.timedOut,
                DisconnectReason.restartRequired,
                428,
                503
            ];

            if (reconnectableReasons.includes(reason)) {
                console.log(chalk.yellow('♻️ Tentando reconectar sem reiniciar processo...'));
                setTimeout(() => startBot(), 3000);
                return;
            }
            scheduleBotRestart(3000, `motivo: ${getDisconnectReason(reason)}`);
        }
    });

    // ✅ CREDS UPDATE
    socket.ev.on('creds.update', (...args) => {
        if (!isActiveSocketInstance(socket)) return;
        return saveCreds(...args);
    });

    // Listener específico para updates de capping (limitação de mensagens)
    // Esses updates indicam que o WhatsApp está limitando temporariamente o envio de mensagens, geralmente devido a atividades suspeitas ou violação de políticas.
    socket.ev.on('message-capping.update', async (payload) => {
        if (!isActiveSocketInstance(socket)) return;
        try {
            await handleMessageCapUpdate(socket, payload, 'message-capping.update');
        } catch (error) {
            console.log(chalk.red('[MESSAGE CAPPING UPDATE] erro ao processar:'), error?.message || error);
        }
    });

    socket.ev.on('messages.upsert', async (upsert) => {
        try {
            if (!isActiveSocketInstance(socket)) return;
            const { messages, type } = upsert;
            // #DEBUG
            if (config.development?.debugMessagesAll) {
                console.log(JSON.stringify(messages, null, 2));
            }

            if (!Array.isArray(messages) || messages.length === 0) return;


            if (!config.AllowedCommandSelf) { // 🔒 Ignorar comandos próprios se configurado
                if (messages[0].key.fromMe) return;
            }

            // #DEBUG 2
            if (config.development?.debugMessages) {
                console.log(JSON.stringify(messages, null, 2));
            }

            // 🔥 FILTRAR mensagens válidas para processar no handler
            const validMsgs = [];

            for (const msg of messages) {
                const stubReason = msg.messageStubParameters?.[0] || '';

                // ✅ IGNORAR PEER_DATA_OPERATION (PLACEHOLDER RESEND)
                if (msg.message?.protocolMessage?.type === 'PEER_DATA_OPERATION_REQUEST_RESPONSE_MESSAGE') {
                    console.log(chalk.gray('[PLACEHOLDER IGNORADO] Mensagem de recuperação de placeholder'));
                    continue;
                }

                validMsgs.push(msg);
            }

            // Se não sobrou msg para processar → sai
            if (validMsgs.length === 0) return;
            await MessageHandler(socket, validMsgs, type);
        } catch (err) {
            console.error(chalk.red('❌ Erro em messages.upsert'), err);
        }
    });

    socket.ev.on('messages.delete', async (deleteEvents) => {
        if (!isActiveSocketInstance(socket)) return;
        console.log('Delete Events:', JSON.stringify(deleteEvents, null, 2));
    }); 

    // 👥 GRUPOS
    if (typeof setupGroupParticipantsListener === 'function') {
        setupGroupParticipantsListener(socket);
    }

    socket.ev.on('groups.update', async (groups) => {
        if (!isActiveSocketInstance(socket)) return;
        for (const group of groups) {
            if (group.id) {
                // Invalida o cache antigo. O próximo acesso repopula via SimpleCache
                // para evitar rajadas de groupMetadata em lotes de update.
                SimpleCache.invalidateGroupCache(group.id, 'groups.update');
            }
        }
    });
}

// 🚀 FUNÇÃO PRINCIPAL
async function startBot() {
    try {
        // ✅ Encerrar socket antigo
        if (sock) {
            detachSocketFromRuntime();
            console.log(chalk.yellow('🔄 Encerrando socket anterior...'));
            const previousSocket = sock;
            sock = null;
            global.sock = null;
            try {
                previousSocket.end(new Error('Nova conexão iniciada'));
            } catch (e) {
                console.log(chalk.gray('Socket anterior já encerrado:', e));
            }
            await wait(300);
        }

        await closeAuthStateResources();

        // 3️⃣ Inicializar bancos
        const dbStatus = await initializeDatabases();
        if (!dbStatus.ok) {
            console.error(chalk.red('❌ Falha ao inicializar bancos'));
            setTimeout(() => startBot(), 5000);
            return;
        }

        // 4️⃣ Setup WhatsApp
        const { state, saveCreds } = await setupAuth();
        sock = await createSocket(state, true); // Tentar versão mais recente primeiro
        global.sock = null;
        setupEventListeners(sock, saveCreds);
        await maybeRequestPairingCode(sock);
    } catch (error) {
        const errorOutput = isNonRestartableStartupError(error) ? error.message : error;
        console.error(chalk.red('❌ Erro crítico:'), errorOutput);
        if (isNonRestartableStartupError(error)) {
            console.log(chalk.yellow('⏹️  Erro de configuracao/dependencia. Encerrando sem reiniciar.'));
            await shutdownAfterStartupError(1);
            return;
        }

        console.log(chalk.yellow('🔄 Reiniciando em 5 segundos...'));
        setTimeout(() => startBot(), 5000);
    }
}

// ✅ HANDLERS DE PROCESSO
process.on('warning', (warning) => {
    const msg = String(warning?.message || '');
    if (msg.includes("ws.WebSocket 'upgrade' event is not implemented") || msg.includes("ws.WebSocket 'unexpected-response' event is not implemented")) {
        return;
    }
    if (warning?.name === 'MaxListenersExceededWarning') {
        console.warn(chalk.yellow('⚠️ Warning:'), `${warning.name}: ${msg}`);
        return;
    }
    console.warn(chalk.yellow('⚠️ Warning:'), warning);
});

// Códigos que NÃO devem provocar restart (apenas ignorar/encerrar com exit 0)
const IGNORE_RESTART_STATUSES = new Set([400, 401, 402, 403, 440]);
function extractStatusFromError(err) {
    if (!err) return null;
    if (typeof err === 'number') return err;
    if (err.status) return Number(err.status);
    if (err.statusCode) return Number(err.statusCode);
    // Baileys specific error shape
    if (err?.output?.statusCode) return Number(err.output.statusCode);
    // tentar extrair de mensagem
    const m = String(err.message || err).match(/\b(4\d{2}|440|5\d{2})\b/);
    if (m) return Number(m[0]);
    return null;
}

process.on('unhandledRejection', (reason) => {
    try {
        console.error(chalk.red('🚨 Unhandled Rejection:'), reason);
        const status = extractStatusFromError(reason);
        registrarCrash(`unhandledRejection: ${String(reason)}`);
        if (status && IGNORE_RESTART_STATUSES.has(status)) {
            console.log(chalk.yellow(`Ignorando restart por status ${status}`));
        }
    } catch (e) {
        console.log(chalk.red('❌ Erro ao tratar unhandledRejection:', e));
    }
});

process.on('uncaughtException', (error) => {
    try {
        console.error(chalk.red('🚨 Uncaught Exception:'), error);
        const status = extractStatusFromError(error);
        registrarCrash(`uncaughtException: ${String(error)}`);
        if (status && IGNORE_RESTART_STATUSES.has(status)) {
            console.log(chalk.yellow(`Ignorando restart por status ${status}`));
            process.exit(0);
        }
    } catch (e) {
        console.log(chalk.red('❌ Erro ao tratar uncaughtException:', e));
    }
});

process.on('SIGINT', () => {
    console.log(chalk.yellow('\n🛑 Encerrando...'));
    if (sock) sock.end();
    closeAuthStateResources().finally(() => process.exit(0));
});

process.on('SIGTERM', () => {
    console.log(chalk.yellow('🛑 SIGTERM recebido'));
    if (sock) sock.end();
    closeAuthStateResources().finally(() => process.exit(0));
});

startBot();
module.exports = {
    startBot,
    sock: () => sock,
    logger,
    socketReady: () => socketReady,
};
