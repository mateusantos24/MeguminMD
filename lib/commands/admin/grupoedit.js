const simpleCache = require('../../utils/simpleCache');

module.exports = {
    name: 'grupoedit',
    description: '✏️ Define quem pode editar as informacoes do grupo',
    category: 'admin',
    aliases: ['editgroup', 'editgrupo', 'grupoconfig'],
    adminOnly: true,
    groupOnly: true,
    needsBotAdmin: true,

    async execute(sock, messageData, args) {
        const { from, groupName, prefix, groupMetadata, quoteThis } = messageData;

        const currentMode = groupMetadata?.restrict || false;
        let enable;

        if (args[0]) {
            const action = args[0].toLowerCase();
            if (!['todos', 'all', 'admins', 'admin', 'soadm'].includes(action)) {
                return await sock.sendMessage(from, {
                    text: `❌ *Uso incorreto!*\n\n╭─「 📋 *COMO USAR* 」\n│\n├─ ✅ *Todos podem editar:* ${prefix}grupoedit todos\n├─ ⚠️ *Somente admins:* ${prefix}grupoedit admins\n│\n├─ 🔒 *Estado atual:* ${currentMode ? 'SOMENTE ADMINS' : 'TODOS'}\n╰─────────────────`
                });
            }
            enable = ['admins', 'admin', 'soadm'].includes(action);
        } else {
            enable = !currentMode;
        }

        // ✅ VERIFICAR SE JÁ ESTÁ NO ESTADO DESEJADO
        if ((enable && currentMode) || (!enable && !currentMode)) {
            const statusText = enable ? 'SOMENTE ADMINS' : 'TODOS';
            return await sock.sendMessage(from, {
                text: `⚠️ *Configuração já ativa!*

╭─「 ℹ️ *INFORMAÇÃO* 」
│
├─ 🏷️ *Grupo:* ${groupName || 'Este grupo'}
├─ 🔧 *Modo atual:* ${statusText}
│
└─ 💡 *Descrição:*
   ${enable ? 'Apenas admins já podem editar o grupo' : 'Todos já podem editar o grupo'}.
   Nenhuma alteração foi feita.
╰─────────────────`
            }, { quoted: quoteThis });
        }

        try {
            await sock.groupSettingUpdate(from, enable ? 'locked' : 'unlocked');
            await simpleCache.forceRefreshGroupMetadata(sock, from, 'admin_command');

            const statusText = enable ? 'SOMENTE ADMINS' : 'TODOS';

            await sock.sendMessage(from, {
                text: `${enable ? '🔒' : '✅'} *EDIÇÃO DO GRUPO: ${statusText}*\n\n╭─「 ✅ *SUCESSO* 」\n│\n├─ 🏷️ *Grupo:* ${groupName || 'Este grupo'}\n├─ 🔧 *Modo:* ${statusText}\n│\n└─ 🕐 ${new Date().toLocaleString('pt-BR')}\n╰─────────────────\n\n${enable ? '⚠️ *Atenção:* Membros normais não poderão editar o grupo!' : '✅ *Todos podem editar!*'}`
            }, { quoted: quoteThis });
        } catch (error) {
            console.error('❌ Erro:', error);
            await sock.sendMessage(from, { text: `❌ *Erro:* ${error.message || 'Erro desconhecido'}` }, { quoted: quoteThis });
        }
    }
};
