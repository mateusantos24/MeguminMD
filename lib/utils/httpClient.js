const fetch = require('node-fetch');
const isAntibot = require('is-antibot');

function cleanUrl(value) {
    if (value == null) return value;
    const s = String(value).trim();
    const withoutBackticks = s.replace(/^`+|`+$/g, '').trim();
    return withoutBackticks.replace(/^"+|"+$/g, '').trim();
}

function normalizeHeaders(headers) {
    if (!headers) return {};
    if (typeof headers.forEach === 'function') {
        const out = {};
        headers.forEach((v, k) => { out[String(k).toLowerCase()] = String(v); });
        return out;
    }
    return headers;
}

function detectAntibot({ headers = {}, body = '', url = '' } = {}) {
    const result = isAntibot({ headers: normalizeHeaders(headers), body, url });
    const bodyText = String(body || '');
    if (/Sign in to confirm you[’']re not a bot/i.test(bodyText) || /unusual traffic/i.test(bodyText)) {
        return { detected: true, provider: 'youtube' };
    }
    if (result?.detected) return result;
    return { detected: false, provider: null };
}

function buildHeaders(input) {
    const base = {
        'user-agent': 'Mozilla/5.0',
        'accept': '*/*'
    };
    if (!input) return base;
    return { ...base, ...input };
}

async function request(url, opts = {}) {
    const targetUrl = cleanUrl(url);
    if (!targetUrl) throw new Error('URL inválida');

    const timeout = Number.isFinite(opts.timeout) ? opts.timeout : 15000;
    const follow = Number.isFinite(opts.follow) ? opts.follow : 5;
    const method = (opts.method || 'GET').toUpperCase();
    const headers = buildHeaders(opts.headers);

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const id = controller && timeout > 0 ? setTimeout(() => controller.abort(), timeout) : null;

    try {
        return await fetch(targetUrl, {
            method,
            headers,
            body: opts.body,
            redirect: 'follow',
            follow,
            signal: controller?.signal
        });
    } finally {
        if (id) clearTimeout(id);
    }
}

async function fetchText(url, opts = {}) {
    const res = await request(url, opts);
    const text = await res.text();
    const anti = detectAntibot({ headers: res.headers, body: text, url: res.url || url });
    return {
        ok: res.ok,
        statusCode: res.status,
        url: cleanUrl(url),
        finalUrl: cleanUrl(res.url || url),
        headers: res.headers,
        text,
        antibot: anti
    };
}

async function fetchJson(url, opts = {}) {
    const res = await request(url, opts);
    const text = await res.text();
    const anti = detectAntibot({ headers: res.headers, body: text, url: res.url || url });
    let data = null;
    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        data = null;
    }
    return {
        ok: res.ok,
        statusCode: res.status,
        url: cleanUrl(url),
        finalUrl: cleanUrl(res.url || url),
        headers: res.headers,
        data,
        text,
        antibot: anti
    };
}

async function fetchBuffer(url, opts = {}) {
    const res = await request(url, opts);
    const ab = await res.arrayBuffer();
    const buffer = Buffer.from(ab);
    const anti = detectAntibot({ headers: res.headers, body: '', url: res.url || url });
    return {
        ok: res.ok,
        statusCode: res.status,
        url: cleanUrl(url),
        finalUrl: cleanUrl(res.url || url),
        headers: res.headers,
        buffer,
        antibot: anti
    };
}

async function fetchHead(url, opts = {}) {
    // 1ª tentativa: HEAD
    const res = await request(url, { ...opts, method: 'HEAD' });

    // alguns servidores retornam 301/302 e HEAD ok, beleza.
    // mas alguns retornam 405 (Method Not Allowed), 403 (Cloudflare), 429 etc.
    let anti = detectAntibot({ headers: res.headers, body: '', url: res.url || url });

    // Se HEAD não for permitido ou vier bloqueio/rate-limit, faça fallback GET leve (Range)
    const shouldFallback =
    res.status === 405 || // HEAD não permitido
    res.status === 403 || // bloqueio (ex: Cloudflare)
    res.status === 429 || // rate limit
    res.status >= 500;    // erro do servidor / proxy / waf

    if (shouldFallback) {
    // GET “barato”: pega só os primeiros bytes pra detectar antibot pelo HTML
        const getRes = await request(url, {
            ...opts,
            method: 'GET',
            headers: {
                ...(opts.headers || {}),
                // Range reduz tráfego (nem todo servidor respeita, mas ajuda quando respeita)
                Range: 'bytes=0-4095',
                // às vezes ajuda com WAFs simples
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            }
        });

        const text = await getRes.text().catch(() => '');
        anti = detectAntibot({ headers: getRes.headers, body: text, url: getRes.url || url });

        return {
            ok: getRes.ok,
            statusCode: getRes.status,
            url: cleanUrl(url),
            finalUrl: cleanUrl(getRes.url || url),
            headers: getRes.headers,
            antibot: anti,
            // opcional: devolve um pedacinho do HTML pra debug
            textPreview: text ? text.slice(0, 300) : ''
        };
    }

    return {
        ok: res.ok,
        statusCode: res.status,
        url: cleanUrl(url),
        finalUrl: cleanUrl(res.url || url),
        headers: res.headers,
        antibot: anti
    };
}

module.exports = {
    request,
    fetchText,
    fetchJson,
    fetchBuffer,
    fetchHead,
    detectAntibot
};
