const path = require('path');
const fs = require('fs');
const silentRequire = require('../../utils/silentRequire');

// Carregamento seguro do canvas
let createCanvas, loadImage;
try {
    const canvas = silentRequire('canvas');
    createCanvas = canvas.createCanvas;
    loadImage = canvas.loadImage;
} catch (err) {
    // Canvas indisponível, continuando com fallback
}

const config = require('../../../config/config');
// VIP removido nesta base — funcionalidades relacionadas foram descartadas

const NEWSLETTER_MENU_ALLOWED_CATEGORIES = new Set(['admin', 'ai', 'dados', 'download', 'sticker', 'supercell', 'youtube']);
const NEWSLETTER_MENU_ALLOWED_COMMANDS = new Set(['menu', 'admin', 'dados', 'download', 'sticker', 'youtube', 'brawlstars', 'supercell', 'newsletters', 'teste', 'testedit']);
const NEWSLETTER_MENU_BLOCKED_COMMANDS = new Set([
    'toimg', 'togif', 'stickermetadata',
    'checkdelete', 'checkdel', 'checkd',
    'contact', 'contatos', 'ctt', 'contacts', 'ctts',
    'myrg', 'minhareg', 'registro', 'myreg',
    'profile', 'perfil', 'me', 'stats',
    'atividade',
    'register', 'registrar', 'rg', 'cadastro', 'cadastrar',
    'brawlcode', 'bc', 'bsalvar', 'bsconta',
    'brawladd', 'bcgemini', 'removertag',
    'brawlnotificacao', 'bn'
]);
const DISCORD_MENU_ALLOWED_CATEGORIES = new Set(['ai', 'dados', 'download', 'games', 'supercell', 'utilitarios']);
const DEFAULT_MENU_IMAGE_PATH = path.resolve(__dirname, '../../../data/image/meguminmenu.jpeg');

const READ_MORE_SEPARATOR = '\u200E'.repeat(4000);

function getLocalMenuImageBuffer() {
    try {
        if (!fs.existsSync(DEFAULT_MENU_IMAGE_PATH)) return null;
        return fs.readFileSync(DEFAULT_MENU_IMAGE_PATH);
    } catch {
        return null;
    }
}

function buildMenuPayload(caption) {
    const localImage = getLocalMenuImageBuffer();
    if (localImage) {
        return {
            image: localImage,
            mimetype: 'image/jpeg',
            caption
        };
    }
    return { text: caption };
}

function getPreferredMenuPrefix() {
    const prefixes = Array.isArray(config?.prefixes)
        ? config.prefixes.map(prefix => String(prefix || '').trim()).filter(Boolean)
        : [];

    if (prefixes.includes('/')) return '/';
    return prefixes[0] || '!';
}

function normalizeCategory(category) {
    return String(category || '').trim().toLowerCase();
}

function sortByLocale(a, b) {
    return String(a || '').localeCompare(String(b || ''), 'pt-BR', { sensitivity: 'base' });
}

function chunkArray(items, size) {
    const chunks = [];
    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
    }
    return chunks;
}

function getCatalogDisplayNames(cmd, prefix) {
    if (!cmd || !cmd.name) return [];
    const names = [`${String(prefix || '').trim()}${String(cmd.name).trim()}`];
    if (Array.isArray(cmd.aliases)) {
        cmd.aliases.forEach((alias) => {
            const aliasText = String(alias || '').trim();
            if (aliasText) names.push(`${String(prefix || '').trim()}${aliasText}`);
        });
    }
    return names;
}

function getPrimaryCommandDisplayName(cmd, prefix) {
    if (!cmd) return `${String(prefix || '').trim()}comando`;
    if (cmd.name) return `${String(prefix || '').trim()}${String(cmd.name).trim()}`;
    if (Array.isArray(cmd.aliases) && cmd.aliases.length) {
        return `${String(prefix || '').trim()}${String(cmd.aliases[0]).trim()}`;
    }
    return `${String(prefix || '').trim()}comando`;
}

function commandSupportsPlatform(cmd, platform) {
    if (!cmd || !platform) return { allowed: false };
    if (typeof cmd.supportsPlatform === 'function') {
        try {
            return cmd.supportsPlatform(platform);
        } catch {
            return { allowed: true };
        }
    }

    if (Array.isArray(cmd.platforms)) {
        return { allowed: cmd.platforms.map(p => String(p || '').toLowerCase()).includes(String(platform).toLowerCase()) };
    }

    if (cmd.platform) {
        return { allowed: String(cmd.platform).toLowerCase() === String(platform).toLowerCase() };
    }

    return { allowed: true };
}

async function sendPrivateRegistrationPrelude(sock, messageData) {
    if (!sock || !messageData) return;
    if (messageData.isGroup) return;
    return;
}

function getCategoryAccessState(category, messageData, filterStatus = null) {
    const normalized = normalizeCategory(category);

    if (normalized === 'admin' && !messageData.isAdmin && !messageData.isOwner && !messageData.isSubOwner) {
        return {
            locked: true,
            label: '🔒 LOCKED',
            reason: 'Você não é admin deste grupo.'
        };
    }

    if (normalized === 'dono' && !messageData.isOwner && !messageData.isSubOwner) {
        return {
            locked: true,
            label: '🔒 LOCKED',
            reason: 'Você não é dono ou subdono.'
        };
    }

    if (filterStatus?.enabled && filterStatus?.blocked) {
        return {
            locked: true,
            label: '🔒 LOCKED',
            reason: 'Categoria trancada neste grupo pelo administrador.'
        };
    }

    return {
        locked: false,
        label: '',
        reason: ''
    };
}

function formatCommandCatalogLines(commands, prefix, perLine = 4) {
    const names = commands.flatMap((cmd) => getCatalogDisplayNames(cmd, prefix)).sort(sortByLocale);
    return chunkArray(names, perLine).map((group) => group.join(' • '));
}

function shouldUseReadMoreSeparator(platform) {
    return platform !== 'discord';
}

function isDiscordAllowedCategory(category) {
    return DISCORD_MENU_ALLOWED_CATEGORIES.has(String(category || '').toLowerCase());
}

function isDiscordMenuCommandAllowed(cmd) {
    if (!cmd) return false;
    if (!isDiscordAllowedCategory(cmd.category)) return false;
    return commandSupportsPlatform(cmd, 'discord').allowed;
}

function isNewsletterMenuCommandAllowed(cmd) {
    if (!cmd) return false;
    const category = String(cmd.category || '').toLowerCase();
    const name = String(cmd.name || '').toLowerCase();
    const aliases = Array.isArray(cmd.aliases) ? cmd.aliases.map(alias => String(alias || '').toLowerCase()) : [];
    if (NEWSLETTER_MENU_BLOCKED_COMMANDS.has(name)) return false;
    if (aliases.some(alias => NEWSLETTER_MENU_BLOCKED_COMMANDS.has(alias))) return false;
    return NEWSLETTER_MENU_ALLOWED_COMMANDS.has(name) || NEWSLETTER_MENU_ALLOWED_CATEGORIES.has(category);
}

function decodeEscapedUnicode(text) {
    let output = String(text || '');

    for (let i = 0; i < 2; i++) {
        output = output
            .replace(/\\u\{([0-9a-fA-F]+)\}/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
            .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
            .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    }

    return output;
}

function stripLeadingEmoji(text) {
    return String(text || '')
        .replace(/^[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\u200D]+\s*/u, '')
        .trim();
}

function fitFontSize(ctx, text, maxWidth, startSize = 24, minSize = 16, fontFamily = '"Segoe UI"') {
    let size = startSize;
    while (size > minSize) {
        ctx.font = `bold ${size}px ${fontFamily}`;
        if (ctx.measureText(String(text || '')).width <= maxWidth) {
            return size;
        }
        size -= 1;
    }
    return minSize;
}

// Funções de geração de arte VIP removidas — não suportado nesta base

module.exports = {
    name: 'menu',
    category: 'geral',
    description: 'Menu inteligente de comandos',
    aliases: ['help', 'ajuda', 'comandos', 'commands', 'geral'],
    get thumbnail() {
        return DEFAULT_MENU_IMAGE_PATH;
    },

    async execute(sock, messageData, args) {
        const { isAdmin, isOwner, isGroup, isNewsletter, from, quoteThis } = messageData;
        const CommandHandler = require('../../handlers/commandHandler');
        const isDiscord = messageData.platform === 'discord';

        if (!CommandHandler.commands || typeof CommandHandler.commands.values !== 'function') {
            const errorMsg =
                '🤖 SISTEMA DE COMANDOS\n' +
                '├─ Status: ❌ Indisponível\n' +
                '├─ Erro: Sistema não inicializado\n' +
                '└─ Ação: Tente novamente em instantes';

            await sock.sendMessage(from, { text: errorMsg }, { quoted: quoteThis });
            return;
        }

        const allCommands = Array.from(CommandHandler.commands.values()).filter((cmd, index, self) =>
            self.findIndex(c => c.name === cmd.name) === index
        );

        const baseVisibleCommands = allCommands.filter(cmd => {
            if (isNewsletter && !isNewsletterMenuCommandAllowed(cmd)) return false;
            if (isDiscord && !isDiscordMenuCommandAllowed(cmd)) return false;
            if (cmd.ownerOnly && !isOwner) return false;
            if (cmd.subOwnerOnly && !messageData.isSubOwner && !isOwner) return false;
            if (cmd.adminOnly && !isAdmin && !isOwner && !messageData.isSubOwner) return false;
            if (cmd.groupOnly && !isGroup) return false;
            return true;
        });

        // Remover lógica VIP — tratar todos os comandos visíveis igualmente
        const availableCommands = baseVisibleCommands;

        const requestedCategory = args[0]?.toLowerCase();
        const showAliases = (Array.isArray(args) ? args : []).some(a => /^-{1,2}aliases$/i.test(String(a || '')));

        if (['all', 'full', 'completo', 'catalogo', 'catálogo'].includes(requestedCategory)) {
            await sendPrivateRegistrationPrelude(sock, messageData);
            await this.showFullCommandMenu(sock, messageData, allCommands);
            return;
        }

        if (requestedCategory) {
            const sourceCommands = availableCommands;
            await this.showCategoryMenu(sock, messageData, sourceCommands, requestedCategory, showAliases);
            return;
        }

        await sendPrivateRegistrationPrelude(sock, messageData);
        await this.showCompactMenu(sock, messageData, availableCommands);
    },

    async showFullCommandMenu(sock, messageData, allCommands) {
        const { from, quoteThis, isGroup, isNewsletter, participantLid, platform } = messageData;
        const CommandHandler = require('../../handlers/commandHandler');
        const isDiscord = messageData.platform === 'discord';
        const defaultPrefix = getPreferredMenuPrefix();

        const sourceCommands = allCommands.filter((cmd) => {
            if (isNewsletter && !isNewsletterMenuCommandAllowed(cmd)) return false;
            if (isDiscord && !isDiscordMenuCommandAllowed(cmd)) return false;
            if (cmd.groupOnly && !isGroup) return false;
            return true;
        });

        const categories = new Map();
        sourceCommands.forEach((cmd) => {
            if (typeof cmd?.category !== 'string' || !cmd.category.trim()) return;
            const key = cmd.category;
            if (!categories.has(key)) categories.set(key, []);
            categories.get(key).push(cmd);
        });

        const orderedCategories = Array.from(categories.entries()).sort(([a], [b]) => sortByLocale(a, b));

        let menu = `🤖 ${config.botName.toUpperCase()}\n\n`;
        menu += '📚 CATÁLOGO COMPLETO\n';
        menu += '> Categorias e comandos em ordem alfabética.\n\n';

        if (shouldUseReadMoreSeparator(platform)) {
            menu += `${READ_MORE_SEPARATOR}\n`;
        }

        for (const [category, categoryCommands] of orderedCategories) {
            const normalizedCategory = normalizeCategory(category);
            let filterStatus = null;

            if (isGroup && !messageData.isOwner && !messageData.isAdmin && !messageData.isSubOwner) {
                filterStatus = await CommandHandler.getCategoryFilterStatus(category, from, participantLid);
            }

            const access = getCategoryAccessState(category, messageData, filterStatus);
            const emoji = this.getCategoryEmoji(category);
            const title = String(category || '').toUpperCase();

            menu += `${emoji} *${title}*`;
            if (access.locked) {
                menu += ` ${access.label}\n`;
                menu += `> ${access.reason}\n\n`;
                continue;
            }

            menu += ` (${categoryCommands.length})\n`;
            const sortedCommands = [...categoryCommands].sort((a, b) => sortByLocale(a?.name, b?.name));
            const commandLines = formatCommandCatalogLines(sortedCommands, defaultPrefix);

            commandLines.forEach((line) => {
                menu += `${line}\n`;
            });

            menu += '\n';
        }

        menu += `💡 Dica: use ${defaultPrefix}menu <categoria> -aliases\n`;
        menu += `🎯 Prefixos: ${config.prefixes.join(', ')}`;

        await sock.sendMessage(from, { text: menu.trim() }, { quoted: quoteThis });
    },

    async showCompactMenu(sock, messageData, availableCommands) {
        const { from, isOwner, isAdmin, isGroup, isNewsletter, quoteThis, participantLid } = messageData;

        const categories = {};
        availableCommands.forEach(cmd => {
            if (typeof cmd?.category !== 'string' || !cmd.category.trim()) return;
            const categoryName = cmd.category.toLowerCase();
            if (isNewsletter && !NEWSLETTER_MENU_ALLOWED_CATEGORIES.has(categoryName)) return;
            if (categoryName === 'admin' && !isAdmin && !isOwner && !messageData.isSubOwner) return;
            if (categoryName === 'dono' && !isOwner && !messageData.isSubOwner) return;
            if (!categories[cmd.category]) categories[cmd.category] = [];
            categories[cmd.category].push(cmd);
        });

        const categoryEntries = Object.entries(categories).sort(([a], [b]) => a.localeCompare(b));

        let menu = `🤖 ${config.botName.toUpperCase()}\n\n`;
        menu += '📋 MENU RÁPIDO\n';

        const CommandHandler = require('../../handlers/commandHandler');
        let filterEnabled = false;

        for (let index = 0; index < categoryEntries.length; index++) {
            const [category, commands] = categoryEntries[index];
            const isLast = index === categoryEntries.length - 1;
            const prefix = isLast ? '└─' : '├─';
            const emoji = this.getCategoryEmoji(category);
            const name = category.charAt(0).toUpperCase() + category.slice(1);

            let filterIndicator = '';
            // Verificar filtro apenas para membros comuns em grupos
            if (isGroup && !isOwner && !isAdmin && !messageData.isSubOwner) {
                const status = await CommandHandler.getCategoryFilterStatus(category, from, participantLid);
                if (status.enabled) {
                    // Se filtro está ativo: mostrar 🔒 (bloqueado) ou ✅ (liberado)
                    filterIndicator = status.blocked ? '🔒' : '✅';
                    filterEnabled = true;
                }
            }

            menu += `${prefix} ${emoji} ${name} (${commands.length})${filterIndicator}\n`;
        }

        const perms = [];
        if (isOwner) perms.push('👑 Dono');
        if (isAdmin) perms.push('🛡️ Admin');
        perms.push(isNewsletter ? '📰 Canal' : isGroup ? '👥 Grupo' : '💬 Privado');

        menu += '\n📊 SISTEMA\n';
        menu += '├─ 🟢 Status: Online\n';
        menu += `├─ 📈 Comandos: ${availableCommands.length}\n`;

        if (filterEnabled && isGroup && !isOwner && !isAdmin) {
            menu += '├─ ⚠️ Filtro está ativo\n';
        }

        if (isOwner) {
            menu += '├─ 👑 You are Owner Devs\n';
        }
        menu += `├─ 🔑 Permissões: ${perms.join(', ')}\n`;
        menu += `├─ 💡 Dica: use ${getPreferredMenuPrefix()}menu <categoria> -aliases\n`;
        menu += `└─ 🎯 Prefixos: ${config.prefixes.join(', ')}`;

        await sock.sendMessage(from, buildMenuPayload(menu), { quoted: quoteThis });
    },

    // Funções VIP removidas — esta base não suporta painel VIP

    async showCategoryMenu(sock, messageData, availableCommands, requestedCategory, showAliases) {
        const { from, quoteThis, isOwner, isAdmin, isGroup, participantLid } = messageData;
        const defaultPrefix = getPreferredMenuPrefix();

        const cleaned = availableCommands.filter(
            c => typeof c?.category === 'string' && c.category.trim().length > 0
        );

        const CommandHandler = require('../../handlers/commandHandler');
        const want = (requestedCategory || '').toLowerCase();
        const categoryCommands = cleaned.filter(cmd => {
            const cat = String(cmd.category || '').toLowerCase();
            return cat === want || cat.includes(want);
        });

        if (categoryCommands.length === 0) {
            const available = [...new Set(cleaned.map(cmd => cmd.category))];
            const errorMsg =
                '❌ CATEGORIA NÃO ENCONTRADA\n\n' +
                '📋 Categorias Disponíveis:\n' +
                available.map(cat => ` • ${cat}`).join('\n') +
                '\n\n💡 Exemplo: ' + defaultPrefix + 'menu admin';

            await sock.sendMessage(from, { text: errorMsg }, { quoted: quoteThis });
            return;
        }

        const category = categoryCommands[0].category;

        if (category.toLowerCase() === 'admin' && !isAdmin && !isOwner && !messageData.isSubOwner) {
            await sock.sendMessage(from, { text: '🔒 Categoria restrita.' }, { quoted: quoteThis });
            return;
        }

        if (category.toLowerCase() === 'dono' && !isOwner && !messageData.isSubOwner) {
            await sock.sendMessage(from, { text: '🔒 Categoria restrita.' }, { quoted: quoteThis });
            return;
        }

        if (isGroup && !isOwner && !isAdmin) {
            const status = await CommandHandler.getCategoryFilterStatus(category, from, participantLid);
            if (status.enabled && status.blocked) {
                const errorMsg =
                    '🔒 CATEGORIA RESTRITA\n\n' +
                    `A categoria *${category.toUpperCase()}* está trancada neste grupo pelo administrador.\n\n` +
                    '💡 Use o menu principal para ver as categorias disponíveis.';

                await sock.sendMessage(from, { text: errorMsg }, { quoted: quoteThis });
                return;
            }

            const filteredResults = await Promise.all(
                categoryCommands.map(async cmd => {
                    const isAllowed = await CommandHandler.checkCommandFilter(cmd, messageData);
                    return isAllowed ? cmd : null;
                })
            );
            categoryCommands.length = 0;
            categoryCommands.push(...filteredResults.filter(Boolean));
        }

        const emoji = this.getCategoryEmoji(category);
        const name = category.charAt(0).toUpperCase() + category.slice(1);

        // VIP não é suportado; tratar como categoria normal

        let menu = `${emoji} *${name.toUpperCase()}*\n\n`;
        categoryCommands.sort((a, b) => a.name.localeCompare(b.name));

        categoryCommands.forEach((cmd, index) => {
            const number = index + 1;
            const desc = this.formatCategoryDescription(cmd);
            const aliases = Array.isArray(cmd.aliases) && cmd.aliases.length ? `${cmd.aliases.join(', ')}` : null;

            menu += `${number} - \`${getPrimaryCommandDisplayName(cmd, defaultPrefix)}\`\n`;
            menu += `> ${desc}\n`;
            if (showAliases && aliases) {
                menu += `> *Aliases:* \`${aliases}\`\n`;
            }
            menu += '\n';
        });

        menu += showAliases ? `💡 Voltar: ${defaultPrefix}menu` : `💡 Dica: use ${defaultPrefix}${category} -aliases\n💡 Voltar: ${defaultPrefix}menu`;
        await sock.sendMessage(from, { text: menu }, { quoted: quoteThis });
    },

    getCategoryEmoji(category) {
        const emojis = {
            events: '\uD83C\uDF89', evento: '\uD83C\uDF89', eventos: '\uD83C\uDF89',
            admin: '👑', administracao: '👑', adm: '👑',
            owner: '👨‍💻', dono: '👨‍💻', owneronly: '🛠️', staff: '👑',
            ai: '🤖', ia: '🤖', artificial: '🤖',
            dados: '📊', data: '📊', database: '📊', info: '📊',
            diversao: '🎮', fun: '🎮', jogos: '🎮', game: '🎮', games: '🎮',
            casamentos: '💍', casamento: '💍', namoro: '💍',
            download: '📥', downloads: '📥', dl: '📥', baixar: '📥',
            geral: '📋', general: '📋', basic: '📋', default: '📋',
            sticker: '🧩', fig: '🧩', figurinha: '🧩',
            supercell: '🏆', clash: '🏆', brawl: '🏆', royale: '🏆',
            utils: '🔧', utilitarios: '🔧', tools: '🔧',
            economy: '💰', economia: '💰', money: '💰', coins: '💰',
            image: '🖼️', imagem: '🖼️', img: '🖼️', foto: '🖼️',
            midia: '📁', media: '📁', arquivo: '📁', arquivos: '📁',
            youtube: '🎬', video: '🎬', yt: '🎬',
            vip: '⭐', vips: '⭐', exclusivo: '⭐', exclusivos: '⭐',
            estatistica: '📊', estatisticas: '📊', stats: '📊'
        };

        return emojis[category.toLowerCase()] || '📁';
    },

    formatCategoryDescription(cmd) {
        const category = String(cmd?.category || '').toLowerCase();
        const rawDescription = decodeEscapedUnicode(cmd?.description || 'Sem descrição');
        const categoriesWithCustomIcons = new Set([
            'dono',
            'download',
            'economy',
            'events',
            'sticker',
            'supercell',
            'utilitarios',
            'youtube'
        ]);

        if (!categoriesWithCustomIcons.has(category)) {
            return rawDescription;
        }

        const cleanDescription = stripLeadingEmoji(rawDescription);
        const emoji = this.getCommandEmoji(cmd);
        return `${emoji} ${cleanDescription}`;
    },

    getCommandEmoji(cmd) {
        const name = String(cmd?.name || '').toLowerCase();
        const category = String(cmd?.category || '').toLowerCase();

        const exactMap = {
            dono: '👑',
            cache: '🗂️',
            eval: '💻',
            pm2: '⚙️',
            reviverqr: '📱',
            session: '📲',

            emojimix: '😹',
            figurinha: '🖼️',
            fpack: '📦',
            lotti: '🎞️',
            nobg: '✂️',
            qc: '💬',
            renomear: '🏷️',
            sticker: '🧩',
            stickerprem: '💎',
            stickermetadata: '📋',
            togif: '🎥',
            toimg: '🖼️',

            afk: '💤',
            afklist: '📋',
            aka: '🪪',
            aniversario: '🎂',
            atividade: '📈',
            checklid: '🆔',
            checkurl: '🔗',
            convert: '🔄',
            cooldowns: '⏳',
            criarqr: '📱',
            data: '🕒',
            gerarlink: '🌐',
            gerarlinkv2: '🔗',
            gpdata: '👥',
            meutickets: '🎫',
            ocr: '📝',
            ping: '🏓',
            ptv: '🎥',
            readqr: '📷',
            relatorio: '📨',
            revelar: '👁️',
            utilitarios: '🔧',
            wame: '📲',
        };

        if (exactMap[name]) {
            return exactMap[name];
        }

        if (category === 'dono') {
            if (/^add|^criar/.test(name)) return '➕';
            if (/^set/.test(name)) return '⚙️';
            if (/remove|delete|deletar|unban/.test(name)) return '🗑️';
            if (/ticket/.test(name)) return '🎫';
            if (/gartic/.test(name)) return '🖍️';
            if (/reload|hotreload/.test(name)) return '♻️';
            return '👑';
        }

        if (category === 'download') {
            return '📥';
        }

        if (category === 'economy') {
            return '💰';
        }

        if (category === 'events') {
            return '🎉';
        }

        if (category === 'sticker') {
            return '🧩';
        }

        if (category === 'supercell') {
            return '🏆';
        }

        if (category === 'utilitarios') {
            return '🔧';
        }

        if (category === 'youtube') {
            return '▶️';
        }

        return this.getCategoryEmoji(category);
    },

    buildLockedMenu(from = null, messageData = null) {
        const CommandHandler = require('../../handlers/commandHandler');
        const commands = Array.from(CommandHandler.commands.values()).filter((cmd, index, self) =>
            self.findIndex(c => c.name === cmd.name) === index
        );

        // Agrupar por categoria
        const categories = {};
        commands.forEach(cmd => {
            if (typeof cmd?.category !== 'string' || !cmd.category.trim()) return;
            const categoryName = cmd.category.toLowerCase();
            
            // Filtro admin/dono
            if (categoryName === 'admin' || categoryName === 'dono') return;
            
            if (!categories[cmd.category]) categories[cmd.category] = [];
            categories[cmd.category].push(cmd);
        });

        const categoryEntries = Object.entries(categories).sort(([a], [b]) => a.localeCompare(b));

        let menu = `🤖 ${config.botName.toUpperCase()}\n\n`;
        menu += '📋 MENU RÁPIDO\n';

        for (let index = 0; index < categoryEntries.length; index++) {
            const [category, categoryCommands] = categoryEntries[index];
            const isLast = index === categoryEntries.length - 1;
            const prefix = isLast ? '└─' : '├─';
            const emoji = this.getCategoryEmoji(category);
            const name = category.charAt(0).toUpperCase() + category.slice(1);

            menu += `${prefix} ${emoji} ${name} (${categoryCommands.length})🔒\n`;
        }

        const perms = ['👥 Grupo'];

        menu += '\n📊 SISTEMA\n';
        menu += '├─ 🟢 Status: Online\n';
        menu += `├─ 📈 Comandos: ${commands.length}\n`;
        menu += '├─ ⚠️ Filtro está ativo\n';
        menu += `├─ 🔑 Permissões: ${perms.join(', ')}\n`;
        menu += `├─ 💡 Dica: use ${getPreferredMenuPrefix()}menu <categoria> -aliases\n`;
        menu += `└─ 🎯 Prefixos: ${config.prefixes.join(', ')}`;

        return menu;
    }
};
