const axios = require('axios');

module.exports = {
    name: 'ddd',
    description: '\u260E️ Busca cidade e estado a partir do DDD informado',
    category: 'dados',
    aliases: ['codigoarea'],

    async execute(sock, messageData) {
        const { from, args, quoteThis, prefix } = messageData;

        const replyText = async (texto) => {
            await sock.sendMessage(from, { text: texto }, { quoted: quoteThis });
        };

        try {
            // ✅ VALIDAÇÃO
            if (args.length === 0) {
                return replyText(
                    `📞 *Consulta DDD Brasil*\n\n` +
                    `*Como usar:*\n` +
                    `${prefix}ddd <código>\n\n` +
                    `*Exemplos:*\n` +
                    `• ${prefix}ddd 11 (São Paulo)\n` +
                    `• ${prefix}ddd 21 (Rio de Janeiro)\n` +
                    `• ${prefix}ddd 85 (Fortaleza)\n` +
                    `• ${prefix}ddd 47 (Joinville)\n\n` +
                    `💡 Digite o DDD de 2 dígitos (somente Brasil)`
                );
            }

            // ✅ PARSE E VALIDAÇÃO DO DDD
            const dddInput = args[0].replace(/\D/g, ''); // Remove não-numéricos

            if (dddInput.length === 0) {
                return replyText(`❌ Digite um DDD válido!\n\nExemplo: ${prefix}ddd 11`);
            }

            // ✅ GARANTIR 2 DÍGITOS (pad com zero à esquerda se necessário)
            const ddd = dddInput.padStart(2, '0');
            const dddNum = parseInt(ddd);

            // ✅ VALIDAR RANGE (DDDs do Brasil: 11-99)
            if (dddNum < 11 || dddNum > 99) {
                return replyText(
                    `❌ DDD inválido!\n\n` +
                    `DDDs válidos do Brasil são de *11* a *99*.\n\n` +
                    `Exemplos:\n` +
                    `• 11 (São Paulo)\n` +
                    `• 21 (Rio de Janeiro)\n` +
                    `• 85 (Fortaleza)`
                );
            }



            // ✅ BUSCAR NA API BRASILAPI
            const response = await axios.get(`https://brasilapi.com.br/api/ddd/v1/${ddd}`, {
                timeout: 15000
            });

            const data = response.data;

            // ✅ VERIFICAR SE RETORNOU CIDADES
            if (!data.cities || data.cities.length === 0) {
                return replyText(
                    `⚠️ DDD ${ddd} existe mas não tem cidades cadastradas.\n\n` +
                    `Tente outro DDD.`
                );
            }

            // ✅ FORMATAR RESPOSTA (ordenar alfabeticamente)
            const cidadesFormatadas = data.cities.sort().map(city => `• ${city}`).join('\n');
            const mensagem = `📞 *CONSULTA DDD ${ddd}*\n\n` +
                `*🏴 Estado:* ${data.state}\n` +
                `*📊 Total:* ${data.cities.length} cidades\n\n` +
                `*🏙️ Cidades:*\n${cidadesFormatadas}`;

            await replyText(mensagem);


        } catch (error) {
            console.error('❌ Erro ao buscar DDD:', error);


            let errorMsg = '❌ Erro ao buscar DDD.';

            // ✅ TRATAR ERRO 400 (DDD inválido)
            if (error.response?.status === 400) {
                const apiError = error.response.data;

                if (apiError.type === 'ddd_error') {
                    errorMsg = `❌ ${apiError.message}\n\n` +
                        `DDDs válidos são de *11* a *99*.\n\n` +
                        `Exemplo: ${prefix}ddd 11`;
                } else {
                    errorMsg = `❌ DDD inválido!\n\nExemplo: ${prefix}ddd 11`;
                }
            }
            // ✅ TRATAR ERRO 404 (DDD não encontrado)
            else if (error.response?.status === 404) {
                errorMsg = `❌ DDD não encontrado!\n\n` +
                    `DDDs válidos são de *11* a *99*.\n\n` +
                    `Exemplos:\n` +
                    `• ${prefix}ddd 11\n` +
                    `• ${prefix}ddd 21\n` +
                    `• ${prefix}ddd 47`;
            }
            // ✅ TRATAR ERRO 500
            else if (error.response?.status === 500) {
                errorMsg = '❌ Erro no servidor da API.\n\nTente novamente mais tarde.';
            }
            // ✅ TRATAR TIMEOUT
            else if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
                errorMsg = '❌ Timeout! A API demorou muito.\n\nTente novamente.';
            }
            await replyText(errorMsg);
        }
    }
};
