// lib/commands/midias/renomear.js

const StickerDB = require('../../database/stickerDB');
const config = require('../../../config/config');

module.exports = {
    name: 'renomear',
    description: '\u{1F9E9} Personaliza pack e publisher dos seus stickers permanentemente',
    category: 'sticker',
    aliases: ['rename', 'renomea', 'renomearsticker'],

    async execute(sock, messageData) {
        const { from, quoteThis, participantLid, prefix, body } = messageData;

        try {
            // Cria args caso não exista
            const input = body?.trim()?.split(/\s+/).slice(1).join(' ') || '';

            // Sem args → tutorial
            if (!input) {
                const cfg = await StickerDB.getSticker(participantLid);
                const status = cfg ? cfg.invisible === 1 ? '🚫 *Invisível* (pack/publisher ocultos)' : `📦 Pack: ${cfg.packName || '(padrão)'}\n👤 Publisher: ${cfg.publisher || '(padrão)'}` : 'Você ainda não personalizou.';
                await sock.sendMessage(from, {
                    text: `📋 *Tutorial de Renomear Stickers*\n\nStatus atual:\n${status}\n\n💡 Para usar:\n` +
                          `• ${prefix}renomear Pack Publisher → Define pack e publisher\n` +
                          `• ${prefix}renomear -clear → Reseta para padrão do bot\n` +
                          `• ${prefix}renomear -invisivel → Oculta pack e publisher`
                }, { quoted: quoteThis });
                return;
            }

            // -clear
            if (input.toLowerCase() === '-clear') {
                await StickerDB.clearSticker(participantLid);
                await sock.sendMessage(from, {
                    text: `✅ Configuração de stickers resetada.\nSeus próximos stickers usarão o padrão do bot:\n\n` +
                          `📦 Pack: ${config.stickerConfig?.pack || 'Rei'}\n` +
                          `👤 Author: ${config.stickerConfig?.author || 'Ayanami'}`
                }, { quoted: quoteThis });
                return;
            }

            // -invisivel
            if (input.toLowerCase() === '-invisivel') {
                await StickerDB.setSticker(participantLid, { packName: null, publisher: null, invisible: 1 });
                await sock.sendMessage(from, {
                    text: `✅ Stickers configurados como *invisíveis*.\n\nPack Name e Publisher ficarão ocultos.`
                }, { quoted: quoteThis });
                return;
            }

            let packName, publisher;

            if (input.includes('/')) {
                // Formato: "Rei / Ayanami" → pack e publisher separados
                const parts = input.split('/').map(s => s.trim()).filter(Boolean);
                packName = parts[0].slice(0, 64);
                publisher = (parts[1] || null)?.slice(0, 64) || null;
            } else {
                // Formato: "Rei Ayanami" → só pack, publisher fica null (usa padrão do bot)
                packName = input.slice(0, 64);
                publisher = null;
            }

            await StickerDB.setSticker(participantLid, { packName, publisher, invisible: 0 });

            await sock.sendMessage(from, {
                text: `✅ *Configuração salva!*\n\nSeus próximos stickers terão:\n` +
                      `📦 Pack: ${packName}\n` +
                      `${publisher ? `👤 Publisher: ${publisher}\n` : ''}` +
                      `\n💡 Use ${prefix}renomear -clear para resetar ou ${prefix}renomear -invisivel para ocultar.`
            }, { quoted: quoteThis });

        } catch (err) {
            console.error('❌ Erro no comando renomear:', err);
            await sock.sendMessage(from, { text: 'Ocorreu um erro ao salvar sua configuração.' }, { quoted: quoteThis });
        }
    }
};
