// lib/commands/geral/atividade.js

const config = require('../../../config/config');
const { isBotOwner } = require('../../utils/others');
const SimpleCache = require('../../utils/simpleCache');

const yes = (v) => (v ? '✅' : '❌');

module.exports = {
    name: 'atividade',
    description: '\u{1F527} Mostra atividade e privilegios no grupo',
    category: 'utilitarios',
    aliases: ['log'],
    groupOnly: true,

    async execute(sock, messageData) {
        const { from, sender, participantLid, pushName, isGroup, message } = messageData;

        const LIDorPN = participantLid || sender;

        if (!isGroup) {
            return sock.sendMessage(LIDorPN, {
                text: '❌ Este comando só funciona em grupos.'
            }, { quoted: message });
        }

        // ========================================
        // OBTER METADATA ATUALIZADO
        // ========================================
        let metadata = await SimpleCache.getGroupMetadata(sock, from).catch(() => null);

        if (!metadata) {
            try {
                metadata = await SimpleCache.forceRefreshGroupMetadata(sock, from, 'atividade');
            } catch {
                /* empty */
            }
        }

        const subject = metadata?.subject || '(sem nome)';
        const participants = Array.isArray(metadata?.participants) ? metadata.participants : [];
        const totalMembers = participants.length;
        const totalAdmins = participants.filter(p => !!p.admin).length;

        // ========================================
        // ✅ CORRIGIDO: BUSCAR SUPERADMIN (DONO)
        // Separar JID e LID corretamente
        // ========================================

        // Buscar quem tem admin: 'superadmin' (dono do grupo)
        const ownerParticipant = participants.find(p => p.admin === 'superadmin');

        // ✅ SEPARAR JID E LID CORRETAMENTE
        let ownerJid = null;
        let ownerLid = null;

        if (ownerParticipant) {
            // Prioridade para JID: id > phoneNumber
            if (ownerParticipant.id && ownerParticipant.id.includes('@s.whatsapp.net')) {
                ownerJid = ownerParticipant.id;
            } else if (ownerParticipant.phoneNumber && ownerParticipant.phoneNumber.includes('@s.whatsapp.net')) {
                ownerJid = ownerParticipant.phoneNumber;
            }

            // Prioridade para LID: lid > id (se for @lid)
            if (ownerParticipant.lid && ownerParticipant.lid.includes('@lid')) {
                ownerLid = ownerParticipant.lid;
            } else if (ownerParticipant.id && ownerParticipant.id.includes('@lid')) {
                ownerLid = ownerParticipant.id;
            }
        }

        // Fallback: tentar propriedades antigas do metadata (caso existam)
        const fallbackOwnerLid = metadata?.owner || metadata?.subjectOwner || metadata?.author || ownerLid;
        const fallbackOwnerJid = metadata?.ownerJid || metadata?.ownerPn || metadata?.subjectOwnerPn || ownerJid;

        // ========================================
        // VERIFICAR PRIVILÉGIOS
        // ========================================

        const info = SimpleCache.getGroupInfo(metadata, 'group');
        const adminByUser = SimpleCache.isUserAdmin(sender, info, participantLid);
        const adminByLid = SimpleCache.isUserAdmin(null, info, participantLid);

        // ✅ VERIFICAR SE É DONO DO GRUPO (usando JID ou LID)
        const isGroupOwnerByJid = (fallbackOwnerJid && sender && fallbackOwnerJid.toLowerCase() === sender.toLowerCase());

        const isGroupOwnerByLid = (fallbackOwnerLid && participantLid && fallbackOwnerLid.toLowerCase() === participantLid.toLowerCase());

        // ✅ VERIFICAR SE TEM admin: 'superadmin'
        const userParticipant = participants.find(p => (p.id && sender && p.id.toLowerCase() === sender.toLowerCase()) || (p.lid && participantLid && p.lid.toLowerCase() === participantLid.toLowerCase()));
        const isSuperAdmin = userParticipant?.admin === 'superadmin';

        // Resultado final: é dono se for superadmin OU se bater JID/LID com owner
        const isGroupOwner = isSuperAdmin || isGroupOwnerByJid || isGroupOwnerByLid;
        const botIsAdmin = SimpleCache.isBotAdmin(sock.user?.id, info, sock.user?.lid);

        // ========================================
        // MENSAGEM FINAL
        // ========================================
        const text = [
            `📊 ${subject}`,
            `├─ 🆔 Grupo: ${from}`,
            `├─ 👤 Usuário: ${sender || '-'}`,
            `├─ 🔑 LID usuário: ${participantLid || '-'}`,
            `└─ 🪪 Nome: ${pushName || '-'}`,
            ``,
            `👑 Dono do grupo`,
            `├─ 📱 JID: ${ownerJid || '-'}`,
            `├─ 🔒 LID: ${ownerLid || '-'}`,
            `└─ 🌟 SuperAdmin: ${yes(isSuperAdmin)}`,
            ``,
            `👥 Membros & Admins`,
            `├─ 🛡️ Admins: ${totalAdmins}`,
            `└─ 👥 Total: ${totalMembers}`,
            ``,
            `✅ Privilégios`,
            `├─ Admin (user/jid)? ${yes(adminByUser)}`,
            `├─ Admin (lid)? ${yes(adminByLid)}`,
            `├─ É dono do grupo? ${yes(isGroupOwner)}`,
            `├─ É superadmin? ${yes(isSuperAdmin)}`,
            `├─ É dono programado? ${yes(isBotOwner(LIDorPN, config))}`,
            `└─ Bot é admin? ${yes(botIsAdmin)}`
        ].join('\n');

        await sock.sendMessage(from, { text }, { quoted: message });
    }
};
