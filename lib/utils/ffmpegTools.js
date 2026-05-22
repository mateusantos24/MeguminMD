const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");
const sharp = require("sharp");

let FFMPEG_BIN = "ffmpeg";
try {
    const ff = require("@ffmpeg-installer/ffmpeg");
    if (ff?.path) FFMPEG_BIN = ff.path;
} catch { /* empty */ }

let FFPROBE_BIN = "ffprobe";
try {
    const ffprobe = require("@ffprobe-installer/ffprobe");
    if (ffprobe?.path) FFPROBE_BIN = ffprobe.path;
} catch { /* empty */ }

function tmp(ext) {
    return path.join(os.tmpdir(), `hanako_${Date.now()}_${Math.random().toString(16).slice(2)}${ext}`);
}

function run(args) {
    return new Promise((resolve, reject) => {
        const p = spawn(FFMPEG_BIN, args, { stdio: ["ignore", "ignore", "pipe"] });
        let err = "";
        p.stderr.on("data", (d) => (err += d.toString()));
        p.on("error", reject);
        p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(err || `ffmpeg exit ${code}`))));
    });
}

function runWithOutput(bin, args) {
    return new Promise((resolve, reject) => {
        const p = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
        let out = "";
        let err = "";

        p.stdout.on("data", (d) => (out += d.toString()));
        p.stderr.on("data", (d) => (err += d.toString()));
        p.on("error", reject);
        p.on("close", (code) => {
            if (code === 0) resolve({ stdout: out, stderr: err });
            else reject(new Error(err || `${path.basename(bin)} exit ${code}`));
        });
    });
}

async function anyToPng(buffer, sizeOrOptions = null) {
    const options = typeof sizeOrOptions === 'object' && sizeOrOptions !== null
        ? sizeOrOptions
        : { size: sizeOrOptions };
    const size = Number(options.size) || null;
    const fitMode = String(options.fit || 'contain').toLowerCase() === 'cover' ? 'cover' : 'contain';

    // Tenta primeiro com sharp para cobrir WebP estatico e animado.
    // Em stickers animados, usamos apenas o primeiro frame para gerar uma imagem.
    try {
        let image = sharp(buffer, {
            animated: true,
            failOn: 'none',
            page: 0,
            pages: 1
        });

        if (size) {
            image = image.resize(size, size, {
                fit: fitMode,
                background: { r: 255, g: 255, b: 255, alpha: 0 }
            });
        }

        const sharpResult = await image.png().toBuffer();
        if (sharpResult && sharpResult.length > 0) return sharpResult;
    } catch {
        // fallback para ffmpeg abaixo
    }

    const inFile = tmp(".bin");
    const outFile = tmp(".png");
    fs.writeFileSync(inFile, buffer);

    const vf = size
        ? (fitMode === 'cover'
            ? `scale=${size}:${size}:force_original_aspect_ratio=increase,crop=${size}:${size},format=rgba,setsar=1`
            : `scale=${size}:${size}:force_original_aspect_ratio=decrease,format=rgba,pad=${size}:${size}:(ow-iw)/2:(oh-ih)/2:color=#FFFFFF00,setsar=1`)
        : `format=rgba,setsar=1`;

    try {
        await run([
            "-y",
            "-i", inFile,
            "-vf", vf,
            "-frames:v", "1",
            "-an",
            outFile
        ]);
        return fs.readFileSync(outFile);
    } finally {
        try { fs.unlinkSync(inFile); } catch { /* empty */ }
        try { fs.unlinkSync(outFile); } catch { /* empty */ }
    }
}

// eslint-disable-next-line no-unused-vars
async function anyToJpeg(buffer, size = 200, quality = 80) {
    const inFile = tmp(".bin");
    const outFile = tmp(".jpg");
    fs.writeFileSync(inFile, buffer);

    const vf = `scale=${size}:${size}:force_original_aspect_ratio=increase,crop=${size}:${size},format=yuv420p`;

    try {
        await run(["-y", "-i", inFile, "-vf", vf, "-an", "-q:v", "3", outFile]);
        return fs.readFileSync(outFile);
    } finally {
        try { fs.unlinkSync(inFile); } catch { /* empty */ }
        try { fs.unlinkSync(outFile); } catch { /* empty */ }
    }
}

async function anyToWebpSticker(buffer, { size = 512, q = 75 } = {}) {
    // Tenta primeiro com sharp (excelente para imagens estáticas e animadas, evita bugs de ffmpeg antigo)
    try {
        const result = await sharp(buffer, { animated: true, failOn: 'none' })
            .resize(size, size, {
                fit: 'contain',
                background: { r: 0, g: 0, b: 0, alpha: 0 }
            })
            .webp({ quality: Math.max(0, Math.min(100, q)), effort: 0 })
            .toBuffer();
        if (result && result.length > 0) return result;
    } catch {
        // Fallback para ffmpeg (útil se for um vídeo, que o sharp não processa)
    }

    const inFile = tmp(".bin");
    const outFile = tmp(".webp");
    fs.writeFileSync(inFile, buffer);

    const vf =
    `scale=${size}:${size}:force_original_aspect_ratio=decrease,` +
    `format=rgba,pad=${size}:${size}:(ow-iw)/2:(oh-ih)/2:color=#00000000,setsar=1`;

    try {
        await run([
            "-y", "-i", inFile,
            "-vf", vf,
            "-an",
            "-c:v", "libwebp",
            "-lossless", "0",
            "-q:v", String(q),
            "-preset", "picture",
            "-loop", "0",
            outFile
        ]);
        return fs.readFileSync(outFile);
    } finally {
        try { fs.unlinkSync(inFile); } catch { /* empty */ }
        try { fs.unlinkSync(outFile); } catch { /* empty */ }
    }
}

async function getMediaDurationSeconds(buffer, { ext = ".mp4" } = {}) {
    const inFile = tmp(ext);
    fs.writeFileSync(inFile, buffer);

    try {
        const { stdout } = await runWithOutput(FFPROBE_BIN, [
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "json",
            inFile
        ]);

        const parsed = JSON.parse(stdout || "{}");
        const duration = Number(parsed?.format?.duration || 0);
        return Number.isFinite(duration) && duration > 0 ? duration : 0;
    } finally {
        try { fs.unlinkSync(inFile); } catch { /* empty */ }
    }
}

async function clipVideoToSeconds(buffer, { maxSeconds = 90, ext = ".mp4", startSeconds = 0 } = {}) {
    const inFile = tmp(ext);
    const outFile = tmp(".mp4");
    fs.writeFileSync(inFile, buffer);

    try {
        try {
            await run([
                "-y",
                "-ss", String(startSeconds),
                "-i", inFile,
                "-t", String(maxSeconds),
                "-map", "0:v:0",
                "-map", "0:a?",
                "-c", "copy",
                "-avoid_negative_ts", "make_zero",
                "-movflags", "+faststart",
                outFile
            ]);
        } catch {
            await run([
                "-y",
                "-ss", String(startSeconds),
                "-i", inFile,
                "-t", String(maxSeconds),
                "-map", "0:v:0",
                "-map", "0:a?",
                "-c:v", "libx264",
                "-preset", "ultrafast",
                "-pix_fmt", "yuv420p",
                "-c:a", "aac",
                "-movflags", "+faststart",
                outFile
            ]);
        }

        return fs.readFileSync(outFile);
    } finally {
        try { fs.unlinkSync(inFile); } catch { /* empty */ }
        try { fs.unlinkSync(outFile); } catch { /* empty */ }
    }
}

async function splitVideoIntoSegments(buffer, { segmentSeconds = 90, totalDurationSeconds = 0, ext = ".mp4" } = {}) {
    const duration = Math.max(0, Math.ceil(Number(totalDurationSeconds) || 0));
    if (!duration || duration <= segmentSeconds) {
        return [{
            index: 1,
            startSeconds: 0,
            durationSeconds: duration || segmentSeconds,
            buffer
        }];
    }

    const segments = [];
    let startSeconds = 0;
    let index = 1;

    while (startSeconds < duration) {
        const remaining = duration - startSeconds;
        const currentDuration = Math.min(segmentSeconds, remaining);
        const clipBuffer = await clipVideoToSeconds(buffer, {
            maxSeconds: currentDuration,
            startSeconds,
            ext
        });

        segments.push({
            index,
            startSeconds,
            durationSeconds: currentDuration,
            buffer: clipBuffer
        });

        startSeconds += currentDuration;
        index += 1;
    }

    return segments;
}

module.exports = { anyToPng, anyToJpeg, anyToWebpSticker, getMediaDurationSeconds, clipVideoToSeconds, splitVideoIntoSegments };
