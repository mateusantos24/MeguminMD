// ✅ CRIAR NOVO ARQUIVO: lib/utils/safeReload.js
const chalk = require('chalk');

class SafeReload {
    static async reloadWithFallback(reloadFunction, componentName, sock) {
        try {
            console.log(chalk.blue(`🔄 Tentando reload seguro de ${componentName}...`));
            
            // Tentar reload
            await reloadFunction();
            
            console.log(chalk.green(`✅ ${componentName} recarregado com sucesso`));
            return true;
            
        } catch (error) {
            console.error(chalk.red(`❌ Falha no reload de ${componentName}:`), error);
            
            // Notificar usuário sobre falha
            if (sock) {
                try {
                    const config = require('../../config/config');
                    await sock.sendMessage(config.ownerNumber, {
                        text: `⚠️ *FALHA NO HOT-RELOAD*
├─ 📁 Componente: ${componentName}
├─ ❌ Erro: ${error.message}
├─ 🔄 Ação: Continuando com versão anterior
└─ 💡 Reinicie o bot se necessário`
                    });
                } catch (notifyError) {
                    console.error('Erro ao notificar falha:', notifyError);
                }
            }
            
            return false;
        }
    }
}

module.exports = SafeReload;
