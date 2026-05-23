const fs = require('fs');
const os = require('os');
const path = require('path');
const WebP = require('node-webpmux');
const twemoji = require('twemoji');
const axios = require('axios');
const config = require('../../../config/config');
const StickerDB = require('../../database/stickerDB');
const { anyToWebpSticker } = require('../../utils/ffmpegTools');

function tmp(ext) {
    return path.join(os.tmpdir(), `hanako_emoji_${Date.now()}_${Math.random().toString(16).slice(2)}${ext}`);
}

function cleanupSafe(filePath) {
    try { fs.unlinkSync(filePath); } catch { }
}

async function resolveStickerMeta(messageData) {
    const defaults = {
        pack: config.stickerConfig?.pack || 'Rei',
        author: config.stickerConfig?.author || 'Ayanami',
        id: config.stickerConfig?.id || 'com.bot.stickers'
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
        id: stickerConfig.id ?? defaults.id,
        pack: stickerConfig.pack ?? finalPack,
        author: stickerConfig.author ?? finalAuthor,
        quality: stickerConfig.quality ?? config.stickerConfig?.stickerQuality ?? 80
    };
}

async function buildExifBuffer({ id, pack, author, emojis = [] }) {
    const exifHeader = Buffer.from([
        0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00,
        0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x16, 0x00, 0x00, 0x00
    ]);

    const jsonData = {
        'sticker-pack-id': id || 'com.bot.stickers',
        'sticker-pack-name': pack !== undefined ? pack : 'My Pack',
        'sticker-pack-publisher': author !== undefined ? author : '',
        'sticker-creator': author !== undefined ? author : 'Bot',
        emojis
    };

    const jsonBuff = Buffer.from(JSON.stringify(jsonData), 'utf-8');
    const exifData = Buffer.concat([exifHeader, jsonBuff]);
    exifData.writeUIntLE(jsonBuff.length, 14, 4);
    return exifData;
}

async function applyExif(webpBuffer, exifBuffer) {
    const inWebp = tmp('.webp');
    const outWebp = tmp('.webp');
    const exifFile = tmp('.temp.exif');
    fs.writeFileSync(inWebp, webpBuffer);
    fs.writeFileSync(exifFile, exifBuffer);

    try {
        const img = new WebP.Image();
        await img.load(inWebp);
        img.exif = exifBuffer;
        await img.save(outWebp);
        return fs.readFileSync(outWebp);
    } catch {
        return webpBuffer;
    } finally {
        cleanupSafe(inWebp);
        cleanupSafe(outWebp);
        cleanupSafe(exifFile);
    }
}

module.exports = {
    name: 'emoji',
    description: 'Busca informacoes tecnicas de um emoji e gera sticker',
    category: 'sticker',
    aliases: ['emojisticker', 'emojitopeka', 'emojitosticker', 'emoji2sticker', 'emojitostiker', 'emojitostikcer', 'emojitostik', 'emojistiker', 'emojistikcer', 'emojistik'],

    async execute(sock, messageData) {
        const { from, arg, emojis, quoteThis, prefix } = messageData;
        const emoji = String(arg || '').trim().match(/\p{Emoji}/u)?.[0] || emojis?.[0];
        if (!emoji) return sock.sendMessage(from, { text: 'Use: ' + prefix + 'emoji 😀' }, { quoted: quoteThis });

        const parsed = twemoji.parse(emoji, { folder: 'svg', ext: '.svg' });
        const url = parsed.match(/src="([^"]+)"/)?.[1];
        if (!url) return sock.sendMessage(from, { text: 'Nao consegui localizar esse emoji.' }, { quoted: quoteThis });

        try {
            const { data } = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
            const stickerMeta = await resolveStickerMeta(messageData);
            const baseWebp = await anyToWebpSticker(Buffer.from(data), {
                size: 512,
                q: stickerMeta.quality
            });
            const exif = await buildExifBuffer({
                id: stickerMeta.id,
                pack: stickerMeta.pack,
                author: stickerMeta.author,
                emojis: [emoji]
            });
            const outBuf = await applyExif(baseWebp, exif);

            return sock.sendMessage(from, { sticker: outBuf }, { quoted: quoteThis });
        } catch (error) {
            console.error('emoji sticker error:', error);
            return sock.sendMessage(from, {
                text: 'Nao consegui transformar esse emoji em figurinha.'
            }, { quoted: quoteThis });
        }
    }
};
