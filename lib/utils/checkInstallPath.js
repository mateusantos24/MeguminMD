const path = require('path');

function isRootUser() {
    try {
        return typeof process.getuid === 'function' && process.getuid() === 0;
    } catch {
        return false;
    }
}

function normalizePath(value) {
    return String(value || '')
        .replace(/\\/g, '/')
        .replace(/\/+$/, '')
        .toLowerCase();
}

function isSharedAndroidPath(targetPath) {
    const normalized = normalizePath(targetPath);
    const blockedPrefixes = [
        '/sdcard',
        '/storage/emulated/0',
        '/storage/self/primary',
        '/mnt/sdcard',
        '/storage'
    ];

    return blockedPrefixes.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`));
}

function main() {
    if (process.env.MEGUMIN_ALLOW_SHARED_STORAGE_INSTALL === '1') {
        return;
    }

    if (isRootUser()) {
        return;
    }

    const installPath = process.env.INIT_CWD || process.cwd();
    const resolvedPath = path.resolve(installPath);

    if (!isSharedAndroidPath(resolvedPath)) {
        return;
    }

    console.error('');
    console.error('[-] Instalacao bloqueada neste caminho do Android.');
    console.error('');
    console.error(`Caminho atual: ${resolvedPath}`);
    console.error('');
    console.error('Motivo: o npm precisa criar symlinks em node_modules/.bin, e /sdcard/Download costuma falhar com EACCES.');
    console.error('');
    console.error('Use a pasta interna do Termux:');
    console.error('  cd ~/MeguminMD');
    console.error('  npm install --omit=optional');
    console.error('');
    console.error('A copia em /sdcard deve ser usada apenas para abrir no gerenciador de arquivos.');
    console.error('');
    console.error('Se voce sabe o que esta fazendo e quer forcar mesmo assim:');
    console.error('  MEGUMIN_ALLOW_SHARED_STORAGE_INSTALL=1 npm install --omit=optional');
    console.error('');
    process.exit(1);
}

main();
