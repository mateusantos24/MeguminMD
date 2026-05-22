const { getBaileys } = require('./baileysLoader');
const axios = require('axios');
const config = require('../../config/config');
const { getButtonsPolicy } = require('./buttonsPolicy');

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function shouldSendAlbumAsPlainMessages(sock) {
    return typeof sock?.sendMessage === 'function' && typeof sock?.relayMessage !== 'function';
}

function inferAlbumType(item = {}) {
    if (item.type === 'video') return 'video';
    if (item.type === 'image') return 'image';
    if (item.video) return 'video';
    if (item.image) return 'image';
    if (String(item.mimetype || '').startsWith('video/')) return 'video';
    return 'image';
}

function getAlbumPayload(item = {}, caption = '') {
    const type = inferAlbumType(item);
    const media = item.buffer || item.data || item[type] || item.image || item.video;
    const payload = {
        [type]: media,
        mimetype: item.mimetype || (type === 'video' ? 'video/mp4' : 'image/jpeg')
    };

    if (caption) payload.caption = caption;
    return payload;
}

async function sendAlbumAsPlainMessages(sock, jid, items, captionText = '', quoted = null, delayMs = 500) {
    const safeItems = Array.isArray(items) ? items : [];
    for (let index = 0; index < safeItems.length; index += 1) {
        const item = safeItems[index];
        const caption = item.caption || (index === 0 ? captionText : '');
        await sock.sendMessage(jid, getAlbumPayload(item, caption), index === 0 && quoted ? { quoted } : {});
        if (index < safeItems.length - 1) await wait(delayMs);
    }
    return true;
}

/**
 * Envia Álbum (Múltiplas imagens/vídeos)
 */
async function sendAlbumMessage(conn, jid, medias, options = {}) {
    if (!Array.isArray(medias) || medias.length < 2) {
        throw new Error("Álbum precisa de pelo menos 2 mídias!");
    }

    const quoted = options.quoted || null;
    const caption = options.text || options.caption || "";

    if (shouldSendAlbumAsPlainMessages(conn)) {
        return sendAlbumAsPlainMessages(conn, jid, medias, caption, quoted);
    }

    if (typeof conn?.sendAlbum === 'function') {
        const albumItems = medias.map((m, i) => {
            if (m.type === 'video') {
                return { video: m.data, mimetype: m.mimetype, caption: i === 0 ? caption : '' };
            }
            return { image: m.data, caption: i === 0 ? caption : '' };
        });
        return conn.sendAlbum(jid, { album: albumItems }, quoted ? { quoted } : {});
    }

    const { generateWAMessageFromContent, generateWAMessage } = await getBaileys();

    // ===========================
    // 🔵 CRIAR MENSAGEM PAI
    // ===========================
    const album = generateWAMessageFromContent(jid, {
        albumMessage: {
            expectedImageCount: medias.filter(m => m.type === "image").length,
            expectedVideoCount: medias.filter(m => m.type === "video").length,

            // Garantir que o álbum suporta quoted
            contextInfo: quoted ? {
                quotedMessage: quoted.message,
                stanzaId: quoted.key.id,
                remoteJid: quoted.key.remoteJid,
                participant: quoted.key.participant,
                fromMe: quoted.key.fromMe
            } : {}
        }
    }, { quoted });

    await conn.relayMessage(jid, album.message, { messageId: album.key.id });

    // ===========================
    // 🔵 ENVIAR FILHOS DO ÁLBUM
    // ===========================
    for (let i = 0; i < medias.length; i++) {
        const media = medias[i];
        const first = i === 0;

        const content = {};

        if (media.type === "image") {
            content.image = media.data;
            content.mimetype = media.mimetype || "image/jpeg";
        } else if (media.type === "video") {
            content.video = media.data;
            content.mimetype = media.mimetype || "video/mp4";
        } else {
            console.warn("Tipo inválido:", media.type);
            continue;
        }

        // caption somente no primeiro item
        if (first) content.caption = caption;

        const msg = await generateWAMessage(jid, content, {
            upload: conn.waUploadToServer
        });

        // 1️⃣ Associação ao álbum
        msg.message.messageContextInfo = {
            messageAssociation: {
                associationType: 1,
                parentMessageKey: album.key
            }
        };

        // 2️⃣ QUOTED completo para cada mídia (fix para iOS/Web/Desktop)
        if (quoted) {
            msg.messageContextInfo = {
                quotedMessage: quoted.message,
                stanzaId: quoted.key.id,
                participant: quoted.key.participant,
                remoteJid: quoted.key.remoteJid
            };
        }

        await conn.relayMessage(jid, msg.message, { messageId: msg.key.id });

        // Evitar flood
        if (i < medias.length - 1) {
            await new Promise(res => setTimeout(res, 300));
        }
    }

    return album;
}


/**
 * Wrapper versão EXTENDIDA
 */
async function sendAlbumMessageV2(sock, jid, mediaArray, captionText, quoted = null) {
    try {
        if (!Array.isArray(mediaArray) || mediaArray.length === 0) {
            throw new Error("Array de mídia vazio!");
        }

        if (shouldSendAlbumAsPlainMessages(sock)) {
            return sendAlbumAsPlainMessages(sock, jid, mediaArray, captionText, quoted);
        }

        if (typeof sock?.sendAlbum === 'function') {
            const albumItems = mediaArray.map((item, idx) => {
                const isVideo = item.mimetype?.startsWith('video/');
                const out = isVideo ? { video: item.buffer, mimetype: item.mimetype } : { image: item.buffer };
                const cap = item.caption || (idx === 0 ? captionText : '');
                if (cap) out.caption = cap;
                return out;
            });
            await sock.sendAlbum(jid, { album: albumItems }, quoted ? { quoted } : {});
            return true;
        }

        if (typeof sock?.sendAlbumMessage === 'function') {
            const items = mediaArray.map((item, idx) => {
                const isVideo = item.mimetype?.startsWith('video/');
                const out = isVideo ? { video: item.buffer } : { image: item.buffer };
                const cap = item.caption || (idx === 0 ? captionText : '');
                if (cap) out.caption = cap;
                return out;
            });
            await sock.sendAlbumMessage(jid, items, {
                ...(quoted ? { quoted } : {}),
                delay: 300
            });
            return true;
        }

        const { generateWAMessageFromContent, generateWAMessage } = await getBaileys();

        // Converter formato para {type, data}
        const medias = mediaArray.map(item => {
            let type = item.mimetype?.startsWith("video/") ? "video" : "image";

            // fallback por header
            if (!item.mimetype) {
                const header = item.buffer.slice(0, 4);
                if (header[0] === 0x00 && header[1] === 0x00) {
                    type = "video";
                }
            }

            return { type, data: item.buffer, mimetype: item.mimetype };
        });

        // Se só tem 1 mídia → não é álbum
        if (medias.length < 2) {
            const single = medias[0];
            await sock.sendMessage(jid, {
                [single.type]: single.data,
                caption: captionText,
                mimetype: single.mimetype
            }, quoted ? { quoted } : {});
            return;
        }

        // ===========================
        // 🔵 CRIAR ÁLBUM PAI
        // ===========================
        const album = generateWAMessageFromContent(jid, {
            albumMessage: {
                expectedImageCount: medias.filter(x => x.type === "image").length,
                expectedVideoCount: medias.filter(x => x.type === "video").length,

                contextInfo: quoted ? {
                    quotedMessage: quoted.message,
                    remoteJid: quoted.key.remoteJid,
                    stanzaId: quoted.key.id,
                    participant: quoted.key.participant,
                    fromMe: quoted.key.fromMe
                } : {}
            }
        }, { quoted });

        await sock.relayMessage(jid, album.message, { messageId: album.key.id });

        // ===========================
        // 🔵 FILHOS DO ÁLBUM
        // ===========================
        for (let i = 0; i < medias.length; i++) {
            const media = medias[i];
            const isFirst = i === 0;

            const content = {};

            if (media.type === "image") {
                content.image = media.data;
            } else {
                content.video = media.data;
            }

            content.mimetype = media.mimetype;
            if (isFirst && captionText) content.caption = captionText;

            const msg = await generateWAMessage(jid, content, {
                upload: sock.waUploadToServer
            });

            // 1️⃣ Associação ao álbum
            msg.message.messageContextInfo = {
                messageAssociation: {
                    associationType: 1,
                    parentMessageKey: album.key
                }
            };

            // 2️⃣ QUOTED nos filhos
            if (quoted) {
                msg.messageContextInfo = {
                    quotedMessage: quoted.message,
                    stanzaId: quoted.key.id,
                    participant: quoted.key.participant,
                    remoteJid: quoted.key.remoteJid
                };
            }

            await sock.relayMessage(jid, msg.message, { messageId: msg.key.id });

            // delay anti flood
            if (i < medias.length - 1) {
                await new Promise(r => setTimeout(r, 300));
            }
        }

        return album;

    } catch (error) {
        console.error("[ALBUM ERROR]:", error.message);

        // fallback: enviar um por um normal
        for (const item of mediaArray) {
            try {
                const type = item.mimetype?.startsWith("video/") ? "video" : "image";

                await sock.sendMessage(jid, {
                    [type]: item.buffer,
                    caption: item.caption || captionText,
                    mimetype: item.mimetype
                });

                await new Promise(r => setTimeout(r, 500));
            } catch (err) {
                console.error("[ALBUM FALLBACK ERROR]:", err.message);
            }
        }
    }
}

async function sendAlbumSimple(sock, jid, albumItems) {
    if (!Array.isArray(albumItems) || albumItems.length < 2) {
        throw new Error('Álbum precisa de pelo menos 2 itens');
    }
    if (shouldSendAlbumAsPlainMessages(sock)) {
        return sendAlbumAsPlainMessages(sock, jid, albumItems);
    }

    const allImages = albumItems.every(i => !!i.image && !i.video);
    const policy = getButtonsPolicy(config);
    if (policy.allowAlbum && allImages) {
        const payload = {
            album: albumItems.map(item => {
                const out = {};
                if (item.image) {
                    if (Buffer.isBuffer(item.image)) out.image = item.image;
                    else if (item.image && typeof item.image.url === 'string') out.image = { url: item.image.url };
                }
                if (item.caption) out.caption = item.caption;
                return out;
            })
        };
        await sock.sendMessage(jid, payload);
        return true;
    }
    const mediaArray = [];
    for (const item of albumItems) {
        if (item.image) {
            if (Buffer.isBuffer(item.image)) {
                mediaArray.push({ buffer: item.image, mimetype: 'image/jpeg', caption: item.caption });
            } else if (item.image && typeof item.image.url === 'string') {
                const { data } = await axios.get(item.image.url, { responseType: 'arraybuffer' });
                mediaArray.push({ buffer: Buffer.from(data), mimetype: 'image/jpeg', caption: item.caption });
            }
        }
        if (item.video) {
            if (Buffer.isBuffer(item.video)) {
                mediaArray.push({ buffer: item.video, mimetype: 'video/mp4', caption: item.caption });
            } else if (item.video && typeof item.video.url === 'string') {
                const { data } = await axios.get(item.video.url, { responseType: 'arraybuffer' });
                mediaArray.push({ buffer: Buffer.from(data), mimetype: 'video/mp4', caption: item.caption });
            }
        }
    }
    const firstCaption = albumItems.find(x => x.caption)?.caption || '';
    await sendAlbumMessageV2(sock, jid, mediaArray, firstCaption, null);
    return true;
}

async function sendAlbumMessageV3(sock, jid, album, quoted) {
    if (shouldSendAlbumAsPlainMessages(sock)) {
        const items = Array.isArray(album) ? album : Array.isArray(album?.album) ? album.album : [];
        if (items.length) return sendAlbumAsPlainMessages(sock, jid, items, '', quoted);
        return false;
    }

    const policy = getButtonsPolicy(config);
    if (!policy.allowAlbum) return false;
    try {
        await sock.sendMessage(jid, { album }, { quoted });
        return true;
    } catch { return false; }
}


async function sendAlbumMessageV4(suki, id, albumItems, quoted = null) {
    if (!Array.isArray(albumItems) || albumItems.length === 0) {
        throw new Error('Array de álbum vazio');
    }

    // Normalizar formatos aceitos:
    // - Buffer (assume image/jpeg)
    // - { type: 'image'|'video', buffer: Buffer, mimetype?, caption? }
    // - { image: Buffer | { url }, video: Buffer | { url }, caption? }
    const normalized = [];
    for (const item of albumItems) {
        // Buffer cru -> imagem
        if (Buffer.isBuffer(item)) {
            normalized.push({ image: item, mimetype: 'image/jpeg' });
            continue;
        }

        // Forma { type, buffer }
        if (item && item.type && item.buffer) {
            if (item.type === 'video') normalized.push({ video: item.buffer, mimetype: item.mimetype || 'video/mp4', caption: item.caption });
            else normalized.push({ image: item.buffer, mimetype: item.mimetype || 'image/jpeg', caption: item.caption });
            continue;
        }

        // Forma antiga/objeto com image/video
        if (item && item.image) {
            if (Buffer.isBuffer(item.image)) normalized.push({ image: item.image, mimetype: item.mimetype || 'image/jpeg', caption: item.caption });
            else if (item.image && typeof item.image.url === 'string') normalized.push({ image: { url: item.image.url }, caption: item.caption });
            continue;
        }

        if (item && item.video) {
            if (Buffer.isBuffer(item.video)) normalized.push({ video: item.video, mimetype: item.mimetype || 'video/mp4', caption: item.caption });
            else if (item.video && typeof item.video.url === 'string') normalized.push({ video: { url: item.video.url }, caption: item.caption });
            continue;
        }
    }

    if (normalized.length === 0) throw new Error('Nenhum item válido no álbum');

    if (shouldSendAlbumAsPlainMessages(suki)) {
        return sendAlbumAsPlainMessages(suki, id, normalized, '', quoted);
    }

    const policy = getButtonsPolicy(config);
    if (!policy.allowAlbum) return false;

    if (normalized.length === 1) {
        const it = normalized[0];
        const content = {};
        if (it.image) content.image = Buffer.isBuffer(it.image) ? it.image : { url: it.image.url };
        if (it.video) content.video = Buffer.isBuffer(it.video) ? it.video : { url: it.video.url };
        if (it.caption) content.caption = it.caption;
        if (it.mimetype) content.mimetype = it.mimetype;
        await suki.sendMessage(id, content, quoted ? { quoted } : {});
        return true;
    }

    if (typeof suki?.sendAlbumMessage === 'function') {
        const items = normalized.map((it) => {
            const out = {};
            if (it.image) out.image = Buffer.isBuffer(it.image) ? it.image : { url: it.image.url };
            if (it.video) out.video = Buffer.isBuffer(it.video) ? it.video : { url: it.video.url };
            if (it.caption) out.caption = it.caption;
            return out;
        });
        await suki.sendAlbumMessage(id, items, {
            ...(quoted ? { quoted } : {}),
            delay: 2000
        });
        return true;
    }

    const mediaArray = [];
    for (const it of normalized) {
        if (it.image) {
            if (Buffer.isBuffer(it.image)) {
                mediaArray.push({ buffer: it.image, mimetype: it.mimetype || 'image/jpeg', caption: it.caption });
            } else if (it.image && typeof it.image.url === 'string') {
                const { data, headers } = await axios.get(it.image.url, { responseType: 'arraybuffer' });
                mediaArray.push({ buffer: Buffer.from(data), mimetype: headers?.['content-type'] || 'image/jpeg', caption: it.caption });
            }
        }
        if (it.video) {
            if (Buffer.isBuffer(it.video)) {
                mediaArray.push({ buffer: it.video, mimetype: it.mimetype || 'video/mp4', caption: it.caption });
            } else if (it.video && typeof it.video.url === 'string') {
                const { data, headers } = await axios.get(it.video.url, { responseType: 'arraybuffer' });
                mediaArray.push({ buffer: Buffer.from(data), mimetype: headers?.['content-type'] || 'video/mp4', caption: it.caption });
            }
        }
    }

    const firstCaption = normalized.find(x => x.caption)?.caption || '';
    await sendAlbumMessageV2(suki, id, mediaArray, firstCaption, quoted);
    return true;
}


module.exports = { sendAlbumMessage, sendAlbumMessageV2, sendAlbumMessageV3, sendAlbumSimple, sendAlbumMessageV4 };
