module.exports = {
    name: 'revelar',
    description: '\u{1F527} Revela midia de visualizacao unica',
    category: 'utilitarios',
    aliases: ['rvisu', 'open', 'revelarvisu'],
    react: true,

    async execute(sock, messageData) {
        const { from, quoteThis, prefix, decryptedMedia } = messageData;

        if (!decryptedMedia?.buffer) {
            return sock.sendMessage(from, {
                text: `❌ Não consegui ler a mídia.\nTente marcar (quote) a mensagem novamente e use: ${prefix}revelar`
            }, { quoted: quoteThis });
        }

        const type = String(decryptedMedia.type || '').toLowerCase();
        const mime = String(decryptedMedia.mimetype || '').trim();
        const buf = decryptedMedia.buffer;

        if (type === 'image') {
            return sock.sendMessage(from, { image: buf, mimetype: mime || undefined }, { quoted: quoteThis });
        }
        if (type === 'video') {
            return sock.sendMessage(from, { video: buf, mimetype: mime || 'video/mp4' }, { quoted: quoteThis });
        }
        if (type === 'audio') {
            return sock.sendMessage(from, { audio: buf, mimetype: mime || 'audio/mpeg', ptt: false }, { quoted: quoteThis });
        }

        return sock.sendMessage(from, {
            text: `❌ Tipo de mídia não suportado para revelar.\nTipo: ${type || 'desconhecido'}`
        }, { quoted: quoteThis });
    }
};
