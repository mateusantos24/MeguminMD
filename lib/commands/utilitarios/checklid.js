const MentionHandler = require('../../utils/mentionHandler');
const safeRequest = require('../../network/safeRequest');

module.exports = {
    name: 'checklid',
    aliases: ['lidcheck'],
    category: 'utilitarios',
    description: '\u{1F527} Busca LID, numero e perfil do usuario',

    async execute(sock, messageData) {
        const { from, args, quoteThis, prefix, groupMetadata } = messageData;

        const reply = (content) =>
            sock.sendMessage(from, content, { quoted: quoteThis });

        if (!args[0]) {
            return reply({
                text: [
                    `Uso: ${prefix}checklid <lid@lid | numero>`,
                    'Exemplos:',
                    `${prefix}checklid 8111111111111@lid`,
                    `${prefix}checklid 5541999999999`,
                ].join('\n'),
            });
        }

        const inputRaw = String(args[0] || '').trim();
        const numericInput = normalizeDigits(inputRaw);
        const lid = normalizeLidInput(inputRaw);
        const pnInput = lid ? null : normalizePn(inputRaw);
        const lidNumericCandidate = !lid && numericInput ? `${numericInput}@lid` : null;

        if (!lid && !pnInput) {
            return reply({
                text: [
                    'Entrada invalida.',
                    'Use:',
                    `${prefix}checklid 8111111111111@lid`,
                    `${prefix}checklid 5541999999999`,
                ].join('\n'),
            });
        }

        try {
            const lookupKey = lid || pnInput || lidNumericCandidate;
            const mode = lid ? 'lid' : (pnInput && lidNumericCandidate ? 'auto' : 'pn');

            let foundIds = null;
            let foundIdsFromLid = null;
            if (typeof sock?.findUserId === 'function') {
                try {
                    foundIds = await sock.findUserId(lookupKey);
                } catch {
                    foundIds = null;
                }
                if (lidNumericCandidate && lidNumericCandidate !== lookupKey) {
                    try {
                        foundIdsFromLid = await sock.findUserId(lidNumericCandidate);
                    } catch {
                        foundIdsFromLid = null;
                    }
                }
            }

            const pnFromDb = null;
            const lidFromDb = null;
            const jidFromGroup = groupMetadata && lid ? MentionHandler.lidToJid(lid, groupMetadata) : null;
            const pnFromGroup = normalizePn(jidFromGroup);
            const pnFromFindPrimary = normalizePn(foundIds?.phoneNumber || null);
            const pnFromFindLid = normalizePn(foundIdsFromLid?.phoneNumber || null);
            const lidFromFind = normalizeLidValue(
                foundIds?.lid && foundIds.lid !== 'id-not-found'
                    ? foundIds.lid
                    : (foundIdsFromLid?.lid && foundIdsFromLid.lid !== 'id-not-found' ? foundIdsFromLid.lid : null)
            );

            const guessedPnInput = pnInput;
            const inputLooksLikeLidOnly = Boolean(
                numericInput &&
                !lid &&
                lidFromFind &&
                pnFromFindLid &&
                guessedPnInput &&
                guessedPnInput !== pnFromFindLid
            );
            const pnFromFind = inputLooksLikeLidOnly ? pnFromFindLid : (pnFromFindPrimary || pnFromFindLid);
            const resolvedPn = pnFromFind || pnFromDb || pnFromGroup || guessedPnInput;
            const resolvedLid = lidFromFind || lidFromDb || lid || lidNumericCandidate;
            const displayPn = inputLooksLikeLidOnly ? pnFromFind : guessedPnInput;

            const pnToCheck = resolvedPn;
            const lidToCheck = resolvedLid;
            let waResult = null;
            if (pnToCheck && typeof sock?.onWhatsApp === 'function') {
                const n = pnToCheck.split('@')[0].split(':')[0];
                const resultArr = await sock.onWhatsApp(n);
                waResult = resultArr && resultArr[0] ? resultArr[0] : null;
            }

            const mentionTarget =
                (waResult?.jid && String(waResult.jid).toLowerCase()) ||
                pnToCheck ||
                jidFromGroup ||
                lidToCheck ||
                pnInput;

            const mentionPretty = mentionTarget && mentionTarget.includes('@s.whatsapp.net')
                ? `@${mentionTarget.split('@')[0].split(':')[0]}`
                : lidToCheck
                    ? `@${lidToCheck.split('@')[0].split(':')[0]}`
                    : pnToCheck
                        ? `@${pnToCheck.split('@')[0].split(':')[0]}`
                        : '-';

            const waLid = normalizeLidValue(
                waResult?.lid || lidToCheck || null
            );
            const waJid =
                (waResult?.jid && String(waResult.jid).toLowerCase()) ||
                pnToCheck ||
                jidFromGroup ||
                null;

            const profileCandidates = Array.from(new Set([
                waJid,
                pnToCheck,
                pnFromFind,
                waLid,
                lidFromFind,
                lid,
            ].filter(Boolean)));

            let profileUrl = null;
            if (typeof sock?.profilePictureUrl === 'function') {
                for (const candidate of profileCandidates) {
                    try {
                        profileUrl = await sock.profilePictureUrl(candidate, 'image');
                        if (profileUrl) break;
                    } catch {
                        profileUrl = null;
                    }
                }
            }

            let text = `*CHECK ${mode === 'pn' ? 'PN' : mode === 'lid' ? 'LID' : 'AUTO'}*\n\n`;
            text += '*Identificadores*\n';
            if (numericInput && !lid) text += `- Entrada numerica: ${numericInput}\n`;
            if (displayPn) text += `- PN: ${formatPnDisplay(displayPn)}\n`;
            if (lid) text += `- LID: ${lid}\n`;
            if (
                lidNumericCandidate &&
                lidNumericCandidate !== lid &&
                !lidFromFind &&
                !waLid
            ) {
                text += `- LID candidato: ${lidNumericCandidate}\n`;
            }
            if (pnFromFind && pnFromFind !== displayPn) text += `- PN findUserId: ${pnFromFind}\n`;
            if (lidFromFind && lidFromFind !== lid && lidFromFind !== lidNumericCandidate) text += `- LID findUserId: ${lidFromFind}\n`;
            if (waLid) text += `- LID WA: ${waLid}\n`;
            if (waJid) text += `- JID: ${waJid}\n`;
            text += `- Mencao: ${mentionPretty}\n\n`;

            const resolvedByLid = Boolean(lidToCheck && (lidFromFind || lidFromDb || waLid));
            if (waResult?.exists || resolvedByLid) {
                text += '*WhatsApp:* encontrado\n';
            } else if (!pnToCheck && !lidToCheck) {
                text += '*WhatsApp:* nao foi possivel checar\n';
            } else {
                text += '*WhatsApp:* nao encontrado\n';
            }

            text += profileUrl ? '*Perfil:* encontrado\n' : '*Perfil:* nao encontrado\n';
            const mentions = Array.from(new Set([mentionTarget, waJid, waLid].filter(Boolean)));

            const avatarKey = waLid || lidFromDb || (lidToCheck ? normalizeLidValue(lidToCheck) : null);
            let avatarBuffer = null;

            if (profileUrl) {
                try {
                    const dl = await safeRequest.getBuffer(profileUrl, {
                        timeout: 15000,
                        maxBytes: 2 * 1024 * 1024,
                        retries: 2,
                    });
                    avatarBuffer = dl?.buffer || null;
                } catch {
                    avatarBuffer = null;
                }
            }


            if (avatarBuffer) {
                try {
                    return reply({
                        image: avatarBuffer,
                        caption: text,
                        mentions,
                    });
                } catch {
                    /* Erro ao enviar a imagem */
                }
            }

            return reply({
                text,
                mentions,
            });
        } catch (err) {
            console.error('[ERROR] /checklid:', err);
            return reply({ text: 'Erro ao checar esse LID/PN no banco ou WhatsApp.' });
        }
    },
};

function normalizeLidInput(input) {
    if (!input) return null;
    let s = String(input).trim().toLowerCase();
    if (s.startsWith('@')) s = s.slice(1);
    if (!s.includes('@lid')) return null;
    if (!s.endsWith('@lid')) s = s.replace(/@lid.*/g, '@lid');
    const base = s.split('@')[0].split(':')[0];
    if (!/^\d{5,25}$/.test(base)) return null;
    return s;
}

function normalizeLidValue(value) {
    if (!value) return null;
    let s = String(value).trim().toLowerCase();
    if (s.startsWith('@')) s = s.slice(1);
    if (!s.includes('@lid')) return null;
    if (!s.endsWith('@lid')) s = `${s.split('@lid')[0]}@lid`;
    const base = s.split('@')[0].split(':')[0];
    if (!/^\d{5,25}$/.test(base)) return null;
    return s;
}

function normalizePn(input) {
    if (!input) return null;
    const s = String(input).trim().toLowerCase();
    if (s.endsWith('@s.whatsapp.net')) return s.split(':')[0];
    const base = s.replace(/[^0-9]/g, '');
    if (!/^\d{7,20}$/.test(base)) return null;
    return `${base}@s.whatsapp.net`;
}

function normalizeDigits(input) {
    if (!input) return null;
    const base = String(input).replace(/[^0-9]/g, '');
    if (!/^\d{7,25}$/.test(base)) return null;
    return base;
}

function formatDate(d) {
    if (!d) return '-';
    try {
        return new Date(d).toLocaleString('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    } catch {
        return String(d);
    }
}

function formatPnDisplay(value) {
    if (!value) return '-';
    return String(value).split('@')[0].split(':')[0];
}
