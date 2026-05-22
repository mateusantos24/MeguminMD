const DEFAULT_CLEAR_LENGTH = 1000;
const MIN_CLEAR_LENGTH = 100;
const MAX_CLEAR_LENGTH = 65536;
const SAFE_CHUNK_LENGTH = 12000;

module.exports = {
    name: 'clearchat',
    description: '🧹 Limpa visualmente o chat com caracteres invisiveis',
    category: 'admin',
    aliases: ['limparchat', 'chatclear', 'clearchat', 'limpar'],
    adminOnlyOrPv: true,

    async execute(sock, messageData, args) {
        const { from, quoteThis, isGroup, isBotAdmin } = messageData;
        const raw = Array.isArray(args) ? String(args[0] || '').trim() : '';
        const requested = Number.parseInt(raw, 10);
        const targetLength = Number.isFinite(requested)
            ? Math.min(Math.max(requested, MIN_CLEAR_LENGTH), MAX_CLEAR_LENGTH)
            : DEFAULT_CLEAR_LENGTH;

        const chunks = buildInvisibleClearChunks(targetLength);
        for (let index = 0; index < chunks.length; index += 1) {
            await sock.sendMessage(
                from,
                { text: chunks[index] },
                index === 0 ? { quoted: quoteThis } : {}
            );
        }

        if (isGroup && isBotAdmin && messageData?.message?.key) {
            try {
                await sock.sendMessage(from, { delete: messageData.message.key });
            } catch {
                // ignorar se o cliente nao permitir apagar a mensagem do comando
            }
        }
    },
    buildInvisibleClearChunks,
    buildInvisibleClearMessage,
    DEFAULT_CLEAR_LENGTH,
    MIN_CLEAR_LENGTH,
    MAX_CLEAR_LENGTH,
    SAFE_CHUNK_LENGTH
};

function buildInvisibleClearChunks(targetLength) {
    const chunks = [];
    let remaining = targetLength;

    while (remaining > 0) {
        const currentSize = Math.min(remaining, SAFE_CHUNK_LENGTH);
        chunks.push(buildInvisibleClearMessage(currentSize));
        remaining -= currentSize;
    }

    return chunks;
}

function buildInvisibleClearMessage(targetLength) {
    const invisible = '\u2800';
    const parts = [];
    let currentLength = 0;

    while (currentLength < targetLength) {
        const next = parts.length === 0 ? invisible : `\n${invisible}`;
        parts.push(next);
        currentLength += next.length;
    }

    return parts.join('');
}
