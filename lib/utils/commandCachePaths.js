const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const COMMAND_CACHE_ROOT = path.join(PROJECT_ROOT, 'data', 'Cache');

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
    return dirPath;
}

function normalizeScope(scope) {
    return String(scope || '').trim();
}

function getCommandCacheDir(scope, ...segments) {
    return path.join(COMMAND_CACHE_ROOT, normalizeScope(scope), ...segments);
}

function ensureCommandCacheDir(scope, ...segments) {
    return ensureDir(getCommandCacheDir(scope, ...segments));
}

function getCommandCacheFile(scope, ...segments) {
    return path.join(COMMAND_CACHE_ROOT, normalizeScope(scope), ...segments);
}

const DOWNLOAD_CACHE_DIR = getCommandCacheDir('download');
const GAMES_CACHE_DIR = getCommandCacheDir('games');
const STICKER_CACHE_DIR = getCommandCacheDir('sticker');
const SUPERCELL_CACHE_DIR = getCommandCacheDir('supercell');
const SUPERCELL_BSINFOX_CACHE_DIR = getCommandCacheDir('supercell', 'bsinfox');
const SUPERCELL_BRAWLERS_CACHE_PATH = getCommandCacheFile('supercell', 'brawlers.json');
const SUPERCELL_BRAWLERROR_PATH = getCommandCacheFile('supercell', 'brawlerror.png');
const SUPERCELL_MEGAPIG_ICON_PATH = getCommandCacheFile('supercell', 'megapig.png');
const SUPERCELL_WINS_ICON_PATH = getCommandCacheFile('supercell', 'icon_club_league_point.png');
const UTILITARIOS_CACHE_DIR = getCommandCacheDir('utilitarios');
const VIP_CACHE_DIR = getCommandCacheDir('vip');

module.exports = {
    PROJECT_ROOT,
    COMMAND_CACHE_ROOT,
    ensureDir,
    getCommandCacheDir,
    ensureCommandCacheDir,
    getCommandCacheFile,
    DOWNLOAD_CACHE_DIR,
    GAMES_CACHE_DIR,
    STICKER_CACHE_DIR,
    SUPERCELL_CACHE_DIR,
    SUPERCELL_BSINFOX_CACHE_DIR,
    SUPERCELL_BRAWLERS_CACHE_PATH,
    SUPERCELL_BRAWLERROR_PATH,
    SUPERCELL_MEGAPIG_ICON_PATH,
    SUPERCELL_WINS_ICON_PATH,
    UTILITARIOS_CACHE_DIR,
    VIP_CACHE_DIR
};
