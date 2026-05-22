const {
    formatRecentHistory,
    formatRestrictionReport,
    formatTimeLockInfoBlock,
    getRestrictionState,
    refreshRestrictionState
} = require('../../utils/whatsappRestrictionMonitor');

module.exports = {
    name: 'checklimit',
    description: '🛡️ Verifica reachout timelock e limite de novas conversas da conta',
    category: 'dono',
    ownerOnly: true,
    aliases: ['walimits', 'reachout', 'msglimit', 'checkwa'],

    async execute(sock, messageData, args = []) {
        const { from, quoteThis, prefix } = messageData;
        const action = String(args[0] || '').trim().toLowerCase();

        if (action === 'help') {
            await sock.sendMessage(from, {
                text: [
                    '🛡️ *COMANDO /CHECKLIMIT*',
                    '',
                    `• \`${prefix}checklimit\` → consulta atual`,
                    `• \`${prefix}checklimit notify\` → consulta e reenvia no EVENTOLOGS`,
                    `• \`${prefix}checklimit raw\` → mostra o bloco timeLockInfo`,
                    `• \`${prefix}checklimit logs\` → mostra histórico salvo`,
                    '',
                    'Mostra o reachout timelock e o limite de novas conversas da conta.'
                ].join('\n')
            }, { quoted: quoteThis });
            return;
        }

        if (action === 'logs' || action === 'log' || action === 'historico' || action === 'hist') {
            await sock.sendMessage(from, {
                text: formatRecentHistory(8)
            }, { quoted: quoteThis });
            return;
        }

        if (action === 'raw' || action === 'json' || action === 'timelockinfo') {
            await refreshRestrictionState(sock, {
                notify: false,
                reason: 'comando /checklimit raw'
            });
            const state = getRestrictionState();
            const rawText = [
                formatRestrictionReport({
                    title: '🛡️ *RAW DE RESTRIÇÃO WHATSAPP*',
                    reason: 'snapshot salvo no monitor'
                }),
                '',
                formatTimeLockInfoBlock(),
                '',
                state?.messageCap?.raw
                    ? `\`\`\`json\n${JSON.stringify(state.messageCap.raw, null, 2)}\n\`\`\``
                    : '```json\n{}\n```'
            ].join('\n');

            await sock.sendMessage(from, {
                text: rawText
            }, { quoted: quoteThis });
            return;
        }

        const shouldNotify = action === 'notify';
        const result = await refreshRestrictionState(sock, {
            notify: shouldNotify,
            reason: shouldNotify ? 'comando /checklimit notify' : 'comando /checklimit',
            forceNotify: shouldNotify
        });

        const warnings = [];

        if (!result.reachoutSupported) {
            warnings.push('• Reachout Timelock: não suportado neste socket');
        } else if (result.reachoutError) {
            warnings.push(`• Reachout Timelock: erro ao consultar (${result.reachoutError.message || result.reachoutError})`);
        }

        if (!result.messageCapSupported) {
            warnings.push('• Message Cap: não suportado neste socket');
        } else if (result.messageCapError) {
            warnings.push(`• Message Cap: erro ao consultar (${result.messageCapError.message || result.messageCapError})`);
        }

        const report = formatRestrictionReport({
            title: shouldNotify
                ? '🛡️ *STATUS DE RESTRIÇÃO WHATSAPP*'
                : '🛡️ *CONSULTA MANUAL DE RESTRIÇÃO WHATSAPP*',
            reason: shouldNotify ? 'consulta manual + reenvio no EVENTOLOGS' : 'consulta manual'
        });

        const footer = [];
        if (warnings.length) {
            footer.push('', '⚠️ *Observações*', ...warnings);
        }

        if (shouldNotify) {
            footer.push('', '📡 EVENTOLOGS: tentativa de envio executada em modo best-effort.');
        }

        const state = getRestrictionState();
        if (!state.reachoutTimeLock && !state.messageCap && !warnings.length) {
            footer.push('', 'ℹ️ Nenhum dado retornou do WhatsApp nesta checagem.');
        }

        await sock.sendMessage(from, {
            text: `${report}${footer.join('\n')}`
        }, { quoted: quoteThis });
    }
};
