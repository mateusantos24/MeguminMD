const fetch = require('node-fetch');
const { detectAntibot: detectAntibotSignal } = require('../network/antibotDetector');

function cleanUrl(value) {
    if (value == null) return value;
    const s = String(value).trim();
    const withoutBackticks = s.replace(/^`+|`+$/g, '').trim();
    return withoutBackticks.replace(/^"+|"+$/g, '').trim();
}

function detectAntibot({ headers = {}, body = '', url = '' } = {}) {
    return detectAntibotSignal({ headers, body, url });
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
    if (!targetUrl) throw new Error('URL invalida');

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
    const res = await request(url, { ...opts, method: 'HEAD' });
    let anti = detectAntibot({ headers: res.headers, body: '', url: res.url || url });

    const shouldFallback =
        res.status === 405 ||
        res.status === 403 ||
        res.status === 429 ||
        res.status >= 500;

    if (shouldFallback) {
        const getRes = await request(url, {
            ...opts,
            method: 'GET',
            headers: {
                ...(opts.headers || {}),
                Range: 'bytes=0-4095',
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
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
