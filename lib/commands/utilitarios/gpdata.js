// lib/commands/gpdata.js

const chalk = require('chalk');
const SimpleCache = require('../../utils/simpleCache');

module.exports = {
    name: 'gpdata',
    description: '\u{1F527} Obter informacoes detalhadas de grupos do WhatsApp',
    category: 'utilitarios',
    aliases: ['groupdata', 'gd', 'dadosgrupo', 'allid'],

    async execute(sock, messageData, args) {
        const { from, isGroup, prefix, quoteThis } = messageData;

        try {
            // Verificar parâmetros
            const option = args[0]?.toLowerCase();

            // 🔹 OPÇÃO: --allid (Listar todos os grupos)
            if (option === '--allid') {
                await this.showAllGroups(sock, from, prefix, quoteThis);
                return;
            }

            // 🔹 OPÇÃO: <id do grupo> (Mostrar dados de um grupo específico)
            if (option && (option.endsWith('@g.us') || /^\d{10,}$/.test(option))) {
                const groupJid = option.endsWith('@g.us') ? option : `${option}@g.us`;
                await this.showGroupData(sock, from, groupJid, quoteThis);
                return;
            }

            // 🔹 OPÇÃO PADRÃO: Detectar automaticamente (grupo atual ou mostrar ajuda)
            if (isGroup) {
                await this.showGroupData(sock, from, from, quoteThis);
                return;
            } else {
                // Se não for grupo e não passou parâmetros, mostrar ajuda
                await this.showHelp(sock, from, prefix, quoteThis);
                return;
            }

        } catch (error) {
            console.error(chalk.red('❌ Erro no comando gpdata:'), error);
            await sock.sendMessage(from, {
                text: '❌ Erro ao obter informações do grupo.'
            }, { quoted: quoteThis });
        }
    },

    /**
     * 📋 MOSTRAR DADOS DE UM GRUPO ESPECÍFICO
     */
    async showGroupData(sock, chatJid, groupJid, quoteThis) {
        try {
            // Buscar informações do cache usando SimpleCache
            const cacheInfo = SimpleCache.getInfo(groupJid);
            // console.log('Cache Info:', JSON.stringify(cacheInfo, null, 2));
            if (cacheInfo.error) {
                await sock.sendMessage(chatJid, {
                    text: `❌ *ERRO*\n\n${cacheInfo.message}`
                }, { quoted: quoteThis });
                return;
            }

            if (!cacheInfo.cached) {
                // Se não está em cache, forçar busca
                const metadata = await SimpleCache.getGroupMetadata(sock, groupJid, false);
                if (!metadata || !metadata.id) {
                    await sock.sendMessage(chatJid, {
                        text: `⚠️ *GRUPO NÃO ENCONTRADO*\n\nO grupo ${groupJid} não foi encontrado ou o bot não tem acesso.`
                    }, { quoted: quoteThis });
                    return;
                }
                // Buscar novamente após refresh
                return await this.showGroupData(sock, chatJid, groupJid);
            }

            // Formatar informações do grupo
            const info = cacheInfo;
            const isCommunity = info.cacheType === 'community';
            const isNewsletter = info.cacheType === 'newsletter';

            if (isNewsletter) {
                const message = `📢 *INFORMAÇÕES DO NEWSLETTER*\n\n` +
                    `├─ 📛 Nome: ${info.name || 'N/A'}\n` +
                    `├─ 📝 Descrição: ${info.description || 'N/A'}\n` +
                    `├─ 👥 Inscritos: ${info.subscribersCount || 0}\n` +
                    `├─ 🎭 Seu Papel: ${info.viewerRole || 'SUBSCRIBER'}\n` +
                    `├─ ✍️ Pode Enviar: ${info.canSend ? '✅ Sim' : '❌ Não'}\n` +
                    `├─ 📊 Estado: ${info.state || 'ACTIVE'}\n` +
                    `├─ ✅ Verificado: ${info.verification === 'VERIFIED' ? '✅ Sim' : '❌ Não'}\n` +
                    `└─ 🆔 JID: ${info.jid}\n\n` +
                    `🕐 *CACHE INFO:*\n` +
                    `├─ ⏰ Idade do Cache: ${info.cacheAge}\n` +
                    `├─ 🔄 Status: ${info.cacheExpired ? '🔴 Expirado' : '🟢 Válido'}\n` +
                    `└─ ⏳ Expira em: ${info.timeUntilExpiry}`;

                await sock.sendMessage(chatJid, { text: message }, { quoted: quoteThis });
                return;
            }

            // Grupo normal ou comunidade
            const typeEmoji = isCommunity ? '🏘️' : '👥';
            const typeLabel = isCommunity ? 'COMUNIDADE' : 'GRUPO';

            let message = `${typeEmoji} *INFORMAÇÕES DO ${typeLabel}*\n\n`;
            message += `├─ 📛 Nome: ${info.subject || 'N/A'}\n`;
            message += `├─ 📝 Descrição: ${info.description?.substring(0, 50) || 'Sem descrição'}${info.description?.length > 50 ? '...' : ''}\n`;
            message += `├─ 👥 Membros: ${info.size || 0}\n`;
            message += `├─ 👑 Admins: ${info.adminsCount || 0}\n`;
            message += `├─ 🏆 Donos: ${info.ownersCount || 0}\n`;
            message += `└─ 📅 Criado em: ${info.creation || 'N/A'}\n`;

            // ❌ REMOVIDO: Número do dono (privacidade)
            // message += `├─ 👤 Dono: ${info.owner?.split('@')[0] || 'N/A'}\n`;

            // Configurações do grupo
            message += `\n⚙️ *CONFIGURAÇÕES:*\n`;
            message += `├─ 🔒 Restrito: ${info.restrict ? '✅ Sim' : '❌ Não'}\n`;
            message += `├─ 📢 Só Admins: ${info.announce ? '✅ Sim' : '❌ Não'}\n`;
            message += `├─ 🚪 Aprovação: ${info.joinApprovalMode ? '✅ Sim' : '❌ Não'}\n`;
            message += `├─ ➕ Modo Adicionar: ${info.memberAddMode ? '✅ Sim' : '❌ Não'}\n`;

            if (isCommunity) {
                message += `├─ 🏘️ É Comunidade: ✅ Sim\n`;
                message += `├─ 📣 Anúncios: ${info.isCommunityAnnounce ? '✅ Sim' : '❌ Não'}\n`;
                if (info.linkedParent) {
                    message += `└─ 🔗 Pai: ${info.linkedParent}\n`;
                } else {
                    message += `└─ 🔗 Pai: Nenhum\n`;
                }
            } else {
                message += `└─ 🏘️ É Comunidade: ❌ Não\n`;
            }

            // Informações de Cache
            message += `\n💾 *INFORMAÇÕES DE CACHE:*\n`;
            message += `├─ ⏰ Idade: ${info.cacheAge}\n`;
            message += `├─ 🔄 Status: ${info.cacheExpired ? '🔴 Expirado' : '🟢 Válido'}\n`;
            message += `├─ ⏳ Expira em: ${info.timeUntilExpiry}\n`;
            message += `├─ 🗄️ Tempo Cache: ${info.cacheTime}\n`;
            message += `└─ 📅 Atualizado: ${info.timestamp}\n`;

            // JID do grupo
            message += `\n🆔 *ID DO GRUPO:*\n`;
            message += `└─ ${info.jid}`;

            // ❌ REMOVIDO: Lista de admins (privacidade)
            // Números de telefone NÃO serão exibidos para proteger a privacidade dos membros

            await sock.sendMessage(chatJid, { text: message }, { quoted: quoteThis });
        } catch (error) {
            console.error(chalk.red('❌ Erro ao buscar dados do grupo:'), error);
            await sock.sendMessage(chatJid, {
                text: `❌ *ERRO*\n\nNão foi possível obter informações do grupo.\n\nMotivo: ${error.message}`
            }, { quoted: quoteThis });
        }
    },

    /**
     * 📋 MOSTRAR TODOS OS GRUPOS
     */
    async showAllGroups(sock, chatJid, prefix, quoteThis) {
        try {
            await sock.sendMessage(chatJid, {
                text: '🔄 *BUSCANDO GRUPOS...*\n\nAguarde, isso pode levar alguns segundos...'
            }, { quoted: quoteThis });

            // Usar método do Baileys para buscar todos os grupos
            const groups = await sock.groupFetchAllParticipating();

            if (!groups || Object.keys(groups).length === 0) {
                await sock.sendMessage(chatJid, {
                    text: '⚠️ *NENHUM GRUPO ENCONTRADO*\n\nO bot não está em nenhum grupo.'
                }, { quoted: quoteThis });
                return;
            }

            // Converter para array e ordenar por nome
            const groupArray = Object.values(groups).sort((a, b) =>
                (a.subject || '').localeCompare(b.subject || '')
            );

            let message = `👥 *LISTA DE GRUPOS*\n\n`;
            message += `Total: ${groupArray.length} grupos\n`;
            message += `━━━━━━━━━━━━━━━━━━━\n\n`;

            groupArray.forEach((group, index) => {
                const groupNum = index + 1;
                const groupName = group.subject || 'Sem Nome';
                const groupId = group.id;
                const memberCount = group.participants?.length || 0;
                const isAnnounce = group.announce ? '📢' : '💬';
                const isCommunity = group.isCommunity ? '🏘️' : '';

                // ❌ REMOVIDO: Número do dono (privacidade)
                // Não mostrar número de telefone do dono

                message += `${groupNum}. ${isAnnounce}${isCommunity} *${groupName}*\n`;
                message += `   ├─ 🆔 ID: ${groupId}\n`;
                message += `   └─ 👥 Membros: ${memberCount}\n\n`;
            });

            message += `━━━━━━━━━━━━━━━━━━━\n`;
            message += `💡 *Dica:* Use o comando com o ID para ver detalhes\n`;
            message += `Exemplo: ${prefix}gpdata <id>`;

            // Dividir mensagem se for muito grande (WhatsApp tem limite)
            if (message.length > 4000) {
                // Enviar em partes
                const chunks = this.splitMessage(message, 4000);
                for (const chunk of chunks) {
                    await sock.sendMessage(chatJid, { text: chunk });
                    await new Promise(resolve => setTimeout(resolve, 1000)); // Delay de 1s entre mensagens
                }
            } else {
                await sock.sendMessage(chatJid, { text: message }, { quoted: quoteThis });
            }

        } catch (error) {
            console.error(chalk.red('❌ Erro ao listar grupos:'), error);
            await sock.sendMessage(chatJid, {
                text: `❌ *ERRO*\n\nNão foi possível listar os grupos.\n\nMotivo: ${error.message}`
            }, { quoted: quoteThis });
        }
    },

    /**
     * 📋 MOSTRAR AJUDA
     */
    async showHelp(sock, chatJid, prefix, quoteThis) {
        const help = `📊 *COMANDO GPDATA*\n\n` +
            `Obtenha informações detalhadas sobre grupos do WhatsApp.\n\n` +
            `📝 *USO:*\n\n` +
            `1️⃣ *Detecção Automática*\n` +
            `   ├─ ${prefix}gpdata\n` +
            `   └─ Mostra dados do grupo atual\n\n` +
            `2️⃣ *Grupo Específico*\n` +
            `   ├─ ${prefix}gpdata <id>\n` +
            `   └─ Mostra dados de um grupo específico\n\n` +
            `3️⃣ *Listar Todos*\n` +
            `   ├─ ${prefix}gpdata --allid\n` +
            `   └─ Lista todos os grupos com IDs\n\n` +
            `💡 *EXEMPLOS:*\n` +
            `├─ ${prefix}gpdata (no grupo)\n` +
            `├─ ${prefix}gpdata 120363...@g.us\n` +
            `└─ ${prefix}gpdata --allid\n\n` +
            `📋 *INFORMAÇÕES EXIBIDAS:*\n` +
            `├─ Nome e descrição\n` +
            `├─ Contagem de membros e admins\n` +
            `├─ Configurações do grupo\n` +
            `├─ Informações de cache\n` +
            `└─ JID completo\n\n` +
            `🔒 *PRIVACIDADE:*\n` +
            `└─ Números de telefone não são exibidos\n\n` +
            `⚡ *ALIASES:*\n` +
            `└─ groupdata, gd, dadosgrupo`;

        await sock.sendMessage(chatJid, { text: help }, { quoted: quoteThis });
    },

    /**
     * 🔧 HELPER: Dividir mensagem longa em partes
     */
    splitMessage(text, maxLength) {
        const chunks = [];
        let currentChunk = '';
        const lines = text.split('\n');

        for (const line of lines) {
            if ((currentChunk + line + '\n').length > maxLength) {
                chunks.push(currentChunk);
                currentChunk = line + '\n';
            } else {
                currentChunk += line + '\n';
            }
        }

        if (currentChunk) {
            chunks.push(currentChunk);
        }

        return chunks;
    }
};
