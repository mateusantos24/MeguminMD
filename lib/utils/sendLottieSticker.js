const crypto = require('crypto');
const { getBaileys } = require('./baileysLoader');

function unwrapMessage(node) {
    let current = node;
    while (current?.message) current = current.message;
    while (current?.ephemeralMessage?.message) current = current.ephemeralMessage.message;
    while (current?.viewOnceMessageV2?.message) current = current.viewOnceMessageV2.message;
    while (current?.viewOnceMessage?.message) current = current.viewOnceMessage.message;
    while (current?.documentWithCaptionMessage?.message) current = current.documentWithCaptionMessage.message;
    while (current?.imageWithCaptionMessage?.message) current = current.imageWithCaptionMessage.message;
    while (current?.videoWithCaptionMessage?.message) current = current.videoWithCaptionMessage.message;
    return current || {};
}

function pickFirst(...values) {
    for (const value of values) {
        if (value !== undefined && value !== null && value !== '') return value;
    }
    return undefined;
}

function toInt(value, fallback = undefined) {
    if (value === undefined || value === null || value === '') return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function toBoolean(value) {
    return value === true || value === 1 || value === '1';
}

function toBuffer(value, encoding) {
    if (!value) return undefined;
    if (Buffer.isBuffer(value)) return value;
    if (value instanceof Uint8Array) return Buffer.from(value);
    if (typeof value !== 'string') {
        try {
            return Buffer.from(value);
        } catch {
            return undefined;
        }
    }

    const text = value.trim();
    if (!text) return undefined;

    try {
        return Buffer.from(text, encoding);
    } catch {
        return undefined;
    }
}

function toBinaryField(value, preferredEncoding = 'base64') {
    if (!value) return undefined;
    if (Buffer.isBuffer(value)) return value;
    if (value instanceof Uint8Array) return Buffer.from(value);
    if (typeof value !== 'string') return toBuffer(value, preferredEncoding);

    const text = value.trim();
    if (!text) return undefined;
    if (/^[0-9a-f]+$/i.test(text) && text.length % 2 === 0) {
        return toBuffer(text, 'hex');
    }
    return toBuffer(text, preferredEncoding);
}

function normalizeEmojis(emojis) {
    if (Array.isArray(emojis)) {
        const parts = emojis.map((item) => String(item || '').trim()).filter(Boolean);
        return parts.length ? parts.join(' ') : '😀';
    }

    const text = String(emojis || '').trim();
    return text || '😀';
}

function extractMessageSecret(source) {
    const direct =
        source?.messageContextInfo?.messageSecret ||
        source?.message?.messageContextInfo?.messageSecret ||
        source?.contextInfo?.messageSecret ||
        source?.stickerMessage?.contextInfo?.messageSecret ||
        source?.lottieStickerMessage?.message?.stickerMessage?.contextInfo?.messageSecret;

    if (typeof direct === 'string' && direct.trim()) return direct.trim();
    if (Buffer.isBuffer(direct)) return direct.toString('base64');
    if (direct instanceof Uint8Array) return Buffer.from(direct).toString('base64');
    return crypto.randomBytes(32).toString('base64');
}

function extractLottieSource(source) {
    if (!source || typeof source !== 'object') return null;

    const raw = unwrapMessage(source);
    const lottieWrapper = raw?.lottieStickerMessage?.message?.stickerMessage;
    if (lottieWrapper) {
        return {
            sticker: lottieWrapper,
            messageSecret: extractMessageSecret(source)
        };
    }

    const directSticker = raw?.stickerMessage;
    if (directSticker && (directSticker.isLottie || /application\/was/i.test(directSticker.mimetype || ''))) {
        return {
            sticker: directSticker,
            messageSecret: extractMessageSecret(source)
        };
    }

    if (
        source.url ||
        source.directPath ||
        source.direct_path ||
        source.mediaKey ||
        source.media_key ||
        source.fileSha256 ||
        source.file_sha256
    ) {
        return {
            sticker: source,
            messageSecret: extractMessageSecret(source)
        };
    }

    return null;
}

function buildLottieContent(source) {
    const extracted = extractLottieSource(source);
    if (!extracted?.sticker) {
        throw new Error('lottie_source_not_found');
    }

    const sticker = extracted.sticker;
    const stickerMessage = {};

    const url = pickFirst(sticker.url);
    if (url) stickerMessage.url = url;

    const fileSha256 = toBinaryField(pickFirst(sticker.fileSha256, sticker.file_sha256), 'base64');
    if (fileSha256) stickerMessage.fileSha256 = fileSha256;

    const fileEncSha256 = toBinaryField(pickFirst(sticker.fileEncSha256, sticker.file_enc_sha256), 'base64');
    if (fileEncSha256) stickerMessage.fileEncSha256 = fileEncSha256;

    const mediaKey = toBinaryField(pickFirst(sticker.mediaKey, sticker.media_key), 'base64');
    if (mediaKey) stickerMessage.mediaKey = mediaKey;

    stickerMessage.mimetype = 'application/was';
    stickerMessage.height = toInt(pickFirst(sticker.height), 64);
    stickerMessage.width = toInt(pickFirst(sticker.width), 64);

    const directPath = pickFirst(sticker.directPath, sticker.direct_path);
    if (directPath) stickerMessage.directPath = directPath;

    const fileLength = toInt(
        pickFirst(
            sticker.fileLength,
            sticker.file_length,
            Buffer.isBuffer(sticker.downloaded_media) ? sticker.downloaded_media.length : undefined
        ),
        undefined
    );
    if (fileLength !== undefined) stickerMessage.fileLength = fileLength;

    const mediaKeyTimestamp = toInt(pickFirst(sticker.mediaKeyTimestamp, sticker.media_key_timestamp), undefined);
    if (mediaKeyTimestamp !== undefined) stickerMessage.mediaKeyTimestamp = mediaKeyTimestamp;

    stickerMessage.isAnimated = true;

    const stickerSentTs = toInt(pickFirst(sticker.stickerSentTs, sticker.sticker_sent_ts), Date.now());
    stickerMessage.stickerSentTs = stickerSentTs;
    stickerMessage.isAvatar = toBoolean(pickFirst(sticker.isAvatar, sticker.is_avatar));
    stickerMessage.isAiSticker = toBoolean(pickFirst(sticker.isAiSticker, sticker.is_ai_sticker));
    stickerMessage.isLottie = true;
    stickerMessage.premium = toInt(sticker.premium, 0);
    stickerMessage.emojis = normalizeEmojis(sticker.emojis);

    return {
        messageContextInfo: {
            messageSecret: extracted.messageSecret
        },
        lottieStickerMessage: {
            message: {
                stickerMessage
            }
        }
    };
}

async function relayLottieSticker(sock, jid, source, quoted = undefined) {
    if (!sock?.relayMessage) {
        throw new Error('sock_relay_unavailable');
    }

    const { generateWAMessageFromContent } = await getBaileys();
    const content = buildLottieContent(source);
    const waMsg = generateWAMessageFromContent(
        jid,
        content,
        { userJid: sock.user?.id, quoted }
    );

    await sock.relayMessage(
        jid,
        waMsg.message,
        { messageId: waMsg.key.id }
    );

    return waMsg;
}

module.exports = {
    relayLottieSticker,
    buildLottieContent,
    extractLottieSource
};
