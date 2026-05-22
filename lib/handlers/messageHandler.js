require('dotenv').config({ quiet: true });
const config = require('../../config/config');
const chalk = require('chalk');
const silentRequire = require('../utils/silentRequire');
const SimpleCache = require('../utils/simpleCache');
const MentionHandler = require('../utils/mentionHandler');
const jidNormalizer = require('../utils/jidNormalizer');
const MediaExtractor = require('../utils/mediaExtractor');
const moment = require('moment-timezone'); // importa já com timezone
require('moment/locale/pt-br');
moment.locale('pt-br'); // define pt-BR global

// ✅ HANDLER ATUAL
const ImportedCommandHandler = require('./commandHandler');
let CommandHandler = ImportedCommandHandler;

// Função para obter o handler atual
function getCurrentCommandHandler() {
    try {
        const latestHandler = require('./commandHandler');
        if (latestHandler) {
            CommandHandler = latestHandler;
        }
    } catch {
        /* Empty */
    }
    return CommandHandler;
}

// BANCO DE DADOS
const StickerDB = require('../database/stickerDB');
const contaDb = require('../database/conta');
const modernDb = require('../database/modernDatabase');
const AlbumCache = require('../utils/albumCache');
const albumPending = new Map();
const albumLoose = new Map();
const { findAllDeepKeys, isBotOwner, getDetailedMessageType } = require('../utils/others');
const { getBaileys } = require('../utils/baileysLoader');

const PARTICIPANT_STUB_ACTIONS = new Map([
    [27, 'add'],
    [28, 'remove'],
    [32, 'remove'],
    [140, 'add'],
    [141, 'add'],
    [151, 'add'],
    [166, 'add'],
    [168, 'add'],
    [185, 'add']
]);

let getDevice = () => null;
let extractMessageContentFromBaileys = (/** @type {{ [x: string]: any; ephemeralMessage: { message: { [x: string]: any; lottieStickerMessage: { message: { stickerMessage: any; }; }; }; }; viewOnceMessageV2: { message: { [x: string]: any; lottieStickerMessage: { message: { stickerMessage: any; }; }; }; }; lottieStickerMessage: { message: { stickerMessage: { mimetype: any; }; }; }; viewOnceMessage: { message: { [x: string]: any; lottieStickerMessage: { message: { stickerMessage: any; }; }; }; }; documentWithCaptionMessage: { message: { [x: string]: any; documentMessage: { mimetype: any; }; }; }; imageWithCaptionMessage: { message: { [x: string]: any; imageMessage: { mimetype: any; }; }; }; videoWithCaptionMessage: { message: { [x: string]: any; videoMessage: { mimetype: any; }; }; }; imageMessage: { mimetype: any; }; videoMessage: { mimetype: any; }; audioMessage: { mimetype: any; }; stickerMessage: { mimetype: any; }; documentMessage: { mimetype: any; }; } | null} */ content) => content;
getBaileys().then(b => {
        if (typeof b?.getDevice === 'function') getDevice = b.getDevice;
        if (typeof b?.extractMessageContent === 'function') extractMessageContentFromBaileys = b.extractMessageContent;
    }).catch(() => { });


// Batcher para agrupar notificações de etiqueta (evita spam quando várias chegam ao mesmo tempo)
const RECENT_APPEND_COMMAND_WINDOW_MS = 30 * 1000;

/**
 * @param {number | null | undefined} rawTimestamp
 */
function toMessageTimestampMs(rawTimestamp) {
    if (rawTimestamp === null || rawTimestamp === undefined) return 0;

    if (typeof rawTimestamp === 'number') {
        return rawTimestamp > 1e12 ? rawTimestamp : rawTimestamp * 1000;
    }

    if (typeof rawTimestamp === 'string') {
        const parsed = Number(rawTimestamp);
        if (Number.isFinite(parsed) && parsed > 0) {
            return parsed > 1e12 ? parsed : parsed * 1000;
        }
        return 0;
    }

    if (typeof rawTimestamp === 'object') {
        // @ts-ignore
        if (typeof rawTimestamp.toNumber === 'function') {
            try {
                // @ts-ignore
                const value = rawTimestamp.toNumber();
                if (Number.isFinite(value) && value > 0) {
                    return value > 1e12 ? value : value * 1000;
                }
            } catch { }
        }

        // @ts-ignore
        const low = Number(rawTimestamp.low);
        if (Number.isFinite(low) && low > 0) {
            return low > 1e12 ? low : low * 1000;
        }
    }

    return 0;
}

/**
 * @param {{ messageTimestamp: number | null | undefined; }} msg
 * @param {string} upsertType
 */
function shouldHandleCommandUpsert(msg, upsertType) {
    if (upsertType === 'notify') return true;
    if (upsertType !== 'append') return false;

    const timestampMs = toMessageTimestampMs(msg?.messageTimestamp);
    if (!timestampMs) return false;
    return Math.abs(Date.now() - timestampMs) <= RECENT_APPEND_COMMAND_WINDOW_MS;
}

/**
 * @param {{ readMessages: (arg0: any[]) => any; }} sock
 * @param {string | any[]} keys
 */
async function safeReadMessages(sock, keys) {
    if (typeof sock?.readMessages !== 'function' || !Array.isArray(keys) || keys.length === 0) return;

    try {
        await sock.readMessages(keys);
    } catch (error) {
        console.log(chalk.yellow('[READ MESSAGES FAIL]'), error);
    }
}

function randomEmoji() {
    const emojis = ['😀','😎','🥳','🤖','💥','🔥','✨','💫','🎉','😺','🌈','🍕','🍔','🦄'];
    return [emojis[Math.floor(Math.random() * emojis.length)]];
}

/**
 * @param {{ id: any; }} msg
 */
function detectDevice(msg) {
    try {
        // @ts-ignore
        const device = getDevice(msg.id || '');
        if (!device) return { android: '❌', ios: '❌' };
        return {
            android: device === 'android' ? '✅' : '❌',
            ios: device === 'ios' ? '✅' : '❌'
        };
    } catch {
        return { android: '❌', ios: '❌' };
    }
}

/**
 * @param {string} value
 */
function isBotJid(value) {
    return typeof value === 'string' && value.toLowerCase().endsWith('@bot');
}

/**
 * @param {string} value
 */
function normalizeBotJid(value) {
    if (config?.jidRules?.bot !== true) return null;
    return jidNormalizer.normalizeBot(value);
}

function extractNestedMessageText(messageNode) {
    if (!messageNode) return '';
    if (typeof messageNode === 'string') return messageNode.trim();
    if (typeof messageNode !== 'object') return '';

    if (messageNode.message) {
        return extractMessageText({ message: messageNode.message });
    }

    return extractMessageText({ message: messageNode });
}

function extractMessageText(message) {
    if (!message || !message.message) return '';
    let actualMessage = message.message;

    if (actualMessage.ephemeralMessage) {
        actualMessage = actualMessage.ephemeralMessage.message;
    }
    if (actualMessage.viewOnceMessageV2?.message) {
        actualMessage = actualMessage.viewOnceMessageV2.message;
    }
    if (actualMessage.viewOnceMessage?.message) {
        actualMessage = actualMessage.viewOnceMessage.message;
    }
    if (actualMessage.documentWithCaptionMessage?.message) {
        actualMessage = actualMessage.documentWithCaptionMessage.message;
    }
    if (actualMessage.imageWithCaptionMessage?.message) {
        actualMessage = actualMessage.imageWithCaptionMessage.message;
    }
    if (actualMessage.videoWithCaptionMessage?.message) {
        actualMessage = actualMessage.videoWithCaptionMessage.message;
    }

    // ✅ NOVO: Suporte para questionMessage (Newsletter)
    if (actualMessage.questionMessage?.message) {
        const qMsg = actualMessage.questionMessage.message;
        let questionText = '';

        // Extrair conteúdo da mensagem interna
        if (qMsg.imageMessage?.caption) {
            questionText += `${qMsg.imageMessage.caption}`;
        } else if (qMsg.videoMessage?.caption) {
            questionText += `${qMsg.videoMessage.caption}`;
        } else if (qMsg.audioMessage?.caption) {
            questionText += `${qMsg.audioMessage.caption}`;
        } else if (qMsg.documentMessage?.caption) {
            questionText += `${qMsg.documentMessage.caption}`;
        } else if (qMsg.conversation) {
            questionText += qMsg.conversation;
        } else if (qMsg.extendedTextMessage?.text) {
            questionText += qMsg.extendedTextMessage.text;
        } else {
            questionText += 'Sem legenda';
        }
        return questionText;
    }

    if (actualMessage.reactionMessage) {
        const emoji = String(actualMessage.reactionMessage.text || '').trim();
        const targetId = String(actualMessage.reactionMessage?.key?.id || '').trim();
        const targetParticipant = String(actualMessage.reactionMessage?.key?.participant || '').trim();
        const parts = [];
        if (emoji) parts.push(`Reacao: ${emoji}`);
        if (targetId) parts.push(`Status ID: ${targetId}`);
        if (targetParticipant) parts.push(`Alvo: ${targetParticipant}`);
        return parts.join('\n');
    }

    if (actualMessage.encReactionMessage) {
        return '[Reacao criptografada]';
    }

    if (actualMessage.commentMessage) {
        const comment = actualMessage.commentMessage.message;
        if (comment.conversation) return comment.conversation;
        if (comment.extendedTextMessage?.text) return comment.extendedTextMessage.text;
    }

    if (actualMessage.encCommentMessage) {
        return '[Comentário Criptografado]';
    }

    if (actualMessage.conversation) {
        return actualMessage.conversation;
    }

    if (actualMessage.extendedTextMessage) {
        const etm = actualMessage.extendedTextMessage;
        const t = String(etm.text || '').trim();
        const m = String(etm.matchedText || '').trim();
        if (t && m) {
            if (/https?:\/\//i.test(m) && !t.includes(m)) return `${t} ${m}`.trim();
            return t;
        }
        return t || m || etm.description || '';
    }

    if (actualMessage.requestPaymentMessage) {
        // @ts-ignore
        const noteText = extractNestedMessageText(actualMessage.requestPaymentMessage.noteMessage);
        if (noteText) return noteText;
    }

    if (actualMessage.imageMessage) {
        return actualMessage.imageMessage.caption || '';
    }

    if (actualMessage.videoMessage) {
        return actualMessage.videoMessage.caption || '';
    }

    if (actualMessage.documentMessage) {
        return actualMessage.documentMessage.caption || '';
    }

    if (actualMessage.audioMessage) {
        return actualMessage.audioMessage.caption || '';
    }

    if (actualMessage.stickerMessage) {
        return '';
    }

    if (actualMessage.contactMessage) {
        return actualMessage.contactMessage.displayName || '';
    }

    if (actualMessage.locationMessage) {
        return actualMessage.locationMessage.name || '';
    }

    if (actualMessage.liveLocationMessage) {
        return actualMessage.liveLocationMessage.caption || '';
    }

    if (
        actualMessage.pollCreationMessage
        || actualMessage.pollCreationMessageV2
        || actualMessage.pollCreationMessageV3
        || actualMessage.pollCreationMessageV5
        || actualMessage.pollCreationMessageV6
    ) {
        return (
            actualMessage.pollCreationMessage?.name
            || actualMessage.pollCreationMessageV2?.name
            || actualMessage.pollCreationMessageV3?.name
            || actualMessage.pollCreationMessageV5?.name
            || actualMessage.pollCreationMessageV6?.name
            || ''
        );
    }

    if (actualMessage.buttonsMessage) {
        return actualMessage.buttonsMessage.contentText || '';
    }

    if (actualMessage.listMessage) {
        return actualMessage.listMessage.description || '';
    }

    if (actualMessage.buttonsResponseMessage) {
        return actualMessage.buttonsResponseMessage.selectedButtonId || actualMessage.buttonsResponseMessage.selectedDisplayText || '';
    }
    if (actualMessage.templateButtonReplyMessage) {
        return actualMessage.templateButtonReplyMessage.selectedId || actualMessage.templateButtonReplyMessage.selectedDisplayText || '';
    }
    if (actualMessage.listResponseMessage) {
        return actualMessage.listResponseMessage.singleSelectReply?.selectedRowId || actualMessage.listResponseMessage.title || '';
    }

    if (actualMessage.interactiveResponseMessage?.nativeFlowResponseMessage) {
        try {
            const p = JSON.parse(actualMessage.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson);
            return p.id || '';
        } catch { return ''; }
    }

    if (actualMessage.templateMessage) {
        const template = actualMessage.templateMessage;
        if (template.fourRowTemplate) {
            return template.fourRowTemplate.content?.title || '';
        }
        if (template.hydratedTemplate) {
            return template.hydratedTemplate.hydratedContentText || '';
        }
    }

    if (actualMessage.interactiveMessage) {
        return actualMessage.interactiveMessage.body?.text || '';
    }

    return '';
}

    // @ts-ignore
async function detectCommunity(sock, jid, message) {
    if (!jid.endsWith('@g.us')) return false;

    if (message.message?.commentMessage || message.message?.encCommentMessage || message.commentMetadata) return true;

    try {
        const metadata = await SimpleCache.getGroupMetadata(sock, jid);
        const isCommunityGroup = !!(metadata.isCommunity || metadata.isCommunityAnnounce || metadata.linkedParent || metadata.communityId);
        return isCommunityGroup;
    } catch (error) {
        console.log(chalk.yellow(`⚠️ Erro ao verificar metadata: ${error}`));
        return false;
    }
}

function normalizePN(user) {
    if (!user) return null;
    const clean = user.split(':')[0].toLowerCase();
    if (clean.endsWith('@s.whatsapp.net')) return clean;       // já é JID de usuário válido
    if (/^\d{7,17}$/.test(clean)) return clean + '@s.whatsapp.net'; // número puro → JID
    return null; // rejeita @lid, @g.us, newsletters, @bot etc.
}

// Normaliza JID para sempre @lid se for tipo Lid
function normalizeLID(lid) {
    if (!lid) return null;
    const s = String(lid).toLowerCase();
    if (s.endsWith('@g.us')) return null;
    if (s.endsWith('@newsletter')) return null;
    return jidNormalizer.normalizeLID(s);
}

function isRealLid(value) {
    return typeof value === 'string' && value.toLowerCase().includes('@lid');
}

// ✅ LID prioritário
async function getParticipantLid(key) {
    const rules = config?.jidRules || {};
    const lids = [
        key.participantLid,
        key.sender_lid,
        key.senderLid,
        key.participant,
        key.participantAlt,
        key.participant_lid,
        key.remoteJid,
        key.remoteJidAlt,
    ];

    for (const raw of lids) {
        if (!raw) continue;

        const lower = String(raw).toLowerCase();

        if (lower.endsWith('@s.whatsapp.net')) {
            const pn = normalizePN(lower) || jidNormalizer.normalizePN(lower);
            if (!pn) continue;
            if (rules.onlyPn) return pn;
            return pn;
        }

        if (rules.onlyPn) {
            const pn = jidNormalizer.normalizePN(raw);
            if (pn) return pn;
            continue;
        }

        const normalized = normalizeLID(raw);
        if (!normalized) continue;

        if (normalized.endsWith('@lid')) {
            return normalized;
        }
    }
    return null; // ❌ Sem nada válido, mantém null
}

async function getSender(key, isGroup, groupMetadata = null) {
    const rules = config?.jidRules || {};
    const candidates = [
        key.participantPn,
        key.participantAlt,
        key.senderPn,
        key.participant_pn,
        key.remoteJidAlt,
        key.participant,
        key.remoteJid
    ];

    for (const jid of candidates) {
        if (!jid) continue;
        const lower = jid.toLowerCase();

        // PN direto
        if (lower.endsWith('@s.whatsapp.net')) {
            const normalized = normalizePN(jid) || jidNormalizer.normalizePN(jid);
            if (!normalized) continue;
            if (rules.onlyLid) {
                const lid = normalizeLID(normalized);
                if (lid) return lid;
                continue;
            }
            return normalized;
        }

        if (rules.bot === true && lower.endsWith('@bot')) {
            const normalizedBot = normalizeBotJid(jid);
            if (normalizedBot) return normalizedBot;
        }

        // ✅ LID → buscar PN
        if (lower.endsWith('@lid')) {
            const normalized = normalizeLID(jid);

            // ✅ 2️⃣ NOVO: Buscar em subjectOwnerPn / descOwnerPn (COMUNIDADES)
            if (groupMetadata) {
                // Verificar se LID é do subjectOwner
                if (normalized === normalizeLID(groupMetadata.subjectOwner) && groupMetadata.subjectOwnerPn) {
                    const pn = normalizePN(groupMetadata.subjectOwnerPn);
                    return pn;
                }

                // Verificar se LID é do descOwner
                if (normalized === normalizeLID(groupMetadata.descOwner) && groupMetadata.descOwnerPn) {
                    const pn = normalizePN(groupMetadata.descOwnerPn);
                    return pn;
                }

                // Verificar se LID é do owner
                if (normalized === normalizeLID(groupMetadata.owner) && groupMetadata.ownerPn) {
                    const pn = normalizePN(groupMetadata.ownerPn);
                    return pn;
                }
            }



            if (rules.onlyLid) return normalized;
            if (rules.allowLidPn || rules.onlyPn) {
                const pn = jidNormalizer.normalizePN(normalized);
                if (pn) return pn;
            }
            continue;
        }
    }

    // Última chance para chats 1:1
    if (!isGroup && key.remoteJid?.toLowerCase().endsWith('@s.whatsapp.net')) {
        const pn = normalizePN(key.remoteJid) || jidNormalizer.normalizePN(key.remoteJid);
        if (!pn) return null;
        if (rules.onlyLid) return normalizeLID(pn);
        return pn;
    }
    if (!isGroup && rules.bot === true && key.remoteJid?.toLowerCase().endsWith('@bot')) {
        return normalizeBotJid(key.remoteJid);
    }
    return null;
}

// 🔥 PUXAR APENAS O TEXTO PRINCIPAL DA MENSAGEM (CAPTION / TEXT / CONVERSATION)
function extractQuotedText(quotedMsgObj) {
    if (!quotedMsgObj) return '';
    if (typeof quotedMsgObj === 'string') return quotedMsgObj;

    // imagem, vídeo, documento —> tem caption
    if (quotedMsgObj.caption) return quotedMsgObj.caption;

    // interactiveMessage (native flow)
    if (quotedMsgObj.body?.text) return quotedMsgObj.body.text;
    if (quotedMsgObj.header?.title) return quotedMsgObj.header.title;
    if (quotedMsgObj.footer?.text) return quotedMsgObj.footer.text;

    // texto simples
    if (quotedMsgObj.conversation) return quotedMsgObj.conversation;

    // texto de mensagens extendidas
    if (quotedMsgObj.text) return quotedMsgObj.text;

    if (quotedMsgObj.displayText) return quotedMsgObj.displayText;

    if (quotedMsgObj.messageText) return quotedMsgObj.messageText;

    if (quotedMsgObj.requestPaymentMessage) {
        const noteText = extractNestedMessageText(quotedMsgObj.requestPaymentMessage.noteMessage);
        if (noteText) return noteText;
    }

    if (quotedMsgObj.noteMessage) {
        const noteText = extractNestedMessageText(quotedMsgObj.noteMessage);
        if (noteText) return noteText;
    }

    // extendedTextMessage
    if (quotedMsgObj.extendedTextMessage) {
        const etm = quotedMsgObj.extendedTextMessage;
        const t = String(etm.text || '').trim();
        const m = String(etm.matchedText || '').trim();
        if (t && m) {
            if (/https?:\/\//i.test(m) && !t.includes(m)) return `${t} ${m}`.trim();
            return t;
        }
        return t || m || etm.description || '';
    }

    // viewOnceMessage (caso seja imagem com caption)
    if (quotedMsgObj.viewOnceMessageV2?.message?.imageMessage?.caption) return quotedMsgObj.viewOnceMessageV2.message.imageMessage.caption;

    // Se não encontrou nada
    return '';
}

// 📢 EVENTOS NOTIFICAÇÃO
function normalizeQuotedProtoType(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'string') return value.trim().toUpperCase() || null;

    const protoQuotedTypeMap = {
        0: 'EXPLICIT',
        1: 'AUTO'
    };

    return protoQuotedTypeMap[value] || String(value);
}

function getQuotedContentType(actualQuotedMessage) {
    if (!actualQuotedMessage || typeof actualQuotedMessage !== 'object') return 'unknown';
    if (actualQuotedMessage.stickerMessage || actualQuotedMessage.lottieStickerMessage?.message?.stickerMessage) return 'sticker';
    if (actualQuotedMessage.stickerPackMessage) return 'stickerPack';
    if (actualQuotedMessage.imageMessage) return 'image';
    if (actualQuotedMessage.videoMessage) return 'video';
    if (actualQuotedMessage.audioMessage) return 'audio';
    if (actualQuotedMessage.documentMessage) return 'document';
    if (actualQuotedMessage.extendedTextMessage) return 'text';
    if (actualQuotedMessage.conversation) return 'text';
    if (actualQuotedMessage.reactionMessage) return 'reaction';
    if (actualQuotedMessage.commentMessage) return 'comment';
    if (
        actualQuotedMessage.pollCreationMessage
        || actualQuotedMessage.pollCreationMessageV2
        || actualQuotedMessage.pollCreationMessageV3
        || actualQuotedMessage.pollCreationMessageV5
        || actualQuotedMessage.pollCreationMessageV6
    ) return 'poll';
    if (actualQuotedMessage.contactMessage) return 'contact';
    if (actualQuotedMessage.contactsArrayMessage) return 'contacts';
    if (actualQuotedMessage.locationMessage || actualQuotedMessage.liveLocationMessage) return 'location';
    if (actualQuotedMessage.ephemeralMessage) return 'ephemeral';
    if (actualQuotedMessage.viewOnceMessageV2 || actualQuotedMessage.viewOnceMessage) return 'viewOnce';
    return Object.keys(actualQuotedMessage)[0] || 'unknown';
}

// ✅ CORREÇÃO COMPLETA do extractMessageData
async function extractMessageData(sock, message) {
    const key = message.key || {};
    const msgId = key.id || null;

    const isGroup = key.remoteJid?.endsWith('@g.us') || false;
    const from = key.remoteJid || null;

    const isNewsletter = message.key.remoteJid?.endsWith('@newsletter') || false;
    const isCommunity = isGroup ? await detectCommunity(sock, from, message) : false;

    // ✅ NOVO: Obter metadata ANTES de extrair sender/lid
    let groupMetadata = null;
    if (isGroup || isNewsletter) {
        try {
            groupMetadata = await SimpleCache.getGroupMetadata(sock, from);
            // console.log(JSON.stringify(groupMetadata, null, 2));
        } catch (error) {
            console.error(chalk.red('❌ Erro ao obter metadata:'), error);
        }
    }

    // ✅ PASSAR metadata para as funções (inclui participant fora do key em alguns eventos)
    const keyForIdentity = {
        ...key,
        participant: key.participant || message.participant || message.participantAlt || key.participantAlt,
        participantAlt: key.participantAlt || message.participantAlt,
        participant_lid: key.participant_lid || message.participant_lid
    };
    let participantLid = await getParticipantLid(keyForIdentity);
    const sender = await getSender(keyForIdentity, isGroup, groupMetadata);
    const contextId = findAllDeepKeys(message, 'id') || [];
    const uniqueContextIds = isNewsletter ? [msgId] : (findAllDeepKeys(message, 'id') || []).filter(i => i && i !== msgId);

    // ✅ DETECTAR SE É MENSAGEM PRIVADA
    const isPrivate = !isGroup && !isNewsletter && !isCommunity;

    // Conteúdo da mensagem
    const body = extractMessageText(message) || '';

    // Define os argumentos
    let commandArgs = body.split(/ +/);
    let args = commandArgs.slice(1);
    let parametros = commandArgs.slice(0);
    let arg = args.join(' ');
    let argl = args.map(al => al.toLowerCase());
    let arks = argl.join(' ');
    let argc = args.map(ac => ac.toUpperCase());
    let arqc = argc.join(' ');
    let emojis = body.match(/[\p{Emoji}]/gu) || [];
    const rawBody = body; // ✅ preserva o texto original (com \n)

    // ✅ EXTRAIR MENSAGEM CITADA - COMPLETO
    let quoteThis = message;
    let quotedMsg = null;
    /**
     * @type {{ [x: string]: any; ephemeralMessage: { message: { [x: string]: any; lottieStickerMessage: { message: { stickerMessage: any; }; }; }; }; viewOnceMessageV2: { message: { [x: string]: any; lottieStickerMessage: { message: { stickerMessage: any; }; }; }; }; lottieStickerMessage: { message: { stickerMessage: { mimetype: any; }; }; }; viewOnceMessage: { message: { [x: string]: any; lottieStickerMessage: { message: { stickerMessage: any; }; }; }; }; documentWithCaptionMessage: { message: { [x: string]: any; documentMessage: { mimetype: any; }; }; }; imageWithCaptionMessage: { message: { [x: string]: any; imageMessage: { mimetype: any; }; }; }; videoWithCaptionMessage: { message: { [x: string]: any; videoMessage: { mimetype: any; }; }; }; imageMessage: { mimetype: any; }; videoMessage: { mimetype: any; }; audioMessage: { mimetype: any; }; stickerMessage: { mimetype: any; }; documentMessage: { mimetype: any; }; } | null}
     */
    let quotedMessage = null;
    let quotedMsgObj = null;
    let quotedType = null;
    let quotedContentType = null;
    let quotedProtoType = null;
    let quotedSender = null;
    let quotedSenderLid = null;
    let quotedParticipant = null;

    try {
        let contextInfo = null;
        // console.log(JSON.stringify(message, null, 2));
        // Extrair contextInfo
        if (message.message?.extendedTextMessage?.contextInfo) {
            contextInfo = message.message.extendedTextMessage.contextInfo;
        } else if (message.message?.interactiveMessage?.contextInfo) {
            contextInfo = message.message.interactiveMessage.contextInfo;
        } else if (message.message?.imageMessage?.contextInfo) {
            contextInfo = message.message.imageMessage.contextInfo;
        } else if (message.message?.videoMessage?.contextInfo) {
            contextInfo = message.message.videoMessage.contextInfo;
        } else if (message.message?.documentMessage?.contextInfo) {
            contextInfo = message.message.documentMessage.contextInfo;
        } else if (message.message?.audioMessage?.contextInfo) {
            contextInfo = message.message.audioMessage.contextInfo;
        } else if (message.message?.stickerMessage?.contextInfo) {
            contextInfo = message.message.stickerMessage.contextInfo;
        } else if (message.message?.ephemeralMessage?.message) {
            const ephMsg = message.message.ephemeralMessage.message;
            if (ephMsg.extendedTextMessage?.contextInfo) {
                contextInfo = ephMsg.extendedTextMessage.contextInfo;
            } else if (ephMsg.interactiveMessage?.contextInfo) {
                contextInfo = ephMsg.interactiveMessage.contextInfo;
            } else if (ephMsg.imageMessage?.contextInfo) {
                contextInfo = ephMsg.imageMessage.contextInfo;
            }
        }

        if (contextInfo && contextInfo.quotedMessage) {
            quotedMessage = contextInfo.quotedMessage;
            quotedParticipant = contextInfo.participant;
            quotedProtoType = normalizeQuotedProtoType(contextInfo.quotedType);

            // ✅ NORMALIZAR SENDER E LID usando suas funções
            if (quotedParticipant) {
                const lower = quotedParticipant.toLowerCase();

                // Se termina com @lid
                if (lower.endsWith('@lid')) {
                    quotedSenderLid = normalizeLID(quotedParticipant);

                    // Fallback: usar LID como sender se não achou PN
                    if (!quotedSender) {
                        quotedSender = quotedSenderLid;
                    }
                }
                // Se termina com @s.whatsapp.net
                else if (lower.endsWith('@s.whatsapp.net')) {
                    quotedSender = normalizePN(quotedParticipant);
                } else {
                // Outro formato (remoteJid ou desconhecido)
                    quotedSender = quotedParticipant;
                }
            } else {
            // Fallback: usar remoteJid
                const fallback = contextInfo.remoteJid || from;
                quotedSender = normalizePN(fallback) || fallback;
            }

            // ✅ DETECTAR TIPO DA MENSAGEM CITADA (COM SUPORTE A EPHEMERAL E VIEWONCE)
            let actualQuotedMessage = extractMessageContentFromBaileys(quotedMessage) || quotedMessage;

            // Se for ephemeralMessage, extrair a mensagem real
            if (quotedMessage?.ephemeralMessage?.message) {
                actualQuotedMessage = quotedMessage.ephemeralMessage.message;
            }
            // Se for viewOnceMessageV2, extrair a mensagem real
            else if (quotedMessage?.viewOnceMessageV2?.message) {
                actualQuotedMessage = quotedMessage.viewOnceMessageV2.message;
            }
            if (actualQuotedMessage?.viewOnceMessage?.message) {
                actualQuotedMessage = actualQuotedMessage.viewOnceMessage.message;
            }
            if (actualQuotedMessage?.documentWithCaptionMessage?.message) {
                actualQuotedMessage = actualQuotedMessage.documentWithCaptionMessage.message;
            }
            if (actualQuotedMessage?.imageWithCaptionMessage?.message) {
                actualQuotedMessage = actualQuotedMessage.imageWithCaptionMessage.message;
            }
            if (actualQuotedMessage?.videoWithCaptionMessage?.message) {
                actualQuotedMessage = actualQuotedMessage.videoWithCaptionMessage.message;
            }

            // ✅ DETECTAR TIPO DA MENSAGEM CITADA
            actualQuotedMessage = extractMessageContentFromBaileys(actualQuotedMessage) || actualQuotedMessage;
            if (actualQuotedMessage.stickerMessage || actualQuotedMessage.lottieStickerMessage?.message?.stickerMessage) {
                quotedType = 'sticker';
            } else if (actualQuotedMessage.stickerPackMessage) {
                quotedType = 'stickerPack';
            } else if (actualQuotedMessage.imageMessage) {
                quotedType = 'image';
            } else if (actualQuotedMessage.videoMessage) {
                quotedType = 'video';
            } else if (actualQuotedMessage.audioMessage) {
                quotedType = 'audio';
            } else if (actualQuotedMessage.documentMessage) {
                quotedType = 'document';
            } else if (actualQuotedMessage.extendedTextMessage) {
                quotedType = 'text';
            } else if (actualQuotedMessage.conversation) {
                quotedType = 'text';
            } else if (actualQuotedMessage.ephemeralMessage) {
                quotedType = 'ephemeral';
            } else if (actualQuotedMessage.viewOnceMessageV2) {
                quotedType = 'viewOnce';
            } else {
                quotedType = Object.keys(actualQuotedMessage)[0] || 'unknown';
            }

            // ✅ EXTRAIR quotedMsgObj (objeto completo da mensagem citada)
            quotedContentType = getQuotedContentType(actualQuotedMessage);
            quotedType = quotedContentType;
            const messageType = Object.keys(actualQuotedMessage)[0];
            quotedMsgObj = actualQuotedMessage[messageType];

            // ✅ ADICIONAR stickerPackId se for pacote de stickers
            if (messageType === 'stickerPackMessage' && quotedMsgObj) {
                // Garantir que stickerPackId existe
                if (!quotedMsgObj.stickerPackId && quotedMsgObj.id) {
                    quotedMsgObj.stickerPackId = quotedMsgObj.id;
                }
            }

            // Criar objeto compatível
            quotedMsg = {
                key: {
                    remoteJid: from,
                    fromMe: false,
                    id: contextInfo.stanzaId,
                    participant: quotedParticipant
                },
                message: quotedMessage,
                messageTimestamp: contextInfo.quotedMessageTimestamp,
                participant: quotedSender
            };
        }
    } catch (error) {
        console.error(chalk.yellow('⚠️ Erro ao extrair quotedMessage:'), error);
    }

    const quotedText = extractQuotedText(quotedMsgObj);

    // Metadata do grupo
    let groupAdmins = [];
    let groupAdminsLid = [];
    let groupOwner = [];
    let groupOwnerLid = [];
    let isAdmin = false;
    let isBotAdmin = false;
    let isGroupOwner = false;
    let nameGP = '';
    let newsletterRole = null;
    let isNewsletterAdmin = false;
    let isNewsletterOwner = false;
    let canManageNewsletter = false;

    // ✅ Detecção de comandos
    let isCmd = false;
    let command = '';
    try {
        isCmd = await config.isCommand(body);
        if (isCmd) {
            const parsed = await config.parseCommand(body);
            command = parsed.command;
        }
    } catch (error) {
        console.error('❌ Erro ao detectar comando:', error);
        isCmd = false;
        command = '';
    }

    // Obter metadados do grupo
    if (isGroup || isNewsletter || isCommunity) {
        try {
            const groupInfo = SimpleCache.getGroupInfo(groupMetadata, isNewsletter ? 'newsletter' : isCommunity ? 'community' : 'group');

            if (groupInfo.isValidGroup) {
                isAdmin = SimpleCache.isUserAdmin(sender, groupInfo, participantLid);
                isBotAdmin = SimpleCache.isUserAdmin(sock.user.id, groupInfo, sock.user.lid);
                isGroupOwner = SimpleCache.isUserDono(sender, groupInfo, participantLid);
                groupAdmins = groupInfo.admins;
                groupAdminsLid = groupInfo.adminLids;
                groupOwner = groupInfo.adminOwners;
                groupOwnerLid = groupInfo.adminOwnersLids;
                nameGP = groupInfo.subject || groupInfo.name || '';
                if (isNewsletter) {
                    const permissions = SimpleCache.canInteractWithNewsletter(sock, from, groupMetadata);
                    newsletterRole = permissions?.role || null;
                    isNewsletterAdmin = !!permissions?.canSend;
                    isNewsletterOwner = permissions?.role === 'OWNER';
                    canManageNewsletter = !!permissions?.canSend;
                    isAdmin = isNewsletterAdmin;
                    isBotAdmin = isNewsletterAdmin;
                    isGroupOwner = isNewsletterOwner;
                }
            }
        } catch (error) {
            console.error(chalk.red('❌ Erro ao obter metadata:'), error);
        }
    }

    const botForMe = [normalizePN(sock.user.id), normalizeLID(sock.user.lid)];
    const botNameForMe = sock.user.name || config.botName;

    // ✅ MENÇÃO NATIVOS
    const extractGroupMemberIds = MentionHandler.extractGroupMemberIds(groupMetadata);
    const mentionedJidList = MentionHandler.mentionedJidList(quoteThis, groupMetadata);
    const mentionedLidList = MentionHandler.getMentionedLids(message, groupMetadata);
    const mentionedJidListFormatted = MentionHandler.mentionedJidListFormatted(quoteThis, groupMetadata);
    const groupMembersId = MentionHandler.groupMembersId(groupMetadata);
    const lidsOnly = groupMembersId.filter(id => id.endsWith('@lid'));
    const getMentionCount = MentionHandler.getMentionCount(quoteThis, groupMetadata);
    const getFirstMention = MentionHandler.getFirstMention(quoteThis, groupMetadata);
    let firstMentionLid = MentionHandler.firstMentionLid(quoteThis, groupMetadata);
    const getFirstMentionLid = MentionHandler.getLIDFromMention(getFirstMention, groupMetadata);
    const getMentionStats = MentionHandler.getMentionStats(quoteThis, groupMetadata);
    const getPNorLID = MentionHandler.getPNorLID(quoteThis, groupMetadata);

    // ✅ Tentar resolver LID se ainda for PN (para comandos que usam foto de perfil)
    if (isCmd) {
        if (participantLid && !participantLid.endsWith('@lid') && typeof sock?.findUserId === 'function') {
            try {
                const found = await sock.findUserId(participantLid);
                if (found?.lid && found.lid !== 'id-not-found') {
                    participantLid = found.lid;
                }
            } catch { /* ignorar */ }
        }

        if (firstMentionLid && !firstMentionLid.endsWith('@lid') && typeof sock?.findUserId === 'function') {
            try {
                const found = await sock.findUserId(firstMentionLid);
                if (found?.lid && found.lid !== 'id-not-found') {
                    firstMentionLid = found.lid;
                }
            } catch { /* ignorar */ }
        }
    }

    // ✅ STICKER CONFIG (CORRIGIDO)
    const defaults = {
        pack: config.stickerConfig?.pack || 'Rei',
        author: config.stickerConfig?.author || 'Ayanami',
        id: config.stickerConfig?.id || 'Secreto Owner +554196892637'
    };

    // Sempre garante um userConfig válido
    let userConfig = await StickerDB.getSticker(participantLid).catch(() => null);
    let finalPack = defaults.pack;
    let finalPublisher = defaults.author;
    let finalAuthor = defaults.author;

    if (!userConfig) {
        userConfig = {
            userLid: participantLid,
            packName: defaults.pack,
            publisher: defaults.author,
            invisible: 0
        };
    } else {
        // Se userConfig existe, mas não tem user definido
        if (!userConfig.userLid) userConfig.userLid = participantLid;
    }

    if (userConfig) {
    // Se tem userConfig, usa configurações do DB
        if (userConfig.invisible === 1) {
        // Invisible = tudo vazio
            finalPack = '';
            finalPublisher = '';
            finalAuthor = '';
        } else {
        // ✅ Pack do DB sempre aplica se existir
            if (userConfig.packName) {
                finalPack = userConfig.packName;
            }

            // ✅ Publisher/Author VAZIOS se publisher = null
            if (userConfig.publisher === null || userConfig.publisher === '') {
                finalPublisher = '';
                finalAuthor = '';
            } else {
                finalPublisher = userConfig.publisher;
                finalAuthor = userConfig.publisher;
            }
        }
    } else {
    // Sem userConfig, cria um padrão para evitar erros
        userConfig = {
            userLid: participantLid,
            packName: defaults.pack,
            publisher: defaults.author,
            invisible: 0
        };
    }

    // ✅ Sticker settings (SEM SOBRESCREVER COM DEFAULTS)
    const stickerConfig = {
        author: finalAuthor,
        pack: finalPack,
        publisher: finalPublisher,
        type: 'default',
        categories: randomEmoji(),
        quality: 100,
        background: 'transparent',
        id: defaults.id,
        ...detectDevice(key)
    };

    const pushName = message.pushName || null;
    const msg = message.message || {};
    try {
        const actualMsg = msg?.ephemeralMessage?.message || msg?.viewOnceMessageV2?.message || msg?.viewOnceMessage?.message || msg?.message || msg;
        if (actualMsg?.albumMessage && message?.key?.id && message?.key?.remoteJid) {
            AlbumCache.setExpected(message.key.remoteJid, message.key.id, actualMsg.albumMessage.expectedImageCount, actualMsg.albumMessage.expectedVideoCount);
            const p = message?.key?.participant || message?.key?.participantAlt || null;
            if (p) {
                const expectedTotal = (Number(actualMsg.albumMessage.expectedImageCount) || 0) + (Number(actualMsg.albumMessage.expectedVideoCount) || 0);
                const k = `${message.key.remoteJid}:${p}`;
                const entry = { parentId: message.key.id, expectedTotal, count: 0, at: Date.now() };
                const loose = albumLoose.get(k);
                if (loose && (Date.now() - (loose.at || 0)) < 30000 && Array.isArray(loose.items) && loose.items.length > 0) {
                    for (const it of loose.items) {
                        if ((entry.expectedTotal || 0) > 0 && (entry.count || 0) < (entry.expectedTotal || 0)) {
                            AlbumCache.addItem(message.key.remoteJid, entry.parentId, it);
                            entry.count = (entry.count || 0) + 1;
                        }
                    }
                    albumLoose.delete(k);
                }
                if ((entry.expectedTotal || 0) > 0 && (entry.count || 0) >= (entry.expectedTotal || 0)) albumPending.delete(k);
                else albumPending.set(k, entry);
            }
        }
        const assoc = actualMsg?.messageContextInfo?.messageAssociation;
        const parentKey = assoc?.parentMessageKey;
        if (parentKey?.id && parentKey?.remoteJid) {
            AlbumCache.addItem(parentKey.remoteJid, parentKey.id, message);
        } else if (actualMsg?.protocolMessage?.type === 'MEDIA_NOTIFY_MESSAGE' && message?.key?.id && message?.key?.remoteJid) {
            const p = message?.key?.participant || message?.key?.participantAlt || null;
            if (p) {
                const k = `${message.key.remoteJid}:${p}`;
                const entry = albumPending.get(k);
                if (entry && (Date.now() - (entry.at || 0)) < 30000) {
                    if ((entry.expectedTotal || 0) > 0 && (entry.count || 0) < (entry.expectedTotal || 0)) {
                        AlbumCache.addItem(message.key.remoteJid, entry.parentId, message);
                        entry.count = (entry.count || 0) + 1;
                        if (entry.count >= (entry.expectedTotal || 0)) albumPending.delete(k);
                        else albumPending.set(k, entry);
                    }
                } else {
                    if (entry) albumPending.delete(k);
                    const box = albumLoose.get(k) || { items: [], at: Date.now() };
                    box.items.push(message);
                    if (box.items.length > 10) box.items.shift();
                    box.at = Date.now();
                    albumLoose.set(k, box);
                }
            }
        }
    } catch { /* empty */ }

    // ✅ FUNÇÃO MELHORADA - Verifica mensagem atual E citada
    /**
     * @param {string} type
     */
    function hasMedia(type) {
        const isStickerType = type === 'sticker';

        // Verifica mensagem atual
        const currentHas = !!(
            msg?.[`${type}Message`] ||
            (isStickerType && msg?.lottieStickerMessage?.message?.stickerMessage) ||
            msg?.ephemeralMessage?.message?.[`${type}Message`] ||
            (isStickerType && msg?.ephemeralMessage?.message?.lottieStickerMessage?.message?.stickerMessage) ||
            msg?.viewOnceMessageV2?.message?.[`${type}Message`] ||
            (isStickerType && msg?.viewOnceMessageV2?.message?.lottieStickerMessage?.message?.stickerMessage) ||
            msg?.viewOnceMessage?.message?.[`${type}Message`] ||
            (isStickerType && msg?.viewOnceMessage?.message?.lottieStickerMessage?.message?.stickerMessage) ||
            msg?.documentWithCaptionMessage?.message?.[`${type}Message`] ||
            msg?.imageWithCaptionMessage?.message?.[`${type}Message`] ||
            msg?.videoWithCaptionMessage?.message?.[`${type}Message`]
        );

        // Verifica mensagem citada
        const quotedHas = !!(
            quotedMessage?.[`${type}Message`] ||
            (isStickerType && quotedMessage?.lottieStickerMessage?.message?.stickerMessage) ||
            quotedMessage?.ephemeralMessage?.message?.[`${type}Message`] ||
            (isStickerType && quotedMessage?.ephemeralMessage?.message?.lottieStickerMessage?.message?.stickerMessage) ||
            quotedMessage?.viewOnceMessageV2?.message?.[`${type}Message`] ||
            (isStickerType && quotedMessage?.viewOnceMessageV2?.message?.lottieStickerMessage?.message?.stickerMessage) ||
            quotedMessage?.viewOnceMessage?.message?.[`${type}Message`] ||
            (isStickerType && quotedMessage?.viewOnceMessage?.message?.lottieStickerMessage?.message?.stickerMessage) ||
            quotedMessage?.documentWithCaptionMessage?.message?.[`${type}Message`] ||
            quotedMessage?.imageWithCaptionMessage?.message?.[`${type}Message`] ||
            quotedMessage?.videoWithCaptionMessage?.message?.[`${type}Message`]
        );
        return currentHas || quotedHas;
    }

    const isImage = hasMedia('image');
    const isVideo = hasMedia('video');
    const isSticker = hasMedia('sticker');
    const isAudio = hasMedia('audio');
    const isDocument = hasMedia('document');
    const isViewOnce = !!msg.viewOnceMessageV2 || !!msg.viewOnceMessage || !!message?.key?.isViewOnce || quotedContentType === 'viewOnce';

    // ✅ DETECÇÃO DA MENSAGEM CITADA
    const isQuoteImage = quotedContentType === 'image';
    const isQuoteVideo = quotedContentType === 'video';
    const isQuoteSticker = quotedContentType === 'sticker';
    const isQuoteDocument = quotedContentType === 'document';
    const isQuoteAudio = quotedContentType === 'audio';
    const isQuoteViewOnce = quotedContentType === 'viewOnce';
    let decryptedMedia = null;

    // ✅ Se tiver mídia → tentar extrair
    if (isImage || isVideo || isSticker || isAudio || isDocument || isViewOnce) {
        decryptedMedia = await MediaExtractor.extractFromCurrentMessage(message);
    }

    // ✅ Se não tiver, mas for quote com mídia → extrair do quoted
    if (!decryptedMedia && (isQuoteImage || isQuoteVideo || isQuoteSticker || isQuoteAudio || isQuoteDocument || isQuoteViewOnce)) {
        decryptedMedia = await MediaExtractor.extractFromQuotedMessage(message);
    }

    // ✅ DETECTAR MIMETYPE ÚNICO
    let mimetype = null;
    let quotedMime = null;

    if (msg.imageMessage) mimetype = msg.imageMessage.mimetype;
    else if (msg.videoMessage) mimetype = msg.videoMessage.mimetype;
    else if (msg.audioMessage) mimetype = msg.audioMessage.mimetype;
    else if (msg.stickerMessage) mimetype = msg.stickerMessage.mimetype;
    else if (msg.lottieStickerMessage?.message?.stickerMessage) mimetype = msg.lottieStickerMessage.message.stickerMessage.mimetype;
    else if (msg.documentMessage) mimetype = msg.documentMessage.mimetype;
    else if (msg.documentWithCaptionMessage?.message?.documentMessage) mimetype = msg.documentWithCaptionMessage.message.documentMessage.mimetype;
    else if (msg.imageWithCaptionMessage?.message?.imageMessage) mimetype = msg.imageWithCaptionMessage.message.imageMessage.mimetype;
    else if (msg.videoWithCaptionMessage?.message?.videoMessage) mimetype = msg.videoWithCaptionMessage.message.videoMessage.mimetype;
    else if (msg.ephemeralMessage?.message) {
        const eph = msg.ephemeralMessage.message;
        if (eph.imageMessage) mimetype = eph.imageMessage.mimetype;
        else if (eph.videoMessage) mimetype = eph.videoMessage.mimetype;
        else if (eph.audioMessage) mimetype = eph.audioMessage.mimetype;
        else if (eph.stickerMessage) mimetype = eph.stickerMessage.mimetype;
        else if (eph.lottieStickerMessage?.message?.stickerMessage) mimetype = eph.lottieStickerMessage.message.stickerMessage.mimetype;
        else if (eph.documentMessage) mimetype = eph.documentMessage.mimetype;
        else if (eph.documentWithCaptionMessage?.message?.documentMessage) mimetype = eph.documentWithCaptionMessage.message.documentMessage.mimetype;
        else if (eph.imageWithCaptionMessage?.message?.imageMessage) mimetype = eph.imageWithCaptionMessage.message.imageMessage.mimetype;
        else if (eph.videoWithCaptionMessage?.message?.videoMessage) mimetype = eph.videoWithCaptionMessage.message.videoMessage.mimetype;
    }

    if (quotedMessage?.imageMessage) quotedMime = quotedMessage.imageMessage.mimetype;
    else if (quotedMessage?.videoMessage) quotedMime = quotedMessage.videoMessage.mimetype;
    else if (quotedMessage?.audioMessage) quotedMime = quotedMessage.audioMessage.mimetype;
    else if (quotedMessage?.stickerMessage) quotedMime = quotedMessage.stickerMessage.mimetype;
    else if (quotedMessage?.lottieStickerMessage?.message?.stickerMessage) quotedMime = quotedMessage.lottieStickerMessage.message.stickerMessage.mimetype;
    else if (quotedMessage?.documentMessage) quotedMime = quotedMessage.documentMessage.mimetype;
    else if (quotedMessage?.documentWithCaptionMessage?.message?.documentMessage) quotedMime = quotedMessage.documentWithCaptionMessage.message.documentMessage.mimetype;
    else if (quotedMessage?.imageWithCaptionMessage?.message?.imageMessage) quotedMime = quotedMessage.imageWithCaptionMessage.message.imageMessage.mimetype;
    else if (quotedMessage?.videoWithCaptionMessage?.message?.videoMessage) quotedMime = quotedMessage.videoWithCaptionMessage.message.videoMessage.mimetype;

    const deviceInfo = getDevice(message?.key?.id);
    const serverID = message.newsletterServerId || message.serverid || message.server_id || message.newsletter_server_id || key.newsletterServerId || key.serverid || key.server_id || key.newsletter_server_id || null;
    const messageTimestampMs = toMessageTimestampMs(msg?.messageTimestamp || message?.messageTimestamp || message?.message?.messageTimestamp);
    const normalizedTimestamp = messageTimestampMs > 0 ? Math.floor(messageTimestampMs / 1000) : 0;

    const botJid = isBotJid(sender) ? sender : null;

    return {
        sock,
        key,
        msgId,
        contextId,
        uniqueContextIds,
        from,
        sender,
        botJid,
        isBot: !!botJid,
        senderLid: participantLid,
        participantLid,
        addressingMode: key.addressingMode || null,
        body: body || '',
        isGroup,
        isNewsletter,
        serverID,
        isCommunity,
        isPrivate,
        groupMetadata,
        groupAdmins,
        groupAdminsLid,
        groupOwner,
        groupOwnerLid,
        nameGP,
        newsletterRole,
        isNewsletterAdmin,
        isNewsletterOwner,
        canManageNewsletter,
        isGroupOwner,
        isAdmin,
        isBotAdmin,
        isOwner: isBotOwner(sender, config) || isBotOwner(participantLid, config),
        isOwnerPN: config.ownerNumber.includes(sender),
        isOwnerLidNB: config.ownerLid.includes(participantLid),
        ownerPN: config.ownerNumber,
        ownerLID: config.ownerLid,
        isSubOwner: config.subowner.includes(participantLid),
        isSubOwnerLid: config.subowner,
        timestamp: normalizedTimestamp,
        timestampMs: messageTimestampMs,
        messageTimestamp: msg?.messageTimestamp || message?.messageTimestamp || message?.message?.messageTimestamp || null,
        message,
        pushName: pushName,
        isCmd,
        command,
        botForMe,
        botNameForMe,
        stickerConfig,
        usedPrefix: isCmd ? body.charAt(0) : '',
        prefix: isCmd ? body.charAt(0) : '',
        commandArgs,
        rawBody,
        args,
        parametros,
        arg,
        argl,
        arks,
        argc,
        arqc,
        emojis,
        quoteThis,
        quotedMsg,
        quotedMessage,
        quotedMsgObj,
        quotedText,
        quotedType,
        quotedContentType,
        quotedProtoType,
        quotedSender,
        quotedSenderLid,
        quotedParticipant,
        extractGroupMemberIds,
        mentionedJidList,
        mentionedLidList,
        mentionedJidListFormatted,
        groupMembersId,
        lidsOnly,
        getMentionCount,
        getFirstMention,
        firstMentionLid,
        getFirstMentionLid,
        getMentionStats,
        getPNorLID,
        isImage,
        isVideo,
        isSticker,
        isDocument,
        isAudio,
        isViewOnce,
        isQuoteImage,
        isQuoteVideo,
        isQuoteSticker,
        isQuoteDocument,
        isQuoteAudio,
        isQuoteViewOnce,
        decryptedMedia,
        mimetype,
        quotedMime,
        platform: deviceInfo
    };
}

function canBotSendMessage(msgData) {
    const { groupMetadata, botForMe } = msgData;
    if (!groupMetadata) return true;

    const participants = groupMetadata.participants || [];

    // Tenta achar o bot comparando todos os tipos possíveis de campo
    const botParticipant = participants.find(p =>
        p.id === botForMe ||
        p.lid === botForMe ||
        p.jid === botForMe ||
        botForMe?.includes(p.id) ||
        botForMe?.includes(p.lid) ||
        botForMe?.includes(p.jid)
    );

    const isAdmin = ['owner', 'admin', 'superadmin'].includes(botParticipant?.admin);
    if (groupMetadata.announce && !isAdmin) return false; // só admins podem enviar mensagem em modo anúncio
    return true;
}

async function MessageHandler(sock, messages, upsertType) {
    try {
        for (const msg of messages) {
            if (!msg.message) continue;
            const participant = msg.key.remoteJid || msg.key.remoteJidAlt || msg.key.participant || msg.key.participant_lid || msg.key.participant_pn || msg.key.participantPn || msg.key.participantLid || msg.key.sender_lid || msg.key.senderLid || msg.key.senderPn;
            if (!participant) continue;

            // ✅ Validar participant cru — ignorar entradas sem número (ex: 'unknown')
            try {
                const rawLocal = String(participant).split('@')[0] || '';
                const localLower = rawLocal.toLowerCase();

                const looksUnknown = localLower === '' || localLower.includes('unknown') || localLower.includes('desconhecido') || localLower === 'n/a';
                const hasDigits = /\d/.test(rawLocal);

                if (looksUnknown || !hasDigits) {
                    console.log(chalk.yellow(`[MessageHandler] Ignorando participant inválido/sem número: ${participant}`));
                    continue;
                }
            } catch (e) {
                console.error(chalk.red('[MessageHandler] Erro ao validar participant:'), e);
            }

            let messageData = await extractMessageData(sock, msg);
            messageData.raw = msg;

            const previewBody = String(messageData.body || '').toLowerCase();
            const previewLooksCommand = ['/', '!', '.', '#'].some((prefix) => previewBody.startsWith(prefix));
            const previewIsFromBot = msg.key.fromMe || (messageData.participantLid && isBotJid(messageData.participantLid));
            const shouldRunEarlyFushiReply = !previewIsFromBot && !previewLooksCommand && !messageData.isNewsletter;

            // ✅ Pega configurações de grupo
            let groupSettings = (messageData.isGroup || messageData.isNewsletter) ? await modernDb.getGroupSettings(messageData.from) : null;

            // ✅ Verifica permissões
            if ((messageData.isCommunity || messageData.isGroup || messageData.isNewsletter) && !canBotSendMessage(messageData)) continue;

            // 🔹 Detectar se é comando ANTES de tudo
            let noPrefixParsed = null;
            let isCommand = await config.isCommand(messageData.body, groupSettings);
            if (!isCommand && messageData.isGroup && !messageData.isNewsletter && groupSettings?.no_prefix_enabled) {
                noPrefixParsed = getCurrentCommandHandler().parseNoPrefixCommand(messageData.body, messageData);
                isCommand = !!noPrefixParsed;
            }
            messageData.isCmd = isCommand;

            // 🔹 Rodar comandos em tempo real (notify) e em append recente
            if (isCommand && !messageData.isNewsletter && shouldHandleCommandUpsert(msg, upsertType)) {
                await safeReadMessages(sock, [messageData.key]);

                const parsed = noPrefixParsed || await config.parseCommand(messageData.body, groupSettings);
                if (!parsed) continue;
                messageData.usedPrefix = typeof parsed.prefix === 'string' ? parsed.prefix : (messageData.usedPrefix || messageData.prefix || '/');
                messageData.prefix = messageData.usedPrefix;
                messageData.body = parsed.command;

                try {
                    await getCurrentCommandHandler().execute(sock, messageData, msg);
                } catch (err) {
                    console.error('❌ Erro no comando:', err);
                }
            }

            if (messageData.isGroup || messageData.isNewsletter) {
                groupSettings = await modernDb.getGroupSettings(messageData.from);
            }

            if (messageData.isNewsletter) {
                const permissions = SimpleCache.canInteractWithNewsletter(sock, messageData.from, messageData.groupMetadata);
                if (!permissions.canSend && isCommand) {
                    // console.log(chalk.blue(`📺 Newsletter - Bot é ${permissions.role}: ${messageData.from.split('@')[0]}`));
                    return;
                }

                if (permissions.canSend && isCommand) {
                    const commandSource = messageData.rawBody || messageData.body || '';
                    const parsed = await config.parseCommand(commandSource);
                    if (!parsed) {
                        logMessage(sock, messageData);
                        continue;
                    }
                    messageData.usedPrefix = typeof parsed.prefix === 'string' ? parsed.prefix : (messageData.usedPrefix || messageData.prefix || '/');
                    messageData.prefix = messageData.usedPrefix;
                    messageData.body = parsed.command;
                    try {
                        await getCurrentCommandHandler().execute(sock, messageData, msg);
                    } catch (error) {
                        console.error(chalk.red('❌ Erro no comando newsletter:'), error);
                    }
                }
                logMessage(sock, messageData);
                continue;
            }

            // ✅ CONTA DB NÃO BLOQUEANTE
            contaDb.addOrUpdateUser(messageData.participantLid, messageData.pushName, messageData.pushName, messageData.from, isCommand).catch(err => console.error('[CONTA]', err));

            logMessage(sock, messageData);
        }
    } catch (error) {
        console.error(chalk.red('❌ Erro no MessageHandler:'), error);
    }
}

/**
 * Log detalhado da mensagem com suporte a Newsletter/Canais
 * @param {Object} messageData - Dados da mensagem
 * @param {Object} sock - Socket WhatsApp
 */
async function logMessage(sock, messageData) {
    try {
        const {
            isCmd,
            groupMetadata,
            sender,
            participantLid,
            body,
            pushName,
            message,
        } = messageData;

        const timestamp = new Date().toLocaleString('pt-BR');

        try {
            // TIPOS DE MENSAGEM
            const messageType = getDetailedMessageType(message) || 'UNKNOWN';
            const deviceType = getDevice(message?.key?.id) || 'unknown';
            const deviceInfo = deviceType.toUpperCase();

            // ✅ TRUNCAR PREVIEW (LIMITE 1024)
            const preview = body ? (body.length > 100 ? body.substring(0, 100) + '...' : body) : 'Sem texto';

            // CONTEXTO: Grupo/PV/Canal
            let groupName = 'PV';
            let contextLabel = 'PRIVADO';
            let senderInfo = '';

            // STATUS
            if (message?.key?.remoteJid === 'status@broadcast') {
                groupName = 'Status';
                contextLabel = 'STATUS';
                senderInfo = chalk.gray(`${pushName || 'NA'} - ${sender?.split('@')[0] || 'desconhecido'}`);
            }
            // CANAIS/NEWSLETTER
            else if (messageData.isNewsletter) {
                // Preferir o metadata oficial do baileys (newsletterMetadata) que vem com `name`
                // Fallbacks: alguns builds antigos expõem `threadmetadata.name.text`
                let channelName = groupMetadata?.name || groupMetadata?.threadmetadata?.name?.text || groupMetadata?.threadMetadata?.name?.text || 'Newsletter';

                // Se ainda não tiver nome, tentar buscar via cache (deduplicado + TTL)
                try {
                    const jid = message?.key?.remoteJid;
                    if ((!channelName || channelName === 'Newsletter') && jid && typeof sock?.newsletterMetadata === 'function') {
                        const meta = await SimpleCache.getNewsletterMetadata(sock, jid);
                        channelName = meta?.name || channelName;
                    }
                } catch (e) {
                    console.error('[LOG MESSAGE] Erro ao buscar metadata do canal:', e);
                }

                groupName = channelName;
                contextLabel = 'CANAIS';
                senderInfo = messageData.serverID ? chalk.cyan(`[SERVER ID: ${messageData.serverID}]`) : chalk.gray('Sem serverid');
            }
            // COMUNIDADE
            else if (messageData.isCommunity) {
                const parentInfo = groupMetadata?.linkedParent ? '(Subgrupo)' : '';
                groupName = `${groupMetadata?.subject || 'Comunidade'} ${parentInfo}`;
                contextLabel = 'COMUNIDADE';

                const senderNumber = sender?.split('@')[0] || 'desconhecido';
                const lidFormatted = participantLid ? `${participantLid}` : '';
                senderInfo = `${chalk.gray(`${pushName || 'NA'} - ${senderNumber}`)}${lidFormatted ? ` - ${lidFormatted}` : ''}`;
            }
            // GRUPO
            else if (messageData.isGroup) {
                groupName = groupMetadata?.subject || 'Grupo';
                contextLabel = 'GRUPO';

                const senderNumber = sender?.split('@')[0] || 'desconhecido';
                const lidFormatted = participantLid ? `${participantLid}` : '';
                senderInfo = `${chalk.gray(`${pushName || 'NA'} - ${senderNumber}`)}${lidFormatted ? ` - ${lidFormatted}` : ''}`;
            }
            // PRIVADO
            else {
                const senderNumber = sender?.split('@')[0] || 'desconhecido';
                const lidFormatted = isRealLid(participantLid) ? participantLid : 'N/A';
                senderInfo = `${chalk.gray(`${pushName || 'NA'} - ${senderNumber}`)}${lidFormatted ? ` - ${lidFormatted}` : ''}`;
            }

            // LOG NO CONSOLE
            const logPrefix = isCmd ? chalk.green('[CMD]') : chalk.blue(`[${messageType}]`);
            const previewColor = isCmd ? chalk.yellow : chalk.white;
            console.log(
                logPrefix,
                previewColor(preview),
                chalk.gray(`[${timestamp}]`),
                senderInfo,
                chalk.magenta(`[${contextLabel}]`),
                chalk.white(deviceInfo),
                chalk.cyan(groupName)
            );
        } catch (err) {
            if (err?.type === 'PreKeyError') {
                console.log(
                    chalk.red('[INVALID PREKEY]'),
                    chalk.gray(`[${timestamp}]`),
                    chalk.gray(sender?.split('@')[0] || 'desconhecido'),
                    chalk.magenta('ERRO')
                );
            } else {
                console.error(chalk.red('[LOG ERROR]'), err);
            }
        }

    } catch (err) {
        console.error(chalk.red('❌ Erro crítico em logMessage:'), err);
    }
}

module.exports = {
    MessageHandler
};
