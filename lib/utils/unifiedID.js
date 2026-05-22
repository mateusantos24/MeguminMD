// unifiedID.js
// CommonJS module
module.exports = {
    getUnifiedID,
    getSenderUnified,
    getMentionsUnified,
    detectMentionsUnified,
    mentionUnified
};

/**
 * Detecta e unifica IDs automaticamente
 * @param {string} input - pode ser @lid ou @s.whatsapp.net
 * @param {object} [msg] - opcional, objeto de mensagem para derivar PN/LID
 * @returns {object} { pn, lid, preferred }
 */
function getUnifiedID(input, msg = {}) {
    let pn = null;
    let lid = null;

    if (!input) return { pn, lid, preferred: null };

    if (input.endsWith('@s.whatsapp.net')) {
        pn = input;
        if (msg.lid) lid = msg.lid;
    } else if (input.endsWith('@lid')) {
        lid = input;
        if (msg.sender || msg.participant) pn = msg.sender || msg.participant;
    }

    if (!pn && msg.sender) pn = msg.sender;
    if (!lid && msg.lid) lid = msg.lid;

    const preferred = lid || pn ? (lid ? 'lid' : 'pn') : null;
    return { pn, lid, preferred };
}

/**
 * Retorna o ID unificado do sender de uma mensagem
 */
function getSenderUnified(msg) {
    if (!msg) return { pn: null, lid: null, preferred: null };
    const sender = msg.sender || msg.participant;
    return getUnifiedID(sender, msg);
}

/**
 * Retorna array de IDs unificados de mentions
 */
function getMentionsUnified(msg) {
    if (!msg || !msg.mentionedJid) return [];
    return msg.mentionedJid.map(id => getUnifiedID(id, msg));
}

/**
 * Detecta menções em texto do tipo @algumacoisa e retorna IDs unificados
 * @param {string} text - mensagem com possíveis mentions
 * @param {object} msg - opcional, objeto de mensagem para derivar LID/PN
 * @returns {Array<{pn: string|null, lid: string|null, preferred: string|null}>}
 */
function detectMentionsUnified(text, msg = {}) {
    if (!text) return [];
    // regex simples para detectar @algumacoisa
    const mentionRegex = /@[\w.]+/g;
    const matches = text.match(mentionRegex) || [];
    return matches.map(m => getUnifiedID(m, msg));
}

/**
 * Retorna o texto pronto para mencionar alguém automaticamente
 * @param {string} input - @s.whatsapp.net ou @lid
 * @param {object} msg - opcional, contexto da mensagem
 * @returns {string} texto pronto para menção
 */
function mentionUnified(input, msg = {}) {
    const { pn, lid } = getUnifiedID(input, msg);
    if (lid) return `@${lid.replace('@lid','')}`;
    if (pn) return `@${pn.replace('@s.whatsapp.net','')}`;
    return '@alvo'; // fallback
}
