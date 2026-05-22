// lib/commands/utilitarios/wame.js
const chalk = require('chalk');

module.exports = {
    name: 'wame',
    description: '\u{1F527} Mostra informacoes do WhatsApp (LID, PN e link wa.me)',
    category: 'utilitarios',
    aliases: ['whatsappme', 'walink', 'meulid'],

    async execute(sock, messageData) {
        const {
            from,
            sender,
            participantLid,
            pushName,
            getPNorLID,
            mentionedLidList,
            mentionedJidList,
            quoteThis,
            prefix,
            isOwner,
        } = messageData;

        try {
            // 1️⃣ PREPARAR LISTA DE USUÁRIOS
            let usersToShow = [];

            // Sempre incluir quem enviou o comando
            usersToShow.push({ user: sender, lid: participantLid });

            // Incluir todos os mencionados
            if (getPNorLID && getPNorLID.length > 0) {
                usersToShow.push(...getPNorLID);
            }

            // ✅ Remover duplicatas baseado no LID
            const seenLids = new Set();
            usersToShow = usersToShow.filter(u => {
                if (seenLids.has(u.lid)) {
                    return false; // Ignora duplicatas
                }
                seenLids.add(u.lid);
                return true;
            });

            // 2️⃣ BUSCAR INFORMAÇÕES DE TODOS
            const usersData = [];
            for (const u of usersToShow) {
                const userData = await getUserInfo(u.lid, u.user, isOwner);
                if (userData) usersData.push(userData);
            }

            // 3️⃣ CONSTRUIR RESPOSTA
            let response = `📱 INFORMAÇÕES WHATSAPP - ${usersData.length} USUÁRIO(S)\n\n`;

            for (let i = 0; i < usersData.length; i++) {
                const user = usersData[i];
                const isLast = i === usersData.length - 1;
                const connector = isLast ? '└─' : '├─';

                response += `${connector} 👤 ${user.name}\n`;
                response += `${isLast ? '   ' : '│  '}📞 ${user.displayPN}\n`;
                response += `${isLast ? '   ' : '│  '}🆔 ${user.displayLid}\n`;
                response += `${isLast ? '   ' : '│  '}🔗 ${user.waLink}\n`;
                response += `${isLast ? '   ' : '│  '}📊 ${user.totalNomes} nomes | ${user.platform}\n`;

                if (!isLast) response += `│\n`;
            }

            response += `\n💡 DICA\n`;
            response += `Use ${prefix}wame para ver suas próprias informações`;

            // 4️⃣ ENVIAR MENSAGEM COM MENÇÕES
            const allMentions = [
                ...mentionedLidList,
                ...mentionedJidList,
                participantLid // garante que você também seja mencionado
            ];

            await sock.sendMessage(from, {
                text: response,
                mentions: allMentions
            }, { quoted: quoteThis });

        } catch (error) {
            console.error(chalk.red('❌ Erro no comando wame:'), error);

            await sock.sendMessage(from, {
                text: `❌ ERRO AO BUSCAR INFORMAÇÕES\n\n` +
                      `Status: Falha na consulta\n` +
                      `Motivo: ${error.message}\n\n` +
                      `Tente novamente em alguns segundos.`
            }, { quoted: quoteThis });
        }
    }
};

// FUNÇÕES AUXILIARES
async function getUserInfo(lid, pn = null, isOwner = false) {
    try {
        // Retorna valores padrões
        return {
            name: 'Usuário',
            displayPN: pn ? `+${pn.replace(/@s\.whatsapp\.net/g,'')}` : 'Número Privado 🔒',
            displayLid: lid || 'Desconhecido',
            waLink: pn ? `https://wa.me/${pn.replace(/@s\.whatsapp\.net/g,'')}` : 'Privado 🔒',
            totalNomes: 1,
            platform: 'Desconhecido',
            groupName: 'Chat Privado',
            lastUpdate: 'Nunca'
        };

    } catch (error) {
        console.error(chalk.red('Erro ao buscar info do usuário:'), error);
        // Retorno fallback em caso de erro
        return {
            name: 'Usuário',
            displayPN: pn ? `+${pn.replace(/@s\.whatsapp\.net/g,'')}` : 'Número Privado 🔒',
            displayLid: lid || '@lid',
            waLink: pn ? `https://wa.me/${pn.replace(/@s\.whatsapp\.net/g,'')}` : 'Privado 🔒',
            totalNomes: 1,
            platform: 'Desconhecido',
            groupName: 'Desconhecido',
            lastUpdate: 'Nunca'
        };
    }
}
