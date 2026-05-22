module.exports = {
    name: 'utilitarios',
    description: '\u{1F527} Abre o menu de ferramentas e utilitarios do bot',
    category: 'utilitarios',
    aliases: ['util', 'utils'],

    async execute(sock, messageData, args) {
        const menuCommand = require('../geral/menu');
        await menuCommand.execute(sock, messageData, ['utilitarios', ...(Array.isArray(args) ? args : [])]);
    }
};
