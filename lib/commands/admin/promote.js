// lib/commands/admin/promote.js
const config = require('../../../config/config');
const simpleCache = require('../../utils/simpleCache');
const MentionHandler = require('../../utils/mentionHandler');

function toLowerSafe(x) {
    return (x || '').toString().toLowerCase();
}

/**
 * ✅ CORRIGIDO: Normalizar target (JID, LID ou número)
 * Busca em TODOS os campos do participant: id, lid, phoneNumber, jid
 */
function normalizeTarget(userIdOrLid, participants) {
    const raw = toLowerSafe(userIdOrLid);
    const base = raw.split(':')[0];

    const isJid = base.endsWith('@s.whatsapp.net');
    const isLid = base.endsWith('@lid');

    let jid = isJid ? base : null;
    let lid = isLid ? base : null;

    // ✅ Se veio só número, vira LID (padrão do grupo)
    if (!isJid && !isLid && /^\d{7,17}$/.test(base)) {
        lid = `${base}@lid`;
    }

    // ✅ Buscar no array de participantes (agora busca id, lid, phoneNumber, jid)
    if (participants && participants.length > 0) {
        const p = participants.find(pp => {
            const participantId = toLowerSafe(pp.id);
            const participantLid = toLowerSafe(pp.lid);
            const participantPhone = toLowerSafe(pp.phoneNumber);
            const participantJid = toLowerSafe(pp.jid);

            // Comparar com todos os campos
            return (
                participantId === base ||
                participantId === lid ||
                participantId === jid ||
                participantLid === base ||
                participantLid === lid ||
                participantLid === jid ||
                participantPhone === base ||
                participantPhone === lid ||
                participantPhone === jid ||
                participantJid === base ||
                participantJid === lid ||
                participantJid === jid
            );
        });

        if (p) {
            // ✅ Extrair JID e LID do participant encontrado

            // JID: prioridade id > phoneNumber > jid
            if (p.id && p.id.includes('@s.whatsapp.net')) {
                jid = toLowerSafe(p.id);
            } else if (p.phoneNumber && p.phoneNumber.includes('@s.whatsapp.net')) {
                jid = toLowerSafe(p.phoneNumber);
            } else if (p.jid && p.jid.includes('@s.whatsapp.net')) {
                jid = toLowerSafe(p.jid);
            }

            // LID: prioridade lid > id (se for @lid)
            if (p.lid && p.lid.includes('@lid')) {
                lid = toLowerSafe(p.lid);
            } else if (p.id && p.id.includes('@lid')) {
                lid = toLowerSafe(p.id);
            }
        }
    }

    return {
        raw: base,
        jid,
        lid,
        id: lid || jid  // Prioridade: LID > JID
    };
}

/**
 * ✅ CORRIGIDO: Encontrar participant
 * Busca em TODOS os campos: id, lid, phoneNumber, jid
 */
function findParticipant(target, participants) {
    if (!participants || participants.length === 0) return null;

    const t = target;

    return participants.find(pp => {
        const participantId = toLowerSafe(pp.id);
        const participantLid = toLowerSafe(pp.lid);
        const participantPhone = toLowerSafe(pp.phoneNumber);
        const participantJid = toLowerSafe(pp.jid);

        // ✅ Comparar TODOS os campos possíveis
        const matches = (
            // Comparar com raw (input original)
            participantId === t.raw ||
            participantLid === t.raw ||
            participantPhone === t.raw ||
            participantJid === t.raw ||

            // Comparar com id (normalizado)
            participantId === t.id ||
            participantLid === t.id ||
            participantPhone === t.id ||
            participantJid === t.id ||

            // Comparar com jid
            (t.jid && (
                participantId === t.jid ||
                participantPhone === t.jid ||
                participantJid === t.jid
            )) ||

            // Comparar com lid
            (t.lid && (
                participantId === t.lid ||
                participantLid === t.lid
            ))
        );
        return matches;
    });
}

module.exports = {
    name: 'promote',
    description: '📈 Promove um membro para administrador',
    category: 'admin',
    aliases: ['promover', 'promote', 'addadmin'],
    adminOnly: true,
    groupOnly: true,
    needsBotAdmin: true,

    async execute(sock, messageData) {
        const {
            from,
            prefix,
            quoteThis,
            groupMetadata,
            botForMe = [],
            groupOwner,
            groupOwnerLid
        } = messageData;

        // Opcional: atualizar metadados do grupo antes
        try {
            await simpleCache.forceRefreshGroupMetadata(sock, from, 'admin_command');
        } catch (e) {
            console.log('⚠️ Falha ao atualizar metadados do grupo antes de promover:', e);
            // segue mesmo se falhar refresh
        }

        // Capturar menções JID/LID
        let mentioned = MentionHandler.mentionedLidList(quoteThis, groupMetadata);
        mentioned = [...new Set([...mentioned])];

        if (!mentioned || mentioned.length === 0) {
            await sock.sendMessage(
                from,
                { text: `❌ Mencione alguém para promover!\n\n📝 Uso: ${prefix || config.prefixes[0]}promote @usuario` },
                { quoted: quoteThis }
            );
            return;
        }

        const promoted = [];
        const delay = ms => new Promise(r => setTimeout(r, ms));
        const MAX_BATCH = 10;
        let count = 0;

        for (const m of mentioned) {
            if (count >= MAX_BATCH) break;
            try {
                const target = normalizeTarget(m, groupMetadata.participants);
                if (!target.id) {
                    console.log('❌ Target sem ID válido');
                    continue;
                }

                // Proteções (mesma lógica do demote.js)
                const protectedIds = [
                    ...botForMe.map(toLowerSafe),
                    ...config.ownerNumber.map(toLowerSafe),
                    ...config.ownerLid.map(toLowerSafe),
                    toLowerSafe(groupOwner),
                    toLowerSafe(groupOwnerLid)
                ];

                if (protectedIds.includes(toLowerSafe(target.id))) {
                    console.log('🛡️ Usuário protegido, pulando');
                    continue;
                }

                const participant = findParticipant(target, groupMetadata.participants);
                if (!participant) {
                    console.log('❌ Participante não está no grupo');
                    continue;
                }

                // Se já é admin/superadmin, ignora
                if (participant.admin === 'admin' || participant.admin === 'superadmin') {
                    console.log('ℹ️ Usuário já é administrador');
                    continue;
                }

                // Usar o id do participante encontrado (LID/JID)
                const idForUpdate = toLowerSafe(participant.id);
                console.log('🔄 Tentando promover:', idForUpdate);

                await sock.groupParticipantsUpdate(from, [idForUpdate], 'promote');
                promoted.push(idForUpdate);
                count++;

                await delay(800);
            } catch (e) {
                console.error('❌ Erro ao promover usuário:', e);
            }
        }

        if (promoted.length > 0) {
            // ✅ Atualizar cache do grupo imediatamente
            try {
                await simpleCache.forceRefreshGroupMetadata(sock, from, 'admin_command');
            } catch (e) {
                console.log('⚠️ Falha ao atualizar metadados do grupo após promover:', e);
            }

            await sock.sendMessage(
                from,
                {
                    text: `👑 *PROMOÇÃO APLICADA:*\n\n${promoted
                        .map(u => `├─ 👤 Usuário: @${u.split('@')[0]}\n├─ 🔼 Ação: Promovido a administrador`)
                        .join('\n\n')}`,
                    mentions: promoted
                },
                { quoted: quoteThis }
            );
        } else {
            await sock.sendMessage(
                from,
                { text: '⚠️ Não foi possível promover nenhum usuário. Verifique se eles estão no grupo ou já são administradores.' },
                { quoted: quoteThis }
            );
        }
    }
};
