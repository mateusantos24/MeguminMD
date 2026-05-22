
const fs = require('fs');
const path = require('path');
const config = require('../../config/config');
const globalCommandBlockDB = require('../database/globalCommandBlockDB');

const chalk = require('chalk');
const moment = require('moment-timezone');

const {
    buildRestrictionBlockMessage,
    getRestrictionGuard,
    recordBlockedCommandAttempt
} = require('../utils/whatsappRestrictionMonitor');

function detectMediaType(target) {
    const raw = String(target || '').trim();
    if (!raw) return null;

    let pathname = raw;
    try {
        pathname = /^https?:\/\//i.test(raw) ? (new URL(raw).pathname || raw) : raw;
    } catch {
        pathname = raw.split('?')[0].split('#')[0];
    }

    if (/\.(png|jpg|jpeg|webp|bmp|avif)$/i.test(pathname)) return 'image';
    if (/\.(mp4|mov|webm|mkv|avi|m4v)$/i.test(pathname)) return 'video';
    return null;
}

class CommandHandler {
    constructor() {
        if (CommandHandler.instance) {
            return CommandHandler.instance;
        }

        CommandHandler.instance = this;
        this.commands = new Map(); // Mapa de comandos carregados
        this.cooldowns = new Map(); // Mapa de cooldowns por comando
        this.banNoticeCooldowns = new Map();
        this.brokenCommands = new Set() // Comandos que não funcionaram
        this.commandLoadWarnings = []
        this.loadCommands() // Carregar comandos do diretório
    }

    // ADICIONAR ESTA FUNÇÃO NO TOPO DA CLASSE
    normalizeCommand(text) {
        if (!text) return ''
        return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')
    }

    normalizeCommandDisplayVariant(text) {
        if (!text) return ''
        return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s_.-]+/g, '')
    }

    resolveCommandToken(rawToken) {
        const token = String(rawToken || '').trim()
        const normalized = this.normalizeCommand(token)
        if (!normalized) return null

        const directCommand = this.commands.get(normalized)
        if (directCommand) {
            return {
                rawToken: token,
                normalizedCommand: normalized,
                command: directCommand
            }
        }

        const compactMatch = token.match(/^([a-zA-Z]+)(\d{1,3})$/)
        if (compactMatch) {
            const baseName = this.normalizeCommand(compactMatch[1])
            const baseCommand = this.commands.get(baseName)
            if (baseCommand) {
                return {
                    rawToken: token,
                    normalizedCommand: baseName,
                    command: baseCommand
                }
            }
        }

        return null
    }

    parseNoPrefixCommand(text, messageData = null) {
        const body = String(text || '').trim()
        if (!body) return null

        const rawToken = body.split(/\s+/)[0]
        const resolved = this.resolveCommandToken(rawToken)
        if (!resolved) return null

        if (messageData) {
            if (!this.canSuggestCommand(resolved.command, messageData)) return null
        }

        return {
            prefix: '',
            command: body,
            commandName: resolved.normalizedCommand,
            rawToken: resolved.rawToken
        }
    }

    getUsedPrefix(messageData, fallback = '/') {
        if (messageData && typeof messageData.usedPrefix === 'string') return messageData.usedPrefix
        if (messageData && typeof messageData.prefix === 'string') return messageData.prefix
        return fallback
    }

    getGlobalBlockedCommands() {
        return new Set(
            globalCommandBlockDB
                .getBlockedCommands()
                .map((item) => this.normalizeCommand(item))
                .filter(Boolean)
        )
    }

    getGlobalBlockedCategories() {
        return new Set(
            globalCommandBlockDB
                .getBlockedCategories()
                .map((item) => this.normalizeCommand(item))
                .filter(Boolean)
        )
    }

    checkGlobalCommandBlock(command) {
        if (!command) return { blocked: false }

        const blockedCommands = this.getGlobalBlockedCommands()
        const blockedCategories = this.getGlobalBlockedCategories()
        const name = this.normalizeCommand(command.name || '')
        const aliases = Array.isArray(command.aliases) ? command.aliases.map((alias) => this.normalizeCommand(alias)).filter(Boolean) : []
        const category = this.normalizeCommand(command.category || 'geral')
        if (blockedCategories.has(category)) {
            return { blocked: true, reason: 'category', value: category }
        }

        if (blockedCommands.has(name) || aliases.some((alias) => blockedCommands.has(alias))) {
            return { blocked: true, reason: 'command', value: name || aliases[0] || 'comando' }
        }

        return { blocked: false }
    }

    levenshtein(a, b) {
        a = String(a || '')
        b = String(b || '')
        if (a === b) return 0
        const al = a.length
        const bl = b.length
        if (al === 0) return bl
        if (bl === 0) return al

        let prev = new Array(bl + 1)
        let cur = new Array(bl + 1)
        for (let j = 0; j <= bl; j++) prev[j] = j

        for (let i = 1; i <= al; i++) {
            cur[0] = i
            const ai = a.charCodeAt(i - 1)
            for (let j = 1; j <= bl; j++) {
                const cost = ai === b.charCodeAt(j - 1) ? 0 : 1
                const del = prev[j] + 1
                const ins = cur[j - 1] + 1
                const sub = prev[j - 1] + cost
                cur[j] = del < ins ? (del < sub ? del : sub) : (ins < sub ? ins : sub)
            }
            const tmp = prev
            prev = cur
            cur = tmp
        }
        return prev[bl]
    }

    canSuggestCommand(command, messageData) {
        if (!command || !messageData) return false
        if (messageData.isOwner) return true
        if (command.ownerOnly) return false
        if (command.subOwnerOnly && !messageData.isSubOwner) return false
        if (command.adminOnly && !messageData.isAdmin) return false
        if (command.adminOnlyOrPv && messageData.isGroup && !messageData.isAdmin) return false
        return true
    }

    getLockedCommandsFromSettings(settings) {
        if (!settings?.locked_commands) return []

        try {
            const lockedCommands = JSON.parse(settings.locked_commands)
            if (!Array.isArray(lockedCommands)) return []
            return lockedCommands.map(item => this.normalizeCommand(String(item))).filter(Boolean)
        } catch (error) {
            console.log('error CmdLock:', error)
            return []
        }
    }

    getUniqueCategoryCommandNames(categoryName) {
        const normalizedCategory = this.normalizeCommand(categoryName || '')
        if (!normalizedCategory) return []

        const uniqueNames = new Set()
        for (const [name, command] of this.commands.entries()) {
            if (!command?.name || command.name !== name) continue
            if (this.normalizeCommand(command.category || 'geral') !== normalizedCategory) continue
            uniqueNames.add(command.name)
        }

        return [...uniqueNames]
    }

    isCategoryFullyLockedFromSettings(categoryName, settings) {
        const categoryCommands = this.getUniqueCategoryCommandNames(categoryName)
        if (!categoryCommands.length) return false

        const lockedSet = new Set(this.getLockedCommandsFromSettings(settings))
        return categoryCommands.every(commandName => lockedSet.has(this.normalizeCommand(commandName)))
    }

    getCommandSuggestions(rawInput, usedPrefix, limit = 3, messageData) {
        const input = this.normalizeCommand(rawInput)
        if (!input) return []

        const prefix = typeof usedPrefix === 'string' ? usedPrefix : '/'

        const uniqueCommands = []
        const seen = new Set()
        for (const cmd of this.commands.values()) {
            if (!cmd || seen.has(cmd)) continue
            seen.add(cmd)
            uniqueCommands.push(cmd)
        }

        const candidates = new Map()
        for (const cmd of uniqueCommands) {
            if (messageData && !this.canSuggestCommand(cmd, messageData)) continue
            const category = String(cmd?.category || 'geral')
            const nameNorm = this.normalizeCommand(cmd?.name || '')
            if (nameNorm) candidates.set(nameNorm, { display: `${prefix}${cmd.name}`, category })
            const aliases = Array.isArray(cmd?.aliases) ? cmd.aliases : []
            for (const a of aliases) {
                const aliasNorm = this.normalizeCommand(String(a))
                if (aliasNorm && !candidates.has(aliasNorm)) candidates.set(aliasNorm, { display: `${prefix}${a}`, category })
            }
        }

        const scored = []
        for (const [candNorm, info] of candidates.entries()) {
            if (input.length <= 3 && !candNorm.startsWith(input)) continue

            let score = 0
            if (candNorm === input) score = 10
            else if (candNorm.startsWith(input)) score = 8 + Math.min(1, input.length / Math.max(1, candNorm.length))
            else if (candNorm.includes(input)) score = 6 + Math.min(1, input.length / Math.max(1, candNorm.length))
            else {
                const dist = this.levenshtein(input, candNorm)
                const maxLen = Math.max(input.length, candNorm.length) || 1
                const similarity = 1 - dist / maxLen
                score = similarity * 5
                if (dist <= 1) score += 1.5
                else if (dist <= 2) score += 0.8
            }

            if (input.length > 3 && score < 2.2) continue
            scored.push({ display: info.display, category: info.category, score, len: candNorm.length })
        }

        scored.sort((a, b) => (b.score - a.score) || (a.len - b.len) || a.display.localeCompare(b.display))

        const out = []
        const used = new Set()
        for (const s of scored) {
            if (used.has(s.display)) continue
            used.add(s.display)
            out.push({ display: s.display, category: s.category })
            if (out.length >= limit) break
        }
        return out
    }

    async deleteNewsletterCommandMessage(sock, messageData) {
        if (!messageData?.isNewsletter || !sock?.sendMessage) return false

        const key = messageData?.message?.key
        if (!key?.remoteJid || !key?.id) return false

        const deleteKey = {
            remoteJid: key.remoteJid,
            id: key.id,
            fromMe: !!key.fromMe
        }

        if (key.participant) {
            deleteKey.participant = key.participant
        }

        try {
            const res = await sock.sendMessage(key.remoteJid, { delete: deleteKey })
            return !!res
        } catch (error) {
            console.log('[NEWSLETTER DELETE FAIL]', error?.message || error)
            return false
        }
    }

    async handleUnknownCommand(sock, messageData, rawCommand, normalizedCommand) {
        const shouldSuppress = Boolean(
            messageData?.isGroup
            && (
                messageData?.groupMetadata?.announce
                || messageData?.announce
            )
        );
        if (shouldSuppress) {
            console.log(chalk.gray(`[UNKNOWN CMD] Ignorado em grupo fechado/anuncio: ${rawCommand || normalizedCommand || 'sem-token'}`));
            return;
        }

        if (messageData?.isGroup && !(messageData?.isAdmin || messageData?.isGroupOwner || messageData?.isOwner || messageData?.isSubOwner)) {
            try {
                const modernDb = require('../database/modernDatabase');
                const settings = await modernDb.getGroupSettings(messageData.from);
                if (settings?.command_filter_enabled === 1 && settings?.command_filter_ignore_empty === 1) {
                    console.log(chalk.gray(`[UNKNOWN CMD] Silenciado por setcmd ignore em ${messageData.from}: ${rawCommand || normalizedCommand || 'sem-token'}`));
                    return;
                }
            } catch (error) {
                console.error('[UNKNOWN CMD] Falha ao verificar setcmd ignore:', error);
            }
        }

        const prefix = this.getUsedPrefix(messageData, '/');
        const token = String(rawCommand || '').trim();
        const shownCmd = token.startsWith(prefix) ? token : `${prefix}${token}`;

        const suggestions = this.getCommandSuggestions(normalizedCommand || token, prefix, 5, messageData);

        const base = (config?.messages?.commandNotFound && String(config.messages.commandNotFound).trim()) ? String(config.messages.commandNotFound).trim() : '*🔍 Comando Não Reconhecido*\n> O comando solicitado não foi encontrado em nosso sistema.';

        let text = `${base}\n\n`;
        text += `*➡ Comando solicitado:* \`${shownCmd}\`\n`;

        if (suggestions.length) {
            text += `*💡 Sugestões de comandos próximos:*\n`;
            suggestions.slice(0, 5).forEach(s => {
                const cat = s.category ? ` (${s.category.toUpperCase()})` : ''
                text += `• \`${s.display}\`${cat}\n`;
            });
        }
        await sock.sendMessage(messageData.from, { text }, { quoted: messageData.quoteThis });
        await this.deleteNewsletterCommandMessage(sock, messageData);
    }

    // SISTEMA DE COOLDOWN
    checkCooldown(commandName, userId) {
        if (!this.cooldowns.has(commandName)) {
            this.cooldowns.set(commandName, new Map());
        }

        const now = Date.now();
        const timestamps = this.cooldowns.get(commandName);
        const cooldownAmount = config.commands.cooldown || 3000;

        if (timestamps.has(userId)) {
            const lastUsed = timestamps.get(userId);
            const expirationTime = lastUsed + cooldownAmount;
            const timeLeft = (expirationTime - now) / 1000;

            if (now < expirationTime) {
                console.log(chalk.red('🚫 [COOLDOWN BLOCKED]'), `Usuário deve aguardar ${timeLeft.toFixed(1)}s`);
                return { blocked: true, timeLeft };
            }
        }

        // GUARDAR REFERÊNCIA DO TIMEOUT
        if (!this.cleanupTimeouts) {
            this.cleanupTimeouts = new Map();
        }

        // Cancelar timeout anterior se existir
        const timeoutKey = `${commandName}_${userId}`;
        if (this.cleanupTimeouts.has(timeoutKey)) {
            clearTimeout(this.cleanupTimeouts.get(timeoutKey));
        }

        // Registrar uso atual
        timestamps.set(userId, now);

        // Limpeza automática com controle
        const timeoutId = setTimeout(() => {
            if (timestamps.has(userId)) {
                timestamps.delete(userId);
                this.cleanupTimeouts.delete(timeoutKey);
                // console.log(chalk.gray('🧹 [COOLDOWN CLEANUP] Removido cooldown após 3000ms'));
            }
        }, cooldownAmount);
        this.cleanupTimeouts.set(timeoutKey, timeoutId);
        return { blocked: false };
    }

    // VERIFICAR FILTRO DE COMANDOS (seu código atual)
    async checkCommandFilterDetailed(command, messageData) {
        if (!messageData.isGroup) return { allowed: true };
        const isAdminBypass = messageData.isAdmin || messageData.isGroupOwner || messageData.isOwner;
        const hasVipBypass = this.hasAntiFiltroBypass(messageData)

        // EXCEÇÕES SEMPRE PERMITIDAS (normalizadas)
        const alwaysAllowed = ['menu','help','ajuda','comandos','commands','ping', 'segredo', 'pedirconta'].map(a => this.normalizeCommand(a));
        const name = this.normalizeCommand(command?.name || '');
        const aliases = (command?.aliases || []).map(alias => this.normalizeCommand(String(alias))).filter(Boolean);
        const commandTokens = [name, ...aliases].filter(Boolean);

        if (isAdminBypass || hasVipBypass) return { allowed: true };
   
        try {
            const modernDb = require('../database/modernDatabase');
            const settings = await modernDb.getGroupSettings(messageData.from);
            const lockedCommands = this.getLockedCommandsFromSettings(settings)

            const isLocked = lockedCommands.some(cmd => commandTokens.includes(cmd));
            if (isLocked) {
                console.log(chalk.yellow(`[CMD LOCK] Bloqueado comando '${command?.name || name}' para membro comum em ${messageData.from}`));
                return { allowed: false, message: '🔒 Este comando está bloqueado para membros comuns.\n\n> Apenas administradores e o dono do grupo podem usar.' };
            }

            const hasAlwaysAllowedAlias = aliases.some(alias => alwaysAllowed.includes(alias));
            if (alwaysAllowed.includes(name) || hasAlwaysAllowedAlias) return { allowed: true };
            
            // ✅ SE FILTRO NÃO ESTÁ ATIVADO, PERMITIR TUDO
            if (!settings?.command_filter_enabled) return { allowed: true };
            
            // ✅ FILTRO ATIVADO: Apenas admin do GRUPO ou owner conseguem bypass
            if (messageData.isAdmin || messageData.isGroupOwner || messageData.isOwner || messageData.isSubOwner || hasVipBypass) return { allowed: true };

            let filteredCommands = [];
            if (settings.filtered_commands) {
                try {
                    filteredCommands = JSON.parse(settings.filtered_commands);
                    if (Array.isArray(filteredCommands)) {
                        filteredCommands = filteredCommands.map(item => this.normalizeCommand(String(item)));
                    } else {
                        filteredCommands = [];
                    }
                } catch (e) {
                    console.log('error Cmdfilter:', e);
                    filteredCommands = [];
                }
            }

            if (filteredCommands.length === 0) {
                if (settings?.command_filter_ignore_empty === 1) {
                    console.log(chalk.yellow(`[CMD FILTER] Grupo ${messageData.from} com filtro vazio e ignore_empty ativo; silenciando '${command?.name || name}'`));
                    return { allowed: false, silent: true };
                }
                console.log(chalk.yellow(`[CMD FILTER] Grupo ${messageData.from} com filtro ativo mas sem comandos permitidos`));
                return { allowed: false, message: '🔒 *CATEGORIA BLOQUEADA*\n\n> Nenhuma categoria foi liberada neste grupo.\n> Use `/menu` para ver o status de todas as categorias.\n> Peça ao admin para liberar categorias.' };
            }

            const isAllowed = filteredCommands.includes(name) || (command.aliases && command.aliases.some(alias => filteredCommands.includes(this.normalizeCommand(String(alias)))));
            if (!isAllowed) {
                if (settings?.command_filter_ignore_empty === 1) {
                    console.log(chalk.yellow(`[CMD FILTER] Comando '${command?.name || name}' silenciado por setcmd ignore em ${messageData.from}`));
                    return { allowed: false, silent: true };
                }
                console.log(chalk.yellow(`[CMD FILTER] Bloqueado comando '${command?.name || name}' para ${messageData.from}. Permitidos: ${filteredCommands.length}`));
                return { allowed: false, message: '❌ Este comando não está liberado neste grupo.\n\n> Peça aos administradores para liberar.' };
            }

            // ✅ VERIFICAR HORÁRIO DE RESTRIÇÃO
            const category = command?.category || 'geral';
            if (settings?.command_hours_restrictions) {
                try {
                    const restrictions = JSON.parse(settings.command_hours_restrictions);
                    if (restrictions[category]) {
                        const hours = restrictions[category];
                        // Usar timezone configurado (América/São Paulo)
                        const timezone = config?.scheduling?.timezone || 'America/Sao_Paulo';
                        const now = moment().tz(timezone);
                        const currentHour = now.hour();
                        const currentMinute = now.minute();
                        
                        if (hours.start !== null && hours.start !== undefined) {
                            const startHour = parseInt(hours.start);
                            const endHour = hours.end !== null && hours.end !== undefined ? parseInt(hours.end) : null;
                            
                            let isWithinHours = false;
                            if (endHour === null || endHour === undefined) {
                                // Apenas hora de início: disponível a partir daquela hora
                                isWithinHours = currentHour >= startHour;
                            } else {
                                // Intervalo: entre start e end
                                isWithinHours = currentHour >= startHour && currentHour < endHour;
                            }
                            
                            if (!isWithinHours) {
                                const startStr = String(startHour).padStart(2, '0');
                                const endStr = endHour ? String(endHour).padStart(2, '0') : null;
                                const timeRange = endStr ? `${startStr}:00 às ${endStr}:00` : `a partir de ${startStr}:00`;
                                const currentStr = String(currentHour).padStart(2, '0');
                                console.log(chalk.yellow(`[CMD TIME] Comando '${command?.name}' fora do horário permitido (${timeRange})`));
                                
                                const message = endStr 
                                    ? `⏰ *Este comando está disponível apenas de ${startStr}:00 às ${endStr}:00*\n\n> Horário atual: ${currentStr}:${String(currentMinute).padStart(2, '0')}`
                                    : `⏰ *Este comando está disponível a partir de ${startStr}:00*\n\n> Horário atual: ${currentStr}:${String(currentMinute).padStart(2, '0')}`;
                                return { allowed: false, message };
                            }
                        }
                    }
                } catch (e) {
                    console.log('error CmdHours:', e);
                    // Se houver erro ao processar horários, não bloqueia
                }
            }

            return { allowed: true };
        } catch (error) {
            console.error('Erro ao verificar filtro de comandos:', error);
            return { allowed: true };
        }
    }

    async checkCommandFilter(command, messageData) {
        const result = await this.checkCommandFilterDetailed(command, messageData);
        return result.allowed;
    }

    // ADICIONAR ESTE MÉTODO NO commandHandler.js
    async getCategoryFilterStatus(categoryName, chatJid, userLid) {
        try {
            if (userLid && this.getUserVipLevel(userLid) >= 3) {
                return { enabled: false, blocked: false, bypassed: true };
            }

            const modernDb = require('../database/modernDatabase');
            const settings = await modernDb.getGroupSettings(chatJid);

            if (!settings?.command_filter_enabled) {
                return { enabled: false, blocked: false };
            }

            let filteredCommands = [];
            if (settings.filtered_commands) {
                try {
                    filteredCommands = JSON.parse(settings.filtered_commands);
                    if (Array.isArray(filteredCommands)) {
                        filteredCommands = filteredCommands.map(item => this.normalizeCommand(String(item)));
                    } else {
                        filteredCommands = [];
                    }
                } catch (e) {
                    console.log('error Cmdfilter:', e);
                    filteredCommands = [];
                }
            }

            // Buscar comandos desta categoria (comparação case-insensitive)
            const categoryNameLower = categoryName.toLowerCase();
            const categoryCommands = Array.from(this.commands.values()).filter((cmd, idx, arr) => arr.findIndex(c => c.name === cmd.name) === idx).filter(cmd => (cmd.category || '').toLowerCase() === categoryNameLower);

            // Verificar se algum comando da categoria está permitido (comparação normalizada)
            const hasAllowedCommand = categoryCommands.some(cmd => filteredCommands.includes(this.normalizeCommand(cmd.name)) || (cmd.aliases && cmd.aliases.some(alias => filteredCommands.includes(this.normalizeCommand(alias)))));

            return {
                enabled: true,
                blocked: !hasAllowedCommand,
                totalCommands: categoryCommands.length,
                allowedCount: categoryCommands.filter(cmd => filteredCommands.includes(this.normalizeCommand(cmd.name)) || (cmd.aliases && cmd.aliases.some(alias => filteredCommands.includes(this.normalizeCommand(alias))))).length
            };
        } catch (error) {
            console.error('Erro ao verificar filtro de categoria:', error);
            return { enabled: false, blocked: false };
        }
    }

    async checkPermissions(command, messageData, sock) {
        const { quoteThis } = messageData;
        const replyTo = messageData.from || messageData.participantLid || messageData.sender;

        // 1. MUTE GLOBAL (seu código atual)
        const maintenance = config.maintenance || {};
        const muteGlobal = maintenance.muteGlobalMsg === true || config.muteGlobal === true;

        if (muteGlobal) {
            const allowOwner = maintenance.allowOwner !== false;
            const allowAdmins = maintenance.allowAdmins === true;
            const allowed = new Set((maintenance.allowList || []).map(cmd => this.normalizeCommand(cmd)));
            const raw = (messageData.body || '').trim().split(' ')[0]?.toLowerCase() || '';
            const firstChar = raw.charAt(0);
            const hasPrefix = config.prefixes?.includes(firstChar);
            const cmdName = hasPrefix ? raw.slice(1) : raw;
            const normalizedCmd = this.normalizeCommand(cmdName);
            const canRun = (allowOwner && messageData.isOwner) || (allowAdmins && messageData.isAdmin) || messageData.isSubOwner || allowed.has(normalizedCmd);
            
            if (!canRun) {
                const text = (maintenance.message || '🛠️ Manutenção: comandos desativados.') + (maintenance.reason ? `\nMotivo: ${maintenance.reason}` : '');
                if (maintenance.muteGlobalMsg) {
                    await sock.sendMessage(replyTo, { text }, { quoted: quoteThis });
                }
                return false;
            }
        }

        if (!messageData.isOwner) {
            const restrictionGuard = getRestrictionGuard(command, messageData);
            if (restrictionGuard.blocked) {
                recordBlockedCommandAttempt(command, messageData);
                await sock.sendMessage(replyTo, {
                    text: buildRestrictionBlockMessage(command, restrictionGuard.state)
                }, { quoted: quoteThis });
                return false;
            }
        }

        if (!messageData.isOwner) {
            const globalBlock = this.checkGlobalCommandBlock(command);
            if (globalBlock.blocked) {
                const text = globalBlock.reason === 'category'
                    ? `🚫 *Categoria bloqueada globalmente*\n\n> A categoria \`${globalBlock.value}\` foi bloqueada temporariamente pelo dono do bot.`
                    : `🚫 *Comando bloqueado globalmente*\n\n> O comando \`/${command.name}\` foi bloqueado temporariamente pelo dono do bot.`;

                await sock.sendMessage(replyTo, { text }, { quoted: quoteThis });
                return false;
            }
        }

        // COOLDOWN SYSTEM (aplicado apenas a usuários normais)
        if (!messageData.isOwner && !messageData.isAdmin) {
            const cooldownCheck = this.checkCooldown(command.name, messageData.participantLid);
            if (cooldownCheck.blocked) {
                console.log(chalk.red('🛑 [COOLDOWN TRIGGER]'), `Bloqueando comando por ${cooldownCheck.timeLeft.toFixed(1)}s`);
                const cooldownMsg = config.messages.cooldownActive || `⏱️ Aguarde ${cooldownCheck.timeLeft.toFixed(1)}s antes de usar este comando novamente`;
                await sock.sendMessage(replyTo, { text: cooldownMsg }, { quoted: quoteThis });
                return false;
            }
        }

        // OWNER ONLY  → só DONO de verdade
        if (command.ownerOnly && !messageData.isOwner) {
            await sock.sendMessage(replyTo, { text: config.messages.ownerOnly }, { quoted: quoteThis });
            return false;
        }

        // SUBOWNER ONLY → subowner (e dono, se quiser)
        if (command.subOwnerOnly && !messageData.isSubOwner && !messageData.isOwner) {
            await sock.sendMessage(replyTo, { text: config.messages.ownerOnly }, { quoted: quoteThis });
            return false;
        }

        // ADMIN ONLY  → apenas administradores
        if (command.adminOnly && !messageData.isAdmin && !messageData.isOwner) {
            await sock.sendMessage(replyTo, {
                text: config.messages.adminOnly
            }, { quoted: quoteThis });
            return false;
        }

        // ADMIN ONLY / OR PV → apenas administradores ou privado
        if (command.adminOnlyOrPv) {
            const { isGroup, isAdmin, isOwner, from, quoteThis } = messageData;

            // Bloqueia apenas em grupos se não for admin nem owner
            if (isGroup && !isAdmin && !isOwner) {
                await sock.sendMessage(from, {
                    text: `⚠️ *Apenas administradores podem usar este comando em grupos!*\n\n> 💬 Você pode usar este comando no meu *privado* para continuar normalmente.`
                }, { quoted: quoteThis });
                return false; // interrompe execução do comando
            }
        }

        // GROUP ONLY  → apenas em grupos
        if (command.groupOnly && !messageData.isGroup) {
            await sock.sendMessage(replyTo, {
                text: config.messages.groupOnly
            }, { quoted: quoteThis });
            return false;
        }

        // BOT NEEDS ADMIN  → bot precisa ser admin no grupo
        if (command.needsBotAdmin && !messageData.isBotAdmin) {
            await sock.sendMessage(replyTo, {
                text: config.messages.botNotAdmin
            }, { quoted: quoteThis });
            return false;
        }
        return true;
    }

    hasAntiFiltroBypass(messageData) {
        // VIP/ANTI-FILTRO bypass não está disponível nesta base pública.
        return false;
    }

    /**
     * ✅ DETECTAR E ENVIAR MÍDIA (THUMBNAIL/VIDEO)
     * Suporta: PNG, JPG, JPEG (imagem) e MP4 (vídeo)
     * AllowedGif: true = envia MP4 como GIF
     */
    async sendWithMedia(sock, from, text, quoteThis, command) {
    // Verificar se comando tem thumbnail configurado
        if (!command.thumbnail) {
        // Sem thumbnail, enviar apenas texto
            return await sock.sendMessage(from, { text }, { quoted: quoteThis });
        }

        const thumbnail = command.thumbnail;
        const allowedGif = command.AllowedGif === true;

        try {
        // ✅ URL EXTERNA (http:// ou https://)
            if (thumbnail.startsWith('http://') || thumbnail.startsWith('https://')) {
                const mediaType = detectMediaType(thumbnail);

                if (mediaType === 'video') {
                    await sock.sendMessage(from, {
                        video: { url: thumbnail },
                        caption: text,
                        gifPlayback: allowedGif
                    }, { quoted: quoteThis });
                } else if (mediaType === 'image') {
                    await sock.sendMessage(from, {
                        image: { url: thumbnail },
                        caption: text
                    }, { quoted: quoteThis });
                } else {
                // Formato não suportado, enviar só texto
                    await sock.sendMessage(from, { text }, { quoted: quoteThis });
                }
                return;
            }

            // ✅ ARQUIVO LOCAL (Cache/...)
            // Substituir ${__dirname} pelo caminho real
            let localPath = thumbnail;

            // Se usar ${__dirname}, substituir
            if (localPath.includes('${__dirname}')) {
                localPath = localPath.replace('${__dirname}', path.join(__dirname, '../commands'));
            }

            // Verificar se arquivo existe
            if (!fs.existsSync(localPath)) {
                console.log(chalk.yellow(`[MEDIA] Arquivo não encontrado: ${localPath}`));
                return await sock.sendMessage(from, { text }, { quoted: quoteThis });
            }

            const mediaType = detectMediaType(localPath);

            if (mediaType === 'video') {
                await sock.sendMessage(from, {
                    video: fs.readFileSync(localPath),
                    caption: text,
                    gifPlayback: allowedGif
                }, { quoted: quoteThis });
            } else if (mediaType === 'image') {
                await sock.sendMessage(from, {
                    image: fs.readFileSync(localPath),
                    caption: text
                }, { quoted: quoteThis });
            } else {
            // Formato não suportado
                console.log(chalk.yellow(`[MEDIA] Formato não suportado: ${localPath}`));
                await sock.sendMessage(from, { text }, { quoted: quoteThis });
            }
        } catch (error) {
            console.error(chalk.red('[MEDIA] Erro ao enviar mídia:'), error);
            // Fallback: enviar apenas texto
            await sock.sendMessage(from, { text }, { quoted: quoteThis });
        }
    }

    // MÉTODO PARA CÓDIGOS DE STATUS SIMPLES
    getStatusCodeMsg(statusCode) {
        const statusMessages = config?.statusMessages || {};  // ✅ CORRETO!
        return statusMessages[statusCode] || '🚧 Comando temporariamente indisponível';
    }

    loadCommands() {
        const commandsPath = path.join(__dirname, '../commands');
        this.commands.clear();
        this.commandLoadWarnings = [];
        this._tokenOwners = new Map();
        this.loadCommandsRecursively(commandsPath);
        if (this.commandLoadWarnings.length) {
            console.log(chalk.yellow(`[COMMANDS] ${this.commandLoadWarnings.length} aviso(s) de alias/nome detectados no carregamento.`));
            this.commandLoadWarnings.forEach((warning) => console.log(chalk.yellow(`  - ${warning}`)));
        }
    }

    registerCommandToken(rawToken, command, filePath, tokenType = 'alias') {
        const normalizedToken = this.normalizeCommand(rawToken)
        if (!normalizedToken) return

        const normalizedCommandName = this.normalizeCommand(command?.name)
        const displayVariant = this.normalizeCommandDisplayVariant(rawToken)
        const commandDisplayVariant = this.normalizeCommandDisplayVariant(command?.name)
        const ownerKey = `${normalizedCommandName}::${filePath || ''}`
        const existingOwner = this._tokenOwners.get(normalizedToken)

        if (existingOwner && existingOwner.ownerKey !== ownerKey) {
            this.commandLoadWarnings.push(`Token duplicado "${rawToken}" (${tokenType}) entre "${existingOwner.commandName}" e "${command.name}" - mantendo primeiro carregado`)
            return
        }

        if (existingOwner && existingOwner.ownerKey === ownerKey && tokenType === 'alias') {
            if (displayVariant && displayVariant === commandDisplayVariant) {
                return
            }
            this.commandLoadWarnings.push(`Alias repetido/suspeito "${rawToken}" em "${command.name}" (${path.basename(filePath || '')})`)
            return
        }

        if (tokenType === 'alias' && normalizedToken === normalizedCommandName) {
            if (displayVariant && displayVariant === commandDisplayVariant) {
                return
            }
            this.commandLoadWarnings.push(`Alias redundante "${rawToken}" em "${command.name}" (${path.basename(filePath || '')})`)
        }

        this._tokenOwners.set(normalizedToken, {
            ownerKey,
            commandName: command.name,
            filePath: filePath || '',
            tokenType,
            rawToken: String(rawToken || '')
        })
        this.commands.set(normalizedToken, command)
    }

    loadCommandsRecursively(dir) {
        const files = fs.readdirSync(dir);

        for (const file of files) {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);

            if (stat.isDirectory()) {
                this.loadCommandsRecursively(filePath);
            } else if (file.endsWith('.js')) {
                let command;
                try {
                    const cacheKey = require.resolve(filePath);
                    if (require.cache[cacheKey]) delete require.cache[cacheKey];

                    command = require(filePath);
                    if (command && command.name) {
                        command._filePath = filePath;
                        this.registerCommandToken(command.name, command, filePath, 'name');

                        if (command.aliases && Array.isArray(command.aliases)) {
                            for (const alias of command.aliases) {
                                this.registerCommandToken(alias, command, filePath, 'alias');
                            }
                        }
                    }
                } catch (error) {
                    console.error('Erro ao carregar comando:', file, error)

                    // nome baseado no arquivo
                    const base = path.basename(file, '.js')
                    const normalized = this.normalizeCommand(base)

                    if (!this.brokenCommands) this.brokenCommands = new Set()
                    this.brokenCommands.add(normalized)
                    // process.exit(1) // Encerrar carregamento se houver erros
                }
            }
        }
    }

    // CARREGAR COMANDOS DE UM DIRETÓRIO
    loadFromDirectory(dirPath, category = '') {
        try {
            const files = fs.readdirSync(dirPath);

            for (const file of files) {
                const filePath = path.join(dirPath, file);

                if (fs.statSync(filePath).isDirectory()) {
                    this.loadFromDirectory(filePath, file);
                } else if (file.endsWith('.js')) {
                    try {
                        delete require.cache[require.resolve(filePath)];
                        const command = require(filePath);
                        command.category = category || 'geral';

                        this.commands.set(command.name, command);

                        if (command.aliases) {
                            for (const alias of command.aliases) {
                                this.commands.set(alias, command);
                            }
                        }
                    } catch (error) {
                        console.error(chalk.red(`❌ Erro ao carregar comando ${file}:`), error.message);
                    }
                }
            }
        } catch (error) {
            console.error(chalk.red(`❌ Erro ao ler diretório ${dirPath}:`), error.message);
        }
    }

    // ✅ VERIFICAR SE A MENSAGEM É DO PRÓPRIO BOT
    // Compara sock.user.id com sender, participantLid e key.participant
    isSelfMessage(sock, messageData) {
        if (!sock || !sock.user || !sock.user.id) return false;

        const botId = sock.user.id;
        const botIdClean = botId.split(':')[0]; // Remove possível sufixo ":XX"

        // IDs para comparar
        const sender = messageData.sender || '';
        const participantLid = messageData.participantLid || '';
        const keyParticipant = messageData.key?.participant || '';
        const fromMe = messageData.key?.fromMe || false;

        // Verificações múltiplas
        const checks = [
            fromMe === true, // Mensagem enviada pelo bot
            sender && sender.includes(botIdClean), // Sender contém o bot ID
            participantLid && participantLid.includes(botIdClean), // participantLid contém o bot ID
            keyParticipant && keyParticipant.includes(botIdClean), // key.participant contém o bot ID
            sender && botId.includes(sender.split('@')[0]), // Bot ID contém o sender
            participantLid && botId.includes(participantLid.split('@')[0]) // Bot ID contém o participantLid
        ];
        return checks.some(check => check === true);
    }

    // ✅ CRIAR WRAPPER DO SOCK COM THUMBNAIL AUTOMÁTICO
    // Intercepta sock.sendMessage e adiciona thumbnail automaticamente
    createSockWithThumbnail(sock, command, platform = null) {
        return new Proxy(sock, {
            get: (target, prop) => {
                if (prop === '__richPlatform') {
                    return platform;
                }

            // Interceptar apenas sendMessage
                if (prop === 'sendMessage') {
                    return async (jid, content, options) => {
                    // Se comando tem thumbnail E está enviando texto
                        if (command.thumbnail && content.text) {
                            const thumbnail = command.thumbnail;
                            const allowedGif = command.AllowedGif === true;

                            try {
                            // URL EXTERNA
                                if (thumbnail.startsWith('http://') || thumbnail.startsWith('https://')) {
                                    const mediaType = detectMediaType(thumbnail);

                                    if (mediaType === 'video') {
                                        content.video = { url: thumbnail };
                                        content.caption = content.text;
                                        content.gifPlayback = allowedGif;
                                        delete content.text;
                                    } else if (mediaType === 'image') {
                                        content.image = { url: thumbnail };
                                        content.caption = content.text;
                                        delete content.text;
                                    }
                                } else {
                                // ARQUIVO LOCAL
                                    let localPath = thumbnail;

                                    if (localPath.includes('${__dirname}')) {
                                        localPath = localPath.replace('${__dirname}', path.join(__dirname, '../commands'));
                                    }

                                    if (fs.existsSync(localPath)) {
                                        const mediaType = detectMediaType(localPath);

                                        if (mediaType === 'video') {
                                            content.video = fs.readFileSync(localPath);
                                            content.caption = content.text;
                                            content.gifPlayback = allowedGif;
                                            delete content.text;
                                        } else if (mediaType === 'image') {
                                            content.image = fs.readFileSync(localPath);
                                            content.caption = content.text;
                                            delete content.text;
                                        }
                                    }
                                }
                            } catch (error) {
                                console.error(chalk.red('[THUMBNAIL AUTO] Erro:'), error);
                            }
                        }

                        // Enviar mensagem (com ou sem thumbnail)
                        return target.sendMessage(jid, content, options);
                    };
                }

                // Outras propriedades do sock permanecem iguais
                return target[prop];
            }
        });
    }

    async execute(sock, messageData, rawMessage) {
        const { from, quoteThis, participantLid, sender, isNewsletter, platform } = messageData;
        if (isNewsletter) messageData.quoteThis = null;

        const args = messageData.body.trim().split(/\s+/);
        let rawCommand = args.shift();
        let resolvedToken = this.resolveCommandToken(rawCommand);
        let commandName = resolvedToken?.normalizedCommand || this.normalizeCommand(rawCommand);
        const originalRawCommand = rawCommand;
        const originalCommandName = commandName;

        const usedPrefix = this.getUsedPrefix(messageData, '/')
        const rawToken = String(rawCommand || '').trim()
        if (!commandName || rawToken === usedPrefix) return

        if (resolvedToken && commandName !== this.normalizeCommand(rawCommand)) {
            const m = rawToken.match(/^([a-zA-Z]+)(\d{1,3})$/);
            if (m) {
                rawCommand = m[1];
                args.unshift(m[2]);
            }
        }

        if (!resolvedToken && !this.commands.get(commandName)) {
            const m = rawToken.match(/^([a-zA-Z]+)(\d{1,3})$/);
            if (m) {
                const base = this.normalizeCommand(m[1]);
                const num = m[2];
                if (this.commands.get(base)) {
                    rawCommand = m[1];
                    commandName = base;
                    args.unshift(num);
                    resolvedToken = this.resolveCommandToken(rawCommand);
                }
            }
        }

        if (this.brokenCommands && this.brokenCommands.has(commandName)) {
            const texto = [
                '*⚠ AVISO DE MANUTENÇÃO 🚨*',
                '',
                '☠ Este comando está temporariamente indisponível por problemas internos.',
                '⛔ Motivo: erro ao carregar o módulo do comando.',
                '',
                '> Tente novamente mais tarde.'
            ].join('\n')
            await sock.sendMessage(from, { text: texto }, { quoted: messageData.quoteThis })
            await this.deleteNewsletterCommandMessage(sock, messageData)
            return
        }

        const command = this.commands.get(commandName);
        if (!command) {
            await this.handleUnknownCommand(sock, messageData, originalRawCommand, originalCommandName);
            return;
        }

        // BLOQUEAR COMANDOS PRÓPRIOS
        const allowSelfCommands = config.AllowedCommandSelf || false;
        const isSelfCommand = this.isSelfMessage(sock, messageData);
        if (!allowSelfCommands && isSelfCommand) {
            console.log(chalk.red(`[SELF BLOCKED] Comando "${commandName}" ignorado - enviado pelo próprio bot`));
            return;
        }

        if (allowSelfCommands && isSelfCommand) {
            messageData.isOwner = true;
            messageData.isSubOwner = true;
            messageData.isAdmin = true;
            messageData.isGroupAdmin = true;
            messageData.selfOwnerBypass = true;
            console.log(chalk.green(`[SELF OWNER BYPASS] Comando "${commandName}" autorizado como owner/admin por ser mensagem do proprio bot`));
        }

        // Verificar filtro de comandos
        const filterCheck = await this.checkCommandFilterDetailed(command, messageData);
        if (!filterCheck.allowed) {
            if (filterCheck.silent) {
                return;
            }
            if (filterCheck.message) {
                await sock.sendMessage(from, {
                    text: filterCheck.message,
                }, { quoted: messageData.quoteThis });
            }
            return;
        }

        // Verificações de permissão
        if (!(await this.checkPermissions(command, messageData, sock))) return;

        const replyTo = from || participantLid || sender;

        try {
            const sockWithThumbnail = this.createSockWithThumbnail(sock, command, platform);
            messageData.args = args;
            await command.execute(sockWithThumbnail, messageData, args, rawMessage);
            await this.deleteNewsletterCommandMessage(sock, messageData);
        } catch (error) {
            console.log(error);
            try {
                const prefix = this.getUsedPrefix(messageData, '');
                const cmdText = `${prefix}${commandName}`;
                const filePath = command?._filePath ? String(command._filePath) : null;
                const stack = error?.stack ? String(error.stack) : null;
                await notifyOwner(sock, {
                    action: `commandError:${commandName}`,
                    err: error,
                    messageData,
                    accusedPn: messageData?.sender || null,
                    accusedLid: messageData?.participantLid || null,
                    cmd: cmdText,
                    extra: [filePath ? `Arquivo: ${filePath}` : null, stack ? `Stack:\n${stack}` : null].filter(Boolean).join('\n'),
                    ttlMs: 60000,
                    cooldownMs: 15000
                });
            } catch(e) { 
                console.log(chalk.red('[ERRO]'), chalk.yellow(`Erro ao notificar owner: ${e.message}`));
            }

            const errorMsg = config.messages.error || '❌ Erro ao executar comando';
            if (command.thumbnail) {
                await this.sendWithMedia(sock, replyTo, errorMsg, quoteThis, command);
            } else {
                await sock.sendMessage(replyTo, {
                    text: errorMsg
                }, { quoted: quoteThis });
            }
        }
    }
}

module.exports = new CommandHandler();
