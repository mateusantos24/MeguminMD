function normalizeHeaders(headers) {
    if (!headers) return {};
    if (typeof headers.forEach === 'function') {
        const out = {};
        headers.forEach((value, key) => {
            out[String(key).toLowerCase()] = String(value || '');
        });
        return out;
    }

    const out = {};
    for (const [key, value] of Object.entries(headers)) {
        out[String(key).toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value || '');
    }
    return out;
}

function detectAntibot({ headers = {}, body = '', url = '' } = {}) {
    const normalizedHeaders = normalizeHeaders(headers);
    const bodyText = String(body || '').slice(0, 50000).toLowerCase();
    const urlText = String(url || '').toLowerCase();
    const server = String(normalizedHeaders.server || '').toLowerCase();
    const cfRay = String(normalizedHeaders['cf-ray'] || '');

    if (cfRay || server.includes('cloudflare')) {
        if (
            bodyText.includes('attention required') ||
            bodyText.includes('cf-browser-verification') ||
            bodyText.includes('why do i have to complete a captcha') ||
            bodyText.includes('checking your browser before accessing') ||
            bodyText.includes('/cdn-cgi/challenge-platform/')
        ) {
            return { detected: true, provider: 'cloudflare' };
        }
    }

    if (
        bodyText.includes('captcha') ||
        bodyText.includes('recaptcha') ||
        bodyText.includes('hcaptcha') ||
        bodyText.includes('access denied') ||
        bodyText.includes('request blocked') ||
        bodyText.includes('automated queries') ||
        bodyText.includes('unusual traffic') ||
        bodyText.includes('verify you are human') ||
        bodyText.includes('press and hold') ||
        bodyText.includes('ddos-guard')
    ) {
        return { detected: true, provider: 'generic' };
    }

    if (
        bodyText.includes('sign in to confirm you') ||
        bodyText.includes('before you continue to youtube') ||
        urlText.includes('consent.youtube.com')
    ) {
        return { detected: true, provider: 'youtube' };
    }

    return { detected: false, provider: null };
}

module.exports = {
    detectAntibot,
    normalizeHeaders
};
