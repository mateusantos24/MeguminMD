module.exports = {
    name: 'dados',
    description: '\u{1F4CA} Abre o menu de consultas, pesquisas e informacoes',
    category: 'dados',
    aliases: ['dadosuser'],

    async execute(sock, messageData, args) {
        const menuCommand = require('../geral/menu');
        await menuCommand.execute(sock, messageData, ['dados', ...(Array.isArray(args) ? args : [])]);
    }
};
