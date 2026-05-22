const successCache = new Map();
const failureCache = new Map();
const inflightCache = new Map();

const DEFAULT_SUCCESS_TTL_MS = 10 * 60 * 1000;
const DEFAULT_FAILURE_TTL_MS = 30 * 1000;
const DEFAULT_TIMEOUT_MS = 3000;

function buildCacheKey(jid, type) {
    return `${String(jid || '').trim()}|${String(type || 'image').trim()}`;
}

function withTimeout(label, ms, task) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`${label} excedeu ${ms}ms`));
        }, ms);

        if (typeof timer.unref === 'function') {
            timer.unref();
        }

        Promise.resolve()
            .then(() => (typeof task === 'function' ? task() : task))
            .then((result) => {
                clearTimeout(timer);
                resolve(result);
            })
            .catch((error) => {
                clearTimeout(timer);
                reject(error);
            });
    });
}

function getFreshCacheEntry(cache, key) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
        cache.delete(key);
        return null;
    }
    return entry;
}

async function resolveProfilePictureUrl(sock, jid, type = 'image', options = {}) {
    const cacheKey = buildCacheKey(jid, type);
    const successTtlMs = Number(options.successTtlMs || DEFAULT_SUCCESS_TTL_MS);
    const failureTtlMs = Number(options.failureTtlMs || DEFAULT_FAILURE_TTL_MS);
    const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);
    const forceRefresh = options.forceRefresh === true;

    if (!sock || !jid) {
        throw new Error('Sock e jid sao obrigatorios para resolveProfilePictureUrl');
    }

    if (!forceRefresh) {
        const successEntry = getFreshCacheEntry(successCache, cacheKey);
        if (successEntry?.url) {
            return successEntry.url;
        }

        const failureEntry = getFreshCacheEntry(failureCache, cacheKey);
        if (failureEntry?.error) {
            throw failureEntry.error;
        }

        const pending = inflightCache.get(cacheKey);
        if (pending) {
            return await pending;
        }
    }

    const pendingPromise = withTimeout(`profilePictureUrl(${jid})`, timeoutMs, () => sock.profilePictureUrl(jid, type))
        .then((url) => {
            const normalizedUrl = String(url || '').trim();
            if (!normalizedUrl) {
                const error = new Error(`profilePictureUrl(${jid}) retornou vazio`);
                failureCache.set(cacheKey, {
                    error,
                    expiresAt: Date.now() + failureTtlMs
                });
                throw error;
            }

            successCache.set(cacheKey, {
                url: normalizedUrl,
                expiresAt: Date.now() + successTtlMs
            });
            failureCache.delete(cacheKey);
            return normalizedUrl;
        })
        .catch((error) => {
            failureCache.set(cacheKey, {
                error,
                expiresAt: Date.now() + failureTtlMs
            });
            throw error;
        })
        .finally(() => {
            inflightCache.delete(cacheKey);
        });

    inflightCache.set(cacheKey, pendingPromise);
    return await pendingPromise;
}

function clearProfilePictureCache(jid = null, type = null) {
    if (!jid) {
        successCache.clear();
        failureCache.clear();
        inflightCache.clear();
        return;
    }

    const keyPrefix = `${String(jid).trim()}|`;
    for (const key of [...successCache.keys(), ...failureCache.keys(), ...inflightCache.keys()]) {
        if (!key.startsWith(keyPrefix)) continue;
        if (type && key !== buildCacheKey(jid, type)) continue;
        successCache.delete(key);
        failureCache.delete(key);
        inflightCache.delete(key);
    }
}

module.exports = {
    clearProfilePictureCache,
    resolveProfilePictureUrl
};
