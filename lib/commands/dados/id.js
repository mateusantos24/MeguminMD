module.exports = {
    name: 'id',
    description: '\u{1F194} Mostra o ID do grupo, usuario ou chat atual',
    category: 'dados',
    aliases: ['groupid', 'chatid', 'grupoID'],

    async execute(sock, messageData) {
        const { from, quoteThis, platform, discordContext } = messageData;

        try {
            console.log(`Comando ID usado no grupo: ${from}`);
            await sock.sendMessage(from, {
                text: `ID do Grupo: ${from}`
            }, { quoted: quoteThis });
        } catch (error) {
            console.error('Erro no comando ID:', error);
        }
    }
};
