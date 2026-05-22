const modernDb = require('../../database/modernDatabase');
const config = require('../../../config/config');
const chalk = require('chalk');

function normalizeDigits(value) {
    return String(value || '').replace(/[^0-9]/g, '');
}

function buildBotIdentitySnapshot(sock, messageData = {}) {
    const botId = String(sock?.user?.id || '').trim();
    const botLid = String(sock?.user?.lid || '').trim();
    const botForMe = Array.isArray(messageData?.botForMe) ? messageData.botForMe.filter(Boolean) : [];
    const ids = [botId, botLid, ...botForMe].filter(Boolean);
    const digits = Array.from(new Set(ids.map(normalizeDigits).filter(Boolean)));

    const participants = Array.isArray(messageData?.groupMetadata?.participants)
        ? messageData.groupMetadata.participants
        : [];

    for (const participant of participants) {
        const candidateIds = [
            participant?.id,
            participant?.lid,
            participant?.jid,
            participant?.phoneNumber,
            participant?.idAlt
        ].filter(Boolean);

        const matchesKnownBot = candidateIds.some((candidate) => (
            ids.some((knownId) => String(knownId).toLowerCase() === String(candidate).toLowerCase())
            || digits.some((knownDigits) => knownDigits && knownDigits === normalizeDigits(candidate))
        ));

        if (!matchesKnownBot) continue;

        for (const candidate of candidateIds) {
            ids.push(String(candidate));
            const candidateDigits = normalizeDigits(candidate);
            if (candidateDigits) digits.push(candidateDigits);
        }
    }

    return {
        botId,
        botLid,
        ids: Array.from(new Set(ids.filter(Boolean))),
        digits: Array.from(new Set(digits.filter(Boolean)))
    };
}

function isSameBotTarget(candidate, snapshot) {
    const raw = String(candidate || '').trim();
    if (!raw) return false;

    const rawLower = raw.toLowerCase();
    if (snapshot.ids.some((id) => String(id).toLowerCase() === rawLower)) return true;

    const candidateDigits = normalizeDigits(rawLower);
    if (!candidateDigits) return false;

    return snapshot.digits.some((digits) => digits === candidateDigits);
}

function resolveOnlyPrefixTarget(args = [], messageData = {}, sock = null) {
    const snapshot = buildBotIdentitySnapshot(sock, messageData);
    const firstArg = String(args[1] || '').trim();
    const secondArg = String(args[2] || '').trim();

    const directTargetProvided =
        firstArg.startsWith('@')
        || /^\d{7,17}$/.test(firstArg)
        || firstArg.endsWith('@lid')
        || firstArg.endsWith('@s.whatsapp.net');

    if (directTargetProvided) {
        return {
            targetCandidate: firstArg,
            onlyPrefix: secondArg,
            source: 'arg'
        };
    }

    const mentionCandidates = [
        messageData.firstMentionLid,
        ...(Array.isArray(messageData.mentionedJidList) ? messageData.mentionedJidList : []),
        ...(Array.isArray(messageData.mentionedJidListFormatted) ? messageData.mentionedJidListFormatted : [])
    ].filter(Boolean);

    const mentionBot = mentionCandidates.find((candidate) => isSameBotTarget(candidate, snapshot));
    if (mentionBot) {
        return {
            targetCandidate: mentionBot,
            onlyPrefix: firstArg,
            source: 'mention'
        };
    }

    const quotedCandidates = [
        messageData.quotedSenderLid,
        messageData.quotedParticipant,
        messageData.quotedMsgObj?.key?.participant,
        messageData.quotedMsgObj?.key?.remoteJid,
        messageData.quotedMessage?.key?.participant,
        messageData.quotedMessage?.key?.remoteJid,
        messageData.quotedMsg?.key?.participant,
        messageData.quotedMsg?.key?.remoteJid
    ].filter(Boolean);

    const quotedBot = quotedCandidates.find((candidate) => isSameBotTarget(candidate, snapshot));
    const quotedFromBot = Boolean(
        messageData?.quotedMsgObj?.key?.fromMe
        || messageData?.quotedMessage?.key?.fromMe
        || messageData?.quotedMsg?.key?.fromMe
    );

    if (quotedBot || quotedFromBot) {
        return {
            targetCandidate: quotedBot || snapshot.botLid || snapshot.botId || 'bot',
            onlyPrefix: firstArg,
            source: 'quoted'
        };
    }

    return {
        targetCandidate: null,
        onlyPrefix: firstArg,
        source: 'none'
    };
}

module.exports = {
    name: 'prefix',
    description: '⌨️ Gerencia prefixos personalizados do grupo',
    category: 'admin',
    aliases: ['prefixo', 'prefixes', 'prefixs', 'prefixrei'],
    adminOnly: true,
    groupOnly: true,

    async execute(sock, messageData, args) {
        const { from, quoteThis, isAdmin, isOwner, prefix } = messageData;
        const subcommand = args[0]?.toLowerCase();

        // Permitir subcomando pessoal '-me' para qualquer usuário
        const requiresAdmin = !['-me', 'me'].includes(subcommand);
        if (requiresAdmin && !isAdmin && !isOwner) {
            return sock.sendMessage(from, {
                text: config.messages.adminOnly
            }, { quoted: quoteThis });
        }

        try {
            switch (subcommand) {
            case 'on':
                await this.enableCustomPrefixes(sock, from, prefix, quoteThis);
                break;
            case 'off':
                await this.disableCustomPrefixes(sock, from, prefix, quoteThis);
                break;
            case 'add':
                await this.addPrefix(sock, from, args, messageData);
                break;
            case '-add':
                await this.addPrefix(sock, from, args, messageData);
                break;
            case 'addall':
                await this.addAllPrefixes(sock, from, args, messageData);
                break;
            case 'remove':
            case 'rem':
            case '-remove':
            case '-rem':
                await this.removePrefix(sock, from, args, messageData);
                break;
            case 'only':
            case '-only':
                await this.setOnlyPrefix(sock, from, args, messageData);
                break;
            case 'me':
            case '-me':
                await this.setUserPreferences(sock, from, args, messageData);
                break;
            case 'normal':
            case 'padrao':
            case '-normal':
                await this.setNormalMode(sock, from);
                break;
            case 'clear':
            case '-clear':
                await this.clearPrefixes(sock, from, prefix, quoteThis);
                break;
            case '-list':
            case 'list':
                await this.listPrefixes(sock, from, prefix, quoteThis);
                break;
            case 'status':
            case '-status':
                await this.showStatus(sock, from, prefix, quoteThis);
                break;
            case 'noprefix':
            case 'semprefix':
                await this.setNoPrefixMode(sock, from, prefix, quoteThis);
                break;
            default:
                await this.showHelp(sock, from, prefix, quoteThis);
            }
        } catch (error) {
            console.error(chalk.red('❌ Erro no comando prefix:'), error);
            await sock.sendMessage(from, {
                text: '❌ Erro interno no sistema de prefixos.'
            }, { quoted: quoteThis });
        }
    },

    async setUserPreferences(sock, from, args, messageData) {
        const { quoteThis, prefix } = messageData;
        if (!args[1]) {
            return sock.sendMessage(from, {
                text: `👤 *PREFERÊNCIAS PESSOAIS*

📝 *Uso:*
${prefix}prefix me on  — ativar modo only-me
${prefix}prefix me off — desativar only-me
${prefix}prefix me $   — definir seu prefixo pessoal ($, #, >>, bot:)
${prefix}prefix me @bot / — prefixo pessoal só para um bot

💡 *Dica:* Em modo only-me, o bot só responde aos seus comandos com seu prefixo pessoal.
`
            }, { quoted: quoteThis });
        }

        // Recurso de prefixo pessoal não suportado (registrationDB removido)
        const action = args[1].toLowerCase();
        if (action === 'on' || action === 'off') {
            return sock.sendMessage(from, {
                text: `❌ Recurso *prefix me* indisponível

Este bot não possui suporte a prefixos pessoais por usuário.
Use os prefixos do grupo com ${prefix}prefix add para definir prefixos compartilhados.`
            }, { quoted: quoteThis });
        }

        // Suporte a alvo de bot: /prefix me @bot /
        const maybeTarget = args[1];
        const hasTargetBot = typeof maybeTarget === 'string' && maybeTarget.startsWith('@');
        if (hasTargetBot) {
            return sock.sendMessage(from, { text: '❌ Recurso de prefixo por bot (prefix me @bot) não suportado.' }, { quoted: quoteThis });
        }

        const userPrefix = args.slice(1).join(' ').trim();
        if (userPrefix.length > 5) {
            return sock.sendMessage(from, { text: '❌ Prefixo muito longo! Máximo 5 caracteres.' }, { quoted: quoteThis });
        }
        if (userPrefix.includes(' ') && userPrefix.trim() !== userPrefix) {
            return sock.sendMessage(from, { text: '❌ Prefixo não pode ter espaços no início/fim.' }, { quoted: quoteThis });
        }

        return sock.sendMessage(from, {
            text: `❌ Recurso de prefixo pessoal removido

Você tentou definir: ${userPrefix}

Use ${prefix}prefix add ${userPrefix} para definir um prefixo no grupo (se você for administrador).`
        }, { quoted: quoteThis });
    },

    async enableCustomPrefixes(sock, from, prefix, quoteThis) {
        await modernDb.updateGroupSetting(from, 'custom_prefixes_enabled', 1);

        await sock.sendMessage(from, {
            text: `✅ *PREFIXOS PERSONALIZADOS ATIVADOS*

├─ 🎯 Status: Ativo
├─ 🔧 Prefixos padrão: ${config.prefixes.join(', ')}
├─ ⚙️ Prefixos do grupo: Use ${prefix}prefix add
└─ 💡 Use ${prefix}prefix add >> para adicionar novos

📝 *Próximos passos:*
• ${prefix}prefix add >> - Adicionar prefixo
• ${prefix}prefix list - Ver todos os prefixos
• ${prefix}prefix clear - Limpar personalizados`
        }, { quoted: quoteThis });
    },

    async disableCustomPrefixes(sock, from, prefix, quoteThis) {
        await modernDb.updateGroupSetting(from, 'custom_prefixes_enabled', 0);

        await sock.sendMessage(from, {
            text: `❌ *PREFIXOS PERSONALIZADOS DESATIVADOS*

├─ 🎯 Status: Inativo
├─ 🔧 Usando apenas: ${config.prefixes.join(', ')}
├─ 💾 Prefixos salvos: Preservados
└─ 💡 Use ${prefix}prefix on para reativar

⚠️ *Nota:* Os prefixos personalizados foram preservados e voltarão quando reativados.`
        }, { quoted: quoteThis });
    },

    async addPrefix(sock, from, args, messageData) {
        const { quoteThis, prefix } = messageData;
        if (args.length < 2) {
            return sock.sendMessage(from, {
                text: `❌ *FORMATO INCORRETO*

📝 *Uso correto:*
${prefix}prefix add /
${prefix}prefix add $
${prefix}prefix add !

💡 *Exemplos:*
• ${prefix}prefix add / - Adiciona /
• ${prefix}prefix add $ - Substitui uso de / por $
• ${prefix}prefix add ! - Adiciona !

⚠️ *Limite:* Máximo 10 prefixos por grupo`
            }, { quoted: quoteThis });
        }

        const newPrefix = args.slice(1).join(' ').trim();

        // Validações
        if (newPrefix.length > 5) {
            return sock.sendMessage(from, {
                text: '❌ Prefixo muito longo! Máximo de 5 caracteres.'
            }, { quoted: quoteThis });
        }

        if (newPrefix.includes(' ') && newPrefix.trim() !== newPrefix) {
            return sock.sendMessage(from, {
                text: '❌ Prefixo não pode ter espaços no início ou fim.'
            }, { quoted: quoteThis });
        }

        // Obter prefixos atuais
        const settings = await modernDb.getGroupSettings(from);
        let currentPrefixes = [];

        if (settings.custom_prefixes) {
            currentPrefixes = JSON.parse(settings.custom_prefixes);
        }

        // Verificar se já existe
        if (currentPrefixes.includes(newPrefix)) {
            return sock.sendMessage(from, {
                text: `⚠️ *PREFIXO JÁ EXISTE*

├─ 📝 Prefixo: ${newPrefix}
├─ 📊 Status: Já está na lista
└─ 💡 Use ${prefix}prefix list para ver todos`
            }, { quoted: quoteThis });
        }

        // Permitir adicionar mesmo que seja padrão do sistema (modo filtro personalizado)

        // Verificar limite
        if (currentPrefixes.length >= 10) {
            return sock.sendMessage(from, {
                text: `❌ *LIMITE ATINGIDO*

├─ 📊 Atual: ${currentPrefixes.length}/10 prefixos
├─ 🚫 Ação: Limite máximo atingido
└─ 💡 Use ${prefix}prefix remove para liberar espaço`
            }, { quoted: quoteThis });
        }

        // Adicionar prefixo
        currentPrefixes.push(newPrefix);
        await modernDb.updateGroupSetting(from, 'custom_prefixes', JSON.stringify(currentPrefixes));

        await sock.sendMessage(from, {
            text: `✅ *PREFIXO ADICIONADO*

├─ 📝 Novo prefixo: ${newPrefix}
├─ 📊 Total: ${currentPrefixes.length}/10 prefixos
├─ 🎯 Status: Ativo imediatamente
└─ 💡 Teste: ${newPrefix}ping

📋 *Prefixos ativos:*
├─ 🔧 Sistema: ${config.prefixes.join(', ')}
└─ 🎨 Grupo: ${currentPrefixes.join(', ')}`
        }, { quoted: quoteThis });
    },

    async addAllPrefixes(sock, from, args, messageData) {
        const { quoteThis, prefix } = messageData;
        const tokens = args.slice(1).map(s => s.trim()).filter(Boolean);
        if (tokens.length === 0) {
            return sock.sendMessage(from, {
                text: `❌ *FORMATO INCORRETO*

📝 *Uso:*
${prefix}prefix addall / $ !

💡 Adiciona vários prefixos de uma vez`
            }, { quoted: quoteThis });
        }

        for (const t of tokens) {
            if (t.length > 5) return sock.sendMessage(from, { text: `❌ Prefixo muito longo: ${t}` }, { quoted: quoteThis });
            if (t.includes(' ') && t.trim() !== t) return sock.sendMessage(from, { text: `❌ Prefixo inválido (espaços): ${t}` }, { quoted: quoteThis });
        }

        const settings = await modernDb.getGroupSettings(from);
        let currentPrefixes = [];
        if (settings.custom_prefixes) {
            try { currentPrefixes = JSON.parse(settings.custom_prefixes) || []; } catch { currentPrefixes = []; }
        }

        const merged = Array.from(new Set([...currentPrefixes, ...tokens]));
        if (merged.length > 10) {
            return sock.sendMessage(from, { text: `❌ Limite excedido: ${merged.length}/10` }, { quoted: quoteThis });
        }
        await modernDb.updateGroupSetting(from, 'custom_prefixes', JSON.stringify(merged));
        await modernDb.updateGroupSetting(from, 'custom_prefixes_enabled', 1);

        await sock.sendMessage(from, {
            text: `✅ *PREFIXOS ADICIONADOS*

├─ Lista: ${tokens.join(', ')}
├─ Total: ${merged.length}/10
└─ Ativos: ${merged.join(', ')}`
        }, { quoted: quoteThis });
    },

    async removePrefix(sock, from, args, messageData) {
        const { quoteThis, prefix } = messageData;
        if (args.length < 2) {
            return sock.sendMessage(from, {
                text: `❌ *FORMATO INCORRETO*

📝 *Uso correto:*
${prefix}prefix remove >>
${prefix}prefix rem $

💡 Use ${prefix}prefix list para ver prefixos disponíveis`
            }, { quoted: quoteThis });
        }

        const toRemove = args.slice(1).map(s => s.trim()).filter(Boolean);
        if (toRemove.length === 0) {
            return sock.sendMessage(from, { text: `❌ Informe ao menos um prefixo para remover` }, { quoted: quoteThis });
        }

        // Obter prefixos atuais
        const settings = await modernDb.getGroupSettings(from);
        let currentPrefixes = [];

        if (settings.custom_prefixes) {
            currentPrefixes = JSON.parse(settings.custom_prefixes);
        }

        if (currentPrefixes.length === 0) {
            return sock.sendMessage(from, {
                text: `⚠️ *NENHUM PREFIXO PERSONALIZADO*

├─ 📊 Prefixos personalizados: 0
├─ 🔧 Apenas padrões: ${config.prefixes.join(', ')}
└─ 💡 Use ${prefix}prefix add para adicionar`
            }, { quoted: quoteThis });
        }

        // Verificar se existe
        const notFound = toRemove.filter(p => !currentPrefixes.includes(p));
        if (notFound.length === toRemove.length) {
            return sock.sendMessage(from, {
                text: `❌ *PREFIXO(S) NÃO ENCONTRADO(S)*

├─ 📝 Prefixos: ${toRemove.join(', ')}
├─ 📊 Status: Nenhum está na lista
└─ 💡 Use ${prefix}prefix list para ver disponíveis`
            }, { quoted: quoteThis });
        }

        // Remover prefixos
        currentPrefixes = currentPrefixes.filter(p => !toRemove.includes(p));
        await modernDb.updateGroupSetting(from, 'custom_prefixes', JSON.stringify(currentPrefixes));

        await sock.sendMessage(from, {
            text: `✅ *PREFIXO REMOVIDO*

├─ 📝 Removidos: ${toRemove.join(', ')}
├─ 📊 Restam: ${currentPrefixes.length}/10 prefixos
└─ 🎯 Status: Removido imediatamente

📋 *Prefixos ainda ativos:*
├─ 🔧 Sistema: ${config.prefixes.join(', ')}
└─ 🎨 Grupo: ${currentPrefixes.length > 0 ? currentPrefixes.join(', ') : 'Nenhum'}`
        }, { quoted: quoteThis });
    },

    async setOnlyPrefix(sock, from, args, messageData) {
        const { quoteThis, prefix } = messageData;
        if (args.length < 2) {
            return sock.sendMessage(from, {
                text: `❌ *FORMATO INCORRETO*

📝 *Uso correto:*
${prefix}prefix only /
${prefix}prefix only @bot /
${prefix}prefix only 8113797263393 /
${prefix}prefix only / (respondendo uma msg do bot)

💡 *Exemplo:*
${prefix}prefix only / - Usar APENAS /
${prefix}prefix only @bot / - Detecta o bot marcado
${prefix}prefix only 8113797263393 / - Usar PN (número) sem @s.whatsapp.net
${prefix}prefix only / - Respondendo uma mensagem do proprio bot

🤖 *Regra:*
Só aceita este bot real por menção PN/LID, número ou mensagem citada dele

🎯 *Resultado:* Apenas o prefixo escolhido funcionará no grupo`
            }, { quoted: quoteThis });
        }

        const targetResolution = resolveOnlyPrefixTarget(args, messageData, sock);
        const onlyPrefix = String(targetResolution.onlyPrefix || '');
        const targetBot = targetResolution.targetCandidate;
        const botSnapshot = buildBotIdentitySnapshot(sock, messageData);

        // Validações
        if (onlyPrefix.length > 5) {
            return sock.sendMessage(from, {
                text: '❌ Prefixo muito longo! Máximo de 5 caracteres.'
            }, { quoted: quoteThis });
        }

        // Verificar se é um prefixo válido (padrão ou personalizado)
        const settings = await modernDb.getGroupSettings(from);
        let customPrefixes = [];

        if (settings.custom_prefixes) {
            customPrefixes = JSON.parse(settings.custom_prefixes);
        }

        const allAvailablePrefixes = [...config.prefixes, ...customPrefixes];

        if (!allAvailablePrefixes.includes(onlyPrefix)) {
            return sock.sendMessage(from, {
                text: `❌ *PREFIXO NÃO DISPONÍVEL*

├─ 📝 Prefixo: ${onlyPrefix}
├─ 🚫 Status: Não está disponível
├─ 🔧 Disponíveis: ${allAvailablePrefixes.join(', ')}
└─ 💡 Adicione primeiro com ${prefix}prefix add se for personalizado

🎯 *Prefixos do sistema:* ${config.prefixes.join(', ')}`
            }, { quoted: quoteThis });
        }

        // Se alvo de bot foi informado, validar se é este bot
        if (targetBot) {
            const rawTarget = String(targetBot).toLowerCase();
            if (rawTarget.endsWith('@s.whatsapp.net')) {
                return sock.sendMessage(from, { text: '❌ Use @lid ou apenas o número (PN). Não use @s.whatsapp.net.' }, { quoted: quoteThis });
            }

            const isSameBot = isSameBotTarget(rawTarget, botSnapshot);
            if (!isSameBot) {
                return sock.sendMessage(from, { text: '❌ Apenas este bot verdadeiro pode receber /prefix only por menção, PN/LID ou mensagem citada.' }, { quoted: quoteThis });
            }
        }

        // Ativar modo "apenas um prefixo"
        await modernDb.updateGroupSetting(from, 'only_prefix_mode', 1);
        await modernDb.updateGroupSetting(from, 'only_prefix_value', onlyPrefix);

        await sock.sendMessage(from, {
            text: `✅ *MODO PREFIXO ÚNICO ATIVADO*

├─ 🎯 Prefixo ativo: ${onlyPrefix}
├─ 🤖 Bot alvo: ${targetBot ? 'Confirmado (este bot)' : 'Automatico'}
├─ 🚫 Outros prefixos: Desativados temporariamente
├─ 📊 Modo: Filtro único
└─ 💡 Apenas ${onlyPrefix} funcionará neste grupo

🔄 *Para voltar ao normal:*
├─ ${prefix}prefix normal - Reativar todos
└─ ${prefix}prefix off - Desativar personalizados

🧪 *Teste agora:* ${onlyPrefix}ping`
        }, { quoted: quoteThis });
    },

    async setNoPrefixMode(sock, from, prefix, quoteThis) {
        await modernDb.updateGroupSetting(from, 'no_prefix_enabled', 1);

        await sock.sendMessage(from, {
            text: `*MODO SEM PREFIXO ATIVADO*

- Agora o bot aceita comandos com ou sem prefixo
- Exemplo: ${prefix}daily ou daily
- Argumentos: ${prefix}play nome ou play nome
- Para voltar ao padrao: ${prefix}prefix padrao

*Teste agora:*
- ${prefix}ping
- ping`
        }, { quoted: quoteThis });
    },

    async setNormalMode(sock, from) {
        await modernDb.updateGroupSetting(from, 'no_prefix_enabled', 0);
        await modernDb.updateGroupSetting(from, 'only_prefix_mode', 0);
        await modernDb.updateGroupSetting(from, 'only_prefix_value', null);

        const settings = await modernDb.getGroupSettings(from);
        let customPrefixes = [];

        if (settings.custom_prefixes) {
            customPrefixes = JSON.parse(settings.custom_prefixes);
        }

        await sock.sendMessage(from, {
            text: `🔄 *MODO NORMAL RESTAURADO*

├─ 🎯 Prefixos sistema: ${config.prefixes.join(', ')}
├─ 🎨 Prefixos grupo: ${customPrefixes.length > 0 ? customPrefixes.join(', ') : 'Nenhum'}
├─ 📊 Sem prefixo: Desativado
└─ 💡 Voltou ao funcionamento padrão

✨ *Agora todos os prefixos funcionam normalmente!*`
        });
    },

    async clearPrefixes(sock, from, prefix, quoteThis) {
        await modernDb.updateGroupSetting(from, 'custom_prefixes', JSON.stringify([]));

        await sock.sendMessage(from, {
            text: `🗑️ *PREFIXOS PERSONALIZADOS LIMPOS*

├─ 🧹 Ação: Todos os prefixos personalizados removidos
├─ 🔧 Ativos: Apenas os padrões do Megumin
├─ 📊 Prefixos sistema: ${config.prefixes.join(', ')}
└─ 💡 Use ${prefix}prefix add para adicionar novos

✨ *Voltou ao padrão oficial do Megumin!*`
        }, { quoted: quoteThis });
    },

    async listPrefixes(sock, from, prefix, quoteThis) {
        const settings = await modernDb.getGroupSettings(from);
        let customPrefixes = [];

        if (settings.custom_prefixes) {
            customPrefixes = JSON.parse(settings.custom_prefixes);
        }

        const isEnabled = settings.custom_prefixes_enabled;
        const isNoPrefixMode = !!settings.no_prefix_enabled;
        const isOnlyMode = settings.only_prefix_mode;
        const onlyPrefixValue = settings.only_prefix_value;

        const response = `📋 *PREFIXOS DO GRUPO*

🔧 *PREFIXOS PADRÃO DO SISTEMA:*
├─ Disponíveis: ${config.prefixes.join(', ')}
├─ Status: ${isOnlyMode && !config.prefixes.includes(onlyPrefixValue) ? '❌ Desativados (modo filtro)' : '✅ Sempre ativos'}
└─ Exemplo: ${config.prefixes[0]}ping

🎨 *PREFIXOS PERSONALIZADOS DO GRUPO:*
├─ Status: ${isEnabled ? '✅ Ativo' : '❌ Inativo'}
├─ Quantidade: ${customPrefixes.length}/10
├─ Lista: ${customPrefixes.length > 0 ? customPrefixes.join(', ') : 'Nenhum'}
└─ Exemplo: ${customPrefixes.length > 0 ? `${customPrefixes[0]}ping` : 'Adicione primeiro'}

🎯 *MODO DE FUNCIONAMENTO:*
├─ Tipo: ${isOnlyMode ? `🔍 Filtro único (${onlyPrefixValue})` : '🌐 Normal (todos ativos)'}
├─ Sem prefixo: ${isNoPrefixMode ? '✅ Ativo' : '❌ Inativo'}
└─ Status: ${isOnlyMode ? '🎯 Modo filtro' : (isNoPrefixMode ? '💬 Modo sem prefixo' : '✅ Modo padrão')}

💡 *COMANDOS DISPONÍVEIS:*
├─ ${prefix}prefix on/off - Ativar/desativar personalizados
├─ ${prefix}prefix add >> - Adicionar prefixo
├─ ${prefix}prefix only # - Usar apenas um prefixo
├─ ${prefix}prefix noprefix - Ativar sem prefixo
├─ ${prefix}prefix padrao - Voltar ao padrão
├─ ${prefix}prefix me on/off - Modo pessoal only-me
└─ ${prefix}prefix me $ - Definir seu prefixo pessoal`;

        await sock.sendMessage(from, { text: response }, { quoted: quoteThis });
    },

    async showStatus(sock, from, prefix, quoteThis) {
        const settings = await modernDb.getGroupSettings(from);
        if (!settings) {
            return sock.sendMessage(from, { text: '❌ Use este comando em um grupo.' }, { quoted: quoteThis });
        }

        const data = {
            chat: from,
            custom_prefixes_enabled: !!settings.custom_prefixes_enabled,
            custom_prefixes: (() => { try { return JSON.parse(settings.custom_prefixes || '[]'); } catch { return []; } })(),
            no_prefix_enabled: !!settings.no_prefix_enabled,
            only_prefix_mode: !!settings.only_prefix_mode,
            only_prefix_value: settings.only_prefix_value || null,
        };

        const lines = [
            '🗄️ STATUS DE PREFIXOS (DB)',
            `├─ Grupo: ${data.chat}`,
            `├─ Custom habilitado: ${data.custom_prefixes_enabled ? 'Sim' : 'Não'}`,
            `├─ Custom lista: ${data.custom_prefixes.length > 0 ? data.custom_prefixes.join(', ') : 'Nenhum'}`,
            `├─ Sem prefixo: ${data.no_prefix_enabled ? 'Ativo' : 'Inativo'}`,
            `├─ Modo único: ${data.only_prefix_mode ? 'Ativo' : 'Inativo'}`,
            `└─ Prefixo único: ${data.only_prefix_value || '—'}`,
            '',
            `💡 ${prefix}prefix list para visualização amigável`
        ];

        await sock.sendMessage(from, { text: lines.join('\n') }, { quoted: quoteThis });
    },

    async showHelp(sock, from, prefix, quoteThis) {
        const help = `🎯 *SISTEMA DE PREFIXOS AVANÇADO*

✏️ *Comandos disponíveis (${prefix}prefix):*

🔧 *CONTROLE BÁSICO:*
├─ ${prefix}prefix on — ativar prefixos personalizados
├─ ${prefix}prefix off — desativar prefixos personalizados
└─ ${prefix}prefix list — ver todos os prefixos

➕ *GERENCIAR PREFIXOS:*
├─ ${prefix}prefix add / — adicionar prefixo
├─ ${prefix}prefix addall / $ ! — adicionar vários
├─ ${prefix}prefix remove / $ — remover prefixos
└─ ${prefix}prefix clear — limpar todos personalizados

🎯 *MODO DO GRUPO:*
├─ ${prefix}prefix only / — usar APENAS um prefixo
├─ ${prefix}prefix only @bot / — confirmar pelo bot marcado
├─ ${prefix}prefix only / — respondendo uma msg do bot
├─ ${prefix}prefix noprefix — aceitar comando sem prefixo
├─ ${prefix}prefix padrao — voltar ao modo padrão
└─ 💡 *Exemplo:* ${prefix}daily ou daily

🔧 *CARACTERÍSTICAS:*
├─ ✅ Modo normal: Todos os prefixos ativos
├─ ✅ Modo filtro: Apenas 1 prefixo ativo
├─ ✅ Modo sem prefixo: comando com ou sem /
├─ ✅ Prefixos até 5 caracteres
├─ ✅ Salvos no banco de dados
└─ ✅ Alternância fácil entre modos

🎯 *EXEMPLOS DE USO:*
1. ${prefix}prefix noprefix
2. daily
3. ${prefix}prefix padrao

🔧 *PREFIXOS PADRÃO HANAKO-KUN:*
└─ ${config.prefixes.join(', ')} (sempre disponíveis)`;

        await sock.sendMessage(from, { text: help }, { quoted: quoteThis });
    }
};
