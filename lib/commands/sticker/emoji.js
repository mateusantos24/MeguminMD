const twemoji = require('twemoji');
const axios = require('axios');
const sharp = require('sharp');
const { Sticker } = require('wa-sticker-formatter');
const config = require('../../../config/config');
const StickerDB = require('../../database/stickerDB');

async function resolveStickerMeta(messageData) {
    const defaults = {
        pack: config.stickerConfig?.pack || 'Rei',
        author: config.stickerConfig?.author || 'Ayanami'
    };

    const participantLid = messageData.participantLid;
    const stickerConfig = messageData.stickerConfig || {};
    const userConfig = participantLid ? await StickerDB.getSticker(participantLid).catch(() => null) : null;

    let finalPack = defaults.pack;
    let finalAuthor = defaults.author;

    if (userConfig) {
        if (userConfig.invisible === 1) {
            finalPack = '';
            finalAuthor = '';
        } else {
            if (userConfig.packName) finalPack = userConfig.packName;
            if (userConfig.publisher === null || userConfig.publisher === '') {
                finalAuthor = '';
            } else {
                finalAuthor = userConfig.publisher;
            }
        }
    }

    return {
        pack: stickerConfig.pack ?? finalPack,
        author: stickerConfig.author ?? finalAuthor,
        quality: stickerConfig.quality ?? config.stickerConfig?.stickerQuality ?? 80
    };
}

module.exports = {
    name: 'emoji',
    description: 'Busca informacoes tecnicas de um emoji e gera sticker',
    category: 'sticker',
    aliases: ['emojisticker', 'emojitopeka', 'emojitosticker', 'emoji2sticker', 'emojitostiker', 'emojitostikcer', 'emojitostik', 'emojistiker', 'emojistikcer', 'emojistik'],

    async execute(sock, messageData) {
        const { from, arg, emojis, quoteThis, prefix } = messageData;
        const emoji = String(arg || '').trim().match(/\p{Emoji}/u)?.[0] || emojis?.[0];
        if (!emoji) return sock.sendMessage(from, { text: 'Use: ' + prefix + 'emoji ??' }, { quoted: quoteThis });

        const parsed = twemoji.parse(emoji, { folder: 'svg', ext: '.svg' });
        const url = parsed.match(/src="([^"]+)"/)?.[1];
        if (!url) return sock.sendMessage(from, { text: 'Nao consegui localizar esse emoji.' }, { quoted: quoteThis });

        const { data } = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
        const imageBuffer = await sharp(Buffer.from(data))
            .png()
            .toBuffer();
        const stickerMeta = await resolveStickerMeta(messageData);
        const sticker = new Sticker(imageBuffer, {
            pack: stickerMeta.pack,
            author: stickerMeta.author,
            quality: stickerMeta.quality
        });

        return sock.sendMessage(from, { sticker: await sticker.toBuffer() }, { quoted: quoteThis });
    }
};
