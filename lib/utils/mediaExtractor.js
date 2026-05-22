// mediaExtractor.js REVISAO HD REMOVIDO
// Todas funcionalidades HD, aguardando upgrade e setTimeout removidas conforme solicitado

const { getBaileys } = require('./baileysLoader');
const axios = require('axios');
const http = require('http');
const https = require('https');
const chalk = require('chalk');
const { getBuffer } = require('../network/safeRequest');

const errt = chalk.red('[MEDIA][ERROR]');
const WHATSAPP_MEDIA_HTTP_AGENT = new http.Agent({ keepAlive: false });
const WHATSAPP_MEDIA_HTTPS_AGENT = new https.Agent({ keepAlive: false });

// ===== Helpers de rede e chave =====
async function tryBaileysDownload(container) {
    try {
        const { downloadMediaMessage } = await getBaileys();
        const buf = await downloadMediaMessage(container, 'buffer', {});
        return Buffer.isBuffer(buf) ? buf : null;
    } catch (err) {
        const code = err?.response?.status || err?.statusCode || 0;
        return { __httpStatus: code, __errorMessage: String(err?.message || err || '') };
    }
}

async function httpFetchWithHeaders(urlOrDirectPath, sizeLimitMB = 10, timeoutMs = null) {
    // Timeout dinâmico baseado no tamanho esperado
    const dynamicTimeout = timeoutMs || Math.min(30000, sizeLimitMB * 2000);

    try {
        const url = urlOrDirectPath.startsWith('http') ? urlOrDirectPath : `https://mmg.whatsapp.net${urlOrDirectPath}`;

        const res = await axios.get(url, {
            httpAgent: WHATSAPP_MEDIA_HTTP_AGENT,
            httpsAgent: WHATSAPP_MEDIA_HTTPS_AGENT,
            responseType: 'arraybuffer',
            timeout: dynamicTimeout, // ✅ Timeout ajustável
            maxContentLength: sizeLimitMB * 1024 * 1024, // ✅ Limite explícito
            maxBodyLength: sizeLimitMB * 1024 * 1024,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Connection': 'close',
                'DNT': '1',
                'Origin': 'https://web.whatsapp.com',
                'Referer': 'https://web.whatsapp.com/'
            },
            validateStatus: (s) => s === 200 || s === 400
        });

        const buf = Buffer.from(res.data);
        const mb = buf.length / (1024 * 1024);

        if (mb > sizeLimitMB) {
            console.warn(`Mídia excede limite: ${mb.toFixed(2)}MB > ${sizeLimitMB}MB`);
            return null;
        }

        return buf;
    } catch (err) {
        console.error('Erro ao baixar mídia via HTTP:', err.message);
        return null;
    }
}


function unwrapMessage(node) {
    let cur = node;
    while (cur?.message) cur = cur.message;
    while (cur?.ephemeralMessage?.message) cur = cur.ephemeralMessage.message;
    while (cur?.viewOnceMessageV2?.message) cur = cur.viewOnceMessageV2.message;
    while (cur?.viewOnceMessage?.message) cur = cur.viewOnceMessage.message;
    while (cur?.documentWithCaptionMessage?.message) cur = cur.documentWithCaptionMessage.message;
    while (cur?.imageWithCaptionMessage?.message) cur = cur.imageWithCaptionMessage.message;
    while (cur?.videoWithCaptionMessage?.message) cur = cur.videoWithCaptionMessage.message;
    return cur || {};
}

function sanitizeLocatorFields(mediaNode) {
    if (!mediaNode) return;
    if (typeof mediaNode.url === 'string') {
        mediaNode.url = mediaNode.url.trim().replace(/^`+|`+$/g, '').replace(/^"+|"+$/g, '').trim();
    }
    if (typeof mediaNode.directPath === 'string') {
        mediaNode.directPath = mediaNode.directPath.trim().replace(/^`+|`+$/g, '').replace(/^"+|"+$/g, '').trim();
    }
}

class MediaExtractor {
    static async extractFromCurrentMessage(messageDataOrMessage) {
        try {
            let fullMessage;
            if (messageDataOrMessage.message && messageDataOrMessage.key) {
                fullMessage = messageDataOrMessage;
            } else if (messageDataOrMessage.message || messageDataOrMessage.quoteThis) {
                fullMessage = messageDataOrMessage.message || messageDataOrMessage.quoteThis;
            } else {
                return null;
            }
            if (!fullMessage?.key) return null;
            let actualMessage = fullMessage.message;
            while (actualMessage?.message) actualMessage = actualMessage.message;
            while (actualMessage?.ephemeralMessage?.message) actualMessage = actualMessage.ephemeralMessage.message;
            while (actualMessage?.viewOnceMessageV2?.message) actualMessage = actualMessage.viewOnceMessageV2.message;
            while (actualMessage?.viewOnceMessage?.message) actualMessage = actualMessage.viewOnceMessage.message;
            while (actualMessage?.documentWithCaptionMessage?.message) actualMessage = actualMessage.documentWithCaptionMessage.message;
            while (actualMessage?.imageWithCaptionMessage?.message) actualMessage = actualMessage.imageWithCaptionMessage.message;
            while (actualMessage?.videoWithCaptionMessage?.message) actualMessage = actualMessage.videoWithCaptionMessage.message;
            if (actualMessage?.albumMessage) return null;
            if (actualMessage?.protocolMessage?.type === 'MEDIA_NOTIFY_MESSAGE') return null;
            const { imageMessage, videoMessage, stickerMessage, documentMessage, audioMessage } = actualMessage || {};
            const lottieStickerMessage = actualMessage?.lottieStickerMessage?.message?.stickerMessage || null;
            let mediaMsg = null, mediaType = '';
            if (stickerMessage) mediaMsg = stickerMessage, mediaType = 'sticker';
            else if (lottieStickerMessage) mediaMsg = lottieStickerMessage, mediaType = 'sticker';
            else if (imageMessage) mediaMsg = imageMessage, mediaType = 'image';
            else if (videoMessage) mediaMsg = videoMessage, mediaType = 'video';
            else if (documentMessage) mediaMsg = documentMessage, mediaType = this.isImageDocument(documentMessage) ? 'image' : 'document';
            else if (audioMessage) mediaMsg = audioMessage, mediaType = 'audio';
            if (!mediaMsg) return null;
            const isLottieSticker = mediaType === 'sticker' && (Boolean(lottieStickerMessage) || Boolean(mediaMsg?.isLottie) || /application\/was/i.test(mediaMsg?.mimetype || ''));
            const hasLocator = mediaMsg.mediaKey || mediaMsg.url || mediaMsg.directPath;

            if (!hasLocator || (this.getFileLength(mediaMsg) / (1024 * 1024)) > 100) return null;
            let mediaBuffer = await tryBaileysDownload({ key: fullMessage.key, message: actualMessage || fullMessage.message });
            if (!Buffer.isBuffer(mediaBuffer)) {
                const sizeCap = mediaType === 'image' ? 10 : 100;
                if (mediaMsg.url) mediaBuffer = await httpFetchWithHeaders(mediaMsg.url, sizeCap, 15000);
                if (!mediaBuffer && mediaMsg.directPath) mediaBuffer = await httpFetchWithHeaders(mediaMsg.directPath, sizeCap, 15000);
            }
            if (!Buffer.isBuffer(mediaBuffer)) return null;

            return {
                url: mediaMsg.url || mediaMsg.directPath || '',
                buffer: mediaBuffer,
                type: mediaType,
                mimetype: mediaMsg.mimetype || (mediaType === 'image' ? 'image/jpeg' : mediaType === 'video' ? 'video/mp4' : mediaType === 'sticker' ? (isLottieSticker ? 'application/was' : 'image/webp') : mediaType === 'audio' ? 'audio/ogg' : 'application/octet-stream'),
                isLottie: isLottieSticker,
                gifPlayback: Boolean(videoMessage?.gifPlayback),
                isHD: false,
                isAlbum: false,
                pairedMediaType: undefined,
                duration: videoMessage?.seconds || null,
                caption: (imageMessage?.caption || videoMessage?.caption || documentMessage?.caption || '').trim() || null,
                quotedCaption: null,
                fileName: documentMessage?.fileName || null
            };
        } catch (err) {
            console.error(errt, 'Erro ao extrair mídia:', err.message);
            return null;
        }
    }
    static async extractFromQuotedMessage(messageData) {
        try {
            if (!messageData) return null;
            const container = messageData.message || messageData;
            const rootUnwrapped = unwrapMessage(container);
            const baseExt = rootUnwrapped.extendedTextMessage || null;
            const contextInfo = baseExt?.contextInfo || rootUnwrapped.imageMessage?.contextInfo || rootUnwrapped.videoMessage?.contextInfo || rootUnwrapped.stickerMessage?.contextInfo || rootUnwrapped.lottieStickerMessage?.message?.stickerMessage?.contextInfo || rootUnwrapped.documentMessage?.contextInfo || rootUnwrapped.audioMessage?.contextInfo || null;
            if (!contextInfo?.quotedMessage) return null;
            let quotedMessage = contextInfo.quotedMessage;
            quotedMessage = unwrapMessage(quotedMessage);
            const quotedLottieStickerMessage = quotedMessage?.lottieStickerMessage?.message?.stickerMessage || null;
            const mediaNode = quotedMessage.imageMessage || quotedMessage.videoMessage || quotedMessage.stickerMessage || quotedLottieStickerMessage || quotedMessage.documentMessage || quotedMessage.audioMessage;
            if (!mediaNode) return null;
            let mediaType = '';
            let nodeKey = '';
            if (quotedMessage.imageMessage) nodeKey = 'imageMessage', mediaType = 'image';
            else if (quotedMessage.videoMessage) nodeKey = 'videoMessage', mediaType = 'video';
            else if (quotedMessage.stickerMessage) nodeKey = 'stickerMessage', mediaType = 'sticker';
            else if (quotedLottieStickerMessage) nodeKey = 'lottieStickerMessage', mediaType = 'sticker';
            else if (quotedMessage.documentMessage) nodeKey = 'documentMessage', mediaType = this.isImageDocument(quotedMessage.documentMessage) ? 'image' : 'document';
            else if (quotedMessage.audioMessage) nodeKey = 'audioMessage', mediaType = 'audio';
            const isLottieSticker = mediaType === 'sticker' && (Boolean(quotedLottieStickerMessage) || Boolean(mediaNode?.isLottie) || /application\/was/i.test(mediaNode?.mimetype || ''));
            sanitizeLocatorFields(mediaNode);
            const hasLocator = mediaNode.mediaKey || mediaNode.url || mediaNode.directPath;
            if (!hasLocator) return null;
            if ((this.getFileLength(mediaNode) / (1024 * 1024)) > 100) return null;

            const quotedKeyBase = (() => {
                const stanzaId = contextInfo.stanzaId || contextInfo.quotedStanzaId || null;
                const remoteJid = messageData?.key?.remoteJid || contextInfo.remoteJid || contextInfo.remoteJidAlt || null;
                if (!stanzaId || !remoteJid) return null;
                return { remoteJid, id: stanzaId };
            })();

            const isGroup = Boolean(quotedKeyBase?.remoteJid && String(quotedKeyBase.remoteJid).endsWith('@g.us'));
            const participants = [
                contextInfo.participant,
                contextInfo.participantAlt,
                messageData?.participantLid,
                messageData?.quotedParticipant,
                messageData?.key?.participant,
                messageData?.key?.participantAlt
            ].filter(Boolean);

            const keyCandidates = [];
            if (quotedKeyBase) {
                keyCandidates.push({ ...quotedKeyBase, fromMe: false });
                keyCandidates.push({ ...quotedKeyBase, fromMe: true });
                if (isGroup) {
                    for (const p of participants) {
                        keyCandidates.push({ ...quotedKeyBase, fromMe: false, participant: p });
                        keyCandidates.push({ ...quotedKeyBase, fromMe: true, participant: p });
                    }
                }
            }
            if (messageData?.key) keyCandidates.push(messageData.key);

            const uniqKeys = [];
            const seenKey = new Set();
            for (const k of keyCandidates) {
                const s = JSON.stringify(k);
                if (seenKey.has(s)) continue;
                seenKey.add(s);
                uniqKeys.push(k);
            }

            let mediaBuffer = null;
            let lastStatus = null;
            let lastError = '';
            for (const key of uniqKeys) {
                const out = await tryBaileysDownload({
                    key,
                    message: nodeKey
                        ? (nodeKey === 'lottieStickerMessage'
                            ? { lottieStickerMessage: { message: { stickerMessage: mediaNode } } }
                            : { [nodeKey]: mediaNode })
                        : null
                });
                if (Buffer.isBuffer(out)) {
                    mediaBuffer = out;
                    break;
                }
                if (out && out.__httpStatus !== undefined) {
                    lastStatus = out.__httpStatus;
                    lastError = String(out.__errorMessage || '');
                    const low = lastError.toLowerCase();
                    if (low.includes('bad decrypt') || low.includes('bad_decrypt')) {
                        continue;
                    }
                    if ([403, 404, 410].includes(lastStatus)) {
                        continue;
                    }
                }
            }

            if (!Buffer.isBuffer(mediaBuffer) && [403, 404, 410].includes(Number(lastStatus || 0))) {
                const sizeCap = mediaType === 'image' ? 10 : 100;
                if (mediaNode.url) mediaBuffer = await httpFetchWithHeaders(mediaNode.url, sizeCap, 15000);
                if (!mediaBuffer && mediaNode.directPath) mediaBuffer = await httpFetchWithHeaders(mediaNode.directPath, sizeCap, 15000);
            }
            if (Buffer.isBuffer(mediaBuffer)) {
                return {
                    url: mediaNode.url || mediaNode.directPath || '',
                    buffer: mediaBuffer,
                    type: mediaType,
                    mimetype: mediaNode.mimetype || (mediaType === 'image' ? 'image/jpeg' : mediaType === 'video' ? 'video/mp4' : mediaType === 'sticker' ? (isLottieSticker ? 'application/was' : 'image/webp') : mediaType === 'audio' ? 'audio/ogg' : 'application/octet-stream'),
                    isLottie: isLottieSticker,
                    gifPlayback: Boolean(quotedMessage.videoMessage?.gifPlayback),
                    isHD: false,
                    isAlbum: false,
                    pairedMediaType: undefined,
                    duration: quotedMessage.videoMessage?.seconds || null,
                    caption: (baseExt?.text || '').trim() || null,
                    quotedCaption: (quotedMessage.imageMessage?.caption || quotedMessage.videoMessage?.caption || quotedMessage.documentMessage?.caption || '').trim() || null,
                    fileName: quotedMessage.documentMessage?.fileName || null
                };
            }
            return null;
        } catch (e) {
            console.error('❌ Erro ao extrair mídia quotada:', e.message);
            return null;
        }
    }
    static isImageDocument(documentMessage) {
        const mimetype = documentMessage.mimetype || '';
        return mimetype.startsWith('image/');
    }
    static getFileLength(mediaMessage) {
        return mediaMessage.fileLength?.low || mediaMessage.fileLength?.high || mediaMessage.fileLength || 0;
    }
    static async downloadImageFromUrl(url) {
        try {
            const { buffer, headers } = await getBuffer(url, {
                retries: 4,
                timeout: 20000,
                maxRedirects: 5,
                maxBytes: 5 * 1024 * 1024,
                accept: 'image/*',
                referer: 'https://www.instagram.com/'
            });

            const sizeMB = buffer.length / (1024 * 1024);
            if (sizeMB > 5) throw new Error(`Imagem muito grande: ${sizeMB.toFixed(2)}MB (máximo 5MB)`);

            const contentType = String(headers?.['content-type'] || '').toLowerCase();
            if (contentType && !contentType.startsWith('image/') && !contentType.includes('octet-stream')) {
                throw new Error(`Conteúdo não é imagem (${contentType})`);
            }
            if (!this.isValidImageBuffer(buffer) && !contentType.startsWith('image/')) {
                throw new Error('Conteúdo não parece uma imagem válida');
            }
            return buffer;
        } catch (error) {
            console.error(chalk.red('❌ Erro ao baixar imagem:'), error.message);
            return null;
        }
    }
    static async downloadVideoFromUrl(url, maxMB = 50) {
        try {
            const u = (() => { try { return new URL(url); } catch { return null; } })();
            const pathOnly = u ? u.pathname : url.split('?')[0];
            const hasExt = /\.(mp4|mov|mkv|webm|gif)$/i.test(pathOnly) || /discordapp\.com\/attachments\/.+\.(mp4|mov|mkv|webm|gif)/i.test(url);
            const response = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout: Math.min(30000, maxMB * 2000),
                headers:
                {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': '*/*'
                },
                maxContentLength: maxMB * 1024 * 1024,
                maxBodyLength: maxMB * 1024 * 1024,
                validateStatus: (s) => s >= 200 && s < 400
            });
            const buffer = Buffer.from(response.data);
            const ctype = String(response.headers?.['content-type'] || '');
            const isVideoLike = /video\//i.test(ctype) || /image\/gif/i.test(ctype) || hasExt;
            if (!isVideoLike) return null;
            const sizeMB = buffer.length / (1024 * 1024);
            if (sizeMB > maxMB) return null;
            return buffer;
        } catch (error) {
            console.error(chalk.red('❌ Erro ao baixar vídeo:'), error.message);
            return null;
        }
    }
    static bufferToBase64(buffer) {
        if (!Buffer.isBuffer(buffer)) return null;
        return `data:image/png;base64,${buffer.toString('base64')}`;
    }
    static isValidImageBuffer(buffer) {
        if (!Buffer.isBuffer(buffer)) return false;
        const signatures = {
            jpg: [0xFF, 0xD8, 0xFF],
            png: [0x89, 0x50, 0x4E, 0x47],
            gif: [0x47, 0x49, 0x46],
            webp: [0x52, 0x49, 0x46, 0x46]
        };
        for (const sig of Object.values(signatures)) {
            if (sig.every((b, i) => buffer[i] === b)) return true;
        }
        return false;
    }
}
module.exports = MediaExtractor;
