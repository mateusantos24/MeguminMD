const vm = require('vm')
const util = require('util')
const path = require('path')
const { createRequire } = require('module')
const { getBaileys } = require('../../utils/baileysLoader')
const SimpleCache = require('../../utils/simpleCache')

function getEvalDebugStore() {
    const existing = global.baileysDebugStore
    if (existing && typeof existing === 'object') return existing

    const fallback = {
        contacts: {},
        chats: {},
        lastContactsUpsert: [],
        lastContactsUpdate: []
    }

    global.baileysDebugStore = fallback
    return fallback
}

function findDebugContact(jid) {
    if (!jid) return null

    const query = String(jid).trim().toLowerCase()
    const store = getEvalDebugStore()
    const entries = Object.entries(store.contacts || {})

    for (const [key, value] of entries) {
        if (String(key).toLowerCase() === query) return value
    }

    const digits = query.replace(/\D/g, '')
    if (!digits) return null

    for (const [, value] of entries) {
        const candidates = [value?.id, value?.jid, value?.lid, value?.notify, value?.name]
        if (candidates.some((item) => String(item || '').toLowerCase() === query)) {
            return value
        }

        if (candidates.some((item) => String(item || '').replace(/\D/g, '') === digits)) {
            return value
        }
    }

    return null
}

function looksLikeExpression(src) {
    let s = String(src || '').trim()
    if (!s) return false
    if (s.endsWith(';')) s = s.slice(0, -1).trim()
    if (/[\r\n]/.test(s)) return false
    if (/;/.test(s)) return false
    if (/^\{[\s\S]*\}$/.test(s)) return false
    if (/\breply\s*\(/.test(s)) return false
    if (/\b(?:const|let|var|function|class|if|for|while|switch|try|catch|throw|return)\b/.test(s)) return false
    return true
}

function normalizeEvalCode(input) {
    let code = String(input || '').trim()

    const fence = code.match(/^```(?:js|javascript|node)?\s*([\s\S]*?)\s*```$/i)
    if (fence) code = fence[1].trim()

    code = code
        .split(/\r?\n/)
        .map((line) => line.replace(/^\s*>\s?/, ''))
        .join('\n')
        .trim()

    return code
}

function getNestedQuotedText(value) {
    if (!value) return ''
    if (typeof value === 'string') return value.trim()
    if (typeof value !== 'object') return ''

    const direct =
        value.text ||
        value.caption ||
        value.conversation ||
        value.contentText ||
        value.selectedDisplayText ||
        value.displayText ||
        value.messageText ||
        value.body?.text ||
        value.header?.title ||
        value.footer?.text ||
        value.extendedTextMessage?.text ||
        value.imageMessage?.caption ||
        value.videoMessage?.caption ||
        value.documentMessage?.caption

    if (typeof direct === 'string' && direct.trim()) return direct.trim()

    const nestedCandidates = [
        value.ephemeralMessage?.message,
        value.viewOnceMessage?.message,
        value.viewOnceMessageV2?.message,
        value.viewOnceMessageV2Extension?.message,
        value.documentWithCaptionMessage?.message,
        value.imageWithCaptionMessage?.message,
        value.videoWithCaptionMessage?.message,
        value.message
    ]

    for (const candidate of nestedCandidates) {
        const nested = getNestedQuotedText(candidate)
        if (nested) return nested
    }

    return ''
}

function getQuotedDocumentNode(messageData) {
    const quotedMessage = messageData?.quotedMessage
    const quotedMsgObj = messageData?.quotedMsgObj

    if (quotedMsgObj?.mimetype || quotedMsgObj?.fileName) return quotedMsgObj
    if (quotedMessage?.documentMessage) return quotedMessage.documentMessage
    if (quotedMessage?.documentWithCaptionMessage?.message?.documentMessage) {
        return quotedMessage.documentWithCaptionMessage.message.documentMessage
    }
    return null
}

function isTextLikeDocument(doc) {
    if (!doc) return false
    const mime = String(doc.mimetype || '').toLowerCase()
    const fileName = String(doc.fileName || '').toLowerCase()

    if (mime.startsWith('text/')) return true
    if (mime.includes('json') || mime.includes('javascript') || mime.includes('ecmascript') || mime.includes('xml')) return true
    return /\.(txt|js|mjs|cjs|json|md|ts|tsx|jsx|log|env|yaml|yml|xml|html|css)$/i.test(fileName)
}

async function readQuotedDocumentText(messageData) {
    const doc = getQuotedDocumentNode(messageData)
    if (!doc || !isTextLikeDocument(doc)) return ''

    const { downloadContentFromMessage } = await getBaileys()
    const stream = await downloadContentFromMessage(doc, 'document')
    const chunks = []
    for await (const chunk of stream) {
        chunks.push(chunk)
        const total = chunks.reduce((sum, item) => sum + item.length, 0)
        if (total > 1024 * 1024) {
            throw new Error('Documento citado muito grande para /eval.')
        }
    }

    return Buffer.concat(chunks).toString('utf-8').trim()
}

module.exports = {
    name: 'eval',
    description: '\u{1F451} Executar codigo JS (apenas dono)',
    category: 'dono',
    ownerOnly: true,
    aliases: ['ev', 'evaluate'],

    async execute(sock, messageData, args) {
        const { from, quoteThis, prefix, quotedMsgObj, quotedType, key, message, sender, senderLid, quotedMessage, decryptedMedia, quotedText } = messageData

        const reply = async (text) => {
            await sock.sendMessage(from, { text: String(text) }, { quoted: quoteThis })
        }

        let code = ''
        if (typeof messageData.body === 'string' && messageData.body.trim()) {
            code = messageData.body.replace(/^\S+\s*/, '')
        }
        if (!code && Array.isArray(args) && args.length) code = args.join(' ')
        if (!code && typeof quotedText === 'string' && quotedText.trim()) {
            code = quotedText
        }
        if (!code && quotedMsgObj && quotedType === 'text' && quotedMsgObj.text) {
            code = String(quotedMsgObj.text)
        }
        if (!code && quotedMsgObj) {
            code = getNestedQuotedText(quotedMsgObj)
        }
        if (!code && quotedMessage) {
            code = getNestedQuotedText(quotedMessage)
        }
        if (!code) {
            try {
                code = await readQuotedDocumentText(messageData)
            } catch (e) {
                await reply(`❌ Erro ao ler documento citado:\n${String(e?.message || e)}`)
                return
            }
        }

        code = normalizeEvalCode(code)

        if (!code) {
            await reply(
                `╭─「 🧪 EVAL (DONO) 」\n` +
                `├─ ${prefix}eval <código>\n` +
                `├─ ${prefix}eval await reply('teste')\n` +
                `├─ ${prefix}eval 1 + 1\n` +
                `╰────────────────────`
            )
            return
        }

        if (code.length > 10000) {
            await reply('❌ Código muito grande.')
            return
        }

        const cleanCode = code.replace(/;\s*$/, '')

        const safeConsole = {
            log: (...a) => console.log('[EVAL]', ...a),
            info: (...a) => console.info('[EVAL]', ...a),
            warn: (...a) => console.warn('[EVAL]', ...a),
            error: (...a) => console.error('[EVAL]', ...a)
        }

        const sleep = (ms) =>
            new Promise((res) =>
                setTimeout(res, Math.max(0, Math.min(60000, Number(ms) || 0)))
            )

        const baseRequire = createRequire(__filename)

        function safeRequire(modulePath) {
            if (typeof modulePath !== 'string' || !modulePath.trim()) {
                throw new Error('Módulo inválido no require.')
            }

            const mod = modulePath.trim()
            return baseRequire(mod)
        }

        const ctx = {
            console: safeConsole,

            reply: async (text) => {
                didReply = true
                const out = String(text)
                await sock.sendMessage(from, { text: out }, { quoted: quoteThis })
                return out
            },

            require: safeRequire,
            __dirname: __dirname,
            __filename: __filename,
            path,

            quotedMessage,
            sock,
            suki: sock,
            conn: sock,
            store: getEvalDebugStore(),
            debugStore: getEvalDebugStore(),
            getContactDebug: findDebugContact,
            cache: {
                groups: SimpleCache.groupMetadataCache,
                communities: SimpleCache.communityMetadataCache,
                newsletters: SimpleCache.newsletterMetadataCache
            },
            simpleCache: SimpleCache,
            jid: from,
            from,
            senderLid,
            sender,
            key,

            msg: message,
            md: messageData,
            messageData,
            m: { ...messageData, chat: from },

            quoteThis,
            message: quoteThis,
            quoted: quoteThis,
            prefix,
            args,
            decryptedMedia,
            media: decryptedMedia || null,
            mediaBuffer: decryptedMedia?.buffer || null,
            image: decryptedMedia?.buffer || null,
            mediaMime: decryptedMedia?.mimetype || decryptedMedia?.mime || null,
            mimetype: decryptedMedia?.mimetype || decryptedMedia?.mime || null,
            sleep,
            Math,
            Date,
            JSON,
            Buffer,
            util,
            quotedMsgObj,
            setTimeout,
            setInterval,
            clearTimeout,
            clearInterval
        }

        const sandbox = vm.createContext(ctx, { name: 'evalSandbox' })

        const body = looksLikeExpression(cleanCode) ? `return (${cleanCode})` : cleanCode
        const wrapped = `
"use strict";
(async () => {
${body}
})()
`

        try {
            const script = new vm.Script(wrapped, {
                filename: 'eval.vm',
                displayErrors: true
            })

            const runPromise = script.runInContext(sandbox, { timeout: 2500 })

            const result = await Promise.race([
                Promise.resolve(runPromise),
                new Promise((_, rej) =>
                    setTimeout(() => rej(new Error('Timeout')), 7000)
                )
            ])

            if (typeof result !== 'undefined') {
                const inspected = util.inspect(result, {
                    depth: 4,
                    maxArrayLength: 50,
                    breakLength: 120
                })

                await reply(`✅ Resultado:\n${inspected.slice(0, 3500)}`)
                return
            }
        } catch (e) {
            const msg = e && e.stack ? String(e.stack) : String(e && e.message ? e.message : e)
            await reply(`❌ Erro no eval:\n${msg.slice(0, 1800)}`)
        }
    }
}
