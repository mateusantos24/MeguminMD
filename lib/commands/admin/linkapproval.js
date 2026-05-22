const simpleCache = require('../../utils/simpleCache');

module.exports = {
    name: 'linkapproval',
    description: '🔐 Exige aprovacao de admin para novos membros',
    category: 'admin',
    aliases: ['aprovacao', 'approval', 'autorizarmembros'],
    adminOnly: true,
    groupOnly: true,
    needsBotAdmin: true,

    async execute(sock, messageData, args) {
        const { from, groupName, prefix, groupMetadata, quoteThis } = messageData;

        const currentMode = groupMetadata?.joinApprovalMode || false;
        let enable;

        if (args[0]) {
            const action = args[0].toLowerCase();
            if (!['on', 'off', '1', '0', 'ativar', 'desativar'].includes(action)) {
                return await sock.sendMessage(from, {
                    text: `❌ *Uso incorreto!*\n\n╭─「 📋 *COMO USAR* 」\n│\n├─ ✅ *Ativar:* ${prefix}linkapproval on\n├─ ❌ *Desativar:* ${prefix}linkapproval off\n│\n├─ 🔒 *Estado atual:* ${currentMode ? 'ATIVADO' : 'DESATIVADO'}\n╰─────────────────`
                }, { quoted: quoteThis });
            }
            enable = ['on', '1', 'ativar'].includes(action);
        } else {
            enable = !currentMode;
        }

        // ✅ VERIFICAR SE JÁ ESTÁ NO ESTADO DESEJADO
        if ((enable && currentMode) || (!enable && !currentMode)) {
            return await sock.sendMessage(from, {
                text: `⚠️ *Configuração já ativa!*

╭─「 ℹ️ *INFORMAÇÃO* 」
│
├─ 🏷️ *Grupo:* ${groupName || 'Este grupo'}
├─ 🔧 *Estado atual:* ${enable ? 'ATIVADO' : 'DESATIVADO'}
│
└─ 💡 *Descrição:*
   A aprovação de membros já está ${enable ? 'ativada' : 'desativada'}.
   Nenhuma alteração foi feita.
╰─────────────────`
            }, { quoted: quoteThis });
        }

        try {
            await sock.groupJoinApprovalMode(from, enable ? 'on' : 'off');
            await simpleCache.forceRefreshGroupMetadata(sock, from, 'admin_command');
            const statusText = enable ? 'ATIVADO' : 'DESATIVADO';
            await sock.sendMessage(from, {
                text: `${enable ? '🔒' : '✅'} *APROVAÇÃO DE MEMBROS ${statusText}*\n\n╭─「 ✅ *SUCESSO* 」\n│\n├─ 🏷️ *Grupo:* ${groupName || 'Este grupo'}\n├─ 🔧 *Status:* ${statusText}\n│\n└─ 🕐 ${new Date().toLocaleString('pt-BR')}\n╰─────────────────\n\n${enable ? '⚠️ *Atenção:* Pessoas que entrarem via link precisarão de aprovação!' : '✅ *Entrada livre via link!*'}`
            }, { quoted: quoteThis });
        } catch (error) {
            console.error('❌ Erro:', error);
            await sock.sendMessage(from, { text: `❌ *Erro:* ${error.message || 'Erro desconhecido'}` }, { quoted: quoteThis });
        }
    }
};
