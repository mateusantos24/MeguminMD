const fs = require('fs')
const path = require('path')

module.exports = {
    name: 'reviverqr',
    aliases: ['reviverqr'],
    category: 'dono',
    description: '\u{1F451} Revive o QR Code do bot',
    ownerOnly: true,

    async execute(sock, messageData, args) {
        const { from, quoteThis } = messageData

        const sessionPath = path.resolve(__dirname, '..', '..', '..', 'data', 'sessions')
        const preText = fs.existsSync(sessionPath)
            ? '✅ Vou remover a sessão e reiniciar para gerar um novo QR/pairing.'
            : '⚠️ Nenhuma sessão encontrada. Vou reiniciar para forçar novo QR/pairing.'

        try {
            await sock.sendMessage(from, { text: preText }, { quoted: quoteThis })
        } catch (err) {
            try {
                console.log('[REVIVERQR] Falha ao enviar mensagem:', err?.message || err)
            } catch { }
        }

        setTimeout(() => {
            try {
                if (fs.existsSync(sessionPath)) {
                    fs.rmSync(sessionPath, { recursive: true, force: true })
                }
                try { fs.mkdirSync(sessionPath, { recursive: true }) } catch { }
            } catch { }
            setTimeout(() => process.exit(1), 150)
        }, 700)
    }
}
