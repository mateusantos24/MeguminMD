const albums = new Map();

function makeKey(remoteJid, parentId) {
    return `${remoteJid}:${parentId}`;
}

function cleanOld(maxAgeMs = 2 * 60 * 1000) {
    const now = Date.now();
    for (const [k, v] of albums.entries()) {
        if (!v || (now - (v.updatedAt || v.createdAt || now)) > maxAgeMs) albums.delete(k);
    }
}

function ensure(remoteJid, parentId) {
    cleanOld();
    const key = makeKey(remoteJid, parentId);
    let album = albums.get(key);
    if (!album) {
        album = {
            remoteJid,
            parentId,
            expectedImageCount: 0,
            expectedVideoCount: 0,
            items: [],
            itemIds: new Set(),
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        albums.set(key, album);
    }
    return album;
}

function setExpected(remoteJid, parentId, expectedImageCount = 0, expectedVideoCount = 0) {
    const album = ensure(remoteJid, parentId);
    album.expectedImageCount = Number(expectedImageCount) || 0;
    album.expectedVideoCount = Number(expectedVideoCount) || 0;
    album.updatedAt = Date.now();
    return album;
}

function addItem(remoteJid, parentId, msg) {
    const album = ensure(remoteJid, parentId);
    const id = msg?.key?.id;
    if (!id || album.itemIds.has(id)) return album;
    album.itemIds.add(id);
    album.items.push(msg);
    if (album.items.length > 30) album.items.shift();
    album.updatedAt = Date.now();
    return album;
}

function get(remoteJid, parentId) {
    cleanOld();
    const key = makeKey(remoteJid, parentId);
    const album = albums.get(key);
    if (!album) return null;
    return {
        remoteJid: album.remoteJid,
        parentId: album.parentId,
        expectedImageCount: album.expectedImageCount,
        expectedVideoCount: album.expectedVideoCount,
        expectedTotal: (album.expectedImageCount || 0) + (album.expectedVideoCount || 0),
        count: album.items.length,
        items: album.items.slice()
    };
}

function findParentIdByItemId(remoteJid, itemId) {
    cleanOld();
    if (!remoteJid || !itemId) return null;
    for (const album of albums.values()) {
        if (!album || album.remoteJid !== remoteJid) continue;
        for (const it of album.items || []) {
            if (it?.key?.id === itemId) return album.parentId;
        }
    }
    return null;
}

module.exports = {
    setExpected,
    addItem,
    get,
    findParentIdByItemId
};
