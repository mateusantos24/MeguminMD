// lib/commands/admin/remove.js
const config = require('../../../config/config');
const simpleCache = require('../../utils/simpleCache');
const MentionHandler = require('../../utils/mentionHandler');

function toLowerSafe(x) { return (x || '').toString().toLowerCase(); }

function normalizeTarget(userIdOrLid, participants) {
    const raw = toLowerSafe(userIdOrLid);
    const base = raw.split(':')[0];

    const isJid = base.endsWith('@s.whatsapp.net');
    const isLid = base.endsWith('@lid');

    let jid = isJid ? base : null;
    let lid = isLid ? base : null;

    // se veio só número, vira LID (padrão do grupo)
    if (!isJid && !isLid && /^\d{7,17}$/.test(base)) {
        lid = `${base}@lid`;
    }

    // Buscar no array de participantes por id
    if (participants && participants.length > 0) {
        const p = participants.find(pp => {
            const participantId = toLowerSafe(pp.id);
            return participantId === base || participantId === lid || participantId === jid;
        });

        if (p) {
            const participantId = toLowerSafe(p.id);
            if (participantId.endsWith('@s.whatsapp.net')) {
                jid = participantId;
            } else if (participantId.endsWith('@lid')) {
                lid = participantId;
            }
        }
    }

    return { raw: base, jid, lid, id: lid || jid };
}

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
    name: 'remove',
    description: '👢 Remove um membro do grupo',
    category: 'admin',
    aliases: ['ban', 'kick', 'remover', 'k', 'avadakedavra'],
    adminOnly: true,
    groupOnly: true,
    needsBotAdmin: true,

    async execute(sock, messageData) {
        const {
            from,
            prefix,
            quoteThis,
            botForMe = [],
            groupOwner,
            groupOwnerLid,
            groupMetadata
        } = messageData;

        // Capturar menções JID/LID
        let mentioned = MentionHandler.mentionedLidList(quoteThis, groupMetadata);
        mentioned = [...new Set([...mentioned])];

        if (!mentioned || mentioned.length === 0) return await sock.sendMessage(from, { text: `❌ Mencione alguém para remover!\n\n📝 Uso: ${prefix || config.prefixes[0]}remove @usuario @usuario2 @usuario3` }, { quoted: quoteThis });

        // Proteções
        const protectedIds = [
            ...botForMe.map(toLowerSafe),
            ...config.ownerNumber.map(toLowerSafe),
            ...config.ownerLid.map(toLowerSafe),
            toLowerSafe(groupOwner),
            toLowerSafe(groupOwnerLid)
        ];

        const removidos = [];
        const MAX_BATCH = 1000;
        const delay = ms => new Promise(r => setTimeout(r, ms));
        let count = 0;

        for (const targetUser of mentioned) {
            if (count >= MAX_BATCH) break;

            try {
                const target = normalizeTarget(targetUser, groupMetadata.participants);
                if (!target.id) continue;

                // Não remover protegidos (bot/donos)
                if (protectedIds.includes(toLowerSafe(target.id))) {
                    console.log('🛡️ Usuário protegido, pulando:', target.id);
                    continue;
                }

                const participant = findParticipant(target, groupMetadata.participants);
                if (!participant) {
                    console.log('❌ Participante não está no grupo:', target.id);
                    continue;
                }

                // Opcional: impedir kick de admins (recomendado)
                if (participant.admin === 'admin' || participant.admin === 'superadmin') {
                    console.log('🛡️ Não removendo administrador:', participant.id);
                    continue;
                }

                // Usar sempre participant.id (LID/JID)
                const idForUpdate = toLowerSafe(participant.id);
                await sock.groupParticipantsUpdate(from, [idForUpdate], 'remove');
                removidos.push(idForUpdate);
                count++;

                await delay(600);
            } catch (error) {
                console.error('Erro ao remover usuário:', error);
            }
        }

        if (removidos.length > 0) {
            // ✅ Atualizar cache do grupo imediatamente
            try {
                await simpleCache.forceRefreshGroupMetadata(sock, from, 'admin_command');
            } catch (e) {
                console.log('⚠️ Falha ao atualizar metadados do grupo após remover:', e);
            }

            // Mensagem única para todos os removidos
            await sock.sendMessage(
                from,
                {
                    text: `${removidos.map(u => {
                        const user = u.split('@')[0];
                        const memesZuera = [
                            `🍼 Você não é mais bem-vindo aqui @${user}, seu bêbado! Cai fora do meu cabaré!`,
                            `👻 @${user}, sumiu do grupo como fantasma! Adeus, teimoso!`,
                            `🔥 @${user}, você foi expulso com estilo, não volte!`,
                            `🪓 @${user}, cortei seu acesso, volte quando aprender a se comportar!`,
                            `🤡 @${user}, foi expulso por excesso de zoeira! Bye bye!`,
                            `🍕 @${user}, você está fora do grupo e sem pizza pra consolar!`,
                            `🦖 @${user}, foi devorado pela fúria do grupo! Não tente voltar!`,
                            `💩 @${user}, você foi chutado mais rápido que um emoji voador!`,
                            `🚀 @${user}, lançamento imediato para fora do chat! Adeus astronauta!`,
                            `🦹‍♂️ @${user}, seu reinado de troll acabou! O grupo te baniu!`,
                            `🎩 @${user}, mágica do dia: desapareceu do grupo! Não tente truques!`,
                            `💣 @${user}, explosão de expulsão ativada! Boom! Fora do grupo!`,
                            `🛸 @${user}, abduzido pelos aliens da moderação! Até nunca mais!`,
                            `👹 @${user}, você foi banido pelo monstro da moderação! Fique longe!`,
                            `⚡ @${user}, choque instantâneo de remoção! Não tente voltar!`
                        ];
                        return memesZuera[Math.floor(Math.random() * memesZuera.length)];
                    }).join('\n\n')}`,
                    mentions: removidos
                },
                { quoted: quoteThis }
            );
        } else {
            await sock.sendMessage(from, { text: '⚠️ Nenhum usuário foi removido. Verifique se eles estão no grupo, se já saíram ou se são administradores.'}, { quoted: quoteThis }
            );
        }
    }
};
