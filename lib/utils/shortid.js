// lib/utils/shortid.js
const crypto = require('crypto');
const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function toBase62(buf) {
    let num = BigInt('0x' + buf.toString('hex'));
    let out = '';
    while (num > 0n) {
        out = ALPHABET[Number(num % 62n)] + out;
        num /= 62n;
    }
    return out || '0';
}

function genShortIdStable(longId, size = 8) {
    const hash = crypto.createHash('sha1').update(String(longId)).digest();
    return toBase62(hash).slice(0, size);
}

module.exports = { genShortIdStable };
