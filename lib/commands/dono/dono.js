module.exports = {
    name: 'dono',
    description: '\u{1F451} Abre o menu completo de comandos do dono',
    category: 'dono',
    aliases: ['owner', 'fundador', 'subdono', 'subowner'],
    ownerOnly: false,
    subOwnerOnly: true,

    async execute(sock, messageData, args) {
        const menuCommand = require('../geral/menu');
        await menuCommand.execute(sock, messageData, ['dono', ...(Array.isArray(args) ? args : [])]);
    }
};
