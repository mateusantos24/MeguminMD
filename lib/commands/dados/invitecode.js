function cleanText(value) {
    return String(value || '')
        .replace(/`+/g, '')
        .replace(/[\u200B-\u200F\u202A-\u202E]/g, '')
        .trim();
}

function extractInviteCode(input) {
    const text = cleanText(input);
    if (!text) return null;

    const linkMatch = text.match(/(?:https?:\/\/)?chat\.whatsapp\.com\/([A-Za-z0-9]+)/i);
    if (linkMatch?.[1]) return linkMatch[1];

    const codeMatch = text.match(/\b([A-Za-z0-9]{20,30})\b/);
    return codeMatch?.[1] || null;
}

function maskInviteCode(value) {
    const text = String(value || '').trim();
    if (!text) return '*****';
    return '*'.repeat(Math.min(Math.max(text.length, 5), 12));
}

function maskInviteLinks(value) {
    return String(value || '').replace(
        /(?:https?:\/\/)?chat\.whatsapp\.com\/[A-Za-z0-9]+/gi,
        'chat.whatsapp.com/*****'
    );
}

function getInviteInfoSock(sock) {
    if (sock && typeof sock.groupGetInviteInfo === 'function') return sock;

    try {
        const runtimeSock = typeof global.getSock === 'function' ? global.getSock() : null;
        if (runtimeSock && typeof runtimeSock.groupGetInviteInfo === 'function') return runtimeSock;
    } catch {
        // ignore runtime socket lookup failure
    }

    return null;
}

function formatDateFromSeconds(seconds) {
    const numeric = Number(seconds || 0);
    if (!numeric) return 'Não informado';

    const date = new Date(numeric * 1000);
    if (Number.isNaN(date.getTime())) return 'Não informado';
    return date.toLocaleString('pt-BR');
}

function formatBoolean(value, yes = 'Sim', no = 'Não') {
    return value ? yes : no;
}

function formatJid(value) {
    const text = String(value || '').trim();
    if (!text) return 'Não informado';
    return text;
}

function formatPhoneFromJid(value) {
    const text = String(value || '').trim();
    if (!text) return null;

    const digits = text.replace(/\D/g, '');
    return digits || null;
}

function formatDuration(seconds) {
    const numeric = Number(seconds || 0);
    if (!numeric) return 'Desativadas';

    const units = [
        { label: 'dia', secs: 86400 },
        { label: 'hora', secs: 3600 },
        { label: 'min', secs: 60 },
        { label: 'seg', secs: 1 }
    ];

    for (const unit of units) {
        if (numeric >= unit.secs && numeric % unit.secs === 0) {
            const amount = numeric / unit.secs;
            const plural = unit.label === 'min' || unit.label === 'seg'
                ? unit.label
                : `${unit.label}${amount > 1 ? 's' : ''}`;
            return `${amount} ${plural}`;
        }
    }

    return `${numeric} seg`;
}

function buildParticipantSummary(participants = []) {
    if (!Array.isArray(participants) || participants.length === 0) {
        return {
            adminCount: 0,
            sample: []
        };
    }

    const admins = participants.filter((participant) => participant?.admin);
    const sample = participants.slice(0, 5).map((participant, index) => {
        const phone = formatPhoneFromJid(participant?.phoneNumber) || formatJid(participant?.id);
        const role = participant?.admin === 'superadmin'
            ? 'Dono'
            : participant?.admin === 'admin'
                ? 'Admin'
                : 'Membro';
        return `${index + 1}. ${phone} (${role})`;
    });

    return {
        adminCount: admins.length,
        sample
    };
}

function buildResponse(info, inviteCode) {
    const subject = info?.subject || 'Grupo sem nome';
    const description = maskInviteLinks(cleanText(info?.desc)) || 'Sem descrição';
    const ownerPhone = formatPhoneFromJid(info?.ownerPn);
    const subjectOwnerPhone = formatPhoneFromJid(info?.subjectOwnerPn);
    const participantSummary = buildParticipantSummary(info?.participants);
    const linkedParent = formatJid(info?.linkedParent);

    const lines = [
        '🔎 *INFO DO CONVITE*',
        '',
        `🔑 *Código:* ${maskInviteCode(inviteCode)}`,
        `🆔 *ID:* ${formatJid(info?.id)}`,
        `📛 *Nome:* ${subject}`,
        `👥 *Membros:* ${Number(info?.size || 0).toLocaleString('pt-BR')}`,
        `👮 *Admins visíveis:* ${participantSummary.adminCount}`,
        `📅 *Criado em:* ${formatDateFromSeconds(info?.creation)}`,
        `📝 *Assunto alterado em:* ${formatDateFromSeconds(info?.subjectTime)}`,
        `🌎 *País do dono:* ${info?.owner_country_code || 'Não informado'}`,
        `👑 *Owner:* ${ownerPhone || formatJid(info?.owner)}`,
        `✏️ *Subject owner:* ${subjectOwnerPhone || formatJid(info?.subjectOwner)}`,
        `🔗 *Comunidade pai:* ${linkedParent === 'Não informado' ? 'Não possui' : linkedParent}`,
        '',
        '*⚙️ Configurações*',
        `• Aprovação para entrar: ${formatBoolean(info?.joinApprovalMode, 'Ativada', 'Desativada')}`,
        `• Apenas admins editam: ${formatBoolean(info?.restrict, 'Sim', 'Não')}`,
        `• Somente admins falam: ${formatBoolean(info?.announce, 'Sim', 'Não')}`,
        `• Membro pode adicionar: ${formatBoolean(info?.memberAddMode, 'Sim', 'Não')}`,
        `• Mensagens temporárias: ${formatDuration(info?.ephemeralDuration)}`,
        `• Comunidade: ${formatBoolean(info?.isCommunity)}`,
        `• Comunidade anúncio: ${formatBoolean(info?.isCommunityAnnounce)}`,
        '',
        '*📄 Descrição*',
        description.length > 1200 ? `${description.slice(0, 1197)}...` : description
    ];

    if (participantSummary.sample.length) {
        lines.push('', '*👤 Participantes visíveis na resposta*', ...participantSummary.sample);
    }

    return lines.join('\n');
}

function buildHelp(prefix = '/') {
    return (
        `🔗 *CONSULTAR CONVITE DE GRUPO*\n\n` +
        `Use assim:\n` +
        `${prefix}invitecode *****\n` +
        `${prefix}invitecode chat.whatsapp.com/*****\n\n` +
        `Você também pode responder a mensagem com o link e usar:\n` +
        `${prefix}invitecode`
    );
}

module.exports = {
    name: 'invitecode',
    description: '🔗 Consulta informações de um grupo pelo código ou link de convite',
    category: 'dados',
    aliases: ['inviteinfo', 'groupinvite', 'linkgrupo'],

    async execute(sock, messageData) {
        const { from, quoteThis, prefix = '/', args = [], arg, body, quotedText } = messageData;

        const combinedInput = [
            Array.isArray(args) ? args.join(' ') : '',
            arg,
            body,
            quotedText
        ].map(cleanText).filter(Boolean).join('\n');

        const inviteCode = extractInviteCode(combinedInput);

        if (!inviteCode) {
            return sock.sendMessage(from, {
                text: buildHelp(prefix)
            }, { quoted: quoteThis });
        }

        await sock.sendMessage(from, {
            text: `🔎 Buscando informações do convite \`${maskInviteCode(inviteCode)}\`...`
        }, { quoted: quoteThis });

        try {
            const inviteSock = getInviteInfoSock(sock);
            if (!inviteSock) {
                return sock.sendMessage(from, {
                    text:
                        `❌ Não consegui consultar convites por aqui agora.\n\n` +
                        `O WhatsApp do bot ainda não está disponível para essa consulta.`
                }, { quoted: quoteThis });
            }

            const info = await inviteSock.groupGetInviteInfo(inviteCode);
            const response = buildResponse(info, inviteCode);
            await sock.sendMessage(from, {
                text: response
            }, { quoted: quoteThis });
        } catch (error) {
            console.error('[invitecode] erro ao consultar convite:', error);
            await sock.sendMessage(from, {
                text:
                    `❌ Não consegui consultar esse convite.\n\n` +
                    `Verifique se o código/link está correto e se o convite ainda está ativo.`
            }, { quoted: quoteThis });
        }
    },

    _internals: {
        buildHelp,
        buildResponse,
        extractInviteCode,
        maskInviteLinks,
        maskInviteCode
    }
};
