const DEFAULT_BOT_TIMEZONE = 'America/Sao_Paulo';

function resolveBotTimezone() {
    const configured = String(process.env.BOT_TIMEZONE || process.env.TZ || DEFAULT_BOT_TIMEZONE).trim();
    return configured || DEFAULT_BOT_TIMEZONE;
}

function applyGlobalTimezone() {
    const timezone = resolveBotTimezone();

    // Forca o processo inteiro a trabalhar no mesmo fuso, independente do host/VPS.
    process.env.BOT_TIMEZONE = timezone;
    process.env.TZ = timezone;

    const moment = require('moment-timezone');
    moment.tz.setDefault(timezone);

    return timezone;
}

module.exports = {
    DEFAULT_BOT_TIMEZONE,
    resolveBotTimezone,
    applyGlobalTimezone
};
