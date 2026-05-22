const os = require('os');
const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

function buildStatus(ms) {
    if (ms < 500) return { emoji: '⚡', text: 'Excelente', color: 0x57f287 };
    if (ms < 1500) return { emoji: '👍', text: 'Bom', color: 0xfee75c };
    if (ms < 3000) return { emoji: '🟠', text: 'Aceitavel', color: 0xffa726 };
    return { emoji: '🐌', text: 'Lento', color: 0xed4245 };
}

function formatUptime() {
    const totalSeconds = Math.max(1, Math.floor(process.uptime()));
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const parts = [];

    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (!parts.length) parts.push(`${totalSeconds}s`);

    return parts.join(' ');
}

function buildDiscordEmbed({ latencyStr, status, showInfo }) {
    const embed = new EmbedBuilder()
        .setColor(status.color)
        .setTitle('🏓 Ping do Bot')
        .addFields(
            { name: 'Latencia', value: `**${latencyStr}ms** ${status.emoji}`, inline: true },
            { name: 'Status', value: `**${status.text}**`, inline: true },
            { name: 'Estado', value: '**Online**', inline: true }
        )
        .setFooter({
            text: showInfo
                ? 'Megumin • Diagnostico Discord'
                : 'Megumin • Use /ping --show para detalhes'
        })
        .setTimestamp();

    if (!showInfo) return embed;

    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
        const cpuInfo = os.cpus()[0];
        const totalMem = Math.round(os.totalmem() / 1024 / 1024 / 1024);

        embed.addFields(
            {
                name: 'Bot',
                value: [
                    `**Nome:** ${pkg.name || 'N/A'}`,
                    `**Versao:** ${pkg.version || 'N/A'}`,
                    `**Node.js:** ${process.version}`,
                    `**Uptime:** ${formatUptime()}`
                ].join('\n'),
                inline: false
            },
            {
                name: 'Sistema',
                value: [
                    `**SO:** ${os.type()} ${os.arch()}`,
                    `**CPU:** ${cpuInfo.model}`,
                    `**RAM:** ${totalMem}GB`
                ].join('\n'),
                inline: false
            }
        );
    } catch (err) {
        embed.addFields({
            name: 'Aviso',
            value: `Nao consegui carregar detalhes extras: \`${err.message}\``,
            inline: false
        });
    }

    return embed;
}

module.exports = {
    name: 'ping',
    description: '\u{1F527} Verificar latencia e informacoes do bot',
    category: 'utilitarios',
    aliases: ['latencia', 'p', 'debugping'],

    async execute(sock, messageData, args) {
        const { from, isOwner, quoteThis, prefix } = messageData;

        const fullArgs = args.join(' ').toLowerCase();
        const showInfo = fullArgs.includes('--show') || fullArgs.includes('-s');

        const start = process.hrtime();
        const diff = process.hrtime(start);
        const latencyMs = diff[0] * 1000 + diff[1] / 1e6;
        const latencyStr = latencyMs.toFixed(3);
        const status = buildStatus(latencyMs);

        if (messageData.platform === 'discord') {
            await sock.sendMessage(from, {
                discord: {
                    embeds: [buildDiscordEmbed({ latencyStr, status, showInfo: Boolean(isOwner && showInfo) })]
                }
            }, { quoted: quoteThis });
            return;
        }

        let response = `🏓 *INFORMACOES DE LATENCIA*\n`;
        response += `├─ Velocidade: ${latencyStr}ms ${status.emoji}\n`;
        response += `├─ Status: ${status.text}\n`;
        response += '└─ Estado: Online';

        if (isOwner && showInfo) {
            try {
                const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
                const cpuInfo = os.cpus()[0];
                const totalMem = Math.round(os.totalmem() / 1024 / 1024 / 1024);

                response += `\n\n🤖 *INFORMACOES DO BOT*\n`;
                response += `├─ Nome: ${pkg.name || 'N/A'}\n`;
                response += `├─ Versao: ${pkg.version || 'N/A'}\n`;
                response += `├─ Node.js: ${process.version}\n`;
                response += `└─ Uptime: ${formatUptime()}`;

                response += `\n\n💻 *SISTEMA*\n`;
                response += `├─ SO: ${os.type()} ${os.arch()}\n`;
                response += `├─ CPU: ${cpuInfo.model}\n`;
                response += `└─ RAM Total: ${totalMem}GB`;
            } catch (err) {
                response += `\n\n❌ Falha ao obter informacoes: ${err.message}`;
            }
        } else if (isOwner) {
            response += `\n\n💡 *DICA*: Use ${prefix}ping --show para ver informacoes detalhadas do bot`;
        }

        await sock.sendMessage(from, { text: response }, { quoted: quoteThis });
    }
};
