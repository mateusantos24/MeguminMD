const simpleCache = require('../../utils/simpleCache');

module.exports = {
    name: 'msgtempo',
    description: '⏰ Ativa ou desativa mensagens temporarias no grupo',
    category: 'admin',
    aliases: ['ephemeral', 'temporarias', 'msgtemp', 'tempmsg'],
    adminOnly: true,
    groupOnly: true,
    needsBotAdmin: true,

    async execute(sock, messageData, args) {
        const { from, groupName, prefix, quoteThis, groupMetadata } = messageData;

        const timeMap = {
            'off': 0, '0': 0, 'desativar': 0,
            '24h': 86400, '1d': 86400,
            '7d': 604800, '1w': 604800,
            '90d': 7776000, '3m': 7776000
        };

        const currentEphemeral = groupMetadata?.ephemeralDuration || 0;

        if (!args[0]) {
            return await sock.sendMessage(from, {
                text: `❌ *Argumento obrigatório!*\n\n╭─「 📋 *COMO USAR* 」\n│\n├─ ⏰ *Desativar:* ${prefix}msgtempo off\n├─ ⏰ *24 horas:* ${prefix}msgtempo 24h\n├─ ⏰ *7 dias:* ${prefix}msgtempo 7d\n├─ ⏰ *90 dias:* ${prefix}msgtempo 90d\n│\n├─ 🔒 *Estado atual:* ${currentEphemeral === 0 ? 'DESATIVADO' : `${currentEphemeral / 86400} dia(s)`}\n╰─────────────────`
            }, { quoted: quoteThis });
        }

        const action = args[0].toLowerCase();

        if (!Object.prototype.hasOwnProperty.call(timeMap, action)) {
            return await sock.sendMessage(from, {
                text: `❌ *Argumento inválido!*\n\n╭─「 📋 *COMO USAR* 」\n│\n├─ ⏰ *Desativar:* ${prefix}msgtempo off\n├─ ⏰ *24 horas:* ${prefix}msgtempo 24h\n├─ ⏰ *7 dias:* ${prefix}msgtempo 7d\n├─ ⏰ *90 dias:* ${prefix}msgtempo 90d\n│\n├─ 🔒 *Estado atual:* ${currentEphemeral === 0 ? 'DESATIVADO' : `${currentEphemeral / 86400} dia(s)`}\n╰─────────────────`
            }, { quoted: quoteThis });
        }

        const duration = timeMap[action];

        // ✅ VERIFICAR SE JÁ ESTÁ NO ESTADO DESEJADO
        if (duration === currentEphemeral) {
            const durationText = duration === 0 ? 'Desativado' : duration === 86400 ? '24 horas' : duration === 604800 ? '7 dias' : '90 dias';

            return await sock.sendMessage(from, {
                text: `⚠️ *Configuração já ativa!*

╭─「 ℹ️ *INFORMAÇÃO* 」
│
├─ 🏷️ *Grupo:* ${groupName || 'Este grupo'}
├─ ⏰ *Duração atual:* ${durationText}
│
└─ 💡 *Descrição:*
   As mensagens temporárias já estão
   configuradas para ${durationText.toLowerCase()}.
   Nenhuma alteração foi feita.
╰─────────────────`
            }, { quoted: quoteThis });
        }

        try {
            await sock.groupToggleEphemeral(from, duration);
            await simpleCache.forceRefreshGroupMetadata(sock, from, 'admin_command');
            const statusText = duration === 0 ? 'DESATIVADO' : 'ATIVADO';
            const durationText = duration === 0 ? 'Desativado' : duration === 86400 ? '24 horas' : duration === 604800 ? '7 dias' : '90 dias';
            await sock.sendMessage(from, {
                text: `${duration === 0 ? '🔓' : '⏰'} *MENSAGENS TEMPORÁRIAS ${statusText}*\n\n╭─「 ✅ *SUCESSO* 」\n│\n├─ 🏷️ *Grupo:* ${groupName || 'Este grupo'}\n├─ 🔧 *Status:* ${statusText}\n├─ ⏰ *Duração:* ${durationText}\n│\n└─ 🕐 ${new Date().toLocaleString('pt-BR')}\n╰─────────────────\n\n${duration !== 0 ? '⚠️ *Atenção:* Mensagens antigas não serão afetadas!' : '✅ *Mensagens não serão mais apagadas!*'}`
            }, { quoted: quoteThis });
        } catch (error) {
            console.error('❌ Erro:', error);
            await sock.sendMessage(from, { text: `❌ *Erro:* ${error.message || 'Erro desconhecido'}` }, { quoted: quoteThis });
        }
    }
};
