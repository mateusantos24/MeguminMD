module.exports = {
    name: 'admin',
    description: '🛡️ Abre o menu completo de administracao do grupo',
    category: 'admin',
    aliases: ['adm', 'admins', 'administracao'],
    adminOnly: true,

    async execute(sock, messageData, args) {
        const menuCommand = require('../geral/menu');
        await menuCommand.execute(sock, messageData, ['admin', ...(Array.isArray(args) ? args : [])]);
    }
};
