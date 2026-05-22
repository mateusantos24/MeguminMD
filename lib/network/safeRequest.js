const axios = require('axios');
const https = require('https');
const isAntibot = require('is-antibot');

const httpsAgent = new https.Agent({
    keepAlive: true,
    family: 4
});

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function detectAntibotFromAxiosResponse(response) {
    try {
        const url = response?.request?.res?.responseUrl || response?.config?.url;
        const headers = response?.headers || {};
        const contentType = String(headers['content-type'] || '').toLowerCase();

        let body;
        if (typeof response?.data === 'string') {
            body = response.data.slice(0, 50000);
        } else if (contentType.includes('text/html')) {
            const buf = Buffer.isBuffer(response?.data) ? response.data : Buffer.from(response?.data || []);
            body = buf.slice(0, 50000).toString('utf8');
        }

        const result = isAntibot(body ? { headers, body, url } : { headers, url });
        return result?.detected ? result : null;
    } catch {
        return null;
    }
}

function normalizeUrl(input) {
    if (!input) return null;
    const s = String(input).trim().replace(/^`+|`+$/g, '').replace(/^"+|"+$/g, '').trim();
    try {
        const u = new URL(s);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
        return u.toString();
    } catch {
        return null;
    }
}

function computeReferer(targetUrl, referer) {
    const cleaned = normalizeUrl(referer);
    if (cleaned) return cleaned;
    try {
        const u = new URL(targetUrl);
        const host = u.hostname.toLowerCase();
        if (host.includes('instagram.') || host.includes('cdninstagram.') || host.includes('fbcdn.') || host.includes('facebook.') || host.includes('threads.')) {
            return 'https://www.instagram.com/';
        }
        return `${u.protocol}//${u.host}/`;
    } catch {
        return 'https://www.instagram.com/';
    }
}

async function getBuffer(url, opts = {}) {
    const targetUrl = normalizeUrl(url);
    if (!targetUrl) throw new Error('URL inválida');

    const retries = Number.isFinite(opts.retries) ? Math.max(1, opts.retries) : 4;
    const baseTimeout = Number.isFinite(opts.timeout) ? Math.max(1, opts.timeout) : 20000;
    const maxRedirects = Number.isFinite(opts.maxRedirects) ? Math.max(0, opts.maxRedirects) : 5;
    const maxBytes = Number.isFinite(opts.maxBytes) ? Math.max(1, opts.maxBytes) : 5 * 1024 * 1024;

    const headers = {
        'User-Agent': opts.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': opts.accept || '*/*',
        'Referer': computeReferer(targetUrl, opts.referer),
        ...(opts.headers || {})
    };

    let lastErr = null;
    for (let attempt = 1; attempt <= retries; attempt++) {
        const timeout = Math.min(60000, baseTimeout + (attempt - 1) * 8000);
        try {
            const response = await axios.get(targetUrl, {
                httpsAgent: opts.httpsAgent || httpsAgent,
                responseType: 'arraybuffer',
                timeout,
                maxRedirects,
                maxContentLength: maxBytes,
                maxBodyLength: maxBytes,
                headers,
                validateStatus: () => true
            });

            const antibot = detectAntibotFromAxiosResponse(response);
            if (antibot) throw new Error(`Antibot detectado (${antibot.provider || 'desconhecido'})`);

            const status = Number(response.status || 0);
            if (status < 200 || status >= 400) {
                const err = new Error(`Status ${status || 'desconhecido'}`);
                err.statusCode = status;
                err.response = response;
                throw err;
            }

            const buffer = Buffer.from(response.data || []);
            if (!buffer.length) throw new Error('Arquivo vazio');
            if (buffer.length > maxBytes) throw new Error('Arquivo excede o limite permitido');
            return { buffer, statusCode: status, headers: response.headers, finalUrl: response?.request?.res?.responseUrl || targetUrl };
        } catch (e) {
            lastErr = e;
            const code = String(e?.code || '');
            const statusCode = Number(e?.statusCode || e?.response?.status || 0);

            const retryableCode = ['ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN', 'ENOTFOUND', 'ECONNREFUSED', 'ERR_SOCKET_CLOSED'].includes(code);
            const retryableStatus = statusCode === 403 || statusCode === 408 || statusCode === 425 || statusCode === 429 || statusCode >= 500;

            const shouldRetry = attempt < retries && (retryableCode || retryableStatus);
            if (!shouldRetry) break;
            await sleep(800 * attempt);
        }
    }
    throw lastErr || new Error('Falha ao baixar conteúdo');
}

module.exports = {
    httpsAgent,
    detectAntibotFromAxiosResponse,
    getBuffer
};
