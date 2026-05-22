const MentionHandler = require('../../utils/mentionHandler');

module.exports = {
    name: 'checktag',
    description: '🏷️ Verifica marcacoes escondidas na mensagem citada',
    category: 'admin',
    aliases: ['checkeveryone', 'verificartag', 'verificarhidetag'],
    adminOnly: true,
    groupOnly: true,

    async execute(sock, messageData) {
        const { from, quoteThis, quotedMsg, groupMetadata, prefix } = messageData;

        if (!quotedMsg) {
            return sock.sendMessage(from, { 
                text: `❌ Você precisa responder a uma mensagem para verificar as marcações.\nExemplo: Responda a uma mensagem com \`${prefix}checktag\`` 
            }, { quoted: quoteThis });
        }

        try {
            // Pegar as menções da mensagem citada
            const mentions = MentionHandler.mentionedJidList(quotedMsg, groupMetadata);
            const mentionLids = MentionHandler.getMentionedLids(quotedMsg, groupMetadata);
            
            // Combinar e remover duplicatas
            const allMentions = [...new Set([...mentions, ...mentionLids])];
            
            if (allMentions.length === 0) {
                return sock.sendMessage(from, { 
                    text: `🔍 *Resultado da Verificação:*\n\n✅ Nenhuma marcação encontrada na mensagem citada.` 
                }, { quoted: quoteThis });
            }

            // Pegar o texto da mensagem citada
            const text = messageData.quotedText || '';
            
            // Verificar se as menções estão visíveis no texto (presença de @)
            // Se houver muitas menções mas poucos '@' no texto, é hidetag
            const atMatches = text.match(/@/g) || [];
            const isHidden = allMentions.length > atMatches.length;

            let response = `🔍 *VERIFICAÇÃO DE MARCAÇÕES*\n\n`;
            response += `┌─ 🏷️ *Hidetag:* ${isHidden ? '✅ True' : '❌ False'}\n`;
            response += `├─ 📊 *Total de menções:* ${allMentions.length}\n`;
            response += `├─ 👁️ *Marcações visíveis (@):* ${atMatches.length}\n`;
            response += `└─ 🕵️ *Estado:* ${isHidden ? 'Marcação Escondida' : 'Marcação Visível'}\n\n`;
            
            if (isHidden) {
                response += `📌 Esta mensagem utilizou o recurso de "hidetag" para marcar ${allMentions.length} pessoas sem poluir o texto.`;
            } else {
                response += `📌 As marcações nesta mensagem estão visíveis para todos.`;
            }

            await sock.sendMessage(from, { text: response }, { quoted: quoteThis });

        } catch (error) {
            console.error('Erro no comando checktag:', error);
            await sock.sendMessage(from, { text: '❌ Ocorreu um erro ao verificar as marcações.' }, { quoted: quoteThis });
        }
    }
};
