const config = require('../../config/config');
const { isRestrictionMaintenanceActive } = require('./whatsappRestrictionMonitor');

const LOG_TTL_MS = 60 * 1000;
const skipLogCache = new Map();

function isAutomationMuted() {
    const maintenance = config?.maintenance || {};
    return maintenance.muteGlobalMsg === true || config?.muteGlobal === true;
}

function shouldSkipAutomatedSend(label = 'Automation') {
    const mutedByMaintenance = isAutomationMuted();
    const mutedByRestriction = isRestrictionMaintenanceActive();
    if (!mutedByMaintenance && !mutedByRestriction) return false;

    const key = String(label || 'Automation');
    const now = Date.now();
    const lastLoggedAt = Number(skipLogCache.get(key) || 0);
    const reason = mutedByRestriction ? 'restricao critica do WhatsApp ativa' : 'muteGlobal esta ativo';

    if ((now - lastLoggedAt) >= LOG_TTL_MS) {
        skipLogCache.set(key, now);
        console.log(`[${key}] Notificacao automatica ignorada porque ${reason}`);
    }

    return true;
}

module.exports = {
    isAutomationMuted,
    shouldSkipAutomatedSend
};
