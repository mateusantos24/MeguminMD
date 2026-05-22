function removeArguments(input) {
    if (typeof input !== 'string') return '';
    const match = input.match(/(?<=\s|^)(-{1,2}[a-zA-Z][a-zA-Z0-9]*)(?=\s|$)/);
    if (!match) return input.trim();
    return input.slice(0, input.indexOf(match[0])).trim();
}
function parseArksOptions(defaultOptions, arks) {
    const parsed = { ...defaultOptions };
    const tokens = String(arks || '').trim().split(/\s+/).filter(Boolean);
    let key = null, values = [];
    const flush = () => {
        if (!key) return;
        const clean = key.replace(/^-+/, '').toLowerCase();
        if (!Object.prototype.hasOwnProperty.call(defaultOptions, clean)) { key = null; values = []; return; }
        const current = defaultOptions[clean];
        if (typeof current === 'boolean') parsed[clean] = values.length ? values.join(' ').toLowerCase() !== 'false' : true;
        else if (typeof current === 'number') parsed[clean] = Number(values.join(' ')) || current;
        else if (Array.isArray(current)) parsed[clean] = values.join(' ').split('|').map(v => v.trim()).filter(Boolean);
        else parsed[clean] = values.join(' ');
        key = null; values = [];
    };
    for (const token of tokens) { if (/^-{1,2}[a-zA-Z]/.test(token)) { flush(); key = token; } else if (key) values.push(token); }
    flush();
    return parsed;
}
function exclusiveTrue(obj) { const keys = Object.keys(obj).filter(key => obj[key] === true); if (keys.length > 1) Object.keys(obj).forEach(key => { obj[key] = key === keys[0]; }); return obj; }
module.exports = { removeArguments, parseArksOptions, exclusiveTrue };
