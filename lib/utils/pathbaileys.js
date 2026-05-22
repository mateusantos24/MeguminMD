/*
⚠ DANGER

NÃO EDITE ESTE ARQUIVO MANUALMENTE, ELE É GERADO AUTOMATICAMENTE PARA APLICAR PATCHES DE COMPATIBILIDADE AO BAILEYS. SE VOCÊ PRECISA FAZER ALTERAÇÕES, 
POR FAVOR CONTRIBUA NO REPOSITÓRIO ORIGINAL:

EXTREMO CUIDADO AO EDITAR ESTE ARQUIVO, ALTERAÇÕES MANUAIS PODEM SER SOBRESCRITAS A QUALQUER MOMENTO PELO SISTEMA DE PATCH AUTOMÁTICO DO MEGUMIN.
*/

const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');
const config = require('../../config/config');

const requireModule = createRequire(__filename);

const PATCH_MARKER = 'MeguminAutoPatch';
const LOG_PREFIX = '[PATH-BAILEYS]';
const OFFICIAL_BAILEYS_MODULE = '@whiskeysockets/baileys';

function getConfiguredModuleName(explicitModuleName) {
    return explicitModuleName || global.nameBaileys || config?.name?.modules;
}

function isBaileysModuleName(moduleName) {
    return typeof moduleName === 'string' && /baileys/i.test(moduleName);
}

function isOfficialRestrictedBaileysModule(moduleName) {
    return moduleName === OFFICIAL_BAILEYS_MODULE;
}

function getConfiguredPathBaileysMode() {
    return config?.name?.pathbaileys;
}

function normalizePathBaileysMode(mode) {
    if (mode === true || mode === 'true') return true;
    if (mode === false || mode === 'false') return false;
    return 'auto';
}

function resolvePathBaileysMode(moduleName, explicitMode) {
    const normalizedMode = normalizePathBaileysMode(
        explicitMode !== undefined ? explicitMode : getConfiguredPathBaileysMode()
    );

    if (normalizedMode === true || normalizedMode === false) {
        return normalizedMode;
    }

    return isOfficialRestrictedBaileysModule(moduleName) ? 'restricted' : true;
}

function buildMissingBaileysModuleMessage(moduleName) {
    return `Modulo Baileys nao encontrado: "${moduleName}". Voce nao instalou esse Baileys ou modificou config/config.js em name.modules para um nome que nao existe. Instale com "npm install ${moduleName}" ou ajuste config/config.js -> name.modules para um pacote instalado.`;
}

function isBaileysModuleMissingError(error, moduleName) {
    if (error?.code !== 'MODULE_NOT_FOUND') return false;

    const message = String(error?.message || '');
    return (
        message.includes(`${moduleName}/package.json`) ||
        message.includes(`'${moduleName}'`) ||
        message.includes(`"${moduleName}"`)
    );
}

function buildStatus(result) {
    if (!result?.moduleName) return 'SKIP';
    if (result.moduleMissing) return 'WARN';
    if (result.basePath === null) return 'SKIP';
    if (result.missing?.length) return 'WARN';
    if (result.filesChanged?.length) return 'PATCHED';
    return 'OK';
}

function logResult(logger, result) {
    const status = buildStatus(result);
    logger.log(`${LOG_PREFIX} ${status} module=${result.moduleName || 'not-configured'}`);

    if (result.basePath) {
        logger.log(`${LOG_PREFIX} base=${result.basePath}`);
    }

    if (result.message) {
        logger.warn?.(`${LOG_PREFIX} ${result.message}`);
    }

    logger.log(
        `${LOG_PREFIX} changed=${result.filesChanged.length} applied=${result.applied.length} skipped=${result.skipped.length} missing=${result.missing.length}`
    );

    if (result.missing.length) {
        logger.warn?.(`${LOG_PREFIX} trechos nao encontrados: ${result.missing.join(', ')}`);
    }
}

function replaceOnce(content, searchValue, replaceValue, label, state) {
    if (typeof replaceValue === 'string' && replaceValue.length > 0 && content.includes(replaceValue)) {
        state.skipped.push(label);
        return content;
    }

    if (!content.includes(searchValue)) {
        state.missing.push(label);
        return content;
    }

    state.applied.push(label);
    return content.replace(searchValue, replaceValue);
}

function removeOnce(content, searchValue, label, state) {
    if (!content.includes(searchValue)) {
        state.skipped.push(label);
        return content;
    }

    state.applied.push(label);
    return content.replace(searchValue, '');
}

function patchMessagesFile(content, state) {
    const helperBlock = `const mediaAnnotation = [];
const NEWSLETTER_DEBUG_PREFIX = '[PATH-BAILEYS]';
const NEWSLETTER_METADATA_KEYS = new Set([
    'annotations',
    'interactiveAnnotations',
    'forwardedNewsletterMessageInfo',
    'newsletterFollowerInviteMessage',
    'newsletterFollowerInviteMessageV2'
]);
const stripNewsletterMetadata = (value, rootState) => {
    const state = rootState || { removed: [] };
    if (!value || typeof value !== 'object') {
        return value;
    }
    if (Array.isArray(value)) {
        for (const item of value) {
            stripNewsletterMetadata(item, state);
        }
        return value;
    }
    for (const key of Object.keys(value)) {
        if (NEWSLETTER_METADATA_KEYS.has(key)) {
            state.removed.push(key);
            delete value[key];
            continue;
        }
        if (key === 'contextInfo' && value[key] && typeof value[key] === 'object') {
            if (value[key].forwardedNewsletterMessageInfo !== undefined) {
                state.removed.push('forwardedNewsletterMessageInfo');
                delete value[key].forwardedNewsletterMessageInfo;
            }
        }
        stripNewsletterMetadata(value[key], state);
    }
    return value;
};
// ${PATCH_MARKER}: remove annotations/newsletter metadata automatically
`;

    const mediaAnnotationStart = content.indexOf('const mediaAnnotation = [');
    if (mediaAnnotationStart >= 0) {
        const helperEnd = content.indexOf('/**\n * Uses a regex to test whether the string contains a URL', mediaAnnotationStart);

        if (helperEnd > mediaAnnotationStart) {
            const currentBlock = content.slice(mediaAnnotationStart, helperEnd);
            if (currentBlock === helperBlock) {
                state.skipped.push('messages: normalize helper block');
            } else {
                content = `${content.slice(0, mediaAnnotationStart)}${helperBlock}${content.slice(helperEnd)}`;
                state.applied.push('messages: normalize helper block');
            }
        } else {
            state.missing.push('messages: normalize helper block');
        }
    } else {
        state.missing.push('messages: normalize helper block');
    }

    content = removeOnce(
        content,
        `    if (uploadData.image || uploadData.video) {
        uploadData.annotations = mediaAnnotation;
    }
`,
        'messages: stop uploadData.annotations injection',
        state
    );

    content = removeOnce(
        content,
        `    // when forwarding a newsletter/channel message, add the newsletter context
    // so the server knows where to find the original media
    const remoteJid = message.key?.remoteJid;
    if (remoteJid && isJidNewsletter(remoteJid)) {
        contextInfo.forwardedNewsletterMessageInfo = {
            newsletterJid: remoteJid,
            serverMessageId: message.key?.server_id ? parseInt(message.key.server_id) : null,
            newsletterName: null
        };
        // strip messageContextInfo (contains messageSecret etc.) as WA Web does
        delete content.messageContextInfo;
    }
`,
        'messages: remove forwardedNewsletterMessageInfo injection',
        state
    );

    content = replaceOnce(
        content,
        `            const obj = proto.Message.decode(mediaBuff);
            const key = \`${'${mediaType}'}Message\`;
            Object.assign(obj[key], { ...uploadData, media: undefined });
            return obj;
`,
        `            const obj = proto.Message.decode(mediaBuff);
            const key = \`${'${mediaType}'}Message\`;
            Object.assign(obj[key], { ...uploadData, media: undefined });
            return stripNewsletterMetadata(obj);
`,
        'messages: sanitize cached media object',
        state
    );

    content = replaceOnce(
        content,
        `        if (cacheableKey) {
            logger?.debug({ cacheableKey }, 'set cache');
            await options.mediaCache.set(cacheableKey, WAProto.Message.encode(obj).finish());
        }
        return obj;
`,
        `        if (cacheableKey) {
            logger?.debug({ cacheableKey }, 'set cache');
            await options.mediaCache.set(cacheableKey, WAProto.Message.encode(obj).finish());
        }
        return stripNewsletterMetadata(obj);
`,
        'messages: sanitize newsletter media object',
        state
    );

    content = replaceOnce(
        content,
        `    if (cacheableKey) {
        logger?.debug({ cacheableKey }, 'set cache');
        await options.mediaCache.set(cacheableKey, WAProto.Message.encode(obj).finish());
    }
    return obj;
`,
        `    if (cacheableKey) {
        logger?.debug({ cacheableKey }, 'set cache');
        await options.mediaCache.set(cacheableKey, WAProto.Message.encode(obj).finish());
    }
    return stripNewsletterMetadata(obj);
`,
        'messages: sanitize normal media object',
        state
    );

    content = replaceOnce(
        content,
        `    key_.contextInfo = contextInfo;
    return content;
};
`,
        `    key_.contextInfo = contextInfo;
    return stripNewsletterMetadata(content);
};
`,
        'messages: sanitize forwarded content',
        state
    );

    content = replaceOnce(
        content,
        `    return content;
    // Lia@Changes 03-02-26 --- Add all futureProofMessage into getFutureProofMessage()
`,
        `    return stripNewsletterMetadata(content);
    // Lia@Changes 03-02-26 --- Add all futureProofMessage into getFutureProofMessage()
`,
        'messages: sanitize normalizeMessageContent',
        state
    );

    return content;
}

function patchMessagesRecvFile(content, state) {
    const alreadyCleaned = content.includes("cleanMessage(msg, authState.creds.me.id, authState.creds.me.lid);")
        || content.includes("cleanMessage(fullMessage, authState.creds.me.id, authState.creds.me.lid);");

    if (alreadyCleaned) {
        state.skipped.push('messages-recv: clean plaintext newsletter message before upsert');
        return content;
    }

    return replaceOnce(
        content,
        `                        const fullMessage = proto.WebMessageInfo.fromObject({
                            key: {
                                remoteJid: from,
                                id: child.attrs.message_id || child.attrs.server_id,
                                fromMe: false // TODO: is this really true though
                            },
                            message: messageProto,
                            messageTimestamp: +child.attrs.t
                        }).toJSON();
                        await upsertMessage(fullMessage, 'append');
`,
        `                        const fullMessage = proto.WebMessageInfo.fromObject({
                            key: {
                                remoteJid: from,
                                id: child.attrs.message_id || child.attrs.server_id,
                                fromMe: false // TODO: is this really true though
                            },
                            message: messageProto,
                            messageTimestamp: +child.attrs.t
                        }).toJSON();
                        cleanMessage(fullMessage, authState.creds.me.id, authState.creds.me.lid);
                        await upsertMessage(fullMessage, 'append');
`,
        'messages-recv: clean plaintext newsletter message before upsert',
        state
    );
}

function patchProcessMessageFile(content, state) {
    return replaceOnce(
        content,
        `                            logger?.debug({ msgId, requestId: response.stanzaId }, 'received placeholder resend');
                            ev.emit('messages.upsert', {
`,
        `                            normalizeMessageContent(finalMsg.message);
                            logger?.debug({ msgId, requestId: response.stanzaId }, 'received placeholder resend');
                            ev.emit('messages.upsert', {
`,
        'process-message: sanitize placeholder resend before upsert',
        state
    );
}

function patchNewsletterSocketFile(content, state) {
    content = replaceOnce(
        content,
        `const blockNewsletterAction = (action) => {
    return async (...args) => {
        const jid = args.find((item) => typeof item === 'string' && item.includes('@newsletter')) || 'unknown';
        console.log(\`[PATH-BAILEYS] blocked=\${action} jid=\${jid}\`);
        throw new Error(\`[${PATCH_MARKER}] \${action} blocked\`);
    };
};
const blockNewsletterAction = (action) => {
    return async () => {
        throw new Error(\`[${PATCH_MARKER}] \${action} blocked\`);
    };
};
`,
        `const blockNewsletterAction = (action) => {
    return async (...args) => {
        const jid = args.find((item) => typeof item === 'string' && item.includes('@newsletter')) || 'unknown';
        console.log(\`[PATH-BAILEYS] blocked=\${action} jid=\${jid}\`);
        throw new Error(\`[${PATCH_MARKER}] \${action} blocked\`);
    };
};
`,
        'newsletter: remove duplicate blocked action helper',
        state
    );

    content = replaceOnce(
        content,
        `const parseNewsletterMetadata = (result) => {
    if (typeof result !== 'object' || result === null) {
        return null;
    }
    if ('id' in result && typeof result.id === 'string') {
        return result;
    }
    if ('result' in result && typeof result.result === 'object' && result.result !== null && 'id' in result.result) {
        return result.result;
    }
    return null;
};
`,
        `const parseNewsletterMetadata = (result) => {
    if (typeof result !== 'object' || result === null) {
        return null;
    }
    if ('id' in result && typeof result.id === 'string') {
        return result;
    }
    if ('result' in result && typeof result.result === 'object' && result.result !== null && 'id' in result.result) {
        return result.result;
    }
    return null;
};
const blockNewsletterAction = (action) => {
    return async (...args) => {
        const jid = args.find((item) => typeof item === 'string' && item.includes('@newsletter')) || 'unknown';
        console.log(\`[PATH-BAILEYS] blocked=\${action} jid=\${jid}\`);
        throw new Error(\`[${PATCH_MARKER}] \${action} blocked\`);
    };
};
`,
        'newsletter: add blocked action helper',
        state
    );

    content = replaceOnce(
        content,
        `const blockNewsletterAction = (action) => {
    return async () => {
        throw new Error(\`[${PATCH_MARKER}] \${action} blocked\`);
    };
};
`,
        `const blockNewsletterAction = (action) => {
    return async (...args) => {
        const jid = args.find((item) => typeof item === 'string' && item.includes('@newsletter')) || 'unknown';
        console.log(\`[PATH-BAILEYS] blocked=\${action} jid=\${jid}\`);
        throw new Error(\`[${PATCH_MARKER}] \${action} blocked\`);
    };
};
`,
        'newsletter: upgrade blocked action helper with debug log',
        state
    );

    content = replaceOnce(
        content,
        `        newsletterFollow: (jid) => {
            return executeWMexQuery({ newsletter_id: jid }, QueryIds.FOLLOW, XWAPaths.xwa2_newsletter_join_v2);
        },
`,
        `        newsletterFollow: blockNewsletterAction('newsletterFollow'),
`,
        'newsletter: block newsletterFollow',
        state
    );

    content = replaceOnce(
        content,
        `        subscribeNewsletterUpdates: async (jid) => {
            const result = await query({
                tag: 'iq',
                attrs: {
                    id: generateMessageTag(),
                    type: 'set',
                    xmlns: 'newsletter',
                    to: jid
                },
                content: [{ tag: 'live_updates', attrs: {}, content: [] }]
            });
            const liveUpdatesNode = getBinaryNodeChild(result, 'live_updates');
            const duration = liveUpdatesNode?.attrs?.duration;
            return duration ? { duration: duration } : null;
        },
`,
        `        subscribeNewsletterUpdates: blockNewsletterAction('subscribeNewsletterUpdates'),
`,
        'newsletter: block subscribeNewsletterUpdates',
        state
    );

    return content;
}

function applyPatchToFile(filePath, patcher, state) {
    const original = fs.readFileSync(filePath, 'utf8');
    const updated = patcher(original, state);
    if (updated !== original) {
        fs.writeFileSync(filePath, updated, 'utf8');
        state.filesChanged.push(filePath);
    }
}

function getBaileysBasePath(moduleName) {
    let packageJsonPath;
    try {
        packageJsonPath = requireModule.resolve(`${moduleName}/package.json`);
    } catch (error) {
        if (isBaileysModuleMissingError(error, moduleName)) {
            const friendlyError = new Error(buildMissingBaileysModuleMessage(moduleName));
            friendlyError.code = 'BAILEYS_MODULE_NOT_FOUND';
            friendlyError.moduleName = moduleName;
            friendlyError.cause = error;
            throw friendlyError;
        }

        throw error;
    }

    return path.dirname(packageJsonPath);
}

function applyBaileysPath(options = {}) {
    const logger = options.logger || console;
    const moduleName = getConfiguredModuleName(options.moduleName);
    const pathMode = resolvePathBaileysMode(moduleName, options.pathbaileys);
    const state = {
        applied: [],
        skipped: [],
        missing: [],
        filesChanged: []
    };

    if (!moduleName) {
        state.skipped.push('moduleName not configured');
        const result = {
            moduleName: null,
            basePath: null,
            ...state
        };
        if (!options.silent) {
            logger.log(`${LOG_PREFIX} SKIP nenhum moduleName configurado`);
            logResult(logger, result);
        }
        return result;
    }

    if (!isBaileysModuleName(moduleName)) {
        state.skipped.push(`moduleName not baileys: ${moduleName}`);
        const result = {
            moduleName,
            basePath: null,
            pathMode,
            ...state
        };
        if (!options.silent) {
            logger.log(`${LOG_PREFIX} SKIP modulo configurado nao parece ser um baileys`);
            logResult(logger, result);
        }
        return result;
    }

    if (pathMode === false) {
        state.skipped.push('pathbaileys disabled');
        return {
            moduleName,
            basePath: null,
            pathMode,
            patchIgnored: true,
            ...state
        };
    }

    if (pathMode === 'restricted') {
        state.skipped.push('pathbaileys restricted for official module');
        return {
            moduleName,
            basePath: null,
            pathMode,
            patchRestricted: true,
            ...state
        };
    }

    let basePath;
    try {
        basePath = getBaileysBasePath(moduleName);
    } catch (error) {
        if (error?.code === 'BAILEYS_MODULE_NOT_FOUND') {
            state.skipped.push('baileys module not installed');
            const result = {
                moduleName,
                basePath: null,
                pathMode,
                moduleMissing: true,
                message: error.message,
                ...state
            };

            if (!options.silent) {
                logResult(logger, result);
            }

            return result;
        }

        throw error;
    }

    const files = {
        messages: path.join(basePath, 'lib', 'Utils', 'messages.js'),
        messagesRecv: path.join(basePath, 'lib', 'Socket', 'messages-recv.js'),
        processMessage: path.join(basePath, 'lib', 'Utils', 'process-message.js'),
        newsletterSocket: path.join(basePath, 'lib', 'Socket', 'newsletter.js')
    };

    applyPatchToFile(files.messages, patchMessagesFile, state);
    applyPatchToFile(files.messagesRecv, patchMessagesRecvFile, state);
    applyPatchToFile(files.processMessage, patchProcessMessageFile, state);
    applyPatchToFile(files.newsletterSocket, patchNewsletterSocketFile, state);

    const result = {
        moduleName,
        basePath,
        pathMode,
        ...state
    };

    if (!options.silent) {
        logResult(logger, result);
    }

    return result;
}

if (require.main === module) {
    try {
        applyBaileysPath();
    } catch (error) {
        console.error(`${LOG_PREFIX} FAIL erro ao aplicar patch:`, error);
        process.exitCode = 1;
    }
}

module.exports = {
    applyBaileysPath,
    buildMissingBaileysModuleMessage,
    isBaileysModuleMissingError,
    isOfficialRestrictedBaileysModule,
    normalizePathBaileysMode,
    resolvePathBaileysMode
};
