const simpleCache = require('../../utils/simpleCache');

module.exports = {
    name: 'onlyadm',
    description: '🔒 Ativa o modo somente admins no grupo',
    category: 'admin',
    aliases: ['soadm', 'admonly', 'grupofechar', 'grupotrancar', 'lockgroup', 'unlockgroup'],
    adminOnly: true,
    groupOnly: true,
    needsBotAdmin: true,

    async execute(sock, messageData) {
        const { from, groupName, args, prefix, quoteThis, groupMetadata } = messageData;
        const isCurrentlyLocked = groupMetadata?.announce || false;
        let enable;

        if (args[0]) {
            const action = args[0].toLowerCase();
            if (!['on', 'off', '1', '0', 'ativar', 'desativar'].includes(action)) {
                return await sock.sendMessage(from, {
                    text: `❌ *Uso incorreto!*\n\n╭─「 📋 *COMO USAR* 」\n│\n├─ ✅ *Ativar:* ${prefix}onlyadm on\n├─ ❌ *Desativar:* ${prefix}onlyadm off\n├─ 🔄 *Alternar:* ${prefix}onlyadm\n│\n├─ 🔒 *Estado atual:* ${isCurrentlyLocked ? 'FECHADO' : 'ABERTO'}\n╰─────────────────`
                }, { quoted: quoteThis });
            }
            enable = ['on', '1', 'ativar'].includes(action);
        } else {
            enable = !isCurrentlyLocked;
        }

        try {
            await sock.groupSettingUpdate(from, enable ? 'announcement' : 'not_announcement');

            // ✅ FORÇAR REFRESH DO CACHE
            await simpleCache.forceRefreshGroupMetadata(sock, from, 'admin_command');

            const statusText = enable ? 'ATIVADO' : 'DESATIVADO';
            await sock.sendMessage(from, {
                text: `${enable ? '🔒' : '🔓'} *MODO SOMENTE ADMINS ${statusText}*\n\n╭─「 ✅ *SUCESSO* 」\n│\n├─ 🏷️ *Grupo:* ${groupName || 'Este grupo'}\n├─ 🔧 *Status:* ${statusText}\n│\n└─ 🕐 ${new Date().toLocaleString('pt-BR')}\n╰─────────────────\n\n${enable ? '⚠️ *Atenção:* Novos membros não poderão enviar mensagens!' : '✅ *Grupo liberado para todos!*'}`
            }, { quoted: quoteThis });
        } catch (error) {
            console.error('❌ Erro ao alterar configuração do grupo:', error);
            await sock.sendMessage(from, { text: `❌ *Erro:* ${error.message || 'Erro desconhecido'}` });
        }
    }
};
