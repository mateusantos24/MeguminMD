const MediaExtractor = require('../../utils/mediaExtractor');
const { anyToPng } = require('../../utils/ffmpegTools');

async function extractEmbeddedImageFromLottieBuffer() {
    throw new Error('Conversao de figurinha Lottie para imagem nao esta disponivel nesta build.');
}

module.exports = {
    name: 'toimg',
    description: '\u{1F9E9} Converte figurinha em imagem PNG',
    category: 'sticker',
    aliases: ['img'],

    async execute(sock, messageData) {
        const { from, quoteThis } = messageData;

        const payload = messageData.mediaData || await MediaExtractor.extractFromQuotedMessage(messageData);
        if (!payload || !Buffer.isBuffer(payload.buffer)) {
            await sock.sendMessage(from, {
                text: 'Responda a uma figurinha para converter em imagem.'
            }, { quoted: quoteThis });
            return;
        }

        try {
            const imgBuffer = payload.isLottie || /application\/was/i.test(payload.mimetype || '')
                ? (await extractEmbeddedImageFromLottieBuffer(payload.buffer)).buffer
                : await anyToPng(payload.buffer);

            await sock.sendMessage(from, {
                image: imgBuffer,
                caption: 'Figurinha convertida em imagem PNG'
            }, { quoted: quoteThis });
        } catch (err) {
            console.error('toimg error:', err);
            await sock.sendMessage(from, {
                text: `Nao consegui converter essa figurinha em imagem.\n\n${err.message || err}`
            }, { quoted: quoteThis });
        }
    }
};
