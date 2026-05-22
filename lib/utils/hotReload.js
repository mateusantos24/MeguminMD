const path = require('path');
const fs = require('fs');
const chalk = require('chalk');
const chokidar = require('chokidar');

class HotReload {
    constructor(sock = null) {
        this.sock = sock;
        this.watcher = null;
        this.reloadInProgress = false;
        this.lastReloadTime = new Map();
        this.monitoredFiles = [];
        this.projectRoot = path.resolve('.');
        this.commandsPath = path.resolve('./lib/commands');
        this.utilsPath = path.resolve('./lib/utils');
        this.commandHandlerPath = path.resolve('./lib/handlers/commandHandler.js');

        this.config = {
            watchPaths: [
                path.resolve('./lib/commands'),
                path.resolve('./lib/utils'),
                path.resolve('./config/config.js')
            ],
            chokidarOptions: {
                ignoreInitial: false,
                persistent: true,
                usePolling: process.platform === 'win32',
                awaitWriteFinish: {
                    stabilityThreshold: 1000,
                    pollInterval: 100
                },
                ignored: [
                    '**/node_modules/**',
                    '**/data/**',
                    '**/sessions/**',
                    '**/backups/**',
                    '**/*.tmp',
                    '**/*.log',
                    '**/*.sqlite*',
                    '**/commandHandler.js', // ✅ Não recarregar commandHandler
                ]
            },
            heavyFiles: ['messageHandler.js', 'modernDatabase.js'],
            debounceTime: 3000,
            maxReloadsPerMinute: 3
        };
    }

    init() {
        this.primeMonitoredFiles();
        this.startWatcher();
        this.setupCleanup();
        return this;
    }

    updateSocket(sock) {
        this.sock = sock;
        return this;
    }

    shouldTrackFile(filePath) {
        if (!filePath || typeof filePath !== 'string') return false;
        if (!filePath.endsWith('.js')) return false;
        if (filePath.endsWith('commandHandler.js')) return false;

        const ignoredFragments = [
            `${path.sep}node_modules${path.sep}`,
            `${path.sep}data${path.sep}`,
            `${path.sep}sessions${path.sep}`,
            `${path.sep}backups${path.sep}`
        ];

        return !ignoredFragments.some((fragment) => filePath.includes(fragment));
    }

    primeMonitoredFiles() {
        const discovered = new Set();
        const ignoredFragments = [
            `${path.sep}node_modules${path.sep}`,
            `${path.sep}data${path.sep}`,
            `${path.sep}sessions${path.sep}`,
            `${path.sep}backups${path.sep}`
        ];

        const walk = (targetPath) => {
            if (!fs.existsSync(targetPath)) return;
            const stats = fs.statSync(targetPath);

            if (stats.isFile()) {
                if (this.shouldTrackFile(targetPath)) {
                    discovered.add(targetPath);
                }
                return;
            }

            for (const entry of fs.readdirSync(targetPath)) {
                const fullPath = path.join(targetPath, entry);
                if (ignoredFragments.some((fragment) => fullPath.includes(fragment))) continue;
                walk(fullPath);
            }
        };

        for (const watchPath of this.config.watchPaths) {
            walk(watchPath);
        }

        this.monitoredFiles = Array.from(discovered);
    }

    startWatcher() {
        if (this.watcher) {
            console.log(chalk.yellow('⚠️ Watcher já está ativo'));
            return;
        }

        try {
            this.watcher = chokidar.watch(this.config.watchPaths, this.config.chokidarOptions);

            this.watcher.on('change', (filePath) => this.handleFileChange(filePath));

            this.watcher.on('add', (filePath) => {
                if (this.shouldTrackFile(filePath) && !this.monitoredFiles.includes(filePath)) {
                    this.monitoredFiles.push(filePath);
                }
            });

            this.watcher.on('ready', () => {
                this.primeMonitoredFiles();
            });

            this.watcher.on('error', (error) => {
                console.error(chalk.red('❌ Erro no file watcher:'), error);
            });

        } catch (error) {
            console.error(chalk.red('❌ Erro ao iniciar watcher:'), error);
        }
    }

    handleFileChange(filePath) {
        if (!filePath.endsWith('.js')) return;

        const resolvedPath = path.resolve(filePath);
        const fileName = path.basename(filePath);
        const now = Date.now();
        const lastReload = this.lastReloadTime.get(resolvedPath) || 0;
        const debounceTime = this.config.heavyFiles.includes(fileName)
            ? this.config.debounceTime
            : 500;

        if (now - lastReload < debounceTime) {
            console.log(chalk.yellow(`⏳ Debounce ativo para ${fileName}, aguardando...`));
            return;
        }

        if (this.reloadInProgress) {
            console.log(chalk.yellow('🔄 Reload em andamento, aguardando...'));
            return;
        }

        this.lastReloadTime.set(resolvedPath, now);
        this.logEvent('CHANGE', resolvedPath, '🔄 Detectada alteração...');

        const delay = this.config.heavyFiles.includes(fileName) ? 1500 : 300;

        setTimeout(() => {
            if (!fs.existsSync(resolvedPath)) {
                this.logEvent('ERROR', resolvedPath, '❌ Arquivo não encontrado após mudança');
                return;
            }
            this.performReload(resolvedPath, fileName);
        }, delay);
    }

    async performReload(resolvedPath, fileName) {
        this.reloadInProgress = true;
        try {
            // ✅ Limpar cache específico
            try {
                const cacheKey = require.resolve(resolvedPath);
                if (require.cache[cacheKey]) {
                    delete require.cache[cacheKey];
                    this.logEvent('CACHE', resolvedPath, '🗑️ Cache limpo');
                }
            } catch {
                /* Empty */
            }

            // ✅ Reload por tipo de arquivo
            if (fileName === 'messageHandler.js') {
                await this.reloadMessageHandler();
            } else if (this.isUtilsFile(resolvedPath)) {
                this.reloadUtils(resolvedPath);
            } else if (resolvedPath.includes('/commands/') || resolvedPath.includes('\\commands\\')) {
                this.reloadCommands();
            } else if (resolvedPath.includes('config.js')) {
                this.reloadConfig();
            } else {
                this.reloadGeneric(resolvedPath);
            }

            this.logEvent('SUCCESS', resolvedPath, '✅ Hot-reload aplicado!');
        } catch (error) {
            console.error(chalk.red(`❌ Erro no reload de ${fileName}:`), error.message);
            this.logEvent('ERROR', resolvedPath, `❌ Erro: ${error.message}`);
        } finally {
            this.reloadInProgress = false;
        }
    }

    reloadMessageHandler() {
        console.log(chalk.yellow('🔄 Recarregando MessageHandler (arquivo pesado)...'));
        try {
            const relatedFiles = [
                path.resolve('../handlers/messageHandler.js'),
                path.resolve('../handlers/commandHandler.js')
            ];

            relatedFiles.forEach(file => {
                try {
                    const cacheKey = require.resolve(file);
                    if (require.cache[cacheKey]) {
                        delete require.cache[cacheKey];
                        console.log(chalk.gray(` 🗑️ ${path.basename(file)}`));
                    }
                } catch {
                    /* Empty */
                }
            });

            console.log(chalk.cyan('🔄 Recarregando handlers...'));

            // 🔹 Reimporta o messageHandler de fato
            const newHandler = require('../handlers/messageHandler');
            if (typeof newHandler.init === 'function') {
                newHandler.init(this.sock);
            }

        } catch (error) {
            console.error(chalk.red('❌ Erro crítico no reload do MessageHandler:'), error);
        }
    }

    reloadCommands() {
        try {
            const commandHandlerPath = require.resolve('../handlers/commandHandler');
            const CommandHandler = require(commandHandlerPath);
            const handler = CommandHandler?.instance || CommandHandler;

            if (handler && typeof handler.loadCommands === 'function') {
                handler.loadCommands();
                const total = handler.commands?.size || 0;
                console.log(chalk.green(`✅ Comandos recarregados: ${total}`));
                return;
            }
        } catch (error) {
            console.error(chalk.red('🔧 [ERROR] Erro no reloadCommands():'), error);
        }

    }

    reloadCommandsLegacyDisabled() {
        try {
            // ✅ GARANTIR QUE É A MESMA INSTÂNCIA
            const CommandHandler = require('../handlers/commandHandler');

            // Recarregar apenas o comando modificado (não todos)
            if (CommandHandler.instance && CommandHandler.instance.loadCommands) {
                // Fazer reload seletivo se possível
                console.log(chalk.gray('  ℹ️ Comando será recarregado no próximo uso'));
            } else if (CommandHandler.loadCommands) {
                CommandHandler.loadCommands();
            }
        } catch (error) {
            console.error(chalk.red('🔧 [ERROR] Erro no reloadCommands():'), error);
        }
    }

    reloadConfig() {
        try {
            const configPath = require.resolve('../../config/config');
            delete require.cache[configPath];
            console.log(chalk.green('⚙️ Configurações recarregadas'));
        } catch (error) {
            console.error(chalk.red('❌ Erro ao recarregar config:'), error);
        }
    }

    reloadGeneric(resolvedPath) {
        try {
            const cacheKey = require.resolve(resolvedPath);
            delete require.cache[cacheKey];
        } catch (error) {
            console.error(chalk.red(`❌ Erro ao recarregar ${path.basename(resolvedPath)}:`), error);
        }
    }

    isUtilsFile(resolvedPath) {
        return resolvedPath.startsWith(this.utilsPath);
    }

    isProjectModule(modulePath) {
        return typeof modulePath === 'string'
            && modulePath.startsWith(this.projectRoot)
            && !modulePath.includes(`${path.sep}node_modules${path.sep}`);
    }

    moduleDependsOn(moduleEntry, targetPath, visited = new Set()) {
        if (!moduleEntry || visited.has(moduleEntry.id)) return false;
        visited.add(moduleEntry.id);
        if (moduleEntry.id === targetPath) return true;
        const children = Array.isArray(moduleEntry.children) ? moduleEntry.children : [];
        return children.some((child) => this.moduleDependsOn(child, targetPath, visited));
    }

    purgeDependentCache(targetPath) {
        const normalizedTarget = require.resolve(targetPath);
        const cacheKeys = Object.keys(require.cache);
        const deleted = new Set();

        cacheKeys.forEach((cacheKey) => {
            const entry = require.cache[cacheKey];
            if (!entry || !this.isProjectModule(cacheKey)) return;
            if (this.moduleDependsOn(entry, normalizedTarget)) {
                deleted.add(cacheKey);
            }
        });

        deleted.forEach((cacheKey) => {
            delete require.cache[cacheKey];
        });

        return deleted.size;
    }

    purgeCacheUnder(basePath) {
        const normalizedBase = path.resolve(basePath);
        const deleted = new Set();

        Object.keys(require.cache).forEach((cacheKey) => {
            if (!this.isProjectModule(cacheKey)) return;
            if (!cacheKey.startsWith(normalizedBase)) return;
            deleted.add(cacheKey);
        });

        deleted.forEach((cacheKey) => {
            delete require.cache[cacheKey];
        });

        return deleted.size;
    }

    purgeSingleModule(modulePath) {
        try {
            const resolved = require.resolve(modulePath);
            if (require.cache[resolved]) {
                delete require.cache[resolved];
                return 1;
            }
        } catch {
            /* Empty */
        }

        return 0;
    }

    reloadUtils(resolvedPath) {
        try {
            const purgedDependents = this.purgeDependentCache(resolvedPath);
            const purgedUtils = this.purgeCacheUnder(this.utilsPath);
            const purgedCommands = this.purgeCacheUnder(this.commandsPath);
            const purgedHandler = this.purgeSingleModule(this.commandHandlerPath);
            const purgedTotal = purgedDependents + purgedUtils + purgedCommands + purgedHandler;

            console.log(chalk.green(`🧩 Utils recarregado: ${path.basename(resolvedPath)} (${purgedTotal} módulos limpos | deps:${purgedDependents} utils:${purgedUtils} commands:${purgedCommands} handler:${purgedHandler})`));
            this.reloadCommands();
        } catch (error) {
            console.error(chalk.red(`❌ Erro ao recarregar util ${path.basename(resolvedPath)}:`), error);
        }
    }

    logEvent(type, filePath, message) {
        const timestamp = new Date().toLocaleTimeString('pt-BR');
        const fileName = path.basename(filePath);
        const colors = {
            CHANGE: chalk.yellow,
            CACHE: chalk.gray,
            SUCCESS: chalk.green,
            ERROR: chalk.red
        };
        const color = colors[type] || chalk.white;
        console.log(
            chalk.gray(`[${timestamp}]`),
            color(`[${type}]`),
            color(message),
            chalk.cyan(fileName)
        );
    }

    async notifyReloadError(component, errorMsg) {
        try {
            const config = require('../../config/config');
            if (config.ownerNumber) {
                await this.sock.sendMessage(config.ownerNumber, {
                    text: `🚨 *ERRO NO HOT-RELOAD*\n\n├─ 📁 Componente: ${component}\n├─ ❌ Erro: ${errorMsg}\n├─ 💡 Recomendação: Reinicie o bot\n└─ 🔄 Use: npm start`
                });
            }
        } catch (error) {
            console.error(chalk.red('❌ Erro ao notificar erro:'), error);
        }
    }

    setupCleanup() {
        process.on('SIGINT', () => this.cleanup());
        process.on('SIGTERM', () => this.cleanup());
    }

    cleanup() {
        if (this.watcher) {
            console.log(chalk.yellow('🔄 Parando hot-reload...'));
            this.watcher.close();
            this.watcher = null;
        }
    }

    getStats() {
        return {
            active: !!this.watcher,
            totalFiles: this.monitoredFiles.length,
            watchedPaths: this.config.watchPaths.length,
            reloadInProgress: this.reloadInProgress
        };
    }
}

module.exports = HotReload;
