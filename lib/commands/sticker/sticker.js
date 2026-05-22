module.exports = {
    name: 'sticker',
    description: '\u{1F9E9} Abre o menu de stickers, Lottie e utilitarios',
    category: 'sticker',
    aliases: ['midia', 'media', 'medias', 'mediaoptions', 'mediaoption'],

    async execute(sock, messageData, args) {
        const menuCommand = require('../geral/menu');
        await menuCommand.execute(sock, messageData, ['sticker', ...(Array.isArray(args) ? args : [])]);
    }
};
