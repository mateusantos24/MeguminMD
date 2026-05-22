const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

class FileWatcher {
    constructor(sock = null, silentMode = false) {
        this.sock = sock;
        this.silentMode = silentMode;
        this.watchers = new Map();
        this.suspiciousEvents = [];
        this.recentEvents = new Map();
        this.startTime = Date.now();

        this.config = {
            watchPaths: [
                './lib/commands',
                './lib/handlers',
                './config/config.js',
                './index.js'
            ],
            criticalFiles: ['config.js', 'index.js', 'commandHandler.js'],
            heavyFiles: ['messageHandler.js', 'modernDatabase.js'],

            // ✅ ADICIONAR TODAS AS PASTAS DE CACHE
            ignoredPaths: [
                'sessions',
                'data',
                'backups',
                'logs',
                'node_modules',
                'data/Cache',
                'download/Cache',
                'midias/Cache',
                'Cache'                            // ✅ NOVO: Qualquer pasta Cache
            ],

            // ✅ ADICIONAR EXTENSÕES TEMPORÁRIAS DO FFMPEG
            ignoredExtensions: [
                '.tmp', '.log', '.sqlite', '.bin', '.webp',
                '.temp', '.partial', '.download'    // ✅ NOVO: Extensões temporárias
            ],

            ignoredPatterns: [
                /^creds\.json$/,
                /^pre-key-\d+\.json$/,
                /^session-\d+\.\d+\.json$/,
                /^sender-key-.+\.json$/,
                /^app-state-sync-.+\.json$/,
                /\.sqlite(-journal|-shm|-wal)?$/,
                /backup_\d{4}-\d{2}-\d{2}.+\.sqlite$/,
                /\/data\/Cache\//i,
                /\\data\\Cache\\/i,
                /\/midias\/Cache\//i,
                /\\midias\\Cache\\/i,
                /\/download\/Cache\//i,
                /\\download\\Cache\\/i,
                /\/Cache\//i,                        // ✅ NOVO: Qualquer /Cache/
                /\\Cache\\/i,                        // ✅ NOVO: Qualquer \Cache\
                /^input_\d+\.(mp4|mp3)$/,           // ✅ NOVO: Arquivos input temporários
                /^output_\d+\.(mp4|mp3)$/           // ✅ NOVO: Arquivos output temporários
            ],
            alertThreshold: 15,
            eventDebounceMs: 1200
        };

        this.init();
    }

    init() {
        this.startWatching();
        this.setupCleanup();
    }

    startWatching() {
        this.config.watchPaths.forEach(watchPath => {
            if (fs.existsSync(watchPath)) {
                try {
                    const watcher = fs.watch(watchPath, { recursive: true }, (eventType, filename) => {
                        this.handleFileEvent(eventType, filename, watchPath);
                    });
                    this.watchers.set(watchPath, watcher);
                } catch (error) {
                    console.error(chalk.red(`❌ Erro ao monitorar ${watchPath}:`), error.message);
                }
            }
        });
    }

    handleFileEvent(eventType, filename, basePath) {
        if (!filename) return;

        const fullPath = path.join(basePath, filename);

        // ✅ CHECAR IGNORADOS PRIMEIRO (antes de qualquer processamento)
        if (this.shouldIgnore(fullPath)) return;

        const isHeavyFile = this.config.heavyFiles.some(heavy => filename.includes(heavy));
        const exists = fs.existsSync(fullPath);
        const isCritical = this.isCriticalFile(filename);

        let severity = 'low';
        if (eventType === 'rename') {
            if (exists) {
                severity = isHeavyFile ? 'medium' : isCritical ? 'high' : 'medium';
            } else {
                severity = isCritical ? 'extreme' : 'high';
            }
        } else if (eventType === 'change') {
            severity = isHeavyFile ? 'low' : isCritical ? 'high' : 'low';
        }

        const event = {
            timestamp: new Date().toISOString(),
            action: this.getActionText(eventType, exists),
            actionCode: this.getActionCode(eventType, exists),
            filename,
            fullPath,
            severity,
            exists
        };

        if (this.isDuplicateEvent(event)) {
            return;
        }

        this.logEvent(event);
        this.suspiciousEvents.push(event);

        if (severity === 'high' || severity === 'extreme') {
            this.handleHighSeverityEvent(event);
        }

        this.cleanOldEvents();
    }

    isDuplicateEvent(event) {
        const normalizedPath = String(event.fullPath || '').replace(/\\/g, '/').toLowerCase();
        const eventKey = `${event.actionCode}:${event.exists}:${normalizedPath}`;
        const now = Date.now();
        const lastSeen = this.recentEvents.get(eventKey) || 0;

        this.cleanupRecentEvents(now);

        if (now - lastSeen < this.config.eventDebounceMs) {
            return true;
        }

        this.recentEvents.set(eventKey, now);
        return false;
    }

    cleanupRecentEvents(now = Date.now()) {
        const cutoff = now - Math.max(this.config.eventDebounceMs * 3, 5000);
        for (const [key, timestamp] of this.recentEvents.entries()) {
            if (timestamp < cutoff) {
                this.recentEvents.delete(key);
            }
        }
    }

    shouldIgnore(filePath) {
        const filename = path.basename(filePath);
        const ext = path.extname(filename).toLowerCase();
        const normalizedPath = filePath.replace(/\\/g, '/');

        // ✅ VERIFICAR EXTENSÕES IGNORADAS
        if (this.config.ignoredExtensions.includes(ext)) {
            return true;
        }

        // ✅ VERIFICAR PASTAS IGNORADAS (usando normalizedPath)
        for (const ignoredPath of this.config.ignoredPaths) {
            const normalizedIgnored = ignoredPath.replace(/\\/g, '/');
            if (normalizedPath.includes(normalizedIgnored)) {
                return true;
            }
        }

        // ✅ VERIFICAR PADRÕES IGNORADOS
        if (this.config.ignoredPatterns) {
            for (const pattern of this.config.ignoredPatterns) {
                if (pattern.test(normalizedPath) || pattern.test(filename)) {
                    return true;
                }
            }
        }

        // ✅ VERIFICAR ARQUIVOS TEMPORÁRIOS POR NOME
        if (filename.includes('tmp') ||
            filename.includes('temp') ||
            filename.startsWith('input_') ||
            filename.startsWith('output_')) {
            return true;
        }

        return false;
    }

    isCriticalFile(filename) {
        return this.config.criticalFiles.some(criticalFile =>
            filename.includes(criticalFile)
        );
    }

    getActionText(eventType, exists) {
        if (eventType === 'rename') {
            return exists ? '✅ NOVO' : '⛔ REMOVIDO';
        } else if (eventType === 'change') {
            return '🔄 ATUALIZAÇÃO';
        }
        return '❓ EVENTO DESCONHECIDO';
    }

    getActionCode(eventType, exists) {
        if (eventType === 'rename') return exists ? 'NEW' : 'REMOVED';
        if (eventType === 'change') return 'UPDATED';
        return 'UNKNOWN';
    }

    logEvent(event) {
        // Ignorar eventos de baixa severidade se silentMode ativo
        if (this.silentMode && event.severity === 'low') {
            return;
        }

        const severityColors = {
            low: chalk.gray,
            medium: chalk.yellow,
            high: chalk.red,
            extreme: chalk.bgRed.white
        };

        const color = severityColors[event.severity] || chalk.white;
        const time = new Date(event.timestamp).toLocaleTimeString('pt-BR');

        console.log(
            chalk.gray(`[${time}]`),
            color(`[${event.severity.toUpperCase()}]`),
            color(event.action),
            chalk.cyan(event.filename)
        );
    }

    // eslint-disable-next-line no-unused-vars
    async handleHighSeverityEvent(event) {
        const recentHighEvents = this.suspiciousEvents.filter(e =>
            (e.severity === 'high' || e.severity === 'extreme') &&
            (Date.now() - new Date(e.timestamp).getTime()) < 10 * 60 * 1000
        );

        if (recentHighEvents.length >= this.config.alertThreshold && this.sock) {
            await this.notifyOwner(recentHighEvents);
        }
    }

    async notifyOwner(events) {
        if (!this.sock) return;

        try {
            const config = require('../../config/config');
            const ownerNumber = config.ownerNumber;
            if (!ownerNumber) return;

            const report = this.generateSecurityReport(events);

            for (const owner of config.ownerNumber) {
                await this.sock.sendMessage(owner, { text: report });
            }

            console.log(chalk.red('🚨 Alerta de segurança enviado ao dono!'));
        } catch (error) {
            console.error(chalk.red('❌ Erro ao enviar alerta:'), error);
        }
    }

    generateSecurityReport(events) {
        const timestamp = new Date().toLocaleString('pt-BR');
        let report = `🚨 *ALERTA DE SEGURANÇA*
├─ 📅 Data: ${timestamp}
├─ ⚠️ Eventos detectados: ${events.length}
├─ 🔍 Período: Últimos 10 minutos
└─ 📊 Status: ⚠️ ATENÇÃO NECESSÁRIA

📋 *EVENTOS DETECTADOS:*\n`;

        events.slice(-5).forEach((event, index) => {
            const time = new Date(event.timestamp).toLocaleTimeString('pt-BR');
            const prefix = index === events.length - 1 ? '└─' : '├─';
            report += `${prefix} ${time} - ${event.action}
📁 ${event.filename}\n`;
        });

        report += `\n🔒 *RECOMENDAÇÕES:*
├─ Verificar se as alterações são legítimas
├─ Revisar logs de acesso ao servidor
├─ Confirmar integridade dos arquivos críticos
└─ Investigar atividade suspeita

💡 Use !security status para mais detalhes`;

        return report;
    }

    getStats() {
        const now = Date.now();
        const uptime = now - this.startTime;

        const stats = {
            extreme: 0,
            high: 0,
            medium: 0,
            low: 0
        };

        this.suspiciousEvents.forEach(event => {
            if (Object.prototype.hasOwnProperty.call(stats, event.severity)) stats[event.severity]++;
        });

        return {
            uptime: Math.floor(uptime / 1000),
            totalEvents: this.suspiciousEvents.length,
            watchedPaths: this.config.watchPaths.length,
            activeWatchers: this.watchers.size,
            stats
        };
    }

    cleanOldEvents() {
        const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
        this.suspiciousEvents = this.suspiciousEvents.filter(event =>
            new Date(event.timestamp).getTime() > twentyFourHoursAgo
        );
        this.cleanupRecentEvents();
    }

    setupCleanup() {
        setInterval(() => {
            this.cleanOldEvents();
        }, 60 * 60 * 1000);

        process.on('SIGINT', () => this.cleanup());
        process.on('SIGTERM', () => this.cleanup());
    }

    cleanup() {
        console.log(chalk.yellow('🔄 Parando monitoramento de arquivos...'));
        this.watchers.forEach((watcher, path) => {
            try {
                watcher.close();
                console.log(chalk.green(`✅ Parado: ${path}`));
            } catch (error) {
                console.error(chalk.red(`❌ Erro ao parar ${path}:`), error);
            }
        });
        this.watchers.clear();
    }
}

module.exports = FileWatcher;
