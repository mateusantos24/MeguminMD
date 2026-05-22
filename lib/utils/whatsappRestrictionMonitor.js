const whatsappRestrictionDB = require('../database/whatsappRestrictionDB');

const ALERT_LABEL = 'EVENTOLOGS/WA-RESTRICAO';
const HIGH_VOLUME_COMMANDS = new Set([
    'plantar',
    'story',
    'gpstatus',
    'autosticker',
    'figurinha',
    'sticker'
]);
const NON_RESTRICTIVE_CAP_STATUSES = new Set([
    'NONE',
    'NO_CAP',
    'DISABLED',
    'INACTIVE',
    'UNKNOWN',
    'UNLIMITED'
]);
const RESTRICTIVE_CAP_STATUSES = new Set([
    'ACTIVE',
    'LIMITED',
    'CAPPED',
    'EXHAUSTED',
    'RESTRICTED',
    'BLOCKED'
]);

function getState() {
    const persisted = whatsappRestrictionDB.getCurrentState();
    global.whatsappRestrictionState = global.whatsappRestrictionState || {
        reachoutTimeLock: persisted?.state?.reachoutTimeLock || null,
        messageCap: persisted?.state?.messageCap || null,
        maintenanceActive: !!persisted?.maintenanceActive,
        maintenanceReason: persisted?.maintenanceReason || '',
        firstDetectedAt: persisted?.firstDetectedAt || null,
        activeSince: persisted?.activeSince || null,
        resolvedAt: persisted?.resolvedAt || null,
        lastChangedAt: persisted?.lastChangedAt || null,
        lastUpdatedAt: persisted?.lastUpdatedAt || null,
        lastAlertAt: persisted?.lastAlertAt || null,
        blockedAttemptsTotal: persisted?.blockedAttemptsTotal || 0,
        lastAlertKey: '',
        lastRefreshAt: null
    };

    return global.whatsappRestrictionState;
}

function formatDateTime(value) {
    if (!value) return 'não informado';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return 'não informado';
    return new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'medium',
        timeZone: process.env.TZ || 'America/Sao_Paulo'
    }).format(date);
}

function normalizeTimestamp(value) {
    if (!value && value !== 0) return null;

    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value.getTime();
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
        if (value > 1e12) return value;
        if (value > 1e9) return value * 1000;
        return null;
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return null;

        if (/^\d+$/.test(trimmed)) {
            const numeric = Number(trimmed);
            if (Number.isFinite(numeric)) {
                if (numeric > 1e12) return numeric;
                if (numeric > 1e9) return numeric * 1000;
                return null;
            }
        }

        const parsed = new Date(trimmed);
        if (!Number.isNaN(parsed.getTime())) {
            return parsed.getTime();
        }
    }

    return null;
}

function normalizeReachoutTimeLock(payload) {
    if (!payload || typeof payload !== 'object') return null;

    const timeEnforcementEndsAt = normalizeTimestamp(
        payload.timeEnforcementEnds
        || payload.time_enforcement_ends
        || payload.expiresAt
        || payload.expires_at
    );

    return {
        isActive: !!payload.isActive || !!payload.is_active,
        enforcementType: String(payload.enforcementType || payload.enforcement_type || 'DEFAULT').trim().toUpperCase(),
        timeEnforcementEndsAt,
        timeEnforcementEndsIso: timeEnforcementEndsAt ? new Date(timeEnforcementEndsAt).toISOString() : null
    };
}

function readNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}

function readFirstNumber(obj, keys = []) {
    for (const key of keys) {
        const numeric = readNumber(obj?.[key]);
        if (numeric !== null) return numeric;
    }
    return null;
}

function normalizeUpperString(value) {
    if (value === null || value === undefined) return '';
    return String(value).trim().toUpperCase();
}

function limitJson(value, limit = 600) {
    try {
        const text = JSON.stringify(value);
        if (!text) return '';
        if (text.length <= limit) return text;
        return `${text.slice(0, limit)}…`;
    } catch {
        return '';
    }
}

function summarizeMessageCap(rawPayload) {
    const raw = rawPayload && typeof rawPayload === 'object' ? rawPayload : {};
    const status = normalizeUpperString(
        raw.capping_status
        || raw.cappingStatus
        || raw.status
    );
    const quota = readFirstNumber(raw, [
        'maxMessages',
        'max_messages',
        'quota',
        'message_cap',
        'messageCap',
        'cap',
        'total',
        'max',
        'total_quota',
        'totalQuota'
    ]);
    const used = readFirstNumber(raw, [
        'usedMessages',
        'used_messages',
        'used',
        'usage',
        'consumed',
        'current',
        'used_quota',
        'usedQuota'
    ]);
    let remaining = readFirstNumber(raw, [
        'remainingMessages',
        'remaining_messages',
        'remaining',
        'available',
        'left'
    ]);

    if (remaining === null && quota !== null && used !== null) {
        remaining = Math.max(0, quota - used);
    }

    const resetAt = normalizeTimestamp(
        raw.resetAt
        || raw.reset_at
        || raw.expirationTimestamp
        || raw.expiration_timestamp
        || raw.expiresAt
        || raw.expires_at
        || raw.cycle_end_timestamp
        || raw.cycleEndTimestamp
    );
    const cycleStartAt = normalizeTimestamp(raw.cycle_start_timestamp || raw.cycleStartTimestamp);
    const serverSentAt = normalizeTimestamp(raw.server_sent_timestamp || raw.serverSentTimestamp);

    return {
        status,
        quota,
        used,
        remaining,
        resetAt,
        resetIso: resetAt ? new Date(resetAt).toISOString() : null,
        cycleStartAt,
        cycleStartIso: cycleStartAt ? new Date(cycleStartAt).toISOString() : null,
        serverSentAt,
        serverSentIso: serverSentAt ? new Date(serverSentAt).toISOString() : null,
        raw
    };
}

function buildStateSnapshot(state = getState()) {
    return {
        reachoutTimeLock: state.reachoutTimeLock || null,
        messageCap: state.messageCap || null
    };
}

function buildAlertKey(state = getState()) {
    return JSON.stringify({
        reachout: state.reachoutTimeLock,
        messageCap: {
            status: state.messageCap?.status || '',
            quota: state.messageCap?.quota ?? null,
            used: state.messageCap?.used ?? null,
            remaining: state.messageCap?.remaining ?? null,
            resetIso: state.messageCap?.resetIso ?? null,
            cycleStartIso: state.messageCap?.cycleStartIso ?? null
        },
        maintenanceActive: !!state.maintenanceActive,
        maintenanceReason: state.maintenanceReason || ''
    });
}

function isMessageCapRestricted(messageCap) {
    const status = normalizeUpperString(messageCap?.status);
    if (status) {
        if (NON_RESTRICTIVE_CAP_STATUSES.has(status)) return false;
        if (RESTRICTIVE_CAP_STATUSES.has(status)) return true;
    }

    const quota = readNumber(messageCap?.quota);
    const used = readNumber(messageCap?.used);
    const remaining = readNumber(messageCap?.remaining);

    if (remaining !== null && remaining <= 0) {
        if ((quota !== null && quota > 0) || (used !== null && used > 0)) {
            return true;
        }
    }

    return false;
}

function isMaintenanceActive(state = getState()) {
    const reachoutActive = !!state?.reachoutTimeLock?.isActive;
    return reachoutActive || isMessageCapRestricted(state?.messageCap);
}

function resolveMaintenanceReason(state = getState()) {
    if (state?.reachoutTimeLock?.isActive) {
        return 'reachout_timelock';
    }

    if (isMessageCapRestricted(state?.messageCap)) {
        return 'message_cap_exhausted';
    }

    return '';
}

function persistState(reason = 'update') {
    const state = getState();
    const now = Date.now();
    const previous = whatsappRestrictionDB.getCurrentState();
    const maintenanceActive = isMaintenanceActive(state);
    const maintenanceReason = resolveMaintenanceReason(state);
    const previousActive = !!previous?.maintenanceActive;
    const changed = JSON.stringify(previous?.state || null) !== JSON.stringify(buildStateSnapshot(state))
        || previousActive !== maintenanceActive
        || String(previous?.maintenanceReason || '') !== String(maintenanceReason || '');

    if (maintenanceActive && !state.firstDetectedAt) {
        state.firstDetectedAt = previous?.firstDetectedAt || now;
    }

    if (maintenanceActive) {
        state.activeSince = previousActive ? (previous?.activeSince || state.activeSince || now) : now;
        state.resolvedAt = null;
    } else {
        state.resolvedAt = previousActive ? now : (previous?.resolvedAt || state.resolvedAt || null);
        state.activeSince = previousActive ? (previous?.activeSince || state.activeSince || null) : (previous?.activeSince || state.activeSince || null);
    }

    state.maintenanceActive = maintenanceActive;
    state.maintenanceReason = maintenanceReason;
    state.lastUpdatedAt = now;
    state.lastChangedAt = changed ? now : (previous?.lastChangedAt || state.lastChangedAt || now);
    state.lastAlertAt = previous?.lastAlertAt || state.lastAlertAt || null;
    state.blockedAttemptsTotal = previous?.blockedAttemptsTotal || state.blockedAttemptsTotal || 0;

    whatsappRestrictionDB.upsertCurrentState({
        state: buildStateSnapshot(state),
        maintenanceActive,
        maintenanceReason,
        firstDetectedAt: state.firstDetectedAt || null,
        activeSince: state.activeSince || null,
        resolvedAt: state.resolvedAt || null,
        lastChangedAt: state.lastChangedAt || now,
        lastUpdatedAt: now,
        lastAlertAt: state.lastAlertAt || null,
        blockedAttemptsTotal: state.blockedAttemptsTotal || 0
    });

    if (changed) {
        whatsappRestrictionDB.addEvent(
            maintenanceActive ? 'restriction-update' : 'restriction-clear',
            reason,
            {
                maintenanceActive,
                maintenanceReason,
                snapshot: buildStateSnapshot(state)
            },
            now
        );
    }

    return state;
}

function setReachoutTimeLock(payload, reason = 'reachout update') {
    const state = getState();
    state.reachoutTimeLock = normalizeReachoutTimeLock(payload);
    return persistState(reason).reachoutTimeLock;
}

function setMessageCap(payload, reason = 'message cap update') {
    const state = getState();
    state.messageCap = summarizeMessageCap(payload);
    return persistState(reason).messageCap;
}

function buildReachoutLines(reachout) {
    if (!reachout) {
        return [
            '🚫 *Reachout Timelock:* sem dados'
        ];
    }

    if (!reachout.isActive) {
        return [
            '✅ *Reachout Timelock:* inativo'
        ];
    }

    return [
        '⚠️ *Reachout Timelock:* ativo',
        `• Tipo: ${reachout.enforcementType || 'DEFAULT'}`,
        `• Libera em: ${formatDateTime(reachout.timeEnforcementEndsAt)}`
    ];
}

function buildMessageCapLines(messageCap) {
    if (!messageCap) {
        return [
            '📨 *Message Cap:* sem dados'
        ];
    }

    const lines = ['📨 *Message Cap:*'];
    const hasStructuredNumbers = [messageCap.quota, messageCap.used, messageCap.remaining].some((item) => item !== null);

    if (messageCap.status) lines.push(`• Status: ${messageCap.status}`);
    if (messageCap.quota !== null) lines.push(`• Limite: ${messageCap.quota}`);
    if (messageCap.used !== null) lines.push(`• Usado: ${messageCap.used}`);
    if (messageCap.remaining !== null) lines.push(`• Restante: ${messageCap.remaining}`);
    if (messageCap.cycleStartAt) lines.push(`• Ciclo iniciou: ${formatDateTime(messageCap.cycleStartAt)}`);
    if (messageCap.resetAt) lines.push(`• Reset: ${formatDateTime(messageCap.resetAt)}`);

    if (!hasStructuredNumbers) {
        const rawPreview = limitJson(messageCap.raw);
        lines.push(rawPreview ? `• Raw: ${rawPreview}` : '• Raw: sem campos reconhecidos');
    }

    return lines;
}

function formatRestrictionReport({ title = '🛡️ *STATUS DE RESTRIÇÃO WHATSAPP*', reason = '', includeUpdatedAt = true } = {}) {
    const state = getState();
    const lines = [title];

    if (reason) {
        lines.push(`• Motivo: ${reason}`);
    }

    lines.push('');
    lines.push(...buildReachoutLines(state.reachoutTimeLock));
    lines.push('');
    lines.push(...buildMessageCapLines(state.messageCap));
    lines.push('');
    lines.push(`🚧 Manutenção alta carga: ${state.maintenanceActive ? 'ativa' : 'inativa'}`);
    lines.push(`• Razão: ${state.maintenanceReason || 'nenhuma'}`);

    if (state.activeSince) lines.push(`• Começou em: ${formatDateTime(state.activeSince)}`);
    if (state.resolvedAt) lines.push(`• Última normalização: ${formatDateTime(state.resolvedAt)}`);
    lines.push(`• Bloqueios registrados: ${Number(state.blockedAttemptsTotal || 0)}`);

    if (includeUpdatedAt && state.lastUpdatedAt) {
        lines.push('');
        lines.push(`🕒 Última atualização: ${formatDateTime(state.lastUpdatedAt)}`);
    }

    return lines.join('\n');
}

function formatTimeLockInfoBlock() {
    const state = getState();
    const info = {
        isActive: !!state?.reachoutTimeLock?.isActive,
        enforcementType: state?.reachoutTimeLock?.enforcementType || 'DEFAULT',
        maintenanceActive: !!state?.maintenanceActive,
        maintenanceReason: state?.maintenanceReason || '',
        startedAt: state?.activeSince ? formatDateTime(state.activeSince) : null,
        endsAt: state?.reachoutTimeLock?.timeEnforcementEndsAt ? formatDateTime(state.reachoutTimeLock.timeEnforcementEndsAt) : null
    };

    return [
        '```js',
        'timeLockInfo: {',
        `  isActive: ${info.isActive},`,
        `  enforcementType: "${info.enforcementType}",`,
        `  maintenanceActive: ${info.maintenanceActive},`,
        `  maintenanceReason: "${info.maintenanceReason}",`,
        `  startedAt: ${info.startedAt ? `"${info.startedAt}"` : 'null'},`,
        `  endsAt: ${info.endsAt ? `"${info.endsAt}"` : 'null'}`,
        '}',
        '```'
    ].join('\n');
}

function wasRestrictionJustResolved(state = getState()) {
    if (state?.maintenanceActive) return false;
    const resolvedAt = normalizeTimestamp(state?.resolvedAt);
    const lastChangedAt = normalizeTimestamp(state?.lastChangedAt);
    if (!resolvedAt || !lastChangedAt) return false;
    return Math.abs(resolvedAt - lastChangedAt) <= 5000;
}

function formatRecentHistory(limit = 8) {
    const events = whatsappRestrictionDB.listEvents(limit);
    const blocked = whatsappRestrictionDB.listBlockedAttempts(limit);
    const lines = ['📚 *HISTÓRICO DE RESTRIÇÃO*', ''];

    lines.push('• Eventos:');
    if (!events.length) {
        lines.push('  - nenhum evento salvo');
    } else {
        for (const item of events) {
            lines.push(`  - ${formatDateTime(item.createdAt)} • ${item.eventType} • ${item.summary || 'sem resumo'}`);
        }
    }

    lines.push('');
    lines.push('• Tentativas bloqueadas:');
    if (!blocked.length) {
        lines.push('  - nenhuma tentativa bloqueada');
    } else {
        for (const item of blocked) {
            const actor = item.pushName || item.userJid || item.userLid || 'desconhecido';
            lines.push(`  - ${formatDateTime(item.createdAt)} • /${item.commandName} • ${actor}`);
        }
    }

    return lines.join('\n');
}

async function notifyRestrictionState(sock, reason = '', { force = false } = {}) {
    const state = getState();
    const justResolved = wasRestrictionJustResolved(state);

    if (!force && !state.maintenanceActive && !justResolved) {
        return false;
    }

    const alertKey = buildAlertKey(state);

    if (!force && alertKey === state.lastAlertKey) {
        return false;
    }

    state.lastAlertKey = alertKey;
    state.lastAlertAt = Date.now();
    whatsappRestrictionDB.updateLastAlertAt(state.lastAlertAt);

    const text = [
        formatRestrictionReport({
            title: state.maintenanceActive
                ? '🚨 *ALERTA DE RESTRIÇÃO WHATSAPP*'
                : '✅ *RESTRIÇÃO WHATSAPP NORMALIZADA*',
            reason
        }),
        '',
        formatTimeLockInfoBlock()
    ].join('\n');

    try {
        // await sendEventLogsMessage(sock, { text }, undefined, ALERT_LABEL);
        return true;
    } catch {
        return false;
    }
}

async function refreshRestrictionState(sock, { notify = false, reason = 'checagem manual', forceNotify = false } = {}) {
    const state = getState();
    const result = {
        reachoutSupported: typeof sock?.fetchAccountReachoutTimelock === 'function',
        messageCapSupported: typeof sock?.fetchNewChatMessageCap === 'function',
        reachoutError: null,
        messageCapError: null
    };

    if (result.reachoutSupported) {
        try {
            const reachoutPayload = await sock.fetchAccountReachoutTimelock();
            result.reachout = setReachoutTimeLock(reachoutPayload, `${reason}: reachout`);
        } catch (error) {
            result.reachoutError = error;
        }
    }

    if (result.messageCapSupported) {
        try {
            const messageCapPayload = await sock.fetchNewChatMessageCap();
            result.messageCap = setMessageCap(messageCapPayload, `${reason}: message cap`);
        } catch (error) {
            result.messageCapError = error;
        }
    }

    state.lastRefreshAt = Date.now();

    if (notify) {
        await notifyRestrictionState(sock, reason, { force: forceNotify });
    }

    return result;
}

async function handleReachoutTimeLockUpdate(sock, payload, reason = 'evento automático') {
    const reachout = setReachoutTimeLock(payload, reason);
    await notifyRestrictionState(sock, reason);
    return reachout;
}

async function handleMessageCapUpdate(sock, payload, reason = 'message capping update') {
    const messageCap = setMessageCap(payload, reason);
    await notifyRestrictionState(sock, reason);
    return messageCap;
}

function normalizeCommandName(value = '') {
    return String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '');
}

function isHighVolumeCommand(command = {}) {
    const name = normalizeCommandName(command?.name || '');
    if (!name) return false;
    if (HIGH_VOLUME_COMMANDS.has(name)) return true;

    const aliases = Array.isArray(command?.aliases) ? command.aliases : [];
    return aliases.some((alias) => HIGH_VOLUME_COMMANDS.has(normalizeCommandName(alias)));
}

function getRestrictionGuard(command, messageData = {}) {
    const state = getState();

    if (!state.maintenanceActive) {
        return { blocked: false, state };
    }

    if (messageData.isOwner) {
        return { blocked: false, state, bypassed: true };
    }

    if (!isHighVolumeCommand(command)) {
        return { blocked: false, state };
    }

    return {
        blocked: true,
        state,
        reason: state.maintenanceReason || 'reachout_timelock'
    };
}

function buildRestrictionBlockMessage(command, state = getState()) {
    return [
        '🚧 *COMANDO TEMPORARIAMENTE EM MANUTENÇÃO*',
        '',
        `• Comando: /${command?.name || 'desconhecido'}`,
        `• Motivo: ${state?.maintenanceReason || 'restrição de alto volume'}`,
        `• Desde: ${formatDateTime(state?.activeSince)}`,
        state?.reachoutTimeLock?.timeEnforcementEndsAt
            ? `• Previsão: ${formatDateTime(state.reachoutTimeLock.timeEnforcementEndsAt)}`
            : '• Previsão: aguardando liberação do WhatsApp',
        '',
        '⚠️ Para proteger a conta, comandos de alto volume ficam desativados em tempo real.',
        '👑 Durante esse período, apenas o dono pode usar esses comandos.'
    ].join('\n');
}

function recordBlockedCommandAttempt(command, messageData = {}) {
    const state = getState();
    whatsappRestrictionDB.addBlockedAttempt({
        commandName: command?.name || 'desconhecido',
        chatId: messageData?.from || null,
        userLid: messageData?.participantLid || messageData?.senderLid || null,
        userJid: messageData?.sender || null,
        pushName: messageData?.pushName || null,
        blockedReason: state?.maintenanceReason || 'reachout_timelock'
    });

    state.blockedAttemptsTotal = Number(state.blockedAttemptsTotal || 0) + 1;
}

function getRestrictionState() {
    return getState();
}

module.exports = {
    HIGH_VOLUME_COMMANDS,
    buildRestrictionBlockMessage,
    formatRecentHistory,
    formatRestrictionReport,
    formatTimeLockInfoBlock,
    getRestrictionGuard,
    getRestrictionState,
    handleMessageCapUpdate,
    handleReachoutTimeLockUpdate,
    isHighVolumeCommand,
    isRestrictionMaintenanceActive: () => isMaintenanceActive(getState()),
    notifyRestrictionState,
    recordBlockedCommandAttempt,
    refreshRestrictionState,
    setMessageCap,
    setReachoutTimeLock
};
