// lib/commands/admin/deleted.js
const chalk = require('chalk');

module.exports = {
    name: 'deleted',
    description: '🗑️ Apaga mensagens marcadas pelo usuario',
    category: 'admin',
    aliases: ['d', 'apg', 'apagar', 'deletar', 'delete'],
    adminOnlyOrPv: true,
    groupOnly: true,
    needsBotAdmin: false,

    async execute(sock, messageData, args, rawMessage) {
        const { from, quoteThis, isAdmin, isOwner, isBotAdmin, participantLid } = messageData;

        try {
            // Desembrulhar mensagem efêmera se existir
            let innerMsg = rawMessage.message;
            if (innerMsg?.ephemeralMessage) {
                innerMsg = innerMsg.ephemeralMessage.message;
            }

            // Extrair contextInfo de diferentes tipos de mensagem
            const contextInfo =
                innerMsg?.extendedTextMessage?.contextInfo ||
                innerMsg?.imageMessage?.contextInfo ||
                innerMsg?.videoMessage?.contextInfo ||
                innerMsg?.stickerMessage?.contextInfo ||
                innerMsg?.audioMessage?.contextInfo ||
                innerMsg?.documentMessage?.contextInfo ||
                innerMsg?.viewOnceMessage?.message?.contextInfo;

            const messageIdToDelete = contextInfo?.stanzaId || contextInfo?.quotedStanzaId;
            const participantToDelete = contextInfo?.participant || contextInfo?.participantLid;

            if (!contextInfo || !messageIdToDelete) {
                return sock.sendMessage(from, { text: '❗ Responda a uma mensagem para apagá-la.' }, { quoted: quoteThis });
            }

            const botId = sock?.user?.id ? String(sock.user.id) : null;
            const botLid = sock?.user?.lid ? String(sock.user.lid) : null;
            const targetParticipant = participantToDelete ? String(participantToDelete) : null;
            const isTargetBot =
                (!!botId && !!targetParticipant && targetParticipant === botId)
                || (!!botLid && !!targetParticipant && targetParticipant === botLid);

            const isCallerAdmin = !!(isOwner || isAdmin);
            const isCallerSelf = !!(participantLid && targetParticipant && String(participantLid) === targetParticipant);

            if (!isCallerAdmin && !isCallerSelf && !isTargetBot) {
                return sock.sendMessage(from, { text: '❌ Você só pode apagar sua própria mensagem (ou peça a um admin).' }, { quoted: quoteThis });
            }

            /* if (!isTargetBot && !isBotAdmin) {
                return sock.sendMessage(from, { text: '❌ Eu só consigo apagar mensagens do grupo quando sou admin. Sem admin, só apago mensagens enviadas por mim.' }, { quoted: quoteThis });
            }*/

            const deleteKey = isTargetBot ? { remoteJid: from, fromMe: true, id: messageIdToDelete } : { remoteJid: from, fromMe: false, id: messageIdToDelete };

            if (!isTargetBot && targetParticipant) {
                deleteKey.participant = targetParticipant;
            }

            const deleteMessage = { key: deleteKey };
            console.log(deleteMessage);

            // Apaga a mensagem usando sock.del quando disponível, ou fallback para sendMessage({ delete })
            if (typeof sock.del === 'function') {
                await sock.del(deleteMessage);
            } else {
                await sock.sendMessage(from, { delete: deleteKey });
            }

            await sock.sendMessage(from, {
                text: '✅ *Mensagem apagada com sucesso!*'
            }, { quoted: quoteThis });

        } catch (error) {
            console.error(chalk.red('❌ Erro ao apagar mensagem:'), error);
            await sock.sendMessage(from, {
                text: '❌ Falha ao apagar a mensagem. Verifique se eu tenho permissão (admin) e se a mensagem ainda pode ser apagada.'
            }, { quoted: quoteThis });
        }
    }
};
