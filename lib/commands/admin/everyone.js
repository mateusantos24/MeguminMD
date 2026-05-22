// Cooldowns por tipo em milissegundos
const COOLDOWNS = {
    text: 10 * 60 * 1000,
    sticker: 15 * 60 * 1000,
    image: 25 * 60 * 1000,
    video: 40 * 60 * 1000,
};

// Armazena cooldowns por grupo
const cooldowns = {};

function getParticipantMentionTarget(participant) {
    return participant?.lid || participant?.id || participant?.jid || participant?.phoneNumber || null;
}

function getParticipantVisibleTag(participant) {
    const raw = participant?.jid || participant?.phoneNumber || participant?.id || participant?.lid || '';
    const base = String(raw).split('@')[0].split(':')[0];
    const digits = base.replace(/\D/g, '');
    return `@${digits || base}`;
}

function buildEveryoneTargets(groupMetadata) {
    const targets = new Map();

    for (const participant of groupMetadata?.participants || []) {
        const mentionTarget = getParticipantMentionTarget(participant);
        if (!mentionTarget || targets.has(mentionTarget)) continue;

        targets.set(mentionTarget, {
            target: mentionTarget,
            tag: getParticipantVisibleTag(participant)
        });
    }

    return Array.from(targets.values());
}

function expandEveryonePlaceholder(text, tags) {
    const raw = String(text || '').trim();
    if (!raw) return '';

    if (/@users\b|@all\b|@todos\b/i.test(raw)) {
        return raw.replace(/@users\b|@all\b|@todos\b/gi, tags.join(' '));
    }

    return raw;
}

function stripCommandPrefix(text, aliases = []) {
    if (!text) return '';
    const prefixes = ['!', '/', '.', '#', '>', '$', '%', '&', '~'];
    let clean = text.trim();

    for (const p of prefixes) {
        if (clean.startsWith(p)) {
            const afterPrefix = clean.slice(p.length).trim();
            const words = afterPrefix.split(/\s+/);
            const firstWord = words[0]?.toLowerCase();

            if (firstWord === 'everyone' || aliases.includes(firstWord)) {
                return words.slice(1).join(' ').trim();
            }
        }
    }
    return clean;
}

function buildShowMessage(text, everyoneTargets, messageData) {
    let msg = text ? `${text}\n\n` : '';

    for (const entry of everyoneTargets) {
        msg += `${entry.tag}\n`;
    }

    msg += `\n⚡ Por: ${messageData.pushName}`;
    return msg;
}

function formatDuration(ms) {
    let totalSeconds = Math.ceil(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    totalSeconds %= 3600;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    let result = '';
    if (hours > 0) result += `${hours}h `;
    if (minutes > 0) result += `${minutes}m `;
    if (seconds > 0 || result === '') result += `${seconds}s`;
    return result.trim();
}

function checkCooldown(groupId, type, isOwner) {
    if (isOwner) return { blocked: false };

    const now = Date.now();
    if (!cooldowns[groupId]) cooldowns[groupId] = {};
    const last = cooldowns[groupId][type] || 0;

    if (now < last) {
        return { blocked: true, remaining: formatDuration(last - now) };
    }

    cooldowns[groupId][type] = now + (COOLDOWNS[type] || COOLDOWNS.text);
    return { blocked: false };
}

module.exports = {
    name: 'everyone',
    description: '📣 Marca todos do grupo com texto ou midia',
    category: 'admin',
    aliases: ['hidetag', 'marcar', 'tagall'],
    adminOnly: true,
    groupOnly: true,

    async execute(sock, messageData) {
        const { from, quoteThis, isOwner, prefix, decryptedMedia, groupMetadata, arg = '', quotedText, pushName } = messageData;

        if (!groupMetadata?.participants) {
            return sock.sendMessage(from, { text: '❌ Erro no grupo.' }, { quoted: quoteThis });
        }

        const showMode = arg.includes('--show');
        const cleanArg = String(arg || '').replace(/\s--show\b/g, '').trim();
        const everyoneTargets = buildEveryoneTargets(groupMetadata);
        const mentions = everyoneTargets.map((entry) => entry.target);
        const visibleTags = everyoneTargets.map((entry) => entry.tag);
        const type = decryptedMedia?.type || 'text';

        const cdCheck = checkCooldown(from, type, isOwner);
        if (cdCheck.blocked) {
            return sock.sendMessage(from, {
                text: `⏳ ${prefix}everyone ja foi usado recentemente neste grupo. Aguarde ${cdCheck.remaining}.`
            }, { quoted: quoteThis });
        }

        let finalText = '';

        if (cleanArg) {
            finalText = expandEveryonePlaceholder(cleanArg, visibleTags);
        } else if (quotedText) {
            // ✅ REMOVE PREFIXO E COMANDO DA MENSAGEM CITADA (ex: /everyone)
            const cleanQuoted = stripCommandPrefix(quotedText, this.aliases || []);
            finalText = expandEveryonePlaceholder(cleanQuoted, visibleTags);
        } else {
            finalText = '📢 ATENCAO GERAL';
        }

        if (!finalText.trim()) finalText = '📢 ATENCAO GERAL';

        const finalCaption = showMode
            ? buildShowMessage(finalText, everyoneTargets, { pushName })
            : finalText;

        try {
            if (decryptedMedia?.buffer) {
                const { buffer, mimetype } = decryptedMedia;

                if (type === 'sticker') {
                    await sock.sendMessage(from, { sticker: buffer, mimetype, mentions });
                    return;
                }

                if (type === 'image') {
                    await sock.sendMessage(from, { image: buffer, caption: finalCaption, mentions });
                    return;
                }

                if (type === 'video') {
                    await sock.sendMessage(from, { video: buffer, caption: finalCaption, gifPlayback: false, mentions });
                    return;
                }

                if (type === 'audio') {
                    await sock.sendMessage(from, { audio: buffer, mimetype, mentions });
                    return;
                }
            }

            await sock.sendMessage(from, { text: finalCaption, mentions });
        } catch (err) {
            console.error('[EVERYONE] Error ao enviar:', err);
        }
    }
};

module.exports.buildEveryoneTargets = buildEveryoneTargets;
module.exports.expandEveryonePlaceholder = expandEveryonePlaceholder;
module.exports.stripCommandPrefix = stripCommandPrefix;
module.exports.buildShowMessage = buildShowMessage;
module.exports.checkCooldown = checkCooldown;
