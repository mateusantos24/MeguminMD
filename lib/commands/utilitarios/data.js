const moment = require('moment-timezone');

module.exports = {
    name: 'data',
    description: '\u{1F527} Mostra hora/data em qualquer fuso horario do mundo',
    category: 'utilitarios',
    aliases: ['date', 'hora', 'timezone'],

    async execute(sock, messageData) {
        const { from, args, quoteThis, prefix } = messageData;

        const replyText = async (texto) => {
            await sock.sendMessage(from, { text: texto }, { quoted: quoteThis });
        };

        try {
            if (args.length > 0 && moment.tz.names().includes(args[0])) {
                const timezone = args[0];
                const dataHora = moment.tz(timezone).format('LLLL');

                return replyText(
                    `🕐 *Data e Hora*\n\n` +
                    `*Fuso:* ${timezone}\n` +
                    `*Agora:* ${dataHora}\n\n` +
                    `💡 Use ${prefix}data para ver todos os fusos`
                );
            }

            const timezones = moment.tz.names();
            const horaLocal = moment().format('LLLL');

            const mainTimezones = [
                'America/Sao_Paulo',
                'America/New_York',
                'America/Los_Angeles',
                'America/Chicago',
                'America/Mexico_City',
                'America/Buenos_Aires',
                'Europe/London',
                'Europe/Paris',
                'Europe/Berlin',
                'Europe/Moscow',
                'Asia/Tokyo',
                'Asia/Shanghai',
                'Asia/Dubai',
                'Asia/Kolkata',
                'Asia/Singapore',
                'Australia/Sydney',
                'Pacific/Auckland',
                'Africa/Cairo',
                'Africa/Johannesburg'
            ];

            let mensagem = `🕐 *DATA E HORA MUNDIAL*\n\n` + `*🏠 Hora Local:*\n${horaLocal}\n\n` + `*🌍 Principais Fusos:*\n`;

            mainTimezones.forEach(tz => {
                const time = moment.tz(tz).format('HH:mm - DD/MM/YYYY');
                const cityName = tz.split('/').pop().replace(/_/g, ' ');
                mensagem += `\n📍 *${cityName}*\n${time}\n`;
            });

            mensagem += `\n\n💡 *Como usar:*\n` +
                `${prefix}data America/Sao_Paulo\n` +
                `${prefix}data Europe/London\n` +
                `${prefix}data Asia/Tokyo\n\n` +
                `📋 Total de ${timezones.length} fusos disponíveis`;

            await replyText(mensagem);
        } catch (error) {
            console.error('❌ Erro no comando data:', error);

            await replyText(
                `❌ Erro ao processar.\n\n` +
                `Exemplo: ${prefix}data America/Sao_Paulo`
            );
        }
    }
};
