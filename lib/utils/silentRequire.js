const Module = require('module');
const originalRequire = Module.prototype.require;

/**
 * Wrapper para require que suprime avisos de módulos específicos
 * @param {string} moduleId - ID do módulo a importar
 * @param {boolean} debug - Se true, loga erros de carregamento
 * @returns {*} O módulo importado ou null se falhar
 */
function silentRequire(moduleId, debug = false) {
    const originalWarn = console.warn;
    const originalError = console.error;
    
    try {
        // Suprime avisos e erros durante o require
        console.warn = () => {};
        console.error = () => {};
        
        // ✅ FIX: Passa apenas moduleId, não o parâmetro debug
        return originalRequire.call(module, moduleId);
    } catch (error) {
        // Captura e suprime erro real do require
        if (debug) {
            console.error(`[DEBUG silentRequire] Erro ao carregar "${moduleId}":`, error.message);
        }
        return null;
    } finally {
        // Restaura console.warn e console.error
        console.warn = originalWarn;
        console.error = originalError;
    }
}

module.exports = silentRequire;
