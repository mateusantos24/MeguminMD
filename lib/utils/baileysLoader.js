const { createRequire } = require('module');
const requireModule = createRequire(__filename);
const {
    applyBaileysPath,
    buildMissingBaileysModuleMessage,
    isBaileysModuleMissingError
} = require('./pathbaileys');
const config = require('../../config/config');

let cached;

global.nameBaileys = global.nameBaileys || config?.name?.modules;

function getBaileysModuleName() {
    return global.nameBaileys || config?.name?.modules;
}

function isConfiguredBaileysModuleName(moduleName) {
    return typeof moduleName === 'string' && /baileys/i.test(moduleName);
}

function createMissingBaileysModuleError(moduleName, message) {
    const error = new Error(message || buildMissingBaileysModuleMessage(moduleName));
    error.code = 'BAILEYS_MODULE_NOT_FOUND';
    error.moduleName = moduleName;
    return error;
}

function buildInvalidBaileysModuleMessage(moduleName) {
    return `Voce esta usando "${moduleName}", que nao e Baileys. Este bot espera um modulo Baileys que exporte makeWASocket. @open-wa/wa-automate usa wa.create()/client.onMessage e nao funciona neste loader. Ajuste config/config.js -> name.modules para um pacote Baileys instalado.`;
}

function buildMissingMakeWASocketMessage(moduleName) {
    if (!isConfiguredBaileysModuleName(moduleName)) {
        return buildInvalidBaileysModuleMessage(moduleName);
    }

    return `Voce esta usando um modulo Baileys ("${moduleName}"), mas ele nao exporta makeWASocket. Esse Baileys pode ser incompativel com este bot ou nao ser o pacote esperado. Ajuste config/config.js -> name.modules para um Baileys que exporte makeWASocket.`;
}

function createInvalidBaileysModuleError(moduleName) {
    const error = new Error(buildInvalidBaileysModuleMessage(moduleName));
    error.code = 'BAILEYS_MODULE_INVALID';
    error.moduleName = moduleName;
    return error;
}

function createBaileysExportMissingError(moduleName) {
    const error = new Error(buildMissingMakeWASocketMessage(moduleName));
    error.code = isConfiguredBaileysModuleName(moduleName) ? 'BAILEYS_EXPORT_NOT_FOUND' : 'BAILEYS_MODULE_INVALID';
    error.moduleName = moduleName;
    return error;
}

function isBaileysStartupConfigError(error) {
    return [
        'BAILEYS_MODULE_NOT_FOUND',
        'BAILEYS_MODULE_INVALID',
        'BAILEYS_EXPORT_NOT_FOUND'
    ].includes(error?.code);
}

async function getBaileys() {
    if (cached) return cached;

    const nameBaileys = getBaileysModuleName();
    if (!nameBaileys) {
        throw new Error('Baileys module nao configurado em global.nameBaileys ou config.name.modules');
    }

    if (!isConfiguredBaileysModuleName(nameBaileys)) {
        throw createInvalidBaileysModuleError(nameBaileys);
    }

    let pathResult;
    try {
        pathResult = applyBaileysPath({ silent: true, moduleName: nameBaileys });
    } catch (error) {
        console.error('[PATH-BAILEYS] FAIL erro ao aplicar patch automatico:', error?.message || error);
        throw error;
    }

    if (pathResult?.moduleMissing) {
        throw createMissingBaileysModuleError(nameBaileys, pathResult.message);
    }

    // Sempre usa CommonJS para whaileys (compatibilidade ESM/CJS)
    let mod;
    try {
        mod = requireModule(nameBaileys);
    } catch (error) {
        if (isBaileysModuleMissingError(error, nameBaileys)) {
            throw createMissingBaileysModuleError(nameBaileys);
        }

        try {
            mod = await import(nameBaileys);
        } catch (eError) {
            throw new Error(`Falha ao carregar ${nameBaileys}: ${eError.message}`);
        }
    }

    const out = {};

    if (mod && typeof mod === 'object') {
        // Se default for função (é makeWASocket), assign direto
        if (typeof mod.default === 'function') {
            out.makeWASocket = mod.default;
        }
        
        // Copia todas as outras propriedades
        Object.assign(out, mod);
        out.default = mod.default;
    }

    if (typeof out.makeWASocket !== 'function') {
        throw createBaileysExportMissingError(nameBaileys);
    }

    let version = 'unknown';
    try {
        const pkg = requireModule(`${nameBaileys}/package.json`);
        version = pkg.version;
    } catch {
        version = 'unknown';
    }

    cached = out;
    return out;
}

module.exports = {
    getBaileys,
    getBaileysModuleName,
    createBaileysExportMissingError,
    isBaileysStartupConfigError
};
