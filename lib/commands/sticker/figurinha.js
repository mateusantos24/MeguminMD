const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const WebP = require('node-webpmux');
const config = require('../../../config/config');
const StickerDB = require('../../database/stickerDB');
const fetch = require('node-fetch');
const { relayLottieSticker } = require('../../utils/sendLottieSticker');

let FFMPEG_BIN = 'ffmpeg';
try {
    const ff = require('@ffmpeg-installer/ffmpeg');
    if (ff?.path) FFMPEG_BIN = ff.path;
} catch { }
 
const WEBPMUX_BIN = 'webpmux';
 
function tmp(ext) {
    return path.join(os.tmpdir(), `hanako_fig_${Date.now()}_${Math.random().toString(16).slice(2)}${ext}`);
}
 
function cleanupSafe(filePath) {
    try { fs.unlinkSync(filePath); } catch { }
}

function formatDurationMs(ms) {
    const totalSeconds = Math.max(0, Math.ceil((Number(ms) || 0) / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes <= 0) return `${seconds}s`;
    return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}
 
function randomEmoji() {
    const emojis = ['😀', '😎', '🥳', '🤖', '💥', '🔥', '✨', '💫', '🎉', '😺', '🌈', '🍕', '🍔', '🦄'];
    return [emojis[Math.floor(Math.random() * emojis.length)]];
}
 
function detectDevice(platform) {
    try {
        const device = platform;
        if (!device) return { android: '❌', ios: '❌' };
        return {
            android: device === 'android' ? '✅' : '❌',
            ios: device === 'ios' ? '✅' : '❌'
        };
    } catch {
        return { android: '❌', ios: '❌' };
    }
}
 
function runBin(bin, args) {
    return new Promise((resolve, reject) => {
        const p = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
        let err = '';
        p.stderr.on('data', (d) => (err += d.toString()));
        p.on('error', reject);
        p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err || `${path.basename(bin)} exit ${code}`))));
    });
}
 
async function toWebpOld(buffer, kind) {
    const inFile = tmp('.bin');
    const outFile = tmp('.webp');
    fs.writeFileSync(inFile, buffer);
    try {
        if (kind === 'video') {
            await runBin(FFMPEG_BIN, [
                '-y',
                '-i', inFile,
                '-t', '10',
                '-vcodec', 'libwebp',
                '-filter:v', 'fps=15',
                '-lossless', '1',
                '-loop', '0',
                '-preset', 'default',
                '-an',
                '-vsync', '0',
                '-s', '200:200',
                outFile
            ]);
        } else {
            await runBin(FFMPEG_BIN, [
                '-y',
                '-i', inFile,
                '-vcodec', 'libwebp',
                '-filter:v', 'fps=15',
                '-lossless', '1',
                '-loop', '0',
                '-preset', 'default',
                '-an',
                '-vsync', '0',
                '-s', '800:800',
                outFile
            ]);
        }
        return fs.readFileSync(outFile);
    } finally {
        cleanupSafe(inFile);
        cleanupSafe(outFile);
    }
}
 
async function buildExifBuffer({ id, pack, publisher, author, emojis = [], android = '', ios = '' }) {
    const exifHeader = Buffer.from([
        0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00,
        0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x16, 0x00, 0x00, 0x00
    ]);
 
    const jsonData = {
        'sticker-pack-id': id || 'com.bot.stickers',
        'sticker-pack-name': pack !== undefined ? pack : 'My Pack',
        'sticker-pack-publisher': publisher !== undefined ? publisher : '',
        'sticker-creator': author !== undefined ? author : 'Bot',
        emojis,
        'android-app-store-link': android || '❌',
        'ios-app-store-link': ios || '❌'
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
        await runBin(WEBPMUX_BIN, ['-set', 'exif', exifFile, inWebp, '-o', outWebp]);
        return fs.readFileSync(outWebp);
    } catch {
        try {
            const img = new WebP.Image();
            await img.load(inWebp);
            img.exif = exifBuffer;
            return await img.save(null);
        } catch {
            return webpBuffer;
        }
    } finally {
        cleanupSafe(inWebp);
        cleanupSafe(outWebp);
        cleanupSafe(exifFile);
    }
}
 
function parseFlags(args = [], body = '', defaults = {}) {
    const normalized = args.map(a => String(a).toLowerCase());
    const argl = String(body || '').toLowerCase();
 
    let custom = null;
    if (argl.includes('-custom') || argl.includes('--custom')) {
        const idx = String(body || '').toLowerCase().indexOf('-custom');
        const idx2 = String(body || '').toLowerCase().indexOf('--custom');
        const start = Math.max(idx, idx2);
        const after = start >= 0 ? String(body || '').slice(start).replace(/^-+custom/i, '').trim() : '';
        custom = after.split('|');
    }
 
    const pack = custom ? (custom[0] || defaults.pack) : defaults.pack;
    const author = custom ? (custom[1] || defaults.author) : defaults.author;
    const id = custom ? (custom[2] || defaults.id) : defaults.id;
    return { pack, author, id, normalized };
}
 
module.exports = {
    name: 'figurinha',
    description: '\u{1F9E9} Cria figurinha (modo r\\\\u00E1pido/antigo) mantendo EXIF completo',
    category: 'sticker',
    aliases: ['figurinhas', 's', 'f', 'stk', 'fig', 'stickers'],
 
    async execute(sock, messageData, args = []) {
        const { from, quoteThis, prefix, pushName, stickerConfig, decryptedMedia, participantLid, platform, body, message, quotedMessage } = messageData;
        const p = prefix || config.prefixes?.[0] || '/';

        const defaults = {
            pack: config.stickerConfig?.pack || 'Rei',
            author: config.stickerConfig?.author || 'Ayanami',
            id: config.stickerConfig?.id || 'com.bot.stickers'
        };
 
        const userConfig = await StickerDB.getSticker(participantLid).catch(() => null);
        let finalPublisher = '';
        let finalAuthor = '';
 
        if (userConfig) {
            if (userConfig.invisible === 1) {
                finalPublisher = '';
                finalAuthor = '';
            } else {
                if (userConfig.publisher === null || userConfig.publisher === '') {
                    finalPublisher = '';
                    finalAuthor = '';
                } else {
                    finalPublisher = userConfig.publisher;
                    finalAuthor = userConfig.publisher;
                }
            }
        } else {
            finalAuthor = defaults.author;
            finalPublisher = defaults.author;
        }
 
        const flags = parseFlags(args || [], body || '', defaults);
 
        const stickerSettings = Object.assign(
            {},
            {
                pack: stickerConfig?.pack ?? finalPack ?? flags.pack,
                publisher: stickerConfig?.publisher ?? finalPublisher ?? flags.author,
                author: stickerConfig?.author ?? finalAuthor ?? flags.author ?? pushName ?? defaults.author,
                id: stickerConfig?.id ?? flags.id ?? defaults.id,
                emojis: stickerConfig?.emojis || randomEmoji(),
                quality: stickerConfig?.quality ?? config.stickerConfig?.stickerQuality ?? 80
            },
            detectDevice(platform)
        );
 
        const wantsHelp =
            (args?.length > 0 && ['help', 'ajuda', '?', 'h'].includes(String(args[0]).toLowerCase())) ||
            (Array.isArray(args) && args.some(a => ['-h', '--h', '-help', '--help', '-ajuda', '--ajuda'].includes(String(a).toLowerCase())));
        if (wantsHelp) {
            const helpText =
                `*FIGURINHA / STICKER*\n\n` +
                `🖼️ Marque uma imagem ou video e use:\n` +
                `${p}s\n\n` +
                `🔗 Ou use um link direto:\n` +
                `${p}s https://exemplo.com/imagem.jpg\n\n` +
                `⏱️ Videos acima de 10s serao cortados automaticamente.\n\n` +
                `✨ Personalizar autor/ID (opcional):\n` +
                `${p}s -custom Autor|ID\n\n` +
                `⏱️ Uso padrão sem VIP/premium\n\n` +
                `Atual:\n` +
                `- autor: ${stickerSettings.author || '(vazio)'}\n` +
                `- publisher: ${stickerSettings.publisher || '(vazio)'}\n`;
            return sock.sendMessage(from, { text: helpText }, { quoted: quoteThis });
        }

        try {
            let media = decryptedMedia;

            // Se não há mídia, verificar se há link nos argumentos
            if (!media?.buffer) {
                const linkArg = args?.find(arg => arg.startsWith('http'));
                if (linkArg) {
                    try {
                        // Tentar baixar do link
                        const response = await fetch(linkArg, {
                            timeout: 10000,
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                            }
                        });

                        if (!response.ok) {
                            return sock.sendMessage(from, { text: '❌ Link inválido ou inacessível.' }, { quoted: quoteThis });
                        }

                        const contentType = response.headers.get('content-type') || '';
                        const buffer = Buffer.from(await response.arrayBuffer());

                        // Verificar se é imagem ou vídeo válido
                        const isImage = contentType.startsWith('image/');
                        const isVideo = contentType.startsWith('video/');

                        if (!isImage && !isVideo) {
                            return sock.sendMessage(from, { text: '❌ O link deve apontar para uma imagem ou vídeo.' }, { quoted: quoteThis });
                        }

                        media = {
                            buffer: buffer,
                            mimetype: contentType,
                            type: isImage ? 'image' : 'video'
                        };

                    } catch (error) {
                        console.error('[FIGURINHA LINK ERROR]:', error);
                        return sock.sendMessage(from, { text: '❌ Erro ao baixar do link. Verifique se o link é válido.' }, { quoted: quoteThis });
                    }
                }
            }

            if (!media?.buffer) {
                return sock.sendMessage(from, {
                    text: `🖼️ Envie ou marque uma imagem/video e use:\n` +
                          `${p}s\n\n` +
                          `⏱️ Videos acima de 10s serao cortados automaticamente.\n\n` +
                          `🔗 Ou use um link direto:\n` +
                          `${p}s https://exemplo.com/imagem.jpg`
                }, { quoted: quoteThis });
            }


 
            const isWebpSticker = media.type === 'sticker' || /image\/webp/i.test(media.mimetype || '');
            const isLottieSticker = media.type === 'sticker' && (media.isLottie || /application\/was/i.test(media.mimetype || ''));
            const isVideo = media.type === 'video' || /video\//i.test(media.mimetype || '');
            const isGifPlayback = Boolean(media.gifPlayback);
            if (isLottieSticker) {
                const lottieSourceCandidates = [
                    quotedMessage,
                    message?.message,
                    message
                ];

                for (const candidate of lottieSourceCandidates) {
                    try {
                        if (!candidate) continue;
                        await relayLottieSticker(sock, from, candidate);
                        return;
                    } catch {
                        // tenta próximo candidato
                    }
                }

                return sock.sendMessage(from, { sticker: media.buffer, mimetype: 'application/was' }, { quoted: quoteThis });
            }
 
            const baseWebp = isWebpSticker ? media.buffer : await toWebpOld(media.buffer, isVideo ? 'video' : 'image');
            const exif = await buildExifBuffer({
                id: stickerSettings.id,
                pack: stickerSettings.pack,
                publisher: stickerSettings.publisher,
                author: stickerSettings.author,
                emojis: stickerSettings.emojis,
                android: stickerSettings.android,
                ios: stickerSettings.ios
            });
 
            const outBuf = await applyExif(baseWebp, exif);
            return sock.sendMessage(from, { sticker: outBuf }, { quoted: quoteThis });
        } catch {
            return sock.sendMessage(from, { text: '⚠️ Houve um erro ao criar a figurinha.' }, { quoted: quoteThis });
        }
    }
};
