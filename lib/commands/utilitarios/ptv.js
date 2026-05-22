module.exports = {
    name: 'ptv',
    description: '\u{1F527} Converte video em mensagem de video (PTV)',
    category: 'utilitarios',
    aliases: ['ptvmsg', 'videomsg', 'videonota'],

    async execute(sock, messageData) {
        const { from, quoteThis, prefix, decryptedMedia } = messageData;

        if (!decryptedMedia?.buffer || String(decryptedMedia.type || '').toLowerCase() !== 'video') {
            return sock.sendMessage(from, {
                text: `Use: ${prefix}ptv\nMarque (quote) um vídeo/gif e use o comando.`
            }, { quoted: quoteThis });
        }

        const buf = decryptedMedia.buffer;
        const mime = String(decryptedMedia.mimetype || 'video/mp4');

        try {
            await sock.sendMessage(from, { video: buf, mimetype: mime, ptv: true }, { quoted: quoteThis });
        } catch {
            try {
                await sock.sendMessage(from, { video: buf, mimetype: mime }, { quoted: quoteThis });
            } catch (e) {
                await sock.sendMessage(from, { text: `❌ Falha ao enviar PTV.\nMotivo: ${e?.message || e}` }, { quoted: quoteThis });
            }
        }
    }
};
