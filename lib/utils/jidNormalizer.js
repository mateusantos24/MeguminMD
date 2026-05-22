function toLowerTrim(x) {
    if (x === null || x === undefined) return '';
    return String(x).toLowerCase().trim();
}

function extractBase(x) {
    const s = toLowerTrim(x);
    if (!s) return null;
    const beforeAt = s.split('@')[0];
    const beforeColon = beforeAt.split(':')[0];
    return beforeColon || null;
}

function extractDigits(x) {
    const base = extractBase(x);
    if (!base) return null;
    const digits = base.replace(/\D/g, '');
    return digits || null;
}

function detectType(x) {
    const s = toLowerTrim(x);
    if (!s) return null;
    if (s.includes('@s.whatsapp.net') || s.includes('@c.us')) return 'pn';
    if (s.includes('@bot')) return 'bot';
    if (s.includes('@lid')) return 'lid';
    if (s.includes('@g.us')) return 'group';
    if (s.includes('@newsletter')) return 'newsletter';
    if (/^\d{7,20}$/.test(s)) return 'number';
    return null;
}

function normalizePN(x) {
    const digits = extractDigits(x);
    if (!digits) return null;
    return `${digits}@s.whatsapp.net`;
}

function normalizeBot(x) {
    const s = toLowerTrim(x);
    if (!s) return null;
    if (s.endsWith('@bot')) {
        const base = extractBase(s);
        return base ? `${base}@bot` : null;
    }
    const digits = extractDigits(s);
    if (!digits) return null;
    return `${digits}@bot`;
}

function normalizeLID(x) {
    const type = detectType(x);
    if (!type || type === 'group' || type === 'newsletter' || type === 'bot') return null;
    const digits = extractDigits(x);
    if (!digits) return null;
    return `${digits}@lid`;
}

function normalizeByRules(x, rules = {}) {
    const allowLidPn = rules.allowLidPn !== false;
    const allowBot = rules.bot === true;
    const onlyLid = rules.onlyLid === true;
    const onlyPn = rules.onlyPn === true;
    const type = detectType(x);
    const digits = extractDigits(x);
    if (type === 'bot') return allowBot ? normalizeBot(x) : null;
    if (!digits) return null;
    if (type === 'group' || type === 'newsletter') return null;

    if (onlyLid) {
        if (type === 'pn') return null;
        return normalizeLID(x);
    }
    if (onlyPn) {
        if (type === 'lid') return null;
        return normalizePN(digits);
    }

    if (type === 'pn') return allowLidPn ? normalizePN(digits) : null;
    if (type === 'lid') return normalizeLID(x);
    if (type === 'number') return allowLidPn ? normalizePN(digits) : null;
    return null;
}

function buildCandidates(x, rules = {}) {
    const allowLidPn = rules.allowLidPn !== false;
    const allowBot = rules.bot === true;
    const onlyLid = rules.onlyLid === true;
    const onlyPn = rules.onlyPn === true;
    const type = detectType(x);

    if (type === 'bot') {
        return allowBot ? [normalizeBot(x)].filter(Boolean) : [];
    }

    const digits = extractDigits(x);
    if (!digits) return [];

    const out = [];
    const add = (v) => {
        if (!v) return;
        if (!out.includes(v)) out.push(v);
    };

    if (onlyLid) {
        add(normalizeLID(x));
        return out;
    }
    if (onlyPn) {
        add(normalizePN(digits));
        return out;
    }

    if (type === 'lid') {
        add(normalizeLID(x));
        if (allowLidPn) add(normalizePN(digits));
        return out;
    }

    if (type === 'pn') {
        if (allowLidPn) {
            add(normalizePN(digits));
            add(normalizeLID(digits));
        }
        return out;
    }

    if (type === 'number') {
        if (allowLidPn) {
            add(normalizePN(digits));
            add(normalizeLID(digits));
        }
        return out;
    }

    return out;
}

module.exports = {
    detectType,
    extractDigits,
    normalizeBot,
    normalizePN,
    normalizeLID,
    normalizeByRules,
    buildCandidates,
};
