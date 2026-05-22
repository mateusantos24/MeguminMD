const fs = require('fs-extra');
const config = require('../../../config/config');

module.exports = {
    name: 'session',
    description: '\u{1F451} Verificar status da sessao',
    category: 'dono',
    ownerOnly: true,
    aliases: ['sessao'],

    async execute(sock, messageData) {
        const { from, quoteThis } = messageData;

        try {
            const sessionPath = './data/sessions';
            const sessionExists = fs.existsSync(sessionPath);
            const sessionFiles = sessionExists ? fs.readdirSync(sessionPath) : [];

            const botInfo = {
                id: sock.user?.id || 'Não identificado',
                lid: sock.user?.lid || 'N/A',
                name: sock.user?.name || 'N/A',
                connected: 1
            };

            const uptime = formatUptime(process.uptime());

            const report = `📱 *INFORMAÇÕES DA SESSÃO*
├─ 🤖 Bot PN: ${botInfo.id}
├─ 🤖 Bot LID: ${botInfo.lid}
├─ 👤 Nome: ${botInfo.name}
├─ 🔗 Conectado: ${botInfo.connected ? '✅ Sim' : '❌ Não'}
├─ 📁 Sessão: ${sessionExists ? '✅ Ativa' : '❌ Ausente'}
├─ 📂 Arquivos: ${sessionFiles.length} itens
├─ ⏰ Uptime: ${uptime}
└─ 🎯 Prefixos: ${config.prefixes.join(', ')}`;

            await sock.sendMessage(from, { text: report }, { quoted: quoteThis });
        } catch (error) {
            await sock.sendMessage(from, {
                text: `❌ Erro ao verificar sessão: ${error.message}`
            }, { quoted: quoteThis });
        }
    }
};

function formatUptime(seconds) {
    const days = Math.floor(seconds / (24 * 60 * 60));
    const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60));
    const minutes = Math.floor((seconds % (60 * 60)) / 60);

    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}
