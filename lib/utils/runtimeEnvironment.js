const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');

function safeReadFile(filePath) {
    try {
        if (!fs.existsSync(filePath)) return '';
        return fs.readFileSync(filePath, 'utf8');
    } catch {
        return '';
    }
}

function safeExec(command, args = []) {
    try {
        return execFileSync(command, args, {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
            timeout: 1200,
            windowsHide: true
        }).trim();
    } catch {
        return '';
    }
}

function detectTermux(env) {
    const prefix = String(env.PREFIX || '').toLowerCase();
    const home = String(env.HOME || '').toLowerCase();

    return Boolean(
        env.TERMUX_VERSION ||
        env.TERMUX_APP_PID ||
        prefix.includes('com.termux/files/usr') ||
        home.includes('com.termux/files/home')
    );
}

function detectAndroid(env, isTermux) {
    if (isTermux) return true;

    const hasAndroidEnv = Boolean(env.ANDROID_ROOT || env.ANDROID_DATA || env.ANDROID_RUNTIME_ROOT);
    if (hasAndroidEnv) return true;

    return fs.existsSync('/system/build.prop') || fs.existsSync('/system/bin/getprop');
}

function readAndroidProp(propName) {
    return safeExec('getprop', [propName]);
}

function detectAndroidDeviceInfo(isAndroid) {
    if (!isAndroid) {
        return {
            manufacturer: '',
            model: '',
            device: '',
            release: ''
        };
    }

    const manufacturer = readAndroidProp('ro.product.manufacturer');
    const model = readAndroidProp('ro.product.model');
    const device = readAndroidProp('ro.product.device');
    const release = readAndroidProp('ro.build.version.release');

    return {
        manufacturer,
        model,
        device,
        release
    };
}

function detectContainer() {
    if (fs.existsSync('/.dockerenv')) return 'docker';

    const cgroup = safeReadFile('/proc/1/cgroup').toLowerCase();
    if (!cgroup) return '';
    if (cgroup.includes('docker')) return 'docker';
    if (cgroup.includes('kubepods')) return 'kubernetes';
    if (cgroup.includes('containerd')) return 'containerd';
    if (cgroup.includes('lxc')) return 'lxc';
    return '';
}

function detectVirtualization() {
    const detected = safeExec('systemd-detect-virt');
    if (detected) return detected.toLowerCase();

    const cpuinfo = safeReadFile('/proc/cpuinfo').toLowerCase();
    if (cpuinfo.includes('hypervisor')) return 'hypervisor';

    return '';
}

function detectRuntimeEnvironment() {
    const env = process.env;
    const platform = process.platform;
    const hostname = os.hostname();
    const isWindows = platform === 'win32';
    const isMac = platform === 'darwin';
    const isLinux = platform === 'linux';
    const isTermux = isLinux && detectTermux(env);
    const isAndroid = isLinux && detectAndroid(env, isTermux);
    const androidInfo = detectAndroidDeviceInfo(isAndroid);
    const containerType = isLinux ? detectContainer() : '';
    const virtualization = isLinux ? detectVirtualization() : '';
    const hasGuiSession = Boolean(env.DISPLAY || env.WAYLAND_DISPLAY || env.DESKTOP_SESSION);
    const isRemoteShell = Boolean(env.SSH_CONNECTION || env.SSH_CLIENT || env.SSH_TTY);

    let environmentType = 'Desconhecido';
    let deviceLabel = '';

    if (isTermux) {
        environmentType = 'Termux';
        deviceLabel = [androidInfo.manufacturer, androidInfo.model].filter(Boolean).join(' ').trim() || 'Android';
    } else if (isAndroid) {
        environmentType = 'Android';
        deviceLabel = [androidInfo.manufacturer, androidInfo.model].filter(Boolean).join(' ').trim() || 'Android';
    } else if (isWindows) {
        environmentType = 'PC local';
        deviceLabel = 'Windows';
    } else if (isMac) {
        environmentType = 'Mac local';
        deviceLabel = 'macOS';
    } else if (isLinux) {
        if (containerType) {
            environmentType = 'Container';
            deviceLabel = containerType;
        } else if (isRemoteShell || virtualization) {
            environmentType = 'VPS/Servidor';
            deviceLabel = virtualization || 'linux';
        } else if (hasGuiSession) {
            environmentType = 'PC Linux';
            deviceLabel = 'Linux desktop';
        } else {
            environmentType = 'Linux';
            deviceLabel = 'Linux';
        }
    }

    const systemLabel = isAndroid && androidInfo.release
        ? `Android ${androidInfo.release}`
        : (isWindows ? 'Windows' : platform);

    const details = [];
    if (androidInfo.device) details.push(`device:${androidInfo.device}`);
    if (containerType) details.push(`container:${containerType}`);
    if (virtualization) details.push(`virt:${virtualization}`);
    if (isRemoteShell) details.push('ssh');

    return {
        platform,
        hostname,
        isWindows,
        isMac,
        isLinux,
        isTermux,
        isAndroid,
        isRemoteShell,
        containerType,
        virtualization,
        environmentType,
        systemLabel,
        deviceLabel,
        androidInfo,
        detailsLabel: details.join(' | ')
    };
}

module.exports = {
    detectRuntimeEnvironment
};
