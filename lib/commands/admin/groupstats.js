// lib/commands/admin/groupstat.js
const contaDB = require('../../database/conta');
const modernDb = require('../../database/modernDatabase');

module.exports = {
    name: 'groupstats',
    description: '📊 Mostra estatisticas de entrada e saida dos usuarios',
    category: 'admin',
    aliases: ['gpstats', 'groupstat', 'gstats', 'gs'],
    adminOnly: true,
    groupOnly: true,

    async execute(sock, messageData) {
        const { from, quoteThis, prefix, firstMentionLid } = messageData;

        try {
            // 🔍 Captura menções usando MentionHandler
            if (firstMentionLid && firstMentionLid.length > 0) {
                // Stats de usuário específico
                const targetLid = firstMentionLid;
                const stats = await modernDb.getUserGroupStats(targetLid, from);
                const statsDb = await contaDB.getUserFlexible(targetLid, from);
                if (statsDb) {
                    const response = `📊 *ESTATÍSTICAS DE ${statsDb.pushname}*\n\n` +
                        `🔄 *ATIVIDADE NO GRUPO:*\n` +
                        `├─ 📥 Entradas: ${stats.joins}\n` +
                        `├─ 📤 Saídas: ${stats.leaves}\n` +
                        `├─ 🆔 Lid: ${statsDb.userLid}\n` +
                        `├─ 🔥 Streak atual: ${stats.currentStreak}\n` +
                        `└─ 🎯 Última ação: ${stats.lastAction === 'join' ? 'Entrou' : 'Saiu'}\n\n` +
                        `📅 *HISTÓRICO:*\n` +
                        `├─ 🆕 Primeiro join: ${stats.firstJoin ? new Date(stats.firstJoin).toLocaleDateString('pt-BR') : 'N/A'}\n` +
                        `└─ ⏰ Última atividade: ${stats.lastActivity ? new Date(stats.lastActivity).toLocaleDateString('pt-BR') : 'N/A'}`;

                    await sock.sendMessage(from, { text: response, mentions: [targetLid] }, { quoted: quoteThis });
                } else {
                    await sock.sendMessage(from, { text: '❌ Usuário não encontrado no banco de dados (LID).', mentions: [targetLid] }, { quoted: quoteThis });
                }
            } else {
                // Stats gerais do grupo
                const topUsers = await this.getTopActiveUsers(from);

                let response = `📊 *ESTATÍSTICAS DO GRUPO*\n\n👥 *TOP USUÁRIOS MAIS ATIVOS:*\n`;

                if (topUsers.length === 0) {
                    response += '📭 Nenhuma atividade registrada ainda.';
                } else {
                    topUsers.forEach((user, index) => {
                        const emoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '📍';
                        response += `${emoji} ${user.user_name}: ${user.total_joins} entradas • ${user.total_leaves} saídas\n`;
                    });
                }

                response += `\n💡 *Uso:* ${prefix}groupstats @usuario para ver stats específicas`;
                await sock.sendMessage(from, { text: response }, { quoted: quoteThis });
            }
        } catch (error) {
            console.error('❌ Erro no comando groupstats:', error);
            await sock.sendMessage(from, { text: '❌ Erro ao obter estatísticas do grupo.' }, { quoted: quoteThis });
        }
    },

    async getTopActiveUsers(chatJid) {
        return await modernDb.all(`
            SELECT
                user_lid,  -- ✅ CORRETO
                user_name,
                SUM(CASE WHEN action = 'join' THEN 1 ELSE 0 END) AS total_joins,
                SUM(CASE WHEN action = 'leave' THEN 1 ELSE 0 END) AS total_leaves,
                (
                    SUM(CASE WHEN action = 'join' THEN 1 ELSE 0 END) +
                    SUM(CASE WHEN action = 'leave' THEN 1 ELSE 0 END)
                ) AS total_activity
            FROM group_activity_log
            WHERE chat_jid = ?
            GROUP BY user_lid, user_name  -- ✅ CORRETO
            HAVING total_activity > 0
            ORDER BY total_activity DESC
            LIMIT 10
        `, [chatJid]);
    }
};
